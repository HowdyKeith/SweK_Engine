// FILE: engine/splatParser.js
// VERSION: v1 — round 341
//
// Parses .ply (the de-facto Gaussian Splat format used by INRIA's
// gaussian-splatting repo, LGM, CRM, Hunyuan3D, etc.). Header is ASCII,
// body is binary little-endian floats. Each "vertex" is one Gaussian
// with position, scale, rotation (quaternion), color (SH band 0), and
// opacity.
//
// We deliberately skip the higher SH coefficients (f_rest_*, 45 values
// per splat for SH degree 3). That gives view-dependent lighting which
// most casual usage doesn't need, and skipping cuts file size by ~10×
// during import. The base diffuse color (f_dc_0/1/2) is sufficient for
// "show me the asset in the world."
//
// Returns:
//   {
//     count: N,
//     positions:  Float32Array (N * 3)
//     scales:     Float32Array (N * 3)   // in log space — exp() at render time
//     quats:      Float32Array (N * 4)   // (w, x, y, z) but PLY stores rot_0..3
//     colors:     Float32Array (N * 3)   // diffuse RGB in [0, 1]
//     opacities:  Float32Array (N)       // pre-sigmoid; apply sigmoid at render
//     bbox: { min:[x,y,z], max:[x,y,z], center:[x,y,z], size:[x,y,z] }
//   }

function _parseHeader(text) {
    const lines = text.split("\n");
    const props = [];
    let count = 0;
    let format = null;
    let endLine = -1;
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i].trim();
        if (ln === "end_header") { endLine = i; break; }
        if (ln.startsWith("format ")) {
            const parts = ln.split(/\s+/);
            format = parts[1]; // "binary_little_endian" | "ascii" | "binary_big_endian"
        } else if (ln.startsWith("element vertex ")) {
            count = parseInt(ln.split(/\s+/)[2], 10);
        } else if (ln.startsWith("property ")) {
            const parts = ln.split(/\s+/);
            props.push({ type: parts[1], name: parts[2] });
        }
    }
    if (endLine < 0) throw new Error("[splatParser] no end_header found");
    if (format !== "binary_little_endian") {
        throw new Error("[splatParser] only binary_little_endian PLYs supported (got " + format + ")");
    }
    return { props, count, endLine };
}

function _propSize(type) {
    switch (type) {
        case "float":  case "float32": return 4;
        case "double": case "float64": return 8;
        case "uchar":  case "uint8":   return 1;
        case "char":   case "int8":    return 1;
        case "ushort": case "uint16":  return 2;
        case "short":  case "int16":   return 2;
        case "uint":   case "uint32":  return 4;
        case "int":    case "int32":   return 4;
        default: throw new Error("[splatParser] unknown property type: " + type);
    }
}

function _readProp(dv, off, type) {
    switch (type) {
        case "float":  case "float32": return dv.getFloat32(off, true);
        case "double": case "float64": return dv.getFloat64(off, true);
        case "uchar":  case "uint8":   return dv.getUint8(off);
        case "char":   case "int8":    return dv.getInt8(off);
        case "ushort": case "uint16":  return dv.getUint16(off, true);
        case "short":  case "int16":   return dv.getInt16(off, true);
        case "uint":   case "uint32":  return dv.getUint32(off, true);
        case "int":    case "int32":   return dv.getInt32(off, true);
    }
}

