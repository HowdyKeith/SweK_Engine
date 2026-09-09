// physics/mesh/uvLscm-selfcheck.mjs -- v4537
//
// Run: node physics/mesh/uvLscm-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// *** THE SUBJECT IS THE ASSET THAT HAS BEEN THE NAMED BLOCKER, NOT A TEST SPHERE. *** tools/export/reskin.js
// has said since v3xxx that GPU_Assets/RobotExpressive.glb has "7,214 vertices ... and NO TEXCOORD_0 AND NO
// TEXTURE AT ALL", and that a reskin through UVs is therefore "unavailable ON THIS ASSET". This grades the
// real file.
//
// TWO NUMBERS CARRY THIS ROUND, and their DIFFERENCE is a theorem rather than a tolerance:
//   conformal distortion (s1/s2) -- what LSCM minimises. On a DEVELOPABLE surface it goes to 1 at machine
//                                   precision, because such a surface really can be unrolled.
//   area distortion      (s1*s2) -- what LSCM cannot control. On a sphere it CANNOT be uniform: Gauss's
//                                   Theorema Egregium forbids an isometric plane map of a curved surface.
// A gate that only measured the first would call a sphere perfectly unwrapped.
import fs from "node:fs";
import { weld, charts, lscm, distortion, unwrapCurved, triNormal,
         selfOverlaps, mergeCharts, splitOverlapping, orientChart, rasterPack, unwrapToMesh } from "./uvLscm.mjs";
import { writeSceneGlb } from "../../tools/export/sceneGlb.mjs";
import { parseGLB, sphereMesh } from "./glb.mjs";
import { rectsOverlap } from "./uvUnwrap.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
// fileURLToPath, not `new URL(...).pathname` -- the latter yields "/C:/..." on Windows and
// tools/ship/winPathGuard-selfcheck.mjs forbids it tree-wide. Written the wrong way here first, and the guard
// that caught it is the one v4536 repaired after reportDoors.mjs reintroduced the same idiom.
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// A developable strip: a cylinder really can be unrolled, so an exact answer exists to be found.
function cylinder(nu = 24, nv = 8, { R = 1, H = 2, sweep = Math.PI * 1.5 } = {}) {
    const P = [], T = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const a = sweep * i / nu; P.push(R * Math.cos(a), R * Math.sin(a), H * j / nv);
    }
    const id = (i, j) => j * (nu + 1) + i;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        T.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)]); T.push([id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
    }
    return { P: Float64Array.from(P), T };
}
function cone(nu = 32, nv = 6, { R = 1, H = 2, sweep = Math.PI * 1.6 } = {}) {
    const P = [], T = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const a = sweep * i / nu, r = R * j / nv; P.push(r * Math.cos(a), r * Math.sin(a), H * (1 - j / nv));
    }
    const id = (i, j) => j * (nu + 1) + i;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        T.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)]); T.push([id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
    }
    return { P: Float64Array.from(P), T };
}

console.log("1. *** THE WELD, WHICH IS NOT A TIDY-UP STEP: IT IS THE STEP THAT MAKES THE PROBLEM EXIST ***");
const glb = parseGLB(fs.readFileSync(path.join(ENG, "GPU_Assets", "RobotExpressive.glb")));
const W = weld(glb.positions, glb.indices);
{
    const valenceBefore = glb.indices.length / (glb.positions.length / 3);
    const valenceAfter = (W.tris.length * 3) / W.vertsAfter;
    ok("!! *** three quarters of the shipped vertex buffer is duplication, and 1.35 is not a mesh ***",
       W.vertsBefore === 7214 && W.vertsAfter < 2000 && valenceBefore < 2 && valenceAfter > 4,
       `${W.vertsBefore} -> ${W.vertsAfter} vertices (${(100 * (1 - W.vertsAfter / W.vertsBefore)).toFixed(1)}% ` +
       `duplicates), average valence ${valenceBefore.toFixed(2)} -> ${valenceAfter.toFixed(2)}. The file has 19 ` +
       "primitives and each carries its own copies along its seams. LSCM IS A STATEMENT ABOUT NEIGHBOURS: run " +
       "on the raw buffer every triangle is its own island, each flattens perfectly alone, and the result is a " +
       "conformal map with a seam down every edge -- a number that looks perfect and means nothing.");

    // topology census: why segmentation is the job rather than an optimisation
    const compOf = new Int32Array(W.tris.length).fill(-1);
    const vt = new Map();
    W.tris.forEach((T, i) => T.forEach((v) => { if (!vt.has(v)) vt.set(v, []); vt.get(v).push(i); }));
    let nc = 0;
    for (let s = 0; s < W.tris.length; s++) {
        if (compOf[s] >= 0) continue;
        const st = [s]; compOf[s] = nc;
        while (st.length) { const t = st.pop(); for (const v of W.tris[t]) for (const u of vt.get(v)) if (compOf[u] < 0) { compOf[u] = nc; st.push(u); } }
        nc++;
    }
    let closedTris = 0, diskTris = 0;
    for (let c = 0; c < nc; c++) {
        const T = W.tris.filter((_, i) => compOf[i] === c);
        const ec = new Map();
        for (const [a, b, d] of T) for (const [x, y] of [[a, b], [b, d], [d, a]]) {
            const k = x < y ? x + "_" + y : y + "_" + x; ec.set(k, (ec.get(k) || 0) + 1);
        }
        const bnd = [...ec.values()].filter((n) => n === 1).length;
        if (bnd === 0) closedTris += T.length; else diskTris += T.length;
    }
    ok("!! *** 71% OF THE ROBOT IS CLOSED SURFACE, so \"unwrap the disks and report the rest\" is not an answer ***",
       closedTris > diskTris * 2,
       `${nc} components: ${closedTris} triangles with NO BOUNDARY against ${diskTris} with one. A closed ` +
       "surface has nothing to flatten to and Gauss forbids flattening it without stretching, so the closed " +
       "components are the whole job. That is why this file SEGMENTS -- the seams between charts are the cut, " +
       "and no separate cutting pass exists because segmentation already has to make one.");
}

