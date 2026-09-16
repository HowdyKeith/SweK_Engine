// WebGLEngine/render/frameRecorder.mjs -- v4610 (task #64, backlog id "deterministic-frame-recorder")
//
// A CAPTURE LOOP DRIVEN BY A SYNTHETIC CLOCK, NOT WALL TIME. THE ONE CLAIM THIS FILE EXISTS TO MAKE TRUE: the
// same animation captured twice produces IDENTICAL frames, regardless of how long each frame actually took to
// render or encode. This is JS-side timing discipline only -- NO GPU/device determinism claim; a scene that
// itself reads real time, or a driver that rounds differently frame to frame, is outside what this buys you.
//
// ---- WHY ---------------------------------------------------------------------------------------------------
// render/gifRecorder.js's recordGif(canvas, {onFrame}) hands the caller a frame INDEX, so a caller wanting
// position/rotation as a function of elapsed time has nothing principled to compute it from except real
// elapsed time -- which means a slow render (GPU contention, DevTools open, a busy CI box) changes the OUTPUT,
// not just how long capture takes. captureFrames below hands the caller a synthetic TIME instead: the fps-paced
// clock frameTime(index, fps).
//
// WebGL canvases: without preserveDrawingBuffer the backbuffer is undefined after compositing -- same caveat
// gifRecorder.js's own doc comment already states. Draw, then grab, in the same tick.
"use strict";

/** The synthetic clock: frame index -> milliseconds, evenly spaced at fps. Pure -- no DOM, no Date.now()/performance.now(). */
export function frameTime(index, fps) {
    return index * (1000 / fps);
}

/**
 * Drive `tick(time, index, total)` once per captured frame, on the SYNTHETIC clock above, and grab the canvas
 * after each call the same way recordGif does: a scratch same-size 2D canvas, drawImage, getImageData.
 *
 * `tick` (async or sync) must compute its redraw from the `time` it is handed, not from
 * performance.now()/Date.now() -- that discipline belongs to the caller and cannot be enforced from here; it is
 * the only thing that makes the output reproducible, and this module's whole reason to exist.
 *
 * `opts.yield` (default true) awaits one requestAnimationFrame between frames purely so the browser stays
 * responsive during a long capture -- explicitly NOT a timing source: with `yield: false` the loop runs with no
 * awaited yield at all, and the `time` schedule handed to `tick` is unchanged either way.
 *
 * Returns { frames, width, height, fps } -- shaped to feed directly into gifRecorder.js's
 * encodeGif(frames, width, height, { delay: 1000 / fps }) with no glue code.
 */
export async function captureFrames(canvas, tick, { frames = 24, fps = 24, yield: doYield = true } = {}) {
    const w = canvas.width, h = canvas.height;
    const scratch = document.createElement("canvas");
    scratch.width = w; scratch.height = h;
    const g = scratch.getContext("2d", { willReadFrequently: true });
    const grabbed = [];
    for (let i = 0; i < frames; i++) {
        await tick(frameTime(i, fps), i, frames);
        g.clearRect(0, 0, w, h);
        g.drawImage(canvas, 0, 0);
        grabbed.push(g.getImageData(0, 0, w, h).data);
        if (doYield) await new Promise((r) => requestAnimationFrame(r));
    }
    return { frames: grabbed, width: w, height: h, fps };
}
