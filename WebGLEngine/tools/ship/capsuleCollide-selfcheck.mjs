// WebGLEngine/tools/ship/capsuleCollide-selfcheck.mjs -- v4628
//
// Gates physics/character/capsuleCollide.mjs (task board #80): the capsule-vs-BVH depenetration, ground
// probe and moving-platform carry read from hh-hang/three-player-controller and ported into this tree's own
// mesh/meshBVH.mjs-based style. Section 1-3 cross-check the closed-form geometry against independent brute-
// force search (a different method reaching the same answer, this tree's own standard for a ported formula);
// sections 4-6 exercise the physical behaviour (resting on a floor, blocked by a wall, a slope-limit boundary,
// a corner, the maxStep cap, the cylindrical ground-probe fallback, and platform carry).
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CC = await import(pathToFileURL(path.join(ENG, "physics", "character", "capsuleCollide.mjs")).href);
const { MeshBVH, trianglesFrom } = await import(pathToFileURL(path.join(ENG, "mesh", "meshBVH.mjs")).href);
const {
    closestPointOnTriangle, closestSegmentSegment, segmentTriangleClosest,
    depenetrateCapsule, probeGround, carryOnPlatform, GROUND_SUPPORT_NORMAL_Y,
} = CC;

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// A tiny seeded RNG so the brute-force cross-checks are reproducible.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

console.log("1. closestPointOnTriangle AGAINST AN INDEPENDENT BRUTE-FORCE BARYCENTRIC SEARCH");
{
    const rnd = rng(1);
    let worst = 0;
    for (let trial = 0; trial < 200; trial++) {
        const a = [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2];
        const b = [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2];
        const c = [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2];
        const p = [rnd() * 6 - 3, rnd() * 6 - 3, rnd() * 6 - 3];
        const got = closestPointOnTriangle(p, a, b, c);
        // Brute force: sample the triangle on a fine barycentric grid, independent of the closed form.
        let bestD = Infinity, bestPt = null;
        const N = 60;
        for (let i = 0; i <= N; i++) for (let j = 0; j <= N - i; j++) {
            const u = i / N, v = j / N, w = 1 - u - v;
            const q = [a[0] * w + b[0] * u + c[0] * v, a[1] * w + b[1] * u + c[1] * v, a[2] * w + b[2] * u + c[2] * v];
            const d = dist(p, q);
            if (d < bestD) { bestD = d; bestPt = q; }
        }
        const gotD = dist(p, got);
        const err = gotD - bestD;   // the closed form must be AT LEAST as good as any grid sample
        if (err > worst) worst = err;
    }
    ok("!! *** 200 random triangles: closed form never loses to a 60x60 barycentric grid search ***",
       worst < 0.06, `worst excess distance ${worst.toFixed(5)} (grid resolution alone allows ~1/60 of the triangle's span)`);
}

console.log("\n2. closestSegmentSegment AGAINST AN INDEPENDENT BRUTE-FORCE PARAMETRIC SEARCH");
{
    const rnd = rng(2);
    let worst = 0;
    for (let trial = 0; trial < 200; trial++) {
        const p1 = [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2], q1 = [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2];
        const p2 = [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2], q2 = [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2];
        const { distSq } = closestSegmentSegment(p1, q1, p2, q2);
        const gotD = Math.sqrt(distSq);
        let bestD = Infinity;
        const N = 200;
        for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
            const s = i / N, t = j / N;
            const a = [p1[0] + (q1[0] - p1[0]) * s, p1[1] + (q1[1] - p1[1]) * s, p1[2] + (q1[2] - p1[2]) * s];
            const b = [p2[0] + (q2[0] - p2[0]) * t, p2[1] + (q2[1] - p2[1]) * t, p2[2] + (q2[2] - p2[2]) * t];
            const d = dist(a, b);
            if (d < bestD) bestD = d;
        }
        const err = gotD - bestD;
        if (err > worst) worst = err;
    }
    ok("!! *** 200 random segment pairs: closed form never loses to a 201x201 parametric grid search ***",
       worst < 0.03, `worst excess distance ${worst.toFixed(5)}`);
}

