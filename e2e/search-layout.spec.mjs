import {test,expect} from './fixtures.mjs';

test('partial search is the default and exact mode survives URLs, language changes and reset',async({page})=>{
  for(const lang of ['en','zh']){
    await page.goto(`/?lang=${lang}&q=AA88`);
    await expect(page.locator('#matchMode')).toHaveValue('contains');
    await expect.poll(()=>page.locator('#rows tr[data-plate]').count()).toBeGreaterThan(1);
    await expect(page.locator('#rows tr[data-plate="AA88"]')).toHaveCount(1);
    await page.locator('#matchMode').selectOption('exact');
    await expect(page).toHaveURL(/mode=exact/);
    await expect(page.locator('#rows tr[data-plate]')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('#matchMode')).toHaveValue('exact');
    await page.locator(lang==='en'?'#langZh':'#langEn').click();
    await expect(page.locator('#matchMode')).toHaveValue('exact');
    await expect(page).toHaveURL(/mode=exact/);
    await page.locator('#reset').click();
    await expect(page.locator('#matchMode')).toHaveValue('contains');
    await expect(page.locator('#q')).toHaveValue('');
  }
});

test('two-line marks use one readable badge with preserved line order',async({page},info)=>{
  for(const width of [320,375,1366]){
    await page.setViewportSize({width,height:900});
    await page.goto('/?lang=en&q=JL&mode=exact');
    const row=page.locator('#rows tr[data-plate="JL"]');
    await expect(row).toHaveCount(1);
    const badge=row.locator('.col-single .plate');
    await expect(badge).toHaveCount(1);
    await expect(badge.locator('.double-plate span')).toHaveText(['J','L']);
    const lines=await badge.locator('.double-plate span').evaluateAll(nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return {y:r.y,bottom:r.bottom,x:r.x,width:r.width};}));
    expect(lines[1].y).toBeGreaterThan(lines[0].bottom);
    expect(Math.abs(lines[0].x+lines[0].width/2-lines[1].x-lines[1].width/2)).toBeLessThan(1);
    expect(await badge.evaluate(e=>e.getBoundingClientRect().width)).toBeGreaterThanOrEqual(72);
    expect(await page.evaluate(()=>innerWidth)).toBe(width);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath(`two-line-${width}.png`)});
  }
});

test('a fresh sale signal is visible above the search heading and auction table',async({page},info)=>{
  await page.setViewportSize({width:375,height:900});
  await page.route('**/api/market_signal?*',async route=>{
    const plates=new URL(route.request().url()).searchParams.get('plates')?.split(',')||[];
    await route.fulfill({json:{signals:plates.includes('AA88')?[{plate:'AA88',availability_detected:true,source:'28car',offer_count:1,asking_prices_hkd:[888000],has_contact_price:false,observed_at:new Date().toISOString(),source_url:'https://m.28car.com/num_dsp.php?h_vid=50000001&h_f_do=1',inquiry_enabled:false}]:[]}});
  });
  await page.goto('/?lang=en&q=AA88');
  const signal=page.locator('#marketSignal');
  await expect(signal).toBeVisible();
  await expect(signal).toContainText('Current asking price');
  const position=await page.evaluate(()=>{const signal=document.querySelector('#marketSignal'),heading=document.querySelector('.results-meta-wrap'),table=document.querySelector('#resultsTableWrap');return {first:signal.parentElement.firstElementChild===signal,headingAfter:!!(signal.compareDocumentPosition(heading)&Node.DOCUMENT_POSITION_FOLLOWING),tableAfter:!!(signal.compareDocumentPosition(table)&Node.DOCUMENT_POSITION_FOLLOWING),bottom:signal.getBoundingClientRect().bottom,headingTop:heading.getBoundingClientRect().top};});
  expect(position.first&&position.headingAfter&&position.tableAfter).toBe(true);
  expect(position.bottom).toBeLessThanOrEqual(position.headingTop);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('sale-signal-first.png')});
});
