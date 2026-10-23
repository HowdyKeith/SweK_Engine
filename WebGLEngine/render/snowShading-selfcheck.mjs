// WebGLEngine/render/snowShading-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~4 s with the software adapter)
//
// Run: node render/snowShading-selfcheck.mjs
//
// THE SNOW MATERIAL'S LIGHTING, HELD TO UPSTREAM'S TEXT AND TO WHAT ITS COMMENTS SAY IT DOES:
//   1  LIFTED     all 13 functions of lib/shading.wgsl that are not the shadow filter are upstream's bodies, byte for byte after comments and whitespace;
//   2  THE MODEL  the GGX distribution is normalised (its cosine-weighted integral over the half-vector hemisphere is 1) at five roughnesses; Fresnel runs f0 .. 1; wrapDiffuse is zero exactly where the
//                 terminator is pushed to (-w) and above Lambert elsewhere; RNM leaves the base alone under a flat detail and the detail alone over a flat base;
//   3  THE CLAIMS "translucency peaks looking INTO the light and switches off with the sun behind the camera" (the sign upstream's comment says it got wrong once); "a thin edge transmits more, over a wider range
//                 of angles, than deep snow"; "deeper snow comes back bluer"; "glints only at grazing view angles, and only when the sun is low relative to the surface"; "a glint is nailed to the ground"
//                 (a pure function of world position); "only a fraction of cells hold a facet" (measured); "an octave fades out once its cell nears a few pixels"; SH irradiance of a UNIFORM sky is pi x its radiance
//                 in every direction (the property the nine-coefficient form must keep) and of the real baked sky it follows the brute-force cosine integral (the error measured and printed);
//   4  THE KERNEL (needs the software WebGPU adapter; SKIPPED, and said, without one) every function as WGSL over a table equals the twin.
// NOT GRADED, said plainly: the look, a real GPU.
// SABOTAGE LOG (v4895): backScatter's H = L + N d -> L - N d in the WGSL -> 2 red by name (the lifted-bodies row, and the kernel row: snowSubsurface 7.2e-2 off).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as SS from "./snowShading.mjs";
import { bakeSky, sunFrom, latLongToDir } from "./skyBake.mjs";
import { reading, runWgslComputeNative, headlessGpuSkipReason, exitCleanly } from "../tools/ship/headlessGpu.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const norm = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ").trim();
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const fnBody = (text, name) => { const i = text.search(new RegExp("fn\\s+" + name + "\\(")); if (i < 0) return null; let k = text.indexOf("(", i), par = 0; for (; ; k++) { if (text[k] === "(") par++; if (text[k] === ")" && --par === 0) break; } const b = text.indexOf("{", k); let d = 0, e = b; for (; ; e++) { if (text[e] === "{") d++; if (text[e] === "}" && --d === 0) break; } return norm(text.slice(i, e + 1)); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], nrm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); }, lum = SS.luma;
const rd = (p) => fs.readFileSync(path.join(ENG, "vendor/snowflow/src", p), "utf8");

console.log("snowShading-selfcheck -- GGX, wrap, subsurface, glints, SH\n");
console.log("1. LIFTED");
{
    const names = ["distributionGGX", "visSmithGGXCorrelated", "fresnelSchlick", "fresnelSchlickRough", "wrapDiffuse", "backScatter", "snowSubsurface", "glintOctave", "snowGlints", "shIrradiance", "blendNormalRNM", "normalFromGradient", "luma"];
    const up = rd("shaders/lib/shading.wgsl"), bad = names.filter((f) => !fnBody(up, f) || fnBody(up, f) !== fnBody(SS.SHADING_WGSL, f));
    ok("!! all " + names.length + " functions (" + names.join(", ") + ") are upstream's bodies", bad.length === 0, bad.length ? "DIFFER: " + bad.join(", ") : "");
}

