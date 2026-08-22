// FILE: gpu/SplatLoader.js
// VERSION: v2 (v785 — binary .ply support added)
//
// Parses 3D Gaussian Splat point-cloud formats produced by TripoSplat,
// PolyCam, and other splat exporters. Returns geometry buffers ready
// for a renderer (positions + colors + scales + rotations).
//
// Supported input:
//   .splat   — binary, 32 bytes per Gaussian, little-endian.
//              Layout: pos[3 float32] · scale[3 float32] · color[4 uint8] · rot[4 uint8 quaternion]
//   .ply     — ASCII OR binary (little/big endian). The header is walked
//              once to determine format, vertex count, and the per-vertex
//              property table; the body is then read with the appropriate
//              parser. Vertex properties: x, y, z, f_dc_0/1/2 (DC SH →
//              color via SH0 = 0.282094), opacity (sigmoid → alpha),
//              scale_0/1/2 (exp → linear), rot_0/1/2/3 (raw quaternion
//              components — caller normalizes if needed).
//
// v785 additions:
//   - Binary little-endian .ply (TripoSplat's default export format)
//   - Binary big-endian .ply (rarer, but the header walker handles it)
//   - Property-type-aware stride computation (float/double/int/etc.)
//   - Shared _fillVertex + _parsePlyHeader helpers eliminate duplicated
//     SH0/sigmoid/exp transforms across ascii vs binary paths.

// SH0 normalization constant — converts the f_dc_* fields (in the
// raw model output range -inf..+inf) into 0..1 color. Standard 3DGS
// formula: rgb = 0.5 + SH0 * f_dc.
const SH0 = 0.28209479177387814;

// PLY property type → byte size + DataView accessor name
const PLY_TYPE_INFO = {
    "char":   { size: 1, get: "getInt8"    },
    "int8":   { size: 1, get: "getInt8"    },
    "uchar":  { size: 1, get: "getUint8"   },
    "uint8":  { size: 1, get: "getUint8"   },
    "short":  { size: 2, get: "getInt16"   },
    "int16":  { size: 2, get: "getInt16"   },
    "ushort": { size: 2, get: "getUint16"  },
    "uint16": { size: 2, get: "getUint16"  },
    "int":    { size: 4, get: "getInt32"   },
    "int32":  { size: 4, get: "getInt32"   },
    "uint":   { size: 4, get: "getUint32"  },
    "uint32": { size: 4, get: "getUint32"  },
    "float":  { size: 4, get: "getFloat32" },
    "float32":{ size: 4, get: "getFloat32" },
    "double": { size: 8, get: "getFloat64" },
    "float64":{ size: 8, get: "getFloat64" },
};

function _u8(v) { return Math.max(0, Math.min(255, Math.round(v))); }

/**
 * v792 — detect whether the PLY header has all 9 SH1 fields
 * (f_rest_0..f_rest_8). Partial SH1 (some missing) returns false — we
 * don't want to evaluate SH with zeroed-out coefficients silently.
 */
function _detectSh1(props) {
    const names = new Set(props.map(p => p.name));
    for (let i = 0; i < 9; i++) {
        if (!names.has(`f_rest_${i}`)) return false;
    }
    return true;
}

/**
 * Walk a PLY header. Returns:
 *   { format: "ascii"|"binary_little_endian"|"binary_big_endian",
 *     count: int,
 *     props: [ { name, type, size, get } ],
 *     stride: int (binary only),
 *     headerEndByte: int }
 */
function _parsePlyHeader(buf, asText = null) {
    // Decode just enough to find 'end_header' — header is ASCII up to that line
    const view = new Uint8Array(buf);
    let endIdx = -1;
    // Look for "end_header\n" in the first 64KB (PLY headers are tiny)
    const scan = Math.min(view.byteLength, 65536);
    for (let i = 0; i < scan - 11; i++) {
        if (view[i] === 0x65 /* e */ && view[i+1] === 0x6e /* n */ &&
            view[i+2] === 0x64 /* d */ && view[i+3] === 0x5f /* _ */ &&
            view[i+4] === 0x68 /* h */ && view[i+5] === 0x65 /* e */ &&
            view[i+6] === 0x61 /* a */ && view[i+7] === 0x64 /* d */ &&
            view[i+8] === 0x65 /* e */ && view[i+9] === 0x72 /* r */) {
            // Skip the trailing newline (could be \n or \r\n)
            endIdx = i + 10;
            while (endIdx < view.byteLength && (view[endIdx] === 0x0a || view[endIdx] === 0x0d)) endIdx++;
            break;
        }
    }
    if (endIdx < 0) throw new Error("SplatLoader: .ply missing 'end_header'");
    const headerText = new TextDecoder("utf-8").decode(view.subarray(0, endIdx));

    let format = "ascii";
    let count = 0;
    const props = [];
    let stride = 0;
    for (const line of headerText.split(/\r?\n/)) {
        const fm = line.match(/^format\s+(\S+)/);
        if (fm) format = fm[1];
        const cm = line.match(/^element vertex (\d+)/);
        if (cm) count = parseInt(cm[1], 10);
        const pm = line.match(/^property\s+(\S+)\s+(\S+)/);
        if (pm) {
            const t = pm[1].toLowerCase();
            const info = PLY_TYPE_INFO[t];
            if (!info) throw new Error(`SplatLoader: unknown PLY property type '${t}'`);
            props.push({ name: pm[2], type: t, size: info.size, get: info.get });
            stride += info.size;
        }
    }
    if (count === 0) throw new Error("SplatLoader: .ply has 0 vertices");
    return { format, count, props, stride, headerEndByte: endIdx };
}

