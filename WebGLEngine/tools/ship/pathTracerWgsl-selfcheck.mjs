#!/usr/bin/env node
// WebGLEngine/tools/ship/pathTracerWgsl-selfcheck.mjs -- v4290
//
// GRADES the path tracer's decidable pieces against a real WebGPU device: the generator, the camera, and the
// primary ray.
//
// *** THE POINT OF THIS GATE IS THAT ITS HEADLINE RESULT IS A ZERO. *** The coverage masks agree on all 2304
// pixels. Two rounds ago that shape shipped twice as a check that could not fail, so nothing here is allowed
// to rest on it: section 6 reports the zero, and section 7 makes the same two renderers disagree on demand in
// the same run. A null result with no control beside it is not a measurement.
//
// The three claims, in the order they have to be made:
//
//   THE LCG STATE IS EXACT.        u32 wrap-around is specified identically in JS and WGSL. A mismatch is a
//                                  port bug with nothing to blame it on.
//   THE LCG VALUE IS NOT PORTABLE. Not merely inexact -- NOT PORTABLE. WGSL lets a device pick either of the
//                                  two f32 values nearest an unrepresentable one, and this adapter takes the
//                                  far one on 8.35% of draws by converting through the signed path. So the
//                                  gate asserts the BRACKET, which every conformant device owes, and records
//                                  the adapter's model without ever passing because of it.
//   THE CAMERA IS EXACT, IF YOU LET IT BE. Passing tan(fov) in as a uniform puts the ray directions inside one
//                                  f32 ulp. Computing it in the shader instead costs 144x, legally.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// v4294 -- MOVED TO THE BROWSER-FREE BACKEND. tools/ship/crossBackend-selfcheck.mjs runs every shader
// this gate uses through BOTH harnesses and asserts byte-identity across 41,656 floats, so the browser
// path is still covered -- by one gate, once, instead of by every gate paying a browser launch per call.
// The arithmetic below is unchanged and its numbers are unchanged; only who ran it moved.
import { runWgslComputeNative as runWgslCompute, headlessGpuSkipReason as webgpuSkipReason,
         exitCleanly } from "./headlessGpu.mjs";
