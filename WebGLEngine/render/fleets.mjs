// WebGLEngine/render/fleets.mjs -- v4301 (Level 15)
//
// LEVEL 15: FLEETS IN THEIR OWN ARCHITECTURES. A fleet is a mesh source, a vertex layout and a shader pair; the
// GPU-driven scene (render/gpuDriven.mjs) gives each fleet its own (fleet, LOD) regions and draws each through
// its own pipeline, so one economy's traders can be nine alien races: flat quads, a lit 3D hull, a pixel sprite,
// that sprite lofted into a solid, the flight radar's voxel jet, an SVG silhouette extruded and drawn as a
// hologram, a Krbn drawing lifted onto a raised hull as line strokes, ASCII glyphs pinned to a hull, and a hull
// seen through ASCII screen cells. Every look is a vertex/fragment pair in WGSL AND GLSL over the same buffers, so
// both backends draw the same fleet from the same records, and the pick picture names the fleet under the pointer.
//
// ---- THE HARDER-THAN-IT-LOOKS ONES, HONESTLY LABELLED --------------------------------------------------------------
//
// The ASCII race is an IMPRESSION of an ASCII picture, not a text renderer: the fragment stage divides the
// screen into 8x8 cells, turns the lit shade of the hull at that cell into one of ten glyph bitmaps (a 5x7 font
// drawn here in source), and discards the pixels the glyph does not cover. The hull's own silhouette is still
// what decides which cells exist. The Krbn race is a drawing's STROKES, lifted to 3D exactly as tools/krbn/
// strokeLift.js lifts them (polylines in an OBJ with `l` records), drawn as a line-list -- the one topology
// that is neither triangles nor a post effect, and the reason gfx/device.js learned `topology` on WebGL2 this
// round. The hologram carries the swiftShaderPass HOLOGRAPHIC rainbow (its phase expression, without the
// half-float rounding the SwiftUI port keeps for parity) over a lambert hull and a scanline.
//
// ---- THE TREE'S OWN RE-SKINNERS, USED RATHER THAN RE-TYPED ----------------------------------------------------------
//
// "Not sure if we cleverly re-skinned any other objects that I am forgetting." Several, and each race here is one
// of them, imported rather than rewritten: mesh/extrudePolygon.mjs raises the SVG silhouette (watertight, the
// same ring for caps and walls); fx/spritemesh/spriteMesh.js lofts a sprite's alpha into a solid (the Loft race
// is the Pixel race's own bitmap, radially contoured and extruded); gpu/voxelCreature.js builds the flight radar's
// voxel planes (ui/planeMeshLayer.js's generators, the "default meteo plane models"); tools/export/reskin.js
// pins ASCII glyph quads to a surface by area-weighted sampling (the Glyph race, the ramp shared with
// tools/render-qa/asciify.mjs); and tools/krbn/strokeLift.js lifts a drawing onto a raised hull (the Krbn race).
//
// ---- THE USER'S OWN MODELS -----------------------------------------------------------------------------------------
//
// A person who assigned .glb ships per class in Escape Velocity (ev/esShipModelsCore.js, key swek.esShipModels.v1)
// or plane models on the flight radar (ui/planeMeshLayer.js, key voxelengine.planeModels) has already said what
// their ships look like. userModelSources() reads both keys from a storage the caller hands over, and
// loadUserModel() turns a .glb (physics/mesh/glb.mjs, pure) or .obj (parseObj, here) into a fleet mesh with flat
// normals -- the lit fleet then draws THEIR ship. A "sprite:" assignment (the EV loft from top-down art) is
// reported and skipped: the loft lives on three.js and does not travel here.
"use strict";

import { LAYOUTS, PICK_WGSL, PICK_VERTEX_GLSL, PICK_FRAGMENT_GLSL } from "./gpuDriven.mjs";
import { svgToShapes } from "./svgExtrudeCore.js";
import { extrudePolygon, watertight } from "../mesh/extrudePolygon.mjs";
import { alphaMask, radialContour, extrude as extrudeContour } from "../fx/spritemesh/spriteMesh.js";
import { buildVoxelMesh } from "../gpu/voxelCreature.js";
import { PLANE_GENERATORS } from "../ui/planeMeshLayer.js";
import { surfaceSamples, buildGlyphQuads } from "../tools/export/reskin.js";
import { RAMP } from "../tools/render-qa/asciify.mjs";
import { parseGLB } from "../physics/mesh/glb.mjs";
import { liftStrokes, drawingBounds, hatchStrokes } from "../tools/krbn/strokeLift.js";
import { KRBN_CAM } from "../tools/krbn/krbnCompare.js";

// ---- the looks: five vertex/fragment pairs, WGSL and GLSL --------------------------------------------------------
/**
 * Every fleet shader spins its hull by the golden angle times the record's id, so a race is not a parade of
 * identical headings. The scene's records carry no heading (four floats: centre and radius); this is the
 * deterministic stand-in until a heading travels in the record, and both backends compute the same angle.
 */
export const SPIN = 2.399963;
const WGSL_SPIN = `
fn spun(p: vec3<f32>, id: f32) -> vec3<f32> {
  let a = id * ${SPIN};
  let ca = cos(a); let sa = sin(a);
  return vec3<f32>(p.x * ca - p.y * sa, p.x * sa + p.y * ca, p.z);
}`;
const GLSL_SPIN = `
vec3 spun(vec3 p, float id) { float a = id * ${SPIN}; float ca = cos(a), sa = sin(a); return vec3(p.x * ca - p.y * sa, p.x * sa + p.y * ca, p.z); }`;

/** A lit 3D hull: lambert over the vertex normal, `light` = (direction xyz, ambient). */
export const LIT_WGSL = `
struct Cam { viewProj: mat4x4<f32>, light: vec4<f32> };
@group(0) @binding(0) var<uniform> cam: Cam;
${WGSL_SPIN}
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) color: vec4<f32>, @location(1) n: vec3<f32> };
@vertex fn vs(@location(0) p: vec3<f32>, @location(1) color: vec4<f32>, @location(2) rec: vec4<f32>, @location(3) ident: vec4<f32>, @location(4) n: vec3<f32>) -> VOut {
  var o: VOut;
  o.pos = cam.viewProj * vec4<f32>(rec.xyz + spun(p, ident.x) * rec.w, 1.0);
  o.color = color;
  o.n = spun(n, ident.x);
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> {
  let l = max(dot(normalize(v.n), normalize(cam.light.xyz)), 0.0);
  return vec4<f32>(v.color.rgb * (cam.light.w + (1.0 - cam.light.w) * l), v.color.a);
}
`;
export const LIT_VERTEX_GLSL = `#version 300 es
precision highp float;
uniform mat4 viewProj; uniform vec4 light;
in vec3 p; in vec4 color; in vec4 rec; in vec4 ident; in vec3 n;
out vec4 vColor; out vec3 vN;
${GLSL_SPIN}
void main() { gl_Position = viewProj * vec4(rec.xyz + spun(p, ident.x) * rec.w, 1.0); vColor = color; vN = spun(n, ident.x); }
`;
export const LIT_FRAGMENT_GLSL = `#version 300 es
precision highp float;
uniform vec4 light;
in vec4 vColor; in vec3 vN; out vec4 fragColor;
void main() { float l = max(dot(normalize(vN), normalize(light.xyz)), 0.0); fragColor = vec4(vColor.rgb * (light.w + (1.0 - light.w) * l), vColor.a); }
`;

