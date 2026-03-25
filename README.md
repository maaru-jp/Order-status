# Order Status Tracker (Google Sheets + Apps Script)

這是一套可直接部署的「訂單進度查詢」範本，支援：

- 顧客輸入訂單編號查詢目前狀態
- 顯示完整歷程時間軸
- 手動更新試算表時自動寫入歷程
- 透過 API 推送或排程拉取，自動更新試算表

---

## 專案檔案

- `index.html`：前端查詢頁
- `OrderStatus.gs`：Apps Script 後端（查詢 API + 自動同步）
- `ORDER_STATUS_SETUP.md`：中文部署與設定說明

---

## 試算表欄位

### `工作表1`

- A：訂單編號
- B：商品內容
- C：出貨狀態
- D：備註
- E：最後更新（自動寫入）

### `歷程`

若不存在會自動建立，欄位如下：

- A：訂單編號
- B：狀態
- C：備註
- D：更新時間
- E：操作人/來源

---

## 部署步驟（Apps Script）

1. 開啟你的 Google 試算表
2. `擴充功能` -> `Apps Script`
3. 建立專案，貼上 `OrderStatus.gs`
4. `部署` -> `新增部署作業` -> `網路應用程式`
5. 執行身分選「你自己」，存取權選「任何知道連結的人」
6. 複製 Web App URL

---

## 前端串接

在 `index.html` 修改：

```js
const API_URL = "你的 Web App URL";
```

---

## 自動寫入方案（2選1或同時使用）

### A. 外部系統推送（推薦）

在 Apps Script `Script properties` 設定：

- `ORDER_SYNC_TOKEN`：你自訂的安全字串

對 Web App URL 發送 `POST` JSON：

```json
{
  "token": "你的 ORDER_SYNC_TOKEN",
  "orders": [
    {
      "orderId": "00055",
      "product": "商品A",
      "status": "🚚 集運中",
      "note": "已入北區物流中心",
      "updated": "2026-03-25T10:30:00+08:00"
    }
  ]
}
```

### B. 排程拉資料

在 `Script properties` 設定：

- `ORDER_FEED_URL`：可回傳 JSON 的來源 API

新增 Apps Script 觸發器：

- 函式：`autoSyncFromFeed`
- 來源：時間驅動
- 頻率：每 5 分鐘（可自行調整）

---

## API 測試

- 健康檢查：`<WebAppURL>?action=test`
- 查詢訂單：`<WebAppURL>?orderId=00055`

---

## 上傳到 GitHub

### 方法 1：GitHub 網頁直接上傳

1. 在 GitHub 建立新 repository（例如 `order-status-tracker`）
2. 點 `Add file` -> `Upload files`
3. 把這個資料夾內檔案上傳
4. Commit

### 方法 2：本機 git 指令

```bash
git init
git add .
git commit -m "Initial order status tracker"
git branch -M main
git remote add origin https://github.com/<your-account>/<repo>.git
git push -u origin main
```

---

## 注意事項

- 不要把真實 token 寫在前端或公開頁面
- `Script properties` 內的 `ORDER_SYNC_TOKEN` 請定期更換
- 如果物流資料量很大，建議把同步頻率調整為 5~15 分鐘
