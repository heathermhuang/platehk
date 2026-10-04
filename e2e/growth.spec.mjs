import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

test('a cached analytics module without the new methods cannot interrupt lookup', async ({page}) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.PlateAnalytics={track(){}};});
  await page.goto('/?lang=en&q=AA88');
  await expect(page.locator('#rows tr[data-plate="AA88"]')).toHaveCount(1);
  await page.goto('/plate.html?q=AA88&lang=en');
  await expect(page.locator('#plateHistory h2')).toContainText('AA88');
  expect(errors).toEqual([]);
});

test('homepage keeps lookup focused with verified rounds in their own archive', async ({page}) => {
  await page.goto('/?lang=en');
  await page.locator('.site-more > summary').click();
  await expect(page.getByRole('link', {name:'Historical prices', exact:true})).toBeVisible();
  await expect(page.getByRole('link', {name:'Official availability and applications', exact:true})).toBeVisible();
  await page.locator('.site-more > summary').click();
  await expect(page.getByRole('link', {name:'Latest auction results', exact:true})).toBeVisible();
  await expect(page.locator('#verifiedAuctionHighlights')).toHaveCount(0);
  await page.locator('#q').fill('AA88');
  await expect(page.locator('#rows tr[data-plate="AA88"]')).toHaveCount(1);
  await page.locator('#reset').click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('link', {name:'Latest auction results', exact:true}).click();
  await expect(page).toHaveURL(/\/auction-results\/en\/index\.html$/);
  await expect(page.locator('.auction-rounds article')).toHaveCount(9);
  const personalized = page.locator('.auction-rounds article').filter({has:page.getByRole('link',{name:'Personalized marks results: 12 September 2026',exact:true})});
  await expect(personalized).toContainText('77 auction sales');
  await expect(personalized).toContainText('HK$1,366,000');
  await expect(personalized.getByRole('link',{name:'Complete official PDF'})).toHaveAttribute('href',/^https:\/\/www\.td\.gov\.hk\//);
});

test('the result feed contains nine stable source-linked entries and a usable copy fallback', async ({page,request}) => {
  await page.goto('/auction-results/en/index.html#updates');
  await expect(page.locator('#resultsFeedUrl')).toHaveValue(`${new URL(page.url()).origin}/auction-results/en/feed.xml`);
  await expect(page.getByRole('link', {name:'Open results feed', exact:true})).toHaveAttribute('href','/auction-results/en/feed.xml');
  const response=await request.get('/auction-results/en/feed.xml');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('application/atom+xml');
  expect(response.headers()['cache-control']).toBe('public, max-age=300, must-revalidate');
  const body=await response.text();
  expect((body.match(/<entry>/g)||[]).length).toBe(9);
  expect(body).toContain('xmlns="http://www.w3.org/2005/Atom"');
  expect(body).toContain('type="application/pdf"');
  expect(body).toContain('special-fee allocations');
  await page.getByRole('button', {name:'Copy feed link', exact:true}).click();
  await expect(page.locator('#resultsFeedStatus')).toContainText(/Link copied|Copy the selected link/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('main, detail and round lookup wiring distinguishes found, empty and failed answers', async ({page}) => {
  // Capture call-site wiring without enabling production-only GA4 on localhost.
  await page.addInitScript(()=>{
    window.lookupObservations=[];
    window.PlateAnalytics={track(){},lookup(values){window.lookupObservations.push({kind:'complete',...values});},lookupError(values){if(values.plate)window.lookupObservations.push({kind:'error',...values});}};
  });
  await page.goto('/?lang=en');
  await expect(page.locator('#status')).toContainText('records');
  expect(await page.evaluate(()=>window.lookupObservations.length)).toBe(0);
  await page.locator('#q').fill('AA88');
  await expect.poll(()=>page.evaluate(()=>window.lookupObservations.some(v=>v.action==='main_lookup'&&v.plate==='AA88'&&v.result_count>0))).toBe(true);
  expect(await page.evaluate(()=>window.lookupObservations.find(v=>v.action==='main_lookup'&&v.plate==='AA88').match_mode)).toBe('exact');
  await page.locator('#q').fill('AB1234');
  await expect.poll(()=>page.evaluate(()=>window.lookupObservations.some(v=>v.action==='main_lookup'&&v.plate==='AB1234'&&v.result_count===0))).toBe(true);
  await page.route('**/api/search?**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"unavailable"}'}));
  await page.locator('#q').fill('AA88');
  await expect.poll(()=>page.evaluate(()=>window.lookupObservations.some(v=>v.kind==='error'&&v.plate==='AA88'))).toBe(true);
  await page.unroute('**/api/search?**');
  await page.goto('/plate.html?q=AA88&lang=en');
  await expect.poll(()=>page.evaluate(()=>window.lookupObservations.some(v=>v.action==='plate_history'&&v.result_count>0))).toBe(true);
  await page.goto('/auction-results/en/tvrm_physical-2026-09-05.html');
  await page.getByRole('searchbox',{name:'Find a plate in this round',exact:true}).fill('YA8');
  await expect.poll(()=>page.evaluate(()=>window.lookupObservations.some(v=>v.action==='round_lookup'&&v.plate==='YA8'&&v.result_count>=1&&v.exact_match))).toBe(true);
  expect(await page.evaluate(()=>window.lookupObservations.find(v=>v.action==='round_lookup'&&v.plate==='YA8').outcome_filter)).toBe('all');
  await expect(page.locator('#mark-YA8')).toBeVisible();
  await expect(page.locator('#mark-YA8')).toContainText('HK$110,000');
});

for(const action of ['main_lookup','round_lookup'])test(`real analytics settles ${action} without losing the bubbling input result`, async({page})=>{
  const analytics=readFileSync(new URL('../assets/analytics.js',import.meta.url),'utf8');
  // Synthetic production-host fixture: every request is intercepted; GA receives nothing.
  await page.route('**/*',route=>route.abort());
  await page.route('https://plate.hk/measurement-fixture**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en"><body>
    <div class="ux-browser"><label>Synthetic query<input id="q"></label></div><button>Leave query</button>
    <script>${analytics}</script><script>
      document.querySelector('input').addEventListener('input',event=>{
        const plate=event.target.value;
        window.PlateAnalytics.lookup({plate,result_count:plate==='AA88'?1:0,exact_match:plate==='AA88',action:'${action}',dataset:'all',match_mode:'contains',page_number:1});
      });
    </script></body></html>`}));
  await page.clock.install({time:new Date('2026-10-04T00:00:00Z')});
  await page.goto('https://plate.hk/measurement-fixture?utm_source=threads&utm_medium=social&utm_campaign=auction-sep&q=private');
  await page.clock.pauseAt(new Date('2026-10-04T00:00:01Z'));
  const events=()=>page.evaluate(()=>Array.from(window.dataLayer).filter(value=>value[0]==='event').map(value=>[value[1],value[2]]));
  const query=page.getByLabel('Synthetic query');
  await query.fill('A');await page.clock.runFor(500);await query.fill('AA88');await page.clock.runFor(1400);
  expect((await events()).filter(([name])=>name==='lookup_complete')).toHaveLength(0);
  await page.clock.runFor(100);
  const settled=(await events()).filter(([name])=>name==='lookup_complete');
  expect(settled).toHaveLength(1);expect(settled[0][1].plate).toBe('AA88');
  expect((await events()).filter(([name])=>name==='lookup_exact_match')).toHaveLength(1);
  expect(await page.evaluate(()=>Array.from(window.dataLayer).find(value=>value[0]==='config')[2].campaign_source)).toBe('threads');
  await query.fill('AB1234');await page.getByRole('button',{name:'Leave query'}).click();
  expect((await events()).filter(([name])=>name==='lookup_no_result')).toHaveLength(1);
  await page.clock.runFor(3000);
  expect((await events()).filter(([name])=>name==='lookup_complete')).toHaveLength(2);
});