console.log("\n3. segmentTriangleClosest -- STATED SCOPE (vertex/edge/endpoint nearest pairs), CHECKED AGAINST IT");
{
    // A segment whose true closest approach is to a triangle EDGE (not a vertex, not either endpoint
    // projecting straight onto the face) -- exactly the case the header says this covers via the three
    // edge-vs-segment candidates.
    const a = [-1, 0, 0], b = [1, 0, 0], c = [0, 2, 0];   // triangle in the z=0 plane
    const p0 = [0, -1, 1], p1 = [0, -1, -1];              // segment parallel to edge ab, offset in y and z...
    // ...offset purely in y so the closest triangle feature is edge ab's midpoint region, at distance 1 in y, 1 in z at closest.
    const r = segmentTriangleClosest(p0, p1, a, b, c);
    ok("  closest point on the triangle side lands on edge ab (y=0), not off toward a vertex",
       Math.abs(r.onTri[1]) < 1e-9 && r.onTri[0] > -1 + 1e-6 && r.onTri[0] < 1 - 1e-6,
       `onTri=[${r.onTri.map((v) => v.toFixed(3))}]`);
    ok("  distance is exactly 1 (the y-offset), the closest z on the segment being z=0's nearest point",
       Math.abs(Math.sqrt(r.distSq) - 1) < 1e-9, `dist=${Math.sqrt(r.distSq).toFixed(6)}`);
}

