// WebGLEngine/ai-bridge/aiUsageBridge-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node ai-bridge/aiUsageBridge-selfcheck.mjs      (a second; nothing leaves this machine: every provider here is a stand-in)
//
// THE DOCK'S AI USAGE GAUGES, HELD. ai-bridge/aiUsageBridge.js reads how much of the Claude Code and Codex subscription limits is used, from each CLI's own
// sign-in, for the dock's CLAUDE 5H / CLAUDE WK / CODEX 5H / CODEX WK dials. Four things hold it:
//
//   1  THE SIGN-IN    where each CLI keeps it; the token read out of it; an expired, API-key or missing sign-in is a reason, never a token
//   2  THE ANSWER     each provider's shape read into a session and a week, 0-100, with the reset time; an unknown shape is no reading, not a zero
//   3  THE ROUND TRIP against a stand-in provider: the token goes only to that provider's own endpoint and comes back in NOTHING; a refusal, a dead endpoint
//                     and the Mac's Keychain each say why; two minutes of cache
//   4  THE DOCK       the route on the bridge, trusted callers only; the four sources on the gauge set, their row after the action row, the picker in main.js
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url), HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..");
const U = require("./aiUsageBridge.js");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };

const NOW = Date.parse("2026-11-21T12:00:00Z"), TOKEN_C = "sk-ant-oat01-STANDIN-claude", TOKEN_X = "eyJ.STANDIN.codex";
const claudeFile = (o = {}) => JSON.stringify({ claudeAiOauth: { accessToken: TOKEN_C, refreshToken: "r", expiresAt: NOW + 3600e3, subscriptionType: "max", ...o } });
const codexFile = (o = {}) => JSON.stringify({ OPENAI_API_KEY: null, tokens: { access_token: TOKEN_X, account_id: "acct-1", ...o } });
const CLAUDE_BODY = { five_hour: { utilization: 42, resets_at: "2026-11-21T15:00:00Z" }, seven_day: { utilization: 13.5, resets_at: "2026-11-25T00:00:00Z" } };
const CODEX_BODY = { plan_type: "plus", rate_limit: { primary_window: { used_percent: 61, limit_window_seconds: 18000, reset_after_seconds: 600 }, secondary_window: { used_percent: 7, limit_window_seconds: 604800, reset_at: 1764000000 } } };

console.log("aiUsageBridge-selfcheck -- the dock's AI usage-limit gauges\n");

console.log("1. THE SIGN-IN");
await section(() => {
    const home = path.join("/h", "u");
    ok("!! where each CLI keeps it: ~/.claude/.credentials.json and ~/.codex/auth.json, or under CLAUDE_CONFIG_DIR / CODEX_HOME", U.credentialPath("claude", {}, home) === path.join(home, ".claude", ".credentials.json") && U.credentialPath("codex", {}, home) === path.join(home, ".codex", "auth.json")
        && U.credentialPath("claude", { CLAUDE_CONFIG_DIR: "/c" }, home) === path.join("/c", ".credentials.json") && U.credentialPath("codex", { CODEX_HOME: "/x" }, home) === path.join("/x", "auth.json"));
    const c = U.readCredential("claude", claudeFile(), NOW), x = U.readCredential("codex", codexFile(), NOW);
    ok("!! the token, the plan and the account read out of each file", c.token === TOKEN_C && c.plan === "max" && x.token === TOKEN_X && x.account === "acct-1");
    const r = (p, t) => U.readCredential(p, t, NOW);
    ok("!! an EXPIRED Claude sign-in, an API key, an empty file and bad JSON are REASONS, with no token", !r("claude", claudeFile({ expiresAt: NOW })).token && /expired/.test(r("claude", claudeFile({ expiresAt: NOW })).reason)
        && /API key|not signed in/.test(r("claude", JSON.stringify({ primaryApiKey: "k" })).reason) && /API key/.test(r("codex", JSON.stringify({ OPENAI_API_KEY: "k" })).reason) && /not signed in/.test(r("codex", "{}").reason) && /not JSON/.test(r("claude", "{").reason));
});

