// WebGLEngine/render/probeLab.mjs -- v4579 (Probes 3: the page's scene, as data)
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
//
// v4579 -- A FOURTH THING, AND FLEETS 2-5: THE SPECULAR HALF, STANDING NEXT TO THE DIFFUSE ONE IT WAS MISSING
// SINCE. A row of four spheres at roughness 0, 1/3, 2/3, 1 -- physics/render/specularProbeLit.mjs's material,
// baked from the SAME splatRadiance(cloud, colours, sky) source the probe volume already uses, so the specular
// row and the probe volume are two different techniques lighting the SAME scene, not two different scenes. Four
// fleets rather than one because roughness is baked as a shader CONST here (gfx/device.js's uniform system has
// no "array of vec4" a single named uniform could carry -- specularProbeLit.mjs's own header explains why), so
// each distinct roughness is its own small pipeline, the same multi-fleet mechanism this file already draws
// splats and probes through.
"use strict";
import { sphereCloud } from "../physics/splat/splatMesh.mjs";
import { splatRadiance, packProbes } from "./splatProbes.mjs";
import { fitProbeGrid, bakeFitted } from "./probeFit.mjs";
import { LAYOUTS, EXTRA_FLOATS, makeGpuDrivenScene } from "./gpuDriven.mjs";
import { sphereMesh, litPipelineDesc, litBind } from "./litSphere.mjs";
import { probeLitPipelineDesc, probeBind, uploadProbes } from "./probeLit.mjs";
import { bakeMipChain } from "../physics/render/specularProbeBake.mjs";
import { packSpecularAtlas } from "../physics/render/specularIBLSample.mjs";
import { specularProbeLitPipelineDesc, uploadSpecularAtlas, specularBind } from "../physics/render/specularProbeLit.mjs";
import { brdfLut } from "../physics/render/splitSum.mjs";
import { packCapturedAtlas, bakeCapturedMipChain } from "../physics/render/specularProbeCapture.mjs";
import { captureLiveCubemap } from "./liveCubeCapture.mjs";

export const LAB = Object.freeze({ n: 300, radius: 1.6, scale: 0.25, spacing: 0.5, faceSize: 8, probeRadius: 0.045, meshRadius: 0.35, splatMarker: 0.1, sky: [0.2, 0.2, 0.2], eyeDist: 1.1 });
export const SPEC_ROW = Object.freeze({ count: 4, radius: 0.12, y: 1.0, spacing: 0.35, F0: [0.5, 0.4, 0.2],
    mipCount: 4, faceSize0: 8, minFaceSize: 3, samples: 32, lutK: 8, lutR: 8, lutSamples: 128 });
export const TONES = Object.freeze({ warm: [1, 0.5, 0.1], cool: [0.1, 0.5, 1] });
export const TINTS = Object.freeze([TONES.warm, TONES.cool]);   // tint 1 warm, tint 2 cool

/** the two-tone shell: a splat above the horizon is warm, below it cool */
export function labCloud({ n = LAB.n, radius = LAB.radius, scale = LAB.scale } = {}) {
    const cloud = sphereCloud({ n, radius, scale, opacity: 1 }), colours = new Float32Array(n * 3), tone = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const up = cloud.positions[i * 3 + 1] > 0, t = up ? TONES.warm : TONES.cool; tone[i] = up ? 1 : 2; colours[i * 3] = t[0]; colours[i * 3 + 1] = t[1]; colours[i * 3 + 2] = t[2]; }
    return { cloud, colours, tone };
}

/** the specular row: `SPEC_ROW.count` spheres at evenly-spaced roughness, baked from the SAME splatRadiance
 *  source the probe volume already uses -- one shared atlas (the mip chain does not depend on roughness, only
 *  the material's PIPELINE choice of which mip range to read does), positions in a line above the probe volume
 *  so the row and the volume are visibly two techniques on one scene rather than two separate demos. */
export function specLabRow(cloud, colours, o) {
    const radianceOf = splatRadiance(cloud, colours, o.sky);
    const mips = bakeMipChain(radianceOf, [0, 0, 0], { mipCount: o.mipCount, faceSize0: o.faceSize0, minFaceSize: o.minFaceSize, samples: o.samples });
    const lut = brdfLut({ K: o.lutK, R: o.lutR, samples: o.lutSamples });
    const atlas = packSpecularAtlas(mips, lut);
    const roughnesses = Array.from({ length: o.count }, (_, i) => (o.count <= 1 ? 0 : i / (o.count - 1)));
    const positions = roughnesses.map((_, i) => [(i - (o.count - 1) / 2) * o.spacing, o.y, 0]);
    return { atlas, roughnesses, positions, radius: o.radius, F0: o.F0 };
}

