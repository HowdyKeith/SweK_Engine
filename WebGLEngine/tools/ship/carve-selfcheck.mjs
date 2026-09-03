#!/usr/bin/env node
// WebGLEngine/tools/ship/carve-selfcheck.mjs -- v4371
//
// GRADES mesh/carve.mjs: the silhouette carve, the second sculptor, and the one that assumes less than the lathe.
//
// v3337 took img2threejs's JUDGE (render/silhouette.mjs, render/perceptual.mjs) and refused its numbers. v4255
// took its first SCULPTOR (mesh/lathe.mjs) and found that the judge's front-view IoU was nearly worthless there:
// a revolved profile's front view IS the profile mirrored, so an L-bracket that is not a solid of revolution in
// any sense still scored 0.62 against a vase's 0.99. This round takes the other technique img2threejs names --
// multi-view silhouette carving -- and the finding is the same one, sharper by a whole third of the range.
//
// *** THE JUDGE'S SCORE IS NOT 0.62 HERE. IT IS EXACTLY 1.000000, ON A RECONSTRUCTION THAT IS 56.2% TOO BIG. ***
// A visual hull reprojects to the silhouettes it was carved from BY CONSTRUCTION, so reprojection IoU cannot be
// anything but perfect, for any shape, at any view count. Section 4 measures it on five fixtures spanning 0.0%
// to 56.2% volume error and every one reads 1.000000. Held-out cross-validation -- carve from eight views and
// score against a ninth nobody used -- reads exactly 1.000000 too, on three of the five.
//
// *** AND THE LATHE HAD ONE NUMBER THAT TESTED ITS ASSUMPTION. THIS DOES NOT, AND THAT IS PROVED RATHER THAN
// CONFESSED. *** mesh/lathe.mjs's asymmetry reads exactly 0 for a revolvable input against 0.91 for an
// L-bracket -- a gap of the whole range where IoU gave 0.99 against 0.62. The equivalent here would be a number
// computed from silhouettes that detects a concavity the silhouettes missed, and section 5 shows no such number
// can exist: a cube with a sealed cavity casts a shadow IDENTICAL to a solid cube's on 48 of 48 directions
// across yaw and elevation, while its volume differs by 1000 voxels. Any function of the silhouettes returns
// the same value for both. That is a counterexample to the existence of the number, not a failure to find one.
//
// ---- WHAT THE CARVE DOES HAVE, WHICH THE LATHE DID NOT -------------------------------------------------------
//
// AN ERROR WITH A KNOWN SIGN. The hull contains the object -- always, exactly, at this resolution -- so a carve
// is never too small, only too big. Section 2 asserts it as a property over every fixture and every view count
// rather than as a number that came out right once, because it is the one guarantee the whole technique rests on.
//
// ---- THREE PREDICTIONS THIS ROUND WROTE DOWN AND THEN MEASURED WRONG -------------------------------------------
//
//   1. THE RAY-MARCHED SILHOUETTE. mesh/carve.mjs's first pairing built shadows by marching a ray down each
//      pixel's centre and carved by testing each voxel's centre. Those are not the same point, so a solid voxel
//      projecting into a pixel corner could be missed, and THE CUBE MEASURED -0.7% -- a hull SMALLER than the
//      object, which a visual hull cannot be. The bound is the one thing this technique has; an approximate
//      version of it is worth nothing. Silhouette and carve are exact duals now, and section 2 is what says so.
//   2. THE ROW-FILL. A real silhouette off a photograph is a filled region, so gaps where no voxel centre lands
//      would make the hull too tight -- sound reasoning, and fillRows() ADDS EXACTLY ZERO PIXELS on all five
//      fixtures at two angles (section 7). With n^3 centres landing in n^2 pixels there are ~n per pixel and the
//      gaps do not occur. Worse, turning it on fills the bore of a tube's top view, which is an ANNULUS and not
//      row-convex -- a fix for a problem that does not happen, breaking the case that matters most.
//   3. THE CUP. It was put in the fixture set expecting one view from above to recover its bore. A cup has a
//      FLOOR: the ray down its axis hits material, the top shadow is a disc (area 448 against a full disc's 452),
//      and 16 azimuths plus a top view still read 53.4% over. Section 6 keeps the cup and adds the TUBE -- the
//      same cylinder drilled through -- because the difference between them is the whole answer.
//
// SABOTAGES: see the log at the foot of this file.
//
// Run: node tools/ship/carve-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)
"use strict";
import { project, unproject, silhouetteOf, fillRows, fillGain, carve, volumeOf, turntable, contains } from "../../mesh/carve.mjs";
import { iou as judgeIoU } from "../../render/silhouette.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

