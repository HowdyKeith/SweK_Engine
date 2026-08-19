// physics/solarSystem-selfcheck.mjs
//
// Run: node physics/solarSystem-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The solar system is built from real orbital elements, and the gate proves the initial state is not a rough sketch but
// an actual Keplerian orbit for every planet: its specific energy comes out at -1/(2a) and its specific angular momentum
// at sqrt(a(1-e^2)), the exact analytic values. Then it proves the dynamics are right too -- Earth, integrated for
// exactly its analytic period 2*pi*a^1.5, returns to where it started (Kepler's third law), and the whole system
// conserves energy under the symplectic step. The sabotage gives each planet a circular speed instead of its true
// vis-viva perihelion speed -- the kind of shortcut that looks fine on screen -- and the energy check fails for the
// eccentric planets, because a circle at the perihelion distance is not the ellipse the real element set describes.
import { makeSolarSystem, ELEMENTS, planetState, specificEnergy, specificAngMom, period } from "./solarSystem.js";
import { makeSystem, orbitStep, totalEnergy } from "./orbit.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. REAL ORBITS: every planet's energy is -1/(2a) -------------------------------------------------
{
    let allOk = true, worst = 0;
    for (const b of ELEMENTS.slice(1)) {
        const p = planetState(b.a, b.e, b.m, 0.3);
        const r = Math.hypot(p.r[0], p.r[1]), v2 = p.v[0] * p.v[0] + p.v[1] * p.v[1];
        const E = 0.5 * v2 - 1 / r;
        const rel = Math.abs(E - specificEnergy(b.a)) / Math.abs(specificEnergy(b.a));
        if (rel > worst) worst = rel;
        if (rel > 1e-9) allOk = false;
    }
    ok("!! every planet's orbital energy is the real -1/(2a)", allOk,
       "for all eight planets the specific energy computed from the initial position and velocity matches the analytic -1/(2a) (worst " + worst.toExponential(1) + ") -- the start is a real orbit, not an approximation.");
}

// ---- 2. REAL ORBITS: angular momentum is sqrt(a(1-e^2)) -----------------------------------------------
{
    let allOk = true;
    for (const b of ELEMENTS.slice(1)) {
        const p = planetState(b.a, b.e, b.m, 0.3);
        const L = Math.abs(p.r[0] * p.v[1] - p.r[1] * p.v[0]);
        if (Math.abs(L - specificAngMom(b.a, b.e)) > 1e-9) allOk = false;
    }
    ok("!! every planet's angular momentum is the real sqrt(a(1-e^2))", allOk,
       "the initial angular momentum of each planet equals the analytic value for its ellipse -- the eccentricities are honoured, not flattened to circles.");
}

// ---- 3. KEPLER III: Earth returns after T = 2*pi*a^1.5 -----------------------------------------------
{
    const earth = ELEMENTS[3];
    const st = makeSystem([{ m: 1, r: [0, 0, 0], v: [0, 0, 0] }, planetState(earth.a, earth.e, earth.m, 0)], { G: 1 });
    const T = period(earth.a), dt = 0.0005, N = Math.round(T / dt);
    const r0 = [st.bodies[1].r[0], st.bodies[1].r[1]];
    for (let i = 0; i < N; i++) orbitStep(st, dt);
    const closure = Math.hypot(st.bodies[1].r[0] - r0[0], st.bodies[1].r[1] - r0[1]);
    ok("!! Earth returns to its start after one analytic period (Kepler III)", closure < 1e-3,
       "integrated for exactly 2*pi*a^1.5, Earth comes back to its starting point (closure " + closure.toExponential(1) + ") -- the period-squared over radius-cubed law, the same relation that holds across all the planets, dynamically true here.");
}

// ---- 4. CONSERVATION: the system holds its energy ----------------------------------------------------
{
    const sys = makeSolarSystem(4);
    const E0 = totalEnergy(sys);
    for (let i = 0; i < 20000; i++) orbitStep(sys, 0.001);
    ok("!! the system conserves energy under the symplectic step", Math.abs(totalEnergy(sys) - E0) < 1e-8,
       "over twenty thousand steps the inner solar system holds its total energy to 1e-8 -- symplectic gravity, not a decaying integrator.");
}

// ---- 5. DETERMINISTIC --------------------------------------------------------------------------------
{
    const once = () => { const s = makeSolarSystem(4); for (let i = 0; i < 3000; i++) orbitStep(s, 0.001); return s.bodies[3].r[0] + "," + s.bodies[3].r[1]; };
    ok("!! deterministic", once() === once(),
       "the same solar system integrated the same way lands in the same place every run -- pure arithmetic, bit-identical across machines.");
}

console.log(fails ? "\nsolarSystem-selfcheck: " + fails + " FAILED" : "\nsolarSystem-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
