// brain/rl/driveEnv.js -- v4218 -- a DRIVING environment for the GPU Brain, on the real vehicle model.
//
// Same drop-in interface as rocketEnv and dockEnv (obsDim / actDim / reset / step), so brain/rl/dockPolicy.js's
// trainDockES drives it unchanged -- that trainer already takes an envFactory and an obsDim, which is the whole
// point of the shared interface and the reason no second trainer exists here.
//
// *** KEITH ASKED WHETHER THE BRAIN MIGHT ALREADY BE LEARNING TO DRIVE FROM BZFLAG. IT IS NOT, AND THE REASON
// IS WORTH RECORDING. *** brain/bzTacticsPolicy.js learns TARGET SELECTION: its features are
// [1, near, ahead, exposed, airborne] and its own header says what trains it -- "the pilot died (the target it
// chose over the runner-up was the wrong one), or the target died (it was the right one)". Even `ahead` is the
// TARGET's bearing, not a steering command. Nothing in it has ever emitted a throttle. What DID exist was the
// machinery -- rocketEnv, dockEnv, bptt, imitation, sharedEncoder -- and nothing with wheels to point it at.
// v4217 built the wheels; this is the environment that connects them.
//
// The dynamics are physics/vehicle.mjs: one rigid body, wheels as rays, grip proportional to load, forces
// clamped to the friction circle. NOT a reimplementation -- a driving env with its own private car physics
// would be learning to drive something that does not exist anywhere else in the tree.
//
// ---- obs (8 floats, VEHICLE FRAME, normalised) -------------------------------------------------------------
//   [ relForward, relRight, velForward, velRight, yawRate, slip, grounded, dist ]
//
// Vehicle frame for the same reason dockEnv uses ship frame: heading becomes implicit and the policy
// generalises across approach angles instead of memorising a compass.
//
// *** slip AND grounded ARE IN THE OBSERVATION ON PURPOSE, AND LEAVING THEM OUT IS THE SUBTLE FAILURE. *** A
// policy that cannot see whether its tyres are sliding cannot learn not to slide: two states that differ ONLY
// in whether the car is gripping produce an identical observation, so no policy over that observation can
// respond differently to them. It does not train badly -- it trains to a ceiling, and the ceiling looks like a
// hyperparameter problem. The gate asserts the two states are distinguishable.
//
// ---- action (2 floats in [-1,1]) ----------------------------------------------------------------------------
//   [ steer, throttle ]   throttle > 0 drives, throttle < 0 brakes.
"use strict";
import { wheel, suspensionAt, frictionLimit, tyreForces, lateralLoadTransfer, combinedCoG, staticLoads,
         maxLateralAccel, rollsBeforeSliding } from "../../physics/vehicle.mjs";

const OBS_DIM = 8, ACT_DIM = 2;
const S = 120;        // position scale (m)
const V = 30;         // velocity scale (m/s)
const GOAL_R = 6;     // arrived if within this...
const GOAL_V = 4;     // ...AND below this speed. See the note on the reward.

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/**
 * A modest ROAD car: 1200 kg, 2.6 m wheelbase, 1.6 m track, CoG at 0.52 m.
 *
 * *** THE GRIP IS 0.9, NOT physics/vehicle.mjs's DEFAULT 1.6, AND THAT ONE NUMBER DECIDES WHETHER THIS IS A
 * DRIVING TASK OR A TRAP. *** 1.6 is racing-slick grip. Against this geometry the tip ratio is
 * track/(2h) = 1.538, so by rollsBeforeSliding a car with mu 1.6 has a margin of 0.06 -- it rolls the instant
 * it corners at the limit, whatever the driver does. MEASURED: the first version of this env rolled 7 of 24
 * episodes under two completely different drivers, which is the tell that it was the CAR and not the driving.
 * A road tyre at mu 0.9 slides wide instead, which is what a road car does, and leaves rolling as something a
 * LOADOUT causes rather than something the vehicle does by existing.
 */
export function defaultCar() {
    const wb = 1.3, tr = 0.8, mu = 0.9;
    return {
        mass: 1200, cogHeight: 0.52, trackWidth: tr * 2, wheelbase: wb * 2,
        maxDrive: 6000, maxBrake: 9000, maxSteer: 0.55, yawInertia: 1600,
        wheels: [
            wheel({ attach: [-tr, -0.2,  wb], steerable: true,  grip: mu }),
            wheel({ attach: [ tr, -0.2,  wb], steerable: true,  grip: mu }),
            wheel({ attach: [-tr, -0.2, -wb], steerable: false, grip: mu }),
            wheel({ attach: [ tr, -0.2, -wb], steerable: false, grip: mu }),
        ],
    };
}

