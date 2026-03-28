# 更新流程（維護者）

本專案是純靜態站，核心資料都在 `data/`。

## 目標
- 抓到最新 PDF
- 重新清洗並輸出 `results.slim.json`、分片 `issues/*.json`、`issues.manifest.json`
- 產出 `data/audit.json` 供 `audit.html` 檢查
- 確保 `python3 scripts/verify_data_integrity.py` 通過

## 本地審核（離線）
在不依賴網絡的情況下，從已下載的 PDF 重新清洗所有資料並生成審核報表：

```bash
./scripts/run_offline_review.sh
```

輸出：
- `data/audit.json`
- `audit.html`

## 線上更新（需要網絡）
1. PVRM（自訂車牌）
- 直接跑（會抓運輸署 index，下載新 PDF）：
```bash
python3 scripts/build_dataset.py
```

2. TVRM（傳統車牌：實體 / 拍牌易）
- 更新 `data/tvrm_physical/urls.all.txt`、`data/tvrm_eauction/urls.all.txt`（來源：探索腳本）
- 用 `data/*/sources.tsv` 下載缺少的 PDF 進 `data/*/pdfs/`
- 重新解析 PDF 生成資料集：
```bash
python3 scripts/parse_tvrm_pdfs.py
```

3. 審核與驗證
```bash
python3 scripts/verify_data_integrity.py
python3 scripts/build_audit_report.py
```

4. 部署後快取
若部署端使用 service worker（`sw.js`），資料更新後需要 bump cache version：
- `sw.js` 的 `CACHE_NAME`
- `index.html` 的 `./sw.js?v=...`

## 伺服器端搜尋（MySQL）
若要在 shared host 上提供 MySQL + Search API（PHP）：
1. 先用 `server/schema.sql` 建表（phpMyAdmin 匯入）
2. 本機生成資料匯入檔：
```bash
python3 scripts/export_mysql_dump.py
```
會生成 `server/dump.sql`
3. 用 phpMyAdmin 匯入 `server/dump.sql`
4. 上傳 `api/` 目錄到站點（含 `api/.htaccess`、`api/*.php`、`api/config.php`）
5. 前端會在使用者輸入搜尋時偵測 `/api/health`；可用則用 `/api/search`，不可用則 fallback 靜態分片掃描。

### 自動更新（建議）
讓更新變成「只要上傳新 JSON，DB 自動同步」：
1. 本機更新資料並生成靜態 API：
```bash
./scripts/run_offline_review.sh
python3 scripts/build_public_api.py
```
2. 透過 SFTP 上傳更新內容到網站（至少包含 `api/v1/` 與 `data/`）
3. 在 DreamHost Cron Jobs 新增一條（路徑按你的實際 web root 調整）：
```bash
php /home/<user>/<site-root>/api/admin/sync.php
```
它會讀取站上 `api/v1/*` 的分片 JSON，將新增期數 upsert 到 MySQL，不需要每次匯入整個 SQL dump。

### 常見錯誤：#1071 key too long
若在匯入 `server/schema.sql` 時看到 `#1071 - Specified key was too long`：
- 請使用本 repo 最新版 `server/schema.sql`（已改用 `pdf_url_hash BINARY(20)` 作為唯一鍵的一部分，避免 utf8mb4 索引長度限制）
- 若你已建立了失敗的 `vrm_result` 表，先在 phpMyAdmin 刪除該表再重新匯入 schema
