// WebGLEngine/ui/oceanReadings.mjs -- v4892
//
// *** SLICE 5 OF ocean-optin-surface: WHAT THE VENDORED SEA COSTS, FROM THE RIG'S OWN HUD LINES, AND NOTHING ELSE. ***
//
// READINGS_AT_V4892 below holds the nine HUD lines Keith's rig printed from ocean-spike.html's "Note reading" button on an Intel UHD 620 -- five at the
// frame's native size, two at 1280x720, two at 960x540 -- exactly as the sea printed them, plus the three numbers the opt-in page's own probe read. Everything
// this file says about them is COMPUTED from those lines (parseHud is the same parser the page uses), never typed beside them: the medians, the spread,
// the pixel-cost line, the share of the budget.
//
// WHAT THE NINE LINES SHOW, AND WHAT THEY DO NOT.
//   1. The HUD's frame time reads 100.00 ms in all nine because the sea clamps its step at 0.1 s (dt = min(0.1, ...)): a frame slower than 100 ms is shown AS 100 ms.
//      The frame clock therefore CANNOT say how slow a slow frame is; the GPU clock can. ui/oceanSea.mjs takes the slower of the two for exactly this reason, and
//      cappedFrame() below says which readings the cap hid.
//   2. Cost follows pixels, not just the FFT: 518,400 pixels read about 148 ms, 814,929 about 220 ms. That REVERSES the spike's first guess ("resolution is not the
//      main cost at 0.8 megapixels, the FFT and sky are the fixed price"). fitLine() is a least-squares line through the medians; its intercept is the part that does
//      not shrink with pixels.
//   3. Three points and two parameters is a near-saturated fit, the nodes count differs between the native and the sized readings (1,186 against 906: a different
//      level of detail), and the intercept is an extrapolation to zero pixels from a range of 518k-922k. So the line is reported WITH its residuals and the sentence
//      "if this model holds" -- not as a law.
//
// NOT HERE: a discrete GPU. The row is owed; add its lines to the record and everything below recomputes. No reading here is from a GPU that holds the budget.
//
// PURE: the record is the only input.

import { parseHud, probeMsFromHud } from "./oceanSea.mjs";
import { BUDGET_MS } from "./oceanTier.mjs";

export const READINGS_AT_V4892 = Object.freeze({
    at: "v4892",
    takenOn: "2026-10-21",
    box: "Keith's rig, Chrome on localhost:8787, ocean-spike.html (resolution selector and the Note reading button)",
    adapter: "intel gen-9 0x3ea0 Intel(R) UHD Graphics 620",
    adapterKind: "integrated",
    lines: Object.freeze([
        "native | 10 fps  100.00 ms  |  GPU 221.96 ms  |  1186 nodes  1653x493",
        "native | 10 fps  100.00 ms  |  GPU 219.66 ms  |  1186 nodes  1653x493",
        "native | 10 fps  100.00 ms  |  GPU 224.52 ms  |  1186 nodes  1653x493",
        "native | 10 fps  100.00 ms  |  GPU 205.96 ms  |  1186 nodes  1653x493",
        "native | 10 fps  100.00 ms  |  GPU 205.96 ms  |  1186 nodes  1653x493",
        "1280x720 | 10 fps  100.00 ms  |  GPU 219.96 ms  |  906 nodes  1280x720",
        "1280x720 | 10 fps  100.00 ms  |  GPU 214.22 ms  |  906 nodes  1280x720",
        "960x540 | 10 fps  100.00 ms  |  GPU 147.26 ms  |  906 nodes  960x540",
        "960x540 | 10 fps  100.00 ms  |  GPU 148.45 ms  |  906 nodes  960x540",
    ]),
    // the opt-in page's own probe on the same adapter (ocean-sea.html): the frame's size was not noted for these, so they are kept apart from the table and never fitted
    pageProbesMs: Object.freeze({ auto: 238.1, on: Object.freeze([262.2, 155.2, 98.3]) }),
    pageProbesNote: "taken at whatever size the page's frame happened to be (the frame was resized between them); the sea's HUD readings above are the sized ones",
});

const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

/** One stored line -> { resolution, hud, gpuMs, frameMs, width, height, pixels, nodes }. Throws on a line the page's own parser rejects: a record must not hold a line it cannot read. */
export function parseLine(line) {
    const bar = String(line).indexOf(" | ");
    if (bar < 0) throw new Error("reading has no resolution label: " + line);
    const resolution = line.slice(0, bar).trim();
    const hud = parseHud(line.slice(bar + 3));
    if (!hud || hud.gpuMs == null || hud.width == null) throw new Error("reading is not a full HUD line (needs a GPU time and a size): " + line);
    const nodes = +(/(\d+)\s*nodes/.exec(line) || [])[1];
    return { resolution, hud, gpuMs: hud.gpuMs, frameMs: hud.frameMs, width: hud.width, height: hud.height, pixels: hud.width * hud.height, nodes };
}

