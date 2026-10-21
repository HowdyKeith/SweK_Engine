// WebGLEngine/render/pcssShadow-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~2 s)
//
// Run: node render/pcssShadow-selfcheck.mjs
//
// PCSS, HELD TO UPSTREAM'S TEXT AND TO WHAT ITS COMMENTS SAY IT DOES:
//   1  LIFTED     the filter body (the bias, the search radius, the rotation, the blocker search, the penumbra in metres, the 12-tap filter) and the Poisson table are upstream's lib/shading.wgsl;
//   2  THE TWIN   no blocker -> exactly 1; a blocker covering the whole disc in front of the receiver -> exactly 0; the lit fraction is a multiple of 1/12;
//   3  THE CLAIMS "the penumbra softens with the blocker's distance": across a straight shadow edge the transition widens as the blocker moves away, and the penumbra the function computes is exactly blocker
//                 distance x 0.0093 x softness in metres; "contact stays crisp": a blocker touching the receiver gives a filter of one texel, and the filter is capped in metres (1.8 m); "the receiver-plane bias stops a grazing sun flooding level snow": a receiver sloped in light
//                 space, lit by a map that holds its own plane, reads 1 with the true plane gradient and a flood below 1 with the gradient zeroed (the flood upstream describes);
//   4  THE KERNEL (needs the software WebGPU adapter; SKIPPED, and said, without one) the compute kernel on Dawn over 300 random queries on a random map equals the twin (worst difference printed, bounded).
// NOT GRADED, said plainly: cascade selection, the normal-offset bias, drawing, a real GPU.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as PS from "./pcssShadow.mjs";
import { runWgslComputeNative, headlessGpuSkipReason, exitCleanly } from "../tools/ship/headlessGpu.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const norm = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ").trim();
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const RES = 128, TEXEL = 1 / RES;
const P = { depthRange: 200, orthoWidth: 100, softness: 2, bias: 0.05 };
const mapOf = (fn) => { const m = new Float32Array(RES * RES); for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) m[y * RES + x] = fn((x + 0.5) / RES, (y + 0.5) / RES); return m; };
const shade = (map, uv, depth, rot = 0.3, plane = [0, 0], softness = P.softness, d = null) => PS.pcssShadow(map, RES, uv, depth, TEXEL, P.depthRange, P.orthoWidth, softness, rot, P.bias, plane, d);

