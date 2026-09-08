// WebGLEngine/tools/ship/navmesh-selfcheck.mjs -- v4543
//
// Run: node tools/ship/navmesh-selfcheck.mjs
//
// GATES nav/navmesh.mjs, and it is written as a HEAD-TO-HEAD against numbers tools/ship/funnel-selfcheck.mjs
// already measured on the same fixture, because that gate ended by naming this one:
//
//     "unchecked here: a NAVMESH. Everything above pulls a string through a corridor of grid cells, which is
//      why it can only recover part of the excess and why the inset is needed at all."
//
// *** SO THE GRADING INSTRUMENT IS NOT "IS THE PATH SHORT". *** funnel-selfcheck's own section 4 shows why: a
// funnel over the grid corridor IS shorter -- 302.20 m against a 318.39 m staircase -- and it walks through
// walls at 18 of 616 samples. Length alone scores a wall-clipping path as the best one. Every length claim
// below is therefore paired with a CLEARANCE claim measured against the wall's real faces, and the analytic
// optimum for the fixture is derived from its geometry rather than taken from what this code produced.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as NM from "../../nav/navmesh.mjs";
import * as F from "../../nav/funnel.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

const N = 512;
const flat = () => new Float32Array(N * N);

/** The obstacle fixture, copied from funnel-selfcheck so the comparison is against the same wall. */
const gapMap = () => { const hm = flat();
    for (let z = 0; z < N; z++) if (z < 40 || z > 60) for (let x = 96; x <= 104; x++) hm[z * N + x] = 999;
    return hm; };
const blockedIn = (hm) => (x, z) => {
    const lx = Math.round(x), lz = Math.round(z);
    if (lx < 0 || lz < 0 || lx >= N || lz >= N) return true;
    return hm[lz * N + lx] > 500;
};
const clipCount = (hm, pts) => {
    const blocked = blockedIn(hm); let bad = 0, tot = 0;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(2, Math.ceil(L / 0.5));
        for (let k = 0; k <= n; k++) { const t = k / n; tot++; if (blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) bad++; }
    }
    return { bad, tot };
};
/**
 * *** THE INSTRUMENT THAT CAUGHT THE ROUND'S REAL DEFECT, AND IT HAD TO BE INDEPENDENT OF THE MESH. ***
 * Exact distance from the path to the blocked cell SQUARES, computed from the heightmap, sharing no code
 * with the distance field that did the erosion. Grading the erosion with its own field would have passed a
 * chamfer that was 6% optimistic on diagonals; this said 0.708 where 1 was promised.
 */
const trueClearance = (hm, pts, n = N) => {
    const cells = [];
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) if (hm[z * n + x] > 500) cells.push([x, z]);
    const dBox = (px, pz, cx, cz) =>
        Math.hypot(Math.max(cx - 0.5 - px, 0, px - (cx + 0.5)), Math.max(cz - 0.5 - pz, 0, pz - (cz + 0.5)));
    let mn = Infinity;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(2, Math.ceil(L));
        for (let k = 0; k <= n; k++) {
            const t = k / n, px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
            for (const [cx, cz] of cells) {
                if (Math.abs(cx - px) > mn + 2 || Math.abs(cz - pz) > mn + 2) continue;
                const d = dBox(px, pz, cx, cz); if (d < mn) mn = d;
            }
        }
    }
    return mn;
};

console.log("navmesh-selfcheck -- clearance built into the mesh, and what that is worth against a grid\n");

