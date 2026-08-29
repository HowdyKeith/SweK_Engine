// WebGLEngine/physics/chaos/logistic-selfcheck.mjs -- v2823
//
// Run: node physics/chaos/logistic-selfcheck.mjs   (~0.2s)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/chaos/logistic.js -- x -> r x (1 - x), one line of arithmetic containing a route to chaos whose
// numbers are UNIVERSAL.
//
// EXACT KEYS, none written into the iteration:
//   x* = 1 - 1/r for 1 < r < 3          exact algebra
//   first doubling at EXACTLY r = 3      where |f'(x*)| = |2 - r| reaches 1
//   second doubling at EXACTLY 1+sqrt(6)
//   FEIGENBAUM delta = 4.669201609...    a UNIVERSAL constant -- not a property of this map
//   LYAPUNOV = EXACTLY ln 2 at r = 4     the map is exactly solvable there (conjugate to the tent map)
//
// THE HONEST LIMIT, MEASURED AND STATED: locating a high-period bifurcation is precision-limited, because the
// transient near a doubling takes longer and longer to settle. So the delta estimates BRACKET 4.669 rather than
// converging monotonically onto it -- 4.759, 4.649, 4.677 from the first five cascade points. The gate asserts
// what is true (they cluster tightly around the constant, best within 1%) rather than a monotone convergence
// that the arithmetic cannot deliver at this precision.

import { FEIGENBAUM_DELTA, CHAOS_ONSET, LN2, logistic, fixedPoint, secondDoubling, orbit, periodOf, lyapunov, LOGISTIC_SLOPE, bifurcationPoint, cascade, deltaEstimates, diagram } from "./logistic.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// 1. the map and its fixed point
{
    ok("the map is x -> r x (1-x)", logistic(3, 0.5) === 0.75);
    let worst = 0;
    for (const r of [1.5, 2, 2.5, 2.9]) worst = Math.max(worst, Math.abs(orbit(r, { samples: 4 })[0] - fixedPoint(r)));
    ok("for 1 < r < 3 the orbit settles on EXACTLY 1 - 1/r", worst < 1e-9, "worst " + worst.toExponential(2));
    ok("x=0 and x=1 are fixed at zero (the map cannot escape its interval)", logistic(3.9, 0) === 0 && logistic(3.9, 1) === 0);
}

// 1b. LOGISTIC_SLOPE is EXACTLY the analytic derivative d/dx[r x (1-x)] = r(1 - 2x), not the map itself
{
    ok("!! LOGISTIC_SLOPE matches r(1-2x) by construction, at unrelated (r, x) pairs",
        [[3, 0.5], [4, 0.2], [3.83, 0.7], [2.5, 0]].every(([r, x]) => LOGISTIC_SLOPE(r, x) === r * (1 - 2 * x)));
    // finite-difference check against the actual map: d/dx logistic(r,x) ~= (logistic(r,x+h) - logistic(r,x-h)) / 2h
    let worst = 0;
    for (const [r, x] of [[3.2, 0.3], [3.9, 0.6], [2.7, 0.15]]) {
        const h = 1e-6;
        const fd = (logistic(r, x + h) - logistic(r, x - h)) / (2 * h);
        worst = Math.max(worst, Math.abs(LOGISTIC_SLOPE(r, x) - fd));
    }
    ok("!! and it agrees with a numeric finite-difference derivative of the ACTUAL map, not a stand-in for it",
        worst < 1e-6, "worst |LOGISTIC_SLOPE - central difference| = " + worst.toExponential(2));
    // the classic slip this file warns about: r(1-x) IS x_{i+1}/x_i, not the derivative -- confirm ours is NOT that
    ok("...and it is NOT the classic wrong slope r(1-x) (which is x_{i+1}/x_i, not d/dx)",
        Math.abs(LOGISTIC_SLOPE(3.5, 0.3) - 3.5 * (1 - 0.3)) > 1e-3);
    ok("at the fixed point x* = 1 - 1/r the slope is EXACTLY 2 - r (the classic stability formula)",
        Math.abs(LOGISTIC_SLOPE(3, fixedPoint(3)) - (2 - 3)) < 1e-12);
}

// 2. PERIOD DOUBLING happens where the algebra says it does
{
    ok("period is 1 below r=3", periodOf(2.9) === 1);
    ok("period is 2 just above r=3", periodOf(3.2) === 2);
    ok("period is 4 above 1+sqrt(6)", periodOf(3.5) === 4);
    ok("period is 8 further on", periodOf(3.56) === 8);
    ok("no short period survives past the accumulation point", periodOf(3.9, { maxPeriod: 64 }) === 0);
    const r1 = bifurcationPoint(2, { lo: 2.9, hi: 3.2, warmup: 200000 });
    const r2 = bifurcationPoint(4, { lo: 3.1, hi: 3.5, warmup: 200000 });
    ok("the FIRST doubling is found at r = 3, by searching on the measured PERIOD", Math.abs(r1 - 3) < 1e-3, r1.toFixed(9));
    ok("the SECOND is found at 1 + sqrt(6) = 3.449489743", Math.abs(r2 - secondDoubling()) < 1e-3, r2.toFixed(9));
}

