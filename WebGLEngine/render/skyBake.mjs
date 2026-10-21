// WebGLEngine/render/skyBake.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// *** SLICE 4 OF snowflow-lift: THE NISHITA SKY, BAKED INTO AN EQUIRECTANGULAR LUT, FROM Noniv/snowflow_demo (MIT, vendor/snowflow). ***
// An analytic single-scattering sky (Rayleigh + Mie, 32 view samples on a t^2.5 power law, 8 light samples each, an isotropic multiple-scattering term, a ground-bounce handover below the horizon, and a pull toward
// the achromatic over the last dozen degrees) integrated by nishitaSky, baked ONCE into a latitude-longitude texture and re-baked only when the sun moves. Everything that wants the sky -- a sky dome, aerial
// perspective, image-based lighting -- reads the same LUT, so the horizon a surface fades into IS the horizon the sky draws.
//
// OURS: nishitaSky (CPU twin, f64), bakeSky (a w x h LUT as a Float32Array of rgba), aerialTransmittance (the closed-form height-falloff extinction), BAKE_KERNEL_WGSL (upstream's function bodies as a compute kernel
// writing the LUT into a storage buffer), dirToLatLong / latLongToDir. NOT LIFTED: upstream's CPU solve of groundBounce (the bounce is an INPUT here), its SH projection for image-based lighting, the sky material that
// adds the solar disc and aureole, and applyAerial's inscatter lookups (they sample the LUT with mips). NOT DONE: drawing the sky from this on a GPU.
"use strict";

const PI = 3.14159265359;
const EARTH_R = 6360000, ATMOS_R = 6420000, H_RAYLEIGH = 8000, H_MIE = 1200, MIE_G = 0.76, MS_BOOST = 1.5;
const BETA_R = [5.8e-6, 13.5e-6, 33.1e-6], BETA_M = [21e-6, 21e-6, 21e-6];
export const STEPS = 32, LIGHT_STEPS = 8, DIST_POWER = 2.5, SHADOW_FILL = 0.5;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** distance to the far intersection of a ray with a sphere at the origin, or -1 */
export function raySphereFar(o, d, r) { const b = dot(o, d), c = dot(o, o) - r * r, q = b * b - c; return q < 0 ? -1 : -b + Math.sqrt(q); }
export const phaseRayleigh = (mu) => (3 / (16 * PI)) * (1 + mu * mu);
export const phaseMie = (mu, g) => { const g2 = g * g, n = (1 - g2) * (1 + mu * mu), d = (2 + g2) * Math.pow(1 + g2 - 2 * g * mu, 1.5); return (3 / (8 * PI)) * n / d; };

