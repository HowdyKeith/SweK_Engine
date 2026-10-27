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
import * as AP from "../brain/autopilotAircraft.mjs";
import * as PA from "../brain/pilotAircraftPolicy.mjs";
import * as PP from "../brain/pilotPolicy.mjs";
import * as TX from "../ev/esTactics.js";
import { rotateByQuat, worldToBody } from "../physics/mechanics/rigidBody6dof.mjs";
import { pilotRows, drawRows } from "./flightViews.mjs";
import { mlpLayerCpu } from "./brainTsl.mjs";
import { steerLens, drawLens, layerMap, drawLayerMap, linkLine } from "./brainLens.mjs";

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
    return { input, hidden, output: Float32Array.from(outputNames, (n, i) => (Array.isArray(c) ? num(c[i]) : n === "throttle" ? c[n] * 2 - 1 : num(c[n]))) };
}

/** The steer lens of a network panel (render/brainLens.mjs): which hidden neurons drive which outputs right now. `act` is activations()'s result; null for a brain with no hidden layer. */
export const lensOf = (act, policy, w, outputNames) => (act && act.hidden && act.hidden !== act.input ? steerLens(policy.layersOf(w), act.hidden, outputNames) : null);
/**
 * What a network panel carries beyond its bars (v4904): { lens, layers (the layered map at the features `x`), links (the line saying what the selected neuron is wired to, or null), sel }. `ui.neuron` = { layer, i } is the neuron the page has selected
 * (a click on a lens row or a dot of the map); a selection that names no neuron of this network is dropped, not drawn.
 */
export function netOf(act, policy, w, x, inputNames, outputNames, ui = {}) {
    const layers = policy.layersOf(w), map = layerMap(layers, x, { names: { input: inputNames, output: outputNames }, sel: ui && ui.neuron ? ui.neuron : null });
    return { lens: lensOf(act, policy, w, outputNames), layers: map, sel: map.sel, links: linkLine(layers, map.cols, map.sel) };
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
    if (map.kind === "tactics") return drawHeat(g, x, y, w, h, map, { title });
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
export function subPanel(probe, ui = {}) {
    const d = describeKind(probe && probe.kind);
    if (!probe || !d.flown) return { kind: probe ? probe.kind : "none", label: d.label, note: d.flown === false && probe ? `${d.label}: this page does not fly that brain yet, so there is nothing of it to show` : "no sub selected", rows: [], map: null };
    const current = [0, 0, 0];
    if (probe.kind === "fly" && probe.weights) {
        const x = PS.features(probe.state, probe.target, current), act = activations(PS, probe.weights, x, PS.OUTPUT_NAMES);
        return { kind: "fly", label: d.label, note: "features, the 34 hidden neurons (after three recurrent steps) and the four outputs; the map is what this brain would command off target", ...netOf(act, PS, probe.weights, x, PS.FEATURE_NAMES, PS.OUTPUT_NAMES, ui), rows: pilotRows({ who: "fly", act, featureNames: PS.FEATURE_NAMES, outputNames: PS.OUTPUT_NAMES }), map: policyMap((s, t, c) => PS.forward(probe.weights, PS.features(s, t, c)), probe.state, probe.target, SUB_MAP, { env: current }) };
    }
    return { kind: "autopilot", label: d.label, note: "no network: the intermediate numbers of its six laws and its four outputs; the map is what its laws command off target", rows: subAutopilotRows(probe.state, probe.target, current), map: policyMap((s, t, c) => AS.decide(s, t, c), probe.state, probe.target, SUB_MAP, { env: current }) };
}

/**
 * The same for an aircraft: `probe` is { kind, policy (pilotFlightPolicy or pilotFlightMlp), weights, pilot ((state, target, wind) -> controls), state, target, wind }. A manual probe shows the stick it is given (probe.stick).
 */
export function flightPanel(probe, ui = {}) {
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
        return { kind: probe.kind, label: d.label, note: "features, the hidden layer and the four outputs; the map is what this brain would command off target", ...netOf(act, probe.policy, probe.weights, x, PF.FEATURE_NAMES, PF.OUTPUT_NAMES, ui), rows: pilotRows({ who: probe.kind, act, featureNames: PF.FEATURE_NAMES, outputNames: PF.OUTPUT_NAMES }), map };
    }
    return { kind: "autopilot", label: d.label, note: "no network: the intermediate numbers of its laws and its four outputs; the map is what its laws command off target", rows: flightAutopilotRows(probe.state, probe.target, wind), map };
}

