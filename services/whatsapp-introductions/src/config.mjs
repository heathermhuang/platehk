import { resolve } from "node:path";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInteger(name, fallback, { minimum = 1, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = String(process.env[name] || fallback);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export function normalizeWhatsAppNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!/^\d{8,15}$/.test(digits)) throw new Error("WhatsApp number must contain 8 to 15 digits");
  return digits;
}

export function parseProxyUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:", "socks5:"].includes(url.protocol)) {
    throw new Error("OPENWA_PROXY_URL must use http, https, or socks5");
  }
  if (!url.hostname || !url.port) throw new Error("OPENWA_PROXY_URL must include a host and port");
  const credentials = url.username || url.password
    ? { username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) }
    : {};
  return {
    server: `${url.protocol}//${url.hostname}:${url.port}`,
    ...credentials,
  };
}

export function loadConfig() {
  const baseUrl = new URL(required("BASE_URL"));
  if (process.env.NODE_ENV === "production" && baseUrl.protocol !== "https:") {
    throw new Error("BASE_URL must use https in production");
  }
  const dataDir = resolve(process.env.DATA_DIR || "./data");
  return {
    port: positiveInteger("PORT", "10000", { maximum: 65535 }),
    baseUrl: baseUrl.toString().replace(/\/$/, ""),
    dataDir,
    statePath: resolve(dataDir, "introduction-state.enc.json"),
    stateEncryptionKey: required("STATE_ENCRYPTION_KEY"),
    stripeSecretKey: required("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: required("STRIPE_WEBHOOK_SECRET"),
    publicNumber: normalizeWhatsAppNumber(required("WHATSAPP_PUBLIC_NUMBER")),
    proxy: parseProxyUrl(required("OPENWA_PROXY_URL")),
    chromeExecutablePath: process.env.CHROME_EXECUTABLE_PATH || "/usr/bin/chromium",
    sessionId: process.env.OPENWA_SESSION_ID || "platehk-introductions",
    introFeeHkd: positiveInteger("INTRO_FEE_HKD", "199", { maximum: 100000 }),
    buyerOfferDays: positiveInteger("BUYER_OFFER_DAYS", "7", { maximum: 30 }),
    confirmationHours: positiveInteger("INTRO_CONFIRMATION_HOURS", "24", { maximum: 72 }),
    groupLifetimeDays: positiveInteger("GROUP_LIFETIME_DAYS", "7", { maximum: 30 }),
    piiRetentionDays: positiveInteger("PII_RETENTION_DAYS", "30", { minimum: 7, maximum: 365 }),
  };
}
