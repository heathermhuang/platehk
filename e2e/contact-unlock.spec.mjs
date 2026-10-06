import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
async function checkAccessibility(page) {
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const issues=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})).violations.map(item=>({id:item.id,nodes:item.nodes.map(node=>node.target)})));
  expect(issues).toEqual([]);
}
const signal = { availability_detected: true, plate: 'TEST8', listing_id: 'n100001', source_url: 'https://m.28car.com/num_dsp.php?h_vid=50000001', contact_unlock_available: true };
const preview = {available:true,price_hkd:99,plate:'TEST8',listing_id:'n100001',asking_price_hkd:88000,observed_at:new Date().toISOString(),source_url:signal.source_url};
const contact = { ...preview, plate: 'TEST8', listing_id: 'n100001', whatsapp_number: '85261112222', whatsapp_url: 'https://wa.me/85261112222' };
async function sources(page) { await page.route('**/api/market_signal?*', route => route.fulfill({ json: signal })); }
test('HK$99 checkout discloses the free source and opens Stripe', async ({page},testInfo) => {
  await sources(page);
  await page.route('**/api/contact/availability', route => { expect(route.request().method()).toBe('POST'); return route.fulfill({ json: preview }); });
  let submitted;
  await page.route('**/api/contact/checkout', route => { submitted = route.request().postDataJSON(); return route.fulfill({json:{checkout_url:'https://checkout.stripe.com/c/pay/fixture'}}); });
  await page.route('https://checkout.stripe.com/**', route => route.fulfill({body:'Test checkout destination'}));
  await page.goto('/contact.html?plate=TEST8&listing_id=n100001&lang=en');
  await expect(page.getByRole('button',{name:'Continue to payment — HK$99'})).toBeVisible();
  await expect(page.getByText('Seller’s asking price: HK$88,000')).toBeVisible();
  await expect(page.getByText('One-time payment · No account needed · Not the plate price')).toBeVisible();
  await expect(page.locator('#phone')).toBeHidden();
  await checkAccessibility(page);
  await page.screenshot({path:testInfo.outputPath('contact-ready.png'),fullPage:true});
  await page.getByText('What to know before paying',{exact:true}).click();
  await expect(page.getByText('The original listing is free to view',{exact:false})).toBeVisible();
  await expect(page.getByRole('link',{name:'View this 28car listing for free'})).toHaveAttribute('href',signal.source_url);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Continue to payment — HK$99'}).click();
  await expect(page).toHaveURL('https://checkout.stripe.com/c/pay/fixture');
  expect(submitted).toEqual({plate:'TEST8',listing_id:'n100001',lang:'en'});
});
test('paid return reveals contact and restores it without charging again', async ({page},testInfo) => {
  let reveals = 0;
  await page.route('**/api/contact/reveal', route => { reveals++; return route.fulfill({json:contact}); });
  await page.route('**/api/contact/checkout', () => { throw new Error('Purchased contact must not trigger checkout'); });
  await page.goto('/contact.html?session_id=cs_test_fixture&lang=en');
  await expect(page.getByText('Payment confirmed · Contact unlocked')).toBeVisible();
  await expect(page.getByRole('link',{name:'Contact seller on WhatsApp'})).toHaveAttribute('href', `${contact.whatsapp_url}?text=${encodeURIComponent('Hi, I’m interested in plate TEST8. Is it still available?')}`);
  await expect(page).not.toHaveURL(/session_id/);
  await expect(page.getByRole('button',{name:'Continue to payment — HK$99'})).toBeHidden();
  await expect(page.locator('#phone')).toHaveValue('+852 6111 2222');
  await expect(page.getByRole('heading',{name:'Your seller contact is ready'})).toBeVisible();
  await checkAccessibility(page);
  await page.screenshot({path:testInfo.outputPath('contact-paid.png'),fullPage:true});
  await page.reload();
  await expect(page.getByText('Payment confirmed · Contact unlocked')).toBeVisible();
  expect(reveals).toBe(2);
});
test('unknown contact never offers payment', async ({page}) => {
  await sources(page);
  await page.route('**/api/contact/availability', route => route.fulfill({status:404,json:{error:'contact_unavailable'}}));
  await page.goto('/contact.html?plate=TEST8&listing_id=n100001&lang=en');
  await expect(page.getByText('We can’t offer this unlock right now.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Continue to payment — HK$99'})).toBeHidden();
});
test('payment pending allows retry and never exposes a number', async ({page}) => {
  let attempts = 0;
  await page.route('**/api/contact/reveal', route => { attempts++; return route.fulfill(attempts === 1 ? {status:409,json:{error:'payment_pending'}} : {json:contact}); });
  await page.goto('/contact.html?session_id=cs_test_fixture&lang=en');
  await expect(page.getByText('Payment isn’t confirmed yet.',{exact:false})).toBeVisible();
  await expect(page.getByRole('link',{name:'Contact seller on WhatsApp'})).toBeHidden();
  await page.getByRole('button',{name:'Check again'}).click();
  await expect(page.getByText('Payment confirmed · Contact unlocked')).toBeVisible();
});

