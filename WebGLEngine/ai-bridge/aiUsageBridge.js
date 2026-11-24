// WebGLEngine/ai-bridge/aiUsageBridge.js -- UNNUMBERED (the version is chosen at ship time)
//
// AI USAGE LIMITS FOR THE DOCK. Keith: "add the AI usage limits gauge to the dock". Claude Code and Codex each cap how much a subscription can use in a
// rolling five-hour session and in a week; this reads how much of each is used, for the dock's CLAUDE 5H / CLAUDE WK / CODEX 5H / CODEX WK gauges
// (ui/svgGaugeSet.js), through GET /ai/usage (ai-bridge/server.js).
//
// HOW, AND WHERE IT CAME FROM. The same way the two Windows docks in the install panel do it (alztrk/opentaskbar Services/App/AiUsageService.cs,
// crafter-station/muelle apps/dock/src/usage.rs, both MIT): borrow the sign-in each CLI already keeps on this machine and ask the provider's usage endpoint.
//   Claude Code  $CLAUDE_CONFIG_DIR or ~/.claude, file .credentials.json, claudeAiOauth.accessToken  ->  GET https://api.anthropic.com/api/oauth/usage
//                (header anthropic-beta: oauth-2025-04-20); five_hour and seven_day, each { utilization: 0-100, resets_at: ISO time }
//   Codex        $CODEX_HOME or ~/.codex, file auth.json, tokens.access_token (and tokens.account_id)  ->  GET https://chatgpt.com/backend-api/wham/usage
//                (header ChatGPT-Account-Id when there is one); rate_limit.primary_window and secondary_window, each { used_percent: 0-100,
//                limit_window_seconds, reset_at: unix seconds | reset_after_seconds }
// NEITHER ENDPOINT IS DOCUMENTED BY ITS PROVIDER. Both docks rely on them; either can change shape or go away. When one does, the gauge reads "-" and says
// why in its tooltip; it never shows a made-up number.
//
// WHAT IT WILL NOT DO. It NEVER refreshes, writes, caches on disk, logs or returns a token: an expired sign-in reads "sign in again by running the CLI once".
// (OpenTaskbar refreshes Claude's token and writes the file back; this does not, so it cannot break the CLI's own sign-in.) On a Mac, Claude Code keeps its
// sign-in in the Keychain rather than the file, and this does not read the Keychain: there the Claude gauges say so. Answers are kept in memory for
// two minutes, so the dock's two-second poll asks each provider at most once in that time.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");

const TTL_MS = 120000;
const PROVIDERS = Object.freeze(["claude", "codex"]);
const ENDPOINT = Object.freeze({ claude: "https://api.anthropic.com/api/oauth/usage", codex: "https://chatgpt.com/backend-api/wham/usage" });

/** Where each CLI keeps its sign-in. Pure. */
function credentialPath(provider, env = process.env, home = os.homedir()) {
    if (provider === "claude") return path.join(env.CLAUDE_CONFIG_DIR || path.join(home, ".claude"), ".credentials.json");
    if (provider === "codex") return path.join(env.CODEX_HOME || path.join(home, ".codex"), "auth.json");
    throw new Error(`aiUsageBridge: unknown provider ${provider}`);
}

/** The token out of a sign-in file's text: { token, account?, plan? } or { reason }. Pure; the token goes only to the provider. */
function readCredential(provider, text, now = Date.now()) {
    let j; try { j = JSON.parse(text); } catch { return { reason: "its sign-in file is not JSON" }; }
    if (!j || typeof j !== "object") return { reason: "its sign-in file is empty" };
    if (provider === "claude") {
        const a = j.claudeAiOauth && typeof j.claudeAiOauth === "object" ? j.claudeAiOauth : j, token = a.accessToken || a.access_token;
        if (!token) return { reason: "signed in with an API key, not a Claude subscription, or not signed in" };
        if (Number.isFinite(a.expiresAt) && a.expiresAt <= now) return { reason: "the sign-in has expired: run claude once to renew it" };
        return { token: String(token), plan: a.subscriptionType || a.rateLimitTier || null };
    }
    const t = j.tokens && typeof j.tokens === "object" ? j.tokens : null;
    if (!t || !t.access_token) return { reason: j.OPENAI_API_KEY ? "signed in with an API key, which has no usage limits to show" : "not signed in with ChatGPT" };
    return { token: String(t.access_token), account: t.account_id ? String(t.account_id) : null };
}

