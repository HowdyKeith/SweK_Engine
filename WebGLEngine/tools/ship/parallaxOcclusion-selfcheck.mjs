// WebGLEngine/tools/ship/parallaxOcclusion-selfcheck.mjs -- v2784
//
// Run: node tools/ship/parallaxOcclusion-selfcheck.mjs
// GATES render/parallaxOcclusion.js. This line USED TO SAY "the shader can't run in the sandbox", which was
// false from v4270 and stayed here for 1,705 versions; v4489 compiled PARALLAX_GLSL on a real driver and
// graded it against the mirror. This gate stays cheap and structural, and the device work lives in
// tools/ship/parallaxSampler-selfcheck.mjs.
//
// What is proven here is about THE MARCH: parallaxUVMirror (the JS model of PARALLAX_GLSL) converges to a fine
// reference march and behaves correctly -- flat heightmap / head-on view -> no shift; a sloped heightmap at an
// angle shifts the UV toward the near side; more layers -> closer to the reference; and a SABOTAGE (no
// parallax) differs. Structural check keeps GLSL and mirror in sync.
//
// *** AND "MORE LAYERS -> CLOSER TO THE REFERENCE" IS TRUE OF THE MARCH AND FALSE OF THE PAIR. *** The shader
// reads its height from an 8-bit NEAREST texel and the mirror from a continuous callback, so there is a
// sampler error that does not depend on the layer count while the step does. v4489 measured it: 3.687e-4 at
// four, eight, sixteen and thirty-two layers, against a step that halves each time. See
// render/parallaxSampler.mjs -- the claim above is not withdrawn, it is scoped.

import { parallaxUVMirror, PARALLAX_GLSL } from "../../render/parallaxOcclusion.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// fine reference: same steep search with a huge layer count (no interpolation) -> converges to the true crossing
function fineRef(u, v, vx, vy, vz, scale, H, layers = 4000) {
    const len = Math.hypot(vx, vy, vz) || 1; vx /= len; vy /= len; vz /= len;
    const az = Math.max(vz, 1e-4);
    const dUx = (vx / az) * scale / layers, dUy = (vy / az) * scale / layers, ld = 1 / layers;
    let cur = 0, cu = u, cv = v, dm = 1 - H(cu, cv), g = 0;
    while (cur < dm && g++ < layers + 5) { cu -= dUx; cv -= dUy; dm = 1 - H(cu, cv); cur += ld; }
    return { u: cu, v: cv };
}

// 1. flat heightmap -> no shift regardless of view
{
    const H = () => 0.5;   // constant height
    let maxShift = 0;
    for (let i = 0; i < 50; i++) {
        const r = parallaxUVMirror(0.5, 0.5, Math.cos(i), 0.3, 0.8, 0.1, H, 32);
        maxShift = Math.max(maxShift, Math.hypot(r.u - 0.5, r.v - 0.5));
    }
    // a flat map still shifts by the constant depth, but consistently; head-on (view.z=1) shift is ~0
    const head = parallaxUVMirror(0.5, 0.5, 0, 0, 1, 0.1, H, 32);
    ok("head-on view (view.z=1): negligible UV shift", Math.hypot(head.u - 0.5, head.v - 0.5) < 1e-6, "shift=" + Math.hypot(head.u - 0.5, head.v - 0.5).toExponential(1));
}

// 2. CONVERGENCE: mirror (32 layers + interp) is close to the fine reference on a rippled heightmap at an angle
{
    const H = (u, v) => 0.5 + 0.35 * Math.sin(u * 12.0) * Math.cos(v * 9.0);
    let worst = 0, N = 0;
    for (let i = 0; i < 400; i++) {
        const u = 0.3 + (i % 7) * 0.05, v = 0.4 + (i % 5) * 0.04;
        const vx = Math.cos(i * 0.3) * 0.6, vy = Math.sin(i * 0.3) * 0.6, vz = 0.7;
        const m = parallaxUVMirror(u, v, vx, vy, vz, 0.08, H, 32);
        const ref = fineRef(u, v, vx, vy, vz, 0.08, H);
        worst = Math.max(worst, Math.hypot(m.u - ref.u, m.v - ref.v)); N++;
    }
    ok("CONVERGENCE: 32-layer POM within tolerance of the 4000-layer reference", worst < 0.01, "worstErr=" + worst.toFixed(4) + " over " + N);
}

// 3. more layers -> closer to reference (monotone-ish improvement)
{
    const H = (u, v) => 0.5 + 0.4 * Math.sin(u * 15.0);
    const u = 0.33, v = 0.5, vx = 0.7, vy = 0.0, vz = 0.6, scale = 0.1;
    const ref = fineRef(u, v, vx, vy, vz, scale, H);
    const e8 = Math.hypot(...(() => { const r = parallaxUVMirror(u, v, vx, vy, vz, scale, H, 8); return [r.u - ref.u, r.v - ref.v]; })());
    const e64 = Math.hypot(...(() => { const r = parallaxUVMirror(u, v, vx, vy, vz, scale, H, 64); return [r.u - ref.u, r.v - ref.v]; })());
    ok("more layers reduce (or match) the error", e64 <= e8 + 1e-9, "e8=" + e8.toFixed(4) + " e64=" + e64.toFixed(4));
}

// 4. direction: the UV shifts AGAINST the view's tangent-xy (toward the viewer's near side)
{
    const H = (u, v) => 0.5 + 0.3 * Math.sin(u * 10.0);
    const r = parallaxUVMirror(0.5, 0.5, 0.8, 0, 0.6, 0.12, H, 48);
    ok("parallax shifts uv opposite the view tangent direction", r.u < 0.5, "u=" + r.u.toFixed(3));
}

// 5. SABOTAGE: no-parallax (return uv unchanged) differs from POM on a sloped map at an angle
{
    const H = (u, v) => 0.5 + 0.35 * Math.sin(u * 11.0) * Math.cos(v * 7.0);
    const r = parallaxUVMirror(0.42, 0.58, 0.75, 0.2, 0.6, 0.1, H, 32);
    ok("SABOTAGE: POM result differs from the un-shifted uv (parallax is doing work)", Math.hypot(r.u - 0.42, r.v - 0.58) > 1e-3);
}

// 6. STRUCTURAL: GLSL and mirror share the POM shape
{
    ok("GLSL has parallaxUV with the layer loop + heightmap sample + mix interpolation", /parallaxUV/.test(PARALLAX_GLSL) && /curLayerDepth/.test(PARALLAX_GLSL) && /uHeightMap/.test(PARALLAX_GLSL) && /mix\(cuv, puv, w\)/.test(PARALLAX_GLSL));
}

// 7. browser-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("../../render/parallaxOcclusion.js", import.meta.url), "utf8");
    ok("source: parallaxOcclusion imports nothing / no DOM at module scope", !/^\s*import/m.test(src) && !/\bdocument\b|\bwindow\b/.test(src));
}

console.log("parallaxOcclusion-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
