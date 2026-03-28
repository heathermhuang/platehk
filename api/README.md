# Open API (Static)

這個專案本身是純靜態站，最穩定、最容易部署的方式是提供「靜態 Open Data API」：

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
- 不需要資料庫、不需要伺服器
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

## Shared host（PHP + MySQL）搜尋 API
若你使用 shared hosting，無法跑長駐後端（FastAPI/Node），可以在同一個網站底下部署 PHP API：
- `/api/health`
- `/api/search`
- `/api/issues`
- `/api/issue`

程式碼在 `api/*.php`，並由 `api/.htaccess` 提供乾淨路徑。

### 自動同步到 MySQL（推薦）
上傳新的靜態資料（`api/v1/...`）後，可用 cron 跑 CLI 腳本自動 upsert 到 MySQL：

```bash
php /home/<user>/<site-root>/api/admin/sync.php
```

安全性：
- `api/admin/` 已透過 `.htaccess` 禁止 web access
- `sync.php` 只允許 CLI 執行（非 CLI 會返回 404）

### 常見錯誤：#1071 key too long
若匯入 `server/schema.sql` 時遇到 `#1071 - Specified key was too long`，原因通常是把超長 `pdf_url` 放在 UNIQUE KEY（utf8mb4 下會超過 InnoDB key 長度限制）。
本 repo 最新 schema 已改用 `pdf_url_hash BINARY(20)` 參與唯一鍵，請重新匯入新版 schema。
