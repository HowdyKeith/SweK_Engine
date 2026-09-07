// WebGLEngine/tools/ship/pngWrite.mjs -- v4528
//
// A PNG ENCODER FOR NODE, the twin of tools/ship/pngCoverage.mjs's decodePNG: 8-bit RGB or RGBA, one IDAT, zlib from
// node. The tree could read a PNG since v3xxx and never write one; a keyframe read back from the device had nowhere to
// go but a data URL in a browser. This is the node half, so a gate can write the pictures it read back and decode them
// again to prove the bytes round-trip.
"use strict";
import zlib from "node:zlib";

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0); out.write(type, 4, "ascii"); Buffer.from(data).copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
}

/** Encode `pixels` (width x height x channels, 8-bit, channels 3 or 4) as a PNG Buffer. Filter 0 on every row. */
export function encodePNG(width, height, pixels, { channels = 4, level = 6 } = {}) {
    if (channels !== 3 && channels !== 4) throw new Error("encodePNG: channels must be 3 or 4");
    if (pixels.length < width * height * channels) throw new Error(`encodePNG: ${pixels.length} bytes for ${width}x${height}x${channels}`);
    const row = width * channels, raw = Buffer.alloc((row + 1) * height);
    for (let y = 0; y < height; y++) { raw[y * (row + 1)] = 0; Buffer.from(pixels.buffer, pixels.byteOffset + y * row, row).copy(raw, y * (row + 1) + 1); }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = channels === 4 ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level })), chunk("IEND", Buffer.alloc(0))]);
}
