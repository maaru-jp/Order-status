/**
 * 試算表綁定腳本（貼在「訂單進度試算表」的 Apps Script，不是函式庫專案）
 *
 * 資料來源試算表：MAARU 日本萌物GO訂單進度資料表
 * https://docs.google.com/spreadsheets/d/1BLcUU6IpqjYIcyNKb8IjFRoQZgkSnbct0NjkFBKb4vw/edit
 *
 * 設定步驟：
 * 1. 左側「+」新增指令碼檔，貼上本檔
 * 2. 左側「程式庫」→ 新增程式庫
 *    Script ID：12zRuG_AbPZl9OO8ArWLm8EAu1UXxhoTwHrJSxU965dAEuFlGTgcS-nEc
 *    識別碼：MaaruOrderStatus（須與下方呼叫名稱一致）
 *    版本：選最新（目前 15 以上，需含 order_status）
 * 3. 部署 → 新增部署 → 網頁應用程式 → 執行身分：我 → 存取：任何人 → 部署
 * 4. 網頁應用程式 URL（已綁定 index.html）：
 *    https://script.google.com/macros/s/AKfycby69CThnF5mE-ILJGhHr0iSCkBaqJKjY8tCpF69BNlW6FohHXXbMrTYvh9j4nj9jATJ/exec
 *
 * 函式庫專案需先更新 OrderStatus.gs 並「部署 → 新增部署 → 函式庫」遞增版本號。
 */

function doGet(e) {
  return MaaruOrderStatus.handleDoGet_(e);
}

function onEdit(e) {
  MaaruOrderStatus.handleOnEdit_(e);
}

/** 在編輯器執行此函式可測試讀取試算表（例：testLookupOrder_('00083')） */
function testLookupOrder_(orderId) {
  var result = MaaruOrderStatus.lookupOrderById_(orderId || "00083");
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
