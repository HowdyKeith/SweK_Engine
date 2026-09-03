// WebGLEngine/render/blobFire.mjs -- v4429
//
// *** THE BLOBULATOR PAINTS A TEMPERATURE IT NEVER COMPUTES. ***
//
// blobulator.html's paintFire colours every vertex with the shared blackbody ramp, so the page LOOKS like it
// has fire. The argument it passes is this, transcribed from lines 253-255:
//
//     const hgt = py / worldH;                                   // 0 at bed, 1 at top
//     let heat = 1.0 - hgt * 1.05;
//     heat += 0.10 * sin(px * 0.35 + t * 7.0) + 0.06 * sin(px * 0.9 - t * 11.0);
//
// *** THAT IS A POSITIONAL GRADIENT DRESSED AS A TEMPERATURE. *** It takes (px, py, t) and nothing else --
// there is no blob array in scope at that line -- so, measured:
//
//     blobs clustered on the point   heat(4, 10, 0.5) = 0.582477
//     blobs far away                 heat(4, 10, 0.5) = 0.582477
//     no blobs at all                heat(4, 10, 0.5) = 0.582477
//
// The colour does not depend on the thing being coloured. And it has NO MEMORY: the value at t is computed
// from t alone, so nothing cools, nothing carries, and two points at the same height are the same temperature
// whatever either of them did a moment ago. The ramp is real physics (v4412 graded it); WHAT IS HANDED TO IT
// IS NOT A TEMPERATURE, and #168's "paints heat and has no fire at all" is exactly that, with numbers.
//
// ---- *** THE ROUND CHOSE ITS RULE FROM v4423's MEASUREMENT AND DREW THE WRONG CONCLUSION FROM IT *** ------
//
// v4423 compared the tree's two spread rules on the axis that separates them -- does the fire consume what it
// burns? -- and recorded:
//
//     world/fireSystem.js   consumes its fuel: 40 of 40 cells to ASH, goes out by itself at t = 5.9 s
//     render/doomFire.mjs   consumes NOTHING: source row 288 at step 0 and 288 at step 1200, never goes out
//
// *** SO THIS FILE PICKED doomFire's RULE BECAUSE A BLOBULATOR'S BLOBS ARE THE SOURCE AND MUST NOT BE EATEN,
// AND THE FIRST THING IT MEASURED WAS THE BLOBS GOING OUT IN TEN FRAMES. ***
//
//     interior source, 218 cells lit at MAX      step 0: 218 at MAX, total 7848
//                                                step 3:  14 at MAX, total 7120
//                                                step 10:  0 at MAX, source heat 0
//                                                step 60:            TOTAL HEAT 0 -- the fire is out
//
// *** "doomFire CONSUMES NOTHING" IS NOT A PROPERTY OF THE RULE. IT IS A PROPERTY OF THE SOURCE BEING THE
// BOTTOM ROW. *** step() reads each cell from `b = i + w`, one row down, and skips the cell entirely when
// that index is off-grid:
//
//     bottom-row cell 2506   back -> 2570   on-grid: FALSE   -> never written, sits at MAX forever
//     interior  cell 1575    back -> 1639   on-grid: TRUE    -> overwritten by the cold cell below it
//
// v4423's number was right and the inference from it was wrong. The persistence came from a BOUNDARY, and
// moving the source into the interior removes the boundary and with it the property the rule was chosen for.
// A measurement transfers to a new configuration only as far as the mechanism behind it does, and the
// mechanism here was an out-of-range index. So the source must be MAINTAINED rather than merely lit, which
// FieldFire already provides (light() each frame) -- and with it the field settles, which is the shape
// v4423 attributed to the rule and which the rule does deliver once the source is held:
//
//     step   1  total  7812      step  60  total 19458      step  300  total 18336
//     step   5  total 10433      step 120  total 19359      step  600  total 19479
//     step  20  total 18054                                 step 1200  total 19605
//
// ---- *** AND A SECOND v4178 ARTIFACT THAT ONLY AN INTERIOR SOURCE CAN EXHIBIT: THE LEAN WRAPS *** ---------
//
// v4410's header pins two directional constants and says the write index is "UNCLAMPED and wraps across
// rows", kept deliberately, because v4178's fuel region is the whole rectangle and the wrap is invisible
// there. Give the fire an interior source and it is not invisible. The flow is strictly UP and the lean is
// strictly LEFT, so NO transport moves heat rightward -- therefore heat at any column right of the source's
// rightmost column is possible ONLY by `dst = i - decay` crossing a row boundary. That is an exact detector,
// not a proxy, and with a blob centred in a 64-wide grid (source columns 24..39) it reads:
//
//     gutter 0    50 cells / 317 heat right of the source, max column 63    THE PLUME TELEPORTS
//     gutter 1    47 cells / 315 heat right of the source, max column 63    STILL WRAPS
//     gutter 2     0 cells /   0 heat, max column 39                        CLEAN
//     gutter 3     0 cells /   0 heat, max column 39
//
// *** THE GUTTER WIDTH IS DERIVED AND A GUESS WOULD HAVE PICKED THE ONE THAT FAILS. *** decay is
// `Math.floor(rng() * 3)`, so decay is 0, 1 or 2, and `dst = i - decay` reaches TWO columns left; a
// one-column gutter leaves 47 wrapped cells. MAX_DECAY below is that ceiling, and the gate reads the
// expression out of doomFireField.mjs rather than trusting this sentence -- the v4427 lesson, that a
// transcription is a second declaration, applied to a number instead of a function.
//
// The gutter is expressed as a ZERO DIRECTION in the field, which is v4410's own documented way of saying
// "nothing burns here", so this costs no change to the ported rule and the v4410 byte-for-byte control
// against v4178 is untouched -- it runs on uniformField, which this file does not modify.
//
// ---- *** AND A THIRD CONSEQUENCE, WHICH IS THAT v4410 GENERALISED THE FLOW AND NOT THE LEAN *** -----------
//
// A compact source does not merely make the wrap visible, it makes the LEAN visible, and the lean is not
// small. Centroid column per row, blob centred at column 31.5, source rows 16..33, 200 steps:
//
//     row 33  col 31.0        row 16  col 22.1        row 0  col 6.9
//
// From the source's top to the top of the grid that is 15.2 columns over 16 rows: *** THE PLUME SHEARS ONE
// COLUMN LEFT PER ROW IT RISES, WHICH IS 45 DEGREES. *** And the figure is not a coincidence of this scene:
// decay is uniform over {0, 1, 2}, so E[decay] = 1, and the write lands `decay` columns left of the cell it
// feeds. The measured 0.95 is that expectation.
//
// *** IT CANNOT BE TURNED OFF THROUGH THE FIELD, AND THAT IS THE FINDING. *** v4410's header derives both
// constants from one direction, so the obvious repair is a direction whose lean is zero. Enumerated over all
// eight non-dead directions, |perp| is 1, 63, 64 or 65 -- NEVER 0 -- because perp(d) = dy + w*(-dx) vanishes
// only when d does, and a zero direction is a dead cell. v4410 made the FLOW a field and left the LEAN
// welded to it; a fire that rises straight is not expressible in the ported rule at any field.
//
// So the shear is reported rather than removed. On the blobulator it happens to read correctly -- the river
// carries its wax downstream in +x and the lean is -x, so the flames trail the blobs that are making them,
// which is what a moving flame does -- but that is this page being lucky about a direction, not the rule
// being right, and the next caller should know the fire has a handedness before it picks its axes.
//
// ---- WHAT THE PAGE ACTUALLY GETS, DRIVEN HEADLESSLY FOR 240 FRAMES ------------------------------------------
//
// At the default resolution (LX 54, LY 43, LZ 22, nine balls) the source is 183 to 253 cells as the wax flows
// through, the field reaches 1,210 lit cells against a 253-cell source -- so the fire is mostly PLUME rather
// than mostly blob -- and the total wanders (8,259 at frame 0, 29,837 at 120, 25,440 at 239) instead of
// converging, because the source is moving. That wander IS the memory: a still fire settles, a fire whose
// fuel is being carried downstream does not.
//
// *** AND 16.3% OF THE SURFACE READS BLACK, WHICH IS REPORTED RATHER THAN FLOORED. *** Sampling the 129
// places where the density crosses zero on the centre slice, 21 read below 0.02 and 59 sit in the top decile.
// Those 21 are UNDERSIDES: heat rises, so the bottom of a burning blob is cold, and the old gradient painted
// it warm because height was all it knew. A floor under the ramp would hide that, and hiding it would be
// putting the defect back in a smaller form.
//
// ---- WHAT CHANGES, STATED AS PROPERTIES RATHER THAN AS A LOOK -----------------------------------------------
//
//     before                                    after
//     heat = f(x, y, t), blobs absent           heat = the field, lit BY the blobs
//     no memory: recomputed from t each frame   a field stepped forward; this frame depends on the last
//     a blob moving changes nothing             a blob moving moves the fire
//     no steady state to speak of               settles: 19458 at step 60, 19605 at step 1200
//
// WHAT THIS DOES NOT CLAIM: that the fire is three-dimensional. It is a 2D field on the (x, y) plane and the
// blobs are 3D, so the source is the density at ONE z slice (rect.z, the channel centre by default) -- an
// off-centre blob contributes to that slice through metaballField's own dz^2 term, so its footprint fades
// correctly rather than being faked, but the COLOUR sampled from the slice is applied to vertices at every z.
// A blob directly behind another is coloured as though it were beside it. Said here rather than left to be
// discovered.
"use strict";

