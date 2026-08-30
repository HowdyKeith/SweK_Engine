// WebGLEngine/tools/roundhouse/whiteDwarfBind.mjs -- v3422
// ---------------------------------------------------------------------------------------------------------------
// THE WHITE DWARF AS A LAB DEVICE, AND THE REASON IT IS A DEVICE RATHER THAN A MODE.
//
// v3420 and v3421 bound seven modules by making them MODES on a host that shared their substrate. whiteDwarf has
// no such host and it was left alone twice for that reason: hydrostatic is SPH columns, diffusion is MD
// self-diffusion, and the blackhole device is a Paczynski-Wiita potential. *** PUTTING IT ON A TOPICALLY
// ADJACENT DEVICE WOULD BE THE UNVERIFIABLE-ROW MISTAKE IN A NEW DRESS -- the thing deviceInstrumentMap talked
// me out of with heidler. A centrifuge and a white dwarf both feature enormous accelerations and share not one
// line of substrate; the analogy is real and it is not a host. *** So it gets its own registry row.
//
// WHAT THE MODULE'S OWN GATE ALREADY CLAIMS, AND THEREFORE WHAT THIS MUST NOT REPEAT: the Chandrasekhar limit
// near 1.44, that a heavier dwarf is smaller, that the radii match documented values (8724 km at 0.6 solar
// masses, 5548 at 1.0), that the radius collapses at the limit, that accretion detonates, and determinism. All
// of those are VALUES or DIRECTIONS. A LAB DEVICE NEEDS A KEY THE MODULE DOES NOT COMPUTE FOR ITSELF, so every
// mode below recovers an EXPONENT or an INVARIANCE instead -- none of which appears anywhere in that gate.
//
// *** THE TWO EXPONENTS ARE THE HEART OF IT, AND THEY LIVE IN DIFFERENT REGIMES OF ONE FORMULA. *** R/R_sun =
// k M^(-1/3) sqrt(1 - (M/M_ch)^(4/3)) is a product of two factors. Far below the limit the second factor is
// ~1 and the slope of log R against log M approaches -1/3; right at the limit the first factor is nearly
// constant and R falls as (M_ch - M)^(1/2). SO AN ERROR IN EITHER FACTOR IS INVISIBLE TO THE OTHER EXPONENT,
// and only asking both questions grades the whole formula. Neither is a number this file supplies: both are
// recovered by regression from radii the module produced.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { chandrasekharMass, radiusSolar, radiusKm, isStable, accreteToLimit, R_SUN_KM } from "../../physics/whiteDwarf.js";

export const WD_MODES = ["exponent", "limitOrder", "muScaling", "accretion"];

const DEF = { mu_e: 2, window: 0.01, eps: 1e-5, points: 8, M0: 1.2, dM: 1e-3 };

export const WD_OBSERVABLES = [
    "slopeMeasured", "slopeTheory", "slopeErrAbs", "r2", "window", "converging",
    "limitSlope", "limitSlopeTheory", "limitSlopeErrAbs", "limitR2", "eps",
    "muSlope", "muSlopeTheory", "muSlopeErrAbs", "shapeInvariantSpread",
    "chandrasekhar", "steps", "crossedAt", "detonated", "stepsPredicted", "radiusAtStart",
    "naiveRatioLow", "naiveRatioHigh", "naiveEverCollapses", "planted",
];

/** Least squares on (x, y) with the coefficient of determination, so a slope is never reported without its fit. */
function fit(xs, ys) {
    const n = xs.length;
    const sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
    const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0), sxx = xs.reduce((a, x) => a + x * x, 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), b = (sy - slope * sx) / n;
    const my = sy / n;
    let ss = 0, st = 0;
    for (let i = 0; i < n; i++) { const p = slope * xs[i] + b; ss += (ys[i] - p) ** 2; st += (ys[i] - my) ** 2; }
    return { slope, r2: st === 0 ? 1 : 1 - ss / st };
}

