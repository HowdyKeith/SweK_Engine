// tools/mesh/xatlasRef-selfcheck.mjs -- v4560
//
// Run: node tools/mesh/xatlasRef-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// *** physics/mesh/uvLscm.mjs WAS GRADED ONLY AGAINST ITSELF FOR SIX ROUNDS. ***
//
// Every property its own gate holds it to is a property it asserts about its own output: charts do not
// overlap, distortion is under a bound it chose, the pack fits in the square it defined. All true, all
// self-referential, and none of them can say whether the segmentation is any GOOD -- "good" is a comparison,
// and there was nothing to compare against. vendor/xatlas is the reference implementation of the same
// pipeline; this runs both over the same meshes.
//
// *** ONE METRIC OVER TWO TOOLS, NOT TWO TOOLS' OWN METRICS. *** Asking each side for its own quality number
// would compare two definitions. Everything below is computed by tools/mesh/xatlasRef.mjs from
// (positions, triangles, uv), whichever unwrapper produced them:
//
//   stretchP90   90th percentile of per-triangle UV-area / 3D-area, divided by its own median. UNIFORMITY.
//   densityP10   the same ratio RAW, at the 10th percentile. Absolute texture per unit surface at the
//                worst-served tenth of the mesh -- packing and stretch together.
//
// AND THE SECOND ONE IS WHY THIS FILE EXISTS RATHER THAN A ONE-LINE VERDICT. On stretch, uvLscm wins on
// three of four fixtures. On density it loses on all four, by up to 2x, and the cylinder says why.
//
// *** THE GATE DOES NOT COMPILE ANYTHING. *** The cold build is 5,166 ms against a 3,000 ms sweep budget, so
// xatlas's side is a RECORD (tools/mesh/xatlas-oracle.json) pinned by the sha256 of the vendor drop, the
// harness, and each fixture's actual mesh bytes. When a current binary happens to exist the record is
// re-derived and compared; when it does not, the hashes still say whether it can have gone stale.
import fs from "node:fs";
import * as X from "./xatlasRef.mjs";
import { unwrapToMesh, halveChart, chartBox, cutWideCharts, nestShapes,
         equaliseChartScale } from "../../physics/mesh/uvLscm.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const REC = JSON.parse(fs.readFileSync(X.RECORD_PATH, "utf8"));

console.log("1. *** THE RECORD IS ONLY WORTH ITS INPUTS, SO ITS INPUTS ARE HASHED ***");
{
    const now = X.inputHashes();
    const bad = Object.entries(REC.inputs).filter(([f, h]) => now[f] !== h);
    const missing = Object.keys(now).filter((f) => !(f in REC.inputs));
    ok("!! the vendored source and the harness are the ones the record was taken from",
       bad.length === 0 && missing.length === 0,
       `${Object.keys(REC.inputs).length} hashed inputs, ${bad.length} changed, ${missing.length} unrecorded. ` +
       `Pinned at ${REC.pin.slice(0, 12)}. This module's own hash is deliberately NOT among them: a staleness ` +
       "signal that fires on a comment edit is one people learn to regenerate past, so what the fixtures " +
       "contribute is hashed as mesh DATA instead.");

    const drift = Object.entries(REC.meshes).filter(([n, m]) => !X.FIXTURES[n] || X.meshHash(X.FIXTURES[n]()) !== m.meshHash);
    ok("!! and every fixture still generates the exact vertices the reference was run on",
       drift.length === 0 && Object.keys(X.FIXTURES).length === Object.keys(REC.meshes).length,
       `${Object.keys(REC.meshes).length} fixtures, ${drift.length} whose vertex and index bytes no longer ` +
       "hash to the recorded value. A recorded measurement of a mesh that has since changed is not a " +
       "measurement of anything.");
}

