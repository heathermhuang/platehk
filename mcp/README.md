# MCP Service Design

目標：讓 AI 與第三方開發者以「工具」方式存取車牌拍賣資料，不需要下載全量 JSON。

本 repo 提供兩種方式：
1) **靜態 Open Data API**（見 `api/`）  
2) **伺服器端搜尋 API（MySQL）**（見 `server/`，提供 `/api/search`）

現在 Worker 已提供一個最小可用的 HTTP MCP 端點：
- `/mcp`
- `/.well-known/mcp/server-card.json`
- `/.well-known/mcp-server-card`

MCP 服務設計仍建議保持薄薄的 proxy：
- 優先呼叫伺服器端 `/api/search`（不需要掃描分片 JSON，延遲最低）
- 若後端不可用，再 fallback 到 `/api/v1/...` 的分片資料

## Tools（建議）

1. `vrm.list_datasets`
- Input: `{}`  
- Output: `{ datasets: [{ id, label, base }] }`

2. `vrm.list_issues`
- Input: `{ dataset: "pvrm"|"tvrm_physical"|"tvrm_eauction" }`
- Output: `{ issues: [{ auction_date, count, is_lny? }] }`

3. `vrm.get_issue`
- Input: `{ dataset, auction_date }`
- Output: `{ auction_date, rows: [...] }`

4. `vrm.search`
- Input:
  - `dataset`
  - `q` (plate query)
  - `issue` (optional; restrict to one issue)
  - `limit` (default 200)
  - `cursor` (optional; pagination token)
- Output:
  - `{ rows: [...], next_cursor? }`
- Notes:
  - Normalize query: trim, uppercase, remove extra spaces.
  - HK PVRM search normalization: replace `I -> 1`, `O -> 0`, ignore spaces.

5. `vrm.get_plate_history`
- Input: `{ dataset, plate }`
- Output: `{ plate, hits: [{ auction_date, single_line, double_line, amount_hkd, pdf_url }] }`

## Implementation Notes

- MCP server can be deployed as:
  - Cloudflare Worker (HTTP fetch to the static API + caching)
  - Small Node/Python service
- For correctness and speed:
  - Cache `issues.manifest.json` per dataset
  - Cache hot issue shards
  - Progressive scan for search if you don't build an index

## Index Option (Optional)
若要做真正快速搜尋，可額外生成「倒排索引」shards，例如按 plate 前 2 字元分片：
- `index/{dataset}/prefix/{AA}.json`
並在 MCP `vrm.search` 只抓對應分片。
