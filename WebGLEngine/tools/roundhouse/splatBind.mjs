// tools/roundhouse/splatBind.mjs
//
// v2860 -- roundhouse device TWENTY: 3D GAUSSIAN SPLATTING, graded against closed forms.
//
// WHY IT IS A DEVICE AT ALL. Keith asked whether the splat viewer could come into the physics lab. It cannot --
// every lab page is 2D canvas with no THREE scene, and a splat CAPTURE has no truth we own to grade it against.
// But the splatting MATH does: project a 3D Gaussian through the perspective Jacobian, composite the results in
// depth order, and every step has an exact answer. So the instrument grades the arithmetic, not the picture, and
// owns its truth rather than importing a renderer's.
//
// Modes:
//   "integral"  -- the projected 2D Gaussian integrates to exactly 2*pi*sqrt(det). Rasterise it and compare.
//                  The rasteriser is never told that number, so agreement is a grade rather than a tautology.
//   "perspective" -- projected area falls as 1/z^2. Reports the MEASURED log-log slope against exactly -2.
//   "compose"   -- N splats of equal alpha accumulate to exactly 1-(1-a)^N, and the ORDER DEPENDENCE cuts both
//                  ways: same-colour splats must composite identically in any order, different-colour splats
//                  must not. The second is the load-bearing negative -- a renderer whose depth sort does nothing
//                  passes the first and fails the second.
//   "shear"     -- the sabotage as an observable. Dropping the Jacobian's perspective column is EXACTLY zero on
//                  the view axis and grows off it, so the device reports both and the pair is the finding.
import {
    covarianceFromScaleRot, projectCovariance, eigen2, gaussian2DIntegral, rasteriseIntegral,
    compositeFrontToBack, accumulatedAlpha, areaDepthSlope, areaDepthFit, areaScale, rotZ,
} from "../../physics/splat/gaussianSplat.js";
import {
    freePairs, gradeOrdering, orderByMetric, orderAtPrecision, pairAgreement,
    zDepthMetric, radialMetric,
} from "../../physics/splat/sortPrecision.js";

export const SPLAT_OBSERVABLES = [
    "integralRatio", "integralErrFrac", "gridN",
    "areaSlope", "areaSlopeErr", "areaIntercept", "areaAtUnitDepth",
    "alphaMeasured", "alphaExact", "alphaErr",
    "sameColourOrderDelta", "diffColourOrderDelta", "alphaOrderDelta", "orderDependenceCorrect",
    "onAxisShearDelta", "offAxisShearDelta", "shearGrows",
    "isoRollDeviation", "axisRatio",
    "freePairs16", "freePairs32", "precisionSharper", "mandatoryPairs", "violations", "wrongSortCaught",
    "radialVsZAgreement", "metricsDiffer",
];

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const DEF = { z: 5, f: 800, sigma: 0.1, gridN: 256, alpha: 0.3, count: 7, offAxis: 2.0 };

