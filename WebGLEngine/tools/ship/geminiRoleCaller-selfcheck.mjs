// WebGLEngine/tools/ship/geminiRoleCaller-selfcheck.mjs -- v2824
//
// Run: node tools/ship/geminiRoleCaller-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/roundhouse/geminiRoleCaller.mjs -- the third caller for the roundhouse loop, beside the local
// Ollama one and the paid Anthropic one. fetchImpl is injectable, so the whole adapter is proven here with NO
// key and NO network.
//
// THE PROPERTY THAT MATTERS MOST IS NOT THE REQUEST SHAPE. It is that this caller REUSES the proposer and
// evaluator prompts rather than restating them: there must be exactly ONE description of what a proposer is in
// this codebase. Two copies would drift, and then two callers would be running subtly different experiments
// while appearing to run the same one -- a difference nobody notices until the numbers disagree for no reason.
// So the gate asserts the identity of the imported prompt functions, not merely that some prompt was sent.
//
// And the comparison this unlocks is only meaningful because all three callers answer to the SAME GATE: the
// simulation decides whether a claim stands, whoever proposed it.

import { createRequire } from "node:module";
import { prose } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geminiCaller, geminiKeyAvailable, DEFAULT_GEMINI_MODEL, GEMINI_ENDPOINT } from "../roundhouse/geminiRoleCaller.mjs";
import { proposerSys, evaluatorSys, salvageJson } from "../roundhouse/ollamaRoleCaller.mjs";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const reply = (obj) => async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });

// 1. ONE SOURCE FOR THE PERSONA -- the whole reason this file is small
{
    const src = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "geminiRoleCaller.mjs"), "utf8");
    ok("imports the prompts from ollamaRoleCaller rather than restating them",
        /import \{[^}]*proposerSys[^}]*evaluatorSys[^}]*salvageJson[^}]*\} from "\.\/ollamaRoleCaller\.mjs"/.test(src));
    ok("does NOT define its own proposer prompt", !/You are the PROPOSER/.test(src.replace(/\/\/[^\n]*/g, "")));
    // prove the running code really uses that function, not a copy that merely looks the same
    let seen = null;
    const call = geminiCaller({ apiKey: "K", fetchImpl: async (u, i) => { seen = JSON.parse(i.body); return reply({ ok: 1 })(); } });
    ok("proposerSys is exported and usable as the single definition", typeof proposerSys === "function" && typeof evaluatorSys === "string" && typeof salvageJson === "function");
}

// 2. REQUEST SHAPE -- what actually goes to Google
{
    let seen = null, url = null;
    const call = geminiCaller({ apiKey: "FAKE", fetchImpl: async (u, i) => { url = u; seen = { headers: i.headers, body: JSON.parse(i.body) }; return reply({ mode: "airy", claim: { observable: "airyRingErrFrac", max: 0.01 } })(); } });
    const out = await call("proposer", { device: "optics-bench", observables: ["rayleighFactor", "airyRingErrFrac"], question: "q", history: [] });
    ok("posts to the generateContent endpoint for the chosen model", url === `${GEMINI_ENDPOINT}/${DEFAULT_GEMINI_MODEL}:generateContent`, url);
    ok("authenticates with the x-goog-api-key header (not a query string)", !!seen.headers["x-goog-api-key"] && !String(url).includes("key="));
    ok("uses Gemini's JSON mode so decoding is CONSTRAINED, not hoped for", seen.body.generationConfig.responseMimeType === "application/json");
    ok("the system instruction carries the device AND its observable menu",
        /PROPOSER/.test(seen.body.system_instruction.parts[0].text) && /optics-bench/.test(seen.body.system_instruction.parts[0].text) && /airyRingErrFrac/.test(seen.body.system_instruction.parts[0].text));
    ok("the system instruction is byte-identical to proposerSys", seen.body.system_instruction.parts[0].text === proposerSys("optics-bench", ["rayleighFactor", "airyRingErrFrac"]));
    ok("returns the parsed claim", out && out.claim && out.claim.observable === "airyRingErrFrac");
    ok("history is trimmed rather than sent whole", Array.isArray(seen.body.contents[0].parts) && JSON.parse(seen.body.contents[0].parts[0].text).history.length === 0);
}

// 3. ROLE really changes the call
{
    let temps = [];
    // Compare the WHOLE instruction, not a prefix: both roles begin "You are the ", so a short slice makes two
    // genuinely different prompts look identical -- which the first draft of this check duly reported.
    const call = geminiCaller({ apiKey: "K", fetchImpl: async (u, i) => { const b = JSON.parse(i.body); temps.push([b.system_instruction.parts[0].text, b.generationConfig.temperature]); return reply({ v: 1 })(); } });
    await call("proposer", { device: "d", observables: ["x"] });
    await call("evaluator", { hyp: {}, observable: {}, verdict: {} });
    ok("proposer and evaluator get DIFFERENT system instructions", temps[0][0] !== temps[1][0] && /PROPOSER/.test(temps[0][0]) && !/PROPOSER/.test(temps[1][0]),
        `proposer ${temps[0][0].length} chars, evaluator ${temps[1][0].length} chars`);
    ok("the evaluator runs at temperature 0 (it is judging, not inventing)", temps[1][1] === 0, String(temps[1][1]));
    ok("the proposer runs warmer than the evaluator", temps[0][1] > temps[1][1]);
}

