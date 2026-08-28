// WebGLEngine/ui/gestureVfx.js -- v4111
//
// A HAND SHAPE, A FIRING RULE, AND A PARTICLE STEP -- ALL THREE PURE, WHICH IS WHY ALL THREE ARE GATED.
//
// Keith: "gesture-triggered VFX". The idea came from SAT0RU (reinesana/SAT0RU), which fires anime cursed-
// technique effects on hand gestures. NONE OF ITS CODE IS USED HERE and none needed to be: the repo states no
// licence at all, which makes it all-rights-reserved, and this engine publishes public release zips -- so
// copying from it was never an option. It also would not have helped. face/MediaPipeHandTracker.js has
// computed pinch / fist / openPalm / pointing / two-hand spread since it was written, and the ONLY missing
// piece was something to do with them. That is what this is.
//
// *** THE SAME SPLIT v4110 EARNED, FOR THE SAME REASON. *** The judgement (which gesture is this, and may it
// fire) and the simulation (where is each spark next frame) are BOTH pure functions here -- no canvas, no
// camera, no timers, no requestAnimationFrame. So the gate drives every gesture, every refusal, every
// cooldown edge and 600 frames of particle physics WITHOUT a browser or a webcam. A VFX module wired straight
// into a canvas can only be looked at, and "it looked fine" is not a check.
//
// *** WHAT IS REFUSED, AND WHY IT IS A REAL LIMIT RATHER THAN A MISSING FEATURE. ***
// SAT0RU's four triggers are pinch, CROSSED FINGERS, point-up, and prayer/flat-hand. Three of those map onto
// what the tracker already computes. Crossed fingers does not, and the reason is specific: metrics() reports
// per-finger FOLD (tip nearer the wrist than the PIP joint) and a single index-tip cursor -- it never reports
// where the middle fingertip is, so "index crossed OVER middle" is not expressible in this input at all.
// It is not impossible; it needs the raw 21-landmark array from snapshot(), a different input than this module
// takes. Recorded in REFUSED with exactly that, so the gap is visible and the way out is named.
"use strict";

/**
 * Gesture recipes over MediaPipeHandTracker.metrics(). Each `test` is a pure predicate on that object.
 * `kind` names the particle burst the page should draw; `hold` is how long the effect keeps emitting.
 */
export const GESTURES = [
    {
        name: "spark", label: "Pinch", emoji: "\u{1F90F}",
        kind: "spark", hold: 900,
        test: (m) => !!(m && m.hands && m.hands[0] && m.hands[0].pinch && m.hands[0].pinch.active),
        note: "thumb and index tip together -- the tracker's own pinch, not a re-derived distance",
    },
    {
        name: "impact", label: "Fist", emoji: "\u{270A}",
        kind: "impact", hold: 700,
        // A FIST IS TESTED BEFORE POINT AND PALM ON PURPOSE (see classifyGesture's ordering note).
        test: (m) => !!(m && m.hands && m.hands[0] && m.hands[0].fist),
        note: "every finger folded to the wrist -- a shockwave from the closed hand",
    },
    {
        name: "beam", label: "Point", emoji: "\u{261D}️",
        kind: "beam", hold: 1200,
        test: (m) => !!(m && m.hands && m.hands[0] && m.hands[0].pointing),
        note: "index extended with the other three folded -- a directed stream from the fingertip",
    },
    {
        name: "shield", label: "Open palm", emoji: "\u{1F590}️",
        kind: "shield", hold: 1000,
        test: (m) => !!(m && m.hands && m.hands[0] && m.hands[0].openPalm) && !twoOpenPalms(m),
        note: "one flat hand -- an expanding ring. Excludes the two-hand case so it cannot shadow the rift",
    },
    {
        // v4111b -- ADDED AFTER READING THIS MODULE'S OWN GATE OUTPUT. The near-miss case "palms held close
        // together" was passing its check by classifying as NONE, which is a pass for the assertion (it is
        // not a rift) and a HOLE in the feature: two palms together is SAT0RU's fourth trigger, and shield
        // already excludes every two-hand frame, so that pose could reach nothing at all. The gate did not
        // catch it -- reading what the gate PRINTED did.
        name: "prayer", label: "Palms together", emoji: "\u{1F64F}",
        kind: "prayer", hold: 1500,
        test: (m) => twoOpenPalms(m) && !!(m.twoHand) && m.twoHand.spread <= 0.25,
        note: "two open palms held close -- a rising column. The spread test is the same number the rift " +
              "uses, from the other side, so the two cannot both match and no pose falls between them",
    },
    {
        name: "rift", label: "Two palms apart", emoji: "\u{1F64C}",
        kind: "rift", hold: 1400,
        // The two-hand gesture must be tested against BOTH hands and the tracker's own twoHand block, which is
        // null unless it really saw two. Reading spread without that null check would let one hand fake it.
        test: (m) => twoOpenPalms(m) && !!(m.twoHand) && m.twoHand.spread > 0.25,
        note: "two open palms held apart -- a curtain between them. The tracker only fills twoHand when it " +
              "genuinely tracked two, so this cannot fire on one hand",
    },
];