export function splatDefaults(hyp) {
    const h = { mode: "integral", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    // z must stay in front of the camera or the Jacobian divides by ~0 and every observable is meaningless
    c.z = Math.min(50, Math.max(0.5, num(c.z, DEF.z)));
    c.f = Math.min(4000, Math.max(50, num(c.f, DEF.f)));
    c.sigma = Math.min(1, Math.max(0.005, num(c.sigma, DEF.sigma)));
    c.gridN = Math.min(1024, Math.max(32, num(c.gridN, DEF.gridN) | 0));
    c.alpha = Math.min(0.999, Math.max(0.001, num(c.alpha, DEF.alpha)));
    c.count = Math.min(200, Math.max(1, num(c.count, DEF.count) | 0));
    c.offAxis = Math.min(10, Math.max(0, num(c.offAxis, DEF.offAxis)));
    h.config = c;
    if (!["integral", "perspective", "compose", "shear", "precision"].includes(h.mode)) h.mode = "integral";
    return h;
}

export async function buildSplat(hyp, base = {}) {
    const h = splatDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const iso = covarianceFromScaleRot([c.sigma, c.sigma, c.sigma], { x: 0, y: 0, z: 0, w: 1 });

    if (h.mode === "perspective") {
        // v3516 -- THE INTERCEPT IS REPORTED BESIDE THE SLOPE, AND IT IS NOT DECORATION.
        //
        // The graded claim is the SLOPE: projected area falls as 1/z^2, so areaSlopeErr is the key. sigma and
        // f cannot move it -- they are pure multiplicative scale factors -- which is exactly what makes them a
        // NUISANCE KNOB (nuisanceKnobs.mjs, splat). But runNuisance proves a knob is LIVE from the fields the
        // device REPORTS, and a mode reporting only the slope reports nothing that sigma moves, so a live knob
        // would have come back NOT LIVE -- chaos.x0's recorded shape, where the sweep's correct verdict was
        // that the knob is unreachable through the device interface.
        //
        // areaIntercept is the quantity sigma and f DO move (log-area at unit depth), so the invariance
        // becomes falsifiable: the same sweep that must leave the slope alone must move the intercept.
        // areaAtUnitDepth is its exponential, reported because a log is hard to sanity-check by eye.
        const fit = areaDepthFit([2, 3, 5, 8, 13, 21], { sigma: c.sigma, f: c.f });
        return {
            areaSlope: fit.slope, areaSlopeErr: Math.abs(fit.slope + 2),
            areaIntercept: fit.intercept, areaAtUnitDepth: Math.exp(fit.intercept),
        };
    }

    if (h.mode === "compose") {
        const same = Array.from({ length: c.count }, () => ({ alpha: c.alpha, color: [0.4, 0.6, 0.8] }));
        const sf = compositeFrontToBack(same), sb = compositeFrontToBack([...same].reverse());
        const exact = accumulatedAlpha(c.alpha, c.count);
        const diff = [{ alpha: 0.5, color: [1, 0, 0] }, { alpha: 0.5, color: [0, 0, 1] }];
        const df = compositeFrontToBack(diff), db = compositeFrontToBack([...diff].reverse());
        const sameDelta = Math.abs(sf.color[0] - sb.color[0]);
        const diffDelta = Math.abs(df.color[0] - db.color[0]);
        const alphaDelta = Math.abs(df.alpha - db.alpha);
        return {
            alphaMeasured: sf.alpha, alphaExact: exact, alphaErr: Math.abs(sf.alpha - exact),
            sameColourOrderDelta: sameDelta,
            diffColourOrderDelta: diffDelta,
            alphaOrderDelta: alphaDelta,
            // BOTH halves, as one boolean: same colour must not move, different colour must.
            orderDependenceCorrect: sameDelta < 1e-12 && diffDelta > 1e-6 && alphaDelta < 1e-12,
        };
    }

    if (h.mode === "shear") {
        const AN = covarianceFromScaleRot([0.2, 0.05, 0.05], { x: 0, y: 0, z: 0.3827, w: 0.9239 });
        const rel = (t) => {
            const a = areaScale(projectCovariance(AN, I3, t, c.f));
            const b = areaScale(projectCovariance(AN, I3, t, c.f, { shear: false }));
            return Math.abs(a - b) / a;
        };
        const on = rel([0, 0, c.z]);
        const near = rel([c.offAxis * 0.25, c.offAxis * 0.2, c.z]);
        const off = rel([c.offAxis, c.offAxis * 0.75, c.z]);
        return {
            onAxisShearDelta: on, offAxisShearDelta: off,
            shearGrows: off > near * 2 && on < 1e-12,
        };
    }

    if (h.mode === "precision") {
        // PHASE 4 GROUNDWORK, headless. A GPU sort quantises its metric, so it disagrees with a float64 CPU sort
        // on near-ties BY CONSTRUCTION. The observable is not "do they match" -- it is whether a reduced-precision
        // ordering violates any pair the precision could actually RESOLVE. That is exact, not a tolerance.
        const depths = [5.0, 5.0009, 5.002, 7.5, 7.5001, 12.0];
        const f16 = freePairs(depths, "float16").size, f32 = freePairs(depths, "float32").size;
        const legit = gradeOrdering(orderAtPrecision(depths, "float16", 7), depths, "float16");
        const wrong = gradeOrdering([5, 4, 3, 2, 1, 0], depths, "float16");
        // THE TRAP, reported as a number: Spark 2.0 sorts RADIALLY by default, which is a different quantity.
        const cam = [[0, 0, 10], [6, 6, 7], [0, 0, 9]];
        const agree = pairAgreement(orderByMetric(zDepthMetric(cam)), orderByMetric(radialMetric(cam)));
        return {
            freePairs16: f16, freePairs32: f32, precisionSharper: f32 < f16,
            mandatoryPairs: legit.checkedPairs, violations: legit.violations,
            wrongSortCaught: !wrong.ok,
            radialVsZAgreement: agree, metricsDiffer: agree < 1,
        };
    }

    // "integral" -- the default and the sharpest single number
    const S2 = projectCovariance(iso, I3, [0, 0, c.z], c.f);
    const exact = gaussian2DIntegral(S2);
    if (!(exact > 0)) return { error: "degenerate-projection" };
    const num = rasteriseIntegral(S2, { n: c.gridN, radius: 8 });
    const base2 = projectCovariance(iso, I3, [0, 0, c.z], c.f);
    let roll = 0;
    for (const th of [0.3, 1.1, 2.7]) {
        const S = projectCovariance(iso, rotZ(th), [0, 0, c.z], c.f);
        roll = Math.max(roll, Math.abs(S.xx - base2.xx), Math.abs(S.yy - base2.yy), Math.abs(S.xy - base2.xy));
    }
    const [l1, l2] = eigen2(S2);
    return {
        integralRatio: num / exact,
        integralErrFrac: Math.abs(num / exact - 1),
        gridN: c.gridN,
        isoRollDeviation: roll,
        axisRatio: l1 / l2,
    };
}

export const splatDevice = {
    // v3191 -- EXPORTED so nothing has to GUESS. A probed mode count is a LOWER BOUND: you can only ask
    // about a mode you already thought of, and these names were in nobody's candidate list, so this
    // device reported as having NO DISCOVERABLE MODES. Derived from this file's own default plus every
    // mode its own build() branches on, each verified to produce a DISTINCT answer first.
    modes: ["integral", "compose", "perspective", "precision", "shear"], name: "gaussian-splat-projection", observables: SPLAT_OBSERVABLES, build: buildSplat, defaults: splatDefaults };