test('cancelled checkout keeps the plate context and offers a calm retry',async({page},testInfo)=>{
  await page.route('**/api/contact/availability',route=>route.fulfill({json:preview}));
  await page.goto('/contact.html?plate=TEST8&listing_id=n100001&cancelled=1&lang=en');
  await expect(page.getByText('Checkout cancelled. Continue whenever you’re ready.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Continue to payment — HK$99'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Back to search'})).toHaveAttribute('href','/?q=TEST8&lang=en');
  await page.screenshot({path:testInfo.outputPath('contact-cancelled.png'),fullPage:true});
});
test('an inaccessible purchase gives direct help without another payment button',async({page})=>{
  await page.route('**/api/contact/reveal',route=>route.fulfill({status:403,json:{error:'original_browser_required'}}));
  await page.goto('/contact.html?session_id=cs_test_fixture&lang=en');
  await expect(page.getByText('Open this page in the browser you used to pay.',{exact:false})).toBeVisible();
  await expect(page.getByRole('link',{name:'Need help with payment or this contact?'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Continue to payment — HK$99'})).toBeHidden();
  await expect(page.locator('#phone')).toBeHidden();
});
test('Chinese contact screen works at 320px and 200 percent text size',async({page})=>{
  await page.setViewportSize({width:320,height:800});
  await page.route('**/api/contact/availability',route=>route.fulfill({json:preview}));
  await page.goto('/contact.html?plate=TEST8&listing_id=n100001');
  await expect(page.getByRole('button',{name:'繼續付款 — HK$99'})).toBeVisible();
  await expect(page.getByText('賣家叫價：HK$88,000')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.addStyleTag({content:'html {font-size:200% !important}'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('clipboard failure selects the number for a manual copy',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('Permission denied'))}}));
  await page.route('**/api/contact/reveal',route=>route.fulfill({json:contact}));
  await page.goto('/contact.html?session_id=cs_test_fixture&lang=en');
  await expect(page.getByRole('button',{name:'Copy number'})).toBeVisible();
  await page.getByRole('button',{name:'Copy number'}).click();
  await expect(page.locator('#copy-status')).toHaveText('The number is selected. Use your device’s Copy action.');
  expect(await page.locator('#phone').evaluate(input=>input.selectionStart===0 && input.selectionEnd===input.value.length)).toBe(true);
});
test('pending payment automatically rechecks only three times',async({page})=>{
  let checks=0;
  await page.route('**/api/contact/reveal',route=>{checks++;return route.fulfill({status:409,json:{error:'payment_pending'}});});
  await page.goto('/contact.html?session_id=cs_test_fixture&lang=en');
  await expect.poll(()=>checks,{timeout:9000}).toBe(3);
  await page.waitForTimeout(3500);
  expect(checks).toBe(3);
  await expect(page.getByRole('button',{name:'Check again'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Continue to payment — HK$99'})).toBeHidden();
});

test('blocked local storage preserves the paid return URL instead of offering another purchase',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new Error('Storage blocked');}}));
  let checks=0;
  await page.route('**/api/contact/reveal',route=>{checks++;return route.fulfill({json:contact});});
  await page.goto('/contact.html?session_id=cs_test_fixture&lang=en');
  await expect(page.getByRole('heading',{name:'Your seller contact is ready'})).toBeVisible();
  await expect(page).toHaveURL(/session_id=cs_test_fixture/);
  await page.reload();
  await expect(page.getByRole('heading',{name:'Your seller contact is ready'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Continue to payment — HK$99'})).toBeHidden();
  expect(checks).toBe(2);
});
