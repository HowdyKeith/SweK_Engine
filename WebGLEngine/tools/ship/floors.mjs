// WebGLEngine/tools/ship/floors.mjs -- v2991
//
// WHICH OF THESE GREEN CHECKS CAN ACTUALLY FAIL?
//
// v2990 wired plantedError and used it on ONE tolerance -- fleetBench's 0.05, which I had picked by eye -- and
// found it catches a 1.28% error in tau with a 5.07x gain. The obvious next question was to sweep the physics
// suite the same way.
//
// IT CANNOT BE SWEPT, AND THAT IS THE FINDING. Measured: ZERO OF THE 38 SUITE CHECKS ACCEPT AN ARGUMENT. Every
// one is a closure -- run() with its grid size, its tau, its forcing all hard-coded inside -- so there is no
// knob to perturb from outside and no way to ask what any of them would catch. The tolerances are all still
// justified the circular way plantedError warned about, and NOT ONE of them can be characterised without being
// rewritten first.
//
// THAT IS WHY plantedError SAT UNUSED FOR A HUNDRED ROUNDS. It was not forgotten. Its subject was shaped so it
// could not be applied, and nothing said so -- which is a more interesting kind of orphan than the graveyard
// census was built to find.
//
// SO THIS FILE IS THE PATTERN THAT FIXES IT, not a sweep. A CHARACTERISABLE CHECK takes its physics knobs as
// data instead of burying them, and exposes them so an error of known size can be planted. One is demonstrated
// here against a real quantity; converting the rest is per-check work, and honest debt until it is done.
"use strict";
import { makeLBM } from "../../simulation/lbm/lbm2d.js";
import { makeThermal } from "../../simulation/lbm/thermal2d.js";
import { makeLBM3D } from "../../simulation/lbm/lbm3d.js";

import { pathToFileURL } from "node:url";
/**
 * The Poiseuille channel, with EVERY physics knob exposed. Compare against physicsSuite's version, which is the
 * same measurement with the same numbers welded shut.
 *
 * knobs: { tau, force, nx, ny, steps } -- any of them perturbable, so an error of known size can be planted in
 * whichever one a reader wants to ask about.
 */
export const POISEUILLE = {
    id: "lbm-parabola",
    tol: 0.005,                       // physicsSuite's own tolerance for "LBM channel is the exact parabola"
    // steps SIZED BY MEASUREMENT, not by eye -- AGAIN. My first value here was 3000 and the nominal residual
    // came out at 5.6e-2, ELEVEN TIMES the tolerance it is measured against: the check would have failed before
    // any error was planted, making every floor below it meaningless. Poiseuille converges on the diffusive
    // scale H^2/nu, which is 32^2/0.1 = 10,240 here. MEASURED: 3000 -> 5.6e-2 (fails), 8000 -> 1.1e-3 (passes),
    // 15000 -> 7.0e-4 (converged). This is the third time in this project an undersized LBM workload has looked
    // like a broken solver; the fix is always to compute H^2/nu first.
    nominal: { tau: 0.8, force: 1e-6, nx: 12, ny: 34, steps: 12000 },
    // KNOBS THAT ARE ACTUALLY KNOBS. I first declared ["tau", "force"] and force is VACUOUS: Stokes flow is
    // linear in the forcing, so the measured profile AND the analytic target scale together and the RELATIVE
    // residual is invariant. Measured: a 20% error in force moves the observable by EXACTLY 0.000000%.
    //
    // A detection floor on force would have reported BLIND AT EVERY EPSILON -- which reads as "this check is
    // useless" when the truth is "that knob is meaningless". tools/roundhouse/knobCandidates.mjs was written at
    // v2917 for exactly this class ("each would have produced a knob that LOOKED declarable and then quietly
    // poisoned a verdict"), and it had been sitting unwired ever since.
    knobs: ["tau"],
    vacuousKnobs: { force: "relative residual is invariant under forcing -- Stokes flow is linear in it, so target and measurement scale together. Measured 0.000000% movement at eps=0.20." },
    /** Relative L2 of the measured profile against the analytic parabola. Lower is better; the gate wants < tol. */
    measure(k = {}) {
        const c = { ...POISEUILLE.nominal, ...k };
        const lbm = makeLBM({ nx: c.nx, ny: c.ny, tau: c.tau, force: [c.force, 0] });
        for (let i = 0; i < c.steps; i++) lbm.step();
        // H = ny-2 and y = j-0.5: with bounce-back the effective wall sits HALFWAY between the last fluid node
        // and the solid one. Using ny-1 and integer y makes the residual plateau instead of converging, which
        // cost v2984 a round to find.
        const nu = (c.tau - 0.5) / 3, H = c.ny - 2, mid = Math.floor(c.nx / 2);
        let sum = 0, ref = 0;
        for (let j = 1; j <= H; j++) {
            const y = j - 0.5;
            const want = (c.force / (2 * nu)) * y * (H - y);
            const got = lbm.ux[lbm.idx(mid, j)];
            sum += (got - want) ** 2; ref += want * want;
        }
        return ref > 0 ? Math.sqrt(sum / ref) : Infinity;
    },
};

