// tools/render-qa/checks.mjs — the pure, testable heart of the render-QA harness.
//
// Every check operates on a decoded image: { data: Uint8Array (RGBA), width, height }. No browser, no I/O,
// no dependencies — so this file is unit-testable in any Node (which is how it's validated in the sandbox,
// where a real browser can't run). The harness (render-qa.mjs) screenshots a page, decodes the PNG into this
// shape, and runs the checks named in the manifest. This is the LAAS "enforced visual invariants" idea
// (e.g. "the render isn't a black screen", "shadows aren't pure black", "the expected color is on screen"),
// generalized so a page can't silently ship a blank or broken render.

// ---- primitives ----
export function pixelAt(img, x, y) {
  const i = (Math.floor(y) * img.width + Math.floor(x)) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}
export function luminance(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

// Whole-image stats in one pass (used by several checks + the report).
export function stats(img) {
  const d = img.data, n = img.width * img.height;
  let nonBlack = 0, sumLum = 0, minLum = 255, maxLum = 0;
  const colorKeys = new Set();
  const step = Math.max(1, Math.floor(n / 40000)); // sample up to ~40k px for uniqueness/cost
  let sampled = 0;
  for (let p = 0; p < n; p += step) {
    const i = p * 4;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = luminance(r, g, b);
    if (lum > 8) nonBlack++;
    sumLum += lum; if (lum < minLum) minLum = lum; if (lum > maxLum) maxLum = lum;
    // quantize to 5 bits/channel for a cheap unique-color estimate
    colorKeys.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
    sampled++;
  }
  return {
    sampled,
    nonBlackFrac: sampled ? nonBlack / sampled : 0,
    meanLum: sampled ? sumLum / sampled : 0,
    minLum, maxLum,
    uniqueColors: colorKeys.size,
  };
}

// ---- checks: each returns { ok, msg } ----

// The render isn't a black/near-black screen (the #1 "it didn't render" failure).
export function notAllBlack(img, { minNonBlackFrac = 0.02 } = {}) {
  const s = stats(img);
  const ok = s.nonBlackFrac >= minNonBlackFrac;
  return { ok, msg: `nonBlackFrac=${s.nonBlackFrac.toFixed(4)} (need >= ${minNonBlackFrac})` };
}

// The render isn't a single flat color (catches solid error screens / cleared-but-never-drawn canvases).
export function notUniform(img, { minUniqueColors = 8 } = {}) {
  const s = stats(img);
  const ok = s.uniqueColors >= minUniqueColors;
  return { ok, msg: `uniqueColors~=${s.uniqueColors} (need >= ${minUniqueColors})` };
}

// The render isn't blown out to white or crushed to black (both mean something is wrong).
export function luminanceInRange(img, { min = 4, max = 250 } = {}) {
  const s = stats(img);
  const ok = s.meanLum >= min && s.meanLum <= max;
  return { ok, msg: `meanLum=${s.meanLum.toFixed(1)} (want ${min}..${max})` };
}

// A given color appears somewhere (e.g. terrain green, sky blue) in at least minFrac of sampled pixels.
export function colorPresent(img, { rgb = [0, 0, 0], tol = 24, minFrac = 0.001 } = {}) {
  const d = img.data, n = img.width * img.height;
  const step = Math.max(1, Math.floor(n / 40000));
  let hit = 0, sampled = 0;
  for (let p = 0; p < n; p += step) {
    const i = p * 4;
    if (Math.abs(d[i] - rgb[0]) <= tol && Math.abs(d[i + 1] - rgb[1]) <= tol && Math.abs(d[i + 2] - rgb[2]) <= tol) hit++;
    sampled++;
  }
  const frac = sampled ? hit / sampled : 0;
  return { ok: frac >= minFrac, msg: `color [${rgb}] frac=${frac.toFixed(4)} (need >= ${minFrac})` };
}

// A rectangular region isn't pure black — the LAAS "shadows must not be fully black" invariant, generalized.
// x0,y0,x1,y1 are FRACTIONS (0..1) of width/height so the check is resolution-independent.
export function regionNotBlack(img, { x0 = 0, y0 = 0, x1 = 1, y1 = 1, minNonBlackFrac = 0.05, thresh = 6 } = {}) {
  const px0 = Math.floor(x0 * img.width), px1 = Math.ceil(x1 * img.width);
  const py0 = Math.floor(y0 * img.height), py1 = Math.ceil(y1 * img.height);
  let nonBlack = 0, total = 0;
  for (let y = py0; y < py1; y++) for (let x = px0; x < px1; x++) {
    const [r, g, b] = pixelAt(img, x, y);
    if (luminance(r, g, b) > thresh) nonBlack++;
    total++;
  }
  const frac = total ? nonBlack / total : 0;
  return { ok: frac >= minNonBlackFrac, msg: `region(${x0},${y0}-${x1},${y1}) nonBlackFrac=${frac.toFixed(4)} (need >= ${minNonBlackFrac})` };
}

// The exact pixel at a fractional coord is close to an expected color (spot-check a known landmark).
export function pixelNear(img, { x = 0.5, y = 0.5, rgb = [0, 0, 0], tol = 24 } = {}) {
  const [r, g, b] = pixelAt(img, x * img.width, y * img.height);
  const ok = Math.abs(r - rgb[0]) <= tol && Math.abs(g - rgb[1]) <= tol && Math.abs(b - rgb[2]) <= tol;
  return { ok, msg: `px(${x},${y})=[${r},${g},${b}] vs [${rgb}] tol=${tol}` };
}

// A region's fraction of pixels matching a target color must fall inside an ENVELOPE [minFrac, maxFrac]. Unlike the
// other checks this gates BOTH ends: too little of the color can mean something that should be there is missing (or,
// for a backend-diff panel, that two backends are suspiciously identical -> one may be frozen), and too much can mean
// a regression (excessive divergence, or a render blown out). Used to gate the box3d-vs-Jolt diff panel.
export function regionFracInRange(img, { x0 = 0, y0 = 0, x1 = 1, y1 = 1, rgb = [255, 60, 90], tol = 40, minFrac = 0, maxFrac = 1 } = {}) {
  const px0 = Math.floor(x0 * img.width), px1 = Math.ceil(x1 * img.width);
  const py0 = Math.floor(y0 * img.height), py1 = Math.ceil(y1 * img.height);
  let hit = 0, total = 0;
  for (let y = py0; y < py1; y++) for (let x = px0; x < px1; x++) {
    const [r, g, b] = pixelAt(img, x, y);
    if (Math.abs(r - rgb[0]) <= tol && Math.abs(g - rgb[1]) <= tol && Math.abs(b - rgb[2]) <= tol) hit++;
    total++;
  }
  const frac = total ? hit / total : 0;
  const ok = frac >= minFrac && frac <= maxFrac;
  return { ok, msg: `region(${x0},${y0}-${x1},${y1}) color[${rgb}] frac=${frac.toFixed(4)} (envelope ${minFrac}..${maxFrac})` };
}

// Registry so the manifest can name checks as strings.
export const CHECKS = { notAllBlack, notUniform, luminanceInRange, colorPresent, regionNotBlack, pixelNear, regionFracInRange , terminatorBow, edgeBiasProfile};

// Run one manifest check descriptor against an image. Descriptor: { type, ...opts }.
/**
 * v3180 -- MEASURE THE TERMINATOR, so a shading claim is decided by the QA run rather than by looking.
 *
 * v3179 put a FLAT DISC beside a SPHERE IMPOSTOR from one light, so the difference is visible. Keith asked the
 * better question: why is a human the one comparing them?
 *
 * *** THE CLAIM IS GEOMETRIC AND THEREFORE MEASURABLE. *** A flat disc lit by a constant has a light/dark
 * boundary that is a STRAIGHT LINE -- its x is the same on every row. A sphere impostor's terminator BOWS: x
 * varies with y, because the surface turns away. So walk the region row by row, find where each row crosses the
 * half-lit threshold, and report the SPREAD of those crossings.
 *
 * *** AND IT IS ASSERTED IN BOTH DIRECTIONS, WHICH IS THE POINT. *** The flat panel must measure NEARLY ZERO
 * bow and the sphere panel must measure a LOT. A check that only demanded "the sphere bows" would pass on a
 * page that drew two spheres, and one that only demanded they DIFFER would pass on two arbitrary pictures. THE
 * FAILING CASE HAS TO BE MEASURED FAILING.
 *
 * bow is reported in FRACTIONS OF THE REGION WIDTH, so it does not change when somebody resizes the canvas.
 */
export function terminatorBow(img, { x0 = 0, y0 = 0, x1 = 1, y1 = 1, minBow = null, maxBow = null } = {}) {
    const X0 = Math.round(x0 * img.width), X1 = Math.round(x1 * img.width);
    const Y0 = Math.round(y0 * img.height), Y1 = Math.round(y1 * img.height);
    const W = X1 - X0;
    if (W < 8 || Y1 - Y0 < 8) return { ok: false, why: "region too small to measure a boundary" };

    // The threshold is DERIVED from the region's own range, never typed: a fixed luminance would decide
    // differently on a dark planet and a bright one, which is a property of the paint and not of the geometry.
    let lo = Infinity, hi = -Infinity;
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
        const p = pixelAt(img, x, y), L = luminance(p[0], p[1], p[2]);
        if (L < lo) lo = L; if (L > hi) hi = L;
    }
    if (hi - lo < 12) return { ok: false, why: "region has no light/dark range to find a boundary in (hi-lo " + (hi - lo).toFixed(1) + ")" };
    const mid = (lo + hi) / 2;

    // One crossing per row. A row with none (fully lit or fully dark) is SKIPPED rather than counted as zero --
    // counting it would drag the spread toward whatever the region's left edge happens to be.
    const xs = [];
    for (let y = Y0; y < Y1; y++) {
        let prev = null, cross = null;
        for (let x = X0; x < X1; x++) {
            const p = pixelAt(img, x, y), L = luminance(p[0], p[1], p[2]);
            if (prev !== null && ((prev < mid) !== (L < mid))) { cross = x; break; }
            prev = L;
        }
        if (cross !== null) xs.push((cross - X0) / W);
    }
    if (xs.length < 6) return { ok: false, why: "only " + xs.length + " rows contain a boundary -- nothing to measure" };

    const bow = Math.max(...xs) - Math.min(...xs);
    const pass = (minBow === null || bow >= minBow) && (maxBow === null || bow <= maxBow);
    return {
        ok: pass, bow, rows: xs.length, threshold: mid,
        why: pass ? null
            : (minBow !== null && bow < minBow
                ? "boundary is TOO STRAIGHT: bow " + bow.toFixed(4) + " < " + minBow + " -- a flat disc, not a sphere"
                : "boundary BOWS more than allowed: " + bow.toFixed(4) + " > " + maxBow + " -- not a flat disc"),
    };
}

