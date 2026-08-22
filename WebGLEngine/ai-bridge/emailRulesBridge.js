// ai-bridge/emailRulesBridge.js — v1122
// Generic, Excel-driven email rule engine (purpose-neutral generalization of the
// PetFBI routing). Reads incoming Outlook mail, runs each through email_rules.py
// against the workbook's "EmailRules" sheet, and sends the templated actions via
// the same mailer transport PetFBI uses. The workbook is the portable source of
// truth: edit rules locally, hand the .xlsx to another machine, same behaviour.

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const outlook = require("./outlook.js");
const gmail = require("./gmailBridge.js");   // v1865 — optional Gmail source (additive; Outlook untouched)
const mailer = require("./mailer.js");
const petfbi = require("./petfbiBridge.js");   // reuse the configured mailer transport

let VENV_PY = ""; try { VENV_PY = require("./camoufoxBridge.js").VENV_PY || ""; } catch {}
const SCRIPT = process.env.EMAIL_RULES || path.join(__dirname, "scrapers", "email_rules.py");
const CFG = process.env.EMAIL_RULES_CONFIG || path.join(os.homedir(), ".voxelbridge", "emailrules.json");
const SEEN = process.env.EMAIL_RULES_SEEN || path.join(__dirname, "emailrules-seen.json");
// v1141 — fired-actions audit log + review-before-send approval queue
const LOG = path.join(os.homedir(), ".voxelbridge", "emailrules-log.json");
const PENDING = path.join(os.homedir(), ".voxelbridge", "emailrules-pending.json");
function _readArr(p) { try { const a = JSON.parse(fs.readFileSync(p, "utf8")); return Array.isArray(a) ? a : []; } catch { return []; } }
function _writeArr(p, a) { try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(a)); } catch {} }
function _appendLog(entry) { const a = _readArr(LOG); a.push(Object.assign({ ts: Date.now() }, entry)); if (a.length > 500) a.splice(0, a.length - 500); _writeArr(LOG, a); }
function getLog(n) { const a = _readArr(LOG); return { ok: true, count: a.length, entries: a.slice(-(parseInt(n, 10) || 100)).reverse() }; }
function listPending() { return { ok: true, pending: _readArr(PENDING) }; }
function rejectPending(id) { const a = _readArr(PENDING).filter(x => x.id !== id); _writeArr(PENDING, a); _appendLog({ rule: "(approval)", action: "rejected", id, result: "rejected" }); return { ok: true }; }
async function approvePending(id) {
    const a = _readArr(PENDING); const item = a.find(x => x.id === id);
    if (!item) return { ok: false, error: "not found" };
    let res;
    if (item.kind === "petfbi") { try { res = await petfbi.chainFromEmail(item.em, { add: true, send: true }); } catch (e) { res = { ok: false, error: e.message }; } }
    else { try { res = await mailer.send(petfbi.mailerCfg(), item.msg); } catch (e) { res = { ok: false, error: e.message }; } }
    _writeArr(PENDING, a.filter(x => x.id !== id));
    _appendLog({ rule: item.rule, action: item.kind === "petfbi" ? "petfbi" : "send", to: item.msg && item.msg.to, subject: item.msg && item.msg.subject, from: item.from, result: (res && res.ok) ? "sent (approved)" : ("failed: " + ((res && res.error) || "?")) });
    return { ok: !!(res && res.ok), result: res };
}

const DEFAULTS = { rulesXls: "", sheet: "EmailRules", intervalSec: 120, n: 10, send: false, onlyUnread: true, markRead: false, approval: false, goForwardTs: 0, source: "outlook" };   // v1865 — source: outlook | gmail | both
function loadCfg() { try { if (fs.existsSync(CFG)) return Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(CFG, "utf8"))); } catch {} return { ...DEFAULTS }; }
function saveCfg(c) { try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(c, null, 2), { mode: 0o600 }); } catch {} }
function setConfig(d) {
    d = d || {}; const c = loadCfg();
    for (const k of ["rulesXls", "sheet"]) if (d[k] != null) c[k] = String(d[k]).trim();
    for (const k of ["intervalSec", "n"]) if (d[k] != null) c[k] = Math.max(1, parseInt(d[k], 10) || DEFAULTS[k]);
    for (const k of ["send", "onlyUnread", "markRead", "approval"]) if (d[k] != null) c[k] = !!d[k];
    if (d.source != null) { const s = String(d.source).toLowerCase(); if (["outlook", "gmail", "both"].includes(s)) c.source = s; }   // v1865
    if (c.intervalSec < 20) c.intervalSec = 20;
    saveCfg(c); return status();
}
function status() { const c = loadCfg(); const _p = c.rulesXls || ""; let _exists = false; try { _exists = !!_p && fs.existsSync(_p) && fs.statSync(_p).isFile(); } catch {} return { ok: true, rulesXls: _p, exists: _exists, sheet: c.sheet || "EmailRules", configured: !!c.rulesXls, intervalSec: c.intervalSec, n: c.n, send: !!c.send, onlyUnread: c.onlyUnread !== false, markRead: !!c.markRead, approval: !!c.approval, goForwardTs: c.goForwardTs || 0, source: c.source || "outlook", on: !!_timer, seenCount: Object.keys(_seen).length }; }

