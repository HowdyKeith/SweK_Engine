// FILE: render/chuckCloseModel.mjs -- v4188
//
// THE CHUCK CLOSE GRID: an image rebuilt as a lattice of painterly cells, each cell one mark whose colour is
// the AVERAGE of the region it covers. Close worked on a ruled grid and painted each square as a small
// concentric shape; from across the room the squares disappear into a face.
//
// Derived from the description of the effect, not ported: kamend/ChuckClose-SparkAR is a Spark AR project
// file with no licence shown, so it is REACHED and not CAPTURED -- read for what the effect IS, with nothing
// copied. The technique is decades older than any repository.
//
// *** THE ONE THING A NAIVE VERSION GETS WRONG: AVERAGE THE CELL, DO NOT POINT-SAMPLE IT. *** Taking the
// colour at the cell's centre is one line shorter and gives you a mosaic of NOISE -- every cell inherits
// whatever single pixel it landed on, including sensor grain and specular sparkle, so the portrait crawls
// and shimmers as the subject breathes. Averaging is what makes the grid read as a face. It is also what
// makes the effect cheap to be wrong about, because both versions LOOK like a grid of squares in a still.
"use strict";

export const DEFAULTS = Object.freeze({
    grid: 48,           // cells across
    mark: "lozenge",    // the shape painted inside each cell
    jitter: 0.0,        // per-cell rotation/offset, deterministic -- see cellSeed
    contrast: 1.15,     // Close's marks are more saturated than the average they encode
    gap: 0.06,          // fraction of the cell left unpainted, so the lattice stays visible
});

export const MARKS = Object.freeze(["square", "lozenge", "disc", "concentric"]);

/** Which cell a UV falls in, and where inside that cell it sits (both in [0,1)). */
export function cellOf(u, v, grid) {
    const g = Math.max(1, Math.floor(grid));
    const cx = Math.min(g - 1, Math.max(0, Math.floor(u * g)));
    const cy = Math.min(g - 1, Math.max(0, Math.floor(v * g)));
    return { cx, cy, fx: u * g - cx, fy: v * g - cy, g };
}

/**
 * The mean colour of one cell of an RGBA byte image.
 *
 * Every pixel of the cell, not a sample of them: a cell of a 1280-wide frame at grid 48 is ~27 pixels across,
 * so this is ~700 pixels averaged, and that average is the entire reason the result reads as a portrait
 * rather than as noise on a grid.
 */
export function cellAverage(pixels, w, h, cx, cy, grid) {
    const g = Math.max(1, Math.floor(grid));
    const x0 = Math.floor(cx * w / g), x1 = Math.max(x0 + 1, Math.floor((cx + 1) * w / g));
    const y0 = Math.floor(cy * h / g), y1 = Math.max(y0 + 1, Math.floor((cy + 1) * h / g));
    let r = 0, gg = 0, b = 0, n = 0;
    for (let y = y0; y < Math.min(h, y1); y++) {
        for (let x = x0; x < Math.min(w, x1); x++) {
            const i = (y * w + x) * 4;
            r += pixels[i]; gg += pixels[i + 1]; b += pixels[i + 2]; n++;
        }
    }
    if (!n) return [0, 0, 0];
    return [r / n / 255, gg / n / 255, b / n / 255];
}

/** A deterministic per-cell value, so a cell's mark is the same every frame and the lattice does not boil. */
export function cellSeed(cx, cy) {
    let h = (cx * 374761393 + cy * 668265263) | 0;
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * How much of the mark covers this point in the cell. 0 outside, 1 inside, soft at the boundary.
 * `fx, fy` are the position within the cell in [0,1).
 */
export function markCoverage(fx, fy, kind = DEFAULTS.mark, opts = {}) {
    const o = Object.assign({}, DEFAULTS, opts);
    const gap = Math.max(0, Math.min(0.45, o.gap));
    // centre the cell on 0 and scale so the gap is unpainted border
    const x = (fx - 0.5) / (0.5 - gap), y = (fy - 0.5) / (0.5 - gap);
    const ax = Math.abs(x), ay = Math.abs(y);
    switch (kind) {
        case "square":     return ax <= 1 && ay <= 1 ? 1 : 0;
        case "lozenge":    return (ax + ay) <= 1 ? 1 : 0;                    // a diamond -- Close's usual mark
        case "disc":       return Math.hypot(x, y) <= 1 ? 1 : 0;
        case "concentric": {                                                  // ring inside a disc
            const r = Math.hypot(x, y);
            if (r > 1) return 0;
            return r > 0.55 && r < 0.85 ? 0.45 : 1;
        }
        default:           return ax <= 1 && ay <= 1 ? 1 : 0;
    }
}

/** Push a colour away from mid grey, which is how Close's marks carry more colour than the average they encode. */
export function punch(rgb, contrast) {
    const k = Number.isFinite(contrast) ? contrast : 1;
    return rgb.map((c) => Math.max(0, Math.min(1, 0.5 + (c - 0.5) * k)));
}

/**
 * Render a whole RGBA image to a grid of cells. Returns { grid, cells } where cells[cy][cx] is the punched
 * average -- the gate reads this rather than a canvas.
 */
export function closeGrid(pixels, w, h, opts = {}) {
    const o = Object.assign({}, DEFAULTS, opts);
    const g = Math.max(1, Math.floor(o.grid));
    const cells = [];
    for (let cy = 0; cy < g; cy++) {
        const row = [];
        for (let cx = 0; cx < g; cx++) row.push(punch(cellAverage(pixels, w, h, cx, cy, g), o.contrast));
        cells.push(row);
    }
    return { grid: g, cells };
}
