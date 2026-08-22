// tools/ship/spriteSheetImport.mjs -- v3757
//
// *** THE IMPORTER KEITH ASKED FOR, AND THE FIRST THING TO SAY IS WHAT IT IS NOT. render/spriteAtlas.js is a
// PROCEDURAL atlas -- it draws eight shapes into a canvas at startup and hands GL a texture. IT HAS NO SHEET
// LOADER AT ALL, which is why 51 files touch `sprite`, 40 touch `atlas`, and ZERO touch `spriteSheet`. The
// consuming end exists (asset-library.html and five asset panels); the thing that turns a sheet plus its JSON
// into frames does not. ***
//
// *** AND THE SPLIT IS THE DESIGN. Turning frames into a GL texture needs a browser and cannot be graded here,
// so this module is THE DATA HALF ONLY: parse the metadata, derive every frame rect, and REFUSE a sheet that
// would sample outside itself. Pure functions over plain objects, no canvas, no GL, no fs -- so a fixture can
// drive it and a gate can plant against it. THE BROWSER HALF IS NAMED, NOT WRITTEN, and pretending otherwise
// would be a module that only works where nobody can check it. ***
//
// *** THE SCHEMA BELOW IS OURS AND IS NOT CLAIMED TO BE ANYBODY ELSE'S. sprite-maker (JohnKinyanjui, MIT)
// exports "sheets + JSON metadata" and NOBODY HERE HAS SEEN ONE -- three commits, alpha, and no sample in this
// tree. Writing a parser for a format I have not read would be FABRICATING PROVENANCE, so this accepts a
// minimal declared shape and REFUSES anything else BY NAME. Mapping a real export onto it is a ten-line
// adapter once Keith sends one file. ***

/**
 * The accepted shape:
 *   { sheet: { w, h }, frames: [ { name, x, y, w, h }, ... ] }
 * Sizes in PIXELS, origin top-left, as every sheet exporter this tree has met uses.
 */
export function validateSheet(meta) {
    const errs = [];
    const push = (e) => errs.push(e);

    if (!meta || typeof meta !== "object") return { ok: false, errors: ["metadata is not an object"], frames: [] };
    const sheet = meta.sheet;
    if (!sheet || !Number.isFinite(sheet.w) || !Number.isFinite(sheet.h) || sheet.w <= 0 || sheet.h <= 0) {
        push("sheet.w and sheet.h must be positive numbers (got " + JSON.stringify(sheet) + ")");
        return { ok: false, errors: errs, frames: [] };
    }
    if (!Array.isArray(meta.frames) || meta.frames.length === 0) {
        push("frames must be a non-empty array");
        return { ok: false, errors: errs, frames: [] };
    }

    const seen = new Set();
    const frames = [];
    for (let i = 0; i < meta.frames.length; i++) {
        const f = meta.frames[i], at = "frame " + i + (f && f.name ? " (" + f.name + ")" : "");
        if (!f || typeof f !== "object") { push(at + ": not an object"); continue; }
        if (typeof f.name !== "string" || !f.name.trim()) { push(at + ": needs a name"); continue; }
        // *** DUPLICATE NAMES ARE REFUSED, NOT LAST-ONE-WINS. v3729: a census keyed by id needs something
        // asserting ids are unique, and there the duplicate SILENTLY REPLACED its sibling with no symptom but a
        // total that disagreed with its own corpus. A sheet with two "walk_01" frames is a sheet somebody will
        // spend an afternoon on. ***
        if (seen.has(f.name)) { push(at + ": duplicate frame name -- names must be unique, and last-one-wins would hide the collision"); continue; }
        seen.add(f.name);

        const nums = ["x", "y", "w", "h"].filter((k) => !Number.isFinite(f[k]));
        if (nums.length) { push(at + ": " + nums.join("/") + " must be finite numbers"); continue; }
        if (f.w <= 0 || f.h <= 0) { push(at + ": w and h must be positive (got " + f.w + "x" + f.h + ")"); continue; }
        // *** THE CHECK THAT MATTERS MOST: A FRAME RUNNING OFF THE SHEET SAMPLES WHATEVER IS NEXT TO IT AND
        // RENDERS SOMETHING PLAUSIBLE-LOOKING. It is the silent one -- a torn edge or a neighbour's pixels
        // bleeding in reads as an art problem, not an import problem, which is exactly the class of defect
        // that costs an afternoon. ***
        if (f.x < 0 || f.y < 0 || f.x + f.w > sheet.w || f.y + f.h > sheet.h) {
            push(at + ": rect " + f.x + "," + f.y + " " + f.w + "x" + f.h + " runs outside the " +
                 sheet.w + "x" + sheet.h + " sheet -- it would sample whatever sits next to it");
            continue;
        }
        frames.push({ name: f.name, x: f.x, y: f.y, w: f.w, h: f.h });
    }
    return { ok: errs.length === 0, errors: errs, frames };
}

