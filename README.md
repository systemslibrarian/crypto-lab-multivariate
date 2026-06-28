# crypto-lab-multivariate

## What It Is

A hands-on demonstration of multivariate cryptography, the post-quantum family whose security rests on the hardness of solving systems of multivariate quadratic equations (the MQ problem) over a finite field. The lab runs a real, working Unbalanced Oil-and-Vinegar (UOV) signature scheme over GF(256) entirely in the browser: it generates a keypair, signs a message by inverting a trapdoored central map, and verifies the result. The trapdoor is made visible — fixing the "vinegar" variables turns a hard nonlinear system into an easy linear one, which is exactly how the signer cheats. The demo then walks through how Rainbow, the layered version of this scheme and a NIST Round 3 finalist, was broken on a laptop in 2022, illustrating why NIST ultimately chose less-structured lattice assumptions for its primary standards.

## When to Use It

- **Teaching the MQ trapdoor** — show concretely how Oil-and-Vinegar separates a public hard problem from a private easy one.
- **Explaining why lattices won standardisation** — multivariate schemes keep falling to structural attacks; this is the clearest worked example.
- **Illustrating short-signature tradeoffs** — multivariate gives the smallest signatures of any PQC family at the cost of enormous public keys.
- **Demonstrating signature binding** — flip one byte of the signature, or change the message, and watch verification fail.
- **Do NOT use this code for real signatures** — it uses tiny teaching parameters and is not constant-time or production-secure.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-multivariate](https://systemslibrarian.github.io/crypto-lab-multivariate/)**

Pick the number of vinegar and oil variables, generate a keypair, and sign a message. The signing panel shows the random vinegar guess, the solved oil values, and the resulting signature, plus how many guesses were needed before a solvable linear system appeared. Three verification cards let you confirm a valid signature, flip a single signature byte, and edit the message — the last two are rejected, showing the signature is bound to both the key and the message. Below the playground, a five-step walkthrough explains the Beullens 2022 attack, a lineage of Oil-and-Vinegar schemes, and a table comparing signature sizes across the lattice, hash, and multivariate families.

## What Can Go Wrong

- **Balanced parameters (v = o)** — the original 1997 Oil-and-Vinegar scheme used equal oil and vinegar counts and was broken by Kipnis and Shamir within a year; the "unbalanced" v > o variant exists to defeat that attack.
- **Extra structure invites attacks** — Rainbow's second Oil-and-Vinegar layer shrank signatures but created the algebraic relationships Beullens exploited to recover the oil subspace.
- **Underestimating the public key** — multivariate public keys run to hundreds of kilobytes, which can be prohibitive for constrained protocols even though signatures are tiny.
- **Reusing a weak central map** — the security depends entirely on the secret structure being hidden by the affine transforms; a leaked or structured transform exposes the trapdoor.
- **Treating "NP-hard in general" as "hard for this instance"** — MQ is NP-hard in the worst case, but the structured instances used in cryptography have repeatedly proven easier than hoped.

## Real-World Usage

- **NIST PQC standardisation** — Rainbow reached the Round 3 finals before the 2022 break removed it from contention; NIST standardised lattice and hash schemes instead.
- **NIST additional-signatures on-ramp** — UOV and the modern MAYO variant were submitted to NIST's call for additional post-quantum signatures, keeping the family in active research.
- **Smallest-signature niche** — multivariate schemes remain of interest where signature size dominates and large public keys are acceptable, such as certain constrained verification settings.
- **Cryptanalysis research** — the Oil-and-Vinegar family is a standard teaching and research target for understanding structural attacks like MinRank.
- **Historical lesson** — the repeated breaks of multivariate trapdoors are routinely cited as motivation for preferring lattice-based assumptions.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-multivariate
cd crypto-lab-multivariate
npm install
npm run dev
```

## Related Demos

- [crypto-lab-dilithium-seal](https://systemslibrarian.github.io/crypto-lab-dilithium-seal/) — ML-DSA lattice signatures, the family NIST chose over multivariate.
- [crypto-lab-falcon-seal](https://systemslibrarian.github.io/crypto-lab-falcon-seal/) — Falcon/FN-DSA NTRU lattice signatures with compact output.
- [crypto-lab-sphincs-ledger](https://systemslibrarian.github.io/crypto-lab-sphincs-ledger/) — SLH-DSA hash-based signatures, a conservative PQ alternative.
- [crypto-lab-mpcith-sign](https://systemslibrarian.github.io/crypto-lab-mpcith-sign/) — MPC-in-the-Head signatures, another non-lattice PQ approach.
- [crypto-lab-hawk](https://systemslibrarian.github.io/crypto-lab-hawk/) — HAWK lattice signatures with Gaussian sampling.

## Tech

Vite + TypeScript, zero runtime dependencies. `src/gf256.ts` implements GF(2^8) arithmetic with the AES reduction polynomial; `src/uov.ts` is a complete UOV keygen / sign / verify; `src/ui.ts` is the interactive playground. Dark mode by default with a persisted theme toggle.

```bash
npm run build    # type-check + production build to dist/
```

---

*One of 60+ browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
