import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditNonText } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** A phone-width viewport, for the WCAG 1.4.10 reflow half of the gate. */
export const NARROW = { width: 380, height: 800 };

/**
 * Shared machinery for the WCAG gate.
 *
 * Six rules govern everything here, and each one corrects something the
 * `e2e/a11y.spec.ts` this replaces actually did:
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN. `revealAll()` pushed
 *     `animation:none!important; transition:none!important` through
 *     `addStyleTag`, with a comment saying it was to stop "mid-fade states"
 *     producing "phantom contrast failures". That BYPASSED this lab's own
 *     `prefers-reduced-motion` blocks instead of exercising them — and there are
 *     TEN of them, several doing real work an injection cannot reproduce:
 *     `.trapdoor-svg`'s strokes and arrowhead are restored to
 *     `stroke-dashoffset: 0; opacity: 1` (they otherwise only reach their
 *     visible state through an animation), `.size-bar` and `.trace-connector`
 *     are forced to `opacity: 1`, and every `.anatomy-cell` phase animation is
 *     cancelled outright. Three JS paths read the same media query too —
 *     `wireScrollReveal` returns early, `runCollapseAnimation` shortens each
 *     phase to 250ms. `boot` asks for the preference for real and ASSERTS it.
 *
 *  2. IT FORCE-REVEALED EVERYTHING. `revealAll()` opened every `<details>`,
 *     stripped `hidden` from every element that had it, and un-set
 *     `aria-hidden` on `#verify-bad-detail`. That assembles a document no
 *     visitor can reach: the shortcuts panel, the tour caption bar, the replay
 *     hint, the back-to-top button and the benchmark result panel all revealed
 *     at once, several of them empty. This gate never touches `hidden`, `open`
 *     or `aria-hidden`; every panel is reached through the control that reveals
 *     it.
 *
 *  3. IT SCANNED ONCE PER TEST, AT THE END, AT ONE VIEWPORT. Three tests, three
 *     scans, all at 1280px: everything the forge attack and the drive built was
 *     the only thing ever measured, and 380px was never scanned at all. This
 *     drive scans after every step, in {dark, light} × {1280, 380}.
 *
 *  4. `violations` IS NOT THE WHOLE ORACLE. See `scan`. On this page in
 *     particular: almost every surface is a gradient or a `color-mix()` that axe
 *     files under `incomplete` rather than measuring, and an `aria-label` on a
 *     role-less element is PROHIBITED and lands in `incomplete` too, never in
 *     `violations`.
 *
 *  5. IT HAD NO REFLOW, KEYBOARD-SCROLLER OR NON-TEXT ORACLE — and the reflow
 *     one could not have worked anyway, because `body { overflow-x: hidden }`
 *     propagates to the viewport and pins `scrollWidth` to `clientWidth`, so
 *     every reflow question on this page answered "fine" by construction.
 *
 *  6. THE ONE NON-TEXT CHECK IT HAD CONFIRMED ITSELF. `border-contrast.spec.ts`
 *     asserted 3:1 on `'.param-row select, .poly-select-label select'` — the
 *     exact four elements `--control-border` was already applied to, and the
 *     only four. It is deleted; `nontext.ts` supersedes it over every control.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Transitions drain in waves, not in one batch, so a poll for "nothing running
 * right now" can exit through a gap between waves. Require quiescence to hold
 * for several consecutive frames instead.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __quietFrames?: number };
      const running = document.getAnimations().filter((a) => a.playState === 'running');
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      return w.__quietFrames >= 6;
    },
    undefined,
    { timeout: 20_000, polling: 'raf' }
  );
}

/**
 * Assert that reduced motion left the page visible, not merely un-animated.
 *
 * This is the check the old gate's style injection made impossible, and this
 * page is a live example of why it matters. `.trapdoor-svg .td-arrowhead` ships
 * `opacity: 0` and reaches its visible state ONLY through
 * `animation: td-fade … forwards`; `.td-rect` and `.td-arrow` ship
 * `stroke-dashoffset: 800` and are drawn in the same way. Cancel those
 * animations without restoring their end state and the whole figure disappears
 * for every reader who asked for reduced motion. `extra.css` gets it right —
 * its reduced-motion block re-declares `stroke-dashoffset: 0; opacity: 1` — and
 * this assertion is what turns that from a line in a stylesheet into a
 * measurement, in every driven state.
 *
 * `aria-hidden` subtrees are excluded; see the note on `ariaHidden` in
 * `contrast.ts` for what this lab hides and how it was checked.
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      // Deliberately hidden subtrees are not "blank", they are closed.
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/** The SVG figure's strokes and arrowhead, whose only route to visible is an animation. */
async function expectTrapdoorFigureDrawn(page: Page): Promise<void> {
  const figure = await page.evaluate(() => {
    const head = document.querySelector('.trapdoor-svg .td-arrowhead');
    const rect = document.querySelector('.trapdoor-svg .td-rect');
    if (!head || !rect) return { head: 'missing', rect: 'missing' };
    return {
      head: getComputedStyle(head).opacity,
      rect: getComputedStyle(rect).strokeDashoffset,
    };
  });
  expect(
    figure,
    'reduced motion must restore the trapdoor figure, not merely stop drawing it'
  ).toEqual({ head: '1', rect: '0px' });
}

