// WebGLEngine/brain/flyTracking.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY'S TARGET-TRACKING CIRCUIT WIRED AS THE FLY WIRES IT, AND A GUNNER THAT READS IT. brain/flySteering.mjs gave a helm the fly's steering circuit with its own inputs and outputs and the connectome's own weights, and for the first time a fly's wiring did the work. Keith: "give the gunners the same treatment."
// The gunners' circuit is the visual pursuit pathway of brain/lc10Topology.mjs -- 275 LC10a cells of the eye, onto AOTU019 and AOTU025, onto the steering neuron DNa02 -- and the search over it through a free encoder kept nothing (tools/ship/trainTrackSeat.mjs: 0 of 100 children). Here, as there, the free parts go:
//
//   IN    a target's BEARING e from where the gun points (radians, positive to one side) drives the LC10a cells of ONE EYE -- the left eye's for a target to the positive side, the right's for the other, both within the fly's binocular overlap (15 degrees either side of straight ahead, a linear share) -- and among them
//         the cells whose DENDRITE IS WHERE THE TARGET IS: each cell has a place across its side's dendritic sheet (brain/lc10Places.mjs, a rank 0..1 from the lateral end to the medial, read off the dataset's synapse coordinates) and responds exp(-(place - p)^2 / 2 sigma^2), sigma 0.15, to a target whose eccentricity
//         |e| of a half turn maps to the place p.
//   CORE  the circuit with THE CONNECTOME'S OWN WEIGHTS: a connection's weight is its synapse count over all the synapses its target receives within the circuit, NEGATIVE from an AOTU019 cell (predicted GABA). Three steps of h <- max(0, h + W h + b), b a constant drive of 0.5 on the two DNa02 cells only (so that an
//         inhibition has something to take from: without it AOTU019, two thirds of the synapses, does nothing). No weight is learned.
//   OUT   DNa02 on the right less DNa02 on the left, READ THE ODD WAY as the helm's second variant is: asked for e and for -e, half the difference -- exactly zero when the gun is on its target. One number, S(e), over its own peak.
//
// WHAT IS NOT KNOWN AND IS FLOWN BOTH WAYS: which end of the sheet's axis is the FRONT of the visual field. `fly:medial` puts straight ahead at the medial end (place 1) and the rear at the lateral; `fly:lateral` the other way. The data used here cannot say (the gate of the vendored positions says so).
// THE OTHER WIRINGS: `flat` -- the same circuit with NO places: every cell of an eye answers alike, so only the SIDE of the target is carried; `shuffled:<seed>` -- `fly:medial` with each pathway's targets shuffled within their type; `sine` -- no circuit, S = -sin(e) to a quarter turn and held beyond; `scrambled:<seed>` -- THE CONTROL FOR THE PLACES: the fly's circuit and connections with each eye's cells trading places among themselves, so that a target drives as many cells as much but not the fly's own cells for that bearing; `unneighboured:<seed>` -- every cell at ITS place and with its own connections onward, and only the LC10a cells' connections TO EACH OTHER shuffled within an eye (a scramble breaks that neighbourhood too; this breaks only it).
//
// WHAT IT COMPUTES (tuning(); the gate pins it): with places, S rises smoothly from zero through the overlap and on to a peak near a quarter turn, then falls toward the rear -- a graded command, larger for a target further off -- where `flat` is at its full value by 15 degrees and stays there (a switch).
// The two orientations differ little in this (the peak moves): the gradient the positions show in which pathway a cell feeds is real and is small beside the overlap and the sheet's own shape.
//
// THE GUNNER (gunnerFor): brain/seatTurretGunner.mjs's gunner -- the sight, the hand's error, the rates turned over a tick -- with this in place of its network: the sight's error in traverse is a bearing, its error in elevation is another, each goes through the circuit, and tanh(gain x S) is the share of the seat's slew
// rate commanded on that axis. THE TRIGGER IS THE SIGHT'S OWN RULE, untouched. TWO WEIGHTS: the two gains. (Zero gains are a gun that does not move: there is no rule underneath a gunner as there is under a helm.)
//
// WHAT A SHIP MAKES OF IT (tools/ship/takeFlyWiredGunner.mjs, registered before its pairs, read once on 600, no cannon): the fly-wired gunner LEADS the seat's hand gunner either way round (medial +0.748, lateral +0.704), cannot be told from the sine's (-0.020) or from the race car's untrained hand rule (+0.024),
// and THE CELLS' PLACES ARE WORTH +0.101 (z 2.7) over the same circuit with none -- the graded command beats the switch, against my forecast. The shuffled circuit trails (-0.600): one seed, a weak control, said so.
//
// *** CHOSEN BY ME, NOT BY A FLY AND NOT IN A FIGHT: sigma 0.15, the 15 degrees of overlap, the constant 0.5 on DNa02, three steps, the normalisation, a rank for a place, and that eccentricity maps linearly to place over a half turn. One axis of the sheet is used; the other (ALONG) is not. A real LC10a cell answers
// a small MOVING object; nothing here moves. ***
// THE TARGET'S MOTION (2026-11-18; Keith: "target motion for the tracking circuit"). `moving` (policy seatFlyWired5) drives the cells at the bearing PLUS TAU TIMES THE BEARING'S RATE (the slip: the change since the last tick, 0 on a new target or after a
//   tick the network was not asked), tau a third weight, 0 the ships-sticky gunner to the bit; `movingWith({ smooth })` low-passes the slip first (a motion detector integrates). NOT REGISTERED, scratch only (seeds 7-10 of each fighter kind; fleets 133001-133006 of each kind):
//   against eight fighters NO tau beat 0 (117 kills over 64 attacks at tau 0; 97 at 0.05 and 27 at 0.15 unsmoothed, the slip being mostly the sight's own noise differenced; smoothed over 0.4 s, 114 and 108; -0.05 no better), and in fleets of three tau 0.15 smoothed 0.4 s
//   TRAILS tau 0 (-0.273, se 0.103, without the cannon; -0.233, se 0.099, with it; 24 pairs each), 0.05 is level. So no study was registered and nothing ships: the motion term as modelled here is a cost. NOT TRIED: a slip read off the target's own velocity
//   (the arena shows it) rather than the sight's noisy aim, a motion term on the cells' own dynamics, the sheet's other axis for elevation.
// THE SLIP FROM THE TARGET (2026-11-19; round 4): `movingWith({ from: "target" })` reads the slip off the target's own bearing in the ship's frame, from where it really is each tick. On the same scratch fighter attacks tau 0.1 gave 125 kills (128 smoothed over
//   0.2 s) against 117 at tau 0 (the plain ship 128), 0.2 about level, 0.4 and 0.8 far worse (overshoot); in fleets of three (24 pairs) tau 0.1 was level with and without the cannon (-0.022 to +0.071). So `movingTarget` (seatFlyWired7: tau 0.1, smoothed 0.2 s,
//   CHOSEN ON THOSE SCRATCH PAIRS) goes to a registered study on fresh pairs: tools/ship/takeFlyWiredGunnerSees.mjs.
// THE HAND FOR THE LAST DEGREES (2026-11-20; round 2 of the second set). NOT REGISTERED, scratch pairs 133001-133012 of each kind, fleets of three, against seatFlyWired8 (48 pairs each): the hand laying the gun within 6 degrees of the solution
//   +0.063 with the cannon and +0.056 without, within 10 degrees +0.170 and +0.201, within 20 degrees +0.173 and +0.258; a stiffer circuit instead (the gains -6 and -10) LOST, -0.13 to -0.21. So `holdNear` (seatFlyWired9: 20 degrees) goes to a
//   registered study on fresh pairs: tools/ship/takeFlyWiredGunnerNear.mjs.
// AN ELEVATION OF ITS OWN (2026-11-19; round 5): `elevatedWith({ front })` reads the gun's pitch off the circuit with its cells at their places ALONG the sheet's other axis. The command is nearly the yaw's (front +1 about 20% steeper close in, -1 about
//   10%: places are ranks, so either axis spreads the cells evenly, and only how the wiring sits on the axis can differ). On scratch pairs it was level: 117-118 kills against fighters (117 the ships-sticky gunner), and in fleets of three -0.074 to +0.004 against
//   the ships-sticky gunner, none told. So no study was registered and nothing ships.
"use strict";
import * as LC from "./lc10Topology.mjs";
import * as SY from "./lc10Synapses.mjs";
import * as PL from "./lc10Places.mjs";
import * as ST from "./seatTurretGunner.mjs";
import * as GS from "../physics/mechanics/gunSeats.mjs";

