import { expect, test } from "@playwright/test";
import axe from "axe-core";

function collectBrowserErrors(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    errors.push(err.message);
  });
  return errors;
}

async function expectNoBrowserErrors(errors) {
  expect(errors, `Unexpected browser errors:\n${errors.join("\n")}`).toEqual([]);
}

async function waitForResultRows(page, minRows = 1) {
  await page.waitForFunction(
    (count) => document.querySelectorAll("#rows tr:not(.empty-row)").length >= count,
    minRows,
  );
}

async function runAxe(page) {
  await page.addScriptTag({ content: axe.source });
  const results = await page.evaluate(async () => {
    return window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag22aa"],
      },
    });
  });
  const blocking = results.violations
    .filter((violation) => ["critical", "serious"].includes(violation.impact))
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.target.join(" ")).slice(0, 5),
    }));
  expect(blocking).toEqual([]);
}

test.describe("Plate.hk public API", () => {
  test("serves dataset, search, issue and agent discovery contracts", async ({ request }) => {
    const indexResp = await request.get("/api/v1/index.json");
    expect(indexResp.ok()).toBeTruthy();
    const index = await indexResp.json();
    expect(index.datasets.all.issue_key_field).toBe("auction_key");
    expect(index.datasets.all.total_rows).toBeGreaterThan(200_000);

    const searchResp = await request.get("/api/search", {
      params: {
        dataset: "all",
        q: "88",
        page: "1",
        page_size: "5",
        sort: "amount_desc",
      },
    });
    expect(searchResp.ok()).toBeTruthy();
    const search = await searchResp.json();
    expect(search.total).toBeGreaterThan(100);
    expect(search.rows[0]).toEqual(expect.objectContaining({
      dataset_key: expect.any(String),
      auction_key: expect.stringContaining("::"),
      amount_hkd: expect.any(Number),
    }));

    const issuesResp = await request.get("/api/issues", { params: { dataset: "all" } });
    expect(issuesResp.ok()).toBeTruthy();
    const issues = await issuesResp.json();
    const issue = issues.issues.find((item) => String(item.auction_key || "").includes("::"));
    expect(issue).toBeTruthy();

    const issueResp = await request.get("/api/issue", {
      params: {
        dataset: "all",
        auction_date: issue.auction_key,
      },
    });
    expect(issueResp.ok()).toBeTruthy();
    const issuePayload = await issueResp.json();
    expect(issuePayload.issue.auction_key).toBe(issue.auction_key);
    expect(issuePayload.rows.length).toBeGreaterThan(0);
    expect(issuePayload.rows.slice(0, 10).every((row) => row.auction_key === issue.auction_key)).toBe(true);

    const mcpResp = await request.get("/.well-known/mcp/server-card.json");
    expect(mcpResp.ok()).toBeTruthy();
    const mcp = await mcpResp.json();
    expect(JSON.stringify(mcp)).toContain("platehk_search");
  });

  test("rejects malformed public API input without server errors", async ({ request }) => {
    const invalidDataset = await request.get("/api/search", {
      params: {
        dataset: "../../etc/passwd",
        q: "88",
        page: "1",
        page_size: "5",
      },
    });
    expect(invalidDataset.status()).toBe(400);
    expect(await invalidDataset.json()).toEqual(expect.objectContaining({ error: expect.any(String) }));

    const oversizedPage = await request.get("/api/search", {
      params: {
        dataset: "all",
        q: "88",
        page: "1",
        page_size: "1000",
      },
    });
    expect(oversizedPage.status()).toBe(400);

    const visionGet = await request.get("/api/vision_plate.php");
    expect([400, 405]).toContain(visionGet.status());
  });
});

