/**
 * Known WCAG 1.4.11 / generated-content findings in this lab, captured through
 * the gate's own path so the baseline and the check cannot disagree.
 *
 * THIS FILE IS A TO-DO LIST, NOT A SET OF EXEMPTIONS. The gate ratchets on it:
 *   - a finding NOT listed here fails the run, so a regression cannot land;
 *   - a listed finding whose ratio gets WORSE fails, so the list cannot rot;
 *   - a listed finding that no longer appears ALSO fails, so a fixed entry must
 *     be deleted and the file can only shrink toward empty.
 * The last rule is what stops an allowlist becoming a permanent exemption.
 *
 * `unverified: true` marks an absolutely-positioned pseudo-element. It can paint
 * outside its host and the oracle measures it against the host's backdrop, so
 * that ratio is NOT trustworthy — hand-measure before acting on it.
 */
export const NONTEXT_BASELINE: Record<
  string,
  { ratio: number; required: number; unverified: boolean }
> = {
  // What the live oracle finds across {dark, light} × {1280, 380} and every
  // state this drive builds is exactly these two — both in the SHARED Crypto Lab
  // top bar, and neither one this repo's to fix. Everything inside `#app`, the
  // hero, the fixed scoreboard, the tour caption and the footer is audited with
  // no exemption and comes back clean.
  //
  // `.cl-btn` draws its edge as
  // `1px solid color-mix(in srgb, var(--accent, #35d6bb) 38%, transparent)`
  // over the bar's fixed `#0b1512`. The ratio is ACCENT-DEPENDENT, which is the
  // part worth reporting upward: this lab's `--accent` is `#0b6f96` in light and
  // `#5ccff8` in dark, giving 1.45:1 and 2.51:1 off the SAME markup. Two lines
  // above that border the same stylesheet already handles this case for TEXT —
  // `--cl-ink` is `color-mix(in srgb, var(--accent) 60%, #eafff8)`, with a
  // comment saying it mixes toward near-white "so contrast stays >=4.5:1 on the
  // bar even when a lab's accent is dark". The BORDER got no such correction, so
  // the shared bar's SC 1.4.11 gap is worst in exactly the labs whose brand
  // colour is dark — and it is theme-dependent within a single lab.
  //
  // The recorded ratio is the WORSE of the two, so the ratchet still fails on any
  // regression in either theme. `CLAUDE.md` is explicit that a change every lab
  // should get is a reviewed fleet-wide pass and never an overwrite driven from
  // one repo, so it is measured here, ratcheted here, and reported up.
  'control-boundary|a.cl-btn': { ratio: 1.45, required: 3, unverified: false },
  'control-boundary|button#cl-theme-toggle.cl-btn.cl-icon': {
    ratio: 1.45,
    required: 3,
    unverified: false,
  },
};
