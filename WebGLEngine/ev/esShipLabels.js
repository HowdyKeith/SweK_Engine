// WebGLEngine/ev/esShipLabels.js — v4463 (Long Silence, Slug ship labels — the Three.js side; on the device since v4463)
//
// FIRST ADOPTION OF THE SLUG OUTLINE-TEXT RENDERER (text/, merged v3823, first drawn on slug-text.html) INTO A
// REAL SCENE: per-ship nameplates in the 3D dogfight that track each ship's projected position and shrink with
// distance. The point is exactly the property slug-text-v3823.md sells and a bitmap font cannot match — the SAME
// 272 KiB atlas draws a near label at 40 px and a far one at 9 px with no re-bake, because Slug carries no baked
// resolution. Labels are coloured by team and carry a live integrity percent, so the text re-lays-out every
// frame, which Slug does cheaply.
//
// WHY A SEPARATE OVERLAY CANVAS AND NOT THREE'S CONTEXT: the labels live on their own transparent canvas stacked
// over the Three canvas; the only thing crossing the boundary is the camera's two matrices (plain number arrays)
// and each ship's world position. The pure map from those to a pixel is in esShipLabelsCore.js and is gated
// headless in ev/esShipLabels-selfcheck.mjs; the GPU draw is Keith's to see.
//
// ---- v4463 -- THE FIRST CONSUMER OF render/slugDevice.mjs, WITH A FALLBACK THAT IS THE WHOLE DESIGN ------------------
//
// The overlay now draws through gfx/device.js: WebGPU where the page has it, WebGL2 where it does not, the same
// atlas in the device's rgba16float and rg16uint textures, premultiplied blend from the descriptor. On the WebGL2
// backend the device picture IS the raw batch's, byte for byte (tools/ship/slugDevice-selfcheck.mjs); on WebGPU it
// is the twin held to the same CPU key. What is NOT known from the build box is whether a PRESENTED WebGPU frame is
// right -- this box loses the device on any canvas-targeted pass (gfx/device.js Level 11), and the rig's answer is
// device-present.html (task 19). So:
//
//   *** THE DEVICE PATH IS THE DEFAULT AND THE RAW WebGL2 BATCH IS THE FALLBACK, TAKEN AUTOMATICALLY. *** If WebGPU
//   is absent the device comes up on WebGL2 and nothing is lost. If the WebGPU device is LOST -- the lost promise
//   fires, which is exactly what this box does on the first presented frame -- the overlay is rebuilt on a FRESH
//   canvas (a canvas that has held a WebGPU context cannot hand out a WebGL2 one) with the v3831 raw batch, and the
//   handle says so in `path` and `reason`. A label layer that went blank would be worse than the one it replaces;
//   this one cannot stay blank for longer than the loss takes to report.
//
//   opts.path = "raw" asks for the v3831 path outright; opts.backend = "webgl2" | "webgpu" pins the device's backend.
//
//   const labels = await makeShipLabels({ container: document.body });   // resolves once the atlas is packed
//   frame: labels.update(A.concat(B), camera, S);                        // after renderer.render, matrices current
//   labels.setEnabled(false);  labels.resize();  labels.destroy();  labels.path  // "device:webgpu" | "device:webgl2" | "raw"

import { parseFont } from "/text/slugFont.js";
import { SlugFontGPU, SlugTextBatch } from "/text/slugText.js";
import { SlugFontDevice, SlugDeviceBatch } from "/render/slugDevice.mjs";
import { requestDevice } from "/gfx/device.js";
import { projectToScreen, labelText, sizeForDepth, placeOrthoRows } from "/ev/esShipLabelsCore.js";

// Only the glyphs a label can contain — class names plus the digits and punctuation of an integrity percent.
// Packing the whole Latin set would be wasted memory; the atlas is built once from just this run.
export const LABEL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 %#.-";
const TEAM_COLOR = { A: [0.31, 0.82, 1.0, 0.95], B: [1.0, 0.6, 0.31, 0.95] };
const DEFAULT_COLOR = [0.82, 0.9, 1.0, 0.95];

function overlayCanvas(container) {
    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, {
        position: "fixed", left: "0", top: "0", width: "100%", height: "100%",
        pointerEvents: "none", zIndex: "1",
    });
    container.appendChild(canvas);
    return canvas;
}

/** Where each visible ship's label goes: the pure part of a frame, shared by both paths. */
function placements(ships, camera, S, w, h, dpr, sizeOpt) {
    const out = [];
    if (!camera) return out;
    const proj = camera.projectionMatrix.elements, view = camera.matrixWorldInverse.elements;
    const scale = S || 1;
    for (const e of ships || []) {
        if (!e || e.dead) continue;
        const p = projectToScreen(proj, view, (e.x || 0) * scale, (e.alt || 0) * scale, (e.y || 0) * scale, w, h);
        if (!p.visible) continue;
        out.push({ text: labelText(e), px: sizeForDepth(p.w, sizeOpt) * dpr, sx: p.x, sy: p.y, color: TEAM_COLOR[e.team] || DEFAULT_COLOR });
    }
    return out;
}

