// ai-bridge/petfbiBridge.js — v956
// PetFBI shared posting board with a PLUGGABLE storage backend:
//   - "local"  → petfbi-board.json on this bridge (default; single-machine)
//   - "sheet"  → a Google Apps Script web app bound to a shared Google Sheet
//                (true multi-admin shared state; atomic claims via the script's
//                 LockService). See PetFBI/google-sheets/Code.gs + README.
//
// Sheet config (web-app URL + shared secret) lives in ~/.voxelbridge/petfbi.json
// — OUTSIDE the project tree, so packaging the engine never leaks it. Every
// admin pastes the same owner-provided URL+secret; their bridges then share one
// board. All public functions are async (the sheet path is an HTTP round-trip);
// the local path resolves immediately.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
let VENV_PY = ""; try { VENV_PY = require("./camoufoxBridge.js").VENV_PY || ""; } catch {}
const ASSEMBLE_SCRIPT = process.env.PETFBI_ASSEMBLE || path.join(__dirname, "scrapers", "petfbi_assemble.py");
const PETFBI_XLS = process.env.PETFBI_XLS || "";   // optional: point at Geek's R_clean.xls to drive tags/templates from Excel
const PETFBI_GROUPS_XLS = process.env.PETFBI_GROUPS_XLS || "";   // v1020 — groups source (defaults to PETFBI_XLS; same R_clean.xls holds the <STATE> Pages sheets)
const PETFBI_ADMINS_XLS = process.env.PETFBI_ADMINS_XLS || "";   // v1022 — Admins/Rules source (defaults to the groups xls)
const mailer = require("./mailer.js");
const outlook = require("./outlook.js");   // v1024 — Outlook unread/rules via cscript

// v1019 — run the field-extraction + post assembler (port of R_clean327pms2.py).
// Feeds the grabbed report TEXT on stdin; parses the assembler's one JSON line.
function runAssemble(text, meta) {
    return new Promise((resolve) => {
        const py = (VENV_PY && fs.existsSync(VENV_PY)) ? VENV_PY : (process.platform === "win32" ? "python" : "python3");   // assembler is stdlib-only; venv not required
        const args = [ASSEMBLE_SCRIPT, "--stdin", "--meta", JSON.stringify(meta || {})];
        const wx = petfbiXls();
        if (wx) args.push("--fields-xls", wx);
        const groupsXls = PETFBI_GROUPS_XLS || wx;
        if (groupsXls) args.push("--groups-xls", groupsXls);
        const adminsXls = PETFBI_ADMINS_XLS || wx;
        if (adminsXls) args.push("--admins-xls", adminsXls);
        let out = "", err = "", done = false, child;
        const t = setTimeout(() => { if (done) return; done = true; try { child && child.kill("SIGKILL"); } catch {} resolve({ ok: false, error: "assemble timeout" }); }, 30000);
        try { child = spawn(py, args, { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ ok: false, error: "spawn failed: " + (e && e.message) }); }
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, error: String(e && e.message) }); });
        try { child.stdin.write(text || ""); child.stdin.end(); } catch {}
        child.stdout.on("data", d => { out += d; });
        child.stderr.on("data", d => { err += d; });
        child.on("close", () => {
            if (done) return; done = true; clearTimeout(t);
            const line = (out.trim().split(/\r?\n/).pop() || "").trim();
            try { resolve(JSON.parse(line)); }
            catch { resolve({ ok: false, error: "assembler produced no JSON", stderr: err.slice(0, 400), raw: out.slice(0, 400) }); }
        });
    });
}

