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
import { yawQuat } from "../physics/raceCar.mjs";
import { SLICK, fireCells, isBurning } from "../physics/slick.mjs";
import { SPELLS } from "../world/spellBook.mjs";
import { AMMO, pickupAvailable } from "../physics/spellAmmo.mjs";

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
        // v4592: a shell is drawn in the colour of the spell it carries (the book's burst colour) -- the lit pipeline's colour mode
        { name: "shells", mesh: sphereMesh(1, [1, 1, 1, 1]), pipeline: L.litPipelineDesc({ cull: "back", extra: "colour" }), bind, records: rec(draw.maxShells), extras: ext(draw.maxShells) },
    ];
}

/** The colour a shell is drawn in: its spell's burst colour from the book; the plain shell (spark, or none) the turret's own. */
export function shellColour(ammo, draw = TURRET_DRAW) { const s = ammo && ammo !== AMMO.plain ? SPELLS[ammo] : null; return s ? s.burst.colour : [draw.shellColour[0], draw.shellColour[1], draw.shellColour[2]]; }

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
        if (s) { const c = shellColour(s.ammo); R.set([s.x, s.y, s.z, draw.shellScale], o); E.set([c[0], c[1], c[2], 1], o); }
        else { R.set([draw.park[0], draw.park[1], draw.park[2], 1], o); E.set([draw.shellColour[0], draw.shellColour[1], draw.shellColour[2], 1], o); }
    }
    return { domes: base, barrels: base + n, shells: s0, count: 2 * n + draw.maxShells };
}

// ---- v4590 (task 79): the oil slicks and the Doom Fire on them -------------------------------------------------------------------
// Two more fleets: SLICKS, a flat dark box pre-sized to the patch (SLICK.width x 0.04 x SLICK.length at scale 1) placed with the
// patch's yaw in the quat mode; and FIRE, the burning cells of every lit patch as small boxes in the lit pipeline's colour mode (the
// instance's colour in the extras, round 4's debris cubes' mode) -- the automaton's palette on the road, cell for cell.
export const SLICK_DRAW = Object.freeze({ maxPatches: 24, maxCells: 512, oilColour: Object.freeze([0.05, 0.05, 0.07, 1]), park: Object.freeze([0, -500, 0]) });

/** A flat box of the patch's footprint, centred, at scale 1. */
export function slickMesh(width = SLICK.width, length = SLICK.length, colour = SLICK_DRAW.oilColour, thickness = 0.04) {
    const m = boxMesh(colour), p = m.positions;
    for (let i = 0; i < p.length; i += 3) { p[i] *= width; p[i + 1] *= thickness; p[i + 2] *= length; }
    return m;
}

/** The two fleets for kitScene's extraFleets: the slicks (quat mode) and the fire cells (colour mode). Records start parked. */
export function slickFleets(L, { light, draw = SLICK_DRAW } = {}) {
    const rec = (count) => { const r = new Float32Array(count * 4); for (let i = 0; i < count; i++) r.set([draw.park[0], draw.park[1], draw.park[2], 1], i * 4); return r; };
    const ext = (count, w) => { const e = new Float32Array(count * 4); for (let i = 0; i < count; i++) e[i * 4 + 3] = w; return e; };
    const bind = L.litBind(light);
    return [
        { name: "slicks", mesh: slickMesh(), pipeline: L.litPipelineDesc({ cull: "none", extra: "quat" }), bind, records: rec(draw.maxPatches), extras: ext(draw.maxPatches, 1) },
        { name: "fire", mesh: boxMesh([1, 1, 1, 1]), pipeline: L.litPipelineDesc({ cull: "none", extra: "colour" }), bind, records: rec(draw.maxCells), extras: ext(draw.maxCells, 1) },
    ];
}

/** Write this frame's patches and burning cells into a dynamic kit scene; `base` is the first slick record. Returns the counts placed. */
export function placeSlicks(scene, base, state, { draw = SLICK_DRAW } = {}) {
    const R = scene.kitRecords, E = scene.kitExtras, patches = state.patches;
    for (let k = 0; k < draw.maxPatches; k++) {
        const p = patches[k], o = (base + k) * 4;
        if (p) { R.set([p.x, p.y + 0.02, p.z, 1], o); E.set(yawQuat(p.yaw), o); } else { R.set([draw.park[0], draw.park[1], draw.park[2], 1], o); E.set([0, 0, 0, 1], o); }
    }
    const f0 = base + draw.maxPatches; let n = 0;
    for (const p of patches) { if (!isBurning(p)) continue; for (const c of fireCells(p)) { if (n >= draw.maxCells) break; const o = (f0 + n) * 4; R.set([c.x, c.y, c.z, c.w], o); E.set([c.colour[0], c.colour[1], c.colour[2], 1], o); n++; } }
    for (let k = n; k < draw.maxCells; k++) { const o = (f0 + k) * 4; R.set([draw.park[0], draw.park[1], draw.park[2], 1], o); E.set([0, 0, 0, 1], o); }
    return { patches: Math.min(patches.length, draw.maxPatches), cells: n, slicks: base, fire: f0, count: draw.maxPatches + draw.maxCells };
}

// ---- v4592 (task 81): the spellbook's pickups on the track ------------------------------------------------------------------------
// One fleet: a small sphere per pickup in the colour of the spell it loads (the book's burst colour, the colour mode), bobbing on the
// tick; a taken pickup is parked until it respawns.
export const PICKUP_DRAW = Object.freeze({ scale: 0.45, bob: 0.15, bobTicks: 40, park: Object.freeze([0, -500, 0]) });

/** The pickups fleet for kitScene's extraFleets. Records start parked. */
export function pickupFleets(L, { light, draw = PICKUP_DRAW, max = AMMO.maxPickups } = {}) {
    const r = new Float32Array(max * 4), e = new Float32Array(max * 4);
    for (let i = 0; i < max; i++) { r.set([draw.park[0], draw.park[1], draw.park[2], 1], i * 4); e.set([1, 1, 1, 1], i * 4); }
    return [{ name: "pickups", mesh: sphereMesh(2, [1, 1, 1, 1]), pipeline: L.litPipelineDesc({ cull: "back", extra: "colour" }), bind: L.litBind(light), records: r, extras: e }];
}

/** Write this tick's pickups into a dynamic kit scene; `base` is the first pickup record. Returns the counts placed. */
export function placePickups(scene, base, field, t = 0, { draw = PICKUP_DRAW, max = AMMO.maxPickups } = {}) {
    const R = scene.kitRecords, E = scene.kitExtras; let shown = 0;
    for (let k = 0; k < max; k++) {
        const p = field && field.pickups[k], o = (base + k) * 4;
        if (p && pickupAvailable(p, t)) { const c = SPELLS[p.spell].burst.colour; R.set([p.x, p.y + draw.bob * Math.sin((t + p.id * 7) / draw.bobTicks), p.z, draw.scale], o); E.set([c[0], c[1], c[2], 1], o); shown++; }
        else { R.set([draw.park[0], draw.park[1], draw.park[2], 1], o); E.set([1, 1, 1, 1], o); }
    }
    return { shown, pickups: base, count: max };
}
