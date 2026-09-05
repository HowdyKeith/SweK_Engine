// WebGLEngine/render/litSphere.mjs -- v4473 (the 3D orrery, step 1)
//
// *** A BODY THAT IS A SPHERE, LIT FROM THE CENTRE. *** orrery-gpu.html has drawn the system through gfx/device.js
// with a perspective camera and a tilt since v4299, and every body in it was a DISC lying in the orbit plane --
// render/gpuDriven.mjs discMesh, drawn by the default flat pipeline, which reads `p` and `color` and nothing else.
// Tilt the camera and a disc is an ellipse; there is no normal to shade with, so nothing in the picture says
// which way is up. This module is the two things that were missing, and nothing else:
//
//   sphereMesh(subdiv, color)  -- world/spaceStructures.js's icosphere as a gpuDriven mesh with NORMALS (a unit
//                                 sphere's normal is its position, so the two arrays are one array twice);
//   litPipelineDesc()          -- the LAYOUTS.lit vertex layout gpuDriven declared at v4301 and nothing used,
//                                 drawn by a vertex stage that carries the world position and the normal to a
//                                 fragment stage lit by a POINT light: `light` = (position.xyz, ambient). The
//                                 orrery's light is at the origin, where SweK sits -- a sun, not a lamp.
//
// The per-instance `extra.w` is EMISSIVE: 1 draws the body at its full colour whatever the light says, so the
// centre body, which would otherwise be lit from inside itself and go dark, is the one that shines. That word
// travels in the slot gpuDriven already passes every fleet at location 5; no record moves.
//
// THE TWIN. shadeAt(normal, world, light, emissive) is the fragment stage's arithmetic in JavaScript, in the same
// order, so a gate can hold the pixels of a rendered sphere to a sphere it never rendered: for a known camera and
// a known light, the point under each covered pixel is the ray's first hit on the sphere and its shade is this
// function's answer. That is the key tools/ship/litSphere-selfcheck.mjs grades both backends against.
//
// v4478 -- TINTS. The per-instance `extra.y` is a tint index: 0 keeps the mesh's colour (the rung's, the ladder's
// tell), 1..N takes the Nth entry of the palette the pipeline was built with. The orrery's palette is the 2D
// page's own (ui/orreryDraw.js STATE_COLOUR, REACHED_COLOUR, the fleet's two), imported by the page and handed to
// litPipelineDesc({ tints }), so a captured body is the 2D page's green and a flyby SweK may not take is its purple
// on the device too. The palette is baked into BOTH shaders as an if-chain (WGSL cannot index a const array by a
// runtime value; the chain is the same text in both languages), and the count is refused above 8 by name.
//
// NOT CLAIMED: specular, shadows (a moon behind its planet is lit as if nothing stood between), any light but
// one, and a normal transformed by anything but the uniform scale gpuDriven applies -- rec.w scales, rec.xyz
// moves, and a normal survives both unchanged, which is why the vertex stage passes it through.
"use strict";
import { icosphere } from "../world/spaceStructures.js";
import { LAYOUTS, renderPipelineDesc } from "./gpuDriven.mjs";

/** A unit icosphere as a gpuDriven mesh: positions, NORMALS (= positions), indices, one colour. */
export function sphereMesh(subdiv = 2, color = [1, 1, 1, 1]) {
    const { verts, faces } = icosphere(Math.max(0, subdiv | 0));
    const positions = new Float32Array(verts.length * 3), normals = new Float32Array(verts.length * 3);
    for (let i = 0; i < verts.length; i++) { positions.set(verts[i], i * 3); normals.set(verts[i], i * 3); }
    const indices = new Uint32Array(faces.length * 3);
    for (let i = 0; i < faces.length; i++) indices.set(faces[i], i * 3);
    return { positions, normals, indices, color, subdiv };
}

/** The light the orrery uses: at the origin (SweK, the centre body), with this much ambient so the dark side reads. */
export const LIGHT_AT_CENTRE = Object.freeze([0, 0, 0, 0.22]);

/**
 * The fragment stage's arithmetic, on the CPU, in the same order.
 * @param normal  unit normal at the point
 * @param world   the point, in world units
 * @param light   [x, y, z, ambient] -- a POINT light's position and the ambient floor
 * @param emissive 0..1 -- 1 means full colour regardless of the light
 * @returns the scalar the colour is multiplied by, in [ambient, 1]
 */
export function shadeAt(normal, world, light, emissive = 0) {
    const lx = light[0] - world[0], ly = light[1] - world[1], lz = light[2] - world[2];
    const ll = Math.hypot(lx, ly, lz) || 1;
    const nl = Math.hypot(normal[0], normal[1], normal[2]) || 1;
    const dot = (normal[0] * lx + normal[1] * ly + normal[2] * lz) / (ll * nl);
    const ambient = light[3];
    const lambert = ambient + (1 - ambient) * Math.max(0, dot);
    const e = Math.min(1, Math.max(0, emissive));
    return lambert + (1 - lambert) * e;   // mix(lambert, 1, e)
}

