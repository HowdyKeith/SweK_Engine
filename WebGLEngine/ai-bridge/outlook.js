// ai-bridge/outlook.js — v1024
// Surfaces the VBA Transmitter's Outlook helpers (OutlookExternal.bas) to the
// bridge via the same external-VBS / cscript route: inbox unread count, list
// the installed Outlook rules, and run a rule by name. Windows + Outlook only;
// elsewhere these return {ok:false} and the panel just hides the widget.

const { spawn } = require("child_process");
const path = require("path");

const VBS = process.env.OUTLOOK_QUERY_VBS || path.join(__dirname, "outlook-query.vbs");

// v1107 — auto-start: when an unread poll finds Outlook closed, launch it so the
// user doesn't have to keep it open. Throttled so we don't relaunch every poll.
let _autoStart = process.env.OUTLOOK_AUTOSTART !== "0";   // on unless explicitly disabled
let _lastStart = 0;
function setAutoStart(on) { _autoStart = !!on; return { ok: true, autoStart: _autoStart }; }

function run(args, timeoutMs) {
    return new Promise((resolve) => {
        let out = "", err = "", child, done = false;
        const t = setTimeout(() => { if (done) return; done = true; try { child && child.kill("SIGKILL"); } catch {} resolve({ ok: false, error: "outlook timeout" }); }, timeoutMs || 20000);
        try { child = spawn("cscript", ["//NoLogo", "//B", VBS, ...args], { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ ok: false, error: "cscript spawn: " + e.message + " (Windows only)" }); }
        child.stdout.on("data", d => out += d);
        child.stderr.on("data", d => err += d);
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, error: "cscript: " + e.message + " (Windows only)" }); });
        child.on("close", code => { if (done) return; done = true; clearTimeout(t); resolve({ ok: true, code, out: (out || "").trim(), err: (err || "").trim() }); });
    });
}

async function unread() {
    const r = await run(["unread"]);
    if (!r.ok) return r;
    const m = /UNREAD:(\d+)/.exec(r.out);
    if (m) return { ok: true, unread: parseInt(m[1], 10) };
    // No clean count back — Outlook likely isn't running. If auto-start is on,
    // launch it (foreground, throttled) so it STAYS open and the next poll hits a
    // live instance instead of spawning/quitting a headless one each time.
    const noOutlook = /no-?outlook|not running|^error/i.test((r.out || "").trim());
    if (_autoStart && noOutlook && Date.now() - _lastStart > 90000) {
        _lastStart = Date.now();
        start();
        return { ok: false, starting: true, error: "Outlook isn't running — launching it now; the count appears in a few seconds." };
    }
    return { ok: false, error: r.out || "Outlook not running" };
}

async function listRules() {
    const r = await run(["rules"]);
    if (!r.ok) return r;
    if (r.out.startsWith("ERROR")) return { ok: false, error: r.out };
    const rules = r.out.split(/\r?\n/).filter(Boolean).map(l => { const [name, en] = l.split("\t"); return { name, enabled: /true/i.test(en || "") }; });
    return { ok: true, rules };
}

async function runRule(name) {
    if (!name) return { ok: false, error: "rule name required" };
    const r = await run(["runrule", name]);
    if (!r.ok) return r;
    return r.out.startsWith("OK") ? { ok: true } : { ok: false, error: r.out };
}

// v1121 — list N recent inbox mail items (newest first) with body, for the
// email-triggered PetFBI chain. Returns { ok, messages:[{entryId,from,fromName,
// subject,body,received,unread}] }.
async function list(n) {
    const r = await run(["list", String(n || 10)], 30000);
    if (!r.ok) return r;
    const s = (r.out || "").trim();
    if (s.startsWith("ERROR")) return { ok: false, error: s };
    try { const messages = JSON.parse(s); return { ok: true, messages: Array.isArray(messages) ? messages : [] }; }
    catch (e) { return { ok: false, error: "bad JSON from outlook list", raw: s.slice(0, 200) }; }
}

// v1107 — launch Outlook as a normal foreground app (so it STAYS open with the
// full MAPI profile). The unread query's CreateObject fallback can start Outlook
// headless, but it tends to quit when the script releases the COM ref; this opens
// it properly via the registered App Path so polling has a live instance.
function start() {
    return new Promise((resolve) => {
        try {
            const child = spawn("cmd", ["/c", "start", "", "outlook.exe"], { windowsHide: true, detached: true, stdio: "ignore" });
            child.unref();
            resolve({ ok: true, started: true });
        } catch (e) {
            resolve({ ok: false, error: (e && e.message || "spawn failed") + " (Windows only)" });
        }
    });
}

// v1131 — post-actions on a processed message (mark read / categorize), so the
// inbox visibly reflects what the rules handled.
async function markRead(entryId) {
    if (!entryId) return { ok: false, error: "entryId required" };
    const r = await run(["markread", entryId]);
    if (!r.ok) return r;
    return r.out.startsWith("OK") ? { ok: true } : { ok: false, error: r.out };
}
async function categorize(entryId, category) {
    if (!entryId) return { ok: false, error: "entryId required" };
    const r = await run(["categorize", entryId, category || "Processed"]);
    if (!r.ok) return r;
    return r.out.startsWith("OK") ? { ok: true } : { ok: false, error: r.out };
}

module.exports = { unread, listRules, runRule, list, start, setAutoStart, markRead, categorize };