/**
 * Common fill helper. Given a values map { x, y, z, f_dc_0, ..., opacity,
 * scale_0..2, rot_0..3 } for one vertex, write it into the output buffers
 * at index i. Applies the standard 3DGS conversions: SH0 for color, sigmoid
 * for opacity, exp for scale.
 */
function _fillVertex(i, vals, out) {
    out.positions[i*3+0] = vals.x ?? 0;
    out.positions[i*3+1] = vals.y ?? 0;
    out.positions[i*3+2] = vals.z ?? 0;

    const fdc0 = vals.f_dc_0 ?? 0;
    const fdc1 = vals.f_dc_1 ?? 0;
    const fdc2 = vals.f_dc_2 ?? 0;
    out.colors[i*4+0] = _u8((0.5 + SH0 * fdc0) * 255);
    out.colors[i*4+1] = _u8((0.5 + SH0 * fdc1) * 255);
    out.colors[i*4+2] = _u8((0.5 + SH0 * fdc2) * 255);

    if (vals.opacity !== undefined) {
        const sig = 1 / (1 + Math.exp(-vals.opacity));
        out.colors[i*4+3] = _u8(sig * 255);
    } else {
        out.colors[i*4+3] = 255;
    }

    out.scales[i*3+0] = (vals.scale_0 !== undefined) ? Math.exp(vals.scale_0) : 1;
    out.scales[i*3+1] = (vals.scale_1 !== undefined) ? Math.exp(vals.scale_1) : 1;
    out.scales[i*3+2] = (vals.scale_2 !== undefined) ? Math.exp(vals.scale_2) : 1;

    out.rotations[i*4+0] = vals.rot_0 ?? 1;
    out.rotations[i*4+1] = vals.rot_1 ?? 0;
    out.rotations[i*4+2] = vals.rot_2 ?? 0;
    out.rotations[i*4+3] = vals.rot_3 ?? 0;

    // v792 — SH1 coefficients (view-dependent color). 9 floats per
    // vertex if input has f_rest_0..f_rest_8. PLY field order
    // (matching the Inria 3DGS export convention):
    //   f_rest_0..2 → R channel SH1 (y, z, x)
    //   f_rest_3..5 → G channel SH1 (y, z, x)
    //   f_rest_6..8 → B channel SH1 (y, z, x)
    // Skipped entirely if out.sh1 is null (loader didn't detect SH1).
    if (out.sh1) {
        out.sh1[i*9+0] = vals.f_rest_0 ?? 0;
        out.sh1[i*9+1] = vals.f_rest_1 ?? 0;
        out.sh1[i*9+2] = vals.f_rest_2 ?? 0;
        out.sh1[i*9+3] = vals.f_rest_3 ?? 0;
        out.sh1[i*9+4] = vals.f_rest_4 ?? 0;
        out.sh1[i*9+5] = vals.f_rest_5 ?? 0;
        out.sh1[i*9+6] = vals.f_rest_6 ?? 0;
        out.sh1[i*9+7] = vals.f_rest_7 ?? 0;
        out.sh1[i*9+8] = vals.f_rest_8 ?? 0;
    }
}

/**
 * Parse an ASCII .ply Gaussian splat.
 * @param {string|ArrayBuffer} text
 * @returns {{positions, colors, scales, rotations, count, format: "ply-ascii"}}
 */
export function parsePlyAscii(text) {
    let buf;
    if (typeof text === "string") {
        buf = new TextEncoder().encode(text).buffer;
    } else {
        buf = text;
    }
    const hdr = _parsePlyHeader(buf);
    if (hdr.format !== "ascii") throw new Error("parsePlyAscii: header reports non-ascii format");
    const fullText = new TextDecoder("utf-8").decode(new Uint8Array(buf));
    const body = fullText.slice(hdr.headerEndByte).trim();
    const rows = body.split(/\n+/);
    // v792 — SH1 detection: all 9 of f_rest_0..f_rest_8 must be present
    const hasSh1 = _detectSh1(hdr.props);
    const out = {
        positions: new Float32Array(hdr.count * 3),
        colors:    new Uint8Array  (hdr.count * 4),
        scales:    new Float32Array(hdr.count * 3),
        rotations: new Float32Array(hdr.count * 4),
        sh1:       hasSh1 ? new Float32Array(hdr.count * 9) : null,
        count: hdr.count, format: "ply-ascii",
    };
    for (let i = 0; i < hdr.count; i++) {
        const row = rows[i];
        if (!row) break;
        const cells = row.split(/\s+/);
        const vals = {};
        for (let c = 0; c < hdr.props.length; c++) {
            vals[hdr.props[c].name] = parseFloat(cells[c]);
        }
        _fillVertex(i, vals, out);
    }
    return out;
}