/** Both hands present AND both flat. Used by two recipes, so it is written once. */
function twoOpenPalms(m) {
    return !!(m && m.hands && m.hands[0] && m.hands[1] && m.hands[0].openPalm && m.hands[1].openPalm);
}

/**
 * Gestures this module will NOT claim. Data, not prose, so the page can show the gap and the gate can hold
 * the reason to its stated cause.
 */
export const REFUSED = [
    {
        name: "crossedFingers",
        why: "MediaPipeHandTracker.metrics() reports per-finger FOLD and a single index-tip cursor. It never " +
             "reports where the middle fingertip is, so 'index crossed over middle' cannot be expressed from " +
             "this input -- and approximating it from fold flags would fire on ordinary half-curled hands.",
        wouldNeed: "the raw 21-landmark array from the tracker's snapshot(), where index-tip and middle-tip " +
                   "positions can actually be compared",
    },
];

export const NONE = "none";

/**
 * *** WHICH GESTURE IS THIS. Pure. ***
 *
 * ORDER IS THE TIE-BREAK AND IT IS DELIBERATE. A pinching hand often also reads as three folded fingers, and
 * a fist can momentarily satisfy a loose pointing test mid-close. GESTURES is ordered most-specific first and
 * the FIRST match wins, so the ambiguity resolves the same way every frame instead of alternating -- which is
 * the flicker an "all matches, highest score" scheme would produce here, since these are booleans with no
 * score to rank.
 */
export function classifyGesture(metrics) {
    if (!metrics || !metrics.hands || !metrics.handCount) return { name: NONE, usable: false };
    for (const g of GESTURES) {
        let hit = false;
        try { hit = !!g.test(metrics); } catch { hit = false; }
        if (hit) return { name: g.name, kind: g.kind, hold: g.hold, usable: true };
    }
    return { name: NONE, usable: true };
}

/**
 * The firing rule: EDGE-TRIGGERED, WITH A COOLDOWN, AND THOSE ARE TWO DIFFERENT GUARDS.
 *
 * A gesture held for two seconds is ONE gesture. Firing per frame would spawn thirty bursts a second and the
 * effect would be a solid wall -- so a burst fires on the ONSET only (the edge). The cooldown is separate: it
 * stops a gesture that flickers at its detection threshold from re-firing on every wobble, which the edge
 * alone cannot, because each wobble is a real new edge.
 */
export function makeGestureTrigger(opts = {}) {
    const cooldownMs = opts.cooldownMs != null ? opts.cooldownMs : 450;
    const now = opts.now || (() => Date.now());
    let last = NONE, lastFiredAt = new Map();

    return {
        /** Feed metrics; get { name, fired, kind, hold }. `fired` is true only on a real, allowed onset. */
        update(metrics) {
            const g = classifyGesture(metrics);
            const t = now();
            let fired = false;
            if (g.name !== NONE && g.name !== last) {
                const prev = lastFiredAt.get(g.name);
                if (prev == null || (t - prev) >= cooldownMs) { fired = true; lastFiredAt.set(g.name, t); }
            }
            last = g.name;
            return { name: g.name, usable: g.usable, kind: g.kind || null, hold: g.hold || 0, fired };
        },
        get current() { return last; },
        reset() { last = NONE; lastFiredAt = new Map(); },
    };
}

