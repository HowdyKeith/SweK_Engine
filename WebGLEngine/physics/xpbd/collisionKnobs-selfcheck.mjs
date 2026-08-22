// WebGLEngine/physics/xpbd/collisionKnobs-selfcheck.mjs -- v3603
// ---------------------------------------------------------------------------------------------------------------
// THE LOAD-BEARING CHECK IS SECTION 1 AND IT IS NOT A SOURCE READ: exposing a constant as a parameter is the
// easiest possible way to change what ships by accident, and a check that read `?? 1` out of the source would
// pass on a parameter that was exposed and then quietly re-defaulted somewhere else. The default path is held
// to a STATE HASH captured from the PRISTINE v3602 EXTRACT BEFORE THE EDIT.
//
// Section 3 is the round's content: both knobs were UNREACHABLE, so a sweep over either would have read exactly
// zero and registered VACUOUS WITH THE WRONG REASON (v3541). They are shown LIVE by driving them.
//
// Section 4 refutes a proposal on its own stated benefit, which is why the trade is measured and not argued.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { readFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { reportLines } from "./collisionKnobs.mjs";
import { shippedRun, substepTrade, isLive, iterationTrade, complianceTrade,
         V3602_STATE, DEFAULT_COLLISION_ITERATIONS, DEFAULT_COLLISION_COMPLIANCE,
         MEASURED_V3603 } from "./collisionKnobs.mjs";

let pass = 0, fail = 0;
const ok = (n, c, note = "") => { if (c) { pass++; console.log("  ok   " + n + (note ? "  -- " + note : "")); }
                                  else { fail++; console.log("  FAIL " + n + (note ? "  -- " + note : "")); } };
const section = (n) => console.log("\n== " + n + " ==");

section("1. EXPOSING THE KNOBS CHANGED NOTHING THAT SHIPS -- HELD TO A PRE-EDIT STATE HASH, NOT TO SOURCE");
{
    const d = shippedRun();
    ok("!! the DEFAULT path reproduces pristine v3602 position state bit-for-bit",
       d.posHash === V3602_STATE.posHash, d.posHash + " vs " + V3602_STATE.posHash);
    ok("!! ...and its velocity state", d.velHash === V3602_STATE.velHash,
       d.velHash + " vs " + V3602_STATE.velHash);
    // Passing the defaults EXPLICITLY must be the same run as passing nothing -- otherwise the `??` fallback
    // and the documented default have quietly become two declarations of one number.
    const e = shippedRun({ collisionIterations: DEFAULT_COLLISION_ITERATIONS,
                           collisionCompliance: DEFAULT_COLLISION_COMPLIANCE });
    ok("passing the defaults explicitly is bit-identical to passing nothing",
       e.posHash === d.posHash && e.velHash === d.velHash);
    // POSITIVE CONTROL: the hash must be able to MOVE, or "unchanged" means nothing.
    const m = shippedRun({ collisionIterations: 20 });
    ok("!! and the hash CAN move -- a non-default run differs (so the check is not vacuous)",
       m.posHash !== d.posHash, m.posHash);
}

section("2. THE REFERENCE IS A MEASUREMENT WITH ITS PROVENANCE, NOT A TYPED NUMBER");
{
    ok("the frozen state names the configuration it was taken under",
       V3602_STATE.frames > 0 && V3602_STATE.radius > 0 && V3602_STATE.iterations > 0,
       V3602_STATE.frames + " frames, radius " + V3602_STATE.radius + ", " + V3602_STATE.iterations + " mesh iterations");
    ok("the collision pass actually engages in that configuration (a zero-pair run would hash anything)",
       substepTrade().pairs > 0, substepTrade().pairs + " collision pairs");
}

section("3. BOTH KNOBS WERE UNREACHABLE AND ARE NOW LIVE -- DRIVEN, NOT READ");
{
    for (const k of ["collisionIterations", "collisionCompliance"]) {
        const r = isLive(k);
        ok(k + " moves the observable", r.live, "relative movement " + r.rel.toExponential(3));
    }
    // The reason this matters is that BEFORE the edit the movement was structurally zero, not physically zero.
    ok("the record states WHY a sweep before this round would have been read wrongly",
       /INVARIANT BECAUSE UNREAD|exactly zero movement|EXACTLY ZERO MOVEMENT/i.test(MEASURED_V3603.wasUnreachable));
    const loop = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "clothLoop.js"), "utf8");
    ok("clothFrame no longer hardcodes a rigid contact", !/rest: 2 \* radius, compliance: 0 \}/.test(loop));
    ok("...and the collision sweep now has a loop around it", /for \(let it = 0; it < collIters/.test(loop));
}

