// WebGLEngine/tools/ship/partitionScore-selfcheck.mjs -- v4536
//
// Run: node tools/ship/partitionScore-selfcheck.mjs
//
// GATES nav/partitionScore.mjs, and it exists because a backlog item asked for a better partition of the
// navmesh and NOTHING IN THE TREE COULD HAVE TOLD A BETTER ONE FROM A WORSE ONE. That is not an opinion about
// the gates; it was driven. Deleting the vertical mutual-step test from the row sweep leaves navmesh,
// navWiring, navWiringLive and funnel ALL GREEN -- and the same deletion turns a z-oriented ledge into one
// polygon and hands back a 110 m path UP a cliff, which is the exact defect the module's longest comment
// says was fixed. The horizontal twin of that test is graded: deleting it costs two reds. One axis out of
// two, and the gate that exists BECAUSE A SABOTAGE DID NOT FIRE had the identical hole one axis over.
//
// *** SO THE FIRST THING THIS ROUND BUILDS IS NOT A PARTITIONER. *** Sections 1 and 2 below are the two
// instruments the tree was missing, and section 3 is the fixture that closes the ungraded sabotage.
//
// ---- SABOTAGES, WITH THEIR RESULTS ------------------------------------------------------------------------
//
//   A  vertical mutual test deleted from the row sweep's join    RED, section 3 z-ledge (1 polygon, was 2)
//   B  horizontal mutual test deleted from the run scanner       RED, section 3 x-ledge (1 polygon, was 2)
//   C  max-matching term dropped from the chord count            RED, section 1 plus sign (floor 5, was 3)
//   D  hole term dropped from the floor                          RED, section 1 diagonal (floor 739, was 737)
//   E  inRing() made to accept every point                       RED, section 2 T-junction (0 outside, was 91)
//   F  mutualViolations' X clause disabled                       *** 0 RED ON THE FIRST DRAFT -- SEE BELOW ***
//   G  mutualViolations' Z clause disabled                       RED, section 3 conviction row
//
// *** F IS THE ONE WORTH READING. *** Section 3's conviction row originally built its deliberately-wrong
// one-region label on the Z ledge alone, so every violation it counted lay in the Z direction and the X
// clause of the counter never ran. That is the SAME defect this round exists to report -- one axis of a
// two-axis property graded, the other not -- reproduced inside the instrument written to find it, on the
// first try. The row now convicts on both axes and F goes red like the rest. The lesson is not that the
// counter was wrong; it was correct. The lesson is that a fixture built to demonstrate a property tends to
// demonstrate the half of it the author was thinking about.
"use strict";
import * as NM from "../../nav/navmesh.mjs";
import * as F from "../../nav/funnel.mjs";
import * as PS from "../../nav/partitionScore.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

const N = 512, W = 128;
const diagonal = () => { const hm = new Float32Array(N * N);
    for (let t = 0; t < 400; t++) if (t < 150 || t > 190)
        for (let w = -4; w <= 4; w++) { const x = 60 + t + w, z = 60 + t;
            if (x >= 0 && z >= 0 && x < N && z < N) hm[z * N + x] = 999; }
    return hm; };
const ledge = (axis) => { const hm = new Float32Array(W * W);
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) hm[z * W + x] = ((axis === "x" ? x : z) >= 64) ? -5 : 0;
    return hm; };
const pathLen = (p) => (p && p.points)
    ? p.points.reduce((t, q, i) => i ? t + Math.hypot(q.x - p.points[i - 1].x, q.z - p.points[i - 1].z) : 0, 0) : null;