/** A turret heavy enough and high enough to move the vehicle across the roll threshold. See the gate. */
export const ROOF_TURRET = Object.freeze([{ mass: 400, at: [0, 2.4, 0] }]);

export class DriveEnv {
    /**
     * @param opts.mounts  hardpoint masses, e.g. [{mass:300, at:[0,2.1,0]}] for a roof turret. They move the
     *                     combined CoG through physics/vehicle.mjs's combinedCoG, which is how a loadout
     *                     changes what the policy has to learn rather than just what it looks like.
     */
    constructor(opts = {}) {
        this.obsDim = OBS_DIM; this.actDim = ACT_DIM;
        this.maxSteps = opts.maxSteps || 300;
        this.dt = opts.dt || 1 / 30;
        this.car = opts.car || defaultCar();
        this.mounts = opts.mounts || [];
        // *** ARRIVAL REQUIRES BEING SLOW, AND THAT IS NOT A DETAIL. *** See step()'s reward note.
        this.requireSlow = opts.requireSlow !== false;
        this.endOnRoll = opts.endOnRoll !== false;
        // The roughness of the ground. Non-zero means wheels genuinely leave it, which is what makes
        // load-dependent grip matter rather than being a formality.
        this.bumpiness = opts.bumpiness ?? 0.12;
        const cg = combinedCoG({ mass: this.car.mass, cog: [0, this.car.cogHeight, 0] }, this.mounts);
        this.mass = cg.mass; this.cog = cg.cog;
        // Whether this loadout can roll at all is a property of geometry and grip, not of driving -- so it is
        // settled once, here, and the step loop only asks whether the corner was hard enough.
        this.rollability = rollsBeforeSliding({
            grip: this.car.wheels[0].grip, trackWidth: this.car.trackWidth, cogHeight: this.cog[1] });
        this._canRoll = this.rollability.rolls;
        this.reset(opts.seed || 1);
    }

    /** Ground height under a point -- gentle rolling terrain, deterministic in the episode seed. */
    _ground(x, z) {
        if (!this.bumpiness) return 0;
        return this.bumpiness * (Math.sin(x * 0.13 + this._phase) + Math.cos(z * 0.11 - this._phase * 0.7));
    }

    /**
     * The chassis height at which the suspension exactly carries the car -- rest length less the static
     * compression, plus the wheel radius, above the ground under the wheels.
     */
    _settledHeight() {
        const w = this.car.wheels, loads = staticLoads(w, this.cog, this.mass);
        let sum = 0;
        for (let i = 0; i < w.length; i++) {
            const [wx, , wz] = this._wheelWorld(w[i]);
            sum += this._ground(wx, wz) + w[i].radius + w[i].restLength - loads[i] / w[i].stiffness;
        }
        return sum / w.length;
    }

    /**
     * A wheel's attachment point in world space. attach is [right, up, forward] in the car's own frame, so
     * this reads its axes from _axes() like everything else -- the first version rotated by hand and put the
     * TRACK offset along the forward axis, which is the same two-copies-of-the-heading mistake that drove
     * the car away from the goal, caught here by this round's own gate.
     */
    _wheelWorld(w) {
        const { fx, fz, rx, rz } = this._axes();
        return [this.x + rx * w.attach[0] + fx * w.attach[2], 0, this.z + rz * w.attach[0] + fz * w.attach[2]];
    }

