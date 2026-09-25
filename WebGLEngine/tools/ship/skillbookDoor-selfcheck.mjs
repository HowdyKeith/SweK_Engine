// WebGLEngine/tools/ship/skillbookDoor-selfcheck.mjs -- v3398
//
// *** THE SKILLBOOK HAD A CALLER (v3397) AND STILL NO PAGE. *** Keith asked whether a run-through could be
// tested from a page and a button with the process statistics; this gates the answer.
//
// THE THREE THINGS THAT MAKE THE PAGE WORTH HAVING, EACH DRIVEN RATHER THAN READ:
//
//   1. THE BUTTON RUNS THE REAL TRIAL. Not a re-implementation -- the bridge builds an `attempt` and hands it to
//      skillTrial, and the STATE comes back from deriveState. A bridge computing its own verdict would be a
//      second definition of PROVEN, which is this tree's most repeated defect.
//   2. THE HARNESS RECOVERS A KNOWN EFFECT, AND REFUSES A NULL. The mock's malformed rate is an INPUT, so the
//      trial has to find it back. A harness that could not recover a KNOWN effect could not be trusted with an
//      unknown one -- and the null arm (hint effect 0) must NOT come back PROVEN.
//   3. *** THE RESULT CARRIES `proposer: "mock"`. *** There is no model here, so the numbers test the harness and
//      not whether a hint helps. Saying so in a footnote would let a screenshot lose it; saying so in the JSON
//      means every consumer sees it.
//
// v3415 -- SECTION 6 ADDS THE MODEL PATH'S DOOR. The proposer is no longer only a mock, so three more things
// have to be true of the front door: the caller kind is a REQUEST PARAMETER refused by name when unknown, the
// model's host is taken from the server's own `_ollamaBase` rather than re-decided here, and the page cannot
// offer the model button without saying whether a model is actually there. The v3398 checks above are left
// EXACTLY as they were and still pass -- the mock path is unchanged, and that is the claim.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { createRequire } from "node:module";
import { codeHas } from "./sourceScan.mjs";

const ENG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require_ = createRequire(import.meta.url);
const bridge = require_(path.join(ENG, "ai-bridge", "skillbookBridge.js"));
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };
const call = (url) => new Promise((res) => bridge.handle({ url }, {}, { sendJson: res }));

// ---- 1. THE ROUTES EXIST, ARE OWNED, AND NOTHING ELSE IS ------------------------------------------------
{
    ok("the bridge owns its own prefix and no other",
        bridge.owns("/skill") && bridge.owns("/skill/trial") && !bridge.owns("/skills") && !bridge.owns("/gates"),
        "a bridge owns its ROUTES, not a namespace -- v3220 claimed all of /tools/ and swallowed a real file for " +
        "seven rounds");
    const nope = await call("/skill/anything");
    ok("...and an unknown route under the prefix is REFUSED by name rather than falling through",
        nope.ok === false && nope.error === "no-such-route",
        "a bridge that quietly returned 200 for a route it does not serve would make a typo look like an " +
        "empty result");
    const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    ok("!! the bridge is REQUIRED and DISPATCHED in server.js, so the page can actually reach it",
        /require\("\.\/skillbookBridge\.js"\)/.test(server) && /skillbookBridge\.owns\(req\.url\)/.test(server),
        "a bridge nobody dispatches is a module with a front door painted on");
}

// ---- 2. THE BUTTON RUNS THE REAL TRIAL AND RECOVERS A KNOWN EFFECT ----------------------------------------
{
    const r = await call("/skill/trial?device=kerr&n=40&seed=3&base=0.65&effect=0.60");
    say(`kerr, n=40: told ${r.input && r.input.baseRate} -> recovered ${r.before}; drop ${r.drop && r.drop.toFixed(3)}, z ${r.z && r.z.toFixed(2)}, ${r.state}`);
    ok("!! *** the trial recovers the malformed rate the mock was TOLD to produce ***",
        r.ok && Math.abs(r.before - r.input.baseRate) < 0.15 && Math.abs(r.drop - r.input.hintEffect) < 0.15,
        "told " + r.input.baseRate + " and " + r.input.hintEffect + ", recovered " + r.before.toFixed(3) + " and " +
        r.drop.toFixed(3) + ". A HARNESS THAT COULD NOT RECOVER A KNOWN EFFECT COULD NOT BE TRUSTED WITH AN " +
        "UNKNOWN ONE, and the page shows both columns side by side for exactly this reason");
    ok("...and a real effect comes back PROVEN with its z, not merely with a tick",
        r.state === "PROVEN" && r.z > r.zMin && r.arms.control === 40 && r.arms.treated === 40,
        "z=" + r.z.toFixed(2) + " against " + r.zMin + ", both arms 40. THE SAME QUESTIONS RUN TWICE -- the " +
        "control arm is what ACE has not got");
    ok("!! *** and the result says `proposer: \"mock\"` IN THE JSON, not in a footnote ***",
        r.proposer === "mock",
        "there is no model here, so this measures THE HARNESS and not whether a hint helps. A screenshot can " +
        "lose a footnote; it cannot lose a field every consumer reads");
}

