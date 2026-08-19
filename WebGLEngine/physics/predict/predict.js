// physics/predict/predict.js
//
// Anticipating a threat's next move, and scoring the anticipation against what actually happens -- the sim is the ground
// truth, so a prediction is graded against the realized future, not against an opinion. Two things live here. A motion
// predictor: from a few past positions, extrapolate where the threat goes next -- a linear guess assumes it keeps its
// velocity, a quadratic guess catches that it is turning or accelerating. And a firing lead: given the threat's position
// and velocity and a projectile speed, solve WHERE to aim so the shot and the threat arrive at the same place at the same
// time. That lead is a quadratic in the intercept time, so it needs only arithmetic and one square root -- correctly
// rounded, hence bit-identical across architectures, which is why this folds into the fingerprint.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.sqrt(dot(a, a));

// The threat's true trajectory: constant acceleration, p(t) = p0 + v0 t + 1/2 a t^2. Arithmetic -- this is the ground
// truth a predictor is scored against.
export function threatAt(t, p0, v0, acc) { return [p0[0] + v0[0] * t + 0.5 * acc[0] * t * t, p0[1] + v0[1] * t + 0.5 * acc[1] * t * t]; }

// Linear prediction: assume the threat keeps the velocity it just had. Two samples, one step ahead.
export function predictLinear(pPrev, pNow, dtHist, dtAhead) {
    const v = mul(sub(pNow, pPrev), 1 / dtHist);
    return add(pNow, mul(v, dtAhead));
}

// Quadratic prediction: three samples give velocity AND acceleration, so a turning or accelerating threat is caught. The
// velocity is a second-order backward difference (velocity AT the latest sample, not its midpoint), so this is exact for
// constant acceleration.
export function predictQuadratic(p0, p1, p2, dt, dtAhead) {
    const v = mul(sub(add(mul(p2, 3), p0), mul(p1, 4)), 1 / (2 * dt));   // (3 p2 - 4 p1 + p0)/(2 dt) = velocity at p2
    const a = mul(sub(add(p2, p0), mul(p1, 2)), 1 / (dt * dt));          // second difference = acceleration
    return add(add(p2, mul(v, dtAhead)), mul(a, 0.5 * dtAhead * dtAhead));
}

// The firing lead. Shooter at S fires a projectile of speed s; threat at P moving at velocity V. Solve for the intercept
// time t: |P + V t - S| = s t. Squared, that is (V.V - s^2) t^2 + 2 (P-S).V t + |P-S|^2 = 0 -- a quadratic, solved with
// one sqrt. Returns the smallest positive intercept time and the aim point P + V t, or null if the shot cannot catch up.
export function leadIntercept(S, P, V, s) {
    const d = sub(P, S);
    const A = dot(V, V) - s * s, B = 2 * dot(d, V), C = dot(d, d);
    let t = null;
    if (Math.abs(A) < 1e-12) { if (Math.abs(B) > 1e-12) { const tt = -C / B; if (tt > 0) t = tt; } }
    else { const disc = B * B - 4 * A * C; if (disc >= 0) { const sq = Math.sqrt(disc); const t1 = (-B - sq) / (2 * A), t2 = (-B + sq) / (2 * A); for (const tt of [t1, t2].sort((x, y) => x - y)) if (tt > 0 && t === null) t = tt; } }
    if (t === null) return null;
    return { t, aim: add(P, mul(V, t)) };
}

// Fire at an aim point and see how close the projectile passes the threat's ACTUAL future position -- the miss distance.
// A correct lead against a constant-velocity threat gives ~0; aiming at where the threat is NOW misses by roughly V*t.
export function missDistance(S, aim, s, tHit, truePosAtT) {
    const dir = sub(aim, S), L = len(dir) || 1;
    const proj = add(S, mul(mul(dir, 1 / L), s * tHit));      // where the projectile is at tHit
    return len(sub(proj, truePosAtT));
}

export { sub as _sub, add as _add, mul as _mul, len as _len, dot as _dot };
