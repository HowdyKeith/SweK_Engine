// WebGLEngine/render/brainLens.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE STEER LENS OF THE BRAIN PANEL: for a network brain, which of its hidden neurons is doing what to its outputs right now, and what each would do if it were pushed. The idea (not the code) is the steering view of lyramakemusic/neuron-explorer, which
// pushes a neuron up and down and reads what the model changes; here the network is a hundred neurons, not a language model, so the whole table is computed every redraw instead of sampled.
//
//   THE PUSH      neuron i set to its value + `dose` x the layer's rms (never under `floorRms`, so a silent layer still gets a measurable push) -- the change in each output, through the output layer (its own activation, whatever it is).
//   THE ABLATION  neuron i set to zero -- the change in each output: what the neuron contributes to that output NOW. A relu neuron that is off has an ablation of zero and a push that says what waking it would do.
//   THE RANK      by the largest |ablation| (what it is doing), the push the tie-break (what it could). The panel shows the top `top`.
//   THE LINKS     the strongest weights into a neuron and out of it (`connections`), by absolute weight, named from the feature names when the layer reads the features.
//
// WHAT IT IS NOT: a causal account of the whole network. It is the DIRECT path through the OUTPUT layer only (the hidden layer's own inputs are not re-run: pushing h7 does not move the neurons h7 feeds in a recurrent step), and the outputs it reads are the
// output layer's, before the panel's own range mapping (a throttle mapped from 0..1 to -1..1). Said plainly on the panel's note. Pure: no DOM, no clock, no Math.random.
"use strict";
import { mlpLayerCpu } from "./brainTsl.mjs";

export const LENS = Object.freeze({ dose: 0.5, floorRms: 0.05, top: 8, links: 3 });
const num = (v) => (Number.isFinite(v) ? v : 0);

/**
 * The lens of a network. `layers` is the policy's layersOf(w) (the last layer is the output layer), `hidden` the state before it (activations().hidden), `outputNames` the outputs' names.
 * Returns { outputs, dose, scale, rows: [{ i, h, push: [per output], ablate: [per output], drive, reach }] sorted by drive then reach, base: [the outputs unpushed], col (the layered map's column of these neurons) }, or null when the output layer does not read `hidden`.
 */
export function steerLens(layers, hidden, outputNames, { dose = LENS.dose, floorRms = LENS.floorRms } = {}) {
    const L = layers && layers[layers.length - 1];
    if (!L || !hidden || L.nIn !== hidden.length || L.nOut !== outputNames.length) return null;
    const n = hidden.length, h0 = Float32Array.from(hidden, num);
    let ss = 0; for (let i = 0; i < n; i++) ss += h0[i] * h0[i];
    const scale = Math.max(Math.sqrt(ss / n), floorRms) * dose, base = mlpLayerCpu(L, h0, 1), rows = [];
    for (let i = 0; i < n; i++) {
        const up = Float32Array.from(h0); up[i] = h0[i] + scale;
        const off = Float32Array.from(h0); off[i] = 0;
        const yu = mlpLayerCpu(L, up, 1), yo = mlpLayerCpu(L, off, 1);
        const push = Array.from(base, (b, j) => num(yu[j] - b)), ablate = Array.from(base, (b, j) => num(yo[j] - b));
        rows.push({ i, h: h0[i], push, ablate, drive: Math.max(...ablate.map(Math.abs)), reach: Math.max(...push.map(Math.abs)) });
    }
    rows.sort((a, b) => b.drive - a.drive || b.reach - a.reach || a.i - b.i);
    return { outputs: [...outputNames], dose, scale, rows, base: Array.from(base, num), col: layers.length - 1 };
}