console.log("\n2. *** BOTH SIDES, ONE METRIC ***");
// *** THE UNWRAP IS DONE ONCE PER FIXTURE AND EVERY SECTION BELOW READS THAT. *** Four unwraps is what this
// gate can afford: it runs 2.4 s against a 3,000 ms budget, and section 5 used to unwrap a fifth time to get
// a UV set it could scale -- a whole sphere solved to prove a division by two.
const MINE = {};
for (const [name, make] of Object.entries(X.FIXTURES)) {
    const mesh = make();
    const M = unwrapToMesh(mesh.positions, mesh.indices);
    MINE[name] = { mesh, M, unwrap: M.unwrap, charts: M.unwrap.chartCount, verts: M.positions.length / 3,
                   m: X.measure(M.positions, M.indices, M.uvs),
                   d: X.density(M.positions, M.indices, M.uvs),
                   r: X.uvRange(M.uvs) };
}
{
    const rows = Object.keys(X.FIXTURES).map((n) => {
        const a = MINE[n], b = REC.meshes[n];
        return { n, mine: a.m.stretchP90, ref: b.stretchP90, dm: a.d.p10, dr: b.densityP10,
                 ch: a.charts, chr: b.charts };
    });
    for (const r of rows)
        console.log(`      ${r.n.padEnd(15)} uvLscm ${String(r.ch).padStart(2)} charts  p90 ${r.mine.toFixed(4)}  ` +
            `densityP10 ${r.dm.toExponential(3)}   |   xatlas ${String(r.chr).padStart(2)} charts  ` +
            `p90 ${r.ref.toFixed(4)}  densityP10 ${r.dr.toExponential(3)}`);

    const wins = rows.filter((r) => r.mine <= r.ref + 1e-9);
    ok("!! *** ON UNIFORMITY THIS TREE'S UNWRAPPER MATCHES OR BEATS THE REFERENCE ON EVERY FIXTURE ***",
       wins.length === rows.length,
       rows.map((r) => `${r.n}: ${r.mine.toFixed(4)} vs ${r.ref.toFixed(4)}`).join("; ") +
       ". That is what dropping maxConformal from 2.0 to 1.05 bought, and the comparison is what found the " +
       "constant: sweeping maxNormalDeg changes nothing, so the merge bound was the parameter that bound.");

    const losses = rows.filter((r) => r.dr > r.dm);
    const worst = rows.reduce((a, b) => (b.dr / b.dm > a.dr / a.dm ? b : a));
    ok("!! *** AND ON ABSOLUTE TEXTURE PER UNIT SURFACE IT STILL LOSES ON EVERY ONE, NOW BY 1.2x TO 1.6x ***",
       losses.length === rows.length && worst.dr / worst.dm < 1.7,
       rows.map((r) => `${r.n}: ${(r.dr / r.dm).toFixed(2)}x`).join("; ") +
       `. Worst is ${worst.n}. THE FIRST ROW ABOVE IS THE PROXY TALKING: stretchP90 divides by its own ` +
       "median, so it grades uniformity and is blind to an atlas that shrank. Halve every chart and it does " +
       "not move. This tree wins the shape of the map and loses the amount of texture the map gets, and only " +
       "one of those two numbers was ever computed here before. *** v4560 MEASURED 1.31x TO 2.01x HERE AND " +
       "v4561 CLOSED PART OF IT: *** equalising chart scale and cutting the one chart that sets the atlas " +
       "took the cylinder 2.01x -> 1.47x and the 24x16 sphere 1.36x -> 1.22x. The BOUND IS ASSERTED FROM " +
       "ABOVE, not from below, so a regression past 1.7x fails -- a floor would let the gap widen quietly.");
}

