// WebGLEngine/render/texelProbe.mjs -- v4459
// ---------------------------------------------------------------------------------------------------------------
// TWO DEVICE PROBES THAT WRITE A TEXEL'S BITS AS BYTES, IN BOTH LANGUAGES, SO A GATE CAN READ AN UPLOAD BACK EXACTLY.
//
// gfx/device.js gained texture formats at v4459 (rgba16float, rg16uint beside rgba8unorm), and the question a
// format raises is not "does it look right" but "are these the bytes I uploaded". A sampled picture cannot answer
// that -- filtering, gamma and the 8-bit target all stand between the texel and the pixel. These two pipelines
// answer it directly: a full-screen triangle whose fragment fetches the texel under it with textureLoad /
// texelFetch and writes its BITS. The half-float probe packs the loaded channels back to sixteen bits with
// pack2x16float / packHalf2x16 (a half loaded and repacked is the same half), and `pair` selects xy or zw; the
// uint probe splits each 16-bit channel into its low and high byte. Every output byte is an integer over 255, so
// an 8-bit target holds it exactly and the readback is the upload, bit for bit, or it is wrong.
//
// THIS IS A SHIPPING MODULE AND NOT PART OF ITS GATE, for the reason render/badTvDevicePass.mjs and its gate are
// separate: the backend-parity census counts every file that carries both languages, and a gate that carried
// them would be counted as a device consumer beside the demos. A module can be counted for what it is -- a pair.
//
// The probes fetch at the fragment's own position, so the two backends' pictures are vertical mirrors of each
// other (WebGPU's position.y from the top, GL's gl_FragCoord.y from the bottom, the device turning GL's rows
// over on readback). tools/ship/deviceFormats-selfcheck.mjs applies that mapping by name.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

export const FLOAT_PROBE_WGSL = `struct U { pair: f32 };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var tex: texture_2d<f32>;
struct VSOut { @builtin(position) pos: vec4f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut { var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0)); var o: VSOut; o.pos = vec4f(p[vi], 0.0, 1.0); return o; }
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let v = textureLoad(tex, vec2i(pos.xy), 0);
  let bits = select(pack2x16float(v.xy), pack2x16float(v.zw), u.pair > 0.5);
  return vec4f(f32(bits & 0xFFu), f32((bits >> 8u) & 0xFFu), f32((bits >> 16u) & 0xFFu), f32(bits >> 24u)) / 255.0;
}`;
export const FLOAT_PROBE_VERTEX_GLSL = `#version 300 es
void main() { vec2 p[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0)); gl_Position = vec4(p[gl_VertexID], 0.0, 1.0); }`;
export const FLOAT_PROBE_FRAGMENT_GLSL = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform float pair; uniform sampler2D tex; out vec4 fragColor;
void main() {
  vec4 v = texelFetch(tex, ivec2(gl_FragCoord.xy), 0);
  uint bits = pair > 0.5 ? packHalf2x16(v.zw) : packHalf2x16(v.xy);
  fragColor = vec4(float(bits & 0xFFu), float((bits >> 8u) & 0xFFu), float((bits >> 16u) & 0xFFu), float(bits >> 24u)) / 255.0;
}`;

export const UINT_PROBE_WGSL = `@group(0) @binding(0) var utex: texture_2d<u32>;
struct VSOut { @builtin(position) pos: vec4f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut { var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0)); var o: VSOut; o.pos = vec4f(p[vi], 0.0, 1.0); return o; }
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let v = textureLoad(utex, vec2i(pos.xy), 0);
  return vec4f(f32(v.x & 0xFFu), f32(v.x >> 8u), f32(v.y & 0xFFu), f32(v.y >> 8u)) / 255.0;
}`;
export const UINT_PROBE_VERTEX_GLSL = `#version 300 es
void main() { vec2 p[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0)); gl_Position = vec4(p[gl_VertexID], 0.0, 1.0); }`;
export const UINT_PROBE_FRAGMENT_GLSL = `#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
uniform highp usampler2D utex; out vec4 fragColor;
void main() {
  uvec4 v = texelFetch(utex, ivec2(gl_FragCoord.xy), 0);
  fragColor = vec4(float(v.x & 0xFFu), float(v.x >> 8u), float(v.y & 0xFFu), float(v.y >> 8u)) / 255.0;
}`;

/** Pipeline descriptor for the half-float probe: uniform `pair` (0 -> channels xy, 1 -> zw), texture `tex`. */
export function floatProbeDesc() {
    return { shaders: { wgsl: FLOAT_PROBE_WGSL, glsl: { vertex: FLOAT_PROBE_VERTEX_GLSL, fragment: FLOAT_PROBE_FRAGMENT_GLSL } },
             vs: "vs", fs: "fs", attributes: [], stride: 0, uniforms: [{ name: "pair", type: "f32" }] };
}
/** Pipeline descriptor for the uint probe: texture `utex` (texture_2d<u32> / usampler2D), no uniforms. */
export function uintProbeDesc() {
    return { shaders: { wgsl: UINT_PROBE_WGSL, glsl: { vertex: UINT_PROBE_VERTEX_GLSL, fragment: UINT_PROBE_FRAGMENT_GLSL } },
             vs: "vs", fs: "fs", attributes: [], stride: 0, uniforms: [] };
}
