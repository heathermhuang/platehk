import { handleApiRequest } from "./api.mjs";
import {
  buildOAuthAuthorizationServerMetadata,
  getOAuthJwksDocument,
  getStaticText,
} from "./lib.mjs";

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

function isMarkdownPreferred(request) {
  const accept = String(request.headers.get("accept") || "").toLowerCase();
  return accept.includes("text/markdown");
}

function appendLink(headers, value) {
  headers.append("link", value);
}

function appendDiscoveryLinkHeaders(headers, url) {
  appendLink(headers, `</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`);
  appendLink(headers, `</.well-known/oauth-authorization-server>; rel="alternate"; type="application/json"`);
  appendLink(headers, `</.well-known/jwks.json>; rel="alternate"; type="application/jwk-set+json"`);
  appendLink(headers, `</api/openapi.yaml>; rel="service-desc"; type="application/openapi+yaml"`);
  appendLink(headers, `</api.html>; rel="service-doc"; type="text/html"`);
  appendLink(headers, `</sitemap.xml>; rel="sitemap"; type="application/xml"`);
  appendLink(headers, `</llms.txt>; rel="describedby"; type="text/plain"`);
  appendLink(headers, `</skill.md>; rel="alternate"; type="text/markdown"`);
  if (url.pathname === "/" || url.pathname === "/index.html") {
    appendLink(headers, `</agent.md>; rel="alternate"; type="text/markdown"`);
  }
}

async function serveHomepageMarkdown(request, env, { noindex = false } = {}) {
  const body = await getStaticText(env, request.url, "./agent.md");
  if (body == null) return new Response("Markdown representation unavailable", { status: 503 });
  const headers = new Headers({
    "content-type": "text/markdown; charset=utf-8",
    "cache-control": "public, max-age=0, must-revalidate",
    vary: "Accept",
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "geolocation=(), microphone=(), camera=(self), browsing-topics=()",
    "cross-origin-resource-policy": "same-origin",
  });
  if (noindex) headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  appendDiscoveryLinkHeaders(headers, new URL(request.url));
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(body, { status: 200, headers });
}

async function serveApiCatalog(request, env, { noindex = false } = {}) {
  const body = await getStaticText(env, request.url, "./.well-known/api-catalog.json");
  if (body == null) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "content-type": 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
    "cache-control": "public, max-age=0, must-revalidate",
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "geolocation=(), microphone=(), camera=(self), browsing-topics=()",
    "cross-origin-resource-policy": "same-origin",
  });
  if (noindex) headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  appendLink(headers, `</api/openapi.yaml>; rel="service-desc"; type="application/openapi+yaml"`);
  appendLink(headers, `</api.html>; rel="service-doc"; type="text/html"`);
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(body, { status: 200, headers });
}

function jsonAssetHeaders(contentType, { noindex = false, cacheControl = "public, max-age=300, must-revalidate", crossOrigin = false } = {}) {
  const headers = new Headers({
    "content-type": `${contentType}; charset=utf-8`,
    "cache-control": cacheControl,
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "geolocation=(), microphone=(), camera=(self), browsing-topics=()",
    "cross-origin-resource-policy": crossOrigin ? "cross-origin" : "same-origin",
  });
  if (crossOrigin) headers.set("access-control-allow-origin", "*");
  if (noindex) headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  return headers;
}

function serveOauthAuthorizationServerMetadata(request, env, { noindex = false } = {}) {
  const headers = jsonAssetHeaders("application/json", { noindex, crossOrigin: true });
  appendLink(headers, `</.well-known/jwks.json>; rel="alternate"; type="application/jwk-set+json"`);
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(JSON.stringify(buildOAuthAuthorizationServerMetadata(request, env)), { status: 200, headers });
}

function serveOauthJwks(request, env, { noindex = false } = {}) {
  const headers = jsonAssetHeaders("application/jwk-set+json", {
    noindex,
    cacheControl: "public, max-age=3600, must-revalidate",
    crossOrigin: true,
  });
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(JSON.stringify(getOAuthJwksDocument(env)), { status: 200, headers });
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
  const genericNoindex = !primaryHost;
  const isHome = url.pathname === "/" || url.pathname === "/index.html";
  if (primaryHost && isHome && (request.method === "GET" || request.method === "HEAD") && isMarkdownPreferred(request)) {
    return serveHomepageMarkdown(request, env);
  }
  if (url.pathname === "/.well-known/api-catalog" && (request.method === "GET" || request.method === "HEAD")) {
    return serveApiCatalog(request, env, { noindex: genericNoindex });
  }
  if (url.pathname === "/.well-known/oauth-authorization-server" && (request.method === "GET" || request.method === "HEAD")) {
    return serveOauthAuthorizationServerMetadata(request, env, { noindex: genericNoindex });
  }
  if (url.pathname === "/.well-known/jwks.json" && (request.method === "GET" || request.method === "HEAD")) {
    return serveOauthJwks(request, env, { noindex: genericNoindex });
  }
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
  const noindex = genericNoindex && contentType.includes("text/html");
  if (!primaryHost && contentType.includes("text/html")) {
    const rewritten = (await response.text()).replaceAll("https://plate.hk", url.origin);
    const headers = securityHeadersForAsset(request, response, { noindex });
    if (url.pathname.endsWith(".md")) headers.set("content-type", "text/markdown; charset=utf-8");
    if (primaryHost) appendDiscoveryLinkHeaders(headers, url);
    if (isHome) headers.append("vary", "Accept");
    return new Response(rewritten, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  const headers = securityHeadersForAsset(request, response, { noindex });
  if (url.pathname.endsWith(".md")) headers.set("content-type", "text/markdown; charset=utf-8");
  if (primaryHost) appendDiscoveryLinkHeaders(headers, url);
  if (isHome) headers.append("vary", "Accept");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
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