/** the whole lab: the cloud, the fitted and baked grid, the specular row, and the scene's records / extras / fleetOf */
export function probeLab(opts = {}) {
    const o = { ...LAB, ...opts }, { cloud, colours, tone } = labCloud(o);
    const t0 = Date.now(), fit = fitProbeGrid(cloud, { spacing: o.spacing }), bake = bakeFitted(fit.grid, fit.flags, splatRadiance(cloud, colours, o.sky), o.faceSize), ms = Date.now() - t0;
    const packed = packProbes(fit.grid), P = fit.grid.total, N = cloud.count;
    const spec = specLabRow(cloud, colours, { ...SPEC_ROW, sky: o.sky });
    const S = spec.roughnesses.length, count = N + P + 1 + S;
    const records = new Float32Array(count * 4), extras = new Float32Array(count * EXTRA_FLOATS), fleetOf = new Uint32Array(count);
    for (let i = 0; i < N; i++) { records.set([cloud.positions[i * 3], cloud.positions[i * 3 + 1], cloud.positions[i * 3 + 2], o.splatMarker], i * 4); extras[i * EXTRA_FLOATS + 1] = tone[i]; extras[i * EXTRA_FLOATS + 3] = 1; fleetOf[i] = 0; }
    for (let p = 0; p < P; p++) { const r = N + p; records.set([fit.grid.positions[p * 3], fit.grid.positions[p * 3 + 1], fit.grid.positions[p * 3 + 2], o.probeRadius], r * 4); fleetOf[r] = 1; }
    records.set([0, 0, 0, o.meshRadius], (N + P) * 4); fleetOf[N + P] = 1;
    // fleets 2..(2+S-1): one per roughness step, in order, matching specularLabFleets' own fleet list below.
    for (let s = 0; s < S; s++) { const r = N + P + 1 + s, p = spec.positions[s]; records.set([p[0], p[1], p[2], spec.radius], r * 4); fleetOf[r] = 2 + s; }
    return { opts: o, cloud, colours, tone, fit, grid: fit.grid, packed, spec, bake: { baked: bake.baked, filled: bake.filled, ms }, records, extras, fleetOf, count,
             counts: { splats: N, probes: P, solid: fit.solid, open: fit.open, mesh: 1, specular: S } };
}

/** the diffuse-probe fleets, unchanged from before the specular row existed -- split out so labFleets can add
 *  fleets 2..N without this function growing a third responsibility. */
function diffuseLabFleets(device, lab, light) {
    const tex = uploadProbes(device, lab.packed);
    return { tex, fleets: [
        { name: "splats", lods: [{ name: "only", mesh: sphereMesh(1, [1, 1, 1, 1]) }], layout: LAYOUTS.lit, pipeline: litPipelineDesc({ tints: TINTS }), bind: litBind(light) },
        { name: "probed", lods: [{ name: "only", mesh: sphereMesh(2, [1, 1, 1, 1]) }], layout: LAYOUTS.lit, pipeline: probeLitPipelineDesc(), bind: probeBind(lab.packed, tex) },
    ] };
}

/** fleets 2..(2+S-1): one pipeline per roughness step in lab.spec, all sharing the ONE uploaded atlas texture --
 *  the atlas does not vary with roughness, only which mip range a pipeline's baked-in ROUGHNESS constant reads. */
function specularLabFleets(device, lab, eye) {
    const specTex = uploadSpecularAtlas(device, lab.spec.atlas);
    const fleets = lab.spec.roughnesses.map((roughness, i) => ({
        name: `specular_r${roughness.toFixed(2)}`,
        lods: [{ name: "only", mesh: sphereMesh(2, [1, 1, 1, 1]) }],
        layout: LAYOUTS.lit,
        pipeline: specularProbeLitPipelineDesc(lab.spec.atlas, { roughness, F0: lab.spec.F0 }),
        bind: specularBind(specTex, eye),
    }));
    return { specTex, fleets };
}

/** the whole fleet list for makeGpuDrivenScene, with both volumes uploaded to the device. `eye` is the camera's
 *  world position (or a function of the draw ctx returning one) the specular fleets need for their view vector --
 *  the diffuse probe fleets need no such thing, since SH irradiance has no view dependence at all. */
export function labFleets(device, lab, { light = [0, 0, 0, 1], eye = [0, 0, 0] } = {}) {
    const d = diffuseLabFleets(device, lab, light), s = specularLabFleets(device, lab, eye);
    return { tex: d.tex, specTex: s.specTex, fleets: [...d.fleets, ...s.fleets] };
}