import { FieldFire, buildField, UP, MAX_INTENSITY } from "./doomFireField.mjs";
import { metaballField, META_EPS } from "./blobField.mjs";

/**
 * The largest value `decay` can take in FieldFire.step(), and therefore how far left one write can reach.
 *
 * *** TRANSCRIBED, SO THE GATE MUST COMPARE IT: *** doomFireField.mjs computes `Math.floor(this.rng() * 3)`,
 * whose ceiling is 2. decayCeiling() below parses that expression out of the original, and the gate holds the
 * two equal -- because v4427 shipped a round whose whole finding was that an unchecked transcription had
 * drifted, and this file is not going to be the next one.
 */
export const MAX_DECAY = 2;

/** Read the decay ceiling out of FieldFire's own source, so MAX_DECAY is checkable rather than asserted. */
export function decayCeiling(src) {
    const m = /decay\s*=\s*Math\.floor\(\s*this\.rng\(\)\s*\*\s*(\d+)\s*\)/.exec(src);
    return m ? Number(m[1]) - 1 : NaN;
}

/**
 * How far left the plume shears per row it rises, in columns.
 *
 * DERIVED, not fitted: decay is uniform over {0 .. MAX_DECAY} and the write lands that many columns left of
 * the cell being fed, so the expected shear is the mean of that draw. Measured on a centred blob: 0.95.
 */
