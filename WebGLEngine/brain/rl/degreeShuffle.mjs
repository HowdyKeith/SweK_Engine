// WebGLEngine/brain/rl/degreeShuffle.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A SHUFFLE OF A CIRCUIT'S CONNECTIONS THAT KEEPS EVERY CELL'S COUNT OF CONNECTIONS IN AND ITS COUNT OUT (the escape round 6, registered in brain/FLY_ESCAPE_DEGREE_WIP.md).
// brain/rl/paintCircuitPolicy.mjs's shuffledEdges() places a circuit's connections anywhere, so a cell that many cells reach in the real circuit is reached by few in its shuffle. This one starts from
// the real list and swaps the SOURCES of two connections, many times: [to a, from b] and [to c, from d] become [to a, from d] and [to c, from b]. A swap is refused if it would make a connection from a
// cell to itself or one that is already in the list. A connection keeps its place in the list and its target, so a list of strengths in the same order gives every cell the strengths it had, from
// other cells. Each cell's count in and count out are the real ones, exactly, whatever the seed.
// Pure: no I/O, no clock, no Math.random.
"use strict";
import { mulberry32 } from "./paintCircuitPolicy.mjs";

export const SWAPS_PER_EDGE = 20;   // swaps tried, a connection: enough that hardly a connection keeps its source (the gate counts those that do)

/** `edges` ([to, from] pairs, distinct, none a cell to itself) with their sources shuffled as the header says; the same seed, the same list. */
export function degreeShuffle(edges, seed) {
    if (!Array.isArray(edges) || !edges.every((e) => Array.isArray(e) && e.length === 2 && Number.isInteger(e[0]) && Number.isInteger(e[1]) && e[0] >= 0 && e[1] >= 0 && e[0] !== e[1])) throw new Error("degreeShuffle: edges is a list of [to, from] pairs of whole numbers, none a cell to itself");
    if (!Number.isInteger(seed)) throw new Error(`degreeShuffle: the seed is a whole number (got ${seed})`);
    const out = edges.map((e) => [e[0], e[1]]), key = (to, from) => to * 65536 + from, have = new Set(out.map((e) => key(e[0], e[1])));
    if (have.size !== out.length) throw new Error("degreeShuffle: a connection is in the list twice");
    const r = mulberry32(seed >>> 0), n = out.length;
    if (n < 2) return out;
    for (let t = 0; t < n * SWAPS_PER_EDGE; t++) {
        const i = Math.floor(r() * n), j = Math.floor(r() * n), a = out[i], b = out[j];
        if (i === j || a[1] === b[1] || a[0] === b[1] || b[0] === a[1] || have.has(key(a[0], b[1])) || have.has(key(b[0], a[1]))) continue;
        have.delete(key(a[0], a[1])); have.delete(key(b[0], b[1]));
        const s = a[1]; a[1] = b[1]; b[1] = s;
        have.add(key(a[0], a[1])); have.add(key(b[0], b[1]));
    }
    return out;
}
export default degreeShuffle;
