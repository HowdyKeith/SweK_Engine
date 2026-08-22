// tools/roundhouse/clocksBind.mjs
//
// v3361 -- THE ROUNDHOUSE DEVICE THAT ONLY CARES ABOUT TIME.
//
// Every other device here measures a geometry, a rate, a distribution or a route, and reports time as one
// observable among many. This one asks only the clock question -- how fast does a clock here tick compared to a
// clock there -- and that question has four independent exact answers.
//
//   "rates"      static sqrt(1-2M/r) against orbiting sqrt(1-3M/r), and the 1.5x crossover between them
//   "spin"       the gravitomagnetic clock effect, t(pro) - t(retro) = 4 pi a, exactly and at every radius
//
// THE CLOCK EFFECT IS THE REASON THIS IS A DEVICE RATHER THAN AN OBSERVABLE. Every dilation RATE tends to 1 far
// from the hole, so rate-based instruments report nothing at large radius. The clock effect is an ACCUMULATED
// difference that does not shrink -- the same 4 pi a at r = 1000 as at r = 10 -- and it depends on NOTHING but
// the spin. It weighs a hole's rotation with two clocks and no ruler.

import {
    clocksAt, clockEffect, clockEffectExact, orbitingDilation, orbitingDilationNaive, staticDilation, crossoverRadius,
    radialLightTime, shapiroDelay, staticRedshift, orbitingRedshift,
    epicyclicKappa, radialOscillationPeriod, orbitalOmega, iscoFromTiming,
} from "../../physics/blackhole/clocks.mjs";

export const CLOCK_OBSERVABLES = [
    "staticRate", "orbitingRate", "orbitingSlower", "crossoverRatio", "crossoverResidual",
    "clockEffect", "clockEffectExact", "clockEffectErrFrac", "clockEffectRadiusIndependent",
    "periodPro", "periodRetro", "r", "a",
    "lightTime", "shapiroDelay", "shapiroPositive", "zStatic", "zOrbiting", "orbitingMoreRedshifted",
    "kappa", "omega", "radialPeriod", "iscoTiming", "iscoAgrees",
    "planted", "crossoverErrOrder",
];

const DEF = {
    // v3435 -- DECLARED, NOT ADDED: every key below was ALREADY READ by this bind and ALREADY had this
    // exact fallback. defaults() simply never said so, and strictBuild therefore REJECTED A PARAMETER THAT
    // DEMONSTRABLY WORKS -- blackhole's iscoKm moves 12.40 -> 17.72 when nsMass is set. THE GUARD WAS
    // BLOCKING THE THING IT WAS BUILT TO PROTECT. Declaring costs nothing at run time because the value is
    // the one the code already fell back to; what it buys is that the contract now matches the behaviour.
    r1: 3,
    r2: 50,
 M: 1, a: 0.6, r: 12 };

