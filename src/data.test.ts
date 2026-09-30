import { describe, it, expect } from 'vitest';
import { SIG_COMPARE } from './data.ts';

/**
 * Falcon signatures are variable-length. 666 B is the PADDED size the spec
 * tables quote; raw compressed Falcon-512 signatures are a distribution, 647-664 B
 * observed over 20,000 signatures with @noble/post-quantum 0.7.1 (40 keys x 500),
 * never once reaching 666. Those extremes widened from 648-663 at 4,000 samples,
 * so the figure is an observation with a sample size, not a bound.
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
		// The sample size travels with the range, because a range without one reads
		// as a bound - which is how the earlier 652-657 came to be published.
		expect(falcon!.sigNote).toMatch(/20,000 signatures/);
		expect(falcon!.sigNote).toMatch(/647–664/);
	});

	it('no other scheme is qualified, and none renders a stray approximation mark', () => {
		for (const row of SIG_COMPARE) {
			if (row.scheme === 'Falcon-512') continue;
			expect(row.sigNote, `${row.scheme} signature size is exact`).toBeUndefined();
			expect(row.sig, `${row.scheme} must render a bare size`).not.toContain('≈');
		}
	});
});
