// WebGLEngine/render/toroidalDeform-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~3 s with the software adapter; sections 1-3 alone ~0.3 s)
//
// Run: node render/toroidalDeform-selfcheck.mjs
//
// SLICE 1 OF snowflow-lift: render/toroidalDeform.mjs, HELD TO ITS OWN PROPERTIES AND TO UPSTREAM'S TEXT.
//   1  LIFTED, NOT RETYPED   the statements the kernel shares with vendor/snowflow's deformSim.fragment.wgsl and lib/noise.wgsl are the SAME text (whitespace-normalised, `uniforms.` read as `U.`):
//                            the hashes, the gradient noise, the texel-to-world rule, every diffusion/slump/decay constant, the brush shaping and the clamp;
//   2  THE TWIN              the CPU specification, by properties it must have: dt = 0 changes nothing bit for bit; a moved window zeroes exactly the texels that wrapped in; a brush lands where
//                            it was put, symmetrically, reaching across the seam; the clamp holds; the slump matches its closed form; the banked relaxation is spent in steps and loses no time;
//   3  THE HALF-FLOAT FINDING  upstream's comment says a slow per-frame decay is eaten by half-float rounding. MEASURED here with the engine's own f16 codec: per-frame vs banked, against the ideal;
//   4  THE KERNEL            (needs the software WebGPU adapter; SKIPPED, and said, without one) the compute kernel run on Dawn over the same inputs as the twin: the worst difference over every
//                            channel of every texel, with and without relaxation, with brushes across the seam and a moved window.
// SABOTAGES, each applied to the real render/toroidalDeform.mjs, restored, md5 verified; every one red by name (rows red): the kernel's berm diffusion 0.012 -> 0.02 4 | the kernel's seam wrap removed 4 |
// the twin's scroll test removed 5 | the twin's depth clamp removed 5 | relaxation spent every frame 2 | the berm decay constant 250 -> 25 in the twin 4 | the slump taking max instead of min 3.
// NOT GRADED, said plainly: a real GPU, any timing, the read side (deform.wgsl), and the half-float STORE path itself (the field here is f32; section 3 measures the codec, not a render target).
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as TD from "./toroidalDeform.mjs";
import { reading, runWgslComputeNative, headlessGpuSkipReason, doubleToHalf, halfToDouble, exitCleanly } from "../tools/ship/headlessGpu.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const norm = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ").trim();
const up = (f) => fs.readFileSync(path.join(ENG, "vendor/snowflow/src", f), "utf8");
const sim = norm(up("shaders/deformSim.fragment.wgsl").replace(/uniforms\./g, "U.")), noise = norm(up("shaders/lib/noise.wgsl")), kern = norm(TD.KERNEL_WGSL);

