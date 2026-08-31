// input/deviceGravity.mjs -- v4230
//
// WHICH WAY IS DOWN, ACCORDING TO THE PHONE. Turning the browser's orientation and motion events into a
// gravity VECTOR, which is the one thing shajidhasan/mobile-fluid-sim (MIT) has that this tree does not.
//
// *** THE SOLVER IN THAT REPO IS REFUSED, AND SAYING WHY IS HALF THE POINT. *** Its FlipFluid.ts is the Ten
// Minute Physics FLIP, and this tree already has that and more of it: fluid/flip2d.mjs and fluid/flip3d.mjs
// are gated on divergence collapse, settling and mass conservation, and fluid-webgpu.html runs the same
// algorithm on the GPU with a staggered MAC grid, an atomic particle-to-grid splat, Jacobi pressure
// projection, an alternative red-black Gauss-Seidel + SOR solver, RK2 advection and a toggleable ST-FLIP
// large-time-step mode. Taking a 2D CPU FLIP on top of that would be a fourth copy of a solved problem.
//
// *** WHAT THE TREE ACTUALLY LACKS, MEASURED BEFORE WRITING THIS, AND NOT WHAT THE BACKLOG ITEM SAID. ***
// The item claimed the tree's only mention of deviceorientation was phone.html. It IS the only file -- but it
// uses the sensor TWICE and already relays it, so "the tree has no sensor" was wrong:
//
//   phone.html onOrient()        gamma > 12 -> send("look", {dir:"right"}), beta > 55 -> look down.
//                                A THRESHOLDED UI CONTROL. The angle is a button, not a direction.
//   phone.html onPickerOrient()  relays raw { alpha, beta, gamma } at 30 Hz to main.js as
//                                "phone:picker:orient", where it drives a cursor.
//
// So the tilt reaches the engine, and NOTHING ANYWHERE TURNS IT INTO A DIRECTION. physics/sph/tiltPower.mjs
// and wideTilt.mjs take `deg` -- a number the code hands itself. That is the gap, and it is a narrower and
// more honest one than "there is no sensor": the pipe exists and there is no arithmetic at the end of it.
//
// ---- THE DERIVATION, BECAUSE alpha/beta/gamma ARE NOT A DIRECTION ------------------------------------------
// The W3C DeviceOrientation event gives three INTRINSIC Euler angles in Z-X'-Y'' order, so the rotation taking
// the device frame to the earth frame is R = Rz(alpha) . Rx(beta) . Ry(gamma). The device frame has +X out of
// the right edge, +Y out of the top edge and +Z out of the screen; the earth frame has +Z up.
//
// Gravity in the earth frame is (0, 0, -1). In the DEVICE frame it is R^T . (0,0,-1), and since
// (R^T v)_i = sum_j R_ji v_j, that is minus the third ROW of R. Row three of Rz is (0,0,1), so
//
//     row3(R) = (0,0,1) . Rx . Ry = (0, sin b, cos b) . Ry = (-cos b sin g,  sin b,  cos b cos g)
//
// and therefore
//
//     *** g_device = ( cos(beta) sin(gamma),  -sin(beta),  -cos(beta) cos(gamma) ) ***
//
// which is independent of alpha, as it must be: spinning a level phone about the vertical does not move down.
// Three cases worth checking by hand, and the gate checks all three:
//   flat on a table (0,0,0)      -> (0, 0, -1)   down is into the table, away from the screen
//   held upright   (_,90,0)      -> (0,-1,  0)   down is toward the bottom edge, so things fall down the screen
//   rolled right   (_, 0,90)     -> (1, 0,  0)   down is out of the right edge
//
// ---- AND THE ACCELEROMETER'S SIGN IS GENUINELY AMBIGUOUS, WHICH IS NOT A THING TO PAPER OVER ---------------
// devicemotion's accelerationIncludingGravity is proper acceleration, so the W3C reading for a device at rest
// screen-up is +9.81 on Z and the gravity DIRECTION is its negation. iOS has historically reported the
// opposite sign. This file cannot resolve that from arithmetic and does not pretend to: gravityFromMotion()
// takes the convention, and accelerometerSign() RESOLVES IT AT RUNTIME by comparing against the
// orientation-derived vector, which has no such ambiguity. When both events are available the guess is
// unnecessary; when only motion is, the caller is choosing and knows it.

/** Standard gravity, m/s^2. */
export const EARTH_G = 9.80665;

const DEG = Math.PI / 180;
const norm = (v) => {
    const m = Math.hypot(v[0], v[1], v[2]);
    return m > 1e-12 ? [v[0] / m, v[1] / m, v[2] / m] : null;
};

