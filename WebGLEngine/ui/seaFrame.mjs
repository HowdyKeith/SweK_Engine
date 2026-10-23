// WebGLEngine/ui/seaFrame.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// *** HOW A PAGE USES THE PATCHED SEA: THE FRAME, THE CAMERA, THE POINTS. *** Step 3 of ocean-src-integration.
// sea-host.html runs world/ocean/seaMain.mjs (upstream's main.js plus the recorded patches) and publishes its handle as window.seaApi. A same-origin parent page puts it in an <iframe>, behind or beside its
// own canvas, and drives it with the three helpers here:
//   seaCameraFromView   a view (position, forward direction, vertical field of view, a world scale) -> the sea's camera ({x, y, z, yaw, pitch, fovY}, radians, upstream's convention: yaw 0 looks along -z,
//                       positive yaw turns toward +x; pitch up is positive). A three.js camera looks along -z at yaw 0 too, so its forward vector converts directly.
//   hostUrl             the frame's URL, with only the parameters the sea reads (the same filter as ui/oceanSea.mjs seaUrl)
//   realizedStats       the REALIZED wave height of the GPU sea, from heights read back at many points over time: mean, sigma and 4*sigma as the significant height -- the number ui/oceanSea.mjs said
//                       had not been measured, because upstream exposes no height; the patched probe does.
// WHAT THIS DOES NOT SOLVE: drawing a SweK object IN the sea. A transparent canvas over the frame puts every object in front of all of the water; a submerged hull would show through the surface.
// ui/seaDepthTint.mjs is the approximation (a hull below the surface is tinted and faded by how deep it is, from the same surface the physics stands on); a true depth composite needs the sea's depth
// target, which upstream does not expose, and is not built.
"use strict";
import { seaUrl, SEA_PATH } from "./oceanSea.mjs";

export const SEA_HOST_PATH = "/sea-host.html";
export const MAX_POINTS = 64;

/** The sea's camera for a view. `forward` need not be unit length. Throws on a zero forward vector. */
export function seaCameraFromView(pos, forward, fovYDeg = 58, scale = 1, offset = [0, 0, 0]) {
    const [fx, fy, fz] = forward, len = Math.hypot(fx, fy, fz);
    if (!(len > 0)) throw new RangeError("seaFrame: the forward vector has no length");
    return { x: pos[0] * scale + offset[0], y: pos[1] * scale + offset[1], z: pos[2] * scale + offset[2], yaw: Math.atan2(fx, -fz), pitch: Math.asin(Math.max(-1, Math.min(1, fy / len))), fovY: fovYDeg * Math.PI / 180 };
}

/** The forward vector a sea camera looks along (upstream's: (cos p sin y, sin p, -cos p cos y)). */
export function forwardOfSeaCamera(c) { return [Math.cos(c.pitch) * Math.sin(c.yaw), Math.sin(c.pitch), -Math.cos(c.pitch) * Math.cos(c.yaw)]; }

/** The frame's URL. Same keys and same filter as seaUrl(); only the page differs. */
export function hostUrl(opts = {}) { return seaUrl(opts).replace(SEA_PATH, SEA_HOST_PATH); }

/** n x n world points spread over [-half, half] around (cx, cz), as the flat [x, z, ...] list setPoints takes; n*n is clamped to MAX_POINTS by dropping from the end. */
export function gridPoints(n, half, cx = 0, cz = 0) {
    const out = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { if (out.length >= MAX_POINTS * 2) return out; out.push(cx + (n === 1 ? 0 : -half + 2 * half * i / (n - 1)), cz + (n === 1 ? 0 : -half + 2 * half * j / (n - 1))); }
    return out;
}

/**
 * The realized height of the sea from rounds of readback. `rounds` is an array of Float32Array/arrays (one per readback, `count` heights each). Needs at least two rounds and four points, else null:
 * a handful of samples does not estimate a spread. hs = 4 sigma, the rule ui/oceanSea.mjs's surfaceStats uses for the physics surface, so the two figures are comparable.
 */
export function realizedStats(rounds, count) {
    if (!rounds || rounds.length < 2 || !(count >= 4)) return null;
    let n = 0, sum = 0, sum2 = 0, lo = Infinity, hi = -Infinity;
    for (const r of rounds) for (let i = 0; i < count; i++) { const h = r[i]; if (!Number.isFinite(h)) continue; n++; sum += h; sum2 += h * h; if (h < lo) lo = h; if (h > hi) hi = h; }
    if (n < 8) return null;
    const mean = sum / n, sigma = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    return { samples: n, rounds: rounds.length, points: count, mean, sigma, hs: 4 * sigma, min: lo, max: hi };
}

/** The bench report. */
export function reportLines(stats = null) {
    const L = ["[seaFrame] the patched sea in a frame: camera in, parameters in, heights out (up to " + MAX_POINTS + " points)"];
    L.push(stats ? "  realized: " + stats.samples + " samples over " + stats.rounds + " readbacks, mean " + stats.mean.toFixed(3) + " m, sigma " + stats.sigma.toFixed(3) + " m, Hs (4 sigma) " + stats.hs.toFixed(2) + " m, range " + stats.min.toFixed(2) + " .. " + stats.max.toFixed(2)
        : "  realized height: not measured here (needs a GPU running the sea; ocean-sea.html reads it on the rig)");
    return L;
}