/**
 * Uncaught page errors and console errors, collected from the moment the page
 * is created. A renderer that throws halfway through leaves an earlier state on
 * screen, and a gate that scans that state reports green for a page that is
 * broken. Attach before `boot`, assert after the drive.
 *
 * `main.ts` opens with a deliberate `console.group` self-test that logs at
 * `log` level, not `error`, so nothing here is filtered for it.
 */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/**
 * Exactly one banner landmark: the shared bar.
 *
 * This page declares TWO more. `renderHero()` sets `role="banner"` on
 * `header.hero-panel` explicitly, and nests a second `<header class="cl-hero">`
 * inside it. Both are demoted at load by `index.html`'s `dedupeBanner()` — the
 * explicit one by the `[role="banner"]` sweep, the implicit one by the
 * `<header>` sweep. Asserting the OUTCOME rather than either mechanism means a
 * change to that script and a change to the nesting are both caught.
 */
export async function assertSingleBanner(page: Page): Promise<void> {
  const banners = await page.evaluate(() => {
    const scoped = new Set(['MAIN', 'ARTICLE', 'ASIDE', 'NAV', 'SECTION']);
    const isBanner = (el: Element): boolean => {
      if (el.getAttribute('role') === 'banner') return true;
      if (el.tagName !== 'HEADER') return false;
      if (el.getAttribute('role')) return false; // explicit non-banner role wins
      for (let p = el.parentElement; p; p = p.parentElement) if (scoped.has(p.tagName)) return false;
      return true;
    };
    return [...document.querySelectorAll('header,[role="banner"]')].filter(isBanner).length;
  });
  expect(banners, 'exactly one banner landmark').toBe(1);
}

/**
 * `[hidden]` has specificity (0,1,0) — identical to a class — so ANY later
 * `.foo { display: … }` rule silently beats it and the attribute does nothing.
 * Seven labs in this fleet shipped that bug, and this one fixed it at the root
 * with `[hidden] { display: none !important }`.
 *
 * The fix is not re-derived here, it is MEASURED, because it cannot be settled
 * by reading the CSS — the answer depends on rule order across the whole
 * cascade, and this lab hides elements that carry `display: grid`,
 * `display: flex` and `display: inline-flex` from their own classes. A probe
 * gets each class, gets `hidden`, and its computed `display` is read back.
 */
async function assertHiddenAttributeWorks(page: Page): Promise<void> {
  const leaks = await page.evaluate(() => {
    const out: string[] = [];
    const classes = [
      'ghost-button', // #audience-toggle, #text-mode-toggle — display: inline-flex
      'icon-button', // #share-btn, #shortcuts-btn — display: grid
      'shortcuts-panel',
      'bench-result',
      'linear-system-host',
      'collapse-caption',
      'back-to-top',
      'tour-caption',
      'replay-hint',
      'scoreboard',
      'skip-link',
    ];
    for (const cls of classes) {
      const probe = document.createElement('div');
      probe.className = cls;
      probe.hidden = true;
      probe.textContent = 'probe';
      document.body.append(probe);
      const display = getComputedStyle(probe).display;
      if (display !== 'none') out.push(`.${cls} → display: ${display}`);
      probe.remove();
    }
    return out;
  });
  expect(leaks, '[hidden] must win the cascade for every class this lab hides').toEqual([]);
}

/**
 * A skip link that points at nothing is invisible to axe: its `skip-link` rule
 * is tagged best-practice, not WCAG A/AA, so a `withTags` run never reports it.
 * One repo in this fleet shipped exactly that. This page has TWO skip links, and
 * both targets are built by JavaScript rather than written in `index.html`.
 */
async function assertSkipTargetsExist(page: Page): Promise<void> {
  const dangling = await page.$$eval('a[href^="#"]', (links) =>
    links
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => href.length > 1)
      .filter((href) => !document.getElementById(href.slice(1)))
  );
  expect(dangling, 'every in-page link must point at an element that exists').toEqual([]);
}

/**
 * An explicit `role` on a `<ul>`/`<ol>` REPLACES its implicit `list` role and
 * orphans every `<li>` inside it — a defect a markup grep structurally cannot
 * find when the role is assigned as a JS property, and this lab builds its whole
 * DOM from `innerHTML` template literals where it is equally easy to miss.
 *
 * `role="list"` is the one benign value: redundant, but the same role the
 * element already had. It is allowed WITH a companion assertion, because the
 * redundancy is not free — it makes axe apply `aria-required-children`, which
 * fails the moment such a list is empty. This lab has two of them
 * (`ul.scenario-grid` and, once the attack has run, `ol.forge-stages`), and
 * neither is ever emptied — which is asserted rather than assumed.
 */
async function assertListSemanticsIntact(page: Page): Promise<void> {
  const broken = await page.$$eval('ul[role], ol[role]', (els) =>
    els
      .filter((e) => e.getAttribute('role') !== 'list')
      .map((e) => `${e.tagName.toLowerCase()}[role=${e.getAttribute('role')}]`)
  );
  expect(broken, 'an explicit role on a list deletes its list semantics').toEqual([]);

  const emptyLists = await page.$$eval('[role="list"], ul:not([role]), ol:not([role])', (els) =>
    els
      .filter((e) => (e as HTMLElement).checkVisibility?.())
      .filter((e) => e.querySelectorAll(':scope > li, :scope > [role="listitem"]').length === 0)
      .map((e) => `${e.tagName.toLowerCase()}.${(e.getAttribute('class') ?? '').trim()}`)
  );
  expect(emptyLists, 'a visible list with no items fails aria-required-children').toEqual([]);
}

