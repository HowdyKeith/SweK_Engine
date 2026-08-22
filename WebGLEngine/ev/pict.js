// WebGLEngine/ev/pict.js — QuickDraw PICT decoder (v2), a faithful clean-room port
// of TheDiamondProject/Graphite libGraphite/quickdraw/pict.cpp (MIT). EV Nova stores
// character portraits (headshots), landing/comms backdrops, and interface art as
// PICT resources. This decodes the common EV cases: PackBitsRect (0x0098) and
// DirectBitsRect (0x009a), which carry PackBits-compressed 8-bit indexed or
// 16/32-bit direct pixels. Returns { ok, width, height, rgba:Uint8ClampedArray }.
//
// Usage:
//   import { decodePICT } from "./pict.js";
//   const img = decodePICT(bytes);   // bytes = Uint8Array of the PICT resource
//   if (img.ok) drawToCanvas(img.width, img.height, img.rgba);

const OP = {
    nop: 0x0000, clip_region: 0x0001, pen_size: 0x0007, pen_mode: 0x0008,
    pen_pattern: 0x0009, fill_pattern: 0x000a, origin: 0x000c,
    rgb_fg_color: 0x001a, rgb_bg_color: 0x001b, hilite_mode: 0x001c,
    hilite_color: 0x001d, def_hilite: 0x001e, op_color: 0x001f,
    line: 0x0020, line_from: 0x0021, short_line: 0x0022, short_line_from: 0x0023,
    frame_rect: 0x0030, paint_rect: 0x0031, erase_rect: 0x0032, invert_rect: 0x0033,
    fill_rect: 0x0034, frame_same_rect: 0x0038, paint_same_rect: 0x0039,
    erase_same_rect: 0x003a, invert_same_rect: 0x003b, fill_same_rect: 0x003c,
    bits_rect: 0x0090, bits_region: 0x0091, pack_bits_rect: 0x0098,
    pack_bits_region: 0x0099, direct_bits_rect: 0x009a, direct_bits_region: 0x009b,
    frame_region: 0x0080, paint_region: 0x0081, erase_region: 0x0082,
    invert_region: 0x0083, fill_region: 0x0084, short_comment: 0x00a0,
    long_comment: 0x00a1, eof: 0x00ff, ext_header: 0x0c00,
    compressed_quicktime: 0x8200, uncompressed_quicktime: 0x8201,
};
const PACK = { none: 0, argb: 1, rgb: 2, packbits_word: 3, packbits_component: 4 };
const PIXMAP_LEN = 50;
const PICT_V1_MAGIC = 0x1101;

// --- big-endian reader ---
function Reader(u8) {
    let p = 0;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    return {
        get pos() { return p; }, set pos(v) { p = v; },
        get len() { return u8.byteLength; },
        u8() { return u8[p++]; },
        i8() { const v = dv.getInt8(p); p += 1; return v; },
        u16(peek) { const v = dv.getUint16(p, false); if (!peek) p += 2; return v; },
        i16() { const v = dv.getInt16(p, false); p += 2; return v; },
        u32() { const v = dv.getUint32(p, false); p += 4; return v; },
        i32() { const v = dv.getInt32(p, false); p += 4; return v; },
        bytes(n) { const s = u8.subarray(p, p + n); p += n; return s; },
        skip(n) { p += n; },
        align() { if (p & 1) p += 1; },   // PICT opcodes are word-aligned in v2
    };
}

// QuickDraw rect = top, left, bottom, right (int16 each)
function readRect(r) {
    const top = r.i16(), left = r.i16(), bottom = r.i16(), right = r.i16();
    return { top, left, bottom, right, get w() { return right - left; }, get h() { return bottom - top; } };
}

// RGB555 -> RGB (matches Graphite color(uint16))
function rgb555(px) {
    let red = (px & 0x7c00) >> 7, green = (px & 0x03e0) >> 2, blue = (px & 0x001f) << 3;
    red |= red >> 5; green |= green >> 5; blue |= blue >> 5;
    return [red, green, blue];
}

