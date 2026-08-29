// WebGLEngine/tools/ship/gestureVfx-selfcheck.mjs -- v4111
//
// Run: node tools/ship/gestureVfx-selfcheck.mjs   (~0.2s; no camera, no browser, no network)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ui/gestureVfx.js -- gesture recognition, the firing rule, and the particle simulation.
//
// *** ALL THREE PARTS ARE PURE, SO ALL THREE ARE CHECKED RATHER THAN LOOKED AT. *** A VFX module wired into a
// canvas can only be judged by watching it, and "it looked fine" does not catch a particle that never dies, a
// burst that re-fires thirty times a second, or a fist being read as a point. Every one of those is driven
// below with synthetic metrics and an injected clock and RNG.
//
// The sections in order: the gesture recipes (2), the AMBIGUITIES between them (3 -- the real content, same as
// v4110's near-miss section), the refusal (4), the firing rule's two separate guards (5), and the particle
// physics (6), where "every particle eventually dies" and "a stalled tab does not teleport them" are the two
// properties a renderer cannot tell you about.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly } from "./sourceScan.mjs";
import {
    GESTURES, REFUSED, NONE, BURST_KINDS,
    classifyGesture, makeGestureTrigger, spawnBurst, stepParticles, particleAlpha,
} from "../../ui/gestureVfx.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("gestureVfx-selfcheck -- a hand shape, a firing rule, and particles that must die\n");

/** A hand in the tracker's own metrics() shape. Defaults are a relaxed, ungestured hand. */
const hand = (o = {}) => Object.assign({
    handedness: "Right",
    cursor: { x: 0.5, y: 0.5 },
    pinch: { active: false, distance: 0.2 },
    grab: { active: false, point: { x: 0.5, y: 0.5, z: 0 } },
    fist: false, openPalm: false, pointing: false,
    folded: { index: false, middle: false, ring: false, pinky: false },
}, o);
/** The full metrics() object. */
const M = (hands, twoHand = null) => ({ handCount: hands.length, hands, cursor: hands[0]?.cursor ?? { x: .5, y: .5 }, pinch: !!hands[0]?.pinch?.active, twoHand });

// ---- 1. THE RECIPES ARE WELL-FORMED ------------------------------------------------------------------------
{
    console.log("1. THE RECIPE TABLE");
    ok("every gesture has a name, label, emoji, kind, hold and a reason",
        GESTURES.every((g) => g.name && g.label && g.emoji && g.kind && g.hold > 0 && g.note && typeof g.test === "function"));
    ok("no two gestures share a name", new Set(GESTURES.map((g) => g.name)).size === GESTURES.length);
    ok("!! every gesture's `kind` names a REAL burst shape",
        GESTURES.every((g) => BURST_KINDS.includes(g.kind)),
        "a kind with no burst spawns nothing and looks like a dead gesture: " + GESTURES.map((g) => g.kind).join(",") +
        " against " + BURST_KINDS.join(","));
    ok("...and every burst shape is reachable from some gesture",
        BURST_KINDS.every((k) => GESTURES.some((g) => g.kind === k)),
        "an unreachable burst is code nobody can trigger");
}

// ---- 2. EACH GESTURE IS REACHED BY ITS OWN HAND ------------------------------------------------------------
{
    console.log("\n2. EVERY GESTURE CAN ACTUALLY BE REACHED");
    const cases = [
        ["spark",  M([hand({ pinch: { active: true, distance: 0.03 } })])],
        ["impact", M([hand({ fist: true, folded: { index: true, middle: true, ring: true, pinky: true } })])],
        ["beam",   M([hand({ pointing: true, folded: { index: false, middle: true, ring: true, pinky: true } })])],
        ["shield", M([hand({ openPalm: true })])],
        ["prayer", M([hand({ openPalm: true }), hand({ openPalm: true })], { spread: 0.10, roll: 0 })],
        ["rift",   M([hand({ openPalm: true }), hand({ openPalm: true })], { spread: 0.5, roll: 0 })],
    ];
    for (const [want, m] of cases) {
        const got = classifyGesture(m);
        ok("a " + want + " hand classifies as " + want, got.name === want, "got " + got.name);
    }
    ok("!! every gesture in the module is covered above",
        GESTURES.every((g) => cases.some(([n]) => n === g.name)),
        GESTURES.length + " gestures, " + cases.length + " cases -- an undriven recipe can be broken and green");
    ok("!! a relaxed hand is NONE, not the first recipe in the list",
        classifyGesture(M([hand()])).name === NONE);
    for (const [label, m] of [["null", null], ["no hands", M([])], ["handCount 0", { handCount: 0, hands: [hand()] }]]) {
        const g = classifyGesture(m);
        ok("!! " + label + " -> usable:false, NOT a gesture", g.name === NONE && g.usable === false);
    }
}

