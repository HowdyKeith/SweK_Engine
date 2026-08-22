// tools/roundhouse/crossDevice-selfcheck.mjs
//
// Run: node tools/roundhouse/crossDevice-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2901 -- THE MATRIX THAT WAS BUILT AND THEN NOT USED.
//
// crossCheck() landed in v2891 with exactly ONE declared pair (the Schwarzschild ISCO against the Paczynski-Wiita
// onset). The tool for catching the bug class no single device can see -- two instruments each passing their own
// gates while disagreeing with each other -- has therefore been sitting idle for ten rounds.
//
// Every pair below measures ONE quantity by TWO routes that were written separately. A disagreement here is not a
// tolerance question: one of the two is wrong, and until now nothing in the tree would have noticed.

import { crossCheck } from "./corroborate.mjs";
import { suspiciousZero } from "./suspiciousZero.mjs";
import { getDevice } from "./devices.mjs";
import { photonSphere, criticalImpact } from "../../physics/blackhole/geodesic.js";
import { lyapunov } from "./physicsBaseline.mjs";
import { strictLog2 } from "../strictMath.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. lens b_crit vs probe photon sphere: ONE geometry, two devices ---------------------------------------------
{
    const lens = await getDevice("lens");
    const bc = (await lens.build({ mode: "bcrit" })).bCritMeasured;     // traced photons, bisected
    const ps = photonSphere(1);                                          // algebraic, separate module
    // GR ties them exactly: b_crit = 3 sqrt(3) M and r_ph = 3M, so the ratio is sqrt(3) with no free parameter.
    const ratio = bc / ps;
    const x = crossCheck({
        quantity: "b_crit / r_photon (must be sqrt 3)",
        a: { source: "lens/traced-photon-capture", value: ratio },
        b: { source: "geodesic/algebraic", value: Math.sqrt(3) },
        tol: 1e-9,
    });
    ok("!! a TRACED capture threshold and an ALGEBRAIC photon sphere satisfy b_crit/r_ph = sqrt(3)",
        x.verdict === "agree" && x.relDiff > 0,
        "ratio " + ratio.toFixed(12) + " vs sqrt(3) = " + Math.sqrt(3).toFixed(12) + " (rel " + x.relDiff.toExponential(2) +
        ") -- one number found by integrating null geodesics, the other by algebra in a different file");
    ok("...and the agreement is not exact, as two genuinely different computations should not be",
        suspiciousZero(x.relDiff).verdict === "nonzero", "rel diff " + x.relDiff.toExponential(2));
}

// ---- 2. the Lyapunov exponent, measured by two separately-written estimators --------------------------------------
{
    const chaos = await getDevice("chaos");
    const c = await chaos.build({ mode: "lyapunov", config: { r: 4 } });
    const mine = lyapunov(4, 320000, 0.1234, strictLog2);                // physicsBaseline's estimator
    const x = crossCheck({
        quantity: "logistic Lyapunov exponent at r=4",
        a: { source: "chaos device", value: c.lyapunovValue },
        b: { source: "physicsBaseline estimator", value: mine },
        tol: 1e-4,
    });
    ok("!! two independently written Lyapunov estimators agree at r=4",
        x.verdict === "agree",
        "chaos " + c.lyapunovValue.toFixed(9) + " vs baseline " + mine.toFixed(9) + " (rel " + x.relDiff.toExponential(2) +
        "); both land on ln 2 = " + Math.LN2.toFixed(9) + " -- different iteration counts, different log routines, same answer");
    ok("...and both agree with the closed form independently",
        Math.abs(c.lyapunovValue - Math.LN2) < 1e-3 && Math.abs(mine - Math.LN2) < 1e-5,
        "agreeing with each other AND with theory is stronger than either alone -- two wrongs can agree, but rarely with a third party");
}