// PackBits decode (value_size 1 or 2). Faithful to Graphite's packbits::decode.
function packbitsDecode(out, pack, valueSize) {
    let pos = 0;
    while (pos < pack.length) {
        const count = pack[pos++];
        if (count < 128) {                       // literal run of (count+1) values
            const run = (1 + count) * valueSize;
            for (let i = 0; i < run && pos < pack.length; i++) out.push(pack[pos++]);
        } else if (count === 128) {              // no-op
        } else {                                 // repeat run of (257-count) values
            const run = 256 - count + 1;
            if (valueSize === 1) {
                const v = pack[pos++];
                for (let i = 0; i < run; i++) out.push(v);
            } else {
                const chunk = pack.slice(pos, pos + valueSize); pos += valueSize;
                for (let i = 0; i < run; i++) for (let j = 0; j < valueSize; j++) out.push(chunk[j]);
            }
        }
    }
    return out;
}

// Read a QuickDraw region: first short is size; skip the rest of it.
function readRegion(r) {
    const size = r.u16();
    if (size >= 2) r.skip(size - 2);
}

// Parse a PixMap / BitMap header of PIXMAP_LEN bytes. Returns the fields we need.
function readPixmap(r, hasBaseAddr) {
    // Graphite reads pixmap::length bytes; when the base address is omitted
    // (indirect bits), it steps back 4 — the caller handles that by not consuming
    // the base addr. We read the full 50-byte struct from the current position.
    const start = r.pos;
    const baseAddress = r.u32();
    const rowBytes = r.i16() & 0x7FFF;
    const bounds = readRect(r);
    const pmVersion = r.i16();
    const packType = r.i16();
    const packSize = r.i32();
    const hRes = r.i32(); const vRes = r.i32();
    const pixelType = r.i16();
    const pixelSize = r.i16();
    const cmpCount = r.i16();
    const cmpSize = r.i16();
    const planeBytes = r.u32();
    const pmTable = r.u32();
    const pmExt = r.u32();
    r.pos = start + PIXMAP_LEN;   // normalize to fixed struct length
    return { rowBytes, bounds, packType, pixelSize, cmpCount, cmpSize };
}

// Read a color table (clut). Layout: seed(4) flags(2) count(2) then (count+1) entries
// of [index(2) r(2) g(2) b(2)]. Returns an array of [r,g,b] indexed by value.
function readCLUT(r) {
    r.u32(); r.u16();                 // seed, flags
    const count = r.i16();            // count-1
    const n = count + 1;
    const table = new Array(256).fill(null).map(() => [0, 0, 0]);
    for (let i = 0; i < n; i++) {
        let idx = r.u16();
        const rr = r.u16(), gg = r.u16(), bb = r.u16();
        // 16-bit components -> 8-bit (high byte)
        if (idx < 0 || idx > 255) idx = i;   // some cluts store 0-based order
        table[idx] = [rr >> 8, gg >> 8, bb >> 8];
    }
    return table;
}

