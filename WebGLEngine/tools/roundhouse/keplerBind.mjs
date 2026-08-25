// tools/roundhouse/keplerBind.mjs
//
// v2820 -- roundhouse device: TWO-BODY ORBITS. Unusual among the devices because its most interesting observable
// is not about the physics at all -- it is about the NUMERICAL METHOD. energyGrowthRatio distinguishes an error
// that oscillates and returns from one that accumulates forever, and no amount of per-step accuracy changes it.
//
// Modes:
//   "conserve"  -- run one integrator for many orbits. Reports the energy error in each half of the run and the
//                  ratio between them: ~1 means BOUNDED, >1 means still climbing.
//   "kepler3"   -- fit log T against log a across five orbits. Slope must be EXACTLY 3/2, and the period is
//                  MEASURED from perihelion passages by a detector that knows no formula.
//   "closure"   -- apsidal precession per orbit. A 1/r^2 force closes exactly, so any rotation is the
//                  integrator, not the physics.
//   "compare"   -- verlet against rk4 over the same run, reporting the ratio between their drifts. This is where
//                  the honest nuance lives: RK4 is MORE accurate per step and WORSE over time.
//
// v3993 -- kepler.js registers FOUR integrators now; `compare` still reports the verlet/rk4 pair only, and
// deliberately: its five output fields are FROZEN IN lab-results-baseline.json under a strict-subset check with
// zero unique keys, so adding fields here would be a baseline change dressed up as a feature. The two
// first-order methods reach every other mode through the `integrator` config instead, and the matched-pair
// finding they exist for -- same order, one line apart, one of them loses the planet -- is gated where it
// belongs, in physics/orbits/kepler-selfcheck.mjs sections 10-12.

import { auditConservation } from "./conservation.mjs";
import { integrate, measurePeriod, keplerThirdLaw, apsidalPrecession, period, visViva, eccentricityVector, atPerihelion, INTEGRATORS } from "../../physics/orbits/kepler.js";
import { ELEMENTS, period as ssPeriod, specificEnergy, specificAngMom, planetState } from "../../physics/solarSystem.js";

// v3421 -- *** THE MODE LIST WAS DECLARED TWICE HERE TOO, AND THE TWO COPIES ALREADY DISAGREED: the guard below
// accepted "kepler3" while `modes:` never listed it. SO kepler3 IS A WORKING MODE NOBODY CAN DISCOVER -- it
// produces the Kepler-III slope, and it is invisible to the census, to checkMode's declaration test, to lab
// export and to every tool that reads the registry. A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE. ***
// Found by adding a mode, which is the second time in two rounds that adding one exposed a duplicated list.
// v3762 -- "startspeed" is the mode plant. It runs the kepler3 branch, so periodErrFrac (which that branch
// reports) is its flipped observable -- the MODE-PLANT CONTRACT, since an observable living only in the
// plant's own branch reads DECLARED BUT DEAD.
// *** v3762 -- kepler3 IS FIRST IN THIS LIST ON PURPOSE, AND THE DEFAULT MODE IS STILL "conserve".
// plantedCoverage compares a mode plant against `modes.find(m => m !== plantMode)` -- THE FIRST OTHER MODE --
// and with "conserve" leading, the contract compared a periodErrFrac the plant reports against a mode that
// does not report it at all, so the census read DECLARED BUT DEAD. THE PLANT IS A VARIANT OF kepler3, so
// kepler3 IS ITS CORRECT BASELINE. The device's default is set in keplerDefaults and is UNCHANGED -- this
// reorders which mode the census compares against, not what a caller gets when they ask for nothing.
// (The rule this obeys: FIX THE OBSERVABLE'S HOME, never re-declare plantFlips to something the primary
// already reports -- that would swap a real claim for a convenient one.) ***
export const KEPLER_MODES = ["kepler3", "conserve", "closure", "compare", "solar", "startspeed"];

