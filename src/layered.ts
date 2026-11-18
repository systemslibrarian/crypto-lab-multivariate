// layered.ts — a toy layered ("Rainbow-type") Oil-and-Vinegar map over GF(256),
// published two ways: with secret hiding maps, and with them left out.
//
// This file is a MODEL. It backs the exhibit about Origami, a first-round NGCC
// signature candidate whose specification composes its layered central map only
// with a public coordinate permutation and omits the secret input and output
// maps (Louiso, Guo, Li, Pébereau, Tao and Ding, "A Universal Forgery Attack on
// the Origami Signature Scheme from the Public Key Alone", Sections 2 and 4,
// Algorithm 1). Nothing here is Origami: not its field (F16), not its zones, not
// its hidden local algebras, not its key compression, and none of its code. It
// is the same structural situation at toy size, built on this lab's GF(256).
//
// A layered central map F has a vinegar block and then one oil block per layer.
// The equations of layer j may use the vinegar and every earlier oil block
// freely, but contain no product of two of layer j's own oil variables and no
// later variable at all. So once everything earlier is fixed, layer j is LINEAR
// in its oil block, and the layers can be solved in order. That is the trapdoor.
//
// Hidden:   P = Tout . F . Tin   with Tin, Tout secret invertible linear maps.
// Exposed:  P = F . Pi^-1        with Pi a coordinate permutation that anyone can
//                                 recompute from a public seed.

import { gadd, gmul } from './gf256.ts';
import {
	composeQuadLinear,
	evalMap,
	matVec,
	randomByte,
	randomInvertible,
	solveLinear,
	type Quad,
} from './uov.ts';

export interface LayeredParams {
	v: number; // vinegar variables
	layers: number[]; // oil variables in each layer, in solving order
}

export interface LayerBounds {
	layer: number; // 0-based
	known: number; // variables fixed before this layer is solved
	oil: number; // this layer's oil variables = its equations
	firstEquation: number;
}

export function dimensions(params: LayeredParams): { n: number; m: number } {
	const m = params.layers.reduce((a, b) => a + b, 0);
	return { n: params.v + m, m };
}

export function layerBounds(params: LayeredParams): LayerBounds[] {
	const out: LayerBounds[] = [];
	let known = params.v;
	let firstEquation = 0;
	params.layers.forEach((oil, layer) => {
		out.push({ layer, known, oil, firstEquation });
		known += oil;
		firstEquation += oil;
	});
	return out;
}

function emptyQuad(n: number): Quad {
	return Array.from({ length: n }, () => new Array(n).fill(0));
}

/** A random central map with the layered support and nothing else. */
export function centralMap(params: LayeredParams): Quad[] {
	const { n } = dimensions(params);
	const map: Quad[] = [];
	for (const { known, oil } of layerBounds(params)) {
		const end = known + oil;
		for (let e = 0; e < oil; e++) {
			const Q = emptyQuad(n);
			for (let i = 0; i < end; i++)
				for (let j = i; j < end; j++) {
					// i <= j, so i >= known means both are in this layer's oil block.
					Q[i][j] = i >= known ? 0 : randomByte();
				}
			map.push(Q);
		}
	}
	return map;
}

// --- solving the layers in order --------------------------------------------

export interface LayeredSolve {
	preimage: number[] | null;
	passes: number; // vinegar draws used, counting the successful one
	singularAt: number[]; // layer index of each failed pass
}

/**
 * Find y with map(y) = target by solving the layers in order, treating each
 * layer's equations as linear in that layer's oil block.
 *
 * The signer calls this on the secret central map. The forger calls THIS SAME
 * FUNCTION on a map read off the public key. Terms that would make a layer
 * non-linear are not looked at, so on a map that is not really layered it
 * returns a vector that simply does not satisfy the equations.
 */
export function solveLayers(map: Quad[], params: LayeredParams, target: number[], maxPasses = 64): LayeredSolve {
	const { n } = dimensions(params);
	const bounds = layerBounds(params);
	const singularAt: number[] = [];
	for (let pass = 1; pass <= maxPasses; pass++) {
		const y: number[] = new Array(n).fill(0);
		for (let i = 0; i < params.v; i++) y[i] = randomByte();
		let failedLayer = -1;
		for (const { layer, known, oil, firstEquation } of bounds) {
			const A: number[][] = [];
			const rhs: number[] = [];
			for (let e = 0; e < oil; e++) {
				const Q = map[firstEquation + e];
				const row = new Array(oil).fill(0);
				let constant = 0;
				for (let i = 0; i < known; i++) {
					if (y[i] === 0) continue;
					for (let j = i; j < known; j++)
						if (Q[i][j] !== 0) constant = gadd(constant, gmul(Q[i][j], gmul(y[i], y[j])));
					for (let j = known; j < known + oil; j++)
						if (Q[i][j] !== 0) row[j - known] = gadd(row[j - known], gmul(Q[i][j], y[i]));
				}
				A.push(row);
				rhs.push(gadd(target[firstEquation + e], constant));
			}
			const solved = solveLinear(A, rhs);
			if (!solved) {
				failedLayer = layer;
				break;
			}
			for (let c = 0; c < oil; c++) y[known + c] = solved[c];
		}
		if (failedLayer === -1) return { preimage: y, passes: pass, singularAt };
		// No later layer can repair an earlier one: start again with new vinegar.
		singularAt.push(failedLayer);
	}
	return { preimage: null, passes: maxPasses, singularAt };
}

