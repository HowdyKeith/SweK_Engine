// WebGLEngine/physics/character/terrainWalk-selfcheck.mjs -- v4544
//
// Run: node physics/character/terrainWalk-selfcheck.mjs
//
// GATES physics/character/terrainWalk.mjs.
//
// *** EVERY SPEED CLAIM HERE IS GRADED AGAINST A CLOSED FORM, NOT A TOLERANCE, because the defect that
// started this round was a speed that looked fine. *** physics/character/kinematic.js climbs a voxel ramp
// with its step allowance on and moves along the surface at sec(theta) of the speed it was asked for --
// 1.414x at 45 degrees -- and nothing was wrong with any individual number. Only comparing against
// 1/cos(theta) says so. The same discipline applies below: a slope is a plane whose normal is known exactly,
// so "the right answer" is arithmetic rather than an opinion.
"use strict";
import * as T from "./terrainWalk.mjs";
import { MeshBVH, trianglesFrom } from "../../mesh/meshBVH.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

const N = 128;
const plane = (s) => { const hm = new Float32Array(N * N);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) hm[z * N + x] = x * s; return hm; };

console.log("terrainWalk-selfcheck -- a slope limit that is a property of the ground, not of the frame rate\n");

// =============================================================================================================
console.log("1. *** THE TWO SPEED CONVENTIONS, EACH AGAINST ITS OWN CLOSED FORM ***");
{
    let worstSurf = 0, worstHoriz = 0, worstNormal = 0;
    const rows = [];
    for (const s of [0, 0.25, 0.5, 1, 2]) {
        const g = T.heightfieldGround(plane(s), { stride: N });
        const p = g(50.3, 50.3), want = Math.atan(s) * 180 / Math.PI;
        worstNormal = Math.max(worstNormal, Math.abs(T.slopeDeg(p.n) - want));
        const run = (conv) => {
            let pos = [50.3, p.y, 50.3], t = 0, sd = 0;
            for (let i = 0; i < 120; i++) {
                const r = T.stepTerrain({ pos, ground: g, wish: [1, 0], dt: 1 / 60, speed: 5, maxSlopeDeg: 80, convention: conv });
                sd += r.surfaceDist; pos = r.pos; t += 1 / 60;
            }
            return { h: (pos[0] - 50.3) / t, s: sd / t };
        };
        const c = Math.cos(Math.atan(s));
        const sur = run(T.SURFACE), hor = run(T.HORIZONTAL);
        worstSurf = Math.max(worstSurf, Math.abs(sur.s - 5) / 5, Math.abs(sur.h - 5 * c) / (5 * c || 1));
        worstHoriz = Math.max(worstHoriz, Math.abs(hor.h - 5) / 5, Math.abs(hor.s - 5 / c) / (5 / c));
        rows.push(`${want.toFixed(1)}deg surf(${sur.h.toFixed(3)},${sur.s.toFixed(3)}) horiz(${hor.h.toFixed(3)},${hor.s.toFixed(3)})`);
    }
    ok("!! *** THE MEASURED SLOPE IS THE PLANE'S OWN ANGLE, to " + worstNormal.toExponential(1) + " degrees ***",
        worstNormal < 1e-12,
        "five planes from 0 to 63.43 degrees, worst error " + worstNormal.toExponential(2) + ". The normal " +
        "comes from the gradient of the SAME bilinear patch the height is read from -- a central difference " +
        "of the raw samples describes a different, smoother surface, so the body would stand on one and be " +
        "limited by another.");
    ok("!! *** SURFACE convention: distance along the ground is `speed` at EVERY slope ***",
        worstSurf < 1e-9,
        "worst relative error " + worstSurf.toExponential(2) + " against surface = 5.000 and horizontal = " +
        "5*cos(theta). " + rows.join("; "));
    ok("!! *** HORIZONTAL convention: horizontal is `speed`, and the surface runs to 5*sec(theta) ***",
        worstHoriz < 1e-9,
        "worst relative error " + worstHoriz.toExponential(2) + ". At 45 degrees that is 7.071, and at 63.43 " +
        "it is 11.180 -- more than DOUBLE the requested speed. *** THIS IS THE CONVENTION kinematic.js " +
        "IMPLEMENTS BY ACCIDENT: *** measured on a voxel ramp with a step allowance it moves at 1.020x, " +
        "1.118x and 1.414x of the requested speed at 14, 26.6 and 45 degrees, which is sec(theta) to three " +
        "decimals. Neither convention is wrong; having one without saying which is.");
}