/** The strongest weights into neuron `i` (from the layer before the output layer) and out of it (into each output): { into: [{ from, name, w }], out: [{ to, name, w }] }, each at most `k`, by |w|. `inputNames` name the layer's inputs when it reads the features. */
export function connections(layers, i, { k = LENS.links, inputNames = null, outputNames = [] } = {}) {
    const Lout = layers[layers.length - 1], Lin = layers.length >= 2 ? layers[layers.length - 2] : null, into = [], out = [];
    if (Lin && i >= 0 && i < Lin.nOut) for (let f = 0; f < Lin.nIn; f++) into.push({ from: f, name: inputNames && inputNames.length === Lin.nIn ? inputNames[f] : "h" + f, w: num(Lin.W[i * Lin.nIn + f]) });
    if (Lout && i >= 0 && i < Lout.nIn) for (let j = 0; j < Lout.nOut; j++) out.push({ to: j, name: outputNames[j] ?? "o" + j, w: num(Lout.W[j * Lout.nIn + i]) });
    const byAbs = (a, b) => Math.abs(b.w) - Math.abs(a.w) || a.from - b.from || a.to - b.to;
    return { into: into.sort(byAbs).slice(0, k), out: out.sort(byAbs).slice(0, k) };
}

const POS = "#59d1ff", NEG = "#f6a623", TICK = "#ffffff";
/**
 * Draw the lens on a 2D context in the box (x, y, w, h): a header of the output names and a row per top neuron -- its name and value on the left, then per output a bar of the PUSH (blue up, amber down, from the cell's centre)
 * and a white tick where the ABLATION lands. Returns { rows, cells, bars } what was drawn.
 */
export function drawLens(g, x, y, w, h, lens, { top = LENS.top, title = "steer lens (direct path)", sel = null } = {}) {
    g.fillStyle = "#050805"; g.fillRect(x, y, w, h);
    g.font = "10px ui-monospace,Menlo,monospace"; g.fillStyle = "#7c93b8";
    if (!lens) { g.fillText(`${title}: this brain's output layer does not read its hidden layer`, x + 4, y + 12); return { rows: 0, cells: 0, bars: 0, rects: [] }; }
    const shown = lens.rows.slice(0, top), nameW = 62, colW = (w - nameW - 4) / lens.outputs.length, rowH = Math.min(14, (h - 16) / Math.max(1, shown.length));
    g.fillText(`${title}  push +${lens.dose} rms (bar)  ablate (tick)`, x + 4, y + 10);
    let big = 1e-9; for (const r of shown) for (let j = 0; j < lens.outputs.length; j++) big = Math.max(big, Math.abs(r.push[j]), Math.abs(r.ablate[j]));
    lens.outputs.forEach((o, j) => g.fillText(String(o).slice(0, Math.max(2, Math.floor(colW / 6))), x + nameW + j * colW + 2, y + 21));
    let cells = 0, bars = 0; const rects = [];
    shown.forEach((r, k) => {
        const ry = y + 24 + k * rowH;
        rects.push({ layer: lens.col, i: r.i, bx: x, by: ry, bw: w, bh: rowH });   // a click anywhere on the row selects the neuron
        if (sel && sel.layer === lens.col && sel.i === r.i) { g.fillStyle = "#16301c"; g.fillRect(x, ry, w, rowH); g.strokeStyle = TICK; g.lineWidth = 1; g.strokeRect(x + 0.5, ry + 0.5, w - 1, rowH - 1); }
        g.fillStyle = "#c9d6ea"; g.fillText(`h${r.i} ${r.h >= 0 ? "+" : ""}${r.h.toFixed(2)}`, x + 4, ry + rowH - 3);
        for (let j = 0; j < lens.outputs.length; j++) {
            const cx = x + nameW + j * colW + colW / 2, half = colW / 2 - 3, p = r.push[j] / big, a = r.ablate[j] / big;
            g.fillStyle = "#101810"; g.fillRect(cx - half, ry + 1, 2 * half, rowH - 3); cells++;
            if (Math.abs(p) > 1e-6) { g.fillStyle = p > 0 ? POS : NEG; g.fillRect(p > 0 ? cx : cx + p * half, ry + 2, Math.abs(p) * half, rowH - 5); bars++; }
            if (Math.abs(a) > 1e-6) { g.fillStyle = TICK; g.fillRect(cx + a * half - 1, ry, 2, rowH - 1); }
        }
    });
    return { rows: shown.length, cells, bars, rects };
}

