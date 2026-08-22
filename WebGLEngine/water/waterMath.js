// WebGLEngine/water/waterMath.js — the CPU reference for the WebGL2 water module.
//
// The GLSL in water.html mirrors THIS math exactly, so water/tools/water-selfcheck.mjs can prove the
// algorithm (wave propagation, Fresnel, refraction, normals, caustic brightness) headlessly even though
// the actual render is RIG-ONLY. These are the standard, textbook techniques popularized by Evan
// Wallace's WebGL Water and jeantimex's Three.js port -- implemented here originally, not copied.
//
// CJS so the selfcheck can require it. No dependencies.

"use strict";

// --- Heightfield wave equation (ping-pong step) ------------------------------------------------------
// The classic discretized 2D wave equation: velocity accumulates toward the neighbour average, is damped,
// then integrated into height. Stable for damping in (0,1). h and v are Float32Array of length w*h.
function waveStep(h, v, w, ht, damping = 0.995) {
    const idx = (x, y) => y * w + x;
    const nh = new Float32Array(h);   // read h, write nh, so a step is not order-dependent
    const nv = new Float32Array(v);
    for (let y = 0; y < ht; y++) {
        for (let x = 0; x < w; x++) {
            const i = idx(x, y);
            const hL = h[idx(Math.max(x - 1, 0), y)];
            const hR = h[idx(Math.min(x + 1, w - 1), y)];
            const hU = h[idx(x, Math.max(y - 1, 0))];
            const hD = h[idx(x, Math.min(y + 1, ht - 1))];
            const avg = (hL + hR + hU + hD) * 0.25;
            let vel = v[i] + (avg - h[i]) * 2.0;   // pull toward the neighbourhood average
            vel *= damping;                        // lose energy each step
            nv[i] = vel;
            nh[i] = h[i] + vel;                    // integrate
        }
    }
    h.set(nh); v.set(nv);
    return { h, v };
}

// Sum of |height| -- an energy-ish proxy the selfcheck uses to prove a drop propagates then decays.
function totalDisturbance(h) { let s = 0; for (let i = 0; i < h.length; i++) s += Math.abs(h[i]); return s; }

// Surface normal from the 4 neighbour heights (central differences). scale trades slope for flatness.
function heightNormal(hL, hR, hU, hD, scale = 1) {
    const nx = hL - hR, ny = 2 * scale, nz = hU - hD;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
}

// --- Optics ------------------------------------------------------------------------------------------
// Schlick's approximation: reflectance rises from R0 at head-on to 1.0 at grazing.
function fresnelSchlick(cosTheta, R0) {
    const c = Math.min(Math.max(cosTheta, 0), 1);
    return R0 + (1 - R0) * Math.pow(1 - c, 5);
}

// R0 from two indices of refraction (air ~1.0, water ~1.333).
function reflectance0(n1, n2) { const r = (n1 - n2) / (n1 + n2); return r * r; }

// GLSL-style refract(). I incoming (unit), N normal (unit), eta = n1/n2. Returns null on total internal
// reflection. Matches the GLSL builtin so the shader and this reference agree.
function refract(I, N, eta) {
    const dot = I[0] * N[0] + I[1] * N[1] + I[2] * N[2];
    const k = 1 - eta * eta * (1 - dot * dot);
    if (k < 0) return null;   // total internal reflection
    const s = eta * dot + Math.sqrt(k);
    return [eta * I[0] - s * N[0], eta * I[1] - s * N[1], eta * I[2] - s * N[2]];
}

// --- Caustics ----------------------------------------------------------------------------------------
// Differential-area method: a patch of light of area a0 on the surface lands on the floor as area a1.
// Brightness is a0/a1 -- light focused into a smaller area is brighter, spread out is dimmer.
function causticBrightness(areaBefore, areaAfter) {
    if (areaAfter <= 1e-9) return 8;              // fully focused -> clamp to a bright cap
    return Math.min(areaBefore / areaAfter, 8);
}

// Where a refracted ray from surface point P (with dir D, D.y < 0) meets a floor at y = floorY.
function refractToFloor(P, D, floorY) {
    if (D[1] >= -1e-6) return null;               // not heading down
    const t = (floorY - P[1]) / D[1];
    return [P[0] + D[0] * t, floorY, P[2] + D[2] * t];
}

module.exports = {
    waveStep, totalDisturbance, heightNormal,
    fresnelSchlick, reflectance0, refract,
    causticBrightness, refractToFloor,
};
