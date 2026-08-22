/**
 * PetFBI board — Google Apps Script web app
 * ------------------------------------------------------------------
 * Bind this to a Google Sheet (Extensions ▸ Apps Script), set SECRET,
 * then Deploy ▸ New deployment ▸ Web app (Execute as: Me, Access: Anyone).
 * Paste the resulting /exec URL + the SECRET into the engine's PetFBI panel.
 * Every admin who pastes the SAME url+secret shares ONE board.
 *
 * The sheet needs a tab named "Board" with this header row in row 1:
 *   id | title | petType | status | link | mapUrl | notes | claimedBy | postedBy | ts | claimedAt | postedAt
 * (Run setupSheet() once from the editor to create it.)
 *
 * Claims are atomic across all admins via LockService — that's what stops
 * two people from posting the same report.
 */

var SECRET = "CHANGE-ME";          // <-- set this; must match what admins paste
var SHEET_NAME = "Board";
var HEADERS = ["id", "title", "petType", "status", "link", "mapUrl", "notes", "claimedBy", "postedBy", "ts", "claimedAt", "postedAt"];

function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  sh.clear();
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sh.setFrozenRows(1);
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function _sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}
function _readAll() {
  var sh = _sheet();
  var rng = sh.getDataRange().getValues();
  if (rng.length < 2) return [];
  var out = [];
  for (var i = 1; i < rng.length; i++) {
    var row = rng[i];
    if (!row[0]) continue;
    var o = {};
    for (var c = 0; c < HEADERS.length; c++) o[HEADERS[c]] = row[c];
    o._row = i + 1;
    out.push(o);
  }
  return out;
}
function _writeRow(rowIndex, obj) {
  var sh = _sheet();
  var vals = [];
  for (var c = 0; c < HEADERS.length; c++) vals.push(obj[HEADERS[c]] != null ? obj[HEADERS[c]] : "");
  sh.getRange(rowIndex, 1, 1, HEADERS.length).setValues([vals]);
}
function _clean(o) { var c = {}; for (var i = 0; i < HEADERS.length; i++) c[HEADERS[i]] = o[HEADERS[i]]; return c; }

function doGet(e) {
  var p = e && e.parameter ? e.parameter : {};
  if (String(p.secret || "") !== SECRET) return _json({ ok: false, error: "bad secret" });
  if (p.action === "list" || !p.action) {
    var reports = _readAll().map(_clean).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    return _json({ ok: true, reports: reports });
  }
  return _json({ ok: false, error: "unknown action" });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return _json({ ok: false, error: "bad json" }); }
  if (String(body.secret || "") !== SECRET) return _json({ ok: false, error: "bad secret" });

  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (err) { return _json({ ok: false, error: "busy, try again" }); }
  try {
    var action = body.action;
    var sh = _sheet();

    if (action === "add") {
      if (!body.title) return _json({ ok: false, error: "title required" });
      var id = "rep_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e6).toString(36);
      var rec = { id: id, title: body.title, petType: body.petType || "", status: "new", link: body.link || "", mapUrl: body.mapUrl || "", notes: body.notes || "", claimedBy: "", postedBy: "", ts: Date.now(), claimedAt: "", postedAt: "" };
      var vals = HEADERS.map(function (h) { return rec[h]; });
      sh.appendRow(vals);
      return _json({ ok: true, report: rec });
    }

    var all = _readAll();
    var r = null;
    for (var i = 0; i < all.length; i++) if (all[i].id === body.id) { r = all[i]; break; }
    if (!r) return _json({ ok: false, error: "report not found" });

    if (action === "claim") {
      var who = String(body.who || "").trim() || "someone";
      if (r.status === "posted") return _json({ ok: false, error: "already posted by " + (r.postedBy || "?") });
      if (r.status === "claimed" && r.claimedBy && r.claimedBy !== who) return _json({ ok: false, error: "already claimed by " + r.claimedBy, claimedBy: r.claimedBy });
      r.status = "claimed"; r.claimedBy = who; r.claimedAt = Date.now(); _writeRow(r._row, r);
      return _json({ ok: true, report: _clean(r) });
    }
    if (action === "unclaim") {
      if (r.status === "posted") return _json({ ok: false, error: "already posted" });
      r.status = "new"; r.claimedBy = ""; r.claimedAt = ""; _writeRow(r._row, r);
      return _json({ ok: true, report: _clean(r) });
    }
    if (action === "posted") {
      r.status = "posted"; r.postedBy = String(body.who || r.claimedBy || "").trim() || "someone"; r.postedAt = Date.now(); _writeRow(r._row, r);
      return _json({ ok: true, report: _clean(r) });
    }
    if (action === "update") {
      ["title", "petType", "link", "mapUrl", "notes"].forEach(function (k) { if (body[k] != null) r[k] = String(body[k]); });
      _writeRow(r._row, r);
      return _json({ ok: true, report: _clean(r) });
    }
    if (action === "remove") {
      _sheet().deleteRow(r._row);
      return _json({ ok: true });
    }
    return _json({ ok: false, error: "unknown action '" + action + "'" });
  } finally {
    lock.releaseLock();
  }
}
