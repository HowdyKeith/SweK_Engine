// WebGLEngine/brain/autopilotAircraft-selfcheck.mjs
//
// Run: node brain/autopilotAircraft-selfcheck.mjs
//
// THE SIBLING GATE OF brain/autopilotAircraft.mjs. TWO properties are load-bearing:
//   SECTION 2 -- THE ROLL-DAMPING SIGN. A first draft used `roll = -kRollDamp * w[0]` (the naively "obvious"
//     sign, opposing the SIGN of w directly) and it is BACKWARDS: aircraftAssembly.mjs's own gate established
//     that a POSITIVE roll command produces NEGATIVE torque.x, so damping a positive w[0] needs a POSITIVE
//     command. The wrong sign was measured directly, before this file existed in its current form, to blow
//     roll rate from 0 past 60 rad/s over a 90-second real-simulator run while the "correction" sat saturated
//     the entire time -- positive feedback, not damping. Checked here the same mirrored way this session's
//     other sign bugs were: BOTH signs of w[0] must produce an OPPOSITE-signed command, and applying that
//     command through the real aircraftAssembly.mjs pipeline must measurably REDUCE |w[0]| after a real tick,
//     for both signs, not merely "look right" for one.
//   SECTION 4/5 -- SMALL-ANGLE CONVERGENCE AND LONG-HORIZON BOUNDEDNESS, against the REAL nonlinear simulator
//     (this file's control law does not reduce to a closed-form damped oscillator the way autopilot6dof.mjs's
//     direct-torque law does -- see this file's own header). A small (10deg) general-axis perturbation must
//     converge above 0.999 and stay there; a 180-second run from the same kind of perturbation must never let
//     |w| exceed a small bound -- the exact failure mode section 2's sign bug produced, now proven absent.
//
// SABOTAGE LOG -- each applied to brain/autopilotAircraft.mjs, the gate run, the module restored (diffed to
// confirm byte-identical). Counts are what actually ran, not predicted:
//   A  the roll-damping sign flipped back to `-spec.kRollDamp * body.w[0]` (the actual bug this file's own
//      header documents finding) -> 9 red: section 2's direct sign-relationship and torque-reduces-|w| checks
//      (all 4), sections 4/4b/4c/5's convergence/boundedness checks -- |w| reaches 82.67 rad/s over the 180s
//      run, reproducing the originally-measured runaway on demand, not asserted from memory.
//   B  pitch and yaw's kd term dropped (`spec.kp * eBody[i]` alone, no `- kd * body.w[i]`) -> 3 red: section
//      4's convergence/boundedness checks (the undamped settle is measurably worse and still drifting) and
//      section 6's direct default-kd-vs-zero-kd comparison (the two now read IDENTICAL, since decide()'s own
//      default has silently become zero damping too).
//   C  pointingError() call's arguments swapped (`pointingError(desiredUnit, currentForward)` instead of
//      `pointingError(currentForward, desiredUnit)`) -- the error vector now points the WRONG way -> 5 red.
//      *** THIS IS WHY SECTION 3 CHECKS AN ABSOLUTE SIGN, NOT A BARE "NONZERO" OR EVEN A MIRRORED PAIR: *** an
//      earlier version of section 3 asserted only that +5deg/-5deg gave MIRRORED eBody[1] values, which this
//      sabotage does NOT break -- negating BOTH sides of a mirror relationship preserves the mirror itself
//      (if A=-B then also -A=-(-B)=B still holds), so that check passed right through it. Only an
//      independently-derived ABSOLUTE sign (tied to freeRotation.mjs's own rotation convention, not to the
//      other measurement) actually catches a uniform global sign flip -- caught here BEFORE it was ever
//      committed, by testing the test itself against this exact sabotage rather than trusting it on inspection.
//   D  decide()'s desiredForward normalisation removed (`pointingError(currentForward, desiredForward)` instead
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
    ok("facingCos and eBody are present and finite", Number.isFinite(d.facingCos) && d.eBody.every(Number.isFinite));
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

console.log("\n2. *** THE ROLL-DAMPING SIGN: MIRRORED w[0] MUST GIVE MIRRORED COMMAND, AND THE COMMAND MUST ***");
console.log("   *** ACTUALLY REDUCE |w[0]| AFTER A REAL TICK -- NOT MERELY HAVE 'A' SIGN ***");
{
    const aircraft = createAircraft();
    const bodyPos = { ...makeBody(null, 0), w: [2, 0, 0] };   // an aircraft already rolling at +2 rad/s
    const bodyNeg = { ...makeBody(null, 0), w: [-2, 0, 0] };   // ...and the mirror, -2 rad/s
    const dPos = AP.decide(bodyPos, [1, 0, 0]);
    const dNeg = AP.decide(bodyNeg, [1, 0, 0]);
    ok("!! w[0]=+2 gives a POSITIVE roll command (aircraftAssembly.mjs: +roll -> -torque.x, needed to oppose +w)", dPos.controls.roll > 0, `roll=${dPos.controls.roll}`);
    ok("!! w[0]=-2 gives a NEGATIVE roll command -- the exact mirror, not just 'some' sign", dNeg.controls.roll < 0, `roll=${dNeg.controls.roll}`);
    ok("!! dPos.roll === -dNeg.roll EXACTLY (pure rate damping is odd in w)", dPos.controls.roll === -dNeg.controls.roll, `${dPos.controls.roll} vs ${dNeg.controls.roll}`);

    for (const [label, body, d] of [["+2 rad/s", bodyPos, dPos], ["-2 rad/s", bodyNeg, dNeg]]) {
        const r = stepAircraft(aircraft, body, d.controls, 1 / 30);
        ok(`!! [w0=${label}] applying decide()'s own command through the REAL simulator REDUCES |w[0]| after one tick`, Math.abs(r.state.w[0]) < Math.abs(body.w[0]), `|w0| ${Math.abs(body.w[0])} -> ${Math.abs(r.state.w[0])}`);
    }
}