// =============================================================================================================
console.log("\n1. *** THE ROW SWEEP IS ALREADY OPTIMAL, SO THE BACKLOG ITEM'S PREMISE IS REFUSED BY ARITHMETIC ***");
{
    // Lipski/Ohtsuki: the minimum rectangle count of a rectilinear region is N - L + 1 - H, for N reflex
    // vertices, L maximum independent reflex-to-reflex chords and H holes. It is computed here FROM THE MASK
    // the mesh was built from -- not from the mesh -- so the two numbers have independent provenance.
    const hm = diagonal();
    const mesh = NM.buildNavmesh(hm, { stride: N, seedX: 80, seedZ: 200, radius: 1.9, supersample: 2 });
    const m = PS.minRectPartition(mesh.kept, mesh.stride, mesh.rows);
    ok("!! *** THE 737 IS THE FLOOR AND NOT A STAIRCASE ARTEFACT: THE SWEEP EMITS EXACTLY THE MINIMUM ***",
        mesh.rects.length === m.min && m.min > 0,
        mesh.rects.length + " rectangles emitted, minimum is " + m.min + " (" + m.reflex + " reflex corners - " +
        m.chords + " independent chords + 1 - " + m.holes + " holes). *** THE BACKLOG ENTRY READS '737 THIN " +
        "RECTANGLES WHERE A CONTOUR MESH WOULD GIVE A HANDFUL' AS THOUGH THE SWEEP WERE BEING WASTEFUL. *** " +
        "It is not: a union of axis-aligned unit cells is convex if and only if it is a rectangle, so no " +
        "partitioner that keeps its polygons on the cell lattice can emit fewer than this. A rectangle-merge " +
        "pass over the sweep's output cannot buy one polygon. The handful has to be bought by LEAVING the " +
        "lattice, which is the same move that puts exactly-shared portal edges at risk.");
    report("the floor is recomputed from the mask on every run, so this row goes red the moment the sweep " +
           "stops being optimal -- which is the only thing that would make a merge pass worth writing");
    // A control in the other direction: a mask WITH a usable chord has a floor strictly below its reflex count.
    const stride = 8, rows = 8, mask = new Uint8Array(stride * rows);
    for (let z = 2; z < 6; z++) for (let x = 0; x < 8; x++) mask[z * stride + x] = 1;
    for (let z = 0; z < 8; z++) for (let x = 2; x < 6; x++) mask[z * stride + x] = 1;      // a plus sign
    const plus = PS.minRectPartition(mask, stride, rows);
    ok("!! the floor is not just 'reflex + 1': a plus sign's four reflex corners carry two independent chords",
        plus.reflex === 4 && plus.chords === 2 && plus.holes === 0 && plus.min === 3,
        "plus sign: " + plus.reflex + " reflex, " + plus.chords + " independent chord(s), " + plus.holes +
        " holes -> " + plus.min + " rectangles, which is right: a top arm, the whole middle bar, a bottom arm. " +
        "*** THIS ROW WENT RED ON ITS FIRST RUN AND THE CODE WAS CORRECT -- THE ASSERTION WAS WRONG. *** It " +
        "was written expecting one chord and a floor of 4, by counting the chords that can be DRAWN rather " +
        "than the largest set that can be USED: all four exist, each shares a reflex corner with two others, " +
        "and the maximum independent set is 2. Without the chord term the floor above would read 739 against " +
        "the sweep's 737 and the row that carries this round would be comparing against a bound too loose to " +
        "constrain anything.");
}