// ---- 3. *** THE AMBIGUITIES -- WHY THE ORDER AND THE EXCLUSIONS EXIST *** ----------------------------------
{
    console.log("\n3. *** ONE HAND CAN SATISFY TWO RECIPES; THE RESOLUTION MUST BE STABLE ***");
    // A pinching hand very often ALSO has three fingers folded, which is most of a point.
    const pinchAndFolded = M([hand({
        pinch: { active: true, distance: 0.03 }, pointing: true,
        folded: { index: false, middle: true, ring: true, pinky: true },
    })]);
    ok("!! a hand that is BOTH pinching and pointing resolves to the pinch, every time",
        classifyGesture(pinchAndFolded).name === "spark",
        "order is the tie-break: these are BOOLEANS with no score to rank, so 'highest score wins' has nothing " +
        "to compare and would alternate frame to frame. First match wins, most specific first.");
    ok("...and it is deterministic across repeated calls",
        new Set([0, 1, 2, 3, 4].map(() => classifyGesture(pinchAndFolded).name)).size === 1);

    // *** THE ONE THAT WOULD ACTUALLY SHIP BROKEN: two open palms also satisfy the ONE-palm shield recipe. ***
    const twoPalms = M([hand({ openPalm: true }), hand({ openPalm: true })], { spread: 0.5, roll: 0 });
    ok("!! *** TWO OPEN PALMS ARE A RIFT, NOT A SHIELD -- the shield recipe excludes the two-hand case ***",
        classifyGesture(twoPalms).name === "rift",
        "shield is listed BEFORE rift, so without its explicit two-hand exclusion the rift would be " +
        "unreachable: every two-palm frame would be caught by shield first and the gesture would look broken");

    // The rift must not be fake-able by one hand, even if a stale twoHand block is present.
    const onePalmStaleTwoHand = M([hand({ openPalm: true })], { spread: 0.9, roll: 0 });
    ok("!! ...and ONE palm cannot fire the rift even when a twoHand block is present",
        classifyGesture(onePalmStaleTwoHand).name === "shield",
        "reading spread without checking both hands really exist is how a one-hand frame fakes a two-hand gesture");

    // Palms apart vs together: the spread threshold has to actually bite.
    const palmsTogether = M([hand({ openPalm: true }), hand({ openPalm: true })], { spread: 0.05, roll: 0 });
    ok("!! palms held CLOSE together do not fire the rift -- the spread threshold is real",
        classifyGesture(palmsTogether).name !== "rift", "got " + classifyGesture(palmsTogether).name);
    // *** THE HOLE THIS GATE'S OWN OUTPUT REVEALED. *** The assertion above passed while palms-together
    // classified as NONE -- correct that it is not a rift, and a dead pose for the feature, because shield
    // already excludes every two-hand frame. Reading what the check PRINTED is what found it; asserting the
    // NAME rather than merely "not rift" is what stops it coming back.
    ok("!! *** ...and they are a PRAYER, not a gap -- shield excludes two hands, so nothing else could catch them ***",
        classifyGesture(palmsTogether).name === "prayer",
        "a pose that reaches no gesture at all is a feature hole that every 'is not X' assertion passes");
    // The two two-hand recipes must PARTITION the spread axis: no pose between them, no pose in both.
    for (const spread of [0.0, 0.10, 0.249, 0.25, 0.2501, 0.4, 0.9]) {
        const m = M([hand({ openPalm: true }), hand({ openPalm: true })], { spread, roll: 0 });
        const n = classifyGesture(m).name;
        ok("   two palms at spread " + spread + " -> " + n + " (never none)",
            n === "prayer" || n === "rift",
            "prayer takes <= 0.25 and rift takes > 0.25 from the same number, so the axis is covered with no " +
            "seam and no overlap");
    }

    // A fist should never read as a point, in either direction.
    const fist = M([hand({ fist: true, folded: { index: true, middle: true, ring: true, pinky: true } })]);
    ok("!! a closed fist is not a point", classifyGesture(fist).name === "impact");
    ok("!! a recipe that throws is caught rather than crashing the classifier",
        classifyGesture({ handCount: 1, hands: [null] }).name === NONE,
        "a malformed hand in the array must not take the whole page down mid-frame");
}

