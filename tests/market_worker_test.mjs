import assert from "node:assert/strict";

import worker from "../cloudflare-worker/src/index.mjs";


const observedAt = new Date().toISOString();
const assetRequests = [];
const searchIndexMeta = {
  schema_version: 1,
  row_metadata: [
    ["pvrm", "pvrm::2026-01-01", "2026-01-01", "2026年1月1日", null, null, false, "https://example.test/pvrm.pdf", null, null, null, null],
    ["tvrm_physical", "tvrm_physical::2026-02-02", "2026-02-02", "2026年2月2日", "day", null, false, "https://example.test/tvrm.pdf", null, null, null, null],
  ],
  result_states: [[null, null], ["sold", "sold"]],
  prefix_counts: { H: 2, D: 1 },
  bigram_counts: { HU: 4, UA: 2, AN: 3, NG: 4, DR: 1, RH: 1 },
};
const compactSearchRows = [
  [0, "HUANG", null, 100000, 1],
  [1, "DR HUANG", ["DR", "HUANG"], 200000, 1],
];
let marketPayload = {
  schema_version: 1,
  source: "28car",
  scraped_at: observedAt,
  fresh_for_hours: 72,
  signals: {
    TEST8: [{
      listing_id: "n100001",
      source_url: "https://m.28car.com/num_dsp.php?h_vid=50000001&h_f_do=1",
      price_type: "fixed",
      asking_price_hkd: 88000,
      first_seen_at: observedAt,
      last_seen_at: observedAt,
    }],
    TEST9: [{
      listing_id: "n100002",
      source_url: "https://m.28car.com/num_dsp.php?h_vid=50000002&h_f_do=1",
      price_type: "contact",
      asking_price_hkd: null,
      first_seen_at: observedAt,
      last_seen_at: observedAt,
    }],
  },
};

const env = {
  ASSETS: {
    async fetch(request) {
      const url = new URL(request.url);
      assetRequests.push(decodeURIComponent(url.pathname));
      if (decodeURIComponent(url.pathname) === "/api/v1/all/search-index/meta.json") {
        return Response.json(searchIndexMeta);
      }
      if (decodeURIComponent(url.pathname) === "/api/v1/all/search-index/bigram/UA.json") {
        return Response.json({ rows: compactSearchRows });
      }
      if (decodeURIComponent(url.pathname) === "/data/all.tvrm_legacy_overlap.json") {
        return Response.json({ keys: [], exact_keys: [] });
      }
      if (decodeURIComponent(url.pathname) === "/_market/28car/T.json") {
        return Response.json(marketPayload);
      }
      return new Response("Not found", { status: 404 });
    },
  },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };
globalThis.caches = {
  default: {
    async match() { return undefined; },
    async put() {},
  },
};

const indexedSearchResponse = await worker.fetch(
  new Request("https://search.plate.hk/api/search?dataset=all&q=HUANG&page=1&page_size=20&sort=amount_desc", {
    headers: { "cf-connecting-ip": "192.0.2.20" },
  }),
  env,
  ctx,
);
assert.equal(indexedSearchResponse.status, 200);
const indexedSearch = await indexedSearchResponse.json();
assert.equal(indexedSearch.total, 2);
assert.deepEqual(indexedSearch.rows.map((row) => row.single_line), ["HUANG", "DR HUANG"]);
assert.ok(assetRequests.includes("/api/v1/all/search-index/bigram/UA.json"));
assert.equal(assetRequests.some((path) => path.includes("results.chunks")), false);

const datasetSearchResponse = await worker.fetch(
  new Request("https://dataset-search.plate.hk/api/search?dataset=pvrm&q=HUANG&page=1&page_size=20&sort=amount_desc", {
    headers: { "cf-connecting-ip": "192.0.2.21" },
  }),
  env,
  ctx,
);
assert.equal(datasetSearchResponse.status, 200);
const datasetSearch = await datasetSearchResponse.json();
assert.equal(datasetSearch.total, 1);
assert.equal(datasetSearch.rows[0].dataset_key, "pvrm");