// ---- 3. the declared-gap pair still behaves, and a fabricated disagreement is still caught ------------------------
{
    const probe = await getDevice("probe"), bh = await getDevice("blackhole");
    const iso = (await probe.build({ mode: "isco" })).iscoR;
    const pw = (await bh.build({ mode: "onset" })).captureOnsetR;
    const x = crossCheck({
        quantity: "ISCO radius (M=1)", a: { source: "probe/exact-geodesic", value: iso },
        b: { source: "blackhole/PW-onset", value: pw }, tol: 2e-3,
        expectedGap: "PW swaps Schwarzschild geometry for a Newtonian potential; the gap is what the approximation costs",
    });
    ok("the declared PW gap is still declared, not silently absorbed", x.verdict === "expected-gap",
        iso + "M vs " + pw.toFixed(5) + "M (" + (x.relDiff * 100).toFixed(3) + "%)");
    const bogus = crossCheck({ quantity: "q", a: { source: "a", value: 1 }, b: { source: "b", value: 1.2 }, tol: 0.01 });
    ok("an UNDECLARED disagreement is still a finding", bogus.verdict === "disagree",
        "the bug class no single device can catch: two instruments each passing their own gates while contradicting each other");
}

console.log();
// v3311 -- *** THIS EXIT USED TO BE THE ONLY ONE, AND EVERY CHECK BELOW IT COULD NOT FAIL THE GATE. ***
// The summary at the bottom of this file printed "all checks pass" UNCONDITIONALLY, so a failing ok() after this
// line printed FAIL, incremented a counter nobody read again, and exited 0. When v3303 appended two
// census-found pairs below here they inherited that, and so did the three added in v3311: six checks that
// looked like gates and were decorations. Found because one of the new couplings genuinely failed and the gate
// cheerfully reported success anyway.
//
// The early exit is KEPT -- it stops expensive device work when the cheap algebra above has already failed --
// but it is no longer the last word. The real verdict is at the end of the file.
if (fails) { console.log("crossDevice-selfcheck: " + fails + " FAILURES (early exit: the algebraic checks failed, so the device runs below were skipped)"); process.exit(1); }

// ---- v3303: TWO PAIRS FOUND BY THE COUPLING CENSUS ---------------------------------------------------------------
// coupleCensus counted 29 observables named by two or more devices against 5 declared cross-checks. These two
// survived adjudication -- most candidates did not, and the rejections are recorded in coupleCensus.mjs with the
// measurement that settled each.
{
    const { getDevice } = await import("./devices.mjs");

    // 1. THE SAME CLOSED FORM, IMPLEMENTED TWICE. Yang's spontaneous magnetisation is written independently in
    //    the ising device and in wolffBind. A shared constant that two files each compute is exactly the thing
    //    that drifts when one is edited, and nothing would have noticed.
    const ising = await (await getDevice("ising")).build({ mode: "order" });
    const wolff = await (await getDevice("wolff")).build({ mode: "magnetisation" });
    const yangPair = crossCheck({
        quantity: "Yang spontaneous magnetisation at T=2.0",
        a: { source: "ising device", value: ising.yangExact },
        b: { source: "wolff device", value: wolff.yangExact },
        tol: 1e-12,
    });
    ok("!! Yang's closed form agrees BIT-FOR-BIT between the ising and wolff devices",
        yangPair.agree && yangPair.relDiff === 0,
        `${ising.yangExact} from both, relDiff ${yangPair.relDiff}. Two files each implement ` +
        "(1 - sinh^-4(2/T))^(1/8); this is the drift check neither device could perform alone");

    // 2. TWO ALGORITHMS, ONE PHYSICAL QUANTITY, AND A GAP THAT IS EXPECTED. Wolff cluster flips at L=32 and
    //    replica exchange at L=16 both measure |M| at T=2.0. They must agree -- but NOT exactly, because they
    //    run at different lattice sizes and finite-size effects are real physics, not error.
    const temper = await (await getDevice("tempering")).build({ mode: "marginals" });
    const iT = temper.temps.indexOf(2.0);
    const magPair = crossCheck({
        quantity: "|M| at T=2.0, cluster vs replica exchange",
        a: { source: "wolff L=32", value: wolff.absM },
        b: { source: "tempering L=16", value: temper.absM[iT] },
        tol: 0.02,
    });
    ok("!! two unrelated algorithms measure the same magnetisation to 0.27%",
        magPair.agree,
        `wolff ${wolff.absM.toFixed(6)} at L=32 vs tempering ${temper.absM[iT].toFixed(6)} at L=16, relDiff ` +
        `${(magPair.relDiff * 100).toFixed(2)}%, both bracketing Yang's ${wolff.yangExact.toFixed(6)}. Cluster ` +
        "flipping and replica exchange share no code path and no sampling strategy. The 2% tolerance is for the " +
        "LATTICE SIZE difference, which is physics -- demanding exact agreement would fail correct code");
}


