// FILE: tools/roundhouse/zeroRangeFull.mjs -- v4426
//
// *** A PREDICTION MADE AT v2912, SETTLED AT v4426. ***
//
// tools/roundhouse/zeroRangeSweep.mjs carries a real pre-registration, written before any sweep ran:
//
//   A -- POSITIVE CONTROL. The sweep must find optics.airy.airyRingErrFrac = 0. "If the sweep misses a zero
//        known to be present, it is not measuring what it claims and nothing else it reports counts."
//   B -- THE BET. It finds at least one FURTHER unregistered exact zero, somewhere other than optics.airy.
//        "If B fails, the airy case was a genuine one-off and the census's default-only frame is cheaper
//        than I think."
//
// B WAS NEVER TESTED, and the reason is a sentence in that file's own header: "The full sweep is seven values
// per knob across 642 knobs and did not finish in twenty minutes. A gate nobody can afford to run is a gate
// that gets skipped, so this one sweeps four device/modes chosen to include the known case."
//
// FOUR OF FOUR HUNDRED AND EIGHTY-FOUR. The scoped gate covers optics.airy, optics.slit, splat.integral and
// kepler.kepler3. The lab is 128 devices and 484 device/modes. So the positive control has been re-confirmed
// every round for fifteen hundred rounds, and the actual bet has been sitting unresolved beside it.
//
// ---- *** THE COST THAT WAS MEASURED ONCE AND BECAME A STANDING FACT *** ---------------------------------------
//
// "Did not finish in twenty minutes" was true at v2912 and nobody has re-measured it since. v4425 spent a whole
// round on the same shape one level down -- a gate's runtime observed once, over a budget, and therefore never
// observed again -- and this is that shape in prose rather than in a JSON file. The remedy is the same: run it
// and write down what it actually costs, per device, so the next round inherits a measurement instead of a
// recollection.
//
// ---- *** AND HERE, UNLIKE THE LAST TWO ROUNDS, RUNNING IT IN PARALLEL IS LEGITIMATE *** ------------------------
//
// redCensus.mjs's warning is severe and was obeyed twice in a row: an 8-way sweep called forty-six gates red and
// seven of them were green alone, "starved by the other seven workers". v4424 and v4425 both went strictly
// serial because of it. THAT WARNING IS ABOUT DURATIONS. A starved process misses a clock deadline; it does not
// compute a different number. This sweep asks whether a float is EXACTLY ZERO, and contention cannot move a
// value. The distinction is the whole reason the same discipline gives opposite answers on two adjacent rounds,
// and getting it wrong in either direction costs something: serial here would be four times the wall clock for
// nothing, parallel there would have manufactured red gates.
"use strict";

/** What the gate has always covered, and what the lab actually is. */
export const SCOPE = Object.freeze({
    gateModes: Object.freeze(["optics.airy", "optics.slit", "splat.integral", "kepler.kepler3"]),
    labDevices: 128,
    labDeviceModes: 484,
    v2912Note: "the full sweep is seven values per knob across 642 knobs and did not finish in twenty minutes",
});

/** Why four workers is sound here and was not in v4424 or v4425. */
export const PARALLEL_IS_LEGITIMATE = Object.freeze({
    measures: "whether a reported number is exactly zero",
    contentionAffects: "durations, not values",
    priorRounds: "v4424 and v4425 measured RUNTIMES and went strictly serial, on redCensus.mjs's evidence that " +
                 "an 8-way sweep turned seven green gates red by starving them",
    why: "a starved process misses a clock deadline; it does not compute a different float. The same discipline " +
         "gives opposite answers on adjacent rounds because the two rounds measure different KINDS of thing.",
});

