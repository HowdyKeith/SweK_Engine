// WebGLEngine/ui/oceanSea.mjs -- v4890
//
// *** SLICE 4 OF ocean-optin-surface: THE OPT-IN SEA, AND THE PROBE THAT MAKES "auto" MEAN SOMETHING. ***
//
// Slice 3 (ui/oceanTier.mjs) decides which water a GPU gets from a measured frame time and could not supply the measurement: only the sea can
// say what the sea costs. This is the other half. ocean-sea.html loads the vendored sea (vendor/web-ocean/ocean.html, byte-identical to upstream,
// pinned by tools/ship/oceanSpikePage-selfcheck.mjs) in a frame; the sea prints its own HUD line each half second --
//
//     "10 fps  100.00 ms  |  GPU 228.04 ms  |  3000 nodes  1653x493"
//
// -- and parseHud() reads that line, probeMsFromHud() turns it into the number chooseTier() wants (the worse of the frame time and the GPU time),
// and the page keeps the sea only if the median of a few readings is under the budget. The reading is remembered per adapter, so a reload does
// not time the sea again.
//
// WHAT "LINED UP WITH SLICE 1" CAN AND CANNOT MEAN. The sea's wave parameters (wind speed, swell height, swell length, ...) are a `const P` inside
// its module script. They are not reachable from outside, the URL takes only the camera, the clock and the size (seaUrl() names exactly those), and
// the bundle must stay byte-identical. So the sea cannot be tuned to the physics surface from here, and this file does not pretend to. What it does
// instead is COMPUTE the disagreement: matchRows() reads the sea's declared defaults out of the bundle's own text and sets them beside slice 1's
// statistics, row by row, with a verdict. A boat in the physics sea and the water drawn by the GPU sea are two seas of different roughness and
// different dominant wavelength, and the page says so in numbers.
//
// PURE: the bundle text, the HUD text, the clock and the storage all arrive as arguments.

export const SEA_PATH = "/vendor/web-ocean/ocean.html";
/** The only URL parameters the bundle reads that this page may set. cam/fov/t move the view and the clock; w/h size the drawing buffer; ui hides its panel. */
export const SEA_PARAMS = Object.freeze(["w", "h", "ui", "t", "cam", "fov"]);
export const PROBE_SETTLE_MS = 3000;     // the sea builds its pipelines and FFT tables first; its first HUD lines are not frames
export const PROBE_SAMPLE_MS = 500;      // the sea refreshes its HUD every 0.5 s
export const PROBE_SAMPLES = 10;         // five seconds of readings after the settle
export const PROBE_DROP = 2;             // the first two readings after the settle are dropped as warmup
export const PROBE_KEY = "swek.ocean.probe";
/** a remembered reading older than this is taken again: drivers and thermals change */
export const PROBE_TTL_MS = 7 * 24 * 3600 * 1000;
/** rows whose two sides differ by more than this fraction are reported as NOT matching */
export const MATCH_TOLERANCE = 0.25;

/** The URL that loads the sea, with only parameters the bundle reads. Unknown keys are dropped, not passed on. */
export function seaUrl(opts = {}) {
    const q = [];
    for (const k of SEA_PARAMS) {
        const v = opts[k];
        if (v === undefined || v === null || v === "") continue;
        q.push(k + "=" + encodeURIComponent(String(v)));
    }
    return SEA_PATH + (q.length ? "?" + q.join("&") : "");
}

/**
 * Read the sea's HUD line. Returns null for anything that is not one -- an empty HUD, the "starting" text, an error.
 * @returns {{ fps: number, frameMs: number, gpuMs: number|null, width: number|null, height: number|null }|null}
 */
export function parseHud(text) {
    const m = /(\d+(?:\.\d+)?)\s*fps\s+(\d+(?:\.\d+)?)\s*ms(?:\s*\|\s*GPU\s+(\d+(?:\.\d+)?)\s*ms)?(?:\s*\|\s*\d+\s*nodes\s+(\d+)x(\d+))?/i.exec(String(text || ""));
    if (!m) return null;
    const fps = +m[1], frameMs = +m[2];
    if (!(fps > 0) || !(frameMs > 0)) return null;      // "0 fps  Infinity ms" is the sea before its first frame
    return { fps, frameMs, gpuMs: m[3] != null ? +m[3] : null, width: m[4] != null ? +m[4] : null, height: m[5] != null ? +m[5] : null };
}

/** The number chooseTier wants from one reading: the sea cannot be faster than its slower clock. */
export function probeMsFromHud(hud) {
    if (!hud) return null;
    return hud.gpuMs != null && hud.gpuMs > hud.frameMs ? hud.gpuMs : hud.frameMs;
}

/** The median of a probe's readings (HUD texts), warmup dropped; null when there is nothing parseable left. */
export function medianProbe(hudTexts, drop = PROBE_DROP) {
    const ms = (hudTexts || []).map((t) => probeMsFromHud(parseHud(t))).filter((x) => x != null).slice(drop).sort((a, b) => a - b);
    if (!ms.length) return null;
    const m = ms.length >> 1;
    return ms.length % 2 ? ms[m] : (ms[m - 1] + ms[m]) / 2;
}

