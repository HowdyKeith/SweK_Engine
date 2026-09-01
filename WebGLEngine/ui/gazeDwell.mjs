// WebGLEngine/ui/gazeDwell.mjs -- v4247
//
// SELECT A THING BY LOOKING AT IT, FOR WHEN THERE IS NO CONTROLLER.
//
// The idea is Ramotion/vr-menu-demo. *** ITS CODE IS REFUSED AND NONE OF IT IS HERE: *** that repository has
// no LICENSE file under any of the four common names on master, and its README closes with an App Store
// advert rather than a grant. UNPAPERED, recorded at #106 beside ZachSaucier/Asset-Loading-Effects and
// kamend/ChuckClose-SparkAR. What is taken is the INTERACTION, which is a published idea and needs nobody's
// source: look at a target, a ring fills over a hold time, and the fill IS the commit.
//
// ---- WHY THE TREE NEEDS IT, WHICH IS NOT "IT WOULD BE NICE" -------------------------------------------------
//
// VR parts one, two and three shipped stereo rendering, controllers, stick locomotion (engine/xrLocomotion.mjs)
// and haptics (#89). *** EVERY ONE OF THOSE INPUT PATHS ASSUMES A CONTROLLER IN EACH HAND. *** There is no
// path at all for a headset with no controllers, a controller that has died mid-session, or a phone in a
// holder -- which is the cheapest VR there is and the case Ramotion's demo was built for.
//
// ---- THE THREE PARTS, AND ONLY ONE OF THEM IS INTERESTING ----------------------------------------------------
//
// A ray from the head pose is arithmetic. A hit test against a rectangle is arithmetic. The DWELL TIMER is
// where this succeeds or fails, and the failure is specific: a dwell that RESETS to zero the moment the ray
// leaves the target is unusable by a human being, because a head does not hold still. Real head tremor takes
// the ray off a small target for a frame at a time, and a resetting timer never reaches its hold.
//
// So the timer DECAYS rather than resets, and decays FASTER than it fills. That asymmetry is the whole design:
//
//   * filling slower than decay means a glance that crosses a target cannot accumulate enough to fire, which
//     is the other failure -- a menu that selects whatever you looked past on the way to something else.
//   * decaying rather than resetting means a frame of tremor costs a fraction of the progress instead of all
//     of it.
//
// The gate measures both: a swept glance must not fire, and a held gaze WITH REALISTIC TREMOR must. A reset
// timer passes the first and fails the second, and that is the number this file exists to produce.
"use strict";

/** The defaults, exported so a caller and the gate cannot drift apart on what "a dwell" means. */
export const DWELL = Object.freeze({
    hold: 1.2,          // seconds of accumulated gaze to commit
    decay: 1.0,         // progress lost per second off target, RELATIVE to the 1 s/s gained on it
    cooldown: 0.5,      // seconds after a commit before the same target can fire again
});

/**
 * *** THE DECAY RATE IS NOT A FEEL KNOB. IT SETS, EXACTLY, HOW MUCH TREMOR A DWELL CAN SURVIVE. ***
 *
 * On target the timer gains dt. Off target it loses `decay * dt`. If the ray is off for a fraction p of the
 * frames, the net rate is (1 - p) - p * decay, and the dwell can only ever complete while that is positive:
 *
 *     (1 - p) > p * decay      <=>      p < 1 / (1 + decay)
 *
 * So decay = 3 tolerates 25% of frames off target and NOTHING MORE -- at 35% it never completes, however long
 * the user stares. That is not a slow dwell, it is an impossible one, and it was this file's first default
 * until the gate measured a small target under 2 degrees of tremor and found 35.2% of frames off it.
 *
 * decay = 1 tolerates just under half. The cost of a low decay is NOT that glances start firing -- a glance
 * is rejected by hold vs crossingTime, which decay has no part in -- it is that abandoning a target takes
 * longer to forget. Two failures, two independent knobs, which is why neither is tuned by eye.
 */
export const maxOffFraction = (decay = DWELL.decay) => 1 / (1 + decay);

/**
 * The gaze ray, from a head matrix.
 *
 * A view matrix's translation is the head position and its third column is the head's +Z. Looking direction
 * is -Z, which is the convention engine/xrSession.mjs's cameraForView already produces and the one every
 * WebXR view uses.
 */
export function rayFromHeadMatrix(m) {
    return {
        origin: [m[12], m[13], m[14]],
        dir: normalise([-m[8], -m[9], -m[10]]),
    };
}

function normalise(v) {
    const L = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / L, v[1] / L, v[2] / L];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * A menu panel: a rectangle in space.
 * @param centre  world position of the middle
 * @param normal  which way it faces
 * @param right   its local +X, unit and perpendicular to normal
 * @param up      its local +Y
 * @param half    [halfWidth, halfHeight]
 */