export const POLICY_ID = "seatFlyWired", SIGMA = 0.15, OVERLAP = 15 * Math.PI / 180, BASELINE = 0.5, STEPS = 3, CONTROL_SEED = 4242;
export const FEATURES = ST.FEATURES, HIDDEN = LC.NEURON_ORDER.length, OUTPUTS = ST.OUTPUTS, WEIGHT_COUNT = 2;   // peerBrain's description of a brain: the seat's eleven features, 281 neurons, the seat's five outputs, two weights (the gains)
const N = HIDDEN, TYPES = LC.NEURON_TYPES, SOMA = SY.NEURON_SOMA;
export const signOf = (nt) => (nt === "acetylcholine" ? 1 : -1);
const EYE_L = [], EYE_R = []; TYPES.forEach((t, i) => { if (t === "LC10a") (SOMA[i] === "L" ? EYE_L : EYE_R).push(i); });
const DNA02_L = TYPES.findIndex((t, i) => t === "DNa02" && SOMA[i] === "L"), DNA02_R = TYPES.findIndex((t, i) => t === "DNa02" && SOMA[i] === "R");
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function matrixOf(retarget = null) {
    const rows = Array.from({ length: N }, () => new Map()), total = new Float64Array(N);
    LC.EDGES.forEach(([to0, from], k) => { const to = retarget ? retarget(TYPES[from], to0) : to0, c = SY.EDGE_COUNTS[k]; rows[to].set(from, (rows[to].get(from) || 0) + signOf(SY.NEURON_NT[from]) * c); total[to] += c; });
    const start = new Int32Array(N + 1), src = [], val = [];
    for (let i = 0; i < N; i++) { start[i] = src.length; for (const [j, v] of [...rows[i]].sort((a, b) => a[0] - b[0])) { src.push(j); val.push(v / total[i]); } }
    start[N] = src.length;
    return { start, src: Int32Array.from(src), val: Float64Array.from(val) };
}
function retargetOf(seed) {
    const rng = mulberry(seed), byType = {}, maps = new Map(); TYPES.forEach((t, i) => (byType[t] ||= []).push(i));
    return (sourceType, to) => { const key = sourceType + ">" + TYPES[to]; if (!maps.has(key)) { const cells = byType[TYPES[to]], p = cells.slice(); for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } maps.set(key, new Map(cells.map((v, k) => [v, p[k]]))); } return maps.get(key).get(to); };
}
/** The circuit over a matrix: raw(e) -> DNa02 right less left for a target at bearing e; cells(e) -> the 281 activities. `front`: +1 straight ahead at the medial end of the sheet, -1 at the lateral; `flat`: no places. */
function circuitOf(M, { front = 1, flat = false, baseline = BASELINE, places = PL.ACROSS } = {}) {
    function cells(e) {
        let h = new Float64Array(N); const wl = Math.min(1, Math.max(0, 0.5 + e / (2 * OVERLAP))), wr = 1 - wl, ecc = Math.min(1, Math.abs(e) / Math.PI), p = front > 0 ? 1 - ecc : ecc, g = (i) => (flat ? 1 : Math.exp(-((places[i] - p) ** 2) / (2 * SIGMA * SIGMA)));
        if (wl > 0) for (const i of EYE_L) h[i] = wl * g(i);
        if (wr > 0) for (const i of EYE_R) h[i] = wr * g(i);
        for (let s = 0; s < STEPS; s++) { const y = new Float64Array(N); for (let i = 0; i < N; i++) { let a = h[i] + (i === DNA02_L || i === DNA02_R ? baseline : 0); for (let t = M.start[i], t1 = M.start[i + 1]; t < t1; t++) a += M.val[t] * h[M.src[t]]; y[i] = a > 0 ? a : 0; } h = y; }
        return h;
    }
    const raw = (e) => { const h = cells(e); return h[DNA02_R] - h[DNA02_L]; };
    return { cells, raw };
}
/** THE NEIGHBOURHOOD SHUFFLED, THE PLACES KEPT: the retarget for `unneighboured:<seed>` -- only the LC10a-to-LC10a connections move, each to another LC10a cell of the same eye (one random permutation an eye). Every cell stays at its place and keeps its connections onto AOTU019 and AOTU025. */
function unneighbourOf(seed) {
    const rng = mulberry(seed), map = new Map();
    for (const eye of [EYE_L, EYE_R]) { const p = eye.slice(); for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } eye.forEach((c, k) => map.set(c, p[k])); }
    return (sourceType, to) => (sourceType === "LC10a" && TYPES[to] === "LC10a" ? map.get(to) : to);
}
/** THE PLACES SCRAMBLED: each eye's cells keep their connections and trade PLACES among themselves (one random permutation an eye, from `seed`). The set of places is the same, so a target still drives as many cells as much; WHICH cell is where -- and so which pathway the cells under a target feed -- is not the fly's. */
function scrambledPlaces(seed) {
    const rng = mulberry(seed), out = Array.from(PL.ACROSS);
    for (const eye of [EYE_L, EYE_R]) { const v = eye.map((i) => PL.ACROSS[i]); for (let i = v.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [v[i], v[j]] = [v[j], v[i]]; } eye.forEach((c, k) => { out[c] = v[k]; }); }
    return out;
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** A gunner library over a raw read-out raw(e): S(e) = the odd half of raw over its own peak, memoised on a fine grid of bearings (a gunner asks 26 times a tick); and the seat gunner's contract. */
/** The odd read-out of a raw read-out, over its own peak, memoised on a fine grid: { S, amplitude }. */
function oddOf(raw) {
    const GRID = 720, table = new Float64Array(GRID + 1); let peak = 0;
    for (let k = 0; k <= GRID; k++) { const e = Math.PI * k / GRID; table[k] = (raw(e) - raw(-e)) / 2; peak = Math.max(peak, Math.abs(table[k])); }
    const amplitude = peak || 1;
    /** The command for a bearing: odd in e, exactly 0 at 0, in [-1, 1]; linear between the grid's bearings (a quarter of a degree apart). */
    function S(e) { const a = wrap(e), x = Math.abs(a) / Math.PI * GRID, k = Math.min(GRID - 1, Math.floor(x)), v = (table[k] + (table[k + 1] - table[k]) * (x - k)) / amplitude; return a < 0 ? -v : v; }
    return { S, amplitude };
}
function libraryOf(name, raw, cells = null, { sticky = false, handOn = null, handRest = true, motion = false, smooth = 0, from = "aim", pitchRaw = null } = {}) {
    const { S, amplitude } = oddOf(raw), Sp = pitchRaw ? oddOf(pitchRaw).S : S;   // `pitchRaw` (2026-11-19): ANOTHER read-out for the gun's pitch -- the circuit with its cells at their places along the sheet's other axis; without it the pitch is read off the same S as the yaw
    const count = motion ? WEIGHT_COUNT + 1 : WEIGHT_COUNT, zeroWeights = () => new Float32Array(count);
    /** The seat's five outputs from its eleven features: the two rates from the circuit, the trigger the sight's own. With `motion`, `forward(w, x, slip)` drives the cells at the bearing PLUS w[2] (seconds) TIMES ITS RATE, slip = [yaw, pitch] in radians a second (0 when not given). */
    const forward = (w, x, slip = null) => { const ey = x[1] * Math.PI, ep = x[2] * Math.PI / 2, tau = motion ? w[2] : 0, dy = slip ? slip[0] : 0, dp = slip ? slip[1] : 0; return [Math.tanh(w[0] * S(ey + tau * dy)), Math.tanh(w[1] * Sp(ep + tau * dp)), x[8] > 0 ? 1 : -1, 0, 0]; };
    const gunnerFor = !motion ? (w, sight, opts = {}) => ST.gunnerFor(w, sight, { ...opts, sticky, handOn, handRest, forward, layersOf: () => [], post: (y) => y }) : (w, sight0, opts = {}) => {
        // THE TARGET'S MOTION (2026-11-18): the slip is the bearing's change since the tick before, over the tick -- 0 on the first tick the network lays the gun on a target (a new target, or after a tick it was not asked: no target, or the hand's)
        const dt = opts.dt ?? 1 / 30, sight1 = sticky === "ships" ? ST.stickySight(sight0, { only: ST.SHIPS_ONLY }) : sticky ? ST.stickySight(sight0) : sight0, now = { target: null, t: 0 }, prev = { target: null, t: -Infinity, ey: 0, ep: 0, sy: 0, sp: 0 }, keep = smooth > 0 ? Math.exp(-dt / smooth) : 0;
        const sight = (seat, st, body, targets, t = 0) => { const r = sight1(seat, st, body, targets, t); now.target = r.target; now.t = t; if (from === "target") { const tg = r.target == null ? null : targets.find((q) => q.id === r.target); if (tg) { const a = GS.reachOf(seat, body, [tg.pos[0] - body.pos[0], tg.pos[1] - body.pos[1], tg.pos[2] - body.pos[2]]); now.ay = a.yaw; now.ap = a.pitch; } } return r; };   // `from: "target"`: the target's own bearing in the ship's frame, from where it really is (no sight's noise)
        const fwd = (ww, x) => { const ey = x[1] * Math.PI, ep = x[2] * Math.PI / 2, fresh = now.target !== prev.target || Math.abs(now.t - prev.t - dt) > dt / 2, raw = fresh ? [0, 0] : from === "target" ? [wrap(now.ay - prev.ay) / dt, (now.ap - prev.ap) / dt] : [wrap(ey - prev.ey) / dt, (ep - prev.ep) / dt];
            if (fresh) { prev.sy = 0; prev.sp = 0; } else { prev.sy = keep * prev.sy + (1 - keep) * raw[0]; prev.sp = keep * prev.sp + (1 - keep) * raw[1]; }   // `smooth` (seconds, 0 none): the slip low-passed, as a motion detector integrates
            prev.target = now.target; prev.t = now.t; prev.ey = ey; prev.ep = ep; prev.ay = now.ay; prev.ap = now.ap; return forward(ww, x, [prev.sy, prev.sp]); };
        const d = ST.gunnerFor(w, sight, { ...opts, sticky: false, handOn, handRest, forward: fwd, layersOf: () => [], post: (y) => y }); d.slip = () => ({ ...prev }); return d;
    };
    const gunnerFactory = (w, makeSight, opts = {}) => (seat, k) => gunnerFor(w, makeSight(seat, k), { ...opts, seed: (opts.seed ?? 1) + k });
    return Object.freeze({ name, amplitude, sticky, motion, ...(motion ? { smooth, from } : {}), elevated: pitchRaw !== null, Sp, FEATURES, HIDDEN, OUTPUTS, WEIGHT_COUNT: count, raw, cells, S, zeroWeights, handWeights: zeroWeights, forward, gunnerFor, gunnerFactory });
}
const FLY_M = circuitOf(matrixOf(), { front: 1 }), LIBS = new Map();
/** The library for a wiring NAME: "fly:medial", "fly:lateral", "flat", "shuffled:<seed>", "sine". See the header. */
export function wiringOf(name = "fly:medial") {
    if (LIBS.has(name)) return LIBS.get(name);
    let lib = null; const m = /^shuffled:(\d+)$/.exec(String(name));
    if (name === "fly:medial") lib = libraryOf(name, FLY_M.raw, FLY_M.cells);
    else if (name === "fly:lateral") { const c = circuitOf(matrixOf(), { front: -1 }); lib = libraryOf(name, c.raw, c.cells); }
    else if (name === "flat") { const c = circuitOf(matrixOf(), { flat: true }); lib = libraryOf(name, c.raw, c.cells); }
    else if (name === "sine") lib = libraryOf(name, (e) => -Math.sin(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, e))));
    else if (m) { const c = circuitOf(matrixOf(retargetOf(Number(m[1]))), { front: 1 }); lib = libraryOf(name, c.raw, c.cells); }
    else if (/^unneighboured:\d+$/.test(String(name))) { const c = circuitOf(matrixOf(unneighbourOf(Number(String(name).slice(14)))), { front: 1 }); lib = libraryOf(name, c.raw, c.cells); }
    else if (/^scrambled:\d+$/.test(String(name))) { const c = circuitOf(matrixOf(), { front: 1, places: scrambledPlaces(Number(String(name).slice(10))) }); lib = libraryOf(name, c.raw, c.cells); }
    else throw new Error(`flyTracking.wiringOf: a wiring is "fly:medial", "fly:lateral", "flat", "sine", "shuffled:<seed>", "scrambled:<seed>" or "unneighboured:<seed>" (got ${name})`);
    LIBS.set(name, lib); return lib;
}
const MAIN = wiringOf("fly:medial");
export const S = MAIN.S, raw = MAIN.raw, cells = MAIN.cells, forward = MAIN.forward, zeroWeights = MAIN.zeroWeights, handWeights = MAIN.handWeights, gunnerFor = MAIN.gunnerFor, gunnerFactory = MAIN.gunnerFactory, topology = LC;
/** THE STICKY GUNNER (`seatFlyWired2`): the fly-wired gunner (`fly:medial`, the same two gains) behind brain/seatTurretGunner.mjs's stickySight -- it keeps the target it chose while it can still be shot. See tools/ship/takeFlyWiredGunnerFix.mjs. */
export const POLICY_ID2 = "seatFlyWired2", sticky = libraryOf("fly:medial, sticky", FLY_M.raw, FLY_M.cells, { sticky: true });
/** THE GUNNER WHOSE SIGHT STICKS TO SHIPS ONLY (`seatFlyWired3`): the sticky gunner trailed the shipped one against fighters (tools/ship/takeFlyWiredGunnerFix.mjs); this one sticks to a capital ship and re-picks among fighters every tick. See tools/ship/takeFlyWiredGunnerShips.mjs. */
export const POLICY_ID3 = "seatFlyWired3", stickyShips = libraryOf("fly:medial, sticky to ships", FLY_M.raw, FLY_M.cells, { sticky: "ships" });
/** THE MIXED GUNNER (`seatFlyWired4`): the ships-sticky gunner for a SHIP, and the hand gunner's own laying and trigger for a FIGHTER (brain/seatTurretGunner.mjs's `handOn`). Against fighters alone it is the hand gunner to the bit (with no target its gun goes back to rest, as the hand's does); against ships it is the ships-sticky gunner but for that. See tools/ship/takeFlyWiredGunnerMixed.mjs. */
export const POLICY_ID4 = "seatFlyWired4", mixed = libraryOf("fly:medial for ships, the hand for fighters", FLY_M.raw, FLY_M.cells, { sticky: "ships", handOn: (q) => !ST.SHIPS_ONLY(q) });
/** THE GUNNER THAT SEES ITS TARGET MOVE (`seatFlyWired5`): the ships-sticky gunner with its LC10a cells driven at the bearing PLUS TAU TIMES THE BEARING'S RATE -- a moving target drives the cells ahead of where it is, as a target sliding across the fly's eye
 *  excites the cells it is moving towards. Three weights: the two gains and tau (seconds; 0 is the ships-sticky gunner to the bit). Keith, 2026-11-18: "target motion for the tracking circuit". See tools/ship/takeFlyWiredGunnerMotion.mjs. */