const DEFAULT_MSG_FRAGMENT = 'For the glory of God';

/**
 * Load the page in a known theme with reduced motion actually in effect, and
 * assert the content every scan relies on is really there — including the lab's
 * DEFAULTS, which are never assumed.
 *
 * `test.use({ reducedMotion })` silently does nothing on Playwright 1.61.1, so
 * the emulation is applied imperatively BEFORE the navigation and then
 * *asserted* from inside the page.
 *
 * FOUR persisted settings are seeded, not three, and that is the point. This lab
 * remembers `theme`, `mv-text-mode-v1`, `mv-audience-mode-v1`, `mv-first-visit`
 * and `mv-tour-done-v1` in `localStorage`, and three of them change what is on
 * screen: plain-English mode rewrites most of the prose, audience mode enlarges
 * every type scale, and the first-visit flag adds a pulsing ring to the keygen
 * button. A gate that let those carry over from whatever the last run left
 * behind would be scanning a configuration nobody chose — and would not be
 * reproducible. Seeding them also pins down a real failure mode: `index.html`'s
 * anti-flash script reads `localStorage.getItem('theme')` and the shared bar's
 * toggle writes the same key, so a drift between them fails here on
 * `data-theme` rather than quietly scanning dark twice.
 *
 * The defaults are asserted at length because this lab does NOT arrive empty:
 * `renderPlayground` queues a `doKeygen()` on a microtask, so a full keypair,
 * fingerprint, message hash and coefficient matrix are already rendered before
 * a visitor touches anything, and the scoreboard un-hides itself off the back of
 * it. Everything downstream of a SIGNATURE, though, ships locked — six buttons
 * disabled, the linear system and benchmark panels absent.
 */
export async function boot(page: Page, theme: 'dark' | 'light'): Promise<void> {
  // A click on a control that never becomes actionable otherwise burns the whole
  // test timeout and reports nothing useful. 20s turns that silent hang into a
  // named failure naming the locator.
  page.setDefaultTimeout(20_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((t) => {
    localStorage.setItem('theme', t);
    localStorage.setItem('mv-text-mode-v1', 'technical');
    localStorage.setItem('mv-audience-mode-v1', 'off');
    localStorage.setItem('mv-demo-seen-v1', '1');
    localStorage.setItem('mv-tour-done-v1', '1');
  }, theme);
  await page.goto('.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect'
  ).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('html')).toHaveAttribute('data-text-mode', 'technical');
  await expect(page.locator('html')).toHaveAttribute('data-audience', 'off');
  await assertSingleBanner(page);
  await assertHiddenAttributeWorks(page);
  await assertSkipTargetsExist(page);

  // Everything below `#app` is built by `src/ui.ts`, so a navigation that
  // resolves proves nothing.
  await expect(page.locator('h1.cl-hero-title')).toContainText('Oil');
  await expect(page.locator('main#main-content > section.lab-section')).toHaveCount(6);

  // ── The keypair the page generates for itself, before any interaction ────
  await expect(page.locator('#key-status')).toContainText('Keypair ready');
  await expect(page.locator('#pk-fingerprint .byte-grid .byte-cell')).toHaveCount(12);
  await expect(page.locator('#target-byte-grid .byte-cell')).toHaveCount(3);
  await expect(page.locator('.anatomy-matrix')).toBeVisible();
  // The sticky scoreboard un-hides itself off the back of that first keygen —
  // but only above 1200px, where `extra.css` stops applying `display: none` to
  // it. Both halves are asserted, because "it is not on screen" and "it is on
  // screen but empty" are different states and only one of them is correct at
  // each width.
  await expect(page.locator('#scoreboard')).not.toHaveAttribute('hidden', '');
  await expect(page.locator('#sb-status')).toHaveText('UOV research candidate');
  const wide = (page.viewportSize()?.width ?? 0) >= 1200;
  if (wide) await expect(page.locator('#scoreboard')).toBeVisible();
  else await expect(page.locator('#scoreboard')).toBeHidden();

  // ── Shipped control defaults ────────────────────────────────────────────
  await expect(page.locator('#vsel')).toHaveValue('6');
  await expect(page.locator('#osel')).toHaveValue('3');
  await expect(page.locator('#msg')).toHaveValue(new RegExp(DEFAULT_MSG_FRAGMENT));
  await expect(page.locator('#forge-m')).toHaveValue('3');
  await expect(page.locator('#poly-select option')).toHaveCount(3);
  await expect(page.locator('#text-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#audience-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#shortcuts-btn')).toHaveAttribute('aria-expanded', 'false');

  // ── Nothing downstream of a signature exists yet ────────────────────────
  await expect(page.locator('#sign-btn')).toBeEnabled();
  await expect(page.locator('#keygen-btn')).toBeEnabled();
  await expect(page.locator('#collapse-btn')).toBeEnabled();
  for (const sel of ['#verify-ok', '#verify-bad', '#verify-msg', '#verify-all-btn', '#receipt-btn']) {
    await expect(page.locator(sel)).toBeDisabled();
  }
  await expect(page.locator('#trace-out .trace-empty')).toBeVisible();
  await expect(page.locator('#linear-system')).toBeHidden();
  await expect(page.locator('#bench-result')).toBeHidden();
  await expect(page.locator('#collapse-caption')).toBeHidden();
  await expect(page.locator('#shortcuts-panel')).toBeHidden();
  await expect(page.locator('.tour-caption')).toBeHidden();
  await expect(page.locator('.replay-hint')).toBeHidden();
  await expect(page.locator('.back-to-top')).toBeHidden();
  await expect(page.locator('#result-modal')).toHaveCount(0);
  await expect(page.locator('.forge-card')).toHaveCount(0);
  await expect(page.locator('.scenario-card .scenario-status--pending')).toHaveCount(3);

  await settle(page);
  await expectTrapdoorFigureDrawn(page);
  await expectNotBlank(page, `${theme} first paint`);
}