import * as PT from "../../physics/render/pathTracerWgsl.mjs";
import { render, coverage, cameraBasis, pixelRay } from "../../physics/render/pathTracer.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (c, name, detail) => {
    console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`);
    if (!c) fails++;
};
const sec = (t) => console.log("\n" + t);
const e = (x) => (typeof x === "number" ? x.toExponential(3) : String(x));

const skip = webgpuSkipReason();
if (skip) {
    console.log("pathTracerWgsl-selfcheck: NO DEVICE -- " + skip);
    console.log("\nFAIL -- 1 check(s)");
    console.log("A GATE THAT SKIPS IS NOT A GATE THAT PASSES. Every number in this file came off a real " +
                "adapter; with no adapter there is nothing to compare and the honest report is red.");
    process.exit(1);
}

// ---------------------------------------------------------------------------------------------------------
sec("1. THE CONSTANTS ARE READ OUT OF THE FILES THAT SHIP THEM, AND A PARSE FAILURE IS FATAL");
// ---------------------------------------------------------------------------------------------------------
{
    const fsrc = fs.readFileSync(path.join(ENG, "physics/render/furnace.mjs"), "utf8");
    const osrc = fs.readFileSync(path.join(ENG, "physics/render/occlusion.mjs"), "utf8");
    ok(fsrc.includes(String(PT.LCG.mul)) && fsrc.includes(String(PT.LCG.inc)),
       "the LCG constants appear in furnace.mjs", `mul ${PT.LCG.mul} inc ${PT.LCG.inc} div ${PT.LCG.div}`);
    ok(osrc.includes("eps = " + PT.EPS) || osrc.includes("eps = 1e-6"),
       "raySphere's eps is occlusion.mjs's own", "eps " + PT.EPS);
    ok(PT.lcgWgsl().includes(PT.LCG.mul + "u") && PT.lcgWgsl().includes(PT.LCG.inc + "u"),
       "the emitted WGSL carries the parsed constants, not retyped ones");
    let threw = false;
    try { PT.parseLcg("function rng(seed){ return Math.random; }"); } catch { threw = true; }
    ok(threw, "*** a source the parse does not recognise RAISES rather than falling back ***",
       "a remembered default would let this file and furnace.mjs drift in silence, which is the whole failure the parse prevents");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. THE GENERATOR'S STATE IS BIT-EXACT ON THE DEVICE");
// ---------------------------------------------------------------------------------------------------------
const N_DRAWS = 512, SEED = 1;
const cpuStates = PT.lcgStatesCpu(SEED, N_DRAWS);
let gpuStates = null, gpuValues = null;
{
    const r = await runWgslCompute({ code: PT.lcgWgsl(), outCount: N_DRAWS * 3,
                                     uniforms: PT.lcgUniforms(SEED, N_DRAWS), workgroups: Math.ceil(N_DRAWS / 64) });
    ok(r.ok, "the generator shader compiles and runs", r.ok ? `adapter ${r.adapter?.vendor}/${r.adapter?.architecture}` : r.reason + " " + JSON.stringify(r.errors || []));
    if (!r.ok) { console.log("\nFAIL -- " + (++fails) + " check(s)"); process.exit(1); }
    gpuStates = Array.from({ length: N_DRAWS }, (_, i) => PT.unpackState(r.values[i * 3], r.values[i * 3 + 1]));
    gpuValues = Array.from({ length: N_DRAWS }, (_, i) => r.values[i * 3 + 2]);

    let match = 0;
    for (let i = 0; i < N_DRAWS; i++) if (gpuStates[i] === cpuStates[i]) match++;
    ok(match === N_DRAWS, "*** every u32 state matches, exactly ***", `${match} of ${N_DRAWS}`);

    // CONTROL. Equality is only evidence if inequality was reachable: a generator off by one in its
    // multiplier must NOT reproduce the sequence, or "they match" is a fact about the comparison.
    const wrong = PT.lcgStatesCpu(SEED, N_DRAWS, { mul: PT.LCG.mul + 1 });
    let wrongMatch = 0;
    for (let i = 0; i < N_DRAWS; i++) if (gpuStates[i] === wrong[i]) wrongMatch++;
    ok(wrongMatch < N_DRAWS / 8, "CONTROL: a multiplier off by one does NOT reproduce the sequence",
       `${wrongMatch} of ${N_DRAWS} coincide`);
}

// ---------------------------------------------------------------------------------------------------------
sec("3. THE GENERATOR'S VALUE IS NOT PORTABLE, AND THE GATE ASSERTS ONLY WHAT THE SPEC PROMISES");
// ---------------------------------------------------------------------------------------------------------
{
    const f64 = PT.lcgValuesCpu(cpuStates);
    let differ = 0, bracketed = 0, exact = 0;
    for (let i = 0; i < N_DRAWS; i++) {
        if (gpuValues[i] !== f64[i]) differ++; else exact++;
        if (PT.bracketsF64(gpuValues[i], f64[i])) bracketed++;
    }
    ok(bracketed === N_DRAWS,
       "*** every device value is one of the two f32 neighbours of the f64 answer ***",
       `${bracketed} of ${N_DRAWS} -- this is the WGSL contract and the only thing portable code may assume`);
    ok(differ > N_DRAWS * 0.9, "and almost none of them EQUAL it, which a correct port cannot",
       `${differ} differ, ${exact} happen to land exactly (state below 2^24)`);

    // The adapter's model is REPORTED, never a pass condition. Another conformant device fails this line
    // while being just as correct, which is precisely the point being recorded.
    const dr = PT.lcgValuesDoubleRounded(cpuStates);
    const near = cpuStates.map((s) => Math.fround(Math.fround(s) / PT.LCG.div));
    let fitDr = 0, fitNear = 0;
    for (let i = 0; i < N_DRAWS; i++) { if (gpuValues[i] === dr[i]) fitDr++; if (gpuValues[i] === near[i]) fitNear++; }
    ok(fitDr !== fitNear,
       "the two legal rounding models are DISTINGUISHABLE on this run, so 'not portable' is measured not assumed",
       `double-rounding fits ${fitDr}/${N_DRAWS}, round-to-nearest fits ${fitNear}/${N_DRAWS}`);
    console.log(`  ----  this adapter converts u32->f32 through the signed path (rounds twice); ` +
                `FLOAT_BOUNDARY records ${PT.FLOAT_BOUNDARY.otherNeighbour} of ${PT.FLOAT_BOUNDARY.highStates} ` +
                `high states landing on the far neighbour over ${PT.FLOAT_BOUNDARY.draws} draws. NOT A PASS CONDITION.`);
}

// ---------------------------------------------------------------------------------------------------------
sec("4. render() AND coverage() BUILD THE SAME RAYS -- WHICH IS WHAT THE v4290 EXTRACTION PROTECTS");
// ---------------------------------------------------------------------------------------------------------
{
    // Not a tautology: `render` walks its own jitter/stratification path into `trace`, and `coverage` calls
    // `intersect` directly. Before v4290 each held a private copy of the camera and nothing compared them.
    // plantNoJitter with a 1x1 stratum puts render's sample exactly at the pixel centre, where coverage looks.
    const emissive = PT.SCENE.map((s) => ({ ...s, albedo: 0, emit: 1 }));
    const opts = { w: 24, h: 24, eye: PT.VIEW.eye, look: PT.VIEW.look, up: PT.VIEW.up, fovDeg: PT.VIEW.fovDeg };
    const buf = render(emissive, { ...opts, spp: 1, strat: true, plantNoJitter: true, nee: false, maxDepth: 1, sky: () => 0 });
    const mask = coverage(emissive, opts);
    let dis = 0, lit = 0;
    for (let i = 0; i < 24 * 24; i++) { const l = buf[i] > 0 ? 1 : 0; lit += l; if (l !== mask[i]) dis++; }
    ok(dis === 0 && lit > 0, "*** the renderer and its coverage mask land on the same pixels ***",
       `${lit} lit, ${dis} disagreements -- two camera copies drifting apart would show up here and nowhere else`);

    const B = cameraBasis(opts);
    const dotFR = B.fwd.reduce((a, v, i) => a + v * B.right[i], 0);
    const len = Math.hypot(...B.right);
    ok(Math.abs(dotFR) < 1e-15 && Math.abs(len - 1) < 1e-15, "the basis is orthonormal",
       `fwd.right ${e(Math.abs(dotFR))}, |right| ${len}`);
    ok(pixelRay(0, 0, 0.5, 0.5, 24, 24, B)[0] < 0 && pixelRay(23, 0, 0.5, 0.5, 24, 24, B)[0] > 0,
       "and it is not mirrored: pixel column 0 looks left, the last column looks right");
}

// ---------------------------------------------------------------------------------------------------------
sec("5. THE CAMERA IS EXACT WHEN tan(fov) IS PASSED IN, AND 144x WORSE WHEN THE SHADER COMPUTES IT");
// ---------------------------------------------------------------------------------------------------------
const { w: VW, h: VH } = PT.VIEW, NPIX = VW * VH;
const cpuPix = PT.coverageCpu();
async function shoot(shaderTan) {
    const r = await runWgslCompute({ code: PT.coverageWgsl({ shaderTan }), outCount: NPIX * PT.COVERAGE_STRIDE,
                                     uniforms: PT.coverageUniforms(), workgroups: Math.ceil(NPIX / 64) });
    if (!r.ok) return null;
    const gpu = PT.decodeCoverage(r.values, VW, VH);
    let maskDiff = 0, maxDir = 0, maxRelT = 0, gpuHits = 0;
    for (let i = 0; i < NPIX; i++) {
        const a = cpuPix[i], b = gpu[i];
        if (b.hit) gpuHits++;
        if (a.hit !== b.hit) maskDiff++;
        for (let k = 0; k < 3; k++) maxDir = Math.max(maxDir, Math.abs(a.dir[k] - b.dir[k]));
        if (a.hit && b.hit) maxRelT = Math.max(maxRelT, Math.abs(b.t - a.t) / a.t);
    }
    return { maskDiff, maxDir, maxRelT, gpuHits, gpu };
}
const clean = await shoot(false);
const plant = await shoot(true);
{
    ok(clean && plant, "both camera variants compile and run");
    if (!clean || !plant) { console.log("\nFAIL -- " + (++fails) + " check(s)"); process.exit(1); }
    const ULP = 1.1920929e-7;
    ok(clean.maxDir < ULP, "*** with scale passed in, every ray direction is within ONE f32 ulp ***",
       `max component error ${e(clean.maxDir)} vs ulp ${e(ULP)}`);
    ok(plant.maxDir > clean.maxDir * 20,
       "*** and computing tan() in the shader is two orders of magnitude worse ***",
       `${e(plant.maxDir)} vs ${e(clean.maxDir)} -- ${(plant.maxDir / clean.maxDir).toFixed(0)}x`);
    ok(plant.maxRelT > clean.maxRelT * 5, "which carries straight into the hit distances",
       `relative t ${e(plant.maxRelT)} vs ${e(clean.maxRelT)}`);
    ok(plant.maskDiff === 0,
       "*** and the coverage mask is IDENTICAL under both, so a mask diff tests nothing about a camera ***",
       "144x worse rays, zero mask disagreements -- this is why sections 6 and 7 are two checks and not one");
    console.log(`  ----  WGSL specifies sqrt tightly and sin/cos only to an absolute error near 2^-11; this ` +
                `adapter's tan is off by ${e(PT.BUILTIN_ACCURACY.relErr.tan)} and its sqrt by ` +
                `${e(PT.BUILTIN_ACCURACY.relErr.sqrt)}. Both conformant. Per-frame constants belong in a uniform.`);
}

