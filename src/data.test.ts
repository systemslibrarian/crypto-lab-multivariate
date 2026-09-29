import { describe, it, expect } from 'vitest';
import { SIG_COMPARE } from './data.ts';

/**
 * Falcon signatures are variable-length. 666 B is the PADDED size the spec
 * tables quote; raw compressed Falcon-512 signatures measure about 652-657 B.
 * The figure is legitimate, but this table prints it beside ML-DSA-65's 3.3 KB
 * and SLH-DSA-128f's 17 KB, which are exact and fixed, so an unqualified 666
 * reads as one more exact number.
 *
 * Both halves matter. Falcon must carry the qualifier, and nothing else may:
 * a marker that spread to the exact rows would stop distinguishing them.
 */
describe('signature size qualifiers', () => {
	const falcon = SIG_COMPARE.find((r) => r.scheme === 'Falcon-512');

	it('Falcon-512 is present and its size is marked approximate', () => {
		expect(falcon).toBeDefined();
		expect(falcon!.sigBytes).toBe(666);
		expect(falcon!.sig).toContain('≈');
		expect(falcon!.sigNote).toMatch(/padded/i);
		expect(falcon!.sigNote).toMatch(/variable/i);
	});

	it('no other scheme is qualified, and none renders a stray approximation mark', () => {
		for (const row of SIG_COMPARE) {
			if (row.scheme === 'Falcon-512') continue;
			expect(row.sigNote, `${row.scheme} signature size is exact`).toBeUndefined();
			expect(row.sig, `${row.scheme} must render a bare size`).not.toContain('≈');
		}
	});
});