// ---------------------------------------------------------------------------------------------------------------
// v4581 -- THE SPECULAR ROW'S ATLAS, CAPTURED FROM A REAL RENDER INSTEAD OF specLabRow'S ANALYTIC STAND-IN.
//
// specularProbeCapture.mjs named this precisely as what it did NOT attempt: "the captured scene is still
// specularProbeBake's own splatRadiance-driven radianceOf, point-sampled through this tree's existing cube-bake
// geometry -- not a real-time rasterised frame of the gpuDriven scene's actual fleets." These two functions are
// that frame. diffuseCaptureScene builds a scene of JUST the splats, probes and mesh (fleets 0-1, records
// [0, N+P+1)) -- what a specular probe REFLECTS -- deliberately WITHOUT the specular row itself: a probe
// capturing its own reflective neighbours is a self-reference problem this file does not attempt to solve.
// captureLiveSpecAtlas renders that scene through render/liveCubeCapture.mjs's captureLiveCubemap and packs the
// result the SAME way specLabRow's analytic bake already is (specularIBLSample.packSpecularAtlas via
// specularProbeCapture.packCapturedAtlas) -- so the resulting atlas is a drop-in alternative to lab.spec.atlas
// for uploadSpecularAtlas/specularProbeLitPipelineDesc, not a second material or a second sampler.
//
// BOTH FUNCTIONS NEED A REAL `device` AND ARE ASYNC (captureLiveCubemap awaits a readback per face), so neither
// can run inside probeLab()'s own headless CPU path -- a caller renders the base scene first (labFleets), then
// calls captureLiveSpecAtlas on the SAME device to get a second atlas, on demand, once. Nothing here changes
// labFleets or SPEC_ROW's analytic row: the existing four spheres and their already cross-backend-verified
// pixels (tools/ship/probeLab-selfcheck.mjs) are untouched.

/** A gpuDriven scene of just the diffuse half (splats, probes, the mesh) -- see this section's header for why the
 *  specular row is deliberately excluded from its own captured environment. */
export function diffuseCaptureScene(device, lab, light = [0, 0, 0, 1]) {
    const { fleets } = diffuseLabFleets(device, lab, light);
    const diffuseCount = lab.counts.splats + lab.counts.probes + 1;
    return makeGpuDrivenScene(device, {
        fleets, thresholds: [],
        records: lab.records.slice(0, diffuseCount * 4),
        headings: lab.extras.slice(0, diffuseCount * EXTRA_FLOATS),
        fleetOf: lab.fleetOf.slice(0, diffuseCount),
    });
}

/** The specular row's atlas, captured from a REAL RENDER of the diffuse half through `device` rather than
 *  specLabRow's analytic splatRadiance stand-in. `opts` forwards to captureLiveCubemap (size, near, far,
 *  background) and takes `light` for diffuseCaptureScene's own bind. */
export async function captureLiveSpecAtlas(device, lab, eye, opts = {}) {
    const scene = diffuseCaptureScene(device, lab, opts.light);
    const capture = await captureLiveCubemap(device, scene, eye, opts);
    return packCapturedAtlas(capture);
}

