// physics/strictGaussian.js
//
// A normal sample that is bit-identical across architectures. The blob thermal coupling needed a Gaussian kick, and
// the textbook Box-Muller draws it as sqrt(-2 ln u) * cos(2 pi v) -- but ln and cos come from the platform math
// library, and those are exactly the transcendentals that disagree between machines, which is why the diffusion scene
// was single-machine only. This builds the Gaussian instead on the strict-libm core that the engine already proves
// bit-identical: a normal sample is z = sqrt(2) * erfinv(2u - 1), the inverse of the normal CDF, and erfinv is found
// by Newton's method on strictErf, whose derivative (2/sqrt(pi)) * strictExp(-t^2) is also strict. Only +,-,*,/,sqrt
// and the strict core -- no ln, no cos -- so every machine draws the same numbers, and the coupling can join the
// fingerprint.
import { strictErf, strictExp } from "../tools/strictExpErf.mjs";

const SQRT_PI = Math.sqrt(Math.PI);
const TWO_OVER_SQRT_PI = 2 / SQRT_PI;
const SQRT2 = Math.sqrt(2);
const NEWTON_ITERS = 12;

// erfinv(y) for y in (-1, 1), by damped Newton on strictErf. The seed is the first two terms of the erfinv series
// (transcendental-free); Newton with the exact strict derivative refines it. Accuracy is bounded by strictErf's own,
// which is ample; the point is that every step is strict, so the result is identical on every machine.
export function erfinvStrict(y) {
    let t = y * (SQRT_PI / 2) + y * y * y * (SQRT_PI * SQRT_PI * SQRT_PI / 24);
    for (let k = 0; k < NEWTON_ITERS; k++) {
        const f = strictErf(t) - y;
        const d = TWO_OVER_SQRT_PI * strictExp(-t * t);
        let step = f / d;
        if (step > 0.5) step = 0.5; else if (step < -0.5) step = -0.5;   // damp near the tails for stability
        t -= step;
    }
    return t;
}

// One standard-normal sample from one uniform in (0,1). u is clamped off the exact endpoints so erfinv stays finite;
// the clamp caps |z| near 4.75 sigma, far past anything Brownian jitter needs.
export function strictGaussian(rnd) {
    let u = rnd();
    if (u < 1e-6) u = 1e-6; else if (u > 1 - 1e-6) u = 1 - 1e-6;
    return SQRT2 * erfinvStrict(2 * u - 1);
}

// Strict Brownian step on a set of centres: each takes a Gaussian kick of size sqrt(2 D dt) per axis, drawn strictly.
export function strictJitterCentres(centres, { D = 0.01141, dt = 1 / 60, rnd }) {
    const sigma = Math.sqrt(2 * D * dt);
    for (const b of centres) {
        b.x += strictGaussian(rnd) * sigma;
        b.y += strictGaussian(rnd) * sigma;
        b.z += strictGaussian(rnd) * sigma;
    }
    return centres;
}
