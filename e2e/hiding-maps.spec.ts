import { expect, test, type Page } from '@playwright/test';
import { assertThisLab } from './identity';

/**
 * The hiding-maps exhibit: one layered central map, published two ways.
 *
 * Three things are claimed on the page and each is checked here, in both
 * directions:
 *
 *  1. Published with only a public permutation, the map is forged from the
 *     public key alone, and the lab's ordinary verifier is what says so.
 *  2. Published with secret hiding maps, the SAME forger gets nothing accepted,
 *     while the honest signer still signs. A page that only showed (1) would be
 *     satisfied by a verifier that accepts everything.
 *  3. The exhibit is a labelled model of a real, cited case, and the figures
 *     quoted for the real case are the ones in the cited sources.
 */

async function run(page: Page, shape?: string): Promise<void> {
	if (shape) await page.selectOption('#hiding-shape', shape);
	await page.locator('#hiding-btn').click();
	await expect(page.locator('.hiding-card')).toHaveCount(2, { timeout: 60_000 });
	await expect(page.locator('#hiding-btn')).toBeEnabled();
}

test('the model label, the real-case figures and the dated status line are on the page', async ({ page }) => {
	await assertThisLab(page, '.');
	const section = page.locator('#hiding-maps');
	await expect(section.locator('h2')).toHaveText('A Layered Map With the Hiding Maps Left Out');

	// Labelled as modelled, and as not being the real scheme.
	const model = page.locator('#hiding-model');
	for (const text of ['Modelled, at toy scale', 'It is not Origami', 'none of its test vectors', 'not run in this lab']) {
		await expect(model).toContainText(text);
	}

	// The figures quoted for the real case, each as printed in its source.
	for (const text of [
		'dated 26 June 2026',
		'public because it is derived from the public expansion seed',
		'does not instantiate external input/output linear hiding maps',
		'about 0.01 s at Origami-128',
		'200 variables and 104 equations',
		'each main zone is a 32 × 40 solve and the tail an 8 × 8 solve',
		'300 of 300 forgeries at Origami-128',
	]) {
		await expect(section).toContainText(text);
	}

	// The security level is stated, and stated to be beside the point.
	const structural = page.locator('#hiding-structural');
	await expect(structural).toContainText('128-bit classical and a 64-bit quantum security target');
	await expect(structural).toContainText('This is not a parameter problem');
	await expect(structural).toContainText('uses no quantum computer');

	// "Not forged" is scoped, so it cannot be read as a security claim.
	await expect(page.locator('#hiding-held-scope')).toContainText('It is not a claim that a layered map with hiding maps is secure');
	await expect(page.locator('#hiding-held-scope')).toContainText('do not claim an attack on a hypothetical version with both secret maps');

	// Date-stamped status, and the designers' response.
	const status = page.locator('#hiding-status');
	await expect(status).toContainText(
		'As of November 2026, NGCC is in its first round; the ICCS proposal pages list Round 1 candidates only (checked 18 November 2026).',
	);
	await expect(status).toContainText('promised an updated algorithm');
	await expect(status).toContainText('Nothing in round one is standardized or deployed');

	// Sources and the cross-link.
	await expect(section.locator('a[href="https://eprint.iacr.org/2026/2390"]')).toBeVisible();
	await expect(section.locator('a[href="https://ngcc.dev/reports/sign-18.html"]')).toHaveText('sign-18-5');
	await expect(section.locator('a[href="https://systemslibrarian.github.io/crypto-lab-mayo-seal/"]')).toHaveText('MAYO Seal');

	// Nothing has run yet, and the page does not pretend otherwise.
	await expect(page.locator('.hiding-card')).toHaveCount(0);
	await expect(page.locator('#hiding-out')).toContainText('Nothing run yet');
});

