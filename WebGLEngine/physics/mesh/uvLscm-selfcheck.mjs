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
         selfOverlaps, mergeCharts, splitOverlapping, orientChart } from "./uvLscm.mjs";
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
const ABLATION = [["grown only", { merge: false, orient: false }],
                  ["+ merge/split", { merge: true, orient: false }],
                  ["+ orient", {}]].map(([name, opt]) => ({ name, r: unwrapCurved(glb.positions, glb.indices, opt) }));
const R = ABLATION[2].r;
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
       "remaining gap is bounding-box packing of 735 irregular charts, which is a real cost and a different " +
       "round; this row exists so the 1.2% cannot come back by somebody choosing a padding in the wrong unit.");

    ok("!! no two charts overlap in the atlas", over === 0,
       `${rects.length} charts, ${rects.length * (rects.length - 1) / 2} pairs, ${over} overlapping -- ` +
       "measured from the UVs that came out, not from the placements that went in.");
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
    const rows = [];
    for (const { name, r } of ABLATION) {
        let tri = 0, fl = 0, ov = 0, worst = 0, cov = 0;
        for (const c of r.charts) {
            cov += c.tris.length;
            for (const T of c.tris) {
                const a = c.uv.get(T[0]), b = c.uv.get(T[1]), d = c.uv.get(T[2]);
                tri += Math.abs((b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])) / 2;
            }
            const dd = distortion(r.weld.positions, c.tris, c.uv);
            fl += dd.flipped; worst = Math.max(worst, dd.conformal.max);
            ov += selfOverlaps(c.tris, c.uv).pairs;
        }
        rows.push({ name, charts: r.chartCount, tri: 100 * tri, fl, ov, worst, cov });
    }
    const [grown, merged, oriented] = rows;
    ok("!! *** MERGING CUTS THE CHARTS BY TWO THIRDS AND THE SEAMS BY MORE THAN HALF ***",
       merged.charts < grown.charts * 0.4 && merged.ov === 0 && merged.fl === 0 && merged.worst <= 2.0,
       `${grown.charts} charts grown on a fixed 40-degree limit -> ${merged.charts} after merging on MEASURED ` +
       `distortion. Seam edges 1875 of 4439 (42.2%) -> 804 (18.1%). Worst conformal ${grown.worst.toFixed(2)} -> ` +
       `${merged.worst.toFixed(2)}, inside the 2.0 bound the merge enforces, still ${merged.fl} flipped -- and ` +
       `overlaps ${grown.ov} -> ${merged.ov}, because a merge is only accepted if the union survives all three ` +
       "tests. A fixed angle is a PROXY for distortion; this asks the question instead.");

    ok("!! *** ROTATING EACH CHART TO ITS SMALLEST BOX IS FREE DISTORTION-WISE AND WORTH A THIRD OF THE ATLAS ***",
       oriented.tri > merged.tri * 1.3 && Math.abs(oriented.worst - merged.worst) < 1e-9 &&
       oriented.fl === 0 && oriented.ov === 0,
       `triangle coverage ${merged.tri.toFixed(1)}% -> ${oriented.tri.toFixed(1)}% of the texture, and worst ` +
       `conformal is UNCHANGED to ${Math.abs(oriented.worst - merged.worst).toExponential(1)} -- a conformal ` +
       "map composed with a rotation is the same map, so this is pure packing. LSCM leaves a chart at whatever " +
       "angle its pins happened to give it, and a diagonal strip's axis-aligned box is mostly air.");

    // *** THE MERGE'S OWN OVERLAP TEST IS INVISIBLE AT THE PIPELINE LEVEL, BECAUSE THE SPLIT PASS REPAIRS
    // WHAT IT LETS THROUGH. *** Deleting it went 0 red: two checks in series, and the second covers for the
    // first. That is a good design and a bad check, so the merge's own accounting is asserted directly -- it
    // must actually be REFUSING candidates on this asset, not merely holding a test that never fires.
    const ms = ABLATION[2].r.mergeStats, ss = ABLATION[2].r.splitStats;
    ok("!! the merge refuses real candidates for self-overlap, and the split pass repairs what it inherits",
       ms && ms.rejectedOverlap > 0 && ms.accepted > 0 && ss && ss.split > 0 && ss.singles === 0,
       `merge: ${ms.tried} pairs tried, ${ms.accepted} accepted, ${ms.rejectedDisk} refused for topology, ` +
       `${ms.rejectedDistortion} for distortion, ${ms.rejectedOverlap} FOR SELF-OVERLAP, over ${ms.rounds} rounds. ` +
       `split: ${ss.split} chart(s) bisected, ${ss.singles} triangles reduced to singletons. The two overlaps ` +
       "the split pass repairs were in the ORIGINAL segmentation, not created by merging.");

    ok("every triangle survives all three passes",
       rows.every((r) => r.cov === 3234),
       rows.map((r) => `${r.name}: ${r.cov} triangles, ${r.charts} charts`).join("; ") + ".");
}

