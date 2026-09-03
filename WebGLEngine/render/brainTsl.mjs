// FILE: render/brainTsl.mjs -- v4380
//
// *** THE GPU BRAIN'S MLP LAYER AS A TSL COMPUTE GRAPH, AGAINST THE KERNEL THAT ALREADY RUNS IT. ***
//
// brain/mlp.js is a hand-written WGSL batched MLP: `y = act(W*x + b)`, one dispatch per layer, activations
// ping-ponging between two persistent buffers, weights uploaded once. It is not a fixture: brain/brain.js
// constructs one from buildLayers() and a second from the attack layers at batch caps 64 and 256, and
// brain/blobBrain.js runs a policy through a third. brain/policy.js builds the specs they are fed --
// 16 -> 16 relu -> 1 sigmoid for the attack policy, with hand-set interpretable weights.
//
// *** TWO IMPORTERS, NOT FIVE, AND THE FIRST DRAFT OF THIS PARAGRAPH SAID FIVE. *** It came from a grep that
// matched comments: brain/rl/dockPolicy.js says a policy "drops straight onto the GPU Brain's BatchedMLP" and
// imports nothing at all. The gate counts the importers rather than repeating this sentence, which is the
// only reason the number is right now.
//
// *** WHY THIS TWIN IS WORTH MORE THAN THE ONES BEFORE IT. *** v4335 found the weakness in every "byte-identical
// to the twin" claim this arc has made: the twin is built from the SAME SHELL as the graph, so a mistake in the
// shell moves both halves together and the comparison stays silent. Sabotage N dropped a shell's topology and
// 36,864 of 36,864 pixels still agreed. v4370 answered it once, with hmcGpu's shipped leapfrog. This is the
// second answer and a different one: brain/mlp.js predates the whole TSL arc by more than a thousand versions,
// was written for a different purpose by a different hand, and shares no code with anything here.
//
// ---- *** THE THREE THINGS THIS PASS HAS THAT NO EARLIER TRANSPLANT DID *** ------------------------------------
//
// 1. A REDUCTION, AND THE SUMMATION ORDER IS THE ARITHMETIC -- MEASURED, AND THE FIXTURE THAT MATTERS IS
//    BLIND TO IT. The kernel accumulates
//
//        var acc = B[o];  for k in 0..nIn:  acc = acc + X[xoff+k] * W[woff+k];
//
//    f32 addition is not associative, so starting from zero and adding the bias LAST is algebraically identical
//    and need not be bit-identical. Measured over 40 random layers with non-zero biases: it moves 1,493 of
//    2,448 cells -- 61% -- worst |diff| 3.815e-6. The order is load-bearing.
//
//    *** AND THEN THE SAME MEASUREMENT ON THE POLICY THE BRAIN ACTUALLY SHIPS MOVED NOTHING: 0 of 256. ***
//    brain/policy.js's buildAttackLayersDeep sets every one of its sixteen biases to zero -- the hidden layer
//    is relu(+hand.x) and relu(-hand.x) with no offset -- and adding zero first or last is exact in IEEE. So a
//    round that graded the reduction against the real consumer alone would have passed a kernel whose
//    accumulation order was wrong, and reported a bit claim while doing it. The gate runs BOTH fixtures and
//    says which one can see what: the shipped policy for the consumer, a non-zero-bias layer for the order.
//
// 2. A 2D DISPATCH FLATTENED TO 1D, WHICH IS A REAL DIFFERENCE AND NOT A DETAIL. The kernel is
//    @workgroup_size(8, 8) with gid.x the output neuron and gid.y the batch row, and returns early for the
//    ragged edge. TSL's instanceIndex is a flat 1D counter, so the graph recovers (r, o) by division and
//    modulo over nOut. THE ARITHMETIC PER CELL IS UNTOUCHED -- each invocation computes one independent dot
//    product either way -- so the flattening cannot move a value, and what it CAN do is visit a cell twice or
//    not at all. That is what the gate checks: every (r, o) exactly once, counted, not reasoned about.
//
// 3. *** AND THE CLAIM HAS TO SPLIT BY OPERATION CLASS, WHICH IS NEW HERE. *** hmcGpu's header could say
//    "specified operations only: + - * /" and earn a bit claim against a CPU mirror. This pass cannot, because
//    one of its three activations is sigmoid = 1 / (1 + exp(-x)), and WGSL does not specify exp() to the ULP:
//    it is permitted a relative error, so two conformant devices may disagree and a JavaScript Math.exp is
//    under no obligation to match either. So:
//
//        none, relu   -- specified ops (+, *, max). BIT-IDENTICAL to the CPU mirror is claimable.
//        sigmoid      -- exp(). Bit-identical to THE SHIPPED KERNEL ON THE SAME DEVICE (same exp, same
//                        hardware) is claimable; bit-identical to the CPU mirror is NOT, and the gate
//                        measures the gap instead of hiding it under a tolerance chosen to pass.
//
//    Stating that split is the point. A round that ran all three activations, took one tolerance wide enough
//    for the sigmoid, and reported "agrees" would have thrown away the exact claim the other two can carry.
//
// ---- WHAT IS DELIBERATELY NOT THE SAME ------------------------------------------------------------------------
//
// batch, nIn, nOut and act are UNIFORMS in the kernel and baked JS constants in the graph, because a TSL Loop
// wants a JavaScript bound -- the precedent lyapunovNodes set at v4321 and makeHmcLeapfrogTsl repeated at
// v4370. So this is the kernel's ARITHMETIC at one layer shape, with the shipped kernel fed the same shape
// through its uniform. It is not the kernel's signature and the gate says so.
"use strict";