/** ONE extra sphere, standing at `position`, its material's atlas captured LIVE from that same position rather
 *  than shared with specLabRow's analytic four -- so a page can draw it beside the existing row rather than
 *  through it: labFleets, SPEC_ROW and the row's own already-verified pixels are untouched by this. Returns
 *  `records`/`extras`/`fleetOf` EXTENDED past `lab`'s own by one record (copies, `lab` itself is not mutated)
 *  and the one fleet to append to labFleets' own list, at `fleetIndex` (right after the analytic row's fleets --
 *  the row's own fleet count is `lab.spec.roughnesses.length`, read from `lab` rather than assumed, so this
 *  still lands correctly if SPEC_ROW.count ever changes). `position` doubles as the sphere's own world position
 *  AND the probe position the capture renders from, which is what a real-time reflection probe means: the
 *  environment a reflective object shows is the one its OWN position sees. The bind hook tracks the ACTUAL
 *  per-frame camera (a function of the draw ctx, specularBind's own convention for this), not a value fixed at
 *  the moment this function was called -- a page that captures once per rebuild but draws every frame needs its
 *  reflections to track the frame's own eye, not the eye rebuild() happened to see.
 *
 * *** NOT captureLiveSpecAtlas: THAT ATLAS HAS NO LUT, AND THE REAL MATERIAL NEEDS ONE. *** captureLiveSpecAtlas
 * packs through packCapturedAtlas's EMPTY_LUT (K=R=0) -- correct for physics/render/specularProbeCapture.mjs's
 * own use, grading the PREFILTER against an independent CPU reference, which never reads the LUT region at all.
 * specularProbeLitWgsl's fragment stage DOES: sampleAtlasLutM reads LUT_K/LUT_R consts baked from the SAME
 * atlas, and with K=R=0 its clamp() bounds invert (clamp(x, 0, -1)) -- caught on a real device, not reasoned
 * about, as a pipeline validation failure ("[Invalid RenderPipeline] is invalid") when this function's first
 * draft reused captureLiveSpecAtlas directly. So this packs its own atlas with a REAL brdfLut(), the same
 * K/R/samples SPEC_ROW's analytic row already uses -- the environment is captured live, the BRDF table is the
 * SAME closed-form table every material in this arc shares (it does not depend on the environment at all).
 *
 * v4583 -- ROUGHNESS IS NO LONGER INERT HERE. Until now this packed the ONE raw capture (alpha 0, mirror-sharp)
 * as a 1-mip atlas, so sampleSpecularAtlasM's mip blend always resolved to that single level regardless of the
 * `roughness` argument -- named honestly rather than hidden, and the invariance was proven (not just argued) by
 * specularProbeCapture-selfcheck.mjs's mipCount-1=0 case. physics/render/specularProbeCapture.mjs's
 * bakeCapturedMipChain now convolves that SAME raw capture into a full chain (specularProbeBake.bakeMipChain's
 * own shape and mipRoughness/mipAlpha/mipFaceSize formulas -- the same ones specLabRow's analytic row already
 * bakes through), so this packs a CHAIN, not a single level, and `roughness` now selects a genuinely different
 * mip the same way it already does on the analytic row's four spheres (proven on a captured source, not just
 * argued by analogy, in specularProbeCapture-selfcheck.mjs's own chain section: rougher mips measurably flatten,
 * a reversed-order sabotage breaks that, and the remaining captured-vs-analytic gap is Monte-Carlo variance at
 * this function's sample count, not a logic error). `mipCount`/`minFaceSize`/`samples` default from SPEC_ROW --
 * the row's own knobs -- so the live sphere's chain is comparable to, not a second unrelated set of parameters
 * from, the technique it stands beside. */
export async function addLiveSpecSphere(device, lab, position, { radius = SPEC_ROW.radius, roughness = 0, F0 = SPEC_ROW.F0, size = 16,
    mipCount = SPEC_ROW.mipCount, minFaceSize = SPEC_ROW.minFaceSize, samples = SPEC_ROW.samples, ...captureOpts } = {}) {
    const scene = diffuseCaptureScene(device, lab, captureOpts.light);
    const capture = await captureLiveCubemap(device, scene, position, { size, ...captureOpts });
    const mips = bakeCapturedMipChain(capture, { mipCount, minFaceSize, samples });
    const lut = brdfLut({ K: SPEC_ROW.lutK, R: SPEC_ROW.lutR, samples: SPEC_ROW.lutSamples });
    const atlas = packSpecularAtlas(mips, lut);
    const specTex = uploadSpecularAtlas(device, atlas);
    const fleetIndex = 2 + lab.spec.roughnesses.length;
    const fleet = {
        name: "specular_live",
        lods: [{ name: "only", mesh: sphereMesh(2, [1, 1, 1, 1]) }],
        layout: LAYOUTS.lit,
        pipeline: specularProbeLitPipelineDesc(atlas, { roughness, F0 }),
        bind: specularBind(specTex, (ctx) => ctx.eye),
    };
    const count = lab.count + 1;
    const records = new Float32Array(count * 4), extras = new Float32Array(count * EXTRA_FLOATS), fleetOf = new Uint32Array(count);
    records.set(lab.records); extras.set(lab.extras); fleetOf.set(lab.fleetOf);
    records.set([position[0], position[1], position[2], radius], lab.count * 4);
    fleetOf[lab.count] = fleetIndex;
    return { fleet, fleetIndex, records, extras, fleetOf, count, atlas, specTex };
}

/** the HUD line, from the numbers and nothing else */
export function labHud(lab) {
    const b = lab.fit.box, c = lab.counts;
    return `${c.probes} probes (${lab.grid.counts.join(" x ")}), ${c.solid} solid and filled, ${lab.bake.baked} baked from ${lab.opts.faceSize * lab.opts.faceSize * 6} texels each in ${lab.bake.ms} ms` +
           ` -- box [${b.min.map((v) => v.toFixed(2)).join(", ")}] .. [${b.max.map((v) => v.toFixed(2)).join(", ")}] from ${b.occupied} occupied voxels -- ${c.splats} splats`;
}
