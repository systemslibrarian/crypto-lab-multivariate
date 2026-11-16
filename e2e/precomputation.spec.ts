import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {auditControlNames,formatControlNameFailures} from './control-names';
test('precomputation costs and one-use inventory survive interaction',async({page})=>{
 await page.goto('./');
 await page.locator('#precompute-count').fill('2');
 await expect(page.locator('#precompute-costs')).toContainText('2,966,602');
 await page.locator('#precompute-reserve').click();await page.locator('#precompute-spend').click();await page.locator('#precompute-spend').click();
 await expect(page.locator('#precompute-status')).toContainText('already consumed');
 const r=await new AxeBuilder({page}).include('[aria-labelledby="precomputation-heading"]').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 expect(r.violations).toEqual([]);
 // axe's `label` rule accepts a bare `placeholder` as an accessible name, so a
 // deleted label can leave this gate green. See `control-names.ts`.
 expect(formatControlNameFailures(await auditControlNames(page)),'form controls named only by placeholder/title').toEqual([]);
});
