// physics/em/absorbing.mjs
//
// WHAT A 1D FDTD DOES AT ITS EDGES, AND AT THE CELL YOU DRIVE -- both graded against EXACT numbers.
//
// Prompted by reading ron0studios/WAVELET (MIT, hackathon, no test in it). Nothing is vendored and no claim about
// their code is made; what travelled is ONE SENTENCE from the critique of it -- that a hackathon EM sim usually
// ignores what happens when a wave reaches the edge of the grid, and that hard versus soft source injection is a
// real distinction. Both of those turn out to have EXACT answers, which is the only reason they are here.
//
// *** AND THE FIRST THING THIS FOUND IS A DEFECT IN MY OWN v3628 FIXTURE. physics/em/skinDepth.mjs's lossyFdtd1d
// drives its edge with `E[0] = sin(omega n dt)` -- AN ASSIGNMENT, which is a HARD source. A hard source does not
// merely inject: it OVERWRITES the cell every step, so anything arriving back at it is annihilated and replaced.
// Its reflection coefficient is EXACTLY -1. v3628 reported an unexplained measurement floor in its section 5 and
// said so plainly; a hard source was the obvious suspect, and this file is what was needed to test it. ***
//
// THE TWO EXACT KEYS, AND NEITHER IS A TOLERANCE:
//
//   SOURCE     a HARD source (E[i] = f(t)) reflects with coefficient exactly -1: |r| = 1.
//              a SOFT source (E[i] += f(t)) is TRANSPARENT: the cell takes the ordinary update as well, so a
//              returning wave passes through it unchanged and |r| = 0.
//
//   MUR-1      E0^{n+1} = E1^n + ((c dt - dx)/(c dt + dx)) (E1^{n+1} - E0^n)
//              *** AT THE MAGIC COURANT NUMBER S = c dt / dx = 1 THE COEFFICIENT IS EXACTLY ZERO and the update
//              collapses to E0^{n+1} = E1^n -- which is EXACTLY what the 1D scheme does at S = 1, one cell per
//              step. SO MUR IS PERFECT THERE, TO ROUND-OFF, AND FOR THE SAME REASON THE SCHEME ITSELF IS: the
//              discrete and continuous propagators coincide. That is not a coincidence to be noted, it is the
//              SAME FACT tools/roundhouse/fdtd-selfcheck.mjs already grades as the magic time step, arriving at
//              the boundary. Two keys that corroborate beat two keys that each stand alone. ***
//              Below S = 1 the scheme is dispersive, one ABC coefficient cannot match every frequency at once,
//              and the residual reflection GROWS. That direction is predicted; its size is measured.
//
// HOW REFLECTION IS MEASURED, AND IT NEEDS NO SEPARATION LOGIC. Run the same pulse twice: once in the domain
// under test, once in a domain long enough that no boundary is ever reached. The DIFFERENCE between them is
// everything the boundary did, and nothing else. No windowing, no peak-finding, no arrival-time arithmetic --
// which is what makes the answer a measurement rather than a fit.
//
// BROWSER-SAFE: no imports, no DOM, no node builtins.

/**
 * A 1D Yee FDTD in normalised units (eps = mu = 1, so c = 1 and dx = 1, dt = S).
 *   left / right : "pec" (hard wall, E forced to 0) or "mur" (first-order absorbing)
 *   sourceMode   : "none" | "hard" (assignment) | "soft" (accumulation)
 */
export function run1d({
    N = 400, S = 1, steps = 600, left = "pec", right = "pec",
    sourceMode = "none", sourceCell = 20, sourceFn = null,
    pulseAt = null, pulseWidth = 12, probeCell = null,
} = {}) {
    const E = new Float64Array(N), H = new Float64Array(N);
    if (pulseAt !== null) {
        for (let i = 0; i < N; i++) E[i] = Math.exp(-Math.pow((i - pulseAt) / pulseWidth, 2));
    }
    const murCoef = (S - 1) / (S + 1);                 // (c dt - dx)/(c dt + dx) with c = dx = 1, dt = S
    const trace = probeCell === null ? null : new Float64Array(steps);
    let eOldL = E[0], eOldR = E[N - 1];
    for (let n = 0; n < steps; n++) {
        const e1Old = E[1], eN2Old = E[N - 2];
        for (let i = 0; i < N - 1; i++) H[i] -= S * (E[i + 1] - E[i]);
        for (let i = 1; i < N - 1; i++) E[i] -= S * (H[i] - H[i - 1]);
        // --- boundaries. PEC is the default an unfinished simulation has whether it meant to or not.
        if (left === "mur") E[0] = e1Old + murCoef * (E[1] - eOldL); else E[0] = 0;
        if (right === "mur") E[N - 1] = eN2Old + murCoef * (E[N - 2] - eOldR); else E[N - 1] = 0;
        eOldL = E[0]; eOldR = E[N - 1];
        // --- the source, AFTER the update, which is what makes hard and soft differ at all
        if (sourceMode !== "none" && sourceFn) {
            const v = sourceFn(n);
            if (sourceMode === "hard") E[sourceCell] = v;   // ASSIGN: overwrites whatever arrived
            else E[sourceCell] += v;                        // ACCUMULATE: transparent to what arrived
        }
        if (trace) trace[n] = E[probeCell];
    }
    return { E, H, trace, murCoef };
}

