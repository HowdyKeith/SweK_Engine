// WebGLEngine/tools/ship/brainStages-selfcheck.mjs -- v4831
//
// *** THE SHIP'S COMPUTER THINKS IN TWO STAGES, AND THE PAGE CAN SEE BOTH NOW -- SO THE ORB HAS TWO MORE STATES. ***
//
// ai-bridge/ragBridge.js's POST /ai/brain/ask has always been two stages -- retrieve the top-k passages, then
// generate an answer grounded in them -- but it answered in ONE response, and its one browser caller (ev.html's
// ship's computer) awaited it whole. tools/ship/nextRounds.mjs held the presence orb's `searching` and `weaving`
// states blocked on exactly that since v4628: "no two-stage AI work is separately observable from the page".
// v4831 streams the stages (stream:true -> NDJSON, one line per stage), ui/brainAsk.mjs turns each into an
// engine:brainStage window event, the orb widget lights `searching` and `weaving` on them, and the state table
// grows two rows that render AS murmur states rather than past the end of murmur's windows.
//
// FOUR SECTIONS. (1) the bridge, over real HTTP, against a stand-in Ollama that takes 300 ms to answer: the stages
// arrive in order and RETRIEVAL IS SEEN FINISHING BEFORE GENERATION DOES, which is the whole claim; the streamed
// final object is the plain call's object; no model means no weaving stage. (2) ui/brainAsk.mjs against that server,
// and against an older bridge that ignores `stream`. (3) the two state rows: which shader index each renders as,
// weaving's gain by source count, and the host integrals reading the rendered-as state. (4) the wiring: the widget,
// the demo page and ev.html.
//
// SABOTAGES, each restored, each RED on its own row: ragBridge's emit for search-done moved after generation
// (section 1, the order and timing rows, and section 2); the stream's final line written as the plain object without
// "stage" (section 1: the order, timing and equality rows, and section 2's askBrain row); weave-start emitted with no model (section 1, the no-model row); brainAsk's line
// splitter reading only whole chunks (section 2, the chunk row); weaving AS thinking (section 3); the tempest think
// term back on cur === "thinking" (section 3, the integral row); the widget's weave-start branch deleted (section 4).
"use strict";

import fs from "node:fs";
import http from "node:http";
import { PassThrough } from "node:stream";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { askBrain } from "../../ui/brainAsk.mjs";
import * as ST from "../../render/aiPresenceOrbState.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const rag = require_(path.join(ENG, "ai-bridge", "ragBridge.js"));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("brainStages-selfcheck -- the ship's computer's two stages, and the orb states that ride them\n");

const listen = (handler) => new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, "127.0.0.1", () => resolve(s)); });
const GEN_MS = 300;
// A stand-in Ollama: POST /api/generate answers after GEN_MS, the way a real model takes its time.
const ollama = await listen((req, res) => {
    let d = ""; req.on("data", (c) => { d += c; });
    req.on("end", () => setTimeout(() => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ response: "  the answer  " })); }, GEN_MS));
});
const PASSAGES = [{ id: "planet:Earth", text: "a blue world", distance: 0.1 }, { id: "mission:Run", text: "a courier job", distance: 0.2 },
                  { id: "planet:Mars", text: "a red world", distance: 0.3 }];
const mkCtx = (withModel) => ({
    store: { embed: async () => [0.1, 0.2], ragSearch: (emb, k) => PASSAGES.slice(0, k) },
    ollamaBase: () => `http://127.0.0.1:${ollama.address().port}`,
    ollamaModelName: async () => (withModel ? "stand-in" : null),
});
const bridgeWith = (ctx) => listen((req, res) => rag.handle(req, res, ctx));
const withModel = await bridgeWith(mkCtx(true)), noModel = await bridgeWith(mkCtx(false));
const urlOf = (s) => `http://127.0.0.1:${s.address().port}/ai/brain/ask`;

// *** THE STREAM IS READ BY THE CLIENT THE PAGE USES, AND EACH STAGE IS TIMED AS IT IS DISPATCHED. *** The first draft
// read the stream with its own fetch, a second copy of ui/brainAsk.mjs's reader -- and tools/ship/gateAxioms-selfcheck.mjs
// counts every gate whose own code calls fetch( as one that "reaches the network", which this one does only on loopback,
// to servers it starts itself. The honest repair is the better test: askBrain IS what ev.html runs, so the timing is now
// when the page's own client hands the orb each stage. (The sockets are still opened -- by the module under test.)
async function streamed(server, body) {
    const t0 = Date.now(), got = [];
    await askBrain(body.query, { k: body.k, url: urlOf(server), dispatch: (ev) => got.push({ at: Date.now() - t0, ev }) });
    return { got };
}
// The PLAIN call, through the bridge's own handle() with an in-memory request and response: the same code path the server
// runs, minus a socket this gate has no reason to open a second time.
function plainCall(ctx, body) {
    return new Promise((resolve) => {
        const req = new PassThrough(); req.method = "POST";
        let head = {}, out = "";
        const res = { writeHead: (code, h) => { head = Object.assign({ code }, h || {}); }, write: (c) => { out += c; },
                      end: (c) => { if (c) out += c; resolve({ head, json: JSON.parse(out) }); } };
        rag.handle(req, res, ctx);
        req.end(JSON.stringify(body));
    });
}