/** upstream's nishitaSky. rayDir and sunDir are unit vectors (y up); sunDir points TOWARD the sun; groundBounce is the radiance leaving the ground, rgb. Returns linear rgb. */
export function nishitaSky(rayDir, sunDir, sunIntensity, groundBounce) {
    const origin = [0, EARTH_R + 800, 0];
    const atmosDist = raySphereFar(origin, rayDir, ATMOS_R);
    if (atmosDist < 0) return [0, 0, 0];
    const groundDist = raySphereFar(origin, rayDir, EARTH_R), bIn = dot(origin, rayDir), cIn = dot(origin, origin) - EARTH_R * EARTH_R, discr = bIn * bIn - cIn;
    let march = atmosDist;
    if (discr > 0) { const near = -bIn - Math.sqrt(discr); if (near > 0) march = near; }
    const mu = dot(rayDir, sunDir), pr = phaseRayleigh(mu), pm = phaseMie(mu, MIE_G);
    const sumR = [0, 0, 0], sumM = [0, 0, 0], shadR = [0, 0, 0], shadM = [0, 0, 0];
    let odR = 0, odM = 0, tPrev = 0;
    for (let i = 0; i < STEPS; i++) {
        const tNext = march * Math.pow((i + 1) / STEPS, DIST_POWER), stepLen = tNext - tPrev, mid = tPrev + stepLen * 0.5;
        const p = [origin[0] + rayDir[0] * mid, origin[1] + rayDir[1] * mid, origin[2] + rayDir[2] * mid];
        tPrev = tNext;
        const h = Math.hypot(p[0], p[1], p[2]) - EARTH_R, dR = Math.exp(-h / H_RAYLEIGH) * stepLen, dM = Math.exp(-h / H_MIE) * stepLen;
        odR += dR; odM += dM;
        const lightDist = raySphereFar(p, sunDir, ATMOS_R), lStep = lightDist / LIGHT_STEPS;
        let lR = 0, lM = 0, occluded = false;
        for (let j = 0; j < LIGHT_STEPS; j++) {
            const k = lStep * (j + 0.5), lp = [p[0] + sunDir[0] * k, p[1] + sunDir[1] * k, p[2] + sunDir[2] * k], lh = Math.hypot(lp[0], lp[1], lp[2]) - EARTH_R;
            if (lh < 0) { occluded = true; break; }
            lR += Math.exp(-lh / H_RAYLEIGH) * lStep; lM += Math.exp(-lh / H_MIE) * lStep;
        }
        if (occluded) {
            for (let c = 0; c < 3; c++) { const attenV = Math.exp(-(BETA_R[c] * odR + BETA_M[c] * 1.1 * odM)); shadR[c] += attenV * dR; shadM[c] += attenV * dM; }
            continue;
        }
        for (let c = 0; c < 3; c++) { const tau = BETA_R[c] * (odR + lR) + BETA_M[c] * 1.1 * (odM + lM), atten = Math.exp(-tau); sumR[c] += atten * dR; sumM[c] += atten * dM; }
    }
    const col = [0, 0, 0], msPhase = 1 / (4 * PI);
    for (let c = 0; c < 3; c++) {
        col[c] = sunIntensity * (sumR[c] * BETA_R[c] * pr + sumM[c] * BETA_M[c] * pm);
        col[c] += sunIntensity * ((sumR[c] + shadR[c] * SHADOW_FILL) * BETA_R[c] * MS_BOOST + (sumM[c] + shadM[c] * SHADOW_FILL) * BETA_M[c] * 0.4) * msPhase;
    }
    if (discr > 0 && groundDist > 0) { const downT = 1 - smoothstep(-0.030, -0.005, rayDir[1]); for (let c = 0; c < 3; c++) col[c] = col[c] + (groundBounce[c] - col[c]) * downT; }
    const grazing = 1 - smoothstep(0, 0.26, Math.abs(rayDir[1])), pale = col[0] * 0.30 + col[1] * 0.42 + col[2] * 0.28, tint = [0.97, 1.0, 1.06];
    for (let c = 0; c < 3; c++) col[c] = col[c] + (pale * tint[c] - col[c]) * (grazing * 0.82);
    return col;
}

/** equirectangular mapping, y up: u = atan2(x, z) / 2pi + 0.5, v = acos(y) / pi */
export function dirToLatLong(d) { return [Math.atan2(d[0], d[2]) / (2 * PI) + 0.5, Math.acos(Math.min(1, Math.max(-1, d[1]))) / PI]; }
export function latLongToDir(u, v) { const phi = (u - 0.5) * 2 * PI, theta = v * PI, st = Math.sin(theta); return [st * Math.sin(phi), Math.cos(theta), st * Math.cos(phi)]; }

/** Bake the LUT: w x h texels, rgba f32 (alpha 1), texel centres at (i + 0.5) / w. Upstream bakes this in a fragment shader; this is the reference. */
export function bakeSky(w, h, sunDir, sunIntensity, groundBounce) {
    const out = new Float32Array(w * h * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = nishitaSky(latLongToDir((i + 0.5) / w, (j + 0.5) / h), sunDir, sunIntensity, groundBounce), o = (j * w + i) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 1; }
    return out;
}

/** upstream's aerialTransmittance: height-falloff extinction, the integral of exp(-k y) along the segment in closed form. */
export function aerialTransmittance(camPos, worldPos, density, heightFalloff, fogStart) {
    const d = [worldPos[0] - camPos[0], worldPos[1] - camPos[1], worldPos[2] - camPos[2]], len = Math.hypot(d[0], d[1], d[2]), dist = Math.max(0, len - fogStart);
    if (dist <= 0) return 1;
    const dy = d[1], k = heightFalloff;
    let integral;
    if (Math.abs(dy) < 0.01) integral = Math.exp(-k * camPos[1]) * dist;
    else { integral = (Math.exp(-k * camPos[1]) - Math.exp(-k * worldPos[1])) / (k * dy) * len; integral = integral * (dist / Math.max(1e-4, len)); }
    return Math.exp(-density * Math.max(0, integral));
}

/**
 * The bake as a compute kernel: one thread per texel, rgba f32 into a storage buffer. Bindings: 0 out (rw, w*h*4), 1 params (uniform: sunDir.xyz, sunIntensity, groundBounce.xyz, w, h as 8 floats + pad).
 * Dispatch (ceil(w / 8), ceil(h / 8)).
 */
