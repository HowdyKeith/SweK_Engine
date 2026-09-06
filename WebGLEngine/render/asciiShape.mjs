// WebGLEngine/render/asciiShape.mjs -- v4505
//
// *** SHAPE-AWARE ASCII: A GLYPH PICKED BY WHERE ITS INK SITS, NOT BY HOW MUCH THERE IS (task 51). *** The idea is
// edoardolunardi/ascii-logo (MIT, (c) 2009-2026 Codrops; world/reachedLicences.mjs), READ AND HAND-WRITTEN, nothing
// copied: its glyph-atlas.js measures every printable ASCII glyph at six interior points -- a disc average at each --
// giving each glyph a SIX-DIMENSIONAL coverage vector, normalised per sample position across the whole set, and its
// cell shader takes the same six samples of the scene per cell and picks the nearest vector by squared distance. That is
// what tools/ship/asciiLut.mjs (v3776) cannot do: it picks by ONE scalar per cell, so a diagonal edge and a flat mid-grey
// patch with the same mean brightness get the same glyph. asciiLut's own header names this category -- the multi-sample
// method stong/gradscii-art (AGPL-3.0) set out to beat the traditional approach with -- as the one it declined for the
// licence alone. ascii-logo is the same category and MIT.
//
// DERIVE, DON'T ASSERT, as asciiLut does: the vectors here are MEASURED from the tree's own font. Each of the 95 glyphs is
// rasterised into a cell by text/slugEval.js's slugRender over the vendored Plex atlas (the same evaluator every Slug gate
// keys on), the six discs are averaged over that raster, and each of the six columns is divided by its peak across the
// set. The table ships as a 6 x 95 rgba8 texture (the value in R, QUANTISED TO A BYTE on the way in, so the CPU twin and
// both fragments compare against the same numbers); the cell pass writes the winning index to R as index / 255 and the
// cell's mean luminance to G. The scene is sampled NEAREST at integer texels on both sides, and the search keeps the
// first of equals (strict <), so the CPU twin's argmin and the fragment's agree exactly wherever the two best distances
// are not within f32 of each other; tools/ship/asciiShape-selfcheck.mjs counts those near-ties rather than hiding them.
//
// NOT TAKEN from ascii-logo, and why: its ten OUTER samples with a directional contrast (pow) and the per-cell CONTRAST
// pow are weights on the same six numbers that make an edge pick more decisively; they are tuning rather than the
// method, and a pow() in f32 would move near-ties the gate can otherwise count. The glyph SHEET it prints with is not
// needed here at all: the page draws the picked glyphs through render/slugDevice.mjs from the same font the vectors
// were measured on.
"use strict";
import { slugRender } from "../text/slugEval.js";

/** space through tilde: 95 glyphs, index = codepoint - 32 */
export const GLYPHS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));
export const GLYPH_COUNT = 95;
/** six sample points per cell as fractions, y DOWN, the right column riding higher so a diagonal reads as one (ascii-logo's layout) */
export const INNER_SAMPLES = Object.freeze([[0.28, 0.26], [0.72, 0.14], [0.28, 0.56], [0.72, 0.44], [0.28, 0.86], [0.72, 0.74]]);
/** the atlas disc radius as a fraction of the cell height, and the scene's ring radius (a centre tap plus six taps) */
export const ATLAS_RADIUS = 0.26, RING_RADIUS = 0.161;
export const RING = Object.freeze([[1, 0], [0.5, 0.8660254], [-0.5, 0.8660254], [-1, 0], [-0.5, -0.8660254], [0.5, -0.8660254]]);
export const LUMA = Object.freeze([0.2126, 0.7152, 0.0722]);
export const KNOBS = Object.freeze(["cellW", "cellH", "sceneW", "sceneH"]);

/**
 * Rasterise one glyph into a cellW x cellH coverage raster through slugRender: the em is EM_PER_CELL_H of the cell's
 * height, the baseline at BASELINE of the height from the top, the glyph centred by its advance. Coverage per pixel at
 * the pixel's centre with the pixel's own footprint in ems.
 */
