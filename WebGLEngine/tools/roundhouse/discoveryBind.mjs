// tools/roundhouse/discoveryBind.mjs
//
// v2867 -- roundhouse device TWENTY-ONE: AUTOMATIC EQUATION DISCOVERY, graded on laws we already own exactly.
//
// Unusual among the devices in that its subject is a METHOD rather than a physical system -- like keplerBind's
// energyGrowthRatio, whose most interesting observable is about the integrator and not the orbit. Here the
// system under test is the FINDER, and the physics is the answer key.
//
// Modes:
//   "kepler"   -- rediscover T ~ a^(3/2) from orbital data. Observable is the exponent error against exactly 3/2.
//   "splat"    -- rediscover the 1/z^2 projected-area law. Exponent error against exactly -2.
//   "logistic" -- rediscover the map's OWN equation from an orbit: y = r*x - r*x^2, in chaos.
//   "nolaw"    -- THE LOAD-BEARING ONE. The same chaotic orbit framed as x(n) vs n, where no law exists. The
//                 observable is a BOOLEAN: did it correctly return nothing? A regressor that always finds an
//                 equation is decoration, and this is the mode that can catch it.
import { fit, powerLaw, polyLibrary, multiLibrary, TERM, VERDICT, rollingFit, ROLLING } from "../../physics/discovery/symbolicFit.js";
import { period, visViva } from "../../physics/orbits/kepler.js";
import { projectedAreaAtDepth } from "../../physics/splat/gaussianSplat.js";
import { orbit } from "../../physics/chaos/logistic.js";

export const DISCOVERY_OBSERVABLES = [
    "exponent", "exponentExact", "exponentErr", "verdict", "r2Val", "nTerms",
    "coeffX", "coeffX2", "coeffErr", "r",
    "refusedCorrectly", "foundLaw",
    // v2978 -- a verdict with a SPREAD. lawFraction is the observable a claim should crystallise on: 1 means
    // every origin agreed, 0 means none did, and anything between is FRAGILE -- the case a single split cannot
    // express because it must answer law or no-law.
    "rollingVerdict", "lawFraction", "exponentSd", "originsChecked",
    "coeffInvR", "coeffInvA", "visVivaErr", "poorLibraryRefused",
];

const DEF = { r: 4.0, samples: 400, warmup: 500, degree: 3, threshold: 1e-8 };

