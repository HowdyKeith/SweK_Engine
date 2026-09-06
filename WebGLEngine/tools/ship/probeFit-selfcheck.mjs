#!/usr/bin/env node
// WebGLEngine/tools/ship/probeFit-selfcheck.mjs -- v4515
//
// THE OCCUPANCY-FIT PROBE BOX (Probes 2): render/probeFit.mjs, headless. Section 1, the quantile on hand lists. Section 2, the
// box on the sphereCloud: it holds the shell and nothing far from it, keeps at least 1 - 2 trim of the occupied voxels per
// axis, and the apron widens it by exactly apron cells a side; the SAME cloud plus ONE outlier splat far away fits the same
// box (the outlier is one voxel in thousands) while cloudBounds stretches to it, and the probe count is the measured factor
// smaller; with trim 0 the outlier is inside. Section 3, solid probes on the analytic ball: the flags are exactly the
// brute-force test of each probe's voxel, a probe outside is open, one inside is solid. Section 4, the fill on hand grids:
// a line with solid ends takes the nearest open probe, a tie takes the first index, a filled probe's coefficients are an
// open probe's, no open probe leaves zeros; bakeFitted renders faces for the open probes ONLY (a spy counts the calls) and
// the filled probes equal their source. Section 5, end to end on the two-tone shell: the probes inside the shell's splats
// are the solid ones, none was rendered, and the centre probe (open, inside the shell) reads the shell's two tones.
//
// MEASURED AT v4515: the 600-splat shell of radius 1.5 rasterises to 10,159 occupied voxels at 0.1 cells and fits [-1.7, 1.7] on
// every axis keeping all of them; with one outlier at x 9 the box is the same (kept 10,159 of 10,240) while cloudBounds reaches
// 9.4, the bounds grid spending 1,944 probes to the fit's 512 (a factor 3.8); trim 0 lets the outlier in; the flags on the ball
// equal the brute-force test on 2,197 probes (296 solid; 171 deep ones all solid, 1,736 far ones all open); end to end 78 of 512
// probes are solid and on the shell, 434 rendered in 0.46 s, and the centre reads up (3.08, 1.57, 0.37) against down (0.37,
// 1.57, 3.08). THE CORRECTION: the first hand grid for the fill was a box of zero height, and probeGrid's two-probe minimum put
// an open twin at every solid probe's own position (nearest open at distance 0); the line is a 5 x 2 x 2 unit box now.
//
// SABOTAGE (v4515): A  the trim ignored (quantile at 0 and 1)                 -> 4 red: the outlier inside (box max x 9.4), the
//                                                                                fitted grid the bounds grid's 1,944, a solid probe
//                                                                                off the shell.
//                   B  the fill ignoring the flags (nearest probe, itself)    -> 2 red, then the gate THROWS: a solid probe's source
//                                                                                is itself, which was never baked, and the copy
//                                                                                reads undefined -- exit 1 either way.
//                   C  bakeFitted rendering the solid probes too              -> 2 red: the spy counts 1,920 calls for 1,632, and
//                                                                                the no-open-probe grid bakes.
//                   D  the apron not applied                                  -> 1 red: the apron hold.
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/probeFit-selfcheck.mjs      (~3 s)
"use strict";
import { FIT, quantileOf, occupancyBox, solidProbes, nearestOpen, bakeFitted, fitProbeGrid } from "../../render/probeFit.mjs";
import { probeGrid, probeIndex, cloudBounds, splatRadiance, sampleProbes, evalSH, irradianceSH, SQRT_4PI } from "../../render/splatProbes.mjs";
import { sphereCloud, ballVolume, createVolume, rasterise, getDensity, voxelOf, ISO } from "../../physics/splat/splatMesh.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const withOutlier = (cloud, at) => ({ count: cloud.count + 1, positions: Float32Array.from([...cloud.positions, ...at]), scales: Float32Array.from([...cloud.scales, 0.25, 0.25, 0.25]), opacities: Float32Array.from([...cloud.opacities, 1]) });

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. the quantile");
{
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    ok("quantile 0 is the first element and 1 the last", quantileOf(s, 0) === 1 && quantileOf(s, 1) === 10);
    ok("quantile 0.5 of ten is the fifth (floor(0.5 * 9) = 4)", quantileOf(s, 0.5) === 5);
    ok("quantile 0.01 of ten is still the first; of a thousand it is the eleventh", quantileOf(s, 0.01) === 1 && quantileOf(Array.from({ length: 1000 }, (_, i) => i), 0.01) === 9);
    ok("a one-element list answers itself at every quantile", quantileOf([7], 0) === 7 && quantileOf([7], 0.5) === 7 && quantileOf([7], 1) === 7);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. the box on the shell, with and without an outlier");
{
    const cloud = sphereCloud({ n: 600, radius: 1.5, scale: 0.2, opacity: 1 });
    const box = occupancyBox(cloud), CS = FIT.cellSize;
    report(`shell: ${box.occupied} occupied voxels, box [${box.min.map((v) => v.toFixed(2))}] .. [${box.max.map((v) => v.toFixed(2))}], kept ${box.kept}`);
    ok("the box holds the shell (radius 1.5 plus the splat footprint) and reaches no further than 2.2 on any side", box.min.every((v) => v <= -1.6 && v >= -2.2) && box.max.every((v) => v >= 1.6 && v <= 2.2));
    ok("it keeps at least 1 - 2 trim of the occupied voxels per axis (98 % of all)", box.kept >= box.occupied * (1 - 2 * FIT.trim) ** 3 && box.kept > 0.9 * box.occupied, `${(100 * box.kept / box.occupied).toFixed(1)} %`);
    const b0 = occupancyBox(cloud, { apron: 0 }), b3 = occupancyBox(cloud, { apron: 3 });
    ok("the apron widens the box by exactly apron cells a side", b0.min.every((v, a) => near(box.min[a], v - CS) && near(b3.min[a], v - 3 * CS)) && b0.max.every((v, a) => near(box.max[a], v + CS) && near(b3.max[a], v + 3 * CS)));
    ok("a voxel spans a cell: with apron 0 the box's width is (hi - lo + 1) cells", b0.max.every((v, a) => near(v - b0.min[a], (b0.hi[a] - b0.lo[a] + 1) * CS)));
    const far = withOutlier(cloud, [9, 0, 0]), bFar = occupancyBox(far), cb = cloudBounds(far, 0);
    ok("ONE outlier at x 9: cloudBounds stretches to it", cb.max[0] >= 9);
    ok("*** and the occupancy box does not -- the outlier is one voxel among thousands and falls outside the trim ***", near(bFar.max[0], box.max[0]) && near(bFar.min[0], box.min[0]) && bFar.kept === box.kept, `box max x ${bFar.max[0].toFixed(2)}, kept ${bFar.kept} of ${bFar.occupied}`);
    const gFit = probeGrid({ min: bFar.min, max: bFar.max }, 0.5), gAll = probeGrid(cloudBounds(far, 0.3), 0.5);
    ok(`the fitted grid spends ${gFit.total} probes where the bounds grid spends ${gAll.total} (a factor ${(gAll.total / gFit.total).toFixed(1)})`, gAll.total > 2 * gFit.total);
    const bTrim0 = occupancyBox(far, { trim: 0 });
    ok("CONTROL: with trim 0 the outlier is inside the box", bTrim0.max[0] >= 9 && bTrim0.kept === bTrim0.occupied);
    ok("a cloud fainter than the threshold everywhere fits no box, said by name", occupancyBox(sphereCloud({ n: 50, opacity: 0.3 })).min === null && (() => { try { fitProbeGrid(sphereCloud({ n: 50, opacity: 0.3 })); return false; } catch (e) { return /no occupied voxel/.test(e.message); } })());
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("3. solid probes on the analytic ball");
{
    const vol = ballVolume({ radius: 1, cellSize: 0.1 }), g = probeGrid({ min: [-1.5, -1.5, -1.5], max: [1.5, 1.5, 1.5] }, 0.25), flags = solidProbes(g, vol);
    let brute = 0, agree = 0; const inside = [], outside = [];
    for (let i = 0; i < g.total; i++) { const p = [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]], [x, y, z] = voxelOf(vol, p[0], p[1], p[2]), s = getDensity(vol, x, y, z) >= ISO ? 1 : 0; brute += s; if (s === flags[i]) agree++; if (Math.hypot(...p) < 0.85) inside.push(i); if (Math.hypot(...p) > 1.2) outside.push(i); }
    ok(`the flags are the brute-force test of each probe's voxel on all ${g.total} probes`, agree === g.total && brute > 0, `${brute} solid`);
    ok("every probe deeper than 0.85 in the ball is solid and every probe beyond 1.2 is open", inside.every((i) => flags[i] === 1) && outside.every((i) => flags[i] === 0), `${inside.length} inside, ${outside.length} outside`);
    ok("the centre probe is solid and a corner probe open", flags[probeIndex(g.counts, 6, 6, 6)] === 1 && flags[0] === 0);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("4. the fill and the bake on hand grids");
{
    // 5 x 2 x 2 at unit steps: the x row at y 0 z 0 is the line; each of its probes has a y 1 and a z 1 neighbour at the same unit distance
    // (a box of zero height would put those neighbours AT the same position -- probeGrid keeps two probes per axis -- which is what the first draft did)
    const line = probeGrid({ min: [0, 0, 0], max: [4, 1, 1] }, 1);
    const flags = new Uint8Array(line.total); flags[probeIndex(line.counts, 0, 0, 0)] = 1; flags[probeIndex(line.counts, 4, 0, 0)] = 1; flags[probeIndex(line.counts, 2, 0, 0)] = 1;
    const i1 = probeIndex(line.counts, 1, 0, 0), i3 = probeIndex(line.counts, 3, 0, 0);
    ok("a solid end probe's nearest open is the probe beside it on the line (index 1 before the y and z neighbours at 5 and 10)", nearestOpen(line, flags, probeIndex(line.counts, 0, 0, 0)) === i1 && nearestOpen(line, flags, probeIndex(line.counts, 4, 0, 0)) === i3);
    ok("a tie (x 2 between x 1 and x 3, and the y 1 / z 1 neighbours at the same distance) takes the first index", nearestOpen(line, flags, probeIndex(line.counts, 2, 0, 0)) === i1);
    let calls = 0; const spy = (p) => { calls++; return [p[0], 0, 0]; };
    const r = bakeFitted(line, flags, spy, 4);
    ok("bakeFitted renders faces for the open probes only: calls = open * 6 * n^2", calls === (line.total - 3) * 6 * 16 && r.baked === line.total - 3 && r.filled === 3, `${calls} calls`);
    ok("a filled probe's coefficients equal its source's, and the source is open", [0, 2, 4].every((x) => { const i = probeIndex(line.counts, x, 0, 0), s = r.source[i]; return flags[s] === 0 && line.coefficients[i].every((c, k) => c[0] === line.coefficients[s][k][0]); }));
    ok("an open probe is its own source", r.source[i1] === i1 && r.source[i3] === i3);
    ok("the filled end reads the neighbour's position, not its own", near(line.coefficients[probeIndex(line.counts, 0, 0, 0)][0][0], SQRT_4PI * 1, 1e-6) && near(line.coefficients[probeIndex(line.counts, 4, 0, 0)][0][0], SQRT_4PI * 3, 1e-6));
    const all = new Uint8Array(line.total).fill(1), r2 = bakeFitted(probeGrid({ min: [0, 0, 0], max: [1, 0, 0] }, 1), all.subarray(0, 8), spy, 4);
    ok("no open probe at all: nothing baked, every probe zeros with source -1", r2.baked === 0 && r2.filled === 8 && Array.from(r2.source).every((s) => s === -1));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("5. end to end on the two-tone shell");
{
    const cloud = sphereCloud({ n: 600, radius: 1.5, scale: 0.2, opacity: 1 }), colours = new Float32Array(cloud.count * 3);
    for (let i = 0; i < cloud.count; i++) { const up = cloud.positions[i * 3 + 1] > 0; colours[i * 3] = up ? 1 : 0.1; colours[i * 3 + 1] = 0.5; colours[i * 3 + 2] = up ? 0.1 : 1; }
    const fit = fitProbeGrid(withOutlier(cloud, [0, 9, 0]), { spacing: 0.5 });
    report(`fit: ${fit.grid.counts.join(" x ")} probes, ${fit.solid} solid, ${fit.open} open`);
    ok("the fitted grid ignores the outlier above the shell", fit.grid.max[1] < 3);
    let onShell = 0, deep = 0; for (let i = 0; i < fit.grid.total; i++) { const d = Math.hypot(fit.grid.positions[i * 3], fit.grid.positions[i * 3 + 1], fit.grid.positions[i * 3 + 2]); if (fit.flags[i]) { if (Math.abs(d - 1.5) < 0.35) onShell++; } else if (Math.abs(d - 1.5) < 0.05) deep++; }
    ok("every solid probe sits on the shell (within a footprint of radius 1.5)", fit.solid > 0 && onShell === fit.solid, `${onShell} of ${fit.solid}`);
    let calls = 0; const rad = splatRadiance(cloud, colours, [0.2, 0.2, 0.2]), spy = (p, d) => { calls++; return rad(p, d); };
    const t0 = Date.now(), r = bakeFitted(fit.grid, fit.flags, spy, 8);
    ok(`the bake rendered ${r.baked} open probes and none of the ${r.filled} solid ones`, calls === r.baked * 6 * 64 && r.filled === fit.solid, `${Date.now() - t0} ms`);
    const c = sampleProbes(fit.grid, [0, 0, 0]), ir = irradianceSH(c), up = evalSH(ir, [0, 1, 0]), down = evalSH(ir, [0, -1, 0]);
    ok("the centre reads the shell's two tones: redder up, bluer down", up[0] > down[0] && down[2] > up[2], `up ${up.map((v) => v.toFixed(2))}, down ${down.map((v) => v.toFixed(2))}`);
    const solidI = Array.from(fit.flags).findIndex((f) => f === 1), src = r.source[solidI];
    ok("a solid probe on the shell carries its nearest open probe's coefficients, not a bake from inside the splat", src >= 0 && fit.flags[src] === 0 && fit.grid.coefficients[solidI][0][0] === fit.grid.coefficients[src][0][0]);
}

console.log(`\n${fails === 0 ? "all checks pass" : fails + " check(s) FAILED"}`);
process.exit(fails ? 1 : 0);
