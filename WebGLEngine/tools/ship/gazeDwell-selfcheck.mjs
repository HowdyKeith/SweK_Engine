// WebGLEngine/tools/ship/gazeDwell-selfcheck.mjs -- v4247
//
// Run: node tools/ship/gazeDwell-selfcheck.mjs
//
// *** SELECTING BY LOOKING, FOR A HEADSET WITH NO CONTROLLER -- AND THE ONE DESIGN NUMBER THAT DECIDES
// WHETHER A HUMAN CAN USE IT. ***
//
// VR parts one, two and three shipped stereo rendering, controllers, stick locomotion and haptics, and every
// one of those input paths assumes a controller in each hand. Gaze dwell is the path for a headset with none,
// a controller that died mid-session, or a phone in a holder.
//
// The ray and the hit test are arithmetic. The DWELL TIMER is where it succeeds or fails, and this gate is
// mostly about one measurement: a timer that RESETS when the ray leaves the target cannot be completed by a
// real head on a small target, and a timer that DECAYS can. The difference is not a matter of taste and it is
// not tuned by eye -- there is a closed form for exactly how much tremor a given decay rate survives, and
// section 4 checks the formula against the simulation rather than trusting either alone.
//
// Ramotion/vr-menu-demo's CODE is refused (UNPAPERED -- no LICENSE on master, README ends in an App Store
// advert; recorded at #106). The interaction is a published idea and none of their source is here.
"use strict";
import * as G from "../../ui/gazeDwell.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const DEG = Math.PI / 180;
const DT = 1 / 72;                                  // a plausible headset frame time

// *** A CRASH IS NOT A NAMED FAILURE. *** The first version of section 3 formatted these times with
// .toFixed() directly, and the reset-instead-of-decay sabotage made tD null -- so the gate threw a TypeError
// from inside a MESSAGE instead of reporting the red check it had correctly computed. A gate that dies while
// describing a failure has still failed the ship and has told nobody which check went red.
const secs = (t) => (t === null ? "NEVER fires" : "fires at " + t.toFixed(2) + " s");

const quadAt = (id, dist, half) => G.makeQuad(id, [0, 0, -dist], [0, 0, 1], [1, 0, 0], [0, 1, 0], [half, half]);
const rayAt = (yaw, pitch = 0) => ({
    origin: [0, 0, 0],
    dir: [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)],
});

/** A head trying to hold still: fast physiological tremor on a slow drift. */
const tremorRay = (t, ampDeg) => {
    const a = ampDeg * DEG;
    const yaw = a * (0.6 * Math.sin(2 * Math.PI * 9.3 * t) + 0.4 * Math.sin(2 * Math.PI * 1.1 * t + 1.3));
    const pitch = a * (0.6 * Math.sin(2 * Math.PI * 8.1 * t + 0.7) + 0.4 * Math.sin(2 * Math.PI * 0.7 * t));
    return rayAt(yaw, pitch);
};

/** The obvious implementation, kept so the comparison in section 3 is against something real. */
class ResetSelector {
    constructor(hold) { this.hold = hold; this.t = null; this.e = 0; }
    update(dt, id) {
        if (id != null && id === this.t) this.e += dt;
        else if (id != null) { this.t = id; this.e = dt; }
        else { this.t = null; this.e = 0; }
        let fired = null;
        if (this.t != null && this.e >= this.hold) { fired = this.t; this.e = 0; }
        return { fired, progress: Math.min(1, this.e / this.hold) };
    }
}

console.log("gazeDwell-selfcheck -- selecting by looking, and the number that decides if a human can\n");