// ---- v4904: THE LAYERED MAP, THE SELECTED NEURON, AND THE STEER -----------------------------------------------------------------------------------------------------------------------------------------------
// THE LAYERED MAP (the layers-in-a-view of lyramakemusic/neuron-explorer, as an idea): every layer a COLUMN of dots (one dot a neuron, blue when it is positive, amber when it is negative, brighter the larger against its own column), the columns
// left to right from the features to the outputs (a recurrent circuit's steps are unrolled: features, hidden, each recurrent step, outputs), and between neighbouring columns the strongest CONTRIBUTIONS (weight x the sending neuron's value) as lines,
// the two biggest into every neuron; a SELECTED neuron also gets its six biggest in and six biggest out. It is the picture of the numbers the panel already holds, drawn, with the weights and values read from the network and never invented.
// THE SELECTED NEURON is (layer, i) in these columns; the lens's rows select a neuron of the LAST hidden layer, a dot of the map any. THE STEER: pushing neuron i of the last hidden layer by delta changes output j by W[j,i] x delta through the output layer
// -- which is the same as adding W[j,i] x delta to that layer's bias, so a steered copy of the weights is a pilot like any other (steerWeights), with no change to the policy. WHAT IT IS NOT: the push does not move the neurons the hidden layer feeds
// (there are none after it) and a recurrent circuit's earlier steps are left alone, so it is the direct path the lens already names.

/** The states of every layer for the features `x`: [{ n, values (Float32Array), label }] -- the input, then each layer's output (its own activation applied; the last layer's output is raw). `names` optionally gives { input, output } name lists. */
export function layerStates(layers, x, names = {}) {
    let cur = Float32Array.from(x, num); const out = [{ n: cur.length, values: cur, label: "features", names: names.input || null }];
    layers.forEach((L, k) => { cur = mlpLayerCpu(L, cur, 1); out.push({ n: cur.length, values: Float32Array.from(cur, num), label: k === layers.length - 1 ? "outputs" : "h" + (k + 1), names: k === layers.length - 1 ? names.output || null : null }); });
    return out;
}

/**
 * The map of a network at features `x`: { cols: [{ n, values, label, names }], edges: [{ l (the column the line starts in), from, to, w (weight), c (contribution) }], sel }. `perNeuron` is how many of the biggest contributions into each neuron are kept (default 2);
 * `sel` = { layer, i } also keeps that neuron's six biggest contributions in and six out and is returned as `sel` (null when it names no neuron of the map).
 */
export function layerMap(layers, x, { names = {}, perNeuron = 2, sel = null } = {}) {
    const cols = layerStates(layers, x, names), edges = [];
    layers.forEach((L, l) => {
        const a = cols[l].values;
        for (let to = 0; to < L.nOut; to++) {
            const row = []; for (let from = 0; from < L.nIn; from++) row.push({ l, from, to, w: num(L.W[to * L.nIn + from]), c: num(L.W[to * L.nIn + from]) * a[from] });
            row.sort((p, q) => Math.abs(q.c) - Math.abs(p.c) || p.from - q.from);
            for (const e of row.slice(0, perNeuron)) if (e.c !== 0) edges.push(e);
        }
    });
    const ok = sel && Number.isInteger(sel.layer) && sel.layer >= 0 && sel.layer < cols.length && Number.isInteger(sel.i) && sel.i >= 0 && sel.i < cols[sel.layer].n;
    if (ok) {
        const key = (e) => e.l + ":" + e.from + ":" + e.to, have = new Set(edges.map(key)), add = (e) => { if (!have.has(key(e)) && e.c !== 0) { have.add(key(e)); edges.push(e); } };
        if (sel.layer > 0) { const L = layers[sel.layer - 1], a = cols[sel.layer - 1].values, row = []; for (let from = 0; from < L.nIn; from++) row.push({ l: sel.layer - 1, from, to: sel.i, w: num(L.W[sel.i * L.nIn + from]), c: num(L.W[sel.i * L.nIn + from]) * a[from] }); row.sort((p, q) => Math.abs(q.c) - Math.abs(p.c) || p.from - q.from); row.slice(0, 6).forEach(add); }
        if (sel.layer < layers.length) { const L = layers[sel.layer], a = cols[sel.layer].values, row = []; for (let to = 0; to < L.nOut; to++) row.push({ l: sel.layer, from: sel.i, to, w: num(L.W[to * L.nIn + sel.i]), c: num(L.W[to * L.nIn + sel.i]) * a[sel.i] }); row.sort((p, q) => Math.abs(q.c) - Math.abs(p.c) || p.to - q.to); row.slice(0, 6).forEach(add); }
    }
    return { cols, edges, sel: ok ? { layer: sel.layer, i: sel.i } : null };
}

