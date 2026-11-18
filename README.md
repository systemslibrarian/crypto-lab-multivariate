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

Pick the number of vinegar and oil variables, generate a keypair, and sign a message. The signing panel shows the random vinegar guess, the solved oil values, and the resulting signature, plus how many guesses were needed before a solvable linear system appeared. Three verification cards let you confirm a valid signature, invert every bit in one signature byte, and edit the message — the last two are rejected, showing the signature is bound to both the key and the message. The anatomy panel animates the quadratic → linear collapse and captions it with numbers counted off the live run: how many V×V and V×O coefficients this polynomial actually has, the single constant its vinegar×vinegar terms collapsed to, the solved row of A, and — the trapdoor claim itself — the measured count of the O×O block in the secret map (zero) against the same block in the public map (not zero, because the secret linear transform refills it).

**Break it yourself** runs a real attack rather than describing one. It generates a fresh *balanced* keypair (v = o), hands a Kipnis–Shamir key recovery **only the public key**, and the attack recovers the hidden oil subspace from the eigenspaces of Bₐ⁻¹Bᵇ, checks the candidate against the public map, and forges a signature that the lab's own verifier accepts. The identical code then runs against unbalanced parameters with the *same oil count and two extra vinegar variables*, where it measurably fails — so the claim that v > o is what defeats *this Kipnis–Shamir attack at toy scale* is a result on the page rather than a sentence. This result is not a security test of NIST-scale UOV or MAYO parameters. Toy scale is stated in the exhibit: v = o = 3 or 4 over GF(256) against a deployed (v, o) = (68, 44).

**A layered map with the hiding maps left out** needs no recovery at all. It generates one layered ("Rainbow-type") central map over GF(256) and publishes it twice: once wrapped in secret input and output maps, and once with only a coordinate reordering whose seed is in the public key. One forger, a function whose only input is a public key, is run on both. On the first it finds nothing the verifier accepts. On the second it undoes the public reordering, reads the layers off the key, solves them in order with the routine the signer uses, and the lab's verifier accepts the result. The exhibit is a labelled **model** of the forgery on Origami, a first-round NGCC signature candidate whose specification omits those maps; see [Hiding-maps exhibit: sources, versions and scope](#hiding-maps-exhibit-sources-versions-and-scope).

Below the playground, a five-step walkthrough explains the Beullens attacks on Rainbow — the intersection and rectangular MinRank attacks of Eurocrypt 2021, then the simple attack of Crypto 2022 that finished it — a lineage of Oil-and-Vinegar schemes, and a table comparing signature sizes across the lattice, hash, and multivariate families.

## What Can Go Wrong