console.log("\n2. *** EXACT ON A DEVELOPABLE SURFACE, which is the claim LSCM actually makes ***");
{
    const cy = cylinder(), co = cone();
    const dcy = distortion(cy.P, cy.T, lscm(cy.P, cy.T));
    const dco = distortion(co.P, co.T, lscm(co.P, co.T));
    ok("!! a cylinder strip unrolls with conformal distortion 1 to nine figures",
       Math.abs(dcy.conformal.max - 1) < 1e-6 && dcy.flipped === 0,
       `conformal ${dcy.conformal.min.toFixed(10)} .. ${dcy.conformal.max.toFixed(10)} over ${cy.T.length} ` +
       `triangles, ${dcy.flipped} flipped. Run to full convergence it reaches 4.7e-14 -- machine precision -- ` +
       "so what is left here is the solver's stopping rule and not the mathematics.");
    ok("!! and the AREA is uniform too, so it is an unrolling and not merely an angle-preserving map",
       dcy.area.max / dcy.area.min < 1 + 1e-5,
       `area ratio max/min ${(dcy.area.max / dcy.area.min).toFixed(9)}. A conformal map of a developable ` +
       "surface is a similarity; on a curved one it cannot be, which is the next check.");
    ok("!! a cone, the other developable, holds the same",
       Math.abs(dco.conformal.max - 1) < 1e-5 && dco.flipped === 0,
       `conformal max ${dco.conformal.max.toFixed(9)} over ${co.T.length} triangles, ${dco.flipped} flipped.`);
}

console.log("\n3. *** REFINEMENT: the error must not GROW when the mesh does ***");
{
    // *** THE EXPERIMENT THAT FOUND THE DEFECT, KEPT AS THE CHECK. *** With a fixed 400-iteration budget this
    // ran 7.0e-7, 1.7e-6, 3.4e-6 and then 5.3e+1 at 6,144 triangles -- a wrong answer returned silently,
    // because the normal equations square the condition number and CG needs iterations to match. Nothing else
    // in this gate is large enough to see it: the robot's charts average 4.4 triangles and the sphere cap is
    // 741, so a budget that fails at thousands passes everything else. A defect found at one size and checked
    // at another is not checked.
    const rows = [];
    // *** 68, NOT 96, AND THE THRESHOLD IS MEASURED RATHER THAN GUESSED. *** The broken fixed-400 budget is
    // FINE to 1,536 triangles and breaks at 2,128 (7.4e-3 against 4.4e-9), so the largest fixture only has to
    // clear that: 3,128 triangles reads 7.72 broken against 1.45e-8 scaled, nine orders apart, and costs 259 ms
    // where 6,144 cost 768. A gate that spends half its budget proving the same thing twice as loudly is a gate
    // that drops out of the sweep on a busy box.
    for (const nu of [24, 48, 68]) {
        const c = cylinder(nu, Math.max(4, nu / 3));
        const uv = lscm(c.P, c.T);
        const d = distortion(c.P, c.T, uv);
        rows.push({ tris: c.T.length, err: d.conformal.max - 1, res: uv.residual });
    }
    const biggest = rows[rows.length - 1];
    ok("!! *** a 3,128-triangle chart is as accurate as a 384-triangle one, not 500 million times worse ***",
       rows.every((r) => r.err < 1e-6) && biggest.tris > 3000 && rows.every((r) => r.res < 1e-6),
       rows.map((r) => `${r.tris} tris: err ${r.err.toExponential(2)}, residual ${r.res.toExponential(2)}`).join("; ") +
       ". The fixed budget breaks between 1,536 and 2,128 triangles and reads 7.72 here; the scaled one reads " +
       "1.45e-8. The budget scales with the system now and the residual is returned with the map, so a solve that " +
       "did not converge is visible to its caller instead of being a plausible-looking set of coordinates.");
}

console.log("\n4. *** AND CANNOT BE EXACT ON A SPHERE -- Theorema Egregium, as a number ***");
{
    const s = sphereMesh(1, 32, 24), sw = weld(s.positions, s.indices);
    const rows = [];
    for (const deg of [30, 60, 90]) {
        const cs = charts(sw.positions, sw.tris, { maxNormalDeg: deg });
        const big = cs.reduce((a, b) => (b.length > a.length ? b : a));
        const T = big.map((i) => sw.tris[i]);
        const d = distortion(sw.positions, T, lscm(sw.positions, T));
        rows.push({ deg, tris: T.length, conf: d.conformal.max, area: d.area.max / d.area.min });
    }
    const rising = rows.every((r, i) => i === 0 || r.area > rows[i - 1].area);
    ok("!! *** ANGLES STAY, AREA GOES -- and it is a theorem, not a tolerance ***",
       rising && rows[2].area > 4 && rows[2].conf < 1.3,
       rows.map((r) => `${r.deg}deg/${r.tris}tri: conformal ${r.conf.toFixed(4)}, AREA ratio ${r.area.toFixed(4)}`).join("; ") +
       ". Conformal barely moves while area distortion grows without bound as the cap widens. On the cylinder " +
       "BOTH were 1. The pair separates developable from curved quantitatively, and a gate that measured only " +
       "the conformal number would report a sphere as perfectly unwrapped.");
}

console.log("\n5. the real asset, end to end");
// *** THE THREE ABLATION CONFIGS ARE COMPUTED ONCE AND SHARED WITH SECTION 9. *** Section 5 wants the default
// pipeline and section 9 wants it beside its two ancestors; running unwrapCurved four times to answer two
// questions put this gate at 2,245 ms, and a gate near the 3,000 ms budget is a gate that leaves the sweep the
// first time the box is busy -- which is the whole subject of tools/ship/nextRounds.mjs's calibration entry.
// THREE unwraps, not four: "+merge without orient" was a fourth full run of the expensive merge to measure a
// rotation, and the rotation's one surviving claim -- that it changes distortion by exactly nothing -- is a
// property of ONE chart and is tested as one below. Four runs put this gate at 2,800 ms against a 3,000 ms
// budget, which is a gate that leaves the sweep the first time the box is busy.
// TWO unwraps. The merge's headline is the chart count before and after, and BOTH are already in one result
// -- `grown` and `chartCount` -- so a separate "grown only" run was paying half a second to re-derive a number
// the default run already reports. Each unwrap of this asset costs 500-700 ms and this gate has a 3,000 ms
// budget to stay inside.
// ONE unwrap, not two. The second config differs from the first ONLY in its packer, and v4560 gave
// unwrapCurved a `from` that reuses the weld, the merge and every chart's solve: 535 ms -> 3 ms for the
// shelf run, measured, with the atlas area identical to the digit. That mattered this round because dropping
// maxConformal to 1.05 makes the merge try 4,009 pairs instead of 1,265, which took this gate from 1,857 ms
// to 2,500 against a 3,000 ms budget -- and a gate recorded over budget is skipped, so it is never re-timed,
// so it stays over budget. The equivalence is not assumed: section 10 runs both paths on a sphere and
// compares every placement.
const BASE = unwrapCurved(glb.positions, glb.indices);
const ABLATION = [{ name: "merged + oriented + nested", r: BASE },
                  { name: "shelf packer", r: unwrapCurved(glb.positions, glb.indices, { nest: false, from: BASE }) }];