export const MAX_TINTS = 8;
const f3 = (v) => (Number.isFinite(v) ? v : 0).toFixed(6);
/** The tint function's body in each language: an if-chain over the palette, index 0 the mesh's own colour. */
function tintChain(tints, lang) {
    const T = tints || [];
    if (T.length > MAX_TINTS) throw new Error(`litSphere: ${T.length} tints; the chain carries at most ${MAX_TINTS}, by name`);
    for (const t of T) if (!Array.isArray(t) || t.length < 3 || !t.every((c) => Number.isFinite(c) && c >= 0 && c <= 1)) throw new Error("litSphere: a tint is [r, g, b] in 0..1");
    const vec = lang === "wgsl" ? "vec3<f32>" : "vec3";
    return T.map((t, i) => `  if (i == ${i + 1}) { return ${vec}(${f3(t[0])}, ${f3(t[1])}, ${f3(t[2])}); }`).join("\n");
}
export function litWgsl(tints = null) {
    return `
struct Cam { viewProj: mat4x4<f32>, light: vec4<f32> };   // light = (position.xyz, ambient)
@group(0) @binding(0) var<uniform> cam: Cam;
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) color: vec4<f32>, @location(1) n: vec3<f32>, @location(2) w: vec3<f32>, @location(3) @interpolate(flat) emissive: f32, @location(4) @interpolate(flat) tint: i32 };
fn tintOf(i: i32, own: vec3<f32>) -> vec3<f32> {
${tintChain(tints, "wgsl")}
  return own;
}
@vertex fn vs(@location(0) p: vec3<f32>, @location(1) color: vec4<f32>, @location(2) rec: vec4<f32>, @location(4) n: vec3<f32>, @location(5) extra: vec4<f32>) -> VOut {
  var o: VOut;
  let w = rec.xyz + p * rec.w;
  o.pos = cam.viewProj * vec4<f32>(w, 1.0);
  o.color = color;
  o.n = n;            // a uniform scale and a translation leave a normal as it was
  o.w = w;
  o.emissive = extra.w;
  o.tint = i32(extra.y + 0.5);
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> {
  let l = normalize(cam.light.xyz - v.w);
  let lambert = cam.light.w + (1.0 - cam.light.w) * max(0.0, dot(normalize(v.n), l));
  let shade = mix(lambert, 1.0, clamp(v.emissive, 0.0, 1.0));
  return vec4<f32>(tintOf(v.tint, v.color.rgb) * shade, v.color.a);
}
`;
}
export function litVertexGlsl() {
    return `#version 300 es
precision highp float;
uniform mat4 viewProj;
in vec3 p; in vec4 color; in vec4 rec; in vec3 n; in vec4 extra;
out vec4 vColor; out vec3 vN; out vec3 vW; flat out float vE; flat out int vT;
void main() {
  vec3 w = rec.xyz + p * rec.w;
  gl_Position = viewProj * vec4(w, 1.0);
  vColor = color; vN = n; vW = w; vE = extra.w; vT = int(extra.y + 0.5);
}
`;
}
export function litFragmentGlsl(tints = null) {
    return `#version 300 es
precision highp float;
uniform vec4 light;
in vec4 vColor; in vec3 vN; in vec3 vW; flat in float vE; flat in int vT; out vec4 fragColor;
vec3 tintOf(int i, vec3 own) {
${tintChain(tints, "glsl")}
  return own;
}
void main() {
  vec3 l = normalize(light.xyz - vW);
  float lambert = light.w + (1.0 - light.w) * max(0.0, dot(normalize(vN), l));
  float shade = mix(lambert, 1.0, clamp(vE, 0.0, 1.0));
  fragColor = vec4(tintOf(vT, vColor.rgb) * shade, vColor.a);
}
`;
}
/** The untinted pair, as constants, for the corpus and the census. */
export const LIT_WGSL = litWgsl(null);
export const LIT_VERTEX_GLSL = litVertexGlsl();
export const LIT_FRAGMENT_GLSL = litFragmentGlsl(null);

/** "#rrggbb" strings (the 2D page's colours) as [r, g, b] in 0..1, for litPipelineDesc({ tints }). */
export function tintsFromHex(hexes) {
    return (hexes || []).map((h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h)); if (!m) throw new Error(`litSphere: not a #rrggbb colour: ${h}`);
        const v = parseInt(m[1], 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; });
}

/** The lit pipeline over LAYOUTS.lit: the same two vertex slots every gpuDriven pipeline takes, plus `light`; `tints` bakes a palette in. */
export function litPipelineDesc({ cull = null, frontFace = null, blend = null, tints = null } = {}) {
    return renderPipelineDesc({
        layout: LAYOUTS.lit,
        shaders: { wgsl: litWgsl(tints), glsl: { vertex: litVertexGlsl(), fragment: litFragmentGlsl(tints) } },
        uniforms: [{ name: "viewProj", type: "mat4" }, { name: "light", type: "vec4" }],
        cull, frontFace, blend,
    });
}

/** The bind hook a lit fleet hands makeGpuDrivenScene: the light, each draw. `light` may be a function of ctx. */
export function litBind(light = LIGHT_AT_CENTRE) {
    return (pass, ctx) => { const l = typeof light === "function" ? light(ctx) : light; pass.uniform("light", Float32Array.from(l)); };
}
