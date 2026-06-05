/**
 * MAARU 訂單進度查詢 API（OrderStatus.gs）
 *
 * 資料來源試算表：MAARU 日本萌物GO訂單進度資料表
 * https://docs.google.com/spreadsheets/d/1BLcUU6IpqjYIcyNKb8IjFRoQZgkSnbct0NjkFBKb4vw/edit
 *
 * 網頁應用程式部署 ID：AKfycby69CThnF5mE-ILJGhHr0iSCkBaqJKjY8tCpF69BNlW6FohHXXbMrTYvh9j4nj9jATJ
 * 函式庫 Script ID：12zRuG_AbPZl9OO8ArWLm8EAu1UXxhoTwHrJSxU965dAEuFlGTgcS-nEc
 * 函式庫網址：https://script.google.com/macros/library/d/12zRuG_AbPZl9OO8ArWLm8EAu1UXxhoTwHrJSxU965dAEuFlGTgcS-nEc/15
 *
 * 用法 A（函式庫專案）：貼上本檔 → 部署 → 新增部署 → 函式庫 → 版本號遞增
 * 用法 B（試算表綁定）：試算表 Apps Script 只貼 SpreadsheetBinding.gs，並加入上述函式庫
 * 用法 C（單檔）：試算表 Apps Script 直接貼本檔全文 → 部署網頁應用程式
 *
 * GET（輸入訂單編號僅讀「工作表1」+「歷程」）：
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
  // 若後台訂單在另一份試算表，填該試算表 ID（留空則只讀 spreadsheetId）
  shopSpreadsheetId: "",
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
    if (action === "order_source_debug") {
      return jsonOutput(getOrderSourceDebugPublic_());
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



function getOrderHeaders_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  var row1 = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  return row1.map(function(h) { return (h || "").toString().trim(); });
}

function orderKeyMap_(headers) {
  var map = {};
  var aliases = [
    ["訂單編號", "id", "ID"],
    ["狀態", "status"],
    ["出貨狀態", "status"],
    ["商品內容", "product"],
    ["商品圖", "productImage"],
    ["圖片網址", "productImage"],
    ["商品狀態", "productItemStatus"],
    ["最後更新", "updated", "updatedAt", "lastUpdated"],
    ["日期", "date"],
    ["客戶姓名", "customerName", "姓名", "name"],
    ["會員卡號", "memberCardNo", "memberCard"],
    ["電話", "phone"],
    ["Email", "email"],
    ["Line ID", "lineId", "LineID", "line id"],
    ["運送方式", "shippingMethod"],
    ["門市", "storeName"],
    ["店號", "storeId"],
    ["地址", "address"],
    ["小計", "subtotal"],
    ["折扣", "discount"],
    ["運費", "shippingFee"],
    ["運費狀態", "shippingStatus"],
    ["預購訂金", "depositAmount"],
    ["待結清總金額", "總計", "total"],
    ["備註", "remark"],
    ["收訂金歷程記錄", "depositRemark"],
    ["預購日期", "preorderDate"],
    ["出貨日期", "shipDate"],
    ["品項(JSON)", "itemsJson", "items"],
    ["使用紅利", "pointsUsed"],
    ["獲得紅利", "pointsEarned"],
    ["紅利已處理", "pointsProcessed"],
    ["關聯訂單", "linkedOrderIds", "linkedOrders"],
    ["配送歷程", "trackingHistory", "deliveryHistory", "historyJson", "history"],
    ["更新時間", "updated", "updatedAt", "lastUpdated"],
    ["商品摘要", "product"]
  ];
  for (var c = 0; c < headers.length; c++) {
    var h = (headers[c] || "").toString().trim();
    if (!h) continue;
    for (var a = 0; a < aliases.length; a++) {
      var group = aliases[a];
      for (var g = 0; g < group.length; g++) {
        if (h === group[g] || h.toLowerCase() === String(group[g]).toLowerCase()) {
          map[c] = group[group.length - 1];
          break;
        }
      }
      if (map[c]) break;
    }
  }
  return map;
}

function getOrderIdColumns_(headers) {
  var cols = [];
  for (var c = 0; c < headers.length; c++) {
    var h = (headers[c] || "").toString().trim();
    if (!h) continue;
    var hl = h.toLowerCase();
    if (h === "訂單編號" || hl === "id" || hl === "orderid" || h.indexOf("訂單編號") >= 0) cols.push(c);
  }
  if (cols.length === 0) cols.push(0);
  return cols;
}

function normalizeOrderId_(v) {
  if (v == null) return "";
  // 去除前後空白與中間空白，統一大寫，並盡量規範成 ORD+5碼
  var s = String(v).trim().replace(/\s+/g, "").toUpperCase();
  var m = s.match(/^ORD(\d+)$/);
  if (m) {
    var n = parseInt(m[1], 10);
    if (!isNaN(n) && n >= 0) return "ORD" + ("00000" + n).slice(-5);
    return s;
  }
  if (/^\d+$/.test(s)) {
    var n2 = parseInt(s, 10);
    if (!isNaN(n2) && n2 >= 0) return "ORD" + ("00000" + n2).slice(-5);
  }
  return s;
}

function findMemberCardColumnIndex_(headers) {
  for (var c = 0; c < (headers || []).length; c++) {
    var h = String(headers[c] || "").trim();
    if (h === "會員卡號" || /^membercard/i.test(h)) return c;
  }
  return -1;
}

function getOrders(sheet) {
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var display = sheet.getDataRange().getDisplayValues();
  var headers = data[0].map(function(h) { return (h || "").toString().trim(); });
  var keyMap = orderKeyMap_(headers);
  var cardCol = findMemberCardColumnIndex_(headers);
  var list = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var key = keyMap[c];
      if (!key) continue;
      var val = row[c];
      if (val === "" || val === null || val === undefined) continue;
      if (key === "items") key = "itemsJson";
      obj[key] = val;
    }
    if (cardCol >= 0 && display[r] && display[r][cardCol]) {
      var dispCard = normalizeMemberCardNo_(display[r][cardCol]);
      if (dispCard) obj.memberCardNo = dispCard;
    }
    var id = (obj.id != null) ? String(obj.id).trim() : "";
    if (!id) continue;
    // itemsJson → items
    if (obj.itemsJson != null && String(obj.itemsJson).trim() !== "") {
      try {
        var parsed = JSON.parse(String(obj.itemsJson));
        if (parsed && typeof parsed === "object") obj.items = parsed;
      } catch (e) {
        // ignore parse error
      }
    }
    delete obj.itemsJson;
    if (obj.id != null) obj.id = normalizeOrderId_(obj.id);
    if (obj.memberCardNo != null && obj.memberCardNo !== "") {
      obj.memberCardNo = normalizeMemberCardNo_(obj.memberCardNo);
    }
    list.push(obj);
  }
  // 依日期由新到舊（無日期則置底）
  list.sort(function(a, b) {
    var ad = a.date ? new Date(a.date).getTime() : 0;
    var bd = b.date ? new Date(b.date).getTime() : 0;
    if (!isFinite(ad)) ad = 0;
    if (!isFinite(bd)) bd = 0;
    return bd - ad;
  });
  return list;
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeSheetDateValue_(val) {
  if (val == null || val === "") return "";
  if (Object.prototype.toString.call(val) === "[object Date]" && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || "Asia/Taipei", "yyyy-MM-dd");
  }
  var s = String(val).trim();
  var m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
  }
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function normalizeMemberCardNo_(card) {
  if (card == null || card === "") return "";
  if (typeof card === "number" && isFinite(card)) {
    card = card >= 1e12 ? String(Math.round(card)) : String(card);
  }
  var s = String(card).replace(/^'/, "").trim();
  if (/e/i.test(s)) {
    var n = Number(s);
    if (isFinite(n) && n >= 1e12) s = String(Math.round(n));
  }
  return s.replace(/\D/g, "").slice(0, 13);
}

function isValidMemberCardNo_(card) {
  return /^\d{13}$/.test(normalizeMemberCardNo_(card));
}

function normalizeCustomerNameForPoints_(name) {
  return String(name || "").trim().replace(/\s+/g, "");
}

function orderMatchesMemberCard_(order, memberCardNo) {
  var card = normalizeMemberCardNo_(memberCardNo);
  if (!isValidMemberCardNo_(card)) return false;
  return normalizeMemberCardNo_(order && order.memberCardNo) === card;
}

function orderMatchesCustomerName_(order, customerName) {
  var n = normalizeCustomerNameForPoints_(customerName);
  if (!n) return false;
  return normalizeCustomerNameForPoints_(order && order.customerName) === n;
}

function collectCustomerNamesForMemberCard_(orders, card) {
  var names = {};
  if (!isValidMemberCardNo_(card)) return [];
  for (var i = 0; i < (orders || []).length; i++) {
    var ord = orders[i];
    if (!orderMatchesMemberCard_(ord, card)) continue;
    var n = normalizeCustomerNameForPoints_(ord && ord.customerName);
    if (n) names[n] = true;
  }
  return Object.keys(names);
}

function orderMatchesMemberCardExtended_(order, card, linkedNames) {
  if (orderMatchesMemberCard_(order, card)) return true;
  if (!linkedNames || !linkedNames.length) return false;
  var n = normalizeCustomerNameForPoints_(order && order.customerName);
  return !!(n && linkedNames.indexOf(n) >= 0);
}

function findOrdersForMemberCard_(allOrders, card) {
  var matched = [];
  var seenIds = {};
  var linkedNames = collectCustomerNamesForMemberCard_(allOrders, card);
  for (var i = 0; i < (allOrders || []).length; i++) {
    var ord = allOrders[i];
    if (!ord) continue;
    if (!orderMatchesMemberCardExtended_(ord, card, linkedNames)) continue;
    var id = normalizeOrderId_(ord.id);
    if (!id || seenIds[id]) continue;
    seenIds[id] = true;
    matched.push(ord);
  }
  return matched;
}

function resolvePublicMemberCardParam_(params) {
  params = params || {};
  var direct = normalizeMemberCardNo_(
    params.card || params.memberCardNo || params["會員卡號"] || ""
  );
  if (isValidMemberCardNo_(direct)) return direct;
  var fromText = normalizeMemberCardNo_(
    params.name || params.customerName || params["姓名"] || ""
  );
  if (isValidMemberCardNo_(fromText)) return fromText;
  return "";
}

function orderEffectiveShippingPublic_(ord) {
  var fee = Number(ord && ord.shippingFee);
  if (isNaN(fee)) fee = 38;
  var st = String(ord && ord.shippingStatus || "");
  if (st.indexOf("免運") >= 0) return 0;
  return Math.max(0, Math.ceil(fee));
}

function orderAmountDuePublic_(ord) {
  var sub = Number(ord && ord.subtotal) || 0;
  var disc = Number(ord && ord.discount) || 0;
  if (isNaN(disc)) disc = 0;
  var pts = Math.floor(Number(ord && ord.pointsUsed) || 0);
  var ship = orderEffectiveShippingPublic_(ord);
  var dep = Number(ord && ord.depositAmount) || 0;
  if (isNaN(dep) || dep < 0) dep = 0;
  var gross = Math.max(0, Math.ceil(sub - disc - pts + ship));
  return dep > 0 ? Math.max(0, gross - dep) : gross;
}

function sanitizePublicOrderItem_(it) {
  var o = it || {};
  var price = (o.price != null && o.price !== "" && !isNaN(Number(o.price))) ? Number(o.price) : null;
  return {
    lineName: String(o.lineName != null ? o.lineName : "").trim(),
    qty: Math.max(0, Math.floor(Number(o.qty) || 0)),
    price: price,
    shipStatus: String(o.shipStatus != null ? o.shipStatus : "待出貨").trim() || "待出貨"
  };
}

function sanitizePublicOrder_(ord) {
  var items = [];
  if (ord && ord.items && Array.isArray(ord.items)) {
    for (var i = 0; i < ord.items.length; i++) {
      var it = sanitizePublicOrderItem_(ord.items[i]);
      if (it.lineName) items.push(it);
    }
  }
  return {
    id: String(ord && ord.id != null ? ord.id : "").trim(),
    status: String(ord && ord.status != null ? ord.status : "").trim() || "待處理",
    date: ord && ord.date != null ? String(ord.date) : "",
    subtotal: Number(ord && ord.subtotal) || 0,
    discount: Number(ord && ord.discount) || 0,
    pointsUsed: Math.floor(Number(ord && ord.pointsUsed) || 0),
    shippingFee: orderEffectiveShippingPublic_(ord),
    depositAmount: Number(ord && ord.depositAmount) || 0,
    amountDue: orderAmountDuePublic_(ord),
    pointsEarned: Math.floor(Number(ord && ord.pointsEarned) || 0),
    linkedOrderIds: String(ord && ord.linkedOrderIds != null ? ord.linkedOrderIds : "").trim(),
    preorderDate: ord && ord.preorderDate != null ? String(ord.preorderDate) : "",
    shipDate: ord && ord.shipDate != null ? String(ord.shipDate) : "",
    shippingMethod: String(ord && ord.shippingMethod != null ? ord.shippingMethod : "").trim(),
    items: items
  };
}

function getCustomerOrdersPublic_(params) {
  params = params || {};
  var card = resolvePublicMemberCardParam_(params);
  var orderIdOnly = resolvePublicOrderIdParam_(params);
  // 僅帶 orderId、無卡號時，改走單筆配送進度（與 order_status 相同）
  if (orderIdOnly && !isValidMemberCardNo_(card)) {
    return getOrderStatusPublic_(params);
  }
  if (!isValidMemberCardNo_(card)) {
    return { error: true, message: "請輸入 13 碼會員卡號" };
  }
  var all = getAllOrdersMergedAllSources_();
  var matched = findOrdersForMemberCard_(all, card);
  matched.sort(function(a, b) {
    var ma = String(a.id || "").match(/^ORD(\d+)$/i);
    var mb = String(b.id || "").match(/^ORD(\d+)$/i);
    var na = ma ? parseInt(ma[1], 10) : Number.MAX_SAFE_INTEGER;
    var nb = mb ? parseInt(mb[1], 10) : Number.MAX_SAFE_INTEGER;
    return nb - na;
  });
  var publicOrders = [];
  for (var j = 0; j < matched.length; j++) {
    publicOrders.push(sanitizePublicOrder_(matched[j]));
  }
  var totalDue = 0;
  var activeCount = 0;
  for (var k = 0; k < publicOrders.length; k++) {
    var o = publicOrders[k];
    if (o.status === "已取消") continue;
    activeCount++;
    if (o.status !== "已完成") totalDue += o.amountDue;
  }
  return {
    error: false,
    memberCardNo: card,
    orders: publicOrders,
    orderCount: publicOrders.length,
    activeCount: activeCount,
    totalDue: totalDue,
    message: publicOrders.length ? "OK" : "目前尚無訂單紀錄"
  };
}

function resolvePublicOrderIdParam_(params) {
  params = params || {};
  return normalizeOrderId_(params.orderId || params.id || params["訂單編號"] || "");
}

function orderIdsEquivalent_(a, b) {
  if (!a || !b) return false;
  if (normalizeOrderId_(a) === normalizeOrderId_(b)) return true;
  var da = String(a).replace(/\D/g, "");
  var db = String(b).replace(/\D/g, "");
  if (!da || !db) return false;
  var na = parseInt(da, 10);
  var nb = parseInt(db, 10);
  return !isNaN(na) && !isNaN(nb) && na === nb;
}

function findOrderById_(orders, id) {
  if (!id) return null;
  for (var i = 0; i < (orders || []).length; i++) {
    if (orderIdsEquivalent_(orders[i].id, id)) return orders[i];
  }
  return null;
}

function listOrderSourceSheets_(ss) {
  var result = [];
  var seen = {};
  var preferred = ["訂單", "工作表1"];
  for (var i = 0; i < preferred.length; i++) {
    var s = ss.getSheetByName(preferred[i]);
    if (s) {
      var sid = s.getSheetId();
      if (!seen[sid]) {
        seen[sid] = true;
        result.push(s);
      }
    }
  }
  var all = ss.getSheets();
  for (var j = 0; j < all.length; j++) {
    var cand = all[j];
    var sid2 = cand.getSheetId();
    if (seen[sid2]) continue;
    var headers = getOrderHeaders_(cand);
    var hasOrderId = false;
    for (var h = 0; h < headers.length; h++) {
      if (headers[h] === "訂單編號") {
        hasOrderId = true;
        break;
      }
    }
    if (hasOrderId) {
      seen[sid2] = true;
      result.push(cand);
    }
  }
  return result;
}

function mergeOrderRecord_(base, extra) {
  if (!extra) return base;
  if (!base) return extra;
  var out = {};
  var keys = {};
  [base, extra].forEach(function(o) {
    Object.keys(o || {}).forEach(function(k) { keys[k] = true; });
  });
  Object.keys(keys).forEach(function(k) {
    var a = base[k];
    var b = extra[k];
    if (k === "memberCardNo") {
      var card = normalizeMemberCardNo_(a || b || "");
      if (card) out[k] = card;
      return;
    }
    if (a != null && a !== "") out[k] = a;
    else if (b != null && b !== "") out[k] = b;
  });
  return out;
}

function getAllOrdersMerged_(ss) {
  var sheets = listOrderSourceSheets_(ss);
  var byId = {};
  var order = [];
  for (var i = 0; i < sheets.length; i++) {
    var list = getOrders(sheets[i]);
    for (var j = 0; j < list.length; j++) {
      var nid = normalizeOrderId_(list[j].id);
      if (!nid) continue;
      if (byId[nid]) {
        byId[nid] = mergeOrderRecord_(byId[nid], list[j]);
      } else {
        byId[nid] = list[j];
        order.push(nid);
      }
    }
  }
  return order.map(function(id) { return byId[id]; });
}

function getOrderSpreadsheetIds_() {
  var ids = [];
  var seen = {};
  var primary = (CONFIG.spreadsheetId || "").toString().trim();
  if (primary) {
    seen[primary] = true;
    ids.push(primary);
  }
  var shop = (CONFIG.shopSpreadsheetId || "").toString().trim();
  if (shop && !seen[shop]) ids.push(shop);
  return ids;
}

function getAllOrdersMergedAllSources_() {
  var ids = getOrderSpreadsheetIds_();
  if (!ids.length) return getAllOrdersMerged_(getProgressSpreadsheet_());
  var byId = {};
  var order = [];
  for (var i = 0; i < ids.length; i++) {
    try {
      var ss = SpreadsheetApp.openById(ids[i]);
      var list = getAllOrdersMerged_(ss);
      for (var j = 0; j < list.length; j++) {
        var nid = normalizeOrderId_(list[j].id);
        if (!nid) continue;
        if (byId[nid]) {
          byId[nid] = mergeOrderRecord_(byId[nid], list[j]);
        } else {
          byId[nid] = list[j];
          order.push(nid);
        }
      }
    } catch (err) {
      Logger.log("[getAllOrdersMergedAllSources_] " + ids[i] + " " + err);
    }
  }
  return order.map(function(id) { return byId[id]; });
}

function getOrderSourceDebugPublic_() {
  var ss = getProgressSpreadsheet_();
  var all = getAllOrdersMergedAllSources_();
  var withCard = 0;
  for (var i = 0; i < all.length; i++) {
    if (isValidMemberCardNo_(all[i] && all[i].memberCardNo)) withCard++;
  }
  var orderSheet = ss.getSheetByName((CONFIG.orderSheetName || "訂單").toString().trim());
  var sheet1 = ss.getSheetByName((CONFIG.legacyProgressSheetName || "工作表1").toString().trim());
  return {
    ok: true,
    spreadsheetId: CONFIG.spreadsheetId,
    spreadsheetName: ss.getName(),
    orderSheetRows: orderSheet ? Math.max(0, orderSheet.getLastRow() - 1) : 0,
    sheet1Rows: sheet1 ? Math.max(0, sheet1.getLastRow() - 1) : 0,
    mergedOrderCount: all.length,
    ordersWithMemberCard: withCard,
    shopSpreadsheetConfigured: !!(CONFIG.shopSpreadsheetId || "").toString().trim()
  };
}

function isPublicUrlLike_(text) {
  var v = String(text || "").trim();
  return /^https?:\/\//i.test(v) || /res\.cloudinary\.com/i.test(v);
}

function sanitizePublicHistoryStep_(step) {
  var status = String((step && step.status) || "").trim();
  var note = String((step && step.note) || "").trim();
  var time = String((step && step.time) || "").trim();
  if (isPublicUrlLike_(status) && note && !isPublicUrlLike_(note)) {
    status = note;
    note = "";
  }
  if (isPublicUrlLike_(status)) status = "狀態更新";
  return {
    status: cleanStatusLabel_(status),
    note: note,
    time: time
  };
}

function cleanStatusLabel_(text) {
  return String(text || "")
    .trim()
    .replace(/^[\uD800-\uDBFF][\uDC00-\uDFFF]\s*/g, "")
    .replace(/^[^\u4e00-\u9fffA-Za-z0-9]+/, "")
    .trim();
}

