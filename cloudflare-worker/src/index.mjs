import { handleApiRequest } from "./api.mjs";

const PRIMARY_HOSTS = new Set(["plate.hk", "www.plate.hk"]);

function isPrimaryHost(hostname) {
  return PRIMARY_HOSTS.has(String(hostname || "").toLowerCase());
}

function securityHeadersForAsset(request, response, { noindex = false } = {}) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "SAMEORIGIN");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "geolocation=(), microphone=(), camera=(self), browsing-topics=()");
  headers.set("cross-origin-resource-policy", "same-origin");
  const contentType = String(headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/html")) {
    headers.set(
      "content-security-policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://static.cloudflareinsights.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: https:",
        "font-src 'self' data: https://fonts.gstatic.com",
        "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://stats.g.doubleclick.net",
        "worker-src 'self' blob:",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self'",
        "upgrade-insecure-requests",
      ].join("; "),
    );
  }
  if (noindex) {
    headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  }
  return headers;
}

function buildStagingRobotsTxt() {
  return [
    "User-agent: *",
    "Disallow: /",
  ].join("\n");
}

function buildEmptySitemapXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
  ].join("");
}

async function serveAsset(request, env) {
  const url = new URL(request.url);
  const primaryHost = isPrimaryHost(url.hostname);
  if (!primaryHost && url.pathname === "/robots.txt") {
    return new Response(buildStagingRobotsTxt(), {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow, noarchive",
      },
    });
  }
  if (!primaryHost && url.pathname === "/sitemap.xml") {
    return new Response(buildEmptySitemapXml(), {
      status: 200,
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow, noarchive",
      },
    });
  }
  if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
    return new Response("Static assets binding not configured", { status: 500 });
  }
  const response = await env.ASSETS.fetch(request);
  if (!response.ok) return response;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const noindex = !primaryHost && contentType.includes("text/html");
  if (!primaryHost && contentType.includes("text/html")) {
    const rewritten = (await response.text()).replaceAll("https://plate.hk", url.origin);
    return new Response(rewritten, {
      status: response.status,
      statusText: response.statusText,
      headers: securityHeadersForAsset(request, response, { noindex }),
    });
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: securityHeadersForAsset(request, response, { noindex }),
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === "www.plate.hk" || url.hostname === "pvrm.hk") {
      const redirectUrl = new URL(request.url);
      redirectUrl.hostname = "plate.hk";
      return Response.redirect(redirectUrl.toString(), 301);
    }
    if (url.pathname.startsWith("/api/")) {
      return handleApiRequest(request, env, ctx);
    }
    return serveAsset(request, env);
  },
};
