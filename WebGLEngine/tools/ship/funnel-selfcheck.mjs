#!/usr/bin/env node
// WebGLEngine/tools/ship/funnel-selfcheck.mjs -- v4254
//
// Run: node tools/ship/funnel-selfcheck.mjs
//
// *** THE TREE'S ONLY PATHFINDER IS 8.24% LONGER THAN A STRAIGHT LINE, AND STRING-PULLING IT DOES NOT HELP
// *** AS MUCH AS IT LOOKS -- ON A TIGHT COURSE IT MAKES THINGS WORSE. Both halves are measured below.
//
// worker/botPathfinder.worker.js has been the tree's navigation since round 216 and NOTHING HAS EVER GATED
// IT. tools/ship has requestPathSync-selfcheck and winPathGuard-selfcheck; neither is about paths through a
// world. This gate drives the REAL worker -- shimming `self` and calling its own onmessage, not a
// reimplementation -- so every number below is the shipped code's.
"use strict";
import * as F from "../../nav/funnel.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

globalThis.self = { onmessage: null, postMessage: (m) => { globalThis.__out = m; } };
await import("../../worker/botPathfinder.worker.js");

const N = 512, G = 4;
const flat = () => new Float32Array(N * N);
const plan = (hm, sx, sz, gx, gz) => {
    globalThis.self.onmessage({ data: { cmd: "plan", id: 1, sx, sz, gx, gz, hm, hmStride: N,
        hmOriginX: 0, hmOriginZ: 0, gridSize: G, waterLevel: null, maxStepUp: 3, maxStepDown: 6,
        maxSearch: 500000, slopePenalty: 0.35 } });
    return globalThis.__out;
};

console.log("funnel-selfcheck -- the staircase, the closed form for it, and what string-pulling really costs\n");

// =============================================================================================================
console.log("1. *** THE CLOSED FORM: an 8-neighbour grid's excess is sqrt(4 - 2*sqrt(2)), not an opinion ***");
{
    const hm = flat(); const rows = []; let worst = 0, maxR = 0, maxAt = 0;
    for (const d of [0, 10, 15, 20, 22.5, 25, 30, 40, 45]) {
        const th = d * Math.PI / 180, R = 200;
        const gx = Math.round(R * Math.cos(th) / G) * G, gz = Math.round(R * Math.sin(th) / G) * G;
        const o = plan(hm, 0, 0, gx, gz);
        const D = Math.hypot(gx, gz), meas = F.pathLength(o.path) / D;
        const pred = F.octileRatio(Math.atan2(gz, gx));
        worst = Math.max(worst, Math.abs(meas - pred));
        if (meas > maxR) { maxR = meas; maxAt = d; }
        if ([0, 22.5, 45].includes(d)) rows.push(d + "deg " + meas.toFixed(6));
    }
    ok("!! *** THE REAL SHIPPED A* MATCHES cos(t) + (sqrt2-1)*sin(t) AT EVERY ANGLE, TO " + worst.toExponential(1) + " ***",
        worst < 1e-12,
        "nine directions, worst |measured - closed form| " + worst.toExponential(2) + ". " + rows.join(", ") +
        ". This is not a fit: the octile length of a step is (dx - dz) + sqrt(2)*dz by construction, so the " +
        "ratio is a*cos + b*sin and its maximum is sqrt(a^2 + b^2) outright.");
    ok("!! ...and the worst case lands at 22.5 degrees, measured " + maxR.toFixed(6) + " against sqrt(4-2*sqrt2) = " +
       F.OCTILE_WORST.toFixed(6),
        Math.abs(maxR - F.OCTILE_WORST) < 1e-6 && maxAt === 22.5,
        "the direction exactly between an axis and a diagonal is the one eight neighbours can least express. " +
        "*** AND THE CONTROL IS IN THE SAME SWEEP: *** 0 and 45 degrees measure EXACTLY 1.000000, because " +
        "those are the two directions the grid CAN express, so the excess is the grid rather than the solver.");
}

// =============================================================================================================
console.log("\n2. *** WHY A FUNNEL OVER A GRID PATH IS PROVABLY USELESS UNTIL A DIAGONAL IS EXPANDED ***");
{
    const p = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 8, z: 4 }, { x: 12, z: 4 }];
    const naive = F.corridorFromPath(p, G);
    const widths = naive.slice(1, -1).map((q) => Math.hypot(q.left.x - q.right.x, q.left.z - q.right.z));
    ok("!! a corridor straight from an 8-connected path is PINCHED TO ZERO WIDTH at every diagonal step",
        Math.min(...widths) === 0,
        "portal widths " + widths.map((w) => w.toFixed(2)).join(", ") + " on a four-cell path with one " +
        "diagonal. Two cells joined diagonally share exactly one CORNER. *** A ZERO-WIDTH PORTAL PINS THE " +
        "PATH TO A POINT, *** so the taut path through such a corridor IS the staircase and no funnel can " +
        "recover anything. That is a proof, not a tuning problem.");
    const ex = F.expandDiagonals(p, G);
    const fixed = F.corridorFromPath(ex, G);
    const w2 = fixed.slice(1, -1).map((q) => Math.hypot(q.left.x - q.right.x, q.left.z - q.right.z));
    ok("!! ...and routing each diagonal through an orthogonal neighbour gives the corridor width everywhere",
        Math.min(...w2) === G,
        "minimum portal width " + Math.min(...w2).toFixed(2) + " after expansion, from " + p.length +
        " points to " + ex.length + ". Only now is there anything for a funnel to pull against.");
}