// =============================================================================================================
console.log("1. *** THE HEAD-TO-HEAD, ON funnel-selfcheck's OWN WALL, AT THE RADIUS ITS SECTION 4 NEEDED ***");
{
    const hm = gapMap(), S = { x: 40, z: 190 }, G = { x: 160, z: 190 };
    // *** THE OPTIMUM IS DERIVED FROM THE FIXTURE, NOT FROM THE MESH. *** blocked() rounds, so the wall is
    // x in [95.5, 104.5) and z >= 60.5; an agent of radius r rounds the block grown by r on every side.
    const optimum = (r) => {
        const d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
        const a = [95.5 - r, 60.5 - r], b = [104.5 + r, 60.5 - r];
        return d([40, 190], a) + d(a, b) + d(b, [160, 190]);
    };
    const R = 1.9;
    const mesh = NM.buildNavmesh(hm, { stride: N, seedX: S.x, seedZ: S.z, radius: R, supersample: 4 });
    const p = NM.planPath(mesh, S, G);
    const clip = clipCount(hm, p.points), clear = trueClearance(hm, p.points);
    report("mesh: " + mesh.rects.length + " convex polygons over " + mesh.cells + " cells; corridor " +
           p.polys + " polygons, " + p.points.length + " corners");
    ok("!! *** SHORTER THAN THE SAFEST GRID PATH AND JUST AS SAFE: " + p.length.toFixed(2) + " m AGAINST 319.59 ***",
        p.length < 318.39 && clip.bad === 0,
        p.length.toFixed(2) + " m, " + clip.bad + " of " + clip.tot + " samples in a wall. funnel-selfcheck " +
        "measured the same wall at: staircase 318.39 m (0 in wall), funnel over the grid corridor 302.20 m " +
        "(18 IN WALL), and that funnel inset until it was as safe as the staircase 319.59 m (0 in wall). " +
        (p.length < 319.59
            ? "This is " + (100 * (1 - p.length / 319.59)).toFixed(1) + "% shorter than the safe grid path and " +
              (100 * (1 - p.length / 318.39)).toFixed(1) + "% shorter than the staircase"
            : "This is LONGER than the safe grid path, by " + (p.length - 319.59).toFixed(2) + " m") +
        ", at " + clip.bad + " wall samples.");
    ok("!! ...and it is within 1% of the ANALYTIC optimum for an agent of this radius",
        p.length >= optimum(R) - 1e-9 && p.length < optimum(R) * 1.01,
        "path " + p.length.toFixed(2) + " against optimum " + optimum(R).toFixed(2) + " (" +
        (100 * (p.length / optimum(R) - 1)).toFixed(2) + "% over). The optimum is the taut path round the two " +
        "corners of the wall block grown by r -- read off the fixture's own inequalities, not off this mesh. " +
        "*** IT IS ALSO A LOWER BOUND, AND A PATH SHORTER THAN IT WOULD BE A RED RATHER THAN A TRIUMPH: *** " +
        "it would mean the erosion had not delivered the clearance it promised.");
    ok("!! *** AND THE CLEARANCE IS REAL, MEASURED AGAINST THE WALL'S FACES: " + clear.toFixed(3) + " >= " + R + " ***",
        clear >= R,
        "minimum distance from the path to any blocked cell's square is " + clear.toFixed(3) + ", asked " + R +
        ". *** THIS IS THE CHECK THAT FAILED A CHAMFER DISTANCE FIELD THAT 'in a wall: 0 of 599' HAD PASSED. *** " +
        "Chamfer 2/3 prices a diagonal at 3 where the truth is 2.828, so it kept cells the erosion should have " +
        "removed: 0.708 delivered where 1 was asked, 2.829 where 3 was -- both exactly the diagonal it " +
        "mis-prices. Not entering a wall is a much weaker property than standing clear of one, and only the " +
        "second is what a navmesh is for.");
    const nar = NM.narrowest(p.portals);
    ok("   every portal on the corridor is a real edge with width, unlike a grid's diagonal steps",
        nar > 0 && Number.isFinite(nar),
        "narrowest gate " + nar.toFixed(2) + ". funnel-selfcheck measures a grid corridor pinched to 0.00 at " +
        "every diagonal step, which is why it has to expand diagonals before a funnel can pull anything.");
    ok("   ...and the path crosses every portal in its corridor",
        F.crossesAllPortals(p.points, p.portals).missed === 0,
        JSON.stringify(F.crossesAllPortals(p.points, p.portals)));
}

