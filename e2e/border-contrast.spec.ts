import { expect, test } from '@playwright/test';

type Rgb = [number, number, number];

function parseRgb(color: string): Rgb {
  const channels = color.match(/[\d.]+/g)?.map(Number);
  if (!channels || channels.length < 3) throw new Error(`Unsupported color: ${color}`);
  return [channels[0], channels[1], channels[2]];
}

function luminance([r, g, b]: Rgb): number {
  const linear = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

for (const theme of ['light', 'dark'] as const) {
  test(`select borders retain 3:1 rendered contrast in ${theme} theme`, async ({ page }) => {
    await page.goto('.');
    await page.evaluate((nextTheme) => {
      document.documentElement.dataset.theme = nextTheme;
    }, theme);

    // v, o, polynomial picker, and the attack exhibit's balanced-size picker.
    const controls = page.locator('.param-row select, .poly-select-label select');
    await expect(controls).toHaveCount(4);

    const styles = await controls.evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          border: style.borderTopColor,
          background: style.backgroundColor,
        };
      }),
    );

    for (const { border, background } of styles) {
      // The input background is translucent. Comparing against its declared RGB
      // endpoint is conservative for the light and dark surfaces used here.
      expect(contrast(parseRgb(border), parseRgb(background))).toBeGreaterThanOrEqual(3);
    }
  });
}
