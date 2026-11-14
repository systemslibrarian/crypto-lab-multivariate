import { test, expect } from '@playwright/test';

test('UOV research link exposes conditional estimates and parameter limits', async ({ page }) => {
  await page.goto('./#uov-research-note');
  const note = page.locator('#uov-research-note');
  await expect(note).toBeVisible();
  for (const text of ['14 November 2026', 'preprint', 'conjectural Hilbert-series', 'not demonstrated production-key recovery', 'older ov-Ip', 'does not execute']) {
    await expect(note).toContainText(text);
  }
  await expect(note.locator('a')).toHaveAttribute('href', 'https://eprint.iacr.org/2026/2272');
  const box = await note.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(80);
});
