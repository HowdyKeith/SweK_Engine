// WebGLEngine/brain/autopilotAircraft.mjs
//
// A HEADING/ATTITUDE-HOLD AUTOPILOT for physics/mechanics/aircraftAssembly.mjs aircraft -- decide() turns "what
// direction should the nose point" into the {pitch,roll,yaw} object aircraftAssembly.mjs's own mixControls()
// (called internally by stepAircraft()) expects, the AI/autopilot slice named as NEXT in tools/ship/
// nextRounds.mjs's rcforge-realistic-flight-model backlog entry, "analogous to brain/autopilot6dof.mjs": same
// PD-attitude-controller architecture (reusing that file's own pointingError() directly, unmodified), same
// (body, target-ish, opts) -> decision shape, no side effects -- but adapted to a genuinely different actuator.
//
// WHY THIS IS "HOLD A HEADING", NOT "CHASE A TARGET POSITION" LIKE autopilot6dof.mjs. A first attempt reused
// autopilot6dof.mjs's own {pos}-target shape (aim the nose at a point in space) and found a real limitation:
// aircraftAssembly.mjs's rudder-alone "flat turn" (no bank) has weak authority against a fixed-wing airframe's
// own aerodynamic drag/inertia, and for a LARGE initial heading error it settles into a bounded oscillation
// around 85-98% aligned rather than fully converging within any reasonable tick budget -- a real aerodynamic
// fact (real aircraft bank to turn; a flat, unbanked turn is weak and this module does not implement banked-
// turn coordination), not a bug. Chasing a moving TARGET POSITION also confounds rotational convergence with
// the aircraft's own translation (a fixed point's bearing keeps shifting simply because the aircraft is flying,
// independent of any attitude correction), which is a needless complication for what this file actually proves.
// So decide() takes a DESIRED HEADING (a fixed, already-unit world direction) directly, matching what a real
// "autopilot" classically does (heading hold / wing leveler), not a guidance/pursuit layer -- a caller wanting
// to fly TOWARD a target position derives desiredForward = unit(target.pos - body.pos) itself, each tick, which
// makes the scope boundary explicit rather than hidden inside this file. PROVEN (not just claimed, each number
// below backed by its own gate assertion, not merely asserted in this comment): a 10deg perturbation converges
// above 0.999 and stays there; a 25deg perturbation still converges above 0.99 within 30s; a 120deg perturbation
// -- deliberately past where this controller can fully reacquire -- never diverges (stays finite, |w| bounded
// under 1 rad/s) but does NOT converge (settles well below 0.9), an explicitly OUT-OF-SCOPE, documented
// limitation of this first slice (no banked-turn coordination), degrading gracefully rather than glossed over.
//
// THE CONTROL LAW HAS TWO STRUCTURALLY DIFFERENT HALVES, because pointingError() constrains only the NOSE
// DIRECTION (2 of 3 rotational degrees of freedom) -- a single-vector alignment has a null space exactly along
// the axis being aligned, so it carries NO information about roll (rotation about the current-to-desired-
// forward axis is invisible to a pure forward-vector comparison). autopilot6dof.mjs's own header names this
// explicitly and calls it correct for ITS use case ("roll is left free, matching how a spin-stabilised or
// simply roll-indifferent combat craft would fly") -- free roll is harmless for a thruster-driven space ship.
// IT IS NOT HARMLESS HERE. aircraftAssembly.mjs's aerodynamic model has NO natural roll damping (relativeAirflow()
// uses the body's single CM velocity for every surface, not per-surface v_cm + w x r_mount -- a real aircraft's
// wings sweeping through air at different local speeds during rotation provide real aerodynamic damping this
// model does not simulate), so if roll were left uncontrolled the same way, roll rate has NOTHING opposing it
// and, measured directly with a first draft of this file that DID leave roll at pointingError()'s own (near-
// zero, uninformative) eBody[0] term: roll rate grew UNBOUNDED over a 90-second real-simulator run -- 0 to over
// 60 rad/s, the aircraft literally tumbling, from nothing worse than an 8-degree initial attitude perturbation.
// So roll gets its OWN, separate law here: pure rate damping, `kRollDamp * w[0]`, ignoring eBody[0] entirely.
//
// *** THE SIGN OF THAT DAMPING TERM IS THE LOAD-BEARING CLAIM OF THIS FILE, THE SAME WAY aeroSurface.mjs's OWN
// SIGN CONVENTION WAS -- AND A FIRST DRAFT GOT IT BACKWARDS. *** aircraftAssembly.mjs's own gate established
// (section 4, mirrored-input torque check) that a POSITIVE roll command produces NEGATIVE torque.x -- so
// opposing a POSITIVE w[0] (which needs a NEGATIVE torque to decelerate it) requires a POSITIVE roll command,
// not negative. `roll = -kRollDamp * w[0]` (the naively "obvious" sign, feedback opposing the SIGN of w rather
// than the actual TORQUE-vs-command relationship) is exactly backwards: it commands a POSITIVE torque whenever
// w[0] is positive, ACCELERATING roll instead of damping it -- verified directly: with that sign, full aileron
// deflection (roll command saturated at -1, the controller's own maximum authority) was measurably present the
// entire time roll rate grew from 0 past 60 rad/s, because the "correction" was actively driving the runaway,
// not fighting it. `roll = +kRollDamp * w[0]` (this file's actual law) was checked the same mirrored way this
// session's other sign bugs were: w[0] positive and negative both produce a command of the OPPOSITE sign, and
// applying that command through the real aircraftAssembly.mjs pipeline measurably REDUCES |w[0]| after a real
// tick for both signs, not merely "looks right" for one.
"use strict";
import { rotateByQuat, worldToBody, createBody, boxInertia } from "../physics/mechanics/rigidBody6dof.mjs";
import { FORWARD_BODY, createAircraft, stepAircraft } from "../physics/mechanics/aircraftAssembly.mjs";
import { pointingError } from "./autopilot6dof.mjs";

