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
    "getOrderStatusPublic_",
]

blocks = [extract_func(fn) for fn in FUNCS]
idx = FUNCS.index("getOrders")
blocks[idx] = blocks[idx].replace(
    "  ensureOrderHeaderRow_(sheet);\n", "  if (!sheet) return [];\n"
)

HEADER = r'''/**
 * MAARU 訂單進度查詢 API（OrderStatus.gs）
 * 綁定試算表：MAARU 日本萌GO訂單進度資料表
 * https://docs.google.com/spreadsheets/d/1BLcUU6IpqjYIcyNKb8IjFRoQZgkSnbct0NjkFBKb4vw/edit
 *
 * 部署：試算表 → 擴充功能 → Apps Script → 貼上本檔 → 儲存
 *       → 部署 → 管理部署 → 編輯 → 版本「新版本」→ 部署
 * 複製網頁應用程式 URL 至 Order-status-main/index.html 的 API_URL
 *
 * GET action：
 * - api_meta         檢查 API 版本
 * - order_status     五碼訂單編號查配送進度（讀 工作表1 + 歷程）
 * - customer_orders  13 碼會員卡號查歷史訂單
 * - （相容）?orderId=00001
 *
 * 同步來源：ProductManagement2-main/Code.gs（apiVersion 2026-06-04-sheet1）
 */

var CONFIG = {
  orderSheetName: "訂單",
  legacyProgressSheetName: "工作表1",
  legacyHistorySheetName: "歷程"
};

function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = (params.action || "").toString().toLowerCase().trim();
    if (action === "api_meta") {
      return jsonOutput({
        ok: true,
        apiVersion: "2026-06-04-sheet1",
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

/**
 * 手動編輯「工作表1」出貨狀態或備註時，自動寫入最後更新與「歷程」
 */
function onEdit(e) {
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

function getOrCreateHistorySheet_(ss) {
  var name = (CONFIG.legacyHistorySheetName || "歷程").toString().trim();
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);
  sheet.appendRow(["訂單編號", "狀態", "備註", "更新時間", "操作人"]);
  return sheet;
}

'''

OUT.write_text(HEADER + "\n\n" + "\n\n".join(blocks), encoding="utf-8")
print(f"Wrote {OUT} ({len(OUT.read_text(encoding='utf-8').splitlines())} lines)")
