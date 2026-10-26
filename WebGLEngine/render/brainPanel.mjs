// WebGLEngine/render/brainPanel.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE SELECTED BRAIN ACTIVITY PANEL: pick a sub or an aircraft, see what ITS brain is doing, drawn the way that kind of brain is. Two halves, both pure and held by render/brainPanel-selfcheck.mjs without a browser:
//   THE ACTIVITY   what the brain is made of, live. A NETWORK (the fruit fly's Giant Fiber circuit, 34 neurons; the GPU brain's 18-32-32-4 network) shows its features, its hidden neurons and its four outputs as bars (render/flightViews.mjs pilotRows
//                  and drawRows, the rows the bomber's and dogfight's brain windows already draw). The PD AUTOPILOT HAS NO NETWORK, so it shows what it has: the intermediate quantities of its six laws and its four outputs. A human on the keyboard
//                  shows the stick. A kind whose brain this page does not fly (the zebrafish circuit, which is vendored and has a pilot but which neither page flies yet) says so and draws nothing it does not have.
//   THE MAP        the GPU Brain's heat-and-target view, made TRUE for any pilot: policyMap() asks the pilot itself, over a grid, "if the vessel were THIS far off its heading and THIS far off its depth (or altitude) -- everything else as it is NOW --
//                  what would you do?", and drawMap() paints the answer: the heat is how hard it would command, the arrow is the direction of the command (a sub's yaw and pitch; an aircraft's roll and pitch), the centre is ON TARGET, and the
//                  amber ring is WHERE THE VESSEL ACTUALLY IS in that grid. It is a slice of the pilot's policy, computed by calling it -- not a picture of its insides, and not ui/brainSvg.js's illustrative flow field (that one is the GPU Brain
//                  service's own display and is not this pilot). Works for every pilot, the network, the GPU MLP and the hand autopilot alike, because it only calls the pilot.
// Conventions: a sub's pitch +1 is nose up and yaw +1 a right turn, depth is positive down; an aircraft's roll +1 is a right bank, pitch +1 nose up, altitude up. The map's arrows point where the command would TAKE the vessel on a screen
// (right = turn right, up = nose up), so an arrow in a cell the vessel is too deep in points UP (toward the target) and in a cell it is too high in points DOWN.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as F from "../physics/mechanics/flightModel6dof.mjs";
import * as AS from "../brain/autopilotSub.mjs";
import * as AF from "../brain/autopilotFlight.mjs";
import * as PS from "../brain/pilotSubPolicy.mjs";
import * as PF from "../brain/pilotFlightPolicy.mjs";
import { pilotRows, drawRows } from "./flightViews.mjs";
import { mlpLayerCpu } from "./brainTsl.mjs";

export const KINDS = Object.freeze({
    autopilot: Object.freeze({ label: "PD autopilot", network: false, flown: true }),
    fly: Object.freeze({ label: "fruit fly Giant Fiber circuit (34 neurons)", network: true, flown: true }),
    gpu: Object.freeze({ label: "GPU brain (18-32-32-4 network)", network: true, flown: true }),
    fish: Object.freeze({ label: "zebrafish circuit (Fish1)", network: true, flown: false }),
    manual: Object.freeze({ label: "you, on the keyboard", network: false, flown: true }),
});
/** The description of a kind: { label, network, flown }; an unknown kind reads as { label: kind, network: false, flown: false }. */
export const describeKind = (kind) => (Object.prototype.hasOwnProperty.call(KINDS, kind) ? KINDS[kind] : { label: String(kind), network: false, flown: false });

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v) => (Number.isFinite(v) ? v : 0);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** A policy's activations on one feature vector: { input, hidden (the state before the output stage), output (the policy's outputs in [-1, 1], in `outputNames` order, a throttle mapped from 0..1) }. `policy` has layersOf(w) and forward(w, x). */
export function activations(policy, w, x, outputNames) {
    const layers = policy.layersOf(w), input = Float32Array.from(x, num);
    let hidden = input;
    for (let i = 0; i < layers.length - 1; i++) hidden = mlpLayerCpu(layers[i], hidden, 1);
    const c = policy.forward(w, input);
    return { input, hidden, output: Float32Array.from(outputNames, (n) => (n === "throttle" ? c[n] * 2 - 1 : num(c[n]))) };
}