/** The kernel's own activation codes, imported in spirit from brain/mlp.js's ACT and kept in step by the gate. */
export const ACT = Object.freeze({ none: 0, relu: 1, sigmoid: 2 });

/**
 * *** WHICH ACTIVATIONS CAN CARRY A BIT CLAIM AGAINST A CPU MIRROR, AND WHY. *** Not a policy -- a reading of
 * the WGSL spec's precision table. +, *, max and comparison are exactly rounded; exp() is allowed a relative
 * error (the spec gives it an ULP budget rather than correct rounding), so a device is free to differ from
 * JavaScript's Math.exp and from another device, while both remain conformant.
 */
export const SPECIFIED_OPS = Object.freeze(["none", "relu"]);
export const UNSPECIFIED_OPS = Object.freeze(["sigmoid"]);
export const actIsSpecified = (act) => SPECIFIED_OPS.includes(String(act || "none"));

/**
 * *** THE FLATTENING, WRITTEN ONCE SO THE GRAPH AND THE GATE CANNOT DISAGREE ABOUT IT. ***
 * The kernel's (gid.x = o, gid.y = r) becomes one counter i over batch*nOut. Row-major in the OUTPUT's own
 * layout -- Y[r*nOut + o] -- so i and the store index are the same number and the store needs no second
 * mapping to get wrong.
 */
export function cellFor(i, nOut) {
    const n = Math.max(1, nOut | 0);
    return { r: Math.floor(i / n), o: i % n };
}

/** How many invocations one layer needs. The kernel dispatches ceil(nOut/8) x ceil(batch/8) groups of 64. */
export const invocationsFor = (batch, nOut) => Math.max(0, (batch | 0)) * Math.max(0, (nOut | 0));

/**
 * *** THE CPU MIRROR, AT f32, IN THE KERNEL'S OWN ORDER. ***
 *
 * Math.fround after every operation, exactly as tools/roundhouse/hmcGpu.mjs's leapfrogF32 does, because a f64
 * mirror of a f32 kernel is not a mirror -- it is a second, better answer that the device will never match.
 * The accumulation starts at the bias and walks k upward, which is what the kernel does; `mlpLayerReassociated`
 * below is the same arithmetic in a different order, kept so the gate can say what that order is worth in
 * ULPs rather than repeating a rule of thumb about associativity.
 *
 * @param layer { nIn, nOut, W: Float32Array(nOut*nIn) row-major, b: Float32Array(nOut), act }
 * @param x     Float32Array(batch * nIn)
 */
export function mlpLayerCpu(layer, x, batch) {
    const { nIn, nOut } = layer;
    const act = String(layer.act ?? "none");
    const f = Math.fround;
    const y = new Float32Array(batch * nOut);
    for (let r = 0; r < batch; r++) {
        const xoff = r * nIn;
        for (let o = 0; o < nOut; o++) {
            const woff = o * nIn;
            let acc = f(layer.b[o]);
            for (let k = 0; k < nIn; k++) acc = f(acc + f(f(x[xoff + k]) * f(layer.W[woff + k])));
            if (act === "relu") acc = f(Math.max(acc, 0));
            else if (act === "sigmoid") acc = f(1 / f(1 + f(Math.exp(f(-acc)))));
            y[r * nOut + o] = acc;
        }
    }
    return y;
}

/**
 * The SAME layer, summed in a different order: products first from zero, bias added at the end. Algebraically
 * identical to mlpLayerCpu and under no obligation to be bit-identical. This exists to be MEASURED against
 * the kernel's order, not to be used -- v4370's lesson, where a re-association the header called observable
 * turned out to be exact and a different one moved 215 of 256 endpoints.
 */
export function mlpLayerReassociated(layer, x, batch) {
    const { nIn, nOut } = layer;
    const act = String(layer.act ?? "none");
    const f = Math.fround;
    const y = new Float32Array(batch * nOut);
    for (let r = 0; r < batch; r++) {
        const xoff = r * nIn, woff0 = 0;
        for (let o = 0; o < nOut; o++) {
            const woff = o * nIn;
            let acc = 0;                                    // products first...
            for (let k = 0; k < nIn; k++) acc = f(acc + f(f(x[xoff + k]) * f(layer.W[woff + k])));
            acc = f(acc + f(layer.b[o]));                   // ...bias last
            if (act === "relu") acc = f(Math.max(acc, 0));
            else if (act === "sigmoid") acc = f(1 / f(1 + f(Math.exp(f(-acc)))));
            y[r * nOut + o] = acc;
        }
        void woff0;
    }
    return y;
}