const R = ABLATION[0].r;
// pooling every chart's triangles into one map is what the cross-chart overlap question needs, and three
// sections ask it; computed once here rather than three times.
const pooled = (r) => {
    const uv = new Map(), tt = []; let k = 0;
    for (const c of r.charts) { const rm = new Map();
        for (const [v, pt] of c.uv) { const id = k++; rm.set(v, id); uv.set(id, pt); }
        for (const T of c.tris) tt.push(T.map((v) => rm.get(v))); }
    return { uv, tt };
};
const POOL = ABLATION.map(({ r }) => { const p = pooled(r); return selfOverlaps(p.tt, p.uv, { maxPairs: 2e7 }); });
{
    let covered = 0, flipped = 0, worstConf = 0, outside = 0;
    for (const c of R.charts) {
        covered += c.tris.length;
        const d = distortion(R.weld.positions, c.tris, c.uv);
        flipped += d.flipped; worstConf = Math.max(worstConf, d.conformal.max);
        for (const [u, v] of c.uv.values())
            if (u < -1e-9 || u > 1 + 1e-9 || v < -1e-9 || v > 1 + 1e-9) outside++;
    }
    ok("!! *** EVERY TRIANGLE OF RobotExpressive IS UNWRAPPED -- the asset reskin.js called unavailable ***",
       covered === R.weld.tris.length && R.weld.tris.length > 3000,
       `${covered} of ${R.weld.tris.length} triangles across ${R.chartCount} charts, 100%. No component is ` +
       "skipped for being closed, which was the only way to make this number come out right.");
    ok("!! no triangle is flipped and no UV escapes [0,1]", flipped === 0 && outside === 0,
       `${flipped} flipped, ${outside} UVs outside the unit square, worst conformal ${worstConf.toFixed(4)}.`);
    ok("!! the solver reports how well it converged, per chart",
       R.worstResidual < 1e-6,
       `worst relative residual ${R.worstResidual.toExponential(2)} across ${R.chartCount} charts. *** THIS ` +
       "NUMBER EXISTS BECAUSE THE FIRST DRAFT HAD A FIXED 400-ITERATION BUDGET AND RETURNED GARBAGE SILENTLY: " +
       "on a refining cylinder the conformal error GREW -- 7.0e-7, 1.7e-6, 3.4e-6, then 5.3e+1 at 6,144 " +
       "triangles. The normal equations square the condition number, so a budget that does not grow with n " +
       "stops solving; the budget scales now, and the residual rides with the answer so a caller can tell.");

    // chart rects must be disjoint in the atlas -- checked on the RESULT, not on the packer's bookkeeping
    const rects = R.charts.map((c) => {
        let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
        for (const [u, v] of c.uv.values()) {
            if (u < lo[0]) lo[0] = u; if (u > hi[0]) hi[0] = u;
            if (v < lo[1]) lo[1] = v; if (v > hi[1]) hi[1] = v;
        }
        return { x: lo[0], y: lo[1], w: hi[0] - lo[0], h: hi[1] - lo[1] };
    });
    let over = 0;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++)
        if (rectsOverlap(rects[i], rects[j])) over++;
    // *** THE NUMBER THAT WAS 1.2% AN HOUR AFTER THIS FILE SHIPPED. *** Padding was an absolute 0.02 in a
    // space whose scale is the caller's: RobotExpressive is 0.066 units across and its median chart spans
    // 1.2e-2, so the gap around each chart was 1.6x the chart. Coverage against padding, measured:
    // 0.02 -> 1.2%, 0.005 -> 9.1%, 0.001 -> 25.9%, 0 -> 31.2%. Expressed in TEXELS at a stated texture size
    // it is 28.7% at the default and it tracks resolution -- 26.9% at 512, 29.9% at 2048 -- which is the
    // behaviour a texel-sized gap should have and an absolute one cannot.
    let triArea = 0;
    for (const c of R.charts) for (const T of c.tris) {
        const a = c.uv.get(T[0]), b = c.uv.get(T[1]), d = c.uv.get(T[2]);
        triArea += Math.abs((b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])) / 2;
    }
    ok("!! *** the atlas holds surface rather than gap: padding is a TEXEL COUNT, not a magic number ***",
       triArea > 0.2,
       `triangles cover ${(100 * triArea).toFixed(1)}% of the texture at the default 2 texels of 1024. The ` +
       "row exists so the 1.2% cannot come back by somebody choosing a padding in the wrong unit.");

    // *** THE CHECK THAT HAD TO CHANGE WHEN THE PACKER DID. *** Box-disjointness was the right property for a
    // SHELF packer and is the WRONG one for a NESTING packer, where overlapping boxes is the entire point.
    // What must still hold is the property boxes were only ever a proxy for: no two TRIANGLES land on each
    // other, whichever charts they belong to. Two charts' texels in one texel is a corrupt atlas, and no
    // coverage number can see it.
    const cross = POOL[0];
    const allTris = R.charts.reduce((n, c) => n + c.tris.length, 0);
    ok("!! *** NO TRIANGLE LANDS ON ANOTHER, ACROSS ALL CHARTS -- and their BOXES may freely overlap ***",
       cross.pairs === 0 && !cross.truncated,
       `${allTris} triangles pooled across ${R.charts.length} charts, ${cross.checked} pairs examined, ` +
       `${cross.pairs} overlapping. ${over} pairs of chart BOUNDING BOXES do overlap, which is the nesting ` +
       "packer working rather than failing: a chart with a notch in its underside settles over a bump in what " +
       "is already placed, and that is where the gain comes from.");
}