// v1024 — dump the Admins sheet (for the per-admin "only my towns" board filter)
function listAdmins() {
    return new Promise((resolve) => {
        const xls = PETFBI_ADMINS_XLS || PETFBI_GROUPS_XLS || petfbiXls();
        if (!xls) return resolve({ ok: false, error: "no admins workbook configured" });
        const py = (VENV_PY && fs.existsSync(VENV_PY)) ? VENV_PY : (process.platform === "win32" ? "python" : "python3");
        let out = "", child, done = false;
        const t = setTimeout(() => { if (done) return; done = true; try { child && child.kill("SIGKILL"); } catch {} resolve({ ok: false, error: "list-admins timeout" }); }, 20000);
        try { child = spawn(py, [ASSEMBLE_SCRIPT, "--list-admins", "--admins-xls", xls], { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ ok: false, error: "spawn failed: " + e.message }); }
        child.stdout.on("data", d => out += d);
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, error: String(e && e.message) }); });
        child.on("close", () => { if (done) return; done = true; clearTimeout(t);
            const line = (out.trim().split(/\r?\n/).pop() || "").trim();
            try { resolve(JSON.parse(line)); } catch { resolve({ ok: false, error: "no JSON from list-admins" }); }
        });
    });
}

// assemble({text, meta, url?, add?}) -> {ok, packet, report?}
// packet = {status,type,name,town,state,zip,post,fields,imageUrl,mapUrl}
async function assemble(d) {
    d = d || {};
    const text = String(d.text || "");
    if (!text) return { ok: false, error: "assemble needs report text (run petfbi_grab first)" };
    const packet = await runAssemble(text, d.meta || {});
    if (!packet || !packet.ok) return packet || { ok: false, error: "assemble failed" };
    if (d.add) {
        const title = [packet.status, packet.type, "-", packet.name].filter(Boolean).join(" ");
        const id = (packet.fields && packet.fields.PETIDNUM) || "";
        const rep = await add({
            title, petType: packet.type,
            link: d.url || (id ? "https://petfbi.org/api/view/" + id : ""),
            mapUrl: packet.mapUrl, notes: packet.post,
            post: packet.post, imageUrl: packet.imageUrl, fields: packet.fields,
            groups: packet.groups || null, routing: packet.routing || null,
            admins: packet.admins || null, email: packet.email || null, suppress: !!packet.suppress,
        });
        return { ok: true, packet, report: rep && rep.report };
    }
    return { ok: true, packet };
}

const BOARD_FILE = process.env.PETFBI_BOARD || path.join(__dirname, "petfbi-board.json");
const COUNTS_FILE = process.env.PETFBI_COUNTS || path.join(__dirname, "petfbi-counts.json");   // v1021 — cached email counts (Transmitter parity)
const CONFIG = process.env.PETFBI_CONFIG || path.join(os.homedir(), ".voxelbridge", "petfbi.json");

// ---- config (storage mode) ----
function loadConfig() { try { if (fs.existsSync(CONFIG)) return JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch {} return { mode: "local" }; }
function saveConfig(c) { try { fs.mkdirSync(path.dirname(CONFIG), { recursive: true }); fs.writeFileSync(CONFIG, JSON.stringify(c), { mode: 0o600 }); return true; } catch (e) { console.warn("[petfbi] config save failed:", e.message); return false; } }
function setConfig(d) {
    d = d || {};
    const c = loadConfig();
    if (d.sheetUrl != null) c.sheetUrl = String(d.sheetUrl).trim();
    if (d.secret != null) c.secret = String(d.secret);
    if (d.mode) c.mode = (d.mode === "sheet" || d.mode === "sharepoint") ? d.mode : "local";  // v961 — sharepoint = same HTTP+secret contract (Power Automate flow)
    if (d.clear) { c.sheetUrl = ""; c.secret = ""; c.mode = "local"; }
    if (!c.sheetUrl) c.mode = "local";
    saveConfig(c);
    return status();
}
function status() { const c = loadConfig(); const live = c.sheetUrl && c.mode !== "local"; return { ok: true, mode: live ? c.mode : "local", sheetConfigured: !!c.sheetUrl, sheetUrl: c.sheetUrl ? c.sheetUrl.replace(/(.{40}).+/, "$1…") : "" }; }
function useSheet() { const c = loadConfig(); return !!(c.sheetUrl && c.mode !== "local"); }

// ---- sheet backend (Apps Script web app) ----
async function sheetCall(payload, isList) {
    const c = loadConfig();
    if (!c.sheetUrl) return { ok: false, error: "no sheet configured" };
    try {
        let resp;
        if (isList) {
            const u = c.sheetUrl + (c.sheetUrl.includes("?") ? "&" : "?") + "action=list&secret=" + encodeURIComponent(c.secret || "");
            resp = await fetch(u, { redirect: "follow" });
        } else {
            resp = await fetch(c.sheetUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ secret: c.secret || "" }, payload)), redirect: "follow" });
        }
        if (!resp.ok) return { ok: false, error: "sheet HTTP " + resp.status };
        return await resp.json();
    } catch (e) { return { ok: false, error: "sheet unreachable: " + (e && e.message) }; }
}

