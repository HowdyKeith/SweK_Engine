// FILE: engine/flowMatching.js
// VERSION: v1 — round 344
//
// Flow Matching is the math behind TRELLIS-2, Stable-Diffusion-3, and
// most current image/voxel generators. Conceptually:
//
//   - x_0 ~ N(0, I)             pure noise tensor
//   - x_1 ~ target distribution  what we want to generate
//   - The Optimal Transport path between them is a straight line:
//       x_t = (1 - t) · x_0 + t · x_1
//   - The "velocity field" v(x, t) = x_1 - x_0  is what a trained
//     network predicts at each step. Given v, the sampler is just
//     Euler integration of dx/dt = v(x, t).
//
// What we ship here:
//   1. A pure-JS sampler with both Euler and Midpoint integrators.
//   2. Procedural target generators (sphere, torus, spiral, random).
//   3. A "ground-truth" velocity oracle that uses v = x_1 - x_0 —
//      no trained network needed for the demo.
//
// In production you'd swap the oracle for an NRC-style MLP that
// predicts v(x, t) from x_t alone. The integration loop stays the same.

/** Pure-JS xorshift32 RNG so seeds are deterministic across runs. */
function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17; s >>>= 0;
        s ^= s << 5;  s >>>= 0;
        return s / 0xffffffff;
    };
}
function randn(rng) {
    // Box-Muller — one Gaussian per two uniforms
    const u1 = Math.max(1e-9, rng()), u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// =========================================================================
// Procedural target fields. Each returns a Float32Array of length N³ × 4
// (RGBA per voxel), with values in [0, 1].
// =========================================================================

/** Solid sphere with sinusoidal RGB shading. */
export function targetSphere(N, opts = {}) {
    const out = new Float32Array(N * N * N * 4);
    const cx = (N - 1) / 2, cy = (N - 1) / 2, cz = (N - 1) / 2;
    const r2 = ((N - 1) / 2) * 0.6;
    const r2sq = r2 * r2;
    for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
            for (let z = 0; z < N; z++) {
                const idx = ((x * N + y) * N + z) * 4;
                const dx = x - cx, dy = y - cy, dz = z - cz;
                const distSq = dx*dx + dy*dy + dz*dz;
                const inside = distSq < r2sq;
                const u = x / (N - 1), v = y / (N - 1), w = z / (N - 1);
                out[idx + 0] = inside ? 0.5 + 0.5 * Math.sin(2 * Math.PI * u)         : 0;
                out[idx + 1] = inside ? 0.5 + 0.5 * Math.cos(2 * Math.PI * v)         : 0;
                out[idx + 2] = inside ? 0.5 + 0.5 * Math.sin(2 * Math.PI * w * 2)     : 0;
                out[idx + 3] = inside ? 1 : 0;   // occupancy
            }
        }
    }
    return out;
}

/** Axis-aligned torus. */
export function targetTorus(N, opts = {}) {
    const out = new Float32Array(N * N * N * 4);
    const cx = (N - 1) / 2, cy = (N - 1) / 2, cz = (N - 1) / 2;
    const R = (N - 1) * 0.30;   // major radius
    const r = (N - 1) * 0.12;   // minor radius
    for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
            for (let z = 0; z < N; z++) {
                const idx = ((x * N + y) * N + z) * 4;
                const dx = x - cx, dz = z - cz;
                const horiz = Math.sqrt(dx * dx + dz * dz);
                const dy = y - cy;
                const tubeDist = Math.sqrt((horiz - R) * (horiz - R) + dy * dy);
                const inside = tubeDist < r;
                const ang = Math.atan2(dz, dx);
                out[idx + 0] = inside ? 0.5 + 0.5 * Math.cos(ang)               : 0;
                out[idx + 1] = inside ? 0.5 + 0.5 * Math.sin(ang)               : 0;
                out[idx + 2] = inside ? 0.5 + 0.5 * (dy / r)                    : 0;
                out[idx + 3] = inside ? 1 : 0;
            }
        }
    }
    return out;
}

/** Spiral arm — a swept circular column following a helix. */
export function targetSpiral(N, opts = {}) {
    const out = new Float32Array(N * N * N * 4);
    const turns = opts.turns ?? 2.5;
    const radius = (N - 1) * 0.32;
    const cx = (N - 1) / 2, cz = (N - 1) / 2;
    const tubeR = (N - 1) * 0.08;
    for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
            for (let z = 0; z < N; z++) {
                const idx = ((x * N + y) * N + z) * 4;
                const t = y / (N - 1);
                const ang = t * turns * 2 * Math.PI;
                const ax = cx + radius * Math.cos(ang);
                const az = cz + radius * Math.sin(ang);
                const dx = x - ax, dz = z - az;
                const dist = Math.sqrt(dx * dx + dz * dz);
                const inside = dist < tubeR;
                out[idx + 0] = inside ? t                          : 0;
                out[idx + 1] = inside ? 0.5 + 0.5 * Math.cos(ang)  : 0;
                out[idx + 2] = inside ? 0.5 + 0.5 * Math.sin(ang)  : 0;
                out[idx + 3] = inside ? 1 : 0;
            }
        }
    }
    return out;
}

