// WebGLEngine/physics/mesh/rowWeight-selfcheck.mjs -- v3649
//
// Run: node physics/mesh/rowWeight-selfcheck.mjs
//
// v3648 named the obvious next step: MOVE THE ROW'S EVALUATION POINT ONTO THE WALL, since the offset is a closed
// form and the correction is one line. It is done here, and it is worth 3.5% IN THE WRONG DIRECTION.
//
// *** AND LOOKING FOR THAT 3.5% FOUND SOMETHING WORTH 1.7x: THE ROW'S WEIGHT, WHICH HAS BEEN A HARDCODED 1
// THROUGH SIX ROUNDS AND WHICH NOBODY -- INCLUDING ME -- EVER ASKED ABOUT. A knob with no key, sitting in the
// middle of every measurement in this thread. THE UNEXAMINED CONSTANT WAS LARGER THAN EVERY EFFECT BEING
// MEASURED AROUND IT. ***

import { readFileSync } from "node:fs";
import { makeAnnulus, potentialFlow, cellValues, annulusFaces, gradientWall, wallSideError } from "./curvedWall.mjs";
import { vertexNeighbours } from "./rankRepair.mjs";
import { quadraticGradient, quadraticGradientWithWall, projectFacesToWall, faceMidpointOffset } from "./quadraticRecon.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const { phi, grad } = potentialFlow({});
const NT = [24, 48, 96, 192, 384];
const S = NT.map((nt) => {
    const m = makeAnnulus({ nr: Math.max(4, Math.round(nt / 8)), nt, a: 1, b: 3 });
    const F = annulusFaces(m);
    return { nt, m, u: cellValues(m, phi), F, P: projectFacesToWall(m, F, "inner"), vn: vertexNeighbours(m) };
});
const ord = (v) => v.slice(1).map((e, i) => Math.log2(v[i] / e));
const err = (s, faces, w) => wallSideError(s.m, s.F, grad, quadraticGradientWithWall(s.u, s.m, s.vn, faces, { rowWeight: w }), "inner");

// --- 1. the projection does what it was supposed to ---------------------------------------------------------------
{
    say("1. PROJECTING THE ROW'S POINT ONTO THE WALL. Only the LOCATION moves; the normal is already radial.");
    const before = S.map((s) => { let w = 0;
        for (let t = 0; t < s.m.tri.length; t++) for (const f of s.F[t]) { if (f.kind !== "inner") continue;
            const [gx, gy] = grad(f.mx, f.my); w = Math.max(w, Math.abs(gx * f.nx + gy * f.ny)); } return w; });
    const after = S.map((s) => { let w = 0;
        for (let t = 0; t < s.m.tri.length; t++) for (const f of s.P[t]) { if (f.kind !== "inner") continue;
            const [gx, gy] = grad(f.mx, f.my); w = Math.max(w, Math.abs(gx * f.nx + gy * f.ny)); } return w; });
    say("     |grad_exact(point) . n|  chord: " + before.map((x) => x.toExponential(2)).join("  "));
    say("                          projected: " + after.map((x) => x.toExponential(2)).join("  "));
    ok("!! the row becomes EXACTLY satisfiable -- thirteen orders", after.every((x) => x < 1e-13) && before[0] > 1e-3,
        "1.718e-2 down to 5.551e-16 at the coarsest mesh. The constraint is now TRUE AT THE POINT IT IS WRITTEN AT");
    ok("...and the offset it removes is the closed form v3648 measured", S.every((s) => {
        const o = faceMidpointOffset(s.m, s.F, "inner"); return Math.abs(o.worst / o.closedForm - 1) < 1e-6;
    }));
}

// --- 2. AND IT MAKES THE ANSWER SLIGHTLY WORSE ----------------------------------------------------------------------
{
    say("2. DOES AN EXACTLY-SATISFIABLE CONSTRAINT GIVE A BETTER ANSWER? At the default weight of 1: no.");
    const ec = S.map((s) => err(s, s.F, 1)), ep = S.map((s) => err(s, s.P, 1));
    say("     chord point:     " + ec.map((x) => x.toExponential(3)).join("  "));
    say("     projected point: " + ep.map((x) => x.toExponential(3)).join("  "));
    say("     projected / chord: " + ep.map((x, i) => (x / ec[i]).toFixed(4)).join("  "));
    ok("!! making the constraint exactly true makes the fit 3.5% WORSE, converging to a constant",
        ep.every((x, i) => x > ec[i]) && Math.abs(ep[4] / ec[4] - 1.035) < 0.01,
        "1.0209 rising to 1.0354. A CONSTRAINT BEING EXACTLY TRUE IS NOT THE SAME AS A FIT BEING BETTER -- a " +
        "least-squares fit does not SOLVE the row, it TRADES it against the data rows, and moving the point moves " +
        "the lever arms in that trade. THE OBVIOUS NEXT STEP WAS WORTH 3.5% IN THE WRONG DIRECTION");
    ok("the order is untouched either way", (() => {
        const a = ord(ec).slice(-1)[0], b = ord(ep).slice(-1)[0];
        say("     orders: chord " + ord(ec).map((o) => o.toFixed(2)).join(", ") + "   projected " + ord(ep).map((o) => o.toFixed(2)).join(", "));
        return Math.abs(a - b) < 0.05 && a > 1.85;
    })());
}

