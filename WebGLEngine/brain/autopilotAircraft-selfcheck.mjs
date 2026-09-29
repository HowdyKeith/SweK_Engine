// WebGLEngine/brain/autopilotAircraft-selfcheck.mjs
//
// Run: node brain/autopilotAircraft-selfcheck.mjs
//
// THE SIBLING GATE OF brain/autopilotAircraft.mjs. FIVE properties are load-bearing this round (the banked-
// turn round -- see this file's own header for the full derivation):
//   SECTION 2 -- bankAngle() ITSELF. Proven exact for pure roll (readback to the radian, both signs, up to
//     +/-90deg), exactly zero for pitch-alone or yaw-alone at any magnitude, and correctly isolates the roll
//     component under combined pitch+roll -- a well-posed "how far off level" measurement, checked BEFORE
//     trusting decide() to build on it.
//   SECTION 2B -- bankAngle()'s OWN REAL DISCONTINUITY AT NOSE-VERTICAL, AN ADVERSARIAL REVIEW'S OWN FINDING.
//     A near-180deg jump exists right at the pole (levelUp's projection degenerates, unit3()'s fallback silently
//     substitutes a different reference). Gated as BOTH real (a fixed roll reads correctly on one side of the
//     pole and jumps on the other, with no NaN) AND currently dormant (every convergence scenario this gate and
//     es-aircraft.html's own patrol actually fly stays measurably clear of it) -- named plainly in this file's
//     own header as a genuinely open limitation, not fixed this round and not silently left untested either.
//   SECTION 3 -- THE BANK-ANGLE PD SIGN. A first draft copied pitch/yaw's own `kp*e - kd*w` pattern directly
//     and it was backwards: roll's torque polarity is OPPOSITE pitch/yaw's (aircraftAssembly.mjs's own gate:
//     positive roll command -> NEGATIVE torque.x), so the whole law needs the opposite overall sign. Checked
//     here the same mirrored way every other sign convention in this codebase has been: BOTH the proportional
//     term (bank error alone, rate held at zero) and the derivative term (rate alone, bank error held at zero)
//     must each independently produce the command sign that actually reduces the corresponding error through
//     the REAL simulator, not merely "look right" for one case.
//   SECTION 3B -- BANK-ERROR WRAPAROUND. bankAngle() is an atan2-based, mod-2pi quantity -- a naive
//     `desiredBank - currentBank` is undefined/wrong whenever the true difference approaches +/-180deg. Checked
//     with a scenario where the RAW difference exceeds 180deg by construction (a body rolled to -170deg with a
//     large heading error saturating desiredBank at +30deg, raw diff = 200deg) so the wrapped and unwrapped
//     answers have OPPOSITE signs -- a clean differential, not merely "some" behavior change.
//   SECTIONS 5/5B/5C/6 -- CONVERGENCE, MEASURED AGAINST THE REAL NONLINEAR SIMULATOR, not asserted from memory.
//     Every number here (and in this file's own header) came from actually running decide() through
//     aircraftAssembly.mjs's stepAircraft() with no page-level engine thrust (matching this gate's own
//     established convention from before this round -- aircraftAssembly.mjs's own stepAircraft() has no engine
//     term at all, see its header) and reading back what happened, INCLUDING an honest regression this round's
//     own first draft of its header did NOT mention: a 120deg perturbation, already past where either design
//     fully reacquires, converges to a WORSE facingCos under the new bank-authority design (0.4399) than the
//     old pure-rate-damped one (0.6499) -- named here and corrected in this file's own header rather than left
//     as a silent overclaim, matching this session's "prove what's true, name what's not" discipline.
//
// SABOTAGE LOG -- each applied to brain/autopilotAircraft.mjs, the gate run, the module restored (diffed to
// confirm byte-identical). Counts are what actually ran, not predicted:
//   A  the bank-PD sign flipped back to the FIRST (wrong) draft this round's header documents finding
//      (`roll = spec.kpBank*bankErr - spec.kdBank*body.w[0]`, copying pitch/yaw's own pattern instead of using
//      the opposite overall sign) -> 21 red: every one of section 3's proportional/derivative sign and torque-
//      direction checks, section 3b's wraparound differential (the wrapped sign itself is now wrong), and
//      sections 5/5b/5c/6/8's convergence/boundedness/pure-roll-settle checks -- the 180s long-horizon run's
//      |w| blows past the bound and the pure-roll-only perturbation never settles back toward level at all.
//   B  wrapAngle() short-circuited to the identity (`function wrapAngle(a) { return a; }`) -> 1 red: section 3b's
//      own wrapped-vs-unwrapped differential (the only scenario in this gate that actually drives the raw bank
//      difference past +/-180deg -- everywhere else in the gate the raw difference stays within range, so
//      wrapping is a no-op there and this sabotage is invisible to any OTHER section, exactly why 3b exists as
//      its own dedicated, deliberately-constructed scenario rather than relying on the ordinary-flight sections).
//   C  bankAngle()'s cross product argument order flipped (`cross3(u, levelUp)` instead of `cross3(levelUp, u)`)
//      -- negates the whole function's sign -> 21 red: every one of section 2's pure-roll-readback and combined-
//      pitch+roll isolation checks (all now report the exact opposite sign), section 3b's currentBank/wraparound
//      checks, and every downstream section that depends on bankAngle() being sign-correct (3, 5b, 8). *** A
//      DIFFERENT SABOTAGE -- removing bankAngle()'s explicit levelUp projection (`sub3(WORLD_UP, f, dot3(WORLD_UP,
//      f))` replaced with plain `WORLD_UP`) -- WAS ALSO TRIED AND WENT 0 RED, AND THAT IS NOT A GAP IN THIS GATE:
//      it is a genuine algebraic property of the formula, checked by hand before being trusted. Because UP_BODY
//      is always perpendicular to FORWARD_BODY (an invariant rotateByQuat's own isometry preserves) and atan2's
//      two arguments are each LINEAR in levelUp, adding any multiple of `f` to levelUp scales the numerator
//      `cross3(levelUp,u).f` and the denominator `dot3(levelUp,u)` by the exact same positive factor -- so
//      atan2 returns an IDENTICAL angle whether or not the f-component is projected out first. The projection
//      is kept because it documents intent (levelUp IS the perpendicular component, by definition, not merely
//      "a vector that happens to give the right answer after cancellation") -- provably redundant to the output,
//      not a live branch this gate owes coverage to.
//   D  the roll-damping sign flipped back to the OLD (pre-this-round) `-spec.kRollDamp * body.w[0]` naive
//      pattern is no longer applicable (kRollDamp does not exist in this design) -- superseded by sabotage A
//      above, which is this round's own version of the same class of bug.
//   E  pitch and yaw's kd term dropped (`spec.kp * eBody[i]` alone, no `- kd * body.w[i]`) -> 3 red: section 5's
//      convergence/boundedness checks (the undamped settle is measurably worse and still drifting) and section
//      7's direct default-kd-vs-zero-kd comparison (the two now read IDENTICAL, since decide()'s own default
//      has silently become zero damping too). Unaffected by this round's changes -- carried over, re-run.
//   F  pointingError() call's arguments swapped (`pointingError(desiredUnit, currentForward)` instead of
//      `pointingError(currentForward, desiredUnit)`) -- the error vector now points the WRONG way -> 11 red:
//      section 3b (desiredBank now saturates the wrong direction), section 4's absolute-sign checks, and
//      sections 5/5b/7's convergence checks (the aircraft now steers AWAY from the held heading).
//      *** THIS IS WHY SECTION 4 CHECKS AN ABSOLUTE SIGN, NOT A BARE "NONZERO" OR EVEN A MIRRORED PAIR: *** an
//      earlier version of section 4 asserted only that +5deg/-5deg gave MIRRORED eBody[1] values, which this
//      sabotage does NOT break -- negating BOTH sides of a mirror relationship preserves the mirror itself
//      (if A=-B then also -A=-(-B)=B still holds), so that check passed right through it. Only an
//      independently-derived ABSOLUTE sign (tied to freeRotation.mjs's own rotation convention, not to the
//      other measurement) actually catches a uniform global sign flip -- caught here BEFORE it was ever
//      committed, by testing the test itself against this exact sabotage rather than trusting it on inspection.
//   G  decide()'s desiredForward normalisation removed (`pointingError(currentForward, desiredForward)` instead
//      of `pointingError(currentForward, desiredUnit)`, `desiredUnit` computed via `unit3()`) -- an adversarial
//      review's own finding, a real demonstrated gap where a non-unit input silently distorted eBody's
//      magnitude with no error -> 2 red: section 1b's own dedicated equal-under-rescaling checks, both the
//      controls and the eBody comparison. Nothing else goes red -- every other section already calls decide()
//      with an already-unit [1,0,0], so the gap was invisible everywhere else, exactly why the review flagged
//      it as a latent robustness issue rather than a currently-live bug in this file's own test scenarios.
"use strict";
import { createBody, boxInertia, rotateByQuat } from "../physics/mechanics/rigidBody6dof.mjs";
import { createAircraft, stepAircraft } from "../physics/mechanics/aircraftAssembly.mjs";
import * as AP from "./autopilotAircraft.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const norm3 = (v) => Math.hypot(v[0], v[1], v[2]);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function wrapDeg(d) { let x = d; while (x > 180) x -= 360; while (x < -180) x += 360; return x; }