// ---- the fixtures, every one of them scaling with the grid so a resolution sweep changes n and nothing else ----
const shapes = (n) => {
    const c = n / 2, s = n / 64, R = 12 * s, H = 12 * s, IN = 8 * s, CV = 5 * s, ARM = 4 * s;
    return {
        cube:   (i, j, k) => Math.abs(i + 0.5 - c) < R && Math.abs(j + 0.5 - c) < H && Math.abs(k + 0.5 - c) < R,
        sphere: (i, j, k) => (i + 0.5 - c) ** 2 + (j + 0.5 - c) ** 2 + (k + 0.5 - c) ** 2 < R * R,
        cross:  (i, j, k) => Math.abs(j + 0.5 - c) < H && Math.abs(i + 0.5 - c) < R && Math.abs(k + 0.5 - c) < R &&
                             (Math.abs(i + 0.5 - c) < ARM || Math.abs(k + 0.5 - c) < ARM),
        cup:    (i, j, k) => { const x = i + 0.5 - c, y = j + 0.5 - c, z = k + 0.5 - c, r2 = x * x + z * z;
                               return Math.abs(y) < H && r2 < R * R && !(r2 < IN * IN && y > -H / 2); },
        tube:   (i, j, k) => { const x = i + 0.5 - c, y = j + 0.5 - c, z = k + 0.5 - c, r2 = x * x + z * z;
                               return Math.abs(y) < H && r2 < R * R && !(r2 < IN * IN); },
        sealed: (i, j, k) => { const x = Math.abs(i + 0.5 - c), y = Math.abs(j + 0.5 - c), z = Math.abs(k + 0.5 - c);
                               return x < R && y < H && z < R && !(x < CV && y < CV && z < CV); },
    };
};
const N = 64, S = shapes(N);
const gridOf = (f, n) => Uint8Array.from({ length: n * n * n }, (_, o) => (f(o % n, ((o / n) | 0) % n, (o / (n * n)) | 0) ? 1 : 0));
const hullOf = (f, yaws, n = N, extra = []) => carve(yaws.map((yaw) => ({ m: silhouetteOf(f, n, { yaw }), yaw })).concat(extra), n);
const over = (h, f, n = N) => (volumeOf(h, n) - volumeOf(f, n)) / volumeOf(f, n);
const asFn = (g, n = N) => (i, j, k) => g[i + n * (j + n * k)];
const rgba = (m, n) => { const d = new Uint8ClampedArray(n * n * 4); for (let i = 0; i < n * n; i++) if (m[i]) { d[i * 4] = 255; d[i * 4 + 1] = 255; d[i * 4 + 2] = 255; } d.fill(255, 0, 0); return { data: d, width: n, height: n }; };
const maskIoU = (a, b) => { let I = 0, U = 0; for (let i = 0; i < a.length; i++) { if (a[i] && b[i]) I++; if (a[i] || b[i]) U++; } return U === 0 ? 1 : I / U; };

console.log("\n1. THE VIEW GEOMETRY: project and unproject are inverses along the ray, at every yaw AND elevation");
{
    let worst = 0;
    for (const [yaw, elev] of [[0, 0], [0.7, 0], [1.9, 0.4], [Math.PI / 2, Math.PI / 2], [2.3, -0.9], [5.1, 1.2]])
        for (const p of [[10.5, 20.5, 50.5], [32.5, 32.5, 32.5], [63.5, 0.5, 1.5]]) {
            const c = N / 2, dx = p[0] - c, dy = p[1] - c, dz = p[2] - c;
            const t = dy * Math.sin(elev) + (dx * Math.sin(yaw) + dz * Math.cos(yaw)) * Math.cos(elev);
            const pr = project(p[0], p[1], p[2], N, yaw, elev), q = unproject(pr.u, pr.v, t, N, yaw, elev);
            worst = Math.max(worst, Math.abs(q.x - p[0]), Math.abs(q.y - p[1]), Math.abs(q.z - p[2]));
        }
    ok("a point projected and un-projected at its own depth returns to itself", worst < 1e-9, `worst ${worst.toExponential(2)} over 18 point/view pairs`);
    // the elevation axis is not decoration: a top view must actually look DOWN, which is a different picture
    const top = silhouetteOf(S.tube, N, { yaw: 0, elev: Math.PI / 2 }), side = silhouetteOf(S.tube, N, { yaw: 0 });
    ok("  and elevation is a real axis: the tube's top shadow is an ANNULUS and its side shadow is not",
        maskIoU(top, side) < 0.6 && top.reduce((a, b) => a + b, 0) < side.reduce((a, b) => a + b, 0),
        `top area ${top.reduce((a, b) => a + b, 0)}, side area ${side.reduce((a, b) => a + b, 0)}, IoU ${maskIoU(top, side).toFixed(4)}`);
}

