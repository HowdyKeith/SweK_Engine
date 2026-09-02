// WebGLEngine/render/bodyTerrain.mjs -- v4317 (Level 17)
//
// LEVEL 17: LANDING ON A PLANET -- the terrain meets the orrery. A body in the orrery is a vendored repository and
// its files are known (orrery.json carries them with their sizes). Past the zoom threshold the body becomes a
// HEIGHTFIELD OF ITS OWN FILE TREE: every file is a hill at a place hashed from its path, as tall as the log of
// its bytes and as wide as its share of the repository, summed into the same RGBA8 field render/gpuTerrain.mjs
// draws (red = height), with the same LOD ladder, skirts, light and pick pipeline. And because every texel
// remembers WHICH file's hill stands tallest there, pointing at a ridge names the file: pick a chunk, take its
// centre, ask fileAt(). Two consumers become one scene.
//
// The hash is FNV-1a over the path, so the same repository lands the same way on every machine and the gate's
// "the pick names the file whose bytes made the ridge" is a fact about the path, not about a random draw.
"use strict";

import { heightfield, chunkRecords, terrainParams, heightAt, RADIUS_PER_HALF } from "./gpuTerrain.mjs";

const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
/** Where a file's hill stands: (u, v) in [0.08, 0.92] from two hashes of its path, so no hill sits on the edge. */
export function hillOf(path) { const h = fnv(String(path)), h2 = fnv(String(path) + "/v"); return { u: 0.08 + 0.84 * (h / 4294967296), v: 0.08 + 0.84 * (h2 / 4294967296) }; }

/**
 * A body's files as hills: { field, owners, files, params, fileAt(x, z), hillAt(i) }. `size` texels a side; the
 * field's extent is `extent` world units square from (originX, originZ). Height 0..1: the tallest file is 1.
 */
export function bodyHeightfield(body, { size = 64, extent = 8, originX = -4, originZ = -4, heightScale = 1.2, floor = 0.05 } = {}) {
    const files = (body.files || []).filter((f) => f && f.path).map((f) => ({ path: f.path, bytes: Math.max(1, f.bytes || 1) }));
    if (!files.length) throw new Error(`bodyTerrain: ${body.name || "the body"} has no files to land on`);
    const total = files.reduce((a, f) => a + f.bytes, 0), maxLog = Math.max(...files.map((f) => Math.log2(f.bytes + 1)));
    const hills = files.map((f, i) => { const at = hillOf(f.path); return { i, path: f.path, bytes: f.bytes, u: at.u, v: at.v, h: Math.log2(f.bytes + 1) / maxLog, r: 0.03 + 0.25 * Math.sqrt(f.bytes / total) }; });
    const owners = new Int32Array(size * size).fill(-1), best = new Float32Array(size * size);
    const field = heightfield(size, size, (u, v, tx, tz) => {
        let sum = floor, top = 0, who = -1;
        for (const hl of hills) { const d2 = ((u - hl.u) ** 2 + (v - hl.v) ** 2) / (hl.r * hl.r); const c = hl.h * Math.exp(-2 * d2); sum += c; if (c > top) { top = c; who = hl.i; } }
        owners[tz * size + tx] = top > 0.02 ? who : -1; best[tz * size + tx] = top;
        return Math.min(1, sum);
    });
    const params = { originX, originZ, extent, heightScale };
    const texelOf = (x, z) => { const u = (x - originX) / extent, v = (z - originZ) / extent; return [Math.max(0, Math.min(size - 1, Math.floor(u * size))), Math.max(0, Math.min(size - 1, Math.floor(v * size)))]; };
    return { field, owners, files, hills, params, size,
             fileAt(x, z) { const [tx, tz] = texelOf(x, z); const i = owners[tz * size + tx]; return i < 0 ? null : files[i]; },
             heightAt(x, z) { return heightAt(field, params, x, z); },
             /** World (x, z) of a hill's peak, and its file. */
             peak(i) { const hl = hills[i]; return { x: originX + hl.u * extent, z: originZ + hl.v * extent, file: files[i], h: hl.h }; } };
}
/** The landing scene's records and params for a body field: chunks over the field, the LOD ladder shared with gpuTerrain. */
export function landingRecords(bt, side = 8) { return { records: chunkRecords(bt.params, side), params: terrainParams(bt.params), side, chunkExtent: bt.params.extent / side }; }
/** The chunk a pick named -> its centre -> the file there. */
export function fileOfChunk(bt, side, chunkId) { const i = chunkId % side, j = Math.floor(chunkId / side), cx = bt.params.originX + (i + 0.5) * bt.params.extent / side, cz = bt.params.originZ + (j + 0.5) * bt.params.extent / side; return { file: bt.fileAt(cx, cz), x: cx, z: cz, height: bt.heightAt(cx, cz) }; }
export { RADIUS_PER_HALF };