/** Perturb one knob by a relative amount and return the observable. This is what plantedError drives. */
export function perturbed(spec, knob, eps) {
    return spec.measure({ [knob]: spec.nominal[knob] * (1 + eps) });
}

/** How many suite checks expose a knob at all. The answer is the point. */
/**
 * *** THIS REPORTED `characterisable: 0` WHILE FOUR CONVERSIONS SAT IN THE REGISTRY BESIDE IT, AND NOTHING HAD
 * EVER COMPARED THE TWO NUMBERS. *** It counted CHECKS whose run() takes an argument, on the theory that an
 * argument is where a knob would arrive. ALL 38 HAVE ARITY ZERO -- measured -- so by its own definition NONE of
 * them could ever be converted, which is a capacity metric that says the line cannot exist while the line has
 * four entries. A SECOND DECLARATION NOBODY COMPARED, in the tool whose whole job is counting the work left.
 *
 * THE ARITY PROBE WAS MEASURING THE WRONG THING. A conversion is not "run() gained a parameter" -- it is a
 * HAND-WRITTEN SPEC (nominal config plus knobs PROVEN to move the observable, see POISEUILLE's note on `force`
 * being vacuous). Nothing about that is derivable from the CHECKS array: the knobs live in the physics, and
 * deciding which ones are real is the work itself.
 *
 * *** SO THE HONEST ANSWER IS THAT CHARACTERISABILITY CANNOT BE DERIVED, AND SAYING SO IS BETTER THAN A ZERO
 * THAT READS AS "NONE ARE POSSIBLE". *** What can be derived is the DENOMINATOR (how many checks exist) and the
 * NUMERATOR (how many specs are written). The gap between them is a to-do list nobody can size in advance,
 * because sizing it IS the conversion -- v3511's rule that a rate wants BOTH terms derived, arriving at a case
 * where one of them honestly cannot be.
 */
export async function characterisableCount() {
    const { CHECKS } = await import("./physicsSuite.mjs");
    const arity = CHECKS.map((c) => ((c.run || c.measure || (() => {})).length));
    return {
        total: CHECKS.length,
        converted: CONVERTED.length,
        // REPORTED, NOT ASSERTED: the old field is kept under a name that says what it actually measures, so
        // the misleading number cannot be quoted again as capacity.
        checksTakingAKnobArgument: arity.filter((n) => n > 0).length,
        note: "converted/total is the line's real progress. THERE IS NO DERIVABLE 'characterisable' FIGURE: a " +
              "conversion needs a hand-written spec whose knobs are PROVEN to move the observable, and deciding " +
              "which knobs are real is the work rather than a property of the check. The old field counted " +
              "run() arity, read ZERO for all " + CHECKS.length + ", and would have said the line was impossible.",
    };
}

// MEASURED at v2991 against POISEUILLE, planting the error in tau. Recorded so the gate can re-derive it rather
// than trust it.
export const MEASURED_V2991 = {
    id: "lbm-parabola", knob: "tau", tol: 0.005,
    note: "detection floor and gain are re-measured by the gate; see detectionFloor-selfcheck for the fleetBench twin",
};

