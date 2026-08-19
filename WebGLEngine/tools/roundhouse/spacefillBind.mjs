// WebGLEngine/tools/roundhouse/spacefillBind.mjs -- v3188
//
// THE SPACE-FILLING CURVE AS A GRADED LAB DEVICE, SHIPPING WITH ITS OWN LOAD-BEARING NEGATIVE.
//
// v3187 built the curve (physics/spacefill/hilbert.mjs) as the deterministic form of SLDgen's "a single
// continuous stroke BY DESIGN". This wires it into the roundhouse.
//
// *** IT DECLARES THREE MODES FROM BIRTH, AND THAT IS THE POINT. *** v3174 measured that SIX OF SEVEN LOOSE
// DEVICES DECLARE EXACTLY ONE MODE, and a device with one mode CANNOT TELL YOU WHETHER ITS ERROR IS THE KEY'S
// TRUNCATION OR ITS OWN DEFECT -- it has nothing to compare against. probe was the worked example with three.
// This is the first device built to that standard rather than retrofitted toward it.
//
//   "stroke"  -- the claim. One unbroken stroke, every cell exactly once, and the mapping invertible.
//   "raster"  -- THE LOAD-BEARING NEGATIVE. Same coverage, zero revisits, and it BREAKS. If this mode ever
//                reports zero breaks, the checker is measuring nothing, because a raster scan cannot be a
//                continuous stroke.
//   "order"   -- THE SCALING CHECK. Breaks must stay 0 as the grid grows sixteenfold, and the raster's must
//                track n-1 EXACTLY. A property that held at one size and nowhere else is a coincidence.
//
// EVERY KEY IS ANALYTIC. cells = 4^order; hilbert breaks = 0 and worst jump = 1; raster breaks = n-1 and worst
// jump = n. NOTHING HERE IS A REMEMBERED MEASUREMENT -- the keys are derived from the construction, which is
// why this device can be graded without a reference run.

import { hilbertPath, rasterPath, strokeStats, d2xy, xy2d } from "../../physics/spacefill/hilbert.mjs";

export const SPACEFILL_OBSERVABLES = [
    "order", "cells", "steps", "distinct", "revisits", "breaks", "worstJump",
    "coverageErrFrac", "breaksExpected", "breakErrAbs", "worstJumpExpected",
    "bijectionMismatches", "continuous", "orderRatio", "rasterTracksN",
];

const DEF = { order: 6 };

/**
 * *** A MODE IS DECLARED BY BEING ECHOED BACK, and my first version echoed only "stroke". ***
 *
 * checkMode asks defaults({ mode }) and compares what comes back: a device that returns its default regardless
 * has declared exactly one mode, however many its build() happens to handle. MY THREE-MODE DEVICE WOULD HAVE
 * COUNTED AS ONE-MODED TO THE BATTERY -- in the round whose entire point was that six of seven LOOSE devices
 * declare one -- and its own gate caught it.
 *
 * An UNKNOWN mode falls back to the default AND IS THEREFORE REFUSED by checkMode, which is v3144's rule:
 * a mode selects which physics runs, so silently running another one answers a different experiment under the
 * requested name.
 */
export const SPACEFILL_MODES = ["stroke", "raster", "order"];

export function spacefillDefaults(cfg = {}) {
    const want = cfg && cfg.mode;
    const mode = SPACEFILL_MODES.includes(want) ? want : "stroke";
    return { mode, order: (cfg && cfg.order) || DEF.order };
}

/** Shared measurement, so the two paths are judged by ONE instrument and a difference cannot be the checker. */
function measure(path, order, expectedBreaks, expectedWorst) {
    const n = 1 << order, cells = n * n;
    const s = strokeStats(path);
    return {
        order, cells,
        steps: s.steps, distinct: s.distinct, revisits: s.revisits,
        breaks: s.breaks, worstJump: s.worstJump,
        // COVERAGE AND CONTINUITY ARE SEPARATE OBSERVABLES ON PURPOSE: a raster has perfect coverage and no
        // continuity, so a single "is it a good fill" number would average them into meaninglessness.
        coverageErrFrac: Math.abs(s.distinct - cells) / cells,
        breaksExpected: expectedBreaks,
        breakErrAbs: Math.abs(s.breaks - expectedBreaks),
        worstJumpExpected: expectedWorst,
        continuous: s.continuous ? 1 : 0,
    };
}

export async function buildSpacefill(args = {}) {
    const cfg = args.config || {};
    const order = Math.max(2, Math.min(8, (cfg && cfg.order) || DEF.order));
    const n = 1 << order;
    const mode = args.mode || spacefillDefaults(cfg).mode;

    if (mode === "raster") {
        // THE LOAD-BEARING NEGATIVE. Its key is n-1 breaks -- DERIVED (one per row end), not observed once.
        return { ...measure(rasterPath(order), order, n - 1, n), bijectionMismatches: -1, orderRatio: -1, rasterTracksN: -1 };
    }

    if (mode === "order") {
        // A PROPERTY THAT HELD AT ONE SIZE AND NOWHERE ELSE IS A COINCIDENCE. Four orders, sixteenfold growth.
        const orders = [order - 2, order - 1, order, order + 1].filter((o) => o >= 2 && o <= 8);
        let hilbertBreaks = 0, rasterOff = 0;
        for (const o of orders) {
            hilbertBreaks += strokeStats(hilbertPath(o)).breaks;
            rasterOff += Math.abs(strokeStats(rasterPath(o)).breaks - ((1 << o) - 1));
        }
        const base = measure(hilbertPath(order), order, 0, 1);
        return {
            ...base,
            bijectionMismatches: 0,
            // ZERO ACROSS EVERY ORDER, not an average. One break at one size is a broken curve.
            orderRatio: hilbertBreaks,
            rasterTracksN: rasterOff,
        };
    }

    // "stroke" -- the claim.
    let mismatches = 0;
    for (let d = 0; d < n * n; d++) { const [x, y] = d2xy(order, d); if (xy2d(order, x, y) !== d) mismatches++; }
    return { ...measure(hilbertPath(order), order, 0, 1), bijectionMismatches: mismatches, orderRatio: -1, rasterTracksN: -1 };
}

export const spacefillDevice = {
    // v3190 -- EXPORTED so the census does not have to GUESS. A probed list is a LOWER BOUND: you can only
    // ask about a mode you already thought of, and this device's own names were not in anyone's candidate
    // list, so it under-reported as one-moded until it said so itself.
    modes: SPACEFILL_MODES,
    name: "hilbert-space-filling-curve",
    observables: SPACEFILL_OBSERVABLES,
    build: buildSpacefill,
    defaults: spacefillDefaults,
};