console.log("2. THE ANSWER");
await section(() => {
    const c = U.parseUsage("claude", CLAUDE_BODY, NOW), x = U.parseUsage("codex", CODEX_BODY, NOW);
    ok("!! Claude: five_hour is the session, seven_day the week, utilization 0-100 as given, the reset times kept", c.session.used === 42 && c.weekly.used === 13.5 && c.session.resetsAt === "2026-11-21T15:00:00.000Z" && c.weekly.resetsAt === "2026-11-25T00:00:00.000Z");
    ok("!! Codex: the window's LENGTH decides session or week (not its name); used_percent as given; reset_at in seconds, else reset_after_seconds from now; the plan", x.session.used === 61 && x.weekly.used === 7 && x.weekly.resetsAt === new Date(1764000000e3).toISOString() && x.session.resetsAt === new Date(NOW + 600e3).toISOString() && x.plan === "plus"
        && U.parseUsage("codex", { rate_limit: { primary_window: { used_percent: 5, limit_window_seconds: 604800 } } }, NOW).weekly.used === 5 && U.parseUsage("codex", { rate_limit: { primary_window: { used_percent: 5, limit_window_seconds: 604800 } } }, NOW).session === null);
    ok("!! an unknown shape is NO reading (null), never a zero; a value outside 0-100 is held to it", U.parseUsage("claude", { usage: 3 }, NOW) === null && U.parseUsage("codex", { limits: [] }, NOW) === null && U.parseUsage("claude", null, NOW) === null
        && U.parseUsage("claude", { five_hour: { utilization: 140 } }, NOW).session.used === 100 && U.parseUsage("claude", { five_hour: { utilization: -3 } }, NOW).session.used === 0);
});

console.log("3. THE ROUND TRIP (a stand-in provider)");
await section(async () => {
    const files = { claude: claudeFile(), codex: codexFile() }, calls = [];
    const read = (f) => { if (f.endsWith(".credentials.json")) return files.claude; if (f.endsWith("auth.json")) return files.codex; throw new Error("ENOENT"); };
    const get = async (url, headers) => { calls.push({ url, headers }); return { status: 200, body: url === U.ENDPOINT.claude ? CLAUDE_BODY : CODEX_BODY }; };
    U._resetCache();
    const r = await U.usage({ read, get, env: {}, home: "/h", platform: "win32", now: NOW });
    const cc = calls.find((c) => c.url === U.ENDPOINT.claude), xc = calls.find((c) => c.url === U.ENDPOINT.codex);
    ok("!! each token goes ONLY to its own provider's endpoint, with that provider's headers", calls.length === 2 && cc.headers.Authorization === `Bearer ${TOKEN_C}` && cc.headers["anthropic-beta"] === "oauth-2025-04-20" && xc.headers.Authorization === `Bearer ${TOKEN_X}` && xc.headers["ChatGPT-Account-Id"] === "acct-1"
        && !JSON.stringify(cc).includes(TOKEN_X) && !JSON.stringify(xc).includes(TOKEN_C) && U.ENDPOINT.claude === "https://api.anthropic.com/api/oauth/usage" && U.ENDPOINT.codex === "https://chatgpt.com/backend-api/wham/usage");
    ok("!! the reading, and NO TOKEN anywhere in what the bridge returns", r.ok && r.claude.ok && r.claude.session.used === 42 && r.claude.plan === "max" && r.codex.ok && r.codex.weekly.used === 7 && !JSON.stringify(r).includes(TOKEN_C) && !JSON.stringify(r).includes(TOKEN_X) && !/STANDIN/.test(JSON.stringify(r)));
    await U.usage({ read, get, env: {}, home: "/h", now: NOW + U.TTL_MS - 1 }); const n1 = calls.length;
    await U.usage({ read, get, env: {}, home: "/h", now: NOW + U.TTL_MS - 1, force: true }); const n2 = calls.length;
    await U.usage({ read, get, env: {}, home: "/h", now: NOW + 2 * U.TTL_MS + 5 }); const n3 = calls.length;
    ok("!! TWO MINUTES OF CACHE: inside it nothing is asked; force asks; after it asks again", U.TTL_MS === 120000 && n1 === 2 && n2 === 4 && n3 === 6);
    const one = (p, o) => U.usageOf(p, { read, get, env: {}, home: "/h", platform: "win32", now: NOW, ...o });
    const refused = await one("claude", { get: async () => ({ status: 401, body: null }) }), dead = await one("codex", { get: async () => ({ status: 0, body: null, error: "ENOTFOUND" }) }), odd = await one("claude", { get: async () => ({ status: 200, body: { new: 1 } }) });
    const none = await one("codex", { read: () => { throw new Error("ENOENT"); } }), mac = await one("claude", { read: () => { throw new Error("ENOENT"); }, platform: "darwin" });
    ok("!! A REFUSAL, A DEAD ENDPOINT, AN UNKNOWN SHAPE, NO SIGN-IN AND THE MAC'S KEYCHAIN each read not-ok with their own reason, and none is a zero", !refused.ok && /refused.*401.*renew/.test(refused.why) && !dead.ok && /ENOTFOUND/.test(dead.why) && !odd.ok && /shape/.test(odd.why)
        && !none.ok && /not signed in/.test(none.why) && !mac.ok && /Keychain/.test(mac.why) && [refused, dead, odd, none, mac].every((x) => x.session === undefined && x.weekly === undefined));
    files.claude = claudeFile({ expiresAt: NOW - 1 }); calls.length = 0;
    const exp = await one("claude");
    ok("!! an expired sign-in is NOT SENT anywhere: the provider is never asked", !exp.ok && /expired/.test(exp.why) && calls.length === 0);
    U._resetCache();
});

