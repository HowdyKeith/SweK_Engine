// WebGLEngine/tools/render-qa/asciify.mjs
// VERSION: v1 -- v3322
//
// ANY RENDERED FRAME AS SHAPE-MATCHED ASCII. PURE ARITHMETIC, NO DEPENDENCY.
//
// Keith, on DavidHDev/canvas-ui: "the ascii object is amazing. if we could view our avatar or other 3d objects
// through that, that would be very cool." That library is React/Vue/Svelte source and needs porting -- BUT THE
// TECHNIQUE NEEDS NOTHING. Sampling luminance into a character ramp is arithmetic over pixels, and SweK already
// renders the wireframe head to a texture (v3240) and diffs frames headlessly (v3252).
//
// *** SO THIS TAKES RGBA IN AND RETURNS TEXT, WITH NO CANVAS, NO DOM AND NO GL. *** That is what makes it
// gateable: the whole claim -- "brighter regions pick denser characters, and the aspect ratio is corrected" --
// is checkable against fixtures with known luminance, on a box with no GPU.

// Dark -> light. TEN LEVELS, NOT SEVENTY: a long ramp looks impressive and quantises noise into visible bands
// on a smooth gradient, because adjacent glyphs stop differing in perceived weight. Short and honest beats long
// and decorative.
export const RAMP = " .:-=+*#%@";

/**
 * Terminal cells are about twice as tall as they are wide, so sampling a square grid produces an image
 * stretched vertically by 2x. THIS IS THE STEP EVERY NAIVE ASCII RENDERER SKIPS, and it is why theirs looks
 * shape-matched and most look squashed.
 */
export const CELL_ASPECT = 2;

/**
 * @param {Uint8ClampedArray} rgba  source pixels
 * @param {number} w, h             source dimensions
 * @param {{cols?:number, ramp?:string, invert?:boolean, alphaAsSpace?:boolean}} opts
 * @returns {{ text, cols, rows, ramp }}
 *
 * *** TRANSPARENT PIXELS BECOME SPACES, NOT BLACK. *** A transparent background luminance-averages to zero and
 * would fill the frame with the ramp's darkest glyph -- an object silhouetted on a solid block, which is the
 * opposite of what an ASCII view is for. Alpha is asked about rather than assumed away.
 */
export function asciify(rgba, w, h, { cols = 80, ramp = RAMP, invert = false, alphaAsSpace = true } = {}) {
    if (!rgba || !w || !h) throw new TypeError("asciify needs pixels and dimensions");
    if (cols < 1) throw new RangeError("cols must be >= 1");
    const cw = w / cols;
    const ch = cw * CELL_ASPECT;
    const rows = Math.max(1, Math.floor(h / ch));
    const out = [];

    for (let r = 0; r < rows; r++) {
        let line = "";
        for (let c = 0; c < cols; c++) {
            const x0 = Math.floor(c * cw), x1 = Math.min(w, Math.floor((c + 1) * cw));
            const y0 = Math.floor(r * ch), y1 = Math.min(h, Math.floor((r + 1) * ch));
            let sum = 0, n = 0, aSum = 0;
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
                const i = (y * w + x) * 4;
                // Rec. 601 luma. A FLAT MEAN OF R,G,B WOULD MAKE PURE GREEN AND PURE BLUE THE SAME BRIGHTNESS,
                // and SweK's whole palette is green -- the one channel a naive average gets most wrong here.
                sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
                aSum += rgba[i + 3];
                n++;
            }
            if (!n) { line += " "; continue; }
            const alpha = aSum / n / 255;
            if (alphaAsSpace && alpha < 0.15) { line += " "; continue; }
            let t = (sum / n) / 255;
            if (invert) t = 1 - t;
            const k = Math.min(ramp.length - 1, Math.max(0, Math.round(t * (ramp.length - 1))));
            line += ramp[k];
        }
        out.push(line);
    }
    return { text: out.join("\n"), cols, rows, ramp };
}

/** The character a given 0..1 luminance maps to -- exposed so a gate can assert the mapping directly. */
export function glyphFor(t, ramp = RAMP) {
    return ramp[Math.min(ramp.length - 1, Math.max(0, Math.round(t * (ramp.length - 1))))];
}
