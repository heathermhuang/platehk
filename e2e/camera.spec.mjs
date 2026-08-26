import { expect, test } from "@playwright/test";

function installCameraMock(page) {
  return page.addInitScript(() => {
    window.__cameraPermissionCalls = 0;
    window.__cameraTrackStops = 0;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          window.__cameraPermissionCalls += 1;
          const stream = new MediaStream();
          Object.defineProperty(stream, "getTracks", {
            value: () => [{ stop: () => { window.__cameraTrackStops += 1; } }],
          });
          return stream;
        },
      },
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1280 });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 720 });
    HTMLMediaElement.prototype.play = async () => {};
    HTMLCanvasElement.prototype.getContext = function () {
      return {
        drawImage() {},
        getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4) }),
        putImageData() {},
      };
    };
    HTMLCanvasElement.prototype.toDataURL = () => "data:image/jpeg;base64,dGVzdA==";
  });
}

test("camera preview and remote OCR both require separate explicit actions", async ({ page }) => {
  let sessionRequests = 0;
  let visionUploads = 0;
  let visionBody = null;
  await installCameraMock(page);
  await page.route("**/api/vision_session", async (route) => {
    sessionRequests += 1;
    await route.fulfill({ json: { token: "explicit-action-token", expires_at: 4_000_000_000 } });
  });
  await page.route("**/api/vision_plate", async (route) => {
    visionUploads += 1;
    visionBody = route.request().postDataJSON();
    await route.fulfill({ json: { plate: "HK88", raw_text: "HK88", confidence: 0.99, is_hong_kong_plate: true } });
  });
  await page.route("**/api/search?**", async (route) => {
    await route.fulfill({ json: { rows: [], total: 0 } });
  });

  await page.goto("/camera.html?lang=en");
  await page.waitForTimeout(500);
  await expect.poll(() => page.evaluate(() => window.__cameraPermissionCalls)).toBe(0);
  expect(sessionRequests).toBe(0);
  expect(visionUploads).toBe(0);

  await page.locator("#startBtn").click();
  await expect.poll(() => page.evaluate(() => window.__cameraPermissionCalls)).toBe(1);
  await page.waitForTimeout(900);
  expect(sessionRequests).toBe(0);
  expect(visionUploads).toBe(0);
  await expect(page.locator("#aiScanBtn")).toContainText(/upload crop/i);

  await page.locator("#aiScanBtn").click();
  await expect.poll(() => visionUploads).toBe(1);
  expect(sessionRequests).toBe(1);
  expect(Object.keys(visionBody).sort()).toEqual(["image_data_url", "lang", "vision_token"]);
  expect(visionBody.image_data_url).toBe("data:image/jpeg;base64,dGVzdA==");
  await expect(page.locator("#aiScanBtn")).toBeEnabled();
  await page.locator("#stopBtn").click();
  await expect.poll(() => page.evaluate(() => window.__cameraTrackStops)).toBe(1);
});

test("camera permission denial remains recoverable without any upload", async ({ page }) => {
  await page.addInitScript(() => {
    window.__cameraPermissionCalls = 0;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          window.__cameraPermissionCalls += 1;
          throw new DOMException("Permission denied", "NotAllowedError");
        },
      },
    });
  });

  await page.goto("/camera.html?lang=en");
  await page.locator("#startBtn").click();
  await expect.poll(() => page.evaluate(() => window.__cameraPermissionCalls)).toBe(1);
  await expect(page.locator("#startBtn")).toBeEnabled();
  await expect(page.locator("#aiScanBtn")).toBeDisabled();
  await expect(page.locator("#ocrMeta")).toContainText(/blocked|allow camera/i);
});

test("rapid explicit scan clicks create only one upload", async ({ page }) => {
  let visionUploads = 0;
  await installCameraMock(page);
  await page.route("**/api/vision_session", (route) => route.fulfill({
    json: { token: "single-flight-token", expires_at: 4_000_000_000 },
  }));
  await page.route("**/api/vision_plate", async (route) => {
    visionUploads += 1;
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.fulfill({ json: { plate: "HK88", raw_text: "HK88", confidence: 0.99, is_hong_kong_plate: true } });
  });
  await page.route("**/api/search?**", (route) => route.fulfill({ json: { rows: [], total: 0 } }));

  await page.goto("/camera.html?lang=en");
  await page.locator("#startBtn").click();
  await expect(page.locator("#aiScanBtn")).toBeEnabled();
  await page.locator("#aiScanBtn").evaluate((button) => {
    button.click();
    button.click();
  });
  await expect.poll(() => visionUploads).toBe(1);
  await expect(page.locator("#aiScanBtn")).toBeEnabled();
});