const pct = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null);
/** The provider's answer as { session, weekly, plan }: each window { used: 0-100, resetsAt: ISO | null } or null. Pure. */
function parseUsage(provider, body, now = Date.now()) {
    if (!body || typeof body !== "object") return null;
    if (provider === "claude") {
        const w = (o) => (o && typeof o === "object" && pct(Number(o.utilization)) !== null ? { used: pct(Number(o.utilization)), resetsAt: o.resets_at ? new Date(o.resets_at).toISOString() : null } : null);
        const out = { session: w(body.five_hour), weekly: w(body.seven_day), plan: null };
        return out.session || out.weekly ? out : null;
    }
    const rl = body.rate_limit && typeof body.rate_limit === "object" ? body.rate_limit : null;
    if (!rl) return null;
    const out = { session: null, weekly: null, plan: body.plan_type || null };
    for (const name of ["primary_window", "secondary_window"]) {
        const o = rl[name]; if (!o || typeof o !== "object" || pct(Number(o.used_percent)) === null) continue;
        const secs = Number(o.limit_window_seconds), at = Number.isFinite(Number(o.reset_at)) && Number(o.reset_at) > 0 ? new Date(Number(o.reset_at) * 1000) : Number.isFinite(Number(o.reset_after_seconds)) ? new Date(now + Number(o.reset_after_seconds) * 1000) : null;
        const slot = Number.isFinite(secs) && secs > 0 ? (secs >= 604800 ? "weekly" : "session") : name === "secondary_window" ? "weekly" : "session";
        if (!out[slot]) out[slot] = { used: pct(Number(o.used_percent)), resetsAt: at ? at.toISOString() : null };
    }
    return out.session || out.weekly ? out : null;
}

/** One GET, as { status, body }. The token is sent only to the provider's own host. */
function getJson(url, headers, timeoutMs = 8000) {
    return new Promise((resolve) => {
        const r = https.get(url, { headers: { "User-Agent": "swek-engine", Accept: "application/json", ...headers } }, (res) => {
            let b = ""; res.on("data", (c) => { b += c; if (b.length > 1e6) r.destroy(); });
            res.on("end", () => { let body = null; try { body = JSON.parse(b); } catch { /* not JSON */ } resolve({ status: res.statusCode, body }); });
        });
        r.on("error", (e) => resolve({ status: 0, body: null, error: e.code || e.message }));
        r.setTimeout(timeoutMs, () => { r.destroy(); resolve({ status: 0, body: null, error: "timed out" }); });
    });
}

/** One provider's reading: { ok, session, weekly, plan, why }. Seams for the gate: read, get, env, home, platform, now. */
async function usageOf(provider, { read = (f) => fs.readFileSync(f, "utf8"), get = getJson, env = process.env, home = os.homedir(), platform = process.platform, now = Date.now() } = {}) {
    const file = credentialPath(provider, env, home), name = provider === "claude" ? "Claude Code" : "Codex";
    let text; try { text = read(file); } catch { return { ok: false, why: provider === "claude" && platform === "darwin" ? "Claude Code keeps its sign-in in the macOS Keychain, which SweK does not read" : `${name} is not signed in on this machine (no ${file})` }; }
    const c = readCredential(provider, text, now); if (c.reason) return { ok: false, why: `${name}: ${c.reason}` };
    const headers = provider === "claude" ? { Authorization: `Bearer ${c.token}`, "anthropic-beta": "oauth-2025-04-20" } : { Authorization: `Bearer ${c.token}`, ...(c.account ? { "ChatGPT-Account-Id": c.account } : {}) };
    const r = await get(ENDPOINT[provider], headers);
    if (r.status === 401 || r.status === 403) return { ok: false, why: `${name}: the provider refused the sign-in (HTTP ${r.status}): run the CLI once to renew it` };
    if (r.status !== 200) return { ok: false, why: `${name}: the usage endpoint did not answer (${r.status ? "HTTP " + r.status : r.error || "no answer"})` };
    const u = parseUsage(provider, r.body, now);
    if (!u) return { ok: false, why: `${name}: the usage endpoint answered in a shape SweK does not know (it is undocumented and may have changed)` };
    return { ok: true, session: u.session, weekly: u.weekly, plan: u.plan || c.plan || null, why: "" };
}

let _cache = null, _inflight = null;
/** Both providers, cached TTL_MS: { ok, at, claude, codex }. `force` skips the cache. */
async function usage({ force = false, now = Date.now(), ...seams } = {}) {
    if (!force && _cache && now - _cache.atMs < TTL_MS) return _cache.value;
    if (_inflight) return _inflight;
    _inflight = (async () => {
        const out = { ok: true, at: new Date(now).toISOString() };
        for (const p of PROVIDERS) { try { out[p] = await usageOf(p, { now, ...seams }); } catch (e) { out[p] = { ok: false, why: String((e && e.message) || e) }; } }
        _cache = { atMs: now, value: out }; return out;
    })();
    try { return await _inflight; } finally { _inflight = null; }
}
function _resetCache() { _cache = null; _inflight = null; }

module.exports = { TTL_MS, PROVIDERS, ENDPOINT, credentialPath, readCredential, parseUsage, usageOf, usage, _resetCache };
