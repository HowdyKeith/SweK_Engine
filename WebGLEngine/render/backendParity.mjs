// WebGLEngine/render/backendParity.mjs -- v4269
//
// HOW MUCH OF THIS TREE COULD ACTUALLY RUN ON WebGPU, COUNTED RATHER THAN ESTIMATED.
//
// ---- THE QUESTION, AND WHY IT IS NOT "DOES THE TREE HAVE WebGPU" ---------------------------------------------
//
// It has plenty. Thirteen pages call getContext("webgpu"), sixty files touch navigator.gpu, ten .wgsl files
// ship, and gfx/device.js is a unified WebGL2/WebGPU device whose stated promise is that "a demo writes its
// render ONCE and runs on either runtime". ui/webgpuProbe.mjs even gets the hard part right: WebGPU is gated on
// a SECURE CONTEXT, so the same browser on the same machine has it on https and none on a LAN IP, and the probe
// says which of those it is instead of blaming the driver.
//
// So the capability is not missing. What has never been counted is REACH: gfx/device.js only carries a render
// to both backends if the pipeline it is handed supplies BOTH shader languages, because shaders are the one
// thing the abstraction cannot unify. Its own header says so -- "a pipeline carries both { wgsl } and { glsl }
// and each backend takes its own".
//
// ---- *** THE COUNT: 134 MODULES SHIP GLSL, 39 SHIP WGSL, AND FIVE SHIP BOTH. *** ------------------------------
//
// And of those five, three are pages rather than shader modules -- gfx-device.html and nebula-device.html, which
// are gfx/device.js's ONLY two consumers, plus wormhole-jump.html. Two actual shader modules carry both
// languages: fx/nebula/nebulaShaders.js and fx/wormhole/wormholeNebula.js.
//
// So the abstraction whose entire premise is "write it once, run on either" is satisfied by two shader modules
// out of a hundred and thirty-four. That is not a criticism of the abstraction, which works: it is the measurement
// nobody had taken, and it is the difference between "the tree is WebGPU-capable" and "the tree can move a
// given render to WebGPU". The first is true. The second is true 5 times out of 118.
//
// ---- WHAT THIS MEANS FOR A SPECIFIC ROUND --------------------------------------------------------------------
//
// The orrery is the case that prompted this. ui/orreryDraw.js is canvas 2D -- getContext("2d"), 28 drawing
// calls, four of them fillText -- so it has NO shader stage at all and no effect in this tree can touch it. The
// route off 2D is gfx/device.js, and its labels would need text/slug*.js, the tree's own GPU glyph renderer.
//
// *** text/slugShader.js IS GLSL-ONLY: 337 lines, zero WGSL. *** It is one of the 129. So a orrery ported to
// gfx/device.js draws on the WebGL2 backend and, on the WebGPU backend, gets as far as createShaderModule({
// code: undefined }) -- because gfx/device.js reads d.shaders.wgsl unconditionally and does not check. Labels
// would not degrade; the pipeline would throw.
//
// That is the actual blocker, it is one file, and it is now a number instead of a hunch.
//
// v4457 -- AND THE FILE HAS ITS TWIN: text/slugShaderWgsl.js, WGSL-only, held to text/slugEval.js on a device by
// tools/ship/slugWgsl-selfcheck.mjs. slugShader.js stays GLSL-only so it still diffs line for line against the
// HLSL, which is why the count above did not move and wgslOnly did. The next blocker is in gfx/device.js: a
// pipeline descriptor with no blend state (Slug needs ONE, ONE_MINUS_SRC_ALPHA) and a texture path that uploads
// rgba8unorm only, where the atlas is rgba16float and rg16uint. docs/TSL-ROADMAP.md step 7 carries the order.
//
// *** AND A CORRECTION THIS FILE OWES ITS OWN ROUND. *** v4269 said the port could only be checked
// structurally because nothing here can execute WGSL. That was inferred, never tested, and is false: Chromium
// on this box serves a WebGPU adapter over a SECURE origin -- http://127.0.0.1, not about:blank, which is the
// distinction ui/webgpuProbe.mjs has drawn since v3666 and which the first probe still got wrong.
// tools/ship/webgpuHarness.mjs compiles and runs WGSL on that device, and v4270's render/badTvWgsl.mjs is
// graded against render/badTvModel.mjs numerically, agreeing to 3.2e-8. The COUNT above stands; the claim
// about what could be verified did not.
//
// ---- *** THE MARKERS ARE BUILT BY CONCATENATION, AND THAT IS DELIBERATE. *** -----------------------------------
//
// Seven times in seven rounds a scan in this tree has counted itself: v4262 twice, v4263, v4266's gate and its
// version note, v4267's register block, v4268's version note. Every previous fix was an exclusion list, which
// works and has to be maintained and re-argued each time a new file legitimately names the thing.
//
// A census of shader-language markers cannot use an exclusion list without immediately needing one for itself
// AND for its gate. So neither file contains the markers: they are assembled at run time from fragments, and
// tools/ship/backendParity-selfcheck.mjs asserts as a CHECK that scanning this module and that gate finds
// neither of them. The exclusion list is not maintained because it does not exist.
"use strict";

