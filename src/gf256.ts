// gf256.ts — arithmetic in GF(2^8) with the AES reduction polynomial (0x11B).
// Small, dependency-free, used by the Oil-and-Vinegar scheme.

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(function initTables() {
	let x = 1;
	for (let i = 0; i < 255; i++) {
		EXP[i] = x;
		LOG[x] = i;
		// multiply x by the generator 0x03 = (x * 2) XOR x, with AES reduction on the *2 step
		const x2 = ((x << 1) & 0xff) ^ (x & 0x80 ? 0x1b : 0); // x * 2 in GF(256)
		x = (x2 ^ x) & 0xff; // x * 3
	}
	for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

export function gadd(a: number, b: number): number {
	return (a ^ b) & 0xff;
}

export function gmul(a: number, b: number): number {
	if (a === 0 || b === 0) return 0;
	return EXP[LOG[a] + LOG[b]];
}

export function ginv(a: number): number {
	if (a === 0) throw new Error('GF(256): inverse of 0 is undefined');
	return EXP[255 - LOG[a]];
}

export function gdiv(a: number, b: number): number {
	return gmul(a, ginv(b));
}
