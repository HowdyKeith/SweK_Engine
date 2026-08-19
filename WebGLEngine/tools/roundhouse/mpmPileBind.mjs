// tools/roundhouse/mpmPileBind.mjs -- v3800
//
// *** THE FIRST MPM KEY THAT TESTS PHYSICAL MEANING RATHER THAN AN IDENTITY. Every earlier one -- partition of
// unity, momentum, the third law, the impulse, the parabola, energy direction -- would hold for a material
// that behaved nothing like sand. This one does not: A HIGHER FRICTION ANGLE MUST GIVE A NARROWER PILE, and a
// model that spreads the same however much friction you give it is not modelling friction. ***
//
// MEASURED with Drucker-Prager wired into the step loop, final pile width across five angles:
//   25 deg 21.5233 | 30 deg 21.3617 | 35 deg 21.1869 | 40 deg 19.2992 | 45 deg 16.4789
// MONOTONE DECREASING ACROSS ALL FIVE.
//
// *** AND THE PLANT IS v3799'S DEAF ANGLE RUN END TO END: alphaOf ignores the angle, so the yield surface
// stops depending on it and EVERY PILE COMES OUT THE SAME WIDTH. v3799 caught that at the surface; this
// catches it in a simulation, which is the version somebody would actually notice -- or rather WOULD NOT, since
// the piles all still look like piles. ***

import { makeGrid } from "../../physics/mpm/transfer.mjs";
import { lame } from "../../physics/mpm/constitutive.mjs";
import { alphaOf } from "../../physics/mpm/druckerPrager.mjs";
import { restBlock, centreOfMass, step } from "../../physics/mpm/step.mjs";

export const PILE_OBSERVABLES = [
    "widths", "monotone", "narrowing", "widthAtLow", "widthAtHigh",
    "contained", "angles", "steps", "spread",
];

export const PILE_MODES = ["friction", "clamp", "deafangle"];

const DEF = { steps: 720, dt: 1 / 240, gy: -9.81, E: 500, nu: 0.3, nx: 48, ny: 16, h: 0.5,
              angles: [25, 30, 35, 40, 45] };

export function pileDefaults(hyp) {
    const h = { mode: "friction", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
    c.steps = Math.min(2000, Math.max(120, num(c.steps, DEF.steps) | 0));
    c.nx = Math.min(96, Math.max(16, num(c.nx, DEF.nx) | 0));
    if (!Array.isArray(c.angles) || c.angles.length < 2) c.angles = DEF.angles.slice();
    h.config = c;
    if (!PILE_MODES.includes(h.mode)) h.mode = "friction";
    return h;
}

function pileWidth(c, deg, { deaf = false, clamp = false } = {}) {
    const g = makeGrid(c.nx, c.ny, c.h);
    const ps = restBlock({ n: 6, spacing: 0.2, x0: c.nx * c.h / 2, y0: 2.2, m: 0.1, vol0: 0.04 });
    const params = { ...lame(c.E, c.nu), alpha: alphaOf(deg, { deaf }) };
    // *** THE WALLS STAND THREE CELLS IN, WHICH v3798 PROVED IS NOT OPTIONAL: a boundary on the domain edge
    // truncates the stencil and loses 95% of the horizontal momentum. ***
    const walls = { lo: 3, hi: 3, sticky: false };
    for (let i = 0; i < c.steps; i++) step(ps, g, { dt: c.dt, gy: c.gy, params, plastic: clamp ? true : "dp", walls });
    const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
    const inside = ps.every((p) => p.x > 1 && p.x < c.nx * c.h - 1 && p.y > 0.5 && p.y < c.ny * c.h);
    return { width: Math.max(...xs) - Math.min(...xs), inside, com: centreOfMass(ps).y };
}

export async function buildPile(hyp, base = {}) {
    const h = pileDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const deaf = h.mode === "deafangle", clamp = h.mode === "clamp";
    const rows = c.angles.map((deg) => ({ deg, ...pileWidth(c, deg, { deaf, clamp }) }));

    const widths = rows.map((r) => r.width);
    const out = { angles: c.angles.slice(), widths, steps: c.steps };
    // *** A PILE THAT LEFT THE BOX IS NOT A MEASUREMENT. If any run escapes, the widths are meaningless and
    // the key must not be read -- the first attempt at this fixture had a 15-degree pile 13.6 wide in an
    // 8-wide domain, and its width was a statement about the domain rather than about friction. ***
    out.contained = rows.every((r) => r.inside);
    out.widthAtLow = widths[0];
    out.widthAtHigh = widths[widths.length - 1];
    out.monotone = widths.every((w, i) => i === 0 || w <= widths[i - 1] + 1e-9);
    out.spread = out.widthAtLow > 0 ? out.widthAtLow / out.widthAtHigh : 0;
    out.narrowing = out.contained && out.monotone && out.spread > 1.1;
    return out;
}

export const pileDevice = {
    modes: PILE_MODES,
    // "friction" is FIRST so the contract compares the plant against the mode that owns the trend.
    plantMode: "deafangle", plantFlips: "spread", plantKind: "mode",
    name: "mpm-pile-friction", observables: PILE_OBSERVABLES,
    build: buildPile, defaults: pileDefaults,
};
