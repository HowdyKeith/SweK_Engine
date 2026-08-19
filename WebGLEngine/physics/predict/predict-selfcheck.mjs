// physics/predict/predict-selfcheck.mjs
//
// Run: node physics/predict/predict-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The predictor held to what makes anticipation worth anything: it is scored against the future that actually happens, not
// against itself. A firing lead against a moving threat must HIT -- the shot and the threat arrive together -- while aiming
// at where the threat is now misses, by about the distance it travels in the shot's flight time. A quadratic predictor
// that reads acceleration off three samples must beat a linear one that assumes constant velocity, on a threat that is
// turning. And the intercept must know when it CANNOT catch up -- a threat outrunning the projectile has no solution, and
// the honest answer is to say so, not to fake an aim point. The sabotage forgets to lead -- aims where the threat is now --
// and the hits become misses, which the gate refuses.
import { threatAt, predictLinear, predictQuadratic, leadIntercept, missDistance, _sub, _len } from "./predict.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. LEADING THE TARGET HITS; AIMING AT ITS CURRENT POSITION MISSES ------------------------------
{
    let leadMiss = 0, nowMiss = 0, n = 0;
    for (const [P, V] of [[[0, 0], [2, 0]], [[3, -4], [-1, 2]], [[-5, 2], [1.5, 1]], [[6, 6], [0, -3]]]) {
        const S = [-12, -9], s = 6, sol = leadIntercept(S, P, V, s);
        if (!sol) continue;
        const truePos = [P[0] + V[0] * sol.t, P[1] + V[1] * sol.t];
        leadMiss = Math.max(leadMiss, missDistance(S, sol.aim, s, sol.t, truePos));
        nowMiss = Math.max(nowMiss, missDistance(S, P, s, sol.t, truePos));   // aim where it is NOW
        n++;
    }
    ok("!! leading the threat hits; aiming where it is now misses", n >= 3 && leadMiss < 1e-9 && nowMiss > 1,
       "the lead solution meets the threat to within " + leadMiss.toExponential(1) + " across " + n + " intercepts, while firing at its current position misses by up to " + nowMiss.toFixed(2) + " -- the shot has to be sent where the threat WILL be.");
}

// ---- 2. THE QUADRATIC PREDICTOR BEATS LINEAR ON A MANEUVERING THREAT --------------------------------
{
    const p0 = [0, 0], v0 = [3, 1], acc = [-0.4, 0.6], dt = 0.5;
    let eLin = 0, eQuad = 0, n = 0;
    for (let t = 1; t < 6; t += 0.5) {
        const a = threatAt(t - 2 * dt, p0, v0, acc), b = threatAt(t - dt, p0, v0, acc), c = threatAt(t, p0, v0, acc), tru = threatAt(t + dt, p0, v0, acc);
        eLin += _len(_sub(predictLinear(b, c, dt, dt), tru));
        eQuad += _len(_sub(predictQuadratic(a, b, c, dt, dt), tru));
        n++;
    }
    ok("!! reading acceleration beats assuming constant velocity, on a turning threat", eQuad / n < 1e-9 && eLin / n > 0.05,
       "the quadratic predictor catches the acceleration exactly (avg error " + (eQuad / n).toExponential(1) + ") where the linear one, blind to the turn, is off by " + (eLin / n).toFixed(3) + " a step -- graded against the true future the threat actually reaches.");
}

// ---- 3. THE INTERCEPT KNOWS WHEN IT CANNOT CATCH UP -------------------------------------------------
{
    const S = [0, 0], P = [5, 0], slow = 1;
    const away = leadIntercept(S, P, [3, 0], slow);          // threat at speed 3 outrunning a speed-1 shot, moving away
    const toward = leadIntercept(S, P, [-0.5, 0], 3);        // catchable
    ok("!! an intercept that cannot be made returns no solution rather than a fake aim", away === null && toward !== null && toward.t > 0,
       "a threat outrunning the projectile and moving away gives no solution (correctly null), while a catchable one returns a positive intercept time -- the honest answer when the shot cannot reach.");
}

console.log(fails ? "\npredict-selfcheck: " + fails + " FAILED" : "\npredict-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
