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
// A FIRST FIX gave roll its own separate law, pure rate damping (`kRollDamp * w[0]`, ignoring eBody[0]
// entirely) -- correct and safe, but it left BANK ANGLE completely free (only its RATE was controlled), so the
// wing's own large lift-generating capability (measured, in the previous round, as far stronger than the
// rudder's own "flat turn" authority) was never actually used to help a turn. THIS ROUND REPLACES IT with a
// real BANK-ANGLE controller: roll now targets an actual bank angle, proportional to the existing yaw-error
// signal, redirecting the wing's own lift sideways to generate real centripetal turning force -- the mechanism
// a real aircraft actually uses to turn, not present in this file's own prior draft at all.
//
// BANK ANGLE, DERIVED AND PROVEN BEFORE BEING WRITTEN HERE (this file's own gate, section on bankAngle()):
// the rotation about the aircraft's OWN forward axis between its actual "up" and the "up" a wings-level
// aircraft would have AT THE SAME PITCH -- i.e. roll relative to the local horizon, with pitch and heading
// factored out by construction (levelUp = the component of world-up perpendicular to the current forward
// direction). Proven exact for pure roll (readback to the radian, both signs, up to +/-90deg), exactly zero
// for pitch-alone or yaw-alone at any magnitude, and correctly isolates the roll component under combined
// pitch+roll -- WITHIN ITS VALID DOMAIN, a genuine, well-posed "how far off level" measurement, not an
// approximation.
//
// *** A REAL, UNGUARDED DISCONTINUITY EXISTS RIGHT AT NOSE-VERTICAL, AN ADVERSARIAL REVIEW'S OWN FINDING,
// CONFIRMED HERE BY DIRECT MEASUREMENT AND NAMED PLAINLY RATHER THAN LEFT OUT OF THE PARAGRAPH ABOVE. *** when
// the current forward direction is (near-)parallel to WORLD_UP, levelUp's projection collapses toward the zero
// vector, unit3()'s own fallback silently substitutes `u` (current up) for it, and bankAngle() jumps by roughly
// 180deg for an arbitrarily small change in attitude right at the pole (measured directly: a fixed 40deg roll
// reads exactly 40.0000deg at pitch=89.999deg, 0.0000deg at pitch=90deg exactly, then -140.0000deg at
// pitch=90.001deg -- three readings for a 0.002deg attitude change). THIS FILE'S OWN GATE PROVES IT IS
// CURRENTLY DORMANT, NOT SAFE BY DESIGN: every scenario this gate and es-aircraft.html's own patrol actually
// exercise stays measurably clear of the pole (the closest any tested perturbation's forward direction gets is
// still ~9.6deg away, gated directly in this file's own gate) -- but nothing in bankAngle() ITSELF prevents a
// caller from commanding a near-vertical desiredForward, or an aircraft that genuinely loops/climbs through
// vertical, from hitting this jump and getting a spuriously saturated, physically nonsensical roll command out
// of decide(). Left unfixed this round (the honest fix is a second reference vector that stays well-defined
// through the pole, e.g. a body-frame axis rotated into world space instead of a world-frame one projected
// against a possibly-parallel forward -- a real design change, not a one-line patch) and documented here the
// same way this file already documents the sustained-turning gap: a genuinely open problem, named rather than
// silently assumed away by the domain this round's own testing happens to stay inside.
//
// *** THE SIGN OF THE NEW PROPORTIONAL TERM IS THE LOAD-BEARING CLAIM OF THIS FILE, THE SAME WAY aeroSurface.mjs's
// OWN SIGN CONVENTION WAS -- AND A FIRST DRAFT GOT IT BACKWARDS AGAIN, IN A NEW WAY. *** aircraftAssembly.mjs's
// own gate checks that a roll command produces NONZERO torque.x with EXACT mirror symmetry (not an absolute
// sign -- see that file's own header on why the sign itself is "derived and reported", not asserted from pilot
// terminology); a POSITIVE roll command producing NEGATIVE torque.x was confirmed here by direct measurement
// (stepAircraft with roll=+0.6 through the real simulator) -- the OPPOSITE polarity from pitch/yaw (positive
// command -> positive torque there, confirmed the same way). A first draft of this bank-angle law copied pitch/
// yaw's own `kp*e - kd*w` PATTERN DIRECTLY (`roll = kpBank*(desiredBank-currentBank) - kdBank*w[0]`) and it was
// backwards in exactly the way that pattern mismatch predicts: measured directly, targeting even a modest
// 20deg bank drove the aircraft to KEEP ROLLING PAST THE TARGET, wrapping through full barrel rolls (bank
// readings cycling through +/-180deg) rather than settling -- the SAME class of bug as the original rate-
// damper's sign error, just hiding inside a two-term law instead of a one-term one. Because roll's torque
// polarity is OPPOSITE pitch/yaw's, its whole proportional+derivative law needs the OPPOSITE overall sign from
// theirs: `roll = -kpBank*bankError + kdBank*w[0]` (bankError = desiredBank - currentBank, WRAPPED to the
// shortest path -- a naive subtraction is undefined/wrong near +/-180deg, part of the same bug). Verified the
// same mirrored way every other sign convention in this codebase has been: with the corrected sign, an
// isolated bank-angle-only test (pitch/yaw held at zero) converges CLEANLY to any tested target from -90deg to
// +90deg with no overshoot cycling, for every gain in a wide sweep; with the ORIGINAL (wrong) sign, EVERY gain
// in the same sweep produced chaotic full rotations.
//
// desiredBank ITSELF is proportional to the existing yaw-error signal (`kHeadingToBank * eBody[2]`, clamped to
// +/-maxBank) -- reusing the SAME eBody pointingError() already computes for yaw, not a new error signal: a
// large heading error commands a bigger bank (more aggressive turn), a small one a gentle bank, and an already-
// aligned heading commands exactly zero bank (proven: a pure-roll-only 30deg perturbation, which by
// construction leaves heading EXACTLY aligned throughout, settles to bank=0.0000deg exactly and stays there).
//
// WHAT THIS ROUND MEASURABLY IMPROVES, AND WHAT IT DOES NOT -- INCLUDING A REGRESSION, NAMED PLAINLY RATHER
// THAN LEFT OUT OF AN EARLIER DRAFT OF THIS PARAGRAPH THAT ONLY LISTED THE WINS. Single-shot heading
// ACQUISITION -- align with a newly-commanded fixed heading and hold it, which is exactly what es-aircraft.html's
// own patrol already does -- measured against the REAL simulator, no page-level engine thrust (this file's own
// gate): 25deg converges to 0.9975 (was 0.9969, a wash), 60deg to 0.9787 (was 0.9783, also a wash), 90deg to
// 0.9364 (was 0.8546 -- the single biggest win, and the only angle where banking clearly helps within this
// round's own tested range). 120deg -- already well past where either design fully reacquires -- is measurably
// WORSE under this design: 0.4399 vs the old design's 0.6499. The mechanism: this far off-heading, desiredBank
// saturates at maxBank almost immediately and stays there for a long stretch, committing the airframe to an
// aggressive sustained bank that the old flat-rudder-only law never risked -- real authority, but also a real
// way to overshoot and fight back through more of an unwanted turn than staying flatter would have. Still finite
// and bounded (|w| under 1 rad/s throughout, same as before), so the "does not diverge" guarantee is untouched
// even where convergence itself regresses -- gated directly in this file's own gate, not smoothed over. SUSTAINED,
// CONTINUOUS CIRCULAR TURNING -- chasing a heading target that keeps moving, forever, the way a real patrol
// loiter or a "always turning" flight pattern would need -- was tried (a moving reference point orbiting at a
// physically-plausible rate, and a self-referential "always aim N degrees ahead of wherever you currently are"
// target) and is NOT solved by this design: the commanded bank tends to engage briefly then decay back toward
// level rather than settling into a persistent turn, because the SAME yaw-error signal driving the bank
// command is measured in the aircraft's own BODY frame, which itself rotates as the aircraft banks -- the
// signal weakens as the very bank it commands increases, a self-limiting feedback this design does not
// counteract. Left as a genuinely open, harder problem (likely needing a rate-hold strategy rather than an
// angle-chasing one), not silently assumed solved.
"use strict";
import { rotateByQuat, worldToBody, createBody, boxInertia } from "../physics/mechanics/rigidBody6dof.mjs";
import { FORWARD_BODY, UP_BODY, createAircraft, stepAircraft } from "../physics/mechanics/aircraftAssembly.mjs";
import { pointingError } from "./autopilot6dof.mjs";