test('without hiding maps the public key forges; with them the same forger does not', async ({ page }) => {
	await assertThisLab(page, '.');
	await run(page);

	const exposed = page.locator('.hiding-card[data-hiding-case="exposed"]');
	await expect(exposed).toContainText('12 variables, 8 equations over GF(256)');
	await expect(exposed).toContainText(/The key carries the seed 0x[0-9a-f]{8}/);
	await expect(exposed).toContainText('3 of 3 layers are linear in their own oil block');
	await expect(exposed).toContainText('3 linear solves of sizes 3 × 3, 3 × 3, 2 × 2');
	await expect(exposed).toContainText('8 of 8 public equations hold: the verifier ACCEPTED it');
	await expect(exposed.locator('[data-hiding-verdict]')).toHaveAttribute('data-hiding-verdict', 'forged');
	await expect(exposed.locator('.forge-stage--bad')).toHaveCount(0);
	// The controls are what make "accepted" mean something.
	await expect(exposed.locator('[data-hiding-field="controls"]')).toContainText('one forged byte changed, rejected');
	await expect(exposed.locator('[data-hiding-field="controls"]')).toContainText('against a different message, rejected');
	// The public key gave up the central map itself, and the forgery is not a replay.
	await expect(exposed.locator('[data-hiding-field="recovered"]')).toContainText(
		"equals the signer's central map in 8 of 8 polynomials",
	);
	const differing = await exposed.locator('[data-hiding-field="recovered"]').textContent();
	const [, differ] = /in (\d+) of 12 bytes/.exec(differing ?? '') ?? [];
	expect(Number(differ)).toBeGreaterThan(0);
	await expect(exposed.locator('#hiding-sig-forged .byte-cell')).toHaveCount(12);
	await expect(exposed.locator('#hiding-sig-honest .byte-cell')).toHaveCount(12);

	const hidden = page.locator('.hiding-card[data-hiding-case="hidden"]');
	await expect(hidden).toContainText('The key carries no seed');
	await expect(hidden).toContainText('0 of 3 layers are linear in their own oil block');
	await expect(hidden.locator('[data-hiding-verdict]')).toHaveAttribute('data-hiding-verdict', 'held');
	await expect(hidden).toContainText('NOT FORGED by this method');
	await expect(hidden).toContainText('This is not a security claim');
	await expect(hidden.locator('.forge-stage--ok')).toHaveCount(0);
	const verdictLine = (await hidden.locator('.forge-stage').last().textContent()) ?? '';
	const [, held, total] = /(\d+) of (\d+) public equations hold: the verifier REJECTED it/.exec(verdictLine) ?? [];
	expect(Number(total)).toBe(8);
	expect(Number(held)).toBeLessThan(8);
	await expect(hidden.locator('#hiding-sig-forged')).toHaveCount(0);
	// The trapdoor still works for the holder of the hiding maps.
	await expect(hidden.locator('[data-hiding-field="honest"]')).toContainText('the verifier ACCEPTED it');

	await expect(page.locator('#hiding-out')).toContainText("on this lab's toy and not on Origami");
});

test('the four-layer shape gives the same two verdicts at 25 variables', async ({ page }) => {
	await assertThisLab(page, '.');
	await expect(page.locator('#hiding-shape-note')).toContainText('96 vinegar variables followed by oil blocks of 32, 32, 32 and 8');
	await run(page, 'eighth');

	const exposed = page.locator('.hiding-card[data-hiding-case="exposed"]');
	await expect(exposed).toContainText('25 variables, 13 equations over GF(256)');
	await expect(exposed).toContainText('4 linear solves of sizes 4 × 4, 4 × 4, 4 × 4, 1 × 1');
	await expect(exposed).toContainText('13 of 13 public equations hold: the verifier ACCEPTED it');
	await expect(exposed.locator('[data-hiding-verdict]')).toHaveAttribute('data-hiding-verdict', 'forged');
	await expect(exposed.locator('[data-hiding-field="recovered"]')).toContainText('in 13 of 13 polynomials');

	const hidden = page.locator('.hiding-card[data-hiding-case="hidden"]');
	await expect(hidden).toContainText('0 of 4 layers are linear in their own oil block');
	await expect(hidden.locator('[data-hiding-verdict]')).toHaveAttribute('data-hiding-verdict', 'held');
	await expect(hidden.locator('[data-hiding-field="honest"]')).toContainText('the verifier ACCEPTED it');

	// A second run replaces the first rather than stacking under it.
	await run(page, 'small');
	await expect(page.locator('.hiding-card')).toHaveCount(2);
	await expect(page.locator('.hiding-card[data-hiding-case="exposed"]')).toContainText('12 variables, 8 equations');
});

test.describe('with the system set to light', () => {
	// The page is dark-only but declares `color-scheme: light dark`, so an
	// in-copy link with no colour of its own takes the browser's light-scheme
	// default blue here, about 2:1 on the page's dark panels. The WCAG gate
	// emulates a dark system and cannot see that; this does.
	test.use({ colorScheme: 'light' });

	test('in-copy links keep the page ink rather than the browser default', async ({ page }) => {
		await assertThisLab(page, '.');
		const colours = await page.evaluate(() => {
			const probe = document.createElement('span');
			probe.style.color = 'var(--accent)';
			document.body.append(probe);
			const accent = getComputedStyle(probe).color;
			probe.remove();
			const colourOf = (selector: string): string[] =>
				Array.from(document.querySelectorAll<HTMLAnchorElement>(selector))
					.filter((a) => a.checkVisibility())
					.map((a) => getComputedStyle(a).color);
			return {
				accent,
				exhibit: colourOf('#hiding-maps .panel-copy a, #hiding-maps .section-footnote a'),
				notes: colourOf('#uov-research-note .panel-copy a'),
			};
		});
		// The exhibit's five visible links, and the two research-note links above
		// it that share the same classes and had the same default.
		expect(colours.exhibit.length).toBe(5);
		expect(colours.notes.length).toBe(2);
		expect(colours.accent).not.toBe('rgb(0, 0, 238)');
		for (const colour of [...colours.exhibit, ...colours.notes]) expect(colour).toBe(colours.accent);
	});
});
