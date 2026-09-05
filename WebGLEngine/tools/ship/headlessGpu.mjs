// WebGLEngine/tools/ship/headlessGpu.mjs -- v4292
//
// *** A REAL GPU IN NODE, WITH NO BROWSER, AND THE DRIVER THAT MAKES IT POSSIBLE SHIPS INSIDE THE BROWSER. ***
//
// Every WGSL gate in this tree runs through tools/ship/webgpuHarness.mjs, which launches headless Chromium,
// stands up an HTTP server on 127.0.0.1 because navigator.gpu is refused on a file: origin, opens a page and
// evaluates the work inside it. That is a lot of machinery to multiply some numbers, and it is paid PER CALL:
// the harness has no way to keep a browser alive between invocations, so v4290's gate launched four of them.
//
// v4291 went looking for a way out and found the wrong door. @node-3d is prebuilt, MIT and needs no compiler,
// but GLFW opens a WINDOW -- "GLFW Error 65550: Failed to detect any supported platform" on a headless box --
// and headless-gl compiles here and still returns null, because on Linux it goes through GLX and links libX11.
// Neither is headless in the sense that matters. That round recorded the question as OPEN. This one answers it.
//
// ================================================================================================
// WHAT ACTUALLY WORKS, AND WHY IT IS FUNNY
// ================================================================================================
//
// Dawn -- the same WebGPU implementation Chromium uses -- is on npm as `webgpu` (dawn-gpu/node-webgpu, MIT,
// prebuilt, no compiler). It speaks Vulkan. This box has libvulkan.so.1 and NO Vulkan driver:
//
//     Warning: vkCreateInstance: Found no drivers!
//     Warning: vkCreateInstance failed with VK_ERROR_INCOMPATIBLE_DRIVER
//
// *** AND THE DRIVER IS SITTING INSIDE THE CHROMIUM WE ARE TRYING TO STOP LAUNCHING. *** Playwright's browser
// bundle ships libvk_swiftshader.so and a vk_swiftshader_icd.json manifest beside it. Point VK_ICD_FILENAMES
// at that manifest and Dawn comes up on google/SwiftShader -- the SAME adapter string the Chromium path
// reports, because it is the same software rasteriser, reached without the browser around it.
//
// So the tree is not taking a new dependency on a GPU driver. It is using the one it already downloads.
//
// ================================================================================================
// MEASURED, AND THE ONE TIMING IN THIS TREE THAT IS ALLOWED TO MEAN SOMETHING
// ================================================================================================
//
// Every previous round refused to report timings because the adapter is a software rasteriser, so a
// milliseconds-per-triangle figure would be a fact about a CPU pretending to be a GPU. THIS IS DIFFERENT: what
// is being timed is PROCESS AND HARNESS OVERHEAD -- browser launch, HTTP server, page navigation -- which is
// real wall-clock a person waits for and is not a GPU measurement at all.
//
//     Chromium harness, per runWgslCompute call   212 - 620 ms   (a browser launch every time)
//     node-webgpu, whole cold process              97 - 112 ms
//     node-webgpu, Dawn init + adapter + device            6 ms
//     node-webgpu, per dispatch once warm            11 - 18 ms
//
// The harness cannot reuse a browser across calls, so a four-dispatch gate pays roughly 850 ms there against
// roughly 54 ms here. THE SHADER RESULTS ARE BYTE-IDENTICAL: v4290's LCG shader, unmodified, returns 512 of
// 512 matching u32 states, 512 of 512 bracketing f64, and fits the same double-rounding model 512 of 512.
//
// ================================================================================================
// THE HAZARD, AND THE EXACT CONDITION -- WHICH IS NARROWER THAN THE FIRST DRAFT SAID
// ================================================================================================
//
// *** A PROCESS THAT STILL HOLDS A GPUDevice WHEN IT EXITS ABORTS WITH SIGABRT, EXIT CODE 134, AFTER ALL THE
// WORK HAS COMPLETED AND PRINTED CORRECT RESULTS. ***
//
//     terminate called after throwing an instance of 'std::system_error'
//       what():  Invalid argument
//
// The first version of this header said "a process that requests a device and exits naturally", and the gate
// written to prove it CAME BACK GREEN ON THE WRONG SIDE: the natural-exit child exited 0, because the harness
// below keeps its device function-local. Measured properly, the condition is REACHABILITY AT EXIT:
//
//     adapter only, module scope          exit 0
//     DEVICE HELD AT MODULE SCOPE         EXIT 134
//     device function-local, released     exit 0
//     device + buffer local, destroyed    exit 0
//
// Dawn's teardown races Node's exit only while something still references the device. Read by exit code that
// is a false FAILURE; read by stdout alone it is a PASS ON A PROCESS THAT ABORTED, which is worse because it
// looks like good news.
//
// TWO DEFENCES, AND THEY ARE DIFFERENT. runWgslComputeNative is safe BY CONSTRUCTION -- its device is a local
// that goes out of scope before the function returns, so a caller who only uses this harness never meets the
// abort. `exitCleanly` is for a caller who holds a device on purpose, which is the natural thing to do when
// running many dispatches. The gate spawns all three shapes and reads all three codes, because a mitigation
// nobody has watched fail is not known to be doing anything -- and because the first draft of this paragraph
// was wrong in a way only a spawned process could reveal.
//
// ================================================================================================
// WHAT THIS DOES NOT SOLVE
// ================================================================================================
//
// WebGL2 IS UNCHANGED AND STILL NEEDS CHROMIUM. renderGlslToPixels and renderThreePassToPixels drive real GLSL
// against a real WebGL2 context, and nothing here touches that: Dawn is WebGPU only. The tree's GLSL gates keep
// launching a browser, and saying otherwise would be the overclaim this round exists to avoid making.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// *** ONE PLACE THAT KNOWS, following playwrightResolve.mjs's rule verbatim: three gates each grew their own
// guess and two went stale on the same box. A second copy of this list is that defect happening again. ***
export const WEBGPU_PATHS = Object.freeze([
    "webgpu",
    "/opt/node22/lib/node_modules/webgpu/index.js",
    "/usr/local/lib/node_modules/webgpu/index.js",
    "/home/claude/.npm-global/lib/node_modules/webgpu/index.js",
]);