// ---- 3. THE NULL ARM MUST NOT COME BACK PROVEN -- THE CHECK THAT CAN FAIL ---------------------------------
{
    const states = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const r = await call(`/skill/trial?device=kerr&n=40&seed=${seed}&base=0.50&effect=0`);
        if (r.ok) states.push(r.state);
    }
    say("hint effect ZERO, eight seeds: " + states.join(", "));
    ok("!! *** a hint that does NOTHING is never certified PROVEN across eight seeds ***",
        states.length === 8 && !states.includes("PROVEN"),
        "this is the v3396 defect run through the front door: under the OLD rule a null arm was called PROVEN " +
        "about a quarter of the time, so this check would have failed on the shipped code two rounds ago. IT IS " +
        "THE ONE CHECK HERE THAT COULD GO RED FOR A REAL REASON");
    const thin = await call("/skill/trial?device=kerr&n=20&seed=11&base=0.50&effect=0.14");
    ok("...and a real-but-thin effect is reported UNDERPOWERED with the runs that would settle it",
        thin.ok && (thin.state === "UNDERPOWERED" ? Number.isFinite(thin.requiredN) && thin.requiredN > thin.n : true),
        thin.state + (thin.state === "UNDERPOWERED" ? ", " + thin.requiredN + " runs per arm needed" : " on this seed"));
}