    reset(seed = 1) {
        const r = mulberry32(seed >>> 0);
        this._phase = r() * 6.283;
        this.t = 0;
        this.x = 0; this.z = 0; this.heading = (r() * 2 - 1) * Math.PI;
        this.vx = 0; this.vz = 0; this.yawRate = 0;
        const ang = r() * 6.283, rad = 40 + r() * 60;
        this.gx = Math.cos(ang) * rad; this.gz = Math.sin(ang) * rad;
        // *** THE CHASSIS HAS A HEIGHT, AND IT HAD TO. *** See step()'s heave note. Start it settled: the
        // hub sits one static compression below rest, on the ground under the car.
        this.y = this._settledHeight();
        this.vy = 0;
        this.rolled = false; this.arrived = false;
        this._prevDist = Math.hypot(this.gx - this.x, this.gz - this.z);
        // *** THE OBSERVATION IS BUILT HERE, SO EVERY FIELD IT READS MUST EXIST HERE. *** _slip and
        // _grounded are computed in step(), and leaving them unset made reset()'s Float32Array carry two
        // NaNs -- which the first act() spread through the whole MLP, so every learned rollout returned
        // NaN while the hand expert (which reads neither slot) scored normally. A stationary car on flat
        // ground is gripping and has all four wheels down, so those are the honest values.
        this._slip = 0; this._grounded = 1;
        return this._obs();
    }

    /**
     * The vehicle's own axes in world space.
     *
     * *** ONE FUNCTION, BECAUSE HAVING TWO WAS A REAL BUG. *** The first draft rotated the observation by
     * -heading while the integrator pushed velocity along (cos h, -sin h). Those differ in the SIGN OF THE Z
     * TERM, so the policy saw a goal that was not where the car would actually go if it drove at it.
     * MEASURED: the stock car finished its episodes 393 metres from the goal, having driven steadily away
     * from it, and every individual formula was defensible on its own. Both the observation and the
     * integration now read their axes from here, so they cannot disagree again.
     */
    _axes() {
        const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
        return { fx: ch, fz: -sh, rx: sh, rz: ch };
    }

    _obs() {
        const { fx, fz, rx, rz } = this._axes();
        const dx = this.gx - this.x, dz = this.gz - this.z;
        const relF = dx * fx + dz * fz, relR = dx * rx + dz * rz;
        const vF = this.vx * fx + this.vz * fz, vR = this.vx * rx + this.vz * rz;
        const dist = Math.hypot(dx, dz);
        return new Float32Array([
            relF / S, relR / S, vF / V, vR / V,
            this.yawRate / 3,
            this._slip,            // 0 gripping, 1 fully saturated -- see the header
            this._grounded,        // fraction of wheels on the ground
            Math.min(1, dist / S),
        ]);
    }