/** Where a Playwright browser bundle keeps its Vulkan driver. */
export const ICD_ROOT = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
export const ICD_LEAF = path.join("chrome-linux", "vk_swiftshader_icd.json");

/**
 * Every SwiftShader ICD manifest under the browser root, SORTED so two boxes with the same bundles pick the
 * same one. Returns paths, not a boolean: a gate that cannot say which driver it used cannot be re-diagnosed
 * when the next Playwright version moves the directory -- which it will, the name carries a build number.
 */
export function findVulkanIcds(root = ICD_ROOT) {
    let entries = [];
    try { entries = fs.readdirSync(root); } catch { return []; }
    return entries.map((d) => path.join(root, d, ICD_LEAF)).filter((p) => fs.existsSync(p)).sort();
}

/**
 * Point Dawn at a driver, unless the environment already chose one.
 *
 * AN EXPLICIT VK_ICD_FILENAMES IS NEVER OVERRIDDEN. Somebody who set it meant it -- a real GPU, a different
 * SwiftShader, a debug driver -- and a helper that silently redirected them to Chromium's copy would make
 * every result a fact about a driver they did not pick.
 */
export function configureVulkanIcd(root = ICD_ROOT) {
    if (process.env.VK_ICD_FILENAMES) return { path: process.env.VK_ICD_FILENAMES, chosen: false, found: [] };
    const found = findVulkanIcds(root);
    if (!found.length) return { path: "", chosen: false, found };
    process.env.VK_ICD_FILENAMES = found[0];
    return { path: found[0], chosen: true, found };
}

/** Resolve node-webgpu the way the tree resolves playwright: a list, in order, and report which one answered. */
export function resolveWebgpu(requireFn) {
    const req = requireFn || createRequire(import.meta.url);
    for (const m of WEBGPU_PATHS) {
        try { const mod = req(m); if (mod && typeof mod.create === "function") return { mod, from: m }; }
        catch { /* next */ }
    }
    return { mod: null, from: "" };
}

/**
 * Why a caller cannot run, or null when it can. Two independent facts reported on their own evidence rather
 * than collapsed into one guess -- browserSkipReason's rule, for the same reason it exists there.
 */
