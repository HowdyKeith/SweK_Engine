// WebGLEngine/ev/esShipLabels.js — v3831 (Long Silence, Slug ship labels — the Three.js side)
//
// FIRST ADOPTION OF THE SLUG OUTLINE-TEXT RENDERER (text/, merged v3823, first drawn on slug-text.html) INTO A
// REAL SCENE: per-ship nameplates in the 3D dogfight that track each ship's projected position and shrink with
// distance. The point is exactly the property slug-text-v3823.md sells and a bitmap font cannot match — the SAME
// 272 KiB atlas draws a near label at 40 px and a far one at 9 px with no re-bake, because Slug carries no baked
// resolution. Labels are coloured by team and carry a live integrity percent, so the text re-lays-out every
// frame, which Slug does cheaply.
//
// WHY A SEPARATE OVERLAY CANVAS AND NOT THREE'S CONTEXT: SlugTextBatch.draw() sets blend and depth state and
// deliberately does NOT restore it (its own note in text/slugText.js says so). Injecting that into Three's
// render loop would stomp Three's state mid-frame. So the labels live on their own transparent WebGL2 canvas
// stacked over the Three canvas; the only thing crossing the boundary is the camera's two matrices (plain
// number arrays) and each ship's world position. The pure map from those to a pixel is in esShipLabelsCore.js
// and is gated headless in ev/esShipLabels-selfcheck.mjs; the GPU draw is Keith's to see.
//
//   const labels = await makeShipLabels({ container: document.body });   // resolves once the atlas is packed
//   frame: labels.update(A.concat(B), camera, S);                        // after renderer.render, matrices current
//   labels.setEnabled(false);  labels.resize();  labels.destroy();

import { parseFont } from "/text/slugFont.js";
import { SlugFontGPU, SlugTextBatch } from "/text/slugText.js";
import { projectToScreen, labelText, sizeForDepth, placeOrthoRows } from "/ev/esShipLabelsCore.js";

// Only the glyphs a label can contain — class names plus the digits and punctuation of an integrity percent.
// Packing the whole Latin set would be wasted memory; the atlas is built once from just this run.
const LABEL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 %#.-";
const TEAM_COLOR = { A: [0.31, 0.82, 1.0, 0.95], B: [1.0, 0.6, 0.31, 0.95] };
const DEFAULT_COLOR = [0.82, 0.9, 1.0, 0.95];

export async function makeShipLabels(opts = {}) {
    const container = opts.container || document.body;
    const fontUrl = opts.fontUrl || "/vendor/fonts/IBMPlexSerif-Regular.ttf";
    const dpr = Math.min((typeof devicePixelRatio === "number" && devicePixelRatio) || 1, 2);

    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, {
        position: "fixed", left: "0", top: "0", width: "100%", height: "100%",
        pointerEvents: "none", zIndex: "1",
    });
    container.appendChild(canvas);

    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: true });
    if (!gl) {
        // No WebGL2 -> a live no-op that says why rather than throwing into the scene's frame loop.
        canvas.remove();
        return noop("WebGL2 is unavailable, so Slug labels are off");
    }

    let font, fontGPU;
    try {
        const r = await fetch(fontUrl);
        if (!r.ok) throw new Error("HTTP " + r.status);
        font = parseFont(await r.arrayBuffer());
        fontGPU = new SlugFontGPU(gl, font, LABEL_CHARS, { format: "16f" });
    } catch (e) {
        canvas.remove();
        return noop("could not load the label font at " + fontUrl + " (" + (e && e.message) + ")");
    }

    const batch = new SlugTextBatch(fontGPU);
    let enabled = opts.enabled !== false;

    function resize() {
        const w = Math.max(1, Math.round((canvas.clientWidth || innerWidth) * dpr));
        const h = Math.max(1, Math.round((canvas.clientHeight || innerHeight) * dpr));
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    resize();

    // Draw one label centred horizontally on its ship and lifted a little above it. `size` is CSS px; the canvas
    // is dpr-scaled, so lay out at size*dpr and place in device pixels to keep the text crisp at any dpr.
    function drawLabel(text, sx, sy, size, color) {
        const px = size * dpr;
        const laid = batch.set(text, { size: px, color });
        if (!laid || !laid.width) return;
        const ox = sx - laid.width / 2;          // centre on the ship
        const oy = sy - px * 0.9;                 // baseline a little above the hull
        batch.draw(placeOrthoRows(canvas.width, canvas.height, ox, oy), [canvas.width, canvas.height]);
    }

    function update(ships, camera, S) {
        resize();
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (!enabled || !camera) return;
        const proj = camera.projectionMatrix.elements, view = camera.matrixWorldInverse.elements;
        const scale = S || 1;
        for (const e of ships || []) {
            if (!e || e.dead) continue;
            const p = projectToScreen(
                proj, view,
                (e.x || 0) * scale, (e.alt || 0) * scale, (e.y || 0) * scale,
                canvas.width, canvas.height,
            );
            if (!p.visible) continue;
            drawLabel(labelText(e), p.x, p.y, sizeForDepth(p.w, opts.size), TEAM_COLOR[e.team] || DEFAULT_COLOR);
        }
    }

    return {
        canvas,
        update,
        resize,
        setEnabled(on) { enabled = !!on; if (!enabled) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } },
        isEnabled() { return enabled; },
        ready: true,
        destroy() { try { batch.destroy(); fontGPU.destroy && fontGPU.destroy(); } catch (_) {} canvas.remove(); },
    };
}

// A labels handle that is safe to call but draws nothing, carrying the reason it is inert.
function noop(reason) {
    return {
        canvas: null, ready: false, reason,
        update() {}, resize() {}, setEnabled() {}, isEnabled() { return false; }, destroy() {},
    };
}