/** A sprite: a textured quad, the texel fetched by integer coordinate (no sampler), transparent texels discarded. */
export const SPRITE_WGSL = `
struct Cam { viewProj: mat4x4<f32> };
@group(0) @binding(0) var<uniform> cam: Cam;
@group(0) @binding(1) var atlas: texture_2d<f32>;
${WGSL_SPIN}
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) color: vec4<f32>, @location(1) uv: vec2<f32> };
@vertex fn vs(@location(0) p: vec3<f32>, @location(1) color: vec4<f32>, @location(2) rec: vec4<f32>, @location(3) ident: vec4<f32>, @location(4) uv: vec2<f32>) -> VOut {
  var o: VOut;
  o.pos = cam.viewProj * vec4<f32>(rec.xyz + spun(p, ident.x) * rec.w, 1.0);
  o.color = color; o.uv = uv;
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> {
  let dim = vec2<f32>(textureDimensions(atlas));
  let t = textureLoad(atlas, vec2<i32>(clamp(v.uv * dim, vec2<f32>(0.0), dim - 1.0)), 0);
  if (t.a < 0.5) { discard; }
  return vec4<f32>(t.rgb * v.color.rgb, 1.0);
}
`;
export const SPRITE_VERTEX_GLSL = `#version 300 es
precision highp float;
uniform mat4 viewProj;
in vec3 p; in vec4 color; in vec4 rec; in vec4 ident; in vec2 uv;
out vec4 vColor; out vec2 vUv;
${GLSL_SPIN}
void main() { gl_Position = viewProj * vec4(rec.xyz + spun(p, ident.x) * rec.w, 1.0); vColor = color; vUv = uv; }
`;
export const SPRITE_FRAGMENT_GLSL = `#version 300 es
precision highp float;
uniform sampler2D atlas;
in vec4 vColor; in vec2 vUv; out vec4 fragColor;
void main() {
  vec2 dim = vec2(textureSize(atlas, 0));
  vec4 t = texelFetch(atlas, ivec2(clamp(vUv * dim, vec2(0.0), dim - 1.0)), 0);
  if (t.a < 0.5) discard;
  fragColor = vec4(t.rgb * vColor.rgb, 1.0);
}
`;

/**
 * The hologram: the HOLOGRAPHIC rainbow from render/swiftShaderPass.js (phase = (x cos a + y sin a) * scale +
 * time * speed over the screen, three sines a third of a turn apart) added over a lambert hull, with a scanline.
 * `holo` = (time, scale, speed, angle). The SwiftUI port rounds to half floats for parity with Metal; this is a
 * hull shader, not a parity port, and does not.
 */
export const HOLO_WGSL = `
struct Cam { viewProj: mat4x4<f32>, light: vec4<f32>, holo: vec4<f32> };
@group(0) @binding(0) var<uniform> cam: Cam;
${WGSL_SPIN}
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) color: vec4<f32>, @location(1) n: vec3<f32> };
@vertex fn vs(@location(0) p: vec3<f32>, @location(1) color: vec4<f32>, @location(2) rec: vec4<f32>, @location(3) ident: vec4<f32>, @location(4) n: vec3<f32>) -> VOut {
  var o: VOut;
  o.pos = cam.viewProj * vec4<f32>(rec.xyz + spun(p, ident.x) * rec.w, 1.0);
  o.color = color; o.n = spun(n, ident.x);
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> {
  let l = max(dot(normalize(v.n), normalize(cam.light.xyz)), 0.0);
  let shade = cam.light.w + (1.0 - cam.light.w) * l;
  let uv = v.pos.xy * 0.002;
  let phase = (uv.x * cos(cam.holo.w) + uv.y * sin(cam.holo.w)) * cam.holo.y + cam.holo.x * cam.holo.z;
  let rainbow = vec3<f32>(sin(phase) * 0.5 + 0.5, sin(phase + 2.094) * 0.5 + 0.5, sin(phase + 4.189) * 0.5 + 0.5);
  let scan = 0.75 + 0.25 * sin(v.pos.y * 1.5 + cam.holo.x * 6.0);
  let rgb = (v.color.rgb * shade + rainbow * 0.6 * smoothstep(0.3, 0.8, shade)) * scan;
  let gray = dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
  return vec4<f32>(vec3<f32>(gray) + (rgb - vec3<f32>(gray)) * 1.1, v.color.a);
}
`;
export const HOLO_VERTEX_GLSL = LIT_VERTEX_GLSL;
export const HOLO_FRAGMENT_GLSL = `#version 300 es
precision highp float;
uniform vec4 light; uniform vec4 holo;
in vec4 vColor; in vec3 vN; out vec4 fragColor;
void main() {
  float l = max(dot(normalize(vN), normalize(light.xyz)), 0.0);
  float shade = light.w + (1.0 - light.w) * l;
  vec2 uv = gl_FragCoord.xy * 0.002;
  float phase = (uv.x * cos(holo.w) + uv.y * sin(holo.w)) * holo.y + holo.x * holo.z;
  vec3 rainbow = vec3(sin(phase) * 0.5 + 0.5, sin(phase + 2.094) * 0.5 + 0.5, sin(phase + 4.189) * 0.5 + 0.5);
  float scan = 0.75 + 0.25 * sin(gl_FragCoord.y * 1.5 + holo.x * 6.0);
  vec3 rgb = (vColor.rgb * shade + rainbow * 0.6 * smoothstep(0.3, 0.8, shade)) * scan;
  float gray = dot(rgb, vec3(0.299, 0.587, 0.114));
  fragColor = vec4(vec3(gray) + (rgb - vec3(gray)) * 1.1, vColor.a);
}
`;

/** Ink: strokes on a line-list, one flat colour. The drawing IS the geometry; there is nothing to shade. */
export const INK_WGSL = `
struct Cam { viewProj: mat4x4<f32> };
@group(0) @binding(0) var<uniform> cam: Cam;
${WGSL_SPIN}
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) color: vec4<f32> };
@vertex fn vs(@location(0) p: vec3<f32>, @location(1) color: vec4<f32>, @location(2) rec: vec4<f32>, @location(3) ident: vec4<f32>) -> VOut {
  var o: VOut;
  o.pos = cam.viewProj * vec4<f32>(rec.xyz + spun(p, ident.x) * rec.w, 1.0);
  o.color = color;
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> { return v.color; }
`;
export const INK_VERTEX_GLSL = `#version 300 es
precision highp float;
uniform mat4 viewProj;
in vec3 p; in vec4 color; in vec4 rec; in vec4 ident;
out vec4 vColor;
${GLSL_SPIN}
void main() { gl_Position = viewProj * vec4(rec.xyz + spun(p, ident.x) * rec.w, 1.0); vColor = color; }
`;
export const INK_FRAGMENT_GLSL = `#version 300 es
precision highp float;
in vec4 vColor; out vec4 fragColor;
void main() { fragColor = vColor; }
`;

