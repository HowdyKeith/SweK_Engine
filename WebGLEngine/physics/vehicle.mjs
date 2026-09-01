// physics/vehicle.mjs -- v4217 -- the raycast vehicle: wheels as rays, not as bodies.
//
// *** MEASURED BEFORE BUILDING: physics/ CONTAINED NO VEHICLE MODEL AT ALL. *** Zero matches for wheel,
// suspension or raycastVehicle. Keith: "the wheel-and-suspension model against the existing box3d/Jolt
// substrate would be cool ... we have turrets and hard points. and some treads." All three of those are real
// and all three are at different depths, which is what this file is built against:
//   * TURRETS ARE GAME LOGIC. ui/OgreBuyPanel.js has turret SLOTS taking machinegun / missile / railgun /
//     napalm / minelayer / landmine / subturret -- OGRE's hardpoints as inventory, never as mounted mass.
//   * TREADS ARE A TEXTURE THAT ROTATES. render/entityVisuals.js rolls ogre_tread about Z. Nothing physical.
//   * AND THERE WAS NO CHASSIS UNDER EITHER OF THEM.
//
// ---- WHY RAYS AND NOT BODIES, WHICH IS THE WHOLE DESIGN --------------------------------------------------
// The intuitive model is five rigid bodies: a chassis and four wheels, joined by constraints. *** IT IS ALSO
// WHY TOY CAR PHYSICS JITTERS. *** A constraint solver has to reconcile the wheel's contact with the ground
// AND its joint to the chassis every step, at a mass ratio of maybe 50:1, and small errors in each feed the
// other. The standard answer -- Jolt's own VehicleConstraint works this way, and so does every driving game
// that feels solid -- is that THE VEHICLE IS ONE RIGID BODY. Wheels are not simulated. Each is a downward RAY
// from an attachment point, and what the ray finds becomes a force applied to the single chassis body.
//
// So this module produces FORCES for a caller to apply to one box3d/Jolt body. It never creates a body, never
// imports a loader, and holds no world -- the same discipline physics/esBox3d.js states for itself ("Wraps a
// box3d WORLD HANDLE (never imports the loader) so it runs headless against a mock"). Everything here is
// arithmetic, which is what lets the traps below be measured in node rather than felt in a demo.
//
// ---- THE DAMPING RATIO IS IMPORTED, NOT REWRITTEN -----------------------------------------------------------
// ui/springMotion.js (v4114) already integrates a spring and already computes zeta = c / (2*sqrt(k*m)). A
// suspension IS a spring, so it uses that function rather than carrying a second copy of the formula -- the
// rule v4192 wrote down as "One Ashima simplex noise, not three copies of it". The import direction is
// admittedly odd (physics reaching into ui) and there is no precedent for it in this tree; the alternative was
// a duplicate constant, and a duplicate constant is the defect this project keeps paying for.
import { dampingRatio } from "../ui/springMotion.js";

export { dampingRatio };

/** A wheel, in the chassis's local frame. `attach` is where the suspension is bolted to the body. */
export function wheel({ attach = [0, 0, 0], radius = 0.35, restLength = 0.35, maxTravel = 0.25,
                        stiffness = 45000, damping = 4500, steerable = false, driven = true,
                        grip = 1.6, maxSteer = 0.6 } = {}) {
    return Object.freeze({ attach, radius, restLength, maxTravel, stiffness, damping, steerable, driven, grip, maxSteer });
}

/**
 * *** HOW FAR THE RAY MUST REACH, AND THE BUG THAT HIDES HERE. ***
 *
 * The ray starts at the attachment point and must reach the ground when the suspension is at FULL DROOP --
 * rest length plus its remaining travel -- and then a further wheel RADIUS, because the ray is looking for
 * the ground and the wheel touches it at its bottom, not at its hub.
 *
 * Cast only `restLength` and the vehicle hovers: at rest the ray ends exactly at the hub, finds nothing under
 * it, every wheel reports airborne, no suspension force is produced and the car falls through the world while
 * every individual formula in the file is correct. It is a one-term omission that produces total failure with
 * no error anywhere, which is why it has its own function and its own assertions.
 */
export function castLength(w) { return w.restLength + w.maxTravel + w.radius; }

