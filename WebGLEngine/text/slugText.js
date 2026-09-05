// WebGLEngine/text/slugText.js — v3823
// ---------------------------------------------------------------------------------------------------------------
// LAYOUT, AND THE WEBGL2 WIRING, KEPT ON OPPOSITE SIDES OF A LINE.
//
// Everything above the "GL" banner is pure: give it a font and a string and it hands back quads, with no context,
// no canvas and no side effects. That is not tidiness for its own sake. Layout is where the bugs a user actually
// notices live -- a kern pair applied to the wrong side, a line box that grows by the wrong metric, a trailing
// space that shifts a centred line -- and every one of those is a number that slug-selfcheck.mjs can assert
// headless. Below the banner is upload-and-draw, which cannot be checked without a GPU and is therefore kept as
// thin and as boring as it can be made.
//
// *** WHY THE QUAD IS THE TIGHT GLYPH BOX AND NOT A PADDED ONE. *** Coverage extends up to half a pixel outside
// the outline, so a quad cut to the outline would clip its own antialiasing -- the usual fix is to pad the quad by
// a fixed margin in em. Slug does something better and the vertex shader already does it: SlugDilate pushes each
// corner outward along its normal by exactly what a half pixel is worth AT THAT CORNER UNDER THE ACTUAL
// PROJECTION. A fixed em margin is only ever right at one distance and one angle; the dilation is right at all of
// them, which is the entire reason this algorithm is interesting for text lying in a 3D scene rather than pinned
// to the screen. So the quads here are the tight bounds and the padding is left to the shader, and the corner
// NORMALS the dilation needs are the thing this file must not get wrong.
//
// THE THREE-COLUMN MATRIX. The shader multiplies (x, y) only, reading rows of slug_matrix as (m.x, m.y, -, m.w).
// That is not a 2D-only restriction: fold whatever places the text plane in the world into the matrix before
// handing it over, and column 2 simply never has anything to say because the glyph's own z is always zero. Text
// on a wall in perspective works; text bent over a curve does not, because then the em space is not affine in the
// object space and the inverse Jacobian in the vertex stream stops being constant over the quad.
//
// KERNING: GPOS pair positioning first (v4485 -- slugFont.parseGpos, the default script's 'kern' feature), the legacy
// `kern` table when the font has no GPOS kerning. Before v4485 only `kern` was read, and on the vendored IBM Plex Serif
// (GPOS only) kerning was silently ZERO for every label this tree drew. layoutText reports which it got in `kerningSource`, because "my text looks slightly loose" is otherwise an unattributable
// complaint. Full shaping (GSUB ligatures, marks, bidi, Indic reordering) is a separate problem and is not
// pretended at here: this is Latin advance-width layout.
//
// Slug shader algorithm: Copyright 2017 Eric Lengyel, MIT OR Apache-2.0.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

import { packAtlas, packGlyphLoc, packGlyphFlags } from "./slugAtlas.js";
import { slugShaderSource, VERTEX_LAYOUT, VERTEX_STRIDE, SLUG_NOTICE } from "./slugShader.js";

/* ==============================================================================================================
 * LAYOUT -- pure
 * ============================================================================================================ */

/**
 * Lay a string out into positioned glyphs.
 *
 * Returns { glyphs, width, height, lines, kerningSource } where each glyph is
 *   { glyphIndex, codepoint, x, y, size }
 * with (x, y) the pen origin in the caller's units (y up, baseline at y) and `size` the em size.
 *
 * opts: size (em -> units, default 1), lineHeight (multiple of em; default from font metrics),
 *       letterSpacing (em), align ("left" | "center" | "right"), kerning (default true).
 */
