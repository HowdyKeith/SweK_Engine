// tools/roundhouse/coupleCensus.mjs
//
// v3303 -- HOW MUCH OF THE LAB IS COUPLED, AND HOW MUCH IS FIFTY DEVICES TALKING TO NOBODY?
//
// gradedCoverage answered "how much proven physics is graded". This is the same question one level up: fifty
// devices each grade themselves against their own key, and NOTHING ASKS TWO OF THEM TO AGREE. That is the bug
// class no single device can see -- two instruments both passing their own gates while disagreeing with each
// other -- and crossCheck() has existed since v2891 to catch it. It currently has FIVE declared pairs.
//
// A CANDIDATE IS AN OBSERVABLE NAMED BY TWO OR MORE DEVICES. Fifty devices name 29 such observables. That is a
// count of CANDIDATES and emphatically not a count of couplings, because:
//
//   NOT EVERY SHARED NAME IS A SHARED QUANTITY. "steps" is named by ten devices and means the integrator step
//   count of ten different simulations. Coupling those would compare a number of Verlet steps against a number
//   of Monte Carlo sweeps and call the disagreement a physics failure. A name is not a quantity, and this census
//   REPORTS candidates for a human to adjudicate rather than declaring couplings from string equality.
//
// SO THE CENSUS OUTPUTS THREE NUMBERS AND NEVER GUESSES:
//   candidates   observables named by 2+ devices, mechanically derivable
//   declared     pairs a human wrote into crossDevice-selfcheck.mjs, each with a stated reason
//   adjudicated  candidates that have been EXPLICITLY declared or EXPLICITLY rejected, so the backlog is
//                "candidates minus adjudicated" rather than "candidates minus declared" -- a rejected candidate
//                is finished work, and counting it as outstanding would never let the number reach zero.

import fs from "node:fs";
import path from "node:path";
import { DEVICE_NAMES, getDevice } from "./devices.mjs";

/** Observables named by two or more devices. Mechanical: a name match, nothing more. */
export async function sharedObservables() {
    const owners = new Map();
    for (const name of DEVICE_NAMES) {
        let dev; try { dev = await getDevice(name); } catch { continue; }
        for (const obs of dev.observables || []) {
            if (!owners.has(obs)) owners.set(obs, []);
            owners.get(obs).push(name);
        }
    }
    return [...owners.entries()]
        .filter(([, devs]) => devs.length > 1)
        .map(([observable, devices]) => ({ observable, devices }))
        .sort((a, b) => b.devices.length - a.devices.length);
}

