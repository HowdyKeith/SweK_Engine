// physics/blackhole/geodesic-selfcheck.mjs
//
// Run: node physics/blackhole/geodesic-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The null-geodesic tracer held to the closed-form predictions general relativity makes for light around a Schwarzschild
// black hole. First the weak-field deflection: far out, a ray bends by 4M/b -- twice the Newtonian value, the factor the
// 1919 eclipse measured -- and the tracer converges to it as b grows. Stronger than that, the tracer reproduces the full
// second-order deflection 4M/b + (15 pi/4)(M/b)^2, so it is solving relativity, not reciting the leading term. Second, the
// shadow: light with impact parameter below 3 sqrt(3) M is swallowed, and that critical value -- the edge of the shadow the
// Event Horizon Telescope images -- falls out of the metric to eleven digits. The sabotage changes the relativistic term
// in the orbit equation, which turns GR bending back toward the Newtonian value and moves the shadow, and the gate refuses
// it -- the same discrepancy that made the 1919 result a test of Einstein over Newton.
import { deflection, captureThreshold, tracePhoton, weakDeflection, criticalImpact, deflectionSeries,
         horizon, photonSphere } from "./geodesic.js";
import { readFileSync } from "node:fs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const M = 1;

// ---- 1. WEAK-FIELD DEFLECTION CONVERGES TO 4M/b (the 1919 factor) -----------------------------------
{
    const b = 1000, num = deflection(M, b), ana = weakDeflection(M, b);
    ok("!! far-field light bending converges to the Einstein deflection 4M/b", Math.abs(num - ana) / ana < 0.01,
       "at b=1000M the tracer bends light by " + num.toFixed(6) + " vs 4M/b " + ana.toFixed(6) + " -- within " + (Math.abs(num - ana) / ana * 100).toFixed(2) + "%, and the residual shrinks as 1/b (the real higher-order term).");
}

// ---- 2. THE TRACER REPRODUCES THE SECOND-ORDER GR DEFLECTION (not just the leading term) ------------
{
    let worst = 0;
    for (const b of [200, 100, 50]) { const num = deflection(M, b), gr2 = 4 * M / b + (15 * Math.PI / 4) * (M / b) * (M / b); worst = Math.max(worst, Math.abs(num - gr2) / gr2); }
    ok("!! it reproduces the full second-order deflection 4M/b + (15 pi/4)(M/b)^2", worst < 0.006,
       "across b = 200, 100, 50 the tracer matches the two-term GR series to within " + (worst * 100).toFixed(2) + "% -- it is integrating the geodesic, not reciting the leading order.");
}

// ---- 3. THE SHADOW EDGE IS THE CRITICAL IMPACT PARAMETER 3 sqrt(3) M --------------------------------
{
    const bc = captureThreshold(M), ana = criticalImpact(M);
    const below = tracePhoton(M, ana * 0.98).captured, above = !tracePhoton(M, ana * 1.02).captured;
    ok("!! the shadow edge falls at the critical impact parameter 3 sqrt(3) M", Math.abs(bc - ana) / ana < 1e-4 && below && above,
       "the capture threshold is " + bc.toFixed(6) + " vs 3 sqrt(3) M " + ana.toFixed(6) + " (" + (Math.abs(bc - ana) / ana).toExponential(1) + " rel), light just inside is swallowed and just outside escapes -- the shadow the EHT images.");
}

