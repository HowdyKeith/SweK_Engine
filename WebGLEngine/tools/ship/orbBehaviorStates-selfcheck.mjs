// WebGLEngine/tools/ship/orbBehaviorStates-selfcheck.mjs -- v4670
//
// *** PHASE 2 OF THE AI-PRESENCE ORB: TWO BEHAVIOUR STATES, AND THE BLOCKER THAT HELD THEM FOR FORTY ROUNDS.
// ***
//
// tools/ship/nextRounds.mjs's `ai-presence-orb-behavior-states-phase2` reserved four names off a review of
// Jakubantalik/thinking-orbs (MIT) -- searching, connecting, weaving, shaping -- and then REFUSED to wire any
// of them, on a rule this tree's own orb work earned: an unwired state is decoration, not signal.
//
// *** THE BLOCKER WAS NEVER "NO TWO-STAGE AI WORK EXISTS". *** ai-bridge/ragBridge.js has retrieved-then-
// generated since it was written. The blocker, sharpened at v4628, was that both stages left in ONE response,
// so a page awaiting one fetch never observed stage 1 finishing: "there is nothing for `searching` to be lit
// DURING". That entry named its own unblock -- make /ai/brain/ask emit its two stages separately -- and this
// round did exactly that and no more.
//
// *** TWO OF THE FOUR ARE WIRED AND TWO ARE STILL RESERVED, WHICH THIS GATE ASSERTS. *** `connecting` and
// `shaping` still have nothing observable to attach to. Section 5 goes red if they appear anyway.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import * as ST from "../../render/aiPresenceOrbState.mjs";
import { mhLive, mhState } from "../../render/murmurKit.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("orbBehaviorStates-selfcheck -- the RAG bridge's two stages, and the two orb states they earned\n");

const MURMUR_SIX = ["idle", "listening", "thinking", "responding", "success", "error"];
const ADDED = ST.STATE_NAMES.slice(6);

