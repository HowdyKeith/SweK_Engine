// ai-bridge/gmailBridge.js — v1109
// Dependency-free Gmail (or any IMAP) unread-count reader. Uses Node's built-in
// `tls` to do a minimal IMAP STATUS flow — no npm packages. Credentials live in
// ~/.voxelbridge/gmail.json (mode 0600, OUTSIDE the project so they never ship).
//
// Gmail needs an APP PASSWORD (Google Account -> Security -> App passwords, with
// 2-Step Verification on) — your normal password won't work for IMAP.

const tls = require("tls");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CONFIG = process.env.GMAIL_CONFIG || path.join(os.homedir(), ".voxelbridge", "gmail.json");

function load() { try { if (fs.existsSync(CONFIG)) return JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch {} return {}; }
function save(c) {
    try { fs.mkdirSync(path.dirname(CONFIG), { recursive: true }); fs.writeFileSync(CONFIG, JSON.stringify(c), { mode: 0o600 }); return true; }
    catch (e) { console.warn("[gmail] config save failed:", e.message); return false; }
}

function setConfig(d) {
    const c = load();
    if (typeof d.user === "string") c.user = d.user.trim();
    if (typeof d.pass === "string") c.pass = d.pass;   // app password
    if (typeof d.host === "string" && d.host.trim()) c.host = d.host.trim();
    if (d.port) c.port = parseInt(d.port, 10) || 993;
    save(c);
    return getConfig();
}

// never returns the password
function getConfig() {
    const c = load();
    return { ok: true, user: c.user || "", host: c.host || "imap.gmail.com", port: c.port || 993, hasPass: !!(c.pass || process.env.GMAIL_APP_PASSWORD) };
}

// Minimal IMAP STATUS (UNSEEN) over implicit TLS. Resolves { ok, unread } | { ok:false, error }.
function unread() {
    return new Promise((resolve) => {
        const c = load();
        const user = c.user, pass = c.pass || process.env.GMAIL_APP_PASSWORD;
        const host = c.host || "imap.gmail.com", port = c.port || 993;
        if (!user || !pass) return resolve({ ok: false, error: "no Gmail credentials saved (set user + app password)" });

        let buf = "", step = 0, done = false, socket;
        const finish = (r) => { if (done) return; done = true; clearTimeout(to); try { socket && socket.destroy(); } catch {} resolve(r); };
        const to = setTimeout(() => finish({ ok: false, error: "imap timeout" }), 15000);
        const esc = (s) => String(s).replace(/(["\\])/g, "\\$1");
        const send = (cmd) => { try { socket.write(cmd + "\r\n"); } catch {} };

        try { socket = tls.connect({ host, port, servername: host }, () => {}); }
        catch (e) { return finish({ ok: false, error: "tls connect: " + e.message }); }

        socket.setEncoding("utf8");
        socket.on("data", (d) => {
            buf += d;
            if (step === 0 && /^\*\s+OK/m.test(buf)) {            // server greeting
                step = 1; buf = ""; send(`a1 LOGIN "${esc(user)}" "${esc(pass)}"`); return;
            }
            if (step === 1 && /^a1\s+(OK|NO|BAD)/mi.test(buf)) {  // login result
                const m = /^a1\s+(OK|NO|BAD)(.*)$/mi.exec(buf);
                if (!m || m[1].toUpperCase() !== "OK") return finish({ ok: false, error: "login failed (check the app password)" });
                step = 2; buf = ""; send(`a2 STATUS "INBOX" (UNSEEN MESSAGES)`); return;
            }
            if (step === 2 && /^a2\s+(OK|NO|BAD)/mi.test(buf)) {  // status result
                const um = /UNSEEN\s+(\d+)/i.exec(buf);
                send("a3 LOGOUT");
                if (um) return finish({ ok: true, unread: parseInt(um[1], 10) });
                return finish({ ok: false, error: "no UNSEEN in STATUS response" });
            }
        });
        socket.on("error", (e) => finish({ ok: false, error: "imap: " + (e && e.message || e) }));
        socket.on("end", () => { /* handled by finish */ });
    });
}

module.exports = { unread, setConfig, getConfig, listMessages, markSeen };

// ============================================================================
// v1865 — message LIST + mark-seen, so the email-rules engine can use Gmail as a
// source the same way it uses Outlook. Returns the SAME shape outlook.list() does:
// { ok, messages:[{ entryId, from, fromName, subject, body, received, unread }] }.
// entryId is the IMAP UID (stable per-mailbox) so mark-seen + the seen-cache work.
// Pure Node `tls` IMAP — no npm. Parses ENVELOPE (from/subject/date) + a text body.
// ============================================================================
function _imapSession(runSteps) {
    // generic IMAP-over-TLS runner: logs in, then hands control to runSteps(api).
    return new Promise((resolve) => {
        const c = load();
        const user = c.user, pass = c.pass || process.env.GMAIL_APP_PASSWORD;
        const host = c.host || "imap.gmail.com", port = c.port || 993;
        if (!user || !pass) return resolve({ ok: false, error: "no Gmail credentials saved (set user + app password)" });
        let buf = "", done = false, socket, tag = 0, waiting = null;
        const finish = (r) => { if (done) return; done = true; clearTimeout(to); try { socket && socket.write("aZ LOGOUT\r\n"); } catch {} try { socket && socket.destroy(); } catch {} resolve(r); };
        const to = setTimeout(() => finish({ ok: false, error: "imap timeout" }), 30000);
        const esc = (s) => String(s).replace(/([\"\\])/g, "\\$1");
        // send a tagged command, resolve when its tagged completion line arrives; returns the full response text.
        const cmd = (line) => new Promise((res, rej) => {
            const t = "b" + (++tag);
            const re = new RegExp("^" + t + "\\s+(OK|NO|BAD)", "mi");
            waiting = { re, buffer: "", res, rej, t };
            try { socket.write(t + " " + line + "\r\n"); } catch (e) { rej(e); }
        });
        try { socket = tls.connect({ host, port, servername: host }, () => {}); }
        catch (e) { return finish({ ok: false, error: "tls connect: " + e.message }); }
        socket.setEncoding("utf8");
        let greeted = false, loggedIn = false;
        socket.on("data", async (d) => {
            buf += d;
            if (!greeted) { if (/^\*\s+OK/m.test(buf)) { greeted = true; buf = ""; try { const r = await cmd(`LOGIN "${esc(user)}" "${esc(pass)}"`); if (!/\b(OK)\b/i.test(r.split(/\r?\n/).pop() || r)) { return finish({ ok: false, error: "login failed (check the app password)" }); } loggedIn = true; runSteps({ cmd, finish }).catch((e) => finish({ ok: false, error: String(e && e.message || e) })); } catch (e) { finish({ ok: false, error: "login: " + (e && e.message || e) }); } } return; }
            if (waiting) {
                waiting.buffer += d;
                if (waiting.re.test(waiting.buffer)) { const w = waiting; waiting = null; buf = ""; w.res(w.buffer); }
            }
        });
        socket.on("error", (e) => finish({ ok: false, error: "imap: " + (e && e.message || e) }));
    });
}

// Decode a MIME 'encoded-word' subject/name (=?utf-8?B?..?= / =?utf-8?Q?..?=). Best-effort.
function _decodeMime(s) {
    if (!s) return "";
    return String(s).replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, cs, enc, txt) => {
        try {
            if (enc.toUpperCase() === "B") return Buffer.from(txt, "base64").toString("utf8");
            return txt.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
        } catch { return txt; }
    });
}
// Pull one address out of an IMAP ENVELOPE address list "((name NIL mailbox host)...)".
function _envAddr(seg) {
    // seg like: (("Jane Doe" NIL "jane" "example.com"))
    const m = /\(\s*\(\s*(NIL|"(?:[^"\\]|\\.)*")\s+(?:NIL|"(?:[^"\\]|\\.)*")\s+(NIL|"(?:[^"\\]|\\.)*")\s+(NIL|"(?:[^"\\]|\\.)*")/i.exec(seg || "");
    if (!m) return { addr: "", name: "" };
    const unq = (x) => (x && x !== "NIL") ? x.replace(/^"|"$/g, "").replace(/\\(.)/g, "$1") : "";
    const name = _decodeMime(unq(m[1])), mbox = unq(m[2]), host = unq(m[3]);
    return { addr: (mbox && host) ? (mbox + "@" + host) : "", name };
}

async function listMessages(n) {
    n = Math.max(1, Math.min(50, parseInt(n, 10) || 10));
    return _imapSession(async ({ cmd, finish }) => {
        try {
            await cmd(`SELECT "INBOX"`);
            // newest N UIDs. SEARCH ALL then take the tail; Gmail returns ascending UID order.
            const sres = await cmd(`UID SEARCH ALL`);
            const line = (sres.match(/^\*\s+SEARCH([^\r\n]*)/mi) || [])[1] || "";
            const uids = line.trim().split(/\s+/).filter(Boolean).map(x => parseInt(x, 10)).filter(Boolean);
            const pick = uids.slice(-n).reverse();
            if (!pick.length) return finish({ ok: true, messages: [] });
            const messages = [];
            for (const uid of pick) {
                // ENVELOPE + FLAGS + INTERNALDATE, then a small slice of the text body.
                const meta = await cmd(`UID FETCH ${uid} (FLAGS INTERNALDATE ENVELOPE)`);
                const env = (meta.match(/ENVELOPE\s+\(([\s\S]*?)\)\s*(?:INTERNALDATE|FLAGS|\))/i) || [])[1] || meta;
                // ENVELOPE fields: date, subject, from, sender, reply-to, to, ...
                const dm = /ENVELOPE\s+\(\s*("(?:[^"\\]|\\.)*"|NIL)\s+("(?:[^"\\]|\\.)*"|NIL)/i.exec(meta);
                const received = dm && dm[1] && dm[1] !== "NIL" ? dm[1].replace(/^"|"$/g, "") : "";
                const subject = dm && dm[2] && dm[2] !== "NIL" ? _decodeMime(dm[2].replace(/^"|"$/g, "").replace(/\\(.)/g, "$1")) : "";
                const fromSeg = (meta.match(/ENVELOPE\s+\([\s\S]*?(\(\(.*?\)\))\s*(?:\(\(|NIL)/i) || [])[1] || "";
                const fa = _envAddr(fromSeg);
                const unread = !/\\Seen/i.test((meta.match(/FLAGS\s+\(([^)]*)\)/i) || [])[1] || "");
                // body text: fetch a bounded slice so a huge email doesn't stall the poll.
                let body = "";
                try { const b = await cmd(`UID FETCH ${uid} (BODY.PEEK[TEXT]<0.4000>)`); const bm = b.match(/BODY\[TEXT\][^\r\n]*\r?\n([\s\S]*?)\r?\n\)\r?\n?b\d+\s+OK/i); body = bm ? bm[1] : ""; body = body.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, h) => { try { return String.fromCharCode(parseInt(h, 16)); } catch { return ""; } }); } catch {}
                messages.push({ entryId: "gmail:" + uid, uid, from: fa.addr, fromName: fa.name || fa.addr, subject, body: body.slice(0, 4000), received, unread, source: "gmail" });
            }
            return finish({ ok: true, messages });
        } catch (e) { return finish({ ok: false, error: String(e && e.message || e) }); }
    });
}

// mark a message \Seen by UID (entryId is "gmail:<uid>").
async function markSeen(entryId) {
    const uid = String(entryId || "").replace(/^gmail:/, "");
    if (!uid) return { ok: false, error: "no uid" };
    return _imapSession(async ({ cmd, finish }) => {
        try { await cmd(`SELECT "INBOX"`); await cmd(`UID STORE ${uid} +FLAGS (\\Seen)`); return finish({ ok: true, marked: uid }); }
        catch (e) { return finish({ ok: false, error: String(e && e.message || e) }); }
    });
}
