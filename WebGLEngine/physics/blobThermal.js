// WebGLEngine/physics/blobThermal.js — v2596
//
// THE BLOBARIUM WAS NEVER AT ZERO KELVIN. IT HAS BEEN RUNNING A FEVER THE WHOLE TIME.
//
// Keith: "what if we warmed up the blobarium past kelvin? i would think the blobulator would appreciate that?"
//
// ---- THE THING I NEARLY GOT WRONG, WHICH WOULD HAVE BEEN THE WHOLE ROUND -----------------------------------------
//
// I was about to tell Keith that a Gaussian IS a heat kernel, so warming the blob is free: exp(-d^2/4Dt) just
// grows its width, the family is closed under diffusion, one number per blob and done.
//
// THE BLOB IS NOT A GAUSSIAN. blobPhantom.js:46 --
//
//     const u = 1 - d2 / (b.r * b.r);
//     s += b.a * u * u * u;              and:  if (d2 >= b.r * b.r) continue;
//
// That is a WYVILL POLYNOMIAL WITH COMPACT SUPPORT -- (1 - d^2/r^2)^3, EXACTLY ZERO past r. It is not
// exp(-d^2/r^2) and the difference is the entire question, because A GAUSSIAN FAMILY IS CLOSED UNDER DIFFUSION
// AND A WYVILL FAMILY IS NOT. Diffusing (1-d^2/r^2)^3 does not give you another one with a bigger r. You cannot
// warm this blob by growing r; that is just a bigger blob wearing a thermometer.
//
// (This is also why v2592's blobFieldAt(0.9, 0, 0) was 0.0000 -- COMPACT SUPPORT. The evidence was already on
// the table two rounds ago and I still nearly guessed.)
//
// ---- THE TEMPERATURE NOBODY SET ----------------------------------------------------------------------------------
//
// Numerical diffusion IS the heat equation: d(rho)/dt = D grad^2 rho. The advection scheme has an implicit D
// that nobody chose and nobody wrote down. v2595 measured its EFFECT (50.5% of the peak gone in four seconds)
// without ever naming it. IT IS A TEMPERATURE.
//
// Bake ONE still blob and advect it out-and-back so it never moves. Any spread is heat:
//
//     steps    <r^2>     spread    implied D
//       30     0.1324    0.0342     0.01141
//       60     0.1666    0.0684     0.01141
//       90     0.2008    0.1027     0.01141
//      120     0.2350    0.1369     0.01141
//
// <r^2> grows DEAD LINEAR, which is the definition of diffusion, and D is 0.01141 AT EVERY TIMESTEP TO FIVE
// FIGURES. That is not smearing that resembles heat. THAT IS HEAT, and it is a physical constant of the scheme.
//
// HONEST: the textbook first-order-upwind estimate u*dx/2 = 0.04255 is 3.7x HIGHER than measured.
// Semi-Lagrangian with trilinear interpolation is GENTLER than the napkin says. I am not claiming they match --
// the measurement is the measurement and the formula is a different thing that happens to have the same units.
//
// ---- SO CAN HE BE WARMED ON PURPOSE? ------------------------------------------------------------------------------
//
// Yes, and only one way that does not need a grid: EINSTEIN 1905. A particle at temperature T random-walks with
// <x^2> = 2Dt per axis. Jitter the SEVEN CENTRES and you have a real, chosen, exact temperature that costs
// seven numbers.
//
// At the aquarium's OWN fever (D = 0.01141), the two fates could not be more different:
//
//     THE GRID:    peak only ever falls. 75.3% -> 63.0% -> 55.8% -> 50.5% -> ... NO FLOOR. It goes to zero.
//     THE JITTER:  peak WANDERS. 94.3% -> 101.1% -> 104.1% -> 86.0%. It goes ABOVE where it started, because
//                  the blobs sometimes drift TOGETHER and the overlap builds a taller peak.
//
// THAT IS WHAT A TEMPERATURE ACTUALLY LOOKS LIKE: FLUCTUATION, NOT DECAY. And the jitter has a FLOOR the grid
// does not have -- the peak can never fall below the tallest single blob's own amplitude, because each blob
// keeps its amplitude forever. THERE IS NO GRID TO SMEAR IT.
//
// So: Keith asked if the blobulator would appreciate being warmed. THE WARMTH HE ALREADY HAD WAS DISSOLVING
// HIM. This warmth shakes him and cannot dissolve him. Same D, opposite fate, and the difference is entirely
// WHETHER THE HEAT LANDS ON A GRID OR ON SEVEN NUMBERS.
import { blobFieldAt } from "../simulation/tomo/blobPhantom.js";

