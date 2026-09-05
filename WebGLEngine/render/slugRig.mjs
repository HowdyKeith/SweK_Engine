// WebGLEngine/render/slugRig.mjs -- v4490
//
// *** THE SLUG COST MEASURED, NOT PRESUMED: the plan for slug-rig.html, the atlas's own band statistics, and the grader for
// what a rig signs. *** The reviewed plan (docs/TSL-ROADMAP.md step 7) estimated fragments from distance and proposed raising
// band counts when a frame passed 1.5 ms -- a number nobody had measured. slug-rig.html draws a WALL of glyphs per face, at
// five sizes and three squashes (an anisotropic scale standing in for the grazing angle at which fwidth grows and the band
// loops run longest per pixel), times each frame on the GPU where gfx/device.js was granted timestamp-query and by
// performance.now() around the frame otherwise (labelled as such), and reports beside every timing the atlas's own
// statistics: how many curves each band's loop walks. tools/ship/slugRig-selfcheck.mjs holds this module headless, loads
// the page here, and grades tools/ship/slug-rig.json when a rig has signed one.
//
// WHY THE SQUASH AND NOT A ROTATION: the shipped vertex stage is a 2-D affine (four rows read as x, y, -, w), so there is no
// perspective to graze. What a grazing view does to the fragment is shrink one axis's pixels per em -- fwidth(texcoord)
// grows, the band index clamps, and every pixel of a column walks its band -- and a squash of the y rows does exactly that.
"use strict";
import { FONTS, fontPath } from "../text/fontRegistry.mjs";

export const RIG_SIZES = Object.freeze([10, 14, 20, 32, 64]);              // px, after the device pixel ratio
export const RIG_SQUASHES = Object.freeze([1, 0.5, 0.25]);                  // cos of the grazing angle: y pixels per em, as a fraction
export const RIG_FACES = Object.freeze(["IBM Plex Serif", "Source Sans 3", "Cinzel", "JetBrains Mono", "Sawarabi Gothic"]);
export const RIG_TEXT = "Sphinx of black quartz judge my vow 0123456789 ";
export const RIG_TEXT_CJK = "漢字と仮名の密度でバンドを歩く ";   // dense kanji, kana and katakana
export const FRAMES_PER_CONFIG = 12;

/** The configurations the page runs, in order: every face at every size and squash. */
export function rigPlan() {
    const out = [];
    for (const face of RIG_FACES) { const f = FONTS.find((x) => x.family === face); if (!f) continue;
        for (const size of RIG_SIZES) for (const squash of RIG_SQUASHES) out.push({ face, url: "/" + fontPath(f), size, squash, text: face === "Sawarabi Gothic" ? RIG_TEXT_CJK : RIG_TEXT }); }
    return out;
}

/**
 * The atlas's own band statistics, from what packAtlas wrote: for each glyph, the count field of every band header (H + V
 * of them), which IS the number of curves the fragment's loop walks for a pixel in that band. Returns { glyphs, bands,
 * meanCurvesPerBand, maxCurvesPerBand, meanBandsPerGlyph, curves, maxGlyphCurves, overCount }, where overCount is the number
 * of bands whose count exceeds their glyph's curve count -- zero when the count field was read. `atlas` is a packAtlas result.
 */
export function atlasStats(atlas) {
    const W = atlas.width, bd = atlas.bandData;
    let bands = 0, curveSum = 0, maxPer = 0, glyphs = 0, curves = 0, maxGlyphCurves = 0, overCount = 0;
    for (const e of atlas.glyphs.values()) {
        if (e.empty) continue;
        glyphs++; curves += e.curveCount; if (e.curveCount > maxGlyphCurves) maxGlyphCurves = e.curveCount;
        const H = e.bandMax[1] + 1, V = e.bandMax[0] + 1, base = e.loc[1] * W + e.loc[0];
        // a band lists a subset of its glyph's curves, so its count can never exceed the glyph's own: `overCount` says when a
        // header field other than the count was read (the offset field passed every ratio hold at v4490 -- 76 a band, 291 at most)
        for (let i = 0; i < H + V; i++) { const n = bd[(base + i) * 2]; bands++; curveSum += n; if (n > maxPer) maxPer = n; if (n > e.curveCount) overCount++; }
    }
    return { glyphs, bands, curves, meanCurvesPerBand: bands ? curveSum / bands : 0, maxCurvesPerBand: maxPer, meanBandsPerGlyph: glyphs ? bands / glyphs : 0, maxGlyphCurves, overCount };
}

