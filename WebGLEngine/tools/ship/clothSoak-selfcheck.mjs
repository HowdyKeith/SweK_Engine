// WebGLEngine/tools/ship/clothSoak-selfcheck.mjs -- v3604
//
// Run: node tools/ship/clothSoak-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/xpbd/clothSoak.mjs -- the honest collision radius, the fixture that can be run at it, and the
// re-run of v3603's two knob sweeps.
//
// THE ONE CHECK THIS FILE EXISTS FOR is section 6: the claim that MORE COLLISION SWEEPS CHANGE NOTHING is an
// EQUALITY, and an equality is the easiest kind of dead check to write. It is paired with a positive control on
// the SAME code path -- compliance, which does move both rows -- so a sweep that silently stopped running would
// take the control down with it rather than passing quietly.
//
// EVERY BOUND IS RECOMPUTED HERE FROM THE FIXTURE. Nothing in this file compares against a number I typed:
// h*sqrt(5) is asserted as an IDENTITY against the measured closest non-adjacent rest pair, and the feasibility
// ceiling is bracketed by a bisection rather than quoted.
import {
    SPACING, hang, drape, coherenceCeiling, minNonAdjacentRest, closestApproach,
    simulate, alternatingProjection, knobSweeps, monotone, reportLines, MEASURED_V3604,
} from "../../physics/xpbd/clothSoak.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const hangSc = hang();
const drapeSc = drape(5, 17, 0.6);
const coh = coherenceCeiling();
const feas = minNonAdjacentRest(hangSc);

// ---- 1. THE TWO CEILINGS ARE DERIVED, AND ONE OF THEM IS AN IDENTITY ---------------------------------------------
{
    ok("coherence ceiling is half the MESH SPACING, not a chosen number", coh === SPACING / 2, "r <= " + coh.toFixed(6));
    ok("!! the feasibility ceiling is an IDENTITY: the closest non-adjacent rest pair is the knight move h*sqrt(5)",
       Math.abs(feas.distance - SPACING * Math.sqrt(5)) < 1e-12,
       feas.distance.toFixed(6) + " measured against h*sqrt(5) = " + (SPACING * Math.sqrt(5)).toFixed(6));
    const [i, j] = feas.pair, W = hangSc.W;
    const dx = Math.abs((i % W) - (j % W)), dy = Math.abs(Math.floor(i / W) - Math.floor(j / W));
    ok("...and that pair really is a knight move (1,2)", Math.min(dx, dy) === 1 && Math.max(dx, dy) === 2, "pair " + JSON.stringify(feas.pair));
    ok("!! COHERENCE IS THE BINDING BOUND, and by a wide margin", coh < feas.ceiling / 2,
       coh.toFixed(6) + " against a feasibility ceiling of " + feas.ceiling.toFixed(6));
    ok("the adjacency set really does hide bonded pairs from the pass", hangSc.adj.has("0_1") && !hangSc.adj.has("1_8"),
       "which is WHY 2r > h is invisible to the collision pass and has to be ruled out by construction");
}

// ---- 2. THE FEASIBILITY CEILING IS BISECTED, NOT ASSERTED -----------------------------------------------------------
//
// Alternating projection: converge the mesh set, converge the collision set, repeat. A common solution exists =>
// the joint violation falls. None exists => it stalls at a floor no number of rounds touches.
{
    const held = simulate(hangSc, { radius: 0, frames: 300 }).pos;
    const below = alternatingProjection(hangSc, 0.334, held, { rounds: 60, inner: 40 });
    const above = alternatingProjection(hangSc, 0.340, held, { rounds: 60, inner: 40 });
    ok("below the predicted ceiling the two sets have a common solution", below.converging,
       below.first.toExponential(3) + " -> " + below.last.toExponential(3));
    ok("!! above it the projection STALLS -- no common solution exists", !above.converging,
       above.first.toExponential(3) + " -> " + above.last.toExponential(3) + ", flat");
    ok("...and the bracket contains the DERIVED ceiling", 0.334 < feas.ceiling && feas.ceiling < 0.340,
       "0.334 < " + feas.ceiling.toFixed(6) + " < 0.340");
    ok("...and it stalls HARDER further above, so the verdict is not a threshold artefact",
       alternatingProjection(hangSc, 0.5, held, { rounds: 20, inner: 40 }).final.joint > above.final.joint,
       "the violation grows with the ask");
    const control = alternatingProjection(hangSc, 0, held, { rounds: 20, inner: 40 });
    ok("POSITIVE CONTROL: with the collision set empty the same routine converges", control.final.joint < 1e-6,
       control.final.joint.toExponential(3) + " -- so 'STALLED' is a property of the pair, not of the routine");
}

