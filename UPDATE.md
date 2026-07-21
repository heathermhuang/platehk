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

## 雲端自動更新（GitHub Actions）

`.github/workflows/auto-update.yml` 會每日 `00:40 UTC`（香港時間 `08:40`）在 GitHub Actions 執行，不需要本機長開：

1. 安裝 Python / Node 依賴
2. 執行 `scripts/cron_update.sh`
3. 執行 `scripts/check_site.sh`
4. 比對 `https://plate.hk/data/events.json` 及 `https://plate.hk/api/v1/index.json`
5. 如有資料變更，提交並 push 生成檔案
6. 如有資料變更或 production drift，部署 Cloudflare Worker + Static Assets
7. 部署後再次執行 production freshness check

GitHub repository secrets:
- `CLOUDFLARE_API_TOKEN`：必需；token 需要有部署 Worker / Static Assets 的權限
- `CLOUDFLARE_ACCOUNT_ID`：可選；如 Wrangler 不能自動推斷帳戶才需要設定

GitHub Actions repository setting 需要允許 workflow token 有 read/write contents 權限，否則自動提交資料更新時會被 GitHub 拒絕。

每日 `Auto Update Data` 和 deterministic `Auto Heal Data` 都不使用 LLM，也不需要 OpenAI key。網站 camera API 使用的 `OPENAI_API_KEY` 仍然只應設定為 Cloudflare Worker secret。手動部署可用 `npm run cf:secrets:check` 確認 Worker secret 存在；日常 GitHub Actions 更新只使用 `CLOUDFLARE_API_TOKEN` 執行 `npm run cf:deploy:ci`，避免每日自動更新被 `wrangler secret list` 的輸出格式或登入狀態阻塞。

可在 GitHub Actions 手動執行 `Auto Update Data`，並選擇 `incremental` 或 `full` mode。

## 自動修復（Auto Heal）

`.github/workflows/auto-heal.yml` 是 `Auto Update Data` 的保護層，不是另一個每日更新器。正常情況仍然由 `Auto Update Data` 每日更新；`Auto Heal Data` 只在以下情況介入：

- `Auto Update Data` 失敗
- 每日 10:15 HKT 的 production freshness audit 發現 live JSON 與 `main` 生成輸出不一致
- 維護者手動 dispatch repair mode

手動演練 deterministic repair 時，使用 `dry_run=true`。Dry run 會執行 repair command、`scripts/check_site.sh`、staged-diff 檢查及 evidence artifact，但不會 commit、push 或部署。

修復決策由 `scripts/auto_heal_update.py` 讀取 `.github/autoheal/rules.json` 產生 `logs/autoheal/plan.json`：

```bash
python scripts/auto_heal_update.py classify \
  --log-file logs/autoheal/failed.log \
  --freshness-json logs/autoheal/freshness.json \
  --output logs/autoheal/plan.json
```

目前自動修復只允許 deterministic actions：

- `run_events_repair`：只有 `data/events.json` drift 時，跑 `scripts/build_events.py` 加上公開 API / audit 重建
- `run_incremental_update`：生成輸出或 `api/v1/index.json` drift 時，跑 `MODE=incremental bash scripts/cron_update.sh`
- `run_full_update`：TVRM issue count 縮水等歷史資料保護觸發時，跑 `MODE=full bash scripts/cron_update.sh`
- `retry_auto_update`：網絡、上游暫時錯誤或 runner 環境錯誤時，重試 deterministic updater

以下情況不會自動改 code 或部署：

- Cloudflare / GitHub secrets、權限、token 缺失：`alert_human`
- shell syntax、parser traceback、TD source shape 未分類變更：`escalate_llm_repair`

當 classification 是 `alert_human` 或 `escalate_llm_repair`，workflow 會建立或更新 GitHub Issue，並上傳 `autoheal-evidence-<run_id>` artifact，內容包含 failed log、freshness JSON、repair plan 及 issue metadata。

### Cloud LLM repair

`.github/workflows/cloud-llm-repair.yml` 只會在 `Auto Heal Data` 失敗後讀取 evidence artifact；只有 plan 同時是 `status=escalate` 及 `action=escalate_llm_repair` 才會在 GitHub-hosted runner 啟動 `openai/codex-action@v1`。一般成功、production drift、可重試網絡錯誤及 credentials/permissions blocker 都不會啟動 LLM。

Cloud LLM 權限分成三個 jobs：

1. `generate_patch` 只有 repository read permission，在 `drop-sudo` + workspace permission profile 下生成 patch artifact
2. `validate_patch` 不取得 OpenAI key，套用 patch 後執行 secret scan 及完整 `scripts/check_site.sh`
3. `open_draft_pr` 只在 validation 成功後取得 repository write permission，建立 `codex/autoheal-*` branch 和 draft PR；不會 auto-merge

