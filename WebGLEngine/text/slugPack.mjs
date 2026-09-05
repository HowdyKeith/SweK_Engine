// WebGLEngine/text/slugPack.mjs -- v4487
//
// *** A FONT SUBSET, PACKED ONCE AT SHIP TIME INTO ONE FILE THE RUNTIME UPLOADS WITHOUT PARSING. *** text/slugAtlas.js
// packAtlas is pure and deterministic and already runs headless (text/slug-selfcheck.mjs), so the cheap shape for a
// vendored font is not a Web Worker parsing it on every page load but a build step: tools/ship/packFonts.mjs packs each
// registered family's declared alphabet (text/fontRegistry.mjs CHAR_SETS) into curve and band texels plus the metrics
// the layout needs, and writes vendor/fonts/<family>/<Name>.<set>.slug.bin. A page fetches that, decodes it, and hands
// gfx/device.js the bytes: no TrueType parse, no outline walk, no band search. The parse path stays for a font a user
// drops in; the pack is for the fonts the tree ships.
//
// MEASURED at v4487 in the browser (the harness's headless Chromium), the 67-glyph label alphabet: IBM Plex Serif parses,
// outlines and packs in 29 ms cold and 20 warm (of which the pack is 20 / 13); Cinzel 16 / 11; JetBrains Mono 8 / 8;
// Source Sans 3 10 / 13. About a frame, once, per family -- which is why there is no worker: the message-passing code
// would cost more lines than the work it hides, and the build step removes the work rather than hiding it.
//
// THE FILE: "SLUG" (4 bytes), version u32, header length u32, the header as JSON (padded to 4 bytes), the curve texels
// (rgba16float, width * curveTexels * 4 halves), the band texels (rg16uint, width * bandTexels * 2 shorts). Everything
// the header holds is what the atlas and the layout read: the atlas's shape and glyph records, and for the subset the
// cmap, the advances and the kern pairs in em, plus the font's vertical metrics and its kerning source. The encoding is
// byte-reproducible from the font, which is what lets the gate hold a file to a fresh pack and call any difference stale.
//
// WHAT A PACK DOES NOT CARRY: outlines (nothing draws them), glyphs outside the subset (glyphIndex returns 0 for them,
// as parseFont's does for an unmapped codepoint), and kerning between a subset glyph and one outside it.
"use strict";
import { packAtlas } from "./slugAtlas.js";

export const PACK_MAGIC = "SLUG";
export const PACK_VERSION = 1;

/** Pack `chars` of `font` (a slugFont.parseFont result) into { header, curveData, bandData }. Deterministic. */
export function packFont(font, chars, opts = {}) {
    const logWidth = opts.logWidth || 12;
    const cps = [...new Set([...chars].map((c) => c.codePointAt(0)))].sort((a, b) => a - b);
    const cmap = cps.map((cp) => [cp, font.glyphIndex(cp)]);
    const gis = [...new Set(cmap.map(([, gi]) => gi))].sort((a, b) => a - b);
    const list = gis.map((gi) => ({ key: gi, contours: font.outline(gi).contours }));
    const atlas = packAtlas(list, { format: "16f", logWidth, maxBands: opts.maxBands, epsilon: opts.epsilon, evenOdd: opts.evenOdd, weight: opts.weight });
    const kern = [];
    for (const l of gis) for (const r of gis) { const v = font.kern(l, r); if (v !== 0) kern.push([l, r, v]); }
    const glyphs = [...atlas.glyphs.entries()].sort((a, b) => a[0] - b[0]).map(([gi, e]) => [gi, { loc: e.loc, bandMax: e.bandMax, transform: e.transform, bbox: e.bbox, curveCount: e.curveCount, empty: e.empty }]);
    const header = {
        magic: PACK_MAGIC, version: PACK_VERSION, chars, logWidth, width: atlas.width, format: atlas.format, curveTexels: atlas.curveTexels, bandTexels: atlas.bandTexels,
        unitsPerEm: font.unitsPerEm, ascent: font.ascent, descent: font.descent, lineGap: font.lineGap, capHeight: font.capHeight, kerningSource: font.kerningSource || "none",
        cmap, advances: gis.map((gi) => [gi, font.advance(gi)]), kern, glyphs,
    };
    return { header, curveData: atlas.curveData, bandData: atlas.bandData };
}

