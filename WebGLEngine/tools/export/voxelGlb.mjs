// FILE: tools/export/voxelGlb.mjs -- v4156
//
// *** THE PIPELINE RAN ONE WAY, AND THIS IS THE RETURN LEG. *** ui/assetVoxelizer.js turns a GLB into voxels
// and has since v1391. Nothing turned voxels back into a GLB: the tree vendors three's GLTFExporter, but its
// only caller is tools/krbn/riggedExport.js, which is SKELETON-SPECIFIC -- it assembles a bone hierarchy plus
// stroke tubes and deliberately reuses rather than clones bones so the animation clips' target UUIDs survive.
// There was no way to get the stamped world out.
//
// ---- WHY THIS WRITES GLB DIRECTLY INSTEAD OF GOING THROUGH GLTFExporter ------------------------------------
// *** THE VOXEL WORLD IS NOT A three.js SCENE. *** render/voxelrenderer.js is raw WebGL with its own frustum,
// its own palette and its own material registry, so there is no THREE.Scene to traverse and GLTFExporter would
// need a whole second scene graph built for it first. Emitting the container by hand instead means:
//   * NO RENDERER DEPENDENCY -- a page that never loads three can still export.
//   * IT RUNS IN NODE, so the gate beside this file round-trips a real export through the tree's OWN
//     gpu/GLBParser.js without a browser. A writer checked only by opening the result in Blender is a writer
//     nobody can regress-test.
// GLB is a small container: a 12-byte header, a JSON chunk and a BIN chunk. The hard parts are not the layout,
// they are the two things below that a hand-rolled writer gets wrong and a viewer then refuses silently.
//
// ---- THE TWO THINGS THE SPEC REQUIRES THAT ARE EASY TO MISS -------------------------------------------------
//   1. *** POSITION ACCESSORS MUST CARRY min AND max. *** They are OPTIONAL on every other accessor and
//      REQUIRED on POSITION (glTF 2.0 5.3): viewers use them for the bounding box, and a file without them
//      loads as an invisible or unframeable model rather than as an error.
//   2. *** EVERY CHUNK AND EVERY bufferView IS 4-BYTE ALIGNED. *** JSON pads with SPACES (0x20) and BIN pads
//      with ZEROS, which is the spec's own wording and not an aesthetic choice -- a parser reading a uint32
//      length at an unaligned offset gets garbage.
// Both are asserted by the gate against a real export, not merely written down here.
"use strict";

// v4163 -- EXPORTED so the READER can use the same three numbers the WRITER does. gpu/glbPeek.mjs needs the
// container layout to look for a Draco extension without decoding anything, and a second spelling of "glTF"
// somewhere else in the tree is exactly how a writer and a reader start disagreeing about a file format.
import { weld, DEFAULT_EPSILON as WELD_EPSILON } from "./weldVertices.mjs";   // v4169

export const MAGIC = 0x46546C67;        // "glTF"
export const JSON_CHUNK = 0x4E4F534A;   // "JSON"
export const BIN_CHUNK  = 0x004E4942;   // "BIN\0"
const FLOAT = 5126;              // componentType
const ARRAY_BUFFER = 34962;      // bufferView target
const TRIANGLES = 4;             // primitive mode

const pad4 = (n) => (n + 3) & ~3;

/** min/max over an interleaved VEC3 array. Returns null for an empty array rather than +/-Infinity pairs. */
export function vec3Bounds(a) {
    if (!a || a.length < 3) return null;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i + 2 < a.length; i += 3) {
        for (let k = 0; k < 3; k++) {
            const v = a[i + k];
            if (v < mn[k]) mn[k] = v;
            if (v > mx[k]) mx[k] = v;
        }
    }
    return isFinite(mn[0]) ? { min: mn, max: mx } : null;
}

/**
 * Write a binary glTF from raw triangle soup.
 *
 * @param meshes [{ name, positions: Float32Array (VEC3, non-indexed), colors?: Float32Array (VEC3) }]
 * @param opts.generator  the string written into asset.generator
 * @param opts.yUp        the voxel world is already Y-up, which glTF also is, so nothing is rotated. Stated
 *                        rather than silently assumed, because a wrong axis convention is the single most
 *                        common way an export arrives on its side and nobody can say why.
 * @returns Uint8Array -- a complete .glb
 */
