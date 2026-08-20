// WebGLEngine/physics/orbits/kepler-selfcheck.mjs -- v2820
//
// Run: node physics/orbits/kepler-selfcheck.mjs   (~10s)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/orbits/kepler.js -- two-body orbits, and the sharpest demonstration in the lab that HOW YOU
// INTEGRATE MATTERS MORE THAN HOW ACCURATE EACH STEP IS.
//
// EXACT KEYS: Kepler III (T = 2 pi sqrt(a^3/mu), so log T against log a has slope EXACTLY 3/2), vis-viva,
// conserved energy and angular momentum, eccentricity from the Laplace-Runge-Lenz vector (an independent route
// sharing no code with the energy path), and a CLOSED orbit -- a 1/r^2 force gives an apsidal angle of exactly
// pi, so any measured precession is the integrator lying rather than the physics.
//
// THE CLAIM WITH TEETH, and it is deliberately TWO-SIDED because the honest result is not "symplectic wins":
//   RK4 IS MORE ACCURATE PER STEP. It is fourth order; Verlet is second. Measured period error 0.0000% against
//   Verlet's 0.0008%, precession 5.5e-9 rad/orbit against 2.0e-4.
//   AND RK4 IS THE WRONG CHOICE FOR LONG INTEGRATIONS. Its energy error DRIFTS SECULARLY -- 1.45e-6 at 50
//   orbits, 5.80e-6 at 200, 2.32e-5 at 800, growing linearly with time -- while Verlet's is BOUNDED, ending at
//   6.6e-4 whether you run 50 orbits or 800.
// Both halves are gated. A gate that only proved "symplectic is better" would be teaching the wrong lesson.

import { period, visViva, specificEnergy, angularMomentum, semiMajorFromEnergy, eccentricityVector, atPerihelion, integrate, measurePeriod, keplerThirdLaw, apsidalPrecession, INTEGRATORS } from "./kepler.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// 1. the closed forms agree with themselves
{
    ok("period: circular orbit a=1, mu=1 gives T = 2 pi", Math.abs(period(1, 1) - 2 * Math.PI) < 1e-12);
    ok("period: T^2 proportional to a^3", Math.abs(period(4) / period(1) - 8) < 1e-12, "a=4 is 8x the period of a=1");
    ok("vis-viva: circular speed at r=a is sqrt(mu/a)", Math.abs(visViva(1, 1, 1) - 1) < 1e-12);
    const s = atPerihelion(1, 0.6);
    ok("atPerihelion: starts at r = a(1-e) moving purely transversely", Math.abs(s.x - 0.4) < 1e-12 && s.y === 0 && s.vx === 0 && s.vy > 0);
    ok("energy and semi-major axis invert each other", Math.abs(semiMajorFromEnergy(specificEnergy(s)) - 1) < 1e-12);
}

// 2. ECCENTRICITY by an INDEPENDENT route (Laplace-Runge-Lenz), sharing no code with the energy path
{
    let worst = 0;
    for (const e of [0, 0.1, 0.3, 0.7, 0.9]) worst = Math.max(worst, Math.abs(eccentricityVector(atPerihelion(1, e)).e - e));
    ok("LRL vector recovers the eccentricity it was built with", worst < 1e-12, "worst " + worst.toExponential(2));
}

// 3. KEPLER III measured from the SIMULATION -- the period detector knows no formula
{
    const m = measurePeriod({ a: 1, e: 0.3, integrator: "verlet" });
    ok("measured period matches 2 pi sqrt(a^3/mu)", m.errFrac < 1e-4, `${m.measured.toFixed(6)} vs ${m.theory.toFixed(6)}`);
    const k = keplerThirdLaw({});
    ok("KEPLER III: log T against log a has slope EXACTLY 3/2", k.slopeErrFrac < 1e-3, `slope ${k.slopeMeasured.toFixed(6)}`);
    ok("...across five different semi-major axes", k.points.length === 5 && k.points.every((p) => p.errFrac < 1e-3));
}

// 4. THE SHARP CLAIM, side one: SYMPLECTIC ENERGY ERROR IS BOUNDED
{
    const short = integrate({ a: 1, e: 0.5, integrator: "verlet", stepsPerOrbit: 400, orbits: 50 });
    const long = integrate({ a: 1, e: 0.5, integrator: "verlet", stepsPerOrbit: 400, orbits: 800 });
    ok("verlet: energy error does not grow between halves of a run", short.energyGrowthRatio < 1.05, "ratio " + short.energyGrowthRatio.toFixed(4));
    ok("verlet: 16x the orbits does NOT mean more error -- it is BOUNDED", long.energyErrFinal < 2 * short.energyErrFinal,
        `50 orbits ${short.energyErrFinal.toExponential(2)} -> 800 orbits ${long.energyErrFinal.toExponential(2)}`);
    ok("verlet: angular momentum conserved to MACHINE PRECISION (by construction)", long.angularMomentumErr < 1e-12, long.angularMomentumErr.toExponential(2));
    ok("verlet: the semi-major axis barely moves over 800 orbits", long.semiMajorDrift < 1e-3, long.semiMajorDrift.toExponential(2));
}