console.log("\n2. *** THE BOUND: THE HULL CONTAINS THE OBJECT -- every voxel, every fixture, every view count ***");
{
    let checked = 0, held = 0, minOver = Infinity, worstName = "";
    for (const [name, f] of Object.entries(S)) {
        const truth = gridOf(f, N);
        for (const V of [1, 2, 3, 4, 8, 16]) {
            const h = hullOf(f, turntable(V));
            checked++; if (contains(h, truth)) held++;
            const o = over(h, f); if (o < minOver) { minOver = o; worstName = `${name} at ${V}`; }
        }
    }
    ok(`*** containment held on all ${checked} fixture/view-count pairs, and the LEAST over-estimate anywhere is ${(minOver * 100).toFixed(1)}% ***`,
        held === checked && minOver >= 0,
        `${held}/${checked} contained; tightest ${worstName} at ${(minOver * 100).toFixed(1)}%. A NEGATIVE number here is the fault that shipped in the first draft -- a ray-marched shadow against a centre-tested carve, cube at -0.7%`);
    // THE OTHER HALF: monotone under view-set INCLUSION, which is the true statement of "more views help"
    let mono = true, grew = "";
    for (const [name, f] of Object.entries(S)) {
        let prev = Infinity;
        for (const V of [1, 2, 4, 8, 16, 32]) {                       // nested by doubling: every set contains the last
            const v = volumeOf(hullOf(f, turntable(V)), N);
            if (v > prev) { mono = false; grew = `${name} grew at ${V}`; }
            prev = v;
        }
    }
    ok("  and adding views to a NESTED set never grows the hull, on every fixture", mono, grew || "monotone non-increasing over 1,2,4,8,16,32 doubling azimuths");
}

console.log("\n3. *** MORE VIEWS IS NOT BETTER. THE RIGHT VIEWS ARE BETTER. ***");
{
    const two = over(hullOf(S.cube, [0, Math.PI / 2]), S.cube);
    const three = over(hullOf(S.cube, [0, Math.PI / 3, 2 * Math.PI / 3]), S.cube);
    ok(`*** the cube is EXACT from two views at 0 and 90 degrees (${(two * 100).toFixed(1)}%) and ${(three * 100).toFixed(1)}% too big from THREE at 0, 60 and 120 ***`,
        Math.abs(two) < 1e-9 && three > 0.2,
        "which is why section 2 states monotonicity over NESTED sets and not over the count -- {0,60,120} does not contain {0,90}, so nothing was violated and everything got worse");
    const t16 = over(hullOf(S.tube, turntable(16)), S.tube);
    const topView = { m: silhouetteOf(S.tube, N, { yaw: 0, elev: Math.PI / 2 }), yaw: 0, elev: Math.PI / 2 };
    const t2plus = over(hullOf(S.tube, [0, Math.PI / 2], N, [topView]), S.tube);
    ok(`*** and the tube is ${(t16 * 100).toFixed(1)}% too big from SIXTEEN azimuths and EXACT from two plus one view from above ***`,
        t16 > 0.5 && Math.abs(t2plus) < 1e-9,
        `sixteen views from the wrong place cannot see a hole that one view from the right place recovers completely`);
}