/**
 * What the suspension does with a ray hit.
 *
 * @param hitDistance  distance from the attachment point to the ground, or null/Infinity for no hit
 * @param wheelVel     speed of the attachment point along the ray direction, positive = compressing
 * @returns { grounded, compression, force, bottomedOut, contactDepth }
 *
 * `force` is along the ray's opposite direction (pushing the chassis up). It is CLAMPED AT ZERO because a
 * suspension pushes and does not pull: without that clamp a fast-extending damper produces a NEGATIVE force
 * that sucks the car onto the ground, which is a spectacular and entirely silent way to make a vehicle
 * undriveable over a bump.
 */
export function suspensionAt(hitDistance, w, wheelVel = 0) {
    const max = castLength(w);
    if (hitDistance == null || !(hitDistance <= max)) {
        return { grounded: false, compression: 0, force: 0, bottomedOut: false, contactDepth: 0 };
    }
    // Where the wheel's hub sits relative to its rest position.
    const hub = hitDistance - w.radius;
    const compression = Math.max(0, (w.restLength + w.maxTravel) - hub - w.maxTravel);
    const travelUsed = (w.restLength + w.maxTravel) - hub;
    const bottomedOut = travelUsed >= (w.restLength + w.maxTravel) - 1e-9;
    const raw = w.stiffness * compression + w.damping * wheelVel;
    return {
        grounded: true,
        compression,
        force: Math.max(0, raw),          // a suspension pushes; it never pulls the chassis down
        bottomedOut,
        contactDepth: Math.max(0, w.restLength - hub),
    };
}

/** The suspension's damping ratio -- 1 is critical. Uses ui/springMotion.js's formula, not a second copy. */
export function suspensionZeta(w, sprungMass) {
    return dampingRatio({ stiffness: w.stiffness, damping: w.damping, mass: sprungMass });
}

/** The damping that makes this corner critically damped. c = 2*sqrt(k*m). */
export function criticalDamping(w, sprungMass) { return 2 * Math.sqrt(w.stiffness * sprungMass); }

/**
 * *** GRIP IS PROPORTIONAL TO LOAD, AND THIS IS THE LINE THAT MAKES A CAR BEHAVE LIKE A CAR. ***
 *
 * The friction a tyre can produce is limited by mu times the NORMAL FORCE -- which for a raycast vehicle is
 * exactly the suspension force computed above. A wheel in the air carries no load and therefore has NO GRIP.
 *
 * Give every wheel a constant friction instead, which is the obvious simplification, and the vehicle drives
 * on air: it steers and accelerates with a wheel over a crest, corners as though weight never transferred,
 * and nothing anywhere reports a problem. Load-dependence is not realism polish; it is the difference between
 * a vehicle and a sliding box.
 */
export function frictionLimit(normalForce, grip) { return Math.max(0, normalForce) * Math.max(0, grip); }

/**
 * Tyre forces in the wheel's own frame, clamped to the FRICTION CIRCLE.
 *
 * The circle, not two independent limits: a tyre has one contact patch and a total force budget. Braking hard
 * while turning hard must lose you the turn, and it only does if longitudinal and lateral share one limit.
 * Clamping each axis separately lets a car brake and corner at full strength simultaneously -- which is
 * exactly the arcade feel people then try to fix with tuning rather than with the missing constraint.
 */
export function tyreForces({ driveForce = 0, lateralSlipVel = 0, longSlipVel = 0, normalForce = 0, grip = 1.6,
                             lateralStiffness = 8000, longStiffness = 6000 } = {}) {
    const limit = frictionLimit(normalForce, grip);
    // Slip velocities generate restoring forces; the signs oppose the slip.
    let lateral = -lateralSlipVel * lateralStiffness;
    let long = driveForce - longSlipVel * longStiffness;
    const mag = Math.hypot(lateral, long);
    let clamped = false;
    if (mag > limit && mag > 0) {
        const k = limit / mag;
        lateral *= k; long *= k; clamped = true;
    }
    return { lateral, long, limit, magnitude: Math.min(mag, limit), saturated: clamped };
}

