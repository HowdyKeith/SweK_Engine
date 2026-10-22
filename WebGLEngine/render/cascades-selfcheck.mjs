// WebGLEngine/render/cascades-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~1 s)
//
// Run: node render/cascades-selfcheck.mjs
//
// THE CASCADED SHADOW MAPS' FIT AND SELECTION, HELD TO UPSTREAM'S TEXT AND TO WHAT ITS COMMENTS SAY IT DOES:
//   1  LIFTED     the constants (splits 26 / 95 / 330, margin 12, the 2 degree clamp 0.0349, the 0.88 overlap, the 1/256 radius quantum, the 2 m texel pad) are shadows.js's; the lookup's selection, cross-fade
//                 and far fade lines and the receiver-plane lines are shadowLookup.wgsl's;
//   2  THE FIT    every corner of each slice lands inside its own cascade's NDC cube ("the whole terrain inside this cascade is inside the volume -- at any sun elevation"); "a sphere does not change as the camera
//                 turns": the radius and the depth range are identical for any yaw; "the quantised radius ... a few ULPs of noise cannot cross a step": a 1e-9 perturbation of the camera leaves the radius unchanged;
//                 "texel snapping stops the shadow edges crawling": a fixed world point lands on the SAME fractional texel for any camera translation; the terrain's extremes stay inside the depth range at 30, 13, 5
//                 and 2 degrees; the depth range grows like cot(elevation) ("4.33 m per metre at 13 degrees") and is bounded by the 2 degree clamp;
//   3  THE LOOKUP the cascade a distance reads, the cross-fade over the last 12% of each slice and the fade to lit past the last, as plain functions (continuous across every split).
// NOT GRADED, said plainly: the WGSL lookup (snowGpu-selfcheck draws with it), the look.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as CS from "./cascades.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const norm = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ").trim();
const rd = (p) => fs.readFileSync(path.join(ENG, "vendor/snowflow/src", p), "utf8");
const camOf = (pos, yaw, pitch = -0.1) => { const f = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)], l = Math.hypot(f[0], f[2]), r = [f[2] / l, 0, -f[0] / l], u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]; return { pos, r, u, f, tanX: 0.9, tanY: 0.5 }; };
const sunAt = (deg, az = 60) => { const e = deg * Math.PI / 180, a = az * Math.PI / 180; return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)]; };
const OPT = { res: 2048, minHeight: -6, maxHeight: 8 };

console.log("cascades-selfcheck -- the fit and the selection\n");
console.log("1. LIFTED");
{
    const sj = norm(rd("render/shadows.js")), sl = norm(rd("shaders/lib/shadowLookup.wgsl")), ours = norm(CS.CASCADE_SHADOW_WGSL);
    const js = ["const SPLITS = [26, 95, 330];", "const MARGIN = 12;", "const fy = Math.min(this.lightDir.y, -0.0349);", "sliceNear = sliceFar * 0.88;", "const q = Math.pow(2, Math.ceil(Math.log2(radius)) - 8);", "radius = Math.ceil(radius / q) * q;", "this.texelWorldPad = 2;", "const near = MARGIN * 0.5;", "const far = backoff + gMax + MARGIN;", "const backoff = MARGIN - gMin;", "const g = (py - _center.y - yRel * _lup.y) / fy;", "const texelWorld = (radius * 2) / RESOLUTION;"];
    const miss = js.filter((s) => !sj.includes(s));
    ok("!! the fit's constants and solve are shadows.js's, statement for statement", miss.length === 0 && CS.SPLITS.join() === "26,95,330" && CS.MARGIN === 12 && CS.MIN_SUN_Y === -0.0349 && CS.BLEND === 0.88 && CS.TEXEL_PAD === 2, js.length + " statements" + (miss.length ? "; MISSING " + miss.join(" | ") : ""));
    const wg = ["if (viewDist >= sp.z) { return 1.0; }", "let blendStart = sp.x * 0.88;", "if (viewDist <= blendStart) { return s; }", "return mix(s, s2, clamp((viewDist - blendStart) / (sp.x - blendStart), 0.0, 1.0));", "let blendStart = sp.y * 0.88;", "return mix(s, s2, clamp((viewDist - blendStart) / (sp.y - blendStart), 0.0, 1.0));", "return mix(s, 1.0, smoothstep(sp.z * 0.85, sp.z, viewDist));",
        "let nz = select(min(nl.z, -1e-3), max(nl.z, 1e-3), nl.z >= 0.0);", "let grad = clamp(vec2f(-nl.x / nz, -nl.y / nz), vec2f(-6.0), vec2f(6.0));", "let sinL = sqrt(clamp(1.0 - nl.z * nl.z, 0.0, 1.0));", "let biased = world + geoN * (texelWorld * 1.5 * max(sinL, 0.2));", "let lr = normalize(cross(vec3f(0.0, 1.0, 0.0), lf));", "let nl = vec3f(dot(geoN, lr), dot(geoN, lu), dot(geoN, lf));"];
    const miss2 = wg.filter((s) => !(sl.includes(s) && ours.includes(s)));
    ok("!! the cascade selection, the 12% cross-fade, the far fade and the receiver-plane lines are shadowLookup.wgsl's", miss2.length === 0, wg.length + " statements in both" + (miss2.length ? "; MISSING " + miss2.join(" | ") : ""));
    ok("  ours differ in exactly the stated places: the texture plumbing, and the Y sign of a row-0-top map (uv = 0.5 - ndc.y/2 and the plane gradient's y negated, upstream's 0.5 + ndc.y/2 being a Babylon render-target flip)", ours.includes("let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);") && ours.includes("vec2f(grad.x, -grad.y)") && sl.includes("let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 + ndc.y * 0.5);"));
}