// =============================================================================================================
sec("1. *** THE UNBLOCK: /ai/brain/ask EMITS ITS RETRIEVAL BEFORE IT ASKS THE MODEL ***");
{
    const rag = require(path.join(ENG, "ai-bridge", "ragBridge.js"));
    // A SLOW MODEL, so a response that merely LOOKS staged is distinguishable from one that is. If both
    // lines were buffered and flushed together at the end, the gap below would be 0 and this row would go
    // red -- which is the failure mode the v4628 note describes and the reason the gap is measured at all.
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => { await new Promise((r) => setTimeout(r, 250));
        return { ok: true, json: async () => ({ response: "an answer" }) }; };
    const ctx = {
        store: { embed: async () => [0.1, 0.2],
                 ragSearch: () => [{ id: "planet:a", text: "A", distance: 0.1 },
                                   { id: "planet:b", text: "B", distance: 0.2 },
                                   { id: "planet:c", text: "C", distance: 0.3 }] },
        ollamaBase: () => "http://localhost:11434",
        ollamaModelName: async () => "test-model",
    };
    const run = (body) => new Promise((resolve) => {
        const req = new EventEmitter(); req.method = "POST"; req.url = "/ai/brain/ask";
        const t0 = Date.now(); const ev = [];
        const res = {
            writeHead: (c, h) => ev.push({ at: Date.now() - t0, kind: "head", code: c, ct: h && h["Content-Type"] }),
            write: (s) => { ev.push({ at: Date.now() - t0, kind: "write", body: String(s).trim() }); return true; },
            end: () => resolve(ev),
        };
        rag.handle(req, res, { ...ctx, sendJson: (o, c) => { ev.push({ at: Date.now() - t0, kind: "json", code: c || 200, obj: o }); resolve(ev); } });
        req.emit("data", JSON.stringify(body)); req.emit("end");
    });
    const streamed = await run({ query: "q", k: 3, stream: true });
    const plain = await run({ query: "q", k: 3 });
    globalThis.fetch = realFetch;

    const head = streamed.find((e) => e.kind === "head");
    const lines = streamed.filter((e) => e.kind === "write").map((e) => ({ at: e.at, o: JSON.parse(e.body) }));
    const ret = lines.find((l) => l.o.stage === "retrieved"), ans = lines.find((l) => l.o.stage === "answer");
    const gap = (ret && ans) ? ans.at - ret.at : -1;
    say(`streamed: ${head ? head.ct : "(no head)"}, ${lines.length} line(s); retrieval at +${ret ? ret.at : "?"}ms, answer at +${ans ? ans.at : "?"}ms`);
    say(`the window searching is lit during: ${gap}ms, against a model that took 250ms`);
    ok("!! *** THE RETRIEVAL LINE IS ON THE WIRE BEFORE THE MODEL IS EVEN CALLED ***",
        !!head && head.ct === "application/x-ndjson" && lines.length === 2 &&
        ret && ans && ret.at < ans.at && gap >= 200 &&
        ret.o.sources.length === 3 && ret.o.grounded === true && ans.o.answer === "an answer",
        `two NDJSON lines in stage order, ${gap}ms apart with a 250ms model. *** THE GAP IS THE ASSERTION ` +
        `AND NOT THE LINE COUNT: *** a handler that built both objects and wrote them back to back at the ` +
        `end would emit exactly the same two lines and read a gap of 0. That is the defect this round ` +
        `exists to fix, and it would otherwise look identical from here.`);

    // *** AND THE OLD SHAPE IS UNTOUCHED, WHICH IS WHAT LETS THIS SHIP AT ALL. *** ev.html's own fallback
    // path and every other caller send no `stream` flag and must get the single object they always got.
    const j = plain.find((e) => e.kind === "json");
    say(`unstreamed: ${plain.length} response(s), keys ${j ? Object.keys(j.obj).join(",") : "(none)"}`);
    ok("!! ...and a caller that does not ask for the stream gets the one object it always got",
        plain.length === 1 && j && j.code === 200 && j.obj.ok === true &&
        j.obj.answer === "an answer" && j.obj.sources.length === 3 && j.obj.grounded === true &&
        !("stage" in j.obj),
        `one sendJson, no writeHead, no NDJSON, and no stage key anywhere in it. THE ADDITIVE SHAPE IS ` +
        `THE REASON THIS IS NOT A BREAKING CHANGE: ev.html's older path does fetch(...).then(x => x.json()), ` +
        `which an NDJSON body would have thrown a syntax error on.`);
}

// =============================================================================================================
sec("2. *** THE TABLE GREW BY TWO AND murmur's SIX DID NOT MOVE ***");
{
    say(`STATE_NAMES: ${ST.STATE_NAMES.join(", ")}`);
    say(`added by this tree: ${ADDED.join(", ") || "(none)"}; each renders as ${ADDED.map((n) => ST.STATES[n].renders).join(", ") || "-"}`);
    ok("!! *** murmur's SIX ARE STILL THE FIRST SIX, IN ORDER, AT THE INDICES ITS WINDOWS ARE CUT FOR ***",
        MURMUR_SIX.every((n, i) => ST.STATE_NAMES[i] === n) && ST.STATE_INDEX.listening === 1 &&
        ST.STATE_INDEX.thinking === 2 && ST.STATE_INDEX.responding === 3 && ST.STATE_INDEX.success === 4,
        `kit.ts cuts its windows on the NUMBER -- listening (0.5,1.5), working (1.5,3.5), drive (2.5,3.5), ` +
        `ignition (3.5,4.5) -- so an insertion anywhere in the first six would move a state out of a window ` +
        `silently. A new row may only be APPENDED, and this row is what says so.`);
    ok("!! ...and every added state renders as one of murmur's six, so the shader is never handed a 6 or a 7",
        ADDED.length === 2 && ADDED.every((n) => MURMUR_SIX.includes(ST.STATES[n].renders)) &&
        ADDED.every((n) => ST.stateRenderIndex(n) < 6) &&
        MURMUR_SIX.every((n) => ST.stateRenderIndex(n) === ST.STATE_INDEX[n]),
        `${ADDED.map((n) => `${n} -> ${ST.STATES[n].renders} (${ST.stateRenderIndex(n)})`).join(", ")}. ` +
        `murmur's own six render as themselves, so the mapping is the identity everywhere it has to be.`);
}