    step(action) {
        const car = this.car, dt = this.dt;
        const steer = Math.max(-1, Math.min(1, action[0])) * car.maxSteer;
        const thr = Math.max(-1, Math.min(1, action[1]));

        const speed = Math.hypot(this.vx, this.vz);
        const { fx, fz, rx, rz } = this._axes();     // the SAME axes the observation uses
        const vF = this.vx * fx + this.vz * fz;      // forward speed in the vehicle frame
        const vR = this.vx * rx + this.vz * rz;      // lateral -- this IS the slip velocity

        // --- suspension: ray per wheel against the ground under it -------------------------------------------
        // *** THE CHASSIS FALLS. *** The first draft cast every wheel ray from a FIXED ride height, so the
        // car could not follow the ground: wherever the terrain dipped, the suspension simply extended and
        // the load went with it. MEASURED, at rest on a 0.15 m dip: all four wheels reporting contact and
        // carrying 0 N of an 11,772 N car -- so frictionLimit was 0, every tyre force clamped to nothing,
        // and the car sat still at full throttle with slip pinned at 1 for the whole episode. That was 7 of
        // 16 expert episodes, and it read as a driving failure rather than as a car that had never been put
        // down on the road. One vertical degree of freedom fixes it, and it is the cheap one: heave only,
        // integrated from the suspension forces the model already computes. Pitch and roll stay out --
        // lateralLoadTransfer covers the load shift that actually matters here.
        let grounded = 0, totalLoad = 0;
        const perWheel = car.wheels.map((w) => {
            const [wx, , wz] = this._wheelWorld(w);
            // Ray from the attachment point straight down to the ground under it. The chassis moving down is
            // the suspension compressing, which is why the damping term takes -vy.
            const sus = suspensionAt(this.y - this._ground(wx, wz), w, -this.vy);
            if (sus.grounded) { grounded++; totalLoad += sus.force; }
            return sus;
        });
        this._grounded = grounded / car.wheels.length;
        // Heave: what the springs push up with, less what the car weighs.
        this.vy += (totalLoad / this.mass - 9.81) * dt;
        this.y += this.vy * dt;

        // --- *** THE YAW RATE IS LIMITED BY THE GRIP THAT EXISTS, NOT BY THE STEERING GEOMETRY. ***
        // The first draft of this file set yawRate straight from tan(steer), so the implied lateral
        // acceleration was unbounded and the car ROLLED 8 TIMES IN 24 EPISODES at speeds where a real one
        // would simply have slid wide. A vehicle that rolls instead of sliding is not a harder driving task,
        // it is a different and wrong one, and a policy trained on it learns to fear corners.
        // physics/vehicle.mjs's maxLateralAccel is mu*N/m, so wheels in the air genuinely reduce it.
        const aLatMax = maxLateralAccel(totalLoad, this.mass, car.wheels[0].grip);
        const wantYaw = (vF / Math.max(1, car.wheelbase)) * Math.tan(steer);
        const yawCap = Math.abs(vF) > 0.1 ? aLatMax / Math.abs(vF) : Infinity;
        const cappedYaw = Math.max(-yawCap, Math.min(yawCap, wantYaw));
        // Understeer: asking for more yaw than the tyres can hold IS the slide, and it must be visible.
        const understeer = Math.abs(wantYaw) > 1e-9 ? 1 - Math.abs(cappedYaw) / Math.abs(wantYaw) : 0;

        // --- lateral load transfer: the corner that lifts the inside wheels ----------------------------------
        const lateralAccel = Math.abs(cappedYaw * vF);
        const lt = lateralLoadTransfer({ mass: this.mass, lateralAccel, cogHeight: this.cog[1], trackWidth: car.trackWidth });
        // *** THE ENV DEFERS TO THE MODEL ON WHETHER THIS VEHICLE CAN ROLL AT ALL. *** An earlier draft
        // decided per-step from the instantaneous suspension load, and a bump SPIKES that load -- 0.24 m of
        // extra compression is 10.8 kN per wheel -- which inflated the available grip for one frame and
        // tipped a car that rollsBeforeSliding says slides. MEASURED: 6 rolls in 24 episodes on a vehicle
        // whose geometry forbids it. Comparing a transient against a static threshold was the error; the
        // static question ("can this vehicle out-grip its own tip ratio") has a static answer.
        if (this._canRoll && lt.liftsInner && lateralAccel > 0.5) this.rolled = true;

        // --- tyre forces, clamped to the friction circle ------------------------------------------------------
        const driveForce = thr >= 0 ? thr * car.maxDrive : thr * car.maxBrake;
        const normalPerWheel = grounded > 0 ? totalLoad / grounded : 0;
        const tf = tyreForces({
            driveForce, lateralSlipVel: vR, longSlipVel: 0,
            normalForce: normalPerWheel * grounded, grip: car.wheels[0].grip,
        });
        // Slip is BOTH kinds of losing the road: a saturated contact patch, and asking for more turn than the
        // tyres can hold. Reporting only the first would leave a car that is understeering wide looking, to
        // the policy, exactly like one that is gripping.
        this._slip = Math.min(1, Math.max(understeer, tf.saturated ? 1 : 0));

        // --- integrate ------------------------------------------------------------------------------------
        const aF = tf.long / this.mass, aR = tf.lateral / this.mass;
        // Back into world axes.
        this.vx += (aF * fx + aR * rx) * dt;
        this.vz += (aF * fz + aR * rz) * dt;
        // Yaw from the steered wheels, and ONLY while they have grip -- steering a sliding car does nothing,
        // which is the behaviour the friction circle exists to produce.
        this.yawRate = grounded > 0 ? cappedYaw : this.yawRate * 0.98;   // airborne: no steering, only inertia
        // *** THE SIGN, DETERMINED BY DRIVING THE CAR RATHER THAN BY REASONING ABOUT IT. *** With forward
        // (cos h, -sin h) and right (sin h, cos h), INCREASING h rotates forward toward MINUS right -- so a
        // positive steer with `heading += yaw` turned left, away from a goal on the right. Caught by a
        // three-line experiment (heading 0, goal at +z, hold full right lock, see which way z goes) after two
        // rounds of my reasoning about the same trigonometry produced two different confident answers.
        this.heading -= this.yawRate * dt;
        this.x += this.vx * dt; this.z += this.vz * dt;
        this.t++;

        // --- reward -------------------------------------------------------------------------------------------
        const dist = Math.hypot(this.gx - this.x, this.gz - this.z);
        const progress = this._prevDist - dist;
        this._prevDist = dist;
        let reward = progress;                       // metres closed this step

        // *** A DISTANCE-ONLY REWARD IS MAXIMISED BY A CAR THAT NEVER SLOWS DOWN. *** It arrives at full speed,
        // overshoots, turns around, and collects the same reward again on the way back -- an orbit, not a
        // drive. dockEnv solved exactly this by requiring arrival AND low speed together, and the same
        // condition is the only thing standing between this env and a policy that learns to circle its goal.
        const near = dist < GOAL_R;
        const slow = speed < GOAL_V;
        this.arrived = this.requireSlow ? (near && slow) : near;
        if (this.arrived) reward += 100;

        // Sliding is not free: a saturated tyre is a car that has stopped answering its controls.
        reward -= this._slip * 0.5;
        // And a roll ends it. Without this the policy learns to corner at any speed, because rolling costs
        // nothing it can see.
        if (this.rolled && this.endOnRoll) reward -= 50;

        const done = this.arrived || (this.rolled && this.endOnRoll) || this.t >= this.maxSteps;
        return {
            obs: this._obs(), reward, done,
            info: { dist, speed, arrived: this.arrived, rolled: this.rolled, slip: this._slip,
                    grounded: this._grounded, docked: this.arrived, crashed: this.rolled },
        };
    }
}

