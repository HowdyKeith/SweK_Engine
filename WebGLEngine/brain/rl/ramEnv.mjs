// WebGLEngine/brain/rl/ramEnv.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A 6-DOF CRAFT WITH A COLLISION REFLEX OVER ITS PILOT (registered in brain/FLY_RAM_REFLEX_WIP.md before this file existed). The fight is brain/pilot6dofPolicy.mjs's duel(), used as it is: the craft
// is handed to it as a pilot function, so nothing of the duel is restated here. Every tick the reflex is given two numbers of the foe -- the escape rounds' two, at brain/rl/escapeEnv.mjs's scales --
//   OBS (3)    1 | the foe's ANGULAR SIZE (2 atan(R / range), x 2; R the hull's bounding radius) | ITS LOOMING RATE (the size's change a tick, x 20), exact, from the range and the closing speed
// and when its one output is above 0 the craft BREAKS this tick; otherwise its pilot flies. The break is written by hand and the reflex only says when:
//   breakAway  turn the nose (the PD autopilot's attitude law) to the direction straight away from the line the foe is coming down, thrust when facing it, hold fire; dead on, the direction is world +y
//   REWARD     the duel's score less RAM_PRICE a hit point lost to a ram. RAM_PRICE is REWARD.hit / SHOT_DAMAGE: what a hit point taken off the foe by a shot earns.
// FOR brain/rl/dockPolicy.js's trainDockES AN EPISODE IS ONE STEP: RamEnv.step() is handed THE FLY (anything with act(obs) -> [number]) and flies the whole duel with it. WholeFly is the trainer's
// policy: its weights are the network's own and its act() answers the network itself. The output layer starts at zero (the last `tail` weights), so an untrained craft is its pilot to the bit.
// info.dist is minus the reward and nothing is docked or crashed, so the trainer keeps the weights of its best battery reward.
// RULES are three reflexes written by hand: never (the pilot alone), hand (break when the time to contact is under HAND_SECONDS) and always (break whenever the foe is closing).
// Pure: no I/O, no clock, no Math.random.
"use strict";
import * as P6 from "../pilot6dofPolicy.mjs";
import * as AP from "../autopilot6dof.mjs";

export const OBS_DIM = 3, ACT_DIM = 1, SIZE = 1, LOOM = 2, SIZE_GAIN = 2, LOOM_GAIN = 20, TICK = 1 / 30, HAND_SECONDS = 3;
export const HULL_RADIUS = Math.hypot(P6.HALF[0], P6.HALF[1], P6.HALF[2]);
export const RAM_PRICE = P6.REWARD.hit / P6.SHOT_DAMAGE;
export const DUEL = Object.freeze({ collisions: true, scenario: "joust", ramPenalty: RAM_PRICE });
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** What an eye on the craft sees of the foe: { range, closing (m/s, positive when the gap shrinks), seconds (to contact of the centres; Infinity when not closing), r, v, obs }. */
export function looming(body, target) {
    const r = sub(target.pos, body.pos), range = Math.hypot(r[0], r[1], r[2]), v = sub(target.vel || [0, 0, 0], body.vel), closing = -dot(v, r) / (range || 1);
    const size = 2 * Math.atan(HULL_RADIUS / range), rate = 2 * HULL_RADIUS * closing / (range * range + HULL_RADIUS * HULL_RADIUS);   // d(size)/dt, radians a second
    return { range, closing, seconds: closing > 0 ? range / closing : Infinity, r, v, obs: [1, size * SIZE_GAIN, rate * TICK * LOOM_GAIN] };
}

/** The break, with autopilot6dof.decide()'s contract: see the header. */
export function breakAway(body, target, opts = {}) {
    const { r, v } = looming(body, target), vv = dot(v, v), along = vv > 0 ? dot(r, v) / vv : 0, m = [r[0] - along * v[0], r[1] - along * v[1], r[2] - along * v[2]];   // the foe's offset from the line it is coming down
    let n = Math.hypot(m[0], m[1], m[2]), flee = n < 1e-6 ? [0, 1, 0] : [-m[0] / n, -m[1] / n, -m[2] / n];
    const far = [body.pos[0] + flee[0] * 1000, body.pos[1] + flee[1] * 1000, body.pos[2] + flee[2] * 1000];
    return { ...AP.decide(body, { pos: far, vel: [0, 0, 0] }, { thrustForce: opts.thrustForce, standoff: 0 }), firing: false };
}

/** The craft: `under` (a pilot function) with `fly`'s reflex over it. `count`, if given, has its ticks and breaks counted up. fly.act is handed the observation and looming()'s whole answer. */
export function craft(under, fly, count = null) {
    if (typeof under !== "function" || !fly || typeof fly.act !== "function") throw new Error("ramEnv.craft: a pilot function and a fly with act(obs)");
    return (body, target, opts) => {
        const see = looming(body, target), a = fly.act(see.obs, see), brk = a[0] > 0;
        if (count) { count.ticks++; if (brk) count.breaks++; }
        return brk ? breakAway(body, target, opts) : under(body, target, opts);
    };
}

export const RULES = Object.freeze({
    never: Object.freeze({ act: () => [-1] }),
    hand: Object.freeze({ act: (o, see) => [see.seconds < HAND_SECONDS ? 1 : -1] }),
    always: Object.freeze({ act: (o, see) => [see.closing > 0 ? 1 : -1] }),
});

/** One fight: { reward, fight (the duel's score with no ram priced), ramHp, rams, win, loss, ticks, breaks, fingerprint }. */
export function fight(under, fly, seed) {
    const count = { ticks: 0, breaks: 0 }, r = P6.duel(craft(under, fly, count), "autopilot", { seed, ...DUEL });
    return { reward: r.score, fight: r.score + r.ramHp * RAM_PRICE, ramHp: r.ramHp, rams: r.rams, win: r.win, loss: r.winB, ticks: r.ticks, breaks: count.breaks, fingerprint: r.fingerprint };
}

export class RamEnv {
    constructor({ under } = {}) {
        if (typeof under !== "function") throw new Error("ramEnv.RamEnv: `under` is the pilot the reflex is over");
        this.under = under; this.obsDim = OBS_DIM; this.actDim = ACT_DIM; this.maxSteps = 1; this.seed = 1; this.last = null;
    }
    reset(seed = 1) { this.seed = seed; this.last = null; return new Float32Array(OBS_DIM); }
    step(fly) {
        const r = fight(this.under, fly, this.seed); this.last = r;
        return { obs: new Float32Array(OBS_DIM), reward: r.reward, done: true, info: { ...r, docked: false, crashed: false, dist: -r.reward } };
    }
}

/** The trainer's policy: see the header. */
export class WholeFly {
    constructor(inner, { tail } = {}) {
        if (!inner || typeof inner.act !== "function" || typeof inner.getParams !== "function" || typeof inner.setParams !== "function") throw new Error("ramEnv.WholeFly: the network has act, getParams and setParams");
        const p = inner.getParams();
        if (!Number.isInteger(tail) || tail < 1 || tail > p.length) throw new Error(`ramEnv.WholeFly: the output layer is 1 to ${p.length} weights (got ${tail})`);
        this.inner = inner; p.fill(0, p.length - tail); inner.setParams(p);
    }
    paramCount() { return this.inner.getParams().length; }
    getParams() { return this.inner.getParams(); }
    setParams(flat) { this.inner.setParams(flat); return this; }
    act() { return this.inner; }
}
export default RamEnv;