export { FORWARD_BODY, pointingError };   // re-exported: a caller of this file needs both, and pointingError()
                                            // is reused directly from autopilot6dof.mjs, not re-derived here

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = (v) => Math.hypot(v[0], v[1], v[2]);
const unit3 = (v, fallback) => { const n = norm3(v); return n > 1e-9 ? v.map((c) => c / n) : fallback; };
const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

export const AUTOPILOT_AIRCRAFT = { kp: 5, kRollDamp: 1 };

/**
 * `body`: an aircraftAssembly.mjs-flown rigidBody6dof.mjs state. `desiredForward`: the heading to hold/acquire
 * (see this file's header for why this is a direction, not a target position) -- NORMALISED here (via the same
 * unit3(v, fallback) pattern autopilot6dof.mjs's own decide() already uses for its own target direction), so
 * an accidentally non-unit caller input degrades gracefully instead of silently distorting eBody's magnitude.
 * Found by an adversarial review: passing [2,0,0] instead of [1,0,0] (same DIRECTION, wrong magnitude) used to
 * silently double eBody's derived angle and saturate a command that should not have been -- a real, demonstrated
 * gap, not a hypothetical one, closed here rather than merely documented as the caller's responsibility. The
 * fallback (this file's own current heading) matches autopilot6dof.mjs's own degenerate-input convention: a
 * degenerate desired direction means "hold whatever heading you're already on" rather than an undefined result.
 * `opts.kd` defaults to `2*sqrt(kp)` (autopilot6dof.mjs's own critical-damping default) -- REUSED as a
 * reasonable heuristic starting point, not re-derived: unlike autopilot6dof.mjs's direct-torque law, this
 * file's control output is a normalised control-surface command, not raw torque, so the "reduces to a
 * critically-damped harmonic oscillator" proof does NOT transfer here (the actuator's own torque-per-command
 * gain is itself airspeed- and angle-of-attack-dependent, not a constant) -- convergence is demonstrated
 * empirically against the real nonlinear aircraftAssembly.mjs simulator in this file's own gate instead of
 * derived from a linearised closed form. Returns {controls, facingCos, eBody} -- `controls` is exactly the
 * shape aircraftAssembly.mjs's stepAircraft() expects.
 */
