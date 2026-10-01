import { expect, test } from "@playwright/test";
import axe from "axe-core";

test("the first plate, price and source controls fit a narrow phone in both languages", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 812 });
  for (const language of ["en", "zh"]) {
    await page.goto(`/?lang=${language}`);
    const firstRow = page.locator("#rows tr:not(.empty-row)").first();
    await expect(firstRow).toBeVisible();
    for (const selector of [".col-single", ".col-price", ".col-source"]) {
      await expect(firstRow.locator(selector)).toBeInViewport({ ratio: 1 });
    }
    await page.screenshot({ path: testInfo.outputPath(`data-first-${language}-320.png`) });
  }
});

test("auction data is visible on arrival and exact search preserves language through reset", async ({ page }, testInfo) => {
  await page.goto("/?lang=en");
  await expect(page.locator("#rows tr:not(.empty-row)").first()).toBeVisible();
  await expect(page.locator("#rows .col-single").first()).toBeInViewport({ ratio: 1 });
  await expect(page.locator("#rows .col-price").first()).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("link", { name: "查歷史成交價", exact: true })).toBeHidden();
  await page.addScriptTag({ content: axe.source });
  const homeViolations = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag22aa"] },
  })).violations.filter(v => ["critical", "serious"].includes(v.impact)).map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })));
  expect(homeViolations).toEqual([]);
  await page.locator("#q").fill("88");
  await expect(page.locator("#q")).toHaveValue("88");
  await expect(page.locator("#matchMode")).toHaveValue("exact");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#rows tr:not(.empty-row)").first()).toBeVisible();
  await expect(page.locator("#rows tr:not(.empty-row)").first()).toHaveAttribute("data-plate", "88");
  await page.locator("#reset").click();
  await expect(page.locator("#q")).toHaveValue("");
  await page.locator("#langZh").click();
  await expect(page.locator("#titleMain")).toContainText("香港車牌拍賣資料庫");
  await expect(page.getByRole("link", { name: "Historical prices", exact: true })).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("archive-home.png") });
});

test("keyboard users can reach search directly with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跳至車牌搜尋", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#archive-search")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#q")).toBeFocused();
  await page.keyboard.type("1314");
  await expect(page).toHaveURL(/q=1314/);
  await expect(page.locator("#rows tr:not(.empty-row)").first()).toBeVisible();
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag22aa"] },
  })).violations.filter(v => ["critical", "serious"].includes(v.impact)).map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })));
  expect(violations).toEqual([]);
});
