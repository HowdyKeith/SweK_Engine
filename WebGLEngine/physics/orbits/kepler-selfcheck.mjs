// WebGLEngine/physics/orbits/kepler-selfcheck.mjs -- v2820
//
// Run: node physics/orbits/kepler-selfcheck.mjs
// RUNTIME 0.43s MEASURED (median of 3 -- 434/485/431 -- with date(1) around the run). It was 0.21s before v3993;
// the new sections 10-12 add ~30 full 200-orbit integrations (four integrators x several run lengths, plus a
// four-point dt sweep), which is where the extra 0.22s goes. Measured, not guessed -- a runtime line in this
// tree has been wrong by 13x before.
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

import { period, visViva, specificEnergy, angularMomentum, semiMajorFromEnergy, eccentricityVector, atPerihelion, integrate, measurePeriod, keplerThirdLaw, apsidalPrecession, INTEGRATORS, SYMPLECTIC, ORDER, stepEuler, stepEulerSymplectic, stepVerlet, stepRK4 } from "./kepler.js";

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
    ok("all four integrators are registered", Object.keys(INTEGRATORS).sort().join(",") === "euler,eulerSymplectic,rk4,verlet",
        Object.keys(INTEGRATORS).join(", "));
    ok("...and every one of them is declared in BOTH tables the comparisons rest on",
        Object.keys(INTEGRATORS).every((k) => k in SYMPLECTIC && k in ORDER),
        "SYMPLECTIC and ORDER are the premise of sections 10-12; an integrator missing from either would be compared against nothing");

    // *** v4000 -- stepRK4 WAS EXPORTED AND NAMED BY NO GATE, while its three siblings all were. ***
    // definitionGates-selfcheck found it among 84 such symbols. A MENTION IS NOT A CHECK, so what is asserted
    // is the claim the ORDER table makes -- and once the instrument was right it graded ALL FOUR, which is a
    // better answer than closing one name.
    //
    // *** THE FIRST VERSION MEASURED THE ENERGY AND GOT ORDER 5 FOR RK4, REPEATABLY. *** Not noise: the ratio
    // was 62.85, 63.74, 63.94, 63.97 across four decades of dt -- a rock-solid 2^6. The energy error of a
    // Kepler orbit under RK4 converges ONE ORDER FASTER than the state error, because the leading state error
    // is very nearly tangent to the energy surface and the first-order term cancels. That is a real property
    // and an interesting one, and it is the WRONG INSTRUMENT for grading a method's order: ORDER is a claim
    // about the STATE. Measured against a 512-substep RK4 reference, every integrator lands on its declared
    // order exactly -- euler 1.00, eulerSymplectic 1.00, verlet 2.00, rk4 4.00.
    {
        const s0 = atPerihelion(1, 0.3, 1);
        const ref = (dt, n = 512) => { let s = { ...s0 }; for (let i = 0; i < n; i++) s = stepRK4(s, dt / n, 1); return s; };
        const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.vx - b.vx, a.vy - b.vy);
        const orderOf = (step) => {
            const e1 = dist(step(s0, 0.02, 1), ref(0.02)), e2 = dist(step(s0, 0.01, 1), ref(0.01));
            return Math.log2(e1 / Math.max(1e-300, e2)) - 1;
        };
        const measured = {};
        for (const [k, step] of Object.entries({ euler: stepEuler, eulerSymplectic: stepEulerSymplectic,
                                                 verlet: stepVerlet, rk4: stepRK4 })) measured[k] = orderOf(step);
        const wrong = Object.keys(measured).filter((k) => Math.abs(measured[k] - ORDER[k]) > 0.25);
        ok("!! *** EVERY INTEGRATOR CONVERGES AT THE ORDER THE TABLE CLAIMS FOR IT ***", wrong.length === 0,
            Object.entries(measured).map(([k, v]) => `${k} ${v.toFixed(2)} (ORDER ${ORDER[k]})`).join(", ") +
            (wrong.length ? "  <- DISAGREES: " + wrong.join(", ") : ""));
        ok("!! ...and stepRK4 really does buy two more orders than verlet for its four evaluations",
            measured.rk4 - measured.verlet > 1.7,
            `rk4 ${measured.rk4.toFixed(2)} against verlet ${measured.verlet.toFixed(2)} -- the whole reason ` +
            "a four-evaluation method is ever worth a two-evaluation one");
    }
}

