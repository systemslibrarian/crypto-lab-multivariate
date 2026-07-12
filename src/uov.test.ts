import { describe, it, expect, afterEach } from 'vitest';
import {
  keygen,
  sign,
  verify,
  hashMessage,
  evalMap,
  evalQuad,
  setRngByte,
  type UovKeys,
} from './uov.ts';
import { gadd, gmul } from './gf256.ts';

// A tiny deterministic byte generator (xorshift32) so tests can pin exact
// keypairs / signatures without depending on the CSPRNG. This exercises the
// setRngByte() injection point and gives reproducible KAT-style vectors.
function seededRng(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s & 0xff;
  };
}

afterEach(() => {
  setRngByte(); // restore the real CSPRNG after each test
});

// Build a keypair with a pinned RNG so the whole keygen is reproducible.
function seededKeygen(v: number, o: number, seed: number): UovKeys {
  setRngByte(seededRng(seed));
  const keys = keygen({ v, o });
  return keys;
}

describe('keygen structure (the trapdoor)', () => {
  it('central map F has a zero oil*oil block', () => {
    const { v, o } = { v: 6, o: 3 };
    const keys = seededKeygen(v, o, 1);
    expect(keys.F).toHaveLength(o);
    for (const Q of keys.F) {
      for (let i = v; i < keys.n; i++)
        for (let j = i; j < keys.n; j++) {
          // both indices are oil => coefficient must be zero
          expect(Q[i][j]).toBe(0);
        }
    }
  });

  it('produces the right dimensions', () => {
    const keys = seededKeygen(7, 4, 42);
    expect(keys.n).toBe(11);
    expect(keys.P).toHaveLength(4);
    expect(keys.S).toHaveLength(11);
    expect(keys.Sinv).toHaveLength(11);
  });

  it('S and Sinv are true inverses (S * Sinv = I)', () => {
    const keys = seededKeygen(5, 3, 7);
    const n = keys.n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        let acc = 0;
        for (let k = 0; k < n; k++) acc = gadd(acc, gmul(keys.S[i][k], keys.Sinv[k][j]));
        expect(acc).toBe(i === j ? 1 : 0);
      }
  });

  it('public map really is F composed with S: P(y) == F(S·y)', () => {
    const keys = seededKeygen(6, 3, 99);
    const n = keys.n;
    for (let trial = 0; trial < 20; trial++) {
      const y = Array.from({ length: n }, (_, i) => (trial * 7 + i * 13 + 1) & 0xff);
      // Sy = S · y
      const Sy = Array.from({ length: n }, (_, r) => {
        let acc = 0;
        for (let c = 0; c < n; c++) acc = gadd(acc, gmul(keys.S[r][c], y[c]));
        return acc;
      });
      const viaP = evalMap(keys.P, y);
      const viaF = evalMap(keys.F, Sy);
      expect(viaP).toEqual(viaF);
    }
  });
});

describe('sign / verify round-trip', () => {
  const cases = [
    { v: 6, o: 3, seed: 1 },
    { v: 7, o: 4, seed: 2 },
    { v: 10, o: 5, seed: 3 },
    { v: 12, o: 6, seed: 4 },
  ];

  for (const { v, o, seed } of cases) {
    it(`valid signature verifies for v=${v}, o=${o}`, () => {
      const keys = seededKeygen(v, o, seed);
      const target = hashMessage('hello multivariate crypto', o);
      const trace = sign(keys, target);
      expect(trace.signature).toHaveLength(keys.n);
      expect(verify(keys, target, trace.signature)).toBe(true);
      // the produced signature must actually evaluate to the target under P
      expect(evalMap(keys.P, trace.signature)).toEqual(target);
    });
  }

  it('the preimage hits the target under the central map F', () => {
    const keys = seededKeygen(8, 4, 11);
    const target = hashMessage('trapdoor check', 4);
    const trace = sign(keys, target);
    expect(evalMap(keys.F, trace.preimage)).toEqual(target);
  });

  it('signs many distinct messages, all verify', () => {
    const keys = seededKeygen(9, 4, 21);
    for (let i = 0; i < 40; i++) {
      const target = hashMessage('msg #' + i, 4);
      const trace = sign(keys, target);
      expect(verify(keys, target, trace.signature)).toBe(true);
    }
  });
});

