// FILE: engine/mtoFormat.js
// VERSION: v1 — round 351
//
// .mto = "Medical Tomographic Object" file. Output of a SimpleITK +
// 3D U-Net pipeline that reads DICOM/NIfTI volumes and emits the
// surface voxels of segmented tissue classes with precomputed gradient
// normals. The 22-byte stride is dense enough that a single
// gl.bufferData() ships a whole CT slice's worth of surface samples.
//
// Binary layout:
//   Offset  Type     Field
//   ------  -------  -----------------------------------
//   0-3     uint32   Magic = 0x214F544D ("MTO!" LE)
//   4-7     uint32   Sample count (N)
//   8+      N × 22 bytes:
//             0-5    i16 × 3   Voxel coord (x, y, z) — direct array index
//             6-17   f32 × 3   Smooth normal (gradient of segmentation mask)
//             18     u8        Intensity (0-255, scaled from HU or T1)
//             19     u8        Tissue class ID (lookup into tissue palette)
//             20-21  u8 × 2    Reserved (padding to align next sample)
//
// Coords are int16 so a 4-byte offset doesn't reduce a CT volume into
// "compressed" voxels with quantization artifacts. They directly index
// the original DICOM voxel grid.

import { writeVersionedHeader, readVersionedHeader, versionedMagic, VERSIONED_HEADER_BYTES } from "./binaryHeader.mjs";

export const MTO_MAGIC = 0x214F544D;   // "MTO!" LE
export const MTO_MAGIC_V = versionedMagic(MTO_MAGIC);   // "MTO2" -- carries a version field
export const MTO_VERSION = 1;          // IN THE FILE now, not only in the comment at the top of this one
export const MTO_LEGACY_HEADER_BYTES = 8;    // magic + sample count, as written before there was a version
export const MTO_HEADER_BYTES = VERSIONED_HEADER_BYTES + 4;   // magic + version + sample count
export const MTO_SAMPLE_BYTES = 22;

/**
 * Encode an MTO struct to .mto binary.
 *
 * @param {object} mto
 *   { count, coords: Int16Array(N*3), normals: Float32Array(N*3),
 *     intensity: Uint8Array(N), classes: Uint8Array(N) }
 */
export function encodeMTO(mto) {
    const { count, coords, normals, intensity, classes } = mto;
    if (!Number.isInteger(count) || count < 0) throw new Error("encodeMTO: bad count");
    if (!(coords    instanceof Int16Array))    throw new Error("encodeMTO: coords must be Int16Array");
    if (!(normals   instanceof Float32Array))   throw new Error("encodeMTO: normals must be Float32Array");
    if (!(intensity instanceof Uint8Array))     throw new Error("encodeMTO: intensity must be Uint8Array");
    if (!(classes   instanceof Uint8Array))     throw new Error("encodeMTO: classes must be Uint8Array");
    if (coords.length    !== count * 3) throw new Error(`encodeMTO: coords length ${coords.length} != ${count*3}`);
    if (normals.length   !== count * 3) throw new Error(`encodeMTO: normals length ${normals.length} != ${count*3}`);
    if (intensity.length !== count)      throw new Error(`encodeMTO: intensity length ${intensity.length} != ${count}`);
    if (classes.length   !== count)      throw new Error(`encodeMTO: classes length ${classes.length} != ${count}`);

    const total = MTO_HEADER_BYTES + count * MTO_SAMPLE_BYTES;
    const buf = new ArrayBuffer(total);
    const dv  = new DataView(buf);
    const hdr = writeVersionedHeader(dv, MTO_MAGIC, MTO_VERSION);
    dv.setUint32(hdr, count, true);
    let off = MTO_HEADER_BYTES;
    for (let i = 0; i < count; i++) {
        dv.setInt16(off + 0,  coords[i*3],     true);
        dv.setInt16(off + 2,  coords[i*3 + 1], true);
        dv.setInt16(off + 4,  coords[i*3 + 2], true);
        dv.setFloat32(off + 6,  normals[i*3],     true);
        dv.setFloat32(off + 10, normals[i*3 + 1], true);
        dv.setFloat32(off + 14, normals[i*3 + 2], true);
        dv.setUint8(off + 18, intensity[i]);
        dv.setUint8(off + 19, classes[i]);
        dv.setUint8(off + 20, 0);
        dv.setUint8(off + 21, 0);
        off += MTO_SAMPLE_BYTES;
    }
    return buf;
}

export function decodeMTO(buf) {
    if (!(buf instanceof ArrayBuffer) || buf.byteLength < 4) {
        throw new Error("decodeMTO: buffer too small for header");
    }
    const dv = new DataView(buf);
    // Refuses a FUTURE version by name; accepts a pre-version file as version 0 and reads the old offsets.
    const { version, bodyOffset } = readVersionedHeader(dv, {
        name: "decodeMTO", legacyMagic: MTO_MAGIC, current: MTO_VERSION, legacyBodyOffset: 4,
    });
    const headerBytes = bodyOffset + 4;
    if (buf.byteLength < headerBytes) throw new Error(`decodeMTO: truncated header (${buf.byteLength}B)`);
    const count = dv.getUint32(bodyOffset, true);
    const expected = headerBytes + count * MTO_SAMPLE_BYTES;
    if (buf.byteLength < expected) {
        throw new Error(`decodeMTO: truncated (have ${buf.byteLength}B, expected ${expected}B for ${count} samples)`);
    }
    const coords    = new Int16Array(count * 3);
    const normals   = new Float32Array(count * 3);
    const intensity = new Uint8Array(count);
    const classes   = new Uint8Array(count);
    let off = headerBytes;
    for (let i = 0; i < count; i++) {
        coords[i*3]     = dv.getInt16(off + 0, true);
        coords[i*3 + 1] = dv.getInt16(off + 2, true);
        coords[i*3 + 2] = dv.getInt16(off + 4, true);
        normals[i*3]     = dv.getFloat32(off + 6,  true);
        normals[i*3 + 1] = dv.getFloat32(off + 10, true);
        normals[i*3 + 2] = dv.getFloat32(off + 14, true);
        intensity[i] = dv.getUint8(off + 18);
        classes[i]   = dv.getUint8(off + 19);
        off += MTO_SAMPLE_BYTES;
    }
    return { count, coords, normals, intensity, classes, version };
}
