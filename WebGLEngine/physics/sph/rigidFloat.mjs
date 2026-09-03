// WebGLEngine/physics/sph/rigidFloat.mjs -- v4405
//
// *** THE SECOND CONSUMER OF v4403's SEAM, AND THE ONE THAT MAKES BUOYANCY REPRESENTABLE AT ALL. ***
//
// v4403 coupled XPBD to a rigid body and proved the impulse split: the correction divides by the GENERALIZED
// inverse mass w = 1/m + (r x n)^T I^-1 (r x n), the ledger's two halves cancel to a bit-identical zero, and
// dropping the body's half reverses momentum instead of merely leaking it. #160 was filed to come SECOND, on
// purpose, so that the fluid side would not be the second consumer of an unproven bridge.
//
// physics/sph/ has never touched a rigid body either. poolFixture.mjs's boundaries are analytic box walls --
// "one spacing of margin off each wall" -- and sph.js's own third line says it "is NOT a rigid-body engine".
// So buoyancy, in an engine with a fluid solver and two rigid-body solvers, was unrepresentable.
//
// ---- THIS FILE IMPORTS THE FORMULA RATHER THAN CARRYING A SECOND COPY OF IT ----------------------------------
//
// boxFace, faceConstraint and generalizedInvMass come from physics/xpbd/rigidCouple.js. That is a cross-family
// import and it is the point: the alternative is two implementations of one formula in two directories, which
// is the shape this tree has spent hundreds of rounds pulling back out of itself. The gate asserts that this
// file contains no second copy.
//
// ---- BUOYANCY IS NOT CODED HERE, AND THAT IS WHAT MAKES IT MEASURABLE ---------------------------------------
//
// There is no pressure-integral term in this file. No rho*g*V, no wetted-area sum, nothing that knows what
// buoyancy IS. The coupling is the same non-penetration constraint v4403 shipped: particles are projected out
// of the box and the body takes the equal-and-opposite half. The fluid underneath is pressurised by the fluid
// above it, it resists being pushed down, and the constraint transmits that resistance to the body.
//
// SO THE BOX FLOATS BECAUSE THE FLUID PUSHES BACK, NOT BECAUSE A LINE HERE SAYS IT SHOULD -- which means the
// depth it settles at is a MEASUREMENT and Archimedes is a prediction that can fail. Had this file integrated
// pressure over the hull and applied rho*g*V, the resulting agreement with rho*g*V would have been arithmetic.
//
// ---- AND THE PREDICTION IS REGISTERED FROM THE TREE'S OWN RECORD, NOT CHOSEN AFTERWARDS ---------------------
//
// Archimedes says a floating box's draft is 2*hy * rho_box/rho_fluid. Which rho_fluid? This solver is weakly
// compressible and hydrostatic.mjs's MEASURED_V2881 records what that costs: the best row in the tree, ideal
// EOS with the rest density set to the packing it actually delivers, RETAINS 0.632 OF A STILL COLUMN'S HEIGHT.
// A column at 63.2% of its height is standing at 1/0.632 = 1.58x the density it was given. physicsSuite's
// gated floor-pressure check says the same thing from the other end: 1022.8 Pa against an exact 1211.1 Pa,
// 15.5% low, "honest rather than generous" in its own note.
//
// So the draft is predicted to come out SHALLOWER than Archimedes-at-the-nominal-density by about that factor,
// and the number to compare against is Archimedes at the density THE FLUID ACTUALLY HAS where the box sits --
// which localDensity() reads off the field rather than being told.
"use strict";
import { boxFace, faceConstraint, generalizedInvMass, worldInvInertiaApply, qIntegrate,
         makeRigidProxy, boxMassProperties, ledgerResidual, qRotate } from "../xpbd/rigidCouple.js";
import { poly6 } from "./kernels.js";
export { makeRigidProxy, boxMassProperties, ledgerResidual };

/** Volume a particle of this mass occupies at this density. m/rho, and nothing else. */
export const particleVolume = (mass, rho) => (rho > 0 ? mass / rho : 0);
/** The lattice spacing that density implies. On the tree's pools this recovers d exactly -- see the gate. */
export const particleSpacing = (mass, rho) => Math.cbrt(particleVolume(mass, rho));
/** A particle's share of a surface: the square of its own spacing. DERIVED, never a tuned constant. */
export const particleArea = (mass, rho) => { const s = particleSpacing(mass, rho); return s * s; };