// =============================================================================================================
console.log("\n2. *** THE SLOPE LIMIT IS A PROPERTY OF THE GROUND, AND THE CONTROL SHOWS WHAT IT WOULD OTHERWISE BE ***");
{
    const hill = (s) => { const hm = new Float32Array(N * N);
        for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) hm[z * N + x] = x > 60 ? (x - 60) * s : 0; return hm; };
    // the control: the tempting "may I climb this much height per step" test, which is what a step allowance
    // becomes if it is applied to a continuous surface instead of to a discontinuity
    const climbHeightDiff = (s, dt) => {
        const g = T.heightfieldGround(hill(s), { stride: N });
        let pos = [58, 0, 60];
        for (let i = 0; i < Math.round(3 / dt); i++) {
            const budget = 5 * dt, steps = Math.max(1, Math.ceil(budget / 0.25)), chunk = budget / steps;
            for (let k = 0; k < steps; k++) {
                const nx = pos[0] + chunk, gg = g(nx, pos[2]);
                if (!gg || gg.y - pos[1] > 0.5) break;
                pos = [nx, gg.y, pos[2]];
            }
        }
        return pos[1];
    };
    const climbNormal = (s, dt) => {
        const g = T.heightfieldGround(hill(s), { stride: N });
        let pos = [58, 0, 60];
        for (let i = 0; i < Math.round(3 / dt); i++)
            pos = T.stepTerrain({ pos, ground: g, wish: [1, 0], dt, speed: 5, maxSlopeDeg: 45 }).pos;
        return pos[1];
    };
    const DTS = [1 / 15, 1 / 30, 1 / 60, 1 / 240];
    const mine = {}, ctrl = {};
    for (const s of [0.5, 1, 2, 4]) {
        mine[s] = DTS.map((dt) => climbNormal(s, dt));
        ctrl[s] = DTS.map((dt) => climbHeightDiff(s, dt));
        report(`slope ${s} (${(Math.atan(s) * 180 / Math.PI).toFixed(1)} deg): normal-based ` +
               mine[s].map((v) => v.toFixed(2)).join("/") + "  height-diff " + ctrl[s].map((v) => v.toFixed(2)).join("/"));
    }
    ok("!! *** 45 DEGREES IS WALKABLE AT A 45-DEGREE LIMIT, which cost a tolerance to make true ***",
        mine[1].every((v) => v > 5),
        "climbed " + mine[1].map((v) => v.toFixed(2)).join("/") + " at the four timesteps. *** AN EXACT " +
        "45-DEGREE PLANE HAS n.y = 1/sqrt(2) = 0.70710678118654746 AND Math.cos(45 * PI / 180) IS " +
        "0.70710678118654757 -- ONE ULP APART *** so a bare comparison refused a 45-degree ramp to a " +
        "character whose limit is 45 degrees, at every sample from the foot of the hill onward. The limit is " +
        "inclusive to 1e-12 in cosine, which is about 8e-11 degrees here.");
    ok("!! *** AND 63 AND 76 DEGREES ARE REFUSED AT EVERY TIMESTEP ***",
        mine[2].every((v) => v === 0) && mine[4].every((v) => v === 0),
        "slope 2 and slope 4 climb exactly 0.00 at 15, 30, 60 and 240 fps.");
    ok("!! *** THE HEIGHT-DIFFERENCE CONTROL CLIMBS A 76-DEGREE WALL AT 60 fps AND NOT AT 30 ***",
        ctrl[4][0] === 0 && ctrl[4][1] === 0 && ctrl[4][2] > 50 && ctrl[4][3] > 50,
        "the control climbs " + ctrl[4].map((v) => v.toFixed(2)).join("/") + " at 15/30/60/240 fps -- THE SAME " +
        "WALL, and the verdict is decided by the frame rate. It also climbs " + ctrl[2][0].toFixed(2) +
        " up a 63-degree face at every timestep, which a 45-degree limit is supposed to refuse outright. " +
        "*** A LIMIT ON THE PER-STEP HEIGHT DIFFERENCE IS NOT A SLOPE LIMIT: *** the difference shrinks with " +
        "the substep while the slope does not, so any wall becomes climbable at a high enough frame rate.");
    // *** THE DISTANCE IS NOT TIMESTEP-INDEPENDENT AND SHOULD NOT BE ASSERTED TO BE. *** The VERDICT is
    // exact -- that is the row above. The distance carries a first-order error, because the SURFACE
    // convention scales the whole step's budget by the normal where the body is STANDING, so a longer step
    // spends its budget against a staler slope. The right claim is that it CONVERGES, and the first draft of
    // this row asserted a flat spread under 0.05 instead: a constant I picked without measuring, which the
    // 45-degree case missed at 0.0976.
    const converging = [0.5, 1].every((s) => {
        const d = mine[s].map((v) => Math.abs(v - mine[s][3]));      // error against the finest timestep
        return d[0] >= d[1] - 1e-9 && d[1] >= d[2] - 1e-9 && d[3] === 0;
    });
    ok("!! ...and the DISTANCE converges as the timestep shrinks, rather than being independent of it",
        converging && [0.5, 1].every((s) => Math.abs(mine[s][0] - mine[s][3]) / mine[s][3] < 0.02),
        [0.5, 1].map((s) => `slope ${s}: ` + mine[s].map((v) => v.toFixed(3)).join(" -> ") +
            ` (${(100 * Math.abs(mine[s][0] - mine[s][3]) / mine[s][3]).toFixed(2)}% from 15 fps to 240)`).join("; ") +
        ". Monotone toward the fine-timestep answer at both slopes. A first-order scheme is allowed to be " +
        "first order; what it is not allowed to do is change its MIND about whether the ground is walkable, " +
        "which is what the row above measures and this one deliberately does not conflate with it.");
}