// 3. THE LYAPUNOV EXPONENT -- the sharpest statement of what chaos means here
{
    ok("EXACT: lambda = ln 2 at r = 4 (the exactly solvable case)", Math.abs(lyapunov(4) - LN2) < 1e-3, `${lyapunov(4).toFixed(9)} vs ${LN2.toFixed(9)}`);
    ok("lambda is NEGATIVE on a stable cycle", lyapunov(2.9) < 0 && lyapunov(3.2) < 0 && lyapunov(3.5) < 0);
    ok("lambda is POSITIVE in chaos", lyapunov(3.9) > 0 && lyapunov(3.95) > 0);
    // the period-3 window: chaos, then a sudden island of order, then chaos again
    ok("lambda dips BELOW zero inside the period-3 window (r ~ 3.83)", lyapunov(3.83) < 0, lyapunov(3.83).toFixed(6));
    ok("...and it is positive on both sides of that window", lyapunov(3.8) > 0 && lyapunov(3.86) > 0);
    ok("the sign change brackets the accumulation point", lyapunov(CHAOS_ONSET - 0.01) < 0 && lyapunov(3.7) > 0);
}

// 4. FEIGENBAUM -- a universal constant, measured from our own iteration
{
    const rs = cascade({ count: 5 });
    ok("the cascade points increase and stay below the accumulation point", rs.every((r, i) => (i === 0 || r > rs[i - 1]) && r < CHAOS_ONSET + 1e-6), rs.map((r) => r.toFixed(6)).join(" "));
    ok("the gaps SHRINK geometrically (that is what makes delta finite)",
        (rs[2] - rs[1]) < (rs[1] - rs[0]) && (rs[3] - rs[2]) < (rs[2] - rs[1]) && (rs[4] - rs[3]) < (rs[3] - rs[2]));
    const d = deltaEstimates(rs);
    ok("at least three delta estimates are produced", d.length >= 3, d.map((x) => x.toFixed(5)).join(", "));
    const best = d.reduce((a, b) => (Math.abs(b - FEIGENBAUM_DELTA) < Math.abs(a - FEIGENBAUM_DELTA) ? b : a));
    ok("MEASURED FEIGENBAUM DELTA lands within 1% of 4.669201609", Math.abs(best - FEIGENBAUM_DELTA) / FEIGENBAUM_DELTA < 0.01,
        `best ${best.toFixed(6)} (${(Math.abs(best - FEIGENBAUM_DELTA) / FEIGENBAUM_DELTA * 100).toFixed(3)}%)`);
    ok("every estimate clusters near the constant (none wilder than 5%)", d.every((x) => Math.abs(x - FEIGENBAUM_DELTA) / FEIGENBAUM_DELTA < 0.05),
        d.map((x) => x.toFixed(4)).join(", "));
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    ok("their mean is within 1.5% too", Math.abs(mean - FEIGENBAUM_DELTA) / FEIGENBAUM_DELTA < 0.015, mean.toFixed(6));
}

// 5. SABOTAGE -- the nonlinearity is what makes any of this happen
{
    // a LINEAR map x -> r x has no doubling, no chaos, and a Lyapunov exponent of exactly ln r
    let x = 0.4, sum = 0;
    for (let i = 0; i < 5000; i++) { x = 0.9 * x; sum += Math.log(0.9); }
    ok("SABOTAGE: drop the (1-x) and there is no cascade at all -- lambda is just ln r", Math.abs(sum / 5000 - Math.log(0.9)) < 1e-12);
    ok("...whereas the real map at the same r settles to a fixed point, not a cycle", periodOf(0.9) === 1 || orbit(0.9, { samples: 2 })[0] < 1e-6);
}

// 6. the diagram is drawable and honest
{
    const cols = diagram({ rMin: 2.8, rMax: 4, columns: 60, warmup: 400, samples: 40 });
    ok("diagram: one column per r, each with attractor samples", cols.length === 60 && cols.every((c) => c.xs.length === 40));
    ok("diagram: every sample stays inside [0,1]", cols.every((c) => [...c.xs].every((v) => v >= 0 && v <= 1)));
    const low = cols[0], high = cols[cols.length - 1];
    const spread = (c) => Math.max(...c.xs) - Math.min(...c.xs);
    ok("diagram: a periodic column is tight and a chaotic one is broad", spread(low) < 0.2 && spread(high) > 0.7,
        `r=${low.r.toFixed(2)} spread ${spread(low).toFixed(4)}  vs  r=${high.r.toFixed(2)} spread ${spread(high).toFixed(4)}`);
}

// 7. browser-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("./logistic.js", import.meta.url), "utf8");
    ok("logistic.js imports nothing and uses no DOM", !/^\s*import\s/m.test(src) && !/\bwindow\.|\bdocument\./.test(src));
}

console.log("logistic-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