/** Assembled, never written literally -- see the note above. */
export const GLSL_MARK = "#" + "version 300 es";
export const WGSL_MARKS = Object.freeze(["@" + "vertex", "@" + "fragment", "@" + "compute"]);

/**
 * *** THE DIRECTIVE ALONE MISSES EVERY three.js PASS, AND v4270 FOUND THAT BY TRIPPING OVER IT. ***
 *
 * v4269 counted GLSL by the version directive alone and reported 118. Then v4270 asserted, in a new check,
 * that render/badTvPass.js "really is GLSL" -- and the gate went red, because badTvPass.js does not contain the
 * directive at all. It does not need to: it hands its source to THREE.ShaderMaterial, and three PREPENDS the
 * version. The file is unambiguously GLSL -- `uniform sampler2D tDiffuse;`, `void main()` -- and the census
 * called it none.
 *
 * Sixteen files are in that position, among them badTvPass, aquarellePass, grassField, solidTexture and
 * atmosphere: the post-effect passes, which is to say exactly the population a "can this move to WebGPU"
 * census is for. So the marker is now a pair, and both halves are counted separately rather than merged,
 * because they mean different things: a file with the directive drives raw WebGL2 and one without it is
 * riding a framework that supplies the header.
 */
export const GLSL_TELL = new RegExp(
    // *** ASSEMBLED, LIKE THE OTHER MARKERS, AND THE FIRST DRAFT WAS NOT. *** Written as a regex LITERAL, this
    // pattern contains the words it searches for, so this module matched itself and the gate matched itself:
    // glslBearing jumped 134 -> 135 and framework 16 -> 17 on the very next run. The eighth self-count in
    // eight rounds, caught immediately because section 2 asserts the absence rather than trusting the habit.
    "uni" + "form\\s+(sam" + "pler2D|flo" + "at|ve" + "c[234]|ma" + "t[234])\\s+\\w+\\s*;");

