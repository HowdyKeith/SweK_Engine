// WebGLEngine/tools/ship/labDevices-selfcheck.mjs -- v2814
//
// Run: node tools/ship/labDevices-selfcheck.mjs   (~254s -- MEASURED; it runs the real instruments)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the three lab instruments wired in as roundhouse devices: optics, kerr, ct.
//
// WHY THEY WERE THE RIGHT ONES TO WIRE: a roundhouse device needs observables a simulation can MEASURE and a
// claim can be refused against. The graded lab instruments already had exactly that -- an answer key each -- so
// wiring them adds no new physics and no new trust, only reach. What this gate holds them to is that the numbers
// coming out of the DEVICE are the same numbers the INSTRUMENT's own gate already pins, and that a claim the
// instrument refuses does not crystallise.

import { buildOptics, opticsDevice } from "../roundhouse/opticsBind.mjs";
import { buildKerr, kerrDevice } from "../roundhouse/kerrBind.mjs";
import { buildCT, ctDevice } from "../roundhouse/tomographyBind.mjs";
import { buildInterferometer, interferometerDevice } from "../roundhouse/interferometerBind.mjs";
import { buildFluid, fluidDevice } from "../roundhouse/fluidBind.mjs";
import { buildThermal, thermalDevice } from "../roundhouse/thermalBind.mjs";
import { buildPipe, pipeDevice } from "../roundhouse/pipe3dBind.mjs";
import { buildGeometry, geometryDevice } from "../roundhouse/geometryBind.mjs";
import { buildKH, khDevice } from "../roundhouse/khBind.mjs";
import { buildBorn, bornDevice } from "../roundhouse/bornBind.mjs";
import { buildFlip2D, flip2dDevice } from "../roundhouse/flip2dBind.mjs";
import { buildFreeSurface, freeSurfaceDevice } from "../roundhouse/freeSurfaceBind.mjs";
import { buildFlip3D, flip3dDevice } from "../roundhouse/flip3dBind.mjs";
import { buildKerrLadder, kerrLadderDevice } from "../roundhouse/kerrLadderBind.mjs";
import { buildInduction, inductionDevice } from "../roundhouse/inductionBind.mjs";
import { buildMG3D, multigrid3dDevice } from "../roundhouse/multigrid3dBind.mjs";
import { buildMGGPU, multigridGPUDevice } from "../roundhouse/multigridGPUBind.mjs";
import { buildIsing, isingDevice } from "../roundhouse/isingBind.mjs";
import { buildKepler, keplerDevice } from "../roundhouse/keplerBind.mjs";
import { buildQuantum, quantumDevice } from "../roundhouse/quantumBind.mjs";
import { buildChaos, chaosDevice } from "../roundhouse/chaosBind.mjs";
import { buildSplat, splatDevice } from "../roundhouse/splatBind.mjs";           // v2889 gate coverage
import { buildDiscovery, discoveryDevice } from "../roundhouse/discoveryBind.mjs";
import { buildProbe, probeDevice } from "../roundhouse/probeBind.mjs";
import { getDevice, DEVICE_NAMES } from "../roundhouse/devices.mjs";
import { DEMO_HYPS } from "../roundhouse/run-device.mjs";
import { roundhouseDevice } from "../roundhouse/deviceBind.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// 1. REGISTERED and shaped like devices
{
    for (const n of ["optics", "kerr", "ct", "interferometer", "windtunnel", "thermal", "pipe3d", "geometry", "kh", "born", "ising", "kepler", "quantum", "chaos", "splat", "discovery", "probe"]) ok(`registry lists '${n}'`, DEVICE_NAMES.includes(n));
    // A HARDCODED COUNT IS THE POINT, not laziness: it fails the moment a device is added or dropped, which
    // forces whoever did it to come here and give the new device coverage. It caught v2894's two additions
    // immediately, which is exactly the service it exists to perform.
    // v2999 -- the number is READ FROM THE REGISTRY, not asserted against a literal. A hard-coded count goes red
    // the moment a device is added and reads as a BROKEN REGISTRY rather than a stale number -- which is exactly
    // how it presented on Keith's rig run. What is worth ratcheting is that the registry never SHRINKS silently.
    ok("the registry has not shrunk", DEVICE_NAMES.length >= 27, DEVICE_NAMES.length + " devices: " + DEVICE_NAMES.join(","));
    for (const [n, d] of [["optics", opticsDevice], ["kerr", kerrDevice], ["ct", ctDevice], ["interferometer", interferometerDevice], ["windtunnel", fluidDevice], ["thermal", thermalDevice], ["pipe3d", pipeDevice], ["geometry", geometryDevice], ["kh", khDevice], ["born", bornDevice], ["ising", isingDevice], ["kepler", keplerDevice], ["quantum", quantumDevice], ["chaos", chaosDevice], ["splat", splatDevice], ["discovery", discoveryDevice], ["probe", probeDevice]]) {
        ok(`${n}: device descriptor complete`, !!d.name && typeof d.build === "function" && typeof d.defaults === "function" && Array.isArray(d.observables) && d.observables.length > 0);
        ok(`${n}: resolves through getDevice`, (await getDevice(n)).name === d.name);
    }
    ok("kerr is DISTINCT from the Paczynski-Wiita black hole device", (await getDevice("kerr")).name !== (await getDevice("blackhole")).name);
}

// 2. OPTICS measures what the instrument's own gate pins
{
    const airy = await buildOptics({ mode: "airy" });
    ok("optics/airy: measures the Rayleigh factor ~1.22 (nobody fed it in)", Math.abs(airy.rayleighFactor - 1.22) / 1.22 < 0.01, "measured " + airy.rayleighFactor.toFixed(5));
    const slit = await buildOptics({ mode: "slit" });
    ok("optics/slit: numeric matches the analytic sinc^2", slit.slitRms < 1e-3, "rms " + slit.slitRms.toExponential(2));
    ok("optics/slit: first minimum lands at lambda/a (factor ~1)", Math.abs(slit.slitFirstMinFactor - 1) < 0.02, slit.slitFirstMinFactor.toFixed(5));
    const edge = await buildOptics({ mode: "edge" });
    ok("optics/edge: shadow-boundary intensity is EXACTLY 1/4", Math.abs(edge.edgeShadowIntensity - 0.25) < 1e-12, edge.edgeShadowIntensity.toFixed(12));
    ok("optics/edge: first fringe 1.3704 at v~1.2172", Math.abs(edge.edgeFirstFringe - 1.3704) < 0.002 && Math.abs(edge.edgeFirstFringeV - 1.2172) < 0.01);
    // the cross-instrument behaviour, as a device observable
    const far = await buildOptics({ mode: "converge", config: { z: 2000 } });
    const near = await buildOptics({ mode: "converge", config: { z: 20 } });
    ok("optics/converge: near-field agrees with far-field at small Fresnel number", far.nearFarRms < 1e-3, `F=${far.fresnelNumber.toFixed(3)} rms=${far.nearFarRms.toExponential(2)}`);
    ok("optics/converge: and DISAGREES at F~1, where only Fresnel is valid", near.nearFarRms > 10 * far.nearFarRms, `F=${near.fresnelNumber.toFixed(3)} rms=${near.nearFarRms.toExponential(2)}`);
}

