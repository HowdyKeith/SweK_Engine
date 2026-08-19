// ai-bridge/wadTextures.cjs
//
// Doom WAD texture decoder. Reads the palette, patches, composite
// texture definitions, and flats from a parsed WAD, decodes them to
// raw RGBA byte arrays ready for the WebGL renderer or D3D11
// CreateTexture2D.
//
// Format references (matches the VBA modWADTextures.bas algorithm):
//
//   PLAYPAL  14 palettes × 256 colors × 3 bytes RGB. Use palette 0.
//
//   PNAMES   uint32 count + count × 8-byte ASCII patch names. The
//            patches themselves are separate lumps named in PNAMES,
//            stored in the column-encoded patch format.
//
//   TEXTURE1 uint32 count + count × uint32 offsets + per-texture:
//   TEXTURE2   {name[8], masked[4], width[2], height[2], colDir[4],
//              patchCount[2], patches[patchCount × 10]}
//            Each patch: {originX[2], originY[2], pNameIdx[2],
//                         stepDir[2], colormap[2]}
//
//   Patch    Header {width[2], height[2], leftOff[2], topOff[2]} +
//            width × uint32 column offsets + columns of posts:
//              {topDelta[1], length[1], pad[1], pixels[length],
//               pad[1], ...} terminated by topDelta == 0xFF.
//            (Two-byte index into PNAMES → 8-char name → lump name.)
//
//   Flat     Found between F_START/F_END markers (or FF_START etc.).
//            64 × 64 raw palette indices = exactly 4096 bytes.
//
// All decode helpers return { width, height, rgba } where rgba is a
// Buffer of (width × height × 4) bytes in RGBA order, alpha = 255 for
// opaque pixels, 0 for unwritten/transparent.

const PALETTE_SIZE_BYTES = 768;
const FLAT_SIZE = 64;

// ============================================================
// Palette
// ============================================================

function readPalette(wad) {
    const lump = wad.lumps.find(l => l.name === "PLAYPAL");
    if (!lump) return null;
    // Palette 0: bytes 0..767, RGB triples
    const buf = wad.buffer;
    const pal = new Uint8Array(256 * 3);
    for (let i = 0; i < 256 * 3; i++) pal[i] = buf[lump.offset + i];
    return pal;
}

// ============================================================
// PNAMES + composite texture definitions
// ============================================================

function readPatchNames(wad) {
    const lump = wad.lumps.find(l => l.name === "PNAMES");
    if (!lump) return [];
    const buf = wad.buffer;
    const count = buf.readUInt32LE(lump.offset);
    const names = [];
    for (let i = 0; i < count; i++) {
        const off = lump.offset + 4 + i * 8;
        let name = buf.toString("ascii", off, off + 8).replace(/\0+$/, "");
        // Doom IWAD has PNAMES entries with leading spaces sometimes —
        // and patches lump names are case-sensitive in the directory
        // but the convention is uppercase
        names.push(name.toUpperCase());
    }
    return names;
}

function readTextureDefs(wad, lumpName) {
    const lump = wad.lumps.find(l => l.name === lumpName);
    if (!lump) return [];
    const buf = wad.buffer;
    const count = buf.readUInt32LE(lump.offset);
    const defs = [];
    for (let i = 0; i < count; i++) {
        const texOff = lump.offset + buf.readUInt32LE(lump.offset + 4 + i * 4);
        const name = buf.toString("ascii", texOff, texOff + 8).replace(/\0+$/, "");
        // masked (4) ignored
        const width  = buf.readUInt16LE(texOff + 12);
        const height = buf.readUInt16LE(texOff + 14);
        // columnDir (4) ignored
        const patchCount = buf.readUInt16LE(texOff + 20);
        const patches = [];
        for (let p = 0; p < patchCount; p++) {
            const pOff = texOff + 22 + p * 10;
            patches.push({
                originX:    buf.readInt16LE(pOff),
                originY:    buf.readInt16LE(pOff + 2),
                pNameIdx:   buf.readUInt16LE(pOff + 4),
                // stepDir, colormap ignored
            });
        }
        defs.push({ name, width, height, patches });
    }
    return defs;
}

