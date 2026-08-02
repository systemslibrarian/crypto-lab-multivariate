// attack.ts — a real, computed Kipnis–Shamir key-recovery attack on Oil-and-Vinegar.
//
// The rest of this lab *tells* you multivariate trapdoors keep falling to
// structural attacks. This module makes the learner cause one. It takes the
// PUBLIC key only — no F, no S, nothing the signer keeps — recovers the hidden
// oil subspace from it, and uses the recovered subspace to forge a signature
// that the lab's own public verifier accepts.
//
// TOY SCALE. Kipnis–Shamir (Crypto '98) broke Patarin's original BALANCED
// Oil-and-Vinegar, where v = o. It is the reason the "unbalanced" v > o variant
// exists. This implementation runs it over GF(256) at v = o = 2..4, i.e. 4 to 8
// variables. A deployed UOV parameter set is (v, o) = (68, 44) over GF(256).
// Nothing here scales to that: the point is that the *structure* leaks, not
// that the numbers are large.
//
// How it works, and why each step is checked rather than assumed:
//
//   1. Every public polynomial P_k has a polar (bilinear) form
//        B_k(x, y) = P_k(x + y) + P_k(x) + P_k(y),
//      which in characteristic 2 is the symmetric matrix with a zeroed
//      diagonal. The hidden oil subspace O is totally isotropic for every B_k,
//      because the central map has no oil×oil terms.
//   2. In the signer's own coordinates a polar form is [[A, C], [Cᵀ, 0]] — that
//      trailing zero block IS the trapdoor. When v = o that shape makes
//        M = B_a⁻¹ B_b
//      block lower-triangular, so O is invariant under M. When v > o it does
//      not, which is the whole reason the unbalanced variant exists.
//   3. So O meets the eigenspaces of M. The attack walks every λ in GF(256),
//      takes ker(M + λI) (char 2: M − λI is the same matrix), and tests each
//      line in it against the one thing only oil vectors satisfy: EVERY public
//      polynomial vanishes there. For an o-dimensional eigenspace intersection
//      that test has exactly one solution, so the filter is sharp.
//   4. Lines that survive are accumulated until they span o dimensions, and the
//      candidate is then CHECKED with public data alone: P_k must vanish on
//      every basis vector and B_k on every pair.
//   5. With O in hand the attacker signs the way the legitimate signer does —
//        P_k(x₀ + Σ λⱼuⱼ) = P_k(x₀) + Σⱼ λⱼ·B_k(x₀, uⱼ)
//      is linear in λ — and the forged signature goes to the lab's ordinary
//      verify(). That verdict, not this file, decides whether the break worked.
//
// Step 2 is also the defence: unbalance the parameters and the eigenspaces stop
// containing the oil space, so the attack reports a measured failure instead of
// a key. Both outcomes come out of the same code path.

import { gadd, gmul, ginv } from './gf256.ts';
import { evalQuad, type Quad, type UovKeys } from './uov.ts';

type Mat = number[][];
type Vec = number[];

/**
 * Everything the attacker is allowed to touch. Taking this instead of UovKeys
 * is not decoration: it makes it impossible for the attack to read F, S or
 * S⁻¹ by accident, so "public key only" is enforced by the type, not promised
 * in a comment.
 */
export interface PublicKeyOnly {
	n: number;
	o: number;
	P: Quad[];
}

export function publicPartOf(keys: UovKeys): PublicKeyOnly {
	return { n: keys.n, o: keys.params.o, P: keys.P };
}

// --- GF(256) linear algebra ------------------------------------------------

/** √x in GF(256): squaring is an automorphism, so the inverse is x^128. */
export function gsqrt(x: number): number {
	let r = x;
	for (let i = 0; i < 7; i++) r = gmul(r, r);
	return r;
}

function zeros(rows: number, cols: number): Mat {
	return Array.from({ length: rows }, () => new Array(cols).fill(0));
}

function identity(n: number): Mat {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
	);
}