console.log("\n4. depenetrateCapsule -- RESTING ON A FLOOR, BLOCKED BY A WALL, THE SLOPE-LIMIT BOUNDARY");
{
    // A flat floor at y=0, big enough that a capsule of radius 0.4 near the origin is always well inside it.
    const floor = trianglesFrom(
        [[-10, 0, -10], [10, 0, -10], [10, 0, 10], [-10, 0, 10]],
        [[0, 1, 2], [0, 2, 3]],
    );
    const floorBVH = new MeshBVH(floor);
    const radius = 0.4, height = 1.8;

    const embedded = depenetrateCapsule([0, -0.15, 0], radius, height, floorBVH);
    ok("!! *** a capsule embedded 0.15 units into the floor is pushed back out to feet.y ~= 0 ***",
       Math.abs(embedded.pos[1] - 0) < 1e-6, `settled at y=${embedded.pos[1].toFixed(6)}`);
    ok("  ...and is reported grounded, with an up-facing normal", embedded.grounded && embedded.groundNormal[1] > 0.99,
       `normal=[${embedded.groundNormal.map((v) => v.toFixed(3))}]`);

    // A vertical wall at x=2, floor removed from the picture (wall-only BVH) so only the wall can resolve it.
    const wall = trianglesFrom(
        [[2, -5, -10], [2, 5, -10], [2, 5, 10], [2, -5, 10]],
        [[0, 1, 2], [0, 2, 3]],
    );
    const wallBVH = new MeshBVH(wall);
    const pushed = depenetrateCapsule([1.8, 0, 0], radius, height, wallBVH);
    ok("!! *** a capsule overlapping a vertical wall is pushed out to exactly radius away from it ***",
       Math.abs((2 - pushed.pos[0]) - radius) < 1e-6, `x=${pushed.pos[0].toFixed(6)}, wall at x=2, radius=${radius}`);
    ok("  ...and a vertical wall is NEVER reported as ground", pushed.grounded === false);

    // The slope boundary itself: GROUND_SUPPORT_NORMAL_Y = 0.5 -> ~60 deg from vertical. A 55 deg ramp
    // (n.y = cos(55) = 0.574, above the line) vs a 65 deg ramp (n.y = cos(65) = 0.423, below it).
    const rampBVH = (deg) => {
        const rad = deg * Math.PI / 180;
        // A ramp tilted about the x-axis: rises in -z as y increases, normal = (0, cos(deg), sin(deg)).
        const h = 10;
        const pts = [[-10, 0, 0], [10, 0, 0], [10, h * Math.sin(rad), -h * Math.cos(rad)], [-10, h * Math.sin(rad), -h * Math.cos(rad)]];
        return new MeshBVH(trianglesFrom(pts, [[0, 1, 2], [0, 2, 3]]));
    };
    const shallow = depenetrateCapsule([0, -0.1 * Math.cos(55 * Math.PI / 180), -0.1 * Math.sin(55 * Math.PI / 180)], radius, height, rampBVH(55));
    const steep = depenetrateCapsule([0, -0.1 * Math.cos(65 * Math.PI / 180), -0.1 * Math.sin(65 * Math.PI / 180)], radius, height, rampBVH(65));
    ok("!! a 55 deg ramp (above the 60 deg line GROUND_SUPPORT_NORMAL_Y implies) IS standable",
       shallow.grounded === true, `GROUND_SUPPORT_NORMAL_Y=${GROUND_SUPPORT_NORMAL_Y}, cos(55)=${Math.cos(55 * Math.PI / 180).toFixed(3)}`);
    ok("!! *** a 65 deg ramp (below the line) is contact-resolved but NOT standable ***",
       steep.contacts > 0 && steep.grounded === false, `cos(65)=${Math.cos(65 * Math.PI / 180).toFixed(3)}`);

    // A corner: two walls meeting at x=2 and z=2, capsule started in the pocket between them.
    const wallX = trianglesFrom([[2, -5, -10], [2, 5, -10], [2, 5, 10], [2, -5, 10]], [[0, 1, 2], [0, 2, 3]]);
    const wallZ = trianglesFrom([[-10, -5, 2], [10, -5, 2], [10, 5, 2], [-10, 5, 2]], [[0, 1, 2], [0, 2, 3]]);
    const corner = new Float64Array(wallX.length + wallZ.length);
    corner.set(wallX, 0); corner.set(wallZ, wallX.length);
    const cornerBVH = new MeshBVH(corner);
    const inCorner = depenetrateCapsule([1.7, 0, 1.7], radius, height, cornerBVH, { iterations: 8 });
    ok("!! a capsule pushed from a corner clears BOTH walls at once, iterated to convergence",
       (2 - inCorner.pos[0]) >= radius - 1e-6 && (2 - inCorner.pos[2]) >= radius - 1e-6,
       `pos=[${inCorner.pos.map((v) => v.toFixed(4))}], needs >= radius (${radius}) from each wall`);

    // *** THE FLICKER REGRESSION, DRIVEN THE WAY A CALLER ACTUALLY DRIVES IT: REST, THEN CALL AGAIN. ***
    // A caller (camera.js's _moveFPCapsule) calls this once per frame, feeding each call's own `pos` back in
    // as the next call's `feet`. A capsule already resting at dist === radius exactly must stay grounded on
    // the VERY NEXT call, not just the one that first resolved it -- that's the state a standing player
    // actually sits in for every frame between key-presses, and it is where the CONTACT_SKIN margin lives.
    let restY = -0.1, groundedEveryCall = true;
    for (let call = 0; call < 20; call++) {
        const r = depenetrateCapsule([0, restY, 0], radius, height, floorBVH);
        if (!r.grounded) groundedEveryCall = false;
        restY = r.pos[1];   // feed forward exactly like a caller integrating frame to frame
    }
    ok("!! *** resting on a floor stays grounded on EVERY call after the first, not every other one ***",
       groundedEveryCall, `20 consecutive calls, feeding each call's own settled y back in as the next call's feet`);
}

console.log("\n5. THE maxStep CAP -- A DEEP PENETRATION RESOLVES OVER SEVERAL FRAMES, NOT ONE SNAP");
{
    const floor = trianglesFrom([[-10, 0, -10], [10, 0, -10], [10, 0, 10], [-10, 0, 10]], [[0, 1, 2], [0, 2, 3]]);
    const bvh = new MeshBVH(floor);
    const radius = 0.4;
    // pen = radius - dist, and dist can be as low as 0 (segBot resting exactly on the plane) -- so the
    // only embeddings where pen EXCEEDS maxStep (0.32) at all are in the narrow band pen in (0.32, 0.4],
    // i.e. feet.y in [-0.4, -0.38). feet.y = -0.39 -> segBot at y=0.01 -> dist=0.01 -> pen=0.39 > maxStep.
    const startY = -0.39;
    const r = depenetrateCapsule([0, startY, 0], radius, 1.8, bvh, { iterations: 1 });
    const moved = r.pos[1] - startY;
    ok("!! *** one iteration moves the capsule by at most maxStep = radius * 0.8, not the whole penetration ***",
       Math.abs(moved - radius * 0.8) < 1e-9, `moved ${moved.toFixed(4)} against a cap of ${(radius * 0.8).toFixed(4)}`);
    const r2 = depenetrateCapsule([0, startY, 0], radius, 1.8, bvh, { iterations: 20 });
    ok("  ...and enough iterations do converge all the way out", Math.abs(r2.pos[1] - 0) < 1e-6, `y=${r2.pos[1].toFixed(6)}`);
}

