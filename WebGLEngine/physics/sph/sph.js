// physics/sph/sph.js -- the blobulator, told what its own numbers mean.
//
// This is a third physics backend, and unlike Jolt and box3d it is NOT a rigid-body engine: it cannot be, because
// readTransforms hands back a position and a quaternion and a blob has no orientation. It is a FLUID, and it is
// the one kind of physics this engine could add without importing anything, because the field was already here.
//
// The whole solver rests on three exact facts, all gated:
//   - the kernel integrates to 1 (mass conserved)                          -- 6.5e-14
//   - the pressure force is ANTISYMMETRIC, so momentum is conserved        -- to machine precision, see below
//   - a uniform particle lattice recovers its own density                  -- the kernel's actual job
//
// THE ANTISYMMETRY IS THE LOAD-BEARING ONE, and the first version of this file got it wrong in a way worth
// recording, because the mistake is subtle and the code LOOKED right.
//
// The naive gradient f_i = -sum_j m_j (p_j/rho_j) grad W is obviously broken: i pushes j harder than j pushes i,
// and totalling it over a real configuration gives [2.05e+4, -1.98e+4, 2.89e+3] instead of zero. Momentum from
// nowhere. Fine -- so symmetrise it, f_i = -sum_j m_j (p_i+p_j)/(2 rho_j) grad W_ij, and apply +f to i and -f to j.
// The FORCES are then exactly equal and opposite and the total force is exactly zero.
//
// AND MOMENTUM STILL DRIFTED BY 75x. Because a = F/rho, and the two particles have DIFFERENT densities. Equal and
// opposite forces divided by unequal densities are unequal and opposite ACCELERATIONS. The force ledger balanced
// perfectly while the momentum ledger did not, and every printed force sum said the code was fine.
//
// The standard SPH momentum equation puts the density INSIDE the symmetric coefficient, which is why it looks like
// it does and why rho appears squared:
//
//     dv_i/dt = -sum_j m_j (p_i/rho_i^2 + p_j/rho_j^2) grad W_ij
//
// That coefficient is symmetric under swapping i and j, and grad W_ij = -grad W_ji, so with equal masses
// m*a_i cancels m*a_j exactly -- in floating point, the same numbers with opposite signs. Momentum is conserved to
// machine precision, and it is a property to TEST rather than assume: a fluid that slowly drifts across the room
// still looks completely convincing.
"use strict";
import { poly6, spikyGrad, viscLaplacian } from "./kernels.js";

// clampPressure: a weakly-compressible fluid PUSHES; it does not PULL.
//
// v2495 measured what happens without it, and it is not subtle. p = k(rho - rho0) goes NEGATIVE wherever the fluid
// is thinner than its rest density -- which is the ENTIRE FREE SURFACE, always, by definition of a surface. 46% to
// 65% of particles sat at negative pressure in every test. Negative pressure is ATTRACTIVE: neighbours pull
// together instead of apart, clump, and the clumps fling. And the most-negative pressure scales straight with the
// stiffness -- -795 at k=8, -4,277 at k=50, -30,253 at k=200, -126,581 at k=1000 -- which is why a STIFFER fluid
// flew apart where a softer one held: k=200 turned a 0.66 m column into 1.61 m of debris. That is the classic SPH
// tensile instability, and clamping at zero is the standard answer. Everything above rest density is untouched.
//
// Default ON, because the alternative is a fluid that pulls itself to pieces at its own surface. Pass
// clampPressure:false to get the old behaviour back.
import { SpatialGrid } from "./spatialGrid.js";

// v2881 -- THE EQUATION OF STATE IS NOW A CHOICE, and the default is still the old one so nothing silently moves.
//
//   "ideal"  p = k(rho - rho0)              Desbrun's modified ideal gas. What was here, and what CANNOT HOLD UP
//                                           A COLUMN OF WATER: a 686-particle column 0.65 tall settles to 0.101,
//                                           retaining 15.6% of its height while compressing 20% past rest
//                                           density. Recorded at v2494 and left open ever since.
//   "tait"   p = B[(rho/rho0)^gamma - 1]    The weakly-compressible standard, gamma = 7. The point is the SEVENTH
//                                           POWER: near rest density it is nearly as soft as the linear law, but
//                                           it stiffens violently under compression, so the bottom of a column
//                                           can push back hard enough to carry what is above it while the top
//                                           stays soft. A linear law has to be stiff EVERYWHERE to do that, and
//                                           stiff everywhere is unstable everywhere.
//
// B is not a free knob: B = rho0 * c^2 / gamma, with c an artificial sound speed. Choose c ~ 10 * v_max and the
// density variation stays around 1% -- which is what "weakly compressible" means, and why the fluid can be
// treated as nearly incompressible without an expensive pressure solve.
const DEFAULTS = { h: 0.1, mass: 0.02, restDensity: 1000, stiffness: 3.0, viscosity: 0.1, gravity: [0, -9.81, 0], clampPressure: true,
                   eos: "ideal", gamma: 7, soundSpeed: null };

