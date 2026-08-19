// brain/rl/idleTrainer.js -- train the GPU Brain in IDLE time. The evolution-strategy trainer is refactored into a
// STEPPABLE object: createTrainer(...).step(k) runs k ES iterations and returns, keeping its own theta + elitist
// best, so training can be spread across idle slices instead of one blocking call. runIdle() drives it from
// requestIdleCallback in the browser (setTimeout fallback / Node), so the brain quietly improves whenever nothing
// else needs the CPU. Works for ANY task -- pass an envFactory (dock, hunt, herd, ...), so idle time on one machine
// keeps sharpening whatever policy you point it at.
"use strict";

import { FlightPolicy, evaluate } from "./dockPolicy.js";

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(rng) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

function createTrainer(opts = {}) {
    const mk = opts.envFactory || null, obsDim = opts.obsDim || (mk ? mk({}).obsDim : 5), hidden = opts.hidden || [16, 16];
    const evOpts = { envFactory: mk, obsDim, hidden };
    const base = new FlightPolicy({ hidden, seed: opts.seed || 3, obsDim });
    let theta = base.getParams(); const n = theta.length;
    const rng = mulberry32(opts.seed || 3);
    const pop = opts.pop || 20, sigma = opts.sigma || 0.12, lr = opts.lr || 0.08, trainEps = opts.trainEps || 8;
    const scratch = new Float32Array(n);
    let best = { params: theta.slice(), score: -Infinity, ev: null }, iters = 0;
    // score a param vector the same way step() does, so best() is comparable across seed + fine-tuning
    function scoreOf(p) { const ev = evaluate(p, { ...evOpts, episodes: 16 }); return { ev, score: ev.dockRate * 1000 - ev.avgDist - (ev.avgCrashes || 0) * 200 }; }
    function reseedBest() { const s = scoreOf(theta); best = { params: theta.slice(), score: s.score, ev: s.ev }; }
    reseedBest();   // count the STARTING policy (e.g. a transferred warm start) so fine-tuning never reports worse than it began

    function stepOnce() {
        const half = pop >> 1, noises = [], rets = [];
        for (let i = 0; i < half; i++) { const eps = new Float32Array(n); for (let j = 0; j < n; j++) eps[j] = gauss(rng); noises.push(eps);
            for (const sgn of [1, -1]) { for (let j = 0; j < n; j++) scratch[j] = theta[j] + sgn * sigma * eps[j]; rets.push({ i, sgn, r: evaluate(scratch, { ...evOpts, episodes: trainEps }).avgReturn }); } }
        const mean = rets.reduce((s, x) => s + x.r, 0) / rets.length, sd = Math.sqrt(rets.reduce((s, x) => s + (x.r - mean) ** 2, 0) / rets.length) || 1;
        const grad = new Float32Array(n);
        for (const x of rets) { const adv = (x.r - mean) / sd, eps = noises[x.i], c = adv * x.sgn; for (let j = 0; j < n; j++) grad[j] += c * eps[j]; }
        const scale = lr / (rets.length * sigma); for (let j = 0; j < n; j++) theta[j] += scale * grad[j];
        const s = scoreOf(theta);
        if (s.score > best.score) best = { params: theta.slice(), score: s.score, ev: s.ev };
        iters++;
    }
    return {
        step(k = 1) { for (let i = 0; i < k; i++) stepOnce(); return best.ev; },
        best: () => best.params.slice(),
        bestEval: () => best.ev,
        progress: () => ({ iters, ev: best.ev }),
        setParams: (p) => { theta = Float32Array.from(p); reseedBest(); },   // seed from a prior/transferred policy + count it
    };
}

// drive a trainer from idle time. Returns a stop() function. Browser: requestIdleCallback; else a setTimeout shim.
function runIdle(trainer, opts = {}) {
    const maxIters = opts.maxIters || 200, itersPerSlice = opts.itersPerSlice || 1, onProgress = opts.onProgress;
    const ric = (typeof requestIdleCallback !== "undefined") ? requestIdleCallback : (f) => setTimeout(() => f({ timeRemaining: () => 12 }), 40);
    let stop = false;
    function loop(deadline) {
        let did = 0;
        while ((!deadline || deadline.timeRemaining() > 4) && did < itersPerSlice && trainer.progress().iters < maxIters) { trainer.step(1); did++; }
        if (onProgress) onProgress(trainer.progress());
        if (!stop && trainer.progress().iters < maxIters) ric(loop);
    }
    ric(loop);
    return () => { stop = true; };
}

export { createTrainer, runIdle };
if (typeof module !== "undefined" && module.exports) module.exports = { createTrainer, runIdle };