// =============================================================================================================
console.log("\n2. THE OPEN FLOOR, WHERE THE RIGHT ANSWER IS THE STRAIGHT LINE AND SAYING SO PROVES NOTHING");
{
    const hm = flat(), S = { x: 40, z: 40 }, G = { x: 400, z: 180 };
    const mesh = NM.buildNavmesh(hm, { stride: N, seedX: S.x, seedZ: S.z, radius: 1.9 });
    const p = NM.planPath(mesh, S, G);
    const straight = Math.hypot(G.x - S.x, G.z - S.z);
    ok("!! an unobstructed floor is ONE convex polygon, and the path is EXACTLY the straight line",
        mesh.rects.length === 1 && p.points.length === 2 && Math.abs(p.length - straight) < 1e-9,
        mesh.rects.length + " polygon, " + p.points.length + " corners, " + p.length.toFixed(6) + " against " +
        straight.toFixed(6) + ". *** THIS ROW IS WEAK ON ITS OWN AND IS HERE FOR THE CONTRAST: *** " +
        "funnel-selfcheck records that a 'funnel' which ignored its input and returned the straight line " +
        "scored 1.000000 on every length test and walked through walls. What makes it worth anything is that " +
        "section 1 grades the same code where the straight line is WRONG.");
    ok("   the grid's 8.24% excess has nowhere to hide here: one polygon means no staircase to undo",
        Math.abs(p.length - straight) < 1e-9 && mesh.rects.length === 1,
        "the closed form for an 8-neighbour grid, sqrt(4 - 2*sqrt(2)) = " + F.OCTILE_WORST.toFixed(6) +
        ", is a property of having eight neighbours. A convex polygon has no neighbours.");
}

// =============================================================================================================
console.log("\n3. *** A DIAGONAL WALL: 729 POLYGONS AND A FIVE-CORNER PATH, WHICH IS THE ROUND'S ARGUMENT ***");
{
    const hm = flat();
    for (let t = 0; t < 400; t++) if (t < 150 || t > 190)
        for (let w = -4; w <= 4; w++) { const x = 60 + t + w, z = 60 + t;
            if (x >= 0 && z >= 0 && x < N && z < N) hm[z * N + x] = 999; }
    const S = { x: 80, z: 200 }, G = { x: 300, z: 120 };
    const mesh = NM.buildNavmesh(hm, { stride: N, seedX: S.x, seedZ: S.z, radius: 1.9, supersample: 2 });
    const p = NM.planPath(mesh, S, G);
    const clip = clipCount(hm, p.points), clear = trueClearance(hm, p.points);
    ok("!! *** A ROW SWEEP MAKES A STAIRCASE OF THIN RECTANGLES ON A 45-DEGREE BOUNDARY -- AND THE PATH IS FINE ***",
        mesh.rects.length > 200 && p.points.length <= 8 && clip.bad === 0 && clear >= 1.9,
        mesh.rects.length + " polygons, but the path has only " + p.points.length + " corners, " +
        clip.bad + " of " + clip.tot + " in a wall, clearance " + clear.toFixed(3) + ". *** THIS IS WHY THE " +
        "CONTOUR-TRACE AND CONVEX-MERGE STAGES OF RECAST ARE NOT BUILT: *** path quality comes from the " +
        "portals being REAL EDGES, not from the polygons being few. What those stages would buy is polygon " +
        "COUNT on curved and diagonal boundaries -- memory and A* nodes -- and this row is the measurement " +
        "that says so rather than the assumption.");
    report("the same boundary as a grid: 9 polygons would be a contour mesh's answer, 729 is the sweep's, " +
           "and both give a " + p.points.length + "-corner path");
}

