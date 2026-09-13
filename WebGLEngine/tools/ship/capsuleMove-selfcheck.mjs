// WebGLEngine/tools/ship/capsuleMove-selfcheck.mjs -- v4541
//
// Run: node tools/ship/capsuleMove-selfcheck.mjs
//
// GATES physics/character/capsuleMove.mjs -- backlog "terrain-controller" piece (2), capsule against
// triangles, which v4539 proved is the blocker under piece (3).
//
// *** SECTION 2 IS THE ROUND. *** v4539 showed that a bridge and a pillar of the same height present
// BYTE-IDENTICAL columns to a downward ray -- [5, 0] and [5, 0] -- so no rule over vertical casts can tell a
// doorway from a wall. This gate re-derives that identity on every run and then walks a capsule through both
// with ONE rule and no oracle at all: under the bridge to x = 20, stopped by the pillar at x = 7.6. The stop
// is x0 minus the RADIUS, driven at four radii, so it is the body's own size rather than a tuned number.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------
//
//   A  `contacts` made to DROP a degenerate contact instead of reporting it    2 RED, sections 1 and 3
//      -- the natural guard, and the one this module's first draft had. It does not
//      resolve badly inside a surface; it resolves NOTHING there, silently.
//   B  `depenetrate` made to push every contact instead of the deepest         2 RED, section 5
//      -- and section 6's corner row still PASSES, correctly, because summing contacts
//      is not wrong at a corner. Only the flat floor catches it, which is why the
//      fixture with nothing to slide along is the one that had to be built.
//   C  moveCapsule's substep cap hardcoded to 0.2 instead of radius * stride   2 RED, sections 3 and 4
//      -- 0.2 is RIGHT for the 0.4 body every other row uses, so it passes them all.
//      The radius sweep says so, and so does the boundary row, which disables
//      substepping through `stride` and cannot once the cap ignores it.
//   D  the push direction taken from the triangle's cross product              8 RED, sections 2 to 7
//   E  segmentTriangle's piercing test removed                                 2 RED, sections 1
//
// *** TWO OF THESE WENT 0 RED ON THEIR FIRST RUN AND NEITHER WAS THE MODULE'S FAULT. ***
//
//   A and E went 0 red because THE GATE CRASHED INSTEAD OF FAILING. The impaled-body row read
//   `cImp.degenerate[0].depth` directly into its detail string, and arguments are evaluated before ok() is,
//   so the sabotage that empties that array threw a TypeError and the row printed nothing at all. The file
//   still exited 1 -- from a different row -- which is exactly how this species hides: inside a red run,
//   where nobody is looking for a row that never reported. The depth is read through a fallback now.
//
//   B went 0 red because SECTION 5 GRADED A COPY OF THE LOGIC. It hand-rolled both the deepest-first loop
//   and the summing one so a flag could switch between them, which meant sabotaging the shipped
//   `depenetrate` changed nothing the section could see. The deepest arm calls the module now; the summing
//   arm stays hand-rolled because it is the RIVAL and the rival is not in the module.
//
// SECTION 3'S FIRST ROW IS A MEASUREMENT OF A LIMIT AND NOT OF A BUG. The closest-point direction is
// undefined once the capsule's axis crosses the surface; that is a property of the formulation rather than a
// defect in this file, and the row exists so a later reader who widens the substep cap meets the number
// before the character meets the stone.
"use strict";
import * as CM from "../../physics/character/capsuleMove.mjs";
import { bridgeMesh, pillarMesh, columnHits } from "../../physics/character/groundProbe.mjs";
import { MeshBVH } from "../../mesh/meshBVH.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const R = CM.CAPSULE_AT_V4541;