try {
// =============================================================================================================
sec("1. *** THE BRIDGE: two stages on the wire, and retrieval seen finishing BEFORE generation does ***");
{
    const s = await streamed(withModel, { query: "where is earth", k: 2, stream: true });
    const stages = s.got.map((g) => g.ev.stage);
    for (const g of s.got) say(`${String(g.at).padStart(4)} ms  ${JSON.stringify(g.ev).slice(0, 120)}`);
    ok("!! *** the stages arrive in order: search-start, search-done, weave-start, done ***",
        stages.join(",") === "search-start,search-done,weave-start,done",
        `${stages.join(" -> ")} -- search-done exists only on the streamed form (askBrain reads an unstreamed answer as start-then-done)`);
    const at = (st) => (s.got.find((g) => g.ev.stage === st) || {}).at;
    ok("!! *** RETRIEVAL IS OBSERVABLE: search-done and weave-start reach the client while the model is still generating ***",
        at("done") - at("weave-start") >= GEN_MS * 0.8 && at("search-done") <= at("weave-start"),
        `search-done at ${at("search-done")} ms, weave-start at ${at("weave-start")} ms, done at ${at("done")} ms, against a ` +
        `${GEN_MS} ms model. THIS IS THE WHOLE CLAIM: the single fetch this replaces delivered everything at ${at("done")} ms, ` +
        `so there was no moment in which retrieval had finished and generation had not -- nothing for searching to light ` +
        `DURING, and nothing for weaving to start ON.`);
    const doneLine = s.got.find((g) => g.ev.stage === "done"), done = doneLine ? doneLine.ev : {};   // absent is a red row, not a crash
    const pc = await plainCall(mkCtx(true), { query: "where is earth", k: 2 }), plain = pc.json;
    const { stage, ...doneRest } = done;
    ok("!! *** without stream:true the response is the plain object, and the stream's last line IS that object ***",
        /application\/json/.test(pc.head["Content-Type"] || "") && JSON.stringify(doneRest) === JSON.stringify(plain) &&
        plain.answer === "the answer" && plain.grounded === true && plain.sources.length === 2,
        `plain: ${JSON.stringify(plain).slice(0, 140)}. Both come out of ragBridge.ask(), one pipeline, so the two forms cannot ` +
        `disagree about what the computer said -- and every caller that never asked for a stream gets exactly what it got before.`);
    const n = await streamed(noModel, { query: "q", k: 3, stream: true });
    const ns = n.got.map((g) => g.ev.stage), nd = n.got.length ? n.got[n.got.length - 1].ev : {};
    ok("!! ...and with no model reachable there is NO weaving stage -- the passages come back as the answer",
        ns.join(",") === "search-start,search-done,done" && nd.answer === null && (nd.sources || []).length === 3 && /retrieval only/.test(nd.note || ""),
        `${ns.join(" -> ")}; note "${nd.note}". The orb lights weaving only when something is actually composing.`);
}

// =============================================================================================================
sec("2. *** THE CLIENT: ui/brainAsk.mjs turns each line into one engine:brainStage, and survives an older bridge ***");
{
    const seen = [];
    const r = await askBrain("where is earth", { k: 3, url: urlOf(withModel), dispatch: (d) => seen.push(d) });
    ok("!! *** askBrain dispatches every stage the bridge wrote, in order, and returns the final answer ***",
        seen.map((d) => d.stage).join(",") === "search-start,search-done,weave-start,done" &&
        seen[2].sources === 3 && r.ok === true && r.answer === "the answer",
        `${seen.map((d) => d.stage + (typeof d.sources === "number" ? "(" + d.sources + ")" : "")).join(" -> ")}; answer "${r.answer}"`);

    // lines split across chunk boundaries, as a real network delivers them
    const lines = ['{"stage":"search-start"}', '{"stage":"search-done","sources":2,"grounded":true}',
                   '{"stage":"weave-start","sources":2,"model":"m"}', '{"stage":"done","ok":true,"answer":"hi","sources":[1,2]}'];
    const chunked = () => new Response(new ReadableStream({ start(c) { const e = new TextEncoder(), all = lines.join("\n") + "\n";
        for (let i = 0; i < all.length; i += 7) c.enqueue(e.encode(all.slice(i, i + 7))); c.close(); } }), { headers: { "Content-Type": "application/x-ndjson" } });
    const seen2 = []; const r2 = await askBrain("q", { fetchImpl: async () => chunked(), dispatch: (d) => seen2.push(d.stage) });
    ok("!! a line split across seven-byte chunks is reassembled, not dropped",
        seen2.join(",") === "search-start,search-done,weave-start,done" && r2.answer === "hi", seen2.join(" -> "));

    const seen3 = []; const r3 = await askBrain("q", { fetchImpl: async () => new Response(JSON.stringify({ ok: true, answer: "old", sources: [] }),
        { headers: { "Content-Type": "application/json" } }), dispatch: (d) => seen3.push(d.stage) });
    ok("!! an OLDER bridge that ignores stream still answers -- and no weaving stage is invented for it",
        seen3.join(",") === "search-start,done" && r3.answer === "old", seen3.join(" -> "));
    const seen4 = []; const r4 = await askBrain("q", { fetchImpl: async () => { throw new Error("ECONNREFUSED"); }, dispatch: (d) => seen4.push(d.stage) });
    ok("!! an unreachable bridge is an error stage, so the orb goes to error and back rather than hanging in searching",
        seen4.join(",") === "error" && r4.ok === false && /unreachable/.test(r4.why), `${seen4.join(",")}: ${r4.why}`);
}

// =============================================================================================================
sec("3. *** THE TWO STATES: rows that render AS murmur states, and a weave that brightens with its sources ***");
{
    const six = ["idle", "listening", "thinking", "responding", "success", "error"];
    ok("!! *** murmur's six keep their indices, and the brain stages render as thinking (2) and responding (3) ***",
        ST.STATE_NAMES.join(",") === six.join(",") && six.every((n, i) => ST.STATE_INDEX[n] === i && ST.shaderIndexOf(n) === i) &&
        ST.shaderIndexOf("searching") === 2 && ST.shaderIndexOf("weaving") === 3 && !("searching" in ST.STATE_INDEX) &&
        ST.ALL_STATE_NAMES.length === 8,
        `searching -> ${ST.shaderIndexOf("searching")}, weaving -> ${ST.shaderIndexOf("weaving")}. Appended as rows 6 and 7 they would ` +
        `have sat past every window murmur's mh_live and mh_state define -- drawn exactly as an ERROR is.`);
    const g = (n) => ST.stateParams("weaving", { sources: n }).glow;
    const base = ST.BRAIN_STATES.weaving.glow;
    say(`weaving glow at 0, 3, 6 and 12 sources: ${[0, 3, 6, 12].map((n) => g(n).toFixed(4)).join(", ")} (row ${base})`);
    ok("!! weaving's glow gains with the number of sources it composes from, saturating at WEAVE_CAP",
        g(0) === base && Math.abs(g(3) - base * (1 + ST.WEAVE_GAIN / 2)) < 1e-12 && Math.abs(g(6) - base * (1 + ST.WEAVE_GAIN)) < 1e-12 && g(12) === g(6) &&
        ST.stateParams("searching", { sources: 6 }).glow === ST.BRAIN_STATES.searching.glow,
        `x${(g(6) / base).toFixed(3)} at ${ST.WEAVE_CAP} or more, none at zero; searching ignores the count`);

    // The host integrals read the state the shader is handed: tempest's THINKING term must fire for searching too.
    // STEADY-STATE SLOPES, not whole-run totals: the two states have different speeds, so the crossfade out of idle
    // accumulates differently and a total compares the ramps, not the rule. After the crossfade and the signal
    // envelopes have settled, each integral's gain PER UNIT OF TEMPO is the instantaneous quantity it integrates.
    const slope = (name, key) => { const s = ST.createPresenceState("idle"); s.setState(name, name === "weaving" ? { sources: 2 } : {});
        for (let i = 0; i < 600; i++) s.tick(1 / 60, { activity: 0.6, voice: 0 });
        const a = s.getParams(); for (let i = 0; i < 60; i++) s.tick(1 / 60, { activity: 0.6, voice: 0 }); const b = s.getParams();
        return { v: (b[key] - a[key]) / (b.phase - a.phase), si: b.stateIndex }; };
    const th = slope("thinking", "tempestEnergyInt"), se = slope("searching", "tempestEnergyInt"),
          re = slope("responding", "driveInt"), we = slope("weaving", "driveInt"), id = slope("idle", "tempestEnergyInt");
    say(`tempest energy per unit tempo: thinking ${th.v.toFixed(6)}, searching ${se.v.toFixed(6)}, idle ${id.v.toFixed(6)}; ` +
        `drive per unit tempo: responding ${re.v.toFixed(6)}, weaving ${we.v.toFixed(6)}; indices ${th.si}/${se.si}/${re.si}/${we.si}`);
    ok("!! *** the host integrates a brain stage as the state it renders as -- searching's storm is thinking's, weaving's drive is responding's ***",
        se.si === 2 && we.si === 3 && Math.abs(se.v - th.v) < 1e-9 && se.v > id.v + 0.5 && Math.abs(we.v - re.v) < 1e-9 && we.v > 0,
        "tempest.ts lifts its energy by 0.65 in THINKING, read off the state index; a host that tested the NAME would have " +
        "integrated searching without it while the shader drew it with it -- the clock and the picture disagreeing");

    const s = ST.createPresenceState("idle");
    s.setState("weaving", { sources: 1 }); for (let i = 0; i < 60; i++) s.tick(1 / 60, {});
    const before = s.getParams(); s.setState("weaving", { sources: 6 }); const after = s.getParams();
    ok("!! a later source count on the same weave updates its gain without restarting the state",
        after.stateTau === before.stateTau && after.sources === 6 && after.glow > before.glow,
        `stateTau ${before.stateTau.toFixed(3)} held; glow ${before.glow.toFixed(4)} -> ${after.glow.toFixed(4)}`);
}

// =============================================================================================================
sec("4. *** THE WIRING: the widget lights them, the shader is handed the rendered-as index, ev.html asks this way ***");
{
    const widget = fs.readFileSync(path.join(ENG, "ui", "aiPresenceOrbWidget.js"), "utf8");
    const demo = fs.readFileSync(path.join(ENG, "ai-presence-orb.html"), "utf8");
    const ev = fs.readFileSync(path.join(ENG, "ev.html"), "utf8");
    ok("!! *** the widget lights searching on search-start, weaving (with its count) on weave-start, and settles the answer as a reply ***",
        /addEventListener\("engine:brainStage"/.test(widget) &&
        /d\.stage === "search-start"\) \{ clearSettle\(\); state\.setState\("searching"\); \}/.test(widget) &&
        /d\.stage === "weave-start"\) \{ clearSettle\(\); state\.setState\("weaving", \{ sources: d\.sources \| 0 \}\); \}/.test(widget) &&
        /d\.stage === "done"\) replyFlow\(/.test(widget) && /d\.stage === "error"\) errorFlow\(\)/.test(widget) &&
        /addEventListener\("engine:voiceReply", \(e\) => replyFlow\(/.test(widget),
        "and a voice reply and a brain answer share ONE settle sequence (replyFlow), so the two cannot drift apart");
    ok("!! the shader is handed the state module's resolved index on both pages that render the orb",
        /stateIndex: p\.stateIndex,/.test(widget) && /stateIndex: p\.stateIndex,/.test(demo) &&
        !/STATE_INDEX\[p\.state\]/.test(widget) && !/STATE_INDEX\[p\.state\]/.test(demo) && /for \(const name of ALL_STATE_NAMES\)/.test(demo),
        "STATE_INDEX[p.state] is undefined for a brain stage -- the shader would have been handed undefined");
    ok("!! ev.html's ship's computer asks through ui/brainAsk.mjs and mounts the orb on the first question, not with the page",
        /^import \{ askBrain \} from "\.\/ui\/brainAsk\.mjs";/m.test(ev) && /askBrain\(q, \{ k: 4, dispatch:/.test(ev) &&
        /function ensureComputerOrb\(\)/.test(ev) && /ensureComputerOrb\(\);/.test(ev) && /import\("\.\/ui\/aiPresenceOrbWidget\.js"\)/.test(ev) &&
        !/fetch\("\/ai\/brain\/ask"/.test(ev),
        "the one browser caller of /ai/brain/ask, importing the client statically (v4831: a dynamic import() left it a prose-rescued " +
        "orphan to tools/ship/referenceKind-selfcheck.mjs) and the ORB lazily -- a pilot who never asks never pays for its canvas");
}
} finally {
    for (const s of [ollama, withModel, noModel]) { try { s.close(); } catch (_) {} }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the ship's computer's two stages on the wire, and the two orb states they unblock -- " +
    "searching and weaving, held OPEN in tools/ship/nextRounds.mjs since v4628 on 'no two-stage AI work is separately " +
    "observable from the page'." +
    "\nWHAT IS NOT CLAIMED: how the two states LOOK. Their multipliers are this port's own (murmur has no such states), " +
    "and no frame here is rendered -- a pixel row would grade numbers nobody has yet looked at on a real orb. Nor is a real " +
    "Ollama or a real RAG store driven: both are stand-ins, over real HTTP. connecting and shaping are still reserved, " +
    "because nothing in this tree has a moment for them.");
process.exit(fails ? 1 : 0);
