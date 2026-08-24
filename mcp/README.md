# MCP Service

Plate.hk 的 Cloudflare Worker 提供唯讀 streamable HTTP MCP 服務，讓 AI 與第三方工具搜尋香港車牌拍賣紀錄，不需要下載全量 JSON。完整雙語使用說明見 [`mcp.html`](../mcp.html)，實作在 [`cloudflare-worker/src/mcp.mjs`](../cloudflare-worker/src/mcp.mjs)。

## 連線與 discovery

- MCP endpoint：`POST /mcp`
- Server Card：`/.well-known/mcp/server-card.json`
- 相容別名：`/.well-known/mcp-server-card`
- 支援 protocol：`2025-06-18`、`2025-03-26`

列出目前工具：

```bash
curl https://plate.hk/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2025-06-18' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 現有 tools

1. `platehk_list_datasets`
   - Input：`{}`
   - 列出公開 dataset 及 machine-readable API 入口。
2. `platehk_search`
   - Required input：`q`
   - Optional input：`dataset`、`issue`、`sort`、`mode`、`page`、`page_size`
   - `dataset` 支援 `all`、`pvrm`、`tvrm_physical`、`tvrm_eauction`、`tvrm_legacy`；`page_size` 上限為 200。
3. `platehk_list_issues`
   - Required input：`dataset`
   - 列出 `pvrm`、`tvrm_physical`、`tvrm_eauction` 或 `tvrm_legacy` 的拍賣期數。
4. `platehk_get_issue`
   - Required input：`dataset`、`auction_date`
   - 取得指定期數的完整資料列。

所有工具都透過現有 Plate.hk API 執行，回傳 source-linked JSON，並標示為 read-only。搜尋會 trim、uppercase、處理版面空格；PVRM matching 亦會套用 `I -> 1`、`O -> 0`、刪除 `Q` 的規則。

## 權限邊界

公開 MCP tools 不需要 OAuth，亦不提供寫入、預約或交易能力。相機 OCR 是另一個受保護端點；機器客戶端需要帶有 `vision:ocr` scope 的 bearer token。相關 discovery：

- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-authorization-server`
- `/.well-known/jwks.json`