const bridge = bridgeMesh(), pillar = pillarMesh();
const faceNormalY = (bvh, t) => {
    const i = t * 9, s = bvh.tris;
    const e1 = [s[i + 3] - s[i], s[i + 4] - s[i + 1], s[i + 5] - s[i + 2]];
    const e2 = [s[i + 6] - s[i], s[i + 7] - s[i + 1], s[i + 8] - s[i + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    return n[1] / (Math.hypot(n[0], n[1], n[2]) || 1);
};
/** Walk east one frame at a time until the target or until the body stops making progress. */
const walkEast = (bvh, { start = [2, 0, 10], target = 20, adv = 5 / 60, radius = 0.4, stride = 0.5 } = {}) => {
    const cap = CM.capsuleOf(start, { radius });
    let frames = 0, degenerate = 0;
    while (cap.pos[0] < target - 1e-9 && frames < 20000) {
        const r = CM.moveCapsule(bvh, cap, [adv, 0, 0], { stride });
        degenerate += r.degenerate; frames++;
        if (r.blocked && frames > 2) break;
    }
    return { x: +cap.pos[0].toFixed(6), y: +cap.pos[1].toFixed(6), z: +cap.pos[2].toFixed(6), frames, degenerate };
};

// =============================================================================================================
console.log("\n1. the two kernels, against oracles rather than against themselves");
{
    // A brute lattice over the triangle. It can only ever be WORSE than the exact answer, never better, so
    // `exact <= brute` is a one-sided check that a wrong closed form cannot satisfy by being close.
    const brute = (p, t, i, N) => {
        const A = [t[i], t[i + 1], t[i + 2]], B = [t[i + 3], t[i + 4], t[i + 5]], C = [t[i + 6], t[i + 7], t[i + 8]];
        let best = Infinity;
        for (let a = 0; a <= N; a++) for (let b = 0; a + b <= N; b++) {
            const u = a / N, v = b / N, w = 1 - u - v;
            const d = (A[0] * w + B[0] * u + C[0] * v - p[0]) ** 2 + (A[1] * w + B[1] * u + C[1] * v - p[1]) ** 2 +
                      (A[2] * w + B[2] * u + C[2] * v - p[2]) ** 2;
            if (d < best) best = d;
        }
        return Math.sqrt(best);
    };
    const tri = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]);
    let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const regions = {}; let worst = 0;
    for (let k = 0; k < 300; k++) {
        const p = [rnd() * 4 - 1.5, rnd() * 4 - 2, rnd() * 4 - 1.5];
        const q = CM.closestOnTriangle(p[0], p[1], p[2], tri, 0);
        regions[q[3]] = (regions[q[3]] || 0) + 1;
        worst = Math.max(worst, Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) - brute(p, tri, 0, 220));
    }
    const all = ["A", "B", "C", "AB", "BC", "AC", "FACE"];
    ok("!! *** the closest point is never further than a dense lattice can find, over all SEVEN regions ***",
        worst <= 1e-12 && all.every((r) => regions[r] > 0),
        "worst (exact - lattice) over 300 random points: " + worst.toExponential(2) + " -- one-sided on " +
        "purpose, because a lattice can only overestimate, so 'no worse than the oracle' is a claim a wrong " +
        "closed form cannot buy by being nearly right. Regions exercised: " +
        all.map((r) => r + "=" + (regions[r] || 0)).join(" ") + ". *** AN UNDRIVEN VORONOI REGION IS THE " +
        "CLASSIC DEFECT IN THIS FUNCTION *** -- there are seven branches and the face one is the rarest.");

    // The same idea for the segment-triangle distance: sample both objects densely.
    const segBrute = (a, b, t, i, N) => {
        let best = Infinity;
        for (let s = 0; s <= N; s++) {
            const p = [a[0] + (b[0] - a[0]) * s / N, a[1] + (b[1] - a[1]) * s / N, a[2] + (b[2] - a[2]) * s / N];
            best = Math.min(best, brute(p, t, i, 90));
        }
        return best;
    };
    let sWorst = 0, sCases = 0;
    for (let k = 0; k < 40; k++) {
        const a = [rnd() * 3 - 1, rnd() * 3 - 1.5, rnd() * 3 - 1], b = [rnd() * 3 - 1, rnd() * 3 - 1.5, rnd() * 3 - 1];
        const got = CM.segmentTriangle(a, b, tri, 0).dist;
        sWorst = Math.max(sWorst, got - segBrute(a, b, tri, 0, 90)); sCases++;
    }
    ok("!! ...and the segment-triangle distance is never worse than sampling BOTH objects",
        sWorst <= 1e-12 && sCases === 40,
        "worst over " + sCases + " random segments: " + sWorst.toExponential(2) + ". The five sub-problems " +
        "are the two endpoints against the triangle and the axis against each of the three edges; the " +
        "tempting shortcut -- cast the axis at the plane and clamp the hit into the triangle -- is right " +
        "only when the axis meets the plane INSIDE the triangle, which is not where a character controller " +
        "lives.");

    // The oracle row above is abstract. This is the same defect with a body in it.
    const fiveWay = (a, b, t, i) => {
        const dd = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
        let m = Infinity;
        for (const p of [a, b]) { const c = CM.closestOnTriangle(p[0], p[1], p[2], t, i); m = Math.min(m, dd(p, c)); }
        for (let k = 0; k < 3; k++) {
            const j = i + k * 3, e = i + ((k + 1) % 3) * 3;
            const [p, c] = CM.closestOnSegments(a, b, [t[j], t[j + 1], t[j + 2]], [t[e], t[e + 1], t[e + 2]]);
            m = Math.min(m, dd(p, c));
        }
        return Math.sqrt(m);
    };
    const ledge = CM.thinLedge(), imp = CM.capsuleOf(R.ledgeAt);
    const five = fiveWay(imp.a, imp.b, ledge.tris, 0), six = CM.segmentTriangle(imp.a, imp.b, ledge.tris, 0).dist;
    const cImp = CM.contacts(ledge, imp);
    // *** THE DEPTH IS READ THROUGH A FALLBACK AND NOT OFF degenerate[0], WHICH IS NOT A STYLE CHOICE. ***
    // The first draft wrote cImp.degenerate[0].depth straight into this detail string. Arguments are
    // evaluated before ok() is, so under sabotage E -- the very sabotage this row exists to convict -- the
    // string threw and the row printed NOTHING AT ALL. The file still exited 1, from the oracle row above,
    // which is how a check that crashes instead of failing hides inside a red run. Fifth instance of this
    // species in this tree's notes.
    const impDepth = cImp.degenerate.length ? cImp.degenerate[0].depth : (cImp.hits[0] ? cImp.hits[0].depth : NaN);
    ok("!! *** A BODY WITH A LEDGE THROUGH ITS CHEST, AND THE FIVE BOUNDARY CASES REPORT NOTHING TOUCHING IT ***",
        Math.abs(five - R.ledgeFiveWay) < 1e-9 && six === R.ledgeSixWay &&
        cImp.hits.length === 0 && cImp.degenerate.length === 1 &&
        Math.abs(impDepth - R.radius) < 1e-9,
        "axis " + imp.a.join(",") + " to " + imp.b.join(",") + " through a ledge at y=1. The five boundary " +
        "sub-problems answer " + five.toFixed(6) + " -- EXACTLY THE RADIUS, so depth 0, so no contact at " +
        "all. The piercing test answers " + six + ", depth " + impDepth.toFixed(4) + " over " +
        cImp.hits.length + " hit(s) and " + cImp.degenerate.length + " degenerate, " +
        "reported as degenerate: 'I am inside something' rather than 'nothing is touching me'. *** THIS IS " +
        "THE DEFECT THE ORACLE ROW ABOVE FOUND, WITH A BODY IN IT, *** and it survived the bridge, the " +
        "pillar, the corner and the flat floor, because none of those puts a thin surface across a middle. " +
        "The sample point is off the quad's own diagonal deliberately -- ON the diagonal the axis touches a " +
        "triangle EDGE and the five find it, which is a fixture passing for the wrong reason.");

    const [p, q] = CM.closestOnSegments([0, 0, 0], [0, 0, 0], [1, 0, 0], [1, 0, 0]);
    const [p2, q2] = CM.closestOnSegments([0, 5, 0], [0, 5, 0], [-1, 0, 0], [1, 0, 0]);
    ok("   both degenerate branches of the segment pair answer, rather than dividing by zero",
        p.join() === "0,0,0" && q.join() === "1,0,0" && p2.join() === "0,5,0" && q2.join() === "0,0,0",
        "point-vs-point and point-vs-segment: a capsule whose two sphere centres coincide IS a sphere, and " +
        "capsuleOf clamps the radius to half the height, so a caller can build one by accident.");
}