function parseSheet1ProductLines_(text) {
  return String(text || "")
    .trim()
    .split(/\n|；|;/)
    .map(function(part) {
      return String(part || "")
        .replace(/^\d+[、.．)\]]\s*/, "")
        .trim();
    })
    .filter(Boolean);
}

function parseSheet1ImageLines_(text) {
  return String(text || "")
    .trim()
    .split(/\n|；|;/)
    .map(function(part) { return String(part || "").trim(); })
    .filter(function(part) { return isPublicUrlLike_(part); });
}

function getSheet1OrderColumns_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 5);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var cols = {
    orderId: 1,
    product: 2,
    productImage: 0,
    productItemStatus: 0,
    shipStatus: 0,
    note: 0,
    updated: 0
  };
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || "").trim();
    var col = i + 1;
    if (/訂單編號/.test(h)) cols.orderId = col;
    else if (/商品內容/.test(h)) cols.product = col;
    else if (/商品圖|圖片網址|cloudinary/i.test(h)) cols.productImage = col;
    else if (/商品狀態|品項狀態/.test(h)) cols.productItemStatus = col;
    else if (/出貨狀態/.test(h)) cols.shipStatus = col;
    else if (/備註/.test(h)) cols.note = col;
    else if (/最後更新|更新時間/.test(h)) cols.updated = col;
  }
  return cols;
}