test.describe("Plate.hk browser journeys", () => {
  test("searches all datasets, opens an issue view and generates a share poster", async ({ page }) => {
    const errors = collectBrowserErrors(page);

    await page.goto("/");
    await expect(page.locator("#q")).toBeVisible();
    await expect(page.locator("#dataset")).toHaveValue("all");
    await waitForResultRows(page, 1);

    await page.locator("#q").fill("88");
    await expect(page).toHaveURL(/q=88/);
    await waitForResultRows(page, 3);
    await expect(page.locator("#rows tr").first()).toContainText("88");
    await expect(page.locator("#status")).toContainText(/88|全部|All|筆|rows/i);

    await page.locator("#rows .issue-jump-link").first().click();
    await expect(page).toHaveURL(/issue=/);
    await expect(page.locator("#issuePanel")).toBeVisible();
    await expect(page.locator("#issuePanel .issue-title")).not.toHaveText("");
    await expect(page.locator("#rows tr:not(.empty-row)").first()).toBeVisible();

    await page.locator("#rows .row-share-btn").first().click();
    await expect(page.locator("#shareModal")).toHaveClass(/open/);
    await expect(page.locator("#sharePreview")).toHaveAttribute("src", /^data:image\/png;base64,/);
    await page.locator("#shareClose").click();
    await expect(page.locator("#shareModal")).not.toHaveClass(/open/);

    await runAxe(page);
    await expectNoBrowserErrors(errors);
  });

  test("switches dataset, language, sorting and reset controls without losing result integrity", async ({ page }) => {
    const errors = collectBrowserErrors(page);

    await page.goto("/?d=tvrm_physical&lang=en");
    await expect(page.locator("#dataset")).toHaveValue("tvrm_physical");
    await expect(page.locator("#langEn")).toHaveAttribute("aria-pressed", "true");
    await waitForResultRows(page, 1);

    await page.locator("#q").fill("HK");
    await waitForResultRows(page, 1);
    await expect(page.locator("#rows .category-pill").first()).toContainText(/TVRM|Traditional|traditional/i);

    await page.locator("#sort").selectOption("plate_asc");
    await expect(page).toHaveURL(/sort=plate_asc/);
    await waitForResultRows(page, 1);

    await page.locator("#langZh").click();
    await expect(page.locator("#langZh")).toHaveAttribute("aria-pressed", "true");

    await page.locator("#reset").click();
    await expect(page.locator("#q")).toHaveValue("");
    await expect(page.locator("#issue")).toHaveValue("");
    await waitForResultRows(page, 1);

    await expectNoBrowserErrors(errors);
  });

  test("loads audit, API docs, changelog, MCP docs and camera manual search surfaces", async ({ page }, testInfo) => {
    const errors = collectBrowserErrors(page);

    await page.goto("/audit.html");
    await expect(page.locator("#tbody tr").first()).toBeVisible();
    await page.locator("#issueQuery").fill("2026");
    await expect(page.locator("#tbody tr").first()).toContainText("2026");
    await page.locator("#problemsOnly").check();
    await expect(page.locator("#auditSummary")).toContainText(/問題|problem|0/i);
    await runAxe(page);

    await page.goto("/api.html?lang=en");
    await expect(page.locator("#title")).toHaveText("API Docs");
    await expect(page.locator("#content")).toContainText("/api/v1/index.json");

    await page.goto("/changelog.html?lang=en");
    await expect(page.locator("#title")).toContainText(/Change|Update/i);
    await expect(page.locator("#entries")).not.toBeEmpty();

    await page.goto("/mcp.html?lang=en");
    await expect(page.locator("#content")).toContainText(/MCP|platehk_search/i);

    await page.goto("/camera.html?lang=en");
    await expect(page.locator("#manualInput")).toBeVisible();
    await page.locator("#manualInput").fill("88");
    await page.locator("#manualSearchBtn").click();
    await expect(page.locator("#results .result-row").first()).toBeVisible();
    await expect(page.locator("#resultsBadge")).toContainText(/row|筆/i);

    if (testInfo.project.name.includes("mobile")) {
      await expect(page.locator("#startBtn")).toBeVisible();
      await expect(page.locator("#openSearchLink")).toBeVisible();
    }

    await expectNoBrowserErrors(errors);
  });
});
