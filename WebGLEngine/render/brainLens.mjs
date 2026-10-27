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
 * Returns { outputs, dose, scale, rows: [{ i, h, push: [per output], ablate: [per output], drive, reach }] sorted by drive then reach, base: [the outputs unpushed] }, or null when the output layer does not read `hidden`.
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
    return { outputs: [...outputNames], dose, scale, rows, base: Array.from(base, num) };
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
export function drawLens(g, x, y, w, h, lens, { top = LENS.top, title = "steer lens (direct path)" } = {}) {
    g.fillStyle = "#050805"; g.fillRect(x, y, w, h);
    g.font = "10px ui-monospace,Menlo,monospace"; g.fillStyle = "#7c93b8";
    if (!lens) { g.fillText(`${title}: this brain's output layer does not read its hidden layer`, x + 4, y + 12); return { rows: 0, cells: 0, bars: 0 }; }
    const shown = lens.rows.slice(0, top), nameW = 62, colW = (w - nameW - 4) / lens.outputs.length, rowH = Math.min(14, (h - 16) / Math.max(1, shown.length));
    g.fillText(`${title}  push +${lens.dose} rms (bar)  ablate (tick)`, x + 4, y + 10);
    let big = 1e-9; for (const r of shown) for (let j = 0; j < lens.outputs.length; j++) big = Math.max(big, Math.abs(r.push[j]), Math.abs(r.ablate[j]));
    lens.outputs.forEach((o, j) => g.fillText(String(o).slice(0, Math.max(2, Math.floor(colW / 6))), x + nameW + j * colW + 2, y + 21));
    let cells = 0, bars = 0;
    shown.forEach((r, k) => {
        const ry = y + 24 + k * rowH;
        g.fillStyle = "#c9d6ea"; g.fillText(`h${r.i} ${r.h >= 0 ? "+" : ""}${r.h.toFixed(2)}`, x + 4, ry + rowH - 3);
        for (let j = 0; j < lens.outputs.length; j++) {
            const cx = x + nameW + j * colW + colW / 2, half = colW / 2 - 3, p = r.push[j] / big, a = r.ablate[j] / big;
            g.fillStyle = "#101810"; g.fillRect(cx - half, ry + 1, 2 * half, rowH - 3); cells++;
            if (Math.abs(p) > 1e-6) { g.fillStyle = p > 0 ? POS : NEG; g.fillRect(p > 0 ? cx : cx + p * half, ry + 2, Math.abs(p) * half, rowH - 5); bars++; }
            if (Math.abs(a) > 1e-6) { g.fillStyle = TICK; g.fillRect(cx + a * half - 1, ry, 2, rowH - 1); }
        }
    });
    return { rows: shown.length, cells, bars };
}