function buildSheet1ProductItems_(productText, imageText, itemStatusText, shipStatusFallback) {
  var names = parseSheet1ProductLines_(productText);
  if (!names.length) return [];
  var images = parseSheet1ImageLines_(imageText);
  var statuses = parseSheet1ProductLines_(itemStatusText).map(cleanStatusLabel_);
  var fallback = cleanStatusLabel_(shipStatusFallback);
  var items = [];
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    if (isPublicUrlLike_(name)) name = "商品";
    var image = images[i] || "";
    if (!image && images.length === 1) image = images[0];
    var label = statuses[i] || "";
    if (!label && statuses.length === 1) label = statuses[0];
    if (!label && names.length === 1) label = fallback;
    if (!label) label = "待出貨";
    items.push(mapPublicStatusItem_({
      lineName: name,
      image: image,
      shipStatus: label
    }));
  }
  return items;
}

function getSheet1OrderStatusPublic_(ss, id) {
  var sheetName = (CONFIG.legacyProgressSheetName || "工作表1").toString().trim();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return null;

  var cols = getSheet1OrderColumns_(sheet);
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) {
    return { error: true, message: "查無此訂單編號", notFound: true };
  }

  var foundRow = null;
  var displayOrderId = "";
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var rowOrderId = String(row[cols.orderId - 1] || "").trim();
    if (!rowOrderId) continue;
    if (orderIdsEquivalent_(rowOrderId, id)) {
      foundRow = row;
      displayOrderId = rowOrderId;
      break;
    }
  }
  if (!foundRow) {
    return { error: true, message: "查無此訂單編號", notFound: true };
  }

  var product = String(foundRow[cols.product - 1] || "").trim();
  var productImages = cols.productImage
    ? String(foundRow[cols.productImage - 1] || "").trim()
    : "";
  var productItemStatus = cols.productItemStatus
    ? String(foundRow[cols.productItemStatus - 1] || "").trim()
    : "";
  var shipStatus = cols.shipStatus
    ? cleanStatusLabel_(foundRow[cols.shipStatus - 1])
    : "";
  var note = cols.note ? String(foundRow[cols.note - 1] || "").trim() : "";
  var updated = cols.updated
    ? normalizeSheetDateValue_(foundRow[cols.updated - 1])
    : "";

  var items = buildSheet1ProductItems_(product, productImages, productItemStatus, shipStatus);
  var itemSummary = buildPublicItemSummary_(items);
  var history = getLegacyTrackingHistory_(ss, displayOrderId);
  var trackingStatus = shipStatus || derivePublicTrackingStatus_({ status: shipStatus }, items);

  if ((!history || !history.length) && (trackingStatus || updated)) {
    history = [{
      time: updated || "",
      status: trackingStatus || "狀態更新",
      note: ""
    }];
  }

  return {
    error: false,
    orderId: orderStatusQueryDisplayId_(displayOrderId),
    orderIdFull: normalizeOrderId_(displayOrderId),
    memberCardNo: "",
    product: product,
    items: items,
    itemSummary: itemSummary,
    note: sanitizePublicOrderNote_({ remark: note }),
    history: history,
    status: trackingStatus,
    updated: updated
  };
}