console.log("\n3. *** THE CYLINDER CONTROL: DEVELOPABLE, BOTH EXACT, AND THE ATLAS IS STILL THE WHOLE GAP ***");
{
    const a = MINE["cylinder 16x6"], b = REC.meshes["cylinder 16x6"];
    ok("!! *** NOTHING LEFT TO BLAME BUT THE ATLAS, AND CUTTING THE STRIP TOOK HALF OF IT BACK ***",
       a.m.stretchP90 === 1 && b.stretchP90 === 1 && a.charts > 1 &&
       b.densityP10 / a.d.p10 < 1.6 && b.densityP10 / a.d.p10 > 1,
       `a cylinder really can be unrolled, and both tools find the exact map: stretchP90 ${a.m.stretchP90} ` +
       `and ${b.stretchP90}, no distortion on either side to argue about. So every remaining difference is ` +
       `the ATLAS. xatlas CUTS the strip into ${b.charts} charts that tile a rectangle at ` +
       `${(100 * b.util).toFixed(1)}% utilisation; v4560 kept it as ONE 1 x 0.426 strip covering 42.2% of ` +
       `the square and lost 2.01x. v4561 cuts it into ${a.charts} covering ${(100 * a.m.uvArea).toFixed(1)}% ` +
       `and the gap is ${(b.densityP10 / a.d.p10).toFixed(2)}x. WHAT IS LEFT IS NOT CHART SHAPE: the pack ` +
       "fills 99.1% of the box it produces and the loss is the band between that box and the SQUARE the UVs " +
       "are normalised into -- 57.0 points on this mesh at v4560, against 0.1 to 3.2 points on every other " +
       "fixture. A non-square atlas is what xatlas spends there (1107x834 here), and whether this tree " +
       "should is a decision about the texture it ships, not a defect.");
}

console.log("\n4. *** THE UVs LAND IN THE UNIT SQUARE -- ASKED OF BOTH SIDES, AND ONE OF THEM FAILED IT ***");
{
    const mineOut = Object.entries(MINE).filter(([, a]) => a.r.outside > 0);
    const refOut = Object.entries(REC.meshes).filter(([, b]) => b.uvOutside > 0);
    const cyl = MINE["cylinder 16x6"];
    ok("!! *** THE PACKER PUT THE WIDEST CHART OUTSIDE THE ATLAS, AND ONLY THE REFERENCE ROUND ASKED ***",
       mineOut.length === 0 && refOut.length === 0 && cyl.r.hi <= 1 && cyl.r.lo >= 0,
       `${Object.keys(MINE).length} fixtures per side, ${mineOut.length} and ${refOut.length} with a ` +
       `coordinate outside [0,1]. The cylinder now spans ${cyl.r.lo.toFixed(6)}..${cyl.r.hi.toFixed(6)}; before ` +
       "v4560 it reached 1.002604, exactly one pad cell of 384 past the edge, on 7 of its 238 coordinates. " +
       "rasterPack seeded its atlas side at the WIDEST CHART'S OWN SPAN, at which that chart needs every " +
       "column and its pad needs two more, the placement scan `x0 + padW <= gridW` then admits NO position, " +
       "and the not-finite fallback dropped it at x = padCells * cell -- past the right edge. Reproduced on " +
       "three of three synthetic packs. It survived six rounds because the ROBOT has enough charts that the " +
       "seed never binds, and the robot is what every check measured.");
}

console.log("\n5. *** THE INSTRUMENT, CHECKED AGAINST THE THING IT IS BLIND TO ***");
{
    // Halving every UV is a pure packing loss: the shape of every triangle's map is untouched and it gets a
    // quarter of the texture. A metric that cannot tell the two apart is exactly what let the merge bound
    // look like a win, so the difference is asserted rather than argued.
    const M = MINE["sphere 24x16"].M;
    const half = M.uvs.map((v) => v * 0.5);
    const a = X.measure(M.positions, M.indices, M.uvs), b = X.measure(M.positions, M.indices, half);
    const da = X.density(M.positions, M.indices, M.uvs), db = X.density(M.positions, M.indices, half);
    ok("!! *** stretchP90 CANNOT SEE AN ATLAS THAT SHRANK AND densityP10 CAN ***",
       a.stretchP90 === b.stretchP90 && Math.abs(da.p10 / db.p10 - 4) < 1e-9,
       `every UV scaled by 0.5: stretchP90 ${a.stretchP90} -> ${b.stretchP90} (unchanged, as a scale-free ` +
       `measure must be) while densityP10 ${da.p10.toExponential(3)} -> ${db.p10.toExponential(3)}, exactly ` +
       "4x down. A quarter of the texture for identical triangle shapes. THE NORMALISED NUMBER IS THE ONE " +
       "THIS TREE HAD, and it is the reason a 2.0 merge bound could sit against its own ceiling for six " +
       "rounds and read as fine.");
}