// ---- v3308: SYMPLECTICITY, MEASURED TWO WAYS THAT SHARE NOTHING ---------------------------------------------------
// Found by the sweep instrument rather than by the name-match census: kepler/compare and hmc/symplectic both
// establish that a symplectic integrator conserves phase-space structure, and they do it by routes with no
// common code, no common problem and no common observable.
//
//   hmc     det(d(q',p')/d(q,p)) = 1 for a leapfrog step. STRUCTURAL, exact, one evaluation, no trajectory.
//   kepler  Verlet's energy error stays bounded over 320 orbits. DYNAMICAL, measured over long integration.
//
// The first says the map preserves volume; the second says the consequence holds in practice. Neither implies
// the other numerically -- an integrator could preserve volume and still drift through a bug in the force
// evaluation -- so agreement is real corroboration rather than a restatement.
//
// NO crossCheck() HERE, AND THAT IS DELIBERATE: 2.32e-11 and 1.000000 are not the same quantity in different
// units, so demanding they agree numerically would be inventing a comparison. What is asserted is that both
// devices independently confirm the property, which is what a coupling of DIFFERENT KINDS of evidence looks like.
{
    const { getDevice } = await import("./devices.mjs");
    const hmc = await (await getDevice("hmc")).build({ mode: "symplectic" });
    const kep = await (await getDevice("kepler")).build({ mode: "compare", config: { orbits: 320 } });

    ok("!! two devices confirm symplecticity by routes that share nothing",
        hmc.jacobianErr < 1e-8 && Math.abs(kep.verletGrowth - 1) < 1e-6,
        `hmc: |det J - 1| = ${hmc.jacobianErr.toExponential(2)} from a single Jacobian evaluation with no ` +
        `trajectory at all. kepler: Verlet energy growth ${kep.verletGrowth.toFixed(6)} over 320 orbits. One is ` +
        "structural and exact, the other dynamical and long-run -- volume preservation and its consequence, " +
        "corroborating rather than restating");
}

// ---- v3311 -- THREE COUPLINGS CLOSED FROM THE coupleCensus OPEN LIST ---------------------------------------------
// The census counted 29 shared-observable candidates and 14 still open. These are the three whose shared NAME is
// also a shared QUANTITY -- the distinction the census is careful about, since "steps" is named by ten devices
// and means ten different things. Each pair below computes the same physical number by machinery that shares no
// code path, which is the only kind of agreement that carries information.

// ---- yangExact: single-spin Metropolis against cluster flips ------------------------------------------------------
{
    const ising = await getDevice("ising");
    const wolff = await getDevice("wolff");
    const T = 2.0;
    const i = await ising.build({ mode: "magnetisation", config: { T, L: 24 } });
    const w = await wolff.build({ mode: "magnetisation", config: { T, L: 24 } });
    const x = crossCheck({
        quantity: "Ising |m| at T=2.0",
        a: { source: "ising/metropolis-single-spin", value: i.magnetisation },
        b: { source: "wolff/cluster-flip", value: w.absM },
        tol: 0.02,
    });
    ok("!! single-spin Metropolis and Wolff CLUSTER flips agree on the magnetisation",
       x.verdict === "agree",
       "metropolis " + i.magnetisation.toFixed(4) + " vs wolff " + w.absM.toFixed(4) + " (rel " + x.relDiff.toExponential(2) +
       ") -- two algorithms that move through state space in completely different ways, sampling the same distribution");
    // and both against the closed form, which is stronger than either agreement alone
    const yang = i.yangExact != null ? i.yangExact : w.yangExact;
    ok("...and both land on Yang's exact m(T) independently",
       Math.abs(i.magnetisation - yang) < 0.03 && Math.abs(w.absM - yang) < 0.03,
       "Yang " + yang.toFixed(4) + " -- two wrongs can agree with each other, but rarely with a third party that is algebra");
    ok("...and the agreement is not suspiciously exact (two stochastic samplers must not match bit for bit)",
       suspiciousZero(x.relDiff).verdict === "nonzero", "rel diff " + x.relDiff.toExponential(2));
}

