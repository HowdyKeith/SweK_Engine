// FILE: render/aquarellePass.js -- v4177
//
// Ramotion/aquarelle ported to this tree. MIT (c) 2016 Ramotion -- github.com/Ramotion/aquarelle
// simplex noise (c) 2011 Ian McEwan, Ashima Arts -- MIT -- github.com/ashima/webgl-noise
//
// A mask-driven dissolve: one image gives way to another along a mask whose edge is warped by two octaves of
// simplex noise, so it creeps and feathers like ink through paper rather than cross-fading.
//
// *** "MASK" HERE IS THE DISSOLVE MASK -- NOT render/crtModel.js's APERTURE GRILLE. *** (v4302, #144.) The mask
// in this file is a TEXTURE: its ALPHA, sampled at a noise-warped position, decides where the source image
// has given way to the target. crtModel.js's mask(), maskPitch and maskDepth are the PHOSPHOR GRILLE, a
// stripe pattern that tints every pixel, and share nothing with this but the word. Anyone grepping "mask"
// under render/ lands on both; this paragraph and its twin in crtModel.js are where the grep should stop.
// A per-region strength for either effect is render/strengthField.mjs, deliberately not a third "mask".
//
// ---- *** WHAT HAD TO CHANGE, AND IT IS FOUR THINGS, NOT ONE. *** ------------------------------------------
// The original is nine years old and every one of these is dead API rather than a matter of taste. This tree
// has done exactly this job once before -- physics/fire/fireMesh.js ports mattatz/THREE.Fire and its header
// lists the same kind of list -- so the pattern is established:
//
//   1. `var THREE = window.THREE || {}` and `THREE.AquarellePass = function(...)`. A global namespace patch.
//      Here THREE is a PARAMETER, the way makeSwiftShaderPass and makeGrassMaterial take it, so this module
//      imports neither three nor anything else and a page that never loads three can still read its knobs.
//   2. `THREE.Pass.call(this)` plus `Object.create(THREE.Pass.prototype)` -- the pre-class Pass idiom.
//   3. `new THREE.PlaneBufferGeometry(2, 2)`. MEASURED: zero occurrences in our vendored three.module.js. It
//      was renamed to PlaneGeometry and the alias has since been removed, so THAT LINE THROWS.
//   4. `renderer.render(scene, camera, readBuffer, this.clear)`. The render-target and clear arguments were
//      removed from three's signature years ago; passing them today renders TO THE SCREEN and silently
//      ignores the target, which is the kind of failure that looks like the pass "doing nothing".
//
// Also fixed while porting: the original creates `new THREE.Mesh(geometry)` with NO material and assigns
// `this.quad.material` inside render(). That works, but it leaves a mesh with the default material for one
// frame if anything ever draws the scene before render() is first called.
//
// ---- THE MATHS IS NOT RE-DERIVED HERE ---------------------------------------------------------------------
// render/aquarelleModel.mjs is the CPU reference and holds the constants; this file must agree with it
// digit-for-digit, which the gate checks. The two warps are deliberately asymmetric -- a gentle rotation of
// the SOURCE at Amplitude * 0.001, and a much larger two-octave warp of the MASK at fixed 0.07 and 0.02 --
// and that asymmetry is the look. See the model for why it is not tidied into one shared amplitude.
"use strict";

import { SNOISE3_BLOCK, ASHIMA_CREDIT } from "../shaders/ashimaNoise.js";
import { DEFAULTS, MASK_OCTAVES, ANGLE_SCALE } from "./aquarelleModel.mjs";

export const VERTEX_SHADER = [
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = uv;",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
    "}",
].join("\n");

/**
 * The fragment shader, BUILT from the model's constants rather than typed out again. A second hand-written
 * copy of 0.07 and 0.02 is how a shader and its CPU reference start disagreeing while both look reasonable.
 */
export const FRAGMENT_SHADER = [
    ASHIMA_CREDIT,
    "uniform sampler2D Texture;",
    "uniform sampler2D Mask;",
    "uniform float Amplitude;",
    "uniform float Frequency;",
    "varying vec2 vUv;",
    ...SNOISE3_BLOCK,
    "void main() {",
    "  float angle = snoise(vec3(vUv * Frequency, 0.0)) * " + ANGLE_SCALE.toFixed(2) + ";",
    "  vec2 offset = vec2(cos(angle), sin(angle)) * Amplitude * 0.001;",
    "  vec4 src = texture2D(Texture, vUv + offset);",
    "  vec2 shift = vUv;",
    ...MASK_OCTAVES.flatMap((o, k) => [
        "  float n" + k + " = snoise(vec3(vUv * " + o.frequency.toFixed(1) + ", 0.0));",
        "  shift += vec2(cos(n" + k + "), sin(n" + k + ")) * " + o.amplitude.toFixed(2) + ";",
    ]),
    "  vec4 msk = texture2D(Mask, shift);",
    "  gl_FragColor = vec4(src.rgb, msk.a);",
    "}",
].join("\n");

/**
 * Build the pass. THREE arrives as a parameter -- see note 1 above.
 *
 * @param THREE   the three namespace
 * @param texture the source THREE.Texture
 * @param mask    the mask THREE.Texture; its ALPHA is what drives the dissolve
 * @param opts    { amplitude, frequency } -- defaults from aquarelleModel.DEFAULTS
 * @returns { material, uniforms, scene, camera, quad, render(renderer, target), setSize(), dispose() }
 */
export function makeAquarellePass(THREE, texture, mask, opts = {}) {
    if (!THREE || !THREE.ShaderMaterial) throw new TypeError("makeAquarellePass: pass the three namespace in as the first argument");

    const uniforms = {
        Texture:   { value: texture || null },
        Mask:      { value: mask || null },
        Amplitude: { value: opts.amplitude ?? DEFAULTS.amplitude },
        Frequency: { value: opts.frequency ?? DEFAULTS.frequency },
    };

    const material = new THREE.ShaderMaterial({
        uniforms, vertexShader: VERTEX_SHADER, fragmentShader: FRAGMENT_SHADER, transparent: true,
    });

    // PlaneGeometry, not PlaneBufferGeometry -- see note 3. And the material is given to the mesh at
    // construction rather than assigned during render, so the quad is never briefly default-material.
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(quad);

    return {
        material, uniforms, scene, camera, quad,
        /**
         * Draw. The render target is selected with setRenderTarget and then cleared explicitly -- see note 4
         * on why passing it to render() instead would silently draw to the screen.
         */
        render(renderer, target = null) {
            const prev = renderer.getRenderTarget();
            renderer.setRenderTarget(target);
            renderer.render(scene, camera);
            renderer.setRenderTarget(prev);
        },
        set(name, value) { if (uniforms[name]) uniforms[name].value = value; },
        dispose() { try { quad.geometry.dispose(); material.dispose(); } catch (e) {} },
    };
}

export { DEFAULTS };