/** The autopilot's rows for a sub: its own features, then the intermediate numbers of its laws as fractions of a sensible full scale, then its four outputs. */
export function subAutopilotRows(state, target, current = [0, 0, 0]) {
    const g = AS.guidance(state, target, current), c = AS.decide(state, target, current), x = PS.features(state, target, current);
    const laws = [g.depthErr / 20, g.headingErr / Math.PI, g.speedErr / 2, g.vzCmd / 1, g.pitchCmd / 0.3, g.pitchErr / 0.3].map((v) => clamp(num(v), -1, 1));
    return [{ who: "autopilot", layer: "features", names: PS.FEATURE_NAMES, values: Array.from(x, num) },
        { who: "autopilot", layer: "laws", label: "laws", names: ["depthErr", "headingErr", "speedErr", "climbCmd", "pitchCmd", "pitchErr"], values: laws },
        { who: "autopilot", layer: "outputs", names: PS.OUTPUT_NAMES, values: PS.OUTPUT_NAMES.map((n) => num(c[n])) }];
}
/** The same for an aircraft's autopilot: the features, the law quantities (altitude, heading, climb, bank errors), the four outputs. */
export function flightAutopilotRows(state, target, wind = [0, 0, 0]) {
    const gd = AF.guidance(state, target, wind), c = AF.decide(state, target, wind).controls, x = PF.featuresFrom(gd);
    const laws = [gd.altErr / 100, gd.headingErr / Math.PI, gd.speedErr / 10, gd.climbErr / 5, gd.bankErr / 0.5].map((v) => clamp(num(v), -1, 1));
    return [{ who: "autopilot", layer: "features", names: PF.FEATURE_NAMES, values: Array.from(x, num) },
        { who: "autopilot", layer: "laws", label: "laws", names: ["altErr", "headingErr", "speedErr", "climbErr", "bankErr"], values: laws },
        { who: "autopilot", layer: "outputs", names: PF.OUTPUT_NAMES, values: [c.pitch, c.roll, c.yaw, c.throttle * 2 - 1].map(num) }];
}

// ---- the policy map ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The two maps: what is read off a state, where the virtual target goes, which two outputs are drawn, and the span of the grid. `yUp`: a larger y is higher on the screen. */
export const SUB_MAP = Object.freeze({ id: "sub", xLabel: "heading off target", yLabel: "depth off target (down is deeper)", spanX: 1.2, spanY: 12, yUp: false, outLabel: "yaw / pitch",
    read: (state) => { const a = S.attitude(state); return { x: a.heading, y: a.depth }; },
    aim: (target, read, ox, oy) => ({ ...target, heading: read.x - ox, depth: read.y - oy }),
    out: (c) => [num(c.yaw), num(c.pitch)] });
export const FLIGHT_MAP = Object.freeze({ id: "flight", xLabel: "heading off target", yLabel: "altitude off target (up is higher)", spanX: 1.0, spanY: 60, yUp: true, outLabel: "roll / pitch",
    read: (state, wind) => { const a = F.attitude(state, wind); return { x: a.heading, y: a.altitude }; },
    aim: (target, read, ox, oy) => ({ ...target, heading: read.x - ox, altitude: read.y - oy }),
    out: (c) => [num(c.roll), num(c.pitch)] });

/**
 * THE POLICY MAP: `pilot` is (state, target, env) -> controls (a sub's: env is the current; an aircraft's: the wind). For an n x n grid of offsets from the target (ox in +-spanX radians of heading, oy in +-spanY metres of depth or altitude) it
 * puts the virtual target where the offset says the vessel is, asks the pilot, and keeps the two outputs the map draws. Returns { spec, n, cells: [{ ox, oy, a, b, mag }], maxMag, marker: { ox, oy, inside } } where the marker is the vessel's REAL offset
 * from its REAL target (the heading wrapped), and `inside` says whether it is on the grid. A pilot that throws or answers nothing makes a cell of zeros, not a hole.
 */