// 3. KERR reproduces the exact geometry, including the limit against the other module
{
    const lim = await buildKerr({ mode: "limit" });
    ok("kerr/limit: at a=0 it IS the Schwarzschild module (horizon)", lim.schwarzHorizonErr < 1e-12);
    ok("kerr/limit: ...and the photon sphere", lim.schwarzPhotonErr < 1e-12);
    ok("kerr/limit: ...and the shadow edge", lim.schwarzShadowErr < 1e-12, "err " + lim.schwarzShadowErr);
    ok("kerr/limit: no frame dragging when not spinning", lim.dragAt5 === 0);
    const ex = await buildKerr({ mode: "extremal" });
    ok("kerr/extremal: horizon M, photon M and 4M, ISCO M and 9M",
        Math.abs(ex.outerHorizon - 1) < 1e-9 && Math.abs(ex.photonPrograde - 1) < 1e-9 && Math.abs(ex.photonRetrograde - 4) < 1e-9 &&
        Math.abs(ex.iscoPrograde - 1) < 1e-6 && Math.abs(ex.iscoRetrograde - 9) < 1e-6);
    let invOK = true;
    for (const a of [0, 0.3, 0.7, 0.95, 1]) {
        const s = await buildKerr({ mode: "spin", config: { a } });
        if (s.horizonProductErr > 1e-12 || s.horizonSumErr > 1e-12 || Math.abs(s.ergoEquator - 2) > 1e-12) invOK = false;
    }
    ok("kerr: invariants hold at EVERY spin (r+r-=a^2, r+ + r- = 2M, ergosphere 2M at the equator)", invOK);
    const spun = await buildKerr({ mode: "spin", config: { a: 0.9 } });
    ok("kerr: spin separates prograde from retrograde", spun.photonPrograde < spun.photonRetrograde - 0.5 && spun.shadowAsymmetry > 0.2);
    ok("kerr: frame dragging falls off with distance", spun.dragFalloffRatio > 1);
    const naked = await buildKerr({ mode: "spin", config: { a: 5, M: 1 } });
    ok("kerr: an over-spun proposal is CLAMPED to |a|<=M rather than returning nonsense", !naked.error && naked.outerHorizon > 0, JSON.stringify(naked.error || naked.outerHorizon));
}

// 4. CT reconstructs our own phantom, and the load-bearing differences are measured
{
    const par = await buildCT({ mode: "parallel" });
    ok("ct/parallel: filtered back-projection recovers the phantom", par.fbpCorr > 0.95, "corr " + par.fbpCorr.toFixed(4));
    ok("ct/parallel: the ramp filter is worth something (rampGain > 0)", par.rampGain > 0.02, "gain " + par.rampGain.toFixed(4));
    const fan = await buildCT({ mode: "fan" });
    ok("ct/fan: fan + rebinning reconstructs well", fan.fanCorr > 0.95, "corr " + fan.fanCorr.toFixed(4));
    ok("ct/fan: rebinning is LOAD-BEARING (large positive gain)", fan.rebinGain > 0.1, "gain " + fan.rebinGain.toFixed(4));
    // a real measured finding, kept because it is true: with very few views the ramp filter HURTS
    const sparse = await buildCT({ mode: "angles", config: { nAngles: 12 } });
    ok("ct: at very few views the ramp gain goes NEGATIVE (streak amplification) -- measured, not assumed", sparse.rampGain < 0, "gain " + sparse.rampGain.toFixed(4));
    ok("ct: a wild angle count is clamped rather than pinning the builder", (await buildCT({ mode: "parallel", config: { nAngles: 99999 } })).nAngles <= 240);
}


// 4b. INTERFEROMETER: recovery from fringes alone, and the unwrap proved load-bearing
{
    const rec = await buildInterferometer({ mode: "recover" });
    ok("interferometer: recovers the known surface to floating-point noise", rec.rmsResidual < 1e-12, "rms " + rec.rmsResidual.toExponential(2));
    ok("interferometer: residual is tiny RELATIVE to the feature recovered", rec.relativeRms < 1e-12, "rel " + rec.relativeRms.toExponential(2));
    const raw = await buildInterferometer({ mode: "nounwrap" });
    ok("interferometer: WITHOUT unwrapping the residual explodes (arctan only returns wrapped phase)", raw.rmsResidual > 0.1, "rms " + raw.rmsResidual.toFixed(4));
    ok("interferometer: unwrapGain measures that as orders of magnitude", rec.unwrapGain > 1e6, rec.unwrapGain.toExponential(2));
    // a MEASURED LIMIT, kept because it is true: at short wavelength the phase wraps too densely to unwrap
    const shortL = await buildInterferometer({ mode: "lambda", config: { lambda: 0.15 } });
    ok("interferometer: at short wavelength it fails EVEN WITH unwrapping (dense wraps) -- measured, not assumed", shortL.rmsResidual > 0.1, "rms " + shortL.rmsResidual.toFixed(4));
}

// 4c. WIND TUNNEL: the DERIVED conservation identity as an observable
{
    const drag = await buildFluid({ mode: "drag" });
    ok("windtunnel: measures a physical drag coefficient", drag.cd > 0.5 && drag.cd < 100, "Cd " + drag.cd.toFixed(3));
    ok("windtunnel: a SYMMETRIC body makes almost no lift", drag.liftToDragRatio < 0.05, "|Cl/Cd| " + drag.liftToDragRatio.toFixed(4));
    ok("windtunnel: mass is conserved (LBM invariant)", drag.massDrift < 1e-4, "drift " + drag.massDrift.toExponential(2));
    ok("windtunnel: the momentum identity is reported as an observable", typeof drag.balanceErr === "number" && drag.balanceErr >= 0);
    // the identity doubles as a convergence diagnostic: a short run must be further from balance than a long one
    const short = await buildFluid({ mode: "balance", config: { steps: 600 } });
    const long = await buildFluid({ mode: "balance", config: { steps: 3500 } });
    ok("windtunnel: imbalance SHRINKS with more steps (usable as a settled-yet check)", long.balanceErr < short.balanceErr, `600 -> ${short.balanceErr.toFixed(3)}, 3500 -> ${long.balanceErr.toFixed(3)}`);
    const wild = await buildFluid({ mode: "drag", config: { tau: 0.1, steps: 600 } });
    ok("windtunnel: an unstable tau is CLAMPED rather than diverging", !wild.error, JSON.stringify(wild.error || "clamped"));
}


