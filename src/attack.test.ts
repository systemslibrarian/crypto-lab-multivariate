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
