import { randomBytes } from "node:crypto";

const PLATE_RE = /^[A-Z0-9]{1,16}$/;
const SOURCE_HOST = "m.28car.com";

export function normalizePlate(value) {
  const normalized = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return PLATE_RE.test(normalized) ? normalized : "";
}

export function normalizeChatId(value) {
  if (value && typeof value === "object") {
    return normalizeChatId(value._serialized || value.id || value.user);
  }
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{8,15}$/.test(text)) return `${text}@c.us`;
  return /@(c|g)\.us$/.test(text) || /@lid$/.test(text) ? text : "";
}

export function valid28carUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && url.hostname === SOURCE_HOST ? url.toString() : "";
  } catch {
    return "";
  }
}

function parseFields(body) {
  const fields = new Map();
  String(body || "").split(/\r?\n/).forEach((line) => {
    const separator = line.indexOf(":");
    if (separator <= 0) return;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    fields.set(key, value);
  });
  return fields;
}

export function parseIntent(body) {
  const text = String(body || "").trim();
  const buyer = /^\[PLATEHK BUY\]/i.test(text);
  const seller = /^\[PLATEHK SELL\]/i.test(text);
  if (!buyer && !seller) return null;
  const fields = parseFields(text);
  const plate = normalizePlate(fields.get("plate"));
  if (!plate) return null;
  const sourceUrl = valid28carUrl(fields.get("source"));
  if (seller) return { role: "seller", plate, sourceUrl };
  const budget = Number(String(fields.get("budget-hkd") || "").replace(/[^0-9]/g, ""));
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > 100000000) return null;
  return {
    role: "buyer",
    plate,
    budgetHkd: budget,
    sourceUrl,
    note: String(fields.get("note") || "").slice(0, 300),
  };
}

export function parseCommand(body) {
  const normalized = String(body || "").trim().replace(/\s+/g, " ").toUpperCase();
  const patterns = [
    ["buyer_confirm", /^BUYER YES ([A-Z0-9]{6})$/],
    ["seller_accept", /^SELLER YES ([A-Z0-9]{6})$/],
    ["buyer_match", /^MATCH YES ([A-Z0-9]{6})$/],
    ["intro_confirm", /^INTRO ([A-Z0-9]{6})$/],
  ];
  for (const [type, pattern] of patterns) {
    const match = normalized.match(pattern);
    if (match) return { type, code: match[1] };
  }
  return null;
}

export function newId(prefix) {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}

export function newCode() {
  return randomBytes(5).toString("base64url").replace(/[^A-Z0-9]/gi, "").slice(0, 6).toUpperCase().padEnd(6, "7");
}

export function formatMoney(value) {
  return `HK$${Number(value).toLocaleString("en-HK")}`;
}

export function buyerStartMessage({ plate, budgetHkd, sourceUrl, note }) {
  return [
    "[PLATEHK BUY]",
    `Plate: ${plate}`,
    `Budget-HKD: ${budgetHkd}`,
    sourceUrl ? `Source: ${sourceUrl}` : "",
    note ? `Note: ${note}` : "",
  ].filter(Boolean).join("\n");
}

export function sellerStartMessage({ plate, sourceUrl }) {
  return [
    "[PLATEHK SELL]",
    `Plate: ${plate}`,
    sourceUrl ? `Source: ${sourceUrl}` : "",
  ].filter(Boolean).join("\n");
}

export function waMeUrl(number, message) {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