// =============================================================================================================
console.log("\n2. *** THE SEPARATION NO DOWNWARD RULE CAN MAKE, MADE BY ONE RULE WITH NO ORACLE ***");
{
    const cols = { bridge: columnHits(bridge, 12, 10).join(","), pillar: columnHits(pillar, 8.5, 10).join(",") };
    const br = walkEast(bridge), pl = walkEast(pillar), off = walkEast(pillar, { start: [2, 0, 2] });
    ok("!! *** THE COLUMNS ARE STILL IDENTICAL FROM ABOVE, AND THE CAPSULE STILL TELLS THEM APART ***",
        cols.bridge === cols.pillar && Math.abs(br.x - R.bridgeX) < 1e-6 && Math.abs(pl.x - R.pillarX) < 1e-6,
        "every surface under a vertical ray: bridge [" + cols.bridge + "] and pillar [" + cols.pillar +
        "] -- v4539's proof, re-derived here rather than cited. Walking east from x=2 with the capsule: " +
        "bridge x=" + br.x.toFixed(4) + " (under the roof, " + br.frames + " frames), pillar x=" +
        pl.x.toFixed(4) + " (stopped, " + pl.frames + " frames). *** ONE RULE. NO GROUND ORACLE AT ALL. *** " +
        "The difference is the pillar's SIDE FACES, which is exactly what a vertical ray never touches.");

    const radii = [0.1, 0.25, 0.4, 0.9].map((radius) => ({ radius, x: walkEast(pillar, { radius }).x }));
    ok("!! *** and the stop is x0 MINUS THE RADIUS at every radius, so it is the body and not a number ***",
        radii.every((r) => Math.abs(r.x - (8 - r.radius)) < 1e-6),
        radii.map((r) => "r=" + r.radius + " -> " + r.x.toFixed(4)).join(", ") + ", against 8 - r. A stop " +
        "that did not move with the body would be a constant somebody tuned against this one fixture.");

    ok("   ...and a body that misses the pillar in z walks straight past it",
        Math.abs(off.x - 20) < 1e-6 && off.degenerate === 0,
        "the pillar occupies z in [8,12]; from z=2 the same call reaches x=" + off.x.toFixed(4) + ". A rule " +
        "that stopped everything at x=8 would pass the row above and fail this one.");
    report("NOT CHECKED HERE: sloped or curved overhangs, a roof low enough to matter to the capsule's head, " +
           "and anything about gravity -- this module has none, so a body walks under the bridge at the " +
           "height it started at.");
}

