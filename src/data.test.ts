import { describe, it, expect } from 'vitest';
import uiSource from './ui.ts?raw';
import readme from '../README.md?raw';
import { CITATIONS, SCHEMES, SIG_COMPARE } from './data.ts';

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

/**
 * Standards reviewed 15 November 2026.
 *
 * NIST IR 8610 (May 2026) closed the second round of the Additional Digital
 * Signature Schemes process on 14 May 2026 and selected nine candidates for the
 * third round: FAEST, HAWK, MAYO, MQOM, QR-UOV, SDitH, SNOVA, SQIsign and UOV.
 * So "on-ramp candidate" and "currently under review" are no longer the whole
 * status for UOV or MAYO — the round they reached is part of it, and a status
 * line without it goes stale the moment a reader asks which round.
 *
 * The round label on the SIZES is a separate claim and is asserted above: this
 * page keeps the Round-2 figures, so the Round-2 labels stay.
 */
describe('status lines name the round the scheme reached', () => {
	it('the UOV lineage card states the Round 3 advancement with its date and source', () => {
		const uov = SCHEMES.find((s) => s.name.startsWith('UOV'));
		expect(uov).toBeDefined();
		expect(uov!.note).toMatch(/Round 3/);
		expect(uov!.note).toMatch(/14 May 2026/);
		expect(uov!.note).toMatch(/NIST IR 8610/);
	});

	it('the MAYO lineage card states the Round 3 advancement with its date and source', () => {
		const mayo = SCHEMES.find((s) => s.name === 'MAYO');
		expect(mayo).toBeDefined();
		expect(mayo!.note).toMatch(/Round 3/);
		expect(mayo!.note).toMatch(/14 May 2026/);
		expect(mayo!.note).toMatch(/NIST IR 8610/);
	});

	it('the MAYO citation does not leave "under review" as the whole status', () => {
		const mayo = CITATIONS.find((c) => c.label === 'MAYO 2021');
		expect(mayo).toBeDefined();
		expect(mayo!.note).toMatch(/Round 3/);
		expect(mayo!.note).toMatch(/14 May 2026/);
		expect(mayo!.note).toMatch(/NIST IR 8610/);
	});
});

/**
 * Standards reviewed 15 November 2026.
 *
 * The HAWK related-demo line used to read "HAWK lattice signatures with
 * Gaussian sampling" with no status, which walks a reader into a lab that opens
 * by saying the scheme is withdrawn and insecure.
 *
 * The two sources carry different facts and must not be blended: NIST's round-3
 * additional-signatures page states the withdrawal but carries NO date, while
 * the HAWK team's own site carries the date (29 July 2026) and the banner
 * "Hawk is insecure and should not be used." The attack's technical detail
 * stays in crypto-lab-hawk, which has read the paper; this line does not.
 */
describe('the HAWK related-demo link is historical, not an active-candidate blurb', () => {
	const line = readme.split('\n').find((l: string) => l.startsWith('- [crypto-lab-hawk]'));

	it('still links the HAWK lab', () => {
		expect(line).toBeDefined();
		expect(line).toContain('https://systemslibrarian.github.io/crypto-lab-hawk/');
	});

	it('states the withdrawal and cites NIST for it', () => {
		expect(line).toMatch(/withdrawn/);
		expect(line).toContain('https://csrc.nist.gov/projects/pqc-dig-sig/round-3-additional-signatures');
	});

	it('takes the date and the "insecure" statement from the HAWK team, not from NIST', () => {
		expect(line).toContain('https://hawk-sign.info/');
		expect(line).toMatch(/29 July 2026/);
		expect(line).toMatch(/is insecure and should not be used/);
		expect(line).not.toMatch(/round-3-additional-signatures\)[^[]*29 July 2026/);
	});

	it('does not import the attack internals this lab has not read', () => {
		expect(line).not.toMatch(/SVP|cocycle|Galois|gates/);
	});
});

/**
 * The dated note records what was re-read, and that the Round-2 size labels
 * stayed put because the sizes are Round-2 values.
 */
it('the dated standards note records the round 3 selection and keeps the round-2 labels', () => {
	expect(readme).toMatch(/\*\*Standards reviewed 15 November 2026:\*\*/);
	expect(readme).toMatch(/NIST IR 8610/);
	expect(readme).toMatch(/keep their Round-2 labels/);
});
