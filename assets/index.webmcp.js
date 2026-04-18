(function () {
  const mc = typeof navigator !== "undefined" ? navigator.modelContext : null;
  if (!mc || typeof mc.registerTool !== "function") return;

  function buildUrl(path, params) {
    const url = new URL(path, window.location.origin);
    for (const [key, value] of Object.entries(params || {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async function fetchJson(path, params) {
    const resp = await fetch(buildUrl(path, params), {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    let payload = null;
    try {
      payload = await resp.json();
    } catch {
      payload = null;
    }
    if (!resp.ok) {
      const message = payload && payload.error ? String(payload.error) : `request_failed_${resp.status}`;
      throw new Error(message);
    }
    return payload;
  }

  const tools = [
    {
      name: "platehk_list_datasets",
      description: "List the public Plate.hk datasets and machine-readable API entrypoints.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async () => fetchJson("/api/v1/index.json"),
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
            description: "Dataset to search. Use all for the aggregate public view."
          },
          q: {
            type: "string",
            description: "Plate query such as 88, HK1, or L1BERTY."
          },
          issue: {
            type: "string",
            description: "Optional auction date filter in YYYY-MM-DD format."
          },
          sort: {
            type: "string",
            enum: ["amount_desc", "amount_asc", "date_desc", "plate_asc"],
            description: "Sort order for results."
          },
          mode: {
            type: "string",
            enum: ["", "exact_prefix"],
            description: "Optional search mode."
          },
          page: {
            type: "integer",
            minimum: 1,
            description: "1-based page number."
          },
          page_size: {
            type: "integer",
            minimum: 1,
            maximum: 200,
            description: "Number of rows to return."
          }
        },
        required: ["q"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => fetchJson("/api/search", {
        dataset: input.dataset || "all",
        q: input.q,
        issue: input.issue || "",
        sort: input.sort || "amount_desc",
        mode: input.mode || "",
        page: input.page || 1,
        page_size: input.page_size || 20,
      }),
    },
    {
      name: "platehk_list_issues",
      description: "List auction issues for a Plate.hk dataset.",
      inputSchema: {
        type: "object",
        properties: {
          dataset: {
            type: "string",
            enum: ["pvrm", "tvrm_physical", "tvrm_eauction", "tvrm_legacy"]
          }
        },
        required: ["dataset"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => fetchJson("/api/issues", { dataset: input.dataset }),
    },
    {
      name: "platehk_get_issue",
      description: "Fetch the full row set for a specific auction issue.",
      inputSchema: {
        type: "object",
        properties: {
          dataset: {
            type: "string",
            enum: ["pvrm", "tvrm_physical", "tvrm_eauction", "tvrm_legacy"]
          },
          auction_date: {
            type: "string",
            description: "Auction date in YYYY-MM-DD format."
          }
        },
        required: ["dataset", "auction_date"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => fetchJson("/api/issue", input),
    }
  ];

  for (const tool of tools) {
    mc.registerTool(tool);
  }
})();