// =============================================================================================================
console.log("\n2. *** THE PATH-IN-MESH INSTRUMENT, BECAUSE crossesAllPortals CANNOT SEE A T-JUNCTION ***");
{
    // A contour trace produces T-junctions routinely -- a long polygon edge meeting several shorter neighbour
    // edges -- and the row sweep cannot. So the instrument any contour work would lean on is exactly the one
    // that has never been asked to grade the failure contour work introduces.
    const A = { x0: 0, x1: 10, z0: 0, z1: 5 }, B = { x0: 6, x1: 10, z0: 5, z1: 10 };
    const ring = (R) => [{ x: R.x0, z: R.z0 }, { x: R.x1, z: R.z0 }, { x: R.x1, z: R.z1 }, { x: R.x0, z: R.z1 }];
    const rings = [ring(A), ring(B)];
    const S = { x: 1, z: 1 }, G = { x: 8, z: 9 }, deg = (p) => ({ left: { ...p }, right: { ...p } });
    const run = (portal) => {
        const portals = [deg(S), portal, deg(G)];
        const pts = F.funnel(portals);
        return { pts, mem: PS.pathInMesh(pts, rings), cap: F.crossesAllPortals(pts, portals) };
    };
    const good = run({ left: { x: 10, z: 5 }, right: { x: 6, z: 5 } });      // the TRUE shared span
    const bad = run({ left: { x: 10, z: 5 }, right: { x: 0, z: 5 } });       // one T-junction too long
    ok("!! the instrument PASSES the honest mesh -- a check nothing can satisfy grades nothing",
        good.mem.outside === 0 && good.cap.missed === 0,
        good.mem.outside + " of " + good.mem.total + " samples outside, portal test " + good.cap.missed +
        " missed. Both instruments agree when the portal is the real shared span.");
    ok("!! *** AND IT FAILS THE T-JUNCTION THAT crossesAllPortals SCORES AS PERFECT ***",
        bad.mem.outside > 0 && bad.cap.missed === 0,
        bad.mem.outside + " of " + bad.mem.total + " samples OUTSIDE the mesh, and crossesAllPortals reports " +
        bad.cap.missed + " missed of " + bad.cap.total + ". *** THE PORTAL TEST ASKS WHETHER THE PATH CROSSES " +
        "THE PORTAL, NEVER WHETHER IT STAYS INSIDE THE POLYGONS. *** Widen a portal past the span it claims " +
        "and the funnel cuts the corner through solid ground, crossing the portal on the way -- so the only " +
        "membership instrument the tree had scores the broken mesh exactly as well as the correct one.");
    report("this is why piece (1) is not started here: contour simplification's whole job is to move boundary " +
           "vertices, and until this row existed nothing could have told a moved vertex from a correct one");
}

// =============================================================================================================
console.log("\n3. *** THE Z-ORIENTED LEDGE, WHICH CLOSES A SABOTAGE THAT WENT 0 RED ACROSS EVERY NAV GATE ***");
{
    // tools/ship/navmesh-selfcheck.mjs section 7 exists because a sabotage did not fire: deleting the
    // maxStepDown test left every check green, since sections 1-6 are a flat floor and a tall wall and no
    // fixture ever took a step DOWN. Its ledge runs along X. THE VERTICAL JOIN TEST WAS NEVER GRADED, and
    // the fixture that grades it is the same fixture turned ninety degrees.
    for (const axis of ["x", "z"]) {
        const hm = ledge(axis);
        const seed = axis === "x" ? { x: 10, z: 64 } : { x: 64, z: 10 };
        const far = axis === "x" ? { x: 120, z: 64 } : { x: 64, z: 120 };
        const mesh = NM.buildNavmesh(hm, { stride: W, seedX: seed.x, seedZ: seed.z, radius: 0 });
        const C = NM.connectivity(hm, { stride: W, maxStepUp: 3, maxStepDown: 6 });
        const s = PS.score(PS.labelOfRects(mesh), { conn: C.conn, stride: W, rows: W });
        const down = NM.planPath(mesh, seed, far), up = NM.planPath(mesh, far, seed);
        ok("!! the " + axis.toUpperCase() + "-oriented ledge splits, holds no mutual violation, and refuses the climb",
            mesh.rects.length === 2 && s.mutualViolations === 0 && pathLen(down) !== null && up === null,
            mesh.rects.length + " polygons, " + s.mutualViolations + " mutual-step violations, downhill " +
            (pathLen(down) === null ? "NO PATH" : pathLen(down).toFixed(2) + " m") + ", uphill " +
            (up === null ? "NO PATH" : pathLen(up).toFixed(2) + " m") + "." +
            (axis === "z" ? "  *** THIS ROW IS THE ROUND. *** Deleting the vertical mutual test at the row "
                + "sweep's join leaves this at 1 polygon, 128 violations and a 110.00 m path UP the cliff -- "
                + "and left navmesh, navWiring, navWiringLive and funnel ALL GREEN before it existed." : ""));
    }
    // *** AND THE CONVICTION IS RUN ON BOTH AXES, WHICH THE FIRST DRAFT OF THIS SECTION DID NOT DO. ***
    // It built the one-region label on the Z ledge only, so every violation it counted lay in the Z
    // direction and the X clause of mutualViolations() was never executed. The sabotage that proved it went
    // 0 RED -- which is the same defect this whole round is about, reproduced inside the instrument written
    // to find it, on the first try. A two-axis property needs two fixtures whichever module it lives in.
    const convicted = {};
    for (const axis of ["x", "z"]) {
        const hm = ledge(axis);
        const seed = axis === "x" ? { x: 10, z: 64 } : { x: 64, z: 10 };
        const mesh = NM.buildNavmesh(hm, { stride: W, seedX: seed.x, seedZ: seed.z, radius: 0 });
        const C = NM.connectivity(hm, { stride: W, maxStepUp: 3, maxStepDown: 6 });
        const one = new Int32Array(W * W).fill(-1);
        for (let i = 0; i < one.length; i++) if (mesh.reach[i]) one[i] = 0;
        convicted[axis] = PS.score(one, { conn: C.conn, stride: W, rows: W });
    }
    ok("!! *** AND THE SCORER CONVICTS THE ONE-POLYGON LEDGE ON BOTH AXES, NOT MERELY PASSES THE HONEST ONE ***",
        convicted.x.regions === 1 && convicted.x.mutualViolations === 128 &&
        convicted.z.regions === 1 && convicted.z.mutualViolations === 128,
        "labelled as ONE region the X ledge scores " + convicted.x.mutualViolations + " mutual-step " +
        "violations and the Z ledge " + convicted.z.mutualViolations + ". A check that only ever sees correct " +
        "input is a check anything satisfies, so the wrong partition is built here on purpose and graded by " +
        "the same code -- once per axis, because the counter has one clause per axis and a single fixture " +
        "drives only one of them.");
}