// ---------------------------------------------------------------------------------------------------------
// THE PARTICLES. Also pure: spawn returns a list, step returns the NEXT list. A renderer draws whatever it is
// handed and owns no simulation, so the physics below is gradeable the way the rest of this tree's physics is.
// ---------------------------------------------------------------------------------------------------------

/** Per-effect spawn shape. Positions are NORMALISED (0..1) so the page can scale to any canvas size. */
const BURSTS = {
    // converging inward, short-lived, bright
    spark:  { n: 34, speed: 0.42, spread: Math.PI * 2, life: 0.55, gravity: 0.15, size: 2.4, inward: true },
    // a ring blown outward, heavier, falls
    impact: { n: 46, speed: 0.75, spread: Math.PI * 2, life: 0.85, gravity: 0.90, size: 3.2, inward: false },
    // a narrow forward cone
    beam:   { n: 26, speed: 1.15, spread: 0.34,        life: 0.60, gravity: 0.05, size: 2.0, inward: false },
    // a slow wide ring that hangs
    shield: { n: 40, speed: 0.30, spread: Math.PI * 2, life: 1.10, gravity: -0.05, size: 2.6, inward: false },
    // a slow rising column -- upward bias, long-lived
    prayer: { n: 30, speed: 0.34, spread: 0.9,          life: 1.25, gravity: -0.55, size: 2.3, inward: false },
    // a tall curtain, wide horizontally
    rift:   { n: 54, speed: 0.55, spread: Math.PI * 2, life: 1.30, gravity: 0.20, size: 2.2, inward: false },
};

export const BURST_KINDS = Object.keys(BURSTS);

/** Deterministic when a `rand` is injected -- which is what lets the gate assert on exact behaviour. */
export function spawnBurst(kind, x, y, opts = {}) {
    const b = BURSTS[kind];
    if (!b) return [];
    const rand = opts.rand || Math.random;
    const angle0 = opts.angle != null ? opts.angle : 0;
    const out = [];
    for (let i = 0; i < b.n; i++) {
        const a = angle0 + (rand() - 0.5) * b.spread;
        const sp = b.speed * (0.45 + rand() * 0.75);
        out.push({
            x, y,
            vx: Math.cos(a) * sp * (b.inward ? -1 : 1),
            vy: Math.sin(a) * sp * (b.inward ? -1 : 1),
            life: b.life * (0.6 + rand() * 0.7),
            age: 0,
            size: b.size * (0.7 + rand() * 0.6),
            kind,
        });
    }
    return out;
}

/**
 * Advance every particle by dt SECONDS and drop the dead. Returns a NEW array.
 *
 * *** dt IS CLAMPED, AND THAT IS NOT A NICETY. *** A backgrounded tab hands the next frame a dt of several
 * seconds; unclamped, every particle would jump a screen-width in one step and the whole effect would appear
 * as a single frame of scattered dots. Clamping makes a stalled tab resume smoothly instead.
 */
export function stepParticles(list, dt, opts = {}) {
    if (!Array.isArray(list) || !list.length) return [];
    const step = Math.max(0, Math.min(dt, opts.maxStep != null ? opts.maxStep : 0.05));
    const drag = opts.drag != null ? opts.drag : 0.86;
    const out = [];
    for (const p of list) {
        const b = BURSTS[p.kind] || BURSTS.spark;
        const age = p.age + step;
        if (age >= p.life) continue;                       // dead: dropped, never resurrected
        const vx = p.vx * Math.pow(drag, step * 60);
        const vy = p.vy * Math.pow(drag, step * 60) + b.gravity * step;
        out.push({ ...p, age, x: p.x + vx * step, y: p.y + vy * step, vx, vy });
    }
    return out;
}

/** 1 at birth, 0 at death. The renderer's alpha; here so the fade curve is one declaration. */
export function particleAlpha(p) {
    if (!p || !(p.life > 0)) return 0;
    const t = p.age / p.life;
    return t >= 1 ? 0 : (1 - t) * (1 - t);
}