/**
 * Assert the page does not require horizontal scrolling.
 *
 * WCAG 1.4.10 (Reflow, AA). axe has no rule for this at all, and until this
 * sweep the question could not even be ASKED on this page: `body` carried
 * `overflow-x: hidden`, which propagates to the viewport, so
 * `documentElement.scrollWidth` was pinned equal to `clientWidth` and any
 * overflow check answered "fine" by construction. That declaration is gone, and
 * this is what replaced it.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;

    // Only elements that actually push the DOCUMENT sideways are culprits. A
    // wide box inside an `overflow-x: auto` wrapper has a huge bounding rect but
    // is clipped by its scroller and contributes nothing to the document's
    // scroll width — naming it sends you off fixing the wrong element. This page
    // is full of such decoys: the coefficient matrix inside `.anatomy-scroller`
    // is wider than the viewport by design at every parameter setting.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement;
      while (n && n !== doc) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };

    const over = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right);
    const widest = over.filter((x) => !clipped(x.el))[0] ?? over[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${clipped(widest.el) ? '[clipped] ' : ''}${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1). If
 * it holds no focusable content it needs `tabindex="0"`, so it becomes a focus
 * target arrow keys can then scroll.
 *
 * The one this lab already gets right is `.anatomy-scroller`, which is written
 * with `tabindex="0"`, `role="group"` and an `aria-label` — and it matters,
 * because the coefficient matrix inside it is the exhibit the whole trapdoor
 * argument rests on. This assertion is what keeps that true and what catches
 * the next scroller added without one, including any that only starts
 * overflowing at 380px or at v = 8.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return (
          ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY)
        );
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`
      );
  });
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`
  ).toEqual([]);
}

/**
 * When `A11Y_COLLECT` is set, `scan` records failures instead of throwing.
 *
 * A strict gate reports the first failing assertion in the first failing state
 * and stops, so a page with defects in several states needs one full run per
 * defect to enumerate them. The collection pass turns that into a single run. It
 * is a debugging aid only: `A11Y_COLLECT` is never set in CI or in the committed
 * workflow, and a run with it set prints every finding as it happens and then
 * FAILS at the end, so a green collection run cannot be mistaken for a green
 * gate.
 */
const COLLECTING = !!process.env.A11Y_COLLECT;
const collected: string[] = [];

function record(entry: string): void {
  collected.push(entry);
  // Printed as it happens, not only at the end: a hard assertion later in the
  // drive would otherwise abort the test before anything collected so far was
  // ever shown.
  console.log(`\n[A11Y_COLLECT #${collected.length}] ${entry}`);
}

export function softExpect(actual: unknown, message: string, expected: unknown): void {
  if (!COLLECTING) {
    expect(actual, message).toEqual(expected);
    return;
  }
  try {
    expect(actual, message).toEqual(expected);
  } catch {
    record(`${message}\n  ${JSON.stringify(actual, null, 2)}`);
  }
}

/**
 * Fail the test if the collection pass recorded anything. Without this a
 * collection run would end green, and a green collection run is
 * indistinguishable from a green gate — which is the exact confusion the whole
 * exercise exists to remove.
 */
export function reportCollected(): void {
  if (!COLLECTING) return;
  expect(collected, `A11Y_COLLECT recorded ${collected.length} failure(s)`).toEqual([]);
}

async function softly(
  fn: (page: Page, label: string) => Promise<void>,
  page: Page,
  label: string
): Promise<void> {
  if (!COLLECTING) return fn(page, label);
  try {
    await fn(page, label);
  } catch (e) {
    record(String(e).slice(0, 4000));
  }
}

/**
 * WCAG 1.4.11 and generated content, ratcheted against a per-repo baseline.
 *
 * Neither class has ANY other oracle inside `<main>`: axe has no rule for
 * non-text contrast, and the arithmetic text walk cannot reach a control's
 * boundary or a `::before` glyph, because a pseudo-element is not an element and
 * owns no text node.
 *
 * This is called from `scan()`, at every driven state. That placement is the
 * repair of a bug that made the identical check DEAD fleet-wide: it used to be
 * called from inside `expectScrollersReachableSoft`, AFTER that function's
 * `if (!COLLECTING) return …` guard, so in a strict run — which is every run in
 * CI and every run anyone reads as a pass — it never executed at all, and the
 * baselines it "verified" had been captured by a check that never looked.
 *
 * It ratchets rather than blocking on a backlog: anything NOT in the baseline
 * fails, anything in the baseline that got WORSE fails, and anything in the
 * baseline that has been FIXED fails until its entry is deleted. That last rule
 * is what stops the allowlist becoming a permanent exemption.
 */
const nonTextSeen = new Set<string>();

