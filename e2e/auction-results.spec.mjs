import { test, expect } from '@playwright/test';

test('auction tool leads to complete result tables and exact historical search', async ({ page }) => {
  await page.goto('/auctions.html?lang=en');
  await page.getByRole('link', { name: 'Auction results archive', exact: true }).click();
  await expect(page).toHaveURL(/\/auction-results\/en\/index\.html$/);
  await page.getByRole('link', { name: 'Traditional physical auction results: 12 September 2026', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(220);
  await expect(page.locator('tr[data-status="unsold"]')).toHaveCount(163);
  await expect(page.locator('#mark-9549')).toContainText('Unsold (U/S)');
  await expect(page.locator('#mark-1314')).toContainText('HK$310,000');
  await expect(page.locator('#mark-1314').getByRole('link', { name: 'Official PDF p. 1' })).toHaveAttribute('href', /www\.td\.gov\.hk\/.*#page=1$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#mark-1314').getByRole('link', { name: 'Search record' }).click();
  await expect(page.locator('#rows tr[data-plate="1314"]')).toHaveCount(1);
  await expect(page.locator('#rows')).toContainText('310,000');
});

test('native language links preserve the round and complete online dispositions', async ({ page }) => {
  await page.goto('/auction-results/tvrm_eauction-2026-09-17.html');
  await page.getByRole('link', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('17 September 2026 to 21 September 2026');
  await expect(page.locator('tr[data-status="special_fee"]')).toHaveCount(4);
  await expect(page.locator('#mark-JN6224')).toContainText('Special-fee allocation (no bidder)');
  await page.getByRole('link', { name: '繁體中文', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-HK');
  await expect(page.locator('#mark-JN6224')).toContainText('特別費用分配');
});

test('English answers and all result rows remain available without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}/auction-results/en/pvrm-2026-09-12.html`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('tbody tr')).toHaveCount(100);
  await expect(page.locator('tr[data-status="special_fee"]')).toHaveCount(23);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Personalized marks results');
  await expect(page.locator('.auction-summary')).toContainText('77 auction sales');
  await page.getByRole('link', { name: '繁體中文', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-HK');
  await context.close();
});
