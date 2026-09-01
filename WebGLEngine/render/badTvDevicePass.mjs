// WebGLEngine/render/badTvDevicePass.mjs -- v4271
//
// badTv AS A gfx/device.js PIPELINE -- the first thing in this tree that hands that abstraction both languages
// and is verified on both backends.
//
// ---- WHY THIS FILE AND NOT AN EDIT TO badTvPass.js -------------------------------------------------------------
//
// render/badTvPass.js is a THREE.ShaderMaterial factory: it takes the three namespace, builds a material, an
// OrthographicCamera and a quad. gfx/device.js is a different
// API -- a pipeline descriptor and a pass with clear/use/vertices/draw -- and its whole premise is that a
// render written once runs on either runtime. Those are two shapes for the same effect, and merging them would
// make the three.js path depend on the device path for no benefit. badTvPass.js is untouched.
//
// *** AND A CORRECTION THIS FILE OWES: v4271 AND v4272 BOTH CALLED badTvPass.js "what main.js actually draws
// with". IT HAS NO CALLERS AT ALL. *** makeBadTvPass is referenced by its own gate and by
// tools/ship/badTvThreeParity-selfcheck.mjs and nowhere else; main.js does not contain the string "badTv"
// outside its version note. The claim was inferred from the file's SHAPE -- a THREE factory in render/, beside
// passes that do have callers -- and asserted three times without being checked. For comparison, measured at
// v4273: makeCrtPass has ten call sites across fallout.html, ui/crtToggle.js and pipboy-models.html;
// makeSwiftShaderPass six, makeAquarellePass four, makeTransitionPass two; makeBadTvPass, makeGrassField and
// makeHoloFoil have none.
//
// That changes what the v4272 mirror finding MEANS rather than whether it is true. There is no incumbent to
// migrate and no existing picture to preserve: the first real consumer chooses the convention.
//
// ---- *** WHAT v4269 MEASURED AND THIS FILE IS THE FIRST ANSWER TO *** -------------------------------------------
//
// 134 modules in this tree ship GLSL, 39 ship WGSL, and five ship both -- of which three are pages and two are
// shader modules that happened to be written twice. Nothing had ever been handed to gfx/device.js carrying
// both languages on purpose. This does, and v4271 renders it on BOTH backends and compares the frames.
//
// ---- THE ORIENTATION RULE, WHICH I GOT WRONG TWICE AND MEASURED RIGHT ONCE -------------------------------------
//
// *** uv IS FRAMEBUFFER SPACE IN BOTH SHADERS: uv.y = 0 IS THE TOP ROW OF THE IMAGE, AND BOTH VERTEX STAGES
// FLIP v OUT OF NDC IDENTICALLY. *** That sentence is the end of an argument I lost to the measurement twice.
//
// First mistake: v4270 proved the WGSL computes badTvModel's coordinates to 3.2e-8 and could say nothing about
// which way is up, because a coordinate is a pair of numbers until something samples a real texture with it.
// The first rendered comparison disagreed with the model by 126 of 255 and agreed EXACTLY at (1 - v).
//
// Second mistake, and it is the one worth keeping: the first draft of THIS file argued, in a confident comment,
// that the vertex stages must DIFFER -- WebGPU's texture row 0 is the top while readPixels hands back rows
// bottom-first, so surely one side compensates. Rendered both ways and diffed: every one of 4,096 pixels
// differed, in whole-texel steps that grew with the row, which is the signature of the two backends evaluating
// the tear at different v rather than of a sampling wobble. The readback flip already lives in the harness, so
// flipping again in the shader flipped twice. With both vertex stages doing the same thing, the two backends
// agree on every pixel exactly.
//
// *** AND THIS IS NOT COSMETIC, BECAUSE THE ROLL READS v *** -- badTvSampleAt computes
// fract(v - time * rollSpeed), so an orientation that is "wrong but symmetric" ships an effect that rolls the
// wrong way and looks entirely plausible. The reason to write the rule down is that reasoning about it
// produced a confident wrong answer and rendering it produced the right one in a single run.

"use strict";

import { FRAGMENT_WGSL, packKnobs, KNOB_ORDER, UV_CONVENTION } from "./badTvWgsl.mjs";
import { COARSE_FREQ, FINE_FREQ, COARSE_GAIN, FINE_GAIN } from "./badTvModel.mjs";
import { NOISE_COMMON, SNOISE2, ASHIMA_CREDIT } from "../shaders/ashimaNoise.js";

/**
 * The GLSL half, standalone -- not the three.js one.
 *
 * badTvPass.js's shaders rely on three to supply `uv`, `projectionMatrix` and the version directive. A device
 * pipeline has none of those, so the vertex stage builds a full-screen triangle from gl_VertexID exactly as
 * the WGSL does, and the constants come from badTvModel the same way.
 */