/** Tait coefficient B = rho0 c^2 / gamma. Exposed so a caller can see the number rather than trust a default. */
/**
 * *** THE REFERENCE NEIGHBOUR WALK, FOR FIXTURES THAT CARRY ANSWER KEYS. ***
 *
 * v4121 made the grid win everywhere and dropped GRID_CROSSOVER from 1000 to 128, which silently switched
 * every 686-particle fixture from the brute force to the grid. Two gates went red -- materialKnobs and
 * stability -- and NEITHER because the grid is wrong: spatialGrid-selfcheck holds the two walks to 1.4e-14 on
 * density and ZERO drift over 60 steps. They went red because their configurations are the deliberately
 * UNSTABLE ones (physics/sph/settling.mjs records mechanical energy per particle QUADRUPLING over 2000 steps),
 * and an exploding trajectory amplifies a 1e-14 change in summation order until a settled-state statistic
 * moves.
 *
 * So the policy is explicit rather than scattered: A FIXTURE WHOSE BASELINE WAS TAKEN ON ONE WALK KEEPS THAT
 * WALK. What is being preserved is the ORDER OF A SUM, not a property of the fluid, and that is worth saying
 * out loud -- the alternative was re-cutting keys that four rounds of work established, against a trajectory
 * no more correct than the one they came from. Everything that is not an answer-key fixture -- the flesh, the
 * runtime, anything new -- gets the grid by default and the speedup with it.
 */
export const REFERENCE_WALK = Object.freeze({ useGrid: false });

export function taitB(restDensity, soundSpeed, gamma = 7) { return (restDensity * soundSpeed * soundSpeed) / gamma; }

/**
 * v4162 -- x^n FOR A NON-NEGATIVE INTEGER n, USING NOTHING BUT IEEE 754 MULTIPLICATION.
 *
 * *** THIS FINISHES A JOB v2546 STARTED AND A LIST FORGOT. *** kernels.js's header made the whole argument
 * sixteen hundred versions ago: IEEE 754 pins +, -, *, / and sqrt EXACTLY -- correctly rounded, bit-identical
 * on any conforming hardware -- and pins NOTHING about pow, which ECMAScript calls "implementation-
 * approximated". It converted the kernels to explicit multiplication, built portableMath-selfcheck to enforce
 * it, and predicted the failure in as many words: "an arm64 Mac joins this fleet tomorrow, and every other box
 * is x86_64." *** THE FILE HOLDING THE EQUATION OF STATE WAS NEVER PUT ON THAT GATE'S LIST. *** So the kernels
 * were made portable and the pressure was not, and at v4161 Keith's box and this one produced DIFFERENT
 * RANKINGS from the same commit -- every ideal-EOS number identical to the digit, every tait number diverging
 * from the third decimal, because only the tait branch goes through pow.
 *
 * MEASURED HERE, gamma = 7, over the density ratios a column actually visits (r in [0.5, 2.0], 200k samples):
 * Math.pow and this function DISAGREE ON 65.8% OF THEM, worst relative difference 6.571e-16 -- about 3 ulp, and
 * the same order as the 6.09e-16 v2546 measured for h^9. Small, and in a column whose mechanical energy
 * QUADRUPLES over 2000 steps it is third-decimal by step 1200. That is not a reason to leave it: it is the
 * reason the two machines disagreed at all.
 *
 * BY SQUARING RATHER THAN BY REPEATED MULTIPLICATION, and the choice is not free. x^7 is x * x^2 * x^4 -- four
 * roundings -- against six for x*x*x*x*x*x*x. Both are deterministic; the shorter chain accumulates less. What
 * matters is that ONE spelling is fixed here forever, because two spellings of the same power are exactly the
 * class of difference this function exists to eliminate.
 */