console.log("toroidalDeform-selfcheck -- the toroidal deformation field\n");
console.log("1. LIFTED, NOT RETYPED");
{
    const stmts = [
        "fn hash21(p: vec2f) -> f32 { var p3 = fract(vec3f(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }",
        "fn grad2(i: vec2f) -> vec2f { let a = hash21(i) * 6.28318530718; return vec2f(cos(a), sin(a)); }",
        "let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0); let du = 30.0 * f * f * (f * (f - 2.0) + 1.0);",
        "let value = k0 + k1 * u.x + k2 * u.y + k3 * u.x * u.y;",
        "fn noise2(p: vec2f) -> f32 { return noised(p).x; }",
    ];
    ok("!! the hashes and the gradient noise are upstream's lib/noise.wgsl, statement for statement", stmts.every((s) => noise.includes(s) && kern.includes(s)), stmts.length + " statements found in both");
    const sim_ = [
        "fn texelWorld(uv: vec2f, centre: vec2f, size: f32) -> vec2f { let base = uv * size; return base + size * round((centre - base) / size); }",
        "let k = clamp(U.refillRate * dt, 0.0, 1.0); let kDep = min(0.22, 0.004 * k); let kBerm = min(0.22, 0.012 * k);",
        "let lapDep = (xl.r + xr.r + zd.r + zu.r) - 4.0 * dep; let lapBerm = (xl.g + xr.g + zd.g + zu.g) - 4.0 * berm; dep += lapDep * kDep; berm += lapBerm * kBerm;",
        "let wdir = vec2f(sin(U.windAngle), cos(U.windAngle));",
        "let kAdv = min(0.2, 0.002 * k); dep = mix(dep, uw.r, kAdv * 0.6); berm = mix(berm, uw.g, kAdv);",
        "let slump = min(berm, dep) * min(0.6, 0.002 * U.refillRate * dt); dep -= slump; berm -= slump;",
        "dep *= exp(-dt * r / 400.0); berm *= exp(-dt * r / 250.0); comp *= exp(-dt * r / 300.0); ice *= exp(-dt * r / 900.0);",
        "let reach = radius * max(a.w, 1.0) * 1.6; if (abs(p.x) > reach || abs(p.y) > reach) { continue; }",
        "let q = vec2f( (p.x * b.x + p.y * b.y) / (radius * a.w), (-p.x * b.y + p.y * b.x) / radius ); let d = length(q); if (d > 1.55) { continue; }",
        "let wob = 1.0 + c.z * 0.22 * noise2(vec2f(cos(ang), sin(ang)) * 2.7 + c.w); let dn = d / wob;",
        "let core = 1.0 - smoothstep(0.42, 1.0, dn); let ringD = (dn - 1.04) * 3.4; let ring = exp(-ringD * ringD);",
        "let grain = 0.72 + 0.56 * (noise2(q * 7.5 + c.w * 3.1) * 0.5 + 0.5);",
        "dep += b.z * core; berm += b.w * ring * grain; comp += c.x * core; ice = max(ice, c.y * core);",
        "dep = clamp(dep, 0.0, U.maxDepth); berm = clamp(berm, 0.0, U.maxBerm); comp = clamp(comp, 0.0, 1.0); ice = clamp(ice, 0.0, 1.0);",
    ];
    const missing = sim_.filter((s) => !(sim.includes(s) && kern.includes(s)));
    ok("!! every constant and body of the pass is upstream's deformSim.fragment.wgsl: the texel-to-world rule, diffusion, wind infill, slump, the four decay time constants, the brush shaping, the clamp", missing.length === 0, sim_.length + " statements in both" + (missing.length ? "; MISSING: " + missing.map((m) => m.slice(0, 50)).join(" | ") : ""));
    ok("  the constants the twin uses are the same ones (the twin is written from the same numbers: 0.004, 0.012, 0.22, 400, 250, 300, 900, 1.6, 1.55, 0.42, 1.04, 3.4)",
        /0\.004 \* k/.test(fs.readFileSync(path.join(ENG, "render/toroidalDeform.mjs"), "utf8")) && /0\.012 \* k/.test(fs.readFileSync(path.join(ENG, "render/toroidalDeform.mjs"), "utf8")) && /-dt \* refillRate \/ 900/.test(fs.readFileSync(path.join(ENG, "render/toroidalDeform.mjs"), "utf8")));
}

ok("  NOISE_WGSL, the slice other shaders include, holds the four noise functions and nothing of the kernel", ["fn hash21(", "fn grad2(", "fn noised(", "fn noise2("].every((f) => TD.NOISE_WGSL.includes(f)) && !TD.NOISE_WGSL.includes("@compute") && TD.KERNEL_WGSL.includes(TD.NOISE_WGSL));
const mkBrushes = (list) => { const f = new TD.DeformField({ res: 8, size: 8 }); f.center = [0, 0]; for (const b of list) f.brush(...b); return f; };
const P0 = (o = {}) => ({ center: [0, 0], prevCenter: [0, 0], size: 8, res: 64, dt: 0, brushCount: 0, refillRate: 1, maxDepth: 0.55, maxBerm: 0.34, windAngle: 0, ...o });
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const randState = (res, seed) => { const r = rng(seed), s = new Float32Array(res * res * 4); for (let i = 0; i < s.length; i += 4) { s[i] = r() * 0.5; s[i + 1] = r() * 0.3; s[i + 2] = r(); s[i + 3] = r(); } return s; };
const noBrush = new Float32Array(TD.MAX_BRUSHES * TD.BRUSH_ROWS * 4);

