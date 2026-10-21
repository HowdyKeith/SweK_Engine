// WebGLEngine/ui/oceanLiveTune.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// *** STEP 1 OF ocean-src-integration: TUNE THE VENDORED SEA WHILE IT RUNS, WITH NO PATCH. ***
// The sea's parameter block P is read from the URL once, at load (ui/oceanSea.mjs's seaUrl). Its panel, though, is built from a SLIDERS table, and every slider's
// 'input' listener sets P[key] AND raises the right flag (needSpectrum for the wave spectrum, needLUT for haze) -- upstream's own live path. A page that holds the sea in a
// SAME-ORIGIN frame can therefore set a slider's value and dispatch an 'input' event on it: the sea retunes without reloading and without one byte of upstream edited.
// liveTune() does that and reads each slider back, so it reports what the sea has, not what was asked.
//
// WHAT IT CANNOT REACH, STATED: swellSpread is in P and settable from the URL but has NO slider, so it can be set only by a reload (planTune lists it under urlOnly). A slider
// clamps to its min/max and SNAPS to its step (the matched swell height 1.99 becomes 2, step 0.05): the plan predicts both and the readback confirms (clamped, snapped). And the panel is built AFTER the sea's WebGPU device is up, so before that point there are no rows
// (missing) and a caller falls back to the URL. NOT GRADED here: a real GPU recomputing the spectrum -- the gate runs upstream's own panel code in a stand-in page.
//
// PURE where it can be: planTune takes numbers; liveTune takes a document and an Event constructor.
"use strict";

/** The sea's SLIDERS table as upstream spells it: [key, label, min, max, step, kind]. kind 'spec' = needSpectrum, 'lut' = needLUT, '' = neither. */
export const SEA_SLIDERS = Object.freeze([
    ["windSpeed", "Wind speed (m/s)", 2, 20, 0.1, "spec"],
    ["windDir", "Wind direction (deg)", 0, 360, 1, "spec"],
    ["fetchKm", "Fetch (km)", 5, 800, 1, "spec"],
    ["swellHs", "Swell height (m)", 0, 4, 0.05, "spec"],
    ["swellLength", "Swell wavelength (m)", 30, 300, 1, "spec"],
    ["swellDir", "Swell direction (deg)", 0, 360, 1, "spec"],
    ["choppy", "Choppiness", 0, 1.6, 0.01, "spec"],
    ["turbidity", "Water turbidity", 0.2, 3, 0.01, ""],
    ["foam", "Foam", 0, 3, 0.01, ""],
    ["sunElev", "Sun elevation (deg)", -2, 60, 0.1, ""],
    ["sunAzim", "Sun azimuth (deg)", -180, 180, 0.5, ""],
    ["haze", "Haze", 0.5, 15, 0.1, "lut"],
    ["clouds", "Low clouds", 0, 1, 0.01, ""],
    ["veil", "Cloud deck", 0, 1, 0.01, ""],
    ["exposure", "Exposure", 0.1, 4, 0.01, ""],
    ["bloom", "Bloom", 0, 0.3, 0.001, ""],
].map((r) => Object.freeze(r)));

const bySlider = new Map(SEA_SLIDERS.map((r) => [r[0], r]));

/** The SLIDERS table read from a source text (the bundle or js/main.js), or null. Rows are [key, label, min, max, step, kind]. */
export function slidersFromSource(text) {
    const src = String(text || "");
    const i = src.indexOf("const SLIDERS = [");
    if (i < 0) return null;
    const j = src.indexOf("];", i);
    if (j < 0) return null;
    const rows = [], re = /\[\s*'(\w+)'\s*,\s*'([^']*)'\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*([\d.]+)\s*,\s*'(\w*)'\s*\]/g;
    let m;
    while ((m = re.exec(src.slice(i, j + 2)))) rows.push([m[1], m[2], +m[3], +m[4], +m[5], m[6]]);
    return rows.length ? rows : null;
}

/** What a set of parameters would do through the panel: per slider the clamped value; keys with no slider are urlOnly; non-numbers and unknown keys are unknown. */
export function planTune(params) {
    const steps = [], urlOnly = [], unknown = [];
    for (const [key, want] of Object.entries(params || {})) {
        const row = bySlider.get(key);
        if (!Number.isFinite(want)) { unknown.push(key); continue; }
        if (!row) { (key === "swellSpread" ? urlOnly : unknown).push(key); continue; }
        const [, label, min, max, step, kind] = row, c = Math.min(max, Math.max(min, want));
        // a range input also snaps to its step, counted from min (swellHs 1.99 -> 2, step 0.05); the decimals of the step keep the float tidy
        const dec = (String(step).split(".")[1] || "").length, value = Math.min(max, +(min + Math.round((c - min) / step) * step).toFixed(dec));
        steps.push({ key, label, want, value, clamped: want < min || want > max, snapped: value !== c, kind });
    }
    return { steps, urlOnly, unknown };
}

/**
 * Set the sea's sliders through its own panel. `doc` is the frame's document; `EventCtor` defaults to the document's window's Event. Returns the plan with, for each step,
 * `got` (the slider's value read back after the event), and the lists missing (no panel row for it yet) and applied. Dispatches one bubbling 'input' event per slider.
 */
export function liveTune(doc, params, EventCtor) {
    const plan = planTune(params), Ev = EventCtor || (doc && doc.defaultView && doc.defaultView.Event);
    const rows = doc && doc.querySelectorAll ? Array.from(doc.querySelectorAll("#panel label")) : [];
    const missing = [], applied = [];
    for (const st of plan.steps) {
        const row = rows.find((r) => { const s = r.querySelector("span"); return s && s.textContent === st.label; });
        const inp = row && row.querySelector("input");
        if (!inp || !Ev) { missing.push(st.key); continue; }
        inp.value = String(st.value);
        inp.dispatchEvent(new Ev("input", { bubbles: true }));
        st.got = Number(inp.value);
        applied.push(st.key);
    }
    return { ...plan, missing, applied };
}

/** The report: one line per slider (asked, applied, what the slider did to it), then what the panel cannot reach. */
export function reportLines(result = liveTune(null, {})) {
    const L = ["[oceanLiveTune] " + result.applied.length + " of " + result.steps.length + " sliders set through the sea's own panel events; " + result.missing.length + " had no panel row yet"];
    for (const s of result.steps) L.push("  " + s.key.padEnd(12) + " asked " + String(s.want).padStart(7) + (s.got === undefined ? "  not applied" : "  slider reads " + String(s.got).padStart(7) + (s.clamped ? "  (clamped to " + s.value + ")" : s.snapped ? "  (snapped to the slider's step)" : "")) + "   " + (s.kind === "spec" ? "raises needSpectrum" : s.kind === "lut" ? "raises needLUT" : "no flag"));
    if (result.urlOnly.length) L.push("  URL only (no slider): " + result.urlOnly.join(", "));
    if (result.unknown.length) L.push("  not a sea parameter: " + result.unknown.join(", "));
    return L;
}