console.log("\n4. *** THE JUDGE'S SCORE IS 1.000000 ON A RECONSTRUCTION 56.2% TOO BIG ***");
{
    const yaws = turntable(8), rows = [];
    let allPerfect = true, worstErr = 0;
    for (const [name, f] of Object.entries(S)) {
        const h = hullOf(f, yaws), hf = asFn(h);
        const re = Math.min(...yaws.map((yaw) => maskIoU(silhouetteOf(hf, N, { yaw }), silhouetteOf(f, N, { yaw }))));
        if (re < 1) allPerfect = false;
        const o = over(h, f); worstErr = Math.max(worstErr, o);
        rows.push(`${name} ${re.toFixed(6)}/${(o * 100).toFixed(1)}%`);
    }
    ok(`*** reprojection IoU is EXACTLY 1.000000 on all ${rows.length} fixtures, whose volume errors span 0.0% to ${(worstErr * 100).toFixed(1)}% ***`,
        allPerfect && worstErr > 0.5,
        rows.join(", ") + " (IoU/volume error) -- a hull reprojects to its own inputs BY CONSTRUCTION, so this number was never at risk");
    // HELD-OUT CROSS-VALIDATION, the obvious repair, which does not repair it
    const heldYaw = Math.PI / 16 + 0.11, hout = [];
    let perfectHeldOut = 0;
    for (const [name, f] of Object.entries(S)) {
        const hf = asFn(hullOf(f, yaws));
        const v = maskIoU(silhouetteOf(hf, N, { yaw: heldYaw }), silhouetteOf(f, N, { yaw: heldYaw }));
        if (v >= 1) perfectHeldOut++;
        hout.push(`${name} ${v.toFixed(6)}`);
    }
    ok(`  and holding a view OUT does not repair it: ${perfectHeldOut} of ${hout.length} still score exactly 1.000000 against a view nobody carved from`,
        perfectHeldOut >= 3, hout.join(", ") + " -- it recovers some discretisation slack and none of the geometry");
    // and the score is the TREE's judge, not a private copy -- the tie-back mesh/lathe.mjs's gate also makes
    const m = silhouetteOf(S.cup, N, { yaw: 0 }), h2 = silhouetteOf(asFn(hullOf(S.cup, yaws)), N, { yaw: 0 });
    const viaJudge = judgeIoU(rgba(m, N), rgba(h2, N));
    ok("  *** and the number comes from render/silhouette.mjs ITSELF, not a private IoU ***",
        Math.abs(viaJudge.iou - maskIoU(m, h2)) < 1e-9,
        `the tree's own judge returns ${viaJudge.iou.toFixed(6)} against this gate's ${maskIoU(m, h2).toFixed(6)}`);
}

console.log("\n5. *** THE COUNTEREXAMPLE: NO FUNCTION OF THE SILHOUETTES CAN DETECT THE ERROR ***");
{
    const c = N / 2;
    const solidCube = (i, j, k) => Math.abs(i + 0.5 - c) < 12 && Math.abs(j + 0.5 - c) < 12 && Math.abs(k + 0.5 - c) < 12;
    let same = 0, tried = 0, worst = 1;
    for (const yaw of [0, 0.3, 0.7, 1.1, 1.5708, 2.0, 2.6, 3.0])
        for (const elev of [0, 0.4, 0.9, 1.3, 1.5708, -0.6]) {
            const a = silhouetteOf(S.sealed, N, { yaw, elev }), b = silhouetteOf(solidCube, N, { yaw, elev });
            tried++; if (a.every((v, i) => v === b[i])) same++;
            worst = Math.min(worst, maskIoU(a, b));
        }
    const cavity = volumeOf(solidCube, N) - volumeOf(S.sealed, N);
    ok(`*** a sealed cavity and a solid cube cast the IDENTICAL shadow on ${same} of ${tried} directions across yaw AND elevation, while their volumes differ by ${cavity} voxels ***`,
        same === tried && worst === 1 && cavity > 0,
        `worst IoU over the sweep ${worst.toFixed(6)}. Identical PICTURES, not similar ones -- so every function of the silhouettes, named or unnamed, returns the same value for both`);
    ok("  and the carve returns the solid cube for it, at any view count -- the error is the whole cavity and never moves",
        [2, 4, 8, 16, 32].every((v) => volumeOf(hullOf(S.sealed, turntable(v)), N) === volumeOf(solidCube, N)),
        `hull volume ${volumeOf(hullOf(S.sealed, turntable(32)), N)} against the solid cube's ${volumeOf(solidCube, N)} at every count tried`);
    report("mesh/lathe.mjs HAD such a number -- asymmetry, exactly 0 for a revolvable input against 0.91 for an " +
           "L-bracket. THIS ROUND WENT LOOKING FOR THE EQUIVALENT AND THE ANSWER IS THAT IT DOES NOT EXIST, which " +
           "is a stronger statement than not having found one. Detecting the cavity needs a signal that is not a " +
           "silhouette: depth, shading, or a prior. That is exactly what img2threejs's optional Depth-Anything " +
           "stage is for, and it is named here rather than quietly wished for.");
}