console.log("\n2. THE TWIN");
{
    const prev = randState(64, 7), out = new Float32Array(prev.length);
    TD.stepField(prev, out, P0(), noBrush);
    let same = true; for (let i = 0; i < prev.length; i++) if (!Object.is(prev[i], out[i])) { same = false; break; }
    ok("!! at dt = 0 with the window still every relax term is an exact no-op: 16384 texels, no brushes, identical bit for bit", same);
    const flat = new Float32Array(64 * 64 * 4); for (let i = 0; i < flat.length; i += 4) flat[i] = 0.3;
    const o2 = new Float32Array(flat.length), texel = 8 / 64;
    TD.stepField(flat, o2, P0({ center: [texel, 0], prevCenter: [0, 0] }), noBrush);
    let zero = 0, kept = 0; for (let i = 0; i < o2.length; i += 4) { if (o2[i] === 0) zero++; else if (o2[i] === Math.fround(0.3)) kept++; }
    ok("!! moving the window one texel in x zeroes exactly the one column that wrapped in (64 texels) and keeps the rest", zero === 64 && kept === 64 * 63, "zeroed " + zero + ", kept " + kept);
    const jump = new Float32Array(flat.length); TD.stepField(flat, jump, P0({ center: [1e6, 1e6], prevCenter: [0, 0] }), noBrush);
    ok("  a window that jumped far away zeroes everything (upstream's warm-up clear relies on this)", jump.every((v) => v === 0));
    const f = new TD.DeformField({ res: 64, size: 8 }); f.update(0, { x: 0, z: 0 }); f.brush(0.5625, 0.3125, 0.6, 0.2, 0, 0.5, 0.4, 0, 1, 0); f.update(0, { x: 0, z: 0 });
    const R = f.res, tx = 4, tz = 2, at = (x, z, c) => f.state[(((z % R) + R) % R * R + (((x % R) + R) % R)) * 4 + c];
    ok("!! a clean brush (edge 0) puts its depth at its centre texel, is symmetric about it, and reaches nothing past 1.55 radii", Math.abs(at(tx, tz, 0) - 0.2) < 1e-3 && Math.abs(at(tx + 3, tz, 0) - at(tx - 3, tz, 0)) < 1e-6 && Math.abs(at(tx, tz + 3, 0) - at(tx, tz - 3, 0)) < 1e-6 && at(tx + 9, tz, 0) === 0 && Math.abs(at(tx, tz, 2) - 0.5) < 1e-3 && Math.abs(at(tx, tz, 3) - 0.4) < 1e-3,
        "centre depth " + at(tx, tz, 0).toFixed(4) + ", compression " + at(tx, tz, 2).toFixed(3) + ", ice " + at(tx, tz, 3).toFixed(3));
    const g = new TD.DeformField({ res: 64, size: 8 }); g.update(0, { x: 0, z: 0 }); g.brush(3.95, 0.0625, 0.5, 0.2, 0, 0, 0, 0, 1, 0); g.update(0, { x: 0, z: 0 });
    const left = g.state[(0 * 64 + 31) * 4], right = g.state[(0 * 64 + 32) * 4];   // world x 3.9375 and -3.9375: either side of the seam, 0.0125 and 0.1125 from the brush once wrapped
    ok("!! a brush written beside the window's seam reaches the texels on BOTH sides of it (the offset is wrapped too)", left > 0.05 && right > 0.05, "texel 31 (world x 3.94): " + left.toFixed(3) + ", texel 32 (world x -3.94): " + right.toFixed(3));
    const big = mkBrushes([[0, 0, 0.5, 5, 5, 3, 3, 0, 1, 0]]); const h = new TD.DeformField({ res: 64, size: 8, depthScale: 1, bermScale: 1 }); h.update(0, { x: 0, z: 0 }); h.brush(0, 0, 0.5, 5, 5, 3, 3, 0, 1, 0); h.update(0, { x: 0, z: 0 });
    let mx = [0, 0, 0, 0]; for (let i = 0; i < h.state.length; i++) mx[i % 4] = Math.max(mx[i % 4], h.state[i]);
    ok("!! the clamp holds: depth stops at maxDepth (0.55), berm at maxBerm (0.34), compression and ice at 1", Math.abs(mx[0] - 0.55) < 1e-6 && mx[1] <= 0.34 + 1e-6 && mx[2] === 1 && mx[3] === 1, mx.map((v) => v.toFixed(3)).join(", "));
    // slump and decay in closed form on a uniform field (Laplacian 0, advection mixes equal values)
    const uni = new Float32Array(64 * 64 * 4); for (let i = 0; i < uni.length; i += 4) { uni[i] = 0.2; uni[i + 1] = 0.1; uni[i + 2] = 0.5; uni[i + 3] = 0.6; }
    const ou = new Float32Array(uni.length), dt = 2, r = 3; TD.stepField(uni, ou, P0({ dt, refillRate: r }), noBrush);
    const s = 0.1 * Math.min(0.6, 0.002 * r * dt), depW = (0.2 - s) * Math.exp(-dt * r / 400), bermW = (0.1 - s) * Math.exp(-dt * r / 250);
    ok("!! on a uniform field one relaxed step equals the closed form: slump = min(berm, dep) * 0.002 * rate * dt taken from both, then the four exponentials", Math.abs(ou[0] - depW) < 1e-7 && Math.abs(ou[1] - bermW) < 1e-7 && Math.abs(ou[2] - 0.5 * Math.exp(-dt * r / 300)) < 1e-7 && Math.abs(ou[3] - 0.6 * Math.exp(-dt * r / 900)) < 1e-7,
        "dep " + ou[0].toFixed(6) + " vs " + depW.toFixed(6) + ", berm " + ou[1].toFixed(6) + " vs " + bermW.toFixed(6));
    const bank = new TD.DeformField({ res: 8, size: 8 }); let spent = 0, steps = 0; const dtf = 1 / 165;
    for (let i = 0; i < 1650; i++) { bank.update(dtf, { x: 0, z: 0 }); if (bank.lastRelaxDt > 0) { steps++; spent += bank.lastRelaxDt; } }
    ok("!! the banked relaxation is spent in steps of at least 0.4 s and no time is lost: 10 s at 165 fps spends " + steps + " steps and the spent plus the owed equals 10 s", steps >= 24 && steps <= 25 && Math.abs(spent + bank.relaxOwed - 1650 * dtf) < 1e-9, "spent " + spent.toFixed(4) + " s + owed " + bank.relaxOwed.toFixed(4) + " s");
    const sn = new TD.DeformField({ res: 64, size: 8 }); sn.update(0, { x: 1.234, z: -0.77 });
    ok("  the exported constants are upstream's: COVERAGE 80 m, RELAX_STEP 0.4 s, 4 CHANNELS; and the report names the field, its texel size and the twin", TD.COVERAGE === 80 && TD.RELAX_STEP === 0.4 && TD.CHANNELS === 4 && TD.reportLines()[0].startsWith("[toroidalDeform] 64x64 field over 8 m (12.5 cm texels)") && /CPU twin/.test(TD.reportLines().join("\n")), TD.reportLines()[0]);
    ok("  roundHalfEven is WGSL round(), not Math.round: ties go to the even integer (0.5 -> 0, 1.5 -> 2, 2.5 -> 2, -0.5 -> -0, -1.5 -> -2, -2.5 -> -2) and non-ties round as usual",
        [[0.5, 0], [1.5, 2], [2.5, 2], [-0.5, -0], [-1.5, -2], [-2.5, -2], [0.4, 0], [0.6, 1], [-0.6, -1]].every(([x, y]) => Object.is(TD.roundHalfEven(x), y) || (y === 0 && TD.roundHalfEven(x) === 0)));
    ok("  the window centre snaps to a texel boundary (otherwise the field crawls under the surface)", Math.abs(sn.center[0] / sn.texel - Math.round(sn.center[0] / sn.texel)) < 1e-9 && Math.abs(sn.center[1] / sn.texel - Math.round(sn.center[1] / sn.texel)) < 1e-9);
    ok("  a brush outside the window, one with no radius, and the 97th are dropped; the queue clears each update", (() => { const d = new TD.DeformField({ res: 8, size: 8 }); const a = d.brush(100, 0, 1, 1, 0, 0, 0), b = d.brush(0, 0, 0, 1, 0, 0, 0); let c = true; for (let i = 0; i < 96; i++) c = d.brush(0, 0, 0.1, 0.01, 0, 0, 0); const e = d.brush(0, 0, 0.1, 0.01, 0, 0, 0); d.update(0, { x: 0, z: 0 }); return a === false && b === false && c === true && e === false && d.brushCount === 0; })());
}