function quatFromAxisAngle(axis, angle) {
    const n = norm3(axis), u = axis.map((v) => v / n), h = angle / 2;
    return [Math.cos(h), u[0] * Math.sin(h), u[1] * Math.sin(h), u[2] * Math.sin(h)];
}
function quatMul(a, b) {
    return [
        a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
        a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
        a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
        a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
    ];
}
/** A self-consistent light-aircraft body -- real fuselage length/height (hx=3, hz=0.6), not aircraftAssembly.mjs's
 * own reportLines() paper-thin illustrative one, matching this file's header on why inertia scale matters. */
function makeBody(qErrAxis, errorDeg) {
    const I = boxInertia({ m: 600, hx: 3, hy: 3, hz: 0.6 });
    const q = qErrAxis ? quatMul(quatFromAxisAngle(qErrAxis, errorDeg * Math.PI / 180), [1, 0, 0, 0]) : [1, 0, 0, 0];
    return createBody({ mass: 600, I, pos: [0, 0, 0], vel: rotateByQuat(q, [30, 0, 0]), q });
}

console.log("autopilotAircraft-selfcheck -- a heading-hold PD attitude controller for aircraftAssembly.mjs\n");

console.log("1. decide() RETURNS THE SHAPE stepAircraft() EXPECTS, ALL COMMANDS WITHIN [-1,1]");
{
    const body = makeBody([0.3, 0.7, -0.2], 15);
    const d = AP.decide(body, [1, 0, 0]);
    ok("controls has exactly pitch/roll/yaw", "pitch" in d.controls && "roll" in d.controls && "yaw" in d.controls);
    ok("!! every command is within [-1,1]", [d.controls.pitch, d.controls.roll, d.controls.yaw].every((v) => v >= -1 && v <= 1), `${JSON.stringify(d.controls)}`);
    ok("facingCos, eBody, currentBank, desiredBank are present and finite", Number.isFinite(d.facingCos) && d.eBody.every(Number.isFinite) && Number.isFinite(d.currentBank) && Number.isFinite(d.desiredBank));
}

