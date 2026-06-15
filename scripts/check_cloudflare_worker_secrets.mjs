#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const REQUIRED_SECRETS = ["OPENAI_API_KEY"];
const WRANGLER_BIN = process.env.WRANGLER_BIN || "wrangler";

function fail(message, details = "") {
  console.error(message);
  if (details.trim()) console.error(details.trim());
  process.exit(1);
}

const result = spawnSync(WRANGLER_BIN, ["secret", "list", "--format", "json"], {
  encoding: "utf8",
  env: {
    ...process.env,
    CI: process.env.CI || "1",
    WRANGLER_SEND_METRICS: process.env.WRANGLER_SEND_METRICS || "false",
  },
  input: "",
  timeout: 20000,
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

let secrets;
try {
  secrets = JSON.parse(result.stdout || "[]");
} catch {
  fail("Wrangler returned non-JSON secret output.", result.stdout);
}

const names = new Set((Array.isArray(secrets) ? secrets : []).map((secret) => String(secret?.name || "")));
const missing = REQUIRED_SECRETS.filter((name) => !names.has(name));

if (missing.length) {
  fail(
    `Missing Cloudflare Worker secret(s): ${missing.join(", ")}`,
    "Set the OpenAI key without committing it: `wrangler secret put OPENAI_API_KEY`.",
  );
}

console.log(`Cloudflare Worker required secrets configured: ${REQUIRED_SECRETS.join(", ")}`);
