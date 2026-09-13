// WebGLEngine/render/raceTurret.mjs -- v4588 (task 77): the turret and its shells on the device path
//
// Three extra fleets for world/kenneyKit.mjs's kitScene, riding behind the kit's own: a DOME per car (litSphere's icosphere at
// TURRET_DRAW.domeScale), a BARREL per car (buildingLab's unit box stretched to barrelMesh, from the pivot to the muzzle along
// +z, at unit scale), and SHELLS (small spheres, maxShells slots parked under the world until a shell takes one). Every record
// is { x, y, z, scale } with its quaternion in the extras, so the dome and barrel take the turret's world quaternion from
// physics/turret.mjs's muzzle() and turn with the mount and the chassis; the page rewrites the records in place each frame
// through scene.kitRecords / kitExtras (kitScene's `dynamic` contract, Racing city 2).
//
// The barrel mesh is the one thing built here: gpuDriven records carry ONE scale, so a 0.16 x 0.16 x 0.9 m barrel cannot be a
// unit box scaled -- the mesh is pre-sized and drawn at scale 1 (turret-selfcheck holds the muzzle at barrel = 0.9 from the
// pivot, and the mesh spans exactly [0, barrel] along +z so the drawn muzzle is the physics muzzle).
"use strict";
import { boxMesh } from "./buildingLab.mjs";
import { sphereMesh } from "./litSphere.mjs";
import { muzzle } from "../physics/turret.mjs";

export const TURRET_DRAW = Object.freeze({
    domeScale: 0.32, barrelSide: 0.16, shellScale: 0.12, maxShells: 64, park: Object.freeze([0, -500, 0]),
    domeColour: Object.freeze([0.22, 0.24, 0.28, 1]), barrelColour: Object.freeze([0.12, 0.12, 0.14, 1]), shellColour: Object.freeze([1.0, 0.72, 0.2, 1]),
});

/** A box from the pivot to the muzzle: `side` wide and tall, `length` along +z starting at z = 0. Drawn at scale 1. */
export function barrelMesh(length, side = TURRET_DRAW.barrelSide, colour = TURRET_DRAW.barrelColour) {
    const m = boxMesh(colour), p = m.positions;
    for (let i = 0; i < p.length; i += 3) { p[i] *= side; p[i + 1] *= side; p[i + 2] = p[i + 2] * length + length / 2; }
    return m;
}

/** The three fleets for kitScene's extraFleets, for `n` cars: domes, barrels, shells. Records start parked. */
export function turretFleets(n, barrel, L, { light, draw = TURRET_DRAW } = {}) {
    const rec = (count) => { const r = new Float32Array(count * 4); for (let i = 0; i < count; i++) r.set([draw.park[0], draw.park[1], draw.park[2], 1], i * 4); return r; };
    const ext = (count) => { const e = new Float32Array(count * 4); for (let i = 0; i < count; i++) e[i * 4 + 3] = 1; return e; };
    const pipeline = L.litPipelineDesc({ cull: "back", extra: "quat" }), bind = L.litBind(light);
    return [
        { name: "turret-domes", mesh: sphereMesh(2, draw.domeColour), pipeline, bind, records: rec(n), extras: ext(n) },
        { name: "turret-barrels", mesh: barrelMesh(barrel, draw.barrelSide, draw.barrelColour), pipeline, bind, records: rec(n), extras: ext(n) },
        { name: "shells", mesh: sphereMesh(1, draw.shellColour), pipeline, bind, records: rec(draw.maxShells), extras: ext(draw.maxShells) },
    ];
}

/**
 * Write this frame's turret and shell placements into a dynamic kit scene. `base` is the record index of the first dome (the kit's
 * placements plus every extra fleet ahead of these three); the barrels follow the domes, the shells follow the barrels.
 */
export function placeTurrets(scene, base, poses, turrets, shells, { draw = TURRET_DRAW } = {}) {
    const n = poses.length, R = scene.kitRecords, E = scene.kitExtras;
    for (let i = 0; i < n; i++) {
        const mz = muzzle(poses[i], turrets[i]), d = base + i, b = base + n + i;
        R.set([mz.pivot[0], mz.pivot[1], mz.pivot[2], draw.domeScale], d * 4); E.set(mz.quat, d * 4);
        R.set([mz.pivot[0], mz.pivot[1], mz.pivot[2], 1], b * 4); E.set(mz.quat, b * 4);
    }
    const s0 = base + 2 * n;
    for (let k = 0; k < draw.maxShells; k++) {
        const s = shells[k], o = (s0 + k) * 4;
        if (s) R.set([s.x, s.y, s.z, draw.shellScale], o); else R.set([draw.park[0], draw.park[1], draw.park[2], 1], o);
        E.set([0, 0, 0, 1], o);
    }
    return { domes: base, barrels: base + n, shells: s0, count: 2 * n + draw.maxShells };
}