export const POLICY_ID5 = "seatFlyWired5", moving = libraryOf("fly:medial, sticky to ships, seeing its target move", FLY_M.raw, FLY_M.cells, { sticky: "ships", motion: true });
/** A motion gunner with another low-pass on the slip (seconds): for the study's hand-set choice and the gate. */
export const movingWith = ({ smooth = 0, from = "aim" } = {}) => { if (from !== "aim" && from !== "target") throw new Error(`flyTracking.movingWith: from is "aim" or "target" (got ${from})`); return libraryOf(`fly:medial, sticky to ships, seeing its target move (from the ${from}), slip smoothed ${smooth} s`, FLY_M.raw, FLY_M.cells, { sticky: "ships", motion: true, smooth, from }); };
/** THE MIXED GUNNER THAT HOLDS (`seatFlyWired6`): the mixed gunner, but with no target its gun stays where it is (the network gunner's hold), not back at rest -- the rest cost the mixed gunner -0.269 in fleets without escorts (tools/ship/takeFlyWiredGunnerMixed.mjs).
 *  So in a fleet with no fighters it IS the ships-sticky gunner to the bit; the hand lays the gun only on a fighter. See tools/ship/takeFlyWiredGunnerHold.mjs. */
export const POLICY_ID6 = "seatFlyWired6", mixedHold = libraryOf("fly:medial for ships, the hand for fighters, holding with no target", FLY_M.raw, FLY_M.cells, { sticky: "ships", handOn: (q) => !ST.SHIPS_ONLY(q), handRest: false });
/** THE GUNNER THAT SEES ITS TARGET MOVE, FROM WHERE IT REALLY IS (`seatFlyWired7`, 2026-11-19): the motion gunner with the slip read off the TARGET'S OWN BEARING in the ship's frame (its true position each tick: no sight's noise), low-passed over
 *  0.2 s; three weights, the study's tau 0.1 (0 is the ships-sticky gunner to the bit). The slip from the sight's aim was a cost (see the header); this one was not, on scratch pairs. See tools/ship/takeFlyWiredGunnerSees.mjs. */
