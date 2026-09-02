// WebGLEngine/render/fleetMask.mjs -- v4317 (Level 17), v4318 (the mask on the device)
//
// LEVEL 17: THE IDENTITY PICTURE AS A MASK. Level 15 drew every race in its own fragment shader; a POST look --
// badTv, crt, the SwiftUI ports -- cannot be done per race in a fragment stage, because by then the pixel does not
// know whose it is. The pick picture does: every pixel names its record and its fleet. So the pick picture becomes
// a STRENGTH FIELD (Level 11's kind: an RGBA8 texture whose red is the effect's strength, 0..1), 1 where the chosen
// race is and 0 elsewhere, and the badTv FIELD pipeline (render/badTvDevicePass.mjs, Level 11) applies its effect
// through it: outside the mask the picture passes through to the byte, inside the race flickers.
//
// v4317 SENT THE MASK THROUGH THE CPU: the pick picture and the colour picture read back, the mask built from the
// hits, both uploaded, one pass. v4318 KEEPS IT ON THE DEVICE: gfx/device.js frame({ target }) draws a frame into a
// texture on both backends (a render attachment on WebGPU, a framebuffer blitted the right way up on WebGL2), so
// the colour picture and the identity picture land in two targets, a third pass turns the identity picture into
// the strength field (PICK_MASK: decode the fleet from the blue byte, 1 where it is one of the chosen, else the
// soft floor), and the badTv field pass reads both. No readback, no upload; the CPU path stays for the gate to
// compare against, to the byte. And the same targets make the COMPOSITE: two universes drawn into two targets,
// one race's mask choosing which shows where -- out = mix(B, A, mask).
"use strict";

import { badTvFieldPipelineDesc, packKnobs, KNOB_ORDER, FIELD_BINDING, VERTEX_GLSL } from "./badTvDevicePass.mjs";
import { decodePick } from "./gpuDriven.mjs";

/** The mask: an RGBA8 field of the pick picture's size, red 255 where a pixel names one of `fleets`, else 0. */
export function maskFromPick(pick, fleets, { soft = 0 } = {}) {
    const want = new Set(Array.isArray(fleets) ? fleets : [fleets]);
    const w = pick.width, h = pick.height, data = new Uint8Array(w * h * 4);
    let inside = 0;
    for (let i = 0; i < w * h; i++) { const hit = pick.pixels ? decodePick(pick.pixels, i * 4) : pick.hits[i]; const on = hit && want.has(hit.fleet); if (on) inside++;
        const v = on ? 255 : Math.round(soft * 255); data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
    return { width: w, height: h, data, inside, outside: w * h - inside };
}

/**
 * The masked pass: `source` is a read-back frame ({ pixels, width, height }), `mask` a field from maskFromPick(); the
 * badTv field pipeline draws source through the mask into the device's target (or offscreen with read: true).
 * Returns the frame result (a Promise of pixels when read). Textures are made per call and destroyed after.
 */
export async function maskedBadTv(device, { source, mask, knobs = null, read = false, offscreen = false, time = 0 }) {
    const pipe = device.pipeline(badTvFieldPipelineDesc());
    const src = device.texture({ width: source.width, height: source.height, data: source.pixels, nearest: true });
    const fld = device.texture({ width: mask.width, height: mask.height, data: mask.data, nearest: true });
    const k = knobs || packKnobs({ time });
    const fr = device.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(pipe); for (let i = 0; i < KNOB_ORDER.length; i++) pass.uniform(KNOB_ORDER[i], k[i]); pass.texture("tDiffuse", src, 0); pass.texture(FIELD_BINDING, fld, 1); pass.draw(3); }, { read, offscreen, depth: false });
    const out = read ? await fr : fr;
    try { src.destroy(); fld.destroy(); } catch (e) {}
    return out;
}
/** Compare a masked result to its source: how many pixels changed inside the mask and outside it. */
export function maskDiff(source, result, mask, { tol = 0 } = {}) {
    let inChanged = 0, outChanged = 0, inside = 0, outside = 0, worstOut = 0;
    for (let i = 0; i < source.width * source.height; i++) { const on = mask.data[i * 4] > 127; let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(source.pixels[i * 4 + c] - result.pixels[i * 4 + c]));
        if (on) { inside++; if (d > tol) inChanged++; } else { outside++; if (d > tol) outChanged++; worstOut = Math.max(worstOut, d); } }
    return { inside, outside, inChanged, outChanged, worstOut };
}