export async function expectNoNewNonTextFailures(page: Page, label: string): Promise<void> {
  const found = await auditNonText(page);
  // Capture mode: emit every finding and assert nothing, so a baseline can be
  // generated by the SAME path that checks it. Opt-in via env, and a capture run
  // is left failing by `expectBaselineNotStale` so it cannot be mistaken for a
  // passing gate.
  if (process.env.NT_BASELINE_CAPTURE) {
    for (const f of found) {
      console.log(`NTCAP|${f.kind}|${f.selector}|${f.ratio}|${f.required}|${/POSITIONED/.test(f.detail)}`);
    }
    return;
  }
  const problems: string[] = [];
  for (const f of found) {
    const key = `${f.kind}|${f.selector}`;
    nonTextSeen.add(key);
    const base = NONTEXT_BASELINE[key];
    if (!base) {
      problems.push(`NEW ${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`);
    } else if (f.ratio < base.ratio - 0.01) {
      problems.push(`WORSE ${f.selector}: ${f.ratio}:1, baseline recorded ${base.ratio}:1`);
    }
  }
  expect(problems, `new or worsened non-text contrast in state: ${label}`).toEqual([]);
}

/**
 * Fail if a baselined finding never appeared during the whole drive.
 *
 * It has either been fixed — in which case delete the entry, which is the point
 * — or the drive stopped reaching the state that shows it, which is a coverage
 * regression worth knowing about. Call once, after `driveAllStates`.
 */
export function expectBaselineNotStale(): void {
  const unseen = Object.keys(NONTEXT_BASELINE).filter((k) => !nonTextSeen.has(k));
  expect(
    unseen,
    'baselined non-text findings that no longer appear — delete them from nontext-baseline.ts (or restore the drive state that showed them)'
  ).toEqual([]);
}

/**
 * Scan the page as it currently stands.
 *
 * Eight assertions, because axe's `violations` array alone is not a complete
 * oracle:
 *
 *  - reduced-motion end state — see `expectNotBlank`.
 *  - `violations` — the usual WCAG A/AA rule failures, plus four landmark
 *    best-practice rules `withTags` does not run on its own.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. The one rule id allowed to remain incomplete is
 *    `color-contrast`, and only because the next assertion computes those ratios
 *    arithmetically — which matters more here than in most labs, since nearly
 *    every surface on the page is a gradient or a `color-mix()`. Everything else
 *    in that bucket is a real result axe simply could not finish — including
 *    `aria-prohibited-attr`, which is where an `aria-label` on a role-less
 *    element hides, a defect that never reaches the violations array at all.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node.
 *  - non-text contrast — SC 1.4.11, which axe has no rule for, over every
 *    control on the page including the shared bar, ratcheted against
 *    `nontext-baseline.ts`. There is ONE such oracle, not two: an earlier
 *    version of this gate also carried a `backgroundColor`-only boundary check,
 *    and on this page that check fabricated a flat 1:1 for every
 *    gradient-filled `.action-button` and resolved every backdrop to WHITE,
 *    because `:root`'s background is a gradient and every panel above it is
 *    translucent. Its one real idea — that a border must clear 3:1 against the
 *    control's own fill as well as against the surround — was moved into
 *    `nontext.ts`, whose paint core samples gradients.
 *  - list semantics — see `assertListSemanticsIntact`.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);
  // TWO axe runs, deliberately, and this is not a style choice.
  //
  // `AxeBuilder.withTags()` and `AxeBuilder.withRules()` both write the same
  // `options.runOnly` field, so the second call SILENTLY REPLACES the first —
  // the axe-core/playwright source says so in as many words on `withRules`
  // ("Cannot be used with AxeBuilder#withTags"). Chained as
  // `.withTags(TAGS).withRules([...4 landmark rules])`, axe therefore runs those
  // FOUR best-practice rules and NOT ONE WCAG RULE, while a green result reads
  // exactly like a full A/AA pass. For scale, `withTags(TAGS)` selects 69 of
  // axe-core 4.12's 105 rule definitions; the chained form executes 4.
  //
  // Running the two sets separately and merging is the only way to have both.
  // The landmark four are still wanted because they are best-practice rather
  // than WCAG-tagged, so `withTags` alone does not reach them, and this page has
  // exactly the shape they catch: a shared sticky <header role="banner">, a
  // second <header role="banner"> declared by the hero with a third nested
  // inside it, and two <aside>s in the hero plus a third appended to <body>.
  const wcag = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const landmarks = await new AxeBuilder({ page })
    .withRules([
      'landmark-no-duplicate-banner',
      'landmark-unique',
      'landmark-one-main',
      'landmark-complementary-is-top-level',
    ])
    .analyze();
  const results = {
    violations: [...wcag.violations, ...landmarks.violations],
    incomplete: [...wcag.incomplete, ...landmarks.incomplete],
  };

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  softExpect(violations, `axe violations in state: ${label}`, []);

  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  softExpect(unexplainedIncomplete, `axe incomplete results in state: ${label}`, []);

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  softExpect(contrast, `measured contrast failures in state: ${label}`, []);

  await softly(expectNoNewNonTextFailures, page, label);
  await softly(assertListSemanticsIntact, page, label);
  await softly(expectScrollersReachable, page, label);
  await softly(expectNoHorizontalOverflow, page, label);
}

/**
 * A contrast-only pass for a state that is genuinely short-lived, with a proof
 * that the state was still on screen when the measurement finished.
 *
 * The collapse walkthrough advances every 250ms under the reduced motion this
 * gate asserts, which is shorter than a full `scan()`. Measuring it with `scan`
 * would produce a result about whichever phase happened to be live when axe got
 * round to it — and a sometimes-measured assertion is worse than none. This runs
 * only the two fast arithmetic oracles (one `page.evaluate` each) and then
 * re-checks `stillTrue`, so the reading either describes the state in its label
 * or fails outright.
 */
