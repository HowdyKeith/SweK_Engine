// WebGLEngine/render/splatLod.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// SPLATS AT SCALE: AN OCTREE, A SPLAT BUDGET, AND STREAMING. Backlog: render/BACKLOG_2026-11-21_PLAYCANVAS.md, `splat-lod-streaming`. Keith: "4". PlayCanvas
// shows very large splat scenes with a level-of-detail octree, a budget balancer and streamed chunks (src/scene/gsplat-unified/); this is the same idea built
// for SweK's splat shape (engine/splatParser.js: positions, log scales, colours, pre-sigmoid opacities, quaternions), not their files.
//
//   buildLod(splat, { leafSize, proxies })   the octree. A LEAF holds real splats (at most leafSize). An INNER node holds at most `proxies` STAND-INS for
//                                            everything under it, merged bottom-up: the splats of each cell of a small grid over the node become one splat with
//                                            their opacity-weighted centre and colour, a size that covers their spread, and an opacity that is their combined
//                                            coverage. Far away, a node's stand-ins draw in place of its thousands of splats.
//   selectLod(lod, view, { budget, ... })    the cut through the tree for one camera: starting from the root's stand-ins, the node that looks BIGGEST ON SCREEN is
//                                            replaced by its children, again and again, while the total stays within `budget` splats and the spacing of some
//                                            node's stand-ins still looks bigger than `pixelThreshold` (1.5 px). Only LOADED nodes are refined, so a streaming cloud draws coarse first and sharpens as nodes
//                                            arrive. Returns the nodes drawn, the splat count, and which unloaded nodes it wanted (nearest-looking first).
//   gatherSplats(lod, cut)                   the drawn splats as one cloud, for render/splatRendererGPU.mjs's update().
//   packLod / openLodStream                  STREAMING: one file (.swlod): "SWLOD1", a u32 header length, a JSON header (the tree, each node's byte range), then
//                                            every node's splats as 14 f32s each. openLodStream fetches the header, then nodes on demand by HTTP Range, the ones
//                                            the camera wants first; a node not yet here is simply not refined.
//
//   COMPRESSED (the default since 2026-11-21, Keith: "5"): "SWLOD2" and 17 bytes a splat instead of 56, the way PlayCanvas's .sog is small -- each node
//                                            keeps its own ranges (18 floats: position min and extent, log-scale min and extent, colour min and extent), and
//                                            each splat is its position as 3 x u16 inside the node's box, its log-scale and colour as 3 x u8 each inside the
//                                            node's ranges, its opacity as u8 of the sigmoid, and its rotation as "smallest three" in 32 bits (the index of the
//                                            largest component in 2 bits, the other three in 10 bits each). Decoded to f32 records as each node arrives, so
//                                            nothing after loading changes. The error is bounded and the gate holds it to its bound.
//
//   SPHERICAL HARMONICS (2026-11-21, Keith: "Spherical harmonics in the streamed .swlod files"): a cloud with `sh` and `shDegree` (render/splatSH.mjs) keeps them
//                                            through the tree -- each node's `sh` beside its records, K coefficients a channel a splat; a stand-in's are the SAME
//                                            weighted mean of its cell's as its colour (the colour from any side of a merged splat is the mean of its parts'); gather
//                                            hands them on; in the file each node's block is its records and then its coefficients -- f32 plainly, or compressed
//                                            as one byte each against the node's own range per coefficient (2 x 3K floats of range a node). A cloud without them packs
//                                            to exactly the bytes it did before.
//
// WHAT IS NOT HERE: a worker, .sog itself (PlayCanvas's files are read by PlayCanvas).
"use strict";

export const FLOATS = 14;   // x y z | log-scale x y z | r g b | pre-sigmoid opacity | quaternion w x y z
import { SH_K } from "./splatSH.mjs";
const sig = (x) => 1 / (1 + Math.exp(-x)), logit = (p) => Math.log(p / (1 - p));