export function discoveryDefaults(hyp) {
    const h = { mode: "kepler", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    c.r = Math.min(4, Math.max(0, num(c.r, DEF.r)));                 // outside [0,4] the map leaves its interval
    c.samples = Math.min(4000, Math.max(50, num(c.samples, DEF.samples) | 0));
    c.warmup = Math.min(50000, Math.max(0, num(c.warmup, DEF.warmup) | 0));
    c.degree = Math.min(6, Math.max(1, num(c.degree, DEF.degree) | 0));
    h.config = c;
    if (!["kepler", "splat", "logistic", "nolaw", "visviva", "rolling", "fragile"].includes(h.mode)) h.mode = "kepler";
    return h;
}

export async function buildDiscovery(hyp, base = {}) {
    const h = discoveryDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;

    if (h.mode === "splat") {
        const z = [2, 2.7, 3.5, 4.6, 6, 8, 10.5, 14];
        const r = powerLaw(z, z.map((v) => projectedAreaAtDepth(v)));
        if (r.verdict !== VERDICT.LAW) return { verdict: r.verdict, foundLaw: false };
        return { exponent: r.exponent, exponentExact: -2, exponentErr: Math.abs(r.exponent + 2), verdict: r.verdict, r2Val: r.r2Val, foundLaw: true };
    }

    if (h.mode === "logistic") {
        const orb = Array.from(orbit(c.r, { warmup: c.warmup, samples: c.samples }));
        const m = fit({ X: orb.slice(0, -1), y: orb.slice(1), library: polyLibrary("x", c.degree), threshold: c.threshold });
        if (m.verdict !== VERDICT.LAW) return { verdict: m.verdict, foundLaw: false, r: c.r };
        const cx = (m.terms.find((t) => t.name === "x") || {}).coeff ?? 0;
        const cx2 = (m.terms.find((t) => t.name === "x^2") || {}).coeff ?? 0;
        return {
            r: c.r, coeffX: cx, coeffX2: cx2,
            coeffErr: Math.max(Math.abs(cx - c.r), Math.abs(cx2 + c.r)),
            verdict: m.verdict, r2Val: m.r2Val, nTerms: m.nTerms, foundLaw: true,
        };
    }

    if (h.mode === "nolaw") {
        // The observable is a REFUSAL. Chaos has no closed form in n, so the only correct answer is nothing.
        const orb = Array.from(orbit(4.0, { warmup: c.warmup, samples: c.samples }));
        const nl = fit({ X: orb.map((_, i) => i + 1), y: orb, library: polyLibrary("n", Math.max(4, c.degree)), threshold: c.threshold });
        return {
            verdict: nl.verdict,
            refusedCorrectly: nl.verdict === VERDICT.NO_LAW,
            foundLaw: nl.verdict === VERDICT.LAW,
            r2Val: nl.r2Val,
        };
    }

    if (h.mode === "rolling" || h.mode === "fragile") {
        if (h.mode === "fragile") {
            // THE CASE THE SINGLE SPLIT GETS RIGHT ONLY BY LUCK: exp(x/3) fitted by a degree-5 polynomial is
            // no-law at four cut points and LAW at 0.8. Rolling the origin says FRAGILE, which is true.
            const x = Array.from({ length: 14 }, (_, i) => i + 1);
            const r = rollingFit({ X: x, y: x.map((v) => Math.exp(v / 3)), library: polyLibrary("x", 5), threshold: 1e-9 });
            return { rollingVerdict: r.verdict, lawFraction: r.lawFraction, originsChecked: r.runs.length,
                     exponentSd: r.exponentSd, foundLaw: r.verdict === ROLLING.LAW };
        }
        const a = [1, 1.3, 1.7, 2.2, 2.9, 3.8, 5.0, 6.5, 8.2, 10.5];
        const r = rollingFit({ X: a, y: a.map((v) => period(v, 1)), powerLawMode: true });
        return { rollingVerdict: r.verdict, lawFraction: r.lawFraction, originsChecked: r.runs.length,
                 exponentSd: r.exponentSd, exponent: r.exponentMean, exponentExact: 1.5,
                 exponentErr: Math.abs(r.exponentMean - 1.5), foundLaw: r.verdict === ROLLING.LAW };
    }

    if (h.mode === "visviva") {
        // A genuinely TWO-VARIABLE law: v^2 = 2GM/r - GM/a. No single-variable library can express it, which is
        // why this mode exists -- and the poor-library check below turns the module's documented limit (sparse
        // regression cannot invent the vocabulary) into a measured behaviour rather than a caveat.
        const rows = [], ys = [];
        for (const aa of [1, 1.5, 2, 2.6, 3.3, 4.1, 5, 6, 7.2, 8.5, 10, 12]) {
            for (const f of [0.6, 1.0, 1.4]) {
                const rr = aa * f, v = visViva(rr, aa, 1);
                if (Number.isFinite(v) && v > 0) { rows.push([rr, aa]); ys.push(v * v); }
            }
        }
        const lib = multiLibrary([TERM.one, TERM.inv(0, "r"), TERM.inv(1, "a"), TERM.invSq(0, "r"), TERM.invSq(1, "a"), TERM.col(0, "r")]);
        const m = fit({ X: rows, y: ys, library: lib, threshold: 1e-9 });
        const poor = multiLibrary([TERM.one, TERM.col(0, "r"), TERM.col(1, "a"), TERM.sq(0, "r"), TERM.sq(1, "a")]);
        const bad = fit({ X: rows, y: ys, library: poor, threshold: 1e-9 });
        if (m.verdict !== VERDICT.LAW) return { verdict: m.verdict, foundLaw: false };
        const cr = (m.terms.find((t) => t.name === "1/r") || {}).coeff ?? 0;
        const ca = (m.terms.find((t) => t.name === "1/a") || {}).coeff ?? 0;
        return {
            coeffInvR: cr, coeffInvA: ca,
            visVivaErr: Math.max(Math.abs(cr - 2), Math.abs(ca + 1)),
            verdict: m.verdict, r2Val: m.r2Val, nTerms: m.nTerms, foundLaw: true,
            poorLibraryRefused: bad.verdict === VERDICT.NO_LAW,
        };
    }

    const a = [1, 1.3, 1.7, 2.2, 2.9, 3.8, 5.0, 6.5];
    const r = powerLaw(a, a.map((v) => period(v, 1)));
    if (r.verdict !== VERDICT.LAW) return { verdict: r.verdict, foundLaw: false };
    return { exponent: r.exponent, exponentExact: 1.5, exponentErr: Math.abs(r.exponent - 1.5), verdict: r.verdict, r2Val: r.r2Val, foundLaw: true };
}

export const discoveryDevice = {
    // v3191 -- EXPORTED so nothing has to GUESS. A probed mode count is a LOWER BOUND: you can only ask
    // about a mode you already thought of, and these names were in nobody's candidate list, so this
    // device reported as having NO DISCOVERABLE MODES. Derived from this file's own default plus every
    // mode its own build() branches on, each verified to produce a DISTINCT answer first.
    modes: ["kepler", "fragile", "logistic", "nolaw", "rolling", "splat", "visviva"], name: "symbolic-equation-discovery", observables: DISCOVERY_OBSERVABLES, build: buildDiscovery, defaults: discoveryDefaults,
    // *** v3902 -- NO CODE CHANGED. `nolaw` HAS BEEN THE PLANT SINCE v2867 AND WAS NEVER DECLARED. ***
    // The header calls it "THE LOAD-BEARING ONE" and says why: "A regressor that always finds an equation is
    // decoration, and this is the mode that can catch it."
    //
    // *** BUT IT DECLARES ITS OBSERVABLE AS A BOOLEAN -- "the observable is a BOOLEAN: did it correctly
    // return nothing?" -- AND A BOOLEAN IS EXACTLY WHAT THE CENSUS CANNOT GRADE. *** probeModePlant requires
    // the declared observable to be a FINITE NUMBER IN BOTH ARMS; `refusedCorrectly` would have been reported
    // as DECLARED BUT DEAD, which is the defect v3849 spent a whole round removing from mpmrefine. So the
    // declaration points at the number the same mode already returns beside it:
    //
    //     r2Val   1.0000000 (kepler, an exact law)  ->  -0.10536219 (chaos framed as x(n), no law)
    //
    // NEGATIVE R-SQUARED IS THE HONEST SHAPE OF THE ANSWER: the best fit is WORSE than predicting the mean,
    // which is what "there is nothing here" looks like as a number rather than as a flag.
    plantMode: "nolaw", plantFlips: "r2Val", plantKind: "knob",
    plantIdeal: 1, plantIdealWhy:
        "r2Val is a coefficient of determination, so a law that fits perfectly gives exactly 1 -- not 0. The nolaw arm gives -0.105, WORSE THAN PREDICTING THE MEAN, and the exponent stops being computable" };