// ---- 4. THE REFUSAL --------------------------------------------------------------------------------------
{
    console.log("\n4. *** CROSSED FINGERS IS REFUSED, AND HELD TO ITS REASON ***");
    const cf = REFUSED.find((r) => r.name === "crossedFingers");
    ok("!! it is refused as DATA, not as a sentence in a comment", !!cf);
    ok("!! ...and the reason names the actual cause (metrics reports FOLD, not fingertip positions)",
        cf && /fold/i.test(cf.why) && /middle fingertip/i.test(cf.why));
    ok("!! ...and it names the input that WOULD work, so the refusal is not a dead end",
        cf && /snapshot\(\)/.test(cf.wouldNeed) && /landmark/i.test(cf.wouldNeed));
    ok("!! *** no recipe smuggles a crossed-fingers detector in under another name ***",
        !GESTURES.some((g) => /cross/i.test(g.name)),
        "approximating it from fold flags would fire on any ordinary half-curled hand -- a trigger that lies");
}

// ---- 5. THE FIRING RULE: TWO GUARDS, TWO DIFFERENT FAILURES -----------------------------------------------
{
    console.log("\n5. *** A GESTURE HELD FOR TWO SECONDS IS ONE GESTURE ***");
    let t = 0;
    const trig = makeGestureTrigger({ cooldownMs: 450, now: () => t });
    const pinch = M([hand({ pinch: { active: true, distance: 0.03 } })]);
    const idle = M([hand()]);

    ok("the onset fires", trig.update(pinch).fired === true);
    t = 16;
    ok("!! *** HOLDING IT DOES NOT RE-FIRE -- edge-triggered, or a 2s hold spawns 60 bursts ***",
        trig.update(pinch).fired === false);
    t = 32;
    ok("...still not, many frames later", trig.update(pinch).fired === false);

    // Release, then re-make the gesture INSIDE the cooldown: a real new edge that must still be refused.
    t = 100; trig.update(idle);
    t = 120;
    ok("!! *** a flicker at the detection threshold is a REAL new edge, and the cooldown is what stops it ***",
        trig.update(pinch).fired === false,
        "the edge guard alone cannot catch this -- each wobble is genuinely a fresh onset. Two guards, two " +
        "different failures.");

    // Past the cooldown, a genuine re-do fires again.
    t = 700; trig.update(idle);
    t = 720;
    ok("...and a genuine repeat AFTER the cooldown does fire", trig.update(pinch).fired === true);

    // A different gesture is on its own cooldown, not the first one's.
    t = 730;
    const fistM = M([hand({ fist: true, folded: { index: true, middle: true, ring: true, pinky: true } })]);
    ok("!! a DIFFERENT gesture has its own cooldown and is not blocked by the first one's",
        trig.update(fistM).fired === true,
        "one shared timer would make any two-gesture combo drop the second half");
    ok("...and reset() clears the state", (trig.reset(), trig.current === NONE));
}

