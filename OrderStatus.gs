// 訂單查詢系統（Google Apps Script）
// 1) 手動更新「工作表1」的出貨狀態/備註時，自動寫入最後更新與歷程
// 2) 前端用 doGet?orderId=00055 查詢單筆訂單與完整歷程

const ORDER_SHEET_NAME = '工作表1';
const STATUS_SHEET_NAME = '狀態';
const HISTORY_SHEET_NAME = '歷程';
const SCRIPT_PROP_SYNC_TOKEN = '-join ((33..126) | Get-Random -Count 48 | ForEach-Object {[char]$_})';
const SCRIPT_PROP_FEED_URL = 'https://docs.google.com/spreadsheets/d/1BLcUU6IpqjYIcyNKb8IjFRoQZgkSnbct0NjkFBKb4vw/edit?usp=sharing';

const COL_ORDER_ID = 1; // A: 訂單編號
const COL_PRODUCT = 2;  // B: 商品內容
const COL_STATUS = 3;   // C: 出貨狀態
const COL_NOTE = 4;     // D: 備註
const COL_UPDATED = 5;  // E: 最後更新

/**
 * 手動編輯觸發：
 * - 當編輯「工作表1」的 C(出貨狀態) 或 D(備註)
 * - 自動更新 E(最後更新)
 * - 並新增一筆至「歷程」
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;

    var range = e.range;
    var sheet = range.getSheet();
    if (!sheet || sheet.getName() !== ORDER_SHEET_NAME) return;

    var row = range.getRow();
    var col = range.getColumn();
    if (row < 2) return; // 跳過標題列
    if (col !== COL_STATUS && col !== COL_NOTE) return;

    var orderId = String(sheet.getRange(row, COL_ORDER_ID).getValue() || '').trim();
    if (!orderId) return;

    var status = String(sheet.getRange(row, COL_STATUS).getValue() || '').trim();
    var note = String(sheet.getRange(row, COL_NOTE).getValue() || '').trim();
    var now = new Date();

    // 寫入最後更新
    sheet.getRange(row, COL_UPDATED).setValue(now);

    // 沒有狀態則不寫歷程
    if (!status) return;

    var ss = sheet.getParent();
    var historySheet = getOrCreateHistorySheet_(ss);
    var operatorEmail = Session.getActiveUser().getEmail() || '';

    // 欄位：訂單編號 / 狀態 / 備註 / 更新時間 / 操作人
    historySheet.appendRow([orderId, status, note, now, operatorEmail]);
  } catch (err) {
    console.error('[onEdit] ' + err);
  }
}

/**
 * 前端查詢 API
 * - 測試：?action=test
 * - 查詢：?orderId=00055
 */
