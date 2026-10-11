// render/temporalLockGPU.mjs -- the RUNNER for render/temporalLockWgsl.mjs's five kernels and
// render/ringFloorWgsl.mjs's one: RING_PUSH, SHADING_SHIFT, RIDGE, FIELD_RIDGE, COHERENT_RIDGE, RING_FLOOR.
//
// *** THE LAST SIX. *** tools/ship/kernelReach.mjs censuses kernels the ENGINE cannot dispatch -- reachable
// only from a gate -- and the temporal arc's figure has been six since v4637 re-took it. v4590 gave RESOLVE
// and ACCUMULATE a caller, v4592 MOTION, v4593 DISOCCLUSION and RECTIFY. These are the remainder, and with
// this file the arc's count is zero. Same construction as render/temporalGPU.mjs, render/motionVectorsGPU.mjs,
// render/temporalRejectGPU.mjs, render/objectMotionGPU.mjs and fx/fsr/fsrGPU.js: gfx/device.js, never raw
// WebGPU.
//
// ---- WHAT WAS ACTUALLY WRONG, MEASURED RATHER THAN ASSERTED -------------------------------------------------
//
// These kernels are not untested. ELEVEN GATES drive them on a real device, from FOURTEEN hand-rolled
// dispatch sites -- counted by the gate, per kernel, as sites/files:
//
//     RING_PUSH_WGSL       5/4   temporalLock, temporalRidgeMargin, temporalRingFloor, temporalRingContent x2
//     RING_FLOOR_WGSL      4/4   ringFloor, ringFloorDevice, ringFloorPhase, ringFloorPerspective
//     COHERENT_RIDGE_WGSL  2/2   temporalCoherentLock, temporalRidgePhase
//     SHADING_SHIFT_WGSL   1/1   temporalLock
//     RIDGE_WGSL           1/1   temporalLock
//     FIELD_RIDGE_WGSL     1/1   temporalDepthLock
//
// *** THIS TABLE FIRST SAID TWELVE SITES ACROSS NINE GATES AND THE GATE'S OWN CENSUS CORRECTED IT. *** That
// number came from a grep counting FILES per kernel and adding them up, which double-counts nothing and
// under-counts every file holding two dispatches. The census counts sites, and it found fourteen. The wrong
// number is left recorded rather than quietly replaced because it is this lab's own rule failing in its
// mildest form: a figure in a header that nothing derives is a figure nothing can correct.
//
// *** AND THE COPIES AGREE, WHICH IS WORTH SAYING BECAUSE A DRIFT WOULD HAVE BEEN THE BETTER STORY. *** The
// four RING_PUSH frame-loop copies pack the same 16-byte uniform from the same expression, bind the same six
// buffers in the same order and ping-pong the same two pairs; the four RING_FLOOR copies dispatch the same
// group math character for character. The fifth RING_PUSH site is the one deliberate exception and not a
// drift: temporalRingContent's tie probe packs (t.w, 1, P, 0) because it drives a ONE-ROW strip to put an
// exact texel boundary under the bounds test. There is no accidental disagreement to report and none is
// invented here. The defect is the one the census names: every one of those copies lives inside a STRING --
// the body of a runInEngineOrigin script -- so no import graph, validator or rename reaches it, and nothing
// outside a gate can call any of it.
//
// ---- THE ONE COST THAT IS A NUMBER RATHER THAN A SHAPE ------------------------------------------------------
//
// All four RING_PUSH copies call dev.compute({ wgsl: RING_PUSH_WGSL }) INSIDE the per-frame loop, so a ring
// pushed over N frames compiles the same WGSL N times. That is a gate's prerogative and costs a gate nothing
// it is measuring -- but it is not a shape a frame loop can adopt, and it is the reason this class builds its
// pipelines once in the constructor the way TemporalRejectGPU does. The gate measures the difference rather
// than assuming it.
//
// ---- WHAT THIS CLASS REFUSES ---------------------------------------------------------------------------------
//
// `relax` is absent from TemporalRejectGPU because RECTIFY_WGSL has no binding for it. The same rule applies
// here twice over:
//
//   * ringFloor() returns the field and does not reduce it to a frame-wide worst. RING_FLOOR_WGSL writes a
//     PER-PIXEL floor and ringFloorWgsl.mjs's header says the reduction is the caller's, on the grounds that a
//     parity row on the field is strictly stronger than one on a reduced number that can agree by cancellation.
//     ringFloorCPU returns a `worst` BESIDE its `per`, which is the shape to copy if a reduction is ever wanted
//     here -- beside the field, never instead of it.
//   * pushRing() returns the ring and fill buffers as DEVICE HANDLES as well as data, because the whole point
//     of a ring is that it survives to the next frame. A runner that could only hand back a Float32Array would
//     force a round trip per frame and make the object useless in the loop it exists for.
"use strict";
import { RING_PUSH_WGSL, SHADING_SHIFT_WGSL, RIDGE_WGSL, FIELD_RIDGE_WGSL, COHERENT_RIDGE_WGSL } from "./temporalLockWgsl.mjs";
import { RING_FLOOR_WGSL } from "./ringFloorWgsl.mjs";

