#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const REQUIRED_SECRETS = ["OPENAI_API_KEY"];
const WRANGLER_BIN = process.env.WRANGLER_BIN || "wrangler";
const DEFAULT_TIMEOUT_MS = 60000;

function getSecretCheckTimeoutMs() {
  const rawTimeout = Number.parseInt(process.env.WRANGLER_SECRET_CHECK_TIMEOUT_MS || "", 10);
  if (Number.isFinite(rawTimeout) && rawTimeout > 0) return rawTimeout;
  return DEFAULT_TIMEOUT_MS;
}

function fail(message, details = "") {
  console.error(message);
  if (details.trim()) console.error(details.trim());
  process.exit(1);
}

export function extractFirstJsonPayload(output) {
  const start = output.search(/[\[{]/);
  if (start === -1) return null;

  const stack = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < output.length; index += 1) {
    const char = output[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = inString;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }

    if (char === "}" || char === "]") {
      const expected = char === "}" ? "{" : "[";
      if (stack.pop() !== expected) return null;
      if (stack.length === 0) return output.slice(start, index + 1);
    }
  }

  return null;
}

export function collectSecretNames(payload) {
  if (Array.isArray(payload)) {
    return payload.flatMap((entry) => collectSecretNames(entry));
  }

  if (!payload || typeof payload !== "object") return [];

  const names = [];
  for (const key of ["name", "secret", "key"]) {
    if (typeof payload[key] === "string") names.push(payload[key]);
  }

  for (const key of ["secrets", "result", "items"]) {
    if (Array.isArray(payload[key])) names.push(...collectSecretNames(payload[key]));
  }

  return names;
}

export function parseSecretNames(stdout) {
  const jsonPayload = extractFirstJsonPayload(stdout);
  if (jsonPayload) {
    try {
      return new Set(collectSecretNames(JSON.parse(jsonPayload)).map((name) => String(name || "")));
    } catch {
      // Fall through to the text parser below. Some Wrangler versions print
      // progress text around JSON, and older versions print table-like output.
    }
  }

  return new Set(
    REQUIRED_SECRETS.filter((name) => new RegExp(`(^|[^A-Z0-9_])${name}([^A-Z0-9_]|$)`).test(stdout)),
  );
}

export function missingRequiredSecrets(stdout, requiredSecrets = REQUIRED_SECRETS) {
  const names = parseSecretNames(stdout || "");
  return requiredSecrets.filter((name) => !names.has(name));
}

export function main() {
  const result = spawnSync(WRANGLER_BIN, ["secret", "list", "--format", "json"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CI: process.env.CI || "1",
      WRANGLER_SEND_METRICS: process.env.WRANGLER_SEND_METRICS || "false",
    },
    input: "",
    timeout: getSecretCheckTimeoutMs(),
  });

  if (result.error?.code === "ETIMEDOUT") {
    fail(
      "Timed out while checking Cloudflare Worker secrets.",
      "Run `wrangler login` or set `CLOUDFLARE_API_TOKEN`, then retry `npm run cf:secrets:check`.",
    );
  }

  if (result.error) {
    fail(
      `Unable to run ${WRANGLER_BIN}.`,
      "Install dependencies with `npm install`, then retry `npm run cf:secrets:check`.",
    );
  }

  if (result.status !== 0) {
    fail(
      "Unable to verify Cloudflare Worker secrets.",
      `${result.stderr || result.stdout}\nRun \`wrangler login\` or set \`CLOUDFLARE_API_TOKEN\`, then retry \`npm run cf:secrets:check\`.`,
    );
  }

  const missing = missingRequiredSecrets(result.stdout || "");

  if (missing.length) {
    fail(
      `Missing Cloudflare Worker secret(s): ${missing.join(", ")}`,
      "Set the OpenAI key without committing it: `wrangler secret put OPENAI_API_KEY`.",
    );
  }

  console.log(`Cloudflare Worker required secrets configured: ${REQUIRED_SECRETS.join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
