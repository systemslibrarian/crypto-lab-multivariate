import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * WCAG regression gate. Scans the full page with every collapsible expanded,
 * hidden panels revealed, and animations neutralized, in both themes.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function revealAll(page: Page): Promise<void> {
  // Neutralize animations/transitions/opacity so mid-fade states don't produce
  // phantom contrast failures.
  await page.addStyleTag({
    content: `*,*::before,*::after{
      animation:none!important;transition:none!important;
      animation-duration:0s!important;transition-duration:0s!important;
    }`,
  });
  await page.evaluate(() => {
    // Expand every <details>.
    for (const d of Array.from(document.querySelectorAll('details'))) {
      (d as HTMLDetailsElement).open = true;
    }
    // Reveal [hidden] panels so their content is scannable.
    for (const el of Array.from(document.querySelectorAll('[hidden]'))) {
      el.removeAttribute('hidden');
    }
    // Un-hide aria-hidden output regions that hold real content.
    for (const el of Array.from(document.querySelectorAll('#verify-bad-detail'))) {
      el.removeAttribute('aria-hidden');
    }
  });
  await page.waitForTimeout(50);
}

async function scan(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
  }));
  expect(summary).toEqual([]);
}

test('no WCAG A/AA violations in dark theme', async ({ page }) => {
  await page.goto('.');
  await revealAll(page);
  await scan(page);
});

test('no WCAG A/AA violations in dark theme (audience mode)', async ({ page }) => {
  await page.goto('.');
  await page.locator('#audience-toggle').click();
  await revealAll(page);
  await scan(page);
});

test('no WCAG A/AA violations in light theme', async ({ page }) => {
  await page.goto('.');
  await page.locator('#cl-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await revealAll(page);
  await scan(page);
});
