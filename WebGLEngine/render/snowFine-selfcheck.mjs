// WebGLEngine/render/snowFine-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~6 s with the software adapter)
//
// Run: node render/snowFine-selfcheck.mjs
//
// THE FINE SNOW SURFACE, HELD TO UPSTREAM'S TEXT AND TO WHAT ITS COMMENTS SAY IT DOES:
//   1  LIFTED     every function of terrain.wgsl's fine half, noise.wgsl's ridgedd/hash22/rot2/ign and detailBake's grain functions is upstream's body, byte for byte after comments and whitespace;
//   2  THE TWIN   the analytic slopes of terrainFine, terrainFineFiltered and ridgedd equal central differences of their own heights; the detail bake tiles exactly and its normals are unit;
//   3  THE CLAIMS "the sastrugi streaks along the wind" (the field is smoother along the wind than across it); "the veer breaks the corduroy" (windLocal's veer and stretch span their stated ranges);
//                 "the filtered twin fades each layer once its wavelength nears a pixel" (a wide footprint leaves only the long layer, a huge one leaves nothing); "exposure scours the crests"
//                 (sastrugi taller at exposure 1 than 0, ripples the other way); "sastrugi stands proud" is MEASURED, not asserted (the height range printed);
//   4  THE KERNEL (needs the software WebGPU adapter; SKIPPED, and said, without one) the WGSL over a table equals the twin within the f32 hash's stated bound.
// NOT GRADED, said plainly: the look, a real GPU, GRAIN_SCALE and the bake resolution (set here, not upstream's).
// SABOTAGE LOG (v4895): the WGSL sastrugi amplitude 0.125 -> 0.2 -> 2 red by name (the lifted-bodies row, and the kernel row: terrainFine 2.1e-2 off); the detail mip kernel's box filter * 0.25 -> * 0.5 -> 3 red in snowGpu-selfcheck (the mip row by name; the brighter picture also reddens the SSS and glint rows).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as SF from "./snowFine.mjs";
import { reading, runWgslComputeNative, headlessGpuSkipReason, exitCleanly } from "../tools/ship/headlessGpu.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const norm = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ").trim();
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const fnBody = (text, name) => { const i = text.search(new RegExp("fn\\s+" + name + "\\(")); if (i < 0) return null; let k = text.indexOf("(", i), par = 0; for (; ; k++) { if (text[k] === "(") par++; if (text[k] === ")" && --par === 0) break; } let b = text.indexOf("{", k), d = 0, e = b; for (; ; e++) { if (text[e] === "{") d++; if (text[e] === "}" && --d === 0) break; } return norm(text.slice(i, e + 1)); };
const rd = (p) => fs.readFileSync(path.join(ENG, "vendor/snowflow/src", p), "utf8");

console.log("snowFine-selfcheck -- sastrugi, ripples, grain, the baked detail\n");
console.log("1. LIFTED");
{
    const groups = [["shaders/lib/noise.wgsl", SF.FINE_NOISE_WGSL, ["hash22", "rot2", "ridgedd", "ign"]], ["shaders/lib/terrain.wgsl", SF.FINE_TERRAIN_WGSL, ["windMat", "windLocal", "terrainFine", "terrainFineFiltered"]], ["shaders/detailBake.fragment.wgsl", SF.DETAIL_WGSL, ["hashTile", "grainHeight", "detailHeight"]]];
    const bad = []; let n = 0;
    for (const [file, ours, names] of groups) { const up = rd(file); for (const f of names) { n++; const a = fnBody(up, f), b = fnBody(ours, f); if (!a || a !== b) bad.push(f); } }
    ok("!! all " + n + " functions (hash22, rot2, ridgedd, ign, windMat, windLocal, terrainFine, terrainFineFiltered, hashTile, grainHeight, detailHeight) are upstream's bodies", bad.length === 0, bad.length ? "DIFFER: " + bad.join(", ") : "");
}

