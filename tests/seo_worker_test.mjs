import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

// RFC 9728 binds discovery metadata to the resource encoded in its URL,
// independently of the authorization server's issuer or token audience.
for (const [suffix, resource] of [["", "https://plate.hk"], ["/api/vision_plate", "https://plate.hk/api/vision_plate"]]) {
  const url = `https://plate.hk/.well-known/oauth-protected-resource${suffix}`;
  const metadata = await worker.fetch(new Request(url), { ...env, OAUTH_ISSUER: "https://auth.example" }, ctx);
  assert.equal(metadata.status, 200);
  assert.equal(metadata.headers.get("access-control-allow-origin"), "*");
  const body = await metadata.json();
  assert.equal(body.resource, resource);
  assert.deepEqual(body.authorization_servers, ["https://auth.example"]);
  assert.deepEqual(body.scopes_supported, ["vision:ocr"]);
  assert.deepEqual(body.bearer_methods_supported, ["header"]);
  const head = await worker.fetch(new Request(url, { method: "HEAD" }), env, ctx);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
}

const robots = await readFile(new URL("../robots.txt", import.meta.url), "utf8");
assert.match(robots, /^Content-Signal: search=yes, ai-input=yes, ai-train=no$/m);
assert.match(robots, /^Agentmap: https:\/\/plate.hk\/\.well-known\/ard.json$/m);
const authGuide = await readFile(new URL("../auth.md", import.meta.url), "utf8");
assert.match(authGuide.split("\n")[0], /^# .*auth\.md/);

for (const hostname of ["plate.hk", "preview.example"]) {
  const url = `https://${hostname}/.well-known/poppy.json`;
  const response = await worker.fetch(new Request(url), env, ctx);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(await response.json(), {
    protocol_version: "0.2",
    organization: { name: "Plate.hk", domain: hostname },
    web: {},
  });
  if (hostname !== "plate.hk") assert.match(response.headers.get("x-robots-tag"), /noindex/);
  const head = await worker.fetch(new Request(url, { method: "HEAD" }), env, ctx);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
}

const catalogJson = await readFile(new URL("../.well-known/ard.json", import.meta.url), "utf8");
const discoveryEnv = { ASSETS: { async fetch(request) {
  if (new URL(request.url).pathname === "/.well-known/ard.json") return new Response(catalogJson);
  return env.ASSETS.fetch(request);
} } };
for (const path of ["/.well-known/ard.json", "/.well-known/ai-catalog.json"]) {
  const response = await worker.fetch(new Request(`https://plate.hk${path}`), discoveryEnv, ctx);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^application\/json/);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "cross-origin");
  const catalog = await response.json();
  assert.equal(catalog.host.url, "https://plate.hk");
  assert.equal(catalog.host.displayName, "Plate.hk");
  assert.equal(catalog.host.identifier, "https://plate.hk");
  assert.equal(catalog.entries.length, 3);
  assert.equal(new Set(catalog.entries.map(entry => entry.identifier)).size, 3);
  for (const entry of catalog.entries) {
    assert.match(entry.identifier, /^urn:air:plate.hk:/);
    assert.ok(entry.representativeQueries.length >= 2);
    assert.ok(entry.displayName);
    assert.ok(entry.type);
    assert.equal(new URL(entry.url).origin, "https://plate.hk");
    assert.equal("data" in entry, false);
  }
  const head = await worker.fetch(new Request(`https://plate.hk${path}`, { method: "HEAD" }), discoveryEnv, ctx);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
}
const missingCatalog = await worker.fetch(new Request("https://missing.example/.well-known/ard.json"), env, ctx);
assert.equal(missingCatalog.status, 404);
const homeDiscovery = await worker.fetch(new Request("https://plate.hk/"), env, ctx);
assert.match(homeDiscovery.headers.get("link"), /<\/\.well-known\/ard.json>; rel="ard"/);
assert.match(homeDiscovery.headers.get("link"), /<\/auth.md>; rel="describedby"/);
const stagingCatalog = await worker.fetch(new Request("https://preview.example/.well-known/ard.json"), discoveryEnv, ctx);
assert.match(stagingCatalog.headers.get("x-robots-tag"), /noindex/);

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