// v1584 — "only act on mail from now on": records a cutoff timestamp AND primes the seen-list
// with every message currently in the inbox, so existing mail is left untouched and only
// messages arriving after this moment get processed. Turning it off clears the cutoff (already
// processed/seen messages stay seen).
async function setGoForward(on) {
    const c = loadCfg();
    if (on) {
        c.goForwardTs = Date.now(); saveCfg(c);
        let primed = 0;
        try {
            const lst = await outlook.list(Math.max(50, c.n || 10));
            for (const em of ((lst && lst.messages) || [])) { if (em && em.entryId) { _seen[em.entryId] = Date.now(); primed++; } }
            _saveSeen();
        } catch (e) {}
        return { ok: true, goForward: true, since: c.goForwardTs, primed };
    }
    delete c.goForwardTs; saveCfg(c);
    return { ok: true, goForward: false };
}

function _py() { return (VENV_PY && fs.existsSync(VENV_PY)) ? VENV_PY : (process.platform === "win32" ? "python" : "python3"); }
function _run(args, stdin) {
    return new Promise((resolve) => {
        let out = "", err = "", done = false, child;
        const t = setTimeout(() => { if (done) return; done = true; try { child && child.kill("SIGKILL"); } catch {} resolve({ ok: false, error: "rules timeout" }); }, 30000);
        try { child = spawn(_py(), [SCRIPT, ...args], { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ ok: false, error: "spawn: " + e.message }); }
        if (stdin != null) { try { child.stdin.write(stdin); child.stdin.end(); } catch {} }
        child.stdout.on("data", d => out += d);
        child.stderr.on("data", d => err += d);
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, error: String(e && e.message) }); });
        child.on("close", () => { if (done) return; done = true; clearTimeout(t); const line = (out.trim().split(/\r?\n/).pop() || "").trim(); try { resolve(JSON.parse(line)); } catch { resolve({ ok: false, error: "no JSON from rules engine", stderr: err.slice(0, 300), raw: out.slice(0, 300) }); } });
    });
}

function listRules() { const c = loadCfg(); if (!c.rulesXls) return Promise.resolve({ ok: false, error: "no rules workbook configured" }); return _run(["--rules-xls", c.rulesXls, "--sheet", c.sheet || "EmailRules", "--list-rules"]); }
function apply(email) { const c = loadCfg(); if (!c.rulesXls) return Promise.resolve({ ok: false, error: "no rules workbook configured" }); return _run(["--rules-xls", c.rulesXls, "--sheet", c.sheet || "EmailRules"], JSON.stringify(email || {})); }

let _seen = {}; try { if (fs.existsSync(SEEN)) _seen = JSON.parse(fs.readFileSync(SEEN, "utf8")) || {}; } catch {}
function _saveSeen() { try { const k = Object.keys(_seen); if (k.length > 1000) { const tr = {}; k.sort((a, b) => _seen[b] - _seen[a]).slice(0, 800).forEach(x => tr[x] = _seen[x]); _seen = tr; } fs.writeFileSync(SEEN, JSON.stringify(_seen)); } catch {} }