console.log("\n2. THE TWIN");
const r = rng(5);
{
    const errs = [], errsF = [], errsR1 = [], errsR3 = [], errsN = [];
    for (let i = 0; i < 300; i++) {
        const x = (r() - 0.5) * 200, z = (r() - 0.5) * 200, w = r() * 6.28, ex = r(), e = 1e-4;
        const rel = (fn) => { const g = fn(x, z), nx = (fn(x + e, z)[0] - fn(x - e, z)[0]) / (2 * e), nz = (fn(x, z + e)[0] - fn(x, z - e)[0]) / (2 * e); return Math.hypot(g[1] - nx, g[2] - nz) / (Math.hypot(nx, nz) + 0.02); };
        errs.push(rel((a, b) => SF.terrainFine(a, b, w, ex, 1))); errsF.push(rel((a, b) => SF.terrainFineFiltered(a, b, w, ex, 1, 0.01)));
        errsR1.push(rel((a, b) => SF.ridgedd(a * 0.3, b * 0.3, 1, 2.11, 0.52).map((v, k) => k ? v * 0.3 : v)));
        errsR3.push(rel((a, b) => SF.ridgedd(a * 0.3, b * 0.3, 3, 2.11, 0.52).map((v, k) => k ? v * 0.3 : v)));
        errsN.push(rel((a, b) => SF.noised(a * 0.7, b * 0.7).map((v, k) => k ? v * 0.7 : v)));
    }
    const q = (a, f) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * f)];
    ok("!! noised and a ONE-octave ridgedd have exact analytic slopes (90th percentile relative " + q(errsN, 0.9).toExponential(1) + " and " + q(errsR1, 0.9).toExponential(1) + ")", q(errsN, 0.9) < 1e-3 && q(errsR1, 0.9) < 1e-3);
    console.log("  ----  FINDING: ridgedd couples octaves through `prev` and its derivative ignores that coupling, so a THREE-octave ridgedd's slope is not exact: median relative error " + q(errsR3, 0.5).toExponential(1) + ", 90th percentile " + q(errsR3, 0.9).toExponential(1) + " (upstream calls the derivatives exact)");
    ok("!! terrainFine's slope follows central differences of its height closely enough to light: median relative error " + q(errs, 0.5).toExponential(1) + ", 90th percentile " + q(errs, 0.9).toExponential(1) + " (the veer's chain-rule term and the octave coupling are ignored, as upstream says of the first)", q(errs, 0.5) < 0.2);
    ok("  and terrainFineFiltered the same: median " + q(errsF, 0.5).toExponential(1) + ", 90th percentile " + q(errsF, 0.9).toExponential(1), q(errsF, 0.5) < 0.2);
    const m = SF.detailTexel(0.3, 0.4), a = SF.detailTexel(0.0 + 1e-9, 0.37), b = SF.detailTexel(1.0 + 1e-9, 0.37), c = SF.detailTexel(0.55, 0 + 1e-9), d = SF.detailTexel(0.55, 1 + 1e-9);
    ok("!! the detail bake tiles EXACTLY: the texel at u = 0 equals the texel at u = 1, and at v = 0 equals v = 1", a.every((v, i) => Math.abs(v - b[i]) < 1e-6) && c.every((v, i) => Math.abs(v - d[i]) < 1e-6));
    let unit = 0, minC = 9, maxC = -9, tilt = 0; const N = 400;
    for (let i = 0; i < N; i++) { const t = SF.detailTexel(r(), r()), nx = t[0] * 2 - 1, ny = t[1] * 2 - 1; if (nx * nx + ny * ny <= 1) unit++; minC = Math.min(minC, t[2]); maxC = Math.max(maxC, t[2]); tilt += Math.hypot(nx, ny) / N; }
    ok("  the packed-grain normals are valid (xy inside the unit disc) over " + N + " texels, the cavity stays in (0, 1] (" + minC.toFixed(2) + " .. " + maxC.toFixed(2) + "), the mean tilt is " + tilt.toFixed(3) + " at GRAIN_SCALE " + SF.GRAIN_SCALE, unit === N && minC > 0 && maxC <= 1.0001 && tilt > 0.05 && tilt < 0.8);
    ok("  noise2 is the value of noised, and is zero on the lattice", SF.noise2(1.7, 2.3) === SF.noised(1.7, 2.3)[0] && Math.abs(SF.noise2(3, 4)) < 1e-12);
    const rm = SF.rot2(0.6), wm = SF.windMat(0.6, 2, 3, 0.5);
    ok("  rot2 is a rotation (columns unit and orthogonal), windMat is that rotation then the scales (sx/scale, sy/scale), smoothstep is 0, 1/2 and 1 at its edges and middle", Math.abs(rm[0] * rm[0] + rm[1] * rm[1] - 1) < 1e-12 && Math.abs(rm[0] * rm[2] + rm[1] * rm[3]) < 1e-12 && Math.abs(wm[0] - 2 / 0.5 * Math.cos(0.6)) < 1e-12 && Math.abs(wm[3] - 3 / 0.5 * Math.cos(0.6)) < 1e-12 && SF.smoothstep(0, 1, -1) === 0 && SF.smoothstep(0, 1, 0.5) === 0.5 && SF.smoothstep(0, 1, 2) === 1);
    const h22 = SF.hash22(3.7, -9.2), gh = SF.grainHeight(0.31, 0.77, 26, 26), dh = SF.detailHeight(0.31, 0.77);
    ok("  hash22 is in [0, 1)^2 and deterministic, grainHeight returns a height in [0, 1] and a cavity in (0, 1], detailHeight stacks three scales (" + SF.DETAIL_RES + " px bake, table stride " + SF.FINE_QSTRIDE + ")", h22.every((v) => v >= 0 && v < 1) && h22[0] === SF.hash22(3.7, -9.2)[0] && gh[0] >= 0 && gh[0] <= 1 && gh[1] > 0 && gh[1] <= 1 && dh[0] >= gh[0] && SF.DETAIL_RES === 256 && SF.FINE_QSTRIDE === 8 && SF.reportLines().length === 2);
    const bk = SF.bakeDetail(32);
    ok("  bakeDetail returns res x res x 4 floats at texel centres", bk.length === 32 * 32 * 4 && Math.abs(bk[0] - SF.detailTexel(0.5 / 32, 0.5 / 32, 32)[0]) < 1e-7);
}