/**
 * v3181 -- MEASURE THE 1/cos SIGNATURE, which the handoff says NO GATE CAN SEE.
 *
 * The standing suspicion about raymarch-live.html is that the compositing boxes are PARTLY BURIED, and buried
 * MORE AT THE SCREEN EDGES. That is a named diagnosis with a named shape: it is the classic ray-march error
 * where the step is taken along a direction that was not normalized per pixel -- or along z instead of the ray
 * length -- so the effective step scales as 1/cos(theta) with the angle from the view centre.
 *
 * *** THE SHAPE IS WHAT MAKES IT MEASURABLE, AND SYMMETRY IS WHAT MAKES IT A BUG RATHER THAN A SCENE. ***
 * A 1/cos artefact is SYMMETRIC about the centre column: both edges are affected equally, because cos is even.
 * A lopsided scene, a light from one side, or an object nearer one edge is NOT. So this reports both the edge
 * bias AND the asymmetry, and a caller can demand the first be small OR demand the second be small -- which are
 * different questions and this session has spent a lot of rounds on people who conflated two.
 *
 * WHAT IT MEASURES PER COLUMN: the topmost non-background row -- the silhouette. If geometry is being buried,
 * the silhouette sits LOWER, and if burial grows toward the edges the profile sags at both ends.
 */
