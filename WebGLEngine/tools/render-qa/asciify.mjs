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
 * @param {{cols?:number, ramp?:string, invert?:boolean, alphaAsSpace?:boolean, color?:boolean}} opts
 * @returns {{ text, cols, rows, ramp, colors?: (number[]|null)[][] }}
 *
 * *** TRANSPARENT PIXELS BECOME SPACES, NOT BLACK. *** A transparent background luminance-averages to zero and
 * would fill the frame with the ramp's darkest glyph -- an object silhouetted on a solid block, which is the
 * opposite of what an ASCII view is for. Alpha is asked about rather than assumed away.
 *
 * v4049 -- opts.color, ADDITIVE AND OFF BY DEFAULT. Keith: "monochrome by default, but we would want to be able
 * to switch to color." THE GLYPH CHOICE DOES NOT CHANGE: which character a cell gets is still luma alone, exactly
 * as before, so a colored render and a monochrome render of the SAME frame read as the same shape -- color is a
 * second fact about a cell, not a second scheme for choosing its glyph. When color is requested this costs three
 * more running sums per pixel already being visited; when it is not, every existing caller (asciiLut.mjs,
 * ascii-object.html, ascii-video.html) pays nothing extra, because the field is simply absent from the result.
 */
export function asciify(rgba, w, h, { cols = 80, ramp = RAMP, invert = false, alphaAsSpace = true, color = false } = {}) {
    if (!rgba || !w || !h) throw new TypeError("asciify needs pixels and dimensions");
    if (cols < 1) throw new RangeError("cols must be >= 1");
    const cw = w / cols;
    const ch = cw * CELL_ASPECT;
    const rows = Math.max(1, Math.floor(h / ch));
    const out = [];
    const colorsOut = color ? [] : null;

    for (let r = 0; r < rows; r++) {
        let line = "";
        const colorRow = color ? [] : null;
        for (let c = 0; c < cols; c++) {
            const x0 = Math.floor(c * cw), x1 = Math.min(w, Math.floor((c + 1) * cw));
            const y0 = Math.floor(r * ch), y1 = Math.min(h, Math.floor((r + 1) * ch));
            let sum = 0, n = 0, aSum = 0, rSum = 0, gSum = 0, bSum = 0;
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
                const i = (y * w + x) * 4;
                // Rec. 601 luma. A FLAT MEAN OF R,G,B WOULD MAKE PURE GREEN AND PURE BLUE THE SAME BRIGHTNESS,
                // and SweK's whole palette is green -- the one channel a naive average gets most wrong here.
                sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
                aSum += rgba[i + 3];
                if (color) { rSum += rgba[i]; gSum += rgba[i + 1]; bSum += rgba[i + 2]; }
                n++;
            }
            if (!n) { line += " "; if (color) colorRow.push(null); continue; }
            const alpha = aSum / n / 255;
            if (alphaAsSpace && alpha < 0.15) { line += " "; if (color) colorRow.push(null); continue; }   // a space has no color to show
            let t = (sum / n) / 255;
            if (invert) t = 1 - t;
            const k = Math.min(ramp.length - 1, Math.max(0, Math.round(t * (ramp.length - 1))));
            line += ramp[k];
            if (color) colorRow.push([Math.round(rSum / n), Math.round(gSum / n), Math.round(bSum / n)]);
        }
        out.push(line);
        if (color) colorsOut.push(colorRow);
    }
    const result = { text: out.join("\n"), cols, rows, ramp };
    if (color) result.colors = colorsOut;   // colors[row][col] = [r,g,b], or null where text has a space
    return result;
}

/**
 * An asciify() {color:true} result as HTML for a <pre>'s innerHTML (never textContent -- that would print the
 * tags literally). ONE <span> PER RUN OF SAME-COLORED CELLS, not one per character: adjacent cells sampling the
 * same patch of a lit, roughly-continuous 3D surface overwhelmingly share a color already, and a colored grid
 * this size rebuilt every frame as one span per glyph is thousands of DOM nodes for no reason a run-length pass
 * doesn't remove. Space cells (color === null) are plain text, not a colorless span.
 */
export function toColoredHTML(result) {
    if (!result || !result.colors) throw new TypeError("toColoredHTML needs an asciify() result made with {color:true}");
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const same = (a, b) => (a === null && b === null) || (a && b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);
    const lines = result.text.split("\n");
    return lines.map((line, r) => {
        const rowColors = result.colors[r] || [];
        let html = "", run = "", runColor = null, started = false;
        const flush = () => {
            if (!run) return;
            html += runColor ? `<span style="color:rgb(${runColor[0]},${runColor[1]},${runColor[2]})">${esc(run)}</span>` : esc(run);
            run = "";
        };
        for (let c = 0; c < line.length; c++) {
            const col = rowColors[c] !== undefined ? rowColors[c] : null;
            if (started && !same(col, runColor)) flush();
            runColor = col; started = true;
            run += line[c];
        }
        flush();
        return html;
    }).join("\n");
}

/** The character a given 0..1 luminance maps to -- exposed so a gate can assert the mapping directly. */
export function glyphFor(t, ramp = RAMP) {
    return ramp[Math.min(ramp.length - 1, Math.max(0, Math.round(t * (ramp.length - 1))))];
}
