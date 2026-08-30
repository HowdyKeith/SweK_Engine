// FILE: render/badTvPass.js -- v4182
//
// felixturner/bad-tv-shader ported to this tree. MIT (c) Felix Turner -- www.airtight.cc
// simplex noise (c) 2011 Ian McEwan, Ashima Arts -- MIT -- github.com/ashima/webgl-noise
//
// Horizontal tearing from a tracking error, plus vertical roll. The SIGNAL failing, where render/crtModel.js
// is the TUBE -- see badTvModel.mjs for why they compose in that order and only that order.
//
// *** THE NOISE COMES FROM shaders/ashimaNoise.js AND THAT IS THE POINT OF THIS FILE EXISTING NOW. *** v4177
// extracted Ashima's 2D simplex into a shared chunk specifically for this port, which left SNOISE2 with NO
// CONSUMER for a round -- the orphan shape referenceKind exists to catch, created in anticipation. This
// closes it.
//
// *** AND THAT EXTRACTION IS ALSO WHERE THE ROUND'S NEAR-MISS LIVES. *** v4177 nearly consolidated the 2D and
// 3D simplex on the belief they were the same forty lines. They are not, and the measured difference is not
// subtle: snoise2 returns [-0.98, +0.99] while this tree's snoise3 returns about +/-4.2. Since the coarse
// offset below is CUBED, feeding the 3D function in would have multiplied the tear by roughly 4^3 -- about
// sixty-four times too far, a picture torn clean off the screen rather than a wobble.
//
// Written as an ESM factory taking THREE as a PARAMETER, like makeAquarellePass and makeSwiftShaderPass, so
// this module imports neither three nor a renderer.
"use strict";

import { SNOISE2_BLOCK, ASHIMA_CREDIT } from "../shaders/ashimaNoise.js";
import { DEFAULTS, COARSE_FREQ, FINE_FREQ, COARSE_GAIN, FINE_GAIN, COMPOSE_ORDER } from "./badTvModel.mjs";

export const VERTEX_SHADER = [
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = uv;",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
    "}",
].join("\n");

/**
 * Built FROM the model's constants rather than typed out again -- a second hand-written 0.2 or 50.0 is how a
 * shader and its CPU reference start disagreeing while both look reasonable.
 */
export const FRAGMENT_SHADER = [
    ASHIMA_CREDIT,
    "uniform sampler2D tDiffuse;",
    "uniform float time;",
    "uniform float distortion;",
    "uniform float distortion2;",
    "uniform float speed;",
    "uniform float rollSpeed;",
    "varying vec2 vUv;",
    ...SNOISE2_BLOCK,
    "void main() {",
    "  vec2 p = vUv;",
    "  float yt = p.y - time * speed;",
    // the noise is sampled along a LINE -- y varies, x is pinned at 0 -- which is why the artifact is
    // horizontal tearing and not a general warp.
    "  float offset = snoise2(vec2(yt * " + COARSE_FREQ.toFixed(1) + ", 0.0)) * " + COARSE_GAIN.toFixed(1) + ";",
    // offset^3 * distortion^2, written as the original writes it. See badTvModel.mjs: cubing is what makes
    // the picture sit still and then tear hard, where a linear term would wobble constantly and never tear.
    "  offset = offset * distortion * offset * distortion * offset;",
    "  offset += snoise2(vec2(yt * " + FINE_FREQ.toFixed(1) + ", 0.0)) * distortion2 * " + FINE_GAIN.toFixed(3) + ";",
    // fract on BOTH axes: the tear wraps around the edge, the roll wraps top to bottom.
    "  gl_FragColor = texture2D(tDiffuse, vec2(fract(p.x + offset), fract(p.y - time * rollSpeed)));",
    "}",
].join("\n");

/**
 * @param THREE the three namespace, as a parameter
 * @param opts  { distortion, distortion2, speed, rollSpeed } -- defaults from badTvModel.DEFAULTS
 * @returns { material, uniforms, scene, camera, quad, setTime, render, set, dispose }
 */
export function makeBadTvPass(THREE, opts = {}) {
    if (!THREE || !THREE.ShaderMaterial) throw new TypeError("makeBadTvPass: pass the three namespace in as the first argument");

    const uniforms = {
        tDiffuse:    { value: opts.texture || null },
        time:        { value: 0 },
        distortion:  { value: opts.distortion ?? DEFAULTS.distortion },
        distortion2: { value: opts.distortion2 ?? DEFAULTS.distortion2 },
        speed:       { value: opts.speed ?? DEFAULTS.speed },
        rollSpeed:   { value: opts.rollSpeed ?? DEFAULTS.rollSpeed },
    };

    const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX_SHADER, fragmentShader: FRAGMENT_SHADER });
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(quad);

    return {
        material, uniforms, scene, camera, quad,
        /** The original takes a steadily increasing float. Seconds, not milliseconds -- at ms the roll is a blur. */
        setTime(seconds) { uniforms.time.value = seconds; },
        set(name, value) { if (uniforms[name]) uniforms[name].value = value; },
        render(renderer, target = null) {
            const prev = renderer.getRenderTarget();
            renderer.setRenderTarget(target);
            renderer.render(scene, camera);
            renderer.setRenderTarget(prev);
        },
        dispose() { try { quad.geometry.dispose(); material.dispose(); } catch (e) {} },
    };
}

export { DEFAULTS, COMPOSE_ORDER };