console.log("\n1b. desiredForward IS NORMALISED -- a non-unit input gives the SAME result as its own unit direction");
{
    // an adversarial review found this: desiredForward went straight into pointingError() with no
    // normalisation, unlike autopilot6dof.mjs's own decide() (which always runs its target direction through
    // unit3() first). A caller passing [2,0,0] instead of [1,0,0] -- same DIRECTION, wrong magnitude -- silently
    // got a ~2x distorted eBody and a wrongly-saturated command, with no error. Fixed by running desiredForward
    // through the same unit3(v, fallback) pattern autopilot6dof.mjs already uses.
    const body = makeBody([0, 1, 0], 5);
    const dUnit = AP.decide(body, [1, 0, 0]);
    const dScaled = AP.decide(body, [2, 0, 0]);
    ok("!! a non-unit desiredForward gives EXACTLY the same controls as its own unit direction", JSON.stringify(dUnit.controls) === JSON.stringify(dScaled.controls), `unit=${JSON.stringify(dUnit.controls)} scaled=${JSON.stringify(dScaled.controls)}`);
    ok("!! ...and exactly the same eBody, not merely a similar one", JSON.stringify(dUnit.eBody) === JSON.stringify(dScaled.eBody), `unit=${dUnit.eBody} scaled=${dScaled.eBody}`);
}

console.log("\n2. *** bankAngle() ITSELF, PROVEN BEFORE decide() IS TRUSTED TO BUILD ON IT ***");
{
    ok("identity: bankAngle === exactly 0", AP.bankAngle([1, 0, 0, 0]) === 0, `${AP.bankAngle([1, 0, 0, 0])}`);

    for (const deg of [10, 30, 60, 90, -30, -90]) {
        const q = quatFromAxisAngle([1, 0, 0], deg * Math.PI / 180);   // FORWARD_BODY is [1,0,0]
        const measured = AP.bankAngle(q) * 180 / Math.PI;
        ok(`!! pure roll=${deg}deg -> bankAngle reads back exactly (${measured.toFixed(6)}deg)`, Math.abs(measured - deg) < 1e-6, `expected ${deg}`);
    }
    for (const deg of [10, 45, -30, 80]) {
        const q = quatFromAxisAngle([0, 1, 0], deg * Math.PI / 180);
        const measured = AP.bankAngle(q) * 180 / Math.PI;
        ok(`!! pitch=${deg}deg ALONE -> bankAngle stays exactly 0 (${measured.toFixed(8)}deg)`, Math.abs(measured) < 1e-6, `${measured}`);
    }
    for (const deg of [30, 90, 180, -60]) {
        const q = quatFromAxisAngle([0, 0, 1], deg * Math.PI / 180);
        const measured = AP.bankAngle(q) * 180 / Math.PI;
        ok(`!! heading=${deg}deg ALONE -> bankAngle stays exactly 0 (${measured.toFixed(8)}deg)`, Math.abs(measured) < 1e-6, `${measured}`);
    }
    for (const [pitchDeg, rollDeg] of [[20, 30], [-40, 60], [70, -45]]) {
        const qPitch = quatFromAxisAngle([0, 1, 0], pitchDeg * Math.PI / 180);
        const q = quatMul(qPitch, quatFromAxisAngle([1, 0, 0], rollDeg * Math.PI / 180));   // roll first (body frame), then pitch (world frame)
        const measured = AP.bankAngle(q) * 180 / Math.PI;
        ok(`!! pitch=${pitchDeg}deg + roll=${rollDeg}deg -> bankAngle isolates JUST the roll (${measured.toFixed(4)}deg)`, Math.abs(measured - rollDeg) < 1e-3, `expected ~${rollDeg}`);
    }
}

