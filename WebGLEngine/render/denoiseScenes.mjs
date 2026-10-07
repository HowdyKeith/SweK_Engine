// WebGLEngine/render/denoiseScenes.mjs -- the denoiser arc, round 2: the scenes, the splits and the network's inputs
//
// render/learned-denoiser-preregistration.md fixes WHAT is rendered; this is that, as code, committed and gated before
// a single dataset image exists. Two scene families from one generator, four splits on disjoint seed ranges, the
// first-hit guide buffers, the 9-channel demodulated input and the render seeds -- with the input's and the
// references' seeds distinct by construction (control C5).
//
// *** A DATASET SEED IS REFUSED UNLESS THE CALLER SAYS harvest. *** renderImages() throws for any seed in SPLITS
// without { harvest: true }, so a gate, a page or a stray experiment cannot look at the data before the harvest
// round does -- the pre-registration's whole value is that nobody saw the numbers first, and this makes "nobody"
// checkable rather than promised. The gate renders seeds outside every split.
"use strict";
import { render, intersect, cameraBasis, pixelRay } from "../physics/render/pathTracer.mjs";
import { rng } from "../physics/render/furnace.mjs";

export const IMAGE = 64;          // the pre-registration's 64 x 64
export const SPP_IN = 4;
export const SPP_REF = 1024;
export const ALBEDO_FLOOR = 0.01; // demodulation divides by max(albedo, this)
export const CHANNELS = 9;        // irradiance rgb, albedo rgb, normal xyz -- in that order

const range = (a, n) => Object.freeze(Array.from({ length: n }, (_, i) => a + i));
/** The four splits: family and the scene seeds that belong to it. The ranges do not overlap. */
export const SPLITS = Object.freeze({
    train: Object.freeze({ family: "A", seeds: range(1000, 24) }),
    val: Object.freeze({ family: "A", seeds: range(2000, 4) }),
    T1: Object.freeze({ family: "A", seeds: range(3000, 12) }),
    T2: Object.freeze({ family: "B", seeds: range(4000, 12) }),
});
const RESERVED = new Set(Object.values(SPLITS).flatMap((s) => s.seeds));
export const isDatasetSeed = (seed) => RESERVED.has(seed);

/** The render seeds of a scene: the input, the reference and the second reference -- distinct for every scene seed. */
export function renderSeeds(seed) { return { input: seed * 8 + 1, ref: seed * 8 + 2, ref2: seed * 8 + 3 }; }

/**
 * One scene of a family. Family A: a ground sphere, 3-6 Lambertian spheres, an emitter of radius 0.5, a gradient sky.
 * Family B, the transfer family: half the spheres microfacet (roughness 0.1-0.5, a tinted F0), a hard-band sky,
 * and an emitter of radius 0.25. Spheres rest on the ground and do not overlap. Deterministic in (family, seed).
 */
export function makeScene(family, seed) {
    if (family !== "A" && family !== "B") throw new Error("denoiseScenes: family is A or B, got " + family);
    const r = rng(((seed >>> 0) * 2654435761 + (family === "A" ? 17 : 29)) >>> 0);
    const U = (a, b) => a + (b - a) * r();
    const scene = [{ centre: [0, -100, 0], radius: 100, albedo: [U(0.3, 0.7), U(0.3, 0.7), U(0.3, 0.7)] }];
    const n = 3 + Math.floor(r() * 4), placed = [];
    for (let i = 0, tries = 0; placed.length < n && tries < 400; tries++) {
        const rad = U(0.25, 0.7), x = U(-1.6, 1.6), z = U(-1.6, 1.6);
        if (placed.some((p) => Math.hypot(p[0] - x, p[2] - z) < p[3] + rad + 0.05)) continue;
        placed.push([x, rad, z, rad]);
        const s = { centre: [x, rad, z], radius: rad };
        if (family === "B" && i % 2 === 1) { s.roughness = U(0.1, 0.5); s.F0 = [U(0.3, 1), U(0.3, 1), U(0.3, 1)]; }
        else s.albedo = [U(0.1, 0.9), U(0.1, 0.9), U(0.1, 0.9)];
        scene.push(s); i++;
    }
    const lightRadius = family === "A" ? 0.5 : 0.25;
    scene.push({ centre: [U(-1.5, 1.5), U(2.5, 3.5), U(-1.5, 1.5)], radius: lightRadius, albedo: 0, emit: U(4, 12) });
    let sky, skyKind;
    if (family === "A") { const a = U(0.05, 0.2), b = U(0.2, 0.6); sky = (d) => a + b * 0.5 * (d[1] + 1); skyKind = "gradient"; }
    else { const h = U(-0.1, 0.3), hi = U(0.4, 0.8), lo = U(0.02, 0.1); sky = (d) => (d[1] > h ? hi : lo); skyKind = "band"; }
    const ang = U(0, 2 * Math.PI), ringR = U(4, 5);
    const eye = [ringR * Math.cos(ang), U(1, 2), ringR * Math.sin(ang)];
    return { family, seed, scene, sky, skyKind, lightRadius, eye, look: [0, 0.4, 0], up: [0, 1, 0], fovDeg: 40 };
}

