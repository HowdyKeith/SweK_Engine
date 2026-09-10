// FILE: tools/export/dracoEncode.mjs -- v4601
//
// *** THE ENCODE HALF weldVertices.mjs'S OWN HEADER NAMED AND NEVER BUILT. *** "Draco-encode -- YES, and it is
// the big win: quantised integer positions are what voxel geometry IS" -- written against boona13/glb-shrink's
// seven stages, of which only weld shipped. tools/ship/dracoWeld-selfcheck.mjs said so in its own closing note:
// "This round wrote no encoder either: draco.js DECODES ONLY, and neither it nor glb-shrink ships an encoder we
// could vendor." This is that encoder.
//
// ---- WHY draco3d, NOT THREE.JS'S OWN DRACOExporter.js -----------------------------------------------------
// See vendor/draco-encoder/PROVENANCE.txt for the full measurement: three.js r160's own
// examples/jsm/libs/draco/draco_encoder.js was tried first and its module-init promise never resolved --
// measured past 100 minutes of pinned CPU on a single 3-vertex encode before being killed. It is an
// asm.js-era build, not the current one. draco3d (Google's own npm package for this exact library) ships a
// Node-targeted build that is routinely tested in Node (its own package.json test script runs it there) and
// was confirmed working directly: a real triangle round-tripped to a 75-byte DRACO-magic buffer in
// milliseconds. So this talks to draco3d's low-level Encoder/MeshBuilder API directly, against raw
// position/index/normal/uv/colour arrays -- the shape tools/export/weldVertices.mjs already produces -- and
// never touches THREE.js or a browser at all.
//
// ---- WHY THIS COULD NOT JUST CALL DRACOExporter.js's OWN parse() (had it been vendored) ---------------------
// DRACOExporter.parse() returns a raw, standalone .drc buffer for a file format Draco defines on its own --
// and while it adds each attribute via builder.AddFloatAttributeToMesh(...), it never captures what that call
// RETURNS. That return value is Draco's own internal attribute id, and embedding a Draco mesh inside a glTF
// file needs exactly that id: the spec's KHR_draco_mesh_compression extension maps glTF attribute names to
// Draco's ids explicitly (primitive.extensions.KHR_draco_mesh_compression.attributes), separately from the
// ordinary primitive.attributes map of names to accessor indices. A wrapper built only to write a .drc file
// had no reason to keep that number, so this file captures it itself rather than reusing that shape.
//
// ---- THE CONTAINER IS THE SAME ONE, NOT A SECOND SPELLING -----------------------------------------------------
// packGlb (tools/export/voxelGlb.mjs, extracted at v4176 "so a second writer cannot re-spell it") builds the
// twelve-byte header and the two padded chunks; this file only decides what goes in the JSON and where the
// compressed blob sits in the BIN payload. THE BUFFERVIEW CARRIES NO `target`: unlike voxelGlb.mjs's addView,
// which marks a FLOAT view ARRAY_BUFFER because a GPU binds it directly, a Draco blob is opaque compressed
// bytes with no bufferView on its own accessors at all (glTF 2.0's own KHR_draco_mesh_compression contract --
// gpu/glbPeek.mjs's needsDraco() and gpu/GLBParser.js's _readAccessor already read a Draco file exactly this
// way, on the decode side).
"use strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { packGlb, vec3Bounds } from "./voxelGlb.mjs";

export const DRACO_EXT = "KHR_draco_mesh_compression";
const FLOAT = 5126;              // componentType
const TRIANGLES = 4;             // primitive mode

const ENCODER_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    "..", "..", "vendor", "draco-encoder", "draco_encoder_nodejs.js");

let _modulePromise = null;
/** The Emscripten module, created at most once per process and shared by every later call. */
function loadEncoderModule() {
    if (!_modulePromise) {
        const requireFn = createRequire(import.meta.url);
        const DracoEncoderModule = requireFn(ENCODER_PATH);
        _modulePromise = DracoEncoderModule({});
    }
    return _modulePromise;
}

// Bits per attribute a caller has not overridden. POSITION gets the most (16): it is what a viewer actually
// judges the mesh by. The rest match three.js's own DRACOExporter.js defaults, so a comparison against that
// tool (had it worked here) would be apples to apples.
const DEFAULT_QUANTIZATION = { POSITION: 16, NORMAL: 8, COLOR: 8, TEX_COORD: 8, GENERIC: 8 };

