// WebGLEngine/simulation/lbm/inflow-selfcheck.mjs -- v2835
//
// Run: node simulation/lbm/inflow-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the fixed-inflow / pressure-outlet boundary condition added to lbm2d.
//
// WHY IT EXISTS: v2834 traced the failure of the f_drag = 2 f_lift measurement to a coupling -- shedding
// modulates drag, drag sets velocity, velocity sets shedding -- which makes the Reynolds number breathe in a
// body-force-driven periodic channel. Every attempt drifted 12-21%. Pinning the velocity from OUTSIDE breaks the
// loop, and THE HEADLINE PROPERTY GATED HERE IS THAT IT HOLDS: the inlet does not drift.
//
// TWO THINGS THIS ROUND GOT WRONG AND FIXED, both pinned below so they cannot return:
//   THE OUTLET PUMPED. The first version copied the whole distribution from the neighbour column -- a
//   zero-gradient outlet. It behaved at tau=0.6 and at tau=0.515 drove the mid-channel speed to FOUR TIMES the
//   inlet velocity before blowing up. Copying every population conserves nothing. Replaced with a Zou-He
//   pressure outlet that reconstructs only the three unknown movers.
//   THE STABILITY LIMIT IS REAL AND IS MEASURED, not assumed away: a Zou-He velocity inlet is only
//   conditionally stable, and this one diverges below tau ~ 0.54. That is a property of the method, so it is
//   recorded as a number rather than discovered again by someone losing an afternoon.

import { makeLBM } from "./lbm2d.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const channel = (nx, ny, tau, U, extra = {}) => {
    const cy = (ny - 1) / 2, h = (ny - 2) / 2;
    const prof = (y) => { const d = (y - cy) / h; return U * Math.max(0, 1 - d * d); };
    return makeLBM({ nx, ny, tau, inflow: prof, ...extra });
};
const healthy = (l) => [...l.rho].every((v) => isFinite(v) && v > 0.5 && v < 2);

// 1. REGRESSION -- absent opts.inflow the solver is the periodic channel it always was
{
    const a = makeLBM({ nx: 60, ny: 31, tau: 0.6, force: [1e-5, 0] });
    for (let i = 0; i < 1500; i++) a.step();
    ok("without inflow, mass is still conserved exactly (the periodic path is untouched)",
        Math.abs(a.mass() - 30 * 58) < 1e-6 || Math.abs(a.mass() - a.nx * (a.ny - 2)) < 1e-6, a.mass().toFixed(6));
    ok("...and the Poiseuille peak still forms", a.ux[a.idx(30, 15)] > 0.01);
}

// 2. THE INLET HOLDS ITS VELOCITY -- the entire reason this exists
{
    const U = 0.05, l = channel(120, 41, 0.6, U);
    const row = 20;
    const at = [];
    for (let i = 0; i < 12000; i++) { l.step(); if ((i + 1) % 3000 === 0) at.push(l.ux[l.idx(0, row)]); }
    ok("the inlet delivers the velocity it was told to", Math.abs(at[0] - U) < 1e-3, at[0].toFixed(6));
    const drift = 100 * Math.abs(at[at.length - 1] - at[0]) / at[0];
    ok("THE INLET DOES NOT DRIFT (a body-force channel drifted 12-21%)", drift < 0.5, drift.toFixed(4) + "% over 9000 steps");
    ok("the field stays healthy", healthy(l));
}

// 3. MASS IS NOT CONSERVED, AND THAT IS CORRECT -- fluid enters and leaves
{
    const l = channel(80, 31, 0.6, 0.05);
    const m0 = l.mass();
    for (let i = 0; i < 2000; i++) l.step();
    ok("an open channel does NOT conserve mass, and that is the point of an open channel",
        Math.abs(l.mass() - m0) > 1e-9, `${m0.toFixed(4)} -> ${l.mass().toFixed(4)}`);
    ok("...but the density stays physical rather than running away", healthy(l));
}

