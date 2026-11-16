// WebGLEngine/brain/rl/splitShuffle.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THREE SHUFFLES OF A CIRCUIT'S CONNECTIONS THAT EACH KEEP ONE PART OF WHAT brain/rl/degreeShuffle.mjs KEEPS WHOLE (the escape round 7, registered in brain/FLY_ESCAPE_SPLIT_WIP.md).
// A connection is [to, from] and keeps its place in the list, so a list of strengths in the same order goes with it.
//   inShuffle    a connection keeps its TARGET; its source is drawn anew from the other cells. Every cell keeps its count in and, with the strengths, what it receives; its count out is chance's.
//   outShuffle   a connection keeps its SOURCE; its target is drawn anew. Every cell keeps its count out and what it sends; its count in is chance's.
//   keepOnto     the connections onto the cells named stay as they are, whole; every other connection is placed freely among the places that are not onto one of those cells.
// No connection is from a cell to itself and none is in a list twice. Pure: no I/O, no clock, no Math.random.
"use strict";
import { mulberry32 } from "./paintCircuitPolicy.mjs";

function checked(name, edges, units, seed) {
    if (!Number.isInteger(units) || units < 2) throw new Error(`${name}: units is a whole number, at least 2 (got ${units})`);
    if (!Array.isArray(edges) || !edges.every((e) => Array.isArray(e) && e.length === 2 && Number.isInteger(e[0]) && Number.isInteger(e[1]) && e[0] >= 0 && e[1] >= 0 && e[0] < units && e[1] < units && e[0] !== e[1])) throw new Error(`${name}: edges is a list of [to, from] pairs of cells 0..${units - 1}, none a cell to itself`);
    if (new Set(edges.map((e) => e[0] * 65536 + e[1])).size !== edges.length) throw new Error(`${name}: a connection is in the list twice`);
    if (!Number.isInteger(seed)) throw new Error(`${name}: the seed is a whole number (got ${seed})`);
}
/** One end (`keep`: 0 the target, 1 the source) of every connection stays; the other is drawn, in the list's order, evenly from the cells that are not the kept one and not already joined to it that way (the list is distinct, so there is always one). */
function redraw(name, edges, units, seed, keep) {
    checked(name, edges, units, seed);
    const r = mulberry32(seed >>> 0), used = new Map(), out = [];
    for (const e of edges) {
        const k = e[keep]; if (!used.has(k)) used.set(k, new Set([k]));
        const u = used.get(k), free = []; for (let c = 0; c < units; c++) if (!u.has(c)) free.push(c);
        const c = free[Math.floor(r() * free.length)]; u.add(c); out.push(keep === 0 ? [k, c] : [c, k]);
    }
    return out;
}
/** See the header. */
export function inShuffle(edges, units, seed) { return redraw("inShuffle", edges, units, seed, 0); }
/** See the header. */
export function outShuffle(edges, units, seed) { return redraw("outShuffle", edges, units, seed, 1); }
/** See the header. `onto` is the list of cells whose incoming connections are kept. */
export function keepOnto(edges, units, onto, seed) {
    checked("keepOnto", edges, units, seed);
    if (!Array.isArray(onto) || !onto.every((c) => Number.isInteger(c) && c >= 0 && c < units)) throw new Error(`keepOnto: onto is a list of cells 0..${units - 1}`);
    const kept = new Set(onto), all = [];
    for (let to = 0; to < units; to++) if (!kept.has(to)) for (let from = 0; from < units; from++) if (to !== from) all.push([to, from]);
    const r = mulberry32(seed >>> 0);
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = all[i]; all[i] = all[j]; all[j] = t; }
    let n = 0; return edges.map((e) => (kept.has(e[0]) ? [e[0], e[1]] : all[n++]));
}
