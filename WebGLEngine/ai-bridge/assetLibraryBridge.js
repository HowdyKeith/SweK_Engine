// FILE: ai-bridge/assetLibraryBridge.js
// VERSION: v1 (v799 — Universal Asset Library)
//
// Cross-client shared asset library. Phone, PC, Shield all hit the
// same bridge endpoints; the bridge is the single source of truth.
//
// Storage layout:
//   ai-bridge/asset_library/
//     manifest.json                  — aggregated metadata
//     <id>/
//       data.<ext>                   — the asset's binary data (voxel grid, mesh, etc.)
//       meta.json                    — per-asset metadata (name, source, orientation, type, tags, capturedAt)
//
// Asset record shape (in manifest and meta.json):
//   {
//     id: "spider_007",              // unique, generated on first store
//     name: "Drunken Elephant",      // display name, user-renameable
//     type: "voxel" | "mesh" | "splat" | "image" | "other",
//     source: "gemini" | "kaggle" | "local" | "captured",
//     orientation: {                  // optional override for "forward" face
//       forward: "+x" | "-x" | "+y" | "-y" | "+z" | "-z",
//       up: "+y" | "-y" | "+z" | "-z",
//     },
//     dataExt: "json" | "ply" | "obj" | "png" | "bin",
//     bytes: 12345,                   // size of data file
//     capturedAt: 1717449600000,
//     tags: ["spider", "kaggle-batch-3"],   // optional user tags
//   }

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { EventEmitter } = require("events");

// v1632 — the cataloged library now lives in the EXTERNAL assets folder when one is set, so it never bloats
// the versioned engine tree (that in-tree asset_library was the multi-GB culprit). Resolved per call, so it
// self-heals the instant an external folder is set or the boot migration finishes lifting the old library out.
// Falls back to in-tree only until an external folder exists. server.js injects getExternalDir via init().
let _extGetter = null;
function init(opts) { if (opts && typeof opts.getExternalDir === "function") _extGetter = opts.getExternalDir; return { ok: true, dir: libDir() }; }
function libDir() { try { const ext = _extGetter ? String(_extGetter() || "").trim() : ""; if (ext) return path.join(ext, "asset_library"); } catch {} return path.join(__dirname, "asset_library"); }
function manifestPath() { return path.join(libDir(), "manifest.json"); }

// v801 — event bus for SSE. Bridge clients subscribe to /assets/events
// and receive {event, id?, name?} pings on every mutation so their panels
// can auto-refresh.
const _bus = new EventEmitter();
_bus.setMaxListeners(50);    // up from default 10 — multiple clients can subscribe
function _emit(event, payload = {}) {
    _bus.emit("mutation", { event, ...payload, ts: Date.now() });
}
function subscribe(listener) { _bus.on("mutation", listener); return () => _bus.off("mutation", listener); }

// v808 — parse a GLB buffer's JSON chunk to extract vertex + triangle counts.
// v809 — also extract bounding box from POSITION accessor's min/max arrays
// (when present in the gltf — standard requires them for POSITION).
// Returns { vertexCount, triCount, bbox: {min:[x,y,z], max:[x,y,z]} } or null.
function _parseGLBStats(buf) {
    try {
        if (buf.byteLength < 20) return null;
        const view = new DataView(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength);
        const magic = view.getUint32(0, true);
        if (magic !== 0x46546C67) return null;     // 'glTF'
        const jsonLen = view.getUint32(12, true);
        const jsonType = view.getUint32(16, true);
        if (jsonType !== 0x4E4F534A) return null;  // 'JSON'
        if (20 + jsonLen > buf.byteLength) return null;
        const jsonBytes = new Uint8Array(buf.buffer || buf, (buf.byteOffset || 0) + 20, jsonLen);
        const jsonStr = new TextDecoder().decode(jsonBytes);
        const gltf = JSON.parse(jsonStr);
        let vertexCount = 0, triCount = 0;
        // v809 — union of all POSITION accessor min/max as bbox
        let bboxMin = null, bboxMax = null;
        for (const mesh of gltf.meshes || []) {
            for (const prim of mesh.primitives || []) {
                const posIdx = prim.attributes?.POSITION;
                if (posIdx != null && gltf.accessors?.[posIdx]) {
                    const acc = gltf.accessors[posIdx];
                    vertexCount += acc.count || 0;
                    if (Array.isArray(acc.min) && acc.min.length >= 3 &&
                        Array.isArray(acc.max) && acc.max.length >= 3) {
                        if (!bboxMin) { bboxMin = acc.min.slice(0, 3); bboxMax = acc.max.slice(0, 3); }
                        else {
                            for (let i = 0; i < 3; i++) {
                                if (acc.min[i] < bboxMin[i]) bboxMin[i] = acc.min[i];
                                if (acc.max[i] > bboxMax[i]) bboxMax[i] = acc.max[i];
                            }
                        }
                    }
                }
                if (prim.indices != null && gltf.accessors?.[prim.indices]) {
                    triCount += Math.floor((gltf.accessors[prim.indices].count || 0) / 3);
                } else if (posIdx != null && gltf.accessors?.[posIdx]) {
                    triCount += Math.floor((gltf.accessors[posIdx].count || 0) / 3);
                }
            }
        }
        const result = { vertexCount, triCount };
        if (bboxMin && bboxMax) result.bbox = { min: bboxMin, max: bboxMax };
        return result;
    } catch (e) {
        return null;
    }
}

// v808 — parse a PLY header to extract vertex count.
// Returns { vertexCount } or null if not valid PLY.
function _parsePLYStats(buf) {
    try {
        const head = new TextDecoder("utf-8", { fatal: false })
            .decode(new Uint8Array(buf.buffer || buf, buf.byteOffset || 0, Math.min(16384, buf.byteLength)));
        if (!head.startsWith("ply")) return null;
        const endIdx = head.indexOf("end_header");
        if (endIdx === -1) return null;
        const headerLines = head.substring(0, endIdx).split(/\r?\n/);
        let vertexCount = 0;
        for (const line of headerLines) {
            const m = /^element\s+vertex\s+(\d+)/.exec(line.trim());
            if (m) { vertexCount = parseInt(m[1], 10); break; }
        }
        return { vertexCount };
    } catch (e) {
        return null;
    }
}

// v808 — count voxels in a parsed voxel data object
function _parseVoxelStats(data) {
    try {
        if (Array.isArray(data?.voxels)) return { voxelCount: data.voxels.length };
        return null;
    } catch (e) { return null; }
}

// v816 — validate + count bones in a rig JSON object. A rig has shape:
//   { bones: [{ id, name?, position: [x,y,z], parent: -1|<id>, rotation?: [x,y,z,w] }] }
// Validates each bone has an id + position. Returns null if structure is
// invalid so add() can reject the asset.
function _parseRigStats(data) {
    try {
        if (!data || !Array.isArray(data.bones) || data.bones.length === 0) return null;
        const seenIds = new Set();
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        let rootCount = 0;
        for (const b of data.bones) {
            if (b?.id == null) return null;                // every bone needs an id
            if (seenIds.has(b.id)) return null;             // unique ids
            seenIds.add(b.id);
            if (!Array.isArray(b.position) || b.position.length !== 3) return null;
            const [x, y, z] = b.position;
            if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return null;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
            if (b.parent == null || b.parent === -1) rootCount++;
        }
        // Verify parent references resolve (root bones excluded)
        for (const b of data.bones) {
            if (b.parent != null && b.parent !== -1 && !seenIds.has(b.parent)) return null;
        }
        if (rootCount === 0) return null;                  // a rig must have at least one root
        return {
            boneCount: data.bones.length,
            rootCount,
            bbox: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
        };
    } catch (e) { return null; }
}

// v818 — validate animation clip JSON. Shape:
//   { duration: <seconds>, bones: [{ id, frames: [{ t, position?, rotation? }] }] }
// Returns { boneCount, totalFrames, duration } or null on bad shape.
function _parseClipStats(data) {
    try {
        if (!data || typeof data !== "object") return null;
        const duration = Number(data.duration);
        if (!isFinite(duration) || duration <= 0) return null;
        if (!Array.isArray(data.bones)) return null;
        if (data.bones.length === 0) return null;
        let totalFrames = 0;
        const seenBoneIds = new Set();
        for (const track of data.bones) {
            if (!track || track.id == null) return null;
            if (seenBoneIds.has(track.id)) return null;       // one track per bone
            seenBoneIds.add(track.id);
            if (!Array.isArray(track.frames) || track.frames.length === 0) return null;
            // Frames must be sorted by t, each in [0, duration]
            let prevT = -Infinity;
            for (const f of track.frames) {
                if (!f || !isFinite(f.t)) return null;
                if (f.t < 0 || f.t > duration) return null;
                if (f.t < prevT) return null;               // out of order
                prevT = f.t;
                if (f.position && (!Array.isArray(f.position) || f.position.length !== 3)) return null;
                if (f.rotation && (!Array.isArray(f.rotation) || f.rotation.length !== 4)) return null;
                if (!f.position && !f.rotation) return null;  // a keyframe must define something
                totalFrames++;
            }
        }
        return {
            boneCount: data.bones.length,
            totalFrames,
            duration,
        };
    } catch (e) { return null; }
}

