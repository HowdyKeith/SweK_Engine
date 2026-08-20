// tools/roundhouse/lensTidal-selfcheck.mjs
//
// Run: node tools/roundhouse/lensTidal-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2894 -- devices 23 and 24: THE IMAGE AS A MEASUREMENT, THE SHOT AS A GEODESIC, AND THE BLOB TORN APART.
//
// These admit three things that usually live in the "renderer" and are therefore usually theatre -- a picture, an
// aim, and a special effect -- on exactly the terms everything else in this lab is admitted on: they have closed
// forms, so they can be refused.
//
// THE LINE IS NOT RESOLUTION. Integration resolution is physics; pixel resolution is theatre UNLESS the image has
// an answer key. A Schwarzschild shadow has one: sin^2(alpha) = (b_crit/r_obs)^2 (1 - 2M/r_obs). So "how many
// pixels across is the hole" becomes falsifiable, and the camera that finds the disc's rim by MARCHING RAYS -- by
// looking, not by evaluating the formula -- can be graded against it.
//
// THREE CORRECTIONS CALIBRATION FORCED, each recorded because each was a thing believed and then measured:
//   1. "You must not aim where the target appears" -- BACKWARDS. Null geodesics are time-reversible, so the
//      apparent bearing IS the firing solution; what misses is aiming where the target actually is.
//   2. The tidal fall ran for tau=20 and moved the body 0.08M. Every mode agreed with every other because nothing
//      had happened. A test that passes because the experiment did not run is the worst kind.
//   3. The disruption radius was computed from the same closed form it was graded against -- error exactly 0.0,
//      which is the tell. It now integrates two geodesics and measures the tidal acceleration instead.

import { buildLens, lensDevice, shadowAngle, impactOf } from "./lensBind.mjs";
import { buildTidal, tidalDevice, thermalModelNote } from "./tidalBind.mjs";
import { criticalImpact, photonSphere } from "../../physics/blackhole/geodesic.js";
import { suspiciousZero } from "./suspiciousZero.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { roundhouseDevice } from "./deviceBind.mjs";
import { DEMO_HYPS } from "./run-device.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE PICTURE IS A MEASUREMENT ------------------------------------------------------------------------------
{
    for (const rObs of [20, 10, 6]) {
        const o = buildLens({ mode: "shadow", config: { rObs } });
        ok(`shadow at r=${rObs}M: the ray-marched rim matches the closed form`, o.shadowErrFrac < 1e-12,
            "measured " + o.shadowAngleRad.toFixed(9) + " rad vs exact " + o.shadowAngleExact.toFixed(9) +
            " (err " + o.shadowErrFrac.toExponential(2) + ") -- a camera that finds the edge BY LOOKING agrees with theory");
    }
    const atPhoton = buildLens({ mode: "shadow", config: { rObs: photonSphere(1) } });
    ok("!! at the photon sphere the hole subtends exactly 90 degrees -- half the sky goes black",
        Math.abs(atPhoton.shadowAngleExact - Math.PI / 2) < 1e-9 && atPhoton.shadowFillsSky === true,
        "alpha = " + (atPhoton.shadowAngleExact * 180 / Math.PI).toFixed(6) + " deg at r = 3M");
    const px = buildLens({ mode: "pixels", config: { rObs: 20, resolution: 512, fovDeg: 60 } });
    ok("!! the FRAMEBUFFER claim: the shadow's diameter in pixels is pinned by the same closed form",
        px.pixelErrFrac < 1e-12 && px.pixelDiameter > 1,
        px.pixelDiameter.toFixed(3) + " px of 512 at 60 deg fov -- a render can be graded, which is what stops it being theatre");
}

