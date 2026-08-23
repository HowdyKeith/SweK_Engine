// tools/roundhouse/magmapTaichi.mjs
//
// v3941 -- THE SAME MAP, PROPOSED BY A COMPILER INSTEAD OF BY HAND.
//
// Keith asked what taichi.js would buy us if it replaced the hand-written GPU layer. The magmap is the right
// place to ask, and the only place in this tree where the question can be ANSWERED rather than argued: the map
// already has an answer key (sqrt(1 + 4/rho^2)), a portable f64 reference, a measured f32 error floor
// (F32_FLOOR = 4.385e-6), and an adjudication seam that takes a proposal from anywhere and grades it.
//
// *** SO THIS FILE ADDS A PROPOSER, NOT A REPLACEMENT. *** magmapGpu.mjs is untouched. The taichi kernel is a
// second source of the same 441 numbers, and every existing rule still applies to it unchanged:
//   - adjudicate() compares a sample against the CPU f64 reference at MAGMAP_TOL
//   - gradedPeak() recomputes the peak on the CPU and NEVER accepts a GPU-sourced one
//   - markGpu() tags the output, so the v2899 provenance guard sees it
//
// WHY IT IS NOT A `VARIANTS` ENTRY. magmapVariants.mjs is explicit that its variants are BIT-IDENTICAL BY
// CONSTRUCTION -- they change workgroup width and where the trig tables live, and nothing else, because "a
// speedup that changes a bit is not a speedup, it is a new answer key". A taichi kernel is a DIFFERENT CODEGEN.
// Its agreement with the hand-written kernel is a MEASUREMENT, not a construction, and putting it in a list
// whose contract is bit-identity would quietly launder an assumption into a guarantee. It gets its own lane and
// its agreement is reported as a number.
//
// ---- THE OPERATION DISCIPLINE, CARRIED OVER DELIBERATELY -------------------------------------------------------
//
// magmapGpu's WGSL says: "SPECIFIED OPERATIONS ONLY: + - * / sqrt. No sin, no cos, no pow, no inverseSqrt --
// the sampling table arrives precomputed from the CPU's strictTrig, because WGSL pins the rounding of none of
// the transcendentals."
//
// Read against taichi's own codegen (src/language/codegen/WgslCodegen.ts), taichi CAN honour that rule but does
// not enforce it: ti.sqrt -> sqrt(), ti.rsqrt -> inverseSqrt(), and 1.0/sqrt(x) is NOT silently lowered into
// inverseSqrt. So the discipline remains the author's job here exactly as it is in the hand-written kernel, and
// this file keeps it: + - * / and ti.sqrt, nothing else. The trig tables still arrive precomputed.
//
// magmapTaichi-selfcheck.mjs asserts that statically, over this file's own source, so a later edit that reaches
// for ti.sin or ti.rsqrt fails rather than silently moving the error floor the tolerance was earned against.
//
// ---- WHAT THIS FILE CANNOT DO, SAID OUT LOUD ------------------------------------------------------------------
//
// *** IT CANNOT RUN ANYWHERE THIS TREE'S GATES RUN. *** taichi's WgslCodegen imports Runtime, and Runtime
// requires navigator.gpu before anything compiles, so there is no headless path that even EMITS the generated
// WGSL, let alone runs it. The desktop that writes this code has no WebGPU (checked: navigator.gpu is absent in
// headless Chromium here under every documented enabling flag).
//
// That is the same split magmapVariants already lives with -- "the phone times the variants; the desktop
// adjudicates" -- and it is handled the same way: this module REFUSES rather than emulating. There is
// deliberately no magmapTaichiEmulated(). magmapGpu.mjs has an emulator because it is reproducing arithmetic
// this tree wrote and can therefore model; NOBODY HERE KNOWS WHAT WGSL TAICHI WILL EMIT, so an "emulator" for
// it would be a guess wearing a measurement's clothes -- precisely the thing magmapGpu's own header warns
// about ("a test that passes because the experiment did not run").
"use strict";

import { markGpu } from "./gpuProvenance.mjs";
import { sampleTable } from "./magmapKernel.mjs";

/** Where the vendored bundle lives, as a browser-resolvable path. One declaration, read by page and gate. */
export const TAICHI_URL = "/vendor/taichi-js/taichi.js";

/**
 * The magmap kernel as a taichi kernel body.
 *
 * *** THIS IS A STRING ON PURPOSE, AND THE REASON IS TAICHI'S COMPILATION MODEL. *** taichi compiles by calling
 * .toString() on the function you hand it and re-parsing that TEXT with the TypeScript compiler at runtime
 * (KernelFactory.kernel -> ParsedFunction.makeFromCode). The kernel body is therefore SOURCE, not a closure: it
 * cannot capture variables from this module, and anything that rewrites it on the way to the browser changes
 * what taichi compiles. Keeping it as an explicit string makes both facts visible instead of surprising, and
 * lets the selfcheck read the exact text the compiler will see.
 *
 * Every operation here is + - * / or ti.sqrt. The cos/sin tables arrive precomputed as fields.
 */
