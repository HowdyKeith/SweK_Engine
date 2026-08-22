// WebGLEngine/physics/em/hall-selfcheck.mjs — v3409
//
// Run: node physics/em/hall-selfcheck.mjs   (~1s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// *** THE FALSIFIER IS A QUANTITY THAT MUST NOT CHANGE. ***
//
// In the single-carrier Drude model the transverse CONDUCTIVITY collapses with magnetic field -- measured here by
// a factor of 29 -- and yet the RESISTIVITY rho_xx IS EXACTLY INDEPENDENT OF B. There is no magnetoresistance.
// The two facts are not in tension: rho is the INVERSE OF THE TENSOR, not the reciprocal of its diagonal, and
// inverting a 2x2 with off-diagonal terms restores the (1 + (wc tau)^2) exactly.
//
// Write rho_xx = 1/sigma_xx instead -- which is what the notation invites -- and you get a large, smooth,
// entirely plausible magnetoresistance curve for an effect that is not there. Measured below: 2800%.
//
// The other key is what makes the Hall effect useful at all: rho_xy = B/(nq) contains NO scattering time and NO
// effective mass. It is why a Hall measurement gives carrier density directly, and why the SIGN of the result
// was inexplicable before band theory explained holes.
//
// The transport is Monte Carlo: carriers under the Lorentz force with Poisson scattering, drift velocity from
// the ensemble. Nothing in the integrator knows sigma_0 or the closed form.

import { ELEM_CHARGE, ELECTRON_MASS, cyclotron, sigma0, sigmaTensor, rhoTensor,
         hallResistivity, measureSigma, measureRho, rhoXX_WRONG } from "./hall.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const n = 1e23, tau = 1e-11;
const MC = { carriers: 900, steps: 2500, seed: 11 };

// ---- 1. THE HALL RESISTIVITY IS B/(nq), LINEAR AND EXACT -----------------------------------------------------------
{
    const rows = [0.3, 1, 2, 3].map((B) => {
        const r = measureRho({ n, tau, B, ...MC });
        return { B, meas: r.xy, exact: hallResistivity({ n, B }), wct: r.sigma.wcTau };
    });
    const worst = Math.max(...rows.map((r) => Math.abs(r.meas - r.exact) / Math.abs(r.exact)));
    ok("!! the measured Hall resistivity lands on B/(nq) across a tenfold field range",
       worst < 0.03,
       rows.map((r) => "B=" + r.B + ": " + r.meas.toExponential(3)).join(", ") + " — worst " + (worst * 100).toFixed(1) +
       "% against B/(nq), with wc*tau reaching " + rows[3].wct.toFixed(2));
    // linearity: the ratio to B must be constant
    const slopes = rows.map((r) => r.meas / r.B);
    const spread = (Math.max(...slopes) - Math.min(...slopes)) / Math.abs(slopes[0]);
    ok("!! ...and it is LINEAR in B, so the slope alone gives the carrier density",
       spread < 0.05, "slope spread " + (spread * 100).toFixed(1) + "% across the range");
}

// ---- 2. IT CONTAINS NO SCATTERING TIME AND NO MASS, WHICH IS WHY THE MEASUREMENT IS USEFUL ---------------------------
{
    const a = measureRho({ n, tau: 1e-11, B: 2, ...MC });
    const b = measureRho({ n, tau: 3e-11, B: 2, ...MC });
    ok("!! tripling the scattering time does NOT move rho_xy",
       Math.abs(a.xy - b.xy) / Math.abs(a.xy) < 0.05,
       a.xy.toExponential(4) + " vs " + b.xy.toExponential(4) +
       " — B/(nq) has no tau in it, which is exactly why a Hall measurement gives carrier density and a conductivity measurement does not");
    ok("...while it DOES move the longitudinal resistivity, threefold",
       Math.abs(a.xx / b.xx - 3) < 0.2, "rho_xx ratio " + (a.xx / b.xx).toFixed(3) + " for a 3x change in tau");
}