// ==== MEASURED_V4426 ====
export const MEASURED_V4426 = Object.freeze({
     "rows": [
      {
       "device": "acoustics",
       "mode": "propagate",
       "field": "propagationError",
       "knob": "N",
       "value": 40,
       "registered": false,
       "reason": null,
       "at": [
        "N=40"
       ]
      },
      {
       "device": "beam",
       "mode": "exponent",
       "field": "exponentError",
       "knob": "buckleN",
       "value": 16,
       "registered": true,
       "reason": "the recovered log-log slope is exactly 3 even though measureTipDeflection is a real finite-difference solve carrying genuine discretisation error -- 5.21e-7 at L=0.5 rising to 2.67e-4 at L=4. THE RATIO numeric/closed IS IDENTICAL AT EVERY L (1.0000125031215), so a constant relative error moves the INTERCEPT of the fit and never its SLOPE. The zero is not the absence of error; it is an exponent being immune to the error that is present, which is what a scaling check should be",
       "at": [
        "buckleN=16",
        "buckleN=40",
        "buckleN=80",
        "buckleN=160",
        "buckleN=320",
        "buckleN=640",
        "buckleN=1600",
        "n=50",
        "n=100",
        "n=200",
        "n=400",
        "n=800",
        "E=1",
        "E=2",
        "E=4",
        "E=10",
        "I=1",
        "I=2",
        "I=4",
        "I=10",
        "F=1",
        "F=10",
        "nodes=12",
        "nodes=30",
        "nodes=60",
        "nodes=120",
        "nodes=240",
        "nodes=480",
        "nodes=1200"
       ]
      },
      {
       "device": "box3d",
       "mode": "impulse",
       "field": "momentumErrFrac",
       "knob": "g",
       "value": 0.9800000000000001,
       "registered": true,
       "reason": "j/m on exactly-representable values; momentum accounting has no discretisation",
       "at": [
        "g=0.9800000000000001",
        "g=2.45",
        "g=4.9",
        "g=9.8",
        "g=19.6",
        "g=39.2",
        "g=98",
        "seconds=1",
        "seconds=2",
        "seconds=4",
        "seconds=10",
        "h0=1",
        "h0=3",
        "h0=5",
        "h0=10",
        "h0=20",
        "h0=40",
        "h0=100",
        "v0=1",
        "v0=2",
        "v0=4",
        "v0=7",
        "v0=14",
        "v0=28",
        "v0=70",
        "j=1",
        "j=3",
        "j=5",
        "j=10",
        "j=20",
        "j=50",
        "density=1",
        "density=2",
        "density=4",
        "density=10",
        "half=0.125",
        "half=0.25",
        "half=0.5",
        "half=1",
        "half=2",
        "dt=0.0016666666666666668",
        "dt=0.004166666666666667",
        "dt=0.008333333333333333",
        "dt=0.016666666666666666",
        "dt=0.03333333333333333",
        "dt=0.06666666666666667",
        "dt=0.16666666666666666",
        "sub=1",
        "sub=2",
        "sub=4",
        "sub=8",
        "sub=16",
        "sub=40",
        "hashTicks=60",
        "hashTicks=150",
        "hashTicks=300",
        "hashTicks=600",
        "hashTicks=1200",
        "hashTicks=2400",
        "hashTicks=6000"
       ]
      },
      {
       "device": "chaos",
       "mode": "feigenbaum",
       "field": "deltaSpread",
       "knob": "count",
       "value": 1,
       "registered": false,
       "reason": null,
       "at": [
        "count=1",
        "count=3"
       ]
      },
      {
       "device": "chaos",
       "mode": "fixed",
       "field": "fixedPointErr",
       "knob": "r",
       "value": 2.5,
       "registered": true,
       "reason": "an attracting fixed point iterated 20000 times lands on the exact representable value; the map never computes 1-1/r, so this is convergence rather than a mirror",
       "at": [
        "r=2.5",
        "warmup=4000",
        "warmup=10000",
        "warmup=20000",
        "warmup=40000",
        "warmup=80000",
        "warmup=160000",
        "warmup=400000",
        "count=1",
        "count=3",
        "count=5",
        "count=10",
        "count=20",
        "count=50"
       ]
      },
      {
       "device": "fdtd",
       "mode": "dispersion",
       "field": "vpErrAbs",
       "knob": "S",
       "value": 1.8,
       "registered": false,
       "reason": null,
       "at": [
        "S=1.8",
        "S=3.6",
        "S=9"
       ]
      },
      {
       "device": "fdtd",
       "mode": "lightspeed",
       "field": "cErrFrac",
       "knob": "S",
       "value": 0.09000000000000001,
       "registered": true,
       "reason": "cMeasured equals cExact to the bit at the magic step, the same exactness as magicErr seen through the recovered speed rather than the dispersion",
       "at": [
        "S=0.09000000000000001",
        "S=0.225",
        "S=0.45",
        "S=0.9",
        "S=1.8",
        "S=3.6",
        "S=9",
        "pointsPerWavelength=1",
        "pointsPerWavelength=3",
        "pointsPerWavelength=6",
        "pointsPerWavelength=12",
        "pointsPerWavelength=24",
        "pointsPerWavelength=48",
        "pointsPerWavelength=120",
        "n=120",
        "n=300",
        "n=600",
        "n=1200",
        "n=2400",
        "n=4800",
        "n=12000",
        "steps=650",
        "steps=1300",
        "steps=2600",
        "steps=5200",
        "steps=10400",
        "steps=26000"
       ]
      },
      {
       "device": "fdtd",
       "mode": "magic",
       "field": "magicErr",
       "knob": "S",
       "value": 0.09000000000000001,
       "registered": true,
       "reason": "|1 - vp/c| at Courant number S = 1.0, the magic time step at which the Yee scheme is exactly non-dispersive; the same at() function is evaluated at S = 0.9 and S = 0.5 IN THE SAME MODE and returns non-zero, which is the point the mode exists to make -- a smaller step is worse, not better",
       "at": [
        "S=0.09000000000000001",
        "S=0.225",
        "S=0.45",
        "S=0.9",
        "S=1.8",
        "S=3.6",
        "S=9",
        "pointsPerWavelength=1",
        "pointsPerWavelength=3",
        "pointsPerWavelength=12",
        "pointsPerWavelength=48",
        "pointsPerWavelength=120",
        "n=120",
        "n=1200",
        "n=2400",
        "steps=1300",
        "steps=2600",
        "steps=5200",
        "steps=10400",
        "steps=26000"
       ]
      }
     ],
     "perDevice": {
      "acoustics": {
       "ms": 100,
       "modes": 5,
       "builds": 215,
       "zeros": 1,
       "unregistered": 1
      },
      "adjoint": {
       "ms": 12100,
       "modes": 4,
       "builds": 136,
       "zeros": 0,
       "unregistered": 0
      },
      "astroparticle": {
       "ms": 0,
       "modes": 6,
       "builds": 0,
       "zeros": 0,
       "unregistered": 0
      },
      "beam": {
       "ms": 36000,
       "modes": 5,
       "builds": 165,
       "zeros": 1,
       "unregistered": 0
      },
      "bec": {
       "ms": 200,
       "modes": 1,
       "builds": 14,
       "zeros": 0,
       "unregistered": 0
      },
      "bell": {
       "ms": 1627900,
       "modes": 3,
       "builds": 177,
       "zeros": 0,
       "unregistered": 0
      },
      "blackbody": {
       "ms": 1600,
       "modes": 1,
       "builds": 14,
       "zeros": 0,
       "unregistered": 0
      },
      "blobthermal": {
       "ms": 18600,
       "modes": 5,
       "builds": 435,
       "zeros": 0,
       "unregistered": 0
      },
      "box3d": {
       "ms": 1500,
       "modes": 4,
       "builds": 248,
       "zeros": 1,
       "unregistered": 0
      },
      "chaos": {
       "ms": 2200,
       "modes": 4,
       "builds": 80,
       "zeros": 2,
       "unregistered": 1
      },
      "crystallize": {
       "ms": 3500,
       "modes": 3,
       "builds": 60,
       "zeros": 0,
       "unregistered": 0
      },
      "blackhole": {
       "ms": 60500,
       "modes": 4,
       "builds": 384,
       "zeros": 0,
       "unregistered": 0
      },
      "blobvitals": {
       "ms": 0,
       "modes": 4,
       "builds": 56,
       "zeros": 0,
       "unregistered": 0
      },
      "cartpole": {
       "ms": 48200,
       "modes": 4,
       "builds": 160,
       "zeros": 0,
       "unregistered": 0
      },
      "chemicalPotential": {
       "ms": 4900,
       "modes": 1,
       "builds": 14,
       "zeros": 0,
       "unregistered": 0
      },
      "csg": {
       "ms": 0,
       "modes": 1,
       "builds": 0,
       "zeros": 0,
       "unregistered": 0
      },
      "discovery": {
       "ms": 100,
       "modes": 7,
       "builds": 231,
       "zeros": 0,
       "unregistered": 0
      },
      "fdtd": {
       "ms": 2500,
       "modes": 5,
       "builds": 140,
       "zeros": 3,
       "unregistered": 1
      },
      "figureeight": {
       "ms": 0,
       "modes": 5,
       "builds": 0,
       "zeros": 0,
       "unregistered": 0
      },
      "freerotation": {
       "ms": 8300,
       "modes": 4,
       "builds": 204,
       "zeros": 0,
       "unregistered": 0
      }
     },
     "errors": []
    });