/**
 * Parse a binary .ply Gaussian splat. Supports both endianness markers.
 * Uses DataView stride reads keyed on the property table from the header.
 * @param {ArrayBuffer} buf
 * @returns {{positions, colors, scales, rotations, count, format: "ply-binary"}}
 */
export function parsePlyBinary(buf) {
    const hdr = _parsePlyHeader(buf);
    if (!hdr.format.startsWith("binary_")) throw new Error("parsePlyBinary: header reports non-binary format: " + hdr.format);
    const littleEndian = (hdr.format === "binary_little_endian");
    const dv = new DataView(buf);
    // v792 — SH1 detection
    const hasSh1 = _detectSh1(hdr.props);
    const out = {
        positions: new Float32Array(hdr.count * 3),
        colors:    new Uint8Array  (hdr.count * 4),
        scales:    new Float32Array(hdr.count * 3),
        rotations: new Float32Array(hdr.count * 4),
        sh1:       hasSh1 ? new Float32Array(hdr.count * 9) : null,
        count: hdr.count, format: "ply-binary",
    };

    // Sanity: ensure the body is large enough for count * stride bytes
    const bodyBytes = buf.byteLength - hdr.headerEndByte;
    const needed = hdr.count * hdr.stride;
    if (bodyBytes < needed) {
        throw new Error(`parsePlyBinary: body is ${bodyBytes} bytes but need ${needed} for ${hdr.count} vertices × ${hdr.stride} stride`);
    }

    let off = hdr.headerEndByte;
    for (let i = 0; i < hdr.count; i++) {
        const vals = {};
        for (const p of hdr.props) {
            vals[p.name] = dv[p.get](off, littleEndian);
            off += p.size;
        }
        _fillVertex(i, vals, out);
    }
    return out;
}

/**
 * Parse a .splat binary buffer. 32 bytes per Gaussian.
 * @param {ArrayBuffer} buf
 * @returns {{positions, colors, scales, rotations, count, format: "splat"}}
 */
export function parseSplat(buf) {
    const dv = new DataView(buf);
    const stride = 32;
    if (buf.byteLength % stride !== 0) {
        throw new Error(`SplatLoader: .splat length ${buf.byteLength} is not a multiple of ${stride}`);
    }
    const count = buf.byteLength / stride;
    const positions = new Float32Array(count * 3);
    const scales    = new Float32Array(count * 3);
    const colors    = new Uint8Array(count * 4);
    const rotations = new Uint8Array(count * 4);

    for (let i = 0; i < count; i++) {
        const off = i * stride;
        positions[i*3+0] = dv.getFloat32(off + 0,  true);
        positions[i*3+1] = dv.getFloat32(off + 4,  true);
        positions[i*3+2] = dv.getFloat32(off + 8,  true);
        scales[i*3+0]    = dv.getFloat32(off + 12, true);
        scales[i*3+1]    = dv.getFloat32(off + 16, true);
        scales[i*3+2]    = dv.getFloat32(off + 20, true);
        colors[i*4+0]    = dv.getUint8 (off + 24);
        colors[i*4+1]    = dv.getUint8 (off + 25);
        colors[i*4+2]    = dv.getUint8 (off + 26);
        colors[i*4+3]    = dv.getUint8 (off + 27);
        rotations[i*4+0] = dv.getUint8 (off + 28);
        rotations[i*4+1] = dv.getUint8 (off + 29);
        rotations[i*4+2] = dv.getUint8 (off + 30);
        rotations[i*4+3] = dv.getUint8 (off + 31);
    }
    return { positions, colors, scales, rotations, sh1: null, count, format: "splat" };
}


/**
 * Auto-detect format from file extension and raw bytes. Returns the
 * parsed splat structure or throws if unrecognized.
 * @param {ArrayBuffer} buf
 * @param {string} filename
 */
export function parseSplatFile(buf, filename = "") {
    const ext = (filename.split(".").pop() || "").toLowerCase();
    if (ext === "splat") return parseSplat(buf);
    if (ext === "ply") {
        // Sniff first few bytes for "ply\n" magic
        const head = new Uint8Array(buf, 0, Math.min(256, buf.byteLength));
        const headStr = String.fromCharCode.apply(null, head);
        if (!headStr.startsWith("ply")) throw new Error("SplatLoader: .ply file missing 'ply' magic");
        // Route to ASCII or binary parser based on the format line
        if (headStr.includes("format ascii")) {
            const text = new TextDecoder("utf-8").decode(buf);
            return parsePlyAscii(text);
        }
        if (headStr.includes("format binary_")) {
            return parsePlyBinary(buf);
        }
        throw new Error("SplatLoader: .ply header missing 'format ascii' or 'format binary_*'");
    }
    throw new Error(`SplatLoader: unrecognized extension '${ext}' — expected .splat or .ply`);
}