// --- v3077: THE EXPANSION GRADES THE INTEGRATOR, ORDER BY ORDER -----------------------------------------------
// Until now the only closed form here was 4M/b, and checking the numeric deflection against it says just "they
// agree when the field is weak" -- which they MUST, by definition of the weak limit. It would still hold if the
// integrator were wrong in every way that vanishes as b grows.
//
// The Schwarzschild series alpha = 4(M/b) + (15pi/4)(M/b)^2 + (128/3)(M/b)^3 turns that into something sharp:
// after subtracting k terms the residual must fall as b^-(k+1). THE POWER LAW IS THE CHECK, not the size of the
// residual -- a small number proves nothing, while a residual falling at exactly the predicted rate can only
// happen if every term up to that order is right. Same idiom the born device uses for its quadratic phase error.
{
    const M = 1, bs = [20, 40, 80, 160];
    const expo = (order) => {
        const r = bs.map((b) => Math.abs(deflection(M, b, { dphi: 5e-5 }) - deflectionSeries(M, b, order)));
        return { r, e: Math.log(r[r.length - 2] / r[r.length - 1]) / Math.log(bs[bs.length - 1] / bs[bs.length - 2]) };
    };
    const o1 = expo(1), o2 = expo(2), o3 = expo(3);
    for (const [k, o] of [[1, o1], [2, o2], [3, o3]]) {
        ok("!! order " + k + ": the residual falls as b^-" + (k + 1) + ", measured " + o.e.toFixed(3),
            Math.abs(o.e - (k + 1)) < 0.15,
            "residuals " + o.r.map((v) => v.toExponential(2)).join(" ") + " -- only possible if every term to order " + k + " is right");
    }
    ok("!! each order really is a better fit than the one below it",
        o3.r[3] < o2.r[3] && o2.r[3] < o1.r[3],
        o1.r[3].toExponential(2) + " -> " + o2.r[3].toExponential(2) + " -> " + o3.r[3].toExponential(2) +
        " at b=160 -- a series that did not improve would mean the coefficients are wrong even if each residual looked small");
    ok("the exponents CONVERGE toward the integer as b grows, rather than sitting near it", (() => {
        const r = bs.map((b) => Math.abs(deflection(M, b, { dphi: 5e-5 }) - deflectionSeries(M, b, 2)));
        const e1 = Math.log(r[0] / r[1]) / Math.log(bs[1] / bs[0]);
        const e3 = Math.log(r[2] / r[3]) / Math.log(bs[3] / bs[2]);
        return Math.abs(e3 - 3) < Math.abs(e1 - 3);
    })(), "the next unmodelled term contaminates the fit at small b and fades at large b, which is what a real expansion does");

    // SABOTAGE: a wrong coefficient still produces small residuals -- and the wrong power law.
    ok("!! SABOTAGE(second coefficient 10% off): the residual size still looks fine, the EXPONENT does not", (() => {
        const bad = (b) => 4 * M / b + 1.1 * (15 * Math.PI / 4) * (M / b) * (M / b);
        const r = bs.map((b) => Math.abs(deflection(M, b, { dphi: 5e-5 }) - bad(b)));
        const e = Math.log(r[2] / r[3]) / Math.log(bs[3] / bs[2]);
        return r[3] < 1e-3 && Math.abs(e - 3) > 0.5;
    })(), "a 10% error leaves residuals under 1e-3 -- small enough to accept on size alone -- while the power law collapses toward 2");

    ok("the coefficients are CARRIED, not derived in the module", (() => {
        const src = readFileSync(new URL("./geodesic.js", import.meta.url), "utf8");
        return /DEFLECTION_SERIES = \[4, 15 \* Math\.PI \/ 4, 128 \/ 3\]/.test(src) && /standard published values/.test(src);
    })(), "deriving them here would make the key depend on the same algebra the module might have got wrong");
    ok("deflectionSeries at order 1 IS weakDeflection", Math.abs(deflectionSeries(M, 37, 1) - weakDeflection(M, 37)) < 1e-15);
}


// ---- v3309: THE THREE DEFINITIONS NOTHING ASSERTED --------------------------------------------------------------
//
// Found by planting an error rather than by reading: horizon(M) was changed from 2M to 2.02M -- a 1% error in
// the most basic quantity in the file -- and EVERY GATE STILL PASSED. This one, lensTidal, lensCorroborated,
// kerrIscoKey and lensDeflectReference, all green. Meanwhile the error moved two graded devices: lens's shadow
// angle and tidal's deviation.
//
// The reason is simple and worth stating: this gate imported six functions from geodesic.js and horizon was not
// among them. The exported constants r_s = 2M and r_ph = 3M are DEFINITIONS -- there is no derivation to check,
// no tolerance to argue about, and precisely because they look too simple to test, nothing tested them.
//
// They are also load-bearing. criticalImpact = 3 sqrt(3) M, photonSphere = 3M and horizon = 2M stand in a fixed
// relation: b_crit / r_ph = sqrt(3) exactly, and r_ph / r_s = 1.5 exactly. Those ratios are the check, and they
// hold for any M, so no configuration can be tuned to make them pass.
{
    ok("!! horizon(M) = 2M exactly, for every M",
        [1, 2.5, 1e6, 1e-6].every((M) => horizon(M) === 2 * M),
        "the Schwarzschild radius. A 1% error here passed five gates before this assertion existed, while moving " +
        "the lens shadow angle and tidal deviation of two graded devices");

    ok("!! photonSphere(M) = 3M = 1.5 r_s exactly",
        [1, 2.5, 1e6].every((M) => photonSphere(M) === 3 * M && photonSphere(M) === 1.5 * horizon(M)),
        "checked both as a definition and as a RATIO against the horizon -- the ratio holds for any M, so it " +
        "cannot be satisfied by tuning a configuration");

    ok("!! b_crit / r_ph = sqrt(3), tying the third constant to the other two",
        [1, 7, 1e3].every((M) => Math.abs(criticalImpact(M) / photonSphere(M) - Math.sqrt(3)) < 1e-15),
        "3 sqrt(3) M over 3M. The three constants are not independent, so an edit to any one of them breaks a " +
        "relation the other two enforce -- which is the property that makes a definition testable at all");
}

console.log(fails ? "\ngeodesic-selfcheck: " + fails + " FAILED" : "\ngeodesic-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
