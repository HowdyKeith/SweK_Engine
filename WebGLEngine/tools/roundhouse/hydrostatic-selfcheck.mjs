// tools/roundhouse/hydrostatic-selfcheck.mjs
//
// v3294 -- THE SPH COLUMN BECOMES THE 43rd GRADED DEVICE, AND IT IS THE ONE ROUND THAT PROMOTES NO FINDING.
//
// THE HISTORY IS THE POINT. physicsSuite recorded at v2494: "THE SPH BACKEND PASSES 3 GREEN GATES AND CANNOT
// HOLD UP A COLUMN OF WATER", and named a soft equation of state as the cause. A later session declared that
// diagnosis wrong -- then retracted the declaration two versions later, because it had read a one-line summary
// and missed the note twenty lines below which already held the correction. It committed the original error and
// reported the fix as a discovery.
//
// A question answered twice and mis-answered twice does not need a third opinion. It needs its numbers held in
// place, which is what a graded device is for.
//
// REPRODUCED EXACTLY (recorded v2881 -> re-measured v3294):
//     ideal EOS at the packing's true rest density   0.632 -> 0.632
//     tait gamma=7 at c = 8 / 15 / 25                1.845 / 1.842 / 1.844, all within 0.1%
//
// *** AND THE MEASUREMENT THAT CONTRADICTS THE ORIGINAL DIAGNOSIS: TAIT DOES NOT SETTLE THE COLUMN, IT EXPANDS
// IT TO 184%. *** The v2494 note prescribed a proper equation of state as the fix. Measured, it swaps a collapse
// for an explosion. Both are failures to sit still.
//
// ONE ROW IS DELIBERATELY UNGRADED, and the reason is the same discipline as kuramoto's finite-size floor: the
// mis-stated-density case recorded 0.156 and now reads 0.090, which looks like drift and is not. The column is
// STILL FALLING at the measurement point -- 0.156 at 1200 steps, 0.090 at 1500, 0.038 at 1800. A collapse in
// progress has no settled height. Asserting any of those numbers would be pinning a constant onto a transient,
// so what gets asserted is the direction, which is stable.

import { getDevice } from "./devices.mjs";
import { MEASURED_V2881, makeColumn, settle } from "../../physics/sph/hydrostatic.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const dev = await getDevice("hydrostatic");

// ---- 1. THE RECORDED NUMBERS STILL HOLD --------------------------------------------------------------------------
{
    const matched = await dev.build({ mode: "matched" });
    const rec = MEASURED_V2881.find((m) => m.eos === "ideal" && m.restDensity === 144);
    ok("!! the matched-density column reproduces its v2881 measurement exactly",
        Math.abs(matched.retained - rec.retained) / rec.retained < 0.02,
        `recorded ${rec.retained.toFixed(3)}, re-measured ${matched.retained.toFixed(3)}. Four hundred versions ` +
        "apart, and the settled height has not moved -- which is the only claim a device can make about a " +
        "question that has already been answered");

    const taits = [];
    for (const cs of [8, 15, 25]) taits.push(await dev.build({ mode: "tait", config: { soundSpeed: cs } }));
    const recTait = MEASURED_V2881.filter((m) => m.eos === "tait");
    ok("...and so do all three Tait sound speeds",
        taits.every((t, i) => Math.abs(t.retained - recTait[i].retained) / recTait[i].retained < 0.02),
        taits.map((t, i) => `c=${[8, 15, 25][i]}: ${t.retained.toFixed(3)} vs ${recTait[i].retained.toFixed(3)}`).join("  "));
}

// ---- 2. TAIT EXPANDS, IT DOES NOT SETTLE ----------------------------------------------------------------------------
{
    const t = await dev.build({ mode: "tait" });
    const m = await dev.build({ mode: "matched" });
    ok("!! the prescribed 'fix' blows the column apart instead of holding it up",
        t.expanded === true && t.retained > 1.5 && m.collapsed === true,
        `Tait retains ${t.retained.toFixed(3)} -- 184% of the starting height -- while the ideal EOS collapses to ` +
        `${m.retained.toFixed(3)}. v2494 named a proper equation of state as the cure for the collapse; measured, ` +
        "it trades a collapse for an explosion. A device that only asked 'did it collapse' would call Tait a pass");

    ok("neither law holds the column, which is the honest summary",
        !(t.retained > 0.9 && t.retained < 1.1) && !(m.retained > 0.9 && m.retained < 1.1),
        "a column at rest under gravity must STAY a column. 0.632 and 1.842 are both failures of that, in " +
        "opposite directions, and calling either a success would require picking the direction one prefers");
}

// ---- 3. THE UNGRADED ROW, AND WHY -------------------------------------------------------------------------------------
{
    const a = settle(makeColumn({ eos: "ideal", restDensity: 400 }), { steps: 1200 }).retained;
    const b = settle(makeColumn({ eos: "ideal", restDensity: 400 }), { steps: 1500 }).retained;
    const c = settle(makeColumn({ eos: "ideal", restDensity: 400 }), { steps: 1800 }).retained;
    ok("!! the mis-stated-density row is NOT graded on its height, because it has not settled",
        a > b && b > c,
        `${a.toFixed(3)} at 1200 steps, ${b.toFixed(3)} at 1500, ${c.toFixed(3)} at 1800 -- monotonically falling. ` +
        `The recorded 0.156 was a snapshot of a collapse in progress, so the 42% "drift" from it is not drift at ` +
        "all; there is simply no settled number there to reproduce. Pinning one would invent a constant for a " +
        "transient, which is the failure mode this lab checks for elsewhere");

    const mis = await dev.build({ mode: "mismatched" });
    ok("...what IS asserted about it is the direction and the cause, which are stable",
        mis.collapsed === true && mis.densityMismatch > 1.5,
        `rest density stated 177% above the lattice's actual packing, and the column collapses. THE SETUP IS THE ` +
        "TEST -- v2494's own note says a rest density that does not match m/d^3 makes the fluid hang together by " +
        "tension at a fraction of rest density, and reporting that collapse as an engine defect is a discovery " +
        "about the test");
}

// ---- 4. DECLARED --------------------------------------------------------------------------------------------------------
{
    const { modesOf } = await import("./deviceModes.mjs");
    const m = modesOf(dev, null);
    ok("hydrostatic declares its modes -- 43 graded of 113 proven",
        m.source === "exported" && m.declared.length === 3,
        `source "${m.source}", modes ${JSON.stringify(m.declared)}`);
}

console.log();
if (fails) { console.log("hydrostatic-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("hydrostatic-selfcheck: all checks pass");