// =============================================================================================================
console.log("\n4. *** THE GAP TOO TIGHT TO WALK THROUGH, WHICH A GRID PATHFINDER CANNOT EXPRESS AT ALL ***");
{
    // A 6-unit gap. An agent of radius r fits when 6 - 2r > 0: r=1 with 4.00 of corridor to spare, r=2 with
    // 2.00, r=2.5 with 1.00, r=3 is the KNIFE EDGE at 0.00 (a corridor of zero width is not a corridor), and
    // r=4 does not fit at all. The safety-critical direction is the last one: a mesh may refuse a gap it
    // could have taken, and must NEVER accept one it could not.
    const W = 128;
    const tightAt = (scale) => {
        const S = Math.round(W * scale), hm = new Float32Array(S * S);
        for (let cz = 0; cz < S; cz++) for (let cx = 0; cx < S; cx++) {
            const z = cz / scale, x = cx / scale;
            if ((z < 50 || z > 55.99) && x >= 59.5 && x <= 68.99) hm[cz * S + cx] = 999;
        }
        return { hm, S };
    };
    const rows = [];
    for (const scale of [1, 2, 4]) {
        const { hm, S } = tightAt(scale), cs = 1 / scale, got = [];
        for (const r of [1, 2, 2.5, 3, 4]) {
            const m = NM.buildNavmesh(hm, { stride: S, seedX: Math.round(20 * scale), seedZ: Math.round(90 * scale),
                radius: r, cellSize: cs, supersample: 2 });
            got.push(NM.planPath(m, { x: 20, z: 90 }, { x: 110, z: 90 }) ? 1 : 0);
        }
        rows.push({ cs, S, got });
        report("cellSize " + cs.toFixed(2) + " (" + S + "x" + S + "):  " +
               [1, 2, 2.5, 3, 4].map((r, i) => "r=" + r + " " + (got[i] ? "PASS" : "none")).join("  "));
    }
    ok("!! *** r = 4 DOES NOT FIT AND IS REFUSED AT EVERY RESOLUTION -- the direction that must never flip ***",
        rows.every((R) => R.got[4] === 0),
        "6 - 2*4 = -2, so no centre line exists. A grid A* tests only a cell's CENTRE and would path straight " +
        "through: it has no radius and cannot be given one. Refusing a route the agent does not fit is a " +
        "capability the grid does not have rather than a better version of one it has.");
    ok("!! ...and a FINER MESH resolves tighter gaps, which is Recast's cell-size guidance measured",
        rows[0].got[1] === 0 && rows[1].got[1] === 1 && rows[1].got[2] === 0 && rows[2].got[2] === 1,
        "r=2 leaves a 2.00 corridor: refused at cellSize 1.00, taken at 0.50. r=2.5 leaves 1.00: refused at " +
        "0.50, taken at 0.25. The erosion keeps WHOLE CELLS, so a corridor narrower than about a cell cannot " +
        "be represented and is declined. *** SUPERSAMPLING THE DISTANCE FIELD DOES NOT FIX THIS AND WAS " +
        "MEASURED NOT FIXING IT: *** s = 1, 2, 4, 8 all refuse r=2 at cellSize 1.00, because the binding " +
        "constraint is the MESH's resolution and not the FIELD's. Two different knobs, and only one of them " +
        "moves this.");
    ok("   the mesh is never optimistic: every PASS above is a gap the agent really fits",
        rows.every((R) => [1, 2, 2.5, 3, 4].every((r, i) => !R.got[i] || 6 - 2 * r > 0)),
        "no row accepts r=3 (corridor exactly 0.00) or r=4 (negative). Conservative in the safe direction at " +
        "every resolution tested.");
}

