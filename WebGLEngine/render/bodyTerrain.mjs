// WebGLEngine/render/bodyTerrain.mjs -- v4317 (Level 17); the treemap twin at v4479
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
//
// v4479 -- THE SECOND TWIN: THE TREEMAP. The GitHub Terrain of v4149 (world/repoHeightfield.js) lays a repository out
// as a squarified treemap -- a directory a landmass, a file a peak as tall as log1p(its lines), data files as lakes --
// and stamped it into the voxel world only. repoTerrainOf() below feeds the same function's heights into the same
// RGBA8 field gpuTerrain lifts on both backends, so the landing can show the treemap ground beside the hash hills.
// Two twins, one door (landingFor), each gated: the hills by tools/ship/landing-selfcheck.mjs, the treemap by
// tools/ship/repoLanding-selfcheck.mjs. A LINE IS 80 BYTES: the bake carries bytes and no line counts, and the
// bridge's pseudo-line rule for binaries is 80 bytes; measured over this tree's 5,022 text files at v4479,
// 83,033,401 bytes over 1,029,265 lines is 80.7 -- so one constant serves both kinds, and it is said here.
"use strict";

import { heightfield, chunkRecords, terrainParams, heightAt, RADIUS_PER_HALF } from "./gpuTerrain.mjs";
import { repoHeightfield, buildTree, treemapLeaves, DEFAULTS as REPO_DEFAULTS } from "../world/repoHeightfield.js";
import { OPAQUE_EXT } from "../world/orrery.mjs";

export const BYTES_PER_LINE = 80;   // the bridge's pseudo-line, and this tree's measured mean (80.7) -- see the header
/** The bake's files [{ path, bytes }] as the entries repoHeightfield consumes: lines from bytes, binary by the opacity rule. */
export function entriesFromFiles(files) {
    return (files || []).filter((f) => f && typeof f.path === "string")
        .map((f) => ({ path: f.path, lines: Math.max(1, Math.round(Math.max(0, Number(f.bytes) || 0) / BYTES_PER_LINE)), binary: OPAQUE_EXT.test(f.path) }));
}

/**
 * A body's files as the TREEMAP ground: the same { field, files, params, fileAt, heightAt } shape as bodyHeightfield,
 * so landingRecords and fileOfChunk take either. The field is repoHeightfield's smoothed heights, normalised min..max
 * to 0..1 (red); fileAt is the treemap's own answer -- the leaf whose rectangle contains the point -- and a leaf's
 * `peak` is its rectangle's centre. `repo` carries repoHeightfield's whole result (peaks, lakes, biomes, stats).
 */
export function repoTerrainOf(body, { size = 128, extent = 8, originX = -4, originZ = -4, heightScale = 1.2, ...repoOpts } = {}) {
    const entries = entriesFromFiles(body && body.files);
    if (!entries.length) throw new Error(`bodyTerrain: ${(body && body.name) || "the body"} has no files to land on`);
    const o = Object.assign({}, REPO_DEFAULTS, repoOpts, { grid: size });
    const repo = repoHeightfield(entries, o);
    const span = Math.max(1e-9, repo.max - repo.min);
    const field = heightfield(size, size, (u, v, tx, tz) => (repo.heights[tz * size + tx] - repo.min) / span);
    const m = Math.max(0, Math.min(0.4, o.margin));
    const leaves = treemapLeaves(buildTree(entries), { x: m, y: m, w: 1 - 2 * m, h: 1 - 2 * m })
        .map((l, i) => ({ i, path: l.node.path, lines: l.node.lines, binary: !!l.node.binary, rect: l.rect,
                          water: !!repo.lakes.find((k) => k.path === l.node.path) || false }));
    const files = leaves.map((l) => ({ path: l.path, bytes: (body.files.find((f) => f && f.path === l.path) || {}).bytes || 0 }));
    const params = { originX, originZ, extent, heightScale };
    const uvOf = (x, z) => [(x - originX) / extent, (z - originZ) / extent];
    return { kind: "treemap", field, files, leaves, repo, params, size, entries,
             fileAt(x, z) { const [u, v] = uvOf(x, z); const l = leaves.find((L) => u >= L.rect.x && u < L.rect.x + L.rect.w && v >= L.rect.y && v < L.rect.y + L.rect.h); return l ? files[l.i] : null; },
             heightAt(x, z) { return heightAt(field, params, x, z); },
             /** World (x, z) of a leaf's rectangle centre, and its file. */
             peak(i) { const l = leaves[i]; return { x: originX + (l.rect.x + l.rect.w / 2) * extent, z: originZ + (l.rect.y + l.rect.h / 2) * extent, file: files[i], h: repo.heights[Math.min(size - 1, Math.floor((l.rect.y + l.rect.h / 2) * size)) * size + Math.min(size - 1, Math.floor((l.rect.x + l.rect.w / 2) * size))] }; } };
}

/** One door for the landing: "hills" (bodyHeightfield, the v4317 twin) or "treemap" (repoTerrainOf, the v4149 ground). */
export function landingFor(body, kind = "hills", opts = {}) {
    if (kind === "treemap") return repoTerrainOf(body, opts);
    if (kind === "hills") return Object.assign(bodyHeightfield(body, opts), { kind: "hills" });
    throw new Error(`bodyTerrain: unknown landing kind ${JSON.stringify(kind)} -- "hills" or "treemap"`);
}

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
