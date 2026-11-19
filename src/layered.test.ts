// layered.test.ts — the layered-map toy behind the "hiding maps left out" exhibit.
//
// The claims under test, in both directions:
//   exposed  P = F . Pi^-1      a forger holding ONLY the public key signs
//   hidden   P = Tout . F . Tin the identical forger does not
// plus the controls that make a "forgery accepted" mean something: a changed
// signature byte and a different message are rejected by the same verifier.
import { afterEach, describe, expect, it } from 'vitest';
import { evalMap, hashMessage, setRngByte, type Quad } from './uov.ts';
import {
	centralMap,
	dimensions,
	equationsSatisfied,
	forgeFromPublicKey,
	keygenLayered,
	layerBounds,
	layerStructure,
	publicPermutation,
	publishLayered,
	recoveredCentralMap,
	signLayered,
	solveLayers,
	verifyLayered,
	type LayeredParams,
	type LayeredPublicKey,
} from './layered.ts';

const PARAMS: LayeredParams = { v: 4, layers: [3, 3] };
const THREE_LAYERS: LayeredParams = { v: 5, layers: [3, 2, 2] };

/** A seeded byte stream, so a failure reproduces. */
function seeded(seed: number): () => number {
	let state = seed >>> 0 || 1;
	return () => {
		state ^= state << 13;
		state >>>= 0;
		state ^= state >>> 17;
		state ^= state << 5;
		state >>>= 0;
		return state & 0xff;
	};
}

afterEach(() => {
	setRngByte();
});

const flat = (map: Quad[]): string => JSON.stringify(map);

