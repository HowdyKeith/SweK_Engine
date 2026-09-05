// WebGLEngine/tools/ship/wgslCorpus.mjs -- v4294; text/ and the two physics producers joined at v4464; physics/mpm, tools/roundhouse and the .wgsl FILES at v4472
//
// *** EVERY WGSL SHADER THE TREE CAN RUN, IN ONE PLACE, SO TWO BACKENDS CAN BE COMPARED ON ALL OF THEM. ***
//
// v4292 built a browser-free WebGPU path on Dawn and proved it byte-identical to the Chromium one -- ON ONE
// SHADER. That was enough to establish the path existed and nowhere near enough to move anything onto it. An
// LCG is 32-bit integer arithmetic and a divide; it exercises none of what actually differs between two
// implementations of the same API: workgroup memory, barriers, transcendentals, cancellation.
//
// So this collects the shaders that live in MODULES and can be driven with a uniform buffer and a storage
// buffer, and hands them to whoever wants to run them. It builds them by IMPORTING the modules -- a corpus of
// retyped shader source would be a second declaration of every shader in it, and would agree with the tree
// exactly until somebody edited one.
//
// ---- WHAT IS DELIBERATELY NOT IN IT, AND WHY --------------------------------------------------------------
//
// TWO SHADERS THE TREE RUNS ARE ABSENT, and naming them is the point of `EXCLUDED` rather than quietly
// shipping a corpus that looks complete:
//
//   fusedWgslToTexture   writes a STORAGE TEXTURE. tools/ship/headlessGpu.mjs has no texture path at all, so
//                        there is nothing to compare against and a corpus entry would be a promise it cannot
//                        keep. The browser harness keeps that gate.
//   wgslLayout's probe   is built inside its own gate by string concatenation, to dodge a self-counting trap
//                        its header describes. Lifting it here would make a copy of a probe whose whole point
//                        is that it is assembled where it is used. Left where it is.
//
// `census()` exists so those two cannot become five without anybody noticing: it scans the tree for exported
// WGSL producers and reports which are absent from the corpus. A corpus that is only ever appended to is a
// list of what somebody remembered.
//
// *** v4464 -- AND IT DID NOTICE, FOR A HUNDRED AND SEVENTY ROUNDS, WHILE NOBODY ANSWERED. *** physics/render's
// traceWgsl (v4417) and pipelineWgsl (v4418) were census candidates with no corpus entry and no exclusion from
// the round they landed; the crossBackend gate went red on the line naming them and the red was registered as
// known. That is the census working and the answer not being written. Both are in the corpus now, run on both
// backends, and the roots include text/ -- the Slug twin's three runnable modules (v4457) were outside the scan
// altogether, which is the quieter failure: a producer the census cannot see is one it cannot name.
//
// *** v4472 -- THE SAME QUIET FAILURE, THREE ROOTS AND ONE FILE TYPE WIDE. *** The physics-lab survey (step 8 of
// docs/TSL-ROADMAP.md) found physics/mpm, tools/roundhouse and brain/ unwalked -- the MPM kernel, three benched
// roundhouse kernels and their renderers -- and found that the census read JavaScript exports only, so the ten
// .wgsl FILES the tree ships (eight brain transport passes, two v2661 cloth solvers) could never be candidates.
// The roots are widened and a .wgsl file is now one candidate keyed by its path. Every new candidate was
// adjudicated by name: nine compile-only corpus entries (multi-buffer layouts the one-buffer harness cannot drive,
// each graded for arithmetic by its own gate) and five exclusions (two source fragments and renderers, one
// transformer, two superseded files nothing loads). tools/ship/crossBackend-selfcheck.mjs asserts each root by
// what it finds and walks the whole tree for .wgsl files, so a file outside every root is a red line by name.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as B from "../../render/bloomFused.mjs";
import { PROBE_WGSL, FRAGMENT_WGSL, packKnobs } from "../../render/badTvWgsl.mjs";
import * as PT from "../../physics/render/pathTracerWgsl.mjs";
import * as GD from "../../render/gpuDriven.mjs";
import { FIELD_FRAGMENT_WGSL } from "../../render/badTvWgsl.mjs";
import { TERRAIN_WGSL } from "../../render/gpuTerrain.mjs";
import { LIT_WGSL } from "../../render/litSphere.mjs";
import * as FL from "../../render/fleets.mjs";
import * as LY from "../../render/lyapunovWgsl.mjs";
import * as HD from "../../render/heidlerWgsl.mjs";
import * as BB from "../../render/blackbodyWgsl.mjs";
import * as FM from "../../render/fleetMask.mjs";
// v4464 -- the two physics producers the census named for a hundred and seventy rounds without a corpus entry, and text/
import * as G from "../../physics/render/pathTracerGpu.mjs";
import * as R from "../../physics/render/rtPipeline.mjs";
import { slugShaderWgsl, slugProbeWgsl, slugDilateProbeWgsl, PROBE_BINDINGS, DILATE_PROBE_BINDINGS } from "../../text/slugShaderWgsl.js";
import { parseFont } from "../../text/slugFont.js";
import { packAtlas, packGlyphLoc, packGlyphFlags } from "../../text/slugAtlas.js";
import { testFontBytes } from "../../text/slugTestFont.mjs";
// v4465 -- the cloth pillar's GPU path, the first physics/ module on gfx/device.js
import * as XP from "../../physics/xpbd/xpbdWgsl.mjs";
// v4466 -- the two physics kernels whose gates said "no GPU here": the HMC leapfrog (probe layout) and the MPM module
import { WGSL_HMC_PROBE, WGSL_HMC, probeUniforms as hmcProbeUniforms, makeBatch as hmcBatch } from "../roundhouse/hmcGpu.mjs";
import { WGSL_ISING } from "../roundhouse/isingGpu.mjs";
import { WGSL as MAGMAP_WGSL, SHIPPED_WGSL as MAGMAP_SHIPPED_WGSL } from "../roundhouse/magmapGpu.mjs";
import { MPM_WGSL } from "../../physics/mpm/gpuKernel.mjs";
// v4469 -- the step loop's first consumer
import * as LG from "../../physics/chaos/logisticWgsl.mjs";
// v4470 -- the brain's kernels, exported at last
import * as MLP from "../../brain/mlp.js";
import { FLOWFIELD_WGSL } from "../../brain/flowfield.js";
import { buildClothConstraints } from "../../physics/xpbd/clothMesh.js";
import { colorConstraints as xpbdColors } from "../../physics/xpbd/xpbd.js";
const EMITTED_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "tsl-emitted.json");
const EMITTED = fs.existsSync(EMITTED_PATH) ? JSON.parse(fs.readFileSync(EMITTED_PATH, "utf8")) : null;
const EMITTED_PHYS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "tsl-emitted-physics.json");
const EMITTED_PHYS = fs.existsSync(EMITTED_PHYS_PATH) ? JSON.parse(fs.readFileSync(EMITTED_PHYS_PATH, "utf8")) : null;
const EMITTED_RACE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "tsl-emitted-race.json");
const EMITTED_RACE = fs.existsSync(EMITTED_RACE_PATH) ? JSON.parse(fs.readFileSync(EMITTED_RACE_PATH, "utf8")) : null;
import { computeShell } from "../../render/tslSource.mjs";
const EMITTED_COMPUTE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "tsl-emitted-compute.json");
const EMITTED_COMPUTE = fs.existsSync(EMITTED_COMPUTE_PATH) ? JSON.parse(fs.readFileSync(EMITTED_COMPUTE_PATH, "utf8")) : null;