export function layoutText(font, text, opts = {}) {
    const size = opts.size === undefined ? 1 : opts.size;
    const letterSpacing = (opts.letterSpacing || 0) * size;
    const kerning = opts.kerning !== false;
    const defaultLineHeight = (font.ascent - font.descent + font.lineGap) || 1.2;
    const lineHeight = (opts.lineHeight === undefined ? defaultLineHeight : opts.lineHeight) * size;
    const align = opts.align || "left";

    const lines = [];
    let current = [];
    let penX = 0;
    let prevGlyph = -1;

    const endLine = () => { lines.push({ glyphs: current, width: penX }); current = []; penX = 0; prevGlyph = -1; };

    for (const ch of text) {                                  // iterating the string yields codepoints, not units
        const cp = ch.codePointAt(0);
        if (cp === 0x0A) { endLine(); continue; }
        if (cp === 0x0D) continue;

        const gi = font.glyphIndex(cp);
        if (kerning && prevGlyph >= 0) penX += font.kern(prevGlyph, gi) * size;

        current.push({ glyphIndex: gi, codepoint: cp, x: penX, y: 0, size });
        penX += font.advance(gi) * size + letterSpacing;
        prevGlyph = gi;
    }
    endLine();

    // Letter spacing after the final glyph of a line is not part of the line's width; leaving it in makes centred
    // text sit half a space to the left of where it should.
    for (const line of lines) if (line.glyphs.length > 0 && letterSpacing !== 0) line.width -= letterSpacing;

    const width = lines.reduce((m, l) => Math.max(m, l.width), 0);

    const glyphs = [];
    lines.forEach((line, i) => {
        const shift = align === "center" ? (width - line.width) / 2 : (align === "right" ? width - line.width : 0);
        const baseline = -i * lineHeight;
        for (const g of line.glyphs) glyphs.push({ ...g, x: g.x + shift, y: baseline });
    });

    return {
        glyphs, width,
        height: lines.length * lineHeight,
        lines: lines.length,
        lineHeight,
        kerningSource: font.kerningSource || (font.hasKernTable ? "kern" : "none")   // v4485: the font says (GPOS | kern | none), see slugFont.parseGpos
    };
}

/**
 * Lengyel's pixel-grid trick, from the Slug README: Slug ignores hinting, but if the em size in device pixels
 * times sCapHeight lands on a whole number, the flat tops and bottoms of capitals fall on pixel boundaries and
 * the text sharpens noticeably. Returns the nearest size at which that holds.
 *
 * Returns `size` unchanged when the font has no sCapHeight, which is the honest answer rather than a guess.
 */
export function snapSizeToCapHeight(size, font, devicePixelRatio = 1) {
    if (!font.capHeight) return size;
    const devicePx = size * devicePixelRatio;
    const caps = devicePx * font.capHeight;
    const snapped = Math.max(1, Math.round(caps)) / font.capHeight;
    return snapped / devicePixelRatio;
}

/**
 * Rows of an orthographic matrix mapping pixel coordinates to clip space, in the (m.x, m.y, -, m.w) form the
 * shader reads. `yDown` matches canvas convention; pass false for a y-up coordinate system.
 */
export function orthoRows(width, height, yDown = true) {
    return new Float32Array([
        2 / width, 0, 0, -1,
        0, yDown ? -2 / height : 2 / height, 0, yDown ? 1 : -1,
        0, 0, 0, 0,
        0, 0, 0, 1
    ]);
}

/**
 * Build the interleaved vertex stream and index list for a set of laid-out glyphs.
 *
 * `entryFor(glyphIndex)` returns the packAtlas record for a glyph. Glyphs with no outline (space) and glyphs the
 * atlas does not contain are skipped rather than drawn empty.
 *
 * The four corner normals are the outward diagonals. They are what SlugDilate expands along, and a zero normal
 * would make normalize() produce NaN and take the whole quad with it -- so a degenerate (zero-area) glyph box is
 * skipped here rather than allowed to reach the shader.
 */