/** One byte array from a pack. */
export function encodePack(pack) {
    const json = new TextEncoder().encode(JSON.stringify(pack.header));
    const pad = (4 - (json.length % 4)) % 4;
    const cur = new Uint8Array(pack.curveData.buffer, pack.curveData.byteOffset, pack.curveData.byteLength);
    const band = new Uint8Array(pack.bandData.buffer, pack.bandData.byteOffset, pack.bandData.byteLength);
    const out = new Uint8Array(12 + json.length + pad + cur.length + band.length);
    const dv = new DataView(out.buffer);
    out.set([0x53, 0x4C, 0x55, 0x47], 0); dv.setUint32(4, PACK_VERSION, true); dv.setUint32(8, json.length, true);
    out.set(json, 12); out.set(cur, 12 + json.length + pad); out.set(band, 12 + json.length + pad + cur.length);
    return out;
}

/**
 * A pack from bytes: { header, atlas, font }. `atlas` has packAtlas's shape (the two typed arrays over the file's own
 * bytes, `glyphs` a Map); `font` answers what text/slugText.js layoutText and the batches ask a font -- glyphIndex, advance,
 * kern, the vertical metrics, kerningSource -- for the subset, and says `packed: true`. Refuses by name: a wrong magic,
 * a version this reader does not know, a file shorter than its header says.
 */
export function decodePack(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.length < 12 || String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== PACK_MAGIC) throw new Error("slugPack: not a slug pack (magic)");
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const version = dv.getUint32(4, true), len = dv.getUint32(8, true);
    if (version !== PACK_VERSION) throw new Error(`slugPack: pack version ${version}; this reader knows ${PACK_VERSION}`);
    if (12 + len > u8.length) throw new Error("slugPack: the header runs past the end of the file");
    const header = JSON.parse(new TextDecoder().decode(u8.subarray(12, 12 + len)));
    const pad = (4 - (len % 4)) % 4, at = 12 + len + pad;
    const curveCount = header.width * header.curveTexels * 4, bandCount = header.width * header.bandTexels * 2;
    if (at + curveCount * 2 + bandCount * 2 > u8.length) throw new Error(`slugPack: the texels run past the end of the file (${u8.length} bytes, ${at + curveCount * 2 + bandCount * 2} needed)`);
    // copies rather than views: the texel arrays must be 2-byte aligned, and the file's offset is only 4-byte aligned relative to its own start
    const curveData = new Uint16Array(curveCount), bandData = new Uint16Array(bandCount);
    curveData.set(new Uint16Array(u8.buffer.slice(u8.byteOffset + at, u8.byteOffset + at + curveCount * 2)));
    bandData.set(new Uint16Array(u8.buffer.slice(u8.byteOffset + at + curveCount * 2, u8.byteOffset + at + curveCount * 2 + bandCount * 2)));
    const glyphs = new Map(header.glyphs.map(([gi, e]) => [gi, e]));
    const atlas = { width: header.width, logWidth: header.logWidth, format: header.format, curveTexels: header.curveTexels, bandTexels: header.bandTexels, curveData, bandData, glyphs };
    const cmap = new Map(header.cmap), advances = new Map(header.advances), kern = new Map(header.kern.map(([l, r, v]) => [(l << 16) | r, v]));
    const font = {
        packed: true, chars: header.chars, unitsPerEm: header.unitsPerEm, ascent: header.ascent, descent: header.descent, lineGap: header.lineGap, capHeight: header.capHeight,
        kerningSource: header.kerningSource, hasKernTable: false, hasGPOS: header.kerningSource === "GPOS", hasGPOSKern: header.kerningSource === "GPOS",
        numGlyphs: glyphs.size,
        glyphIndex(cp) { return cmap.get(cp) || 0; },
        advance(gi) { return advances.get(gi) || 0; },
        kern(l, r) { return kern.get((l << 16) | r) || 0; },
        outline() { throw new Error("slugPack: a packed font carries no outlines; parse the TrueType for those"); },
    };
    return { header, atlas, font };
}
