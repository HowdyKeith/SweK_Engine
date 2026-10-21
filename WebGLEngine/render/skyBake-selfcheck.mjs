// WebGLEngine/render/skyBake-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~8 s with the software adapter; sections 1-4 alone ~2 s)
//
// Run: node render/skyBake-selfcheck.mjs
//
// THE NISHITA SKY, HELD TO UPSTREAM'S TEXT, TO PHYSICS IT SHOULD SHOW, AND TO ITS OWN CLAIMS:
//   1  LIFTED     nishitaSky's constants and every block of its body appear in the kernel exactly as in vendor/snowflow's lib/atmosphere.wgsl; upstream's header says "16 view steps by 8 light steps" and
//                 its code says 32: measured, recorded as a finding;
//   2  THE SKY    at a sun 13 degrees up: the zenith is blue (b > g > r), the anti-sun horizon is pale (the grazing pull toward the achromatic: its chroma is a fraction of the zenith's), the sun-side horizon is
//                 brighter than the anti-sun one, nothing is negative or NaN over a 1,000-direction sweep, a ray into space-facing zero returns the sky and a sun below the horizon dims the whole dome;
//   3  THE CLAIMS upstream says its first sky had a one-stop dark notch near the horizon (a uniform march) cured by t^2.5 spacing and by feeding shadowed samples back through the multiple-scattering term: along the
//                 anti-sun azimuth from +10 degrees to the horizon the luminance never falls below 50% of its peak (upstream's 'before' was 45%), and the handover below the horizon is monotone and complete. THE 'BEFORE'
//                 IS NOT REPRODUCED here (a straw-man uniform march did not show the notch): said in the output, not claimed;
//   4  THE MAP    latLongToDir and dirToLatLong are inverses; aerialTransmittance equals a numerical integral of exp(-k y) along the segment, is 1 inside the fog start and falls with distance;
//   5  THE KERNEL (needs the software WebGPU adapter; SKIPPED, and said, without one) the bake kernel on Dawn over a 64 x 32 LUT equals the CPU bake (worst relative difference printed and bounded).
// NOT GRADED, said plainly: the look of the sky, the ground-bounce solve and SH projection (not lifted), drawing, a real GPU.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as SB from "./skyBake.mjs";
import { runWgslComputeNative, headlessGpuSkipReason, exitCleanly } from "../tools/ship/headlessGpu.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const norm = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ").trim();
const lum = (c) => 0.3 * c[0] + 0.42 * c[1] + 0.28 * c[2];
const chroma = (c) => { const m = Math.max(...c), n = Math.min(...c); return m > 0 ? (m - n) / m : 0; };
const GB = [0.6, 0.65, 0.75];

console.log("skyBake-selfcheck -- the Nishita sky\n");
console.log("1. LIFTED");
{
    const up = norm(fs.readFileSync(path.join(ENG, "vendor/snowflow/src/shaders/lib/atmosphere.wgsl"), "utf8")), kern = norm(SB.BAKE_KERNEL_WGSL);
    const stmts = [
        "const EARTH_R: f32 = 6360000.0; const ATMOS_R: f32 = 6420000.0; const H_RAYLEIGH: f32 = 8000.0; const H_MIE: f32 = 1200.0;",
        "const BETA_R: vec3f = vec3f(5.8e-6, 13.5e-6, 33.1e-6); const BETA_M: vec3f = vec3f(21e-6, 21e-6, 21e-6); const MIE_G: f32 = 0.76;",
        "const MS_BOOST: f32 = 1.5;",
        "let origin = vec3f(0.0, EARTH_R + 800.0, 0.0);",
        "let tNext = march * pow(f32(i + 1) / f32(STEPS), DIST_POWER); let stepLen = tNext - tPrev; let p = origin + rayDir * (tPrev + stepLen * 0.5);",
        "let tau = BETA_R * (odR + lR) + BETA_M * 1.1 * (odM + lM); let atten = exp(-tau); sumR += atten * dR; sumM += atten * dM;",
        "let attenV = exp(-(BETA_R * odR + BETA_M * 1.1 * odM)); shadR += attenV * dR; shadM += attenV * dM;",
        "col += sunIntensity * ( (sumR + shadR * SHADOW_FILL) * BETA_R * MS_BOOST + (sumM + shadM * SHADOW_FILL) * BETA_M * 0.4 ) * msPhase;",
        "let downT = 1.0 - smoothstep(-0.030, -0.005, rayDir.y); col = mix(col, groundBounce, downT);",
        "let grazing = 1.0 - smoothstep(0.0, 0.26, abs(rayDir.y)); let pale = dot(col, vec3f(0.30, 0.42, 0.28)); col = mix(col, vec3f(pale) * vec3f(0.97, 1.0, 1.06), grazing * 0.82);",
        "fn latLongToDir(uv: vec2f) -> vec3f { let phi = (uv.x - 0.5) * 2.0 * PI; let theta = uv.y * PI; let st = sin(theta); return vec3f(st * sin(phi), cos(theta), st * cos(phi)); }",
    ];
    const missing = stmts.filter((s) => !(up.includes(s) && kern.includes(s)));
    ok("!! the constants and every block of nishitaSky (the power-law march, the light march, the shadowed-sample feed, the multiple-scattering term, the ground handover, the grazing pull) are upstream's text", missing.length === 0, stmts.length + " statements in both" + (missing.length ? "; MISSING " + missing.map((m) => m.slice(0, 50)).join(" | ") : ""));
    const hdr = fs.readFileSync(path.join(ENG, "vendor/snowflow/src/shaders/lib/atmosphere.wgsl"), "utf8");
    ok("!! FINDING: upstream's header says '16 view steps by 8 light steps' and its code marches " + SB.STEPS + " (the t^2.5 comment says thirty-two): the header is stale", /16 view steps by 8 light steps/.test(hdr) && /const STEPS: i32 = 32;/.test(hdr) && SB.STEPS === 32 && SB.LIGHT_STEPS === 8);
}

