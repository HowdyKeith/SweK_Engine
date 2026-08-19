// WebGLEngine/ai-bridge/tools/lab-scene-run-selfcheck.mjs -- v3595
// ---------------------------------------------------------------------------------------------------------------
// THE BUTTON THAT LOOKED LIVE AND DID NOTHING.
//
// physics-lab.html has carried an "Initiate AI workers" button since v3587, shipped DISABLED with its reason in
// its own tooltip: no proposer was registered against any of the twelve lab scenes, so the intersection was
// zero and a disabled control naming what is missing beat no control at all. THAT WAS CORRECT WHEN WRITTEN.
//
// *** IT STOPPED BEING TRUE AND NOTHING NOTICED. *** gyro-spin registered at v3591 and pile-friction at v3593,
// so paintRoundhouse's `if (row.registered) b.disabled = false` branch became reachable for two scenes -- in a
// file containing NO CLICK HANDLER FOR THAT BUTTON ANYWHERE. It enabled itself, changed its tooltip to promise
// a run, and swallowed the press. AN ENABLED CONTROL THAT DOES NOTHING IS WORSE THAN THE DISABLED ONE IT
// REPLACED: the disabled version told you why, this one just looked broken.
//
// SO THE CHECKS ARE STRUCTURAL AND BEHAVIOURAL IN THE RIGHT PLACES. No DOM renders in this sandbox, so what a
// page LOOKS like is Keith's; what is proven here is that the handler EXISTS and names the real route, that the
// route DECIDES correctly when driven for real, and -- the load-bearing one -- THAT NO PATH THROUGH IT CAN
// APPLY A KNOB VALUE.
//
// AND THE ENABLE/HANDLER PAIR IS ASSERTED AS A PAIR, which is the check that would have caught v3594's state:
// a page that can enable the button must contain a handler for it. Either alone is fine; the combination that
// shipped is the defect.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

let pass = 0, fail = 0;
const ok = (name, cond, note = "") => {
    if (cond) { pass++; console.log("  ok   " + name + (note ? "  -- " + note : "")); }
    else { fail++; console.log("  FAIL " + name + (note ? "  -- " + note : "")); }
};
const section = (n) => console.log("\n== " + n + " ==");

// Comment-stripped source, for claims about an IDIOM rather than about text the file contains. A raw scan here
// would match this gate's own subject inside physics-lab.html's explanatory comment block.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
                             .replace(/<!--[\s\S]*?-->/g, " ");

