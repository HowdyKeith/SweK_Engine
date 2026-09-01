// WebGLEngine/tools/ship/webgpuHarness.mjs -- v4270
//
// RUN WGSL ON A REAL GPU FROM A GATE. Compile a compute shader, dispatch it, read the numbers back.
//
// *** v4269 SAID "NOTHING HERE CAN EXECUTE WGSL" AND SHIPPED IT. THAT WAS WRONG. ***
// It is in that round's gate output, its module header and its changelog, and it was never tested -- it was
// inferred from "the build box has no GPU", which render/wgslSpec.mjs's header says and which is TRUE of a
// bare node process and irrelevant to a browser.
//
// *** AND THE FIRST PROBE THAT WENT LOOKING REPRODUCED THE EXACT MISTAKE ui/webgpuProbe.mjs EXISTS TO NAME. ***
// It launched Chromium, evaluated on the default about:blank page, got navigator.gpu === undefined across
// three flag combinations, and would have concluded "this box has no WebGPU". webgpuProbe.mjs's header, from
// v3666, is about precisely that confusion:
//
//     "'THE BROWSER HAS NO WebGPU' AND 'THIS ORIGIN DOES NOT GET WebGPU' ARE TWO THINGS WEARING ONE LABEL,
//      and the message named the wrong one -- so the reader goes looking at their GPU, their driver and their
//      browser version, none of which is the problem."
//
// WebGPU is gated on a SECURE CONTEXT. about:blank is not one. Served the same empty page over
// http://127.0.0.1 -- which browsers treat as secure -- navigator.gpu is present, requestAdapter() returns an
// adapter and requestDevice() returns a device, on the first flag set tried. The tree had the answer written
// down two years before I needed it and I still had to be caught by the gate's own subject.
//
// So this file serves over 127.0.0.1 and says so, loudly, where the next person will read it.
//
// ---- WHAT IT DOES AND DOES NOT PROMISE ------------------------------------------------------------------------
//
// It returns NUMBERS FROM A GPU. That makes a WGSL port gradeable against a CPU model the way this tree grades
// every other shader (render/crtModel.js against render/crtPass.js). It does NOT make the comparison
// automatically fair: the GPU computes in f32 and JavaScript in f64, so an ill-conditioned expression can
// differ hugely while both are correct. Measured while building this: sin(i * 12.9898) * 43758.5453 -- the
// classic hash -- returns 0.921690 on the CPU and 0.240234 on the GPU for i = 1, and the GPU values land on
// 1/1024 steps. Neither is wrong. The function is.
//
// A caller comparing values must therefore pick a tolerance that suits f32, or drive the CPU side through an
// f32-simulated path. shaders/ashimaNoise.mjs already has snoise3f32 for exactly this reason.
"use strict";

import http from "node:http";
import { createRequire } from "node:module";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import fs from "node:fs";
import path from "node:path";   // used by renderThreePassToPixels, which serves the engine tree over HTTP

/** The flags that worked, kept as data so a caller can report them and a future box can extend the list. */
export const LAUNCH_ARGS = Object.freeze(["--enable-unsafe-webgpu"]);

/** *** NOT about:blank. *** See the header -- this is the whole reason the harness has a server in it. */
export const SECURE_HOST = "127.0.0.1";

/**
 * Why a caller cannot run, or null when it can. Checked in the order a reader would want to act on.
 */
export function webgpuSkipReason(requireFn = createRequire(import.meta.url)) {
    if (!fs.existsSync(HEADLESS_SHELL)) return `no headless shell at ${HEADLESS_SHELL}`;
    if (!resolvePlaywright(requireFn)) return "playwright not resolvable -- see tools/ship/playwrightResolve.mjs";
    return null;
}

/**
 * Compile and run one WGSL compute shader; return `outCount` f32 values from binding 0.
 *
 * `uniforms` is an optional Float32Array bound at binding 1 when present, so a caller can vary knobs without
 * rebuilding the shader text -- a shader recompiled per case would test the compiler, not the arithmetic.
 *
 * Returns { ok, values, errors, adapter } and never throws for a shader-side problem: a compilation error is a
 * RESULT a gate should report, not an exception that hides which line failed.
 */