console.log("\n3. *** eBody's ABSOLUTE SIGN, NOT JUST 'NONZERO' OR 'MIRRORED' *** (a pointingError()-argument-order");
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

console.log("\n4. SMALL-ANGLE CONVERGENCE: a 10deg general-axis perturbation converges above 0.999 and STAYS THERE");
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

console.log("\n4b. MODERATE-ANGLE (25deg) STILL CONVERGES WELL -- backing this file's own header claim with a real number");
{
    // an adversarial review found the header's "15-25deg stays bounded above 0.98" claim had no gate assertion
    // behind it at all -- this section is that assertion, with a measured value (0.9969), not a guess.
    const aircraft = createAircraft();
    let body = makeBody([0.3, 0.7, -0.2], 25);
    const desiredForward = [1, 0, 0];
    let final, ticks = 900;
    for (let i = 0; i < ticks; i++) {
        const d = AP.decide(body, desiredForward);
        body = stepAircraft(aircraft, body, d.controls, 1 / 30).state;
        final = dot3(rotateByQuat(body.q, AP.FORWARD_BODY), desiredForward);
    }
    ok("!! a 25deg general-axis perturbation converges above 0.99 within 30s", final > 0.99, `final=${final.toFixed(6)}`);
}

console.log("\n4c. LARGE-ANGLE (120deg) DOES NOT FULLY CONVERGE, BUT STAYS BOUNDED AND FINITE -- the documented");
console.log("    limitation itself, gated (not diverging is a real, checkable property; not converging is honest)");
{
    // an adversarial review also found the header's "30deg+ is out of scope" boundary was never actually gated
    // either, and its own independent sweep (15-45deg all still >0.98; real degradation sets in around 60deg+)
    // showed the boundary undersold the controller. This section gates the ACTUAL documented limitation directly:
    // at a genuinely large angle, the controller does not reacquire the heading (real, no banked-turn coordination)
    // but it also never diverges or produces NaN/unbounded state -- degrades gracefully, doesn't fail catastrophically.
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

console.log("\n5. LONG-HORIZON (180s) BOUNDEDNESS -- |w| never runs away (the exact failure the sign bug caused)");
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
    ok("!! |w| never exceeds 1 rad/s across the whole 180s run (the sign bug reached over 60 rad/s)", maxW < 1, `maxW=${maxW.toFixed(4)}`);
}

console.log("\n6. THE kd TERM IS LOAD-BEARING: removing it measurably changes small-angle settling behavior");
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

console.log("\n7. PURE-ROLL-ONLY PERTURBATION: forward direction is UNAFFECTED, roll rate is damped toward zero");
{
    // a rotation purely about the CURRENT forward axis leaves the forward vector itself unchanged --
    // pointingError()'s own degenerate case, and exactly the axis roll's rate-damping law (not eBody) must handle.
    const aircraft = createAircraft();
    let body = makeBody([1, 0, 0], 30);   // 30deg roll about the nose axis itself
    const desiredForward = [1, 0, 0];
    const startFacing = dot3(rotateByQuat(body.q, AP.FORWARD_BODY), desiredForward);
    ok("!! facingCos is already exactly 1 -- a pure-roll perturbation does not move the nose", startFacing === 1, `start=${startFacing}`);
    for (let i = 0; i < 300; i++) {
        const d = AP.decide(body, desiredForward);
        body = stepAircraft(aircraft, body, d.controls, 1 / 30).state;
    }
    ok("!! roll rate is damped toward zero after 10s", Math.abs(body.w[0]) < 0.01, `w=${body.w}`);
    ok("facing stays exactly 1 throughout (roll never touches pitch/yaw)", dot3(rotateByQuat(body.q, AP.FORWARD_BODY), desiredForward) === 1);
}

console.log("\n8. AUTOPILOT_AIRCRAFT defaults are self-consistent with decide()'s own opts override");
{
    const body = makeBody([0.3, 0.7, -0.2], 10);
    const dDefault = AP.decide(body, [1, 0, 0]);
    const dExplicit = AP.decide(body, [1, 0, 0], { kp: AP.AUTOPILOT_AIRCRAFT.kp, kRollDamp: AP.AUTOPILOT_AIRCRAFT.kRollDamp });
    ok("explicit defaults reproduce the implicit-default output exactly", JSON.stringify(dDefault.controls) === JSON.stringify(dExplicit.controls));
}

console.log("\n9. THE FRONT DOOR");
{
    const L = AP.reportLines();
    ok("reportLines names the module and shows a facing-convergence measurement", L.some((l) => /autopilotAircraft/.test(l)) && L.some((l) => /facing/.test(l)));
    ok("...and no report line stringifies a missing field as the literal word \"undefined\"", L.every((l) => !/\bundefined\b/.test(l)));
}

console.log(fails ? `\nautopilotAircraft-selfcheck: ${fails} FAILED` : "\nautopilotAircraft-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