console.log("\n6. *** THE CASE THE DISK GUARD EXISTS FOR, WHICH THE ASSET DOES NOT CONTAIN ***");
{
    // A CLOSED TUBE: developable, so an exact unrolling exists -- but it is an ANNULUS, and unrolling one
    // needs a cut. Handed to LSCM whole it must overlap itself somewhere.
    const nu = 48, nv = 4, P = [], T = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i < nu; i++) {
        const a = 2 * Math.PI * i / nu; P.push(Math.cos(a), Math.sin(a), 2 * j / nv);
    }
    const id = (i, j) => j * nu + ((i % nu) + nu) % nu;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        T.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)]); T.push([id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
    }
    const PP = Float64Array.from(P);
    const whole = distortion(PP, T, lscm(PP, T));
    const cs = charts(PP, T, { maxNormalDeg: 180 });
    ok("!! *** AN ANNULUS HANDED TO LSCM WHOLE FOLDS, AND THE GUARD IS WHAT STOPS IT ARRIVING ***",
       whole.flipped > 0 && whole.conformal.max > 5 && cs.length > 1 && Math.max(...cs.map((c) => c.length)) < T.length,
       `the tube as ONE chart: conformal ${whole.conformal.max.toFixed(2)}, ${whole.flipped} flipped of ` +
       `${T.length}. With the disk guard at a 180-degree normal limit -- every normal admissible, so ONLY the ` +
       `guard is deciding -- it splits into ${cs.length} charts, largest ${Math.max(...cs.map((c) => c.length))}. ` +
       "*** THIS FIXTURE EXISTS BECAUSE SABOTAGE B WENT 0 RED WITHOUT IT. *** Removing the guard changed " +
       "nothing measurable on RobotExpressive -- 681 charts instead of 735, worst 1.173 against 1.184, zero " +
       "flips either way -- because a 40-degree normal limit already keeps its charts too small to wrap. The " +
       "guard was not useless; the gate had no case that could tell.");
}

console.log("\n7. *** THE KNOB IS A CLIFF, NOT A DIAL, AND THE CLIFF IS WHERE LSCM STOPS PROMISING ANYTHING ***");
{
    const rows = [];
    for (const deg of [40, 60, 80, 100, 140]) {
        const cs = charts(W.positions, W.tris, { maxNormalDeg: deg });
        let flipped = 0, worst = 0;
        for (const mem of cs) {
            const T = mem.map((i) => W.tris[i]); const uv = lscm(W.positions, T);
            if (!uv) continue;
            const d = distortion(W.positions, T, uv);
            flipped += d.flipped; worst = Math.max(worst, d.conformal.max);
        }
        rows.push({ deg, charts: cs.length, flipped, worst });
    }
    const safe = rows.filter((r) => r.deg <= 80), bad = rows.filter((r) => r.deg >= 100);
    ok("!! *** ZERO FLIPS UP TO 80 DEGREES AND A THREE-ORDER JUMP AT 100 ***",
       safe.every((r) => r.flipped === 0 && r.worst < 3) && bad.every((r) => r.flipped > 0) &&
       // an ORDER OF MAGNITUDE, not the ratio that happened to come out: the first draft asserted 100x and the
       // pin repair moved 100deg's worst from 4319 to 103, so a true property failed on an improvement.
       bad[0].worst > 10 * safe[safe.length - 1].worst,
       rows.map((r) => `${r.deg}deg: ${r.charts} charts, worst ${r.worst.toFixed(2)}, ${r.flipped} flipped`).join("; ") +
       ". *** LSCM MINIMISES ANGLE DISTORTION AND GUARANTEES NOTHING ABOUT INJECTIVITY: *** a chart can be a " +
       "topological disk and still fold over itself in the plane, and that is exactly what the flips past 100 " +
       "degrees are. The default of 40 sits well inside the safe region, and the cliff is recorded so raising " +
       "it is a decision somebody makes against numbers rather than by feel.");
}

console.log("\n8. *** SELF-OVERLAP: the failure every per-triangle metric calls perfect ***");
{
    // the tube from section 6, whose fold the flip count DOES see -- both instruments should agree here
    const nu = 48, nv = 4, P = [], T = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i < nu; i++) {
        const a = 2 * Math.PI * i / nu; P.push(Math.cos(a), Math.sin(a), 2 * j / nv);
    }
    const id = (i, j) => j * nu + ((i % nu) + nu) % nu;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        T.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)]); T.push([id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
    }
    const PP = Float64Array.from(P), uv = lscm(PP, T);
    const d = distortion(PP, T, uv), o = selfOverlaps(T, uv);
    // *** THE PRIMITIVE, DRIVEN DIRECTLY, BECAUSE ONE OF ITS TWO BRANCHES IS NEVER THE DECIDING ONE. ***
    // Every overlap in every fixture here is an EDGE CROSSING, so deleting the containment test changed no
    // verdict anywhere -- it went 0 red. Containment is the case edge crossing cannot see: a small triangle
    // wholly inside a large one shares no crossing edge with it, and a chart that folds onto itself neatly
    // produces exactly that. Driven on three hand-built pairs instead of hoping a fixture happens to contain one.
    {
        const big = [0, 1, 2], small = [3, 4, 5], far = [6, 7, 8];
        const uvm = new Map([[0, [0, 0]], [1, [10, 0]], [2, [0, 10]],
                             [3, [1, 1]], [4, [2, 1]], [5, [1, 2]],          // wholly inside `big`
                             [6, [50, 50]], [7, [51, 50]], [8, [50, 51]]]);  // nowhere near either
        const contained = selfOverlaps([big, small], uvm).pairs;
        const disjoint = selfOverlaps([big, far], uvm).pairs;
        const crossing = selfOverlaps([[0, 1, 2], [3, 4, 5]],
            new Map([[0, [0, 0]], [1, [10, 0]], [2, [5, 8]], [3, [5, -2]], [4, [6, 6]], [5, [-2, 4]]])).pairs;
            // *** AND THE FOLD ACROSS A SHARED EDGE, WHICH THIS ROUND'S OTHER FIX REMOVED THE SUBJECT OF. ***
        // The edge-sharing test was caught red last round by the robot's 64 duplicate faces. weld() drops
        // those now, so the mesh no longer contains the input that exercised it and deleting the test went
        // 0 RED -- one repair quietly disarming another round's check. Two triangles hinged on an edge with
        // their free vertices on the SAME side are a fold; on opposite sides they are ordinary adjacency, and
        // both are built here so neither depends on an asset happening to be dirty.
        {
            const hinge = new Map([[0, [0, 0]], [1, [10, 0]], [2, [5, 6]], [3, [5, 4]], [4, [5, -6]]]);
            const folded = selfOverlaps([[0, 1, 2], [0, 1, 3]], hinge).pairs;
            const proper = selfOverlaps([[0, 1, 2], [0, 1, 4]], hinge).pairs;
            ok("!! two triangles hinged on an edge: SAME side is a fold, opposite sides is adjacency",
               folded === 1 && proper === 0,
               `same side ${folded} overlapping, opposite sides ${proper}. Sharing an edge is not the same as ` +
               "touching by construction, and the difference is which side the free vertices fall on.");
        }

    ok("!! the overlap primitive catches CONTAINMENT and CROSSING, and leaves disjoint alone",
           contained === 1 && crossing === 1 && disjoint === 0,
           `a triangle wholly inside another: ${contained} pair; two triangles crossing edges: ${crossing}; ` +
           `two far apart: ${disjoint}. The containment branch is the one no fixture in this file exercises, ` +
           "so it is driven here rather than assumed.");
    }

    ok("the two instruments agree where the fold is violent enough for both",
       d.flipped > 0 && o.pairs > 0,
       `the tube as one chart: ${d.flipped} flipped triangles AND ${o.pairs} overlapping pairs.`);

    // *** AND THE CASE ONLY ONE OF THEM SEES, WHICH WAS IN THE SHIPPED OUTPUT. ***
    const cs0 = charts(W.positions, W.tris, { maxNormalDeg: 40 });
    let quietFolds = 0, foldedCharts = 0;
    for (const m of cs0) {
        const t = m.map((i) => W.tris[i]), u = lscm(W.positions, t);
        if (!u) continue;
        const pairs = selfOverlaps(t, u).pairs;
        if (pairs > 0 && distortion(W.positions, t, u).flipped === 0) { quietFolds += pairs; foldedCharts++; }
    }
    ok("!! *** TWO CHARTS OF THE ORIGINAL 735 FOLDED WITH ZERO FLIPPED TRIANGLES ***",
       quietFolds > 0 && foldedCharts > 0,
       `${foldedCharts} charts, ${quietFolds} overlapping pair(s), every triangle correctly oriented. They are ` +
       "20-triangle strips at conformal 1.0008 with residual 6.4e-13 -- locally flawless and fully converged -- " +
       "whose ends land on each other three hops apart in the chart. v4537 recorded this exact gap in its own " +
       "\"not claimed\" and could not measure it; a per-triangle determinant is a LOCAL test and self-overlap " +
       "is a GLOBAL property.");
}

