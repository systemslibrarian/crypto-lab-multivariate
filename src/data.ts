// data.ts — facts and narrative content for the multivariate cryptography lab.

export interface MvScheme {
	name: string;
	status: 'broken' | 'research' | 'historical';
	year: string;
	pubKey: string;
	signature: string;
	note: string;
}

export const SCHEMES: MvScheme[] = [
	{
		name: 'Rainbow (Ia)',
		status: 'broken',
		year: '2005 / broken 2022',
		pubKey: '~158 KB',
		signature: '66 B',
		note: 'A layered (multi-layer) Oil-and-Vinegar scheme and NIST Round 3 finalist. Broken by Ward Beullens in 2022 — key recovery for the Level-I parameters ran in about a weekend on a laptop.',
	},
	{
		name: 'UOV (Unbalanced Oil & Vinegar)',
		status: 'research',
		year: '1999',
		pubKey: '~278 KB',
		signature: '128 B',
		note: 'The original single-layer scheme that Rainbow generalised. Without Rainbow\u2019s extra layer structure, UOV avoids the specific weakness Beullens exploited and remains a NIST on-ramp candidate.',
	},
	{
		name: 'MAYO',
		status: 'research',
		year: '2021',
		pubKey: '~1.2 KB',
		signature: '~321 B',
		note: 'A modern "whipped" Oil-and-Vinegar variant with much smaller keys, submitted to the NIST additional-signatures on-ramp.',
	},
	{
		name: 'Oil & Vinegar (balanced)',
		status: 'broken',
		year: '1997 / broken 1998',
		pubKey: '\u2014',
		signature: '\u2014',
		note: 'The original Patarin proposal with v = o. Kipnis and Shamir broke it within a year, which is exactly why the "unbalanced" v > o variant was introduced.',
	},
];

export interface AttackStep {
	title: string;
	body: string;
}

export const BEULLENS_STORY: AttackStep[] = [
	{
		title: 'The trapdoor is structure',
		body: 'Every Oil-and-Vinegar scheme hides a secret subspace — the "oil" variables — inside a public quadratic map. The signer can use that subspace to invert the map; an attacker who finds it can forge signatures.',
	},
	{
		title: 'Rainbow added a second layer',
		body: 'Rainbow stacked two Oil-and-Vinegar layers to shrink signatures. That extra structure created additional algebraic relationships between the public polynomials.',
	},
	{
		title: 'Beullens found the oil subspace faster',
		body: 'In 2022, Ward Beullens introduced new "rectangular MinRank" and intersection attacks that recovered the hidden oil subspace from the public key far faster than expected — exploiting precisely the layered structure Rainbow relied on.',
	},
	{
		title: 'Key recovery on a laptop',
		body: 'For the NIST Level-I parameter set, the attack recovered the private key in roughly a weekend of computation on a standard laptop, well under the claimed security level. NIST did not standardise Rainbow.',
	},
	{
		title: 'Why lattices won',
		body: 'Multivariate trapdoors have repeatedly fallen to structural attacks like this one. Lattice schemes (ML-KEM, ML-DSA) rest on better-understood, less structured hardness assumptions — a key reason they became the primary NIST standards.',
	},
];

// comparison of signature families (ties back to crypto-lab-pq-families)
export interface SigCompare {
	family: string;
	scheme: string;
	pubKey: string;
	pubKeyBytes: number;
	sig: string;
	sigBytes: number;
	feel: string;
	status: 'standardized' | 'research' | 'broken';
}

// "feel" gives a non-expert reader a visceral sense of scale: small text
// strings (the size of one tweet) up to images (a high-res JPG).
export const SIG_COMPARE: SigCompare[] = [
	{
		family: 'Lattice',
		scheme: 'ML-DSA-65 (Dilithium)',
		pubKey: '1.9 KB',
		pubKeyBytes: 1952,
		sig: '3.3 KB',
		sigBytes: 3309,
		feel: 'sig ≈ a paragraph of email',
		status: 'standardized',
	},
	{
		family: 'Lattice',
		scheme: 'Falcon-512',
		pubKey: '897 B',
		pubKeyBytes: 897,
		sig: '666 B',
		sigBytes: 666,
		feel: 'sig ≈ a tweet',
		status: 'standardized',
	},
	{
		family: 'Hash',
		scheme: 'SLH-DSA-128f (SPHINCS+)',
		pubKey: '32 B',
		pubKeyBytes: 32,
		sig: '17 KB',
		sigBytes: 17088,
		feel: 'sig ≈ a small icon',
		status: 'standardized',
	},
	{
		family: 'Multivariate',
		scheme: 'Rainbow (Ia)',
		pubKey: '158 KB',
		pubKeyBytes: 161600,
		sig: '66 B',
		sigBytes: 66,
		feel: 'pubkey ≈ a phone photo · sig fits in 2 tweets',
		status: 'broken',
	},
	{
		family: 'Multivariate',
		scheme: 'UOV',
		pubKey: '278 KB',
		pubKeyBytes: 284600,
		sig: '128 B',
		sigBytes: 128,
		feel: 'pubkey ≈ 2 phone photos · sig fits in 1 tweet',
		status: 'research',
	},
];