export const BAKE_KERNEL_WGSL = /* wgsl */ `
struct Params { sunDir: vec3f, sunIntensity: f32, groundBounce: vec3f, w: f32, h: f32, pad0: f32, pad1: f32, pad2: f32 };
@group(0) @binding(0) var<storage, read_write> outBuf: array<f32>;
@group(0) @binding(1) var<uniform> U: Params;

const PI: f32 = 3.14159265359;
const EARTH_R: f32 = 6360000.0;
const ATMOS_R: f32 = 6420000.0;
const H_RAYLEIGH: f32 = 8000.0;
const H_MIE: f32 = 1200.0;
const BETA_R: vec3f = vec3f(5.8e-6, 13.5e-6, 33.1e-6);
const BETA_M: vec3f = vec3f(21e-6, 21e-6, 21e-6);
const MIE_G: f32 = 0.76;
const MS_BOOST: f32 = 1.5;

fn raySphereFar(origin: vec3f, dir: vec3f, radius: f32) -> f32 {
    let b = dot(origin, dir);
    let c = dot(origin, origin) - radius * radius;
    let d = b * b - c;
    if (d < 0.0) { return -1.0; }
    return -b + sqrt(d);
}

fn phaseRayleigh(mu: f32) -> f32 {
    return (3.0 / (16.0 * PI)) * (1.0 + mu * mu);
}

fn phaseMie(mu: f32, g: f32) -> f32 {
    let g2 = g * g;
    let n = (1.0 - g2) * (1.0 + mu * mu);
    let d = (2.0 + g2) * pow(1.0 + g2 - 2.0 * g * mu, 1.5);
    return (3.0 / (8.0 * PI)) * n / d;
}

fn nishitaSky(rayDir: vec3f, sunDir: vec3f, sunIntensity: f32, groundBounce: vec3f) -> vec3f {
    let origin = vec3f(0.0, EARTH_R + 800.0, 0.0);
    let atmosDist = raySphereFar(origin, rayDir, ATMOS_R);
    if (atmosDist < 0.0) { return vec3f(0.0); }
    let groundDist = raySphereFar(origin, rayDir, EARTH_R);
    let bIn = dot(origin, rayDir);
    let cIn = dot(origin, origin) - EARTH_R * EARTH_R;
    let discr = bIn * bIn - cIn;
    var march = atmosDist;
    if (discr > 0.0) {
        let near = -bIn - sqrt(discr);
        if (near > 0.0) { march = near; }
    }
    const STEPS: i32 = 32;
    const LIGHT_STEPS: i32 = 8;
    const DIST_POWER: f32 = 2.5;
    let mu = dot(rayDir, sunDir);
    let pr = phaseRayleigh(mu);
    let pm = phaseMie(mu, MIE_G);
    var sumR = vec3f(0.0);
    var sumM = vec3f(0.0);
    var shadR = vec3f(0.0);
    var shadM = vec3f(0.0);
    var odR = 0.0;
    var odM = 0.0;
    var tPrev = 0.0;
    for (var i = 0; i < STEPS; i++) {
        let tNext = march * pow(f32(i + 1) / f32(STEPS), DIST_POWER);
        let stepLen = tNext - tPrev;
        let p = origin + rayDir * (tPrev + stepLen * 0.5);
        tPrev = tNext;
        let h = length(p) - EARTH_R;
        let dR = exp(-h / H_RAYLEIGH) * stepLen;
        let dM = exp(-h / H_MIE) * stepLen;
        odR += dR;
        odM += dM;
        let lightDist = raySphereFar(p, sunDir, ATMOS_R);
        let lStep = lightDist / f32(LIGHT_STEPS);
        var lR = 0.0;
        var lM = 0.0;
        var occluded = false;
        for (var j = 0; j < LIGHT_STEPS; j++) {
            let lp = p + sunDir * (lStep * (f32(j) + 0.5));
            let lh = length(lp) - EARTH_R;
            if (lh < 0.0) { occluded = true; break; }
            lR += exp(-lh / H_RAYLEIGH) * lStep;
            lM += exp(-lh / H_MIE) * lStep;
        }
        if (occluded) {
            let attenV = exp(-(BETA_R * odR + BETA_M * 1.1 * odM));
            shadR += attenV * dR;
            shadM += attenV * dM;
            continue;
        }
        let tau = BETA_R * (odR + lR) + BETA_M * 1.1 * (odM + lM);
        let atten = exp(-tau);
        sumR += atten * dR;
        sumM += atten * dM;
    }
    var col = sunIntensity * (sumR * BETA_R * pr + sumM * BETA_M * pm);
    const SHADOW_FILL: f32 = 0.5;
    let msPhase = 1.0 / (4.0 * PI);
    col += sunIntensity * (
              (sumR + shadR * SHADOW_FILL) * BETA_R * MS_BOOST
            + (sumM + shadM * SHADOW_FILL) * BETA_M * 0.4
          ) * msPhase;
    if (discr > 0.0 && groundDist > 0.0) {
        let downT = 1.0 - smoothstep(-0.030, -0.005, rayDir.y);
        col = mix(col, groundBounce, downT);
    }
    let grazing = 1.0 - smoothstep(0.0, 0.26, abs(rayDir.y));
    let pale = dot(col, vec3f(0.30, 0.42, 0.28));
    col = mix(col, vec3f(pale) * vec3f(0.97, 1.0, 1.06), grazing * 0.82);
    return col;
}

fn latLongToDir(uv: vec2f) -> vec3f {
    let phi = (uv.x - 0.5) * 2.0 * PI;
    let theta = uv.y * PI;
    let st = sin(theta);
    return vec3f(st * sin(phi), cos(theta), st * cos(phi));
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let w = u32(U.w);
    let h = u32(U.h);
    if (gid.x >= w || gid.y >= h) { return; }
    let uv = (vec2f(f32(gid.x), f32(gid.y)) + 0.5) / vec2f(U.w, U.h);
    let dir = latLongToDir(uv);
    let col = nishitaSky(dir, U.sunDir, U.sunIntensity, U.groundBounce);
    let o = (gid.y * w + gid.x) * 4u;
    outBuf[o] = col.x;
    outBuf[o + 1u] = col.y;
    outBuf[o + 2u] = col.z;
    outBuf[o + 3u] = 1.0;
}
`;

