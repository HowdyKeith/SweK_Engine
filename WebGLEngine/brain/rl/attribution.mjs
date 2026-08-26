// brain/rl/attribution.mjs -- WHICH INPUT DID THE POLICY ACTUALLY WEIGH, WITH AN AXIOM THAT PROVES THE ANSWER.
//
// v4027 -- Keith, on lifting from https://github.com/ankurtaly/Integrated-Gradients.
//
// A trained policy in this tree can be graded on WHAT IT DID -- dockPolicy lands or does not, memoryPolicy recalls
// the cue or guesses the average -- and nothing here could ever say WHY. "The net weighted the occluded bearing
// more than the range" was, until this file, a sentence nobody could check.
//
// *** THE OBVIOUS ANSWER IS THE WRONG ONE, AND IT IS WRONG IN A WAY THAT LOOKS RIGHT. *** The tempting move is to
// read the gradient AT the input -- saliency. It is one line, it produces a plausible per-feature number, and it
// FAILS THE ONE PROPERTY THAT WOULD MAKE THE NUMBER MEAN ANYTHING: the parts do not add up to the whole. A tanh
// unit that has saturated has a near-zero gradient at the input while being the entire reason for the output, so
// saliency reports "this feature did nothing" about the feature that did everything.
//
// INTEGRATED GRADIENTS (Sundararajan, Taly & Yan, "Axiomatic Attribution for Deep Networks", ICML 2017,
// arXiv:1703.01365) fixes exactly that by integrating the gradient along a straight path from a BASELINE to the
// input rather than sampling it at one point:
//
//     IG_i  =  (x_i - b_i) * INTEGRAL_{a=0..1}  dF( b + a*(x - b) ) / dx_i  da
//
// and the integral is what buys the axiom this whole file exists for:
//
//     *** COMPLETENESS:  sum_i IG_i  =  F(x) - F(b).  ***
//
// THE ATTRIBUTIONS ADD UP TO THE CHANGE IN THE OUTPUT. That is not a quality metric or a plausibility check --
// it is an identity, so it is a NUMBER THIS TREE CAN GATE, and completenessError below is that number. An
// attribution method whose parts do not sum to the whole is a picture; one whose parts do is a measurement.
//
// *** REIMPLEMENTED FROM THE PAPER'S MATH, NOT COPIED. *** The reference repo carries NO LICENSE FILE -- no
// LICENSE, no SPDX header, no terms in its README -- so it is all-rights-reserved by default and its code cannot
// be lifted. The formula above is the paper's, the arithmetic below is this file's, and the axiom is the thing
// worth having anyway.
//
// WHAT THIS DOES NOT CLAIM, SAID HERE RATHER THAN DISCOVERED LATER:
//   - It attributes ONE scalar output to ONE input vector. A policy's action is a vector; you attribute a chosen
//     component, and `outIndex` is that choice rather than an average that would blur the components together.
//   - On a RECURRENT policy it attributes the REFLEX PART ONLY. memoryPolicy carries history in `memory`, and
//     holding memory fixed while varying the observation answers "given what it already remembers, what in THIS
//     observation moved the action" -- not "what across the whole episode". Attributing through time is BPTT's
//     job and a different round. memoryBaseline exists so a caller can at least ASK the other question.
//   - Completeness is EXACT in the integral and APPROXIMATE in any finite sum. The error is returned, never
//     hidden, and attributionSelfcheck's own convergence section is what establishes it actually shrinks.
"use strict";

/**
 * *** THE MIDPOINT RULE, AND THE REASON IS MEASURED RATHER THAN ASSUMED. *** The reference implementation sums
 * gradients at steps+1 endpoints (a trapezoid/Riemann hybrid); the midpoint rule samples at (k+0.5)/m instead and
 * is a strictly better estimator of the same integral for the same number of gradient calls -- no endpoint is
 * double-counted and the leading error term cancels. brain/rl/attribution-selfcheck.mjs MEASURES the observed
 * convergence rate rather than asserting an order here, because an order claimed in a comment is a memory.
 */
export function pathAlphas(steps) {
    const m = Math.max(1, steps | 0), a = new Float64Array(m);
    for (let k = 0; k < m; k++) a[k] = (k + 0.5) / m;
    return a;
}