/**
 * Encode raw mesh arrays into a Draco-compressed buffer.
 *
 * `indices` is optional: an unindexed mesh gets a trivial 0..count-1 face list, the same fallback
 * DRACOExporter.js uses for a non-indexed THREE.BufferGeometry. Draco's own connectivity coding needs shared
 * vertices to have anything to compress, so an unwelded mesh compresses far worse than a welded one -- this
 * function does not weld on a caller's behalf (tools/export/weldVertices.mjs already exists for that, and
 * voxelGlb.mjs's own writeGlb({weld:true}) is deliberately opt-in for the same reason: welding discards a
 * distinction, normal or colour, that two vertices at one position might be making on purpose).
 *
 * Returns { bytes, attributeIds, vertexCount, triangleCount }. `attributeIds` carries ONLY the Draco-internal
 * ids for the attributes actually added -- a caller building a KHR_draco_mesh_compression primitive reads it
 * to build that extension's own `attributes` map.
 */
export async function encodeDracoMesh({ positions, indices = null, normals = null, uvs = null, colors = null,
                                        quantization = {}, encodingMethod = "EDGEBREAKER", speed = 5 } = {}) {
    if (!positions || !positions.length) throw new Error("encodeDracoMesh: no positions");
    const draco = await loadEncoderModule();
    const count = Math.floor(positions.length / 3);
    const builder = new draco.MeshBuilder();
    const mesh = new draco.Mesh();
    const attributeIds = {};
    let triCount;
    try {
        const pos = positions instanceof Float32Array ? positions : new Float32Array(positions);
        attributeIds.POSITION = builder.AddFloatAttributeToMesh(mesh, draco.POSITION, count, 3, pos);

        if (indices && indices.length) {
            const idx = indices instanceof Uint32Array ? indices : Uint32Array.from(indices);
            triCount = Math.floor(idx.length / 3);
            builder.AddFacesToMesh(mesh, triCount, idx);
        } else {
            // *** THE SAME FALLBACK DRACOExporter.js USES FOR A NON-INDEXED BufferGeometry. ***
            const idx = new (count > 65535 ? Uint32Array : Uint16Array)(count);
            for (let i = 0; i < count; i++) idx[i] = i;
            triCount = Math.floor(count / 3);
            builder.AddFacesToMesh(mesh, triCount, idx);
        }

        if (normals && normals.length) {
            const n = normals instanceof Float32Array ? normals : new Float32Array(normals);
            attributeIds.NORMAL = builder.AddFloatAttributeToMesh(mesh, draco.NORMAL, count, 3, n);
        }
        if (uvs && uvs.length) {
            const u = uvs instanceof Float32Array ? uvs : new Float32Array(uvs);
            attributeIds.TEX_COORD = builder.AddFloatAttributeToMesh(mesh, draco.TEX_COORD, count, 2, u);
        }
        if (colors && colors.length) {
            const c = colors instanceof Float32Array ? colors : new Float32Array(colors);
            attributeIds.COLOR = builder.AddFloatAttributeToMesh(mesh, draco.COLOR, count, 3, c);
        }

        const encoder = new draco.Encoder();
        try {
            encoder.SetSpeedOptions(speed, speed);
            encoder.SetEncodingMethod(encodingMethod === "SEQUENTIAL"
                ? draco.MESH_SEQUENTIAL_ENCODING : draco.MESH_EDGEBREAKER_ENCODING);
            for (const name of Object.keys(attributeIds)) {
                const bits = quantization[name] ?? DEFAULT_QUANTIZATION[name];
                encoder.SetAttributeQuantization(draco[name], bits);
            }
            const encodedData = new draco.DracoInt8Array();
            try {
                const length = encoder.EncodeMeshToDracoBuffer(mesh, encodedData);
                if (!(length > 0)) throw new Error("Draco encoding failed (EncodeMeshToDracoBuffer returned " + length + ")");
                // DracoInt8Array holds SIGNED bytes; masking to 0xff is the standard int8 -> uint8 reinterpret,
                // not a numeric change -- GetValue(-1) and a raw byte of 0xff are the same bit pattern.
                const bytes = new Uint8Array(length);
                for (let i = 0; i < length; i++) bytes[i] = encodedData.GetValue(i) & 0xff;
                return { bytes, attributeIds, vertexCount: count, triangleCount: triCount };
            } finally { draco.destroy(encodedData); }
        } finally { draco.destroy(encoder); }
    } finally { draco.destroy(mesh); draco.destroy(builder); }
}

