// WebGLEngine/physics/splat/sortPrecision.js -- v2861
//
// PHASE 4: COMPARING A GPU SPLAT SORT AGAINST A float64 CPU REFERENCE, WITH A DEFENSIBLE ANSWER KEY.
//
// THE PROBLEM WITH THE OBVIOUS VERSION. Spark sorts splats on the GPU and its sort metric is quantised: 0.1
// defaulted to float16 with an opt-in float32 mode (sort32), and 2.0 reads the metric back through an RGBA8
// render target decoded as float32. A float64 CPU sort will therefore ORDER NEAR-TIES DIFFERENTLY, always, on
// correct implementations. So "do the two orderings match?" has the answer "no", forever, and tells you nothing.
//
// Writing a fudge tolerance ("agree to within N swaps") would be worse than useless -- it is a number nobody can
// defend and it would hide a genuinely broken sort.
//
// THE KEY THIS MODULE PROVIDES INSTEAD, AND IT IS EXACT. Quantisation is not noise; it is a KNOWN function. Take
// the true float64 depths, quantise them to the precision the GPU actually sorts at, and the pairs that COLLIDE
// -- that land on the same quantised value -- are exactly the pairs whose relative order is unconstrained. Every
// OTHER pair has a strictly ordered quantised metric, so any correct sorter MUST order it correctly regardless of
// precision.
//
//     collide(a,b) at precision p   ->  order is free
//     otherwise                     ->  order is MANDATORY
//
// That is a derived answer key, not a tolerance. It gets sharper as precision improves (float32 collides far less
// than float16) and it fails loudly on a sort that is actually wrong, because a wrong sort inverts pairs that are
// nowhere near each other.
//
// THE TRAP THAT MATTERS MORE THAN PRECISION, AND IT WOULD HAVE RUINED THE WHOLE COMPARISON. Spark 2.0 defaults to
// sortRadial: true -- sorting by DISTANCE FROM THE VIEWPOINT ORIGIN, not by Z-depth. Our CPU reference
// (gaussianSplat.js depthOrder) sorts by camera-space z. Those are DIFFERENT ORDERINGS BY CONSTRUCTION, not by
// precision, and they diverge most exactly where splats are off-axis. Comparing them without setting
// sortRadial:false would have produced a large, stable disagreement that looks precisely like a precision
// problem and is not one -- the fan-beam convention trap in a new costume: derive against the code you are
// integrating with, not against the idea of it.
//
// So this module exposes BOTH metrics and the comparison names which one it used. See SPARK_SETTINGS below for
// the configuration any real GPU run must use.
"use strict";

/**
 * The Spark configuration a meaningful comparison REQUIRES. Recorded as data, not prose, so the harness and the
 * gate cannot drift from each other or from the reason.
 */
export const SPARK_SETTINGS = {
    sortRadial: false,   // MUST be false: true sorts by distance from origin, ours sorts by Z-depth
    sort32: true,        // float32 sort metric rather than the float16 default -- fewer collisions, sharper key
    stochastic: false,   // stochastic rendering skips explicit ordering entirely; it must be off to compare one
    why: "sortRadial:false makes Spark's ordering the same QUANTITY as our reference; sort32 reduces (not removes) collisions; stochastic:false means an ordering exists at all.",
};

// ---- quantisation -------------------------------------------------------------------------------------------
// float32 is free (Math.fround). float16 is implemented here because Float16Array is not available in this
// runtime, and because doing it explicitly makes the rounding rule visible: round-to-nearest, ties-to-even, the
// same rule the hardware uses.

/** Round a number to IEEE-754 binary16 and return it as a normal JS number. */
export function toFloat16(x) {
    if (!Number.isFinite(x)) return x;
    const f = new Float32Array(1), u = new Uint32Array(f.buffer);
    f[0] = x;
    const bits = u[0];
    const sign = (bits >>> 31) & 1;
    const exp = (bits >>> 23) & 0xff;
    const mant = bits & 0x7fffff;
    let h;
    if (exp === 0xff) {
        h = (sign << 15) | 0x7c00 | (mant ? 0x200 : 0);
    } else {
        let e = exp - 127 + 15;
        if (e >= 0x1f) {
            h = (sign << 15) | 0x7c00;                       // overflow -> inf
        } else if (e <= 0) {
            if (e < -10) {
                h = sign << 15;                              // underflow -> signed zero
            } else {
                const m = mant | 0x800000;                   // restore implicit bit
                const shift = 14 - e;
                let q = m >>> shift;
                const rem = m & ((1 << shift) - 1);
                const halfway = 1 << (shift - 1);
                if (rem > halfway || (rem === halfway && (q & 1))) q += 1;   // ties-to-even
                h = (sign << 15) | q;
            }
        } else {
            let q = mant >>> 13;
            const rem = mant & 0x1fff;
            if (rem > 0x1000 || (rem === 0x1000 && (q & 1))) q += 1;         // ties-to-even
            if (q & 0x400) { q = 0; e += 1; }
            h = e >= 0x1f ? ((sign << 15) | 0x7c00) : ((sign << 15) | (e << 10) | (q & 0x3ff));
        }
    }
    return halfBitsToNumber(h);
}

