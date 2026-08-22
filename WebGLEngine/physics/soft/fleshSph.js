// WebGLEngine/physics/soft/fleshSph.js — v2535
//
// FLESH THAT ACTUALLY SIMULATES.
//
// fleshDynamics.js (v2526) says in its own header that it is "a lag, not a simulation": no pressure, no volume
// preservation, no flesh colliding with flesh. That was honest and it was also a promissory note. This is the note
// being paid.
//
// THE IDEA. Fill the body with SPH particles. Each particle remembers where it sits in BONE-LOCAL space -- so when
// the bone moves, the particle knows where it is supposed to be. Then two forces argue:
//
//   the BINDING pulls each particle toward its bone-local rest position   <- the skeleton drives the flesh
//   SPH PRESSURE pushes particles apart when they crowd                   <- the flesh has volume
//
// The argument between them IS the soft body. Squeeze a limb and the particles have nowhere to go, so pressure
// rises and the flesh bulges somewhere else. That is volume preservation, and it is the thing a spring lag can
// never do no matter how you tune it.
//
// WHY SPH AND NOT CLOTH. The engine owns both. ClothSim is a SURFACE -- a mass-spring sheet, which would give a
// skin that stretches but encloses nothing. SPH is a VOLUME, and the flesh question is a volume question. Also,
// sph.js's own comment says its density "is exactly the blobulator's field" -- so the marcher already speaks its
// language. fieldAt(x,y,z) -> marchScalarField is a bridge that was already built and never crossed.
//
// COST, MEASURED (JIT warmed, medians): sph.js has NO spatial grid -- neighbour search is O(N^2), and that is a
// known backlog item, not a surprise. 200 particles 0.27ms/step, 400 -> 1.14ms, 800 -> 4.55ms. Almost exactly 4x
// per doubling, which is the definition of the problem. 400 is the affordable point inside a 16.7ms frame that
// must also carry box3d, the march, and the draw.
//
// DETERMINISM: fixed dt, tick-indexed, seeded sampling. Same law as everything else here. An SPH solver stepped by
// the frame delta gives two machines two different bodies by frame 300, and nothing on screen looks wrong.
"use strict";

import { createSphWorld } from "../sph/sph.js";
import { boneField } from "./boneField.js";

export const DT = 1 / 120;   // SPH wants a smaller step than the rig does. Two sub-steps per 60Hz tick.

export class FleshSph {
    /**
     * @param {Array<{a:number[], b:number[], r:number}>} bones  the rest pose -- particles are seeded against THIS
     * @param {{count?: number, bind?: number, damp?: number, blend?: number, seed?: number}} [opts]
     *   count  how many particles. O(N^2): 400 is ~1.14ms/step here, 800 is ~4.55ms.
     *   bind   how hard a particle is pulled to its bone-local rest spot. Low = liquid, high = rigid.
     *   damp   velocity damping. Flesh is not a bouncy castle; without this it rings forever.
     */
    constructor(bones, opts = {}) {
        this.bind = opts.bind ?? 220;
        this.damp = opts.damp ?? 6.0;
        this.blend = opts.blend ?? 0.16;
        this.count = opts.count ?? 400;
        this.ticks = 0;
        this._seed = (opts.seed ?? 20250716) >>> 0;

        // THE SMOOTHING LENGTH IS NOT A TASTE, IT IS A CONSEQUENCE. sph.js's defaults (h 0.1, mass 0.02) are a
        // WATER tuning; a limb is not water at that scale. If h is smaller than the particle spacing the
        // particles cannot see each other, there is no pressure, and this becomes a slower version of the spring
        // lag it was meant to replace. So: measure the body, then choose.
        const vol = capsuleVolume(bones, this.blend);
        const spacing = Math.cbrt(vol / Math.max(1, this.count));
        const h = spacing * 2.6;             // ~30-60 neighbours in 3D, the usual working range
        // mass such that a particle in a FULL neighbourhood reads restDensity: rho = mass * sum(poly6) and for a
        // roughly uniform packing sum(poly6) ~ 1/spacing^3, so mass ~ restDensity * spacing^3.
        const restDensity = 1000;
        const mass = restDensity * spacing * spacing * spacing;
        this.h = h; this.spacing = spacing; this.volume = vol;

        this.world = createSphWorld({
            gravity: [0, 0, 0],   // gravity comes from the RIG, not from here: the bones already fell. Adding it
                                  // twice would make the flesh sag off the skeleton.
            h, mass, restDensity,
        });
        // Seed particles INSIDE the flesh. Rejection sampling against the same field that draws the skin, so the
        // particles start where the flesh is rather than in a box around it.
        this.rest = [];    // {bone, lx, ly, lz} -- the particle's spot in its bone's local frame
        this._seedParticles(bones);
        this._restBones = bones.map((b) => ({ a: [...b.a], b: [...b.b], r: b.r }));
    }