// *** THE PLANTED ERROR IS THE PLAUSIBLE WRONG DERIVATION, NOT A NUDGED CONSTANT. *** Drop the relativistic
// factor and you get the textbook non-relativistic degenerate law R ~ M^(-1/3), which is what a first pass
// writes down and which LOOKS RIGHT: at 0.1 solar masses it is 1.4% off, inside any tolerance anybody would
// choose. At 1.0 it is 59% off, at the limit 104x -- and it NEVER COLLAPSES, because with no relativistic
// factor there is no Chandrasekhar limit at all. THE FAULT IS TOLD APART BY WHERE IT IS WRONG, NOT BY HOW BIG
// IT IS, which is v3201's rule and the same shape as the Hall tensor trap bound at v3420.
const naiveRadiusSolar = (M) => 0.0127 * Math.pow(M, -1 / 3);

export function defaults({ mode = "exponent", config = {} } = {}) {
    if (!WD_MODES.includes(mode)) return null;   // a refusal, not a silent substitution -- see knobGate.checkMode
    return { mode, config: { ...DEF, ...config } };
}

export function build({ mode = "exponent", config = {} } = {}) {
    if (!WD_MODES.includes(mode)) throw new Error("whitedwarf: undeclared mode " + mode);
    const c = { ...DEF, ...config };
    const mu = Math.min(6, Math.max(1, Number(c.mu_e) || 2));
    const Mch = chandrasekharMass(mu);
    const pts = Math.min(40, Math.max(4, (c.points | 0) || 8));
    const R = c.planted ? naiveRadiusSolar : (M) => radiusSolar(M, mu);
    const blank = { planted: !!c.planted };

    if (mode === "exponent") {
        // FAR BELOW THE LIMIT the relativistic factor tends to 1, so the slope tends to -1/3. *** THE KEY IS
        // THAT IT CONVERGES, NOT THAT IT IS CLOSE: measured -0.349458 over a window of 0.2 solar masses,
        // -0.335799 over 0.05 and -0.333620 over 0.01. A slope merely NEAR -1/3 could come from any number of
        // wrong laws; one that walks onto it as the window shrinks can only come from this one.
        const win = Math.min(0.5, Math.max(1e-4, Number(c.window) || DEF.window));
        const sample = (top) => {
            const Ms = Array.from({ length: pts }, (_, i) => top * (i + 1) / pts);
            return fit(Ms.map(Math.log), Ms.map((m) => Math.log(R(m))));
        };
        const tight = sample(win), loose = sample(win * 4);
        return {
            ...blank,
            slopeMeasured: tight.slope, slopeTheory: -1 / 3,
            slopeErrAbs: Math.abs(tight.slope + 1 / 3), r2: tight.r2, window: win,
            // The tighter window must be the better one. A law with the wrong exponent does not improve as you
            // zoom in on it; it sits where it sits.
            converging: Math.abs(tight.slope + 1 / 3) < Math.abs(loose.slope + 1 / 3),
        };
    }

    if (mode === "limitOrder") {
        // AT THE LIMIT the first factor is nearly constant and R falls as (M_ch - M)^(1/2). Measured 0.50007165
        // at eps = 1e-3, 0.50000072 at 1e-5 and 0.50000001 at 1e-7 -- an EXACT half, approached, and a
        // different factor of the same formula from the one the mode above grades.
        const eps = Math.min(1e-2, Math.max(1e-9, Number(c.eps) || DEF.eps));
        const ds = Array.from({ length: pts }, (_, i) => eps * (i + 1) / pts);
        const ys = ds.map((d) => R(c.planted ? Mch - d : Mch - d));
        const f = fit(ds.map(Math.log), ys.map(Math.log));
        return {
            ...blank,
            limitSlope: f.slope, limitSlopeTheory: 0.5,
            limitSlopeErrAbs: Math.abs(f.slope - 0.5), limitR2: f.r2, eps,
            chandrasekhar: Mch,
            // WITH THE RELATIVISTIC FACTOR GONE THERE IS NO LIMIT AT ALL: the naive law returns a perfectly
            // finite radius at and beyond M_ch, so the star never collapses. That is not a small error.
            naiveEverCollapses: !Number.isFinite(naiveRadiusSolar(Mch * 1.5)),
            naiveRatioLow: naiveRadiusSolar(0.1) / radiusSolar(0.1, mu),
            naiveRatioHigh: naiveRadiusSolar(Mch * 0.99999) / radiusSolar(Mch * 0.99999, mu),
        };
    }

    if (mode === "muScaling") {
        // *** mu_e IS A PARAMETER WITH A PREDICTED SCALING AND AN INVARIANCE, WHICH IS TWO QUESTIONS. *** The
        // limit goes as mu_e^-2 EXACTLY (slope -2.0000000000000004, r2 = 1) -- and beyond that, mu_e enters the
        // radius ONLY through M_ch, so at a fixed fraction of the limit the quantity R * M^(1/3) must not move
        // at all. Measured identical to nine digits across mu_e = 1.8, 2 and 2.6. A formula that had smuggled
        // mu_e in anywhere else would break the second check while passing the first.
        const mus = [1.5, 2, 2.5, 3, 4];
        const f = fit(mus.map(Math.log), mus.map((u) => Math.log(chandrasekharMass(u))));
        const shape = [1.8, 2, 2.6].map((u) => {
            const M = 0.5 * chandrasekharMass(u);
            return (c.planted ? naiveRadiusSolar(M) : radiusSolar(M, u)) * Math.pow(M, 1 / 3);
        });
        const spread = (Math.max(...shape) - Math.min(...shape)) / Math.abs(shape[0]);
        return {
            ...blank,
            muSlope: f.slope, muSlopeTheory: -2, muSlopeErrAbs: Math.abs(f.slope + 2),
            shapeInvariantSpread: spread, chandrasekhar: Mch,
        };
    }

    // accretion -- REPORTED, NOT A KEY. The step count is (M_ch - M0)/dM, which is arithmetic this file could do
    // itself, so grading it would be a MIRROR (v3201): the route that measures is the route that set it. It is
    // here because the run-up to a Type Ia is the thing somebody wants to watch, and because a step count that
    // disagreed with the prediction would mean the loop, not the physics, had gone wrong.
    const M0 = Math.min(Mch * 0.999, Math.max(0.05, Number(c.M0) || DEF.M0));
    const dM = Math.min(0.1, Math.max(1e-6, Number(c.dM) || DEF.dM));
    const a = accreteToLimit(M0, dM, mu);
    return {
        ...blank,
        steps: a.steps, crossedAt: a.crossedAt, detonated: a.detonated,
        stepsPredicted: Math.ceil((Mch - M0) / dM),
        radiusAtStart: radiusKm(M0, mu), chandrasekhar: Mch,
    };
}

