import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('featured directory serves crawlable links to the selected plate pages', async ({ page }) => {
  await page.goto('/plates/directory/index.html');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('精選車牌');
  await expect(page.locator('.directory-list a')).toHaveCount(800);
  await page.getByRole('link', { name: '88', exact: true }).click();
  await expect(page).toHaveURL(/\/plates\/88\.html/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('88');
});

test('English answer pages keep an English canonical and rendered language', async ({ page }) => {
  for (const path of ['', 'prices.html', 'discover.html', 'auctions.html', 'availability.html', 'about.html']) {
    const response = await page.goto(`/${path}?lang=en`);
    const canonical = `${new URL(page.url()).origin}/${path}?lang=en`;
    expect(await response.text()).toContain(`<link rel="canonical" href="${canonical}">`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical);
    expect(await page.locator('meta[name="description"]').getAttribute('content')).toMatch(/^(Search |Look |Explore |Check |Find |Sources,)/);
  }
});

test('a plate without an exact sale can show qualified historical comparisons', async ({ page, request }) => {
  const response = await request.get('/api/comparables?q=AH168');
  expect(response.ok()).toBe(true);
  const cohort = await response.json();
  expect(cohort.cohort).toBe('traditional_pattern_same_number_prefix_tier');
  expect(cohort.total_history).toBe(0);
  expect(cohort.sample_size).toBeGreaterThanOrEqual(5);
  expect(cohort.statistics.median).toBeGreaterThan(0);
  for (const row of cohort.rows) {
    expect(row.single_line.replace(/\s/g, '')).toMatch(/^[A-Z]{2}168$/);
    expect(row.single_line.replace(/\s/g, '')).not.toBe('AH168');
    expect(row.pdf_url || row.source_url).toBeTruthy();
  }
  await page.goto('/plate.html?q=AH168&lang=en');
  await expect(page.locator('#plateHistory')).toContainText('No indexed auction record');
  await expect(page.locator('#plateComparables')).toContainText('distinct comparable plates');
  await expect(page.locator('#plateComparables')).toContainText('Median');
  await expect(page.locator('#plateComparables article.decision-result').first()).toContainText('168');
  await expect(page.locator('#plateComparables article.decision-result').first().getByRole('link', { name: 'Check source' })).toHaveAttribute('href', /https:\/\/www\.td\.gov\.hk\//);
  if (cohort.sample_size > cohort.rows.length) {
    await page.getByRole('button', { name: /Show more comparable sales/ }).click();
    await expect(page.locator('#plateComparables article.decision-result')).toHaveCount(Math.min(16, cohort.sample_size));
  }
});

test('main lookup normalizes full-width input and separates invalid, empty and failed searches', async ({ page }) => {
  await page.goto('/?lang=en&q=AA88');
  await expect(page.locator('#rows tr[data-plate="AA88"]')).toHaveCount(1);
  const q=page.locator('#q');
  await q.fill('Q');
  await expect(q).toHaveValue('Q');
  await expect(page.getByRole('alert')).toContainText('Q is not allowed');
  await expect(page.locator('#rows tr[data-plate]')).toHaveCount(0);
  await q.fill('ＡＡ８８');
  await expect(q).toHaveValue('AA88');
  await expect(page.locator('#rows tr[data-plate="AA88"]')).toHaveCount(1);
  await q.fill('AB1234');
  await expect(page.locator('#rows')).toContainText('No auction record does not mean');
  await expect(page.getByRole('link',{name:'Official availability and applications',exact:true})).toBeVisible();
  await page.route('**/api/search?**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"unavailable"}'}));
  await q.fill('AA88');
  await expect(page.getByRole('alert')).toContainText('This is not a zero-result search');
  await expect(page.getByRole('button',{name:'Retry search'})).toBeVisible();
});

test('budget discovery shows only qualifying complete-set results and fits the viewport', async ({ page }) => {
  await page.goto('/discover.html?q=88&prefix=AA&max_amount=20000&lang=en');
  await expect(page.locator('#decisionResults h2')).toContainText('historical records');
  const cards=page.locator('.decision-result');
  expect(await cards.count()).toBeGreaterThan(0);
  for(const card of await cards.all()) {
    expect((await card.locator('h3').innerText()).replace(/\s/g,'')).toMatch(/^AA/);
    const price=Number((await card.locator('p').first().innerText()).replace(/[^\d]/g,''));
    expect(price).toBeLessThanOrEqual(20000);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('shortlist survives navigation and compares two exact histories', async ({ page }) => {
  for(const plate of ['AA88','DB']) {
    await page.goto(`/plate.html?q=${plate}&lang=en`);
    await expect(page.locator('#plateHistory h2')).toContainText(plate);
    await page.locator('#plateHistory button[data-save-plate]').first().click();
    await expect(page.locator('#decisionNotice')).toContainText('Shortlist updated');
  }
  await page.goto('/shortlist.html?lang=en');
  await page.getByRole('checkbox',{name:'Compare AA88',exact:true}).check();
  await page.getByRole('checkbox',{name:'Compare DB',exact:true}).check();
  await page.getByRole('button',{name:'Compare selected',exact:true}).click();
  await expect(page.locator('#shortlistComparison .decision-result')).toHaveCount(2);
  await expect(page.locator('#shortlistComparison')).toContainText('HK$1,150,000');
  await expect(page.locator('#shortlistComparison')).toContainText('HK$115,000');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('official calendar downloads a valid event with a one-day reminder', async ({ page }) => {
  await page.goto('/auctions.html?lang=en');
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Add to calendar',exact:true}).first().click();
  const event=await download;
  expect(event.suggestedFilename()).toBe('platehk-auction.ics');
  const contents=await readFile(await event.path(),'utf8');
  expect(contents).toContain('BEGIN:VEVENT\r\n');
  expect(contents).toContain('TRIGGER:-P1D');
  expect(contents).toContain('@plate.hk');
  await expect(page.locator('#calendarStatus')).toContainText('does not update automatically');
});
