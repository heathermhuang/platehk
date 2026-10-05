import {test, expect} from './fixtures.mjs';
import axe from 'axe-core';

test('long bilingual titles and camera controls remain usable on narrow and short screens', async ({page}, info) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [width,height] of [[320,568],[390,640],[768,1024]]) {
    await page.setViewportSize({width,height});
    for (const lang of ['zh','en']) for (const path of ['/','/prices.html','/availability.html','/plates/directory/index.html','/camera.html']) {
      await page.goto(`${path}?lang=${lang}`);
      const heading = page.locator('h1:visible');
      await expect(heading).toHaveCount(1);
      const box = await heading.boundingBox();
      expect(box.x + box.width, `${path} ${lang}`).toBeLessThanOrEqual(width + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} ${lang}`).toBe(true);
      if (path === '/camera.html') {
        const header = await page.locator('.topbar').boundingBox();
        expect(header.x).toBeGreaterThanOrEqual(15);
        expect(header.x + header.width).toBeLessThanOrEqual(width - 15);
        await page.locator('#manualInput').fill('AA88');
        await page.locator('#manualSearchBtn').scrollIntoViewIfNeeded();
        await expect(page.locator('#manualSearchBtn')).toBeInViewport();
        await expect(page.locator('#manualSearchBtn')).toBeEnabled();
      }
    }
  }
  await page.screenshot({path:info.outputPath('camera-compatible.png')});
  expect(errors).toEqual([]);
});

test('overflowing API examples can be reached and scrolled using the keyboard', async ({page}) => {
  await page.setViewportSize({width:320,height:812});
  await page.goto('/api.html?lang=en');
  const example = page.locator('.ux-setup pre').first();
  await page.getByRole('button',{name:'Copy request',exact:true}).focus();
  await page.keyboard.press('Tab');
  await expect(example).toBeFocused();
  expect(await example.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => example.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
});

test('shortlist comparisons preserve readable row headers and source links', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  for (const plate of ['AA88','DB']) {
    await page.goto(`/plate.html?q=${plate}&lang=en`);
    await page.locator('#plateHistory button[data-save-plate]').first().click();
  }
  await page.goto('/shortlist.html?lang=en');
  for (const plate of ['AA88','DB']) await page.getByRole('checkbox',{name:`Compare ${plate}`,exact:true}).check();
  await page.getByRole('button',{name:/Compare selected/}).click();
  await expect(page.locator('#shortlistComparison tbody tr')).toHaveCount(2);
  await expect(page.locator('#shortlistComparison tbody tr').first().getByRole('link',{name:'Check source',exact:true})).toBeVisible();
  expect(await page.evaluate(() => innerWidth)).toBe(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.addScriptTag({content:axe.source});
  const contrast = await page.evaluate(async () => (await window.axe.run(document, {runOnly:['color-contrast']})).violations.map(issue=>({id:issue.id,targets:issue.nodes.map(node=>node.target)})));
  expect(contrast).toEqual([]);
  const source = page.locator('#shortlistComparison tbody tr').last().getByRole('link',{name:'Check source',exact:true});
  await source.focus();
  await expect(source).toBeInViewport();
  await expect.poll(() => page.locator('#shortlistComparison .table-wrap').evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
});