// =============================================================================================================
console.log("\n3. open ground: the funnel recovers most of the excess, and stays in its corridor");
{
    const hm = flat(); const rows = []; let worstMissed = 0, minRecovered = 1;
    for (const d of [10, 15, 22.5, 30, 40]) {
        const th = d * Math.PI / 180, R = 200;
        const gx = Math.round(R * Math.cos(th) / G) * G, gz = Math.round(R * Math.sin(th) / G) * G;
        const o = plan(hm, 0, 0, gx, gz), D = Math.hypot(gx, gz);
        const port = F.corridorFromPath(F.expandDiagonals(o.path, G), G), pulled = F.funnel(port);
        const gr = F.pathLength(o.path) / D, fu = F.pathLength(pulled) / D;
        const rec = (gr - fu) / (gr - 1);
        minRecovered = Math.min(minRecovered, rec);
        worstMissed = Math.max(worstMissed, F.crossesAllPortals(pulled, port).missed);
        rows.push(d + "deg " + gr.toFixed(4) + "->" + fu.toFixed(4) + " (" + (100 * rec).toFixed(0) + "%, " +
                  o.path.length + "->" + pulled.length + " corners)");
    }
    ok("!! it recovers " + (100 * minRecovered).toFixed(0) + "% or more of the octile excess",
        minRecovered > 0.3, rows.join("; "));
    ok("!! *** AND CROSSES EVERY PORTAL IN ITS CORRIDOR -- " + worstMissed + " MISSED ***",
        worstMissed === 0,
        "*** THIS IS THE CHECK THAT CAUGHT MY OWN FUNNEL CHEATING. *** A 'funnel' that ignored its input and " +
        "returned the straight line scores 1.000000 on every length test ever written and walks characters " +
        "through walls. The first draft did exactly that -- ratio 1.000000 while missing 46 of 49 portals -- " +
        "and only membership in the corridor told the difference between a perfect result and a useless one.");
    report("it does NOT recover 100%, and that is correct rather than a shortfall: the funnel returns the " +
           "shortest path THROUGH THE CORRIDOR, and the corridor is a staircase band of cells. Getting the " +
           "whole 8.24% back needs a navmesh of convex polygons, which is a different structure and a " +
           "different round.");
}

// =============================================================================================================
console.log("\n4. *** THE OBSTACLE, WHERE THE ANSWER REVERSES ***");
{
    const hm = flat();
    for (let z = 0; z < N; z++) if (z < 40 || z > 60) for (let x = 96; x <= 104; x++) hm[z * N + x] = 999;
    const blocked = (x, z) => {
        const lx = Math.round(x), lz = Math.round(z);
        if (lx < 0 || lz < 0 || lx >= N || lz >= N) return true;
        return hm[lz * N + lx] > 500;
    };
    const clip = (pts) => {
        let bad = 0, tot = 0;
        for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(2, Math.ceil(L / 0.5));
            for (let k = 0; k <= n; k++) { const t = k / n; tot++; if (blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) bad++; }
        }
        return { bad, tot };
    };
    const o = plan(hm, 40, 190, 160, 190);
    const base = F.corridorFromPath(F.expandDiagonals(o.path, G, (x, z) => !blocked(x, z)), G);
    const stair = clip(o.path), stairLen = F.pathLength(o.path);
    ok("!! the straight line is genuinely blocked, so the solver has to go round",
        o.found && stairLen > 2.5 * 120, "straight line 120.00 m is through a wall; the staircase is " +
        stairLen.toFixed(2) + " m via the only gap");
    ok("!! *** THE STAIRCASE NEVER ENTERS A WALL: " + stair.bad + " of " + stair.tot + " samples ***",
        stair.bad === 0, "walking centre to centre keeps it clear of every edge");

    const raw = F.funnel(base), rawClip = clip(raw);
    ok("!! *** ...AND THE FUNNELLED PATH THROUGH THE SAME CORRIDOR ENTERS ONE AT " + rawClip.bad + " OF " +
       rawClip.tot + " ***",
        rawClip.bad > 0,
        "shorter (" + F.pathLength(raw).toFixed(2) + " vs " + stairLen.toFixed(2) + ") and CLIPPING GEOMETRY. " +
        "Neither the solver nor the corridor builder is wrong: *** A* TESTS ONLY A CELL'S CENTRE, *** so all " +
        "it ever promises is that its centre-line is walkable, and the corridor of full cells around that " +
        "line is not guaranteed clear because the heightmap is finer than the grid. The staircase was safe " +
        "by luck of construction. Pulling the string taut cashes that luck in.");

    const rows = []; let safeAt = null, safeLen = 0;
    for (const r of [0.5, 1.0, 1.5, 1.9]) {
        const pulled = F.funnel(F.insetPortals(base, r));
        const c = clip(pulled), L = F.pathLength(pulled);
        rows.push("r=" + r + " len " + L.toFixed(2) + " inWall " + c.bad + "/" + c.tot);
        if (c.bad === 0 && safeAt === null) { safeAt = r; safeLen = L; }
    }
    ok("!! *** AND ONCE IT IS INSET ENOUGH TO BE AS SAFE AS THE STAIRCASE, IT IS LONGER THAN THE STAIRCASE ***",
        safeAt !== null && safeLen > stairLen,
        rows.join("; ") + ". Clear of the wall first at r=" + safeAt + ", at " + safeLen.toFixed(2) +
        " m against the staircase's " + stairLen.toFixed(2) + " m. *** SO THE WHOLE SAVING WAS THE SAFETY " +
        "MARGIN, AND GIVING IT BACK COSTS SLIGHTLY MORE THAN IT SAVED. *** The honest verdict for this tree " +
        "is therefore split rather than favourable: string-pulling is a real gain on open ground and a net " +
        "LOSS in tight geometry, and a round that had only measured the open floor would have reported a " +
        "flat improvement and shipped characters that clip walls near doorways.");
}

