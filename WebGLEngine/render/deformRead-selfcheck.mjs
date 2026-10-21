// WebGLEngine/render/deformRead-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~2 s)
//
// Run: node render/deformRead-selfcheck.mjs
//
// THE READ SIDE OF THE DEFORMATION FIELD, HELD TO UPSTREAM'S TEXT AND TO UPSTREAM'S OWN CLAIMS:
//   1  LIFTED     the three functions of vendor/snowflow's lib/deform.wgsl appear in the kernel statement for statement (the texture fetch aside);
//   2  THE TWIN   falloff 1 inside 0.80 of the half-window, 0 beyond 0.96, 0.5 at the middle of the ramp, monotone; the filter's weights sum to 1 (a flat field of net height h reads h * scale * falloff);
//                 the sign (berm raises, depression lowers); the toroidal address wraps;
//   3  THE CLAIMS upstream's comment says the filter's first zero is at the lattice Nyquist and that a trench 8 x spacing wide passes at 85%: a sinusoid of wavelength 2 x spacing reads 0 (< 1e-6) and one of
//                 8 x spacing reads 0.8536 (the closed form) of its amplitude, on the twin;
//   4  THE KERNEL (needs the software WebGPU adapter; SKIPPED, and said, without one) the compute kernel run on Dawn over random queries on a random field equals the twin (worst difference under 1e-5).
// NOT GRADED, said plainly: drawing from the read in a vertex stage, a real GPU.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as DR from "./deformRead.mjs";
import { runWgslComputeNative, headlessGpuSkipReason, exitCleanly } from "../tools/ship/headlessGpu.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const norm = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ").trim();
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

console.log("deformRead-selfcheck -- the read side\n");
console.log("1. LIFTED");
{
    const up = norm(fs.readFileSync(path.join(ENG, "vendor/snowflow/src/shaders/lib/deform.wgsl"), "utf8")), kern = norm(DR.READ_KERNEL_WGSL);
    const stmts = [
        "fn deformUV(worldXZ: vec2f, size: f32) -> vec2f { return fract(worldXZ / size); }",
        "fn deformFalloff(worldXZ: vec2f, centre: vec2f, size: f32) -> f32 { let d = abs(worldXZ - centre) / (size * 0.5); return 1.0 - smoothstep(0.80, 0.96, max(d.x, d.y)); }",
        "let w = deformFalloff(worldXZ, centre, size); if (w <= 0.0) { return 0.0; }",
        "let base = deformUV(worldXZ, size); let r = spacing / size; // tap offset, in UV".replace(" // tap offset, in UV", ""),
        "let wt = f32((2 - abs(i)) * (2 - abs(j))) * (1.0 / 16.0); let uv = base + vec2f(f32(i), f32(j)) * r;",
        "acc += (s.g - s.r) * wt; } } return acc * scale * w; }",
    ];
    const missing = stmts.filter((s) => !(up.includes(s) && kern.includes(s)));
    ok("!! the three functions are upstream's lib/deform.wgsl statement for statement, the texture fetch aside", missing.length === 0, stmts.length + " statements in both" + (missing.length ? "; MISSING " + missing.map((m) => m.slice(0, 40)).join(" | ") : ""));
}

console.log("\n2. THE TWIN");
{
    const c = [0, 0], size = 8;
    const f = (frac) => DR.deformFalloff(frac * size / 2, 0, c, size);
    ok("!! the falloff is 1 up to 0.80 of the half-window, 0 from 0.96, 0.5 at the middle of the ramp (0.88), and monotone down between", f(0) === 1 && f(0.8) === 1 && f(0.96) === 0 && f(1.2) === 0 && Math.abs(f(0.88) - 0.5) < 1e-12 && f(0.84) > f(0.88) && f(0.88) > f(0.92), [f(0.8), f(0.88), f(0.96)].map((v) => v.toFixed(3)).join(", "));
    ok("  it uses the Chebyshev distance (the window is square): a corner at 0.9 in both axes falls like a point at 0.9 on one axis", Math.abs(DR.deformFalloff(0.9 * 4, 0.9 * 4, c, size) - DR.deformFalloff(0.9 * 4, 0, c, size)) < 1e-12);
    const res = 32, flat = new Float32Array(res * res * 4); for (let i = 0; i < flat.length; i += 4) { flat[i] = 0.1; flat[i + 1] = 0.35; }
    ok("!! the filter's weights sum to 1: a flat field of berm 0.35 and depression 0.1 reads (0.35 - 0.1) * scale * falloff wherever it is read", Math.abs(DR.deformHeight(flat, res, 1.3, -0.7, c, size, 2, 0.4) - 0.25 * 2) < 1e-6 && Math.abs(DR.deformHeight(flat, res, 3.52, 0, c, size, 1, 0.4) - 0.25 * DR.deformFalloff(3.52, 0, c, size)) < 1e-6);
    ok("  berm raises and depression lowers: net height is berm minus depression; outside the falloff it is exactly 0", DR.deformHeight(flat, res, 1, 1, c, size, 1, 0.1) > 0 && DR.deformHeight(flat, res, 4, 0, c, size, 1, 0.1) === 0);
    const u = DR.deformUV(-1.5, 9.25, 8);
    ok("  the toroidal address wraps: a position and the same position a window away read the same", Math.abs(u[0] - 0.8125) < 1e-12 && Math.abs(u[1] - 0.15625) < 1e-12 && Math.abs(DR.deformHeight(flat, res, 1.3, -0.7, c, 8, 1, 0.4) - DR.deformHeight(flat, res, 1.3 + 8, -0.7 - 8, [8, -8], 8, 1, 0.4)) < 1e-9);
}