export const EM_PER_CELL_H = 0.85, BASELINE = 0.78;
export function glyphRaster(atlas, entry, advance, cellW, cellH) {
    const out = new Float32Array(cellW * cellH);
    if (!entry || !entry.bbox) return out;
    const s = cellH * EM_PER_CELL_H, x0 = (cellW - advance * s) / 2, by = cellH * BASELINE, ems = [1 / s, 1 / s];
    const bb = entry.bbox;
    for (let j = 0; j < cellH; j++) for (let i = 0; i < cellW; i++) {
        const tx = (i + 0.5 - x0) / s, ty = (by - (j + 0.5)) / s;
        if (tx < bb.x0 - 0.02 || tx > bb.x1 + 0.02 || ty < bb.y0 - 0.02 || ty > bb.y1 + 0.02) continue;
        out[j * cellW + i] = slugRender(atlas, entry, tx, ty, ems);
    }
    return out;
}

/** the six disc averages of a raster (ascii-logo's shapeVectors, one glyph): a disc of ATLAS_RADIUS x cellH at each sample point */
export function discVector(raster, cellW, cellH) {
    const v = new Float32Array(INNER_SAMPLES.length), radius = cellH * ATLAS_RADIUS;
    INNER_SAMPLES.forEach(([fx, fy], k) => {
        const cx = fx * cellW, cy = fy * cellH; let sum = 0, total = 0;
        for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
            const dx = x + 0.5 - cx, dy = y + 0.5 - cy; if (dx * dx + dy * dy > radius * radius) continue;
            total++; if (x < 0 || y < 0 || x >= cellW || y >= cellH) continue;
            sum += raster[y * cellW + x];
        }
        v[k] = total > 0 ? sum / total : 0;
    });
    return v;
}

/**
 * The whole table: 95 x 6, derived from a font device (render/slugDevice.mjs's, on any backend -- only its atlas and
 * entries are read) and normalised per sample position. `bytes` is the rgba8 upload (R = round(v * 255)), `vectors` the
 * SAME numbers as bytes / 255, which is what every comparison uses; `raw` is the unnormalised measurement.
 */
export function shapeTable(fontDevice, cellW = 24, cellH = 40) {
    const font = fontDevice.font, n = GLYPHS.length, raw = new Float32Array(n * 6);
    for (let g = 0; g < n; g++) {
        const gi = font.glyphIndex(32 + g), entry = gi > 0 ? fontDevice.entryFor(gi) : null;
        const adv = gi > 0 ? font.advance(gi) : 0.5;
        raw.set(discVector(gi > 0 ? glyphRaster(fontDevice.atlas, entry, adv, cellW, cellH) : new Float32Array(cellW * cellH), cellW, cellH), g * 6);
    }
    const norm = new Float32Array(raw);
    for (let k = 0; k < 6; k++) { let peak = 0; for (let g = 0; g < n; g++) peak = Math.max(peak, norm[g * 6 + k]); if (peak > 0) for (let g = 0; g < n; g++) norm[g * 6 + k] /= peak; }
    const bytes = new Uint8ClampedArray(6 * n * 4), vectors = new Float32Array(n * 6);
    for (let g = 0; g < n; g++) for (let k = 0; k < 6; k++) { const b = Math.round(norm[g * 6 + k] * 255); bytes[(g * 6 + k) * 4] = b; bytes[(g * 6 + k) * 4 + 3] = 255; vectors[g * 6 + k] = b / 255; }
    return { raw, vectors, bytes, w: 6, h: n, cellW, cellH };
}