/**
 * three.js's equirectangular convention (EquirectangularReflectionMapping, a texture with flipY): u = atan2(dir.z, dir.x) / 2pi + 0.5, v (up) = asin(dir.y) / pi + 0.5. The LUT above is upstream's own
 * mapping (u from atan2(x, z), v from acos(y), top row = zenith); a page that hands the sky to three.js bakes in THIS one instead, so the dome appears the right way round. `row0IsTop` = canvas order.
 */
export function threeEquirectDir(u, vUp) { const phi = (u - 0.5) * 2 * PI, lat = (vUp - 0.5) * PI, c = Math.cos(lat); return [c * Math.cos(phi), Math.sin(lat), c * Math.sin(phi)]; }
export function bakeSkyThree(w, h, sunDir, sunIntensity, groundBounce) {
    const out = new Float32Array(w * h * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = nishitaSky(threeEquirectDir((i + 0.5) / w, 1 - (j + 0.5) / h), sunDir, sunIntensity, groundBounce), o = (j * w + i) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 1; }
    return out;
}
/** linear radiance -> display bytes: exposure, Reinhard, sRGB gamma. Returns Uint8ClampedArray rgba. */
export function lutToRGBA8(lut, exposure = 1) {
    const out = new Uint8ClampedArray(lut.length);
    for (let i = 0; i < lut.length; i += 4) for (let c = 0; c < 3; c++) { const x = lut[i + c] * exposure, t = x / (1 + x); out[i + c] = Math.round(255 * Math.pow(Math.max(0, t), 1 / 2.2)); out[i + 3] = 255; }
    return out;
}

/** a sun direction from elevation and azimuth in degrees (azimuth 0 along +z, turning toward +x) */
export function sunFrom(elevDeg, azimDeg) { const e = elevDeg * PI / 180, a = azimDeg * PI / 180; return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)]; }

export function reportLines() {
    const sun = sunFrom(13, 0), z = nishitaSky([0, 1, 0], sun, 20, [0.6, 0.65, 0.75]), hz = nishitaSky([0, 0.02, -1], sun, 20, [0.6, 0.65, 0.75]);
    return ["[skyBake] Nishita single scattering (" + STEPS + " view x " + LIGHT_STEPS + " light samples, t^" + DIST_POWER + " spacing) baked to an equirectangular LUT; sun 13 deg: zenith rgb " + z.map((v) => v.toFixed(2)).join(" ") + ", anti-sun horizon " + hz.map((v) => v.toFixed(2)).join(" "),
        "  the ground bounce is an input (upstream solves it on the CPU against this LUT; not lifted)"];
}