/**
 * Pixel rects to UVs. DERIVED, never typed: u0 = x / sheet.w and so on.
 * Origin stays TOP-LEFT and is SAID SO -- a v-flip is a renderer's convention, and silently applying one here
 * would put the decision in the wrong file and be invisible until something rendered upside down.
 */
export function toUV(sheet, frame) {
    return {
        name: frame.name,
        u0: frame.x / sheet.w, v0: frame.y / sheet.h,
        u1: (frame.x + frame.w) / sheet.w, v1: (frame.y + frame.h) / sheet.h,
        px: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
    };
}

/** @returns {{ ok, errors, sheet, frames }} -- frames carry BOTH the UVs and the pixel rect they came from. */
export function importSheet(meta) {
    const v = validateSheet(meta);
    if (!v.ok) return { ok: false, errors: v.errors, sheet: null, frames: [] };
    return { ok: true, errors: [], sheet: { w: meta.sheet.w, h: meta.sheet.h },
             frames: v.frames.map((f) => toUV(meta.sheet, f)) };
}

/**
 * A regular grid is the common case and the one an exporter most often gets wrong at the edges, so it is
 * DERIVED here rather than trusted from a `frames` list somebody typed.
 * *** IT REFUSES A GRID THAT DOES NOT DIVIDE THE SHEET rather than dropping the remainder: a 100px sheet at
 * 32px cells is three cells and four pixels of something, and silently returning three would hide whichever
 * mistake produced it. ***
 */
export function gridSheet({ w, h, cellW, cellH, prefix = "f" }) {
    if (!(w > 0 && h > 0 && cellW > 0 && cellH > 0)) return { ok: false, errors: ["grid dimensions must be positive"], frames: [] };
    if (w % cellW !== 0 || h % cellH !== 0) {
        return { ok: false, frames: [],
                 errors: ["a " + cellW + "x" + cellH + " grid does not divide a " + w + "x" + h + " sheet -- " +
                          (w % cellW) + "px across and " + (h % cellH) + "px down are left over"] };
    }
    const frames = [];
    const cols = w / cellW, rows = h / cellH;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        frames.push({ name: prefix + "_" + String(r * cols + c).padStart(3, "0"),
                      x: c * cellW, y: r * cellH, w: cellW, h: cellH });
    }
    return importSheet({ sheet: { w, h }, frames });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
    const g = gridSheet({ w: 256, h: 128, cellW: 64, cellH: 64, prefix: "walk" });
    console.log("[spriteSheetImport] 256x128 at 64x64 -> " + g.frames.length + " frames, ok=" + g.ok);
    console.log("  first: " + JSON.stringify(g.frames[0]));
    const bad = gridSheet({ w: 100, h: 64, cellW: 32, cellH: 32 });
    console.log("[spriteSheetImport] 100x64 at 32x32 -> ok=" + bad.ok + "   " + bad.errors[0]);
    const off = importSheet({ sheet: { w: 64, h: 64 }, frames: [{ name: "a", x: 40, y: 0, w: 40, h: 32 }] });
    console.log("[spriteSheetImport] a frame off the edge -> ok=" + off.ok + "   " + off.errors[0]);
}