// v810 — OBJ stats: count "v " (vertex) and "f " (face) prefix lines.
// Single text scan, no full OBJ parse needed.
function _parseOBJStats(text) {
    try {
        if (typeof text !== "string") return null;
        let vertexCount = 0, triCount = 0;
        // Walk lines; cheap state-machine scan
        let lineStart = 0;
        for (let i = 0; i <= text.length; i++) {
            if (i === text.length || text.charCodeAt(i) === 10) {     // newline or end
                const ch0 = text.charCodeAt(lineStart);
                const ch1 = text.charCodeAt(lineStart + 1);
                if (ch0 === 118 /*'v'*/ && ch1 === 32 /*' '*/) vertexCount++;
                else if (ch0 === 102 /*'f'*/ && ch1 === 32) {
                    // Face: count vertices after 'f ', triangulate as needed.
                    // Tri = (verts - 2). Quick split — counts space-separated tokens.
                    let tokens = 0, j = lineStart + 2, prevSpace = true;
                    while (j < i) {
                        const c = text.charCodeAt(j);
                        if (c === 32 || c === 9) { prevSpace = true; }
                        else { if (prevSpace) tokens++; prevSpace = false; }
                        j++;
                    }
                    if (tokens >= 3) triCount += tokens - 2;
                }
                lineStart = i + 1;
            }
        }
        if (vertexCount === 0 && triCount === 0) return null;
        return { vertexCount, triCount };
    } catch (e) { return null; }
}

// v811 — Sample actual vertex positions from a GLB binary chunk.
// v812 — When indices accessor is present, sample triangles + extract edges.
// v813 — Iterate ALL primitives across ALL meshes. Triangle budget
// distributed proportionally so a small primitive in a big mesh still
// gets some representation. Vertices keyed by (primIdx, vertIdx) so
// the same vertex index in different primitives isn't confused.
function _extractGLBPositionSample(buf, opts = {}) {
    const maxTris = opts.maxTris || 90;
    const maxPoints = opts.maxPoints || 220;
    try {
        if (buf.byteLength < 28) return null;
        const view = new DataView(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength);
        const magic = view.getUint32(0, true);
        if (magic !== 0x46546C67) return null;
        const jsonLen = view.getUint32(12, true);
        if (view.getUint32(16, true) !== 0x4E4F534A) return null;
        const jsonStr = new TextDecoder().decode(
            new Uint8Array(buf.buffer || buf, (buf.byteOffset || 0) + 20, jsonLen));
        const gltf = JSON.parse(jsonStr);

        const binChunkStart = 20 + jsonLen;
        if (binChunkStart + 8 > buf.byteLength) return null;
        const binLen = view.getUint32(binChunkStart, true);
        if (view.getUint32(binChunkStart + 4, true) !== 0x004E4942) return null;
        const binDataStart = binChunkStart + 8;
        if (binDataStart + binLen > buf.byteLength) return null;

        const meshes = gltf.meshes || [];
        if (meshes.length === 0) return null;

        // v813 — first pass: enumerate every (meshIdx, primIdx) combination,
        // validate its POSITION accessor, count its triangles. We'll allocate
        // triangle budget proportionally.
        const primList = [];
        let totalTris = 0;
        let primGlobalIdx = 0;
        for (let mi = 0; mi < meshes.length; mi++) {
            for (const prim of (meshes[mi].primitives || [])) {
                const posIdx = prim.attributes?.POSITION;
                if (posIdx == null) { primGlobalIdx++; continue; }
                const posAcc = gltf.accessors?.[posIdx];
                if (!posAcc || posAcc.componentType !== 5126 || posAcc.type !== "VEC3") { primGlobalIdx++; continue; }
                const posBv = gltf.bufferViews?.[posAcc.bufferView];
                if (!posBv) { primGlobalIdx++; continue; }
                const posByteOffsetAbs = binDataStart + (posBv.byteOffset || 0) + (posAcc.byteOffset || 0);
                const posStride = posBv.byteStride || 12;
                if (posByteOffsetAbs + posAcc.count * posStride > buf.byteLength) { primGlobalIdx++; continue; }

                let idxInfo = null;
                if (prim.indices != null && gltf.accessors?.[prim.indices]) {
                    const idxAcc = gltf.accessors[prim.indices];
                    const idxBv = gltf.bufferViews?.[idxAcc.bufferView];
                    if (idxBv) {
                        const idxByteOffsetAbs = binDataStart + (idxBv.byteOffset || 0) + (idxAcc.byteOffset || 0);
                        let compSize = null;
                        if (idxAcc.componentType === 5121) compSize = 1;
                        else if (idxAcc.componentType === 5123) compSize = 2;
                        else if (idxAcc.componentType === 5125) compSize = 4;
                        if (compSize && idxByteOffsetAbs + idxAcc.count * compSize <= buf.byteLength) {
                            idxInfo = { byteOffset: idxByteOffsetAbs, compSize, count: idxAcc.count };
                        }
                    }
                }

                const triCount = idxInfo
                    ? Math.floor(idxInfo.count / 3)
                    : Math.floor(posAcc.count / 3);
                primList.push({
                    primGlobalIdx: primGlobalIdx,
                    posAcc, posByteOffsetAbs, posStride,
                    idxInfo, triCount,
                });
                totalTris += triCount;
                primGlobalIdx++;
            }
        }
        if (primList.length === 0) return null;

        // Build unified geom: unique-vertex Map keyed by "primIdx:vertIdx"
        const uniqueVerts = new Map();       // key -> [posIdx, [x,y,z]]
        const edges = [];
        let totalSourceVerts = 0;

        // Helper to compose a reader for a primitive's positions
        const _makeReader = (p) => {
            const dv = new DataView(buf.buffer || buf,
                (buf.byteOffset || 0) + p.posByteOffsetAbs,
                p.posAcc.count * p.posStride);
            return (vi) => [
                dv.getFloat32(vi * p.posStride, true),
                dv.getFloat32(vi * p.posStride + 4, true),
                dv.getFloat32(vi * p.posStride + 8, true),
            ];
        };
        const _slot = (primKey, vi, pos) => {
            const k = primKey + ":" + vi;
            if (!uniqueVerts.has(k)) {
                uniqueVerts.set(k, [uniqueVerts.size, pos]);
            }
            return uniqueVerts.get(k)[0];
        };

        for (const p of primList) {
            if (uniqueVerts.size >= maxPoints) break;
            totalSourceVerts += p.posAcc.count;
            const readPos = _makeReader(p);
            const primKey = String(p.primGlobalIdx);

            // Triangle budget for this primitive — at least 1 if it has any
            const primBudget = Math.max(
                1, Math.round(maxTris * (p.triCount / Math.max(1, totalTris)))
            );

            if (p.idxInfo) {
                // Indexed triangles — sample edges
                const idxDv = new DataView(buf.buffer || buf,
                    (buf.byteOffset || 0) + p.idxInfo.byteOffset);
                const readIdx = p.idxInfo.compSize === 2
                    ? (n) => idxDv.getUint16(n * 2, true)
                    : p.idxInfo.compSize === 4
                        ? (n) => idxDv.getUint32(n * 4, true)
                        : (n) => idxDv.getUint8(n);
                const triStep = Math.max(1, Math.floor(p.triCount / primBudget));
                for (let t = 0; t < p.triCount; t += triStep) {
                    if (uniqueVerts.size >= maxPoints) break;
                    const i0 = readIdx(t * 3);
                    const i1 = readIdx(t * 3 + 1);
                    const i2 = readIdx(t * 3 + 2);
                    const a = _slot(primKey, i0, readPos(i0));
                    const b = _slot(primKey, i1, readPos(i1));
                    const c = _slot(primKey, i2, readPos(i2));
                    edges.push([a, b], [b, c], [c, a]);
                }
            } else {
                // No indices — every 3 positions form a triangle
                const triStep = Math.max(1, Math.floor(p.triCount / primBudget));
                for (let t = 0; t < p.triCount; t += triStep) {
                    if (uniqueVerts.size >= maxPoints) break;
                    const i0 = t * 3;
                    const i1 = t * 3 + 1;
                    const i2 = t * 3 + 2;
                    const a = _slot(primKey, i0, readPos(i0));
                    const b = _slot(primKey, i1, readPos(i1));
                    const c = _slot(primKey, i2, readPos(i2));
                    edges.push([a, b], [b, c], [c, a]);
                }
            }
        }

        if (uniqueVerts.size < 4) return null;

        // Materialize points array indexed by slot
        const points = new Array(uniqueVerts.size);
        for (const [, [slot, p]] of uniqueVerts) {
            points[slot] = [+p[0].toFixed(4), +p[1].toFixed(4), +p[2].toFixed(4)];
        }
        // Compute bbox from sampled points
        const bbox = _bboxOfPoints(points);

        return {
            points,
            edges: edges.length > 0 ? edges : undefined,
            bbox,
            sourceVertCount: totalSourceVerts,
            sourceTriCount: totalTris,
            primitiveCount: primList.length,           // v813 — diagnostic
        };
    } catch (e) { return null; }
}

