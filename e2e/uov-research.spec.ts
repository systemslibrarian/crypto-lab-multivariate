import { test, expect } from '@playwright/test';

test('UOV research link exposes conditional estimates and parameter limits', async ({ page }) => {
  await page.goto('./#uov-research-note');
  const note = page.locator('#uov-research-note');
  await expect(note).toBeVisible();
  for (const text of ['14 November 2026', 'preprint', 'conjectural Hilbert-series', 'not demonstrated production-key recovery', 'older uov-Ip', 'does not execute']) {
    await expect(note).toContainText(text);
  }
  await expect(note.locator('a[href="https://eprint.iacr.org/2026/2272"]')).toHaveAttribute('href', 'https://eprint.iacr.org/2026/2272');
  const box = await note.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(80);
});


test('MAYO revision keeps its conditional scope and visible source', async ({ page }) => {
  await page.goto('./#mayo-schur-update');
  await expect(page.locator('#mayo-schur-update')).toBeVisible();
  const note = page.locator('#mayo-schur-update + p');
  for (const text of ['16 November 2026', 'selected additional Round-3', 'preprint', 'conjectural', 'does not demonstrate production-key recovery', 'historical Round-2', 'does not execute']) {
    await expect(note).toContainText(text);
  }
  await expect(note.locator('a[href="https://eprint.iacr.org/2026/2444"]')).toBeVisible();
});