function getLegacyTrackingHistory_(ss, orderId) {
  var names = [
    (CONFIG.legacyHistorySheetName || "歷程"),
    "歷程",
    "配送歷程",
    "狀態"
  ];
  var seen = {};
  for (var n = 0; n < names.length; n++) {
    var sheetName = String(names[n] || "").trim();
    if (!sheetName || seen[sheetName]) continue;
    seen[sheetName] = true;
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;
    var values = sheet.getDataRange().getValues();
    if (!values || values.length < 2) continue;
    var list = [];
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      var rowOrderId = String(row[0] || "").trim();
      if (!orderIdsEquivalent_(rowOrderId, orderId)) continue;
      var step = sanitizePublicHistoryStep_(normalizeHistoryEntry_({
        status: row[1],
        note: row[2],
        time: row[3]
      }));
      if (step && (step.status || step.time)) list.push(step);
    }
    if (list.length) {
      list.sort(function(a, b) {
        var ta = new Date(a.time || 0).getTime();
        var tb = new Date(b.time || 0).getTime();
        return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
      });
      return list;
    }
  }
  return [];
}

function buildItemsFromProductFields_(ord) {
  var product = String((ord && ord.product) || "").trim();
  if (!product) return [];
  var names = product.split(/\n|；|;/).map(function(s) {
    return String(s || "").trim();
  }).filter(Boolean);
  var images = String((ord && ord.productImage) || "").split(/\n|；|;/).map(function(s) {
    return String(s || "").trim();
  }).filter(Boolean);
  var statuses = String((ord && ord.productItemStatus) || "").split(/\n|；|;/).map(function(s) {
    return String(s || "").trim();
  }).filter(Boolean);
  var fallbackStatus = String((ord && ord.status) || "").trim();
  var items = [];
  for (var i = 0; i < names.length; i++) {
    var label = statuses[i] || (statuses.length === 1 ? statuses[0] : "") || fallbackStatus || "待出貨";
    items.push(mapPublicStatusItem_({
      lineName: names[i],
      image: images[i] || (images.length === 1 ? images[0] : ""),
      shipStatus: label
    }));
  }
  return items;
}