// Helper: bounding box of an array of [x,y,z] points
function _bboxOfPoints(points) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const [x, y, z] of points) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

// v811 — Sample actual splat positions from binary PLY data.
// v812 — Stratified-grid sampling for cleaner silhouettes (vs every-Nth
// uniform). First pass computes bbox; second pass buckets vertices into
// a 3D grid and keeps one per cell. Boundary cells get representation.
function _extractPLYPositionSample(buf, opts = {}) {
    const maxPoints = opts.maxPoints || 220;
    try {
        const arr = buf instanceof Buffer ? buf : Buffer.from(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength);
        const headBytes = arr.slice(0, Math.min(32768, arr.length));
        const head = headBytes.toString("utf-8");
        if (!head.startsWith("ply")) return null;
        if (!head.includes("format binary_little_endian")) return null;
        const endHeaderIdx = head.indexOf("end_header");
        if (endHeaderIdx === -1) return null;
        const nlAfter = head.indexOf("\n", endHeaderIdx);
        if (nlAfter === -1) return null;
        const headerByteLen = Buffer.byteLength(head.substring(0, nlAfter + 1), "utf-8");

        const headerLines = head.substring(0, endHeaderIdx).split(/\r?\n/);
        let vertexCount = 0;
        let propCount = 0;
        let inVertexElement = false;
        for (const raw of headerLines) {
            const line = raw.trim();
            const em = /^element\s+(\w+)\s+(\d+)/.exec(line);
            if (em) {
                inVertexElement = (em[1] === "vertex");
                if (inVertexElement) vertexCount = parseInt(em[2], 10);
                continue;
            }
            if (inVertexElement && /^property\s+float\s/.test(line)) propCount++;
        }
        if (vertexCount < 4 || propCount < 3) return null;
        const stride = propCount * 4;
        if (headerByteLen + vertexCount * stride > arr.length) return null;

        // First pass: compute bbox
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < vertexCount; i++) {
            const base = headerByteLen + i * stride;
            const x = arr.readFloatLE(base);
            const y = arr.readFloatLE(base + 4);
            const z = arr.readFloatLE(base + 8);
            if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        const rx = maxX - minX || 1, ry = maxY - minY || 1, rz = maxZ - minZ || 1;

        // Second pass: stratified grid bucketing — one vertex per cell
        const gridSize = Math.max(3, Math.ceil(Math.cbrt(maxPoints)));
        const cells = new Map();
        for (let i = 0; i < vertexCount; i++) {
            if (cells.size >= maxPoints) break;
            const base = headerByteLen + i * stride;
            const x = arr.readFloatLE(base);
            const y = arr.readFloatLE(base + 4);
            const z = arr.readFloatLE(base + 8);
            if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
            const gi = Math.min(gridSize - 1, Math.max(0, Math.floor((x - minX) / rx * gridSize)));
            const gj = Math.min(gridSize - 1, Math.max(0, Math.floor((y - minY) / ry * gridSize)));
            const gk = Math.min(gridSize - 1, Math.max(0, Math.floor((z - minZ) / rz * gridSize)));
            const key = gi * gridSize * gridSize + gj * gridSize + gk;
            if (!cells.has(key)) cells.set(key, [+x.toFixed(4), +y.toFixed(4), +z.toFixed(4)]);
        }
        const points = [...cells.values()];
        if (points.length < 4) return null;
        return {
            points,
            bbox: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
            sourceVertCount: vertexCount,
        };
    } catch (e) { return null; }
}

// v810 — ZIP archive writer (STORED method, no compression). Builds a
// valid .zip buffer from a list of {name, bytes} entries. Pure Node.
//
// Spec ref: PKWARE APPNOTE — local file header + central directory + EOCD.
// We use STORED (no compression) for simplicity; the files are already
// largely binary (.glb / .ply / .png / .json) and don't compress much.

const _CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();
function _crc32(buf) {
    let c = 0xFFFFFFFF;
    const len = buf.length;
    for (let i = 0; i < len; i++) c = _CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

// v815 — incremental CRC32 for streaming file reads. _crc32Init seeds a
// state; _crc32Update folds in a chunk; _crc32Finalize XORs out + masks
// to a uint32. Compatible with the one-shot _crc32 — same polynomial,
// same final XOR.
function _crc32Init() { return 0xFFFFFFFF; }
function _crc32Update(c, buf) {
    const len = buf.length;
    for (let i = 0; i < len; i++) c = _CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return c;
}
function _crc32Finalize(c) { return (c ^ 0xFFFFFFFF) >>> 0; }

function _dosTimeDate(d = new Date()) {
    const time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((d.getSeconds() / 2) & 0x1F);
    const date = (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0xF) << 5) | (d.getDate() & 0x1F);
    return { time, date };
}

function _buildZip(entries) {
    const localChunks = [];        // local file headers + data
    const centralChunks = [];      // central directory entries
    let offset = 0;
    const { time, date } = _dosTimeDate();
    for (const e of entries) {
        const nameBuf = Buffer.from(e.name, "utf-8");
        const data = e.bytes instanceof Buffer ? e.bytes : Buffer.from(e.bytes);
        const crc = _crc32(data);
        const size = data.length;

        // Local file header (30 bytes + name + 0 extra)
        const lf = Buffer.alloc(30);
        lf.writeUInt32LE(0x04034b50, 0);
        lf.writeUInt16LE(20, 4);          // version needed
        lf.writeUInt16LE(0, 6);            // flags
        lf.writeUInt16LE(0, 8);            // STORED
        lf.writeUInt16LE(time, 10);
        lf.writeUInt16LE(date, 12);
        lf.writeUInt32LE(crc, 14);
        lf.writeUInt32LE(size, 18);        // compressed size = uncompressed
        lf.writeUInt32LE(size, 22);
        lf.writeUInt16LE(nameBuf.length, 26);
        lf.writeUInt16LE(0, 28);           // extra len
        localChunks.push(lf, nameBuf, data);
        const localOffset = offset;
        offset += lf.length + nameBuf.length + data.length;

        // Central directory entry (46 bytes + name)
        const cd = Buffer.alloc(46);
        cd.writeUInt32LE(0x02014b50, 0);
        cd.writeUInt16LE(0x0314, 4);       // version made by (Unix + zip 20)
        cd.writeUInt16LE(20, 6);            // version needed
        cd.writeUInt16LE(0, 8);
        cd.writeUInt16LE(0, 10);
        cd.writeUInt16LE(time, 12);
        cd.writeUInt16LE(date, 14);
        cd.writeUInt32LE(crc, 16);
        cd.writeUInt32LE(size, 20);
        cd.writeUInt32LE(size, 24);
        cd.writeUInt16LE(nameBuf.length, 28);
        cd.writeUInt16LE(0, 30);            // extra len
        cd.writeUInt16LE(0, 32);            // comment len
        cd.writeUInt16LE(0, 34);            // disk number start
        cd.writeUInt16LE(0, 36);            // internal attrs
        cd.writeUInt32LE(0, 38);            // external attrs
        cd.writeUInt32LE(localOffset, 42);
        centralChunks.push(cd, nameBuf);
    }
    const centralStart = offset;
    let centralSize = 0;
    for (const c of centralChunks) centralSize += c.length;

    // End of Central Directory (22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);              // disk
    eocd.writeUInt16LE(0, 6);              // disk with cd
    eocd.writeUInt16LE(entries.length, 8); // entries on this disk
    eocd.writeUInt16LE(entries.length, 10);// total entries
    eocd.writeUInt32LE(centralSize, 12);
    eocd.writeUInt32LE(centralStart, 16);
    eocd.writeUInt16LE(0, 20);             // comment length

    return Buffer.concat([...localChunks, ...centralChunks, eocd]);
}

/**
 * v810 — export selected assets as a ZIP archive.
 * v814 — kept for compatibility / programmatic use (returns Buffer).
 * For HTTP, use streamZipToResponse() — it writes progressively and
 * doesn't hold the whole archive in memory.
 */
function exportZip(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return { error: "no ids provided" };
    const entries = [];
    const manifest = _readManifest();
    const exportedMeta = [];
    for (const id of ids) {
        const meta = (manifest.assets || []).find(a => a.id === id);
        if (!meta) continue;
        const dir = path.join(libDir(), id);
        if (!fs.existsSync(dir)) continue;
        let dataFile = null;
        try {
            const files = fs.readdirSync(dir);
            dataFile = files.find(f => f.startsWith("data."));
        } catch {}
        if (dataFile) {
            try {
                const dataBytes = fs.readFileSync(path.join(dir, dataFile));
                entries.push({ name: `${id}/${dataFile}`, bytes: dataBytes });
            } catch {}
        }
        entries.push({ name: `${id}/meta.json`, bytes: Buffer.from(JSON.stringify(meta, null, 2)) });
        exportedMeta.push(meta);
    }
    if (entries.length === 0) return { error: "no matching assets found" };
    entries.push({
        name: "manifest.json",
        bytes: Buffer.from(JSON.stringify({ exportedAt: Date.now(), assets: exportedMeta }, null, 2)),
    });
    const zipBuf = _buildZip(entries);
    return { ok: true, count: exportedMeta.length, sizeBytes: zipBuf.length, zip: zipBuf };
}