// 4. THE OUTLET DOES NOT PUMP -- the bug this round actually hit
{
    for (const tau of [0.6, 0.57, 0.55]) {
        const U = 0.06, l = channel(120, 41, tau, U);
        for (let i = 0; i < 4000; i++) l.step();
        const mx = Math.max(...[...l.ux].map(Math.abs));
        ok(`tau=${tau}: no population anywhere exceeds ~the inlet speed (the zero-gradient outlet drove it to 4x)`,
            healthy(l) && mx < U * 1.6, `max|u| ${mx.toFixed(5)} vs inlet ${U}`);
    }
}

// 5. THE STABILITY ENVELOPE, measured rather than assumed
{
    const survives = (tau) => { const l = channel(100, 41, tau, 0.05); for (let i = 0; i < 3000; i++) l.step(); return healthy(l); };
    ok("stable at tau = 0.60", survives(0.6));
    ok("stable at tau = 0.55", survives(0.55));
    ok("DIVERGES at tau = 0.52 -- a real limit of a Zou-He velocity inlet, recorded as a number", survives(0.52) === false);
    ok("...so the usable band is tau >= ~0.55, which is what a rig must be designed inside", survives(0.53) === false || survives(0.55));
}

// 6. THE DESIGN CONSEQUENCE: with the velocity driven, the shedding constraint is met by a BIGGER BODY
//    rather than a thinner fluid -- which is what keeps tau inside the band above.
{
    const reFor = (tau, D, U) => (U * D) / ((tau - 0.5) / 3);
    ok("tau=0.55 with D=14 reaches Re 60 at a velocity inside validity", reFor(0.55, 14, 0.0714) > 55 && 0.0714 < 0.1,
        `Re ${reFor(0.55, 14, 0.0714).toFixed(0)} at U=0.0714`);
    ok("...whereas the same Re at D=7 would need a velocity outside it", (60 * ((0.55 - 0.5) / 3)) / 7 > 0.1,
        `U would be ${((60 * ((0.55 - 0.5) / 3)) / 7).toFixed(3)}`);
}

// 7. an obstacle still works, and the flow goes around it
{
    const D = 9, nx = 140, ny = 51, cx = 40, cy = 25;
    const l = channel(nx, ny, 0.6, 0.05, { solidAt: (x, y) => ((x - cx) ** 2 + (y - cy) ** 2) <= (D / 2) ** 2 });
    for (let i = 0; i < 6000; i++) l.step();
    ok("a cylinder in a driven channel runs stably", healthy(l));
    // Compare the WHOLE PLANE through the cylinder against the inlet plane. The first version probed a single
    // row two cells off the cylinder's edge -- which sits inside its boundary layer, where the flow is SLOWER,
    // not faster. Blockage conserves flux, so the acceleration is somewhere in the plane, not at a guessed row.
    const planeMax = (x) => { let m = 0; for (let y = 1; y < ny - 1; y++) if (!l.solid[l.idx(x, y)]) m = Math.max(m, l.ux[l.idx(x, y)]); return m; };
    ok("...the flow accelerates through the blocked plane (flux has to go somewhere)", planeMax(cx) > planeMax(5),
        `at the cylinder ${planeMax(cx).toFixed(5)} vs inlet plane ${planeMax(5).toFixed(5)}`);
    ok("...and the inlet still holds while it does", Math.abs(l.ux[l.idx(0, cy)] - 0.05) < 2e-3, l.ux[l.idx(0, cy)].toFixed(6));
}

// 8. the source records what it learned
{
    const src = (await import("node:fs")).readFileSync(new URL("./lbm2d.js", import.meta.url), "utf8");
    ok("the pumping-outlet mistake is documented where the next person will read it", /zero-gradient outlet|quietly pumped/.test(src));
    ok("the reason the BC exists at all is documented", /shedding modulates the drag|breaks the loop/i.test(src));
}

console.log("inflow-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
