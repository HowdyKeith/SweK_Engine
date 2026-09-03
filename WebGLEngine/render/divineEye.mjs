"use strict";
/**
 * THE DIVINE EYE'S DETERMINISTIC SIGNALS, PORTED SO THIS TREE CAN MEASURE WHAT THEY CANNOT SEE.
 *
 * PROVENANCE, AND IT IS NOT DECORATION. Every constant, threshold and formula below is img2threejs's, from
 * https://github.com/img2threejs/img2threejs (Apache-2.0), forge/stage4_review/divine_eye.py and
 * diagnose_render.py, with the foreground mask from stage1_intake/extract_pbr_evidence.py -- read at the commit
 * this round was built against. It is a PORT, not an improvement: where their arithmetic is unusual (nearest-
 * neighbour mask resampling into a 224 grid, box-average luma into a 64 grid, a single-window SSIM over the whole
 * image rather than the usual 8x8 or gaussian windows) it is reproduced, because a port that "fixes" the thing it
 * is measuring measures something else. Their file states its own resolution ceiling in a comment -- "a feature a
 * few pixels wide in a 1920px reference is not scored badly, it is ABSENT before any comparison happens. No
 * threshold tuning recovers it." -- so this module is not here to discover that. It is here to put a NUMBER on it,
 * which is what an engine that compares 36,864 pixels at worst difference 0 can do and a 64x64 grid cannot.
 *
 * WHAT IS PORTED: the two HARD gates (silhouette IoU >= 0.85, scale delta <= 0.08) and two soft signals (global
 * SSIM on the luma grid, Sobel edge overlap). NOT ported, and named rather than left to be assumed: pHash,
 * bilateral symmetry, blowout parity, flat-region ratio, tonal parity, objectness, the CIEDE2000 hue-zone work,
 * the self-uncertainty routing and the VLM layer. A verdict from here is therefore NOT their verdict -- it is
 * their two hard gates, which their own contract says a soft signal can never rescue.
 */

// their constants, by name and value (divine_eye.py, diagnose_render.py)
export const MASK_GRID_SIZE = 224;
export const LUMA_SIZE = 64;
export const EDGE_SIZE = 96;
export const IOU_HARD_MIN = 0.85;
export const SCALE_HARD_MAX = 0.08;
export const EDGE_THRESH = 0.12;

const srgbLuma = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const colorDistance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const saturation = (rgb) => { const hi = Math.max(...rgb), lo = Math.min(...rgb); return hi <= 0 ? 0 : (hi - lo) / hi; };
/** their percentile: sort, index = round(fraction * (n - 1)) -- not an interpolating one. */
const percentile = (values, fraction, fallback = 0) => {
    if (!values.length) return fallback;
    const o = [...values].sort((x, y) => x - y);
    return o[Math.round(Math.min(1, Math.max(0, fraction)) * (o.length - 1))];
};
const medianColor = (samples) => samples.length
    ? [0, 1, 2].map((c) => Math.trunc(percentile(samples.map((s) => s[c]), 0.5)))
    : [255, 255, 255];

/** The background colour and its noise, from four corner patches of radius max(3, min(w,h)/40). */
export function sampleCornerBackground(width, height, px) {
    const radius = Math.max(3, Math.trunc(Math.min(width, height) / 40)), samples = [];
    for (const [x0, x1, y0, y1] of [[0, radius, 0, radius], [width - radius, width, 0, radius],
                                    [0, radius, height - radius, height], [width - radius, width, height - radius, height]])
        for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(width, x1); x++) {
            const i = (y * width + x) * 4; if (px[i + 3] > 16) samples.push([px[i], px[i + 1], px[i + 2]]);
        }
    const background = medianColor(samples);
    return { background, noise: percentile(samples.map((s) => colorDistance(s, background)), 0.75, 0) };
}