// ---------------------------------------------------------------------------------------------------------
sec("6. THE MASKS AGREE ON EVERY PIXEL, AND THE NEXT SECTION IS WHY THAT IS A RESULT");
// ---------------------------------------------------------------------------------------------------------
{
    const cpuHits = cpuPix.filter((p) => p.hit).length;
    ok(cpuHits > 400 && cpuHits < NPIX, "the scene actually covers part of the frame",
       `${cpuHits} of ${NPIX} pixels hit geometry -- an empty or a full frame would make the diff below free`);
    ok(clean.gpuHits === cpuHits && clean.maskDiff === 0,
       "f64 CPU and f32 GPU agree about every pixel", `${clean.maskDiff} disagreements over ${NPIX}`);

    const bp = PT.bandInPixels();
    ok(bp.pixels < 1e-4 && bp.widthToResolve > 1000,
       "*** and the band they COULD disagree in is far below one sample ***",
       `${e(bp.pixels)} of a pixel; an image ~${bp.widthToResolve} across would be needed for one ray to land in it`);
    ok(clean.maxRelT > 0, "the hit distances are close but NOT equal, so f32 is still visible in them",
       `max relative t error ${e(clean.maxRelT)}`);
}

// ---------------------------------------------------------------------------------------------------------
sec("7. THE CONTROL: THE SAME TWO RENDERERS, MADE TO DISAGREE ON DEMAND");
// ---------------------------------------------------------------------------------------------------------
{
    const ys = PT.grazeLadder();
    const r = await runWgslCompute({ code: PT.grazeWgsl(), outCount: ys.length * PT.GRAZE_STRIDE,
                                     uniforms: PT.grazeUniforms(ys), workgroups: 1 });
    ok(r.ok, "the grazing sweep compiles and runs", r.ok ? "" : r.reason + " " + JSON.stringify(r.errors || []));
    if (!r.ok) { console.log("\nFAIL -- " + (++fails) + " check(s)"); process.exit(1); }

    const gpuHit = ys.map((_, i) => r.values[i * PT.GRAZE_STRIDE] === 1);
    const cpuHit = PT.grazeCpu(ys).map((c) => c.t !== null);
    const dis = ys.map((y, i) => ({ y, c: cpuHit[i], g: gpuHit[i] })).filter((d) => d.c !== d.g);

    ok(dis.length > 0,
       "*** the comparison CAN fail: rays exist that hit on the GPU and miss on the CPU ***",
       `${dis.length} of ${ys.length} ladder rays disagree -- section 6's zero is a measurement, not an absence`);
    ok(dis.length > 0 && dis.every((d) => d.g && !d.c),
       "and every disagreement points the same way: f32 sees the LARGER sphere",
       dis.length ? `first at y = ${dis[0].y.toPrecision(17)}` : "none");

    const gi = PT.flipIndex(gpuHit), ci = PT.flipIndex(cpuHit);
    ok(gi > ci, "the GPU silhouette sits outside the CPU one", `band ${e(ys[gi] - ys[ci])} in impact parameter`);
    ok(cpuHit[0] && !cpuHit[ys.length - 1] && gpuHit[0] && !gpuHit[ys.length - 1],
       "CONTROL: the ladder straddles tangency on both machines",
       "both hit at the low end and miss at the high end, so the flip is inside the sweep and not off its edge");
}

