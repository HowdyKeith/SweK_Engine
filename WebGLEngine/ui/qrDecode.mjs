// WebGLEngine/ui/qrDecode.mjs -- v4301
//
// A QR DECODER FROM A MODULE MATRIX, WHICH THIS TREE HAS NEVER HAD. ui/vendor/qrcode.mjs (kazuhikoarase/
// qrcode-generator, MIT) has encoded since v525 and the only thing ever decoded from its output was a phone
// scanning a URL. That makes the encoder a link and never a channel: nothing here could take a matrix back
// to bytes, so nothing could check what a frame carried, count what a version holds, or notice a dropped one.
//
// The idea of QR AS A DATA CHANNEL is ruvnet/rvQR (MIT): a screen shows frames, a camera reads them, SHA-256
// says whether the file arrived. *** NONE OF ITS CODE IS HERE. *** What is here is the half rvQR takes for
// granted -- a decoder -- written against ISO/IEC 18004's layout and the vendored encoder's own choices, so
// that the two are provably inverse over every version and level (tools/ship/qrChannel-selfcheck.mjs).
//
// *** WHAT THIS DECODES AND WHAT IT DOES NOT. *** Input is a module matrix: isDark(row, col) over n x n, the
// exact object the encoder produces. Locating a symbol in a camera image -- finder patterns, perspective,
// sampling -- is not done here and is said so wherever this file is used. A matrix in, bytes out; and where
// the Reed-Solomon code cannot vouch for the bytes, an exception rather than a shorter buffer, because a
// decoder that returns something plausible on a bad frame is the failure the channel above cannot see.
//
// ---- THE TWO TABLES BELOW ARE COPIED FROM ui/vendor/qrcode.mjs ----------------------------------------------
// RS_BLOCK_TABLE and PATTERN_POSITION_TABLE are ISO/IEC 18004 data as laid out in Kazuhiko Arase's
// qrcode-generator, from which they are reproduced unchanged (the gate parses the vendored source and
// compares). Recorded in world/copiedOutsideVendor.mjs DERIVED. The licence, in full, as MIT requires of a copy:
//
//   Copyright (c) 2009 Kazuhiko Arase
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
//   associated documentation files (the "Software"), to deal in the Software without restriction, including
//   without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
//   following conditions:
//
//   The above copyright notice and this permission notice shall be included in all copies or substantial
//   portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
//   LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
//   EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
//   IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR
//   THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
// The word "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.
"use strict";