export const VERTEX_GLSL = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  // Same oversized triangle as the WGSL, from the vertex id alone -- no buffer, no seam.
  vec2 p = vec2(float((gl_VertexID << 1) & 2) * 2.0 - 1.0, float(gl_VertexID & 2) * 2.0 - 1.0);
  gl_Position = vec4(p, 0.0, 1.0);
  // Flipped, exactly as the WGSL flips it -- see UV_CONVENTION and the header note on why an earlier draft
  // of this file claimed the opposite and was measured wrong.
  vUv = vec2((p.x + 1.0) * 0.5, 1.0 - (p.y + 1.0) * 0.5);
}`;

export const FRAGMENT_GLSL = `#version 300 es
precision highp float;
${ASHIMA_CREDIT}
${NOISE_COMMON.join("\n")}
${SNOISE2.join("\n")}
uniform sampler2D tDiffuse;
uniform float time;
uniform float distortion;
uniform float distortion2;
uniform float speed;
uniform float rollSpeed;
in vec2 vUv;
out vec4 fragColor;

float badTvOffsetAt(float v) {
  float yt = v - time * speed;
  float offset = snoise2(vec2(yt * ${COARSE_FREQ.toFixed(1)}, 0.0)) * ${COARSE_GAIN};
  offset = offset * distortion * offset * distortion * offset;
  offset += snoise2(vec2(yt * ${FINE_FREQ.toFixed(1)}, 0.0)) * distortion2 * ${FINE_GAIN};
  return offset;
}

void main() {
  vec2 uv = vec2(fract(vUv.x + badTvOffsetAt(vUv.y)), fract(vUv.y - time * rollSpeed));
  fragColor = texture(tDiffuse, uv);
}`;

/**
 * The descriptor gfx/device.js wants. Both languages, so requestDevice() may pick either and the pipeline
 * survives -- which is the exact condition v4269 found only five files in the tree meet.
 *
 * No vertex buffer: both vertex stages synthesise the triangle, so `attributes` is empty and `stride` is 0.
 */
export function badTvPipelineDesc() {
    return {
        shaders: { wgsl: FRAGMENT_WGSL, glsl: { vertex: VERTEX_GLSL, fragment: FRAGMENT_GLSL } },
        vs: "vs", fs: "fs",
        attributes: [], stride: 0,
        uniforms: KNOB_ORDER.map((name) => ({ name, type: "f32" })),
        uvConvention: UV_CONVENTION,
    };
}

/**
 * *** THE SHIPPING three.js PASS RENDERS THIS EFFECT MIRRORED RELATIVE TO THIS ONE, EXACTLY. ***
 *
 * v4272 rendered render/badTvPass.js -- the file main.js imports -- through a real WebGLRenderer against the
 * same source texture, and compared it to this pipeline's WebGL2 output. As rendered they disagree on every
 * one of 4,096 pixels, worst 255 of 255. Row-mirror three's frame and they agree EXACTLY, 0 of 255.
 *
 * NEITHER IS WRONG. badTvPass.js reads three's own `uv` attribute, where v = 0 is the bottom of the quad, which
 * is the standard three post-processing convention and correct for an EffectComposer. This pipeline defines uv
 * in framebuffer space because that is the one convention where WebGPU and WebGL2 agree without a caller
 * thinking about it. They are opposite, and both are internally exact against badTvModel.
 *
 * *** SO A MIGRATION IS NOT A DROP-IN. *** Swapping badTvPass for this pipeline flips the picture AND, because
 * badTvSampleAt computes fract(v - time * rollSpeed), reverses the roll -- and a mirrored ROLLING image looks
 * like a working effect with the tape running the other way. The transformation is exact and known, which is
 * the whole reason it is written here as data rather than left to be rediscovered.
 */
export const THREE_PASS_RELATION = Object.freeze({
    other: "render/badTvPass.js",
    relation: "vertical mirror -- row y here equals row (height - 1 - y) there",
    measuredAt: "v4272",
    asRendered: "255 of 255 -- every pixel differs",
    rowMirrored: "0 of 255 across 4096 pixels",
    whyNeitherIsWrong: "three's uv attribute has v = 0 at the quad's bottom; this pipeline uses framebuffer " +
                       "space, v = 0 at the top row, because that is where WebGPU and WebGL2 agree",
    migrationHazard: "the roll reverses as well as the image flipping, and both look plausible",
    gate: "tools/ship/badTvThreeParity-selfcheck.mjs",
});

/** Knobs for either backend, in one place so the two cannot be fed different numbers. */
export { packKnobs, KNOB_ORDER, UV_CONVENTION };