// ---- 6. *** THE PARTICLES: THE TWO PROPERTIES A RENDERER CANNOT TELL YOU *** -------------------------------
{
    console.log("\n6. *** EVERY PARTICLE DIES, AND A STALLED TAB DOES NOT TELEPORT THEM ***");
    // Deterministic RNG so this is an exact check, not a probabilistic one.
    let seed = 1;
    const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

    for (const kind of BURST_KINDS) {
        const b = spawnBurst(kind, 0.5, 0.5, { rand });
        ok("spawn(" + kind + ") makes particles with finite state",
            b.length > 0 && b.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) &&
                Number.isFinite(p.vx) && Number.isFinite(p.vy) && p.life > 0 && p.age === 0));
    }
    ok("!! an unknown burst kind spawns NOTHING rather than throwing", spawnBurst("nope", 0.5, 0.5).length === 0);

    // THE HEADLINE: run every burst to exhaustion and prove the list empties.
    let worst = 0;
    for (const kind of BURST_KINDS) {
        let ps = spawnBurst(kind, 0.5, 0.5, { rand });
        let frames = 0;
        while (ps.length && frames < 600) { ps = stepParticles(ps, 1 / 60); frames++; }
        worst = Math.max(worst, frames);
        ok("!! *** " + kind + " fully dies out (" + frames + " frames) -- no immortal particle ***",
            ps.length === 0,
            "a particle that never dies is an unbounded array and a slow leak that looks like 'the effect is " +
            "still going' -- exactly the bug a renderer cannot show you");
    }
    ok("!! ...and the slowest burst clears well inside two seconds of frames", worst < 120, worst + " frames");

    // NaN must never enter the simulation.
    let ps = spawnBurst("impact", 0.5, 0.5, { rand });
    for (let i = 0; i < 40; i++) ps = stepParticles(ps, 1 / 60);
    ok("!! no NaN reaches a particle after 40 steps",
        ps.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.vx) && Number.isFinite(p.vy)));

    // *** THE CLAMP. *** A backgrounded tab hands the next frame a huge dt.
    const before = spawnBurst("beam", 0.5, 0.5, { rand });
    const stalled = stepParticles(before, 4.0);            // four seconds in one frame
    const normal = stepParticles(before, 1 / 60);
    const maxJump = (list) => Math.max(0, ...list.map((p, i) => Math.hypot(p.x - before[i].x, p.y - before[i].y)));
    ok("!! *** a 4-SECOND dt is CLAMPED -- a backgrounded tab must not teleport every particle offscreen ***",
        maxJump(stalled) < 0.1,
        "unclamped, one stalled frame moves every particle several screen-widths and the whole effect appears " +
        "as a single frame of scattered dots. Jump was " + maxJump(stalled).toFixed(4) +
        " vs " + maxJump(normal).toFixed(4) + " on a normal frame");
    ok("...and a normal frame still moves them", maxJump(normal) > 0);
    ok("!! stepping an empty or non-array list is safe",
        stepParticles([], 0.016).length === 0 && stepParticles(null, 0.016).length === 0);

    // The fade curve.
    ok("!! alpha runs 1 -> 0 over a particle's life and never goes negative",
        particleAlpha({ age: 0, life: 1 }) === 1 && particleAlpha({ age: 1, life: 1 }) === 0 &&
        particleAlpha({ age: 2, life: 1 }) === 0 && particleAlpha({ age: 0.5, life: 1 }) > 0);
    ok("...and a malformed particle fades to 0 rather than NaN",
        particleAlpha(null) === 0 && particleAlpha({ age: 1, life: 0 }) === 0);
}

// ---- 7. PURITY, WHICH IS WHAT MAKES EVERYTHING ABOVE POSSIBLE ---------------------------------------------
{
    console.log("\n7. THE MODULE STAYS PURE");
    // codeOnly(): the header NAMES canvas/camera to explain what it does not touch, and a raw grep would go
    // red on the explanation. Same commentFalsePass trap v4110's gate fell into and this tree has a fix for.
    const src = codeOnly(fs.readFileSync(path.join(ENG, "ui", "gestureVfx.js"), "utf8"));
    ok("!! no DOM, no canvas, no camera, no timers, no rAF in the module",
        !/document\.|navigator\.|getContext|requestAnimationFrame|setInterval|setTimeout/.test(src),
        "purity is the whole reason sections 2-6 exist; a module that needed a canvas could only be watched");
    ok("!! ...and the clock and RNG are INJECTABLE, which is what makes 5 and 6 exact rather than flaky",
        /opts\.now/.test(src) && /opts\.rand/.test(src));
    ok("...and it does not reach into the hand tracker, it only reads the shape metrics() returns",
        !/MediaPipeHandTracker/.test(src),
        "taking the metrics object as an argument keeps this gateable with synthetic hands");
}

console.log("\n" + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
