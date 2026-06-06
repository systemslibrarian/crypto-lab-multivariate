// uov.ts — a small, real Unbalanced Oil-and-Vinegar signature scheme over GF(256).
// Teaching parameters by default (v vinegar vars, o oil vars). Not for production.
//
// Central map F: o quadratic polynomials in n = v + o variables, with NO oil*oil
//   cross terms. That structure is the trapdoor: fixing the vinegar variables makes
//   each polynomial LINEAR in the oil variables, so signing is a linear solve.
// Public key P = F . S, where S is a secret invertible linear map that hides which
//   variables are "oil" and which are "vinegar". Without S the structure is hidden.

import { gadd, gmul, ginv } from './gf256.ts';

export interface UovParams {
	v: number; // vinegar variables
	o: number; // oil variables
}

// One quadratic polynomial stored as an upper-triangular n x n coefficient matrix
// over GF(256): value = sum_{i<=j} Q[i][j] * x_i * x_j. (No constant/linear terms
// here for clarity; the trapdoor argument is unchanged.)
export type Quad = number[][];

export interface UovKeys {
	params: UovParams;
	n: number;
	// secret
	F: Quad[]; // central map (o polynomials), oil-oil block is zero
	S: number[][]; // secret invertible linear transform (n x n)
	Sinv: number[][];
	// public
	P: Quad[]; // public map = F composed with S
}

function rngByte(): number {
	return Math.floor(Math.random() * 256);
}

// --- linear algebra over GF(256) ------------------------------------------
function matVec(M: number[][], x: number[]): number[] {
	const n = M.length;
	const out = new Array(n).fill(0);
	for (let i = 0; i < n; i++) {
		let acc = 0;
		for (let j = 0; j < n; j++) acc = gadd(acc, gmul(M[i][j], x[j]));
		out[i] = acc;
	}
	return out;
}

function randomInvertible(n: number): { M: number[][]; inv: number[][] } {
	// generate random matrices until one is invertible (fast for small n)
	for (let attempt = 0; attempt < 1000; attempt++) {
		const M: number[][] = Array.from({ length: n }, () =>
			Array.from({ length: n }, () => rngByte()),
		);
		const inv = invertMatrix(M);
		if (inv) return { M, inv };
	}
	throw new Error('could not generate invertible matrix');
}

function invertMatrix(M: number[][]): number[][] | null {
	const n = M.length;
	const a = M.map((r) => r.slice());
	const I: number[][] = Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
	);
	for (let col = 0; col < n; col++) {
		let pivot = -1;
		for (let r = col; r < n; r++)
			if (a[r][col] !== 0) {
				pivot = r;
				break;
			}
		if (pivot === -1) return null;
		[a[col], a[pivot]] = [a[pivot], a[col]];
		[I[col], I[pivot]] = [I[pivot], I[col]];
		const invPiv = ginv(a[col][col]);
		for (let j = 0; j < n; j++) {
			a[col][j] = gmul(a[col][j], invPiv);
			I[col][j] = gmul(I[col][j], invPiv);
		}
		for (let r = 0; r < n; r++) {
			if (r === col || a[r][col] === 0) continue;
			const factor = a[r][col];
			for (let j = 0; j < n; j++) {
				a[r][j] = gadd(a[r][j], gmul(factor, a[col][j]));
				I[r][j] = gadd(I[r][j], gmul(factor, I[col][j]));
			}
		}
	}
	return I;
}

// solve A x = b for x (A is m x m), returns null if singular
function solveLinear(A: number[][], b: number[]): number[] | null {
	const m = A.length;
	const aug = A.map((row, i) => [...row, b[i]]);
	for (let col = 0; col < m; col++) {
		let pivot = -1;
		for (let r = col; r < m; r++)
			if (aug[r][col] !== 0) {
				pivot = r;
				break;
			}
		if (pivot === -1) return null;
		[aug[col], aug[pivot]] = [aug[pivot], aug[col]];
		const invPiv = ginv(aug[col][col]);
		for (let j = 0; j <= m; j++) aug[col][j] = gmul(aug[col][j], invPiv);
		for (let r = 0; r < m; r++) {
			if (r === col || aug[r][col] === 0) continue;
			const f = aug[r][col];
			for (let j = 0; j <= m; j++) aug[r][j] = gadd(aug[r][j], gmul(f, aug[col][j]));
		}
	}
	return aug.map((row) => row[m]);
}

// --- quadratic evaluation -------------------------------------------------
export function evalQuad(Q: Quad, x: number[]): number {
	let acc = 0;
	const n = x.length;
	for (let i = 0; i < n; i++)
		for (let j = i; j < n; j++) {
			if (Q[i][j] === 0) continue;
			acc = gadd(acc, gmul(Q[i][j], gmul(x[i], x[j])));
		}
	return acc;
}

export function evalMap(map: Quad[], x: number[]): number[] {
	return map.map((Q) => evalQuad(Q, x));
}

