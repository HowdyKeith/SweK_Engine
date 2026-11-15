// WebGLEngine/brain/sparseRecurrent.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A CONNECTOME'S RECURRENT STEP OVER ITS CONNECTIONS ONLY. Every circuit network in this tree takes its recurrent step as relu(Wm @ h), with Wm the identity plus one weight a connection and every other entry structurally zero. For 34 or 40 neurons the dense product is nothing. The circuits vendored on 2026-11-15 are
// 220 and 281 neurons: dense, three steps are 145,000 and 237,000 multiply-adds a forward pass for a matrix that is 84% and 92% zeros, in an arena whose whole tick was a third of a millisecond. This is the step over the nonzero entries -- and THE SAME FLOAT32 VALUES AS render/brainTsl.mjs's mlpLayerCpu, by the
// argument brain/gunnerPolicy.mjs makes for its own masked step: a skipped entry contributes f(h[k] * 0) = +-0, adding +-0 leaves a nonzero float32 sum unchanged and can only flip the sign of a zero one, the entries that are kept are visited in the same ascending order of column, and the relu's Math.max(acc, 0)
// then gives +0 for either zero. The gate compares it with the dense layer bit for bit, over a real circuit and over random ones.
//
//   createCore(n, edges)   edges: [toIdx, fromIdx] pairs. -> { n, entries, build(wrec) -> vals (a Float32Array: the matrix's kept entries, row by row), step(vals, h) -> Float32Array(n), dense(wrec) -> the n x n matrix (for a comparison) }
//   build() is the matrix as layersOf() has always made it: 1 on the diagonal, then each connection's weight ADDED at [to, from] in the edges' order, in float32 -- a connection from a neuron to itself or a pair listed twice adds where it lands, as it does dense.
// Pure: no I/O, no clock, no Math.random.
"use strict";
export function createCore(n, edges) {
    if (!Number.isInteger(n) || n < 1 || !Array.isArray(edges)) throw new Error("sparseRecurrent.createCore: (the number of neurons, the [toIdx, fromIdx] pairs)");
    const slotOf = new Map(), cols = [];
    for (let i = 0; i < n; i++) cols.push(new Set([i]));
    for (const [to, from] of edges) { if (!Number.isInteger(to) || !Number.isInteger(from) || to < 0 || from < 0 || to >= n || from >= n) throw new Error(`sparseRecurrent.createCore: an edge names a neuron the wiring does not have ([${to}, ${from}] of ${n})`); cols[to].add(from); }
    const rowStart = new Int32Array(n + 1), colIdx = []; let entries = 0;
    for (let i = 0; i < n; i++) { rowStart[i] = entries; for (const c of [...cols[i]].sort((a, b) => a - b)) { slotOf.set(i * n + c, entries++); colIdx.push(c); } }
    rowStart[n] = entries;
    const COL = Int32Array.from(colIdx), DIAG = Int32Array.from({ length: n }, (_, i) => slotOf.get(i * n + i)), EDGE = Int32Array.from(edges, ([to, from]) => slotOf.get(to * n + from)), f = Math.fround;
    function build(wrec) { const vals = new Float32Array(entries); for (let i = 0; i < n; i++) vals[DIAG[i]] = 1; for (let k = 0; k < EDGE.length; k++) vals[EDGE[k]] += wrec[k]; return vals; }
    function step(vals, h) { const y = new Float32Array(n); for (let i = 0; i < n; i++) { let acc = 0; for (let s = rowStart[i], e = rowStart[i + 1]; s < e; s++) acc = f(acc + f(f(h[COL[s]]) * vals[s])); y[i] = acc > 0 ? acc : 0; } return y; }
    function dense(wrec) { const W = new Float32Array(n * n); for (let i = 0; i < n; i++) W[i * n + i] = 1; edges.forEach(([to, from], k) => { W[to * n + from] += wrec[k]; }); return W; }
    return Object.freeze({ n, entries, build, step, dense });
}