// =============================================================================================================
sec("3. *** AND THE MAPPING EARNS ITS KEEP: THE RAW INDEX WOULD HAVE MADE THE ORB GO QUIET WHILE IT SEARCHED ***");
{
    // The counterfactual is the point of this section. mh_live's cadence lift is on (1.5, 3.5); an index of
    // 6 is outside it, so a state MEANING "working harder" would have rendered with the RESTING cadence --
    // slower than thinking. This measures both readings rather than asserting the design was sensible.
    const A = 0.8, V = 0.5;
    const asThinking = mhLive(V, A, ST.stateRenderIndex("searching"));
    const asRaw = mhLive(V, A, ST.STATE_INDEX.searching);
    const thinking = mhLive(V, A, ST.STATE_INDEX.thinking);
    const idle = mhLive(V, A, ST.STATE_INDEX.idle);
    say(`at activity ${A}: idle pace ${idle.pace.toFixed(4)}, thinking ${thinking.pace.toFixed(4)}, ` +
        `searching-as-rendered ${asThinking.pace.toFixed(4)}, searching-at-its-raw-index ${asRaw.pace.toFixed(4)}`);
    ok("!! *** SEARCHING GETS murmur's WORKING CADENCE; AT ITS RAW INDEX IT WOULD HAVE GOT THE RESTING ONE ***",
        Math.abs(asThinking.pace - thinking.pace) < 1e-12 && asRaw.pace < thinking.pace * 0.99 &&
        Math.abs(asRaw.pace - idle.pace) < 1e-12,
        `rendered as thinking it reads ${asThinking.pace.toFixed(4)}, identical to thinking. At index ` +
        `${ST.STATE_INDEX.searching} it reads ${asRaw.pace.toFixed(4)} -- the SAME number idle gets, because ` +
        `6 is outside every window kit.ts defines. A state whose name means the assistant is working, ` +
        `rendering at the resting cadence, is the failure this mapping exists to prevent.`);
    // *** AND THE TWO PLACES THAT FEED THE INDEX ACTUALLY USE THE MAPPING. *** The arithmetic above is
    // about a function; this is about whether anything calls it. The widget's uniform and the host's own
    // integral accumulation are the two sites that turn a state name into murmur's float, and a mapping
    // that exists while both sites still read the raw index is the purest form of a mechanism nobody
    // invokes -- which would pass every other row in this section.
    const widgetSrc = fs.readFileSync(path.join(ENG, "ui", "aiPresenceOrbWidget.js"), "utf8");
    const hostSrc = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbState.mjs"), "utf8");
    const widgetFeeds = /stateIndex: stateRenderIndex\(p\.state\)/.test(widgetSrc);
    const widgetRaw = /STATE_INDEX/.test(widgetSrc);
    const hostFeeds = /const si = stateRenderIndex\(cur\)/.test(hostSrc);
    say(`the widget feeds stateRenderIndex (${widgetFeeds}) and no longer imports STATE_INDEX (${!widgetRaw}); the host accumulates on it (${hostFeeds})`);
    ok("!! *** BOTH SITES THAT HAND murmur A STATE NUMBER GO THROUGH THE MAPPING ***",
        widgetFeeds && !widgetRaw && hostFeeds,
        `ui/aiPresenceOrbWidget.js sets the shader uniform and render/aiPresenceOrbState.mjs accumulates the ` +
        `signal integrals; if those two disagreed about which state this instant is, the shader's cadence ` +
        `and the integral of that same cadence would describe different orbs. THE WIDGET IS ALSO ASSERTED ` +
        `NOT TO MENTION STATE_INDEX AT ALL, because a file that imports both has a raw index one edit away.`);

    ok("!! ...and neither added state drives or ignites, because neither of those is what they mean",
        ADDED.every((n) => { const s = mhState(ST.stateRenderIndex(n), 1.0); return s.drive === 0 && s.complete === 0 && s.sweep === 0; }),
        `mh_state's drive is RESPONDING's alone and its ignition is SUCCESS's alone. searching and weaving ` +
        `render as thinking, which has neither -- so the lean and the flash stay the two events murmur ` +
        `reserved them for, and a retrieval does not read as an arrival.`);
}