test("an unready video frame does not request a session or upload", async ({ page }) => {
  let sessionRequests = 0;
  let visionUploads = 0;
  await installCameraMock(page);
  await page.route("**/api/vision_session", async (route) => {
    sessionRequests += 1;
    await route.fulfill({ json: { token: "unused", expires_at: 4_000_000_000 } });
  });
  await page.route("**/api/vision_plate", async (route) => {
    visionUploads += 1;
    await route.fulfill({ json: {} });
  });

  await page.goto("/camera.html?lang=en");
  await page.locator("#startBtn").click();
  await page.locator("#video").evaluate((video) => {
    Object.defineProperty(video, "videoWidth", { configurable: true, get: () => 0 });
  });
  await page.locator("#aiScanBtn").click();
  expect(sessionRequests).toBe(0);
  expect(visionUploads).toBe(0);
});

test("a failed upload leaves AI Scan available for retry", async ({ page }) => {
  let visionUploads = 0;
  await installCameraMock(page);
  await page.route("**/api/vision_session", (route) => route.fulfill({
    json: { token: "retry-token", expires_at: 4_000_000_000 },
  }));
  await page.route("**/api/vision_plate", async (route) => {
    visionUploads += 1;
    if (visionUploads === 1) {
      await route.fulfill({ status: 502, json: { error: "vision_upstream_error" } });
      return;
    }
    await route.fulfill({ json: { plate: "HK88", raw_text: "HK88", confidence: 0.99, is_hong_kong_plate: true } });
  });
  await page.route("**/api/search?**", (route) => route.fulfill({ json: { rows: [], total: 0 } }));

  await page.goto("/camera.html?lang=en");
  await page.locator("#startBtn").click();
  await page.locator("#aiScanBtn").click();
  await expect(page.locator("#aiScanBtn")).toBeEnabled();
  await page.locator("#aiScanBtn").click();
  await expect.poll(() => visionUploads).toBe(2);
});

test("mobile camera results retain exact search and source actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.route("**/api/search?**", async (route) => {
    await route.fulfill({
      json: {
        total: 1,
        rows: [{
          single_line: "HK 88",
          amount_hkd: 88000,
          auction_date: "2026-08-01",
          dataset_key: "pvrm",
          source_url: "https://example.test/source/HK88",
        }],
      },
    });
  });

  await page.goto("/camera.html?lang=en");
  await page.locator("#manualInput").fill("HK 88");
  await expect(page.locator("#openSearchLink")).toHaveAttribute("href", /q=HK88/);
  await page.locator("#manualSearchBtn").click();

  const actions = page.locator("#results .result-actions").first();
  await actions.scrollIntoViewIfNeeded();
  await expect(actions).toBeVisible();
  await expect(actions.locator("a").first()).toHaveAttribute("href", /index\.html\?lang=en&q=HK88$/);
  await expect(actions.locator("a").nth(1)).toHaveAttribute("href", "https://example.test/source/HK88");
  await expect(page.locator("#openSearchLink")).toHaveAttribute("href", /index\.html\?lang=en&q=HK88$/);
});

test("mobile double-line results, language, and short-height navigation stay coherent", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 360 });
  await page.route("**/api/search?**", (route) => route.fulfill({
    json: {
      total: 1,
      rows: [{
        single_line: null,
        double_line: ["HK", "88"],
        amount_hkd: 88000,
        auction_date: "2026-08-01",
        dataset_key: "pvrm",
      }],
    },
  }));

  await page.goto("/camera.html?lang=en");
  await page.locator("#manualInput").fill("HK 88");
  await page.locator("#manualSearchBtn").click();
  const links = page.locator("#results .result-actions").first().locator("a");
  await links.first().scrollIntoViewIfNeeded();
  await expect(links).toHaveCount(1);
  await expect(links.first()).toHaveAttribute("href", /index\.html\?lang=en&q=HK88$/);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(360);

  await page.locator("#langZh").click();
  await expect(page.locator("#openSearchLink")).toHaveAttribute("href", /index\.html\?lang=zh&q=HK88$/);
  await page.locator("#manualInput").fill("");
  await expect(page.locator("#openSearchLink")).toHaveAttribute("href", /index\.html\?lang=zh&q=HK88$/);
});