export async function runWgslCompute({ code, entryPoint = "main", outCount, uniforms = null,
                                       workgroups = 1, compileOnly = false, timeoutMs = 60000 }) {
    const requireFn = createRequire(import.meta.url);
    const skip = webgpuSkipReason(requireFn);
    if (skip) return { ok: false, skipped: true, reason: skip, values: [], errors: [] };
    const pw = resolvePlaywright(requireFn);

    const srv = http.createServer((_q, s) => {
        s.writeHead(200, { "Content-Type": "text/html" });
        s.end("<!doctype html><title>wgsl-harness</title>");
    });
    await new Promise((r) => srv.listen(0, SECURE_HOST, r));
    const url = `http://${SECURE_HOST}:${srv.address().port}/`;

    let browser = null;
    try {
        browser = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: [...LAUNCH_ARGS] });
        const page = await browser.newPage();
        await page.goto(url);
        const out = await page.evaluate(async (a) => {
            if (!navigator.gpu) return { ok: false, reason: "navigator.gpu absent even on a secure origin", secure: isSecureContext };
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) return { ok: false, reason: "requestAdapter() returned null -- present is not capable" };
            const dev = await adapter.requestDevice();
            const mod = dev.createShaderModule({ code: a.code });
            const info = await mod.getCompilationInfo();
            const errors = info.messages.filter((m) => m.type === "error")
                                        .map((m) => `${m.lineNum}:${m.linePos} ${m.message}`);
            if (errors.length) return { ok: false, reason: "WGSL did not compile", errors };
            // *** A SHADER THAT ONLY NEEDS TO COMPILE STOPS HERE. *** The shipping fragment shader has a
            // @vertex and a @fragment entry and writes to a render target, so there is no buffer to read back;
            // proving it COMPILES on a real device is a different and still necessary fact from proving the
            // probe's arithmetic. wgslSpec.mjs parses WGSL; only a driver accepts or rejects it.
            if (a.compileOnly) {
                const ai0 = adapter.info || {};
                return { ok: true, values: [], errors: [], compiledOnly: true,
                         warnings: info.messages.filter((m) => m.type === "warning").map((m) => m.message),
                         adapter: { vendor: ai0.vendor || null, architecture: ai0.architecture || null,
                                    description: ai0.description || null } };
            }

            const outBuf = dev.createBuffer({ size: a.outCount * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
            const readBuf = dev.createBuffer({ size: a.outCount * 4,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
            const entries = [{ binding: 0, resource: { buffer: outBuf } }];
            let uniBuf = null;
            if (a.uniforms) {
                uniBuf = dev.createBuffer({ size: Math.max(16, a.uniforms.length * 4),
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                dev.queue.writeBuffer(uniBuf, 0, new Float32Array(a.uniforms));
                entries.push({ binding: 1, resource: { buffer: uniBuf } });
            }
            const pipe = dev.createComputePipeline({ layout: "auto",
                compute: { module: mod, entryPoint: a.entryPoint } });
            const bind = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries });
            const enc = dev.createCommandEncoder();
            const cp = enc.beginComputePass();
            cp.setPipeline(pipe); cp.setBindGroup(0, bind); cp.dispatchWorkgroups(a.workgroups); cp.end();
            enc.copyBufferToBuffer(outBuf, 0, readBuf, 0, a.outCount * 4);
            dev.queue.submit([enc.finish()]);
            await readBuf.mapAsync(GPUMapMode.READ);
            const values = Array.from(new Float32Array(readBuf.getMappedRange()));
            readBuf.unmap();
            const ai = adapter.info || {};
            return { ok: true, values, errors: [],
                     adapter: { vendor: ai.vendor || null, architecture: ai.architecture || null,
                                description: ai.description || null } };
        }, { code, entryPoint, outCount, uniforms: uniforms ? Array.from(uniforms) : null, workgroups, compileOnly });
        return { skipped: false, errors: [], values: [], ...out };
    } catch (e) {
        return { ok: false, skipped: false, reason: "harness error: " + String(e).slice(0, 200), values: [], errors: [] };
    } finally {
        try { await browser?.close(); } catch {}
        srv.close();
    }
}

/**
 * Render a WGSL vs/fs pair over a source texture and read the frame back as RGBA bytes.
 *
 * *** THIS IS THE HALF runWgslCompute CANNOT DO, AND v4271 EXISTS BECAUSE OF THE DIFFERENCE. *** A compute
 * probe proves a shader computes the right coordinates. It cannot ask which way is up, because a coordinate
 * is a pair of numbers until something samples a real texture with it. The first render comparison in this
 * tree disagreed with its CPU model by 126 of 255 and agreed exactly at (1 - v): an orientation error, wholly
 * invisible to an arithmetic test that had already passed at 3.2e-8.
 *
 * The source texture is generated by `sourceTexel(x, y, n)` returning [r,g,b,a]. Making each texel encode its
 * own position turns a rendered pixel into a direct readout of WHICH texel the shader sampled, so the frame
 * can be compared to a CPU model pixel by pixel rather than judged by eye.
 *
 * Sampling is NEAREST with repeat addressing on purpose: linear filtering would blend two texels and turn an
 * exact comparison into an approximate one, hiding exactly the half-texel errors worth catching.
 */
export async function renderWgslToPixels({ code, width = 64, height = 64, srcSize = 64,
                                           uniforms = null, sourceTexel = null }) {
    const requireFn = createRequire(import.meta.url);
    const skip = webgpuSkipReason(requireFn);
    if (skip) return { ok: false, skipped: true, reason: skip, pixels: null };
    const pw = resolvePlaywright(requireFn);

    // Built HERE rather than in the page, so the same array the comparison uses is the one uploaded.
    const n = srcSize;
    const src = new Uint8Array(n * n * 4);
    const gen = sourceTexel || ((x, y, N) => [Math.round(x * 255 / (N - 1)), Math.round(y * 255 / (N - 1)), 0, 255]);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const px = gen(x, y, n), i = (y * n + x) * 4;
        src[i] = px[0]; src[i + 1] = px[1]; src[i + 2] = px[2]; src[i + 3] = px[3];
    }

    const srv = http.createServer((_q, s) => {
        s.writeHead(200, { "Content-Type": "text/html" });
        s.end("<!doctype html><title>wgsl-render</title>");
    });
    await new Promise((r) => srv.listen(0, SECURE_HOST, r));
    let browser = null;
    try {
        browser = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: [...LAUNCH_ARGS] });
        const page = await browser.newPage();
        await page.goto(`http://${SECURE_HOST}:${srv.address().port}/`);
        const out = await page.evaluate(async (a) => {
            if (!navigator.gpu) return { ok: false, reason: "navigator.gpu absent on a secure origin" };
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) return { ok: false, reason: "requestAdapter() returned null" };
            const d = await adapter.requestDevice();
            const mod = d.createShaderModule({ code: a.code });
            const ci = await mod.getCompilationInfo();
            const errors = ci.messages.filter((m) => m.type === "error")
                                      .map((m) => `${m.lineNum}:${m.linePos} ${m.message}`);
            if (errors.length) return { ok: false, reason: "WGSL did not compile", errors };

            const n2 = a.srcSize;
            const tex = d.createTexture({ size: [n2, n2], format: "rgba8unorm",
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
            d.queue.writeTexture({ texture: tex }, new Uint8Array(a.src), { bytesPerRow: n2 * 4 },
                                 { width: n2, height: n2 });
            const samp = d.createSampler({ magFilter: "nearest", minFilter: "nearest",
                                           addressModeU: "repeat", addressModeV: "repeat" });
            const uni = d.createBuffer({ size: Math.max(32, (a.uniforms || [0]).length * 4),
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            if (a.uniforms) d.queue.writeBuffer(uni, 0, new Float32Array(a.uniforms));
            const target = d.createTexture({ size: [a.width, a.height], format: "rgba8unorm",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
            const pipe = d.createRenderPipeline({ layout: "auto",
                vertex: { module: mod, entryPoint: "vs" },
                fragment: { module: mod, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] },
                primitive: { topology: "triangle-list" } });
            const bind = d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
                { binding: 0, resource: { buffer: uni } },
                { binding: 1, resource: samp },
                { binding: 2, resource: tex.createView() }] });
            // copyTextureToBuffer requires bytesPerRow to be a multiple of 256, so the readback is padded and
            // the caller is told the stride rather than left to assume width * 4.
            const bpr = Math.ceil(a.width * 4 / 256) * 256;
            const rb = d.createBuffer({ size: bpr * a.height,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
            const enc = d.createCommandEncoder();
            const rp = enc.beginRenderPass({ colorAttachments: [{ view: target.createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }] });
            rp.setPipeline(pipe); rp.setBindGroup(0, bind); rp.draw(3); rp.end();
            enc.copyTextureToBuffer({ texture: target }, { buffer: rb, bytesPerRow: bpr },
                                    { width: a.width, height: a.height });
            d.queue.submit([enc.finish()]);
            await rb.mapAsync(GPUMapMode.READ);
            const px = Array.from(new Uint8Array(rb.getMappedRange()));
            rb.unmap();
            const ai = adapter.info || {};
            return { ok: true, pixels: px, bytesPerRow: bpr,
                     adapter: { vendor: ai.vendor || null, architecture: ai.architecture || null } };
        }, { code, width, height, srcSize: n, src: Array.from(src),
             uniforms: uniforms ? Array.from(uniforms) : null });
        return { skipped: false, errors: [], ...out, source: src };
    } catch (e) {
        return { ok: false, skipped: false, reason: "harness error: " + String(e).slice(0, 200), pixels: null };
    } finally {
        try { await browser?.close(); } catch {}
        srv.close();
    }
}

/**
 * The same render, on WebGL2, so the two backends can be compared to each other and not merely to a model.
 *
 * *** THIS IS WHAT MAKES "WRITE IT ONCE, RUN ON EITHER" A MEASUREMENT RATHER THAN A PROMISE. *** gfx/device.js
 * has claimed portability since it was written and nothing had ever rendered the same effect both ways and
 * diffed the frames. Agreeing with a CPU model twice is weaker than that: two backends can each match a model
 * on the cases sampled and still differ from each other elsewhere.
 *
 * Rows come back BOTTOM-first from readPixels, where WebGPU's copyTextureToBuffer gives them top-first, so
 * this flips them before returning. The caller then compares two arrays in the same orientation -- which is
 * the whole reason the flip lives here, once, instead of at every call site.
 */
export async function renderGlslToPixels({ vertex, fragment, width = 64, height = 64, srcSize = 64,
                                           uniforms = null, uniformNames = [], sourceTexel = null,
                                           uniformVecs = null, textures = null }) {
    // v4286 -- `textures` is {samplerName: (x,y,n) => [r,g,b,a]}, each bound to its OWN texture unit. ADDITIVE:
    // it defaults to null and every existing caller keeps the single tDiffuse binding on unit 0. It exists
    // because render/bloomPass.js's COMPOSITE_FS takes FIVE samplers -- scene, bloom, depth, ssao, god rays --
    // and with one texture bound they all read the same image, which makes every measurement about a fiction.
    // Unresolved sampler names are RETURNED for the same reason the vector uniforms are: a sampler that never
    // got its unit reads unit 0, which is a plausible-looking wrong answer rather than an error.
    // v4284 -- `uniformVecs` is {name: [..2|3|4 numbers]}, set with uniform2f/3f/4f by array length. ADDITIVE:
    // it defaults to null and every existing caller is untouched. It exists because render/bloomPass.js's
    // BLUR_FS takes uTexel and uDir as vec2 and uEyeRect as vec4, and a uniform that is never assigned reads
    // as ZERO -- which for uEyeRect means clamping every tap to texel 0 and returning a flat image that looks
    // like a shader bug rather than a harness gap. A missing uniform must be impossible to mistake for a
    // wrong shader, so unresolved names are RETURNED rather than skipped.
    const requireFn = createRequire(import.meta.url);
    if (!fs.existsSync(HEADLESS_SHELL)) return { ok: false, skipped: true, reason: "no headless shell", pixels: null };
    const pw = resolvePlaywright(requireFn);
    if (!pw) return { ok: false, skipped: true, reason: "playwright not resolvable", pixels: null };

    const n = srcSize;
    const src = new Uint8Array(n * n * 4);
    const gen = sourceTexel || ((x, y, N) => [Math.round(x * 255 / (N - 1)), Math.round(y * 255 / (N - 1)), 0, 255]);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const px = gen(x, y, n), i = (y * n + x) * 4;
        src[i] = px[0]; src[i + 1] = px[1]; src[i + 2] = px[2]; src[i + 3] = px[3];
    }

    // Built here, like the primary source, so the arrays the caller compares are the ones uploaded.
    const texData = {};
    for (const [nm, gen2] of Object.entries(textures || {})) {
        const buf = new Uint8Array(n * n * 4);
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
            const px2 = gen2(x, y, n), i = (y * n + x) * 4;
            buf[i] = px2[0]; buf[i + 1] = px2[1]; buf[i + 2] = px2[2]; buf[i + 3] = px2[3];
        }
        texData[nm] = Array.from(buf);
    }

    let browser = null;
    try {
        browser = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const page = await browser.newPage();
        const out = await page.evaluate(async (a) => {
            const c = document.createElement("canvas"); c.width = a.width; c.height = a.height;
            const gl = c.getContext("webgl2", { preserveDrawingBuffer: true });
            if (!gl) return { ok: false, reason: "no webgl2 context" };
            const mk = (type, srcTxt) => {
                const sh = gl.createShader(type); gl.shaderSource(sh, srcTxt); gl.compileShader(sh);
                if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
                return sh;
            };
            let prog;
            try {
                prog = gl.createProgram();
                gl.attachShader(prog, mk(gl.VERTEX_SHADER, a.vertex));
                gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, a.fragment));
                gl.linkProgram(prog);
                if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { ok: false, reason: "link: " + gl.getProgramInfoLog(prog) };
            } catch (e) { return { ok: false, reason: "compile: " + String(e.message).slice(0, 300) }; }
            gl.useProgram(prog);

            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            // *** flipY OFF. *** three.js turns it ON by default and that is exactly the convention difference
            // this comparison exists to pin down; leaving it on here would silently re-flip the source.
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, a.srcSize, a.srcSize, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                          new Uint8Array(a.src));
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            gl.uniform1i(gl.getUniformLocation(prog, "tDiffuse"), 0);
            const unresolved = [];
            // Extra samplers on units 1..N. Unit 0 keeps whatever the single-texture path bound.
            let unit = 1;
            for (const [nm, data] of Object.entries(a.textures || {})) {
                const loc = gl.getUniformLocation(prog, nm);
                if (!loc) { unresolved.push(nm); unit++; continue; }
                const t = gl.createTexture();
                gl.activeTexture(gl.TEXTURE0 + unit);
                gl.bindTexture(gl.TEXTURE_2D, t);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, a.srcSize, a.srcSize, 0, gl.RGBA,
                              gl.UNSIGNED_BYTE, new Uint8Array(data));
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.uniform1i(loc, unit);
                unit++;
            }
            gl.activeTexture(gl.TEXTURE0);
            for (const [nm, v] of Object.entries(a.uniformVecs || {})) {
                const loc = gl.getUniformLocation(prog, nm);
                if (!loc) { unresolved.push(nm); continue; }
                if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
                else if (v.length === 3) gl.uniform3f(loc, v[0], v[1], v[2]);
                else if (v.length === 4) gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
                else unresolved.push(nm + " (length " + v.length + ")");
            }
            for (let i = 0; i < a.uniformNames.length; i++) {
                const loc = gl.getUniformLocation(prog, a.uniformNames[i]);
                if (!loc) unresolved.push(a.uniformNames[i]);
                if (loc) gl.uniform1f(loc, a.uniforms[i]);
            }
            const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
            gl.viewport(0, 0, a.width, a.height);
            gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            const px = new Uint8Array(a.width * a.height * 4);
            gl.readPixels(0, 0, a.width, a.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
            // v4284 -- *** A FRAME THAT DREW NOTHING CAME BACK ok:true AND ALL ZEROES, AND COST AN HOUR. ***
            // This harness binds an EMPTY vao and draws three vertices attributelessly, so a vertex shader
            // that reads `in vec2 aPos` -- which render/bloomPass.js's PASSTHROUGH_VS does, because it brings
            // its own buffer -- gets (0,0) for all three, collapses to a degenerate triangle, and rasterises
            // no pixels. The result is a black frame that is indistinguishable from a shader legitimately
            // outputting black, and every comparison against it fails for a reason nowhere near the shader.
            // The count is returned so a caller can assert a picture happened; it is NOT an error here,
            // because a uniformly black frame is a legitimate answer for some shaders.
            const seen = new Set();
            for (let i = 0; i < px.length; i += 4) seen.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
            return { ok: true, pixels: Array.from(px), renderer: gl.getParameter(gl.RENDERER), unresolved,
                     distinctColours: seen.size };
        }, { vertex, fragment, width, height, srcSize: n, src: Array.from(src),
             uniforms: uniforms ? Array.from(uniforms) : [], uniformNames,
             uniformVecs: uniformVecs || {}, textures: texData });
        if (!out.ok) return { skipped: false, ...out };
        // readPixels is bottom-first; flip to top-first so both harnesses hand back the same orientation.
        const flipped = new Uint8Array(width * height * 4);
        for (let y = 0; y < height; y++) {
            const srcRow = (height - 1 - y) * width * 4;
            flipped.set(out.pixels.slice(srcRow, srcRow + width * 4), y * width * 4);
        }
        return { skipped: false, ok: true, pixels: Array.from(flipped), bytesPerRow: width * 4,
                 renderer: out.renderer, source: src, unresolved: out.unresolved || [],
                 distinctColours: out.distinctColours };
    } catch (e) {
        return { ok: false, skipped: false, reason: "harness error: " + String(e).slice(0, 200), pixels: null };
    } finally { try { await browser?.close(); } catch {} }
}