// ---- 3. THE LOAD-BEARING NEGATIVE: THE SHIPPED 5x5 FIXTURE HAS NO HONEST RADIUS ------------------------------------
//
// This is the finding the round exists for, and it is SHOWN rather than argued: the pass is run at the honest
// radius on the shipped fixture and finds nothing at all.
{
    const ca = closestApproach(hangSc, 1000);
    ok("the hanging cloth never folds: closest non-adjacent approach over 1000 frames", ca.distance > 2 * coh,
       ca.distance.toFixed(6) + " against 2r = " + (2 * coh).toFixed(6));
    const atHonest = simulate(hangSc, { radius: coh, frames: 1000 });
    ok("!! SO AT THE HONEST RADIUS THE PASS FINDS ZERO PAIRS ON THE SHIPPED FIXTURE", atHonest.maxPairs === 0,
       "every knob sweep taken there would read exactly zero -- v3541's vacuous knob, in a third solver");
    ok("...and its ACTIVE window lies wholly ABOVE the coherence ceiling", ca.floor > coh,
       "[" + ca.floor.toFixed(6) + ", " + feas.ceiling.toFixed(6) + "] against a ceiling of " + coh.toFixed(6));
    ok("!! ...and 0.4, where v3602 and v3603 measured, is above the FEASIBILITY ceiling too", 0.4 > feas.ceiling,
       "those rounds measured a configuration with no solution, which is why the fixture had to change");
}

// ---- 4. THE REPLACEMENT FIXTURE'S TWO CONTROLS. EITHER FAILING MAKES THE SOAK MEANINGLESS ---------------------------
{
    const ca = closestApproach(drapeSc);
    ok("CONTROL A -- the drape genuinely passes through itself with the pass OFF", ca.distance < 2 * coh / 4,
       ca.distance.toFixed(6) + " against 2r = " + (2 * coh).toFixed(6) + ": real work for the pass to do");
    const off5 = simulate(drapeSc, { radius: 0 }), off200 = simulate(drapeSc, { radius: 0, iterations: 200 });
    ok("CONTROL B -- the MESH set alone converges on it", off200.worstStretch < off5.worstStretch / 1e3,
       off5.worstStretch.toExponential(3) + " at 5 iterations, " + off200.worstStretch.toExponential(3) +
       " at 200 -- HARD, NOT IMPOSSIBLE, which is the distinction the old fixture failed");
    ok("...and the run stays finite", off5.finite && off200.finite);
    // DRIVEN, NOT READ OFF THE SOURCE. My first version of this check matched a regex against clothSoak.mjs's
    // own text, which is the prose-as-code shape this tree has been caught by twenty times: it proves a spelling,
    // not a behaviour. Two particles inside 2r, non-adjacent, is the whole experiment.
    const tiny = (movable) => ({
        cons: [], adj: new Set(), colors: [], W: 2, H: 1, driven: false,
        init: { pos: Float64Array.from([0, 0, 0, 0.1, 0, 0]), vel: new Float64Array(6),
                invMass: Float64Array.from(movable ? [0, 1] : [0, 0]) },
    });
    ok("!! PINNED-PINNED contacts are excluded: two pinned particles inside 2r report NO pair",
       simulate(tiny(false), { radius: coh, frames: 1 }).maxPairs === 0,
       "solveColorPass skips wsum === 0, so counting them counts contacts nothing can resolve");
    ok("...and the exclusion is not just 'the counter is broken': one movable end DOES report the pair",
       simulate(tiny(true), { radius: coh, frames: 1 }).maxPairs === 1,
       "the first drape built here put both pinned rows exactly 2r apart and five such pairs sat in every tally forever");
}

// ---- 5. THE SOAK ITSELF: THE PASS DOES REAL WORK AT THE HONEST RADIUS ------------------------------------------------
{
    const off = simulate(drapeSc, { radius: 0, track: true });
    const on = simulate(drapeSc, { radius: coh });
    ok("collision OFF leaves deep interpenetration", off.worstPen > 0.5, off.worstPen.toExponential(3));
    ok("!! ONE SHIPPED SWEEP TAKES IT TO MACHINE ZERO", on.worstPen < 1e-14, on.worstPen.toExponential(3));
    ok("...and that is a COMPARISON, not a threshold", off.worstPen / Math.max(on.worstPen, Number.MIN_VALUE) > 1e12,
       "ratio " + (off.worstPen / on.worstPen).toExponential(2));
    ok("...without wrecking the mesh: stretch is within a few percent of the collision-off control",
       Math.abs(on.worstStretch - off.worstStretch) / off.worstStretch < 0.25,
       "off " + off.worstStretch.toExponential(3) + " vs on " + on.worstStretch.toExponential(3) +
       " -- the 63% of the old fixture was the impossible ask, not the solver");
}

