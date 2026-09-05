// FILE: render/doomFireField.mjs -- v4410
//
// *** THE DOOM FIRE'S "UP" IS A CONSTANT, AND THAT IS THE ONLY REASON IT CANNOT RUN DOWN A RIVER. ***
//
// render/doomFire.mjs (v4178, ported from filipedeschamps/doom-fire-algorithm, MIT) expresses its whole rule
// as 1D index arithmetic on a rectangular grid:
//
//     const below = i + w;                       // where the heat is DRAWN FROM: one row down
//     const decay = Math.floor(rng() * 3);
//     const dst   = i - decay;                   // where it is WRITTEN: this cell, leaned LEFT by decay
//
// *** THERE ARE TWO DIRECTIONAL CONSTANTS IN THAT RULE AND NOT ONE, which is the thing worth noticing. ***
// `+w` is the flow: heat rises, so a cell reads the cell behind it. `-1` is the lean: the flame drifts as it
// rises. A generalisation that replaced only the first would produce fire that flows sideways and still leans
// left, which is not a rotated fire, it is a broken one.
//
// ---- BOTH COME FROM ONE FIELD, AND THE DERIVATION IS WHAT MAKES THE CONTROL FREE ------------------------
// Give every cell a flow direction d = (dx, dy) in grid coordinates, y increasing downward. Then:
//
//     back(d) = -(dx + w*dy)          the neighbour OPPOSITE the flow -- where this cell's heat comes from
//     perp(d) =  (dy) + w*(-dx)       the flow turned 90 degrees -- the lean
//
// For the original's upward flow d = (0,-1): back = -(0 - w) = +w, and perp = (-1) + w*0 = -1. THOSE ARE THE
// TWO CONSTANTS, DERIVED. So a uniform field of (0,-1) is not merely "close to" v4178, it is the same
// arithmetic, and the gate holds it to BYTE FOR BYTE, FRAME FOR FRAME, AT THE SAME SEED. That control cost
// nothing to build and is the strongest evidence available that the generalisation changed no base case.
//
// ---- WHAT IS DELIBERATELY PRESERVED, INCLUDING THE PARTS THAT LOOK LIKE BUGS ----------------------------
// v4178's header names two artifacts of the original and pins them on purpose: the write index is UNCLAMPED
// and wraps across rows, and the update is single-buffered and column-major so a write lands in a column
// already processed this frame. Both are kept here, because a fire without them is a different-looking fire:
//
//   * the loop order is column-major and the buffer is single, exactly as before;
//   * rng() is called at the same point, the same number of times, AFTER the bounds check on the source cell
//     -- so a bottom-row cell consumes no randomness in either implementation, which is what makes the
//     byte-for-byte control possible at all;
//   * the destination bound grew an UPPER limit (dst < n) that v4178 did not need. With perp fixed at -1 and
//     i < n, dst < n held for free; with a field, perp can be positive. FOR THE DEFAULT FIELD THE NEW TEST
//     NEVER FIRES, which is why the control still passes -- said here rather than left for someone to wonder
//     whether the control was weakened to fit.
//
// ---- *** A BOUNDARY BEHAVIOUR OF v4178 THAT v4178 COULD NOT EXHIBIT *** ----------------------------------
// The decay is applied to the value WRITTEN, and the write lands on the perpendicular neighbour: only a
// decay of 0 writes a cell to itself, and it writes it undecayed. So a fuel cell whose PERPENDICULAR
// UPSTREAM neighbour is not fuel can never receive a decayed value at all -- it conducts its inlet intensity
// forever. MEASURED on the waterfall: the curtain's leading column reads exactly 36 at every one of 20 rows,
// and across the whole grid 48 of the 51 fuel cells with no perpendicular upstream neighbour sit at MAX.
//
// *** THIS IS NOT NEW BEHAVIOUR, IT IS OLD BEHAVIOUR THAT HAD NOWHERE TO APPEAR. *** v4178's fuel region is
// the entire rectangle, so its only such cells are one screen edge, where the effect is a 9% warm bias --
// measured on the original: mean intensity 25.7 at the right edge against 23.6 at the left. Give the fire an
// interior boundary and the same rule produces a hard bright line. It is reported here rather than smoothed,
// because smoothing it would be changing the ported rule to suit a picture.
//
// ---- WHAT THIS IS NOT: THE KRBN LIFT ---------------------------------------------------------------------
// tools/krbn/strokeLift.js liftStrokes(strokes, mesh, cam) ray-casts 2D points onto a mesh and drapes them as
// 3D polylines. It is a FORWARD MAP ONLY -- point to surface position, no inverse and no adjacency -- so it
// can PAINT this fire onto terrain and cannot make it TRAVERSE terrain. Traversal needs a neighbour topology,
// and that is what a direction field is. The lift and this module answer two different questions and the one
// worth being clear about is which.
"use strict";
import { PALETTE, MAX_INTENSITY, mulberry32 } from "./doomFire.mjs";