export const POLICY_ID7 = "seatFlyWired7", movingTarget = movingWith({ smooth: 0.2, from: "target" });
/** THE GUNNER WITH AN ELEVATION OF ITS OWN (2026-11-19; round 5): the ships-sticky gunner, its YAW from the cells at their places ACROSS the sheet as before and its PITCH from the same circuit with the cells at their places ALONG the sheet's other axis
 *  (brain/lc10Places.mjs's ALONG, the rank toward larger y in the dataset's own frame). Which end of that axis is the front of the vertical field is not known: `front` +1 puts the gun's line at the larger-y end, -1 at the smaller (a hand-set choice, flown both ways). */
const ELEVATED = new Map();
export const elevatedWith = ({ front = 1 } = {}) => { if (front !== 1 && front !== -1) throw new Error(`flyTracking.elevatedWith: front is 1 or -1 (got ${front})`); if (!ELEVATED.has(front)) ELEVATED.set(front, libraryOf(`fly:medial, sticky to ships, elevation along the sheet (front ${front > 0 ? "+y" : "-y"})`, FLY_M.raw, FLY_M.cells, { sticky: "ships", pitchRaw: circuitOf(matrixOf(), { front, places: PL.ALONG }).raw })); return ELEVATED.get(front); };
/** THE HOLDING MIXED GUNNER THAT SEES ITS TARGET MOVE (`seatFlyWired8`, 2026-11-19): the two gunners that shipped that day in one -- on a SHIP the cells are driven at the bearing plus tau times the target's own bearing rate (seatFlyWired7's slip, low-passed
 *  over 0.2 s), on a FIGHTER the seat is the hand gunner, with no target it holds (seatFlyWired6). Three weights, the third tau (0.1 as flown; 0 is seatFlyWired6 to the bit). Against fighters alone it IS seatFlyWired6 whatever tau (the network is never
 *  asked); in fleets with no fighters it IS seatFlyWired7. See tools/ship/takeFlyWiredGunnerHoldSees.mjs. */
