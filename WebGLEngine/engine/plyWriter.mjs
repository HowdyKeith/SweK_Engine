// FILE: engine/plyWriter.mjs -- v4195
//
// WRITES the Gaussian-splat .ply and .splat formats this tree has only ever READ, and carries the two
// data conventions its two renderers consume as independently-derived functions.
//
// Pure -- no DOM, no GL, no fs -- so a gate can build a splat file in memory, feed it to both parsers, and
// check them against the spec rather than against each other.
//
// *** WHY A WRITER, WHEN THE ASK WAS A GATE. *** Before this file the tree had 2,925 lines of splat code and
// no way to produce a single byte of the format, which is exactly why none of it was gated: every test would
// have needed a vendored multi-megabyte capture from someone else's scanner. A synthetic .ply is a few
// hundred bytes and states its own ground truth, so the fixture IS the spec.
//
// *** AND THE TWO CONVENTIONS ARE WRITTEN OUT FROM THE FORMAT, NOT COPIED FROM THE PARSERS. ***
// This tree parses 3DGS .ply twice, into two different shapes, for two different renderers:
//
//                      engine/splatParser.js            gpu/SplatLoader.js
//                      -> engine/SplatRenderer.js       -> render/SplatRenderer.js
//   scales             raw, log space                   Math.exp() applied
//   opacity            raw logit, own array             sigmoid, packed into colors[a]
//   colors             Float32 0..1, RGB                Uint8 0..255, RGBA
//   rotation           `quats`                          `rotations`
//
// NEITHER IS WRONG. The engine stack defers exp() and the sigmoid to the vertex shader (see
// engine/SplatRenderer.js `exp(a_scale)` and `1.0/(1.0+exp(-a_opacity))`), which keeps float precision and
// costs nothing on the GPU; the gpu stack applies them on the CPU and hands the renderer linear values.
// The defect was never the choice -- it was that the choice was undocumented and unasserted, so a struct
// from one half handed to the other half's renderer would draw a plausible, wrong picture instead of failing.
//
// toShaderConvention() and toRenderConvention() below are derived HERE from the 3DGS format definition. A
// gate that compared the two parsers only to each other would pass with both of them broken the same way.
"use strict";

/** The 14 per-vertex properties every 3DGS .ply carries, in the order the reference exporter writes them. */
export const PLY_PROPS = Object.freeze([
    "x", "y", "z",
    "f_dc_0", "f_dc_1", "f_dc_2",
    "opacity",
    "scale_0", "scale_1", "scale_2",
    "rot_0", "rot_1", "rot_2", "rot_3",
]);

/** Y_00, the band-0 spherical harmonic. rgb = 0.5 + SH_C0 * f_dc  is the whole of 3DGS base colour. */
export const SH_C0 = 0.28209479177387814;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const u8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/**
 * One raw SH band-0 coefficient to the byte both 8-bit consumers store.
 *
 * *** THERE IS EXACTLY ONE OF THESE BECAUSE A SECOND ONE WAS PROVABLY DEAD. *** writeSplat and
 * toRenderConvention each spelled this out separately as u8(clamp01(0.5 + SH_C0 * c) * 255), and sabotaging
 * the clamp out of one of them changed no byte and reddened no check -- u8 already clamps, so the clamp01
 * was unreachable. Rather than annotate a line no test can reach, both callers now share this one.
 */
const dcToByte = (c) => u8((0.5 + SH_C0 * c) * 255);

/** One Gaussian, in the units the FILE stores: log scales, raw logit opacity, raw SH coefficients. */
function propOf(g, name) {
    switch (name) {
        case "x": return g.x; case "y": return g.y; case "z": return g.z;
        case "f_dc_0": return g.color[0]; case "f_dc_1": return g.color[1]; case "f_dc_2": return g.color[2];
        case "opacity": return g.opacity;
        case "scale_0": return g.scale[0]; case "scale_1": return g.scale[1]; case "scale_2": return g.scale[2];
        case "rot_0": return g.rot[0]; case "rot_1": return g.rot[1]; case "rot_2": return g.rot[2]; case "rot_3": return g.rot[3];
        default: throw new Error("plyWriter: no such property " + name);
    }
}

/**
 * Build a .ply header.
 *
 * *** THE LINE ENDING IS A PARAMETER BECAUSE IT IS A REAL SOURCE OF BROKEN FILES. *** The PLY spec says the
 * header is lines of ASCII; it does not say those lines end in \n. A scanner that hunts for the ten bytes
 * "end_header" followed by a hard-coded \n rejects every .ply written on Windows, with an error blaming the
 * file for missing a marker it plainly has. That is not hypothetical -- engine/splatParser.js did exactly
 * this until v4195, and this parameter is how the gate proves it no longer does.
 */