console.log("\n6. *** THE TWO PASSES v4561 PUT BETWEEN THE SOLVE AND THE PACK, DRIVEN DIRECTLY ***");
{
    // a chart is {tris, uv}; these are built rather than unwrapped, because what is being graded is the
    // pass and not the pipeline, and this gate has 400 ms of budget left
    const strip = (w, h, n) => {           // n quads across, w x h in UV
        const uv = new Map(), tris = [];
        for (let i = 0; i <= n; i++) { uv.set(i * 2, [w * i / n, 0]); uv.set(i * 2 + 1, [w * i / n, h]); }
        for (let i = 0; i < n; i++) tris.push([i * 2, i * 2 + 2, i * 2 + 3], [i * 2, i * 2 + 3, i * 2 + 1]);
        return { tris, uv };
    };
    const scale = (c, k) => ({ tris: c.tris, uv: new Map([...c.uv].map(([v, p]) => [v, [p[0] * k, p[1] * k]])) });

    const c0 = strip(1, 0.25, 8);
    const parts = halveChart(c0);
    const seen = new Set(), all = parts.flatMap((p) => p.tris);
    let restricted = true;
    for (const p of parts) for (const T of p.tris) for (const v of T)
        if (String(p.uv.get(v)) !== String(c0.uv.get(v))) restricted = false;
    for (const T of all) seen.add(T);
    ok("!! a cut PARTITIONS the triangles and carries their UVs across unchanged",
       parts.length === 2 && all.length === c0.tris.length && seen.size === c0.tris.length && restricted,
       `${c0.tris.length} triangles -> ${parts.map((p) => p.tris.length).join(" + ")}, none lost, none in ` +
       "both, every UV identical to the one it had. A cut needs no re-solve at all: the restriction of an " +
       "injective map is injective and every per-triangle number is a property of that triangle's corners.");

    // *** AND EACH PART CARRIES ONLY ITS OWN VERTICES, WHICH IS WHERE THE FIRST VERSION OF THIS WENT WRONG. ***
    // Handing both halves the parent's whole map let each report the PARENT'S box, so the packer placed two
    // shapes that did not exist and the measured coverage did not move at all.
    const boxes = parts.map(chartBox), whole = chartBox(c0);
    ok("!! ...and each half reports ITS OWN box, not the box of the chart it came from",
       boxes.every((b) => b.w < whole.w * 0.75) && Math.abs(boxes[0].h - whole.h) < 1e-12,
       `parent ${whole.w.toFixed(3)} x ${whole.h.toFixed(3)} -> ` +
       boxes.map((b) => `${b.w.toFixed(3)} x ${b.h.toFixed(3)}`).join(" and ") +
       ". Cut across the long axis, so the short side is untouched.");

    // the trigger is DERIVED: one chart wider than the square the area implies, against many that are not
    const wide = [strip(1, 0.25, 8)];
    // *** AND ONE OF THEM IS LONG, WHICH IS WHAT SEPARATES THIS RULE FROM AN ASPECT THRESHOLD. *** The
    // first version of this row used nine square charts, so replacing the derived trigger with "aspect
    // above 1.5" went 0 RED -- nothing in the fixture could tell the two rules apart. The 0.3 x 0.1 strip
    // has an aspect of 3 and a span of 0.3 against a sqrt(total) of 0.92: a threshold cuts it, the rule
    // that asks whether any one chart is wider than the square does not.
    const many = [strip(0.3, 0.1, 3), ...Array.from({ length: 9 }, () => strip(0.3, 0.3, 4))];
    // *** THIS CONDITION WAS WRITTEN ONCE AS `a === 0 === false || b === 0` AND COULD NOT FAIL. *** It
    // parses as (a === 0) === false OR b === 0, so either half passing carried the row -- the species
    // tools/ship/assertionShape.mjs exists to count, written into the gate that grades this round's own
    // work. Both sides are named and both are asserted.
    let rewards = 0;
    const always = () => ++rewards;                  // a packer that rewards every cut it is shown
    const manyCut = cutWideCharts(many, { pack: always });
    const wideCut = cutWideCharts(wide, { pack: always });
    ok("!! *** THE CUT IS OFFERED ONLY WHERE ONE CHART SETS THE ATLAS SIZE, AND THAT IS DERIVED ***",
       manyCut.cuts === 0 && manyCut.charts.length === many.length && wideCut.cuts > 0,
       `nine charts of 0.3 x 0.3 and one 0.3 x 0.1 strip: widest span 0.300 against sqrt(total area) ` +
       `${Math.sqrt(many.reduce((t, c) => { const b = chartBox(c); return t + b.w * b.h; }, 0)).toFixed(3)}, ` +
       "so no rearrangement is blocked by any one shape and NOTHING is cut -- even with a packer that " +
       `rewards every cut it is offered (${manyCut.cuts} cuts). The SAME packer cuts the 1 x 0.25 strip ` +
       `${wideCut.cuts} times, so the refusal is the trigger and not the stub. The question is not "is this ` +
       'chart long", it is "is this chart already wider than the square could be".');

    // ...and where it IS offered, the measurement decides
    let calls = 0;
    const worse = () => 1 / (1 + ++calls);            // every cut looks bad
    const better = () => ++calls;                     // every cut looks good
    calls = 0; const refused = cutWideCharts(wide, { pack: worse });
    calls = 0; const taken = cutWideCharts(wide, { pack: better });
    ok("!! *** AND IT IS ACCEPTED BY MEASUREMENT RATHER THAN BY THE TRIGGER THAT PROPOSED IT ***",
       refused.cuts === 0 && refused.charts.length === 1 && taken.cuts > 0 && taken.charts.length > 1,
       `the same 1 x 0.25 strip: a packer that reports a worse atlas leaves it whole (${refused.cuts} cuts), ` +
       `one that reports a better atlas cuts it (${taken.cuts}). THE FILED PREMISE FOR THIS ROUND -- "split a ` +
       'chart and the atlas gets better" -- IS WRONG AS A RULE: slicing every chart more than 1.5x from ' +
       "square at k = 2, 3 and 4 LOSES coverage on four of five meshes (torus 44.6% -> 40.9%, robot " +
       "37.4% -> 36.0%), and only the cylinder gains. So the trigger proposes and a real pack disposes.");

    // *** THE THIRD ARGUMENT, WHICH IS THE WHOLE OF v4536'S FIX AND WAS DROPPED BY A TWO-PARAMETER ARROW. ***
    const sh = nestShapes([strip(1, 0.25, 8)])[0];
    const n = 48, own = sh.w / n;
    const a = sh.cells(n, n, own), b = sh.cells(n, n, own * 1.4);
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
    ok("!! *** THE MASK CELL IS THE ATLAS CELL: the cell size REACHES the rasteriser ***",
       diff > 0,
       `${diff} of ${a.length} cells differ between two cell sizes. conservativeMask has taken a cellSize ` +
       "since v4536 -- 'the two grids have to be the same grid' -- rasterPack passes `cell` at the call " +
       "site, and the arrow that built the shapes took TWO parameters, so the value arrived and went " +
       "nowhere and the mask fell back to width/columns. THE FIX EXISTED ONLY IN ITS OWN COMMENT. Measured " +
       "on RobotExpressive: the verify loop escalated the pad at 256 and 640 cells, coverage collapsed to " +
       "24.9% at 256 and ran non-monotone in resolution, and repacking the same charts moved the pad " +
       "1 -> 2 and lost 14.1% of the atlas. Connected: pad 1 at every resolution 192 to 640, coverage " +
       "monotone, and the repack exact -- which physics/mesh/uvLscm-selfcheck.mjs asserts on the asset.");

    // equalising is a SCALE, so it must move the densities together and leave the shapes alone
    const P = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]);
    const tri = { tris: [[0, 1, 2], [1, 3, 2]], uv: new Map([[0, [0, 0]], [1, [1, 0]], [2, [0, 1]], [3, [1, 1]]]) };
    const set = [tri, scale(tri, 3), scale(tri, 0.2)];
    const eq = equaliseChartScale(P, set);
    const dens = eq.map((c) => { let uv = 0;
        for (const T of c.tris) { const p = c.uv.get(T[0]), q = c.uv.get(T[1]), r2 = c.uv.get(T[2]);
            uv += Math.abs((q[0] - p[0]) * (r2[1] - p[1]) - (q[1] - p[1]) * (r2[0] - p[0])) / 2; }
        return uv; });
    const area = (cs) => cs.reduce((t, c) => { let uv = 0;
        for (const T of c.tris) { const p = c.uv.get(T[0]), q = c.uv.get(T[1]), r2 = c.uv.get(T[2]);
            uv += Math.abs((q[0] - p[0]) * (r2[1] - p[1]) - (q[1] - p[1]) * (r2[0] - p[0])) / 2; }
        return t + uv; }, 0);
    ok("!! equalising is one SCALE per chart: the densities meet and the TOTAL UV area is unchanged",
       Math.max(...dens) / Math.min(...dens) < 1 + 1e-12 && Math.abs(area(eq) - area(set)) < 1e-12,
       `three copies of one quad at scales 1, 3 and 0.2 -> UV areas ${dens.map((d) => d.toFixed(4)).join(", ")}, ` +
       `total ${area(set).toFixed(4)} before and ${area(eq).toFixed(4)} after. The target is the ` +
       "area-weighted density, so the atlas neither grows nor shrinks -- only the share each chart holds " +
       "of it changes.");
}

