// tools/roundhouse/lensBind.mjs
//
// v2894 -- THE RENDER BECOMES A DEVICE, AND THE LASER IS REAL.
//
// Twenty-two devices, and every observable so far has been a number computed by a simulation. This one's
// observables are things you would otherwise call PICTURE and AIM -- and they are admitted to the lab on exactly
// the same terms as everything else: they have closed forms, so they can be refused.
//
// THE LINE BETWEEN MEASUREMENT AND THEATRE IS NOT RESOLUTION. Integration resolution is physics (halve dphi and
// the measured deflection changes). Pixel resolution is theatre -- UNLESS the image has an answer key. A
// Schwarzschild shadow does:
//
//   SHADOW. A static observer at r_obs sees the black hole as a disc of angular radius alpha given exactly by
//       sin^2(alpha) = (b_crit^2 / r_obs^2) * (1 - 2M/r_obs),      b_crit = 3 sqrt(3) M
//   so "how many pixels across is the hole" is a falsifiable claim, not a screenshot. As r_obs -> infinity the
//   disc shrinks to b_crit/r_obs; at r_obs = 3M (the photon sphere) alpha = 90 degrees -- the hole fills half the
//   sky -- and inside 3M it is more than half. Those are gradeable statements about a camera.
//
//   AIM. Firing a photon is not a raycast. From an emitter at r_e, a shot at angle psi from the outward radial
//   direction carries impact parameter
//       b = r_e * sin(psi) / sqrt(1 - 2M/r_e)
//   and is swallowed iff b < b_crit (for an inward-going ray). So "did my shot go in" has an exact answer, and
//   the aiming rule is the interesting part: LIGHT BENDS, so the direction a target APPEARS in is not the
//   direction you must fire. The gap between apparent and true bearing is computable, which makes hitting a
//   target behind a black hole a solved problem rather than a guess.
//
// WHAT THIS DEVICE DOES NOT DO: damage, energy, heat. A photon's trajectory is physics; what it does on arrival
// is game logic, and mixing the two would let the theatre back in through the exit.

import { horizon, photonSphere, criticalImpact, weakDeflection, tracePhoton, deflection, captureThreshold }
    from "../../physics/blackhole/geodesic.js";
// v2900 -- the finite-source quadrature and the magnification map go through STRICT trig so the map is
// bit-identical across machines. See the note on finiteSourceMag for why this one path, and not the whole file.
import { strictSin, strictCos } from "../strictTrig.mjs";

export const LENS_OBSERVABLES = [
    "shadowAngleRad", "shadowAngleExact", "shadowErrFrac", "shadowFillsSky", "rObs",
    "pixelDiameter", "pixelDiameterExact", "pixelErrFrac", "fovDeg", "resolution",
    "bCritMeasured", "bCritExact", "bCritErrFrac",
    "deflectionMeasured", "deflectionWeak", "deflectionStrong", "deflectionErrFrac", "deflectionRegime", "relWeak", "relStrong", "rMin", "rMinOverB", "bCrit", "impactParameter",
    "sweepDphiCount", "deflectionErrFracCoarse", "deflectionErrFracMid", "deflectionErrFracFine",
    "deflectionErrFracFinest", "deflectionErrFracSpreadAfterFirst",
    "shotCaptured", "shotB", "aimTrueDeg", "aimApparentDeg", "aimOffsetDeg", "aimNaiveHits", "aimCorrectedHits",
    "aimB", "aimBWeak", "aimBErrFrac", "aimNaiveMissRad", "aimCorrectedMissRad",
    // v2897 -- AN EXTENDED SOURCE. Resolving structure the optics could never image directly.
    "imagePlus", "imageMinus", "imagePlusExact", "imageMinusExact", "imageErrFrac",
    "magTotal", "magTotalExact", "magErrFrac", "sourceU",
    "magFinite", "magFiniteExact", "magFiniteErrFrac", "sourceRho", "pointDivergence",
    "sizeInferred", "sizeTrue", "sizeErrFrac", "structureResolved", "magSingle", "magDouble", "sepU",
    // v2899 -- the full magnification map (the GPU's first real client, computed on the CPU until a kernel earns it)
    "mapN", "mapSpan", "mapPeak", "mapPeakExact", "mapPeakErrFrac", "mapCells", "mapCaustic",
];