export { FORWARD_BODY, pointingError };   // re-exported: a caller of this file needs both, and pointingError()
                                            // is reused directly from autopilot6dof.mjs, not re-derived here

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub3 = (a, b, s = 1) => [a[0] - b[0] * s, a[1] - b[1] * s, a[2] - b[2] * s];
const norm3 = (v) => Math.hypot(v[0], v[1], v[2]);
const unit3 = (v, fallback) => { const n = norm3(v); return n > 1e-9 ? v.map((c) => c / n) : fallback; };
const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
const WORLD_UP = [0, 0, 1];

/** Bank angle: the rotation about the aircraft's OWN forward axis between its actual "up" (UP_BODY rotated
 * into world frame) and the "up" a wings-level aircraft would have AT THE SAME PITCH -- i.e. roll relative to
 * the local horizon, pitch and heading factored out. Zero for wings-level flight at any pitch/heading; grows
 * as the aircraft rolls. Proven exact in this file's own gate (readback under pure roll, zero under pitch-
 * alone/yaw-alone, correct isolation under combined pitch+roll) before being used in decide() below. */
export function bankAngle(q) {
    const f = rotateByQuat(q, FORWARD_BODY);
    const u = rotateByQuat(q, UP_BODY);
    const levelUp = unit3(sub3(WORLD_UP, f, dot3(WORLD_UP, f)), u);
    return Math.atan2(dot3(cross3(levelUp, u), f), dot3(levelUp, u));
}