const signalResponse = await worker.fetch(
  new Request("https://plate.hk/api/market_signal?plate=TEST8", {
    headers: { "cf-connecting-ip": "192.0.2.10" },
  }),
  env,
  ctx,
);
assert.equal(signalResponse.status, 200);
const signal = await signalResponse.json();
assert.equal(signal.availability_detected, true);
assert.equal(signal.plate, "TEST8");
assert.equal(signal.asking_prices_hkd[0], 88000);
assert.equal(signal.inquiry_enabled, true);
assert.equal(Object.hasOwn(signal, "seller"), false);
assert.equal(Object.hasOwn(signal, "contact"), false);

const batchResponse = await worker.fetch(
  new Request("https://plate.hk/api/market_signal?plates=NONE1%2CTEST8%2CTEST9", {
    headers: {
      "cf-connecting-ip": "192.0.2.14",
      referer: "https://plate.hk/?q=TEST",
      "sec-fetch-site": "same-origin",
    },
  }),
  env,
  ctx,
);
assert.equal(batchResponse.status, 200);
const batch = await batchResponse.json();
assert.equal(batch.plates_requested, 3);
assert.deepEqual(batch.signals.map(({ plate }) => plate), ["TEST8", "TEST9"]);
assert.equal(batch.signals[0].asking_prices_hkd[0], 88000);
assert.equal(batch.signals[1].has_contact_price, true);
assert.equal(Object.hasOwn(batch.signals[0], "seller"), false);

const crossOriginBatchResponse = await worker.fetch(
  new Request("https://plate.hk/api/market_signal?plates=TEST8%2CTEST9", {
    headers: {
      "cf-connecting-ip": "192.0.2.16",
      origin: "https://example.test",
      "sec-fetch-site": "cross-site",
    },
  }),
  env,
  ctx,
);
assert.equal(crossOriginBatchResponse.status, 403);

const tooManyPlates = Array.from({ length: 201 }, (_, index) => `P${index}`).join(",");
const oversizedBatchResponse = await worker.fetch(
  new Request(`https://plate.hk/api/market_signal?plates=${encodeURIComponent(tooManyPlates)}`, {
    headers: {
      "cf-connecting-ip": "192.0.2.15",
      referer: "https://plate.hk/?q=P",
      "sec-fetch-site": "same-origin",
    },
  }),
  env,
  ctx,
);
assert.equal(oversizedBatchResponse.status, 400);

const missingResponse = await worker.fetch(
  new Request("https://plate.hk/api/market_signal?plate=NONE1", {
    headers: { "cf-connecting-ip": "192.0.2.11" },
  }),
  env,
  ctx,
);
assert.equal((await missingResponse.json()).availability_detected, false);

for (const hiddenPath of [
  "/_market/28car/T.json",
  "/_market%2F28car%2FT.json",
  "/%5fmarket/28car/T.json",
]) {
  const hiddenResponse = await worker.fetch(
    new Request(`https://plate.hk${hiddenPath}`),
    env,
    ctx,
  );
  assert.equal(hiddenResponse.status, 404);
}

const freshMarketPayload = marketPayload;
marketPayload = {
  ...marketPayload,
  signals: {
    TEST8: [{
      ...marketPayload.signals.TEST8[0],
      last_seen_at: new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString(),
    }],
  },
};
const staleSignalResponse = await worker.fetch(
  new Request("https://stale.plate.hk/api/market_signal?plate=TEST8", {
    headers: { "cf-connecting-ip": "192.0.2.12" },
  }),
  env,
  ctx,
);
assert.equal((await staleSignalResponse.json()).availability_detected, false);

marketPayload = {
  ...freshMarketPayload,
  signals: {
    TEST8: [{
      ...freshMarketPayload.signals.TEST8[0],
      source_url: "https://example.test/listing",
    }],
  },
};
const invalidSourceResponse = await worker.fetch(
  new Request("https://invalid-source.plate.hk/api/market_signal?plate=TEST8", {
    headers: { "cf-connecting-ip": "192.0.2.13" },
  }),
  env,
  ctx,
);
assert.equal((await invalidSourceResponse.json()).availability_detected, false);

const retiredInquiryResponse = await worker.fetch(
  new Request("https://plate.hk/api/broker_inquiry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plate: "TEST8" }),
  }),
  env,
  ctx,
);
assert.equal(retiredInquiryResponse.status, 404);

const retiredNotificationResponse = await worker.fetch(
  new Request("https://plate.hk/api/internal/broker_notifications"),
  env,
  ctx,
);
assert.equal(retiredNotificationResponse.status, 404);

console.log("Market signal and retired intake route Worker tests passed.");