// 4d. THERMAL: an emergent constant, and a threshold
{
    // alpha = c_s^2 (tau_g - 1/2) is never written into the collision -- it is MEASURED from how a hot spot
    // spreads, <r^2> = 4 alpha t, with nothing in the measurement consulting tau_g.
    let worst = 0, rows = [];
    for (const tauG of [0.7, 0.9, 1.2]) {
        const o = await buildThermal({ mode: "diffuse", config: { tauG } });
        worst = Math.max(worst, o.alphaErrFrac);
        rows.push(`tauG=${tauG} err=${(o.alphaErrFrac * 100).toFixed(2)}%`);
    }
    ok("thermal: diffusivity EMERGES from the relaxation time across three settings", worst < 0.05, rows.join("  "));
    // the bifurcation: weak buoyancy conducts, strong buoyancy overturns
    const still = await buildThermal({ mode: "convect", config: { nx: 64, ny: 32, gravity: 1e-4, beta: 1, steps: 1500 } });
    const rolling = await buildThermal({ mode: "convect", config: { nx: 64, ny: 32, gravity: 5e-3, beta: 2, steps: 2000 } });
    ok("thermal: below the drive it does NOT convect", still.convecting === false, "peak " + still.peakSpeed.toExponential(2));
    ok("thermal: above it, it DOES -- a threshold the loop can hunt", rolling.convecting === true && rolling.peakSpeed > 100 * still.peakSpeed,
        `${still.peakSpeed.toExponential(2)} -> ${rolling.peakSpeed.toExponential(2)}`);
    ok("thermal: mass conserved through convection", rolling.massDrift < 1e-6);
}

// 4e. 3D PIPE: the solver's first answer key
{
    const p = await buildPipe({ mode: "profile", config: { steps: 1500 } });
    ok("pipe3d: recovers the Hagen-Poiseuille centreline speed", p.centrelineErrFrac < 0.05, "err " + (p.centrelineErrFrac * 100).toFixed(2) + "%");
    ok("pipe3d: recovers the PARABOLOID, not just the peak", p.profileRms < 0.10, "rms " + (p.profileRms * 100).toFixed(2) + "%");
    ok("pipe3d: the profile implies the viscosity tau sets", p.nuErrFrac < 0.05, `implied ${p.nuImplied.toFixed(5)} vs ${p.nuTheory.toFixed(5)}`);
    ok("pipe3d: mass conserved", p.massDrift < 1e-8, p.massDrift.toExponential(2));
    // the residual is a BIAS, not incomplete convergence: halfway bounce-back puts the true wall between the
    // last fluid node and the solid, so the effective radius is not exactly R. Step-independence is the proof.
    const longer = await buildPipe({ mode: "profile", config: { steps: 4000 } });
    ok("pipe3d: the ~3% residual is STEP-INDEPENDENT, so it is wall placement not convergence",
        Math.abs(longer.centrelineErrFrac - p.centrelineErrFrac) < 0.005,
        `1500 -> ${(p.centrelineErrFrac * 100).toFixed(2)}%, 4000 -> ${(longer.centrelineErrFrac * 100).toFixed(2)}%`);
    const ns = await buildPipe({ mode: "noslip", config: { steps: 1200 } });
    ok("pipe3d: NO-SLIP holds -- the wall speed is exactly zero", ns.wallSpeed === 0, String(ns.wallSpeed));
}


// 4f. GEOMETRY: three independent ways for a mesh extractor to be wrong
{
    const s = await buildGeometry({ mode: "sphere" });
    ok("geometry: every vertex sits ON the analytic isosurface", s.surfaceDeviation < 0.05, "worst " + s.surfaceDeviation.toFixed(5));
    ok("geometry: the mesh is WATERTIGHT (every edge shared by exactly two triangles)", s.watertight === true && s.boundaryEdges === 0);
    ok("geometry: enclosed volume matches 4/3 pi R^3", s.volumeErrFrac < 0.03, `${s.volumeMeasured.toFixed(4)} vs ${s.volumeTheory.toFixed(4)}`);
    ok("geometry: it actually produced a mesh", s.triangles > 1000 && s.vertices > 500, `${s.triangles} tris`);
    const c = await buildGeometry({ mode: "converge" });
    ok("geometry: volume error SHRINKS with resolution (discretisation, not a bug)", c.converged === true,
        `${(c.volumeErrCoarse * 100).toFixed(2)}% -> ${(c.volumeErrFine * 100).toFixed(2)}%`);
    const b = await buildGeometry({ mode: "blob" });
    ok("geometry: the metaball field also meshes watertight", b.watertight === true && b.triangles > 100, `${b.triangles} tris`);
    ok("geometry: and it reports NO volume truth rather than inventing one", b.hasVolumeTruth === false && b.volumeMeasured === undefined);
}

// 4g. BORN: the observable is a VALIDITY BOUNDARY, not a value
{
    let worst = 0, rows = [];
    for (const tol of [0.01, 0.05, 0.1]) {
        const o = await buildBorn({ mode: "validity", config: { tol } });
        worst = Math.max(worst, o.phaseLimitErrFrac);
        rows.push(`tol=${tol}: ${o.phaseLimitMeasured.toFixed(4)} vs ${o.phaseLimitTheory.toFixed(4)}`);
    }
    ok("born: the MEASURED validity boundary matches sqrt(2 tol) across tolerances", worst < 0.05, rows.join("  "));
    const sc = await buildBorn({ mode: "scaling" });
    ok("born: the error really is QUADRATIC in phase (exponent ~2)", Math.abs(sc.errorScalingExponent - 2) < 0.05, sc.errorScalingExponent.toFixed(5));
    const e = await buildBorn({ mode: "error" });
    ok("born: at small contrast Born tracks the exact slab closely", e.errFrac < 0.01, "err " + e.errFrac.toExponential(2));
    const big = await buildBorn({ mode: "error", config: { delta: 1.5 } });
    // *** THE PLANT (v3716): n = 1 + delta instead of sqrt(1 + delta), so the Born phase doubles. THE KEY ABOVE
    // WAS WRITTEN YEARS BEFORE ANY PLANT EXISTED AND CATCHES IT QUALITATIVELY: the honest error is
    // |e^{i phi} - (1 + i phi)| ~ phi^2/2 and the planted one is |e^{i phi} - (1 + 2 i phi)| ~ phi. A CHANGED
    // EXPONENT IS A CHANGED KIND OF APPROXIMATION, not a changed number.
    // WHEN THIS GOES RED the fix is to restore the half, NEVER to widen the exponent's tolerance: "first order"
    // IS the claim, and an approximation whose error scales linearly is a different approximation.
    {
        const pSc = await buildBorn({ mode: "scaling", config: { planted: true } });
        const pEr = await buildBorn({ mode: "error", config: { planted: true } });
        const pVa = await buildBorn({ mode: "validity", config: { planted: true } });
        ok("!! born PLANTED: the error stops being quadratic and becomes LINEAR",
            Math.abs(pSc.errorScalingExponent - 1) < 0.05,
            `exponent ${sc.errorScalingExponent.toFixed(4)} -> ${pSc.errorScalingExponent.toFixed(4)} -- the scaling mode's own comment says an approximation whose error scaled linearly would be a different approximation, and here it is`);
        ok("!! born PLANTED: the validity budget collapses and the closed form no longer describes it",
            pVa.phaseLimitErrFrac > 0.5 && pVa.phaseLimitMeasured < 0.1,
            `measured limit ${pVa.phaseLimitMeasured.toFixed(4)} vs theory ${pVa.phaseLimitTheory.toFixed(4)} -- Born stops being usable six times earlier, and ct.js's straightRayValidPhase is downstream of exactly this`);
        ok("!! born PLANTED: the error at the default geometry is thirty-plus times worse",
            pEr.errFrac > 30 * e.errFrac,
            `${e.errFrac.toExponential(3)} -> ${pEr.errFrac.toExponential(3)}`);
        ok("born names what its plant overturns, as data rather than prose",
            bornDevice.planted && bornDevice.planted.observable === "errorScalingExponent" && !!bornDevice.planted.knob);
    }

    ok("born: ...and at large contrast it visibly fails, which is the point", big.errFrac > e.errFrac * 20, `${e.errFrac.toExponential(2)} -> ${big.errFrac.toExponential(2)}`);
}

