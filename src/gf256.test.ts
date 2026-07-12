import { describe, it, expect } from 'vitest';
import { gadd, gmul, ginv, gdiv } from './gf256.ts';

// GF(2^8) with the AES reduction polynomial 0x11B. These are the same field
// operations AES uses, so we can pin them against well-known AES reference
// values (FIPS-197 examples) and against the field axioms.

describe('gf256 addition (XOR)', () => {
  it('is XOR', () => {
    expect(gadd(0x53, 0xca)).toBe(0x53 ^ 0xca);
    expect(gadd(0xff, 0xff)).toBe(0);
    expect(gadd(0, 0xab)).toBe(0xab);
  });

  it('every element is its own additive inverse', () => {
    for (let a = 0; a < 256; a++) expect(gadd(a, a)).toBe(0);
  });
});

describe('gf256 multiplication', () => {
  it('matches FIPS-197 reference products', () => {
    // From FIPS-197 §4.2: {57}·{83} = {c1}, {57}·{13} = {fe}.
    expect(gmul(0x57, 0x83)).toBe(0xc1);
    expect(gmul(0x57, 0x13)).toBe(0xfe);
    // {57}·{02} and {57}·{04} appear in the xtime walk of the same example.
    expect(gmul(0x57, 0x02)).toBe(0xae);
    expect(gmul(0x57, 0x04)).toBe(0x47);
    expect(gmul(0x57, 0x10)).toBe(0x07);
  });

  it('has 0 and 1 as absorbing/identity elements', () => {
    for (let a = 0; a < 256; a++) {
      expect(gmul(a, 0)).toBe(0);
      expect(gmul(0, a)).toBe(0);
      expect(gmul(a, 1)).toBe(a);
      expect(gmul(1, a)).toBe(a);
    }
  });

  it('is commutative', () => {
    for (let a = 1; a < 256; a += 7)
      for (let b = 1; b < 256; b += 5) expect(gmul(a, b)).toBe(gmul(b, a));
  });

  it('is associative', () => {
    const s = [1, 2, 3, 0x53, 0x9d, 0xff, 0x1b, 0x80];
    for (const a of s)
      for (const b of s)
        for (const c of s)
          expect(gmul(gmul(a, b), c)).toBe(gmul(a, gmul(b, c)));
  });

  it('distributes over addition', () => {
    const s = [1, 2, 3, 0x53, 0x9d, 0xff, 0x1b, 0x80, 0x2a];
    for (const a of s)
      for (const b of s)
        for (const c of s)
          expect(gmul(a, gadd(b, c))).toBe(gadd(gmul(a, b), gmul(a, c)));
  });

  it('stays inside the field for all pairs', () => {
    for (let a = 0; a < 256; a++)
      for (let b = 0; b < 256; b += 17) {
        const p = gmul(a, b);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(255);
      }
  });
});

describe('gf256 inverse and division', () => {
  it('a * inv(a) == 1 for every nonzero element', () => {
    for (let a = 1; a < 256; a++) expect(gmul(a, ginv(a))).toBe(1);
  });

  it('inv(1) == 1', () => {
    expect(ginv(1)).toBe(1);
  });

  it('inverse is an involution: inv(inv(a)) == a', () => {
    for (let a = 1; a < 256; a++) expect(ginv(ginv(a))).toBe(a);
  });

  it('throws on inverse of zero', () => {
    expect(() => ginv(0)).toThrow();
  });

  it('gdiv(a, b) == gmul(a, inv(b)) and a/a == 1', () => {
    for (let a = 1; a < 256; a += 13)
      for (let b = 1; b < 256; b += 11) {
        expect(gdiv(a, b)).toBe(gmul(a, ginv(b)));
      }
    for (let a = 1; a < 256; a++) expect(gdiv(a, a)).toBe(1);
  });
});