// ---------------------------------------------------------------------------------------------------------
sec("8. THE SURFACE EPSILON, ON A RAY THAT ACTUALLY REACHES IT");
// ---------------------------------------------------------------------------------------------------------
{
    // v4290's third sabotage set eps to 0 and this gate stayed ALL GREEN across thirty-two checks. Primary
    // rays from an eye outside the scene clear the epsilon by six orders of magnitude, so nothing here could
    // see it. A ray that STARTS on the surface can: its near root is the gap between origin and sphere, which
    // is a dial, and eps decides whether that root is taken or refused.
    const r = await runWgslCompute({ code: PT.grazeWgsl(), outCount: PT.GRAZE_STRIDE,
                                     uniforms: PT.surfaceUniforms(), workgroups: 1 });
    ok(r.ok, "the surface probe runs", r.ok ? "" : r.reason + " " + JSON.stringify(r.errors || []));
    if (!r.ok) { console.log("\nFAIL -- " + (++fails) + " check(s)"); process.exit(1); }
    const gpuT = r.values[1];
    const cpuT = PT.surfaceCpu();
    const loose = PT.surfaceCpu({ eps: 0 });

    ok(cpuT !== null && cpuT > 1, "*** the CPU REFUSES the near root and exits the far side ***",
       `t ${cpuT} -- the near root is ${e(PT.SURFACE.nearRootF64)}, under eps ${PT.EPS}`);
    ok(gpuT > 1, "*** and so does the device, on the same ray ***", `t ${gpuT}`);
    ok(Math.abs(gpuT - cpuT) / cpuT < 1e-5, "and they agree about where it comes out",
       `relative ${e(Math.abs(gpuT - cpuT) / cpuT)}`);
    ok(loose !== null && loose < 1e-6 && loose * 1e6 < cpuT,
       "CONTROL: with eps at 0 the same ray takes the near root instead, so this probe IS eps-sensitive",
       `t ${e(loose)} against ${cpuT} -- a factor of ${(cpuT / loose).toExponential(1)}`);
}

