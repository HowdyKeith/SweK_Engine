// brain/rl/rocketPolicy.js -- v2216 -- CONTINUOUS-CONTROL policy head for Rocket League.
//
// This is a DIFFERENT policy class from the rest of the brain. The kaiju/dungeon/EV heads
// (mlp.js + the attack/aggro/civdef trainers) are small SIGMOID classifiers -- "shoot or
// not", "which target" -- trained by contrastive/imitation updates on discrete decisions.
// Driving a car in Rocket League is a CONTINUOUS control problem: at every tick you output
// eight controller axes, five of them real-valued. So this is its own self-contained net,
// deliberately NOT entangled with the WebGPU BatchedMLP (which has no tanh head and no
// place for a policy-gradient/ES update). It is pure CPU JS on purpose: the spike has to
// run headless on any box (and fan out across the fleet), exactly like the CPU field solver.
//
// OBSERVATION (20 floats, all pre-normalised to ~[-1,1] by the env):
//   0-5   ball  x y z  vx vy vz
//   6-11  car   x y z  vx vy vz
//   12-13 car heading  cos(yaw) sin(yaw)
//   14    boost amount (0..1 -> -1..1)
//   15-17 ball-minus-car  dx dy dz
//   18-19 target-goal-minus-ball  dx dy
// The RocketSim backend MUST emit this same layout (see rocketsim_bridge.py) so the stub
// and the real sim are interchangeable to the policy -- the same drop-in discipline the
// field solvers use.
//
// ACTION (8 floats). RLGym's controller order, matching rlgym_sim.utils.gamestates:
//   0 throttle  1 steer  2 pitch  3 yaw  4 roll   (continuous, [-1,1])
//   5 jump      6 boost   7 handbrake            (binary; env treats > 0 as pressed)
// The net emits 8 tanh values; the env binarises the last three. Keeping them in the tanh
// output (rather than a separate sigmoid head) means one flat parameter vector, which is
// all Evolution Strategies needs to perturb.

export const OBS_DIM = 20;
export const ACT_DIM = 8;

// A tiny seeded PRNG (mulberry32) so an init is reproducible -- the same determinism the
// dungeon/maze pages rely on for repeatable screenshots.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function tanh(x) {
    // guard against overflow in exp for large |x|
    if (x > 20) return 1; if (x < -20) return -1;
    const e = Math.exp(2 * x);
    return (e - 1) / (e + 1);
}

export class RocketPolicy {
    // layers: hidden sizes between OBS_DIM and ACT_DIM. Default two 32-wide tanh layers.
    constructor(opts = {}) {
        this.inDim = OBS_DIM;
        this.outDim = ACT_DIM;
        this.hidden = opts.hidden || [32, 32];
        this.sizes = [this.inDim, ...this.hidden, this.outDim];

        // Dense layers as {W: Float32Array(nOut*nIn), b: Float32Array(nOut)}, flattened into
        // one contiguous parameter vector so ES can perturb the whole policy in one shot.
        this.layers = [];
        this._paramCount = 0;
        for (let i = 0; i < this.sizes.length - 1; i++) {
            const nIn = this.sizes[i], nOut = this.sizes[i + 1];
            this.layers.push({ nIn, nOut, W: new Float32Array(nOut * nIn), b: new Float32Array(nOut) });
            this._paramCount += nOut * nIn + nOut;
        }
        // scratch buffers (no per-tick allocation, same discipline as the solvers)
        this._buf = this.sizes.map(n => new Float32Array(n));

        this.init(opts.seed ?? 1234, opts.scale ?? null);
    }

    paramCount() { return this._paramCount; }

    // Xavier-ish init. Small weights so the untrained policy is gentle, not spastic.
    init(seed = 1234, scale = null) {
        const rnd = mulberry32(seed);
        for (const L of this.layers) {
            const s = scale != null ? scale : Math.sqrt(1 / L.nIn);
            for (let i = 0; i < L.W.length; i++) L.W[i] = (rnd() * 2 - 1) * s;
            L.b.fill(0);
        }
        return this;
    }

    // Flatten every weight+bias into one Float32Array (for ES / save).
    getParams() {
        const out = new Float32Array(this._paramCount);
        let o = 0;
        for (const L of this.layers) { out.set(L.W, o); o += L.W.length; out.set(L.b, o); o += L.b.length; }
        return out;
    }

    // Load a flat parameter vector back into the layers. Length must match paramCount().
    setParams(flat) {
        if (flat.length !== this._paramCount)
            throw new Error(`param length ${flat.length} != expected ${this._paramCount}`);
        let o = 0;
        for (const L of this.layers) {
            L.W.set(flat.subarray(o, o + L.W.length)); o += L.W.length;
            L.b.set(flat.subarray(o, o + L.b.length)); o += L.b.length;
        }
        return this;
    }

    // Forward pass: obs (Float32Array/Array length OBS_DIM) -> action Float32Array length
    // ACT_DIM, every component in [-1,1]. Hidden layers tanh; output tanh. Deterministic.
    act(obs) {
        this._buf[0].set(obs);
        for (let li = 0; li < this.layers.length; li++) {
            const L = this.layers[li];
            const src = this._buf[li], dst = this._buf[li + 1];
            for (let o = 0; o < L.nOut; o++) {
                let acc = L.b[o];
                const base = o * L.nIn;
                for (let i = 0; i < L.nIn; i++) acc += L.W[base + i] * src[i];
                dst[o] = tanh(acc);
            }
        }
        // return a copy so callers can hold onto it across ticks
        return Float32Array.from(this._buf[this._buf.length - 1]);
    }

    // Serialise to a plain JSON-able object (same spirit as learn.js weight files).
    toJSON() {
        return { kind: "rocketPolicy", sizes: this.sizes, params: Array.from(this.getParams()) };
    }
    static fromJSON(j) {
        if (!j || j.kind !== "rocketPolicy") throw new Error("not a rocketPolicy weights object");
        const hidden = j.sizes.slice(1, -1);
        const p = new RocketPolicy({ hidden });
        p.setParams(Float32Array.from(j.params));
        return p;
    }
}