console.log("\n2. THE SKY");
{
    const sun = SB.sunFrom(13, 0), I = 20, at = (elevDeg, azimDeg) => { const e = elevDeg * Math.PI / 180, a = azimDeg * Math.PI / 180; return SB.nishitaSky([Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)], sun, I, GB); };
    const zen = at(90, 0), anti = at(2, 180), toward = at(2, 0);
    ok("!! the zenith is blue (b > g > r)", zen[2] > zen[1] && zen[1] > zen[0] && zen[0] > 0, zen.map((v) => v.toFixed(3)).join(" "));
    ok("!! the horizon away from the sun is pale: its chroma (" + chroma(anti).toFixed(3) + ") is under a third of the zenith's (" + chroma(zen).toFixed(3) + ") -- the grazing pull toward the achromatic", chroma(anti) < chroma(zen) / 3);
    ok("  the sun-side horizon is brighter than the anti-sun one (the forward lobe)", lum(toward) > lum(anti), lum(toward).toFixed(2) + " vs " + lum(anti).toFixed(2));
    let bad = 0, neg = 0; for (let i = 0; i < 1000; i++) { const u = (i * 0.618034) % 1, v = (i + 0.5) / 1000, c = SB.nishitaSky(SB.latLongToDir(u, v), sun, I, GB); if (c.some((x) => !Number.isFinite(x))) bad++; if (c.some((x) => x < 0)) neg++; }
    ok("  1,000 directions over the whole sphere: no NaN, no infinity, nothing negative", bad === 0 && neg === 0);
    const down = at(-20, 90);
    ok("!! below the horizon the sky IS the ground bounce (the handover is complete 1.7 degrees down): at -20 degrees the result equals groundBounce", down.every((v, i) => Math.abs(v - GB[i]) < 1e-9), down.map((v) => v.toFixed(3)).join(" "));
    const dusk = SB.nishitaSky([0, 1, 0], SB.sunFrom(-12, 0), I, GB);
    ok("  a sun 12 degrees below the horizon dims the zenith to under 60% of its daytime value (measured " + (100 * lum(dusk) / lum(zen)).toFixed(0) + "%; single scattering plus the isotropic term keeps twilight light, as a real sky does)", lum(dusk) < lum(zen) * 0.6 && lum(dusk) > 0, lum(dusk).toFixed(3) + " vs " + lum(zen).toFixed(3));
}

console.log("\n3. UPSTREAM'S CLAIMS");
{
    const sun = SB.sunFrom(13, 0), I = 20, profile = (azim, fn) => { const out = []; for (let e = 10; e >= -3; e -= 0.5) { const er = e * Math.PI / 180, a = azim * Math.PI / 180, d = [Math.cos(er) * Math.sin(a), Math.sin(er), Math.cos(er) * Math.cos(a)]; out.push(lum(fn(d))); } return out; };
    const prof = profile(180, (d) => SB.nishitaSky(d, sun, I, GB)), above = prof.slice(0, 21), ratio = Math.min(...above) / Math.max(...above);   // indices 0..20 are +10 down to 0 degrees
    ok("!! along the anti-sun azimuth from +10 down to the horizon the luminance never falls below " + (100 * ratio).toFixed(0) + "% of its peak (above 50%: no one-stop notch -- upstream measured 0.84 against 1.86 at the same place before its fix, 45%)", ratio > 0.5, above.map((v) => v.toFixed(2)).join(" "));
    const mono = prof.slice(20); let handover = true; for (let i = 1; i < mono.length; i++) if (mono[i] > mono[i - 1] + 1e-9) handover = false;
    ok("  below the horizon the handover to the ground bounce is monotone and complete by -1.5 degrees (" + prof[20].toFixed(2) + " at 0, " + prof[23].toFixed(2) + " at -1.5, the bounce's own luminance is " + lum(GB).toFixed(2) + ")", handover && Math.abs(prof[23] - lum(GB)) < 0.02);
    report("NOT REPRODUCED HERE: upstream's account of the original notch (a uniform march losing the first 14 km and 15 km up). A 16-sample uniform march of the single-scattering term alone does not show it over this profile in this twin, so the claim that t^2.5 spacing cured a notch is read from upstream's comment and not confirmed by a measured before-and-after; what is confirmed is the AFTER.");
}

