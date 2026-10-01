import { test, expect } from '@playwright/test';
import axe from 'axe-core';

async function ready(page) {
  await expect(page.locator('#rows tr[data-plate]').first()).toBeVisible();
}

async function accessibility(page) {
  await page.addScriptTag({ content: axe.source });
  const issues = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
  })).violations.filter(v => ['critical', 'serious'].includes(v.impact)).map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })));
  expect(issues).toEqual([]);
}

test('narrow desktop widths keep every record inside its pane', async ({page}, info) => {
  for (const width of [1120,1200,1366]) {
    await page.setViewportSize({width,height:900});
    await page.goto('/?lang=en'); await ready(page);
    const pane=await page.locator('.record-pane').boundingBox();
    const row=await page.locator('#rows tr[data-plate]').first().boundingBox();
    expect(row.x+row.width).toBeLessThanOrEqual(pane.x+pane.width+1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.screenshot({path:info.outputPath('records-desktop-en.png')});
});

test('records and their sources are visible on arrival while verified rounds remain accessible', async ({page}, info) => {
  await page.goto('/?lang=en');
  await ready(page);
  const first = page.locator('#rows tr[data-plate]').first();
  for (const field of ['.col-single', '.col-price', '.col-source']) await expect(first.locator(field)).toBeInViewport({ratio:1});
  expect(await page.locator('#verifiedAuctionHighlights li').count()).toBe(3);
  if (!await page.locator('#verifiedAuctionHighlights').evaluate(el=>el.open)) {
    await page.locator('#verifiedAuctionHighlights > summary').click();
  }
  await expect(page.getByRole('link', {name:'Personalized marks results: 12 September 2026',exact:true})).toContainText('77 auction sales');
  await expect(page.getByRole('link', {name:'Personalized marks results: 12 September 2026',exact:true})).toContainText('HK$1,366,000');
  await accessibility(page);
  await page.goto('/?lang=zh');
  await ready(page);
  await page.screenshot({path:info.outputPath('records-home.png')});
});

test('narrow phones keep search, filter scope and a complete record readable', async ({page}, info) => {
  await page.setViewportSize({width:320,height:812});
  for (const lang of ['en','zh']) {
    await page.goto(`/?lang=${lang}`); await ready(page);
    const first=page.locator('#rows tr[data-plate]').first();
    await expect(first).toBeInViewport({ratio:1});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('.record-filters > summary').click();
    await expect(page.locator('#dataset')).toBeVisible();
    await page.locator('#dataset').selectOption('pvrm');
    await expect(page.locator('#filterScope')).toContainText(/PVRM|自訂/);
    await page.locator('.record-filters > summary').click();
    await page.screenshot({path:info.outputPath(`records-${lang}-320.png`)});
  }
});

test('single and double plate layouts share one linked field and exact history keeps its context', async ({page}) => {
  await page.goto('/?lang=en&q=JL'); await ready(page);
  const first=page.locator('#rows tr[data-plate="JL"]').first();
  await expect(first.locator('.col-single .plate')).toHaveCount(2);
  await expect(first.locator('.col-single .plate.double')).toBeVisible();
  await expect(first.locator('.col-double')).toBeHidden();
  await expect(page.locator('.results-context-title')).toContainText('JL');
  await expect(first.locator('.col-source a')).toContainText('Source');
  await accessibility(page);
});

test('column sorting and nearby pagination use the existing query state', async ({page}, info) => {
  test.skip(info.project.name.includes('mobile'),'Desktop column controls');
  await page.goto('/?lang=en'); await ready(page);
  await page.locator('#thPrice button').click();
  await expect(page).toHaveURL(/sort=amount_asc/);
  await expect(page.locator('#thPrice')).toHaveAttribute('aria-sort','ascending');
  await expect(page.locator('#thPrice button')).toBeFocused();
  await page.locator('#bottomNext').click();
  await expect(page.locator('#status')).toContainText('Page 2');
  await page.locator('#bottomPrev').click();
  await expect(page.locator('#status')).toContainText('Page 1');
  await page.locator('#thPrice button').click();
  await expect(page.locator('#sort')).toHaveValue('amount_desc');
  await expect(page.locator('#thPrice')).toHaveAttribute('aria-sort','descending');
});

test('a pending new poster cannot download a previous record and keyboard focus stays in its dialog', async ({page}) => {
  await page.goto('/?lang=en'); await ready(page);
  await page.locator('#rows .row-share-btn').first().click();
  await expect(page.locator('#sharePreview')).toHaveAttribute('src',/^data:image\/png/);
  const previous=await page.locator('#sharePreview').getAttribute('src');
  await page.locator('#shareClose').click();
  let release;
  await page.route('**/assets/logo.svg?*',async route=>{ await new Promise(resolve=>{release=resolve;}); await route.continue(); });
  await page.locator('#rows .row-share-btn').nth(1).click();
  await expect(page.locator('#shareLoading')).toContainText('Preparing poster');
  await expect(page.locator('#sharePreview')).toBeHidden();
  await expect(page.locator('#shareDownload')).toBeDisabled();
  await expect(page.locator('#shareClose')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#shareClose')).toBeFocused();
  await expect.poll(()=>Boolean(release)).toBe(true); release();
  await expect(page.locator('#shareDownload')).toBeEnabled();
  await expect(page.locator('#sharePreview')).not.toHaveAttribute('src',previous);
  await page.keyboard.press('Escape');
  await expect(page.locator('#rows .row-share-btn').nth(1)).toBeFocused();
});