export function parsePly(arrayBuffer) {
    // Decode the header bytes one at a time until end_header — header
    // size in bytes is variable so we can't just slice the first 4KB.
    const bytes = new Uint8Array(arrayBuffer);
    const td = new TextDecoder("utf-8");
    // Find end_header by scanning for \n
    let headerEnd = -1;
    const needle = "end_header\n";
    const maxScan = Math.min(bytes.length, 65536);
    for (let i = 0; i <= maxScan - needle.length; i++) {
        let match = true;
        for (let k = 0; k < needle.length; k++) {
            if (bytes[i + k] !== needle.charCodeAt(k)) { match = false; break; }
        }
        if (match) { headerEnd = i + needle.length; break; }
    }
    if (headerEnd < 0) throw new Error("[splatParser] could not find end_header in first 64KB");
    const headerText = td.decode(bytes.slice(0, headerEnd));
    const { props, count } = _parseHeader(headerText);

    // Build property offsets within one vertex stride
    let stride = 0;
    const offsets = {};
    for (const p of props) {
        offsets[p.name] = { off: stride, type: p.type };
        stride += _propSize(p.type);
    }
    const required = ["x", "y", "z", "scale_0", "scale_1", "scale_2",
                      "rot_0", "rot_1", "rot_2", "rot_3",
                      "f_dc_0", "f_dc_1", "f_dc_2", "opacity"];
    for (const r of required) {
        if (!(r in offsets)) throw new Error("[splatParser] missing required property: " + r);
    }

    const positions = new Float32Array(count * 3);
    const scales    = new Float32Array(count * 3);
    const quats     = new Float32Array(count * 4);
    const colors    = new Float32Array(count * 3);
    const opacities = new Float32Array(count);
    const dv = new DataView(arrayBuffer, headerEnd);

    const SH_C0 = 0.28209479177387814;  // base SH coefficient (Y_00)
    const bMin = [Infinity, Infinity, Infinity];
    const bMax = [-Infinity, -Infinity, -Infinity];

    for (let i = 0; i < count; i++) {
        const base = i * stride;
        const px = _readProp(dv, base + offsets.x.off, offsets.x.type);
        const py = _readProp(dv, base + offsets.y.off, offsets.y.type);
        const pz = _readProp(dv, base + offsets.z.off, offsets.z.type);
        positions[i * 3 + 0] = px;
        positions[i * 3 + 1] = py;
        positions[i * 3 + 2] = pz;
        if (px < bMin[0]) bMin[0] = px;
        if (py < bMin[1]) bMin[1] = py;
        if (pz < bMin[2]) bMin[2] = pz;
        if (px > bMax[0]) bMax[0] = px;
        if (py > bMax[1]) bMax[1] = py;
        if (pz > bMax[2]) bMax[2] = pz;

        scales[i * 3 + 0] = _readProp(dv, base + offsets.scale_0.off, offsets.scale_0.type);
        scales[i * 3 + 1] = _readProp(dv, base + offsets.scale_1.off, offsets.scale_1.type);
        scales[i * 3 + 2] = _readProp(dv, base + offsets.scale_2.off, offsets.scale_2.type);

        quats[i * 4 + 0] = _readProp(dv, base + offsets.rot_0.off, offsets.rot_0.type);
        quats[i * 4 + 1] = _readProp(dv, base + offsets.rot_1.off, offsets.rot_1.type);
        quats[i * 4 + 2] = _readProp(dv, base + offsets.rot_2.off, offsets.rot_2.type);
        quats[i * 4 + 3] = _readProp(dv, base + offsets.rot_3.off, offsets.rot_3.type);

        // Base diffuse from SH band 0. f_dc_* are stored as raw SH coefficients;
        // to get RGB in [0,1], multiply by SH_C0 and add 0.5 (clamp).
        const r = _readProp(dv, base + offsets.f_dc_0.off, offsets.f_dc_0.type);
        const g = _readProp(dv, base + offsets.f_dc_1.off, offsets.f_dc_1.type);
        const b = _readProp(dv, base + offsets.f_dc_2.off, offsets.f_dc_2.type);
        colors[i * 3 + 0] = Math.max(0, Math.min(1, r * SH_C0 + 0.5));
        colors[i * 3 + 1] = Math.max(0, Math.min(1, g * SH_C0 + 0.5));
        colors[i * 3 + 2] = Math.max(0, Math.min(1, b * SH_C0 + 0.5));

        opacities[i] = _readProp(dv, base + offsets.opacity.off, offsets.opacity.type);
    }

    const center = [(bMin[0] + bMax[0]) / 2, (bMin[1] + bMax[1]) / 2, (bMin[2] + bMax[2]) / 2];
    const size   = [bMax[0] - bMin[0], bMax[1] - bMin[1], bMax[2] - bMin[2]];
    return {
        count, positions, scales, quats, colors, opacities,
        bbox: { min: bMin, max: bMax, center, size },
    };
}

