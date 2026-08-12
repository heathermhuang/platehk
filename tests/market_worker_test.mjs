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

const stored = new Map();
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
  BROKER_LEADS: {
    async put(key, value, options) {
      stored.set(key, { value: value ? JSON.parse(value) : "", options });
    },
    async list({ prefix, limit }) {
      const keys = [...stored.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .slice(0, limit)
        .map(([name, item]) => ({ name, metadata: item.options?.metadata || null }));
      return { keys, list_complete: true };
    },
    async delete(key) {
      stored.delete(key);
    },
  },
  BROKER_NOTIFY_TOKEN: "test-notification-token",
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

const hiddenResponse = await worker.fetch(
  new Request("https://plate.hk/_market/28car/T.json"),
  env,
  ctx,
);
assert.equal(hiddenResponse.status, 404);
for (const encodedPath of ["/_market%2F28car%2FT.json", "/%5fmarket/28car/T.json"]) {
  const encodedHiddenResponse = await worker.fetch(
    new Request(`https://plate.hk${encodedPath}`),
    env,
    ctx,
  );
  assert.equal(encodedHiddenResponse.status, 404);
}

const inquiryResponse = await worker.fetch(
  new Request("https://plate.hk/api/broker_inquiry", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://plate.hk",
      "sec-fetch-site": "same-origin",
      "cf-connecting-ip": "192.0.2.12",
    },
    body: JSON.stringify({
      plate: "TEST8",
      listing_id: "n100001",
      budget_hkd: 100000,
      contact_method: "email",
      contact: "buyer@example.test",
      note: "Initial approach only",
      privacy_consent: true,
      company_website: "",
      lang: "en",
    }),
  }),
  env,
  ctx,
);
assert.equal(inquiryResponse.status, 201);
const inquiry = await inquiryResponse.json();
assert.match(inquiry.inquiry_id, /^[0-9a-f-]{36}$/);
assert.equal(stored.size, 2);
const saved = [...stored.entries()].find(([key]) => key.startsWith("broker-inquiry:"))[1];
assert.equal(saved.value.plate, "TEST8");
assert.equal(saved.value.contact, "buyer@example.test");
assert.equal(saved.value.source_listing_id, "n100001");
assert.equal(saved.value.privacy_terms_version, "2026-08-12");
assert.equal(saved.options.expirationTtl, 90 * 24 * 60 * 60);

const unauthorizedNotifications = await worker.fetch(
  new Request("https://plate.hk/api/internal/broker_notifications"),
  env,
  ctx,
);
assert.equal(unauthorizedNotifications.status, 404);

const pendingNotifications = await worker.fetch(
  new Request("https://plate.hk/api/internal/broker_notifications", {
    headers: { authorization: "Bearer test-notification-token" },
  }),
  env,
  ctx,
);
assert.equal(pendingNotifications.status, 200);
const pending = await pendingNotifications.json();
assert.equal(pending.notifications.length, 1);
assert.equal(pending.notifications[0].plate, "TEST8");
assert.equal(Object.hasOwn(pending.notifications[0], "contact"), false);
assert.equal(Object.hasOwn(pending.notifications[0], "note"), false);

const acknowledgeNotifications = await worker.fetch(
  new Request("https://plate.hk/api/internal/broker_notifications", {
    method: "POST",
    headers: {
      authorization: "Bearer test-notification-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      notification_keys: pending.notifications.map((item) => item.notification_key),
    }),
  }),
  env,
  ctx,
);
assert.equal(acknowledgeNotifications.status, 200);
assert.equal((await acknowledgeNotifications.json()).acknowledged, 1);
assert.equal(stored.size, 1);

const storedBeforeRejectedRequests = stored.size;
const crossOriginResponse = await worker.fetch(
  new Request("https://plate.hk/api/broker_inquiry", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://attacker.example",
      "sec-fetch-site": "cross-site",
      "cf-connecting-ip": "192.0.2.14",
    },
    body: JSON.stringify({
      plate: "TEST8",
      budget_hkd: 100000,
      contact_method: "email",
      contact: "buyer@example.test",
      privacy_consent: true,
    }),
  }),
  env,
  ctx,
);
assert.equal(crossOriginResponse.status, 403);
assert.equal(stored.size, storedBeforeRejectedRequests);

const rollbackStore = new Map();
const rollbackEnv = {
  ...env,
  BROKER_LEADS: {
    async put(key, value, options) {
      if (key.startsWith("broker-notification:")) throw new Error("notification write failed");
      rollbackStore.set(key, { value, options });
    },
    async delete(key) {
      rollbackStore.delete(key);
    },
  },
};
const notificationFailureResponse = await worker.fetch(
  new Request("https://plate.hk/api/broker_inquiry", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://plate.hk",
      "sec-fetch-site": "same-origin",
      "cf-connecting-ip": "192.0.2.18",
    },
    body: JSON.stringify({
      plate: "TEST8",
      budget_hkd: 100000,
      contact_method: "email",
      contact: "buyer@example.test",
      privacy_consent: true,
    }),
  }),
  rollbackEnv,
  ctx,
);
assert.equal(notificationFailureResponse.status, 503);
assert.equal(rollbackStore.size, 0);

const invalidAckResponse = await worker.fetch(
  new Request("https://plate.hk/api/internal/broker_notifications", {
    method: "POST",
    headers: {
      authorization: "Bearer test-notification-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      notification_keys: [...stored.keys()].filter((key) => key.startsWith("broker-inquiry:")),
    }),
  }),
  env,
  ctx,
);
assert.equal(invalidAckResponse.status, 400);
assert.equal(stored.size, storedBeforeRejectedRequests);

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
    headers: { "cf-connecting-ip": "192.0.2.15" },
  }),
  env,
  ctx,
);
assert.equal((await staleSignalResponse.json()).availability_detected, false);
const staleInquiryResponse = await worker.fetch(
  new Request("https://stale.plate.hk/api/broker_inquiry", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://stale.plate.hk",
      "sec-fetch-site": "same-origin",
      "cf-connecting-ip": "192.0.2.16",
    },
    body: JSON.stringify({
      plate: "TEST8",
      budget_hkd: 100000,
      contact_method: "email",
      contact: "buyer@example.test",
      privacy_consent: true,
    }),
  }),
  env,
  ctx,
);
assert.equal(staleInquiryResponse.status, 400);
assert.equal(stored.size, storedBeforeRejectedRequests);

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
    headers: { "cf-connecting-ip": "192.0.2.17" },
  }),
  env,
  ctx,
);
assert.equal((await invalidSourceResponse.json()).availability_detected, false);
marketPayload = freshMarketPayload;

const invalidResponse = await worker.fetch(
  new Request("https://plate.hk/api/broker_inquiry", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://plate.hk",
      "sec-fetch-site": "same-origin",
      "cf-connecting-ip": "192.0.2.13",
    },
    body: JSON.stringify({
      plate: "TEST8",
      budget_hkd: 1,
      contact_method: "email",
      contact: "not-an-email",
      privacy_consent: false,
    }),
  }),
  env,
  ctx,
);
assert.equal(invalidResponse.status, 400);

console.log("Market signal and broker inquiry Worker tests passed.");
