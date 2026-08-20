// WebGLEngine/tools/ship/windTunnel-selfcheck.mjs -- v2796
//
// Run: node tools/ship/windTunnel-selfcheck.mjs   (~60s -- it runs real LBM sims)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES simulation/lbm/windTunnel.mjs. The lab's rule is that an instrument needs an ANSWER KEY, and this one has
// a DERIVED identity rather than a fitted curve: in a periodic channel driven by a uniform body force, at steady
// state the total force on all solids equals the total applied body force. That is independent of how the
// momentum-exchange sum is built, so it adjudicates the force measurement.
//
// It earned its keep during this build: the first force formula (summing two populations at the same time level)
// failed this identity by a NON-CONSTANT 2.6x-5.7x, which is how the bug was found. The corrected formula --
// momentum ARRIVING at solid nodes from fluid, times two for the bounce -- matches to 4 decimal places.
//
// Sims are shared between checks: each configuration is run once and reused.

import { makeLBM } from "../../simulation/lbm/lbm2d.js";
import { solidForce, appliedBodyForce, solidForceBalance, coefficients, sampleVelocity, streamline, streamlineField } from "../../simulation/lbm/windTunnel.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const NX = 110, NY = 41, D = 9, CX = 32, CY = (NY - 1) / 2 + 0.5;
const inCyl = (x, y) => ((x - CX) ** 2 + (y - CY) ** 2) <= (D / 2) ** 2;
const nearCyl = (x, y) => ((x - CX) ** 2 + (y - CY) ** 2) <= (D / 2) ** 2 + 2;

function runCyl(g, steps) {
    const lbm = makeLBM({ nx: NX, ny: NY, tau: 0.6, force: [g, 0], solidAt: inCyl });
    for (let t = 0; t < steps; t++) lbm.step();
    const f = solidForce(lbm, nearCyl);
    let U = 0; for (let dy = -2; dy <= 2; dy++) U = Math.max(U, lbm.ux[lbm.idx(Math.max(1, CX - 3 * D), Math.round(CY) + dy)]);
    return { lbm, f, U, Re: U * D / lbm.nu, ...coefficients(f, { rho: 1, U, D }) };
}

// ---- shared sims -------------------------------------------------------------------------------------
const poise = [[21, 0.6, 1e-6], [31, 0.8, 2e-6]].map(([ny, tau, g]) => {
    const lbm = makeLBM({ nx: 36, ny, tau, force: [g, 0] });
    for (let t = 0; t < 14000; t++) lbm.step();
    return { lbm, ny, bal: solidForceBalance(lbm) };
});
const runs = [4e-6, 1.2e-5, 3e-5].map((g) => runCyl(g, 6000));

// 1. THE ANSWER KEY
{
    const worst = Math.max(...poise.map((p) => p.bal.relError));
    ok("ANSWER KEY: wall force == applied body force in a converged channel", worst < 0.01,
        poise.map((p) => `ny=${p.ny} err=${(p.bal.relError * 100).toFixed(3)}%`).join("  "));
}

// 2. null case
{
    const lbm = makeLBM({ nx: 30, ny: 21, tau: 0.7, force: [0, 0] });
    for (let t = 0; t < 150; t++) lbm.step();
    const f = solidForce(lbm, null);
    ok("null case: quiescent fluid exerts ~zero net force", Math.abs(f.fx) < 1e-12 && Math.abs(f.fy) < 1e-12, `fx=${f.fx.toExponential(2)}`);
}

// 3. SABOTAGE: the ORIGINAL BUG this gate caught -- summing e_i*(f_i + f_opp) at the SAME time level. Those are
// two independent populations, not a bounce-back pair, and their equilibrium parts do not cancel over a one-sided
// surface, so the identity fails by a NON-CONSTANT factor (2.6x-5.7x across configurations). Kept as the sabotage
// because it is the mistake that actually happened.
// (Note: the "source must be fluid" guard in solidForce is conceptually right -- an internal solid-solid link is
// not a fluid/solid exchange -- but it is NOT what makes the number correct here: for these symmetric wall and
// cylinder interiors those links cancel, so removing it changes nothing measurable. Said plainly rather than
// claimed as load-bearing.)
{
    const { lbm, bal } = poise[1];
    const { nx, ny, solid, f, Q, E, OPP, idx } = lbm;
    let bad = 0;
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const k = idx(x, y); if (solid[k]) continue;
        for (let i = 1; i < Q; i++) {
            const tx = (x + E[i][0] + nx) % nx, ty = y + E[i][1];
            if (ty < 0 || ty >= ny) continue;
            if (!solid[idx(tx, ty)]) continue;
            bad += E[i][0] * (f[k * Q + i] + f[k * Q + OPP[i]]);
        }
    }
    const applied = appliedBodyForce(lbm).fx;
    const badErr = Math.abs(bad - applied) / Math.abs(applied);
    ok("SABOTAGE: the original same-time-level force formula fails the momentum identity",
        badErr > 0.5 && bal.relError < 0.01,
        `sabotaged=${bad.toExponential(3)} (err ${(badErr * 100).toFixed(0)}%)  correct err=${(bal.relError * 100).toFixed(3)}%`);
}