function doGet(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};

    if (String(p.action || '') === 'test') {
      return jsonOutput_({
        ok: true,
        message: 'Order status API is ready',
        sheets: {
          order: ORDER_SHEET_NAME,
          status: STATUS_SHEET_NAME,
          history: HISTORY_SHEET_NAME
        }
      });
    }

    var orderId = String(p.orderId || '').trim();
    var orderKey = normalizeOrderKey_(orderId);
    if (!orderId) {
      return jsonOutput_({ error: 'missing orderId' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var orderSheet = ss.getSheetByName(ORDER_SHEET_NAME);
    if (!orderSheet) return jsonOutput_({ error: '找不到工作表1' });

    var orderData = orderSheet.getDataRange().getValues();
    if (orderData.length < 2) return jsonOutput_({ error: '查無此訂單編號' });

    var foundRow = null;
    for (var i = 1; i < orderData.length; i++) {
      var rowOrderId = String(orderData[i][COL_ORDER_ID - 1] || '').trim();
      if (normalizeOrderKey_(rowOrderId) === orderKey) {
        foundRow = orderData[i];
        break;
      }
    }
    if (!foundRow) return jsonOutput_({ error: '查無此訂單編號' });

    var history = getOrderHistory_(ss, orderId);

    var response = {
      orderId: String(foundRow[COL_ORDER_ID - 1] || '').trim(),
      product: String(foundRow[COL_PRODUCT - 1] || '').trim(),
      status: String(foundRow[COL_STATUS - 1] || '').trim(),
      note: String(foundRow[COL_NOTE - 1] || '').trim(),
      updated: formatDateTime_(foundRow[COL_UPDATED - 1]),
      history: history
    };

    // 若歷程表還沒資料，至少塞一筆當前狀態
    if (response.history.length === 0 && (response.status || response.updated)) {
      response.history = [{
        time: response.updated || '',
        status: response.status || '狀態更新'
      }];
    }

    return jsonOutput_(response);
  } catch (err) {
    console.error('[doGet] ' + err);
    return jsonOutput_({ error: 'internal error' });
  }
}

/**
 * 外部系統推送更新（自動化寫入）
 * POST JSON 範例：
 * {
 *   "token": "your-sync-token",
 *   "orders": [
 *     {"orderId":"00055","status":"🚚 集運中","note":"已入北區物流中心","updated":"2026-03-25T10:30:00+08:00"}
 *   ]
 * }
 */
function doPost(e) {
  try {
    var body = parsePostBody_(e);
    if (!body) return jsonOutput_({ ok: false, error: 'invalid body' });

    var token = String(body.token || '').trim();
    if (!isSyncTokenValid_(token)) {
      return jsonOutput_({ ok: false, error: 'unauthorized' });
    }

    var orders = Array.isArray(body.orders) ? body.orders : [];
    if (orders.length === 0) {
      return jsonOutput_({ ok: false, error: 'orders is empty' });
    }

    var result = upsertOrders_(orders, 'push');
    return jsonOutput_({
      ok: true,
      source: 'push',
      processed: result.processed,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped
    });
  } catch (err) {
    console.error('[doPost] ' + err);
    return jsonOutput_({ ok: false, error: 'internal error' });
  }
}

function getOrderHistory_(ss, orderId) {
  var sheet = ss.getSheetByName(HISTORY_SHEET_NAME);
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var targetKey = normalizeOrderKey_(orderId);
  var list = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var rowOrderId = String(row[0] || '').trim();
    if (normalizeOrderKey_(rowOrderId) !== targetKey) continue;

    list.push({
      status: String(row[1] || '').trim(),
      note: String(row[2] || '').trim(),
      time: formatDateTime_(row[3]),
      operator: String(row[4] || '').trim()
    });
  }

  // 最新在前（前端可直接用）
  list.sort(function(a, b) {
    return parseDateSafe_(b.time) - parseDateSafe_(a.time);
  });

  // 回傳完整歷程資料，前端可自由決定顯示樣式
  return list;
}

function getOrCreateHistorySheet_(ss) {
  var sheet = ss.getSheetByName(HISTORY_SHEET_NAME);
  if (sheet) return sheet;

  sheet = ss.insertSheet(HISTORY_SHEET_NAME);
  sheet.appendRow(['訂單編號', '狀態', '備註', '更新時間', '操作人']);
  return sheet;
}

function formatDateTime_(value) {
  if (!value) return '';

  var tz = Session.getScriptTimeZone() || 'Asia/Taipei';
  var d = value;
  if (!(d instanceof Date)) {
    d = new Date(value);
  }
  if (isNaN(d.getTime())) return String(value);

  return Utilities.formatDate(d, tz, 'yyyy/MM/dd HH:mm:ss');
}

