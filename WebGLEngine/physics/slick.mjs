// WebGLEngine/physics/slick.mjs -- v4590 (task 79): the oil slick the gunner drops, and the Doom Fire that burns on it
//
// Keith asked whether the turret gunner could also trigger an oil slick, and Doom Fire from the slick. The tree had no oil, no
// decal and no way to change the grip under a wheel at a point: physics/raceCar.mjs's trackSurface.at(x, z) is a pure function of
// the track's geometry, and the only fire on the ground was world/fireSystem.js's voxel wildfire on GRASS. The Doom Fire byte
// grid (render/doomFire.mjs, the CPU automaton behind the Slug glyph fill) had never burned anywhere in a 3D world.
//
// A SLICK IS A PATCH WITH A POSE, AND THE SURFACE IS WRAPPED, NOT REWRITTEN. dropSlick puts a SLICK.width x SLICK.length patch
// behind the car's chassis, aligned with its yaw; slickSurface(base, state) returns a surface whose at(x, z) asks the base and then
// the patches: inside an unlit patch the grip and the rolling resistance are multiplied by SLICK.grip / SLICK.rolling and the kind
// reads "oil" (the driver's off-asphalt feature sees it: the road under it is no longer asphalt), inside a burning patch the kind
// reads "fire" with the grip of the road under it (oil that has caught is not slippery any more, it is hot). raceCar's carForces
// takes the wrapped surface as it takes any surface, so the wheels lose grip where the oil is without a line of it changing.
//
// THE FIRE IS THE DOOM FIRE AUTOMATON, ONE PER PATCH, LAID ON THE GROUND. igniteSlick lights the owner's newest unlit patch: a
// DoomFire of SLICK.fire.cols x rows whose source row is the patch's rear edge and whose "rise" runs along the patch's length,
// stepped every SLICK.fire.stepEvery ticks; after SLICK.fire.burn seconds the source is extinguished and the automaton burns out
// on its own schedule (the flames climb off the top of the grid: heat() reaches 0 some rows later), at which point the patch is
// spent and removed. A car whose chassis centre is inside a burning patch takes a BURN event that tick; the race tallies burn
// ticks per car, and the gunner's reward pays for an opponent's burn ticks on its own fire. fireCells() hands the burning cells
// back with their palette colour, which render/raceTurret.mjs draws as small boxes in the lit pipeline's colour mode -- the
// automaton on the road, cell for cell.
//
// Everything is float math on the tick and the seed: two runs of the same commands give the same patches and the same flames,
// and slickHash folds them into the lockstep fingerprint beside box3d's state and the turrets.
"use strict";
import { DoomFire, PALETTE, MAX_INTENSITY } from "../render/doomFire.mjs";

export const SLICK = Object.freeze({
    width: 1.8, length: 3.4,            // the patch, metres, aligned with the dropping car's yaw
    behind: 2.6,                        // the patch's centre this far behind the chassis centre
    grip: 0.3, rolling: 0.5,            // multipliers on the road's grip and rolling resistance under oil
    life: 40,                           // s an unlit patch lasts
    dropReloadTicks: 180,               // 3 s between drops from one car
    maxPerCar: 4,                       // older patches of a car are spent when it drops a fifth
    fire: Object.freeze({ cols: 12, rows: 8, stepEvery: 3, burn: 6, cellY: 0.06 }),   // the automaton per patch, its source row fed for `burn` s
});
export const KIND_OIL = "oil", KIND_FIRE = "fire";

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** The slick state of a race: the patches, per-car drop clocks, and a counter for ids and seeds. */
export function createSlicks(spec = SLICK) { return { spec, patches: [], lastDrop: new Map(), next: 1 }; }

/** Is (x, z) inside the patch, in the patch's own frame? */
export function inPatch(patch, x, z) {
    // raceCar's yaw turns +z toward +x: the patch's forward is [sin yaw, cos yaw] and its right is [cos yaw, -sin yaw]
    const dx = x - patch.x, dz = z - patch.z;
    const lx = dx * Math.cos(patch.yaw) - dz * Math.sin(patch.yaw), lz = dx * Math.sin(patch.yaw) + dz * Math.cos(patch.yaw);
    return Math.abs(lx) <= patch.half[0] && Math.abs(lz) <= patch.half[1];
}

/** The patch under a point, newest first (a later drop over an older one wins), or null. */
export function patchAt(state, x, z) {
    for (let i = state.patches.length - 1; i >= 0; i--) if (inPatch(state.patches[i], x, z)) return state.patches[i];
    return null;
}

/** Drop a patch behind a car's pose at tick t. Refused (null) inside the car's drop reload. */
export function dropSlick(state, pose, owner, t, spec = state.spec) {
    const last = state.lastDrop.get(owner);
    if (last != null && t - last < spec.dropReloadTicks) return null;
    const yaw = pose.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const patch = { id: state.next++, owner, x: pose.pos[0] - fx * spec.behind, z: pose.pos[2] - fz * spec.behind, y: pose.pos[1] - 0.9, yaw: wrap(yaw),
                    half: [spec.width / 2, spec.length / 2], born: t, fire: null, ignitedAt: null, spent: false };
    state.patches.push(patch); state.lastDrop.set(owner, t);
    const mine = state.patches.filter((p) => p.owner === owner && !p.fire);
    if (mine.length > spec.maxPerCar) mine[0].spent = true;
    return patch;
}

