import assert from "node:assert/strict";

import worker from "../cloudflare-worker/src/index.mjs";


const assetRequests = [];
const env = {
  ASSETS: {
    async fetch(request) {
      const url = new URL(request.url);
      assetRequests.push(url.pathname);
      if (url.pathname === "/" || url.pathname === "/about" || url.pathname === "/plates/WK" || url.pathname === "/plates/") {
        const canonical = url.pathname === "/about" ? "https://plate.hk/about.html" : "https://plate.hk/";
        return new Response(`<!doctype html><html lang="zh-HK"><head><title>Canonical page</title><meta name="description" content="中文說明"><link rel="canonical" href="${canonical}"></head><body>Page</body></html>`, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      if (url.pathname === "/data/hot_search/manifest.json") {
        return Response.json({ generated_at: "2026-08-17" });
      }
      if (["/auction-results/feed.xml", "/auction-results/en/feed.xml"].includes(url.pathname)) {
        if (request.headers.get('if-none-match') === '"stable-feed"') {
          return new Response(null, {status:304, headers:{"content-type":"application/xml",etag:'"stable-feed"',"cache-control":"public, max-age=86400"}});
        }
        return new Response('<feed xmlns="http://www.w3.org/2005/Atom"/>', {
          headers: { "content-type": "application/xml", etag: '"stable-feed"' },
        });
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
const englishAbout = await aboutHtml.text();
assert.match(englishAbout, /<html lang="en">/);
assert.match(englishAbout, /<link rel="canonical" href="https:\/\/plate\.hk\/about\.html\?lang=en">/);
assert.match(englishAbout, /<meta name="description" content="Sources, coverage/);
assert.equal((englishAbout.match(/rel="canonical"/g) || []).length, 1);

const englishHome = await worker.fetch(new Request("https://plate.hk/?lang=en"), env, ctx);
assert.equal(englishHome.status, 200);
assert.match(await englishHome.text(), /<link rel="canonical" href="https:\/\/plate\.hk\/\?lang=en">/);

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

for (const path of ["/auction-results/feed.xml", "/auction-results/en/feed.xml"]) {
  const feed = await worker.fetch(new Request(`https://plate.hk${path}`), env, ctx);
  assert.equal(feed.status, 200);
  assert.equal(feed.headers.get("content-type"), "application/atom+xml; charset=utf-8");
  assert.equal(feed.headers.get("cache-control"), "public, max-age=300, must-revalidate");
  assert.equal(feed.headers.get("etag"), '"stable-feed"');
  assert.match(await feed.text(), /<feed xmlns=/);
  const unchanged = await worker.fetch(new Request(`https://plate.hk${path}`, {headers:{'if-none-match':'"stable-feed"'}}), env, ctx);
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.headers.get("cache-control"), "public, max-age=300, must-revalidate");
  assert.equal(unchanged.headers.get("content-type"), "application/atom+xml; charset=utf-8");
  assert.equal(await unchanged.text(), '');
}
const absentFeed = await worker.fetch(new Request("https://plate.hk/auction-results/absent.xml"), env, ctx);
assert.equal(absentFeed.status, 404);
assert.notEqual(absentFeed.headers.get("content-type"), "application/atom+xml; charset=utf-8");

console.log("seo worker tests passed");