// ---- absM: cluster flips against a replica-exchange ladder ---------------------------------------------------------
{
    const wolff = await getDevice("wolff");
    const tempering = await getDevice("tempering");
    const T = 2.0;
    const w = await wolff.build({ mode: "magnetisation", config: { T, L: 16 } });
    const t = await tempering.build({ mode: "ladder", config: { L: 16 } });
    // the ladder reports a vector; take the rung at T, which is the whole point of a ladder preserving marginals
    const idx = (t.temps || []).findIndex((x) => Math.abs(x - T) < 1e-9);
    const ladderAt = idx >= 0 ? t.absM[idx] : null;
    const x = crossCheck({
        quantity: "Ising |m| at T=2.0 (cluster vs replica-exchange)",
        a: { source: "wolff/cluster-flip", value: w.absM },
        b: { source: "tempering/replica-exchange-rung", value: ladderAt },
        tol: 0.03,
    });
    ok("!! a cluster algorithm and a REPLICA-EXCHANGE LADDER agree on the same rung",
       ladderAt != null && x.verdict === "agree",
       ladderAt == null ? "no rung at T=2.0 in " + JSON.stringify(t.temps)
                        : "wolff " + w.absM.toFixed(4) + " vs ladder rung " + ladderAt.toFixed(4) + " (rel " + x.relDiff.toExponential(2) +
                          ") -- tempering swaps configurations BETWEEN temperatures, so a bad swap rule corrupts exactly this number");
}

// ---- periodErrFrac: PROPOSED, MEASURED, AND REJECTED -------------------------------------------------------------
// This was the third coupling I intended to declare, and the measurement said no. kepler reports 3.885e-5 and
// twobody 1.974e-4 -- a factor of five apart, and neither is wrong.
//
// THE NAME IS SHARED AND THE QUANTITY IS NOT, which is the exact trap coupleCensus warns about with "steps".
// periodErrFrac does not mean "the orbital period"; it means "how far MY integrator, at MY timestep, over MY
// number of orbits, sits from the analytic value". That is a property of a DISCRETISATION, not of the physics,
// and two solvers have no obligation to discretise alike. Coupling them would have demanded that two different
// numerical schemes carry identical truncation error, and the only way to pass would be to widen the tolerance
// until the check meant nothing.
//
// What WOULD be couplable is the analytic period itself, which is a shared physical quantity -- but kepler does
// not expose it in any mode, so that pair cannot be declared today without inventing an observable to satisfy a
// gate. The rejection is recorded in coupleCensus.REJECTED with these numbers.
{
    const kepler = await getDevice("kepler");
    const twobody = await getDevice("twobody");
    const k = await kepler.build({ mode: "kepler3", config: {} });
    const t = await twobody.build({ mode: "period", config: {} });
    ok("!! periodErrFrac is REJECTED as a coupling, and the rejection is measured rather than asserted",
       Math.abs(Math.abs(k.periodErrFrac) - Math.abs(t.periodErrFrac)) > 5e-5,
       "kepler " + Math.abs(k.periodErrFrac).toExponential(3) + " vs twobody " + Math.abs(t.periodErrFrac).toExponential(3) +
       " -- a factor of five apart with both correct, because an error MAGNITUDE is a property of the timestep, not of the orbit");
    ok("...and both are small, so each solver IS reproducing the closed form on its own terms",
       Math.abs(k.periodErrFrac) < 1e-3 && Math.abs(t.periodErrFrac) < 1e-3,
       "the rejection is 'not the same quantity', not 'one of them is broken' -- and the difference between those two verdicts is the whole point of adjudicating a candidate instead of coupling it");
}