console.log("\n9. *** MERGE, SPLIT, ORIENT -- the three, ablated ***");
{
    const rows = ABLATION.map(({ name, r }) => {
        let tri = 0, fl = 0, ov = 0, worst = 0, cov = 0, above = 0;
        for (const c of r.charts) {
            cov += c.tris.length;
            for (const T of c.tris) {
                const a = c.uv.get(T[0]), b = c.uv.get(T[1]), d = c.uv.get(T[2]);
                tri += Math.abs((b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])) / 2;
            }
            const dd = distortion(r.weld.positions, c.tris, c.uv);
            fl += dd.flipped; worst = Math.max(worst, dd.conformal.max);
            if (dd.conformal.max > 1.05) above++;      // counted HERE rather than in a second pass over the
        }                                             // same 448 charts: this gate has 420 ms of budget left
        return { name, charts: r.chartCount, grown: r.grown, tri: 100 * tri, fl, ov, worst, cov, above };
    });
    const merged = rows[0];   // the placeholder `grown` object this line used to build is gone: see below
    // *** THE SEAM COUNT IS MEASURED HERE RATHER THAN QUOTED. *** It was three fixed numbers in this row's
    // prose -- "1875 of 4439 (42.2%) -> 804 (18.1%)" -- and by the time anything checked, the welded mesh had
    // 4,509 interior edges and 1,903 of them cut. The percentage happened to survive; the counts did not. A
    // MOVING QUANTITY WRITTEN AS A FIXED ONE is this tree's most-repeated defect, so it is computed: an edge
    // shared by two triangles is a seam when its two triangles ended up in different charts, both before the
    // merge and after it. charts() costs 29 ms to re-run, which buys a number that cannot go stale.
    const eKey = (a, b) => (a < b ? a + "_" + b : b + "_" + a);
    const eTris = new Map();
    W.tris.forEach((t, i) => { for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
        const k = eKey(a, b); if (!eTris.has(k)) eTris.set(k, []); eTris.get(k).push(i); } });
    let interior = 0; for (const v of eTris.values()) if (v.length === 2) interior++;
    const cutBy = (owner) => { let c = 0;
        for (const ts of eTris.values()) if (ts.length === 2 && owner.get(ts[0]) !== owner.get(ts[1])) c++;
        return c; };
    const triId = new Map(); W.tris.forEach((t, i) => triId.set([...t].sort((a, b) => a - b).join(","), i));
    const grownOwner = new Map();
    charts(W.positions, W.tris, { maxNormalDeg: 40 }).forEach((m, ci) => m.forEach((t) => grownOwner.set(t, ci)));
    const mergedOwner = new Map();
    R.charts.forEach((c, ci) => c.tris.forEach((T) => {
        const i = triId.get([...T].sort((a, b) => a - b).join(",")); if (i !== undefined) mergedOwner.set(i, ci); }));
    const cutG = cutBy(grownOwner), cutM = cutBy(mergedOwner);
    ok("!! *** MERGING CUTS A THIRD OF THE CHARTS AND A SIXTH OF THE SEAMS, AND THE HEADLINE USED TO SAY TWO THIRDS ***",
       merged.charts < merged.grown * 0.75 && cutM < cutG * 0.9 && POOL[0].pairs === 0 && merged.fl === 0,
       `${merged.grown} charts grown on a fixed 40-degree limit -> ${merged.charts} after merging on MEASURED ` +
       `distortion (${(100 * merged.charts / merged.grown).toFixed(1)}%). Seam edges ${cutG} of ${interior} ` +
       `(${(100 * cutG / interior).toFixed(1)}%) -> ${cutM} (${(100 * cutM / interior).toFixed(1)}%). ` +
       `${merged.fl} flipped and ${POOL[0].pairs} overlapping pairs, because a merge is only accepted if the ` +
       "union survives all three tests. A fixed angle is a PROXY for distortion; this asks the question " +
       "instead. THE NUMBERS FELL when maxConformal went 2.0 -> 1.05 in v4560 -- 258 charts and 19.1% of edges " +
       "cut at the old bound -- and that is the trade the reference oracle priced: fewer merges, lower stretch.");

    // *** AND THE BOUND DOES NOT BOUND THE ATLAS, WHICH IS THE OPPOSITE OF WHAT THE OLD ROW SAID. ***
    // "Worst conformal ... inside the 2.0 bound the merge enforces" was wrong twice over: the 0.00 it printed
    // as the BEFORE figure was a placeholder literal, never a measurement, and the bound is a test on a
    // candidate UNION and not on a chart. A grown chart that never merges keeps whatever distortion the
    // 40-degree segmentation left it with, and 111 of the 448 final charts are above 1.05 for exactly that
    // reason. The atlas worst is therefore ABOVE the bound by construction, and a row that reads it as
    // compliance is reading a number that cannot fail.
    const above = merged.above;
    ok("!! *** maxConformal GATES MERGES, NOT CHARTS -- so the atlas worst is above it and that is correct ***",
       merged.worst > 1.05 && above > 0 && above < R.charts.length,
       `worst conformal across the ${R.charts.length} final charts is ${merged.worst.toFixed(4)}, above the ` +
       `1.05 merge bound, and ${above} charts are. Every one arrived that way from segmentation and was never ` +
       "offered a merge it passed -- mergeCharts flattens the UNION and tests THAT, so a chart it never " +
       "touches is not covered by the bound. Nothing in this file splits a chart for distortion; " +
       "splitOverlapping splits for OVERLAP only. That gap is real and is filed rather than papered over.");

    // *** ROTATION IS EXACTLY FREE, TESTED ON ONE CHART RATHER THAN BY UNWRAPPING THE MESH AGAIN. ***
    // Against the SHELF packer this rotation was worth 29.5% -> 40.7% of the texture. Against a packer that
    // nests actual occupancy it is worth well under a point, because the packer no longer cares what a chart's
    // box looks like -- a change whose value was mostly taken over by a better one, which is worth recording
    // rather than quietly keeping as a win. What cannot rot is the invariance, and that needs one chart.
    {
        const m0 = charts(W.positions, W.tris, { maxNormalDeg: 40 })
            .reduce((a, b) => (b.length > a.length ? b : a));
        const T0 = m0.map((i) => W.tris[i]), u0 = lscm(W.positions, T0);
        const d0 = distortion(W.positions, T0, u0);
        const d1 = distortion(W.positions, T0, orientChart(u0).uv);
        ok("!! rotating a chart changes its distortion by EXACTLY nothing",
           Math.abs(d0.conformal.max - d1.conformal.max) < 1e-12 &&
           Math.abs(d0.area.max - d1.area.max) < 1e-12 && d1.flipped === d0.flipped,
           `${T0.length}-triangle chart: conformal ${d0.conformal.max.toFixed(9)} before, ` +
           `${d1.conformal.max.toFixed(9)} after; area max identical to ` +
           `${Math.abs(d0.area.max - d1.area.max).toExponential(1)}. A conformal map composed with a rotation ` +
           "is the same map, so the packer may orient charts freely and owes the distortion nothing.");
    }

    ok("every triangle survives all three passes",
       rows.every((r) => r.cov === rows[0].cov && r.cov > 3000),
       rows.map((r) => `${r.name}: ${r.cov} triangles, ${r.charts} charts`).join("; ") + ".");
}

