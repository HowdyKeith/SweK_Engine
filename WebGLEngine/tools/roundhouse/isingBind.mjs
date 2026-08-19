// tools/roundhouse/isingBind.mjs
//
// v2819 -- roundhouse device: the 2D ISING MODEL. The lab's first statistical-mechanics device and its first
// PHASE TRANSITION, which is a different capability from measuring a coefficient.
//
// Modes:
//   "order"     -- magnetisation at one temperature, beside Yang's EXACT value for it. Below T_c that is a
//                  curve to match; at and above T_c Yang is exactly zero, so the measured value is finite only
//                  because the lattice is.
//   "ground"    -- cold start at low T. |M| and E/N must be exactly 1 and -2. Specifies its initial condition
//                  deliberately: a RANDOM start at low T freezes into stripe domains, which is a real
//                  metastability of the model rather than a defect, and would make the check lie.
//   "exponent"  -- the sharpest key. chi_max ~ L^(gamma/nu) with gamma/nu = 7/4 EXACTLY, so fitting log chi_max
//                  against log L recovers a UNIVERSAL exponent from the simulation alone. Stronger than hitting
//                  T_c once: a lattice with a bump in roughly the right place still gets the exponent wrong.
//   "transition"-- magnetisation below and above T_c in one run, and the ratio between them.

import { ONSAGER_TC, GAMMA_OVER_NU, yangMagnetisation, measure, criticalExponent } from "../../physics/statmech/ising.js";

export const ISING_OBSERVABLES = [
    "temperature", "magnetisation", "yangExact", "magnetisationErrFrac", "energy",
    "susceptibility", "specificHeat",
    "exponentMeasured", "exponentTheory", "exponentErrFrac", "chiMaxSmall", "chiMaxLarge", "peakT",
    "onsagerTc", "mBelow", "mAbove", "orderRatio", "ordered",
];

const DEF = { L: 24, T: 2.0, warmup: 400, samples: 400, seed: 12345 };

export function isingDefaults(hyp) {
    const h = { mode: "order", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    // Monte Carlo cost is L^2 per sweep times (warmup + samples) -- bounded so a proposal cannot pin the builder
    c.L = Math.min(48, Math.max(8, num(c.L, DEF.L) | 0));
    c.T = Math.min(20, Math.max(0.05, num(c.T, DEF.T)));
    c.warmup = Math.min(2000, Math.max(50, num(c.warmup, DEF.warmup) | 0));
    c.samples = Math.min(2000, Math.max(50, num(c.samples, DEF.samples) | 0));
    h.config = c;
    if (!["order", "ground", "exponent", "transition", "halfbond"].includes(h.mode)) h.mode = "order";
    return h;
}

export async function buildIsing(hyp, base = {}) {
    const h = isingDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;

    if (h.mode === "ground") {
        const g = measure({ L: c.L, T: Math.min(0.8, c.T), warmup: c.warmup, samples: Math.min(200, c.samples), seed: c.seed, cold: true });
        return { temperature: g.T, magnetisation: g.magnetisation, energy: g.energy, onsagerTc: ONSAGER_TC, ordered: g.magnetisation > 0.99 };
    }

    if (h.mode === "exponent") {
        const e = criticalExponent({ sizes: [8, 16, 32], warmup: Math.min(500, c.warmup), samples: Math.min(700, c.samples) });
        return {
            exponentMeasured: e.exponentMeasured, exponentTheory: e.exponentTheory, exponentErrFrac: e.exponentErrFrac,
            chiMaxSmall: e.points[0].chiMax, chiMaxLarge: e.points[e.points.length - 1].chiMax,
            peakT: e.points[e.points.length - 1].peakT, onsagerTc: ONSAGER_TC,
        };
    }

    if (h.mode === "transition") {
        const below = measure({ L: c.L, T: 2.0, warmup: c.warmup, samples: c.samples, seed: c.seed }).magnetisation;
        const above = measure({ L: c.L, T: 2.6, warmup: c.warmup, samples: c.samples, seed: c.seed + 1 }).magnetisation;
        return { mBelow: below, mAbove: above, orderRatio: above > 0 ? below / above : Infinity, onsagerTc: ONSAGER_TC };
    }

    // *** v3764 -- THE PLANT: `halfbond` DROPS THE 2 FROM dE = 2*J*s*(neighbour sum). THE 2 IS THERE BECAUSE
    // EACH BOND IS COUNTED ONCE FROM EACH END AND A FLIP CHANGES BOTH SIGNS, and dropping it is the classic
    // Metropolis Ising bug -- common enough to be a teaching example. IT IS INVISIBLE TO INSPECTION:
    // exp(-dE/T) still looks like a Boltzmann factor, the lattice still equilibrates, and it still orders. IT
    // SIMPLY ORDERS AT THE WRONG TEMPERATURE, because halving every energy is exactly doubling T.
    // ONE-SIDED BY CONSTRUCTION: yangMagnetisation(c.T) is a closed form that never sees the update rule, so
    // the measurement moves and the reference does not. ***
    const r = measure({ L: c.L, T: c.T, warmup: c.warmup, samples: c.samples, seed: c.seed,
                        bondFactor: h.mode === "halfbond" ? 1 : 2 });
    const y = yangMagnetisation(c.T);
    return {
        temperature: r.T, magnetisation: r.magnetisation, yangExact: y,
        magnetisationErrFrac: y > 0 ? Math.abs(r.magnetisation - y) / y : undefined,
        energy: r.energy, susceptibility: r.susceptibility, specificHeat: r.specificHeat,
        onsagerTc: ONSAGER_TC,
    };
}

export const isingDevice = {
    // v3192 -- EXPORTED. This device reported as ONE-MODE to the census because its own mode names were
    // not in the probe's candidate list -- the LOWER BOUND, biting for the third time. Derived from
    // this file's own default plus every mode its own build() branches on, each verified to give a
    // DISTINCT answer. *** A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE. ***
    // v3764 -- "order" stays FIRST so the mode-plant contract compares the plant against the mode that owns
    // magnetisationErrFrac; the plant is a variant of order, so order is its correct baseline (v3762's lesson).
    modes: ["order", "ground", "exponent", "transition", "halfbond"],
    plantMode: "halfbond", plantFlips: "magnetisationErrFrac", plantKind: "mode",
    name: "ising-2d-critical", observables: ISING_OBSERVABLES, build: buildIsing, defaults: isingDefaults };