/**
 * v814 — stream a ZIP archive directly to an HTTP response.
 * v815 — async + uses fs.createReadStream for data files (CRC + size
 * computed incrementally; emits ZIP data descriptor after each streamed
 * file). Peak memory drops from "largest data file" to "single chunk
 * (~64KB)" for the data-file path. Small JSON entries (meta.json,
 * manifest.json) still go through the buffer path since they're tiny.
 *
 * @param {Object} res — Node HTTP ServerResponse
 * @param {Array<string>} ids — asset ids to include
 */
async function streamZipToResponse(res, ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "no ids provided" }));
        return;
    }
    const manifest = _readManifest();
    const matching = ids.map(id => (manifest.assets || []).find(a => a.id === id)).filter(Boolean);
    if (matching.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "no matching assets" }));
        return;
    }

    res.writeHead(200, {
        "Content-Type":        "application/zip",
        "Content-Disposition": `attachment; filename="asset-library-export-${Date.now()}.zip"`,
        "X-Asset-Count":       String(matching.length),
    });

    const { time, date } = _dosTimeDate();
    const centralEntries = [];
    let offset = 0;

    // Honor backpressure — wait for "drain" when write() returns false.
    const _writeAndWait = (chunk) => new Promise((resolve, reject) => {
        if (res.destroyed) return reject(new Error("response destroyed"));
        if (res.write(chunk)) resolve();
        else res.once("drain", resolve);
    });

    // Small in-memory entries (JSON files) — uses the existing one-shot CRC.
    const _writeBufferEntry = async (name, data) => {
        const nameBuf = Buffer.from(name, "utf-8");
        const crc = _crc32(data);
        const size = data.length;
        const lf = Buffer.alloc(30);
        lf.writeUInt32LE(0x04034b50, 0);
        lf.writeUInt16LE(20, 4);
        lf.writeUInt16LE(0, 6);            // GP flags — no data descriptor for buffer path
        lf.writeUInt16LE(0, 8);
        lf.writeUInt16LE(time, 10);
        lf.writeUInt16LE(date, 12);
        lf.writeUInt32LE(crc, 14);
        lf.writeUInt32LE(size, 18);
        lf.writeUInt32LE(size, 22);
        lf.writeUInt16LE(nameBuf.length, 26);
        lf.writeUInt16LE(0, 28);
        await _writeAndWait(lf);
        await _writeAndWait(nameBuf);
        await _writeAndWait(data);
        const localOffset = offset;
        offset += lf.length + nameBuf.length + data.length;
        centralEntries.push(_makeCentralEntry(name, crc, size, time, date, localOffset, /*hasDataDesc=*/false));
    };

    // Large data files — fs.createReadStream + incremental CRC + ZIP data
    // descriptor (bit 3 set in GP flag). Memory peak = single chunk
    // (~64KB default highWaterMark), regardless of file size.
    const _streamFileEntry = async (name, filePath) => {
        const nameBuf = Buffer.from(name, "utf-8");

        // Local file header — placeholders for CRC/size; we'll emit a
        // data descriptor after the data.
        const lf = Buffer.alloc(30);
        lf.writeUInt32LE(0x04034b50, 0);
        lf.writeUInt16LE(20, 4);
        lf.writeUInt16LE(0x0008, 6);       // GP flag bit 3: data descriptor follows
        lf.writeUInt16LE(0, 8);
        lf.writeUInt16LE(time, 10);
        lf.writeUInt16LE(date, 12);
        lf.writeUInt32LE(0, 14);            // CRC placeholder
        lf.writeUInt32LE(0, 18);            // compressed size placeholder
        lf.writeUInt32LE(0, 22);            // uncompressed size placeholder
        lf.writeUInt16LE(nameBuf.length, 26);
        lf.writeUInt16LE(0, 28);
        const localOffset = offset;
        await _writeAndWait(lf);
        await _writeAndWait(nameBuf);
        offset += lf.length + nameBuf.length;

        // Stream the file
        let crc = _crc32Init();
        let size = 0;
        const stream = fs.createReadStream(filePath);
        try {
            for await (const chunk of stream) {
                crc = _crc32Update(crc, chunk);
                size += chunk.length;
                await _writeAndWait(chunk);
                offset += chunk.length;
            }
        } finally {
            stream.destroy();
        }
        crc = _crc32Finalize(crc);

        // Data descriptor (16 bytes including signature)
        const dd = Buffer.alloc(16);
        dd.writeUInt32LE(0x08074b50, 0);   // data descriptor signature (optional but well-supported)
        dd.writeUInt32LE(crc, 4);
        dd.writeUInt32LE(size, 8);          // compressed size (= uncompressed since STORED)
        dd.writeUInt32LE(size, 12);
        await _writeAndWait(dd);
        offset += dd.length;

        centralEntries.push(_makeCentralEntry(name, crc, size, time, date, localOffset, /*hasDataDesc=*/true));
    };

    try {
        for (const meta of matching) {
            const dir = path.join(libDir(), meta.id);
            let dataFile = null;
            try { dataFile = fs.readdirSync(dir).find(f => f.startsWith("data.")); } catch {}
            if (dataFile) {
                await _streamFileEntry(`${meta.id}/${dataFile}`, path.join(dir, dataFile));
            }
            await _writeBufferEntry(`${meta.id}/meta.json`, Buffer.from(JSON.stringify(meta, null, 2)));
        }
        await _writeBufferEntry("manifest.json", Buffer.from(JSON.stringify({
            exportedAt: Date.now(),
            assets: matching,
        }, null, 2)));

        // Central directory
        const centralStart = offset;
        let centralSize = 0;
        for (const { cd, nameBuf } of centralEntries) {
            await _writeAndWait(cd);
            await _writeAndWait(nameBuf);
            centralSize += cd.length + nameBuf.length;
        }

        // EOCD
        const eocd = Buffer.alloc(22);
        eocd.writeUInt32LE(0x06054b50, 0);
        eocd.writeUInt16LE(0, 4);
        eocd.writeUInt16LE(0, 6);
        eocd.writeUInt16LE(centralEntries.length, 8);
        eocd.writeUInt16LE(centralEntries.length, 10);
        eocd.writeUInt32LE(centralSize, 12);
        eocd.writeUInt32LE(centralStart, 16);
        eocd.writeUInt16LE(0, 20);
        await _writeAndWait(eocd);

        res.end();
    } catch (e) {
        try { res.destroy(e); } catch {}
    }
}

