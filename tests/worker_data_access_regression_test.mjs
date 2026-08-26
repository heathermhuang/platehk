import assert from "node:assert/strict";

import worker from "../cloudflare-worker/src/index.mjs";


const assetRequests = [];
const searchRows = Array.from({ length: 125 }, (_, index) => [
  0,
  `A88${String(index).padStart(2, "0")}`,
  null,
  100000 - index,
  0,
]);
const searchMeta = {
  schema_version: 1,
  row_metadata: [[
    "pvrm",
    "pvrm::2026-01-03",
    "2026-01-03",
    "2026年1月3日",
    "day",
    null,
    false,
    "https://example.test/2026-01-03.pdf",
    null,
    null,
    null,
    null,
  ]],
  result_states: [["sold", "sold"]],
  char_counts: { 8: searchRows.length },
  prefix_counts: { 8: searchRows.length },
  bigram_counts: { 88: searchRows.length },
};

const issueManifest = {
  generated_at: "2026-08-12",
  total_rows: 600,
  issue_count: 3,
  issues: [
    { dataset_key: "pvrm", auction_key: "pvrm::2026-01-03", auction_date: "2026-01-03", count: 200, file: "issues/pvrm--2026-01-03.json" },
    { dataset_key: "pvrm", auction_key: "pvrm::2026-01-02", auction_date: "2026-01-02", count: 200, file: "issues/pvrm--2026-01-02.json" },
    { dataset_key: "pvrm", auction_key: "pvrm::2026-01-01", auction_date: "2026-01-01", count: 200, file: "issues/pvrm--2026-01-01.json" },
  ],
};

function chunkRows(prefix) {
  return Array.from({ length: 200 }, (_, index) => ({
    dataset_key: "pvrm",
    auction_key: "pvrm::2026-01-02",
    auction_date: "2026-01-02",
    single_line: `${prefix}${String(index).padStart(3, "0")}`,
    amount_hkd: 50000 - index,
  }));
}

const sortedChunkManifest = {
  schema_version: 1,
  format: "json-array-chunks",
  dataset: "all",
  total_rows: 3000,
  chunk_rows: 1000,
  chunks: [],
  sort_indexes: Object.fromEntries(
    ["amount_desc", "amount_asc", "plate_asc"].map((sort) => [sort, {
      sort,
      chunks: Array.from({ length: 3 }, (_, index) => ({
        file: `results.sorted/${sort}/${String(index).padStart(4, "0")}.json`,
        count: 1000,
        start: index * 1000,
        end: (index + 1) * 1000 - 1,
      })),
    }]),
  ),
};

