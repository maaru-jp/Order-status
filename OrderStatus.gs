// 訂單查詢系統（Google Apps Script）
// 1) 手動更新「工作表1」的出貨狀態/備註時，自動寫入最後更新與歷程
// 2) 前端用 doGet?orderId=00055 查詢單筆訂單與完整歷程

const ORDER_SHEET_NAME = '工作表1';
const STATUS_SHEET_NAME = '狀態';
const HISTORY_SHEET_NAME = '歷程';
const PRODUCT_IMAGE_SHEET_NAME = '商品圖';
const SCRIPT_PROP_SYNC_TOKEN = 'ORDER_SYNC_TOKEN';
const SCRIPT_PROP_FEED_URL = 'ORDER_FEED_URL';

// 預設欄位（建議在 B 商品內容右側插入 C 商品圖）
const COL_ORDER_ID = 1; // A: 訂單編號
const COL_PRODUCT = 2;  // B: 商品內容
const COL_PRODUCT_IMAGE = 3; // C: 商品圖（Cloudinary 網址，可選）
const COL_PRODUCT_ITEM_STATUS = 4; // D: 商品狀態（逐項，可選）
const COL_STATUS = 5;   // E: 出貨狀態（整單）
const COL_NOTE = 6;     // F: 備註
const COL_UPDATED = 7;  // G: 最後更新

/**
 * 手動編輯觸發：
 * - 當編輯「工作表1」的出貨狀態或備註欄
 * - 自動更新最後更新欄
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
    var cols = getOrderSheetColumns_(sheet);
    if (col !== cols.status && col !== cols.note) return;

    var orderId = String(sheet.getRange(row, cols.orderId).getValue() || '').trim();
    if (!orderId) return;

    var status = String(sheet.getRange(row, cols.status).getValue() || '').trim();
    var note = String(sheet.getRange(row, cols.note).getValue() || '').trim();
    var now = new Date();

    // 寫入最後更新
    sheet.getRange(row, cols.updated).setValue(now);

    // 沒有狀態則不寫歷程
    if (!status) return;

    var ss = sheet.getParent();
    var historySheet = getOrCreateHistorySheet_(ss);
    // 欄位：訂單編號 / 狀態 / 備註 / 更新時間 / 操作人（不記錄信箱）
    historySheet.appendRow([orderId, status, note, now, '系統']);
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
          history: HISTORY_SHEET_NAME,
          productImages: PRODUCT_IMAGE_SHEET_NAME
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

    var cols = getOrderSheetColumns_(orderSheet);
    var orderData = orderSheet.getDataRange().getValues();
    if (orderData.length < 2) return jsonOutput_({ error: '查無此訂單編號' });

    var foundRow = null;
    for (var i = 1; i < orderData.length; i++) {
      var rowOrderId = String(orderData[i][cols.orderId - 1] || '').trim();
      if (normalizeOrderKey_(rowOrderId) === orderKey) {
        foundRow = orderData[i];
        break;
      }
    }
    if (!foundRow) return jsonOutput_({ error: '查無此訂單編號' });

    var history = getOrderHistory_(ss, orderId);
    var product = String(foundRow[cols.product - 1] || '').trim();
    var productImages = cols.productImage
      ? String(foundRow[cols.productImage - 1] || '').trim()
      : '';
    var productItemStatus = cols.productItemStatus
      ? String(foundRow[cols.productItemStatus - 1] || '').trim()
      : '';
    var orderStatus = String(foundRow[cols.status - 1] || '').trim();
    var items = buildProductItems_(ss, product, productImages, productItemStatus, orderStatus);

    var response = {
      orderId: String(foundRow[cols.orderId - 1] || '').trim(),
      product: product,
      items: items,
      itemSummary: buildItemSummary_(items),
      status: orderStatus,
      note: sanitizeCustomerNote_(String(foundRow[cols.note - 1] || '').trim()),
      updated: formatDateTime_(foundRow[cols.updated - 1]),
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

    list.push(sanitizeHistoryItem_({
      status: String(row[1] || '').trim(),
      note: String(row[2] || '').trim(),
      time: formatDateTime_(row[3])
    }));
  }

  // 最新在前（前端可直接用）
  list.sort(function(a, b) {
    return parseDateSafe_(b.time) - parseDateSafe_(a.time);
  });

  return list;
}

function sanitizeHistoryItem_(item) {
  var status = String(item.status || '').trim();
  var note = String(item.note || '').trim();
  var time = String(item.time || '').trim();

  // 若狀態欄誤貼圖片網址，改以備註欄文字當狀態顯示
  if (isUrlLike_(status) && note && !isUrlLike_(note)) {
    status = note;
    note = '';
  }

  if (isUrlLike_(status)) status = '狀態更新';
  if (isUrlLike_(note) || isEmailLike_(note) || looksLikeJsDate_(note)) note = '';

  return {
    status: status,
    note: note,
    time: time
  };
}

function sanitizeCustomerNote_(text) {
  var v = String(text || '').trim();
  if (!v) return '';
  if (isUrlLike_(v) || isEmailLike_(v) || looksLikeJsDate_(v)) return '';
  return v;
}

function isUrlLike_(text) {
  var v = String(text || '').trim();
  return /^https?:\/\//i.test(v) || /res\.cloudinary\.com/i.test(v);
}

function isEmailLike_(text) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(text || '').trim());
}

function looksLikeJsDate_(text) {
  return /GMT[+-]\d{4}/.test(String(text || '')) || /\(.*標準時間\)/.test(String(text || ''));
}

/**
 * 商品圖來源優先順序：
 * 1) 工作表1「商品圖」欄（建議放在商品內容右邊）
 * 2) 獨立工作表「商品圖」關鍵字對照
 */