// 10. *** THE MATCHED PAIR: SAME ORDER, SAME COST, ONE LINE APART, AND ONLY ONE OF THEM KEEPS THE PLANET ***
//
// This is the section the explicit-Euler companion exists for. verlet-vs-rk4 varies ORDER and SYMPLECTICITY at
// once, so it cannot say which one is responsible. euler-vs-eulerSymplectic holds the order fixed at 1 and
// varies only whether the position step uses the new velocity.
{
    ok("!! the pair really is matched on order -- that is what makes it a control",
        ORDER.euler === ORDER.eulerSymplectic && SYMPLECTIC.euler !== SYMPLECTIC.eulerSymplectic,
        `order ${ORDER.euler} vs ${ORDER.eulerSymplectic}, symplectic ${SYMPLECTIC.euler} vs ${SYMPLECTIC.eulerSymplectic}`);

    // ...and they had better not have been quietly collapsed into one function.
    const s0 = atPerihelion(1, 0.5, 1);
    const a1 = stepEuler(s0, 0.01, 1), b1 = stepEulerSymplectic(s0, 0.01, 1);
    ok("!! the two steppers are genuinely different code paths, not an alias",
        a1.x !== b1.x || a1.y !== b1.y, `euler x=${a1.x} symplectic x=${b1.x}`);
    // The velocity update is IDENTICAL in both -- only the position differs. If that stopped being true, the
    // pair would no longer be controlled and the comparison below would be measuring something else.
    ok("...and they differ ONLY in the position step -- the velocities are bit-identical",
        a1.vx === b1.vx && a1.vy === b1.vy);

    const OPTS = { a: 1, e: 0.5, mu: 1, stepsPerOrbit: 400, orbits: 200 };
    const ex = integrate({ ...OPTS, integrator: "euler" });
    const sy = integrate({ ...OPTS, integrator: "eulerSymplectic" });
    ok("!! *** EXPLICIT EULER LOSES THE ORBIT ENTIRELY -- it goes UNBOUND partway through the run ***",
        ex.unboundAtOrbit !== null && !Number.isFinite(ex.semiMajorDrift),
        `unbound at orbit ${ex.unboundAtOrbit === null ? "never" : ex.unboundAtOrbit.toFixed(2)}, semiMajorDrift ${ex.semiMajorDrift}`);
    ok("!! ...while its symplectic twin is STILL ON THE ELLIPSE after the same 200 orbits",
        sy.unboundAtOrbit === null && sy.semiMajorDrift < 1e-2,
        `semiMajorDrift ${sy.semiMajorDrift.toExponential(3)}`);
    ok("...and the symplectic twin's energy error is BOUNDED, not merely small",
        Math.abs(sy.energyGrowthRatio - 1) < 1e-3, `growth ratio ${sy.energyGrowthRatio.toFixed(6)}`);
}