// --- the public coordinate permutation --------------------------------------

/** Fisher-Yates driven by a seed. Anyone holding the seed gets the same order. */
export function publicPermutation(seed: number, n: number): number[] {
	let state = (seed >>> 0) || 0x9e3779b9;
	const next = (): number => {
		state ^= state << 13;
		state >>>= 0;
		state ^= state >>> 17;
		state ^= state << 5;
		state >>>= 0;
		return state;
	};
	const perm = Array.from({ length: n }, (_, i) => i);
	for (let i = n - 1; i > 0; i--) {
		const j = next() % (i + 1);
		[perm[i], perm[j]] = [perm[j], perm[i]];
	}
	return perm;
}

/** Relabel a map's variables: result(s) = map(y) where s[perm[i]] = y[i]. */
function relabel(map: Quad[], perm: number[]): Quad[] {
	const n = perm.length;
	return map.map((Q) => {
		const R = emptyQuad(n);
		for (let i = 0; i < n; i++)
			for (let j = i; j < n; j++) {
				if (Q[i][j] === 0) continue;
				const a = Math.min(perm[i], perm[j]);
				const b = Math.max(perm[i], perm[j]);
				R[a][b] = Q[i][j];
			}
		return R;
	});
}

/** The inverse relabelling: read a map back in the order `perm` came from. */
function unrelabel(map: Quad[], perm: number[]): Quad[] {
	const inverse = new Array(perm.length).fill(0);
	perm.forEach((p, i) => (inverse[p] = i));
	return relabel(map, inverse);
}

// --- keys ---------------------------------------------------------------------

export type Publication = 'exposed' | 'hidden';

/** Everything a verifier, or an attacker, is given. */
export interface LayeredPublicKey {
	params: LayeredParams;
	publication: Publication;
	/** Seed of the public coordinate permutation. Null when the maps are hidden. */
	permutationSeed: number | null;
	P: Quad[];
}

export interface LayeredKeyPair {
	publicKey: LayeredPublicKey;
	secret: {
		F: Quad[];
		tinInverse: number[][] | null;
		toutInverse: number[][] | null;
	};
}

/**
 * Publish a given central map one of the two ways. Taking F as an argument is
 * what lets the exhibit publish ONE map both ways and compare like with like.
 */
export function publishLayered(F: Quad[], params: LayeredParams, publication: Publication): LayeredKeyPair {
	const { n, m } = dimensions(params);
	if (F.length !== m) throw new Error('central map does not match the parameters');
	if (publication === 'exposed') {
		const permutationSeed =
			((randomByte() << 24) | (randomByte() << 16) | (randomByte() << 8) | randomByte()) >>> 0;
		const P = relabel(F, publicPermutation(permutationSeed, n));
		return { publicKey: { params, publication, permutationSeed, P }, secret: { F, tinInverse: null, toutInverse: null } };
	}
	const tin = randomInvertible(n);
	const tout = randomInvertible(m);
	const inner = F.map((Q) => composeQuadLinear(Q, tin.M, n));
	// Output mixing: each public polynomial is a secret combination of all of them.
	const P = tout.M.map((row) => {
		const R = emptyQuad(n);
		row.forEach((weight, l) => {
			if (weight === 0) return;
			for (let i = 0; i < n; i++)
				for (let j = i; j < n; j++)
					if (inner[l][i][j] !== 0) R[i][j] = gadd(R[i][j], gmul(weight, inner[l][i][j]));
		});
		return R;
	});
	return {
		publicKey: { params, publication, permutationSeed: null, P },
		secret: { F, tinInverse: tin.inv, toutInverse: tout.inv },
	};
}

export function keygenLayered(params: LayeredParams, publication: Publication): LayeredKeyPair {
	return publishLayered(centralMap(params), params, publication);
}

export function verifyLayered(publicKey: LayeredPublicKey, target: number[], signature: number[]): boolean {
	const { n, m } = dimensions(publicKey.params);
	if (signature.length !== n || target.length !== m) return false;
	const got = evalMap(publicKey.P, signature);
	return got.every((g, i) => g === target[i]);
}

