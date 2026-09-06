// WebGLEngine/render/probeLab.mjs -- v4516 (Probes 3: the page's scene, as data)
//
// *** THE PROBE VOLUME AS A ROOM YOU STAND IN. *** splat-probes.html puts the camera INSIDE a two-tone shell of splats
// (warm above the horizon, cool below), fits a probe grid to the shell's occupancy (render/probeFit.mjs), bakes it from the
// v4513 splat source, and draws three things through one gpuDriven scene with two fleets:
//   fleet 0 "splats"  every splat as a small emissive sphere in its own tone -- the lit pipeline's tint chain, index 1 warm
//                     and 2 cool, emissive 1 so the marker is the tone and not a shaded ball;
//   fleet 1 "probed"  every probe as a small sphere and one larger mesh sphere at the origin, drawn by the probe-lit
//                     pipeline (render/probeLit.mjs). A sphere at a probe's own position is lit by THAT probe's coefficients
//                     (the trilinear sample at a probe is the probe), so the grid of small spheres is the volume's own
//                     picture of itself, and the mesh in the middle is what a body standing in the scene would take.
// Everything the page draws is derived here as data, so tools/ship/probeLab-selfcheck.mjs can hold the records, the
// fleet map, the extras and the HUD numbers without a browser, and the frame on the harness.
"use strict";
import { sphereCloud } from "../physics/splat/splatMesh.mjs";
import { splatRadiance, packProbes } from "./splatProbes.mjs";
import { fitProbeGrid, bakeFitted } from "./probeFit.mjs";
import { LAYOUTS, EXTRA_FLOATS } from "./gpuDriven.mjs";
import { sphereMesh, litPipelineDesc, litBind } from "./litSphere.mjs";
import { probeLitPipelineDesc, probeBind, uploadProbes } from "./probeLit.mjs";

export const LAB = Object.freeze({ n: 300, radius: 1.6, scale: 0.25, spacing: 0.5, faceSize: 8, probeRadius: 0.045, meshRadius: 0.35, splatMarker: 0.1, sky: [0.2, 0.2, 0.2], eyeDist: 1.1 });
export const TONES = Object.freeze({ warm: [1, 0.5, 0.1], cool: [0.1, 0.5, 1] });
export const TINTS = Object.freeze([TONES.warm, TONES.cool]);   // tint 1 warm, tint 2 cool

/** the two-tone shell: a splat above the horizon is warm, below it cool */
export function labCloud({ n = LAB.n, radius = LAB.radius, scale = LAB.scale } = {}) {
    const cloud = sphereCloud({ n, radius, scale, opacity: 1 }), colours = new Float32Array(n * 3), tone = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const up = cloud.positions[i * 3 + 1] > 0, t = up ? TONES.warm : TONES.cool; tone[i] = up ? 1 : 2; colours[i * 3] = t[0]; colours[i * 3 + 1] = t[1]; colours[i * 3 + 2] = t[2]; }
    return { cloud, colours, tone };
}

/** the whole lab: the cloud, the fitted and baked grid, and the scene's records / extras / fleetOf */
export function probeLab(opts = {}) {
    const o = { ...LAB, ...opts }, { cloud, colours, tone } = labCloud(o);
    const t0 = Date.now(), fit = fitProbeGrid(cloud, { spacing: o.spacing }), bake = bakeFitted(fit.grid, fit.flags, splatRadiance(cloud, colours, o.sky), o.faceSize), ms = Date.now() - t0;
    const packed = packProbes(fit.grid), P = fit.grid.total, N = cloud.count, count = N + P + 1;
    const records = new Float32Array(count * 4), extras = new Float32Array(count * EXTRA_FLOATS), fleetOf = new Uint32Array(count);
    for (let i = 0; i < N; i++) { records.set([cloud.positions[i * 3], cloud.positions[i * 3 + 1], cloud.positions[i * 3 + 2], o.splatMarker], i * 4); extras[i * EXTRA_FLOATS + 1] = tone[i]; extras[i * EXTRA_FLOATS + 3] = 1; fleetOf[i] = 0; }
    for (let p = 0; p < P; p++) { const r = N + p; records.set([fit.grid.positions[p * 3], fit.grid.positions[p * 3 + 1], fit.grid.positions[p * 3 + 2], o.probeRadius], r * 4); fleetOf[r] = 1; }
    records.set([0, 0, 0, o.meshRadius], (count - 1) * 4); fleetOf[count - 1] = 1;
    return { opts: o, cloud, colours, tone, fit, grid: fit.grid, packed, bake: { baked: bake.baked, filled: bake.filled, ms }, records, extras, fleetOf, count,
             counts: { splats: N, probes: P, solid: fit.solid, open: fit.open, mesh: 1 } };
}

/** the two fleets for makeGpuDrivenScene, with the volume uploaded to the device */
export function labFleets(device, lab, { light = [0, 0, 0, 1] } = {}) {
    const tex = uploadProbes(device, lab.packed);
    return { tex, fleets: [
        { name: "splats", lods: [{ name: "only", mesh: sphereMesh(1, [1, 1, 1, 1]) }], layout: LAYOUTS.lit, pipeline: litPipelineDesc({ tints: TINTS }), bind: litBind(light) },
        { name: "probed", lods: [{ name: "only", mesh: sphereMesh(2, [1, 1, 1, 1]) }], layout: LAYOUTS.lit, pipeline: probeLitPipelineDesc(), bind: probeBind(lab.packed, tex) },
    ] };
}

/** the HUD line, from the numbers and nothing else */
export function labHud(lab) {
    const b = lab.fit.box, c = lab.counts;
    return `${c.probes} probes (${lab.grid.counts.join(" x ")}), ${c.solid} solid and filled, ${lab.bake.baked} baked from ${lab.opts.faceSize * lab.opts.faceSize * 6} texels each in ${lab.bake.ms} ms` +
           ` -- box [${b.min.map((v) => v.toFixed(2)).join(", ")}] .. [${b.max.map((v) => v.toFixed(2)).join(", ")}] from ${b.occupied} occupied voxels -- ${c.splats} splats`;
}