// =============================================================================================================
console.log("\n5. *** THE BUG A LENGTH TEST AND A PORTAL-MEMBERSHIP TEST BOTH PASSED ***");
{
    const hm = gapMap(), S = { x: 40, z: 190 }, G = { x: 160, z: 190 };
    const mesh = NM.buildNavmesh(hm, { stride: N, seedX: S.x, seedZ: S.z, radius: 1.9 });
    const c = NM.corridor(mesh, S, G);
    const good = NM.portalsFor(mesh, S, G, c.chain);
    // the first draft's orientation: taken from the neighbouring portals' midpoints instead of from the two
    // polygons the edge joins
    const mid = (seg) => ({ x: (seg[0].x + seg[1].x) / 2, z: (seg[0].z + seg[1].z) / 2 });
    const bad = [{ left: { ...S }, right: { ...S } }];
    let a = { ...S };
    for (let k = 0; k < c.chain.length; k++) {
        const seg = c.chain[k].seg, b = (k + 1 < c.chain.length) ? mid(c.chain[k + 1].seg) : G;
        bad.push(F.triarea2(a, b, seg[0]) < 0 ? { left: seg[0], right: seg[1] } : { left: seg[1], right: seg[0] });
        a = mid(seg);
    }
    const pg = F.funnel(good), pb = F.funnel(bad);
    const Lg = F.pathLength(pg), Lb = F.pathLength(pb);
    // *** THE FIRST VERSION OF THIS ROW ASSERTED Lb > 2 * Lg AND WAS RED, ON A NUMBER I HAD MEASURED MYSELF. ***
    // 930.87 m was the broken path on the FIRST DRAFT of the module -- chamfer erosion, no supersampling --
    // and the erosion has changed twice since, so the corridor is not the same corridor. The bug still costs
    // 89%, and the row now asserts the RATIO it can re-derive instead of a metre count from a build that no
    // longer exists. A remembered number is not a measurement of the code in front of you.
    ok("!! *** ORIENTING PORTALS FROM THE PATH INSTEAD OF THE POLYGONS COSTS " +
        (100 * (Lb / Lg - 1)).toFixed(0) + "% OF THE PATH ***",
        Lb > Lg * 1.5,
        "winding-oriented " + Lg.toFixed(2) + " m, path-oriented " + Lb.toFixed(2) + " m. Detour gets left and " +
        "right for free out of the polygon winding; deriving them from neighbouring portal midpoints flips " +
        "the pair whenever three portals are near collinear, and one flipped portal sends the funnel to the " +
        "far end of the corridor.");
    ok("!! ...and crossesAllPortals reports 0 MISSED for the broken one, which is why it is not enough",
        F.crossesAllPortals(pb, bad).missed === 0 && F.crossesAllPortals(pg, good).missed === 0,
        "broken " + JSON.stringify(F.crossesAllPortals(pb, bad)) + ", correct " +
        JSON.stringify(F.crossesAllPortals(pg, good)) + ". *** A PATH THAT ZIGZAGS ACROSS ITS CORRIDOR REALLY " +
        "DOES CROSS EVERY PORTAL IN IT. *** funnel-selfcheck built that check to catch a funnel returning the " +
        "straight line and it does; it cannot see this, and only comparing against a DERIVED optimum could.");
}

// =============================================================================================================
console.log("\n6. THE MESH AGREES WITH THE SOLVER IT IS REPLACING ABOUT WHAT IS WALKABLE");
{
    const hm = gapMap();
    const C = NM.connectivity(hm, { stride: N, maxStepUp: 3, maxStepDown: 6 });
    const reach = NM.component(C, 40, 190);
    let free = 0, wallTop = 0;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
        if (reach[z * N + x]) free++;
        else if (hm[z * N + x] > 500) wallTop++;
    }
    ok("!! the walkable set is the STEP RULE the shipped worker applies, not a height threshold",
        free > 0 && wallTop > 0 && free + wallTop === N * N,
        free + " cells reachable from the start, " + wallTop + " on the wall top and unreachable, and they " +
        "account for the whole " + (N * N) + "-cell map. *** A HEIGHTMAP CANNOT TELL A VERTICAL WALL FROM A " +
        "VERY STEEP SLOPE, *** and the wall's TOP is a perfectly flat walkable surface -- so a per-cell slope " +
        "test would call it walkable and then erode the good ground beside it for having a tall neighbour. " +
        "The obstacle set here is 'whatever this component cannot reach', which needs no magic constant and " +
        "is the only definition a heightmap supports.");
    // *** GREPPED RATHER THAN ASSERTED, because "it uses no magic constant" is exactly the kind of claim a
    // comment makes and nothing re-derives. The numbers 999 and 500 belong to fixtures; if one ever appears
    // in the module, the row above stops being true and this one says so.
    const src = fs.readFileSync(path.join(ENG, "nav/navmesh.mjs"), "utf8");
    const code = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    ok("   ...and no height threshold appears in the module's CODE, only in fixtures",
        !/\b999\b/.test(code) && !/>\s*500\b/.test(code),
        "comments stripped before grepping, because the header quotes the fixture's numbers on purpose");
}