const MAP_TITLES = Object.freeze({ sub: "policy: heading x depth", flight: "policy: heading x altitude", aircraft: "target in the nose's frame -> push", fly3d: "target bearing -> turn / pitch", tactics: "target attractiveness" });
/** Draw a panel on a 2D context of w x h: the bars on the left half, the map on the right (or the bars across the whole width when there is no map), the note under. Returns { bars, arrows }. */
export function drawPanel(g, w, h, panel, { title = "", view = "bars" } = {}) {
    g.fillStyle = "#050805"; g.fillRect(0, 0, w, h);
    const noteH = 28, bodyH = h - noteH;
    if (view === "layers" && panel.layers) {   // v4904: the layered map takes the whole body, the selected neuron's wiring in a line along its top edge
        const lineH = panel.links ? 14 : 0, r = drawLayerMap(g, 0, lineH, w, bodyH - lineH, panel.layers, { title: title || panel.label });
        if (panel.links) { g.fillStyle = "#050805"; g.fillRect(0, 0, w, lineH); g.fillStyle = "#c9d6ea"; g.font = "11px ui-monospace,Menlo,monospace"; g.fillText(panel.links, 4, 11); }
        drawNote(g, w, h, bodyH, panel.note);
        return { bars: 0, arrows: 0, lensBars: 0, view: "layers", dots: r.dots, lines: r.lines, rects: r.rects };
    }
    const mapW = panel.map ? Math.min(bodyH, Math.floor(w * 0.45)) : 0;
    let bars = 0, arrows = 0;
    const lensH = panel.lens ? Math.floor(bodyH * 0.4) : 0, barsH = bodyH - lensH;
    if (panel.rows.length) { g.save && g.save(); g.beginPath && g.beginPath(); g.rect && g.rect(0, 0, w - mapW, barsH); g.clip && g.clip(); bars = drawRows(g, w - mapW, barsH, panel.rows, { title: title || panel.label }); g.restore && g.restore(); }
    let lensBars = 0, rects = [];
    if (panel.lens) { const ld = drawLens(g, 0, barsH, w - mapW, lensH - (panel.links ? 13 : 0), panel.lens, { sel: panel.sel }); lensBars = ld.bars; rects = ld.rects; if (panel.links) { g.fillStyle = "#c9d6ea"; g.font = "10px ui-monospace,Menlo,monospace"; g.fillText(panel.links, 4, barsH + lensH - 3); } }
    if (panel.map) arrows = drawMap(g, w - mapW, 0, mapW, bodyH, panel.map, { title: MAP_TITLES[panel.map.spec] || "policy map" }).arrows;
    drawNote(g, w, h, bodyH, panel.note);
    return { bars, arrows, lensBars, view: "bars", rects };
}
/** The note under the body, wrapped to the width. */
function drawNote(g, w, h, bodyH, note) {
    g.fillStyle = "#7c93b8"; g.font = "10px ui-monospace,Menlo,monospace";
    const words = note.split(" "); let line = "", yy = bodyH + 11;
    for (const wd of words) { if ((line + wd).length * 5.6 > w - 6) { g.fillText(line, 3, yy); yy += 11; line = ""; } line += wd + " "; if (yy > h) break; }
    if (yy <= h) g.fillText(line, 3, yy);
}


// ---- the other flight pages (es-aircraft, es-box3d-fly3d, flight-gpu) -----------------------------------------------------------------------------------------------------------------------------------------
// The SAME rule for every map: the axes say where the TARGET is as the nose sees it (right = to the right or the way a positive turn goes, up = above), the arrow is where the controller pushes the nose, the centre is on target, the ring is where the
// target REALLY is. A controller that works has arrows that point the way the target is; the gate holds that for each.
const unit = (v) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
const mapOf = (id, cells, marker, spanX, spanY, extra = {}) => ({ spec: id, n: Math.round(Math.sqrt(cells.length)), cells, maxMag: Math.max(0, ...cells.map((c) => c.mag)), marker, yUp: true, spanX, spanY, ...extra });

