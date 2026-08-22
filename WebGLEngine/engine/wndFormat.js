// FILE: engine/wndFormat.js
// VERSION: v1 — round 353
//
// .wnd = "Wind/fluiD" file. Output of a NetCDF4 + scipy.interpolate
// Python pipeline that reads atmospheric reanalysis data (ERA5, GFS) or
// CFD simulation output and packs a regular 3D vector field into an
// RGBA32F texture suitable for one gl.texImage3D() upload.
//
// Binary layout:
//   Offset  Type     Field
//   ------  -------  -----------------------------------
//   0-3     uint32   Magic = 0x21444E57 ("WND!" LE)
//   4-7     uint32   Width  (X dimension, sampled longitudinally)
//   8-11    uint32   Height (Y dimension, sampled vertically)
//   12-15   uint32   Depth  (Z dimension, sampled latitudinally)
//   16-19   uint32   Reserved (set 0; reserved for time slice count later)
//   20+     W×H×D × 16 bytes (RGBA32F):
//             R = u (X velocity component, m/s typically)
//             G = v (Y velocity)
//             B = w (Z velocity)
//             A = density/intensity (0-1 normalized)
//
// Storage is row-major X-fastest (matches OpenGL's TEXTURE_3D upload).

export const WND_MAGIC = 0x21444E57;   // "WND!" LE
export const WND_HEADER_BYTES = 20;
export const WND_VOXEL_BYTES = 16;     // RGBA32F

export function encodeWND(wnd) {
    const { width, height, depth, data } = wnd;
    if (!Number.isInteger(width)  || width  <= 0) throw new Error("encodeWND: bad width");
    if (!Number.isInteger(height) || height <= 0) throw new Error("encodeWND: bad height");
    if (!Number.isInteger(depth)  || depth  <= 0) throw new Error("encodeWND: bad depth");
    if (!(data instanceof Float32Array))           throw new Error("encodeWND: data must be Float32Array");
    const voxels = width * height * depth;
    if (data.length !== voxels * 4) {
        throw new Error(`encodeWND: data length ${data.length} != ${voxels * 4} (W×H×D×4)`);
    }
    const total = WND_HEADER_BYTES + voxels * WND_VOXEL_BYTES;
    const buf = new ArrayBuffer(total);
    const dv = new DataView(buf);
    dv.setUint32(0,  WND_MAGIC, true);
    dv.setUint32(4,  width,     true);
    dv.setUint32(8,  height,    true);
    dv.setUint32(12, depth,     true);
    dv.setUint32(16, 0,         true);
    new Float32Array(buf, WND_HEADER_BYTES).set(data);
    return buf;
}

export function decodeWND(buf) {
    if (!(buf instanceof ArrayBuffer) || buf.byteLength < WND_HEADER_BYTES) {
        throw new Error("decodeWND: buffer too small for header");
    }
    const dv = new DataView(buf);
    const magic = dv.getUint32(0, true);
    if (magic !== WND_MAGIC) {
        throw new Error(`decodeWND: magic mismatch (got 0x${magic.toString(16)}, expected 0x${WND_MAGIC.toString(16)} = "WND!")`);
    }
    const width  = dv.getUint32(4,  true);
    const height = dv.getUint32(8,  true);
    const depth  = dv.getUint32(12, true);
    const voxels = width * height * depth;
    const expected = WND_HEADER_BYTES + voxels * WND_VOXEL_BYTES;
    if (buf.byteLength < expected) {
        throw new Error(`decodeWND: truncated (have ${buf.byteLength}B, expected ${expected}B for ${width}×${height}×${depth})`);
    }
    // Copy the float data out — slicing the buffer keeps the original alive
    const data = new Float32Array(voxels * 4);
    data.set(new Float32Array(buf, WND_HEADER_BYTES, voxels * 4));
    return { width, height, depth, data };
}

/** Compute summary stats for status displays. */
export function wndStats(wnd) {
    let minMag = Infinity, maxMag = -Infinity, sumMag = 0;
    const voxels = wnd.width * wnd.height * wnd.depth;
    for (let i = 0; i < voxels; i++) {
        const u = wnd.data[i*4], v = wnd.data[i*4+1], w = wnd.data[i*4+2];
        const m = Math.hypot(u, v, w);
        if (m < minMag) minMag = m;
        if (m > maxMag) maxMag = m;
        sumMag += m;
    }
    return {
        voxels,
        minMag, maxMag,
        avgMag: sumMag / voxels,
        bytes: WND_HEADER_BYTES + voxels * WND_VOXEL_BYTES,
    };
}
