// engine/xrLocomotion.mjs -- v4219 -- stick locomotion for a WebXR session: smooth move, snap turn, and the
// offset reference space that actually carries the player.
//
// *** v4212 SHIPPED moveVector() AND NOTHING THAT CONSUMES IT. *** engine/xrInput.mjs has read the thumbstick
// since v4212, deadzoned and per-hand, and main.js's XR frame even carries the comment "so a locomotion vector
// is applied to the camera this frame" -- which was a promise, not a description. Nothing read it. In a
// room-scale session that is invisible: you can walk, so the world responds, and the sticks simply do nothing.
//
// ---- *** LOCOMOTION IS NOT MOVING THE CAMERA. *** ------------------------------------------------------------
// The camera in an XR frame is not ours to move: it comes from frame.getViewerPose(refSpace), once per eye, and
// anything we do to it afterwards is overwritten next frame. The player is moved by REPLACING THE REFERENCE
// SPACE -- XRReferenceSpace.getOffsetReferenceSpace(transform) -- so that head tracking, controller poses and
// both eye views all move together. Move the camera instead and the controllers stay behind in the old space,
// which reads as your hands detaching from your body.
//
// The offset is the INVERSE of the player's pose, and that is the part worth stating rather than guessing.
// For S' = S.getOffsetReferenceSpace(T), a point at p in S is reported at T^-1 . p in S'. We want a viewer
// standing physically at v to be REPORTED at P . v, where P is where the player has walked to. So T^-1 = P,
// which means T = P^-1. Rather than trust that derivation, the gate asserts the invariant it implies: applying
// the offset to the player's own world position must land exactly on the origin.
"use strict";

import { DEFAULT_DEADZONE, applyDeadzone } from "./xrInput.mjs";

export const DEFAULTS = Object.freeze({
    speed: 2.5,             // m/s at full stick
    snapDegrees: 30,        // one push, one turn
    snapThreshold: 0.7,     // push past this to turn...
    snapRelease: 0.4,       // ...and back inside this before it will turn again
    maxDt: 0.1,             // see the clamp note in Locomotion.update
    deadzone: DEFAULT_DEADZONE,
});

// ---- the small amount of quaternion maths this needs, and no more ------------------------------------------
// There is no quaternion module in this tree to import: render/SplatRenderer.js's quatToMat is GLSL inside a
// shader string, not JavaScript. So this is written here, restricted to rotation about Y, rather than a
// general quaternion library nothing else would use.

