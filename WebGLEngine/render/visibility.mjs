// render/visibility.mjs -- WHICH OBJECT IS VISIBLE AT EACH PIXEL, which is the buffer render/objectMotion.mjs
// consumes and nothing in this tree produced.
//
// *** v4646 SHIPPED A CONSUMER WITH NO PRODUCER AND SAID SO. *** render/objectMotionGPU.mjs takes a per-pixel
// object id and turns it into motion vectors that are right for things that MOVE -- 2.51 px better than the
// camera-only path on its fixture. Its gate's closing line names the gap: "where the ID BUFFER COMES FROM --
// this module consumes one and nothing in the tree rasterises one yet". This is that.
//
// ---- WHY A COMPUTE RASTERISER AND NOT A RENDER PASS ----------------------------------------------------------
//
// A hardware z-buffer with a second integer render target is the obvious answer and it is not the one this tree
// can take: gfx/device.js's compute path is what every kernel in this arc already runs through, and the whole
// temporal arc reads and writes flat storage buffers. A visibility pass that produced a texture would need the
// consumer to change shape. So this rasterises in a compute kernel into a storage buffer, which is the
// "visibility buffer" technique, and the depth test is an atomicMin.
//
// ---- *** ONE WORD PER PIXEL, DEPTH AND ID PACKED TOGETHER, AND THAT IS NOT A SAVING -- IT IS THE CORRECTNESS
// ARGUMENT. *** ------------------------------------------------------------------------------------------------
//
// The naive version keeps two buffers: atomicMin the depth, then have each triangle write its id where its own
// depth matched the winner. That is a RACE. Two triangles at bit-identical depth both match, both write, and
// which id survives depends on scheduling -- the same frame can resolve differently twice. Packing the depth
// into the HIGH bits and the id into the LOW bits of one u32 makes the single atomicMin decide both: nearest
// wins, and on an exact depth tie the LOWER ID wins, always, on every device. That is strictly more determinism
// than a hardware z-buffer offers, and it costs nothing.
//
// The split is 20 bits of depth and 12 of id: 4,096 objects, and a depth step of 1/(2^20 - 1) = 9.537e-7 of the
// stated range. That quantisation is a real limit and it is stated as a number rather than waved at -- the
// tightest depth threshold this tree derives is fsr.html's disocclusion gap, a quarter of 0.0250250, which is
// 6.6e-3: six thousand five hundred times the step. The gate measures the step rather than trusting this line.
//
// ---- WHAT IT DOES NOT DO, SAID HERE RATHER THAN DISCOVERED ----------------------------------------------------
//
//   * NO CLIPPING. A triangle with any vertex on or behind the eye (w <= 0) is REJECTED WHOLE and counted. A
//     rasteriser that clipped would be a bigger thing than the id buffer needs, and a rasteriser that silently
//     projected a point behind the eye draws a triangle that is not there -- so it refuses and says how many.
//   * NO PERSPECTIVE-CORRECT ATTRIBUTES, because there are no attributes. Clip-space z/w is linear in screen
//     space -- that is what makes a z-buffer work at all -- so barycentric interpolation of ndc z is exact.
//   * ONE SAMPLE AT THE PIXEL CENTRE. No multisampling; the consumer wants the id of the surface at the centre.
"use strict";

/** The packing, defined ONCE here because the kernel, the CPU and every reader must agree on it exactly. */
export const ID_BITS = 12;
export const DEPTH_BITS = 20;
export const MAX_OBJECTS = 1 << ID_BITS;            // 4096
export const DEPTH_STEPS = (1 << DEPTH_BITS) - 1;   // 1048575, the largest depth key
/** The cleared word: depth all ones, id all ones -- "nothing here", and it loses every atomicMin. */
export const EMPTY = 0xFFFFFFFF;
/** The id an empty pixel reports. NOT 0: object 0 is a real object, and v4591's rule is that an absence read as a value is the defect. */
export const NO_OBJECT = MAX_OBJECTS - 1;           // 4095, which is why MAX_OBJECTS - 1 objects are addressable

/**
 * Pack a depth in [0,1] and an id into one sortable u32.
 *
 * *** THE UNSIGNED COERCION IS WHAT MATTERS, NOT THE MULTIPLY, AND THAT IS A CORRECTION THIS COMMENT OWES ITS
 * OWN ROUND. *** The first draft said the multiply itself was load-bearing -- that `depthKey << 12` reaches
 * 2^32 and "comes back NEGATIVE, silently", so the mirrors would disagree past the halfway depth. A sabotage
 * pass rewrote this line as `((key << ID_BITS) | id) >>> 0` and scored ZERO failing rows, which is a no-op
 * rather than a blind gate: MEASURED at five depths spanning the range, the two spellings are bit-identical
 * (d = 0.75 gives 3221221383 either way, though the shift's intermediate really is -1073745913).
 *
 * So the hazard is the >>> 0 and not the shift. JavaScript's << IS a signed 32-bit operator and the raw result
 * past d = 0.5 IS negative; >>> 0 maps it back, and WITHOUT it the packed word is negative and both the
 * round-trip and the ordering break -- that mutation fails three rows. Written as a multiply anyway, because a
 * multiply cannot be left un-coerced by a later edit, but the gate holds the property and not the spelling.
 */
export function packKey(depth01, id) {
    if (!(id >= 0 && id < MAX_OBJECTS)) throw new Error(`visibility.packKey: id ${id} is outside 0..${MAX_OBJECTS - 1} -- ${ID_BITS} bits of id is the packing's whole budget`);
    const d = Math.min(1, Math.max(0, depth01));
    const key = Math.floor(d * DEPTH_STEPS);
    return (key * MAX_OBJECTS + id) >>> 0;
}
export function unpackId(word) { return (word % MAX_OBJECTS) >>> 0; }
export function unpackDepth(word) { return Math.floor(word / MAX_OBJECTS) / DEPTH_STEPS; }