describe('verify rejects forgeries and tampering', () => {
  it('rejects when a single signature byte is flipped', () => {
    const keys = seededKeygen(8, 4, 5);
    const target = hashMessage('bind me', 4);
    const trace = sign(keys, target);
    const forged = trace.signature.slice();
    forged[0] ^= 0x01; // flip one bit
    expect(verify(keys, target, forged)).toBe(false);
  });

  it('rejects a valid signature against a different (edited) message', () => {
    const keys = seededKeygen(8, 4, 6);
    const target = hashMessage('original message', 4);
    const trace = sign(keys, target);
    const edited = hashMessage('original message!', 4);
    expect(edited).not.toEqual(target);
    expect(verify(keys, target, trace.signature)).toBe(true);
    expect(verify(keys, edited, trace.signature)).toBe(false);
  });

  it('rejects an all-zero signature for a nonzero target', () => {
    const keys = seededKeygen(7, 4, 8);
    const target = hashMessage('nonzero please', 4);
    expect(target.some((b) => b !== 0)).toBe(true);
    const zero = new Array(keys.n).fill(0);
    expect(verify(keys, target, zero)).toBe(false);
  });

  it('a signature from one key does not verify under a fresh key', () => {
    const keysA = seededKeygen(8, 4, 100);
    const keysB = seededKeygen(8, 4, 200);
    const target = hashMessage('cross-key', 4);
    const trace = sign(keysA, target);
    expect(verify(keysA, target, trace.signature)).toBe(true);
    expect(verify(keysB, target, trace.signature)).toBe(false);
  });
});

describe('determinism via injected RNG', () => {
  it('same seed yields identical keypair and signature', () => {
    const k1 = seededKeygen(7, 4, 777);
    const t1 = sign(k1, hashMessage('repeat', 4));
    const k2 = seededKeygen(7, 4, 777);
    const t2 = sign(k2, hashMessage('repeat', 4));
    expect(k1.P).toEqual(k2.P);
    expect(t1.signature).toEqual(t2.signature);
  });
});

describe('hashMessage (disclosed toy FNV-1a)', () => {
  it('returns exactly o bytes, all in range', () => {
    for (const o of [3, 4, 6]) {
      const h = hashMessage('some message', o);
      expect(h).toHaveLength(o);
      for (const b of h) {
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(255);
      }
    }
  });

  it('is deterministic', () => {
    expect(hashMessage('abc', 4)).toEqual(hashMessage('abc', 4));
  });

  it('changes when the message changes (diffusion)', () => {
    expect(hashMessage('abc', 4)).not.toEqual(hashMessage('abd', 4));
    expect(hashMessage('', 4)).not.toEqual(hashMessage('a', 4));
  });

  it('fills all output bytes even for short messages', () => {
    // regression: the diffusion pass exists so a 1-char message is not mostly zero
    const h = hashMessage('x', 6);
    expect(h.filter((b) => b !== 0).length).toBeGreaterThan(1);
  });
});

describe('evalQuad basics', () => {
  it('evaluates a single upper-triangular quadratic form', () => {
    // Q = x0*x0 term coeff 1, x0*x1 coeff 2 (GF); at x=[1,1]: 1*1 + 2*(1*1) = 1 xor 2 = 3
    const Q = [
      [1, 2],
      [0, 0],
    ];
    expect(evalQuad(Q, [1, 1])).toBe(3);
    expect(evalQuad(Q, [0, 0])).toBe(0);
  });
});
