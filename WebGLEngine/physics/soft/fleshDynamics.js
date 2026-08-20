// WebGLEngine/physics/soft/fleshDynamics.js — v2526
//
// THE SKIN GETS INERTIA — and the design exists to protect something.
//
// boneField.js says in its own header: "the field is a PURE FUNCTION of the bone transforms. No time, no random,
// no accumulation between frames." That is not decoration; it is why two peers running the same recording grow the
// same skin. Jiggle IS accumulation. Bolting a spring into the field would quietly destroy the property the whole
// thing rests on, and it would do it invisibly — the pictures would still look fine.
//
// So the state lives HERE, in front of the field, and boneField stays pure. This layer takes bones in and gives
// displaced bones out; the field never learns that time exists.
//
//   box3d bodies -> bonesFromTransforms -> [fleshDynamics.step] -> boneField -> marchScalarField
//                                           ^ the only stateful thing in the chain
//
// WHY A SPRING AND NOT A SOFT-BODY SOLVER. This is honestly a lag, not a simulation: each bone's flesh trails the
// bone's own motion by a damped spring, so a limb that stops abruptly has its skin keep going for a few frames and
// settle. That reads as weight. It is NOT: pressure, volume preservation, collision of flesh against flesh, or
// anything an FEM would give you. The engine owns two real solvers (gpu/ClothSim.js, physics/sph/sph.js) and this
// is not either of them. Saying "soft body" here would be a lie; this is a skin with lag.
//
// DETERMINISM: FIXED dt, TICK-INDEXED, never wall-clock. This is the same law as the ragdoll's shove and the GPU
// brain's exclusion from the sim loop. A spring integrated with a variable frame delta gives two machines two
// different skins by frame 300 — and it would look like nothing at all was wrong.
"use strict";

const DT = 1 / 60;   // fixed. NOT the frame delta. See above; this is the whole point.

export class FleshDynamics {
    /**
     * @param {number} boneCount
     * @param {{stiffness?: number, damping?: number, maxLag?: number}} [opts]
     *   stiffness  how hard the flesh is pulled back to the bone (per second^2). Higher = tighter skin.
     *   damping    how fast the wobble dies. At 1.0 it is critically damped and does not overshoot at all —
     *              which means no jiggle, so the interesting range is below 1.
     *   maxLag     a hard clamp on how far flesh may trail its bone, in metres. Without it a big enough impulse
     *              turns the figure inside out, and an inside-out figure is a marched surface with the normals
     *              reversed, which does not look like a physics bug. It looks like a lighting bug.
     */
    constructor(boneCount, opts = {}) {
        this.stiffness = opts.stiffness ?? 260;
        this.damping = opts.damping ?? 0.35;
        this.maxLag = opts.maxLag ?? 0.09;
        this.n = boneCount;
        // offset = where the flesh is relative to where the bone says it should be. Two of them per bone: the
        // ends move independently, so a limb can shear rather than only translate.
        this.oa = new Float64Array(boneCount * 3);
        this.ob = new Float64Array(boneCount * 3);
        this.va = new Float64Array(boneCount * 3);
        this.vb = new Float64Array(boneCount * 3);
        this._prevA = null;
        this._prevB = null;
        this.ticks = 0;
    }

    reset() {
        this.oa.fill(0); this.ob.fill(0); this.va.fill(0); this.vb.fill(0);
        this._prevA = null; this._prevB = null;
        this.ticks = 0;
    }

    /**
     * Advance one TICK and return displaced bones.
     *
     * @param {Array<{a:number[], b:number[], r:number}>} bones  fresh from bonesFromTransforms
     * @returns {Array<{a:number[], b:number[], r:number}>} the same bones with their ends lagged
     */
    step(bones) {
        if (bones.length !== this.n) {
            // The bone count changed under us. Growing the arrays and carrying the old state across would silently
            // pair bone 4's history with bone 7's body. Start clean and say nothing clever.
            this.n = bones.length;
            this.oa = new Float64Array(this.n * 3); this.ob = new Float64Array(this.n * 3);
            this.va = new Float64Array(this.n * 3); this.vb = new Float64Array(this.n * 3);
            this._prevA = null; this._prevB = null;
        }
        const A = new Float64Array(this.n * 3), B = new Float64Array(this.n * 3);
        for (let i = 0; i < this.n; i++) {
            A[i * 3] = bones[i].a[0]; A[i * 3 + 1] = bones[i].a[1]; A[i * 3 + 2] = bones[i].a[2];
            B[i * 3] = bones[i].b[0]; B[i * 3 + 1] = bones[i].b[1]; B[i * 3 + 2] = bones[i].b[2];
        }
        // First tick: the flesh starts ON the bone. Otherwise the figure detonates on frame 1 as every offset
        // springs back from wherever the arrays happened to be.
        if (!this._prevA) { this._prevA = A; this._prevB = B; this.ticks++; return bones; }

        this._integrate(this.oa, this.va, A, this._prevA);
        this._integrate(this.ob, this.vb, B, this._prevB);
        this._prevA = A; this._prevB = B;
        this.ticks++;

        const out = new Array(this.n);
        for (let i = 0; i < this.n; i++) {
            out[i] = {
                a: [bones[i].a[0] + this.oa[i * 3], bones[i].a[1] + this.oa[i * 3 + 1], bones[i].a[2] + this.oa[i * 3 + 2]],
                b: [bones[i].b[0] + this.ob[i * 3], bones[i].b[1] + this.ob[i * 3 + 1], bones[i].b[2] + this.ob[i * 3 + 2]],
                r: bones[i].r,
            };
        }
        return out;
    }

    // Semi-implicit Euler: velocity first, then position. Explicit Euler at this stiffness and 60Hz is unstable
    // and would look like the figure exploding for no reason — the classic one-line difference.
    _integrate(off, vel, cur, prev) {
        const k = this.stiffness, c = 2 * this.damping * Math.sqrt(k), max = this.maxLag;
        for (let i = 0; i < this.n; i++) {
            for (let d = 0; d < 3; d++) {
                const j = i * 3 + d;
                // the bone moved by this much since last tick; the flesh did not, so it falls behind by that much
                off[j] -= cur[j] - prev[j];
                // spring back toward zero offset, damped
                const acc = -k * off[j] - c * vel[j];
                vel[j] += acc * DT;
                off[j] += vel[j] * DT;
                // clamp, and kill the velocity that pushed past the clamp — otherwise it keeps pushing and the
                // flesh sits pinned at the limit with an ever-growing velocity waiting to snap.
                if (off[j] > max) { off[j] = max; if (vel[j] > 0) vel[j] = 0; }
                else if (off[j] < -max) { off[j] = -max; if (vel[j] < 0) vel[j] = 0; }
            }
        }
    }

    /** How far the flesh is currently trailing, worst case, in metres. For a readout — jiggle you cannot see is
     *  jiggle you are paying for. */
    peakLag() {
        let m = 0;
        for (let i = 0; i < this.oa.length; i++) {
            const a = Math.abs(this.oa[i]), b = Math.abs(this.ob[i]);
            if (a > m) m = a;
            if (b > m) m = b;
        }
        return m;
    }
}
