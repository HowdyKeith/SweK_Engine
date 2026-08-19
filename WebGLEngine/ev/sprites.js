// WebGLEngine/ev/sprites.js — clean-room decoder for EV Nova's sprite resources.
// Ships NO game content: turns a USER-SUPPLIED rlëD/shän resource (from their own
// data files) into RGBA pixels. Stage 1 of sprite support.
//
//   readShan(rf, id)            -> { baseImageID, baseSetCount, baseW, baseH, ... }
//   decodeRLED(bytes)           -> { width, height, frames, rgba:Uint8ClampedArray[] }
//   shipSprite(rf, shipId)      -> convenience: shan -> rlëD -> first frame RGBA
//
// rlëD format (per the EV Nova Bible + QuickTime-RLE lineage): a small header
// with total width/height/depth and frame count, then a per-scanline opcode
// stream. Opcodes (16-bit big-endian count + tag) drive the decoder:
//   0x00 <n>   end of this line / advance (see below)
//   0x01 <n>   copy the next n*? pixels straight (direct color)
//   0x02 <n>   skip n pixels (transparent)
//   0x03 <n>   run: repeat the next pixel n times
// Because the exact tag numbers vary by source, decodeRLED accepts an opcodeMap
// override and also exposes a raw hex/inspect mode so a real file can confirm or
// correct the mapping (Stage 1 is deliberately self-diagnosing).

function _u32(dv, o) { return dv.getUint32(o, false); }
function _u16(dv, o) { return dv.getUint16(o, false); }
function _i16(dv, o) { return dv.getInt16(o, false); }

// --- shän (ship animation) reader. Field order per the Nova Bible. All big-endian.
function readShan(rf, id) {
    const b = rf.get("shän", id) || rf.get("shan", id);
    if (!b) return null;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    // Bible field order (each 2 bytes unless noted):
    // BaseImageID, BaseMaskID, BaseSetCount, BaseXSize, BaseYSize, BaseTransp, ...
    const g = (o) => (o + 2 <= b.byteLength ? _i16(dv, o) : 0);
    return {
        baseImageID: g(0),
        baseMaskID: g(2),
        baseSetCount: g(4),      // number of sprite sets (frames), often 36 or 64
        baseW: g(6),
        baseH: g(8),
        baseTransp: g(10),
        _rawLen: b.byteLength,
    };
}

// --- rlëD decoder. Faithful clean-room port of the authoritative decoder in
//     TheDiamondProject/Graphite (libGraphite/quickdraw/rle.cpp, MIT). That code
//     is what Kestrel/Cosmic Frontier use; porting it settles every detail I'd
//     been reverse-engineering. Real structure:
//       Header: frameW(int16) frameH(int16) bpp(int16=16) paletteId(int16)
//               frameCount(int16) then 6 reserved bytes  = 16 bytes total.
//       Frames laid out in a grid 6 columns wide (rle_grid_width=6).
//       Opcode stream: 4-byte big-endian; top byte = opcode, low 3 bytes = count:
//         0x00 eof            end of the current FRAME (not line); next frame
//         0x01 line_start     begin a new scanline (NO count); sets row_start
//         0x02 pixel_data     count = BYTES of 16-bit pixels; then pad to 4
//         0x03 transparent_run  advance count>>1 transparent pixels
//         0x04 pixel_run      one uint32 follows; write its two 16-bit halves
//                             repeatedly for count bytes
//       Per-loop 4-byte alignment is RELATIVE to row_start (this was the crux).
//       Color is RGB555: r=(px&0x7c00)>>7, g=(px&0x03e0)>>2, b=(px&0x1f)<<3,
//       each |= >>5 to fill the low bits.
const RLE_GRID_W = 6;
function decodeRLED(bytes, opts = {}) {
    if (!bytes || bytes.byteLength < 16) return { error: "rlëD too short", inspect: hexdump(bytes, 0, 16) };
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const frameW = dv.getInt16(0, false);
    const frameH = dv.getInt16(2, false);
    const bpp = dv.getInt16(4, false);
    const frameCount = dv.getInt16(8, false);
    if (frameW < 1 || frameW > 4096 || frameH < 1 || frameH > 4096 || frameCount < 1 || frameCount > 100000) {
        return { error: `rlëD header looks wrong (w=${frameW} h=${frameH} bpp=${bpp} frames=${frameCount})`, inspect: hexdump(bytes, 0, 32) };
    }
    if (bpp !== 16) return { error: `rlëD bpp ${bpp} unsupported (only 16)`, inspect: hexdump(bytes, 0, 32) };

    const gridW = Math.min(RLE_GRID_W, frameCount);
    const gridH = Math.ceil(frameCount / RLE_GRID_W);
    const sheetW = gridW * frameW;
    const sheetH = gridH * frameH;
    const sheet = new Uint8ClampedArray(sheetW * sheetH * 4);   // transparent

    const surfaceOffset = (frame, line) => {
        const fx = frame % RLE_GRID_W, fy = Math.floor(frame / RLE_GRID_W);
        const px = fx * frameW, py = fy * frameH + line;
        return py * sheetW + px;
    };
    const putPx = (off, px) => {
        // px 0 stays transparent; else RGB555 -> RGBA (Graphite color(uint16))
        if (px === 0) return;
        let r = (px & 0x7c00) >> 7, g = (px & 0x03e0) >> 2, b = (px & 0x001f) << 3;
        r |= r >> 5; g |= g >> 5; b |= b >> 5;
        const i = off * 4;
        if (i + 3 < sheet.length) { sheet[i] = r; sheet[i + 1] = g; sheet[i + 2] = b; sheet[i + 3] = 255; }
    };

    try {
        let p = 16;                    // after header
        let rowStart = 0;              // byte position where current line began
        let curLine = -1, curFrame = 0, curOff = 0;
        let guard = bytes.byteLength * 2;
        while (p + 4 <= bytes.byteLength && guard-- > 0) {
            // per-loop alignment: pad to 4 bytes RELATIVE to row_start
            if (rowStart !== 0 && ((p - rowStart) & 0x03)) {
                p += 4 - ((p - rowStart) & 0x03);
                if (p + 4 > bytes.byteLength) break;
            }
            const word = dv.getUint32(p, false); p += 4;
            const op = word >>> 24;
            const count = word & 0x00FFFFFF;
            if (op === 0x00) {                       // eof: end of this FRAME
                if (++curFrame >= frameCount) break;
                curLine = -1;
            } else if (op === 0x01) {                 // line_start
                curOff = surfaceOffset(curFrame, ++curLine);
                rowStart = p;
            } else if (op === 0x02) {                 // pixel_data: count bytes
                for (let i = 0; i < count && p + 2 <= bytes.byteLength; i += 2) {
                    putPx(curOff++, dv.getUint16(p, false)); p += 2;
                }
                if (count & 0x03) p += 4 - (count & 0x03);   // pad to 4
            } else if (op === 0x03) {                 // transparent_run
                curOff += count >> 1;
            } else if (op === 0x04) {                 // pixel_run: one uint32, repeated
                const run = dv.getUint32(p, false); p += 4;
                for (let i = 0; i < count; i += 4) {
                    putPx(curOff++, (run >>> 16) & 0xFFFF);
                    if (i + 2 < count) putPx(curOff++, run & 0xFFFF);
                }
            } else {
                return { error: `unknown rlëD opcode 0x${op.toString(16)} at byte ${p - 4}`,
                    frameW, frameH, frameCount, inspect: hexdump(bytes, Math.max(0, p - 12), 48), partial: sheet };
            }
        }
        return { ok: true, width: frameW, height: frameH, depth: bpp, frameCount,
            sheetW, sheetH, gridW, gridH, frames: [sheet], isSheet: true };
    } catch (e) {
        return { error: "rlëD decode threw: " + e.message, inspect: hexdump(bytes, 0, 48) };
    }
}