// v815 — build a central directory entry for an already-written file.
// hasDataDesc sets bit 3 in the GP flag so unzip knows to read a data
// descriptor between local data and the next local file header.
function _makeCentralEntry(name, crc, size, time, date, localOffset, hasDataDesc) {
    const nameBuf = Buffer.from(name, "utf-8");
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(0x0314, 4);            // version made by (Unix + zip 20)
    cd.writeUInt16LE(20, 6);                 // version needed
    cd.writeUInt16LE(hasDataDesc ? 0x0008 : 0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(size, 20);
    cd.writeUInt32LE(size, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(localOffset, 42);
    return { cd, nameBuf };
}

function _ensureDir() {
    if (!fs.existsSync(libDir())) fs.mkdirSync(libDir(), { recursive: true });
}

function _readManifest() {
    _ensureDir();
    if (!fs.existsSync(manifestPath())) return { assets: [] };
    try {
        return JSON.parse(fs.readFileSync(manifestPath(), "utf-8"));
    } catch {
        return { assets: [] };
    }
}

function _writeManifest(m) {
    _ensureDir();
    fs.writeFileSync(manifestPath(), JSON.stringify(m, null, 2));
}

function _slugify(s, fallback = "asset") {
    const slug = String(s || fallback).toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .substring(0, 40);
    return slug || fallback;
}

function _generateId(base) {
    const slug = _slugify(base);
    const rand = crypto.randomBytes(3).toString("hex");
    return `${slug}_${rand}`;
}

/**
 * List all assets in the library, optionally filtered by source or type.
 * Returns { assets: [...] } sorted by capturedAt descending (newest first).
 */
// v1842 — enumerate LOOSE files in the assets root (internal GPU_Assets + external dir) that are
// NOT part of the catalogued library, so the viewer can show everything that exists on disk, not
// just ingested assets. Returns viewer-shaped records with a stable id (the relative path) so
// move/delete work on them too. Skips the asset_library/ tree (those are already catalogued) and
// dotfiles / node_modules.
const _LOOSE_MESH = new Set([".glb", ".gltf", ".obj", ".ply", ".stl", ".fbx", ".splat", ".ksplat"]);
// v2235 — a scan copies each asset into the library. Skip only the truly pathological so a runaway
// multi-GB file can't quietly fill the disk; the base64 overflow that used to crash the scan is gone
// (add() copies from srcPath now), so this is a disk-safety cap, not a string-length limit.
const MAX_INGEST_MB = Number(process.env.ASSET_MAX_INGEST_MB) || 1024;
const _LOOSE_IMG = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);
function _looseType(ext) {
    if (ext === ".ply" || ext === ".splat" || ext === ".ksplat") return "splat";
    if (_LOOSE_MESH.has(ext)) return "mesh";
    if (_LOOSE_IMG.has(ext)) return "image";
    return "other";
}
function listLoose() {
    const ext = _extGetter ? String(_extGetter() || "").trim() : "";
    const roots = [];
    if (ext) roots.push(ext);
    roots.push(path.join(__dirname, "..", "GPU_Assets"));   // in-tree default
    const seen = new Set(); const out = [];
    for (const root of roots) {
        if (!root) continue;
        const walk = (dir, prefix, depth) => {
            if (depth > 8) return;
            let ents = [];
            try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
            for (const e of ents) {
                if (e.name.startsWith(".") || e.name === "node_modules") continue;
                if (depth === 0 && e.name === "asset_library") continue;   // catalogued elsewhere
                const rel = prefix + e.name;
                const full = path.join(dir, e.name);
                if (e.isDirectory()) { walk(full, rel + "/", depth + 1); continue; }
                const x = path.extname(e.name).toLowerCase();
                if (!_LOOSE_MESH.has(x) && !_LOOSE_IMG.has(x)) continue;
                const key = rel.toLowerCase();
                if (seen.has(key)) continue; seen.add(key);   // external dir wins over in-tree
                let bytes = 0, mtime = 0;
                try { const st = fs.statSync(full); bytes = st.size; mtime = Math.round(st.mtimeMs); } catch {}
                const sub = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
                const canSample = /\.(glb|gltf)$/i.test(e.name);   // v1843 — flattener can preview these
                out.push({
                    id: "loose:" + rel, loose: true, relPath: rel,
                    name: e.name, type: _looseType(x), source: "folder",
                    bytes, capturedAt: mtime,
                    url: "/GPU_Assets/" + rel.split("/").map(encodeURIComponent).join("/"),
                    tags: sub ? ["folder:" + sub.split("/")[0]] : [],
                    stats: canSample ? { hasGeomSample: true } : {},
                });
            }
        };
        walk(root, "", 0);
    }
    return out;
}
function list(filter = {}) {
    const m = _readManifest();
    let assets = m.assets || [];
    if (filter.source) assets = assets.filter(a => a.source === filter.source);
    if (filter.type)   assets = assets.filter(a => a.type === filter.type);
    if (filter.tag)    assets = assets.filter(a => a.tags?.includes(filter.tag));
    assets = assets.slice().sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
    // v811 — strip the heavy geomSample from list responses (it's only
    // needed for first-time thumbnail rendering; client fetches via getGeom).
    // Also signals presence via hasGeomSample boolean so the client knows
    // whether to bother calling getGeom.
    assets = assets.map(a => {
        if (!a.stats?.geomSample) return a;
        const { geomSample, ...statsRest } = a.stats;
        return { ...a, stats: { ...statsRest, hasGeomSample: true } };
    });
    // v1842 — optionally fold in loose on-disk files (everything in the assets folders, not just
    // catalogued library assets). Applies the same source/type/tag filters.
    if (filter.loose) {
        let loose = listLoose();
        if (filter.source) loose = loose.filter(a => a.source === filter.source);
        if (filter.type)   loose = loose.filter(a => a.type === filter.type);
        if (filter.tag)    loose = loose.filter(a => (a.tags || []).includes(filter.tag));
        assets = assets.concat(loose).sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
    }
    return { count: assets.length, assets };
}

/**
 * v811 — return just the cached geomSample for one asset, without the
 * heavy data payload. Used by the thumbnail renderer.
 */
function getGeom(id) {
    if (!id) return { error: "missing id" };
    const m = _readManifest();
    const meta = m.assets.find(a => a.id === id);
    if (!meta) return { error: `asset '${id}' not found` };
    if (!meta.stats?.geomSample) return { error: "no geomSample for this asset" };
    return { id, geomSample: meta.stats.geomSample };
}

// v1843 — geomSample for a LOOSE GLB (one not in the catalog), extracted on demand with the same
// server-side flattener the catalogued assets use. Small mtime-keyed cache so repeated thumbnail
// requests don't re-parse the file. Only .glb/.gltf are sampled; other types return no sample.
const _looseGeomCache = new Map();   // relPath -> { mtime, geomSample }
function looseGeom(root, rel) {
    rel = String(rel || "").replace(/\\/g, "/");
    if (!rel) return { error: "missing file" };
    if (!/\.(glb|gltf)$/i.test(rel)) return { error: "not a glb" };
    // resolve safely under the root (reuse the same guard shape as elsewhere)
    const segs = rel.split("/").filter(x => x && x !== "." && x !== "..");
    if (!segs.length) return { error: "bad path" };
    const rootR = path.resolve(root);
    const full = path.resolve(rootR, segs.join(path.sep));
    if (full !== rootR && !full.startsWith(rootR + path.sep)) return { error: "unsafe path" };
    let mtime = 0; try { mtime = Math.round(fs.statSync(full).mtimeMs); } catch { return { error: "not found" }; }
    const c = _looseGeomCache.get(rel);
    if (c && c.mtime === mtime) return { id: "loose:" + rel, geomSample: c.geomSample, cached: true };
    let buf; try { buf = fs.readFileSync(full); } catch { return { error: "read failed" }; }
    let geomSample = null; try { geomSample = _extractGLBPositionSample(buf); } catch {}
    if (!geomSample) return { error: "no geometry" };
    _looseGeomCache.set(rel, { mtime, geomSample });
    if (_looseGeomCache.size > 400) { const k = _looseGeomCache.keys().next().value; _looseGeomCache.delete(k); }
    return { id: "loose:" + rel, geomSample };
}

/**
 * v813 — Re-extract geomSample for all existing mesh/splat assets.
 * v814 — async + emits geom-regen-progress events per asset (so the
 * client can show a progress bar for large libraries). The setImmediate
 * yield lets the event loop drain SSE writes between iterations.
 */
async function regenerateGeomSamples(opts = {}) {
    const onlyType = opts.type || null;
    const m = _readManifest();
    let processed = 0, updated = 0, skipped = 0, failed = 0;
    const errors = [];
    const allAssets = m.assets || [];
    const eligible = allAssets.filter(a =>
        (a.type === "mesh" || a.type === "splat") &&
        (!onlyType || a.type === onlyType)
    );
    const totalEligible = eligible.length;

    for (let i = 0; i < allAssets.length; i++) {
        const meta = allAssets[i];
        processed++;
        if (onlyType && meta.type !== onlyType) { skipped++; continue; }
        if (meta.type !== "mesh" && meta.type !== "splat") { skipped++; continue; }
        const dir = path.join(libDir(), meta.id);
        const ext = (meta.dataExt || "").toLowerCase();
        const dataFile = path.join(dir, "data." + ext);
        if (!fs.existsSync(dataFile)) { skipped++; continue; }

        try {
            let newGeomSample = null;
            if (meta.type === "mesh" && (ext === "glb" || ext === "gltf")) {
                const buf = fs.readFileSync(dataFile);
                newGeomSample = _extractGLBPositionSample(buf);
            } else if (meta.type === "splat" && ext === "ply") {
                const buf = fs.readFileSync(dataFile);
                newGeomSample = _extractPLYPositionSample(buf);
            } else {
                skipped++;
                _emit("geom-regen-progress", { current: updated + failed + skipped, total: totalEligible, name: meta.name, id: meta.id, status: "skipped" });
                continue;
            }
            if (newGeomSample) {
                if (!meta.stats) meta.stats = {};
                meta.stats.geomSample = newGeomSample;
                delete meta.thumbBase64;
                try {
                    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
                } catch (e) {
                    errors.push(`${meta.id}: write failed: ${e.message}`);
                }
                updated++;
                _emit("geom-regen-progress", { current: updated + failed + skipped, total: totalEligible, name: meta.name, id: meta.id, status: "ok" });
            } else {
                failed++;
                _emit("geom-regen-progress", { current: updated + failed + skipped, total: totalEligible, name: meta.name, id: meta.id, status: "failed" });
            }
        } catch (e) {
            failed++;
            errors.push(`${meta.id}: ${e.message}`);
            _emit("geom-regen-progress", { current: updated + failed + skipped, total: totalEligible, name: meta.name, id: meta.id, status: "error" });
        }
        // Yield to the event loop so SSE writes flush between assets
        await new Promise(r => setImmediate(r));
    }
    _writeManifest(m);
    _emit("geom-regen", { processed, updated, skipped, failed });
    return { processed, updated, skipped, failed, errors: errors.slice(0, 10) };
}

/**
 * Get a single asset's metadata + data. Returns { meta, data }
 * where data is base64-encoded if binary, or a parsed JSON object
 * if dataExt === "json".
 */
function get(id) {
    if (!id) return { error: "missing id" };
    const m = _readManifest();
    const meta = m.assets.find(a => a.id === id);
    if (!meta) return { error: `asset '${id}' not found` };
    const dataPath = path.join(libDir(), id, "data." + (meta.dataExt || "bin"));
    if (!fs.existsSync(dataPath)) return { error: `data file missing for '${id}'` };
    try {
        if (meta.dataExt === "json") {
            const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
            return { meta, data };
        } else {
            const buf = fs.readFileSync(dataPath);
            return { meta, data: buf.toString("base64"), encoding: "base64" };
        }
    } catch (e) {
        return { error: `read failed: ${e.message}` };
    }
}

// v1337 — absolute path to a mesh asset's GLB so it can be promoted to the live avatar.
function glbPath(id) {
    if (!id) return { error: "missing id" };
    const m = _readManifest();
    const meta = m.assets.find(a => a.id === id);
    if (!meta) return { error: `asset '${id}' not found` };
    const ext = String(meta.dataExt || "").toLowerCase();
    if (ext !== "glb" && ext !== "gltf") return { error: `asset '${id}' isn't a glb/gltf (it's ${ext || meta.type || "?"})` };
    const p = path.join(libDir(), id, "data." + ext);
    if (!fs.existsSync(p)) return { error: `data file missing for '${id}'` };
    return { ok: true, path: p, ext, name: meta.name || id };
}

/**
 * Store a new asset. Either provide `data` (object → JSON file) or
 * `dataBase64` (base64-encoded binary). Required: type, source. Optional:
 * name (defaults to id), tags, orientation, dataExt.
 *
 * Returns the created meta record.
 */
function add(input) {
    if (!input?.type) return { error: "missing 'type' (voxel|mesh|splat|image|rig|other)" };
    if (!input?.source) return { error: "missing 'source' (gemini|kaggle|local|captured)" };
    if (input.data == null && input.dataBase64 == null && input.srcPath == null) return { error: "missing 'data', 'dataBase64', or 'srcPath'" };

    // v816 — rig pre-validation: the rig schema is small + meaningful, so reject
    // before touching disk if the shape is wrong.
    let _rigStats = null;
    if (input.type === "rig") {
        if (typeof input.data !== "object") return { error: "rig 'data' must be an object with bones array" };
        _rigStats = _parseRigStats(input.data);
        if (!_rigStats) return { error: "invalid rig: expected { bones: [{ id, position: [x,y,z], parent? }] } with unique ids, valid parent refs, and at least one root bone" };
    }
    // v818 — clip pre-validation. Schema:
    //   { duration: <sec>, bones: [{ id, frames: [{ t, position?, rotation? }] }] }
    let _clipStats = null;
    if (input.type === "clip") {
        if (typeof input.data !== "object") return { error: "clip 'data' must be an object with duration + bones" };
        _clipStats = _parseClipStats(input.data);
        if (!_clipStats) return { error: "invalid clip: expected { duration > 0, bones: [{ id, frames: [{ t in [0,duration], position?/rotation? }] }] } with sorted frames and at least one keyframe defining position or rotation" };
    }

    _ensureDir();
    const id = input.id || _generateId(input.name || input.type);
    const dir = path.join(libDir(), id);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Pick extension. JSON if data is object; otherwise dataExt or "bin"
    let dataExt = input.dataExt;
    let bytes = 0;
    const dataPath = (ext) => path.join(dir, "data." + ext);
    try {
        if (input.data != null && typeof input.data === "object") {
            dataExt = dataExt || "json";
            const text = JSON.stringify(input.data);
            fs.writeFileSync(dataPath(dataExt), text);
            bytes = Buffer.byteLength(text);
        } else if (typeof input.dataBase64 === "string") {
            dataExt = dataExt || "bin";
            const buf = Buffer.from(input.dataBase64, "base64");
            fs.writeFileSync(dataPath(dataExt), buf);
            bytes = buf.length;
        } else if (typeof input.data === "string") {
            dataExt = dataExt || "txt";
            fs.writeFileSync(dataPath(dataExt), input.data);
            bytes = Buffer.byteLength(input.data);
        } else if (typeof input.srcPath === "string") {
            // v2235 — copy the file straight in. The scan path used to read the whole asset and
            // base64-encode it, which throws "Cannot create a string longer than 0x1fffffe8" on a
            // .glb over ~384 MB (base64 of the bytes exceeds V8's max string length). A direct copy
            // has no string in the middle and no size ceiling.
            dataExt = dataExt || (String(input.srcPath).split(".").pop() || "bin").toLowerCase();
            fs.copyFileSync(input.srcPath, dataPath(dataExt));
            bytes = fs.statSync(dataPath(dataExt)).size;
        } else {
            return { error: "data must be object/string or dataBase64 string" };
        }
    } catch (e) {
        return { error: `write failed: ${e.message}` };
    }

    const meta = {
        id,
        name: input.name || id,
        type: input.type,
        source: input.source,
        dataExt,
        bytes,
        capturedAt: Date.now(),
        orientation: input.orientation || null,
        tags: input.tags || [],
        notes: input.notes || "",          // v807 — free-text description
        stats: null,                       // v808 — type-specific stats (vertexCount, triCount, etc.)
    };
    // v808 — populate stats based on type. Cheap server-side parse.
    try {
        if (input.type === "mesh" && typeof input.dataBase64 === "string") {
            const buf = Buffer.from(input.dataBase64, "base64");
            const ext = (dataExt || "").toLowerCase();
            if (ext === "glb" || ext === "gltf") {
                meta.stats = _parseGLBStats(buf);
                // v811 — also extract actual sampled positions for richer thumbnails
                if (meta.stats) {
                    const geomSample = _extractGLBPositionSample(buf);
                    if (geomSample) meta.stats.geomSample = geomSample;
                }
            } else if (ext === "obj") {                              // v810 — OBJ stats
                try {
                    meta.stats = _parseOBJStats(buf.toString("utf-8"));
                } catch {}
            }
        } else if (input.type === "mesh" && typeof input.data === "string") {
            // OBJ as text (drag-drop path may pass text directly)
            if ((dataExt || "").toLowerCase() === "obj") {
                meta.stats = _parseOBJStats(input.data);
            }
        } else if (input.type === "splat" && typeof input.dataBase64 === "string") {
            const buf = Buffer.from(input.dataBase64, "base64");
            meta.stats = _parsePLYStats(buf);
            // v811 — sampled splat positions for actual-cloud thumbnails
            if (meta.stats) {
                const geomSample = _extractPLYPositionSample(buf);
                if (geomSample) meta.stats.geomSample = geomSample;
            }
        } else if (input.type === "voxel" && typeof input.data === "object") {
            meta.stats = _parseVoxelStats(input.data);
        } else if (input.type === "rig" && _rigStats) {
            // v816 — already validated at the top of add(); just attach the stats.
            meta.stats = _rigStats;
        } else if (input.type === "clip" && _clipStats) {
            // v818 — already validated; attach the stats
            meta.stats = _clipStats;
        }
    } catch (e) {
        // Stats failure is non-fatal — leave null
    }
    // Per-asset meta.json
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
    // Update manifest
    const m = _readManifest();
    m.assets = (m.assets || []).filter(a => a.id !== id);
    m.assets.push(meta);
    _writeManifest(m);
    _emit("add", { id, name: meta.name, source: meta.source, type: meta.type });
    return { meta };
}

/**
 * v808 — store a cached thumbnail (base64 data URL) for an asset.
 * Client renders the thumbnail once, POSTs it back. Future panel
 * loads use this cached value without per-card data fetch.
 */
function setThumb(id, thumbBase64) {
    if (!id) return { error: "missing id" };
    const m = _readManifest();
    const meta = m.assets.find(a => a.id === id);
    if (!meta) return { error: `asset '${id}' not found` };
    // Sanity limit: 200KB per thumb (PNG at 96×96 is typically 3-5KB)
    if (typeof thumbBase64 !== "string") return { error: "thumbBase64 must be a string" };
    if (thumbBase64.length > 200_000) return { error: "thumbBase64 too large (max 200KB)" };
    meta.thumbBase64 = thumbBase64;
    const metaPath = path.join(libDir(), id, "meta.json");
    if (fs.existsSync(metaPath)) {
        try { fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2)); } catch {}
    }
    _writeManifest(m);
    // No SSE emit — thumb cache is silent (would trigger refresh storms otherwise)
    return { ok: true };
}

