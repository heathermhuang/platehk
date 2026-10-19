import { test, expect } from '@playwright/test';

const id = `reg_${'a'.repeat(32)}`;
const claimToken = `phc_${id}.${'b'.repeat(64)}`;
const managementToken = `phm_${id}.${'c'.repeat(64)}`;

test('human can claim revocation control and revoke from the responsive page', async ({ page }) => {
  let claims = 0, revocations = 0;
  await page.route('**/api/agent/claim', async route => {
    expect(route.request().postDataJSON()).toEqual({ claim_token: claimToken });
    claims++;
    await route.fulfill({ json: { registration_id: id, scope: 'auction:read', expires_at: '2026-10-20T00:00:00.000Z', management_token: managementToken } });
  });
  await page.route('**/api/agent/revoke', async route => {
    expect(new URLSearchParams(route.request().postData()).get('token')).toBe(managementToken);
    revocations++;
    await route.fulfill({ json: {} });
  });
  const response = await page.goto('/agent/claim');
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['referrer-policy']).toBe('no-referrer');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('管理代理程式存取權限');
  await expect(page.locator('#management')).toBeHidden();
  await page.locator('#claim-token').fill(claimToken);
  await page.getByRole('button', { name: '接管 / Take control' }).click();
  await expect(page.locator('#management-token')).toHaveValue(managementToken);
  await expect(page.locator('#claim-form')).toBeHidden();
  await expect(page.locator('#claim-token')).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await page.getByRole('button', { name: '撤銷 / Revoke access' }).click();
  await expect(page.getByRole('status')).toContainText('Revocation processed');
  await expect(page.locator('#management-token')).toHaveValue('');
  await expect(page.locator('#revoke-token')).toHaveValue('');
  expect(claims).toBe(1);
  expect(revocations).toBe(1);
});

test('claim failures keep an accessible retry path and never expose a management token', async ({ page }) => {
  await page.route('**/api/agent/claim', route => route.fulfill({ status: 401, json: { error: 'invalid_token' } }));
  await page.goto('/agent/claim');
  await page.locator('#claim-token').fill(claimToken);
  await page.getByRole('button', { name: '接管 / Take control' }).click();
  await expect(page.getByRole('status')).toContainText('Could not claim');
  await expect(page.getByRole('button', { name: '接管 / Take control' })).toBeEnabled();
  await expect(page.locator('#management')).toBeHidden();
});