export function leanPerRow(maxDecay = MAX_DECAY) { return maxDecay / 2; }

/**
 * |perp| for each of the eight non-dead directions, so "no field can make this fire rise straight" is a
 * computation rather than a claim in a comment. A zero here would mean a lean-free direction exists.
 */
export function leanMagnitudes(w, offsets) {
    const out = [];
    for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
        if (!dx && !dy) continue;
        out.push({ dx, dy, lean: Math.abs(offsets(dx, dy, w).perp) });
    }
    return out;
}

/** The grid the fire lives on, in cells. Independent of the blobulator's marching resolution on purpose. */
export const GRID = Object.freeze({ w: 64, h: 40 });

/**
 * The field a blob fire burns on: every cell flows up, and the leftmost MAX_DECAY columns are not fuel.
 *
 * The gutter is not decoration and not a margin chosen to look right -- it is exactly as wide as one write
 * can reach, so the left edge becomes an ordinary boundary instead of a wrap to the far right. See the
 * header for the three-point measurement that says 1 is too narrow.
 */
export function blobFireField(w, h, gutter = MAX_DECAY) {
    return buildField(w, h, (x) => (x < gutter ? [0, 0] : UP));
}

/** The rect a fire grid covers, in the CALLER's coordinates. y increases upward here and downward in the grid. */
export const DEFAULT_RECT = Object.freeze({ x0: -8, x1: 8, y0: 0, y1: 8, z: 0 });

/** Grid cell -> caller coordinates. Split out so the gate can check the mapping round-trips. */
export function cellToWorld(gx, gy, { w = GRID.w, h = GRID.h, rect = DEFAULT_RECT } = {}) {
    const x = rect.x0 + (w > 1 ? gx / (w - 1) : 0) * (rect.x1 - rect.x0);
    const y = rect.y1 - (h > 1 ? gy / (h - 1) : 0) * (rect.y1 - rect.y0);
    return [x, y, rect.z ?? 0];
}