/** A cloud of `n` splats in SweK's shape, zeroed. */
export function emptyCloud(n, K = 0) { return { ...(K ? { sh: new Float32Array(n * K * 3), shDegree: K === 15 ? 3 : K === 8 ? 2 : 1 } : {}), count: n, positions: new Float32Array(n * 3), scales: new Float32Array(n * 3), colors: new Float32Array(n * 3), opacities: new Float32Array(n), quats: new Float32Array(n * 4) }; }
function shOf(c, idx, K) { const w = K * 3, out = new Float32Array(idx.length * w); idx.forEach((i, k) => out.set(c.sh.subarray(i * w, i * w + w), k * w)); return out; }
function recordsOf(c, idx) { const out = new Float32Array(idx.length * FLOATS); idx.forEach((i, k) => { const o = k * FLOATS; out.set(c.positions.subarray(i * 3, i * 3 + 3), o); out.set(c.scales.subarray(i * 3, i * 3 + 3), o + 3); out.set(c.colors.subarray(i * 3, i * 3 + 3), o + 6); out[o + 9] = c.opacities[i]; out.set(c.quats.subarray(i * 4, i * 4 + 4), o + 10); }); return out; }

/** Merge splat records into at most `max` stand-ins: one per occupied cell of a g^3 grid over `bounds`, g grown until the cells would exceed max. Pure. */
export function mergeRecords(recs, bounds, max) { return mergeNode(recs, bounds, max).records; }
/** mergeRecords with the coefficients too: `sh` (K a channel a splat, beside `recs`) merged with the same weights as the colour. { records, sh }. Pure. */
export function mergeNode(recs, bounds, max, sh = null, K = 0) {
    const n = recs.length / FLOATS, W = K * 3; if (n <= max) return { records: recs.slice(), sh: sh ? sh.slice() : null };
    const [cx, cy, cz, r] = bounds; let g = 1; while ((g + 1) ** 3 <= max) g++;
    const cells = new Map();
    for (let i = 0; i < n; i++) {
        const o = i * FLOATS, cell = (v, c) => Math.max(0, Math.min(g - 1, Math.floor(((v - c + r) / (2 * r)) * g)));
        const key = cell(recs[o], cx) + g * (cell(recs[o + 1], cy) + g * cell(recs[o + 2], cz));
        let a = cells.get(key); if (!a) cells.set(key, (a = { w: 0, x: 0, y: 0, z: 0, xx: 0, yy: 0, zz: 0, s2: 0, r: 0, g: 0, b: 0, keep: 1, k: 0, sh: W ? new Float64Array(W) : null }));
        const alpha = sig(recs[o + 9]), sx = Math.exp(recs[o + 3]), sy = Math.exp(recs[o + 4]), sz = Math.exp(recs[o + 5]), w = alpha * (sx * sy * sz) ** (2 / 3) + 1e-12;
        a.w += w; a.x += w * recs[o]; a.y += w * recs[o + 1]; a.z += w * recs[o + 2]; a.xx += w * recs[o] ** 2; a.yy += w * recs[o + 1] ** 2; a.zz += w * recs[o + 2] ** 2;
        a.s2 += w * (sx * sx + sy * sy + sz * sz) / 3; a.r += w * recs[o + 6]; a.g += w * recs[o + 7]; a.b += w * recs[o + 8]; a.keep *= 1 - alpha; a.k++;
        if (W) for (let t = 0; t < W; t++) a.sh[t] += w * sh[i * W + t];
    }
    const out = new Float32Array(cells.size * FLOATS), outSh = W ? new Float32Array(cells.size * W) : null; let k = 0;
    for (const a of cells.values()) {
        if (W) for (let t = 0; t < W; t++) outSh[k * W + t] = a.sh[t] / a.w;
        const o = k++ * FLOATS, mx = a.x / a.w, my = a.y / a.w, mz = a.z / a.w, spread = Math.max(0, a.xx / a.w - mx * mx, a.yy / a.w - my * my, a.zz / a.w - mz * mz), s = Math.sqrt(spread + a.s2 / a.w);   // the WIDEST axis's spread: a round stand-in must cover a long cluster, not its average
        out[o] = mx; out[o + 1] = my; out[o + 2] = mz; out[o + 3] = out[o + 4] = out[o + 5] = Math.log(Math.max(1e-6, s));
        out[o + 6] = a.r / a.w; out[o + 7] = a.g / a.w; out[o + 8] = a.b / a.w; out[o + 9] = logit(Math.min(0.995, Math.max(1e-4, 1 - a.keep))); out[o + 10] = 1; out[o + 11] = out[o + 12] = out[o + 13] = 0;
    }
    return { records: out, sh: outSh };
}