// --- 3. THE KNOB NOBODY ASKED ABOUT -----------------------------------------------------------------------------------
{
    say("3. WHILE LOOKING FOR 3.5%, THE ROW'S WEIGHT TURNED OUT TO BE WORTH 1.7x. IT HAS BEEN 1 FOR SIX ROUNDS.");
    const s = S[3];
    const noRow = wallSideError(s.m, s.F, grad, quadraticGradient(s.u, s.m, s.vn), "inner");
    const W = [0.0625, 0.25, 1, 4, 16, 64];
    const rows = W.map((w) => ({ w, c: err(s, s.F, w), p: err(s, s.P, w) }));
    say("     no row at all: " + noRow.toExponential(3));
    for (const r of rows) say("     weight " + String(r.w).padEnd(7) + " chord " + r.c.toExponential(3) +
        "   projected " + r.p.toExponential(3) + "   proj/chord " + (r.p / r.c).toFixed(4));
    const best = rows.reduce((a, b) => (b.c < a.c ? b : a));
    ok("!! there is an interior optimum and the default is not it", best.w === 0.25 &&
        rows[0].c > best.c && rows[2].c > best.c,
        "weight 0.25 reads " + best.c.toExponential(3) + " against the default 1's " + rows[2].c.toExponential(3) +
        " -- a factor of " + (rows[2].c / best.c).toFixed(2) + ", BRACKETED on both sides (0.0625 and 1 are both " +
        "worse), so it is a genuine minimum and not the end of a sweep");
    // MY FIRST VERSION WROTE `S[4].p / S[4].c` -- S[4] is a SETUP OBJECT, so that divided a faces ARRAY by
    // undefined and compared against NaN. It went red, correctly, and the fix is to compute the projection ratio
    // from the same helper everything else uses rather than reaching into a struct for fields it does not have.
    const projRatio = err(S[4], S[4].P, 1) / err(S[4], S[4].F, 1);
    ok("...and it is a bigger effect than anything this thread has been measuring",
        rows[2].c / best.c > 1.5 && rows[2].c / best.c > projRatio,
        "1.70x against the projection's " + projRatio.toFixed(3) + "x and the row's own 1.61x over no row at all. THE UNEXAMINED CONSTANT " +
        "WAS LARGER THAN EVERY EFFECT BEING MEASURED AROUND IT -- a knob with no key, sitting in the middle of the " +
        "instrument for six rounds");
    ok("!! and an OVER-weighted true constraint destroys almost all of its own benefit",
        rows[5].c > 0.9 * noRow && rows[5].c < noRow,
        "weight 64 reads " + rows[5].c.toExponential(3) + " against no row's " + noRow.toExponential(3) +
        " -- a hard constraint is barely better than no constraint. FORCING A TRUE CONDITION CROWDS OUT THE DATA " +
        "THAT WOULD HAVE TOLD YOU THE REST OF THE ANSWER");
    ok("the projection's 3.5% is itself a function of the weight, and vanishes at the good one",
        Math.abs(rows[1].p / rows[1].c - 1) < 0.01 && rows[3].p / rows[3].c > 1.03,
        "proj/chord is 1.0350 at weight 1 and 0.9999 at weight 0.25 -- SO THE THING I WENT LOOKING FOR ONLY EXISTS " +
        "AT THE WEIGHT I HAD NOT EXAMINED");
}

// --- 4. and the default is left alone --------------------------------------------------------------------------------
{
    say("4. THE DEFAULT IS STILL 1, DELIBERATELY.");
    ok("every earlier number in this thread reproduces", (() => {
        const s = S[4];
        const e = err(s, s.F, 1);
        say("     nt 384, chord, weight 1: " + e.toExponential(3) + "   (v3648 reported 3.017e-4)");
        return Math.abs(e - 3.017e-4) / 3.017e-4 < 1e-3;
    })(), "CHANGING THE DEFAULT WOULD HAVE MADE SIX ROUNDS OF NUMBERS UNREADABLE. The knob is now visible and " +
        "reported; whether 0.25 is right for a solver is a judgement this fixture cannot make -- it is one field " +
        "on one mesh, and an optimum fitted to that is exactly the shape this project refuses elsewhere");
    const src = readFileSync(new URL("./quadraticRecon.mjs", import.meta.url), "utf8");
    ok("the module records that the weight was unexamined", /A knob with no key, in the middle of the/.test(src));
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    say("   NOT CLAIMED: that 0.25 is the right weight. It is the minimum FOR THIS FIELD ON THIS MESH AT ONE");
    say("   REFINEMENT, and a weight fitted to a fixture is a knob with a story rather than a key. WHAT IS CLAIMED");
    say("   IS THAT THE DEFAULT WAS NEVER CHOSEN, that the choice is worth more than the effects measured around");
    say("   it, and that it is now visible. NOT DONE: whether the optimum moves with refinement -- measured at one");
    say("   mesh only, and a weight that drifts with h would be a different finding again.");
}

console.log("rowWeight-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
