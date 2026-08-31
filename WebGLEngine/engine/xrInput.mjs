// engine/xrInput.mjs -- v4212 -- WebXR controllers: poses, buttons, axes, and the edges between frames.
//
// v4179 got the engine INTO a headset and gave it nothing to do there. You could stand in the world and look
// around; you could not touch it. This is the input half.
//
// NO GL AND NO navigator.xr AT MODULE SCOPE, for the same reason engine/xrSession.mjs has none: every
// interesting thing here is a decision about state over time, and a decision about state over time can be
// driven in node against fixtures. What CANNOT be tested that way is the pose matrices coming out of a real
// device, so this module does not pretend to produce them -- it takes what the caller read from the frame.
//
// *** THE THING THAT MAKES CONTROLLER CODE WRONG IS ALMOST NEVER THE POSE. IT IS THE EDGE. *** A headset runs
// the input loop at 72-120 Hz. `if (button.pressed) fire()` fires sixty times for one trigger pull, and it
// LOOKS like it works while you are testing with something harmless. Everything below that reports a press
// reports it ONCE, on the frame the state changed, and the gate drives multi-frame sequences rather than
// single snapshots because a single snapshot cannot show an edge at all.
//
// Three traps this pins, each of which produces a plausible-looking wrong answer:
//
//   1. A CONTROLLER THAT DISAPPEARS MID-PRESS MUST NOT LEAVE THE PRESS LATCHED. Put a controller down, or let
//      it sleep, and its inputSource vanishes from the session. If the previous frame's "pressed" survives,
//      the button is held forever and whatever it triggers repeats or never releases. Removal has to
//      synthesise the release.
//
//   2. handedness IS NOT AN IDENTITY. Two controllers can both report "none" (hand tracking, a gamepad, an
//      untracked source), and a source can be REPLACED while keeping its handedness. Keying state on
//      handedness silently merges two devices into one. The key here is the inputSource OBJECT itself, held
//      in a Map, which is the only thing WebXR guarantees is stable for the life of the source.
//
//   3. AN AXIS THAT NEVER READS ZERO IS A STICK THAT NEVER STOPS. Real thumbsticks rest at 0.02-0.08, not 0,
//      so an unfiltered axis walks the player across the room. A deadzone is not polish; without one the
//      feature is broken. It is applied RADIALLY (on the magnitude of the pair) rather than per-axis, because
//      per-axis deadzones square off a round stick: push diagonally at 0.1 on each axis and a per-axis
//      deadzone of 0.15 gives you nothing, while the stick is clearly deflected.

/** Below this magnitude a stick is at rest. Measured against real hardware rest values in the 0.02-0.08 band. */
export const DEFAULT_DEADZONE = 0.12;

/** WebXR's standard mapping puts the trigger at 0, the squeeze at 1, the thumbstick click at 3. */
export const BUTTON = Object.freeze({ TRIGGER: 0, SQUEEZE: 1, TOUCHPAD: 2, THUMBSTICK: 3, A_X: 4, B_Y: 5 });
/** ...and the thumbstick axes at 2/3, NOT 0/1 -- 0/1 are the touchpad. This is off by two in a lot of code. */
export const AXIS = Object.freeze({ TOUCHPAD_X: 0, TOUCHPAD_Y: 1, STICK_X: 2, STICK_Y: 3 });

/**
 * Radial deadzone with rescaling.
 *
 * Rescaling matters as much as the threshold: without it the stick JUMPS from 0 to the deadzone value the
 * moment it crosses, so slow movement is impossible. With it, output runs 0..1 smoothly across the live part
 * of the throw.
 */
export function applyDeadzone(x, y, dead = DEFAULT_DEADZONE) {
    const m = Math.hypot(x, y);
    if (!(m > dead)) return { x: 0, y: 0, magnitude: 0 };
    const scaled = (m - dead) / (1 - dead);
    const k = Math.min(1, Math.max(0, scaled)) / m;
    return { x: x * k, y: y * k, magnitude: Math.min(1, Math.max(0, scaled)) };
}

/** A single axis, same rule, for triggers and one-dimensional inputs. */
export function deadzone1(v, dead = DEFAULT_DEADZONE) {
    const a = Math.abs(v);
    if (!(a > dead)) return 0;
    return Math.sign(v) * Math.min(1, (a - dead) / (1 - dead));
}

/** Read a gamepad's buttons into a plain boolean+value array. Missing gamepad -> empty, never a throw. */
export function readButtons(gamepad) {
    const out = [];
    const bs = gamepad && gamepad.buttons;
    if (!bs || typeof bs.length !== "number") return out;
    for (let i = 0; i < bs.length; i++) {
        const b = bs[i] || {};
        out.push({ pressed: !!b.pressed, touched: !!b.touched, value: Number(b.value) || 0 });
    }
    return out;
}