/** Rows are versions 1..40; each version has four entries L, M, Q, H of [count, total, data, (count, total, data)...]. */
export const RS_BLOCK_TABLE = Object.freeze([
    /* v1 */ [1,26,19], [1,26,16], [1,26,13], [1,26,9],
    /* v2 */ [1,44,34], [1,44,28], [1,44,22], [1,44,16],
    /* v3 */ [1,70,55], [1,70,44], [2,35,17], [2,35,13],
    /* v4 */ [1,100,80], [2,50,32], [2,50,24], [4,25,9],
    /* v5 */ [1,134,108], [2,67,43], [2,33,15,2,34,16], [2,33,11,2,34,12],
    /* v6 */ [2,86,68], [4,43,27], [4,43,19], [4,43,15],
    /* v7 */ [2,98,78], [4,49,31], [2,32,14,4,33,15], [4,39,13,1,40,14],
    /* v8 */ [2,121,97], [2,60,38,2,61,39], [4,40,18,2,41,19], [4,40,14,2,41,15],
    /* v9 */ [2,146,116], [3,58,36,2,59,37], [4,36,16,4,37,17], [4,36,12,4,37,13],
    /* v10 */ [2,86,68,2,87,69], [4,69,43,1,70,44], [6,43,19,2,44,20], [6,43,15,2,44,16],
    /* v11 */ [4,101,81], [1,80,50,4,81,51], [4,50,22,4,51,23], [3,36,12,8,37,13],
    /* v12 */ [2,116,92,2,117,93], [6,58,36,2,59,37], [4,46,20,6,47,21], [7,42,14,4,43,15],
    /* v13 */ [4,133,107], [8,59,37,1,60,38], [8,44,20,4,45,21], [12,33,11,4,34,12],
    /* v14 */ [3,145,115,1,146,116], [4,64,40,5,65,41], [11,36,16,5,37,17], [11,36,12,5,37,13],
    /* v15 */ [5,109,87,1,110,88], [5,65,41,5,66,42], [5,54,24,7,55,25], [11,36,12,7,37,13],
    /* v16 */ [5,122,98,1,123,99], [7,73,45,3,74,46], [15,43,19,2,44,20], [3,45,15,13,46,16],
    /* v17 */ [1,135,107,5,136,108], [10,74,46,1,75,47], [1,50,22,15,51,23], [2,42,14,17,43,15],
    /* v18 */ [5,150,120,1,151,121], [9,69,43,4,70,44], [17,50,22,1,51,23], [2,42,14,19,43,15],
    /* v19 */ [3,141,113,4,142,114], [3,70,44,11,71,45], [17,47,21,4,48,22], [9,39,13,16,40,14],
    /* v20 */ [3,135,107,5,136,108], [3,67,41,13,68,42], [15,54,24,5,55,25], [15,43,15,10,44,16],
    /* v21 */ [4,144,116,4,145,117], [17,68,42], [17,50,22,6,51,23], [19,46,16,6,47,17],
    /* v22 */ [2,139,111,7,140,112], [17,74,46], [7,54,24,16,55,25], [34,37,13],
    /* v23 */ [4,151,121,5,152,122], [4,75,47,14,76,48], [11,54,24,14,55,25], [16,45,15,14,46,16],
    /* v24 */ [6,147,117,4,148,118], [6,73,45,14,74,46], [11,54,24,16,55,25], [30,46,16,2,47,17],
    /* v25 */ [8,132,106,4,133,107], [8,75,47,13,76,48], [7,54,24,22,55,25], [22,45,15,13,46,16],
    /* v26 */ [10,142,114,2,143,115], [19,74,46,4,75,47], [28,50,22,6,51,23], [33,46,16,4,47,17],
    /* v27 */ [8,152,122,4,153,123], [22,73,45,3,74,46], [8,53,23,26,54,24], [12,45,15,28,46,16],
    /* v28 */ [3,147,117,10,148,118], [3,73,45,23,74,46], [4,54,24,31,55,25], [11,45,15,31,46,16],
    /* v29 */ [7,146,116,7,147,117], [21,73,45,7,74,46], [1,53,23,37,54,24], [19,45,15,26,46,16],
    /* v30 */ [5,145,115,10,146,116], [19,75,47,10,76,48], [15,54,24,25,55,25], [23,45,15,25,46,16],
    /* v31 */ [13,145,115,3,146,116], [2,74,46,29,75,47], [42,54,24,1,55,25], [23,45,15,28,46,16],
    /* v32 */ [17,145,115], [10,74,46,23,75,47], [10,54,24,35,55,25], [19,45,15,35,46,16],
    /* v33 */ [17,145,115,1,146,116], [14,74,46,21,75,47], [29,54,24,19,55,25], [11,45,15,46,46,16],
    /* v34 */ [13,145,115,6,146,116], [14,74,46,23,75,47], [44,54,24,7,55,25], [59,46,16,1,47,17],
    /* v35 */ [12,151,121,7,152,122], [12,75,47,26,76,48], [39,54,24,14,55,25], [22,45,15,41,46,16],
    /* v36 */ [6,151,121,14,152,122], [6,75,47,34,76,48], [46,54,24,10,55,25], [2,45,15,64,46,16],
    /* v37 */ [17,152,122,4,153,123], [29,74,46,14,75,47], [49,54,24,10,55,25], [24,45,15,46,46,16],
    /* v38 */ [4,152,122,18,153,123], [13,74,46,32,75,47], [48,54,24,14,55,25], [42,45,15,32,46,16],
    /* v39 */ [20,147,117,4,148,118], [40,75,47,7,76,48], [43,54,24,22,55,25], [10,45,15,67,46,16],
    /* v40 */ [19,148,118,6,149,119], [18,75,47,31,76,48], [34,54,24,34,55,25], [20,45,15,61,46,16],
].map((r) => Object.freeze(r)));