/**
 * IS THIS KNOB A KNOB? A knob that does not move the observable cannot carry a planted error, and a floor
 * measured on one reports BLIND for a reason that has nothing to do with the check.
 *
 * This is the cheapest possible guard and it must run BEFORE any floor is trusted -- the sweep itself cannot
 * tell the two apart, because "the observable never moved" is exactly what a blind check looks like.
 */
export function knobMoves(spec, knob, eps = 0.2) {
    const base = spec.measure();
    const moved = spec.measure({ [knob]: spec.nominal[knob] * (1 + eps) });
    const rel = base !== 0 ? Math.abs(moved - base) / Math.abs(base) : Math.abs(moved);
    return { knob, eps, base, moved, relativeMovement: rel, isKnob: rel > 1e-9 };
}

// ---- SECOND CONVERSION: thermal conduction (v2995) ----------------------------------------------------------------
//
// physicsSuite's "thermal conduction is the exact straight line", same numbers, knobs exposed. Converting it
// produced THREE findings and the third undoes the first.
//
// 1. ELEVEN ORDERS OF MAGNITUDE OF HEADROOM. The nominal observable is 2.6e-14 against a tolerance of 5e-3.
//    That is not a tight check with a comfortable margin; it is a check whose measured quantity is at MACHINE
//    PRECISION while its bound sits eleven decades above. A tolerance chosen "where the measurement landed"
//    would have been 1e-13.
//
// 2. TWO VACUOUS KNOBS, AND THEY ARE VACUOUS AS A PAIR. Perturbing beta moves the observable by EXACTLY 0.000%.
//    So does gravity. Neither is broken: buoyancy enters as beta * gravity * T, and the check sets BOTH to zero
//    to disable convection -- so each is multiplied by the other, which is zero. knobCandidates.mjs has a
//    function literally named compensatedPairIsVacuous for this class, written at v2917 and unwired until v2992.
//
// 3. AND THE FLOOR IS NOT A FLOOR. The sweep on tauG reports 0.1% with a gain of 68x AND FLAGS ITSELF
//    NON-MONOTONE: a LARGER planted error slips through where a smaller one trips. "Detects >= 0.1%" is
//    therefore NOT a valid summary of this check -- there is no threshold above which it reliably notices.
//
//    The likely reason is that tauG does not change the steady state at all. Conduction between fixed-temperature
//    walls is linear REGARDLESS of diffusivity; tauG only changes how fast it gets there. So the check's apparent
//    sensitivity is a CONVERGENCE artifact at 12,000 steps, not a statement about the physics it names -- which
//    is exactly the kind of thing a planted error is for, and exactly what a green tick never says.
export const THERMAL_LINE = {
    id: "thermal-linear",
    tol: 5e-3,
    nominal: { nx: 8, ny: 34, tau: 0.8, tauG: 0.8, gravity: 0, beta: 0, steps: 12000 },
    knobs: ["tauG"],
    vacuousKnobs: {
        beta: "buoyancy enters as beta*gravity*T and gravity is 0 here, so beta is multiplied by zero. Measured 0.000% movement.",
        gravity: "the same pair from the other side: beta is 0, so gravity is multiplied by zero. Measured 0.000% movement.",
    },
    nonMonotone: true,
    note: "the tauG sweep flags itself NON-MONOTONE, so no single detection floor summarises this check",
    measure(k = {}) {
        const c = { ...THERMAL_LINE.nominal, ...k };
        const cell = makeThermal({ nx: c.nx, ny: c.ny, tau: c.tau, tauG: c.tauG, gravity: c.gravity, beta: c.beta });
        for (let s = 0; s < c.steps; s++) cell.step();
        let worst = 0; const H = c.ny - 2;
        for (let j = 1; j <= H; j++) worst = Math.max(worst, Math.abs(cell.T[cell.idx(4, j)] - (0.5 - (j - 0.5) / H)));
        return worst;
    },
};