function buildProductItems_(ss, productText, productImageText, productItemStatusText, orderStatusFallback) {
  var names = parseProductNames_(productText);
  if (names.length === 0) return [];

  var inlineImages = parseProductImages_(productImageText);
  var inlineStatuses = parseProductItemStatuses_(productItemStatusText);
  var imageRows = getProductImageRows_(ss);
  var fallback = String(orderStatusFallback || '').trim();

  return names.map(function(name, index) {
    var displayName = sanitizeProductName_(name);
    var image = inlineImages[index] || '';
    if (!image && inlineImages.length === 1) image = inlineImages[0];
    if (!image) image = findProductImage_(name, imageRows);
    if (!image && isUrlLike_(name)) image = name;

    var statusRaw = inlineStatuses[index] || '';
    if (!statusRaw && inlineStatuses.length === 1) statusRaw = inlineStatuses[0];
    if (!statusRaw && names.length === 1) statusRaw = fallback;

    var normalized = normalizeItemStatus_(statusRaw, fallback);
    return {
      name: displayName,
      image: image,
      itemStatus: normalized.label,
      itemStatusCode: normalized.code
    };
  });
}

function buildItemSummary_(items) {
  var total = items.length;
  var shipped = 0;
  items.forEach(function(item) {
    if (item.itemStatusCode === 'shipped') shipped++;
  });
  return {
    total: total,
    shipped: shipped,
    pending: Math.max(total - shipped, 0)
  };
}

function normalizeItemStatus_(text, orderStatusFallback) {
  var v = String(text || '').trim();
  if (!v) v = String(orderStatusFallback || '').trim();

  if (/已出貨|已寄出|已到貨|配送中|運送中|賣貨便|7-11|取件/.test(v)) {
    return { code: 'shipped', label: '已出貨' };
  }
  if (/待到貨|待出貨|未到貨|待採購|已採購|採購中|備貨|集運|出荷|日本出荷|訂單成立/.test(v)) {
    return { code: 'pending', label: '待到貨' };
  }
  if (!v) return { code: 'pending', label: '待到貨' };
  return { code: 'pending', label: v };
}

function parseProductItemStatuses_(statusText) {
  var text = String(statusText || '').trim();
  if (!text) return [];
  return text
    .split(/\n|；|;/)
    .map(function(part) {
      return String(part || '')
        .replace(/^\d+[、.．]\s*/, '')
        .trim();
    })
    .filter(Boolean);
}

/**
 * 依標題列自動判斷欄位位置（相容舊版未插入商品圖欄）
 */