function decodePICT(bytes) {
    if (!bytes || bytes.byteLength < 12) return { error: "PICT too short" };
    const r = Reader(bytes);
    try {
        // Header: size(2), frame rect(8). (EV PICTs are v2.)
        r.u16();                       // picture size (unreliable; ignore)
        const frame = readRect(r);
        const W = frame.w, H = frame.h;
        if (W < 1 || H < 1 || W > 8192 || H > 8192) return { error: `PICT frame implausible ${W}×${H}` };

        const surface = new Uint8ClampedArray(W * H * 4);   // transparent

        // v1 vs v2: peek magic. v2 starts with 0x0011 0x02FF (version op + subcode).
        const magic = r.u16(true);
        if (magic === PICT_V1_MAGIC) {
            // rare for EV; not handling v1 fully
            return { error: "PICT v1 not supported (EV art is v2)", width: W, height: H };
        }
        // consume version opcode 0x0011, then 0x02FF, then ext header 0x0C00 (+ 24 bytes)
        // Graphite: read version op; if next != ext_header, rewind 2. Handle both.
        const verOp = r.u16();         // expect 0x0011
        r.u16();                       // 0x02FF
        const maybeExt = r.u16();
        if (maybeExt === OP.ext_header) { r.skip(24); }
        else { r.pos -= 2; }

        let guard = bytes.byteLength;
        while (r.pos + 2 <= bytes.byteLength && guard-- > 0) {
            r.align();                 // v2 opcodes are word-aligned
            if (r.pos + 2 > bytes.byteLength) break;
            const op = r.u16();
            if (op === OP.eof) break;
            switch (op) {
                case OP.clip_region: readRegion(r); break;
                case OP.origin: r.skip(4); break;
                case OP.nop: case OP.hilite_mode: case OP.def_hilite: break;
                case OP.pack_bits_rect: readIndirectBits(r, surface, frame, W, H, true, false); break;
                case OP.pack_bits_region: readIndirectBits(r, surface, frame, W, H, true, true); break;
                case OP.bits_rect: readIndirectBits(r, surface, frame, W, H, false, false); break;
                case OP.bits_region: readIndirectBits(r, surface, frame, W, H, false, true); break;
                case OP.direct_bits_rect: readDirectBits(r, surface, frame, W, H, false); break;
                case OP.direct_bits_region: readDirectBits(r, surface, frame, W, H, true); break;
                case OP.long_comment: { r.skip(2); const len = r.u16(); r.skip(len); break; }
                case OP.short_comment: r.skip(2); break;
                case OP.pen_mode: case OP.short_line_from: r.skip(2); break;
                case OP.pen_size: case OP.line_from: r.skip(4); break;
                case OP.short_line: case OP.rgb_fg_color: case OP.rgb_bg_color:
                case OP.hilite_color: case OP.op_color: r.skip(6); break;
                case OP.pen_pattern: case OP.fill_pattern: case OP.line:
                case OP.frame_rect: case OP.paint_rect: case OP.erase_rect:
                case OP.invert_rect: case OP.fill_rect: r.skip(8); break;
                case OP.frame_same_rect: case OP.paint_same_rect: case OP.erase_same_rect:
                case OP.invert_same_rect: case OP.fill_same_rect: break;
                case OP.frame_region: case OP.paint_region: case OP.erase_region:
                case OP.invert_region: case OP.fill_region: readRegion(r); break;
                case OP.compressed_quicktime: case OP.uncompressed_quicktime:
                    return { error: "PICT contains QuickTime-compressed image (unsupported)", width: W, height: H };
                default:
                    // Unknown opcode: we can't know its length, so stop cleanly with
                    // whatever we've drawn so far.
                    return finalize(surface, W, H, `stopped at unknown opcode 0x${op.toString(16)} @${r.pos - 2}`);
            }
        }
        return finalize(surface, W, H);
    } catch (e) {
        return { error: "PICT decode threw: " + e.message };
    }
}

function finalize(surface, W, H, note) {
    let lit = 0;
    for (let i = 3; i < surface.length; i += 4) if (surface[i] > 0) lit++;
    return { ok: true, width: W, height: H, rgba: surface, litPixels: lit, note };
}

