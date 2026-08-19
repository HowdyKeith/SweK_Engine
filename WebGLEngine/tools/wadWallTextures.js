// FILE: tools/wadWallTextures.js
// VERSION: v1 — round 377
//
// Compose Doom wall textures from patches. Wall textures are
// "composite" — TEXTURE1/TEXTURE2 lump entries describe how to
// assemble a final WIDTH×HEIGHT bitmap from one or more patches
// referenced by PNAMES index. v367 located the metadata; this round
// decodes the actual pixels.
//
// Patch encoding (Doom's "picture" format):
//
//   Header (8 bytes):
//     u16 width, u16 height, i16 leftOffset, i16 topOffset
//
//   ColumnOffsets[width]: u32 each, offset into the patch lump for
//   each column's run data.
//
//   Each column is a sequence of "posts" (also called runs):
//     u8 topdelta    (0xFF = end of column)
//     u8 length      (pixel count for this run)
//     u8 unused      (padding — first transparency byte)
//     u8 pixels[length]  (palette indices)
//     u8 unused      (padding — last transparency byte)
//   The above repeats until topdelta=0xFF.
//
// Pixels outside any post = transparent.
//
// USAGE:
//   const palette = wad.palette(wadFile)            // from v367
//   const decoded = decodeWallTexture(wadFile, "BIGDOOR1", palette)
//   // → { width, height, rgba: Uint8ClampedArray }
//
//   const all = decodeAllWallTextures(wadFile, palette)
//   // → Map<name, { width, height, rgba }>

import { locateWallTextures } from "./wadTextures.js";

/**
 * Find a patch lump by name (PNAMES are case-insensitive). Returns
 * the lump entry or null. Patches typically live between P_START /
 * P_END markers (or PP_START / PP_END for ZDoom patches); we accept
 * any lump with the right name to keep wider WAD compatibility.
 */
function findPatchLump(wadFile, patchName) {
    const upper = patchName.toUpperCase();
    return wadFile.lumps.find(l => l.name.toUpperCase() === upper) || null;
}

/**
 * Decode a single patch into a sparse RGBA image. Untouched pixels
 * stay alpha=0 (transparent).
 */
function decodePatch(wadFile, patchName, palette) {
    const lump = findPatchLump(wadFile, patchName);
    if (!lump) throw new Error(`patch '${patchName}' not in WAD`);
    const dv = new DataView(wadFile.arrayBuffer);
    const u8 = new Uint8Array(wadFile.arrayBuffer);
    const base = lump.offset;

    const width      = dv.getUint16(base + 0, true);
    const height     = dv.getUint16(base + 2, true);
    const leftOffset = dv.getInt16 (base + 4, true);
    const topOffset  = dv.getInt16 (base + 6, true);

    const rgba = new Uint8ClampedArray(width * height * 4);   // zeroed = transparent

    for (let col = 0; col < width; col++) {
        const colOff = base + dv.getUint32(base + 8 + col * 4, true);
        let cursor = colOff;
        while (true) {
            const topDelta = u8[cursor];
            if (topDelta === 0xFF) break;
            const length = u8[cursor + 1];
            // u8[cursor + 2] is the "first transparency" padding byte
            const pixelStart = cursor + 3;
            for (let i = 0; i < length; i++) {
                const y = topDelta + i;
                if (y < 0 || y >= height) continue;
                const palIdx = u8[pixelStart + i];
                const dst = (y * width + col) * 4;
                rgba[dst]     = palette[palIdx * 3];
                rgba[dst + 1] = palette[palIdx * 3 + 1];
                rgba[dst + 2] = palette[palIdx * 3 + 2];
                rgba[dst + 3] = 255;
            }
            // Move past: topdelta(1) + length(1) + pad(1) + pixels(length) + pad(1)
            cursor += 4 + length;
        }
    }

    return { width, height, rgba, leftOffset, topOffset };
}

/**
 * Decode a composite wall texture. Walks TEXTURE1/TEXTURE2 defs and
 * blits each patch into the final bitmap at its (originX, originY).
 *
 * @param {Object} wadFile      parsed WAD (output of WAD.parse)
 * @param {string} textureName  e.g. "BIGDOOR1"
 * @param {Uint8Array} palette  768-byte palette (v367 extractPalette)
 * @returns {{width:number, height:number, rgba:Uint8ClampedArray}}
 */
export function decodeWallTexture(wadFile, textureName, palette) {
    const meta = locateWallTextures(wadFile);
    const upper = textureName.toUpperCase();
    const def = meta.texture1Defs.find(t => t.name === upper) ||
                meta.texture2Defs.find(t => t.name === upper);
    if (!def) throw new Error(`wall texture '${textureName}' not in TEXTURE1/TEXTURE2`);

    const width  = def.width;
    const height = def.height;
    const rgba = new Uint8ClampedArray(width * height * 4);   // zeroed

    for (const patch of def.patches) {
        const patchName = meta.pnames[patch.patchIdx];
        if (!patchName) continue;
        let img;
        try { img = decodePatch(wadFile, patchName, palette); }
        catch (e) {
            console.warn(`[wadWallTextures] missing patch '${patchName}' in '${textureName}':`, e?.message);
            continue;
        }
        // Blit img into rgba at (patch.originX, patch.originY) — clip to bounds
        for (let py = 0; py < img.height; py++) {
            const dy = patch.originY + py;
            if (dy < 0 || dy >= height) continue;
            for (let px = 0; px < img.width; px++) {
                const dx = patch.originX + px;
                if (dx < 0 || dx >= width) continue;
                const srcIdx = (py * img.width + px) * 4;
                if (img.rgba[srcIdx + 3] === 0) continue;   // transparent — skip
                const dstIdx = (dy * width + dx) * 4;
                rgba[dstIdx]     = img.rgba[srcIdx];
                rgba[dstIdx + 1] = img.rgba[srcIdx + 1];
                rgba[dstIdx + 2] = img.rgba[srcIdx + 2];
                rgba[dstIdx + 3] = 255;
            }
        }
    }

    return { width, height, rgba };
}

/**
 * Decode every wall texture in TEXTURE1+TEXTURE2 into RGBA. Returns
 * a Map<name, {width, height, rgba}>. Decoded textures are O(N²)
 * memory cost (full bitmaps); for a real IWAD this can be 100-200 MB
 * if you keep them all in RAM. Consider streaming via decodeWallTexture
 * per-mesh instead of preloading.
 *
 * Failures on individual textures are logged + skipped — the call
 * returns whatever decoded successfully.
 */
export function decodeAllWallTextures(wadFile, palette) {
    const out = new Map();
    const meta = locateWallTextures(wadFile);
    const all = [...meta.texture1Defs, ...meta.texture2Defs];
    for (const def of all) {
        try {
            out.set(def.name, decodeWallTexture(wadFile, def.name, palette));
        } catch (e) {
            console.warn(`[wadWallTextures] decode '${def.name}' failed: ${e?.message ?? e}`);
        }
    }
    return out;
}

/**
 * Convenience: list every wall texture name in TEXTURE1 + TEXTURE2.
 * Useful for "tell me what textures this WAD has" before decoding.
 */
export function listWallTextureNames(wadFile) {
    const meta = locateWallTextures(wadFile);
    return [...meta.texture1Defs, ...meta.texture2Defs].map(t => t.name);
}

// Exported for tests + advanced callers who want patch-level access
export { decodePatch, findPatchLump };