/**
 * ASCII: the screen in `cell`-pixel cells; the hull's lit shade at a fragment picks a glyph from the atlas (ten
 * 8x8 tiles, darkest first), and the fragment survives only where that glyph has ink. `cell` = (w, h, glyphs, 0).
 */
export const ASCII_WGSL = `
struct Cam { viewProj: mat4x4<f32>, light: vec4<f32>, cell: vec4<f32> };
@group(0) @binding(0) var<uniform> cam: Cam;
@group(0) @binding(1) var glyphs: texture_2d<f32>;
${WGSL_SPIN}
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) color: vec4<f32>, @location(1) n: vec3<f32> };
@vertex fn vs(@location(0) p: vec3<f32>, @location(1) color: vec4<f32>, @location(2) rec: vec4<f32>, @location(3) ident: vec4<f32>, @location(4) n: vec3<f32>) -> VOut {
  var o: VOut;
  o.pos = cam.viewProj * vec4<f32>(rec.xyz + spun(p, ident.x) * rec.w, 1.0);
  o.color = color; o.n = spun(n, ident.x);
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> {
  let l = max(dot(normalize(v.n), normalize(cam.light.xyz)), 0.0);
  let shade = cam.light.w + (1.0 - cam.light.w) * l;
  let glyphCount = max(cam.cell.z, 1.0);
  let g = min(floor(shade * glyphCount), glyphCount - 1.0);
  let cell = vec2<f32>(max(cam.cell.x, 1.0), max(cam.cell.y, 1.0));
  let inCell = fract(v.pos.xy / cell);
  let dim = vec2<f32>(textureDimensions(glyphs));
  let tile = dim.y;
  let tx = clamp(g * tile + inCell.x * tile, 0.0, dim.x - 1.0);
  let ty = clamp(inCell.y * tile, 0.0, dim.y - 1.0);
  let t = textureLoad(glyphs, vec2<i32>(i32(tx), i32(ty)), 0);
  if (t.a < 0.5) { discard; }
  return vec4<f32>(v.color.rgb, 1.0);
}
`;
export const ASCII_VERTEX_GLSL = LIT_VERTEX_GLSL;
export const ASCII_FRAGMENT_GLSL = `#version 300 es
precision highp float;
uniform vec4 light; uniform vec4 cell; uniform sampler2D glyphs;
in vec4 vColor; in vec3 vN; out vec4 fragColor;
void main() {
  float l = max(dot(normalize(vN), normalize(light.xyz)), 0.0);
  float shade = light.w + (1.0 - light.w) * l;
  float glyphCount = max(cell.z, 1.0);
  float g = min(floor(shade * glyphCount), glyphCount - 1.0);
  vec2 c = vec2(max(cell.x, 1.0), max(cell.y, 1.0));
  vec2 inCell = fract(gl_FragCoord.xy / c);
  vec2 dim = vec2(textureSize(glyphs, 0));
  float tile = dim.y;
  float tx = clamp(g * tile + inCell.x * tile, 0.0, dim.x - 1.0);
  float ty = clamp(inCell.y * tile, 0.0, dim.y - 1.0);
  vec4 t = texelFetch(glyphs, ivec2(int(tx), int(ty)), 0);
  if (t.a < 0.5) discard;
  fragColor = vec4(vColor.rgb, 1.0);
}
`;

// ---- the pick shaders of the looks: the same vertex motion, identity for colour ---------------------------------------
/**
 * Every look spins its hull, so its pick shader spins it too; the ENCODING of the identity is lifted out of
 * gpuDriven's PICK_WGSL / PICK_VERTEX_GLSL by pattern rather than restated, so the two cannot drift. The sprite
 * looks' pick variant also samples the atlas and discards where the sprite is transparent: what the pick names is
 * the sprite's shape, not its quad.
 */
const ENCODE_WGSL = (/o\.id = [^\n]*;/.exec(PICK_WGSL) || [null])[0];
const ENCODE_GLSL = (/vId = [^\n]*;/.exec(PICK_VERTEX_GLSL) || [null])[0];
if (!ENCODE_WGSL || !ENCODE_GLSL) throw new Error("fleets: gpuDriven's pick encoding line was not found -- the pick shaders here derive it and cannot be built without it");
export const SPIN_PICK_WGSL = `
struct Cam { viewProj: mat4x4<f32> };
@group(0) @binding(0) var<uniform> cam: Cam;
${WGSL_SPIN}
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) @interpolate(flat) id: vec4<f32> };
@vertex fn vs(@location(0) p: vec3<f32>, @location(2) rec: vec4<f32>, @location(3) ident: vec4<f32>) -> VOut {
  var o: VOut;
  o.pos = cam.viewProj * vec4<f32>(rec.xyz + spun(p, ident.x) * rec.w, 1.0);
  let id = u32(ident.x);
  ${ENCODE_WGSL}
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> { return v.id; }
`;
export const SPIN_PICK_VERTEX_GLSL = `#version 300 es
precision highp float;
uniform mat4 viewProj;
in vec3 p; in vec4 rec; in vec4 ident;
flat out vec4 vId;
${GLSL_SPIN}
void main() {
  gl_Position = viewProj * vec4(rec.xyz + spun(p, ident.x) * rec.w, 1.0);
  int id = int(ident.x);
  ${ENCODE_GLSL}
}
`;
export const SPRITE_PICK_WGSL = `
struct Cam { viewProj: mat4x4<f32> };
@group(0) @binding(0) var<uniform> cam: Cam;
@group(0) @binding(1) var atlas: texture_2d<f32>;
${WGSL_SPIN}
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) @interpolate(flat) id: vec4<f32>, @location(1) uv: vec2<f32> };
@vertex fn vs(@location(0) p: vec3<f32>, @location(2) rec: vec4<f32>, @location(3) ident: vec4<f32>, @location(4) uv: vec2<f32>) -> VOut {
  var o: VOut;
  o.pos = cam.viewProj * vec4<f32>(rec.xyz + spun(p, ident.x) * rec.w, 1.0);
  let id = u32(ident.x);
  ${ENCODE_WGSL}
  o.uv = uv;
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> {
  let dim = vec2<f32>(textureDimensions(atlas));
  let t = textureLoad(atlas, vec2<i32>(clamp(v.uv * dim, vec2<f32>(0.0), dim - 1.0)), 0);
  if (t.a < 0.5) { discard; }
  return v.id;
}
`;
export const SPRITE_PICK_VERTEX_GLSL = `#version 300 es
precision highp float;
uniform mat4 viewProj;
in vec3 p; in vec4 rec; in vec4 ident; in vec2 uv;
flat out vec4 vId; out vec2 vUv;
${GLSL_SPIN}
void main() {
  gl_Position = viewProj * vec4(rec.xyz + spun(p, ident.x) * rec.w, 1.0);
  int id = int(ident.x);
  ${ENCODE_GLSL}
  vUv = uv;
}
`;
export const SPRITE_PICK_FRAGMENT_GLSL = `#version 300 es
precision highp float;
uniform sampler2D atlas;
flat in vec4 vId; in vec2 vUv; out vec4 fragColor;
void main() {
  vec2 dim = vec2(textureSize(atlas, 0));
  vec4 t = texelFetch(atlas, ivec2(clamp(vUv * dim, vec2(0.0), dim - 1.0)), 0);
  if (t.a < 0.5) discard;
  fragColor = vId;
}
`;
const SPIN_PICK = Object.freeze({ wgsl: SPIN_PICK_WGSL, glsl: { vertex: SPIN_PICK_VERTEX_GLSL, fragment: PICK_FRAGMENT_GLSL } });
const SPRITE_PICK = Object.freeze({ wgsl: SPRITE_PICK_WGSL, glsl: { vertex: SPRITE_PICK_VERTEX_GLSL, fragment: SPRITE_PICK_FRAGMENT_GLSL } });