/**
 * A hand-written driver, for imitation (brain/rl/imitation.js's cloneFromDemos) and as the floor a learned
 * policy has to beat.
 *
 * *** THE FIRST VERSION OF THIS BRAKED AT A FIXED DISTANCE AND ARRIVED 0 TIMES IN 24 EPISODES. *** Traced,
 * it reached the goal at 26 m/s and then rolled: a car that eases off "when close" is asking the wrong
 * question, because how close is close enough depends entirely on how fast you are going. Braking distance is
 * v^2 / (2a), which grows with the SQUARE of speed -- at 26 m/s with 7.5 m/s^2 of braking that is 45 m, and
 * the fixed threshold was 9.6.
 *
 * The second thing it got wrong is subtler and is the friction circle from v4217 showing up in the driving:
 * a car cannot corner at any speed. The maximum speed through a corner of radius r is sqrt(mu * g * r), so
 * approaching a goal that is off to one side, the speed has to come down BEFORE the turn, not during it.
 * Braking while already turning spends a budget that the cornering needs.
 */
export function driveExpert(obs, opts = {}) {
    const [relF, relR, vF, , , slip, grounded] = obs;
    const S_ = opts.S ?? S, V_ = opts.V ?? V;
    const distM = Math.hypot(relF, relR) * S_;         // metres to the goal
    const speedM = Math.abs(vF) * V_;                  // metres per second
    const brakeA = opts.brakeAccel ?? 7.5;             // maxBrake / mass for the default car
    const gripA = opts.gripAccel ?? 8.8;               // mu * g for the road car above -- the cornering budget

    const steer = Math.max(-1, Math.min(1, relR * 4));

    // How much room the goal needs, plus a margin. Below that, brake.
    const stopDist = (speedM * speedM) / (2 * brakeA) * 1.35 + 4;
    let throttle;
    if (distM < stopDist) {
        throttle = -1;                                  // committed braking, not a gentle lift
    } else {
        // Corner speed limit: the tighter the required turn, the slower it may be taken. Radius is
        // approximated from how far off-axis the goal is.
        const offAxis = Math.abs(relR) * S_;
        const radius = offAxis > 1 ? (distM * distM) / (2 * offAxis) : 1e6;
        const vCorner = Math.sqrt(gripA * radius);
        throttle = speedM < vCorner * 0.85 ? 0.9 : -0.4;
    }
    if (slip > 0.4) throttle = Math.min(throttle, -0.2);   // already sliding: unwind, do not add
    if (grounded < 0.5) throttle = 0;                      // airborne: nothing to push against
    return [steer, Math.max(-1, Math.min(1, throttle))];
}

export { OBS_DIM, ACT_DIM, GOAL_R, GOAL_V, S, V };
if (typeof module !== "undefined" && module.exports) {
    module.exports = { DriveEnv, driveExpert, defaultCar, OBS_DIM, ACT_DIM, GOAL_R, GOAL_V, S, V };
}