export function headlessGpuSkipReason(requireFn) {
    const { mod } = resolveWebgpu(requireFn);
    const icds = findVulkanIcds();
    if (!mod && !icds.length)
        return "neither node-webgpu (tried: " + WEBGPU_PATHS.join(", ") + ") nor a Vulkan ICD under " + ICD_ROOT;
    if (!mod)
        return "node-webgpu is not installed here -- `npm i -g webgpu` (a Vulkan ICD IS present at " + icds[0] + ")";
    if (!icds.length && !process.env.VK_ICD_FILENAMES)
        return "node-webgpu resolved but there is no Vulkan driver: no " + ICD_LEAF + " under " + ICD_ROOT +
               " and VK_ICD_FILENAMES is unset. Dawn will report 'Found no drivers!'";
    return null;
}

/**
 * *** THE ONLY SAFE WAY TO END A PROCESS THAT TOUCHED A DEVICE. *** See THE HAZARD above: a natural exit
 * aborts with 134 after the work is already correct. Explicit exit skips Dawn's teardown race entirely.
 *
 * It takes the code the caller decided on, so it can never turn a real failure into a success.
 */
export function exitCleanly(code) {
    process.exit(code);
}

export const EXIT_HAZARD = Object.freeze({
    signal: "SIGABRT or SIGSEGV -- NOT STABLE, both observed", code: 134,
    message: "terminate called after throwing an instance of 'std::system_error'  what(): Invalid argument",
    condition: "a GPUDevice is still REACHABLE when the process exits",
    signalVaries: "a sabotage run produced SIGSEGV where the clean run produced SIGABRT, so a check may only assert a non-zero exit",
    notMerely: "requesting a device -- an adapter alone is fine, and a device that goes out of scope is fine",
    afterWorkCompletes: true,
    worstReading: "stdout says PASS while the process aborted -- the failure looks like good news",
    measured: Object.freeze([
        Object.freeze({ shape: "adapter only, module scope", exit: 0 }),
        Object.freeze({ shape: "device held at module scope", exit: 134 }),
        Object.freeze({ shape: "device function-local, released", exit: 0 }),
        Object.freeze({ shape: "device + buffer local, destroyed", exit: 0 }),
    ]),
    harnessIsSafeByConstruction: "runWgslComputeNative keeps its device local, so it never reaches exit holding one",
    mitigationForHolders: "exitCleanly(code), for a caller that keeps a device alive across many dispatches",
    firstDraftWasWrong: "the header claimed any natural exit aborted; the gate's natural-exit child returned 0 and the claim had to be narrowed to reachability",
});

/**
 * PAPERWORK, because v4291 spent a whole round on a licence claim nobody had checked.
 *
 * *** SwiftShader IS NOT VENDORED AND IS NOT REDISTRIBUTED. *** The tree points VK_ICD_FILENAMES at the copy
 * that already arrived inside the Playwright browser bundle it downloads. Nothing is copied into this
 * repository, so this adds a RUNTIME dependency on a file the box already has and no distribution obligation
 * that Playwright was not already carrying.
 */
export const LICENCES = Object.freeze({
    nodeWebgpu: Object.freeze({ npm: "webgpu", version: "0.6.0", repo: "dawn-gpu/node-webgpu", licence: "MIT",
                                read: "node_modules/webgpu/package.json + LICENSE.md", vendored: false }),
    swiftShader: Object.freeze({ licence: "Apache-2.0", vendored: false,
                                 source: "shipped inside the Playwright chromium bundle as libvk_swiftshader.so",
                                 obligation: "none new -- the file is Playwright's, reached by path, never copied here" }),
    note: "the round takes NO new redistributable component; it takes one npm package and one environment variable",
});

export const MEASURED = Object.freeze({
    adapter: "google/swiftshader", driver: "SwiftShader driver 5.0.0",
    chromiumPerCallMs: Object.freeze([620, 272, 212]),
    nativeColdProcessMs: Object.freeze([100, 97, 112]),
    nativeInitMs: 6,
    nativePerDispatchMs: Object.freeze([18, 13, 11, 11, 12]),
    agreementShader: "physics/render/pathTracerWgsl.mjs lcgWgsl(), unmodified",
    agreement: Object.freeze({ states: "512/512", brackets: "512/512", doubleRounding: "512/512" }),
    whatIsTimed: "process and harness overhead, not GPU work -- the adapter is a software rasteriser either way",
});