const WG = 8;
const groups = (w, h) => [Math.ceil(w / WG), Math.ceil(h / WG)];

/** RING_FLOOR_WGSL's windowPhase word, by name, so a caller never passes a bare 1. */
export const FLOOR_PHASE = Object.freeze({ FRAME: 0, WINDOW: 1 });

export class TemporalLockGPU {
    constructor(device) {
        if (!device || device.backend !== "webgpu")
            throw new Error("render/temporalLockGPU: needs a gfx/device.js device on the webgpu backend -- " +
                `got ${device ? JSON.stringify(device.backend) : "nothing"}. There is no compute stage in WebGL2, ` +
                "so a caller without one uses pushLuma/shadingShiftCPU/ridgesCPU/coherentRidgesCPU/" +
                "depthRidgesCPU/ringFloorCPU by asking for them.");
        this.device = device;
        // *** BUILT ONCE, WHICH IS THE POINT. *** The nine gates that drive these kernels compile RING_PUSH
        // once per frame inside their own loop; a frame loop cannot.
        this.pPush = device.compute({ wgsl: RING_PUSH_WGSL });
        this.pShift = device.compute({ wgsl: SHADING_SHIFT_WGSL });
        this.pRidge = device.compute({ wgsl: RIDGE_WGSL });
        this.pField = device.compute({ wgsl: FIELD_RIDGE_WGSL });
        this.pCoherent = device.compute({ wgsl: COHERENT_RIDGE_WGSL });
        this.pFloor = device.compute({ wgsl: RING_FLOOR_WGSL });
        for (const [n, p] of [["RING_PUSH", this.pPush], ["SHADING_SHIFT", this.pShift], ["RIDGE", this.pRidge],
                              ["FIELD_RIDGE", this.pField], ["COHERENT_RIDGE", this.pCoherent],
                              ["RING_FLOOR", this.pFloor]])
            if (p && p.error) throw new Error(`render/temporalLockGPU: the ${n} kernel did not compile -- ${p.error}`);
    }

    _f32(v) { return v instanceof Float32Array ? v : new Float32Array(v); }
    _store(v) { return this.device.buffer({ data: this._f32(v), usage: ["storage"] }); }
    _zeros(n) { return this.device.buffer({ data: new Float32Array(n), usage: ["storage"] }); }

    /**
     * Allocate a ring for w*h pixels at `period`, zeroed, with its fill counts.
     *
     * The ring is [pixel][slot] with F = 2*period slots, which is RING_PUSH_WGSL's layout and makeLumaState's.
     * Returned as an opaque object rather than two bare buffers so a caller cannot hand pushRing a ring and
     * somebody else's fill counts -- the pair is one state and the kernel reads them as one.
     */
    makeRing(w, h, period) {
        if (!(period >= 1)) throw new Error(`temporalLockGPU.makeRing: period must be at least 1 -- got ${period}`);
        const n = w * h, F = 2 * period;
        // *** THE COUNTER IS `pushes` AND NOT `frames`, WHICH IS A COLLISION AVOIDED RATHER THAN A PREFERENCE. ***
        // makeLumaState's state has a field called `frames` and it is the RING LENGTH, 2*period -- lumaMean reads
        // `const F = st.frames`. A GPU state whose `frames` counted pushes would read identically and mean
        // something else, in the one place a reader is most likely to move between the two mirrors.
        return { w, h, period, F, pushes: 0, ring: this._zeros(n * F), fill: this._zeros(n) };
    }

    /** Free a ring's device memory. A ring outlives a frame, so nothing else can know when it is done. */
    destroyRing(st) { for (const b of [st.ring, st.fill]) if (b) b.destroy(); st.ring = st.fill = null; }

