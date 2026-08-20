// physics/backendVisualDiff.mjs -- the VISUAL counterpart to the trajectory divergence harness: rasterize each
// backend's physics scene to a pixel buffer and pixel-diff the frames. This is what a render-QA comparison does,
// but done headlessly -- it rasterizes the box positions/rotations to an RGBA buffer in plain JS (no browser), so
// Jolt-vs-Jolt (identical render) and Jolt-vs-box3d (different solvers -> different render) can be compared here.
// On a rig, the SAME comparison runs against real canvas/WebGPU screenshots through the Playwright render-qa rig;
// this headless version proves the diff logic + gives a browserless box3d-vs-Jolt image delta.
"use strict";

import { buildScene } from "./backendDivergence.mjs";

// side-view (x-y) rasterizer: draw each dynamic body as a filled rotated square into an RGBA Uint8 buffer.
function rasterize(world, idx, W = 160, H = 120, ppm = 12, cx = 0, cy = 3) {
    const buf = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < buf.length; i += 4) { buf[i + 3] = 255; }
    const xf = world.readTransforms();
    for (const bi of idx) {
        const px = xf[bi * 7], py = xf[bi * 7 + 1], qz = xf[bi * 7 + 5], qw = xf[bi * 7 + 6];
        const ang = Math.atan2(2 * qz * qw, 1 - 2 * qz * qz), h = 0.5;   // 0.5m half-extent (matches buildScene)
        // 4 corners in world, projected to pixels
        const ca = Math.cos(ang), sa = Math.sin(ang), corners = [];
        for (const [ox, oy] of [[-h, -h], [h, -h], [h, h], [-h, h]]) { const wxp = px + ox * ca - oy * sa, wyp = py + ox * sa + oy * ca; corners.push([(wxp - cx) * ppm + W / 2, H - ((wyp - cy) * ppm + H / 2)]); }
        // bounding box + point-in-quad fill
        let minx = W, maxx = 0, miny = H, maxy = 0; for (const [x, y] of corners) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
        const shade = 90 + (bi * 53) % 140;
        for (let y = Math.max(0, miny | 0); y <= Math.min(H - 1, maxy | 0); y++) for (let x = Math.max(0, minx | 0); x <= Math.min(W - 1, maxx | 0); x++) {
            if (_inQuad(x + 0.5, y + 0.5, corners)) { const o = (y * W + x) * 4; buf[o] = shade; buf[o + 1] = shade + 20; buf[o + 2] = shade + 40; }
        }
    }
    return { data: buf, w: W, h: H };
}
function _inQuad(x, y, c) { let inside = false; for (let i = 0, j = 3; i < 4; j = i++) { const xi = c[i][0], yi = c[i][1], xj = c[j][0], yj = c[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }

// pixel diff: fraction of pixels whose colour differs by more than thresh, plus the max channel delta
function pixelDiff(a, b, thresh = 16) {
    let diff = 0, maxD = 0; const n = Math.min(a.data.length, b.data.length);
    for (let i = 0; i < n; i += 4) { const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2])); maxD = Math.max(maxD, d); if (d > thresh) diff++; }
    const px = n / 4; return { diffFraction: diff / px, diffPixels: diff, maxDelta: maxD };
}

// render a backend's scenario, capturing frames at sampled ticks
function renderFrames(makeWorld, ticks = 120, sampleEvery = 30, seedOffset = 0) {
    const world = makeWorld(); const idx = buildScene(world, seedOffset); const frames = [];
    for (let t = 0; t < ticks; t++) { world.step(1 / 60, 2); if ((t + 1) % sampleEvery === 0) frames.push(rasterize(world, idx)); }
    if (world.destroy) world.destroy(); return frames;
}
function compareVisual(framesA, framesB, thresh = 16) {
    const n = Math.min(framesA.length, framesB.length); let worst = 0; const perFrame = [];
    for (let i = 0; i < n; i++) { const d = pixelDiff(framesA[i], framesB[i], thresh); perFrame.push(d.diffFraction); worst = Math.max(worst, d.diffFraction); }
    return { perFrame, worst, identical: worst === 0 };
}

export { rasterize, pixelDiff, renderFrames, compareVisual };