console.log("\n6. THE BLIND HOLE AND THE THROUGH HOLE: the same cylinder, and the whole difference");
{
    const topOf = (f) => ({ m: silhouetteOf(f, N, { yaw: 0, elev: Math.PI / 2 }), yaw: 0, elev: Math.PI / 2 });
    const cupAz = over(hullOf(S.cup, turntable(16)), S.cup), cupTop = over(hullOf(S.cup, turntable(16), N, [topOf(S.cup)]), S.cup);
    const tubeAz = over(hullOf(S.tube, turntable(16)), S.tube), tubeTop = over(hullOf(S.tube, turntable(16), N, [topOf(S.tube)]), S.tube);
    const areaCup = silhouetteOf(S.cup, N, { yaw: 0, elev: Math.PI / 2 }).reduce((a, b) => a + b, 0);
    const areaTube = silhouetteOf(S.tube, N, { yaw: 0, elev: Math.PI / 2 }).reduce((a, b) => a + b, 0);
    ok(`*** the TUBE goes ${(tubeAz * 100).toFixed(1)}% -> ${(tubeTop * 100).toFixed(1)}% when one top view is added, and the CUP goes ${(cupAz * 100).toFixed(1)}% -> ${(cupTop * 100).toFixed(1)}% ***`,
        Math.abs(tubeTop) < 1e-9 && tubeAz > 0.5 && cupTop > 0.5 && (cupAz - cupTop) < 0.05,
        "one view fixes the tube completely and buys the cup almost nothing -- and they are the same cylinder with the same bore");
    ok(`  and the MECHANISM is measured, not asserted: the tube's top shadow is an annulus of ${areaTube} pixels and the cup's is a disc of ${areaCup}, against a full disc's ${Math.round(Math.PI * 144)}`,
        areaTube < areaCup * 0.75 && Math.abs(areaCup - Math.PI * 144) < 12,
        "a cup has a FLOOR, so the ray down its axis hits material. What decides recoverability is not the size of the concavity but whether any ray passes CLEAN THROUGH it");
}

console.log("\n7. THE ROW-FILL EARNS NOTHING, WHICH IS WHY IT IS OFF");
{
    const gains = [];
    let anyGain = false;
    for (const [name, f] of Object.entries(S)) for (const yaw of [0, 0.7]) {
        const g = fillGain(f, N, { yaw }); if (g.added > 0) anyGain = true; gains.push(`${name}@${yaw}:+${g.added}`);
    }
    ok(`*** fillRows() adds EXACTLY ZERO pixels on all ${Object.keys(S).length} fixtures at two angles -- the gap it was written for does not occur ***`,
        !anyGain, gains.join(" ") + `. With n^3 centres landing in n^2 pixels there are about ${N} per pixel`);
    // AND IT IS NOT MERELY USELESS: it destroys the one shadow this round found to matter
    const raw = silhouetteOf(S.tube, N, { yaw: 0, elev: Math.PI / 2 });
    const filled = fillRows(Uint8Array.from(raw), N);
    ok("  and turning it on FILLS THE TUBE'S BORE: the annulus that made the tube exact becomes a disc",
        filled.reduce((a, b) => a + b, 0) > raw.reduce((a, b) => a + b, 0) * 1.5,
        `annulus ${raw.reduce((a, b) => a + b, 0)} pixels -> ${filled.reduce((a, b) => a + b, 0)} filled. It stays exported so the next person to reason their way to it gets this number instead`);
}