// ============================================================
// Patch + composite assembly
// ============================================================

// Find a patch lump by name (uppercase, case-insensitive match)
function findPatchLump(wad, patchName) {
    const upper = patchName.toUpperCase();
    return wad.lumps.find(l => l.name.toUpperCase() === upper);
}

// Decode a single patch into an RGBA buffer (its own dimensions).
// Transparent pixels (gaps between posts) leave alpha = 0.
function decodePatch(wad, palette, patchName) {
    const lump = findPatchLump(wad, patchName);
    if (!lump) return null;
    const buf = wad.buffer;
    const base = lump.offset;
    const width   = buf.readUInt16LE(base);
    const height  = buf.readUInt16LE(base + 2);
    // leftOff, topOff at +4, +6 ignored for our purposes
    const rgba = Buffer.alloc(width * height * 4);   // zeroed = transparent

    for (let col = 0; col < width; col++) {
        const colOff = base + buf.readUInt32LE(base + 8 + col * 4);
        // Walk posts until 0xFF terminator
        let p = colOff;
        // Doom uses a sentinel value 0xFF for "end of column". Some
        // tall patches use the "tall patch" format where post topdeltas
        // accumulate; we handle the standard case here (sufficient for
        // ≤256 tall patches, which is all of Doom + Freedoom).
        while (p < buf.length && buf[p] !== 0xFF) {
            const topDelta   = buf[p];
            const postLength = buf[p + 1];
            // skip 1 byte unused, read postLength bytes, skip 1 byte unused
            const pixelsStart = p + 3;
            for (let row = 0; row < postLength; row++) {
                const y = topDelta + row;
                if (y < 0 || y >= height) continue;
                const palIdx = buf[pixelsStart + row];
                const r = palette[palIdx * 3];
                const g = palette[palIdx * 3 + 1];
                const b = palette[palIdx * 3 + 2];
                const dstIdx = (y * width + col) * 4;
                rgba[dstIdx]     = r;
                rgba[dstIdx + 1] = g;
                rgba[dstIdx + 2] = b;
                rgba[dstIdx + 3] = 255;
            }
            p = pixelsStart + postLength + 1;   // postLength bytes + trailing pad
        }
    }

    return { width, height, rgba };
}

// Build a composite texture from its definition. Iterates the
// texture's patch list, decodes each patch, blits it into the
// destination buffer at (originX, originY).
function buildCompositeTexture(wad, palette, patchNames, texDef) {
    const w = texDef.width, h = texDef.height;
    const out = Buffer.alloc(w * h * 4);
    // Default to opaque black if nothing writes there (composite holes
    // are rare on walls; mark alpha=255 so we don't render transparent
    // backgrounds in the renderer)
    for (let i = 3; i < out.length; i += 4) out[i] = 255;

    for (const p of texDef.patches) {
        const pname = patchNames[p.pNameIdx];
        if (!pname) continue;
        const patch = decodePatch(wad, palette, pname);
        if (!patch) continue;
        // Blit patch.rgba into out at (originX, originY)
        for (let py = 0; py < patch.height; py++) {
            const dy = p.originY + py;
            if (dy < 0 || dy >= h) continue;
            for (let px = 0; px < patch.width; px++) {
                const dx = p.originX + px;
                if (dx < 0 || dx >= w) continue;
                const srcIdx = (py * patch.width + px) * 4;
                if (patch.rgba[srcIdx + 3] === 0) continue;   // transparent
                const dstIdx = (dy * w + dx) * 4;
                out[dstIdx]     = patch.rgba[srcIdx];
                out[dstIdx + 1] = patch.rgba[srcIdx + 1];
                out[dstIdx + 2] = patch.rgba[srcIdx + 2];
                out[dstIdx + 3] = 255;
            }
        }
    }
    return { width: w, height: h, rgba: out };
}