// 0x0098 pack_bits_rect / 0x0090 bits_rect (indirect: indexed via color table)
function readIndirectBits(r, surface, frame, W, H, packed, region) {
    const isPixmap = (r.u16(true) & 0x8000) !== 0;
    let pm, clut;
    if (isPixmap) {
        pm = readPixmap(r);
        clut = readCLUT(r);
    } else {
        // old bitmap: rowBytes(2), bounds(8); monochrome
        const rowBytes = r.u16();
        const bounds = readRect(r);
        pm = { rowBytes, bounds, packType: PACK.none, pixelSize: 1, cmpCount: 1, cmpSize: 1 };
        clut = [[255, 255, 255], [0, 0, 0]];
    }
    const srcRect = readRect(r);
    const dstRect = readRect(r);
    r.u16();                              // transfer mode
    if (region) readRegion(r);

    const rowBytes = pm.rowBytes, height = pm.bounds.h, width = pm.bounds.w;
    const copyX = dstRect.left - frame.left, copyY = dstRect.top - frame.top;
    const copyW = Math.min(dstRect.w, W - copyX), copyH = Math.min(dstRect.h, H - copyY);

    for (let y = 0; y < height; y++) {
        let raw;
        if (packed && rowBytes >= 8) {
            const n = rowBytes > 250 ? r.u16() : r.u8();
            raw = packbitsDecode([], r.bytes(n), 1);
        } else {
            raw = Array.from(r.bytes(rowBytes));
        }
        if (y >= copyH) continue;
        for (let x = 0; x < copyW; x++) {
            let rgb;
            if (pm.pixelSize === 8) rgb = clut[raw[x]] || [0, 0, 0];
            else if (pm.pixelSize === 4) { const b = raw[x >> 1]; const idx = (x & 1) ? (b & 0x0f) : (b >> 4); rgb = clut[idx] || [0, 0, 0]; }
            else if (pm.pixelSize === 1) { const b = raw[x >> 3]; const bit = (b >> (7 - (x & 7))) & 1; rgb = clut[bit] || [0, 0, 0]; }
            else rgb = [raw[x] || 0, raw[x] || 0, raw[x] || 0];
            putPix(surface, W, H, x + copyX, y + copyY, rgb);
        }
    }
}

// 0x009a direct_bits_rect (16/32-bit direct color)
function readDirectBits(r, surface, frame, W, H, region) {
    const pm = readPixmap(r);
    let rowBytes = pm.rowBytes, height = pm.bounds.h, width = pm.bounds.w;
    let packType = pm.packType;

    const srcRect = readRect(r);
    const dstRect = readRect(r);
    r.u16();                              // transfer mode
    if (region) readRegion(r);

    const copyX = dstRect.left - frame.left, copyY = dstRect.top - frame.top;
    const copyW = Math.min(dstRect.w, W - copyX), copyH = Math.min(dstRect.h, H - copyY);

    let packed = rowBytes >= 8 && packType >= PACK.packbits_word;
    if (rowBytes < 8 && packType !== PACK.packbits_word) packType = PACK.argb;
    else if (packType === PACK.none || packType === PACK.rgb) rowBytes = width * 3;

    for (let y = 0; y < height; y++) {
        let raw;
        if (packed) {
            const n = rowBytes > 250 ? r.u16() : r.u8();
            raw = packbitsDecode([], r.bytes(n), packType === PACK.packbits_word ? 2 : 1);
        } else {
            raw = Array.from(r.bytes(rowBytes));
        }
        if (y >= copyH) continue;
        for (let x = 0; x < copyW; x++) {
            let rgb;
            if (packType === PACK.none || packType === PACK.rgb) rgb = [raw[3 * x], raw[3 * x + 1], raw[3 * x + 2]];
            else if (packType === PACK.argb) rgb = [raw[4 * x + 1], raw[4 * x + 2], raw[4 * x + 3]];
            else if (packType === PACK.packbits_word) rgb = rgb555((raw[2 * x] << 8) | raw[2 * x + 1]);
            else { // packbits_component: planar R then G then B across the row
                const comp = pm.cmpCount || 3;
                rgb = [raw[x], raw[width + x], raw[2 * width + x]];
            }
            putPix(surface, W, H, x + copyX, y + copyY, rgb);
        }
    }
}

function putPix(surface, W, H, x, y, rgb) {
    if (x < 0 || y < 0 || x >= W || y >= H || !rgb) return;
    const i = (y * W + x) * 4;
    surface[i] = rgb[0] || 0; surface[i + 1] = rgb[1] || 0; surface[i + 2] = rgb[2] || 0; surface[i + 3] = 255;
}

export { decodePICT };