/** The octree of a cloud. Each node: { id, parent, children: [ids], bounds: [cx, cy, cz, half], leaf, count (real splats under it), records (its splats, or
 *  stand-ins), loaded }. Pure. */
export function buildLod(c, { leafSize = 256, proxies = 64, maxDepth = 16 } = {}) {
    if (!(c && c.count > 0)) throw new Error("splatLod.buildLod: an empty cloud");
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < c.count; i++) for (let a = 0; a < 3; a++) { const v = c.positions[i * 3 + a]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
    const K = c.sh ? SH_K[c.shDegree] || 0 : 0;
    if (K && c.sh.length < c.count * K * 3) throw new Error(`splatLod.buildLod: sh must hold ${K * 3} numbers a splat at degree ${c.shDegree}`);
    const nodes = [], root = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2, Math.max(1e-6, (hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2) * 1.0001];
    const make = (idx, bounds, parent, depth) => {
        const id = nodes.length, node = { id, parent, children: [], bounds, leaf: false, count: idx.length, records: null, loaded: true, ...(K ? { sh: null } : {}) }; nodes.push(node);
        if (idx.length <= leafSize || depth >= maxDepth) { node.leaf = true; node.records = recordsOf(c, idx); if (K) node.sh = shOf(c, idx, K); return node; }
        const [cx, cy, cz, r] = bounds, oct = Array.from({ length: 8 }, () => []);
        for (const i of idx) oct[(c.positions[i * 3] >= cx ? 1 : 0) | (c.positions[i * 3 + 1] >= cy ? 2 : 0) | (c.positions[i * 3 + 2] >= cz ? 4 : 0)].push(i);
        for (let q = 0; q < 8; q++) if (oct[q].length) node.children.push(make(oct[q], [cx + (q & 1 ? r / 2 : -r / 2), cy + (q & 2 ? r / 2 : -r / 2), cz + (q & 4 ? r / 2 : -r / 2), r / 2], id, depth + 1).id);
        const cat = (arrs) => { const all = new Float32Array(arrs.reduce((s, x) => s + x.length, 0)); let off = 0; for (const x of arrs) { all.set(x, off); off += x.length; } return all; };
        const m = mergeNode(cat(node.children.map((k) => nodes[k].records)), bounds, proxies, K ? cat(node.children.map((k) => nodes[k].sh)) : null, K);
        node.records = m.records; if (K) node.sh = m.sh;
        return node;
    };
    make(Array.from({ length: c.count }, (_, i) => i), root, -1, 0);
    return { nodes, count: c.count, leafSize, proxies, ...(K ? { shDegree: c.shDegree } : {}) };
}