// =============================================================================================================
sec("4. *** THE TWO STATES ARE ACTUALLY DIFFERENT, AND THEY ARE MARKED AS NOT murmur's ***");
{
    const t = ST.STATES.thinking, se = ST.STATES.searching, we = ST.STATES.weaving;
    const differs = (a, b) => ["speed", "glow", "depth", "hueShift"].filter((k) => Math.abs(a[k] - b[k]) > 1e-9);
    say(`thinking  speed ${t.speed} glow ${t.glow} depth ${t.depth} hue ${t.hueShift}`);
    say(`searching speed ${se.speed} glow ${se.glow} depth ${se.depth} hue ${se.hueShift}  (differs in ${differs(se, t).join(", ")})`);
    say(`weaving   speed ${we.speed} glow ${we.glow} depth ${we.depth} hue ${we.hueShift}  (differs in ${differs(we, t).join(", ")})`);
    ok("!! *** EACH DIFFERS FROM thinking AND FROM THE OTHER, or rendering as thinking would be all they were ***",
        differs(se, t).length >= 2 && differs(we, t).length >= 2 && differs(se, we).length >= 2 &&
        se.speed > t.speed && we.depth > t.depth,
        `they present to the shader as thinking, so their own multipliers are the ONLY thing that tells the ` +
        `three apart -- two states that mapped to thinking and carried thinking's numbers would be thinking ` +
        `with extra names. searching is faster (a sweep) and weaving is deeper (a synthesis), which is the ` +
        `direction each concept points, and both are asserted rather than left to the table.`);
    const src = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbState.mjs"), "utf8");
    ok("!! ...and the file says out loud that these four numbers are NOT transcribed from murmur",
        /THIS TREE'S OWN, AND THAT IS THE ONLY SUCH ADMISSION IN THE FILE/.test(src) &&
        /murmur has SIX states and no\n \* opinion whatever about `searching` or `weaving`/.test(src),
        `every other multiplier in that table came out of murmur-web's src/state.ts. These did not, and a ` +
        `later reader finding them unmarked would have had no way to tell -- and might have "restored" them ` +
        `to something upstream never wrote. The marking is the check.`);
}