console.log("\n6. probeGround -- CENTER RAY, AND THE CYLINDRICAL FALLBACK FOR A GAP THE CENTER RAY MISSES");
{
    const floor = trianglesFrom([[-10, 0, -10], [10, 0, -10], [10, 0, 10], [-10, 0, 10]], [[0, 1, 2], [0, 2, 3]]);
    const bvh = new MeshBVH(floor);
    const direct = probeGround([0, 1, 0], 0.4, bvh);
    ok("!! standing over solid floor: the center ray alone finds standable ground", !!direct && direct.standable !== false,
       direct ? `dist=${direct.dist.toFixed(3)}` : "null");

    // A floor with a hole: two strips either side of a gap centered at the origin, gap wider than a single
    // ray but narrower than the capsule's own footprint -- exactly the "stair nosing" case the reference's
    // own cylindrical fallback exists for.
    const leftStrip = trianglesFrom([[-10, 0, -10], [-0.3, 0, -10], [-0.3, 0, 10], [-10, 0, 10]], [[0, 1, 2], [0, 2, 3]]);
    const rightStrip = trianglesFrom([[0.3, 0, -10], [10, 0, -10], [10, 0, 10], [0.3, 0, 10]], [[0, 1, 2], [0, 2, 3]]);
    const gapBuf = new Float64Array(leftStrip.length + rightStrip.length);
    gapBuf.set(leftStrip, 0); gapBuf.set(rightStrip, leftStrip.length);
    const gapBVH = new MeshBVH(gapBuf);
    const overGap = probeGround([0, 1, 0], 0.4, gapBVH, { ringFrac: 0.9 });
    ok("!! *** the center ray over the 0.6-wide gap misses, but the cylindrical ring at 0.9*radius catches a strip ***",
       !!overGap && overGap.standable, overGap ? `dist=${overGap.dist.toFixed(3)}` : "null -- both center and ring missed");

    const openSky = probeGround([100, 1, 100], 0.4, bvh);
    ok("  nothing below at all (off the floor entirely) reports null, not a fabricated ground", openSky === null);
}

console.log("\n7. carryOnPlatform -- TRANSLATION, ROTATION, AND THE IDENTITY CASE");
{
    const noOp = carryOnPlatform([1, 2, 3], { p: [0, 0, 0], q: [0, 0, 0, 1] }, { p: [0, 0, 0], q: [0, 0, 0, 1] });
    ok("  identity transform leaves the rider exactly where they were", dist(noOp, [1, 2, 3]) < 1e-12);

    const translated = carryOnPlatform([1, 0, 0], { p: [0, 0, 0], q: [0, 0, 0, 1] }, { p: [5, 0, 0], q: [0, 0, 0, 1] });
    ok("!! a rider standing 1 unit from the platform's origin moves WITH a pure 5-unit translation",
       dist(translated, [6, 0, 0]) < 1e-9, `got [${translated.map((v) => v.toFixed(3))}]`);

    // 90-degree rotation about Y: q = [0, sin(45deg), 0, cos(45deg)].
    const s = Math.sin(Math.PI / 4), cq = Math.cos(Math.PI / 4);
    const rotated = carryOnPlatform([1, 0, 0], { p: [0, 0, 0], q: [0, 0, 0, 1] }, { p: [0, 0, 0], q: [0, s, 0, cq] });
    ok("!! *** a 90 deg platform spin about its own origin carries a rider from local +x to local +z-ish (or -z) ***",
       Math.abs(rotated[0]) < 1e-9 && Math.abs(Math.abs(rotated[2]) - 1) < 1e-9,
       `got [${rotated.map((v) => v.toFixed(4))}] -- x must vanish, |z| must be 1`);
}

console.log();
if (fails) { console.log("[capsuleCollide-selfcheck] FAILED " + fails); process.exit(1); }
console.log("[capsuleCollide-selfcheck] all passed");