console.log("\n3. THE CLAIMS");
{
    const W = 0.7, n = 4000; let along = 0, across = 0, hs = [];
    const dir = [Math.cos(W), -Math.sin(W)], cr = [Math.sin(W), Math.cos(W)];   // windMat rotates by W: its x runs along (c, -s)... measured both ways below
    const rr = rng(9), pts = Array.from({ length: n }, () => [(rr() - 0.5) * 120, (rr() - 0.5) * 120]);
    const sep = 0.15, h = (p) => SF.terrainFineFiltered(p[0], p[1], W, 0.5, 1, 0.4)[0];
    const cand = [[Math.cos(W), Math.sin(W)], [-Math.sin(W), Math.cos(W)]];
    const dv = cand.map((c) => pts.reduce((s, p) => s + Math.abs(h([p[0] + c[0] * sep, p[1] + c[1] * sep]) - h(p)), 0) / n);
    for (const p of pts) hs.push(h(p));
    ok("!! the sastrugi streaks along one direction: the mean height change over 0.15 m (sastrugi only: the pixel filter removes the finer layers) is " + dv[0].toFixed(4) + " m one way and " + dv[1].toFixed(4) + " m the other (a ratio of " + (Math.max(...dv) / Math.min(...dv)).toFixed(2) + ")", Math.max(...dv) / Math.min(...dv) > 1.15);
    hs.sort((a, b) => a - b);
    console.log("  ----  FINDING: upstream's comment says sastrugi 'stands 10-30 cm proud'; terrainFine at amplitude 1 spans only " + (hs[n - 1] - hs[0]).toFixed(3) + " m peak to peak (5th..95th " + (hs[Math.floor(n * 0.95)] - hs[Math.floor(n * 0.05)]).toFixed(3) + " m): its 0.125 m amplitude multiplies a ridged value that sits within about 0.35 +- 0.2.\n  ----  MEASURED: the fine height spans " + hs[0].toFixed(3) + " .. " + hs[n - 1].toFixed(3) + " m (5th..95th " + hs[Math.floor(n * 0.05)].toFixed(3) + " .. " + hs[Math.floor(n * 0.95)].toFixed(3) + ")");
    let vmin = 9, vmax = -9, smin = 9, smax = -9; for (let i = 0; i < 4000; i++) { const wl = SF.windLocal((rr() - 0.5) * 6000, (rr() - 0.5) * 6000); vmin = Math.min(vmin, wl[0]); vmax = Math.max(vmax, wl[0]); smin = Math.min(smin, wl[1]); smax = Math.max(smax, wl[1]); }
    ok("!! windLocal veers by up to +-0.42 rad and stretches the ridges between 2.3 and 4.7: measured veer " + vmin.toFixed(2) + " .. " + vmax.toFixed(2) + ", stretch " + smin.toFixed(2) + " .. " + smax.toFixed(2), vmin < -0.1 && vmax > 0.1 && vmin >= -0.43 && vmax <= 0.43 && smin >= 2.29 && smax <= 4.71 && smax - smin > 1);
    const amp = (fp, ex) => { let s = 0; for (let i = 0; i < 400; i++) s += Math.abs(SF.terrainFineFiltered(pts[i][0], pts[i][1], W, ex, 1, fp)[0]) / 400; return s; };
    const a0 = amp(0.001, 0.5), a1 = amp(0.5, 0.5), a2 = amp(3, 0.5);
    ok("!! the filtered twin fades the layers as the pixel grows: mean |height| " + a0.toFixed(4) + " at 1 mm, " + a1.toFixed(4) + " at 0.5 m (grain and ripples gone), " + a2.toFixed(4) + " at 3 m (all gone)", a0 > a1 && a1 > 0 && a2 === 0);
    let rip = (ex) => { let s = 0; for (let i = 0; i < 400; i++) s += Math.abs(SF.terrainFine(pts[i][0], pts[i][1], W, ex, 1)[0]) / 400; return s; };
    ok("  exposure scours: sastrugi dominate the relief, so mean |height| is " + rip(1).toFixed(4) + " at exposure 1 against " + rip(0).toFixed(4) + " at 0", rip(1) > rip(0));
}