/** Caller coordinates -> nearest grid cell, or null when the point is outside the rect. */
export function worldToCell(px, py, { w = GRID.w, h = GRID.h, rect = DEFAULT_RECT } = {}) {
    const u = (px - rect.x0) / (rect.x1 - rect.x0), v = (rect.y1 - py) / (rect.y1 - rect.y0);
    if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return null;
    return [Math.round(u * (w - 1)), Math.round(v * (h - 1))];
}

/**
 * Which cells the blobs cover, as FieldFire source indices.
 *
 * *** THE SOURCE IS THE BLOBS' OWN FIELD, NOT A BOUNDING BOX. *** metaballField is blobulator.html's actual
 * density (render/blobField.mjs, v4427), so a cell is a source exactly when the page would have drawn surface
 * there -- and a blob too small to have a surface at all (r < sqrt(0.35), v4427's VANISH_BELOW) lights
 * nothing, which is the correct answer rather than a special case.
 *
 * *** AND A MALFORMED BLOB IS A REFUSAL, NOT AN EMPTY SOURCE. *** The first draft of this round was probed
 * with blobs shaped {p: [x, y, z], r} instead of blobField's {x, y, z, r}. metaballField read b.x as
 * undefined, summed NaN, and `NaN < 0` is false -- so every cell declined to be a source and the harness
 * reported a fire of zero heat with no error anywhere. That is v4418's defect exactly (sceneFromSbt dropping
 * a field it did not know about and reporting a pixel difference instead), so it gets v4418's treatment.
 */
export function blobSource(blobs, { w = GRID.w, h = GRID.h, rect = DEFAULT_RECT } = {}) {
    for (const b of blobs) {
        for (const k of ["x", "y", "z", "r"]) {
            if (!Number.isFinite(b?.[k])) {
                throw new Error(`blobSource: blob is missing a finite ${k} -- expected {x, y, z, r}, got ` +
                                JSON.stringify(b));
            }
        }
    }
    const out = [];
    for (let gy = 0; gy < h; gy++) {
        for (let gx = 0; gx < w; gx++) {
            if (metaballField(cellToWorld(gx, gy, { w, h, rect }), blobs) < 0) out.push(gx + w * gy);
        }
    }
    return out;
}

/**
 * Heat right of the source's rightmost column -- which the rule cannot produce and only the wrap can.
 *
 * The flow is up and the lean is left, so nothing carries heat rightward. Any lit cell right of the source
 * therefore arrived by `dst = i - decay` crossing a row. Returns cells and total intensity so a gate can
 * assert BOTH the artifact's existence without a gutter and its absence with one.
 */
export function wrapReach(fire, source) {
    const w = fire.width, h = fire.height;
    let maxSrcCol = -1;
    for (const i of source) { const c = i % w; if (c > maxSrcCol) maxSrcCol = c; }
    let cells = 0, heat = 0, maxCol = -1;
    for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) {
        const v = fire.at(gx, gy);
        if (v <= 0) continue;
        if (gx > maxCol) maxCol = gx;
        if (gx > maxSrcCol) { cells++; heat += v; }
    }
    return { maxSrcCol, maxCol, cells, heat };
}

/**
 * A fire lit by blobs. Re-source it when they move; step it every frame.
 *
 * *** RE-SOURCING RATHER THAN REBUILDING IS THE WHOLE POINT: *** a new FieldFire each frame would have no
 * memory, which is the defect being fixed. The grid persists and only WHICH CELLS ARE LIT changes.
 *
 * `maintain` re-lights the source before every step. It defaults TRUE because without it an interior source
 * is overwritten from below and the blobs go out in ten frames -- the header's first measurement. It is a
 * parameter rather than a hard-coded call so the gate can measure both halves of that finding.
 */