/** Their foreground mask: alpha when the image is mostly transparent, else distance-from-corner-background OR saturated-and-not-blown. */
export function buildForegroundMask(width, height, px) {
    const n = width * height, warnings = [];
    let transparent = 0; for (let i = 0; i < n; i++) if (px[i * 4 + 3] < 245) transparent++;
    const transparentFraction = transparent / Math.max(1, n);
    const { background, noise } = sampleCornerBackground(width, height, px);
    const threshold = Math.max(24, noise * 2.4);
    let mask = new Uint8Array(n);
    if (transparentFraction > 0.03) { for (let i = 0; i < n; i++) mask[i] = px[i * 4 + 3] > 24 ? 1 : 0; }
    else for (let i = 0; i < n; i++) {
        const rgb = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];
        mask[i] = (px[i * 4 + 3] > 16 && (colorDistance(rgb, background) > threshold || (saturation(rgb) > 0.16 && srgbLuma(...rgb) < 0.94))) ? 1 : 0;
    }
    let cov = 0; for (let i = 0; i < n; i++) cov += mask[i];
    let coverage = cov / Math.max(1, n);
    if (coverage < 0.035) { warnings.push("foreground mask is tiny; material extraction is likely unreliable");
        mask = new Uint8Array(n); cov = 0; for (let i = 0; i < n; i++) { mask[i] = px[i * 4 + 3] > 16 ? 1 : 0; cov += mask[i]; } coverage = cov / Math.max(1, n); }
    if (coverage > 0.9) warnings.push("image is not clearly isolated from background; using most pixels as material evidence");
    return { mask, coverage, background, noise, transparentFraction, warnings };
}

/** Keep the largest 4-connected blob; return it and the fraction of foreground cells discarded. */
export function largestComponent(mask, size) {
    const seen = new Uint8Array(mask.length); let best = [], total = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) total++;
    for (let start = 0; start < mask.length; start++) {
        if (!mask[start] || seen[start]) continue;
        const stack = [start], blob = []; seen[start] = 1;
        while (stack.length) { const idx = stack.pop(); blob.push(idx);
            const y = Math.trunc(idx / size), x = idx % size;
            for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]])
                if (nx >= 0 && nx < size && ny >= 0 && ny < size) { const j = ny * size + nx; if (mask[j] && !seen[j]) { seen[j] = 1; stack.push(j); } }
        }
        if (blob.length > best.length) best = blob;
    }
    const filtered = new Uint8Array(mask.length); for (const i of best) filtered[i] = 1;
    return { mask: filtered, discarded: total ? (total - best.length) / total : 0 };
}

/** The 224-grid mask their loader hands the IoU: NEAREST-NEIGHBOUR resampling, then the largest blob. */
export function maskGrid(px, width, height, size = MASK_GRID_SIZE) {
    const full = buildForegroundMask(width, height, px);
    const resized = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) { const sy = Math.min(height - 1, Math.trunc(y * height / size));
        for (let x = 0; x < size; x++) { const sx = Math.min(width - 1, Math.trunc(x * width / size)); resized[y * size + x] = full.mask[sy * width + sx]; } }
    const lc = largestComponent(resized, size);
    return { grid: lc.mask, discarded: lc.discarded, coverage: full.coverage, warnings: full.warnings };
}

export function silhouetteIou(a, b) {
    let inter = 0, union = 0;
    for (let i = 0; i < a.length; i++) { if (a[i] || b[i]) { union++; if (a[i] && b[i]) inter++; } }
    return union ? inter / union : 0;
}
export function bboxOf(mask, size = MASK_GRID_SIZE) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < mask.length; i++) if (mask[i]) { const x = i % size, y = Math.trunc(i / size);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < x0 ? [0, 0, 0, 0] : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}
/** Their proportion deltas, from the two bounding boxes: aspect ratio and AREA (not linear scale). */
export function proportionDelta(refBox, renBox) {
    const [, , rw, rh] = refBox, [, , dw, dh] = renBox;
    const refAr = rh ? rw / rh : 0, renAr = dh ? dw / dh : 0;
    const refArea = rw * rh, renArea = dw * dh;
    return { aspectRatioDelta: refAr ? Math.abs(refAr - renAr) / refAr : (renAr === 0 ? 0 : 1),
             scaleDelta: refArea ? Math.abs(refArea - renArea) / refArea : (renArea === 0 ? 0 : 1) };
}

