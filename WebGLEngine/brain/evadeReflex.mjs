// WebGLEngine/brain/evadeReflex.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE EVADE SEAT'S REFLEX: A CAPITAL SHIP GETS OUT OF THE WAY OF A CLOSING ONE. brain/EVADE_SEAT_REGISTRATION_DRAFT.md says what is to be flown and why; this is the reflex itself.
// Keith: "start that now" (after "Screen first", ten circuit arms, DNp04 for LC4). It sits after a ship's helm (brain/battleshipDuel.mjs's helmPilot: the rule, the hand rule, the
// helm network, then this) and changes what the helm asked for only while there is a THREAT. All of it is HAND-SET, NOT THE FLY'S, and was set before anything flew.
//
//   THE THREAT   threatOf(body, enemies): of the enemy capital ships (brain/spaceArena.mjs's ctx.enemies; not fighters, not shots), the one with the shortest TIME TO
//                CONTACT -- range over closing speed -- among those closing, within REACH (1,500 m) and under TAU0 (4 s). Its BEARING in the hull's frame (x the nose, z up, y
//                the hull's LEFT: positive to the left) and its ELEVATION (positive above the hull's plane). None: the reflex does nothing at all.
//   THE ACTIONS  (a share of the hull's own torque limit, FRACTION 0.5, as every helm here adds; the result goes back through the arena's own limits)
//      turn      a yaw torque AWAY from the threat: -FRACTION x tanh(2 S) about z, S positive for a threat on the left
//      burst     the thrust raised toward everything the pods give: rule + (max - rule) x E
//      climb     a pitch torque away from the threat's elevation: nose DOWN (+ about y) if it is above the hull's plane, UP if level or below; x E
//      jink      a yaw torque of the full FRACTION, its sign swapped every JINK_HALF (0.5 s) while the threat lasts, the first swing AWAY; a new threat starts it again
//   THE READ-OUT (S the side, E the strength)
//      "sine"    S = sin(bearing), E = 1 -- no circuit (stage 1, and stage 2's control)
//      "<type>:<orientation>"  type lc6 | lc16 | lc4 | lplc2, orientation medial | lateral | flat | shuffled:<seed>: brain/flyTracking.mjs pathwayOf over the type's baked circuit
//                (brain/<type>Topology.mjs, Synapses, Places; the descending neuron LC11's rule chose: DNp103, pIP1, DNp04, DNp01), driven at the threat's bearing as it drives LC10a
//                and LC11 at a target's. S is the descending neurons' right less left, ODD in the bearing, over its own peak, turned (its `sense`, set once per circuit, here)
//                so a threat at a quarter turn LEFT gives S > 0 -- the way that turns the hull away, as the sine does. E is their activity TOGETHER, even in the bearing, less
//                what they do with no cell driven, over its own peak (0..1): full at the circuit's strongest response, nothing where it does not respond. `medial`: the front of the
//                visual field at the sheet's medial end (front 1); `lateral` the other (front -1); `flat` no places; `shuffled:<seed>` connections shuffled within each type,
//                the places kept (front 1).
//   createReflex({ action, wiring }) -> reflex(out, ctx) -> out'   one ship's reflex (it keeps the jink's clock); reflex.last says what it did on the last tick
//   readoutOf(wiring) -> { S(e), E(e), sense, peakOdd, peakEven }   memoised; checkWiring(name) -> null or why not
// Held by brain/evadeReflex-selfcheck.mjs.
"use strict";
import * as RB from "../physics/mechanics/rigidBody6dof.mjs";
import { pathwayOf, BASELINE, STEPS } from "./flyTracking.mjs";
import { DT } from "./spaceArena.mjs";
import * as LC6T from "./lc6Topology.mjs";
import * as LC6S from "./lc6Synapses.mjs";
import * as LC6P from "./lc6Places.mjs";
import * as LC16T from "./lc16Topology.mjs";
import * as LC16S from "./lc16Synapses.mjs";
import * as LC16P from "./lc16Places.mjs";
import * as LC4T from "./lc4Topology.mjs";
import * as LC4S from "./lc4Synapses.mjs";
import * as LC4P from "./lc4Places.mjs";
import * as LPT from "./lplc2Topology.mjs";
import * as LPS from "./lplc2Synapses.mjs";
import * as LPP from "./lplc2Places.mjs";

export const TAU0 = 4, REACH = 1500, FRACTION = 0.5, JINK_HALF = 0.5;
export const ACTIONS = Object.freeze(["turn", "burst", "climb", "jink"]);
export const TYPES = Object.freeze({
    lc6: { topo: LC6T, syn: LC6S, places: LC6P, eye: "LC6", dn: "DNp103" },
    lc16: { topo: LC16T, syn: LC16S, places: LC16P, eye: "LC16", dn: "pIP1" },
    lc4: { topo: LC4T, syn: LC4S, places: LC4P, eye: "LC4", dn: "DNp04" },
    lplc2: { topo: LPT, syn: LPS, places: LPP, eye: "LPLC2", dn: "DNp01" },
});
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(a[0], a[1], a[2]);
/** A world vector in the hull's frame (the quaternion is [w, x, y, z]). */
export const toBody = (q, v) => RB.rotateByQuat([q[0], -q[1], -q[2], -q[3]], v);

