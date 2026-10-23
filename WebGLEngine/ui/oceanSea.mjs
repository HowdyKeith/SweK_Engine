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
// *** v4895 -- A CORRECTION OF WHAT v4890 AND v4894 SAID HERE. *** They said the sea's wave parameters sit in a module-scope const no page can reach, so the sea
// "cannot be tuned" and the two seas "are NOT lined up". That was WRONG, and the bundle says so on line 2193: `for (const k of Object.keys(P)) if (qs.has(k)) P[k] =
// Number(qs.get(k))` -- every key of its parameter block is read from the URL, as upstream's README also says. v4890 looked for literal `qs.get('...')` calls and missed the loop.
// So seaUrl() now passes the sea's own tunables (SEA_TUNABLES, which the gate holds EQUAL to the key set of the bundle's `const P` block, read from the bundle's text), and
// matchedTunables() computes the settings that line the sea's SWELL up with slice 1's longest wave: the swell height and swell length.
//
// WHAT "LINED UP" CAN AND CANNOT MEAN, STATED CORRECTLY. The URL sets the sea's INPUTS. What the sea then draws is a JONSWAP wind sea plus a swell, integrated in its shader, and its
// realized height is not declared anywhere -- the bundle's own water-height readback is a local inside its module and is not exposed. So matching swellHs/swellLength makes the
// swell's declared height and wavelength equal slice 1's longest wave's; it does NOT make the drawn sea equal the physics sea. The wind sea (its height computed from wind speed and
// fetch), the headings (different conventions), choppy against steepness (different parameters) and the sky are left at the sea's defaults and listed as NOT matched. Measuring the
// realized height is a rig task and is said to be.
//
// ALSO CORRECTED: v4890's "wave height" row set the physics sea's TOTAL significant height (all six waves, 2.79 m) against the sea's declared SWELL-only 1.8 m and called it x1.55.
// Those are different quantities, and its own note said so. The rows now compare swell with the longest wave, and the total is "not comparable" until the realized height is measured.
//
// PURE: the bundle text, the HUD text, the clock and the storage all arrive as arguments.

export const SEA_PATH = "/vendor/web-ocean/ocean.html";
/** The view and size keys the bundle reads by name: cam/fov/t move the view and the clock; w/h size the drawing buffer; ui hides its panel. */
export const SEA_VIEW_PARAMS = Object.freeze(["w", "h", "ui", "t", "cam", "fov"]);
/** The sea's own tunables: every key of its `const P` block, which the bundle applies from the URL generically (line 2193). Held EQUAL to the bundle's block by ui/oceanSea-selfcheck. */
export const SEA_TUNABLES = Object.freeze(["windSpeed", "windDir", "fetchKm", "swellHs", "swellDir", "swellLength", "swellSpread", "choppy", "turbidity", "foam", "sunElev", "sunAzim", "exposure", "haze", "clouds", "veil", "bloom"]);
/** Everything seaUrl may pass. */
export const SEA_PARAMS = Object.freeze([...SEA_VIEW_PARAMS, ...SEA_TUNABLES]);
export const PROBE_SETTLE_MS = 3000;     // the sea builds its pipelines and FFT tables first; its first HUD lines are not frames
export const PROBE_SAMPLE_MS = 500;      // the sea refreshes its HUD every 0.5 s
export const PROBE_SAMPLES = 10;         // five seconds of readings after the settle
export const PROBE_DROP = 2;             // the first two readings after the settle are dropped as warmup
export const PROBE_KEY = "swek.ocean.probe";
/** a remembered reading older than this is taken again: drivers and thermals change */
export const PROBE_TTL_MS = 7 * 24 * 3600 * 1000;
/** rows whose two sides differ by more than this fraction are reported as NOT matching */
export const MATCH_TOLERANCE = 0.25;

