// WebGLEngine/render/lightsDemoScene.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE MANY-LIGHTS DEMO'S SCENE, ONCE, for lights-demo.html (WebGL2) and lights-gpu.html (WebGPU) -- so the two pages, and tools/ship/clusteredLights-selfcheck.mjs, see the same
// ground, pillars and lights. sceneOf(n) -> { GROUND, pillars, N, lightsAt(t) }: a 30 x 30 ground slab, a 5 x 5 field of pillars, n moving coloured point lights (no shadows),
// two spot lights and one point light that cast shadows; lightsAt(t, { sun, cookie }) adds a dim moonlit sun with cascaded shadows and a stained-glass cookie on the second
// spot (2026-11-22). Seeded: the same scene every time.
"use strict";
export function sceneOf(n = 64) {
    let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

    // the scene: a ground slab and a 5 x 5 field of pillars (boxes: centre, size)
    const GROUND = { position: [0, -0.05, 0], size: [30, 0.1, 30] }, pillars = [];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { const h = 0.6 + 1.2 * rnd(); pillars.push({ position: [(i - 2) * 2.2, h / 2, (j - 2) * 2.2], size: [0.45, h, 0.45] }); }
    const N = n, moving = Array.from({ length: N }, (_, k) => ({ r: 1 + 5.5 * rnd(), w: (0.15 + 0.35 * rnd()) * (rnd() < 0.5 ? -1 : 1), a0: 2 * Math.PI * rnd(), y: 0.25 + 1.2 * rnd(), range: 2 + 2 * rnd(), color: (() => { const h = rnd() * 6, c = [Math.abs(h - 3) - 1, 2 - Math.abs(h - 2), 2 - Math.abs(h - 4)].map((v) => Math.min(1, Math.max(0, v))); return c; })(), intensity: 2.2 }));
    function lightsAt(t, { sun = true, cookie = true } = {}) {
        const L = moving.map((m) => ({ type: "point", position: [m.r * Math.cos(m.a0 + m.w * t), m.y, m.r * Math.sin(m.a0 + m.w * t)], range: m.range, color: m.color, intensity: m.intensity, shadow: false }));
        L.push({ type: "spot", position: [-4.5, 4.2, -4.5], direction: [0.55 + 0.25 * Math.cos(0.3 * t), -1, 0.6 + 0.25 * Math.sin(0.3 * t)], range: 12, innerAngle: 0.32, outerAngle: 0.45, color: [1, 0.92, 0.8], intensity: 9, shadow: true, priority: 2 });
        L.push({ type: "spot", position: [5, 3.6, 3.5], direction: [-0.8, -1, -0.5], range: 11, innerAngle: 0.28, outerAngle: 0.4, color: [0.7, 0.85, 1], intensity: 8, shadow: true, priority: 2, ...(cookie ? { cookie: 2 } : {}) });   // a stained-glass cookie (render/clusteredLights.mjs makeCookieAtlas, tile 2)
        L.push({ type: "point", position: [1.1 * Math.cos(0.4 * t), 1.35, 1.1 + 1.1 * Math.sin(0.4 * t)], range: 6.5, color: [1, 0.55, 0.3], intensity: 5, shadow: true, priority: 1 });
        if (sun) L.push({ type: "directional", direction: [-0.45, -1, -0.35], color: [0.55, 0.62, 0.85], intensity: 0.45, shadow: true });   // moonlight: cascaded shadows
        return L;
    }
    return { GROUND, pillars, N, lightsAt };
}
