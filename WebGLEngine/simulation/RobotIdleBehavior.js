// FILE: simulation/RobotIdleBehavior.js
// VERSION: v1 — round 268
//
// When the engine is quiet — no kaiju activity, no AI pipelines, no
// speech, no civ events — the robot just sits there doing the Idle
// clip. Eventually that reads as the page being broken. This module
// fires occasional subtle micro-actions during quiet periods to keep
// the avatar feeling alive.
//
// Activity tracking:
//   - Wraps pipAvatar.setExpression so every reaction or speak call
//     updates `_lastActivityMs`. The idle scheduler skips firing if
//     anything reactive happened recently.
//   - Subscribes to civEvents directly too — covers events that flow
//     to RobotReactor without going through setExpression (in case
//     the reactor is cooldown-throttled).
//
// Scheduling:
//   - Checks every 5s.
//   - Won't fire unless the engine has been quiet for IDLE_THRESHOLD_MS.
//   - Once quiet, fires a random subtle action with probability that
//     ramps up the longer it stays quiet (so the first action comes
//     within ~30s of quiet but it doesn't strobe).
//   - After firing, waits MIN_GAP_MS before the next eligible fire.
//
// Action pool — leans heavy on the soft / contemplative clips
// (Wave, ThumbsUp, Standing) rather than the dramatic ones (Death,
// Punch, Dance). Reads as "looking around / passing time" rather
// than "performing for the camera".
//
// Console: window.robotIdle.{enable,disable,fire,now}

const IDLE_THRESHOLD_MS = 30_000;     // quiet for this long before idle kicks in
const MIN_GAP_MS        = 18_000;     // minimum gap between idle fires
const CHECK_INTERVAL_MS =  5_000;     // poll cadence
const RAMP_TO_FULL_MS   = 60_000;     // probability ramps up over this window

// Each entry: weight (higher = more likely), action (emotion name).
// Weights bias toward "looking around" gestures.
const IDLE_POOL = [
    { weight: 28, action: "wave"      },    // brief greet/glance
    { weight: 22, action: "stand"     },    // attention pose, hold briefly
    { weight: 18, action: "happy"     },    // small thumb-up, friendly
    { weight: 14, action: "feed"      },    // Yes clip — small affirmative nod
    {  weight: 8, action: "play"      },    // tiny jump — punctuation
    {  weight: 6, action: "stride"    },    // walk-jump — rare, gets attention
    {  weight: 4, action: "dance"     },    // very rare — the robot's bored ENOUGH
];

function pickWeighted(pool) {
    const total = pool.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    for (const e of pool) {
        r -= e.weight;
        if (r <= 0) return e;
    }
    return pool[0];
}

export class RobotIdleBehavior {
    constructor({ pipAvatar, civEvents } = {}) {
        this.pipAvatar = pipAvatar;
        this.civEvents = civEvents;
        this.enabled = true;
        this._lastActivityMs = this._now();
        this._lastIdleFireMs = 0;
        this._tickHandle = null;
        this._unsubs = [];
        this._install();
        this._startTimer();
    }

    _now() {
        return (typeof performance !== "undefined") ? performance.now() : Date.now();
    }

    _install() {
        // Wrap pipAvatar.setExpression so any reactive expression
        // (RobotReactor, snark, palChat) bumps the activity timer.
        if (this.pipAvatar?.setExpression) {
            const orig = this.pipAvatar.setExpression.bind(this.pipAvatar);
            this.pipAvatar.setExpression = (opts) => {
                this._lastActivityMs = this._now();
                return orig(opts);
            };
        }
        // Same for .speak — visible mouth animation counts as activity.
        if (this.pipAvatar?.speak) {
            const orig = this.pipAvatar.speak.bind(this.pipAvatar);
            this.pipAvatar.speak = (opts) => {
                this._lastActivityMs = this._now();
                return orig(opts);
            };
        }
        // civEvents also bumps the timer — covers the case where an
        // event happens but RobotReactor's per-emotion cooldown
        // suppresses the resulting expression. We still want to count
        // the event itself as "something happened".
        if (this.civEvents?.subscribe) {
            const off = this.civEvents.subscribe(() => {
                this._lastActivityMs = this._now();
            });
            this._unsubs.push(off);
        }
    }

    _startTimer() {
        if (this._tickHandle) return;
        this._tickHandle = setInterval(() => this._tick(), CHECK_INTERVAL_MS);
    }

    _tick() {
        if (!this.enabled) return;
        const now = this._now();
        const quietFor = now - this._lastActivityMs;
        if (quietFor < IDLE_THRESHOLD_MS) return;          // still busy
        if (now - this._lastIdleFireMs < MIN_GAP_MS) return; // too soon
        // Ramp probability: at IDLE_THRESHOLD_MS = 0, at RAMP_TO_FULL_MS = 1
        const ramp = Math.min(1, (quietFor - IDLE_THRESHOLD_MS) / (RAMP_TO_FULL_MS - IDLE_THRESHOLD_MS));
        // Per-tick fire probability ramps from 8% → 40%. With a 5s
        // tick this gives ~30-60s between fires once quiet.
        const fireP = 0.08 + 0.32 * ramp;
        if (Math.random() > fireP) return;
        this._fireIdleAction();
    }

    _fireIdleAction() {
        const pick = pickWeighted(IDLE_POOL);
        try {
            this.pipAvatar?.setExpression?.({ Voice: "M1", expression: pick.action });
            this._lastIdleFireMs = this._now();
            // Don't bump _lastActivityMs — that would create a loop
            // where the idle action prevents the next idle action.
            // We let the wrap above NOT trigger here by setting the
            // timestamp directly to before-the-call. (Cheap fix: just
            // reset _lastActivityMs to a time that's still "quiet
            // enough" to consider firing again.)
            this._lastActivityMs = this._lastIdleFireMs - IDLE_THRESHOLD_MS + 2000;
        } catch (e) {
            console.warn("[robotIdle] fire failed:", e);
        }
    }

    enable()  { this.enabled = true;  console.log("[robotIdle] enabled"); }
    disable() { this.enabled = false; console.log("[robotIdle] disabled"); }
    // Force-fire one idle action immediately
    fire() { this._fireIdleAction(); }
    // Inspect state for debugging
    now() {
        const t = this._now();
        return {
            enabled:  this.enabled,
            quietFor_s: ((t - this._lastActivityMs) / 1000).toFixed(1),
            sinceLastIdle_s: ((t - this._lastIdleFireMs) / 1000).toFixed(1),
            threshold_s: IDLE_THRESHOLD_MS / 1000,
        };
    }

    dispose() {
        if (this._tickHandle) { clearInterval(this._tickHandle); this._tickHandle = null; }
        for (const u of this._unsubs) { try { u?.(); } catch {} }
        this._unsubs = [];
    }
}

export function installRobotIdleConsoleAPI(idle) {
    if (typeof window === "undefined") return;
    window.robotIdle = {
        enable:  () => idle.enable(),
        disable: () => idle.disable(),
        fire:    () => idle.fire(),
        now:     () => idle.now(),
    };
    console.log("[robotIdle] installed — try `robotIdle.now()` to check state or `robotIdle.fire()` to test.");
}