console.log("4. THE DOCK");
await section(() => {
    const srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8"), sg = fs.readFileSync(path.join(ENG, "ui", "svgGaugeSet.js"), "utf8"), main = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
    const route = srv.slice(srv.indexOf('=== "/ai/usage"'), srv.indexOf('=== "/ai/usage"') + 600);
    ok("!! THE ROUTE: GET /ai/usage on the bridge, trusted callers only, through aiUsageBridge.usage with ?force", /require\("\.\/aiUsageBridge\.js"\)/.test(srv) && route.length > 100 && /_isTrustedReq\(req\)/.test(route) && /aiUsageBridge\.usage\(\{ force \}\)/.test(route));
    const labels = ["claude5h: \"CLAUDE 5H\"", "claudeweek: \"CLAUDE WK\"", "codex5h: \"CODEX 5H\"", "codexweek: \"CODEX WK\""];
    const defs = sg.slice(sg.indexOf("const DEFAULT_GAUGES"), sg.indexOf("];", sg.indexOf("const DEFAULT_GAUGES"))), order = [...defs.matchAll(/(source|action): "(\w+)"/g)].map((m) => m[2]);
    ok("!! THE GAUGE SET: four sources named; the dock's new row is CLAUDE 5H, CLAUDE WK, CODEX 5H, LAST, after the action row, so a saved dock is padded with it", labels.every((l) => sg.includes(l)) && order.slice(-6).join() === "record,mp4,clip,claude5h,claudeweek,codex5h" && order.length % 3 === 0);
    ok("!! one fetch of /ai/usage feeds all four, only when one is mounted, and they are kept out of the /gauge/state bag", /const needsUsage = handles\.some\(h => USAGE_SOURCES\[h\.source\]\)/.test(sg) && /if \(needsUsage\) \{[\s\S]{0,200}fetch\("\/ai\/usage"/.test(sg) && /&& !USAGE_SOURCES\[h\.source\]\)/.test(sg));
    ok("!! an empty dial reads \"-\" with a tooltip saying why; a live one says when it resets", /if \(!w\) \{ h\.update\(0, "–", false\); if \(h\.setTitle\) h\.setTitle\(r && r\.why/.test(sg) && /resets " \+ new Date\(w\.resetsAt\)/.test(sg) && /setTitle\(t\) \{ cell\.title = t/.test(sg));
    ok("!! the four can be picked for any slot in the settings panel (main.js's GAUGE_SOURCES)", /const GAUGE_SOURCES = \[[^\]]*"claude5h", "claudeweek", "codex5h", "codexweek"/.test(main));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG:
// 14 mutants of ai-bridge/aiUsageBridge.js, each in a hard-linked copy of the tree: ALL 14 RED the first time (CODEX_HOME ignored, an expired sign-in let
// through, Claude's week read from five_hour, Codex's windows by name only, no clamp to 0-100, an unknown shape read as a reading, the token returned, the
// wrong beta header, no account header, a refusal read as an answer, no cache, force ignored, the Keychain left unsaid, a cache of 12 seconds).