- **MAYO research update — 16 November 2026.** [Li and Tao, *Extending the Schur–Macaulay Framework for UOV Attacks via Truncated Polynomial Algebras*, ePrint 2026/2444](https://eprint.iacr.org/2026/2444), revised 16 November 2026, reports lower attack-cost estimates for selected additional Round-3 MAYO parameter sets. This is a **preprint; conditional extrapolation** based on conjectural Hilbert-series and structured-rank predictions, not demonstrated production-key recovery. It does not establish the security of historical Round-2 sets or tiny teaching keys. The demo does not execute this attack. See [research note below How Rainbow Fell](https://systemslibrarian.github.io/crypto-lab-multivariate/#mayo-schur-update).

- **UOV structural-attack estimates — 14 November 2026.** [Li and Tao, *Attacking UOV-based Signatures over divided power algebras*, ePrint 2026/2272](https://eprint.iacr.org/2026/2272), revised 14 November 2026, is a **preprint; conditional extrapolation**. Its estimates for selected Round-3 UOV parameters depend on conjectural Hilbert-series predictions supported by small-instance experiments, not demonstrated production-key recovery. Its parameters differ from this lab’s uov-Ip comparison row, which moved to the Round-3 parameter set on 2026-11-18; the word “older” was dropped from the panel copy rather than replaced with a claim that the sets now coincide, which would need the paper read. The estimates must not be transferred to that row or to tiny teaching keys either way. This lab does not execute the divided-power wedge attack. The visible note is below **How Rainbow Fell** ([direct link](https://systemslibrarian.github.io/crypto-lab-multivariate/#uov-research-note)). The executable attack remains the balanced Kipnis–Shamir example.

- **Balanced parameters (v = o)** — the original 1997 Oil-and-Vinegar scheme used equal oil and vinegar counts and was broken by Kipnis and Shamir within a year; the "unbalanced" v > o variant exists to defeat that attack. The **Break it yourself** exhibit runs that break live at toy scale, and runs it again against unbalanced parameters to watch it fail.
- **Extra structure invites attacks** — Rainbow's second Oil-and-Vinegar layer shrank signatures but created the algebraic relationships Beullens exploited to recover the oil subspace.
- **Underestimating the public key** — multivariate public keys run to hundreds of kilobytes, which can be prohibitive for constrained protocols even though signatures are tiny.
- **Leaving the hiding maps out** — a layered central map is easy to invert by design, and the secret maps around it are the only thing that keeps that inversion to the signer. Origami, a first-round candidate in China's NGCC competition, composed its layered map with a public permutation and no secret maps; [Louiso, Guo, Li, Pébereau, Tao and Ding, ePrint 2026/2390](https://eprint.iacr.org/2026/2390) (October 2026) forge signatures from the public key alone at about the cost of one verification. The **hiding maps** exhibit runs the same structural situation on a toy and is labelled as a model. As of November 2026, NGCC is in its first round; the ICCS proposal pages list Round 1 candidates only (checked 18 November 2026). The designers acknowledged the forgery on 24 September 2026 and promised an updated algorithm, so this describes the round-one submission only.
- **Reusing a weak central map** — the security depends entirely on the secret structure being hidden by the affine transforms; a leaked or structured transform exposes the trapdoor.
- **Treating "NP-hard in general" as "hard for this instance"** — MQ is NP-hard in the worst case, but the structured instances used in cryptography have repeatedly proven easier than hoped. [Merz and Ran, ePrint 2026/2181 (September 26, 2026)](https://eprint.iacr.org/2026/2181) present a different structural attack with complexity estimates for round-2 UOV-family parameter sets, including four alternate MAYO sets estimated below their claimed security. It is a preprint analysis, not this lab's demonstrated Kipnis–Shamir recovery and not a blanket break of round-3 candidates.

## Real-World Usage

- **NIST PQC standardisation** — Rainbow reached the Round 3 finals before the 2022 break removed it from contention; NIST standardised lattice and hash schemes instead.
- **NIST additional-signatures on-ramp** — UOV and the modern MAYO variant were submitted to NIST's call for additional post-quantum signatures, keeping the family in active research. Both [advanced to Round 3](https://csrc.nist.gov/News/2026/nist-advances-9-candidates-to-the-3rd-round-of-pqc) on 14 May 2026; NIST IR 8610 gives the rationale, and the round-3 candidates also include the multivariate QR-UOV and SNOVA.
- **Smallest-signature niche** — multivariate schemes remain of interest where signature size dominates and large public keys are acceptable, such as certain constrained verification settings.
- **Cryptanalysis research** — the Oil-and-Vinegar family is a standard teaching and research target for understanding structural attacks like MinRank.
- **Historical lesson** — the repeated breaks of multivariate trapdoors are routinely cited as motivation for preferring lattice-based assumptions.

**Standards reviewed 15 November 2026:** round status taken from NIST IR 8610 (May 2026), which closed round 2 on 14 May 2026 and selected nine third-round candidates — FAEST, HAWK, MAYO, MQOM, QR-UOV, SDitH, SNOVA, SQIsign and UOV. HAWK has since been withdrawn (see Related Demos). The size figures on this page keep their Round-2 labels because they are Round-2 values: the UOV round-3 submission (version 3.0, August 2026) moves uov-Ip to (119, 45) with a 321,300 B expanded public key and a 135 B signature, and the MAYO round-3 submission retunes MAYO1 to 1,456 B and 464 B.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-multivariate
cd crypto-lab-multivariate
npm install
npm run dev
```

## Related Demos

- [crypto-lab-mayo-seal](https://systemslibrarian.github.io/crypto-lab-mayo-seal/) — MAYO over GF(16): an Oil-and-Vinegar scheme whose public key is computed from a secret oil space, the dependence the hiding-maps exhibit shows a layered map without.
- [crypto-lab-dilithium-seal](https://systemslibrarian.github.io/crypto-lab-dilithium-seal/) — ML-DSA lattice signatures, the family NIST chose over multivariate.
- [crypto-lab-falcon-seal](https://systemslibrarian.github.io/crypto-lab-falcon-seal/) — Falcon/FN-DSA NTRU lattice signatures with compact output.
- [crypto-lab-sphincs-ledger](https://systemslibrarian.github.io/crypto-lab-sphincs-ledger/) — SLH-DSA hash-based signatures, a conservative PQ alternative.
- [crypto-lab-mpcith-sign](https://systemslibrarian.github.io/crypto-lab-mpcith-sign/) — MPC-in-the-Head signatures, another non-lattice PQ approach.
- [crypto-lab-hawk](https://systemslibrarian.github.io/crypto-lab-hawk/) — HAWK lattice signatures with Gaussian sampling; [NIST lists it as withdrawn](https://csrc.nist.gov/projects/pqc-dig-sig/round-3-additional-signatures) after a key-recovery attack, and [its own submission team](https://hawk-sign.info/) dates the withdrawal 29 July 2026 and states that Hawk "is insecure and should not be used".

## Tech

Vite + TypeScript, zero runtime dependencies. `src/gf256.ts` implements GF(2^8) arithmetic with the AES reduction polynomial; `src/uov.ts` is a complete UOV keygen / sign / verify; `src/layered.ts` is the toy layered map behind the hiding-maps exhibit, with its two ways of publishing a key and a forger that takes only a public key; `src/ui.ts` is the interactive playground. Key material and vinegar guesses are drawn from `crypto.getRandomValues` (WebCrypto CSPRNG); the RNG is injectable (`setRngByte`) so the test suite can pin deterministic vectors. The message-to-target map is a disclosed, non-cryptographic FNV-1a digest (called out both in the code and in the UI), used only to produce an `o`-byte target while keeping the demo offline and synchronous — real UOV hashes with a standard collision-resistant function.

```bash
npm run build    # type-check + production build to dist/
npm test         # crypto unit tests (vitest): GF(256) KATs, UOV round-trip / forgery-rejection, layered-map forgery
npm run test:a11y  # axe-core WCAG A/AA gate (Playwright)
```

## Tests

`npm test` runs the vitest suite (Playwright e2e specs are excluded):

- **`src/gf256.test.ts`** — GF(2^8) known-answer tests against FIPS-197 reference products (`{57}·{83} = {c1}`, etc.), plus field axioms: commutativity, associativity, distributivity, `a·inv(a) = 1` for every nonzero element.
- **`src/uov.test.ts`** — verifies the trapdoor structure (zero oil×oil block), that `S·Sinv = I`, that the public map really is `F∘S`, sign/verify round-trips across parameter sets, and that verification **rejects** a flipped signature byte, an edited message, an all-zero forgery, and a signature from a different key.

- **`src/layered.test.ts`** — the layered-map toy, checked in both directions: every forgery tried from an exposed public key is accepted by the verifier (60 keys across two shapes) while a changed byte and a different message are rejected; the identical forger gets nothing accepted on 60 keys published with hiding maps, where the honest signer still signs; one central map published both ways gives the two outcomes side by side; the map read off an exposed key equals the secret central map coefficient for coefficient; a singular layer restarts from the first layer. The forger is handed a JSON copy of the public key, so it cannot reach the secret half.
- **`e2e/hiding-maps.spec.ts`** (Playwright) — the same two outcomes on the page at both layer shapes, the model label, the dated status line, each quoted real-case figure, and in-copy link ink under a light system preference.

## Hiding-Maps Exhibit: Sources, Versions and Scope

**What runs is a model.** `src/layered.ts` is a toy written for this lab: a random layered Oil-and-Vinegar map over GF(256) with 12 or 25 variables. It is not Origami. It does not use Origami's field (F16), zones, hidden local algebras, key compression or code, and it reproduces none of Origami's known-answer tests. It shares one structural fact with the real case: the layered map is published in coordinates anyone can compute. The four-layer shape (12 vinegar; 4, 4, 4, 1 oil) is the paper's reading of Origami-128 as a Rainbow-type map, (96; 32, 32, 32, 8), at one-eighth scale (attack paper §8); the field and everything else remain this lab's. Every count and verdict in the exhibit's two cards is measured in the browser on that toy.

**The "not forged" card is not a security claim.** It shows that this forger needs the layer order handed to it. Rainbow had both secret maps and was broken anyway (see *How Rainbow Fell* on the page). The attack paper says restoring the maps to Origami would give "a sparse Rainbow-type construction" still to be assessed against the known Rainbow attacks, and that its authors "do not claim an attack on a hypothetical version with both secret maps" (§8).

**Version targeted.** The round-one Origami submission to the NGCC public-key call, candidate sign-18, Xidian University, specification dated 26 June 2026. The round-one package is `Origami.zip`, SHA-256 `e34f18832e968681dd0c51ce0d4b29d80e01ad29daa83dfb805718b76fdffa80`, as printed in the attack paper (reference [1]) and on the ngcc.dev report page. This lab did not download or open that package. The specification was read from the public mirror `Tongsuo-Project/NGCC-candidates` at commit `1a42dbcc15a086957c5f982a652834449401fa32`, file `sign-18/Algorithm specifications/Origami Algorithm specifications.pdf` (SHA-256 `436569f46829f076141ec52a118b80d5eb8f0a99acbeb627d49e02fa9680e6b3`). **Revision:** the paper records that the designers acknowledged the forgery on the ICCS forum on 24 September 2026 and promised an updated algorithm (§1). No revised specification is described here.

**Status, date-stamped.** As of November 2026, NGCC is in its first round; the ICCS proposal pages list Round 1 candidates only (checked 18 November 2026). Nothing in round one is standardized or deployed.

| Statement on the page | Source |
|---|---|
| Origami composes its central map only with a permutation that is "public because it is derived from the public expansion seed" | Origami specification §2.5.6 |
| "The current construction does not instantiate external input/output linear hiding maps Tin and Tout" | Origami specification §4 (at eq. 77) |
| The stated aim: signing structure kept in the secret key, "a flattened and externally mixed" map published | Origami specification, abstract |
| Origami-128: 128-bit classical and 64-bit quantum security targets; (N, M) = (200, 104) over F16 | Origami specification §3.2, Table 2 |
| The public key "gives an equivalent secret key, allowing signature forgery at about the cost of one verification (about 0.01 s at Origami-128)" | Attack paper, abstract |
| Rebuild the map as the verifier does, undo the public permutation, solve the zones in order | Attack paper §4, Lemma 1 and Algorithm 1 |
| "each main zone is a 32 × 40 solve and the tail an 8 × 8 solve" | Attack paper §4 (cost), Table 1 |
| 300 of 300 forgeries accepted at Origami-128, three negative controls all rejecting; 45/45, 24/24 and 15/15 at the other sets | Attack paper §5, Table 2 |
| "None of the four submitted parameter sets prevents the practical forgery" | Attack paper §8 |
| UOV, MAYO and QR-UOV compute their residual from the secret oil space | Attack paper §8 |
| Designers acknowledged on 24 September 2026 and promised an updated algorithm | Attack paper §1 |
| Finding sign-18-5: design, confirmed, dated 2026-09-24 | [ngcc.dev report sign-18](https://ngcc.dev/reports/sign-18.html), read 18 November 2026 |

The attack paper is H. Louiso, H. Guo, P. Li, P. Pébereau, S. Tao and J. Ding, *A Universal Forgery Attack on the Origami Signature Scheme from the Public Key Alone*, October 2026, [ePrint 2026/2390](https://eprint.iacr.org/2026/2390).

**Not done here.** The attack is not run against Origami-128 itself. A port written from the specification alone could not be checked against the submission: the specification's Table 2 omits the per-zone parameters, which the attack paper takes from the submission's C header (§2), and after listing where the reference code departs from the text the paper concludes that "An implementation written from the text alone would consequently not reproduce the KATs" (§7). The round-one reference code carries no licence, so this lab does not copy from it. A real Origami-128 run, checked against the official known-answer tests, is left as a follow-up that needs either a licence for the reference code or a specification revision that matches it.

---

*Part of the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*

## Research review extension 31 October 2026

R20261031-12: The UOV extension computes offline, online and total costs from the paper's category-V AVX2 example and models one-use secret-state inventory. It does not accelerate the live fresh-vinegar signing path, generate precomputed UOV matrices or recommend historical Rainbow/UOV parameters.