// ---- v4318: the mask ON THE DEVICE -----------------------------------------------------------------------------
const TRI_VS_WGSL = `struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VSOut; o.pos = vec4f(p[vi], 0.0, 1.0); o.uv = vec2f((p[vi].x + 1.0) * 0.5, 1.0 - (p[vi].y + 1.0) * 0.5); return o;
}`;
/** The pick picture -> the strength field. bits = (fleets 0..15 as a bitmask, fleets 16..31, soft floor, 0). */
export const MASK_UNIFORMS = Object.freeze([{ name: "bits", type: "vec4" }]);
export const PICK_MASK_WGSL = `struct U { bits: vec4<f32> };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tPick: texture_2d<f32>;
${TRI_VS_WGSL}
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = textureSample(tPick, samp, uv);
  let fleet = u32(floor(p.b * 255.0 + 0.5)) >> 3u;
  let hit = p.a * 255.0 >= 127.5;
  let word = select(u32(u.bits.x), u32(u.bits.y), fleet >= 16u);
  let on = hit && (((word >> (fleet & 15u)) & 1u) == 1u);
  let v = select(u.bits.z, 1.0, on);
  return vec4f(v, v, v, 1.0);
}`;
export const PICK_MASK_GLSL = `#version 300 es
precision highp float;
uniform vec4 bits; uniform sampler2D tPick;
in vec2 vUv; out vec4 fragColor;
void main() {
  vec4 p = texture(tPick, vUv);
  uint fleet = uint(floor(p.b * 255.0 + 0.5)) >> 3u;
  bool hit = p.a * 255.0 >= 127.5;
  uint word = fleet >= 16u ? uint(bits.y) : uint(bits.x);
  bool on = hit && (((word >> (fleet & 15u)) & 1u) == 1u);
  float v = on ? 1.0 : bits.z;
  fragColor = vec4(v, v, v, 1.0);
}`;
export function pickMaskPipelineDesc() {
    return { shaders: { wgsl: PICK_MASK_WGSL, glsl: { vertex: VERTEX_GLSL, fragment: PICK_MASK_GLSL } }, vs: "vs", fs: "fs", attributes: [], stride: 0, uniforms: MASK_UNIFORMS, depthWrite: false, depthCompare: "always" };
}
/** The composite: out = mix(B, A, mask.r) -- universe A where the mask is, universe B elsewhere. */
export const COMPOSITE_WGSL = `struct U { knobs: vec4<f32> };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tA: texture_2d<f32>;
@group(0) @binding(3) var tB: texture_2d<f32>;
@group(0) @binding(4) var tMask: texture_2d<f32>;
${TRI_VS_WGSL}
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  // knobs.x weights the mask (1: A shows fully where the mask is). And the uniform is READ: a WGSL binding no entry point
  // touches is dropped from an auto layout, and the bind group then refuses -- measured at v4318, the first composite drew nothing.
  let m = textureSample(tMask, samp, uv).r * u.knobs.x;
  return mix(textureSample(tB, samp, uv), textureSample(tA, samp, uv), m);
}`;
export const COMPOSITE_GLSL = `#version 300 es
precision highp float;
uniform vec4 knobs; uniform sampler2D tA; uniform sampler2D tB; uniform sampler2D tMask;
in vec2 vUv; out vec4 fragColor;
void main() { float m = texture(tMask, vUv).r * knobs.x; fragColor = mix(texture(tB, vUv), texture(tA, vUv), m); }`;
export function compositePipelineDesc() {
    return { shaders: { wgsl: COMPOSITE_WGSL, glsl: { vertex: VERTEX_GLSL, fragment: COMPOSITE_GLSL } }, vs: "vs", fs: "fs", attributes: [], stride: 0, uniforms: [{ name: "knobs", type: "vec4" }], depthWrite: false, depthCompare: "always" };
}
/** Fleets -> the two 16-bit words the mask shader takes (exact in f32). */
export function fleetBits(fleets) { let lo = 0, hi = 0; for (const f of (Array.isArray(fleets) ? fleets : [fleets])) { if (f >= 0 && f < 16) lo |= 1 << f; else if (f >= 16 && f < 32) hi |= 1 << (f - 16); } return [lo, hi]; }
/** Read a target back: a frame that draws nothing over it. */
export function readTarget(device, target) { return device.frame(({ pass }) => { pass.begin(); }, { target, read: true, depth: false }); }
/**
 * THE RIG: three targets the size of the canvas (colour, identity, mask) and the two passes. draw() takes the
 * page's own drawing: `colour(target)` draws the scene(s) into the colour target, `pick(target)` draws the identity
 * picture into the pick target (scene.pickTo), `fleets` says whose pixels the effect touches. Nothing leaves the
 * device; `read` reads only the final picture, for a gate.
 */
export function makeMaskRig(device, { width, height }) {
    const mk = () => device.texture({ width, height, render: true, nearest: true });
    const colour = mk(), pick = mk(), mask = mk();
    const maskPipe = device.pipeline(pickMaskPipelineDesc()), fieldPipe = device.pipeline(badTvFieldPipelineDesc()), compPipe = device.pipeline(compositePipelineDesc());
    const buildMask = (fleets, soft) => { const bits = fleetBits(fleets); device.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(maskPipe); pass.uniform("bits", [bits[0], bits[1], soft, 0]); pass.texture("tPick", pick, 0); pass.draw(3); }, { target: mask, depth: false }); };
    return {
        width, height, textures: { colour, pick, mask },
        async draw({ colour: drawColour, pick: drawPick, fleets, knobs = null, time = 0, soft = 0, read = false, offscreen = false }) {
            drawColour(colour); drawPick(pick); buildMask(fleets, soft);
            const k = knobs || packKnobs({ time });
            const fr = device.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(fieldPipe); for (let i = 0; i < KNOB_ORDER.length; i++) pass.uniform(KNOB_ORDER[i], k[i]); pass.texture("tDiffuse", colour, 0); pass.texture(FIELD_BINDING, mask, 1); pass.draw(3); }, { read, offscreen, depth: false });
            return read ? await fr : fr;
        },
        /** Two universes: A drawn by `a(target)` into the colour target, B by `b(target)` into `other`; the mask from A's identity picture; out = mix(B, A, mask). */
        async composite({ a, b, pick: drawPick, fleets, other, soft = 0, weight = 1, read = false, offscreen = false }) {
            a(colour); b(other); drawPick(pick); buildMask(fleets, soft);
            const fr = device.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(compPipe); pass.uniform("knobs", [weight, 0, 0, 0]); pass.texture("tA", colour, 0); pass.texture("tB", other, 1); pass.texture("tMask", mask, 2); pass.draw(3); }, { read, offscreen, depth: false });
            return read ? await fr : fr;
        },
        target: mk,
        readMask: () => readTarget(device, mask), readColour: () => readTarget(device, colour), readPick: () => readTarget(device, pick),
        destroy() { for (const t of [colour, pick, mask]) { try { t.destroy(); } catch (e) {} } },
    };
}