function matMul(A: Mat, B: Mat): Mat {
	const n = A.length;
	const m = B[0].length;
	const k = B.length;
	const out = zeros(n, m);
	for (let i = 0; i < n; i++)
		for (let t = 0; t < k; t++) {
			const a = A[i][t];
			if (a === 0) continue;
			for (let j = 0; j < m; j++) out[i][j] = gadd(out[i][j], gmul(a, B[t][j]));
		}
	return out;
}

function matInv(M: Mat): Mat | null {
	const n = M.length;
	const a = M.map((r) => r.slice());
	const I = identity(n);
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
		const inv = ginv(a[col][col]);
		for (let j = 0; j < n; j++) {
			a[col][j] = gmul(a[col][j], inv);
			I[col][j] = gmul(I[col][j], inv);
		}
		for (let r = 0; r < n; r++) {
			if (r === col || a[r][col] === 0) continue;
			const f = a[r][col];
			for (let j = 0; j < n; j++) {
				a[r][j] = gadd(a[r][j], gmul(f, a[col][j]));
				I[r][j] = gadd(I[r][j], gmul(f, I[col][j]));
			}
		}
	}
	return I;
}

function det(M: Mat): number {
	const n = M.length;
	const a = M.map((r) => r.slice());
	let d = 1;
	for (let col = 0; col < n; col++) {
		let pivot = -1;
		for (let r = col; r < n; r++)
			if (a[r][col] !== 0) {
				pivot = r;
				break;
			}
		if (pivot === -1) return 0;
		if (pivot !== col) [a[col], a[pivot]] = [a[pivot], a[col]]; // sign is +1 in char 2
		d = gmul(d, a[col][col]);
		const inv = ginv(a[col][col]);
		for (let r = col + 1; r < n; r++) {
			if (a[r][col] === 0) continue;
			const f = gmul(a[r][col], inv);
			for (let j = col; j < n; j++) a[r][j] = gadd(a[r][j], gmul(f, a[col][j]));
		}
	}
	return d;
}

/** Solve A·x = b, or null when A is singular. */
export function solve(A: Mat, b: Vec): Vec | null {
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
		const inv = ginv(aug[col][col]);
		for (let j = 0; j <= m; j++) aug[col][j] = gmul(aug[col][j], inv);
		for (let r = 0; r < m; r++) {
			if (r === col || aug[r][col] === 0) continue;
			const f = aug[r][col];
			for (let j = 0; j <= m; j++) aug[r][j] = gadd(aug[r][j], gmul(f, aug[col][j]));
		}
	}
	return aug.map((row) => row[m]);
}

/** Row-reduce a list of vectors to a basis of their span. */
function spanBasis(vectors: Vec[]): Vec[] {
	const rows = vectors.map((v) => v.slice());
	const width = rows.length > 0 ? rows[0].length : 0;
	const basis: Vec[] = [];
	let pivotRow = 0;
	for (let col = 0; col < width && pivotRow < rows.length; col++) {
		let pivot = -1;
		for (let r = pivotRow; r < rows.length; r++)
			if (rows[r][col] !== 0) {
				pivot = r;
				break;
			}
		if (pivot === -1) continue;
		[rows[pivotRow], rows[pivot]] = [rows[pivot], rows[pivotRow]];
		const inv = ginv(rows[pivotRow][col]);
		for (let j = 0; j < width; j++) rows[pivotRow][j] = gmul(rows[pivotRow][j], inv);
		for (let r = 0; r < rows.length; r++) {
			if (r === pivotRow || rows[r][col] === 0) continue;
			const f = rows[r][col];
			for (let j = 0; j < width; j++) rows[r][j] = gadd(rows[r][j], gmul(f, rows[pivotRow][j]));
		}
		basis.push(rows[pivotRow].slice());
		pivotRow++;
	}
	return basis;
}

// --- quadratic forms -------------------------------------------------------

/**
 * The polar form of an upper-triangular quadratic Q, as a matrix:
 *   B(x, y) = Q(x + y) + Q(x) + Q(y).
 * In characteristic 2 the squares cancel, leaving the symmetric off-diagonal
 * coefficients with a zero diagonal.
 */
export function polarForm(Q: Quad, n: number): Mat {
	const B = zeros(n, n);
	for (let i = 0; i < n; i++)
		for (let j = i + 1; j < n; j++) {
			B[i][j] = Q[i][j];
			B[j][i] = Q[i][j];
		}
	return B;
}

