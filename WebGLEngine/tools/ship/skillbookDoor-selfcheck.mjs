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

    // A model that is not there is a REPORTED STATE, not a crash and not a null result.
    const down = await call("/skill/trial?device=kerr&caller=ollama");
    ok("!! *** with no model reachable the trial REFUSES BEFORE IT RUNS, naming which of the three states ***",
        down.ok === false && down.error === "model-not-ready" && typeof down.verdict === "string" && !!down.fix,
        `verdict "${down.verdict}" -- ollamaReadiness keeps NOT-RUNNING, RUNNING-WITH-NO-MODELS and ` +
        "PINNED-MODEL-MISSING apart, and the third one otherwise bites at the first call, MID-RUN, after a device " +
        "has already been built");

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
process.exit(failed ? 1 : 0);
