// WebGLEngine/brain/stealthLoomStimuli.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is brain/stealthLoomStimuli-selfcheck.mjs; the round note is brain/STEALTH_ROUNDS_WIP.md)
//
// THE CUTTLEFISH'S PREDATOR CUES AS LOOMING FRAME SEQUENCES FOR THE LOOMING DETECTORS (Rounds 3, 5 and 6). Santon et al. 2025 showed crabs a dark ELLIPSE expanding exponentially (10 s, 10 degrees to 53 x 74) with no stripes, with static stripes, or with stripes moving DOWN at 4 Hz (brain/stealthMotion.mjs is their motion-detector analysis of those).
// The fly and crab models of this tree (brain/flyEmdLplc2Gf.mjs, the MLG1 model) are driven by an object on a COLLISION COURSE: the angular size of an approaching object of half-size L at speed v is theta(t) = 2 atan(L / (v |t|)), t < 0 before contact, which is the Gabbiani/Zhao looming used everywhere in this series. So the ellipse is made to LOOM with that law, with the
// cuttlefish's stripes painted on it (3 cycles down its height, dark 1/6 of a cycle, light at +wc and dark at -wc against a mid-grey background, the stripe pattern a function of (y - phase) so that it moves DOWN as phase grows, which brain/stealthMotion-selfcheck.mjs pins), either attached to the ellipse (they scale with it) or moving at `stripeHz` cycles per second.
// SAID PLAINLY: this is a stand-in for the hunting display, not a recording of one; the stripe motion is taken as 4 cycles/second at the ellipse's own scale (the cuttlefish tunes it to its approach speed, 2.2 +- 0.7 Hz in the wild and rising 0.5 Hz per 5.9 cm/s); the ellipse's aspect ratio is the treadmill's 74 : 53; a looming ellipse speeds up where the treadmill's expanded exponentially, which is the right law for a predator and not the paper's stimulus.
// Pure: no DOM, no clock, no Math.random, no file.
"use strict";

export const ASPECT = 74 / 53;   // the treadmill ellipse's final horizontal over vertical angular size

/** The planar-screen side in pixels of an object that subtends the horizontal angle theta = 2 atan(rv / |t|) on a screen of `w` pixels spanning `fovDeg`: w tan(theta/2) / tan(fov/2). */
export function sidePx(rv, t, w, fovDeg) { return w * (rv / -t) / Math.tan((fovDeg / 2) * Math.PI / 180); }

/**
 * A looming ellipse with optional stripes. Options: plain ("dark", the default of every round before Round 21, or "light": the colour of the ellipse WITHOUT stripes, a light ellipse at ib (1 + wc) as the striped stimuli's light stripes; Round 21 found that Santon's Methods give the contrast of the LIGHT stripe against the background and add the dark stripes at the opposite sign, so the plain gray ellipse is probably the light one), widths (an array of horizontal extents in pixels, one per frame, in place of the collision-course law: Round 9's exponential expansion; then rv is ignored, t runs from 0 and theta is the planar angle), rv (seconds, half-size to speed ratio), w x h (default 200 x 150), fovDeg (118), step (0.01 s), startPx and endPx (the HORIZONTAL extent in pixels at the first and last frame; defaults 6 and 105 as Zhao's square), wc (Weber contrast 1),
 * stripes "none" | "static" | "moving", stripeHz (4), cycles (3), darkFrac (1/6), cx and cy (the centre in pixels, default the frame's centre), aspect (ASPECT), receding (play backwards), ib (0.5).
 * Returns { frames, t (seconds to collision at each frame), theta (degrees, the horizontal angle), width (pixels, the ellipse's horizontal extent), height, step }. A frame is { w, h, data: Float32Array } of luminance 0..1.
 */