describe('layer geometry', () => {
	it('derives n, m and the per-layer bounds from the parameters', () => {
		expect(dimensions(PARAMS)).toEqual({ n: 10, m: 6 });
		expect(layerBounds(PARAMS)).toEqual([
			{ layer: 0, known: 4, oil: 3, firstEquation: 0 },
			{ layer: 1, known: 7, oil: 3, firstEquation: 3 },
		]);
		expect(dimensions(THREE_LAYERS)).toEqual({ n: 12, m: 7 });
		expect(layerBounds(THREE_LAYERS).map((b) => b.known)).toEqual([5, 8, 10]);
	});

	it('gives the central map the layered support and nothing else', () => {
		setRngByte(seeded(11));
		for (const params of [PARAMS, THREE_LAYERS]) {
			const F = centralMap(params);
			const report = layerStructure(F, params);
			expect(F).toHaveLength(dimensions(params).m);
			for (const layer of report) {
				expect(layer.oilOilTerms).toBe(0);
				expect(layer.laterTerms).toBe(0);
				expect(layer.linearInOil).toBe(true);
			}
			// It is not trivially linear: later layers do multiply earlier oil variables.
			const last = layerBounds(params).at(-1)!;
			const usesEarlierOil = F[last.firstEquation].some((row, i) => i >= params.v && i < last.known && row.some((c) => c !== 0));
			expect(usesEarlierOil).toBe(true);
		}
	});

	it('makes the public permutation a permutation, fixed by its seed', () => {
		const a = publicPermutation(12345, 10);
		expect([...a].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		expect(publicPermutation(12345, 10)).toEqual(a);
		expect(publicPermutation(54321, 10)).not.toEqual(a);
		expect(a).not.toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
	});
});

describe.each(['exposed', 'hidden'] as const)('honest signing, %s publication', (publication) => {
	it('signs and verifies, and rejects a changed byte or a different message', () => {
		setRngByte(seeded(publication === 'exposed' ? 21 : 22));
		for (let trial = 0; trial < 10; trial++) {
			const pair = keygenLayered(PARAMS, publication);
			const target = hashMessage(`message ${trial}`, 6);
			const { signature } = signLayered(pair, target);
			expect(verifyLayered(pair.publicKey, target, signature)).toBe(true);
			const changed = signature.slice();
			changed[trial % signature.length] ^= 0x01;
			expect(verifyLayered(pair.publicKey, target, changed)).toBe(false);
			expect(verifyLayered(pair.publicKey, hashMessage(`other ${trial}`, 6), signature)).toBe(false);
			expect(verifyLayered(pair.publicKey, target, signature.slice(1))).toBe(false);
		}
	});
});

describe('the exposed key is the central map, relabelled', () => {
	it('gives back the secret central map coefficient for coefficient', () => {
		setRngByte(seeded(31));
		const pair = keygenLayered(PARAMS, 'exposed');
		expect(pair.publicKey.permutationSeed).not.toBeNull();
		const recovered = recoveredCentralMap(pair.publicKey);
		expect(recovered).not.toBeNull();
		expect(flat(recovered!)).toBe(flat(pair.secret.F));
		// The published map itself is NOT in solving order: the permutation moved it.
		expect(flat(pair.publicKey.P)).not.toBe(flat(pair.secret.F));
	});

	it('offers nothing to undo when the maps are hidden', () => {
		setRngByte(seeded(32));
		const pair = keygenLayered(PARAMS, 'hidden');
		expect(pair.publicKey.permutationSeed).toBeNull();
		expect(recoveredCentralMap(pair.publicKey)).toBeNull();
		expect(flat(pair.publicKey.P)).not.toBe(flat(pair.secret.F));
	});
});

describe('forgery from the public key alone', () => {
	it('forges on every exposed key tried, and the controls reject', () => {
		setRngByte(seeded(41));
		const trials = 60;
		let accepted = 0;
		let differsFromHonest = 0;
		for (let trial = 0; trial < trials; trial++) {
			const pair = keygenLayered(trial % 2 ? PARAMS : THREE_LAYERS, 'exposed');
			const m = dimensions(pair.publicKey.params).m;
			const target = hashMessage(`forge ${trial}`, m);
			// The forger gets a JSON copy of the public key: no object it holds can
			// reach the secret half.
			const publicOnly = JSON.parse(JSON.stringify(pair.publicKey)) as LayeredPublicKey;
			const attempt = forgeFromPublicKey(publicOnly, target);
			expect(attempt.layered).toBe(true);
			expect(attempt.structure.every((l) => l.oilOilTerms === 0 && l.laterTerms === 0)).toBe(true);
			if (attempt.accepted && attempt.signature) {
				accepted += 1;
				// Judged again here by the verifier, against the ORIGINAL key object.
				expect(verifyLayered(pair.publicKey, target, attempt.signature)).toBe(true);
				// Control A: one changed byte.  Control C: a different message.
				const changed = attempt.signature.slice();
				changed[0] ^= 0x01;
				expect(verifyLayered(pair.publicKey, target, changed)).toBe(false);
				expect(verifyLayered(pair.publicKey, hashMessage(`not ${trial}`, m), attempt.signature)).toBe(false);
				const honest = signLayered(pair, target).signature;
				if (honest.join() !== attempt.signature.join()) differsFromHonest += 1;
			}
		}
		expect(accepted).toBe(trials);
		// A forgery is a new signature, not a replay of the signer's.
		expect(differsFromHonest).toBe(trials);
	});

	it('does not forge on any hidden key tried, with the identical forger', () => {
		setRngByte(seeded(42));
		const trials = 60;
		let accepted = 0;
		for (let trial = 0; trial < trials; trial++) {
			const pair = keygenLayered(trial % 2 ? PARAMS : THREE_LAYERS, 'hidden');
			const m = dimensions(pair.publicKey.params).m;
			const target = hashMessage(`forge ${trial}`, m);
			const attempt = forgeFromPublicKey(JSON.parse(JSON.stringify(pair.publicKey)) as LayeredPublicKey, target);
			// What the forger reads is not layered: oil-times-oil terms are everywhere.
			expect(attempt.layered).toBe(false);
			expect(attempt.structure.some((l) => l.oilOilTerms > 0)).toBe(true);
			if (attempt.accepted) accepted += 1;
			// The honest signer still signs under the same key.
			expect(verifyLayered(pair.publicKey, target, signLayered(pair, target).signature)).toBe(true);
		}
		expect(accepted).toBe(0);
	});

	it('uses the same layer solver as the signer', () => {
		setRngByte(seeded(43));
		const pair = keygenLayered(PARAMS, 'exposed');
		const target = hashMessage('same solver', 6);
		const viaSecret = solveLayers(pair.secret.F, PARAMS, target);
		const viaPublic = solveLayers(recoveredCentralMap(pair.publicKey)!, PARAMS, target);
		expect(viaSecret.preimage).not.toBeNull();
		expect(viaPublic.preimage).not.toBeNull();
		expect(evalMap(pair.secret.F, viaPublic.preimage!)).toEqual(target);
		expect(evalMap(pair.secret.F, viaSecret.preimage!)).toEqual(target);
	});

	it('restarts from the first layer when a layer is singular', () => {
		// A vinegar draw of all zeros makes every layer-0 coefficient vanish, so
		// the first pass must fail there and a later pass must succeed.
		const params = PARAMS;
		setRngByte(seeded(44));
		const F = centralMap(params);
		const target = hashMessage('restart', 6);
		let calls = 0;
		const stream = seeded(45);
		setRngByte(() => (calls++ < params.v ? 0 : stream()));
		const solved = solveLayers(F, params, target);
		expect(solved.singularAt[0]).toBe(0);
		expect(solved.passes).toBeGreaterThan(1);
		expect(solved.preimage).not.toBeNull();
		expect(evalMap(F, solved.preimage!)).toEqual(target);
	});

	it('gives up cleanly when no pass can succeed', () => {
		setRngByte(seeded(46));
		const F = centralMap(PARAMS);
		setRngByte(() => 0); // every vinegar draw is zero: layer 0 is always singular
		const solved = solveLayers(F, PARAMS, hashMessage('never', 6), 5);
		expect(solved.preimage).toBeNull();
		expect(solved.passes).toBe(5);
		expect(solved.singularAt).toEqual([0, 0, 0, 0, 0]);
	});
});

describe('the forger reports what the verifier said, not what kind of key it was given', () => {
	it('reports failure on an exposed key when every pass is singular', () => {
		setRngByte(seeded(47));
		const pair = keygenLayered(PARAMS, 'exposed');
		const target = hashMessage('unlucky', 6);
		setRngByte(() => 0); // all-zero vinegar: the first layer is singular on every pass
		const attempt = forgeFromPublicKey(pair.publicKey, target, 2);
		// The key is exposed and its layers are readable, and still nothing was forged.
		expect(attempt.layered).toBe(true);
		expect(attempt.accepted).toBe(false);
		expect(attempt.signature).toBeNull();
		expect(attempt.passes).toBe(2 * 64);
	});
});

describe('one central map, published both ways', () => {
	it('is forged when exposed and not when hidden, with the same forger', () => {
		setRngByte(seeded(51));
		for (const params of [PARAMS, THREE_LAYERS, { v: 12, layers: [4, 4, 4, 1] }]) {
			const { m } = dimensions(params);
			const F = centralMap(params);
			const exposed = publishLayered(F, params, 'exposed');
			const hidden = publishLayered(F, params, 'hidden');
			// Like with like: the two keys wrap the identical central map.
			expect(exposed.secret.F).toBe(F);
			expect(hidden.secret.F).toBe(F);
			const target = hashMessage('one map, two publications', m);

			const onExposed = forgeFromPublicKey(JSON.parse(JSON.stringify(exposed.publicKey)) as LayeredPublicKey, target);
			expect(onExposed.accepted).toBe(true);
			expect(equationsSatisfied(exposed.publicKey, target, onExposed.signature!)).toBe(m);
			expect(flat(recoveredCentralMap(exposed.publicKey)!)).toBe(flat(F));

			const onHidden = forgeFromPublicKey(JSON.parse(JSON.stringify(hidden.publicKey)) as LayeredPublicKey, target);
			expect(onHidden.accepted).toBe(false);
			expect(onHidden.signature).not.toBeNull();
			// The forger's output is a vector that fails the public equations.
			expect(equationsSatisfied(hidden.publicKey, target, onHidden.signature!)).toBeLessThan(m);
			// The trapdoor still works for whoever holds the hiding maps.
			const honest = signLayered(hidden, target).signature;
			expect(equationsSatisfied(hidden.publicKey, target, honest)).toBe(m);
		}
	});

	it('refuses a central map of the wrong size', () => {
		setRngByte(seeded(52));
		expect(() => publishLayered(centralMap(PARAMS), THREE_LAYERS, 'exposed')).toThrow(/does not match/);
	});
});