    _rnd() { this._seed = (this._seed * 1664525 + 1013904223) >>> 0; return this._seed / 4294967296; }

    _seedParticles(bones) {
        // bounding box of the rest pose
        let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
        for (const b of bones) for (const p of [b.a, b.b]) for (let d = 0; d < 3; d++) {
            lo[d] = Math.min(lo[d], p[d] - b.r); hi[d] = Math.max(hi[d], p[d] + b.r);
        }
        const inside = (x, y, z) => {
            // boneField gives a GRID; for a point test, walk the capsules directly. Same smooth-min, one sample.
            let f = 1e9;
            for (const b of bones) {
                const d = segDist(x, y, z, b.a, b.b) - b.r;
                f = smin(f, d, this.blend);
            }
            return f < 0;
        };
        let tries = 0;
        while (this.rest.length < this.count && tries < this.count * 200) {
            tries++;
            const x = lo[0] + this._rnd() * (hi[0] - lo[0]);
            const y = lo[1] + this._rnd() * (hi[1] - lo[1]);
            const z = lo[2] + this._rnd() * (hi[2] - lo[2]);
            if (!inside(x, y, z)) continue;
            // which bone owns it? the nearest one. A particle bound to a bone across the body would tear the
            // flesh apart the moment the rig moved.
            let best = 0, bd = 1e9;
            for (let i = 0; i < bones.length; i++) {
                const d = segDist(x, y, z, bones[i].a, bones[i].b) - bones[i].r;
                if (d < bd) { bd = d; best = i; }
            }
            this.world.addParticle([x, y, z]);
            this.rest.push({ bone: best, ...toLocal(x, y, z, bones[best]) });
        }
        this.seeded = this.rest.length;
    }

    /**
     * Advance one TICK against the current bone pose.
     * @param {Array<{a:number[], b:number[], r:number}>} bones  live, from bonesFromTransforms
     */
    step(bones) {
        const P = this.world.particles;
        // two sub-steps: SPH is stiff, and one 60Hz step of it is visibly unstable
        for (let sub = 0; sub < 2; sub++) {
            // BINDING: pull each particle toward where its bone says it should be now.
            for (let i = 0; i < P.length; i++) {
                const r = this.rest[i];
                const bone = bones[r.bone] || this._restBones[r.bone];
                const t = toWorld(r, bone);
                const p = P[i];
                const ax = (t[0] - p.x) * this.bind - p.vx * this.damp;
                const ay = (t[1] - p.y) * this.bind - p.vy * this.damp;
                const az = (t[2] - p.z) * this.bind - p.vz * this.damp;
                p.vx += ax * DT; p.vy += ay * DT; p.vz += az * DT;
            }
            // PRESSURE: sph.js integrates its own accelerations and moves the particles.
            this.world.step(DT);
        }
        this.ticks++;
    }

    /** Density at a point -- feed straight to marchScalarField as (ISO - fieldAt). */
    fieldAt(x, y, z) { return this.world.fieldAt(x, y, z); }

    /** Sample the SPH density onto a grid the marcher can eat. */
    sampleGrid(dimX, dimY, dimZ, origin, cellSize, iso) {
        const f = new Float32Array(dimX * dimY * dimZ);
        const plane = dimX * dimY;
        for (let z = 0; z < dimZ; z++) for (let y = 0; y < dimY; y++) {
            const row = z * plane + y * dimX;
            for (let x = 0; x < dimX; x++) {
                f[row + x] = iso - this.world.fieldAt(origin[0] + x * cellSize, origin[1] + y * cellSize, origin[2] + z * cellSize);
            }
        }
        return f;
    }

    /** Total kinetic energy. If this grows while the rig holds still, the solver is making energy up. */
    kinetic() {
        let k = 0;
        for (const p of this.world.particles) k += p.vx * p.vx + p.vy * p.vy + p.vz * p.vz;
        return 0.5 * this.world.opts.mass * k;
    }

    /** Mean particle density. THE volume-preservation readout: squeeze the flesh and this must RISE. */
    meanDensity() {
        this.world.computeDensity();
        let s = 0;
        for (const p of this.world.particles) s += p.rho;
        return s / Math.max(1, this.world.particles.length);
    }
}