/**
 * Integrated Gradients for any scalar function of a vector.
 *
 * MODEL-AGNOSTIC ON PURPOSE: it takes CALLBACKS rather than a policy, which is what lets the gate drive it with
 * functions whose exact attributions are known on paper (a linear map, a saturated tanh) instead of only with a
 * net whose right answer nobody knows independently. A method that can only be tested against the thing it is
 * explaining cannot be tested at all.
 *
 * @param {object} o
 * @param {Float64Array|number[]} o.input     the observation being explained
 * @param {Float64Array|number[]} o.baseline  the reference it is explained AGAINST (see baselineNote)
 * @param {(x:Float64Array)=>number} o.valueFn      F(x) -- the scalar being attributed
 * @param {(x:Float64Array)=>Float64Array} o.gradFn dF/dx at x, same length as x
 * @param {number} [o.steps=64]  gradient calls along the path
 * @returns {{attributions:Float64Array, total:number, delta:number, completenessError:number,
 *            relativeError:number, steps:number, fx:number, fb:number}}
 */
export function integratedGradients({ input, baseline, valueFn, gradFn, steps = 64 }) {
    const x = Float64Array.from(input);
    const b = baseline == null ? new Float64Array(x.length) : Float64Array.from(baseline);
    if (b.length !== x.length) throw new Error("integratedGradients: baseline length " + b.length + " != input length " + x.length);
    const n = x.length, alphas = pathAlphas(steps), m = alphas.length;

    const acc = new Float64Array(n);
    const point = new Float64Array(n);
    for (let k = 0; k < m; k++) {
        const a = alphas[k];
        for (let i = 0; i < n; i++) point[i] = b[i] + a * (x[i] - b[i]);
        const g = gradFn(point);
        if (!g || g.length !== n) throw new Error("integratedGradients: gradFn returned " + (g && g.length) + " values, expected " + n);
        for (let i = 0; i < n; i++) acc[i] += g[i];
    }

    // *** THE MULTIPLY BY (x - b) IS THE STEP THAT MAKES THIS AN ATTRIBUTION RATHER THAN AN AVERAGE GRADIENT. ***
    // Dropping it is the classic implementation bug: every number still looks like a per-feature score, and
    // completeness silently stops holding. attribution-selfcheck plants exactly that and watches the axiom catch it.
    const attributions = new Float64Array(n);
    for (let i = 0; i < n; i++) attributions[i] = (x[i] - b[i]) * (acc[i] / m);

    let total = 0;
    for (let i = 0; i < n; i++) total += attributions[i];
    const fx = valueFn(x), fb = valueFn(b), delta = fx - fb;
    const completenessError = Math.abs(total - delta);
    return {
        attributions, total, delta, completenessError,
        relativeError: completenessError / (Math.abs(delta) || 1),
        steps: m, fx, fb,
    };
}

/**
 * *** A BASELINE IS A CHOICE, AND AN UNSTATED ONE MAKES EVERY ATTRIBUTION MEAN SOMETHING ELSE. ***
 *
 * IG answers "what moved F from the BASELINE to here", so the baseline IS the question. All-zeros is the paper's
 * default and is right when zero means "absent" (a blanked cue, no contact, no reading). It is WRONG when zero is
 * a real, meaningful value in the middle of a feature's range -- a centred joystick axis, a bearing of due north
 * -- because then the method explains a move from a state the policy considers ordinary, and the attributions are
 * about that move rather than about the observation.
 *
 * This is returned as TEXT, deliberately: this file cannot know which case a caller is in, and a default that
 * quietly picks one would be the failure it is warning about.
 */
export const baselineNote =
    "IG attributes the change from BASELINE to input, so the baseline is part of the question. All-zeros means " +
    "'absent' and is right for blanked or missing readings; it is wrong where 0 is an ordinary mid-range value " +
    "(a centred axis, a due-north bearing), because then you are explaining a move from a state the policy " +
    "considers normal. Where zero is not 'absent', pass the mean observation instead.";

/**
 * dF/dx for ONE output of a MemoryPolicy-shaped net, holding the memory pages fixed.
 *
 * The forward pass this differentiates is memoryPolicy.js's own, one step of it:
 *     x    = [ observation , memory ]
 *     h[o] = tanh( b1[o] + SUM_i W1[o*xDim+i] * x[i] )
 *     y[k] = tanh( bout[k] + SUM_o Wout[k*H+o] * h[o] )
 * so  dy[k]/dx[i] = (1 - y[k]^2) * SUM_o Wout[k*H+o] * (1 - h[o]^2) * W1[o*xDim+i].
 *
 * *** THIS GRADIENT ALREADY EXISTED AND WAS BEING THROWN AWAY. *** bptt.js computes exactly this quantity as its
 * `dx` and uses only the MEMORY slice of it (dx[IN+m], to carry the recurrence back a step); the OBSERVATION
 * slice, dx[0..inDim], is computed every step of every episode and discarded. Nothing was wrong with that -- BPTT
 * had no use for it -- but it does mean the number this file needs has been on the floor of the training loop the
 * whole time.
 *
 * Returned over the FULL xDim so a caller can attribute the memory pages too; policyAttribution slices the
 * observation half off for the ordinary case.
 */
