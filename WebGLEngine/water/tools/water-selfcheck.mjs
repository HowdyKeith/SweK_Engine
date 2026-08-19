// WebGLEngine/water/tools/water-selfcheck.mjs — proves the water math (the GLSL mirrors it).
//
// No GL context: pure numbers. Wave propagation + decay, Fresnel endpoints + monotonicity, Snell-law
// refraction, normals, and caustic brightness. The render is RIG-ONLY; this is the part that must be
// right regardless.
//
//   run: node water/tools/water-selfcheck.mjs

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const m = require("../waterMath.js");

let pass = 0, total = 0;
const ok = (n, c, d = "") => { total++; if (c) { pass++; console.log(`  ok   ${n}`); } else { console.log(`  FAIL ${n}${d ? "  -- " + d : ""}`); } };
const near = (a, b, e = 1e-4) => Math.abs(a - b) <= e;

console.log("water-selfcheck: wave equation");
{
    const W = 32, H = 32;
    const h = new Float32Array(W * H), v = new Float32Array(W * H);
    h[16 * W + 16] = 1.0;                                  // a single drop in the centre
    const startEdge = Math.abs(h[16 * W + 20]);
    for (let s = 0; s < 12; s++) m.waveStep(h, v, W, H, 0.995);
    ok("a drop propagates outward to a still cell", Math.abs(h[16 * W + 20]) > startEdge);
    let finite = true; for (let i = 0; i < h.length; i++) if (!Number.isFinite(h[i])) finite = false;
    ok("field stays finite (no blow-up) after 12 steps", finite);

    // long run with damping -> disturbance decays toward zero
    const d12 = m.totalDisturbance(h);
    for (let s = 0; s < 4000; s++) m.waveStep(h, v, W, H, 0.99);
    const dLate = m.totalDisturbance(h);
    ok("damping bleeds energy away over time", dLate < d12, `${d12.toFixed(2)} -> ${dLate.toFixed(4)}`);
    ok("field still finite after 4000 steps", Number.isFinite(dLate));
}

console.log("water-selfcheck: Fresnel (Schlick)");
{
    const R0 = m.reflectance0(1.0, 1.333);
    ok("water R0 is about 0.02", near(R0, 0.02, 0.005), R0.toFixed(4));
    ok("head-on reflectance == R0", near(m.fresnelSchlick(1, R0), R0));
    ok("grazing reflectance == 1", near(m.fresnelSchlick(0, R0), 1));
    ok("reflectance rises from head-on to grazing", m.fresnelSchlick(0.2, R0) > m.fresnelSchlick(0.9, R0));
}

console.log("water-selfcheck: refraction (Snell)");
{
    const eta = 1.0 / 1.333;
    const straightDown = m.refract([0, -1, 0], [0, 1, 0], eta);
    ok("head-on ray passes straight through", near(straightDown[0], 0) && near(straightDown[2], 0) && straightDown[1] < 0);

    // 45deg incidence: sin(theta_t) = eta*sin(theta_i); check Snell holds
    const inv = 1 / Math.SQRT2;
    const I = [inv, -inv, 0];                              // 45deg into a flat surface
    const r = m.refract(I, [0, 1, 0], eta);
    const sinI = inv, sinT = Math.abs(r[0]);
    ok("Snell's law holds (sinT ~ eta*sinI)", near(sinT, eta * sinI, 1e-3), `${sinT.toFixed(4)} vs ${(eta*sinI).toFixed(4)}`);
    ok("refracted ray still heads downward", r[1] < 0);

    // total internal reflection from below at a steep angle returns null
    const tir = m.refract([0.99, 0.14, 0], [0, -1, 0], 1.333);   // water->air, shallow
    ok("total internal reflection returns null", tir === null);
}

console.log("water-selfcheck: normals");
{
    const flat = m.heightNormal(0.5, 0.5, 0.5, 0.5, 1);
    ok("flat water -> up normal", near(flat[0], 0) && near(flat[2], 0) && near(flat[1], 1));
    const slope = m.heightNormal(1.0, 0.0, 0.5, 0.5, 1);       // higher on the left
    ok("higher-on-left tilts the normal +x", slope[0] > 0);
    ok("normal is unit length", near(Math.hypot(slope[0], slope[1], slope[2]), 1));
}

console.log("water-selfcheck: caustics (differential area)");
{
    ok("focused light (area shrinks) is brighter", m.causticBrightness(1.0, 0.25) > 1);
    ok("spread light (area grows) is dimmer", m.causticBrightness(1.0, 4.0) < 1);
    ok("brightness is clamped, not infinite", m.causticBrightness(1.0, 0) <= 8);
    const hit = m.refractToFloor([0, 1, 0], [0.2, -1, 0], -1);
    ok("refracted ray lands on the floor plane", near(hit[1], -1) && hit[0] > 0);
}

console.log(`\nwater-selfcheck: ${pass}/${total} passed`);
if (pass !== total && typeof process !== "undefined" && process.exit) process.exit(1);