export class BlobFire {
    constructor({ w = GRID.w, h = GRID.h, rect = DEFAULT_RECT, seed = 0x5EED, maintain = true,
                  gutter = MAX_DECAY } = {}) {
        this.w = w; this.h = h; this.rect = rect; this.maintain = maintain;
        this.source = [];
        this.fire = new FieldFire({ width: w, height: h, field: blobFireField(w, h, gutter), seed,
                                    source: [], lit: false });
    }
    /** Point the fire at a new blob configuration. Keeps the field it has already built. */
    setBlobs(blobs) {
        this.source = blobSource(blobs, { w: this.w, h: this.h, rect: this.rect });
        this.fire.source = Int32Array.from(this.source);
        this.fire.light();
        return this;
    }
    step(n = 1) {
        for (let i = 0; i < n; i++) { if (this.maintain) this.fire.light(); this.fire.step(); }
        return this;
    }
    /** Heat at a grid cell, 0..1. */
    at(gx, gy) { return this.fire.at(gx, gy) / MAX_INTENSITY; }
    /**
     * Heat at a point in the caller's coordinates, 0..1; 0 outside the rect.
     *
     * *** BILINEAR, BECAUSE THE GRID IS COARSER THAN THE SURFACE IT COLOURS. *** The blobulator marches an
     * isosurface at a resolution the fire grid does not share, so several vertices fall in one cell and
     * nearest-cell sampling paints them one flat value -- visible banding, and worse, it makes a moving blob
     * change colour in steps. worldToCell() is kept beside this for the gate, which checks the exact mapping;
     * this is what the page draws with.
     */
    heatAt(px, py) {
        const { rect: r, w, h } = this;
        const u = (px - r.x0) / (r.x1 - r.x0), v = (r.y1 - py) / (r.y1 - r.y0);
        if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return 0;
        const fx = u * (w - 1), fy = v * (h - 1);
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
        const tx = fx - x0, ty = fy - y0;
        const a = this.at(x0, y0), b = this.at(x1, y0), c = this.at(x0, y1), d = this.at(x1, y1);
        return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
    /** Total heat in the field -- the quantity that shows the fire has memory and a steady state. */
    total() { return this.fire.heat(); }
}

/**
 * blobulator.html's OLD heat, transcribed exactly, so the gate compares against the real thing rather than a
 * paraphrase of it. Kept as the BEFORE, not deleted: the round's claim is that it ignores the blobs, and a
 * claim about code needs the code.
 */
export function positionalHeat(px, py, t, worldH = 40) {
    const hgt = py / worldH;
    let heat = 1.0 - hgt * 1.05;
    heat += 0.10 * Math.sin(px * 0.35 + t * 7.0) + 0.06 * Math.sin(px * 0.9 - t * 11.0);
    return heat;
}

/** What v4429 measured. Re-take with: node render/blobFire-selfcheck.mjs */
export const MEASURED_AT_V4429 = Object.freeze({
    // the BEFORE
    positionalHeatIgnoresBlobs: true,
    positionalHeatHasMemory: false,
    positionalHeatAt: 0.5824767334763219,            // heat(4, 10, 0.5), the same for every blob configuration
    // the finding that corrected the round's own selection criterion
    interiorSourceGoesOut: true,
    interiorSourceTotalAtStep0: 7848,
    interiorSourceTotalAtStep60: 0,
    bottomRowSourceHeatAtStep0: 2304,
    bottomRowSourceHeatAtStep1200: 2304,
    whyBottomRowPersists: "its back index i + w is off-grid, so step() skips the cell and never writes it",
    // the second artifact, and the gutter derived from the decay ceiling
    maxDecay: 2,
    wrapCellsAtGutter0: 50,
    wrapCellsAtGutter1: 47,
    wrapCellsAtGutter2: 0,
    // the fire the blobs actually get
    maintainedTotalAtStep60: 19458,
    maintainedTotalAtStep1200: 19605,
    // the lean, which no field can remove
    leanPerRowDerived: 1,
    leanPerRowMeasured: 0.95,
    minLeanOverAllEightDirections: 1,
    plumeCentroidAtSourceTop: 22.1,
    plumeCentroidAtTopRow: 6.9,
    // the page, driven headlessly for 240 frames at the default resolution (LX 54, LY 43, LZ 22, 9 balls)
    riverSourceCells: [183, 253],
    riverTotalHeatAtFrame120: 29837,
    riverLitCellsAtFrame120: 1210,
    surfaceCrossingsSampled: 129,
    surfaceReadingBlackPct: 16.3,
    ruleChosen: "render/doomFire.mjs's transport, with the source MAINTAINED rather than lit once",
    ruleRejected: "world/fireSystem.js (consumes its fuel -- would char the blobs)",
    vanishBelow: Math.sqrt(META_EPS),
});