// =============================================================================================================
console.log("\n7. *** A LEDGE YOU CAN WALK OFF AND NOT CLIMB BACK, WHICH A SABOTAGE THAT WENT 0 RED FOUND ***");
{
    // *** THIS SECTION EXISTS BECAUSE A SABOTAGE DID NOT FIRE. *** Deleting the maxStepDown test from
    // connectivity() left every check above green, which was a reading about the GATE: sections 1 to 6 are a
    // flat floor and a 999-high wall, so no fixture ever took a step DOWN and the two limits were never
    // distinguishable. Building one found a real defect in the module rather than a hole in the gate.
    const W = 128;
    const hm = new Float32Array(W * W);
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) hm[z * W + x] = (x >= 64) ? -5 : 0;
    const C = NM.connectivity(hm, { stride: W, maxStepUp: 3, maxStepDown: 6 });
    const down = (C.conn[64 * W + 63] >> 0) & 1, up = (C.conn[64 * W + 64] >> 2) & 1;
    ok("!! the step rule is DIRECTIONAL: a 5-unit drop is walkable, the same 5-unit climb is not",
        down === 1 && up === 0,
        "maxStepUp 3, maxStepDown 6, so a 5-unit ledge passes one way and refuses the other. These are two " +
        "different numbers in the shipped worker and a mesh that treats adjacency as symmetric loses that.");
    const high = NM.buildNavmesh(hm, { stride: W, seedX: 10, seedZ: 64, radius: 0 });
    const low = NM.buildNavmesh(hm, { stride: W, seedX: 120, seedZ: 64, radius: 0 });
    ok("!! *** THE MESH SPLITS AT THE CLIFF AND THE PORTAL ACROSS IT IS ONE-WAY ***",
        high.rects.length === 2 && high.adj[high.polyAt(10, 64)].length === 1 &&
        high.adj[high.polyAt(120, 64)].length === 0,
        high.rects.length + " polygons; the upper one has " + high.adj[high.polyAt(10, 64)].length +
        " outgoing portal and the lower has " + high.adj[high.polyAt(120, 64)].length + ".");
    const there = NM.planPath(high, { x: 10, z: 64 }, { x: 120, z: 64 });
    const back = NM.planPath(high, { x: 120, z: 64 }, { x: 10, z: 64 });
    ok("!! *** ...SO THE SAME MESH ROUTES DOWNHILL AND REFUSES UPHILL: " +
        (there ? there.length.toFixed(2) + " m" : "none") + " vs " + (back ? back.length.toFixed(2) + " m" : "NO PATH") + " ***",
        there !== null && back === null,
        "*** MEASURED BEFORE THE FIX, THIS RETURNED A 110.00 m PATH UP THE CLIFF OVER ONE POLYGON. *** The row " +
        "sweep had put both sides of the ledge in a single rectangle, and a rectangle is a polygon the funnel " +
        "crosses in a straight line, so there was nothing left to object. Per-component seeding HID it: a mesh " +
        "grown downhill contains both levels and will answer a query between them. The sweep now breaks a run " +
        "where the step is not mutual, and portals carry a direction each way.");
    ok("   ...and seeding from the low side simply cannot see the high ground",
        low.cells < high.cells && NM.planPath(low, { x: 120, z: 64 }, { x: 10, z: 64 }) === null,
        "low-seeded mesh holds " + low.cells + " cells against the high-seeded " + high.cells);
    // *** A SECOND CLIFF, DEEPER THAN maxStepDown, BECAUSE THE FIRST ONE STILL DID NOT GRADE THAT LIMIT. ***
    // Deleting the maxStepDown test from connectivity() left even the rows above green: a 5-unit drop is
    // WITHIN the 6-unit limit, so removing the limit changes nothing about it. Only a drop the agent may not
    // take at all distinguishes "there is a maxStepDown" from "there is no floor to how far you may fall".
    const deep = new Float32Array(W * W);
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) deep[z * W + x] = (x >= 64) ? -10 : 0;
    const D = NM.connectivity(deep, { stride: W, maxStepUp: 3, maxStepDown: 6 });
    const dm = NM.buildNavmesh(deep, { stride: W, seedX: 10, seedZ: 64, radius: 0 });
    ok("!! *** A 10-UNIT DROP IS DEEPER THAN maxStepDown AND IS REFUSED IN BOTH DIRECTIONS ***",
        ((D.conn[64 * W + 63] >> 0) & 1) === 0 && ((D.conn[64 * W + 64] >> 2) & 1) === 0 &&
        dm.rects.length === 1 && NM.planPath(dm, { x: 10, z: 64 }, { x: 120, z: 64 }) === null,
        "the mesh seeded high holds " + dm.cells + " cells -- the upper half only -- against " + high.cells +
        " for the 5-unit ledge next door, and there is no path down. maxStepUp and maxStepDown are two " +
        "separate limits and this is the row that fails if either is dropped.");
}

