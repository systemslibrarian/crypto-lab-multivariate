import { expect, test, type Browser, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { settle } from './gate';
import { assertThisLab } from './identity';

/**
 * This page is dark-only. What the visitor's SYSTEM prefers must change nothing.
 *
 * The WCAG gate emulates a dark system, so it measures one of the two worlds a
 * visitor can arrive from. The other one was different: the page used to declare
 * `color-scheme: light dark`, which hands every element with no colour of its
 * own the browser's LIGHT defaults when the system is set to light. An in-copy
 * link then computed to `rgb(0, 0, 238)` on this page's dark panels, about 2:1.
 *
 * So the property is stated as an invariant instead of a list of selectors:
 * every visible link on the page computes to the same colour under a light
 * system as under a dark one, the root's used colour scheme is dark, and the
 * gate's own arithmetic contrast walk finds nothing under a light system.
 * A link added tomorrow with no colour of its own is covered without anyone
 * remembering to list it.
 */

interface LinkInk {
	where: string;
	text: string;
	colour: string;
}

async function open(browser: Browser, colorScheme: 'light' | 'dark'): Promise<Page> {
	// Reduced motion, so no link is caught part-way through a colour transition.
	const context = await browser.newContext({ colorScheme, reducedMotion: 'reduce' });
	const page = await context.newPage();
	await assertThisLab(page, '.');
	// The exhibits build their own links, some only once they have run.
	await page.locator('#forge-btn').click();
	await expect(page.locator('.forge-card')).toHaveCount(2, { timeout: 120_000 });
	await page.locator('#hiding-btn').click();
	await expect(page.locator('.hiding-card')).toHaveCount(2, { timeout: 60_000 });
	// The section nav highlights whichever section is under the reader. That is
	// scroll state, not system state, so both pages are measured from the top
	// with nothing focused and nothing still animating.
	await page.evaluate(() => {
		(document.activeElement as HTMLElement | null)?.blur?.();
		window.scrollTo(0, 0);
	});
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
	await settle(page);
	return page;
}

async function visibleLinks(page: Page): Promise<LinkInk[]> {
	return page.evaluate(() =>
		Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
			.filter((a) => a.checkVisibility())
			.map((a) => {
				const home = a.closest('section[id], section[aria-labelledby], header, footer, nav, aside');
				const where = home ? `${home.tagName.toLowerCase()}#${home.id || home.getAttribute('aria-labelledby') || home.className}` : 'body';
				return { where, text: (a.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 48), colour: getComputedStyle(a).color };
			}),
	);
}

test('every visible link has the same ink under a light system as under a dark one', async ({ browser }) => {
	test.setTimeout(240_000);
	const dark = await open(browser, 'dark');
	const light = await open(browser, 'light');
	const underDark = await visibleLinks(dark);
	const underLight = await visibleLinks(light);

	// The same links are on the page in both, in the same order.
	expect(underLight.map((l) => `${l.where} | ${l.text}`)).toEqual(underDark.map((l) => `${l.where} | ${l.text}`));
	// The page has in-copy links in several places; an empty list would pass vacuously.
	expect(underDark.length).toBeGreaterThan(20);
	for (const where of ['section#precomputation-heading', 'section#hiding-maps', 'aside#uov-research-note']) {
		expect(underDark.filter((l) => l.where === where).length, `links found in ${where}`).toBeGreaterThan(0);
	}

	const differing = underLight
		.map((l, i) => ({ ...l, underDark: underDark[i].colour }))
		.filter((l) => l.colour !== l.underDark)
		.map((l) => `${l.where} | ${l.text} | light system ${l.colour}, dark system ${l.underDark}`);
	// Soft, so one run lists every way the page follows the system, not only the first.
	expect.soft(differing, 'links whose ink depends on the system preference').toEqual([]);

	// None is the browser's light-scheme default, whichever way the two agree.
	expect
		.soft(
			underLight.filter((l) => l.colour === 'rgb(0, 0, 238)').map((l) => `${l.where} | ${l.text}`),
			"links painted in the browser's light-scheme default blue",
		)
		.toEqual([]);

	await dark.context().close();
	await light.context().close();
});

test('a light system still gets the dark page: used colour scheme and measured contrast', async ({ browser }) => {
	test.setTimeout(240_000);
	const light = await open(browser, 'light');
	expect(await light.evaluate(() => matchMedia('(prefers-color-scheme: light)').matches)).toBe(true);
	// The root opts out of following the system, in the stylesheet and in the meta tag.
	expect
		.soft(await light.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'computed color-scheme of <html>')
		.toBe('dark');
	expect
		.soft(await light.locator('meta[name="color-scheme"]').getAttribute('content'), 'the color-scheme meta tag')
		.toBe('dark');
	// The same arithmetic WCAG 1.4.3 walk the gate runs, in the world the gate does not emulate.
	const failures = Array.from(new Set(formatContrastFailures(await auditContrast(light))));
	expect.soft(failures, 'text contrast failures under a light system preference').toEqual([]);
	await light.context().close();
});
