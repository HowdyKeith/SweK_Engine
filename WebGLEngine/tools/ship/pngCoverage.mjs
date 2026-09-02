// WebGLEngine/tools/ship/pngCoverage.mjs -- v4304
//
// A MINIMAL PNG DECODER AND A SUBJECT-COVERAGE METRIC, shared. Both lived inline in avatarFraming-selfcheck.mjs
// since v4033; dockFraming.mjs (#86) needed the same two functions and a second copy is how three simplex
// noises happened (#51). The decoder reads exactly what Playwright's page.screenshot() writes -- 8-bit,
// non-interlaced RGB or RGBA -- and says so rather than claiming to read any PNG. subjectFraction() samples
// the four corners for the page's own background and counts pixels whose luminance departs from it by more
// than 12: a coverage FRACTION, which is the claim framing bugs break, not a pixel-exact baseline.
"use strict";
import zlib from "node:zlib";

// ---- minimal PNG decoder: 8-bit, non-interlaced RGB/RGBA only, exactly what page.screenshot() writes -------
export function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
export function decodePNG(buf) {
    if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
    let off = 8, width = 0, height = 0, colorType = 0;
    const idat = [];
    while (off < buf.length) {
        const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8);
        const data = buf.subarray(off + 8, off + 8 + len);
        if (type === "IHDR") {
            width = data.readUInt32BE(0); height = data.readUInt32BE(4);
            if (data.readUInt8(8) !== 8) throw new Error("only 8-bit PNG supported");
            colorType = data.readUInt8(9);
            if (data.readUInt8(12) !== 0) throw new Error("interlaced PNG not supported");
        } else if (type === "IDAT") idat.push(data);
        else if (type === "IEND") break;
        off += 8 + len + 4;
    }
    const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : (() => { throw new Error("unsupported color type " + colorType); })();
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * channels, out = Buffer.alloc(height * stride);
    let rp = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[rp++], rowStart = y * stride, prevRowStart = (y - 1) * stride;
        for (let x = 0; x < stride; x++) {
            const rb = raw[rp++];
            const a = x >= channels ? out[rowStart + x - channels] : 0;
            const b = y > 0 ? out[prevRowStart + x] : 0;
            const c = (y > 0 && x >= channels) ? out[prevRowStart + x - channels] : 0;
            let v;
            if (filter === 0) v = rb; else if (filter === 1) v = (rb + a) & 0xff; else if (filter === 2) v = (rb + b) & 0xff;
            else if (filter === 3) v = (rb + ((a + b) >> 1)) & 0xff; else if (filter === 4) v = (rb + paeth(a, b, c)) & 0xff;
            else throw new Error("bad PNG filter type " + filter);
            out[rowStart + x] = v;
        }
    }
    return { width, height, channels, data: out };
}

// adaptive background subtraction: sample the four corners for the page's own background colour (three
// different pages, three different backgrounds), then count pixels whose luminance departs from it.
export function subjectFraction(img) {
    const { width, height, channels, data } = img;
    const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
    const corners = [[0, 0], [width - 10, 0], [0, height - 10], [width - 10, height - 10]];
    let bl = 0, bn = 0;
    for (const [cx, cy] of corners) for (let y = cy; y < cy + 10; y++) for (let x = cx; x < cx + 10; x++) {
        const i = (y * width + x) * channels; bl += lum(data[i], data[i + 1], data[i + 2]); bn++;
    }
    const bg = bl / bn;
    let drawn = 0;
    for (let i = 0; i < data.length; i += channels) if (Math.abs(lum(data[i], data[i + 1], data[i + 2]) - bg) > 12) drawn++;
    return drawn / (width * height);
}


/** Mean, sample standard deviation, min and max of a list -- the noise-floor arithmetic, in one place. */
export function spread(values) {
    const n = values.length, mean = values.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1)) : 0;
    return { n, mean, sd, min: Math.min(...values), max: Math.max(...values) };
}