function halfBitsToNumber(h) {
    const sign = (h & 0x8000) ? -1 : 1;
    const exp = (h >>> 10) & 0x1f;
    const mant = h & 0x3ff;
    if (exp === 0) return sign * Math.pow(2, -14) * (mant / 1024);
    if (exp === 0x1f) return mant ? NaN : sign * Infinity;
    return sign * Math.pow(2, exp - 15) * (1 + mant / 1024);
}

export function toFloat32(x) { return Math.fround(x); }

export function quantise(x, precision) {
    if (precision === "float16") return toFloat16(x);
    if (precision === "float32") return toFloat32(x);
    return x;                                   // "float64" -- the reference itself
}

// ---- the two sort metrics -----------------------------------------------------------------------------------
/** Z-depth in camera space -- what gaussianSplat.depthOrder uses, and what Spark uses with sortRadial:false. */
export function zDepthMetric(camPositions) { return camPositions.map((p) => p[2]); }
/** Radial distance from the viewpoint origin -- Spark's DEFAULT (sortRadial:true). A different quantity. */
export function radialMetric(camPositions) { return camPositions.map((p) => Math.hypot(p[0], p[1], p[2])); }

// ---- the answer key -----------------------------------------------------------------------------------------
/**
 * Pairs whose quantised metric COLLIDES, and are therefore free to order either way.
 * Returned as a Set of "i,j" with i<j so membership is O(1).
 */
export function freePairs(metric, precision) {
    const q = metric.map((m) => quantise(m, precision));
    const free = new Set();
    for (let i = 0; i < q.length; i++) {
        for (let j = i + 1; j < q.length; j++) {
            if (q[i] === q[j]) free.add(i + "," + j);
        }
    }
    return free;
}

/**
 * THE GRADE. Compare a candidate ordering against the float64 truth, excusing ONLY the pairs that the stated
 * precision genuinely cannot distinguish.
 *
 * @param {number[]} order    candidate ordering (indices, front-to-back)
 * @param {number[]} metric   the true float64 sort metric per splat
 * @param {string} precision  "float16" | "float32" | "float64"
 * @returns {{ok, checkedPairs, violations, freePairs, worstViolation}}
 */
export function gradeOrdering(order, metric, precision) {
    const n = metric.length;
    if (order.length !== n) return { ok: false, error: "ordering length " + order.length + " != " + n };
    const seen = new Set(order);
    if (seen.size !== n) return { ok: false, error: "ordering is not a permutation" };

    const free = freePairs(metric, precision);
    const rank = new Array(n);
    order.forEach((idx, r) => { rank[idx] = r; });

    let checked = 0, violations = 0, worst = 0;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (free.has(i + "," + j)) continue;          // genuinely indistinguishable at this precision
            checked++;
            const trueBefore = metric[i] < metric[j];
            const gotBefore = rank[i] < rank[j];
            if (trueBefore !== gotBefore) {
                violations++;
                worst = Math.max(worst, Math.abs(metric[i] - metric[j]));
            }
        }
    }
    return { ok: violations === 0, checkedPairs: checked, violations, freePairs: free.size, worstViolation: worst };
}

/** Kendall-tau-like agreement, reported alongside the grade for human reading. Not the pass criterion. */
export function pairAgreement(a, b) {
    const n = a.length;
    const ra = new Array(n), rb = new Array(n);
    a.forEach((x, i) => { ra[x] = i; });
    b.forEach((x, i) => { rb[x] = i; });
    let agree = 0, total = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        total++;
        if ((ra[i] < ra[j]) === (rb[i] < rb[j])) agree++;
    }
    return total ? agree / total : 1;
}

/** Sort by a metric, front-to-back, as the reference does. */
export function orderByMetric(metric) {
    return metric.map((m, i) => ({ m, i })).sort((p, q) => p.m - q.m).map((e) => e.i);
}

/**
 * What a sorter operating at reduced precision may legitimately produce: sort by the QUANTISED metric, breaking
 * ties arbitrarily. Used to show the key excuses exactly these and nothing more.
 */
export function orderAtPrecision(metric, precision, tieShuffleSeed = 1) {
    let s = tieShuffleSeed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    return metric.map((m, i) => ({ q: quantise(m, precision), r: rnd(), i }))
        .sort((a, b) => (a.q - b.q) || (a.r - b.r))
        .map((e) => e.i);
}