/** How big a node looks: its radius over its distance, in pixels for a vertical field of view `fovy` at `height` pixels. Behind the camera is 0. Pure. */
export function screenSize(bounds, eye, fovy, height) {
    const d = Math.hypot(bounds[0] - eye[0], bounds[1] - eye[1], bounds[2] - eye[2]), r = bounds[3] * Math.sqrt(3);
    return d <= r ? Infinity : (r / d) * (height / 2) / Math.tan(fovy / 2);
}
/** The cut for one camera: { nodes (ids drawn), splats (their total), wanted (unloaded ids it would refine next, biggest first), capped (the budget stopped it) }. Pure. */
export function selectLod(lod, { eye, fovy = 0.9, height = 1080 }, { budget = 1e6, pixelThreshold = 1.5 } = {}) {
    // a node is refined while the SPACING OF ITS STAND-INS looks bigger than pixelThreshold: its g x g x g grid of cells over 2 x its half-size
    const g = Math.max(1, Math.floor(Math.cbrt(lod.proxies) + 1e-9)), N = lod.nodes, size = (id) => screenSize(N[id].bounds, eye, fovy, height) * (2 / g), n = (id) => N[id].records ? N[id].records.length / FLOATS : 0;
    const drawn = new Set([0]); let splats = n(0), capped = false; const wanted = [];
    const heap = [{ id: 0, s: size(0) }];   // a small max-heap by screen size
    const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p].s >= heap[i].s) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l].s > heap[m].s) m = l; if (r < heap.length && heap[r].s > heap[m].s) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
        const { id, s } = pop(); if (s < pixelThreshold) break;
        const node = N[id]; if (node.leaf) continue;
        if (node.children.some((k) => !N[k].loaded)) { wanted.push(id); continue; }
        const add = node.children.reduce((t, k) => t + n(k), 0) - n(id);
        if (splats + add > budget) { capped = true; continue; }
        drawn.delete(id); splats += add; for (const k of node.children) { drawn.add(k); push({ id: k, s: size(k) }); }
    }
    return { nodes: [...drawn].sort((a, b) => a - b), splats, wanted: wanted.flatMap((id) => N[id].children.filter((k) => !N[k].loaded)), capped };
}
/** The drawn nodes' splats as one cloud (SweK's shape). Pure. */
export function gatherSplats(lod, cut, into = null) {
    const K = lod.shDegree ? SH_K[lod.shDegree] : 0, W = K * 3;
    const total = cut.nodes.reduce((t, id) => t + lod.nodes[id].records.length / FLOATS, 0), c = into && into.capacity >= total && (!K || (into.sh && into.sh.length >= total * W)) ? into : Object.assign(emptyCloud(Math.max(1, total), K), { capacity: Math.max(1, total) });
    if (K) { let t = 0; for (const id of cut.nodes) { const sh = lod.nodes[id].sh; c.sh.set(sh, t); t += sh.length; } }
    let k = 0;
    for (const id of cut.nodes) { const r = lod.nodes[id].records, m = r.length / FLOATS; for (let j = 0; j < m; j++, k++) { const o = j * FLOATS; c.positions.set(r.subarray(o, o + 3), k * 3); c.scales.set(r.subarray(o + 3, o + 6), k * 3); c.colors.set(r.subarray(o + 6, o + 9), k * 3); c.opacities[k] = r[o + 9]; c.quats.set(r.subarray(o + 10, o + 14), k * 4); } }
    c.count = k; return c;
}

