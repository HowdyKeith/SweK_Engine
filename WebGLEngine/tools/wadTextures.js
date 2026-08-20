// FILE: tools/wadTextures.js
// VERSION: v1 — round 367
//
// Extract textures, palettes, and flats from a parsed WAD. Doom's
// renderer used an 8-bit indexed color pipeline with PLAYPAL providing
// 14 palettes (14 × 256 RGB triplets = 768 bytes each, 10752 total).
// Palette 0 is the default; the others are pain flashes, gold-key
// pickups, radsuit, etc.
//
// Flats (floor/ceiling textures) are 64×64 raw indices stored as a
// single 4096-byte lump named after the texture.
//
// Wall textures are composites — PNAMES + TEXTURE1/TEXTURE2 lumps
// describe how to assemble named patches into wall textures. Patches
// are column-encoded with transparency. Full wall-texture decoding is
// a substantial project; this v1 ships PLAYPAL + flats and stubs
// the wall-texture path with the lump locator.
//
// Use:
//   const playpal = extractPalette(wadFile)        → Uint8Array(256*3)
//   const colormap = extractColormap(wadFile)      → Uint8Array(34*256)
//   const flat = extractFlat(wadFile, "FLOOR0_1") → { width:64, height:64, rgba: Uint8ClampedArray }
//   const flats = listFlats(wadFile)              → ["FLOOR0_1", "FLOOR0_3", ...]
//
// Flats live between F_START and F_END markers (or F1_START/F1_END,
// F2_START/F2_END in IWAD layouts). We accept any of them.

const FLAT_BOUNDARY_RE = /^F[12]?_(START|END)$/;
const FLAT_LUMP_SIZE   = 64 * 64;   // 4096 bytes per flat

/**
 * Extract the default palette (palette 0 of PLAYPAL) as 256 RGB triplets.
 * Returns Uint8Array(768) — palette[idx*3 + {0,1,2}] = R/G/B.
 * Throws if PLAYPAL is missing or undersized.
 */
export function extractPalette(wadFile, paletteIndex = 0) {
    const lump = wadFile.lumps.find(l => l.name === "PLAYPAL");
    if (!lump) throw new Error("PLAYPAL lump not in WAD");
    if (lump.size < (paletteIndex + 1) * 768) {
        throw new Error(`PLAYPAL too small for palette index ${paletteIndex}`);
    }
    const u8 = new Uint8Array(wadFile.arrayBuffer);
    const out = new Uint8Array(768);
    out.set(u8.subarray(lump.offset + paletteIndex * 768, lump.offset + (paletteIndex + 1) * 768));
    return out;
}

/**
 * Extract COLORMAP (34 light levels × 256 palette indices = 8704 bytes).
 * Used to dim textures per sector light level: instead of multiplying
 * RGB, Doom indexed into a remap table per light bucket.
 */
export function extractColormap(wadFile) {
    const lump = wadFile.lumps.find(l => l.name === "COLORMAP");
    if (!lump) throw new Error("COLORMAP lump not in WAD");
    const u8 = new Uint8Array(wadFile.arrayBuffer);
    return new Uint8Array(u8.subarray(lump.offset, lump.offset + lump.size));
}

/**
 * Return the set of lump names that lie between any F*_START / F*_END
 * markers — these are the flats available in the WAD.
 */
export function listFlats(wadFile) {
    const names = [];
    let inFlats = 0;
    for (const lump of wadFile.lumps) {
        if (FLAT_BOUNDARY_RE.test(lump.name)) {
            if (lump.name.endsWith("_START")) inFlats++;
            else                              inFlats = Math.max(0, inFlats - 1);
            continue;
        }
        if (inFlats > 0 && lump.size === FLAT_LUMP_SIZE) {
            names.push(lump.name);
        }
    }
    return names;
}

/**
 * Decode a flat (64×64 indexed image) to RGBA8888 using the given palette.
 *
 * @param {Object} wadFile  parsed WAD
 * @param {string} name      flat lump name (e.g. "FLOOR0_1")
 * @param {Uint8Array} [palette]  if omitted, uses palette 0
 * @returns {{width:64, height:64, rgba: Uint8ClampedArray}}
 */
