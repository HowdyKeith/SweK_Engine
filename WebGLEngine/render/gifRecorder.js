// WebGLEngine/render/gifRecorder.js — v2590
//
// THE GIF ROAD. It exists, it is 12K, and it is the only export here that plays EVERYWHERE.
//
// ---- WHY THIS EXISTS ----------------------------------------------------------------------------------------------
//
// v2588 measured the video road honestly and it dead-ends: MediaRecorder gives WebM/VP9, and its "video/mp4" is
// a real MP4 container WITH VP9 INSIDE IT (avc1 absent, vp09 at byte 28) -- a file a Roku opens, fails to
// decode, and shows black, while isTypeSupported() said yes the whole way. H.264 needs ffmpeg on Galaxina.
//
// A GIF needs nobody. It plays in every browser, every chat window, every phone, and every TV photo viewer,
// with no codec negotiation and no transcode step. IT IS THE WORST FORMAT AND THE BEST ANSWER.
//
// ---- VERIFIED BY ENCODING, NOT BY READING ---------------------------------------------------------------------------
//
// vendor/gifenc/ -- gifenc 1.0.3, MIT, Matt DesLauriers, git://github.com/mattdesl/gifenc.git. 12K, ZERO
// dependencies, vendored from the allowlisted npm registry. Not trusted because npm said MIT: RUN IN THIS
// SANDBOX -- 8 frames of 64x64 -> 1364 bytes, magic "GIF89a", trailer 0x3b. A REAL GIF.
//
// ---- WHAT IT COSTS, SAID UP FRONT ------------------------------------------------------------------------------------
//
// A GIF IS 256 COLOURS PER FRAME, MAXIMUM. That is not a bug to work around, it is the format. quantize() picks
// a palette per frame; the blob's smooth gradients are exactly the worst case for that (banding), and the
// x-ray's greyscale is exactly the best case (a grey ramp fits a 256-entry palette perfectly).
//
// SO: THE X-RAY SELFIE IS THE ONE THING IN THIS ENGINE THAT LOSES ALMOST NOTHING AS A GIF. That is a happy
// accident and it is worth saying out loud rather than discovering.
import { GIFEncoder, quantize, applyPalette } from "../vendor/gifenc/gifenc.esm.js";

/**
 * Encode RGBA frames to an animated GIF.
 *
 * @param {Array<Uint8ClampedArray>} frames  RGBA, exactly what ctx.getImageData(...).data hands you
 * @param {number} w
 * @param {number} h
 * @param {{ delay?: number, colors?: number, grey?: boolean }} [opts]
 *        delay  ms per frame (GIF stores it in 10ms units -- see the rounding note below)
 *        colors palette size, <= 256 BECAUSE THAT IS THE FORMAT
 *        grey   quantize once on the first frame and reuse. Correct for the x-ray, WRONG for anything that
 *               changes hue -- a shared palette on shifting colours is how GIFs get that muddy look.
 * @returns {Uint8Array}
 */
export function encodeGif(frames, w, h, opts = {}) {
    const delay = opts.delay ?? 80;
    const colors = Math.min(256, Math.max(2, opts.colors ?? 128));
    if (!frames.length) throw new Error("encodeGif: no frames -- a canvas that never repaints emits none");
    const enc = GIFEncoder();
    let shared = null;
    for (const rgba of frames) {
        if (rgba.length !== w * h * 4) throw new Error("encodeGif: frame is " + rgba.length + " bytes, expected " + (w * h * 4) + " for " + w + "x" + h + " RGBA");
        const palette = opts.grey ? (shared ||= quantize(rgba, colors)) : quantize(rgba, colors);
        const index = applyPalette(rgba, palette);
        enc.writeFrame(index, w, h, { palette, delay });
    }
    enc.finish();
    return enc.bytes();
}

/**
 * Grab frames off a live canvas and encode. Browser-side.
 *
 * NOTE THE TRAP v2588 PAID FOR: a canvas that does not repaint emits nothing. Unlike captureStream this pulls
 * on a timer rather than waiting for paints, SO IT WILL HAPPILY RECORD A STILL BLOB -- which is a feature here
 * and was a footgun there.
 *
 * WebGL canvases: without preserveDrawingBuffer the backbuffer is undefined after compositing, exactly as
 * v2585's shutter found. Draw, then grab, in the same tick.
 */
export async function recordGif(canvas, { frames = 24, delay = 80, colors = 128, grey = false, onFrame } = {}) {
    const w = canvas.width, h = canvas.height;
    const scratch = document.createElement("canvas");
    scratch.width = w; scratch.height = h;
    const g = scratch.getContext("2d", { willReadFrequently: true });
    const grabbed = [];
    for (let i = 0; i < frames; i++) {
        if (onFrame) await onFrame(i, frames);   // let the caller advance/redraw the sim
        g.clearRect(0, 0, w, h);
        g.drawImage(canvas, 0, 0);
        grabbed.push(g.getImageData(0, 0, w, h).data);
        await new Promise((r) => requestAnimationFrame(r));
    }
    return encodeGif(grabbed, w, h, { delay, colors, grey });
}

/** The six bytes that say it is a GIF. An extension is a claim; a magic number is evidence. */
export function sniffGif(bytes) {
    if (bytes.length < 6) return false;
    const m = String.fromCharCode(...bytes.slice(0, 6));
    return m === "GIF89a" || m === "GIF87a";
}

/**
 * GIF stores delay in HUNDREDTHS OF A SECOND. A 16ms frame (60fps) rounds to 0.02s = 50fps... and a delay of 1
 * (10ms) is treated as 100ms by most browsers for historical reasons. THE FORMAT CANNOT DO 60FPS AND ANYONE WHO
 * TELLS YOU OTHERWISE HAS NOT CHECKED. This reports what you will ACTUALLY get.
 */
export function realGifFps(delayMs) {
    const units = Math.round(delayMs / 10);
    const clamped = units <= 1 ? 10 : units;   // browsers floor <=1 to 10 units
    return { requestedMs: delayMs, storedUnits: units, actualMs: clamped * 10, actualFps: 1000 / (clamped * 10) };
}