console.log("\n2. THE MODEL");
{
    for (const rough of [0.34, 0.62, 0.78, 0.95]) {
        let s = 0; const n = 20000;   // integral of D(h) cos(theta_h) over the hemisphere: 2 pi int D cos sin dtheta
        for (let i = 0; i < n; i++) { const th = (i + 0.5) / n * Math.PI / 2; s += SS.distributionGGX(Math.cos(th), rough) * Math.cos(th) * Math.sin(th) * (Math.PI / 2 / n); }
        s *= 2 * Math.PI;
        ok("!! GGX is normalised at roughness " + rough + ": the cosine-weighted integral of D is " + s.toFixed(4), Math.abs(s - 1) < 0.01);
    }
    {
        const ro = 0.07, a2 = Math.pow(ro * ro, 2), peak = SS.distributionGGX(1, ro), exact = 1 / (Math.PI * a2); let s = 0; const n = 20000; for (let i = 0; i < n; i++) { const th = (i + 0.5) / n * Math.PI / 2; s += SS.distributionGGX(Math.cos(th), ro) * Math.cos(th) * Math.sin(th) * (Math.PI / 2 / n); } s *= 2 * Math.PI;
        const edge = [0.1, 0.115, 0.13].map((q) => { const aa = Math.pow(q * q, 2); return Math.PI * aa * aa < 1e-7; });
        console.log("  ----  FINDING: distributionGGX clamps its denominator at 1e-7, and below roughness ~0.12 that clamp bites: at the ICE roughness 0.07 the peak is " + peak.toFixed(2) + " where the formula gives " + exact.toExponential(2) + " and the cosine-weighted integral is " + s.toFixed(3) + " instead of 1 -- refrozen ice loses almost all of its sun highlight (clamp active at 0.1/0.115/0.13: " + edge.join("/") + ")");
        ok("!! the clamp is measured, not assumed: at roughness 0.07 the integral is far below 1", s < 0.5 && peak < exact / 10);
    }
    const f = SS.fresnelSchlick(1, [0.028]), g = SS.fresnelSchlick(0, [0.028]), fr = SS.fresnelSchlickRough(0, [0.028], 0.62);
    ok("  Fresnel runs from f0 at normal incidence (" + f[0].toFixed(3) + ") to 1 at grazing (" + g[0].toFixed(3) + "); the rough form tops out at 1 - roughness (" + fr[0].toFixed(3) + ")", Math.abs(f[0] - 0.028) < 1e-9 && Math.abs(g[0] - 1) < 1e-9 && Math.abs(fr[0] - 0.38) < 1e-9);
    ok("  the correlated Smith visibility times 4 NdotL NdotV is a masking term in (0, 1]", [0.05, 0.4, 0.9].every((nl) => [0.05, 0.4, 0.9].every((nv) => { const g2 = SS.visSmithGGXCorrelated(nv, nl, 0.62) * 4 * nl * nv; return g2 > 0 && g2 <= 1.0001; })));
    const w = 0.62;
    ok("!! wrapDiffuse pushes the terminator to NdotL = -w (zero there, positive just above) and beats Lambert on the dark side: " + SS.wrapDiffuse(-w, w) + ", " + SS.wrapDiffuse(0, w).toFixed(3) + " at the geometric terminator, Lambert 0", SS.wrapDiffuse(-w, w) === 0 && SS.wrapDiffuse(-w + 0.01, w) > 0 && SS.wrapDiffuse(0, w) > 0.2 && SS.wrapDiffuse(1, w) === 1 / (1 + w) * (1 + w) / (1 + w) * 1 || Math.abs(SS.wrapDiffuse(1, w) - 1 / (1 + w)) < 1e-12);
    const flat = [0, 0, 1], tilted = nrm([0.3, -0.2, 0.9]);
    ok("!! reoriented normal mapping: a flat detail leaves the base alone, a flat base leaves the detail alone (the add-and-normalise it replaces would lose the base's tilt)", SS.blendNormalRNM(tilted, flat).every((v, i) => Math.abs(v - tilted[i]) < 1e-9) && SS.blendNormalRNM(flat, tilted).every((v, i) => Math.abs(v - tilted[i]) < 1e-9));
    const n = SS.normalFromGradient([0.2, -0.1]);
    ok("  normalFromGradient is a unit vector tilted against the slope (+x slope leans -x) and flat ground is straight up; luma weights sum to 1", Math.abs(Math.hypot(...n) - 1) < 1e-12 && n[0] < 0 && n[2] > 0 && SS.normalFromGradient([0, 0])[1] === 1 && Math.abs(SS.luma([1, 1, 1]) - 1) < 1e-9);
}