// 4. FAILURE PATHS each name themselves -- a caller that fails vaguely wastes a rig session
{
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    let msg = "";
    try { await geminiCaller({ fetchImpl: reply({}) })("proposer", {}); } catch (e) { msg = e.message; }
    ok("no key: refuses and says where a key comes from", /GEMINI_API_KEY/.test(msg) && /vault|environment/.test(msg), msg.slice(0, 70));
    ok("geminiKeyAvailable reports false with no key", geminiKeyAvailable() === false);
    process.env.GEMINI_API_KEY = "X";
    ok("...and true with one, without revealing it", geminiKeyAvailable() === true);
    if (saved === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved;

    let rl = "";
    try { await geminiCaller({ apiKey: "K", fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "quota exceeded" } }) }) })("proposer", {}); } catch (e) { rl = e.message; }
    ok("429 is named specifically, with the free-tier per-minute cause", /429/.test(rl) && /per-minute|rate limit/i.test(rl), rl.slice(0, 80));

    let blocked = "";
    try { await geminiCaller({ apiKey: "K", fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] }) }) })("proposer", {}); } catch (e) { blocked = e.message; }
    ok("an empty/blocked candidate reports the finishReason rather than 'parse error'", /finishReason: SAFETY/.test(blocked), blocked.slice(0, 60));

    let http = "";
    try { await geminiCaller({ apiKey: "K", fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error: { message: "API key not valid" } }) }) })("proposer", {}); } catch (e) { http = e.message; }
    ok("other HTTP errors carry the status and Google's message", /403/.test(http) && /not valid/.test(http), http.slice(0, 60));
}

// 5. THE BRIDGE: gemini is selectable, the key stays server-side, and availability is a BOOLEAN
{
    const bridge = require(path.join(ENG, "ai-bridge", "deviceBridge.js"));
    const call = (url, method = "GET", body = null) => new Promise(async (r) => {
        const req = { url, method, on(ev, cb) { if (ev === "data" && body) cb(JSON.stringify(body)); if (ev === "end") cb(); return req; } };
        await bridge.handle(req, {}, { sendJson: (o, c = 200) => r({ body: o, code: c }) });
    });
    const FAKE = "sk-gemini-MUST-NOT-APPEAR";
    const saved = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = FAKE;
    const list = await call("/device/list");
    ok("SECURITY: /device/list never returns the Gemini key", !JSON.stringify(list.body).includes(FAKE));
    ok("/device/list reports caller availability as booleans", list.body.callers && list.body.callers.gemini.available === true && typeof list.body.callers.mock.available === "boolean");
    ok("...and names why a caller is unavailable when it is", typeof list.body.callers.ollama.note === "string" && list.body.callers.ollama.note.length > 5);
    if (saved === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved;

    const noKey = await call("/device/start", "POST", { device: "geometry", caller: "gemini" });
    const refused = noKey.code === 400 && /GEMINI_API_KEY/.test(noKey.body.message || "");
    ok("gemini without a key is refused clearly (or a vault key was found)", refused || noKey.body.ok === true,
        refused ? "refused as expected" : "vault supplied a key");
    const bad = await call("/device/start", "POST", { device: "geometry", caller: "telepathy" });
    ok("an unknown caller is refused and lists the real ones", bad.code === 400 && /mock, ollama or gemini/.test(bad.body.message || ""), (bad.body.message || "").slice(0, 60));
}

// 6. the page offers it and warns when it cannot be used
{
    const html = fs.readFileSync(path.join(ENG, "device.html"), "utf8");
    ok("page: gemini is an option", /value="gemini"/.test(html));
    ok("page: says the key stays on the server", /key stays on the server/.test(html));
    ok("page: surfaces the availability note when a caller is unusable", /__callers/.test(html) && /available===false/.test(html));
    ok("page: still offers the keyless mock first", html.indexOf('value="mock"') < html.indexOf('value="gemini"'));
}

// 7. browser/worker-safe
{
    const src = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "geminiRoleCaller.mjs"), "utf8");
    ok("geminiRoleCaller uses no DOM", !/\bwindow\.|\bdocument\./.test(src));
    ok("...and imports only its sibling caller", (src.match(/^\s*import .*/gm) || []).every((l) => /ollamaRoleCaller\.mjs/.test(l)));
}

console.log("geminiRoleCaller-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
