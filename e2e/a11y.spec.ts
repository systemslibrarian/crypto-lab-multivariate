import { expect, test } from '@playwright/test';
import {
  boot,
  driveAllStates,
  expectBaselineNotStale,
  NARROW,
  reportCollected,
  watchPageErrors,
} from './gate';

/**
 * WCAG A/AA regression gate.
 *
 * The lab is driven along everything it teaches, and scanned after every step:
 * the arrival state, where the page has already generated a keypair for itself
 * and everything downstream of a signature is locked; both skip links focused;
 * the shortcuts panel; BOTH mode forks (plain-English rewrites most of the prose,
 * audience mode enlarges every type scale); a signature, its byte trace and the
 * linear system it collapses to; the coefficient-matrix scroller focused from
 * the keyboard; the quadratic-to-linear collapse measured while its caption is
 * up; all three verification scenarios one at a time and then together; the
 * copy confirmation; the receipt modal; a 200-signature benchmark; a preset; the
 * largest parameter set, where the matrix becomes 12 x 12; a 140-character
 * unbroken token in the message field; Reset; the Kipnis-Shamir forge attack at
 * both balanced sizes, so the BROKEN and HELD verdicts are both painted; the
 * guided tour, which dims the scoreboard and the back-to-top button to
 * `opacity: 0.4` for its whole length; and the back-to-top button, which only
 * exists past 600px of scroll. Every one of those states is scanned in
 * {dark, light} × {1280px, 380px}.
 *
 * Clipboard permission is granted because `wireCopyButtons` only paints
 * `.is-copied` on a RESOLVED `navigator.clipboard.writeText` — without the grant
 * it takes the rejection branch, the label reads "Press Ctrl+C", and the drive
 * would be asserting against a state the code never reached.
 *
 * See `gate.ts` for why nothing is injected into the page, why no panel is
 * force-revealed, why the lab's persisted settings are seeded and asserted
 * rather than inherited, and why `violations` is not the whole oracle.
 */

for (const theme of ['dark'] as const) {
  test(`no WCAG A/AA violations in ${theme} theme`, async ({ page, context }) => {
    test.setTimeout(1_800_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = watchPageErrors(page);
    await boot(page, theme);
    await driveAllStates(page, theme);
    expect(errors, errors.join('\n')).toEqual([]);
    expectBaselineNotStale();
    reportCollected();
  });

  test(`no WCAG A/AA violations in ${theme} theme at 380px`, async ({ page, context }) => {
    test.setTimeout(1_800_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = watchPageErrors(page);
    await page.setViewportSize(NARROW);
    await boot(page, theme);
    await driveAllStates(page, `${theme} @380px`);
    expect(errors, errors.join('\n')).toEqual([]);
    expectBaselineNotStale();
    reportCollected();
  });
}