export function buildVertices(glyphs, entryFor, opts = {}) {
    const color = opts.color || [1, 1, 1, 1];
    const evenOdd = !!opts.evenOdd;

    const quads = [];
    for (const g of glyphs) {
        const e = entryFor(g.glyphIndex);
        if (!e || e.empty) continue;
        const bb = e.bbox;
        if (!(bb.x1 > bb.x0) || !(bb.y1 > bb.y0)) continue;
        quads.push({ g, e, bb });
    }

    const vertexCount = quads.length * 4;
    const buffer = new ArrayBuffer(vertexCount * VERTEX_STRIDE);
    const f32 = new Float32Array(buffer);
    const u32 = new Uint32Array(buffer);
    const indices = new Uint32Array(quads.length * 6);

    const FLOATS = VERTEX_STRIDE / 4;                          // 20 slots per vertex
    let v = 0, i = 0;

    for (const { g, e, bb } of quads) {
        const s = g.size;
        const invS = 1 / s;
        const loc = packGlyphLoc(e.loc[0], e.loc[1]);
        const flags = packGlyphFlags(e.bandMax[0], e.bandMax[1], evenOdd);

        // Object-space corners and their em-space counterparts, in the order (0,0) (1,0) (1,1) (0,1).
        const corners = [
            [g.x + bb.x0 * s, g.y + bb.y0 * s, bb.x0, bb.y0, -1, -1],
            [g.x + bb.x1 * s, g.y + bb.y0 * s, bb.x1, bb.y0,  1, -1],
            [g.x + bb.x1 * s, g.y + bb.y1 * s, bb.x1, bb.y1,  1,  1],
            [g.x + bb.x0 * s, g.y + bb.y1 * s, bb.x0, bb.y1, -1,  1]
        ];

        const base = v;
        for (const [px, py, ex, ey, nx, ny] of corners) {
            const o = v * FLOATS;
            f32[o + 0] = px; f32[o + 1] = py; f32[o + 2] = nx; f32[o + 3] = ny;      // aPos
            f32[o + 4] = ex; f32[o + 5] = ey;                                        // aTex
            u32[o + 6] = loc; u32[o + 7] = flags;                                    // aGlyph
            f32[o + 8] = invS; f32[o + 9] = 0; f32[o + 10] = 0; f32[o + 11] = invS;  // aJac
            f32[o + 12] = e.transform[0]; f32[o + 13] = e.transform[1];              // aBnd
            f32[o + 14] = e.transform[2]; f32[o + 15] = e.transform[3];
            f32[o + 16] = color[0]; f32[o + 17] = color[1];                          // aCol
            f32[o + 18] = color[2]; f32[o + 19] = color[3];
            v++;
        }

        indices[i++] = base; indices[i++] = base + 1; indices[i++] = base + 2;
        indices[i++] = base; indices[i++] = base + 2; indices[i++] = base + 3;
    }

    return { buffer, indices, vertexCount, quadCount: quads.length };
}

/* ==============================================================================================================
 * GL
 * ============================================================================================================ */

function compile(gl, type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw new Error("slugText: shader compile failed: " + log);
    }
    return s;
}

/**
 * A font uploaded to the GPU plus the program that draws it.
 *
 * The atlas is built once for a fixed character set. Adding characters later means repacking, because the whole
 * layout is a single linear allocation -- which is the trade Slug's addressing rules impose and is why the
 * constructor asks for the character set up front rather than faulting glyphs in.
 */
export class SlugFontGPU {
    /**
     * @param gl WebGL2 context
     * @param font a slugFont.parseFont result
     * @param chars a string of every character to include
     * @param opts { format: "16f"|"32f", evenOdd, weight, maxBands }
     */
    constructor(gl, font, chars, opts = {}) {
        if (!gl || typeof gl.texStorage2D !== "function") throw new Error("slugText: a WebGL2 context is required");
        this.gl = gl;
        this.font = font;
        this.opts = opts;

        // The reference hardcodes a 4096 texel width. WebGL2 only guarantees 2048, so take the largest power of
        // two the context actually supports, and compile the shader for THAT -- CalcBandLoc's row wrap uses it.
        const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        const logWidth = Math.min(12, Math.floor(Math.log2(maxSize)));
        if (logWidth < 8) throw new Error("slugText: MAX_TEXTURE_SIZE of " + maxSize + " is too small for a glyph atlas");

        // One entry per distinct glyph index, so 'a' appearing twice costs nothing and 'A'/'Α' sharing a glyph
        // (they do not, but ligature-mapped characters can) costs one.
        const wanted = new Map();
        for (const ch of chars) {
            const gi = font.glyphIndex(ch.codePointAt(0));
            if (!wanted.has(gi)) wanted.set(gi, font.outline(gi).contours);
        }
        const list = [...wanted].map(([gi, contours]) => ({ key: gi, contours }));

        this.atlas = packAtlas(list, { ...opts, logWidth });
        this.logWidth = logWidth;

        const src = slugShaderSource(logWidth, { evenOdd: opts.evenOdd, weight: opts.weight });
        this.program = gl.createProgram();
        const vs = compile(gl, gl.VERTEX_SHADER, src.vertex);
        const fs = compile(gl, gl.FRAGMENT_SHADER, src.fragment);
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(this.program);
            throw new Error("slugText: program link failed: " + log);
        }
        gl.deleteShader(vs);
        gl.deleteShader(fs);

        this.uMatrix = gl.getUniformLocation(this.program, "slug_matrix");
        this.uViewport = gl.getUniformLocation(this.program, "slug_viewport");
        this.uCurve = gl.getUniformLocation(this.program, "curveTexture");
        this.uBand = gl.getUniformLocation(this.program, "bandTexture");

