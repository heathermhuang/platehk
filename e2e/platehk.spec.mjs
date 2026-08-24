import { expect, test } from "@playwright/test";
import axe from "axe-core";
import { readFileSync, readdirSync } from "node:fs";

const generatedMarketPage = readdirSync(new URL("../plates/", import.meta.url))
  .filter((filename) => filename.endsWith(".html"))
  .map((filename) => ({
    filename,
    html: readFileSync(new URL(`../plates/${filename}`, import.meta.url), "utf8"),
  }))
  .find(({ html }) => html.includes("data-market-card"));
const generatedMarketPlate = generatedMarketPage?.html.match(/data-market-card data-plate="([A-Z0-9]+)"/)?.[1];

function collectBrowserErrors(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const sourceUrl = msg.location().url || "";
    if (msg.text().startsWith("Failed to load resource") && sourceUrl.startsWith("https://fonts.gstatic.com/")) return;
    errors.push(sourceUrl ? `${msg.text()} (${sourceUrl})` : msg.text());
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

async function readResultTableLayout(page) {
  return page.locator("#resultsTable").evaluate((table) => {
    const rect = (element) => {
      const bounds = element.getBoundingClientRect();
      return {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
        right: Math.round(bounds.right),
        bottom: Math.round(bounds.bottom),
      };
    };
    const details = (element) => ({
      id: element.id,
      className: element.className,
      display: getComputedStyle(element).display,
      rect: rect(element),
    });
    const firstRow = table.querySelector("#rows tr:not(.empty-row)");
    const sourceCell = firstRow?.querySelector(".col-source");
    return {
      mode: table.closest(".table-wrap")?.className || "",
      viewportWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      headerDisplay: getComputedStyle(table.tHead).display,
      headers: Array.from(table.tHead.querySelectorAll("th")).map(details),
      row: rect(firstRow),
      rowDisplay: getComputedStyle(firstRow).display,
      cells: Array.from(firstRow.children).map(details),
      source: rect(sourceCell),
      actions: Array.from(sourceCell.querySelectorAll(".icon-btn")).map(rect),
    };
  });
}

function expectContained(inner, outer, tolerance = 1) {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - tolerance);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - tolerance);
  expect(inner.right).toBeLessThanOrEqual(outer.right + tolerance);
  expect(inner.bottom).toBeLessThanOrEqual(outer.bottom + tolerance);
}

function expectSingleDesktopRow(layout, expectedIdsOrClasses) {
  const visibleHeaders = layout.headers.filter(({ display }) => display !== "none");
  const visibleCells = layout.cells.filter(({ display }) => display !== "none");
  expect(visibleHeaders.map(({ id }) => id)).toEqual(expectedIdsOrClasses.headers);
  expect(visibleCells.map(({ className }) => className)).toEqual(expectedIdsOrClasses.cells);
  expect(new Set(visibleHeaders.map(({ rect: bounds }) => bounds.y)).size).toBe(1);
  expect(new Set(visibleCells.map(({ rect: bounds }) => bounds.y)).size).toBe(1);
  expect(new Set(visibleCells.map(({ rect: bounds }) => bounds.bottom)).size).toBe(1);
  for (const cell of visibleCells) expectContained(cell.rect, layout.row);
  expect(visibleCells.at(-1).className).toBe("col-source");
  expect(visibleCells.at(-1).rect.x).toBeGreaterThan(visibleCells.at(-2).rect.x);
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

function futureAuctionEvents(count) {
  const baseStart = Date.now() + 86_400_000;
  return Array.from({ length: count }, (_, index) => ({
    id: `test-event-${index + 1}`,
    type: index === 0 ? "pvrm_registration" : "tvrm_physical",
    start_at: new Date(baseStart + (index * 86_400_000)).toISOString(),
    end_at: new Date(baseStart + ((index + 1) * 86_400_000)).toISOString(),
    date_label_en: `Test event ${index + 1}`,
    date_label_zh: `測試日程 ${index + 1}`,
    source_page_url_en: "https://www.td.gov.hk/en/",
    source_page_url_zh: "https://www.td.gov.hk/tc/",
  }));
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

    for (const protocol of ["2025-06-18", "2025-03-26"]) {
      const toolsResp = await request.post("/mcp", {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": protocol,
        },
        data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      });
      expect(toolsResp.ok()).toBeTruthy();
      expect(await toolsResp.text()).toContain("platehk_search");
    }
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

    const visionGet = await request.get("/api/vision_plate");
    expect([400, 405]).toContain(visionGet.status());
  });

  test("serves declared HTML canonicals without breaking machine routes", async ({ request }) => {
    const aboutHtml = await request.get("/about.html");
    expect(aboutHtml.status()).toBe(200);
    const primaryHost = { host: "plate.hk" };

    const aboutAlias = await request.get("/about", { headers: primaryHost, maxRedirects: 0 });
    expect(aboutAlias.status()).toBe(301);
    expect(aboutAlias.headers().location).toContain("/about.html");

    const plateIndexAlias = await request.get("/plates/", { headers: primaryHost, maxRedirects: 0 });
    expect(plateIndexAlias.status()).toBe(301);
    expect(plateIndexAlias.headers().location).toContain("/plates/index.html");

    const mcpTransport = await request.get("/mcp", { headers: primaryHost, maxRedirects: 0 });
    expect(mcpTransport.status()).toBe(405);
    expect(mcpTransport.headers().location).toBeUndefined();

    const utilityJson = await request.get("/data/hot_search/manifest.json", { headers: primaryHost });
    expect(utilityJson.status()).toBe(200);
    expect(utilityJson.headers()["x-robots-tag"]).toContain("noindex");
  });
});