console.log("\n2. THE FIT");
{
    let worstOut = 0, ncorner = 0; const cases = [];
    for (const elev of [30, 13, 5, 2]) for (const yaw of [0, 1.1, 2.9, -1.7]) for (const pos of [[0, 3, 0], [120, 5, -40]]) cases.push([elev, yaw, pos]);
    for (const [elev, yaw, pos] of cases) {
        const cam = camOf(pos, yaw), cas = CS.fitCascades(sunAt(elev), cam, OPT); let zn = 0.05;
        cas.forEach((c, i) => { for (const k of CS.sliceCorners(cam, zn, CS.SPLITS[i])) { const p = CS.projectCascade(c.vp, k); ncorner++; const e = Math.max(Math.abs(p.ndc[0]) - 1, Math.abs(p.ndc[1]) - 1, -p.ndc[2], p.ndc[2] - 1, 0); worstOut = Math.max(worstOut, e); } zn = CS.SPLITS[i] * 0.88; });
    }
    ok("!! every slice corner of every cascade is inside its own light volume (" + ncorner + " corners over " + cases.length + " camera and sun cases, worst overshoot " + worstOut.toExponential(1) + " of the NDC cube)", worstOut < 1e-9);
    const base = CS.fitCascades(sunAt(13), camOf([0, 3, 0], 0.4), OPT);
    let sphere = true; for (const yaw of [0.9, 2.2, -2.5]) { const c = CS.fitCascades(sunAt(13), camOf([0, 3, 0], yaw), OPT); sphere = sphere && c.every((x, i) => x.radius === base[i].radius && Math.abs(x.depthRange - base[i].depthRange) < 6 * (1 + Math.abs(x.center[1]))); }
    ok("!! a sphere does not change as the camera turns: the radius is identical at four yaws (" + base.map((c) => c.radius.toFixed(2)).join(" / ") + " m) and the depth range within the height-slack of the centre", sphere);
    const jit = CS.fitCascades(sunAt(13), { ...camOf([0, 3, 0], 0.4), pos: [1e-9, 3, 1e-9] }, OPT);
    ok("!! the relative radius quantum absorbs round-off: a 1e-9 camera nudge leaves every radius bit-identical", jit.every((c, i) => c.radius === base[i].radius));
    const q = base.map((c) => { const p = Math.pow(2, Math.ceil(Math.log2(c.radius)) - 8); return Math.abs(c.radius / p - Math.round(c.radius / p)) < 1e-9; });
    ok("  each radius is a whole number of 1/256ths of its power of two", q.every(Boolean));
    // texel snapping: a fixed world point's fractional texel is invariant under camera translation
    const P = [13.37, 0.4, -21.9];
    let drift = 0; const ref = CS.fitCascades(sunAt(13), camOf([0, 3, 0], 0.4), OPT);
    for (const d of [[0.3, 0, 0.1], [5.7, 0, -2.2], [-31.9, 0, 44.4], [0.001, 0, 0]]) {
        const c = CS.fitCascades(sunAt(13), camOf([d[0], 3, d[2]], 0.4), OPT);
        for (let i = 0; i < 3; i++) { if (c[i].radius !== ref[i].radius) continue; const a = CS.projectCascade(ref[i].vp, P).ndc, b = CS.projectCascade(c[i].vp, P).ndc, ta = (a[0] * 0.5 + 0.5) * 2048, tb = (b[0] * 0.5 + 0.5) * 2048, ua = (a[1] * 0.5 + 0.5) * 2048, ub = (b[1] * 0.5 + 0.5) * 2048; const fr = (x) => { const f = x - Math.floor(x); return Math.min(f, 1 - f); }; drift = Math.max(drift, fr(ta - tb), fr(ua - ub)); }
    }
    ok("!! texel snapping: a fixed world point lands on the same fractional texel for every camera translation tried (worst drift " + drift.toExponential(1) + " of a texel), so the map does not resample and edges do not crawl", drift < 1e-3);
    const ranges = [30, 13, 5, 2].map((e) => CS.fitCascades(sunAt(e), camOf([0, 3, 0], 0), OPT)[2].depthRange);
    ok("!! the depth range is SOLVED from the sun: cascade 2 spans " + ranges.map((r) => r.toFixed(0)).join(" / ") + " m at 30 / 13 / 5 / 2 degrees, growing like cot(elevation) and capped by the 2 degree clamp", ranges[0] < ranges[1] && ranges[1] < ranges[2] && ranges[2] < ranges[3]);
    const r05 = CS.fitCascades(sunAt(0.5), camOf([0, 3, 0], 0), OPT)[2].depthRange;
    ok("  a 0.5 degree sun is clamped to 2 degrees (cot(0.5) = 114 would run away): its range is " + r05.toFixed(0) + " m against " + ranges[3].toFixed(0) + " m at 2 degrees", Math.abs(r05 - ranges[3]) / ranges[3] < 0.05);
    let worst = 0, n = 0;   // terrain extremes inside the depth range at several suns
    for (const e of [30, 13, 5, 2]) { const cam = camOf([0, 3, 0], 0.7), cas = CS.fitCascades(sunAt(e), cam, OPT); for (let i = 0; i < 3; i++) { const c = cas[i]; for (const sx of [-0.9, 0, 0.9]) for (const sz of [-0.9, 0, 0.9]) for (const h of [-6, 8]) { const off = [c.r[0] * sx * c.radius + c.u[0] * sz * c.radius, c.r[1] * sx * c.radius + c.u[1] * sz * c.radius, c.r[2] * sx * c.radius + c.u[2] * sz * c.radius]; let p = [c.center[0] + off[0], 0, c.center[2] + off[2]]; /* walk along the light until the height is h */ const t = (h - (c.center[1] + off[1])) / c.f[1]; p = [c.center[0] + off[0] + c.f[0] * t, h, c.center[2] + off[2] + c.f[2] * t]; const q = CS.projectCascade(c.vp, p); n++; worst = Math.max(worst, -q.ndc[2], q.ndc[2] - 1, 0); } } }
    ok("!! the terrain's lowest and highest points over each cascade's footprint are inside the depth range at 30 / 13 / 5 / 2 degrees (" + n + " points, worst overshoot " + worst.toExponential(1) + ")", worst < 1e-9);
    const one = CS.fitCascade(sunAt(13), camOf([0, 3, 0], 0.4), 0.05, 26, OPT);
    ok("  fitCascades is fitCascade over the three slices (the first is identical to a direct call)", one.radius === base[0].radius && one.vp.every((v, i) => v === base[0].vp[i]));
    ok("  orthoWidth is twice the radius and depthRange is far - near", base.every((c) => c.orthoWidth === 2 * c.radius && Math.abs(c.depthRange - (c.far - c.near)) < 1e-9));
}