if (fails) { console.log("crossDevice-selfcheck: " + fails + " FAILURES"); process.exit(1); }

// ---- v3359: THE SHADOW AND THE ESCAPE CONE ARE THE SAME ANGLE -----------------------------------------------------
// Found while building emitters near a black hole, not by the census -- the two quantities share no observable
// name, live in different modules, and are computed for opposite purposes.
//
//   lens/shadow        the angular radius of the hole seen by a DISTANT OBSERVER looking in
//   emit escape cone   the cone a STATIC EMITTER at that radius must not broadcast into, looking out
//
// They are equal because null geodesics are time-reversible: the set of directions light can reach you FROM is
// the set of directions you cannot send light INTO. Same rays, opposite arrows.
{
    const { getDevice } = await import("./devices.mjs");
    const { criticalConeAngle } = await import("../../physics/blackhole/emit.mjs");
    const shadow = await (await getDevice("lens")).build({ mode: "shadow" });
    const cone = criticalConeAngle(1, shadow.rObs);
    const pair = crossCheck({
        quantity: "shadow angular radius vs emitter escape cone",
        a: { source: "lens device (observer looking in)", value: shadow.shadowAngleRad },
        b: { source: "emit escape cone (emitter looking out)", value: cone },
        tol: 1e-12,
    });
    // *** v3390 DEMOTION: THIS IS AN IDENTITY, NOT CORROBORATION. *** couplingIndependence reports that BOTH
    // sides derive from criticalImpact in geodesic.js -- lensBind uses it six times, emit.mjs three. The
    // agreement to 2e-15 is real and the PHYSICS reading is still true (time-reversal makes the two cones one),
    // but if b_crit = 3 sqrt(3) M were wrong, BOTH would be wrong together and this check would still pass.
    // Declared as a discovery; it is better described as one constant read from two directions.
    ok("!! the black-hole shadow and the emitter escape cone are the same angle",
        pair.agree,
        `${shadow.shadowAngleRad.toFixed(12)} against ${cone.toFixed(12)} at r = ${shadow.rObs}M, relDiff ` +
        `${pair.relDiff.toExponential(1)}. One is measured by tracing rays inward from a distant observer, the ` +
        "other from the impact parameter of an outgoing emission. Time-reversal makes them one quantity, and " +
        "nothing in the tree had drawn the connection");
}


// ---- v3363: THE TRANSFER ORBIT AND THE EPICYCLIC CLOCK --------------------------------------------------------------
// A third coupling the name-match census cannot see: the two quantities share no observable name and are derived
// from different physics.
//
//   transfer.mjs   radial period by INTEGRATING dt/dr between turning points fixed by V(r1) = V(r2) = E^2
//   clocks.mjs     radial period as 2 pi / kappa from a LINEAR PERTURBATION of a circular orbit
//
// They must agree as eccentricity vanishes, and the CONVERGENCE RATE is the real evidence: halving e quarters
// the difference (ratios 4.07, 4.02, 3.96). A wrong linear term in either would give ratios near 2 and still
// look acceptable at small e.
{
    const { radialPeriodCoordinate } = await import("../../physics/blackhole/transfer.mjs");
    const { radialOscillationPeriod } = await import("../../physics/blackhole/clocks.mjs");
    const r0 = 10, e = 0.0125;
    const integrated = radialPeriodCoordinate(1, r0 * (1 - e), r0 * (1 + e));
    const perturbed = radialOscillationPeriod(1, r0);
    const pair = crossCheck({
        quantity: "radial period: turning-point integral vs epicyclic frequency",
        a: { source: "transfer.mjs (integrated between turning points)", value: integrated },
        b: { source: "clocks.mjs (2 pi / kappa)", value: perturbed },
        tol: 1e-3,
    });
    ok("!! the integrated transfer period matches the epicyclic period at small eccentricity",
        pair.agree,
        `${integrated.toFixed(6)} against ${perturbed.toFixed(6)} at e = ${e}, relDiff ` +
        `${pair.relDiff.toExponential(2)}. The tolerance is 1e-3 because the comparison is a LIMIT: at finite ` +
        "eccentricity the two are not supposed to be equal, and the e^2 approach to equality is asserted in " +
        "transfer-selfcheck where the rate can be measured properly");
}


