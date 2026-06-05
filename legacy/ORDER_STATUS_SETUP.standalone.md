# 訂單狀態追蹤（可直接上 GitHub）

這份專案提供「手動更新 Google 試算表 -> 自動寫入歷程 -> 前端可查詢時間軸」的最小可用版本。

另外已支援兩種「免手動改表」自動化：
- 外部系統主動推送到 Apps Script（`doPost`）
- Apps Script 定時向來源 API 拉資料（`autoSyncFromFeed`）

## 你需要的檔案

- `index.html`：前端查詢頁（顧客輸入訂單編號查詢）
- `OrderStatus.gs`：Google Apps Script（自動寫歷程 + 查詢 API）

## 試算表欄位規格

### 工作表1（建議）

在「商品內容」右邊插入一欄 **商品圖**：

- A: 訂單編號
- B: 商品內容
- C: 商品圖（Cloudinary URL）
- D: 商品狀態（逐項：已出貨 / 待出貨，可選）
- E: 出貨狀態（整單）
- F: 備註
- G: 最後更新（由腳本自動寫入）

多商品時，B / C / D 欄可用換行或 `；` 對應多筆（第 1 行商品對第 1 行圖片與狀態）。

商品狀態建議填法：
- `已出貨`（或：已寄出、已到貨）
- `待出貨`（或：待到貨、未到貨、已採購、集運中）

### 狀態

- A: 狀態字典（例如：`🛒 已採購`、`🚚 集運中`、`📦 待出荷`、`📦 已出貨`、`✈️ 已抵台`）

### 商品圖工作表（選用備援）

若不想每筆訂單都貼圖，可保留獨立工作表 `商品圖`：

- A: 商品關鍵字
- B: 圖片網址（Cloudinary URL）

程式會優先讀工作表1 的 C 欄，找不到才用 `商品圖` 工作表對照。

### 歷程

若不存在會由腳本自動建立，欄位如下：

- A: 訂單編號
- B: 狀態
- C: 備註
- D: 更新時間
- E: 操作人

## 部署步驟（Apps Script）

1. 開啟你的 Google 試算表 -> `擴充功能` -> `Apps Script`
2. 建立新專案，貼上 `OrderStatus.gs`
3. 儲存後，點 `部署` -> `新增部署作業` -> 類型選 `網路應用程式`
4. 執行身分：`你自己`
5. 存取權：`任何知道連結的人`
6. 部署後複製 Web App URL

## 前端串接

在 `index.html` 將 `API_URL` 改成你的 Web App URL：

```js
const API_URL = "你的 Web App URL";
```

## 測試

- API 健康檢查：
  - `你的WebAppURL?action=test`
- 查詢訂單：
  - `你的WebAppURL?orderId=00055`

## 自動寫入（不用手動更新）

### 方式 A：外部系統推送（推薦）

1. 在 Apps Script -> `專案設定` -> `Script properties` 新增：
   - `ORDER_SYNC_TOKEN`：自訂一段長字串（當作驗證金鑰）
2. 你的訂單系統在狀態變更時，對 Web App URL 發送 `POST`：

```json
{
  "token": "你的 ORDER_SYNC_TOKEN",
  "orders": [
    {
      "orderId": "00055",
      "product": "三麗鷗港版奶瓶系列吊飾娃",
      "status": "🚚 集運中",
      "note": "已入北區物流中心",
      "updated": "2026-03-25T10:30:00+08:00"
    }
  ]
}
```

3. 成功後會自動：
   - 新增或更新 `工作表1` 該筆訂單
   - 寫入 `最後更新`
   - 狀態/備註有變動時，新增一筆 `歷程`

### 方式 B：定時拉資料（排程）

1. 在 Script properties 新增：
   - `ORDER_FEED_URL`：來源 API（回傳 `{"orders":[...]}` 或 `[...]`）
2. Apps Script -> `觸發條件` -> 新增觸發器：
   - 函式：`autoSyncFromFeed`
   - 事件來源：時間驅動
   - 週期：每 5 分鐘（或你要的頻率）
3. 觸發後會自動同步進試算表與歷程。

## 觸發規則

- 你在 `工作表1` 編輯 C（出貨狀態）或 D（備註）時：
  - 自動更新 E（最後更新）
  - 自動新增一筆到 `歷程`

- 若用 `doPost` 或 `autoSyncFromFeed`：
  - 系統自動新增/更新 `工作表1`
  - 狀態或備註有變化才寫新歷程，避免重複灌水

## GitHub 上傳建議

建議 repo 至少包含：

- `index.html`
- `OrderStatus.gs`
- `ORDER_STATUS_SETUP.md`

上傳後即可作為你自己的部署備份與交接文件。
