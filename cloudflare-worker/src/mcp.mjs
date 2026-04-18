import { handleApiRequest } from "./api.mjs";

const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26"];
const MCP_SERVER_VERSION = "2026.4.18";

function mcpToolDefinitions() {
  return [
    {
      name: "platehk_list_datasets",
      description: "List the public Plate.hk datasets and machine-readable API entrypoints.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "platehk_search",
      description: "Search Hong Kong plate auction history across Plate.hk public datasets.",
      inputSchema: {
        type: "object",
        properties: {
          dataset: {
            type: "string",
            enum: ["all", "pvrm", "tvrm_physical", "tvrm_eauction", "tvrm_legacy"],
            description: "Dataset to search. Use all for the aggregate public view.",
          },
          q: {
            type: "string",
            description: "Plate query such as 88, HK1, or L1BERTY.",
          },
          issue: {
            type: "string",
            description: "Optional auction date filter in YYYY-MM-DD format.",
          },
          sort: {
            type: "string",
            enum: ["amount_desc", "amount_asc", "date_desc", "plate_asc"],
            description: "Sort order for results.",
          },
          mode: {
            type: "string",
            enum: ["", "exact_prefix"],
            description: "Optional search mode.",
          },
          page: {
            type: "integer",
            minimum: 1,
            description: "1-based page number.",
          },
          page_size: {
            type: "integer",
            minimum: 1,
            maximum: 200,
            description: "Number of rows to return.",
          },
        },
        required: ["q"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "platehk_list_issues",
      description: "List auction issues for a Plate.hk dataset.",
      inputSchema: {
        type: "object",
        properties: {
          dataset: {
            type: "string",
            enum: ["pvrm", "tvrm_physical", "tvrm_eauction", "tvrm_legacy"],
          },
        },
        required: ["dataset"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "platehk_get_issue",
      description: "Fetch the full row set for a specific auction issue.",
      inputSchema: {
        type: "object",
        properties: {
          dataset: {
            type: "string",
            enum: ["pvrm", "tvrm_physical", "tvrm_eauction", "tvrm_legacy"],
          },
          auction_date: {
            type: "string",
            description: "Auction date in YYYY-MM-DD format.",
          },
        },
        required: ["dataset", "auction_date"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
    },
  ];
}

function mcpCorsHeaders(extraHeaders = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, mcp-protocol-version",
    "access-control-max-age": "86400",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "geolocation=(), microphone=(), camera=(self), browsing-topics=()",
    "cross-origin-resource-policy": "cross-origin",
    ...extraHeaders,
  };
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...mcpCorsHeaders(extraHeaders),
    },
  });
}

function jsonRpcResponse(id, result, status = 200) {
  return jsonResponse({ jsonrpc: "2.0", id: id ?? null, result }, status);
}

function jsonRpcError(id, code, message, status = 400, data = undefined) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return jsonResponse({ jsonrpc: "2.0", id: id ?? null, error }, status);
}

function jsonRpcNotificationAccepted() {
  return new Response(null, {
    status: 202,
    headers: mcpCorsHeaders(),
  });
}

function resolveProtocolVersion(rawVersion = "") {
  const requested = String(rawVersion || "").trim();
  return MCP_PROTOCOL_VERSIONS.includes(requested) ? requested : MCP_PROTOCOL_VERSIONS[0];
}

function buildInitializeResult(protocolVersion) {
  return {
    protocolVersion: resolveProtocolVersion(protocolVersion),
    capabilities: {
      tools: { listChanged: false },
      resources: { subscribe: false, listChanged: false },
      prompts: { listChanged: false },
    },
    serverInfo: {
      name: "Plate.hk MCP",
      version: MCP_SERVER_VERSION,
    },
    instructions: "Use these read-only tools to search Plate.hk public vehicle registration mark auction data.",
  };
}

export function buildMcpServerCard(request) {
  const origin = new URL(request.url).origin;
  const tools = mcpToolDefinitions();
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
    name: "hk.plate/public-data",
    version: MCP_SERVER_VERSION,
    description: "Read-only MCP server for Plate.hk public Hong Kong vehicle registration mark auction data.",
    title: "Plate.hk Public Data MCP",
    websiteUrl: `${origin}/mcp.html`,
    remotes: [
      {
        type: "streamable-http",
        url: `${origin}/mcp`,
        supportedProtocolVersions: MCP_PROTOCOL_VERSIONS,
      },
    ],
    serverInfo: {
      name: "Plate.hk MCP",
      version: MCP_SERVER_VERSION,
    },
    transport: {
      type: "streamable-http",
      endpoint: `${origin}/mcp`,
      supported_protocol_versions: MCP_PROTOCOL_VERSIONS,
    },
    capabilities: {
      tools,
      resources: [],
      prompts: [],
    },
  };
}