export function ipow(x, n) {
    let r = 1, b = x, k = n;
    while (k > 0) { if (k & 1) r *= b; k >>= 1; if (k) b *= b; }
    return r;
}

/** The largest exponent ipow is trusted with. `k >>= 1` is an int32 shift, and a gamma past this is not a
 *  fluid, so the fallback takes it rather than pretending. */
export const IPOW_MAX = 64;

/** A sound speed that keeps density variation near 1% for a column of height H under gravity g. */
export function soundSpeedFor(H, g = 9.81, factor = 10) { return factor * Math.sqrt(Math.max(1e-12, 2 * Math.abs(g) * H)); }

/**
 * Pressure from density. THE ONE PLACE the equation of state lives, so the two call sites below cannot drift.
 * Tait: p = B[(rho/rho0)^gamma - 1]. At rho = rho0 it is exactly 0, as it must be -- a fluid at rest density
 * pushes neither way.
 */
export function pressureOf(rho, o) {
    if (o.eos === "tait") {
        const B = o._taitB;
        const r = rho / o.restDensity;
        // *** THE ONE LINE THAT MADE TWO MACHINES DISAGREE ABOUT THIS FLUID (v4161). *** The shipped gamma is
        // 7, so the pinned path is the path this engine actually runs; the fallback exists because the knob
        // census sweeps gamma at +/-20% and asks for 8.4, and a real exponent has NO decomposition into the
        // five operations IEEE 754 pins. So the hole is narrowed to a non-integer gamma and NAMED rather than
        // papered over -- a swept gamma is a measurement, not a configuration anything ships.
        const g = o.gamma;
        const rg = (Number.isInteger(g) && g >= 0 && g <= IPOW_MAX)
            ? ipow(r, g)
            : Math.pow(r, g);   // UNPINNED-OK: non-integer gamma has no pinned decomposition; swept only, never shipped
        const p = B * (rg - 1);
        return o.clampPressure ? Math.max(0, p) : p;
    }
    const p = o.stiffness * (rho - o.restDensity);
    return o.clampPressure ? Math.max(0, p) : p;
}

