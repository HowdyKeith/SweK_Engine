// physics/mpm/transfer.mjs -- v3789
//
// *** THE MATERIAL POINT METHOD'S PARTICLE-GRID TRANSFER, 2D. THIS IS THE TRANSFER AND NOT A SOLVER, and the
// scope is stated up front because the name oversells easily: there is no grid momentum solve here, no
// constitutive model, no plasticity and nothing to look at on a screen. WHAT IS HERE IS THE HALF OF MPM THAT
// CARRIES EXACT CLAIMS -- P2G, then G2P -- which is why it is worth building first and grading on its own. ***
//
// Implemented from the published method (quadratic B-spline weights; APIC from Jiang et al. 2015). NOTHING IS
// VENDORED and no third party's code is here. v3599 built physics/stabilityMeter.mjs to grade PB-MPM's
// "stable at any time-step" and recorded that "nothing here implements MPM" -- THIS IS THE SUBJECT THAT METER
// HAS BEEN WAITING FOR, and it is deliberately ours so the claims graded are ours to defend.
//
// *** THE THREE KEYS, AND ALL THREE ARE IDENTITIES RATHER THAN TOLERANCES:
//   1. PARTITION OF UNITY. The nine quadratic B-spline weights around a particle SUM TO EXACTLY 1, wherever
//      the particle sits relative to the grid. The first thing that breaks when a stencil offset is wrong.
//   2. LINEAR MOMENTUM. sum(m_p v_p) over particles equals sum(m_i v_i) over nodes after P2G, to round-off.
//      Fails loudly when mass and momentum are scattered with different weights.
//   3. ANGULAR MOMENTUM -- and this is the one worth building for. PIC LOSES IT. APIC CONSERVES IT EXACTLY,
//      which is the Jiang result and is a claim this code is never told. It is also the plant: drop the affine
//      term C and angular momentum bleeds WHILE LINEAR MOMENTUM STAYS PERFECT. ONE KEY BLIND, ONE KEY FIRING.
// ***

/** Quadratic B-spline weights for one axis. Returns the base node index and the three weights. */
export function quadWeights(x, h) {
    // base = the leftmost of the three nodes whose support covers x. The 0.5 offset is the quadratic kernel's,
    // and getting it wrong is the classic stencil slip -- which partition of unity catches immediately.
    const xi = x / h;
    const base = Math.floor(xi - 0.5);
    const fx = xi - base;                       // in [0.5, 1.5) for the correct base
    const w0 = 0.5 * (1.5 - fx) * (1.5 - fx);
    const w1 = 0.75 - (fx - 1) * (fx - 1);
    const w2 = 0.5 * (fx - 0.5) * (fx - 0.5);
    return { base, w: [w0, w1, w2] };
}

/** A grid of (nx+1)*(ny+1) nodes at spacing h, holding mass and momentum. */
export function makeGrid(nx, ny, h) {
    const n = (nx + 1) * (ny + 1);
    return { nx, ny, h, n, mass: new Float64Array(n), mvx: new Float64Array(n), mvy: new Float64Array(n) };
}

const idx = (g, i, j) => j * (g.nx + 1) + i;

/**
 * PARTICLES TO GRID. Scatters mass and momentum with the SAME weights -- which is what makes the linear
 * momentum identity hold, and is exactly what a plant would separate.
 * @param {boolean} affine  APIC when true (the affine C term rides along); PIC when false.
 */
export function p2g(particles, g, { affine = true } = {}) {
    g.mass.fill(0); g.mvx.fill(0); g.mvy.fill(0);
    g.normalised = false;                 // v3794 -- p2g writes MOMENTUM, so the grid is no longer a velocity field
    let scattered = 0;
    for (const p of particles) {
        const X = quadWeights(p.x, g.h), Y = quadWeights(p.y, g.h);
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
            const i = X.base + a, j = Y.base + b;
            if (i < 0 || j < 0 || i > g.nx || j > g.ny) continue;
            const w = X.w[a] * Y.w[b], k = idx(g, i, j);
            // the node's offset from the particle, in world units -- the vector C acts on
            const dx = i * g.h - p.x, dy = j * g.h - p.y;
            // *** APIC: the momentum carried to a node is m*w*(v + C*(x_i - x_p)). WITHOUT THE C TERM THIS IS
            // PIC, which is the plant: the affine part is EXACTLY the angular-momentum-carrying piece. ***
            const vx = affine ? p.vx + (p.cxx * dx + p.cxy * dy) : p.vx;
            const vy = affine ? p.vy + (p.cyx * dx + p.cyy * dy) : p.vy;
            g.mass[k] += w * p.m;
            g.mvx[k] += w * p.m * vx;
            g.mvy[k] += w * p.m * vy;
            scattered++;
        }
    }
    return scattered;
}

/**
 * GRID TO PARTICLES. Gathers velocity and, for APIC, rebuilds the affine matrix C from the same weights.
 * The 4/h^2 factor is the inverse of the quadratic kernel's second moment -- a property of the SPLINE, not a
 * tuning constant, and using the wrong kernel's factor is a real and silent mistake.
 */
/*
 * *** v3794 -- g2p NORMALISES INTERNALLY, AND THAT WAS AN UNSTATED CONTRACT UNTIL IT BROKE A COMPOSITION.
 * It divides each node's momentum by that node's mass as it gathers. gridSolve's normalise() does the SAME
 * DIVISION IN PLACE. A step loop that calls normalise() -- which it must, because the body force has to land
 * on a VELOCITY field for the impulse to be M*g*dt -- and then calls g2p DIVIDES BY MASS TWICE.
 * MEASURED on one particle of mass 0.1 at h=0.5: the grid was PERFECT (total mass 0.100000000000, momentum
 * after gravity -0.004087500 against an expected -0.004087500) and g2p returned vy = -3.678750000 where
 * -0.040875000 was due -- NINETY TIMES, which is 1/(0.1/9), THE PER-NODE MASS.
 * *** TWO MODULES, EACH CORRECT ALONE, WHOSE COMPOSITION WAS WRONG -- and neither module's own gate could
 * ever have caught it, because each was only ever tested on a grid in the state it expected. THE GRID NOW
 * CARRIES ITS OWN STATE and g2p reads it, so the same loop cannot be written wrongly again. ***
 */