// ---------------------------------------------------------------------------------------------------------
sec("9. THE RECORDS SAY WHAT THIS RUN SAYS");
// ---------------------------------------------------------------------------------------------------------
{
    const near = (a, b, tol) => Math.abs(a - b) <= Math.abs(b) * tol;
    ok(PT.MASK.disagreements === clean.maskDiff, "MASK.disagreements matches the run", `${PT.MASK.disagreements}`);
    ok(near(PT.MASK.maxDirErr, clean.maxDir, 0.25), "MASK.maxDirErr is within a quarter of the measured value",
       `recorded ${e(PT.MASK.maxDirErr)}, measured ${e(clean.maxDir)}`);
    ok(near(PT.PLANT_COST.plantMaxDirErr, plant.maxDir, 0.25), "PLANT_COST matches the planted run",
       `recorded ${e(PT.PLANT_COST.plantMaxDirErr)}, measured ${e(plant.maxDir)}`);
    ok(PT.SILHOUETTE.direction.includes("LARGER"), "SILHOUETTE records the direction section 7 measured");
    ok(PT.BUILTIN_ACCURACY.looselySpecified.includes("tan") && PT.BUILTIN_ACCURACY.tightlySpecified.includes("sqrt"),
       "BUILTIN_ACCURACY separates what WGSL pins down from what it does not");
    ok(PT.SURFACE.d === 1 + PT.SURFACE.delta && PT.SURFACE.nearRootF64 === PT.SURFACE.delta,
       "SURFACE records the geometry section 8 fired", `d ${PT.SURFACE.d}, near root ${e(PT.SURFACE.nearRootF64)}`);
}