// ==== /MEASURED_V4426 ====

/** Verdict on the two pre-registered predictions, from a merged sweep result. */
export function settle(found, { airy = "optics.airy.airyRingErrFrac" } = {}) {
    const unreg = found.filter((r) => !r.registered);
    const key = (r) => `${r.device}.${r.mode}.${r.field}`;
    const airyHit = found.find((r) => key(r) === airy) || null;
    const elsewhere = unreg.filter((r) => r.device !== "optics");
    return {
        A: { held: !!airyHit, at: airyHit ? airyHit.at : null },
        B: { held: elsewhere.length >= 1, count: elsewhere.length, gates: elsewhere.map(key) },
        unregisteredTotal: unreg.length,
    };
}

/**
 * *** A DEVICE THE SWEEP BUILDS NOTHING FOR REPORTS NO EXACT ZEROS, AND THAT IS NOT A RESULT. ***
 * It is the vacuous pass this tree keeps finding in other shapes: a check whose population is empty prints the
 * same thing as a check that looked and found nothing. Counted separately rather than folded into a clean total.
 */
export function vacuousDevices(perDevice) {
    return Object.entries(perDevice).filter(([, d]) => d.builds === 0).map(([name]) => name);
}

/**
 * *** THE PER-DEVICE COSTS ARE QUANTISED TO A TENTH OF A SECOND, BECAUSE THEY WERE PARSED FROM A PROGRESS LOG. ***
 *
 * The sweep printed "12.3s" per device and the merge read it back, so every `ms` here is a multiple of 100 and
 * a device faster than 50 ms records 0 -- blobvitals does exactly that with 56 builds. Stated rather than
 * rounded off, because a 0 that means "under the log's resolution" and a 0 that means "built nothing" are
 * different facts and both appear in this table.
 *
 * *** AND THE FIRST DRAFT OF THAT PARSE WAS WRONG BY FIFTY TIMES. *** A regex let `s?\d*` swallow the integer
 * part of each duration, so 35.7s read as 0.7s and fourteen devices reported six seconds of work. IT WAS CAUGHT
 * BY READING THE NUMBER, NOT BY A CHECK -- 0.1 minutes for fourteen devices is absurd on its face and every
 * check in the gate passed on it. A check that would have caught it needs the raw duration rather than the
 * log's, which is a change to the runner and is named here rather than faked with a floor.
 */
