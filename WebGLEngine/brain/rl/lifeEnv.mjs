// WebGLEngine/brain/rl/lifeEnv.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A FLY'S LIFE: FOUR EPISODES OF THE ESCAPE TASK IN ONE WORLD, DECOY OR ORDINARY (the escape round 9, registered in brain/FLY_ESCAPE_HABITUATE_WIP.md before this file existed).
// brain/rl/escapeEnv.mjs is used as it is. A life's KIND is drawn once from its seed (kindOf, evenly); its episodes are the escape task's on the seeds life x 16 + 0..3 (episodeSeed).
//   ordinary   the episodes are EscapeEnv's own, to the bit: half the movers strikes, half passes
//   decoy      DecoyEnv: every mover is drawn as a strike -- the one draw that chooses the kind is still made, and answered "strike", so every other draw is the same, in the same order -- and
//              flies as one (straight at the fly), BUT CANNOT CATCH: one that reaches the fly is gone and the fly is not caught. From the fly's eye a decoy is a strike.
// Being caught ends an episode, not the life. A tick's reward is the episode's over EPISODES, so A LIFE'S RETURN IS THE MEAN OF ITS EPISODES' RETURNS. info.dist is 1 less the life's return so far
// and nothing is docked or crashed, so brain/rl/dockPolicy.js's trainDockES keeps the best return.
// THE OBSERVATION is EscapeEnv's but for its clock (number CLOCK), which is the tick of the LIFE over LIFE_STEPS: 0 at a life's first tick and only there. No fly of the escape rounds reads that
// number with its network; a fly that carries anything through its life (brain/rl/habituatingCircuit.mjs) starts afresh when it reads 0.
// HAND is the round's hand floor, fixed in the registration before any training: the reflex, whose drive g falls by a share alpha at the first tick of each mover the reflex fires for, recovers
// beta a tick toward 1, starts each life at 1, and flees only while g is above theta. handFly() makes one; told(kind) is the fly told the kind of life (never flees in a decoy life, the reflex in an
// ordinary one).
// Pure but for the world it writes: no I/O, no clock, no Math.random.
"use strict";
import { EscapeEnv, RULES, OBS_DIM, ACT_DIM, MAX_STEPS } from "./escapeEnv.mjs";

export const EPISODES = 4, LIFE_STEPS = EPISODES * MAX_STEPS, CLOCK = 10, KINDS = Object.freeze(["decoy", "ordinary"]);
export const HAND = Object.freeze({ alpha: 0.1, beta: 0.002, theta: 0.5 });
/** A life's kind, from its seed: evenly decoy or ordinary. */
export const kindOf = (lifeSeed) => ((Math.imul(lifeSeed >>> 0, 2654435761) >>> 0) % 2 === 0 ? "decoy" : "ordinary");
/** The seed of a life's episode e (0..EPISODES-1). */
export const episodeSeed = (lifeSeed, e) => lifeSeed * 16 + e;

/** EscapeEnv with decoys: see the header. With `decoy` false it is EscapeEnv, to the bit. */
export class DecoyEnv extends EscapeEnv {
    constructor(opts = {}) { super(opts); this.decoy = !!opts.decoy; }
    _spawn() {
        if (!this.decoy) return super._spawn();
        const r = this._r; let first = true;
        this._r = () => { if (first) { first = false; r(); return 0; } return r(); };   // the kind's draw is made, and answered "strike"
        try { return super._spawn(); } finally { this._r = r; }
    }
    step(action) {
        const m = this.mover, decoy = this.decoy && !!m;
        const out = super.step(action);
        if (!(decoy && this.caught)) return out;
        this.caught = false; const last = this.log[this.log.length - 1]; last.caught = false; last.decoy = true;   // it reached the fly, and it was a decoy: gone, and the fly lives on
        const done = this.t >= this.maxSteps; let reward = out.reward; if (done) { reward += 0.5; this.ret += 0.5; }
        return { ...out, reward, done, info: { ...out.info, caught: false, docked: this.report === "lived" && done, crashed: false, dist: 1 - this.ret } };
    }
}

/** A life of EPISODES episodes: see the header. */
export class LifeEnv {
    constructor() {
        this.obsDim = OBS_DIM; this.actDim = ACT_DIM; this.maxSteps = LIFE_STEPS; this.inner = new DecoyEnv({ report: "return" });
        this.seed = 1; this.kind = null; this.e = 0; this.t = 0; this.ret = 0; this.epRet = 0; this.rets = []; this.caught = 0;
    }
    _clock(o) { o[CLOCK] = this.t / LIFE_STEPS; return o; }
    reset(seed = 1) {
        if (!Number.isInteger(seed) || seed < 1) throw new Error(`lifeEnv.LifeEnv: a life's seed is a whole number from 1 (got ${seed})`);
        this.seed = seed; this.kind = kindOf(seed); this.inner.decoy = this.kind === "decoy"; this.e = 0; this.t = 0; this.ret = 0; this.epRet = 0; this.rets = []; this.caught = 0;
        return this._clock(this.inner.reset(episodeSeed(seed, 0)));
    }
    step(action) {
        const r = this.inner.step(action), reward = r.reward / EPISODES; this.epRet += r.reward; this.ret += reward; this.t++;
        let obs = r.obs, done = false;
        if (r.done) { if (this.inner.caught) this.caught++; this.rets.push(this.epRet); this.epRet = 0; this.e++; if (this.e >= EPISODES) done = true; else obs = this.inner.reset(episodeSeed(this.seed, this.e)); }
        return { obs: this._clock(obs), reward, done, info: { kind: this.kind, episode: this.e, rets: done ? [...this.rets] : null, caught: this.caught, docked: false, crashed: false, dist: 1 - this.ret } };
    }
}

/** The hand floor (HAND): a fresh fly, act(obs) -> [number]. */
export function handFly({ alpha, beta, theta } = HAND) {
    let g = 1, seen = false;
    return (o) => {
        if (o[CLOCK] === 0) { g = 1; seen = false; }
        if (o[0] === 0) seen = false;
        const fire = RULES.reflex(o)[0] > 0;
        if (fire && !seen) { g *= 1 - alpha; seen = true; }
        g += beta * (1 - g);
        return [fire && g > theta ? 1 : -1];
    };
}
/** The fly told the kind of its life: act(obs, env) -> [number]. */
export const told = (o, env) => (env.kind === "decoy" ? [-1] : RULES.reflex(o));
export default LifeEnv;
