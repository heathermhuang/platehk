# 更新流程（維護者）

本專案是純靜態站，核心資料都在 `data/`。

## 目標
- 抓到最新 PDF
- 抓到最新官方開放/即將舉行活動，輸出 `data/events.json`
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
- 首頁拍賣日程（會抓運輸署中英文「拍賣取得車牌」總覽頁；PVRM 申請窗口按 1/5/9 月固定規律計算）：
```bash
python3 scripts/build_events.py
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

## Cloudflare Worker 部署
本專案目前只維護 Cloudflare Worker + Static Assets runtime。資料更新後：

1. 重新生成網站與公開 API：

```bash
./scripts/build_site.sh
```

2. 建立 Cloudflare 靜態資產輸出：

```bash
npm run build:cloudflare:assets
```

3. 確認必要 Worker secret 已設定，然後部署：

```bash
npm run cf:secrets:check
npm run cf:deploy
```

4. 部署後驗證：
- `/api/search?dataset=all&q=88&page=1&page_size=5&sort=amount_desc`
- `/api/issues?dataset=all`
- `/api/vision_session`
- `/api/vision_plate` 的 POST-only / token / rate-limit 行為
- 首頁搜尋、期數深連結、相機頁與 `audit.html`