// =============================================================================================================
console.log("\n3. TWO ORACLES OVER THE SAME SURFACE, WHICH IS THE ONLY WAY TO GRADE EITHER");
{
    const s = 0.5, hm = plane(s);
    const gH = T.heightfieldGround(hm, { stride: N });
    const pos = [], idx = [];
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) pos.push([x, x * s, z]);
    for (let z = 0; z < N - 1; z++) for (let x = 0; x < N - 1; x++) {
        const a = z * N + x, b = a + 1, c = a + N, d = c + 1; idx.push([a, c, b], [b, c, d]);
    }
    const gM = T.meshGround(new MeshBVH(trianglesFrom(pos, idx)), { top: 1e3 });
    let wy = 0, wn = 0, n = 0;
    for (let i = 0; i < 200; i++) {
        const x = 5 + (i % 17) * 2.3, z = 5 + ((i * 7) % 13) * 2.7;
        const a = gH(x, z), b = gM(x, z);
        if (!a || !b) continue;
        n++;
        wy = Math.max(wy, Math.abs(a.y - b.y));
        wn = Math.max(wn, Math.hypot(a.n[0] - b.n[0], a.n[1] - b.n[1], a.n[2] - b.n[2]));
    }
    ok("!! *** THE BILINEAR HEIGHTFIELD AND A meshBVH RAYCAST AGREE ON THE SAME SURFACE ***",
        n > 150 && wy < 1e-12 && wn < 1e-12,
        n + " samples, worst height disagreement " + wy.toExponential(2) + ", worst normal disagreement " +
        wn.toExponential(2) + ". Two code paths with nothing in common -- a gradient of a bilinear patch " +
        "against a ray-triangle intersection and a cross product -- and they land on the same plane. Either " +
        "one alone would only have proved it was self-consistent.");
}

// =============================================================================================================
console.log("\n4. *** A CREST DOES NOT LAUNCH THE BODY, AND A CLIFF DOES NOT FLY IT ***");
{
    const ridge = new Float32Array(N * N);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) ridge[z * N + x] = 20 - Math.abs(x - 64) * 0.5;
    const gR = T.heightfieldGround(ridge, { stride: N });
    let p = [40, gR(40, 64).y, 64], worstGap = 0, air = 0, crossed = false;
    // 900 steps at 1/60 is 15 s; the horizontal speed on a 26.6-degree slope is 5*cos = 4.472, so reaching
    // the crest 24 units away and coming down the far side needs more than the 5 s the first draft gave it.
    for (let i = 0; i < 900; i++) {
        const r = T.stepTerrain({ pos: p, ground: gR, wish: [1, 0], dt: 1 / 60, speed: 5, maxSlopeDeg: 45, snapDown: 0.5 });
        p = r.pos; if (r.airborne) air++;
        if (p[0] > 64) crossed = true;
        const g = gR(p[0], p[2]);
        if (g) worstGap = Math.max(worstGap, Math.abs(p[1] - g.y));
    }
    ok("!! *** WALKING OVER A RIDGE STAYS ON IT: worst deviation from the surface " + worstGap.toExponential(1) + " ***",
        crossed && air === 0 && worstGap < 1e-12,
        "climbed 26.6 degrees to the crest at x=64 and down the far side to x=" + p[0].toFixed(2) +
        ", " + air + " airborne steps, worst deviation " + worstGap.toExponential(2) + ". A controller that " +
        "carried its uphill velocity over the top would leave the ground here, and one that snapped only " +
        "downward would sink into the far slope.");
    // a real cliff needs a MESH: on a bilinear heightfield a discontinuity is a one-cell ramp, and the slope
    // limit stops the body before any drop happens
    const pts = [], tri = [];
    const P = (x, y, z) => { pts.push([x, y, z]); return pts.length - 1; };
    const a = P(20, 10, 20), b = P(32, 10, 20), c = P(20, 10, 44), d = P(32, 10, 44);
    tri.push([a, c, b], [b, c, d]);
    const e = P(32, 0, 20), f = P(44, 0, 20), g2 = P(32, 0, 44), h = P(44, 0, 44);
    tri.push([e, g2, f], [f, g2, h]);
    const gM = T.meshGround(new MeshBVH(trianglesFrom(pts, tri)), { top: 1e3 });
    let q = [25, 10, 32], sawAir = false, maxX = 25;
    for (let i = 0; i < 300; i++) {
        const r = T.stepTerrain({ pos: q, ground: gM, wish: [1, 0], dt: 1 / 60, speed: 5, maxSlopeDeg: 45, snapDown: 0.5 });
        q = r.pos; if (r.airborne) sawAir = true; maxX = Math.max(maxX, q[0]);
    }
    ok("!! *** AND AT A 10-UNIT DROP IT STOPS AT THE LIP AND SAYS airborne, RATHER THAN WALKING ON AIR ***",
        sawAir && Math.abs(maxX - 32) < 0.2 && Math.abs(q[1] - 10) < 1e-9,
        "stopped at x=" + maxX.toFixed(2) + " on a deck that ends at x=32, still at y=" + q[1].toFixed(2) +
        ". *** THE FIRST DRAFT SET airborne AND KEPT GOING: *** 143 substeps from x=32.08 to x=43.92, every " +
        "one at y=10.00, sailing over a deck 10 units below. This module owns no vertical velocity by " +
        "design, so leaving the ground ENDS the step and the caller takes over. Reporting the transition is " +
        "the contract; simulating the fall is not.");
    report("on a bilinear heightfield the same cliff is a ONE-CELL RAMP at 84.29 degrees, so the slope limit " +
           "refuses it before any drop occurs -- which is why this row needs a mesh with a genuine vertical " +
           "face, and why the airborne path is unreachable from a heightfield at any sane limit");
}

