// WebGLEngine/tools/bakeDendritePlaces.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/bakeDendritePlaces.mjs --in vendor/male-cns/lc10-positions.json --topology brain/lc10Topology.mjs --out brain/lc10Places.mjs [--write]
//
// A PLACE ON ITS SHEET FOR EACH CELL, FOR A MODULE THAT RUNS IN A BROWSER. vendor/male-cns/lc10-positions.json has where each LC10a cell's dendrite is, in voxels. The dendrites of a side lie on a sheet (brain/maleCnsCircuits-selfcheck.mjs pins it). This finds each side's sheet -- the principal axes of its cells' places
// -- and writes two numbers a cell, each its RANK among its side's cells scaled to 0..1 (a rank, so that no length scale is chosen here): ACROSS, along the sheet's second axis pointed toward the midline (0 the lateral end, 1 the medial end), and ALONG, along its first axis pointed toward larger y. Aligned with the
// baked topology's NEURON_ORDER; a neuron with no place (every cell that is not of the positioned type) gets -1. WHICH END OF EITHER AXIS IS THE FRONT OR THE TOP OF THE VISUAL FIELD IS NOT DECIDED HERE: brain/flyTracking.mjs flies both ways round. A bake run by hand; without --write it only says what it would write.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** The principal axes of points: { mean, sd: [3 spreads, largest first], vec: [3 unit vectors] }. A symmetric 3 x 3 eigenproblem by Jacobi rotations. */
export function axesOf(pts) {
    const m = [0, 1, 2].map((i) => pts.reduce((a, p) => a + p[i], 0) / pts.length), A = [0, 1, 2].map((i) => [0, 1, 2].map((j) => pts.reduce((a, p) => a + (p[i] - m[i]) * (p[j] - m[j]), 0) / pts.length)), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 60; sweep++) for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
        if (Math.abs(A[p][q]) < 1e-9) continue;
        const th = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]), c = Math.cos(th), s = Math.sin(th);
        for (let k = 0; k < 3; k++) { const x = A[k][p], y = A[k][q]; A[k][p] = c * x - s * y; A[k][q] = s * x + c * y; }
        for (let k = 0; k < 3; k++) { const x = A[p][k], y = A[q][k]; A[p][k] = c * x - s * y; A[q][k] = s * x + c * y; }
        for (let k = 0; k < 3; k++) { const x = V[k][p], y = V[k][q]; V[k][p] = c * x - s * y; V[k][q] = s * x + c * y; }
    }
    const order = [0, 1, 2].sort((i, j) => A[j][j] - A[i][i]);
    return { mean: m, sd: order.map((i) => Math.sqrt(A[i][i])), vec: order.map((i) => [V[0][i], V[1][i], V[2][i]]) };
}
/** The two ranks of each cell of a positions file: Map(bodyId -> { across, along }). See the header. */
export function placesOf(P) {
    const midX = (P.outputCentres.L[0] + P.outputCentres.R[0]) / 2, out = new Map(), dot = (c, ax, v) => [0, 1, 2].reduce((a, i) => a + (c.centroid[i] - ax.mean[i]) * v[i], 0);
    for (const side of ["L", "R"]) {
        const cells = P.cells.filter((c) => c.somaSide === side), ax = axesOf(cells.map((c) => c.centroid)), s2 = Math.sign(ax.vec[1][0]) === Math.sign(midX - ax.mean[0]) ? 1 : -1, s1 = ax.vec[0][1] >= 0 ? 1 : -1;
        const rank = (vals) => { const order = vals.map((_, i) => i).sort((i, j) => vals[i] - vals[j] || cells[i].bodyId - cells[j].bodyId), r = new Array(vals.length); order.forEach((ci, k) => { r[ci] = k / (vals.length - 1); }); return r; };
        const across = rank(cells.map((c) => s2 * dot(c, ax, ax.vec[1]))), along = rank(cells.map((c) => s1 * dot(c, ax, ax.vec[0])));
        cells.forEach((c, i) => out.set(c.bodyId, { across: across[i], along: along[i] }));
    }
    return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const arg = (k) => { const i = process.argv.indexOf("--" + k); return i < 0 ? null : process.argv[i + 1]; }, inArg = arg("in"), topoArg = arg("topology"), outArg = arg("out");
    if (!inArg || !topoArg || !outArg) { console.error("bakeDendritePlaces: --in <vendored positions json>, --topology <brain/*Topology.mjs> and --out <brain/*Places.mjs> are required"); process.exit(2); }
    const P = JSON.parse(fs.readFileSync(inArg, "utf8")), T = await import(pathToFileURL(path.resolve(topoArg)).href), pl = placesOf(P), r6 = (v) => Math.round(v * 1e6) / 1e6;
    for (const c of P.cells) if (!T.NEURON_ORDER.includes(c.bodyId)) throw new Error(`bakeDendritePlaces: cell ${c.bodyId} is not in the topology`);
    const across = T.NEURON_ORDER.map((b) => (pl.has(b) ? r6(pl.get(b).across) : -1)), along = T.NEURON_ORDER.map((b) => (pl.has(b) ? r6(pl.get(b).along) : -1));
    const text = `// WebGLEngine/${outArg.replace(/\\/g, "/")} -- BAKED by tools/bakeDendritePlaces.mjs from ${inArg.replace(/\\/g, "/")}; do not edit by hand.\n// Aligned with ${topoArg.replace(/\\/g, "/")}'s NEURON_ORDER. ACROSS[i]: the cell's rank (0..1) among its side's cells along its dendritic sheet's second axis, 0 the lateral end and 1 the medial; ALONG[i]: its rank along the sheet's first axis toward larger y; -1 for a neuron with no place.\n"use strict";\nexport const ACROSS = Object.freeze(${JSON.stringify(across)});\nexport const ALONG = Object.freeze(${JSON.stringify(along)});\n`;
    console.log(`[bakeDendritePlaces] ${outArg}: ${pl.size} cells placed of ${T.NEURON_ORDER.length} neurons${process.argv.includes("--write") ? "" : " (dry run: pass --write)"}`);
    if (process.argv.includes("--write")) fs.writeFileSync(outArg, text);
    process.exit(0);
}
