# 香港自訂車牌拍賣結果搜尋

這個網站會自動從運輸署拍賣頁抓取所有歷史拍賣結果 PDF，解析成可搜尋資料，並提供每筆結果的原始 PDF 連結。

## 網站目錄（TOC）

- 首頁（搜尋）: https://plate.hk/
- 條款: https://plate.hk/terms.html
- 私隱政策: https://plate.hk/privacy.html
- 更新日誌: https://plate.hk/changelog.html
- 資料審核: https://plate.hk/audit.html
- API 文檔: https://plate.hk/api.html

## 功能

- 搜尋車牌（可匹配單行及雙行排列）
- 顯示拍賣日期、上午/下午場次、成交金額
- 每筆結果可直接打開原始 PDF 驗證

## 安裝與更新資料

```bash
python3 -m pip install --user -r requirements.txt
./scripts/build_site.sh
```

執行後會生成：

- `data/results.json`：所有可搜尋結果
- `data/results.slim.json`：前端載入用精簡結果（建議部署時使用）
- `data/issues.manifest.json`：分片索引（前端分期載入入口）
- `data/preset.amount_desc.top1000.json`：首頁預設（金額高至低）快速顯示資料
- `data/issues/*.json`：按拍賣期數分片的結果檔
- `data/auctions.json`：每份 PDF 的解析統計與錯誤資訊
- `data/pdfs/*.pdf`：已下載的來源 PDF

TVRM（傳統車牌）資料集會額外生成：

- `data/tvrm_physical/issues.manifest.json` / `data/tvrm_physical/issues/*.json`
- `data/tvrm_physical/preset.amount_desc.top1000.json`
- `data/tvrm_physical/auctions.json`
- `data/tvrm_eauction/issues.manifest.json` / `data/tvrm_eauction/issues/*.json`
- `data/tvrm_eauction/preset.amount_desc.top1000.json`
- `data/tvrm_eauction/auctions.json`
- `data/tvrm_legacy/issues.manifest.json` / `data/tvrm_legacy/issues/*.json`
- `data/tvrm_legacy/preset.amount_desc.top1000.json`
- `data/tvrm_legacy/auctions.json`
- `data/all.search.meta.json`
- `data/all.prefix1.top200.json`
- `data/hot_search/manifest.json`
- `data/hot_search/all_amount_desc/*.json`
- `data/all.tvrm_legacy_overlap.json`
- `data/popular_plates_manifest.json`
- `plates/index.html`
- `plates/*.html`

`data/tvrm_legacy/` 現在只保留 `1973-2006` 年份區段資料：
- `data/TVRM auction result (1973-2026).xls`：作為 `1973-2006` 歷史區段來源
- `data/TVRM auction result (2006-2026).xlsx`：其中 `2007+` 的逐筆正式拍賣日期會合併到 `data/tvrm_physical/` / `data/tvrm_eauction/` 的日期分期

因此 `tvrm_legacy` 現在固定只有：
- `date_precision = "year_range"`：顯示時應使用 `auction_date_label`

`data/all.prefix1.top200.json` 是 `全部車牌` 單字查詢的輕量預覽索引。  
`data/hot_search/` 則是熱門查詢的預熱快取，讓像 `88`、`8888`、`HK` 這類高頻搜尋在第一個冷請求時也能直接命中靜態結果；其餘查詢則回落到伺服器端搜尋 API。
`data/all.tvrm_legacy_overlap.json` 則會標記 `1973-2006` 歷史年份分段和其他 TVRM 資料集的重複結果，供前端聚合視圖去重。
`plates/` 則是熱門車牌的靜態 SEO 落地頁，讓搜尋引擎可以直接索引高價 / 熱門車牌的結果頁。

## 本機啟動網站

```bash
./scripts/run_local.sh 8080
```

然後打開：

- [http://127.0.0.1:8080](http://127.0.0.1:8080)

停止本機站：

```bash
./scripts/stop_local.sh 8080
```

## 建置、檢查、打包

完整重建資料：

```bash
./scripts/build_site.sh
```

執行語法檢查與回歸測試：

```bash
./scripts/check_site.sh
```

執行安全檢查（tracked secrets scan；如本機有 `pip-audit` 也會一併跑依賴漏洞審核）：

```bash
./scripts/check_security.sh
```

產生 deploy 壓縮包：

```bash
./scripts/package_release.sh
```

快速驗證打包內容（不做完整大檔 deploy 包）：

```bash
./scripts/package_release.sh --smoke
```

發版前快速檢查：

```bash
./scripts/release_ready.sh
```

只做語法檢查與 smoke package：

```bash
./scripts/release_ready.sh --fast
```

## Cloudflare Workers 部署

專案現在已可用 Cloudflare Workers 直接提供前端與 `/api/*`，不再需要 DreamHost PHP/MySQL 參與網站 runtime：

- Worker 入口：`cloudflare-worker/src/index.mjs`
- API 路由：`cloudflare-worker/src/api.mjs`
- Worker 共用工具：`cloudflare-worker/src/lib.mjs`
- Wrangler 配置：`wrangler.jsonc`
- Cloudflare 靜態發布目錄建置：`scripts/build_cloudflare_public.py`
- Claude Code handover：`CLOUDFLARE_WORKERS_HANDOVER.md`

建置 Cloudflare 靜態發布目錄：

```bash
python3 scripts/build_cloudflare_public.py
```

或使用 npm script：

```bash
npm run build:cloudflare:assets
```

目前的雲端架構是：
- Workers Static Assets 負責前端與 `api/v1` 靜態資料
- Worker 直接處理 `/api/*`
- 搜尋、期數、聚合與歷史資料由靜態 JSON / chunk 檔驅動
- OpenAI Vision 由 Worker 伺服器端呼叫

## 注意

- 運輸署部分早期 PDF 字型編碼特殊，個別金額可能無法完全自動解析，頁面會標示「未能自動解析」，請點擊該筆原始 PDF 進一步核對。

## 未來更新流程

每次有新拍賣資料時，固定執行以下步驟：

1. `python3 scripts/build_dataset.py`
2. `python3 scripts/build_tvrm_dataset.py`
3. `python3 scripts/merge_tvrm_exact_workbook.py`
4. `python3 scripts/build_tvrm_legacy_dataset.py`
5. `python3 scripts/build_all_search_index.py`
6. `python3 scripts/build_hot_search_cache.py`
7. `python3 scripts/build_popular_plate_pages.py`
8. `python3 scripts/verify_data_integrity.py`
9. 如有功能/UI/資料策略更新，同步更新 `changelog.html`（中英文）
10. 部署 `data/`、`plates/`、`api/v1/`、`index.html`、`camera.html`、`landing.html`、`api.html`、`audit.html`、`sw.js`、`terms.html`、`privacy.html`、`changelog.html`、`sitemap.xml`
11. 發布後做一次硬刷新，確保新 Service Worker 與快取規則生效

## 安全維運

- 目前 threat model 與主要防護邊界整理在 [SECURITY.md](SECURITY.md)
- `scripts/scan_repo_secrets.py` 會掃描 git tracked 檔案中的常見憑證模式，避免把 secrets 提交進版控
- `.github/workflows/security.yml` 會在 PR / push 時跑 tracked secrets scan、`pip-audit` 與站點檢查
- 本機若未安裝 `pip-audit`，`./scripts/check_security.sh` 會略過依賴漏洞審核；CI 仍會強制執行