export const whiteDwarfDevice = {
    // v3400 -- KNOB PLANT: `planted` swaps the mass-radius LAW for the plausible non-relativistic one, so the
    // whole path from the wrong derivation to every reported exponent is graded. Not a nudged constant.
    plantKind: "knob",
    // v4118 -- NAMED, THE SAME COMPLETION v3851/v4088-v4117 gave the rest of this family, and MEASURED across
    // all four modes rather than assumed from the header. `limitOrder` is the real target: limitSlope 0.500 ->
    // 9.5e-7 (the Chandrasekhar collapse just disappears -- the naive law has no singular behaviour near the
    // limit at all), limitSlopeErrAbs 7.2e-7 -> 0.500. `exponent` mode does NOT catch it -- and, measured, the
    // naive law's far-field slope fit is actually SLIGHTLY CLEANER (slopeErrAbs 2.9e-4 -> 4.1e-15), because
    // dropping the relativistic (M/Mch)^(4/3) factor removes a small curvature from an otherwise pure -1/3
    // power law. That is not an inconsistency: the header's own design note says an error in one factor is
    // invisible to the OTHER exponent, and this is that property showing up as an improvement rather than a
    // wash. `muScaling` and `accretion` are effectively unmoved (shapeInvariantSpread stays at float noise;
    // accretion is bit-identical).
    planted: { knob: "planted", observable: "limitSlopeErrAbs",
               note: "the mass-radius law is swapped for the plausible non-relativistic power law, which has no Chandrasekhar limit to collapse toward -- only the exponent measured AT the limit (M_ch - M)^(1/2) can see this; the far-field -1/3 exponent cannot, because that regime never touches the relativistic factor the plant removes" },
    modes: WD_MODES, name: "white-dwarf-degeneracy",
    observables: WD_OBSERVABLES, build, defaults,
};
export default whiteDwarfDevice;
