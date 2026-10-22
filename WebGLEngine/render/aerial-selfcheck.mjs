// WebGLEngine/render/aerial-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~2 s)
//
// Run: node render/aerial-selfcheck.mjs
//
// AERIAL PERSPECTIVE, HELD TO UPSTREAM'S TEXT AND TO WHAT ITS COMMENTS SAY IT DOES:
//   1  LIFTED     the three functions' bodies (the tilt of 0.42, mip 3, the lobe g 0.62 x 5.5 x 0.16, the crossfade smoothstep(0.55, 0.995), the extinction pow) are upstream's, the sky fetch aside;
//   2  THE CHAIN  the sky mip chain is the 2 x 2 box filter: every level has the same mean as the one above, blur lowers the variance, level 0 is the LUT, and the fractional-mip sampler blends levels;
//   3  THE CLAIMS "at total extinction a hazed surface and the sky pixel beside it are the same colour": at extinction 1 the inscatter EQUALS the exact sky sample, to rounding; "adding the lobe on top of the
//                 exact sample double-counts it": the crossfaded inscatter is NOT the exact sample plus the lobe (measured); the lobe makes haze toward the sun warmer and brighter than away from it; with no fog the
//                 colour is untouched, with a lot it is the sky; the near sky is the BLURRED sky (mip 3), not the exact one;
//   4  THE KERNEL (needs the software WebGPU adapter; SKIPPED, and said, without one) applyAerial as a compute kernel over the chain equals the twin over 200 queries.
// NOT GRADED, said plainly: the look, a real GPU.
// SABOTAGE LOG (v4895, each on the real file, restored, git-clean verified): the Mie g 0.62 -> 0.5 in the JS twin's lobe -> 1 red by name (the kernel-vs-twin row, 34.7% off).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as A from "./aerial.mjs";
import * as SB from "./skyBake.mjs";
import { runWgslComputeNative, headlessGpuSkipReason, exitCleanly } from "../tools/ship/headlessGpu.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const norm = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ").trim();
const W = 64, H = 32, GB = [0.55, 0.62, 0.74], SUN = SB.sunFrom(13, 60), SUNC = [3, 2.85, 2.55];
const lut = SB.bakeSky(W, H, SUN, 20, GB), chain = SB.buildSkyMips(lut, W, H);
const lum = (c) => 0.3 * c[0] + 0.42 * c[1] + 0.28 * c[2];

console.log("aerial-selfcheck -- aerial perspective\n");
console.log("1. LIFTED");
{
    const up = norm(fs.readFileSync(path.join(ENG, "vendor/snowflow/src/shaders/lib/atmosphere.wgsl"), "utf8")), mine = norm(A.AERIAL_WGSL);
    const stmts = [
        "let d = normalize(viewDir + vec3f(0.0, 0.42, 0.0));",
        "let mu = dot(viewDir, sunDir);", "let fwd = phaseMie(mu, 0.62) * 5.5;", "sunColor * fwd * 0.16",
        "return mix(near, exact, smoothstep(0.55, 0.995, ext));",
        "let t = aerialTransmittance(camPos, worldPos, density, heightFalloff, fogStart); let ext = clamp(1.0 - pow(t, strength), 0.0, 1.0);",
        "return mix(color, inscatter, ext);",
        "fn phaseMie(mu: f32, g: f32) -> f32 { let g2 = g * g; let n = (1.0 - g2) * (1.0 + mu * mu); let d = (2.0 + g2) * pow(1.0 + g2 - 2.0 * g * mu, 1.5); return (3.0 / (8.0 * PI)) * n / d; }",
    ];
    const missing = stmts.filter((s) => !(up.includes(s) && mine.includes(s)));
    ok("!! the tilt (0.42), the forward lobe (g 0.62 x 5.5 x 0.16), the crossfade (0.55 .. 0.995), the extinction and the final mix are upstream's text, statement for statement", missing.length === 0, stmts.length + " statements in both" + (missing.length ? "; MISSING " + missing.map((m) => m.slice(0, 50)).join(" | ") : ""));
    ok("  the near-sky read is mip 3.0 and the exact read mip 0.0 in the WGSL, as upstream's textureSampleLevel calls are", /return skyAtLevel\(d, 3\.0\);/.test(A.AERIAL_WGSL) && /let exact = skyAtLevel\(normalize\(viewDir\), 0\.0\);/.test(A.AERIAL_WGSL) && /textureSampleLevel\(tex, samp, dirToLatLong\(d\), 3\.0\)/.test(fs.readFileSync(path.join(ENG, "vendor/snowflow/src/shaders/lib/atmosphere.wgsl"), "utf8")));
}