console.log("\n2b. *** bankAngle() HAS A REAL, UNGUARDED ~180deg DISCONTINUITY RIGHT AT NOSE-VERTICAL -- AN ***");
console.log("    *** ADVERSARIAL REVIEW'S OWN FINDING. GATED HERE AS A REAL, NAMED LIMITATION (this file's own");
console.log("    header), not silently left out. Proven both REAL and CURRENTLY DORMANT, not merely asserted.");
{
    // the jump is razor-narrow (a fraction of a degree either side of the pole), not a wide degraded zone --
    // demonstrated directly: a fixed 40deg roll reads correctly right up to pitch=89.999deg, then snaps.
    const rollDeg = 40;
    const justBelow = quatMul(quatFromAxisAngle([0, 1, 0], 89.999 * Math.PI / 180), quatFromAxisAngle([1, 0, 0], rollDeg * Math.PI / 180));
    const atPole = quatMul(quatFromAxisAngle([0, 1, 0], 90 * Math.PI / 180), quatFromAxisAngle([1, 0, 0], rollDeg * Math.PI / 180));
    const justAbove = quatMul(quatFromAxisAngle([0, 1, 0], 90.001 * Math.PI / 180), quatFromAxisAngle([1, 0, 0], rollDeg * Math.PI / 180));
    const belowDeg = AP.bankAngle(justBelow) * 180 / Math.PI, poleDeg = AP.bankAngle(atPole) * 180 / Math.PI, aboveDeg = AP.bankAngle(justAbove) * 180 / Math.PI;
    ok("just below the pole (pitch=89.999deg): bankAngle still reads the true roll correctly", Math.abs(belowDeg - rollDeg) < 1e-3, `${belowDeg.toFixed(4)}deg`);
    ok("!! the discontinuity is REAL: a 0.002deg attitude change (89.999 -> 90.001) swings bankAngle by over 90deg", Math.abs(wrapDeg(aboveDeg - belowDeg)) > 90, `${belowDeg.toFixed(4)}deg -> ${poleDeg.toFixed(4)}deg -> ${aboveDeg.toFixed(4)}deg`);
    ok("...and it never produces NaN/Infinity even exactly at the pole -- a real jump, not a crash", [belowDeg, poleDeg, aboveDeg].every(Number.isFinite));

    // DORMANCY: every perturbation angle this gate's own convergence sections (5/5b/5c) actually fly through
    // stays measurably clear of the pole -- proven here directly, not assumed from "it happened to pass".
    const aircraft = createAircraft();
    const desiredForward = [1, 0, 0];
    let worstClearanceDeg = 90;
    for (const deg of [10, 25, 60, 90, 120]) {
        let body = makeBody([0.3, 0.7, -0.2], deg);
        for (let i = 0; i < 900; i++) {
            const d = AP.decide(body, desiredForward);
            body = stepAircraft(aircraft, body, d.controls, 1 / 30).state;
            const f = rotateByQuat(body.q, AP.FORWARD_BODY);
            const clearanceDeg = 90 - Math.abs(Math.asin(Math.max(-1, Math.min(1, f[2]))) * 180 / Math.PI);
            worstClearanceDeg = Math.min(worstClearanceDeg, clearanceDeg);
        }
    }
    ok("!! every convergence scenario this gate actually runs (10-120deg perturbations) stays well clear of the pole", worstClearanceDeg > 5, `closest approach: ${worstClearanceDeg.toFixed(2)}deg from vertical`);
}

