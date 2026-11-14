import {test, expect} from './fixtures.mjs';

test('search, exact history, discovery, shortlist and camera retain special-fee outcomes', async ({page, request}) => {
  const response = await request.get('/api/search?dataset=all&q=1ZURU1&mode=exact');
  expect(response.ok()).toBe(true);
  const result = await response.json();
  expect(result.rows.find(row => row.auction_date === '2026-09-12')).toMatchObject({amount_hkd:5000,result_status:'assigned_special_fee'});
  const fee = 'Special-fee allocation (no bidder)';
  await page.addInitScript(() => {
    window.posterLabels=[];
    const fillText=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.posterLabels.push(String(text));return fillText.call(this,text,...args);};
  });
  await page.goto('/?q=1ZURU1&mode=exact&lang=en');
  await expect(page.locator('#rows tr[data-plate]').first()).toContainText(fee);
  await page.locator('#rows .row-share-btn').first().click();
  await expect(page.locator('#sharePreview')).toHaveAttribute('src',/^data:image\/png/);
  expect(await page.evaluate(()=>window.posterLabels)).toContain(fee);
  await page.locator('#shareClose').click();
  await page.goto('/plate.html?q=1ZURU1&lang=en');
  await expect(page.locator('#plateHistory')).toContainText(fee);
  await page.locator('#plateHistory [data-save-plate]').first().click();
  await page.goto('/shortlist.html?lang=en');
  await page.getByRole('checkbox',{name:'Compare 1ZURU1',exact:true}).check();
  await page.getByRole('button',{name:/Compare selected/}).click();
  await expect(page.locator('#shortlistComparison')).toContainText(fee);
  await page.goto('/discover.html?q=1ZURU1&lang=en');
  await expect(page.locator('#decisionResults')).toContainText(fee);
  await page.goto('/camera.html?lang=en');
  await page.locator('#manualInput').fill('1ZURU1');
  await page.locator('#manualSearchBtn').click();
  await expect(page.locator('#results')).toContainText(fee);
});

test('an unsold mark has no sale amount and remains searchable outside the curated archive', async ({page, request}) => {
  const response=await request.get('/api/search?dataset=all&q=9549&mode=exact');
  const result=await response.json();
  expect(result.rows.find(row=>row.auction_date==='2026-09-12')).toMatchObject({amount_hkd:null,result_status:'unsold'});
  await page.goto('/plate.html?q=9549&lang=en');
  // English history can use the ISO date when a localized label is unavailable.
  const unsold=page.locator('#plateHistory article').filter({hasText:'Unsold (U/S)'});
  await expect(unsold.first()).toContainText('—');
  await expect(unsold.first()).not.toContainText('HK$0');
});

test('confirmed comparisons exclude allocations and unknowns, with old evidence warnings before statistics', async ({page, request}) => {
  const response=await request.get('/api/comparables?q=AA88');
  expect(response.ok()).toBe(true);
  const result=await response.json();
  expect(result.rows.length).toBeGreaterThan(0);
  expect(result.rows.every(row=>row.result_status==='sold')).toBe(true);
  await page.goto('/plate.html?q=AA88&lang=en');
  await expect(page.locator('.comparison-age-warning')).toContainText('Only older historical samples');
  const warning=await page.locator('.comparison-age-warning').boundingBox();
  if(result.statistics){
    const stats=await page.locator('.comparison-stats').boundingBox();
    expect(warning.y).toBeLessThan(stats.y);
  }else{
    await expect(page.locator('.comparison-stats')).toHaveCount(0);
    await expect(page.locator('#plateComparables')).toContainText('Fewer than five qualifying plates');
  }
});

test('Chinese labels, coverage scope and narrow-screen records remain readable', async ({page}) => {
  await page.setViewportSize({width:320,height:812});
  await page.goto('/?q=1ZURU1&mode=exact&lang=zh');
  await expect(page.locator('#rows tr[data-plate]').first()).toContainText('特別費用分配（無人競投）');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.goto('/audit.html?lang=en');
  await expect(page.locator('#outcomeCoverage')).toContainText('not a live source-check status');
  await expect(page.locator('#outcomeCoverage tbody tr')).toHaveCount(4);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