export function policyMap(pilot, state, target, spec = SUB_MAP, { n = 9, env = [0, 0, 0] } = {}) {
    const read = spec.read(state, env), cells = []; let maxMag = 0;
    const k = Math.max(3, n | 0);
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
        const ox = spec.spanX * (2 * i / (k - 1) - 1), oy = spec.spanY * (2 * j / (k - 1) - 1);
        let a = 0, b = 0;
        try { const c = pilot(state, spec.aim(target, read, ox, oy), env); if (c) [a, b] = spec.out(c); } catch { a = b = 0; }
        const mag = Math.hypot(a, b); if (mag > maxMag) maxMag = mag;
        cells.push({ ox, oy, a, b, mag });
    }
    const real = { ox: wrap(read.x - num(target.heading)), oy: read.y - num(target[spec.id === "sub" ? "depth" : "altitude"]) };
    return { spec: spec.id, n: k, cells, maxMag, marker: { ...real, inside: Math.abs(real.ox) <= spec.spanX && Math.abs(real.oy) <= spec.spanY }, yUp: spec.yUp, spanX: spec.spanX, spanY: spec.spanY };
}

/** Where an offset falls in a w x h box: the pixel of the offset (clamped to the box when it is off the grid). */
export function mapPoint(map, ox, oy, x, y, w, h) {
    const fx = clamp((ox + map.spanX) / (2 * map.spanX), 0, 1), fy = clamp((oy + map.spanY) / (2 * map.spanY), 0, 1);
    return [x + fx * w, y + (map.yUp ? 1 - fy : fy) * h];
}

/** Draw a policy map in the box (x, y, w, h) of a 2D context: a heat cell per grid cell (blue, stronger as the command is), an arrow in the direction of the command, the target's cross at the centre, the vessel's ring. Returns { cells, arrows }. */
export function drawMap(g, x, y, w, h, map, { title = "" } = {}) {
    g.fillStyle = "#050805"; g.fillRect(x, y, w, h);
    const cw = w / map.n, ch = h / map.n; let arrows = 0;
    for (const c of map.cells) {
        const fx = (c.ox + map.spanX) / (2 * map.spanX), fy = (c.oy + map.spanY) / (2 * map.spanY), px = x + Math.min(map.n - 1, Math.round(fx * (map.n - 1))) * cw, py = y + Math.min(map.n - 1, Math.round((map.yUp ? 1 - fy : fy) * (map.n - 1))) * ch;
        const heat = map.maxMag > 0 ? c.mag / map.maxMag : 0;
        g.fillStyle = `rgba(89,209,255,${(0.08 + 0.6 * heat).toFixed(3)})`; g.fillRect(px, py, cw - 1, ch - 1);
        if (c.mag > 1e-3) {
            const cx = px + cw / 2, cy = py + ch / 2, k = 0.42 * Math.min(cw, ch) / Math.max(map.maxMag, 1e-9), ax = cx + c.a * k, ay = cy - c.b * k;
            g.strokeStyle = "#f6a623"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx, cy); g.lineTo(ax, ay); g.stroke(); arrows++;
        }
    }
    const [cx0, cy0] = mapPoint(map, 0, 0, x, y, w, h);
    g.strokeStyle = "#5fe08a"; g.lineWidth = 1; g.beginPath(); g.moveTo(cx0 - cw * 0.5, cy0); g.lineTo(cx0 + cw * 0.5, cy0); g.moveTo(cx0, cy0 - ch * 0.5); g.lineTo(cx0, cy0 + ch * 0.5); g.stroke();
    const [mx, my] = mapPoint(map, map.marker.ox, map.marker.oy, x, y, w, h);
    g.strokeStyle = map.marker.inside ? "#ffffff" : "#ff7a7a"; g.lineWidth = 2; g.beginPath(); g.arc(mx, my, Math.min(cw, ch) * 0.4, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#9fb2d4"; g.font = "10px ui-monospace,Menlo,monospace"; g.fillText(title.slice(0, 60), x + 3, y + 10);
    return { cells: map.cells.length, arrows };
}

// ---- the panels --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * What the aquarium's panel shows for a probe { kind, weights, state, target } (render/subAquariumSim.mjs probe(id)): { kind, label, note, rows (for drawRows), map (a policy map or null) }.
 */