/** Random sparse — for stress-testing the integrator. */
export function targetRandom(N, opts = {}) {
    const seed = opts.seed ?? 1337;
    const density = opts.density ?? 0.15;
    const rng = makeRng(seed);
    const out = new Float32Array(N * N * N * 4);
    for (let i = 0; i < N * N * N; i++) {
        const idx = i * 4;
        const fill = rng() < density;
        if (fill) {
            out[idx + 0] = rng();
            out[idx + 1] = rng();
            out[idx + 2] = rng();
            out[idx + 3] = 1;
        }
    }
    return out;
}

export const TARGETS = {
    sphere:  targetSphere,
    torus:   targetTorus,
    spiral:  targetSpiral,
    random:  targetRandom,
};

// =========================================================================
// The sampler itself.
// =========================================================================

export class FlowMatchingSampler {
    /**
     * @param {object} opts
     * @param {number} opts.dim       — N (cube size)
     * @param {number} opts.steps     — total integration steps (16-24 typical)
     * @param {string} opts.target    — "sphere" | "torus" | "spiral" | "random"
     * @param {string} opts.integrator— "euler" | "midpoint"
     * @param {number} opts.seed      — RNG seed for the noise tensor
     * @param {object} opts.targetOpts— passed to the target generator
     */
    constructor(opts = {}) {
        this.dim    = opts.dim ?? 24;
        this.steps  = opts.steps ?? 16;
        this.integrator = opts.integrator ?? "euler";
        this.seed   = opts.seed ?? 7;
        this.targetName = opts.target ?? "sphere";
        this._targetOpts = opts.targetOpts ?? {};
        this.reset();
    }

    /** Re-init: sample x_0 from N(0, I), generate x_1 procedurally, t = 0. */
    reset() {
        const N = this.dim;
        const len = N * N * N * 4;
        const rng = makeRng(this.seed);
        this.x0 = new Float32Array(len);
        for (let i = 0; i < len; i++) this.x0[i] = randn(rng);
        this.x1 = TARGETS[this.targetName](N, this._targetOpts);
        this.x = new Float32Array(this.x0);   // current state
        this.stepIdx = 0;
        this.t = 0;
        this.dt = 1 / this.steps;
        return this;
    }

    /**
     * Ground-truth velocity field for the OT path: v(x_t, t) = x_1 - x_0.
     * In production, this is replaced with a network's prediction. Here
     * we use the analytical solution so the demo runs without training.
     */
    _velocity() {
        const v = new Float32Array(this.x0.length);
        for (let i = 0; i < v.length; i++) v[i] = this.x1[i] - this.x0[i];
        return v;
    }

    /** One integration step. Returns true if more steps remain. */
    step() {
        if (this.stepIdx >= this.steps) return false;
        const v = this._velocity();
        if (this.integrator === "midpoint") {
            // x_half = x + v * dt/2 ; v_half = v(x_half, t + dt/2)
            // For the GT oracle v is constant in (x, t) so v_half == v;
            // midpoint and Euler converge to the same answer. Kept as a
            // shape demo for swapping in a real network later.
            const halfDt = this.dt * 0.5;
            const xHalf = new Float32Array(this.x.length);
            for (let i = 0; i < this.x.length; i++) xHalf[i] = this.x[i] + v[i] * halfDt;
            // Recompute velocity at the half-point. For GT oracle this is identical
            // (v doesn't depend on x_t or t). For a real network it'd differ.
            // We pass xHalf for shape-API parity with a real velocity model.
            const vHalf = v;  // GT oracle: v is constant along the OT path
            for (let i = 0; i < this.x.length; i++) this.x[i] += vHalf[i] * this.dt;
        } else {
            for (let i = 0; i < this.x.length; i++) this.x[i] += v[i] * this.dt;
        }
        this.stepIdx++;
        this.t = this.stepIdx / this.steps;
        return this.stepIdx < this.steps;
    }

    /** Run all remaining steps at once. */
    runToCompletion() {
        while (this.step()) { /* loop */ }
        return this.x;
    }

    /** Convert current state to a single-channel occupancy Uint8Array
     *  thresholding at 0.5. Suitable for direct .vx encoding. */
    toOccupancyU8(threshold = 0.5) {
        const N = this.dim;
        const out = new Uint8Array(N * N * N);
        for (let i = 0; i < out.length; i++) {
            // Channel 3 of the current state = occupancy
            const alpha = this.x[i * 4 + 3];
            out[i] = alpha > threshold ? 255 : 0;
        }
        return out;
    }

    /** RGBA Uint8Array (4 × N³). Suitable for .vx encoding with channels=4
     *  or direct upload into a 3D texture as 4 separate byte channels. */
    toRgbaU8() {
        const out = new Uint8Array(this.x.length);
        for (let i = 0; i < this.x.length; i++) {
            const v = this.x[i];
            out[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
        }
        return out;
    }
}