// 11. *** ANGULAR MOMENTUM: AN EXACT ALGEBRAIC IDENTITY, NOT A TOLERANCE ***
//
// For a central force a is parallel to x, so x cross a = 0. One step of each method then gives
//     symplectic Euler / velocity Verlet   L' = L                    exactly
//     explicit Euler                       L' = L + dt^2 (v cross a) exactly
// Both halves are checked: the prediction for the one that fails, and machine zero for the two that do not.
{
    const s0 = atPerihelion(1, 0.5, 1), L0 = angularMomentum(s0);
    const r2 = s0.x * s0.x + s0.y * s0.y, r = Math.sqrt(r2), k = -1 / (r2 * r);
    const ax = k * s0.x, ay = k * s0.y;

    // *** THE TOLERANCE IS SET BY CANCELLATION, NOT CHOSEN BY EYE. *** dL is a difference of two numbers of
    // size |L0| ~ 0.87, so it cannot be more accurate than an ulp of L0 no matter how right the formula is.
    // A first draft used a 1e-12 RELATIVE tolerance and failed at dt=1e-4 on a dL of 6.9e-8 -- eight digits of
    // cancellation -- while the identity was exactly correct. Same lesson as v3990's rel() near zero.
    const ULP = 8 * Number.EPSILON * Math.abs(L0);
    for (const dt of [1e-2, 1e-3, 1e-4]) {
        const predicted = dt * dt * (s0.vx * ay - s0.vy * ax);
        const actual = angularMomentum(stepEuler(s0, dt, 1)) - L0;
        ok(`!! explicit Euler's one-step dL matches dt^2 (v x a) at dt=${dt}`,
            Math.abs(actual - predicted) <= ULP,
            `predicted ${predicted.toExponential(9)} actual ${actual.toExponential(9)} diff ${Math.abs(actual - predicted).toExponential(2)} <= ${ULP.toExponential(2)}`);
        ok(`...and BOTH symplectic methods move L by less than one ulp at dt=${dt}`,
            Math.abs(angularMomentum(stepEulerSymplectic(s0, dt, 1)) - L0) <= ULP &&
            Math.abs(angularMomentum(stepVerlet(s0, dt, 1)) - L0) <= ULP);
    }

    // *** FLAT IN dt IS THE SIGNATURE OF A STRUCTURAL PROPERTY. *** An approximated quantity gets better as the
    // step shrinks; a preserved one is already exact and only accumulates round-off. Run the same physical time
    // at four step sizes and look at how the angular-momentum error responds.
    const sweep = {};
    for (const k2 of Object.keys(INTEGRATORS)) {
        sweep[k2] = [400, 800, 1600, 3200].map((spo) =>
            integrate({ a: 1, e: 0.5, mu: 1, integrator: k2, stepsPerOrbit: spo, orbits: 10 }).angularMomentumErr);
    }
    for (const k2 of Object.keys(INTEGRATORS)) {
        const v = sweep[k2], span = Math.max(...v) / Math.max(1e-300, Math.min(...v));
        if (SYMPLECTIC[k2]) {
            ok(`!! ${k2} (symplectic): L error is at round-off and FLAT across an 8x change in dt`,
                Math.max(...v) < 1e-12 && span < 20,
                `${v.map((x) => x.toExponential(1)).join(" -> ")}  (span ${span.toFixed(1)}x)`);
        } else {
            // TWO WAYS TO FAIL "preserved at round-off", AND THEY FIRE ON DIFFERENT INTEGRATORS -- so the
            // detail names which one, rather than letting the reader assume it was the span. RK4 is caught by
            // the SPAN (3.3e4x: its L error is a genuine dt-dependent approximation, converging fast).
            // Explicit Euler is caught by MAGNITUDE: its span is only ~3x, because by then the orbit itself has
            // been destroyed and the error is no longer tracking dt at all -- it sits 13 orders above round-off.
            const bySpan = span > 20, byMag = Math.max(...v) > 1e-9;
            ok(`!! ${k2} (not symplectic): L error is NOT preserved at round-off`,
                bySpan || byMag,
                `${v.map((x) => x.toExponential(1)).join(" -> ")}  (span ${span.toExponential(1)}x) -- caught by ` +
                (bySpan && byMag ? "SPAN and MAGNITUDE" : bySpan ? "SPAN (dt-dependent approximation)" : "MAGNITUDE (orbit already wrecked; span alone would not catch it)"));
        }
    }
}