/**
 * Draw the map in the box (x, y, w, h). Returns { dots, lines, rects } what was drawn; `rects` are [{ layer, i, x, y, r }] -- the hit areas of the dots in canvas coordinates (radius at least 4 so a click lands), for pickNeuron.
 * The lines of the selected neuron are drawn last and brighter; a line is blue where the contribution is positive and amber where it is negative, its strength the contribution against the largest drawn.
 */
export function drawLayerMap(g, x, y, w, h, map, { title = "layers" } = {}) {
    g.fillStyle = "#050805"; g.fillRect(x, y, w, h); g.font = "10px ui-monospace,Menlo,monospace";
    if (!map || !map.cols || map.cols.length < 2) { g.fillStyle = "#7c93b8"; g.fillText(`${title}: no network to draw`, x + 4, y + 12); return { dots: 0, lines: 0, rects: [] }; }
    const K = map.cols.length, padX = 26, top = 22, bot = 12, dx = (w - 2 * padX) / (K - 1), rects = [], pos = map.cols.map((c, k) => { const dy = (h - top - bot) / c.n, r = Math.max(1.2, Math.min(dy / 2 - 0.4, 4)); return { k, dy, r, x: x + padX + k * dx, at: (i) => y + top + (i + 0.5) * dy }; });
    g.fillStyle = "#7c93b8"; g.fillText(`${title}  (dot: value, line: weight x value)`, x + 4, y + 11);
    map.cols.forEach((c, k) => g.fillText(String(c.label), pos[k].x - 10, y + h - 2));
    let big = 1e-9; for (const e of map.edges) big = Math.max(big, Math.abs(e.c));
    const sel = map.sel, touches = (e) => sel && ((e.l === sel.layer && e.from === sel.i) || (e.l + 1 === sel.layer && e.to === sel.i));
    let lines = 0; const lineOf = (e, bright) => {
        const a = pos[e.l], b = pos[e.l + 1], s = Math.min(1, Math.abs(e.c) / big);
        g.globalAlpha = bright ? 0.35 + 0.65 * s : 0.12 + 0.4 * s; g.strokeStyle = e.c > 0 ? POS : NEG; g.lineWidth = bright ? 1.6 : 0.8;
        g.beginPath(); g.moveTo(a.x, a.at(e.from)); g.lineTo(b.x, b.at(e.to)); g.stroke(); g.globalAlpha = 1; lines++;
    };
    for (const e of map.edges) if (!touches(e)) lineOf(e, false);
    for (const e of map.edges) if (touches(e)) lineOf(e, true);
    let dots = 0;
    map.cols.forEach((c, k) => {
        let m = 1e-9; for (const v of c.values) m = Math.max(m, Math.abs(v));
        for (let i = 0; i < c.n; i++) {
            const v = c.values[i], s = Math.min(1, Math.abs(v) / m), px = pos[k].x, py = pos[k].at(i), r = pos[k].r;
            g.globalAlpha = 0.25 + 0.75 * s; g.fillStyle = v >= 0 ? POS : NEG; g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; dots++;
            if (sel && sel.layer === k && sel.i === i) { g.strokeStyle = TICK; g.lineWidth = 1.5; g.beginPath(); g.arc(px, py, r + 2.5, 0, Math.PI * 2); g.stroke(); }
            rects.push({ layer: k, i, x: px, y: py, r: Math.max(r, 4) });
        }
    });
    return { dots, lines, rects };
}