/**
 * *** WHY A TURRET ON THE ROOF MAKES A TANK ROLL, AS A NUMBER. ***
 *
 * Keith's "we have turrets and hard points" is the interesting extension, and the physics of it is not that a
 * roof mount is heavy -- it is that it is HIGH. Lateral load transfer during a corner is
 *
 *     dW = m * a * h / trackWidth
 *
 * so the weight moved from the inside wheels to the outside ones is proportional to the height of the centre
 * of gravity. Double the CoG height and you double the transfer for the same corner. When dW reaches half the
 * vehicle's weight the inside wheels carry nothing, their normal force is zero, and by frictionLimit above
 * their grip is zero too -- which is the moment before a roll.
 *
 * Returns the transfer and the resulting per-side load, so "this loadout tips over" is a computed fact about
 * a build rather than something discovered by driving it.
 */
export function lateralLoadTransfer({ mass, lateralAccel, cogHeight, trackWidth, gravity = 9.81 }) {
    if (!(trackWidth > 0)) return { transfer: 0, inner: 0, outer: 0, liftsInner: false };
    const weight = mass * gravity;
    const transfer = (mass * lateralAccel * cogHeight) / trackWidth;
    const inner = weight / 2 - transfer;
    const outer = weight / 2 + transfer;
    return { transfer, inner: Math.max(0, inner), outer, liftsInner: inner <= 0, weight };
}

/**
 * The most lateral acceleration the tyres can actually deliver: mu * N / m.
 * With N taken from the suspension, a vehicle with wheels in the air can deliver LESS -- which is the whole
 * reason grip is load-dependent two functions up.
 */
export function maxLateralAccel(normalForce, mass, grip) {
    if (!(mass > 0)) return 0;
    return frictionLimit(normalForce, grip) / mass;
}

/**
 * *** DOES THIS VEHICLE ROLL, OR SLIDE FIRST? IT IS A COMPARISON BETWEEN TWO ACCELERATIONS, AND IT IS THE
 * ANSWER TO KEITH'S TURRET QUESTION. ***
 *
 * A vehicle can only tip if its tyres can generate MORE lateral acceleration than the tip threshold needs.
 * Otherwise the tyres saturate first, it slides wide, and it never gets near rolling -- which is why an
 * ordinary car understeers into a hedge instead of going over.
 *
 *     tyres can deliver   mu * g          (on a level surface, at full load)
 *     tipping needs       g * track / (2h)
 *     so it ROLLS when    mu > track / (2h)
 *
 * Note what drops out: g cancels. Rolling over is a question of GEOMETRY AND GRIP, not of weight or speed --
 * a heavier turret does not tip a vehicle, a HIGHER one does, and better tyres make it worse rather than
 * safer. MEASURED for this tree's default car: mu 1.6 against track/(2h) = 1.6/1.04 = 1.54, so it just barely
 * rolls; add a 300 kg turret at 2.1 m and the CoG rises to 0.84 m, the ratio falls to 0.95, and it rolls
 * easily.
 *
 * *** THIS FUNCTION EXISTS BECAUSE brain/rl/driveEnv.js's FIRST DRAFT GOT IT BACKWARDS. *** It set the yaw
 * rate from steering geometry alone, so lateral acceleration was unbounded by grip and the car rolled 8 times
 * in 24 episodes at speeds where a real one would simply have slid. A vehicle that rolls instead of sliding
 * is not a harder driving task -- it is a different and wrong one, and a policy trained against it learns to
 * fear corners rather than to take them.
 */
export function rollsBeforeSliding({ grip, trackWidth, cogHeight }) {
    if (!(cogHeight > 0) || !(trackWidth > 0)) return { rolls: false, gripRatio: 0, tipRatio: Infinity };
    const tipRatio = trackWidth / (2 * cogHeight);
    return { rolls: grip > tipRatio, gripRatio: grip, tipRatio, margin: grip - tipRatio };
}

/**
 * The combined centre of gravity of a chassis plus its mounted hardpoints.
 * A turret is a mass at a position; this is the weighted mean, and it is what feeds cogHeight above.
 */
