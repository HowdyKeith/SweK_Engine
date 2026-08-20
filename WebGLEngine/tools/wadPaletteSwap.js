// =============================================================
// FILE: /tools/wadPaletteSwap.js
// ROUND: 394
// =============================================================
//
// Use the WAD's PLAYPAL as the engine's palette while a WAD is
// active. The motivation: "Doom mode" should LOOK like Doom — the
// iconic ramped grays, browns, and reds, not whatever the engine's
// default material colors were.
//
// PLAYPAL layout (review from v365 wadTextures):
//   14 palettes × 256 colors × 3 bytes (RGB).
//   Palette 0 = normal.    Palettes 1-8 = pain (red tint).
//   Palettes 9-12 = bonus  Palette 13 = green radiation suit.
//
// THIS MODULE PROVIDES:
//   1. `paletteToMaterials(palette, baseId)` — turn the 256-entry
//      PLAYPAL into a 256-entry array of `{ r, g, b }` engine material
//      records, starting at a base material id. Lets the engine
//      address any PLAYPAL color by id (baseId + paletteIndex).
//
//   2. `colorForFlatName(wadFile, name, palette)` — sample a flat's
//      decoded texture and return its dominant or average color.
//      Use to pick a "representative color" for a Doom floor when
//      you don't want to atlas the actual texture.
//
//   3. `dominantColor(rgba)` — utility over decoded RGBA buffers.
//      Buckets colors into a coarse 4×4×4 grid and returns the
//      heaviest bucket's centroid.
//
//   4. `mixWithLight(rgb, light)` — sector-light tint (used by v395).
//      `light` is the Doom 0..255 sector light level; output is the
//      input RGB scaled to (0.3 + 0.7 * light/255) — a soft floor so
//      dim sectors don't go completely black.

/**
 * Convert a PLAYPAL palette (256 × 3 bytes) into an array of 256
 * engine material descriptors. Format matches what the engine's
 * voxel material registry expects: `{ id, r, g, b, name }`.
 *
 *   const mats = paletteToMaterials(pal, 100);    // ids 100..355
 *   // mats[0] = { id: 100, r: 0, g: 0, b: 0, name: "PAL_000" }
 *   // mats[15] = { id: 115, r: ..., g: ..., b: ..., name: "PAL_015" }
 */
export function paletteToMaterials(palette, baseId = 100) {
    if (!palette || palette.length < 256 * 3) {
        throw new Error("paletteToMaterials: palette must have ≥768 bytes");
    }
    const out = new Array(256);
    for (let i = 0; i < 256; i++) {
        const off = i * 3;
        out[i] = {
            id:   baseId + i,
            r:    palette[off],
            g:    palette[off + 1],
            b:    palette[off + 2],
            name: `PAL_${String(i).padStart(3, "0")}`,
        };
    }
    return out;
}

/**
 * Find the dominant color of an RGBA buffer. Buckets to a coarse
 * 4×4×4 grid (64 buckets); returns the centroid of the heaviest
 * bucket. Alpha < 128 skips the pixel (transparent areas don't
 * count toward "what color is this flat").
 *
 * Returns { r, g, b, weight } with weight = pixel count of the
 * winning bucket.
 */
export function dominantColor(rgba) {
    if (!rgba?.length) return { r: 0, g: 0, b: 0, weight: 0 };
    const buckets = new Map();    // key = (r4 * 16) + (g4 * 4) + b4 ; value = { rSum, gSum, bSum, count }
    for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i + 3] < 128) continue;
        const r = rgba[i],     g = rgba[i + 1], b = rgba[i + 2];
        const key = ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6);
        let e = buckets.get(key);
        if (!e) { e = { rSum: 0, gSum: 0, bSum: 0, count: 0 }; buckets.set(key, e); }
        e.rSum += r; e.gSum += g; e.bSum += b; e.count++;
    }
    let best = null;
    for (const v of buckets.values()) {
        if (!best || v.count > best.count) best = v;
    }
    if (!best) return { r: 0, g: 0, b: 0, weight: 0 };
    return {
        r: Math.round(best.rSum / best.count),
        g: Math.round(best.gSum / best.count),
        b: Math.round(best.bSum / best.count),
        weight: best.count,
    };
}

/**
 * Quick average (mean) color of an RGBA buffer. Cheaper than
 * dominantColor; less accurate but fine for "soft tint" decisions.
 */
export function averageColor(rgba) {
    if (!rgba?.length) return { r: 0, g: 0, b: 0 };
    let rs = 0, gs = 0, bs = 0, n = 0;
    for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i + 3] < 128) continue;
        rs += rgba[i]; gs += rgba[i + 1]; bs += rgba[i + 2]; n++;
    }
    if (n === 0) return { r: 0, g: 0, b: 0 };
    return { r: Math.round(rs / n), g: Math.round(gs / n), b: Math.round(bs / n) };
}