// ---- local backend (petfbi-board.json) ----
let board = { reports: [] };
try { if (fs.existsSync(BOARD_FILE)) { const j = JSON.parse(fs.readFileSync(BOARD_FILE, "utf8")); if (j && Array.isArray(j.reports)) board = j; } } catch (e) { console.warn("[petfbi] board load failed:", e.message); }
let _seq = board.reports.reduce((m, r) => Math.max(m, r._seq || 0), 0);
let counts = { byReport: {}, byAdmin: {}, total: 0 };
try { if (fs.existsSync(COUNTS_FILE)) { const j = JSON.parse(fs.readFileSync(COUNTS_FILE, "utf8")); if (j) counts = Object.assign(counts, j); } } catch {}
function saveCounts() { try { fs.writeFileSync(COUNTS_FILE, JSON.stringify(counts)); return true; } catch { return false; } }
// v1021 — bump cached email counts (per report + per admin) and stamp the report
function markEmailed(id, to) {
    const r = find(id); const list = Array.isArray(to) ? to : (to ? [to] : (r && r.email && r.email.to) || []);
    counts.byReport[id] = (counts.byReport[id] || 0) + 1;
    for (const e of list) counts.byAdmin[e] = (counts.byAdmin[e] || 0) + 1;
    counts.total += 1; saveCounts();
    if (r) { r.emailedCount = counts.byReport[id]; r.emailedAt = Date.now(); save(); }
    return { ok: true, count: counts.byReport[id], total: counts.total };
}
function emailCounts() { return { ok: true, counts }; }
function save() { try { fs.writeFileSync(BOARD_FILE, JSON.stringify(board)); return true; } catch (e) { console.warn("[petfbi] save failed:", e.message); return false; } }
function find(id) { return board.reports.find(r => r.id === id); }

function localList() { return { ok: true, reports: board.reports.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)) }; }
function localAdd(d) {
    d = d || {}; const title = String(d.title || "").trim(); if (!title) return { ok: false, error: "title required" };
    const r = { id: "rep_" + Date.now().toString(36) + "_" + (++_seq), _seq, title, petType: String(d.petType || "").trim(), status: "new", link: String(d.link || "").trim(), mapUrl: String(d.mapUrl || "").trim(), notes: String(d.notes || "").trim(), post: String(d.post || ""), imageUrl: String(d.imageUrl || ""), loc: d.loc || null, fields: d.fields || null, groups: d.groups || null, routing: d.routing || null, admins: d.admins || null, email: d.email || null, emailedCount: 0, claimedBy: null, postedBy: null, ts: Date.now(), claimedAt: 0, postedAt: 0 };
    board.reports.push(r); save(); return { ok: true, report: r };
}
function localClaim(id, who) {
    const r = find(id); if (!r) return { ok: false, error: "report not found" };
    who = String(who || "").trim() || "someone";
    if (r.status === "posted") return { ok: false, error: "already posted by " + (r.postedBy || "?") };
    if (r.status === "claimed" && r.claimedBy && r.claimedBy !== who) return { ok: false, error: "already claimed by " + r.claimedBy, claimedBy: r.claimedBy };
    r.status = "claimed"; r.claimedBy = who; r.claimedAt = Date.now(); save(); return { ok: true, report: r };
}
function localUnclaim(id) { const r = find(id); if (!r) return { ok: false, error: "report not found" }; if (r.status === "posted") return { ok: false, error: "already posted" }; r.status = "new"; r.claimedBy = null; r.claimedAt = 0; save(); return { ok: true, report: r }; }
function localPosted(id, who) { const r = find(id); if (!r) return { ok: false, error: "report not found" }; r.status = "posted"; r.postedBy = String(who || r.claimedBy || "").trim() || "someone"; r.postedAt = Date.now(); save(); return { ok: true, report: r }; }
function localUpdate(id, fields) { const r = find(id); if (!r) return { ok: false, error: "report not found" }; fields = fields || {}; for (const k of ["title", "petType", "link", "mapUrl", "notes", "post", "imageUrl"]) if (fields[k] != null) r[k] = String(fields[k]); for (const k of ["groups", "routing", "fields", "admins", "email", "loc"]) if (fields[k] != null) r[k] = fields[k]; save(); return { ok: true, report: r }; }
function localRemove(id) { const n = board.reports.length; board.reports = board.reports.filter(r => r.id !== id); save(); return { ok: n !== board.reports.length }; }