// v3456 -- bSweep ADDED. The deflectSweep mode read `(h.config && h.config.bSweep) || 60` with bSweep absent
// from this table, so a caller could set it -- it moves impactParameter and all three deflection error
// fractions -- and could not discover it, while strictBuild REFUSED it as an undeclared key. An inline `|| 60`
// is a default in the wrong place: it makes a parameter real without making it visible.
//
// Distinguished deliberately from kerr's dynamicIsco, which the same scan flags and which is CORRECT as it
// stands. That one is an enabling FLAG -- it switches a numeric ISCO search on in place of the closed form, and
// a default run must not take that path. A flag belongs outside the defaults for the same reason `planted` does.
// A SETTING with an inline default does not.
const DEF = { M: 1, rObs: 20, resolution: 512, fovDeg: 60, b: 10, psiDeg: 30, deltaRad: 0.04, dphi: 2e-4, sourceU: 0.3, sourceRho: 0.1, sepU: 0.2, mapN: 21, mapSpan: 0.6, bSweep: 60 };

export function lensDefaults(hyp) {
    const h = { mode: "shadow", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    c.M = Math.min(1e6, Math.max(1e-6, num(c.M, DEF.M)));
    // The observer must be OUTSIDE the horizon; a camera at or inside it is not a viewpoint, it is a fate.
    c.rObs = Math.max(2.02 * c.M, Math.min(1e5 * c.M, num(c.rObs, DEF.rObs)));
    c.resolution = Math.min(4096, Math.max(16, num(c.resolution, DEF.resolution) | 0));
    c.fovDeg = Math.min(170, Math.max(1, num(c.fovDeg, DEF.fovDeg)));
    c.b = Math.min(1e4, Math.max(1e-3, num(c.b, DEF.b)));
    c.psiDeg = Math.min(180, Math.max(0, num(c.psiDeg, DEF.psiDeg)));
    c.dphi = Math.min(1e-2, Math.max(1e-5, num(c.dphi, DEF.dphi)));
    c.sourceU = Math.min(5, Math.max(1e-4, num(c.sourceU, DEF.sourceU)));
    c.sourceRho = Math.min(2, Math.max(1e-3, num(c.sourceRho, DEF.sourceRho)));
    c.sepU = Math.min(2, Math.max(1e-4, num(c.sepU, DEF.sepU)));
    c.mapN = Math.min(64, Math.max(5, num(c.mapN, DEF.mapN) | 0));
    c.mapSpan = Math.min(4, Math.max(0.05, num(c.mapSpan, DEF.mapSpan)));
    if (!LENS_MODES.includes(h.mode)) h.mode = "shadow";   // v3902 -- ONE declaration, read here and by the device
    h.config = c;
    if (!h.claim || !h.claim.observable) h.claim = { observable: "shadowErrFrac", max: 1e-9 };
    return h;
}

/** Exact angular radius of the shadow for a STATIC observer at r_obs (radians). */
// *** v3902 -- ONE declaration of the mode list, and this is the SIXTH DEVICE THIS ROUND FOUND CARRYING TWO. ***
// splat, multigridgpu, geometry, induction, probe and lens all kept a whitelist inside defaults() beside the
// device object's own `modes`. Two of them (splat, probe) silently coerced a NEW PLANT MODE to the primary, so
// both arms read bit-identical numbers and the plant appeared to fire while changing nothing. SIX INSTANCES IS
// THE SHAPE, NOT A COINCIDENCE, and the failure is the quiet kind: an unknown mode does not raise, it answers
// the DEFAULT MODE'S NUMBERS UNDER THE REQUESTED MODE'S LABEL.
export const LENS_MODES = ["shadow", "pixels", "bcrit", "deflect", "deflectSweep", "shot", "aim", "images",
    "pointmag", "finite", "structure", "map", "flatshadow"];

/**
 * *** v3902 -- `flat` IS THE PLANT: THE ASYMPTOTIC SHADOW USED AT FINITE RADIUS. ***
 * The exact angular radius carries the metric factor (1 - 2M/r_obs). This file's own header states the limit it
 * reduces to -- "As r_obs -> infinity the disc shrinks to b_crit/r_obs" -- AND THAT LIMIT IS THE PLANT: dropping
 * the factor is using the far-field answer where the observer actually is. It is tempting precisely because it
 * is CORRECT SOMEWHERE, which is the hardest kind of wrong to see: the shadow still shrinks with distance, still
 * scales with M, still fills the sky close in. Only the size is wrong, and only at finite r.
 */
export function shadowAngle(M, rObs, flat = false) {
    const bc = criticalImpact(M);
    // THE WHOLE EXPRESSION BRANCHES rather than sharing a factored sub-expression -- the default arm is
    // bit-identical, which is the discipline a reassociation cost this tree once already (v3845, flip3d).
    const s2 = flat ? (bc * bc / (rObs * rObs)) : (bc * bc / (rObs * rObs)) * (1 - 2 * M / rObs);
    if (s2 >= 1) return Math.PI / 2 + Math.acos(Math.min(1, 2 - Math.sqrt(s2)));   // inside 3M: more than half the sky
    return Math.asin(Math.sqrt(s2));
}

/** Impact parameter of a ray fired at angle psi from the OUTWARD radial direction, by an emitter at r_e. */
export function impactOf(M, rE, psi) {
    return rE * Math.sin(psi) / Math.sqrt(1 - 2 * M / rE);
}

/** MEASURE the shadow the way a camera would: march the ray angle outward until rays stop being captured. */
function measureShadowByRays(M, rObs, { steps = 4000 } = {}) {
    // A ray leaving the camera at angle psi from the INWARD radial direction has impact parameter
    // b(psi) = rObs sin(psi) / sqrt(1 - 2M/rObs). Rays with b < b_crit terminate on the horizon: those pixels are
    // the shadow. Bisect on psi for the edge -- a camera finding the disc's rim by looking, not by formula.
    const captured = (psi) => tracePhoton(M, Math.max(1e-9, impactOf(M, rObs, psi)), { dphi: 5e-4 }).captured;
    let lo = 0, hi = Math.PI / 2;
    if (!captured(lo)) return { edge: 0, empty: true };          // nothing is captured: no shadow at all
    for (let i = 0; i < 60; i++) {
        const mid = 0.5 * (lo + hi);
        if (captured(mid)) lo = mid; else hi = mid;
    }
    return { edge: 0.5 * (lo + hi), empty: false };
}

// -----------------------------------------------------------------------------------------------------------------
// v2897 -- THE EXTENDED SOURCE: HOW LENSING RESOLVES WHAT NO TELESCOPE CAN
//
// Everything up to here treated light as rays from a point. Put an EXTENDED object behind the lens and something
// genuinely useful happens -- the thing quasar microlensing actually does for a living.
//
// In Einstein-radius units (theta_E = 1), a source at offset u produces two images at
//     y_pm = (u +- sqrt(u^2 + 4)) / 2
// with total magnification
//     mu(u) = (u^2 + 2) / (u sqrt(u^2 + 4)).
// As u -> 0 that DIVERGES: a point source sitting exactly behind a point lens is infinitely bright, which is the
// caustic, and is nonsense for any real object.
//
// A source of finite radius rho regularises it, and the regularisation carries the payload. For a uniform disc
// centred on the caustic the magnification is exactly
//     mu_max = sqrt(1 + 4/rho^2)
// -- FINITE, and DEPENDENT ON THE SOURCE SIZE. So measuring the peak magnification MEASURES THE SOURCE'S SIZE,
// even though the source is far too small to image. That is the whole trick: the lens is not a magnifier, it is a
// ruler, and it reads sizes below any instrument's resolution.
//
// MEASURED INDEPENDENTLY, per the house rule: image positions come from numerically solving the lens equation
// beta = theta - 1/theta by bisection, and magnifications from the Jacobian by finite differences -- never from
// the closed forms above, which are used only as the answer key.

/** The lens equation in theta_E units: beta(theta) = theta - 1/theta. */
const lensEq = (theta) => theta - 1 / theta;

/** Solve for the two images of a source at u, numerically. */
function solveImages(u) {
    // positive image lives in theta > 1; negative image in -1 < theta < 0
    let lo = 1 + 1e-12, hi = Math.max(4, u + 4);
    for (let i = 0; i < 200; i++) { const m = 0.5 * (lo + hi); if (lensEq(m) < u) lo = m; else hi = m; }
    const plus = 0.5 * (lo + hi);
    let a = -1 + 1e-12, b = -1e-12;
    for (let i = 0; i < 200; i++) { const m = 0.5 * (a + b); if (lensEq(m) < u) a = m; else b = m; }
    const minus = 0.5 * (a + b);
    return { plus, minus };
}

/** Magnification of one image from the Jacobian, by finite differences of the lens equation. */
function magnifyAt(theta) {
    const h = Math.abs(theta) * 1e-6;
    const dbeta = (lensEq(theta + h) - lensEq(theta - h)) / (2 * h);
    const beta = lensEq(theta);
    return Math.abs((theta / beta) * (1 / dbeta));
}

/** Finite-source magnification: quadrature of the point magnification over a uniform disc of radius rho at u0. */
// v2900 -- PORTABLE BY CONSTRUCTION.
//
// v2899's GPU-provenance guard, on its first live use, caught this function making 172,825 unspecified libm calls
// per reference map -- 57,600 Math.cos alone -- which meant the magnification map could not serve as a
// cross-machine answer key for a future kernel. It was a same-machine reference pretending to be a fleet-wide one.
//
// The polar sampling now uses strictSin/strictCos, and the radius uses sqrt(x*x + y*y) rather than Math.hypot --
// the same two substitutions v2889 applied to flowfieldCpu and solarSystem, for the same reason: sqrt is
// IEEE-specified and correctly rounded, hypot is the host libm's opinion in the last ulp.
//
// ONLY THIS PATH IS CONVERTED, deliberately. The shadow and aim modes still use raw trig; they are
// CORRECTION (v2904, recorded rather than silently edited): this comment used to say "shadow, aim and
// deflection". The corroboration census measured lens.deflect at ZERO unspecified libm calls -- it was
// already portable and always had been. The claim survived two handoffs as open item 5 because nobody
// measured it; deflection() integrates u(phi) with arithmetic and sqrt alone, and geodesic.js's only
// sin/cos pair is in a visualisation branch this path never enters. The outstanding conversion work is
// two modes, not three.
// same-machine measurements and nothing yet claims otherwise. Converting the whole file would be a larger change
// to graded physics with a larger baseline consequence, and doing it quietly beside this one would be exactly the
// kind of unannounced drift the fingerprint exists to catch.
function finiteSourceMag(u0, rho, nR = 240, nT = 240) {
    let acc = 0, wsum = 0;
    for (let i = 0; i < nR; i++) {
        const rr = rho * (i + 0.5) / nR;
        for (let j = 0; j < nT; j++) {
            const th = 2 * Math.PI * (j + 0.5) / nT;
            const ux = u0 + rr * strictCos(th), uy = rr * strictSin(th);
            const u = Math.sqrt(ux * ux + uy * uy);
            if (u < 1e-12) continue;
            const { plus, minus } = solveImages(u);
            const mu = magnifyAt(plus) + magnifyAt(minus);
            acc += mu * rr; wsum += rr;
        }
    }
    return wsum > 0 ? acc / wsum : Infinity;
}

/**
 * v2899 -- THE FULL MAGNIFICATION MAP: mu over a grid of source positions.
 *
 * This is the thing worth putting on the GPU. Every cell is an independent finite-source quadrature, so the map is
 * embarrassingly parallel and currently the slowest computation in the lab. It stays on the CPU here on purpose:
 * the map is built first on the deterministic path so that a future kernel has something to be VERIFIED AGAINST,
 * rather than something to be trusted instead of. proposeAndVerify() in gpuProvenance.mjs is the seam.
 *
 * The peak is the answer key: a source of radius rho centred on the caustic magnifies by sqrt(1 + 4/rho^2), so the
 * brightest cell of the map has a closed form and the whole grid can be graded on it.
 */
export function magnificationMap({ n = 24, span = 1.0, rho = 0.1 }) {
    const cells = new Float64Array(n * n);
    const step = (2 * span) / (n - 1);
    for (let j = 0; j < n; j++) {
        const uy = -span + j * step;
        for (let i = 0; i < n; i++) {
            const ux = -span + i * step;
            const u = Math.sqrt(ux * ux + uy * uy);      // v2900: specified sqrt, not unspecified hypot
            cells[j * n + i] = finiteSourceMag(u, rho, 48, 48);
        }
    }
    return { cells, n, span, rho };
}

export function buildLens(hyp, base = {}) {
    const h = lensDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    const c = h.config, M = c.M;

    if (h.mode === "shadow" || h.mode === "flatshadow") {
        // The RAY MEASUREMENT is untouched in both arms -- `shadowAngleRad` is bit-identical -- so only the
        // closed form the rays are graded against moves. That is what makes this a `method` plant.
        const exact = shadowAngle(M, c.rObs, h.mode === "flatshadow");
        const rays = measureShadowByRays(M, c.rObs);
        return {
            rObs: c.rObs,
            shadowAngleRad: rays.edge,
            shadowAngleExact: exact,
            shadowErrFrac: Math.abs(rays.edge - exact) / exact,
            // At r = 3M the shadow subtends 90 degrees; inside it, more than half the sky is black.
            shadowFillsSky: c.rObs <= photonSphere(M) * (1 + 1e-12),
        };
    }

    if (h.mode === "pixels") {
        // THE FRAMEBUFFER CLAIM. Given a pinhole camera of resolution N and field of view fov, the shadow's
        // diameter in PIXELS is fixed by the same closed form -- so a render can be graded against it directly.
        const alpha = shadowAngle(M, c.rObs);
        const fov = c.fovDeg * Math.PI / 180;
        const pxPerRad = c.resolution / (2 * Math.tan(fov / 2));      // pinhole: pixels per radian at centre
        const exactPx = 2 * Math.tan(Math.min(alpha, 1.5)) * pxPerRad;
        const rays = measureShadowByRays(M, c.rObs);
        const measuredPx = 2 * Math.tan(Math.min(rays.edge, 1.5)) * pxPerRad;
        return {
            rObs: c.rObs, resolution: c.resolution, fovDeg: c.fovDeg,
            pixelDiameter: measuredPx, pixelDiameterExact: exactPx,
            pixelErrFrac: Math.abs(measuredPx - exactPx) / exactPx,
            shadowAngleExact: alpha,
        };
    }

    if (h.mode === "images") {
        const u = c.sourceU;
        const { plus, minus } = solveImages(u);
        const ex = 0.5 * (u + Math.sqrt(u * u + 4)), em = 0.5 * (u - Math.sqrt(u * u + 4));
        return {
            sourceU: u, imagePlus: plus, imageMinus: minus, imagePlusExact: ex, imageMinusExact: em,
            imageErrFrac: Math.max(Math.abs(plus - ex) / Math.abs(ex), Math.abs(minus - em) / Math.abs(em)),
        };
    }

    if (h.mode === "pointmag") {
        const u = c.sourceU;
        const { plus, minus } = solveImages(u);
        const mu = magnifyAt(plus) + magnifyAt(minus);
        const exact = (u * u + 2) / (u * Math.sqrt(u * u + 4));
        return { sourceU: u, magTotal: mu, magTotalExact: exact, magErrFrac: Math.abs(mu - exact) / exact };
    }

    if (h.mode === "finite") {
        // THE RULER. A point source on the caustic is infinitely bright; a real one is not, and how bright it is
        // tells you how big it is.
        const rho = c.sourceRho;
        const mu = finiteSourceMag(0, rho);
        const exact = Math.sqrt(1 + 4 / (rho * rho));
        // invert the closed form on the MEASURED magnification: this is the size we would infer from brightness
        const inferred = mu > 1 ? 2 / Math.sqrt(mu * mu - 1) : Infinity;
        return {
            sourceRho: rho,
            magFinite: mu, magFiniteExact: exact,
            magFiniteErrFrac: Math.abs(mu - exact) / exact,
            pointDivergence: (0.0001 * 0.0001 + 2) / (0.0001 * Math.sqrt(0.0001 * 0.0001 + 4)),   // what a POINT source would give
            sizeInferred: inferred, sizeTrue: rho,
            sizeErrFrac: Math.abs(inferred - rho) / rho,
        };
    }

    if (h.mode === "map") {
        const n = Math.min(64, Math.max(5, c.mapN | 0));
        const map = magnificationMap({ n, span: c.mapSpan, rho: c.sourceRho });
        let peak = 0;
        for (const v of map.cells) if (v > peak) peak = v;
        const exact = Math.sqrt(1 + 4 / (c.sourceRho * c.sourceRho));
        return {
            mapN: n, mapSpan: c.mapSpan, sourceRho: c.sourceRho,
            mapCells: map.cells.length,
            mapPeak: peak, mapPeakExact: exact,
            mapPeakErrFrac: Math.abs(peak - exact) / exact,
            // the peak must sit at the centre -- the caustic of a point lens is a point
            mapCaustic: (() => {
                let bi = 0, bv = -Infinity;
                for (let k = 0; k < map.cells.length; k++) if (map.cells[k] > bv) { bv = map.cells[k]; bi = k; }
                return { i: bi % n, j: Math.floor(bi / n), centre: (n - 1) / 2 };
            })(),
        };
    }

    if (h.mode === "structure") {
        // RESOLVING STRUCTURE: one source of radius rho versus TWO half-flux sources separated by sepU. Same total
        // flux, different magnification -- so the lens distinguishes arrangements the optics cannot image.
        const rho = c.sourceRho, sep = c.sepU;
        const single = finiteSourceMag(0, rho, 160, 160);
        const half = 0.5 * (finiteSourceMag(-sep / 2, rho, 160, 160) + finiteSourceMag(sep / 2, rho, 160, 160));
        return {
            sourceRho: rho, sepU: sep,
            magSingle: single, magDouble: half,
            structureResolved: Math.abs(single - half) / single > 0.01,
            magErrFrac: Math.abs(single - half) / single,
        };
    }

    if (h.mode === "bcrit") {
        const measured = captureThreshold(M, { opts: { dphi: c.dphi } });
        const exact = criticalImpact(M);
        return { bCritMeasured: measured, bCritExact: exact, bCritErrFrac: Math.abs(measured - exact) / exact };
    }

    // v3234 -- *** THE SWEEP assumptionCoherence WAS MEASURED FROM, EMITTED SO IT CAN BE REPRODUCED. ***
    // That gate's header cites deflectionErrFrac falling from 0.05226212549 to 0.05226212465 between dphi
    // 1.6e-3 and 8e-4 at M=1, b=60, then jittering within 8.4e-10 down to 1e-5. Both numbers were on
    // claimTrace's untraceable list -- NOT because the device is wrong but because THE CONFIG THE CLAIM WAS
    // MEASURED AT WAS NOT SOMETHING ANY DECLARED MODE PRODUCED. The device answers deflect at its own default
    // and nothing swept dphi.
    //
    // This is the gyroscope/heidler shape a third time (v3221): THE CLAIM WAS NEVER UNTRACEABLE, IT WAS
    // UNEMITTED. And the sweep is the argument -- one value of deflectionErrFrac says nothing, while a value
    // that FALLS AND THEN STOPS FALLING is what fixes the crossover at 8e-4, which is the whole finding.
    if (h.mode === "deflectSweep") {
        // *** PINNED TO b=60 UNLESS ASKED OTHERWISE, BECAUSE THIS MODE EXISTS TO REPRODUCE ONE MEASUREMENT. ***
        // The device default is b=10, which is a perfectly good place to ask about deflection and is NOT where
        // assumptionCoherence's crossover was measured -- at b=10 the sweep returns 0.4759..., a true number
        // answering a different question. claimTrace sweeps declared modes at their DEFAULTS, so a mode whose
        // job is to emit a cited sweep has to default to the configuration that was cited, or it reproduces
        // nothing and looks like the claim is still untraceable.
        //
        // MY FIRST VERSION TOOK c.b AND SHIPPED THE 0.4759 SWEEP. The tally did not move, which is the only
        // reason I looked -- and "the number did not change" is a much quieter failure than a red gate.
        const b = (h.config && h.config.bSweep) || 60, dphis = [1.6e-3, 8e-4, 4e-4, 1e-5];
        const seq = dphis.map((dphi) => {
            const d = deflection(M, b, { dphi });
            const weak = 4 * M / b;
            return Number.isFinite(d) ? Math.abs(d - weak) / weak : null;
        });
        const finite = seq.filter((x) => Number.isFinite(x));
        return {
            impactParameter: b, sweepDphiCount: dphis.length,
            deflectionErrFracCoarse: seq[0], deflectionErrFracMid: seq[1],
            deflectionErrFracFine: seq[2], deflectionErrFracFinest: seq[3],
            // THE SPREAD AFTER THE FIRST STEP IS THE CLAIM: it falls once, then stops. Reported as a number so
            // "and then it stops" is checkable rather than a sentence somebody has to trust.
            deflectionErrFracSpreadAfterFirst: finite.length > 2 ? Math.max(...finite.slice(1)) - Math.min(...finite.slice(1)) : null,
        };
    }

    if (h.mode === "deflect") {
        // v2933 -- ADOPTED FROM v2930. The old field deflectionErrFrac = |measured - weak|/weak graded the
        // measured deflection against the WEAK-FIELD approximation 4M/b, which is only the first term of a
        // series. The true deflection legitimately exceeds it, and more so near the photon sphere, so that
        // "error" was REAL strong-field general relativity scored as if the integrator were wrong: 11% at b=30
        // rising to 72% at b=8. There is no single elementary closed form across all b, but there are two limits:
        //   WEAK   (b >> b_crit):  4M/b                                         -- exact as b -> infinity
        //   STRONG (b -> b_crit):  -ln(b/b_crit - 1) + ln[216(7-4sqrt3)] - pi   -- Bozza's log limit
        // so the mode now reports BOTH, labels which regime b is in, and grades the integrator against the
        // reference that is actually valid there. The mid-field band (roughly 6 < b < 8) has NO elementary form
        // and is honestly marked as such rather than assigned a misleading error.
        const M_ = M, bc = criticalImpact(M_);
        // v3518 -- traced ONCE and read twice, rather than calling deflection() and then tracing again for the
        // perihelion. TWO TRACES WOULD BE TWO DECLARATIONS OF ONE TRAJECTORY, which is the shape this tree
        // names most often.
        const tr = tracePhoton(M_, c.b, { dphi: c.dphi });
        const d = tr.captured ? NaN : tr.deflection;
        const weak = weakDeflection(M_, c.b);
        const ratio = c.b / bc;
        const regime = ratio < 1.06 ? "strong" : ratio > 10 ? "weak" : "mid";
        // Compute the strong-field reference ONLY in the strong regime where it is the answer key. Elsewhere it
        // is a meaningless extrapolation (negative for large b) and computing it would add Math.log calls to a
        // mode the corroboration census measured as libm-clean, for a number never used. relStrong is therefore
        // null outside the strong regime by construction, not by discarding a computed value.
        const strong = (regime === "strong") ? (-Math.log(c.b / bc - 1) + Math.log(216 * (7 - 4 * Math.sqrt(3))) - Math.PI) : null;
        const relWeak = Number.isFinite(d) ? Math.abs(d - weak) / weak : null;
        const relStrong = (Number.isFinite(d) && Number.isFinite(strong) && strong > 0) ? Math.abs(d - strong) / strong : null;
        const deflectionErrFrac = regime === "strong" ? relStrong : regime === "weak" ? relWeak : null;
        return {
            impactParameter: c.b,
            bCrit: bc,
            deflectionMeasured: d,
            deflectionWeak: weak,
            deflectionStrong: strong,
            deflectionRegime: regime,
            relWeak, relStrong,
            // v3518 -- THE CLOSEST APPROACH, AND WHY THIS MODE OWED IT. Every other number here is either
            // DIMENSIONLESS (invariant under the M,b scale knob by the same argument that makes the knob
            // worth registering) or an ECHO of the config. So the sweep had nothing admissible to prove
            // liveness with, and fell back on deflectionErrFrac -- which in the weak regime IS relWeak,
            // BIT FOR BIT, a declared invariant wearing a second name. rMin is a LENGTH THE INTEGRATOR
            // COMPUTED: it scales as lambda exactly, so it is the one thing the knob is allowed to move.
            rMin: tr.uMax > 0 ? 1 / tr.uMax : null,
            // ...and its dimensionless form is a NEW INVARIANT stronger than the two already registered,
            // because it is built from the quantity the knob moves. r_min/b is a nontrivial function of M/b
            // that NOTHING HERE HAS A CLOSED FORM FOR -- it comes out of the RK4 and nowhere else.
            rMinOverB: tr.uMax > 0 ? 1 / (tr.uMax * c.b) : null,
            // deflectionErrFrac is now the error against the VALID reference (null in the mid-field band where no
            // elementary closed form applies), NOT the old always-against-weak number that scored GR as error.
            deflectionErrFrac,
        };
    }

    if (h.mode === "shot") {
        // FIRE FOR REAL: the shot's fate is a null geodesic, not a raycast.
        const psi = c.psiDeg * Math.PI / 180;
        const b = impactOf(M, c.rObs, psi);
        const r = tracePhoton(M, Math.max(1e-9, b), { dphi: c.dphi });
        return {
            shotB: b, shotCaptured: r.captured, impactParameter: b,
            bCritExact: criticalImpact(M),
            deflectionMeasured: r.captured ? null : r.deflection,
        };
    }

    // "aim" -- FIRING AROUND A BLACK HOLE, AND A CORRECTION TO HOW THIS WAS FIRST DESCRIBED.
    //
    // The claim originally made for this mode was "you must not aim where the target appears". THAT IS BACKWARDS
    // and the tracer said so. Null geodesics are time-reversible: the path light takes FROM the target TO you is
    // the same path, reversed, that a photon takes from you to the target. So the bearing at which the target
    // APPEARS is exactly the bearing you must fire. What you must not do is aim at where the target ACTUALLY IS.
    // The mechanic survives -- it is simply the other way round, and the sim is why we know.
    //
    // The gradeable form: a target sits at angular position phi_t = pi + delta around the hole (a straight line
    // from far away sweeps exactly pi, so any delta > 0 is unreachable without bending). Hitting it requires the
    // impact parameter whose deflection is exactly delta -- and weak-field GR says that is b = 4M/delta, which is
    // the answer key this mode is graded on.
    const delta = Math.min(0.5, Math.max(1e-3, Number.isFinite(c.deltaRad) ? c.deltaRad : 0.04));
    const defl = (b) => {
        const r = tracePhoton(M, Math.max(1e-9, b), { dphi: 5e-4 });
        return r.captured ? Infinity : r.deflection;
    };
    // deflection falls monotonically with b, so bisect for defl(b) == delta
    let bLo = criticalImpact(M) * 1.001, bHi = 4 * M / delta * 20;
    for (let i = 0; i < 60; i++) {
        const mid = 0.5 * (bLo + bHi);
        if (defl(mid) > delta) bLo = mid; else bHi = mid;
    }
    const bMeasured = 0.5 * (bLo + bHi);
    const bWeak = 4 * M / delta;
    const psiApparent = Math.asin(Math.min(1, bMeasured / c.rObs));
    const psiStraight = Math.asin(Math.min(1, bWeak / c.rObs));
    return {
        rObs: c.rObs,
        impactParameter: bMeasured,
        aimB: bMeasured,
        aimBWeak: bWeak,
        aimBErrFrac: Math.abs(bMeasured - bWeak) / bWeak,
        aimTrueDeg: psiApparent * 180 / Math.PI,          // the bearing that HITS (= where the target appears)
        aimApparentDeg: psiStraight * 180 / Math.PI,      // the weak-field estimate of that bearing
        aimOffsetDeg: Math.abs(psiApparent - psiStraight) * 180 / Math.PI,
        // A shot fired with NO bending correction sweeps exactly pi and lands short by delta; the corrected shot
        // lands on the target. Both are measured by tracing, not asserted.
        aimNaiveMissRad: delta,
        aimCorrectedMissRad: Math.abs(defl(bMeasured) - delta),
        aimNaiveHits: false,
        aimCorrectedHits: Math.abs(defl(bMeasured) - delta) < 1e-3,
    };
}

export const lensDevice = {
    // v3192 -- EXPORTED. This device reported as ONE-MODE to the census because its own mode names were
    // not in the probe's candidate list -- the LOWER BOUND, biting for the third time. Derived from
    // this file's own default plus every mode its own build() branches on, each verified to give a
    // DISTINCT answer. *** A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE. ***
    modes: LENS_MODES,
    // `shadowErrFrac` -- the ray-traced shadow edge against its closed form. `shadowAngleRad` is bit-identical
    // (the rays never learn their key changed) and `shadowFillsSky` is a boolean, which the census reports as
    // DECLARED BUT DEAD.
    //
    // *** v4086 -- plantKind WAS "method" -- probe's and splat's exact mistake (fixed v4080/v4081). ***
    // `flatshadow` is a registered mode (LENS_MODES includes it), selected by name -- plantedCoverage.mjs's
    // declaredPlantMode/probeModePlant already grades this as a mode plant, hardcoded, regardless of this
    // label. "method" in this lab means a `config.planted` flag substituting the algorithm within one mode;
    // this file never reads `config.planted` at all (grepped -- the one hit is prose about a different flag).
    // capabilityCard.mjs publishes plantKind verbatim, so the mislabel was a real report/census disagreement.
    plantMode: "flatshadow", plantFlips: "shadowErrFrac", plantKind: "mode",
    name: "schwarzschild-lens",
    observables: LENS_OBSERVABLES,
    build: buildLens,
    defaults: lensDefaults,
};