/** The looks, by name: layout, shaders, pick shaders, uniforms, topology. A fleet is one of these plus its meshes. */
export const LOOKS = Object.freeze({
    flat: Object.freeze({ layout: LAYOUTS.flat, shaders: null, pick: null, uniforms: null, topology: null, note: "the Level 11 quad: colour, nothing else -- and no spin, so gpuDriven's own pick serves it" }),
    lit: Object.freeze({ layout: LAYOUTS.lit, shaders: { wgsl: LIT_WGSL, glsl: { vertex: LIT_VERTEX_GLSL, fragment: LIT_FRAGMENT_GLSL } }, pick: SPIN_PICK,
                          uniforms: [{ name: "viewProj", type: "mat4" }, { name: "light", type: "vec4" }], topology: null, note: "a lambert hull over flat normals" }),
    sprite: Object.freeze({ layout: LAYOUTS.sprite, shaders: { wgsl: SPRITE_WGSL, glsl: { vertex: SPRITE_VERTEX_GLSL, fragment: SPRITE_FRAGMENT_GLSL } }, pick: SPRITE_PICK,
                             uniforms: [{ name: "viewProj", type: "mat4" }], topology: null, note: "a textured quad, transparent texels discarded" }),
    holo: Object.freeze({ layout: LAYOUTS.lit, shaders: { wgsl: HOLO_WGSL, glsl: { vertex: HOLO_VERTEX_GLSL, fragment: HOLO_FRAGMENT_GLSL } }, pick: SPIN_PICK,
                           uniforms: [{ name: "viewProj", type: "mat4" }, { name: "light", type: "vec4" }, { name: "holo", type: "vec4" }], topology: null, note: "the swiftShaderPass HOLOGRAPHIC rainbow over a lambert hull, with a scanline" }),
    ink: Object.freeze({ layout: LAYOUTS.flat, shaders: { wgsl: INK_WGSL, glsl: { vertex: INK_VERTEX_GLSL, fragment: INK_FRAGMENT_GLSL } }, pick: SPIN_PICK,
                          uniforms: [{ name: "viewProj", type: "mat4" }], topology: "line-list", note: "strokes on a line-list -- a Krbn drawing lifted to 3D" }),
    ascii: Object.freeze({ layout: LAYOUTS.lit, shaders: { wgsl: ASCII_WGSL, glsl: { vertex: ASCII_VERTEX_GLSL, fragment: ASCII_FRAGMENT_GLSL } }, pick: SPIN_PICK,
                            uniforms: [{ name: "viewProj", type: "mat4" }, { name: "light", type: "vec4" }, { name: "cell", type: "vec4" }], topology: null, note: "an impression of an ASCII picture: screen cells, a glyph per lit shade" }),
});
/** The default light: from the upper left and a little toward the viewer, a third ambient. */
export const LIGHT = Object.freeze([-0.4, 0.7, 0.6, 0.35]);

// ---- meshes: the architectures -----------------------------------------------------------------------------------
/** Unweld a triangle mesh so every face carries its own flat normal (the lit looks want normals; a .glb or .obj may bring none). */
export function flatShade(mesh) {
    const src = mesh.positions, idx = mesh.indices, n = idx.length;
    const positions = new Float32Array(n * 3), normals = new Float32Array(n * 3), indices = new Uint32Array(n);
    for (let t = 0; t < n; t += 3) {
        const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
        const ux = src[b] - src[a], uy = src[b + 1] - src[a + 1], uz = src[b + 2] - src[a + 2];
        const vx = src[c] - src[a], vy = src[c + 1] - src[a + 1], vz = src[c + 2] - src[a + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
        for (let k = 0; k < 3; k++) { const s = idx[t + k] * 3, o = (t + k) * 3; positions[o] = src[s]; positions[o + 1] = src[s + 1]; positions[o + 2] = src[s + 2]; normals[o] = nx; normals[o + 1] = ny; normals[o + 2] = nz; indices[t + k] = t + k; }
    }
    return { positions, normals, indices, color: mesh.color || [1, 1, 1, 1] };
}
/** Centre a mesh on its bounds and scale it so its farthest vertex is `radius` from the centre -- the record's radius then means the same for every architecture. */
export function normalizeMesh(mesh, radius = 1) {
    const p = mesh.positions; if (!p.length) return mesh;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let c = 0; c < 3; c++) { if (p[i + c] < lo[c]) lo[c] = p[i + c]; if (p[i + c] > hi[c]) hi[c] = p[i + c]; }
    const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2, cz = (lo[2] + hi[2]) / 2;
    let far = 0; for (let i = 0; i < p.length; i += 3) far = Math.max(far, Math.hypot(p[i] - cx, p[i + 1] - cy, p[i + 2] - cz));
    const s = far > 0 ? radius / far : 1, positions = new Float32Array(p.length);
    for (let i = 0; i < p.length; i += 3) { positions[i] = (p[i] - cx) * s; positions[i + 1] = (p[i + 1] - cy) * s; positions[i + 2] = (p[i + 2] - cz) * s; }
    return { ...mesh, positions, scale: s, centre: [cx, cy, cz] };
}