export const KEPLER_OBSERVABLES = [
    "energyErrFirstHalf", "energyErrSecondHalf", "energyGrowthRatio", "energyErrFinal",
    "energySeries", "energyGrowthShared", "energyVerdictBounded", "energySamples", "growthGapFrac",
    "angularMomentumErr", "semiMajorDrift",
    "slopeMeasured", "slopeTheory", "slopeErrFrac", "periodErrFrac",
    "specificEnergy", "angMomentum", "energyDimensionless", "angMomDimensionless",
    "precessionPerOrbit",
    "verletGrowth", "rk4Growth", "verletFinalErr", "rk4FinalErr", "driftRatio",
    "integrator", "orbits", "eccentricity",
    "bodies", "periodRatio4to1", "periodRatioExact", "worstEnergyRelErr", "worstAngMomRelErr",
];

const DEF = { a: 1, e: 0.5, mu: 1, integrator: "verlet", stepsPerOrbit: 400, orbits: 200 };

export function keplerDefaults(hyp) {
    const h = { mode: "conserve", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    c.a = Math.min(100, Math.max(0.05, num(c.a, DEF.a)));
    // e must stay strictly below 1 or the orbit is not closed and none of the keys apply
    c.e = Math.min(0.95, Math.max(0, num(c.e, DEF.e)));
    c.stepsPerOrbit = Math.min(4000, Math.max(20, num(c.stepsPerOrbit, DEF.stepsPerOrbit) | 0));
    c.orbits = Math.min(2000, Math.max(5, num(c.orbits, DEF.orbits) | 0));
    // v3993 -- *** THE WHITELIST WAS THE REASON THE TWO NEW INTEGRATORS WOULD HAVE BEEN A DEAD OPTION. ***
    // kepler.js now registers four (euler, eulerSymplectic, verlet, rk4) and this list named two, so a caller
    // asking for either first-order method was silently handed verlet back -- an advertised knob value that
    // moves no observable, which is the v3436 nuclearBind defect exactly. Read from INTEGRATORS rather than
    // retyped, so the next one registered cannot fall out of sync with the guard.
    if (!Object.prototype.hasOwnProperty.call(INTEGRATORS, c.integrator)) c.integrator = DEF.integrator;
    h.config = c;
    if (!KEPLER_MODES.includes(h.mode)) h.mode = "conserve";
    return h;
}

export async function buildKepler(hyp, base = {}) {
    const h = keplerDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;

    if (h.mode === "solar") {
        // *** THE KEY IS AN EXACT POWER LAW OVER REAL ORBITAL ELEMENTS, AND NOTHING HERE IS TOLD THE EXPONENT.
        // *** Kepler III says P^2 = a^3 in these units, so P(4a)/P(a) must be EXACTLY 8 -- an integer, which is
        // a far harder target than a fitted slope, and one that no per-planet fudge could produce across nine
        // bodies at once. The two conserved quantities are then checked against their closed forms: the
        // specific energy is -1/(2a) and the specific angular momentum sqrt(a(1-e^2)), both of which the
        // integrator never sees.
        const ratio = ssPeriod(4) / ssPeriod(1);
        let worstE = 0, worstL = 0;
        // *** THE FIRST ELEMENT IS THE SUN, WITH a = 0, AND IT IS NOT AN ORBIT. *** Treating every row as one
        // divides by its semi-major axis and every observable comes back NaN -- which JSON prints as null, so
        // the first run reported two clean-looking nulls rather than an error. A LIST THAT INCLUDES THE PRIMARY
        // IS NOT A LIST OF ORBITS, and the planet count below says 8 for exactly that reason.
        const orbiting = ELEMENTS.filter((el) => el.a > 0);
        for (const el of orbiting) {
            const st = planetState(el.a, el.e, el.m === undefined ? 1 : el.m, 0.7);
            // Energy and angular momentum recomputed FROM THE STATE the element generated, then compared with
            // the closed form in terms of a and e -- two routes, and the state route knows no formula.
            const r = Math.hypot(st.r[0], st.r[1]), v2 = st.v[0] * st.v[0] + st.v[1] * st.v[1];
            const E = v2 / 2 - 1 / r, L = Math.abs(st.r[0] * st.v[1] - st.r[1] * st.v[0]);
            worstE = Math.max(worstE, Math.abs(E - specificEnergy(el.a)) / Math.abs(specificEnergy(el.a)));
            worstL = Math.max(worstL, Math.abs(L - specificAngMom(el.a, el.e)) / Math.abs(specificAngMom(el.a, el.e)));
        }
        return { bodies: orbiting.length, periodRatio4to1: ratio, periodRatioExact: 8,
                 worstEnergyRelErr: worstE, worstAngMomRelErr: worstL };
    }

    if (h.mode === "kepler3" || h.mode === "startspeed") {   // v3762 -- the plant runs the kepler3 branch
        // v3517 -- *** mu WAS NEVER PASSED TO EITHER CALL, SO HALF THE REGISTERED NUISANCE KNOB WAS DEAD. ***
        // nuisanceKnobs.mjs registers kepler's scale invariance as a -> lambda*a TOGETHER WITH mu -> lambda^3*mu,
        // and its `why` says "every floating-point operation in the integrator sees different numbers, so this
        // knob is emphatically live". BOTH FUNCTIONS ACCEPT `mu` AND DEFAULT IT TO 1; THE BIND SIMPLY DID NOT
        // HAND IT OVER. Driven: mu 1 -> 50 -> 1000 left every observable BIT-IDENTICAL. The compensating half
        // of a compensated pair was being dropped on the floor, so what was actually under test was invariance
        // under `a` alone -- a DIFFERENT AND WEAKER CLAIM than the one written down.
        //
        // AND keplerThirdLaw SWEEPS ITS OWN `axes`, so `a` never reached the slope fit either: slopeMeasured,
        // slopeTheory and slopeErrFrac were bit-identical under EVERY config, invariant because UNREAD rather
        // than because the physics forbids it. That is lens's impactParameter and blackhole's GM pair, in a
        // device that had been registered as eligible since v3081. The axes are now scaled BY c.a so the
        // knob's own transformation reaches the fit.
        const axes = [0.6, 0.8, 1.0, 1.4, 2.0].map((x) => x * c.a);
        const k = keplerThirdLaw({ axes, e: Math.min(0.4, c.e), mu: c.mu, integrator: c.integrator });
        // *** v3762 -- THE PLANT THREADS THROUGH HERE AND NOWHERE ELSE. `startspeed` hands the APHELION speed
        // to the PERIHELION radius, which changes the orbit the integrator produces WITHOUT changing what
        // period(a, mu) predicts -- the only kind of defect this key can see, because mu itself CANCELS
        // (bit-identical periodErrFrac across mu 1 -> 8 -> 64). keplerThirdLaw is deliberately LEFT HONEST, so
        // the same run shows a SHAPE key surviving while an ABSOLUTE key fires. ***
        const m = measurePeriod({ a: c.a, e: c.e, mu: c.mu, integrator: c.integrator,
                                  speedAt: h.mode === "startspeed" ? "aphelion" : "perihelion" });

        // THE SECOND OBSERVABLE THIS MODE OWED, AND v3516 IS WHY. Liveness is judged from fields the device
        // REPORTS, and everything above is INVARIANT under the knob by construction -- so kepler read LIVE only
        // through one-ulp round-off in periodErrFrac, its own declared invariant. A quantity cannot be its own
        // liveness witness.
        //
        // Under a -> lambda*a with mu -> lambda^3*mu the specific energy -mu/(2a) and the specific angular
        // momentum sqrt(mu*a*(1-e^2)) BOTH SCALE AS lambda^2 -- measured, not asserted: E/lambda^2 comes back
        // -0.5 and L/lambda^2 0.8660254038 at lambda 1, 2 and 7.3 alike. They are exactly what the knob is
        // ALLOWED to move, so they are admissible evidence in a way the invariants are not.
        const st = atPerihelion(c.a, c.e, c.mu);
        const r0 = Math.hypot(st.x, st.y);
        const specificEnergy = 0.5 * (st.vx * st.vx + st.vy * st.vy) - c.mu / r0;
        const angMomentum = st.x * st.vy - st.y * st.vx;
        return {
            slopeMeasured: k.slopeMeasured, slopeTheory: k.slopeTheory, slopeErrFrac: k.slopeErrFrac,
            periodErrFrac: m.errFrac, integrator: c.integrator,
            specificEnergy, angMomentum,
            // AND THE DIMENSIONLESS FORMS ARE NEW INVARIANTS STRONGER THAN THE OLD ONES, because they are
            // built from the very quantities the knob moves: E*a/mu must be exactly -1/2 and
            // L/sqrt(mu*a*(1-e^2)) exactly 1, whatever lambda does.
            energyDimensionless: (specificEnergy * c.a) / c.mu,
            angMomDimensionless: angMomentum / Math.sqrt(c.mu * c.a * (1 - c.e * c.e)),
        };
    }

    if (h.mode === "closure") {
        const p = apsidalPrecession({ a: c.a, e: c.e, integrator: c.integrator, orbits: Math.min(20, c.orbits) });
        if (p.perOrbitRad == null) return { error: "no-perihelion-passages-detected" };
        return { precessionPerOrbit: Math.abs(p.perOrbitRad), integrator: c.integrator, eccentricity: c.e };
    }

    if (h.mode === "compare") {
        const v = integrate({ ...c, integrator: "verlet" });
        const r = integrate({ ...c, integrator: "rk4" });
        return {
            verletGrowth: v.energyGrowthRatio, rk4Growth: r.energyGrowthRatio,
            verletFinalErr: v.energyErrFinal, rk4FinalErr: r.energyErrFinal,
            driftRatio: v.energyGrowthRatio > 0 ? r.energyGrowthRatio / v.energyGrowthRatio : Infinity,
            orbits: c.orbits, eccentricity: c.e,
        };
    }

    const r = integrate(c);
    return {
        energyErrFirstHalf: r.energyErrFirstHalf, energyErrSecondHalf: r.energyErrSecondHalf,
        energyGrowthRatio: r.energyGrowthRatio, energyErrFinal: r.energyErrFinal,
        // v3526 -- THE SAME QUESTION ASKED BY THE SHARED MODULE, BESIDE THE HAND-ROLLED ANSWER RATHER THAN
        // INSTEAD OF IT. The four fields above are FROZEN IN TWO BASELINES and must not move: this round is a
        // second opinion, not a replacement, and a refactor that quietly changed a frozen number would be the
        // regression this lab exists to catch. growthGapFrac is THE COST OF SAMPLING, measured -- the shared
        // verdict reads 64 samples of the ENERGY while the hand-rolled ratio reads every one of ~80,000 steps
        // of the ERROR, so the two are NOT the same measurement and the gap says by how much.
        ...(function () {
            const a = auditConservation(r.energySeries || []);
            const shared = Number.isFinite(a.growth) ? a.growth : -1;
            const hand = r.energyGrowthRatio;
            return {
                energySeries: r.energySeries || [],
                energyGrowthShared: shared,
                energyVerdictBounded: a.verdict === "bounded" || a.verdict === "exact" ? 1 : 0,
                energySamples: (r.energySeries || []).length,
                growthGapFrac: (Number.isFinite(hand) && hand > 0 && shared > 0)
                    ? Math.abs(shared - hand) / hand : -1,
            };
        })(),
        angularMomentumErr: r.angularMomentumErr, semiMajorDrift: r.semiMajorDrift,
        integrator: c.integrator, orbits: c.orbits, eccentricity: c.e,
    };
}

export const keplerDevice = {
    // v3192 -- EXPORTED. This device reported as ONE-MODE to the census because its own mode names were
    // not in the probe's candidate list -- the LOWER BOUND, biting for the third time. Derived from
    // this file's own default plus every mode its own build() branches on, each verified to give a
    // DISTINCT answer. *** A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE. ***
    modes: KEPLER_MODES,
    plantMode: "startspeed", plantFlips: "periodErrFrac", plantKind: "mode",
    name: "kepler-two-body", observables: KEPLER_OBSERVABLES, build: buildKepler, defaults: keplerDefaults };