/**
 * v807 — set/replace notes (free-text description) on an asset.
 */
function note(id, notes) {
    if (!id) return { error: "missing id" };
    const m = _readManifest();
    const meta = m.assets.find(a => a.id === id);
    if (!meta) return { error: `asset '${id}' not found` };
    meta.notes = String(notes || "");
    const metaPath = path.join(libDir(), id, "meta.json");
    if (fs.existsSync(metaPath)) {
        try { fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2)); } catch {}
    }
    _writeManifest(m);
    _emit("note", { id });
    return { ok: true, meta };
}

/**
 * v816 — bind a rig asset to a splat asset. Stores rigId on the splat's
 * meta. Validates that:
 *   - splatId points to an actual splat-type asset
 *   - rigId (if non-null) points to an actual rig-type asset
 * Passing rigId=null clears the binding.
 */
function bindRig(splatId, rigId) {
    if (!splatId) return { error: "missing splatId" };
    const m = _readManifest();
    const splat = m.assets.find(a => a.id === splatId);
    if (!splat) return { error: `asset '${splatId}' not found` };
    if (splat.type !== "splat") return { error: `asset '${splatId}' is type '${splat.type}', not splat` };
    if (rigId !== null && rigId !== undefined) {
        const rig = m.assets.find(a => a.id === rigId);
        if (!rig) return { error: `rig asset '${rigId}' not found` };
        if (rig.type !== "rig") return { error: `asset '${rigId}' is type '${rig.type}', not rig` };
        splat.rigId = rigId;
    } else {
        delete splat.rigId;
    }
    const metaPath = path.join(libDir(), splatId, "meta.json");
    if (fs.existsSync(metaPath)) {
        try { fs.writeFileSync(metaPath, JSON.stringify(splat, null, 2)); } catch {}
    }
    _writeManifest(m);
    _emit("bind-rig", { splatId, rigId: rigId || null });
    return { ok: true, meta: splat };
}