/** the nearest glyph to a six-vector: squared distance, the FIRST of equals */
export function nearestGlyph(v, vectors, n = GLYPH_COUNT) {
    let best = 0, bestD = Infinity, second = Infinity;
    for (let g = 0; g < n; g++) { let d = 0; for (let k = 0; k < 6; k++) { const t = v[k] - vectors[g * 6 + k]; d += t * t; }
        if (d < bestD) { second = bestD; bestD = d; best = g; } else if (d < second) second = d; }
    return { index: best, d: bestD, margin: second - bestD };
}

/** the scene's six samples for cell (cx, cy): a centre tap plus six ring taps, each the NEAREST texel's luminance, averaged */
export function cellVector(scene, cellW, cellH, cx, cy) {
    const v = new Float32Array(6), r = cellH * RING_RADIUS;
    const tap = (px, py) => { const x = Math.floor(px), y = Math.floor(py); if (x < 0 || y < 0 || x >= scene.w || y >= scene.h) return 0;
        const o = (y * scene.w + x) * 4; return (scene.rgba[o] * LUMA[0] + scene.rgba[o + 1] * LUMA[1] + scene.rgba[o + 2] * LUMA[2]) / 255; };
    INNER_SAMPLES.forEach(([fx, fy], k) => { const mx = cx * cellW + fx * cellW, my = cy * cellH + fy * cellH; let acc = tap(mx, my); for (const [rx, ry] of RING) acc += tap(mx + rx * r, my + ry * r); v[k] = acc / 7; });
    return v;
}

/** the CPU twin of the cell pass: per cell the winning index and the mean of its six samples; cols x rows cells over the scene */
export function asciiShapeCpu(scene, table, cellW, cellH) {
    const cols = Math.floor(scene.w / cellW), rows = Math.floor(scene.h / cellH);
    const index = new Uint8Array(cols * rows), mean = new Float32Array(cols * rows), margin = new Float32Array(cols * rows);
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
        const v = cellVector(scene, cellW, cellH, cx, cy), best = nearestGlyph(v, table.vectors);
        let m = 0; for (let k = 0; k < 6; k++) m += v[k]; m /= 6;
        index[cy * cols + cx] = best.index; mean[cy * cols + cx] = m; margin[cy * cols + cx] = best.margin;
    }
    return { cols, rows, index, mean, margin };
}

/* ---------------------------------------------------------------------------------------------------------
 * The cell pass, both languages: one fragment per cell (the target is cols x rows), the scene read by integer texel,
 * the table by integer texel, the winner in R as index / 255 and the mean luminance in G.
 * ------------------------------------------------------------------------------------------------------- */
const SAMPLES_GLSL = INNER_SAMPLES.map(([x, y]) => `vec2(${x}, ${y})`).join(", ");
const RING_GLSL = RING.map(([x, y]) => `vec2(${x}, ${y})`).join(", ");
const SAMPLES_WGSL = INNER_SAMPLES.map(([x, y]) => `vec2f(${x}, ${y})`).join(", ");
const RING_WGSL = RING.map(([x, y]) => `vec2f(${x}, ${y})`).join(", ");