// ---- the compressed encoding (q17) ----
export const Q_BYTES = 17, Q_HEAD = 18;   // bytes a splat; floats of a node's ranges
const clampI = (v, max) => Math.max(0, Math.min(max, Math.round(v)));
/** A node's f32 records as q17 bytes: 18 f32 of ranges, then 17 bytes a splat. Pure. */
export function encodeQ(recs) {
    const n = recs.length / FLOATS, head = new Float32Array(Q_HEAD), out = new Uint8Array(Q_HEAD * 4 + n * Q_BYTES), dv = new DataView(out.buffer);
    for (const [base, at] of [[0, 0], [3, 6], [6, 12]]) for (let a = 0; a < 3; a++) {
        let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { const v = recs[i * FLOATS + base + a]; if (v < lo) lo = v; if (v > hi) hi = v; }
        head[at + a] = n ? lo : 0; head[at + 3 + a] = n ? hi - lo : 0;
    }
    out.set(new Uint8Array(head.buffer), 0);
    const q = (v, lo, ext, max) => (ext > 0 ? clampI(((v - lo) / ext) * max, max) : 0);
    for (let i = 0; i < n; i++) {
        const r = i * FLOATS, o = Q_HEAD * 4 + i * Q_BYTES;
        for (let a = 0; a < 3; a++) dv.setUint16(o + a * 2, q(recs[r + a], head[a], head[3 + a], 65535), true);
        for (let a = 0; a < 3; a++) out[o + 6 + a] = q(recs[r + 3 + a], head[6 + a], head[9 + a], 255);
        for (let a = 0; a < 3; a++) out[o + 9 + a] = q(recs[r + 6 + a], head[12 + a], head[15 + a], 255);
        out[o + 12] = clampI((1 / (1 + Math.exp(-recs[r + 9]))) * 255, 255);
        // rotation, smallest three: normalise, drop the largest component (made positive: q and -q are one rotation), keep the others in [-1/sqrt2, 1/sqrt2]
        let qv = [recs[r + 10], recs[r + 11], recs[r + 12], recs[r + 13]]; const len = Math.hypot(...qv) || 1; qv = qv.map((x) => x / len);
        let big = 0; for (let k = 1; k < 4; k++) if (Math.abs(qv[k]) > Math.abs(qv[big])) big = k;
        if (qv[big] < 0) qv = qv.map((x) => -x);
        let packed = big, shift = 2; for (let k = 0; k < 4; k++) if (k !== big) { packed |= clampI(((qv[k] * Math.SQRT2 + 1) / 2) * 1023, 1023) << shift; shift += 10; }
        dv.setUint32(o + 13, packed >>> 0, true);
    }
    return out;
}
/** q17 bytes back to f32 records. Pure. */
export function decodeQ(bytes) {
    const b = bytes.byteOffset % 4 ? bytes.slice() : bytes, head = new Float32Array(b.buffer, b.byteOffset, Q_HEAD), n = (b.length - Q_HEAD * 4) / Q_BYTES, dv = new DataView(b.buffer, b.byteOffset, b.byteLength), out = new Float32Array(n * FLOATS);
    for (let i = 0; i < n; i++) {
        const r = i * FLOATS, o = Q_HEAD * 4 + i * Q_BYTES;
        for (let a = 0; a < 3; a++) out[r + a] = head[a] + (dv.getUint16(o + a * 2, true) / 65535) * head[3 + a];
        for (let a = 0; a < 3; a++) out[r + 3 + a] = head[6 + a] + (b[o + 6 + a] / 255) * head[9 + a];
        for (let a = 0; a < 3; a++) out[r + 6 + a] = head[12 + a] + (b[o + 9 + a] / 255) * head[15 + a];
        const al = Math.min(1 - 1e-4, Math.max(1e-4, b[o + 12] / 255)); out[r + 9] = Math.log(al / (1 - al));
        const packed = dv.getUint32(o + 13, true), big = packed & 3, qv = [0, 0, 0, 0]; let shift = 2, ss = 0;
        for (let k = 0; k < 4; k++) if (k !== big) { const v = ((((packed >>> shift) & 1023) / 1023) * 2 - 1) / Math.SQRT2; qv[k] = v; ss += v * v; shift += 10; }
        qv[big] = Math.sqrt(Math.max(0, 1 - ss)); out.set(qv, r + 10);
    }
    return out;
}

/** A node's coefficients compressed: 3K f32 of minimum, 3K f32 of extent, then one byte a coefficient a splat. Pure. */
export function encodeShQ(sh, W) {
    const n = W ? sh.length / W : 0, head = new Float32Array(2 * W), out = new Uint8Array(8 * W + n * W);
    for (let t = 0; t < W; t++) { let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { const v = sh[i * W + t]; if (v < lo) lo = v; if (v > hi) hi = v; } head[t] = n ? lo : 0; head[W + t] = n ? hi - lo : 0; }
    out.set(new Uint8Array(head.buffer), 0);
    for (let i = 0; i < n; i++) for (let t = 0; t < W; t++) { const ext = head[W + t]; out[8 * W + i * W + t] = ext > 0 ? clampI(((sh[i * W + t] - head[t]) / ext) * 255, 255) : 0; }
    return out;
}
/** encodeShQ's bytes back to f32. Pure. */
export function decodeShQ(bytes, W) {
    const b = bytes.byteOffset % 4 ? bytes.slice() : bytes, head = new Float32Array(b.buffer, b.byteOffset, 2 * W), n = (b.length - 8 * W) / W, out = new Float32Array(n * W);
    for (let i = 0; i < n; i++) for (let t = 0; t < W; t++) out[i * W + t] = head[t] + (b[8 * W + i * W + t] / 255) * head[W + t];
    return out;
}

// ---- streaming ----
const MAGIC = "SWLOD1", MAGIC_Q = "SWLOD2";
/** One .swlod file's bytes: the magic, a u32 header length, the JSON header (the tree, each node's byte range), every node's splats -- compressed (q17,
 *  "SWLOD2") unless `compress` is false (plain f32, "SWLOD1"). Pure. */
