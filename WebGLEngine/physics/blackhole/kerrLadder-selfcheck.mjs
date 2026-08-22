// physics/blackhole/kerrLadder-selfcheck.mjs
//
// v3360 -- FRAME DRAGGING GIVES A ROUTE A PREFERRED DIRECTION.
//
// transfer.mjs measured a Schwarzschild symmetry: a monotone route costs exactly the same flown outward or
// inward, 1.27300 either way, because geodesics are time-reversible and the burns are symmetric. That is a
// statement about a NON-SPINNING hole, and rotation should break part of it.
//
// It breaks the part about ORBITAL SENSE and leaves the part about ROUTE ORDER intact -- and separating those
// two is most of what this gate is for. Around a Kerr hole the spacetime itself distinguishes prograde from
// retrograde; it still does not distinguish climbing a ladder from descending it.
//
// THE KEY IS BARDEEN-PRESS-TEUKOLSKY (1972), and it is checked rather than trusted: at a = 0 the formula must
// reduce to probe.js's circularL, and it does BIT-IDENTICALLY at r = 6, 10 and 20.
//
// *** THE MISTAKE THIS GATE EXISTS TO PREVENT, BECAUSE I MADE IT. *** The first measurement compared ladders
// over stations at 8, 14 and 20 and reported a dramatic asymmetry. At a = 0.9 the RETROGRADE ISCO sits at
// 8.7174M, so r = 8 cannot hold a retrograde orbit at all: it was comparing a two-leg prograde ladder against a
// one-leg retrograde one. The code had flagged the leg unavailable and my comparison ignored the flag. Every
// comparison below runs on stations valid in BOTH senses and asserts bothAvailable first.
//
// AND THE RESULT NEEDS BOTH HALVES OR IT IS MISLEADING:
//     at a = 0.9, r = 10, retrograde needs 21.5% MORE angular momentum to BE in orbit
//                          and 31.8% LESS to CLIMB from 10M to 22M
// Dearer to enter, cheaper to climb. Quoting either alone would sell a conclusion the other half contradicts.

import { kerrCircularL, kerrCircularE, ladderCost, senseAsymmetry, stationAvailable } from "./kerrLadder.mjs";
import { circularL } from "./probe.js";
import { isco } from "./kerr.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const M = 1, ST = [10, 16, 22];

// ---- 1. THE a = 0 REDUCTION, CHECKED AGAINST EXISTING CODE ------------------------------------------------------
{
    // CORRECTION: this first asserted bit-identity at every radius. It holds at r = 6, 10 and 20 and fails at
    // r = 50 by ONE ULP (1.8e-15 absolute, 2.4e-16 relative) -- the BPT expression groups its operations
    // differently from circularL, so the last bit can land either way. Claiming bit-identity was a stronger
    // statement than the arithmetic supports; the real property is agreement to a few ULP, which is what
    // "reduces to" can mean between two differently-written forms of one formula.
    const rel = (r) => Math.abs(kerrCircularL(M, 0, r, true) - circularL(M, r)) / circularL(M, r);
    ok("!! at zero spin the Kerr form reduces to circularL, to within an ULP",
        [6, 10, 20, 50, 200].every((r) => rel(r) < 1e-15),
        `worst relative difference ${Math.max(...[6, 10, 20, 50, 200].map(rel)).toExponential(1)}. Checked ` +
        "against probe.js rather than against itself -- a new closed form that merely looked plausible in the " +
        "limit would be the duplicated-constant bug in a new costume. Bit-identical at 6, 10 and 20; one ULP " +
        "apart at 50, because the two expressions group their operations differently");

    ok("...and prograde and retrograde are indistinguishable at zero spin",
        Math.abs(kerrCircularL(M, 0, 10, true)) === Math.abs(kerrCircularL(M, 0, 10, false)),
        "Schwarzschild has no preferred sense of rotation, so the two magnitudes must be the same number and not " +
        "merely close");
}

