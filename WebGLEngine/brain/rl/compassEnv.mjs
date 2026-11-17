// WebGLEngine/brain/rl/compassEnv.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A HEADING LIFE IN A SCENE NEW EACH TIME (the compass round, registered in brain/FLY_COMPASS_LEARNS_WIP.md before this file existed). LIFE_STEPS ticks. The fly's true heading starts at 0 and turns
// by its action each tick, held to MAX_TURN either way. Its goal starts at 0 and is drawn anew, uniform, every GOAL_EVERY ticks. Two landmarks a life, each at an azimuth drawn uniform with a
// strength from 0.5 to 1.5. From CALM on, GUSTS: every 40 to 79 ticks the heading is pushed by a normal draw of sd GUST radians, which the fly does not feel except through what it sees. The reward
// is cos(heading - goal) from SCORE_FROM, over LIFE_STEPS - SCORE_FROM: a life's return is the mean alignment in the wind. info.dist is 1 less the return so far and nothing docks or crashes, so
// brain/rl/dockPolicy.js's trainDockES keeps the best return.
// The observation: the activity of each of the 282 ring neurons, then the goal, then the tick (CLOCK). Ring neuron j's activity is the sum over landmarks of strength x exp(KR (cos(azimuth -
// heading - PREF[j]) - 1)); PREF is drawn once, uniform, from seed PREF_SEED -- the connectome gives no receptive fields, and this is a modelling choice.
// Pure: no I/O, no clock, no Math.random (xorshift32 streams, seeded).
"use strict";
import { RING_ORDER } from "../compassRingTopology.mjs";

export const LIFE_STEPS = 1500, CALM = 500, SCORE_FROM = 500, GOAL_EVERY = 50, GUST = 0.4, MAX_TURN = 0.2, KR = 3, PREF_SEED = 4242, NR = RING_ORDER.length, CLOCK = NR + 1, GOAL = NR;
const TAU = 2 * Math.PI;
export const wrap = (x) => ((x + Math.PI) % TAU + TAU) % TAU - Math.PI;
/** A xorshift32 stream from a seed: numbers in [0, 1). */
export function stream(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(TAU * r());
export const PREF = Object.freeze((() => { const r = stream(PREF_SEED); return Array.from({ length: NR }, () => r() * TAU); })());

export class CompassEnv {
    constructor() { this.obsDim = NR + 2; this.actDim = 1; this.maxSteps = LIFE_STEPS; }
    reset(seed) {
        const r = stream(seed); this.r = r; this.marks = Array.from({ length: 2 }, () => ({ az: r() * TAU, s: 0.5 + r() }));
        this.th = 0; this.goal = 0; this.t = 0; this.goalAt = GOAL_EVERY; this.gustAt = 40 + Math.floor(r() * 40); this.ret = 0; return this._obs();
    }
    _obs() {
        const o = new Float64Array(NR + 2);
        for (let j = 0; j < NR; j++) { let v = 0; for (const m of this.marks) v += m.s * Math.exp(KR * (Math.cos(wrap(m.az - this.th) - PREF[j]) - 1)); o[j] = v; }
        o[GOAL] = this.goal; o[CLOCK] = this.t; return o;
    }
    step(action) {
        const u = Math.max(-MAX_TURN, Math.min(MAX_TURN, Number.isFinite(action[0]) ? action[0] : 0)); this.th = wrap(this.th + u);
        if (this.t >= CALM && --this.gustAt <= 0) { this.th = wrap(this.th + gauss(this.r) * GUST); this.gustAt = 40 + Math.floor(this.r() * 40); }
        const reward = this.t >= SCORE_FROM ? Math.cos(this.th - this.goal) / (LIFE_STEPS - SCORE_FROM) : 0; this.ret += reward; this.t++;
        if (--this.goalAt <= 0) { this.goal = wrap(this.r() * TAU); this.goalAt = GOAL_EVERY; }
        const done = this.t >= LIFE_STEPS;
        return { obs: this._obs(), reward, done, info: { docked: false, crashed: false, dist: 1 - this.ret } };
    }
}
export default CompassEnv;
