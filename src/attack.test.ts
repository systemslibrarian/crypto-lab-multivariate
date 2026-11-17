import { describe, expect, it } from 'vitest';
import { keygen, hashMessage, verify, setRngByte, evalQuad } from './uov.ts';
import {
	kipnisShamirAttack,
	publicPartOf,
	kernel,
	polarForm,
	bilinear,
	gsqrt,
} from './attack.ts';
import { gmul } from './gf256.ts';

/** Deterministic byte stream so a failure is reproducible. */
function seeded(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return (s >>> 16) & 0xff;
	};
}

describe('GF(256) helpers the attack relies on', () => {
	it('gsqrt inverts squaring across the whole field', () => {
		for (let x = 0; x < 256; x++) expect(gsqrt(gmul(x, x))).toBe(x);
	});

	it('kernel returns vectors the matrix actually annihilates', () => {
		// Rank-1 matrix over GF(256): a 3-dimensional null space.
		const M = [
			[1, 2, 3],
			[2, 4, 6],
			[4, 8, 12],
		];
		const K = kernel(M);
		expect(K.length).toBe(2);
		for (const u of K)
			for (const row of M)
				expect(row.reduce((acc, c, j) => acc ^ gmul(c, u[j]), 0)).toBe(0);
	});

	it('polarForm has a zero diagonal and is symmetric', () => {
		const Q = [
			[5, 9, 3],
			[0, 7, 4],
			[0, 0, 2],
		];
		const B = polarForm(Q, 3);
		for (let i = 0; i < 3; i++) expect(B[i][i]).toBe(0);
		expect(B[0][1]).toBe(9);
		expect(B[1][0]).toBe(9);
		expect(B[0][2]).toBe(3);
		expect(B[2][1]).toBe(4);
	});
});

describe('Kipnis–Shamir key recovery (toy scale)', () => {
	/**
	 * The positive case: balanced Oil-and-Vinegar, exactly the shape Kipnis and
	 * Shamir broke in 1998. The attack must recover the oil subspace from the
	 * public key alone and produce a signature the lab's own verifier accepts.
	 */
	for (const m of [3, 4]) {
		it(`breaks balanced v = o = ${m} and forges an accepted signature`, () => {
			const restore = setRngByte(seeded(0xc0ffee + m));
			try {
				const keys = keygen({ v: m, o: m });
				const target = hashMessage('forge me', m);
				const res = kipnisShamirAttack(
					publicPartOf(keys),
					target,
					(sig) => verify(keys, target, sig),
					seeded(0xbeef + m),
				);

				expect(res.balanced).toBe(true);
				expect(res.recoveredDim).toBe(m);
				expect(res.succeeded).toBe(true);
				expect(res.verifierAccepted).toBe(true);
				expect(res.stages.every((s) => s.ok)).toBe(true);

				// The forgery is a genuine preimage under the PUBLIC map.
				expect(verify(keys, target, res.forgery!)).toBe(true);

				// The recovered subspace is a real oil subspace: every public
				// polynomial vanishes on it, and it is o-dimensional.
				expect(res.oilBasis).toHaveLength(m);
				for (const u of res.oilBasis)
					for (const Q of keys.P) expect(evalQuad(Q, u)).toBe(0);
				for (const B of keys.P.map((Q) => polarForm(Q, keys.n)))
					for (let a = 0; a < m; a++)
						for (let b = a + 1; b < m; b++)
							expect(bilinear(B, res.oilBasis[a], res.oilBasis[b])).toBe(0);
			} finally {
				setRngByte(restore);
			}
		});
	}

	/**
	 * The negative case, and the reason it matters: the same attack, unchanged,
	 * must FAIL against the unbalanced parameters the playground actually uses.
	 * If this ever starts passing, the lab's claim that v > o is what defeats
	 * Kipnis–Shamir has stopped being true of its own code.
	 */
	for (const [v, o] of [
		[5, 3],
		[6, 3],
		[6, 4],
		[8, 4],
	] as const) {
		it(`fails against unbalanced v = ${v}, o = ${o}`, () => {
			const restore = setRngByte(seeded(0x1234 + v * 31 + o));
			try {
				const keys = keygen({ v, o });
				const target = hashMessage('forge me', o);
				const res = kipnisShamirAttack(
					publicPartOf(keys),
					target,
					(sig) => verify(keys, target, sig),
					seeded(0x5678 + v * 31 + o),
				);
				expect(res.balanced).toBe(false);
				expect(res.succeeded).toBe(false);
				expect(res.verifierAccepted).toBe(false);
				expect(res.forgery).toBeNull();
				expect(res.stages.some((s) => !s.ok)).toBe(true);
			} finally {
				setRngByte(restore);
			}
		});
	}

	it('never reads the secret key: publicPartOf exposes only n, o and P', () => {
		const restore = setRngByte(seeded(99));
		try {
			const keys = keygen({ v: 3, o: 3 });
			const pub = publicPartOf(keys);
			expect(Object.keys(pub).sort()).toEqual(['P', 'n', 'o']);
			expect(pub.P).toBe(keys.P);
		} finally {
			setRngByte(restore);
		}
	});
});