// =============================================================================================================
sec("5. *** THE OTHER TWO NAMES ARE STILL RESERVED, AND THIS IS THE ROW THAT KEEPS THEM HONEST ***");
{
    const widget = fs.readFileSync(path.join(ENG, "ui", "aiPresenceOrbWidget.js"), "utf8");
    const page = fs.readFileSync(path.join(ENG, "ev.html"), "utf8");
    const fires = ["engine:brainSearching", "engine:brainRetrieved", "engine:brainAnswer", "engine:brainError"];
    const firedByPage = fires.filter((e) => page.includes(`"${e}"`));
    const heardByWidget = fires.filter((e) => widget.includes(`"${e}"`));
    say(`ev.html fires ${firedByPage.length} of ${fires.length}; the widget listens for ${heardByWidget.length}`);
    // *** AND THE PAGE HAS TO ASK FOR THE STREAM, WHICH IS THE LINK A SABOTAGE WALKED THROUGH. *** Every
    // other row in this gate can be green while ev.html sends no `stream` flag: the bridge still CAN stage,
    // the widget still CAN listen, and the chain is still broken -- the page gets one object at the end,
    // fires searching and then answer back to back, and the orb behaves exactly as it did before this round
    // while the whole battery reports success. The opt-in that makes the change safe is also the single
    // point where it can be silently switched off.
    // *** AND IT IS THE REQUEST BODY THAT IS READ, NOT THE FILE. *** A first cut matched /stream: true/
    // anywhere in ev.html and stayed green under the very sabotage it was written for, because
    // TextDecoder's own decode(value, { stream: true }) is on the next screen of the same function. Two
    // different options spelled the same way, and the one that matters is the one inside the POST body.
    const askBody = /fetch\("\/ai\/brain\/ask"[^\n]*?body: JSON\.stringify\((\{[^)]*\})\)/.exec(page);
    const asks = !!askBody && /\bstream\s*:\s*true\b/.test(askBody[1]);
    say(`the /ai/brain/ask request body is ${askBody ? askBody[1] : "(not found)"}`);
    ok("!! *** THE PAGE ASKS FOR THE STREAM, so the retrieval window actually exists at runtime ***",
        asks,
        `ev.html's askComputer() sends ${askBody ? askBody[1] : "(no body found)"}. WITHOUT THE FLAG ` +
        `NOTHING ELSE HERE CHANGES AND ` +
        `THE FEATURE IS GONE: the fallback path is deliberately identical to the old behaviour, which makes ` +
        `it invisible to every other check. A sabotage that removed this flag walked through the entire ` +
        `first cut of this gate.`);

    ok("!! *** EVERY EVENT THE PAGE FIRES HAS A LISTENER, AND EVERY LISTENER HAS A FIRER ***",
        firedByPage.length === fires.length && heardByWidget.length === fires.length,
        `a dispatched event nobody hears and a handler nothing dispatches are the same defect from two ` +
        `sides, and the second is exactly what "an unwired state is decoration" means. Both directions are ` +
        `counted: ${fires.join(", ")}.`);
    // *** WEAVING MEANS SEVERAL SOURCES, AND THE THRESHOLD IS WHERE THAT MEANING LIVES. *** thinking-orbs
    // names it "synthesising multiple sources". With one passage the model is grounded, not weaving, and
    // with none it is answering unaided -- both are `thinking`, which already means "the model is running".
    // A threshold of > 0 would make `weaving` fire for a single source and quietly redefine the word.
    ok("!! *** weaving REQUIRES MORE THAN ONE SOURCE, which is the whole difference between it and thinking ***",
        /n > 1 \? "weaving" : "thinking"/.test(widget),
        `the widget reads the retrieved COUNT and only weaves above one. This is a source row and it is ` +
        `labelled one: the count arrives at runtime from a live sqlite-vec search, so the threshold is ` +
        `checkable here and the behaviour is not. What it catches is the edit that turns a two-source ` +
        `concept into a one-source one, which no pixel would ever show.`);

    ok("!! *** connecting AND shaping ARE ABSENT, BECAUSE NOTHING IN THIS TREE CAN YET OBSERVE EITHER ***",
        !ST.STATES.connecting && !ST.STATES.shaping &&
        !widget.includes('"connecting"') && !widget.includes('"shaping"'),
        `thinking-orbs names nine behaviour states and this tree's backlog reserved four. TWO are wired ` +
        `because the RAG bridge now emits the two moments they name. connecting (waiting on a network or ` +
        `session) and shaping (building an artifact) have no observable event anywhere in this engine, and ` +
        `adding them today would be the decoration the entry refused for forty rounds. THIS ROW GOES RED ` +
        `THE DAY SOMEBODY ADDS ONE, which is the point: it is a reservation with a guard on it, not a note.`);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: phase 2 of the AI-presence orb. The blocker was never that this tree had no " +
    "two-stage AI work -- ai-bridge/ragBridge.js has retrieved-then-generated all along -- but that both " +
    "stages left in one response, so no page could see stage 1 finish. /ai/brain/ask streams them now, " +
    "opt-in, and `searching` is lit during the retrieval window while `weaving` reads how many passages " +
    "came back." +
    "\nWHAT IS NOT CLAIMED: that the orb LOOKS right in either state. The multipliers are this tree's own " +
    "choice -- murmur has six states and no opinion about these two -- and this gate checks that they are " +
    "distinct, that they point the way the concepts do, and that they are marked as not-upstream. Whether " +
    "1.30 is the right speed for a search is a judgement no row here can make." +
    "\nAND NOT CLAIMED: that connecting and shaping are coming. They have nothing to attach to, section 5 " +
    "asserts their absence, and the backlog entry stays OPEN for them alone.");
process.exit(fails ? 1 : 0);