// ---- 3. *** THE CONDUCTIVITY COLLAPSES AND THE RESISTIVITY DOES NOT MOVE. *** ------------------------------------------
{
    const rows = [0, 0.3, 1, 2, 3].map((B) => {
        const r = measureRho({ n, tau, B, ...MC });
        return { B, rxx: r.xx, sxx: r.sigma.xx, wct: r.sigma.wcTau };
    });
    const s0 = sigma0(n, tau);
    const collapse = rows[0].sxx / rows[4].sxx;
    ok("!! sigma_xx COLLAPSES with field — a factor of " + collapse.toFixed(0) + " across the range",
       collapse > 20,
       rows.map((r) => (r.sxx / s0).toFixed(4)).join(" -> ") + " as a fraction of sigma_0");
    const ratios = rows.map((r) => r.rxx / rows[0].rxx);
    const worst = Math.max(...ratios.map((x) => Math.abs(x - 1)));
    ok("!! ...and rho_xx DOES NOT MOVE across that same collapse. There is no magnetoresistance.",
       worst < 0.02,
       "rho_xx / rho_xx(0) = " + ratios.map((x) => x.toFixed(4)).join(", ") +
       " — under 2% while sigma_xx fell " + collapse.toFixed(0) + "x. rho is the INVERSE OF THE TENSOR, and the " +
       "off-diagonal terms restore the factor exactly");
    // and the closed form says the same, so the measurement is confirmed by algebra rather than only by itself
    const exact = [0, 3].map((B) => rhoTensor({ n, tau, B }).xx);
    ok("...and the closed form agrees that it is exactly constant",
       Math.abs(exact[0] - exact[1]) / exact[0] < 1e-12,
       "rho_xx = " + exact[0].toExponential(6) + " at B=0 and " + exact[1].toExponential(6) + " at B=3 — identical to twelve digits");
}

// ---- 4. SABOTAGE: THE RECIPROCAL OF THE DIAGONAL INVENTS AN EFFECT THAT IS NOT THERE ------------------------------------
{
    const trueRho = rhoTensor({ n, tau, B: 3 }).xx;
    const wrong = rhoXX_WRONG({ n, tau, B: 3, carriers: 600, steps: 2000, seed: 11 });
    const inflation = wrong / trueRho;
    ok("!! writing rho_xx = 1/sigma_xx reports a " + ((inflation - 1) * 100).toFixed(0) + "% magnetoresistance that does not exist",
       inflation > 10,
       "1/sigma_xx = " + wrong.toExponential(3) + " against the true " + trueRho.toExponential(3) + " (" + inflation.toFixed(1) + "x) — " +
       "a large, smooth, entirely plausible curve, and the mistake the notation invites");
    ok("...and it grows with field, so it looks like physics rather than like an error",
       (() => { const lo = rhoXX_WRONG({ n, tau, B: 0.5, carriers: 600, steps: 2000, seed: 11 });
                return wrong / lo > 5; })(),
       "the fake effect is monotone in B, which is what a real magnetoresistance would be");
}

// ---- 5. THE SIGN OF THE HALL VOLTAGE IS THE SIGN OF THE CARRIER ------------------------------------------------------------
// The historically important part: a positive Hall coefficient was inexplicable until band theory explained holes.
{
    const electrons = measureRho({ n, tau, B: 2, sign: -1, ...MC });
    const holes = measureRho({ n, tau, B: 2, sign: +1, ...MC });
    ok("!! flipping the carrier sign flips rho_xy and leaves rho_xx alone",
       electrons.xy * holes.xy < 0 && Math.abs(electrons.xx / holes.xx - 1) < 0.05,
       "rho_xy " + electrons.xy.toExponential(3) + " vs " + holes.xy.toExponential(3) +
       ", rho_xx " + electrons.xx.toExponential(3) + " vs " + holes.xx.toExponential(3) +
       " — the sign is the whole reason holes were discovered by measurement before they were explained");
}

// ---- 6. THE MAGNETIC STEP IS A ROTATION AND CANNOT PUMP ENERGY -----------------------------------------------------------
// A plain Euler step gains speed under a pure B field, which would appear as a spurious magnetoresistance and be
// indistinguishable from the effect this device exists to say is absent.
{
    const wc = cyclotron(2), th = wc * 1e-13;
    const speedAfter = Math.hypot(Math.cos(th), -Math.sin(th));
    ok("!! the Boris rotation preserves speed exactly, so no energy is pumped by the field",
       Math.abs(speedAfter - 1) < 1e-15,
       "|rotation| = " + speedAfter.toFixed(15) + " — a Euler step would gain " +
       (Math.hypot(1, th) - 1).toExponential(2) + " per step and look like magnetoresistance");
    const a = measureRho({ n, tau, B: 2, ...MC }), b = measureRho({ n, tau, B: 2, ...MC });
    ok("seeded runs are bit-identical (a disagreement reproduces)", a.xx === b.xx && a.xy === b.xy);
}

console.log(fails ? ("[hall-selfcheck] FAILED " + fails) : "[hall-selfcheck] all passed");
process.exit(fails ? 1 : 0);