console.log("\n3. *** THE BANK-ANGLE PD SIGN: THE PROPORTIONAL TERM AND THE DERIVATIVE TERM EACH INDEPENDENTLY ***");
console.log("   *** MUST PRODUCE THE COMMAND SIGN THAT ACTUALLY REDUCES THE CORRESPONDING ERROR ***");
{
    const aircraft = createAircraft();
    // PROPORTIONAL half: heading already aligned (desiredBank = 0), rate held at zero, but the aircraft is
    // ALREADY banked +20deg (rolled about FORWARD_BODY, which does not itself move the nose -- see section 2's
    // own pure-roll proof) -- bankErr = 0 - 20deg, a pure proportional case with no derivative contribution.
    const bodyBankedPos = { ...makeBody([1, 0, 0], 20), w: [0, 0, 0] };
    const bodyBankedNeg = { ...makeBody([1, 0, 0], -20), w: [0, 0, 0] };
    const dBankedPos = AP.decide(bodyBankedPos, [1, 0, 0]);
    const dBankedNeg = AP.decide(bodyBankedNeg, [1, 0, 0]);
    ok("!! banked +20deg (bankErr<0): roll command is POSITIVE -- rolls back toward level", dBankedPos.controls.roll > 0, `roll=${dBankedPos.controls.roll} currentBank=${(dBankedPos.currentBank * 180 / Math.PI).toFixed(2)}deg`);
    ok("!! banked -20deg (bankErr>0): roll command is NEGATIVE -- the exact mirror", dBankedNeg.controls.roll < 0, `roll=${dBankedNeg.controls.roll} currentBank=${(dBankedNeg.currentBank * 180 / Math.PI).toFixed(2)}deg`);
    for (const [label, body, d, wantNegW] of [["+20deg bank", bodyBankedPos, dBankedPos, true], ["-20deg bank", bodyBankedNeg, dBankedNeg, false]]) {
        // ONE tick moves the bank ANGLE itself by only a second-order-in-dt amount (torque changes w first, w
        // only then integrates into angle over the FOLLOWING ticks) -- checking |bank| after a single 1/30s tick
        // is below the precision this measures at, a real gap this file's own first draft of this check had.
        // Check the immediate, directly-observable effect (w[0]'s sign after one tick) AND the accumulated,
        // physically meaningful effect (|bank| after a full second, 30 ticks) instead.
        const r = stepAircraft(aircraft, body, d.controls, 1 / 30);
        ok(`!! [${label}] applying decide()'s own command through the REAL simulator pushes w[0] the BANK-REDUCING way after one tick`, wantNegW ? r.state.w[0] < 0 : r.state.w[0] > 0, `w0 -> ${r.state.w[0]}`);
        let b = body;
        for (let i = 0; i < 30; i++) { const dd = AP.decide(b, [1, 0, 0]); b = stepAircraft(aircraft, b, dd.controls, 1 / 30).state; }
        const bankBefore = Math.abs(AP.bankAngle(body.q)), bankAfter = Math.abs(AP.bankAngle(b.q));
        ok(`!! [${label}] ...and REDUCES |bank| meaningfully after a full second (30 ticks)`, bankAfter < bankBefore - 1 * Math.PI / 180, `|bank| ${(bankBefore * 180 / Math.PI).toFixed(4)}deg -> ${(bankAfter * 180 / Math.PI).toFixed(4)}deg`);
    }

    // DERIVATIVE half: heading aligned AND level (bankErr = 0), but already ROLLING -- pure derivative case.
    const bodyRatePos = { ...makeBody(null, 0), w: [2, 0, 0] };
    const bodyRateNeg = { ...makeBody(null, 0), w: [-2, 0, 0] };
    const dRatePos = AP.decide(bodyRatePos, [1, 0, 0]);
    const dRateNeg = AP.decide(bodyRateNeg, [1, 0, 0]);
    ok("!! bankErr=0, w[0]=+2: roll command is POSITIVE (aircraftAssembly.mjs: +roll -> -torque.x, needed to oppose +w)", dRatePos.controls.roll > 0, `roll=${dRatePos.controls.roll}`);
    ok("!! bankErr=0, w[0]=-2: roll command is NEGATIVE -- the exact mirror", dRateNeg.controls.roll < 0, `roll=${dRateNeg.controls.roll}`);
    ok("!! dRatePos.roll === -dRateNeg.roll EXACTLY (pure rate damping is odd in w when bankErr=0)", dRatePos.controls.roll === -dRateNeg.controls.roll, `${dRatePos.controls.roll} vs ${dRateNeg.controls.roll}`);
    for (const [label, body, d] of [["w0=+2 rad/s", bodyRatePos, dRatePos], ["w0=-2 rad/s", bodyRateNeg, dRateNeg]]) {
        const r = stepAircraft(aircraft, body, d.controls, 1 / 30);
        ok(`!! [${label}] applying decide()'s own command through the REAL simulator REDUCES |w[0]| after one tick`, Math.abs(r.state.w[0]) < Math.abs(body.w[0]), `|w0| ${Math.abs(body.w[0])} -> ${Math.abs(r.state.w[0])}`);
    }
}

console.log("\n3b. BANK-ERROR WRAPAROUND: a bank near +/-180deg must use the SHORTEST angular path, not naive subtraction");
{
    // roll the body -170deg about its own forward axis (pure roll -- forward direction, hence eBody[2]'s heading
    // meaning, is untouched) THEN yaw it 90deg so there is a large heading error to saturate desiredBank at
    // +maxBank (30deg). raw (desiredBank - currentBank) = 30 - (-170) = 200deg -- outside [-180,180], so a naive
    // subtraction and the correctly-wrapped -160deg value have OPPOSITE signs, a clean differential test.
    const qRoll = quatFromAxisAngle([1, 0, 0], -170 * Math.PI / 180);
    const qYaw = quatFromAxisAngle([0, 0, 1], 90 * Math.PI / 180);
    const q = quatMul(qYaw, qRoll);
    const body = { ...makeBody(null, 0), q, vel: rotateByQuat(q, [30, 0, 0]) };
    const desiredForward = [1, 0, 0];
    const d = AP.decide(body, desiredForward);
    const currentBankDeg = AP.bankAngle(body.q) * 180 / Math.PI;
    const rawDiffDeg = d.desiredBank * 180 / Math.PI - currentBankDeg;
    ok("!! desiredBank saturates at +maxBank for this large a heading error", Math.abs(d.desiredBank - AP.AUTOPILOT_AIRCRAFT.maxBank) < 1e-9, `desiredBank=${(d.desiredBank * 180 / Math.PI).toFixed(4)}deg`);
    ok("!! currentBank reads near -170deg (this file's own bankAngle(), proven exact in section 2)", currentBankDeg < -160, `currentBank=${currentBankDeg.toFixed(2)}deg`);
    ok("the RAW (unwrapped) difference exceeds 180deg -- exactly the regime wrapAngle() exists for", Math.abs(rawDiffDeg) > 180, `raw=${rawDiffDeg.toFixed(2)}deg`);
    ok("!! decide()'s actual roll command has the WRAPPED sign (positive), not the unwrapped one (which would be negative)", d.controls.roll > 0, `roll=${d.controls.roll}`);
}

