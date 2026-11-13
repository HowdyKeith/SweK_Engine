// WebGLEngine/brain/flyPortrait.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY'S SELF-PORTRAIT: WHAT THE 34 NEURONS OF THE GIANT FIBER CIRCUIT DID IN ONE FIGHT, DRAWN BY A RULE. Keith, 2026-11-12: "Could the fruit fly brain express itself by painting?" The round
// that asked whether the fly's wiring PAINTS (brain/PAINTING_FLY_WIP.md) found it paints no better than a shuffle of itself; this is the other half of the backlog item `painting-fly`, and it trains
// nothing: a 6-DOF ship is flown through one duel by a network whose only recurrent weights are the circuit's 313 synapses (brain/pilot6dofPolicy.mjs), every neuron's activity is written down at
// every tick, and the record is drawn with the procedural brushes (fx/procBrush.mjs), one stroke a neuron.
//
//   record(w, opts)      fly brain/pilot6dofPolicy.mjs's duel() with a pilot that is pilotFor(w) and nothing else, writing down the 34 units' activity after the three recurrent steps at each tick:
//                        { seed, scenario, opponent, ticks, neurons: 34, activity (Float32Array, tick-major), max, active (how many units were ever above 0), fingerprint (the duel's own), hash }
//   strokes(rec, opts)   THE RULE: neuron i (its place in brain/gfcTopology.mjs's NEURON_ORDER) starts at the angle -90 degrees + i x 360/34 on a ring of radius 0.08 of the canvas; TIME RUNS OUTWARD,
//                        to 0.46 of the canvas at the last tick; the neuron's ACTIVITY IS THE WIDTH OF ITS LINE'S WAVE: the line swings to either side of its spoke once every 9 ticks, by up to 1.25
//                        places (1.25 x 360/34 degrees) at the largest activity in the record, as the square root of the activity's share of that largest (so a quiet neuron still shows). A neuron
//                        that never fires is a straight spoke, and a neuron at rest between bursts runs straight. THE BRUSH IS THE NEURON'S CELL TYPE: GFC1 ribbon, GFC2 sketchy, GFC3 fur, GFC4 shaded; the colour too (COLOURS).
//   portrait(rec, opts)  strokes() through the brushes: { size, strokes: [{ neuron, bodyId, type, instance, brush, colour, silent, segments }], segments (the count), active, hash }
//   ruleLines()          the rule and what the picture is not, in lines a page shows beside it
//
// WHAT THIS IS NOT, SAID PLAINLY: the fly expressing itself, or anything the fly intends. The WIRING is real; the weights are a search's, the units are rate units, the circuit is an escape circuit
// flying a spaceship, and the mapping from activity to ink was chosen by a person and could have been another. It is an honest picture of one record: the same record gives the same picture to the
// bit, and nothing in it is not in the record. Pure: no I/O, no DOM, no clock, no Math.random; it runs in node and in a page.
"use strict";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import * as Topo from "./gfcTopology.mjs";
import * as P6 from "./pilot6dofPolicy.mjs";
import { strokeSegments } from "../fx/procBrush.mjs";

export const NEURONS = Topo.NEURON_ORDER.length;
export const DEFAULTS = Object.freeze({ seed: 1, scenario: "joust", opponent: "autopilot", seconds: 30 });
export const SIZE = 720, INNER = 0.08, OUTER = 0.46, SWING_PLACES = 1.25, WAVE_TICKS = 9;
export const BRUSH_OF = Object.freeze({ GFC1: "ribbon", GFC2: "sketchy", GFC3: "fur", GFC4: "shaded" });
export const COLOURS = Object.freeze({ GFC1: "#ffd166", GFC2: "#8fd0ff", GFC3: "#ef6f8f", GFC4: "#3fe0b0" });
export const BRUSH_OPTS = Object.freeze({ radius: 24, maxLinks: 6, alpha: 0.22, width: 1, maxWidth: 3 });

/** A 32-bit FNV-1a fold of float32s, as 8 hex digits: the same in node and in a page. */
export function hashFloats(values, h = 0x811c9dc5) {
    const f = new Float32Array(1), b = new Uint8Array(f.buffer);
    for (let i = 0; i < values.length; i++) { f[0] = values[i]; for (let k = 0; k < 4; k++) { h ^= b[k]; h = Math.imul(h, 0x01000193) >>> 0; } }
    return h >>> 0;
}
const hex = (h) => (h >>> 0).toString(16).padStart(8, "0");