/** The record's lines grouped by the label they were taken under, in the order first seen. */
export function groups(record = READINGS_AT_V4892) {
    const by = new Map();
    for (const l of record.lines) {
        const r = parseLine(l);
        if (!by.has(r.resolution)) by.set(r.resolution, []);
        by.get(r.resolution).push(r);
    }
    return [...by.entries()].map(([resolution, rs]) => {
        const g = rs.map((r) => r.gpuMs);
        const first = rs[0];
        const med = median(g), lo = Math.min(...g), hi = Math.max(...g);
        return {
            resolution, n: rs.length, width: first.width, height: first.height, pixels: first.pixels, nodes: first.nodes,
            sameSize: rs.every((r) => r.width === first.width && r.height === first.height),
            gpuMin: lo, gpuMedian: med, gpuMax: hi, spread: (hi - lo) / med,
            budgetMultiple: med / BUDGET_MS, fps: 1000 / Math.max(med, ...rs.map((r) => r.frameMs)),
            frameMs: first.frameMs,
        };
    });
}

/** Which readings had their frame time hidden by the 100 ms step clamp: the frame clock read exactly its clamp while the GPU clock read more. */
export function cappedFrame(record = READINGS_AT_V4892) {
    return record.lines.map(parseLine).filter((r) => r.frameMs === 100 && r.gpuMs > 100);
}

/** Least-squares GPU ms = a + b * pixels through the group medians. Residuals are relative to the measured median. */
export function fitLine(gs) {
    const xs = gs.map((g) => g.pixels), ys = gs.map((g) => g.gpuMedian), n = xs.length;
    if (n < 2) return null;
    const mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
    const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    if (!(sxx > 0)) return null;
    const b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx, a = my - b * mx;
    const residuals = gs.map((g) => ({ resolution: g.resolution, predicted: a + b * g.pixels, measured: g.gpuMedian, relative: (a + b * g.pixels - g.gpuMedian) / g.gpuMedian }));
    return { a, b, points: n, residuals, worst: Math.max(...residuals.map((r) => Math.abs(r.relative))),
        measuredRange: [Math.min(...xs), Math.max(...xs)] };
}

/** How many pixels the fitted line allows inside the budget: null when even zero pixels is over it (the intercept alone is the answer). */
export function pixelsAtBudget(fit, budgetMs = BUDGET_MS) {
    if (!fit || !(fit.b > 0)) return null;
    return fit.a >= budgetMs ? null : (budgetMs - fit.a) / fit.b;
}

/** The sentences the page prints, all derived. */
export function reportLines(record = READINGS_AT_V4892) {
    const gs = groups(record), fit = fitLine(gs), cap = cappedFrame(record);
    const out = [record.adapter + " (" + record.adapterKind + "), " + record.lines.length + " HUD lines from " + record.takenOn];
    for (const g of gs) out.push("  " + g.resolution.padEnd(9) + g.width + "x" + g.height + "  " + g.n + " readings  GPU " + g.gpuMedian.toFixed(1) + " ms (" + g.gpuMin.toFixed(1) + "-" + g.gpuMax.toFixed(1) + ")  x" + g.budgetMultiple.toFixed(1) + " the " + BUDGET_MS.toFixed(1) + " ms budget  " + g.fps.toFixed(1) + " fps");
    if (fit) {
        out.push("  pixel-cost line through the medians: GPU ms = " + fit.a.toFixed(1) + " + " + (fit.b * 1000).toFixed(3) + " per thousand pixels, worst residual " + (fit.worst * 100).toFixed(1) + "% over " + fit.points + " points");
        const px = pixelsAtBudget(fit);
        out.push(px == null ? "  if this model holds, no resolution passes: the line's fixed part (" + fit.a.toFixed(1) + " ms) alone is over the budget" : "  if this model holds, the budget is reached near " + Math.round(px) + " pixels");
        out.push("  that is an extrapolation to zero pixels from " + fit.measuredRange[0] + "-" + fit.measuredRange[1] + " pixels on three points; it is not a law");
    }
    out.push("  the HUD's frame time is its 100 ms step clamp in " + cap.length + " of " + record.lines.length + " lines: the GPU clock is the real one");
    const holds = gs.filter((g) => g.gpuMedian <= BUDGET_MS);
    out.push(holds.length ? "  inside the budget: " + holds.map((g) => g.resolution + " (" + g.gpuMedian.toFixed(1) + " ms)").join(", ")
        : "  none of these readings holds the budget" + (record.adapterKind === "discrete" ? "" : "; no discrete GPU has been read yet"));
    return out;
}

/** The slower clock of one stored line -- what the page's probe would have used. */
export const probeMsOfLine = (line) => probeMsFromHud(parseLine(line).hud);