function buildClocks({ mode = "rates", config = {} } = {}) {
    const c = { ...DEF, ...config };

    // v3362 -- SHAPIRO DELAY, EMITTER REDSHIFT AND THE ISCO FOUND BY TIMING ALONE.
    if (mode === "signal") {
        const r1 = Number.isFinite(c.r1) ? c.r1 : 3, r2 = Number.isFinite(c.r2) ? c.r2 : 50;
        const d = shapiroDelay(c.M, r1, r2);
        return {
            staticRate: null, orbitingRate: null, orbitingSlower: null,
            crossoverRatio: null, crossoverResidual: null,
            clockEffect: null, clockEffectExact: null, clockEffectErrFrac: null,
            clockEffectRadiusIndependent: null, periodPro: null, periodRetro: null, r: r2, a: null,
            lightTime: radialLightTime(c.M, r1, r2), shapiroDelay: d, shapiroPositive: d > 0,
            zStatic: staticRedshift(c.M, r1), zOrbiting: orbitingRedshift(c.M, r1),
            orbitingMoreRedshifted: orbitingRedshift(c.M, r1) > staticRedshift(c.M, r1),
            kappa: null, omega: null, radialPeriod: null, iscoTiming: null, iscoAgrees: null,
        };
    }
    if (mode === "epicyclic") {
        const r = Number.isFinite(c.r) ? c.r : 8;
        return {
            staticRate: null, orbitingRate: null, orbitingSlower: null,
            crossoverRatio: null, crossoverResidual: null,
            clockEffect: null, clockEffectExact: null, clockEffectErrFrac: null,
            clockEffectRadiusIndependent: null, periodPro: null, periodRetro: null, r, a: null,
            lightTime: null, shapiroDelay: null, shapiroPositive: null,
            zStatic: null, zOrbiting: null, orbitingMoreRedshifted: null,
            kappa: epicyclicKappa(c.M, r), omega: orbitalOmega(c.M, r),
            radialPeriod: radialOscillationPeriod(c.M, r),
            iscoTiming: iscoFromTiming(c.M),
            // the ISCO located by a diverging radial period, checked against the orbital-stability root
            iscoAgrees: !Number.isFinite(radialOscillationPeriod(c.M, iscoFromTiming(c.M))),
        };
    }
    if (mode === "spin") {
        const radii = [10, 50, 200, 1000];
        const vals = radii.map((r) => clockEffect(c.M, c.a, r));
        const want = clockEffectExact(c.a);
        const worst = Math.max(...vals.map((v) => Math.abs(v - want) / want));
        return {
            staticRate: null, orbitingRate: null, orbitingSlower: null,
            crossoverRatio: null, crossoverResidual: null,
            clockEffect: vals[0], clockEffectExact: want, clockEffectErrFrac: worst,
            // the signature property: the SAME value at every radius
            clockEffectRadiusIndependent: worst < 1e-9,
            periodPro: null, periodRetro: null, r: null, a: c.a,
        };
    }

    const o = clocksAt(c.M, c.a, c.r);
    // v3391 -- THE PLANTED ERROR ENTERS WHERE THE PHYSICS ENTERS, not where the number is compared: `planted`
    // swaps in the naive gravity-times-SR composition for the ORBITING clock and changes nothing else, so the
    // whole path from radius to crossover residual is what gets graded. plantedError.mjs's second design rule.
    const orbitRate = c.planted ? orbitingDilationNaive(c.M, c.r) : orbitingDilation(c.M, c.r);
    // the crossover: an orbiting clock at r matches a static clock at r/1.5
    const resid = Math.abs(orbitRate - staticDilation(c.M, c.r / 1.5));
    // THE ERROR'S ORDER, NOT ITS SIZE: the naive composition is wrong by exactly 2 M^2 / r^2, so this reads
    // 2.000000000000 under the planted error and 0 without it. A size shrinks with radius and says nothing; an
    // ORDER is the same number everywhere and is what makes the blindness statable.
    const trueSq = orbitingDilation(c.M, c.r) ** 2;
    const order = (orbitRate * orbitRate - trueSq) * c.r * c.r / (c.M * c.M);
    return {
        staticRate: o.staticRate, orbitingRate: orbitRate,
        orbitingSlower: o.orbitingSlowerThanStatic,
        crossoverRatio: crossoverRadius(1), crossoverResidual: resid,
        planted: !!c.planted, crossoverErrOrder: order,
        clockEffect: o.clockEffect, clockEffectExact: o.clockEffectExact,
        clockEffectErrFrac: o.clockEffectExact > 0 ? Math.abs(o.clockEffect - o.clockEffectExact) / o.clockEffectExact : 0,
        clockEffectRadiusIndependent: null,
        periodPro: o.periodPro, periodRetro: o.periodRetro, r: o.r, a: o.a,
    };
}

export const clocksDevice = {
    // v3400 -- KNOB PLANT: the perturbation replaces a PHYSICS LAW or FUNCTION upstream of every observable,
    // so the whole path from the wrong derivation to the reported number is graded. plantedError's second design
    // rule ("perturb the physics, not the number") in its ordinary form.
    plantKind: "knob",
    modes: ["rates", "spin", "signal", "epicyclic"],
    name: "relativistic-clocks", observables: CLOCK_OBSERVABLES, build: buildClocks,
    defaults: ({ mode } = {}) => ({ mode: mode || "rates", config: { ...DEF } }),
};