const EMITTED_LOOP_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "tsl-emitted-loop.json");
const EMITTED_LOOP = fs.existsSync(EMITTED_LOOP_PATH) ? JSON.parse(fs.readFileSync(EMITTED_LOOP_PATH, "utf8")) : null;

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
/** The brain's transport passes, by file: the census lists every .wgsl under its roots and each must be here or EXCLUDED. */
export const TRANSPORT_FILES = Object.freeze(["filter.wgsl", "filter-packed.wgsl", "fused-single-workgroup.wgsl",
                                              "mb-scan-block.wgsl", "mb-scan-blocks.wgsl", "mb-scatter.wgsl", "scan.wgsl", "scatter.wgsl"]);

// ---- v4464 -- THE SLUG PROBES' INPUTS: THE FIRST CORPUS ENTRIES WITH READ-ONLY STORAGE BINDINGS ----------------
//
// Every buffer entry above v4464 was "one out buffer and a uniform array". text/slugShaderWgsl.js's coverage probe
// reads the packed atlas (curve halves, band words) and a sample list through FIVE read-only storage bindings --
// the `inputs` option both harnesses grew at v4457 -- and this is the first place the corpus drives that option,
// so the browser and the native side are held to each other on it. The font is the constructed one
// text/slugTestFont.mjs ships (six glyphs, A-F), packed at width 16, where its curve list wraps to two rows and its band list to three (at 64 or 128 nothing wraps, which is the unreachable plant v4457 found); the samples are pixel
// centres at 28 px/em over each glyph's box, the same set slugWgsl-selfcheck grades against slugEval. The
// corpus does not carry the CPU key -- that is the gate's job -- it asks whether two backends agree on it.
const f32 = Math.fround;
function slugProbeCase(logWidth = 4, px = 28) {
    const font = parseFont(testFontBytes());
    const seen = new Map();
    for (const ch of "ABCDEF") {
        const gi = font.glyphIndex(ch.codePointAt(0));
        if (!seen.has(gi)) seen.set(gi, { key: gi, contours: font.outline(gi).contours });
    }
    const list = [...seen.values()];
    const atlas = packAtlas(list, { logWidth });
    if (atlas.format !== "16f") throw new Error("wgslCorpus: the probe reads rgba16float halves; the atlas packed as " + atlas.format);
    const ems = f32(1 / px);
    const samples = [], words = [], banding = [];
    for (const g of list) {
        const e = atlas.glyphs.get(g.key);
        if (!e || e.empty) continue;
        const bb = e.bbox, N = Math.max(4, Math.ceil(Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) * px));
        const loc = packGlyphLoc(e.loc[0], e.loc[1]), flg = packGlyphFlags(e.bandMax[0], e.bandMax[1], false);
        for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
            samples.push(f32(bb.x0 + (bb.x1 - bb.x0) * (ix + 0.5) / N), f32(bb.y0 + (bb.y1 - bb.y0) * (iy + 0.5) / N), ems, ems);
            words.push(loc, flg);
            banding.push(f32(e.transform[0]), f32(e.transform[1]), f32(e.transform[2]), f32(e.transform[3]));
        }
    }
    const count = words.length / 2;
    return {
        code: slugProbeWgsl(logWidth), outCount: count, workgroups: Math.ceil(count / 64),
        uniforms: new Float32Array([count, atlas.curveTexels, atlas.bandTexels, 0]),
        inputs: [
            { binding: PROBE_BINDINGS.curveData, data: atlas.curveData },
            { binding: PROBE_BINDINGS.bandData, data: atlas.bandData },
            { binding: PROBE_BINDINGS.samples, data: new Float32Array(samples) },
            { binding: PROBE_BINDINGS.glyphWords, data: new Uint32Array(words) },
            { binding: PROBE_BINDINGS.banding, data: new Float32Array(banding) },
        ],
        // For the gate's report line: how much atlas the probe walked, and whether the lists wrapped.
        atlas: { width: atlas.width, curveTexels: atlas.curveTexels, bandTexels: atlas.bandTexels, glyphs: list.length, samples: count },
    };
}

/** The XPBD kernels over clothLoop-selfcheck's 5x5 sheet: predict, one solve pass over color 0 in place (outInit), finalize. */
function xpbdCases() {
    const W = 5, H = 5, N = W * H, { cons } = buildClothConstraints(W, H, 0.3, { structural: 0, shear: 0.001, bending: 0.01 });
    const colors = xpbdColors(cons);
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; pos[3 * i] = x * 0.3 + 0.01 * Math.sin(i); pos[3 * i + 1] = 0.02 * Math.cos(i); pos[3 * i + 2] = -y * 0.3; invMass[i] = y === 0 ? 0 : 1; }
    const step = XP.packStep({ dt: 0.016, unilateral: 0, count: N, gravity: [0, -10, 0] });
    const P = XP.packParticles(pos, invMass), V = XP.packParticles(vel, new Float64Array(N));
    const pred = Float32Array.from(P); for (let a = 0; a < N; a++) if (invMass[a] > 0) pred[4 * a + 1] -= 0.0016;   // a fallen prediction, so the solve has work
    return {
        predict: { code: XP.predictWgsl(), outCount: 4 * N, uniforms: step, workgroups: 1, inputs: [{ binding: 2, data: P }, { binding: 3, data: V }, { binding: 4, data: new Float32Array(4 * N) }] },
        solve: { code: XP.solveWgsl(), outCount: 4 * N, uniforms: step, workgroups: 1, outInit: pred, inputs: [{ binding: 2, data: XP.packConstraints(cons) }, { binding: 3, data: Uint32Array.from(colors[0]) }, { binding: 4, data: new Float32Array(cons.length) }] },
        finalize: { code: XP.finalizeWgsl(), outCount: 4 * N, uniforms: step, workgroups: 1, inputs: [{ binding: 2, data: pred }, { binding: 3, data: P }, { binding: 4, data: V }] },
    };
}

/** SlugDilate over four quad corners under a matrix with a perspective row, so the divide is not a no-op. */
function slugDilateCase() {
    const W = 256, H = 128, invS = 2;
    const M = [0.3125, 0.05, 0, -0.3,   -0.08, 0.625, 0, 0.1,   0, 0, 0, 0,   0.1, -0.05, 0, 1];
    const corners = [[-0.3, -0.2, -1, -1], [0.4, -0.2, 1, -1], [0.4, 0.5, 1, 1], [-0.3, 0.5, -1, 1]];
    const cases = new Float32Array(corners.length * 12);
    corners.forEach(([px, py, nx, ny], i) => cases.set([px, py, nx, ny, 0.1, 0.2, 0, 0, invS, 0, 0, invS], i * 12));
    return {
        code: slugDilateProbeWgsl(), outCount: corners.length * 8, workgroups: 1,
        uniforms: new Float32Array([...M, W, H, corners.length, 0]),
        inputs: [{ binding: DILATE_PROBE_BINDINGS.cases, data: cases }],
    };
}

/**
 * The runnable corpus. Each entry is a name, where it came from, WHY it is worth running, and the exact
 * options both harnesses take -- the two share a signature precisely so a corpus can exist.
 */