export function edgeBiasProfile(img, {
    x0 = 0, y0 = 0, x1 = 1, y1 = 1, bg = null, tol = 26,
    maxEdgeBias = null, maxAsymmetry = null, columns = 48,
} = {}) {
    const X0 = Math.round(x0 * img.width), X1 = Math.round(x1 * img.width);
    const Y0 = Math.round(y0 * img.height), Y1 = Math.round(y1 * img.height);
    const W = X1 - X0, H = Y1 - Y0;
    if (W < 16 || H < 16) return { ok: false, why: "region too small to profile" };

    // BACKGROUND IS TAKEN FROM THE CORNER, not typed. A hard-coded colour would decide differently the moment
    // somebody changes the page's clear colour -- a property of the CSS and not of the geometry.
    const c = bg || pixelAt(img, X0, Y0);
    const isBg = (px) => Math.abs(px[0] - c[0]) <= tol && Math.abs(px[1] - c[1]) <= tol && Math.abs(px[2] - c[2]) <= tol;

    const step = Math.max(1, Math.floor(W / columns));
    const prof = [];       // { u in [-1,1], top in [0,1] }
    for (let x = X0; x < X1; x += step) {
        let top = null;
        for (let y = Y0; y < Y1; y++) if (!isBg(pixelAt(img, x, y))) { top = (y - Y0) / H; break; }
        // A COLUMN WITH NO GEOMETRY IS SKIPPED, NOT RECORDED AS top = 1. Recording it would read as "buried to
        // the floor" and manufacture exactly the sag this is looking for.
        if (top !== null) prof.push({ u: ((x - X0) / W) * 2 - 1, top });
    }
    if (prof.length < 12) return { ok: false, why: "only " + prof.length + " columns contain geometry -- nothing to profile" };

    const mid = prof.filter((p) => Math.abs(p.u) < 0.25).map((p) => p.top);
    const left = prof.filter((p) => p.u <= -0.6).map((p) => p.top);
    const right = prof.filter((p) => p.u >= 0.6).map((p) => p.top);
    if (!mid.length || !left.length || !right.length) return { ok: false, why: "geometry does not span the region -- no centre/edge comparison" };
    const avg = (a) => a.reduce((n, v) => n + v, 0) / a.length;
    const mC = avg(mid), mL = avg(left), mR = avg(right);

    // POSITIVE means the edges sit LOWER than the centre -- geometry buried more at the edges, the suspicion.
    const edgeBias = ((mL + mR) / 2) - mC;
    const asymmetry = Math.abs(mL - mR);
    const pass = (maxEdgeBias === null || Math.abs(edgeBias) <= maxEdgeBias)
              && (maxAsymmetry === null || asymmetry <= maxAsymmetry);
    return {
        ok: pass, edgeBias, asymmetry, columns: prof.length, centre: mC, left: mL, right: mR,
        why: pass ? null
            : (maxEdgeBias !== null && Math.abs(edgeBias) > maxEdgeBias
                ? "edges sit " + edgeBias.toFixed(4) + " " + (edgeBias > 0 ? "LOWER" : "higher") +
                  " than centre (limit " + maxEdgeBias + ") -- the 1/cos signature, if it is symmetric"
                : "left and right differ by " + asymmetry.toFixed(4) + " (limit " + maxAsymmetry +
                  ") -- ASYMMETRIC, so this is the scene or the lighting rather than a per-pixel step error"),
    };
}

export function runCheck(img, desc) {
  const fn = CHECKS[desc.type];
  if (!fn) return { ok: false, msg: `unknown check type "${desc.type}"` };
  try { return fn(img, desc); } catch (e) { return { ok: false, msg: `check threw: ${e.message}` }; }
}