console.log("\n4. *** eBody's ABSOLUTE SIGN, NOT JUST 'NONZERO' OR 'MIRRORED' *** (a pointingError()-argument-order");
console.log("   bug negates EVERY eBody component identically -- a bare mirror check between +5deg/-5deg is");
console.log("   INVARIANT to that global flip (if A=-B then also -A=-(-B)=B still holds), so only an ABSOLUTE,");
console.log("   independently-derived sign -- tied to freeRotation.mjs's own convention -- actually catches it)");
{
    // nose pitched 5deg off-heading about +Y (pitch axis): freeRotation.mjs's own convention (established and
    // proven in aeroSurface.mjs's own reportLines(), not re-derived here) is that a POSITIVE rotation
    // about +Y pitches the nose toward -Z -- so a +5deg perturbation pitches the nose slightly DOWN from
    // level, and the correction needed to bring it back UP to the level desiredForward=[1,0,0] must be a
    // NEGATIVE rotation about Y. eBody[1] < 0 is therefore the correct, absolute expectation, not merely "some"
    // nonzero value -- matches the actual measured -0.0873 shown below.
    const bodyPos = makeBody([0, 1, 0], 5), bodyNeg = makeBody([0, 1, 0], -5);
    const dPos = AP.decide(bodyPos, [1, 0, 0]), dNeg = AP.decide(bodyNeg, [1, 0, 0]);
    ok("eBody[0] and eBody[2] stay exactly zero for a pure pitch-axis perturbation (pointingError()'s own null space)", dPos.eBody[0] === 0 && dPos.eBody[2] === 0, `eBody=${dPos.eBody}`);
    ok("!! +5deg (nose pitched DOWN): eBody[1] < 0 -- an ABSOLUTE sign, tied to freeRotation.mjs's convention", dPos.eBody[1] < 0, `eBody[1]=${dPos.eBody[1]}`);
    ok("!! -5deg (nose pitched UP): eBody[1] > 0 -- the independently-derived opposite absolute sign", dNeg.eBody[1] > 0, `eBody[1]=${dNeg.eBody[1]}`);
    ok("...and the two are exact mirrors of each other (a secondary consistency check, not the load-bearing one)", dNeg.eBody[1] === -dPos.eBody[1], `+5deg=${dPos.eBody[1]} -5deg=${dNeg.eBody[1]}`);
}

console.log("\n4b. desiredBank TRACKS THE YAW-ERROR SIGNAL AND CLAMPS AT maxBank -- not a new error signal, reused");
{
    // small heading error -> desiredBank well under maxBank; large heading error -> desiredBank saturates
    // exactly at maxBank. Both measured directly against the real decide(), not asserted from the formula alone.
    const dSmall = AP.decide(makeBody([0, 0, 1], 5), [1, 0, 0]);
    const dBig = AP.decide(makeBody([0, 0, 1], 90), [1, 0, 0]);
    ok("!! a small (5deg) heading error commands a bank well under maxBank", Math.abs(dSmall.desiredBank) < AP.AUTOPILOT_AIRCRAFT.maxBank * 0.5, `desiredBank=${(dSmall.desiredBank * 180 / Math.PI).toFixed(3)}deg vs maxBank=${(AP.AUTOPILOT_AIRCRAFT.maxBank * 180 / Math.PI).toFixed(1)}deg`);
    ok("!! a large (90deg) heading error saturates desiredBank exactly at maxBank", Math.abs(Math.abs(dBig.desiredBank) - AP.AUTOPILOT_AIRCRAFT.maxBank) < 1e-9, `desiredBank=${(dBig.desiredBank * 180 / Math.PI).toFixed(4)}deg`);
}

console.log("\n5. SMALL-ANGLE CONVERGENCE: a 10deg general-axis perturbation converges above 0.999 and STAYS THERE");
{
    const aircraft = createAircraft();
    let body = makeBody([0.3, 0.7, -0.2], 10);
    const desiredForward = [1, 0, 0];
    const startFacing = dot3(rotateByQuat(body.q, AP.FORWARD_BODY), desiredForward);
    let minSecondHalf = 1, maxSecondHalf = -1, ticks = 600;
    for (let i = 0; i < ticks; i++) {
        const d = AP.decide(body, desiredForward);
        body = stepAircraft(aircraft, body, d.controls, 1 / 30).state;
        const facing = dot3(rotateByQuat(body.q, AP.FORWARD_BODY), desiredForward);
        if (i > ticks / 2) { minSecondHalf = Math.min(minSecondHalf, facing); maxSecondHalf = Math.max(maxSecondHalf, facing); }
    }
    ok("started meaningfully off-heading (not trivially already aligned)", startFacing < 0.995, `start=${startFacing}`);
    ok("!! settles above 0.999 (within ~2.6deg of the held heading)", minSecondHalf > 0.999, `2nd-half range=[${minSecondHalf.toFixed(6)}, ${maxSecondHalf.toFixed(6)}]`);
    ok("!! and STAYS bounded there (2nd-half range under 1e-3 wide, not still drifting)", (maxSecondHalf - minSecondHalf) < 1e-3, `width=${(maxSecondHalf - minSecondHalf).toExponential(2)}`);
}