// ============================================================
// Flats (floor / ceiling textures)
// ============================================================

// Find a flat by name. Flats live between F_START/F_END markers
// (and FF_START/FF_END for additional ones). They're 4096 bytes
// each, raw palette indices.
function findFlatLump(wad, flatName) {
    const upper = flatName.toUpperCase();
    let inFlats = false;
    for (const lump of wad.lumps) {
        const n = lump.name.toUpperCase();
        if (n === "F_START" || n === "FF_START") { inFlats = true; continue; }
        if (n === "F_END"   || n === "FF_END")   { inFlats = false; continue; }
        if (inFlats && n === upper && lump.size === FLAT_SIZE * FLAT_SIZE) {
            return lump;
        }
    }
    // Some WADs have F1_START/F1_END subsets; check broader scan
    for (const lump of wad.lumps) {
        if (lump.name.toUpperCase() === upper && lump.size === FLAT_SIZE * FLAT_SIZE) {
            return lump;
        }
    }
    return null;
}

function decodeFlat(wad, palette, flatName) {
    const lump = findFlatLump(wad, flatName);
    if (!lump) return null;
    const buf = wad.buffer;
    const rgba = Buffer.alloc(FLAT_SIZE * FLAT_SIZE * 4);
    for (let i = 0; i < FLAT_SIZE * FLAT_SIZE; i++) {
        const palIdx = buf[lump.offset + i];
        rgba[i * 4]     = palette[palIdx * 3];
        rgba[i * 4 + 1] = palette[palIdx * 3 + 1];
        rgba[i * 4 + 2] = palette[palIdx * 3 + 2];
        rgba[i * 4 + 3] = 255;
    }
    return { width: FLAT_SIZE, height: FLAT_SIZE, rgba };
}

// ============================================================
// Feature texture selection
// ============================================================

// Pick a "good-looking" wall texture and floor flat for the level.
// Prefers known classic names; falls back to whatever's available.
function selectFeatureTextures(wad) {
    if (!wad) return null;
    const palette = readPalette(wad);
    if (!palette) return null;
    const patchNames = readPatchNames(wad);
    const texDefs = [
        ...readTextureDefs(wad, "TEXTURE1"),
        ...readTextureDefs(wad, "TEXTURE2"),
    ];

    // Preferred wall textures in order — strong sci-fi techbase look
    const wallPrefs = [
        "STARTAN3", "STARTAN2", "STARTAN1",
        "BIGDOOR2", "BIGDOOR1",
        "BROWN1", "BROWN144", "BROWNHUG",
        "ZIMMER1", "ZIMMER2",
        "STONE", "STONE2", "STONE3",
        "COMPSTA1", "COMPWERD", "COMPUTE1",
    ];
    let wallTex = null;
    for (const name of wallPrefs) {
        const def = texDefs.find(d => d.name.toUpperCase() === name);
        if (def) {
            const built = buildCompositeTexture(wad, palette, patchNames, def);
            if (built) { wallTex = { name, ...built }; break; }
        }
    }
    if (!wallTex && texDefs.length > 0) {
        // First available
        const def = texDefs[0];
        const built = buildCompositeTexture(wad, palette, patchNames, def);
        if (built) wallTex = { name: def.name, ...built };
    }

    // Preferred floor flats
    const flatPrefs = [
        "FLOOR4_8", "FLOOR0_3", "FLOOR1_1", "FLOOR3_3",
        "FLAT5",  "FLAT5_4", "FLAT14",
        "MFLR8_1", "MFLR8_2", "MFLR8_3",
        "TLITE6_4", "TLITE6_5",
        "FLOOR5_2", "FLOOR5_3",
    ];
    let floorTex = null;
    for (const name of flatPrefs) {
        const decoded = decodeFlat(wad, palette, name);
        if (decoded) { floorTex = { name, ...decoded }; break; }
    }
    if (!floorTex) {
        // Walk flat markers and grab the first one we find
        let inFlats = false;
        for (const lump of wad.lumps) {
            const n = lump.name.toUpperCase();
            if (n === "F_START" || n === "FF_START") { inFlats = true; continue; }
            if (n === "F_END"   || n === "FF_END")   { inFlats = false; continue; }
            if (inFlats && lump.size === FLAT_SIZE * FLAT_SIZE) {
                const decoded = decodeFlat(wad, palette, lump.name);
                if (decoded) { floorTex = { name: lump.name, ...decoded }; break; }
            }
        }
    }

    return { wall: wallTex, floor: floorTex, source: "wad" };
}