// ---- THIRD CONVERSION: the speed of sound (v2996) -----------------------------------------------------------------
//
// This one was ALREADY CHARACTERISED, informally, years of rounds before plantedError.mjs existed. Its comment in
// physicsSuite reads:
//
//     "The real lattice measures 0.005% off. A 3% tolerance was not guarding anything -- a deliberate 0.7% error
//      in CS2 sailed straight through it. Tolerances should be set by the precision actually achieved, not by
//      what feels safe, or the check is theatre. 0.2% keeps a 40x margin over the true result and still catches
//      that."
//
// Someone planted an error, watched it pass, and tightened the bound. That is exactly the method -- arrived at by
// hand, recorded in prose, and never re-run since. So the question here is not "what does this catch?" but
// "IS THE RECORDED REASONING STILL TRUE?" -- which is the v2887 rule (a key must be true, not merely present)
// applied to a tolerance's justification rather than to a claim.
//
// The knob is CS2 itself, which makes this the odd case of the three: not a physical parameter but a LATTICE
// CONSTANT. Perturbing it is perturbing the arithmetic the whole solver is built on.
export const SOUND_SPEED = {
    id: "lbm-sound-speed",
    tol: 0.002,
    nominal: { nx: 500, ny: 6, tau: 0.9, x0: 250, steps: 240, settleAfter: 96 },
    knobs: ["cs2"],
    recordedClaim: { tolWas: 0.03, plantedError: 0.007, outcome: "sailed straight through", tolNow: 0.002,
                     source: "physicsSuite comment on the speed-of-sound check" },
    /**
     * Measure cs from a travelling density pulse, and compare against 1/sqrt(3). The cs2 knob scales the
     * COMPARISON TARGET, which is how a wrong lattice constant would present: the lattice still does what it
     * does, and the number it is graded against moves.
     */
    measure({ cs2 = 1 / 3 } = {}) {
        const c = SOUND_SPEED.nominal;
        const lbm = makeLBM({ nx: c.nx, ny: c.ny, tau: c.tau, channel: false, periodicY: true,
            init: (x) => ({ rho: 1 + 1e-3 * Math.exp(-(((x - c.x0) / 10) ** 2)), ux: 0, uy: 0 }) });
        const tr = [];
        for (let s = 1; s <= c.steps; s++) {
            lbm.step();
            let best = -1, bx = 0;
            for (let x = c.x0 + 4; x < Math.min(c.nx - 3, c.x0 + 210); x++) {
                const r = lbm.rho[lbm.idx(x, 3)];
                if (r > best) { best = r; bx = x; }
            }
            tr.push({ t: s, x: bx });
        }
        const f = tr.filter((p) => p.t > c.settleAfter);
        let n = 0, st = 0, sx = 0, stt = 0, stx = 0;
        for (const p of f) { n++; st += p.t; sx += p.x; stt += p.t * p.t; stx += p.t * p.x; }
        const slope = (n * stx - st * sx) / (n * stt - st * st);      // measured cs, in lattice units per step
        const want = Math.sqrt(cs2);
        return Math.abs(slope - want) / want;                          // relative error against the target
    },
};

// ---- FOURTH CONVERSION: thermal diffusivity from tauG (v3031) --------------------------------------------------------
//
// The MIRROR of THERMAL_LINE, and that is why it was worth doing next. In the conduction check tauG turned out
// to be a CONVERGENCE ARTIFACT -- the steady linear profile is independent of diffusivity, so tauG only changed
// how fast it got there. HERE THE DIFFUSIVITY IS THE MEASUREMENT: a sinusoidal temperature field decays at a
// rate set by alpha, and alpha = cs^2 (tauG - 0.5) exactly. Same knob, opposite role.
//
// AND THE PREDICTION WORTH TESTING: tau (the FLOW relaxation) should be VACUOUS here. gravity and beta are both
// zero, so nothing advects; the temperature field decays by pure diffusion and the momentum solver is along for
// the ride. If tau moves the answer, something is coupling that should not be.
export const THERMAL_DIFFUSIVITY = {
    id: "thermal-alpha",
    tol: 0.03,
    nominal: { nx: 32, ny: 16, tau: 0.9, tauG: 0.8, steps: 400, fitFrom: 120, fitTo: 380 },
    knobs: ["tauG"],
    /** Relative error of the MEASURED decay rate against alpha = cs^2 (tauG - 0.5). */
    measure(k = {}) {
        const c = { ...THERMAL_DIFFUSIVITY.nominal, ...k };
        const kw = 2 * Math.PI / c.nx;
        const m = makeThermal({ nx: c.nx, ny: c.ny, tau: c.tau, tauG: c.tauG, gravity: 0, beta: 0,
                                walls: false, periodicY: true, init: (x) => ({ T: 0.01 * Math.sin(kw * x) }) });
        const amp = [];
        for (let s = 0; s < c.steps; s++) {
            m.step();
            let a = 0;
            for (let x = 0; x < c.nx; x++) a += Math.abs(m.T[m.idx(x, Math.floor(c.ny / 2))]);
            amp.push(a);
        }
        // log-amplitude slope over the settled window -> decay rate -> alpha
        let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (let i = c.fitFrom; i < c.fitTo; i++) {
            const y = Math.log(amp[i]);
            if (!Number.isFinite(y)) continue;
            n++; sx += i; sy += y; sxx += i * i; sxy += i * y;
        }
        if (n < 10) return Infinity;
        const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
        const alphaMeasured = -slope / (kw * kw);
        const alphaExact = (1 / 3) * (c.tauG - 0.5);
        return Math.abs(alphaMeasured - alphaExact) / Math.abs(alphaExact);
    },
};