export { PALETTE, MAX_INTENSITY, mulberry32 };

/** The flow direction the original fire has everywhere: up the screen. y grows downward, so up is -1. */
export const UP = Object.freeze([0, -1]);

/**
 * A direction quantised to one of the eight neighbours (or (0,0) for a dead cell). A field is sampled as a
 * real vector and must land on an integer index step, so this is where that happens -- once, named, rather
 * than in each field function.
 *
 * *** ZERO IS A DIRECTION AND NOT AN ERROR: *** a cell with no flow is a cell the fire does not leave, which
 * is how a field says "nothing burns here" without a second mask.
 */
export function quantise(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return [0, 0];
    if (dx === 0 && dy === 0) return [0, 0];
    // *** SNAP THE ANGLE, NOT THE COMPONENTS -- AND THE FIRST DRAFT DID THE OPPOSITE. *** It normalised by
    // the larger component and rounded each, with a comment claiming that "keeps a shallow diagonal diagonal
    // instead of collapsing it to the dominant axis". MEASURED: it collapses exactly those. (2.4, 1) is 22.6
    // degrees off horizontal and came out [1, 0] -- the downstream component rounded away entirely -- so the
    // river field's fire never left its source row. The comment asserted the property the code lacked.
    // Nearest of the eight neighbours means nearest BY ANGLE, which is this:
    const k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
    const a = k * (Math.PI / 4);
    // +0 rather than -0: an Int8Array stores them alike, but a test that prints a direction should not.
    return [Math.round(Math.cos(a)) + 0, Math.round(Math.sin(a)) + 0];
}

/** The two index offsets a flow direction implies, given the row stride. See the header for the derivation. */
export function offsets(dx, dy, w) {
    return { back: -(dx + w * dy), perp: dy + w * -dx };
}

/**
 * Build a field: `fn(x, y) -> [dx, dy]` sampled once per cell and frozen into two Int32Arrays. Returning
 * offsets rather than directions means step() does no arithmetic per cell beyond an add, and means a field
 * is a DATA structure a gate can inspect rather than a closure it can only run.
 */
export function buildField(w, h, fn = () => UP) {
    const back = new Int32Array(w * h), perp = new Int32Array(w * h), dirs = new Int8Array(w * h * 2);
    const fuel = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = x + w * y;
        const raw = fn(x, y) || UP;
        const [dx, dy] = quantise(raw[0], raw[1]);
        const o = offsets(dx, dy, w);
        back[i] = o.back; perp[i] = o.perp;
        dirs[i * 2] = dx; dirs[i * 2 + 1] = dy;
        // *** FUEL IS DERIVED FROM THE DIRECTION, NEVER PASSED IN BESIDE IT. *** A zero direction is a cell
        // the fire has no way to leave, and this array is that fact made addressable rather than a second
        // mask a caller could get out of step with the field it describes.
        fuel[i] = (dx || dy) ? 1 : 0;
    }
    return { w, h, back, perp, dirs, fuel };
}

/**
 * *** THE INLET, DERIVED FROM THE FIELD RATHER THAN GUESSED BY THE CALLER. ***
 *
 * A source is where fire ENTERS, and that is a property of the flow, not a row number. Every fuel cell whose
 * upstream neighbour is off-grid or non-fuel has nothing feeding it, and those cells ARE the inlet.
 *
 * This was learned the hard way. The waterfall field flows RIGHT across a seven-row band, and lighting "the
 * top row" -- one row of a seven-row flow -- produced a fire that advanced one cell and then died back.
 * MEASURED: row 0 column 8 read 36 after two frames and 0 after three. The cause is not the flow but the
 * LEAN, which is perpendicular to it: for a rightward flow the lean is VERTICAL, so the cold cells of row 1
 * were writing straight up into row 1's neighbour in row 0, faster than the flow could fill them. The field
 * was right and the source was wrong, and a caller should not have to work that out.
 *
 * For the original upward field this returns exactly the bottom row -- so v4178's hand-picked source is a
 * CONSEQUENCE of its flow rather than a second fact about it, which is the strongest sign the rule is right.
 */