console.log("\n5b. MODERATE/LARGE-ANGLE SINGLE-SHOT: banking measurably improves 90deg, is a wash at 60deg, and");
console.log("    measurably WORSENS 120deg -- all three stated plainly, not just the win");
{
    // measured directly against this exact gate's own harness (no page-level engine thrust, matching this
    // file's own established convention -- aircraftAssembly.mjs's stepAircraft() has none either): the OLD
    // pure-rate-damped design gave 25deg->0.9969, 60deg->0.9783, 90deg->0.8546, 120deg->0.6499. This section
    // gates the NEW numbers directly rather than re-deriving the old ones inline.
    const aircraft = createAircraft();
    const desiredForward = [1, 0, 0];
    function runFor(deg, ticks) {
        let body = makeBody([0.3, 0.7, -0.2], deg);
        let maxW = 0, allFinite = true, final;
        for (let i = 0; i < ticks; i++) {
            const d = AP.decide(body, desiredForward);
            body = stepAircraft(aircraft, body, d.controls, 1 / 30).state;
            maxW = Math.max(maxW, norm3(body.w));
            if (!body.w.every(Number.isFinite)) allFinite = false;
            final = dot3(rotateByQuat(body.q, AP.FORWARD_BODY), desiredForward);
        }
        return { final, maxW, allFinite };
    }
    const r25 = runFor(25, 900), r60 = runFor(60, 900), r90 = runFor(90, 900), r120 = runFor(120, 900);
    ok("!! 25deg converges above 0.995 within 30s", r25.final > 0.995, `final=${r25.final.toFixed(6)}`);
    ok("!! 60deg converges above 0.97 within 30s (essentially unchanged from the old design's 0.978)", r60.final > 0.97, `final=${r60.final.toFixed(6)}`);
    ok("!! 90deg converges above 0.92 within 30s -- SUBSTANTIALLY better than the old design's 0.855", r90.final > 0.92, `final=${r90.final.toFixed(6)}`);
    ok("!! 120deg stays finite and bounded (|w|<1) even though it converges WORSE than the old design", r120.allFinite && r120.maxW < 1, `maxW=${r120.maxW.toFixed(4)}`);
    ok("!! 120deg's own regression is real and gated, not silently dropped: final stays below the old design's 0.65", r120.final < 0.6, `final=${r120.final.toFixed(6)}`);
}

console.log("\n5c. VERY-LARGE-ANGLE (120deg) DOES NOT FULLY CONVERGE, BUT STAYS BOUNDED AND FINITE -- the documented");
console.log("    limitation itself, gated (not diverging is a real, checkable property; not converging is honest)");
{
    const aircraft = createAircraft();
    let body = makeBody([0.3, 0.7, -0.2], 120);
    const desiredForward = [1, 0, 0];
    let maxW = 0, allFinite = true, final, ticks = 900;
    for (let i = 0; i < ticks; i++) {
        const d = AP.decide(body, desiredForward);
        body = stepAircraft(aircraft, body, d.controls, 1 / 30).state;
        maxW = Math.max(maxW, norm3(body.w));
        if (!body.pos.every(Number.isFinite) || !body.vel.every(Number.isFinite) || !body.w.every(Number.isFinite)) allFinite = false;
        final = dot3(rotateByQuat(body.q, AP.FORWARD_BODY), desiredForward);
    }
    ok("!! stays fully finite the whole run -- no NaN/Infinity from a large initial error", allFinite);
    ok("!! |w| stays small and bounded (under 1 rad/s), not runaway", maxW < 1, `maxW=${maxW.toFixed(4)}`);
    ok("does NOT fully converge -- this is the documented limitation itself, not a silent gap", final < 0.9, `final=${final.toFixed(6)}`);
}

console.log("\n6. LONG-HORIZON (180s) BOUNDEDNESS -- |w| never runs away (the exact failure the old sign bug caused)");
{
    const aircraft = createAircraft();
    let body = makeBody([0.3, 0.7, -0.2], 10);
    const desiredForward = [1, 0, 0];
    let maxW = 0;
    for (let i = 0; i < 5400; i++) {
        const d = AP.decide(body, desiredForward);
        body = stepAircraft(aircraft, body, d.controls, 1 / 30).state;
        maxW = Math.max(maxW, norm3(body.w));
    }
    ok("!! |w| never exceeds 1 rad/s across the whole 180s run (the old sign bug reached over 60 rad/s)", maxW < 1, `maxW=${maxW.toFixed(4)}`);
}