/**
 * Compile and run one WGSL compute shader natively; return `outCount` f32 values from binding 0.
 *
 * DELIBERATELY THE SAME SHAPE AS webgpuHarness.runWgslCompute -- same options, same returned fields -- so a
 * gate can be moved from one backend to the other by changing the import and nothing else, and so the two can
 * be run side by side against the same inputs, which is what the gate does.
 */
/**
 * A storage input as whole 32-bit words: any ArrayBuffer or typed array, its byte length padded up to a
 * multiple of 4 (WebGPU refuses an odd-sized buffer, and a Uint16Array of odd length is one). The padding is
 * zero and sits past the last real element, where a shader that indexes correctly never reads.
 */
export function storageWords(data) {
    const u8 = data instanceof ArrayBuffer ? new Uint8Array(data)
             : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
             : null;
    if (!u8) throw new Error("headlessGpu: a storage input must be an ArrayBuffer or a typed array");
    const padded = Math.max(4, Math.ceil(u8.byteLength / 4) * 4);
    const out = new Uint8Array(padded);
    out.set(u8);
    return new Uint32Array(out.buffer);
}

export async function runWgslComputeNative({ code, entryPoint = "main", outCount, uniforms = null,
                                             workgroups = 1, compileOnly = false, requireFn = null,
                                             inputs = null, outInit = null } = {}) {
    const skip = headlessGpuSkipReason(requireFn);
    if (skip) return { ok: false, skipped: true, reason: skip, values: [], errors: [] };
    const icd = configureVulkanIcd();
    const { mod, from } = resolveWebgpu(requireFn);

    try {
        const gpu = mod.create([]);
        const adapter = await gpu.requestAdapter();
        if (!adapter) return { ok: false, skipped: false, reason: "requestAdapter() returned null with ICD " + icd.path, values: [], errors: [] };
        const info = adapter.info || {};
        const meta = { from, icd: icd.path,
                       adapter: { vendor: info.vendor || null, architecture: info.architecture || null,
                                  description: info.description || null } };
        const dev = await adapter.requestDevice();

        const shader = dev.createShaderModule({ code });
        // getCompilationInfo is how a WGSL error becomes a REPORT rather than a crash, same as the browser path.
        const ci = await shader.getCompilationInfo();
        const errors = ci.messages.filter((m) => m.type === "error").map((m) => `${m.lineNum}:${m.linePos} ${m.message}`);
        if (errors.length) return { ok: false, skipped: false, reason: "WGSL did not compile", errors, values: [], ...meta };
        if (compileOnly) return { ok: true, skipped: false, values: [], errors: [], compiledOnly: true, ...meta };

        const G = mod.globals || globalThis;
        const U = G.GPUBufferUsage || globalThis.GPUBufferUsage;
        const M = G.GPUMapMode || globalThis.GPUMapMode;
        const bytes = outCount * 4;
        const outBuf = dev.createBuffer({ size: bytes, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
        // v4465 -- `outInit`: the out buffer's starting contents, for a kernel that works IN PLACE on binding 0 (the
        // XPBD solve relaxes the prediction it is handed). Same option on the browser harness, same signature.
        if (outInit) dev.queue.writeBuffer(outBuf, 0, storageWords(outInit).subarray(0, outCount));
        const readBuf = dev.createBuffer({ size: bytes, usage: U.COPY_DST | U.MAP_READ });
        const entries = [{ binding: 0, resource: { buffer: outBuf } }];
        let uniBuf = null;
        if (uniforms) {
            uniBuf = dev.createBuffer({ size: Math.max(16, uniforms.length * 4), usage: U.UNIFORM | U.COPY_DST });
            dev.queue.writeBuffer(uniBuf, 0, new Float32Array(uniforms));
            entries.push({ binding: 1, resource: { buffer: uniBuf } });
        }
        // v4457 -- READ-ONLY STORAGE INPUTS, so a probe can read the bytes a texture would hold. The Slug gate
        // hands the atlas's own Uint16Arrays in here and unpacks halves on the device; a uniform buffer could not
        // carry them (64 KiB minimum limit, 16-byte array stride) and a texture path would need a second decoder.
        const inBufs = [];
        for (const inp of inputs || []) {
            const words = storageWords(inp.data);
            const b = dev.createBuffer({ size: words.byteLength, usage: U.STORAGE | U.COPY_DST });
            dev.queue.writeBuffer(b, 0, words);
            entries.push({ binding: inp.binding, resource: { buffer: b } });
            inBufs.push(b);
        }
        const pipe = dev.createComputePipeline({ layout: "auto", compute: { module: shader, entryPoint } });
        const bind = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries });
        const enc = dev.createCommandEncoder();
        const cp = enc.beginComputePass();
        cp.setPipeline(pipe); cp.setBindGroup(0, bind); cp.dispatchWorkgroups(workgroups); cp.end();
        enc.copyBufferToBuffer(outBuf, 0, readBuf, 0, bytes);
        dev.queue.submit([enc.finish()]);
        await readBuf.mapAsync(M.READ);
        const values = Array.from(new Float32Array(readBuf.getMappedRange()));
        readBuf.unmap();
        outBuf.destroy(); readBuf.destroy(); uniBuf?.destroy();
        for (const b of inBufs) b.destroy();
        return { ok: true, skipped: false, values, errors: [], ...meta };
    } catch (e) {
        return { ok: false, skipped: false, reason: "headlessGpu error: " + String(e).slice(0, 200), values: [], errors: [] };
    }
}