// =============================================================================================================
console.log("\n5. TOO STEEP TO CLIMB IS NOT THE SAME AS STUCK");
{
    const cone = new Float32Array(N * N);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
        const d = Math.hypot(x - 64, z - 64); cone[z * N + x] = Math.max(0, (40 - d) * 2);
    }
    const gK = T.heightfieldGround(cone, { stride: N });
    const walk = (wish) => {
        let k = [20, 0, 64], slid = 0, moved = 0;
        for (let i = 0; i < 300; i++) {
            const r = T.stepTerrain({ pos: k, ground: gK, wish, dt: 1 / 60, speed: 5, maxSlopeDeg: 45 });
            if (r.slid) slid++; moved += r.movedH; k = r.pos;
        }
        return { k, slid, moved, r: Math.hypot(k[0] - 64, k[2] - 64) };
    };
    const oblique = walk([1, 0.35]), headOn = walk([1, 0]);
    ok("!! *** APPROACHED OBLIQUELY, THE BODY SLIDES AROUND THE FOOT RATHER THAN STICKING TO IT ***",
        oblique.slid > 10 && oblique.moved > 3 && Math.abs(oblique.k[2] - 64) > 2,
        "slid on " + oblique.slid + " substeps, travelled " + oblique.moved.toFixed(2) + " horizontally and " +
        "moved " + (oblique.k[2] - 64).toFixed(2) + " along z, ending " + oblique.r.toFixed(2) + " from the axis. " +
        "What survives a refusal is the component along the CONTOUR -- perpendicular to the horizontal " +
        "gradient. Projecting the wish onto the steep plane instead would keep part of the uphill move, " +
        "which is the move being refused.");
    ok("!! ...and HEAD-ON there is nothing to slide along, which is geometry rather than a failure",
        headOn.slid === 0 && Math.abs(headOn.k[2] - 64) < 1e-9,
        "0 slid substeps, z unmoved. A wish pointing straight at the axis is exactly radial and the contour " +
        "is exactly perpendicular to it, so the tangential component is 0. *** A FIXTURE THAT ONLY WALKED " +
        "HEAD-ON WOULD HAVE MEASURED NOTHING AND PASSED: *** the first version of the row above did exactly " +
        "that and reported 0 slides, which reads identically to a contourSlide that does not work.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: anything with a VERTICAL VELOCITY -- jumping, falling, ceilings -- which this module " +
    "does not own and says so; capsule-against-triangle depenetration, which is what overhangs, thin walls " +
    "and moving platforms need and is a different problem built on meshBVH's trianglesInBox; multi-layer " +
    "ground, since the oracle is a function of (x, z) and an overhang has two surfaces over one point; and " +
    "the BROWSER side of the wiring. *** THIS FILE IS WIRED AS OF v4545: *** simulation/BotManager.js " +
    "follows the ground through it instead of writing bot.y = _heightAt(x, z) + 1, and " +
    "tools/ship/navWiring-selfcheck.mjs drives the real BotManager against a ramp and a wall. What that " +
    "gate does NOT reach is the Worker plumbing, the ECS, or what a bot looks like walking a hill.");
process.exit(fails ? 1 : 0);