// ---- v1022: mailer config (in the same petfbi.json) + send ----
function setMailer(d) {
    d = d || {}; const c = loadConfig(); const m = c.mailer || { mode: "draft", smtp: {} };
    if (d.mode) m.mode = ["smtp", "outlook", "draft"].includes(d.mode) ? d.mode : "draft";
    m.smtp = m.smtp || {};
    for (const k of ["host", "port", "user", "from"]) if (d[k] != null) m.smtp[k] = String(d[k]);
    if (d.pass != null) m.smtp.pass = String(d.pass);     // app password — stored 0600 outside the project tree
    if (d.clear) { m.mode = "draft"; m.smtp = {}; }
    c.mailer = m; saveConfig(c); return mailerStatus();
}
function mailerStatus() {
    const m = (loadConfig().mailer) || { mode: "draft", smtp: {} };
    const s = m.smtp || {};
    return { ok: true, mode: m.mode || "draft", smtpUser: s.user || "", smtpHost: s.host || "smtp.gmail.com", smtpReady: !!(s.user && s.pass) };
}
// sendEmail(id) — send the report's composed email via the configured transport, then cache the count
// v1131 — fetch a remote image (pet photo / map) to a temp file so it can be
// attached to the admin email. Returns the path or null.
async function _downloadImage(url, tag) {
    if (!url || !/^https?:\/\//i.test(url)) return null;
    try {
        const r = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: "follow" });
        if (!r.ok) return null;
        const ct = r.headers.get("content-type") || "";
        let ext = "jpg";
        if (/png/.test(ct)) ext = "png"; else if (/gif/.test(ct)) ext = "gif"; else if (/webp/.test(ct)) ext = "webp";
        else { const m = url.split("?")[0].match(/\.(png|jpe?g|gif|webp)$/i); if (m) ext = m[1].toLowerCase().replace("jpeg", "jpg"); }
        const buf = Buffer.from(await r.arrayBuffer());
        if (!buf.length) return null;
        const p = path.join(os.tmpdir(), "petfbi_" + tag + "_" + Date.now() + "." + ext);
        fs.writeFileSync(p, buf);
        return p;
    } catch { return null; }
}

// v1989 — Facebook post kit: the one-click path for volunteers. Downloads the pet
// photo and the map to local files (reusing the same _downloadImage the email kit
// uses) and returns them as data URLs alongside the ready caption + group links, so
// the UI can copy the caption, hand the volunteer both images as ready files to drag
// into Facebook, and open each group's composer. No re-hunting the photo, no map
// screenshot. Falls back gracefully when an image is missing.
async function fbKit(id) {
    const r = find(id);
    if (!r) return { ok: false, error: "report not found" };
    if (!r.post) return { ok: false, error: "assemble this report first (no ready post yet)" };
    const images = [];
    const grab = async (url, name, tag) => {
        const p = await _downloadImage(url, tag); if (!p) return;
        try {
            const buf = fs.readFileSync(p);
            const ext = (p.match(/\\.(png|jpe?g|gif|webp)$/i) || [, "jpg"])[1].toLowerCase();
            const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg";
            if (buf.length && buf.length < 12 * 1024 * 1024) images.push({ name, mime, dataUrl: "data:" + mime + ";base64," + buf.toString("base64"), bytes: buf.length });
        } catch {}
        try { fs.unlinkSync(p); } catch {}
    };
    const nm = (r.fields && (r.fields.NAME || r.fields.name)) || "pet";
    await grab(r.imageUrl, (String(nm).replace(/[^a-z0-9]+/gi, "_").slice(0, 24) || "lost-pet") + "-photo.jpg", "pet");
    await grab(r.mapUrl, "last-seen-map.jpg", "map");
    const groups = (r.groups || []).map(g => ({ name: g.name, url: g.url, kind: g.kind }));
    return { ok: true, caption: r.post, images, groups, imageUrl: r.imageUrl || "", mapUrl: r.mapUrl || "", town: (r.routing && r.routing.town) || r.town || "", state: (r.routing && r.routing.state) || r.state || "" };
}