// =============================================================================================================
console.log("\n5. the bug a straight corridor could not have found");
{
    const P = (lx, lz, rx, rz) => ({ left: { x: lx, z: lz }, right: { x: rx, z: rz } });
    const straight = [P(0, 0, 0, 0), P(4, 2, 4, -2), P(8, 2, 8, -2), P(12, 2, 12, -2), P(16, 0, 16, 0)];
    const flip = (c) => c.map((q) => ({ left: q.right, right: q.left }));
    const a = F.funnel(straight), b = F.funnel(flip(straight));
    ok("!! a STRAIGHT corridor gives the same two points under BOTH left/right orientations",
        a.length === 2 && b.length === 2,
        "which is why the open-floor sweep could never have caught an inverted portal orientation: a taut " +
        "path with no corner has no corner to put on the wrong side");
    const L = [P(0, 0, 0, 0), P(2, 2, 2, -2), P(6, 2, 6, -2), P(10, 2, 10, -2), P(10, 6, 6, 6), P(8, 12, 8, 12)];
    const la = F.funnel(L), lb = F.funnel(flip(L));
    ok("!! *** AND AN L-SHAPED ONE SEPARATES THEM: " + la.length + " points one way, " + lb.length + " the other ***",
        la.length !== lb.length,
        "the wrong orientation zigzags across the corridor instead of cutting the inside corner. My first " +
        "draft had the sign inverted and every open-ground number looked plausible. *** A TEST THAT PASSES " +
        "UNDER BOTH HYPOTHESES DISTINGUISHES NOTHING, *** which is the same lesson as v4236's vertex stage " +
        "and v4243's constant texture in a fifth shape.");
}

// =============================================================================================================
// ---- v4254 SABOTAGES, grep-CONFIRMED APPLIED BEFORE READING, RESTORED md5-IDENTICAL ------------------------
//
// (nav/funnel.mjs md5 ec91ff67ebc0cbe617316ca107ce8fc2 before and after all four.)
//
//   A  THE CHEAT: funnel ignores its corridor and returns [start, end]. -> 3 RED, led by 63 missed portals.
//      This is the defect the first draft actually had, shipped here as a sabotage so the check that caught
//      it stays load-bearing.
//
//   B  expandDiagonals returns its input, so the corridor is pinched at every diagonal again. -> 2 RED.
//
//   C  the left/right orientation is inverted. -> 2 RED, and *** LOOK AT WHICH WAY IT FAILED: *** the length
//      check reported 1.0584 -> 1.0000, a PERFECT 100% of the excess recovered, better than the correct
//      code's 63%. It scored perfectly by leaving the corridor, and 63 missed portals is the only thing that
//      said so. A gate that measured length alone would have ranked the broken version ABOVE the working one
//      and the number would have looked like a triumph.
//
//   D  insetPortals returns its input. -> 1 RED, the safety trade in section 4, which is the only check that
//      buys the margin back and therefore the only one that can notice it is unbuyable.
//
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a NAVMESH. Everything above pulls a string through a corridor of grid cells, " +
    "which is why it can only recover part of the excess and why the inset is needed at all -- a real " +
    "navmesh of convex polygons carries its own clearance and has no staircase to undo. Also unchecked: " +
    "whether any of this is WIRED. simulation/BotPathfinderPool.js still receives the staircase and nothing " +
    "calls nav/funnel.mjs, so no bot in this tree walks a shorter path today; given section 4, wiring it " +
    "without an inset would be a regression rather than an improvement.");
process.exit(fails ? 1 : 0);