function orderStatusQueryDisplayId_(id) {
  var safeId = normalizeOrderId_(id);
  var m = safeId.match(/^ORD(\d+)$/);
  if (m) return ("00000" + parseInt(m[1], 10)).slice(-5);
  return String(id || "").trim();
}

function normalizeHistoryEntry_(entry) {
  if (entry == null) return null;
  if (typeof entry === "string") {
    var text = String(entry).trim();
    if (!text) return null;
    var idx = text.indexOf("：");
    if (idx < 0) idx = text.indexOf(":");
    if (idx > 0) {
      return {
        time: text.slice(0, idx).trim(),
        status: text.slice(idx + 1).trim(),
        note: ""
      };
    }
    return { time: "", status: text, note: "" };
  }
  if (typeof entry !== "object") return null;
  return {
    time: normalizeSheetDateValue_(entry.time || entry.updated || entry.date || ""),
    status: String(entry.status || entry.state || "").trim(),
    note: String(entry.note || entry.remark || "").trim()
  };
}

function parsePublicTrackingHistory_(ord) {
  if (!ord) return null;
  var candidates = [
    ord.trackingHistory,
    ord.deliveryHistory,
    ord.historyJson,
    ord.history,
    ord["配送歷程"]
  ];
  for (var i = 0; i < candidates.length; i++) {
    var v = candidates[i];
    if (v == null || v === "") continue;
    if (Array.isArray(v)) {
      var arr = [];
      for (var j = 0; j < v.length; j++) {
        var step = normalizeHistoryEntry_(v[j]);
        if (step && (step.status || step.time)) arr.push(step);
      }
      if (arr.length) return arr;
      continue;
    }
    var s = String(v).trim();
    if (!s) continue;
    try {
      var parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        var list = [];
        for (var k = 0; k < parsed.length; k++) {
          var item = normalizeHistoryEntry_(parsed[k]);
          if (item && (item.status || item.time)) list.push(item);
        }
        if (list.length) return list;
      }
    } catch (parseErr) {
      // 非 JSON，保留原文字串給前端 normalizeHistory 解析
      return s;
    }
    return s;
  }
  return null;
}

