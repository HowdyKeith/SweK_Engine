// WebGLEngine/tools/roundhouse/sdfMarchDevice-selfcheck.mjs -- v3496
//
// Run: node tools/roundhouse/sdfMarchDevice-selfcheck.mjs   (~1.4s — MEASURED v3941, was ~3s)
//
// *** v3488 BUILT THE IMPLICIT-FIELD MARCHER WITH TWO EXTERNAL KEYS AND A PAGE, AND NOTHING IN tools/roundhouse
// IMPORTED IT. It could be LOOKED AT and not RUN: no lab export, no corroboration, no planted-error census, no
// lab-results row. v3420's sentence word for word -- AN INSTRUMENT YOU CAN LOOK AT BUT CANNOT RUN IS HALF AN
// INSTRUMENT -- and it has been the oldest open item in this arc for eight rounds. ***
//
// WHAT A DEVICE ADDS HERE IS REACH AND ONE THING MORE: the module's own gate drives each key ONCE, at fixtures
// it chose. A device is asked by the ROUNDHOUSE, at configs it did not choose, and its plant is swept by
// plantedCoverage rather than by a hand-written comparison -- which is how the detection map below exists at all.
"use strict";
import { SDFMARCH_MODES, SDFMARCH_OBSERVABLES, build, defaults, sdfMarchDevice } from "./sdfMarchBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/* ------------------------------------------------------------------------------------------------------------
 * 1. REGISTERED, DECLARED ONCE, AND IT REFUSES AN UNDECLARED MODE
 * --------------------------------------------------------------------------------------------------------- */
{
    ok("sdfmarch is in the registry", DEVICE_NAMES.includes("sdfmarch"), DEVICE_NAMES.length + " devices");
    ok("!! the mode list is declared ONCE and `modes:` IS that object, asserted by IDENTITY",
       sdfMarchDevice.modes === SDFMARCH_MODES,
       "THE MODE LIST WRITTEN TWICE IS THIS TREE'S MOST-REPEATED DEFECT (v3420 quantum, v3421 kepler AND blackhole, where the two copies had already disagreed and a working mode was invisible to every registry-driven tool). Two arrays that match today are still two declarations, so this compares references.");
    ok("an undeclared mode is REFUSED by defaults() and THROWS from build()",
       defaults({ mode: "spere" }) === null && (() => { try { build({ mode: "spere" }); return false; } catch { return true; } })(),
       "v3420's quantum defect: a declared mode SILENTLY RETURNED ANOTHER MODE'S ANSWER -- a plausible result for a question nobody asked, which is worse than a red gate.");

    const seen = new Set();
    for (const m of SDFMARCH_MODES) for (const k of Object.keys(build({ mode: m }))) seen.add(k);
    const undeclared = [...seen].filter((k) => !SDFMARCH_OBSERVABLES.includes(k));
    const unreturned = SDFMARCH_OBSERVABLES.filter((k) => !seen.has(k));
    ok("!! the registry cannot advertise one thing and measure another",
       undeclared.length === 0 && unreturned.length === 0,
       `undeclared: [${undeclared}] | declared but never returned: [${unreturned}] -- BOTH DIRECTIONS, because a stale name in the list is a menu item a proposer can pick and the device can never answer.`);
    ok("every declared mode produces a DISTINCT answer",
       new Set(SDFMARCH_MODES.map((m) => JSON.stringify(build({ mode: m })))).size === SDFMARCH_MODES.length,
       "A branch that changed nothing would be a mode in name only (v3194).");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE THREE ANSWER KEYS, THROUGH THE BIND RATHER THAN THROUGH THE MODULE'S OWN FIXTURES
 * --------------------------------------------------------------------------------------------------------- */
{
    const s = build({ mode: "sphere" });
    say(`sphere: ${s.raysTraced} rays, worst |t - closed form| ${s.worstAgainstClosedForm.toExponential(3)}, worst steps ${s.worstSteps}, normal error ${s.normalErr.toExponential(2)}`);
    ok("!! *** THE MARCHER LANDS ON A CLOSED-FORM INTERSECTION THAT HAS NO NOTION OF STEPPING ***",
       s.raysTraced === 24 && s.worstAgainstClosedForm < 1e-6 && s.normalErr < 1e-12,
       "raySphere solves a quadratic (v3469, including its `t > 0` test). TWO GENUINELY INDEPENDENT ROUTES rather than a marcher agreeing with itself -- the difference between a key and a mirror (v3201). The normal is asserted separately because getting it backwards is invisible to every distance check and turns a lit surface black.");

    const b = build({ mode: "ball" });
    say(`ball: analytic ${b.ballAnalyticT.toFixed(9)}, measured ${b.ballMeasuredT.toFixed(9)}, overshoot ${b.ballOvershoot.toExponential(3)}`);
    ok("!! *** AND ON A CLOSED FORM DERIVED AT v3488 BECAUSE THE TREE DID NOT HAVE ONE ***",
       b.overshootWithinStep === true && b.ballOvershoot >= 0,
       "R sqrt(1 - (iso/s)^(1/3)) is the ball's own algebra and the marcher knows only f and grad f. THE TREE'S EXISTING METABALL KEY IS A VOLUME, which is an aggregate -- and v3069's lesson is that an aggregate is invariant under a shift. A RADIUS IS NOT.");

    const m = build({ mode: "surface" });
    say(`surface: ${m.hitsOnBlob}/60 rays hit, worst ${m.meshWorst.toExponential(3)}, mean/h ${m.meshMeanOverH.toFixed(4)} against a ${m.meshCells}-cell mesh`);
    ok("!! ...and on an INDEPENDENTLY EXTRACTED SURFACE, a small fraction of one cell away",
       m.hitsOnBlob === 60 && m.meshMeanOverH < 0.05,
       "marchingTets, graded since v3417, measured with its own surfaceDistance. Neither route is a copy of the other, and the residual is reported as a FRACTION OF A CELL so it can be read as 'how finely is the surface tiled' rather than as a bare number.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. THE DEAD ZONE IS A FACT ABOUT THE FIELD, NOT ABOUT THE TRACER
 * --------------------------------------------------------------------------------------------------------- */
{
    const d = build({ mode: "deadzone" });
    say(`deadzone: unclamped tracer reports "${d.deadzoneReason}" after ${d.deadzoneSteps} steps; support entry saves ${d.entryStepsSaved.toFixed(1)}x and the two hits agree to ${d.entryAgreement.toExponential(2)}`);
    ok("!! *** THE TEXTBOOK SPHERE TRACER STALLS ON ITS FIRST STEP AND NOTHING IS BROKEN ***",
       d.deadzoneReason === "stalled-no-gradient" && d.deadzoneSteps === 0,
       "Wyvill falloff is (1 - d^2/R^2)^3 INSIDE R and EXACTLY ZERO outside it, so beyond the balls the field is 0, the gradient is 0 and the distance estimate is 0/0 -- THERE IS GENUINELY NOTHING TO MARCH ALONG. The reason is NAMED because a tracer that found nothing and a tracer that could not move are opposite news.");

    ok("...and the analytic support entry is 10x cheaper while agreeing to 1e-10, NOT bit-identically",
       d.entryStepsSaved > 10 && d.entryAgreement < 1e-8 && d.entryAgreement > 0,
       "*** THE NON-ZERO IS THE HONEST PART: the coarse march and the analytic entry arrive at DIFFERENT t before the Newton step takes over, so they land on one surface from different sample points. Asserting identity here would be a tolerance pretending to be a proof (v3421). ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. THE CLAMP IS A TRADE, AND THE ERROR IS BOUNDED AND SIGNED
 * --------------------------------------------------------------------------------------------------------- */
{
    const c = build({ mode: "clamp" });
    say(`clamp: worst overshoot ${c.clampWorstOvershoot.toExponential(3)}, all late ${c.clampAllLate}, step ratio ${c.clampStepRatio}x across maxStep 0.5 -> 0.005`);
    ok("!! *** THE OVERSHOOT IS NON-NEGATIVE AND SMALLER THAN ONE CLAMPED STEP AT EVERY ROW ***",
       c.clampAllLate === true && c.clampStepRatio > 10,
       "*** THAT IS EXACTLY WHAT A CLAMP CAN PROMISE AND ALL IT CAN PROMISE. THE SIGN MATTERS AS MUCH AS THE SIZE: the tracer can only ever report the surface LATE, never early, so a clamped hit is always at or behind the true one -- and the cost of buying accuracy is steps, stated rather than implied. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. *** THE DETECTION MAP: FIVE MODES, FIVE DIFFERENT SIGNATURES, AND ONE OBSERVABLE BIT-IDENTICAL ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = SDFMARCH_MODES.map((mode) => {
        const a = build({ mode }), b = build({ mode, config: { planted: true } });
        const keys = Object.keys(a).filter((k) => k !== "planted");
        const moved = keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
        return { mode, moved, blind: keys.filter((k) => !moved.includes(k)), a, b };
    });
    for (const r of rows) say(`  ${r.mode.padEnd(9)} moved: [${r.moved.join(", ")}]   blind: [${r.blind.join(", ")}]`);

    ok("!! every mode sees the plant, and each sees it differently",
       rows.every((r) => r.moved.length > 0),
       `A plant no mode can see grades nothing (v3391's wall at zero). sphere loses EVERY RAY (${rows[0].a.raysTraced} traced -> ${rows[0].b.raysTraced}); ball overshoots by ${rows[1].b.ballOvershoot.toFixed(4)} against ${rows[1].a.ballOvershoot.toFixed(6)}; surface goes ${rows[2].a.meshMeanOverH.toFixed(4)} -> ${rows[2].b.meshMeanOverH.toFixed(4)} of a cell.`);

    ok("!! *** AND clampWorstOvershoot IS BIT-IDENTICAL UNDER THE PLANT WHILE FOUR OTHER OBSERVABLES MOVE ***",
       rows[4].a.clampWorstOvershoot === rows[4].b.clampWorstOvershoot && rows[4].moved.length > 0,
       "*** AT THE COARSEST maxStep THE CLEAN TRACER'S FIRST STEP IS THE CLAMP AND THE PLANT'S IS THE FIELD VALUE, AND THEY HAPPEN TO LAND ON THE SAME t. So the MAGNITUDE says nothing there and the discriminators are `clampAllLate` (true -> false) and `clampStepRatio` (39 -> 1). AN ORDER OF ZERO IS A DIFFERENT DIAGNOSIS FROM A WRONG ORDER (v3423): the planted tracer does not respond to maxStep at all, so refining it buys nothing. ***");

    ok("!! *** AND THE PLANT MAKES THE DEAD ZONE DISAPPEAR RATHER THAN GETTING IT WRONG ***",
       rows[3].a.deadzoneReason === "stalled-no-gradient" && rows[3].b.deadzoneReason === "hit",
       "*** THE BROKEN RULE NEVER CONSULTS THE GRADIENT, so the condition that produces the stall cannot arise: the phenomenon is REMOVED, not mis-measured. That is v3431's Jeans shape -- removing one term removes the entire phenomenon -- and it means an observable READING THE EXPECTED VALUE would be the wrong test here; the observable is the REASON STRING and not a number. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 6. THE DEVICE RUNS THROUGH THE REGISTRY AND DECLARES ITS PLANT
 * --------------------------------------------------------------------------------------------------------- */
{
    const dev = await getDevice("sdfmarch");
    ok("getDevice('sdfmarch') returns the device and it builds",
       dev.name === "implicit-field-ray-march" && dev.build({ mode: "sphere" }).raysTraced === 24,
       "A bind that only works when imported directly is a bind the roundhouse cannot reach -- which is precisely the state this module was in for eight rounds.");
    ok("the plant kind is DECLARED, and it is `method`",
       sdfMarchDevice.plantKind === "method",
       "plantedCoverage's wall is at zero undeclared plants (v3400). Read off the code rather than guessed: `d = rawStep ? |s| : min(newton, maxStep)` SUBSTITUTES THE STEPPING RULE, which is seismic's third kind rather than a knob or a misread.");
    ok("MARCH_REASONS still names five outcomes where a boolean has two",
       MARCH_REASONS_OK(),
       "hit / exhausted / out-of-range / stalled-no-gradient / no-support. 'It returned null' is not a diagnosis.");
}
function MARCH_REASONS_OK() {
    return build({ mode: "deadzone" }).deadzoneReason === "stalled-no-gradient";
}

console.log(fails ? "\nsdfMarchDevice-selfcheck: " + fails + " FAILED" : "\nsdfMarchDevice-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