// ---------------------------------------------------------------------------------------------------------------
section("1. THE PAGE: it may only enable the button if it can answer a press");
{
    const raw = read("physics-lab.html");
    const code = codeOnly(raw);
    const enables = /initiateBtn|\bb\.disabled\s*=\s*false/.test(code);
    const hasHandler = /getElementById\("initiateBtn"\)\.onclick|initiateBtn[^\n]*addEventListener\(\s*"click"/
        .test(code);
    ok("physics-lab.html still has the button", /id="initiateBtn"/.test(raw));
    ok("*** it enables the button AND has a click handler for it ***", !enables || hasHandler,
       enables ? (hasHandler ? "enable + handler, the pair" : "ENABLES WITH NO HANDLER -- the v3594 state")
               : "never enables it");
    ok("the handler calls the real route", /roundhouse\/lab-scene-run/.test(code));
    ok("it renders into a pane rather than an alert", /id="rhRun"/.test(raw) && /rhRun\.innerHTML/.test(code));
    ok("the page states that nothing was applied", /PROPOSED, NOT APPLIED/.test(raw));
    // *** THE PAGE MUST NOT ASK TO APPLY. *** applyKnobs is the only path that can set a value; a page reaching
    // for it would route around the licence tier, which is the structure proposers.mjs exists to defend.
    ok("the page never mentions applyKnobs or an apply route", !/applyKnobs|\/apply/.test(code));
}

// ---------------------------------------------------------------------------------------------------------------
section("2. THE ROUTE IS REGISTERED AND CANNOT APPLY A VALUE");
{
    const src = read("ai-bridge/fingerprintBridge.js");
    const code = codeOnly(src);
    ok("the bridge owns /roundhouse/lab-scene-run", /url\.startsWith\("\/roundhouse\/lab-scene-run"\)/.test(code));
    ok("it sits beside /roundhouse/lab-scenes, one resolution not two",
       /\/roundhouse\/lab-scenes/.test(code) && /joinRegistered/.test(code));
    // ASSERTED AS AN ABSENT MECHANISM, NOT AN ABSENT MENTION: applyKnobs is never imported or called, so no
    // request can reach it whatever the request says.
    ok("*** applyKnobs is never called anywhere in the bridge ***", !/applyKnobs\s*\(/.test(code));
    ok("it calls runProposer, which only reports", /runProposer\(/.test(code));
    ok("the response declares applied:false", /applied:\s*false/.test(code));
}

// ---------------------------------------------------------------------------------------------------------------
section("3. THE ROUTE, DRIVEN FOR REAL through the bridge's own handler");
// A fake req/res pair rather than a live server: the sandbox has no HTTP server and the claim is about what the
// handler DECIDES, which is the part a socket would only wrap. *** IT IS DRIVEN THROUGH THE REAL (req, res)
// CONTRACT -- handle() builds its own sendJson from res, so a fixture that injected one would be testing a seam
// that does not exist and would have missed the query-string defect this round found. ***
const bridge = await import("../fingerprintBridge.js").then((m) => m.default || m);
function call(url) {
    return new Promise((resolve, reject) => {
        const req = { method: "GET", url };
        let status = 200;
        const res = {
            writeHead: (code) => { status = code; },
            end: (body) => { try { resolve({ status, body: JSON.parse(body) }); } catch (e) { reject(e); } },
        };
        if (!bridge.handle(req, res)) resolve({ status: 0, body: { ok: false, error: "not-owned" } });
    });
}
{
    ok("bridge exposes a handler", typeof bridge.handle === "function");
    const unknown = await call("/roundhouse/lab-scene-run?scene=not-a-scene");
    ok("an unknown scene is refused BY NAME", unknown.status === 400 && unknown.body.error === "unknown-scene");

    // A REFUSED SCENE AND A CANDIDATE SCENE GET DIFFERENT MESSAGES, because they want opposite responses from
    // whoever reads them -- one needs an adjudicator written, the other has no key to write one against.
    const refused = await call("/roundhouse/lab-scene-run?scene=balloon");
    ok("a refused scene reports no-proposer with its reason",
       refused.status === 400 && refused.body.error === "no-proposer" && refused.body.eligible === "refused");
    // v3596 -- *** THIS NAMED `vibrations` AND WENT RED THE MOMENT vib-mode REGISTERED, WHICH IS THE ROUND
    // SUCCEEDING. *** A gate pinned to WHICH scene is unregistered is pinned to a round's outcome -- the
    // species this tree has committed twenty-three times -- and moving the name to `diffusion` would just
    // set the same trap one round further out. THE PROPERTY IS THAT A CANDIDATE WITHOUT A PROPOSER GETS A
    // DIFFERENT MESSAGE FROM A REFUSED ONE, so the scene is DERIVED from the live join, and when the last
    // candidate is finally adjudicated the check asserts THAT instead. Neither branch is a weaker claim.
    const L = await import("../../physics/labScenes.mjs");
    const P = await import("../../physics/proposers.mjs");
    const K = await import("../../physics/knobRegistry.mjs");
    P.resetRegistry(); K.registerAll();
    const openCand = L.joinRegistered(P.listProposers())
        .find((r) => r.eligible === "candidate" && !r.registered);
    if (openCand) {
        const cand = await call("/roundhouse/lab-scene-run?scene=" + openCand.scene);
        ok("a CANDIDATE scene is also refused, and says why it differs",
           cand.status === 400 && cand.body.eligible === "candidate" &&
           /no adjudicator has been written/.test(cand.body.message || ""), openCand.scene);
        ok("...and the two messages are not the same sentence",
           (refused.body.message || "") !== (cand.body.message || ""));
    } else {
        // THE GOOD OUTCOME, ASSERTED RATHER THAN SKIPPED: every candidate has an adjudicator now, so the
        // branch is unreachable BECAUSE THE WORK IS DONE and not because nobody looked.
        const cands = L.joinRegistered(P.listProposers()).filter((r) => r.eligible === "candidate");
        ok("*** every candidate scene now has a proposer ***", cands.length > 0 && cands.every((r) => r.registered),
           cands.map((r) => r.scene).join(", "));
        ok("...so the no-proposer branch is unreachable for candidates, not untested",
           /no adjudicator has been written/.test(read("ai-bridge/fingerprintBridge.js")));
    }
}
{
    // THE TWO SCENES A PERSON CAN ACTUALLY PRESS TODAY.
    for (const [scene, knob] of [["gyroscope", "omega"], ["pile", "mu"]]) {
        const r = await call("/roundhouse/lab-scene-run?scene=" + scene);
        const run = r.body.ok && r.body.runs && r.body.runs[0];
        ok(scene + ": the route runs and returns a proposer", r.status === 200 && !!run,
           run ? run.id + " in " + run.ms + " ms" : JSON.stringify(r.body).slice(0, 120));
        if (!run) continue;
        ok(scene + ": the knob matches the triage row", r.body.knob === knob && run.knobs.includes(knob));
        ok(scene + ": the greedy pick carries a verdict", !!run.greedyVerdict &&
           typeof run.greedyVerdict.pass === "boolean");
        ok(scene + ": *** an adjudicated candidate is NAMED ***", run.accepted !== null &&
           run.acceptedVerdict && run.acceptedVerdict.pass === true, "accepted " + knob + " = " + run.accepted);
        ok(scene + ": nothing was applied", r.body.applied === false);
        ok(scene + ": tier is 'propose', so nothing COULD be applied", run.tier === "propose");
    }
}

// ---------------------------------------------------------------------------------------------------------------
section("4. THE JOIN CARRIES IDS, AND A SCENE WITH TWO PROPOSERS SHOWS TWO");
{
    const L = await import("../../physics/labScenes.mjs");
    const P = await import("../../physics/proposers.mjs");
    const K = await import("../../physics/knobRegistry.mjs");
    P.resetRegistry(); K.registerAll();
    const rows = L.joinRegistered(P.listProposers());
    ok("every registered row names at least one proposer",
       rows.every((r) => r.registered === (r.proposerIds.length > 0)));
    ok("registered rows exist, so this is not vacuous", rows.some((r) => r.registered),
       rows.filter((r) => r.registered).map((r) => r.scene + "->" + r.proposerIds.join("+")).join(", "));
    // *** MULTIPLE PROPOSERS PER INSTRUMENT IS NOT HYPOTHETICAL: md-pbc HAS TWO. *** No lab scene points at it
    // today, so the shape is proven on a synthetic row driven through the real join rather than assumed.
    const multi = L.joinRegistered([{ id: "a", instrument: "gyroscope" }, { id: "b", instrument: "gyroscope" }]);
    const g = multi.find((r) => r.scene === "gyroscope");
    ok("two proposers on one instrument yield TWO ids, not the first",
       g.proposerIds.length === 2 && g.proposerIds.join(",") === "a,b");
    const mdShare = P.listProposers().filter((p) => p.instrument === "md-pbc");
    ok("...and the real registry really does have such an instrument", mdShare.length === 2,
       "md-pbc: " + mdShare.map((p) => p.id).join(", "));
}

// ---------------------------------------------------------------------------------------------------------------
section("5. THE DEVICE COUNT IN server.html's TOOLTIP, DERIVED");
// *** IT READ "Nineteen devices" AGAINST A REGISTRY OF 75 -- FIFTY-SIX BEHIND. *** A number in prose where
// nothing re-derives it, in the one line a person reads before deciding whether to click. The fix is not a
// bigger number, it is a check: the tooltip's count must equal the registry's, so the next drift is caught
// rather than described. promptCost already maintains its own copy for the cost model; this is the third
// declaration and it is now the only unguarded one no longer.
{
    const { DEVICE_NAMES } = await import("../../tools/roundhouse/devices.mjs");
    const html = read("server.html");
    const m = html.match(/title="Point a model at a physics instrument[^"]*?(\d+) devices/);
    ok("the Devices tooltip states a device count as a numeral", !!m, m ? m[1] : "no numeral found");
    ok("*** and it equals the live registry ***", !!m && Number(m[1]) === DEVICE_NAMES.length,
       (m ? m[1] : "?") + " stated vs " + DEVICE_NAMES.length + " registered");
    // The word form is what rotted for 56 devices, and a numeral is what a check can compare. Refuse the
    // regression rather than only fixing today's value.
    ok("no spelled-out count survives in that tooltip",
       !/title="Point a model at a physics instrument[^"]*?(Nineteen|Twenty|Thirty|Forty|Fifty|Sixty|Seventy)/i
           .test(html));
}

console.log("\n" + (fail ? "FAILED " + fail + " of " + (pass + fail) : "ALL " + pass + " CHECKS PASS"));
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(fail ? 1 : 0);