// =============================================================================================================
console.log("\n3. *** THE CLOSEST-POINT DIRECTION DOES NOT DEGRADE AT THE SURFACE. IT DIES. ***");
{
    const floor = bridgeMesh({ roofFrom: 1e9 });          // floor only: the roof is pushed out of the world
    const probe = (y) => {
        const cap = CM.capsuleOf([10, y, 10]);
        const q = CM.segmentTriangle(cap.a, cap.b, floor.tris, 0);
        const L = Math.hypot(q.on[0] - q.at[0], q.on[1] - q.at[1], q.on[2] - q.at[2]);
        return { depth: +(cap.radius - q.dist).toFixed(6), L };
    };
    const above = [-0.05, -0.2, -0.39].map(probe), below = [-0.4, -0.6, -1.0].map(probe);
    ok("!! *** ZERO DIRECTION FOR EVERY DEPTH PAST THE CROSSING, AND THE DEPTH SATURATES AT THE RADIUS ***",
        above.every((p) => p.L > 1e-6) && below.every((p) => p.L <= CM.DEGENERATE) &&
        below.every((p) => Math.abs(p.depth - R.radius) < 1e-9),
        "axis outside: |dir| = " + above.map((p) => p.L.toExponential(1)).join(", ") + " at depths " +
        above.map((p) => p.depth).join("/") + ". Axis crossed (0.2, 0.6 and 1.0 metres past it): |dir| = " +
        below.map((p) => p.L).join(", ") + " at depths " + below.map((p) => p.depth).join("/") + " -- the " +
        "radius, whatever the true depth. THERE IS NO GRADIENT LEFT TO CLIMB OUT ALONG. This is a property " +
        "of the formulation and not a defect in this file; the row exists so a reader who widens the " +
        "substep cap meets the number before the character meets the stone.");

    const raw = (adv) => {
        const cap = CM.capsuleOf([2, 0, 10]); let deg = 0;
        for (let f = 0, n = Math.ceil(30 / adv); f < n; f++) deg += CM.moveCapsule(pillar, cap, [adv, 0, 0], { stride: 1e9 }).degenerate;
        return { x: cap.pos[0], deg };
    };
    const safe = raw(R.safeAdvance), tunnel = raw(R.tunnelAdvance);
    let lo = 0.1, hi = 0.5;
    for (let k = 0; k < 45; k++) { const m = (lo + hi) / 2; if (raw(m).x > 9) hi = m; else lo = m; }
    ok("!! *** THE BOUNDARY IS THE RADIUS, TO TWELVE DECIMALS, AND THE DROPPED CONTACT IS THE TUNNEL ***",
        Math.abs(safe.x - R.pillarX) < 1e-6 && tunnel.x > 9 && safe.deg === R.droppedAtSafe &&
        tunnel.deg === R.droppedAtTunnel && Math.abs(hi - R.radius) < 1e-9,
        "with substepping disabled, an advance of " + R.safeAdvance + " stops at " + safe.x.toFixed(4) +
        " with " + safe.deg + " degenerate contacts; " + R.tunnelAdvance + " ends at " + tunnel.x.toFixed(4) +
        " -- THROUGH FOUR SQUARE METRES OF SOLID STONE -- with " + tunnel.deg + ". Bisected, the first " +
        "advance that tunnels is " + hi.toFixed(12) + " against a radius of " + R.radius + ". Not the " +
        "pillar's thickness (1.0), not the speed: the radius.");
}