/**
 * Everything the boundary (or the source cell) did, and nothing else: the same run in a domain long enough that
 * no edge is ever reached, subtracted from the run under test.
 */
export function reflectionOf({ N = 400, S = 1, steps = 600, left = "pec", right = "pec",
    sourceMode = "none", sourceCell = 20, sourceFn = null, pulseAt = 200, pulseWidth = 12, probeCell = 200,
    refSourceMode = null } = {}) {
    const test = run1d({ N, S, steps, left, right, sourceMode, sourceCell, sourceFn, pulseAt, pulseWidth, probeCell });
    // The reference domain is padded by more than the distance light travels in the run, so its edges are unreachable.
    const pad = Math.ceil(steps * S) + 40;
    // *** THE REFERENCE MUST NOT CARRY THE THING UNDER TEST, AND MY FIRST VERSION DID. It ran with the SAME
    // sourceMode, so a hard source annihilated the wave in BOTH runs and the difference cancelled to exactly
    // 0.000000 -- a check that could not fail, reported as a pass. refSourceMode defaults to sourceMode (right
    // for a boundary test, where the source is incidental) and is set to "none" when THE SOURCE is the subject.
    const ref = run1d({ N: N + 2 * pad, S, steps, left: "pec", right: "pec",
        sourceMode: refSourceMode === null ? sourceMode : refSourceMode, sourceCell: sourceCell + pad,
        sourceFn, pulseAt: pulseAt + pad, pulseWidth, probeCell: probeCell + pad });
    let diff = 0, inc = 0;
    for (let n = 0; n < steps; n++) {
        const d = Math.abs(test.trace[n] - ref.trace[n]);
        if (d > diff) diff = d;
        const a = Math.abs(ref.trace[n]);
        if (a > inc) inc = a;
    }
    return { reflected: diff, incident: inc, coefficient: diff / Math.max(inc, 1e-300), murCoef: test.murCoef };
}

/**
 * The two source kinds: is the driven cell transparent to a wave arriving at it?
 *
 * NORMALISATION MATTERS AND IT IS DERIVED, NOT CHOSEN. A Gaussian dropped into E alone SPLITS into two
 * half-amplitude pulses, so the wave that actually reaches the source cell is HALF the initial peak -- and
 * dividing the reflected peak by the initial peak would report 0.5 for a perfect reflector. The incident
 * amplitude is therefore MEASURED AT THE SOURCE CELL in the reference run rather than assumed. At S = 1 the 1D
 * scheme is exact and the pulse keeps its shape, so this ratio is clean; below S = 1 dispersion spreads it and
 * the number stops meaning one thing, which is why this is measured at the magic step.
 */
export function sourceTransparency({ mode = "hard", S = 1, N = 400, steps = 520 } = {}) {
    // A silent source: the cell is driven with zero, so the ONLY thing under test is whether the update rule at
    // that cell destroys an arriving wave. A non-zero drive would add its own field and confuse the two.
    const r = reflectionOf({ N, S, steps, left: "mur", right: "mur", sourceMode: mode, sourceCell: 60,
        sourceFn: () => 0, pulseAt: 200, probeCell: 200, refSourceMode: "none" });
    // the amplitude that ARRIVES at the source cell, read off the reference run
    const pad = Math.ceil(steps * S) + 40;
    const at = run1d({ N: N + 2 * pad, S, steps, left: "pec", right: "pec", pulseAt: 200 + pad,
        probeCell: 60 + pad });
    let incidentAtCell = 0;
    for (let n = 0; n < steps; n++) incidentAtCell = Math.max(incidentAtCell, Math.abs(at.trace[n]));
    return { ...r, incidentAtCell, r: r.reflected / Math.max(incidentAtCell, 1e-300) };
}
