import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { loadConfig } from "./config.mjs";
import { OpenWAAdapter } from "./openwa-adapter.mjs";
import { normalizeCheckoutEvent, StripeGateway } from "./payment.mjs";
import { EncryptedFileStore } from "./store.mjs";
import { IntroductionWorkflow } from "./workflow.mjs";

const config = loadConfig();
await mkdir(config.dataDir, { recursive: true });

const store = new EncryptedFileStore(config.statePath, config.stateEncryptionKey);
await store.load();
const payments = new StripeGateway({
  secretKey: config.stripeSecretKey,
  webhookSecret: config.stripeWebhookSecret,
  baseUrl: config.baseUrl,
  feeHkd: config.introFeeHkd,
});

let workflow;
let whatsappState = "STARTING";
const messaging = new OpenWAAdapter(config, {
  onState: (state) => { whatsappState = state; },
  onMessage: async (message) => workflow?.handleMessage(message),
});
workflow = new IntroductionWorkflow({ store, messaging, payments, config });

function commonHeaders(contentType) {
  return {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  };
}

function json(response, status, payload) {
  response.writeHead(status, commonHeaders("application/json; charset=utf-8"));
  response.end(`${JSON.stringify(payload)}\n`);
}

function html(response, status, title, message) {
  response.writeHead(status, commonHeaders("text/html; charset=utf-8"));
  response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body><main><h1>${title}</h1><p>${message}</p><p>You may close this page.</p></main></body></html>`);
}

async function rawBody(request, maximumBytes = 65536) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", config.baseUrl);
  try {
    if (request.method === "GET" && url.pathname === "/health") {
      const status = await workflow.status();
      const healthy = status.outboxDead === 0;
      return json(response, healthy ? 200 : 503, {
        ok: healthy,
        whatsapp: whatsappState,
        outbox_pending: status.outboxPending,
        outbox_dead: status.outboxDead,
      });
    }
    if (request.method === "POST" && url.pathname === "/webhooks/stripe") {
      const body = await rawBody(request);
      const event = payments.parseWebhook(body, request.headers["stripe-signature"]);
      const normalized = normalizeCheckoutEvent(event);
      if (normalized) {
        await workflow.handleCheckoutEvent(normalized, { drain: false });
        void workflow.drainOutbox().catch((error) => console.error("Stripe follow-up failed", error));
      }
      return json(response, 200, { received: true });
    }
    if (request.method === "GET" && url.pathname === "/payment/success") {
      return html(response, 200, "Payment received", "Plate.hk is creating the three-party WhatsApp introduction group.");
    }
    if (request.method === "GET" && url.pathname === "/payment/cancelled") {
      return html(response, 200, "Payment cancelled", "No introduction fee was collected.");
    }
    return json(response, 404, { error: "not_found" });
  } catch (error) {
    console.error("HTTP request failed", { path: url.pathname, error: error instanceof Error ? error.message : String(error) });
    return json(response, 400, { error: "invalid_request" });
  }
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Plate.hk WhatsApp introduction service listening on port ${config.port}`);
});

const sweepTimer = setInterval(() => {
  void workflow.sweep().catch((error) => console.error("Introduction sweep failed", error));
}, 60_000);

void messaging.start().catch(async (error) => {
  whatsappState = "DISCONNECTED";
  console.error("OpenWA failed to start", error);
  await messaging.stop().catch(() => {});
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  clearInterval(sweepTimer);
  server.close();
  await messaging.stop?.(signal);
  process.exit(0);
}

process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
process.on("SIGINT", () => { void shutdown("SIGINT"); });
