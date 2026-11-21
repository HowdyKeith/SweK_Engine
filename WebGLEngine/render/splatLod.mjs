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
// WHAT IS NOT HERE: PlayCanvas's compressed .sog encoding (this file is plain f32: correct first, small later), spherical harmonics, a worker.
"use strict";

export const FLOATS = 14;   // x y z | log-scale x y z | r g b | pre-sigmoid opacity | quaternion w x y z
const sig = (x) => 1 / (1 + Math.exp(-x)), logit = (p) => Math.log(p / (1 - p));

/** A cloud of `n` splats in SweK's shape, zeroed. */
export function emptyCloud(n) { return { count: n, positions: new Float32Array(n * 3), scales: new Float32Array(n * 3), colors: new Float32Array(n * 3), opacities: new Float32Array(n), quats: new Float32Array(n * 4) }; }
function recordsOf(c, idx) { const out = new Float32Array(idx.length * FLOATS); idx.forEach((i, k) => { const o = k * FLOATS; out.set(c.positions.subarray(i * 3, i * 3 + 3), o); out.set(c.scales.subarray(i * 3, i * 3 + 3), o + 3); out.set(c.colors.subarray(i * 3, i * 3 + 3), o + 6); out[o + 9] = c.opacities[i]; out.set(c.quats.subarray(i * 4, i * 4 + 4), o + 10); }); return out; }

/** Merge splat records into at most `max` stand-ins: one per occupied cell of a g^3 grid over `bounds`, g grown until the cells would exceed max. Pure. */
export function mergeRecords(recs, bounds, max) {
    const n = recs.length / FLOATS; if (n <= max) return recs.slice();
    const [cx, cy, cz, r] = bounds; let g = 1; while ((g + 1) ** 3 <= max) g++;
    const cells = new Map();
    for (let i = 0; i < n; i++) {
        const o = i * FLOATS, cell = (v, c) => Math.max(0, Math.min(g - 1, Math.floor(((v - c + r) / (2 * r)) * g)));
        const key = cell(recs[o], cx) + g * (cell(recs[o + 1], cy) + g * cell(recs[o + 2], cz));
        let a = cells.get(key); if (!a) cells.set(key, (a = { w: 0, x: 0, y: 0, z: 0, xx: 0, yy: 0, zz: 0, s2: 0, r: 0, g: 0, b: 0, keep: 1, k: 0 }));
        const alpha = sig(recs[o + 9]), sx = Math.exp(recs[o + 3]), sy = Math.exp(recs[o + 4]), sz = Math.exp(recs[o + 5]), w = alpha * (sx * sy * sz) ** (2 / 3) + 1e-12;
        a.w += w; a.x += w * recs[o]; a.y += w * recs[o + 1]; a.z += w * recs[o + 2]; a.xx += w * recs[o] ** 2; a.yy += w * recs[o + 1] ** 2; a.zz += w * recs[o + 2] ** 2;
        a.s2 += w * (sx * sx + sy * sy + sz * sz) / 3; a.r += w * recs[o + 6]; a.g += w * recs[o + 7]; a.b += w * recs[o + 8]; a.keep *= 1 - alpha; a.k++;
    }
    const out = new Float32Array(cells.size * FLOATS); let k = 0;
    for (const a of cells.values()) {
        const o = k++ * FLOATS, mx = a.x / a.w, my = a.y / a.w, mz = a.z / a.w, spread = Math.max(0, a.xx / a.w - mx * mx, a.yy / a.w - my * my, a.zz / a.w - mz * mz), s = Math.sqrt(spread + a.s2 / a.w);   // the WIDEST axis's spread: a round stand-in must cover a long cluster, not its average
        out[o] = mx; out[o + 1] = my; out[o + 2] = mz; out[o + 3] = out[o + 4] = out[o + 5] = Math.log(Math.max(1e-6, s));
        out[o + 6] = a.r / a.w; out[o + 7] = a.g / a.w; out[o + 8] = a.b / a.w; out[o + 9] = logit(Math.min(0.995, Math.max(1e-4, 1 - a.keep))); out[o + 10] = 1; out[o + 11] = out[o + 12] = out[o + 13] = 0;
    }
    return out;
}

/** The octree of a cloud. Each node: { id, parent, children: [ids], bounds: [cx, cy, cz, half], leaf, count (real splats under it), records (its splats, or
 *  stand-ins), loaded }. Pure. */