/**
 * THE AIRCRAFT MAP (es-aircraft.html): `pilot` is (body, desiredForward) -> { controls: { pitch, roll, yaw } } (the autopilot's own contract and the network's). For a grid of target directions in the nose's frame (u rad to the RIGHT, v rad ABOVE the nose,
 * +-span) it builds the world direction, asks the pilot, and draws (-yaw, -pitch): the aircraft's yaw and pitch commands are positive for a target to the LEFT and BELOW (measured on autopilotAircraft.decide, pinned in the gate), so the screen arrow is
 * the command with both signs turned. The ring is the real `desired`'s direction in the nose's frame.
 */
export function aircraftMap(pilot, body, desired, { n = 9, span = 0.8 } = {}) {
    const f = rotateByQuat(body.q, [1, 0, 0]), l = rotateByQuat(body.q, [0, 1, 0]), up = rotateByQuat(body.q, [0, 0, 1]), k = Math.max(3, n | 0), cells = [];
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
        const u = span * (2 * i / (k - 1) - 1), v = span * (2 * j / (k - 1) - 1);
        const d = unit([f[0] - Math.tan(u) * l[0] + Math.tan(v) * up[0], f[1] - Math.tan(u) * l[1] + Math.tan(v) * up[1], f[2] - Math.tan(u) * l[2] + Math.tan(v) * up[2]]);
        let a = 0, b = 0; try { const c = pilot(body, d); if (c && c.controls) { a = -num(c.controls.yaw); b = -num(c.controls.pitch); } } catch { a = b = 0; }
        cells.push({ ox: u, oy: v, a, b, mag: Math.hypot(a, b) });
    }
    const db = worldToBody(body.q, unit([num(desired[0]), num(desired[1]), num(desired[2])])), mu = Math.atan2(-db[1], db[0]), mv = Math.atan2(db[2], Math.hypot(db[0], db[1]));
    return mapOf("aircraft", cells, { ox: mu, oy: mv, inside: Math.abs(mu) <= span && Math.abs(mv) <= span }, span, span);
}

/**
 * THE FLY-3D MAP (es-box3d-fly3d.html): the network pilot (brain/pilotPolicy.mjs) asked over a grid of yaw and pitch ERRORS (the target's bearing off the nose, +-span rad), every other feature as it is NOW; the arrow is (turn, pitch). The ring is the
 * real error. A feature-slice map: it needs the weights, not a ship to place a target for.
 */
export function fly3dMap(weights, features, { n = 9, span = 1.0 } = {}) {
    const k = Math.max(3, n | 0), cells = [];
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
        const u = span * (2 * i / (k - 1) - 1), v = span * (2 * j / (k - 1) - 1), x = Array.from(features, num); x[1] = u * 180 / Math.PI / 180; x[2] = v * 180 / Math.PI / 180;
        const y = PP.forward(weights, x), a = num(y[0]), b = num(y[1]);
        cells.push({ ox: u, oy: v, a, b, mag: Math.hypot(a, b) });
    }
    const ru = num(features[1]) * Math.PI, rv = num(features[2]) * Math.PI;
    return mapOf("fly3d", cells, { ox: ru, oy: rv, inside: Math.abs(ru) <= span && Math.abs(rv) <= span }, span, span);
}

/** The panel of an aircraft on es-aircraft.html: probe { kind ("autopilot" | "fly"), weights, body, desired }. */
export function aircraftPanel(probe, ui = {}) {
    if (!probe) return { kind: "none", label: "none", note: "no aircraft selected", rows: [], map: null };
    const d = describeKind(probe.kind), x = PA.features(probe.body, probe.desired);
    if (probe.kind === "fly" && probe.weights) {
        const act = activations(PA, probe.weights, x, PA.OUTPUT_NAMES);
        return { kind: "fly", label: d.label, note: "features, the 34 hidden neurons and the three outputs; the map is where this brain pushes the nose for a target in each direction", ...netOf(act, PA, probe.weights, x, PA.FEATURE_NAMES, PA.OUTPUT_NAMES, ui), rows: pilotRows({ who: "fly", act, featureNames: PA.FEATURE_NAMES, outputNames: PA.OUTPUT_NAMES }), map: aircraftMap(PA.pilotFor(probe.weights), probe.body, probe.desired) };
    }
    const r = AP.decide(probe.body, probe.desired), g = PA.geometry(probe.body, probe.desired);
    const laws = [g.eBody[1] / Math.PI, g.eBody[2] / Math.PI, g.bankErr / Math.PI, g.facingCos, g.desiredBank / 0.52].map((v) => clamp(num(v), -1, 1));
    return { kind: "autopilot", label: KINDS.autopilot.label, note: "no network: the pointing errors, the bank it asks for and its three outputs; the map is where its PD law pushes the nose", rows: [
        { who: "autopilot", layer: "features", names: PA.FEATURE_NAMES, values: Array.from(x, num) },
        { who: "autopilot", layer: "laws", label: "laws", names: ["errPitch", "errYaw", "bankErr", "facing", "bankCmd"], values: laws },
        { who: "autopilot", layer: "outputs", names: PA.OUTPUT_NAMES, values: [r.controls.pitch, r.controls.roll, r.controls.yaw].map(num) }], map: aircraftMap((b, dd) => AP.decide(b, dd), probe.body, probe.desired) };
}