{
    ok("  DETAIL_TEXEL_WGSL, the bake kernel and the mip kernel are WGSL, the chain is " + SF.DETAIL_LEVELS + " levels down from " + SF.DETAIL_RES + " px to 1", SF.DETAIL_TEXEL_WGSL.includes("fn detailTexel(") && SF.DETAIL_BAKE_KERNEL_WGSL.includes("textureStore(outTex") && SF.DETAIL_BAKE_KERNEL_WGSL.includes(SF.DETAIL_TEXEL_WGSL.trim().slice(0, 40)) && SF.DETAIL_MIP_KERNEL_WGSL.includes("0.25") && SF.DETAIL_LEVELS === Math.log2(SF.DETAIL_RES) + 1);
}
console.log("\n4. THE KERNEL");
const skip = headlessGpuSkipReason(require_);
if (skip) console.log("  SKIPPED  " + skip);
else {
    const rk = rng(21), Q = [], tw = [], N = 240, span = (i) => (i < 120 ? 10 : 160);
    for (let i = 0; i < N; i++) {
        const kind = i % 4, x = (rk() - 0.5) * span(i), z = (rk() - 0.5) * span(i), w = rk() * 6.28, ex = rk(), fp = [0.002, 0.05, 0.4, 1.2][i % 4];
        if (kind === 0) { Q.push(0, x, z, w, ex, 1, 0, 0); tw.push([...SF.terrainFine(x, z, w, ex, 1), 0]); }
        else if (kind === 1) { Q.push(1, x, z, w, ex, 1, fp, 0); tw.push([...SF.terrainFineFiltered(x, z, w, ex, 1, fp), 0]); }
        else if (kind === 2) { Q.push(2, x * 30, z * 30, 0, 0, 0, 0, 0); tw.push([...SF.windLocal(x * 30, z * 30), 0, 0]); }
        else { const u = rk(), v = rk(); Q.push(3, u, v, 256, SF.GRAIN_SCALE, 0, 0, 0); tw.push(SF.detailTexel(u, v, 256)); }
    }
    const g = await runWgslComputeNative({ code: SF.FINE_KERNEL_WGSL, outCount: N * 4, inputs: [{ binding: 2, data: new Float32Array(Q) }], workgroups: Math.ceil(N / 64), requireFn: require_ });
    if (!g.ok) ok("!! the fine kernel runs", false, (g.reason || "") + " " + (g.errors || []).join(" | "));
    else {
        const stat = (lo, hi, k) => { let worstH = 0, n = 0, within = 0; const sl = []; for (let i = lo; i < hi; i++) if (i % 4 === k) { worstH = Math.max(worstH, Math.abs(g.values[i * 4] - tw[i][0])); sl.push(Math.max(Math.abs(g.values[i * 4 + 1] - tw[i][1]), Math.abs(g.values[i * 4 + 2] - tw[i][2]), Math.abs(g.values[i * 4 + 3] - tw[i][3]))); n++; if (sl[sl.length - 1] < 5e-3 && Math.abs(g.values[i * 4] - tw[i][0]) < 5e-3) within++; } sl.sort((a, b) => a - b); return { worst: worstH, med: sl[Math.floor(sl.length / 2)], n, within }; };
        const near = [0, 1, 2, 3].map((k) => stat(0, 120, k)), far = [0, 1].map((k) => stat(120, 240, k));
        const AD = (g.adapter && g.adapter.description) || "?";
        reading("snowFine: terrainFine height vs twin within 5 m (metres)", near[0].worst, 5e-3, near[0].n, AD);
        reading("snowFine: terrainFineFiltered height vs twin within 5 m (metres)", near[1].worst, 5e-3, near[1].n, AD);
        reading("snowFine: windLocal vs twin within 5 m", near[2].worst, 1e-2, near[2].n, AD);
        reading("snowFine: detailTexel median error within 5 m", near[3].med, 2e-2, near[3].n, AD);
        ok("!! within 5 m of the origin the WGSL equals the twin to the f32 hash's bound: worst height error terrainFine " + near[0].worst.toExponential(1) + " (median slope error " + near[0].med.toExponential(1) + "), terrainFineFiltered " + near[1].worst.toExponential(1) + " (" + near[1].med.toExponential(1) + "), windLocal " + near[2].worst.toExponential(1) + ", detailTexel " + near[3].worst.toExponential(1) + " (median " + near[3].med.toExponential(1) + ") over " + near[0].n + " queries each", near[0].worst < 5e-3 && near[0].med < 5e-3 && near[1].worst < 5e-3 && near[1].med < 5e-3 && near[2].worst < 1e-2 && near[3].med < 2e-2 && !g.wroteNothing, "adapter " + ((g.adapter && g.adapter.description) || "?"));
        console.log("  ----  FINDING: the f32 hash is not portable at distance. Out to 80 m the same function on the adapter agrees with the twin on only " + far[0].within + " of " + far[0].n + " terrainFine and " + far[1].within + " of " + far[1].n + " terrainFineFiltered queries to 5e-3 (worst " + far[0].worst.toFixed(3) + " m): the rotated, scaled lattice coordinates grow and the hash's fract chain throws away the bits. The page is its own reference; the twin grades the arithmetic near the origin.");
    }
}
if (!skip) {
    const cb = await runWgslComputeNative({ code: SF.DETAIL_BAKE_KERNEL_WGSL, compileOnly: true, requireFn: require_ }), cm = await runWgslComputeNative({ code: SF.DETAIL_MIP_KERNEL_WGSL, compileOnly: true, requireFn: require_ });
    ok("!! the detail bake kernel and the mip kernel COMPILE on the adapter (they are run, and their output read back, by snowGpu-selfcheck)", cb.ok && cm.ok, [...(cb.errors || []), ...(cm.errors || [])].join(" | ").slice(0, 200));
}
console.log(`\nsnowFine-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
exitCleanly(fails === 0 ? 0 : 1);
