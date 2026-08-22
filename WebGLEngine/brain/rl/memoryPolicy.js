// brain/rl/memoryPolicy.js -- a "thinks more deeply" policy: a recurrent controller with a GRID OF MEMORY PAGES it
// reads and writes every step, so unlike the reflex MLP (one forward pass, no state) it can carry information across
// time -- remember where a target was heading through an occlusion, integrate evidence, hold a plan. The memory is
// `slots` pages of `slotDim` values each (default a 4-page grid); each step the net reads all pages, picks an action,
// and does a gated write back to every page at once (a GRU-style update). On a GPU those pages are just storage
// buffers a compute shader binds together -- yes, one task can read/write a grid of them simultaneously.
"use strict";

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

class MemoryPolicy {
    constructor(inDim, outDim, opts = {}) {
        this.inDim = inDim; this.outDim = outDim; this.slots = opts.slots || 4; this.slotDim = opts.slotDim || 4; this.mem = this.slots * this.slotDim; this.hidden = opts.hidden || 16;
        this.LEAK = opts.leak != null ? opts.leak : 0.9; this.WGAIN = opts.wgain != null ? opts.wgain : 0.7;   // fixed leaky-integrator write
        const xDim = inDim + this.mem, rng = mulberry32(opts.seed || 1), rn = () => (rng() * 2 - 1) * 0.3;
        this.W1 = Float32Array.from({ length: this.hidden * xDim }, rn); this.b1 = new Float32Array(this.hidden);
        this.Wout = Float32Array.from({ length: outDim * this.hidden }, rn); this.bout = new Float32Array(outDim);
        this.Wc = Float32Array.from({ length: this.mem * this.hidden }, rn); this.bc = new Float32Array(this.mem);
        this.memory = new Float32Array(this.mem); this.xDim = xDim;
        this._all = [this.W1, this.b1, this.Wout, this.bout, this.Wc, this.bc];
    }
    reset() { this.memory.fill(0); }                     // clear the pages at the start of an episode
    act(input) {
        const x = new Float32Array(this.xDim); x.set(input, 0); x.set(this.memory, this.inDim);   // READ all pages
        const h = new Float32Array(this.hidden);
        for (let o = 0; o < this.hidden; o++) { let a = this.b1[o]; const base = o * this.xDim; for (let i = 0; i < this.xDim; i++) a += this.W1[base + i] * x[i]; h[o] = Math.tanh(a); }
        const out = new Float32Array(this.outDim);
        for (let o = 0; o < this.outDim; o++) { let a = this.bout[o]; const base = o * this.hidden; for (let i = 0; i < this.hidden; i++) a += this.Wout[base + i] * h[i]; out[o] = Math.tanh(a); }
        for (let m = 0; m < this.mem; m++) { let c = this.bc[m]; const base = m * this.hidden; for (let i = 0; i < this.hidden; i++) c += this.Wc[base + i] * h[i]; const cont = Math.tanh(c); this.memory[m] = Math.tanh(this.LEAK * this.memory[m] + this.WGAIN * cont); }   // leaky WRITE to every page
        return out;
    }
    getParams() { let n = 0; for (const a of this._all) n += a.length; const out = new Float32Array(n); let o = 0; for (const a of this._all) { out.set(a, o); o += a.length; } return out; }
    setParams(p) { let o = 0; for (const a of this._all) { a.set(p.subarray(o, o + a.length)); o += a.length; } }
}

// a partial-observability memory test: a cue is shown briefly, then BLANKED; at the end the policy must recall it.
// A reflex policy sees 0 at recall time and can only guess the average; a memory policy stored the cue.
class RememberEnv {
    constructor(opts = {}) { this.maxSteps = opts.maxSteps || 12; this.cueLen = opts.cueLen || 2; this._rng = mulberry32(opts.seed || 1); }
    reset(seed) { if (seed != null) this._rng = mulberry32(seed); this.cue = this._rng() * 2 - 1; this.step_ = 0; return [this.step_ < this.cueLen ? this.cue : 0]; }
    step(action) { this.step_++; const obs = [this.step_ < this.cueLen ? this.cue : 0]; const done = this.step_ >= this.maxSteps; const err = done ? Math.abs(action[0] - this.cue) : 0; return { obs, recallErr: err, done, cue: this.cue }; }
}

// generic ES on any policy exposing getParams/setParams; rollout(policy) returns a scalar to maximize
function esTrain(policy, rollout, opts = {}) {
    let theta = policy.getParams(); const n = theta.length, rng = mulberry32(opts.seed || 1), scratch = new Float32Array(n);
    const iters = opts.iters || 40, pop = opts.pop || 20, sigma = opts.sigma || 0.15, lr = opts.lr || 0.12;
    let best = { p: theta.slice(), r: -Infinity };
    for (let it = 0; it < iters; it++) {
        const half = pop >> 1, noises = [], rets = [];
        for (let i = 0; i < half; i++) { const eps = new Float32Array(n); for (let j = 0; j < n; j++) eps[j] = gauss(rng); noises.push(eps);
            for (const sgn of [1, -1]) { for (let j = 0; j < n; j++) scratch[j] = theta[j] + sgn * sigma * eps[j]; policy.setParams(scratch); rets.push({ i, sgn, r: rollout(policy) }); } }
        const mean = rets.reduce((s, x) => s + x.r, 0) / rets.length, sd = Math.sqrt(rets.reduce((s, x) => s + (x.r - mean) ** 2, 0) / rets.length) || 1;
        const grad = new Float32Array(n); for (const x of rets) { const adv = (x.r - mean) / sd, eps = noises[x.i], c = adv * x.sgn; for (let j = 0; j < n; j++) grad[j] += c * eps[j]; }
        const scale = lr / (rets.length * sigma); for (let j = 0; j < n; j++) theta[j] += scale * grad[j];
        policy.setParams(theta); const r = rollout(policy); if (r > best.r) best = { p: theta.slice(), r };
    }
    policy.setParams(best.p); return best.r;
}

export { MemoryPolicy, RememberEnv, esTrain };
if (typeof module !== "undefined" && module.exports) module.exports = { MemoryPolicy, RememberEnv, esTrain };