        this._uploadTextures();
        this.notice = SLUG_NOTICE;
    }

    _uploadTextures() {
        const gl = this.gl, a = this.atlas;

        this.curveTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.curveTexture);
        if (a.format === "32f") {
            gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, a.width, a.curveTexels);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, a.width, a.curveTexels, gl.RGBA, gl.FLOAT, a.curveData);
        } else {
            gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, a.width, a.curveTexels);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, a.width, a.curveTexels, gl.RGBA, gl.HALF_FLOAT, a.curveData);
        }
        // NEAREST is not a quality choice: every read is a texelFetch, and a filtered read of control points
        // would blend two unrelated curves into a shape that is in neither.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        this.bandTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.bandTexture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG16UI, a.width, a.bandTexels);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, a.width, a.bandTexels, gl.RG_INTEGER, gl.UNSIGNED_SHORT, a.bandData);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    /** Bytes of GPU memory the two textures occupy. Text is usually the cheapest thing in a frame; prove it. */
    get byteSize() {
        const a = this.atlas;
        const curveBytes = a.width * a.curveTexels * 4 * (a.format === "32f" ? 4 : 2);
        return curveBytes + a.width * a.bandTexels * 2 * 2;
    }

    entryFor(glyphIndex) { return this.atlas.glyphs.get(glyphIndex); }

    destroy() {
        const gl = this.gl;
        gl.deleteTexture(this.curveTexture);
        gl.deleteTexture(this.bandTexture);
        gl.deleteProgram(this.program);
    }
}

/** One drawable batch of text: a VAO plus the buffers behind it. Rebuild by calling set() again. */
export class SlugTextBatch {
    constructor(fontGPU) {
        this.fontGPU = fontGPU;
        const gl = this.gl = fontGPU.gl;
        this.vao = gl.createVertexArray();
        this.vbo = gl.createBuffer();
        this.ibo = gl.createBuffer();
        this.indexCount = 0;

        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        for (const a of VERTEX_LAYOUT) {
            gl.enableVertexAttribArray(a.location);
            // The glyph words take the INTEGER path. Sent through vertexAttribPointer instead they would be
            // converted to float and back, which silently mangles any location above 2^24.
            if (a.integer) gl.vertexAttribIPointer(a.location, a.size, gl.UNSIGNED_INT, VERTEX_STRIDE, a.offset);
            else gl.vertexAttribPointer(a.location, a.size, gl.FLOAT, false, VERTEX_STRIDE, a.offset);
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
        gl.bindVertexArray(null);
    }

    /** Lay out `text` and upload it. opts pass through to layoutText and buildVertices. */
    set(text, opts = {}) {
        const font = this.fontGPU.font;
        const laid = layoutText(font, text, opts);
        const built = buildVertices(laid.glyphs, (gi) => this.fontGPU.entryFor(gi), opts);
        const gl = this.gl;

        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, built.buffer, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, built.indices, gl.DYNAMIC_DRAW);
        gl.bindVertexArray(null);

        this.indexCount = built.indices.length;
        this.layout = laid;
        return laid;
    }

    /**
     * Draw. `matrixRows` is 16 floats -- four rows, each read as (m.x, m.y, -, m.w); orthoRows() builds the
     * screen-space case. `viewport` is [width, height] in pixels, which the dilation needs to know how big a
     * pixel is.
     *
     * Blending is premultiplied because the fragment shader outputs colour times coverage. The caller's blend
     * state is set here and NOT restored, in keeping with how the rest of the engine's passes behave.
     */
    draw(matrixRows, viewport) {
        if (this.indexCount === 0) return;
        const gl = this.gl, f = this.fontGPU;

        gl.useProgram(f.program);
        gl.uniform4fv(f.uMatrix, matrixRows);
        gl.uniform2f(f.uViewport, viewport[0], viewport[1]);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, f.curveTexture);
        gl.uniform1i(f.uCurve, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, f.bandTexture);
        gl.uniform1i(f.uBand, 1);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.DEPTH_TEST);

        gl.bindVertexArray(this.vao);
        gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
        gl.activeTexture(gl.TEXTURE0);
    }

    destroy() {
        const gl = this.gl;
        gl.deleteVertexArray(this.vao);
        gl.deleteBuffer(this.vbo);
        gl.deleteBuffer(this.ibo);
    }
}