async function callApiJson(request, env, ctx, path, params = {}) {
  const url = new URL(path, request.url);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  const headers = new Headers({
    accept: "application/json",
    "user-agent": request.headers.get("user-agent") || "platehk-mcp-server",
  });
  const forwardedIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for");
  if (forwardedIp) headers.set("cf-connecting-ip", forwardedIp);
  const response = await handleApiRequest(new Request(url.toString(), { method: "GET", headers }), env, ctx);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = payload && payload.error ? String(payload.error) : `request_failed_${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function stringifyToolPayload(payload) {
  return JSON.stringify(payload, null, 2);
}

async function executeTool(request, env, ctx, name, args) {
  if (name === "platehk_list_datasets") {
    return callApiJson(request, env, ctx, "/api/v1/index.json");
  }
  if (name === "platehk_search") {
    return callApiJson(request, env, ctx, "/api/search", {
      dataset: args.dataset || "all",
      q: args.q,
      issue: args.issue || "",
      sort: args.sort || "amount_desc",
      mode: args.mode || "",
      page: args.page || 1,
      page_size: args.page_size || 20,
    });
  }
  if (name === "platehk_list_issues") {
    return callApiJson(request, env, ctx, "/api/issues", {
      dataset: args.dataset,
    });
  }
  if (name === "platehk_get_issue") {
    return callApiJson(request, env, ctx, "/api/issue", {
      dataset: args.dataset,
      auction_date: args.auction_date,
    });
  }
  throw new Error("unknown_tool");
}

export async function handleMcpRequest(request, env, ctx) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: mcpCorsHeaders() });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, { allow: "POST, OPTIONS" });
  }

  let rpc;
  try {
    rpc = await request.json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error", 400);
  }
  if (!rpc || typeof rpc !== "object" || Array.isArray(rpc)) {
    return jsonRpcError(null, -32600, "Invalid Request", 400);
  }

  const id = Object.prototype.hasOwnProperty.call(rpc, "id") ? rpc.id : null;
  const method = String(rpc.method || "");
  const params = rpc.params && typeof rpc.params === "object" && !Array.isArray(rpc.params) ? rpc.params : {};

  if (!method) return jsonRpcError(id, -32600, "Invalid Request", 400);
  if (!Object.prototype.hasOwnProperty.call(rpc, "id") && method === "notifications/initialized") {
    return jsonRpcNotificationAccepted();
  }
  if (method === "initialize") {
    return jsonRpcResponse(id, buildInitializeResult(params.protocolVersion), 200);
  }
  if (method === "ping") {
    return jsonRpcResponse(id, {}, 200);
  }
  if (method === "tools/list") {
    return jsonRpcResponse(id, { tools: mcpToolDefinitions() }, 200);
  }
  if (method === "tools/call") {
    const toolName = String(params.name || "");
    const args = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
      ? params.arguments
      : {};
    if (!toolName) return jsonRpcError(id, -32602, "Tool name is required", 400);
    try {
      const payload = await executeTool(request, env, ctx, toolName, args);
      return jsonRpcResponse(id, {
        content: [
          {
            type: "text",
            text: stringifyToolPayload(payload),
          },
        ],
        structuredContent: payload,
      }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "tool_execution_failed";
      const status = message === "unknown_tool" ? 404 : 400;
      return jsonRpcError(id, -32602, message === "unknown_tool" ? "Unknown tool" : "Tool call failed", status, {
        tool: toolName,
        detail: message,
      });
    }
  }
  return jsonRpcError(id, -32601, "Method not found", 404);
}