console.log("\n8. THE CLOSED FORM, AND THE BOUND THIS ROUND DOES NOT CLAIM");
{
    // TWO ORTHOGONAL VIEWS OF A SPHERE GIVE THE STEINMETZ BICYLINDER: 16 r^3 / 3 against the sphere's 4 pi r^3 / 3.
    const ratios = [32, 64, 96].map((n) => {
        const f = shapes(n).sphere;
        return volumeOf(carve([0, Math.PI / 2].map((yaw) => ({ m: silhouetteOf(f, n, { yaw }), yaw })), n), n) / volumeOf(f, n);
    });
    const gaps = ratios.map((r) => Math.abs(r - 4 / Math.PI));
    ok(`*** the sphere's two-view hull is the Steinmetz bicylinder, and the measured ratio walks in to 4/pi = ${(4 / Math.PI).toFixed(4)} as the grid refines ***`,
        gaps[0] > gaps[1] && gaps[1] > gaps[2] && gaps[2] < 0.005,
        `n=32 ${ratios[0].toFixed(4)}, n=64 ${ratios[1].toFixed(4)}, n=96 ${ratios[2].toFixed(4)}; gaps ${gaps.map((g) => g.toFixed(4)).join(" > ")}`);
    // AND THE ONE THAT IS NOT A BOUND. Two errors of opposite sign, neither dominant at all resolutions.
    const cross = [32, 64, 96].map((n) => {
        const f = shapes(n).cross;
        return (volumeOf(carve(turntable(32).map((yaw) => ({ m: silhouetteOf(f, n, { yaw }), yaw })), n), n) - volumeOf(f, n)) / volumeOf(f, n);
    });
    const HULL = 0.4;   // the cross's continuous convex hull: 448 against 320 in the plane, exactly 40%
    ok(`*** the discrete hull does NOT bound the CONTINUOUS one: the cross reads ${cross.map((c) => (c * 100).toFixed(1) + "%").join(", ")} at n = 32, 64, 96 against a convex hull of 40.0%, crossing it ***`,
        cross[0] < HULL && cross[2] > HULL,
        `"approaches from below" was written into mesh/carve.mjs's header on the strength of n=64 alone and deleted after n=96. A finite view set inflates the hull and a half-pixel shadow deflates it; neither wins everywhere`);
}