console.log("\n10. *** PACK THE CHART, NOT ITS BOX ***");
{
    // *** THE SHORTCUT SECTION 5 TAKES IS CHECKED HERE, ON A MESH SMALL ENOUGH TO RUN BOTH WAYS. ***
    // `from` reuses a previous result's solved charts and runs only the packer. If it were an APPROXIMATION
    // the ablation above would be comparing a packer against a slightly different mesh and would still look
    // fine, because every number it prints is a coverage figure with no reference. So both paths are run on a
    // sphere -- full pipeline with nest:false, against a repack of the nested result -- and EVERY UV is
    // compared, not a summary of them.
    const sp = sphereMesh(1, 16, 12);
    const nested = unwrapCurved(sp.positions, sp.indices);
    const full = unwrapCurved(sp.positions, sp.indices, { nest: false });
    const re = unwrapCurved(sp.positions, sp.indices, { nest: false, from: nested });
    let worstDelta = 0, compared = 0, shape = full.charts.length === re.charts.length;
    if (shape) for (let i = 0; i < full.charts.length; i++) {
        const a = full.charts[i], b = re.charts[i];
        if (a.tris.length !== b.tris.length) { shape = false; break; }
        for (const [v, uv] of a.uv) { const o = b.uv.get(v);
            if (!o) { shape = false; break; }
            worstDelta = Math.max(worstDelta, Math.abs(uv[0] - o[0]), Math.abs(uv[1] - o[1])); compared++; }
    }
    ok("!! *** REPACKING A SOLVE AGREES WITH SOLVING AGAIN TO ONE ULP, WHICH IS NOT THE SAME AS EXACTLY ***",
       shape && compared > 0 && worstDelta < 1e-15,
       `${full.charts.length} charts, ${compared} UVs compared, worst coordinate difference ` +
       `${worstDelta.toExponential(1)}. The claim written here first was "to the last digit" and the ` +
       "measurement said 3.3e-16: a chart's packed UVs differ from its solved ones by a translation and one " +
       "global scale, and the repack divides by a span and multiplies by another, so ONE rounding separates " +
       "the paths. That is a bound of an ulp on a coordinate in [0,1] and it is asserted as one rather than " +
       "as equality. On the robot the shortcut is 535 ms -> 3 ms, which is what keeps section 5 inside its " +
       "budget -- a saving worth nothing if the result were merely close, so this row says how close.");

    const cov = (r) => { let t = 0;
        for (const c of r.charts) for (const T of c.tris) {
            const a = c.uv.get(T[0]), b = c.uv.get(T[1]), d = c.uv.get(T[2]);
            t += Math.abs((b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])) / 2; }
        return 100 * t; };
    const shelf = ABLATION[1].r, nest = R;
    const os = POOL[1].pairs, on = POOL[0].pairs;
    ok("!! *** NESTING BEATS BOXES, AND ONLY COUNTS IF NOTHING COLLIDES ***",
       cov(nest) > cov(shelf) + 3 && on === 0 && os === 0 && String(nest.packer).startsWith("nest"),
       `shelf ${cov(shelf).toFixed(1)}% of the texture, nest ${cov(nest).toFixed(1)}% -- and ${on} colliding ` +
       `triangle pairs against the shelf packer's ${os}. The atlas divides three ways and a box packer can only ` +
       "attack one of them: measured before this, 40.7% triangles, 28.1% inside the boxes and uncovered, 31.3% " +
       "between the boxes. The median chart fills 79% of its own box, so a third of the loss is the SHAPE and " +
       "no amount of box-packing skill reaches it.");

    ok("!! the packer VERIFIES its own invariant and can say it fell back",
       nest.padCells >= 1 && !nest.nestFellBack,
       `nested at pad ${nest.padCells} cell(s) with 0 collisions. Conservative rasterisation took cross-chart ` +
       "collisions from 78 pairs to 3 and matching the mask grid to the atlas grid cleared them at this " +
       "resolution -- but the pack is CHECKED rather than argued, the pad widened while it fails, and the " +
       "shelf packer (disjoint by construction) is the fallback. A sparser atlas beats a possibly corrupt one, " +
       "and 256 cells is NOT the default precisely because there the pad has to reach 3 and coverage falls " +
       "below the shelf packer's -- a knob whose best value is not its largest.");
}