/** The URL that loads the sea, with only parameters the bundle reads. Unknown keys are dropped, not passed on; a tunable must be a finite number (the bundle does Number(...) on it). */
export function seaUrl(opts = {}) {
    const q = [];
    for (const k of SEA_PARAMS) {
        const v = opts[k];
        if (v === undefined || v === null || v === "") continue;
        if (SEA_TUNABLES.includes(k) && !Number.isFinite(Number(v))) continue;
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
    const longest = comps.reduce((m, c) => (c.wavelength > m.wavelength ? c : m), comps[0]);
    return { hs: 4 * Math.sqrt(sigma2), longest: longest.wavelength, longestAmp: longest.A, longestHs: 4 * longest.A / Math.SQRT2,
        shortest: Math.min(...comps.map((c) => c.wavelength)), waves: comps.length, steepness: surface.steepness };
}

/**
 * The URL settings that line the sea's SWELL up with slice 1's longest wave: its significant height (4 A / sqrt 2 for one sinusoid) and its wavelength. Everything else is left at the sea's
 * defaults and named in `unmatched` with the reason, so the page never claims more than two inputs were set.
 */
export function matchedTunables(stats) {
    return Object.freeze({
        tunables: Object.freeze({ swellHs: +stats.longestHs.toFixed(2), swellLength: +stats.longest.toFixed(0) }),
        unmatched: Object.freeze([
            ["windSpeed", "the wind sea's height is computed in the sea's shader from wind speed and fetch; no height is declared to match"],
            ["windDir, swellDir", "different heading conventions; converting would be a guess about the sea's camera"],
            ["choppy", "an FFT displacement scale, not slice 1's steepness sum"],
            ["sky, sun, foam, exposure", "not part of the surface"],
        ]),
    });
}

/**
 * The comparison, row by row, LIKE WITH LIKE. `applied` is what the page set on the sea's URL (a subset of SEA_TUNABLES); the sea's effective value for a row is the applied one if
 * there is one and its declared default otherwise, and the row says which. A row with two numbers gets a ratio and a verdict against MATCH_TOLERANCE; a row whose two sides are not the
 * same quantity says "not comparable" and why, and is never given a verdict.
 * @returns {Array<{ quantity: string, physics: string, sea: string, ratio: number|null, verdict: "matches"|"differs"|"not comparable", why: string, setBy: "default"|"url" }>}
 */
export function matchRows(stats, declared, applied = {}) {
    const rows = [];
    const d = declared || {};
    const near = (a, b) => Math.abs(a - b) <= MATCH_TOLERANCE * Math.max(a, b);
    const eff = (k) => (applied[k] != null && Number.isFinite(Number(applied[k])) ? { v: Number(applied[k]), by: "url" } : d[k] ? { v: d[k].value, by: "default" } : null);
    const sh = eff("swellHs"), sl = eff("swellLength");
    if (sh) rows.push({ quantity: "swell height", physics: stats.longestHs.toFixed(2) + " m significant (the longest wave alone)", sea: sh.v + " m significant, swell (" + sh.by + ")", ratio: stats.longestHs / sh.v,
        verdict: near(stats.longestHs, sh.v) ? "matches" : "differs", why: "the sea's swell is its longest-wave component; the physics sea's counterpart is its longest wave", setBy: sh.by });
    if (sl) rows.push({ quantity: "swell wavelength", physics: stats.longest.toFixed(0) + " m (the longest wave)", sea: sl.v + " m (swell peak, " + sl.by + ")", ratio: stats.longest / sl.v,
        verdict: near(stats.longest, sl.v) ? "matches" : "differs", why: "a boat's pitch and the drawn swell are set by this length", setBy: sl.by });
    rows.push({ quantity: "total height", physics: stats.hs.toFixed(2) + " m significant (all " + stats.waves + " waves)", sea: "not declared: the wind sea (from wind speed " + (d.windSpeed ? d.windSpeed.value + " m/s" : "?") + " and fetch) is computed in its shader",
        ratio: null, verdict: "not comparable", why: "v4890 set this against the swell-only figure and printed a ratio; the sea's realized height has to be MEASURED, and its own readback is inside its module", setBy: "default" });
    rows.push({ quantity: "heading", physics: "radians from +x, per component", sea: (d.windDir ? d.windDir.value : "?") + " deg wind, " + (d.swellDir ? d.swellDir.value : "?") + " deg swell (90 = towards +z)", ratio: null, verdict: "not comparable",
        why: "different conventions; converting would be a guess about the sea's camera", setBy: "default" });
    rows.push({ quantity: "sharpness", physics: "steepness sum " + stats.steepness.toFixed(2) + " (Gerstner, must stay under 0.95)", sea: "choppy " + (d.choppy ? d.choppy.value : "?") + " (FFT displacement scale)", ratio: null, verdict: "not comparable",
        why: "two different parameters that share a word", setBy: "default" });
    rows.push({ quantity: "method", physics: stats.waves + " summed trochoidal waves, f64, a function of (x, z, t, seed)", sea: "6 FFT cascades at 256 squared on the GPU, read back late", ratio: null, verdict: "not comparable",
        why: "the reason physics reads the CPU surface and nothing else", setBy: "default" });
    return rows;
}

/** What the page prints under the frame. `match` is matchedTunables(stats) when the matched settings are applied, else null. */
export function reportLines(rows = null, match = null) {
    const out = ["the GPU sea against the physics surface (computed from the bundle's own declared defaults and slice 1's six waves; the sea's settings: " + (match ? "MATCHED" : "its defaults") + "):"];
    for (const r of rows || [])
        out.push("  " + r.quantity.padEnd(18) + r.verdict.padEnd(15) + "physics " + r.physics + "  |  sea " + r.sea + (r.ratio != null ? "  (x" + r.ratio.toFixed(2) + ")" : ""));
    if (match) {
        out.push("applied to the sea's URL: " + Object.entries(match.tunables).map(([k, v]) => k + "=" + v).join(", ") + " -- two inputs, nothing else.");
        out.push("NOT matched: " + match.unmatched.map(([k]) => k).join("; ") + ". Matching inputs does not make the drawn sea equal the physics sea; the sea's realized height has not been measured.");
    } else out.push("the sea is running its own defaults; choose 'matched' to set its swell height and length from slice 1's longest wave (two inputs; the rows above say what that does and does not change).");
    return out;
}