/** The 34 units' activity for a feature row: the encoder and the three recurrent steps of pilot6dofPolicy's own layers (what its decoder reads). */
export function activityOf(w, x) {
    const layers = P6.layersOf(w); let h = Float32Array.from(x);
    for (let i = 0; i < layers.length - 1; i++) h = mlpLayerCpu(layers[i], h, 1);
    return h;
}

/** See the header. `w` is a pilot6dofPolicy weight vector (930). */
export function record(w, opts = {}) {
    if (!w || w.length !== P6.WEIGHT_COUNT) throw new Error(`flyPortrait.record: a pilot is ${P6.WEIGHT_COUNT} weights (got ${w ? w.length : w})`);
    const o = { ...DEFAULTS, ...opts };
    if (!["joust", "standoff"].includes(o.scenario)) throw new Error(`flyPortrait.record: the scenario is joust or standoff (got ${o.scenario})`);
    const inner = P6.pilotFor(w), rows = [];
    const pilot = (body, target, po) => { rows.push(activityOf(w, P6.features(body, target, po))); return inner(body, target, po); };
    const r = P6.duel(pilot, o.opponent, { seed: o.seed, scenario: o.scenario, seconds: o.seconds, collisions: o.scenario === "joust" });
    const activity = new Float32Array(rows.length * NEURONS); rows.forEach((h, t) => activity.set(h, t * NEURONS));
    let max = 0; const ever = new Uint8Array(NEURONS);
    for (let k = 0; k < activity.length; k++) { if (activity[k] > max) max = activity[k]; if (activity[k] > 0) ever[k % NEURONS] = 1; }
    return { seed: o.seed, scenario: o.scenario, opponent: typeof o.opponent === "string" ? o.opponent : "a pilot", ticks: rows.length, neurons: NEURONS, activity, max, active: ever.reduce((a, b) => a + b, 0), fingerprint: r.fingerprint, hash: hex(hashFloats(activity)) };
}

/** See the header: THE RULE. Returns one { neuron, bodyId, type, instance, brush, colour, silent, points: [{ x, y, t }] } a neuron. */
export function strokes(rec, { size = SIZE } = {}) {
    if (!rec || rec.neurons !== NEURONS || !rec.activity || rec.activity.length !== rec.ticks * NEURONS) throw new Error("flyPortrait.strokes: not a record of this circuit (ticks x 34 activities)");
    const c = size / 2, r0 = INNER * size, r1 = OUTER * size, place = 2 * Math.PI / NEURONS, T = rec.ticks, out = [];
    for (let i = 0; i < NEURONS; i++) {
        const home = -Math.PI / 2 + i * place, points = []; let silent = true;
        for (let t = 0; t < T; t++) {
            const a = rec.activity[t * NEURONS + i], r = r0 + (r1 - r0) * (T > 1 ? t / (T - 1) : 0), ang = home + (rec.max > 0 ? SWING_PLACES * place * Math.sqrt(a / rec.max) * Math.sin(2 * Math.PI * t / WAVE_TICKS) : 0);
            if (a > 0) silent = false;
            points.push({ x: c + r * Math.cos(ang), y: c + r * Math.sin(ang), t: t * 16 });
        }
        const type = Topo.NEURON_TYPES[i];
        out.push({ neuron: i, bodyId: Topo.NEURON_ORDER[i], type, instance: Topo.NEURON_INSTANCES[i], brush: BRUSH_OF[type], colour: COLOURS[type], silent, points });
    }
    return out;
}

/** See the header. */
export function portrait(rec, { size = SIZE } = {}) {
    let h = 0x811c9dc5, count = 0;
    const out = strokes(rec, { size }).map((s) => {
        const segments = strokeSegments(s.points, s.brush, BRUSH_OPTS); count += segments.length;
        for (const g of segments) h = hashFloats([g.x1, g.y1, g.x2, g.y2, g.alpha, g.width], h);
        const { points, ...rest } = s; return { ...rest, segments };
    });
    return { size, strokes: out, segments: count, active: rec.active, hash: hex(h) };
}

/** See the header. */
export function ruleLines() {
    return [
        "Each line is one of the 34 neurons of the fruit fly's Giant Fiber Circuit, in one duel flown by a network wired as that circuit is.",
        "Time runs outward from the ring. A neuron's activity is the width of its line's wave; a neuron that never fires is a straight spoke.",
        `The brush and the colour are the neuron's cell type: ${Object.entries(BRUSH_OF).map(([t, b]) => `${t} ${b}`).join(", ")}.`,
        "Not the fly expressing itself: the wiring is real, the weights are a search's, and this rule from activity to ink was chosen by a person.",
    ];
}
