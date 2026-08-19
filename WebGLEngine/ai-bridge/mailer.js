// ai-bridge/mailer.js — v1022
// Dependency-free email sender for the PetFBI flow. Two real transports plus a
// draft fallback, so volunteers can use whichever they already have:
//   - "smtp"    → raw SMTP over implicit TLS (Gmail: smtp.gmail.com:465 + an
//                 app password). No npm dependency; uses Node's built-in tls.
//   - "outlook" → cscript send-via-outlook.vbs, the external-VBS pattern the
//                 VBA Transmitter uses (OutlookExternal.bas) to drive Outlook
//                 via COM. No credentials needed (uses the configured profile),
//                 and no PowerShell execution-policy hurdle.
//   - else      → { ok:false, draft:true }  (panel falls back to a mailto draft)
//
// send(cfg, msg): cfg = { mode, smtp:{host,port,user,pass,from} }
//                 msg = { to:[...], subject, body, from? }  ->  Promise<{ok,...}>

const tls = require("tls");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const b64 = (s) => Buffer.from(String(s), "utf8").toString("base64");

// v1131 — content-type guess for attachments
function guessType(name) {
    const e = String(name).toLowerCase().split(".").pop();
    return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", pdf: "application/pdf", txt: "text/plain", csv: "text/csv", html: "text/html" })[e] || "application/octet-stream";
}
const _arr = (v) => (Array.isArray(v) ? v : (v ? [v] : [])).filter(Boolean);

