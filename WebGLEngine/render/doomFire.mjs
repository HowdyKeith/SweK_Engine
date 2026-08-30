// FILE: render/doomFire.mjs -- v4178
//
// The PSX DOOM fire, ported from filipedeschamps/doom-fire-algorithm (MIT (c) 2019 Filipe Deschamps),
// specifically its plain-JavaScript putImageData implementation -- the PixiJS and wasm variants in that
// repository differ only in bundler and renderer plumbing, and this tree wants the rule.
//
// *** IT DOES NOT DUPLICATE physics/fire/fireMesh.js, AND THE DIFFERENCE IS CATEGORICAL. *** fireMesh is
// mattatz/THREE.Fire: a RAY-MARCHED VOLUMETRIC fire, twenty iterations of three-octave noise through a 3D
// box, which is what makes toppling buildings burn convincingly. This is a CELLULAR AUTOMATON on a grid of
// bytes -- each cell copies the one below it, loses a random amount, and drifts sideways by that same random
// amount, against a fixed 37-entry palette. One is optics through a volume; the other is a rule applied to a
// grid. The second costs almost nothing, which is what makes it right for a Pip-Boy screen, a CRT inside a
// scene, or an Android TV, none of which should be ray-marching anything.
//
// ---- *** THE RNG IS A PARAMETER, AND THAT IS THE WHOLE REASON THIS IS GATEABLE *** -----------------------
// The original calls Math.random() twice per cell per frame. A direct port is therefore unseeded, and an
// unseeded automaton cannot be checked against anything -- you are left asserting that fire looks like fire.
// Taking the generator as a constructor argument FROM THE START makes "same seed, same field, frame for
// frame" true by construction rather than retrofitted, and every check in the gate rests on it.
//
// ---- TWO ARTIFACTS OF THE ORIGINAL, REPRODUCED ON PURPOSE AND NAMED SO NOBODY "FIXES" THEM ---------------
//
// 1. *** THE WIND IS AN UNCLAMPED 1D INDEX, AND IT WRAPS ACROSS ROWS. *** The rule writes to
//    pixels[current - decay], where decay is 0..2 and the index is column + width*row. At column 0 with a
//    decay of 1 or 2 that lands at the END OF THE ROW ABOVE, not at the left edge of this one. It is what
//    gives the flame its leftward lean, and the wrap is why a wisp occasionally appears on the far side.
//    A clamped version is a different-looking fire, so this is kept and the gate pins that it happens.
//
// 2. *** THE UPDATE IS SINGLE-BUFFERED AND ORDER-DEPENDENT. *** The original iterates COLUMN-major and
//    mutates one array in place, so a write to current - decay lands in a column already processed this
//    frame. Double-buffering it would be the obvious tidy-up and would change the result. The iteration
//    order is therefore part of the algorithm, not an implementation detail.
"use strict";

/**
 * The 37 colours, exactly as the original carries them -- index 0 is near-black and 36 is white. Frozen
 * because an accidental splice here would not throw: it would shift every colour by one and produce a fire
 * that is merely the wrong temperature.
 */
export const PALETTE = Object.freeze([
    [7,7,7],[31,7,7],[47,15,7],[71,15,7],[87,23,7],[103,31,7],[119,31,7],[143,39,7],[159,47,7],[175,63,7],
    [191,71,7],[199,71,7],[223,79,7],[223,87,7],[223,87,7],[215,95,7],[215,95,7],[215,103,15],[207,111,15],
    [207,119,15],[207,127,15],[207,135,23],[199,135,23],[199,143,23],[199,151,31],[191,159,31],[191,159,31],
    [191,167,39],[191,167,39],[191,175,47],[183,175,47],[183,183,47],[183,183,55],[207,207,111],[223,223,159],
    [239,239,199],[255,255,255],
].map(Object.freeze));

/** The hottest index, which is also the source row's value. PALETTE.length - 1, stated rather than assumed. */
export const MAX_INTENSITY = PALETTE.length - 1;      // 36