export const POLICY_ID8 = "seatFlyWired8", holdSees = libraryOf("fly:medial for ships, seeing its target move, the hand for fighters, holding with no target", FLY_M.raw, FLY_M.cells, { sticky: "ships", handOn: (q) => !ST.SHIPS_ONLY(q), handRest: false, motion: true, smooth: 0.2, from: "target" });
/** THE GUNNER WHOSE HAND LAYS THE LAST DEGREES (`seatFlyWired9`, 2026-11-20): the seeing holding gunner (seatFlyWired8), but where the gun is within NEAR (20 degrees) of the sight's solution on a ship, the seat does what the hand does -- the circuit makes
 *  the big swings, the hand the fine laying. Why: the fly gun, not firing, sat a median 3-5 degrees off the solution, just outside the trigger's window, where the circuit's command is soft (10% of the slew at 2 degrees); a stiffer gain overshot and lost
 *  (tools/ship/takeFlyWiredGunnerShips.mjs's header). NEAR 20 degrees was CHOSEN ON SCRATCH PAIRS (the module header). `holdSeesNear(near)` builds another. See tools/ship/takeFlyWiredGunnerNear.mjs. */
export const NEAR = 20 * Math.PI / 180;
export const holdSeesNear = (near) => libraryOf(`fly:medial for ships until within ${near} rad, then the hand; the hand for fighters; holding; seeing its target move`, FLY_M.raw, FLY_M.cells, { sticky: "ships", handOn: (q, rule, st) => !ST.SHIPS_ONLY(q) || (rule && st && Math.hypot(wrap(rule.yaw - st.yaw), rule.pitch - st.pitch) < near), handRest: false, motion: true, smooth: 0.2, from: "target" });
export const POLICY_ID9 = "seatFlyWired9", holdNear = holdSeesNear(NEAR);
export const EYES = Object.freeze({ L: Object.freeze(EYE_L.slice()), R: Object.freeze(EYE_R.slice()), DNa02: Object.freeze([DNA02_L, DNA02_R]) });
/** The circuit with another constant drive on DNa02 (for the gate's and the header's claim about what the baseline does). */
export const withBaseline = (baseline) => circuitOf(matrixOf(), { front: 1, baseline });