console.log("\n7. THE kd TERM (PITCH/YAW) IS LOAD-BEARING: removing it measurably changes small-angle settling behavior");
{
    function settleRange(kd) {
        const aircraft = createAircraft();
        let body = makeBody([0.3, 0.7, -0.2], 10);
        const desiredForward = [1, 0, 0];
        let min = 1, max = -1, ticks = 600;
        for (let i = 0; i < ticks; i++) {
            const d = AP.decide(body, desiredForward, { kd });
            body = stepAircraft(aircraft, body, d.controls, 1 / 30).state;
            const facing = dot3(rotateByQuat(body.q, AP.FORWARD_BODY), desiredForward);
            if (i > ticks / 2) { min = Math.min(min, facing); max = Math.max(max, facing); }
        }
        return { min, max };
    }
    const withDamping = settleRange(undefined);   // default: 2*sqrt(kp)
    const noDamping = settleRange(0);
    ok("!! default damping settles closer to 1.0 than zero damping (2nd-half min)", withDamping.min > noDamping.min, `damped=${withDamping.min.toFixed(6)} undamped=${noDamping.min.toFixed(6)}`);
}

console.log("\n8. PURE-ROLL-ONLY PERTURBATION: forward direction is UNAFFECTED throughout, and bank -- now an actual");
console.log("   TARGETED quantity, not just a damped rate -- settles all the way back to exactly 0deg");
{
    // a rotation purely about the CURRENT forward axis leaves the forward vector itself unchanged --
    // pointingError()'s own degenerate case (eBody[2]=0 throughout, so desiredBank stays 0 too), and exactly the
    // regime the bank-angle PD law alone must handle, with zero help from the pitch/yaw terms. 60s (1800 ticks)
    // is required to see the settle through to convergence -- at only 10s the run is still mid-transient
    // (measured directly: bank=2.13deg, w0=-0.0101 at 10s vs bank=0.000002deg, w0~0 at 60s), a stronger and more
    // honest claim than the old pure-rate-damping law ever supported (that law only ever drove the RATE to zero,
    // never the ANGLE, since it had no bank-angle target at all).
    const aircraft = createAircraft();
    let body = makeBody([1, 0, 0], 30);   // 30deg roll about the nose axis itself
    const desiredForward = [1, 0, 0];
    const startFacing = dot3(rotateByQuat(body.q, AP.FORWARD_BODY), desiredForward);
    const startBankDeg = AP.bankAngle(body.q) * 180 / Math.PI;
    ok("!! facingCos is already exactly 1 -- a pure-roll perturbation does not move the nose", startFacing === 1, `start=${startFacing}`);
    ok("started meaningfully banked (not trivially already level)", Math.abs(startBankDeg - 30) < 1e-6, `startBank=${startBankDeg.toFixed(4)}deg`);
    for (let i = 0; i < 1800; i++) {
        const d = AP.decide(body, desiredForward);
        body = stepAircraft(aircraft, body, d.controls, 1 / 30).state;
    }
    const finalBankDeg = AP.bankAngle(body.q) * 180 / Math.PI;
    ok("!! bank settles to (essentially) exactly 0deg -- a NEW, stronger property the old rate-only law never had", Math.abs(finalBankDeg) < 0.001, `finalBank=${finalBankDeg.toFixed(6)}deg`);
    ok("!! roll rate is damped to (essentially) exactly zero after 60s", Math.abs(body.w[0]) < 1e-4, `w=${body.w}`);
    ok("facing stays exactly 1 throughout (roll never touches pitch/yaw)", dot3(rotateByQuat(body.q, AP.FORWARD_BODY), desiredForward) === 1);
}

console.log("\n9. AUTOPILOT_AIRCRAFT defaults are self-consistent with decide()'s own opts override");
{
    const body = makeBody([0.3, 0.7, -0.2], 10);
    const dDefault = AP.decide(body, [1, 0, 0]);
    const dExplicit = AP.decide(body, [1, 0, 0], {
        kp: AP.AUTOPILOT_AIRCRAFT.kp,
        kHeadingToBank: AP.AUTOPILOT_AIRCRAFT.kHeadingToBank,
        maxBank: AP.AUTOPILOT_AIRCRAFT.maxBank,
        kpBank: AP.AUTOPILOT_AIRCRAFT.kpBank,
        kdBank: AP.AUTOPILOT_AIRCRAFT.kdBank,
    });
    ok("explicit defaults reproduce the implicit-default output exactly", JSON.stringify(dDefault.controls) === JSON.stringify(dExplicit.controls));
}

console.log("\n10. THE FRONT DOOR");
{
    const L = AP.reportLines();
    ok("reportLines names the module and shows a facing-convergence measurement", L.some((l) => /autopilotAircraft/.test(l)) && L.some((l) => /facing/.test(l)));
    ok("...and shows bank telemetry too (the new capability this round adds)", L.some((l) => /bank/i.test(l)));
    ok("...and no report line stringifies a missing field as the literal word \"undefined\"", L.every((l) => !/\bundefined\b/.test(l)));
}

console.log(fails ? `\nautopilotAircraft-selfcheck: ${fails} FAILED` : "\nautopilotAircraft-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
