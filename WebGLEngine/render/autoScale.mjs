// WebGLEngine/render/autoScale.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// THE RULE THAT LOWERS snow-gpu.html's RENDER SCALE WHEN THE FRAME IS SLOW, as a pure reducer so the page and its gate run the same code. The rig's two GPUs (2026-10-23) said the frame is the beauty pass and cost follows
// pixels: a GTX 1080 draws 1280x720 in 10 ms and 1080p in ~20, an Intel gen-9 draws 1280x720 in ~60 ms (16 fps). Render scale is the lever, and a person on the second box should not have to find the slider.
//
// THE RULE. The page feeds it every frame's wall-clock time in milliseconds. After a cool-down (the first frames compile shaders and the GPU's clock is still ramping, so they say nothing) it takes the MEAN of the next
// `window` frames; if that is over `slowMs` (about 36 fps) and the scale is above `min`, the scale drops by `step` (never below `min`), and the cool-down starts again. IT NEVER RAISES THE SCALE: a frame that is vsync-capped at
// 16.7 ms looks the same at 100% and at 40%, so wall-clock time alone cannot say there is headroom. The slider is how a person goes back up. A frame sample is capped at 100 ms (a one-off stall is not a trend).
"use strict";
export const AUTO = Object.freeze({ slowMs: 28, window: 20, step: 0.85, min: 0.4, cooldown: 45, cap: 100 });

/** The state a page starts auto mode with at `scale` (0.25..1). */
export function autoStart(scale, o = AUTO) { return { scale, n: 0, sum: 0, cool: o.cooldown, mean: null, changed: false }; }

/** One frame of `dtMs`: returns the next state; `changed` is true on the frame the scale dropped (the page then calls rebuildSize). Pure: the input state is not modified. */
export function autoStep(s, dtMs, o = AUTO) {
    if (!Number.isFinite(dtMs) || dtMs <= 0) return { ...s, changed: false };
    const dt = Math.min(o.cap, dtMs);
    if (s.cool > 0) return { ...s, cool: s.cool - 1, changed: false };
    const n = s.n + 1, sum = s.sum + dt;
    if (n < o.window) return { ...s, n, sum, changed: false };
    const mean = sum / n;
    if (mean > o.slowMs && s.scale > o.min + 1e-9) return { scale: Math.max(o.min, Math.round(s.scale * o.step * 100) / 100), n: 0, sum: 0, cool: o.cooldown, mean, changed: true };
    return { ...s, n: 0, sum: 0, mean, changed: false };
}

/** The scale a run of constant frame time settles at, and how many frames it takes: the rule driven to its fixed point, for the gate and for anyone asking "where does a 60 ms box end up". */
export function settle(startScale, msAtScale, o = AUTO) {
    let s = autoStart(startScale, o), frames = 0;
    for (; frames < 100000; frames++) { s = autoStep(s, msAtScale(s.scale), o); if (!s.changed && s.cool === 0 && s.n === 0 && s.mean !== null && !(s.mean > o.slowMs && s.scale > o.min + 1e-9)) break; }
    return { scale: s.scale, frames };
}