/** Pixels the wall covers: the sum of every glyph quad's area at the size and squash, from the layout's glyph list and the atlas bboxes. */
export function wallPixels(laid, entryFor, squash) {
    let px = 0;
    for (const g of laid.glyphs) { const e = entryFor(g.glyphIndex); if (!e || e.empty) continue; const b = e.bbox; px += (b.x1 - b.x0 + 1 / g.size) * g.size * (b.y1 - b.y0 + 1 / g.size) * g.size * squash; }
    return px;
}

/**
 * Grade a rig's JSON: { page, at, ua, when, backend, timestamps, faces: { name: { stats } }, rows: [{ face, size, squash, frames,
 * glyphs, pixels, msMedian, msMin, source: "gpu" | "cpu", nsPerPixel }] }. Refuses a record that lies -- a row with a time
 * below zero or not finite, a source that is neither, a face with no stats, fewer than the plan's rows (a quick run's
 * two sizes per face when the record says `quick`) -- and reports the worst row, the CJK penalty, whether any row
 * crossed the plan's 1.5 ms, and `quick`, so a quick run can never be taken for the rig's signature.
 */
export function gradeRig(j) {
    const problems = [];
    if (!j || j.page !== "slug-rig.html") problems.push("not a slug-rig record");
    const rows = Array.isArray(j && j.rows) ? j.rows : [];
    // a quick run (?quick=1) is two sizes at squash 1 per face; it grades, but it is NOT the plan, and `quick` says so
    const quick = !!(j && j.quick === true), minRows = quick ? RIG_FACES.length * 2 : RIG_SIZES.length * RIG_SQUASHES.length;
    if (rows.length < minRows) problems.push(`only ${rows.length} rows`);
    for (const r of rows) {
        if (!(Number.isFinite(r.msMedian) && r.msMedian >= 0 && Number.isFinite(r.msMin) && r.msMin >= 0)) { problems.push(`${r.face} ${r.size}/${r.squash}: time not finite or negative`); break; }
        if (r.source !== "gpu" && r.source !== "cpu") { problems.push(`${r.face}: source ${r.source}`); break; }
        if (!(r.pixels > 0 && r.glyphs > 0)) { problems.push(`${r.face} ${r.size}/${r.squash}: no pixels or glyphs`); break; }
        if (!(j.faces && j.faces[r.face] && Number.isFinite(j.faces[r.face].meanCurvesPerBand))) { problems.push(`${r.face}: no atlas stats`); break; }
    }
    if (j && j.timestamps === true && rows.some((r) => r.source !== "gpu")) problems.push("timestamps granted but a row timed by cpu");
    const worst = rows.reduce((m, r) => (!m || r.msMedian > m.msMedian ? r : m), null);
    const latin = rows.filter((r) => r.face !== "Sawarabi Gothic"), cjk = rows.filter((r) => r.face === "Sawarabi Gothic");
    const mean = (a) => a.length ? a.reduce((s, r) => s + r.nsPerPixel, 0) / a.length : null;
    return { ok: problems.length === 0, problems, worst, over1p5: rows.filter((r) => r.msMedian > 1.5).length, nsPerPixelLatin: mean(latin), nsPerPixelCjk: mean(cjk), backend: j && j.backend, timestamps: !!(j && j.timestamps), quick };
}