/**
 * Write a binary glTF whose one mesh primitive is Draco-compressed, reusing voxelGlb.mjs's own packGlb so
 * the container layout has exactly one owner across both writers.
 *
 * @param mesh { positions, indices?, normals?, uvs?, colors?, name? } -- the same flat-array shape
 *             tools/export/weldVertices.mjs and tools/export/voxelGlb.mjs already speak.
 * @returns { glb: Uint8Array, stats: <encodeDracoMesh's return> }
 */
export async function writeDracoGlb(mesh, opts = {}) {
    const { positions, indices, normals, uvs, colors, name } = mesh || {};
    const enc = await encodeDracoMesh({ positions, indices, normals, uvs, colors, ...opts });

    const count = Math.floor(positions.length / 3);
    const bounds = vec3Bounds(positions instanceof Float32Array ? positions : new Float32Array(positions));
    if (!bounds) throw new Error("writeDracoGlb: no finite positions");

    // Regular glTF accessor indices (POSITION accessor 0, etc.) are SEPARATE from Draco's own attribute ids
    // (attributeIds.POSITION etc.) -- the extension's own `attributes` map is what connects them, and the two
    // numbering schemes need not agree at all (measured: they usually do not, once more than one attribute
    // is present, because Draco assigns ids in the order attributes were added to the SAME mesh).
    const accessors = [{ componentType: FLOAT, count, type: "VEC3", min: bounds.min, max: bounds.max }];
    const glAttributes = { POSITION: 0 };
    const dracoAttributes = { POSITION: enc.attributeIds.POSITION };

    if (enc.attributeIds.NORMAL !== undefined) {
        accessors.push({ componentType: FLOAT, count, type: "VEC3" });
        glAttributes.NORMAL = accessors.length - 1;
        dracoAttributes.NORMAL = enc.attributeIds.NORMAL;
    }
    if (enc.attributeIds.TEX_COORD !== undefined) {
        accessors.push({ componentType: FLOAT, count, type: "VEC2" });
        glAttributes.TEXCOORD_0 = accessors.length - 1;
        // *** THE EXTENSION'S attributes MAP USES glTF's SEMANTIC NAMES, NOT DRACO'S GENERIC TYPE NAMES. ***
        // Measured directly against vendor/three/jsm/loaders/GLTFLoader.js's own
        // GLTFDracoMeshCompressionExtension.decodePrimitive: it looks up gltfAttributeMap[attributeName] for
        // each key of primitive.attributes (POSITION, NORMAL, TEXCOORD_0, COLOR_0), so a key spelled the
        // Draco way ("TEX_COORD") is silently never found and the attribute is dropped -- POSITION and
        // NORMAL happen to be spelled identically both ways, which is what let that bug hide behind them.
        dracoAttributes.TEXCOORD_0 = enc.attributeIds.TEX_COORD;
    }
    if (enc.attributeIds.COLOR !== undefined) {
        accessors.push({ componentType: FLOAT, count, type: "VEC3" });
        glAttributes.COLOR_0 = accessors.length - 1;
        dracoAttributes.COLOR_0 = enc.attributeIds.COLOR;
    }

    const binLen = enc.bytes.length;
    const chunks = [{ bytes: enc.bytes, byteOffset: 0 }];
    // NO `target`: this bufferView holds opaque compressed bytes, not a typed array a GPU could bind as-is.
    const bufferViews = [{ buffer: 0, byteOffset: 0, byteLength: binLen }];

    const primitive = { attributes: glAttributes, material: 0, mode: TRIANGLES,
        extensions: { [DRACO_EXT]: { bufferView: 0, attributes: dracoAttributes } } };

    const gltf = {
        asset: { version: "2.0", generator: opts.generator || "SweK Engine dracoEncode" },
        extensionsUsed: [DRACO_EXT], extensionsRequired: [DRACO_EXT],
        scene: 0, scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0, name: name || "mesh0" }],
        meshes: [{ name: name || "mesh0", primitives: [primitive] }],
        // baseColorFactor is white for the same reason voxelGlb.mjs's is: glTF MULTIPLIES it by COLOR_0, and
        // any other value would tint a mesh that has no vertex colours at all.
        materials: [{ name: "draco", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } }],
        accessors, bufferViews,
        buffers: [{ byteLength: binLen }],
    };

    return { glb: packGlb(gltf, chunks, binLen), stats: enc };
}