function getOrderSheetColumns_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 6);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var cols = {
    orderId: COL_ORDER_ID,
    product: COL_PRODUCT,
    productImage: 0,
    productItemStatus: 0,
    status: COL_STATUS,
    note: COL_NOTE,
    updated: COL_UPDATED
  };

  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim();
    var col = i + 1;
    if (/訂單編號|訂單/.test(h)) cols.orderId = col;
    else if (/商品內容/.test(h)) cols.product = col;
    else if (/商品圖|圖片網址|cloudinary/i.test(h)) cols.productImage = col;
    else if (/商品狀態|品項狀態/.test(h)) cols.productItemStatus = col;
    else if (/出貨狀態|出貨/.test(h)) cols.status = col;
    else if (/備註/.test(h)) cols.note = col;
    else if (/最後更新|更新時間/.test(h)) cols.updated = col;
  }

  // 舊版：C=出貨狀態、D=備註、E=最後更新
  if (!cols.productImage && !cols.productItemStatus && cols.status === 3 && cols.note === 4) {
    cols.status = 3;
    cols.note = 4;
    cols.updated = 5;
  }

  return cols;
}

function parseProductImages_(imageText) {
  var text = String(imageText || '').trim();
  if (!text) return [];
  return text
    .split(/\n|；|;/)
    .map(function(part) { return String(part || '').trim(); })
    .filter(function(part) { return isUrlLike_(part); });
}

function sanitizeProductName_(name) {
  var v = String(name || '').trim();
  if (!v) return '';
  if (isUrlLike_(v)) return '商品';
  return v;
}

function parseProductNames_(productText) {
  var text = String(productText || '').trim();
  if (!text) return [];
  return text
    .split(/\n|；|;/)
    .map(function(part) {
      return String(part || '')
        .replace(/^\d+[、.．]\s*/, '')
        .trim();
    })
    .filter(Boolean);
}

function getProductImageRows_(ss) {
  var sheet = ss.getSheetByName(PRODUCT_IMAGE_SHEET_NAME);
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var keyword = String(values[i][0] || '').trim();
    var url = String(values[i][1] || '').trim();
    if (!keyword || !url) continue;
    rows.push({ keyword: keyword, url: url });
  }

  // 關鍵字越長優先（避免短字誤配）
  rows.sort(function(a, b) {
    return b.keyword.length - a.keyword.length;
  });
  return rows;
}

function findProductImage_(productName, imageRows) {
  var name = String(productName || '').trim();
  if (!name || !imageRows.length) return '';

  for (var i = 0; i < imageRows.length; i++) {
    var keyword = imageRows[i].keyword;
    if (name === keyword || name.indexOf(keyword) >= 0) {
      return imageRows[i].url;
    }
  }
  return '';
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
  var cols = getOrderSheetColumns_(orderSheet);
  var map = buildOrderRowIndex_(orderSheet, cols);
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
      var oldStatus = String(orderSheet.getRange(row, cols.status).getValue() || '').trim();
      var oldNote = String(orderSheet.getRange(row, cols.note).getValue() || '').trim();
      var changed = false;

      if (product) orderSheet.getRange(row, cols.product).setValue(product);
      if (status && status !== oldStatus) {
        orderSheet.getRange(row, cols.status).setValue(status);
        changed = true;
      }
      if (note !== oldNote) {
        orderSheet.getRange(row, cols.note).setValue(note);
        changed = true;
      }
      orderSheet.getRange(row, cols.updated).setValue(updatedAt);

      if (changed && status) {
        historySheet.appendRow([orderId, status, note, updatedAt, '系統']);
      }
      updated++;
      return;
    }

    appendOrderRow_(orderSheet, cols, orderId, product, status, note, updatedAt);
    if (status) {
      historySheet.appendRow([orderId, status, note, updatedAt, '系統']);
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

function buildOrderRowIndex_(sheet, cols) {
  var columns = cols || getOrderSheetColumns_(sheet);
  var values = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < values.length; i++) {
    var orderId = normalizeOrderId_(values[i][columns.orderId - 1]);
    var orderKey = normalizeOrderKey_(orderId);
    if (!orderKey) continue;
    map[orderKey] = i + 1;
  }
  return map;
}

function appendOrderRow_(sheet, cols, orderId, product, status, note, updatedAt) {
  var row = new Array(Math.max(cols.updated, cols.productImage || 0));
  for (var i = 0; i < row.length; i++) row[i] = '';
  row[cols.orderId - 1] = orderId;
  row[cols.product - 1] = product;
  if (cols.productImage) row[cols.productImage - 1] = '';
  if (cols.productItemStatus) row[cols.productItemStatus - 1] = '';
  row[cols.status - 1] = status;
  row[cols.note - 1] = note;
  row[cols.updated - 1] = updatedAt;
  sheet.appendRow(row);
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