/** A check about CODE strips comments first -- the rule settled at v4266 and re-earned here. */
export function codeOnly(t) {
    return String(t).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

export const LANG = Object.freeze({ NONE: "none", GLSL: "glsl", WGSL: "wgsl", BOTH: "both" });

/**
 * Which shader languages a file's CODE contains.
 *
 * *** COMMENT STRIPPING IS NOT COSMETIC HERE AND THE DIFFERENCE WAS MEASURED. *** Counted against raw text the
 * WGSL total is 39; counted against code it is 38. One file discusses a WGSL entry-point attribute in prose and
 * ships none, and a raw scan calls that file WebGPU-ready.
 */
export function classify(text) {
    const t = codeOnly(text);
    const g = t.includes(GLSL_MARK) || GLSL_TELL.test(t);
    const w = WGSL_MARKS.some((m) => t.includes(m));
    return g && w ? LANG.BOTH : g ? LANG.GLSL : w ? LANG.WGSL : LANG.NONE;
}

/** Which of the two GLSL forms a file uses, for the split the baseline records. */
export function glslStyle(text) {
    const t = codeOnly(text);
    if (t.includes(GLSL_MARK)) return "directive";      // raw WebGL2: the file writes its own header
    if (GLSL_TELL.test(t)) return "framework";          // three.js ShaderMaterial: three prepends the version
    return null;
}

/** gfx/device.js's contract, restated where a check can read it rather than left in its header. */
export const DEVICE_CONTRACT = Object.freeze({
    module: "gfx/device.js",
    requires: "a pipeline must supply shaders.wgsl AND shaders.glsl -- each backend takes its own",
    // The failure is not graceful: webgpuBackend does createShaderModule({ code: d.shaders.wgsl }) with no
    // guard, so a GLSL-only pipeline reaches the GPU as `undefined` rather than as a refusal a caller can read.
    unguardedRead: "d.shaders.wgsl",
    consumers: Object.freeze(["gfx-device.html", "nebula-device.html"]),
});

/**
 * The measurement, as a ratchet. `both` may rise and `glslOnly` may fall; the reverse is a regression.
 *
 * Measured at v4269 over .js/.mjs/.html outside node_modules and vendor, comments stripped.
 */
export const PARITY_BASELINE = Object.freeze({
    // *** v4269 RECORDED 118 AND THAT WAS AN UNDERCOUNT OF 16. *** See GLSL_TELL: the directive-only marker
    // could not see a three.js ShaderMaterial pass, which is exactly the population this census is about.
    //
    // *** Level 11 -- THE RECORD WAS STALE FROM v4272 AND NOBODY LOOKED. *** Re-measured at HEAD before this round's
    // files existed: 137 GLSL, 43 WGSL, both 5 -- two GLSL and four WGSL files had arrived over 25 rounds with
    // this gate red and unlisted in redCensus (it was green at v4279, so v4296's honest UNKNOWN -- "whether any
    // gate green at v4279 has since gone red" -- had at least this one instance). Then Level 11 itself: +1 to
    // every column for render/gpuDriven.mjs, the first shader MODULE that ships both languages on purpose for
    // gfx/device.js (a cull pass in WGSL, a render pair in both), and +1 WGSL for a gate that embeds a
    // fragment-stage literal to rank it.
    // Level 12 -- Level 12: render/gpuTerrain.mjs is the second deliberate dual-language shader module (its vertex
    // stage lifts a heightfield in both languages), render/gpuOrbits.mjs is WGSL-only (a compute pass has no
    // WebGL2 half; its twin is JavaScript), and one more gate embeds a fragment literal.
    // v4301 (Level 15) -- render/fleets.mjs: the third deliberate dual-language module, five looks and two pick
    // shaders in both languages (+1 to glslBearing, wgslBearing and both).
    // v4315 -- render/lyapunovWgsl.mjs (both languages: the key and the look) and render/heidlerWgsl.mjs (WGSL only,
    // a compute probe): our own physics, each with an exact key, graded on the device path.
    // v4318 -- render/blackbodyWgsl.mjs: both languages (the key on either backend, the probe on WebGPU), Wien's root by
    // the device's own Newton; the third physics module with an exact key.
    // v4319 -- render/fleetMask.mjs grew a WGSL+GLSL pair at v4318 (the pick-to-mask pass and the composite) and
    // world/populationPolicy.mjs a WGSL compute pass, AFTER v4318's parity run -- the baseline shipped one round stale
    // and this round's run caught it. Re-measured: +1 GLSL, +2 WGSL, +1 both, +1 WGSL-only. (render/badTvTsl.mjs and
    // render/blackbodyTsl.mjs carry NEITHER language: TSL is JavaScript, and three writes the shaders at run time --
    // which is exactly what this census cannot see, said in docs/TSL-ROADMAP.md step 4.)
    // v4320 -- render/tslSource.mjs: the device's WGSL vertex shell and the GLSL preamble it writes around three's
    // generated fragment (+1 GLSL, +1 WGSL, +1 both). Its gate carries a fixture in both languages with the markers
    // assembled by concatenation, so it does not count. The GENERATED pair itself lives in tools/ship/tsl-emitted.json,
    // which no census scans -- the first shader pair in this tree that is data rather than source.
    // v4322, moved to render/fleetTsl.mjs at v4329 -- the fleet shells for the transplant carry a WGSL prefix and a GLSL
    // preamble (+1 GLSL, +1 WGSL, +1 both). tslRace-selfcheck's fixture is JSON, tsl-rig.html has no shader text.
    // v4381 -- tools/ship/brainTsl-selfcheck.mjs carries WGSL and no GLSL (+1 WGSL-bearing, +1 WGSL-only).
    // It is a GATE rather than a shader module, and it holds the text for the reason this census is least
    // able to see: it asserts against brain/mlp.js's kernel BY QUOTING IT -- the compute entry point with its
    // 8x8 workgroup, and the kernel function's name -- because the claim it makes is that a GENERATED pass
    // reproduces that hand-written one. (THIS COMMENT CANNOT SPELL EITHER MARKER OUT, and finding that out
    // cost a red run: a census file that names a marker literally becomes its own subject, which is the same
    // trap seven earlier gates here fell into and the eighth was v4332's. The gate's own line is one file
    // away and can be read there.) The generated half is not here and is not anywhere a census can read: it
    // exists only inside a WebGPU renderer at run time, which is the same blind spot v4319 recorded for badTvTsl and blackbodyTsl
    // and docs/TSL-ROADMAP.md step 4 states outright. So the number moves by one and the reach does not.
    // render/brainTsl.mjs itself carries NEITHER language, for exactly that reason: TSL is JavaScript.
    // v4473 -- glslBearing 147 -> 148, glslDirective 130 -> 131, wgslBearing 65 -> 66, both 14 -> 15: render/litSphere.mjs,
    // the 3D orrery's first step -- a sphere mesh with normals and a LIT render pair (a point light in the uniform,
    // the normal at location 4, an emissive word in the extras) in both languages, so the orrery draws lit spheres on
    // WebGPU and on WebGL2 alike. Graded against a CPU sphere it never rendered by tools/ship/litSphere-selfcheck.mjs.
    // v4483 -- render/tslWide.mjs: the quad shell for the widened transplant carries a WGSL prefix and a GLSL preamble, and the
    // hand twin both languages (+1 GLSL, +1 WGSL, +1 both). Its fixture and its emitted pair are JSON.
    glslBearing: 154,    // v4499: +1, render/stereographic.mjs; v4504: +1, render/zoomBlur.mjs; v4505: +1, render/asciiShape.mjs; v4506: +1, render/water2d.mjs (the 2D water pass); v4514: +1, render/probeLit.mjs
    glslDirective: 137,  // raw WebGL2 -- the file writes its own version header (v4483: +1, render/tslWide.mjs; v4499: +1, render/stereographic.mjs; v4504: +1, render/zoomBlur.mjs; v4505: +1, render/asciiShape.mjs; v4506: +1, render/water2d.mjs; v4514: +1, render/probeLit.mjs)
    glslFramework: 17,   // three.js prepends it: badTvPass, aquarellePass, grassField, solidTexture, atmosphere, ...
    // v4392 -- 57 -> 58, and the file is a GATE rather than a shipping module. tools/ship/shipyard-selfcheck.mjs
    // section 8 embeds a WGSL compute shader to run the four float32 encodings on a real device, so it bears WGSL
    // and ships none. THAT IS THE POPULATION THIS CENSUS EXISTS TO SEE and it is counted rather than exempted:
    // an exclusion for "gates do not count" would have hidden every probe this tree has written, which is most of
    // the WGSL it owns. The same file is why wgslOnly moves too; nothing else changed.
    // v4416 -- 58 -> 59, and this one is a SHIPPING MODULE that carries WGSL and no GLSL on purpose.
    // physics/render/pathTracerGpu.mjs puts the path tracer's Lambertian transport loop on a compute shader;
    // there is no WebGL2 half and there is not going to be one, because the thing it needs is a compute
    // dispatch. That is the same shape render/gpuOrbits.mjs was recorded under at Level 12 -- "a compute pass
    // has no WebGL2 half; its twin is JavaScript" -- and here the twin is physics/render/pathTracer.mjs,
    // which the module imports rather than restates so the two cannot drift. The same file is why wgslOnly
    // moves too; nothing else changed.
    // v4418 -- 59 -> 60, the second WGSL-only SHIPPING module in two rounds. physics/render/rtPipeline.mjs
    // splits v4417's monolithic trace loop into Vulkan's named ray-tracing stages behind a shader binding
    // table; like pathTracerGpu it has no WebGL2 half by construction, because a compute dispatch has none.
    // *** THAT THIS RATCHET HAS NOW GONE RED TWO ROUNDS RUNNING IS THE RATCHET WORKING, NOT A NUISANCE: ***
    // both times it named the arriving file rather than showing a number that moved, which is exactly what
    // v4399's rule asked of a count baseline. The same file is why wgslOnly moves too; nothing else changed.
    // v4457 -- 60 -> 61, a SHIPPING MODULE that carries WGSL and no GLSL, and the one this ratchet was waiting
    // for: text/slugShaderWgsl.js is the WGSL twin of text/slugShader.js, whose GLSL-only state this file's own
    // header names as "the actual blocker, it is one file". The pair is split across two files rather than one
    // because the GLSL port's whole value is that it diffs line for line against SlugPixelShader.hlsl, and a
    // second language interleaved in it would end that; so `both` does not move and wgslOnly does. The twin is
    // held to text/slugEval.js on a real device by tools/ship/slugWgsl-selfcheck.mjs: exact on 83,137 sharp
    // samples, inside 3.2e-6 at 28 and 12 px/em. The same file is why wgslOnly moves too; nothing else changed.
    // v4459 -- glslBearing 145 -> 146, wgslBearing 61 -> 62, both 13 -> 14, directive 129 -> 130: render/texelProbe.mjs,
    // a SHIPPING pair that reads a texel's bits back out of a device texture in both languages, so a format the
    // device uploads can be graded exactly rather than by picture. It is a module and not its gate on purpose:
    // the first draft put the pair inside tools/ship/deviceFormats-selfcheck.mjs, and this census counted the
    // gate as a device consumer beside the two demos -- correctly, since it carried both languages and imported
    // gfx/device.js. The v4278 note below section 4 records the same shape; the module is the honest answer.
    // v4460 -- glslBearing 146 -> 147, glslOnly 132 -> 133, framework 16 -> 17: render/slugDevice.mjs, which carries
    // no shader of its own but REWRITES text/slugShader.js's GLSL uniform declarations to the WGSL struct's names
    // for gfx/device.js, and the rewrite's replacement text is a GLSL declaration. Counted, not exempted, as
    // v4392 ruled for gates: a file that writes GLSL text is GLSL-bearing whatever its reason. (Its gate carried
    // the same declaration in an assertion for one run and was counted as a device consumer for it; the gate now
    // assembles the words, per the rule this file states below section 4.)
    // v4464 -- wgslBearing 62 -> 63, wgslOnly 48 -> 49: gfx/device.js ITSELF, which carried no shader text for
    // sixty-odd levels and now holds the mip blit's WGSL -- a full-screen triangle sampling level i-1 into level i,
    // the pass WebGPU runs where WebGL2 runs gl.generateMipmap. It is WGSL-only BY NATURE and not by omission:
    // its GLSL twin is a single GL call, and writing a GLSL blit beside it would be a second implementation of a
    // thing the driver already does. Counted, not exempted (v4392's rule); the device is now a WGSL bearer in
    // this census, which is the one honest reading of a backend that owns a shader. Graded on both backends by
    // tools/ship/deviceMipmaps-selfcheck.mjs, every level against a CPU box filter.
    // v4465 -- wgslBearing 63 -> 64, wgslOnly 49 -> 50: physics/xpbd/xpbdWgsl.mjs, the first shader module under
    // physics/ that runs through gfx/device.js -- the cloth's predict, solve and finalize passes as WGSL compute.
    // WGSL-only by nature: WebGL2 has no compute stage, and the handle runs the shipped f64 solver there, which is
    // the CPU_TWIN contract gfx/device.js's refusal asks for. Graded by tools/ship/xpbdDevice-selfcheck.mjs.
    // v4469 -- wgslBearing 64 -> 65, wgslOnly 50 -> 51: physics/chaos/logisticWgsl.mjs, the step loop's first consumer
    // (one compute kernel; its WebGL2 twin is orbitCpu, per the CPU_TWIN contract). Graded by tools/ship/stepLoop-selfcheck.mjs.
    // v4480 -- wgslBearing 66 -> 67, wgslOnly 51 -> 52: render/worleyWgsl.mjs, the Worley biome field as a compute pass
    // (WGSL-only by nature: no compute stage on WebGL2, where the f32 twin paints the same bytes -- the CPU_TWIN contract).
    // Held to world/worleyBiomes.js through one implementation with one rounding knob by tools/ship/worleyDevice-selfcheck.mjs.
    wgslBearing: 73,     // v4499: +1, render/stereographic.mjs; v4504: +1, render/zoomBlur.mjs; v4505: +1, render/asciiShape.mjs; v4506: +1, render/water2d.mjs; v4514: +1, render/probeLit.mjs
    both: 21,            // v4499: +1, render/stereographic.mjs -- both languages in one module, a CPU twin beside them
                         // v4504: +1, render/zoomBlur.mjs -- the radial march toward an arbitrary centre, both languages, a CPU twin, GODRAYS_FS graded beside it
                         // v4505: +1, render/asciiShape.mjs -- the six-point glyph search, both languages, a CPU argmin twin, the table derived from Plex
                         // v4506: +1, render/water2d.mjs -- the 2D water: displacement, tint and foam, both languages, a CPU twin that names every texel
                         // v4514: +1, render/probeLit.mjs -- the probe-lit pipeline: the SH volume read by integer texel and evaluated per fragment, both languages
    glslOnly: 133,
    wgslOnly: 52,
    // Of `both`, the ones that are shader modules rather than pages. This is the number that matters for reach:
    // a page carrying both languages carries its own two shaders, and lends nothing to anybody else.
    bothShaderModules: Object.freeze(["fx/nebula/nebulaShaders.js", "fx/wormhole/wormholeNebula.js", "render/blackbodyWgsl.mjs", "render/fleetMask.mjs", "render/fleets.mjs", "render/gpuDriven.mjs", "render/gpuTerrain.mjs", "render/fleetTsl.mjs", "render/lyapunovWgsl.mjs", "render/tslSource.mjs", "render/stereographic.mjs", "render/texelProbe.mjs", "render/litSphere.mjs", "render/tslWide.mjs", "render/zoomBlur.mjs", "render/asciiShape.mjs", "render/water2d.mjs", "render/probeLit.mjs"]),
    bothPages: Object.freeze(["gfx-device.html", "nebula-device.html", "wormhole-jump.html"]),
    wgslRawVsCode: Object.freeze({ raw: 54, code: 51 }),
});

/**
 * *** THE `both` COUNT DID NOT MOVE WHEN v4270 PORTED A SHADER, AND THAT IS A LIMIT OF THE METRIC. ***
 *
 * badTv now exists in both languages -- render/badTvPass.js holds the GLSL, render/badTvWgsl.mjs the WGSL --
 * but they are two FILES, so a per-file "carries both" count still reads 5. The census measures files because
 * files are what a scanner can see; an EFFECT is what a person cares about. Both numbers are true and they
 * answer different questions, so the pairs are listed rather than folded into the count.
 *
 * A pair here is a stronger claim than a file that happens to contain both markers: it means somebody carried
 * one across deliberately and a gate compares them.
 */
export const PORTED_PAIRS = Object.freeze([
    Object.freeze({ effect: "badTv", glsl: "render/badTvPass.js", wgsl: "render/badTvWgsl.mjs",
                    model: "render/badTvModel.mjs", gate: "tools/ship/badTvWgsl-selfcheck.mjs",
                    graded: "numerically, on a real GPU, against the CPU model -- agrees to 3.2e-8" }),
    // *** THE DEVICE PIPELINE, WHICH IS THE PAIR THAT ACTUALLY SATISFIES gfx/device.js. *** The entry above is
    // the three.js pass beside its WGSL twin; this one is a single descriptor carrying both languages, which
    // is what the abstraction asks for. It renders on BOTH backends and v4271 diffs the frames: 0 of 4,096
    // pixels differ, and both match the CPU model exactly.
    Object.freeze({ effect: "badTv (device pipeline)", glsl: "render/badTvDevicePass.mjs",
                    wgsl: "render/badTvWgsl.mjs", model: "render/badTvModel.mjs",
                    gate: "tools/ship/badTvDevicePass-selfcheck.mjs",
                    graded: "rendered on WebGPU and WebGL2 and diffed -- 0 of 4096 pixels differ, both exact " +
                            "against the CPU model" }),
]);

/** Walk a tree and classify every candidate file. Pure but for the two readers handed in. */
export function census(root, { readdir, readFile, join, relative }) {
    const skip = new Set(["node_modules", ".git", "vendor"]);
    const out = { glsl: [], wgsl: [], both: [], none: 0, scanned: 0 };
    (function walk(dir) {
        let ents = [];
        try { ents = readdir(dir); } catch { return; }
        for (const e of ents) {
            if (skip.has(e.name)) continue;
            const full = join(dir, e.name);
            if (e.isDirectory()) { walk(full); continue; }
            if (!/\.(js|mjs|html)$/.test(e.name)) continue;
            let body = ""; try { body = readFile(full); } catch { continue; }
            out.scanned++;
            const rel = relative(root, full).split(/[\\/]/).join("/");
            const k = classify(body);
            if (k === LANG.BOTH) { out.both.push(rel); out.glsl.push(rel); out.wgsl.push(rel); }
            else if (k === LANG.GLSL) out.glsl.push(rel);
            else if (k === LANG.WGSL) out.wgsl.push(rel);
            else out.none++;
        }
    })(root);
    for (const k of ["glsl", "wgsl", "both"]) out[k].sort();
    return out;
}

/** Counts from a census, in the shape PARITY_BASELINE is written in, so the two can be compared directly. */
export function countsOf(c) {
    return {
        glslBearing: c.glsl.length, wgslBearing: c.wgsl.length, both: c.both.length,
        glslOnly: c.glsl.length - c.both.length, wgslOnly: c.wgsl.length - c.both.length,
    };
}

/**
 * What a named module would need before gfx/device.js could carry it to the WebGPU backend.
 *
 * Returns null when it is already ready, so a caller can treat null as "nothing to do".
 */
export function shortfall(rel, text) {
    const k = classify(text);
    if (k === LANG.BOTH) return null;
    if (k === LANG.NONE) return { file: rel, has: k, needs: "nothing -- it ships no shader at all" };
    if (k === LANG.WGSL) return { file: rel, has: k, needs: "a GLSL path, for the WebGL2 fallback" };
    return { file: rel, has: k, needs: "a WGSL path, or the WebGPU backend reaches createShaderModule with undefined" };
}
