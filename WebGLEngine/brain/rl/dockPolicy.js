// brain/rl/dockPolicy.js -- the GPU Brain's thruster-control head for docking, and an evolution-strategy trainer.
// The policy is the same flattened-MLP + tanh architecture as RocketPolicy (one contiguous parameter vector so ES
// can perturb the whole thing in one shot), sized for the DockEnv (5 obs -> 2 actions). Because it's a plain MLP
// with getParams/setParams, it drops straight onto the GPU Brain's BatchedMLP (brain/mlp.js) for batched rollouts
// -- evaluate a whole population of policies, or a whole fleet of ships, in one GPU dispatch.
//
// Trainer: OpenAI-style natural evolution strategy (antithetic sampling). No gradients through the physics needed:
// perturb the params, roll out episodes, and move along the reward-weighted average of the perturbations. This is
// the same "reward tells you which way to move the whole policy" idea as the linear contrastive learner, lifted to
// a nonlinear head + a continuous-control task.
"use strict";

import { DockEnv, OBS_DIM, ACT_DIM } from "./dockEnv.js";

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(rng) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function tanh(x) { if (x > 20) return 1; if (x < -20) return -1; const e = Math.exp(2 * x); return (e - 1) / (e + 1); }

class FlightPolicy {
    constructor(opts = {}) {
        this.inDim = opts.obsDim || OBS_DIM; this.outDim = opts.actDim || ACT_DIM; this.hidden = opts.hidden || [16, 16];
        this.sizes = [this.inDim, ...this.hidden, this.outDim];
        this.layers = []; this._paramCount = 0;
        for (let i = 0; i < this.sizes.length - 1; i++) { const nIn = this.sizes[i], nOut = this.sizes[i + 1]; this.layers.push({ nIn, nOut, W: new Float32Array(nOut * nIn), b: new Float32Array(nOut) }); this._paramCount += nOut * nIn + nOut; }
        this._buf = this.sizes.map(n => new Float32Array(n));
        this.init(opts.seed ?? 1234);
    }
    paramCount() { return this._paramCount; }
    init(seed = 1234) { const r = mulberry32(seed); for (const L of this.layers) { const s = Math.sqrt(1 / L.nIn); for (let i = 0; i < L.W.length; i++) L.W[i] = (r() * 2 - 1) * s; L.b.fill(0); } return this; }
    getParams() { const out = new Float32Array(this._paramCount); let o = 0; for (const L of this.layers) { out.set(L.W, o); o += L.W.length; out.set(L.b, o); o += L.b.length; } return out; }
    setParams(flat) { let o = 0; for (const L of this.layers) { L.W.set(flat.subarray(o, o + L.W.length)); o += L.W.length; L.b.set(flat.subarray(o, o + L.b.length)); o += L.b.length; } return this; }
    act(obs) { this._buf[0].set(obs); for (let li = 0; li < this.layers.length; li++) { const L = this.layers[li], src = this._buf[li], dst = this._buf[li + 1]; for (let o = 0; o < L.nOut; o++) { let acc = L.b[o]; const base = o * L.nIn; for (let i = 0; i < L.nIn; i++) acc += L.W[base + i] * src[i]; dst[o] = tanh(acc); } } return this._buf[this._buf.length - 1]; }
    toJSON() { return { kind: "flightPolicy", sizes: this.sizes, params: Array.from(this.getParams()) }; }
    static fromJSON(j) { const p = new FlightPolicy({ hidden: j.sizes.slice(1, -1) }); p.setParams(Float32Array.from(j.params)); return p; }
}

// roll out one episode, return total reward + whether it docked. Fixed episode seeds => comparable evaluations.
function rollout(policy, env, epSeed) {
    let obs = env.reset(epSeed), total = 0, docked = false, info = null, crashes = 0;
    for (let t = 0; t < env.maxSteps; t++) { const a = policy.act(obs); const r = env.step(a); total += r.reward; obs = r.obs; info = r.info; if (r.info && r.info.crashed) crashes++; if (r.done) { docked = r.info.docked; break; } }
    return { total, docked, dist: info ? info.dist : Infinity, speed: info ? info.speed : Infinity, crashes };
}

// evaluate a param vector over a fixed battery of episodes (same seeds every time => fair comparison)
function evaluate(flat, opts = {}) {
    const mk = opts.envFactory || ((o) => new DockEnv(o));
    const env = mk({ maxSteps: opts.maxSteps || 200 });
    // *** THE ACTION WIDTH COMES FROM THE ENV TOO, AND ITS ABSENCE WAS INVISIBLE. *** obsDim was read from the
    // env here and actDim was not, so a policy always emitted ACT_DIM (2) numbers whatever the env asked for.
    // Every env in this tree happened to want 2, so nothing was wrong until v4220's painter asked for 5 --
    // and then the last three action components were simply `undefined`, clamped to 0 by the env, so the
    // policy could not express a width, a height or an angle AT ALL. It trained, it improved, and it was
    // steering three controls it did not have. Same shape as the maxSteps omission fixed at v4218.
    const p = new FlightPolicy({ hidden: opts.hidden || [16, 16], obsDim: opts.obsDim || env.obsDim,
                                 actDim: opts.actDim || env.actDim });
    p.setParams(flat);
    const K = opts.episodes || 24; let ret = 0, docks = 0, dsum = 0, crashes = 0;
    for (let k = 0; k < K; k++) { const r = rollout(p, env, 5000 + k * 17); ret += r.total; if (r.docked) docks++; dsum += r.dist; crashes += r.crashes || 0; }
    return { avgReturn: ret / K, dockRate: docks / K, avgDist: dsum / K, avgCrashes: crashes / K };
}