let _timer = null;
let _newMailHook = null;
function setNewMailHook(fn) { _newMailHook = (typeof fn === "function") ? fn : null; }   // v1362 — Ball newEmail trigger
let _peerScanHook = null;
function setPeerScanHook(fn) { _peerScanHook = (typeof fn === "function") ? fn : null; }   // v1929 — peer-announce email scan
async function processInbox(opts = {}) {
    const c = loadCfg();
    const send = opts.send !== undefined ? opts.send : c.send;
    const onlyUnread = opts.onlyUnread !== undefined ? opts.onlyUnread : c.onlyUnread !== false;
    // v1865 — pull from the configured source(s). Outlook and/or Gmail, merged into one list.
    // Each message carries a .source so mark-read routes back to the right mailbox.
    const source = (opts.source || c.source || "outlook");
    const n = opts.n || c.n || 10;
    let msgs = [];
    let anyOk = false, srcErr = "";
    if (source === "outlook" || source === "both") {
        const lo = await outlook.list(n);
        if (lo && lo.ok) { anyOk = true; for (const m of (lo.messages || [])) { m.source = "outlook"; msgs.push(m); } }
        else srcErr = (lo && lo.error) || "outlook list failed";
    }
    if (source === "gmail" || source === "both") {
        const lg = await gmail.listMessages(n);
        if (lg && lg.ok) { anyOk = true; for (const m of (lg.messages || [])) { m.source = "gmail"; msgs.push(m); } }
        else srcErr = srcErr ? (srcErr + "; gmail: " + ((lg && lg.error) || "?")) : ("gmail: " + ((lg && lg.error) || "list failed"));
    }
    if (!anyOk) return { ok: false, step: source, error: srcErr || "no mail source available" };
    const lst = { ok: true, messages: msgs };
    const results = [];
    for (const em of (lst.messages || [])) {
        if (!em.entryId) continue;
        if (onlyUnread && em.unread === false) continue;
        if (c.goForwardTs && em.received) { const _t = Date.parse(em.received); if (!isNaN(_t) && _t < c.goForwardTs) { results.push({ entryId: em.entryId, subject: em.subject, skipped: "before go-forward cutoff" }); continue; } }   // v1584
        if (_seen[em.entryId] && !opts.dryRun) { results.push({ entryId: em.entryId, subject: em.subject, skipped: "already processed" }); continue; }
        try { if (_peerScanHook && !opts.dryRun) _peerScanHook({ from: em.from, fromName: em.fromName, subject: em.subject, body: em.body }); } catch {}   // v1929 — peer-announce email gate
        const r = await apply({ entryId: em.entryId, from: em.from, fromName: em.fromName, subject: em.subject, body: em.body, received: em.received, hasAttachment: em.hasAttachment });
        const acts = (r && r.ok && r.actions) || [];
        let sent = 0, queued = 0;
        const approval = (opts.approval !== undefined ? opts.approval : c.approval);
        if (!opts.dryRun) {
            for (const a of acts) {
                if (["email", "forward", "reply"].includes(a.action) && Array.isArray(a.to) && a.to.length && send) {
                    const msg = { to: a.to, cc: a.cc, subject: a.subject, body: a.body };
                    if (approval) { const item = { id: "pend_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind: "mail", rule: a.rule, from: em.from, msg, ts: Date.now() }; const p = _readArr(PENDING); p.push(item); _writeArr(PENDING, p); queued++; _appendLog({ rule: a.rule, action: a.action, to: a.to, subject: a.subject, from: em.from, result: "queued for approval" }); }
                    else { let m; try { m = await mailer.send(petfbi.mailerCfg(), msg); } catch (e) { m = { ok: false, error: e.message }; } if (m && m.ok) sent++; _appendLog({ rule: a.rule, action: a.action, to: a.to, subject: a.subject, from: em.from, result: (m && m.ok) ? "sent" : ("failed: " + ((m && m.error) || "?")) }); }
                } else if (a.action === "petfbi" && send) {
                    if (approval) { const item = { id: "pend_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind: "petfbi", rule: a.rule, from: em.from, em, ts: Date.now() }; const p = _readArr(PENDING); p.push(item); _writeArr(PENDING, p); queued++; _appendLog({ rule: a.rule, action: "petfbi", from: em.from, subject: em.subject, result: "queued for approval" }); }
                    else { let pr; try { pr = await petfbi.chainFromEmail(em, { add: true, send: true }); } catch (e) { pr = { ok: false, error: e.message }; } if (pr && pr.ok) sent++; _appendLog({ rule: a.rule, action: "petfbi", from: em.from, subject: em.subject, result: (pr && pr.ok) ? "chained" : ("failed: " + ((pr && pr.error) || "?")) }); }
                }
            }
            _seen[em.entryId] = Date.now();
            if ((opts.markRead !== undefined ? opts.markRead : c.markRead) && acts.length) { try { if (em.source === "gmail") { await gmail.markSeen(em.entryId); } else { await outlook.markRead(em.entryId); } } catch {} }
        }
        results.push({ entryId: em.entryId, from: em.from, subject: em.subject, matched: acts.length, actions: acts.map(a => ({ rule: a.rule, to: a.to, subject: a.subject })), sent, queued, dryRun: !!opts.dryRun, error: (r && !r.ok) ? r.error : undefined });
    }
    if (!opts.dryRun) _saveSeen();
    try { if (_newMailHook && !opts.dryRun) { const fresh = results.filter(r => !r.skipped).length; if (fresh > 0) _newMailHook(fresh, results); } } catch {}   // v1362
    return { ok: true, scanned: (lst.messages || []).length, processed: results.length, results };
}

function autoPoll(d = {}) {
    if (Object.keys(d).some(k => k in DEFAULTS)) setConfig(d);
    const c = loadCfg();
    if (d.on === false) { if (_timer) clearInterval(_timer); _timer = null; return { ok: true, on: false, cfg: status() }; }
    if (d.on === true) {
        if (_timer) clearInterval(_timer);
        _timer = setInterval(() => { processInbox({}).catch(() => {}); }, (c.intervalSec || 120) * 1000);
        processInbox({}).catch(() => {});
        return { ok: true, on: true, cfg: status() };
    }
    return { ok: true, on: !!_timer, cfg: status() };
}
function forgetSeen() { _seen = {}; _saveSeen(); return { ok: true }; }

// v1123 — write/create the rules workbook (openpyxl -> .xlsx). rules = array of
// row objects; opts.path overrides the configured workbook. On success the config
// is repointed at the written path (handles .xls -> .xlsx coercion).
function writeRules(rules, opts = {}) {
    const c = loadCfg();
    const target = (opts.path || c.rulesXls || "").trim();
    if (!target) return Promise.resolve({ ok: false, error: "no workbook path \u2014 set one in the Email Rules tab first" });
    return _run(["--rules-xls", target, "--sheet", c.sheet || "EmailRules", "--write"], JSON.stringify(Array.isArray(rules) ? rules : []))
        .then(r => { if (r && r.ok && r.path) { const cc = loadCfg(); cc.rulesXls = r.path; saveCfg(cc); } return r; });
}
// v1133 — first-use workbook: when no path is given and none is configured, the
// engine picks a visible default, creates the folder, and points the config at it,
// so "Create & use" works in one click (like Geek + admins keep a live workbook).
function _defaultWorkbookPath() {
    const dir = path.join(os.homedir(), "SweKEngine");
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    return path.join(dir, "EmailRules.xlsx");
}
function newTemplate(path_) {
    const target = (path_ || loadCfg().rulesXls || _defaultWorkbookPath());
    try { fs.mkdirSync(path.dirname(target), { recursive: true }); } catch {}
    const rules = [
        { Enabled: "TRUE", Name: "Example: forward reports", MatchSubject: "report", Action: "forward", To: "team@example.org" },
        { Enabled: "TRUE", Name: "Example: urgent to on-call", MatchAny: "/urgent|asap|emergency/i", Action: "email", To: "oncall@example.org", Subject: "URGENT: {subject}", Body: "{body}" },
        { Enabled: "FALSE", Name: "Example: auto-reply", MatchFrom: "client@", Action: "reply", Body: "Thanks {fromName}, we received \"{subject}\" on {date}." },
    ];
    return writeRules(rules, { path: target });
}
// v1133 — CSV export of the live rules (an easy Office / Power Automate on-ramp; flows
// ingest CSV cleanly). Writes next to the workbook unless a path is given.
function exportCsv(destPath) {
    return listRules().then(r => {
        if (!r || !r.ok) return r || { ok: false, error: "could not read rules" };
        const rules = r.rules || [];
        const cols = []; const seen = new Set();
        for (const ru of rules) for (const k of Object.keys(ru)) if (!seen.has(k)) { seen.add(k); cols.push(k); }
        const esc = (v) => { const s = (v == null ? "" : String(v)); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        const lines = [cols.map(esc).join(",")];
        for (const ru of rules) lines.push(cols.map(c => esc(ru[c])).join(","));
        const csv = lines.join("\r\n");
        const c = loadCfg();
        const out = destPath || (c.rulesXls ? c.rulesXls.replace(/\.[^.]+$/, "") + "_export.csv" : path.join(os.homedir(), "SweKEngine", "EmailRules_export.csv"));
        try { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, csv, "utf8"); }
        catch (e) { return { ok: false, error: "write failed: " + e.message, csv }; }
        return { ok: true, path: out, rows: rules.length, csv };
    });
}

// v1582 — Python runtime helpers. Email Rules needs Python 3 + openpyxl to
// create/list/run the workbook. These let the UI show what's missing and offer
// to install it (openpyxl is a one-click pip install; Python is winget on
// Windows / Homebrew on macOS, with a python.org download link as the fallback).
const PY_DOWNLOAD = process.platform === "win32" ? "https://www.python.org/downloads/windows/"
    : process.platform === "darwin" ? "https://www.python.org/downloads/macos/"
        : "https://www.python.org/downloads/";
function _exec(cmd, args, timeoutMs) {
    return new Promise((resolve) => {
        let out = "", err = "", done = false, child;
        const t = setTimeout(() => { if (done) return; done = true; try { child && child.kill("SIGKILL"); } catch {} resolve({ ok: false, error: "timeout", out, err }); }, timeoutMs || 8000);
        try { child = spawn(cmd, args, { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ ok: false, error: String(e && e.message), out: "", err: "" }); }
        child.stdout && child.stdout.on("data", d => out += d);
        child.stderr && child.stderr.on("data", d => err += d);
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, error: String(e && e.message), out, err }); });
        child.on("close", code => { if (done) return; done = true; clearTimeout(t); resolve({ ok: code === 0, code, out: out.trim(), err: err.trim() }); });
    });
}
async function probe() {
    const py = _py();
    const ver = await _exec(py, ["--version"], 8000);          // some builds print --version to stderr
    const hasPy = ver.ok;
    const pythonVer = hasPy ? ((ver.out || ver.err || "").replace(/^Python\s*/i, "").trim()) : "";
    let pandas = false, pandasVer = "", openpyxl = false, openpyxlVer = "";
    if (hasPy) {
        const p = await _exec(py, ["-c", "import pandas,sys; sys.stdout.write(pandas.__version__)"], 15000); pandas = p.ok; pandasVer = p.ok ? p.out.trim() : "";
        const o = await _exec(py, ["-c", "import openpyxl,sys; sys.stdout.write(openpyxl.__version__)"], 10000); openpyxl = o.ok; openpyxlVer = o.ok ? o.out.trim() : "";
    }
    const missing = hasPy ? [].concat(pandas ? [] : ["pandas"], openpyxl ? [] : ["openpyxl"]) : [];
    return { ok: true, py, python: hasPy, pythonVer, pandas, pandasVer, openpyxl, openpyxlVer, missing, ready: hasPy && pandas && openpyxl, platform: process.platform, downloadUrl: PY_DOWNLOAD };
}
async function installDeps() {
    const py = _py();
    const check = await _exec(py, ["--version"], 8000);
    if (!check.ok) return { ok: false, error: "Python isn't installed yet — install Python first.", downloadUrl: PY_DOWNLOAD };
    const r = await _exec(py, ["-m", "pip", "install", "--user", "pandas", "openpyxl"], 600000);   // pandas wheels can take a while
    return { ok: r.ok, log: ((r.out || "") + (r.err ? ("\n" + r.err) : "")).slice(-1500), error: r.ok ? undefined : ((r.err || r.error || "pip failed").slice(-400)) };
}
async function installPython() {
    if (process.platform === "win32") {
        const r = await _exec("winget", ["install", "-e", "--id", "Python.Python.3.12", "--accept-source-agreements", "--accept-package-agreements"], 360000);
        return { ok: r.ok, via: "winget", downloadUrl: PY_DOWNLOAD, log: ((r.out || "") + (r.err ? ("\n" + r.err) : "")).slice(-1200), error: r.ok ? undefined : "winget couldn't install Python (it may not be present). Use the download link instead — and restart the bridge after installing." };
    }
    if (process.platform === "darwin") {
        const r = await _exec("brew", ["install", "python"], 360000);
        return { ok: r.ok, via: "brew", downloadUrl: PY_DOWNLOAD, log: ((r.out || "") + (r.err ? ("\n" + r.err) : "")).slice(-1200), error: r.ok ? undefined : "Homebrew isn't available. Use the download link instead — and restart the bridge after installing." };
    }
    return { ok: false, via: "none", downloadUrl: PY_DOWNLOAD, error: "Auto-install isn't supported on this platform. Install Python 3 with your package manager, then restart the bridge." };
}

// v1671 — cheap combined snapshot for the server.html email-rules gauges (all in-memory / small file reads, safe to
// poll). seen = inbox messages the poller has tracked; pending = actions awaiting approval; fired = actions taken.
function stats() {
    const c = loadCfg();
    return {
        ok: true,
        seen: Object.keys(_seen).length,
        pending: _readArr(PENDING).length,
        fired: _readArr(LOG).filter((e) => e && e.result !== "rejected").length,
        on: !!_timer, configured: !!c.rulesXls,
    };
}

module.exports = { setConfig, status, stats, listRules, apply, processInbox, autoPoll, setNewMailHook, setPeerScanHook, forgetSeen, writeRules, newTemplate, exportCsv, getLog, listPending, approvePending, rejectPending, probe, installDeps, installPython, setGoForward };
