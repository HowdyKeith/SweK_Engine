// tools/roundhouse/renderBounceBind-selfcheck.mjs
//
// Run: node tools/roundhouse/renderBounceBind-selfcheck.mjs   (~859ms MEASURED (gate-timings.json) -- four builds at 60k samples)
//
// THIS GRADES THE BIND. physics/render/bounces-selfcheck.mjs and nee-selfcheck.mjs own the physics.
//
// *** THE PROPERTY THIS FILE EXISTS FOR IS THAT THE SHARPEST KEY IN THE ROUND IS BLIND TO THE COMMONEST BUG,
// AND THE REASON IS NOT NUMERICAL. *** The white furnace is the exactest thing here: at rho = 1 the truncated
// series collapses to L(n) = 1 - k^n, so the shortfall at every depth is a number predicted before the run.
// And forgetting to carry albedo into the recursive call -- the fault bounces.mjs was written to catch -- is
// BIT-IDENTICAL there, because at rho = 1 the throughput factor IS 1 and the bug is indistinguishable from the
// truth. MEASURED: clean and lost both read 0.996600 at rho = 1, and 0.749782 against 0.996600 at rho = 0.8.
//
// The planted number does not move with albedo AT ALL -- 0.996600 at rho = 1, 0.8 and 0.5 alike -- which is the
// bug stated properly: *** LOSING THROUGHPUT TURNS EVERY SURFACE INTO A PERFECT REFLECTOR. *** A renderer with
// this fault and a white-furnace test passes, and every material in it is wrong.
"use strict";
import { renderBounceDevice, RENDERBOUNCE_OBSERVABLES } from "./renderBounceBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { gather } from "../../physics/render/bounces.mjs";
import { rng, cosineSampleHemisphere, createCoordinateSystem, toWorld } from "../../physics/render/furnace.mjs";
import { occluded } from "../../physics/render/occlusion.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
// v4058 -- an ARRAY observable is finite when every entry is, and an EMPTY one is not finite but absent.
// seriesRelByDepth is the first array this device declares; centrifuge has carried errRatios,
// doublingTimes and bands for far longer, so this is the check catching up with the lab, not a new rule.
const finite = (v) => (Array.isArray(v)
    ? v.length > 0 && v.every((x) => typeof x === "number" && Number.isFinite(x))
    : typeof v === "number" && Number.isFinite(v));

console.log("renderBounceBind-selfcheck -- the same solid angle, blocking and emitting\n");

console.log("1. REGISTERED AND REACHABLE");
{
    ok("renderBounce appears in DEVICE_NAMES", DEVICE_NAMES.includes("renderBounce"), DEVICE_NAMES.length + " devices");
    const d = await getDevice("renderBounce");
    ok("!! the registry hands back THIS device", !!d && d.name === "interreflection-and-direct-the-same-solid-angle-twice",
        d ? d.name : "nothing");
    ok("it declares plantKind METHOD", d.plantKind === "method",
        "the estimator's arithmetic is wrong -- no config value records it, which is why the census cannot see "
        + "this one and the gate must");
    const def = d.defaults({});
    ok("!! defaults() returns the whole config, so the knobs are DERIVED",
        ["rho", "radius", "dist", "samples", "maxDepth", "seed", "Le"].every((k) => k in def.config),
        Object.keys(def.config).join(", "));
    ok("...and the shipped albedo is NOT 1", def.config.rho !== 1,
        "rho = " + def.config.rho + ". *** THIS IS LOAD-BEARING, NOT A TASTE. *** Section 4 measures that the "
        + "throughput plant is bit-identical at rho = 1, so a device defaulting to a white furnace would ship "
        + "a plant that cannot fire.");
}

