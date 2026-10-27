// WebGLEngine/physics/mechanics/subNeeds.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// NEEDS AND LIMITS FOR THE SUBMARINE (Keith's parked idea, pieces 1 and 2; the design and the pass/fail are in brain/NEEDS_AND_LIMITS.md, written first): ENERGY that only the surface (or a snorkel depth) refills, and a HULL that feels the
// pressure and can be damaged. A LAYER around subModel6dof.stepSub -- the core is not touched, so a vessel with `needs` null is stepped exactly as before and every pilot gate keeps its numbers.
//
//   ENERGY    E joules by class (battery, snorkel, airIndependent, unlimited). Electrical power = hotel load + |thrust x forward speed| / efficiency (so ~ the cube of the speed in steady flight); the charge never goes under 0 or over
//             the capacity; at 0 the screw is dead (the thrust command is forced to 0: the planes and the ballast tank still act, and are not charged for -- said). It refills at `chargeW` while the centre is within `refillDepth` of the
//             surface: a battery hull at the surface itself (0.7 m: the surfacing pilot floats the Explorer's centre at 0.56 m), a snorkel hull at 4 m (EXPOSED there: the reading says so). An air-independent hull has four times the capacity
//             and never refills; `unlimited` neither drains nor needs to.
//   PRESSURE  pressure = rho g depth (a reading). collapseDepth = crushDepth x (1 - 0.5 damage); STRAIN = depth / collapseDepth. Under `yieldFrac` (0.8) depth does no damage; over it damage creeps up (a hull held near its limit wears out).
//             `injure(needs, amount)` adds damage at once -- the CALLER says how much (a grounding, a collision): nothing here decides what hurts. A leak of LEAK_AT_FULL x damage x strain^2 of the weight per second accumulates as flooding
//             (the core's `weightError`: flooded water is weight), capped at FLOOD_MAX. The boat is "crushed" when it is deeper than the collapse depth -- so a damaged hull goes at a depth an undamaged one survives.
// WHAT IT IS NOT: a real boat's numbers (the capacities are TANK-SCALE, minutes not days); no pump to clear a flood, no repair, no hull form (the collapse depth is one number scaled by one scalar); the snorkel's noise is a flag.
// Pure: no DOM, no clock, no Math.random.
"use strict";
import * as S from "./subModel6dof.mjs";
import { worldToBody } from "./rigidBody6dof.mjs";

export const CLASSES = Object.freeze({
    battery: Object.freeze({ capacityJ: 3.0e6, chargeW: 6000, refillDepth: 0.7, exposed: false }),
    snorkel: Object.freeze({ capacityJ: 3.0e6, chargeW: 6000, refillDepth: 4, exposed: true }),
    airIndependent: Object.freeze({ capacityJ: 12.0e6, chargeW: 0, refillDepth: -Infinity, exposed: false }),
    unlimited: Object.freeze({ capacityJ: Infinity, chargeW: 0, refillDepth: -Infinity, exposed: false, free: true }),
});
export const POWER = Object.freeze({ hotelW: 200, efficiency: 0.5 });
export const HULL = Object.freeze({ yieldFrac: 0.8, creepPerS: 0.002, collapseLoss: 0.5, leakAtFull: 0.01, floodMax: 0.15 });
// v4905 -- the four things v4904 left out (brain/NEEDS_AND_LIMITS.md "Round 2", written first). All OPT-IN through stepNeeds' `aux` ({ pump, repair }, each 0..1), tank-scale, said plainly.
export const PUMP = Object.freeze({ rate: 0.01, headDepth: 90, watts: 1500 });            // flood removed, fraction of the weight per second at full and zero head; the pump works against the depth
export const REPAIR = Object.freeze({ rate: 0.004, watts: 800, maxDepth: 1.0, maxSpeed: 0.5 });   // damage removed per second at full, ONLY at the surface and nearly stopped
export const BALLAST_PUMP = Object.freeze({ wPerUnit: 600 });                              // watts per (level unit / second) the tank is moved, on a model whose ballast has dynamics
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v) => (Number.isFinite(v) ? v : 0);