const env = {
  ASSETS: {
    async fetch(request) {
      const url = new URL(request.url);
      const path = decodeURIComponent(url.pathname);
      assetRequests.push({ origin: url.origin, path });
      if (["missing-index.test", "child-missing-index.test"].includes(url.hostname)
          && path === "/api/v1/all/search-index/meta.json") {
        return new Response("Not found", { status: 404 });
      }
      if (url.hostname === "malformed-index.test" && path === "/api/v1/all/search-index/bigram/88.json") {
        return Response.json({ not_rows: [] });
      }
      if (path === "/api/v1/all/search-index/meta.json") return Response.json(searchMeta);
      if (path === "/api/v1/all/search-index/bigram/88.json") return Response.json({ rows: searchRows });
      if (path === "/api/v1/all/search-index/char1/8.json") return Response.json({ rows: searchRows });
      if (path === "/data/all.tvrm_legacy_overlap.json") return Response.json({ keys: [], exact_keys: [] });
      if (url.hostname === "no-freshness.test" && path === "/api/v1/all/issues.manifest.json") {
        return Response.json({ ...issueManifest, generated_at: null });
      }
      if (url.hostname === "date-no-count.test" && path === "/api/v1/all/issues.manifest.json") {
        return Response.json({
          ...issueManifest,
          issues: issueManifest.issues.map((issue, index) => index === 0 ? { ...issue, count: null } : issue),
        });
      }
      if (path === "/api/v1/all/issues.manifest.json") return Response.json(issueManifest);
      if (path === "/api/v1/all/auctions.json") return Response.json([]);
      if (path === "/api/v1/all/preset.amount_desc.top1000.json") return Response.json([{ amount_hkd: 999999 }]);
      if (url.hostname === "no-freshness.test" && path === "/api/v1/index.json") {
        return Response.json({ generated_at: null });
      }
      if (path === "/api/v1/index.json") return Response.json({ generated_at: "2026-08-11" });
      if (url.hostname === "127.0.0.1" && path === "/api/v1/all/results.chunks.json") {
        return Response.json({
          schema_version: 1,
          format: "json-array-chunks",
          dataset: "all",
          total_rows: 3,
          chunks: [{ file: "results.slim.json", count: 3, start: 0, end: 2 }],
          sort_indexes: {},
        });
      }
      if (url.hostname === "missing-sort.test" && path === "/api/v1/all/results.chunks.json") {
        return Response.json({ ...sortedChunkManifest, sort_indexes: {} });
      }
      if (url.hostname === "cross-chunk.test" && path === "/api/v1/all/results.chunks.json") {
        return Response.json({
          ...sortedChunkManifest,
          total_rows: 300,
          sort_indexes: {
            plate_asc: {
              sort: "plate_asc",
              chunks: [
                { file: "results.sorted/plate_asc/0000.json", count: 150, start: 0, end: 149 },
                { file: "results.sorted/plate_asc/0001.json", count: 150, start: 150, end: 299 },
              ],
            },
          },
        });
      }
      if (path === "/api/v1/all/results.chunks.json") return Response.json(sortedChunkManifest);
      if (url.hostname === "127.0.0.1" && path === "/api/v1/all/results.slim.json") {
        return Response.json([
          { dataset_key: "pvrm", auction_date: "2026-01-01", single_line: "C 3", amount_hkd: 300 },
          { dataset_key: "pvrm", auction_date: "2026-01-01", single_line: "A 1", amount_hkd: 100 },
          { dataset_key: "pvrm", auction_date: "2026-01-01", single_line: "B 2", amount_hkd: 200 },
        ]);
      }
      if (path === "/api/v1/all/issues/pvrm--2026-01-03.json") return Response.json(chunkRows("DATE-FIRST"));
      if (path === "/api/v1/all/issues/pvrm--2026-01-02.json") return Response.json(chunkRows("DATE-SECOND"));
      if (path === "/api/v1/tvrm_physical/issues.manifest.json") return Response.json({ ...issueManifest, generated_at: null });
      if (path === "/api/v1/tvrm_physical/auctions.json") return Response.json([]);
      if (path === "/api/v1/tvrm_physical/results.chunks.json") {
        return Response.json({ ...sortedChunkManifest, dataset: "tvrm_physical" });
      }
      const sortedMatch = /^\/api\/v1\/(all|tvrm_physical)\/results\.sorted\/([^/]+)\/(\d{4})\.json$/.exec(path);
      if (sortedMatch) {
        const rows = chunkRows(`${sortedMatch[2]}-${sortedMatch[3]}-`);
        return Response.json(url.hostname === "cross-chunk.test" ? rows.slice(0, 150) : rows);
      }
      return new Response("Not found", { status: 404 });
    },
  },
};
const ctx = { waitUntil() {} };
globalThis.caches = {
  default: {
    async match() { return undefined; },
    async put() {},
  },
};

for (const page of [1, 2, 6]) {
  const response = await worker.fetch(
    new Request(`https://canonical-search.test/api/search?dataset=all&q=88&sort=amount_desc&page=${page}&page_size=20`, {
      headers: { "cf-connecting-ip": `192.0.2.${30 + page}` },
    }),
    env,
    ctx,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.total, 125);
  assert.equal(payload.rows.length, 20);
}
const searchRequests = assetRequests.filter(({ origin }) => origin === "https://canonical-search.test");
assert.equal(searchRequests.some(({ path }) => path.includes("/data/hot_search/")), false);
assert.equal(searchRequests.some(({ path }) => path.includes("results.chunks")), false);

const missingIndexResponse = await worker.fetch(
  new Request("https://missing-index.test/api/search?dataset=all&q=88&sort=amount_desc&page=1&page_size=20", {
    headers: { "cf-connecting-ip": "192.0.2.38" },
  }),
  env,
  ctx,
);
assert.equal(missingIndexResponse.status, 503);
assert.equal((await missingIndexResponse.json()).error, "search_index_unavailable");
const missingIndexRequests = assetRequests.filter(({ origin }) => origin === "https://missing-index.test");
assert.equal(missingIndexRequests.some(({ path }) => path.includes("/data/hot_search/")), false);
assert.equal(missingIndexRequests.some(({ path }) => path.includes("results.chunks")), false);

for (const [origin, query] of [
  ["https://absent-char.test", "9"],
  ["https://absent-bigram.test", "89"],
]) {
  const response = await worker.fetch(
    new Request(`${origin}/api/search?dataset=all&q=${query}&sort=amount_desc&page=1&page_size=20`, {
      headers: { "cf-connecting-ip": "192.0.2.40" },
    }),
    env,
    ctx,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.total, 0);
  assert.deepEqual(payload.rows, []);
  const requests = assetRequests.filter(({ origin: requestOrigin }) => requestOrigin === origin);
  assert.equal(requests.some(({ path }) => path.includes("/data/hot_search/")), false);
  assert.equal(requests.some(({ path }) => path.includes("results.chunks")), false);
}