export function upstreamSource(field) {
    const { w, h, back, fuel } = field, n = w * h, out = [];
    for (let i = 0; i < n; i++) {
        if (!fuel[i]) continue;
        const b = i + back[i];
        if (b < 0 || b >= n || !fuel[b]) out.push(i);
    }
    return out;
}

/** The control field: every cell flows up. buildField(w, h) with no fn gives the same thing. */
export const uniformField = (w, h, d = UP) => buildField(w, h, () => d);

/* ---------------------------------------------------------------------------------------------------------
 * THE THREE FIELDS THE BACKLOG ASKED FOR. Each is a plain function of position so it can be checked by
 * evaluating it, not by rendering it and looking.
 * ------------------------------------------------------------------------------------------------------ */

/**
 * A RIVER: flow along a channel whose centre line wanders, so the fire runs DOWNSTREAM rather than upward.
 * `path(t)` gives the centre x at t in [0,1] down the grid; the flow is the tangent of that curve.
 */
export function riverField(w, h, path = (t) => 0.5 + 0.25 * Math.sin(t * Math.PI * 2), bank = 0.18) {
    const halfBand = Math.max(1, bank * w);
    return buildField(w, h, (x, y) => {
        const t = h > 1 ? y / (h - 1) : 0;
        const cx = path(t) * w;
        if (Math.abs(x - cx) > halfBand) return [0, 0];      // off the water: nothing flows, nothing burns
        const dt = 1 / Math.max(1, h - 1);
        const ahead = path(Math.min(1, t + dt)) * w;
        // *** THE SIDEWAYS RUN IS CLAMPED TO ONE CELL PER ROW, AND THAT IS NOT COSMETIC. *** The tangent is
        // measured in cells per row, and the default path wanders a quarter of the width over a quarter
        // period -- a channel genuinely steeper than 45 degrees, whose tangent quantises to PURE HORIZONTAL.
        // MEASURED before this clamp: the fire ran along the source row and never descended a single row,
        // because at every cell the nearest of eight directions was (1, 0). Downstream that never advances
        // downstream is not downstream. The clamp says a river cell always gains a row, and the channel may
        // be as steep as it likes without the flow ceasing to be a flow.
        const perRow = Math.max(-1, Math.min(1, ahead - cx));
        return [perRow, 1];
    });
}

/**
 * A WATERFALL: flow is horizontal along the lip, then turns to the fall line past it. The turn is the whole
 * point -- one field holding two regimes is what a scalar "wind" parameter cannot express.
 */
export function waterfallField(w, h, lipY = 0.35, lipX = 0.6) {
    const ly = Math.round(lipY * h), lx = Math.round(lipX * w), curtain = 3;
    const inCurtain = (x) => x >= lx && x < lx + curtain;
    return buildField(w, h, (x, y) => {
        // *** THE CURTAIN IS NARROW ABOVE AND BELOW THE LIP, AND THE FIRST DRAFT MADE IT A SHEET. *** It read
        // `x > lx + 2 ? [0,0] : [0,1]` below the lip, so EVERY cell left of the lip was falling water and the
        // whole left half of the grid burned -- while the comment beside it said "a narrow column". The
        // approach band fed straight down into it. Three cells wide, above the lip and below, is a waterfall;
        // everything else below the lip is dry rock and holds no fire at all.
        if (y < ly) return inCurtain(x) ? [0, 1] : (x < lx ? [1, 0] : [0, 0]);
        return inCurtain(x) ? [0, 1] : [0, 0];
    });
}

/**
 * LAVA: flow follows an advection velocity that spreads from a vent, so the fire creeps outward and downhill
 * rather than rising. `vent` is in cell coordinates; gravity biases the result downhill.
 */
export function lavaField(w, h, vent = [0.5, 0.2], gravity = 0.8) {
    const vx = vent[0] * w, vy = vent[1] * h;
    return buildField(w, h, (x, y) => {
        const dx = x - vx, dy = y - vy;
        const r = Math.hypot(dx, dy);
        if (r < 1e-6) return [0, 1];
        return [dx / r, dy / r + gravity];                    // radial from the vent, pulled downhill
    });
}

/* ------------------------------------------------------------------------------------------------------ */

