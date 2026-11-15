import { describe, it, expect } from 'vitest';
import uiSource from './ui.ts?raw';
import { SCHEMES, SIG_COMPARE } from './data.ts';

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

/**
 * Multivariate parameter sets are still being retuned, so a size without a
 * round attached is a figure with no shelf life.
 *
 *  - MAYO carried '~1.2 KB / ~321 B'. Those are the Round-1 numbers — the
 *    September 2023 submission's (66, 64, 8, 9, 16) set, 1168 B and 321 B.
 *    MAYO1 in the Round-2 specification (Table 2.1) is 1420 B / 454 B, which is
 *    what the sibling crypto-lab-mayo-seal runs, and Round 3 retunes it again
 *    to 1456 B / 464 B.
 *  - The ov-Ip row's 278,432 B and 128 B are Round-2 (112, 44) figures. UOV
 *    version 3.0 moves uov-Ip to (119, 45) and 321,300 B / 135 B.
 *
 * So the round label has to sit beside the numbers, in the data and in the
 * receipt card's prose, not only in a source comment.
 */
describe('parameter-set figures name their round', () => {
	it('MAYO shows the Round-2 MAYO1 sizes and says so', () => {
		const mayo = SCHEMES.find((s) => s.name === 'MAYO');
		expect(mayo).toBeDefined();
		expect(mayo!.pubKey).toBe('1,420 B');
		expect(mayo!.signature).toBe('454 B');
		expect(mayo!.note).toMatch(/Round-2 specification/);
		// The Round-1 figures must not come back.
		expect(mayo!.pubKey).not.toMatch(/1\.2 KB/);
		expect(mayo!.signature).not.toMatch(/321/);
	});

	it('the ov-Ip comparison row carries its round in the visible label', () => {
		const uov = SIG_COMPARE.find((r) => r.family === 'Multivariate' && /ov-Ip/.test(r.scheme));
		expect(uov).toBeDefined();
		expect(uov!.scheme).toContain('Round 2');
		expect(uov!.pubKeyBytes).toBe(278432);
		expect(uov!.sigBytes).toBe(128);
	});

	it('the UOV lineage card names the round its sizes come from', () => {
		const uov = SCHEMES.find((s) => s.name.startsWith('UOV'));
		expect(uov).toBeDefined();
		expect(uov!.note).toMatch(/Round-2 specification \(version 2\.0, February 2025\)/);
		expect(uov!.note).toMatch(/321,300 B/);
	});

	it('the receipt card states the round beside the ov-Ip numbers', () => {
		const note = uiSource.split('\n').find((line: string) => line.includes('278,432-byte'));
		expect(note, 'the receipt-card note still quotes the ov-Ip public key').toBeDefined();
		expect(note).toMatch(/Round-2 specification \(version 2\.0, February 2025\)/);
		expect(note).toContain('128-byte signatures');
	});
});
