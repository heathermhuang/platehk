import { test, expect } from '@playwright/test';
const signal = { availability_detected: true, plate: 'TEST8', listing_id: 'n100001', source_url: 'https://m.28car.com/num_dsp.php?h_vid=50000001', contact_unlock_available: true };
const contact = { plate: 'TEST8', listing_id: 'n100001', whatsapp_number: '85261112222', whatsapp_url: 'https://wa.me/85261112222' };
async function sources(page) { await page.route('**/api/market_signal?*', route => route.fulfill({ json: signal })); }
test('HK$99 checkout discloses the free source and opens Stripe', async ({page}) => {
  await sources(page);
  await page.route('**/api/contact/availability', route => { expect(route.request().method()).toBe('POST'); return route.fulfill({ json: {available:true,price_hkd:99,plate:'TEST8',listing_id:'n100001'} }); });
  let submitted;
  await page.route('**/api/contact/checkout', route => { submitted = route.request().postDataJSON(); return route.fulfill({json:{checkout_url:'https://checkout.stripe.com/c/pay/fixture'}}); });
  await page.route('https://checkout.stripe.com/**', route => route.fulfill({body:'Test checkout destination'}));
  await page.goto('/contact.html?plate=TEST8&listing_id=n100001&lang=en');
  await expect(page.getByRole('button',{name:'Pay HK$99 and unlock'})).toBeVisible();
  await expect(page.getByText('The source listing is free',{exact:false})).toBeVisible();
  await expect(page.getByRole('link',{name:'View free 28car listing'})).toHaveAttribute('href',signal.source_url);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Pay HK$99 and unlock'}).click();
  await expect(page).toHaveURL('https://checkout.stripe.com/c/pay/fixture');
  expect(submitted).toEqual({plate:'TEST8',listing_id:'n100001',lang:'en'});
});
test('paid return reveals contact and restores it without charging again', async ({page},testInfo) => {
  let reveals = 0;
  await page.route('**/api/contact/reveal', route => { reveals++; return route.fulfill({json:contact}); });
  await page.route('**/api/contact/checkout', () => { throw new Error('Purchased contact must not trigger checkout'); });
  await page.goto('/contact.html?session_id=cs_test_fixture&lang=en');
  await expect(page.getByText('Payment confirmed. Seller WhatsApp: +85261112222')).toBeVisible();
  await expect(page.getByRole('link',{name:'Open seller WhatsApp'})).toHaveAttribute('href',contact.whatsapp_url);
  await expect(page).not.toHaveURL(/session_id/);
  await expect(page.getByRole('button',{name:'Pay HK$99 and unlock'})).toBeHidden();
  await page.screenshot({path:`/private/tmp/platehk-unlock-${testInfo.project.name}-paid.png`});
  await page.reload();
  await expect(page.getByText('Payment confirmed. Seller WhatsApp: +85261112222')).toBeVisible();
  expect(reveals).toBe(2);
});
test('unknown contact never offers payment', async ({page}) => {
  await sources(page);
  await page.route('**/api/contact/availability', route => route.fulfill({status:404,json:{error:'contact_unavailable'}}));
  await page.goto('/contact.html?plate=TEST8&listing_id=n100001&lang=en');
  await expect(page.getByText('This contact cannot be unlocked right now.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Pay HK$99 and unlock'})).toBeHidden();
});
test('payment pending allows retry and never exposes a number', async ({page}) => {
  let attempts = 0;
  await page.route('**/api/contact/reveal', route => { attempts++; return route.fulfill(attempts === 1 ? {status:409,json:{error:'payment_pending'}} : {json:contact}); });
  await page.goto('/contact.html?session_id=cs_test_fixture&lang=en');
  await expect(page.getByText('Payment is not confirmed yet.',{exact:false})).toBeVisible();
  await expect(page.getByRole('link',{name:'Open seller WhatsApp'})).toBeHidden();
  await page.getByRole('button',{name:'Check payment again'}).click();
  await expect(page.getByText('Payment confirmed. Seller WhatsApp: +85261112222')).toBeVisible();
});