console.log("\n3. UPSTREAM'S CLAIMS");
{
    const res = 64, size = 8, texel = size / res, c = [0, 0];
    const wave = (lambdaTexels) => { const s = new Float32Array(res * res * 4); for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) s[(y * res + x) * 4 + 1] = Math.sin(2 * Math.PI * x / lambdaTexels); return s; };
    const amp = (state, spacingTexels) => { let m = 0; for (let k = 0; k < 64; k++) { const x = (k / 64 - 0.5) * 2; m = Math.max(m, Math.abs(DR.deformHeight(state, res, x, 0.3, c, size, 1, spacingTexels * texel))); } return m; };
    const spacingT = 4;
    const nyq = amp(wave(2 * spacingT), spacingT), trench = amp(wave(8 * spacingT), spacingT), unfiltered = amp(wave(8 * spacingT), 1e-9);
    ok("!! upstream: 'the filter's first zero sits exactly at the lattice Nyquist' -- a wave of 2 x spacing reads " + nyq.toExponential(1) + " of an amplitude of 1", nyq < 1e-6);
    ok("!! upstream: 'a broad trench at 8 x spacing still passes at 85%' -- a wave of 8 x spacing reads " + (trench / unfiltered).toFixed(4) + " of what it reads unfiltered (the closed form is " + ((2 + 2 * Math.cos(Math.PI / 4)) / 4).toFixed(4) + ")", Math.abs(trench / unfiltered - (2 + 2 * Math.cos(Math.PI / 4)) / 4) < 2e-3);
    report(DR.reportLines().join(" | "));
}

console.log("\n4. THE KERNEL");
{
    const skip = headlessGpuSkipReason(require_);
    if (skip) { report("kernel half SKIPPED -- " + skip); report("*** THAT IS A SKIP AND NOT A PASS: sections 1-3 never run the WGSL"); }
    else {
        const res = 64, size = 8, r = rng(17), state = new Float32Array(res * res * 4); for (let i = 0; i < state.length; i += 4) { state[i] = r() * 0.4; state[i + 1] = r() * 0.3; }
        const N = 200, q = new Float32Array(N * 4), centre = [0.25, -0.5]; for (let i = 0; i < N; i++) { q[i * 4] = centre[0] + (r() - 0.5) * 8.4; q[i * 4 + 1] = centre[1] + (r() - 0.5) * 8.4; q[i * 4 + 2] = 0.5 + r() * 2; q[i * 4 + 3] = 0.05 + r() * 0.6; }
        const twin = Array.from({ length: N }, (_, i) => DR.deformHeight(state, res, q[i * 4], q[i * 4 + 1], centre, size, q[i * 4 + 2], q[i * 4 + 3]));
        const g = await runWgslComputeNative({ code: DR.READ_KERNEL_WGSL, outCount: N, uniforms: [centre[0], centre[1], size, res], inputs: [{ binding: 2, data: state }, { binding: 3, data: q }], workgroups: Math.ceil(N / 64), requireFn: require_ });
        if (!g.ok) ok("!! the read kernel runs", false, (g.reason || "") + " " + (g.errors || []).join(" | "));
        else {
            let worst = 0, nz = 0; for (let i = 0; i < N; i++) { worst = Math.max(worst, Math.abs(g.values[i] - twin[i])); if (twin[i] !== 0) nz++; }
            ok("!! the compute kernel equals the twin over 200 random queries on a random field (worst difference under 1e-5; " + nz + " of 200 nonzero, the rest outside the falloff)", worst < 1e-5 && nz > 100 && !g.wroteNothing, "worst " + worst.toExponential(2) + ", adapter " + ((g.adapter && g.adapter.description) || "?"));
        }
    }
}

console.log(`\ndeformRead-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
exitCleanly(fails === 0 ? 0 : 1);