console.log("\n9. *** THE VOXEL THAT PROJECTS OFF THE EDGE -- the branch no fixture above ever reaches ***");
{
    const c = N / 2;
    // wide enough that its own corners swing past the border at 45 degrees; the fixtures above never do
    const wide = (i, j, k) => Math.abs(i + 0.5 - c) < 28 && Math.abs(j + 0.5 - c) < 12 && Math.abs(k + 0.5 - c) < 28;
    const yaws = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4];
    const offFrame = (f, yaw) => { let out = 0, tot = 0;
        for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (f(i, j, k)) { tot++;
            const p = project(i + 0.5, j + 0.5, k + 0.5, N, yaw);
            if (p.u < 0 || p.v < 0 || Math.floor(p.u) >= N || Math.floor(p.v) >= N) out++; }
        return { out, tot }; };
    const reach = offFrame(wide, Math.PI / 4), never = offFrame(S.cube, Math.PI / 4);
    ok(`*** the branch is REACHED at last: ${reach.out} of ${reach.tot} of this fixture's voxels project past the border at 45 degrees, where the cube's is ${never.out} of ${never.tot} ***`,
        reach.out > 0 && never.out === 0,
        "every fixture in sections 2 to 8 sits far enough inside the grid that the out-of-frame branch is dead code to them -- which is why flipping it went 0 red, and why this section exists");

    const views = yaws.map((yaw) => ({ m: silhouetteOf(wide, N, { yaw }), yaw }));
    const truth = gridOf(wide, N);
    const keep = carve(views, N), clear = carve(views, N, { outside: "clear" });
    const oKeep = (volumeOf(keep, N) - volumeOf(wide, N)) / volumeOf(wide, N);
    const oClear = (volumeOf(clear, N) - volumeOf(wide, N)) / volumeOf(wide, N);
    ok(`*** and it decides the BOUND: keeping an unseen voxel contains the object (${(oKeep * 100).toFixed(1)}% over) and clearing it does NOT (${(oClear * 100).toFixed(1)}%) ***`,
        contains(keep, truth) && !contains(clear, truth) && oClear < 0 && oKeep >= 0,
        `keep contains=${contains(keep, truth)}, clear contains=${contains(clear, truth)}. A carve INTERSECTS CONSTRAINTS, and a pixel off the edge is not a pixel saying "empty" -- it is a view with nothing to say. THE FIRST VERSION OF THIS FILE CLEARED, with an argument beside it that read perfectly well and had never been run`);
    report("THE COST OF KEEPING IS REAL AND IS NOT HIDDEN: the hull now extends to the grid's edge in any direction " +
           "no view constrained, so a badly framed capture yields a hull as big as the grid rather than a tight and " +
           "WRONG one. That is what 'we did not look there' ought to look like, and it is the trade this default makes.");
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. Every number below was produced by running it.
//   A  the out-of-frame branch flipped to CLEAR (which is what this file shipped with) -> exit=1, 1 red, section 9:
//      the wide fixture's hull comes back 7.0% SMALLER than the object and containment fails. *** THIS SABOTAGE
//      WENT 0 RED ON ITS FIRST RUN AND THAT WAS THE FINDING -- AND THEN IT TURNED OUT TO BE THE FIX. *** No
//      fixture in sections 2 to 8 has a single voxel that projects past the border, so the branch was dead code
//      and its written-down justification had never been executed by anything. Given a fixture that reaches it,
//      the justification is wrong: a pixel off the edge is a view with nothing to say, not a view saying "empty".
//      The default is now KEEP, section 9 exists to reach the branch, and the sabotage costs 1 red.
//   B  silhouetteOf() marks the pixel the voxel's INDEX lands in rather than its CENTRE, so the shadow and the
//      carve stop being exact duals by half a pixel -> exit=1, 6 red, and it is the widest failure in the file:
//      containment holds on only 11 of 36 pairs, the least over-estimate goes to -1.0%, and REPROJECTION IoU
//      FALLS FROM 1.000000 TO 0.920000 -- the number section 4 says was never at risk is at risk the moment the
//      duality breaks. This is the fault the first draft shipped (a ray march down pixel centres against a
//      centre-tested carve, cube at -0.7%), reproduced from the other side.
//   C  turntable() spread over a FULL turn instead of a half -> exit=1, 1 red. The half turn is not tidiness: a
//      silhouette at yaw and at yaw+PI are the same picture, so a full turn spends half its views on duplicates,
//      and the sealed void's hull stops matching the solid cube at the counts section 5 checks.
//   D  the elevation term dropped from project(), so every view is horizontal -> exit=1, 6 red: the round trip in
//      section 1 goes to 5.0e+1, the tube's "annulus" reads 576 pixels against its side view's 576 at IoU 1.0000,
//      and the tube stays 90.0% over with a top view added. Everything sections 3 and 6 claim about WHERE a view
//      is taken from runs through this one term.
//   E  (a FIXTURE sabotage) the sealed cavity moved to touch a face, making it a blind pocket rather than a sealed
//      void -> 0 RED, AND IT IS THE CLAIM CONFIRMING ITSELF RATHER THAN A CHECK PROVING NOTHING. A pocket open at
//      the top is still invisible: the ray down into it hits the material beneath, exactly as the cup's floor
//      does. What breaks section 5's counterexample is not moving the cavity to the surface but drilling it
//      CLEAN THROUGH -- and that object is the tube, which section 6 measures differing from its solid twin.
//      Recorded as measured rather than dressed up as a catch.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: A REAL PHOTOGRAPH, exactly as mesh/lathe.mjs's gate says of itself. Every silhouette above " +
    "is computed from a solid this file defines, so nothing has met the segmentation problem -- getting a clean occupancy " +
    "mask off a photograph is what img2threejs stages 1 and 2 spend most of their effort on, and this round assumes it " +
    "solved. HOW MUCH a wrong mask costs is not measured either: the carve's error is one-signed against a TRUE shadow, " +
    "and a shadow that is too small carves away real material, so the bound does not survive segmentation error and " +
    "nothing here says by how much. Also unwired: no page in this tree calls mesh/carve.mjs, so the judge and both " +
    "sculptors still meet only inside gates. And the carve is n^3 per view in JavaScript -- 262k voxels times 16 views " +
    "here -- which was a compute pass wanting to happen and IS ONE at v4372 -- render/carveTsl.mjs, graded against this module voxel for voxel in tools/ship/carveGpu-selfcheck.mjs. What is still not measured is whether it is FASTER: the sandbox device is SwiftShader, so a timing here would clock a CPU pretending to be a GPU.");
process.exit(fails ? 1 : 0);