// ---- SABOTAGE LOG ---------------------------------------------------------------------------------------
//
//   A  the emitted WGSL multiplier changed to mul + 1.
//      -> exit=1, 4 red. The state parity dies (0 of 512) AND THE CONTROL INVERTS: the off-by-one sequence
//      that must NOT reproduce the device now matches 512 of 512. A control that flips under the sabotage it
//      was written for is the only kind worth keeping.
//
//   B  the camera mirrored -- cross(fwd, up) becomes cross(up, fwd).
//      -> exit=1, 7 red, ray directions off by 6.71e-1, and 126 mask disagreements. The mask only catches it
//      because SCENE's second sphere sits off-axis at x = 0.9; a single centred sphere is left-right symmetric
//      and a mirrored camera would have rendered it perfectly.
//
//   C  eps set to 0, so the surface epsilon stops existing.
//      -> *** 0 RED. ALL GREEN ACROSS THIRTY-TWO CHECKS. *** eps was parsed, packed into both uniform blocks
//      and read by both shaders, and nothing could distinguish 1e-6 from 0, because every ray in sections 5
//      to 7 starts outside the scene and clears the epsilon by six orders of magnitude. Not a bug in the
//      code -- a whole constant with no test behind it. Section 8 was written in response: a ray starting a
//      hair off the surface, where the near root IS the gap and eps decides whether it is taken. Redone with
//      section 8 in place: exit=1, 2 red, the device reading 4.768e-7 instead of 2.0.
//
// A found the port bug, B found a real defect the scene was nearly too symmetric to catch, and C found no
// defect at all -- it found machinery that was present, correct and unexercised. That is the fourth round in
// a row where the sharpest sabotage came back with the same answer, and the useful reading is that a constant
// threaded end to end through a pipeline is exactly as untested as one nobody wired up, unless some input
// actually lands near it.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THE TRACER ITSELF. `trace` is ~300 lines of MIS, microfacet lobes, Fresnel, " +
    "energy compensation and roulette assembled from six separately-graded modules, and NONE of it runs on a " +
    "device in this round. What is established is the floor underneath it: the state a GPU port can rely on, " +
    "the value it cannot, the camera it must be handed rather than compute, and how far a primary ray drifts " +
    "in f32. Also unchecked: any surface that is not a sphere, and any claim at all about speed -- the only " +
    "adapter here is a software rasteriser, so every number above is arithmetic and none of it is a timing.");
exitCleanly(fails ? 1 : 0);