/** Remember a probe against the adapter it was taken on. Returns whether it stuck. */
export function rememberProbe(storage, label, ms, now = Date.now()) {
    if (!label || !(ms > 0)) return false;
    try { storage.setItem(PROBE_KEY, JSON.stringify({ label: String(label), ms: +ms, at: now })); return true; } catch { return false; }
}

/** A remembered probe for THIS adapter that is still fresh, or null. Never throws, never trusts what it reads. */
export function recallProbe(storage, label, now = Date.now()) {
    try {
        const raw = storage && storage.getItem(PROBE_KEY);
        const p = raw ? JSON.parse(raw) : null;
        if (!p || p.label !== label || !(p.ms > 0) || !Number.isFinite(p.at) || now - p.at > PROBE_TTL_MS || p.at > now + 60000) return null;
        return p.ms;
    } catch { return null; }
}

/** The tunables the bundle declares in `const P = { ... }`, read from its own text. Numbers only; the comment after each is kept as its unit note. */
export function declaredDefaults(bundleText) {
    const src = String(bundleText || "");
    const i = src.indexOf("const P = {");
    if (i < 0) return null;
    const j = src.indexOf("};", i);
    if (j < 0) return null;
    const out = {};
    for (const line of src.slice(i + 11, j).split("\n")) {
        const m = /^\s*([A-Za-z_]\w*)\s*:\s*(-?\d+(?:\.\d+)?)\s*,?\s*(?:\/\/\s*(.*))?$/.exec(line);
        if (m) out[m[1]] = { value: +m[2], note: (m[3] || "").trim() };
    }
    return Object.keys(out).length ? out : null;
}

/**
 * Slice 1's statistics: the significant height (4 sigma, sigma^2 = sum A^2 / 2 for a sum of independent sinusoids), the longest wavelength and the
 * steepness sum. Takes the surface object oceanSurface.createSurface returns.
 */
export function surfaceStats(surface) {
    const comps = surface.components || [];
    const sigma2 = comps.reduce((a, c) => a + c.A * c.A / 2, 0);
    return { hs: 4 * Math.sqrt(sigma2), longest: Math.max(...comps.map((c) => c.wavelength)), shortest: Math.min(...comps.map((c) => c.wavelength)), waves: comps.length, steepness: surface.steepness };
}

/**
 * The comparison, row by row. A row with two numbers gets a ratio and a verdict against MATCH_TOLERANCE; a row whose two sides are not the same
 * quantity (a Gerstner steepness sum and an FFT choppiness scale) says "not comparable" and why, and is never given a verdict.
 * @returns {Array<{ quantity: string, physics: string, sea: string, ratio: number|null, verdict: "matches"|"differs"|"not comparable", why: string }>}
 */
export function matchRows(stats, declared) {
    const rows = [];
    const d = declared || {};
    const near = (a, b) => Math.abs(a - b) <= MATCH_TOLERANCE * Math.max(a, b);
    if (d.swellHs) {
        const ratio = stats.hs / d.swellHs.value;
        rows.push({ quantity: "wave height", physics: stats.hs.toFixed(2) + " m significant (all six waves)", sea: d.swellHs.value + " m significant, swell only",
            ratio, verdict: near(stats.hs, d.swellHs.value) ? "matches" : "differs",
            why: "the sea's wind-sea height is computed inside its shader from wind speed " + (d.windSpeed ? d.windSpeed.value + " m/s" : "(undeclared)") + " and fetch, and is not declared; its total is at least the swell's" });
    }
    if (d.swellLength) {
        const ratio = stats.longest / d.swellLength.value;
        rows.push({ quantity: "longest wavelength", physics: stats.longest.toFixed(0) + " m", sea: d.swellLength.value + " m (swell peak)", ratio, verdict: near(stats.longest, d.swellLength.value) ? "matches" : "differs",
            why: "a boat's pitch and the drawn swell are set by this length" });
    }
    rows.push({ quantity: "heading", physics: "radians from +x, per component", sea: (d.windDir ? d.windDir.value : "?") + " deg wind, " + (d.swellDir ? d.swellDir.value : "?") + " deg swell (90 = towards +z)", ratio: null, verdict: "not comparable",
        why: "different conventions; converting would be a guess about the sea's camera" });
    rows.push({ quantity: "sharpness", physics: "steepness sum " + stats.steepness.toFixed(2) + " (Gerstner, must stay under 0.95)", sea: "choppy " + (d.choppy ? d.choppy.value : "?") + " (FFT displacement scale)", ratio: null, verdict: "not comparable",
        why: "two different parameters that share a word" });
    rows.push({ quantity: "method", physics: stats.waves + " summed trochoidal waves, f64, a function of (x, z, t, seed)", sea: "6 FFT cascades at 256 squared on the GPU, read back late", ratio: null, verdict: "not comparable",
        why: "the reason physics reads the CPU surface and nothing else" });
    return rows;
}

/** What the page prints under the frame. */
export function reportLines(rows = []) {
    const out = ["the GPU sea against the physics surface (computed from the bundle's own declared defaults and slice 1's six waves):"];
    for (const r of rows || [])
        out.push("  " + r.quantity.padEnd(19) + r.verdict.padEnd(15) + "physics " + r.physics + "  |  sea " + r.sea + (r.ratio != null ? "  (x" + r.ratio.toFixed(2) + ")" : ""));
    out.push("the sea's own parameters cannot be set from this page (they are inside its module), so the two seas are NOT lined up -- the rows above say by how much.");
    return out;
}