// ---- geometry helpers. This module depends on sph.js and boneField.js and nothing else. --------------------

/** Rough volume of the capsule union. Overcounts where limbs overlap, which is fine: it is setting a LENGTH
 *  SCALE, not doing accounting, and a 20% error in volume is a 6% error in spacing. */
function capsuleVolume(bones, blend) {
    let v = 0;
    for (const b of bones) {
        const ex = b.b[0] - b.a[0], ey = b.b[1] - b.a[1], ez = b.b[2] - b.a[2];
        const len = Math.sqrt(ex * ex + ey * ey + ez * ez);
        const r = b.r + blend * 0.5;   // the smooth-min fattens the surface; the particles live inside THAT
        v += Math.PI * r * r * len + (4 / 3) * Math.PI * r * r * r;
    }
    return Math.max(1e-6, v);
}

function segDist(x, y, z, a, b) {
    const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
    const px = x - a[0], py = y - a[1], pz = z - a[2];
    const ee = ex * ex + ey * ey + ez * ez;
    let t = ee > 1e-12 ? (px * ex + py * ey + pz * ez) / ee : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = px - ex * t, dy = py - ey * t, dz = pz - ez * t;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Quilez smooth-min, same as boneField's -- the flesh must agree with itself about where it is.
function smin(a, b, k) {
    if (k <= 0) return Math.min(a, b);
    const h = Math.max(0, k - Math.abs(a - b)) / k;
    return Math.min(a, b) - h * h * k * 0.25;
}

/** A point's position in a bone's local frame: (t along the segment, and a perpendicular offset). */
function toLocal(x, y, z, bone) {
    const ex = bone.b[0] - bone.a[0], ey = bone.b[1] - bone.a[1], ez = bone.b[2] - bone.a[2];
    const ee = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1e-9;
    const ux = ex / ee, uy = ey / ee, uz = ez / ee;
    const px = x - bone.a[0], py = y - bone.a[1], pz = z - bone.a[2];
    const t = (px * ux + py * uy + pz * uz) / ee;
    // perpendicular component, kept in WORLD orientation. Rebuilding a full orthonormal frame per bone per tick
    // costs more than it buys here: the limbs are near-rigid and the binding is soft.
    return { lx: px - ux * (t * ee), ly: py - uy * (t * ee), lz: pz - uz * (t * ee), lt: t };
}

function toWorld(r, bone) {
    const ex = bone.b[0] - bone.a[0], ey = bone.b[1] - bone.a[1], ez = bone.b[2] - bone.a[2];
    return [
        bone.a[0] + ex * r.lt + r.lx,
        bone.a[1] + ey * r.lt + r.ly,
        bone.a[2] + ez * r.lt + r.lz,
    ];
}

/**
 * THE HYBRID -- Keith's idea, v2538, and it is better than either skin alone.
 *
 * The two skins fail in OPPOSITE directions. The capsule field is smooth and cheap and knows nothing about
 * pressure. The SPH field knows about pressure and is lumpy -- and the lumpiness is the KERNEL WIDTH, not the
 * particle count (measured v2537: 400 particles gave 1408 triangles, 900 gave 1424; more particles do not help).
 *
 * So take the SHAPE from the capsules and the BULGE from the fluid.
 *
 *     field = capsuleField - bulge,    bulge = strength * max(0, rho - restDensity) / restDensity
 *
 * Where the flesh is compressed, rho exceeds rest, so the field drops and THE SURFACE MOVES OUTWARD. Fold a limb
 * and it bulges in the crook -- because the particles there really are crowded, not because a spring was tuned to
 * pretend. Where the flesh is at rest the bulge is zero and this IS the capsule skin, exactly.
 *
 * AND IT IS CHEAP, WHICH IS THE POINT. Measured on the real 11-bone rig, 500 particles:
 *     capsule field @ 28 cells   1.24ms    <- the shape
 *     SPH field     @ 28 cells  10.29ms    <- the whole cost, and why v2537's SPH skin blew the frame
 *     SPH field     @ 14 cells   1.56ms    <- 6.6x cheaper. 1176 cells instead of ~22,000.
 * Cells scale as the CUBE, so reading the pressure coarse and interpolating it onto the fine shape costs
 * ~1.24 + 1.56 = ~2.8ms against 10.29ms, AND KEEPS THE SMOOTH SURFACE.
 *
 * WHY THIS IS NOT A CHEAT. Pressure is a SMOOTH, SLOWLY-VARYING field -- that is exactly the kind of thing that
 * survives being read coarse and interpolated. The SHARP features live in the shape, and the shape is analytic.
 * Reading the SHAPE coarse would be a cheat; reading the PRESSURE coarse is just not wasting samples.
 *
 * @param {Array<{a:number[],b:number[],r:number}>} bones
 * @param {FleshSph} sph
 * @param {{dimX,dimY,dimZ,origin,cellSize}} fine    the grid the marcher will eat
 * @param {number} coarseCells                        how many cells across to read the pressure at
 * @param {{blend?:number, strength?:number, restDensity?:number}} [opts]
 */
export function hybridGrid(bones, sph, fine, coarseCells, opts = {}) {
    const blend = opts.blend ?? 0.16;
    const strength = opts.strength ?? 0.12;
    const rest = opts.restDensity ?? 1000;

    // 1. the coarse pressure grid, over the SAME box as the fine one -- a different box would slide the bulge off
    //    the body, which would look like the flesh drifting and would be very hard to diagnose.
    const cx = Math.max(2, coarseCells | 0);
    const spanX = (fine.dimX - 1) * fine.cellSize, spanY = (fine.dimY - 1) * fine.cellSize, spanZ = (fine.dimZ - 1) * fine.cellSize;
    const big = Math.max(spanX, spanY, spanZ);
    const ccs = big / (cx - 1);
    const cdX = Math.max(2, Math.round(spanX / ccs) + 1);
    const cdY = Math.max(2, Math.round(spanY / ccs) + 1);
    const cdZ = Math.max(2, Math.round(spanZ / ccs) + 1);
    const P = new Float32Array(cdX * cdY * cdZ);
    const cPlane = cdX * cdY;
    for (let z = 0; z < cdZ; z++) for (let y = 0; y < cdY; y++) {
        const row = z * cPlane + y * cdX;
        for (let x = 0; x < cdX; x++) {
            const rho = sph.fieldAt(fine.origin[0] + x * ccs, fine.origin[1] + y * ccs, fine.origin[2] + z * ccs);
            // ONLY COMPRESSION PUSHES OUT. Below rest density the flesh is sparse -- at the surface, mostly -- and
            // letting that pull the skin INWARD would eat the body from the outside in. That is the same
            // no-tension reasoning as sph.js's clampPressure, for the same reason.
            P[row + x] = Math.max(0, (rho - rest) / rest);
        }
    }

    // 2. the fine field: capsule shape, minus the interpolated bulge
    const out = new Float32Array(fine.dimX * fine.dimY * fine.dimZ);
    const plane = fine.dimX * fine.dimY;
    for (let z = 0; z < fine.dimZ; z++) for (let y = 0; y < fine.dimY; y++) {
        const row = z * plane + y * fine.dimX;
        for (let x = 0; x < fine.dimX; x++) {
            const wx = fine.origin[0] + x * fine.cellSize;
            const wy = fine.origin[1] + y * fine.cellSize;
            const wz = fine.origin[2] + z * fine.cellSize;
            let d = 1e9;
            for (const b of bones) d = smin(d, segDist(wx, wy, wz, b.a, b.b) - b.r, blend);
            out[row + x] = d - strength * trilinear(P, cdX, cdY, cdZ, (wx - fine.origin[0]) / ccs, (wy - fine.origin[1]) / ccs, (wz - fine.origin[2]) / ccs);
        }
    }
    return out;
}

function trilinear(F, dX, dY, dZ, fx, fy, fz) {
    const x0 = Math.max(0, Math.min(dX - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(dY - 1, Math.floor(fy))), z0 = Math.max(0, Math.min(dZ - 1, Math.floor(fz)));
    const x1 = Math.min(dX - 1, x0 + 1), y1 = Math.min(dY - 1, y0 + 1), z1 = Math.min(dZ - 1, z0 + 1);
    const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0)), tz = Math.max(0, Math.min(1, fz - z0));
    const P = dX * dY;
    const at = (x, y, z) => F[z * P + y * dX + x];
    const c00 = at(x0, y0, z0) * (1 - tx) + at(x1, y0, z0) * tx;
    const c10 = at(x0, y1, z0) * (1 - tx) + at(x1, y1, z0) * tx;
    const c01 = at(x0, y0, z1) * (1 - tx) + at(x1, y0, z1) * tx;
    const c11 = at(x0, y1, z1) * (1 - tx) + at(x1, y1, z1) * tx;
    return (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
}