// ---- 2. SPIN BREAKS THE SENSE SYMMETRY, MONOTONICALLY -------------------------------------------------------------
{
    const rows = [0, 0.3, 0.6, 0.9, 0.998].map((a) => senseAsymmetry(M, a, ST));
    ok("!! every comparison runs on stations valid in BOTH senses",
        rows.every((r) => r.bothAvailable),
        "asserted FIRST because the original measurement did not check it: at a = 0.9 the retrograde ISCO is at " +
        `${isco(M, 0.9, false).toFixed(4)}M, so a station at 8M exists prograde and does not exist retrograde. ` +
        "Comparing a two-leg ladder against a one-leg one produced a dramatic and meaningless number");

    ok("!! zero spin gives identical ladder costs, and spin makes them diverge",
        Math.abs(rows[0].ratio - 1) < 1e-12 && rows.every((r, i) => i === 0 || r.ratio < rows[i - 1].ratio),
        rows.map((r) => `a=${r.a}: ${r.ratio.toFixed(5)}`).join("  ") + ". The ratio leaves 1 the moment the hole " +
        "spins and falls monotonically -- frame dragging is the only thing changing");

    ok("...and near-extremal spin makes the retrograde ladder a third cheaper",
        rows[4].ratio < 0.7,
        `at a = 0.998 the retrograde ladder costs ${(rows[4].ratio * 100).toFixed(1)}% of the prograde one. ` +
        "Frame dragging compresses the retrograde angular-momentum ladder, so the SPACING between stations " +
        "shrinks even though every rung sits higher");
}

// ---- 3. BOTH HALVES, BECAUSE EITHER ALONE MISLEADS ------------------------------------------------------------------
{
    const a = 0.9, r = 10;
    const enterPro = Math.abs(kerrCircularL(M, a, r, true)), enterRetro = Math.abs(kerrCircularL(M, a, r, false));
    const s = senseAsymmetry(M, a, ST);
    ok("!! retrograde is DEARER to enter and CHEAPER to climb",
        enterRetro > enterPro * 1.1 && s.retrograde < s.prograde * 0.8,
        `|L| to hold a 10M orbit: ${enterPro.toFixed(5)} prograde against ${enterRetro.toFixed(5)} retrograde, ` +
        `${((enterRetro / enterPro - 1) * 100).toFixed(1)}% more. dL to climb 10M to 22M: ` +
        `${s.prograde.toFixed(5)} against ${s.retrograde.toFixed(5)}, ${((1 - s.ratio) * 100).toFixed(1)}% less. ` +
        "Quoting one without the other would sell a conclusion the other half contradicts");
}

// ---- 4. WHAT ROTATION DOES **NOT** BREAK ------------------------------------------------------------------------------
{
    const up = ladderCost(M, 0.9, ST, true).totalDeltaL;
    const down = ladderCost(M, 0.9, [...ST].reverse(), true).totalDeltaL;
    ok("!! route ORDER is still symmetric around a spinning hole",
        Math.abs(up - down) < 1e-12,
        `${up.toFixed(9)} climbing and ${down.toFixed(9)} descending, at a = 0.9. Rotation distinguishes ` +
        "prograde from retrograde; it does NOT distinguish climbing a ladder from descending it. Two different " +
        "symmetries, and only one of them breaks -- a gate asserting 'rotation breaks the symmetry' without " +
        "saying which would be wrong half the time");
}

// ---- 5. STATIONS ARE REFUSED WHERE NO ORBIT EXISTS ------------------------------------------------------------------------
{
    const inside = stationAvailable(M, 0.9, 8, false);
    ok("!! a station inside the retrograde ISCO is refused for that sense only",
        inside.ok === false && stationAvailable(M, 0.9, 8, true).ok === true,
        `r = 8M holds a prograde orbit (ISCO ${isco(M, 0.9, true).toFixed(4)}M) and not a retrograde one (ISCO ` +
        `${isco(M, 0.9, false).toFixed(4)}M). The same radius is available in one sense and not the other, which ` +
        "is the trap that produced the wrong first measurement");

    ok("...and the extremal limit is left alone deliberately",
        Number.isNaN(kerrCircularL(M, 1, 1, true)) || Math.abs(kerrCircularL(M, 1, 1.0000001, true) - 2 / Math.sqrt(3)) > 1e-3,
        "at a = M the prograde ISCO is at r = M and the BPT discriminant r^2 - 3Mr + 2a sqrt(Mr) vanishes there " +
        "exactly -- a 0/0 whose numerical value drifts 3% from the exact 2M/sqrt(3). That is a coordinate " +
        "artefact of the extremal limit, not a defect, and the honest response is to name it rather than to " +
        "quietly special-case it");
}

console.log();
if (fails) { console.log("kerrLadder-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("kerrLadder-selfcheck: all checks pass");
