# Open API

這個專案的公開資料以靜態 JSON 發布，動態搜尋與相機 OCR 由 Cloudflare Worker 提供：

- `GET /api/v1/index.json`
- `GET /api/v1/pvrm/issues.manifest.json`
- `GET /api/v1/pvrm/issues/{YYYY-MM-DD}.json`
- `GET /api/v1/pvrm/auctions.json`
- `GET /api/v1/pvrm/preset.amount_desc.top1000.json`

以及：
- `GET /api/v1/tvrm_physical/...`
- `GET /api/v1/tvrm_eauction/...`
- `GET /api/v1/tvrm_legacy/...`

`tvrm_legacy` 現在只保留 `1973-2006` 年份區段資料：
- `data/TVRM auction result (1973-2026).xls` 提供歷史年份區段
- `data/TVRM auction result (2006-2026).xlsx` 的 `2007+` rows 會併入 `tvrm_physical` / `tvrm_eauction` 的正式日期分期

因此 `tvrm_legacy` 現在固定為：
- `date_precision = "year_range"`：`auction_date` 只是 shard key，顯示時應使用 `auction_date_label`

資料 schema 以 `api/openapi.yaml` 為準。

## 為什麼是靜態 API
- 公開資料不需要資料庫
- CDN 友好，成本低
- AI / 第三方開發者可以直接抓 JSON 分片（issue shards）

## 建議的抓取方式（避免下載超大檔）
1. 先抓 `issues.manifest.json`，取得全部期數與 shard 路徑
2. 需要哪一期就抓哪一期的 `issues/{date}.json`
3. 如果要做搜尋，建議自己建立索引（以 normalized plate 作 key）

## 更新
每次更新資料後跑：

```bash
python3 scripts/build_public_api.py
```

就會把現有 `data/` 內容複製到 `api/v1/`，確保外部使用者有穩定路徑。