function mapPublicStatusItemCode_(label) {
  var text = String(label || "").trim();
  if (/已出貨|已寄出|已到貨|配送中|賣貨便|7-11/.test(text)) return "shipped";
  return "pending";
}

function mapPublicStatusItem_(it) {
  var o = it || {};
  var label = String(o.shipStatus || o.itemStatus || o.status || "待出貨").trim() || "待出貨";
  var name = String(o.lineName || o.name || o.product || "").trim();
  var image = String(o.image || o.imageUrl || "").trim();
  return {
    name: name || "商品",
    image: image,
    itemStatus: label,
    itemStatusCode: mapPublicStatusItemCode_(label)
  };
}

function buildPublicItemSummary_(items) {
  var total = (items || []).length;
  var shipped = 0;
  for (var i = 0; i < total; i++) {
    if (items[i].itemStatusCode === "shipped") shipped++;
  }
  return {
    total: total,
    shipped: shipped,
    pending: Math.max(total - shipped, 0)
  };
}

function buildOrderProductText_(ord, items) {
  if (items && items.length) {
    var names = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].name) names.push(items[i].name);
    }
    if (names.length) return names.join("\n");
  }
  return String((ord && ord.product) || "").trim();
}

function sanitizePublicOrderNote_(ord) {
  return String((ord && (ord.remark || ord["備註"])) || "").trim();
}