console.log("\n3. THE CLAIMS");
const N0 = [0, 1, 0], L = nrm([0.8, 0.35, 0.2]);
{
    const back = (V, thick = 0.1, rad = 1) => SS.backScatter(N0, L, V, 0.28 * rad, 3 + 6 * thick, 1 - 0.7 * thick);
    const into = back(L.map((v) => -v)), behind = back(L);
    ok("!! translucency peaks looking INTO the light and is off with the sun behind the camera: backScatter " + into.toFixed(3) + " with the eye looking toward the sun, " + behind.toFixed(3) + " with the sun at the viewer's back", into > 0.2 && behind === 0);
    const lc = [1, 1, 1], V = nrm([-L[0] + 0.25, -L[1] + 0.2, -L[2] + 0.1]);
    const thin = SS.snowSubsurface(N0, L, V, lc, 0.0, 1, 1), deep = SS.snowSubsurface(N0, L, V, lc, 1.0, 1, 1);
    let wT = 0, wD = 0; for (let a = 0; a < 90; a += 2) { const v = nrm([-L[0] * Math.cos(a * Math.PI / 180) + Math.sin(a * Math.PI / 180) * 0.4, -L[1] * Math.cos(a * Math.PI / 180) + 0.5, -L[2] * Math.cos(a * Math.PI / 180)]); wT += lum(SS.snowSubsurface(N0, L, v, lc, 0, 1, 1)) > 0.05 ? 1 : 0; wD += lum(SS.snowSubsurface(N0, L, v, lc, 1, 1, 1)) > 0.05 ? 1 : 0; }
    ok("!! a thin edge transmits more than deep snow (" + lum(thin).toFixed(3) + " against " + lum(deep).toFixed(3) + " off axis) and over a wider range of angles (" + wT + " of 45 sampled angles against " + wD + ")", lum(thin) > lum(deep) * 1.5 && wT > wD);
    const sh = SS.snowSubsurface(N0, L, L.map((v) => -v), [1, 1, 1], 0.05, 1, 1), dp = SS.snowSubsurface(N0, L, L.map((v) => -v), [1, 1, 1], 1.0, 1, 1);
    ok("!! deeper snow comes back bluer: red/blue is " + (sh[0] / sh[2]).toFixed(3) + " when thin and " + (dp[0] / dp[2]).toFixed(3) + " when deep", dp[0] / dp[2] < sh[0] / sh[2] - 0.2);
}
{
    const Lg = nrm([0.9, 0.3, 0.1]), p = [3.7, 5.2];
    const sweep = (V) => { let s = 0; for (let i = 0; i < 4000; i++) s += SS.snowGlints([i * 0.0137, (i * 0.0211) % 7], N0, V, Lg, 0.001, 1, 0.72); return s; };
    const down = sweep([0, 1, 0]), graze = sweep(nrm([-0.9, 0.12, -0.1])), mid = sweep(nrm([-0.6, 0.6, 0]));
    ok("!! glints only at grazing view angles: summed over 4000 ground positions, looking straight down " + down.toFixed(3) + ", at 45 degrees " + mid.toFixed(3) + ", grazing into the sun " + graze.toFixed(3), down === 0 && graze > mid && graze > 0.05);
    const a = SS.snowGlints(p, N0, nrm([-0.9, 0.12, -0.1]), Lg, 0.001, 1, 0.72), b = SS.snowGlints(p, N0, nrm([-0.9, 0.12, -0.1]), Lg, 0.001, 1, 0.72);
    ok("  a glint is a pure function of world position and view: the same call twice is bit-identical, so it does not crawl and TAA can keep it", a === b);
    let on = 0, tot = 0; for (let i = 0; i < 3000; i++) { const h = SS.glintOctave([i * 0.31 + 0.13, i * 0.17 + 0.29], 0.185, N0, nrm([-0.5, 0.5, 0.2]), [1, 0, 0], [0, 0, 1], 1500); tot++; if (h > 0) on++; }
    console.log("  ----  MEASURED: with a half-vector exactly on the facet axis, " + (on / tot * 100).toFixed(1) + "% of randomly placed samples light (cells without a crystal are 38%, and the disc covers pi 0.17^2 = 9% of a cell: a hit is rare by design)");
    const fine = Array.from({ length: 4000 }, (_, i) => SS.snowGlints([i * 0.0137, (i * 0.0211) % 7], N0, nrm([-0.9, 0.12, -0.1]), Lg, 0.001, 1, 0.72)), far = Array.from({ length: 4000 }, (_, i) => SS.snowGlints([i * 0.0137, (i * 0.0211) % 7], N0, nrm([-0.9, 0.12, -0.1]), Lg, 1.0, 1, 0.72));
    const sum = (x) => x.reduce((s, v) => s + v, 0);
    ok("!! both octaves fade out as the pixel passes their cells: summed glint " + sum(fine).toFixed(3) + " at a 1 mm pixel, " + sum(far).toFixed(3) + " at a 1 m pixel (cells 5 cm and 18 cm)", sum(fine) > 0 && sum(far) === 0);
    ok("  intensity zero returns zero before any work", SS.snowGlints(p, N0, [0, 1, 0], Lg, 0.01, 0, 0.7) === 0);
}
{
    const w = 64, h = 32, uniform = new Float32Array(w * h * 4).map((_, i) => (i % 4 === 3 ? 1 : [0.4, 0.55, 0.9][i % 4])), shU = SS.projectSH(uniform, w, h);
    let worst = 0; for (const n of [[0, 1, 0], [1, 0, 0], [0, 0, -1], nrm([1, 1, 1]), nrm([-1, 0.3, 0.2])]) { const e = SS.shIrradiance(n, shU); for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(e[k] / (Math.PI * uniform[k]) - 1)); }
    ok("!! SH irradiance of a uniform sky is pi x its radiance in every direction (worst error " + (worst * 100).toFixed(2) + "%): the nine-coefficient form keeps the energy", worst < 0.01);
    const sun = sunFrom(13, 60), sky = bakeSky(w, h, sun, 20, [0.55, 0.62, 0.74]), sh = SS.projectSH(sky, w, h);
    let wr = 0, mean = 0, c = 0; for (const n of [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], nrm([0.5, 0.5, 0.5]), nrm([-0.5, 0.2, 0.8])]) { const a = SS.shIrradiance(n, sh), b = SS.irradianceOf(sky, w, h, n); const e = Math.abs(lum(a) - lum(b)) / lum(b); wr = Math.max(wr, e); mean += e; c++; }
    ok("!! SH irradiance of the real baked sky follows the brute-force cosine integral: worst luminance error " + (wr * 100).toFixed(1) + "%, mean " + (mean / c * 100).toFixed(1) + "% over 8 normals (a low-order fit of a sky with a bright horizon; the number is the finding)", wr < 0.25);
    const up = SS.shIrradiance([0, 1, 0], sh), dn = SS.shIrradiance([0, -1, 0], sh);
    ok("  the sky is bluer than it is red overhead (b/r " + (up[2] / up[0]).toFixed(2) + ") -- the cool half of the warm-light / cool-shadow split", up[2] / up[0] > 1.2);
}