/** Box-average downsample of Rec.709 luma to size x size, normalised 0..1. */
export function lumaGrid(px, width, height, size = LUMA_SIZE) {
    const acc = new Float64Array(size * size), cnt = new Uint32Array(size * size);
    for (let y = 0; y < height; y++) { const cy = Math.min(size - 1, Math.trunc(y * size / height));
        for (let x = 0; x < width; x++) { const i = (y * width + x) * 4;
            const cell = cy * size + Math.min(size - 1, Math.trunc(x * size / width));
            acc[cell] += srgbLuma(px[i], px[i + 1], px[i + 2]); cnt[cell]++; } }
    const out = new Float64Array(size * size);
    for (let i = 0; i < out.length; i++) out[i] = cnt[i] ? acc[i] / cnt[i] : 0;
    return out;
}
const mean = (xs) => { let s = 0; for (const v of xs) s += v; return xs.length ? s / xs.length : 0; };
/** Single-window SSIM over the whole downsampled luma image, with their c1 and c2. */
export function globalSsim(a, b) {
    const n = a.length; if (!n || b.length !== n) return 0;
    const ma = mean(a), mb = mean(b);
    let va = 0, vb = 0, cov = 0;
    for (let i = 0; i < n; i++) { va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; cov += (a[i] - ma) * (b[i] - mb); }
    va /= n; vb /= n; cov /= n;
    const c1 = 0.01 ** 2, c2 = 0.03 ** 2;
    const s = ((2 * ma * mb + c1) * (2 * cov + c2)) / ((ma * ma + mb * mb + c1) * (va + vb + c2));
    return Math.max(0, Math.min(1, s));
}
export function sobelEdges(luma, size, thresh = EDGE_THRESH) {
    const e = new Uint8Array(size * size), g = (x, y) => luma[y * size + x];
    for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
        const gx = (g(x - 1, y - 1) + 2 * g(x - 1, y) + g(x - 1, y + 1)) - (g(x + 1, y - 1) + 2 * g(x + 1, y) + g(x + 1, y + 1));
        const gy = (g(x - 1, y - 1) + 2 * g(x, y - 1) + g(x + 1, y - 1)) - (g(x - 1, y + 1) + 2 * g(x, y + 1) + g(x + 1, y + 1));
        if (Math.hypot(gx, gy) > thresh) e[y * size + x] = 1;
    }
    return e;
}
export function edgeOverlap(a, b, size) {
    const ea = sobelEdges(a, size), eb = sobelEdges(b, size);
    let inter = 0, union = 0;
    for (let i = 0; i < ea.length; i++) { if (ea[i] || eb[i]) { union++; if (ea[i] && eb[i]) inter++; } }
    return union ? inter / union : 1;
}

/**
 * The two HARD gates and the two soft signals this module ports, for a reference picture and a render of the same
 * size. `hardFailures` is the list their contract says no soft signal may rescue.
 */
export function compare(refPx, renPx, width, height) {
    const rm = maskGrid(refPx, width, height), dm = maskGrid(renPx, width, height);
    const iou = silhouetteIou(rm.grid, dm.grid);
    const prop = proportionDelta(bboxOf(rm.grid), bboxOf(dm.grid));
    const la = lumaGrid(refPx, width, height), lb = lumaGrid(renPx, width, height);
    const ea = lumaGrid(refPx, width, height, EDGE_SIZE), eb = lumaGrid(renPx, width, height, EDGE_SIZE);
    const hardFailures = [];
    if (iou < IOU_HARD_MIN) hardFailures.push(`silhouette IoU ${iou.toFixed(3)} < ${IOU_HARD_MIN}`);
    if (prop.scaleDelta > SCALE_HARD_MAX) hardFailures.push(`scale delta ${prop.scaleDelta.toFixed(3)} exceeds threshold ${SCALE_HARD_MAX}`);
    return { iou, ...prop, ssim: globalSsim(la, lb), edgeOverlap: edgeOverlap(ea, eb, EDGE_SIZE),
             hardFailures, passesHardGates: hardFailures.length === 0,
             refCoverage: rm.coverage, renCoverage: dm.coverage, refDiscarded: rm.discarded, renDiscarded: dm.discarded };
}

/** The exact comparison this tree makes, beside it: differing pixels and the worst channel difference. */
export function exactDifference(a, b) {
    let differing = 0, worst = 0, sum = 0;
    for (let i = 0; i * 4 < a.length; i++) { let d = 0;
        for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a[i * 4 + c] - b[i * 4 + c]));
        if (d) { differing++; sum += d; } if (d > worst) worst = d; }
    return { differing, worst, meanOverDiffering: differing ? sum / differing : 0, total: a.length / 4 };
}