/**
 * Characteristic 2: the polar form cannot see a square.
 *
 * B(x, y) = Q(x + y) + Q(x) + Q(y) kills every diagonal coefficient, so the
 * counterexample is as small as it gets: f(z) = z1^2 has a polar form that is
 * zero everywhere, and f(e1) = 1. An oil subspace is defined by BOTH halves --
 * the public polynomials vanish on it AND their polar forms vanish on its pairs
 * -- and this is why the second half cannot stand in for the first.
 *
 * The second test is the regression lock. Adding a square term to a public
 * polynomial leaves every polar form byte-identical, so the attack's stage-1 and
 * stage-2 inputs are literally the same matrices; the two keys are told apart by
 * the quadratic values and by nothing else. On the unperturbed key the attack
 * recovers the whole oil space; on the perturbed one it must recover nothing.
 *
 * Section 4.1c mutation, run 2026-11-17: delete the `evalQuad(Q, u) !== 0`
 * filter from stage 2 and reduce stage 3 to `ok: isotropic` -- that is, remove
 * the quadratic-value check and leave only the polar check. `recoveredDim` on
 * the perturbed key then goes 0 -> 3 and this test fails. Note which half is
 * load-bearing: removing ONLY the stage-3 `vanishes` term changes nothing, in
 * this suite or in principle, because stage 2 has already filtered every line
 * and isotropy carries vanishing across the span -- `vanishes && isotropic` and
 * `isotropic` cannot disagree there.
 */
describe('char 2: a polar form cannot see a square', () => {
	it('f(z) = z1^2 has an identically zero polar form, yet f(e1) = 1', () => {
		const n = 6;
		const f = Array.from({ length: n }, () => new Array(n).fill(0));
		f[0][0] = 1;
		const B = polarForm(f, n);
		for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) expect(B[i][j]).toBe(0);
		const e1 = new Array(n).fill(0);
		e1[0] = 1;
		expect(evalQuad(f, e1)).toBe(1);
	});

	it('two keys with identical polar forms are told apart only by the quadratic values', () => {
		const m = 3;
		const restore = setRngByte(seeded(0xc0ffee + m));
		try {
			const keys = keygen({ v: m, o: m });
			const target = hashMessage('forge me', m);
			const pub = publicPartOf(keys);

			// Add z1^2 to the first public polynomial. A diagonal coefficient is
			// invisible to polarForm, so stage 1 and stage 2 see the same inputs.
			const squared = pub.P.map((Q) => Q.map((row) => row.slice()));
			squared[0][0][0] ^= 1;
			for (let k = 0; k < squared.length; k++)
				expect(polarForm(squared[k], pub.n)).toEqual(polarForm(pub.P[k], pub.n));
			const e1 = new Array(pub.n).fill(0);
			e1[0] = 1;
			expect(evalQuad(squared[0], e1)).not.toBe(evalQuad(pub.P[0], e1));

			// Same seed on both runs, so the quadratic values are the only variable.
			const intact = kipnisShamirAttack(pub, target, (sig) => verify(keys, target, sig), seeded(0xbeef + m));
			expect(intact.recoveredDim).toBe(m);

			const perturbed = kipnisShamirAttack(
				{ n: pub.n, o: pub.o, P: squared },
				target,
				() => false,
				seeded(0xbeef + m),
			);
			expect(perturbed.recoveredDim).toBe(0);
			expect(perturbed.oilBasis).toHaveLength(0);
			expect(perturbed.succeeded).toBe(false);
			// And whatever it ever does report must really be an oil subspace.
			for (const u of perturbed.oilBasis)
				for (const Q of squared) expect(evalQuad(Q, u)).toBe(0);
		} finally {
			setRngByte(restore);
		}
	});
});
