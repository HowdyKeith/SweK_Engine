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
// ---- *** THE COUNT: 118 MODULES SHIP GLSL, 38 SHIP WGSL, AND FIVE SHIP BOTH. *** ------------------------------
//
// And of those five, three are pages rather than shader modules -- gfx-device.html and nebula-device.html, which
// are gfx/device.js's ONLY two consumers, plus wormhole-jump.html. Two actual shader modules carry both
// languages: fx/nebula/nebulaShaders.js and fx/wormhole/wormholeNebula.js.
//
// So the abstraction whose entire premise is "write it once, run on either" is satisfied by two shader modules
// out of a hundred and eighteen. That is not a criticism of the abstraction, which works: it is the measurement
// nobody had taken, and it is the difference between "the tree is WebGPU-capable" and "the tree can move a
// given render to WebGPU". The first is true. The second is true 5 times out of 118.
//
// ---- WHAT THIS MEANS FOR A SPECIFIC ROUND --------------------------------------------------------------------
//
// The orrery is the case that prompted this. ui/orreryDraw.js is canvas 2D -- getContext("2d"), 28 drawing
// calls, four of them fillText -- so it has NO shader stage at all and no effect in this tree can touch it. The
// route off 2D is gfx/device.js, and its labels would need text/slug*.js, the tree's own GPU glyph renderer.
//
// *** text/slugShader.js IS GLSL-ONLY: 337 lines, zero WGSL. *** It is one of the 113. So a orrery ported to
// gfx/device.js draws on the WebGL2 backend and, on the WebGPU backend, gets as far as createShaderModule({
// code: undefined }) -- because gfx/device.js reads d.shaders.wgsl unconditionally and does not check. Labels
// would not degrade; the pipeline would throw.
//
// That is the actual blocker, it is one file, and it is now a number instead of a hunch.
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
    const g = t.includes(GLSL_MARK), w = WGSL_MARKS.some((m) => t.includes(m));
    return g && w ? LANG.BOTH : g ? LANG.GLSL : w ? LANG.WGSL : LANG.NONE;
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
    glslBearing: 118,
    wgslBearing: 38,
    both: 5,
    glslOnly: 113,
    wgslOnly: 33,
    // Of `both`, the ones that are shader modules rather than pages. This is the number that matters for reach:
    // a page carrying both languages carries its own two shaders, and lends nothing to anybody else.
    bothShaderModules: Object.freeze(["fx/nebula/nebulaShaders.js", "fx/wormhole/wormholeNebula.js"]),
    bothPages: Object.freeze(["gfx-device.html", "nebula-device.html", "wormhole-jump.html"]),
    wgslRawVsCode: Object.freeze({ raw: 39, code: 38 }),
});

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
