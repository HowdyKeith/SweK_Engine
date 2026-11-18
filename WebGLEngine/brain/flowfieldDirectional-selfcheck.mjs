// WebGLEngine/brain/flowfieldDirectional-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/flowfieldDirectional-selfcheck.mjs      (a few seconds)
//
// THE GATE OF brain/flowfieldDirectional.mjs (NAV_PLUS ITEM 2 PART 2, registered first):
//   1 THE STEP      stepCost: still water costs `cell`; with the current, against it, across it by the closed forms (to the 1/1024 quantum); impassable when the cross component reaches V or
//                   the ground speed falls to G_MIN.
//   2 KNOWN ANSWERS on an empty grid the dist of k cells up-current, down-current and across is k steps of the closed form: THE VESSEL TRAVELS FROM THE NEIGHBOUR TOWARD THE SETTLED CELL.
//   3 STILL WATER   on 40 nav fields (seeds 1 to 10 of four hard kinds) the field is the shared solver's bit for bit (dist, fx, fz).
//   4 TERMINATION   pops never exceed the cell count, with a current whose costs are not whole numbers.
//   5 REFUSALS      V <= 0; a blocked mask of the wrong size.
// SABOTAGE LOG (each broken in brain/flowfieldDirectional.mjs, run, restored; red = failing rows):
//   S1 one step direction flipped (the vessel priced as travelling away from the settled cell) 4 | S2b the float64 test against float32 dist, with no settled flag (the review's bug) 4
//   S2a the settled flag alone removed: 0 red at first (the row bounded pops by ALL cells, not the cells reached); the row tightened to pops = cells reached; then 1
//   S3 the 1/1024 quantum removed 4 | S4 the cross-component guard loosened (perp > V + 1): 0 red, AN EQUIVALENT MUTANT -- past V the square root is NaN and the G_MIN guard returns Infinity
//   S5 the G_MIN guard removed 1 | S6 the current read at the settled cell's centre, not the midpoint 1 (the midpoint row was added before the pass, for this) | S7 free-to-blocked edges passable 1
//   S8 the flow rule takes ties (<=) 1
"use strict";
import * as D from "./flowfieldDirectional.mjs";
import * as H from "./subHardNav.mjs";
import * as P from "./subNavPlus.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const q = (v) => Math.round(v * 1024) / 1024;
console.log("flowfieldDirectional-selfcheck -- a route solver whose cost is time in a current\n");

sec("1. THE STEP");
{
    ok("!! still water costs exactly the cell, whatever the direction", D.stepCost(5, 1, 0, 0, 0, 3) === 5 && D.stepCost(5, 0, -1, 0, 0, 3) === 5);
    ok("!! with a 1.2 m/s current along the step: 5 x 3 / 4.2; against it: 5 x 3 / 1.8; across it: 5 x 3 / sqrt(9 - 1.44), each to the 1/1024 quantum", D.stepCost(5, 1, 0, 1.2, 0, 3) === q(15 / 4.2) && D.stepCost(5, -1, 0, 1.2, 0, 3) === q(15 / 1.8) && D.stepCost(5, 0, 1, 1.2, 0, 3) === q(15 / Math.sqrt(9 - 1.44)));
    ok("!! impassable when the cross component reaches V (3 m/s across a 3 m/s vessel) or the ground speed is at most 0.05 m/s (2.96 m/s against)", D.stepCost(5, 0, 1, 3, 0, 3) === Infinity && D.stepCost(5, -1, 0, 2.96, 0, 3) === Infinity && D.stepCost(5, -1, 0, 2.9, 0, 3) < Infinity);
    ok("  every cost is a whole number of 1/1024", [[1, 0, 0.37, -0.21], [0, 1, -1.1, 0.4], [-1, 0, 0.9, 0.9]].every(([dx, dy, cx, cy]) => { const k = D.stepCost(5, dx, dy, cx, cy, 3); return Number.isInteger(k * 1024); }));
}