/**
 * The THIRD renderer: the shipping three.js pass, through a real WebGLRenderer.
 *
 * *** THE FILE IS CALLED webgpuHarness AND THIS FUNCTION USES NO WebGPU, WHICH IS WORTH SAYING RATHER THAN
 * HIDING. *** It started as a way to run WGSL and became the place where a frame is produced by any of the
 * three paths this tree has for one effect: WGSL on WebGPU, GLSL on WebGL2, and a THREE.ShaderMaterial on
 * WebGL2. Renaming it would churn three importers for a tidier label; saying so costs nothing.
 *
 * The page imports three and the pass module over HTTP from the engine root, so what is rendered is the
 * SHIPPING file -- render/badTvPass.js as main.js uses it -- and not a copy adapted for testing.
 *
 * `readRenderTargetPixels` returns rows bottom-first, like readPixels, so this flips them to top-first for the
 * same reason renderGlslToPixels does: every path in this file hands back the same orientation, and a caller
 * comparing two of them is comparing pictures rather than conventions.
 */
export async function renderThreePassToPixels({ engineRoot, passModule, passFactory, width = 64, srcSize = 64,
                                                time = 0, uniforms = {}, flipY = false, sourceTexel = null }) {
    const requireFn = createRequire(import.meta.url);
    if (!fs.existsSync(HEADLESS_SHELL)) return { ok: false, skipped: true, reason: "no headless shell", pixels: null };
    const pw = resolvePlaywright(requireFn);
    if (!pw) return { ok: false, skipped: true, reason: "playwright not resolvable", pixels: null };
    const three = path.join(engineRoot, "vendor/three/three.module.js");
    if (!fs.existsSync(three)) return { ok: false, skipped: true, reason: "no vendored three at " + three, pixels: null };

    const n = srcSize;
    const src = new Uint8Array(n * n * 4);
    const gen = sourceTexel || ((x, y, N) => [Math.round(x * 255 / (N - 1)), Math.round(y * 255 / (N - 1)), 0, 255]);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const px = gen(x, y, n), i = (y * n + x) * 4;
        src[i] = px[0]; src[i + 1] = px[1]; src[i + 2] = px[2]; src[i + 3] = px[3];
    }

    const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html" };
    const srv = http.createServer((q, s) => {
        let u = decodeURIComponent(String(q.url).split("?")[0]);
        if (u === "/") { s.writeHead(200, { "Content-Type": "text/html" }); return s.end("<!doctype html><title>three</title>"); }
        const f = path.join(engineRoot, u);
        if (!f.startsWith(engineRoot) || !fs.existsSync(f)) { s.writeHead(404); return s.end("no"); }
        s.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
        s.end(fs.readFileSync(f));
    });
    await new Promise((r) => srv.listen(0, SECURE_HOST, r));

    let browser = null;
    try {
        browser = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const page = await browser.newPage();
        const pageErrors = [];
        page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
        await page.goto(`http://${SECURE_HOST}:${srv.address().port}/`);
        const out = await page.evaluate(async (a) => {
            const THREE = await import("/vendor/three/three.module.js");
            const mod = await import(a.passModule);
            const make = mod[a.passFactory];
            if (typeof make !== "function") return { ok: false, reason: `${a.passFactory} is not exported by ${a.passModule}` };
            const canvas = document.createElement("canvas"); canvas.width = a.width; canvas.height = a.width;
            const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
            renderer.setSize(a.width, a.width, false);
            const tex = new THREE.DataTexture(new Uint8Array(a.src), a.srcSize, a.srcSize, THREE.RGBAFormat);
            tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
            tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
            tex.flipY = a.flipY;
            tex.needsUpdate = true;
            const pass = make(THREE, {});
            pass.uniforms.tDiffuse.value = tex;
            if (typeof pass.setTime === "function") pass.setTime(a.time);
            for (const k of Object.keys(a.uniforms)) if (pass.uniforms[k]) pass.uniforms[k].value = a.uniforms[k];
            const rt = new THREE.WebGLRenderTarget(a.width, a.width,
                { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
            renderer.setRenderTarget(rt);
            renderer.render(pass.scene, pass.camera);
            const px = new Uint8Array(a.width * a.width * 4);
            renderer.readRenderTargetPixels(rt, 0, 0, a.width, a.width, px);
            return { ok: true, pixels: Array.from(px), revision: THREE.REVISION, flipY: tex.flipY };
        }, { passModule, passFactory, width, srcSize: n, src: Array.from(src), time, uniforms, flipY });
        if (!out.ok) return { skipped: false, ...out, pageErrors };
        const flipped = new Uint8Array(width * width * 4);
        for (let y = 0; y < width; y++) {
            const srcRow = (width - 1 - y) * width * 4;
            flipped.set(out.pixels.slice(srcRow, srcRow + width * 4), y * width * 4);
        }
        return { skipped: false, ok: true, pixels: Array.from(flipped), bytesPerRow: width * 4,
                 revision: out.revision, flipY: out.flipY, pageErrors };
    } catch (e) {
        return { ok: false, skipped: false, reason: "harness error: " + String(e).slice(0, 200), pixels: null };
    } finally { try { await browser?.close(); } catch {} srv.close(); }
}

/**
 * Run a compute shader that writes to a STORAGE TEXTURE, and read the texture back.
 *
 * *** THIS IS THE GAP BETWEEN "THE ARITHMETIC SURVIVES" AND "A RENDERER CAN USE IT". *** v4284 proved the
 * fused bloom shader reproduces the three-pass chain, but it wrote to a storage BUFFER, because that is what
 * runWgslCompute binds. A render path does not want a buffer -- it wants a texture the next pass can sample.
 * Those are different bindings, a different WGSL declaration, and a different set of ways to be wrong.
 *
 * `format` is the storage format and IT IS NOT A DETAIL: rgba8unorm clamps to [0,1], and bloom's whole job is
 * to carry values above 1. The gate measures that clipping rather than taking the format on trust.
 *
 * Returns { ok, pixels } with pixels as a Float32Array of n*n*4, decoded from whichever format was asked for.
 */
export async function runWgslComputeToTexture({ code, entryPoint = "main", n = 64, format = "rgba16float",
                                                uniforms = null, workgroups = 1, timeoutMs = 60000,
                                                inputTexel = null }) {
    // `inputTexel(x,y,n) -> [r,g,b,a]` uploads an rgba16float SAMPLED texture at binding 2. Half-float
    // because a bloom input carries values above 1, and an 8-bit input would clip the scene before the
    // shader ever saw it -- the same trap the output format has, one stage earlier.
    const enc16 = (v) => {                                    // double -> half float bits
        if (!isFinite(v)) return v > 0 ? 0x7c00 : 0xfc00;
        const s = v < 0 ? 0x8000 : 0; v = Math.abs(v);
        if (v === 0) return s;
        let e = Math.floor(Math.log2(v));
        if (e < -14) return s | Math.round(v / Math.pow(2, -24));
        if (e > 15) return s | 0x7c00;
        const m = Math.round((v / Math.pow(2, e) - 1) * 1024);
        return s | ((e + 15) << 10) | (m & 0x3ff);
    };
    let inputBits = null;
    if (inputTexel) {
        const u = new Uint16Array(n * n * 4);
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
            const p = inputTexel(x, y, n);
            for (let c = 0; c < 4; c++) u[(y * n + x) * 4 + c] = enc16(p[c]);
        }
        inputBits = Array.from(u);
    }
    const requireFn = createRequire(import.meta.url);
    const skip = webgpuSkipReason(requireFn);
    if (skip) return { ok: false, skipped: true, reason: skip, pixels: null };
    const pw = resolvePlaywright(requireFn);

    const srv = http.createServer((_q, s) => {
        s.writeHead(200, { "Content-Type": "text/html" });
        s.end("<!doctype html><title>wgsl-storage-texture</title>");
    });
    await new Promise((r) => srv.listen(0, SECURE_HOST, r));
    const url = `http://${SECURE_HOST}:${srv.address().port}/`;

    let browser = null;
    try {
        browser = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: [...LAUNCH_ARGS] });
        const page = await browser.newPage();
        page.setDefaultTimeout(timeoutMs);
        await page.goto(url);
        const out = await page.evaluate(async (a) => {
            if (!navigator.gpu) return { ok: false, reason: "navigator.gpu undefined" };
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) return { ok: false, reason: "requestAdapter() returned null" };
            const dev = await adapter.requestDevice();
            const errs = [];
            dev.pushErrorScope("validation");

            const mod = dev.createShaderModule({ code: a.code });
            const info = await mod.getCompilationInfo();
            const cErr = info.messages.filter((m) => m.type === "error")
                                      .map((m) => `${m.lineNum}:${m.linePos} ${m.message}`);
            if (cErr.length) return { ok: false, reason: "WGSL did not compile", errors: cErr };

            const tex = dev.createTexture({ size: [a.n, a.n], format: a.format,
                usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC });
            const bpp = a.format === "rgba16float" ? 8 : 4;
            const bytesPerRow = Math.ceil(a.n * bpp / 256) * 256;
            const readBuf = dev.createBuffer({ size: bytesPerRow * a.n,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

            const entries = [{ binding: 0, resource: tex.createView() }];
            if (a.inputBits) {
                const src = dev.createTexture({ size: [a.n, a.n], format: "rgba16float",
                    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
                dev.queue.writeTexture({ texture: src }, new Uint16Array(a.inputBits),
                    { bytesPerRow: a.n * 8 }, [a.n, a.n]);
                entries.push({ binding: 2, resource: src.createView() });
            }
            if (a.uniforms) {
                const ub = dev.createBuffer({ size: Math.max(16, a.uniforms.length * 4),
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                dev.queue.writeBuffer(ub, 0, new Float32Array(a.uniforms));
                entries.push({ binding: 1, resource: { buffer: ub } });
            }
            const pipe = dev.createComputePipeline({ layout: "auto",
                compute: { module: mod, entryPoint: a.entryPoint } });
            const bind = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries });
            const enc = dev.createCommandEncoder();
            const cp = enc.beginComputePass();
            cp.setPipeline(pipe); cp.setBindGroup(0, bind); cp.dispatchWorkgroups(a.workgroups); cp.end();
            enc.copyTextureToBuffer({ texture: tex }, { buffer: readBuf, bytesPerRow }, [a.n, a.n]);
            dev.queue.submit([enc.finish()]);
            const scoped = await dev.popErrorScope();
            if (scoped) errs.push(scoped.message);
            await readBuf.mapAsync(GPUMapMode.READ);
            const raw = new Uint8Array(readBuf.getMappedRange()).slice();
            readBuf.unmap();
            const ai = adapter.info || {};
            return { ok: true, raw: Array.from(raw), bytesPerRow, errors: errs,
                     adapter: { vendor: ai.vendor || null, architecture: ai.architecture || null } };
        }, { code, entryPoint, n, format, uniforms: uniforms ? Array.from(uniforms) : null, workgroups,
             inputBits });
        if (!out.ok) return { skipped: false, pixels: null, ...out };

        // Decode ROW BY ROW, because copyTextureToBuffer pads every row up to a 256-byte multiple and the
        // padding is not pixels. Reading it as a flat array would shear the image by a few texels per row --
        // a corruption that looks like a shader bug and is arithmetic in the reader.
        const raw = new Uint8Array(out.raw);
        const px = new Float32Array(n * n * 4);
        const f16 = (u) => {                                   // half float -> double
            const s = (u & 0x8000) ? -1 : 1, e = (u >> 10) & 0x1f, m = u & 0x3ff;
            if (e === 0) return s * Math.pow(2, -14) * (m / 1024);
            if (e === 31) return m ? NaN : s * Infinity;
            return s * Math.pow(2, e - 15) * (1 + m / 1024);
        };
        const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
        for (let y = 0; y < n; y++) {
            const row = y * out.bytesPerRow;
            for (let x = 0; x < n; x++) for (let c = 0; c < 4; c++) {
                const o = (y * n + x) * 4 + c;
                px[o] = format === "rgba16float" ? f16(dv.getUint16(row + (x * 4 + c) * 2, true))
                                                 : raw[row + x * 4 + c] / 255;
            }
        }
        return { skipped: false, ok: true, pixels: px, format, bytesPerRow: out.bytesPerRow,
                 errors: out.errors || [], adapter: out.adapter };
    } catch (e) {
        return { ok: false, skipped: false, reason: "harness error: " + String(e).slice(0, 200), pixels: null };
    } finally {
        try { await browser?.close(); } catch {}
        srv.close();
    }
}