// ---- THE REGISTRY (v3032) --------------------------------------------------------------------------------------------
//
// Keith agreed to characterise all 38. THAT IS NOT A ROUND, IT IS A PRODUCTION LINE -- and a production line
// needs two things a one-off conversion does not: somewhere to record what is DONE, and a way to make the next
// one cheap. Four rounds of scaffolding are now paid for; from here a conversion is one entry.
//
// AND THE COUNT MUST BE DERIVED, NOT TYPED. v2976 built staleness.mjs after three hand-written numbers rotted,
// and v2999 found three more of exactly the same kind. A registry declaring "4 of 38" in a comment would be the
// seventh. So the covered count is the registry's own length and the total is read from physicsSuite at run
// time -- neither is a number anyone maintains.

/** What each conversion learned, so a reader need not re-run a sweep to know the shape. */
export const FINDINGS_V3032 = {
    "lbm-parabola":    { floor: 0.0016, gain: 5.24, monotone: true,  note: "clean floor; my first nominal was 11x its own tolerance and would have failed before any error was planted" },
    "thermal-linear":  { floor: null,   gain: 68,   monotone: false, note: "NON-MONOTONE -- no floor summarises it. tauG is a convergence artifact here, and beta/gravity are a COMPENSATED PAIR, each vacuous because the other is zero" },
    "lbm-sound-speed": { floor: null,   gain: 0.50, monotone: true,  note: "ATTENUATES. Its prose justification from an earlier round verified exactly: a 0.7% CS2 error shows as 0.35%, caught by 0.2% and sailing through the old 3%" },
    "thermal-alpha":   { floor: 0.016,  gain: 3.06, monotone: true,  note: "the MIRROR of thermal-linear: same knob, opposite role. tau predicted vacuous and measured at exactly 0.0000%" },
    // v3537 -- FIFTH CONVERSION. Floor and gain are RE-MEASURED by the gate rather than trusted from here.
    "lbm-pipe3d":      { floor: null,   gain: null, monotone: null,  note: "the 3D twin of lbm-parabola, chosen because its 2D partner is already characterised and its tolerance is TEN TIMES looser (0.05 against 0.005) with nothing ever having said whether that room buys anything. Nominal residual 2.978e-2 sits at 60% of its own tolerance -- valid, and far tighter than the 2D case was before v2984 resized it. tau is LIVE at 0.139; force is VACUOUS at 2.995e-9 and NEARLY PASSED THE VACUITY GUARD" },
};