// =============================================================================================================
console.log("\n4. the substep cap is DERIVED FROM THE BODY, which is the difference between 0.2 and a rule");
{
    const rows = [0.1, 0.25, 0.4, 0.9].map((radius) => {
        const cap = CM.capsuleOf([2, 0, 10], { radius });
        const r = CM.moveCapsule(pillar, cap, [R.fastAdvance, 0, 0], {});
        return { radius, substeps: r.substeps, advance: +r.advance.toFixed(6), x: +cap.pos[0].toFixed(6) };
    });
    const mine = rows.find((r) => r.radius === R.radius);
    ok("!! *** twenty metres in ONE call stops at the pillar, and the substep count scales with the body ***",
        rows.every((r) => Math.abs(r.x - (8 - r.radius)) < 1e-6) &&
        rows.every((r) => r.advance <= r.radius * 0.5 + 1e-12 && r.advance > r.radius * 0.5 - r.advance) &&
        mine.substeps === R.fastSubsteps,
        rows.map((r) => "r=" + r.radius + ": " + r.substeps + " substeps of " + r.advance.toFixed(4) +
        " -> x=" + r.x.toFixed(4)).join("; ") + ". *** A CAP HARDCODED AT " + R.safeAdvance + " PASSES " +
        "EVERY OTHER ROW IN THIS FILE, *** because " + R.safeAdvance + " is right for the 0.4 body they all " +
        "use. It is wrong for a 0.1 body by a factor of four, and this is the only row that says so.");
    report("substep counts are ceil(distance / (radius * stride)) and therefore exact: " +
           rows.map((r) => r.radius + "->" + r.substeps).join(", ") + " for a 20 m advance at stride 0.5.");
}

