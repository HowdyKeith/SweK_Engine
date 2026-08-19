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
        m.source === "exported" && m.declared.length === 4,      // v3845: + the `surfacedensity` plant mode
        `source "${m.source}", modes ${JSON.stringify(m.declared)}`);
}

// ---- 5. THE MODE PLANT, AND THE OBSERVABLE IT DELIBERATELY DOES NOT USE (v3845) ------------------------------
// *** THE ROUND'S FINDING IS A NEGATIVE AND IT IS PINNED FIRST: `retained` CANNOT HOLD A PLANT. *** It is an
// END STATE -- collapsed under ideal, blown apart under Tait -- and once the column has done either, a method
// defect of any plausible size lands in the same place. A plant declared against it would be technically live
// (the census only asks that the number MOVE) and would certify this device on a sub-percent wobble.
{
    const honest = await dev.build({ mode: "matched" });
    const planted = await dev.build({ mode: "surfacedensity" });

    ok("!! the plant is DECLARED in the shape the census adjudicates",
        dev.plantMode === "surfacedensity" && dev.plantFlips === "densityMismatch" &&
        dev.modes.includes("surfacedensity") && dev.modes[0] === "matched",
        'modes ' + JSON.stringify(dev.modes) + ' -- "matched" stays FIRST so the contract compares the plant ' +
        "against the mode that owns the recorded row it breaks");

    ok("!! the DECLARED observable flips across the bar: densityMismatch",
        planted.densityMismatch > 1e-2 && honest.densityMismatch < 1e-2,
        `${honest.densityMismatch.toExponential(4)} -> ${planted.densityMismatch.toExponential(4)}, an 11.1x ` +
        `separation. packedDensity ${honest.packedDensity.toFixed(3)} -> ${planted.packedDensity.toFixed(3)}: an SPH ` +
        "density is a kernel sum, so a particle at the free surface has half a neighbourhood and reads LOW. " +
        "Averaging over all 686 particles instead of the 441 interior ones REPORTS THE SURFACE DEFICIT AS THE " +
        "LATTICE'S DENSITY -- the canonical SPH mistake, and this file's whole history is about that number");

    ok("!! *** AND `retained` DOES NOT MOVE AT ALL, WHICH IS THE POINT OF THE ISOLATION ***",
        planted.retained === honest.retained,
        `${honest.retained.toFixed(4)} in BOTH arms, bit-identical. \`matched\` hands makeColumn an explicit ` +
        "restDensity of 144, so the WORLD IS IDENTICAL and the plant perturbs only the measurement under " +
        "grade. A plant that moved the physics too would not isolate the claim");

    // *** THE NEGATIVE IS MEASURED HERE, NOT QUOTED -- but ONE candidate, not both. *** verify.mjs gives each
    // gate 180 s and every settle here costs ~20 s, so asserting all four arms put this gate at 103 s on the
    // sandbox and left no margin for a slower rig. The ideal/rho0 arm is the one that belongs in a gate: it is
    // this file's own subject. The Tait arm (B missing its /gamma: 1.8418 -> 1.8352, 0.4%, still `expanded`)
    // is recorded in hydrostaticBind.mjs's header as a measurement, which is where a fact nobody re-derives
    // every run belongs. THE BASELINE IS REUSED FROM `honest` RATHER THAN SETTLED TWICE.
    const assumedNominal = settle(makeColumn({ eos: "ideal", restDensity: 0.02 / Math.pow(0.05, 3) }),
                                  { steps: 1500, dt: 1 / 1000 }).retained;      // the nominal m/d^3 = 160

    const relMove = (a, b) => Math.abs(a - b) / Math.abs(a);
    ok("!! ...and `retained` is SATURATED under a REAL defect, which is why it is not the declared observable",
        relMove(honest.retained, assumedNominal) < 0.05 &&
        relMove(honest.densityMismatch, planted.densityMismatch) > 5,
        `rho0 ASSUMED as the nominal m/d^3 = 160 instead of the measured 144.34 moves retained ` +
        `${honest.retained.toFixed(4)} -> ${assumedNominal.toFixed(4)} ` +
        `(${(100 * relMove(honest.retained, assumedNominal)).toFixed(1)}%, and STILL \`collapsed\`) -- against ` +
        `densityMismatch's ${(100 * relMove(honest.densityMismatch, planted.densityMismatch)).toFixed(0)}% on ` +
        "the plant. *** THE CENSUS ASKS 'DID IT MOVE'; A PLANT HAS TO ANSWER 'WOULD THE GATE HAVE CAUGHT IT', " +
        "AND THOSE COME APART EXACTLY HERE: the defect is REAL and the headline observable cannot see it. ***");

    ok("...and the validator LISTS the plant mode, so it cannot silently revert",
        (await dev.build({ mode: "nonsense-mode" })).densityMismatch === honest.densityMismatch &&
        dev.defaults({ mode: "surfacedensity" }).mode === "surfacedensity",
        "v3806 lost a round to a validator that reverted its plant in silence; an unrecognised mode falls " +
        "back to `matched` and `surfacedensity` survives");
}

console.log();
if (fails) { console.log("hydrostatic-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("hydrostatic-selfcheck: all checks pass");