export function plyHeader(format, count, eol = "\n") {
    return [
        "ply",
        `format ${format} 1.0`,
        `element vertex ${count}`,
        ...PLY_PROPS.map((p) => `property float ${p}`),
        "end_header",
        "",
    ].join(eol);
}

/**
 * Write Gaussians as a .ply.
 *
 * @param gaussians  [{ x, y, z, scale:[3] (log), rot:[4] (w,x,y,z), color:[3] (raw f_dc), opacity (logit) }]
 * @param format     "binary_little_endian" | "binary_big_endian" | "ascii"
 * @param eol        header line ending -- "\n" or "\r\n"
 * @returns Uint8Array
 */
export function writePly(gaussians, { format = "binary_little_endian", eol = "\n" } = {}) {
    if (!Array.isArray(gaussians) || !gaussians.length) throw new RangeError("plyWriter: no gaussians");
    const head = new TextEncoder().encode(plyHeader(format, gaussians.length, eol));
    if (format === "ascii") {
        const body = new TextEncoder().encode(
            gaussians.map((g) => PLY_PROPS.map((p) => propOf(g, p)).join(" ")).join("\n") + "\n");
        const out = new Uint8Array(head.length + body.length);
        out.set(head, 0); out.set(body, head.length);
        return out;
    }
    if (format !== "binary_little_endian" && format !== "binary_big_endian") {
        throw new Error("plyWriter: unknown format " + format);
    }
    const le = format === "binary_little_endian";
    const stride = PLY_PROPS.length * 4;
    const out = new Uint8Array(head.length + gaussians.length * stride);
    out.set(head, 0);
    const dv = new DataView(out.buffer, head.length);
    let o = 0;
    for (const g of gaussians) for (const p of PLY_PROPS) { dv.setFloat32(o, propOf(g, p), le); o += 4; }
    return out;
}

/**
 * Write Gaussians as a .splat: 32 bytes each, pos f32x3 | scale f32x3 (LINEAR) | rgba u8x4 | quat u8x4.
 *
 * *** THIS FORMAT IS LOSSY AND THE LOSS IS NOT SMALL. *** Colour and alpha drop to 8 bits, and each
 * quaternion component is quantised as round(q * 128 + 128) into a byte -- which cannot represent +1 at all
 * (it needs 256) and so clamps to 255, decoding as 0.9921875. Any gate comparing a .splat round trip against
 * its source must state a tolerance and mean it; splatRoundTrip-selfcheck.mjs measures the real error rather
 * than picking a comfortable epsilon.
 */
export function writeSplat(gaussians) {
    if (!Array.isArray(gaussians) || !gaussians.length) throw new RangeError("plyWriter: no gaussians");
    const out = new Uint8Array(gaussians.length * 32);
    const dv = new DataView(out.buffer);
    gaussians.forEach((g, i) => {
        const o = i * 32;
        dv.setFloat32(o + 0, g.x, true); dv.setFloat32(o + 4, g.y, true); dv.setFloat32(o + 8, g.z, true);
        dv.setFloat32(o + 12, Math.exp(g.scale[0]), true);       // .splat stores LINEAR scale, .ply stores log
        dv.setFloat32(o + 16, Math.exp(g.scale[1]), true);
        dv.setFloat32(o + 20, Math.exp(g.scale[2]), true);
        for (let c = 0; c < 3; c++) out[o + 24 + c] = dcToByte(g.color[c]);
        out[o + 27] = u8((1 / (1 + Math.exp(-g.opacity))) * 255); // .splat stores POST-sigmoid alpha
        for (let c = 0; c < 4; c++) out[o + 28 + c] = u8(g.rot[c] * 128 + 128);
    });
    return out;
}

/**
 * What engine/splatParser.js must produce for one Gaussian: the file's own units, untransformed, because
 * engine/SplatRenderer.js applies exp() and the sigmoid in its vertex shader.
 */
export function toShaderConvention(g) {
    return {
        position: [g.x, g.y, g.z],
        scale: [g.scale[0], g.scale[1], g.scale[2]],          // log space, as stored
        quat: [g.rot[0], g.rot[1], g.rot[2], g.rot[3]],
        color: g.color.map((c) => clamp01(0.5 + SH_C0 * c)),  // 0..1 float, RGB only
        opacity: g.opacity,                                    // raw logit
    };
}

/**
 * What gpu/SplatLoader.js must produce for one Gaussian: linear scale and 8-bit RGBA, because
 * render/SplatRenderer.js uploads colours as UNSIGNED_BYTE and multiplies scale straight into the covariance.
 */
