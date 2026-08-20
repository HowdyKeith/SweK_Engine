// WebGLEngine/render/foldTunnel.js — v3836 (a fold/warp jump tunnel)
//
// The jump effect is the swept-spine tube (render/sweptSpine.js) aimed forward down a curving "fold" path, viewed
// from inside, with a ring pattern that SCROLLS toward the camera to sell speed. The scroll is the endless-loop
// trick from screen-space demos: a modulo/fract wrap on the along-tube coordinate, so the pattern repeats with no
// seam and no state -- it is recomputed from `time` every frame, nothing persists. (That is deliberately NOT the
// snowflow toroidal deform buffer, which is a persistent accumulation field; a transient jump needs none of it.)
//
// This file is the PURE, GPU-FREE core: the fract scroll and its periodic ring pattern (so the tube has no seam at
// the wrap), the jump lifecycle envelope (ramp in / hold / ramp out), and the fold spine the tube is swept along.
// The tube geometry itself is sweptSpine's, already gated; the fold shader mirrors scroll()+ringPattern(). No
// Three, no GL, no DOM. Gated headless in render/foldTunnel-selfcheck.mjs.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

// The wrapped scroll coordinate in [0, 1): the along-tube position, advanced by time, folded by fract. Seamless
// by construction -- advancing `along` by exactly `period` lands on the same value, so the pattern has no seam.
export function scroll(along, time, speed = 1, period = 1) {
    let p = along / period - time * speed;
    return p - Math.floor(p);   // fract -> always [0, 1)
}

// A PERIODIC ring pattern in [0, 1]: bright at the wrap point (phase 0 == 1), dark between. Because f(0) == f(1),
// scrolling it with `scroll` gives continuous motion with no visible seam. `sharpness` narrows the bright ring.
export function ringPattern(phase, sharpness = 6) {
    const x = Math.abs(phase - 0.5) * 2;   // 1 at phase 0 and 1, 0 at phase 0.5
    return Math.pow(x, sharpness);
}

const DEF = { inDur: 0.6, holdDur: 1.2, outDur: 0.7 };

// Total length of the jump, seconds.
export function jumpDuration(o = {}) { return (o.inDur ?? DEF.inDur) + (o.holdDur ?? DEF.holdDur) + (o.outDur ?? DEF.outDur); }

// The jump lifecycle envelope in [0, 1]: eased ramp up over inDur, flat 1 for holdDur, eased ramp down over
// outDur, and 0 outside the window. Drives the tunnel's opacity and scroll speed so a jump begins and ends at rest.
export function jumpEnvelope(t, o = {}) {
    const inD = o.inDur ?? DEF.inDur, hold = o.holdDur ?? DEF.holdDur, out = o.outDur ?? DEF.outDur;
    if (t <= 0 || t >= inD + hold + out) return 0;
    if (t < inD) return smooth(t / inD);
    if (t < inD + hold) return 1;
    return smooth(1 - (t - inD - hold) / out);
}

// The fold spine: a path of `samples` points running forward `length` along +z with a lateral bend that peaks in
// the middle (the "fold"). Starts at the origin. Fed to sweptSpine to build the tube the camera flies through.
export function foldSpine(samples, length = 400, bend = 60) {
    const pts = [];
    for (let i = 0; i < samples; i++) {
        const t = i / (samples - 1);
        pts.push([bend * Math.sin(t * Math.PI), bend * 0.4 * Math.sin(t * Math.PI * 0.5), t * length]);
    }
    return pts;
}