// 4h. KELVIN-HELMHOLTZ: Michalke's band. Uses the CHEAP mode -- a full sweep is ~22s and the sharp claim
// (unstable inside, stable outside) needs only two runs.
{
    const n = await buildKH({ mode: "neutral" });
    ok("kh: unstable INSIDE Michalke's band and stable outside it", n.neutralRespected === true,
        `kd=${n.kd.toFixed(3)} sigmaNorm=${n.sigmaNorm.toFixed(4)}`);
    ok("kh: the growing wave really grows", n.grew === true && n.sigmaNorm > 0);
    ok("kh: Michalke's constants are carried, not invented", Math.abs(n.michalkePeakKD - 0.4446) < 1e-9);
}


// 4i. ISING: the lab's first phase transition, and its first universal exponent
{
    const o = await buildIsing({ mode: "order", config: { T: 2.0 } });
    ok("ising: Monte Carlo tracks Yang's EXACT magnetisation below T_c", o.magnetisationErrFrac < 0.03,
        `${o.magnetisation.toFixed(4)} vs Yang ${o.yangExact.toFixed(4)}`);
    const g = await buildIsing({ mode: "ground" });
    ok("ising: the ground state is exact -- |M| ~ 1 and E/N ~ -2", g.magnetisation > 0.999 && g.energy < -1.999,
        `|M|=${g.magnetisation.toFixed(5)} E/N=${g.energy.toFixed(5)}`);
    const t = await buildIsing({ mode: "transition" });
    ok("ising: ordered below T_c, disordered above -- a real transition", t.mBelow > 0.85 && t.mAbove < 0.45 && t.orderRatio > 2,
        `${t.mBelow.toFixed(3)} -> ${t.mAbove.toFixed(3)}`);
    const e = await buildIsing({ mode: "exponent" });
    ok("ising: recovers the UNIVERSAL exponent gamma/nu = 7/4 from scaling alone", e.exponentErrFrac < 0.10,
        `measured ${e.exponentMeasured.toFixed(4)} vs ${e.exponentTheory}`);
    ok("ising: susceptibility diverges with lattice size", e.chiMaxLarge > 5 * e.chiMaxSmall,
        `${e.chiMaxSmall.toFixed(1)} -> ${e.chiMaxLarge.toFixed(1)}`);
    ok("ising: Onsager's constant is carried, not invented", Math.abs(e.onsagerTc - 2.269185314213022) < 1e-12);
}


// 4j. KEPLER: the device whose most interesting observable is about the METHOD, not the physics
{
    const k3 = await buildKepler({ mode: "kepler3" });
    ok("kepler: log T vs log a has slope EXACTLY 3/2, measured from perihelion passages", k3.slopeErrFrac < 1e-6,
        `slope ${k3.slopeMeasured.toFixed(12)}`);
    const v = await buildKepler({ mode: "conserve", config: { integrator: "verlet", orbits: 200 } });
    ok("kepler: symplectic energy error is BOUNDED (growth ratio ~1)", Math.abs(v.energyGrowthRatio - 1) < 0.05,
        v.energyGrowthRatio.toFixed(6));
    ok("kepler: ...and it conserves angular momentum to machine precision", v.angularMomentumErr < 1e-12, v.angularMomentumErr.toExponential(2));
    const c = await buildKepler({ mode: "compare", config: { orbits: 200 } });
    ok("kepler: RK4's energy error GROWS while Verlet's does not", c.rk4Growth > 1.5 && Math.abs(c.verletGrowth - 1) < 0.05,
        `verlet ${c.verletGrowth.toFixed(3)} vs rk4 ${c.rk4Growth.toFixed(3)}`);
    ok("kepler: HONEST -- RK4 is still far more accurate at this point in the run", c.rk4FinalErr < c.verletFinalErr,
        `rk4 ${c.rk4FinalErr.toExponential(2)} vs verlet ${c.verletFinalErr.toExponential(2)}`);
    const cl = await buildKepler({ mode: "closure" });
    ok("kepler: a 1/r^2 orbit closes -- precession is ~zero", cl.precessionPerOrbit < 1e-3, cl.precessionPerOrbit.toExponential(2));
    const wild = await buildKepler({ mode: "conserve", config: { e: 5, orbits: 99999 } });
    ok("kepler: an unbound eccentricity and absurd orbit count are CLAMPED", !wild.error && wild.eccentricity < 1 && wild.orbits <= 2000,
        `e=${wild.eccentricity} orbits=${wild.orbits}`);
}