// --- key generation -------------------------------------------------------
export function keygen(params: UovParams): UovKeys {
	const { v, o } = params;
	const n = v + o;

	// central map F: each of the o polynomials is quadratic in n vars with the
	// oil*oil block (indices >= v paired with indices >= v) forced to zero.
	const F: Quad[] = [];
	for (let k = 0; k < o; k++) {
		const Q: Quad = Array.from({ length: n }, () => new Array(n).fill(0));
		for (let i = 0; i < n; i++)
			for (let j = i; j < n; j++) {
				const bothOil = i >= v && j >= v;
				Q[i][j] = bothOil ? 0 : rngByte(); // <-- the trapdoor structure
			}
		F.push(Q);
	}

	const { M: S, inv: Sinv } = randomInvertible(n);

	// public key P = F ∘ S : substitute x = S·y into each F polynomial.
	// (S·y)_i = sum_a S[i][a] y_a. The composition of a quadratic with a linear
	// map is again quadratic; we compute its upper-triangular form directly.
	const P: Quad[] = F.map((Q) => composeQuadLinear(Q, S, n));

	return { params, n, F, S, Sinv, P };
}

// compute the quadratic form of Q(S·y) as an upper-triangular matrix in y
function composeQuadLinear(Q: Quad, S: number[][], n: number): Quad {
	const R: Quad = Array.from({ length: n }, () => new Array(n).fill(0));
	for (let i = 0; i < n; i++)
		for (let j = i; j < n; j++) {
			if (Q[i][j] === 0) continue;
			const c = Q[i][j];
			// term c * (S·y)_i * (S·y)_j = c * (Σ_a S[i][a]y_a)(Σ_b S[j][b]y_b)
			for (let a = 0; a < n; a++) {
				if (S[i][a] === 0) continue;
				for (let b = 0; b < n; b++) {
					if (S[j][b] === 0) continue;
					const coeff = gmul(c, gmul(S[i][a], S[j][b]));
					if (coeff === 0) continue;
					const lo = Math.min(a, b);
					const hi = Math.max(a, b);
					R[lo][hi] = gadd(R[lo][hi], coeff);
				}
			}
		}
	return R;
}

// --- signing ---------------------------------------------------------------
export interface SignTrace {
	target: number[]; // the message hash we must hit
	vinegar: number[]; // randomly chosen vinegar values
	oil: number[]; // solved oil values
	preimage: number[]; // (vinegar || oil) — a preimage of target under F
	signature: number[]; // S^{-1} · preimage — a preimage under P
	attempts: number; // vinegar guesses before a solvable system appeared
}

// Sign: find x with P(x) = target by inverting the central map.
// 1. guess vinegar vars -> each F poly becomes LINEAR in the oil vars
// 2. solve that o×o linear system for the oil vars
// 3. signature = S^{-1}·(vinegar||oil)
export function sign(keys: UovKeys, target: number[]): SignTrace {
	const { v, o } = keys.params;
	const n = keys.n;

	for (let attempt = 1; attempt <= 256; attempt++) {
		const vinegar = Array.from({ length: v }, () => rngByte());

		// Build the o×o linear system A·oil = rhs by expanding each central poly
		// with the vinegar values fixed. Coefficient of oil var (v+c) in poly k,
		// and the constant contributed purely by vinegar×vinegar terms.
		const A: number[][] = [];
		const rhs: number[] = [];
		for (let k = 0; k < o; k++) {
			const Q = keys.F[k];
			const rowCoeffs = new Array(o).fill(0);
			let constTerm = 0;
			for (let i = 0; i < n; i++)
				for (let j = i; j < n; j++) {
					const c = Q[i][j];
					if (c === 0) continue;
					const iOil = i >= v;
					const jOil = j >= v;
					if (!iOil && !jOil) {
						// vinegar*vinegar -> constant
						constTerm = gadd(constTerm, gmul(c, gmul(vinegar[i], vinegar[j])));
					} else if (iOil && !jOil) {
						// oil_i * vinegar_j -> linear in oil(i-v)
						rowCoeffs[i - v] = gadd(rowCoeffs[i - v], gmul(c, vinegar[j]));
					} else if (!iOil && jOil) {
						rowCoeffs[j - v] = gadd(rowCoeffs[j - v], gmul(c, vinegar[i]));
					}
					// oil*oil never happens in F (trapdoor)
				}
			A.push(rowCoeffs);
			rhs.push(gadd(target[k], constTerm)); // move constant to RHS (subtract == add in GF2^k)
		}

		const oil = solveLinear(A, rhs);
		if (!oil) continue; // unlucky vinegar made the system singular; retry

		const preimage = [...vinegar, ...oil];
		const signature = matVec(keys.Sinv, preimage);
		return { target, vinegar, oil, preimage, signature, attempts: attempt };
	}
	throw new Error('signing failed: no solvable vinegar guess found');
}

export function verify(keys: UovKeys, target: number[], signature: number[]): boolean {
	const got = evalMap(keys.P, signature);
	return got.length === target.length && got.every((g, i) => g === target[i]);
}

// hash a message string to an o-byte target (toy hash; FNV-style, good enough for a demo)
export function hashMessage(msg: string, o: number): number[] {
	const out = new Array(o).fill(0);
	let h = 0x811c9dc5;
	for (let i = 0; i < msg.length; i++) {
		h ^= msg.charCodeAt(i);
		h = (h * 0x01000193) >>> 0;
		out[i % o] = gadd(out[i % o], h & 0xff);
	}
	// extra diffusion pass so short messages still fill all o bytes
	for (let r = 0; r < o; r++) {
		h ^= (r + 1) * 0x9e3779b1;
		h = (h * 0x01000193) >>> 0;
		out[r] = gadd(out[r], h & 0xff);
	}
	return out;
}