// =============================================================================================================
console.log("\n5. *** A FLAT FLOOR THAT PUSHES YOU SIDEWAYS, WHICH IS WHY THE DEEPEST CONTACT WINS ***");
{
    const gf = CM.tessellatedFloor();
    // *** THE "deepest" ARM CALLS THE SHIPPED depenetrate AND THE "all" ARM IS THE ONLY COPY. *** The first
    // draft hand-rolled BOTH loops so it could switch between them with a flag -- and sabotage B, which makes
    // the real depenetrate sum every contact, went 0 RED: the section graded a copy of the logic and never
    // touched the module. The rival has to be written here because it is not in the module, but the thing
    // being defended must be the thing that ships.
    const seam = (mode, sink) => {
        const cap = CM.capsuleOf([1, -0.02, 10]); let lost = 0;
        for (let f = 0; f < 200; f++) {
            const x0 = cap.pos[0];
            for (const v of ["pos", "a", "b"]) { cap[v][0] += 5 / 60; cap[v][1] -= sink; }
            if (mode === "deepest") CM.depenetrate(gf, cap, { iterations: 8 });
            else for (let k = 0; k < 8; k++) {
                const c = CM.contacts(gf, cap);
                if (!c.hits.length) break;
                for (const h of c.hits) for (let j = 0; j < 3; j++) { cap.pos[j] += h.n[j] * h.depth; cap.a[j] += h.n[j] * h.depth; cap.b[j] += h.n[j] * h.depth; }
            }
            lost += 5 / 60 - (cap.pos[0] - x0);
        }
        return { drift: +Math.abs(cap.pos[2] - 10).toFixed(6), lost: +lost.toFixed(6) };
    };
    const d05 = seam("deepest", 0.05), a05 = seam("all", 0.05);
    const d20 = seam("deepest", 0.2), a20 = seam("all", 0.2);
    ok("!! *** 200 COPLANAR TRIANGLES, NO SLOPE, NO WALL -- AND SUMMING THE CONTACTS DRIFTS 0.63 METRES ***",
        d05.drift <= 1e-9 && d20.drift <= 1e-9 && a05.drift > 0.1 && a20.drift > 0.5,
        "sink 0.05: deepest drifts " + d05.drift.toFixed(6) + " and loses " + d05.lost.toFixed(6) + "; every " +
        "contact drifts " + a05.drift.toFixed(6) + " and loses " + a05.lost.toFixed(6) + ". Sink 0.20: " +
        d20.drift.toFixed(6) + "/" + d20.lost.toFixed(6) + " against " + a20.drift.toFixed(6) + "/" +
        a20.lost.toFixed(6) + ". *** THE FLOOR IS FLAT. *** Every one of those metres is manufactured by " +
        "the tessellation: the neighbour triangle's nearest feature to the axis is the SHARED EDGE, so its " +
        "push is diagonal, and an interior seam bounds nothing.");
    ok("   and the deepest-first walk gives back the same zero at both sinks, which a tolerance would not",
        d05.drift === R.seamDriftDeepest && d20.drift === R.seamDriftDeepest,
        "drift " + d05.drift + " and " + d20.drift + " against a recorded " + R.seamDriftDeepest + " -- exact " +
        "zero rather than small, because the deepest contact on a flat floor is the face and a face normal " +
        "here has no horizontal part at all.");
}