/** The panel of a ship on es-box3d-fly3d.html: probe { kind ("fly" | "scripted"), weights, ship, target, opts }. The scripted AI is rules and not a network: its rows are the seven numbers it is given, its map none. */
export function fly3dPanel(probe, ui = {}) {
    if (!probe) return { kind: "none", label: "none", note: "no ship selected", rows: [], map: null };
    const x = PP.features(probe.ship, probe.target, probe.opts || {});
    if (probe.kind === "fly" && probe.weights) {
        const act = activations(PP, probe.weights, x, PP.OUTPUT_NAMES);
        return { kind: "fly", label: KINDS.fly.label, note: "the seven features, the 34 hidden neurons and turn / pitch / thrust / firing; the map is what this brain turns and pitches for a target at each bearing off the nose", ...netOf(act, PP, probe.weights, x, PP.FEATURE_NAMES, PP.OUTPUT_NAMES, ui), rows: pilotRows({ who: "fly", act, featureNames: PP.FEATURE_NAMES, outputNames: PP.OUTPUT_NAMES }), map: fly3dMap(probe.weights, x) };
    }
    return { kind: "scripted", label: "scripted AI (stepAI3d)", note: "rules, not a network: it is shown the same seven numbers the network is given; there are no neurons to draw and no learned policy to slice", rows: [{ who: "scripted", layer: "features", names: PP.FEATURE_NAMES, values: Array.from(x, num) }], map: null };
}

// ---- the tactics brain (flight-gpu.html): WHO to shoot and WHETHER to fight --------------------------------------------------------------------------------------------------------------------------------------
/**
 * The heat map of a tactics brain: how attractive a target at each point around `self` would be, by the policy's own scoring (ev/esTactics.js: reach x (wClose + wWeak weakness + wThreat threat + wPlayer isPlayer + wFocus focus)), a
 * hypothetical target having the MEAN weakness and threat of the real foes. The foes are the dots, the chosen one ringed.
 */
export function tacticsMap(self, foes, w, opts = {}, { n = 13 } = {}) {
    const range = opts.range || 1400, live = (foes || []).filter((f) => f && !f.dead && f !== self), k = Math.max(3, n | 0);
    const fe = live.map((f) => TX.features(self, f, opts)), mean = (key) => (fe.length ? fe.reduce((a, b) => a + b[key], 0) / fe.length : 0);
    const far = Math.max(range, ...live.map((f) => Math.hypot(f.x - self.x, f.y - self.y) * 1.05)), cells = [];
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
        const ox = far * (2 * i / (k - 1) - 1), oy = far * (2 * j / (k - 1) - 1), d = Math.hypot(ox, oy), reach = range / (range + d);
        const desire = w.wClose + w.wWeak * mean("weakness") + w.wThreat * mean("threat") + w.wPlayer * 0 + w.wFocus * 0;
        cells.push({ ox, oy, a: 0, b: 0, mag: Math.max(0, reach * desire) });
    }
    const d = TX.decide(self, live, w, opts), chosen = d.target && !d.target._flee ? d.target : null;
    const points = live.map((f) => ({ ox: f.x - self.x, oy: f.y - self.y, id: f.id, chosen: f === chosen, score: TX.chooseTarget(self, [f], w, opts) ? TX.chooseTarget(self, [f], w, opts).score : 0 }));
    return { kind: "tactics", spec: "tactics", n: k, cells, maxMag: Math.max(0, ...cells.map((c) => c.mag)), spanX: far, spanY: far, yUp: true, points, fleeing: !!d.fleeing, engaging: !!d.engaging, marker: { ox: 0, oy: 0, inside: true } };
}