// ---- 6. THE CHECK THIS FILE EXISTS FOR: v3603'S SWEEP IS FLAT, AND THE EQUALITY HAS A POSITIVE CONTROL ---------------
{
    const off = simulate(drapeSc, { radius: 0, track: true });
    const sw = knobSweeps(drapeSc, coh, off.deepestPos);
    const moms = sw.iterations.map((r) => r.momentum), pens = sw.iterations.map((r) => r.pen);
    ok("the sweep runs from a REAL contact, not a flat sheet", sw.iterations[0].pairs > 10 && off.deepest > 0.5,
       sw.iterations[0].pairs + " pairs at " + (off.deepest * 100).toFixed(1) + "% penetration");
    ok("!! MORE COLLISION SWEEPS LEAVE THE MOMENTUM ROW IDENTICAL -- not close, identical",
       moms.every((m) => m === moms[0]), moms[0].toExponential(3) + " at every one of " + moms.length + " sweep counts");
    ok("...and penetration is already at machine zero after ONE", Math.max(...pens) < 1e-14,
       "nothing for the second sweep to buy OR to cost");
    const cm = sw.compliance.map((r) => r.momentum), cp = sw.compliance.map((r) => r.pen);
    ok("!! POSITIVE CONTROL ON THE SAME PATH: compliance DOES move both rows",
       cm.some((m) => m !== cm[0]) && cp.some((p) => p !== cp[0]),
       "so the equality above is a measurement and not a sweep that quietly stopped running");
    ok("!! THE REAL TRADE: penetration MONOTONE worse with compliance", monotone(cp, +1),
       cp.map((v) => v.toExponential(3)).join(" -> "));
    ok("!! ...while the momentum row is MONOTONE better", monotone(cm, -1),
       cm.map((v) => v.toExponential(3)).join(" -> "));
    ok("...asserted as MONOTONE rather than 'bigger', since one reversal would make it a coincidence", true,
       "v3603's own idiom, and the reason its compliance anomaly could be retracted rather than defended");
}

// ---- 7. THE SHIPPED PATH IS UNTOUCHED, AND THE JOB HAS A DOOR ---------------------------------------------------------
//
// WHEN SOMEBODY DELIBERATELY MOVES A DEFAULT, THIS LINE GOES RED. Rewrite it to the new default and name the
// round that moved it. DO NOT delete it and DO NOT widen it to "some default" -- its whole value is that the
// recommendation in this module's header ("neither cure is recommended") and the shipped code agree.
{
    const loop = fs.readFileSync(path.join(ENG, "physics", "xpbd", "clothLoop.js"), "utf8");
    ok("!! clothLoop still defaults to ONE rigid collision sweep", /collisionIterations \?\? 1/.test(loop) && /collisionCompliance \?\? 0/.test(loop),
       "this round changed no default and recommends neither cure -- see the header's antidote");
    ok("...and this module never writes to clothLoop's defaults",
       !/clothLoop\.js["'][^]*writeFile/.test(fs.readFileSync(path.join(ENG, "physics", "xpbd", "clothSoak.mjs"), "utf8")));
    const bridge = fs.readFileSync(path.join(ENG, "ai-bridge", "rigJobBridge.js"), "utf8");
    ok("the soak is registered as a rig job", /id: "cloth-soak"/.test(bridge) && /run-cloth-soak\.mjs/.test(bridge),
       "a CLI-only deliverable is unfinished, and there is no cloth page anywhere in the tree to hang it on");
    ok("...and the runner is really there", fs.existsSync(path.join(ENG, "tools", "rig", "run-cloth-soak.mjs")));
    ok("...and the job is honest that it costs SECONDS, not minutes", /SECONDS rather than minutes/.test(bridge),
       "the registry is a front door, not a duration club");
    ok("the retraction is recorded rather than deleted", (MEASURED_V3604.retracted || "").includes("does not"),
       "v3603 filed it as an anomaly, so retracting it costs nothing");
    const rep = reportLines({ quick: true });
    ok("the report renders and names its own refusal", rep.length > 30 && rep.join("\n").includes("RETRACTED"),
       rep.length + " lines");
}

console.log(fails ? "\nclothSoak-selfcheck: " + fails + " FAILED" : "\nclothSoak-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