// ---- SABOTAGE LOG -- graded on EXIT CODES, each restored before the next --------------------------------------
//   A  weld disabled (every vertex kept distinct)              exit 1, 5 rows
//   B  the disk guard (chi === 1) removed                      exit 1, 1 row
//   C  pins forced to the chart's first two vertices           exit 1, THREW
//   D  CG iteration budget pinned back to 400                  exit 1, 1 row
//   E  localFrame drops the triangle's height (y3 -> 1)        exit 1, 10 rows
//   F  the Cauchy-Riemann sign flipped (-b -> +b)              exit 1, 11 rows
//   G  the flipped-triangle detector disabled                  exit 1, 3 rows
//   H  padding back to the absolute 0.02 it shipped with       exit 1, 2 rows
//   I  the merge stops refusing candidates for self-overlap    exit 1, 1 row
//   J  orientChart returns the chart unrotated                 exit 1, 1 row
//   K  the overlap test drops its CONTAINMENT branch           exit 1, 1 row
//   L  splitOverlapping never splits                           exit 1, 2 rows
//
// *** FIVE OF THESE WENT 0 RED AT FIRST AND NOT ONE WAS THE GATE BEING RIGHT. *** The pattern is worth more
// than any single entry: a sabotage that will not fire is a reading, and what it reads is almost never the
// check.
//
//   B, D -- NO FIXTURE COULD SEE THEM. The disk guard's failure needs an annulus and the robot has none; the
//           fixed budget's failure needs thousands of triangles in ONE chart and the largest fixture was 741.
//           A defect found at one size and checked at another is not checked. Both fixtures now exist, and D's
//           was sized by MEASURING where the broken budget actually breaks -- fine at 1,536 triangles, 7.4e-3
//           at 2,128 -- so 3,128 catches it as decisively as 6,144 did at a third of the runtime.
//   C    -- THE INSTRUMENT WAS WRONG. Counting "  FAIL  " lines scores a module broken enough to THROW as
//           zero. Same shape as reading $? after a command substitution has reset it. Graded on exit codes now.
//   I    -- MASKED BY A LATER PASS. splitOverlapping repairs whatever the merge lets through, so deleting the
//           merge's overlap test changed no output. Two checks in series is a good design and a bad check, so
//           the merge's own accounting is asserted directly: it must be REFUSING candidates (it refuses 10).
//   K    -- AN UNREACHED BRANCH. Every overlap in every fixture is an edge CROSSING, so the CONTAINMENT half
//           of the test never decided anything. It is driven on three hand-built triangle pairs now, because
//           a small triangle wholly inside a large one shares no crossing edge with it and is exactly what a
//           chart folding neatly onto itself produces.
//
console.log(fails ? "\nuvLscm-selfcheck: " + fails + " FAILED" : "\nuvLscm-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