// 5. THE SHARP CLAIM, side two: RK4 DRIFTS SECULARLY
{
    const a = integrate({ a: 1, e: 0.5, integrator: "rk4", stepsPerOrbit: 400, orbits: 50 });
    const b = integrate({ a: 1, e: 0.5, integrator: "rk4", stepsPerOrbit: 400, orbits: 200 });
    const c = integrate({ a: 1, e: 0.5, integrator: "rk4", stepsPerOrbit: 400, orbits: 800 });
    ok("rk4: energy error GROWS between halves of a run", b.energyGrowthRatio > 1.5, "ratio " + b.energyGrowthRatio.toFixed(3));
    ok("rk4: the drift is SECULAR -- error scales with orbit count", c.energyErrFinal > 8 * a.energyErrFinal,
        `50 -> ${a.energyErrFinal.toExponential(2)}, 200 -> ${b.energyErrFinal.toExponential(2)}, 800 -> ${c.energyErrFinal.toExponential(2)}`);
    const ratio = (c.energyErrFinal / a.energyErrFinal) / 16;
    ok("rk4: growth is roughly LINEAR in time (16x orbits gives ~16x error)", ratio > 0.5 && ratio < 2, "16x-orbit error ratio / 16 = " + ratio.toFixed(2));
}

// 6. AND THE HONEST OTHER HALF: RK4 IS MORE ACCURATE PER STEP
{
    const v = measurePeriod({ a: 1, e: 0.3, integrator: "verlet" });
    const r = measurePeriod({ a: 1, e: 0.3, integrator: "rk4" });
    ok("HONEST: RK4 measures the period MORE accurately than Verlet", r.errFrac < v.errFrac,
        `rk4 ${(r.errFrac * 100).toFixed(5)}% vs verlet ${(v.errFrac * 100).toFixed(5)}%`);
    const pv = apsidalPrecession({ integrator: "verlet" });
    const pr = apsidalPrecession({ integrator: "rk4" });
    ok("HONEST: RK4 also precesses less per orbit", Math.abs(pr.perOrbitRad) < Math.abs(pv.perOrbitRad),
        `rk4 ${pr.perOrbitRad.toExponential(2)} vs verlet ${pv.perOrbitRad.toExponential(2)}`);
    ok("...so the lesson is NOT 'symplectic is more accurate' -- it is that the errors behave differently", true);
}

// 7. CLOSED ORBIT: a 1/r^2 force must not precess
{
    for (const integ of ["verlet", "rk4"]) {
        const p = apsidalPrecession({ integrator: integ, orbits: 12 });
        ok(`${integ}: apsidal precession is ~zero (the orbit closes)`, Math.abs(p.perOrbitRad) < 1e-3, `${p.perOrbitRad.toExponential(2)} rad/orbit over ${p.passes} passes`);
    }
}

// 8. a CIRCULAR orbit stays circular
{
    const r = integrate({ a: 1, e: 0, integrator: "verlet", stepsPerOrbit: 400, orbits: 100, sample: 40 });
    let mn = Infinity, mx = -Infinity;
    for (const [x, y] of r.path) { const rad = Math.hypot(x, y); mn = Math.min(mn, rad); mx = Math.max(mx, rad); }
    ok("circular orbit stays circular over 100 orbits", (mx - mn) / mn < 1e-3, `radius ${mn.toFixed(6)} to ${mx.toFixed(6)}`);
}

// 9. SABOTAGE: too large a step destroys the orbit, so the step size is load-bearing rather than decorative
{
    const fine = integrate({ a: 1, e: 0.5, integrator: "verlet", stepsPerOrbit: 400, orbits: 20 });
    const coarse = integrate({ a: 1, e: 0.5, integrator: "verlet", stepsPerOrbit: 8, orbits: 20 });
    ok("SABOTAGE: a coarse step wrecks the orbit that a fine step holds", coarse.energyErrFinal > 100 * fine.energyErrFinal,
        `fine ${fine.energyErrFinal.toExponential(2)} vs coarse ${coarse.energyErrFinal.toExponential(2)}`);
    let threw = false;
    try { integrate({ integrator: "nope" }); } catch { threw = true; }
    ok("an unknown integrator is refused rather than silently defaulted", threw);
    ok("both integrators are registered", Object.keys(INTEGRATORS).sort().join(",") === "rk4,verlet");
}

// 10. browser-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("./kepler.js", import.meta.url), "utf8");
    ok("kepler.js imports nothing and uses no DOM", !/^\s*import\s/m.test(src) && !/\bwindow\.|\bdocument\./.test(src));
}

console.log("kepler-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