console.log("\n4. THE MAP AND THE HAZE");
{
    let worst = 0; for (let i = 0; i < 200; i++) { const u = 0.02 + (i * 0.4871) % 0.96, v = 0.03 + (i * 0.3219) % 0.94, d = SB.latLongToDir(u, v), uv = SB.dirToLatLong(d); worst = Math.max(worst, Math.abs(uv[0] - u), Math.abs(uv[1] - v)); }
    ok("!! latLongToDir and dirToLatLong are inverses over 200 directions (worst " + worst.toExponential(1) + ")", worst < 1e-12);
    const cam = [0, 2, 0], world = [300, 40, 120], k = 0.05, density = 0.002, start = 10, T = SB.aerialTransmittance(cam, world, density, k, start);
    const len = Math.hypot(world[0], world[1] - cam[1], world[2]); let num = 0; const N = 200000; for (let i = 0; i < N; i++) { const t = (i + 0.5) / N; num += Math.exp(-k * (cam[1] + t * (world[1] - cam[1]))) * len / N; }
    const dist = Math.max(0, len - start), want = Math.exp(-density * num * (dist / len));
    ok("!! aerialTransmittance equals a numerical integral of exp(-k y) along the segment (the closed form, with the fog start taken off the front proportionally): " + T.toFixed(6) + " vs " + want.toFixed(6), Math.abs(T - want) < 1e-6);
    ok("  transmittance is exactly 1 inside the fog start, a flat path uses exp(-k y) * distance, and it falls with distance", SB.aerialTransmittance(cam, [5, 2, 0], density, k, 10) === 1 && Math.abs(SB.aerialTransmittance([0, 3, 0], [100, 3, 0], 0.01, 0.1, 0) - Math.exp(-0.01 * Math.exp(-0.3) * 100)) < 1e-12 && SB.aerialTransmittance(cam, [600, 40, 240], density, k, start) < T);
    report(SB.reportLines().join(" | "));
}

console.log("\n5. THE KERNEL");
{
    const skip = headlessGpuSkipReason(require_);
    if (skip) { report("kernel half SKIPPED -- " + skip); report("*** THAT IS A SKIP AND NOT A PASS: sections 1-4 never run the WGSL"); }
    else {
        const w = 64, h = 32, sun = SB.sunFrom(13, 40), I = 20, twin = SB.bakeSky(w, h, sun, I, GB);
        const g = await runWgslComputeNative({ code: SB.BAKE_KERNEL_WGSL, outCount: w * h * 4, uniforms: [sun[0], sun[1], sun[2], I, GB[0], GB[1], GB[2], w, h, 0, 0, 0], workgroups: [w / 8, h / 8], requireFn: require_ });
        if (!g.ok) ok("!! the bake kernel runs", false, (g.reason || "") + " " + (g.errors || []).join(" | "));
        else {
            let worstRel = 0, worstAbs = 0, at = -1, over5 = 0, n = 0; for (let i = 0; i < twin.length; i++) { if (i % 4 === 3) continue; const d = Math.abs(g.values[i] - twin[i]), rel = d / Math.max(Math.abs(twin[i]), 0.02); n++; if (rel > worstRel) { worstRel = rel; at = i; } worstAbs = Math.max(worstAbs, d); if (rel > 0.05) over5++; }
            ok("!! the bake kernel equals the CPU bake over a 64 x 32 LUT (sun 13 deg up, 40 deg round): worst relative difference " + (worstRel * 100).toFixed(2) + "% (under 5%), " + over5 + " of " + n + " values over 5%", worstRel < 0.05 && !g.wroteNothing, "worst abs " + worstAbs.toExponential(2) + " at " + at + ", adapter " + ((g.adapter && g.adapter.description) || "?"));
            report("the f32 / f64 gap is the kernel computing h = length(p) - 6.36e6 in single precision (ulp 0.5 m): the same arithmetic upstream's fragment shader runs on a GPU.");
        }
    }
}

console.log(`\nskyBake-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
exitCleanly(fails === 0 ? 0 : 1);