for (const [origin, dataset] of [
  ["https://malformed-index.test", "all"],
  ["https://child-missing-index.test", "pvrm"],
]) {
  const response = await worker.fetch(
    new Request(`${origin}/api/search?dataset=${dataset}&q=88&sort=amount_desc&page=1&page_size=20`, {
      headers: { "cf-connecting-ip": "192.0.2.41" },
    }),
    env,
    ctx,
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "search_index_unavailable");
}

const exactPrefixResponse = await worker.fetch(
  new Request("https://exact-prefix.test/api/search?dataset=all&q=88&mode=exact_prefix&sort=amount_desc&page=1&page_size=20", {
    headers: { "cf-connecting-ip": "192.0.2.42" },
  }),
  env,
  ctx,
);
assert.equal(exactPrefixResponse.status, 200);
assert.equal((await exactPrefixResponse.json()).total, 0);

const oneCharResponse = await worker.fetch(
  new Request("https://one-char-search.test/api/search?dataset=all&q=8&sort=amount_desc&page=1&page_size=20", {
    headers: { "cf-connecting-ip": "192.0.2.39" },
  }),
  env,
  ctx,
);
assert.equal(oneCharResponse.status, 200);
const oneCharPayload = await oneCharResponse.json();
assert.equal(oneCharPayload.total, 125);
assert.equal(oneCharPayload.rows.length, 20);
assert.equal(oneCharPayload.rows.every((row) => row.single_line.includes("8")), true);
assert.equal(oneCharPayload.rows.some((row) => row.single_line.startsWith("8")), false);
assert.equal(
  assetRequests.some(({ origin, path }) => origin === "https://one-char-search.test" && path.endsWith("/char1/8.json")),
  true,
);

for (const [sort, page, expectedChunk] of [
  ["amount_desc", 6, "0001"],
  ["amount_asc", 11, "0002"],
  ["plate_asc", 6, "0001"],
]) {
  const origin = `https://${sort.replace("_", "-")}.test`;
  const response = await worker.fetch(
    new Request(`${origin}/api/results?dataset=all&sort=${sort}&page=${page}&page_size=200`, {
      headers: { "cf-connecting-ip": `198.51.100.${page}` },
    }),
    env,
    ctx,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.total, 3000);
  assert.equal(payload.rows.length, 200);
  const requests = assetRequests.filter(({ origin: requestOrigin }) => requestOrigin === origin);
  const sortedRequests = requests.filter(({ path }) => path.includes("/results.sorted/"));
  assert.deepEqual(sortedRequests.map(({ path }) => path), [
    `/api/v1/all/results.sorted/${sort}/${expectedChunk}.json`,
  ]);
  assert.equal(requests.some(({ path }) => path.includes("/results.chunks/")), false);
  if (sort === "amount_desc") {
    assert.equal(requests.some(({ path }) => path.includes("preset.amount_desc")), false);
  }
}

const childOrigin = "https://child-sort.test";
const childResponse = await worker.fetch(
  new Request(`${childOrigin}/api/results?dataset=tvrm_physical&sort=amount_asc&page=11&page_size=200`, {
    headers: { "cf-connecting-ip": "198.51.100.50" },
  }),
  env,
  ctx,
);
assert.equal(childResponse.status, 200);
assert.equal((await childResponse.json()).rows.length, 200);
const childRequests = assetRequests.filter(({ origin }) => origin === childOrigin);
assert.deepEqual(
  childRequests.filter(({ path }) => path.includes("/results.sorted/")).map(({ path }) => path),
  ["/api/v1/tvrm_physical/results.sorted/amount_asc/0002.json"],
);
assert.equal(childRequests.some(({ path }) => path.includes("/results.chunks/")), false);

const missingSortResponse = await worker.fetch(
  new Request("https://missing-sort.test/api/results?dataset=all&sort=plate_asc&page=1&page_size=20", {
    headers: { "cf-connecting-ip": "198.51.100.51" },
  }),
  env,
  ctx,
);
assert.equal(missingSortResponse.status, 503);
assert.equal((await missingSortResponse.json()).error, "results_index_unavailable");

const crossChunkOrigin = "https://cross-chunk.test";
const crossChunkResponse = await worker.fetch(
  new Request(`${crossChunkOrigin}/api/results?dataset=all&sort=plate_asc&page=1&page_size=200`, {
    headers: { "cf-connecting-ip": "198.51.100.52" },
  }),
  env,
  ctx,
);
assert.equal(crossChunkResponse.status, 200);
assert.equal((await crossChunkResponse.json()).rows.length, 200);
assert.deepEqual(
  assetRequests.filter(({ origin, path }) => origin === crossChunkOrigin && path.includes("/results.sorted/")).map(({ path }) => path),
  [
    "/api/v1/all/results.sorted/plate_asc/0000.json",
    "/api/v1/all/results.sorted/plate_asc/0001.json",
  ],
);