// 4k. QUANTUM: two OPPOSITE exact spectra from one solver
{
    const w = await buildQuantum({ mode: "well" });
    ok("quantum: the well shows the n^2 signature -- E2/E1 = 4 and E3/E1 = 9",
        Math.abs(w.ratio21 - 4) < 0.01 && Math.abs(w.ratio31 - 9) < 0.02, `${w.ratio21.toFixed(5)}, ${w.ratio31.toFixed(5)}`);
    ok("quantum: well gaps WIDEN with n", w.gapWidens === true);
    const o = await buildQuantum({ mode: "osc" });
    ok("quantum: oscillator gaps are IDENTICAL (spread ~0)", o.gapSpread < 1e-3, o.gapSpread.toExponential(2));
    ok("quantum: oscillator gap equals omega and the ground state is omega/2",
        Math.abs(o.gapMean - 1) < 1e-3 && Math.abs(o.groundState - 0.5) < 1e-3, `gap ${o.gapMean.toFixed(6)} ground ${o.groundState.toFixed(6)}`);
    ok("quantum: THE CROSS-CHECK -- one solver, opposite spectra, both exact", w.gapWidens && o.gapSpread < 1e-3 && w.levelErrWorst < 1e-3 && o.levelErrWorst < 1e-3);
    const t = await buildQuantum({ mode: "tunnel", config: { E: 0.5, V0: 1, a: 1 } });
    ok("quantum: tunnelling is nonzero below the barrier top (classically impossible)", t.transmission > 0.1 && t.energyOverBarrier < 1, t.transmission.toFixed(4));
    const n = await buildQuantum({ mode: "norm", config: { steps: 400 } });
    ok("quantum: norm is a RUNNING INVARIANT -- unitary propagator, drift at round-off", n.normDrift < 1e-9, n.normDrift.toExponential(2));
    const wild = await buildQuantum({ mode: "well", config: { N: 99999, count: 99 } });
    ok("quantum: an absurd grid and level count are CLAMPED", wild.gridN <= 2000 && !wild.error, "N=" + wild.gridN);
}


// 4l. CHAOS: a UNIVERSAL constant from one line of arithmetic
{
    const f = await buildChaos({ mode: "fixed", config: { r: 2.5 } });
    ok("chaos: below r=3 the orbit settles on EXACTLY 1 - 1/r", f.fixedPointErr < 1e-9 && f.period === 1, `${f.settled} vs ${f.fixedPointExact}`);
    const d = await buildChaos({ mode: "doubling" });
    ok("chaos: the first doubling is found at r = 3 by bisecting on the MEASURED period", d.firstDoublingErr < 1e-3, d.firstDoubling.toFixed(9));
    ok("chaos: the second at exactly 1 + sqrt(6)", d.secondDoublingErr < 1e-3, d.secondDoubling.toFixed(9));
    const fg = await buildChaos({ mode: "feigenbaum" });
    ok("chaos: MEASURES Feigenbaum's UNIVERSAL delta within 1%", fg.deltaErrFrac < 0.01,
        `${fg.deltaBest.toFixed(6)} vs 4.669201609 (${(fg.deltaErrFrac * 100).toFixed(3)}%)`);
    const l4 = await buildChaos({ mode: "lyapunov", config: { r: 4 } });
    ok("chaos: the Lyapunov exponent at r=4 is EXACTLY ln 2", l4.lyapunovErr < 1e-4 && l4.chaotic === true, l4.lyapunovValue.toFixed(9));
    const l3 = await buildChaos({ mode: "lyapunov", config: { r: 3.83 } });
    ok("chaos: order returns inside the period-3 window (negative lambda, period 3)", l3.chaotic === false && l3.period === 3,
        `lambda ${l3.lyapunovValue.toFixed(4)} period ${l3.period}`);
    // *** THE PLANT (v3717): r(1-x) as the slope instead of r(1-2x). NOT MERELY INACCURATE -- r(1-x) IS
    // x_{i+1}/x_i, so the logs TELESCOPE to (ln x_N - ln x_0)/N and vanish as 1/N. The planted instrument
    // therefore reports ~0 AT EVERY r: the same tidy number for the stable period-2 at 3.2, the period-3 window
    // at 3.83, and full chaos at 4. A BROKEN INSTRUMENT THAT RETURNS A PLAUSIBLE CONSTANT IS HARDER TO NOTICE
    // THAN ONE THAT RETURNS NOISE.
    // WHEN THIS GOES RED the fix is to restore r(1-2x), NEVER to widen lyapunovErr: ln 2 at r=4 is exact.
    {
        const p4 = await buildChaos({ mode: "lyapunov", config: { r: 4, planted: true } });
        const p32 = await buildChaos({ mode: "lyapunov", config: { r: 3.2, planted: true } });
        const p383 = await buildChaos({ mode: "lyapunov", config: { r: 3.83, planted: true } });
        ok("!! chaos PLANTED: the exponent collapses to ~0 at EVERY r, stable and chaotic alike",
            [p4, p32, p383].every((x) => Math.abs(x.lyapunovValue) < 1e-3) && p4.lyapunovErr > 0.5,
            `r=4 ${p4.lyapunovValue.toExponential(2)} (honest ${l4.lyapunovValue.toFixed(6)} = ln 2), ` +
            `r=3.2 ${p32.lyapunovValue.toExponential(2)} (honest -0.916291), r=3.83 ${p383.lyapunovValue.toExponential(2)} (honest -0.369755)`);

        // *** AND THE BOOLEAN IS NOT THE CATCH, WHICH I HAD TO MEASURE TO LEARN. I expected `chaotic` to flip
        // FALSE at r=4; the telescoped residual is a tiny POSITIVE number, so the planted instrument calls r=4
        // chaotic BY ACCIDENT and calls the two STABLE cycles chaotic as well. THE SIGN OF A NUMBER THAT SHOULD
        // BE ZERO IS ARBITRARY, and a boolean latched onto it inherits that. The plant is caught by MAGNITUDE
        // against ln 2, never by the flag -- which is why the check above reads lyapunovValue and lyapunovErr. ***
        ok("!! chaos PLANTED: the `chaotic` flag calls the STABLE cycles chaotic, so the flag is not the catch",
            p32.chaotic === true && p383.chaotic === true,
            "r=3.2 and r=3.83 are a period-2 cycle and the period-3 window -- both read chaotic under the plant, both read stable honestly");

        const pf = await buildChaos({ mode: "feigenbaum", config: { planted: true } });
        ok("!! chaos PLANTED: the modes that never call lyapunov are BIT-IDENTICAL",
            pf.deltaBest === fg.deltaBest, `deltaBest ${fg.deltaBest.toFixed(6)} -- a knob that moved a mode it does not touch would be a leak`);

        ok("chaos names what its plant overturns, as data rather than prose",
            chaosDevice.planted && chaosDevice.planted.observable === "lyapunovErr" && !!chaosDevice.planted.knob);
    }

    const wild = await buildChaos({ mode: "lyapunov", config: { r: 99 } });
    ok("chaos: an r outside [0,4] is CLAMPED rather than escaping the interval", wild.r <= 4 && !wild.error, "r=" + wild.r);
}