    /**
     * One frame of RING_PUSH: reproject the ring along `motion`, then append this frame's luma.
     *
     * Mirrors pushLuma(st, { current, motion, w, h }). `current` is w*h*4 RGBA, `motion` w*h*4 in the
     * (du, dv, valid, zPrev) convention render/motionVectors.mjs defines.
     *
     * *** first IS DERIVED FROM st.pushes, NOT PASSED. *** All four hand-rolled copies write
     * `f === 0 ? 1 : 0` from their own loop counter, which is correct in a loop and unavailable to a caller
     * that pushes one frame per call. The state counts its own frames, so the first push resets the ring and
     * no caller can get it wrong by forgetting which frame it is on.
     *
     * Returns the SAME state object, swapped in place: the ring ping-pongs, and a caller that had to track
     * which of two buffers was current would be re-implementing the half of this that is easy to get wrong.
     */
    pushRing(st, { current, motion }) {
        if (!st || !st.ring) throw new Error("temporalLockGPU.pushRing: needs a ring from makeRing() -- got " +
            (st ? "a state whose buffers were destroyed" : "nothing"));
        const dev = this.device, { w, h, period, F } = st, n = w * h;
        const bCur = this._store(current), bMot = this._store(motion);
        const outRing = this._zeros(n * F), outFill = this._zeros(n);
        // struct P { w:u32, h:u32, period:u32, first:u32 }
        const ub = new ArrayBuffer(16);
        new Uint32Array(ub, 0, 4).set([w, h, period, st.pushes === 0 ? 1 : 0]);
        const u = dev.buffer({ data: new Uint8Array(ub), usage: "uniform" });
        this.pPush.bind("cur", bCur).bind("motion", bMot).bind("ringIn", st.ring).bind("filledIn", st.fill)
                  .bind("ringOut", outRing).bind("filledOut", outFill).bind("u", u);
        dev.frame(({ pass }) => { pass.dispatch(this.pPush, groups(w, h)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        st.ring.destroy(); st.fill.destroy();
        st.ring = outRing; st.fill = outFill; st.pushes++;
        for (const b of [bCur, bMot, u]) b.destroy();
        return st;
    }

    /** Read a ring's contents back as { ring, filled } Float32Arrays. A round trip, so it is a method and not the return of every push. */
    async readRing(st) {
        return {
            ring: new Float32Array(await this.device.read(st.ring)),
            filled: new Float32Array(await this.device.read(st.fill)),
        };
    }

    /**
     * SHADING_SHIFT: the newer half-period's mean against the older's, both spanning the same jitter phases.
     * Mirrors shadingShiftCPU(st, { scale, strength }). A pixel whose ring is not yet full reads 0 -- UNKNOWN,
     * not clean, which is the kernel's own comment and v4402's fault.
     */
    async shadingShift(st, { scale = 1, strength = 1 } = {}) {
        const dev = this.device, { w, h, period } = st;
        const bDst = this._zeros(w * h);
        // struct P { w:u32, h:u32, period:u32, pad:u32, scale:f32, strength:f32, p2:f32, p3:f32 }
        const ub = new ArrayBuffer(32);
        new Uint32Array(ub, 0, 4).set([w, h, period, 0]);
        new Float32Array(ub, 16, 4).set([scale, strength, 0, 0]);
        const u = dev.buffer({ data: new Uint8Array(ub), usage: "uniform" });
        this.pShift.bind("ring", st.ring).bind("filled", st.fill).bind("dst", bDst).bind("u", u);
        dev.frame(({ pass }) => { pass.dispatch(this.pShift, groups(w, h)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const data = new Float32Array(await dev.read(bDst));
        for (const b of [bDst, u]) b.destroy();
        return { data, w, h };
    }

    /**
     * RIDGE: a strict luma extremum along either axis, over the RING's jitter-free mean.
     * Mirrors lockCandidatesFromRing(st, { margin }).
     */
    async ringRidges(st, { margin = 0.05, maxPlateau = 2 } = {}) {
        const dev = this.device, { w, h, period } = st;
        const bDst = this._zeros(w * h);
        // struct P { w:u32, h:u32, period:u32, maxPlateau:u32, margin:f32, p1:f32, p2:f32, p3:f32 }
        const ub = new ArrayBuffer(32);
        new Uint32Array(ub, 0, 4).set([w, h, period, maxPlateau]);
        new Float32Array(ub, 16, 4).set([margin, 0, 0, 0]);
        const u = dev.buffer({ data: new Uint8Array(ub), usage: "uniform" });
        this.pRidge.bind("ring", st.ring).bind("dst", bDst).bind("u", u);
        dev.frame(({ pass }) => { pass.dispatch(this.pRidge, groups(w, h)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const data = new Float32Array(await dev.read(bDst));
        for (const b of [bDst, u]) b.destroy();
        return { data, w, h };
    }

    /**
     * FIELD_RIDGE: the same test over a plain scalar field the caller already has, optionally ANDed with a mask.
     * Mirrors ridgesCPU(field, w, h, margin, maxPlateau), and with a mask, depthRidgesCPU + gateLocks in one
     * dispatch.
     *
     * The mask buffer is bound whether or not it is real, because a compute pipeline's bind group is complete
     * or it is nothing; `useMask` says whether to read it. That is TemporalRejectGPU.factor's rule, here.
     */
    async fieldRidges({ field, mask = null, w, h, margin = 0.05, maxPlateau = 2 }) {
        const dev = this.device;
        const bField = this._store(field);
        const bMask = mask ? this._store(mask) : this._zeros(w * h);
        const bDst = this._zeros(w * h);
        // struct P { w:u32, h:u32, useMask:u32, maxPlateau:u32, margin:f32, p1:f32, p2:f32, p3:f32 }
        const ub = new ArrayBuffer(32);
        new Uint32Array(ub, 0, 4).set([w, h, mask ? 1 : 0, maxPlateau]);
        new Float32Array(ub, 16, 4).set([margin, 0, 0, 0]);
        const u = dev.buffer({ data: new Uint8Array(ub), usage: "uniform" });
        this.pField.bind("field", bField).bind("mask", bMask).bind("dst", bDst).bind("u", u);
        dev.frame(({ pass }) => { pass.dispatch(this.pField, groups(w, h)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const data = new Float32Array(await dev.read(bDst));
        for (const b of [bField, bMask, bDst, u]) b.destroy();
        return { data, w, h };
    }

    /**
     * COHERENT_RIDGE: a ridge whose band across its own thin direction is at most maxBand.
     * Mirrors coherentRidgesCPU(field, w, h, margin, maxBand, maxPlateau).
     */
    async coherentRidges({ field, w, h, margin = 0.05, maxBand = 2, maxPlateau = 2 }) {
        const dev = this.device;
        const bField = this._store(field);
        const bDst = this._zeros(w * h);
        // struct P { w:u32, h:u32, maxBand:u32, maxPlateau:u32, margin:f32, p1:f32, p2:f32, p3:f32 }
        const ub = new ArrayBuffer(32);
        new Uint32Array(ub, 0, 4).set([w, h, maxBand, maxPlateau]);
        new Float32Array(ub, 16, 4).set([margin, 0, 0, 0]);
        const u = dev.buffer({ data: new Uint8Array(ub), usage: "uniform" });
        this.pCoherent.bind("field", bField).bind("dst", bDst).bind("u", u);
        dev.frame(({ pass }) => { pass.dispatch(this.pCoherent, groups(w, h)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const data = new Float32Array(await dev.read(bDst));
        for (const b of [bField, bDst, u]) b.destroy();
        return { data, w, h };
    }

    /**
     * RING_FLOOR: the per-pixel error floor the resample imposes.
     * Mirrors ringFloorCPU(luma, motion, w, h, period, tau, phase, ring).
     *
     * *** THE RING IS BOUND ALWAYS AND READ ONLY IN THE WINDOW FORM, which is not a convenience: *** the frame
     * form predates the ring term entirely and every caller before v4569 wrote a zero there, so a frame-form
     * call with no ring must produce exactly what those callers got. Passing `st` on a frame-form call is
     * therefore accepted and provably inert, and the gate holds that rather than the comment holding it.
     *
     * NO REDUCTION TO A FRAME-WIDE WORST. See the header.
     */
    async ringFloor({ luma, motion, w, h, period, tau = 0.25, phase = "frame", ring = null }) {
        if (phase !== "frame" && phase !== "window")
            throw new Error(`temporalLockGPU.ringFloor: phase is "frame" or "window" -- got ${JSON.stringify(phase)}. ` +
                "The two differ in whether this frame's jitter phase or the window's worst (0.25) bounds the term, " +
                "so a typo silently choosing one of them is a wrong number rather than a crash.");
        const win = phase === "window";
        if (win && !ring)
            throw new Error("temporalLockGPU.ringFloor: the window form reads the RING and none was given. " +
                "Pass the state from makeRing/pushRing. Binding zeroes would make the ring term vanish and " +
                "return the frame form's answer under the window form's name.");
        const dev = this.device;
        const bLuma = this._store(luma), bMot = this._store(motion);
        const bDst = this._zeros(w * h);
        const F = ring ? ring.F : 2;
        const bRing = ring ? ring.ring : this._zeros(w * h * F);
        // struct P { w:u32, h:u32, period:u32, windowPhase:u32, tau:f32, p1:f32, p2:f32, p3:f32 }
        const ub = new ArrayBuffer(32);
        new Uint32Array(ub, 0, 4).set([w, h, period, win ? FLOOR_PHASE.WINDOW : FLOOR_PHASE.FRAME]);
        new Float32Array(ub, 16, 4).set([tau, 0, 0, 0]);
        const u = dev.buffer({ data: new Uint8Array(ub), usage: "uniform" });
        this.pFloor.bind("luma", bLuma).bind("motion", bMot).bind("dst", bDst).bind("u", u).bind("ring", bRing);
        dev.frame(({ pass }) => { pass.dispatch(this.pFloor, groups(w, h)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const data = new Float32Array(await dev.read(bDst));
        for (const b of [bLuma, bMot, bDst, u]) b.destroy();
        if (!ring) bRing.destroy();     // a ring the caller owns is NOT freed here
        return { data, w, h };
    }
}