/** Seeded, because a temperature you cannot reproduce is a rumour. v2582 paid for this lesson. */
export function lcg(seed = 20260715) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Box-Muller. A random walk needs GAUSSIAN steps or it is not Brownian, it is just noise. */
export function gaussian(rnd) {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Warm the blob. Einstein: <x^2> = 2Dt per axis, so one timestep steps sqrt(2*D*dt).
 *
 * MUTATES the centres, which is the point -- these ARE the bodies (v2595). Nothing else in the universe
 * changes, and blobFieldAt is exact the instant this returns.
 */
// *** v3715 -- THE FACTOR OF TWO IS NAMED BECAUSE DROPPING IT IS THE CLASSIC SLIP. Einstein-Smoluchowski gives
// <x^2> = 2*D*t PER AXIS, so a step of one dt has sigma = sqrt(2*D*dt). Writing sqrt(D*dt) is the single most
// common way to get Brownian motion wrong -- it is dimensionally correct, it looks right, and it silently
// reports HALF the diffusion constant it was given. `axisFactor` exists so the plant is a MODE OF THIS
// FUNCTION rather than a second copy of it that could drift; see blobThermalBind. ***
export const EINSTEIN_AXIS_FACTOR = 2;

export function jitterCentres(blobs, { D = 0.01141, dt = 1 / 60, rnd = lcg(), axisFactor = EINSTEIN_AXIS_FACTOR } = {}) {
    const sigma = Math.sqrt(axisFactor * D * dt);
    for (const b of blobs) {
        b.x += gaussian(rnd) * sigma;
        b.y += gaussian(rnd) * sigma;
        b.z += gaussian(rnd) * sigma;
    }
    return blobs;
}

/**
 * THE FLOOR THE GRID DOES NOT HAVE.
 *
 * However far the centres wander, the field's peak cannot fall below the tallest single blob's amplitude: at
 * that blob's own centre, u = 1, so it contributes exactly `a`. Everything else only adds. THE GRID HAS NO SUCH
 * GUARANTEE -- diffusion is not obliged to leave anything behind.
 */
export const peakFloor = (blobs) => Math.max(...blobs.map((b) => b.a));

/**
 * The temperature nobody set, as a function you can run rather than a number you have to trust.
 *
 * Bakes ONE still blob, advects it out and back (so it ENDS WHERE IT STARTED and all spread is numerics), and
 * fits <r^2> = <r^2>_0 + 6Dt in three dimensions.
 */
export function measureAquariumD(blob, { n = 32, ext = 2, steps = 15, v = 1, dt = 1 / 60, rounds = 2 } = {}) {
    const idx = (i, j, k) => (k * n + j) * n + i;
    const wc = (i) => (i / (n - 1)) * 2 * ext - ext;
    let g = new Float32Array(n * n * n);
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g[idx(i, j, k)] = blobFieldAt(wc(i), wc(j), wc(k), [blob]);
    const moment = (f) => {
        let m = 0, m2 = 0;
        for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
            const val = f[idx(i, j, k)];
            if (val <= 0) continue;
            m += val; m2 += val * (wc(i) ** 2 + wc(j) ** 2 + wc(k) ** 2);
        }
        return m2 / m;
    };
    const sample = (f, x, y, z) => {
        const gx = ((x + ext) / (2 * ext)) * (n - 1), gy = ((y + ext) / (2 * ext)) * (n - 1), gz = ((z + ext) / (2 * ext)) * (n - 1);
        const i0 = Math.floor(gx), j0 = Math.floor(gy), k0 = Math.floor(gz);
        if (i0 < 0 || j0 < 0 || k0 < 0 || i0 >= n - 1 || j0 >= n - 1 || k0 >= n - 1) return 0;
        const fx = gx - i0, fy = gy - j0, fz = gz - k0;
        let a = 0;
        for (let dk = 0; dk < 2; dk++) for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++)
            a += (di ? fx : 1 - fx) * (dj ? fy : 1 - fy) * (dk ? fz : 1 - fz) * g[idx(i0 + di, j0 + dj, k0 + dk)];
        return a;
    };
    const advect = (vx) => { const o = new Float32Array(n * n * n);
        for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) o[idx(i, j, k)] = sample(g, wc(i) - vx * dt, wc(j), wc(k));
        return o; };
    const r2_0 = moment(g);
    const out = [];
    let t = 0;
    for (let r = 0; r < rounds; r++) {
        for (let s = 0; s < steps; s++) g = advect(v);
        for (let s = 0; s < steps; s++) g = advect(-v);
        t += 2 * steps * dt;
        out.push({ t, r2: moment(g), D: (moment(g) - r2_0) / (6 * t) });
    }
    return { r2_0, samples: out, D: out[out.length - 1].D };
}