/**
 * A small deterministic generator, so the DEFAULT is reproducible rather than Math.random. mulberry32: one
 * 32-bit state, uniform enough for a decay of 0..2, and it costs nothing.
 */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class DoomFire {
    /**
     * @param opts.width, opts.height  grid size in CELLS, not pixels -- the original is 60x40 and upscales
     * @param opts.rng                 () => [0,1). Defaults to a SEEDED generator, never Math.random.
     * @param opts.seed                seed for the default generator
     * @param opts.lit                 start with the source row alight (default true)
     */
    constructor(opts = {}) {
        this.width = Math.max(1, opts.width | 0 || 60);
        this.height = Math.max(2, opts.height | 0 || 40);
        this.rng = typeof opts.rng === "function" ? opts.rng : mulberry32(opts.seed ?? 0x5EED);
        // Uint8Array, not a plain array: intensities are 0..36, and a typed array also makes the original's
        // one off-by-one harmless. createFireSource loops `column <= width`, writing one past the row; on a
        // typed array that index is out of bounds and silently dropped, the same outcome the original gets
        // from growing a sparse array nothing ever reads.
        this.pixels = new Uint8Array(this.width * this.height);
        this.frame = 0;
        if (opts.lit !== false) this.light();
    }

    /** Index of the first cell of the source row -- the BOTTOM row, which the propagation never touches. */
    get sourceIndex() { return this.width * (this.height - 1); }

    /** Set the bottom row to maximum: the fire's source. */
    light() { this.pixels.fill(MAX_INTENSITY, this.sourceIndex, this.sourceIndex + this.width); return this; }
    /** Cut the source. The fire does not stop instantly -- it rises and burns out, which is the good part. */
    extinguish() { this.pixels.fill(0, this.sourceIndex, this.sourceIndex + this.width); return this; }

    /** Nudge the source up, per column, by a random 0..13 -- the original's increaseFireSource. */
    stoke() {
        for (let c = 0; c < this.width; c++) {
            const i = this.sourceIndex + c, cur = this.pixels[i];
            if (cur < MAX_INTENSITY) this.pixels[i] = Math.min(MAX_INTENSITY, cur + Math.floor(this.rng() * 14));
        }
        return this;
    }

    /** And down -- the original's decreaseFireSource. */
    damp() {
        for (let c = 0; c < this.width; c++) {
            const i = this.sourceIndex + c, cur = this.pixels[i];
            if (cur > 0) this.pixels[i] = Math.max(0, cur - Math.floor(this.rng() * 14));
        }
        return this;
    }

    /** One frame of propagation. COLUMN-MAJOR and single-buffered, deliberately -- see artifact 2 above. */
    step() {
        const { width: w, height: h, pixels: p } = this;
        const n = w * h;
        for (let column = 0; column < w; column++) {
            for (let row = 0; row < h; row++) {
                const i = column + w * row;
                const below = i + w;
                if (below >= n) continue;                  // the source row has nothing beneath it
                const decay = Math.floor(this.rng() * 3);  // 0, 1 or 2
                const v = p[below] - decay;
                const dst = i - decay;                     // UNCLAMPED -- artifact 1, the wind and its wrap
                if (dst >= 0) p[dst] = v > 0 ? v : 0;
            }
        }
        this.frame++;
        return this;
    }

    /** Intensity at a cell, or 0 outside the grid. */
    at(x, y) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
        return this.pixels[x + this.width * y];
    }

    /**
     * Paint into an RGBA byte array -- the shape of ImageData.data, so a caller can hand it straight to
     * putImageData or to texImage2D with no copy. Allocates only when not given one to write into.
     */
    toRGBA(out) {
        const n = this.width * this.height;
        const buf = out && out.length >= n * 4 ? out : new Uint8ClampedArray(n * 4);
        for (let i = 0; i < n; i++) {
            const c = PALETTE[this.pixels[i]] || PALETTE[0];
            buf[i * 4] = c[0]; buf[i * 4 + 1] = c[1]; buf[i * 4 + 2] = c[2]; buf[i * 4 + 3] = 255;
        }
        return buf;
    }

    /** True while anything is still burning -- a level-triggered probe for engine/frameDirty.js (v4174). */
    isBurning() {
        for (let i = 0; i < this.pixels.length; i++) if (this.pixels[i] > 0) return true;
        return false;
    }

    /** Total intensity, for a caller that wants to watch it die rather than poll isBurning. */
    heat() { let s = 0; for (let i = 0; i < this.pixels.length; i++) s += this.pixels[i]; return s; }
}

export default DoomFire;