function createSphWorld(opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    // Resolve B once. A caller may give soundSpeed directly, or leave it null and get a value derived from the
    // gravity and a nominal column height -- stated rather than hidden, because B is the number that decides
    // whether the fluid can hold itself up.
    if (o.eos === "tait") {
        const c = o.soundSpeed || soundSpeedFor(o.columnHeight || 1.0, o.gravity ? o.gravity[1] : -9.81);
        o._soundSpeed = c;
        o._taitB = taitB(o.restDensity, c, o.gamma);
    }
    const P = [];   // {x,y,z, vx,vy,vz, rho, p}

    // v2536 -- UNIFORM GRID. The pair walks below are O(N^2) and throw away every pair further than h: measured,
    // 200 particles 0.27ms/step, 400 -> 1.14ms, 800 -> 4.55ms, i.e. 4x per doubling. The grid makes a query touch
    // 27 cells instead of N particles.
    //
    // OPT-IN, AND THE BRUTE FORCE STAYS. `useGrid: false` restores the old path exactly -- not as a courtesy, but
    // because spatialGrid-selfcheck.mjs asserts the two AGREE, and a fast path with no slow path to check it
    // against is a fast path nobody can trust. Deleting the brute force would delete the oracle.
    const grid = new SpatialGrid(o.h);
    // v2536 measured, and the numbers were right about the IMPLEMENTATION rather than about grids:
    //     200 -> brute 0.60ms / grid 1.50ms = 0.4x   THE GRID LOSES
    //     600 -> brute 3.51ms / grid 4.26ms = 0.8x   THE GRID LOSES
    //    1500 -> brute 18.5ms / grid 11.2ms = 1.7x
    //    3000 -> brute 68.2ms / grid 24.4ms = 2.8x
    //    6000 -> brute  283ms / grid 56.0ms = 5.1x
    // and it named the cause exactly: "27 Map lookups and a closure per neighbour cost more than the pairs they
    // save". The crossover sat at 1000 and the flesh runs 400, so the grid was off where it was most wanted.
    //
    // *** v4121 -- THE CAUSE WAS FIXED RATHER THAN THE CONCLUSION REPEATED, AND THE CROSSOVER COLLAPSED. ***
    // spatialGrid.js now indexes cells by arithmetic over a bounding box instead of hashing into a Map: buckets
    // are one Int32Array linked list with no allocation per step, and because distinct cell indices cannot
    // collide, the hash-collision dedupe went away with the hash. Same rig as above -- constant particle
    // density, JIT warmed, medians:
    //     200 -> brute  1.51ms / grid 0.57ms =  2.6x   (was 0.4x)
    //     600 -> brute  2.17ms / grid 1.14ms =  1.9x   (was 0.8x)
    //    1500 -> brute 12.17ms / grid 2.50ms =  4.9x
    //    3000 -> brute 50.96ms / grid 4.83ms = 10.6x
    //    6000 -> brute  189.1ms / grid 9.68ms = 19.5x
    // The grid now wins at every size that was ever measured losing. Below ~128 particles the two are within
    // noise of each other -- BOTH under half a millisecond, and repeated runs disagree about which is ahead --
    // so the constant there is a formality rather than a finding, and it is set where the grid STOPS being
    // noise-competitive and starts winning consistently. The brute force stays regardless: spatialGrid-
    // selfcheck asserts the two agree, and deleting the slow path would delete the oracle.
    //
    // Same shape as brain/flowfieldAuto.js: the engine picks by size, and either can be forced for testing.
    const GRID_CROSSOVER = 128;
    const gridWanted = () => (o.useGrid === undefined ? P.length >= GRID_CROSSOVER : !!o.useGrid);

    function addParticle(pos, vel = [0, 0, 0]) {
        P.push({ x: pos[0], y: pos[1], z: pos[2], vx: vel[0], vy: vel[1], vz: vel[2], rho: 0, p: 0 });
        return P.length - 1;
    }

    // DENSITY -- this is exactly the blobulator's field, with the kernel normalised so the number means kg/m^3.
    function computeDensity() {
        const h2 = o.h * o.h;
        if (gridWanted()) {
            grid.rebuild(P); _fieldGridStamp = _steps;
            for (let i = 0; i < P.length; i++) {
                const a = P[i];
                let rho = 0;
                grid.forEachNear(a.x, a.y, a.z, (j) => {
                    const b = P[j];
                    const r2 = (a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2;
                    if (r2 < h2) rho += o.mass * poly6(r2, o.h);
                });
                a.rho = rho;
                const p = pressureOf(rho, o);   // v2881: one EOS, two call sites -- SAME as the
                a.p = o.clampPressure ? Math.max(0, p) : p;      // brute force below, copied not remembered.
            }
            return;
        }
        for (const a of P) {
            let rho = 0;
            for (const b of P) {
                const r2 = (a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2;
                if (r2 < h2) rho += o.mass * poly6(r2, o.h);
            }
            a.rho = rho;
            const p = pressureOf(rho, o);   // v2881: routed through the single EOS (ideal or Tait)
            a.p = o.clampPressure ? Math.max(0, p) : p;      // see the header: below zero it pulls, and surfaces are always below
        }
    }

    // ACCELERATIONS, not forces -- see the header. Returning F and dividing by rho later is what broke momentum.
    // The density lives INSIDE the symmetric coefficient so that m*a_i and m*a_j cancel exactly.
    // Extracted VERBATIM from the brute-force loop so both paths run the SAME physics. Rewriting the maths
    // by hand into a second function is how you get a fast path that is quietly a different simulation.
    function pairForce(A, i, j, a, b) {
        const dx = a.x-b.x, dy = a.y-b.y, dz = a.z-b.z;
        const r = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (r >= o.h || r < 1e-12) return;   // `continue` in the loop this came from; per-pair, that is `return`
        // pressure: dv_i/dt = -sum_j m_j (p_i/rho_i^2 + p_j/rho_j^2) grad W_ij. Coefficient symmetric in
        // i<->j; grad W_ij = -grad W_ji; equal masses -> the accelerations cancel in floating point.
        const coef = -o.mass * (a.p/(a.rho*a.rho) + b.p/(b.rho*b.rho)) * spikyGrad(r, o.h) / r;
        const px = coef * dx, py = coef * dy, pz = coef * dz;
        A[i][0] += px; A[i][1] += py; A[i][2] += pz;
        A[j][0] -= px; A[j][1] -= py; A[j][2] -= pz;
        // viscosity: mu * m * (v_j - v_i) / (rho_i rho_j) * laplacian W. rho_i*rho_j is symmetric and
        // (v_j - v_i) flips sign under the swap, so this cancels for the same reason.
        const vl = o.viscosity * o.mass * viscLaplacian(r, o.h) / (a.rho * b.rho);
        const vx = vl * (b.vx-a.vx), vy = vl * (b.vy-a.vy), vz = vl * (b.vz-a.vz);
        A[i][0] += vx; A[i][1] += vy; A[i][2] += vz;
        A[j][0] -= vx; A[j][1] -= vy; A[j][2] -= vz;
    }

    function accelerations() {
        const A = P.map(() => [0, 0, 0]);
        // THE SUBTLE BIT. The brute-force loop below runs j from i+1 and applies the force to BOTH i and j --
        // Newton's third law, each pair visited ONCE. A grid hands back every neighbour including the ones with a
        // lower index, so a naive port VISITS EVERY PAIR TWICE AND DOUBLES EVERY FORCE. The `j > i` guard is what
        // keeps the grid path honest, and it is the reason the selfcheck compares forces and not just timings.
        if (gridWanted()) {
            for (let i = 0; i < P.length; i++) {
                const a = P[i];
                grid.forEachNear(a.x, a.y, a.z, (j) => {
                    if (j <= i) return;
                    const b = P[j];
                    pairForce(A, i, j, a, b);
                });
            }
            return A;
        }
        for (let i = 0; i < P.length; i++) {
            const a = P[i];
            for (let j = i + 1; j < P.length; j++) {
                const b = P[j];
                const dx = a.x-b.x, dy = a.y-b.y, dz = a.z-b.z;
                const r = Math.sqrt(dx*dx + dy*dy + dz*dz);
                if (r >= o.h || r < 1e-12) continue;
                // pressure: dv_i/dt = -sum_j m_j (p_i/rho_i^2 + p_j/rho_j^2) grad W_ij. Coefficient symmetric in
                // i<->j; grad W_ij = -grad W_ji; equal masses -> the accelerations cancel in floating point.
                const coef = -o.mass * (a.p/(a.rho*a.rho) + b.p/(b.rho*b.rho)) * spikyGrad(r, o.h) / r;
                const px = coef * dx, py = coef * dy, pz = coef * dz;
                A[i][0] += px; A[i][1] += py; A[i][2] += pz;
                A[j][0] -= px; A[j][1] -= py; A[j][2] -= pz;
                // viscosity: mu * m * (v_j - v_i) / (rho_i rho_j) * laplacian W. rho_i*rho_j is symmetric and
                // (v_j - v_i) flips sign under the swap, so this cancels for the same reason.
                const vl = o.viscosity * o.mass * viscLaplacian(r, o.h) / (a.rho * b.rho);
                const vx = vl * (b.vx-a.vx), vy = vl * (b.vy-a.vy), vz = vl * (b.vz-a.vz);
                A[i][0] += vx; A[i][1] += vy; A[i][2] += vz;
                A[j][0] -= vx; A[j][1] -= vy; A[j][2] -= vz;
            }
        }
        return A;
    }

    let _steps = 0;

    function step(dt, bounds = null) {
        _steps++;
        computeDensity();
        const A = accelerations();
        for (let i = 0; i < P.length; i++) {
            const a = P[i];
            const ax = A[i][0] + o.gravity[0], ay = A[i][1] + o.gravity[1], az = A[i][2] + o.gravity[2];
            a.vx += ax*dt; a.vy += ay*dt; a.vz += az*dt;
            a.x += a.vx*dt; a.y += a.vy*dt; a.z += a.vz*dt;
            if (bounds) for (const [k, vk, lo, hi] of [["x","vx",bounds[0],bounds[3]], ["y","vy",bounds[1],bounds[4]], ["z","vz",bounds[2],bounds[5]]]) {
                if (a[k] < lo) { a[k] = lo; a[vk] *= -0.3; }
                if (a[k] > hi) { a[k] = hi; a[vk] *= -0.3; }
            }
        }
    }
    // THE FLUID'S X-RAY SHADOW, IN CLOSED FORM. This is the payoff of the identity: a poly6 particle IS a Wyvill
    // blob of radius h and amplitude m*315/(64 pi h^3), so its shadow is the one term the selfie round earned --
    // (32/35) * A * R * u^3.5, with u = 1 - c^2/R^2 and c the ray's closest approach in 3D. Nothing is simulated,
    // nothing is integrated: the fluid's sinogram is written down exactly, at any instant, for free.
    //
    // Which means the fluid can WEAR A SKIN MADE OF ITS OWN SHADOWS -- reconstruct from these and march the result.
    // And because a real scan gathers views over TIME while the fluid keeps moving, that skin smears exactly as a
    // real CT scan of a moving subject smears. The artifact is the physics.
    // v4162 -- h^3 by multiplication, matching kernels.js's _p9/_p6. At h = 0.1 pow and multiplication happen
    // to agree bit-for-bit; at other h they need not, and "happens to agree at the value we tried" is not a
    // property worth relying on.
    const shadowAmp = () => { const h = o.h; return o.mass * 315 / (64 * Math.PI * (h * h * h)); };
    function shadowAt(s, theta, z) {
        // UNPINNED-OK: a scan ANGLE, in the CT-sinogram diagnostic. Nothing here is integrated -- shadowAt is
        // never called from step() -- so an ulp in cos does not enter a trajectory, and there is no pinned
        // spelling of a rotation anyway.
        const ct = Math.cos(theta), st = Math.sin(theta), A = shadowAmp();   // UNPINNED-OK: CT scan angle, diagnostic only -- never called from step(), so no ulp enters a trajectory
        let acc = 0;
        for (const b of P) {
            const perp = b.x * ct + b.y * st - s, dz = z - b.z;
            const c2 = perp * perp + dz * dz;
            if (c2 >= o.h * o.h) continue;
            // v4162 -- x^3.5 IS PINNABLE, WHICH IS EASY TO MISS: it is x^3 * sqrt(x), and sqrt is one of the
            // five operations IEEE 754 fixes exactly. So the half-power costs nothing in portability.
            const d = 1 - c2 / (o.h * o.h);
            acc += (32 / 35) * A * o.h * (d * d * d * Math.sqrt(d));
        }
        return acc;
    }

    // the density field at any point -- literally the blobulator, and marchScalarField eats it with no adapter
    // THE GRID BELONGS HERE TOO, AND MY OWN CROSSOVER WOULD HAVE SAID OTHERWISE.
    //
    // The ~1000-particle crossover above was measured for the PAIR WALK: N particles against N particles. THIS IS
    // A DIFFERENT OPERATION WITH DIFFERENT ECONOMICS. fieldAt is sampled once per GRID CELL, and a 28-cell field
    // is ~22,000 cells: the cost is CELLS x N, where N is the SMALL number. 22,000 x 300 is 6.6 MILLION distance
    // checks per frame -- measured at 13ms, which put the flesh page over its whole 16.7ms budget before the
    // marcher had run.
    //
    // Taking a number that was true for one shape of work and assuming it holds for another is exactly the
    // mistake the GPU brain made, in reverse. So this path uses the grid whenever there is a grid to use.
    let _fieldGridStamp = -1;
    function fieldAt(x, y, z) {
        const h2 = o.h * o.h;
        // The caller samples thousands of points against ONE particle configuration, so rebuild at most once per
        // step -- keyed on the step counter, not on a "dirty" flag somebody has to remember to set.
        if (_fieldGridStamp !== _steps) { grid.rebuild(P); _fieldGridStamp = _steps; }
        let s = 0;
        grid.forEachNear(x, y, z, (i) => {
            const b = P[i];
            const r2 = (x-b.x)**2 + (y-b.y)**2 + (z-b.z)**2;
            if (r2 < h2) s += o.mass * poly6(r2, o.h);
        });
        return s;
    }
    return {
        addParticle, step, computeDensity, accelerations, fieldAt, shadowAt, shadowAmp,
        particles: P, opts: o,
        backendId: () => "sph",
        /** Which neighbour path is live RIGHT NOW. Depends on the particle count, so it is a call, not a flag. */
        usingGrid: () => (o.useGrid === undefined ? P.length >= GRID_CROSSOVER : !!o.useGrid),
        totalMomentum() { let m = [0,0,0]; for (const a of P) { m[0] += o.mass*a.vx; m[1] += o.mass*a.vy; m[2] += o.mass*a.vz; } return m; },
    };
}
export { createSphWorld };
