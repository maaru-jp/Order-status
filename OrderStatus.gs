// 訂單查詢系統（Google Apps Script）
// 1) 手動更新「工作表1」的出貨狀態/備註時，自動寫入最後更新與歷程
// 2) 前端用 doGet?orderId=00055 查詢單筆訂單與完整歷程

const ORDER_SHEET_NAME = '工作表1';
const STATUS_SHEET_NAME = '狀態';
const HISTORY_SHEET_NAME = '歷程';

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
      if (rowOrderId === orderId) {
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

function getOrderHistory_(ss, orderId) {
  var sheet = ss.getSheetByName(HISTORY_SHEET_NAME);
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var list = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var rowOrderId = String(row[0] || '').trim();
    if (rowOrderId !== orderId) continue;

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

  // 前端只需 time/status，其餘欄位可保留擴充
  return list.map(function(item) {
    var statusText = item.status;
    if (item.note) statusText += '（' + item.note + '）';
    return {
      time: item.time,
      status: statusText
    };
  });
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
