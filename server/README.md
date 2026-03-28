# Server-Side Search API (MySQL, Shared Hosting Friendly)

目標：把「搜尋」從前端掃描 JSON 分片改為伺服器端查詢，避免用戶打開網站要載入大量資料才能開始搜尋，也讓 API/MCP 存取更高效。

## 架構
- MySQL：存放拍賣期數 metadata + 每筆成交結果
- PHP（shared host）：提供 `/api/search`、`/api/issues` 等端點（見 `api/*.php`）
- 前端：有後端可用時，搜尋走 API；沒有時保持原本靜態 JSON 分片 fallback

## MySQL
1. 建資料庫（例：`vrm`）
2. 套用 schema：
```sql
SOURCE server/schema.sql;
```

## 匯入資料（shared host）
shared host 通常提供 phpMyAdmin。建議用本機生成 SQL dump 後在 phpMyAdmin 匯入：
- `server/schema.sql` 建表
- `server/dump.sql` 匯入資料（由本機腳本生成，見 `scripts/export_mysql_dump.py`）