/** xᵀ·B·y. */
export function bilinear(B: Mat, x: Vec, y: Vec): number {
	let acc = 0;
	for (let i = 0; i < B.length; i++) {
		if (x[i] === 0) continue;
		for (let j = 0; j < B.length; j++) {
			if (B[i][j] === 0 || y[j] === 0) continue;
			acc = gadd(acc, gmul(x[i], gmul(B[i][j], y[j])));
		}
	}
	return acc;
}

// --- kernels and eigenspaces ----------------------------------------------

/** Basis of the null space of M. */
export function kernel(M: Mat): Vec[] {
	const rows = M.length;
	const cols = M[0].length;
	const a = M.map((r) => r.slice());
	const pivotOfCol: number[] = new Array(cols).fill(-1);
	let r = 0;
	for (let col = 0; col < cols && r < rows; col++) {
		let pivot = -1;
		for (let i = r; i < rows; i++)
			if (a[i][col] !== 0) {
				pivot = i;
				break;
			}
		if (pivot === -1) continue;
		[a[r], a[pivot]] = [a[pivot], a[r]];
		const inv = ginv(a[r][col]);
		for (let j = 0; j < cols; j++) a[r][j] = gmul(a[r][j], inv);
		for (let i = 0; i < rows; i++) {
			if (i === r || a[i][col] === 0) continue;
			const f = a[i][col];
			for (let j = 0; j < cols; j++) a[i][j] = gadd(a[i][j], gmul(f, a[r][j]));
		}
		pivotOfCol[col] = r;
		r++;
	}
	const basis: Vec[] = [];
	for (let free = 0; free < cols; free++) {
		if (pivotOfCol[free] !== -1) continue;
		const vec = new Array(cols).fill(0);
		vec[free] = 1;
		for (let col = 0; col < cols; col++) {
			const pr = pivotOfCol[col];
			if (pr === -1) continue;
			vec[col] = a[pr][free];
		}
		basis.push(vec);
	}
	return basis;
}

/**
 * Every projective direction in the span of `basis` — one representative per
 * 1-dimensional subspace, so a search over them is a search over lines rather
 * than vectors.
 */
function projectiveDirections(basis: Vec[]): Vec[] {
	const d = basis.length;
	const n = basis[0].length;
	const out: Vec[] = [];
	const coeffs = new Array(d).fill(0);
	const emit = (): void => {
		const vec = new Array(n).fill(0);
		for (let j = 0; j < d; j++) {
			const c = coeffs[j];
			if (c === 0) continue;
			for (let i = 0; i < n; i++) vec[i] = gadd(vec[i], gmul(c, basis[j][i]));
		}
		out.push(vec);
	};
	// Normalised representatives: leading nonzero coefficient fixed to 1.
	const walk = (lead: number): void => {
		coeffs.fill(0);
		coeffs[lead] = 1;
		const free = d - lead - 1;
		const total = Math.pow(256, free);
		for (let idx = 0; idx < total; idx++) {
			let rest = idx;
			for (let j = lead + 1; j < d; j++) {
				coeffs[j] = rest % 256;
				rest = Math.floor(rest / 256);
			}
			emit();
		}
	};
	for (let lead = 0; lead < d; lead++) walk(lead);
	return out;
}

// --- the attack ------------------------------------------------------------

export interface AttackStage {
	name: string;
	detail: string;
	ok: boolean;
}

export interface AttackResult {
	/** Parameters the attack actually ran against. */
	v: number;
	o: number;
	n: number;
	balanced: boolean;
	stages: AttackStage[];
	/** Recovered oil-subspace basis, when recovery succeeded. */
	oilBasis: Vec[];
	/** Dimensions recovered vs. the o it needed. */
	recoveredDim: number;
	/** Invertible polar-form pairs consumed. */
	pairsUsed: number;
	/** Eigenvalues of M found in GF(256), summed over all pairs. */
	eigenvaluesFound: number;
	/** Lines tested for "every public polynomial vanishes here". */
	linesTested: number;
	/** The forged signature and the public verifier's own verdict on it. */
	forgery: Vec | null;
	verifierAccepted: boolean;
	succeeded: boolean;
	/** Wall-clock milliseconds for the whole run. */
	elapsedMs: number;
}