export function policyGradInput(P, x, outIndex) {
    const xDim = P.xDim, H = P.hidden, O = P.outDim;
    if (x.length !== xDim) throw new Error("policyGradInput: x length " + x.length + " != xDim " + xDim);
    if (!(outIndex >= 0 && outIndex < O)) throw new Error("policyGradInput: outIndex " + outIndex + " outside 0.." + (O - 1));
    const h = new Float64Array(H);
    for (let o = 0; o < H; o++) {
        let a = P.b1[o]; const base = o * xDim;
        for (let i = 0; i < xDim; i++) a += P.W1[base + i] * x[i];
        h[o] = Math.tanh(a);
    }
    let ay = P.bout[outIndex]; const ob = outIndex * H;
    for (let o = 0; o < H; o++) ay += P.Wout[ob + o] * h[o];
    const y = Math.tanh(ay), dy = 1 - y * y;

    const g = new Float64Array(xDim);
    for (let o = 0; o < H; o++) {
        const c = dy * P.Wout[ob + o] * (1 - h[o] * h[o]), base = o * xDim;
        for (let i = 0; i < xDim; i++) g[i] += c * P.W1[base + i];
    }
    return g;
}

/** F(x) for the same output -- the value half of the pair, sharing the forward pass above. */
export function policyValue(P, x, outIndex) {
    const xDim = P.xDim, H = P.hidden;
    let ay = P.bout[outIndex]; const ob = outIndex * H;
    for (let o = 0; o < H; o++) {
        let a = P.b1[o]; const base = o * xDim;
        for (let i = 0; i < xDim; i++) a += P.W1[base + i] * x[i];
        ay += P.Wout[ob + o] * Math.tanh(a);
    }
    return Math.tanh(ay);
}

/**
 * Attribute one action component of a MemoryPolicy to the OBSERVATION that produced it.
 *
 * The memory pages are held at `memory` (the policy's live pages by default) along the whole path, which is what
 * makes this the reflex question rather than the episode question -- see the header. Pass memoryBaseline to vary
 * the pages too and ask what the REMEMBERED state contributed, which is a different and equally honest question.
 */
export function policyAttribution(P, { observation, baseline, outIndex = 0, steps = 64, memory, memoryBaseline }) {
    const inDim = P.inDim, xDim = P.xDim;
    const mem = memory ? Float64Array.from(memory) : Float64Array.from(P.memory);
    const memB = memoryBaseline ? Float64Array.from(memoryBaseline) : mem;
    const obs = Float64Array.from(observation);
    const obsB = baseline == null ? new Float64Array(inDim) : Float64Array.from(baseline);
    if (obs.length !== inDim) throw new Error("policyAttribution: observation length " + obs.length + " != inDim " + inDim);

    const x = new Float64Array(xDim); x.set(obs, 0); x.set(mem, inDim);
    const b = new Float64Array(xDim); b.set(obsB, 0); b.set(memB, inDim);

    const r = integratedGradients({
        input: x, baseline: b, steps,
        valueFn: (v) => policyValue(P, v, outIndex),
        gradFn: (v) => policyGradInput(P, v, outIndex),
    });
    // The observation half is what a reader asked about; the memory half is reported separately rather than
    // summed away, because "the pages did it" and "the reading did it" are different answers.
    return {
        ...r,
        observation: r.attributions.slice(0, inDim),
        memoryAttribution: r.attributions.slice(inDim),
        outIndex,
    };
}

/**
 * Rank features by attribution magnitude, for a reader rather than for arithmetic.
 * Names are optional; without them the index is the name, which is honest about knowing nothing else.
 */
export function topFeatures(attributions, names, k = 5) {
    const rows = [];
    for (let i = 0; i < attributions.length; i++) {
        rows.push({ index: i, name: (names && names[i]) || ("x[" + i + "]"), value: attributions[i], magnitude: Math.abs(attributions[i]) });
    }
    rows.sort((a, b) => b.magnitude - a.magnitude);
    return rows.slice(0, Math.max(1, k));
}