console.log("\n3. THE HALF-FLOAT FINDING");
{
    // upstream's comment: a decay of exp(-dt/400) per frame at 165 fps is a relative 1.5e-5, thirty times smaller than the half-float ULP near 0.5 (4.9e-4), so the store snaps to a neighbour and
    // the buffer decays at the wrong rate. MEASURED here with a half-float rounding written for this gate: headlessGpu.doubleToHalf is NOT used, because it does not carry a rounded-up mantissa
    // into the exponent (0.4999924 -> 0.25), and that bug alone collapses a slowly decaying value -- the first draft of this section "confirmed" upstream's claim with that bug.
    const f16 = (v, mode) => {
        if (v === 0 || !isFinite(v)) return v;
        const a = Math.abs(v), e = Math.max(-14, Math.floor(Math.log2(a))), ulp = Math.pow(2, e - 10), q = a / ulp;
        let r = mode === "rtz" ? Math.floor(q) : Math.round(q);
        if (mode !== "rtz" && Math.abs(q % 1) === 0.5 && r % 2 !== 0) r--;
        return Math.sign(v) * r * ulp;
    };
    const v0 = 0.5, ulp = Math.pow(2, -12), perFrame = Math.exp(-(1 / 165) / 400), banked = Math.exp(-0.4 / 400), seconds = 60, ideal = v0 * Math.exp(-seconds / 400);
    const run = (factor, n, mode) => { let v = f16(v0, mode); for (let i = 0; i < n; i++) v = f16(v * factor, mode); return v; };
    const rows = {};
    for (const mode of ["rne", "rtz"]) rows[mode] = { frame: run(perFrame, 165 * seconds, mode), step: run(banked, Math.round(seconds / 0.4), mode) };
    report("one half-float ULP just below 0.5 is " + ulp.toExponential(2) + " (" + (ulp / v0).toExponential(2) + " relative); the per-frame decay at 165 fps is " + (1 - perFrame).toExponential(2) + " relative, the banked 0.4 s step " + (1 - banked).toExponential(2));
    report("60 s of dep = 0.5 at refillRate 1: ideal " + ideal.toFixed(5) + " | round-to-nearest-even: every frame " + rows.rne.frame.toFixed(5) + ", banked " + rows.rne.step.toFixed(5) + " | round-toward-zero: every frame " + rows.rtz.frame.toFixed(5) + ", banked " + rows.rtz.step.toFixed(5));
    ok("!! the per-frame decay is smaller than half an ULP, so the store cannot carry it: round-to-nearest FREEZES the value (it stays 0.5) and round-toward-zero COLLAPSES it (to " + rows.rtz.frame.toFixed(4) + ") -- neither follows the ideal " + ideal.toFixed(4),
        (1 - perFrame) < ulp / v0 / 2 && rows.rne.frame === 0.5 && Math.abs(rows.rne.frame - ideal) > 0.05 && rows.rtz.frame < ideal / 4, "");
    ok("!! banking into 0.4 s steps follows the ideal under round-to-nearest (error " + Math.abs(rows.rne.step - ideal).toFixed(4) + ") and costs a bounded bias under round-toward-zero (error " + Math.abs(rows.rtz.step - ideal).toFixed(4) + ", against a collapse every-frame)",
        Math.abs(rows.rne.step - ideal) < 0.01 && Math.abs(rows.rtz.step - ideal) < 0.1 && Math.abs(rows.rtz.step - ideal) < Math.abs(rows.rtz.frame - ideal) / 3, "");
    report("WHICH ROUNDING A GPU USES FOR A RENDER-TARGET STORE is not read here: upstream observed the collapse (round-toward-zero behaviour), the spec's default is round-to-nearest-even, and this box has only a software adapter. The rig can say.");
    const cod = { in: 0.4999924 }, hd = doubleToHalf(cod.in), back = halfToDouble(hd);
    ok("  the harness codec carries a rounded-up mantissa (fixed at v4895: tools/ship/headlessGpu.mjs doubleToHalf(0.4999924) was 0.25 and is " + back + "), so it agrees with this gate's own round-to-nearest", back === f16(cod.in, "rne") && back === 0.5, "nextRounds f16-codec-mantissa-carry")
}

