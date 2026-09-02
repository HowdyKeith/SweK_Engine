// WebGLEngine/render/physicsTsl.mjs -- v4321, v4329 (the fleets' looks and shells moved out to render/fleetTsl.mjs)
//
// PHYSICS AS TSL NODES, THE OTHER TWO (docs/TSL-ROADMAP.md step 5): swk_lyapunov's exponent (render/lyapunovWgsl.mjs,
// physics/chaos/logistic.js) and the Heidler return-stroke current (render/heidlerWgsl.mjs, physics/discharge/
// heidler.mjs) as TSL functions any node material can take, with the SAME keys the WGSL and GLSL are held to: ln 2
// at r = 4, and the lightning's peak over i0 an exact 1 at the true eta and 1.0667 at the published one. The
// iteration is a TSL Loop; the constants are the modules' (interpolated, not retyped); the uniforms are labelled
// so render/tslSource.mjs can transplant the emitted fragments into gfx/device.js pipelines.
"use strict";

import { LN2, DEFAULTS as LY_DEFAULTS, PERIOD3 } from "./lyapunovWgsl.mjs";
import { PARAMS, etaStandard, truePeak } from "../physics/discharge/heidler.mjs";

export { LN2, LY_DEFAULTS, PERIOD3, PARAMS, etaStandard, truePeak };

/** lyapunov(r, x0): the logistic map iterated `warmup` then `samples` times, the mean log-slope; the counts are baked in (a Loop bound). */
export function lyapunovNodes(TSL, { samples = LY_DEFAULTS.samples, warmup = LY_DEFAULTS.warmup } = {}) {
    const { Fn, float, Loop, log, abs } = TSL;
    for (const n of ["Fn", "float", "Loop", "log", "abs"]) if (typeof TSL[n] !== "function") throw new Error(`physicsTsl: the TSL namespace has no ${n}()`);
    const lyapunov = Fn(([r, x0]) => {
        const x = float(x0).toVar();
        Loop({ start: 0, end: warmup }, () => { x.assign(r.mul(x).mul(float(1.0).sub(x))); });
        const acc = float(0.0).toVar();
        Loop({ start: 0, end: samples }, () => { acc.addAssign(log(abs(r.mul(float(1.0).sub(x.mul(2.0)))))); x.assign(r.mul(x).mul(float(1.0).sub(x))); });
        return acc.div(samples);
    });
    return { lyapunov, samples, warmup };
}
/** heidlerShape(t, t1, t2) and heidler(t, i0, t1, t2, eta): the return-stroke current, a closed form of t. */
export function heidlerNodes(TSL) {
    const { Fn, float, exp, select } = TSL;
    const heidlerShape = Fn(([t, t1, t2]) => { const x = t.div(t1).mul(t.div(t1)); return select(t.lessThanEqual(0.0), float(0.0), x.div(float(1.0).add(x)).mul(exp(t.negate().div(t2)))); });
    const heidler = Fn(([t, i0, t1, t2, eta]) => i0.div(eta).mul(heidlerShape(t, t1, t2)));
    return { heidlerShape, heidler };
}
/** The Lyapunov key: r across [rLo, rHi] (uv.x), the seed down [seedLo, seedHi] (uv.y); red+green carry (lam + 3) / 4 in 16 bits, as lyapunovWgsl's key. */
export function makeLyapunovKeyTsl(THREE, TSL, { rLo = LY_DEFAULTS.rLo, rHi = LY_DEFAULTS.rHi, seedLo = LY_DEFAULTS.seedLo, seedHi = LY_DEFAULTS.seedHi, samples = LY_DEFAULTS.samples, warmup = LY_DEFAULTS.warmup } = {}) {
    const { Fn, float, vec4, uv, uniform } = TSL;
    const { lyapunov } = lyapunovNodes(TSL, { samples, warmup });
    const uniforms = { rLo: uniform(float(rLo)).label("rLo"), rHi: uniform(float(rHi)).label("rHi"), seedLo: uniform(float(seedLo)).label("seedLo"), seedHi: uniform(float(seedHi)).label("seedHi") };
    const material = new THREE.NodeMaterial();
    material.fragmentNode = Fn(() => {
        const r = uniforms.rLo.add(uniforms.rHi.sub(uniforms.rLo).mul(uv().x));
        const x0 = uniforms.seedLo.add(uniforms.seedHi.sub(uniforms.seedLo).mul(uv().y));
        const e = lyapunov(r, x0).add(3.0).div(4.0).clamp(0.0, 1.0);
        return vec4(e.mul(255.0).floor().div(255.0), e.mul(255.0).fract(), 0.0, 1.0);
    })();
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    return { material, scene, camera, uniforms, samples, warmup };
}
export function decodeLyapunov(px, i) { return ((px[i] + px[i + 1] / 255) / 255) * 4 - 3; }
/** The Heidler key: t on a geometric grid from tLo to tHi across uv.x; red+green carry i(t) / i0 / 2 in 16 bits (the published eta's 1.0667 fits). */
export function makeHeidlerKeyTsl(THREE, TSL, { i0 = PARAMS.first.i0, t1 = PARAMS.first.t1, t2 = PARAMS.first.t2, eta = null, tLo = PARAMS.first.t1 / 50, tHi = PARAMS.first.t2 * 8 } = {}) {
    const { Fn, float, vec4, uv, uniform, exp, log } = TSL;
    const { heidler } = heidlerNodes(TSL);
    const e0 = eta == null ? truePeak(t1, t2).peak : eta;
    const uniforms = { i0: uniform(float(i0)).label("i0"), t1: uniform(float(t1)).label("t1"), t2: uniform(float(t2)).label("t2"), eta: uniform(float(e0)).label("eta"), tLo: uniform(float(tLo)).label("tLo"), tHi: uniform(float(tHi)).label("tHi") };
    const material = new THREE.NodeMaterial();
    material.fragmentNode = Fn(() => {
        const t = uniforms.tLo.mul(exp(log(uniforms.tHi.div(uniforms.tLo)).mul(uv().x)));
        const e = heidler(t, uniforms.i0, uniforms.t1, uniforms.t2, uniforms.eta).div(uniforms.i0).div(2.0).clamp(0.0, 1.0);
        return vec4(e.mul(255.0).floor().div(255.0), e.mul(255.0).fract(), 0.0, 1.0);
    })();
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    return { material, scene, camera, uniforms, trueEta: truePeak(t1, t2).peak, standardEta: etaStandard(t1, t2) };
}
export function decodeHeidler(px, i) { return ((px[i] + px[i + 1] / 255) / 255) * 2; }

// v4329 -- the looks and shells that USE these functions moved to render/fleetTsl.mjs: a shell is a fleet's
// vertex stage, not a physics function, and this module was holding three of them and five looks besides.