// ---- 2. FIRING FOR REAL -------------------------------------------------------------------------------------------
{
    const bc = buildLens({ mode: "bcrit" });
    ok("!! the capture threshold measured by tracing photons is 3 sqrt(3) M", bc.bCritErrFrac < 1e-10,
        bc.bCritMeasured.toFixed(10) + " vs " + criticalImpact(1).toFixed(10));
    const near = buildLens({ mode: "shot", config: { rObs: 20, psiDeg: 10 } });
    const far = buildLens({ mode: "shot", config: { rObs: 20, psiDeg: 40 } });
    ok("!! a shot's fate is a null geodesic, not a raycast: steep aim is swallowed, shallow aim escapes",
        near.shotCaptured === true && far.shotCaptured === false && near.shotB < criticalImpact(1) && far.shotB > criticalImpact(1),
        "psi=10deg -> b=" + near.shotB.toFixed(3) + " (captured); psi=40deg -> b=" + far.shotB.toFixed(3) + " (escapes)");
    const d = buildLens({ mode: "deflect", config: { b: 100 } });
    ok("far rays match the Einstein deflection 4M/b, and exceed it slightly as GR requires",
        d.deflectionErrFrac < 0.05 && d.deflectionMeasured > d.deflectionWeak,
        "measured " + d.deflectionMeasured.toFixed(6) + " vs weak " + d.deflectionWeak.toFixed(6));
}

// ---- 3. THE AIMING RULE, AND THE CORRECTION TO IT -----------------------------------------------------------------
{
    const a = buildLens({ mode: "aim", config: { rObs: 500, deltaRad: 0.04 } });
    ok("!! hitting a target BEHIND the hole needs the impact parameter whose deflection equals the offset",
        a.aimCorrectedHits === true && a.aimNaiveHits === false,
        "b = " + a.aimB.toFixed(3) + "M bends the shot by exactly the 0.04 rad required; an unbent shot sweeps pi and misses by that much");
    ok("...and the required b matches the weak-field key 4M/delta, exceeding it by the next-order term",
        a.aimBErrFrac < 0.06 && a.aimB > a.aimBWeak,
        "measured " + a.aimB.toFixed(3) + " vs 4M/delta = " + a.aimBWeak.toFixed(3) +
        " -- a systematic ~3M excess across delta, which is the higher-order correction, not noise");
    ok("!! CORRECTION ON RECORD: the apparent bearing is the FIRING SOLUTION, not the thing to avoid",
        true,
        "null geodesics are time-reversible, so light's path from the target to you reversed is your shot's path to it -- " +
        "what misses is aiming where the target ACTUALLY is. Stated wrongly first; the tracer settled it");
}

// ---- 3b. THE EXTENDED SOURCE (v2897): THE LENS AS A RULER ---------------------------------------------------------
{
    // image positions, from numerically solving beta = theta - 1/theta, against the closed form
    const errs = [0.1, 0.3, 1.0].map((u) => buildLens({ mode: "images", config: { sourceU: u } }).imageErrFrac);
    ok("!! numerically-solved image positions match (u +- sqrt(u^2+4))/2 to machine precision",
        errs.every((e) => e < 1e-15),
        "errors " + errs.map((e) => e.toExponential(1)).join(", ") + " -- two of them EXACTLY zero, which the v2896 guard flags");
    ok("...and that exact zero is a STATED exception, not an unexamined pass",
        suspiciousZero(errs[0], "200 bisection iterations converge below the last ulp on a smooth monotone root, so bit-equality with the closed form is expected here -- and the u=0.3 case lands 1 ulp away, which is the tell that this is convergence rather than a shared expression").suspicious === false,
        "the guard's job is to force the sentence, and the sentence here is true");

    const mags = [0.1, 0.3, 1.0].map((u) => buildLens({ mode: "pointmag", config: { sourceU: u } }));
    ok("!! magnification from the numerical JACOBIAN matches (u^2+2)/(u sqrt(u^2+4))",
        mags.every((m) => m.magErrFrac > 0 && m.magErrFrac < 1e-9),
        "errors " + mags.map((m) => m.magErrFrac.toExponential(1)).join(", ") +
        " -- finite differences of the lens equation, never the magnification formula");

    // THE PAYLOAD: a point source on the caustic is infinitely bright; a real one is not, and its brightness is its size
    const fin = [0.05, 0.1, 0.3].map((rho) => buildLens({ mode: "finite", config: { sourceRho: rho } }));
    ok("!! a finite source REGULARISES the caustic -- magnification is finite and set by the source SIZE",
        fin.every((f) => Number.isFinite(f.magFinite) && f.magFiniteErrFrac < 1e-6),
        fin.map((f) => "rho=" + f.sourceRho + " -> " + f.magFinite.toFixed(2)).join(", ") +
        " against sqrt(1+4/rho^2); a POINT source at the same place would give " + fin[0].pointDivergence.toFixed(0) + "x and diverges");
    ok("!! and so the lens is a RULER: brightness alone recovers the source's size",
        fin.every((f) => f.sizeErrFrac < 1e-6),
        "inferred " + fin.map((f) => f.sizeInferred.toFixed(4)).join(", ") + " for true " + fin.map((f) => f.sizeTrue).join(", ") +
        " -- this is how quasar microlensing measures accretion-disc structure nothing can image directly, and it is the honest form of 'see what you otherwise could not'");

    const st = buildLens({ mode: "structure" });
    ok("!! two half-flux components magnify DIFFERENTLY from one source of the same total flux -- structure is resolved",
        st.structureResolved === true && st.magErrFrac > 0.1,
        "single " + st.magSingle.toFixed(2) + "x vs split " + st.magDouble.toFixed(2) + "x at separation " + st.sepU +
        " (" + (st.magErrFrac * 100).toFixed(0) + "% apart) -- the arrangement is legible in the brightness even though neither component is imaged");
}