// 4j. SPLAT: projection maths graded on closed forms, and order-dependence in the RIGHT places only (v2889 --
// splat/discovery/probe were registered in v2860/v2867/v2875 with the count comment updated but no per-device
// coverage here and no individual selfchecks: the exact gap this gate exists to close)
{
    const integ = await buildSplat({ mode: "integral" });
    ok("splat: the projected Gaussian integrates to its analytic mass", integ.integralErrFrac < 1e-12,
        "errFrac " + integ.integralErrFrac.toExponential(2) + " on a " + integ.gridN + " grid");
    const comp = await buildSplat({ mode: "compose" });
    ok("splat: over-compositing matches the exact alpha closed form", comp.alphaErr === 0, "alphaErr " + comp.alphaErr);
    ok("splat: order matters ONLY across colours -- same-colour swaps are exactly free, cross-colour swaps are not",
        comp.orderDependenceCorrect === true && comp.sameColourOrderDelta === 0 && comp.diffColourOrderDelta > 0,
        "same " + comp.sameColourOrderDelta + ", diff " + comp.diffColourOrderDelta.toFixed(3));
}

// 4k. DISCOVERY: the FINDER is the system under test -- it must find real laws AND refuse noise
{
    const kep = await buildDiscovery({ mode: "kepler" });
    ok("discovery: recovers Kepler's 3/2 exponent to machine precision", kep.foundLaw === true && kep.exponentErr < 1e-12,
        "exponent " + kep.exponent + " (err " + kep.exponentErr.toExponential(2) + ")");
    const no = await buildDiscovery({ mode: "nolaw" });
    ok("discovery: REFUSES to find a law in noise -- the crown-jewel observable", no.refusedCorrectly === true && no.foundLaw === false,
        "verdict '" + no.verdict + "', r2 " + no.r2Val.toFixed(3) + " -- a finder that cannot say no-law is a pattern generator, not an instrument");
    const vv = await buildDiscovery({ mode: "visviva" });
    ok("discovery: recovers vis-viva's 2/r - 1/a with the RIGHT terms and refuses a poor library",
        Math.abs(vv.coeffInvR - 2) < 1e-12 && Math.abs(vv.coeffInvA + 1) < 1e-12 && vv.poorLibraryRefused === true,
        "coeffs " + vv.coeffInvR.toFixed(6) + ", " + vv.coeffInvA.toFixed(6));
}

// 4l. PROBE: a timelike geodesic graded on Schwarzschild closed forms
{
    const prec = await buildProbe({ mode: "precession" });
    ok("probe: measured perihelion precession matches the exact value within 1%", prec.precessionErrFrac < 0.01,
        prec.precessionMeasured.toExponential(3) + " vs exact " + prec.precessionExact.toExponential(3) + " over " + prec.orbits + " orbits");
    const isco = await buildProbe({ mode: "isco" });
    ok("probe: the ISCO sits at exactly 6M with two INDEPENDENT angular-momentum derivations agreeing",
        isco.iscoR === 6 && isco.iscoAgrees === true, "L " + isco.iscoL.toFixed(6) + " both ways");
    const cl = await buildProbe({ mode: "closure" });
    ok("probe: a bound orbit closes on itself to integrator precision", cl.closes === true && cl.closureResidual < 1e-8,
        "residual " + cl.closureResidual.toExponential(2) + " after " + cl.orbits + " orbits");
    const cap = await buildProbe({ mode: "capture" });
    ok("probe: an infalling probe is CAPTURED with finite proper time on its own clock", cap.captured === true && cap.plunges === true && Number.isFinite(cap.properTime),
        "tau " + cap.properTime.toFixed(2) + " -- the log stops where the probe does");
}

// 5. THE DEMOS CRYSTALLISE through the real loop, so the page works with no model
{
    for (const n of ["optics", "kerr", "ct", "interferometer", "windtunnel", "thermal", "pipe3d", "geometry", "kh", "born", "ising", "kepler", "quantum", "chaos", "splat", "discovery", "probe"]) {
        ok(`${n}: has a demo claim`, !!DEMO_HYPS[n]);
        const dev = await getDevice(n);
        const r = await roundhouseDevice({ callModel: async (role) => (role === "proposer" ? DEMO_HYPS[n] : { note: "ok" }), device: dev, question: "q", maxRounds: 2 });
        ok(`${n}: the demo claim crystallises on a MEASURED observable`, r.crystallized === true && r.verdict && r.verdict.measured !== undefined, JSON.stringify(r.verdict));
    }
}

// 6. AND A CLAIM THE INSTRUMENT REFUSES MUST NOT CRYSTALLISE
{
    const dev = await getDevice("ct");
    const r = await roundhouseDevice({
        callModel: async (role) => (role === "proposer" ? { mode: "parallel", claim: { observable: "fbpCorr", min: 1.5 } } : { note: "ok" }),
        device: dev, question: "q", maxRounds: 2,
    });
    ok("an impossible claim (corr >= 1.5) does NOT crystallise", r.crystallized === false);
    ok("...and every round recorded a refusing verdict with the real measurement", r.history.length > 0 && r.history.every((h) => h.verdict.done === false && typeof h.verdict.measured === "number"));
}

// 7. declared observables are honest -- every key a build returns is declared
{
    const checks = [["optics", buildOptics, opticsDevice, ["airy", "slit", "edge", "converge"]],
                    ["kerr", buildKerr, kerrDevice, ["spin", "limit", "extremal"]],
                    ["ct", buildCT, ctDevice, ["parallel", "fan"]],
                    ["interferometer", buildInterferometer, interferometerDevice, ["recover", "nounwrap"]],
                    ["windtunnel", buildFluid, fluidDevice, ["balance", "drag"]],
                    ["thermal", buildThermal, thermalDevice, ["diffuse", "convect"]],
                    ["pipe3d", buildPipe, pipeDevice, ["profile", "noslip"]],
                    ["geometry", buildGeometry, geometryDevice, ["sphere", "converge", "blob"]],
                    ["born", buildBorn, bornDevice, ["validity", "error", "scaling"]],
                    ["ising", buildIsing, isingDevice, ["order", "ground", "transition", "exponent"]],
                    ["kepler", buildKepler, keplerDevice, ["conserve", "kepler3", "closure", "compare"]],
                    ["quantum", buildQuantum, quantumDevice, ["well", "osc", "tunnel", "norm"]],
                    ["chaos", buildChaos, chaosDevice, ["fixed", "doubling", "feigenbaum", "lyapunov"]],
                    ["splat", buildSplat, splatDevice, ["integral", "compose", "perspective", "shear", "precision"]],
                    ["discovery", buildDiscovery, discoveryDevice, ["kepler", "splat", "logistic", "nolaw", "visviva"]],
                    ["probe", buildProbe, probeDevice, ["precession", "isco", "closure", "firstorder", "capture", "findisco", "mission", "pilot"]]];
    for (const [n, build, dev, modes] of checks) {
        let undeclared = [];
        for (const mode of modes) {
            const o = await build({ mode });
            for (const k of Object.keys(o)) if (k !== "error" && !dev.observables.includes(k)) undeclared.push(mode + "." + k);
        }
        ok(`${n}: every measured key is in the declared observable list`, undeclared.length === 0, undeclared.join(","));
    }
}

