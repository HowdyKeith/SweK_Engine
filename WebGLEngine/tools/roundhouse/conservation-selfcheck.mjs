// tools/roundhouse/conservation-selfcheck.mjs
//
// v3434 -- FORTY-THREE HAND-WRITTEN CONSERVATION CHECKS, EACH ASKING THE WRONG HALF OF THE QUESTION.
//
// Nucleon number, momentum, mass, energy, phase-space volume, speed under a magnetic force -- forty-three
// selfchecks audit a conserved quantity, every one with its own loop and its own tolerance, and every one
// comparing the START against the END.
//
// *** THAT COMPARISON CANNOT SEE THE THING THAT MATTERS. *** Measured on the kepler device, same orbit, 4000
// steps:
//
//     Verlet   max|dE| 2.72e-5   growth between halves 1.000   BOUNDED
//     RK4      max|dE| 4.74e-10  growth between halves 1.374   SECULAR
//
// RK4's drift is FIFTY THOUSAND TIMES SMALLER and it is getting worse; Verlet's is larger and flat forever. An
// endpoint check ranks RK4 the better integrator. Run either long enough and Verlet is the only one still
// describing an orbit. The instrument reports rankingInverted for exactly this case, because a lab that ranked
// integrators on drift size would choose wrong and have numbers to justify it.
//
// EXACT IS A SEPARATE VERDICT FROM SMALL. Nucleon number in a Bateman chain and momentum under equal-and-
// opposite pair forces never change a bit -- conserved by CONSTRUCTION. Calling that "conserved to 1e-16"
// understates it and invites someone to loosen the tolerance later.

import { auditConservation, compareConservation, isExact } from "./conservation.mjs";
import { stepVerlet, stepRK4 } from "../../physics/orbits/kepler.js";
import { batemanChain } from "../../physics/nuclear/decay.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const energySeries = (step, n) => {
    const mu = 1, a = 1, e = 0.3;
    let s = { x: a * (1 + e), y: 0, vx: 0, vy: Math.sqrt(mu * (1 - e) / (a * (1 + e))) };
    const E = (q) => 0.5 * (q.vx * q.vx + q.vy * q.vy) - mu / Math.hypot(q.x, q.y);
    const out = [];
    for (let i = 0; i < n; i++) { s = step(s, 0.01, mu); out.push(E(s)); }
    return out;
};

// ---- 1. BOUNDED VERSUS SECULAR, WHICH IS THE WHOLE POINT ---------------------------------------------------------
{
    const v = auditConservation(energySeries(stepVerlet, 4000));
    const r = auditConservation(energySeries(stepRK4, 4000));
    ok("!! Verlet's energy error is BOUNDED and RK4's is SECULAR",
        v.verdict === "bounded" && r.verdict === "secular",
        `Verlet growth ${v.growth.toFixed(3)} between halves, RK4 ${r.growth.toFixed(3)}. A symplectic scheme's ` +
        "error oscillates inside an envelope; an accumulating one widens. Comparing the two HALVES of a run sees " +
        "that; comparing start against end cannot");

    const cmp = compareConservation("verlet", energySeries(stepVerlet, 4000), "rk4", energySeries(stepRK4, 4000));
    ok("!! *** and the ranking is INVERTED: the smaller drift is the worse scheme ***",
        cmp.rankingInverted === true && cmp.smallerDrift === "rk4" && cmp.betterLongRun === "verlet",
        `RK4's worst excursion is ${r.maxDrift.toExponential(2)} against Verlet's ${v.maxDrift.toExponential(2)} ` +
        `-- fifty thousand times smaller, and growing. Every one of the forty-three hand-written checks would ` +
        "have preferred RK4, with a number to justify it");
}

// ---- 2. EXACT IS NOT THE SAME AS SMALL --------------------------------------------------------------------------------
{
    const chain = [];
    for (let t = 0; t <= 60; t += 2) { const s = batemanChain(1, 0.07, 0.31, t); chain.push(s.A + s.B + s.C); }
    const a = auditConservation(chain);
    ok("!! nucleon number in a Bateman chain is EXACT, not small",
        a.verdict === "exact" && isExact(chain),
        "every sample bit-identical to the first across thirty times. Reporting that as 'conserved to 1e-16' " +
        "would understate a closed form that conserves by construction, and would leave room for someone to " +
        "widen the tolerance later on the grounds that it was only ever approximate");

    ok("...and a drifting series is never called exact",
        auditConservation([1, 1, 1.0000001, 1]).verdict !== "exact",
        "one changed bit is enough to lose the exact verdict. A near-exact series is a different claim and gets " +
        "the bounded or secular treatment on its merits");
}

// ---- 3. THE LIMIT OF THE VERDICT, STATED IN THE VERDICT ---------------------------------------------------------------
{
    const v = auditConservation(energySeries(stepVerlet, 4000));
    ok("!! a BOUNDED verdict records how long the run was and refuses to generalise",
        v.boundedFor === 4000 && /not the same as bounded forever/.test(v.reason),
        `bounded over ${v.boundedFor} samples. A growth ratio over N steps can only see drift with a timescale ` +
        "shorter than N -- slow secular growth in a short run is indistinguishable from bounded oscillation, and " +
        "the verdict says so rather than claiming a property of the scheme");

    ok("...and too few samples is refused rather than guessed",
        auditConservation([1, 2]).verdict === "too-short",
        "comparing halves needs halves. Two samples would give a growth ratio built from one number on each " +
        "side, which is arithmetic rather than evidence");
}

console.log();
if (fails) { console.log("conservation-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("conservation-selfcheck: all checks pass");