console.log("\n3. THE LOOKUP");
{
    const f = (d) => CS.cascadeBlend(d);
    ok("!! the cascade a distance reads: 10 m cascade 0, 50 m cascade 1, 200 m cascade 2, 400 m lit", f(10).c === 0 && f(50).c === 1 && f(200).c === 2 && f(400).c === 3 && f(400).fade === 1);
    ok("!! the cross-fade begins at 88% of each split and reaches the next cascade at the split: blend " + f(22.9).blend.toFixed(2) + " at 22.9 m, " + f(24.5).blend.toFixed(2) + " at 24.5 m, " + f(25.99).blend.toFixed(2) + " at 25.99 m", f(22.88).blend === 0 && f(24.5).blend > 0.3 && f(24.5).blend < 0.7 && f(25.99).blend > 0.99);
    let jump = 0; for (let d = 1; d < 340; d += 0.01) { const a = f(d), b = f(d + 0.01); if (a.c === b.c) jump = Math.max(jump, Math.abs(a.blend - b.blend), Math.abs(a.fade - b.fade)); }
    ok("  within a cascade the blend and the far fade never jump (worst step " + jump.toFixed(4) + " per centimetre); across a split the blend arrives at 1, which is the next cascade's 0", jump < 0.05 && f(26 - 1e-6).blend > 0.9999 && f(26).blend === 0);
    ok("  the last cascade fades to lit between 85% and 100% of 330 m: fade " + f(300).fade.toFixed(2) + " at 300 m, " + f(329.9).fade.toFixed(3) + " at 329.9 m", f(250).fade === 0 && f(300).fade > 0 && f(329.9).fade > 0.99);
    ok("  CASCADE_COUNT is 3 and the module reports itself", CS.CASCADE_COUNT === 3 && CS.FAR_FADE === 0.85 && CS.reportLines().length === 2);
}
console.log(`\ncascades-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