const outOfRangeOrigin = "https://out-of-range-sort.test";
const outOfRangeResponse = await worker.fetch(
  new Request(`${outOfRangeOrigin}/api/results?dataset=all&sort=plate_asc&page=20&page_size=200`, {
    headers: { "cf-connecting-ip": "198.51.100.53" },
  }),
  env,
  ctx,
);
assert.equal(outOfRangeResponse.status, 200);
assert.deepEqual((await outOfRangeResponse.json()).rows, []);
assert.equal(
  assetRequests.some(({ origin, path }) => origin === outOfRangeOrigin && path.includes("/results.sorted/")),
  false,
);

const localFallbackResponse = await worker.fetch(
  new Request("http://127.0.0.1/api/results?dataset=all&sort=plate_asc&page=1&page_size=20", {
    headers: { "cf-connecting-ip": "127.0.0.1" },
  }),
  env,
  ctx,
);
assert.equal(localFallbackResponse.status, 200);
assert.deepEqual(
  (await localFallbackResponse.json()).rows.map((row) => row.single_line),
  ["A 1", "B 2", "C 3"],
);

const dateOrigin = "https://date-page.test";
const dateResponse = await worker.fetch(
  new Request(`${dateOrigin}/api/results?dataset=all&sort=date_desc&page=3&page_size=100`, {
    headers: { "cf-connecting-ip": "203.0.113.40" },
  }),
  env,
  ctx,
);
assert.equal(dateResponse.status, 200);
assert.equal((await dateResponse.json()).rows.length, 100);
const dateRequests = assetRequests.filter(({ origin }) => origin === dateOrigin);
assert.equal(dateRequests.some(({ path }) => path.endsWith("pvrm--2026-01-03.json")), false);
assert.deepEqual(
  dateRequests.filter(({ path }) => path.includes("/issues/")).map(({ path }) => path),
  ["/api/v1/all/issues/pvrm--2026-01-02.json"],
);

const noCountOrigin = "https://date-no-count.test";
const noCountResponse = await worker.fetch(
  new Request(`${noCountOrigin}/api/results?dataset=all&sort=date_desc&page=3&page_size=100`, {
    headers: { "cf-connecting-ip": "203.0.113.42" },
  }),
  env,
  ctx,
);
assert.equal(noCountResponse.status, 200);
assert.equal((await noCountResponse.json()).rows.length, 100);
assert.deepEqual(
  assetRequests.filter(({ origin, path }) => origin === noCountOrigin && path.includes("/issues/")).map(({ path }) => path),
  [
    "/api/v1/all/issues/pvrm--2026-01-03.json",
    "/api/v1/all/issues/pvrm--2026-01-02.json",
  ],
);

const dateSpanOrigin = "https://date-span.test";
const dateSpanResponse = await worker.fetch(
  new Request(`${dateSpanOrigin}/api/results?dataset=all&sort=date_desc&page=2&page_size=150`, {
    headers: { "cf-connecting-ip": "203.0.113.43" },
  }),
  env,
  ctx,
);
assert.equal(dateSpanResponse.status, 200);
assert.equal((await dateSpanResponse.json()).rows.length, 150);
assert.deepEqual(
  assetRequests.filter(({ origin, path }) => origin === dateSpanOrigin && path.includes("/issues/")).map(({ path }) => path),
  [
    "/api/v1/all/issues/pvrm--2026-01-03.json",
    "/api/v1/all/issues/pvrm--2026-01-02.json",
  ],
);

const issuesResponse = await worker.fetch(
  new Request("https://issues-freshness.test/api/issues?dataset=all", {
    headers: { "cf-connecting-ip": "203.0.113.41" },
  }),
  env,
  ctx,
);
assert.equal(issuesResponse.status, 200);
assert.equal((await issuesResponse.json()).generated_at, "2026-08-12");

const childIssuesResponse = await worker.fetch(
  new Request("https://child-freshness.test/api/issues?dataset=tvrm_physical", {
    headers: { "cf-connecting-ip": "203.0.113.44" },
  }),
  env,
  ctx,
);
assert.equal(childIssuesResponse.status, 200);
assert.equal((await childIssuesResponse.json()).generated_at, "2026-08-11");

const noFreshnessResponse = await worker.fetch(
  new Request("https://no-freshness.test/api/issues?dataset=all", {
    headers: { "cf-connecting-ip": "203.0.113.45" },
  }),
  env,
  ctx,
);
assert.equal(noFreshnessResponse.status, 200);
assert.equal((await noFreshnessResponse.json()).generated_at, null);

console.log("Worker bounded data-access and API freshness regression tests passed.");