/** The threat: the closing enemy capital ship with the shortest time to contact, under tau0 and within reach; null when there is none. */
export function threatOf(body, enemies = [], { tau0 = TAU0, reach = REACH } = {}) {
    let best = null;
    for (const e of enemies) {
        const d = sub(e.body.pos, body.pos), range = len(d); if (!(range > 0) || range >= reach) continue;
        const closing = -dot(sub(e.body.vel, body.vel), d) / range; if (!(closing > 0)) continue;
        const ttc = range / closing; if (ttc >= tau0 || (best && ttc >= best.ttc)) continue;
        const b = toBody(body.q, d);
        best = { id: e.id, ttc, range, closing, bearing: Math.atan2(b[1], b[0]), elevation: Math.atan2(b[2], Math.hypot(b[0], b[1])) };
    }
    return best;
}

export function checkWiring(name) {
    if (name === "sine") return null;
    const m = /^(lc6|lc16|lc4|lplc2):(medial|lateral|flat|shuffled:(\d+))$/.exec(String(name));
    return m ? null : `a wiring is "sine" or "<lc6|lc16|lc4|lplc2>:<medial|lateral|flat|shuffled:<seed>>" (got ${name})`;
}
const GRID = 720, MEMO = new Map();
/** The circuit's read-outs for a wiring (see the header). */
export function readoutOf(name) {
    const why = checkWiring(name); if (why) throw new Error(`evadeReflex.readoutOf: ${why}`);
    if (MEMO.has(name)) return MEMO.get(name);
    let R;
    if (name === "sine") R = { name, S: (e) => Math.sin(e), E: () => 1, sense: 1, peakOdd: 1, peakEven: 1 };
    else {
        const [type, how, seed] = name.split(":"), T = TYPES[type], p = pathwayOf({ topo: T.topo, syn: T.syn, places: T.places, eye: T.eye, dn: T.dn }), M = p.matrix(how === "shuffled" ? p.retarget(Number(seed)) : null);
        const c = p.circuit(M, how === "flat" ? { flat: true } : { front: how === "lateral" ? -1 : 1 }), odd = new Float64Array(GRID + 1), even = new Float64Array(GRID + 1);
        for (let k = 0; k <= GRID; k++) { const e = (Math.PI * k) / GRID, a = c.cells(e), b = c.cells(-e); odd[k] = ((a[p.dnR] - a[p.dnL]) - (b[p.dnR] - b[p.dnL])) / 2; even[k] = (a[p.dnR] + a[p.dnL] + b[p.dnR] + b[p.dnL]) / 2; }
        // what the descending neurons do with no cell driven: the circuit's own three steps from rest, the constant drive on them alone
        let h = new Float64Array(p.n); for (let s = 0; s < STEPS; s++) { const y = new Float64Array(p.n); for (let i = 0; i < p.n; i++) { let v = h[i] + (i === p.dnL || i === p.dnR ? BASELINE : 0); for (let t = M.start[i]; t < M.start[i + 1]; t++) v += M.val[t] * h[M.src[t]]; y[i] = v > 0 ? v : 0; } h = y; }
        const base = h[p.dnL] + h[p.dnR], peakOdd = Math.max(...odd.map(Math.abs)) || 1, peakEven = Math.max(...even) - base;
        const quarter = odd[GRID / 2], sense = quarter < 0 ? -1 : 1;
        const at = (tab, e) => { const x = (Math.min(Math.abs(e), Math.PI) / Math.PI) * GRID, k = Math.min(GRID - 1, Math.floor(x)); return tab[k] + (tab[k + 1] - tab[k]) * (x - k); };
        R = { name, sense, peakOdd, peakEven, base, quarter,
            S: (e) => { const w = Math.atan2(Math.sin(e), Math.cos(e)), v = (sense * at(odd, w)) / peakOdd; return w < 0 ? -v : v; },
            E: (e) => (peakEven > 0 ? Math.min(1, Math.max(0, (at(even, Math.atan2(Math.sin(e), Math.cos(e))) - base) / peakEven)) : 0) };
    }
    MEMO.set(name, Object.freeze(R));
    return MEMO.get(name);
}

/** One ship's reflex. */
export function createReflex({ action, wiring = "sine", tau0 = TAU0, reach = REACH, dt = DT } = {}) {
    if (!ACTIONS.includes(action)) throw new Error(`evadeReflex.createReflex: an action is ${ACTIONS.join(", ")} (got ${action})`);
    const R = readoutOf(wiring), jink = { id: null, t: 0, first: -1 };
    function reflex(out, ctx) {
        const th = threatOf(ctx.body, ctx.enemies || [], { tau0, reach });
        if (!th) { jink.id = null; reflex.last = null; return out; }
        const lim = ctx.ship.maxAlpha, I = ctx.body.I, S = R.S(th.bearing), E = R.E(th.bearing), torque = out.torque.slice(); let thrust = out.thrust, value = 0;
        if (action === "turn") { value = -Math.tanh(2 * S); torque[2] += FRACTION * lim * I[2] * value; }
        else if (action === "burst") { value = E; thrust = out.thrust + Math.max(0, ctx.thrustMax - out.thrust) * E; }
        else if (action === "climb") { value = (th.elevation > 0 ? 1 : -1) * E; torque[1] += FRACTION * lim * I[1] * value; }
        else {
            if (jink.id !== th.id) { jink.id = th.id; jink.t = 0; jink.first = S > 0 ? -1 : S < 0 ? 1 : -1; }
            value = jink.first * (Math.floor(jink.t / JINK_HALF + 1e-9) % 2 === 0 ? 1 : -1); torque[2] += FRACTION * lim * I[2] * value; jink.t += dt;
        }
        reflex.last = { threat: th, S, E, value };
        return { torque, thrust };
    }
    reflex.last = null; reflex.action = action; reflex.wiring = wiring;
    return reflex;
}
