# 團購訂餐

公司同事共用的團購訂餐小網站。Vite + Vue 3 前端、Cloudflare Worker 後端、D1 資料庫。

## 本機開發

```bash
npm install
npm run db:migrate:local   # 建立本機資料表（第一次）
npm run dev                # http://localhost:5173（前後端一起跑）
```

## 資料庫

- D1 綁定名稱：`DB`（見 `wrangler.jsonc`），資料表定義在 `migrations/`。
- 套用到遠端：`npm run db:migrate:remote`
- 前端不直接碰資料庫，所有讀寫都經過 Worker 的 `/api`（`worker/index.js`）。

## 部署（Cloudflare Workers Builds）

- 組建命令：`npm run build`
- 部署命令：`npx wrangler deploy`
- Cloudflare 專案名稱需與 `wrangler.jsonc` 的 `name`（`group-order`）一致。