export function combinedCoG(chassis, mounts = []) {
    let m = chassis.mass;
    let x = chassis.cog[0] * m, y = chassis.cog[1] * m, z = chassis.cog[2] * m;
    for (const p of mounts) {
        const pm = p.mass || 0;
        m += pm; x += p.at[0] * pm; y += p.at[1] * pm; z += p.at[2] * pm;
    }
    if (!(m > 0)) return { mass: 0, cog: chassis.cog.slice() };
    return { mass: m, cog: [x / m, y / m, z / m] };
}

/**
 * Static load on each wheel from the CoG's HORIZONTAL position -- a lever-arm split, not an equal share.
 * A rear-mounted turret genuinely puts more weight on the rear wheels, and a model that divides the mass
 * evenly cannot express that at all.
 */
export function staticLoads(wheels, cog, mass, gravity = 9.81) {
    const weight = mass * gravity;
    // Weight by inverse distance along the longitudinal axis from the CoG to each axle group.
    const zs = wheels.map((w) => w.attach[2]);
    const front = zs.filter((z) => z > cog[2]), rear = zs.filter((z) => z <= cog[2]);
    if (!front.length || !rear.length) return wheels.map(() => weight / wheels.length);
    const zf = front.reduce((a, b) => a + b, 0) / front.length;
    const zr = rear.reduce((a, b) => a + b, 0) / rear.length;
    const span = zf - zr;
    if (!(Math.abs(span) > 1e-9)) return wheels.map(() => weight / wheels.length);
    const rearShare = (zf - cog[2]) / span;              // CoG nearer the front -> more load on the front
    const frontShare = 1 - rearShare;
    return wheels.map((w) => {
        const isFront = w.attach[2] > cog[2];
        const group = isFront ? front.length : rear.length;
        return weight * (isFront ? frontShare : rearShare) / group;
    });
}

/**
 * *** DIFFERENTIAL (TREAD) STEERING, WHICH IS A DIFFERENT VEHICLE, NOT A SETTING. ***
 *
 * An Ackermann car turns because its front wheels POINT somewhere. A tracked vehicle has no steered wheel at
 * all: it turns because the two sides run at different speeds, and its yaw rate is
 *
 *     omega = (vRight - vLeft) / trackWidth
 *
 * which means it can turn on the spot at zero forward speed -- something no steering angle can ever produce.
 * Modelling treads as "wheels that steer a bit" gets a vehicle that cannot do the one thing treads are for.
 */
export function differentialDrive(leftSpeed, rightSpeed, trackWidth) {
    if (!(trackWidth > 0)) return { forward: 0, yawRate: 0, pivot: false };
    const forward = (leftSpeed + rightSpeed) / 2;
    const yawRate = (rightSpeed - leftSpeed) / trackWidth;
    return { forward, yawRate, pivot: Math.abs(forward) < 1e-9 && Math.abs(yawRate) > 1e-9 };
}

/** Steering angle for a steerable wheel, clamped to its lock. Non-steerable wheels never turn. */
export function steerAngle(w, input) {
    if (!w.steerable) return 0;
    return Math.max(-w.maxSteer, Math.min(w.maxSteer, input * w.maxSteer));
}

/**
 * One step over all wheels: ray results in, chassis force and torque out.
 *
 * @param hits  per-wheel { distance, wheelVel } from the caller's raycasts against its own world
 * @returns { totalUp, perWheel[], groundedCount, airborne }
 *
 * Returns FORCES, and applying them is the caller's job -- so this runs identically against box3d, Jolt or a
 * mock, which is what lets the gate drive it with no world at all.
 */
export function stepSuspension(wheels, hits, opts = {}) {
    const perWheel = wheels.map((w, i) => {
        const h = hits[i] || {};
        const s = suspensionAt(h.distance ?? null, w, h.wheelVel ?? 0);
        return { wheel: w, ...s, grip: frictionLimit(s.force, w.grip) };
    });
    const totalUp = perWheel.reduce((a, p) => a + p.force, 0);
    const groundedCount = perWheel.filter((p) => p.grounded).length;
    return { perWheel, totalUp, groundedCount, airborne: groundedCount === 0 };
}

export default {
    wheel, castLength, suspensionAt, suspensionZeta, criticalDamping, frictionLimit, tyreForces,
    lateralLoadTransfer, combinedCoG, staticLoads, differentialDrive, steerAngle, stepSuspension, dampingRatio,
    maxLateralAccel, rollsBeforeSliding,
};
