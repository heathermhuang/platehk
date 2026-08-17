import { handleApiRequest } from "./api.mjs";
import {
  buildOAuthProtectedResourceMetadata,
  buildOAuthAuthorizationServerMetadata,
  getOAuthJwksDocument,
  getStaticText,
} from "./lib.mjs";
import {
  buildMcpServerCard,
  handleMcpRequest,
} from "./mcp.mjs";

const PRIMARY_HOSTS = new Set(["plate.hk", "www.plate.hk"]);
const STATIC_HTML_ROUTES = new Set([
  "/about",
  "/api",
  "/audit",
  "/camera",
  "/changelog",
  "/landing",
  "/privacy",
  "/terms",
]);

function isPrimaryHost(hostname) {
  return PRIMARY_HOSTS.has(String(hostname || "").toLowerCase());
}

function canonicalPublicPath(pathname) {
  if (pathname === "/index" || pathname === "/index.html") return "/";
  if (pathname === "/plates" || pathname === "/plates/" || pathname === "/plates/index") {
    return "/plates/index.html";
  }
  if (STATIC_HTML_ROUTES.has(pathname)) return `${pathname}.html`;
  if (/^\/plates\/[A-Za-z0-9]+$/.test(pathname)) return `${pathname}.html`;
  return null;
}

function redirectToCanonicalHtml(request, url) {
  if (!isPrimaryHost(url.hostname) || !["GET", "HEAD"].includes(request.method)) return null;
  const canonicalPath = canonicalPublicPath(url.pathname);
  if (!canonicalPath) return null;
  const redirectUrl = new URL(url);
  redirectUrl.pathname = canonicalPath;
  return Response.redirect(redirectUrl.toString(), 301);
}

function requestForHtmlAsset(request, url) {
  if (!isPrimaryHost(url.hostname)
      || !["GET", "HEAD"].includes(request.method)
      || !url.pathname.endsWith(".html")) {
    return request;
  }
  const assetUrl = new URL(url);
  assetUrl.pathname = url.pathname.endsWith("/index.html")
    ? url.pathname.slice(0, -"index.html".length)
    : url.pathname.slice(0, -".html".length);
  return new Request(assetUrl.toString(), request);
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
        "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://stats.g.doubleclick.net",
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
  appendLink(headers, `</.well-known/oauth-protected-resource>; rel="alternate"; type="application/json"`);
  appendLink(headers, `</.well-known/oauth-authorization-server>; rel="alternate"; type="application/json"`);
  appendLink(headers, `</.well-known/jwks.json>; rel="alternate"; type="application/jwk-set+json"`);
  appendLink(headers, `</.well-known/mcp/server-card.json>; rel="alternate"; type="application/json"`);
  appendLink(headers, `</.well-known/mcp-server-card>; rel="alternate"; type="application/json"`);
  appendLink(headers, `</mcp>; rel="alternate"; type="application/json"`);
  appendLink(headers, `</api/openapi.yaml>; rel="service-desc"; type="application/openapi+yaml"`);
  appendLink(headers, `</api.html>; rel="service-doc"; type="text/html"`);
  appendLink(headers, `</sitemap.xml>; rel="sitemap"; type="application/xml"`);
  appendLink(headers, `</llms.txt>; rel="describedby"; type="text/plain"`);
  appendLink(headers, `</about.html>; rel="describedby"; type="text/html"`);
  appendLink(headers, `</skill.md>; rel="alternate"; type="text/markdown"`);
  if (url.pathname === "/" || url.pathname === "/index.html") {
    appendLink(headers, `</agent.md>; rel="alternate"; type="text/markdown"`);
  }
}

function withDiscoveryLinkHeaders(response, url) {
  const headers = new Headers(response.headers);
  appendDiscoveryLinkHeaders(headers, url);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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

function serveOauthProtectedResourceMetadata(request, env, { noindex = false } = {}) {
  const headers = jsonAssetHeaders("application/json", { noindex, crossOrigin: true });
  appendLink(headers, `</.well-known/oauth-authorization-server>; rel="alternate"; type="application/json"`);
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(JSON.stringify(buildOAuthProtectedResourceMetadata(request, env, "/api/vision_plate")), { status: 200, headers });
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

function serveMcpServerCard(request, { noindex = false } = {}) {
  const headers = jsonAssetHeaders("application/json", { noindex, crossOrigin: true });
  appendLink(headers, `</mcp>; rel="alternate"; type="application/json"`);
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(JSON.stringify(buildMcpServerCard(request)), { status: 200, headers });
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
  let decodedPathname = "";
  try {
    decodedPathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response("Not found", {
      status: 404,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  }
  if (decodedPathname === "/_market" || decodedPathname.startsWith("/_market/")) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-robots-tag": "noindex, nofollow, noarchive",
      },
    });
  }
  const primaryHost = isPrimaryHost(url.hostname);
  const genericNoindex = !primaryHost;
  const isHome = url.pathname === "/" || url.pathname === "/index.html";
  if (primaryHost && isHome && (request.method === "GET" || request.method === "HEAD") && isMarkdownPreferred(request)) {
    return serveHomepageMarkdown(request, env);
  }
  if (url.pathname === "/.well-known/api-catalog" && (request.method === "GET" || request.method === "HEAD")) {
    return serveApiCatalog(request, env, { noindex: genericNoindex });
  }
  if ((url.pathname === "/.well-known/oauth-protected-resource"
      || url.pathname === "/.well-known/oauth-protected-resource/api/vision_plate")
      && (request.method === "GET" || request.method === "HEAD")) {
    return serveOauthProtectedResourceMetadata(request, env, { noindex: genericNoindex });
  }
  if (url.pathname === "/.well-known/oauth-authorization-server" && (request.method === "GET" || request.method === "HEAD")) {
    return serveOauthAuthorizationServerMetadata(request, env, { noindex: genericNoindex });
  }
  if (url.pathname === "/.well-known/jwks.json" && (request.method === "GET" || request.method === "HEAD")) {
    return serveOauthJwks(request, env, { noindex: genericNoindex });
  }
  if ((url.pathname === "/.well-known/mcp/server-card.json" || url.pathname === "/.well-known/mcp-server-card")
      && (request.method === "GET" || request.method === "HEAD")) {
    return serveMcpServerCard(request, { noindex: genericNoindex });
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
  const response = await env.ASSETS.fetch(requestForHtmlAsset(request, url));
  if (!response.ok) return response;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const isPublicDataJson = primaryHost
    && url.pathname.startsWith("/data/")
    && contentType.includes("application/json");
  const noindex = (genericNoindex && contentType.includes("text/html")) || isPublicDataJson;
  if (!primaryHost && contentType.includes("text/html")) {
    const rewritten = (await response.text()).replaceAll("https://plate.hk", url.origin);
    const headers = securityHeadersForAsset(request, response, { noindex });
    headers.delete("content-length");
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
    const canonicalHtmlRedirect = redirectToCanonicalHtml(request, url);
    if (canonicalHtmlRedirect) return canonicalHtmlRedirect;
    if (url.pathname.startsWith("/api/")) {
      const response = await handleApiRequest(request, env, ctx);
      return isPrimaryHost(url.hostname) ? withDiscoveryLinkHeaders(response, url) : response;
    }
    if (url.pathname === "/mcp") {
      const response = await handleMcpRequest(request, env, ctx);
      return isPrimaryHost(url.hostname) ? withDiscoveryLinkHeaders(response, url) : response;
    }
    return serveAsset(request, env);
  },
};