console.log("\n7. *** AND WHEN A BINARY IS ALREADY THERE, THE RECORD IS RE-DERIVED RATHER THAN TRUSTED ***");
{
    const bin = X.binaryIfCurrent();
    if (!bin) {
        console.log("  NOTE  no current xatlas binary in the temp cache -- the record was NOT re-derived this run. " +
            "That is the sweep's normal state: the cold build is 5,166 ms against a 3,000 ms budget, so this " +
            "gate never compiles. Section 1's hashes are what stands in, and `node tools/mesh/xatlasRef.mjs " +
            "--record` after `--build` is what refreshes the record.");
        ok("the gate is not vacuous without a compiler: every row above ran",
           Object.keys(MINE).length === Object.keys(REC.meshes).length,
           `${Object.keys(MINE).length} fixtures unwrapped and graded against the record on this run.`);
    } else {
        const diffs = [];
        for (const [name, make] of Object.entries(X.FIXTURES)) {
            const mesh = make();
            const x = X.run(mesh.positions, mesh.indices, { bin });
            const s = X.measure(x.P, x.tris, x.uv), d = X.density(x.P, x.tris, x.uv);
            const b = REC.meshes[name];
            if (x.charts !== b.charts || s.stretchP90 !== b.stretchP90 ||
                Math.abs(d.p10 - b.densityP10) > 5e-6 * Math.max(1, b.densityP10)) diffs.push(name);
        }
        ok("!! *** the recorded reference reproduces exactly, which is also what says xatlas is deterministic ***",
           diffs.length === 0,
           `${Object.keys(X.FIXTURES).length} fixtures re-run through the built binary at ${bin}, ` +
           `${diffs.length} disagreeing with the record. Chart counts, stretchP90 and densityP10 all match. ` +
           "A record nothing ever re-derives is a claim, not a measurement -- so it is re-derived whenever " +
           "the box can, and the hashes carry it when the box cannot.");
    }
}

console.log(fails ? `\nxatlasRef-selfcheck: ${fails} FAILED` : "\nxatlasRef-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
