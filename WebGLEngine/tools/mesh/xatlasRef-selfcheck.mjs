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
import { unwrapToMesh } from "../../physics/mesh/uvLscm.mjs";

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
const MINE = {};
for (const [name, make] of Object.entries(X.FIXTURES)) {
    const m = make();
    const M = unwrapToMesh(m.positions, m.indices);
    MINE[name] = { charts: M.unwrap.chartCount, verts: M.positions.length / 3,
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
    ok("!! *** AND ON ABSOLUTE TEXTURE PER UNIT SURFACE IT LOSES ON EVERY ONE, BY UP TO 2x ***",
       losses.length === rows.length && worst.dr / worst.dm > 1.5,
       rows.map((r) => `${r.n}: ${(r.dr / r.dm).toFixed(2)}x`).join("; ") +
       `. Worst is ${worst.n}. THE FIRST ROW ABOVE IS THE PROXY TALKING: stretchP90 divides by its own ` +
       "median, so it grades uniformity and is blind to an atlas that shrank. Halve every chart and it does " +
       "not move. This tree wins the shape of the map and loses the amount of texture the map gets, and only " +
       "one of those two numbers was ever computed here before.");
}

console.log("\n3. *** THE CYLINDER CONTROL: DEVELOPABLE, BOTH EXACT, AND STILL 2x APART ***");
{
    const a = MINE["cylinder 16x6"], b = REC.meshes["cylinder 16x6"];
    ok("!! *** NOTHING LEFT TO BLAME BUT THE ATLAS ***",
       a.m.stretchP90 === 1 && b.stretchP90 === 1 && b.densityP10 / a.d.p10 > 1.9 && a.charts < b.charts,
       `a cylinder really can be unrolled, and both tools find the exact map: stretchP90 ${a.m.stretchP90} ` +
       `and ${b.stretchP90}, no distortion on either side. xatlas still gets ${(b.densityP10 / a.d.p10).toFixed(2)}x ` +
       `the texture at the worst-served tenth, because it CUTS the strip into ${b.charts} charts that tile a ` +
       `rectangle at ${(100 * b.util).toFixed(1)}% utilisation, while this tree keeps it as ${a.charts} chart ` +
       `covering ${(100 * a.m.uvArea).toFixed(1)}% of the square. Nothing in uvLscm scores packing and nothing ` +
       "splits a chart that is not overlapping, so a single wide strip letterboxes the atlas and no metric " +
       "this tree had could see it. That is a round, and it is filed as one.");
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
    const m = X.FIXTURES["sphere 24x16"]();
    const M = unwrapToMesh(m.positions, m.indices);
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

console.log("\n6. *** AND WHEN A BINARY IS ALREADY THERE, THE RECORD IS RE-DERIVED RATHER THAN TRUSTED ***");
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