async function sendEmail(id) {
    const r = find(id);
    if (!r) return { ok: false, error: "report not found" };
    if (!r.email || !(r.email.to || []).length) return { ok: false, error: "no email on this report (assemble it first, with an Admins sheet)" };
    const cfg = (loadConfig().mailer) || { mode: "draft" };
    // v1131 — attach the grabbed pet photo + the downloaded map, and lead the body with
    // the Facebook-ready post so the admin can post it as-is (routing kept below).
    const attachments = [], tmp = [];
    const petImg = await _downloadImage(r.imageUrl, "pet"); if (petImg) { attachments.push({ path: petImg, name: "lost-pet.jpg" }); tmp.push(petImg); }
    const mapImg = await _downloadImage(r.mapUrl, "map"); if (mapImg) { attachments.push({ path: mapImg, name: "last-seen-map.jpg" }); tmp.push(mapImg); }
    const msg = Object.assign({}, r.email);
    if (r.post) msg.body = r.post + (r.email.body && r.email.body !== r.post ? ("\n\n--- routing ---\n" + r.email.body) : "");
    if (attachments.length) msg.attachments = attachments;
    const res = await mailer.send(cfg, msg);
    for (const f of tmp) { try { fs.unlinkSync(f); } catch {} }
    if (res && res.ok) { res.attached = attachments.length; markEmailed(id, r.email.to); }
    return res;
}

// ---- public async API (routes to whichever backend is active) ----
async function list() { if (!useSheet()) return localList(); const c = loadConfig(); return (c.mode === "sharepoint") ? sheetCall({ action: "list" }) : sheetCall(null, true); }
async function add(d) { return useSheet() ? sheetCall(Object.assign({ action: "add" }, d)) : localAdd(d); }
async function claim(id, who) { return useSheet() ? sheetCall({ action: "claim", id, who }) : localClaim(id, who); }
async function unclaim(id, who) { return useSheet() ? sheetCall({ action: "unclaim", id, who }) : localUnclaim(id); }
async function markPosted(id, who) { return useSheet() ? sheetCall({ action: "posted", id, who }) : localPosted(id, who); }
async function update(id, fields) { return useSheet() ? sheetCall(Object.assign({ action: "update", id }, fields)) : localUpdate(id, fields); }
async function remove(id) { return useSheet() ? sheetCall({ action: "remove", id }) : localRemove(id); }

// ---- v1030: full auto-chain — grab → assemble → route → email → board, one call ----
const GRAB_SCRIPT = process.env.PETFBI_GRAB || path.join(__dirname, "scrapers", "petfbi_grab.py");
function runGrab(url) {
    return new Promise((resolve) => {
        const py = (VENV_PY && fs.existsSync(VENV_PY)) ? VENV_PY : (process.platform === "win32" ? "python" : "python3");
        let out = "", err = "", child, done = false;
        const t = setTimeout(() => { if (done) return; done = true; try { child && child.kill("SIGKILL"); } catch {} resolve({ ok: false, error: "grab timeout (is Camoufox up? /camoufox.html)" }); }, 100000);
        try { child = spawn(py, [GRAB_SCRIPT, "--url", url], { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ ok: false, error: "grab spawn: " + e.message }); }
        child.stdout.on("data", d => out += d);
        child.stderr.on("data", d => err += d);
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, error: "grab: " + e.message }); });
        child.on("close", () => { if (done) return; done = true; clearTimeout(t);
            try { resolve(JSON.parse((out || "").trim().split("\n").pop())); }
            catch { resolve({ ok: false, error: ((err || out || "grab returned no JSON; is Camoufox installed?").trim().split("\n").pop() || "").slice(0, 200) }); }
        });
    });
}