/**
 * Parse the simpler .splat format (also produced by some converters).
 * Layout: 32 bytes per splat: xyz (float32 ×3) + scale xyz (float32 ×3) +
 * rgba (uint8 ×4) + quat (uint8 ×4, dequantize via /128 - 1).
 */
export function parseSplat(arrayBuffer) {
    const STRIDE = 32;
    const count = (arrayBuffer.byteLength / STRIDE) | 0;
    const dv = new DataView(arrayBuffer);
    const positions = new Float32Array(count * 3);
    const scales    = new Float32Array(count * 3);
    const quats     = new Float32Array(count * 4);
    const colors    = new Float32Array(count * 3);
    const opacities = new Float32Array(count);
    const bMin = [Infinity, Infinity, Infinity];
    const bMax = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) {
        const base = i * STRIDE;
        const px = dv.getFloat32(base + 0,  true);
        const py = dv.getFloat32(base + 4,  true);
        const pz = dv.getFloat32(base + 8,  true);
        positions[i * 3 + 0] = px;
        positions[i * 3 + 1] = py;
        positions[i * 3 + 2] = pz;
        if (px < bMin[0]) bMin[0] = px; if (py < bMin[1]) bMin[1] = py; if (pz < bMin[2]) bMin[2] = pz;
        if (px > bMax[0]) bMax[0] = px; if (py > bMax[1]) bMax[1] = py; if (pz > bMax[2]) bMax[2] = pz;
        // .splat stores linear scale, not log scale, so log it for renderer parity
        scales[i * 3 + 0] = Math.log(Math.max(1e-8, dv.getFloat32(base + 12, true)));
        scales[i * 3 + 1] = Math.log(Math.max(1e-8, dv.getFloat32(base + 16, true)));
        scales[i * 3 + 2] = Math.log(Math.max(1e-8, dv.getFloat32(base + 20, true)));
        colors[i * 3 + 0] = dv.getUint8(base + 24) / 255;
        colors[i * 3 + 1] = dv.getUint8(base + 25) / 255;
        colors[i * 3 + 2] = dv.getUint8(base + 26) / 255;
        // .splat opacity is post-sigmoid in [0,1]; renderer expects pre-sigmoid
        const aLinear = dv.getUint8(base + 27) / 255;
        opacities[i] = Math.log(Math.max(1e-6, aLinear) / Math.max(1e-6, 1 - aLinear));
        // .splat quat is uint8 quantized as (q + 1) * 128
        quats[i * 4 + 0] = dv.getUint8(base + 28) / 128 - 1;
        quats[i * 4 + 1] = dv.getUint8(base + 29) / 128 - 1;
        quats[i * 4 + 2] = dv.getUint8(base + 30) / 128 - 1;
        quats[i * 4 + 3] = dv.getUint8(base + 31) / 128 - 1;
    }
    const center = [(bMin[0] + bMax[0]) / 2, (bMin[1] + bMax[1]) / 2, (bMin[2] + bMax[2]) / 2];
    const size   = [bMax[0] - bMin[0], bMax[1] - bMin[1], bMax[2] - bMin[2]];
    return {
        count, positions, scales, quats, colors, opacities,
        bbox: { min: bMin, max: bMax, center, size },
    };
}

/** Pick parser based on file extension or magic-byte sniff. */
export function parseSplatFile(arrayBuffer, fileName = "") {
    const ext = (fileName.split(".").pop() || "").toLowerCase();
    if (ext === "ply")   return parsePly(arrayBuffer);
    if (ext === "splat") return parseSplat(arrayBuffer);
    // Fallback: sniff the magic bytes. PLY files always begin with
    // "ply\n" (3-char tag + newline = 4 bytes).
    const head = new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(0, 4)));
    if (head.startsWith("ply")) return parsePly(arrayBuffer);
    return parseSplat(arrayBuffer);
}
