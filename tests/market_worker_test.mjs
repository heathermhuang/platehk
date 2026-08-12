import assert from "node:assert/strict";

import worker from "../cloudflare-worker/src/index.mjs";


const observedAt = new Date().toISOString();
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
  },
};

const env = {
  ASSETS: {
    async fetch(request) {
      const url = new URL(request.url);
      if (decodeURIComponent(url.pathname) === "/_market/28car/T.json") {
        return Response.json(marketPayload);
      }
      return new Response("Not found", { status: 404 });
    },
  },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

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