export function loomingEllipse({ rv, w = 200, h = 150, fovDeg = 118, step = 0.01, startPx = 6, endPx = 105, wc = 1, stripes = "none", stripeHz = 4, cycles = 3, darkFrac = 1 / 6, cx = null, cy = null, aspect = ASPECT, receding = false, ib = 0.5, widths = null, plain = "dark" } = {}) {
    if (plain !== "dark" && plain !== "light") throw new Error(`stealthLoomStimuli.loomingEllipse: plain is dark or light, got ${JSON.stringify(plain)}`);
    if (widths === null && !(rv > 0)) throw new Error(`stealthLoomStimuli.loomingEllipse: r/v is a positive number of seconds, got ${rv}`);
    if (!["none", "static", "moving"].includes(stripes)) throw new Error(`stealthLoomStimuli.loomingEllipse: stripes is none, static or moving, got ${JSON.stringify(stripes)}`);
    if (!(wc >= 0 && wc <= 1) || !(endPx > startPx) || !(startPx > 0) || !(step > 0) || !(fovDeg > 0 && fovDeg < 180)) throw new Error("stealthLoomStimuli.loomingEllipse: 0 <= wc <= 1, 0 < startPx < endPx, step > 0, 0 < fovDeg < 180");
    const tanHalf = Math.tan((fovDeg / 2) * Math.PI / 180), X = cx === null ? (w - 1) / 2 : cx, Y = cy === null ? (h - 1) / 2 : cy;
    const tStart = widths ? 0 : -rv * w / (startPx * tanHalf), tEnd = widths ? (widths.length - 1) * step : -rv * w / (endPx * tanHalf);
    if (widths && (!Array.isArray(widths) || !widths.length || widths.some((v) => !(v > 0)))) throw new Error("stealthLoomStimuli.loomingEllipse: widths is a non-empty array of positive pixel extents");
    const dark = ib * (1 - wc), light = Math.min(1, ib * (1 + wc)), frames = [], tt = [], th = [], wd = [], ht = [];
    for (let k = 0, t = tStart; t <= tEnd + 1e-12; k++, t = tStart + k * step) {
        const width = widths ? widths[k] : sidePx(rv, t, w, fovDeg), height = width / aspect, aH = width / 2, aV = height / 2, f = { w, h, data: new Float32Array(w * h) }, phase = stripes === "moving" ? stripeHz * (t - tStart) : 0;
        f.data.fill(ib);
        const edge = 0.5 / Math.min(aH, aV), x0 = Math.max(0, Math.floor(X - aH - 1)), x1 = Math.min(w - 1, Math.ceil(X + aH + 1)), y0 = Math.max(0, Math.floor(Y - aV - 1)), y1 = Math.min(h - 1, Math.ceil(Y + aV + 1));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const nx = (x - X) / aH, ny = (y - Y) / aV, rr = Math.sqrt(nx * nx + ny * ny), cover = Math.min(1, Math.max(0, (1 - rr) / edge + 0.5));
            if (cover <= 0) continue;
            let inside = plain === "light" ? light : dark;
            if (stripes !== "none") { const u = (((y - Y) / aV / 2 + 0.5) * cycles - phase) % 1, frac = u < 0 ? u + 1 : u; inside = frac < darkFrac ? dark : light; }
            f.data[y * w + x] = ib * (1 - cover) + inside * cover;
        }
        frames.push(f); tt.push(t); th.push(widths ? 2 * Math.atan(width / w * tanHalf) * 180 / Math.PI : 2 * Math.atan(rv / -t) * 180 / Math.PI); wd.push(width); ht.push(height);
    }
    if (receding) { frames.reverse(); tt.reverse(); th.reverse(); wd.reverse(); ht.reverse(); }
    return { frames, t: tt, theta: th, width: wd, height: ht, step };
}

/** The luminance statistics of a frame sequence the detectors care about: { meanDelta (the mean absolute change between consecutive frames), maxDelta }, for a gate and a note. */
export function frameChange(frames) {
    let s = 0, n = 0, mx = 0;
    for (let k = 1; k < frames.length; k++) { const a = frames[k - 1].data, b = frames[k].data; for (let i = 0; i < a.length; i++) { const d = Math.abs(b[i] - a[i]); s += d; n++; if (d > mx) mx = d; } }
    return { meanDelta: n ? s / n : 0, maxDelta: mx };
}