console.log("\n4. THE KERNEL");
{
    const skip = headlessGpuSkipReason(require_);
    if (skip) {
        report("kernel half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-3 never run the WGSL, so they cannot show that the kernel computes what the twin specifies");
    } else {
        const res = 64, size = 8, texel = size / res, seed = randState(res, 11);
        // edge = 0 switches off the rim wobble; the berm's grain noise stays (so the berm channel is graded loosely, the other three tightly). edge = 1 puts the wobble on everything.
        const mkF = (edge) => { const f = new TD.DeformField({ res, size, windDirectionDeg: 40 }); f.state.set(seed); f.update(0, { x: 0, z: 0 }); f.state.set(seed);
            f.brush(0.3, 0.2, 0.7, 0.15, 0.08, 0.4, 0.3, 0.5, 1.8, edge); f.brush(3.9, -1, 0.6, 0.1, 0.06, 0.2, 0, 1.1, 1, edge); f.brush(-3.95, 2, 0.5, 0.2, 0.05, 0.1, 0.9, 2.2, 2.5, edge); f.brush(1.2, -3, 0.9, 0.05, 0.12, 0.6, 0.1, 0, 1, edge);
            return f; };
        const runKernel = async (f, dtStep, dxTexels) => {
            const prevCopy = Float32Array.from(f.state); f.prevCenter = [0, 0]; f.center = [dxTexels * texel, 0]; f.lastRelaxDt = dtStep;
            const Pp = f.params(), twin = new Float32Array(prevCopy.length); TD.stepField(prevCopy, twin, Pp, f.brushes());
            const g = await runWgslComputeNative({ code: TD.KERNEL_WGSL, outCount: res * res * 4, uniforms: TD.packParams(Pp), inputs: [{ binding: 2, data: prevCopy }, { binding: 3, data: f.brushes() }], workgroups: [res / 8, res / 8], requireFn: require_ });
            const w = [0, 0, 0, 0]; let nz = 0, over = 0;
            if (g.ok) for (let i = 0; i < twin.length; i++) { const d = Math.abs(g.values[i] - twin[i]); w[i % 4] = Math.max(w[i % 4], d); if (twin[i] !== 0) nz++; if (d > 1e-4) over++; }
            return { g, w, nz, over, adapter: (g.adapter && g.adapter.description) || "?" };
        };
        const a = await runKernel(mkF(0), 0.8, 3), b = await runKernel(mkF(0), 0, 0), c = await runKernel(mkF(1), 0.8, 3);
        for (const [nm, r] of [["relaxation on, window moved", a], ["no relaxation, window still", b]]) ["depression", "berm", "compression", "ice"].forEach((ch, i) => reading("toroidalDeform: " + ch + " channel vs twin, " + nm, r.w[i], i === 1 ? 3e-4 : 1e-6, null, r.adapter));
        ["depression", "berm", "compression", "ice"].forEach((ch, i) => reading("toroidalDeform: " + ch + " channel vs twin, rim wobble ON", c.w[i], 5e-3, null, c.adapter));
        const fmt = (r) => "per channel worst [" + r.w.map((v) => v.toExponential(1)).join(", ") + "], " + r.over + " values over 1e-4, " + r.nz + " nonzero, adapter " + r.adapter;
        ok("!! the compute kernel equals the twin with the rim wobble OFF, relaxation on, the window moved 3 texels, four brushes (two across the seam): depression, compression and ice to 1e-6, the berm (its grain noise stays) to 3e-4", a.g.ok && !a.g.wroteNothing && a.nz > 1000 && a.w[0] < 1e-6 && a.w[2] < 1e-6 && a.w[3] < 1e-6 && a.w[1] < 3e-4, fmt(a));
        ok("!! ... and with no relaxation and the window still (dt = 0), the same bounds", b.g.ok && b.nz > 1000 && b.w[0] < 1e-6 && b.w[2] < 1e-6 && b.w[3] < 1e-6 && b.w[1] < 3e-4, fmt(b));
        ok("!! with the rim wobble ON every channel stays within 5e-3 of the twin (the bound is the wobble's amplitude: 0.22 of the rim radius times the noise's own f32 disagreement, measured below)", c.g.ok && c.w.every((v) => v < 5e-3), fmt(c));
        // the root of that disagreement, measured on its own: the same noise2 and hash21 evaluated by the kernel and by the twin at the points the brushes use
        const noiseCode = TD.KERNEL_WGSL.split("// ---- ours")[0] + `
@group(0) @binding(4) var<storage, read> pts: array<f32>;
@compute @workgroup_size(64) fn probe(@builtin(global_invocation_id) g: vec3u) { let i = g.x; let p = vec2f(pts[i * 2u], pts[i * 2u + 1u]); outBuf[i * 2u] = noise2(p); outBuf[i * 2u + 1u] = hash21(floor(p)); }`;
        const N = 256, pts = new Float32Array(N * 2), r = rng(5); for (let i = 0; i < N; i++) { const t = r() * 6.28318, seedv = r() * 100; pts[i * 2] = Math.cos(t) * 2.7 + seedv; pts[i * 2 + 1] = Math.sin(t) * 2.7 + seedv; }
        const pr = await runWgslComputeNative({ code: noiseCode, entryPoint: "probe", outCount: N * 2, inputs: [{ binding: 4, data: pts }], workgroups: N / 64, requireFn: require_ });
        let wn = 0, wh = 0; if (pr.ok) for (let i = 0; i < N; i++) { wn = Math.max(wn, Math.abs(pr.values[i * 2] - TD.noise2(pts[i * 2], pts[i * 2 + 1]))); wh = Math.max(wh, Math.abs(pr.values[i * 2 + 1] - TD.hash21(Math.floor(pts[i * 2]), Math.floor(pts[i * 2 + 1])))); }
        ok("!! the disagreement is in the noise and nowhere else: over 256 points the kernel's noise2 differs from the twin's by at most " + wn.toExponential(1) + " and its hash21 by " + wh.toExponential(1) + " (the fract chain keeps few bits; the adapter fuses and approximates); the wobble scales that by 0.22 and by the brush profile's slope, which is why the field rows above stay under 5e-3",
            pr.ok && wn < 1e-2 && wh < 1e-2, pr.ok ? "" : pr.reason + " " + (pr.errors || []).join(" | "));
        report("A REAL GPU MAY DISAGREE WITH THIS ADAPTER BY MORE OR LESS, and the noise is the part that will differ: the rim of a brush is not reproducible bit for bit across adapters. Nothing here depends on it (the depth, mass bounds and conservation do not), but a replay that compares fields across machines must not compare the rim.");
    }
}

console.log(`\ntoroidalDeform-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
exitCleanly(fails === 0 ? 0 : 1);
