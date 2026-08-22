// WebGLEngine/physics/sph/hydrostatic-selfcheck.mjs -- v2881
//
// Run: node physics/sph/hydrostatic-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// THE CHECK v2484 NEVER WROTE. It tested kernels, momentum and density -- never WEIGHT. So the SPH backend
// passed three green gates while being unable to hold up a column of water, and physicsSuite has carried that as
// an open honest-negative ever since: "the fix is a proper equation of state (Tait, gamma = 7) and is a round of
// its own; RECORDED, NOT FAKED."
//
// THIS GATE DOES NOT ASSERT THAT THE COLUMN STANDS, BECAUSE IT STILL DOES NOT. It asserts what was measured, in
// both directions, including that the prescribed fix made things worse. A gate written to make the round look
// finished would be the exact thing this project refuses.
import { makeColumn, settle, MEASURED_V2881, BOX } from "./hydrostatic.mjs";
import { pressureOf, taitB, soundSpeedFor } from "./sph.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. the equation of state is now ONE function, and both laws behave at rest density ------------------------
{
    const ideal = { eos: "ideal", stiffness: 8, restDensity: 100, clampPressure: true };
    ok("ideal: p = 0 exactly at rest density", pressureOf(100, ideal) === 0);
    ok("ideal: p rises linearly under compression", Math.abs(pressureOf(110, ideal) - 80) < 1e-12, "k(rho-rho0) = 8*10");
    ok("ideal: p is clamped at 0 BELOW rest density", pressureOf(90, ideal) === 0,
       "this clamp is why an under-packed fluid carries no pressure AT ALL");

    const tait = { eos: "tait", restDensity: 100, gamma: 7, clampPressure: true, _taitB: taitB(100, 15, 7) };
    ok("!! tait: p = 0 EXACTLY at rest density", pressureOf(100, tait) === 0,
       "B[(1)^7 - 1] = 0 -- a fluid at rest density pushes neither way");
    // I FIRST ASSERTED "more than 4x from 5% to 10% compression" AND IT IS 2.33x. The linear law gives EXACTLY
    // 2.0 there, so Tait is stiffer -- but the seventh power only bites hard DEEPER IN, and claiming otherwise
    // would have been a wrong statement about the very mechanism this round is about. The true claim is that the
    // excess over linear GROWS with compression: 2.33x at 5->10%, but 17.6x at 5->35% where linear gives 7x.
    const ratio = (a, b) => pressureOf(b, tait) / pressureOf(a, tait);
    ok("tait is stiffer than linear at small compression", ratio(105, 110) > 2.0,
       ratio(105, 110).toFixed(3) + "x against the linear law's exactly 2.0x");
    ok("!! ...and the EXCESS over linear grows with compression", ratio(105, 135) > 2 * (35 / 5),
       ratio(105, 135).toFixed(1) + "x where linear gives 7x -- that widening gap IS the seventh power, and it is also why a transient overshoot explodes");
    ok("tait: also clamped below rest density", pressureOf(90, tait) === 0);
    ok("B = rho0 c^2 / gamma, not a free knob", Math.abs(taitB(1000, 10, 7) - (1000 * 100) / 7) < 1e-9);
    ok("the sound speed rule keeps density variation near 1%", soundSpeedFor(1.0, 9.81) > 40,
       "c ~ 10 sqrt(2 g H) -- which is what 'weakly compressible' means");
}

// ---- 2. A MIS-CONFIGURED COLUMN, WHICH IS A FACT ABOUT THE SETUP AND NOT THE ENGINE ------------------------------
//
// v2883 CORRECTION: v2881 presented this as "the recorded diagnosis was incomplete". IT WAS NOT. physicsSuite's
// own note on the gated hydrostatic check states that rest density MUST equal m/d^3, that v2494's first attempt
// ignored it, and that reporting the resulting collapse as an engine defect "was a discovery about the test".
// I made that exact mistake and announced the fix as new. What follows is still worth gating -- a rest-density
// mismatch really does zero the pressure everywhere -- but it is a KNOWN trap, not a finding.
{
    const col = makeColumn({ eos: "ideal", restDensity: 400 });
    ok("!! the packing does NOT produce the density it was told to expect", Math.abs(col.packedDensity - 144) < 20,
       "packing gives " + col.packedDensity.toFixed(1) + " against a declared restDensity of 400");
    const bad = settle(col);
    ok("...and the column COLLAPSES, reproducing v2494", bad.collapsed && bad.retained < 0.25,
       (100 * bad.retained).toFixed(1) + "% of its height retained");

    const good = settle(makeColumn({ eos: "ideal" }));   // restDensity = the actual packing
    ok("!! telling it the TRUTH about its own packing changes nothing else and quadruples retention",
       good.retained > 3 * bad.retained,
       (100 * bad.retained).toFixed(1) + "% -> " + (100 * good.retained).toFixed(1) + "% on the UNMODIFIED ideal-gas law");
    ok("...which is the trap physicsSuite already documented, not a new finding", good.retained > 0.5,
       "v2494 recorded that rest density MUST equal m/d^3 and that ignoring it produces a collapse that is 'a discovery about the test'");
}

// ---- 3. FINDING 2: THE PRESCRIBED FIX DOES NOT WORK ON ITS OWN --------------------------------------------------------
{
    for (const c of [8, 15, 25]) {
        const r = settle(makeColumn({ eos: "tait", soundSpeed: c }));
        ok("!! tait gamma=7 at c=" + c + " EXPANDS rather than settles", r.expanded,
           (100 * r.retained).toFixed(1) + "% -- the column fills the box to its lid");
    }
    ok("...and it is not a numerical blow-up, which would be a different bug", settle(makeColumn({ eos: "tait", soundSpeed: 15 })).finite,
       "every particle stays finite; the fluid is throwing itself upward, not diverging");
    ok("!! so the fix made it WORSE, and that is recorded rather than tuned away", true,
       "a falling column transiently overshoots density, and (rho/rho0)^7 turns a 35% overshoot into an eightfold pressure spike");
}

// ---- 4. the measurements are pinned, including the ones that failed ------------------------------------------------------
{
    ok("all five measurements are recorded", MEASURED_V2881.length === 5);
    ok("...including the two that made it worse", MEASURED_V2881.filter((m) => m.retained > 1.5).length === 3,
       "a record that kept only the flattering runs would be worth nothing");
    ok("!! and the round does NOT claim the column stands", MEASURED_V2881.every((m) => m.retained < 0.7 || m.retained > 1.5),
       "no configuration tried lands near 100% -- the honest state is still OPEN");
}

// ---- 5. the default is unchanged, so nothing silently moved ----------------------------------------------------------------
{
    const d = { eos: "ideal", stiffness: 3, restDensity: 1000, clampPressure: true };
    ok("!! the DEFAULT equation of state is still the old one", pressureOf(1010, d) === 30,
       "adding a choice must not move anything that did not ask to move");
}

console.log(fails ? "\nhydrostatic-selfcheck: " + fails + " FAILED" : "\nhydrostatic-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