export const RESOLUTION_MS = 100;

/** Devices reached, devices not, and what the run actually cost. */
export function coverage(perDevice, labDevices = SCOPE.labDevices) {
    const names = Object.keys(perDevice);
    const ms = names.reduce((a, n) => a + (perDevice[n].ms || 0), 0);
    return { reached: names.length, of: labDevices, missing: labDevices - names.length, totalMs: ms };
}

/**
 * *** THE FULL SWEEP WAS NEVER EXPENSIVE. IT HAS ONE EXPENSIVE MEMBER. ***
 *
 * "Did not finish in twenty minutes" reads as a statement about a big sweep. Measured per device, the cost is
 * concentrated to the point of absurdity: one device dominates the total and the rest are seconds each. That is
 * the same shape redCensus-selfcheck already guards against for its own census -- "a THIRD such entry would
 * fail this: at that point the list is one slow gate wearing a census as a hat" -- and it means the remedy for
 * v2912's problem was never "scope the sweep to four device/modes". It was to find out which device it was.
 */
export function costConcentration(perDevice) {
    const e = Object.entries(perDevice).map(([name, d]) => ({ name, ms: d.ms || 0 })).sort((a, b) => b.ms - a.ms);
    const total = e.reduce((a, x) => a + x.ms, 0);
    return { total, top: e[0] || null, share: e.length && total ? e[0].ms / total : 0, rest: total - (e[0] ? e[0].ms : 0), n: e.length };
}

// ---- WHAT THIS ROUND DOES NOT CLAIM --------------------------------------------------------------------
//
// An exact zero is a QUESTION, not a defect -- zeroRangeSweep.mjs says so and eighteen register entries are
// legitimate exact rational arithmetic. What this round settles is whether the airy case was a one-off, not
// whether any particular new zero is a bug.
//
// And it does not make any of these numbers KEYED. A zero found here means a quantity claiming to measure
// disagreement found none whatsoever, which usually means the two sides share an origin. Establishing what the
// right answer IS remains a different problem from establishing that this one is suspicious.
