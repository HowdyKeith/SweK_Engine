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
    ];
}

/** Shaders the tree runs that this corpus cannot, each with the reason it cannot rather than a shrug. */
export const EXCLUDED = Object.freeze([
    Object.freeze({ id: "bloomFused.fusedWgslToTexture", kind: "no harness path",
                    why: "writes a storage texture; headlessGpu.mjs has no texture path, so there is nothing to compare",
                    keeps: "tools/ship/bloomFusedTexture-selfcheck.mjs stays on the browser harness" }),
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
export async function compare(entry, runBrowser, runNative) {
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