/**
 * *** ONE MLP LAYER AS TSL NODES. ***
 *
 * Four storage buffers in the kernel's own packing and order -- X, W, B, Y -- so a device binding this pass
 * binds the buffers brain/mlp.js already builds rather than a tidier shape chosen for the graph. They are
 * LABELLED, so tslSource matches them by name instead of by the order three happens to emit them in (v4363's
 * finding: three declares buffers in the order the body first uses them).
 *
 * @param TSL   the three TSL namespace
 * @param spec  { batch, nIn, nOut, act, W, b } -- the layer, at a fixed shape
 */
export function makeMlpLayerTsl(TSL, { batch = 8, nIn = 4, nOut = 4, act = "none" } = {}) {
    const { Fn, float, uint, instanceIndex, instancedArray, Loop, If, max, exp } = TSL;
    for (const n of ["Fn", "float", "instancedArray", "Loop"])
        if (typeof TSL[n] !== "function") throw new Error(`brainTsl: the TSL namespace has no ${n}()`);
    if (!(nIn > 0 && nOut > 0 && batch > 0)) throw new Error("brainTsl: makeMlpLayerTsl needs positive batch, nIn and nOut");
    if (!(String(act) in ACT)) throw new Error(`brainTsl: no such activation "${act}" (${Object.keys(ACT).join(", ")})`);

    const X = instancedArray(batch * nIn, "float").label("X");
    const W = instancedArray(nOut * nIn, "float").label("W");
    const B = instancedArray(nOut, "float").label("B");
    const Y = instancedArray(batch * nOut, "float").label("Y");

    const cells = invocationsFor(batch, nOut);
    const node = Fn(() => {
        // THE FLATTENING. cellFor's rule, in nodes: r = i / nOut, o = i % nOut, integer division on a uint.
        const i = instanceIndex;
        // *** THE KERNEL'S RAGGED-EDGE GUARD, AND DROPPING IT COST EXACTLY ONE CELL. *** brain/mlp.js opens
        // with `if (o >= P.nOut || r >= P.batch) { return; }` because an 8x8 workgroup over an arbitrary
        // (nOut, batch) over-dispatches. The flat index is a bijection onto the cells, so those two
        // comparisons become one -- and the first version of this graph left it out, reasoning that the
        // dispatch count was exact. IT IS NOT: a compute() of N is rounded up to whole workgroups of 64, so a
        // layer of 96 cells runs 128 invocations and a layer of 8 runs 64.
        //
        // MEASURED, and the shape of the damage is the part worth writing down: it did not corrupt the 32
        // out-of-range cells, it corrupted ONE IN-RANGE CELL -- the last. An out-of-bounds store in WGSL is
        // not required to be dropped, and this device CLAMPS it to the final element, so every stray
        // invocation piled its garbage onto Y[len-1]. 96-cell layer: 1 cell wrong by 3.43. 8-cell layer: 1
        // wrong by 0.93. A 128-cell layer -- an exact multiple of 64 -- was perfect, which is precisely how a
        // missing guard hides from a fixture whose sizes are round.
        If(i.lessThan(uint(cells)), () => {
            const o = i.mod(nOut);
            const r = i.div(nOut);
            const xoff = r.mul(nIn);
            const woff = o.mul(nIn);
            // THE KERNEL'S ORDER: start at the bias, walk k upward, one multiply-add per step. Not a tree, not
            // products-then-bias -- see mlpLayerReassociated and the gate's measurement of what that costs.
            const acc = B.element(o).toVar();
            Loop({ start: 0, end: nIn }, ({ i: k }) => {
                acc.assign(acc.add(X.element(xoff.add(k)).mul(W.element(woff.add(k)))));
            });
            if (act === "relu") acc.assign(max(acc, float(0)));
            else if (act === "sigmoid") acc.assign(float(1).div(float(1).add(exp(acc.negate()))));
            Y.element(i).assign(acc);    // i IS r*nOut + o, which is why cellFor is row-major in Y's layout
        });
    })().compute(cells);

    return { node, buffers: { X, W, B, Y }, batch, nIn, nOut, act, invocations: cells,
             dispatched: Math.ceil(cells / 64) * 64 };
}

/** The shell this pass expects: four f32 buffers, three read, one written, named as the graph labels them. */
export const MLP_SHELL = Object.freeze({
    name: "mlpLayer",
    workgroupSize: 64,
    storage: Object.freeze([
        Object.freeze({ name: "X", element: "f32", access: "read" }),
        Object.freeze({ name: "W", element: "f32", access: "read" }),
        Object.freeze({ name: "B", element: "f32", access: "read" }),
        Object.freeze({ name: "Y", element: "f32" }),
    ]),
});
