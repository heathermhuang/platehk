import { test, expect } from './fixtures.mjs';

test('budget-only discovery applies the full-set constraint without a required fragment', async ({page,request}) => {
  const api=await request.get('/api/search?dataset=all&max_amount=20000&sort=date_desc&page_size=24');
  expect(api.ok()).toBe(true);const payload=await api.json();expect(payload.total).toBeGreaterThan(24);
  for(const row of payload.rows){expect(row.amount_hkd).toBeGreaterThan(0);expect(row.amount_hkd).toBeLessThanOrEqual(20000);}
  await page.goto('/discover.html?lang=en');
  await expect(page.locator('#decisionQuery')).not.toHaveAttribute('required');
  await expect(page.getByText('More filters',{exact:true})).toBeVisible();
  await page.locator('input[name=max_amount]').fill('20000');await page.getByRole('button',{name:'Apply filters',exact:true}).click();
  await expect(page.locator('#decisionResults h2')).toContainText('historical records');
  expect(await page.locator('#decisionResults .decision-result').count()).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Reset filters',exact:true}).click();await expect(page.locator('#decisionResults')).toBeEmpty();
});

test('partial matching is the default, exact matching is explicit and sale signals lead the results',async({page})=>{
  await page.goto('/?lang=en&q=AA88');
  await expect(page.locator('#matchMode')).toHaveValue('contains');
  await expect.poll(()=>page.locator('#rows tr[data-plate]').count()).toBeGreaterThan(1);
  await expect(page.locator('.results-context-title')).toContainText('Matching auction records');
  await page.locator('#matchMode').selectOption('exact');
  await expect(page).toHaveURL(/mode=exact/);await expect(page.locator('#rows tr[data-plate]')).toHaveCount(1);
  expect(await page.evaluate(()=>{const results=document.querySelector('#resultsTableWrap');const signal=document.querySelector('#marketSignal');return Boolean(signal.compareDocumentPosition(results)&Node.DOCUMENT_POSITION_FOLLOWING);})).toBe(true);
});

test('zero-selection comparison is disabled and removal can be undone',async({page})=>{
  await page.goto('/shortlist.html?lang=en');await expect(page.locator('#compareSelected')).toBeDisabled();
  await page.goto('/plate.html?q=AA88&lang=en');await page.locator('#plateHistory button[data-save-plate]').first().click();
  await page.goto('/shortlist.html?lang=en');await page.getByRole('checkbox',{name:'Compare AA88',exact:true}).check();await expect(page.locator('#compareSelected')).toBeEnabled();
  await page.locator('#shortlistItems button[data-save-plate]').click();await expect(page.locator('#compareSelected')).toBeDisabled();
  await page.getByRole('button',{name:'Undo removal',exact:true}).click();await expect(page.getByRole('checkbox',{name:'Compare AA88',exact:true})).toBeVisible();
});

test('round filters retain complete source rows and find sold versus unsold marks',async({page})=>{
  await page.goto('/auction-results/en/tvrm_physical-2026-09-12.html');
  await expect(page.locator('tbody tr')).toHaveCount(220);
  await page.getByRole('searchbox',{name:'Find a plate in this round',exact:true}).fill('1314');
  await expect(page.locator('tbody tr:visible')).toHaveCount(1);await expect(page.locator('tbody tr:visible')).toContainText('HK$310,000');
  await page.getByRole('searchbox',{name:'Find a plate in this round',exact:true}).fill('');
  await page.getByRole('combobox',{name:'Round outcome',exact:true}).selectOption('unsold');
  await expect(page.locator('.ux-pager')).toContainText('163 of 220');
  await expect(page.locator('tbody tr:visible')).toHaveCount(25);
  await expect(page.locator('html')).toHaveAttribute('lang','en');
});

test('directory lookup, audit paging, camera fallback and legacy redirect are usable',async({page,request})=>{
  await page.goto('/plates/directory/index.html?lang=en');await page.getByRole('searchbox',{name:'Find a plate',exact:true}).fill('88');
  expect(await page.locator('.directory-list li:visible').count()).toBeGreaterThan(0);await expect(page.getByRole('link',{name:'88',exact:true})).toBeVisible();
  const inventoryResponse=await request.get('/data/audit.json');expect(inventoryResponse.ok()).toBe(true);
  const inventory=await inventoryResponse.json();expect(inventory.files.length).toBeGreaterThan(40);
  await page.goto('/audit.html?lang=en');await expect(page.locator('#tbody tr')).toHaveCount(40);await expect(page.locator('#auditPager')).toContainText(`${inventory.files.length} matching issues`);
  await page.goto('/camera.html?lang=en');await expect(page.locator('#manualInput')).toHaveAttribute('aria-label','Correct or enter the plate number');
  const redirected=await request.get('/landing.html?lang=en',{maxRedirects:0});expect(redirected.status()).toBe(301);expect(redirected.headers().location).toMatch(/\/?\?lang=en$/);
});

test('page families keep visible titles, compact navigation and viewport width',async({page,isMobile})=>{
  for(const path of ['/prices.html','/discover.html','/plate.html?q=AA88','/shortlist.html','/auctions.html','/availability.html','/plates/index.html','/plates/directory/index.html','/plates/88.html','/about.html','/audit.html','/api.html','/mcp.html','/changelog.html','/terms.html','/privacy.html','/auction-results/en/index.html','/auction-results/en/pvrm-2026-09-12.html','/auction-results/en/tvrm_physical-2026-09-12.html','/auction-results/en/tvrm_eauction-2026-09-17.html']){
    await page.goto(path+(path.includes('?')?'&':'?')+'lang=en');await expect(page.locator('h1:visible')).toHaveCount(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path).toBe(true);
    if(isMobile)expect(await page.locator('.info-site-header').evaluate(el=>el.getBoundingClientRect().height),path).toBeLessThan(150);
  }
});

test('auction mark bookmarks reveal a later page without losing complete rows',async({page})=>{
  await page.goto('/auction-results/en/tvrm_physical-2026-09-12.html');
  const id=await page.locator('tbody tr').nth(100).getAttribute('id');
  await page.goto('/auction-results/en/tvrm_physical-2026-09-12.html#'+id);
  await expect(page.locator(`[id="${id}"]`)).toBeVisible();await expect(page.locator('tbody tr')).toHaveCount(220);
  await expect(page.locator('.ux-pager')).toContainText('page 5/9');
});

test('an invalid filter attempt supersedes an in-flight discovery response',async({page})=>{
  await page.goto('/discover.html?lang=en');
  let requested=false;
  await page.route('**/api/search?**',async route=>{requested=true;await new Promise(resolve=>setTimeout(resolve,500));await route.fulfill({json:{rows:[{single_line:'OLD88',amount_hkd:5000,auction_date:'2026-09-17',dataset_key:'tvrm_eauction'}],total:1}});});
  await page.locator('input[name=max_amount]').fill('20000');await page.getByRole('button',{name:'Apply filters',exact:true}).click();
  await expect.poll(()=>requested).toBe(true);await page.getByText('More filters',{exact:true}).click();
  await page.locator('input[name=min_amount]').fill('50000');await page.getByRole('button',{name:'Apply filters',exact:true}).click();
  await expect(page.locator('#decisionResults')).toContainText('Check the price');
  await page.waitForTimeout(700);await expect(page.locator('#decisionResults')).not.toContainText('OLD88');
});
