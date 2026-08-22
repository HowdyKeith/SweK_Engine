// FILE: engine/vxFormat.js
// VERSION: v1 — round 344
//
// Custom binary format for compact voxel-grid storage. The .vx layout
// is engineered for one specific characteristic: voxel data is mostly
// flat runs of identical values (air, then a wall of stone, then more
// air, etc.), so Run-Length Encoding crushes file size 90-95% on the
// common case without any DEFLATE/Brotli round-trip.
//
// Binary layout:
//
//   Offset  Type     Field
//   ------  -------  ---------------------------------------------
//   0-3     uint32   Magic = 0x56584C21 ("VXL!" little-endian)
//   4-5     uint16   Width
//   6-7     uint16   Height
//   8-9     uint16   Depth
//   10      uint8    Channels (1 = index/occupancy, 4 = RGBA)
//   11+     [uint16 count, uint8 value] × M
//
// Reading is a single pass with one ArrayBuffer + DataView, no
// dependencies. Writing is a single pass plus a sizing pre-pass for
// allocation. Both run in pure JS in Node and the browser.

export const VX_MAGIC = 0x56584C21;   // "VXL!" little-endian
export const VX_HEADER_BYTES = 11;
export const VX_MAX_RUN = 0xFFFF;      // uint16 cap per RLE pair

/**
 * Encode a flat Uint8Array (length = width × height × depth × channels)
 * into the .vx binary format.
 *
 * @param {{ width:number, height:number, depth:number, channels:number, data:Uint8Array }} grid
 * @returns {ArrayBuffer}
 */
export function encodeVX(grid) {
    const { width, height, depth, channels, data } = grid;
    if (!Number.isInteger(width)  || width  <= 0 || width  > 65535) throw new Error("encodeVX: bad width");
    if (!Number.isInteger(height) || height <= 0 || height > 65535) throw new Error("encodeVX: bad height");
    if (!Number.isInteger(depth)  || depth  <= 0 || depth  > 65535) throw new Error("encodeVX: bad depth");
    if (!Number.isInteger(channels) || channels <= 0 || channels > 255) throw new Error("encodeVX: bad channels");
    const expectedLen = width * height * depth * channels;
    if (!(data instanceof Uint8Array)) throw new Error("encodeVX: data must be Uint8Array");
    if (data.length !== expectedLen) {
        throw new Error(`encodeVX: data length ${data.length} != ${expectedLen} (W*H*D*C)`);
    }

    // First pass: count RLE pairs we'll need.
    let pairCount = 0;
    if (data.length > 0) {
        let cur = data[0];
        let run = 1;
        for (let i = 1; i < data.length; i++) {
            if (data[i] === cur && run < VX_MAX_RUN) {
                run++;
            } else {
                pairCount++;
                cur = data[i];
                run = 1;
            }
        }
        pairCount++;
    }

    // Allocate exact size: header + pairs × 3 bytes
    const totalBytes = VX_HEADER_BYTES + pairCount * 3;
    const buf = new ArrayBuffer(totalBytes);
    const dv  = new DataView(buf);

    // Write header
    dv.setUint32(0,  VX_MAGIC, true);
    dv.setUint16(4,  width,    true);
    dv.setUint16(6,  height,   true);
    dv.setUint16(8,  depth,    true);
    dv.setUint8(10,  channels);

    // Second pass: emit RLE pairs
    let off = VX_HEADER_BYTES;
    if (data.length > 0) {
        let cur = data[0];
        let run = 1;
        const emit = (count, value) => {
            dv.setUint16(off, count, true); off += 2;
            dv.setUint8(off,  value);       off += 1;
        };
        for (let i = 1; i < data.length; i++) {
            if (data[i] === cur && run < VX_MAX_RUN) {
                run++;
            } else {
                emit(run, cur);
                cur = data[i];
                run = 1;
            }
        }
        emit(run, cur);
    }
    return buf;
}

/**
 * Decode a .vx ArrayBuffer back into a flat Uint8Array.
 *
 * @param {ArrayBuffer} buf
 * @returns {{ width, height, depth, channels, data: Uint8Array }}
 */
export function decodeVX(buf) {
    if (!(buf instanceof ArrayBuffer) || buf.byteLength < VX_HEADER_BYTES) {
        throw new Error("decodeVX: buffer too small for header");
    }
    const dv = new DataView(buf);
    const magic = dv.getUint32(0, true);
    if (magic !== VX_MAGIC) {
        throw new Error(`decodeVX: magic mismatch (got 0x${magic.toString(16)}, expected 0x${VX_MAGIC.toString(16)})`);
    }
    const width    = dv.getUint16(4, true);
    const height   = dv.getUint16(6, true);
    const depth    = dv.getUint16(8, true);
    const channels = dv.getUint8(10);

    const total = width * height * depth * channels;
    const data = new Uint8Array(total);
    let writePtr = 0;
    let off = VX_HEADER_BYTES;
    while (off < buf.byteLength && writePtr < total) {
        const count = dv.getUint16(off, true); off += 2;
        const value = dv.getUint8(off);         off += 1;
        // Bound the inner write to avoid overrun on corrupted files
        const end = Math.min(writePtr + count, total);
        for (; writePtr < end; writePtr++) data[writePtr] = value;
    }
    if (writePtr !== total) {
        console.warn(`[vxFormat] decodeVX: payload ended at ${writePtr}/${total}; data is partial`);
    }
    return { width, height, depth, channels, data };
}

/**
 * Upload a single-channel .vx decoded grid into a WebGL2 TEXTURE_3D.
 * Caller passes the target texture unit; we don't pick one because
 * the engine reserves TEXTURE3 for shadows and we don't want clashes.
 */
export function uploadVXToTexture3D(gl, grid, opts = {}) {
    const unit = opts.textureUnit ?? 5;
    if (grid.channels !== 1) {
        throw new Error("uploadVXToTexture3D: only single-channel grids supported by this helper (got " + grid.channels + ")");
    }
    const tex = opts.texture ?? gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage3D(
        gl.TEXTURE_3D, 0, gl.R8,
        grid.width, grid.height, grid.depth,
        0, gl.RED, gl.UNSIGNED_BYTE, grid.data
    );
    gl.bindTexture(gl.TEXTURE_3D, null);
    return tex;
}

/**
 * Diagnostic: compression ratio for an arbitrary grid (without emitting).
 * Useful for sizing checks before deciding to ship the file.
 */
export function estimateCompression(grid) {
    const { width, height, depth, channels, data } = grid;
    const raw = width * height * depth * channels;
    if (raw === 0) return { rawBytes: 0, encodedBytes: VX_HEADER_BYTES, ratio: 0 };
    let pairs = 1;
    let cur = data[0], run = 1;
    for (let i = 1; i < data.length; i++) {
        if (data[i] === cur && run < VX_MAX_RUN) run++;
        else { pairs++; cur = data[i]; run = 1; }
    }
    const enc = VX_HEADER_BYTES + pairs * 3;
    return { rawBytes: raw, encodedBytes: enc, ratio: 1 - enc / raw, pairs };
}