// ================================================================================================
// THE TEXTURE PATH, WHICH v4292 LEFT OUT AND v4294 HAD TO RECORD AS A HOLE
// ================================================================================================
//
// *** THE CROSS-BACKEND CORPUS COVERED SEVEN SHADERS AND NOT ONE OF THEM WROTE A TEXTURE. *** 41,656 floats of
// agreement, all of it through storage BUFFERS, while the one shader in the tree that writes a storage TEXTURE
// sat in wgslCorpus.EXCLUDED with "there is nothing to compare against" as its reason.
//
// That is the worst place to have no evidence. v4287 measured what storage-texture FORMAT handling does when
// it goes wrong: rgba8unorm clamped a peak of 1.7480 to 1.0000 and destroyed all 181 samples above 1, and the
// resulting image looked like a bloom that had simply never happened. Format and padding bugs do not announce
// themselves; they produce a plausible picture.
//
// TWO THINGS HERE ARE ARITHMETIC IN THE READER RATHER THAN THE SHADER, and both are copied deliberately from
// webgpuHarness.runWgslComputeToTexture rather than reinvented, because a second decoder that disagreed with
// the first would make every comparison a fact about the two readers:
//
//   ROW PADDING. copyTextureToBuffer pads every row up to a 256-byte multiple and the padding is not pixels.
//   Read flat, the image shears a few texels per row -- which looks exactly like a shader bug.
//   HALF FLOAT. rgba16float is 16 bits per channel with a 5-bit exponent and a 10-bit mantissa, and Node has
//   no native reader for it.
"use strict";

/** rgba16float bits -> double. The browser harness's decoder, character for character. */
export function halfToDouble(u) {
    const s = (u & 0x8000) ? -1 : 1, e = (u >> 10) & 0x1f, m = u & 0x3ff;
    if (e === 0) return s * Math.pow(2, -14) * (m / 1024);
    if (e === 31) return m ? NaN : s * Infinity;
    return s * Math.pow(2, e - 15) * (1 + m / 1024);
}

/** double -> rgba16float bits, for uploading a sampled input. Also the browser harness's, unchanged. */
export function doubleToHalf(v) {
    if (!isFinite(v)) return v > 0 ? 0x7c00 : 0xfc00;
    const s = v < 0 ? 0x8000 : 0; v = Math.abs(v);
    if (v === 0) return s;
    const e = Math.floor(Math.log2(v));
    if (e < -14) return s | Math.round(v / Math.pow(2, -24));
    if (e > 15) return s | 0x7c00;
    return s | ((e + 15) << 10) | (Math.round((v / Math.pow(2, e) - 1) * 1024) & 0x3ff);
}

export const BYTES_PER_TEXEL = Object.freeze({ rgba16float: 8, rgba8unorm: 4 });
export const paddedBytesPerRow = (n, format) =>
    Math.ceil(n * (BYTES_PER_TEXEL[format] || 4) / 256) * 256;

/**
 * Run a compute shader that writes a storage texture at binding 0, and read it back as RGBA floats.
 *
 * Deliberately the same signature and the same returned fields as
 * webgpuHarness.runWgslComputeToTexture, for the reason the buffer version gives: a corpus can only
 * exist if the two harnesses take the same options.
 */
