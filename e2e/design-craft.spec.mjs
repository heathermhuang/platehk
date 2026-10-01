import { expect, test } from "@playwright/test";
import axe from "axe-core";

test("the archive example opens exact history, preserves language, and resets to the introduction", async ({ page }, testInfo) => {
  await page.goto("/?lang=en");
  await expect(page.locator("#archive-heading")).toContainText("By the number.");
  await expect(page.getByRole("link", { name: "查歷史成交價", exact: true })).toBeHidden();
  await page.addScriptTag({ content: axe.source });
  const homeViolations = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag22aa"] },
  })).violations.filter(v => ["critical", "serious"].includes(v.impact)).map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })));
  expect(homeViolations).toEqual([]);
  await page.getByRole("link", { name: "Explore the auction history of 88", exact: true }).click();
  await expect(page.locator("#q")).toHaveValue("88");
  await expect(page.locator("#matchMode")).toHaveValue("exact");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator(".archive-intro")).toBeHidden();
  await expect(page.locator("#rows tr:not(.empty-row)").first()).toBeVisible();
  await expect(page.locator("#rows tr:not(.empty-row)").first()).toHaveAttribute("data-plate", "88");
  await page.locator("#reset").click();
  await expect(page.locator("#q")).toHaveValue("");
  await expect(page.locator(".archive-intro")).toBeVisible();
  await page.locator("#langZh").click();
  await expect(page.locator("#archive-heading")).toContainText("有跡可尋。");
  await expect(page.getByRole("link", { name: "Historical prices", exact: true })).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("archive-home.png") });
});

test("keyboard users can skip the introduction and search with reduced motion", async ({ page }) => {
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
  await expect(page.locator(".archive-intro")).toBeHidden();
  await expect(page.locator("#rows tr:not(.empty-row)").first()).toBeVisible();
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag22aa"] },
  })).violations.filter(v => ["critical", "serious"].includes(v.impact)).map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })));
  expect(violations).toEqual([]);
});