export function buildLod(c, { leafSize = 256, proxies = 64, maxDepth = 16 } = {}) {
    if (!(c && c.count > 0)) throw new Error("splatLod.buildLod: an empty cloud");
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < c.count; i++) for (let a = 0; a < 3; a++) { const v = c.positions[i * 3 + a]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
    const nodes = [], root = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2, Math.max(1e-6, (hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2) * 1.0001];
    const make = (idx, bounds, parent, depth) => {
        const id = nodes.length, node = { id, parent, children: [], bounds, leaf: false, count: idx.length, records: null, loaded: true }; nodes.push(node);
        if (idx.length <= leafSize || depth >= maxDepth) { node.leaf = true; node.records = recordsOf(c, idx); return node; }
        const [cx, cy, cz, r] = bounds, oct = Array.from({ length: 8 }, () => []);
        for (const i of idx) oct[(c.positions[i * 3] >= cx ? 1 : 0) | (c.positions[i * 3 + 1] >= cy ? 2 : 0) | (c.positions[i * 3 + 2] >= cz ? 4 : 0)].push(i);
        for (let q = 0; q < 8; q++) if (oct[q].length) node.children.push(make(oct[q], [cx + (q & 1 ? r / 2 : -r / 2), cy + (q & 2 ? r / 2 : -r / 2), cz + (q & 4 ? r / 2 : -r / 2), r / 2], id, depth + 1).id);
        const kids = node.children.map((k) => nodes[k].records), all = new Float32Array(kids.reduce((s, x) => s + x.length, 0)); let off = 0; for (const x of kids) { all.set(x, off); off += x.length; }
        node.records = mergeRecords(all, bounds, proxies);
        return node;
    };
    make(Array.from({ length: c.count }, (_, i) => i), root, -1, 0);
    return { nodes, count: c.count, leafSize, proxies };
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
    const total = cut.nodes.reduce((t, id) => t + lod.nodes[id].records.length / FLOATS, 0), c = into && into.capacity >= total ? into : Object.assign(emptyCloud(Math.max(1, total)), { capacity: Math.max(1, total) });
    let k = 0;
    for (const id of cut.nodes) { const r = lod.nodes[id].records, m = r.length / FLOATS; for (let j = 0; j < m; j++, k++) { const o = j * FLOATS; c.positions.set(r.subarray(o, o + 3), k * 3); c.scales.set(r.subarray(o + 3, o + 6), k * 3); c.colors.set(r.subarray(o + 6, o + 9), k * 3); c.opacities[k] = r[o + 9]; c.quats.set(r.subarray(o + 10, o + 14), k * 4); } }
    c.count = k; return c;
}

// ---- streaming ----
const MAGIC = "SWLOD1";
/** One .swlod file's bytes: the magic, a u32 header length, the JSON header (the tree, each node's byte range), every node's records. Pure. */
export function packLod(lod) {
    let off = 0; const meta = lod.nodes.map((nd) => { const len = nd.records.length * 4, m = { id: nd.id, parent: nd.parent, children: nd.children, bounds: nd.bounds, leaf: nd.leaf, count: nd.count, offset: off, length: len }; off += len; return m; });
    const head = new TextEncoder().encode(JSON.stringify({ version: 1, count: lod.count, leafSize: lod.leafSize, proxies: lod.proxies, nodes: meta }));
    const base = MAGIC.length + 4 + head.length, out = new Uint8Array(base + off); out.set(new TextEncoder().encode(MAGIC), 0); new DataView(out.buffer).setUint32(MAGIC.length, head.length, true); out.set(head, MAGIC.length + 4);
    for (const nd of lod.nodes) out.set(new Uint8Array(nd.records.buffer, nd.records.byteOffset, nd.records.byteLength), base + meta[nd.id].offset);
    return out;
}
/** Open a .swlod by Range requests: `fetchRange(start, endInclusive)` resolves to the bytes. Resolves to { lod, load(ids) } with only the root loaded. */
export async function openLodStream(fetchRange) {
    const pre = await fetchRange(0, MAGIC.length + 3);
    if (new TextDecoder().decode(pre.subarray(0, MAGIC.length)) !== MAGIC) throw new Error("splatLod: not a .swlod file");
    const hlen = new DataView(pre.buffer, pre.byteOffset).getUint32(MAGIC.length, true), head = JSON.parse(new TextDecoder().decode(await fetchRange(MAGIC.length + 4, MAGIC.length + 3 + hlen)));
    const base = MAGIC.length + 4 + hlen, nodes = head.nodes.map((m) => ({ ...m, records: null, loaded: false })), lod = { nodes, count: head.count, leafSize: head.leafSize, proxies: head.proxies }, inflight = new Map();
    const load = (ids) => Promise.all(ids.map((id) => {
        const nd = nodes[id]; if (nd.loaded) return Promise.resolve(nd); if (inflight.has(id)) return inflight.get(id);
        const p = fetchRange(base + nd.offset, base + nd.offset + nd.length - 1).then((b) => { nd.records = new Float32Array(b.slice().buffer, 0, nd.length / 4); nd.loaded = true; inflight.delete(id); return nd; });
        inflight.set(id, p); return p;
    }));
    await load([0]);
    return { lod, load, base };
}
/** Range requests over HTTP for openLodStream. */
export const httpRange = (url, fetchFn = fetch) => async (a, b) => { const r = await fetchFn(url, { headers: { Range: `bytes=${a}-${b}` } }); if (!(r.status === 206 || r.status === 200)) throw new Error(`splatLod: ${url} answered ${r.status}`); const buf = new Uint8Array(await r.arrayBuffer()); return r.status === 200 ? buf.subarray(a, b + 1) : buf; };