/** Alignment-pattern centre coordinates per version (index 0 = version 1). */
export const PATTERN_POSITION_TABLE = Object.freeze([
    [], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38], [6,24,42], [6,26,46], [6,28,50], [6,30,54], [6,32,58],
    [6,34,62], [6,26,46,66], [6,26,48,70], [6,26,50,74], [6,30,54,78], [6,30,56,82], [6,30,58,86], [6,34,62,90],
    [6,28,50,72,94], [6,26,50,74,98], [6,30,54,78,102], [6,28,54,80,106], [6,32,58,84,110], [6,30,58,86,114],
    [6,34,62,90,118], [6,26,50,74,98,122], [6,30,54,78,102,126], [6,26,52,78,104,130], [6,30,56,82,108,134],
    [6,34,60,86,112,138], [6,30,58,86,114,142], [6,34,62,90,118,146], [6,30,54,78,102,126,150],
    [6,24,50,76,102,128,154], [6,28,54,80,106,132,158], [6,32,58,84,110,136,162], [6,26,54,82,110,138,166],
    [6,30,58,86,114,142,170],
].map((r) => Object.freeze(r)));

// ---- error-correction levels, as the FORMAT INFORMATION encodes them (not in L,M,Q,H order) -----------------
/** Level letter -> the two format bits. Same values as the encoder's QRErrorCorrectionLevel. */
export const EC_BITS = Object.freeze({ L: 1, M: 0, Q: 3, H: 2 });
export const EC_OF_BITS = Object.freeze({ 1: "L", 0: "M", 3: "Q", 2: "H" });
const EC_COLUMN = Object.freeze({ L: 0, M: 1, Q: 2, H: 3 });

/** Version from the side length: n = 4v + 17. Throws on a size no QR symbol has. */
export function versionOf(n) {
    const v = (n - 17) / 4;
    if (!Number.isInteger(v) || v < 1 || v > 40) throw new Error(`qrDecode: ${n} modules is not a QR size (need 4v+17, v in 1..40)`);
    return v;
}

/** The Reed-Solomon block structure for a version and level: [{ total, data }...] in transmission order. */
export function rsBlocks(version, ec) {
    const row = RS_BLOCK_TABLE[(version - 1) * 4 + EC_COLUMN[ec]];
    if (!row) throw new Error(`qrDecode: no RS blocks for version ${version} level ${ec}`);
    const out = [];
    for (let i = 0; i < row.length; i += 3) for (let j = 0; j < row[i]; j++) out.push({ total: row[i + 1], data: row[i + 2] });
    return out;
}

/** Data codewords available at a version and level -- the number every throughput claim reduces to. */
export function dataCapacity(version, ec) { return rsBlocks(version, ec).reduce((s, b) => s + b.data, 0); }

/** Bits used for a segment's character count, by mode and version (ISO 18004 table 3). */
export function lengthBits(mode, version) {
    const band = version <= 9 ? 0 : version <= 26 ? 1 : 2;
    if (mode === 1) return [10, 12, 14][band];   // numeric
    if (mode === 2) return [9, 11, 13][band];    // alphanumeric
    if (mode === 4) return [8, 16, 16][band];    // byte
    if (mode === 8) return [8, 10, 12][band];    // kanji
    throw new Error("qrDecode: no length field for mode " + mode);
}

// ---- GF(256) with the QR primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 ----------------------------------------
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const gmul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
const gdiv = (a, b) => { if (b === 0) throw new Error("gf div by zero"); return a === 0 ? 0 : EXP[(LOG[a] + 255 - LOG[b]) % 255]; };
const gpow = (i) => EXP[((i % 255) + 255) % 255];

/**
 * Correct one Reed-Solomon block in place. `block` is [data..., ec...] (highest-degree coefficient first,
 * as transmitted). Returns the number of symbols corrected; throws when the code cannot vouch for the block.
 */
