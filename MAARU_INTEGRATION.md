# MAARU 訂單查詢整合說明（Phase 1～3）

本 repo（`Order-status-main`）為 **GitHub Pages 前端**：  
https://maaru-jp.github.io/Order-status/

後端 API 已併入 **ProductManagement2** 專案的 `Code.gs`（同一試算表、同一部署 URL）。

---

## 專案分工

| 專案 | 路徑 | 內容 |
|------|------|------|
| **Order-status-main**（本 repo） | 桌面 `Order-status-main` | `index.html`、GitHub Pages 部署 |
| **ProductManagement2-main** | 桌面 `ProductManagement2-main` | `Code.gs`、後台 `admin.html`、官網 |

---

## 統一 API URL

前端 `index.html` 內：

```js
const API_URL = "https://script.google.com/macros/s/AKfycbyyFnwQVNVamiWRD23U4TOIKnR_iHqfO3ObFmFl_lfqepR8tvFgvWvm5YBqxuFWZiaBfw/exec";
```

| action | 用途 |
|--------|------|
| `order_status` | 訂單編號查配送進度（5 碼或 ORD00001） |
| `customer_orders` | 13 碼會員卡號查歷史訂單 |
| `points_balance` | 紅利點數（官網 `/points` 使用） |

相容舊連結：`?orderId=00001`（無 action）等同 `order_status`。

**API 實作位置**：`ProductManagement2-main/Code.gs`  
（`getOrderStatusPublic_`、`getCustomerOrdersPublic_` 等）

---

## Phase 1（已完成）

- 雙 Tab：訂單編號｜會員卡號
- 卡號列表點擊 → 跳轉該筆配送進度
- URL：`?mode=card`、`?orderId=00001`
- 與官網共用 `localStorage` key：`maarushop_member_card_v1`

---

## Phase 2（已完成）

- 不再使用舊獨立 GAS（`AKfycby69...`）
- 訂單進度與卡號查詢皆走主 `Code.gs`
- 試算表「訂單」工作表可選欄位：**配送歷程**、**更新時間**

配送歷程填法範例：

```
2026-03-01：訂單成立
2026-03-10：集運中
2026-03-20：已抵台
```

或 JSON：`[{"time":"2026-03-10","status":"集運中","note":""}]`

---

## Phase 3（已完成）

- 官網 Header「訂單查詢」改為外連本頁（`https://maaru-jp.github.io/Order-status/`）
- 官網 `#/orders` 自動 redirect 至本頁（帶 `?mode=card`，若有記憶卡號則附 `card=`）
- 官網 `#/points` 維持原紅利查詢頁
- 後台文案改為「訂單查詢中心」單一連結

---

## 部署 checklist

### 1. 後端（ProductManagement2）— 必做

1. 開啟試算表 → **擴充功能 → Apps Script**，確認 `Code.gs` 含 `order_status`（約第 45 行 `if (action === "order_status")`）
2. **部署 → 管理部署 → 編輯 → 版本選「新版本」→ 部署**（只儲存不會更新線上 URL）
3. 驗證（兩個網址都要過）：  
   - `你的GAS_URL?action=api_meta` → 應有 `"apiVersion":"2026-06-04"`  
   - `你的GAS_URL?action=customer_orders&orderId=00001` → 應有 `orderId`，**不可**有 `products`  
   詳細圖文見 ProductManagement2 專案 **`GAS訂單進度修復.md`**
4. 後台同步訂單至試算表、補齊會員卡號

### 2. 前端（本 repo）

1. 確認 `index.html` 為最新版
2. Logo `S__283426825.jpg` 與 `index.html` 同目錄
3. push 至 `maaru-jp/Order-status` → GitHub Pages 自動部署

---

## 本 repo 檔案

| 檔案 | 說明 |
|------|------|
| `index.html` | 訂單查詢中心（Phase 1+2） |
| `index-remote-backup.html` | 整合前遠端備份 |
| `legacy/OrderStatus.standalone.gs` | 舊獨立試算表版 GAS（已停用，僅供參考） |
| `legacy/ORDER_STATUS_SETUP.standalone.md` | 舊 standalone 部署說明 |