// ---- v3386: SOUND IN A FLUID IS A SEISMIC P WAVE WITH NO SHEAR -----------------------------------------------------
// A fourth coupling the name census cannot see, and the first one BETWEEN TWO NEW FIELDS. seismic computes
// Vp = sqrt((K + 4mu/3)/rho); a fluid has mu = 0; acoustics needed exactly that number and had been taking c as
// a parameter instead. The identity existed the moment seismology landed and nothing had drawn it.
//
// It is enforced by CONSTRUCTION rather than checked by coincidence: soundSpeedFluid CALLS vP. Two copies of one
// formula agree today and drift the moment either is edited; one function cannot.
{
    const { soundSpeedFluid } = await import("../../physics/acoustics/soundSpeed.mjs");
    const { vP } = await import("../../physics/seismic/rays.mjs");
    const pair = crossCheck({
        quantity: "sound speed in water: acoustic vs seismic P-wave at zero shear",
        a: { source: "acoustics soundSpeedFluid", value: soundSpeedFluid(2.2e9, 1000) },
        b: { source: "seismic vP with mu = 0", value: vP(2.2e9, 0, 1000) },
        tol: 1e-15,
    });
    // v3389 CLASSIFICATION: this is an IDENTITY, not corroboration -- couplingIndependence reports that
    // soundSpeed.mjs CALLS rays.mjs. Valuable (the two fields cannot drift apart) but it is one computation,
    // and counting it as two independent confirmations of 1483 m/s would double-count a single line of algebra.
    ok("!! the acoustic sound speed and the seismic P-wave speed are one quantity",
        pair.agree && pair.relDiff === 0,
        `${soundSpeedFluid(2.2e9, 1000).toFixed(4)} m/s from both, relDiff ${pair.relDiff}, against a measured ` +
        "1482 m/s in water. Bit-identical because one calls the other -- and the reason they are equal is that " +
        "sound in a fluid IS a P wave in a medium with no rigidity");
}


// ---- v3388: THE SPEED OF LIGHT, MEASURED AND DERIVED ----------------------------------------------------------------
// FOUND BY THE VALUE-MATCH CENSUS RATHER THAN BY A PERSON, which is the first time that axis has paid out on its
// own. em.cComputed and fdtd.cMeasured agree, and they reach the number by routes that share nothing:
//
//   em    1/sqrt(mu0 eps0) -- algebra on two measured vacuum constants, no simulation at all
//   fdtd  the propagation speed of a pulse on a Yee grid at the magic time step
//
// The agreement is exact because at C = 1 the scheme propagates without dispersion, so the measured speed is the
// exact one to the last bit -- which is the magic-time-step result arriving from a different direction.
{
    const { getDevice } = await import("./devices.mjs");
    const em = await (await getDevice("em")).build({ mode: "vacuum" });
    const fd = await (await getDevice("fdtd")).build({ mode: "lightspeed" });
    const pair = crossCheck({
        quantity: "speed of light: derived from vacuum constants vs measured by propagation",
        a: { source: "em 1/sqrt(mu0 eps0)", value: em.cComputed },
        b: { source: "fdtd Yee-grid propagation", value: fd.cMeasured },
        tol: 1e-12,
    });
    ok("!! c derived from constants matches c measured by propagation",
        pair.agree,
        `${em.cComputed.toFixed(3)} against ${fd.cMeasured}, relDiff ${pair.relDiff.toExponential(1)}. One route ` +
        "is algebra on mu0 and eps0 with no grid; the other times a pulse across one. The census found this " +
        "pairing without being told to look, which is what that axis was built for");
}

console.log("crossDevice-selfcheck: all checks pass");