export function rsCorrect(block, ecCount) {
    const n = block.length, t2 = ecCount;
    // syndromes S_i = C(alpha^i), i = 0 .. 2t-1 ; generator roots start at alpha^0 in QR
    const S = new Uint8Array(t2);
    let allZero = true;
    for (let i = 0; i < t2; i++) {
        let s = 0; const a = gpow(i);
        for (let j = 0; j < n; j++) s = gmul(s, a) ^ block[j];
        S[i] = s; if (s) allZero = false;
    }
    if (allZero) return 0;
    // Berlekamp-Massey: error-locator Lambda
    let C = [1], B = [1], L = 0, m = 1, b = 1;
    for (let i = 0; i < t2; i++) {
        let d = S[i];
        for (let k = 1; k <= L; k++) d ^= gmul(C[k] || 0, S[i - k]);
        if (d === 0) { m++; continue; }
        const T = C.slice();
        const coef = gdiv(d, b);
        while (C.length < B.length + m) C.push(0);
        for (let k = 0; k < B.length; k++) C[k + m] ^= gmul(coef, B[k]);
        if (2 * L <= i) { L = i + 1 - L; B = T; b = d; m = 1; } else m++;
    }
    C.length = L + 1;
    if (2 * L > t2) throw new Error(`qrDecode: ${L} errors in a block that can correct ${t2 >> 1}`);
    // Chien search: roots of Lambda are X_j^-1 with X_j = alpha^(n-1-j)
    const positions = [];
    for (let j = 0; j < n; j++) {
        const xinv = gpow(-(n - 1 - j));
        let v = 0, p = 1;
        for (let k = 0; k <= L; k++) { v ^= gmul(C[k], p); p = gmul(p, xinv); }
        if (v === 0) positions.push(j);
    }
    if (positions.length !== L) throw new Error(`qrDecode: locator degree ${L} but ${positions.length} roots -- uncorrectable block`);
    // Forney: Omega = S(x) Lambda(x) mod x^2t ; e_j = X_j * Omega(X_j^-1) / Lambda'(X_j^-1)
    const Om = new Uint8Array(t2);
    for (let i = 0; i < t2; i++) for (let k = 0; k <= L && k <= i; k++) Om[i] ^= gmul(S[i - k], C[k]);
    for (const j of positions) {
        const X = gpow(n - 1 - j), xinv = gpow(-(n - 1 - j));
        let om = 0, p = 1; for (let i = 0; i < t2; i++) { om ^= gmul(Om[i], p); p = gmul(p, xinv); }
        let dl = 0; p = 1; for (let k = 1; k <= L; k += 2) { dl ^= gmul(C[k], p); p = gmul(p, gmul(xinv, xinv)); }
        if (dl === 0) throw new Error("qrDecode: Forney derivative is zero -- uncorrectable block");
        block[j] ^= gmul(X, gdiv(om, dl));
    }
    // the corrected block must now be a codeword; anything else is a miscorrection and is refused
    for (let i = 0; i < t2; i++) {
        let s = 0; const a = gpow(i);
        for (let j = 0; j < n; j++) s = gmul(s, a) ^ block[j];
        if (s) throw new Error("qrDecode: syndromes non-zero after correction -- refused rather than guessed");
    }
    return positions.length;
}