export function toRenderConvention(g) {
    return {
        position: [g.x, g.y, g.z],
        scale: [Math.exp(g.scale[0]), Math.exp(g.scale[1]), Math.exp(g.scale[2])],
        rotation: [g.rot[0], g.rot[1], g.rot[2], g.rot[3]],
        rgba: [...g.color.map(dcToByte), u8((1 / (1 + Math.exp(-g.opacity))) * 255)],
    };
}

/**
 * A deliberately awkward set: a default-rotation splat, a 45-degree one, a zero-colour one, a saturating
 * colour that must CLAMP rather than wrap, and a near-opaque and a near-transparent alpha. Six Gaussians is
 * enough to catch a stride error, a byte order error, a missing clamp and a swapped channel at once.
 */
export const FIXTURE = Object.freeze([
    { x:  0.0,  y:  0.0,  z:  0.0,   scale: [-2.0, -2.5, -3.0], rot: [1, 0, 0, 0],                color: [ 1.2, -0.4,  0.0], opacity:  2.0 },
    { x:  1.5,  y: -2.0,  z:  3.25,  scale: [-0.5, -0.5, -0.5], rot: [0.7071068, 0.7071068, 0, 0], color: [-1.0,  1.0,  0.5], opacity: -1.0 },
    { x: -7.0,  y:  0.5,  z:  0.0,   scale: [-4.0, -1.0, -2.0], rot: [0, 0, 1, 0],                color: [ 0.0,  0.0,  0.0], opacity:  0.0 },
    { x: 12.75, y: 30.5,  z: -4.5,   scale: [-1.25, -6.0, 0.5], rot: [0, 0.5, 0.5, 0.7071068],    color: [ 9.0, -9.0,  9.0], opacity:  6.0 },  // colour saturates both ways
    { x: -0.25, y: -0.75, z:  0.125, scale: [-3.5, -3.5, -3.5], rot: [0.5, -0.5, 0.5, -0.5],      color: [ 0.3,  0.3,  0.3], opacity: -6.0 },  // nearly invisible
    { x:  0.0,  y: 99.0,  z: -99.0,  scale: [-8.0, 0.0, -0.25], rot: [-1, 0, 0, 0],               color: [-0.6,  0.2, -0.2], opacity:  0.5 },
].map(Object.freeze));

/**
 * The inverse of toShaderConvention: turn a parsed struct from engine/splatParser.js back into Gaussians
 * this file can write. This is what makes window.splat.save() possible -- the export half.
 *
 * *** IT IS NOT A TOTAL INVERSE, AND THE PLACE IT FAILS IS WORTH NAMING. *** Colour goes out as a raw SH
 * coefficient and comes back CLAMPED to 0..1, so a splat whose f_dc saturated the display range cannot be
 * recovered -- 0.5 + SH_C0 * 9.0 clamps to 1.0, and the inverse of 1.0 is 1.773, not 9.0. Every other field
 * (position, log scale, quaternion, logit opacity) survives untouched, so a re-written file is byte-identical
 * wherever the source colour did not saturate. splatRoundTrip-selfcheck.mjs measures exactly that rather than
 * claiming a clean round trip it does not have.
 */
export function fromShaderConvention(parsed) {
    const out = [];
    for (let i = 0; i < parsed.count; i++) {
        out.push({
            x: parsed.positions[i * 3 + 0], y: parsed.positions[i * 3 + 1], z: parsed.positions[i * 3 + 2],
            scale: [parsed.scales[i * 3 + 0], parsed.scales[i * 3 + 1], parsed.scales[i * 3 + 2]],
            rot:   [parsed.quats[i * 4 + 0], parsed.quats[i * 4 + 1], parsed.quats[i * 4 + 2], parsed.quats[i * 4 + 3]],
            color: [0, 1, 2].map((k) => (parsed.colors[i * 3 + k] - 0.5) / SH_C0),
            opacity: parsed.opacities[i],
        });
    }
    return out;
}

/** Axis-aligned bounds of a Gaussian set, as both parsers report for .ply and .splat alike. */
export function bboxOf(gaussians) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const g of gaussians) {
        const p = [g.x, g.y, g.z];
        for (let i = 0; i < 3; i++) { if (p[i] < min[i]) min[i] = p[i]; if (p[i] > max[i]) max[i] = p[i]; }
    }
    return { min, max,
        center: [0, 1, 2].map((i) => (min[i] + max[i]) / 2),
        size:   [0, 1, 2].map((i) => max[i] - min[i]) };
}
