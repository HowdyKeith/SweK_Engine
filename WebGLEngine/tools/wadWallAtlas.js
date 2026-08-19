// =============================================================
// FILE: /tools/wadWallAtlas.js
// ROUND: 400
// =============================================================
//
// Pack all decoded WAD wall textures into a single atlas, with one
// material id per unique texture. The voxelizer's wallTextureMap
// option already accepts a function `(texName) → matId`; this module
// generates that function plus the atlas RGBA buffer.
//
// THE COMPLETE "DOOM IN VOXELS" RECIPE (rounds 365 → 400):
//
//   1. wad.parse(buffer)                        — load file
//   2. wad.parseMap(wad, "E1M1", { full: true }) — read map, BSP, things
//   3. wad.palette(wad)                          — PLAYPAL
//   4. const atlas = wad.buildWallAtlas(wad, palette);
//        atlas.matIdFor("STARTAN3") → matId; atlas.rgba is the
//        packed 512×512 (or larger) RGBA buffer for GPU upload.
//   5. wad.voxelize(map, { wallTextureMap: atlas.matIdFor,
//                            floorTextureMap: paletteLookup,
//                            sectorLightTint: tint });
//   6. The MaterialRegistry now has one material id per unique
//      wall texture, with atlas UV bounds in metadata.
//   7. Renderer uses metadata to sample the atlas at the right UV
//      box. (That last step is the renderer's job; this module
//      provides the data it needs.)
//
// ATLAS LAYOUT — naive shelf packer:
//   Textures are sorted by height (descending), then placed left-
//   to-right on shelves. A new shelf starts when the current shelf
//   doesn't have room. Square or near-square atlases preferred.
//   Power-of-2 sizes target 512, 1024, 2048, 4096 — anything bigger
//   pivots to multi-atlas (not implemented here; v401+ if needed).

import { getMaterialRegistry } from "../engine/MaterialRegistry.js";

const ATLAS_SIZES = [512, 1024, 2048, 4096];

/**
 * Build a wall atlas + per-texture material ids from a parsed WAD.
 *
 *   const atlas = buildWallAtlas(wad, palette, {
 *     decodeWallTexture: wadApi.wallTexture,    // (wadFile, name, pal) → {width, height, rgba}
 *     wallTextureNames:   wadApi.wallTextureNames(wad),
 *     baseMatId: 1000,        // first available id for wall materials
 *   });
 *
 *   atlas.rgba        // Uint8Array, width*height*4 bytes
 *   atlas.width       // atlas width in pixels
 *   atlas.height       // atlas height in pixels
 *   atlas.matIdFor(name)  // → matId (1000..) or null if texture missing
 *   atlas.uvBoxFor(matId) // → { u0, v0, u1, v1 } from material's metadata
 *
 * Side effect: registers one material per packed texture into the
 * global MaterialRegistry. Material color = dominant color (fallback
 * when atlas sampling isn't wired); metadata.uvBox = atlas UV bounds.
 */
export function buildWallAtlas(wad, palette, opts = {}) {
    const decode = opts.decodeWallTexture;
    if (!decode) throw new Error("buildWallAtlas: opts.decodeWallTexture required");
    const baseMatId = opts.baseMatId ?? 1000;
    const names = opts.wallTextureNames;
    if (!names) throw new Error("buildWallAtlas: opts.wallTextureNames required");
    const padding = opts.padding ?? 1;     // 1px gutter between sprites

    // 1. Decode every texture. Skip nulls (texture missing in WAD).
    const decoded = [];
    for (const name of names) {
        const tex = decode(wad, name, palette);
        if (tex && tex.rgba && tex.width > 0 && tex.height > 0) {
            decoded.push({ name, ...tex });
        }
    }
    if (decoded.length === 0) {
        return _emptyAtlas();
    }

    // 2. Sort by height descending for shelf packing.
    decoded.sort((a, b) => b.height - a.height);

    // 3. Try atlas sizes in ascending order. Stop at the first that fits.
    for (const size of ATLAS_SIZES) {
        const placed = _shelfPack(decoded, size, padding);
        if (placed) {
            return _composeAtlas(placed, size, size, baseMatId);
        }
    }

    // 4. Couldn't fit in 4096² — give up gracefully. Caller can
    //    detect by atlas.overflow === true and fall back to v394's
    //    color-only path.
    return { ...(_emptyAtlas()), overflow: true, attemptedTextures: decoded.length };
}