/**
 * The free surface, derived: the mean y of the highest `frac` of the particles. A single max is one splash and
 * the mean of everything is the middle of the column, so neither answers "where is the top of the water".
 */
export function freeSurface(world, frac = 0.12) {
    const ys = world.particles.map((p) => p.y).sort((a, b) => b - a);
    const n = Math.max(1, Math.round(ys.length * frac));
    let s = 0; for (let i = 0; i < n; i++) s += ys[i];
    return { level: s / n, sampled: n, of: ys.length };
}

/**
 * The density the fluid ACTUALLY has around the body -- the mean rho of every particle within `reach` of the
 * box's surface. This is the rho_fluid Archimedes is about, and it is read off the field.
 */
export function localDensity(world, proxy, reach = 0.1) {
    let s = 0, n = 0;
    for (const p of world.particles) {
        const f = boxFace(proxy, [p.x, p.y, p.z]);
        if (f.sd < reach) { s += p.rho; n++; }
    }
    return { rho: n ? s / n : 0, sampled: n };
}

/**
 * Archimedes: a floating box of density rho_box in fluid of density rho_fluid sits with its submerged fraction
 * equal to the density ratio, so the draft is 2*hy times that. Capped at the full height -- past a ratio of 1
 * the box does not float and the prediction is that it sinks, which is a different statement from a deeper draft.
 */
export function archimedesDraft(proxy, rhoFluid) {
    const he = proxy.halfExtents;
    const vol = 8 * he[0] * he[1] * he[2];
    const rhoBox = vol > 0 ? proxy.mass / vol : 0;
    const ratio = rhoFluid > 0 ? rhoBox / rhoFluid : Infinity;
    return { rhoBox, ratio, floats: ratio < 1, draft: Math.min(1, ratio) * 2 * he[1], fullHeight: 2 * he[1] };
}

/** How deep the box's lowest point sits below a water level. Negative means clear of the water. */
export const draftOf = (proxy, level) => level - (proxy.pos[1] - proxy.halfExtents[1]);

/**
 * *** dp/d(depth) DOWN A COLUMN, AND IT IS THE QUANTITY NOBODY WAS MEASURING. ***
 *
 * Hydrostatics requires dp/d(depth) = rho*g. BUOYANCY IS A DIFFERENCE BETWEEN TWO FACE PRESSURES, so it depends
 * on that GRADIENT and not on the pressure's magnitude anywhere. physicsSuite's gated fluid check measures the
 * MEAN FLOOR PRESSURE against M*g/area -- a mean, and a good check of the thing it checks -- and the tree has
 * never asked what the gradient is. This reads it by least squares over `samples` evenly spaced depths, which
 * is a fit and not a two-point difference, so one pressureless sample cannot set the slope on its own.
 *
 * `zeroBelow` reports how much of the column carries NO pressure at all, because clampPressure zeroes anything
 * under rest density and a column whose upper half is under rest density has an upper half that lifts nothing.
 */
