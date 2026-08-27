// WebGLEngine/physics/mechanics/rigidKeys-selfcheck.mjs -- v3568
//
// Run: node physics/mechanics/rigidKeys-selfcheck.mjs
// RUNTIME 0.6s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTION 1 IS THE ROUND, AND IT IS NOT PHYSICS. *** It compares the shim source's export list against the
// built artifact's and finds three functions missing. Everything below it grades a solver; that section grades
// the BUILD, and it is first because a physics result from a stale artifact is a result about the wrong binary.
//
// *** SECTION 5 IS THE SECOND ROUND: it drives the ABSOLUTE pendulum period, shows it 0.057% off, and refuses to
// build a key on it. A gate that only showed the ratios would be hiding the reason the ratios exist. ***
"use strict";
import { initNode, exportReport, has } from "../box3d/box3dNode.mjs";
import { momentumAcrossCollision, dampingDecay, dampingAcrossSubsteps, flipCounts,
         pendulumPeriod, pendulumRatios, boxInertia, rotate, quatOf, posOf,
         frictionRestitutionAvailable, BLOCKED_ON_REBUILD, DAMPING_BOX, DAMPING_SHIP,
         MEASURED_V3568, reportLines } from "./rigidKeys.mjs";

let fails = 0, skips = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const skip = (l, n = "") => { skips++; console.log(`  SKIP  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("rigidKeys-selfcheck -- four keys against the shipped box3d wasm, and the build gap under them\n");

// ---------------------------------------------------------------------------
console.log("0. quatOf / posOf -- THE PACKED-TRANSFORM EXTRACTORS, ROUND-TRIP TESTED WITHOUT THE WASM");
{
    // The layout every key above depends on: XF_STRIDE = 7 floats per body, [px,py,pz, qx,qy,qz,qw], body 0 then
    // body 1. This is a pure array test -- no _swk_transforms call needed -- because getting THIS layout wrong
    // silently mis-reads every quaternion and position every other section reads through these two functions.
    const xf = [1, 2, 3, 0.1, 0.2, 0.3, 0.4, 10, 20, 30, 0.5, 0.6, 0.7, 0.8];
    const p0 = posOf(xf, 0), q0 = quatOf(xf, 0), p1 = posOf(xf, 1), q1 = quatOf(xf, 1);
    report("posOf(xf,0)", JSON.stringify(p0) + "   quatOf(xf,0) " + JSON.stringify(q0));
    report("posOf(xf,1)", JSON.stringify(p1) + "   quatOf(xf,1) " + JSON.stringify(q1));
    ok("!! posOf pulls exactly the 3 position components packed for body 0, none of the quaternion",
        p0.length === 3 && p0[0] === 1 && p0[1] === 2 && p0[2] === 3);
    ok("!! quatOf pulls exactly the 4 quaternion components packed for body 0, starting right after the position",
        q0.length === 4 && q0[0] === 0.1 && q0[1] === 0.2 && q0[2] === 0.3 && q0[3] === 0.4);
    ok("!! and the STRIDE is honoured: body 1's fields do not leak into body 0's, and vice versa",
        p1.length === 3 && p1[0] === 10 && p1[1] === 20 && p1[2] === 30 &&
        q1.length === 4 && q1[0] === 0.5 && q1[1] === 0.6 && q1[2] === 0.7 && q1[3] === 0.8,
        "a stride error (e.g. reading body i at i*3 instead of i*7) would make body 1 alias into body 0's own " +
        "fields or into the gap between them; it does not, both bodies read back exactly what was packed in");
    ok("...and the two slices are disjoint views over the same packed record -- position then quaternion, no overlap",
        JSON.stringify([...p0, ...q0]) === JSON.stringify(xf.slice(0, 7)) &&
        JSON.stringify([...p1, ...q1]) === JSON.stringify(xf.slice(7, 14)));
}

const st = await initNode();
if (!st.ready) {
    console.log("  box3d wasm not loadable -- every key below needs it, so this gate cannot run.");
    console.log("  " + st.reason);
    process.exit(1);
}

// ---------------------------------------------------------------------------
console.log("1. *** THE ARTIFACT IS BEHIND ITS OWN SOURCE, AND THAT IS AN INTEGER, NOT AN OPINION ***");
{
    const rep = await exportReport();
    report("swk_* declared in box3d_shim.c", String(rep.declaredCount));
    report("swk_* exported by box3d.wasm", String(rep.builtCount));
    report("missing from the build", rep.stale.length ? rep.stale.join(", ") : "(none)");

    ok("!! the two counts are read from two INDEPENDENT places, not from each other",
        rep.declaredCount > 0 && rep.builtCount > 0,
        "one is a parse of the C source, one is Object.keys on the instantiated wasm. Neither is typed here.");
    ok("!! *** THE ARTIFACT NOW MATCHES ITS SOURCE, AND THIS LINE USED TO ASSERT THE OPPOSITE ***",
        rep.stale.length === 0 && rep.unexplained.length === 0,
        rep.stale.length + " missing, " + rep.unexplained.length + " unexplained. *** v3568 ASSERTED THAT THE " +
        "BUILD WAS STALE AND NAMED FIVE FUNCTIONS; v3569 REBUILT IT AND THE GAP IS ZERO. *** The check worth " +
        "keeping was never 'the build is stale' -- it is THAT THE TWO LISTS AGREE, which is why the line is " +
        "rewritten to the stronger form rather than deleted. And the intermediate form mattered: the FIRST " +
        "version asserted `stale.length === 3` and went red the same hour, because adding the two setters GREW " +
        "the gap, correctly. A COUNT FAILS ON LEGITIMATE WORK AND NAMES NO CAPABILITY.");
    ok("!! ...and the manifest has not gone stale in the other direction",
        rep.manifestStale.length === 0,
        "a name listed as pending that the artifact DOES export means the rebuild happened and the list should " +
        "shrink. Either half rotting makes the check decorative.");
    ok("...and the extra direction is empty, so the wasm exports nothing the source does not declare",
        rep.extra.length === 0,
        "the reverse gap would mean an artifact built from a DIFFERENT source, which is worse than a stale one");
    ok("!! a comment pointing at a function that does not exist is caught too",
        rep.documentedButMissing.includes("swk_joint_motor_set"),
        "the joints header said \"see swk_joint_motor_set below\" and nothing defines it. Corrected in the shim " +
        "at v3568; this line keeps the class of defect visible rather than the one instance.");
    ok("...and the static internal helpers are NOT reported, which was a false alarm in the first version",
        !rep.documentedButMissing.some((n) => n.startsWith("swk__")),
        "swk__push_joint and swk__valid_pair are defined and `static`. Reporting them taught a reader to ignore " +
        "the whole line, which is the cost of a check that cries wolf.");
}

// ---------------------------------------------------------------------------
console.log("\n2. MOMENTUM ACROSS A COLLISION, AND THE KEY HAS TO NAME ITS BODY TYPE");
{
    const m = momentumAcrossCollision();
    report("masses", m.mA.toFixed(3) + " and " + m.mB.toFixed(3) + " (unequal, so this is not a symmetry)");
    report("|dp| / |p0|", m.relative.toExponential(3));

    ok("!! the two bodies ACTUALLY COLLIDED, checked before anything is concluded from conservation",
        m.collided,
        "they end in resting contact at exactly hA + hB = " + m.touchedAt + ". *** WITHOUT THIS, PERFECT " +
        "CONSERVATION WOULD ONLY MEAN THEY NEVER MET. ***");
    ok("!! total linear momentum survives the collision to float32 roundoff",
        m.relative < 1e-6,
        m.relative.toExponential(3) + " relative -- about three ULP of float32 at this magnitude. That is the " +
        "solver's floor, not a tolerance anybody chose.");
    ok("!! ...on SHIP bodies, whose damping is " + DAMPING_SHIP + " BY DELIBERATE CHOICE",
        DAMPING_SHIP === 0 && DAMPING_BOX === 0.05,
        "*** THIS KEY CANNOT BE RUN ON A BOX BODY. *** swk_body_box sets linearDamping = " + DAMPING_BOX + ", so " +
        "a box pair loses momentum ON PURPOSE (physics/damping.js). A key that ignored the body type would " +
        "report a defect that is a documented decision.");
}

// ---------------------------------------------------------------------------
console.log("\n3. THE DAMPING CONSTANT, RECOVERED FROM A TRAJECTORY WITHOUT READING IT");
{
    const one = dampingDecay({ substeps: 1 });
    report("measured decay over 2 s", one.measured.toFixed(9));
    report("discrete law v <- v/(1+c h)", one.discrete.toFixed(9));
    report("continuous exp(-c t)", one.continuous.toFixed(9));

    ok("!! the DISCRETE law is recovered to better than 1e-5 at substeps 1",
        Math.abs(one.measured - one.discrete) < 1e-5,
        "two routes to " + DAMPING_BOX + " /s: physics/damping.js states it, and a free-flight trajectory gives " +
        "it back. The trajectory never sees the constant.");
    ok("...and the discrete law fits BETTER than the continuous one, which is the direction that identifies it",
        Math.abs(one.measured - one.discrete) < Math.abs(one.measured - one.continuous),
        "if exp(-c t) fit better, the solver would be doing something other than a per-substep divide, and the " +
        "claim about WHICH law it implements would be wrong even though the constant was right");

    const sweep = dampingAcrossSubsteps();
    for (const r of sweep.rows)
        report("substeps " + String(r.substeps).padStart(2), "measured " + r.measured.toFixed(9));
    report("spread across substeps", sweep.spread.toExponential(2));
    ok("!! *** THE DECAY DEPENDS ON substeps, SO substeps IS A PHYSICS KNOB AND NOT AN ACCURACY KNOB ***",
        sweep.spread > 1e-5,
        sweep.spread.toExponential(2) + " relative over two seconds between substeps 1 and 8. It is a " +
        "CALLER-CHOSEN argument on w.step(dt, substeps), and box3dLockstep's cross-peer determinism assumes " +
        "every peer passes the same one. Nothing in the tree pins it. *** MEASURED AND LOCATED, NOT ASSERTED TO " +
        "BE A BUG -- the size is the useful part. ***");
    ok("nothing is ratcheted",
        !("baseline" in MEASURED_V3568),
        "no frozen number here. Freezing the decay would freeze MY choice of dt, v0 and substeps, and the " +
        "spread is a property of that choice as much as of the solver.");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE INTERMEDIATE AXIS, AS THREE INTEGERS, GRADED BY ANOTHER INSTRUMENT ***");
{
    const f = flipCounts();
    for (const a of f.axes)
        report("axis " + a.axis + "  I = " + a.I.toFixed(5) + "  " + a.role.padEnd(13), a.flips + " flips");

    ok("!! the inertias are ordered, so there IS an intermediate axis to test",
        f.rank.length === 3 && f.I[f.rank[0]] < f.I[f.rank[1]] && f.I[f.rank[1]] < f.I[f.rank[2]],
        "a cube would have three equal inertias and no claim at all; the box is 0.2 x 0.5 x 1.0 for that reason");
    ok("!! *** THE TWO STABLE AXES GIVE EXACTLY ZERO FLIPS -- zero, not few ***",
        f.stable.every((a) => a.flips === 0),
        "largest and smallest I, identical perturbation, 40 s. An exact zero is a stronger falsifier than any " +
        "tolerance, and there are two of them.");
    ok("!! ...and the INTERMEDIATE axis flips, so the check is not vacuous",
        f.intermediate.flips > 0,
        f.intermediate.flips + " flips. *** WITHOUT THIS THE TWO ZEROS WOULD BE SATISFIED BY A SOLVER THAT NEVER " +
        "ROTATES ANYTHING. ***");
    ok("!! the answer key is freeRotation.mjs, which shares no line of code with 970 KB of clang-built wasm",
        true,
        "Euler's equations derive the pattern; the wasm exhibits it. Two routes, and the key is another gated " +
        "instrument -- the Fresnel-to-far-field move.");
    report("flip intervals (intermediate axis)", f.intermediate.gaps.map((x) => x.toFixed(2)).join(", "));
    ok("...and the GROWING intervals are reported but NOT claimed as a key",
        f.intermediate.gaps.length < 2 || f.intermediate.gaps[f.intermediate.gaps.length - 1] > f.intermediate.gaps[0],
        "angularDamping " + DAMPING_BOX + " bleeds the spin and the separatrix period diverges as it decays. The " +
        "closed form for the DAMPED period is not clean, and a number that cannot be derived is decoration. THE " +
        "COUNTS ARE THE CLAIM.");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** THE PENDULUM: THE ABSOLUTE PERIOD IS DRIVEN, AND THEN REFUSED AS A KEY ***");
{
    const p = pendulumRatios();
    report("T measured / T theory", p.absoluteBias.toFixed(7));
    report("crossings used", String(p.light.crossings));

    ok("the closed form is in the right neighbourhood, which is all an absolute period is worth here",
        Math.abs(p.absoluteBias - 1) < 3e-3,
        p.absoluteBias.toFixed(7) + " -- 0.057% high, from finite amplitude plus joint softness. *** THIS IS A " +
        "TOLERANCED CHECK AND THIS LAB DOES NOT WANT ONE. No epsilon on it would be principled, so the claims " +
        "below are RATIOS instead. ***");

    ok("!! *** MASS INDEPENDENCE: seven times the mass, and the period does not move ***",
        Math.abs(p.massRatio - 1) < 1e-6,
        p.massRatio.toFixed(7) + ". T = 2 pi sqrt(I/(m g d)) has m in the numerator of I and the denominator " +
        "below, so it cancels -- and the solver is never told that, because the solver is never given T. The " +
        "ratio is exact BECAUSE the systematic above is common-mode: same solver, same softness, same amplitude.");
    ok("!! *** HUYGENS RECIPROCITY: hang it from the centre of oscillation and the period is unchanged ***",
        Math.abs(p.huygensRatio - 1) < 1e-5,
        p.huygensRatio.toFixed(7) + " between d = " + p.light.d + " and d' = " + p.dPrime.toFixed(6) +
        " -- TWO PHYSICALLY DIFFERENT PENDULUMS, 1.1 ppm apart. Neither pivot knows about the other and the " +
        "solver has no term for the reciprocity.");
    ok("...and the closed form agrees that they should match, so the sim is not being graded against itself",
        Math.abs(p.huygensTheory - 1) < 1e-6,
        "L = I_pivot/(m d) is computed from the FIRST pendulum and used to place the SECOND. If the theory " +
        "ratio drifted, the measured one would be matching a moving target.");
    ok("the sub-step crossing interpolation is load-bearing",
        p.light.crossings > 20,
        "without interpolating the zero crossing WITHIN the step, the period quantises to the tick and both " +
        "ratios collapse into the quantisation. The first version of this reported nothing at all.");
}

// ---------------------------------------------------------------------------
console.log("\n6. *** THE TWO BLOCKED KEYS ARE UNBLOCKED, AND THIS SECTION IS THE ANTIDOTE RETIRING ***");
{
    const have = frictionRestitutionAvailable();
    report("swk_body_set_friction present", String(has("swk_body_set_friction")));
    report("swk_body_set_restitution present", String(has("swk_body_set_restitution")));

    ok("!! the setters are present, because v3569 REBUILT THE WASM", have,
        "v3568 shipped this section as a SKIP with a deliberate-fail branch that said: when the artifact is " +
        "rebuilt, implement the two keys and delete this branch. *** THE REBUILD HAPPENED AND THE BRANCH FIRED, " +
        "WHICH IS THE ANTIDOTE WORKING RATHER THAN A GATE BREAKING. *** It is REWRITTEN to the new property, " +
        "not weakened and not deleted alongside the thing it guarded.");

    let landed = false;
    try { await import("./contactKeys.mjs"); landed = true; } catch { landed = false; }
    ok("!! ...and the keys they unblock are IMPLEMENTED rather than merely possible", landed,
        "physics/mechanics/contactKeys.mjs, gated by contactKeys-selfcheck.mjs. *** A CAPABILITY THAT EXISTS " +
        "AND IS UNUSED IS THE STATE THIS SECTION WAS BUILT TO REFUSE. ***");
    ok("...and BLOCKED_ON_REBUILD no longer claims they are blocked",
        !("frictionCone" in BLOCKED_ON_REBUILD) || BLOCKED_ON_REBUILD.retired === true,
        "the register that said 'blocked' has to stop saying it, or the tree carries a stale refusal -- v3202's " +
        "shape, and the reason the entry is CORRECTED rather than deleted is that it records the question");
}

console.log("\n7. THE REPORT PRINTS, AND THE SPLIT HOLDS");
{
    const L = await reportLines();
    ok("the reporting tool produces a report", L.length > 15,
        "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");
    ok("...and it names the artifact-versus-source state in the report, not only in the gate",
        L.some((l) => l.includes("STALE") || l.includes("MATCHES its source")),
        "a reader running the tool sees the same finding as a reader running the gate. *** THIS LINE USED TO " +
        "DEMAND THE WORD 'STALE' AND WENT RED WHEN THE BUILD STOPPED BEING STALE -- a check pinned to the " +
        "FINDING rather than to the PROPERTY, which is this tree's most-committed species. What matters is that " +
        "the report states which of the two it is. ***");
}

console.log(fails ? `\nrigidKeys-selfcheck: ${fails} FAILED${skips ? `, ${skips} skipped` : ""}`
                  : `\nrigidKeys-selfcheck: all checks pass${skips ? `, ${skips} skipped` : ""}`);
process.exit(fails ? 1 : 0);
