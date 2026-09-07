// WebGLEngine/physics/raceCar.mjs -- Racing city 2 (task 65): the car on box3d
//
// ONE box3d CHASSIS BODY, FOUR RAYCAST WHEELS FROM physics/vehicle.mjs, AN ANALYTIC GROUND FROM THE FLAT TRACK, A CONTROLLER CONTRACT.
//
// ---- WHY NOT THE WHEEL JOINTS, SAID FIRST ---------------------------------------------------------------------------------------------
//
// The plan named box3d's wheel joints (jointDrive KIND.WHEEL, appended at v4398). They exist in physics/box3d/box3d_shim.c and were
// measured natively at v4398 -- and they are NOT IN vendor/box3d/box3d.wasm: the artifact exports 45 swk_ functions and none of
// swk_wheel_spin, swk_wheel_steer, swk_wheel_state or swk_body_sphere (physics/box3d/box3dNode.mjs's PENDING_REBUILD says so, and
// this sandbox has no emsdk to change it). A car on wheel joints would run in a native probe and nowhere the brain, the page or
// the fleet can reach it. So the car is the tree's OTHER vehicle, the one v4217 built and gated with 56 checks: physics/vehicle.mjs's
// raycast model -- one rigid chassis, wheels as downward rays, suspension and tyre forces applied to the single body -- which needs
// only what the wasm has (a box body, impulses, transforms, velocities, a state hash). And because the phase-1 track is FLAT, the
// ray needs no physics raycast either (swk_world_cast_ray is another native-only export): the ground under a wheel is a function of
// (x, z) -- asphalt at ROAD_Y inside the kerbs, the kerb band raised KERB_HEIGHT, grass at the floor's own height, nothing beyond
// the grid. The day the wasm is rebuilt, the wheel joints are a second car beside this one, not a replacement: the raycast car is
// what round 3's brain learns on and round 4's lab replays, and both want the cheaper, deterministic body.
//
// ---- WHAT box3d GIVES AND WHAT IS DERIVED ----------------------------------------------------------------------------------------------
//
// box3d integrates the chassis (gravity, the buildings as static boxes it can hit, sleeping, the state hash). Each step this module
// reads the chassis transform and linear velocity, DERIVES the angular velocity by finite difference of the quaternion (the wasm has
// no readback for it), computes each wheel's attach point, ray hit distance against the surface, suspension force (vehicle.mjs's
// suspensionAt with the compression rate as its damping input) and tyre forces (vehicle.mjs's tyreForces, saturated at grip times
// load), sums them into a linear impulse at the centre and an angular impulse from the attach lever, adds drag, and steps the world.
// Steering turns the front wheels' plane; throttle is a drive force on the rear wheels; brake is a longitudinal slip against the
// rolling direction; grass adds rolling resistance (a quarter of the load) and takes grip away, which is how the track holds the
// car without a wall.
//
// The controller contract is { throttle, steer, brake } in [-1, 1] x [-1, 1] x [0, 1], clamped here. The pursuit driver below is the
// reference: it follows the centreline a lookahead ahead and throttles by how hard it is steering; it is what round 3's zero policy
// is measured against and what round 4's adjudicator can replay. Every quantity here is float math on the same inputs, so two
// runs of the same seed and driver produce the same box3d state hash at every step: that is the lockstep fingerprint.
"use strict";
import { wheel, suspensionAt, tyreForces, steerAngle, castLength } from "./vehicle.mjs";
import { TRUCK_PARTS } from "../world/kenneyKit.mjs";
import { TILE, ROAD_Y, HALF_WIDTH, centreline, cellAt, isTrackCell, checkpoints } from "../world/raceTrack.mjs";
import { rotateQ } from "../render/voxelBodies.mjs";