// ============================================================
// Procedural fallback textures
// ============================================================

// Generate a 256×128 Doom-toned brick wall (warm gray/brown bricks,
// dark mortar) and a 64×64 floor tile (grungy tan). Mimics the look
// and feel of STARTAN3-era textures without needing a WAD.
function buildFallbackTextures() {
    return {
        wall:  buildProceduralBrick(256, 128),
        floor: buildProceduralFloor(64, 64),
        source: "procedural",
    };
}

function buildProceduralBrick(w, h) {
    const rgba = Buffer.alloc(w * h * 4);
    const brickW = 64, brickH = 16;
    // Mortar background
    for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = 28; rgba[i + 1] = 22; rgba[i + 2] = 18; rgba[i + 3] = 255;
    }
    // Brick faces
    for (let row = 0; row < Math.ceil(h / brickH) + 1; row++) {
        const xoff = row % 2 ? brickW / 2 : 0;
        for (let col = -1; col < Math.ceil(w / brickW) + 1; col++) {
            const x0 = col * brickW + xoff + 2;
            const y0 = row * brickH + 1;
            const x1 = Math.min(w, x0 + brickW - 4);
            const y1 = Math.min(h, y0 + brickH - 2);
            // Color variation per brick (deterministic for repeat tiling)
            const seed = ((row * 31 + col) * 17) & 0xff;
            const baseR = 100 + (seed % 35);
            const baseG = 80  + ((seed * 3) % 28);
            const baseB = 60  + ((seed * 7) % 22);
            for (let y = Math.max(0, y0); y < y1; y++) {
                for (let x = Math.max(0, x0); x < x1; x++) {
                    // Subtle texture noise via cheap hash
                    const n = ((x * 911 + y * 113) & 0x1f) - 16;
                    const i = (y * w + x) * 4;
                    rgba[i]     = Math.max(0, Math.min(255, baseR + n));
                    rgba[i + 1] = Math.max(0, Math.min(255, baseG + n));
                    rgba[i + 2] = Math.max(0, Math.min(255, baseB + n));
                    rgba[i + 3] = 255;
                }
            }
        }
    }
    return { name: "TEST_BRICK", width: w, height: h, rgba };
}

function buildProceduralFloor(w, h) {
    const rgba = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            // Tile grid every 32 px with grunge
            const gx = x % 32, gy = y % 32;
            const isEdge = gx < 1 || gx > 30 || gy < 1 || gy > 30;
            const baseR = isEdge ? 40 : 95;
            const baseG = isEdge ? 32 : 82;
            const baseB = isEdge ? 25 : 65;
            const n = (((x * 547) ^ (y * 311)) & 0x1f) - 16;
            const i = (y * w + x) * 4;
            rgba[i]     = Math.max(0, Math.min(255, baseR + n));
            rgba[i + 1] = Math.max(0, Math.min(255, baseG + n));
            rgba[i + 2] = Math.max(0, Math.min(255, baseB + n));
            rgba[i + 3] = 255;
        }
    }
    return { name: "TEST_FLOOR", width: w, height: h, rgba };
}

module.exports = {
    readPalette,
    readPatchNames,
    readTextureDefs,
    decodePatch,
    buildCompositeTexture,
    decodeFlat,
    selectFeatureTextures,
    buildFallbackTextures,
};