/** The shortest angular distance from `a` to `b`, wrapped into [-pi,pi] -- a naive `b-a` is undefined/wrong for
 * angles measured via atan2 (like bankAngle()) whenever the true difference approaches +/-180deg. */
function wrapAngle(a) { let d = a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

export const AUTOPILOT_AIRCRAFT = { kp: 5, kHeadingToBank: 1, maxBank: 30 * Math.PI / 180, kpBank: 0.3, kdBank: 1.2 };

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
 * derived from a linearised closed form. Returns {controls, facingCos, eBody, currentBank, desiredBank} --
 * `controls` is exactly the shape aircraftAssembly.mjs's stepAircraft() expects; `currentBank`/`desiredBank`
 * (radians, this tick's bankAngle() reading and this tick's bank target) are exposed for telemetry/reporting,
 * not required by any caller driving the aircraft.
 */
export function decide(body, desiredForward, opts = {}) {
    const spec = { ...AUTOPILOT_AIRCRAFT, ...opts };
    const kd = opts.kd != null ? opts.kd : 2 * Math.sqrt(spec.kp);
    const currentForward = rotateByQuat(body.q, FORWARD_BODY);
    const desiredUnit = unit3(desiredForward, currentForward);
    const eWorld = pointingError(currentForward, desiredUnit);
    const eBody = worldToBody(body.q, eWorld);

    // desiredBank reuses the SAME eBody[2] yaw-error signal pointingError() already computes for yaw -- see this
    // file's header on why (a large heading error commands a bigger bank, an already-aligned heading commands
    // exactly zero bank). bankErr is WRAPPED (wrapAngle()) since bankAngle() is an atan2-based, mod-2pi quantity.
    const desiredBank = clamp(spec.kHeadingToBank * eBody[2], -spec.maxBank, spec.maxBank);
    const currentBank = bankAngle(body.q);
    const bankErr = wrapAngle(desiredBank - currentBank);
    // SIGN: roll's torque polarity is OPPOSITE pitch/yaw's (positive roll command -> NEGATIVE torque.x, a
    // directly-measured fact -- see this file's header) -- see this file's header for the sign derivation and the
    // first (wrong) draft that copied pitch/yaw's own pattern directly and produced chaotic full barrel rolls.
    const roll = clamp(-spec.kpBank * bankErr + spec.kdBank * body.w[0]);
    const pitch = clamp(spec.kp * eBody[1] - kd * body.w[1]);
    const yaw = clamp(spec.kp * eBody[2] - kd * body.w[2]);

    return { controls: { pitch, roll, yaw }, facingCos: dot3(currentForward, desiredUnit), eBody, currentBank, desiredBank };
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
    let maxCommandedBankDeg = 0;
    for (; ticks < 600; ticks++) {
        const d = decide(s, desiredForward);
        maxCommandedBankDeg = Math.max(maxCommandedBankDeg, Math.abs(d.desiredBank * 180 / Math.PI));
        s = stepAircraft(aircraft, s, d.controls, 1 / 30).state;
    }
    const finalFacing = rotateByQuat(s.q, FORWARD_BODY).reduce((a, v, i) => a + v * desiredForward[i], 0);
    const finalBankDeg = bankAngle(s.q) * 180 / Math.PI;
    return [
        "[autopilotAircraft] a heading-hold PD attitude controller for aircraftAssembly.mjs aircraft -- pitch/yaw",
        "                    via autopilot6dof.mjs's own pointingError(), roll via a BANK-ANGLE controller (targets",
        "                    an actual bank proportional to the yaw error, redirecting wing lift into the turn --",
        "                    see this file's header for the sign derivation and what this does/does not solve).",
        `  10deg general-axis attitude perturbation, 20s: facing ${startFacing.toFixed(4)} -> ${finalFacing.toFixed(4)}`,
        `  peak COMMANDED bank ${maxCommandedBankDeg.toFixed(2)}deg (desiredBank), actual bank ends at ${finalBankDeg.toFixed(4)}deg`,
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
