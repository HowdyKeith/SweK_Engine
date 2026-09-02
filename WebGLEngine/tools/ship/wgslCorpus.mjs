// WebGLEngine/tools/ship/wgslCorpus.mjs -- v4294
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
import * as FL from "../../render/fleets.mjs";
import * as LY from "../../render/lyapunovWgsl.mjs";
import * as HD from "../../render/heidlerWgsl.mjs";
import * as BB from "../../render/blackbodyWgsl.mjs";
import * as FM from "../../render/fleetMask.mjs";
const EMITTED_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "tsl-emitted.json");
const EMITTED = fs.existsSync(EMITTED_PATH) ? JSON.parse(fs.readFileSync(EMITTED_PATH, "utf8")) : null;
const EMITTED_PHYS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "tsl-emitted-physics.json");
const EMITTED_PHYS = fs.existsSync(EMITTED_PHYS_PATH) ? JSON.parse(fs.readFileSync(EMITTED_PHYS_PATH, "utf8")) : null;

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

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
                    why: "the Cull struct and cullLod() with no entry point -- cullLodWgsl and cullProbeWgsl are its runnable compositions, and the probe IS in the corpus" }),
]);

/**
 * Every exported WGSL producer in the tree, and whether the corpus or EXCLUDED accounts for it.
 *
 * *** THIS FILE MUST NOT COUNT ITSELF, *** which is the trap the tree has hit repeatedly: a file that grades a
 * marker and contains the marker grades its own prose. The scan skips this module and the gate that drives it.
 */
export function census({ roots = ["render", "physics/render", "shaders"] } = {}) {
    const SELF = ["wgslCorpus.mjs", "crossBackend-selfcheck.mjs"];
    const found = [];
    const walk = (dir) => {
        let entries = [];
        try { entries = fs.readdirSync(path.join(ENG, dir), { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const rel = path.join(dir, e.name);
            if (e.isDirectory()) { walk(rel); continue; }
            if (!/\.(mjs|js)$/.test(e.name) || SELF.includes(e.name)) continue;
            const src = fs.readFileSync(path.join(ENG, rel), "utf8");
            // An exported name that produces WGSL: a function returning it, or a frozen source constant.
            const re = /export\s+(?:function|const)\s+(\w*(?:Wgsl|WGSL)\w*)\b/g;
            let m;
            while ((m = re.exec(src))) found.push({ symbol: m[1], file: rel.replace(/\\/g, "/") });
        }
    };
    for (const r of roots) walk(r);
    const inCorpus = new Set(corpus().map((c) => c.id.split(".").pop().replace(/\+.*$/, "")));
    const inExcluded = new Set(EXCLUDED.map((e) => e.id.split(".").pop()));
    return found.map((f) => ({ ...f,
        accounted: inCorpus.has(f.symbol) || inExcluded.has(f.symbol),
        where: inCorpus.has(f.symbol) ? "corpus" : inExcluded.has(f.symbol) ? "excluded" : null }));
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