async function scanTransient(
  page: Page,
  label: string,
  stillTrue: () => Promise<boolean>
): Promise<void> {
  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  await softly(expectNoNewNonTextFailures, page, label);
  expect(
    await stillTrue(),
    `the transient state "${label}" ended before its measurement finished — the reading describes nothing`
  ).toBe(true);
  softExpect(contrast, `measured contrast failures in state: ${label}`, []);
}

// ── The drive ───────────────────────────────────────────────────────────────

/**
 * Move focus with a REAL Tab press, then hand it to `target`.
 *
 * Chromium only applies `:focus-visible` styling after a keyboard interaction,
 * so a programmatic `.focus()` on a freshly-loaded page matches `:focus` but NOT
 * `:focus-visible` — and every focus indicator in this lab is written
 * `:focus-visible`. A gate that focused programmatically would find no visible
 * indicator on any of them and invent one 2.4.7 defect per focusable region.
 * Priming with a genuine `page.keyboard.press('Tab')` puts the browser into
 * keyboard mode for the rest of the document's life, which is the mode a
 * keyboard user is in; the assertion below is what proves it worked rather than
 * assuming it.
 */
async function focusByKeyboard(page: Page, selector: string, prime = true): Promise<void> {
  // `prime: false` is for controls that only exist BECAUSE of the current scroll
  // position. Tabbing from a blurred document lands on the skip link, and
  // Chromium scrolls it into view — which returns the page to the top and makes
  // `.back-to-top` hide itself again, mid-drive. Keyboard mode is sticky for the
  // life of the document, so once the drive has pressed a real Tab it stays in
  // it; the `:focus-visible` assertion below is what proves that rather than
  // assuming it, and fails loudly if the priming were ever lost.
  if (prime) {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    await page.keyboard.press('Tab');
  }
  await page.locator(selector).focus();
  await expect(page.locator(selector)).toBeFocused();
  expect(
    await page.locator(selector).evaluate((el) => el.matches(':focus-visible')),
    `${selector} must match :focus-visible after a real keyboard interaction`
  ).toBe(true);
}

/** Sign the current message, waiting on the trace the signer itself renders. */
async function signOnce(page: Page): Promise<void> {
  await page.locator('#sign-btn').click();
  await expect(page.locator('#trace-signature .byte-cell').first()).toBeVisible();
  await expect(page.locator('#linear-system')).toBeVisible();
  for (const sel of ['#verify-ok', '#verify-bad', '#verify-msg', '#verify-all-btn', '#receipt-btn']) {
    await expect(page.locator(sel)).toBeEnabled();
  }
  // The FIRST sign of a session schedules the collapse walkthrough 350ms later.
  // Wait it out rather than scanning into it: `#collapse-btn` disables itself
  // for the run and re-enables at the end, which is the exhibit's own signal.
  await expect(page.locator('#collapse-btn')).toBeEnabled({ timeout: 15_000 });
  await expect(page.locator('#collapse-caption')).toBeHidden();
}

/**
 * Drive the lab through the states that render content, scanning each.
 *
 * Seven things shape this drive:
 *
 *  - THE ARRIVAL STATE IS SCANNED FIRST, AND IT IS NOT EMPTY. A keypair, a
 *    fingerprint, a message hash and the whole coefficient matrix are already on
 *    screen before a visitor touches anything, because `renderPlayground` queues
 *    its own `doKeygen()`. Everything downstream of a signature is locked. The
 *    gate this replaces force-revealed every hidden panel before its only scan,
 *    so neither half was ever measured as a reader meets it.
 *
 *  - BOTH BRANCHES OF EVERY MODE FORK. Plain-English mode rewrites most of the
 *    prose on the page and audience mode enlarges every type scale; the old
 *    spec had one audience-mode test at one viewport in one theme and no
 *    plain-English coverage at all. Both are toggled on and off inside every
 *    configuration.
 *
 *  - THE PARAMETER EXTREMES, NOT JUST THE DEFAULTS. v = 8, o = 4 is the only
 *    setting that makes the coefficient matrix 12 x 12, which is the only state
 *    where `.anatomy-scroller` genuinely overflows at desktop width — and
 *    therefore the only state where its 2.1.1 keyboard question is answerable.
 *
 *  - EVERY VERDICT INK. The three verification scenarios are driven separately
 *    and then together, so `--valid` and `--invalid` are both painted; the forge
 *    attack is run at both balanced sizes, so `.forge-verdict--broken` and
 *    `.forge-verdict--held` are both rendered, along with a `.forge-stage--bad`
 *    row that only exists when the attack fails.
 *
 *  - THE STATES THAT ONLY EXIST OVER TIME. The 1.6s `.is-copied` flash, the
 *    guided tour's dimmed-page mode (`.is-tour-running` drops the scoreboard and
 *    the back-to-top button to `opacity: 0.4`), the replay hint that only
 *    appears after the tour completes, the result-card modal, and the
 *    back-to-top button that only un-hides past 600px of scroll.
 *
 *  - THE COLLAPSE WALKTHROUGH IS MEASURED, NOT SKIPPED. Under the reduced motion
 *    this gate asserts, `extra.css` cancels every `.anatomy-cell` phase
 *    animation, so phases 1-3 are visually identical to the resting matrix and
 *    the only thing that changes is `#collapse-caption`. That caption is
 *    measured while it is up, with a proof it was still up when the measurement
 *    finished. Phase 4 additionally applies a CSS `filter`, which NO oracle can
 *    see; it is measured by hand from screenshot pixels — see the note on that
 *    rule in `extra.css`.
 *
 *  - NO FIXED TIMEOUTS. Every step has a DOM completion signal — a byte count, a
 *    button returning from `disabled`, a verdict class, a panel un-hiding — and
 *    the drive waits on those.
 */
