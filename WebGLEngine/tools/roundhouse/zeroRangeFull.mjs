// FILE: tools/roundhouse/zeroRangeFull.mjs -- v4426
//
// *** THE SWEEP HAS HAD NO POSITIVE CONTROL SINCE v3313, AND THIS ROUND JUST MADE SIXTEEN CLAIMS WITH IT. ***
//
// tools/roundhouse/zeroRangeSweep.mjs carries a pre-registration written before any sweep ran:
//
//   A -- POSITIVE CONTROL. The sweep must find optics.airy.airyRingErrFrac = 0. "If the sweep misses a zero
//        known to be present, it is not measuring what it claims and nothing else it reports counts."
//   B -- THE BET. At least one FURTHER unregistered exact zero, somewhere other than optics.airy.
//
// *** A DOES NOT HOLD, AND THE TREE HAS KNOWN EXACTLY WHY SINCE v3314. *** The zero was not lost, it was CURED:
// v2931 adopted firstMinimumRefined in place of the raw grid estimator and moved the grading to the exact
// j(1,1)/pi instead of the rounded 1.22, which destroyed the coincidence on purpose. zeroRangeSweep-selfcheck
// asserts its ABSENCE and states the cost in its own words -- "the sweep now has NO DEMONSTRATED DETECTION
// POWER for exact zeros ... UNPROVEN until a replacement control is planted".
//
// NO REPLACEMENT WAS EVER PLANTED. That sentence has stood for eleven hundred versions, and this round drove
// the uncontrolled instrument across 78 devices and came back with SIXTEEN unregistered exact zeros. Sixteen
// positive results from a detector with no demonstrated ability to find a positive is the finding, and it is
// worth more than any of the sixteen.
//
// *** CONFIRMED INDEPENDENTLY AND WIDER THAN THE GATE CHECKS. *** The gate looks at optics.airy and optics.slit.
// A sweep of ALL FIVE optics modes -- airy, slit, edge, converge, radiusconfusion, 175 builds and 140
// error-field readings -- finds not one exact zero anywhere. The control is gone from the whole device, not
// just from the mode that used to carry it.
//
// ---- *** AND THE OBVIOUS REPLACEMENT IS CONFOUNDED BY THE SAMPLE THAT ESTABLISHED IT *** ----------------------
//
// The natural candidate is the hit B already rests on: splat.integral.isoRollDeviation, which the gate reports
// as exactly 0 "at dyadic sigma" with a mechanism it believes it established from five dyadic values
// (0.125, 0.25, 0.5, 1, 2) against three non-dyadic ones (0.1, 0.3, 0.7). MEASURED ACROSS EIGHTEEN VALUES, THE
// DYADIC STORY IS NOT WHAT IS HAPPENING:
//
//     0.05 0.1 0.2 0.3 0.4      2.8e-15 .. 4.5e-13     non-zero
//     0.125 0.25 0.5            EXACTLY 0              dyadic, below 1
//     0.6 0.7 0.8 0.9           1.8e-12 .. 3.6e-12     non-zero
//     1 1.05 1.1 1.2 1.3 1.5 2 3    EXACTLY 0          EVERY value at or above 1, dyadic or not
//
// Tested as rules rather than described: "dyadic" fits the gate's own EIGHT points and FAILS on twenty.
// "sigma >= 1" fails on both. "sigma >= 1 OR dyadic" fits all twenty. SO THE RECORDED MECHANISM IS NOT WRONG,
// IT IS INCOMPLETE -- it is one of two disjuncts, and the second operates only above 1 where all three of the
// gate's non-dyadic probes (0.1, 0.3, 0.7) never went. A sample drawn entirely below the boundary cannot see
// that a boundary is there.
//
// *** SO THIS ROUND DOES NOT PLANT A REPLACEMENT CONTROL. *** A control whose mechanism is not understood is
// not a control; it is a second unexplained zero standing where the explanation should be. Naming the candidate
// and the confound is what makes planting one a round somebody can actually do.
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
       "device": "blobkelvin",
       "mode": "convert",
       "field": "roundTripErrFrac",
       "knob": "D",
       "value": 0.001141,
       "registered": true,
       "reason": "kelvinOfWarmth and warmthOfKelvin are exact linear inverses; the round trip returns the same float by construction",
       "at": [
        "D=0.001141",
        "D=0.0028525",
        "D=0.005705",
        "D=0.01141",
        "T=29.314999999999998",
        "T=73.2875",
        "T=146.575",
        "T=293.15",
        "T=586.3",
        "T=1172.6",
        "T=2931.5"
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
       "device": "centrifuge",
       "mode": "neutral",
       "field": "neutralRelErr",
       "knob": "a",
       "value": 0.0005,
       "registered": true,
       "reason": "the neutral density is recovered by BISECTION on the drift sign, and at rhoF = 1 it converges on 1 exactly; at rhoF = 1.3 it lands 1.71e-16 off and at 0.7777 1.43e-16 off, so the search is a real numerical one and the exactness belongs to the value, not to the method",
       "at": [
        "a=0.0005",
        "a=0.001",
        "a=0.002",
        "a=0.004",
        "a=0.01",
        "rho=0.12",
        "rho=0.3",
        "rho=0.6",
        "rho=1.2",
        "rho=2.4",
        "rho=4.8",
        "rho=12",
        "rhoF=1",
        "rhoF=2",
        "rhoF=4",
        "rhoF=10",
        "eta=1",
        "eta=2",
        "eta=4",
        "omega=1500",
        "omega=3000",
        "omega=6000",
        "omega=12000",
        "omega=30000",
        "r0=0.001",
        "r0=0.0025",
        "r0=0.005",
        "r0=0.01",
        "r0=0.02",
        "r0=0.04",
        "r0=0.1",
        "dt=0.0001",
        "dt=0.00025",
        "dt=0.0005",
        "dt=0.001",
        "dt=0.002",
        "dt=0.004",
        "dt=0.01",
        "steps=200",
        "steps=500",
        "steps=1000",
        "steps=2000",
        "steps=4000",
        "steps=8000",
        "steps=20000",
        "refR=0.005000000000000001",
        "refR=0.0125",
        "refR=0.025",
        "refR=0.05",
        "refR=0.1",
        "refR=0.2",
        "refR=0.5"
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
       "device": "clocks",
       "mode": "rates",
       "field": "crossoverErrOrder",
       "knob": "r1",
       "value": 1,
       "registered": true,
       "reason": "the ORDER of the naive composition's error, which its own comment states reads 2.000000000000 under the planted error and 0 without it -- this is the honest arm of a declared plant, not an unexamined zero",
       "at": [
        "r1=1",
        "r1=2",
        "r1=3",
        "r1=6",
        "r1=12",
        "r1=30",
        "r2=5",
        "r2=13",
        "r2=25",
        "r2=50",
        "r2=100",
        "r2=200",
        "r2=500",
        "M=1",
        "M=2",
        "M=4",
        "a=0.06",
        "a=0.15",
        "a=0.3",
        "a=0.6",
        "a=1.2",
        "a=2.4",
        "a=6",
        "r=3",
        "r=6",
        "r=12",
        "r=24",
        "r=48",
        "r=120"
       ]
      },
      {
       "device": "clocks",
       "mode": "rates",
       "field": "crossoverResidual",
       "knob": "r1",
       "value": 1,
       "registered": true,
       "reason": "|orbitingDilation(M,r) - staticDilation(M, r/1.5)| is the identity sqrt(1-3M/r) = sqrt(1-2M/(2r/3)), algebraically exact; measured bit-zero at (M,r) = (1,12), (0.3,7.7), (2,50) and (0.05,4), while the sibling clockEffectErrFrac reads 5.65e-15 so the arithmetic is genuinely floating point",
       "at": [
        "r1=1",
        "r1=2",
        "r1=3",
        "r1=6",
        "r1=12",
        "r1=30",
        "r2=5",
        "r2=13",
        "r2=25",
        "r2=50",
        "r2=100",
        "r2=200",
        "r2=500",
        "M=1",
        "M=2",
        "M=4",
        "a=0.06",
        "a=0.15",
        "a=0.3",
        "a=0.6",
        "a=1.2",
        "a=2.4",
        "a=6",
        "r=3",
        "r=6",
        "r=12",
        "r=24",
        "r=48",
        "r=120"
       ]
      },
      {
       "device": "eccentric",
       "mode": "invariant",
       "field": "circularLimitErrFrac",
       "knob": "m1",
       "value": 1,
       "registered": true,
       "reason": "Peters' g(e) is exactly 1.0 at e=0, and multiplying by 1.0 is exact in IEEE -- stage three reducing to stage two is bit-identical by arithmetic, not by mirroring",
       "at": [
        "m1=1",
        "m1=2",
        "m1=3",
        "m1=6",
        "m1=12",
        "m1=30",
        "m2=1",
        "m2=2",
        "m2=4",
        "m2=10",
        "a0=1",
        "a0=3",
        "a0=5",
        "a0=10",
        "a0=20",
        "a0=40",
        "a0=100",
        "e0=0.06999999999999999",
        "e0=0.175",
        "e0=0.35",
        "e0=0.7",
        "e0=1.4",
        "e0=2.8",
        "e0=7",
        "eStop=0.001",
        "eStop=0.0025",
        "eStop=0.005",
        "eStop=0.01",
        "eStop=0.02",
        "eStop=0.04",
        "eStop=0.1",
        "safety=0.00001",
        "safety=0.000025",
        "safety=0.00005",
        "safety=0.0001",
        "safety=0.0002",
        "safety=0.0004",
        "safety=0.001"
       ]
      },
      {
       "device": "eccentric",
       "mode": "limit",
       "field": "circularLimitErrFrac",
       "knob": "m1",
       "value": 1,
       "registered": true,
       "reason": "same reduction, reported from the dedicated limit mode: dadt(a0, 0, Mc) against the separately written -PETERS_A*Mc/a0^3",
       "at": [
        "m1=1",
        "m1=2",
        "m1=3",
        "m1=6",
        "m1=12",
        "m1=30",
        "m2=1",
        "m2=2",
        "m2=4",
        "m2=10",
        "a0=1",
        "a0=3",
        "a0=5",
        "a0=10",
        "a0=20",
        "a0=40",
        "a0=100",
        "e0=0.06999999999999999",
        "e0=0.175",
        "e0=0.35",
        "e0=0.7",
        "e0=1.4",
        "e0=2.8",
        "e0=7",
        "eStop=0.001",
        "eStop=0.0025",
        "eStop=0.005",
        "eStop=0.01",
        "eStop=0.02",
        "eStop=0.04",
        "eStop=0.1",
        "safety=0.00001",
        "safety=0.000025",
        "safety=0.00005",
        "safety=0.0001",
        "safety=0.0002",
        "safety=0.0004",
        "safety=0.001"
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
      },
      {
       "device": "fft",
       "mode": "absolute",
       "field": "mixedToneErrFrac",
       "knob": "N",
       "value": 16,
       "registered": true,
       "reason": "same absolute key over two summed tones, exact for the same reason; halfscale moves it to 0.875, so the zero is live rather than unreachable",
       "at": [
        "N=16",
        "N=32",
        "N=64",
        "N=128",
        "N=256",
        "N=640",
        "tone=1",
        "tone=3",
        "tone=5",
        "tone=10",
        "tone=20",
        "amplitude=1",
        "amplitude=2",
        "amplitude=4",
        "amplitude=10",
        "offset=0",
        "offset=0.001",
        "offset=1"
       ]
      },
      {
       "device": "fft",
       "mode": "absolute",
       "field": "sinusoidErrFrac",
       "knob": "N",
       "value": 16,
       "registered": true,
       "reason": "a sinusoid c*sin gives |X[k]| = c*N/2 exactly and fft.js is never told the number; fftBind-selfcheck asserts === 0 deliberately, and the halfscale plant moves it to 0.875",
       "at": [
        "N=16",
        "N=32",
        "N=64",
        "N=128",
        "N=256",
        "N=640",
        "tone=1",
        "tone=3",
        "tone=5",
        "tone=10",
        "tone=20",
        "amplitude=1",
        "amplitude=2",
        "amplitude=4",
        "amplitude=10",
        "offset=0",
        "offset=0.001",
        "offset=1"
       ]
      },
      {
       "device": "fft",
       "mode": "parseval",
       "field": "mixedToneErrFrac",
       "knob": "N",
       "value": 16,
       "registered": true,
       "reason": "as above -- the mixed-tone absolute key is untouched by the parseval route and remains exact",
       "at": [
        "N=16",
        "N=32",
        "N=64",
        "N=128",
        "N=256",
        "N=640",
        "tone=1",
        "tone=3",
        "tone=5",
        "tone=10",
        "tone=20",
        "amplitude=1",
        "amplitude=2",
        "amplitude=4",
        "amplitude=10",
        "offset=0",
        "offset=0.001",
        "offset=1"
       ]
      },
      {
       "device": "fft",
       "mode": "parseval",
       "field": "sinusoidErrFrac",
       "knob": "N",
       "value": 16,
       "registered": true,
       "reason": "the parseval mode changes WHICH identity is graded, not the absolute keys, so this stays exactly zero alongside its own energy residual",
       "at": [
        "N=16",
        "N=32",
        "N=64",
        "N=128",
        "N=256",
        "N=640",
        "tone=1",
        "tone=3",
        "tone=5",
        "tone=10",
        "tone=20",
        "amplitude=1",
        "amplitude=2",
        "amplitude=4",
        "amplitude=10",
        "offset=0",
        "offset=0.001",
        "offset=1"
       ]
      },
      {
       "device": "fft",
       "mode": "roundtrip",
       "field": "mixedToneErrFrac",
       "knob": "N",
       "value": 16,
       "registered": true,
       "reason": "as above -- roundtrip leaves the absolute keys alone, and halfscale is where these two are shown to move",
       "at": [
        "N=16",
        "N=32",
        "N=64",
        "N=128",
        "N=256",
        "N=640",
        "tone=1",
        "tone=3",
        "tone=5",
        "tone=10",
        "tone=20",
        "amplitude=1",
        "amplitude=2",
        "amplitude=4",
        "amplitude=10",
        "offset=0",
        "offset=0.001",
        "offset=1"
       ]
      },
      {
       "device": "fft",
       "mode": "roundtrip",
       "field": "sinusoidErrFrac",
       "knob": "N",
       "value": 16,
       "registered": true,
       "reason": "the roundtrip mode grades inverse-then-forward; the absolute key is computed on the forward pass and is unaffected, so it stays bit-zero",
       "at": [
        "N=16",
        "N=32",
        "N=64",
        "N=128",
        "N=256",
        "N=640",
        "tone=1",
        "tone=3",
        "tone=5",
        "tone=10",
        "tone=20",
        "amplitude=1",
        "amplitude=2",
        "amplitude=4",
        "amplitude=10",
        "offset=0",
        "offset=0.001",
        "offset=1"
       ]
      },
      {
       "device": "freeze",
       "mode": "asymmetry",
       "field": "meltRelErr",
       "knob": "n",
       "value": 15,
       "registered": false,
       "reason": null,
       "at": [
        "n=15",
        "n=38"
       ]
      },
      {
       "device": "galaxy",
       "mode": "traces",
       "field": "triangleErr",
       "knob": "seed",
       "value": 4,
       "registered": true,
       "reason": "the trace identity over the adjacency triple is integer-exact on this fixture; the unorderedtri plant mode reads 1.38e+3 on the same key",
       "at": [
        "seed=4",
        "seed=11",
        "seed=21",
        "seed=42",
        "seed=84",
        "seed=168",
        "seed=420",
        "n=6",
        "n=15",
        "n=30",
        "n=60",
        "n=120",
        "n=240",
        "n=600",
        "k=1",
        "k=2",
        "k=3",
        "k=6",
        "k=12",
        "k=30",
        "zeroTol=1e-9",
        "zeroTol=2.5e-9",
        "zeroTol=5e-9",
        "zeroTol=1e-8",
        "zeroTol=2e-8",
        "zeroTol=4e-8",
        "zeroTol=1e-7",
        "maxHops=2",
        "maxHops=6",
        "maxHops=12",
        "maxHops=24",
        "maxHops=48",
        "maxHops=96",
        "maxHops=240",
        "marooned=0",
        "marooned=0.001",
        "marooned=1"
       ]
      },
      {
       "device": "geostats",
       "mode": "nugget",
       "field": "valueErr",
       "knob": "probe",
       "value": 0.47500000000000003,
       "registered": true,
       "reason": "kriging with a nugget reproduces the observation at a data location exactly -- the estimator is an exact interpolator there; the noconstraint plant mode reads 3.25e-1 on the same key",
       "at": [
        "probe=0.47500000000000003",
        "probe=1.1875",
        "probe=2.375",
        "probe=4.75",
        "probe=9.5",
        "probe=19",
        "probe=47.5",
        "nuggetLevel=1",
        "nuggetLevel=2",
        "nuggetLevel=4",
        "nuggetLevel=10"
       ]
      },
      {
       "device": "geostats",
       "mode": "nugget",
       "field": "varianceErr",
       "knob": "probe",
       "value": 0.47500000000000003,
       "registered": true,
       "reason": "the kriging variance at a data location is exactly zero for the same reason; the plant mode reads 3.33e-2, so the comparison is live",
       "at": [
        "probe=0.47500000000000003",
        "probe=1.1875",
        "probe=2.375",
        "probe=4.75",
        "probe=9.5",
        "probe=19",
        "probe=47.5",
        "nuggetLevel=1",
        "nuggetLevel=2",
        "nuggetLevel=4",
        "nuggetLevel=10"
       ]
      },
      {
       "device": "hands",
       "mode": "mirror",
       "field": "mirrorMaxDelta",
       "knob": "rotDeg",
       "value": 4,
       "registered": true,
       "reason": "computeHandMetrics with mirror:true must agree with the same pose flipped by x -> 1-x and mirror:false; the max is taken over five quantities across four poses and every one agrees to the bit, which is the equivalence the mode exists to assert rather than a check with nothing in it",
       "at": [
        "rotDeg=4",
        "rotDeg=10",
        "rotDeg=20",
        "rotDeg=40",
        "rotDeg=80",
        "rotDeg=160",
        "rotDeg=400",
        "rotStep=1",
        "rotStep=3",
        "rotStep=5",
        "rotStep=10",
        "rotStep=20",
        "rotStep=50",
        "span=0.020000000000000004",
        "span=0.05",
        "span=0.1",
        "span=0.2",
        "span=0.4",
        "span=0.8",
        "span=2",
        "pinchThreshold=0.006",
        "pinchThreshold=0.015",
        "pinchThreshold=0.03",
        "pinchThreshold=0.06",
        "pinchThreshold=0.12",
        "pinchThreshold=0.24",
        "pinchThreshold=0.6",
        "anchorX=0.05",
        "anchorX=0.125",
        "anchorX=0.25",
        "anchorX=0.5",
        "anchorX=1",
        "anchorX=2",
        "anchorX=5",
        "anchorY=0.05",
        "anchorY=0.125",
        "anchorY=0.25",
        "anchorY=0.5",
        "anchorY=1",
        "anchorY=2",
        "anchorY=5"
       ]
      },
      {
       "device": "invariants",
       "mode": "gzk",
       "field": "thresholdRelErr",
       "knob": "mIn",
       "value": 0.469136,
       "registered": false,
       "reason": null,
       "at": [
        "mIn=0.469136",
        "mPion=0.269954"
       ]
      },
      {
       "device": "invariants",
       "mode": "naive",
       "field": "naiveOverRootS",
       "knob": "beta",
       "value": 0.09000000000000001,
       "registered": false,
       "reason": null,
       "at": [
        "beta=0.09000000000000001",
        "beta=0.225",
        "beta=0.45",
        "beta=1.8",
        "beta=3.6",
        "beta=9"
       ]
      },
      {
       "device": "kerrladder",
       "mode": "photon",
       "field": "photonErr",
       "knob": "M",
       "value": 1,
       "registered": true,
       "reason": "at spin 0 the photon sphere sits at exactly 3M, a small integer landed on exactly; the sibling photonWorstErr over ten spin rows reads 1.2434e-14, so the non-zero spins in the same mode are what show the comparison working",
       "at": [
        "M=1",
        "M=2",
        "M=4",
        "M=10",
        "spin=0",
        "spin=0.001",
        "bisect=100",
        "bisect=200",
        "bisect=400",
        "bisect=800",
        "bisect=2000",
        "golden=40",
        "golden=100",
        "golden=200",
        "golden=400",
        "golden=800",
        "golden=1600",
        "golden=4000"
       ]
      },
      {
       "device": "mpmstep",
       "mode": "freefall",
       "field": "errNoPlastic",
       "knob": "dt",
       "value": 0.0004166666666666667,
       "registered": false,
       "reason": null,
       "at": [
        "dt=0.0004166666666666667",
        "dt=0.0020833333333333333",
        "gy=-2.4525",
        "nu=0.6"
       ]
      },
      {
       "device": "mpmstep",
       "mode": "freefall",
       "field": "errY",
       "knob": "dt",
       "value": 0.0004166666666666667,
       "registered": false,
       "reason": null,
       "at": [
        "dt=0.0004166666666666667",
        "dt=0.0020833333333333333",
        "gy=-2.4525"
       ]
      },
      {
       "device": "mpmstep",
       "mode": "noplastic",
       "field": "errY",
       "knob": "dt",
       "value": 0.0004166666666666667,
       "registered": false,
       "reason": null,
       "at": [
        "dt=0.0004166666666666667",
        "dt=0.0020833333333333333",
        "gy=-2.4525",
        "nu=0.6"
       ]
      },
      {
       "device": "multigridgpu",
       "mode": "window",
       "field": "widerRel",
       "knob": "n",
       "value": 3,
       "registered": false,
       "reason": null,
       "at": [
        "n=3",
        "n=8"
       ]
      },
      {
       "device": "nuclear",
       "mode": "chain",
       "field": "conservationResidual",
       "knob": "N0",
       "value": 1,
       "registered": true,
       "reason": "A + B + C = N0 for the closed Bateman chain, exact by construction since the three populations partition a fixed nucleon count; bit-zero at the fixture's rates and 1.1369e-13 at l1=1e-4 l2=7 t=0.2, so the sum is genuinely recomputed rather than asserted",
       "at": [
        "N0=1",
        "N0=2",
        "N0=4",
        "N0=10",
        "l1=0.007000000000000001",
        "l1=0.035",
        "l1=0.07",
        "l1=0.14",
        "l1=0.28",
        "l1=0.7000000000000001",
        "l2=0.031",
        "l2=0.0775",
        "l2=0.155",
        "l2=0.31",
        "l2=0.62",
        "l2=1.24",
        "l2=3.1",
        "t=2",
        "t=10",
        "t=20",
        "t=40",
        "t=80",
        "t=200",
        "A=6",
        "A=14",
        "A=28",
        "A=56",
        "A=112",
        "A=224",
        "A=560",
        "Z=3",
        "Z=7",
        "Z=13",
        "Z=26",
        "Z=52",
        "Z=104",
        "Z=260"
       ]
      },
      {
       "device": "nuclear",
       "mode": "chain",
       "field": "integratedConservationResidual",
       "knob": "l2",
       "value": 0.155,
       "registered": false,
       "reason": null,
       "at": [
        "l2=0.155"
       ]
      },
      {
       "device": "refscan",
       "mode": "decision",
       "field": "indicatorResidual",
       "knob": "maxDepth",
       "value": 1,
       "registered": false,
       "reason": null,
       "at": [
        "maxDepth=1"
       ]
      },
      {
       "device": "refscan",
       "mode": "furnace",
       "field": "worstAlbedoErrFrac",
       "knob": "spp",
       "value": 1,
       "registered": false,
       "reason": null,
       "at": [
        "spp=1"
       ]
      },
      {
       "device": "sdfmarch",
       "mode": "sphere",
       "field": "normalErr",
       "knob": "R",
       "value": 4,
       "registered": false,
       "reason": null,
       "at": [
        "R=4",
        "R=10"
       ]
      },
      {
       "device": "splat",
       "mode": "compose",
       "field": "alphaErr",
       "knob": "z",
       "value": 1,
       "registered": true,
       "reason": "over-compositing is exact rational arithmetic on dyadic alphas",
       "at": [
        "z=1",
        "z=3",
        "z=5",
        "z=10",
        "z=20",
        "z=50",
        "f=80",
        "f=200",
        "f=400",
        "f=800",
        "f=1600",
        "f=3200",
        "f=8000",
        "sigma=0.010000000000000002",
        "sigma=0.025",
        "sigma=0.05",
        "sigma=0.1",
        "sigma=0.2",
        "sigma=0.4",
        "sigma=1",
        "gridN=26",
        "gridN=64",
        "gridN=128",
        "gridN=256",
        "gridN=512",
        "gridN=1024",
        "gridN=2560",
        "alpha=0.3",
        "alpha=0.6",
        "alpha=1.2",
        "alpha=3",
        "count=1",
        "count=2",
        "count=4",
        "count=7",
        "count=14",
        "count=28",
        "count=70",
        "offAxis=1",
        "offAxis=2",
        "offAxis=4",
        "offAxis=8",
        "offAxis=20"
       ]
      },
      {
       "device": "splat",
       "mode": "compose",
       "field": "alphaOrderDelta",
       "knob": "z",
       "value": 1,
       "registered": true,
       "reason": "a permutation of identical alpha terms; commutativity of equal addends makes this exactly zero",
       "at": [
        "z=1",
        "z=3",
        "z=5",
        "z=10",
        "z=20",
        "z=50",
        "f=80",
        "f=200",
        "f=400",
        "f=800",
        "f=1600",
        "f=3200",
        "f=8000",
        "sigma=0.010000000000000002",
        "sigma=0.025",
        "sigma=0.05",
        "sigma=0.1",
        "sigma=0.2",
        "sigma=0.4",
        "sigma=1",
        "gridN=26",
        "gridN=64",
        "gridN=128",
        "gridN=256",
        "gridN=512",
        "gridN=1024",
        "gridN=2560",
        "alpha=0.03",
        "alpha=0.075",
        "alpha=0.15",
        "alpha=0.3",
        "alpha=0.6",
        "alpha=1.2",
        "alpha=3",
        "count=1",
        "count=2",
        "count=4",
        "count=7",
        "count=14",
        "count=28",
        "count=70",
        "offAxis=1",
        "offAxis=2",
        "offAxis=4",
        "offAxis=8",
        "offAxis=20"
       ]
      },
      {
       "device": "splat",
       "mode": "compose",
       "field": "sameColourOrderDelta",
       "knob": "z",
       "value": 1,
       "registered": true,
       "reason": "a permutation of identical terms; commutativity makes this exactly zero",
       "at": [
        "z=1",
        "z=3",
        "z=5",
        "z=10",
        "z=20",
        "z=50",
        "f=80",
        "f=200",
        "f=400",
        "f=800",
        "f=1600",
        "f=3200",
        "f=8000",
        "sigma=0.010000000000000002",
        "sigma=0.025",
        "sigma=0.05",
        "sigma=0.1",
        "sigma=0.2",
        "sigma=0.4",
        "sigma=1",
        "gridN=26",
        "gridN=64",
        "gridN=128",
        "gridN=256",
        "gridN=512",
        "gridN=1024",
        "gridN=2560",
        "alpha=0.03",
        "alpha=0.075",
        "alpha=0.15",
        "alpha=0.3",
        "alpha=0.6",
        "alpha=1.2",
        "alpha=3",
        "count=1",
        "count=2",
        "count=4",
        "count=7",
        "count=14",
        "count=28",
        "count=70",
        "offAxis=1",
        "offAxis=2",
        "offAxis=4",
        "offAxis=8",
        "offAxis=20"
       ]
      },
      {
       "device": "splat",
       "mode": "detnotsqrt",
       "field": "isoRollDeviation",
       "knob": "sigma",
       "value": 1,
       "registered": false,
       "reason": null,
       "at": [
        "sigma=1"
       ]
      },
      {
       "device": "splat",
       "mode": "integral",
       "field": "isoRollDeviation",
       "knob": "sigma",
       "value": 1,
       "registered": true,
       "reason": "isotropic covariance scaled by a dyadic sigma^2; rotation is an exact exponent shift, so the deviation is exactly zero for power-of-two sigma",
       "at": [
        "sigma=1"
       ]
      },
      {
       "device": "splat",
       "mode": "perspective",
       "field": "areaSlopeErr",
       "knob": "z",
       "value": 1,
       "registered": true,
       "reason": "the fit runs on data generated from the exact inverse-square law, so it recovers the exponent exactly",
       "at": [
        "z=1",
        "z=3",
        "z=5",
        "z=10",
        "z=20",
        "z=50",
        "f=80",
        "f=200",
        "f=400",
        "f=800",
        "f=1600",
        "f=3200",
        "f=8000",
        "sigma=0.010000000000000002",
        "sigma=0.025",
        "sigma=0.05",
        "sigma=0.1",
        "sigma=0.2",
        "sigma=0.4",
        "gridN=26",
        "gridN=64",
        "gridN=128",
        "gridN=256",
        "gridN=512",
        "gridN=1024",
        "gridN=2560",
        "alpha=0.03",
        "alpha=0.075",
        "alpha=0.15",
        "alpha=0.3",
        "alpha=0.6",
        "alpha=1.2",
        "alpha=3",
        "count=1",
        "count=2",
        "count=4",
        "count=7",
        "count=14",
        "count=28",
        "count=70",
        "offAxis=1",
        "offAxis=2",
        "offAxis=4",
        "offAxis=8",
        "offAxis=20"
       ]
      },
      {
       "device": "splat",
       "mode": "shear",
       "field": "onAxisShearDelta",
       "knob": "z",
       "value": 1,
       "registered": true,
       "reason": "on the axis the shear term vanishes identically by symmetry -- a difference of two equal expressions",
       "at": [
        "z=1",
        "z=3",
        "z=5",
        "z=10",
        "z=20",
        "z=50",
        "f=80",
        "f=200",
        "f=400",
        "f=800",
        "f=1600",
        "f=3200",
        "f=8000",
        "sigma=0.010000000000000002",
        "sigma=0.025",
        "sigma=0.05",
        "sigma=0.1",
        "sigma=0.2",
        "sigma=0.4",
        "sigma=1",
        "gridN=26",
        "gridN=64",
        "gridN=128",
        "gridN=256",
        "gridN=512",
        "gridN=1024",
        "gridN=2560",
        "alpha=0.03",
        "alpha=0.075",
        "alpha=0.15",
        "alpha=0.3",
        "alpha=0.6",
        "alpha=1.2",
        "alpha=3",
        "count=1",
        "count=2",
        "count=4",
        "count=7",
        "count=14",
        "count=28",
        "count=70",
        "offAxis=1",
        "offAxis=2",
        "offAxis=4",
        "offAxis=8",
        "offAxis=20"
       ]
      },
      {
       "device": "strokeMorph",
       "mode": "morph",
       "field": "straightLineWorstErr",
       "knob": "N",
       "value": 6,
       "registered": false,
       "reason": null,
       "at": [
        "N=6"
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
       "ms": 1655600,
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
      "blobbodies": {
       "ms": 4793300,
       "modes": 2,
       "builds": 40,
       "zeros": 0,
       "unregistered": 0
      },
      "bonefield": {
       "ms": 0,
       "modes": 1,
       "builds": 0,
       "zeros": 0,
       "unregistered": 0
      },
      "centrifuge": {
       "ms": 3700,
       "modes": 5,
       "builds": 285,
       "zeros": 1,
       "unregistered": 0
      },
      "clocks": {
       "ms": 0,
       "modes": 4,
       "builds": 124,
       "zeros": 2,
       "unregistered": 0
      },
      "ct": {
       "ms": 5800,
       "modes": 4,
       "builds": 112,
       "zeros": 0,
       "unregistered": 0
      },
      "eccentric": {
       "ms": 5600,
       "modes": 5,
       "builds": 190,
       "zeros": 2,
       "unregistered": 0
      },
      "fermi": {
       "ms": 1700,
       "modes": 1,
       "builds": 20,
       "zeros": 0,
       "unregistered": 0
      },
      "flip2d": {
       "ms": 30200,
       "modes": 2,
       "builds": 100,
       "zeros": 0,
       "unregistered": 0
      },
      "freesurface": {
       "ms": 718500,
       "modes": 3,
       "builds": 246,
       "zeros": 0,
       "unregistered": 0
      },
      "blobkelvin": {
       "ms": 0,
       "modes": 2,
       "builds": 28,
       "zeros": 1,
       "unregistered": 0
      },
      "born": {
       "ms": 0,
       "modes": 3,
       "builds": 75,
       "zeros": 0,
       "unregistered": 0
      },
      "cfl": {
       "ms": 182200,
       "modes": 4,
       "builds": 196,
       "zeros": 0,
       "unregistered": 0
      },
      "compose": {
       "ms": 0,
       "modes": 1,
       "builds": 0,
       "zeros": 0,
       "unregistered": 0
      },
      "debye": {
       "ms": 800,
       "modes": 1,
       "builds": 25,
       "zeros": 0,
       "unregistered": 0
      },
      "em": {
       "ms": 242000,
       "modes": 7,
       "builds": 441,
       "zeros": 0,
       "unregistered": 0
      },
      "fft": {
       "ms": 0,
       "modes": 4,
       "builds": 80,
       "zeros": 6,
       "unregistered": 0
      },
      "flip3d": {
       "ms": 2204000,
       "modes": 4,
       "builds": 248,
       "zeros": 0,
       "unregistered": 0
      },
      "freeze": {
       "ms": 394200,
       "modes": 4,
       "builds": 84,
       "zeros": 1,
       "unregistered": 1
      },
      "geostats": {
       "ms": 0,
       "modes": 5,
       "builds": 55,
       "zeros": 2,
       "unregistered": 0
      },
      "hmc": {
       "ms": 100,
       "modes": 2,
       "builds": 56,
       "zeros": 0,
       "unregistered": 0
      },
      "inspiral": {
       "ms": 0,
       "modes": 2,
       "builds": 74,
       "zeros": 0,
       "unregistered": 0
      },
      "kepler": {
       "ms": 1500,
       "modes": 6,
       "builds": 174,
       "zeros": 0,
       "unregistered": 0
      },
      "kinetics": {
       "ms": 3300,
       "modes": 3,
       "builds": 57,
       "zeros": 0,
       "unregistered": 0
      },
      "langevin": {
       "ms": 1900,
       "modes": 2,
       "builds": 40,
       "zeros": 0,
       "unregistered": 0
      },
      "md": {
       "ms": 0,
       "modes": 10,
       "builds": 0,
       "zeros": 0,
       "unregistered": 0
      },
      "mpmcouple": {
       "ms": 600,
       "modes": 2,
       "builds": 56,
       "zeros": 0,
       "unregistered": 0
      },
      "mpmmomentum": {
       "ms": 3700,
       "modes": 3,
       "builds": 162,
       "zeros": 0,
       "unregistered": 0
      },
      "mpmstep": {
       "ms": 700,
       "modes": 4,
       "builds": 224,
       "zeros": 3,
       "unregistered": 3
      },
      "multigridgpu": {
       "ms": 26700,
       "modes": 5,
       "builds": 70,
       "zeros": 1,
       "unregistered": 1
      },
      "paramagnet": {
       "ms": 0,
       "modes": 1,
       "builds": 42,
       "zeros": 0,
       "unregistered": 0
      },
      "plastic": {
       "ms": 0,
       "modes": 5,
       "builds": 0,
       "zeros": 0,
       "unregistered": 0
      },
      "pulsar": {
       "ms": 300,
       "modes": 4,
       "builds": 84,
       "zeros": 0,
       "unregistered": 0
      },
      "refscan": {
       "ms": 2900,
       "modes": 5,
       "builds": 375,
       "zeros": 2,
       "unregistered": 2
      },
      "sdfmarch": {
       "ms": 257800,
       "modes": 5,
       "builds": 440,
       "zeros": 1,
       "unregistered": 1
      },
      "splat": {
       "ms": 200,
       "modes": 6,
       "builds": 276,
       "zeros": 7,
       "unregistered": 1
      },
      "tempering": {
       "ms": 118300,
       "modes": 1,
       "builds": 21,
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
      },
      "galaxy": {
       "ms": 6500,
       "modes": 6,
       "builds": 222,
       "zeros": 1,
       "unregistered": 0
      },
      "hands": {
       "ms": 300,
       "modes": 7,
       "builds": 287,
       "zeros": 1,
       "unregistered": 0
      },
      "induction": {
       "ms": 2500,
       "modes": 4,
       "builds": 156,
       "zeros": 0,
       "unregistered": 0
      },
      "invariants": {
       "ms": 0,
       "modes": 5,
       "builds": 210,
       "zeros": 2,
       "unregistered": 2
      },
      "kerrladder": {
       "ms": 0,
       "modes": 4,
       "builds": 84,
       "zeros": 1,
       "unregistered": 0
      },
      "landauzener": {
       "ms": 4600,
       "modes": 2,
       "builds": 12,
       "zeros": 0,
       "unregistered": 0
      },
      "lotkavolterra": {
       "ms": 5400,
       "modes": 4,
       "builds": 224,
       "zeros": 0,
       "unregistered": 0
      },
      "mpm3d": {
       "ms": 200,
       "modes": 4,
       "builds": 180,
       "zeros": 0,
       "unregistered": 0
      },
      "mpmforce": {
       "ms": 100,
       "modes": 4,
       "builds": 180,
       "zeros": 0,
       "unregistered": 0
      },
      "mpmplastic": {
       "ms": 0,
       "modes": 4,
       "builds": 56,
       "zeros": 0,
       "unregistered": 0
      },
      "mpmtransfer": {
       "ms": 0,
       "modes": 4,
       "builds": 184,
       "zeros": 0,
       "unregistered": 0
      },
      "nuclear": {
       "ms": 400,
       "modes": 3,
       "builds": 117,
       "zeros": 2,
       "unregistered": 1
      },
      "percolation": {
       "ms": 303600,
       "modes": 2,
       "builds": 42,
       "zeros": 0,
       "unregistered": 0
      },
      "powder": {
       "ms": 1300,
       "modes": 1,
       "builds": 20,
       "zeros": 0,
       "unregistered": 0
      },
      "reaction": {
       "ms": 117600,
       "modes": 5,
       "builds": 330,
       "zeros": 0,
       "unregistered": 0
      },
      "rmt": {
       "ms": 114300,
       "modes": 2,
       "builds": 52,
       "zeros": 0,
       "unregistered": 0
      },
      "spacefill": {
       "ms": 0,
       "modes": 3,
       "builds": 0,
       "zeros": 0,
       "unregistered": 0
      },
      "strokeMorph": {
       "ms": 100,
       "modes": 1,
       "builds": 14,
       "zeros": 1,
       "unregistered": 1
      },
      "thermostat": {
       "ms": 100,
       "modes": 4,
       "builds": 164,
       "zeros": 0,
       "unregistered": 0
      },
      "vaporize": {
       "ms": 0,
       "modes": 4,
       "builds": 28,
       "zeros": 0,
       "unregistered": 0
      },
      "windtunnel": {
       "ms": 549000,
       "modes": 3,
       "builds": 126,
       "zeros": 0,
       "unregistered": 0
      },
      "zeta": {
       "ms": 0,
       "modes": 5,
       "builds": 0,
       "zeros": 0,
       "unregistered": 0
      }
     },
     "errors": []
    });
// ==== /MEASURED_V4426 ====

/**
 * *** THE CANDIDATE REPLACEMENT CONTROL, AND THE MEASUREMENT THAT DISQUALIFIES THE STATED MECHANISM. ***
 * Eighteen values of sigma through splat.integral. Recorded rather than summarised, because the whole point is
 * that a smaller sample agreed with the wrong explanation.
 */
export const SPLAT_ISOROLL = Object.freeze({
    field: "splat.integral.isoRollDeviation",
    gateProbes: Object.freeze({ dyadic: [0.125, 0.25, 0.5, 1, 2], nonDyadic: [0.1, 0.3, 0.7] }),
    measured: Object.freeze([
        { sigma: 0.05, zero: false }, { sigma: 0.1, zero: false }, { sigma: 0.2, zero: false },
        { sigma: 0.3, zero: false }, { sigma: 0.4, zero: false }, { sigma: 0.5, zero: true },
        { sigma: 0.6, zero: false }, { sigma: 0.7, zero: false }, { sigma: 0.8, zero: false },
        { sigma: 0.9, zero: false }, { sigma: 1, zero: true }, { sigma: 1.05, zero: true },
        { sigma: 1.1, zero: true }, { sigma: 1.2, zero: true }, { sigma: 1.3, zero: true },
        { sigma: 1.5, zero: true }, { sigma: 2, zero: true }, { sigma: 3, zero: true },
        { sigma: 0.125, zero: true }, { sigma: 0.25, zero: true },
    ]),
    // Rules, testable against the rows above rather than asserted about them.
    rules: Object.freeze({
        dyadic: "fits the gate's 8 probes, FAILS on 20",
        atLeastOne: "fits neither sample",
        either: "sigma >= 1 OR dyadic -- fits all 20",
    }),
    confound: "the recorded mechanism is not wrong, it is INCOMPLETE. 'Dyadic' is true on every point the gate " +
              "chose and false on twenty: 1.05, 1.1, 1.2, 1.3 and 1.5 are not dyadic and are exactly zero. A " +
              "second rule operates at or above sigma = 1, and all three of the gate's non-dyadic probes are " +
              "below it. A sample drawn entirely on one side of a boundary cannot show that the boundary exists.",
});

/** Is a proposed mechanism consistent with the measurement, or does another rule fit the same points? */
export function mechanismFits(rows, rule) { return rows.every((r) => rule(r.sigma) === r.zero); }

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
 * *** AND ONE DEVICE DOES NOT FINISH AT ALL, WHICH IS A THIRD STATE AGAIN. ***
 *
 * bell is SLOW: 27 minutes, and it ends. Shard 2 sat on its seventh device from 19:15 to 23:36 and was still
 * sitting there when it was killed -- four and a quarter hours on one device, with no result. That is not the
 * same fact as "expensive", and folding the two together is how v2912's twenty minutes became a scoped gate:
 * a sweep that is merely slow can be given more time, and a sweep that does not terminate cannot.
 *
 * The three states this round keeps separate, because each has a different remedy:
 *   BUILT NOTHING   the population was empty; the clean result is vacuous (astroparticle, csg, figureeight)
 *   EXPENSIVE       finished, and dominated the bill (bell, 89% of the measured total)
 *   DID NOT FINISH  ran hours without terminating; no verdict exists and more time will not produce one
 */
export const NONTERMINATING = Object.freeze({
    device: "diffusion",
    completedBefore: Object.freeze(["astroparticle", "blackbody", "blobthermal", "box3d", "chaos", "crystallize"]),
    stoppedAfterMs: 15300000,
    note: "shard 2's seventh device. Named rather than counted, because 'the sweep has a device that hangs' is " +
          "a bug report and 'one of them did not finish' is a shrug. Recorded as a STATE rather than a " +
          "duration: slow can be answered with a bigger budget and this cannot.",
});

/**
 * *** THE FULL SWEEP WAS NEVER EXPENSIVE. ITS COST LIVES IN A HANDFUL OF DEVICES. ***
 *
 * "Did not finish in twenty minutes" reads as a statement about a big sweep. Measured per device it is nothing
 * of the kind: TWO of seventy-eight devices hold half the total, eight hold 91%, and the MEDIAN DEVICE TAKES
 * 1.5 SECONDS. So the remedy v2912 drew -- scope the gate to four device/modes out of 484 -- was aimed at the
 * wrong thing. It is the shape redCensus-selfcheck already guards against for its own census: "a THIRD such
 * entry would fail this: at that point the list is one slow gate wearing a census as a hat."
 *
 * *** AND THIS ROUND GOT THAT WRONG ONCE, ON ITS OWN DATA, IN THE DIRECTION IT WAS WATCHING FOR. *** At 20
 * devices the top device was `bell` at 89% of the total, and that was written down and committed. At 78 it is
 * `blobbodies` at 40%, and bell is THIRD. The claim was not false so much as measured on a sample too small to
 * carry it -- which is corroborationCensus.mjs's own complaint, quoted in this session one round earlier: "a
 * rate measured on a sample I selected is not a rate." So `share` is reported and the GATED properties are the
 * ones that do not move with the sample: how few devices hold half the cost, and what the median device costs.
 */
export function costConcentration(perDevice) {
    const e = Object.entries(perDevice).map(([name, d]) => ({ name, ms: d.ms || 0 })).sort((a, b) => b.ms - a.ms);
    const total = e.reduce((a, x) => a + x.ms, 0);
    let cum = 0, half = 0;
    for (const x of e) { cum += x.ms; half++; if (cum > total / 2) break; }
    const sorted = e.map((x) => x.ms).sort((a, b) => a - b);
    return {
        total, n: e.length, top: e[0] || null,
        share: e.length && total ? e[0].ms / total : 0,
        rest: total - (e[0] ? e[0].ms : 0),
        devicesHoldingHalf: half,
        medianMs: sorted.length ? sorted[sorted.length >> 1] : 0,
    };
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
