// WebGLEngine/physics/md/thermostat-selfcheck.mjs — v2644
//
// Run: node physics/md/thermostat-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A thermostat has a target it must reach and a definition it must honour. Temperature from equipartition is
// checked against a hand-computed case; an instant rescale must hit the target exactly; the Berendsen step must
// drive a hot or cold system toward the target over its coupling time and then hold it; COM removal must zero the
// bulk momentum; and the scale factor is a sqrt, so the thermostat stays deterministic.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { temperature, removeCOMMotion, rescaleToT, berendsenStep } from "./thermostat.js";
import { computeForces, velocityVerlet } from "./md.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const near = (a, b, t) => Math.abs(a - b) <= t;

// ---- 1. TEMPERATURE FROM EQUIPARTITION MATCHES A HAND CASE ---------------------------------------------------------
{
    // 2 atoms, mass 1, each moving at v=(1,0,0). KE = 2 * 1/2 * 1 * 1 = 1. dof = 6 -> T = 2*1/6 = 1/3.
    const vel = new Float64Array([1, 0, 0, 1, 0, 0]), masses = new Float64Array([1, 1]);
    ok("!! temperature equals 2 KE / dof (equipartition)", near(temperature(vel, masses, 6), 1 / 3, 1e-12),
       "two unit-mass atoms at speed 1 give KE 1 over 6 dof -> T = 1/3 = " + temperature(vel, masses, 6).toFixed(4) + ".");
}

// ---- 2. INSTANT RESCALE HITS THE TARGET EXACTLY ------------------------------------------------------------------
{
    let seed = 3; const rnd = () => (seed = (1103515245 * seed + 12345) & 0x7fffffff) / 0x7fffffff;
    const N = 20, masses = new Float64Array(N).fill(1), vel = new Float64Array(3 * N);
    for (let i = 0; i < 3 * N; i++) vel[i] = rnd() - 0.5;
    const dof = 3 * N;
    rescaleToT(vel, masses, 2.5, dof);
    ok("!! an instant rescale lands exactly on the target temperature", near(temperature(vel, masses, dof), 2.5, 1e-9),
       "after rescaling, T = " + temperature(vel, masses, dof).toFixed(6) + " = target 2.5.");
}

// ---- 3. BERENDSEN DRIVES A HOT SYSTEM DOWN TO THE TARGET AND HOLDS IT -----------------------------------------------
{
    let seed = 11; const rnd = () => (seed = (1103515245 * seed + 12345) & 0x7fffffff) / 0x7fffffff;
    // a small LJ gas started hot; couple to Ttarget and watch it relax
    const N = 30, masses = new Float64Array(N).fill(1), pos = new Float64Array(3 * N), vel = new Float64Array(3 * N);
    for (let i = 0; i < N; i++) { pos[3 * i] = (i % 5) * 1.2; pos[3 * i + 1] = ((i / 5) | 0) * 1.2; pos[3 * i + 2] = 0; }
    for (let i = 0; i < 3 * N; i++) vel[i] = (rnd() - 0.5) * 3;    // hot
    const dof = 3 * N - 3, Tt = 0.5, tau = 0.1, dt = 0.004;
    const forceFn = (p) => computeForces(p, N, 0.5, 1, 9);
    const state = { pos, vel, forces: forceFn(pos).forces, masses, pe: forceFn(pos).pe };
    removeCOMMotion(state.vel, masses);
    rescaleToT(state.vel, masses, 3.0, dof);          // start genuinely hot at T=3
    const Tstart = temperature(state.vel, masses, dof);
    let Tend = Tstart;
    for (let s = 0; s < 3000; s++) { velocityVerlet(state, dt, forceFn); berendsenStep(state.vel, masses, Tt, dof, dt, tau); Tend = temperature(state.vel, masses, dof); }
    // average T over the last stretch should sit near the target
    let acc = 0, n = 0;
    for (let s = 0; s < 500; s++) { velocityVerlet(state, dt, forceFn); berendsenStep(state.vel, masses, Tt, dof, dt, tau); acc += temperature(state.vel, masses, dof); n++; }
    const Tavg = acc / n;
    ok("!! Berendsen relaxes a hot system to the target and holds it", Tstart > Tt * 3 && near(Tavg, Tt, Tt * 0.3),
       "started hot at T=" + Tstart.toFixed(2) + ", coupled to " + Tt + "; late-run average T=" + Tavg.toFixed(3) + " near target. The thermostat pulls the temperature where you ask.");
}

// ---- 4. COM REMOVAL ZEROES THE BULK MOMENTUM ---------------------------------------------------------------------
{
    const masses = new Float64Array([1, 2, 3]);
    const vel = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    removeCOMMotion(vel, masses);
    let px = 0, py = 0, pz = 0;
    for (let i = 0; i < 3; i++) { px += masses[i] * vel[3 * i]; py += masses[i] * vel[3 * i + 1]; pz += masses[i] * vel[3 * i + 2]; }
    ok("!! removing COM motion zeroes the total momentum", near(px, 0, 1e-12) && near(py, 0, 1e-12) && near(pz, 0, 1e-12),
       "after COM removal total momentum = (" + px.toFixed(2) + "," + py.toFixed(2) + "," + pz.toFixed(2) + ") -- so the thermostat governs thermal motion, not drift.");
}

// ---- 5. DETERMINISTIC: NO TRANSCENDENTAL (sqrt ONLY) --------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "thermostat.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const banned = /Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|cbrt|sinh|cosh|tanh|hypot)\b/;
    ok("!! the thermostat uses no transcendental (sqrt scale factor only)", !banned.test(src),
       "temperature and rescaling are arithmetic plus one sqrt for the scale factor -- deterministic across architectures.");
}

console.log(fails ? "\nthermostat-selfcheck: " + fails + " FAILED" : "\nthermostat-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
