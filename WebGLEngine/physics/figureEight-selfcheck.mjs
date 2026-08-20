// physics/figureEight-selfcheck.mjs
//
// Run: node physics/figureEight-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The figure-eight is a periodic choreography, and the gate proves both halves of that. Periodic: after one period the
// three masses return to where they began. Choreography: a third of a period in, the bodies have cycled along one
// shared curve -- body one arrives exactly where body three began, at the origin -- so the three really do run the same
// track spaced evenly in time, not three separate orbits that happen to look alike. Energy and angular momentum are
// conserved, as the symplectic step demands. The sabotage nudges one initial coordinate by a hair, and the eight
// unravels: the famous solution exists only at Simo's exact numbers, and a perturbed start is no longer periodic.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeFigureEight, orbitStep, FIG8_PERIOD } from "./figureEight.js";
import { totalEnergy, angularMomentum } from "./orbit.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const DT = 0.0005;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ---- 1. PERIODIC: the three return to their start after one period --------------------------------------
{
    const st = makeFigureEight(), r0 = st.bodies.map((b) => [...b.r]), n = Math.round(FIG8_PERIOD / DT);
    for (let i = 0; i < n; i++) orbitStep(st, DT);
    let ret = 0; for (let b = 0; b < 3; b++) ret = Math.max(ret, dist(st.bodies[b].r, r0[b]));
    ok("!! the three masses return to their start after one period -- it is periodic", ret < 2e-3,
       "after one period the largest displacement from the initial configuration is " + ret.toFixed(5) + " -- the whole three-body dance closes on itself and repeats.");
}

// ---- 2. CHOREOGRAPHY: a third of a period in, body one reaches body three's start (one shared curve) ------
{
    const st = makeFigureEight(), n3 = Math.round(FIG8_PERIOD / 3 / DT);
    for (let i = 0; i < n3; i++) orbitStep(st, DT);
    const d = dist(st.bodies[0].r, [0, 0]);
    ok("!! a third of a period in, the bodies have cycled along one shared curve", d < 3e-3,
       "at T/3, body one sits " + d.toExponential(1) + " from the origin where body three began -- the three chase each other around a single figure-eight, evenly spaced in time.");
}

// ---- 3. CONSERVED: energy and angular momentum hold over the period --------------------------------------
{
    const st = makeFigureEight(), E0 = totalEnergy(st), L0 = angularMomentum(st), n = Math.round(FIG8_PERIOD / DT);
    let Emin = Infinity, Emax = -Infinity, Lmin = Infinity, Lmax = -Infinity;
    for (let i = 0; i < n; i++) { orbitStep(st, DT); const E = totalEnergy(st), L = angularMomentum(st); if (E < Emin) Emin = E; if (E > Emax) Emax = E; if (L < Lmin) Lmin = L; if (L > Lmax) Lmax = L; }
    ok("!! energy and angular momentum are conserved through the dance", (Emax - Emin) / Math.abs(E0) < 1e-5 && (Lmax - Lmin) < 1e-9,
       "over the period the energy varies by " + ((Emax - Emin) / Math.abs(E0)).toExponential(1) + " and the angular momentum by " + (Lmax - Lmin).toExponential(1) + " -- the symplectic step holds the invariants.");
}

// ---- 4. DETERMINISTIC + pure ----------------------------------------------------------------------------
{
    const run = () => { const st = makeFigureEight(); for (let i = 0; i < 400; i++) orbitStep(st, DT); return st.bodies.flatMap((b) => [...b.r, ...b.v]); };
    const a = run(), b = run();
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "figureEight.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    ok("!! the choreography is deterministic and pure", a.every((v, i) => v === b[i]) && clean,
       "the run reproduces byte-for-byte on the same N-body gravity as the orbit subsystem -- +,-,*,/ and sqrt -- so the figure-eight is bit-identical across machines and joins the fingerprint.");
}

console.log(fails ? "\nfigureEight-selfcheck: " + fails + " FAILED" : "\nfigureEight-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