function derivePublicTrackingStatus_(ord, items) {
  var parsed = parsePublicTrackingHistory_(ord);
  if (Array.isArray(parsed) && parsed.length) {
    return String(parsed[0].status || "").trim() || "狀態更新";
  }
  var shipped = 0;
  for (var i = 0; i < (items || []).length; i++) {
    if (items[i].itemStatusCode === "shipped") shipped++;
  }
  if (items && items.length && shipped === items.length) return "已出貨";
  if (shipped > 0) return "部分已出貨";
  var st = String(ord && ord.status || "").trim();
  if (st === "已完成") return "已出貨";
  if (st === "出貨中") return "集運中";
  if (st === "已確認") return "已採購";
  if (st === "待處理") return "訂單成立";
  return st || "訂單成立";
}

function buildSyntheticTrackingHistory_(ord, items) {
  var steps = [];
  var orderDate = normalizeSheetDateValue_(ord && ord.date);
  if (orderDate) {
    steps.push({ time: orderDate, status: "訂單成立", note: "" });
  }
  var preorderDate = normalizeSheetDateValue_(ord && ord.preorderDate);
  if (preorderDate) {
    steps.push({ time: preorderDate, status: "預購/採購中", note: "" });
  }
  if (items && items.length) {
    var lines = [];
    for (var i = 0; i < items.length; i++) {
      lines.push(items[i].name + "：" + (items[i].itemStatus || "待出貨"));
    }
    steps.push({
      time: normalizeSheetDateValue_(ord.updated || ord.shipDate || ord.date) || orderDate || "",
      status: lines.join("\n"),
      note: ""
    });
  }
  var orderStatus = String(ord && ord.status || "").trim();
  if (orderStatus && orderStatus !== "待處理") {
    var mapped = orderStatus;
    if (orderStatus === "出貨中") mapped = "集運中";
    if (orderStatus === "已完成") mapped = "已出貨";
    steps.push({
      time: normalizeSheetDateValue_(ord.updated || ord.shipDate || ord.date) || orderDate || "",
      status: mapped,
      note: ""
    });
  }
  var shipDate = normalizeSheetDateValue_(ord && ord.shipDate);
  if (shipDate) {
    steps.push({ time: shipDate, status: "已出貨", note: "" });
  }
  var depositRemark = String(ord && ord.depositRemark || "").trim();
  if (depositRemark) {
    steps.push({
      time: orderDate || "",
      status: "收訂金紀錄",
      note: depositRemark
    });
  }
  return steps;
}

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