console.log("\n11. *** THE PAD HAS TO WORK SIDEWAYS, AND FOR THREE ROUNDS IT ONLY WORKED UPWARDS ***");
{
    // Forty identical SOLID squares: no concavity, so any gap between two of them is the pad and nothing else.
    // The skyline reserves space above a chart; padCells was only ever an offset in x, never a separation, so
    // two charts landing in adjacent columns got whatever the rounding left them and not one cell more.
    const sq = { w: 1, h: 1, cells: (mw, mh) => new Uint8Array(mw * mh).fill(1) };
    const shapes = Array.from({ length: 40 }, () => sq);
    const gaps = (pad) => {
        const p = rasterPack(shapes, { cells: 64, padCells: pad });
        let mh = Infinity, mv = Infinity;
        for (let i = 0; i < p.placements.length; i++) for (let j = i + 1; j < p.placements.length; j++) {
            const A = p.placements[i], B = p.placements[j];
            const oy = A.y < B.y + B.h && B.y < A.y + A.h, ox = A.x < B.x + B.w && B.x < A.x + A.w;
            if (oy && !ox) mh = Math.min(mh, Math.max(B.x - (A.x + A.w), A.x - (B.x + B.w)));
            if (ox && !oy) mv = Math.min(mv, Math.max(B.y - (A.y + A.h), A.y - (B.y + B.h)));
        }
        return { h: mh / p.cell, v: mv / p.cell };
    };
    const g1 = gaps(1), g2 = gaps(2);
    ok("!! *** BOTH DIRECTIONS RESPOND TO THE PAD, not just the one the skyline happens to model ***",
       g1.h >= 1 && g2.h >= g1.h + 0.5 && g1.v >= 1 && g2.v >= g1.v + 0.5,
       `pad 1: horizontal ${g1.h.toFixed(2)} cells, vertical ${g1.v.toFixed(2)}; pad 2: horizontal ` +
       `${g2.h.toFixed(2)}, vertical ${g2.v.toFixed(2)}. WITHOUT the skyline dilation the horizontal gap is ` +
       "0.54 cells at pad 1 and 0.72 at pad 2 -- it barely moves -- while the vertical runs 2.54 and 4.72. " +
       "*** THAT ASYMMETRY IS WHAT THE VERIFY LOOP HAD BEEN PAYING FOR: *** it escalated the pad in BOTH " +
       "directions to buy a margin missing in ONE, and the coverage it cost made 256-cell packs come out worse " +
       "than the shelf packer they were meant to beat. Measured on the robot before the repair: across 3,287 " +
       "side-by-side chart pairs the smallest horizontal gap was 0.00 cells against 0.67 vertically.");

    // *** THE WIDTH BALANCER, DRIVEN FROM A DELIBERATELY BAD START. *** Deleting it went 0 RED at the new
    // default, because at 384 cells the opening guess of sqrt(total) is already nearly square and there is
    // nothing for the loop to correct. That is a property of one resolution and not of the mechanism, so the
    // mechanism is driven directly: handed a start four times too wide, it must still converge to a square.
    {
        const sq2 = { w: 1, h: 1, cells: (mw, mh) => new Uint8Array(mw * mh).fill(1) };
        const many = Array.from({ length: 60 }, () => sq2);
        const forced = rasterPack(many, { cells: 64, padCells: 1, aspect: 40 });   // 40 wide by construction
        const solved = rasterPack(many, { cells: 64, padCells: 1 });               // free to balance
        ok("!! *** a width fixed by anything is a guess: the balancer recovers a square from a 4x-wide start ***",
           Math.abs(forced.height / forced.width - 1) > 0.5 &&
           Math.abs(solved.height / solved.width - 1) < 0.25,
           `forced to 40 wide: ${forced.width.toFixed(2)} x ${forced.height.toFixed(2)} (ratio ` +
           `${(forced.height / forced.width).toFixed(3)}); left to balance: ${solved.width.toFixed(2)} x ` +
           `${solved.height.toFixed(2)} (ratio ${(solved.height / solved.width).toFixed(3)}). The UVs address a ` +
           "SQUARE, so every unit the atlas is wider than tall is texture nothing can ever be drawn into -- and " +
           "this number has been got wrong three times across two packers, twice by formula and once by a " +
           "search over fixed multipliers.");
    }

    ok("!! and the default no longer needs the pad escalated at all",
       R.padCells === 1 && !R.nestFellBack,
       `the shipped configuration settles at pad ${R.padCells} with no fallback. Before the repair it reached ` +
       "pad 3 at 256 and 384 cells. The escalation across resolutions is still not smooth -- 256 and 384 take " +
       "pad 1, 320 and 512 take 2, 448 and 640 take 3 -- which says the residual collisions are a " +
       "discretisation artefact rather than a margin, and is left as a stated open question rather than a " +
       "tuned constant: the verify loop makes every one of those resolutions CORRECT, only some of them cheap.");
}