function _shelfPack(items, atlasSize, padding) {
    const placements = [];   // { item, x, y }
    let shelfY = 0, shelfH = 0, shelfX = 0;
    for (const item of items) {
        const w = item.width + padding;
        const h = item.height + padding;
        if (h > atlasSize) return null;      // one tex taller than atlas → fail
        if (shelfX + w > atlasSize) {
            // new shelf
            shelfY += shelfH;
            shelfH = 0;
            shelfX = 0;
        }
        if (shelfY + h > atlasSize) return null;     // out of vertical room
        placements.push({ item, x: shelfX, y: shelfY });
        shelfX += w;
        if (h > shelfH) shelfH = h;
    }
    return placements;
}

function _composeAtlas(placements, width, height, baseMatId) {
    const rgba = new Uint8Array(width * height * 4);
    const matIdMap = new Map();   // texName → matId
    const reg = getMaterialRegistry();
    let nextId = baseMatId;

    for (const p of placements) {
        const { item, x, y } = p;
        // Blit item.rgba into the atlas at (x, y).
        for (let row = 0; row < item.height; row++) {
            const srcOff = row * item.width * 4;
            const dstOff = ((y + row) * width + x) * 4;
            rgba.set(item.rgba.subarray(srcOff, srcOff + item.width * 4), dstOff);
        }
        // UV box (in 0..1 atlas coords). v1 > v0; renderer flips
        // for OpenGL bottom-left origin as needed.
        const u0 = x / width;
        const v0 = y / height;
        const u1 = (x + item.width)  / width;
        const v1 = (y + item.height) / height;
        const matId = nextId++;
        matIdMap.set(item.name, matId);
        // Compute dominant color as the fallback "tint" for this
        // material — used when the renderer can't sample the atlas
        // for some reason.
        const dom = _dominantColor(item.rgba);
        reg.register({
            id: matId,
            r: dom.r / 255,
            g: dom.g / 255,
            b: dom.b / 255,
            name: "WALL_" + item.name,
            meta: { uvBox: { u0, v0, u1, v1 },
                     width: item.width, height: item.height,
                     texName: item.name },
        });
    }

    return {
        rgba,
        width, height,
        matIdMap,
        overflow: false,
        matIdFor: (name) => matIdMap.get(name) ?? null,
        uvBoxFor: (matId) => reg.getMeta(matId)?.uvBox ?? null,
        placedCount: placements.length,
    };
}

function _emptyAtlas() {
    return {
        rgba: new Uint8Array(0),
        width: 0, height: 0,
        matIdMap: new Map(),
        overflow: false,
        matIdFor: () => null,
        uvBoxFor: () => null,
        placedCount: 0,
    };
}

/**
 * Quick dominant-color scan. Cheaper inline copy than the
 * wadPaletteSwap one — avoids a circular import.
 */
function _dominantColor(rgba) {
    const buckets = new Map();
    for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i + 3] < 128) continue;
        const k = ((rgba[i] >> 5) << 6) | ((rgba[i + 1] >> 5) << 3) | (rgba[i + 2] >> 5);
        let e = buckets.get(k);
        if (!e) { e = { r: 0, g: 0, b: 0, n: 0 }; buckets.set(k, e); }
        e.r += rgba[i]; e.g += rgba[i + 1]; e.b += rgba[i + 2]; e.n++;
    }
    let best = null;
    for (const v of buckets.values()) if (!best || v.n > best.n) best = v;
    if (!best) return { r: 128, g: 128, b: 128 };
    return { r: Math.round(best.r / best.n), g: Math.round(best.g / best.n), b: Math.round(best.b / best.n) };
}