// natural ES with antithetic sampling. Deterministic given seed. Returns the trained flat params + a history.
function trainDockES(opts = {}) {
    const mk = opts.envFactory || ((o) => new DockEnv(o));
    const probe = mk({});
    const obsDim = opts.obsDim || probe.obsDim;
    const actDim = opts.actDim || probe.actDim;                      // see the note in evaluate()
    const base = new FlightPolicy({ hidden: opts.hidden || [16, 16], seed: opts.seed || 3, obsDim, actDim });
    let theta = base.getParams(); const n = theta.length;
    const iters = opts.iters || 60, pop = opts.pop || 24, sigma = opts.sigma || 0.12, lr = opts.lr || 0.06;
    const rng = mulberry32(opts.seed || 3); const history = [];
    const scratch = new Float32Array(n);
    let best = { params: theta.slice(), score: -Infinity, ev: null };   // elitism: keep the best-evaluated policy
    // *** THE EPISODE BUDGET HAS TO REACH evaluate(), OR THE TRAINER OPTIMISES A DIFFERENT TASK. *** evOpts
    // omitted maxSteps, so every evaluation inside this loop fell back to evaluate()'s default of 200 while
    // the caller believed it had asked for more. MEASURED on the v4218 driving env, whose episodes need
    // 157-267 steps to reach a goal and stop: training ran at 200 (no episode could finish) and the reported
    // result at 400, and the trainer's own best.ev disagreed with a re-evaluation of the very same params --
    // dockRate 0.21 against 1.0. No caller in this tree passes maxSteps, so this leaves them all at 200.
    const evOpts = { hidden: opts.hidden || [16, 16], envFactory: mk, obsDim, actDim, maxSteps: opts.maxSteps };
    for (let it = 0; it < iters; it++) {
        // antithetic pairs: for each of pop/2 noise vectors, evaluate +noise and -noise
        const half = pop >> 1; const noises = [], rets = [];
        for (let i = 0; i < half; i++) { const eps = new Float32Array(n); for (let j = 0; j < n; j++) eps[j] = gauss(rng); noises.push(eps);
            for (const sgn of [1, -1]) { for (let j = 0; j < n; j++) scratch[j] = theta[j] + sgn * sigma * eps[j]; rets.push({ i, sgn, r: evaluate(scratch, { ...evOpts, episodes: opts.trainEps || 10 }).avgReturn }); }
        }
        // normalize returns to advantages
        const mean = rets.reduce((s, x) => s + x.r, 0) / rets.length; let sd = Math.sqrt(rets.reduce((s, x) => s + (x.r - mean) ** 2, 0) / rets.length) || 1;
        const grad = new Float32Array(n);
        for (const x of rets) { const adv = (x.r - mean) / sd; const eps = noises[x.i]; const c = adv * x.sgn; for (let j = 0; j < n; j++) grad[j] += c * eps[j]; }
        const scale = lr / (rets.length * sigma); for (let j = 0; j < n; j++) theta[j] += scale * grad[j];
        // full eval each iter, on a fixed battery, and keep the best (ES walks can drift off a good spot)
        const ev = evaluate(theta, { ...evOpts, episodes: 24 });
        const score = ev.dockRate * 1000 - ev.avgDist - (ev.avgCrashes || 0) * 200;   // docks, then closeness, penalize crashes
        if (score > best.score) best = { params: theta.slice(), score, ev };
        // v3969 -- AN OPTIONAL PER-ITERATION OBSERVER, AND IT IS OPTIONAL SO THAT NOTHING CHANGES WITHOUT ONE.
        //
        // The gates that actually train every ship round (dock, dock-hazard) call THIS trainer, not the
        // createTrainer/watchdog pair -- so wrapping the watchdog alone left them contributing nothing to the
        // lesson corpus. `history` is sampled only ~6 times per run, which is too coarse to see a plateau, and
        // the loop had no other way out. onIter is the smallest opening that fixes it: called AFTER best is
        // updated, given read-only numbers, and its return value is ignored. With no hook this line is a
        // branch that is never taken, and the gate verdicts are byte-identical -- asserted, not assumed.
        if (opts.onIter) { try { opts.onIter({ it, score, ev, bestScore: best.score }); } catch { /* an observer must never take the run down */ } }
        if (it % Math.max(1, (iters / 6) | 0) === 0 || it === iters - 1) history.push({ it, ...ev });
    }
    return { params: best.params, history, best: best.ev };
}

export { FlightPolicy, DockEnv, rollout, evaluate, trainDockES };
if (typeof module !== "undefined" && module.exports) module.exports = { FlightPolicy, DockEnv, rollout, evaluate, trainDockES };