export function pressureGradient(world, opts = {}) {
    const samples = Math.max(3, opts.samples ?? 9);
    const level = opts.level ?? freeSurface(world).level;
    const x = opts.x ?? 0, z = opts.z ?? 0;
    const rows = [];
    let zero = 0;
    for (let i = 1; i <= samples; i++) {
        const frac = i / (samples + 1);
        const depth = level * frac;
        const p = pressureAt(world, x, level - depth, z);
        rows.push([depth, p]);
        if (!(p > 0)) zero++;
    }
    const n = rows.length;
    const sx = rows.reduce((a, r) => a + r[0], 0), sy = rows.reduce((a, r) => a + r[1], 0);
    const sxx = rows.reduce((a, r) => a + r[0] * r[0], 0), sxy = rows.reduce((a, r) => a + r[0] * r[1], 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const required = world.opts.restDensity * Math.abs((world.opts.gravity || [0, -9.81, 0])[1]);
    return { slope, required, ratio: slope / required, rows, level,
             pressurelessFraction: zero / n, samples: n };
}

/**
 * The SPH interpolant of the pressure field at an arbitrary point:  p(x) = sum_j (m_j/rho_j) p_j W(|x - x_j|).
 *
 * This is the canonical SPH read of a carried quantity and it is what makes a real surface integral possible.
 * sph.js's own fieldAt returns the DENSITY sum (sum m W) and not this, so pressure at a point between particles
 * had no reader before.
 */
export function pressureAt(world, x, y, z) {
    const h = world.opts.h, h2 = h * h, m = world.opts.mass;
    const P = world.particles;
    let s = 0;
    for (let j = 0; j < P.length; j++) {
        const b = P[j];
        const r2 = (x - b.x) * (x - b.x) + (y - b.y) * (y - b.y) + (z - b.z) * (z - b.z);
        if (r2 < h2 && b.rho > 0) s += (m / b.rho) * b.p * poly6(r2, h);
    }
    return s;
}

/**
 * *** THE HULL INTEGRAL DONE AS QUADRATURE OVER THE SURFACE, WHICH IS THE THIRD ATTEMPT AND THE RIGHT ONE. ***
 *
 * The first two summed over PARTICLES in a band around the hull, each carrying its own (m/rho)^(2/3) of area.
 * Both failed against an exact hydrostatic field, and the diagnostic that named it is the ratio of the summed
 * area to the hull's actual area: it came out between 0.28x and 3.4x depending on how the lattice happened to
 * align with the faces, and the force landed with the WRONG SIGN at three resolutions out of four (-2.94x,
 * -0.35x, -2.52x of rho*g*V). A band of particles is not a surface, and its area is an accident of alignment.
 *
 * Quadrature fixes the thing that was actually broken: `res` x `res` points per face with weight faceArea/res^2,
 * so THE SUMMED AREA EQUALS THE HULL AREA IDENTICALLY -- an invariant the gate asserts rather than a number
 * that happens to come out near 1 -- and the pressure at each point is read by SPH interpolation instead of
 * being borrowed from whichever particle was nearest.
 *
 * Still no rho, no g and no volume in the sum. Archimedes is the answer key, never the method.
 */
export function hullPressureQuadrature(world, proxy, opts = {}) {
    const res = Math.max(1, opts.res ?? 4);
    const he = proxy.halfExtents;
    const out = { body: [0, 0, 0], torque: [0, 0, 0], area: 0, points: 0, pSum: 0 };
    // Six faces: axis a with sign sg; the two in-plane axes are the other two.
    for (let a = 0; a < 3; a++) for (const sg of [-1, 1]) {
        const u = (a + 1) % 3, v = (a + 2) % 3;
        const faceArea = 4 * he[u] * he[v];
        const w = faceArea / (res * res);
        const nl = [0, 0, 0]; nl[a] = sg;
        const n = qRotate(proxy.quat, nl);
        for (let i = 0; i < res; i++) for (let j = 0; j < res; j++) {
            const local = [0, 0, 0];
            local[a] = sg * he[a];
            local[u] = (-1 + (2 * i + 1) / res) * he[u];      // midpoint rule, so no sample sits on an edge
            local[v] = (-1 + (2 * j + 1) / res) * he[v];
            const wp = qRotate(proxy.quat, local);
            const x = proxy.pos[0] + wp[0], y = proxy.pos[1] + wp[1], z = proxy.pos[2] + wp[2];
            const pr = pressureAt(world, x, y, z);
            const mag = pr * w;
            const jx = -mag * n[0], jy = -mag * n[1], jz = -mag * n[2];
            out.body[0] += jx; out.body[1] += jy; out.body[2] += jz;
            out.torque[0] += wp[1] * jz - wp[2] * jy;
            out.torque[1] += wp[2] * jx - wp[0] * jz;
            out.torque[2] += wp[0] * jy - wp[1] * jx;
            out.area += w; out.points++; out.pSum += pr;
        }
    }
    return out;
}

/**
 * *** THE PRESSURE INTEGRAL OVER A HULL, AND IT ADVANCES NOTHING. ***
 *
 * Buoyancy is a FORCE, so it is measurable at an instant and does not need a body to have settled. Keeping
 * this separate from sphRigidStep is what lets it be checked against an EXACT field instead of a simulated
 * one: give every particle p = rho*g*(level - y) by hand and the answer must come out rho*g*V, with nothing
 * left in the error but discretisation. The first draft of this file had the integral inline inside the step,
 * so the only way to test it was to let the solver overwrite the field first -- which is testing two things
 * and blaming the wrong one.
 *
 * What it does: every particle whose distance to the box surface is under `wetReach` contributes its own
 * pressure over its own share of area, along the inward normal of the face it is nearest. NOTHING HERE KNOWS
 * WHAT BUOYANCY IS -- there is no rho, no g and no volume in the sum. p comes from the fluid's equation of
 * state and A from (m/rho)^(2/3), and Archimedes is what the sum is compared against, never what it computes.
 *
 * `applyToFluid` gives the particles the equal-and-opposite half, which is what makes it a coupling rather
 * than a probe. Off, the fluid does not feel the hull and the sum is a pure measurement.
 */
export function hullPressureForce(world, proxy, opts = {}) {
    const dt = opts.dt ?? 1;
    const reach = opts.wetReach ?? 0;
    const pm = world.opts.mass;
    const wp = pm > 0 ? 1 / pm : 0;
    const P = world.particles;
    const out = { body: [0, 0, 0], fluid: [0, 0, 0], torque: [0, 0, 0], wetted: 0, area: 0, inside: 0 };
    for (let i = 0; i < P.length; i++) {
        const pt = P[i];
        const f = boxFace(proxy, [pt.x, pt.y, pt.z]);
        // *** THE BAND IS STRICTLY OUTSIDE THE HULL, AND THE FIRST DRAFT'S WAS NOT. *** It tested only
        // f.sd < reach, which is true for every particle INSIDE the box as well -- and a box dropped into a
        // lattice has plenty. Measured against an exact hydrostatic field, the "wetted area" then summed to
        // between 1.4x and 3.4x the hull's actual area and the force came out with the WRONG SIGN at three of
        // four resolutions (-2.94x, -0.35x, -2.52x of rho*g*V). Interior particles are counted and reported
        // instead: a nonzero `inside` means the caller has fluid in its body, which is a fact about the
        // configuration and not something to quietly fold into a surface integral.
        if (f.sd < 0) { out.inside++; continue; }
        if (f.sd >= reach) continue;
        if (!(pt.p > 0)) continue;                       // clampPressure: a fluid pushes, it does not pull
        const fc = faceConstraint(proxy, [pt.x, pt.y, pt.z], f.axis, f.sign);
        const A = particleArea(pm, pt.rho);
        const mag = pt.p * A * dt;
        const n = fc.normal;
        const jx = -mag * n[0], jy = -mag * n[1], jz = -mag * n[2];
        out.body[0] += jx; out.body[1] += jy; out.body[2] += jz;
        out.fluid[0] -= jx; out.fluid[1] -= jy; out.fluid[2] -= jz;
        const r = [fc.point[0] - proxy.pos[0], fc.point[1] - proxy.pos[1], fc.point[2] - proxy.pos[2]];
        out.torque[0] += r[1] * jz - r[2] * jy;
        out.torque[1] += r[2] * jx - r[0] * jz;
        out.torque[2] += r[0] * jy - r[1] * jx;
        out.wetted++; out.area += A;
        if (opts.applyToFluid) { pt.vx -= jx * wp; pt.vy -= jy * wp; pt.vz -= jz * wp; }
    }
    return out;
}

/**
 * ONE COUPLED STEP: the fluid advances under its own solver, then the body and the particles settle their
 * mutual non-penetration, then the body integrates.
 *
 * The fluid is stepped by sph.js UNTOUCHED -- world.step(dt, bounds) -- because a coupling that had to modify
 * the solver would be a fork of it. Everything this file adds happens between that call and the next.
 *
 * `oneWay` drops the body's half of the ledger and nothing else, so the two runs a gate compares differ in one
 * boolean, exactly as in v4403.
 */
export function sphRigidStep(world, proxy, dt, bounds, opts = {}) {
    const oneWay = !!opts.oneWay;
    const radius = opts.radius ?? 0;
    const iterations = opts.iterations ?? 2;
    const pm = world.opts.mass;
    const wp = pm > 0 ? 1 / pm : 0;
    const g = opts.gravity || world.opts.gravity || [0, 0, 0];

    world.step(dt, bounds);
    world.computeDensity();

    const P = world.particles;
    // Contacts are DISCOVERED once and their FACE is held for the whole projection -- v4403's rule, and the
    // bug it came from: re-choosing the face lets a body that has moved past a particle push it out the far side.
    const contacts = [];
    for (let i = 0; i < P.length; i++) {
        const f = boxFace(proxy, [P[i].x, P[i].y, P[i].z]);
        if (f.sd < radius) contacts.push({ i, axis: f.axis, sign: f.sign });
    }
    const ledger = { particle: [0, 0, 0], body: [0, 0, 0], angular: [0, 0, 0], applied: 0 };
    // *** THE PRESSURE TERM, AND THE CONTROL THAT PROVES IT IS WHAT DOES THE WORK. *** opts.pressure defaults
    // FALSE so that the constraint-only coupling stays reachable as a run, because it is the measurement that
    // the constraint alone does not float anything (see this file's header and the gate's section 4). What is
    // added when it is on is a force the fluid ALREADY COMPUTED: p is a state variable of sph.js, produced by
    // its own equation of state and gated by physicsSuite. Integrating a field the fluid computes is reading
    // the fluid. Applying rho*g*V would be asserting the answer, and that is the line this file does not cross.
    // The applied force is the QUADRATURE, not the particle band -- see hullPressureQuadrature's header for
    // what the band got wrong and how it was caught. The band is kept as this file's negative control and is
    // never the thing that moves a body.
    let hull = null;
    if (opts.pressure) {
        hull = hullPressureQuadrature(world, proxy, { res: opts.res ?? 4 });
        if (!oneWay) {
            if (proxy.invMass > 0) {
                proxy.vel = [proxy.vel[0] + proxy.invMass * hull.body[0] * dt,
                             proxy.vel[1] + proxy.invMass * hull.body[1] * dt,
                             proxy.vel[2] + proxy.invMass * hull.body[2] * dt];
                const dw = worldInvInertiaApply(proxy, [hull.torque[0] * dt, hull.torque[1] * dt, hull.torque[2] * dt]);
                proxy.angVel = [proxy.angVel[0] + dw[0], proxy.angVel[1] + dw[1], proxy.angVel[2] + dw[2]];
            }
            // *** AND THE FLUID TAKES THE EQUAL AND OPPOSITE HALF, SPREAD OVER THE PARTICLES THAT CARRIED THE
            // PRESSURE. *** Without this the hull is a force from nowhere and the pair is not a coupling: the
            // reaction is shared by the wetted particles in proportion to nothing but their number, which is
            // crude and is SAID so rather than dressed up -- what it buys is that the two halves are exact
            // negations and the momentum ledger closes.
            const wet = [];
            for (let i = 0; i < P.length; i++) {
                const f = boxFace(proxy, [P[i].x, P[i].y, P[i].z]);
                if (f.sd >= 0 && f.sd < (opts.wetReach ?? (radius > 0 ? 2 * radius : 0))) wet.push(i);
            }
            if (wet.length) {
                const share = dt * wp / wet.length;
                for (const i of wet) {
                    P[i].vx -= hull.body[0] * share; P[i].vy -= hull.body[1] * share; P[i].vz -= hull.body[2] * share;
                }
            }
            hull.reactionOn = wet.length;
        }
    }
    const bPrevPos = proxy.pos.slice(), bPrevQuat = proxy.quat.slice();
    if (proxy.invMass > 0 && !opts.bodyDrivenExternally) {
        proxy.vel = [proxy.vel[0] + g[0] * dt, proxy.vel[1] + g[1] * dt, proxy.vel[2] + g[2] * dt];
        proxy.pos = [proxy.pos[0] + proxy.vel[0] * dt, proxy.pos[1] + proxy.vel[1] * dt, proxy.pos[2] + proxy.vel[2] * dt];
        proxy.quat = qIntegrate(proxy.quat, [proxy.angVel[0] * dt, proxy.angVel[1] * dt, proxy.angVel[2] * dt]);
    }
    for (let it = 0; it < iterations; it++) {
        for (let k = 0; k < contacts.length; k++) {
            const ct = contacts[k], p = P[ct.i];
            const fc = faceConstraint(proxy, [p.x, p.y, p.z], ct.axis, ct.sign);
            const C = fc.sd - radius;
            if (C >= 0) continue;
            const n = fc.normal;
            const r = [fc.point[0] - proxy.pos[0], fc.point[1] - proxy.pos[1], fc.point[2] - proxy.pos[2]];
            const wb = oneWay ? 0 : generalizedInvMass(proxy, r, n);
            const wsum = wp + wb;
            if (wsum === 0) continue;
            const s = -C / wsum;
            p.x += wp * s * n[0]; p.y += wp * s * n[1]; p.z += wp * s * n[2];
            // The particle's velocity loses its component INTO the surface -- an inelastic contact, matching
            // sph.js's own walls, which set the outward component and scale it by -0.3 rather than reflecting it.
            const vn = p.vx * n[0] + p.vy * n[1] + p.vz * n[2];
            if (vn < 0) { p.vx -= vn * n[0]; p.vy -= vn * n[1]; p.vz -= vn * n[2]; }
            ledger.particle[0] += s * n[0]; ledger.particle[1] += s * n[1]; ledger.particle[2] += s * n[2];
            if (!oneWay) {
                ledger.body[0] -= s * n[0]; ledger.body[1] -= s * n[1]; ledger.body[2] -= s * n[2];
                const rn = [r[1] * n[2] - r[2] * n[1], r[2] * n[0] - r[0] * n[2], r[0] * n[1] - r[1] * n[0]];
                ledger.angular[0] -= s * rn[0]; ledger.angular[1] -= s * rn[1]; ledger.angular[2] -= s * rn[2];
                if (proxy.invMass > 0) {
                    proxy.pos = [proxy.pos[0] - proxy.invMass * s * n[0],
                                 proxy.pos[1] - proxy.invMass * s * n[1],
                                 proxy.pos[2] - proxy.invMass * s * n[2]];
                    proxy.quat = qIntegrate(proxy.quat, worldInvInertiaApply(proxy, [-s * rn[0], -s * rn[1], -s * rn[2]]));
                }
            }
            ledger.applied++;
        }
    }
    if (proxy.invMass > 0 && !opts.bodyDrivenExternally) {
        proxy.vel = [(proxy.pos[0] - bPrevPos[0]) / dt, (proxy.pos[1] - bPrevPos[1]) / dt, (proxy.pos[2] - bPrevPos[2]) / dt];
        const cq = [-bPrevQuat[0], -bPrevQuat[1], -bPrevQuat[2], bPrevQuat[3]], q = proxy.quat;
        const dq = [q[3] * cq[0] + q[0] * cq[3] + q[1] * cq[2] - q[2] * cq[1],
                    q[3] * cq[1] - q[0] * cq[2] + q[1] * cq[3] + q[2] * cq[0],
                    q[3] * cq[2] + q[0] * cq[1] - q[1] * cq[0] + q[2] * cq[3],
                    q[3] * cq[3] - q[0] * cq[0] - q[1] * cq[1] - q[2] * cq[2]];
        const sg = dq[3] >= 0 ? 2 / dt : -2 / dt;
        proxy.angVel = [dq[0] * sg, dq[1] * sg, dq[2] * sg];
    }
    return { contacts: contacts.length, ledger, hull };
}

/** Total linear momentum of fluid plus body -- the same ledger question v4403 asked of cloth plus body. */
export function coupledMomentum(world, proxy) {
    const m = world.totalMomentum();
    if (proxy && proxy.mass > 0) { m[0] += proxy.mass * proxy.vel[0]; m[1] += proxy.mass * proxy.vel[1]; m[2] += proxy.mass * proxy.vel[2]; }
    return m;
}

export const ADDED_AT_V4405 = Object.freeze([
    "particleVolume", "particleSpacing", "particleArea", "freeSurface", "localDensity",
    "archimedesDraft", "draftOf", "pressureGradient", "pressureAt", "hullPressureQuadrature",
    "hullPressureForce",
    "sphRigidStep", "coupledMomentum",
]);
