import {test, expect} from './fixtures.mjs';
import axe from 'axe-core';

const pages = ['/', '/prices.html', '/discover.html', '/plate.html?q=AA88',
  '/shortlist.html', '/auctions.html', '/availability.html', '/about.html',
  '/api.html', '/mcp.html', '/audit.html', '/changelog.html', '/privacy.html',
  '/terms.html', '/camera.html', '/plates/index.html', '/plates/directory/index.html',
  '/plates/88.html', '/auction-results/index.html', '/auction-results/tvrm_physical-2026-09-12.html'];
const route = (path, lang) => {
  if (path.startsWith('/auction-results/')) return lang === 'en' ? path.replace('/auction-results/', '/auction-results/en/') : path;
  return path + (path.includes('?') ? '&' : '?') + 'lang=' + lang;
};

for (const width of [320, 768, 1440]) {
  test(`shared navigation, controls and content reflow at ${width}px`, async ({page}) => {
    test.setTimeout(180_000);
    await page.setViewportSize({width, height: 900});
    for (const lang of ['zh', 'en']) for (const path of pages) {
      await page.goto(route(path, lang));
      const nav = page.locator('.info-site-header .info-nav, .topbar .ux-task-nav');
      await expect(nav).toBeVisible();
      await expect(nav.locator(':scope > a')).toHaveText(lang === 'en'
        ? ['Records', 'Verified results', 'Auctions', 'Shortlist']
        : ['拍賣紀錄', '已核對結果', '日程', '收藏']);
      await expect(page.locator('.info-site-footer')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} ${lang}`).toBe(true);
      const heights = await page.locator('.lang-toggle button, .info-lang-option, button[data-save-plate], .ux-directory-more').evaluateAll(elements => elements.filter(el => el.getClientRects().length).map(el => el.getBoundingClientRect().height));
      for (const height of heights) expect(height, `${path} ${lang}`).toBeGreaterThanOrEqual(44);
      const more = nav.locator('.site-more > summary');
      await more.click();
      const destination = nav.getByRole('link', {name: lang === 'en' ? 'Historical prices' : '查歷史成交價', exact: true});
      await expect(destination).toBeVisible();
      expect(await destination.evaluate(el => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }), `${path}: menu is not clipped at ${width}px`).toBe(true);
      await page.keyboard.press('Escape');
      await expect(nav.locator('.site-more')).not.toHaveAttribute('open');
      await expect(more).toBeFocused();
    }
  });
}

test('page families have no serious automated accessibility violations', async ({page}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({width:375,height:812});
  for (const path of pages) {
    await page.goto(route(path, 'en'));
    await page.addScriptTag({content: axe.source});
    const issues = await page.evaluate(async () => (await window.axe.run(document, {
      runOnly: {type:'tag', values:['wcag2a', 'wcag2aa', 'wcag22aa']},
    })).violations.filter(issue => ['critical','serious'].includes(issue.impact))
      .map(issue => ({id:issue.id, targets:issue.nodes.map(node=>node.target)})));
    expect(issues, path).toEqual([]);
  }
});

test('archive language links retain the result bookmark with matching touch targets', async ({page}) => {
  await page.goto('/auction-results/tvrm_physical-2026-09-12.html#mark-1314');
  await page.getByRole('link',{name:'English',exact:true}).click();
  await expect(page).toHaveURL(/\/auction-results\/en\/tvrm_physical-2026-09-12\.html#mark-1314$/);
  await expect(page.locator('#mark-1314')).toBeVisible();
  await page.getByRole('link',{name:'繁體中文',exact:true}).click();
  await expect(page).toHaveURL(/\/auction-results\/tvrm_physical-2026-09-12\.html#mark-1314$/);
});