/**
 * A fresh needs state for a class name: { cls, energy (full), damage 0, flood 0 } and, when `crushDepth` is given, `crush` -- THIS hull's undamaged collapse depth (m), instead of the model's (the aquarium's tank is 50 m deep and the Explorer's 100 m
 * crush would never be felt in it: a tank-scale hull says 60). An unknown class, or a crush depth that is not a positive number, throws.
 */
export function initialNeeds(cls, { crushDepth } = {}) {
    if (!Object.prototype.hasOwnProperty.call(CLASSES, cls)) throw new Error(`subNeeds: no class named ${JSON.stringify(cls)} (${Object.keys(CLASSES).join(", ")})`);
    const n = { cls, energy: CLASSES[cls].capacityJ, damage: 0, flood: 0 };
    if (crushDepth !== undefined) { if (!(Number.isFinite(crushDepth) && crushDepth > 0)) throw new Error(`subNeeds: a crush depth is a positive number of metres, got ${crushDepth}`); n.crush = crushDepth; }
    return n;
}

/** The depth at which a hull with `damage` (0..1) collapses, metres. */
export const collapseDepth = (model, damage, crush) => (crush !== undefined ? crush : model.spec.crushDepth) * (1 - HULL.collapseLoss * clamp(num(damage), 0, 1));
/** The strain at `depth` (m, positive down): depth over the collapse depth. */
export const strainOf = (model, depth, damage, crush) => Math.max(0, depth) / collapseDepth(model, damage, crush);
/** Electrical power (W) for a thrust (N) at a forward speed (m/s): the hotel load plus the hydrodynamic power over the efficiency. */
export const power = (thrustN, forward) => POWER.hotelW + Math.abs(thrustN * forward) / POWER.efficiency;
/** Does a class refill at `depth` (centre depth, m, positive down)? { ok, exposed }: exposed only for a class that refills at a mast depth below the surface itself. */
export const refillAt = (cls, depth) => { const c = CLASSES[cls]; return { ok: !!c && c.chargeW > 0 && depth <= c.refillDepth, exposed: !!c && c.exposed && c.chargeW > 0 && depth <= c.refillDepth }; };

/** Add `amount` of damage (0..1 of a hull's life), clamped to [0, 1]; NaN and negative amounts do nothing. Returns a NEW needs. */
export function injure(needs, amount) {
    const a = Number.isFinite(amount) && amount > 0 ? amount : 0;
    return { ...needs, damage: clamp(needs.damage + a, 0, 1) };
}

/** What a pilot or a page can read: the charge, the pressure and the strain, the damage, the flooding, the collapse depth. */
export function readings(model, needs, state) {
    const depth = -state.pos[2], c = CLASSES[needs.cls], cap = c.capacityJ, r = refillAt(needs.cls, depth), cd = collapseDepth(model, needs.damage, needs.crush);
    return { cls: needs.cls, energy: needs.energy, capacity: cap, frac: cap === Infinity ? 1 : needs.energy / cap, depth, pressure: S.WATER_DENSITY * S.GRAVITY * Math.max(0, depth), strain: depth > 0 ? depth / cd : 0, damage: needs.damage, flood: needs.flood, exposedS: needs.exposedS || 0, collapseDepth: cd, canRefill: r.ok, exposed: r.exposed, refills: c.chargeW > 0, refillDepth: c.refillDepth };
}

/**
 * One tick with needs: the same as S.stepSub plus the advanced `needs` and { watts, charging, exposed, thrustApplied }. `needs` null is S.stepSub unchanged (with `needs: null`). `extraWeight` is any weight the caller adds on top of the
 * leak (a flood event). A dead screw (energy 0 on a class that has a limit) has the thrust command forced to 0 BEFORE the step. `aux` ({ pump, repair }, 0..1, optional) works the flood pump and the repair (see PUMP, REPAIR); on a tank with dynamics the pump's draw is charged and a boat with no charge cannot work the normal pump.
 */
