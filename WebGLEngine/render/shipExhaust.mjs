// FILE: render/shipExhaust.mjs -- v4411
//
// *** EVERY SHIP IN THE EV FLIGHT VIEW HAS A THRUSTER STATE AND NOT ONE OF THEM SHOWS IT. ***
//
// MEASURED at v4411: ev/flightView.js carries `thrust` as a live per-entity boolean -- the player's from the
// keyboard (`keys.thrust`), every AI's from stepAI -- and the flight model consumes it to accelerate. The
// draw path never reads it. `grep -rn "exhaust\|thruster"` over the whole tree returns nothing but prose
// about connection pools and ray-march budgets. A ship under full burn and a ship coasting are drawn by the
// same textured quad.
//
// And the DOOM fire, since v4178, has reached exactly one consumer: doom-fire.html, a standalone 2D canvas
// demo linked from server.html. It has never been in a scene.
//
// ---- *** WHY THIS NEEDS v4410'S DIRECTION FIELD AND NOT A ROTATED SPRITE *** -----------------------------
// A straight plume is a rotated sprite: bake one fire, draw the quad at the ship's heading, done. What a
// rotated sprite CANNOT do is bend. Exhaust is emitted and then left behind -- A PARCEL KEEPS THE HEADING IT
// WAS EMITTED WITH, so a ship that turns while burning drags a CURVED trail, and the curve is a record of
// where the ship has been. That is a different direction in every row of the plume, which is precisely a
// per-cell field and precisely what a rotation matrix applied to one texture cannot express.
//
// So the plume is built in SHIP-LOCAL space: row 0 is the nozzle, row r is the parcel emitted r frames ago,
// and row r's flow direction is that frame's heading expressed RELATIVE to the current one. The quad is then
// drawn rotated by the current heading, and the two compose.
//
// *** THE CONTROL IS AGAIN FREE: *** a ship flying straight has zero heading delta in every row, so the field
// is uniformly (0, +1) and the plume is EXACTLY FieldFire on uniformField(w, h, [0, 1]) -- byte for byte,
// frame for frame, at the same seed. A bend that changed the straight case would show there.
//
// ---- WHAT THRUST DOES, AND WHY CUTTING IT IS THE GOOD PART ------------------------------------------------
// v4178's own header says it: "Cut the source and watch the column die from the bottom." Thrust off does not
// clear the plume, it stops relighting the nozzle -- and the fire rises, cools and burns out on its own over
// a few dozen frames. That behaviour was already correct and already gated; this module only has to stop
// calling light().
"use strict";
import { FieldFire, buildField, uniformField, upstreamSource, MAX_INTENSITY, PALETTE } from "./doomFireField.mjs";

export { MAX_INTENSITY, PALETTE };

/** Straight back from the nozzle, in plume-local space: row 0 is the nozzle, +y is away from the ship. */
export const AFT = Object.freeze([0, 1]);

/**
 * Signed shortest angle a->b in degrees, in [-180, 180). Deliberately the SAME expression as
 * ev/flightModel3d.js angleDiffDeg, so a plume and the flight model can never disagree about which way a
 * ship turned. A HALF-TURN RETURNS -180 AND NOT +180 -- at half a turn both ways round are the same
 * length, so the sign is a convention rather than a fact, and v4411 corrected that function's own
 * comment, which named the range as (-180, 180] and so excluded the value it returns.
 */
export function headingDelta(a, b) { return ((b - a) % 360 + 540) % 360 - 180; }

/**
 * The direction a parcel emitted at `then` has, seen from a ship now heading `now`. Straight back is (0, 1);
 * a ship that has turned since leaves that parcel pointing off to one side by the same angle.
 *
 * *** THE SIGN IS THE WHOLE THING AND IT IS DERIVED, NOT GUESSED. *** If the ship has turned LEFT since the
 * parcel left, the parcel is now to the ship's RIGHT, so the rotation applied is the NEGATIVE of the delta.
 */
export function parcelDirection(now, then) {
    const d = -headingDelta(then, now) * Math.PI / 180;
    const c = Math.cos(d), s = Math.sin(d);
    return [AFT[0] * c - AFT[1] * s, AFT[0] * s + AFT[1] * c];
}

/**
 * Build the plume's field from a heading history. `headings[0]` is the current heading and `headings[r]` the
 * heading r frames ago; a history shorter than the plume repeats its oldest entry.
 *
 * *** THE FIRST DRAFT POINTED EACH ROW ALONG ITS PARCEL'S HEADING, AND THAT IS A DIFFERENT THING FROM THE
 * DIRECTION HEAT TRAVELS. *** Measured: at 3 degrees per frame over 32 rows the oldest row is 96 degrees off,
 * so its `back` pointed SIDEWAYS -- the row read from its neighbour instead of from the nozzle, the plume
 * stopped being connected to the engine at all, and turning left and turning right both put the tail in the
 * same place (12.0 and 12.7 against a straight 7.9). That is not a bend, it is noise.
 *
 * Heat always enters at the nozzle and travels DOWN THE ROWS. What a turn bends is the plume's COURSE. So
 * this is v4410's river, with the channel's centre line derived from the heading history rather than drawn:
 * a parcel emitted when the ship was pointing d degrees off the current heading has drifted sideways by
 * sin(d), those offsets accumulate down the plume, and the flow is the tangent of THAT curve -- clamped to
 * one cell per row for the reason v4410 established, that downstream which never advances a row is not
 * downstream.
 */