/**
 * FIFTH CONVERSION -- the 3D pipe, and it is chosen BECAUSE its 2D twin is already characterised.
 *
 * physicsSuite's "3D pipe is Hagen-Poiseuille's paraboloid" carries a tolerance of 0.05, TEN TIMES looser than
 * the 2D channel's 0.005, and nothing has ever said whether that extra room buys anything or hides something.
 * The line's whole finding is that A TOLERANCE'S NUMBER SAYS NOTHING ABOUT WHAT IT CATCHES -- so a pair that
 * differ ONLY in dimensionality and tolerance is the sharpest available test of that claim.
 *
 * THE KNOB PREDICTION IS INHERITED AND MUST STILL BE MEASURED: POISEUILLE found tau LIVE and force VACUOUS,
 * because Stokes flow is LINEAR IN THE FORCING so the measured profile and the analytic target scale together
 * and the RELATIVE residual is invariant. The same argument applies in 3D -- but v2917's rule is that a knob
 * that looks declarable and is not QUIETLY POISONS A VERDICT, so `force` is declared vacuous only after
 * knobMoves() reads zero, never on the strength of the 2D result.
 *
 * STEPS SIZED BY THE DIFFUSIVE SCALE, not copied: convergence goes as H^2/nu, and here H = 2R = 12 with
 * nu = (tau-0.5)/3 = 0.1, so H^2/nu = 1440. The suite's 3000 clears it -- unlike the 2D case, where the same
 * 3000 was ELEVEN TIMES its own tolerance and had to become 12000. THE NUMBER THAT LOOKS COPIED IS NOT.
 */
export const PIPE3D = {
    id: "lbm-pipe3d",
    tol: 0.05,                        // physicsSuite's own tolerance for this check
    nominal: { tau: 0.8, force: 2e-6, R: 6, steps: 3000 },
    knobs: ["tau"],
    // *** AND CONFIRMING IT EXPOSED A HOLE IN THE GUARD ITSELF. *** knobMoves declares `isKnob: rel > 1e-9`.
    // In 2D, force moved the observable by EXACTLY 0.000000%, so that threshold was never tested. In 3D the
    // least-squares fit carries enough round-off that force moves by 2.995e-9 -- WHICH CLEARS THE GUARD BY A
    // FACTOR OF THREE. The vacuity check would have called a dead knob live, on float dust, in the very place
    // v2917 built it to prevent exactly that.
    //
    // THE DISCRIMINATOR IS NOT AN ABSOLUTE FLOOR, IT IS THE COMPARISON: tau moves 0.139 and force moves
    // 2.995e-9 -- SEVEN ORDERS APART. A knob six-plus orders below the liveliest knob on the same spec cannot
    // carry a detectable planted error whatever the tolerance is, and that ratio needs no chosen constant.
    // NOT CHANGED HERE: raising isKnob's threshold would re-verdict four shipped specs, which is a battery
    // change and wants its own round (v3132's rule). RECORDED WITH THE NUMBER SO IT CANNOT BE MISSED AGAIN.
    vacuousKnobs: { force: "MEASURED at 2.995e-9 relative movement against tau's 0.139 -- SEVEN ORDERS apart. " +
                           "Predicted vacuous by the 2D twin's argument (Stokes flow is linear in the forcing, " +
                           "so profile and analytic target scale together and the RELATIVE residual is " +
                           "invariant) and confirmed by measurement, never inherited. NOTE: knobMoves' " +
                           "isKnob threshold of 1e-9 CALLS THIS LIVE -- it clears it 3x on round-off" },
    measure(k = {}) {
        const c = { ...PIPE3D.nominal, ...k };
        const R = c.R, N = 2 * R + 6, ctr = (N - 1) / 2;
        const m = makeLBM3D({ nx: N, ny: N, nz: 4, tau: c.tau, force: [0, 0, c.force],
                              solidAt: (x, y) => Math.hypot(x - ctr, y - ctr) > R });
        for (let s = 0; s < c.steps; s++) m.step();
        // Fit u against r^2 and compare the SLOPE to the closed form -A = -F/(4 nu). The suite fits the same
        // way; matching it matters because a floor measured on a DIFFERENT statistic would characterise a check
        // nobody runs.
        const nu = (c.tau - 0.5) / 3;
        let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const k2 = m.idx(x, y, 2); if (m.solid[k2]) continue;
            const r2 = (x - ctr) ** 2 + (y - ctr) ** 2, u = m.uz[k2];
            n++; sx += r2; sy += u; sxx += r2 * r2; sxy += r2 * u;
        }
        const den = n * sxx - sx * sx;
        if (!(n > 2) || den === 0) return Infinity;
        const slope = (n * sxy - sx * sy) / den;
        const want = -c.force / (4 * nu);
        return Math.abs((slope - want) / want);
    },
};