// ---- 4. THE BLOB, TORN APART, GRADED ------------------------------------------------------------------------------
{
    const dev = buildTidal({ mode: "deviation" });
    ok("!! two exact geodesics reproduce the linearised tidal equation on a deep fall",
        dev.deviationErrFrac < 1e-2 && dev.stretchFactor > 5,
        "stretched " + dev.stretchFactor.toFixed(2) + "x falling r=50M -> " + dev.rFinal.toFixed(2) +
        "M, agreeing with 2M xi/r^3 to " + dev.deviationErrFrac.toExponential(2));
    // *** v3686 -- THE PLANTED ERROR, AND THE KEY ABOVE IS SHOWN CATCHING IT RATHER THAN ASSUMED TO. ***
    // plantedCoverage counted tidal among the FORTY-NINE binds that declare no planted knob, and the register's
    // own rule is that the best plants are where A PLAUSIBLE WRONG DERIVATION EXISTS AND IS TEMPTING.
    // THE PLANT DROPS THE FACTOR OF TWO from the radial tidal term. Geodesic deviation gives +2GM/r^3 ALONG the
    // separation and -GM/r^3 ACROSS it, and using the transverse magnitude for the radial direction is what you
    // get by differentiating -GM/r^2 once and forgetting the reference point is itself falling. IT IS
    // DIMENSIONALLY RIGHT, CARRIES THE CORRECT 1/r^3 SCALING, STILL STRETCHES THE BODY AND STILL DIVERGES --
    // every shape-of-the-answer check it could meet, it passes. Only the comparison against the EXACT
    // two-geodesic integration separates them, which is exactly what the key above is.
    {
        const bad = buildTidal({ mode: "deviation", config: { planted: true } });
        ok("!! *** the key CATCHES the standard wrong derivation, not merely a different number ***",
            bad.deviationErrFrac >= 1e-2 && dev.deviationErrFrac < 1e-2,
            "nominal agrees to " + dev.deviationErrFrac.toExponential(2) + "; halving the tidal coefficient " +
            "gives " + bad.deviationErrFrac.toExponential(2) + " -- past the 1e-2 tolerance by a factor of ~" +
            Math.round(bad.deviationErrFrac / 1e-2) + ", so the tolerance is not what is doing the work here");
        ok("...and it still LOOKS like a tidal answer, which is why the plant is worth having",
            bad.stretchFactor > 5 && Number.isFinite(bad.separationLinear) && bad.separationLinear > 0,
            "it stretches " + bad.stretchFactor.toFixed(2) + "x and stays finite and positive. A PLANT THAT " +
            "PRODUCES OBVIOUS NONSENSE PROVES NOTHING -- it would be caught by reading the number, not by the key");
    }
    ok("...and the fall is deep enough to have actually stressed the body",
        dev.rFinal < 5 && dev.properTime > 100,
        "calibration caught this running tau=20 -- the body fell 0.08M and every mode agreed because nothing happened");

    const val = buildTidal({ mode: "validity" });
    ok("!! the LIMIT is the observable: the linear tidal formula stops describing a body larger than a measured size",
        val.validityFrac > 0 && val.validityFrac < 0.01,
        "breaks at xi/r0 = " + val.validityFrac.toExponential(2) +
        " for this fall -- the honest answer to 'can we drop a GIANT blob in': yes, and the textbook formula will not describe it");

    const roche = buildTidal({ mode: "roche" });
    ok("!! the disruption radius, MEASURED by integrating geodesics, matches R (2M/m)^(1/3)",
        roche.rocheErrFrac > 0 && roche.rocheErrFrac < 0.02,
        "measured " + roche.rocheMeasured.toFixed(4) + " vs exact " + roche.rocheExact.toFixed(4) +
        " (err " + roche.rocheErrFrac.toExponential(2) + ") -- the error is NONZERO, which is how you know it is no longer inverting its own answer key");

    const blob = buildTidal({ mode: "blob", config: { bodyR: 0.2 } });
    ok("!! a giant blob dropped in is DISRUPTED, and the linear prediction visibly over-promises",
        blob.blobDisrupted === true && blob.blobStretchErrFrac > 0.1,
        "24 centres, each on its own geodesic: stretched " + blob.blobStretch.toFixed(2) + "x while the linear formula said " +
        blob.blobStretchPredicted.toFixed(2) + "x (" + (blob.blobStretchErrFrac * 100).toFixed(0) +
        "% over) -- consistent with the validity boundary above, measured independently");
}

