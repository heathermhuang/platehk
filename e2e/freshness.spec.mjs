import { expect, test } from "@playwright/test";

async function installDataApiRoutes(page, generatedAtByDataset) {
  await page.route("**/api/issues?**", async (route) => {
    const dataset = new URL(route.request().url()).searchParams.get("dataset") || "all";
    await route.fulfill({
      json: {
        generated_at: generatedAtByDataset[dataset] ?? null,
        total_rows: 0,
        issue_count: 0,
        top_amount_hkd: null,
        issues: [],
      },
    });
  });
  await page.route("**/api/results?**", async (route) => {
    await route.fulfill({ json: { total: 0, page: 1, page_size: 50, rows: [] } });
  });
}

test("dataset freshness is rendered from each API payload", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installDataApiRoutes(page, {
    all: "2026-08-12",
    pvrm: "2026-07-23",
  });

  await page.goto("/?lang=en&dataset=all");
  await expect.poll(() => pageErrors).toEqual([]);
  await expect(page.locator("#updatedAt")).toHaveText("Last updated: 12 Aug 2026");

  await page.locator("#dataset").selectOption("pvrm");
  await expect(page.locator("#updatedAt")).toHaveText("Last updated: 23 Jul 2026");
});

test("invalid API freshness never falls back to the viewer clock", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installDataApiRoutes(page, { all: "2026-02-30" });

  await page.goto("/?lang=en&dataset=all");
  await expect.poll(() => pageErrors).toEqual([]);
  await expect(page.locator("#updatedAt")).toHaveText("Dataset update unavailable");
});