console.log("\n2. EVERY ADVERTISED OBSERVABLE IS PRODUCED, FINITE, AND NOTHING EXTRA");
{
    const v = renderBounceDevice.build(renderBounceDevice.defaults());
    ok("!! no advertised observable is missing", RENDERBOUNCE_OBSERVABLES.every((k) => k in v),
        RENDERBOUNCE_OBSERVABLES.filter((k) => !(k in v)).join(", ") || RENDERBOUNCE_OBSERVABLES.length + " produced");
    ok("...and every one is finite", RENDERBOUNCE_OBSERVABLES.every((k) => finite(v[k])),
        RENDERBOUNCE_OBSERVABLES.filter((k) => !finite(v[k])).join(", ") || "all finite");
    ok("...and nothing unadvertised is produced", Object.keys(v).every((k) => RENDERBOUNCE_OBSERVABLES.includes(k)),
        Object.keys(v).filter((k) => !RENDERBOUNCE_OBSERVABLES.includes(k)).join(", ") || "both directions agree");
}

console.log("\n3. THE GEOMETRY IS MEASURED, NOT TYPED");
{
    const v = renderBounceDevice.build({ config: {} });
    ok("!! k comes from CASTING RAYS and lands on (r/d)^2", v.kResidual < 5e-3,
        "measured " + v.kMeasured.toFixed(6) + " against the geometric " + v.kGeometric.toFixed(6)
        + ", residual " + v.kResidual.toExponential(3) + " at 60k samples. *** TYPING 0.25 WOULD HAVE MADE THE "
        + "SERIES A RESTATEMENT OF ITSELF *** rather than a second route to the same number.");
    ok("!! the truncated series is graded at EVERY depth, not only at convergence",
        v.seriesRelByDepth.length >= 5 && v.seriesWorstRel < 0.02,
        // v4058: was v.seriesDepths, a count that equalled maxDepth exactly and so read as the knob
        // handed back. The per-depth errors carry the same coverage in their LENGTH and are measurements.
        v.seriesRelByDepth.length + " depths, worst relative " + v.seriesWorstRel.toExponential(3)
        + ". L(n) = rho(1-k)(1-(rho k)^n)/(1-rho k) is exact at every n, so a recursive gather is checked at "
        + "n = 1, 2, 3 ... A limit-only key would pass a renderer that got the early bounces wrong.");
    ok("!! the white-furnace shortfall IS k^n, a number predicted before the run",
        v.deficitVsKPowNWorst < 0.02,
        "worst |(1 - gathered) - k^n| = " + v.deficitVsKPowNWorst.toExponential(3) + ". Not 'some small error': "
        + "energy lost shows as a deficit LARGER than k^n and energy invented as a surplus.");
}

console.log("\n4. *** THREE ESTIMATORS FOR ONE DIRECT TERM, SHARING NO LINE ***");
{
    const v = renderBounceDevice.build({ config: {} });
    ok("!! sampling the LIGHT reaches rho*Le*(r/d)^2", v.neeRel < 5e-3, "rel " + v.neeRel.toExponential(3));
    ok("!! sampling the BSDF reaches the same number by a different route", v.bsdfRel < 5e-2,
        "rel " + v.bsdfRel.toExponential(3) + " -- LOOSER ON PURPOSE AND THE LOOSENESS IS THE POINT: a "
        + "cosine-weighted sampler only contributes when it happens to land on the light, so a small light is "
        + "hit rarely and the variance is higher. That is the whole reason next-event estimation exists.");
    ok("!! MIS combines both without double-counting", v.misRel < 5e-3, "rel " + v.misRel.toExponential(3));
    ok("!! *** and the balance-heuristic weights sum to EXACTLY one, an invariance rather than a tolerance ***",
        v.misWeightSumErr === 0,
        "worst |w1 + w2 - 1| = " + v.misWeightSumErr + " over 64 direction pairs. Exactly zero, because "
        + "p/(p+q) + q/(p+q) is one division of one sum. THIS IS WHY COMBINING TWO ESTIMATORS IS NOT DOUBLE "
        + "COUNTING, and it is the only part of this section with no sampling in it.");
    ok("!! *** THE IDENTITY THAT SPANS BOTH FILES: blocking and emitting are the same solid angle ***",
        v.identityResidual < 0.02,
        "occluded furnace + direct term - plain furnace = " + v.identityResidual.toExponential(3)
        + ". The two numbers come from different files, different estimators and different random draws. "
        + "IF THEY DISAGREED, ONE OF THE TWO ROUNDS WOULD BE WRONG AND NEITHER COULD TELL ALONE.");
}