/** Draw a tactics map: the heat of the scoring, the foes as dots (the chosen one ringed, a fleeing ship's heat dimmed), the ship at the centre. */
export function drawHeat(g, x, y, w, h, map, { title = "" } = {}) {
    g.fillStyle = "#050805"; g.fillRect(x, y, w, h);
    const cw = w / map.n, ch = h / map.n;
    for (const c of map.cells) {
        const fx = (c.ox + map.spanX) / (2 * map.spanX), fy = (c.oy + map.spanY) / (2 * map.spanY), px = x + Math.min(map.n - 1, Math.round(fx * (map.n - 1))) * cw, py = y + Math.min(map.n - 1, Math.round((1 - fy) * (map.n - 1))) * ch;
        const heat = map.maxMag > 0 ? c.mag / map.maxMag : 0;
        g.fillStyle = `rgba(${map.fleeing ? "255,122,122" : "89,209,255"},${(0.06 + 0.7 * heat).toFixed(3)})`; g.fillRect(px, py, cw - 1, ch - 1);
    }
    let dots = 0;
    for (const p of map.points) {
        const [px, py] = mapPoint(map, p.ox, p.oy, x, y, w, h);
        g.fillStyle = "#f6a623"; g.beginPath(); g.arc(px, py, 3, 0, Math.PI * 2); g.fill(); dots++;
        if (p.chosen) { g.strokeStyle = "#ffffff"; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 7, 0, Math.PI * 2); g.stroke(); }
    }
    const [sx, sy] = mapPoint(map, 0, 0, x, y, w, h);
    g.strokeStyle = "#5fe08a"; g.lineWidth = 1; g.beginPath(); g.moveTo(sx - 6, sy); g.lineTo(sx + 6, sy); g.moveTo(sx, sy - 6); g.lineTo(sx, sy + 6); g.stroke();
    g.fillStyle = "#9fb2d4"; g.font = "10px ui-monospace,Menlo,monospace"; g.fillText((title || "target attractiveness around this ship").slice(0, 60), x + 3, y + 10);
    return { cells: map.cells.length, arrows: 0, dots };
}

/** The panel of a tactics brain: probe { self, foes, w (the weights of its side), opts ({ lastTargetId, wasFleeing, range }), label }. */
export function tacticsPanel(probe) {
    if (!probe || !probe.self) return { kind: "none", label: "none", note: "no ship selected", rows: [], map: null };
    const w = probe.w || TX.DEFAULT_W, opts = probe.opts || {}, live = (probe.foes || []).filter((f) => f && !f.dead && f !== probe.self), cand = live.map((f) => ({ f, feat: TX.features(probe.self, f, opts), score: TX.chooseTarget(probe.self, [f], w, opts).score })).sort((a, b) => b.score - a.score);
    const d = TX.decide(probe.self, live, w, opts), hp = TX.healthFrac(probe.self), mine = TX.strength(probe.self), theirs = live.reduce((a, f) => a + TX.strength(f), 0), odds = mine + theirs > 0 ? mine / (mine + theirs) : 1;
    const keys = TX.FEATURE_KEYS, W = [w.wClose, w.wWeak, w.wThreat, w.wPlayer, w.wFocus];
    const rows = [{ who: "tactics", layer: "weights", label: "weights", names: ["close", "weak", "threat", "player", "focus"], values: W.map(num) }];
    for (const c of cand.slice(0, 4)) rows.push({ who: "tactics", layer: "target", label: `${String(c.f.id).slice(0, 5)} ${c.score.toFixed(2)}`, names: keys, values: keys.map((k) => num(c.feat[k])) });
    rows.push({ who: "tactics", layer: "flee", label: "flee", names: ["health", "bar", "odds", "bar"], values: [hp, w.fleeHealth + (opts.wasFleeing ? w.fleeHyst : 0), odds, w.fleeOdds].map(num) });
    return { kind: "tactics", label: probe.label || "tactics brain", note: (d.fleeing ? "FLEEING: health under the bar and the odds under theirs. " : d.engaging ? `ENGAGING ${d.target.id}. ` : "no target. ") + "weights, the features of the best candidates (their score beside them) and the flee test; the map is how attractive a target would be at each point, by the weights", rows, map: tacticsMap(probe.self, live, w, opts) };
}
