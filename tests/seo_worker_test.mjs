import assert from "node:assert/strict";

import worker from "../cloudflare-worker/src/index.mjs";


const assetRequests = [];
const env = {
  ASSETS: {
    async fetch(request) {
      const url = new URL(request.url);
      assetRequests.push(url.pathname);
      if (url.pathname === "/about" || url.pathname === "/plates/WK" || url.pathname === "/plates/") {
        return new Response("<!doctype html><title>Canonical page</title>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      if (url.pathname === "/data/hot_search/manifest.json") {
        return Response.json({ generated_at: "2026-08-17" });
      }
      return new Response("Not found", { status: 404 });
    },
  },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

const aboutRedirect = await worker.fetch(new Request("https://plate.hk/about?lang=en"), env, ctx);
assert.equal(aboutRedirect.status, 301);
assert.equal(aboutRedirect.headers.get("location"), "https://plate.hk/about.html?lang=en");

assetRequests.length = 0;
const aboutHtml = await worker.fetch(new Request("https://plate.hk/about.html?lang=en"), env, ctx);
assert.equal(aboutHtml.status, 200);
assert.deepEqual(assetRequests, ["/about"]);
assert.equal(aboutHtml.headers.get("x-robots-tag"), null);

const plateRedirect = await worker.fetch(new Request("https://plate.hk/plates/WK"), env, ctx);
assert.equal(plateRedirect.status, 301);
assert.equal(plateRedirect.headers.get("location"), "https://plate.hk/plates/WK.html");

assetRequests.length = 0;
const plateHtml = await worker.fetch(new Request("https://plate.hk/plates/WK.html"), env, ctx);
assert.equal(plateHtml.status, 200);
assert.deepEqual(assetRequests, ["/plates/WK"]);

const rootRedirect = await worker.fetch(new Request("https://plate.hk/index.html"), env, ctx);
assert.equal(rootRedirect.status, 301);
assert.equal(rootRedirect.headers.get("location"), "https://plate.hk/");

const plateIndexRedirect = await worker.fetch(new Request("https://plate.hk/plates/"), env, ctx);
assert.equal(plateIndexRedirect.status, 301);
assert.equal(plateIndexRedirect.headers.get("location"), "https://plate.hk/plates/index.html");

assetRequests.length = 0;
const plateIndexHtml = await worker.fetch(new Request("https://plate.hk/plates/index.html"), env, ctx);
assert.equal(plateIndexHtml.status, 200);
assert.deepEqual(assetRequests, ["/plates/"]);

const dataJson = await worker.fetch(
  new Request("https://plate.hk/data/hot_search/manifest.json"),
  env,
  ctx,
);
assert.equal(dataJson.status, 200);
assert.match(dataJson.headers.get("x-robots-tag") || "", /noindex/);

assetRequests.length = 0;
const mcpApi = await worker.fetch(new Request("https://plate.hk/mcp"), env, ctx);
assert.equal(mcpApi.status, 405);
assert.equal(mcpApi.headers.get("location"), null);
assert.deepEqual(assetRequests, []);

console.log("seo worker tests passed");
