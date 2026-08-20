// WebGLEngine/ui/stateOrb.js -- v3357
//
// *** SIX ORBS, AND EVERY ONE NAMES A STATE THE ENGINE ACTUALLY KNOWS. ***
//
// The idea is Jakubantalik/thinking-orbs (MIT, React + npm + Vite -- NOT installable here, and not installed):
// six hand-tuned animated states instead of one spinner. THE PART WORTH TAKING IS NOT THE ANIMATION, IT IS THAT
// A STATE NAMES A VERB. A generic spinner is decoration; six distinguishable states are information.
//
// *** AND A SPINNER THAT SPINS FOREVER IS THE BLACK-SCREEN-WITHOUT-A-REASON FAILURE IN A NEW COSTUME. *** v3047,
// v3053 and v3067 were all pages that showed nothing and could not say why. AN ORB IS WORSE THAN A BLANK AREA
// WHEN IT IMPLIES PROGRESS THAT IS NOT HAPPENING, because it LOOKS LIKE AN ANSWER. So the binding rule, and it
// is gated:
//
//     EVERY STATE HERE CORRESPONDS TO A DISTINCTION THE ENGINE ALREADY DRAWS AND ALREADY REFUSES TO COLLAPSE.
//
// Those distinctions were each won in a round: NEVER RUN is not PASS (v3048 -- "a page nobody has tested and a
// page that passed look the same in any list that only has two states, and they are not the same claim").
// TIMEOUT is not FAILURE (v3076 -- null is the exit code of a process that was KILLED, and reading it as a
// failure is a confident wrong answer about unfinished work). VERDICT-OWED is not RENDERED (v3339 -- it cannot
// be reached by rendering harder). An orb with fewer states than the page has is the collapse those rounds
// undid, drawn in motion.
//
// TAKEN FROM thinking-orbs' DISCIPLINE LIST, WHICH IS HALF THIS TREE'S OWN LAWS ALREADY:
//   - PLAIN 2D CANVAS ARCS. No WebGL, no ctx.filter, no SVG filters -- the same pixels everywhere, and it draws
//     while the GPU path is down, which is the trick ray-march-demo and biome-map-demo already use.
//   - ONE SHARED CLOCK. Every orb on a page reads the same time base and resumes IN PHASE. Six orbs each with
//     their own rAF drift apart and read as six unrelated things.
//   - A HIDDEN TAB DOES ZERO WORK, not less (v2771/v3051), and an offscreen orb is paused by IntersectionObserver.
//   - prefers-reduced-motion RENDERS A STATIC REPRESENTATIVE FRAME rather than nothing -- the state still reads.
//   - devicePixelRatio CAPPED AT 2.
"use strict";

/**
 * THE SIX, each with the engine distinction it exists to show. `sameAs: null` means this state must never be
 * conflated with another -- the pairs listed are the ones rounds were spent separating.
 */
export const ORB_STATES = {
    "never-run":  { label: "never run",   notThe: "pass",      won: "v3048", hue: 0.58, spin: 0.0,  dots: 14 },
    pass:         { label: "pass",        notThe: "never run", won: "v3048", hue: 0.35, spin: 0.15, dots: 18 },
    fail:         { label: "fail",        notThe: "timeout",   won: "v3076", hue: 0.02, spin: 0.5,  dots: 12 },
    timeout:      { label: "timeout",     notThe: "fail",      won: "v3076", hue: 0.11, spin: 0.22, dots: 12 },
    owed:         { label: "verdict owed", notThe: "rendered", won: "v3339", hue: 0.78, spin: 0.3,  dots: 16 },
    working:      { label: "working",     notThe: "waiting",   won: "v3051", hue: 0.48, spin: 1.0,  dots: 20 },
};
export const STATE_NAMES = Object.keys(ORB_STATES);

/** ONE CLOCK. Shared deliberately: orbs that each kept their own drift apart within seconds. */
let _t0 = null;
export function clockNow(now) { if (_t0 === null) _t0 = now; return (now - _t0) / 1000; }
export function resetClock() { _t0 = null; }

export const reducedMotion = () =>
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Pure: where each dot sits at time t. Separated from drawing so the gate can check the MOTION without a canvas
 * -- a shape nobody can test is decoration with extra steps.
 */
export function dotsAt(state, t, size) {
    const s = ORB_STATES[state];
    if (!s) return null;                                    // UNKNOWN STATE IS NULL, NEVER A DEFAULT ORB
    const n = size >= 40 ? s.dots : Math.max(6, Math.round(s.dots * 0.6));
    const r = size * 0.38, out = [];
    const phase = reducedMotion() ? 0 : t * s.spin;         // a static REPRESENTATIVE frame, not a blank one
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + phase;
        const wob = state === "working" ? 1 + 0.12 * Math.sin(t * 2 + i) : 1;
        out.push({ x: Math.cos(a) * r * wob, y: Math.sin(a) * r * wob * 0.62, i });
    }
    return out;
}

/** Draw one orb. 2D arcs only -- no filter, no gradient tricks, nothing a low-end device pays for. */
export function drawOrb(ctx, state, t, size, ink) {
    const pts = dotsAt(state, t, size);
    if (!pts) return false;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    const dot = Math.max(1, size * 0.035);
    for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, dot, 0, Math.PI * 2);
        ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.6 + p.i * 0.7));
        ctx.fillStyle = ink;
        ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    return true;
}

export const dprCap = (v) => Math.min(2, v || 1);