Cloud LLM 使用 `gpt-5.6-sol`，並需要以下 GitHub Actions repository secrets：

- `OPENAI_API_KEY`：custom provider 的 API key；請使用獨立、受限及有 budget cap 的 key
- `OPENAI_RESPONSES_API_ENDPOINT`：完整 HTTPS Responses API endpoint，例如 provider 給你的 base URL 是 `https://llm.example.com/v1`，這裡應填 `https://llm.example.com/v1/responses`

Custom provider 必須真正支援 OpenAI-compatible Responses API 及 `gpt-5.6-sol` model slug；只有 `/chat/completions` 的 provider 不能用於這個 workflow。這兩個 secrets 只供 failure-triggered `Cloud LLM Repair` 使用，不會供每日 updater 使用，也不要重用 Cloudflare Worker 的 production key。

本機 credential template 是 `.private/platehk-ops.env`。`.private/` 已被 Git ignore；不要把內容貼入 chat。填寫後執行：

```bash
chmod 600 .private/platehk-ops.env
python3 scripts/configure_github_ops_secrets.py
```

installer 不會在 command line 或輸出顯示 secret value；它只會把已填的欄位透過 `gh secret set` 的 stdin 寫入 `heathermhuang/platehk`。可以分兩次執行：第一次設定 OpenAI endpoint/key 與 replacement Telegram token；完成 Telegram chat discovery 後填入 chat ID，再執行一次。

Workflow push 到 GitHub 後，可在 Actions 手動執行 `Cloud LLM Repair`。手動 dispatch 只會啟動 `Test custom LLM connection`：使用 read-only permission profile 呼叫一次 `gpt-5.6-sol`，不會讀取 failure evidence、修改 repository、開 PR 或部署。日常自動路徑仍然只會在 Auto Heal 明確產生 `escalate_llm_repair` 後使用 LLM。

LLM 只應在 `escalate_llm_repair` 後作為 PR 修復助手使用：根據失敗 logs、fixture 和相關 parser code 建 draft PR，並附 regression test。不要讓 LLM 直接每日更新資料、直接 push parser patch 到 `main`、auto-merge，或繞過 `scripts/check_site.sh` / production freshness check。

### Telegram issue notifications

Auto-heal repair issue、cloud LLM draft PR 結果，以及之後的人手 issue/comment activity 可以送到 Telegram。設定以下 GitHub Actions repository secrets：

- `TELEGRAM_BOT_TOKEN`：由 BotFather 建立的 bot token
- `TELEGRAM_CHAT_ID`：接收通知的 private chat、group 或 channel ID
- `TELEGRAM_MESSAGE_THREAD_ID`：可選；forum group 的 topic ID

不要把 bot token 貼入 issue、chat、workflow input 或 logs。如果 token 曾經顯示在這些地方，先在 BotFather revoke/regenerate，然後把 replacement token 直接寫入 GitHub secret。

初次設定次序：

1. 先在 `.private/platehk-ops.env` 填入 replacement `TELEGRAM_BOT_TOKEN`，再執行 `python3 scripts/configure_github_ops_secrets.py`
2. 在目標 private chat 對 bot 送出 `/start`，或在目標 group 送出一個 bot 可見訊息
3. 手動執行 `Auto-heal Issue Telegram`，選擇 `discover`；在 workflow summary 複製正確 chat ID
4. 把該 ID 寫入本機 template 的 `TELEGRAM_CHAT_ID`；如有需要再加 `TELEGRAM_MESSAGE_THREAD_ID`，然後重新執行 installer
5. 再手動執行同一 workflow，選擇 `test` 驗證送達

`.github/workflows/auto-heal.yml` 直接送出首次 repair issue 通知，因為 `GITHUB_TOKEN` 建立的 issue 不會再觸發另一個 workflow；`.github/workflows/issue-telegram.yml` 負責之後由人手產生的 issue/comment activity；Cloud LLM workflow 會直接通知 draft PR 成功或失敗。Telegram 目前是 notification + GitHub deep-link，不接受 privileged repair/deploy commands。

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

GitHub Actions 使用較窄的 CI 部署命令，避免自動更新因 secret-list 查詢逾時而卡住：

```bash
npm run cf:deploy:ci
```

4. 部署後驗證：
- `/api/search?dataset=all&q=88&page=1&page_size=5&sort=amount_desc`
- `/api/issues?dataset=all`
- `/api/vision_session`
- `/api/vision_plate` 的 POST-only / token / rate-limit 行為
- 首頁搜尋、期數深連結、相機頁與 `audit.html`