export function packLod(lod, { compress = true } = {}) {
    const W = lod.shDegree ? SH_K[lod.shDegree] * 3 : 0, bytesOf = (f) => new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
    const recBlocks = lod.nodes.map((nd) => (compress ? encodeQ(nd.records) : bytesOf(nd.records))), shBlocks = W ? lod.nodes.map((nd) => (compress ? encodeShQ(nd.sh, W) : bytesOf(nd.sh))) : null;
    const blocks = recBlocks.map((rb, i) => { if (!W) return rb; const bl = new Uint8Array(rb.length + shBlocks[i].length); bl.set(rb, 0); bl.set(shBlocks[i], rb.length); return bl; });
    let off = 0; const meta = lod.nodes.map((nd, i) => { const len = blocks[i].length, m = { id: nd.id, parent: nd.parent, children: nd.children, bounds: nd.bounds, leaf: nd.leaf, count: nd.count, offset: off, length: len, ...(W ? { shOffset: recBlocks[i].length } : {}) }; off += len; return m; });
    const magic = compress ? MAGIC_Q : MAGIC, head = new TextEncoder().encode(JSON.stringify({ version: compress ? 2 : 1, encoding: compress ? "q17" : "f32", count: lod.count, leafSize: lod.leafSize, proxies: lod.proxies, ...(W ? { shDegree: lod.shDegree, shEncoding: compress ? "u8" : "f32" } : {}), nodes: meta }));
    const base = magic.length + 4 + head.length, out = new Uint8Array(base + off); out.set(new TextEncoder().encode(magic), 0); new DataView(out.buffer).setUint32(magic.length, head.length, true); out.set(head, magic.length + 4);
    blocks.forEach((bl, i) => out.set(bl, base + meta[i].offset));
    return out;
}
/** Open a .swlod by Range requests: `fetchRange(start, endInclusive)` resolves to the bytes. Resolves to { lod, load(ids) } with only the root loaded. */
export async function openLodStream(fetchRange) {
    const pre = await fetchRange(0, MAGIC.length + 3);
    const magic = new TextDecoder().decode(pre.subarray(0, MAGIC.length));
    if (magic !== MAGIC && magic !== MAGIC_Q) throw new Error("splatLod: not a .swlod file");
    const compressed = magic === MAGIC_Q;
    const hlen = new DataView(pre.buffer, pre.byteOffset).getUint32(MAGIC.length, true), head = JSON.parse(new TextDecoder().decode(await fetchRange(MAGIC.length + 4, MAGIC.length + 3 + hlen)));
    const base = MAGIC.length + 4 + hlen, nodes = head.nodes.map((m) => ({ ...m, records: null, loaded: false })), lod = { nodes, count: head.count, leafSize: head.leafSize, proxies: head.proxies, ...(head.shDegree ? { shDegree: head.shDegree } : {}) }, inflight = new Map(), W = head.shDegree ? SH_K[head.shDegree] * 3 : 0;
    const load = (ids) => Promise.all(ids.map((id) => {
        const nd = nodes[id]; if (nd.loaded) return Promise.resolve(nd); if (inflight.has(id)) return inflight.get(id);
        const p = fetchRange(base + nd.offset, base + nd.offset + nd.length - 1).then((b) => {
            const rb = W ? b.subarray(0, nd.shOffset) : b; nd.records = compressed ? decodeQ(rb) : new Float32Array(rb.slice().buffer, 0, rb.length / 4);
            if (W) { const sb = b.subarray(nd.shOffset); nd.sh = compressed ? decodeShQ(sb, W) : new Float32Array(sb.slice().buffer, 0, sb.length / 4); }
            nd.loaded = true; inflight.delete(id); return nd; });
        inflight.set(id, p); return p;
    }));
    await load([0]);
    return { lod, load, base, compressed };
}
/** Range requests over HTTP for openLodStream. */
export const httpRange = (url, fetchFn = fetch) => async (a, b) => { const r = await fetchFn(url, { headers: { Range: `bytes=${a}-${b}` } }); if (!(r.status === 206 || r.status === 200)) throw new Error(`splatLod: ${url} answered ${r.status}`); const buf = new Uint8Array(await r.arrayBuffer()); return r.status === 200 ? buf.subarray(a, b + 1) : buf; };