export const VERTEX_GLSL = `#version 300 es
precision highp float;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2) * 2.0 - 1.0, float(gl_VertexID & 2) * 2.0 - 1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

export const FRAGMENT_GLSL = `#version 300 es
precision highp float;
uniform float cellW; uniform float cellH; uniform float sceneW; uniform float sceneH;
uniform sampler2D tScene;
uniform sampler2D tShapes;
out vec4 fragColor;
const vec2 INNER[6] = vec2[6](${SAMPLES_GLSL});
const vec2 RING[6] = vec2[6](${RING_GLSL});
float tap(vec2 p) {
  ivec2 t = ivec2(floor(p));
  if (t.x < 0 || t.y < 0 || t.x >= int(sceneW) || t.y >= int(sceneH)) return 0.0;
  vec3 c = texelFetch(tScene, t, 0).rgb;
  return dot(c, vec3(${LUMA.join(", ")}));
}
void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  cell.y = float(textureSize(tScene, 0).y) / cellH - 1.0 - cell.y;
  float r = cellH * ${RING_RADIUS};
  float v[6]; float mean = 0.0;
  for (int i = 0; i < 6; i++) {
    vec2 m = cell * vec2(cellW, cellH) + INNER[i] * vec2(cellW, cellH);
    float acc = tap(m);
    for (int k = 0; k < 6; k++) acc += tap(m + RING[k] * r);
    v[i] = acc / 7.0; mean += v[i];
  }
  int best = 0; float bestD = 1e9;
  for (int g = 0; g < ${GLYPH_COUNT}; g++) {
    float d = 0.0;
    for (int i = 0; i < 6; i++) { float t = v[i] - texelFetch(tShapes, ivec2(i, g), 0).r; d += t * t; }
    if (d < bestD) { bestD = d; best = g; }
  }
  fragColor = vec4(float(best) / 255.0, mean / 6.0, 0.0, 1.0);
}`;

export const FRAGMENT_WGSL = `struct U { cellW: f32, cellH: f32, sceneW: f32, sceneH: f32 };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var tScene: texture_2d<f32>;
@group(0) @binding(2) var tShapes: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[vi], 0.0, 1.0);
}

const INNER = array<vec2f, 6>(${SAMPLES_WGSL});
const RING = array<vec2f, 6>(${RING_WGSL});

fn tap(p: vec2f) -> f32 {
  let t = vec2i(floor(p));
  if (t.x < 0 || t.y < 0 || t.x >= i32(u.sceneW) || t.y >= i32(u.sceneH)) { return 0.0; }
  let c = textureLoad(tScene, t, 0).rgb;
  return dot(c, vec3f(${LUMA.join(", ")}));
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let cell = floor(pos.xy);
  let r = u.cellH * ${RING_RADIUS};
  var v: array<f32, 6>; var mean = 0.0;
  for (var i = 0; i < 6; i++) {
    let m = cell * vec2f(u.cellW, u.cellH) + INNER[i] * vec2f(u.cellW, u.cellH);
    var acc = tap(m);
    for (var k = 0; k < 6; k++) { acc += tap(m + RING[k] * r); }
    v[i] = acc / 7.0; mean += v[i];
  }
  var best = 0; var bestD = 1e9;
  for (var g = 0; g < ${GLYPH_COUNT}; g++) {
    var d = 0.0;
    for (var i = 0; i < 6; i++) { let t = v[i] - textureLoad(tShapes, vec2i(i, g), 0).r; d += t * t; }
    if (d < bestD) { bestD = d; best = g; }
  }
  return vec4f(f32(best) / 255.0, mean / 6.0, 0.0, 1.0);
}`;

export function asciiShapePipelineDesc() {
    return {
        shaders: { wgsl: FRAGMENT_WGSL, glsl: { vertex: VERTEX_GLSL, fragment: FRAGMENT_GLSL } },
        vs: "vs", fs: "fs",
        attributes: [], stride: 0,
        uniforms: KNOBS.map((name) => ({ name, type: "f32" })),
    };
}

/** upload the table (6 x 95 rgba8, nearest) and a scene (rgba8, nearest) */
export function shapeTexture(device, table) { return device.texture({ format: "rgba8unorm", width: table.w, height: table.h, data: table.bytes, nearest: true }); }
export function sceneTexture(device, scene) { return device.texture({ format: "rgba8unorm", width: scene.w, height: scene.h, data: scene.rgba, nearest: true }); }

/** draw one cell frame inside a pass whose target is cols x rows pixels */
export function drawAsciiShape(pass, pipeline, sceneTex, shapesTex, cellW, cellH, sceneW, sceneH) {
    pass.use(pipeline);
    pass.uniform("cellW", cellW); pass.uniform("cellH", cellH); pass.uniform("sceneW", sceneW); pass.uniform("sceneH", sceneH);
    pass.texture("tScene", sceneTex, 0); pass.texture("tShapes", shapesTex, 1);
    pass.draw(3);
}