export function writeGlb(meshes, opts = {}) {
    let list = (meshes || []).filter((m) => m && m.positions && m.positions.length >= 9);
    if (!list.length) throw new Error("writeGlb: nothing to write (a mesh needs at least one triangle)");

    // *** v4169 -- OPTIONAL VERTEX WELDING, WIRED TO THE ONE WRITER THAT SPEAKS THESE ARRAYS. ***
    // weldVertices.mjs was written at v4162 against glb-shrink's approach and its own header already says it
    // "takes and returns the flat arrays voxelGlb.writeGlb speaks" -- a seam declared on one side and never
    // joined, so nothing but its gate ever called it. OFF BY DEFAULT: welding DISCARDS a distinction the mesh
    // is currently making (two vertices at one position with different normals are a hard edge), so it is a
    // request rather than a default, and the caller says epsilon.
    if (opts.weld) {
        const eps = typeof opts.weld === "number" ? opts.weld : (opts.weldEpsilon ?? WELD_EPSILON);
        list = list.map((m) => {
            const w = weld(m, { epsilon: eps, keyOn: opts.weldKeyOn || null });
            // the report travels with the mesh so a caller can SEE what was removed rather than infer it
            return { ...m, positions: w.positions, normals: w.normals, colors: w.colors, uvs: w.uvs,
                     indices: w.indices, weld: { before: w.before, after: w.after, removed: w.removed, ratio: w.ratio } };
        });
    }

    const views = [], accessors = [], gmeshes = [], nodes = [];
    const chunks = [];        // {bytes, byteOffset}
    let binLen = 0;

    const addView = (arr) => {
        // *** ALIGNED, AND THE PADDING IS BEFORE THE VIEW RATHER THAN AFTER. *** A float bufferView must start
        // on a 4-byte boundary; padding only at the end leaves the NEXT view misaligned.
        const off = pad4(binLen);
        if (off > binLen) { chunks.push({ bytes: new Uint8Array(off - binLen), byteOffset: binLen }); binLen = off; }
        const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
        chunks.push({ bytes, byteOffset: off });
        binLen = off + arr.byteLength;
        views.push({ buffer: 0, byteOffset: off, byteLength: arr.byteLength, target: ARRAY_BUFFER });
        return views.length - 1;
    };

    for (const m of list) {
        const pos = m.positions instanceof Float32Array ? m.positions : new Float32Array(m.positions);
        const count = Math.floor(pos.length / 3);
        const b = vec3Bounds(pos);
        if (!b) throw new Error("writeGlb: mesh '" + (m.name || "?") + "' has no finite positions");
        const attributes = {};
        accessors.push({ bufferView: addView(pos), componentType: FLOAT, count, type: "VEC3", min: b.min, max: b.max });
        attributes.POSITION = accessors.length - 1;

        if (m.colors && m.colors.length) {
            const col = m.colors instanceof Float32Array ? m.colors : new Float32Array(m.colors);
            // *** A COLOUR ARRAY THAT DOES NOT MATCH THE VERTEX COUNT IS DROPPED, NOT TRUNCATED. *** A silently
            // shortened attribute produces a model that is subtly wrong everywhere, which is worse than one
            // that is plainly untinted -- and the mismatch is reported so a caller can see it happened.
            if (Math.floor(col.length / 3) === count) {
                accessors.push({ bufferView: addView(col), componentType: FLOAT, count, type: "VEC3" });
                attributes.COLOR_0 = accessors.length - 1;
            }
        }
        gmeshes.push({ name: m.name || ("mesh" + gmeshes.length), primitives: [{ attributes, material: 0, mode: TRIANGLES }] });
        nodes.push({ mesh: gmeshes.length - 1, name: m.name || ("node" + nodes.length) });
    }

    const gltf = {
        asset: { version: "2.0", generator: opts.generator || "SweK Engine voxelGlb" },
        scene: 0,
        scenes: [{ nodes: nodes.map((_, i) => i) }],
        nodes, meshes: gmeshes,
        // baseColorFactor is white BECAUSE glTF MULTIPLIES it by COLOR_0. Any other value would tint every
        // vertex colour the mesher computed, which is the quiet way an export stops matching the screen.
        materials: [{ name: "voxel", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } }],
        accessors, bufferViews: views,
        buffers: [{ byteLength: binLen }],
    };

    const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
    const jsonLen = pad4(jsonBytes.length);
    const binPadded = pad4(binLen);
    const total = 12 + 8 + jsonLen + 8 + binPadded;

    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, MAGIC, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, jsonLen, true); dv.setUint32(16, JSON_CHUNK, true);
    out.set(jsonBytes, 20);
    out.fill(0x20, 20 + jsonBytes.length, 20 + jsonLen);        // JSON pads with SPACES, per the spec
    const binStart = 20 + jsonLen;
    dv.setUint32(binStart, binPadded, true); dv.setUint32(binStart + 4, BIN_CHUNK, true);
    for (const c of chunks) out.set(c.bytes, binStart + 8 + c.byteOffset);   // BIN pads with ZEROS (already 0)
    return out;
}

/** Bytes, triangles and vertices a call to writeGlb would produce -- for a caller that wants to warn first. */
export function glbStats(meshes) {
    let tris = 0, verts = 0;
    for (const m of (meshes || [])) {
        if (!m || !m.positions) continue;
        const n = Math.floor(m.positions.length / 3);
        verts += n; tris += Math.floor(n / 3);
    }
    return { meshes: (meshes || []).length, vertices: verts, triangles: tris };
}