// ---- the symbol's fixed geometry, mirrored from the encoder ------------------------------------------------------
/** 1 where a module belongs to a function pattern or reserved area, 0 where data lives. */
export function functionPatternMap(n) {
    const v = versionOf(n), map = new Uint8Array(n * n), set = (r, c) => { map[r * n + c] = 1; };
    const probe = (row, col) => { for (let r = -1; r <= 7; r++) { if (row + r < 0 || row + r >= n) continue;
        for (let c = -1; c <= 7; c++) { if (col + c < 0 || col + c >= n) continue; set(row + r, col + c); } } };
    probe(0, 0); probe(n - 7, 0); probe(0, n - 7);
    const pos = PATTERN_POSITION_TABLE[v - 1];
    for (const row of pos) for (const col of pos) {
        if (map[row * n + col]) continue;           // the encoder skips a pattern whose centre is already set
        for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) set(row + r, col + c);
    }
    for (let i = 8; i < n - 8; i++) { set(i, 6); set(6, i); }
    for (let i = 0; i < 15; i++) {                  // format information, both copies
        if (i < 6) set(i, 8); else if (i < 8) set(i + 1, 8); else set(n - 15 + i, 8);
        if (i < 8) set(8, n - i - 1); else if (i < 9) set(8, 15 - i); else set(8, 15 - i - 1);
    }
    set(n - 8, 8);                                  // the dark module
    if (v >= 7) for (let i = 0; i < 18; i++) { set(Math.floor(i / 3), i % 3 + n - 11); set(i % 3 + n - 11, Math.floor(i / 3)); }
    return map;
}

/** The eight mask conditions of ISO 18004 (row i, column j); true means "invert". */
export function maskBit(pattern, i, j) {
    switch (pattern) {
        case 0: return (i + j) % 2 === 0;
        case 1: return i % 2 === 0;
        case 2: return j % 3 === 0;
        case 3: return (i + j) % 3 === 0;
        case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
        case 5: return (i * j) % 2 + (i * j) % 3 === 0;
        case 6: return ((i * j) % 2 + (i * j) % 3) % 2 === 0;
        case 7: return ((i * j) % 3 + (i + j) % 2) % 2 === 0;
        default: throw new Error("qrDecode: mask pattern " + pattern);
    }
}

const G15 = 0x537, G15_MASK = 0x5412;
/** The 15-bit format code for (ec bits << 3 | mask), exactly as the encoder computes it. */
export function formatCode(data) {
    const digit = (x) => { let d = 0; while (x) { d++; x >>>= 1; } return d; };
    let d = data << 10;
    while (digit(d) - digit(G15) >= 0) d ^= G15 << (digit(d) - digit(G15));
    return ((data << 10) | d) ^ G15_MASK;
}
const FORMAT_CODES = Array.from({ length: 32 }, (_, i) => formatCode(i));

/** Read both format copies and pick the valid code nearest to either; up to three bit errors are tolerated. */
export function readFormat(isDark, n) {
    let a = 0, b = 0;
    for (let i = 0; i < 15; i++) {
        const va = i < 6 ? isDark(i, 8) : i < 8 ? isDark(i + 1, 8) : isDark(n - 15 + i, 8);
        const vb = i < 8 ? isDark(8, n - i - 1) : i < 9 ? isDark(8, 15 - i) : isDark(8, 15 - i - 1);
        if (va) a |= 1 << i; if (vb) b |= 1 << i;
    }
    const ham = (x, y) => { let z = x ^ y, c = 0; while (z) { c += z & 1; z >>>= 1; } return c; };
    let best = -1, bestD = 99;
    for (let i = 0; i < 32; i++) { const d = Math.min(ham(a, FORMAT_CODES[i]), ham(b, FORMAT_CODES[i])); if (d < bestD) { bestD = d; best = i; } }
    if (bestD > 3) throw new Error(`qrDecode: format information unreadable (nearest valid code is ${bestD} bits away)`);
    return { ec: EC_OF_BITS[best >> 3], mask: best & 7, distance: bestD };
}

/** Walk the data region in the encoder's zigzag order, unmasking, and return the raw codewords. */
export function readCodewords(isDark, n, mask, map = functionPatternMap(n)) {
    const bytes = []; let cur = 0, nbits = 0, inc = -1, row = n - 1;
    for (let col = n - 1; col > 0; col -= 2) {
        if (col === 6) col--;
        for (;;) {
            for (let c = 0; c < 2; c++) {
                const cc = col - c;
                if (map[row * n + cc]) continue;
                let bit = isDark(row, cc) ? 1 : 0;
                if (maskBit(mask, row, cc)) bit ^= 1;
                cur = (cur << 1) | bit; nbits++;
                if (nbits === 8) { bytes.push(cur); cur = 0; nbits = 0; }
            }
            row += inc;
            if (row < 0 || row >= n) { row -= inc; inc = -inc; break; }
        }
    }
    return bytes;   // trailing remainder bits (< 8) are dropped, as the standard says they carry nothing
}