/** The car: Kenney's truck (2.8 long, 1.5 wide, wheels at TRUCK_PARTS) as a 1200 kg chassis on four raycast wheels. */
export const CAR = Object.freeze({
    half: Object.freeze([0.75, 0.35, 1.4]),          // the chassis box; the truck body spans 1.5 x 1.0 x 2.8
    mass: 1200,
    wheelRadius: 0.3,                                // the truck's wheel centres sit at y 0.3, so the wheel bottoms at 0
    restLength: 0.35, maxTravel: 0.25, stiffness: 45000, damping: 4500,
    maxSteer: 0.55,                                  // rad, the front wheels
    maxDrive: 2500,                                  // N per driven (rear) wheel
    brakeSlip: 12,                                   // the longitudinal slip velocity a full brake asks the tyre to resist, m/s
    drag: 4.0,                                       // N s^2 / m^2 on the chassis: 5000 N of drive balances it near 35 m/s
    grip: Object.freeze({ asphalt: 1.6, kerb: 1.2, grass: 0.7 }),
    // rolling resistance as a FRACTION OF THE WHEEL'S LOAD against the rolling direction (0.015 is a road tyre; grass a quarter of
    // the weight). The first draft fed it to tyreForces as a slip velocity, and 6000 N/(m/s) times 5 % of the speed on four wheels
    // was 1,200 N per m/s -- full throttle reached 5.3 m/s in three seconds, the drive spent on a resistance mis-scaled by a factor
    // of thirty. Measured, then moved.
    rolling: Object.freeze({ asphalt: 0.015, kerb: 0.05, grass: 0.25 }),
    lateralStiffness: 8000, longStiffness: 6000,
    dt: 1 / 60, substeps: 4,
});
export const KERB_HEIGHT = 0.15;
/** The chassis centre's height over the ground at rest: half height + rest length + wheel radius. */
export const rideHeight = (spec = CAR) => spec.half[1] + spec.restLength + spec.wheelRadius;
/** The chassis density that gives the spec's mass through box3d's own box mass (8 hx hy hz rho). */
export const chassisDensity = (spec = CAR) => spec.mass / (8 * spec.half[0] * spec.half[1] * spec.half[2]);

/** The four wheels in the chassis frame, attached at the chassis bottom over Kenney's wheel positions; front steerable, rear driven. */
export function carWheels(spec = CAR) {
    const at = (name) => [TRUCK_PARTS[name][0], -spec.half[1], TRUCK_PARTS[name][2]];
    const common = { radius: spec.wheelRadius, restLength: spec.restLength, maxTravel: spec.maxTravel, stiffness: spec.stiffness, damping: spec.damping, maxSteer: spec.maxSteer };
    return [
        wheel({ ...common, attach: at("wheel-front-left"), steerable: true, driven: false, grip: spec.grip.asphalt }),
        wheel({ ...common, attach: at("wheel-front-right"), steerable: true, driven: false, grip: spec.grip.asphalt }),
        wheel({ ...common, attach: at("wheel-back-left"), steerable: false, driven: true, grip: spec.grip.asphalt }),
        wheel({ ...common, attach: at("wheel-back-right"), steerable: false, driven: true, grip: spec.grip.asphalt }),
    ];
}