export function corpus() {
    const n = B.N, T = 0.7, rows = 32;
    const NPIX = PT.VIEW.w * PT.VIEW.h, ys = PT.grazeLadder();
    return [
        { id: "bloomFused.fusedWgsl", from: "render/bloomFused.mjs",
          why: "var<workgroup> plus workgroupBarrier() -- shared memory and a sync point, which an LCG has none of",
          opts: { code: B.fusedWgsl(), outCount: n * n * 3, uniforms: [T, 0, 0, 0],
                  workgroups: (n / B.TILE) * (n / B.TILE) } },
        { id: "badTv.PROBE_WGSL", from: "render/badTvWgsl.mjs",
          why: "trigonometry and simplex noise -- the builtins WGSL specifies loosely and SwiftShader spends the allowance on",
          opts: { code: PROBE_WGSL, entryPoint: "probe", outCount: rows * 2,
                  uniforms: packKnobs({ time: 1.5, rows }), workgroups: 1 } },
        { id: "pathTracer.lcgWgsl", from: "physics/render/pathTracerWgsl.mjs",
          why: "u32 wrap-around and the u32->f32 double rounding, which is a fingerprint of the conversion path",
          opts: { code: PT.lcgWgsl(), outCount: 512 * 3, uniforms: PT.lcgUniforms(1, 512), workgroups: 8 } },
        { id: "pathTracer.coverageWgsl", from: "physics/render/pathTracerWgsl.mjs",
          why: "a camera basis and ray-sphere intersection over 2304 pixels -- the widest float surface here",
          opts: { code: PT.coverageWgsl(), outCount: NPIX * PT.COVERAGE_STRIDE,
                  uniforms: PT.coverageUniforms(), workgroups: Math.ceil(NPIX / 64) } },
        { id: "pathTracer.coverageWgsl+shaderTan", from: "physics/render/pathTracerWgsl.mjs",
          why: "*** THE PLANTED CAMERA, ON PURPOSE. *** It computes tan() in the shader, so it exercises the " +
               "low-accuracy transcendental path. Two backends agreeing HERE is the strongest evidence they " +
               "are the same SwiftShader, because it is where a different build would diverge first",
          opts: { code: PT.coverageWgsl({ shaderTan: true }), outCount: NPIX * PT.COVERAGE_STRIDE,
                  uniforms: PT.coverageUniforms(), workgroups: Math.ceil(NPIX / 64) } },
        { id: "pathTracer.grazeWgsl", from: "physics/render/pathTracerWgsl.mjs",
          why: "catastrophic cancellation at grazing incidence, where b*b and 4c subtract away and the error is all that is left",
          opts: { code: PT.grazeWgsl(), outCount: ys.length * PT.GRAZE_STRIDE,
                  uniforms: PT.grazeUniforms(ys), workgroups: 1 } },
        { id: "badTv.FRAGMENT_WGSL", from: "render/badTvWgsl.mjs", compileOnly: true,
          why: "a @fragment entry point, not a compute one -- there is no storage buffer to read back, so the " +
               "only comparable fact is WHETHER IT COMPILES. A weaker comparison than the others and it is " +
               "carried anyway, because a shader that compiles on one backend and not the other is exactly " +
               "the divergence a corpus exists to catch",
          opts: { code: FRAGMENT_WGSL, compileOnly: true, outCount: 0 } },
        // Level 11 -- Level 11. The cull probe is the corpus-shaped twin of the real cull shader (same cullLod text,
        // procedural scene, f32 out at binding 0, uniforms at binding 1); the render shader and the strength-field
        // badTv are compile-only here because a vs/fs pair has no buffer to read.
        { id: "gpuDriven.cullProbeWgsl", from: "render/gpuDriven.mjs",
          why: "a frustum test against six planes, a distance, an angular-size ladder and an i32 verdict -- the cull's whole decision, over 768 instances",
          opts: { code: GD.cullProbeWgsl(), entryPoint: "probe", outCount: 768 * 2,
                  uniforms: GD.packCullUniforms({ planes: GD.frustumPlanes(GD.multiply(GD.perspective(Math.PI / 3, 1, 0.1, 100), GD.lookAt([0, 0, 6], [0, 0, 0]))),
                                                  eye: [0, 0, 6], thresholds: [0.04, 0.025], count: 768, lodCount: 3, cap: 768 }),
                  workgroups: Math.ceil(768 / GD.CULL_WORKGROUP) } },
        { id: "gpuDriven.RENDER_WGSL", from: "render/gpuDriven.mjs", compileOnly: true,
          why: "an instance-stepped vertex attribute read per instance and a mat4x4 uniform -- the GPU-driven draw's vertex stage",
          opts: { code: GD.RENDER_WGSL, compileOnly: true, outCount: 0 } },
        // Level 12 -- Level 12. The pyramid builders are compile-only: level0 reads a depth texture and reduce reads
        // the level below it, neither of which the one-buffer harness can bind. hiZ-selfcheck runs them for real.
        { id: "gpuDriven.hizLevel0Wgsl", from: "render/gpuDriven.mjs", compileOnly: true,
          why: "textureLoad on a texture_depth_2d from a compute stage -- the one place the tree reads depth as numbers",
          opts: { code: GD.hizLevel0Wgsl(), compileOnly: true, outCount: 0 } },
        { id: "gpuDriven.hizReduceWgsl", from: "render/gpuDriven.mjs", compileOnly: true,
          why: "a 2x2 max-reduce with clamped edges, the Hi-Z pyramid's whole arithmetic",
          opts: { code: GD.hizReduceWgsl(), compileOnly: true, outCount: 0 } },
        { id: "gpuDriven.PICK_WGSL", from: "render/gpuDriven.mjs", compileOnly: true,
          why: "a flat-interpolated identity output and u32 bit slicing in the vertex stage -- the pick picture's encoding",
          opts: { code: GD.PICK_WGSL, compileOnly: true, outCount: 0 } },
        { id: "litSphere.LIT_WGSL", from: "render/litSphere.mjs", compileOnly: true,
          why: "v4473 -- the lit render pair over LAYOUTS.lit (a normal at location 4, the extras at 5, a point light in the uniform); its picture is graded against the CPU sphere by tools/ship/litSphere-selfcheck.mjs on both backends, and here both must compile it",
          opts: { code: LIT_WGSL, compileOnly: true, outCount: 0 } },
        // v4301 (Level 15) -- the fleet looks: vertex/fragment pairs, compile-only here (fleets-selfcheck draws them).
        { id: "fleets.LIT_WGSL", from: "render/fleets.mjs", compileOnly: true, why: "a lambert hull over a per-vertex normal at location 4 -- the first fleet with a normal", opts: { code: FL.LIT_WGSL, compileOnly: true, outCount: 0 } },
        { id: "fleets.SPRITE_WGSL", from: "render/fleets.mjs", compileOnly: true, why: "textureLoad by uv in the fragment stage with discard -- a sprite's shape from its alpha", opts: { code: FL.SPRITE_WGSL, compileOnly: true, outCount: 0 } },
        { id: "fleets.HOLO_WGSL", from: "render/fleets.mjs", compileOnly: true, why: "the HOLOGRAPHIC rainbow phase over @builtin(position) in a fragment, plus a scanline", opts: { code: FL.HOLO_WGSL, compileOnly: true, outCount: 0 } },
        { id: "fleets.INK_WGSL", from: "render/fleets.mjs", compileOnly: true, why: "the line-list look: the one pipeline whose topology is not triangles", opts: { code: FL.INK_WGSL, compileOnly: true, outCount: 0 } },
        { id: "fleets.ASCII_WGSL", from: "render/fleets.mjs", compileOnly: true, why: "screen cells from @builtin(position), a glyph per lit shade, textureLoad from a tile atlas", opts: { code: FL.ASCII_WGSL, compileOnly: true, outCount: 0 } },
        { id: "fleets.SPIN_PICK_WGSL", from: "render/fleets.mjs", compileOnly: true, why: "the looks' pick shader: the same spin as the looks, gpuDriven's identity encoding lifted by pattern", opts: { code: FL.SPIN_PICK_WGSL, compileOnly: true, outCount: 0 } },
        { id: "fleets.SPRITE_PICK_WGSL", from: "render/fleets.mjs", compileOnly: true, why: "a pick that discards where the sprite is transparent -- identity in the shape of the art, not its quad", opts: { code: FL.SPRITE_PICK_WGSL, compileOnly: true, outCount: 0 } },
        // v4315 -- OUR OWN PHYSICS, WITH KEYS. The two probes RUN (one f32 per invocation, uniforms at binding 1), so the
        // crossBackend gate compares native and browser element for element; physicsShaders-selfcheck holds each to
        // its exact answer (ln 2 at r = 4; the Heidler peak over i0 = 1 at the true eta).
        { id: "lyapunovWgsl.lyapunovProbeWgsl", from: "render/lyapunovWgsl.mjs",
          why: "the logistic map iterated 448 times per invocation and the mean log-slope -- swk_lyapunov's arithmetic, ours, with an external key",
          opts: { code: LY.lyapunovProbeWgsl(), entryPoint: "probe", outCount: 64 * 32,
                  uniforms: LY.packProbeUniforms({ rLo: 3.4, rHi: 4.0, samples: 384, warmup: 64, seedLo: 0.05, seedHi: 0.95, cols: 64, rows: 32 }), workgroups: 32 } },
        { id: "lyapunovWgsl.LYAPUNOV_KEY_WGSL", from: "render/lyapunovWgsl.mjs", compileOnly: true, why: "the full-screen key: the exponent in 16 bits across two channels, on either backend", opts: { code: LY.LYAPUNOV_KEY_WGSL, compileOnly: true, outCount: 0 } },
        { id: "lyapunovWgsl.LYAPUNOV_LOOK_WGSL", from: "render/lyapunovWgsl.mjs", compileOnly: true, why: "the Chaos race: the hull's own coordinates as r and the seed, the exponent as the shade", opts: { code: LY.LYAPUNOV_LOOK_WGSL, compileOnly: true, outCount: 0 } },
        { id: "heidlerWgsl.heidlerProbeWgsl", from: "render/heidlerWgsl.mjs",
          why: "the Heidler return-stroke current -- the lightning -- one time per invocation on a geometric grid, i(t)/i0 with its peak an exact 1",
          opts: { code: HD.heidlerProbeWgsl(), entryPoint: "probe", outCount: 2048,
                  uniforms: HD.packProbeUniforms({ i0: HD.PARAMS.first.i0, t1: HD.PARAMS.first.t1, t2: HD.PARAMS.first.t2, eta: HD.etasFor().trueEta, tLo: HD.PARAMS.first.t1 / 50, tHi: HD.PARAMS.first.t2 * 8, count: 2048, geometric: 1 }), workgroups: 32 } },
        // v4318 -- the blackbody: Planck's shape on a grid, and Wien's root by the device's own Newton (physicsShaders-selfcheck holds it to 2e-6)
        { id: "blackbodyWgsl.blackbodyProbeWgsl", from: "render/blackbodyWgsl.mjs",
          why: "Planck's dimensionless shape x^n / (e^x - 1) one x per invocation, and in key mode Wien's root by Newton on the device",
          opts: { code: BB.blackbodyProbeWgsl(), entryPoint: "probe", outCount: 2048, uniforms: BB.packProbeUniforms({ xLo: 0, xHi: 12, n: 5, count: 2048 }), workgroups: 32 } },
        { id: "blackbodyWgsl.BLACKBODY_KEY_WGSL", from: "render/blackbodyWgsl.mjs", compileOnly: true, why: "the full-screen key: the spectrum over the device's own Wien peak, in 16 bits, on either backend", opts: { code: BB.BLACKBODY_KEY_WGSL, compileOnly: true, outCount: 0 } },
        // v4320 -- GENERATED code: the WGSL three's node builder emitted from a TSL graph and render/tslSource.mjs transplanted into the
        // device's shell, written down by tslSource-selfcheck on its last run. Compiled here as any hand-written module is; absent
        // until that gate has run once, and said so rather than faked.
        ...(EMITTED ? [
            { id: "tslSource.badTv (generated)", from: "tools/ship/tsl-emitted.json", compileOnly: true, why: "badTv's fragment as three's WGSL builder wrote it from render/badTvTsl.mjs, in the device's shell -- a pair nobody typed", opts: { code: EMITTED.badTv.transplanted.wgsl, compileOnly: true, outCount: 0 } },
            { id: "tslSource.blackbody (generated)", from: "tools/ship/tsl-emitted.json", compileOnly: true, why: "the blackbody key as three's WGSL builder wrote it from render/blackbodyTsl.mjs -- a Loop of Newton steps, generated", opts: { code: EMITTED.blackbody.transplanted.wgsl, compileOnly: true, outCount: 0 } },
        ] : []),
        // v4321 -- the physics as TSL nodes, emitted and transplanted the same way (tslPhysics-selfcheck writes the file)
        ...(EMITTED_PHYS ? [
            { id: "tslSource.lyapunov (generated)", from: "tools/ship/tsl-emitted-physics.json", compileOnly: true, why: "the Lyapunov key as three's WGSL builder wrote it from render/physicsTsl.mjs: two Loops of the logistic map, generated", opts: { code: EMITTED_PHYS.lyapunov.transplanted.wgsl, compileOnly: true, outCount: 0 } },
            { id: "tslSource.heidler (generated)", from: "tools/ship/tsl-emitted-physics.json", compileOnly: true, why: "the Heidler key as three's WGSL builder wrote it: the return-stroke current on a geometric grid, generated", opts: { code: EMITTED_PHYS.heidler.transplanted.wgsl, compileOnly: true, outCount: 0 } },
        ] : []),
        // v4322 -- the Chaos race's look as three emitted it, transplanted into the fleet's own shell (tslRace-selfcheck writes the file)
        ...(EMITTED_RACE && EMITTED_RACE.transplanted ? [
            { id: "tslSource.lyapunovLook (generated)", from: "tools/ship/tsl-emitted-race.json", compileOnly: true, why: "the Chaos race painted by a TSL node: the look's own vertex stage around a fragment three's WGSL builder wrote", opts: { code: EMITTED_RACE.transplanted.wgsl, compileOnly: true, outCount: 0 } },
        ] : []),
        // v4325 -- the second shell: the Pixel race's sprite quad painted by the lightning graph, the sprite layout's vertex stage around it
        ...(EMITTED_RACE && EMITTED_RACE.sprite && EMITTED_RACE.sprite.transplanted ? [
            { id: "tslSource.heidlerSprite (generated)", from: "tools/ship/tsl-emitted-race.json", compileOnly: true, why: "a race in a SECOND shell: the sprite layout (p, color, uv, no normal) around a fragment three's WGSL builder wrote", opts: { code: EMITTED_RACE.sprite.transplanted.wgsl, compileOnly: true, outCount: 0 } },
        ] : []),
        // v4326 -- the fleets' own bitmap sprite look as three emitted it, the atlas bound by the shell it crossed into
        ...(EMITTED_RACE && EMITTED_RACE.atlas && EMITTED_RACE.atlas.transplanted ? [
            { id: "tslSource.spriteAtlas (generated)", from: "tools/ship/tsl-emitted-race.json", compileOnly: true, why: "a TEXTURE across the shell boundary: textureLoad and discard in a generated fragment, inside the fleets' sprite vertex stage", opts: { code: EMITTED_RACE.atlas.transplanted.wgsl, compileOnly: true, outCount: 0 } },
        ] : []),
        // v4327 -- the same sprite look FILTERED: a sampler in a fleet shell, three's sampler bound as the shell's
        ...(EMITTED_RACE && EMITTED_RACE.sampled && EMITTED_RACE.sampled.transplanted ? [
            { id: "tslSource.spriteSampled (generated)", from: "tools/ship/tsl-emitted-race.json", compileOnly: true, why: "a SAMPLER across the shell boundary: textureSample and discard in a generated fragment, inside the fleets' sprite vertex stage", opts: { code: EMITTED_RACE.sampled.transplanted.wgsl, compileOnly: true, outCount: 0 } },
        ] : []),
        // v4328 -- the ink wash: a generated fragment inside the fleets' LINE-LIST shell, one varying and no uv
        ...(EMITTED_RACE && EMITTED_RACE.ink && EMITTED_RACE.ink.transplanted ? [
            { id: "tslSource.inkWash (generated)", from: "tools/ship/tsl-emitted-race.json", compileOnly: true, why: "the leanest shell the fleets have: p and colour, a line-list topology, a graph with one varying to read", opts: { code: EMITTED_RACE.ink.transplanted.wgsl, compileOnly: true, outCount: 0 } },
        ] : []),
        // v4331 -- the hand-written compute twin the generated pass is graded against: the module's own lyapunov() in the
        // shell a transplant lands in. It is a FUNCTION of that shell, so the corpus builds one to compile it.
        { id: "lyapunovWgsl.lyapunovComputeWgsl", from: "render/lyapunovWgsl.mjs", compileOnly: true,
          why: "the hand-written half of the compute claim: one invocation per r, the module's own lyapunov(), a storage buffer out",
          opts: { code: LY.lyapunovComputeWgsl({ prefix: computeShell({ storage: [{ name: "out", element: "f32" }], uniforms: [{ name: "span", type: "vec4" }] }).prefix, warmup: 64, samples: 384 }), compileOnly: true, outCount: 0 } },
        // v4331 -- the first GENERATED COMPUTE pass in the corpus: three's node builder wrote it, tslSource transplanted it
        ...(EMITTED_COMPUTE && EMITTED_COMPUTE.transplanted ? [
            { id: "tslSource.lyapunovCompute (generated)", from: "tools/ship/tsl-emitted-compute.json", compileOnly: true, why: "a compute stage nobody wrote by hand: a storage buffer, a uniform struct and two baked Loops, inside a gfx/device.js compute module", opts: { code: EMITTED_COMPUTE.transplanted, compileOnly: true, outCount: 0 } },
        ] : []),
        // v4471 -- THE FIRST GENERATED PASS WHOSE TRIP COUNT IS NOT IN ITS TEXT: the logistic map stepped `bound` times, the bound
        // a vec4 uniform in one variant and a storage buffer's element in the other (render/physicsTsl.mjs makeLogisticStepperTsl,
        // written by tools/ship/tslLoopBound-selfcheck.mjs, which holds both to the f32 twin at five step counts from ONE module)
        ...(EMITTED_LOOP && EMITTED_LOOP.transplanted ? [
            { id: "tslSource.logisticStepperUniform (generated)", from: "tools/ship/tsl-emitted-loop.json", compileOnly: true, why: "a TSL Loop whose end is a UNIFORM, emitted by three and transplanted: for (i < i32(u.bound.x)) -- the bound the roadmap said a Loop could not take", opts: { code: EMITTED_LOOP.transplanted, compileOnly: true, outCount: 0 } },
            { id: "tslSource.logisticStepperStorage (generated)", from: "tools/ship/tsl-emitted-loop.json", compileOnly: true, why: "the same stepper with the bound read from a STORAGE buffer's element: for (i < i32(steps.value[0u]))", opts: { code: EMITTED_LOOP.transplantedStorage, compileOnly: true, outCount: 0 } },
        ] : []),
        // v4318 -- the mask on the device: two full-screen pipelines (vertex and fragment in one module), compiled here; they were
        // added after that round's corpus run and the crossBackend gate named them at v4320
        { id: "fleetMask.PICK_MASK_WGSL", from: "render/fleetMask.mjs", compileOnly: true, why: "the identity picture -> the strength field: the fleet decoded from the blue byte against a bitmask, on the device", opts: { code: FM.PICK_MASK_WGSL, compileOnly: true, outCount: 0 } },
        { id: "fleetMask.COMPOSITE_WGSL", from: "render/fleetMask.mjs", compileOnly: true, why: "two universes as one picture: mix(B, A, mask) through the identity picture's mask", opts: { code: FM.COMPOSITE_WGSL, compileOnly: true, outCount: 0 } },
        { id: "gpuTerrain.TERRAIN_WGSL", from: "render/gpuTerrain.mjs", compileOnly: true,
          why: "textureLoad and textureDimensions in the VERTEX stage -- the heightfield lift, which no other shader here does",
          opts: { code: TERRAIN_WGSL, compileOnly: true, outCount: 0 } },
        { id: "badTv.FIELD_FRAGMENT_WGSL", from: "render/badTvWgsl.mjs", compileOnly: true,
          why: "FRAGMENT_WGSL with a second texture binding, the strength field, derived by substitution -- proves the derivation still compiles",
          opts: { code: FIELD_FRAGMENT_WGSL, compileOnly: true, outCount: 0 } },
        // *** v4464 -- THE TWO PRODUCERS THE CENSUS HAD NAMED SINCE v4417 AND NOBODY ANSWERED. *** traceWgsl and
        // pipelineWgsl were graded against a CPU f64 tracer by their own gates on the BROWSER harness only, and the
        // census line naming them as unaccounted was a standing red every quick sweep listed. They fit the
        // one-buffer signature exactly (an out array and a uniform vec4 array), so they run here on both.
        { id: "pathTracerGpu.traceWgsl", from: "physics/render/pathTracerGpu.mjs",
          why: "the v4417 furnace: a cosine-weighted bounce loop with an LCG per pixel over 24x24 -- the deepest control flow in the corpus, and the first physics shader in it",
          opts: { code: G.traceWgsl({}), outCount: G.VIEW.w * G.VIEW.h,
                  uniforms: G.traceUniforms({ spp: 16, view: G.VIEW, eps: 1e-4 }), workgroups: Math.ceil(G.VIEW.w * G.VIEW.h / 64) } },
        { id: "rtPipeline.pipelineWgsl", from: "physics/render/rtPipeline.mjs",
          why: "the v4418 shader-binding-table pipeline: a two-record table with a lambertian AND a mirror hit shader, which the CPU oracle cannot express and only a second backend can check",
          opts: { code: R.pipelineWgsl({}), outCount: R.VIEW.w * R.VIEW.h,
                  uniforms: R.pipelineUniforms([R.sbtRecord({ centre: [-1.2, 0, 0], radius: 0.6, albedo: 0.5 }),
                                                R.sbtRecord({ centre: [1.2, 0, 0], radius: 0.6, albedo: 0.25, hit: "mirror" })],
                                               { spp: 16, view: R.VIEW, eps: 1e-4 }),
                  workgroups: Math.ceil(R.VIEW.w * R.VIEW.h / 64) } },
        // *** v4464 -- text/ JOINS THE CENSUS. *** The Slug twin (v4457) lived outside the corpus roots, so its
        // three runnable modules were nobody's cross-backend claim. The render module compiles on both; the two
        // probes RUN on both, and the coverage probe is the corpus's first entry with read-only storage inputs.
        { id: "slugShaderWgsl.slugShaderWgsl", from: "text/slugShaderWgsl.js", compileOnly: true,
          why: "the Slug fragment over textureLoad of an rgba16float and an rg16uint texture with fwidth -- the first text shader on the device; drawn and diffed on both backends by tools/ship/slugDevice-selfcheck.mjs",
          opts: { code: slugShaderWgsl(12).wgsl, compileOnly: true, outCount: 0 } },
        { id: "slugShaderWgsl.slugProbeWgsl", from: "text/slugShaderWgsl.js",
          why: "the SAME core as the fragment, over five read-only storage buffers: root code, two solvers and band walks per sample, on a width-16 atlas whose curve list wraps to two rows and band list to three",
          opts: slugProbeCase(4, 28) },
        // *** v4465 -- THE FIRST physics/ KERNELS ON gfx/device.js, AND THE FIRST CORPUS ENTRY THAT WORKS IN PLACE. *** The
        // solve relaxes the prediction it is handed (outInit on binding 0); both harnesses grew the option for it.
        { id: "xpbdWgsl.predictWgsl", from: "physics/xpbd/xpbdWgsl.mjs",
          why: "the cloth's predict pass: gravity into velocity, position into prediction, pinned particles copied -- one vec4 record per thread",
          opts: xpbdCases().predict },
        { id: "xpbdWgsl.solveWgsl", from: "physics/xpbd/xpbdWgsl.mjs",
          why: "one graph-colored XPBD solve pass: Eq (18) with the accumulated multiplier and Eq (17) on both particles, IN PLACE on the prediction",
          opts: xpbdCases().solve },
        { id: "xpbdWgsl.finalizeWgsl", from: "physics/xpbd/xpbdWgsl.mjs",
          why: "the finalize pass: velocity from prediction minus the saved position, position committed",
          opts: xpbdCases().finalize },
        // v4466 -- the HMC leapfrog over the seeded 4096-chain batch (24 steps each), and the MPM module's four entry points
        { id: "hmcGpu.WGSL_HMC_PROBE", from: "tools/roundhouse/hmcGpu.mjs",
          why: "the fleet's HMC bench kernel in the harness layout: 4096 chains x 24 kick-drift-kick steps of specified operations only, the deepest loop over the most chains in the corpus",
          opts: (() => { const { qin, pin, n } = hmcBatch(4096, 77); return { code: WGSL_HMC_PROBE, outCount: 4 * n, uniforms: hmcProbeUniforms(n), workgroups: Math.ceil(n / 64), inputs: [{ binding: 2, data: qin }, { binding: 3, data: pin }] }; })() },
        { id: "gpuKernel.MPM_WGSL", from: "physics/mpm/gpuKernel.mjs", compileOnly: true,
          why: "the 2D MPM loop: four entry points over five shared buffers, two of them atomic -- outside the one-buffer signature, driven by tools/ship/mpmDevice-selfcheck.mjs through the device; compiled on both here",
          opts: { code: MPM_WGSL, entryPoint: "p2g", compileOnly: true, outCount: 0 } },
        // v4469 -- one step of the logistic map, the kernel render/stepLoop.mjs ping-pongs: src at 2, r at 3, dst out
        { id: "logisticWgsl.logisticStepWgsl", from: "physics/chaos/logisticWgsl.mjs",
          why: "x <- r x (1 - x) per element -- two multiplies and a subtract, and chaotic, so a one-ulp disagreement between backends is an unrelated orbit in the step loop that runs it 200 times",
          opts: (() => { const F = LG.fixture(); return { code: LG.logisticStepWgsl(), outCount: F.count, uniforms: LG.packKnobs({ count: F.count }), workgroups: Math.ceil(F.count / 64), inputs: [{ binding: 2, data: F.x }, { binding: 3, data: F.r }] }; })() },
        // v4470 -- the GPU Brain's MLP layer in the harness layout (a 2-D dispatch, the first in the corpus), and the
        // flow-field solver's module compiled: four entry points, seven bindings, two atomic, an explicit layout
        { id: "mlp.mlpLayerWgsl", from: "brain/mlp.js",
          why: "the brain's batched MLP layer: a row-per-thread matmul with fused bias and relu, the kernel brain/brain.js and blobBrain.js run every tick -- graded here for the first time without regexing its source",
          opts: (() => { const P = MLP.PROBES[0], a = P.args; return { code: P.code(a), entryPoint: P.entryPoint, outCount: P.outCount(a), uniforms: P.pack(a), workgroups: P.workgroups(a), inputs: P.inputs(a) }; })() },
        { id: "flowfield.FLOWFIELD_WGSL", from: "brain/flowfield.js", compileOnly: true,
          why: "the flow-field solver: cost, relax (ping-pong), tally (atomics) and flow in one module with an explicit seven-binding layout -- outside the one-buffer signature; brain/tools/flowfield-selfcheck.mjs holds the solver to its CPU twin",
          opts: { code: FLOWFIELD_WGSL, entryPoint: "k_relax", compileOnly: true, outCount: 0 } },
        // v4472 -- the roundhouse's three kernels and the brain's eight transport passes, found the moment the census
        // walked tools/roundhouse and read .wgsl FILES. Every one binds several storage buffers (a lattice and a
        // threshold table; two trig tables and an output; candidates, a wheel, tuplets and flags), outside the
        // one-buffer harness signature, so they are compile-only here; each is graded for its ARITHMETIC where it
        // already was (tools/roundhouse/{hmcGpu,isingGpu,magmap,magmapVariants}-selfcheck.mjs against the CPU twins;
        // brain/transport/primeTransport-selfcheck.mjs and tools/ship/scanLimits-selfcheck.mjs for the passes). What
        // the corpus adds is the one fact those gates cannot: that BOTH real backends accept the text.
        { id: "hmcGpu.WGSL_HMC", from: "tools/roundhouse/hmcGpu.mjs", compileOnly: true,
          why: "the leapfrog kernel in the BENCH layout (uniform at 0, q/p/out storage after); the same step text as WGSL_HMC_PROBE, which the corpus runs, rendered in the layout the roundhouse bench binds",
          opts: { code: WGSL_HMC, entryPoint: "main", compileOnly: true, outCount: 0 } },
        { id: "isingGpu.WGSL_ISING", from: "tools/roundhouse/isingGpu.mjs", compileOnly: true,
          why: "Philox4x32-10 and an integer-threshold Metropolis sweep over a lattice with a five-entry threshold table -- the lab's zero-tolerance kernel, u32 end to end",
          opts: { code: WGSL_ISING, entryPoint: "main", compileOnly: true, outCount: 0 } },
        { id: "magmapGpu.WGSL", from: "tools/roundhouse/magmapGpu.mjs", compileOnly: true,
          why: "the magnification-map quadrature at @workgroup_size(64) reading two trig tables -- the base text every bench variant is rewritten from",
          opts: { code: MAGMAP_WGSL, entryPoint: "k_magmap", compileOnly: true, outCount: 0 } },
        { id: "magmapGpu.SHIPPED_WGSL", from: "tools/roundhouse/magmapGpu.mjs", compileOnly: true,
          why: "the variant the lab actually runs: wg128 with the trig tables staged in workgroup memory behind a barrier that every thread reaches -- the barrier trap magmapVariants.mjs documents, checked by a compiler on both backends",
          opts: { code: MAGMAP_SHIPPED_WGSL, entryPoint: "k_magmap", compileOnly: true, outCount: 0 } },
        ...TRANSPORT_FILES.map((f) => ({
          id: "brain/transport/shaders/" + f, from: "brain/transport/shaders/" + f, compileOnly: true,
          why: "one pass of the brain's prime-transport pipeline (brain/transport/pipeline.js reads it with readText and binds it by its own layout); a .wgsl file, which the census could not see until v4472",
          opts: { code: fs.readFileSync(path.join(ENG, "brain/transport/shaders", f), "utf8"), entryPoint: "main", compileOnly: true, outCount: 0 } })),
        { id: "slugShaderWgsl.slugDilateProbeWgsl", from: "text/slugShaderWgsl.js",
          why: "SlugDilate under a matrix with a live perspective row: the half-pixel push whose per-axis error the v4457 note wrote down",
          opts: slugDilateCase() },
        // *** v4295 -- THE TEXTURE ENTRIES, WHICH THE CORPUS HAD NONE OF. *** Seven shaders and 41,656 floats
        // of agreement, all of it through storage BUFFERS, while the only shader that writes a storage TEXTURE
        // was excluded for want of a native path. That was the worst place to have no evidence: v4287 measured
        // rgba8unorm clamping a 1.7480 peak to 1.0000 and destroying all 181 samples above 1, and the result
        // looked like a bloom that had never happened. Format and padding faults produce a plausible picture.
        { id: "bloomFused.fusedWgslToTexture", from: "render/bloomFused.mjs", texture: true,
          why: "writes a storage texture in rgba16float -- a whole binding class the buffer entries never touch",
          opts: { code: B.fusedWgslToTexture(), n, uniforms: [T, 0, 0, 0], workgroups: (n / B.TILE) * (n / B.TILE) } },
        { id: "bloomFused.fusedWgslToTexture+padded", from: "render/bloomFused.mjs", texture: true,
          why: "N=40, where a row is 320 bytes and pads to 512. v4287 found this branch UNREACHABLE at N=64, " +
               "because 512 is already 256-aligned -- so the reader's padding arithmetic is only exercised here",
          opts: { code: B.fusedWgslToTexture({ n: 40 }), n: 40, uniforms: [T, 0, 0, 0], workgroups: (40 / B.TILE) * (40 / B.TILE) } },
        { id: "bloomFused.fusedWgslToTexture+clipping", from: "render/bloomFused.mjs", texture: true,
          why: "rgba8unorm, the format that CLIPS. Both backends must clip identically or the two disagree " +
               "about what an out-of-range value becomes, which is a correctness decision and not a rounding one",
          opts: { code: B.fusedWgslToTexture({ format: B.STORAGE_FORMATS.clipping }), n,
                  format: B.STORAGE_FORMATS.clipping, uniforms: [T, 0, 0, 0], workgroups: (n / B.TILE) * (n / B.TILE) } },
    ];
}