function hexdump(bytes, start, len) {
    if (!bytes) return "(no bytes)";
    const end = Math.min(bytes.byteLength, start + len);
    let out = "";
    for (let i = start; i < end; i += 16) {
        let hex = "", asc = "";
        for (let j = i; j < Math.min(i + 16, end); j++) {
            hex += bytes[j].toString(16).padStart(2, "0") + " ";
            asc += bytes[j] >= 32 && bytes[j] < 127 ? String.fromCharCode(bytes[j]) : ".";
        }
        out += `${i.toString(16).padStart(6, "0")}  ${hex.padEnd(48)} ${asc}\n`;
    }
    return out;
}

// convenience: ship id -> shan -> base rlëD -> decoded sheet
function shipSprite(rf, shipId) {
    const shan = readShan(rf, shipId);
    if (!shan) return { error: "no shän for ship " + shipId };
    const rled = rf.get("rlëD", shan.baseImageID) || rf.get("rleD", shan.baseImageID);
    if (!rled) return { error: `no rlëD ${shan.baseImageID} (from shän ${shipId})`, shan };
    const dec = decodeRLED(rled);
    return { shan, ...dec };
}

// --- Stage 2: pull a single frame out of the decoded sheet. Frames are laid out
//     left-to-right, top-to-bottom in a RLE_GRID_W-wide grid.
//     Returns { width, height, rgba:Uint8ClampedArray } or null.
function extractFrame(dec, frameIndex) {
    if (!dec || !dec.ok || !dec.frames || !dec.frames[0]) return null;
    const { sheetW, width: fw, height: fh, frameCount } = dec;
    const idx = ((frameIndex % frameCount) + frameCount) % frameCount;   // wrap
    const gx = (idx % RLE_GRID_W) * fw;
    const gy = Math.floor(idx / RLE_GRID_W) * fh;
    const sheet = dec.frames[0];
    const out = new Uint8ClampedArray(fw * fh * 4);
    for (let y = 0; y < fh; y++) {
        const srcRow = ((gy + y) * sheetW + gx) * 4;
        const dstRow = (y * fw) * 4;
        out.set(sheet.subarray(srcRow, srcRow + fw * 4), dstRow);
    }
    return { width: fw, height: fh, rgba: out, frameIndex: idx };
}

// --- Map a heading (degrees, 0 = up/north, clockwise) to a rotation-frame index.
//     A shän's rotation lives in ONE sprite set: framesPerRotation = frameCount /
//     baseSetCount (e.g. 108/3 = 36 -> 10 deg per frame). Frame 0 points "up";
//     increasing frame index rotates clockwise (matching EV + our heading sense).
function headingToFrame(dec, shan, headingDeg) {
    const setCount = (shan && shan.baseSetCount) > 0 ? shan.baseSetCount : 1;
    const perRot = Math.max(1, Math.round(dec.frameCount / setCount));
    const h = ((headingDeg % 360) + 360) % 360;
    return Math.round(h / 360 * perRot) % perRot;
}

// convenience: ship id + heading -> the exact frame RGBA to draw
function shipFrame(rf, shipId, headingDeg) {
    const s = shipSprite(rf, shipId);
    if (!s.ok) return s;
    const idx = headingToFrame(s, s.shan, headingDeg || 0);
    const fr = extractFrame(s, idx);
    return { ok: true, ...fr, frameCount: s.frameCount, perRotation: Math.round(s.frameCount / (s.shan.baseSetCount || 1)), shan: s.shan };
}

export { readShan, decodeRLED, shipSprite, extractFrame, headingToFrame, shipFrame, hexdump };