// v3537 -- THIS LINE MOVED DOWN HERE BECAUSE IT WAS ABOVE PIPE3D AND `const` DOES NOT HOIST: the registry
// referenced a spec declared later and every import of this module threw on the temporal dead zone.
// v3421 lost a round to exactly that, and v3455 caught a const that WORKED only because async timing
// closed the TDZ before anything read it. A REGISTRY BELONGS BELOW WHAT IT REGISTERS.
export const CONVERTED = [POISEUILLE, THERMAL_LINE, SOUND_SPEED, THERMAL_DIFFUSIVITY, PIPE3D];

/** Coverage, derived from the tree rather than declared. */
export async function coverage() {
    const { CHECKS } = await import("./physicsSuite.mjs");
    const total = CHECKS.length;
    const done = CONVERTED.length;
    const gains = Object.values(FINDINGS_V3032).map((f) => f.gain).filter((g) => typeof g === "number");
    const spread = gains.length ? Math.max(...gains) / Math.min(...gains) : null;
    const floorless = Object.values(FINDINGS_V3032).filter((f) => f.monotone === false).length;
    return {
        total, done, remaining: total - done, fraction: done / total,
        gainSpread: spread, floorless,
        note: done + " of " + total + " characterised. Gain across them spans " +
              (spread ? spread.toFixed(0) + "x" : "n/a") + ", and " + floorless +
              " cannot be summarised by a floor at all -- which is why the remaining ones cannot be assumed.",
    };
}

/**
 * THE FRONT DOOR. `node tools/ship/floors.mjs` PRINTED NOTHING AND EXITED ZERO until v3537 -- the v3201 shape,
 * where AN EMPTY REPORT AND A TOOL THAT NEVER RAN ARE INDISTINGUISHABLE and exit 0 with no output reads as a
 * clean bill. It had no main block and its only caller was its own gate, so every number below was computed and
 * thrown away on every run.
 *
 * A REPORTING TOOL MUST PRINT AND EXIT ZERO; the gate beside it is what exits nonzero (v3327).
 */
export async function reportLines() {
    const cov = await coverage();
    const cc = await characterisableCount();
    const L = ["[floors] the tolerance production line -- what each tolerance actually catches"];
    L.push("  " + cov.done + " of " + cov.total + " checks characterised" +
           (cov.gainSpread ? "; gain spans " + cov.gainSpread.toFixed(0) + "x across them" : ""));
    L.push("");
    for (const [id, f] of Object.entries(FINDINGS_V3032)) {
        const floor = f.floor === null ? "NO FLOOR" : "floor " + f.floor;
        L.push("  " + id.padEnd(18) + floor.padEnd(12) + "gain " + String(f.gain).padEnd(6) +
               (f.monotone === false ? "NON-MONOTONE" : "monotone"));
        if (f.note) L.push("      " + String(f.note).slice(0, 150));
    }
    L.push("");
    L.push("  *** A TOLERANCE'S NUMBER SAYS NOTHING ABOUT WHAT IT CATCHES. Gain spans " +
           (cov.gainSpread ? cov.gainSpread.toFixed(0) + "x" : "n/a") + " across " + cov.done +
           " samples -- from one that ATTENUATES a planted error to one that amplifies it 68-fold -- and " +
           cov.floorless + " of them cannot be summarised by a floor AT ALL. ***");
    L.push("");
    L.push("  REMAINING: " + (cov.total - cov.done) + ". THERE IS NO DERIVABLE 'how many are characterisable'");
    L.push("  figure and v3536 removed the one that claimed to be: " + cc.checksTakingAKnobArgument +
           " of " + cc.total + " checks take a knob argument, because the physics is welded into a");
    L.push("  zero-argument closure. A conversion is a HAND-WRITTEN SPEC whose knobs are PROVEN to move the");
    L.push("  observable, and SIZING THE REMAINDER IS THE CONVERSION.");
    return L;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    for (const l of await reportLines()) console.log(l);
    process.exit(0);
}