// 4. cylinder drag direction + the laminar Cd trend
{
    ok("cylinder drag is positive (downstream)", runs.every((r) => r.f.fx > 0), runs.map((r) => r.f.fx.toExponential(2)).join(" "));
    const cds = runs.map((r) => r.cd);
    ok("Cd DECREASES as Re increases (laminar cylinder trend)", cds[0] > cds[1] && cds[1] > cds[2],
        runs.map((r) => `Re=${r.Re.toFixed(1)} Cd=${r.cd.toFixed(2)}`).join("  "));
    ok("Cd stays O(1-100) -- physical magnitude, not a unit blunder", runs.every((r) => r.cd > 0.5 && r.cd < 100));
    ok("Re rises with the driving force (the knob does what it claims)", runs[0].Re < runs[1].Re && runs[1].Re < runs[2].Re);
}

// 5. symmetric geometry -> small lift
{
    const r = runs[2];
    ok("symmetric cylinder: |Cl| much smaller than Cd", Math.abs(r.cl) < 0.1 * Math.abs(r.cd), `Cd=${r.cd.toFixed(2)} Cl=${r.cl.toFixed(4)}`);
}

// 6. the identity doubles as a CONVERGENCE diagnostic
{
    const short = runCyl(1.2e-5, 800);
    const e1 = solidForceBalance(short.lbm).relError, e2 = solidForceBalance(runs[1].lbm).relError;
    ok("momentum imbalance shrinks as the flow converges (usable as a steady-state check)", e2 < e1,
        `800 steps=${(e1 * 100).toFixed(2)}%  6000 steps=${(e2 * 100).toFixed(2)}%`);
}

// 7. sampleVelocity exact on a linear field
{
    const lbm = makeLBM({ nx: 10, ny: 10, tau: 0.7, channel: false });
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) { lbm.ux[lbm.idx(x, y)] = x; lbm.uy[lbm.idx(x, y)] = 2 * y; }
    const [vx, vy] = sampleVelocity(lbm, 3.25, 4.5);
    ok("sampleVelocity: exact on a linear field", Math.abs(vx - 3.25) < 1e-9 && Math.abs(vy - 9.0) < 1e-9, `got ${vx},${vy}`);
}

// 8. streamlines behave
{
    const r = runs[2];
    const lines = streamlineField(r.lbm, { count: 9 });
    let inSolid = false, outOfDomain = false, moved = 0;
    for (const L of lines) {
        if (L.length > 2) moved++;
        for (const [x, y] of L) {
            if (y < 0 || y >= r.lbm.ny) outOfDomain = true;
            const cx2 = Math.round(x), cy2 = Math.round(y);
            if (cx2 >= 0 && cy2 >= 0 && cx2 < r.lbm.nx && cy2 < r.lbm.ny && r.lbm.solid[r.lbm.idx(cx2, cy2)]) inSolid = true;
        }
    }
    ok("streamlines: never penetrate the obstacle or walls", !inSolid);
    ok("streamlines: stay inside the domain", !outOfDomain);
    ok("streamlines: actually advance through the flow", moved === lines.length, `${moved}/${lines.length}`);
}

// 9. uniform flow -> straight streamline
{
    const lbm = makeLBM({ nx: 40, ny: 20, tau: 0.7, channel: false });
    for (let k = 0; k < 40 * 20; k++) { lbm.ux[k] = 0.05; lbm.uy[k] = 0; }
    const L = streamline(lbm, 2, 10, { steps: 20, ds: 1 });
    ok("streamline: uniform flow traces a straight line", L.every(([, y]) => Math.abs(y - 10) < 1e-9) && L.length > 10, `pts=${L.length}`);
}

// 10. browser/worker-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("../../simulation/lbm/windTunnel.mjs", import.meta.url), "utf8");
    ok("source: windTunnel imports nothing / no DOM at module scope", !/^\s*import/m.test(src) && !/\bdocument\b|\bwindow\b/.test(src));
}

console.log("\n    measured: " + runs.map((r) => `Re=${r.Re.toFixed(1)} Cd=${r.cd.toFixed(2)} Cl=${r.cl.toFixed(4)}`).join("   "));
console.log("windTunnel-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