/** Column-major 4x4 times a vec4 -- the same one render/motionVectors.mjs exports, repeated rather than imported so this module stands alone for a caller that has no motion vectors. */
const xf = (m, x, y, z) => [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
    m[3] * x + m[7] * y + m[11] * z + m[15],
];

/**
 * Rasterise triangles into a packed visibility buffer, on the CPU: the ground truth the WGSL is held to.
 *
 * `positions` is 3 floats per vertex in OBJECT space; `indices` 3 per triangle; `triObject` one object id per
 * triangle; `mvps` an array of column-major model-view-projection matrices indexed by that id. `zRange` maps
 * clip-space z/w into the [0,1] the packing needs -- the caller's, because this module is agnostic between a
 * WebGPU-style [0,1] projection and a GL-style [-1,1] one exactly as render/motionVectors.mjs is, and guessing
 * would reconstruct a different surface while looking almost right.
 *
 * Returns { words, w, h, rejected, drawn } -- `rejected` counts triangles refused for crossing the eye.
 */
export function rasterVisibilityCPU({ positions, indices, triObject, mvps, w, h, zRange = [-1, 1] }) {
    if (!Array.isArray(mvps) || !mvps.length) throw new Error("rasterVisibilityCPU: mvps must be a non-empty array of column-major matrices indexed by object id");
    if (mvps.length > MAX_OBJECTS - 1) throw new Error(`rasterVisibilityCPU: ${mvps.length} objects against a packing budget of ${MAX_OBJECTS - 1} -- id ${NO_OBJECT} is reserved for "no object"`);
    if (indices.length % 3) throw new Error(`rasterVisibilityCPU: ${indices.length} indices is not a whole number of triangles`);
    const triCount = indices.length / 3;
    if (triObject.length !== triCount) throw new Error(`rasterVisibilityCPU: ${triObject.length} object ids against ${triCount} triangles -- one per triangle, so a mesh cannot half-belong to an object`);
    const [z0, z1] = zRange;
    if (!(z1 > z0)) throw new Error(`rasterVisibilityCPU: zRange [${z0}, ${z1}] is empty or inverted`);

    const words = new Uint32Array(w * h).fill(EMPTY);
    let rejected = 0, drawn = 0;
    for (let t = 0; t < triCount; t++) {
        const id = triObject[t];
        const m = mvps[id];
        if (!m) throw new Error(`rasterVisibilityCPU: triangle ${t} names object ${id} and mvps has no matrix there`);
        const sx = [0, 0, 0], sy = [0, 0, 0], sz = [0, 0, 0];
        let behind = false;
        for (let k = 0; k < 3; k++) {
            const v = indices[t * 3 + k] * 3;
            const c = xf(m, positions[v], positions[v + 1], positions[v + 2]);
            // NO CLIPPING: a vertex on or behind the eye rejects the whole triangle -- see the header
            if (!(c[3] > 0)) { behind = true; break; }
            const nx = c[0] / c[3], ny = c[1] / c[3];
            sx[k] = (nx + 1) * 0.5 * w;                 // ndc -> pixel, uv y running DOWN to match the buffer
            sy[k] = (1 - ny) * 0.5 * h;
            sz[k] = (c[2] / c[3] - z0) / (z1 - z0);     // clip z -> [0,1] through the caller's range
        }
        if (behind) { rejected++; continue; }
        // twice the signed area; a degenerate or back-facing triangle contributes nothing
        const area = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sy[1] - sy[0]) * (sx[2] - sx[0]);
        if (area === 0) { continue; }
        const inv = 1 / area;
        const x0 = Math.max(0, Math.floor(Math.min(sx[0], sx[1], sx[2])));
        const x1 = Math.min(w - 1, Math.ceil(Math.max(sx[0], sx[1], sx[2])));
        const y0 = Math.max(0, Math.floor(Math.min(sy[0], sy[1], sy[2])));
        const y1 = Math.min(h - 1, Math.ceil(Math.max(sy[0], sy[1], sy[2])));
        let any = false;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const px = x + 0.5, py = y + 0.5;
            // edge functions, scaled by 1/area so the sign test is winding-agnostic and the weights are barycentric
            const w0 = ((sx[2] - sx[1]) * (py - sy[1]) - (sy[2] - sy[1]) * (px - sx[1])) * inv;
            const w1 = ((sx[0] - sx[2]) * (py - sy[2]) - (sy[0] - sy[2]) * (px - sx[2])) * inv;
            const w2 = ((sx[1] - sx[0]) * (py - sy[0]) - (sy[1] - sy[0]) * (px - sx[0])) * inv;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            const d = w0 * sz[0] + w1 * sz[1] + w2 * sz[2];     // z/w is LINEAR in screen space -- header
            const i = y * w + x;
            const key = packKey(d, id);
            if (key < words[i]) words[i] = key;                 // the CPU's atomicMin
            any = true;
        }
        if (any) drawn++;
    }
    return { words, w, h, rejected, drawn };
}

/** The two fields a consumer actually wants, unpacked. `ids` reports NO_OBJECT where nothing was drawn. */
export function unpackVisibility({ words, w, h }) {
    const ids = new Uint32Array(w * h), depth = new Float32Array(w * h);
    let covered = 0;
    for (let i = 0; i < words.length; i++) {
        ids[i] = unpackId(words[i]);
        depth[i] = unpackDepth(words[i]);
        if (words[i] !== EMPTY) covered++;
    }
    return { ids, depth, w, h, covered };
}