/** Light the owner's newest unlit patch at tick t: a Doom Fire per patch, seeded by the patch id. Null when there is none. */
export function igniteSlick(state, owner, t, spec = state.spec) {
    for (let i = state.patches.length - 1; i >= 0; i--) {
        const p = state.patches[i];
        if (p.owner === owner && !p.fire && !p.spent) {
            p.fire = new DoomFire({ width: spec.fire.cols, height: spec.fire.rows, seed: 0x5EED ^ (p.id * 2654435761 >>> 0) });
            p.ignitedAt = t; return p;
        }
    }
    return null;
}

export const isBurning = (patch) => !!(patch.fire && patch.fire.heat() > 0);

/**
 * One tick: the fires step and burn out, spent and expired patches leave, and every car whose chassis centre sits in a burning
 * patch gets a burn event. `cars` is [{ index, pose }]. Returns { events: [{ kind: "burn", car, patch }], removed }.
 */
export function stepSlicks(state, cars, t, spec = state.spec) {
    const events = [], dt = 1 / 60;
    for (const p of state.patches) {
        if (p.fire) {
            if (t - p.ignitedAt >= spec.fire.burn / dt) p.fire.extinguish();
            if ((t - p.ignitedAt) % spec.fire.stepEvery === 0) p.fire.step();
            if (p.fire.heat() === 0 && t - p.ignitedAt > spec.fire.rows * spec.fire.stepEvery) p.spent = true;
        } else if (t - p.born >= spec.life / dt) p.spent = true;
    }
    for (const c of cars) { const p = patchAt(state, c.pose.pos[0], c.pose.pos[2]); if (p && isBurning(p)) events.push({ kind: "burn", car: c.index, patch: p.id, owner: p.owner }); }
    const before = state.patches.length; state.patches = state.patches.filter((p) => !p.spent);
    return { events, removed: before - state.patches.length };
}

/** The base surface with the patches on it: oil cuts the grip, fire is hot road. Same shape as trackSurface(). */
export function slickSurface(base, state, spec = state.spec) {
    return {
        ...base,
        at(x, z) {
            const g = base.at(x, z), p = patchAt(state, x, z);
            if (!p) return g;
            if (isBurning(p)) return { ...g, kind: KIND_FIRE };
            return { ...g, kind: KIND_OIL, grip: g.grip * spec.grip, rolling: g.rolling * spec.rolling };
        },
    };
}

/** Is any of `poses` (other than the owner's) inside one of the owner's unlit patches? The gunner's ignite feature. */
export function someoneOnMyOil(state, owner, poses) {
    for (let i = 0; i < poses.length; i++) { if (i === owner) continue; const p = patchAt(state, poses[i].pos[0], poses[i].pos[2]); if (p && p.owner === owner && !p.fire) return true; }
    return false;
}

/** The burning cells of a patch as world boxes with palette colours: columns across the width, rows along the length from the rear. */
export function fireCells(patch, spec = SLICK) {
    const out = []; if (!patch.fire) return out;
    const f = patch.fire, cw = (2 * patch.half[0]) / f.width, ch = (2 * patch.half[1]) / f.height, cyaw = Math.cos(patch.yaw), syaw = Math.sin(patch.yaw);
    for (let r = 0; r < f.height; r++) for (let c = 0; c < f.width; c++) {
        const v = f.pixels[c + f.width * r]; if (v <= 0) continue;
        const lx = -patch.half[0] + (c + 0.5) * cw, lz = patch.half[1] - (r + 0.5) * ch;   // the source row (r = height - 1) at the rear (-z)
        const x = patch.x + lx * cyaw + lz * syaw, z = patch.z - lx * syaw + lz * cyaw, col = PALETTE[v] || PALETTE[0];
        out.push({ x, y: patch.y + spec.fire.cellY + 0.02 * (v / MAX_INTENSITY), z, w: cw, l: ch, colour: [col[0] / 255, col[1] / 255, col[2] / 255], intensity: v });
    }
    return out;
}

/** The lockstep fold: every patch's id, pose, birth, ignition and heat, and the drop clocks. */
export function slickHash(h, state, fold) {
    h = fold(h, state.patches.length);
    for (const p of state.patches) { h = fold(h, p.id); h = fold(h, Math.round(p.x * 1e3) | 0); h = fold(h, Math.round(p.z * 1e3) | 0); h = fold(h, p.born); h = fold(h, p.ignitedAt == null ? -1 : p.ignitedAt); h = fold(h, p.fire ? p.fire.heat() : 0); }
    return h;
}

/** The front door. */
export function reportLines() {
    const st = createSlicks(), pose = { pos: [0, 1, 0], yaw: 0, quat: [0, 0, 0, 1], vel: [0, 0, 0] };
    const p = dropSlick(st, pose, 0, 0); igniteSlick(st, 0, 0);
    let burningTicks = 0, t = 0; while (isBurning(p) && t < 5000) { stepSlicks(st, [], t); if (isBurning(p)) burningTicks++; t++; }
    return [
        "[slick] the gunner's oil slick and the Doom Fire on it: a patch behind the car, the surface wrapped (oil cuts grip, fire is hot road), an automaton per lit patch",
        `  patch ${SLICK.width} x ${SLICK.length} m, ${SLICK.behind} m behind the chassis; grip x ${SLICK.grip}, rolling x ${SLICK.rolling}; unlit life ${SLICK.life} s, one drop per ${SLICK.dropReloadTicks} ticks, ${SLICK.maxPerCar} per car`,
        `  fire ${SLICK.fire.cols} x ${SLICK.fire.rows} cells stepped every ${SLICK.fire.stepEvery} ticks, the source fed for ${SLICK.fire.burn} s: one patch burns for ${burningTicks} ticks (${(burningTicks / 60).toFixed(2)} s) and is spent`,
        "  a burn event per car per tick with its chassis centre in a burning patch; slickHash folds the patches into the lockstep fingerprint",
    ];
}