/**
 * Sample a flat texture by name and return its dominant color.
 * If the flat isn't found, returns null.
 *
 *   const c = colorForFlatName(wadFile, "FLOOR0_1", palette);
 *   // c.r, c.g, c.b
 *
 * decodeFlat is window.wad.flat (passed in to avoid circular import).
 */
export function colorForFlatName(decodeFlat, wadFile, name, palette, mode = "dominant") {
    const decoded = decodeFlat(wadFile, name, palette);
    if (!decoded?.rgba) return null;
    return mode === "average" ? averageColor(decoded.rgba) : dominantColor(decoded.rgba);
}

/**
 * Sector-light tint. Doom's sector light is 0..255; rendered
 * brightness scales mostly linearly but never to absolute zero
 * (else dim halls would be unreadable on a non-HDR display).
 *
 *   const tinted = mixWithLight({ r: 180, g: 180, b: 180 }, 96);
 *   // → { r: ~108, g: ~108, b: ~108 } (light=96 → factor 0.563)
 */
export function mixWithLight(rgb, light) {
    if (light == null) return rgb;
    const clamped = Math.max(0, Math.min(255, light));
    const factor  = 0.3 + 0.7 * (clamped / 255);
    return {
        r: Math.max(0, Math.min(255, Math.round(rgb.r * factor))),
        g: Math.max(0, Math.min(255, Math.round(rgb.g * factor))),
        b: Math.max(0, Math.min(255, Math.round(rgb.b * factor))),
    };
}

/**
 * Build a (texture-name → palette-index-id) lookup function suitable
 * for passing as the floorTexture / wallTexture lookup in the v378
 * voxelizer's `opts.floorTextureMap` / `opts.wallTextureMap`. The
 * lookup decodes each flat ONCE (cached) and returns the engine
 * material id corresponding to its dominant color.
 *
 *   const lookup = buildFlatColorLookup(window.wad, wadFile, pal, 100);
 *   wad.voxelize(parsedMap, { floorTextureMap: lookup });
 */
export function buildFlatColorLookup(wadApi, wadFile, palette, baseMatId = 100) {
    const cache = new Map();
    return (texName) => {
        if (cache.has(texName)) return cache.get(texName);
        const color = colorForFlatName(wadApi.flat, wadFile, texName, palette);
        if (!color) { cache.set(texName, null); return null; }
        // Find the closest PLAYPAL entry
        const matId = baseMatId + closestPaletteIndex(color, palette);
        cache.set(texName, matId);
        return matId;
    };
}

/**
 * Find the index in PLAYPAL (0..255) closest to a given RGB.
 * Cheap squared-distance search; fine for a few thousand lookups.
 */
export function closestPaletteIndex(rgb, palette) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < 256; i++) {
        const off = i * 3;
        const dr = rgb.r - palette[off];
        const dg = rgb.g - palette[off + 1];
        const db = rgb.b - palette[off + 2];
        const d  = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = i; }
    }
    return best;
}

/**
 * Build a sectorLightTint callback for `voxelizeWadMap`. The
 * returned function takes the un-tinted material id and routes it
 * to a dimmed PLAYPAL entry. Caches per (origMatId, sectorLight) so
 * repeat lookups across thousands of voxels are O(1).
 *
 *   const tint = buildSectorLightTint(palette, baseMatId);
 *   wad.voxelize(map, { floorTextureMap: lookup, sectorLightTint: tint });
 *
 * The output material id is baseMatId + closestPaletteIndex(tintedRGB).
 * Caller is responsible for having registered the corresponding
 * PLAYPAL materials (via paletteToMaterials) with the engine.
 */
export function buildSectorLightTint(palette, baseMatId = 100) {
    const cache = new Map();
    return (matId, sector, sectorIdx) => {
        const light = sector?.light ?? 255;
        // Cache key combines source material + light level
        const key = (matId << 16) | (light & 0xFFFF);
        if (cache.has(key)) return cache.get(key);
        // Resolve current matId back to its RGB. Only PLAYPAL-baseId
        // materials are dimmable; non-palette materials pass through.
        const palIdx = matId - baseMatId;
        if (palIdx < 0 || palIdx >= 256) {
            cache.set(key, matId);
            return matId;
        }
        const off = palIdx * 3;
        const tinted = mixWithLight(
            { r: palette[off], g: palette[off + 1], b: palette[off + 2] },
            light);
        const newIdx = closestPaletteIndex(tinted, palette);
        const out = baseMatId + newIdx;
        cache.set(key, out);
        return out;
    };
}