section("4. THE TRADE, AND IT REFUTES A PROPOSAL ON ITS OWN STATED BENEFIT");
{
    const t = iterationTrade();
    const first = t[0], last = t[t.length - 1];
    ok("!! more sweeps drive PENETRATION toward zero, which is the stated pro that holds",
       last.penetration < first.penetration / 1e10,
       first.penetration.toExponential(3) + " -> " + last.penetration.toExponential(3));
    ok("!! and the MOMENTUM ROW RISES, which is the stated pro that does not",
       last.momentum > first.momentum,
       first.momentum.toExponential(3) + " -> " + last.momentum.toExponential(3));
    // MONOTONE is the claim, not "bigger" -- a single reversal would make it a coincidence rather than a trade.
    let mono = true;
    for (let i = 1; i < t.length; i++) if (t[i].momentum < t[i - 1].momentum - 1e-15) mono = false;
    ok("...and the trade is MONOTONE across the sweep, so it is a trade and not a coincidence", mono,
       t.map((r) => r.momentum.toExponential(2)).join(" "));
    ok("the momentum row plateaus rather than growing without bound",
       Math.abs(t[t.length - 1].momentum - t[t.length - 2].momentum) / t[t.length - 1].momentum < 0.01);

    const c = complianceTrade();
    ok("!! compliance moves the momentum row the OTHER way", c[c.length - 1].momentum < c[0].momentum,
       c[0].momentum.toExponential(3) + " -> " + c[c.length - 1].momentum.toExponential(3));
    ok("the anomaly is recorded AS an anomaly rather than explained away",
       /ANOMALY|anomaly/.test(MEASURED_V3603.anomaly) && /is a story/.test(MEASURED_V3603.anomaly));
}

section("5. WHAT IS NOT CLAIMED");
{
    ok("no default is changed", DEFAULT_COLLISION_ITERATIONS === 1 && DEFAULT_COLLISION_COMPLIANCE === 0);
    ok("neither cure is recommended, and the reason is stated",
       /NO DEFAULT IS CHANGED and neither cure is recommended/.test(MEASURED_V3603.notClaimed));
    ok("...and the deciding half is named as multi-frame and visual rather than left implied",
       /multi-frame and VISUAL/.test(MEASURED_V3603.notClaimed));
    // ANTIDOTE (v3196): when somebody CHANGES a shipped default, section 1's hash goes RED. That is correct and
    // it must be RE-CAPTURED from the new shipped path with the round that changed it named -- not deleted, and
    // not loosened to a tolerance, because the whole value of this line is that it is exact.
}

{
    // v3904 -- reportLines IS THIS MODULE'S OWN REPORT, AND NOTHING HAD EVER CALLED IT.
    // I nearly skipped this on the belief that toolFrontDoor already covered it. IT DOES NOT, AND I CHECKED
    // RATHER THAN ASSERTED: section 1 SPAWNS the file and demands non-empty stdout matching /[basename]/ --
    // that is what the MAIN BLOCK prints, which is a different function. A reportLines() returning [] would
    // leave the front door perfectly green, because the main block writes its own header either way.
    // *** A REPORTER NOBODY CALLS IS A REPORTER THAT CAN GO SILENT IN PRIVATE. *** The shape graded here is
    // the weakest one worth having -- an array, of strings, longer than a header, carrying its own name --
    // and it is the shape that distinguishes "the report is built" from "the function still returns".
    const L = reportLines();
    ok("reportLines returns a real report and names itself",
       Array.isArray(L) && L.length > 5 && L.every((x) => typeof x === "string") &&
       L.join("\n").includes("[collisionKnobs]"),
       L.length + " lines, self-named");
}

console.log("\n" + (fail ? "FAILED " + fail + " of " + (pass + fail) : "ALL " + pass + " CHECKS PASS"));
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(fail ? 1 : 0);