/**
 * Down, as a unit vector in the DEVICE frame, from a deviceorientation event's Euler angles in degrees.
 * Returns null when the angles are not finite -- a sensor that has not produced a reading yet gives nulls,
 * and inventing (0,0,-1) for that would be a silent claim that the phone is lying flat.
 *
 * @param {number} alpha rotation about Z, degrees (ignored: it cannot move gravity)
 * @param {number} beta  rotation about X', degrees
 * @param {number} gamma rotation about Y'', degrees
 * @returns {number[]|null} [x, y, z], unit length
 */
export function gravityFromOrientation(alpha, beta, gamma) {
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
    const b = beta * DEG, g = gamma * DEG;
    const cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
    // Already unit length by construction -- cb^2 sg^2 + sb^2 + cb^2 cg^2 = cb^2 + sb^2 = 1 -- but normalised
    // anyway so that a caller can rely on it after any future change here.
    return norm([cb * sg, -sb, -cb * cg]);
}

/** The two conventions accelerationIncludingGravity is reported in. */
export const ACCEL_SIGN = { W3C: -1, IOS_LEGACY: 1 };

/**
 * Down, as a unit vector, from a devicemotion event's accelerationIncludingGravity.
 * @param {{x:number,y:number,z:number}} acc
 * @param {number} [sign] ACCEL_SIGN.W3C (default) or ACCEL_SIGN.IOS_LEGACY, or whatever accelerometerSign() found
 */
export function gravityFromMotion(acc, sign = ACCEL_SIGN.W3C) {
    if (!acc || !Number.isFinite(acc.x) || !Number.isFinite(acc.y) || !Number.isFinite(acc.z)) return null;
    return norm([sign * acc.x, sign * acc.y, sign * acc.z]);
}

/**
 * *** RESOLVE THE SIGN INSTEAD OF GUESSING IT. *** Given one accelerometer sample and the gravity vector
 * derived from orientation at the same moment, report which convention this device uses. Returns null when
 * the two are too close to perpendicular to tell -- which happens while the phone is being moved, and a
 * confident answer from an ambiguous sample would be worse than none.
 *
 * @returns {number|null} an ACCEL_SIGN value
 */
export function accelerometerSign(acc, orientationGravity, minAgreement = 0.5) {
    if (!orientationGravity) return null;
    const raw = norm([acc && acc.x, acc && acc.y, acc && acc.z].map((n) => (Number.isFinite(n) ? n : NaN)));
    if (!raw || raw.some((n) => !Number.isFinite(n))) return null;
    const dot = raw[0] * orientationGravity[0] + raw[1] * orientationGravity[1] + raw[2] * orientationGravity[2];
    if (Math.abs(dot) < minAgreement) return null;
    return dot > 0 ? ACCEL_SIGN.IOS_LEGACY : ACCEL_SIGN.W3C;
}

/**
 * Device frame to SCREEN frame. A sim draws in screen coordinates, and the screen can be rotated relative to
 * the device: screen.orientation.angle is 90 in one landscape and 270 in the other. Z is untouched, because
 * the screen normal does not move when the content rotates within it.
 *
 * *** THE SIGN HERE WAS WRONG IN MY FIRST DRAFT AND ONLY A PHYSICAL CASE CAUGHT IT. *** I wrote -angle,
 * printed toScreenFrame([0,-1,0], 90) -> [-1,0,0], and read past it because the numbers looked plausible.
 * They are not, and the way to tell is to work one real phone through:
 *
 *   screen.orientation.angle is 90 when the device is rotated COUNTER-CLOCKWISE (it matches the old
 *   window.orientation, which was +90 for landscape-left). Rotate the device CCW and its +X edge, which
 *   pointed right, now points at the sky -- so world-down in the DEVICE frame is (-1, 0, 0). The content has
 *   been counter-rotated to stay upright, so to the person holding it gravity is still straight down the
 *   screen: (0, -1, 0). Only +angle takes (-1,0,0) there. At 270 the device is rotated clockwise, device-frame
 *   down is (+1,0,0), and +270 sends that to (0,-1,0) as well. Both landscapes agree, which is the check.
 */
