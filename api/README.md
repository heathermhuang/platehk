# Open API

完整雙語使用說明見 [`api.html`](../api.html)，資料 schema 以 [`api/openapi.yaml`](./openapi.yaml) 為準。

一般車牌查詢優先使用 Cloudflare Worker 的唯讀 API：

- `GET /api/search?dataset=all&q=88&page=1&page_size=20&sort=amount_desc`
- `GET /api/results?dataset=all&page=1&page_size=20&sort=amount_desc`
- `GET /api/issues?dataset=pvrm`
- `GET /api/issue?dataset=pvrm&auction_date=2026-01-17`
- `GET /api/health`

`page_size` 必須為 1 至 200。深層分頁可能回應 `400 query_window_exceeded`；收到 `429 rate_limited` 時應按 `Retry-After` 稍後重試。

`/api/search` 的結果陣列固定使用 `rows` 欄位（不是 `results`），頂層欄位為 `dataset`、`q`、`issue`、`mode`、`sort`、`page`、`page_size`、`total` 及 `rows`。

相機 OCR 使用獨立的受保護流程：瀏覽器先取得 vision session，再向 `POST /api/vision_plate` 傳送白框內裁切後的圖像。機器客戶端需使用帶有 `vision:ocr` scope 的 bearer token；它不屬於公開靜態 Open Data API。

批量同步及無資料庫讀取可使用靜態 JSON：

- `GET /api/v1/index.json`
- `GET /api/v1/pvrm/issues.manifest.json`
- `GET /api/v1/pvrm/issues/{YYYY-MM-DD}.json`
- `GET /api/v1/pvrm/auctions.json`
- `GET /api/v1/pvrm/preset.amount_desc.top1000.json`
- `GET /api/v1/{dataset}/results.chunks.json`：完整資料 manifest；其 `chunks[].file` 必須接在同一 `/api/v1/{dataset}/` 路徑下

以及：
- `GET /api/v1/tvrm_physical/...`
- `GET /api/v1/tvrm_eauction/...`
- `GET /api/v1/tvrm_legacy/...`

`tvrm_legacy` 現在只保留 `1973-2006` 年份區段資料：
- `data/TVRM auction result (1973-2026).xls` 提供歷史年份區段
- `data/TVRM auction result (2006-2026).xlsx` 的 `2007+` rows 會併入 `tvrm_physical` / `tvrm_eauction` 的正式日期分期

拍賣紀錄的來源是運輸署結果 PDF 及官方工作簿匯出。不要把 DATA.GOV.HK 的法例資源描述成車牌拍賣資料集或本 API 的拍賣紀錄來源。

因此 `tvrm_legacy` 現在固定為：
- `date_precision = "year_range"`：`auction_date` 只是 shard key，顯示時應使用 `auction_date_label`

## 為什麼是靜態 API
- 公開資料不需要資料庫
- CDN 友好，成本低
- AI / 第三方開發者可以直接抓 JSON 分片（issue shards）

## 建議的抓取方式（避免下載超大檔）
1. 一般互動式搜尋先用 `/api/search`
2. 批量同步先抓 `issues.manifest.json`，取得全部期數與 shard 路徑
3. 需要哪一期就抓哪一期的 `issues/{date}.json`
4. 若要離線搜尋完整資料，再按 normalized plate 建立自己的索引

## 更新
每次更新資料後跑：

```bash
python3 scripts/build_public_api.py
```

就會把現有 `data/` 內容複製到 `api/v1/`，確保外部使用者有穩定路徑。
