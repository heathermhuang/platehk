#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

import worker from "../cloudflare-worker/src/index.mjs";

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
  [".xls", "application/vnd.ms-excel"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [".xml", "application/xml; charset=utf-8"],
  [".yaml", "application/yaml; charset=utf-8"],
  [".yml", "application/yaml; charset=utf-8"],
]);

function parseArgs(argv) {
  const args = {
    assets: ".tmp/cloudflare-public",
    host: "127.0.0.1",
    port: 8080,
  };
  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = argv[idx];
    if (arg === "--assets") args.assets = argv[++idx] || args.assets;
    else if (arg === "--host") args.host = argv[++idx] || args.host;
    else if (arg === "--port") args.port = Number(argv[++idx] || args.port);
  }
  return args;
}

function toAssetPath(root, pathname) {
  const decoded = decodeURIComponent(pathname || "/");
  const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`;
  const routes = decoded === "/"
    ? ["/index.html"]
    : decoded.endsWith("/")
      ? [`${decoded}index.html`]
      : extname(decoded)
        ? [decoded]
        : [`${decoded}.html`];
  for (const route of routes) {
    const withoutLeadingSlash = route.replace(/^\/+/, "");
    const candidate = resolve(root, normalize(withoutLeadingSlash));
    if (candidate !== root && !candidate.startsWith(rootWithSep)) return null;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function createAssetBinding(root) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const path = toAssetPath(root, url.pathname);
      if (!path || !existsSync(path)) return new Response("Not found", { status: 404 });
      const stats = statSync(path);
      if (!stats.isFile()) return new Response("Not found", { status: 404 });
      const headers = new Headers({
        "content-length": String(stats.size),
        "content-type": MIME_TYPES.get(extname(path).toLowerCase()) || "application/octet-stream",
      });
      if (request.method === "HEAD") return new Response(null, { status: 200, headers });
      return new Response(createReadStream(path), { status: 200, headers });
    },
  };
}

function createMemoryCaches() {
  const store = new Map();
  return {
    default: {
      async match(request) {
        const cached = store.get(new Request(request).url);
        if (!cached) return undefined;
        return new Response(Buffer.from(cached.body), {
          status: cached.status,
          statusText: cached.statusText,
          headers: cached.headers,
        });
      },
      async put(request, response) {
        const clone = response.clone();
        store.set(new Request(request).url, {
          body: Buffer.from(await clone.arrayBuffer()),
          headers: Array.from(clone.headers.entries()),
          status: clone.status,
          statusText: clone.statusText,
        });
      },
    },
  };
}

async function bodyForRequest(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function writeNodeResponse(res, response) {
  const headers = {};
  for (const [key, value] of response.headers) headers[key] = value;
  res.writeHead(response.status, response.statusText, headers);
  if (response.body && response.status !== 204 && response.status !== 304) {
    const body = Buffer.from(await response.arrayBuffer());
    res.end(body);
  } else {
    res.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const assetsRoot = resolve(process.cwd(), args.assets);
  if (!existsSync(join(assetsRoot, "index.html"))) {
    console.error(`Asset directory is missing index.html: ${assetsRoot}`);
    process.exit(1);
  }

  if (typeof globalThis.caches === "undefined") {
    globalThis.caches = createMemoryCaches();
  }

  const env = {
    ...process.env,
    APP_ENV: process.env.APP_ENV || "local",
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    OPENAI_TIMEOUT_SECONDS: process.env.OPENAI_TIMEOUT_SECONDS || "20",
    OPENAI_VISION_MODEL: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
    ASSETS: createAssetBinding(assetsRoot),
  };
  const pending = new Set();
  const ctx = {
    waitUntil(promise) {
      const tracked = Promise.resolve(promise).finally(() => pending.delete(tracked));
      pending.add(tracked);
    },
    passThroughOnException() {},
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || `${args.host}:${args.port}`}`);
      const body = await bodyForRequest(req);
      const request = new Request(url, {
        body,
        headers: req.headers,
        method: req.method,
      });
      const response = await worker.fetch(request, env, ctx);
      await writeNodeResponse(res, response);
    } catch (error) {
      console.error("[local-worker-dev]", error);
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Internal Server Error");
    }
  });

  server.listen(args.port, args.host, () => {
    console.log(`PVRM local Worker shim listening on http://${args.host}:${args.port}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