// =============================================================================================================
console.log("\n6. the two things that would make summing look necessary, and do not");
{
    const cap = CM.capsuleOf([8, -0.02, 10]);
    for (let f = 0; f < 200; f++) CM.moveCapsule(CM.insideCorner(), cap, [5 / 60, -0.02, 0], {});
    ok("!! an INSIDE CORNER obeys both surfaces at once without summing anything",
        Math.abs(cap.pos[0] - R.cornerX) < 1e-6 && Math.abs(cap.pos[1]) < 1e-6,
        "floor plus a wall at x=10, walked into while sinking: the body ends at x=" + cap.pos[0].toFixed(6) +
        " (the wall minus the radius) and y=" + cap.pos[1].toFixed(6) + " (on the floor). *** THIS IS THE " +
        "ROW SUMMING EXISTS FOR AND IT DOES NOT NEED IT: *** iterating re-queries, so the second surface is " +
        "found on the next pass. Sabotage B, which makes depenetrate sum, leaves THIS row passing and " +
        "reddens section 5 -- summing is not wrong at a corner, it is wrong on a floor.");

    const flip = (bvh) => {
        const t = bvh.tris.slice();
        for (let i = 0; i < t.length; i += 9) for (let k = 0; k < 3; k++) { const a = t[i + 3 + k]; t[i + 3 + k] = t[i + 6 + k]; t[i + 6 + k] = a; }
        return new MeshBVH(t);
    };
    const ys = (bvh) => Array.from({ length: bvh.count }, (_, t) => +faceNormalY(bvh, t).toFixed(3));
    const fb = flip(bridge), fp = flip(pillar);
    const same = walkEast(fb).x === walkEast(bridge).x && walkEast(fp).x === walkEast(pillar).x;
    ok("!! *** THIS TREE'S OWN FLOORS ARE WOUND INWARD, AND REVERSING EVERY TRIANGLE CHANGES NOTHING ***",
        ys(bridge).filter((y) => y === -1).length === 4 && ys(pillar).filter((y) => y === -1).length === 4 &&
        ys(fb).filter((y) => y === 1).length === 4 && same && R.inwardWoundFloors,
        "bridge face normals " + JSON.stringify(ys(bridge)) + ", pillar " + JSON.stringify(ys(pillar)) +
        " -- every floor triangle points STRAIGHT DOWN, into the ground it is the top of. A resolver that " +
        "pushed along the face normal would drive a standing body through its own floor. Reversing the " +
        "winding of every triangle in both fixtures gives bit-identical walks (" + walkEast(fb).x.toFixed(4) +
        " and " + walkEast(fp).x.toFixed(4) + "), because nothing here reads a cross product.");
}

// =============================================================================================================
console.log("\n7. the record is what the code reports now");
{
    const br = walkEast(bridge), pl = walkEast(pillar);
    const cap = CM.capsuleOf([2, 0, 10]);
    const fast = CM.moveCapsule(pillar, cap, [R.fastAdvance, 0, 0], {});
    ok("!! every field of the frozen record is re-derived above rather than typed here",
        br.x === R.bridgeX && pl.x === R.pillarX && Math.abs(pl.x - (8 - R.radius)) < 1e-9 &&
        R.pillarStopIsRadius === true && fast.substeps === R.fastSubsteps &&
        Math.abs(fast.advance - R.safeAdvance) < 1e-9 && Object.isFrozen(R),
        "bridge " + br.x + ", pillar " + pl.x + " = 8 - " + R.radius + ", " + R.fastAdvance + " m in " +
        fast.substeps + " substeps of " + fast.advance.toFixed(4) + " -- against a record of " + R.bridgeX +
        ", " + R.pillarX + ", " + R.fastSubsteps + ", " + R.safeAdvance + ".");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: piece (1), vertical velocity, which this module still does not own -- a body walks " +
    "under the bridge at the height it started at because nothing pulls it down. Moving platforms, which " +
    "need the geometry to move between frames and nothing here re-queries a changed BVH. Stepping up onto a " +
    "ledge, which is a POLICY over contacts rather than a contact. And the wiring: stepTerrain still asks an " +
    "oracle over (x, z), so piece (3) has its instrument and is not closed -- closing it changes that " +
    "function's contract from 'the ground is a height' to 'the ground is what the body can occupy', which " +
    "is a round rather than a line.");
process.exit(fails ? 1 : 0);