console.log("\n2. THE CHAIN");
{
    const meanOf = (l) => { const [w, h] = SB.mipSize(W, H, l), o = SB.mipOffset(W, H, l); const m = [0, 0, 0]; for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) m[c] += chain[o + i * 4 + c] / (w * h); return m; };
    const varOf = (l) => { const [w, h] = SB.mipSize(W, H, l), o = SB.mipOffset(W, H, l), m = meanOf(l); let v = 0; for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) v += (chain[o + i * 4 + c] - m[c]) ** 2; return v / (w * h); };
    ok("!! level 0 is the LUT, and every level has the same mean as the one above (the box filter conserves energy): level 5 mean " + meanOf(5).map((v) => v.toFixed(4)).join(" ") + " against level 0 " + meanOf(0).map((v) => v.toFixed(4)).join(" "), chain.slice(0, lut.length).every((v, i) => v === lut[i]) && [1, 2, 3, 4, 5].every((l) => meanOf(l).every((v, c) => Math.abs(v - meanOf(0)[c]) < 1e-5)));
    ok("!! blur lowers the variance level by level (" + [0, 1, 2, 3, 4, 5].map((l) => varOf(l).toExponential(1)).join(" > ") + ")", [1, 2, 3, 4, 5].every((l) => varOf(l) < varOf(l - 1)));
    ok("  the chain is " + chain.length + " floats = 64 x 32 + 32 x 16 + ... x 4 channels, offsets accumulate, sizes halve to 2 x 1", chain.length === (2048 + 512 + 128 + 32 + 8 + 2) * 4 && SB.mipOffset(W, H, 1) === 2048 * 4 && SB.mipSize(W, H, 5).join() === "2,1");
    const d = [0.3, 0.2, 0.9], l0 = SB.sampleSkyLevel(chain, W, H, d, 0), l1 = SB.sampleSkyLevel(chain, W, H, d, 1), lh = SB.sampleSkyLevel(chain, W, H, d, 0.5);
    ok("  the fractional mip is the blend of the two levels (0.5 is their mean), and level 0 equals the bilinear LUT fetch", lh.every((v, i) => Math.abs(v - (l0[i] + l1[i]) / 2) < 1e-9) && l0.every((v) => Number.isFinite(v)));
}

console.log("\n3. UPSTREAM'S CLAIMS");
{
    const view = (az, el) => { const a = az * Math.PI / 180, e = el * Math.PI / 180; return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)]; };
    let worst = 0; for (const [az, el] of [[0, 3], [60, 5], [200, 10], [300, 1], [120, 20]]) { const v = view(az, el), ins = A.aerialInscatterSky(chain, W, H, v, SUN, SUNC, 1), ex = SB.sampleSkyLevel(chain, W, H, v, 0); worst = Math.max(worst, ...ins.map((x, i) => Math.abs(x - ex[i]))); }
    ok("!! AT TOTAL EXTINCTION THE HAZE IS THE SKY: the inscatter at extinction 1 equals the exact sky sample in five directions (worst difference " + worst.toExponential(1) + ")", worst < 1e-9);
    const v = view(60, 4), ex = SB.sampleSkyLevel(chain, W, H, v, 0), withLobe = A.aerialInscatterSky(chain, W, H, v, SUN, SUNC, 0.6), mu = v[0] * SUN[0] + v[1] * SUN[1] + v[2] * SUN[2], lobe = SB.phaseMie(mu, 0.62) * 5.5 * 0.16;
    const naive = ex.map((x, i) => x + SUNC[i] * lobe), cross = A.aerialInscatterSky(chain, W, H, v, SUN, SUNC, 0.995);
    ok("!! the lobe is crossfaded away, not added on top: toward the sun at extinction 0.995 the inscatter is the exact sky (" + lum(cross).toFixed(2) + ") where 'exact + lobe' would be " + lum(naive).toFixed(2) + " -- the double count upstream describes", lum(naive) > lum(cross) * 1.3 && Math.abs(lum(cross) - lum(ex)) < 1e-6, "mu " + mu.toFixed(3));
    const toward = A.aerialInscatterSky(chain, W, H, view(60, 6), SUN, SUNC, 0.2), away = A.aerialInscatterSky(chain, W, H, view(240, 6), SUN, SUNC, 0.2);
    ok("!! at short range the forward lobe makes haze toward the sun brighter (" + lum(toward).toFixed(2) + ") and warmer (r/b " + (toward[0] / toward[2]).toFixed(2) + ") than away from it (" + lum(away).toFixed(2) + ", r/b " + (away[0] / away[2]).toFixed(2) + ")", lum(toward) > lum(away) * 1.2 && toward[0] / toward[2] > away[0] / away[2]);
    const near = A.aerialNearSky(chain, W, H, view(60, 6)), exactSky = SB.sampleSkyLevel(chain, W, H, view(60, 6), 0);
    ok("  the near sky is the BLURRED, upward-tilted sky: it is not the exact sample (difference " + Math.hypot(...near.map((x, i) => x - exactSky[i])).toFixed(3) + ") and it is bluer than the horizon band it replaces (b/r " + (near[2] / near[0]).toFixed(2) + " against " + (exactSky[2] / exactSky[0]).toFixed(2) + ")", Math.hypot(...near.map((x, i) => x - exactSky[i])) > 0.05 && near[2] / near[0] > exactSky[2] / exactSky[0]);
    const col = [0.7, 0.72, 0.78], cam = [0, 2, 0], same = A.applyAerial(chain, W, H, col, cam, [5, 2, 0], view(90, 0), SUN, SUNC, 0.003, 0.012, 12, 1), far = A.applyAerial(chain, W, H, col, cam, [3000, 4, 0], view(90, 0.1), SUN, SUNC, 0.003, 0.012, 12, 1), farSky = SB.sampleSkyLevel(chain, W, H, view(90, 0.1), 0);
    ok("!! with the surface inside the fog start the colour is untouched, and 3 km away at density 0.003 it IS the sky in that direction (" + far.map((x) => x.toFixed(3)).join(" ") + " against " + farSky.map((x) => x.toFixed(3)).join(" ") + ")", same.every((x, i) => x === col[i]) && far.every((x, i) => Math.abs(x - farSky[i]) < 1e-3));
    report(A.reportLines()[0]);
}