export function exhaustCentreLine(w, h, headings = [0]) {
    const now = headings[0] || 0;
    const cx = new Float64Array(h);
    cx[0] = (w - 1) / 2;
    for (let r = 1; r < h; r++) {
        const then = headings[Math.min(r, headings.length - 1)];
        const d = -headingDelta(then == null ? now : then, now) * Math.PI / 180;
        cx[r] = cx[r - 1] + Math.sin(d);
    }
    return cx;
}

export function exhaustField(w, h, headings = [0], spread = 0.55) {
    const cx = exhaustCentreLine(w, h, headings);
    const halfAt = (r) => Math.max(1, (w * 0.5) * (0.35 + spread * (r / Math.max(1, h - 1))));
    return buildField(w, h, (x, y) => {
        if (Math.abs(x - cx[y]) > halfAt(y)) return [0, 0];
        const ahead = cx[Math.min(h - 1, y + 1)];
        return [Math.max(-1, Math.min(1, ahead - cx[y])), 1];
    });
}

export class ShipExhaust {
    /**
     * @param opts.width, opts.height  plume grid in CELLS (height is also how many frames of history show)
     * @param opts.seed                seeded like v4178; never Math.random
     * @param opts.spread              cone half-width growth, 0 for a parallel column
     */
    constructor(opts = {}) {
        this.width = Math.max(3, opts.width | 0 || 24);
        this.height = Math.max(4, opts.height | 0 || 32);
        this.seed = opts.seed ?? 0x5EED;
        this.spread = opts.spread == null ? 0.55 : opts.spread;
        this.headings = [0];
        this.thrusting = false;
        this.frame = 0;
        this.fire = new FieldFire({ width: this.width, height: this.height, seed: this.seed,
                                    field: exhaustField(this.width, this.height, this.headings, this.spread),
                                    lit: false });
        this._nozzle();
    }

    /** The inlet, derived from the field the way v4410 established -- never a typed row. */
    _nozzle() { this.fire.source = Int32Array.from(upstreamSource(this.fire.field)); }

    /**
     * Advance one frame. `heading` in degrees, `thrust` truthy while the engine burns.
     *
     * *** THE FIELD IS REBUILT EVERY FRAME AND THAT IS NOT WASTE: *** the history shifts by one row per
     * frame, so every row's direction changes. Rebuilding is O(w*h) integer work on the same arrays the
     * step already walks, and the alternative -- shifting a field in place -- is a second representation of
     * the same history that could disagree with it.
     */
    push(heading, thrust) {
        this.headings.unshift(heading || 0);
        if (this.headings.length > this.height) this.headings.length = this.height;
        this.thrusting = !!thrust;
        this.fire.field = exhaustField(this.width, this.height, this.headings, this.spread);
        this._nozzle();
        // *** CUTTING THRUST EXTINGUISHES THE NOZZLE; MERELY NOT LIGHTING IT IS NOT CUTTING IT. *** The
        // nozzle row's upstream neighbour is off-grid, so step() skips it and it KEEPS ITS VALUE FOR EVER.
        // Measured on the first draft: thrust cut after 120 frames and the plume was still burning 500
        // frames later, while this file's own header claimed it "rises, cools and burns out on its own".
        // v4178 has the same shape and names it -- extinguish() is a separate call from not calling light().
        if (this.thrusting) this.fire.light(); else this.fire.extinguish();
        this.fire.step();
        this.frame++;
        return this;
    }

    /** True while anything is still burning -- a coasting ship's plume dies out rather than vanishing. */
    isBurning() { return this.fire.isBurning(); }
    heat() { return this.fire.heat(); }
    at(x, y) { return this.fire.at(x, y); }

    /**
     * RGBA for a texture upload, with ALPHA CARRYING THE INTENSITY rather than a flat 255. A plume drawn with
     * v4178's opaque alpha would be a solid rectangle of black around the flame; the fire's own value is what
     * makes the edge an edge.
     */
    rgba(out) {
        const n = this.width * this.height;
        const buf = out && out.length >= n * 4 ? out : new Uint8ClampedArray(n * 4);
        for (let i = 0; i < n; i++) {
            const v = this.fire.pixels[i], c = PALETTE[v] || PALETTE[0];
            buf[i * 4] = c[0]; buf[i * 4 + 1] = c[1]; buf[i * 4 + 2] = c[2];
            buf[i * 4 + 3] = Math.round(255 * (v / MAX_INTENSITY));
        }
        return buf;
    }
}

/** The straight-flight control field, named so a caller and a gate reach for the same thing. */
export const straightField = (w, h, spread = 0.55) => exhaustField(w, h, [0], spread);

export default ShipExhaust;