export function extractFlat(wadFile, name, palette = null) {
    const lump = wadFile.lumps.find(l => l.name === name && l.size === FLAT_LUMP_SIZE);
    if (!lump) throw new Error(`flat ${name} not found`);
    const u8 = new Uint8Array(wadFile.arrayBuffer);
    const pal = palette || extractPalette(wadFile, 0);
    const rgba = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < FLAT_LUMP_SIZE; i++) {
        const idx = u8[lump.offset + i];
        rgba[i * 4]     = pal[idx * 3];
        rgba[i * 4 + 1] = pal[idx * 3 + 1];
        rgba[i * 4 + 2] = pal[idx * 3 + 2];
        rgba[i * 4 + 3] = 255;
    }
    return { width: 64, height: 64, rgba };
}

/**
 * Convenience: decode ALL flats in the WAD to RGBA. Returns a map of
 * name → { width, height, rgba }. Useful for batch dumps.
 */
export function extractAllFlats(wadFile, palette = null) {
    const pal = palette || extractPalette(wadFile, 0);
    const out = new Map();
    for (const name of listFlats(wadFile)) {
        try { out.set(name, extractFlat(wadFile, name, pal)); }
        catch {}
    }
    return out;
}

/**
 * Locate wall-texture support lumps. Doom stores wall textures as
 * "composites" — PNAMES is a roster of 8-char patch names, and
 * TEXTURE1 / TEXTURE2 lumps describe assembly.
 *
 * v367 ships only the lookup; the full composite decode (column-encoded
 * patches with per-column transparency runs) is reserved for a later
 * round. Returns:
 *
 *   { pnames: string[], texture1Defs: any[], texture2Defs: any[] }
 *
 * where texture defs are parsed metadata only (no pixel data yet).
 */
export function locateWallTextures(wadFile) {
    const u8 = new Uint8Array(wadFile.arrayBuffer);
    const dv = new DataView(wadFile.arrayBuffer);
    const pnamesLump = wadFile.lumps.find(l => l.name === "PNAMES");
    const tex1Lump   = wadFile.lumps.find(l => l.name === "TEXTURE1");
    const tex2Lump   = wadFile.lumps.find(l => l.name === "TEXTURE2");

    const pnames = [];
    if (pnamesLump) {
        const count = dv.getUint32(pnamesLump.offset, true);
        for (let i = 0; i < count; i++) {
            const base = pnamesLump.offset + 4 + i * 8;
            let s = "";
            for (let j = 0; j < 8; j++) {
                const c = u8[base + j];
                if (c === 0) break;
                s += String.fromCharCode(c).toUpperCase();
            }
            pnames.push(s);
        }
    }

    const parseTextureLump = (lump) => {
        if (!lump) return [];
        const numTex   = dv.getInt32(lump.offset, true);
        const defs = [];
        for (let i = 0; i < numTex; i++) {
            const ptrOff = lump.offset + 4 + i * 4;
            const texOff = dv.getInt32(ptrOff, true);
            // 22-byte header: 8-char name, masked(4), width(2), height(2),
            // columnDirectory(4), numPatches(2)
            let name = "";
            for (let j = 0; j < 8; j++) {
                const c = u8[lump.offset + texOff + j];
                if (c === 0) break;
                name += String.fromCharCode(c).toUpperCase();
            }
            const width  = dv.getUint16(lump.offset + texOff + 12, true);
            const height = dv.getUint16(lump.offset + texOff + 14, true);
            const numPatches = dv.getUint16(lump.offset + texOff + 20, true);
            // Patches start at offset+22, 10 bytes each
            const patches = [];
            for (let p = 0; p < numPatches; p++) {
                const pBase = lump.offset + texOff + 22 + p * 10;
                patches.push({
                    originX: dv.getInt16(pBase, true),
                    originY: dv.getInt16(pBase + 2, true),
                    patchIdx: dv.getInt16(pBase + 4, true),
                    // stepDir(2) + colormap(2) — unused in modern engines
                });
            }
            defs.push({ name, width, height, patches });
        }
        return defs;
    };

    return {
        pnames,
        texture1Defs: parseTextureLump(tex1Lump),
        texture2Defs: parseTextureLump(tex2Lump),
    };
}