// autoChain({url, add}) — paste a report URL, get back the full kit (post + groups
// + routing + admins + email draft), added to the board by default.
async function autoChain(d) {
    d = d || {};
    const url = String(d.url || "").trim();
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: "url must start with http(s)://" };
    const g = await runGrab(url);
    if (!g || !g.ok) return { ok: false, step: "grab", error: (g && g.error) || "grab failed — is Camoufox installed? (/camoufox.html)" };
    const text = g.text || "";
    if (!text.trim()) return { ok: false, step: "grab", error: "grab returned no text for that URL" };
    const r = await assemble({ text, meta: g.meta || {}, url, add: d.add !== false });
    if (r && r.ok) r.grab = { title: g.title || "", images: (g.images || []).length };
    return r;
}

// ---- v1121: email-triggered chain (auto-trigger from Outlook inbox) --------
// The autoChain above starts from a URL. This starts from an incoming Outlook
// email instead: read recent inbox items, feed each to the SAME assemble/route
// path (which reads the workbook for groups/admins/rules), optionally email the
// assigned admins, and remember which emails were processed so they don't repeat.
const SEEN_FILE = process.env.PETFBI_SEEN || path.join(__dirname, "petfbi-seen.json");
let _seen = {};
try { if (fs.existsSync(SEEN_FILE)) _seen = JSON.parse(fs.readFileSync(SEEN_FILE, "utf8")) || {}; } catch {}
function _saveSeen() {
    try {
        const keys = Object.keys(_seen);
        if (keys.length > 1000) { const trimmed = {}; keys.sort((a, b) => _seen[b] - _seen[a]).slice(0, 800).forEach(k => trimmed[k] = _seen[k]); _seen = trimmed; }
        fs.writeFileSync(SEEN_FILE, JSON.stringify(_seen));
    } catch {}
}

let _autoTimer = null;
const _autoCfg = { intervalSec: 120, n: 10, send: false, onlyUnread: true, subjectMatch: "", senderMatch: "" };

// assemble (and optionally send to assigned admins) from one email object
async function chainFromEmail(email, opts = {}) {
    const text = [email.subject || "", email.body || ""].join("\n\n");
    const meta = { sender: email.from || "", senderName: email.fromName || "", subject: email.subject || "", received: email.received || "", source: "outlook" };
    const r = await assemble({ text, meta, add: opts.add !== false });
    if (!r || !r.ok) return { ok: false, step: "assemble", error: (r && r.error) || "assemble failed" };
    let emailed = null;
    if (opts.send && r.report && r.report.id) { try { emailed = await sendEmail(r.report.id); } catch (e) { emailed = { ok: false, error: e.message }; } }
    return { ok: true, packet: r.packet, report: r.report, emailed };
}

// read the inbox and run the chain on new emails that pass the trigger filter
async function processInbox(opts = {}) {
    const n = opts.n || _autoCfg.n;
    const send = opts.send !== undefined ? opts.send : _autoCfg.send;
    const onlyUnread = opts.onlyUnread !== undefined ? opts.onlyUnread : _autoCfg.onlyUnread;
    const subjM = (opts.subjectMatch !== undefined ? opts.subjectMatch : _autoCfg.subjectMatch || "").toLowerCase();
    const sendM = (opts.senderMatch !== undefined ? opts.senderMatch : _autoCfg.senderMatch || "").toLowerCase();
    const lst = await outlook.list(n);
    if (!lst || !lst.ok) return { ok: false, step: "outlook", error: (lst && lst.error) || "outlook list failed" };
    const results = [];
    for (const em of (lst.messages || [])) {
        if (!em.entryId) continue;
        if (onlyUnread && em.unread === false) continue;
        if (subjM && !String(em.subject || "").toLowerCase().includes(subjM)) continue;
        if (sendM && !String(em.from || "").toLowerCase().includes(sendM)) continue;
        if (_seen[em.entryId]) { results.push({ entryId: em.entryId, from: em.from, subject: em.subject, skipped: "already processed" }); continue; }
        if (opts.dryRun) { results.push({ entryId: em.entryId, from: em.from, subject: em.subject, dryRun: true }); continue; }
        const r = await chainFromEmail(em, { add: true, send });
        _seen[em.entryId] = Date.now();
        results.push({ entryId: em.entryId, from: em.from, subject: em.subject, ok: r.ok, reportId: r.report && r.report.id, emailed: !!(r.emailed && r.emailed.ok), error: r.error });
    }
    if (!opts.dryRun) _saveSeen();
    return { ok: true, scanned: (lst.messages || []).length, matched: results.length, results };
}