export async function runWgslComputeToTextureNative({ code, entryPoint = "main", n = 64,
                                                      format = "rgba16float", uniforms = null,
                                                      workgroups = 1, inputTexel = null,
                                                      requireFn = null } = {}) {
    const skip = headlessGpuSkipReason(requireFn);
    if (skip) return { ok: false, skipped: true, reason: skip, pixels: null };
    const icd = configureVulkanIcd();
    const { mod, from } = resolveWebgpu(requireFn);

    try {
        const gpu = mod.create([]);
        const adapter = await gpu.requestAdapter();
        if (!adapter) return { ok: false, skipped: false, reason: "requestAdapter() returned null with ICD " + icd.path, pixels: null };
        const info = adapter.info || {};
        const meta = { from, icd: icd.path,
                       adapter: { vendor: info.vendor || null, architecture: info.architecture || null,
                                  description: info.description || null } };
        const dev = await adapter.requestDevice();
        const G = mod.globals || globalThis;
        const TU = G.GPUTextureUsage || globalThis.GPUTextureUsage;
        const BU = G.GPUBufferUsage || globalThis.GPUBufferUsage;
        const MM = G.GPUMapMode || globalThis.GPUMapMode;

        const shader = dev.createShaderModule({ code });
        const ci = await shader.getCompilationInfo();
        const errors = ci.messages.filter((m) => m.type === "error").map((m) => `${m.lineNum}:${m.linePos} ${m.message}`);
        if (errors.length) return { ok: false, skipped: false, reason: "WGSL did not compile", errors, pixels: null, ...meta };

        const tex = dev.createTexture({ size: [n, n], format,
            usage: TU.STORAGE_BINDING | TU.COPY_SRC });
        const bytesPerRow = paddedBytesPerRow(n, format);
        const readBuf = dev.createBuffer({ size: bytesPerRow * n, usage: BU.COPY_DST | BU.MAP_READ });

        const entries = [{ binding: 0, resource: tex.createView() }];
        if (inputTexel) {
            const u = new Uint16Array(n * n * 4);
            for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
                const p = inputTexel(x, y, n);
                for (let c = 0; c < 4; c++) u[(y * n + x) * 4 + c] = doubleToHalf(p[c]);
            }
            const src = dev.createTexture({ size: [n, n], format: "rgba16float",
                usage: TU.TEXTURE_BINDING | TU.COPY_DST });
            dev.queue.writeTexture({ texture: src }, u, { bytesPerRow: n * 8 }, [n, n]);
            entries.push({ binding: 2, resource: src.createView() });
        }
        if (uniforms) {
            const ub = dev.createBuffer({ size: Math.max(16, uniforms.length * 4), usage: BU.UNIFORM | BU.COPY_DST });
            dev.queue.writeBuffer(ub, 0, new Float32Array(uniforms));
            entries.push({ binding: 1, resource: { buffer: ub } });
        }

        const pipe = dev.createComputePipeline({ layout: "auto", compute: { module: shader, entryPoint } });
        const bind = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries });
        const enc = dev.createCommandEncoder();
        const cp = enc.beginComputePass();
        cp.setPipeline(pipe); cp.setBindGroup(0, bind); cp.dispatchWorkgroups(workgroups); cp.end();
        enc.copyTextureToBuffer({ texture: tex }, { buffer: readBuf, bytesPerRow }, [n, n]);
        dev.queue.submit([enc.finish()]);
        await readBuf.mapAsync(MM.READ);
        const raw = new Uint8Array(readBuf.getMappedRange()).slice();
        readBuf.unmap();
        tex.destroy(); readBuf.destroy();

        // ROW BY ROW. Reading the padding as pixels shears the image, which reads as a shader defect.
        const px = new Float32Array(n * n * 4);
        const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
        for (let y = 0; y < n; y++) {
            const row = y * bytesPerRow;
            for (let x = 0; x < n; x++) for (let c = 0; c < 4; c++) {
                const o = (y * n + x) * 4 + c;
                px[o] = format === "rgba16float" ? halfToDouble(dv.getUint16(row + (x * 4 + c) * 2, true))
                                                 : raw[row + x * 4 + c] / 255;
            }
        }
        return { ok: true, skipped: false, pixels: px, format, bytesPerRow, errors: [], ...meta };
    } catch (e) {
        return { ok: false, skipped: false, reason: "headlessGpu texture error: " + String(e).slice(0, 200), pixels: null };
    }
}