/**
 * v818 — bind an animation clip to a splat. Stores clipId on the splat's
 * meta. Splat must have a rigId already (clip targets that rig). Passing
 * clipId=null clears.
 */
function bindClip(splatId, clipId) {
    if (!splatId) return { error: "missing splatId" };
    const m = _readManifest();
    const splat = m.assets.find(a => a.id === splatId);
    if (!splat) return { error: `asset '${splatId}' not found` };
    if (splat.type !== "splat") return { error: `asset '${splatId}' is type '${splat.type}', not splat` };
    if (clipId !== null && clipId !== undefined) {
        if (!splat.rigId) return { error: "splat has no rigId bound — bind a rig first" };
        const clip = m.assets.find(a => a.id === clipId);
        if (!clip) return { error: `clip asset '${clipId}' not found` };
        if (clip.type !== "clip") return { error: `asset '${clipId}' is type '${clip.type}', not clip` };
        splat.clipId = clipId;
    } else {
        delete splat.clipId;
    }
    const metaPath = path.join(libDir(), splatId, "meta.json");
    if (fs.existsSync(metaPath)) {
        try { fs.writeFileSync(metaPath, JSON.stringify(splat, null, 2)); } catch {}
    }
    _writeManifest(m);
    _emit("bind-clip", { splatId, clipId: clipId || null });
    return { ok: true, meta: splat };
}

/**
 * v807 — duplicate an asset (deep copy of data + meta with new id).
 * The duplicate keeps tags + orientation but resets capturedAt and
 * appends " (copy)" to the name.
 * v810 — for binary assets, copy file directly via fs.copyFileSync
 * instead of base64 round-trip (avoids loading 100MB+ meshes into memory
 * twice + the slow Buffer.from(base64) decode).
 */
function duplicate(id, newName) {
    if (!id) return { error: "missing id" };
    const m = _readManifest();
    const srcMeta = (m.assets || []).find(a => a.id === id);
    if (!srcMeta) return { error: `asset '${id}' not found` };
    const srcDir = path.join(libDir(), id);
    if (!fs.existsSync(srcDir)) return { error: `asset '${id}' not found on disk` };

    // Find the source data file
    let srcDataFile = null;
    try {
        const files = fs.readdirSync(srcDir);
        srcDataFile = files.find(f => f.startsWith("data."));
    } catch {}
    if (!srcDataFile) return { error: "asset has no data file" };

    // Build new meta (most fields copied verbatim; new id, name, capturedAt)
    const newId = crypto.randomBytes(4).toString("hex") + "_" + (srcMeta.name || "copy").replace(/[^a-z0-9_]/gi, "_").slice(0, 24).toLowerCase();
    const dir = path.join(libDir(), newId);
    fs.mkdirSync(dir, { recursive: true });
    const dstDataFile = srcDataFile;       // same extension
    try {
        fs.copyFileSync(path.join(srcDir, srcDataFile), path.join(dir, dstDataFile));
    } catch (e) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
        return { error: `copy failed: ${e.message}` };
    }
    const dstStat = fs.statSync(path.join(dir, dstDataFile));
    const newMeta = {
        ...srcMeta,
        id: newId,
        name: newName || `${srcMeta.name} (copy)`,
        bytes: dstStat.size,
        capturedAt: Date.now(),
        // Drop the cached thumb so the dup gets its own re-render
        // (orientation may differ between copies in future, etc.)
    };
    delete newMeta.thumbBase64;
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(newMeta, null, 2));
    const updated = _readManifest();
    updated.assets = (updated.assets || []).filter(a => a.id !== newId);
    updated.assets.push(newMeta);
    _writeManifest(updated);
    _emit("add", { id: newId, name: newMeta.name, source: newMeta.source, type: newMeta.type });
    return { meta: newMeta };
}

/**
 * v807 — fetch a URL and ingest into the library. Auto-detects type
 * from the response Content-Type and extension. Tags as "url-import".
 */
async function importFromUrl(url, opts = {}) {
    if (!url) return { error: "missing url" };
    let resp;
    try {
        resp = await fetch(url);
    } catch (e) {
        return { error: `fetch failed: ${e.message}` };
    }
    if (!resp.ok) return { error: `HTTP ${resp.status}` };
    const contentType = (resp.headers.get("content-type") || "").toLowerCase();
    // Guess extension from URL path
    const urlPath = url.split("?")[0];
    const ext = (urlPath.split(".").pop() || "").toLowerCase();
    const nameGuess = opts.name || urlPath.split("/").pop().replace(/\.[^.]+$/, "") || "imported";
    let type, payload;
    // JSON voxel data?
    if (contentType.includes("json") || ext === "json") {
        try {
            const data = await resp.json();
            if (Array.isArray(data?.voxels)) {
                type = "voxel";
                payload = { data };
            } else {
                type = "other";
                payload = { data: JSON.stringify(data) };
            }
        } catch (e) {
            return { error: `JSON parse failed: ${e.message}` };
        }
    } else if (["glb", "gltf", "obj"].includes(ext)) {
        type = "mesh";
        const buf = await resp.arrayBuffer();
        payload = { dataBase64: Buffer.from(buf).toString("base64"), dataExt: ext };
    } else if (ext === "ply") {
        type = "splat";
        const buf = await resp.arrayBuffer();
        payload = { dataBase64: Buffer.from(buf).toString("base64"), dataExt: ext };
    } else if (contentType.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
        type = "image";
        const buf = await resp.arrayBuffer();
        payload = { dataBase64: Buffer.from(buf).toString("base64"), dataExt: ext };
    } else {
        // Text fallback
        type = "other";
        const text = await resp.text();
        payload = { data: text, dataExt: ext || "txt" };
    }
    return add({
        name: nameGuess, type, source: "url",
        tags: ["url-import", new URL(url).hostname],
        notes: `Imported from ${url}`,
        ...payload,
    });
}

function remove(id) {
    if (!id) return { error: "missing id" };
    const dir = path.join(libDir(), id);
    if (!fs.existsSync(dir)) return { error: `asset '${id}' not found on disk` };
    // v1839 — collect the files under this asset (relative to the EXTERNAL sync root) BEFORE deleting,
    // so the caller can tombstone + propagate the delete to peers (else sync re-pulls them).
    let relFiles = [];
    try {
        const ext = _extGetter ? String(_extGetter() || "").trim() : "";
        if (ext) {
            const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else relFiles.push(path.relative(ext, f).replace(/\\/g, "/")); } };
            walk(dir);
        }
    } catch {}
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
        return { error: `remove failed: ${e.message}` };
    }
    const m = _readManifest();
    m.assets = (m.assets || []).filter(a => a.id !== id);
    _writeManifest(m);
    _emit("remove", { id });
    return { ok: true, removed: id, relFiles };
}

// v1841 — move an asset into a subfolder of the library (for the Tinder "move to subfolder" action).
// Relocates asset_library/<id> -> asset_library/<sub>/<id>. Returns the old + new sync-relative file
// paths so the caller can propagate the change to peers (old paths tombstoned, new paths sync as adds).
function moveToFolder(id, subfolder) {
    if (!id) return { error: "missing id" };
    const sub = String(subfolder || "").trim().replace(/^[/\\]+|[/\\]+$/g, "").replace(/\.\./g, "");
    if (!sub) return { error: "missing subfolder" };
    if (/[<>:"|?*\0]/.test(sub)) return { error: "invalid subfolder name" };
    const srcDir = path.join(libDir(), id);
    if (!fs.existsSync(srcDir)) return { error: `asset '${id}' not found on disk` };
    const destParent = path.join(libDir(), sub);
    const destDir = path.join(destParent, id);
    if (path.resolve(destDir) === path.resolve(srcDir)) return { error: "already in that folder" };
    if (fs.existsSync(destDir)) return { error: `an asset with id '${id}' already exists in '${sub}'` };
    const ext = _extGetter ? String(_extGetter() || "").trim() : "";
    const oldRel = [], newRel = [];
    try {
        if (ext) { const walk = (d, base) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f, base); else base.push(path.relative(ext, f).replace(/\\/g, "/")); } }; walk(srcDir, oldRel); }
    } catch {}
    try {
        fs.mkdirSync(destParent, { recursive: true });
        fs.renameSync(srcDir, destDir);   // atomic move within the same filesystem
    } catch (e) {
        return { error: `move failed: ${e.message}` };
    }
    try { if (ext) { const walk = (d, base) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f, base); else base.push(path.relative(ext, f).replace(/\\/g, "/")); } }; walk(destDir, newRel); } } catch {}
    // update the manifest meta: refresh the folder: tag + the on-disk path pointer.
    const m = _readManifest();
    const meta = (m.assets || []).find(a => a.id === id);
    if (meta) {
        meta.tags = (meta.tags || []).filter(t => !String(t).startsWith("folder:"));
        meta.tags.push("folder:" + sub);
        meta.subdir = sub;
        _writeManifest(m);
        try { const mp = path.join(destDir, "meta.json"); if (fs.existsSync(mp)) fs.writeFileSync(mp, JSON.stringify(meta, null, 2)); } catch {}
    }
    _emit("move", { id, subfolder: sub });
    return { ok: true, id, subfolder: sub, oldRel, newRel };
}