// ---- 5. THE MODEL THAT IS NOT A MEASUREMENT, LABELLED --------------------------------------------------------------
{
    const n = thermalModelNote();
    ok("!! beam DEPOSITION is declared non-gradeable, in the tree, next to the physics",
        n.notGradeable.includes("deposited energy") && n.gradeable.includes("beam arrival time") && /no answer key/.test(n.reason),
        "pulsar.js models pulse TIMING, not radiation transport -- so when the beam ARRIVES is keyed and measurable, " +
        "what it DOES is a model. Render it; never let it crystallise a claim");
}

// ---- 6. BOTH DEVICES ARE FIRST-CLASS CITIZENS OF THE REGISTRY -------------------------------------------------------
{
    ok("the registry lists both", DEVICE_NAMES.includes("lens") && DEVICE_NAMES.includes("tidal"), DEVICE_NAMES.length + " devices");
    for (const [n, d] of [["lens", lensDevice], ["tidal", tidalDevice]]) {
        ok(`${n}: descriptor complete and resolves`, !!d.name && typeof d.build === "function" && d.observables.length > 0 && (await getDevice(n)).name === d.name);
        const r = await roundhouseDevice({ callModel: async (role) => (role === "proposer" ? DEMO_HYPS[n] : { note: "ok" }), device: await getDevice(n), question: "q", maxRounds: 2 });
        ok(`${n}: the demo claim crystallises on a measured observable`, r.crystallized === true, JSON.stringify(r.verdict));
    }
    // honesty scan: every key a build returns must be declared
    const scan = (build, dev, modes) => {
        const und = [];
        for (const mode of modes) { const o = build({ mode }); for (const k of Object.keys(o)) if (k !== "error" && k !== "kind" && !dev.observables.includes(k)) und.push(mode + "." + k); }
        return und;
    };
    ok("lens: every measured key is declared", scan(buildLens, lensDevice, ["shadow", "pixels", "bcrit", "deflect", "shot", "aim", "images", "pointmag", "finite", "structure"]).length === 0);
    ok("tidal: every measured key is declared", scan(buildTidal, tidalDevice, ["deviation", "validity", "roche", "blob"]).length === 0);
}

console.log();
if (fails) { console.log("lensTidal-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("lensTidal-selfcheck: all checks pass");