// 12. *** THE COMPANION EXPOSED A BLIND SPOT IN THIS FILE'S OWN HEADLINE DETECTOR ***
//
// energyGrowthRatio = maxErr(second half)/maxErr(first half) SATURATES: |(E-E0)/E0| cannot exceed 1 while the
// orbit is bound, so an integrator bad enough to wreck the orbit in the first half has nothing left to grow in
// the second. The check below asserts the INVERSION as a fact about the metric, so that nobody later reads the
// ratio as a quality score. It is not a bug to fix -- the ratio answers a different question correctly.
{
    const OPTS = { a: 1, e: 0.5, mu: 1, stepsPerOrbit: 400 };
    const inversions = [];
    for (const orbits of [5, 20, 200]) {
        const ex = integrate({ ...OPTS, orbits, integrator: "euler" });
        const rk = integrate({ ...OPTS, orbits, integrator: "rk4" });
        if (ex.energyGrowthRatio < rk.energyGrowthRatio) inversions.push(`${orbits}orb: euler ${ex.energyGrowthRatio.toFixed(3)} < rk4 ${rk.energyGrowthRatio.toFixed(3)}`);
    }
    ok("!! *** energyGrowthRatio RANKS EXPLICIT EULER AHEAD OF RK4 -- at every run length tested ***",
        inversions.length === 3, inversions.join(" | ") || "no inversion found -- the saturation claim in the header would then be wrong");

    // ...and the two non-saturating companions get it right, which is why they exist.
    const ex = integrate({ ...OPTS, orbits: 200, integrator: "euler" });
    const rk = integrate({ ...OPTS, orbits: 200, integrator: "rk4" });
    ok("!! ...while semiMajorDrift does NOT invert -- it is Infinity for the one that lost the planet",
        !Number.isFinite(ex.semiMajorDrift) && rk.semiMajorDrift < 1e-4,
        `euler ${ex.semiMajorDrift} vs rk4 ${rk.semiMajorDrift.toExponential(2)}`);
    ok("...and unboundAtOrbit names the moment, which a ratio cannot",
        ex.unboundAtOrbit !== null && rk.unboundAtOrbit === null,
        `euler left at orbit ${ex.unboundAtOrbit.toFixed(2)}, rk4 never`);
}

// 12b. SABOTAGE: swapping the two lines of symplectic Euler turns it back into explicit Euler, and section 11
// must notice. This is the sharpest sabotage available here -- the "broken" version is not invented, it is the
// other shipped integrator, so a check that survived it would be reading the NAME rather than the arithmetic.
{
    const accel = (x, y, mu) => { const r2 = x * x + y * y, r = Math.sqrt(r2), k = -mu / (r2 * r); return [k * x, k * y]; };
    const sabotaged = (s, dt, mu = 1) => {           // velocity updated LAST -- i.e. plain explicit Euler
        const [ax, ay] = accel(s.x, s.y, mu);
        return { x: s.x + s.vx * dt, y: s.y + s.vy * dt, vx: s.vx + ax * dt, vy: s.vy + ay * dt };
    };
    const s0 = atPerihelion(1, 0.5, 1), L0 = angularMomentum(s0), ULP = 8 * Number.EPSILON * Math.abs(L0);
    const dL = Math.abs(angularMomentum(sabotaged(s0, 1e-2, 1)) - L0);
    ok("!! SABOTAGE: a symplectic Euler with its two lines swapped fails the one-ulp angular-momentum check",
        dL > ULP, `moved L by ${dL.toExponential(3)}, ulp floor ${ULP.toExponential(2)}`);
    const real = stepEulerSymplectic(s0, 1e-2, 1), fake = sabotaged(s0, 1e-2, 1);
    ok("...and the sabotage is exactly the shipped explicit stepper, bit for bit",
        fake.x === stepEuler(s0, 1e-2, 1).x && fake.vx === stepEuler(s0, 1e-2, 1).vx && real.x !== fake.x);
}

// 12c. THE BOUNDARY WITH physics/stabilityMeter.mjs IS DECLARED, SO IT CAN BE ENFORCED.
// That module already owns explicit / implicit / symplectic Euler on the harmonic oscillator. This one adds the
// nonlinear central-force fixture and the angular-momentum identity. IMPLICIT Euler belongs to stabilityMeter
// and must not sprout a second implementation here -- that is how three definitions of one judgement end up
// disagreeing, which this tree has paid for before.
{
    const src = (await import("node:fs")).readFileSync(new URL("./kepler.js", import.meta.url), "utf8");
    ok("!! kepler.js does NOT carry a second implicit-Euler implementation",
        !/stepImplicit|implicitEuler|backwardEuler/.test(src) && !("implicit" in INTEGRATORS),
        "stabilityMeter.mjs owns that one, with the reciprocity identity as its answer key");
    ok("...and the header says so, rather than leaving the reader to discover the overlap",
        /stabilityMeter\.mjs/.test(src));
}

// 13. browser-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("./kepler.js", import.meta.url), "utf8");
    ok("kepler.js imports nothing and uses no DOM", !/^\s*import\s/m.test(src) && !/\bwindow\.|\bdocument\./.test(src));
}

console.log("kepler-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