// ---- quaternion helpers (x, y, z, w) -----------------------------------------------------------------------------------------------------
export const qConj = (q) => [-q[0], -q[1], -q[2], q[3]];
export function qMul(a, b) { return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]; }
export const yawQuat = (yaw) => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
/** The heading of +z under q, as a yaw about +y (the convention raceTrack and litSphere's quat mode share). */
export function yawOf(q) { const f = rotateQ(q, [0, 0, 1]); return Math.atan2(f[0], f[2]); }
/** The angular velocity that turns qPrev into q over dt, by the small-angle rule (twice the delta's vector part over dt). */
export function angularVelocity(qPrev, q, dt) {
    let d = qMul(q, qConj(qPrev)); if (d[3] < 0) d = d.map((v) => -v);
    const s = Math.sqrt(Math.max(0, 1 - d[3] * d[3])), ang = 2 * Math.atan2(s, d[3]);
    if (s < 1e-9 || dt <= 0) return [0, 0, 0];
    return [d[0] / s * ang / dt, d[1] / s * ang / dt, d[2] / s * ang / dt];
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * The flat track as a surface: at(x, z) -> { y, kind, grip, rolling }. Asphalt inside HALF_WIDTH of the centreline on a track cell,
 * the kerb band from there to the tile edge (raised KERB_HEIGHT), grass on every other cell of the grid (the floor's top, ROAD_Y),
 * and `void` (y far below) beyond the grid. The nearest centreline distance is a brute-force minimum over the polyline's segments.
 */
export function trackSurface(track, { spec = CAR, kerbHeight = KERB_HEIGHT } = {}) {
    const pts = centreline(track), n = pts.length;
    const segDist = (x, z) => {
        let best = Infinity, bi = 0;
        for (let i = 0; i < n; i++) {
            const a = pts[i], b = pts[(i + 1) % n], vx = b[0] - a[0], vz = b[1] - a[1], L2 = vx * vx + vz * vz || 1;
            const t = clamp(((x - a[0]) * vx + (z - a[1]) * vz) / L2, 0, 1), px = a[0] + vx * t, pz = a[1] + vz * t, d = Math.hypot(x - px, z - pz);
            if (d < best) { best = d; bi = i + t; }
        }
        return { d: best, s: bi };
    };
    return {
        track, centreline: pts, kerbHeight,
        at(x, z) {
            const c = cellAt(track, x, z);
            if (!c) return { y: -100, kind: "void", grip: 0, rolling: 0 };
            if (!isTrackCell(track, c)) return { y: ROAD_Y, kind: "grass", grip: spec.grip.grass, rolling: spec.rolling.grass };
            const { d } = segDist(x, z);
            if (d <= HALF_WIDTH) return { y: ROAD_Y, kind: "asphalt", grip: spec.grip.asphalt, rolling: spec.rolling.asphalt };
            if (d <= TILE / 2) return { y: ROAD_Y + kerbHeight, kind: "kerb", grip: spec.grip.kerb, rolling: spec.rolling.kerb };
            return { y: ROAD_Y, kind: "grass", grip: spec.grip.grass, rolling: spec.rolling.grass };
        },
        /** the lap parameter (centreline index plus fraction) and distance of a point */
        along(x, z) { return segDist(x, z); },
    };
}

/** A skidpad: asphalt at ROAD_Y everywhere, for straight-line, braking and steering measurements that want no kerb in the way. */
export function flatSurface({ spec = CAR, y = ROAD_Y } = {}) {
    const g = { y, kind: "asphalt", grip: spec.grip.asphalt, rolling: spec.rolling.asphalt };
    return { track: null, centreline: [], kerbHeight: 0, at: () => g, along: () => ({ s: 0, d: 0 }) };
}

/** The clamped controller contract. */
export const clampInput = (u = {}) => ({ throttle: clamp(+u.throttle || 0, -1, 1), steer: clamp(+u.steer || 0, -1, 1), brake: clamp(+u.brake || 0, 0, 1) });

/** A car in a world (render/slugTicker.mjs's worldFromModule shape): the chassis body at rest height over (x, z), facing `yaw`. */
export function createCar(world, { x = 0, z = 0, yaw = 0, spec = CAR, groundY = ROAD_Y } = {}) {
    const q = yawQuat(yaw), y = groundY + rideHeight(spec);
    const body = world.addBox({ type: "dynamic", pos: [x, y, z], half: spec.half.slice(), density: chassisDensity(spec) });
    world.setTransform(body, [x, y, z], q);
    if (world.setFriction) world.setFriction(body, 0.6);
    return { body, spec, wheels: carWheels(spec), prevQ: q, steps: 0, last: null };
}

/** The chassis pose from the world's transforms: { pos, quat, yaw, vel, speed, forward, up }. */
export function carPose(world, car, xf = world.readTransforms(), vel = world.readVelocities()) {
    const o = car.body * 7, pos = [xf[o], xf[o + 1], xf[o + 2]], quat = [xf[o + 3], xf[o + 4], xf[o + 5], xf[o + 6]];
    const v = [vel[car.body * 3], vel[car.body * 3 + 1], vel[car.body * 3 + 2]], forward = rotateQ(quat, [0, 0, 1]);
    return { pos, quat, yaw: yawOf(quat), vel: v, speed: dot(v, forward), forward, up: rotateQ(quat, [0, 1, 0]) };
}

/**
 * One step: the wheel forces from the pose and the surface, applied as impulses, then the world stepped. Returns the pose it read and
 * per-wheel { grounded, kind, normal, long, lateral, compression }.
 */
export function stepCar(world, car, surface, input, dt = car.spec.dt) {
    const u = clampInput(input), spec = car.spec, pose = carPose(world, car);
    const omega = car.steps === 0 ? [0, 0, 0] : angularVelocity(car.prevQ, pose.quat, dt);
    const up = [0, 1, 0];
    let F = [0, 0, 0], Tq = [0, 0, 0]; const info = [];
    for (const w of car.wheels) {
        const r = rotateQ(pose.quat, w.attach), a = [pose.pos[0] + r[0], pose.pos[1] + r[1], pose.pos[2] + r[2]];
        const g = surface.at(a[0], a[2]), hit = a[1] - g.y;                 // the ray straight down from the attach point
        const vAttach = [pose.vel[0] + (omega[1] * r[2] - omega[2] * r[1]), pose.vel[1] + (omega[2] * r[0] - omega[0] * r[2]), pose.vel[2] + (omega[0] * r[1] - omega[1] * r[0])];
        const s = suspensionAt(hit > 0 ? hit : 1e-6, w, -vAttach[1]);
        if (!s.grounded) { info.push({ grounded: false, kind: g.kind, normal: 0, long: 0, lateral: 0, compression: 0 }); continue; }
        // the wheel's plane: the chassis heading turned by the steer, flattened to the ground
        const steer = steerAngle(w, u.steer), fq = qMul(pose.quat, yawQuat(steer));
        let fw = rotateQ(fq, [0, 0, 1]); fw = [fw[0], 0, fw[2]]; const fl = Math.hypot(fw[0], fw[2]) || 1; fw = [fw[0] / fl, 0, fw[2] / fl];
        const lat = cross(up, fw);
        const vLong = dot(vAttach, fw), vLat = dot(vAttach, lat);
        const drive = (w.driven ? u.throttle * spec.maxDrive : 0) - g.rolling * s.force * Math.tanh(vLong);   // tanh: no chatter at rest
        const longSlip = u.brake * Math.sign(vLong) * Math.min(Math.abs(vLong), spec.brakeSlip);
        const t = tyreForces({ driveForce: drive, lateralSlipVel: vLat, longSlipVel: longSlip, normalForce: s.force, grip: g.grip, lateralStiffness: spec.lateralStiffness, longStiffness: spec.longStiffness });
        // *** THE TYRE FORCES ACT AT THE CHASSIS'S HEIGHT, THE SUSPENSION AT THE ATTACH POINT. *** Applied at the attach (0.35 below the
        // centre of mass, on a 1.1 m track under a 1 m ride height) a 4,700 N lateral force rolled the car onto its roof in the first
        // steering run: with grip 1.6 the tyres can hold 15.7 m/s^2 sideways and the geometry rolls at g x 0.55 / 1.0 = 5.4. The
        // standard raycast-vehicle answer is the one here: the horizontal tyre forces take only the attach's horizontal lever (a yaw
        // torque, no roll torque), the vertical suspension force keeps its full lever (that is the roll stiffness).
        const tyre = [fw[0] * t.long + lat[0] * t.lateral, 0, fw[2] * t.long + lat[2] * t.lateral], susp = [0, s.force, 0];
        F = [F[0] + tyre[0] + susp[0], F[1] + tyre[1] + susp[1], F[2] + tyre[2] + susp[2]];
        const tq1 = cross([r[0], 0, r[2]], tyre), tq2 = cross(r, susp); Tq = [Tq[0] + tq1[0] + tq2[0], Tq[1] + tq1[1] + tq2[1], Tq[2] + tq1[2] + tq2[2]];
        info.push({ grounded: true, kind: g.kind, normal: s.force, long: t.long, lateral: t.lateral, compression: s.compression, saturated: t.saturated });
    }
    const sp = Math.hypot(pose.vel[0], pose.vel[1], pose.vel[2]);
    F = [F[0] - spec.drag * sp * pose.vel[0], F[1] - spec.drag * sp * pose.vel[1] * 0.2, F[2] - spec.drag * sp * pose.vel[2]];
    world.impulse(car.body, [F[0] * dt, F[1] * dt, F[2] * dt]);
    world.angularImpulse(car.body, [Tq[0] * dt, Tq[1] * dt, Tq[2] * dt]);
    world.step(dt, spec.substeps);
    car.prevQ = pose.quat; car.steps++; car.last = { pose, input: u, wheels: info };
    return { pose, input: u, wheels: info };
}

/** The city's buildings as static boxes the chassis can hit: rects from raceTrack.cityRects, stamped from groundY up. */
export function addBuildings(world, rects, groundY = ROAD_Y - 1) {
    return rects.map((r) => world.addBox({ type: "static", pos: [r.x + r.w / 2, groundY + 1 + r.h / 2, r.z + r.d / 2], half: [r.w / 2, r.h / 2, r.d / 2], density: 1 }));
}

/**
 * The reference driver: pure pursuit of the centreline. From the pose's lap parameter it looks `lookahead` metres ahead along the
 * polyline, steers toward that point (gain `steerGain` on the signed angle), and asks for a speed that falls with the steer it is
 * using, braking when it is over that. Deterministic in the pose.
 */
export function pursuitDriver(surface, { steerGain = 2.5, vMax = 13, vMin = 5, lookMin = 4, lookGain = 0.45, brakeLook = 14, accelGain = 0.6 } = {}) {
    const pts = surface.centreline, n = pts.length;
    const ahead = (s, dist) => { let i = Math.floor(s), t = s - i, left = dist; while (left > 0) { const a = pts[i % n], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), rem = L * (1 - t); if (rem >= left) { const tt = t + left / L; return [a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt]; } left -= rem; i++; t = 0; } return pts[i % n]; };
    // the path's heading change over the next `dist` metres, 0..PI: a corner ahead is a reason to slow BEFORE steering, which is what
    // the first draft lacked (it slowed only with the steer it was already using, met every corner at full speed, and left the grid)
    const turnAhead = (s, dist) => { const a = ahead(s, 0.5), b = ahead(s, 1.5), c = ahead(s, dist), d = ahead(s, dist + 1); const h0 = Math.atan2(b[0] - a[0], b[1] - a[1]), h1 = Math.atan2(d[0] - c[0], d[1] - c[1]); const w = h1 - h0; return Math.abs(Math.atan2(Math.sin(w), Math.cos(w))); };
    return (pose) => {
        const { s } = surface.along(pose.pos[0], pose.pos[2]), speed = Math.max(0, pose.speed);
        const target = ahead(s, lookMin + lookGain * speed), dx = target[0] - pose.pos[0], dz = target[1] - pose.pos[2];
        const angle = Math.atan2(dx, dz) - pose.yaw, wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
        const steer = clamp(steerGain * wrapped, -1, 1);
        const turn = Math.max(turnAhead(s, brakeLook), Math.abs(steer) * Math.PI / 2);
        const want = Math.max(vMin, vMax * (1 - 0.7 * turn / (Math.PI / 2))), gap = want - speed;
        return { throttle: clamp(accelGain * gap, -1, 1), steer, brake: gap < -1.5 ? clamp(-gap / 5, 0, 1) : 0 };
    };
}

/** Lap progress by checkpoint: the checkpoints' lap parameters, hit in order; a lap completes when the finish is hit again. */
export function lapTracker(surface) {
    const cps = checkpoints(surface.track).map((c) => ({ ...c, s: surface.along(c.x, c.z).s })), n = cps.length, N = surface.centreline.length;
    let next = 1, hit = 0, laps = 0, lastS = surface.along(cps[0].x, cps[0].z).s;
    const fwd = (from, to) => ((to - from) % N + N) % N;   // lap-parameter distance forward from `from` to `to`
    return {
        checkpoints: cps,
        update(pose) {
            const s = surface.along(pose.pos[0], pose.pos[2]).s;
            // the car passes checkpoint `next` when the lap parameter crosses it going forward (within a tile of it, so a cut cannot skip ahead)
            const target = next % n, cs = cps[target].s;
            if (fwd(lastS, cs) <= fwd(lastS, s) && fwd(lastS, s) < 3 * 6 + 3) { hit++; if (target === 0) laps++; next++; }
            lastS = s;
            return { s, next: next % n, hit, laps };
        },
        get laps() { return laps; }, get hit() { return hit; },
    };
}

/** FNV-1a folding of 32-bit words, for the lockstep fingerprint. */
export function foldHash(h, v) { h ^= v & 0xff; h = Math.imul(h, 0x01000193); h ^= (v >>> 8) & 0xff; h = Math.imul(h, 0x01000193); h ^= (v >>> 16) & 0xff; h = Math.imul(h, 0x01000193); h ^= (v >>> 24) & 0xff; return Math.imul(h, 0x01000193); }

/**
 * Drive `seconds` with a driver (pose -> input) or a fixed input, folding box3d's state hash every step into a fingerprint. Returns
 * { fingerprint, steps, pose, trajectory (every `sample`th position), laps, hit, lapTime (seconds to the first lap, or null), kinds }.
 */
export function drive(world, car, surface, driverOrInput, { seconds = 10, sample = 10, tracker = null, spec = car.spec } = {}) {
    const steps = Math.round(seconds / spec.dt), trajectory = [], kinds = { asphalt: 0, kerb: 0, grass: 0, void: 0 }; let h = 0x811c9dc5, lapTime = null, pose = null;
    for (let i = 0; i < steps; i++) {
        const pre = carPose(world, car), input = typeof driverOrInput === "function" ? driverOrInput(pre) : driverOrInput;
        const r = stepCar(world, car, surface, input, spec.dt); pose = r.pose;
        for (const w of r.wheels) kinds[w.kind] = (kinds[w.kind] || 0) + 1;
        h = foldHash(h, world.stateHash());
        if (i % sample === 0) trajectory.push([pose.pos[0], pose.pos[1], pose.pos[2]]);
        if (tracker) { const t = tracker.update(pose); if (t.laps >= 1 && lapTime === null) lapTime = (i + 1) * spec.dt; }
    }
    return { fingerprint: (h >>> 0).toString(16).padStart(8, "0"), steps, pose: carPose(world, car), trajectory, laps: tracker ? tracker.laps : 0, hit: tracker ? tracker.hit : 0, lapTime, kinds };
}

/** Where to draw Kenney's truck for a chassis pose: the model's origin is under the wheels, rideHeight below the chassis centre. */
export function truckPlacement(pose, spec = CAR) { const d = rotateQ(pose.quat, [0, -rideHeight(spec), 0]); return { pos: [pose.pos[0] + d[0], pose.pos[1] + d[1], pose.pos[2] + d[2]], quat: pose.quat, scale: 1 }; }