export class FieldFire {
    /**
     * @param opts.width, opts.height  grid size in CELLS
     * @param opts.field               from buildField(); defaults to the uniform upward field
     * @param opts.rng, opts.seed      as v4178 -- seeded by default, never Math.random
     * @param opts.source              indices to light; defaults to the BOTTOM ROW, as v4178
     * @param opts.lit                 start alight (default true)
     */
    constructor(opts = {}) {
        this.width = Math.max(1, opts.width | 0 || 60);
        this.height = Math.max(2, opts.height | 0 || 40);
        this.rng = typeof opts.rng === "function" ? opts.rng : mulberry32(opts.seed ?? 0x5EED);
        this.field = opts.field || uniformField(this.width, this.height);
        if (this.field.w !== this.width || this.field.h !== this.height) {
            throw new Error(`field is ${this.field.w}x${this.field.h}, grid is ${this.width}x${this.height}`);
        }
        this.pixels = new Uint8Array(this.width * this.height);
        this.frame = 0;
        const base = this.width * (this.height - 1);
        this.source = opts.source ? Int32Array.from(opts.source)
                                  : Int32Array.from({ length: this.width }, (_, c) => base + c);
        if (opts.lit !== false) this.light();
    }

    get sourceIndex() { return this.width * (this.height - 1); }

    // You cannot set fire to a rock. light() and stoke() skip non-fuel cells, so a source row that crosses a
    // river bank lights only the water -- rather than leaving a lit cell sitting in ground that cannot burn.
    light() { const f = this.field.fuel; for (const i of this.source) if (f[i]) this.pixels[i] = MAX_INTENSITY; return this; }
    extinguish() { for (const i of this.source) this.pixels[i] = 0; return this; }

    stoke() {
        for (const i of this.source) {
            if (!this.field.fuel[i]) continue;
            const cur = this.pixels[i];
            if (cur < MAX_INTENSITY) this.pixels[i] = Math.min(MAX_INTENSITY, cur + Math.floor(this.rng() * 14));
        }
        return this;
    }

    damp() {
        for (const i of this.source) {
            const cur = this.pixels[i];
            if (cur > 0) this.pixels[i] = Math.max(0, cur - Math.floor(this.rng() * 14));
        }
        return this;
    }

    /**
     * One frame. COLUMN-MAJOR and single-buffered, as v4178 -- and the rng() call sits after the source-cell
     * bounds test, so a cell with no source consumes no randomness. That is what makes the uniform field
     * reproduce v4178 byte for byte rather than merely closely.
     */
    step() {
        const { width: w, height: h, pixels: p } = this;
        const n = w * h, back = this.field.back, perp = this.field.perp, fuel = this.field.fuel;
        for (let column = 0; column < w; column++) {
            for (let row = 0; row < h; row++) {
                const i = column + w * row;
                if (!fuel[i]) continue;                    // not fuel: the fire has no way through this cell
                const b = i + back[i];
                if (b < 0 || b >= n) continue;
                const decay = Math.floor(this.rng() * 3);
                const v = p[b] - decay;
                const dst = i + decay * perp[i];
                if (dst < 0 || dst >= n) continue;
                // *** AND THE LEAN MAY NOT CROSS A BANK. *** Measured before this test: 154 of 1,542
                // off-water cells were alight in the river field, because a live cell's lean writes to a
                // DIAGONAL neighbour and that neighbour is off the water at every bend. The header claims a
                // zero direction means "nothing burns here"; without this line that was a claim the code did
                // not have, which is the same defect this round already found in quantise().
                if (!fuel[dst]) continue;
                p[dst] = v > 0 ? v : 0;
            }
        }
        this.frame++;
        return this;
    }

    at(x, y) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
        return this.pixels[x + this.width * y];
    }

    toRGBA(out) {
        const n = this.width * this.height;
        const buf = out && out.length >= n * 4 ? out : new Uint8ClampedArray(n * 4);
        for (let i = 0; i < n; i++) {
            const c = PALETTE[this.pixels[i]] || PALETTE[0];
            buf[i * 4] = c[0]; buf[i * 4 + 1] = c[1]; buf[i * 4 + 2] = c[2]; buf[i * 4 + 3] = 255;
        }
        return buf;
    }

    isBurning() { for (let i = 0; i < this.pixels.length; i++) if (this.pixels[i] > 0) return true; return false; }
    heat() { let s = 0; for (let i = 0; i < this.pixels.length; i++) s += this.pixels[i]; return s; }
}

export default FieldFire;