/** A 3D wedge hull: nose on +x, two tail corners, a dorsal ridge and a keel -- six faces, flat-shaded. */
export function wedgeMesh(color = [0.8, 0.85, 0.9, 1]) {
    const v = [1, 0, 0, -0.7, 0.55, 0, -0.7, -0.55, 0, -0.35, 0, 0.28, -0.35, 0, -0.16];   // nose, tailL, tailR, top, bottom
    const idx = [0, 1, 3, 0, 3, 2, 1, 2, 3, 0, 4, 1, 0, 2, 4, 1, 4, 2];
    return normalizeMesh(flatShade({ positions: Float32Array.from(v), indices: Uint32Array.from(idx), color }));
}
/** The far level of any triangle fleet: one triangle pointing +x, in whatever layout (normals +z, uvs given). */
export function farMesh(color = [1, 1, 1, 1]) {
    return { positions: Float32Array.from([1, 0, 0, -0.8, 0.7, 0, -0.8, -0.7, 0]), indices: Uint32Array.from([0, 1, 2]), normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]), uvs: Float32Array.from([1, 0.5, 0, 0, 0, 1]), color };
}
/** A unit quad with uvs, for the sprite look (uv y down, as a bitmap's rows are). */
export function spriteQuadMesh(color = [1, 1, 1, 1]) {
    return { positions: Float32Array.from([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), uvs: Float32Array.from([0, 1, 1, 1, 1, 0, 0, 0]), normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
             indices: Uint32Array.from([0, 1, 2, 0, 2, 3]), color };
}

/** Three pixel ships, 16x16, drawn here so the sprite race owes nothing to any file. `#` hull, `+` bright, `o` glass. */
export const SPRITE_ART = Object.freeze([
    ["................", "................", ".......#........", ".......##.......", "......####......", "......#oo#......", ".....##oo##.....", "....########....", "...##########...", "..####+##+####..", ".###########.##.", "###..#####..###.", "#....+#+#+....#.", "......#.#.......", "......+.+.......", "................"],
    ["................", "................", "........#.......", ".......###......", ".......#o#......", "......#####.....", "......#o.o#.....", ".....#######....", ".....#o...o#....", "....##.....##...", "...###..#..###..", "..####..#..####.", ".#####.###.#####", ".#.#.+#####+.#.#", "....+.......+...", "................"],
    ["................", "................", "................", "....#......#....", "....##....##....", "....###..###....", "....##o##o##....", "..####oooo####..", ".######oo######.", "#######++#######", "#..###....###..#", "#..+#......#+..#", "....#......#....", "....+......+....", "................", "................"],
]);
const HULL = [0.72, 0.78, 0.9], BRIGHT = [1, 0.9, 0.4], GLASS = [0.35, 0.85, 1];
/** A sprite bitmap as an RGBA texture description: { width, height, data }. */
export function spriteBitmap(kind = 0, hull = HULL) {
    const rows = SPRITE_ART[kind % SPRITE_ART.length], h = rows.length, w = rows[0].length, data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const ch = rows[y][x], o = (y * w + x) * 4, c = ch === "#" ? hull : ch === "+" ? BRIGHT : ch === "o" ? GLASS : null;
        if (c) { data[o] = Math.round(c[0] * 255); data[o + 1] = Math.round(c[1] * 255); data[o + 2] = Math.round(c[2] * 255); data[o + 3] = 255; }
    }
    return { width: w, height: h, data, filled: rows.join("").replace(/\./g, "").length };
}

/** The ten-glyph ramp, darkest first, as 5x7 bitmaps drawn into 8x8 tiles -- tools/render-qa/asciify.mjs's RAMP, not a copy. */
export const ASCII_RAMP = RAMP;
const GLYPH_ROWS = {
    " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
    ".": [".....", ".....", ".....", ".....", ".....", "..#..", "....."],
    ":": [".....", "..#..", ".....", ".....", ".....", "..#..", "....."],
    "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
    "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
    "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
    "*": [".....", "#.#.#", ".###.", "#####", ".###.", "#.#.#", "....."],
    "#": [".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."],
    "%": ["##..#", "##.#.", "..#..", "..#..", "..#..", ".#.##", "#..##"],
    "@": [".###.", "#...#", "#.###", "#.#.#", "#.###", "#....", ".###."],
};
/** The glyph atlas: one 8x8 tile per ramp character, ink as alpha 255. { width, height, data, inkPerGlyph }. */
export function asciiAtlas(ramp = ASCII_RAMP, tile = 8) {
    const n = ramp.length, w = n * tile, h = tile, data = new Uint8Array(w * h * 4), inkPerGlyph = [];
    for (let g = 0; g < n; g++) {
        const rows = GLYPH_ROWS[ramp[g]] || GLYPH_ROWS["#"]; let ink = 0;
        // row 0 of the glyph is its top; the atlas is stored bottom-up (v = 0 at the bottom of a glyph quad), so row y lands at tile row 7 - y
        for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (rows[y][x] === "#") { const o = (((tile - 1 - y) * w) + g * tile + x + 1) * 4; data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 255; ink++; }
        inkPerGlyph.push(ink);
    }
    return { width: w, height: h, data, tile, inkPerGlyph, ramp };
}