/** How many of the public equations a candidate signature satisfies. */
export function equationsSatisfied(publicKey: LayeredPublicKey, target: number[], signature: number[]): number {
	const got = evalMap(publicKey.P, signature);
	return got.filter((g, i) => g === target[i]).length;
}

function applyPermutation(perm: number[], y: number[]): number[] {
	const out = new Array(y.length).fill(0);
	perm.forEach((p, i) => (out[p] = y[i]));
	return out;
}

export interface LayeredSignature {
	signature: number[];
	passes: number;
}

/** The honest signer, using the secret key. */
export function signLayered(pair: LayeredKeyPair, target: number[]): LayeredSignature {
	const { params, publication, permutationSeed } = pair.publicKey;
	const { n } = dimensions(params);
	const centralTarget = pair.secret.toutInverse ? matVec(pair.secret.toutInverse, target) : target;
	const solved = solveLayers(pair.secret.F, params, centralTarget);
	if (!solved.preimage) throw new Error('signing failed: every vinegar draw gave a singular layer');
	const signature =
		publication === 'exposed'
			? applyPermutation(publicPermutation(permutationSeed as number, n), solved.preimage)
			: matVec(pair.secret.tinInverse as number[][], solved.preimage);
	return { signature, passes: solved.passes };
}

// --- the forger: public key only --------------------------------------------

export interface LayerReport {
	layer: number;
	equations: number;
	oilVariables: number;
	knownVariables: number;
	/** Nonzero coefficients on a product of two of this layer's own oil variables. */
	oilOilTerms: number;
	/** Nonzero coefficients that touch a variable from a later layer. */
	laterTerms: number;
	linearInOil: boolean;
}

/** Read the layer structure off a map: is each layer really linear in its oil block? */
export function layerStructure(map: Quad[], params: LayeredParams): LayerReport[] {
	const { n } = dimensions(params);
	return layerBounds(params).map(({ layer, known, oil, firstEquation }) => {
		const end = known + oil;
		let oilOilTerms = 0;
		let laterTerms = 0;
		for (let e = 0; e < oil; e++) {
			const Q = map[firstEquation + e];
			for (let i = 0; i < n; i++)
				for (let j = i; j < n; j++) {
					if (Q[i][j] === 0) continue;
					if (j >= end) laterTerms += 1;
					else if (i >= known) oilOilTerms += 1;
				}
		}
		return {
			layer,
			equations: oil,
			oilVariables: oil,
			knownVariables: known,
			oilOilTerms,
			laterTerms,
			linearInOil: oilOilTerms === 0 && laterTerms === 0,
		};
	});
}

export interface ForgeAttempt {
	structure: LayerReport[];
	/** True when every layer of the map the forger read is linear in its oil block. */
	layered: boolean;
	signature: number[] | null;
	passes: number;
	/** The verdict of the ordinary public verifier on what the forger produced. */
	accepted: boolean;
}

/**
 * Forge a signature on `target` from the public key alone.
 *
 * The argument is the public key and nothing else: there is no secret-key
 * parameter to pass. The forger undoes whatever coordinate permutation is
 * public, reads the layer structure, solves the layers in order with the same
 * routine the signer uses, and hands the result to the ordinary verifier.
 */
export function forgeFromPublicKey(publicKey: LayeredPublicKey, target: number[], maxTries = 8): ForgeAttempt {
	const { params, permutationSeed, P } = publicKey;
	const { n } = dimensions(params);
	// With hidden maps there is no public permutation to undo: the forger can
	// only read the public map in the coordinates it was given.
	const perm = permutationSeed === null ? Array.from({ length: n }, (_, i) => i) : publicPermutation(permutationSeed, n);
	const recovered = unrelabel(P, perm);
	const structure = layerStructure(recovered, params);
	const layered = structure.every((layer) => layer.linearInOil);
	let passes = 0;
	for (let attempt = 0; attempt < maxTries; attempt++) {
		const solved = solveLayers(recovered, params, target);
		passes += solved.passes;
		if (!solved.preimage) continue;
		const signature = applyPermutation(perm, solved.preimage);
		if (verifyLayered(publicKey, target, signature)) return { structure, layered, signature, passes, accepted: true };
		// On a map that is not layered the solve "succeeds" and the result is wrong.
		if (!layered && attempt === maxTries - 1) return { structure, layered, signature, passes, accepted: false };
	}
	return { structure, layered, signature: null, passes, accepted: false };
}

/** What the exposed public key gives away: the central map itself, relabelled. */
export function recoveredCentralMap(publicKey: LayeredPublicKey): Quad[] | null {
	if (publicKey.permutationSeed === null) return null;
	const { n } = dimensions(publicKey.params);
	return unrelabel(publicKey.P, publicPermutation(publicKey.permutationSeed, n));
}