function rename(id, newName) {
    if (!id || !newName) return { error: "missing id or newName" };
    const m = _readManifest();
    const meta = m.assets.find(a => a.id === id);
    if (!meta) return { error: `asset '${id}' not found` };
    meta.name = newName;
    // Also update the per-asset meta.json
    const metaPath = path.join(libDir(), id, "meta.json");
    if (fs.existsSync(metaPath)) {
        try { fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2)); } catch {}
    }
    _writeManifest(m);
    _emit("rename", { id, name: newName });
    return { ok: true, meta };
}

function orient(id, orientation) {
    if (!id) return { error: "missing id" };
    const m = _readManifest();
    const meta = m.assets.find(a => a.id === id);
    if (!meta) return { error: `asset '${id}' not found` };
    meta.orientation = orientation || null;
    delete meta.thumbBase64;        // v808 — yaw changes, invalidate cached thumb
    const metaPath = path.join(libDir(), id, "meta.json");
    if (fs.existsSync(metaPath)) {
        try { fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2)); } catch {}
    }
    _writeManifest(m);
    _emit("orient", { id, forward: orientation?.forward });
    return { ok: true, meta };
}

/**
 * v804 — add or remove a tag on an asset.
 *   op === "add":    appends tag if not already present (idempotent)
 *   op === "remove": removes tag if present
 */
function tag(id, tag, op = "add") {
    if (!id || !tag) return { error: "missing id or tag" };
    const m = _readManifest();
    const meta = m.assets.find(a => a.id === id);
    if (!meta) return { error: `asset '${id}' not found` };
    meta.tags = Array.isArray(meta.tags) ? meta.tags : [];
    if (op === "add") {
        if (!meta.tags.includes(tag)) meta.tags.push(tag);
    } else if (op === "remove") {
        meta.tags = meta.tags.filter(t => t !== tag);
    } else {
        return { error: `unknown op '${op}' (use 'add' or 'remove')` };
    }
    const metaPath = path.join(libDir(), id, "meta.json");
    if (fs.existsSync(metaPath)) {
        try { fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2)); } catch {}
    }
    _writeManifest(m);
    _emit("tag", { id, tag, op });
    return { ok: true, meta };
}

function status() {
    _ensureDir();
    const m = _readManifest();
    const total = (m.assets || []).length;
    const bySource = {};
    const byType = {};
    const byOrientation = {};
    const tagCounts = new Map();
    let totalBytes = 0;
    let oldest = null, newest = null;
    let hasGeomSampleCount = 0;
    let hasThumbCount = 0;
    let withNotesCount = 0;
    let favoriteCount = 0;
    for (const a of m.assets || []) {
        bySource[a.source] = (bySource[a.source] || 0) + 1;
        byType[a.type] = (byType[a.type] || 0) + 1;
        totalBytes += a.bytes || 0;
        if (a.capturedAt) {
            if (oldest === null || a.capturedAt < oldest) oldest = a.capturedAt;
            if (newest === null || a.capturedAt > newest) newest = a.capturedAt;
        }
        if (a.orientation?.forward) {
            byOrientation[a.orientation.forward] = (byOrientation[a.orientation.forward] || 0) + 1;
        }
        for (const tag of (a.tags || [])) {
            if (!tag) continue;
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            if (tag === "favorite") favoriteCount++;
        }
        if (a.stats?.geomSample || a.stats?.hasGeomSample) hasGeomSampleCount++;
        if (a.thumbBase64) hasThumbCount++;
        if (a.notes && a.notes.trim()) withNotesCount++;
    }
    // Top 10 tags by count
    const topTags = [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag, count]) => ({ tag, count }));
    // Top 5 largest assets
    const largestAssets = (m.assets || [])
        .slice()
        .sort((a, b) => (b.bytes || 0) - (a.bytes || 0))
        .slice(0, 5)
        .map(a => ({ id: a.id, name: a.name, type: a.type, bytes: a.bytes }));
    return {
        libDir: libDir(),
        total, totalBytes,
        bySource, byType, byOrientation,
        topTags, largestAssets,
        oldestAt: oldest, newestAt: newest,
        hasGeomSampleCount, hasThumbCount, withNotesCount, favoriteCount,
    };
}

/**
 * v802 — retroactively scan a directory (default: ../GPU_Assets where
 * Kaggle outputs land) and ingest any files not yet in the library.
 * Tags everything with source="kaggle" and "scanned" so the user can
 * filter for them. Returns counts.
 */
function scanKaggleDir(dirPath, opts = {}) {
    const scanDir = dirPath || path.join(__dirname, "..", "GPU_Assets");
    if (!fs.existsSync(scanDir)) return { error: `directory not found: ${scanDir}`, scanned: 0, ingested: 0 };
    const source = opts.source || "kaggle";
    // v974 — RECURSIVE walk (was top-level only, so assets in subfolders like
    // Your_Avatars/ and characters/ were silently never ingested). Skips hidden
    // dirs + node_modules. Each file keeps its path relative to scanDir.
    const files = [];
    const walk = (d, rel) => {
        let ents = [];
        try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (e.name.startsWith(".")) continue;
            const full = path.join(d, e.name);
            const r = rel ? rel + "/" + e.name : e.name;
            if (e.isDirectory()) { if (e.name === "node_modules") continue; walk(full, r); }
            else if (/\.(glb|gltf|obj|ply|png|jpg|jpeg)$/i.test(e.name)) files.push({ full, rel: r });
        }
    };
    walk(scanDir, "");
    let ingested = 0, skipped = 0;
    const m = _readManifest();
    // v974 — dedup by the path:<rel> tag (re-scan safe even across subfolders).
    // Fall back to the legacy name match so items ingested by the OLD top-level
    // scan (no path tag) aren't duplicated on the first recursive re-scan.
    const existingPaths = new Set();
    const existingNames = new Set();
    for (const a of (m.assets || [])) {
        if (a.source === source) existingNames.add(a.name);
        for (const t of (a.tags || [])) if (t.startsWith("path:")) existingPaths.add(t.slice(5));
    }
    for (const { full, rel } of files) {
        const ext = (rel.split(".").pop() || "").toLowerCase();
        const name = path.basename(rel).replace(/\.[^.]+$/, "");
        if (existingPaths.has(rel) || existingNames.has(name)) { skipped++; continue; }
        const subdir = path.dirname(rel).split(/[\\/]/)[0];   // "." if at root
        try {
            let type;
            if (ext === "glb" || ext === "gltf" || ext === "obj") type = "mesh";
            else if (ext === "ply") type = "splat";
            else if (["png", "jpg", "jpeg"].includes(ext)) type = "image";
            else continue;
            // path: tag = dedup key; folder: tag = reflects on-disk organization
            const tags = ["kaggle-scanned", "path:" + rel];
            if (subdir && subdir !== ".") tags.push("folder:" + subdir);
            // v2235 — pass the PATH, not a base64 string: a big .glb overflows V8's max string length
            // (that was the "Cannot create a string longer than 0x1fffffe8" crash). add() copies it in
            // directly. Skip only the truly pathological so a runaway file can't fill the library.
            const szMb = fs.statSync(full).size / (1024 * 1024);
            if (szMb > MAX_INGEST_MB) { console.warn(`[assetLibrary] scan: skipping ${rel} (${szMb.toFixed(0)} MB > ${MAX_INGEST_MB} MB cap)`); skipped++; continue; }
            const result = add({
                name, type, source, tags,
                srcPath: full, dataExt: ext,
            });
            if (result?.meta) ingested++;
        } catch (e) {
            console.warn(`[assetLibrary] scan: couldn't ingest ${rel}:`, e?.message);
        }
    }
    return { scanned: files.length, ingested, skipped, dir: scanDir, recursive: true };
}

module.exports = { init, list, listLoose, looseGeom, get, getGeom, glbPath, add, remove, moveToFolder, rename, orient, status, subscribe, scanKaggleDir, tag, note, bindRig, bindClip, duplicate, importFromUrl, setThumb, exportZip, streamZipToResponse, regenerateGeomSamples };