/** Quantities crossCheck is actually called on, read from the gate rather than from a list kept beside it. */
export function declaredPairs(here) {
    const f = path.join(here, "crossDevice-selfcheck.mjs");
    let src; try { src = fs.readFileSync(f, "utf8"); } catch { return []; }
    return [...src.matchAll(/quantity:\s*"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Candidates a human has ruled on. A REJECTION IS AN ANSWER, and the register lives beside the census so the
 * reason travels with the decision instead of living in a commit message nobody reads.
 */
export const REJECTED = {
    acceptRate: "MEASURED IN v3312 (hmc 0.9967, inference 0.9936) AND REJECTED ON TWO GROUNDS. An acceptance rate " +
                "is a property of (sampler, target, step size), not a shared constant -- both sit near 0.99 because " +
                "both were TUNED to, which is a fact about tuning. And inference.js IMPORTS hmc.js, so the two use " +
                "the same leapfrog: agreement would be reproducibility, not corroboration, and the zero-tolerance " +
                "kernels already do reproducibility better",
    periodErrFrac: "PROPOSED AND MEASURED IN v3311, then rejected: kepler reports 3.885e-5 and twobody 1.974e-4, " +
                   "a factor of five apart with BOTH CORRECT. The name is shared and the quantity is not -- it means " +
                   "'how far MY integrator, at MY timestep, over MY orbit count, sits from the analytic value', which " +
                   "is a property of a discretisation rather than of the physics. Coupling it would demand that two " +
                   "different schemes carry identical truncation error, and the only way to pass would be to widen the " +
                   "tolerance until the check meant nothing. The analytic PERIOD would be couplable; kepler does not " +
                   "expose it in any mode, and inventing an observable to satisfy a gate is not a coupling",
    steps: "an integrator step COUNT, and ten devices each mean their own: Verlet steps, Monte Carlo sweeps, " +
           "ES iterations, LBM ticks. Same word, different quantities, no shared physics to disagree about",
    L: "a lattice or box SIZE chosen per device as a configuration input, not a measured result -- there is " +
       "nothing for two devices to disagree about because neither computed it",
    N: "a particle or replica COUNT, configuration rather than measurement, same reason as L",
    T: "a temperature SET by the caller in each device. Two devices running at different temperatures are not " +
       "in disagreement, they are running different experiments",
    reps: "an ensemble size, configuration not measurement",
    samples: "a sample count, configuration not measurement",
    seed: "an RNG seed",
    n: "a grid or population size, configuration not measurement",

    // ---- v3303: MEASURED REJECTIONS. Each of these was checked by running both devices, not judged by name. ----
    // v3312 -- I RE-MEASURED THIS WITHOUT READING THE REGISTER FIRST and reached the identical conclusion by
    // the identical route (3.3535 against 2.80e-4, signal against integrator residue). The register did its job
    // and I did not consult it; the wasted round is mine, not the census's. Worse, the duplicate key I briefly
    // added would have SILENTLY SHADOWED this reason -- a later key wins in a JS object literal and nothing
    // warns -- so the gate now checks for duplicates, which is the only good thing to come out of it.
    precessionPerOrbit:
        "MEASURED AND REJECTED, and this is the one that looked most like a coupling. blackhole/orbit reports " +
        "3.354 rad and kepler/closure reports 2.80e-4 -- four orders apart. Neither is wrong: kepler is a " +
        "NEWTONIAN CLOSURE test where the orbit should NOT precess, so its number is integrator residue and its " +
        "correct value is zero, while blackhole measures RELATIVISTIC precession at a chosen r0 where a large " +
        "number is the physics. Coupling them would demand that Newton agree with Einstein and file the " +
        "difference as a defect. A shared name, two different questions",
    energyDriftFrac:
        "both figureeight and blackhole measure integrator energy drift, but of DIFFERENT INTEGRATORS on " +
        "DIFFERENT problems. Drift is a property of the scheme and the step size, not a physical constant, so " +
        "there is no reason for two schemes to drift by the same amount and no finding if they do not",
    captured:
        "a BOOLEAN about whether a specific trajectory fell in, at whatever impact parameter each device chose. " +
        "Two devices disagreeing here means they aimed differently, not that the physics differs",
    orbits: "a count of completed orbits, set by how long each device chose to integrate",
    points: "the number of sweep points a device chose to sample",
    gridN: "a resolution chosen per device",
    m1: "a mass SET by the caller. twobody, inspiral and eccentric all take it as input",
    m2: "a mass SET by the caller, same as m1",
};


/**
 * v3308 -- THE SECOND COUPLING AXIS, AND THE FIRST ONE MISSED IT ENTIRELY.
 *
 * sharedObservables() finds candidates by NAME. It found five of the six declared couplings -- and it could
 * never have found the sixth, because kepler and hmc both establish symplecticity while sharing no observable
 * name, no problem and no units. A name match is one way two devices can be about the same thing.
 *
 * THIS IS ANOTHER, AND IT IS DECIDABLE FROM THE IMPORT GRAPH RATHER THAN FROM STRINGS: two device binds that
 * import the SAME PHYSICS MODULE are coupled by construction, whatever they call their outputs. If that module
 * changes, both move. Seven such modules exist -- blackhole/geodesic.js feeds kerr, lens AND tidal.
 *
 * WHAT IT IS AND IS NOT. A shared import is not automatically a cross-check: kerr and lens use geodesic.js for
 * different questions and their observables are not comparable. What it IS is a blast radius -- the set of
 * devices a single physics edit can move at once -- and that is worth knowing whether or not any pair of them
 * can be numerically compared. The census reports it as a distinct axis rather than folding it into candidates,
 * because the two mean different things and adding them together would produce a number describing neither.
 *
 * *** v3309: AND THE FILE-LEVEL NUMBER IS AN UPPER BOUND, NOT AN OBSERVED EFFECT. *** blackhole/geodesic.js is
 * imported by kerr, lens and tidal, so its file blast radius is 3. Planting errors in it measures something
 * narrower and per-FUNCTION:
 *
 *     criticalImpact() +1.7%   moves lens only          (1 of 3)
 *     horizon()        +1%     moves lens and tidal     (2 of 3)
 *
 * kerr imports the module and neither edit reached it. So "3 devices share this file" and "3 devices move when
 * you edit it" are different claims, and only the first is derivable from the import graph. The census reports
 * the bound and says it is a bound; the reach is a measurement, and measuring it means planting an error.
 */
export function sharedModules(here) {
    let files = [];
    try { files = fs.readdirSync(here).filter((f) => f.endsWith("Bind.mjs")); } catch { return []; }
    const byModule = new Map();
    for (const f of files) {
        let src; try { src = fs.readFileSync(path.join(here, f), "utf8"); } catch { continue; }
        const device = f.replace("Bind.mjs", "");
        for (const m of src.matchAll(/from\s+"\.\.\/\.\.\/([^"]+)"/g)) {
            const mod = m[1];
            if (!byModule.has(mod)) byModule.set(mod, new Set());
            byModule.get(mod).add(device);
        }
    }
    return [...byModule.entries()]
        .map(([module, devs]) => ({ module, devices: [...devs] }))
        .filter((x) => x.devices.length > 1)
        .sort((a, b) => b.devices.length - a.devices.length);
}

export async function coupleCensus(here) {
    const candidates = await sharedObservables();
    const declared = declaredPairs(here);
    // a candidate counts as adjudicated if it is rejected by name, or if some declared quantity mentions it
    const isDeclared = (obs) => declared.some((q) => q.toLowerCase().includes(obs.toLowerCase()));
    const adjudicated = candidates.filter((c) => REJECTED[c.observable] || isDeclared(c.observable));
    const open = candidates.filter((c) => !REJECTED[c.observable] && !isDeclared(c.observable));
    const modules = sharedModules(here);
    return {
        deviceCount: DEVICE_NAMES.length,
        candidates, declared, sharedModules: modules,
        blastRadius: modules.length ? Math.max(...modules.map((m) => m.devices.length)) : 0,
        adjudicated: adjudicated.map((c) => c.observable),
        open,
        counts: { candidates: candidates.length, declared: declared.length, adjudicated: adjudicated.length,
                  open: open.length, sharedModules: modules.length },
    };
}
