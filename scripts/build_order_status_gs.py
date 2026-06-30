import re
import pathlib

SRC = pathlib.Path(r"c:\Users\vickie\Desktop\ProductManagement2-main\Code.gs")
OUT = pathlib.Path(r"c:\Users\vickie\Desktop\Order-status-main\OrderStatus.gs")

text = SRC.read_text(encoding="utf-8")


def extract_func(name: str) -> str:
    pat = rf"function {re.escape(name)}\s*\([^)]*\)\s*\{{"
    m = re.search(pat, text)
    if not m:
        raise SystemExit(f"missing {name}")
    start = m.start()
    i = m.end() - 1
    depth = 0
    while i < len(text):
        c = text[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
        i += 1
    raise SystemExit(f"unclosed {name}")


FUNCS = [
    "getOrderHeaders_",
    "orderKeyMap_",
    "getOrderIdColumns_",
    "normalizeOrderId_",
    "getOrders",
    "jsonOutput",
    "normalizeSheetDateValue_",
    "normalizeMemberCardNo_",
    "isValidMemberCardNo_",
    "normalizeCustomerNameForPoints_",
    "orderMatchesMemberCard_",
    "orderMatchesCustomerName_",
    "collectCustomerNamesForMemberCard_",
    "orderMatchesMemberCardExtended_",
    "findOrdersForMemberCard_",
    "resolvePublicMemberCardParam_",
    "orderEffectiveShippingPublic_",
    "orderAmountDuePublic_",
    "sanitizePublicOrderItem_",
    "sanitizePublicOrder_",
    "getCustomerOrdersPublic_",
    "resolvePublicOrderIdParam_",
    "orderIdsEquivalent_",
    "findOrderById_",
    "listOrderSourceSheets_",
    "getAllOrdersMerged_",
    "isPublicUrlLike_",
    "sanitizePublicHistoryStep_",
    "cleanStatusLabel_",
    "parseSheet1ProductLines_",
    "parseSheet1ImageLines_",
    "getSheet1OrderColumns_",
    "buildSheet1ProductItems_",
    "getSheet1OrderStatusPublic_",
    "getLegacyTrackingHistory_",
    "buildItemsFromProductFields_",
    "orderStatusQueryDisplayId_",
    "normalizeHistoryEntry_",
    "parsePublicTrackingHistory_",
    "mapPublicStatusItemCode_",
    "mapPublicStatusItem_",
    "buildPublicItemSummary_",
    "buildOrderProductText_",
    "sanitizePublicOrderNote_",
    "derivePublicTrackingStatus_",
    "buildSyntheticTrackingHistory_",
]

CUSTOM_GET_ORDER_STATUS = r'''
/**
 * 五碼訂單編號查詢：僅讀「工作表1」+「歷程」（不讀「訂單」分頁）
 */
function getOrderStatusPublic_(params) {
  params = params || {};
  var id = resolvePublicOrderIdParam_(params);
  if (!id) {
    return { error: true, message: "請輸入訂單編號" };
  }
  var ss = getProgressSpreadsheet_();
  var sheetName = (CONFIG.legacyProgressSheetName || "工作表1").toString().trim();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return {
      error: true,
      message: "找不到試算表分頁「" + sheetName + "」（" + (CONFIG.spreadsheetName || "") + "）"
    };
  }
  var result = getSheet1OrderStatusPublic_(ss, id);
  if (result && result.error === false) {
    return result;
  }
  return {
    error: true,
    message: "查無此訂單編號（請確認「" + sheetName + "」A 欄訂單編號）"
  };
}
'''

blocks = [extract_func(fn) for fn in FUNCS]
idx = FUNCS.index("getOrders")
blocks[idx] = blocks[idx].replace(
    "  ensureOrderHeaderRow_(sheet);\n", "  if (!sheet) return [];\n"
)
for i, fn in enumerate(FUNCS):
    if fn in ("getCustomerOrdersPublic_", "getOrderStatusPublic_"):
        blocks[i] = blocks[i].replace(
            "SpreadsheetApp.getActiveSpreadsheet()",
            "getProgressSpreadsheet_()",
        )

HEADER = r'''/**
 * MAARU 訂單進度查詢 API（OrderStatus.gs）
 *
 * 資料來源試算表：MAARU 日本萌物GO訂單進度資料表
 * https://docs.google.com/spreadsheets/d/1BLcUU6IpqjYIcyNKb8IjFRoQZgkSnbct0NjkFBKb4vw/edit
 *
 * 函式庫 Script ID：12zRuG_AbPZl9OO8ArWLm8EAu1UXxhoTwHrJSxU965dAEuFlGTgcS-nEc
 * 函式庫網址：https://script.google.com/macros/library/d/12zRuG_AbPZl9OO8ArWLm8EAu1UXxhoTwHrJSxU965dAEuFlGTgcS-nEc/15
 *
 * 用法 A（函式庫專案）：貼上本檔 → 部署 → 新增部署 → 函式庫 → 版本號遞增
 * 用法 B（試算表綁定）：試算表 Apps Script 只貼 SpreadsheetBinding.gs，並加入上述函式庫
 * 用法 C（單檔）：試算表 Apps Script 直接貼本檔全文 → 部署網頁應用程式
 *
 * GET（輸入訂單編號讀試算表）：
 * - action=order_status&orderId=00083
 * - ?orderId=00083（相容舊版）
 * - action=customer_orders&card=13碼會員卡號
 * - action=api_meta
 *
 * 函式庫對外入口：handleDoGet_(e)、handleOnEdit_(e)、lookupOrderById_(orderId)
 */

var CONFIG = {
  spreadsheetId: "1BLcUU6IpqjYIcyNKb8IjFRoQZgkSnbct0NjkFBKb4vw",
  spreadsheetName: "MAARU 日本萌物GO訂單進度資料表",
  orderSheetName: "訂單",
  legacyProgressSheetName: "工作表1",
  legacyHistorySheetName: "歷程"
};

/** 固定開啟「MAARU 日本萌物GO訂單進度資料表」（函式庫未綁定試算表時也能讀） */
function getProgressSpreadsheet_() {
  var id = (CONFIG.spreadsheetId || "").toString().trim();
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      Logger.log("[getProgressSpreadsheet_] openById: " + err);
    }
  }
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error("無法開啟試算表「" + (CONFIG.spreadsheetName || id) + "」");
}

/** 依訂單編號讀取試算表（工作表1 + 歷程）；供函式庫或編輯器測試 */
function lookupOrderById_(orderId) {
  return getOrderStatusPublic_({ orderId: orderId });
}

/** 函式庫入口：網頁應用程式 doGet 請呼叫此函式 */
function handleDoGet_(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = (params.action || "").toString().toLowerCase().trim();
    if (action === "api_meta") {
      return jsonOutput({
        ok: true,
        apiVersion: "2026-06-04-sheet1",
        spreadsheetId: CONFIG.spreadsheetId,
        spreadsheetName: CONFIG.spreadsheetName,
        libraryScriptId: "12zRuG_AbPZl9OO8ArWLm8EAu1UXxhoTwHrJSxU965dAEuFlGTgcS-nEc",
        routes: ["customer_orders", "order_status", "orderId_legacy", "sheet1_progress"]
      });
    }
    if (action === "customer_orders") {
      return jsonOutput(getCustomerOrdersPublic_(params));
    }
    if (action === "order_status") {
      return jsonOutput(getOrderStatusPublic_(params));
    }
    var legacyOrderId = (params.orderId || params.id || params["訂單編號"] || "").toString().trim();
    if (legacyOrderId) {
      return jsonOutput(getOrderStatusPublic_(params));
    }
    return jsonOutput({
      error: true,
      message: "請使用 action=order_status 或 orderId=五碼編號"
    });
  } catch (err) {
    Logger.log(err);
    return jsonOutput({ error: true, message: err.toString() });
  }
}

function doGet(e) {
  return handleDoGet_(e);
}

/** 函式庫入口：試算表 onEdit 觸發請呼叫此函式 */
function handleOnEdit_(e) {
  try {
    if (!e || !e.range) return;
    var range = e.range;
    var sheet = range.getSheet();
    var sheetName = (CONFIG.legacyProgressSheetName || "工作表1").toString().trim();
    if (!sheet || sheet.getName() !== sheetName) return;
    var row = range.getRow();
    var col = range.getColumn();
    if (row < 2) return;
    var cols = getSheet1OrderColumns_(sheet);
    if (col !== cols.shipStatus && col !== cols.note) return;
    var orderId = String(sheet.getRange(row, cols.orderId).getValue() || "").trim();
    if (!orderId) return;
    var status = cols.shipStatus
      ? String(sheet.getRange(row, cols.shipStatus).getValue() || "").trim()
      : "";
    var note = cols.note ? String(sheet.getRange(row, cols.note).getValue() || "").trim() : "";
    var now = new Date();
    if (cols.updated) {
      sheet.getRange(row, cols.updated).setValue(now);
    }
    if (!status) return;
    var ss = sheet.getParent();
    var historySheet = getOrCreateHistorySheet_(ss);
    historySheet.appendRow([orderId, status, note, now, "系統"]);
  } catch (err) {
    Logger.log("[onEdit] " + err);
  }
}

function onEdit(e) {
  handleOnEdit_(e);
}

function getOrCreateHistorySheet_(ss) {
  var name = (CONFIG.legacyHistorySheetName || "歷程").toString().trim();
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);
  sheet.appendRow(["訂單編號", "狀態", "備註", "更新時間", "操作人"]);
  return sheet;
}

'''

OUT.write_text(
    HEADER + "\n\n" + "\n\n".join(blocks) + "\n\n" + CUSTOM_GET_ORDER_STATUS.strip(),
    encoding="utf-8",
)
print(f"Wrote {OUT} ({len(OUT.read_text(encoding='utf-8').splitlines())} lines)")
