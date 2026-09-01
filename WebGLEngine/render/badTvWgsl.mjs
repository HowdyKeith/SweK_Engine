// WebGLEngine/render/badTvWgsl.mjs -- v4270
//
// felixturner/bad-tv-shader, in WGSL. MIT (c) Felix Turner -- www.airtight.cc
// simplex noise (c) 2011 Ian McEwan, Ashima Arts -- MIT -- github.com/ashima/webgl-noise
//
// THE FIRST SHADER IN THIS TREE THAT EXISTS IN BOTH LANGUAGES BECAUSE SOMEBODY PORTED IT.
//
// v4269 counted the reach of gfx/device.js: 118 modules ship GLSL, 38 ship WGSL, 5 ship both -- and of those
// five, three were pages and two were shader modules that happened to be written twice. Nothing had ever been
// deliberately carried across. render/badTvPass.js was chosen to go first because it is the smallest pass with
// a CPU model beside it (102 lines against badTvModel.mjs's 90), and the model is what makes the port
// checkable rather than plausible.
//
// ---- WHAT IS AND IS NOT A TRANSLITERATION ----------------------------------------------------------------------
//
// The arithmetic is Ashima's and Turner's, unchanged. What changed is what WGSL requires:
//
//   * NO USER FUNCTION OVERLOADING. GLSL has mod289(vec3) and mod289(vec4) side by side; WGSL has neither
//     overload resolution nor a way to fake it, so they are mod289_3 and mod289_4. That is the single most
//     mechanical difference and the one most likely to be "cleaned up" later by someone merging them.
//   * NO SWIZZLE ASSIGNMENT. `x12.xy -= i1;` is legal GLSL and illegal WGSL, so the vector is rebuilt:
//     `x12 = vec4f(x12.xy - i1, x12.zw);`. Same for `g.yz = ...`, which is written out as three components.
//   * NO TERNARY. `(x0.x > x0.y) ? vec2(1,0) : vec2(0,1)` becomes select(FALSE_CASE, TRUE_CASE, cond) --
//     *** AND select's ARGUMENT ORDER IS THE REVERSE OF WHAT A C PROGRAMMER READS. *** The false value comes
//     first. Getting this backwards inverts the simplex corner choice and yields noise that still looks like
//     noise, which is exactly the kind of wrong the gate has to catch numerically rather than by eye.
//
// ---- *** THE ONE THING THAT IS NOT A FAITHFULNESS QUESTION AT ALL: PRECISION. *** -------------------------------
//
// The CPU model runs in f64 and the GPU in f32. They cannot agree to the last bit and it is not a defect when
// they do not. Measured with tools/ship/webgpuHarness.mjs while building it, on the classic
// sin(i * 12.9898) * 43758.5453 hash: CPU 0.921690, GPU 0.240234, GPU values quantised to 1/1024. Both correct;
// the expression is ill-conditioned. snoise2 is far better behaved -- its inputs stay small -- but a grader
// still has to pick an f32-appropriate tolerance instead of demanding equality.
"use strict";

import { COARSE_FREQ, FINE_FREQ, COARSE_GAIN, FINE_GAIN, DEFAULTS } from "./badTvModel.mjs";

/**
 * Ashima's 2D simplex, transliterated from shaders/ashimaNoise.js's SNOISE2_BLOCK.
 *
 * *** THE CONSTANTS ARE NOT RETYPED FROM MEMORY. *** They are the same digits as the GLSL chunk, and
 * tools/ship/badTvWgsl-selfcheck.mjs compares the two texts constant by constant rather than trusting that
 * whoever typed them was careful. A dropped digit in 0.211324865405187 produces noise that looks fine.
 */
export const SNOISE2_WGSL = `
fn mod289_3(x: vec3f) -> vec3f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn mod289_4(x: vec4f) -> vec4f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn permute4(x: vec4f) -> vec4f { return mod289_4(((x * 34.0) + 1.0) * x); }

fn snoise2(v: vec2f) -> f32 {
  let C = vec4f(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  let i0 = floor(v + dot(v, C.yy));
  let x0 = v - i0 + dot(i0, C.xx);
  // select(false_value, true_value, condition) -- the false case is FIRST. See the header.
  let i1 = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), x0.x > x0.y);
  var x12 = x0.xyxy + C.xxzz;
  x12 = vec4f(x12.xy - i1, x12.zw);
  let i = mod289_3(vec3f(i0, 0.0)).xy;
  let p = permute4(permute4(vec4f(i.y + vec3f(0.0, i1.y, 1.0), 0.0))
                 + vec4f(i.x + vec3f(0.0, i1.x, 1.0), 0.0)).xyz;
  var m = max(vec3f(0.5) - vec3f(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), vec3f(0.0));
  m = m * m; m = m * m;
  let x = 2.0 * fract(p * C.www) - 1.0;
  let h = abs(x) - 0.5;
  let ox = floor(x + 0.5);
  let a0 = x - ox;
  m = m * (1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h));
  let g = vec3f(a0.x * x0.x  + h.x * x0.y,
                a0.y * x12.x + h.y * x12.y,
                a0.z * x12.z + h.z * x12.w);
  return 130.0 * dot(m, g);
}`;