// ---- *** flip2d: THE HYDROSTATIC KEY (v3718) *** ----------------------------------------------------------------
// The curriculum asked for GRADE fluid/flip2d.mjs. The key had to be one the solver is never told: free-fall
// acceleration is a MIRROR (gravity is applied as v += g*dt) and post-projection divergence is the solver's own
// stopping criterion, so SELF-CONSISTENCY IS NOT CORRECTNESS. What is graded is p = rho*|g|*d at rest -- the
// pressure comes out of the PROJECTION, which is never handed rho or g.
// WHEN THIS GOES RED the fix is in the projection or the boundaries, NEVER a wider slopeErrFrac: rho*g*h is exact.
{
    const r = await buildFlip2D({ mode: "hydrostatic" });
    ok("!! flip2d: the settled pressure column recovers rho*g*h, which the projection was never handed",
        !r.error && r.slopeErrFrac < 1e-3,
        `slope ${r.slopePerCell.toFixed(6)} vs exact ${r.slopeExact.toFixed(6)} (err ${r.slopeErrFrac.toExponential(2)}) over ${r.fluidCellsInColumn} fluid cells`);

    // THE SLOPE ALONE IS NOT THE CLAIM: a least-squares fit through a CURVE also returns a slope, and it can
    // land anywhere. The linearity is what makes the slope mean "hydrostatic" rather than "averaged".
    ok("!! flip2d: ...and the column is LINEAR, which is what makes the slope mean anything",
        r.linearityR2 > 0.9999, `R^2 ${r.linearityR2.toFixed(6)}`);

    ok("!! flip2d: the top fluid cell carries exactly one cell of head",
        Math.abs(r.topCellPressure - r.topCellExact) / r.topCellExact < 1e-3,
        `${r.topCellPressure.toFixed(4)} vs ${r.topCellExact.toFixed(4)}`);

    // *** THE KEY SCALES WITH g, WHICH IS THE PART THAT SEPARATES A DERIVATION FROM A REMEMBERED NUMBER.
    // Halving gravity must halve the slope, and it is compared against THAT RUN'S OWN g*h rather than against
    // a figure typed here (v3712's lesson: never type a reference value a gate compares against). ***
    const half = await buildFlip2D({ mode: "hydrostatic", config: { gravity: -4.905 } });
    ok("!! flip2d: the recovered slope tracks g, so it is a derivation and not a constant",
        !half.error && half.slopeErrFrac < 1e-3 && Math.abs(half.slopePerCell / r.slopePerCell - 0.5) < 1e-3,
        `g halved -> slope ${half.slopePerCell.toFixed(6)} (ratio ${(half.slopePerCell / r.slopePerCell).toFixed(6)} of the full-g run)`);

    // *** v3806 -- THIS ASSERTED `modes.length === 1`, WHICH PINNED THE DEVICE TO HAVING NO PLANT. flip2d was
    // graded and not planted, and the count froze that fact into a check: adding the plant mode turned this
    // line RED FOR THE RIGHT REASON AND THE WRONG MEANING. *** A COUNT IS NOT A CONTRACT -- what the line meant
    // to say is "the modes are DECLARED and the observables COVER what is measured", which is now what it says.
    ok("flip2d: declares its modes and its observables, and every measured key is declared",
        flip2dDevice.modes.length >= 1 && flip2dDevice.modes[0] === "hydrostatic" &&
        Object.keys(r).every((k) => flip2dDevice.observables.includes(k)));
}


// ---- *** multigrid3d: THE WORK DOES NOT SCALE WITH THE PROBLEM (v3723) *** --------------------------------------
// The one property that makes a multigrid a multigrid, and the code is never told it: a single-level smoother
// needs more sweeps as the grid refines because information crosses one cell per sweep, while a V-cycle carries
// the low frequencies on coarse grids. MEASURED: 8x the cells for 1.4x the iterations.
// WHEN THIS GOES RED the fix is in the cycle or the coarsening, NEVER a looser iterRatio: an iteration count
// that grows with the cell count is a smoother wearing a multigrid's name.
{
    const sc = buildMG3D({ mode: "scaling" });
    ok("!! multigrid3d: 8x the cells costs well under 2x the iterations",
        sc.converged && sc.cellRatio >= 8 && sc.iterRatio < 2,
        `${sc.itersSmall} -> ${sc.itersLarge} iterations across ${sc.cellRatio.toFixed(0)}x the cells (ratio ${sc.iterRatio.toFixed(2)}), residual ${sc.residual.toExponential(2)}`);

    ok("!! ...and both solves actually converged, so the flat count is not two failures agreeing",
        sc.converged && sc.residual < 1e-5,
        `a solver that hit its cap at both sizes would ALSO show a flat iteration ratio -- that is why convergence is asserted beside it`);

    // *** THE SECOND KEY IS A REFUSAL, AND IT IS THE SHARPER ONE. Every boundary SOLID makes the discrete
    // Poisson problem ALL-NEUMANN and therefore SINGULAR: solvable only if the right-hand side has ZERO MEAN
    // over the fluid cells. A strictly positive divergence has no solution to converge to. A SOLVER THAT
    // "CONVERGED" HERE WOULD BE THE ALARMING RESULT. (I found this condition by feeding it an incompatible RHS
    // by accident and briefly reading the stall as a solver defect -- it was my problem that was unsolvable.)
    const bad = buildMG3D({ mode: "incompatible" });
    ok("!! multigrid3d: an INCOMPATIBLE right-hand side stalls rather than converging",
        !bad.converged && bad.iters >= 200 && bad.residual > 1,
        `${bad.iters} iterations at the cap, relative residual ${bad.residual.toExponential(2)} -- the all-Neumann system is singular without a zero-mean RHS`);

    ok("multigrid3d: declares its modes and every measured key is declared",
        // v3806 -- was `=== 3`, frozen before v3784 added the `nopreconditioner` plant. A COUNT IS NOT A
        // CONTRACT: the modes are DECLARED and the first one owns the key, which is what this now asserts.
        multigrid3dDevice.modes.length >= 3 && multigrid3dDevice.modes[0] === "scaling" && Object.keys(sc).filter((k) => k !== "kind").every((k) => multigrid3dDevice.observables.includes(k)));
}