export function toScreenFrame(v, screenAngleDeg = 0) {
    if (!v) return null;
    const a = screenAngleDeg * DEG, c = Math.cos(a), s = Math.sin(a);
    return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

/** A unit direction scaled to m/s^2, which is what a solver's gravity term wants. */
export function gravityVector(unit, magnitude = EARTH_G) {
    return unit ? [unit[0] * magnitude, unit[1] * magnitude, unit[2] * magnitude] : null;
}

/**
 * Exponential low-pass over a direction. A raw accelerometer is noisy enough that a fluid driven straight off
 * it visibly jitters at rest; the sim wants the slow component. `tau` is a TIME CONSTANT in seconds and the
 * step is dt-aware, so the smoothing does not change meaning when the frame rate does -- a per-frame alpha
 * would filter twice as hard at 120 Hz as at 60.
 */
export class GravityFilter {
    constructor({ tau = 0.25 } = {}) { this.tau = tau; this.value = null; }
    /** @returns {number[]|null} the filtered unit vector */
    push(v, dt) {
        if (!v) return this.value;
        if (!this.value || !(dt > 0)) { this.value = v.slice(); return this.value; }
        const a = 1 - Math.exp(-dt / Math.max(this.tau, 1e-6));
        const out = [
            this.value[0] + (v[0] - this.value[0]) * a,
            this.value[1] + (v[1] - this.value[1]) * a,
            this.value[2] + (v[2] - this.value[2]) * a,
        ];
        this.value = norm(out) || this.value;
        return this.value;
    }
    reset() { this.value = null; }
}

/**
 * A SHAKE IS AN EVENT, NOT A SLIDER, and that is the second thing worth taking from mobile-fluid-sim: a
 * discrete gesture the sim can respond to once, rather than a continuous quantity.
 *
 * What is measured is the LINEAR acceleration -- the reading with gravity subtracted -- because a phone simply
 * held at a steep angle has a large accelerationIncludingGravity and is not being shaken. Hysteresis (a fire
 * threshold above a release threshold) plus a refractory window is what stops one vigorous shake from
 * registering as fifteen.
 */
export class ShakeDetector {
    constructor({ fire = 12, release = 6, refractoryMs = 400 } = {}) {
        if (!(fire > release)) throw new RangeError("ShakeDetector: fire must exceed release, or it will chatter");
        this.fire = fire; this.release = release; this.refractoryMs = refractoryMs;
        this.armed = true; this.lastFire = -Infinity; this.magnitude = 0; this.count = 0;
    }
    /**
     * @param {{x,y,z}} acc accelerationIncludingGravity
     * @param {number[]} gravityUnit current down, unit
     * @param {number} nowMs
     * @returns {boolean} true on the frame a shake starts
     */
    push(acc, gravityUnit, nowMs) {
        if (!acc || !gravityUnit) return false;
        // Subtract the gravity component: what is left is what the hand did.
        const gx = gravityUnit[0] * EARTH_G, gy = gravityUnit[1] * EARTH_G, gz = gravityUnit[2] * EARTH_G;
        const lx = acc.x - gx, ly = acc.y - gy, lz = acc.z - gz;
        this.magnitude = Math.hypot(lx, ly, lz);
        if (this.magnitude < this.release) this.armed = true;
        if (!this.armed || this.magnitude < this.fire) return false;
        if (nowMs - this.lastFire < this.refractoryMs) return false;
        this.armed = false; this.lastFire = nowMs; this.count++;
        return true;
    }
    reset() { this.armed = true; this.lastFire = -Infinity; this.magnitude = 0; this.count = 0; }
}

/**
 * The whole pipe, for a caller that just wants a gravity vector out of a pair of events.
 * Pure: it is given readings, it does not listen for them. Attaching to window is the page's job, and keeping
 * it out of here is what lets the arithmetic be gated with no phone in the room.
 */
export class DeviceGravity {
    constructor({ tau = 0.25, magnitude = EARTH_G, shake = {} } = {}) {
        this.filter = new GravityFilter({ tau });
        this.shake = new ShakeDetector(shake);
        this.magnitude = magnitude;
        this.sign = null;            // unresolved until an orientation reading arrives alongside a motion one
        this.screenAngle = 0;
        this._lastOrientation = null;
    }
    orientation(alpha, beta, gamma) {
        this._lastOrientation = gravityFromOrientation(alpha, beta, gamma);
        return this._lastOrientation;
    }
    motion(acc) {
        if (this.sign === null && this._lastOrientation) {
            const s = accelerometerSign(acc, this._lastOrientation);
            if (s !== null) this.sign = s;
        }
        return gravityFromMotion(acc, this.sign === null ? ACCEL_SIGN.W3C : this.sign);
    }
    /** Fold one reading in and get the current screen-frame gravity in m/s^2. */
    step(unit, dt) {
        const f = this.filter.push(unit, dt);
        return gravityVector(toScreenFrame(f, this.screenAngle), this.magnitude);
    }
}
