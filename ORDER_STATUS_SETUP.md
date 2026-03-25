# 訂單狀態追蹤（可直接上 GitHub）

這份專案提供「手動更新 Google 試算表 -> 自動寫入歷程 -> 前端可查詢時間軸」的最小可用版本。

## 你需要的檔案

- `index.html`：前端查詢頁（顧客輸入訂單編號查詢）
- `OrderStatus.gs`：Google Apps Script（自動寫歷程 + 查詢 API）

## 試算表欄位規格

### 工作表1

- A: 訂單編號
- B: 商品內容
- C: 出貨狀態
- D: 備註
- E: 最後更新（由腳本自動寫入）

### 狀態

- A: 狀態字典（例如：`🛒 已採購`、`🚚 集運中`、`📦 待出荷`、`📦 已出貨`、`✈️ 已抵台`）

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

## 觸發規則

- 你在 `工作表1` 編輯 C（出貨狀態）或 D（備註）時：
  - 自動更新 E（最後更新）
  - 自動新增一筆到 `歷程`

## GitHub 上傳建議

建議 repo 至少包含：

- `index.html`
- `OrderStatus.gs`
- `ORDER_STATUS_SETUP.md`

上傳後即可作為你自己的部署備份與交接文件。