/** Read axes, with the radial deadzone already applied to the thumbstick pair. */
export function readAxes(gamepad, dead = DEFAULT_DEADZONE) {
    const ax = (gamepad && gamepad.axes) || [];
    const raw = Array.from(ax, (n) => Number(n) || 0);
    const stick = applyDeadzone(raw[AXIS.STICK_X] || 0, raw[AXIS.STICK_Y] || 0, dead);
    const pad = applyDeadzone(raw[AXIS.TOUCHPAD_X] || 0, raw[AXIS.TOUCHPAD_Y] || 0, dead);
    return { raw, stick, pad };
}

/**
 * Tracks input sources across frames and reports EDGES.
 *
 * Usage per XR frame:
 *   const events = input.update(session.inputSources, (src) => poseFor(src));
 * where poseFor returns whatever the caller got from frame.getPose(src.targetRaySpace, refSpace) -- this
 * module stores it and never interprets it, so it cannot be wrong about a matrix it did not compute.
 */
export class XRInputTracker {
    constructor(opts = {}) {
        this.deadzone = opts.deadzone ?? DEFAULT_DEADZONE;
        /** @type {Map<object, object>} keyed on the inputSource OBJECT -- see trap 2 in the header. */
        this.sources = new Map();
        this.frames = 0;
    }

    /** Everything currently tracked, as an array. */
    list() { return Array.from(this.sources.values()); }

    /** The state for one source, or null. */
    get(src) { return this.sources.get(src) || null; }

    /**
     * Advance one frame.
     * @param inputSources  session.inputSources (array-like)
     * @param getPose       optional (src) => pose|null, called once per source per frame
     * @returns events: [{ type, source, handedness, button?, axes?, ... }]
     *          types: "added" | "removed" | "buttondown" | "buttonup" | "select" | "squeeze"
     */
    update(inputSources, getPose = null) {
        this.frames++;
        const events = [];
        const seen = new Set();
        const list = inputSources ? Array.from(inputSources) : [];

        for (const src of list) {
            if (!src) continue;
            seen.add(src);
            let st = this.sources.get(src);
            if (!st) {
                st = {
                    source: src,
                    handedness: src.handedness || "none",
                    profiles: Array.isArray(src.profiles) ? src.profiles.slice() : [],
                    targetRayMode: src.targetRayMode || "gaze",
                    buttons: [], axes: { raw: [], stick: { x: 0, y: 0, magnitude: 0 }, pad: { x: 0, y: 0, magnitude: 0 } },
                    pose: null, firstSeenFrame: this.frames,
                };
                this.sources.set(src, st);
                events.push({ type: "added", source: src, handedness: st.handedness, profiles: st.profiles });
            }

            if (getPose) { try { st.pose = getPose(src) || null; } catch { st.pose = null; } }

            const prev = st.buttons;
            const now = readButtons(src.gamepad);
            st.axes = readAxes(src.gamepad, this.deadzone);

            // THE EDGE. Compare against the PREVIOUS frame's array, not against a live read of the same
            // object -- a gamepad's button objects are reused and mutated by the UA, so holding a reference
            // and comparing it to itself always says "unchanged".
            const n = Math.max(prev.length, now.length);
            for (let i = 0; i < n; i++) {
                const was = prev[i] ? prev[i].pressed : false;
                const is = now[i] ? now[i].pressed : false;
                if (is && !was) {
                    events.push({ type: "buttondown", source: src, handedness: st.handedness, button: i, value: now[i].value });
                    if (i === BUTTON.TRIGGER) events.push({ type: "select", source: src, handedness: st.handedness });
                    if (i === BUTTON.SQUEEZE) events.push({ type: "squeeze", source: src, handedness: st.handedness });
                } else if (!is && was) {
                    events.push({ type: "buttonup", source: src, handedness: st.handedness, button: i });
                }
            }
            st.buttons = now;
        }

        // TRAP 1: anything that stopped existing must RELEASE what it was holding, or the press is latched
        // for the life of the page. The release is synthesised from the last known state, in button order,
        // and then the removal is reported -- a listener that acts on "buttonup" gets it BEFORE the source it
        // refers to is reported gone.
        for (const [src, st] of Array.from(this.sources)) {
            if (seen.has(src)) continue;
            for (let i = 0; i < st.buttons.length; i++) {
                if (st.buttons[i] && st.buttons[i].pressed) {
                    events.push({ type: "buttonup", source: src, handedness: st.handedness, button: i, synthetic: true });
                }
            }
            events.push({ type: "removed", source: src, handedness: st.handedness });
            this.sources.delete(src);
        }
        return events;
    }

    /** Forget everything -- called when a session ends, so the next session starts clean. */
    reset() { this.sources.clear(); this.frames = 0; }

    /**
     * Convenience: the movement vector a locomotion system should use this frame, from whichever hand is
     * configured. Returns {x, y} already deadzoned and rescaled, or {x:0,y:0} when that hand is absent.
     */
    moveVector(handedness = "left") {
        for (const st of this.sources.values()) {
            if (st.handedness === handedness) return { x: st.axes.stick.x, y: st.axes.stick.y };
        }
        return { x: 0, y: 0 };
    }

    stats() {
        return {
            frames: this.frames,
            sources: this.sources.size,
            hands: this.list().map((s) => s.handedness),
        };
    }
}

export default XRInputTracker;