// =============================================================================================================
console.log("\n4. *** WHAT THE PARTITION ACTUALLY COSTS, MEASURED RATHER THAN ASSUMED ***");
{
    const hm = diagonal();
    const mesh = NM.buildNavmesh(hm, { stride: N, seedX: 80, seedZ: 200, radius: 1.9, supersample: 2 });
    const p = NM.planPath(mesh, { x: 80, z: 200 }, { x: 300, z: 120 });
    const rings = PS.ringsOfRects(mesh);
    const mem = PS.pathInMesh(p.points, rings);
    ok("!! the shipped 737-polygon mesh keeps its own path inside itself",
        mem.outside === 0, mem.outside + " of " + mem.total + " samples outside the mesh.");
    ok("!! and the corridor is a small fraction of the mesh, which is why polygon count is not the A* cost",
        p.polys > 0 && p.polys < mesh.rects.length,
        "corridor " + p.polys + " polygons of " + mesh.rects.length + ", path " + p.points.length + " corners. " +
        "*** THE BACKLOG ENTRY NAMES 'MEMORY AND A* NODES' AS THE PRIZE AND NEITHER SURVIVED MEASUREMENT: *** " +
        "planPath stays between 1 and 2 ms over meshes from 737 to 11,242 polygons. What polygon count really " +
        "costs is the ADJACENCY BUILD, quadratically -- 14.5 ms of a 119 ms build at 737, and 1,064 ms of " +
        "1,152 ms at 11,242 -- and that is a different repair from a contour mesh.");
    report("not claimed: any of this is worth fixing yet. The one shipping caller decomposes its snapshot " +
           "into THREE rectangles, so on the geometry that ships the count is 3 and the adjacency loop is " +
           "microseconds. The 737 lives on one gate fixture and nowhere else in the tree.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: the WATERSHED and the CONTOUR TRACE themselves, which are not built -- this round is " +
    "the instrument, not the algorithm, and it says the algorithm's case is weaker than the backlog entry " +
    "claims rather than that it is closed. Also unchecked: whether pathInMesh's SAMPLING can miss a thin " +
    "excursion between two samples (it is a sampler, not a proof, and 40 per world unit is a choice); " +
    "whether minRectPartition's chord enumeration is right on masks with point-touching corners, which no " +
    "fixture here builds; and the A* COST MODEL, which nothing distinguishes and a coarser mesh would move.");
process.exit(fails ? 1 : 0);