export function subPanel(probe) {
    const d = describeKind(probe && probe.kind);
    if (!probe || !d.flown) return { kind: probe ? probe.kind : "none", label: d.label, note: d.flown === false && probe ? `${d.label}: this page does not fly that brain yet, so there is nothing of it to show` : "no sub selected", rows: [], map: null };
    const current = [0, 0, 0];
    if (probe.kind === "fly" && probe.weights) {
        const x = PS.features(probe.state, probe.target, current), act = activations(PS, probe.weights, x, PS.OUTPUT_NAMES);
        return { kind: "fly", label: d.label, note: "features, the 34 hidden neurons (after three recurrent steps) and the four outputs; the map is what this brain would command off target", rows: pilotRows({ who: "fly", act, featureNames: PS.FEATURE_NAMES, outputNames: PS.OUTPUT_NAMES }), map: policyMap((s, t, c) => PS.forward(probe.weights, PS.features(s, t, c)), probe.state, probe.target, SUB_MAP, { env: current }) };
    }
    return { kind: "autopilot", label: d.label, note: "no network: the intermediate numbers of its six laws and its four outputs; the map is what its laws command off target", rows: subAutopilotRows(probe.state, probe.target, current), map: policyMap((s, t, c) => AS.decide(s, t, c), probe.state, probe.target, SUB_MAP, { env: current }) };
}

/**
 * The same for an aircraft: `probe` is { kind, policy (pilotFlightPolicy or pilotFlightMlp), weights, pilot ((state, target, wind) -> controls), state, target, wind }. A manual probe shows the stick it is given (probe.stick).
 */
export function flightPanel(probe) {
    const d = describeKind(probe && probe.kind);
    if (!probe) return { kind: "none", label: "none", note: "no aircraft selected", rows: [], map: null };
    const wind = probe.wind || [0, 0, 0];
    if (probe.kind === "manual") {
        const s = probe.stick || { pitch: 0, roll: 0, yaw: 0, throttle: 0 };
        return { kind: "manual", label: d.label, note: "the stick you are holding (after the stability assist, if it is on); the map is what your stick would command off target: it is the assist's own loops, since your hands are not a function", rows: [{ who: "you", layer: "stick", names: ["pitch", "roll", "yaw", "throttle"], values: [s.pitch, s.roll, s.yaw, s.throttle * 2 - 1].map(num) }], map: null };
    }
    if (!d.flown) return { kind: probe.kind, label: d.label, note: `${d.label}: this page does not fly that brain`, rows: [], map: null };
    const map = probe.pilot ? policyMap(probe.pilot, probe.state, probe.target, FLIGHT_MAP, { env: wind }) : null;
    if (d.network && probe.policy && probe.weights) {
        const x = PF.features(probe.state, probe.target, wind), act = activations(probe.policy, probe.weights, x, PF.OUTPUT_NAMES);
        return { kind: probe.kind, label: d.label, note: "features, the hidden layer and the four outputs; the map is what this brain would command off target", rows: pilotRows({ who: probe.kind, act, featureNames: PF.FEATURE_NAMES, outputNames: PF.OUTPUT_NAMES }), map };
    }
    return { kind: "autopilot", label: d.label, note: "no network: the intermediate numbers of its laws and its four outputs; the map is what its laws command off target", rows: flightAutopilotRows(probe.state, probe.target, wind), map };
}

/** Draw a panel on a 2D context of w x h: the bars on the left half, the map on the right (or the bars across the whole width when there is no map), the note under. Returns { bars, arrows }. */
export function drawPanel(g, w, h, panel, { title = "" } = {}) {
    g.fillStyle = "#050805"; g.fillRect(0, 0, w, h);
    const noteH = 28, bodyH = h - noteH, mapW = panel.map ? Math.min(bodyH, Math.floor(w * 0.45)) : 0;
    let bars = 0, arrows = 0;
    if (panel.rows.length) { g.save && g.save(); g.beginPath && g.beginPath(); g.rect && g.rect(0, 0, w - mapW, bodyH); g.clip && g.clip(); bars = drawRows(g, w - mapW, bodyH, panel.rows, { title: title || panel.label }); g.restore && g.restore(); }
    if (panel.map) arrows = drawMap(g, w - mapW, 0, mapW, bodyH, panel.map, { title: panel.map.spec === "sub" ? "policy: heading x depth" : "policy: heading x altitude" }).arrows;
    g.fillStyle = "#7c93b8"; g.font = "10px ui-monospace,Menlo,monospace";
    const words = panel.note.split(" "); let line = "", yy = bodyH + 11;
    for (const wd of words) { if ((line + wd).length * 5.6 > w - 6) { g.fillText(line, 3, yy); yy += 11; line = ""; } line += wd + " "; if (yy > h) break; }
    if (yy <= h) g.fillText(line, 3, yy);
    return { bars, arrows };
}