export const KERNEL_SRC = `() => {
    for (let k of ti.range(params.total)) {
        let n    = params.n;
        let step = (2.0 * params.span) / (n - 1.0);
        let ux0  = -params.span + (k % n) * step;
        let uy0  = -params.span + ti.i32(k / n) * step;
        let u0   = ti.sqrt(ux0 * ux0 + uy0 * uy0);

        let acc  = 0.0;
        let wsum = 0.0;
        for (let i of ti.range(params.nR)) {
            let rr = params.rho * (i + 0.5) / params.nR;
            for (let j of ti.range(params.nT)) {
                let ux = u0 + rr * cosT[j];
                let uy = rr * sinT[j];
                let u  = ti.sqrt(ux * ux + uy * uy);
                if (u >= 1e-12) {
                    // muPoint(u), inlined: both images of a point source, closed form.
                    let d  = ti.sqrt(u * u + 4.0);
                    let ta = (u + d) * 0.5;
                    let tb = (u - d) * 0.5;
                    // magAt(t) = |t^3 / ((t - 1/t) * (t^2 + 1))|
                    let a2 = ta * ta;
                    let b2 = tb * tb;
                    let ma = ti.abs((a2 * ta) / ((ta - 1.0 / ta) * (a2 + 1.0)));
                    let mb = ti.abs((b2 * tb) / ((tb - 1.0 / tb) * (b2 + 1.0)));
                    acc  = acc + (ma + mb) * rr;
                    wsum = wsum + rr;
                }
            }
        }
        if (wsum > 0.0) { out[k] = acc / wsum; }
        else            { out[k] = 0.0; }
    }
}`;

/**
 * THE OPERATIONS THIS KERNEL IS ALLOWED TO NAME. Read by the selfcheck against KERNEL_SRC.
 * ti.abs and ti.i32 are here because they are exact -- a sign mask and a truncation, neither of which rounds.
 */
export const ALLOWED_TI_OPS = ["ti.range", "ti.sqrt", "ti.abs", "ti.i32"];
/** ...and the ones that would move the error floor the tolerance was earned against. */
export const FORBIDDEN_TI_OPS = ["ti.rsqrt", "ti.sin", "ti.cos", "ti.tan", "ti.pow", "ti.exp", "ti.log", "ti.inverseSqrt"];

/**
 * Propose the map using taichi.js. BROWSER + WebGPU ONLY -- it refuses everywhere else rather than pretending.
 *
 * @param {object} ti  the taichi.js module, already imported by the caller. Passed IN rather than imported here
 *                     so this module stays loadable (and greppable, and gateable) on a machine with no WebGPU --
 *                     importing a 3.5 MB bundle that calls navigator.gpu at init is not something a node gate
 *                     should do as a side effect of reading this file.
 * @returns {Promise<Float32Array>} GPU-tagged, so the provenance guard sees it exactly like magmapGpu's output.
 */
export async function magmapTaichi(ti, { n = 21, span = 1.0, rho = 0.1, nR = 48, nT = 48 } = {}) {
    if (!ti) throw new Error("magmapTaichi: pass the taichi.js module in -- this file does not import it");
    if (typeof navigator === "undefined" || !navigator.gpu) {
        throw new Error("magmapTaichi: no WebGPU. This proposer is rig-only and REFUSES to emulate -- nobody " +
                        "here knows what WGSL taichi emits, so an emulator would be a guess, not a measurement.");
    }
    const total = n * n;
    const table = sampleTable(nT);

    await ti.init();

    const cosT = ti.field(ti.f32, nT);
    const sinT = ti.field(ti.f32, nT);
    const out  = ti.field(ti.f32, total);
    await cosT.fromArray(Array.from(table.cos));
    await sinT.fromArray(Array.from(table.sin));

    const params = { total, n, nR, nT, span, rho };

    // eslint-disable-next-line no-new-func -- taichi's own model: the kernel body is SOURCE it re-parses.
    const body = new Function("ti", "params", "cosT", "sinT", "out", `return (${KERNEL_SRC});`)(ti, params, cosT, sinT, out);
    const k = ti.kernel(body);

    const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
    k();
    const cells = Float32Array.from(await out.toArray());
    const ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;

    const tagged = markGpu(cells, { kernel: "magmap.taichi", adapter: "taichi.js/webgpu" });
    // the timing rides along without becoming part of the tagged array's identity
    Object.defineProperty(tagged, "__taichiMs", { value: ms, enumerable: false });
    return tagged;
}