function parseDateSafe_(dateText) {
  if (!dateText) return 0;
  var d = new Date(dateText);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 定時拉取來源資料（配合「時間驅動觸發器」）
 * - 請先於 Script Properties 設定 ORDER_FEED_URL
 * - 來源可回傳：{"orders":[...]} 或 [...]
 */
function autoSyncFromFeed() {
  var props = PropertiesService.getScriptProperties();
  var feedUrl = String(props.getProperty(SCRIPT_PROP_FEED_URL) || '').trim();
  if (!feedUrl) throw new Error('missing ORDER_FEED_URL in Script Properties');

  var response = UrlFetchApp.fetch(feedUrl, { muteHttpExceptions: true });
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('feed http error: ' + code);
  }

  var payload = JSON.parse(response.getContentText() || '{}');
  var orders = Array.isArray(payload) ? payload : (Array.isArray(payload.orders) ? payload.orders : []);
  if (orders.length === 0) return { ok: true, source: 'feed', processed: 0 };

  var result = upsertOrders_(orders, 'feed');
  return {
    ok: true,
    source: 'feed',
    processed: result.processed,
    inserted: result.inserted,
    updated: result.updated,
    skipped: result.skipped
  };
}

function upsertOrders_(orders, source) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var orderSheet = ss.getSheetByName(ORDER_SHEET_NAME);
  if (!orderSheet) throw new Error('找不到工作表1');

  var historySheet = getOrCreateHistorySheet_(ss);
  var map = buildOrderRowIndex_(orderSheet);
  var now = new Date();
  var inserted = 0;
  var updated = 0;
  var skipped = 0;

  orders.forEach(function(raw) {
    var orderId = normalizeOrderId_(raw.orderId || raw.order_no || raw.id);
    var orderKey = normalizeOrderKey_(orderId);
    if (!orderId) {
      skipped++;
      return;
    }

    var product = String(raw.product || raw.productName || '').trim();
    var status = String(raw.status || '').trim();
    var note = String(raw.note || raw.remark || '').trim();
    var updatedAt = toDateOrNow_(raw.updated || raw.updatedAt || raw.time, now);

    if (map[orderKey]) {
      var row = map[orderKey];
      var oldStatus = String(orderSheet.getRange(row, COL_STATUS).getValue() || '').trim();
      var oldNote = String(orderSheet.getRange(row, COL_NOTE).getValue() || '').trim();
      var changed = false;

      if (product) orderSheet.getRange(row, COL_PRODUCT).setValue(product);
      if (status && status !== oldStatus) {
        orderSheet.getRange(row, COL_STATUS).setValue(status);
        changed = true;
      }
      if (note !== oldNote) {
        orderSheet.getRange(row, COL_NOTE).setValue(note);
        changed = true;
      }
      orderSheet.getRange(row, COL_UPDATED).setValue(updatedAt);

      if (changed && status) {
        historySheet.appendRow([orderId, status, note, updatedAt, source || 'system']);
      }
      updated++;
      return;
    }

    orderSheet.appendRow([orderId, product, status, note, updatedAt]);
    if (status) {
      historySheet.appendRow([orderId, status, note, updatedAt, source || 'system']);
    }
    inserted++;
  });

  return {
    processed: orders.length,
    inserted: inserted,
    updated: updated,
    skipped: skipped
  };
}

function buildOrderRowIndex_(sheet) {
  var values = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < values.length; i++) {
    var orderId = normalizeOrderId_(values[i][COL_ORDER_ID - 1]);
    var orderKey = normalizeOrderKey_(orderId);
    if (!orderKey) continue;
    map[orderKey] = i + 1;
  }
  return map;
}

function normalizeOrderId_(value) {
  var v = String(value || '').trim();
  return v;
}

/**
 * 用於比對的訂單鍵：
 * - 純數字編號會移除前導 0（00055 與 55 視為同一單）
 * - 其他字串維持原樣去空白
 */
function normalizeOrderKey_(value) {
  var raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d+$/.test(raw)) {
    var n = parseInt(raw, 10);
    return isNaN(n) ? raw : String(n);
  }
  return raw;
}

function toDateOrNow_(value, fallbackNow) {
  if (!value) return fallbackNow || new Date();
  var d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? (fallbackNow || new Date()) : d;
}

function parsePostBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  var text = e.postData.contents;
  if (!text) return null;
  return JSON.parse(text);
}

function isSyncTokenValid_(token) {
  var expected = String(PropertiesService.getScriptProperties().getProperty(SCRIPT_PROP_SYNC_TOKEN) || '').trim();
  return !!expected && token === expected;
}