/** The v3831 path: a raw WebGL2 context, SlugFontGPU, one batch re-set per label. */
function rawImpl(canvas, font) {
    // v4121 -- preserveDrawingBuffer so ui/crtToggle.js can SAMPLE this canvas. Without it the drawing
    // buffer is cleared after compositing and a read at any other moment returns BLACK. MEASURED COST: a
    // 1000x588 WebGL2 canvas over 90 frames came out at 26.99 ms with the flag against 28.90 ms without --
    // inside the noise, on this box's SOFTWARE rasteriser.
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: true });
    if (!gl) return null;
    const fontGPU = new SlugFontGPU(gl, font, LABEL_CHARS, { format: "16f" });
    const batch = new SlugTextBatch(fontGPU);
    return {
        kind: "raw",
        clear() { gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); },
        drawFrame(list) {
            this.clear();
            for (const L of list) {
                const laid = batch.set(L.text, { size: L.px, color: L.color });
                if (!laid || !laid.width) continue;
                batch.draw(placeOrthoRows(canvas.width, canvas.height, L.sx - laid.width / 2, L.sy - L.px * 0.9), [canvas.width, canvas.height]);
            }
        },
        destroy() { try { batch.destroy(); fontGPU.destroy && fontGPU.destroy(); } catch (_) {} },
    };
}

/** The v4463 path: gfx/device.js, one batch per label slot so no buffer is destroyed under a frame's own draw. */
function deviceImpl(canvas, font, device) {
    const fontDevice = new SlugFontDevice(device, font, LABEL_CHARS);
    const batches = [];
    return {
        kind: "device:" + device.backend, device,
        clear() { device.frame(({ pass }) => { pass.clear([0, 0, 0, 0]); }); },
        drawFrame(list) {
            // Lay out first, so every buffer a draw references outlives the frame's own commands; the batch a slot held
            // last frame is rebuilt here, after last frame's commands have been submitted.
            const ready = [];
            list.forEach((L, i) => {
                if (!batches[i]) batches[i] = new SlugDeviceBatch(fontDevice);
                const laid = batches[i].set(L.text, { size: L.px, color: L.color });
                if (laid && laid.width) ready.push({ b: batches[i], rows: placeOrthoRows(canvas.width, canvas.height, L.sx - laid.width / 2, L.sy - L.px * 0.9) });
            });
            device.frame(({ pass }) => {
                pass.clear([0, 0, 0, 0]);
                for (const r of ready) r.b.draw(pass, r.rows, [canvas.width, canvas.height]);
            });
        },
        destroy() { try { for (const b of batches) b.destroy(); fontDevice.destroy(); device.destroy(); } catch (_) {} },
    };
}

export async function makeShipLabels(opts = {}) {
    const container = opts.container || document.body;
    const fontUrl = opts.fontUrl || "/vendor/fonts/IBMPlexSerif-Regular.ttf";
    const dpr = Math.min((typeof devicePixelRatio === "number" && devicePixelRatio) || 1, 2);

    let font;
    try {
        const r = await fetch(fontUrl);
        if (!r.ok) throw new Error("HTTP " + r.status);
        font = parseFont(await r.arrayBuffer());
    } catch (e) {
        return noop("could not load the label font at " + fontUrl + " (" + (e && e.message) + ")");
    }

    let canvas = overlayCanvas(container);
    let impl = null, reason = null;
    const fallbackListeners = [];

    // The raw path, on a fresh canvas when the current one has held another context.
    const useRaw = (why, freshCanvas) => {
        if (freshCanvas) { canvas.remove(); canvas = overlayCanvas(container); }
        impl = rawImpl(canvas, font);
        reason = why;
        if (!impl) { canvas.remove(); return false; }
        resize();
        for (const f of fallbackListeners) f(why);
        return true;
    };

    if (opts.path !== "raw") {
        try {
            const device = await requestDevice(canvas, opts.backend ? { backend: opts.backend } : { prefer: "webgpu" });
            if (device && device.backend !== "null") {
                impl = deviceImpl(canvas, font, device);
                // *** THE FALLBACK: a lost WebGPU device rebuilds the overlay on the raw batch, on a fresh canvas. ***
                if (device.gpu && device.gpu.lost) device.gpu.lost.then((info) => {
                    if (!impl || impl.device !== device) return;
                    try { impl.destroy(); } catch (_) {}
                    useRaw("WebGPU device lost: " + ((info && info.message) || "(no message)") + " -- labels rebuilt on the raw WebGL2 batch", true);
                }).catch(() => {});
            } else reason = "requestDevice gave " + (device ? device.backend : "nothing");
        } catch (e) { reason = "device path threw: " + (e && e.message); }
    } else reason = "opts.path is raw";
    if (!impl && !useRaw(reason, true)) return noop("WebGL2 is unavailable and the device path gave " + reason + ", so Slug labels are off");

    let enabled = opts.enabled !== false;

    function resize() {
        const w = Math.max(1, Math.round((canvas.clientWidth || innerWidth) * dpr));
        const h = Math.max(1, Math.round((canvas.clientHeight || innerHeight) * dpr));
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    resize();

    function update(ships, camera, S) {
        resize();
        if (!enabled || !camera) { impl.clear(); return; }
        impl.drawFrame(placements(ships, camera, S, canvas.width, canvas.height, dpr, opts.size));
    }

    return {
        get canvas() { return canvas; },
        get path() { return impl.kind; },
        get reason() { return reason; },
        onFallback(f) { fallbackListeners.push(f); },
        update,
        resize,
        setEnabled(on) { enabled = !!on; if (!enabled) impl.clear(); },
        isEnabled() { return enabled; },
        ready: true,
        destroy() { try { impl.destroy(); } catch (_) {} canvas.remove(); },
    };
}

// A labels handle that is safe to call but draws nothing, carrying the reason it is inert.
function noop(reason) {
    return {
        canvas: null, ready: false, reason, path: "none",
        update() {}, resize() {}, setEnabled() {}, isEnabled() { return false; }, onFallback() {}, destroy() {},
    };
}
