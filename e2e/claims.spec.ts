import { expect, test, type Page } from '@playwright/test';

/**
 * Two claims this lab used to make without computing them.
 *
 *  1. The collapse exhibit narrated the quadratic → linear collapse in four
 *     fixed sentences. Every quantity those sentences described was already in
 *     the run's own data, so they must now be counted off the live keypair and
 *     the live signature.
 *  2. The page taught that multivariate trapdoors keep falling to structural
 *     attacks, but never ran one. There is now a computed Kipnis–Shamir key
 *     recovery whose success is decided by the lab's own verifier — and whose
 *     failure against unbalanced parameters is measured the same way, so the
 *     "v > o is the defence" claim is a result rather than an assertion.
 */

async function keygenAndSign(page: Page): Promise<void> {
	await page.locator('#keygen-btn').click();
	await expect(page.locator('#key-status')).not.toContainText('No keypair', { timeout: 30000 });
	await page.locator('#sign-btn').click();
	await expect(page.locator('#trace-out .trace-empty')).toHaveCount(0, { timeout: 30000 });
}

test('the collapse captions report this run, not fixed prose', async ({ page }) => {
	test.setTimeout(120000);
	await page.goto('.');
	await keygenAndSign(page);

	const caption = page.locator('#collapse-caption');
	const seen: string[] = [];
	await page.locator('#collapse-btn').click();
	for (let i = 0; i < 12; i++) {
		const text = (await caption.textContent())?.trim();
		if (text && !seen.includes(text)) seen.push(text);
		if (seen.length >= 4) break;
		await page.waitForTimeout(400);
	}
	const all = seen.join('\n');

	// Phase 1 names the polynomial and the constant its V×V terms collapsed to.
	expect(all).toMatch(/Fix vinegar\. Polynomial #\d+ has \d+ nonzero blue V×V coefficients?/);
	expect(all).toMatch(/collapse to the single constant 0x[0-9a-f]{2}/);
	// Phase 2 prints the actual solved row of A.
	expect(all).toMatch(/folding into the \d+ linear coefficients \[[0-9a-f ]+\]/);
	// Phase 3 is the trapdoor claim, measured on both the secret and public maps.
	expect(all).toMatch(
		/red O×O region of the secret polynomial holds 0 nonzero coefficients out of \d+ slots/,
	);
	expect(all).toMatch(/The same block of the PUBLIC polynomial holds [1-9]\d* —/);
	// Phase 4 re-checks the solve rather than announcing it succeeded.
	expect(all).toMatch(/Gaussian elimination returned oil = \[[0-9a-f ]+\]/);
	expect(all).toContain('recomputing A · oil reproduces rhs exactly');

	// The four hardcoded sentences must be gone.
	expect(all).not.toContain('they collapse into constants.');
	expect(all).not.toContain('Each one becomes a linear coefficient of oil.');
	expect(all).not.toContain('The red O×O region was already zero');
	expect(all).not.toContain('Gaussian-eliminate and signing is done.');
});

test('the Kipnis–Shamir exhibit breaks balanced parameters and fails on unbalanced ones', async ({
	page,
}) => {
	test.setTimeout(180000);
	await page.goto('.');

	// The scale is stated on the page, not just in the source.
	await expect(page.locator('#forge-scale')).toContainText('(v, o) = (68, 44)');

	await page.locator('#forge-btn').click();
	const cards = page.locator('.forge-card');
	await expect(cards).toHaveCount(2, { timeout: 120000 });

	// Positive case — the attack really breaks the balanced scheme, and the
	// lab's own verifier is what says so.
	const balanced = page.locator('.forge-card[data-forge-case="balanced"]');
	await expect(balanced).toContainText('candidate oil subspace of dimension');
	await expect(balanced).toContainText('Every public polynomial vanishes on all');
	await expect(balanced).toContainText("the lab's own verifier ACCEPTED it");
	await expect(balanced.locator('[data-forge-verdict]')).toHaveAttribute(
		'data-forge-verdict',
		'broken',
	);
	await expect(balanced).toContainText('BROKEN.');
	// A forged signature is actually shown, with bytes in it.
	await expect(balanced.locator('#forge-sig-balanced .byte-cell').first()).toBeVisible();

	// Negative case — same code, one parameter changed, measured failure. If
	// this ever flips to "broken", the page's defence claim has stopped holding.
	const unbalanced = page.locator('.forge-card[data-forge-case="unbalanced"]');
	await expect(unbalanced.locator('[data-forge-verdict]')).toHaveAttribute(
		'data-forge-verdict',
		'held',
	);
	await expect(unbalanced).toContainText('HELD.');
	await expect(unbalanced).toContainText('produced no forgery');
	await expect(unbalanced.locator('.forge-stage--bad')).toHaveCount(1);
	await expect(unbalanced.locator('#forge-sig-unbalanced')).toHaveCount(0);
});

/* ── Every element this page hides must actually hide ─────────────────────
 * `[hidden] { display: none }` is a UA rule whose attribute selector has the
 * same specificity (0,1,0) as a class, so any later `.foo { display: … }` beats
 * it. `.ghost-button { display: flex }` did, and #audience-toggle is one of the
 * elements this page sets `hidden` on — so hiding it would have left a
 * clickable control on screen.
 *
 * A first-paint check cannot catch this: #audience-toggle is NOT hidden at
 * first paint. So the assertion is the general property — set `hidden` on each
 * hide target in turn and require it to disappear — rather than a snapshot of
 * whatever happens to be hidden right now.
 */
test('setting hidden actually hides, on every element the page hides', async ({ page }) => {
  await page.goto('.');

  const leaked = await page.evaluate(() => {
    const targets = ['audience-toggle', 'proto-verdict', 'quiz-result', 'setup-verdict'];
    const out: Array<{ id: string; display: string }> = [];
    for (const id of targets) {
      const el = document.getElementById(id);
      if (!el) continue;
      const had = el.hasAttribute('hidden');
      el.setAttribute('hidden', '');
      const display = getComputedStyle(el).display;
      if (!had) el.removeAttribute('hidden');
      if (display !== 'none') out.push({ id, display });
    }
    return out;
  });

  expect(leaked, 'hidden was set but these still compute a display').toEqual([]);
});

/**
 * Moved here from `e2e/a11y.spec.ts` when that file was replaced by the WCAG
 * gate. It is a claims test, not an accessibility one, and it was the only
 * thing in the old spec worth keeping.
 */
test('claim labels match the live tour, comparison, preset, and scoreboard', async ({ page }) => {
  await page.goto('.');
  await expect(page.locator('#tour-start')).toContainText('32-sec demo');
  await expect(page.locator('body')).not.toContainText(/fits in \d+ tweets/);
  await expect(page.locator('body')).not.toContainText('keygen slows visibly');
  await page.locator('#keygen-btn').click();
  await expect(page.locator('#sb-status')).toHaveText('UOV research candidate');
  await expect(page.locator('#verify-bad')).toContainText('Flip one byte');
});

/**
 * The guard for CodeQL js/xss-through-dom (sink src/ui.ts, the receipt card).
 *
 * This one is REFLECTED, not self-inflicted: readUrlState accepts the `m` hash
 * parameter with no validation and writes it straight into the message
 * textarea, so a crafted link supplies the value and the visitor only has to
 * press the lab's own buttons. Before the escape, opening the receipt card put
 * a live element in the page.
 */
test('a message from a crafted link reaches the receipt card as text', async ({ page }) => {
  test.setTimeout(180_000);
  const payload = '<img src=x data-injected=yes>';
  await page.goto('/#m=' + encodeURIComponent(payload));
  await expect(page.locator('#msg')).toHaveValue(payload);

  await page.evaluate(() => {
    (window as unknown as { __seen: number }).__seen = 0;
    new MutationObserver(() => {
      const n = document.querySelectorAll('[data-injected]').length;
      const w = window as unknown as { __seen: number };
      if (n > w.__seen) w.__seen = n;
    }).observe(document.body, { childList: true, subtree: true });
  });

  for (const b of await page.$$('button')) {
    const txt = ((await b.textContent()) || '').toLowerCase();
    if (/generate|keygen|sign|verify/.test(txt)) {
      await b.click().catch(() => {});
      await page.waitForTimeout(700);
    }
  }
  await expect(page.locator('#receipt-btn')).toBeEnabled();
  await page.locator('#receipt-btn').click();
  await expect(page.locator('#result-modal')).toBeVisible();

  // Nothing the payload asked for exists as an element, in the card or anywhere.
  expect(await page.evaluate(() => (window as unknown as { __seen: number }).__seen)).toBe(0);
  await expect(page.locator('[data-injected]')).toHaveCount(0);
  // And it is still shown, verbatim: escaping, not filtering.
  await expect(page.locator('#result-modal')).toContainText(payload);
});