function buildMessage(msg, from) {
    const toList = _arr(msg.to), ccList = _arr(msg.cc), bccList = _arr(msg.bcc);
    const rcpts = [...toList, ...ccList, ...bccList].filter(Boolean);
    const asciiSubj = /^[\x00-\x7F]*$/.test(msg.subject || "");
    const subject = asciiSubj ? (msg.subject || "") : ("=?UTF-8?B?" + b64(msg.subject || "") + "?=");
    const atts = _arr(msg.attachments).map(a => (typeof a === "string" ? { path: a } : a)).filter(a => a && a.path && fs.existsSync(a.path));
    const baseHeaders = ["From: " + from, "To: " + toList.join(", ")];
    if (ccList.length) baseHeaders.push("Cc: " + ccList.join(", "));
    baseHeaders.push("Subject: " + subject, "MIME-Version: 1.0");

    if (!atts.length) {
        const headers = baseHeaders.concat(["Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", ""]).join("\r\n");
        const bodyB64 = b64(msg.body || "").replace(/(.{76})/g, "$1\r\n");
        return { rcpts, payload: headers + "\r\n" + bodyB64 + "\r\n.\r\n" };
    }
    // multipart/mixed: text part + each attachment (base64). Base64 never produces
    // a line starting with ".", so no SMTP dot-stuffing is required.
    const boundary = "swek_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    let p = baseHeaders.concat(['Content-Type: multipart/mixed; boundary="' + boundary + '"', ""]).join("\r\n") + "\r\n";
    p += "--" + boundary + "\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" + b64(msg.body || "").replace(/(.{76})/g, "$1\r\n") + "\r\n";
    for (const a of atts) {
        let data; try { data = fs.readFileSync(a.path); } catch { continue; }
        const fname = (a.name || path.basename(a.path)).replace(/"/g, "");
        const ctype = a.contentType || guessType(fname);
        const data64 = data.toString("base64").replace(/(.{76})/g, "$1\r\n");
        p += "--" + boundary + "\r\nContent-Type: " + ctype + '; name="' + fname + '"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="' + fname + '"\r\n\r\n' + data64 + "\r\n";
    }
    p += "--" + boundary + "--\r\n.\r\n";
    return { rcpts, payload: p };
}

function sendSmtp(smtp, msg) {
    return new Promise((resolve) => {
        smtp = smtp || {};
        const host = smtp.host || "smtp.gmail.com";
        const port = Number(smtp.port) || 465;   // implicit TLS
        const from = msg.from || smtp.from || smtp.user;
        const pass = smtp.pass || process.env.GMAIL_APP_PASSWORD; if (!smtp.user || !pass) return resolve({ ok: false, error: "SMTP user/app-password not configured" });
        const { rcpts, payload } = buildMessage(msg, from);
        if (!rcpts.length) return resolve({ ok: false, error: "no recipients" });

        const seq = [
            { expect: [220] },                                           // greeting
            { expect: [250], send: "EHLO localhost\r\n" },
            { expect: [334], send: "AUTH LOGIN\r\n" },
            { expect: [334], send: b64(smtp.user) + "\r\n" },
            { expect: [235], send: b64(pass) + "\r\n" },
            { expect: [250], send: "MAIL FROM:<" + from + ">\r\n" },
            ...rcpts.map(r => ({ expect: [250, 251], send: "RCPT TO:<" + r + ">\r\n" })),
            { expect: [354], send: "DATA\r\n" },
            { expect: [250], send: payload, sent: true },                // message accepted
        ];

        let step = 0, buf = "", done = false, sock;
        const fail = (e) => { if (done) return; done = true; try { sock && sock.destroy(); } catch {} resolve({ ok: false, error: String(e) }); };
        const succeed = (n) => { if (done) return; done = true; try { sock.write("QUIT\r\n"); sock.end(); } catch {} resolve({ ok: true, sent: n }); };
        const t = setTimeout(() => fail("SMTP timeout"), 30000);

        sock = tls.connect({ host, port, servername: host }, () => {});
        sock.setEncoding("utf8");
        sock.on("error", (e) => { clearTimeout(t); fail("connect: " + e.message); });
        sock.on("data", (d) => {
            buf += d;
            const lines = buf.split(/\r\n/);
            for (let i = 0; i < lines.length; i++) {
                const m = /^(\d{3}) /.exec(lines[i]);     // final line of a (possibly multiline) reply
                if (!m) continue;
                buf = lines.slice(i + 1).join("\r\n");
                const code = parseInt(m[1], 10);
                const cur = seq[step];
                if (!cur.expect.includes(code)) { clearTimeout(t); return fail("SMTP " + code + ": " + lines[i]); }
                if (cur.sent) { clearTimeout(t); return succeed(rcpts.length); }
                step++;
                if (step < seq.length && seq[step].send) sock.write(seq[step].send);
                return;
            }
        });
    });
}

// Outlook via the external-VBS / cscript pattern (mirrors VBATransmitter's
// OutlookExternal.bas — avoids PowerShell execution-policy lockdowns). The VBS
// connects with Outlook.Application, falling back to OutlookManager.Application.
const OUTLOOK_EXIT = { 2: "VBS got no message file", 3: "could not read/parse message", 4: "Outlook not available (is it installed?)", 5: "Outlook rejected the send" };
function sendOutlook(msg, scriptPath) {
    return new Promise((resolve) => {
        const to = (Array.isArray(msg.to) ? msg.to : [msg.to]).filter(Boolean);
        const cc = _arr(msg.cc), bcc = _arr(msg.bcc);
        const atts = _arr(msg.attachments).map(a => (typeof a === "string" ? a : (a && a.path))).filter(p => p && fs.existsSync(p));
        const sentinel = "\n---PETFBI---\n";
        // 6 fields: to | cc | bcc | subject | body | attachments(|-joined)
        const payload = [to.join("; "), cc.join("; "), bcc.join("; "), msg.subject || "", msg.body || "", atts.join("|")].join(sentinel);
        const tmp = path.join(os.tmpdir(), "petfbi_mail_" + Date.now() + ".txt");
        try { fs.writeFileSync(tmp, payload, { encoding: "utf8" }); }     // BOM-less UTF-8; the VBS reads it via ADODB.Stream
        catch (e) { return resolve({ ok: false, error: "temp write: " + e.message }); }
        const vbs = scriptPath || path.join(__dirname, "send-via-outlook.vbs");
        let out = "", err = "", child;
        try { child = spawn("cscript", ["//NoLogo", "//B", vbs, tmp], { windowsHide: true }); }
        catch (e) { try { fs.unlinkSync(tmp); } catch {} return resolve({ ok: false, error: "cscript spawn: " + e.message }); }
        child.stdout.on("data", d => out += d);
        child.stderr.on("data", d => err += d);
        child.on("error", e => { try { fs.unlinkSync(tmp); } catch {} resolve({ ok: false, error: "cscript: " + e.message + " (Windows only)" }); });
        child.on("close", code => {
            try { fs.unlinkSync(tmp); } catch {}
            resolve(code === 0 ? { ok: true, sent: to.length } : { ok: false, error: OUTLOOK_EXIT[code] || (err || out || "outlook exit " + code).slice(0, 400) });
        });
    });
}

async function send(cfg, msg) {
    cfg = cfg || {};
    const mode = cfg.mode || "draft";
    if (!msg || !((Array.isArray(msg.to) ? msg.to : [msg.to]).filter(Boolean).length))
        return { ok: false, error: "no recipients on the report" };
    if (mode === "smtp") return sendSmtp(cfg.smtp || {}, msg);
    if (mode === "outlook") return sendOutlook(msg, cfg.outlookScript);
    return { ok: false, draft: true, error: "no mailer configured (set SMTP or Outlook in the panel)" };
}

module.exports = { send, sendSmtp, sendOutlook, buildMessage };