/** Undo the encoder's interleaving: raw codewords -> per-block [data..., ec...]. */
export function deinterleave(codewords, blocks) {
    const maxData = Math.max(...blocks.map((b) => b.data)), maxEc = Math.max(...blocks.map((b) => b.total - b.data));
    const out = blocks.map(() => []); let k = 0;
    for (let i = 0; i < maxData; i++) for (let r = 0; r < blocks.length; r++) if (i < blocks[r].data) out[r].push(codewords[k++]);
    for (let i = 0; i < maxEc; i++) for (let r = 0; r < blocks.length; r++) if (i < blocks[r].total - blocks[r].data) out[r].push(codewords[k++]);
    return out;
}

const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
/** Parse the data bit stream into bytes. Numeric and alphanumeric segments come out as their ASCII text. */
export function parseSegments(data, version) {
    let pos = 0; const total = data.length * 8;
    const read = (k) => { let v = 0; for (let i = 0; i < k; i++) { v = (v << 1) | ((data[pos >> 3] >> (7 - (pos & 7))) & 1); pos++; } return v; };
    const out = [], segments = [];
    while (total - pos >= 4) {
        const mode = read(4);
        if (mode === 0) break;                                   // terminator
        if (mode === 7) { read(8); continue; }                   // ECI designator (one byte form) -- skipped
        const count = read(lengthBits(mode, version));
        if (mode === 4) { for (let i = 0; i < count; i++) out.push(read(8)); segments.push({ mode: "byte", count }); }
        else if (mode === 1) {
            let left = count;
            while (left >= 3) { const v = read(10); out.push(48 + Math.floor(v / 100), 48 + Math.floor(v / 10) % 10, 48 + v % 10); left -= 3; }
            if (left === 2) { const v = read(7); out.push(48 + Math.floor(v / 10), 48 + v % 10); }
            else if (left === 1) out.push(48 + read(4));
            segments.push({ mode: "numeric", count });
        } else if (mode === 2) {
            let left = count;
            while (left >= 2) { const v = read(11); out.push(ALNUM.charCodeAt(Math.floor(v / 45)), ALNUM.charCodeAt(v % 45)); left -= 2; }
            if (left === 1) out.push(ALNUM.charCodeAt(read(6)));
            segments.push({ mode: "alphanumeric", count });
        } else throw new Error(`qrDecode: mode ${mode} (kanji/structured append) is not decoded here`);
    }
    return { bytes: Uint8Array.from(out), segments };
}

/**
 * The whole path: matrix -> format -> codewords -> blocks -> corrected data -> segments -> bytes.
 * @param isDark (row, col) => boolean
 * @param n side length in modules
 */
export function decodeQR(isDark, n) {
    const version = versionOf(n);
    const { ec, mask, distance } = readFormat(isDark, n);
    const blocks = rsBlocks(version, ec);
    const raw = readCodewords(isDark, n, mask);
    const need = blocks.reduce((s, b) => s + b.total, 0);
    if (raw.length < need) throw new Error(`qrDecode: read ${raw.length} codewords, version ${version}-${ec} needs ${need}`);
    const parts = deinterleave(raw.slice(0, need), blocks);
    let corrected = 0; const data = [];
    for (let r = 0; r < parts.length; r++) {
        corrected += rsCorrect(parts[r], blocks[r].total - blocks[r].data);
        for (let i = 0; i < blocks[r].data; i++) data.push(parts[r][i]);
    }
    const { bytes, segments } = parseSegments(Uint8Array.from(data), version);
    return { bytes, text: String.fromCharCode(...bytes), version, ec, mask, corrected, formatDistance: distance, segments };
}

/** Adapter for the vendored encoder's object: qrcode(v, ec) after make() -> { n, isDark }. */
export function matrixOf(qr) {
    const n = qr.getModuleCount();
    return { n, isDark: (r, c) => qr.isDark(r, c) };
}