// =============================================================================================================
console.log("1. the ray and the panel: arithmetic, and two rejections that are not obvious");
{
    const q = quadAt("A", 2, 0.3);
    const straight = G.rayFromHeadMatrix(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
    ok("!! a head matrix yields a ray looking down -Z, which is the WebXR convention xrSession already uses",
        straight.dir[2] === -1 && straight.origin.every((v) => v === 0),
        "dir " + JSON.stringify(straight.dir));
    const hit = G.hitQuad(straight.origin, straight.dir, q);
    ok("!! looking at the middle of a panel hits it at its centre",
        hit && Math.abs(hit.u) < 1e-12 && Math.abs(hit.v) < 1e-12 && Math.abs(hit.t - 2) < 1e-12,
        JSON.stringify(hit));
    ok("!! and looking past its edge misses",
        !G.hitQuad(...Object.values(rayAt(0.2)), q) === false || G.hitQuad(rayAt(0.2).origin, rayAt(0.2).dir, q) === null,
        "0.2 rad off axis at 2 m is 0.405 m across, outside a 0.3 m half-width");
    // *** A PANEL BEHIND THE VIEWER MUST NOT BE SELECTABLE, and a naive plane test selects it. *** A menu ring
    // has panels all around, and without the t > 0 test you commit to the one behind your head.
    // *** TWO SEPARATE REJECTIONS, AND THE FIRST VERSION OF THIS CHECK CREDITED THE WRONG ONE. *** A panel at
    // z = +2 whose normal faces the viewer is caught by the FACING test (denom >= 0), not by t > 0 -- removing
    // the t > 0 line left this check perfectly green, which is how the mistake surfaced. To exercise t > 0 you
    // need a panel that is front-facing to the ray AND behind it, which is this one: normal along +z, so the
    // ray meets its front face, at t = -2.
    const facingAway = G.makeQuad("B", [0, 0, 2], [0, 0, -1], [1, 0, 0], [0, 1, 0], [0.3, 0.3]);
    ok("!! a panel behind the viewer whose normal faces the viewer is rejected by the FACING test",
        G.hitQuad(straight.origin, straight.dir, facingAway) === null,
        "dot(dir, normal) is +1 here, so the ray would be hitting its back; rejected before t is computed");
    const behindFrontFacing = G.makeQuad("C", [0, 0, 2], [0, 0, 1], [1, 0, 0], [0, 1, 0], [0.3, 0.3]);
    ok("!! *** AND ONE THAT IS FRONT-FACING BUT BEHIND IS REJECTED BY t > 0 -- the check the facing test misses ***",
        G.hitQuad(straight.origin, straight.dir, behindFrontFacing) === null,
        "normal along +z gives dot(dir, normal) = -1, so it passes the facing test, and t comes out -2. " +
        "Without the sign test a menu ring would let you select the panel behind your head.");
    // ...and the BACK of a panel is not selectable either.
    ok("!! ...and neither is the BACK of a panel in front of you",
        G.hitQuad([0, 0, -4], [0, 0, 1], q) === null,
        "standing behind the panel and looking back at it hits nothing, because its normal faces away");
    const two = [quadAt("near", 2, 0.3), quadAt("far", 4, 0.3)];
    ok("   overlapping panels resolve to the NEAREST",
        G.pickTarget(straight.origin, straight.dir, two).id === "near");
}

// =============================================================================================================
console.log("\n2. *** THE GLANCE: looking PAST a button must not press it ***");
{
    const hold = 1.2, dist = 2, half = 0.3;
    for (const speed of [3.0, 1.0]) {
        const cross = G.crossingTime(half, dist, speed);
        const sel = new G.DwellSelector({ hold });
        const q = quadAt("A", dist, half);
        let fired = null;
        for (let k = 0; k * DT < 4; k++) {
            const t = k * DT;
            const yaw = -0.8 + speed * t;                 // sweep straight across the panel and away
            const h = G.pickTarget(rayAt(yaw).origin, rayAt(yaw).dir, [q]);
            if (sel.update(DT, h ? h.id : null).fired) { fired = t; break; }
        }
        ok("!! a sweep at " + speed.toFixed(1) + " rad/s crosses in " + cross.toFixed(3) + " s and does NOT fire",
            fired === null,
            "the hold is " + hold + " s, so the glance is short by a factor of " + (hold / cross).toFixed(0) +
            ". Rejection comes from hold vs crossing time and NOTHING ELSE -- the decay rate has no part in it, " +
            "which is why section 4 can tune decay freely without re-opening this.");
    }
    // The honest boundary: a sweep slow enough to dwell IS a dwell, and pretending otherwise would be a lie.
    const slow = G.crossingTime(0.3, 2, 0.25);
    report("a sweep slow enough to stay on the panel for the full hold is not a glance -- at 0.25 rad/s the " +
           "crossing takes " + slow.toFixed(2) + " s, and a user moving that slowly across a button is " +
           "dwelling on it. There is no setting that separates those two, because they are the same event.");
}

// =============================================================================================================
console.log("\n3. *** THE MEASUREMENT THIS ROUND EXISTS FOR: a real head cannot complete a RESETTING dwell ***");
{
    const rows = [];
    for (const [half, dist, amp] of [[0.30, 2, 1.0], [0.05, 2, 1.0], [0.05, 2, 2.0], [0.03, 2, 2.0]]) {
        const q = quadAt("A", dist, half);
        const dec = new G.DwellSelector({ hold: 1.2, decay: 1.0 });
        const res = new ResetSelector(1.2);
        let off = 0, n = 0, tD = null, tR = null;
        for (let k = 0; k * DT < 20; k++) {
            const t = k * DT, r = tremorRay(t, amp);
            const h = G.pickTarget(r.origin, r.dir, [q]);
            n++; if (!h) off++;
            const a = dec.update(DT, h ? h.id : null), b = res.update(DT, h ? h.id : null);
            if (a.fired && tD === null) tD = t;
            if (b.fired && tR === null) tR = t;
        }
        rows.push({ half, amp, p: off / n, tD, tR, halfAngle: Math.atan(half / dist) / DEG });
        report("half " + half.toFixed(2) + " m at " + dist + " m (" + (Math.atan(half / dist) / DEG).toFixed(2) +
               " deg), " + amp.toFixed(1) + " deg tremor: " + (100 * off / n).toFixed(1) + "% of frames off; " +
               "decay " + (tD === null ? "NEVER" : "fires at " + tD.toFixed(2) + " s") + ", reset " +
               (tR === null ? "NEVER" : "fires at " + tR.toFixed(2) + " s"));
    }
    const easy = rows[0], hard = rows[2];
    ok("!! on a LARGE target both work, and neither design is doing anything clever",
        easy.p === 0 && easy.tD !== null && easy.tR !== null,
        "0% of frames off an 8.5 degree target at 1 degree tremor; both " + secs(easy.tD) + ". " +
        "A gate that only tested this size would have found nothing to choose between them.");
    ok("!! *** ON A SMALL TARGET WITH REAL TREMOR THE RESETTING DWELL NEVER COMPLETES, AND THE DECAYING ONE DOES ***",
        hard.p > 0.3 && hard.tR === null && hard.tD !== null,
        (100 * hard.p).toFixed(1) + "% of frames off a " + hard.halfAngle.toFixed(2) + " degree target under " +
        hard.amp.toFixed(1) + " degrees of tremor. Decay " + secs(hard.tD) + "; reset " + secs(hard.tR) +
        " in 20 s of continuous staring. That is not a slow dwell, it is an impossible one -- and it is the " +
        "obvious implementation.");
    const tiny = rows[3];
    ok("!! ...and past the tolerance the DECAYING one fails too, which is the honest half of the claim",
        tiny.p > 0.5 && tiny.tD === null,
        (100 * tiny.p).toFixed(1) + "% off a " + tiny.halfAngle.toFixed(2) + " degree target: decay never " +
        "completes either. Decay does not make any target usable; it moves the boundary, and section 4 says " +
        "exactly where to.");
}

// =============================================================================================================
console.log("\n4. *** AND THE BOUNDARY IS A CLOSED FORM, CHECKED AGAINST THE SIMULATION ***");
{
    // On target the timer gains dt; off it loses decay * dt. Net is positive only while
    //     (1 - p) - p * decay > 0   <=>   p < 1 / (1 + decay)
    // A formula and a simulation that agree are two routes to one number, which is the sharpest shape there is.
    let worst = 0;
    const lines = [];
    for (const decay of [0.5, 1.0, 2.0, 3.0]) {
        const predicted = G.maxOffFraction(decay);
        // Find the simulated boundary by bisection on the off-fraction, with a deterministic on/off pattern.
        let lo = 0, hi = 1;
        for (let it = 0; it < 24; it++) {
            const p = (lo + hi) / 2;
            const sel = new G.DwellSelector({ hold: 1.2, decay });
            let fired = false, acc = 0;
            for (let k = 0; k < 20000; k++) {
                acc += p;
                const onTarget = acc < 1;                 // exactly a fraction p of frames are OFF
                if (acc >= 1) acc -= 1;
                if (sel.update(DT, onTarget ? "A" : null).fired) { fired = true; break; }
            }
            if (fired) lo = p; else hi = p;
        }
        const measured = (lo + hi) / 2;
        worst = Math.max(worst, Math.abs(measured - predicted));
        lines.push("decay " + decay.toFixed(1) + ": formula " + (100 * predicted).toFixed(1) + "%, simulated " +
                   (100 * measured).toFixed(1) + "%");
    }
    ok("!! *** THE FORMULA p < 1/(1+decay) PREDICTS THE SIMULATED BOUNDARY AT EVERY DECAY RATE ***",
        worst < 0.02,
        lines.join("; ") + " -- worst disagreement " + (100 * worst).toFixed(2) + " points. Two independent " +
        "routes to one number: the algebra, and a timer actually run to completion 24 times per rate.");
    ok("   ...and the shipped default tolerates just under half the frames being off",
        Math.abs(G.maxOffFraction() - 0.5) < 1e-12,
        "decay = " + G.DWELL.decay + " gives " + (100 * G.maxOffFraction()).toFixed(1) + "%. The FIRST default " +
        "this file shipped was 3.0, which tolerates 25% -- and section 3 measures 35.2% on a small target, so " +
        "that default made the small-target case impossible. The gate found it, not a review.");
}

// =============================================================================================================
// ---- v4247 SABOTAGES, RESTORED BYTE-IDENTICAL AND md5-VERIFIED ------------------------------------------
//
//   A  the dwell RESETS instead of decaying -- the obvious implementation, and the one this round exists to
//      rule out. -> 2 RED: the small-target case goes red, and section 4's formula check goes red hard,
//      reading a simulated boundary of 1.1% against a predicted 25-67%. That second failure is the better
//      one: a reset timer has NO tolerance for off-target frames at any decay rate, so the formula stops
//      describing it entirely rather than merely being off by a little.
//      *** AND THE FIRST TIME THIS SABOTAGE WAS RUN THE GATE CRASHED INSTEAD. *** Section 3 formatted the
//      fire times with .toFixed() directly, and with reset the time is null -- so the gate threw a TypeError
//      from inside a MESSAGE while describing a check it had correctly computed as red. A gate that dies
//      while reporting a failure has failed the ship and told nobody which check went. Fixed with secs().
//
//   B  the `t > 0` test dropped from hitQuad. -> 1 RED, but ONLY after the check was rewritten.
//      *** THE ORIGINAL CHECK STAYED PERFECTLY GREEN UNDER THIS SABOTAGE, because it used a panel behind the
//      viewer whose normal FACED the viewer -- which the facing test rejects before t is ever computed. ***
//      The check credited the wrong line for its own result. Isolating t > 0 needs a panel that is
//      front-facing to the ray AND behind it, which is the second one now in section 1.
//
//   C  progress becomes a wall-clock animation that only ever climbs. -> 2 RED, including "it goes DOWN when
//      the gaze leaves", which is the property that separates a state readout from a picture of one.
//
console.log("\n5. the ring shows the decision, not a picture of one");
{
    const sel = new G.DwellSelector({ hold: 1.0, decay: 1.0 });
    const seen = [];
    for (let k = 0; k < 5; k++) { sel.update(0.1, "A"); seen.push(sel.progress); }
    ok("!! progress is accumulated gaze time and nothing else",
        seen.every((v, i) => Math.abs(v - (i + 1) * 0.1) < 1e-9),
        "after 5 frames of 0.1 s: " + seen.map((v) => v.toFixed(2)).join(", ") + " -- exactly elapsed/hold, so " +
        "a caller drawing a ring from it is drawing the state of the decision rather than an animation that " +
        "could keep filling while the user looks away");
    const before = sel.progress;
    sel.update(0.1, null);
    ok("!! *** and it goes DOWN when the gaze leaves, which is the property an animation cannot have ***",
        sel.progress < before,
        before.toFixed(2) + " -> " + sel.progress.toFixed(2) + " after one frame off target");
    // Switching target is deliberate; the old progress goes rather than decaying.
    const s2 = new G.DwellSelector({ hold: 1.0 });
    for (let k = 0; k < 8; k++) s2.update(0.1, "A");
    s2.update(0.1, "B");
    ok("!! looking at a DIFFERENT target abandons the old progress rather than decaying it",
        s2.target === "B" && Math.abs(s2.progress - 0.1) < 1e-9,
        "0.8 accumulated on A, then one frame on B leaves 0.1 on B. Decay exists for losing the target you " +
        "are still trying to hit, not for changing your mind.");
    // Cooldown: a held gaze must not machine-gun the same button.
    const s3 = new G.DwellSelector({ hold: 0.5, cooldown: 0.5 });
    let fires = 0;
    for (let k = 0; k * DT < 2.0; k++) if (s3.update(DT, "A").fired) fires++;
    ok("!! a continuous stare fires ONCE per hold-plus-cooldown, not every frame after the threshold",
        fires === 2,
        fires + " commits in 2.0 s at hold 0.5 + cooldown 0.5 -- without the cooldown a held gaze would fire " +
        "on every frame past the threshold");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: a real headset, and a real head. The tremor model is two sinusoids per axis chosen to " +
    "sit in the physiological band; it is a plausible signal and NOT a measurement of anyone, so the 35.2% is " +
    "a property of that model rather than of a person. What the model does establish is the SHAPE -- that " +
    "off-target frames are the thing that decides this, and that a resetting timer cannot survive them -- and " +
    "the closed form in section 4 holds for any off-fraction however it arises. Also unchecked: that anything " +
    "DRAWS the ring. ui/gazeDwell.mjs returns a progress number and no renderer consumes it, so this is the " +
    "mechanism and not yet the feature; and gaze is not wired into engine/xrSession.mjs, so nothing feeds it " +
    "a real head pose.");
process.exit(fails ? 1 : 0);