console.log("\n5. *** THE PLANTS ARE THE MODULES' OWN, AND THE SHARPEST KEY IS BLIND TO ONE ***");
{
    const h = renderBounceDevice.build({ config: {} });
    const p = renderBounceDevice.build({ config: { planted: true } });

    ok("!! losing throughput breaks the series by two orders of magnitude",
        h.seriesWorstRel < 0.02 && p.seriesWorstRel > 0.1,
        "worst relative " + h.seriesWorstRel.toExponential(3) + " -> " + p.seriesWorstRel.toFixed(6)
        + " (forget to carry albedo into the recursive call -- bounces.mjs' own `loseThroughput`)");
    ok("!! the wrong pdf with the cone sampler overestimates by a factor of seven",
        h.neeRel < 5e-3 && p.neeRel > 1,
        "rel " + h.neeRel.toExponential(3) + " -> " + p.neeRel.toFixed(6) + ". The error is 1/(1 - cos alpha), "
        + "so THE FURTHER AWAY THE LIGHT THE BRIGHTER THE BUG LOOKS -- a fault that gets more convincing as the "
        + "scene gets harder.");
    ok("...and the cross-file identity collapses with it", p.identityResidual > 0.5,
        h.identityResidual.toExponential(3) + " -> " + p.identityResidual.toFixed(6));

    report("WHICH KEYS ARE BLIND, ASSERTED SO THE BLINDNESS CANNOT WIDEN SILENTLY.");
    ok("!! *** THE WHITE FURNACE IS BIT-IDENTICAL UNDER THE THROUGHPUT PLANT ***",
        h.whiteFurnaceWorstRel === p.whiteFurnaceWorstRel && h.deficitVsKPowNWorst === p.deficitVsKPowNWorst,
        "worst " + h.whiteFurnaceWorstRel.toExponential(3) + " under both. *** AT rho = 1 THE THROUGHPUT FACTOR "
        + "IS 1, SO THE BUG IS THE TRUTH THERE. *** The exactest key in the round -- L(n) = 1 - k^n, predicted "
        + "before the run -- is the one place this fault cannot be seen, and the reason is structural rather "
        + "than numerical. A renderer with a white-furnace test passes with every material wrong.");
    {
        // The claim above, measured directly rather than inferred from the two builds agreeing.
        const wire = { rng, sampler: cosineSampleHemisphere, frame: createCoordinateSystem, toWorld };
        const sphere = [{ centre: [0, 2, 0], radius: 1 }];
        const blocked = (d) => occluded([0, 0, 0], d, sphere);
        const at = (rho, lose) => gather(rho, 60000, { seed: 5, maxDepth: 4, blocked, ...wire, loseThroughput: lose });
        const w1 = at(1, false), w1l = at(1, true), w8 = at(0.8, false), w8l = at(0.8, true), w5l = at(0.5, true);
        ok("!! ...and the planted answer does not move with albedo AT ALL, which is the bug stated properly",
            w1 === w1l && w1l === w8l && w8l === w5l && w8 !== w8l,
            "clean/lost at rho=1: " + w1.toFixed(6) + " / " + w1l.toFixed(6) + " (identical). "
            + "At rho=0.8: " + w8.toFixed(6) + " / " + w8l.toFixed(6) + ". At rho=0.5 the planted answer is "
            + "STILL " + w5l.toFixed(6) + ". *** LOSING THROUGHPUT TURNS EVERY SURFACE INTO A PERFECT "
            + "REFLECTOR *** -- so the fault is not 'slightly too bright', it is the material system doing "
            + "nothing at all.");
    }
    ok("!! AND THE GEOMETRY IS BLIND TO BOTH PLANTS, which is what localises them",
        h.kMeasured === p.kMeasured && h.kResidual === p.kResidual,
        "k = " + h.kMeasured.toFixed(6) + " under both: the sphere is where it is, and no estimator fault can "
        + "move it. A device reporting only k would certify a renderer losing a quarter of its light per bounce.");
    ok("...and so are the MIS weights, which contain no sampling at all",
        h.misWeightSumErr === p.misWeightSumErr, "0 under both -- an algebraic identity, not an estimate");
}

console.log("\n" + (fails ? "renderBounceBind-selfcheck: " + fails + " FAILED" : "renderBounceBind-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