function defaultRng(): number {
	const b = new Uint8Array(1);
	crypto.getRandomValues(b);
	return b[0];
}

const now = (): number =>
	typeof performance !== 'undefined' ? performance.now() : Date.now();

/**
 * Recover the oil subspace of `pub` from the public key alone, then forge a
 * signature on `target` and hand it to `verifyFn` — which is the lab's ordinary
 * public verifier, so the accept/reject verdict is not the attack marking its
 * own homework.
 *
 * Every number in the returned result is measured during this run. Nothing
 * about the outcome is decided in advance: the same code path produces the
 * success against balanced parameters and the failure against unbalanced ones.
 */
export function kipnisShamirAttack(
	pub: PublicKeyOnly,
	target: Vec,
	verifyFn: (signature: Vec) => boolean,
	rng: () => number = defaultRng,
	maxPairs = 24,
): AttackResult {
	const started = now();
	const { n, o, P } = pub;
	const v = n - o;
	const stages: AttackStage[] = [];
	const result: AttackResult = {
		v,
		o,
		n,
		balanced: v === o,
		stages,
		oilBasis: [],
		recoveredDim: 0,
		pairsUsed: 0,
		eigenvaluesFound: 0,
		linesTested: 0,
		forgery: null,
		verifierAccepted: false,
		succeeded: false,
		elapsedMs: 0,
	};
	const finish = (): AttackResult => {
		result.elapsedMs = now() - started;
		return result;
	};

	// Stage 1 — polar forms of the public polynomials.
	const polars = P.map((Q) => polarForm(Q, n));
	stages.push({
		name: 'Polar forms',
		detail: `Built ${polars.length} bilinear form${polars.length === 1 ? '' : 's'} B_k from the ${n}-variable public map. Public data only — F, S and S⁻¹ are not even in scope here.`,
		ok: true,
	});

	// A random public combination Σ c_k P_k; its polar form is Σ c_k B_k, and it
	// still has the oil block zeroed, so it is as good an attack input as any
	// single polynomial.
	const randomCombo = (): Mat => {
		const out = zeros(n, n);
		for (let k = 0; k < polars.length; k++) {
			const c = rng() & 0xff;
			if (c === 0) continue;
			for (let i = 0; i < n; i++)
				for (let j = 0; j < n; j++) out[i][j] = gadd(out[i][j], gmul(c, polars[k][i][j]));
		}
		return out;
	};

	// Stage 2 — eigenspaces of M = B_a⁻¹B_b, filtered by "the whole public map
	// vanishes on this line". An alternating form has even rank, so when n is
	// odd every B_k is singular and the attack cannot even start — which is
	// itself a measured fact worth reporting.
	let basis: Vec[] = [];
	let pairs = 0;
	let invertibleSeen = false;
	for (let attempt = 0; attempt < maxPairs && basis.length < o; attempt++) {
		const Ba = randomCombo();
		const BaInv = matInv(Ba);
		if (!BaInv) continue;
		invertibleSeen = true;
		const Bb = randomCombo();
		pairs++;
		const M = matMul(BaInv, Bb);

		for (let lambda = 0; lambda < 256 && basis.length < o; lambda++) {
			// char 2: M − λI and M + λI are the same matrix.
			const shifted = M.map((row, i) => row.map((x, j) => (i === j ? gadd(x, lambda) : x)));
			if (det(shifted) !== 0) continue;
			const eig = kernel(shifted);
			if (eig.length === 0 || eig.length > 3) continue;
			result.eigenvaluesFound++;
			for (const u of projectiveDirections(eig)) {
				result.linesTested++;
				let vanishes = true;
				for (const Q of P)
					if (evalQuad(Q, u) !== 0) {
						vanishes = false;
						break;
					}
				if (!vanishes) continue;
				const grown = spanBasis([...basis, u]);
				if (grown.length > basis.length && grown.length <= o) basis = grown;
				if (basis.length >= o) break;
			}
		}
	}
	result.pairsUsed = pairs;
	result.recoveredDim = basis.length;

	if (!invertibleSeen) {
		stages.push({
			name: 'Invariant subspace',
			detail: `No invertible polar form exists: an alternating form has even rank, and n = ${n} is odd, so every B_k is singular. The attack cannot even form B_a⁻¹B_b here.`,
			ok: false,
		});
		return finish();
	}
	if (basis.length !== o) {
		stages.push({
			name: 'Invariant subspace',
			detail: `From ${pairs} invertible pair${pairs === 1 ? '' : 's'} the attack found ${result.eigenvaluesFound} eigenvalue${result.eigenvaluesFound === 1 ? '' : 's'} in GF(256) and tested ${result.linesTested} line${result.linesTested === 1 ? '' : 's'}, recovering ${basis.length} of the ${o} dimensions needed. With v > o the oil space is no longer invariant under B_a⁻¹B_b, so the eigenspaces stop containing it.`,
			ok: false,
		});
		return finish();
	}
	stages.push({
		name: 'Invariant subspace',
		detail: `${pairs} invertible pair${pairs === 1 ? '' : 's'}, ${result.eigenvaluesFound} eigenvalue${result.eigenvaluesFound === 1 ? '' : 's'} in GF(256), ${result.linesTested} line${result.linesTested === 1 ? '' : 's'} tested → a candidate oil subspace of dimension ${basis.length}.`,
		ok: true,
	});

	// Stage 3 — check the candidate against the public key alone.
	let vanishes = true;
	for (const u of basis) for (const Q of P) if (evalQuad(Q, u) !== 0) vanishes = false;
	let isotropic = true;
	const pairCount = (basis.length * (basis.length - 1)) / 2;
	for (let a = 0; a < basis.length; a++)
		for (let b = a + 1; b < basis.length; b++)
			for (const B of polars) if (bilinear(B, basis[a], basis[b]) !== 0) isotropic = false;
	stages.push({
		name: 'Verify the subspace',
		detail: `Every public polynomial ${vanishes ? 'vanishes' : 'does NOT vanish'} on all ${basis.length} basis vector${basis.length === 1 ? '' : 's'}, and every polar form ${isotropic ? 'vanishes' : 'does NOT vanish'} on all ${pairCount} basis pair${pairCount === 1 ? '' : 's'} — the defining property of an oil subspace, checked with public data.`,
		ok: vanishes && isotropic,
	});
	if (!vanishes || !isotropic) return finish();
	result.oilBasis = basis;

	// Stage 4 — forge, using the recovered subspace exactly as a signer would.
	// P_k(x₀ + Σ λⱼuⱼ) = P_k(x₀) + Σⱼ λⱼ·B_k(x₀, uⱼ), because P_k and every B_k
	// vanish on the oil space — so the forgery is one o×o linear solve.
	for (let attempt = 0; attempt < 64; attempt++) {
		const x0 = Array.from({ length: n }, () => rng() & 0xff);
		const A: Mat = [];
		const rhs: Vec = [];
		for (let k = 0; k < o; k++) {
			A.push(basis.map((u) => bilinear(polars[k], x0, u)));
			rhs.push(gadd(target[k], evalQuad(P[k], x0)));
		}
		const lambda = solve(A, rhs);
		if (!lambda) continue;
		const x = x0.slice();
		for (let j = 0; j < basis.length; j++)
			for (let i = 0; i < n; i++) x[i] = gadd(x[i], gmul(lambda[j], basis[j][i]));
		result.forgery = x;
		result.verifierAccepted = verifyFn(x);
		stages.push({
			name: 'Forge a signature',
			detail: result.verifierAccepted
				? `With the oil subspace known, P(x₀ + Σ λⱼuⱼ) is linear in λ, so one ${o}×${o} solve produced a signature — and the lab's own verifier ACCEPTED it. No private key was ever used.`
				: 'Solved for λ, but the public verifier REJECTED the result.',
			ok: result.verifierAccepted,
		});
		result.succeeded = result.verifierAccepted;
		return finish();
	}
	stages.push({
		name: 'Forge a signature',
		detail: 'Every x₀ tried gave a singular system; no forgery was produced.',
		ok: false,
	});
	return finish();
}
