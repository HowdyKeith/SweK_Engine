// WebGLEngine/render/badTvTsl.mjs -- v4319
//
// THE FIRST TSL SHADER IN THIS TREE. badTv (felixturner/bad-tv-shader, MIT; Ashima's 2D simplex, MIT) exists
// here as a three.js ShaderMaterial (render/badTvPass.js), as a gfx/device.js pipeline in both languages
// (render/badTvDevicePass.mjs, render/badTvWgsl.mjs) and as a CPU model (render/badTvModel.mjs). This is the
// fourth form: the same arithmetic written ONCE as TSL nodes (three's shading language, vendor/three-webgpu,
// three 0.178), which three's node builders compile to WGSL on the WebGPU backend and to GLSL on the WebGL2
// backend. The tree has written every dual-language pair by hand and held the two to each other by gate; TSL
// is the other way to get a pair, and this file is the first measurement of whether it agrees with ours.
//
// The constants are interpolated from badTvModel.mjs as the other three forms do -- a retyped 0.211324865405187
// is how a port drifts. The uv is three's own (v = 0 at the BOTTOM of the quad), so against the device pass
// (framebuffer space, v = 0 at the top) the picture is the documented row-mirror (THREE_PASS_RELATION), and the
// gate applies that mirror before comparing. Nothing else about the effect is different, and the gate says how
// close the two compilers' arithmetic comes.
"use strict";

import { COARSE_FREQ, FINE_FREQ, COARSE_GAIN, FINE_GAIN, DEFAULTS } from "./badTvModel.mjs";

/** The knobs in the order the device pass takes them (KNOB_ORDER), so one packKnobs() feeds both. */
export const TSL_KNOBS = Object.freeze(["distortion", "distortion2", "speed", "rollSpeed", "time", "rows"]);

/**
 * Build the effect from a TSL namespace (vendor/three-webgpu/three.tsl.js) and a THREE (three.webgpu.js).
 * Returns { material, scene, camera, uniforms, setTime, setKnobs, setTexture }: a full-screen quad through an
 * OrthographicCamera, as badTvPass.js does, with a MeshBasicNodeMaterial whose colorNode IS the effect.
 */
export function makeBadTvTsl(THREE, TSL, { texture = null, knobs = {} } = {}) {
    const { Fn, float, vec2, vec3, vec4, uv, floor, fract, dot, max, abs, select, uniform, texture: sampleTex } = TSL;
    for (const n of ["Fn", "float", "vec2", "vec3", "vec4", "uv", "floor", "fract", "dot", "max", "abs", "select", "uniform", "texture"]) if (typeof TSL[n] !== "function") throw new Error(`badTvTsl: the TSL namespace has no ${n}()`);
    const k0 = { ...DEFAULTS, time: 0, rows: 16, ...knobs };
    const uniforms = {}; for (const n of TSL_KNOBS) uniforms[n] = uniform(float(k0[n]));

    // Ashima's 2D simplex as TSL: mod289, permute and snoise2, the WGSL's arithmetic node for node (no overloads, no
    // swizzle assignment -- vectors are rebuilt; select(cond, TRUE, FALSE) in TSL's order, the reverse of WGSL's)
    const mod289_3 = Fn(([x]) => x.sub(floor(x.mul(1.0 / 289.0)).mul(289.0)));
    const mod289_4 = Fn(([x]) => x.sub(floor(x.mul(1.0 / 289.0)).mul(289.0)));
    const permute4 = Fn(([x]) => mod289_4(x.mul(34.0).add(1.0).mul(x)));
    const snoise2 = Fn(([v]) => {
        const C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
        const i0 = floor(v.add(dot(v, C.yy)));
        const x0 = v.sub(i0).add(dot(i0, C.xx));
        const i1 = select(x0.x.greaterThan(x0.y), vec2(1.0, 0.0), vec2(0.0, 1.0));
        const x12a = x0.xyxy.add(C.xxzz);
        const x12 = vec4(x12a.xy.sub(i1), x12a.zw);
        const i = mod289_3(vec3(i0, 0.0)).xy;
        const p = permute4(permute4(vec4(vec3(0.0, i1.y, 1.0).add(i.y), 0.0)).add(vec4(vec3(0.0, i1.x, 1.0).add(i.x), 0.0))).xyz;
        const m0 = max(vec3(0.5).sub(vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw))), vec3(0.0));
        const m1 = m0.mul(m0), m2 = m1.mul(m1);
        const x = fract(p.mul(C.www)).mul(2.0).sub(1.0);
        const h = abs(x).sub(0.5);
        const ox = floor(x.add(0.5));
        const a0 = x.sub(ox);
        const m = m2.mul(float(1.79284291400159).sub(a0.mul(a0).add(h.mul(h)).mul(0.85373472095314)));
        const g = vec3(a0.x.mul(x0.x).add(h.x.mul(x0.y)), a0.y.mul(x12.x).add(h.y.mul(x12.y)), a0.z.mul(x12.z).add(h.z.mul(x12.w)));
        return dot(m, g).mul(130.0);
    });
    // badTvModel's offsetAt and sampleAt: offset * distortion * offset * distortion * offset -- the cube, in the original's order
    const offsetAt = Fn(([v]) => {
        const yt = v.sub(uniforms.time.mul(uniforms.speed));
        const coarse = snoise2(vec2(yt.mul(COARSE_FREQ), 0.0)).mul(COARSE_GAIN);
        const cubed = coarse.mul(uniforms.distortion).mul(coarse).mul(uniforms.distortion).mul(coarse);
        return cubed.add(snoise2(vec2(yt.mul(FINE_FREQ), 0.0)).mul(uniforms.distortion2).mul(FINE_GAIN));
    });
    const sampleAt = Fn(([p]) => vec2(fract(p.x.add(offsetAt(p.y))), fract(p.y.sub(uniforms.time.mul(uniforms.rollSpeed)))));

    const material = new THREE.MeshBasicNodeMaterial();
    let tex = texture;
    const rebuild = () => { material.colorNode = tex ? sampleTex(tex, sampleAt(uv())) : vec4(sampleAt(uv()), 0.0, 1.0); material.needsUpdate = true; };
    rebuild();
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    return {
        material, scene, camera, uniforms, snoise2, offsetAt, sampleAt,
        setTime(t) { uniforms.time.value = t; },
        setKnobs(k) { for (const n of TSL_KNOBS) if (k[n] != null) uniforms[n].value = k[n]; },
        setTexture(t) { tex = t; rebuild(); },
    };
}
/** A nearest, repeating DataTexture from RGBA8 bytes, as the device pass samples its source (flipY off: row 0 is the top). */
export function sourceTexture(THREE, { pixels, width, height }) {
    const t = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.flipY = false; t.needsUpdate = true;
    return t;
}