/** Shaders the tree runs that this corpus cannot, each with the reason it cannot rather than a shrug. */
export const EXCLUDED = Object.freeze([
    // v4315 -- the physics functions each probe splices in: source fragments, not modules
    Object.freeze({ id: "lyapunovWgsl.LYAPUNOV_FN_WGSL", kind: "source fragment", why: "the lyapunov() function every Lyapunov shape splices in; the probe, key and look are the modules" }),
    Object.freeze({ id: "heidlerWgsl.HEIDLER_FN_WGSL", kind: "source fragment", why: "the Heidler shape and current functions the probe splices in" }),
    Object.freeze({ id: "blackbodyWgsl.PLANCK_FN_WGSL", kind: "source fragment", why: "the Planck shape, Wien root and residual functions the probe and key splice in" }),
    Object.freeze({ id: "tslSource.TRI_VS_WGSL", kind: "source fragment", why: "the device's full-screen vertex stage render/tslSource.mjs wraps around a fragment three generated; the generated pairs themselves are in the corpus from tools/ship/tsl-emitted.json" }),
    // v4459 -- the two texel probes: render pairs (vs + fs) reading a bound texture, which this corpus's compute
    // harness cannot feed. They are graded on BOTH real backends, through gfx/device.js, by their own gate.
    // (`keeps` is reserved for the ONE shader that stays on the browser harness; these are graded on both real
    // backends by tools/ship/deviceFormats-selfcheck.mjs, which is named in `why` instead.)
    Object.freeze({ id: "texelProbe.FLOAT_PROBE_WGSL", kind: "render pair, graded through the device",
                    why: "a vs+fs pair reading an rgba16float texture; the corpus dispatches compute over buffers. tools/ship/deviceFormats-selfcheck.mjs reads its bits back on WebGPU and WebGL2" }),
    Object.freeze({ id: "texelProbe.TWO_TEXTURE_PROBE_WGSL", kind: "render pair, graded through the device",
                    why: "a vs+fs pair that declares two textures and reads one, to hold the device to the auto-layout rule; graded by tools/ship/deviceUnused-selfcheck.mjs on both backends" }),
    Object.freeze({ id: "texelProbe.LEVEL_PROBE_WGSL", kind: "render pair, graded through the device",
                    why: "a vs+fs pair reading one LEVEL of a mip chain with textureLoad; tools/ship/deviceMipmaps-selfcheck.mjs holds every level to a CPU box filter on both backends" }),
    Object.freeze({ id: "texelProbe.SAMPLED_PROBE_WGSL", kind: "render pair, graded through the device",
                    why: "a vs+fs pair sampling a texture through its sampler at a quarter size, so the derivatives pick the level; same gate, with an unchained control" }),
    Object.freeze({ id: "texelProbe.UINT_PROBE_WGSL", kind: "render pair, graded through the device",
                    why: "a vs+fs pair reading an rg16uint texture; same reason, same gate (tools/ship/deviceFormats-selfcheck.mjs)" }),
    // v4470 -- the brain's shipped MLP layout: the same body as the probe entry, bound in the Deno brain's order
    Object.freeze({ id: "mlp.MLP_LAYER_WGSL", kind: "same body, the consumer's binding layout",
                    why: "brain/mlp.js renders one body in two layouts; mlp.mlpLayerWgsl (the harness layout) is in the corpus and this is the rendering BatchedMLP binds, uniform first" }),
    Object.freeze({ id: "slugShaderWgsl.slugCoreWgsl", kind: "source fragment",
                    why: "the shared Slug core (root code, solvers, CalcBandLoc, CalcCoverage, SlugRender) with no entry point; slugShaderWgsl and slugProbeWgsl are its two runnable hosts and both ARE in the corpus" }),
    Object.freeze({ id: "wgslLayout probe", kind: "lives inside its gate",
                    why: "assembled in its own gate by concatenation to dodge a self-counting trap; copying it here would defeat that",
                    keeps: "tools/ship/wgslLayout-selfcheck.mjs stays on the browser harness" }),
    // *** THE CENSUS REGEX IS A CANDIDATE FINDER, NOT A SHADER FINDER, AND THE DIFFERENCE IS ADJUDICATED BY
    // NAME. *** It matched six more symbols on the first run. Not one of them is a runnable shader, and
    // loosening the pattern until they stopped matching would have been the wrong repair -- the pattern is
    // right and the answers need judging, which is the shape wiringClaims-selfcheck settled on for the same
    // problem: report candidates, adjudicate them by name, and let a SEVENTH show up loudly.
    Object.freeze({ id: "backendParity.WGSL_MARKS", kind: "not shader source",
                    why: 'the three strings "@vertex", "@fragment", "@compute" -- markers a scanner looks FOR, not code' }),
    Object.freeze({ id: "badTvWgsl.SNOISE2_WGSL", kind: "source fragment",
                    why: "simplex-noise helper functions with no entry point; it cannot be dispatched alone" }),
    Object.freeze({ id: "badTvWgsl.BADTV_WGSL", kind: "source fragment",
                    why: "a struct and helpers with no entry point -- PROBE_WGSL and FRAGMENT_WGSL are the runnable compositions of it, and both ARE in the corpus" }),
    Object.freeze({ id: "wgslSpec.validateWgsl", kind: "consumer, not producer",
                    why: "it PARSES WGSL. The name matched; the direction is opposite" }),
    Object.freeze({ id: "wgslSpec.parseWgsl", kind: "consumer, not producer",
                    why: "same -- reads WGSL rather than emitting it" }),
    // Level 11 -- Level 11's shaders. The real cull pass binds four buffers and appends through an atomic, which
    // neither harness's one-buffer signature can drive; its decision function is what cullProbeWgsl runs here,
    // and the pass itself is graded end to end by tools/ship/gpuDriven-selfcheck.mjs on the browser harness.
    Object.freeze({ id: "gpuDriven.cullLodWgsl", kind: "lives on its own gate",
                    why: "four bindings (uniform, instances, indirect commands, records) and an atomicAdd -- outside the one-buffer harness signature; graded by gpuDriven-selfcheck through gfx/device.js" }),
    Object.freeze({ id: "gpuHaul.haulWgsl", kind: "lives on its own gate",
                    why: "reads a flights buffer and writes a records buffer -- two storage bindings; graded against the economy's own positions by gpuUniverse-selfcheck" }),
    Object.freeze({ id: "gpuOrbits.orbitWgsl", kind: "lives on its own gate",
                    why: "reads an elements buffer and writes a records buffer -- two storage bindings, outside the one-buffer harness signature; graded against positionAt by gpuOrbits-selfcheck" }),
    Object.freeze({ id: "gpuDriven.OCC_FN_WGSL", kind: "source fragment",
                    why: "the Occ struct, the level arithmetic and hizOccluded() with no entry point -- cullLodWgsl({ occlusion: true }) is its runnable composition, graded by hiZ-selfcheck" }),
    Object.freeze({ id: "gpuDriven.CULL_FN_WGSL", kind: "source fragment",
                    why: "the Cull struct and cullLod() with no entry point -- cullLodWgsl and cullProbeWgsl are its runnable compositions, and the probe IS in the corpus" }),    // v4472 -- what the wider census found in tools/roundhouse and among the .wgsl files, adjudicated by name.
    Object.freeze({ id: "hmcGpu.HMC_STEP_WGSL", kind: "source fragment",
                    why: "the leapfrog step text with no bindings and no entry point, written once so the bench and probe layouts cannot drift; hmcKernelWgsl renders it into both, and both renderings ARE in the corpus" }),
    Object.freeze({ id: "hmcGpu.hmcKernelWgsl", kind: "renderer of two layouts",
                    why: "a function of { probe } that wraps HMC_STEP_WGSL in the bench layout or the harness layout; its two outputs are WGSL_HMC and WGSL_HMC_PROBE, both in the corpus, so it has no third text to grade" }),
    Object.freeze({ id: "magmapVariants.variantWgsl", kind: "transformer, not producer",
                    why: "rewrites a base kernel's workgroup size and stages its trig tables in workgroup memory; the shipped output of it (magmapGpu.SHIPPED_WGSL) is in the corpus and tools/roundhouse/magmapVariants-selfcheck.mjs grades every variant against the CPU twin" }),
    Object.freeze({ id: "physics/xpbd/xpbd-distance.wgsl", kind: "superseded file, never loaded",
                    why: "the v2661 graph-coloured distance solver; nothing in the tree reads the file (v4465 measured that), physics/xpbd/xpbdWgsl.mjs solveWgsl is its replacement and IS in the corpus, and the file keeps its SUPERSEDED note as the record" }),
    Object.freeze({ id: "physics/xpbd/cloth-collision.wgsl", kind: "superseded file, never loaded",
                    why: "the v2661 contact solver that did not accumulate lambda -- the disagreement with clothLoop.js that v4465 found by writing the mirror; xpbdWgsl.mjs solves contact with the same kernel as the fixed solve under a unilateral flag, and nothing loads this file" }),
]);