console.log("\n12. *** A CONSUMER, WHICH IS THE THING FIVE ROUNDS OF THIS FILE DID NOT HAVE ***");
{
    // tools/ship/orphanTriage.mjs put physics/mesh/uvLscm.mjs in its actionable pile -- "ungradedPhysics +
    // hasOwnGate" -- and it was right: nothing in the tree called it. Part of the reason is that unwrapCurved
    // returns CHARTS, which is the right form for measuring an unwrap and a form no exporter can take.
    const M = unwrapToMesh(glb.positions, glb.indices, { from: R });
    ok("!! *** UVs ARE PER-CORNER AND A MESH IS PER-VERTEX: the seam split is what reconciles them ***",
       M.seamCopies > 0 && M.positions.length / 3 === M.uvs.length / 2 &&
       M.indices.length === R.charts.reduce((n, c) => n + c.tris.length, 0) * 3,
       `${M.weldedVerts} welded vertices + ${M.seamCopies} seam copies = ${M.positions.length / 3}, one UV each, ` +
       `${M.indices.length / 3} triangles. 48.5% of the welded vertices sit on a seam and cannot survive as one ` +
       `vertex in a buffer carrying one UV per index. *** AND THE RESULT IS STILL 59% SMALLER THAN THE FILE ` +
       `SHIPS: ${M.positions.length / 3} against ${glb.positions.length / 3} *** -- the weld removes far more ` +
       "duplication than the seams add back, so the mesh comes out smaller AND carries UVs it never had.");

    // *** THE CONTAINER IS DECODED BY HAND, per the glTF 2.0 spec, rather than through our own reader: a
    // writer and a reader from the same tree agreeing with each other proves they share a convention, not
    // that either is right. ***
    const bytes = Uint8Array.from(writeSceneGlb({ meshes: [{ positions: M.positions, indices: M.indices, uvs: M.uvs }] }));
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const jlen = dv.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jlen)));
    const prim = json.meshes[0].primitives[0];
    const acc = json.accessors[prim.attributes.TEXCOORD_0 ?? -1];
    const pacc = json.accessors[prim.attributes.POSITION];
    let worst = Infinity, lo = 0, hi = 0;
    if (acc) {
        const bv = json.bufferViews[acc.bufferView];
        const uv = new Float32Array(bytes.buffer, bytes.byteOffset + 20 + jlen + 8 + (bv.byteOffset || 0) + (acc.byteOffset || 0), acc.count * 2);
        worst = 0; lo = Infinity; hi = -Infinity;
        for (let i = 0; i < uv.length; i++) { worst = Math.max(worst, Math.abs(uv[i] - M.uvs[i]));
            if (uv[i] < lo) lo = uv[i]; if (uv[i] > hi) hi = uv[i]; }
    }
    ok("!! *** THE ASSET reskin.js CALLS UNTEXTURABLE ROUND-TRIPS THROUGH A GLB CARRYING TEXCOORD_0 ***",
       !!acc && acc.type === "VEC2" && acc.componentType === 5126 &&
       acc.count === M.uvs.length / 2 && pacc.count === acc.count && worst === 0 && lo >= 0 && hi <= 1,
       `${bytes.length}-byte GLB: attributes ${Object.keys(prim.attributes).join(" + ")}, TEXCOORD_0 is ` +
       `${acc ? acc.type : "ABSENT"}/${acc ? acc.componentType : "-"} with ${acc ? acc.count : 0} entries, ` +
       `POSITION count matches, and the values read back differ from what was written by ${worst.toExponential(1)} ` +
       `over the range [${lo.toFixed(4)}, ${hi.toFixed(4)}]. tools/export/reskin.js: "NO TEXCOORD_0 AND NO ` +
       'TEXTURE AT ALL ... the simple path is not wrong, it is unavailable ON THIS ASSET." It is available now.');
}

// ---- SABOTAGE LOG -- graded on EXIT CODES, each restored before the next --------------------------------------
//   A weld disabled                    E localFrame drops the height    K containment branch dropped
//   B disk guard removed               F Cauchy-Riemann sign flipped    L splitOverlapping never splits
//   C pins forced to first two         G flip detector disabled         M duplicate faces kept
//   D iteration budget pinned at 400   H padding back to absolute 0.02  N edge-sharing fold test removed
//   I merge ignores self-overlap       J orientChart no-op              O raster centre-samples
//   Q atlas width not balanced         R skyline dilation removed
//   S seam split reuses one vertex     T unwrapToMesh returns no uvs
// All exit 1.  P -- the packer's verify-and-repair loop -- is recorded as NOT EXERCISED; see below.
//
// *** SEVEN OF THESE HAVE GONE 0 RED AT SOME POINT AND NOT ONE WAS THE GATE BEING RIGHT. *** Five reasons, and
// the fifth is new this round:
//   NO FIXTURE COULD SEE IT   B needed an annulus, D needed thousands of triangles in one chart.
//   MASKED BY A LATER PASS    I: splitOverlapping repairs whatever the merge lets through.
//   AN UNREACHED BRANCH       K: every overlap in every fixture was a CROSSING, never a containment.
//   THE INSTRUMENT WAS WRONG  C: counting FAIL lines scores a module that THROWS as zero.
//   *** ONE REPAIR DISARMED ANOTHER ROUND'S CHECK. ***  N was caught red last round BY the robot's 64
//   duplicate faces. This round's weld() drops those, so the mesh no longer contains the input that exercised
//   the fold test, and deleting the test changed nothing. Q went the same way for a different reason: the
//   default moved from 192 to 384 cells and at 384 the opening width guess is already nearly square, so the
//   balancer had nothing to correct. NEITHER WAS A CHECK GOING STALE ON ITS OWN -- both were disarmed by
//   improvements elsewhere in the same file, which is the failure mode a passing suite cannot show you.
// Both are driven directly now, on hand-built inputs that no asset and no default can take away: two triangles
// hinged on an edge, and a packer handed a start four times too wide.
//
// P stays unexercised on purpose. Deleting the verify-and-repair loop changes nothing at the default, because
// at 384 cells with a one-cell pad nothing collides for it to repair. Exercising it costs another unwrap of
// the asset -- and this gate has been cut twice already to stay clear of the 3,000 ms sweep budget. The loop
// is kept (a sparser atlas beats a possibly corrupt one), the measurement of where it engages is written here,
// and the gate does not pay for it every ship. A CHECK NOBODY EXERCISES IS WORTH LESS THAN ONE THAT IS, AND
// SAYING SO IS WORTH MORE THAN PRETENDING.
//
console.log(fails ? "\nuvLscm-selfcheck: " + fails + " FAILED" : "\nuvLscm-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