/**
 * The effect itself. Mirrors badTvModel.mjs's offsetAt and sampleAt exactly, including the cube.
 *
 * *** offset * distortion * offset * distortion * offset IS NOT offset * distortion. *** It is offset cubed
 * times distortion squared, written in the original's order. badTvPass.js's header records what happens when
 * the wrong noise feeds it: snoise2 returns about +/-1 and snoise3 about +/-4.2, and since this is CUBED, the
 * substitution would have multiplied the tear by roughly sixty-four.
 *
 * The frequencies and gains are INTERPOLATED FROM badTvModel.mjs rather than typed here, the same discipline
 * badTvPass.js's GLSL follows -- "a second hand-written 0.2 or 50.0 is how a port drifts".
 */
export const BADTV_WGSL = `
struct Knobs { distortion: f32, distortion2: f32, speed: f32, rollSpeed: f32, time: f32, rows: f32 };

fn badTvOffsetAt(v: f32, k: Knobs) -> f32 {
  let yt = v - k.time * k.speed;
  var offset = snoise2(vec2f(yt * ${COARSE_FREQ.toFixed(1)}, 0.0)) * ${COARSE_GAIN};
  offset = offset * k.distortion * offset * k.distortion * offset;
  offset = offset + snoise2(vec2f(yt * ${FINE_FREQ.toFixed(1)}, 0.0)) * k.distortion2 * ${FINE_GAIN};
  return offset;
}

fn badTvSampleAt(uv: vec2f, k: Knobs) -> vec2f {
  return vec2f(fract(uv.x + badTvOffsetAt(uv.y, k)), fract(uv.y - k.time * k.rollSpeed));
}`;

/** The knob order the uniform struct expects, so a caller cannot pack them in the wrong sequence by guessing. */
export const KNOB_ORDER = Object.freeze(["distortion", "distortion2", "speed", "rollSpeed", "time", "rows"]);

/** Pack knobs for the harness in KNOB_ORDER, filling from badTvModel's DEFAULTS. */
export function packKnobs({ time = 0, rows = 16, ...knobs } = {}) {
    const k = { ...DEFAULTS, ...knobs, time, rows };
    return new Float32Array(KNOB_ORDER.map((n) => k[n]));
}

/**
 * A compute entry that evaluates badTvSampleAt over `rows` evenly spaced v, writing [u, v] pairs.
 *
 * *** THIS IS A GRADING HARNESS, NOT THE SHIPPING SHADER. *** The shipping one is FRAGMENT_WGSL below. A
 * compute pass is used for grading because it can write numbers to a buffer this side can read; sampling a
 * rendered texture back would add a render target, a format and a colour-space conversion between the
 * arithmetic and the assertion, and every one of those is a place for a disagreement that is not the shader's.
 */
export const PROBE_WGSL = `${SNOISE2_WGSL}
${BADTV_WGSL}
@group(0) @binding(0) var<storage, read_write> outv: array<f32>;
@group(0) @binding(1) var<uniform> knobs: Knobs;

@compute @workgroup_size(64)
fn probe(@builtin(global_invocation_id) gid: vec3u) {
  let n = u32(knobs.rows);
  if (gid.x >= n) { return; }
  let v = f32(gid.x) / knobs.rows;
  let uv = badTvSampleAt(vec2f(0.5, v), knobs);
  outv[gid.x * 2u] = uv.x;
  outv[gid.x * 2u + 1u] = uv.y;
}`;

/**
 * The shipping fragment shader, in the shape gfx/device.js's WebGPU backend wants: a `vs` and an `fs` entry in
 * one module, uniforms in a single struct at binding 0 of group 0.
 *
 * The vertex stage draws a full-screen triangle from vertex_index alone, so no vertex buffer is needed -- the
 * three-position quad badTvPass.js builds through THREE.OrthographicCamera has no equivalent here and does not
 * need one.
 */
export const FRAGMENT_WGSL = `${SNOISE2_WGSL}
${BADTV_WGSL}
struct U { distortion: f32, distortion2: f32, speed: f32, rollSpeed: f32, time: f32, rows: f32 };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tDiffuse: texture_2d<f32>;

struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  // A single oversized triangle covering the viewport -- cheaper than two triangles and with no seam.
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4f(p[vi], 0.0, 1.0);
  o.uv = vec2f((p[vi].x + 1.0) * 0.5, (p[vi].y + 1.0) * 0.5);
  return o;
}

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let k = Knobs(u.distortion, u.distortion2, u.speed, u.rollSpeed, u.time, u.rows);
  return textureSample(tDiffuse, samp, badTvSampleAt(uv, k));
}`;