export async function driveAllStates(page: Page, theme: string): Promise<void> {
  const scanAt = (s: string): Promise<void> => scan(page, `${theme} / ${s}`);

  await scanAt('first paint: keypair auto-generated, everything downstream of a signature locked');

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Tab');
  await expect(page.locator('a.cl-skip-link')).toBeFocused();
  await scanAt('shared-header skip link focused');
  // This lab's own two skip links sit AFTER the whole shared header in DOM
  // order, so they are several tabs away rather than one; reach the first
  // directly, keyboard-primed, instead of guessing at a tab count that the
  // shared bar owns.
  await focusByKeyboard(page, 'a.skip-link >> nth=0');
  await scanAt("this lab's own skip link focused");

  // ── The shortcuts panel ─────────────────────────────────────────────────
  await page.locator('#shortcuts-btn').click();
  await expect(page.locator('#shortcuts-panel')).toBeVisible();
  await expect(page.locator('#shortcuts-btn')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#shortcuts-panel li')).toHaveCount(11);
  await scanAt('keyboard shortcuts panel open');
  await page.locator('[data-close-shortcuts]').click();
  await expect(page.locator('#shortcuts-panel')).toBeHidden();

  // ── Both mode forks ─────────────────────────────────────────────────────
  await page.locator('#text-mode-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-text-mode', 'plain');
  await expect(page.locator('#text-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await scanAt('plain-English mode: most of the prose on the page is different copy');
  await page.locator('#text-mode-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-text-mode', 'technical');

  await page.locator('#audience-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-audience', 'on');
  await scanAt('audience mode: every type scale enlarged for projection');
  await page.locator('#audience-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-audience', 'off');

  // ── Sign, and the collapse walkthrough the first sign triggers ──────────
  await signOnce(page);
  await scanAt('signed: vinegar guess, solved oil, signature bytes and the linear system');

  await focusByKeyboard(page, '.anatomy-scroller');
  await scanAt('the coefficient-matrix scroller focused from the keyboard');

  // Re-run the collapse deliberately, and measure the caption while it is up.
  await page.locator('#collapse-btn').click();
  await expect(page.locator('#collapse-caption')).toBeVisible();
  await expect(page.locator('#collapse-caption')).not.toBeEmpty();
  await scanTransient(page, 'the quadratic-to-linear collapse, caption live', async () =>
    page.locator('#collapse-caption').isVisible()
  );
  await expect(page.locator('#collapse-btn')).toBeEnabled({ timeout: 15_000 });
  await expect(page.locator('#collapse-caption')).toBeHidden();
  await scanAt('the collapse walkthrough finished and the matrix back at rest');

  // ── The three verification scenarios, one at a time then together ───────
  await page.locator('#verify-ok').click();
  await expect(page.locator('#verify-ok-status')).toHaveClass(/scenario-status--valid/);
  await expect(page.locator('#verify-ok-status')).toContainText('Valid');
  await scanAt('valid signature verified: the only state that paints the valid ink');

  await page.locator('#verify-bad').click();
  await expect(page.locator('#verify-bad-status')).toHaveClass(/scenario-status--invalid/);
  await expect(page.locator('#verify-bad-detail .byte-cell--tampered')).toHaveCount(1);
  await expect(page.locator('#verify-bad-detail')).toHaveAttribute('aria-hidden', 'false');
  await scanAt('one signature byte flipped and rejected, with the tampered cell marked');

  await page.locator('#verify-msg').click();
  await expect(page.locator('#verify-msg-status')).toHaveClass(/scenario-status--invalid/);
  await scanAt('the message edited and the old signature rejected');

  await page.locator('#verify-all-btn').click();
  await expect(page.locator('.scenario-card .scenario-status--pending')).toHaveCount(0);
  await scanAt('all three scenarios run together');

  // ── The copy affordance, and its 1.6s confirmation ──────────────────────
  const copyBtn = page.locator('.trace-actions .copy-button');
  await copyBtn.click();
  await expect(copyBtn).toHaveClass(/is-copied/);
  await expect(copyBtn.locator('.copy-button__label')).toHaveText('Copied');
  await scanAt('a copy button showing its confirmation state');
  await expect(copyBtn).not.toHaveClass(/is-copied/, { timeout: 8_000 });

  // ── The result-card modal ───────────────────────────────────────────────
  await page.locator('#receipt-btn').click();
  await expect(page.locator('#result-modal')).toBeVisible();
  await expect(page.locator('#result-modal-title')).toBeVisible();
  await scanAt('the signature receipt modal open over the page');
  await page.keyboard.press('Escape');
  await expect(page.locator('#result-modal')).toHaveCount(0);

  // ── The benchmark ───────────────────────────────────────────────────────
  await page.locator('#bench-btn').click();
  await expect(page.locator('.bench-grid')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.bench-stat')).toHaveCount(6);
  await expect(page.locator('#sign-btn')).toBeEnabled();
  await scanAt('benchmark over 200 signatures reported');

  // ── A preset, which is a keygen + sign + verify-all in one click ────────
  const presets = page.locator('[data-preset]');
  await expect(presets).not.toHaveCount(0);
  await presets.first().click();
  await expect(page.locator('#preset-caption')).not.toBeEmpty();
  await expect(page.locator('[data-preset].is-active')).toHaveCount(1);
  await expect(page.locator('#key-status')).toContainText('Keypair ready');
  await scanAt('a preset applied, with its caption');

  // ── The parameter extreme: v = 8, o = 4 makes the matrix 12 x 12 ───────
  await page.selectOption('#vsel', '8');
  await expect(page.locator('#key-status')).toContainText('n = 11 variables');
  await page.selectOption('#osel', '4');
  await expect(page.locator('#key-status')).toContainText('n = 12 variables');
  await expect(page.locator('#poly-select option')).toHaveCount(4);
  await expect(page.locator('#target-byte-grid .byte-cell')).toHaveCount(4);
  await scanAt('the largest parameter set: a 12-variable map and a 12 x 12 matrix');

  await page.selectOption('#poly-select', '3');
  await expect(page.locator('.anatomy-matrix')).toBeVisible();
  await scanAt('the fourth central polynomial inspected');

  await signOnce(page);
  await scanAt('signed at v = 8, o = 4');

  // ── A long unbreakable token in the message field ──────────────────────
  await page.locator('#msg').fill('a'.repeat(140));
  await expect(page.locator('#target-byte-grid .byte-cell')).toHaveCount(4);
  await scanAt('a 140-character unbroken token typed into the message field');

  await page.locator('#reset-btn').click();
  await expect(page.locator('#msg')).toHaveValue(new RegExp(DEFAULT_MSG_FRAGMENT));
  await expect(page.locator('#vsel')).toHaveValue('6');
  await expect(page.locator('#key-status')).toContainText('n = 9 variables');
  await expect(page.locator('#verify-ok')).toBeDisabled();
  await scanAt('reset back to the shipped defaults, verification locked again');

  // ── The attacker's half: both balanced sizes ───────────────────────────
  await page.locator('#forge-btn').click();
  await expect(page.locator('.forge-card')).toHaveCount(2, { timeout: 120_000 });
  await expect(page.locator('#forge-btn')).toBeEnabled();
  await expect(page.locator('.forge-stage')).not.toHaveCount(0);
  await expect(page.locator('[data-forge-case="balanced"] .forge-verdict')).toBeVisible();
  await expect(page.locator('[data-forge-case="unbalanced"] .forge-verdict')).toBeVisible();
  await scanAt('the Kipnis-Shamir attack run at v = o = 3, both verdicts rendered');

  await page.selectOption('#forge-m', '4');
  await page.locator('#forge-btn').click();
  await expect(page.locator('.forge-card')).toHaveCount(2, { timeout: 120_000 });
  await expect(page.locator('#forge-btn')).toBeEnabled();
  await scanAt('the same attack at v = o = 4');

  // ── The guided tour: a whole-page mode that dims two fixed elements ─────
  await page.locator('#tour-start').click();
  await expect(page.locator('.tour-caption')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/is-tour-running/);
  await expect(page.locator('#tour-text')).not.toBeEmpty();
  await expect(page.locator('.is-tour-target')).toHaveCount(1);
  await scanAt('the guided tour running: the page dimmed behind its caption bar');

  await page.locator('[data-tour="next"]').click();
  await expect(page.locator('#tour-step-counter')).not.toHaveText('1 / 11');
  await scanAt('the guided tour stepped forward by hand');

  await page.locator('[data-tour="exit"]').click();
  await expect(page.locator('.tour-caption')).toBeHidden();
  await expect(page.locator('html')).not.toHaveClass(/is-tour-running/);
  await scanAt('the guided tour exited and the page restored');

  // ── The back-to-top button, which only exists past 600px of scroll ─────
  await page.evaluate(() => window.scrollTo(0, 1200));
  await expect(page.locator('.back-to-top')).toBeVisible();
  await scanAt('scrolled deep, with the back-to-top button revealed');
  // Reached by REAL tabbing, from the last control inside `#app`. Two things
  // rule out the simpler routes: `.back-to-top` only exists while the page is
  // scrolled past 600px, so tabbing from a blurred document would land on the
  // skip link, scroll to the top and un-render the button mid-drive; and a
  // programmatic `.focus()` would not match `:focus-visible` here, because the
  // most recent user interaction was the mouse click that exited the tour, which
  // takes Chromium out of keyboard modality. That is not a subtlety to route
  // around — it is the exact way a gate invents a phantom 2.4.7 defect for every
  // focusable region it probes.
  await page.locator('#app a[href], #app button:not([disabled])').last().focus();
  for (let i = 0; i < 8 && !(await page.locator('.back-to-top').evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(page.locator('.back-to-top')).toBeFocused();
  expect(
    await page.evaluate(() => window.scrollY),
    'the drive must still be scrolled past the back-to-top threshold'
  ).toBeGreaterThan(600);
  expect(
    await page.locator('.back-to-top').evaluate((el) => el.matches(':focus-visible')),
    '.back-to-top must match :focus-visible after a real keyboard interaction'
  ).toBe(true);
  await scanAt('the back-to-top button focused from the keyboard');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('.back-to-top')).toBeHidden();
}
