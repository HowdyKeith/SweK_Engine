// FILE: tools/voxParser.js
// VERSION: v1 — round 277
//
// MagicaVoxel .vox file parser. The .vox format is used by MagicaVoxel
// (the de-facto voxel modeling app), cuda_voxelizer, MeshToVox, and
// many other tools — making it the lingua franca of voxel asset
// pipelines. Parsing it lets the engine ingest meshes that were
// voxelized by external tools (TripoSR + cuda_voxelizer, the
// "lightweight local pipeline" approach for GTX 1080 / Pascal cards).
//
// Format reference: https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox.txt
//
// Structure (binary, little-endian):
//   header: "VOX " (4 bytes) + version (i32, usually 150)
//   one MAIN chunk holding sub-chunks:
//     PACK   — number of models (optional; absent = 1)
//     SIZE   — model dimensions xyz (3 × i32)
//     XYZI   — voxel data: count (i32) + (x,y,z,colorIdx) × count
//     RGBA   — 256 color palette (256 × 4 bytes RGBA)
//     ...
//
// Every chunk has:
//   id (4 bytes ASCII) + contentSize (i32) + childrenSize (i32) + content + children
//
// API:
//   const result = parseVox(arrayBuffer);
//   result = {
//     ok: true,
//     models: [ { sizeX, sizeY, sizeZ, voxels: [{x,y,z,c}] } ],
//     palette: [ [r,g,b,a], ... 256 entries ],
//   }

const DEFAULT_PALETTE = (() => {
    // MagicaVoxel's built-in palette when no RGBA chunk is present.
    // First entry is empty (background), rest is a 255-color gradient.
    // We use a simple HSV-ish ramp as a reasonable default; real .vox
    // files almost always carry their own palette so this is rarely hit.
    const p = new Array(256);
    p[0] = [0, 0, 0, 0];
    for (let i = 1; i < 256; i++) {
        const h = ((i - 1) / 255) * 6;
        const f = h - Math.floor(h);
        const r = Math.round(255 * (h < 1 ? 1 : h < 2 ? 1 - f : h < 3 ? 0 : h < 4 ? 0       : h < 5 ? f       : 1));
        const g = Math.round(255 * (h < 1 ? f : h < 2 ? 1     : h < 3 ? 1 : h < 4 ? 1 - f   : h < 5 ? 0       : 0));
        const b = Math.round(255 * (h < 1 ? 0 : h < 2 ? 0     : h < 3 ? f : h < 4 ? 1       : h < 5 ? 1       : 1 - f));
        p[i] = [r, g, b, 255];
    }
    return p;
})();

function readFourCC(view, off) {
    return String.fromCharCode(view.getUint8(off), view.getUint8(off + 1),
                                view.getUint8(off + 2), view.getUint8(off + 3));
}

export function parseVox(buffer) {
    if (!buffer || buffer.byteLength < 16) {
        return { ok: false, error: "buffer too small (< 16 bytes)" };
    }
    const dv = new DataView(buffer);
    // Header: "VOX " + version
    const magic = readFourCC(dv, 0);
    if (magic !== "VOX ") {
        return { ok: false, error: `bad magic "${magic}" — expected "VOX "` };
    }
    const version = dv.getInt32(4, true);
    // MAIN chunk starts at offset 8
    let off = 8;
    const mainId = readFourCC(dv, off);
    if (mainId !== "MAIN") {
        return { ok: false, error: `expected MAIN chunk, got "${mainId}"` };
    }
    off += 4;
    const mainContentSize = dv.getInt32(off, true); off += 4;
    const mainChildSize   = dv.getInt32(off, true); off += 4;
    off += mainContentSize;       // MAIN has no content of its own, just children

    const end = off + mainChildSize;
    const models = [];
    let palette  = null;
    let pendingSize = null;
    while (off < end && off < buffer.byteLength) {
        const id = readFourCC(dv, off); off += 4;
        const cSize = dv.getInt32(off, true); off += 4;
        const chSize = dv.getInt32(off, true); off += 4;
        const contentStart = off;
        if (id === "SIZE") {
            const sx = dv.getInt32(contentStart,     true);
            const sy = dv.getInt32(contentStart + 4, true);
            const sz = dv.getInt32(contentStart + 8, true);
            pendingSize = { sx, sy, sz };
        } else if (id === "XYZI") {
            const n = dv.getInt32(contentStart, true);
            const voxels = new Array(n);
            for (let i = 0; i < n; i++) {
                const base = contentStart + 4 + i * 4;
                voxels[i] = {
                    x: dv.getUint8(base),
                    y: dv.getUint8(base + 1),
                    z: dv.getUint8(base + 2),
                    c: dv.getUint8(base + 3),
                };
            }
            models.push({
                sizeX: pendingSize?.sx ?? 0,
                sizeY: pendingSize?.sy ?? 0,
                sizeZ: pendingSize?.sz ?? 0,
                voxels,
            });
            pendingSize = null;
        } else if (id === "RGBA") {
            palette = new Array(256);
            // .vox palette is 1-indexed; index 0 is reserved. The file
            // stores entries 1..255 in the first 255 slots; entry 256
            // (last byte group) is unused. We mirror this layout —
            // index i in our array corresponds to colorIdx i in voxels.
            palette[0] = [0, 0, 0, 0];   // index 0 = empty
            for (let i = 0; i < 255; i++) {
                const base = contentStart + i * 4;
                palette[i + 1] = [
                    dv.getUint8(base),
                    dv.getUint8(base + 1),
                    dv.getUint8(base + 2),
                    dv.getUint8(base + 3),
                ];
            }
        }
        // Skip past content + (we ignore nested children for now —
        // none of SIZE/XYZI/RGBA have children in practice).
        off += cSize + chSize;
    }
    return {
        ok: true,
        version,
        models,
        palette: palette || DEFAULT_PALETTE,
    };
}

// Convenience: fetch a .vox URL and parse it. Returns the same shape
// as parseVox plus { url } so callers can chain.
export async function loadVoxFromUrl(url) {
    try {
        const r = await fetch(url);
        if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
        const buf = await r.arrayBuffer();
        const out = parseVox(buf);
        out.url = url;
        return out;
    } catch (e) {
        return { ok: false, error: e?.message ?? String(e) };
    }
}