export function makeQuad(id, centre, normal, right, up, half) {
    return { id, centre, normal: normalise(normal), right: normalise(right), up: normalise(up), half };
}

/**
 * Ray against one quad. Returns { t, u, v } with u and v in [-1, 1] across the face, or null.
 *
 * Rays that arrive from BEHIND the panel are rejected. That is not fussiness: a menu ring floating in a scene
 * has panels all around the viewer, and without the facing test you can select the one behind your head.
 */
export function hitQuad(origin, dir, q) {
    const denom = dot(dir, q.normal);
    if (denom >= -1e-9) return null;              // parallel, or hitting the back face
    const t = dot(sub(q.centre, origin), q.normal) / denom;
    if (t <= 0) return null;                       // behind the viewer
    const p = [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
    const d = sub(p, q.centre);
    const u = dot(d, q.right), v = dot(d, q.up);
    if (Math.abs(u) > q.half[0] || Math.abs(v) > q.half[1]) return null;
    return { t, u: u / q.half[0], v: v / q.half[1] };
}

/** The nearest quad the ray hits, or null. */
export function pickTarget(origin, dir, quads) {
    let best = null;
    for (const q of quads) {
        const h = hitQuad(origin, dir, q);
        if (h && (!best || h.t < best.t)) best = { id: q.id, t: h.t, u: h.u, v: h.v };
    }
    return best;
}

/**
 * *** THE DWELL TIMER. ***
 *
 * update(dt, targetId) is called once a frame with whatever the ray is pointing at, and returns the progress
 * to show and whether anything committed. Progress is ACCUMULATED TIME, not a wall-clock animation -- so the
 * ring a caller draws from it is the actual state of the decision rather than a picture of one, and a ring
 * that keeps filling while the user looks away is impossible by construction rather than by discipline.
 */
export class DwellSelector {
    constructor(opts = {}) {
        const o = { ...DWELL, ...opts };
        this.hold = o.hold; this.decayRate = o.decay; this.cooldown = o.cooldown;
        this.target = null;      // what progress is accumulating toward
        this.elapsed = 0;        // seconds of accumulated gaze
        this.cooling = 0;        // seconds left before a commit may repeat
        this.lastFired = null;
    }

    /** 0..1, for the ring. Exactly elapsed / hold, and nothing else feeds it. */
    get progress() { return Math.max(0, Math.min(1, this.elapsed / this.hold)); }

    reset() { this.target = null; this.elapsed = 0; }

    /**
     * @param dt seconds since the last call
     * @param targetId what the gaze ray is on now, or null
     * @returns { progress, target, fired }  -- `fired` is the id that committed this frame, or null
     */
    update(dt, targetId) {
        // *** THE COOLDOWN HOLDS THE TIMER DOWN; IT DOES NOT MERELY GATE THE COMMIT. *** The first version
        // decremented `cooling` while `elapsed` went on refilling, so the two ran CONCURRENTLY and the repeat
        // period came out as max(hold, cooldown) rather than hold + cooldown -- which makes the knob do
        // nothing at all whenever cooldown <= hold, the case a caller is most likely to configure. A held
        // gaze then re-fired every 0.5 s at hold 0.5 and cooldown 0.5, and the gate caught it as 4 commits
        // in 2 s where 2 were intended.
        if (this.cooling > 0) {
            this.cooling = Math.max(0, this.cooling - dt);
            this.elapsed = 0;
            if (targetId != null) this.target = targetId;
            return { progress: 0, target: this.target, fired: null };
        }

        if (targetId != null && targetId === this.target) {
            this.elapsed += dt;                                  // still on it: fill
        } else if (targetId != null) {
            // A NEW target. Switching is deliberate, so the old progress goes rather than decaying -- what
            // decay exists for is losing the target you are still trying to hit, not changing your mind.
            this.target = targetId;
            this.elapsed = dt;
        } else {
            // Off everything: DECAY, do not reset. A head does not hold still, and a resetting timer is a
            // dwell no human can complete on a small target.
            this.elapsed = Math.max(0, this.elapsed - this.decayRate * dt);
        }

        let fired = null;
        if (this.target != null && this.elapsed >= this.hold && this.cooling <= 0) {
            fired = this.target;
            this.lastFired = fired;
            this.cooling = this.cooldown;
            this.elapsed = 0;
        }
        return { progress: this.progress, target: this.target, fired };
    }
}

/**
 * How long a ray stays on a target while sweeping across it, in seconds -- the quantity that decides whether
 * a glance can fire a button. Reported by the gate rather than assumed.
 */
export function crossingTime(halfWidth, distance, angularSpeed) {
    const angle = 2 * Math.atan(halfWidth / distance);
    return angularSpeed > 0 ? angle / angularSpeed : Infinity;
}