/** The neuron whose hit area holds the point (px, py): { layer, i } or null (the nearest when areas overlap). */
export function pickNeuron(rects, px, py) {
    let best = null, bd = Infinity;
    for (const r of rects || []) {
        if (r.bw !== undefined) { if (px >= r.bx && px <= r.bx + r.bw && py >= r.by && py <= r.by + r.bh && bd > 0) { bd = 0; best = { layer: r.layer, i: r.i }; } continue; }   // a row's box (the lens) beats a dot's circle
        const d = Math.hypot(px - r.x, py - r.y); if (d <= r.r && d < bd) { bd = d; best = { layer: r.layer, i: r.i }; }
    }
    return best;
}

/** A COPY of the weights with neuron `i` of the last hidden layer pushed by `delta`: each output's bias moves by W[j,i] x delta (the direct path). `policy.layersOf(w)` must give views into the weights it is handed (the fly circuit and the GPU network do); null when it does not. */
export function steerWeights(policy, w, i, delta) {
    const c = Float32Array.from(w), O = policy.layersOf(c).at(-1);
    if (!O || !(i >= 0 && i < O.nIn) || !Number.isFinite(delta)) return null;
    const want = Array.from({ length: O.nOut }, (_, j) => Math.fround(O.b[j] + O.W[j * O.nIn + i] * delta));
    for (let j = 0; j < O.nOut; j++) O.b[j] = want[j];
    const back = policy.layersOf(c).at(-1);   // read the bias back through a fresh view: a layersOf that COPIES would leave the steer in a copy and the weights untouched
    return want.every((v, j) => back.b[j] === v) ? c : null;
}

/**
 * The one line that says what a selected neuron is wired to: `h7 <- h3 +0.82, h9 -0.61 | -> yaw -1.00, pitch +0.20` (its three biggest weights in and out, by |w|). `sel` = { layer, i } in the map's columns; a neuron in the features column has no inputs and one in the outputs
 * column no outputs. null for a selection that names no neuron. `cols` are layerMap().cols (for the labels and the sizes).
 */
export function linkLine(layers, cols, sel, k = 3) {
    if (!sel || !cols || !cols[sel.layer] || !(sel.i >= 0 && sel.i < cols[sel.layer].n)) return null;
    const nm = (c, i) => (c.names && c.names[i]) || (c.label === "features" ? "f" + i : c.label === "outputs" ? "o" + i : "h" + i), fmt = (v) => (v >= 0 ? "+" : "-") + Math.abs(v).toFixed(2);
    const into = [], out = [];
    if (sel.layer > 0) { const L = layers[sel.layer - 1]; for (let f = 0; f < L.nIn; f++) into.push([nm(cols[sel.layer - 1], f), num(L.W[sel.i * L.nIn + f])]); }
    if (sel.layer < layers.length) { const L = layers[sel.layer]; for (let t = 0; t < L.nOut; t++) out.push([nm(cols[sel.layer + 1], t), num(L.W[t * L.nIn + sel.i])]); }
    const top = (a) => a.sort((p, q) => Math.abs(q[1]) - Math.abs(p[1])).slice(0, k).map(([n, v]) => `${n} ${fmt(v)}`).join(", ");
    return `${nm(cols[sel.layer], sel.i)}${into.length ? " <- " + top(into) : ""}${out.length ? " | -> " + top(out) : ""}`;
}