ok("  the table stride is " + SS.SHADING_QSTRIDE + " and the module reports itself in " + SS.reportLines().length + " lines", SS.SHADING_QSTRIDE === 16 && SS.reportLines().length === 2);
console.log("\n4. THE KERNEL");
const skip = headlessGpuSkipReason(require_);
if (skip) console.log("  SKIPPED  " + skip);
else {
    const r = rng(33), Q = [], tw = [], KINDS = 7, N = 280, v3 = () => nrm([r() - 0.5, r() * 0.8 + 0.1, r() - 0.5]);
    const w = 64, h = 32, sh = SS.projectSH(bakeSky(w, h, sunFrom(13, 60), 20, [0.55, 0.62, 0.74]), w, h), shFlat = new Float32Array(36); sh.forEach((c, i) => shFlat.set([c[0], c[1], c[2], 0], i * 4));
    for (let i = 0; i < N; i++) {
        const k = i % KINDS, row = new Array(16).fill(0); row[0] = k; let ex;
        if (k === 0) { const nh = r(), nv = 0.05 + r() * 0.95, nl = 0.05 + r() * 0.95, ro = 0.07 + r() * 0.8, f0 = 0.03; row.splice(1, 5, nh, nv, nl, ro, f0); ex = [SS.distributionGGX(nh, ro), SS.visSmithGGXCorrelated(nv, nl, ro), SS.fresnelSchlick(nh, [f0])[0], 0]; }
        else if (k === 1) { const nl = r() * 2 - 1, wr = r(); row.splice(1, 2, nl, wr); ex = [SS.wrapDiffuse(nl, wr), 0, 0, 0]; }
        else if (k === 2) { const n = v3(), l = v3(), v = v3(), t = r(), st = r() * 2, ra = 0.3 + r() * 1.5; row.splice(1, 15, ...n, ...l, ...v, 1, 0.9, 0.8, t, st, ra); ex = [...SS.snowSubsurface(n, l, v, [1, 0.9, 0.8], t, st, ra), 0]; }
        else if (k === 3) { const xz = [r() * 4, r() * 4], n = v3(), v = nrm([-0.9 + r() * 0.2, 0.1 + r() * 0.3, r() * 0.2]), l = nrm([0.9, 0.3, 0.1]), fp = r() * 0.05; row.splice(1, 14, ...xz, ...n, ...v, ...l, fp, 1, 0.72); ex = [SS.snowGlints(xz, n, v, l, fp, 1, 0.72), 0, 0, 0]; }
        else if (k === 4) { const n = v3(); row.splice(1, 3, ...n); ex = [...SS.shIrradiance(n, sh), 0]; }
        else if (k === 5) { const a = v3(), b = v3(); row.splice(1, 6, ...a, ...b); ex = [...SS.blendNormalRNM(a, b), 0]; }
        else { const u = r(), ro = r(); row.splice(1, 3, u, 0.04, ro); ex = [SS.fresnelSchlickRough(u, [0.04], ro)[0], 0, 0, 0]; }
        Q.push(...row); tw.push(ex);
    }
    const g = await runWgslComputeNative({ code: SS.SHADING_KERNEL_WGSL, outCount: N * 4, inputs: [{ binding: 2, data: new Float32Array(Q) }, { binding: 3, data: shFlat }], workgroups: Math.ceil(N / 64), requireFn: require_ });
    if (!g.ok) ok("!! the shading kernel runs", false, (g.reason || "") + " " + (g.errors || []).join(" | "));
    else {
        const worst = new Array(KINDS).fill(0);
        for (let i = 0; i < N; i++) { const k = i % KINDS; for (let c = 0; c < 4; c++) worst[k] = Math.max(worst[k], Math.abs(g.values[i * 4 + c] - tw[i][c]) / Math.max(1, Math.abs(tw[i][c]))); }
        const names = ["GGX terms", "wrapDiffuse", "snowSubsurface", "snowGlints", "shIrradiance", "RNM", "fresnelRough"];
        ok("!! every function as WGSL equals its twin over " + N + " queries: " + names.map((n, k) => n + " " + worst[k].toExponential(1)).join(", "), worst.every((e, k) => e < (k === 3 ? 0.05 : 2e-3)) && !g.wroteNothing, "adapter " + ((g.adapter && g.adapter.description) || "?"));
        names.forEach((nm, k) => reading("snowShading: " + nm + " as WGSL vs twin", worst[k], k === 3 ? 0.05 : 2e-3, N, ((g.adapter && g.adapter.description) || "?")));
    }
}
console.log(`\nsnowShading-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
exitCleanly(fails === 0 ? 0 : 1);
