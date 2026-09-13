// fx/nebula/nebulaShaders.js -- WebGPU (WGSL) + WebGL2 (GLSL ES 3.0) fragment shaders for the nebula, transcribed
// from the CPU reference in nebula.js (same hash/vnoise/fbm/palette/parallax/stars). Fullscreen; uniforms are
// resolution, camera offset (parallax), and time. GPU exec is RIG-only; the algorithm is the verified CPU ref.
//
// *** v4570 -- THE LINE THAT USED TO STAND HERE WAS HALF RIGHT, AND THE OTHER HALF WAS THE STARFIELD. ***
// It read: "these are correct-by-construction and visually equivalent (f32 vs f64 differences are
// imperceptible for gas)". Imperceptible FOR GAS is true and was tested by eye: fbm averages its noise, so a
// wisp drawn from a different random field is still a wisp. But this header also claims the transcription
// keeps "same hash/vnoise/fbm/palette/parallax/STARS", and a star is not gas -- nebula.js draws one with
// `if (sv > 0.994)`, a THRESHOLD, and a threshold does not average.
//
// fract(sin(dot(p,K))*43758.5453) in f32 here against f64 there is not one number rounded twice; sin(x)*43758
// amplifies the last bits of x by four orders of magnitude and the two are unrelated. MEASURED over 518,400
// sampled pixels of a 1920x1080 frame: the CPU drew 3,006 stars, the GPU drew 2,509, and 378 were in the same
// place -- 12.6%. nebula.html imports renderNebulaCPU AND these shaders, so which sky a viewer saw depended
// on whether their browser had WebGPU. tools/ship/exactHash-selfcheck.mjs re-derives that pair every run
// rather than quoting it, over the same pixels as the after-reading it is compared against.
//
// hash2 is render/exactHash.mjs's integer hash in all three languages now, so the transcription is exact
// rather than correct-by-construction.
"use strict";
import { EXACT_HASH_GLSL, EXACT_HASH_WGSL } from "../../render/exactHash.mjs";

const NEBULA_WGSL = `
struct U { res:vec2<f32>, cam:vec2<f32>, time:f32, pad:f32 };
@group(0) @binding(0) var<uniform> u:U;
${EXACT_HASH_WGSL}
fn hash2(p:vec2<f32>) -> f32 { return exact_hash(p, 0u); }
fn vnoise(p:vec2<f32>) -> f32 {
  let i = floor(p); let f = fract(p); let uu = f * f * (3.0 - 2.0 * f);
  let a = hash2(i); let b = hash2(i + vec2<f32>(1.0, 0.0)); let c = hash2(i + vec2<f32>(0.0, 1.0)); let d = hash2(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, uu.x), mix(c, d, uu.x), uu.y);
}
fn fbm(p:vec2<f32>) -> f32 { var f = 0.0; var amp = 0.5; var q = p; for (var i = 0; i < 5; i = i + 1) { f = f + amp * vnoise(q); q = q * 2.01; amp = amp * 0.5; } return f; }
@vertex fn vs(@builtin(vertex_index) vi:u32) -> @builtin(position) vec4<f32> {
  var p = array<vec2<f32>,3>(vec2<f32>(-1.0,-1.0), vec2<f32>(3.0,-1.0), vec2<f32>(-1.0,3.0));
  return vec4<f32>(p[vi], 0.0, 1.0);
}
@fragment fn fs(@builtin(position) fc:vec4<f32>) -> @location(0) vec4<f32> {
  let H = u.res.y;
  let uv = vec2<f32>(fc.x / H + u.cam.x * 0.00035 + u.time * 0.004, fc.y / H + u.cam.y * 0.00035);
  let w1 = fbm(uv * 2.4);
  let dens = fbm(uv * 2.4 + vec2<f32>(4.7, 1.9) + vec2<f32>(w1 * 1.6, w1 * 1.2));
  let density = pow(max(0.0, dens - 0.42) / 0.58, 1.6);
  let cvar = fbm(uv * 1.1 + vec2<f32>(9.3, -3.7));
  let teal = vec3<f32>(0.10, 0.42, 0.55); let magenta = vec3<f32>(0.62, 0.12, 0.52); let ember = vec3<f32>(0.72, 0.34, 0.10);
  var col = mix(mix(teal, magenta, min(1.0, cvar * 1.4)), ember, max(0.0, cvar - 0.55) * 2.2);
  col = col * density + vec3<f32>(0.012, 0.016, 0.03);
  let sxy = vec2<f32>(fc.x + u.cam.x * 0.02, fc.y + u.cam.y * 0.02);
  let sv = hash2(floor(sxy * 0.9));
  if (sv > 0.994) { col = col + vec3<f32>((sv - 0.994) / 0.006); }
  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}`;

const NEBULA_GLSL_VS = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const NEBULA_GLSL_FS = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform vec2 uCam; uniform float uTime;
out vec4 frag;
${EXACT_HASH_GLSL}
float hash2(vec2 p) { return exact_hash(p, 0u); }
float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash2(i), b = hash2(i + vec2(1.0, 0.0)), c = hash2(i + vec2(0.0, 1.0)), d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y); }
float fbm(vec2 p) { float f = 0.0, amp = 0.5; vec2 q = p; for (int i = 0; i < 5; i++) { f += amp * vnoise(q); q *= 2.01; amp *= 0.5; } return f; }
void main() {
  float H = uRes.y;
  vec2 uv = vec2(gl_FragCoord.x / H + uCam.x * 0.00035 + uTime * 0.004, gl_FragCoord.y / H + uCam.y * 0.00035);
  float w1 = fbm(uv * 2.4);
  float dens = fbm(uv * 2.4 + vec2(4.7, 1.9) + vec2(w1 * 1.6, w1 * 1.2));
  float density = pow(max(0.0, dens - 0.42) / 0.58, 1.6);
  float cvar = fbm(uv * 1.1 + vec2(9.3, -3.7));
  vec3 teal = vec3(0.10, 0.42, 0.55), magenta = vec3(0.62, 0.12, 0.52), ember = vec3(0.72, 0.34, 0.10);
  vec3 col = mix(mix(teal, magenta, min(1.0, cvar * 1.4)), ember, max(0.0, cvar - 0.55) * 2.2);
  col = col * density + vec3(0.012, 0.016, 0.03);
  vec2 sxy = vec2(gl_FragCoord.x + uCam.x * 0.02, gl_FragCoord.y + uCam.y * 0.02);
  float sv = hash2(floor(sxy * 0.9));
  if (sv > 0.994) { col += vec3((sv - 0.994) / 0.006); }
  frag = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export { NEBULA_WGSL, NEBULA_GLSL_VS, NEBULA_GLSL_FS };
if (typeof module !== "undefined" && module.exports) module.exports = { NEBULA_WGSL, NEBULA_GLSL_VS, NEBULA_GLSL_FS };