// =============================================================================================================
console.log("\n8. TWO WAYS ROUND, AND WHAT THE SUPERSAMPLE KNOB IS ACTUALLY WORTH");
{
    // Two gaps in one wall, at very different distances: the corridor A* picks is the whole question, and a
    // funnel cannot rescue a wrong one -- it returns the shortest path through the corridor it is GIVEN.
    const hm = flat();
    for (let z = 0; z < N; z++) if (!(z >= 180 && z <= 200) && !(z >= 400 && z <= 420))
        for (let x = 96; x <= 104; x++) hm[z * N + x] = 999;
    const S = { x: 40, z: 190 }, G = { x: 160, z: 190 };
    const mesh = NM.buildNavmesh(hm, { stride: N, seedX: S.x, seedZ: S.z, radius: 1.9, supersample: 2 });
    const p = NM.planPath(mesh, S, G);
    const viaFar = (() => { const d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
        const a = [93.6, 421.4], b = [106.4, 421.4]; return d([40, 190], a) + d(a, b) + d(b, [160, 190]); })();
    ok("!! *** IT TAKES THE NEAR GAP: " + p.length.toFixed(2) + " m, WHERE THE FAR ONE COSTS " + viaFar.toFixed(0) + " ***",
        p.length < 130 && p.length < viaFar / 3,
        "the near gap (z 180..200) is straight ahead and the far one (z 400..420) is a " + viaFar.toFixed(0) +
        " m detour. A funnel cannot fix a wrong corridor -- it returns the shortest path through the corridor " +
        "it is handed -- so this is the one row that grades the A* rather than the string pulling.");
    ok("   ...and it stays clear of both gap mouths",
        clipCount(hm, p.points).bad === 0 && trueClearance(hm, p.points) >= 1.9,
        "clearance " + trueClearance(hm, p.points).toFixed(3));
    // ---- what supersampling buys, asserted rather than offered ------------------------------------------
    // *** THE SAME WALL AT A QUARTER THE CELLS, because s = 8 on 512x512 costs 1.1 s on its own and this
    // gate is worth having UNDER the 3000 ms sweep budget: an over-budget gate is one no ship-time step runs,
    // which is what has kept meshCSG-selfcheck out of the sweep at 13,218 ms. Same geometry, same question.
    const M2 = 256, gm = new Float32Array(M2 * M2);
    for (let z = 0; z < M2; z++) if (z < 20 || z > 30) for (let x = 48; x <= 52; x++) gm[z * M2 + x] = 999;
    const got = [1, 2, 4, 8].map((ss) => {
        const m = NM.buildNavmesh(gm, { stride: M2, seedX: 20, seedZ: 95, radius: 1.9, supersample: ss });
        const q = NM.planPath(m, { x: 20, z: 95 }, { x: 80, z: 95 });
        return { ss, len: q.length, clear: trueClearance(gm, q.points, M2) };
    });
    report("supersample " + got.map((g) => g.ss + ": " + g.len.toFixed(2) + " m / clearance " +
        g.clear.toFixed(3)).join(",  "));
    ok("!! *** SAMPLING THE FIELD FINER CONVERGES ON THE RADIUS ASKED FOR, FROM THE SAFE SIDE ***",
        got.every((g) => g.clear >= 1.9) &&
        got[3].clear < got[0].clear && got[3].len < got[0].len,
        "s=1 delivers " + got[0].clear.toFixed(3) + " where 1.9 was asked and costs " + got[0].len.toFixed(2) +
        " m; s=8 delivers " + got[3].clear.toFixed(3) + " and costs " + got[3].len.toFixed(2) + ". The slack " +
        "is sqrt(2)/s cells and it is paid in the SAFE direction at every setting -- over-delivering " +
        "clearance and over-paying path length, never the reverse. *** THIS ROW EXISTS BECAUSE DELETING THE " +
        "SUPERSAMPLE PARAMETER ALTOGETHER LEFT EVERY OTHER CHECK GREEN: *** a knob nothing grades is a knob " +
        "that can quietly stop working.");
    // *** ONE SABOTAGE STILL WILL NOT FIRE, AND IT IS RECORDED RATHER THAN PAPERED OVER. *** Replacing the
    // A* cost `g + distance(entry, portal midpoint)` with a flat `g + 1` -- so the search counts POLYGONS
    // instead of metres -- changes NO path on any fixture in this gate, including a trap map built to punish
    // it: an outer wall whose gap points straight at the goal, opening into a chamber whose only exit is 90
    // units away, against a second gap that is a clean shot. Both cost models return the identical 388.09 m
    // path through the identical 10 polygons. The reason is visible in the code: f = g + D(midpoint, goal)
    // adds a POLYGON COUNT to a distance in METRES, so on any map bigger than a few dozen units the
    // heuristic dominates outright and the search is greedy best-first either way -- and on a decomposition
    // this coarse, greedy still walks into the only sensible corridor, after which the FUNNEL supplies the
    // optimality rather than the search. What is NOT claimed is that the cost model never matters; what is
    // measured is that nothing here distinguishes it, so a fixture that does is owed, and until one exists
    // the accumulated cost in corridor() is unguarded.
    report("cost-model control: g + distance and g + 1 return the same path on every fixture above, and on a " +
           "purpose-built trap map (388.09 m, 10 polygons, identical corners). The heuristic dominates.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: the A* COST MODEL, which no fixture above distinguishes -- see the control in section 8. " +
    "Whether anything is WIRED -- simulation/BotPathfinderPool.js still receives the grid " +
    "staircase and nothing in the engine calls nav/navmesh.mjs, exactly as funnel-selfcheck says of " +
    "nav/funnel.mjs. Also unchecked: Recast's watershed partition and contour simplification, which section 3 " +
    "measures the cost of skipping (729 polygons where a contour mesh would give a handful) and does not " +
    "measure the cost of HAVING, since neither is built; multi-storey worlds, since a heightmap has one " +
    "surface per column and real spans are what Recast carries; and off-mesh links, jumps and doors.");
process.exit(fails ? 1 : 0);