/** A quaternion for a yaw (radians) about +Y. WebXR orientations are {x,y,z,w}. */
export function quatFromYaw(yaw) {
    return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

/**
 * The YAW of a head orientation -- and taking only the yaw is the whole point.
 *
 * *** IF YOU USE THE FULL ORIENTATION, LOOKING UP FLIES YOU INTO THE SKY. *** "Forward" for locomotion is the
 * head's forward vector PROJECTED ONTO THE FLOOR. Rotating (0,0,-1) by a head that is pitched up 45 degrees
 * gives a vector with a large +y, and moving along it leaves the ground. The gate checks exactly that: a
 * pitched head and a level one at the same heading must produce the same movement.
 */
export function yawOf(q) {
    if (!q) return 0;
    const { x = 0, y = 0, z = 0, w = 1 } = q;
    // forward = q * (0,0,-1) * q^-1, expanded for that one fixed vector
    const fx = -2 * (x * z + w * y);
    const fz = -(1 - 2 * (x * x + y * y));
    if (fx === 0 && fz === 0) return 0;              // looking straight up or down: no heading to read
    return Math.atan2(-fx, -fz);
}

/**
 * Rotate a floor-plane point about +Y. *** THIS IS THE ONLY ROTATION IN THE FILE, AND THAT IS DELIBERATE. ***
 * The first draft had this one handedness and basisFor() the other, so yawOf(quatFromYaw(a)) came back as -a
 * -- v4218's "two copies of the heading" defect, in a file written the week after that round. Everything below
 * derives from here, so a disagreement is not expressible.
 */
export function rotateY(p, a) {
    const s = Math.sin(a), c = Math.cos(a);
    return { x: (p.x || 0) * c + (p.z || 0) * s, z: -(p.x || 0) * s + (p.z || 0) * c };
}

/** The floor-plane forward and right vectors for a yaw. yaw 0 faces -Z, which is WebXR's forward. */
export function basisFor(yaw) {
    return { forward: rotateY({ x: 0, z: -1 }, yaw), right: rotateY({ x: 1, z: 0 }, yaw) };
}

/**
 * Where one frame of stick input takes the player, in world metres.
 *
 * *** THE GAMEPAD'S Y AXIS IS NEGATIVE WHEN YOU PUSH IT AWAY FROM YOU. *** That is the standard Gamepad
 * convention and it is inverted from "forward is positive", so forward is -stick.y. Getting this wrong gives
 * a control that runs away from everything you point it at, which is the same sign bug v4218 spent a round on.
 */
export function moveDelta(stick, yaw, { speed = DEFAULTS.speed, dt = 0, deadzone = DEFAULTS.deadzone } = {}) {
    const a = applyDeadzone(stick?.x || 0, stick?.y || 0, deadzone);
    const { forward, right } = basisFor(yaw);
    const fwd = -a.y;                                 // see the note above
    const k = speed * dt;
    return { x: (forward.x * fwd + right.x * a.x) * k, z: (forward.z * fwd + right.z * a.x) * k };
}

/**
 * Snap turn, with hysteresis.
 *
 * *** ONE PUSH MUST BE ONE TURN. *** A bare `if (|x| > threshold) turn()` fires every frame the stick is held,
 * which at 72 Hz is 2160 degrees a second -- the control does not feel fast, it feels broken. The stick must
 * come back inside a LOWER release threshold before it will fire again; a single threshold for both would
 * chatter for any hand resting near it.
 */
export class SnapTurn {
    constructor(opts = {}) {
        this.degrees = opts.snapDegrees ?? DEFAULTS.snapDegrees;
        this.threshold = opts.snapThreshold ?? DEFAULTS.snapThreshold;
        this.release = opts.snapRelease ?? DEFAULTS.snapRelease;
        this.armed = true;
        this.turns = 0;
    }
    reset() { this.armed = true; this.turns = 0; return this; }
    /** @returns degrees turned THIS call: 0, or +/- snapDegrees. */
    update(x) {
        const v = Number.isFinite(x) ? x : 0;
        if (this.armed && Math.abs(v) >= this.threshold) {
            this.armed = false; this.turns++;
            return v > 0 ? this.degrees : -this.degrees;
        }
        if (!this.armed && Math.abs(v) <= this.release) this.armed = true;
        return 0;
    }
}

/**
 * The offset transform for a player pose -- the INVERSE of that pose, as derived in the header.
 * Returned in the shape XRRigidTransform's constructor takes, so a caller writes
 * `new XRRigidTransform(t.position, t.orientation)` and nothing has to be rearranged.
 */
export function offsetTransformFor({ x = 0, y = 0, z = 0, yaw = 0 } = {}) {
    const r = rotateY({ x, z }, -yaw);                // R(-yaw) . p
    return {
        position: { x: -r.x, y: -y, z: -r.z, w: 1 },  // -R(-yaw) . p
        orientation: quatFromYaw(-yaw),
    };
}

/** Apply an offset transform to a world point -- what the runtime does to every pose. For the gate. */
export function applyOffset(t, p) {
    const r = rotateY({ x: p.x || 0, z: p.z || 0 }, yawOf(t.orientation));
    return { x: r.x + t.position.x, y: (p.y || 0) + t.position.y, z: r.z + t.position.z };
}

/**
 * The accumulated player pose, driven one frame at a time.
 *
 * *** SNAP TURN ROTATES ABOUT THE HEAD, NOT ABOUT THE ORIGIN. *** If you simply add to the yaw, the player is
 * swung around the reference space origin on an arc of radius |headPosition| -- so someone standing two metres
 * from where they started is thrown four metres sideways by a 180-degree turn, and it reads as being shoved.
 * Turning about the head keeps the head where it is, which is what turning your chair does.
 */
export class Locomotion {
    constructor(opts = {}) {
        this.opts = { ...DEFAULTS, ...opts };
        this.snap = new SnapTurn(this.opts);
        this.reset();
    }
    reset() {
        this.x = 0; this.y = 0; this.z = 0; this.yaw = 0;
        this.snap.reset();
        this.moved = 0; this.turned = 0;
        return this;
    }
    /** The player pose, for a caller that wants to place something in the world. */
    pose() { return { x: this.x, y: this.y, z: this.z, yaw: this.yaw }; }

    /**
     * @param moveStick   the movement hand's stick, raw from the gamepad
     * @param turnStick   the turning hand's stick x, raw
     * @param headQuat    the viewer's orientation this frame, or null
     * @param headPos     the viewer's position this frame, for the snap pivot
     * @param dt          seconds since the last frame
     */
    update({ moveStick = null, turnStick = 0, headQuat = null, headPos = null, dt = 0 } = {}) {
        // *** A DROPPED FRAME MUST NOT TELEPORT THE PLAYER. *** A tab-switch, a GC pause or a headset taken off
        // and put back on produces a dt of seconds, and speed * dt then moves someone across the map in one
        // step. Clamping costs a little accuracy on a stutter and prevents that entirely.
        const step = Math.max(0, Math.min(this.opts.maxDt, dt || 0));
        const headYaw = yawOf(headQuat);

        const turn = this.snap.update(turnStick);
        if (turn) {
            const rad = turn * Math.PI / 180;
            // A head physically at h in the reference space is at R(yaw).h + t in the world. Turning about the
            // head means that world point must not move while yaw becomes yaw + rad, so
            //     R(yaw + rad).h + t' = R(yaw).h + t   =>   t' = t + R(yaw).h - R(yaw + rad).h
            // Derived rather than guessed, and the gate asserts the head lands within a micrometre of where it
            // was -- adding to the yaw alone swings the player around the origin instead.
            const h = headPos || { x: 0, z: 0 };
            const before = rotateY(h, this.yaw), after = rotateY(h, this.yaw + rad);
            this.x += before.x - after.x;
            this.z += before.z - after.z;
            this.yaw += rad;
            this.turned++;
        }

        // The head's yaw is measured in the CURRENT reference space, so the player's own yaw adds to it to
        // give a heading in the base space -- the space the accumulated position lives in.
        const d = moveDelta(moveStick, headYaw + this.yaw, { speed: this.opts.speed, dt: step, deadzone: this.opts.deadzone });
        if (d.x || d.z) { this.x += d.x; this.z += d.z; this.moved++; }

        return { moved: !!(d.x || d.z), turned: turn, delta: d, transform: offsetTransformFor(this.pose()) };
    }
}

export default Locomotion;