// ---- *** multigridgpu: THE DEVICE'S OWN DECLARATIONS (v3724) *** -----------------------------------------------
// THE ANSWER KEY ITSELF LIVES IN fluid/multigridGPU-selfcheck.mjs, BESIDE THE MODULE IT GRADES, and both gates
// call THE SAME buildMGGPU rather than each spelling the arithmetic -- one derivation, two consumers asserting
// different things. What belongs here is what this gate is for: that the registry's device declares its modes,
// declares every key it measures, and DRIVES the module rather than merely importing it (gradedCoverage counts
// an import specifier, so a bind could satisfy the census without executing a line of the module).
{
    const sv = buildMGGPU({ mode: "solve", config: { n: 32 } });
    ok("multigridgpu: the graded module is DRIVEN, not merely imported",
        sv.fieldMax > 1 && sv.wgslGraded === 0,
        `shadowSolve produces a field of max ${sv.fieldMax.toExponential(3)}. wgslGraded is 0 AS DATA: there is no ` +
        `WebGPU here, GpuMultigrid never runs, and a limit that lives only in prose is one nothing can read`);

    const a = buildMGGPU({ mode: "adjoint", config: { n: 32 } });
    const w = buildMGGPU({ mode: "window", config: { n: 32 } });
    const r = buildMGGPU({ mode: "reference", config: { n: 32 } });
    ok("multigridgpu: declares its modes and every measured key is declared",
        multigridGPUDevice.modes.length === 4 &&
        [a, w, r, sv].every((o) => Object.keys(o).filter((k) => k !== "kind").every((k) => multigridGPUDevice.observables.includes(k))));
}

// ---- *** freesurface: THE DEVICE'S OWN DECLARATIONS (v3728) *** ------------------------------------------------
// THE ANSWER KEY ITSELF LIVES IN tools/roundhouse/freeSurfaceBind-selfcheck.mjs, BESIDE THE BIND IT GRADES, and
// both gates call THE SAME buildFreeSurface rather than each spelling the fixture -- one derivation, two
// consumers asserting different things (v3724's split, and the reason the instrument row's `gate` points there:
// deviceInstrumentMap takes a row's gate imports as the modules that row exercises, so pointing it here would
// credit free-surface with every physics module in the roundhouse).
// What belongs here is what this gate is for: that the registry's device declares its modes, declares every key
// it measures, and DRIVES the module rather than merely importing it -- gradedCoverage counts an import
// specifier, so a bind could satisfy the census without executing a line of fluid/freeSurface.mjs.
{
    const r = await buildFreeSurface({ mode: "vessels" });
    ok("freesurface: the graded module is DRIVEN, not merely imported",
        !r.error && r.columns > 1 && Number.isFinite(r.gapEnvelope) && Number.isFinite(r.depthPredicted),
        `surfaceCells returned ${r.columns} columns off ${r.particles} particles and volumeHeight predicted ` +
        `${r.depthPredicted.toFixed(4)} cells of depth -- a bind that only imported the module would report neither`);

    const d = await buildFreeSurface({ mode: "depth" });
    ok("freesurface: declares its modes and every measured key is declared",
        freeSurfaceDevice.modes.length === 2 &&
        [r, d].every((o) => Object.keys(o).every((k) => freeSurfaceDevice.observables.includes(k))));
}

// ---- *** flip3d: THE DEVICE'S OWN DECLARATIONS (v3729) *** -----------------------------------------------------
// THE ANSWER KEYS LIVE IN tools/roundhouse/flip3dBind-selfcheck.mjs, BESIDE THE BIND, with the three-plant
// blindness census that says which key sees which defect. What belongs here is the registry contract.
{
    const r = await buildFlip3D({ mode: "hydrostatic" });
    ok("flip3d: the graded module is DRIVEN, not merely imported",
        !r.error && r.fluidCellsInColumn > 3 && Number.isFinite(r.slopePerCell),
        `a settled 3D pool gives ${r.fluidCellsInColumn} fluid cells in the middle column at ${r.slopePerCell.toFixed(6)} ` +
        `per cell off ${r.particles} particles -- gradedCoverage counts an IMPORT SPECIFIER, so a bind could ` +
        `satisfy the census without executing a line of fluid/flip3d.mjs`);

    const i = await buildFlip3D({ mode: "isotropy" });
    ok("flip3d: declares its modes and every measured key is declared",
        flip3dDevice.modes.length === 3 &&
        [r, i].every((o) => Object.keys(o).every((k) => flip3dDevice.observables.includes(k))));
}

// ---- *** kerrladder: THE DEVICE'S OWN DECLARATIONS (v3730) *** -------------------------------------------------
// THE ANSWER KEYS LIVE IN tools/roundhouse/kerrLadderBind-selfcheck.mjs, BESIDE THE BIND, with the three-plant
// census. What belongs here is the registry contract.
{
    const p = await buildKerrLadder({ mode: "photon" });
    ok("kerrladder: the graded module is DRIVEN, not merely imported",
        !p.error && p.photonRows === 10 && Number.isFinite(p.photonWorstErr),
        `ten spin/sense rows bisected through the shipped kerrCircularL, worst error ` +
        `${p.photonWorstErr.toExponential(3)} -- gradedCoverage counts an IMPORT SPECIFIER, so a bind could ` +
        `satisfy the census without executing a line of physics/blackhole/kerrLadder.mjs`);

    const e = await buildKerrLadder({ mode: "extremal" });
    ok("kerrladder: declares its modes and every measured key is declared",
        // v3806 -- was `=== 3`, frozen before v3763 added the `spinsense` plant. Same defect, THIRD instance
        // in one file: a mode count hardcoded at the moment a device had no plant, going red the day it got one.
        kerrLadderDevice.modes.length >= 3 && kerrLadderDevice.modes[0] === "isco" &&
        [p, e].every((o) => Object.keys(o).every((k) => kerrLadderDevice.observables.includes(k))));
}

// ---- *** induction: THE DEVICE'S OWN DECLARATIONS (v3731) *** --------------------------------------------------
// THE ANSWER KEYS LIVE IN tools/roundhouse/inductionBind-selfcheck.mjs, BESIDE THE BIND, with the plant census.
{
    const f = await buildInduction({ mode: "faraday" });
    ok("induction: the graded module is DRIVEN, not merely imported",
        !f.error && f.loops === 6 && Number.isFinite(f.circulation),
        `six loops integrated through the shipped inducedE, circulation ${f.circulation.toFixed(6)} -- ` +
        `gradedCoverage counts an IMPORT SPECIFIER, so a bind could satisfy the census without executing a ` +
        `line of physics/blobInduction.js`);

    const s = await buildInduction({ mode: "separation" });
    ok("induction: declares its modes and every measured key is declared",
        inductionDevice.modes.length === 3 &&
        [f, s].every((o) => Object.keys(o).every((k) => inductionDevice.observables.includes(k))));
}

console.log("labDevices-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