sec("2. KNOWN ANSWERS (an empty grid, 21 x 21, the goal in the middle)");
{
    const g = { w: 21, h: 21, cell: 5, x0: 0, y0: 0 }, free = new Uint8Array(441), goal = [{ gx: 10, gy: 10 }], at = (i, j) => i + j * 21;
    const rx = D.solveDirectional(g, free, goal, { currentAt: () => [1.2, 0], V: 3 }), ry = D.solveDirectional(g, free, goal, { currentAt: () => [0, 1.2], V: 3 }), k = 6;
    const up = rx.dist[at(10 - k, 10)], down = rx.dist[at(10 + k, 10)], across = rx.dist[at(10, 10 + k)];
    ok("!! with c = +1.2 along x: the cell 6 to the -x side (the vessel runs WITH the current to the goal) is 6 x 5 x 3 / 4.2; 6 to the +x side (AGAINST it) 6 x 5 x 3 / 1.8; 6 across, 6 x 5 x 3 / sqrt(7.56)", up === Math.fround(6 * q(15 / 4.2)) && down === Math.fround(6 * q(15 / 1.8)) && across === Math.fround(6 * q(15 / Math.sqrt(7.56))), `${up.toFixed(3)} / ${down.toFixed(3)} / ${across.toFixed(3)}`);
    ok("!! with c = +1.2 along y the same answers turn with it: -y is with the current, +y against", ry.dist[at(10, 10 - k)] === up && ry.dist[at(10, 10 + k)] === down && ry.dist[at(10 + k, 10)] === across);
    const rm = D.solveDirectional(g, free, goal, { currentAt: () => [-1.2, 0], V: 3 });
    const half = D.solveDirectional({ w: 2, h: 1, cell: 5, x0: 0, y0: 0 }, new Uint8Array(2), [{ gx: 1, gy: 0 }], { currentAt: (x) => (x === 5 ? [1.2, 0] : [0, 0]), V: 3 });
    ok("!! the step's current is read at the MIDPOINT of the two cell centres (x 5 between 2.5 and 7.5), not at either centre", half.dist[0] === Math.fround(q(15 / 4.2)), `${half.dist[0]}`);
    ok("  reversing the current mirrors the field", rm.dist[at(10 + k, 10)] === up && rm.dist[at(10 - k, 10)] === down);
}

sec("3. STILL WATER IS THE SHARED SOLVER, bit for bit");
{
    let n = 0, bad = 0;
    for (const kind of ["hard-current", "hard-current-gap", "hard-islands", "hard-gaps"]) for (let s = 1; s <= 10; s++) {
        const sc = P.plusScenario(s, kind), f = H.buildLadderField(H.planShapes(sc, 0), sc.goal, sc.start), r = D.solveDirectional(f, f.blocked, [f.goalCell]); n++;
        for (let i = 0; i < f.dist.length; i++) if (!Object.is(r.dist[i], f.dist[i]) || !Object.is(r.fx[i], f.fx[i]) || !Object.is(r.fz[i], f.fz[i])) { bad++; break; }
    }
    ok("!! with no current, dist, fx and fz equal brain/flowfieldCpu.js's on 40 nav fields (seeds 1 to 10 of four kinds)", n === 40 && bad === 0, `${bad} of ${n} differ`);
}

sec("4. TERMINATION");
{
    const sc = P.plusScenario(3, "hard-current"), f = H.buildLadderField(H.planShapes(sc, 0), sc.goal, sc.start), cells = f.w * f.h;
    const r = D.solveDirectional(f, f.blocked, [f.goalCell], { currentAt: (x, y) => [0.3 + 0.001 * x, 0.2 - 0.002 * y], V: 3 });
    const reached = r.dist.reduce((m, v) => m + (v < D.BIG ? 1 : 0), 0);
    ok("!! with a current whose costs are not whole numbers, each REACHED cell is expanded exactly once (pops = the cells reached) and the start is reached", r.pops === reached && r.pops <= cells && r.dist[Math.floor((sc.start.y - f.y0) / 5) * f.w + Math.floor((sc.start.x - f.x0) / 5)] < D.BIG, `${r.pops} pops, ${reached} cells reached of ${cells}`);
}

sec("5. REFUSALS");
ok("!! V <= 0 and a blocked mask of the wrong size are refused by name", /V must be a speed above 0/.test(thr(() => D.solveDirectional({ w: 2, h: 2, cell: 5, x0: 0, y0: 0 }, new Uint8Array(4), [{ gx: 0, gy: 0 }], { V: 0 }))) && /blocked must have 4 cells/.test(thr(() => D.solveDirectional({ w: 2, h: 2, cell: 5, x0: 0, y0: 0 }, new Uint8Array(3), [{ gx: 0, gy: 0 }]))));

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exitCode = fails ? 1 : 0;
