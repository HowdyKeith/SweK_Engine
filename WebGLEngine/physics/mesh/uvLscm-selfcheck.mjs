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
import { weld, charts, lscm, distortion, unwrapCurved, triNormal } from "./uvLscm.mjs";
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
    for (const nu of [24, 48, 96]) {
        const c = cylinder(nu, Math.max(4, nu / 3));
        const uv = lscm(c.P, c.T);
        const d = distortion(c.P, c.T, uv);
        rows.push({ tris: c.T.length, err: d.conformal.max - 1, res: uv.residual });
    }
    const biggest = rows[rows.length - 1];
    ok("!! *** a 6,144-triangle chart is as accurate as a 384-triangle one, not 30 million times worse ***",
       rows.every((r) => r.err < 1e-6) && biggest.tris > 6000 && rows.every((r) => r.res < 1e-6),
       rows.map((r) => `${r.tris} tris: err ${r.err.toExponential(2)}, residual ${r.res.toExponential(2)}`).join("; ") +
       ". The budget scales with the system now and the residual is returned with the map, so a solve that " +
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
const R = unwrapCurved(glb.positions, glb.indices);
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

// ---- SABOTAGE LOG -- graded on EXIT CODES, each restored before the next --------------------------------------
//   A  weld disabled (every vertex kept distinct)              exit 1, 3 rows
//   B  the disk guard (chi === 1) removed                      exit 1, 1 row
//   C  pins forced to the chart's first two vertices           exit 1, THREW -- see below
//   D  CG iteration budget pinned back to 400                  exit 1, 1 row
//   E  localFrame drops the triangle's height (y3 -> 1)        exit 1, 7 rows
//   F  the Cauchy-Riemann sign flipped (-b -> +b)              exit 1, 7 rows
//   G  the flipped-triangle detector disabled                  exit 1, 2 rows
//   H  padding back to the absolute 0.02 it shipped with       exit 1, 1 row
//
// *** THREE OF THESE WENT 0 RED ON THE FIRST PASS AND NONE OF THE THREE WAS THE GATE BEING RIGHT. ***
//
// B and D went 0 red BECAUSE NO FIXTURE WAS BIG ENOUGH OR SHAPED RIGHT TO SEE THEM. Removing the disk guard
// changed nothing measurable on RobotExpressive -- 681 charts against 735, worst 1.173 against 1.184, zero
// flips either way -- because a 40-degree normal limit already keeps its charts too small to wrap around
// anything; the closed tube in section 6 exists because of that, and it folds at conformal 34.78 with 4 flips
// the moment the guard is gone. D's defect was FOUND on a 6,144-triangle chart and the gate's largest was 741,
// so a budget that fails at thousands passed everything present; section 3 is that experiment, kept.
// A DEFECT FOUND AT ONE SIZE AND CHECKED AT ANOTHER IS NOT CHECKED.
//
// C went 0 red because THE MEASURING INSTRUMENT WAS WRONG, which is worth more than the sabotage. The first
// pass counted "  FAIL  " lines, and a module broken badly enough to THROW prints none -- so a crash scored
// zero and read as "the check does not care". It is the same shape as counting `$?` after a command
// substitution has already reset it. Graded on exit codes, C is red; and the sphere numbers say how red --
// pinning the first two vertices takes the 741-triangle cap from conformal 1.1839 to 91.5622 and area 5.73 to
// 70.17. C IS STILL THE WEAKEST ENTRY HERE, because a throw is a worse signal than a failed row: lscm()
// returns null for a degenerate pin and this gate's fixtures hand that null straight to distortion(). Recorded
// rather than smoothed over.
//
console.log(fails ? "\nuvLscm-selfcheck: " + fails + " FAILED" : "\nuvLscm-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