// ---- 4. THE BRIDGE REFUSES RATHER THAN GUESSING, AND ADDS NO ARITHMETIC -----------------------------------
{
    const bad = await call("/skill/trial?device=notADevice");
    ok("an unregistered device is refused by name",
        bad.ok === false && bad.error === "unknown-device",
        "the device must be one the registry already knows -- the picker is built from the same list, so it " +
        "cannot offer something the bridge would refuse");
    const big = await call("/skill/trial?device=kerr&n=99999&seed=1");
    ok("...and n is clamped, because an unbounded trial is a way to hang the server from a URL bar",
        big.ok && big.n <= bridge.N_MAX && big.n >= bridge.N_MIN, "n=" + big.n + " (cap " + bridge.N_MAX + ")");
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "skillbookBridge.js"), "utf8");
    ok("!! the bridge computes NO verdict of its own -- state, z and requiredN all come from skillbook",
        codeHas(src, /S\.proofStrength\(/) && codeHas(src, /S\.requiredN\(/) && codeHas(src, /res\.state/) &&
        !codeHas(src, /PROVEN|UNDERPOWERED|RETIRED/),
        "a bridge with its own idea of PROVEN would be a SECOND DECLARATION NOBODY COMPARES, which is this " +
        "tree's most repeated defect. Matched through codeOnly() so the header explaining the rule cannot " +
        "satisfy it");
    ok("...and it writes nothing and spawns nothing",
        !codeHas(src, /writeFileSync|execFile|spawn|unlinkSync/),
        "two GET routes, read-only. The book is filled by a rig run, not by a page");
}

// ---- 5. THE PAGE ITSELF: LINKED, AND HONEST WHERE IT MATTERS ----------------------------------------------
{
    const page = fs.readFileSync(path.join(ENG, "skillbook.html"), "utf8");
    const home = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    ok("the page is linked from server.html, so it is not born invisible",
        /skillbook\.html/.test(home), "A PAGE THAT IS NOT LINKED IS NOT SHIPPED");
    ok("!! *** the page states the proposer is a MOCK in its own body, beside the result ***",
        /deterministic mock/i.test(page) && /needs a real model/i.test(page),
        "the caveat sits where the numbers are read, not at the bottom");
    ok("...and it shows the INPUT beside the RECOVERED number rather than the verdict alone",
        /told to the mock/i.test(page) && /recovered by the trial/i.test(page),
        "a page that showed only PROVEN would be a green tick with nothing behind it. The demonstration IS the " +
        "two columns");
    ok("...and MISSING is distinguished from EMPTY when reporting the book",
        /b\.missing/.test(page) && /empty on purpose/i.test(page),
        "a book nobody has written and a book whose strategies were all retired are different facts, and one " +
        "number cannot tell them apart");
    ok("the page computes no statistic of its own",
        !/Math\.sqrt|proofStrength|\* *\(1 *- */.test(page.replace(/<!--[\s\S]*?-->/g, "")),
        "every number rendered came back from the bridge, which got it from the module that owns it");
}

// ---- 6. v3415 -- THE MODEL PATH'S DOOR --------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "skillbookBridge.js"), "utf8");
    const page = fs.readFileSync(path.join(ENG, "skillbook.html"), "utf8");
    const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");

    const bogus = await call("/skill/trial?device=kerr&caller=bogus");
    ok("an unknown proposer is refused BY NAME with the list of the ones that exist",
        bogus.ok === false && bogus.error === "unknown-caller" && Array.isArray(bogus.known) && bogus.known.includes("mock"),
        "the picker is built from the same list, so it cannot offer a caller the bridge would refuse -- the same " +
        "rule the device name already follows");

    const idx = await call("/skill");
    ok("the model route is advertised beside the others, with BOTH caps",
        idx.routes.includes("/skill/model") && idx.nMaxModel < idx.nMax && idx.budgetMs > 0,
        `n cap ${idx.nMax} for the mock, ${idx.nMaxModel} for the model, ${idx.budgetMs / 1000}s wall clock -- a model ` +
        "trial is 2n network calls at seconds each, so the mock's cap would be a hang");

    // *** v4676 -- THIS ROW USED TO TEST THE BOX, NOT THE BRIDGE. ***
    // It was one `call("/skill/trial?device=kerr&caller=ollama")` against whatever was on 127.0.0.1:11434,
    // asserting a REFUSAL. On a box with no Ollama that passes for the wrong reason -- the refusal it saw was
    // "nothing answered", the one state that needs no bridge logic at all. ON KEITH'S RIG, WHERE OLLAMA IS UP
    // WITH A MODEL, IT WENT RED AT v4667 AND PRINTED `verdict "undefined"` -- and the note under it blamed
    // ollamaReadiness for collapsing its three states, WHICH IS NOT WHAT HAPPENED. Readiness worked: it
    // answered `ready`, the trial correctly did not refuse, and the assertion was simply false on that machine.
    // A VERDICT NAMING A CAUSE THAT IS NOT TRUE. Reproduced here byte-for-byte by standing a stub on 11434.
    // Worse: the green path was never green on merit, and the red path was expensive. With a real model up,
    // that one line starts a 40-device trial -- 80 model calls against a 600 s budget -- inside a gate.
    // So all three refusals are DRIVEN now, each from an injected base, and none of them reaches a real model.
    // The env vars are cleared for the block because modelConfig prefers OLLAMA_HOST/OLLAMA_MODEL over ctx,
    // which would hand the rig back its own answer and make this box-dependent all over again.
    const envSaved = { h: process.env.OLLAMA_HOST, m: process.env.OLLAMA_MODEL };
    delete process.env.OLLAMA_HOST; delete process.env.OLLAMA_MODEL;
    const withBase = (base, pinned = null) => ({ ollamaBase: () => base, ollamaModelName: async () => pinned });
    const trial = (ctx) => new Promise((res) =>
        bridge.handle({ url: "/skill/trial?device=kerr&caller=ollama" }, {}, { sendJson: res, ...ctx }));
    const status = (ctx) => new Promise((res) =>
        bridge.handle({ url: "/skill/model" }, {}, { sendJson: res, ...ctx }));

    // A stub that answers Ollama's TWO READINESS ROUTES AND NOTHING ELSE, so a trial that wrongly proceeded
    // fails loudly here instead of quietly burning a real model's time.
    let tags = { models: [] };
    const stub = http.createServer((rq, rs) => {
        rs.setHeader("content-type", "application/json");
        if (rq.url.startsWith("/api/version")) return rs.end(JSON.stringify({ version: "0.0.0-stub" }));
        if (rq.url.startsWith("/api/tags")) return rs.end(JSON.stringify(tags));
        rs.statusCode = 500; rs.end('{"error":"this stub serves readiness only -- a trial got past the refusal"}');
    });
    await new Promise((r) => stub.listen(0, "127.0.0.1", r));
    const STUB = "http://127.0.0.1:" + stub.address().port;
    const DEAD = "http://127.0.0.1:1";   // port 1 never listens: ECONNREFUSED at once, on every platform

    const states = [];
    {
        const down = await trial(withBase(DEAD));
        states.push(down.verdict);
        ok("!! *** NOT-RUNNING: with nothing on the port the trial REFUSES BEFORE IT RUNS ***",
            down.ok === false && down.error === "model-not-ready" && down.verdict === "not-running" && !!down.fix,
            `error "${down.error}", verdict "${down.verdict}" -- and the fix line has to say to start it, ` +
            "because NOTHING IN THIS TREE STARTS OLLAMA");
    }
    {
        tags = { models: [] };
        const down = await trial(withBase(STUB));
        states.push(down.verdict);
        ok("!! *** RUNNING-WITH-NO-MODELS is a DIFFERENT verdict from not-running, off the SAME empty list ***",
            down.ok === false && down.verdict === "running-no-models",
            `verdict "${down.verdict}" -- listLocalModels returns [] for UNREACHABLE and for GENUINELY EMPTY ` +
            "alike, so this row is what proves readiness asked the version route first rather than inferring");
    }
    {
        tags = { models: [{ name: "llama3.1:8b" }] };
        const down = await trial(withBase(STUB, "not-a-model-anyone-has:70b"));
        states.push(down.verdict);
        ok("!! *** PINNED-MODEL-MISSING -- the expensive one -- is caught HERE, not at the first call ***",
            down.ok === false && down.verdict === "pinned-model-missing" &&
            Array.isArray(down.models) && down.models.includes("llama3.1:8b"),
            `verdict "${down.verdict}", models ${JSON.stringify(down.models)} -- Ollama running with the WRONG ` +
            "models looks identical to Ollama running correctly right up until the first call, MID-RUN, after a " +
            "device has already been built, and a pull is gigabytes");
    }
    ok("...and the three are THREE, not one refusal wearing three labels",
        new Set(states).size === 3, `verdicts: ${states.join(", ")}`);
    {
        // READY is the fourth answer, and it is reported through /skill/model, which starts NO trial. The old
        // row could only ever observe ONE state -- whichever one the machine it ran on happened to be in.
        tags = { models: [{ name: "llama3.1:8b" }] };
        const up = await status(withBase(STUB));
        ok("...and READY is the fourth answer, reported WITHOUT running anything",
            up.ok === true && up.ready === true && up.verdict === "ready" &&
            Array.isArray(up.models) && up.models.includes("llama3.1:8b"),
            `verdict "${up.verdict}", ready ${up.ready} -- the page asks this before it offers the button`);
    }
    await new Promise((r) => stub.close(r));
    if (envSaved.h !== undefined) process.env.OLLAMA_HOST = envSaved.h;
    if (envSaved.m !== undefined) process.env.OLLAMA_MODEL = envSaved.m;

    ok("!! *** the bridge does not decide where the model lives -- server.js hands it the SAME base ragBridge gets ***",
        /ollamaBase: *_ollamaBase/.test(server) && /skillbookBridge\.handle/.test(server) &&
        codeHas(src, /ctx\.ollamaBase/),
        "_ollamaBase is the llmHost setting. A second notion of where the model lives is the defect this tree " +
        "names most often, and it would send this page to a different machine than the rest of the engine");

    ok("...and the bridge still computes no verdict of its own on the model path either",
        !codeHas(src, /Z_MIN *=|Math\.sqrt/), "state, z and requiredN come from skillbook, unchanged");

    ok("!! *** the page offers the model only beside a live readiness line ***",
        /skill\/model/.test(page) && /modelState/.test(page) && /proposer/.test(page),
        "a button whose failure arrives eighty calls later is worse than no button");
    ok("...and the page shows DISTINCT CLAIMS PER ARM, which is the row that can refuse the run",
        /distinct claims/i.test(page) && /degenerate-arm/.test(page) && /wouldHaveSaid/.test(page),
        "a refusal that hides the numbers it refused teaches nothing -- the page prints the rate, the distinct " +
        "count AND the verdict the run would otherwise have shown");
    ok("...and the mock's knobs are HIDDEN on the model path rather than left on screen doing nothing",
        /mockOnly/.test(page) && /syncProposer/.test(page),
        "a control that cannot affect the run is the same defect as a number that means two things");
}

console.log(failed ? "\n[skillbookDoor-selfcheck] FAILED " + failed : "\n[skillbookDoor-selfcheck] all checks pass");
// *** v4676 -- process.exitCode, NOT process.exit(). ***
// This gate fast-failed on the rig at v4667 with libuv's UV_HANDLE_CLOSING assert (exit 0xC0000409), the same
// crash v4663 converted 48 gates for. It was not in that round's population because the population was drawn by
// asking "does this gate COMPILE A WASM MODULE" -- A CAUSE. The defect is a SYMPTOM: queued platform work at
// the moment of teardown. This file compiles no wasm.
// MEASURED HERE, at the instant this line runs: 7.0 ms of background CPU over a 300 ms idle window (5.9 / 8.2 /
// 7.5 on repeats), against a same-process control of 0.9 ms. SAY THAT HONESTLY: eight times the control, but a
// FRACTION of range-selfcheck's 103.7 ms or bz-tactics' 81.7 ms, and taken on Linux when the crash is Windows'.
// The number supports "there is background work here at exit". It does not rank this gate, and it is not the
// reason the conversion is right -- process.exit() during a live teardown is wrong at 7 ms as it is at 103.
process.exitCode = failed ? 1 : 0;