export function decide(body, desiredForward, opts = {}) {
    const spec = { ...AUTOPILOT_AIRCRAFT, ...opts };
    const kd = opts.kd != null ? opts.kd : 2 * Math.sqrt(spec.kp);
    const currentForward = rotateByQuat(body.q, FORWARD_BODY);
    const desiredUnit = unit3(desiredForward, currentForward);
    const eWorld = pointingError(currentForward, desiredUnit);
    const eBody = worldToBody(body.q, eWorld);

    const roll = clamp(spec.kRollDamp * body.w[0]);
    const pitch = clamp(spec.kp * eBody[1] - kd * body.w[1]);
    const yaw = clamp(spec.kp * eBody[2] - kd * body.w[2]);

    return { controls: { pitch, roll, yaw }, facingCos: dot3(currentForward, desiredUnit), eBody };
}

// ---- FRONT DOOR -------------------------------------------------------------------------------------------------
export function reportLines() {
    const aircraft = createAircraft();
    // a self-consistent light-aircraft fuselage (real length/height, not aircraftAssembly.mjs's own reportLines()
    // paper-thin illustrative body) -- see this file's header on why inertia scale matters for closed-loop control.
    const I = boxInertia({ m: 600, hx: 3, hy: 3, hz: 0.6 });
    // perturb 10deg off a level, on-heading start about a general (non-axis-aligned) axis -- the same kind of
    // case this file's own gate proves converges, not a cherry-picked easy one.
    const axis = [0.3, 0.7, -0.2];
    const n = Math.hypot(axis[0], axis[1], axis[2]);
    const half = (10 * Math.PI / 180) / 2;
    const s2h = Math.sin(half);
    const qErr = [Math.cos(half), (axis[0] / n) * s2h, (axis[1] / n) * s2h, (axis[2] / n) * s2h];
    let s = createBody({ mass: 600, I, pos: [0, 0, 0], vel: rotateByQuat(qErr, [30, 0, 0]), q: qErr });
    const desiredForward = [1, 0, 0];
    const startFacing = rotateByQuat(s.q, FORWARD_BODY).reduce((a, v, i) => a + v * desiredForward[i], 0);
    let ticks = 0;
    for (; ticks < 600; ticks++) {
        const d = decide(s, desiredForward);
        s = stepAircraft(aircraft, s, d.controls, 1 / 30).state;
    }
    const finalFacing = rotateByQuat(s.q, FORWARD_BODY).reduce((a, v, i) => a + v * desiredForward[i], 0);
    return [
        "[autopilotAircraft] a heading-hold PD attitude controller for aircraftAssembly.mjs aircraft -- pitch/yaw",
        "                    via autopilot6dof.mjs's own pointingError(), roll via its OWN rate-damping law (the",
        "                    pointing error alone carries no information about roll -- see this file's header).",
        `  10deg general-axis attitude perturbation, 20s: facing ${startFacing.toFixed(4)} -> ${finalFacing.toFixed(4)}`,
        `  (1.0 = nose exactly on the held heading; ${ticks} ticks simulated against the real nonlinear aircraft)`,
    ];
}

// GUARDED (this tree's established idiom -- see physics/stabilityMeter.mjs's own v3900/v3951 notes and
// tools/ship/browserSafety-selfcheck.mjs, the gate that exists because of exactly this bug): this module is
// loaded by a PAGE as well as run as a CLI, and `process` at module top level is a ReferenceError in a
// browser -- not a caught failure, an EVALUATION failure, so the whole module fails to load and every page
// that imports it dies with it. The node:url import itself must be INSIDE the guard too, dynamically -- a
// bare top-level `import ... from "node:url"` is resolved before this line ever runs, so an unguarded import
// crashes the browser before the guard below would even get a chance to skip it.
if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
        for (const l of reportLines()) console.log(l);
        process.exit(0);
    }
}