function autoPoll(d = {}) {
    if (d.intervalSec != null) _autoCfg.intervalSec = Math.max(20, +d.intervalSec || 120);
    if (d.n != null) _autoCfg.n = Math.max(1, +d.n || 10);
    if (d.send != null) _autoCfg.send = !!d.send;
    if (d.onlyUnread != null) _autoCfg.onlyUnread = !!d.onlyUnread;
    if (d.subjectMatch != null) _autoCfg.subjectMatch = String(d.subjectMatch);
    if (d.senderMatch != null) _autoCfg.senderMatch = String(d.senderMatch);
    const want = d.on;
    if (want === false) { if (_autoTimer) clearInterval(_autoTimer); _autoTimer = null; return { ok: true, on: false, cfg: _autoCfg }; }
    if (want === true) {
        if (_autoTimer) clearInterval(_autoTimer);
        _autoTimer = setInterval(() => { processInbox({}).catch(() => {}); }, _autoCfg.intervalSec * 1000);
        processInbox({}).catch(() => {});   // immediate first sweep
        return { ok: true, on: true, cfg: _autoCfg };
    }
    return { ok: true, on: !!_autoTimer, cfg: _autoCfg };   // config-only update
}
function autoStatus() { return { ok: true, on: !!_autoTimer, cfg: _autoCfg, seenCount: Object.keys(_seen).length }; }
function forgetSeen() { _seen = {}; _saveSeen(); return { ok: true }; }
function mailerCfg() { return loadConfig().mailer || { mode: "draft" }; }   // v1122 — shared transport for the generic rule engine

module.exports = { list, add, claim, unclaim, markPosted, update, remove, setConfig, status, assemble, autoChain, chainFromEmail, processInbox, autoPoll, autoStatus, forgetSeen, mailerCfg, markEmailed, emailCounts, setMailer, mailerStatus, sendEmail, fbKit, listAdmins, outlook, BOARD_FILE, COUNTS_FILE, CONFIG, wbStatus, wbInit, wbAddPage, wbAddAdmin, wbListPages, wbListAdmins, wbGetTemplates, wbSetTemplates, wbDelRow, setXlsPath, wbInfo, lookupPageId, petfbiXls };