/**
 * The guide buffers at each pixel's CENTRE ray's first hit: base colour (albedo on a Lambertian surface, F0 on a
 * microfacet one, 1 where the ray meets the sky or an emitter -- neither has a surface colour to divide out) and the
 * unit normal (0 on sky). Both H x W x 3, channels last.
 */
export function guideBuffers(S, w = IMAGE, h = IMAGE) {
    const B = cameraBasis(S), albedo = new Float64Array(w * h * 3), normal = new Float64Array(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const hit = intersect(S.eye, pixelRay(x, y, 0.5, 0.5, w, h, B), S.scene), i = (y * w + x) * 3;
        let c = [1, 1, 1];
        if (hit && !hit.sphere.emit) {
            const src = hit.sphere.roughness !== undefined ? (hit.sphere.F0 ?? 1) : hit.sphere.albedo;
            c = typeof src === "number" ? [src, src, src] : src;
        }
        albedo[i] = c[0]; albedo[i + 1] = c[1]; albedo[i + 2] = c[2];
        if (hit) { normal[i] = hit.N[0]; normal[i + 1] = hit.N[1]; normal[i + 2] = hit.N[2]; }
    }
    return { albedo, normal };
}

/**
 * Render a scene's images: the 4-sample input, the 1024-sample reference and, with `ref2`, the second reference.
 * *** THROWS FOR A DATASET SEED WITHOUT { harvest: true }. *** `w`, `h` and the sample counts can be lowered for a
 * gate; the harvest uses the pre-registered defaults.
 */
export function renderImages(family, seed, { harvest = false, ref2 = false, w = IMAGE, h = IMAGE, sppIn = SPP_IN, sppRef = SPP_REF } = {}) {
    if (isDatasetSeed(seed) && !harvest) throw new Error(`denoiseScenes: seed ${seed} is a dataset seed -- rendering it needs { harvest: true }`);
    const S = makeScene(family, seed), rs = renderSeeds(seed);
    const opts = (spp, s) => ({ w, h, spp, seed: s, rgb: true, eye: S.eye, look: S.look, up: S.up, fovDeg: S.fovDeg, sky: S.sky });
    const out = { family, seed, w, h, seeds: rs, input: render(S.scene, opts(sppIn, rs.input)), ref: render(S.scene, opts(sppRef, rs.ref)), ...guideBuffers(S, w, h) };
    if (ref2) out.ref2 = render(S.scene, opts(sppRef, rs.ref2));
    return out;
}

/** The network's input: H x W x 9, [noisy irradiance rgb, albedo rgb, normal xyz], irradiance = radiance / max(albedo, floor). */
export function inputChannels(noisy, albedo, normal, w = IMAGE, h = IMAGE) {
    const x = new Float64Array(w * h * CHANNELS);
    for (let p = 0; p < w * h; p++) for (let c = 0; c < 3; c++) {
        const a = albedo[p * 3 + c];
        x[p * CHANNELS + c] = noisy[p * 3 + c] / Math.max(a, ALBEDO_FLOOR);
        x[p * CHANNELS + 3 + c] = a;
        x[p * CHANNELS + 6 + c] = normal[p * 3 + c];
    }
    return x;
}
/** Irradiance back to radiance: multiply by max(albedo, floor), the exact inverse of the division above. */
export function remodulate(irr, albedo) {
    const y = new Float64Array(irr.length);
    for (let i = 0; i < irr.length; i++) y[i] = irr[i] * Math.max(albedo[i], ALBEDO_FLOOR);
    return y;
}
