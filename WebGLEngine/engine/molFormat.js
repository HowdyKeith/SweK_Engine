// FILE: engine/molFormat.js
// VERSION: v1 — round 350
//
// .mol = "Molecular Object" file. Output of the AtomicFieldProcessor
// Python pipeline described in lastai_finally.txt — extracts atomic
// coordinates from PDB/CIF structures (or AlphaFold-3 outputs) and
// packs them into a tight 24-byte stride suitable for one
// gl.bufferData() upload.
//
// Binary layout:
//
//   Offset  Type     Field
//   ------  -------  -----------------------------------
//   0-3     uint32   Magic = 0x214C4F4D ("MOL!" LE)
//   4-7     uint32   Atom count (N)
//   8+      N × 24 bytes:
//             0-11   f32 × 3   Atomic position (X, Y, Z) in Angstroms
//             12-19  f32 × 2   pLDDT confidence (0-100) + occupancy (0-1)
//             20-23  u8  × 4   Element ID + charge sign + 2 reserved
//
// Element IDs match standard atomic numbers (H=1, C=6, N=7, O=8, P=15,
// S=16, etc) so the renderer can pick CPK colors and Van der Waals
// radii via lookup tables in molGenerator.js.

import { writeVersionedHeader, readVersionedHeader, versionedMagic, VERSIONED_HEADER_BYTES } from "./binaryHeader.mjs";

export const MOL_MAGIC = 0x214C4F4D;   // "MOL!" little-endian
export const MOL_MAGIC_V = versionedMagic(MOL_MAGIC);   // "MOL2" -- carries a version field
export const MOL_VERSION = 1;          // IN THE FILE now, not only in the comment at the top of this one
export const MOL_LEGACY_HEADER_BYTES = 8;    // magic + atom count, as written before there was a version
export const MOL_HEADER_BYTES = VERSIONED_HEADER_BYTES + 4;   // magic + version + atom count
export const MOL_ATOM_BYTES = 24;

/**
 * Encode a molecule into the .mol binary format.
 *
 * @param {object} mol
 *   { count, positions: Float32Array(N*3), fields: Float32Array(N*2),
 *     elements: Uint8Array(N*4)  // [elementId, chargeSign, _, _] per atom
 *   }
 * @returns {ArrayBuffer}
 */
export function encodeMOL(mol) {
    const { count, positions, fields, elements } = mol;
    if (!Number.isInteger(count) || count < 0)          throw new Error("encodeMOL: bad count");
    if (!(positions instanceof Float32Array))            throw new Error("encodeMOL: positions must be Float32Array");
    if (!(fields    instanceof Float32Array))            throw new Error("encodeMOL: fields must be Float32Array");
    if (!(elements  instanceof Uint8Array))              throw new Error("encodeMOL: elements must be Uint8Array");
    if (positions.length !== count * 3) throw new Error(`encodeMOL: positions length ${positions.length} != ${count * 3}`);
    if (fields.length    !== count * 2) throw new Error(`encodeMOL: fields length ${fields.length} != ${count * 2}`);
    if (elements.length  !== count * 4) throw new Error(`encodeMOL: elements length ${elements.length} != ${count * 4}`);

    const total = MOL_HEADER_BYTES + count * MOL_ATOM_BYTES;
    const buf = new ArrayBuffer(total);
    const dv  = new DataView(buf);
    const hdr = writeVersionedHeader(dv, MOL_MAGIC, MOL_VERSION);
    dv.setUint32(hdr, count, true);

    let off = MOL_HEADER_BYTES;
    for (let i = 0; i < count; i++) {
        dv.setFloat32(off + 0,  positions[i * 3 + 0], true);
        dv.setFloat32(off + 4,  positions[i * 3 + 1], true);
        dv.setFloat32(off + 8,  positions[i * 3 + 2], true);
        dv.setFloat32(off + 12, fields[i * 2 + 0],    true);   // pLDDT
        dv.setFloat32(off + 16, fields[i * 2 + 1],    true);   // occupancy
        dv.setUint8(off + 20, elements[i * 4 + 0]);             // element ID
        dv.setUint8(off + 21, elements[i * 4 + 1]);             // charge sign
        dv.setUint8(off + 22, elements[i * 4 + 2]);
        dv.setUint8(off + 23, elements[i * 4 + 3]);
        off += MOL_ATOM_BYTES;
    }
    return buf;
}

/** Decode a .mol ArrayBuffer back into typed arrays. */
export function decodeMOL(buf) {
    if (!(buf instanceof ArrayBuffer) || buf.byteLength < 4) {
        throw new Error("decodeMOL: buffer too small for header");
    }
    const dv = new DataView(buf);
    // Refuses a FUTURE version by name; accepts a pre-version file as version 0 and reads the old offsets.
    const { version, bodyOffset } = readVersionedHeader(dv, {
        name: "decodeMOL", legacyMagic: MOL_MAGIC, current: MOL_VERSION, legacyBodyOffset: 4,
    });
    const headerBytes = bodyOffset + 4;
    if (buf.byteLength < headerBytes) throw new Error(`decodeMOL: truncated header (${buf.byteLength}B)`);
    const count = dv.getUint32(bodyOffset, true);
    const expected = headerBytes + count * MOL_ATOM_BYTES;
    if (buf.byteLength < expected) {
        throw new Error(`decodeMOL: payload truncated (have ${buf.byteLength}B, expected ${expected}B for ${count} atoms)`);
    }

    const positions = new Float32Array(count * 3);
    const fields    = new Float32Array(count * 2);
    const elements  = new Uint8Array(count * 4);

    let off = headerBytes;
    for (let i = 0; i < count; i++) {
        positions[i * 3 + 0] = dv.getFloat32(off + 0,  true);
        positions[i * 3 + 1] = dv.getFloat32(off + 4,  true);
        positions[i * 3 + 2] = dv.getFloat32(off + 8,  true);
        fields[i * 2 + 0]    = dv.getFloat32(off + 12, true);
        fields[i * 2 + 1]    = dv.getFloat32(off + 16, true);
        elements[i * 4 + 0]  = dv.getUint8(off + 20);
        elements[i * 4 + 1]  = dv.getUint8(off + 21);
        elements[i * 4 + 2]  = dv.getUint8(off + 22);
        elements[i * 4 + 3]  = dv.getUint8(off + 23);
        off += MOL_ATOM_BYTES;
    }
    return { count, positions, fields, elements, version };
}

/** Compute bbox + center over atomic positions. */
export function molBBox(mol) {
    const p = mol.positions;
    if (mol.count === 0) return { min: [0,0,0], max: [0,0,0], center: [0,0,0], size: [0,0,0] };
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < mol.count; i++) {
        const x = p[i*3], y = p[i*3+1], z = p[i*3+2];
        if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
    }
    return {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
        center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
        size:   [maxX - minX, maxY - minY, maxZ - minZ],
    };
}