/** What a command S computes: its value at each of `degrees`, where it peaks, and the bearing by which it has reached 90% of its peak. */
export function tuning(Sfn = S, degrees = [1, 3, 6, 10, 15, 25, 40, 60, 90, 120, 150, 175]) {
    const curve = degrees.map((d) => Sfn(d * Math.PI / 180)); let peakAt = 0, peak = 0, reach = null;
    for (let d = 0.5; d <= 180; d += 0.5) { const v = Math.abs(Sfn(d * Math.PI / 180)); if (v > peak) { peak = v; peakAt = d; } }
    for (let d = 0.5; d <= 180 && reach === null; d += 0.5) if (Math.abs(Sfn(d * Math.PI / 180)) >= 0.9 * peak) reach = d;
    return { degrees, curve, peakAt, peak, reach };
}

export function reportLines() {
    const t = tuning(), f = tuning(wiringOf("flat").S), l = tuning(wiringOf("fly:lateral").S);
    return ["[flyTracking] the fly's target-tracking circuit wired as the fly wires it: a target's bearing onto the LC10a cells of one eye at their own places, the connectome's own signed weights, DNa02 right less left out (read the odd way)",
        `  ${N} neurons, ${LC.EDGES.length} connections, no learned weight inside; with places the command reaches 90% of its peak at ${t.reach} degrees and peaks at ${t.peakAt} (the other way round: ${l.reach} and ${l.peakAt}); with no places it is there by ${f.reach} degrees: a switch; the gunner on it has two weights (two gains) and the sight's own trigger`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
