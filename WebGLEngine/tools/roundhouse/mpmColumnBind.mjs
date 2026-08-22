// tools/roundhouse/mpmColumnBind.mjs -- v3797
//
// *** THE COLLAPSING COLUMN -- the test v3794 named as saying far more than free fall AND HAVING NO ANALYTIC
// ANSWER. That is why the key is a DIRECTION rather than a value: with gravity and no energy input, the total
// mechanical energy of a column collapsing onto a floor CAN ONLY FALL. Friction at the wall dissipates,
// plasticity dissipates, and nothing puts any back. ***
//
// *** AND THE TOTAL HAS THREE TERMS, WHICH IS THE FINDING. Measured on KE + PE alone, the ELASTIC column
// appeared to CREATE 85% MORE ENERGY between samples -- 25.459 rising to 47.114 -- which reads exactly like an
// unstable integrator. IT WAS THE ACCOUNTING. The column stores energy as STRAIN on compression and releases
// it on rebound, and KE + PE cannot see the store. With the strain energy included the worst rise is
// 0.000e+0 -- NOT SMALL, ZERO -- and the plastic case reads 1.882e-5.
// *** WITH PLASTICITY ON THE OMISSION NEARLY VANISHES (apparent rise 1.7e-3) BECAUSE A YIELDING MATERIAL DOES
// NOT HOLD MUCH STRAIN -- SO THE INCOMPLETE ACCOUNTING WOULD HAVE SHIPPED UNNOTICED ON THE DEFAULT FIXTURE,
// and been discovered later as "MPM creates energy". ***

import { makeGrid } from "../../physics/mpm/transfer.mjs";
import { lame, strainEnergy } from "../../physics/mpm/constitutive.mjs";
import { restBlock, centreOfMass, step } from "../../physics/mpm/step.mjs";

export const MPMCOL_OBSERVABLES = [
    "worstRise", "energyFalls", "totalStart", "totalEnd", "dissipatedFrac",
    "keEnd", "cameToRest", "comStart", "comEnd", "collapsed", "creepPerStep", "samples",
];

export const MPMCOL_MODES = ["energy", "settle", "elastic", "noelastic"];

// *** v3798 -- THE FLOOR MOVES FROM lo=1 TO lo=3, AND IT CHANGES A NUMBER v3797 ALREADY SHIPPED.
// A quadratic stencil reaches one cell each way, so a particle resting a fraction above the domain edge has a
// stencil base of -1 and BOTH p2g AND g2p SKIP THAT ROW -- the weights stop summing to one and the gather
// loses whatever share those nodes carried. THE COLUMN HAD BEEN SETTLING AT y = 0.042 WITH TRUNCATED STENCILS
// THE WHOLE TIME. *** A THIRD OF WHAT v3797 REPORTED AS FRICTION AND PLASTICITY WAS BOUNDARY TRUNCATION. The
// energy KEY was unharmed -- energy loss is energy loss whatever its cause -- BUT THE DISSIPATION FIGURE WAS
// WRONG AND IS CORRECTED HERE. ***
const DEF = { steps: 720, dt: 1 / 240, gy: -9.81, E: 500, nu: 0.3, n: 6, spacing: 0.2, x0: 3, y0: 2.2, lo: 3 };

export function mpmColDefaults(hyp) {
    const h = { mode: "energy", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
    c.steps = Math.min(3000, Math.max(60, num(c.steps, DEF.steps) | 0));
    c.dt = Math.min(1 / 60, Math.max(1e-4, num(c.dt, DEF.dt)));
    h.config = c;
    if (!MPMCOL_MODES.includes(h.mode)) h.mode = "energy";
    return h;
}

/**
 * *** THE ENERGY BUDGET. `withElastic` DEFAULTS TO TRUE; the plant sets it false, which is not an invented
 * error -- IT IS THE ACCOUNTING I ACTUALLY WROTE FIRST. ***
 */
function budget(ps, params, withElastic = true) {
    let k = 0, pe = 0, el = 0;
    for (const p of ps) {
        k += 0.5 * p.m * (p.vx * p.vx + p.vy * p.vy);
        pe += p.m * 9.81 * p.y;
        if (withElastic) el += p.vol0 * strainEnergy(p.F, params);
    }
    return { k, pe, el, tot: k + pe + el };
}

export async function buildMpmColumn(hyp, base = {}) {
    const h = mpmColDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const params = lame(c.E, c.nu);
    const withElastic = h.mode !== "noelastic";
    const plastic = !(h.mode === "elastic" || h.mode === "noelastic");
    const walls = { lo: c.lo, hi: 1, sticky: false };

    const g = makeGrid(16, 16, 0.5);
    const ps = restBlock({ n: c.n, spacing: c.spacing, x0: c.x0, y0: c.y0, m: 0.1, vol0: 0.04 });
    const com0 = centreOfMass(ps);
    const e0 = budget(ps, params, withElastic);

    let prev = e0.tot, worstRise = 0, samples = 0;
    const every = Math.max(1, Math.floor(c.steps / 6));
    for (let i = 0; i < c.steps; i++) {
        step(ps, g, { dt: c.dt, gy: c.gy, params, plastic, walls });
        if ((i + 1) % every === 0) {
            const e = budget(ps, params, withElastic);
            worstRise = Math.max(worstRise, (e.tot - prev) / Math.abs(prev));
            prev = e.tot; samples++;
        }
    }
    const e1 = budget(ps, params, withElastic);
    const com1 = centreOfMass(ps);

    // a few more steps at rest, to separate "stopped" from "still creeping"
    const yBefore = com1.y;
    for (let i = 0; i < 120; i++) step(ps, g, { dt: c.dt, gy: c.gy, params, plastic, walls });
    const creep = Math.abs(centreOfMass(ps).y - yBefore) / 120;

    return {
        worstRise, energyFalls: worstRise < 1e-4, samples,
        totalStart: e0.tot, totalEnd: e1.tot, dissipatedFrac: (e0.tot - e1.tot) / e0.tot,
        keEnd: e1.k, cameToRest: e1.k < 1e-3 * e0.tot,
        comStart: com0.y, comEnd: com1.y, collapsed: com1.y < com0.y * 0.8,
        creepPerStep: creep,
    };
}

export const mpmColumnDevice = {
    modes: MPMCOL_MODES,
    // "energy" is FIRST so the contract compares the plant against the mode that owns the budget.
    plantMode: "noelastic", plantFlips: "worstRise", plantKind: "mode",
    plantIdeal: 0, plantIdealWhy:
        "worstRise is the largest energy INCREASE seen in a settling column, and a dissipative system never gains energy, so 0 is the ideal and any positive value is unphysical; removing the elastic response takes it 6.85e-6 -> 3.49e-1",
    name: "mpm-column-energy", observables: MPMCOL_OBSERVABLES,
    build: buildMpmColumn, defaults: mpmColDefaults,
};
