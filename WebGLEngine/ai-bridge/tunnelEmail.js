// ai-bridge/tunnelEmail.js — v2248 (v2249: Outlook by default)
//
// "If I get an external temp URL, email it to me so I won't forget it."
// When hostingBridge's quick Cloudflare tunnel first produces a https://<x>.trycloudflare.com URL,
// it calls notify(url) here. If enabled, we email that link to you, once per URL. Quick tunnels rotate
// on each restart, so the dedupe is per-URL: a new tunnel = a new mail, the same tunnel twice = silence.
//
// SENDER: defaults to "outlook" — mailer.js drives your local Outlook via cscript send-via-outlook.vbs
// (the same VBS the rest of the email integration uses), so it needs no SMTP user/password, just a
// recipient. Switch to "smtp" to send through the configured Gmail/SMTP transport instead.
//
// Config: ~/.voxelbridge/tunnel-email.json  { on, mode, to, lastUrl, lastAt }
//   on   - default true; harmless when nothing can send (planEmail returns a skip reason)
//   mode - "outlook" (default) | "smtp" | "draft"
//   to   - your address. Outlook has no stored self-address, so set this once; SMTP falls back to
//          the mailer's own from/user automatically.

const fs = require("fs");
const os = require("os");
const path = require("path");

const CFG = path.join(os.homedir(), ".voxelbridge", "tunnel-email.json");
const DEF = { on: true, mode: "outlook", to: "", lastUrl: "", lastAt: 0 };

function _load() { try { return Object.assign({}, DEF, JSON.parse(fs.readFileSync(CFG, "utf8")) || {}); } catch { return { ...DEF }; } }
function _save(c) { try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(c, null, 2), { mode: 0o600 }); } catch {} }

// The SMTP block from the already-configured mailer (used for the "from"/recipient fallback, and for
// creds when mode is smtp). Never throws.
function _smtp() { try { return (require("./petfbiBridge.js").mailerCfg() || {}).smtp || {}; } catch { return {}; } }

// PURE decision: given a url, config, the resolved mailer { mode, smtp }, and a force flag, decide whether
// to send and the exact message. No side effects -- unit-tested by tunnel-email-selfcheck.
function planEmail(url, cfg, mailer, force) {
    cfg = cfg || {};
    if (!cfg.on) return { send: false, reason: "off" };
    if (!url || !/^https?:\/\//i.test(url)) return { send: false, reason: "no-url" };
    if (!force && url === cfg.lastUrl) return { send: false, reason: "duplicate" };
    const m = mailer || {};
    const mode = m.mode || "outlook";
    const smtp = m.smtp || {};
    let ready;
    if (mode === "outlook") ready = true;                          // Outlook uses the default account via cscript; no creds
    else if (mode === "smtp") ready = !!(smtp.user && smtp.pass);  // Gmail/SMTP needs a user + app-password
    else ready = false;                                            // draft / unknown = nothing can actually send
    if (!ready) return { send: false, reason: "mailer-not-configured" };
    const to = (cfg.to && String(cfg.to).trim()) || smtp.from || smtp.user;
    if (!to) return { send: false, reason: "no-recipient" };       // Outlook with no address set yet
    const msg = {
        to: [to],
        from: smtp.from || smtp.user || undefined,   // ignored by Outlook (it uses the default account)
        subject: "SweK external URL is live: " + url,
        body: "Your SweK engine just came up on a temporary external address:\n\n" +
              "    " + url + "\n\n" +
              "Open it before the tunnel closes. Quick Cloudflare tunnels rotate on each restart, so this " +
              "link is only good for the current session.\n\n" +
              "Sent automatically so you don't lose it.\n-- SweK tunnel-email",
    };
    return { send: true, reason: "ok", to, mode, msg };
}

// EFFECT: run the plan against the real mailer. Guarded so it can never throw into the tunnel scanner.
async function notify(url, opts) {
    try {
        const cfg = _load();
        const mailer = { mode: cfg.mode || "outlook", smtp: _smtp() };
        const plan = planEmail(url, cfg, mailer, !!(opts && opts.force));
        if (!plan.send) return { ok: true, skipped: plan.reason };
        let res = { ok: false, error: "mailer unavailable" };
        try { res = await require("./mailer.js").send(mailer, plan.msg); } catch (e) { res = { ok: false, error: String((e && e.message) || e) }; }
        if (res && res.ok) { cfg.lastUrl = url; cfg.lastAt = Date.now(); _save(cfg); }
        return { ok: !!(res && res.ok), url, to: plan.to, via: plan.mode, error: res && res.error };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

function getConfig() { const c = _load(); return { ok: true, on: !!c.on, mode: c.mode || "outlook", to: c.to || "", lastUrl: c.lastUrl || "", lastAt: c.lastAt || 0 }; }
function setConfig(d) {
    const c = _load();
    if (d && d.on != null) c.on = !!d.on;
    if (d && d.to != null) c.to = String(d.to || "").trim();
    if (d && d.mode != null) { const mm = String(d.mode).toLowerCase(); if (["outlook", "smtp", "draft"].includes(mm)) c.mode = mm; }
    _save(c); return getConfig();
}
async function test() { return notify("https://test-" + Date.now().toString(36) + ".trycloudflare.com", { force: true }); }

module.exports = { notify, getConfig, setConfig, planEmail, test, CFG };