// ---- v1181 — workbook manager (scrapers/petfbi_workbook.py, openpyxl) ----
// Backs the setup wizard (<STATE> Pages), admin management (Admins), and the
// template editor (Templates) over a single .xlsx the posting pipeline reads.
const WB_SCRIPT = path.join(__dirname, "scrapers", "petfbi_workbook.py");
function wbPath() { try { const c = loadConfig(); if (c.xlsPath) return c.xlsPath; } catch {} return path.join(__dirname, "petfbi-workbook.xlsx"); }
// The workbook the pipeline should actually use: the wizard-configured one wins
// (so assemble/list-admins auto-use it — no env var needed), then env, then the
// default workbook if it exists.
function petfbiXls() {
    try { const c = loadConfig(); if (c.xlsPath && fs.existsSync(c.xlsPath)) return c.xlsPath; } catch {}
    if (PETFBI_XLS && fs.existsSync(PETFBI_XLS)) return PETFBI_XLS;
    try { const d = path.join(__dirname, "petfbi-workbook.xlsx"); if (fs.existsSync(d)) return d; } catch {}
    return PETFBI_XLS || "";
}
// Best-effort Facebook page-ID lookup. FB hides IDs behind login, so this scrapes
// the public page HTML for the common id patterns and returns null if it can't —
// the wizard then asks. Never throws.
async function lookupPageId(input) {
    input = String(input || "").trim();
    if (!input) return { ok: false, error: "no page name or URL" };
    let slug = input; const m = input.match(/facebook\.com\/([^/?#]+)/i); if (m) slug = m[1];
    slug = slug.replace(/^@/, "").replace(/\/+$/, "");
    if (/^\d{5,}$/.test(slug)) return { ok: true, pageId: slug, via: "as-entered" };
    const urls = ["https://www.facebook.com/" + slug, "https://www.facebook.com/" + slug + "/about_profile_transparency", "https://m.facebook.com/" + slug];
    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const pats = [/"pageID":"(\d{5,})"/, /"page_id":"?(\d{5,})"?/, /fb:\/\/page\/\?id=(\d{5,})/, /fb:\/\/page\/(\d{5,})/, /"entity_id":"(\d{5,})"/, /"delegate_page":\{"id":"(\d{5,})"/, /profile_id=(\d{5,})/, /content="fb:\/\/profile\/(\d{5,})"/, /"userID":"(\d{5,})"/];
    for (const u of urls) {
        try {
            const r = await fetch(u, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, redirect: "follow" });
            if (!r || !r.ok) continue;
            const html = await r.text();
            for (const p of pats) { const mm = html.match(p); if (mm && mm[1]) return { ok: true, pageId: mm[1], via: u, slug }; }
        } catch {}
    }
    return { ok: false, error: "couldn't extract an ID (Facebook likely requires login) — enter it manually", slug };
}
function wbInfo() { return { ok: true, path: wbPath() }; }
function setXlsPath(p) { const c = loadConfig(); c.xlsPath = String(p || "").trim(); saveConfig(c); return { ok: true, path: wbPath() }; }
function wbRun(cmd, extra) {
    return new Promise((resolve) => {
        const py = (VENV_PY && fs.existsSync(VENV_PY)) ? VENV_PY : (process.platform === "win32" ? "python" : "python3");
        const args = [WB_SCRIPT, cmd, "--wb", wbPath()].concat(extra || []);
        let child, outBuf = "", errBuf = "", done = false;
        const t = setTimeout(() => { if (done) return; done = true; try { child && child.kill("SIGKILL"); } catch {} resolve({ ok: false, error: cmd + " timeout" }); }, 20000);
        try { child = spawn(py, args, { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ ok: false, error: "spawn failed: " + ((e && e.message) || e) }); }
        child.stdout.on("data", d => outBuf += d); child.stderr.on("data", d => errBuf += d);
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, error: "spawn error: " + e.message + " (is Python on PATH?)" }); });
        child.on("close", () => { if (done) return; done = true; clearTimeout(t); const line = (outBuf || "").trim().split("\n").filter(Boolean).pop() || ""; try { resolve(JSON.parse(line)); } catch { resolve({ ok: false, error: "no JSON from " + cmd + (errBuf ? (": " + errBuf.slice(0, 200)) : "") }); } });
    });
}
function wbStatus() { return wbRun("status", []); }
function wbInit(d) { return wbRun("init", (d && d.state) ? ["--state", d.state] : []); }
function wbAddPage(d) { d = d || {}; const a = ["--state", d.state || "", "--fbPage", d.fbPage || ""]; if (d.pageId) a.push("--pageId", String(d.pageId)); if (d.url) a.push("--url", d.url); if (d.businessId) a.push("--businessId", String(d.businessId)); if (d.town) a.push("--town", d.town); if (d.kind) a.push("--kind", d.kind); return wbRun("add-page", a); }
function wbAddAdmin(d) { d = d || {}; const a = ["--name", d.name || "", "--email", d.email || ""]; if (d.towns) a.push("--towns", d.towns); if (d.state) a.push("--state", d.state); return wbRun("add-admin", a); }
function wbListPages(d) { return wbRun("list-pages", (d && d.state) ? ["--state", d.state] : []); }
function wbListAdmins() { return wbRun("list-admins", []); }
function wbGetTemplates() { return wbRun("get-templates", []); }
function wbSetTemplates(d) { return wbRun("set-templates", ["--data", JSON.stringify((d && d.templates) || {})]); }
function wbDelRow(d) { d = d || {}; return wbRun("del-row", ["--sheet", d.sheet || "", "--row", String(d.row || "")]); }