test.describe("Plate.hk browser journeys", () => {
  test("keeps source and share controls inside each desktop row and mobile card", async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name.includes("mobile");
    const errors = collectBrowserErrors(page);

    await page.goto("/?lang=zh&d=pvrm&sort=amount_desc");
    await waitForResultRows(page, 2);
    const datasetLayout = await readResultTableLayout(page);
    expect(datasetLayout.mode).toContain("mode-dataset");
    expect(datasetLayout.documentScrollWidth).toBeLessThanOrEqual(datasetLayout.viewportWidth);
    expect(datasetLayout.actions).toHaveLength(2);
    for (const action of datasetLayout.actions) expectContained(action, datasetLayout.source);

    if (isMobile) {
      expect(datasetLayout.headerDisplay).toBe("none");
      expect(datasetLayout.rowDisplay).toBe("grid");
      expect(datasetLayout.cells.find(({ className }) => className === "col-category")?.display).toBe("none");
      for (const cell of datasetLayout.cells.filter(({ display }) => display !== "none")) {
        expectContained(cell.rect, datasetLayout.row);
      }
    } else {
      expectSingleDesktopRow(datasetLayout, {
        headers: ["thDate", "thSingle", "thDouble", "thPrice", "thPdf"],
        cells: ["col-date", "col-single", "col-double", "col-price", "col-source"],
      });
    }

    await page.locator("#issue").selectOption({ index: 1 });
    await expect(page).toHaveURL(/issue=/);
    await waitForResultRows(page, 2);
    const issueLayout = await readResultTableLayout(page);
    expect(issueLayout.mode).toContain("mode-issue");
    expect(issueLayout.documentScrollWidth).toBeLessThanOrEqual(issueLayout.viewportWidth);
    expect(issueLayout.actions).toHaveLength(2);
    for (const action of issueLayout.actions) expectContained(action, issueLayout.source);

    if (isMobile) {
      expect(issueLayout.headerDisplay).toBe("none");
      expect(issueLayout.rowDisplay).toBe("grid");
      expect(issueLayout.cells.find(({ className }) => className === "col-date")?.display).toBe("none");
      expect(issueLayout.cells.find(({ className }) => className === "col-category")?.display).toBe("none");
      for (const cell of issueLayout.cells.filter(({ display }) => display !== "none")) {
        expectContained(cell.rect, issueLayout.row);
      }
    } else {
      expectSingleDesktopRow(issueLayout, {
        headers: ["thSingle", "thDouble", "thPrice", "thPdf"],
        cells: ["col-single", "col-double", "col-price", "col-source"],
      });
    }

    await expectNoBrowserErrors(errors);
  });

  test("keeps SEO answer pages readable without viewport overflow", async ({ page }) => {
    const errors = collectBrowserErrors(page);
    const isMobile = page.viewportSize().width <= 620;

    await page.goto("/about.html");
    await expect(page.locator("h1")).toContainText("香港車牌拍賣資料");
    await expect(page.locator("#answers-title")).toBeVisible();
    await expect(page.getByText("PVRM、TVRM 實體拍賣及拍牌易有甚麼分別？", { exact: false })).toBeVisible();
    await expect(page.locator('a[href*="pvrm_auction"]').first()).toBeVisible();
    await expect(page.getByText("GET /api/search?dataset=all&q=88", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (isMobile) {
      await expect(page.locator(".responsive-table tbody tr").first()).toHaveCSS("display", "block");
      await expect(page.locator(".responsive-table tbody tr").first().locator("th")).toHaveCSS("display", "grid");
      await expect(page.locator(".responsive-table tbody tr").first().locator("td").nth(3)).toHaveAttribute("data-label", "Scope");
    }

    await page.goto("/plates/88.html");
    await expect(page.locator("h1")).toContainText("88 車牌拍賣結果");
    await expect(page.getByText("直接答案 / Direct Answers", { exact: true })).toBeVisible();
    await expect(page.getByText("What public auction records exist for Hong Kong plate 88?", { exact: false })).toBeVisible();
    await expect(page.locator('a[href*="td.gov.hk"]').first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (isMobile) {
      await expect(page.locator(".responsive-table tbody tr").first()).toHaveCSS("display", "block");
      await expect(page.locator(".responsive-table tbody tr").first().locator("td").first()).toHaveCSS("display", "grid");
      await expect(page.locator(".responsive-table tbody tr").first().locator("td").nth(3)).toHaveAttribute("data-label", "來源 / Source");
    }

    await expectNoBrowserErrors(errors);
  });

  test("shows at most four auction events in the desktop calendar slider", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes("desktop"), "Desktop-only calendar behavior");
    const errors = collectBrowserErrors(page);
    await page.route("**/data/events.json", (route) => route.fulfill({ json: { events: futureAuctionEvents(6) } }));

    await page.goto("/?lang=en");
    const slider = page.locator("[data-agenda-slider]");
    await expect(slider).toBeVisible();
    await expect(slider.locator(".agenda-item")).toHaveCount(6);
    await expect(slider.locator("[data-agenda-range]")).toHaveText("1–4 / 6");
    await expect(slider.locator("[data-agenda-previous]")).toBeDisabled();

    const listBox = await slider.locator(".agenda-list").boundingBox();
    const fifthBox = await slider.locator(".agenda-item").nth(4).boundingBox();
    expect(fifthBox.x).toBeGreaterThanOrEqual(listBox.x + listBox.width);

    await slider.locator("[data-agenda-next]").click();
    await expect(slider.locator("[data-agenda-range]")).toHaveText("2–5 / 6");
    await expect.poll(async () => slider.locator(".agenda-item").nth(4).evaluate((item) => {
      const list = item.closest(".agenda-list");
      const itemRect = item.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      return itemRect.left >= listRect.left - 1 && itemRect.right <= listRect.right + 1;
    })).toBe(true);

    await slider.locator("[data-agenda-next]").click();
    await expect(slider.locator("[data-agenda-range]")).toHaveText("3–6 / 6");
    await expect(slider.locator("[data-agenda-next]")).toBeDisabled();
    await expect(slider.locator("[data-agenda-previous]")).toBeEnabled();
    await slider.locator("[data-agenda-previous]").click();
    await expect(slider.locator("[data-agenda-range]")).toHaveText("2–5 / 6");

    await slider.locator(".agenda-list").evaluate((list) => list.scrollTo({ left: list.scrollWidth, behavior: "auto" }));
    await expect(slider.locator("[data-agenda-range]")).toHaveText("3–6 / 6");

    await page.locator("#langZh").click();
    await expect(page.locator("[data-agenda-slider]")).toHaveCount(1);
    await expect(page.locator("[data-agenda-range]")).toHaveText("1–4 / 6");
    await expect(page.locator("[data-agenda-previous]")).toHaveAttribute("aria-label", "顯示較早的拍賣日程");
    await page.locator("[data-agenda-next]").click();
    await expect(page.locator("[data-agenda-range]")).toHaveText("2–5 / 6");

    await page.setViewportSize({ width: 800, height: 900 });
    await expect(page.locator(".agenda-slider-controls")).toBeHidden();
    await expect.poll(async () => page.locator(".agenda-list").evaluate((list) => ({
      scrollLeft: list.scrollLeft,
      hasHorizontalOverflow: list.scrollWidth > list.clientWidth + 1,
    }))).toEqual({ scrollLeft: 0, hasHorizontalOverflow: false });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => page.locator(".agenda-item").evaluateAll((items) => {
      const first = items[0].getBoundingClientRect();
      return items.slice(1).every((item) => item.getBoundingClientRect().top > first.top);
    })).toBe(true);

    await page.setViewportSize({ width: 1366, height: 900 });
    await expect(page.locator(".agenda-slider-controls")).toBeVisible();
    await expect(page.locator("[data-agenda-range]")).toHaveText("1–4 / 6");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator(".agenda-list").evaluate((list) => {
      const nativeScrollTo = list.scrollTo.bind(list);
      list.scrollTo = (options) => {
        list.dataset.lastScrollBehavior = options.behavior;
        nativeScrollTo(options);
      };
    });
    await page.locator("[data-agenda-next]").click();
    await expect(page.locator(".agenda-list")).toHaveAttribute("data-last-scroll-behavior", "auto");
    await expectNoBrowserErrors(errors);
  });

  test("does not create a desktop slider for exactly four auction events", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes("desktop"), "Desktop-only calendar behavior");
    const errors = collectBrowserErrors(page);
    await page.route("**/data/events.json", (route) => route.fulfill({ json: { events: futureAuctionEvents(4) } }));

    await page.goto("/?lang=en");
    const agenda = page.locator(".auction-agenda");
    await expect(agenda.locator(".agenda-item")).toHaveCount(4);
    await expect(agenda.locator("[data-agenda-slider]")).toHaveCount(0);
    await expect(agenda.locator(".agenda-slider-controls")).toHaveCount(0);
    await expect(agenda.locator(".agenda-list")).toHaveJSProperty("scrollWidth", await agenda.locator(".agenda-list").evaluate((list) => list.clientWidth));
    await expectNoBrowserErrors(errors);
  });

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

  test("shows the WhatsApp buyer enquiry only for an exact active external signal", async ({ page }) => {
    const errors = collectBrowserErrors(page);
    await page.addInitScript(() => {
      window.__platehkOpenedUrls = [];
      window.open = (url) => {
        window.__platehkOpenedUrls.push(String(url));
        return null;
      };
    });
    await page.route("**/api/market_signal?*", async (route) => {
      const plates = new URL(route.request().url()).searchParams.get("plates").split(",");
      await route.fulfill({
        json: {
          plates_requested: plates.length,
          signals: plates.includes("88") ? [{
            plate: "88",
            availability_detected: true,
            source: "28car",
            offer_count: 1,
            asking_prices_hkd: [888000],
            has_contact_price: false,
            observed_at: new Date().toISOString(),
            listing_id: "n100001",
            source_url: "https://m.28car.com/num_dsp.php?h_vid=50000001&h_f_do=1",
            inquiry_enabled: true,
          }] : [],
        },
      });
    });
    await page.goto("/?lang=en&q=88&broker=1");
    await waitForResultRows(page, 1);
    await expect(page.locator("#marketSignal")).toBeVisible();
    await expect(page.locator("#marketSignal .market-title .plate")).toHaveText("88");
    await expect(page.locator("#marketSignal .market-title .plate")).toHaveCSS("background-color", "rgb(240, 201, 77)");
    await expect(page.locator("#marketSignal .market-title .plate")).toHaveCSS("color", "rgb(23, 22, 18)");
    const plateDecoration = await page.locator("#marketSignal .market-title .plate").evaluate((plate) => ({
      before: getComputedStyle(plate, "::before").content,
      after: getComputedStyle(plate, "::after").content,
    }));
    expect(plateDecoration).toEqual({ before: "none", after: "none" });
    await expect(page.locator("#marketSignal .market-title")).toContainText("may be obtainable");
    await expect(page.locator("#marketSignal")).not.toContainText("1 recent signal");
    await expect(page.locator("#marketSignal .market-source-link")).toHaveAttribute("href", /m\.28car\.com/);
    await expect(page.locator("#marketSignal .market-inquire-btn .whatsapp-icon")).toBeVisible();
    await expect(page.locator("#marketSignal .market-inquire-btn")).toHaveCSS("background-color", "rgb(7, 94, 84)");
    const rowWhatsAppButton = page.locator("#rows tr[data-plate='88'] .row-market-btn").first();
    await expect(rowWhatsAppButton.locator(".whatsapp-icon")).toBeVisible();
    await expect(rowWhatsAppButton).toHaveCSS("background-color", "rgb(7, 94, 84)");
    await expect(page.locator("#brokerModal")).toBeVisible();
    await expect(page.locator("#brokerPlate")).toHaveCSS("background-color", "rgb(240, 201, 77)");
    await expect(page.locator("#brokerPlate")).toHaveCSS("color", "rgb(23, 22, 18)");
    await expect(page.locator("#brokerSubmit")).toHaveCSS("background-color", "rgb(7, 94, 84)");
    await page.locator("#brokerBudget").fill("900000");
    await page.locator("#brokerNote").fill("Initial approach only");
    await page.locator("#brokerSubmit").click();
    const openedUrl = await page.evaluate(() => window.__platehkOpenedUrls[0]);
    const whatsappUrl = new URL(openedUrl);
    expect(whatsappUrl.origin).toBe("https://wa.me");
    expect(whatsappUrl.pathname).toBe("/85268591577");
    const composedMessage = whatsappUrl.searchParams.get("text");
    expect(composedMessage).toContain("plate 88");
    expect(composedMessage).toContain("HK$900,000");
    expect(composedMessage).toContain("Initial approach only");
    expect(composedMessage).toContain("m.28car.com");

    await page.locator("#brokerClose").click();
    await page.locator("#q").fill("HK30");
    await waitForResultRows(page, 1);
    await expect(page.locator("#marketSignal")).toBeHidden();
    await expect(page.locator("#marketSignal .market-source-link")).toHaveCount(0);
    await expect(page.locator("#rows .row-market-btn")).toHaveCount(0);
    await runAxe(page);
    await expectNoBrowserErrors(errors);
  });

  test("uses the canonical yellow plate on generated market landing pages", async ({ page }) => {
    expect(generatedMarketPage).toBeTruthy();
    expect(generatedMarketPlate).toBeTruthy();
    await page.route(`**/plates/${generatedMarketPage.filename}`, (route) => route.fulfill({
      body: generatedMarketPage.html,
      contentType: "text/html",
    }));
    await page.route("**/api/market_signal?*", async (route) => {
      await route.fulfill({
        json: {
          plate: generatedMarketPlate,
          availability_detected: true,
          source: "28car",
          offer_count: 1,
          asking_prices_hkd: [385000],
          has_contact_price: false,
          observed_at: new Date().toISOString(),
          listing_id: "n100001",
          source_url: "https://m.28car.com/num_dsp.php?h_vid=50000001&h_f_do=1",
          inquiry_enabled: true,
        },
      });
    });

    await page.goto(`/plates/${generatedMarketPage.filename}`);
    const plate = page.locator("[data-market-card] .market-title .plate");
    await expect(plate).toBeVisible();
    await expect(plate).toHaveText(generatedMarketPlate);
    await expect(plate).toHaveCSS("background-color", "rgb(240, 201, 77)");
    await expect(plate).toHaveCSS("color", "rgb(23, 22, 18)");
    const decoration = await plate.evaluate((element) => ({
      before: getComputedStyle(element, "::before").content,
      after: getComputedStyle(element, "::after").content,
    }));
    expect(decoration).toEqual({ before: "none", after: "none" });
  });

  test("shows one external signal while keeping actions on all matching result rows", async ({ page }) => {
    const errors = collectBrowserErrors(page);
    const signals = {
      HUANG: {
        asking_prices_hkd: [],
        has_contact_price: true,
        listing_id: "n259378",
        source_url: "https://m.28car.com/num_dsp.php?h_vid=62255017&h_f_do=1",
      },
      DRHUANG: {
        asking_prices_hkd: [100000],
        has_contact_price: false,
        listing_id: "n289747",
        source_url: "https://m.28car.com/num_dsp.php?h_vid=69543484&h_f_do=1",
      },
    };
    await page.route("**/api/market_signal?*", async (route) => {
      const plates = new URL(route.request().url()).searchParams.get("plates").split(",");
      await route.fulfill({
        json: {
          plates_requested: plates.length,
          signals: plates.flatMap((plate) => signals[plate] ? [{
            plate,
            availability_detected: true,
            source: "28car",
            offer_count: 1,
            observed_at: new Date().toISOString(),
            inquiry_enabled: true,
            ...signals[plate],
          }] : []),
        },
      });
    });

    await page.goto("/?lang=en&q=HUANG");
    await waitForResultRows(page, 2);
    const huangRow = page.locator("#rows tr[data-plate='HUANG']");
    const drHuangRow = page.locator("#rows tr[data-plate='DRHUANG']");
    await expect(huangRow.locator(".row-market-btn")).toBeVisible();
    await expect(drHuangRow.locator(".row-market-btn")).toBeVisible();
    await expect(page.locator("#marketSignal .market-signal-item")).toHaveCount(1);
    await expect(page.locator("#marketSignal [data-market-plate='HUANG'] .plate")).toHaveText("HUANG");
    await expect(page.locator("#marketSignal [data-market-plate='DRHUANG']")).toHaveCount(0);

    const plateStyleMatches = await page.evaluate(() => {
      const resultPlate = getComputedStyle(document.querySelector("#rows tr[data-plate='HUANG'] .plate"));
      const marketPlate = getComputedStyle(document.querySelector("#marketSignal [data-market-plate='HUANG'] .plate"));
      return ["backgroundColor", "borderColor", "borderRadius", "color", "fontFamily", "fontWeight"]
        .every((property) => resultPlate[property] === marketPlate[property]);
    });
    expect(plateStyleMatches).toBe(true);

    await drHuangRow.locator(".row-market-btn").click();
    await expect(page.locator("#brokerModal")).toBeVisible();
    await expect(page.locator("#brokerPlate")).toHaveText("DR HUANG");
    await page.locator("#brokerClose").click();
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

  test("keeps public information pages in one responsive, navigable shell", async ({ page }, testInfo) => {
    const errors = collectBrowserErrors(page);
    const pages = [
      ["/about.html", "about"],
      ["/terms.html", "terms"],
      ["/privacy.html", "privacy"],
      ["/changelog.html", "changelog"],
      ["/audit.html", "audit"],
      ["/api.html", "api"],
      ["/mcp.html", "api"],
      ["/plates/index.html", "plates"],
    ];

    for (const [path, activePage] of pages) {
      await page.goto(`${path}?lang=en`);
      await expect(page.locator(".info-site-header")).toBeVisible();
      await expect(page.locator(".info-site-footer")).toBeVisible();
      await expect(page.locator("main#main-content")).toBeVisible();
      await expect(page.locator(`body[data-info-page="${activePage}"]`)).toBeVisible();
      await expect(page.locator(".info-site-header [aria-current=page], .info-site-footer [aria-current=page]")).toHaveCount(1);
      const internalShellLinks = await page.locator(".info-nav a, .info-site-footer a").evaluateAll((links) => links
        .map((link) => link.href)
        .filter((href) => new URL(href).origin === location.origin && !new URL(href).pathname.endsWith("llms.txt")));
      expect(internalShellLinks.every((href) => new URL(href).searchParams.get("lang") === "en")).toBe(true);
      if (path === "/audit.html") await expect(page.locator("#auditSummary")).not.toBeEmpty();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }

    await page.goto("/audit.html");
    await page.locator("#langBtn").click();
    await expect(page).toHaveURL(/lang=en/);
    await expect(page.locator('.info-nav a[href="/api.html?lang=en"]')).toBeVisible();

    await page.goto("/about.html?lang=en");
    await page.keyboard.press("Tab");
    await expect(page.locator(".info-skip-link")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);

    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 820, height: 900 });
    await page.goto("/about.html?lang=en");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.setViewportSize(originalViewport);

    await page.goto("/api.html?lang=en");
    await expect(page.locator("#apiStatus strong").first()).not.toContainText("Loading");
    await expect(page.locator("#content")).toContainText("Retry-After");

    await page.goto("/changelog.html?lang=en");
    await expect(page.locator("#changelogStatus strong").first()).not.toContainText("Loading");
    await expect(page.locator(".changelog-archive")).toBeVisible();

    await page.goto("/plates/index.html");
    const initialLimit = testInfo.project.name.includes("mobile") ? 40 : 80;
    await expect(page.locator("[data-popular-card]:visible")).toHaveCount(initialLimit);
    await page.locator("#popularQuery").fill(" 8 8 ");
    await expect(page.locator("#popularCount")).toContainText("results");
    const visiblePlates = await page.locator("[data-popular-card]:visible .plate").allTextContents();
    expect(visiblePlates.length).toBeGreaterThan(0);
    expect(visiblePlates.every((plate) => plate.replace(/\s+/g, "").includes("88"))).toBe(true);
    await page.locator("#popularQuery").fill("NOT-A-PLATE");
    await expect(page.locator("[data-popular-card]:visible")).toHaveCount(0);
    await expect(page.locator("#popularCount")).toContainText("0");
    await page.locator("#popularQuery").clear();
    await expect(page.locator("[data-popular-card]:visible")).toHaveCount(initialLimit);
    await page.locator("#popularShowAll").click();
    await expect(page.locator("[data-popular-card]:visible")).toHaveCount(420);
    await expect(page.locator("#popularShowAll")).toBeHidden();

    await expectNoBrowserErrors(errors);
  });

  test("shows recoverable states when information-page freshness data fails", async ({ page }) => {
    const errors = collectBrowserErrors(page);
    await page.route("**/data/audit.json", (route) => route.fulfill({ status: 500, body: "unavailable" }));

    await page.goto("/api.html?lang=en");
    await expect(page.locator("#apiStatus")).toContainText("temporarily unavailable");

    await page.goto("/changelog.html?lang=en");
    await expect(page.locator("#changelogStatus")).toContainText("temporarily unavailable");

    await page.goto("/audit.html?lang=en");
    await expect(page.locator("#auditSummary")).toContainText("could not be loaded");
    await expect(page.locator(".table-wrap")).toHaveAttribute("aria-busy", "false");

    await page.unroute("**/data/audit.json");
    await page.route("**/data/audit.json", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ generated_at: "2026-08-24", summary: {} }),
    }));
    await page.route("**/api/v1/index.json", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ generated_at: "2026-08-23", datasets: { all: { total_rows: 213572 } } }),
    }));
    await page.goto("/api.html?lang=en");
    await expect(page.locator("#apiStatus")).toContainText("2026-08-23");
    await expect(page.locator("#apiStatus")).toContainText("2026-08-24");
    await expect(page.locator("#apiStatus")).toContainText("213,572");
    await page.goto("/changelog.html?lang=en");
    await expect(page.locator("#changelogStatus")).toContainText("0 / 0");

    expect(errors).toHaveLength(3);
    expect(errors.every((error) => error.includes("500 (Internal Server Error)"))).toBe(true);
  });
});