/**
 * Every exported WGSL producer in the tree, and whether the corpus or EXCLUDED accounts for it.
 *
 * *** THIS FILE MUST NOT COUNT ITSELF, *** which is the trap the tree has hit repeatedly: a file that grades a
 * marker and contains the marker grades its own prose. The scan skips this module and the gate that drives it.
 */
export function census({ roots = ["render", "physics/render", "physics/xpbd", "physics/chaos", "physics/mpm", "shaders", "text", "brain", "tools/roundhouse"] } = {}) {
    const SELF = ["wgslCorpus.mjs", "crossBackend-selfcheck.mjs"];
    const found = [];
    const walk = (dir) => {
        let entries = [];
        try { entries = fs.readdirSync(path.join(ENG, dir), { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const rel = path.join(dir, e.name);
            if (e.isDirectory()) { walk(rel); continue; }
            // v4472 -- *** A .wgsl FILE IS A PRODUCER WITH NO EXPORT TO MATCH. *** The regex below reads JavaScript, so
            // the ten files the tree ships as bare WGSL (the brain's transport passes, the two v2661 cloth solvers) sat
            // outside the census for 180 rounds. Each file is one candidate, keyed by its path rather than a symbol.
            if (/\.wgsl$/.test(e.name)) { found.push({ symbol: e.name, file: rel.replace(/\\/g, "/"), kind: "file" }); continue; }
            if (!/\.(mjs|js)$/.test(e.name) || SELF.includes(e.name)) continue;
            const src = fs.readFileSync(path.join(ENG, rel), "utf8");
            // An exported name that produces WGSL: a function returning it, or a frozen source constant.
            const re = /export\s+(?:function|const)\s+(\w*(?:Wgsl|WGSL)\w*)\b/g;
            let m;
            while ((m = re.exec(src))) found.push({ symbol: m[1], file: rel.replace(/\\/g, "/"), kind: "export" });
        }
    };
    for (const r of roots) walk(r);
    // Exported symbols resolve by their last id segment; files resolve by their whole path, because "filter.wgsl"
    // split on dots is the word "wgsl" and would account for nothing in particular.
    const isFileId = (id) => /\.wgsl$/.test(id);
    const inCorpus = new Set(corpus().filter((c) => !isFileId(c.id)).map((c) => c.id.split(".").pop().replace(/\+.*$/, "")));
    const inExcluded = new Set(EXCLUDED.filter((e) => !isFileId(e.id)).map((e) => e.id.split(".").pop()));
    const fileInCorpus = new Set(corpus().filter((c) => isFileId(c.id)).map((c) => c.id));
    const fileInExcluded = new Set(EXCLUDED.filter((e) => isFileId(e.id)).map((e) => e.id));
    return found.map((f) => {
        const where = f.kind === "file"
            ? (fileInCorpus.has(f.file) ? "corpus" : fileInExcluded.has(f.file) ? "excluded" : null)
            : (inCorpus.has(f.symbol) ? "corpus" : inExcluded.has(f.symbol) ? "excluded" : null);
        return { ...f, accounted: where !== null, where };
    });
}

/** Run one corpus entry through both harnesses and compare element for element. */
export async function compare(entry, runBrowser, runNative, runBrowserTex = null, runNativeTex = null) {
    // A texture entry returns `pixels`, a buffer entry returns `values`, and a compileOnly entry returns
    // neither. Dispatching on the entry rather than sniffing the result keeps a missing runner LOUD: asking
    // for a texture comparison without a texture runner refuses instead of silently comparing nothing.
    if (entry.texture) {
        if (!runBrowserTex || !runNativeTex)
            return { id: entry.id, ok: false, reason: "texture entry needs texture runners on both sides" };
        const bt = await runBrowserTex(entry.opts), at = await runNativeTex(entry.opts);
        if (!bt.ok || !at.ok) return { id: entry.id, ok: false, reason: bt.reason || at.reason || "texture run failed" };
        let same = 0, maxAbs = 0, firstDiff = -1;
        for (let i = 0; i < bt.pixels.length; i++) {
            if (bt.pixels[i] === at.pixels[i]) same++;
            else { if (firstDiff < 0) firstDiff = i; maxAbs = Math.max(maxAbs, Math.abs(bt.pixels[i] - at.pixels[i])); }
        }
        return { id: entry.id, ok: true, texture: true, n: bt.pixels.length, same, maxAbs, firstDiff,
                 identical: same === bt.pixels.length,
                 bytesPerRow: bt.bytesPerRow, bytesPerRowNative: at.bytesPerRow, format: bt.format };
    }
    const b = await runBrowser(entry.opts);
    const a = await runNative(entry.opts);
    // A compileOnly entry returns no values. The comparable fact is that BOTH accepted it, and a corpus that
    // silently scored that as "0 of 0 identical" would report a pass for having compared nothing.
    if (entry.compileOnly)
        return { id: entry.id, ok: true, compileOnly: true, n: 0,
                 identical: b.ok === a.ok && b.ok === true,
                 browserOk: b.ok, nativeOk: a.ok,
                 errors: [...(b.errors || []), ...(a.errors || [])] };
    if (!b.ok || !a.ok) return { id: entry.id, ok: false, reason: b.reason || a.reason || "run failed" };
    let same = 0, maxAbs = 0, firstDiff = -1;
    for (let i = 0; i < b.values.length; i++) {
        if (b.values[i] === a.values[i]) same++;
        else { if (firstDiff < 0) firstDiff = i; maxAbs = Math.max(maxAbs, Math.abs(b.values[i] - a.values[i])); }
    }
    return { id: entry.id, ok: true, n: b.values.length, same, maxAbs, firstDiff,
             identical: same === b.values.length };
}