/** A ship silhouette as an SVG path, for the hologram race when nobody hands over their own. */
export const DEFAULT_SHIP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><path d="M 5 30 L 40 20 L 55 5 L 62 5 L 60 20 L 92 26 L 96 30 L 92 34 L 60 40 L 62 55 L 55 55 L 40 40 Z"/></svg>`;
/** Extrude the largest outer shape of an SVG into a hull through mesh/extrudePolygon.mjs (watertight by construction), flat-shaded and normalised. */
export function svgHullMesh(svg = DEFAULT_SHIP_SVG, { depth = 0.25, color = [0.55, 0.9, 1, 1] } = {}) {
    const shapes = svgToShapes(svg); if (!shapes || !shapes.length) throw new Error("fleets: the SVG has no closed shape to extrude");
    const ex = extrudePolygon(shapes[0].outer.map((p) => [p.x, p.y]), depth);
    if (!ex.tris) throw new Error("fleets: the SVG's outline did not triangulate");
    const wt = watertight(ex.indices);
    return { ...normalizeMesh(flatShade({ positions: ex.positions, indices: ex.indices, color })), kind: "hull", watertight: wt, outline: shapes[0].outer.length };
}
/** A sprite bitmap lofted into a solid through fx/spritemesh/spriteMesh.js: alpha mask, radial contour, extrusion; then flat-shaded and normalised. */
export function loftMesh(bitmap, { depth = 0.35, segments = 48, color = [0.85, 0.8, 0.95, 1] } = {}) {
    const contour = radialContour(alphaMask(bitmap.data, bitmap.width, bitmap.height), bitmap.width, bitmap.height, segments);
    const ex = extrudeContour(contour, depth);
    const positions = Float32Array.from(ex.positions.flatMap((p) => [p[0], -p[1], p[2]]));   // the bitmap's rows go down; the hull's y goes up
    const indices = Uint32Array.from(ex.cells.flatMap((c) => [c[0], c[2], c[1]]));           // and the flip reverses the winding, so swap it back
    return { ...normalizeMesh(flatShade({ positions, indices, color })), kind: "hull", contour: contour.poly.length };
}
/**
 * The flight radar's voxel plane (ui/planeMeshLayer.js generators through gpu/voxelCreature.js), re-axed so the
 * fuselage runs along +x and up is +z as every hull here is laid out. Per-vertex colours travel (`colors`).
 */
export function voxelPlaneMesh(kind = "jet", { color = [0.9, 0.9, 0.95, 1] } = {}) {
    const gen = PLANE_GENERATORS[kind] || PLANE_GENERATORS.unknown;
    const v = buildVoxelMesh(gen(), { unit: 1 });
    const n = v.positions.length / 3, positions = new Float32Array(n * 3), normals = new Float32Array(n * 3), colors = new Float32Array(n * 4);
    const cs = v.colors.length / n;
    for (let i = 0; i < n; i++) {
        // (x wingspan, y up, z fuselage) -> (fuselage, wingspan, up)
        positions[i * 3] = v.positions[i * 3 + 2]; positions[i * 3 + 1] = v.positions[i * 3]; positions[i * 3 + 2] = v.positions[i * 3 + 1];
        normals[i * 3] = v.normals[i * 3 + 2]; normals[i * 3 + 1] = v.normals[i * 3]; normals[i * 3 + 2] = v.normals[i * 3 + 1];
        for (let k = 0; k < 4; k++) colors[i * 4 + k] = k < cs ? v.colors[i * cs + k] : 1;
    }
    return { ...normalizeMesh({ positions, normals, colors, indices: Uint32Array.from(v.indices), color }), kind: "hull", voxels: v.voxelCount };
}
/**
 * ASCII glyph quads pinned to a hull's surface (tools/export/reskin.js: area-weighted samples, a quad in each
 * tangent plane, the glyph chosen by the lit shade at the sample). Drawn through the sprite look over the glyph
 * atlas. The blend hook is a stand-in: these hulls have no skeleton.
 */
export function glyphSkinMesh(hull, { count = 320, seed = 1337, size = 0.16, color = [0.55, 1, 0.6, 1] } = {}) {
    const samples = surfaceSamples(hull.positions, hull.indices, { count, seed });
    const q = buildGlyphQuads({ positions: hull.positions, normals: hull.normals, indices: hull.indices, joints: null, weights: null }, samples,
                              () => ({ J: [0, 0, 0, 0], W: [1, 0, 0, 0] }), { size, levels: RAMP.length, atlasPx: RAMP.length * 8 });
    return { positions: q.positions, uvs: q.uvs, indices: q.indices, color, kind: "glyphs", quads: q.stats.quads, levels: q.stats.levelHistogram };
}

/**
 * Parse a Wavefront OBJ: `v`, `vn`, `f` (any polygon, fan-triangulated, v/vt/vn forms) and `l` polylines (what
 * tools/krbn/strokeLift.js toOBJ() writes). Returns { positions, normals|null, indices (triangles), lines
 * (segment pairs), faces, polylines }. A mesh with faces feeds the lit looks; one with only lines feeds ink.
 */
export function parseObj(text) {
    const v = [], vn = [], faces = [], lines = [];
    const key = new Map(), positions = [], normals = [];
    const vert = (tok) => { const [vi, , ni] = tok.split("/"); const k = vi + "/" + (ni || ""); if (key.has(k)) return key.get(k);
        const i = positions.length / 3, a = (parseInt(vi, 10) - 1) * 3, b = ni ? (parseInt(ni, 10) - 1) * 3 : -1;
        positions.push(v[a], v[a + 1], v[a + 2]); if (b >= 0) normals.push(vn[b], vn[b + 1], vn[b + 2]); else normals.push(0, 0, 0); key.set(k, i); return i; };
    for (const raw of String(text).split(/\r?\n/)) {
        const line = raw.trim(); if (!line || line[0] === "#") continue;
        const t = line.split(/\s+/);
        if (t[0] === "v") v.push(+t[1], +t[2], +t[3]);
        else if (t[0] === "vn") vn.push(+t[1], +t[2], +t[3]);
        else if (t[0] === "f") { const ids = t.slice(1).map(vert); for (let k = 1; k + 1 < ids.length; k++) faces.push(ids[0], ids[k], ids[k + 1]); }
        else if (t[0] === "l") { const ids = t.slice(1).map(vert); for (let k = 0; k + 1 < ids.length; k++) lines.push(ids[k], ids[k + 1]); }
    }
    const hasN = vn.length > 0 && faces.length > 0;
    return { positions: Float32Array.from(positions), normals: hasN ? Float32Array.from(normals) : null, indices: Uint32Array.from(faces), lines: Uint32Array.from(lines),
             faces: faces.length / 3, polylines: lines.length / 2, vertices: positions.length / 3 };
}
/** An OBJ as a fleet mesh: faces -> a flat-shaded (or normal-carrying) hull; lines only -> an ink stroke mesh whose `indices` are the segments. */
export function objToMesh(parsed, { color = [1, 1, 1, 1], radius = 1 } = {}) {
    if (parsed.faces > 0) { const m = parsed.normals ? { positions: parsed.positions, normals: parsed.normals, indices: parsed.indices, color } : flatShade({ positions: parsed.positions, indices: parsed.indices, color }); return { ...normalizeMesh(m, radius), kind: "hull" }; }
    if (parsed.polylines > 0) return { ...normalizeMesh({ positions: parsed.positions, indices: parsed.lines, color }, radius), kind: "strokes" };
    throw new Error("fleets: the OBJ has neither faces nor lines");
}
/** A .glb (physics/mesh/glb.mjs parseGLB) as a flat-shaded, normalised hull. */
export function glbToMesh(buffer, { color = [1, 1, 1, 1], radius = 1 } = {}) {
    const g = parseGLB(buffer);
    return { ...normalizeMesh(flatShade({ positions: Float32Array.from(g.positions), indices: Uint32Array.from(g.indices), color }), radius), kind: "hull", triangles: g.triangles };
}
/** A three.js BufferGeometry (what GLTFLoader hands esShipModels) as a hull: position + normal attributes, or flat-shaded when it has no normals. */
export function threeGeometryToMesh(geom, { color = [1, 1, 1, 1], radius = 1 } = {}) {
    const pos = geom.attributes && geom.attributes.position; if (!pos) throw new Error("fleets: the geometry has no position attribute");
    const positions = Float32Array.from(pos.array), n = positions.length / 3;
    const indices = geom.index ? Uint32Array.from(geom.index.array) : Uint32Array.from({ length: n }, (_, i) => i);
    const nor = geom.attributes.normal;
    const m = nor ? { positions, normals: Float32Array.from(nor.array), indices, color } : flatShade({ positions, indices, color });
    return { ...normalizeMesh(m, radius), kind: "hull" };
}

/** A Krbn-style drawing of a ship: an outline and hatch strokes, as polylines the way strokeLift lifts them (flat, z = 0). */
export function strokeShipPolylines() {
    const outline = [[1, 0, 0], [0.2, 0.35, 0], [-0.5, 0.6, 0], [-0.8, 0.2, 0], [-0.8, -0.2, 0], [-0.5, -0.6, 0], [0.2, -0.35, 0], [1, 0, 0]];
    const cockpit = [[0.45, 0.12, 0], [0.2, 0.2, 0], [0.05, 0.1, 0], [0.05, -0.1, 0], [0.2, -0.2, 0], [0.45, -0.12, 0], [0.45, 0.12, 0]];
    const hatch = []; for (let k = 0; k < 4; k++) { const x = -0.7 + k * 0.14; hatch.push([[x, 0.15 + k * 0.1, 0], [x + 0.1, -0.15 - k * 0.1, 0]]); }
    return [outline, cockpit, ...hatch];
}
/** Polylines (arrays of [x,y,z]) as an ink mesh: `indices` are line segments, ready for the line-list look. */
export function polylinesToMesh(polylines, { color = [0.1, 0.08, 0.06, 1], radius = 1, normalize = true } = {}) {
    const positions = [], indices = []; let base = 0;
    for (const poly of polylines) { for (const p of poly) positions.push(p[0], p[1], p[2] || 0); for (let k = 0; k + 1 < poly.length; k++) indices.push(base + k, base + k + 1); base += poly.length; }
    const raw = { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), color };
    return { ...(normalize ? normalizeMesh(raw, radius) : raw), kind: "strokes", segments: indices.length / 2 };
}

// ---- the Krbn skin: raise the hull, then draw on it ------------------------------------------------------------------
/**
 * "We are able to krbn skin a model after we raise its points." So the Krbn race is not a flat sketch: the hull is
 * RAISED first (a 3D mesh, the wedge or the user's own), the drawing is made over it in Krbn's screen space
 * (hatching across the hull's projected bounds -- marks along no mesh edge), and tools/krbn/strokeLift.js lifts
 * every stroke point back onto the SURFACE by ray-cast. What comes out is the drawing wrapped on the model: 3D
 * polylines lying on the hull's faces, breaking where a stroke leaves the silhouette. That is the ink fleet's
 * geometry. The hull itself is paper: not drawn, so the skin reads as a drawing and the strokes of the far side
 * were never made (the lift hits the first surface only, as Krbn's camera sees it).
 *
 * The hull is scaled up for the lift (KRBN_CAM sits ten units out with a 720x560 viewport; a unit hull would take a
 * handful of hatch lines) and the lifted points scaled back, so the skin sits on the hull at the hull's size.
 */
export function toKrbnMesh(mesh, scale = 1) {
    const positions = [], triangles = [];
    for (let i = 0; i < mesh.positions.length; i += 3) positions.push([mesh.positions[i] * scale, mesh.positions[i + 1] * scale, mesh.positions[i + 2] * scale]);
    for (let t = 0; t < mesh.indices.length; t += 3) triangles.push([mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]]);
    return { positions, triangles };
}
export function krbnSkin(hull, { cam = KRBN_CAM, scale = 3, spacing = 14, step = 3, color = [0.12, 0.09, 0.07, 1] } = {}) {
    const km = toKrbnMesh(hull, scale);
    const b = drawingBounds(km, cam);
    const strokes = hatchStrokes(b.x0, b.y0, b.x1, b.y1, spacing, step);
    const lifted = liftStrokes(strokes, km, cam).map((poly) => poly.map((p) => [p[0] / scale, p[1] / scale, p[2] / scale]));
    if (!lifted.length) throw new Error("fleets: no stroke landed on the hull -- the drawing missed the model");
    const mesh = polylinesToMesh(lifted, { color, normalize: false });
    return { mesh, lifted, strokes, bounds: b, points: lifted.reduce((s, p) => s + p.length, 0), drawn: strokes.reduce((s, p) => s + p.length, 0) };
}
/** The far level of a stroke fleet: one segment, nose to tail. */
export function farStrokeMesh(color = [0.1, 0.08, 0.06, 1]) { return { positions: Float32Array.from([1, 0, 0, -1, 0, 0]), indices: Uint32Array.from([0, 1]), color }; }

// ---- the user's own models -----------------------------------------------------------------------------------------
export const USER_MODEL_KEYS = Object.freeze({ ships: "swek.esShipModels.v1", planes: "voxelengine.planeModels" });
/**
 * What the person already assigned: EV ship classes (url + yaw per class) and flight-radar plane classes (an
 * asset id or a /GPU_Assets/ URL per class). `storage` is anything with getItem (localStorage in a page, a mock
 * in the gate). Each source: { kind: "ships"|"planes", cls, url, yaw, loadable, why }.
 */
export function userModelSources(storage) {
    const out = [];
    const read = (k) => { try { const v = storage && storage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
    const ships = read(USER_MODEL_KEYS.ships) || {};
    for (const cls of Object.keys(ships)) { const a = ships[cls]; if (!a || !a.url) continue; out.push(describeSource({ kind: "ships", cls, url: a.url, yaw: a.yaw || 0 })); }
    const planes = read(USER_MODEL_KEYS.planes) || {};
    for (const cls of Object.keys(planes)) { const a = planes[cls]; if (!a) continue; out.push(describeSource({ kind: "planes", cls, url: String(a), yaw: 0 })); }
    return out;
}
function describeSource(s) {
    const u = s.url.toLowerCase();
    if (/^sprite:/.test(u)) return { ...s, loadable: false, why: "an EV sprite loft (three.js) -- does not travel to the device path" };
    if (/^blob:/.test(u)) return { ...s, loadable: false, why: "a picked file's blob URL, which died with its session" };
    if (/\.glb(\?|$)/.test(u)) return { ...s, loadable: true, format: "glb" };
    if (/\.obj(\?|$)/.test(u)) return { ...s, loadable: true, format: "obj" };
    if (/^\//.test(u) || /^https?:/.test(u)) return { ...s, loadable: false, why: "a URL without a .glb or .obj extension -- the format is not knowable from the name" };
    return { ...s, loadable: false, why: "an asset-library id, resolved by the radar's asset loader and not by a fetch" };
}
/** Fetch and convert one loadable source into a hull mesh. `fetchFn` defaults to the global fetch. */
export async function loadUserModel(source, { fetchFn = (typeof fetch === "function" ? fetch : null), color = [0.9, 0.85, 0.7, 1] } = {}) {
    if (!source || !source.loadable) throw new Error("fleets: " + (source ? source.why : "no source"));
    if (!fetchFn) throw new Error("fleets: no fetch to load the model with");
    const r = await fetchFn(source.url); if (!r.ok) throw new Error(`fleets: ${source.url} answered ${r.status}`);
    if (source.format === "glb") return glbToMesh(await r.arrayBuffer(), { color });
    return objToMesh(parseObj(await r.text()), { color });
}

// ---- the races -------------------------------------------------------------------------------------------------------
/** The nine races and the honest word on each. `look` names LOOKS; the mesh source is what standardFleets() builds. */
export const RACES = Object.freeze([
    Object.freeze({ name: "Union", look: "flat", architecture: "flat quads", color: [1, 0.85, 0.35, 1], note: "the Level 11 hauler, unchanged -- the control" }),
    Object.freeze({ name: "Wedge", look: "lit", architecture: "3D hull, six flat faces", color: [0.8, 0.85, 0.95, 1], note: "the first race with a normal; a user's .glb or .obj replaces its hull" }),
    Object.freeze({ name: "Pixel", look: "sprite", architecture: "16x16 sprite on a quad", color: [1, 1, 1, 1], note: "a bitmap drawn in source; transparent texels are discarded, so the pick sees the sprite's shape" }),
    Object.freeze({ name: "Loft", look: "lit", architecture: "the same sprite lofted into a solid", color: [0.95, 0.58, 0.3, 1], note: "fx/spritemesh/spriteMesh.js: alpha mask, radial contour, extrusion -- a sprite spaceship in 3D" }),
    Object.freeze({ name: "Voxel", look: "lit", architecture: "the flight radar's voxel jet", color: [0.9, 0.9, 0.95, 1], note: "ui/planeMeshLayer.js's generator through gpu/voxelCreature.js -- the default plane model, per-vertex colours" }),
    Object.freeze({ name: "Holo", look: "holo", architecture: "SVG silhouette, extruded", color: [0.5, 0.9, 1, 1], note: "the swiftShaderPass HOLOGRAPHIC rainbow, as a hull shader" }),
    Object.freeze({ name: "Krbn", look: "ink", architecture: "a raised hull, krbn-skinned: strokes lifted onto its surface, on a line-list", color: [0.12, 0.09, 0.07, 1], note: "the drawing wraps the 3D model (tools/krbn/strokeLift.js); harder than it looks because a line has no area to pick or light" }),
    Object.freeze({ name: "Glyph", look: "sprite", architecture: "ASCII glyph quads pinned to the hull's surface", color: [0.55, 1, 0.6, 1], note: "tools/export/reskin.js's glyph skin, the ramp shared with the ASCII view; sparse by nature" }),
    Object.freeze({ name: "Cells", look: "ascii", architecture: "3D hull seen through screen cells", color: [0.6, 0.95, 1, 1], note: "an impression of ASCII: glyph per lit shade, in 8x8 screen cells; the pick names the hull, cells or not" }),
]);
/** A deterministic fleet for a trader's name: the owner (before a `/`) hashed, so every ship of one owner is one race. */
export function fleetForName(name, fleetCount = RACES.length) {
    const owner = String(name || "").split("/")[0].trim().toLowerCase();
    let h = 2166136261; for (let i = 0; i < owner.length; i++) { h ^= owner.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return fleetCount > 0 ? h % fleetCount : 0;
}
/** fleetOf for a list of names. */
export function fleetsForNames(names, fleetCount = RACES.length) { return Uint32Array.from(names, (n) => fleetForName(n, fleetCount)); }

/**
 * The nine fleets, built on a device: meshes, layouts, pipelines, textures and bind hooks, ready for
 * makeGpuDrivenScene({ fleets, fleetOf }). Two levels each, "near" (the architecture) and "far" (one triangle
 * or one segment in the same layout), so every fleet climbs the scene's one-threshold ladder.
 *   userHull:  an optional mesh (from loadUserModel) that replaces the hull the Wedge, Krbn, Glyph and Cells
 *              races are built on -- the person's own ship, raised, skinned, glyphed and celled
 *   cell:      the ASCII cell size in pixels
 */
export function standardFleets(device, { userHull = null, cell = 8, svg = DEFAULT_SHIP_SVG, sprite = 0, plane = "jet", light = LIGHT, clock = null } = {}) {
    const sb = spriteBitmap(sprite), ga = asciiAtlas();
    const spriteTex = device.texture({ width: sb.width, height: sb.height, data: sb.data, nearest: true });
    const glyphTex = device.texture({ width: ga.width, height: ga.height, data: ga.data, nearest: true });
    const now = clock || ((ctx) => ctx.time);
    const hull = () => (userHull ? { ...userHull, color: userHull.color || RACES[1].color } : wedgeMesh(RACES[1].color));
    const meshFor = (race) => {
        switch (race.name) {
            case "Union": return { near: { positions: Float32Array.from([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), indices: Uint32Array.from([0, 1, 2, 0, 2, 3]), color: race.color }, far: farMesh(race.color) };
            case "Wedge": return { near: hull(), far: farMesh(race.color) };
            case "Pixel": return { near: spriteQuadMesh(race.color), far: farMesh(race.color) };
            case "Loft": return { near: loftMesh(sb, { color: race.color }), far: farMesh(race.color) };
            case "Voxel": return { near: voxelPlaneMesh(plane, { color: race.color }), far: farMesh(race.color) };
            case "Holo": return { near: svgHullMesh(svg, { color: race.color }), far: farMesh(race.color) };
            case "Krbn": return { near: krbnSkin(hull(), { color: race.color }).mesh, far: farStrokeMesh(race.color) };
            case "Glyph": return { near: glyphSkinMesh(hull(), { color: race.color }), far: farMesh(race.color) };
            case "Cells": return { near: hull(), far: farMesh(race.color) };
        }
        throw new Error("fleets: unknown race " + race.name);
    };
    const bindFor = (race) => {
        switch (race.look) {
            case "lit": return (pass) => pass.uniform("light", light);
            case "sprite": return race.name === "Glyph" ? (pass) => pass.texture("atlas", glyphTex, 0) : (pass) => pass.texture("atlas", spriteTex, 0);
            case "holo": return (pass, ctx) => { pass.uniform("light", light); pass.uniform("holo", [now(ctx), 40, 1.5, 0.6]); };
            case "ascii": return (pass) => { pass.uniform("light", light); pass.uniform("cell", [cell, cell, ga.ramp.length, 0]); pass.texture("glyphs", glyphTex, 0); };
            default: return null;
        }
    };
    const fleets = RACES.map((race) => {
        const look = LOOKS[race.look], m = meshFor(race);
        const buffers = layoutBuffersOf(look.layout);   // the descriptors take their buffers from the layout, so shaders and layout never disagree
        const tex = race.name === "Glyph" ? glyphTex : spriteTex;
        return { name: race.name, race, look: race.look, layout: look.layout, topology: look.topology,
                 pipeline: look.shaders ? { shaders: look.shaders, vs: "vs", fs: "fs", buffers, uniforms: look.uniforms, ...(look.topology ? { topology: look.topology } : {}) } : null,
                 pickPipeline: look.pick ? { shaders: look.pick, vs: "vs", fs: "fs", buffers, uniforms: [{ name: "viewProj", type: "mat4" }], ...(look.topology ? { topology: look.topology } : {}) } : null,
                 pickBind: look.pick === SPRITE_PICK ? (pass) => pass.texture("atlas", tex, 0) : null,
                 lods: [{ name: "near", mesh: m.near }, { name: "far", mesh: m.far }], bind: bindFor(race), userHull: ["Wedge", "Krbn", "Glyph", "Cells"].includes(race.name) && !!userHull };
    });
    return { fleets, textures: { sprite: spriteTex, glyphs: glyphTex }, atlas: ga, sprite: sb, destroy() { try { spriteTex.destroy(); glyphTex.destroy(); } catch (e) {} } };
}
import { layoutBuffers as layoutBuffersOf } from "./gpuDriven.mjs";
