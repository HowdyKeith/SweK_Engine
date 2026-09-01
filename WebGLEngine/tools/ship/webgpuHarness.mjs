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
