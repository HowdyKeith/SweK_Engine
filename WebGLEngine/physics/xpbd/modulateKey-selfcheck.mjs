// physics/xpbd/modulateKey-selfcheck.mjs
//
// v3462 -- GRADING THE MULTI-PHYSICS SPINE. modulate.js is the pass fluid pressure, plasticity, thermal
// expansion and neural actuation all plug into, and its header names the property they all inherit: modulation
// recomputes each frame from a stored BASE, never from the value it wrote last frame. That single rule is what
// makes a coupling "stable and convergence-friendly", and it has three falsifiable edges -- none of them the
// tautology of grading a parameter against the formula that produced it:
//
//   ZERO FIELD RETURNS TO BASE   heat the mesh, drop the field to zero, and every parameter is EXACTLY rest0
//                                and compliance0 again -- a live-reading spine cannot undo an accumulated dent.
//   NO FRAME COMPOUNDING         under a FIXED field the parameter after 1 application equals the parameter
//                                after 100: frame-count independence, false the instant the spine reads live.
//   ORDER FREEDOM                a pure per-constraint function of the snapshot -- scrambling the order is a
//                                no-op to the bit.
//
// *** THE PLANTED FAULT IS THE ONE THE HEADER WARNS ABOUT, AND IT IS HONEST: read the LIVE value and heat
// compounds as (1 + expansion*T)^N -- yet at ONE application the two spines are IDENTICAL, so a check that fired
// at frame 1 would be accusing something other than the live-read. The divergence begins at frame 2. This is the
// compliance-key discipline (agree at one iteration) transplanted to the modulation spine.

import { modulateKeys, zeroFieldReturn, noCompounding, orderIndependence, livePlantedRun } from "./modulateKey.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const keys = modulateKeys();

// ---- 1. THE FIELD ACTUALLY DID SOMETHING -----------------------------------------------------------------------------
{
    ok("the field moves the spine before any invariance is read off it",
        Number.isFinite(keys.swell) && keys.swell > 1e-3 && keys.swells === true,
        `the ring swells by ${keys.swell.toExponential(3)} in mean rest under a fixed field (expansion 0.1, T 0.3). ` +
        "Asserted first because three zeros read from a spine that never moved would be inertness wearing the " +
        "costume of invariance -- the swell is the positive control that the keys below are measuring a live effect");
}

// ---- 2. ZERO FIELD RETURNS EXACTLY TO BASE ---------------------------------------------------------------------------
{
    const z = zeroFieldReturn();
    ok("!! heating then zeroing the field returns every parameter EXACTLY to base",
        z.zeroFieldErr === 0,
        `worst drift from rest0/compliance0 after a hot pass then a zero pass is ${z.zeroFieldErr.toExponential(2)}. ` +
        "The map recomputes from the stored base, so a zero field is the identity -- rest0*(1+expansion*0) is an " +
        "exact multiply-by-one. A spine that read the live value could not walk an accumulated dent back to base");
}

// ---- 3. A FIXED FIELD DOES NOT COMPOUND ACROSS FRAMES ----------------------------------------------------------------
{
    const nc = noCompounding({ frames: 100 });
    ok("!! the parameter after 100 applications equals the parameter after 1",
        nc.compoundErr === 0,
        `spread between frame 1 and frame ${nc.frames} is ${nc.compoundErr.toExponential(2)}. Frame-count ` +
        "independence is the whole promise: reading the base each frame makes N applications equal to one. This is " +
        "the key with power over the historically-real bug, and it is not a tautology -- it compares two runs, " +
        "not a value against its own closed form");
}

// ---- 4. THE MAP IS ORDER-FREE ----------------------------------------------------------------------------------------
{
    const oi = orderIndependence();
    ok("!! forward and reversed visit order agree to the bit on a heterogeneous field",
        oi.orderErr === 0,
        `worst forward-vs-reversed difference ${oi.orderErr.toExponential(2)} across a graded field. A pure ` +
        "per-constraint function of the snapshot cannot depend on which constraint is touched first");
}

// ---- 5. THE PLANTED LIVE-READ COMPOUNDS, AND THE PLANT IS HONEST -----------------------------------------------------
{
    const p = livePlantedRun({ frames: 100 });
    ok("!! reading the live value instead of the base compounds as (1+expansion*T)^N",
        p.compounds === true && Math.abs(p.plantedAtN - p.analyticCompound) / p.analyticCompound < 1e-12,
        `planted rest runs ${p.plantedAt1.toFixed(6)} -> ${p.plantedAt2.toFixed(6)} -> ${p.plantedAtN.toExponential(4)} ` +
        `at frame ${p.frames}, against the analytic (1.03)^${p.frames} = ${p.analyticCompound.toExponential(4)}. The dent ` +
        "the header warns of, made a number");

    ok("...and the plant AGREES with the correct spine at exactly one application",
        p.agreesAtOne === true,
        `correct ${p.correctAt1.toFixed(6)} equals planted-at-1 ${p.plantedAt1.toFixed(6)} to the bit -- after one pass ` +
        "the live value IS the base value, so the two spines run identical arithmetic and only diverge from frame 2. " +
        "A plant that differed here would be changing something other than the base-vs-live read it claims to");
}

console.log();
if (fails) { console.log("modulateKey-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("modulateKey-selfcheck: all checks pass");