// a boat with no charge cannot work the normal pump: the same model with the pump rate at 0 (the emergency blow is stored air and keeps its own rate). One per model, built once.
const FROZEN = new WeakMap();
const frozenPump = (model) => { let m = FROZEN.get(model); if (!m) { m = S.createSubModel({ ...model.spec, tankRate: 0 }); FROZEN.set(model, m); } return m; };

export function stepNeeds(model, state, needs, controls, dt = S.DT, current = [0, 0, 0], extraWeight = 0, aux = null) {
    if (!needs) return { ...S.stepSub(model, state, controls, dt, current, extraWeight), needs: null };
    const c = CLASSES[needs.cls], limited = !c.free, dead = limited && needs.energy <= 0, san = S.sanitize(controls);
    const cmd = dead ? { ...san, thrust: 0 } : san;
    const frac = S.submerged(model, state.pos[2]), s = model.spec;
    const thrustN = s.thrustMax * (cmd.thrust >= 0 ? cmd.thrust : cmd.thrust * s.reverseFraction) * frac;
    const rel = [state.vel[0] - current[0], state.vel[1] - current[1], state.vel[2] - current[2]], forward = worldToBody(state.q, rel)[0];
    const pumpC = aux ? clamp(num(aux.pump), 0, 1) : 0, repC = aux ? clamp(num(aux.repair), 0, 1) : 0, pumpOn = pumpC > 0 && !dead;
    const atSurface = -state.pos[2] <= REPAIR.maxDepth && Math.hypot(state.vel[0], state.vel[1], state.vel[2]) <= REPAIR.maxSpeed, repairOn = repC > 0 && !dead && atSurface;
    const tankLive = S.hasTank(model) && S.dynamicTank(model);
    let watts = power(thrustN, forward) + (pumpOn ? PUMP.watts * pumpC : 0) + (repairOn ? REPAIR.watts * repC : 0);
    const res = S.stepSub(dead && tankLive ? frozenPump(model) : model, state, cmd, dt, current, extraWeight + needs.flood);
    if (tankLive && state.tank && res.state.tank) watts += BALLAST_PUMP.wPerUnit * Math.abs(res.state.tank.level - state.tank.level) / dt;
    const depthNow = -res.state.pos[2], r = refillAt(needs.cls, depthNow);
    let energy = needs.energy;
    if (limited) energy = clamp(energy + ((r.ok ? c.chargeW : 0) - watts) * dt, 0, c.capacityJ);
    // the hull: strain at the depth the vessel has reached, the damage that depth does, the leak that damage lets in
    const strain = strainOf(model, depthNow, needs.damage, needs.crush);
    const damage = clamp(needs.damage + (strain > HULL.yieldFrac ? HULL.creepPerS * (strain - HULL.yieldFrac) / (1 - HULL.yieldFrac) * dt : 0) - (repairOn ? REPAIR.rate * repC * dt : 0), 0, 1);
    const flood = Math.max(0, Math.min(HULL.floodMax, needs.flood + HULL.leakAtFull * needs.damage * strain * strain * dt) - (pumpOn ? PUMP.rate * clamp(1 - depthNow / PUMP.headDepth, 0, 1) * pumpC * dt : 0));
    const next = { ...needs, energy, damage, flood, exposedS: (needs.exposedS || 0) + (r.exposed ? dt : 0) };
    if (res.status === "submerged" && depthNow > collapseDepth(model, damage, needs.crush)) return { ...res, status: "crushed", depth: depthNow, needs: next, watts, charging: r.ok, exposed: r.exposed, thrustApplied: thrustN };
    return { ...res, needs: next, watts, charging: r.ok, exposed: r.exposed, thrustApplied: thrustN };
}