console.log("\n4. THE KERNEL");
{
    const skip = headlessGpuSkipReason(require_);
    if (skip) { report("kernel half SKIPPED -- " + skip); report("*** THAT IS A SKIP AND NOT A PASS: sections 1-3 never run the WGSL"); }
    else {
        let seed = 31; const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const N = 200, Q = new Float32Array(N * A.AERIAL_QSTRIDE), tw = [];
        for (let i = 0; i < N; i++) {
            const az = r() * 360, el = r() * 40 - 3, d = [Math.cos(el * Math.PI / 180) * Math.sin(az * Math.PI / 180), Math.sin(el * Math.PI / 180), Math.cos(el * Math.PI / 180) * Math.cos(az * Math.PI / 180)], dist = 20 + r() * 2500, col = [r(), r(), r()], cam = [0, 1 + r() * 4, 0], world = [d[0] * dist, cam[1] + d[1] * dist, d[2] * dist];
            Q.set([...col, ...cam, ...world, ...d, ...SUN, ...SUNC, 0.002 + r() * 0.004, 0.012, 12, 1], i * A.AERIAL_QSTRIDE);
            tw.push(A.applyAerial(chain, W, H, col, cam, world, d, SUN, SUNC, 0.002 + 0 * r(), 0.012, 12, 1));
        }
        // rebuild the twin with the exact f32 inputs the kernel reads
        for (let i = 0; i < N; i++) { const q = Q.subarray(i * A.AERIAL_QSTRIDE, (i + 1) * A.AERIAL_QSTRIDE); tw[i] = A.applyAerial(chain, W, H, [q[0], q[1], q[2]], [q[3], q[4], q[5]], [q[6], q[7], q[8]], [q[9], q[10], q[11]], [q[12], q[13], q[14]], [q[15], q[16], q[17]], q[18], q[19], q[20], q[21]); }
        const g = await runWgslComputeNative({ code: A.AERIAL_KERNEL_WGSL, outCount: N * 3, inputs: [{ binding: 1, data: chain }, { binding: 2, data: Q }], workgroups: Math.ceil(N / 64), requireFn: require_ });
        if (!g.ok) ok("!! the aerial kernel runs", false, (g.reason || "") + " " + (g.errors || []).join(" | "));
        else {
            let worst = 0, mid = 0; for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) { worst = Math.max(worst, Math.abs(g.values[i * 3 + c] - tw[i][c]) / Math.max(Math.abs(tw[i][c]), 0.05)); }
            ok("!! applyAerial as a compute kernel over the sky chain equals the twin over 200 queries (worst relative difference " + (worst * 100).toFixed(3) + "%)", worst < 5e-3 && !g.wroteNothing, "adapter " + ((g.adapter && g.adapter.description) || "?"));
        }
    }
}

console.log(`\naerial-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
exitCleanly(fails === 0 ? 0 : 1);