console.log("pcssShadow-selfcheck -- percentage-closer soft shadows\n");
console.log("1. LIFTED");
{
    const up = norm(fs.readFileSync(path.join(ENG, "vendor/snowflow/src/shaders/lib/shading.wgsl"), "utf8")), kern = norm(PS.PCSS_KERNEL_WGSL);
    const stmts = [
        "let bias = biasWorld / depthRange;", "let planeAt = planeNdcPerUV;", "let maxPenumbraUV = min(24.0 * texelSize, 1.8 / orthoWidth);",
        "let cs = cos(noiseRot); let sn = sin(noiseRot); let rot = mat2x2f(cs, -sn, sn, cs);",
        "let off = rot * POISSON[i] * maxPenumbraUV; let s = clamp(uv + off, vec2f(0.0), vec2f(1.0));",
        "let cmp = receiverDepth + dot(off, planeAt) - bias; if (d < cmp) { blockerDepthSum += cmp - d; blockerCount += 1.0; }",
        "if (blockerCount < 0.5) { return 1.0; }",
        "let blockerDist = (blockerDepthSum / blockerCount) * depthRange; let penumbraWorld = blockerDist * 0.0093 * softness; let filterR = clamp(penumbraWorld / orthoWidth, texelSize, maxPenumbraUV);",
        "let off = rot * POISSON[i] * filterR;", "lit += select(1.0, 0.0, d < cmp); } return lit / 12.0;",
        "vec2f(-0.326, -0.406), vec2f(-0.840, -0.074), vec2f(-0.696, 0.457), vec2f(-0.203, 0.621), vec2f( 0.962, -0.195), vec2f( 0.473, -0.480), vec2f( 0.519, 0.767), vec2f( 0.185, -0.893), vec2f( 0.507, 0.064), vec2f( 0.896, 0.412), vec2f(-0.322, -0.933), vec2f(-0.792, -0.598)".replace(/vec2f\( /g, "vec2f("),
    ];
    const upN = up.replace(/vec2f\( /g, "vec2f("), kN = kern.replace(/vec2f\( /g, "vec2f(");
    const missing = stmts.filter((s) => !(upN.includes(s.replace(/\s+/g, " ")) && kN.includes(s.replace(/\s+/g, " "))));
    ok("!! the blocker search, the penumbra in metres, the 12-tap filter and the Poisson table are upstream's lib/shading.wgsl statement for statement", missing.length === 0, stmts.length + " statements in both" + (missing.length ? "; MISSING " + missing.map((m) => m.slice(0, 50)).join(" | ") : ""));
    ok("  the twin's table is the same twelve points", PS.POISSON.length === 12 && PS.POISSON[0][0] === -0.326 && PS.POISSON[11][1] === -0.598);
}

ok("  PCSS_WGSL, the slice a shader includes, holds the Poisson table and pcssShadow and no kernel entry point", PS.PCSS_WGSL.includes("const POISSON") && PS.PCSS_WGSL.includes("fn pcssShadow(") && !PS.PCSS_WGSL.includes("@compute") && PS.PCSS_KERNEL_WGSL.includes(PS.PCSS_WGSL));
console.log("\n2. THE TWIN");
{
    const open = mapOf(() => 1), wall = mapOf(() => 0.2);
    ok("!! no blocker in front of the receiver reads exactly 1; a blocker over the whole disc reads exactly 0", shade(open, [0.5, 0.5], 0.6) === 1 && shade(wall, [0.5, 0.5], 0.6) === 0);
    let multiple = true; const r = rng(2); for (let i = 0; i < 100; i++) { const half = mapOf((u) => (u < 0.2 + 0.6 * r() ? 0.3 : 1)); const v = shade(half, [0.3 + r() * 0.4, 0.5], 0.6, r() * 6); if (Math.abs(v * 12 - Math.round(v * 12)) > 1e-9) multiple = false; }
    ok("  the lit fraction is a multiple of 1/12 (twelve taps), over 100 random edges and rotations", multiple);
}

{
    const m = new Float32Array(4 * 4); for (let i = 0; i < 16; i++) m[i] = i;
    ok("  sampleDepth is bilinear and clamped with texel centres at (i + 0.5) / res: the centre of texel (1, 2) reads 9, halfway to (2, 2) reads 9.5, and outside the map clamps to the edge texel", PS.sampleDepth(m, 4, 1.5 / 4, 2.5 / 4) === 9 && Math.abs(PS.sampleDepth(m, 4, 2 / 4, 2.5 / 4) - 9.5) < 1e-6 && PS.sampleDepth(m, 4, -3, -3) === 0 && PS.sampleDepth(m, 4, 5, 5) === 15);
}

console.log("\n3. UPSTREAM'S CLAIMS");
{
    // a straight shadow edge at u = 0.5: the map is `depth` for u < 0.5 and 1 (open) beyond; the receiver at depth 0.6 is probed across the edge
    const edge = (blockerDepth) => mapOf((u) => (u < 0.5 ? blockerDepth : 1));
    const width = (blockerDepth, softness) => {
        const m = edge(blockerDepth); let lo = null, hi = null;
        for (let i = 0; i <= 400; i++) { const u = 0.3 + 0.4 * i / 400; let acc = 0; for (let k = 0; k < 24; k++) acc += shade(m, [u, 0.5], 0.6, k * 0.26, [0, 0], softness); const lit = acc / 24; if (lit > 0.05 && lo === null) lo = u; if (lit > 0.95 && hi === null) hi = u; }
        return (hi ?? 0.7) - (lo ?? 0.3);
    };
    const det = (blockerDepth, softness) => { const d = {}; shade(edge(blockerDepth), [0.44, 0.5], 0.6, 0.3, [0, 0], softness, d); return d; };   // well inside the blocker, so every tap in the search disc sees the blocker's own depth
    const w = { d2: width(0.59, 3), d20: width(0.5, 3), d60: width(0.30, 3) }, dist = (z) => (0.6 - z) * P.depthRange;
    ok("!! the penumbra softens with the blocker's distance: the transition across the edge is " + (w.d2 * P.orthoWidth).toFixed(2) + " m for a blocker " + dist(0.59).toFixed(0) + " m in front, " + (w.d20 * P.orthoWidth).toFixed(2) + " m for " + dist(0.5).toFixed(0) + " m, " + (w.d60 * P.orthoWidth).toFixed(2) + " m for " + dist(0.3).toFixed(0) + " m (softness 3)", w.d2 <= w.d20 && w.d20 <= w.d60 && w.d60 > w.d2 * 1.6);
    const dA = det(0.5, 1.5), dB = det(0.5, 3);
    ok("!! the penumbra is blocker distance x 0.0093 x softness IN METRES, exactly as the comment says: at " + dist(0.5).toFixed(0) + " m and softness 1.5 / 3 the function computes " + dA.penumbraWorld.toFixed(4) + " m / " + dB.penumbraWorld.toFixed(4) + " m (the formula gives " + ((dist(0.5) - P.bias) * 0.0093 * 1.5).toFixed(4) + " / " + ((dist(0.5) - P.bias) * 0.0093 * 3).toFixed(4) + "; the depth bias of 0.05 m is taken off the distance, as the code does)", Math.abs(dA.penumbraWorld - (dist(0.5) - P.bias) * 0.0093 * 1.5) < 1e-6 && Math.abs(dB.penumbraWorld / dA.penumbraWorld - 2) < 1e-9);
    const dContact = det(0.5995, 2), dFar = det(0.0, 10);
    ok("!! contact stays crisp: a blocker 0.1 m in front gives a filter radius of exactly one texel (" + (dContact.filterR * P.orthoWidth).toFixed(2) + " m) and a transition of " + (width(0.5995, 2) * P.orthoWidth).toFixed(2) + " m, a couple of texels; and the filter is CAPPED IN METRES: even a 120 m blocker at softness 10 stops at 1.8 m (" + (dFar.filterR * P.orthoWidth).toFixed(2) + " m)", Math.abs(dContact.filterR - TEXEL) < 1e-12 && width(0.5995, 2) * P.orthoWidth < 2.5 * P.orthoWidth * TEXEL && Math.abs(dFar.filterR * P.orthoWidth - 1.8) < 1e-9);
    ok("  doubling softness widens the transition (" + (width(0.3, 4) * P.orthoWidth).toFixed(2) + " m against " + (width(0.3, 2) * P.orthoWidth).toFixed(2) + " m at the same blocker)", width(0.3, 4) > width(0.3, 2) * 1.2);
    // the receiver-plane claim: a slope falling in light space, the map holds the receiver's own plane
    const slope = 3, mapPlane = mapOf((u) => 0.5 + slope * (u - 0.5) * 0.05), planeTrue = [slope * 0.05, 0];   // depth rises with u at 0.15 per unit uv
    const uv = [0.5, 0.5], rcv = 0.5;
    const withPlane = shade(mapPlane, uv, rcv, 0.4, planeTrue), noPlane = shade(mapPlane, uv, rcv, 0.4, [0, 0]);
    ok("!! the receiver-plane bias: a receiver on a sloped plane, lit by a map holding that plane, reads " + withPlane.toFixed(2) + " with the true gradient and FLOODS to " + noPlane.toFixed(2) + " with the gradient zeroed -- the self-shadowing flood upstream's comment describes", withPlane === 1 && noPlane < 0.75);
    report(PS.reportLines()[0]);
}

console.log("\n4. THE KERNEL");
{
    const skip = headlessGpuSkipReason(require_);
    if (skip) { report("kernel half SKIPPED -- " + skip); report("*** THAT IS A SKIP AND NOT A PASS: sections 1-3 never run the WGSL"); }
    else {
        const r = rng(9), map = new Float32Array(RES * RES); for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) map[y * RES + x] = 0.35 + 0.3 * Math.sin(x * 0.09) * Math.cos(y * 0.07) + 0.1 * r();
        const N = 300, q = new Float32Array(N * 8); for (let i = 0; i < N; i++) { q[i * 8] = 0.1 + r() * 0.8; q[i * 8 + 1] = 0.1 + r() * 0.8; q[i * 8 + 2] = 0.3 + r() * 0.4; q[i * 8 + 3] = r() * 6.28; q[i * 8 + 4] = (r() - 0.5) * 0.4; q[i * 8 + 5] = (r() - 0.5) * 0.4; }
        const twin = Array.from({ length: N }, (_, i) => shade(map, [q[i * 8], q[i * 8 + 1]], q[i * 8 + 2], q[i * 8 + 3], [q[i * 8 + 4], q[i * 8 + 5]]));
        const g = await runWgslComputeNative({ code: PS.PCSS_KERNEL_WGSL, outCount: N, uniforms: [RES, TEXEL, P.depthRange, P.orthoWidth, P.softness, P.bias, 0, 0], inputs: [{ binding: 2, data: map }, { binding: 3, data: q }], workgroups: Math.ceil(N / 64), requireFn: require_ });
        if (!g.ok) ok("!! the PCSS kernel runs", false, (g.reason || "") + " " + (g.errors || []).join(" | "));
        else {
            let worst = 0, differ = 0, part = 0; for (let i = 0; i < N; i++) { const d = Math.abs(g.values[i] - twin[i]); worst = Math.max(worst, d); if (d > 1e-6) differ++; if (twin[i] > 0 && twin[i] < 1) part++; }
            ok("!! the PCSS kernel equals the twin over 300 random queries on a random map (" + part + " of them partly lit): at most one tap of twelve may differ where f32 and f64 fall either side of a depth comparison; worst " + worst.toExponential(2) + ", " + differ + " queries differ", worst <= 1 / 12 + 1e-6 && differ <= 6 && part > 20 && !g.wroteNothing, "adapter " + ((g.adapter && g.adapter.description) || "?"));
        }
    }
}

console.log(`\npcssShadow-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
exitCleanly(fails === 0 ? 0 : 1);