export function g2p(particles, g, { affine = true } = {}) {
    const D_inv = 4 / (g.h * g.h);
    // A grid that has already been normalised holds VELOCITY, not momentum: divide by mass once or not at all.
    const alreadyVelocity = g.normalised === true;
    for (const p of particles) {
        const X = quadWeights(p.x, g.h), Y = quadWeights(p.y, g.h);
        let vx = 0, vy = 0, cxx = 0, cxy = 0, cyx = 0, cyy = 0;
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
            const i = X.base + a, j = Y.base + b;
            if (i < 0 || j < 0 || i > g.nx || j > g.ny) continue;
            const w = X.w[a] * Y.w[b], k = idx(g, i, j);
            const m = g.mass[k];
            if (m <= 0) continue;               // an empty node contributes nothing; it does not contribute zero
            const nvx = alreadyVelocity ? g.mvx[k] : g.mvx[k] / m;
            const nvy = alreadyVelocity ? g.mvy[k] : g.mvy[k] / m;
            const dx = i * g.h - p.x, dy = j * g.h - p.y;
            vx += w * nvx; vy += w * nvy;
            if (affine) {
                cxx += w * nvx * dx; cxy += w * nvx * dy;
                cyx += w * nvy * dx; cyy += w * nvy * dy;
            }
        }
        p.vx = vx; p.vy = vy;
        p.cxx = affine ? D_inv * cxx : 0; p.cxy = affine ? D_inv * cxy : 0;
        p.cyx = affine ? D_inv * cyx : 0; p.cyy = affine ? D_inv * cyy : 0;
    }
}

/** Total linear momentum carried by the particles. */
export function particleMomentum(particles) {
    let px = 0, py = 0;
    for (const p of particles) { px += p.m * p.vx; py += p.m * p.vy; }
    return { px, py };
}

/** Total linear momentum held by the grid. */
export function gridMomentum(g) {
    let px = 0, py = 0;
    for (let k = 0; k < g.n; k++) { px += g.mvx[k]; py += g.mvy[k]; }
    return { px, py };
}

/**
 * *** ANGULAR MOMENTUM ABOUT THE ORIGIN, AND THE AFFINE TERM IS PART OF IT. A particle carries
 * L = m (x*vy - y*vx) from its translation PLUS m*(trace of the antisymmetric part of C) scaled by the
 * kernel's second moment -- which for the quadratic spline is h^2/4 per axis. Omitting the second piece would
 * measure PIC's angular momentum and call it APIC's, WHICH IS THE MISTAKE THE WHOLE KEY EXISTS TO CATCH. ***
 */
export function particleAngularMomentum(particles, h) {
    const D = (h * h) / 4;
    let L = 0;
    for (const p of particles) {
        L += p.m * (p.x * p.vy - p.y * p.vx);
        L += p.m * D * (p.cyx - p.cxy);
    }
    return L;
}

/** Angular momentum held by the grid about the origin. */
export function gridAngularMomentum(g) {
    let L = 0;
    for (let j = 0; j <= g.ny; j++) for (let i = 0; i <= g.nx; i++) {
        const k = idx(g, i, j);
        L += (i * g.h) * g.mvy[k] - (j * g.h) * g.mvx[k];
    }
    return L;
}

/** A rigidly rotating block of particles -- the fixture angular momentum is written for. */
export function rotatingBlock({ nx = 6, ny = 6, h = 1, x0 = 3, y0 = 3, spacing = 0.5, omega = 1.3, m = 0.7 } = {}) {
    const ps = [];
    for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) {
        const x = x0 + a * spacing, y = y0 + b * spacing;
        // rigid rotation about (cx, cy): v = omega x r, and C is the antisymmetric spin matrix
        const cx = x0 + (nx - 1) * spacing / 2, cy = y0 + (ny - 1) * spacing / 2;
        ps.push({ x, y, m, vx: -omega * (y - cy), vy: omega * (x - cx),
                  cxx: 0, cxy: -omega, cyx: omega, cyy: 0 });
    }
    return ps;
}

// *** GUARDED, BECAUSE THIS MODULE IS LOADED BY A BROWSER AND `process` IS A NODE GLOBAL. *** Unguarded,
// this line threw ReferenceError at module scope, which kills the WHOLE import graph -- so mpm.html
// rendered its headings and then nothing at all. VERIFIED IN A REAL CHROMIUM at v3809, before and after.
if (typeof process !== "undefined" && process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
    const g = makeGrid(12, 12, 1);
    const ps = rotatingBlock();
    const w = quadWeights(3.37, 1);
    console.log("[mpm] partition of unity at x=3.37: " + (w.w[0] + w.w[1] + w.w[2]));
    p2g(ps, g, { affine: true });
    const pm = particleMomentum(ps), gm = gridMomentum(g);
    console.log("[mpm] linear  particles (" + pm.px.toFixed(9) + ", " + pm.py.toFixed(9) + ")  grid (" +
                gm.px.toFixed(9) + ", " + gm.py.toFixed(9) + ")");
    console.log("[mpm] angular particles " + particleAngularMomentum(ps, g.h).toFixed(9) +
                "   grid " + gridAngularMomentum(g).toFixed(9));
}
