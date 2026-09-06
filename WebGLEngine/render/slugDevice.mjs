// WebGLEngine/render/slugDevice.mjs -- v4460
// ---------------------------------------------------------------------------------------------------------------
// SLUG TEXT THROUGH gfx/device.js: ONE BATCH, EITHER BACKEND.
//
// text/slugText.js draws Slug text on a raw WebGL2 context and nowhere else; it owns its VAO, its two textures and
// its blend state, and ev/esShipLabels.js has to give it a SEPARATE overlay canvas so that state cannot stomp
// three's. This module is the same text on the device abstraction instead: the atlas goes up as the device's
// rgba16float and rg16uint textures (v4459), the shader pair is text/slugShaderWgsl.js beside text/slugShader.js's
// GLSL, blend is the descriptor's `premultiplied` word (v4458), and a pass owns its state, so the batch draws
// inside any frame the device draws -- on WebGPU where the page has it and on WebGL2 where it does not.
//
// *** THE GLSL'S UNIFORM NAMES ARE REWRITTEN, ONCE, HERE, AND THE REWRITE IS COUNTED. *** The device sets a
// uniform by ONE name on both backends. text/slugShader.js declares `uniform vec4 slug_matrix[4]` and
// `slug_viewport`, the reference's names, because that file's value is a line-for-line diff against the HLSL; the
// WGSL twin declares a struct with fields m0..m3 and viewport, because the device packs a struct from a list of
// scalar and vector fields and has no array element. So the GLSL is transplanted: the array becomes four vec4
// uniforms named as the struct's fields, every `slug_matrix[i]` becomes `mi`, and glslForDevice() refuses by name
// if the count of replacements is not exactly what the reference text carries (four declarations' worth of reads
// in the vertex stage plus the declaration). A rewrite that silently matched nothing would compile and draw with
// a zero matrix -- nothing on screen, no error -- which is the failure this tree names most often.
//
// WHAT THE DEVICE STILL DECIDES: the atlas width. The reference hardcodes 4096; WebGL2 guarantees only 2048 and
// WebGPU guarantees 8192, so the width is read from the backend (gl.MAX_TEXTURE_SIZE on WebGL2, 4096 on WebGPU)
// and the shader is compiled for THAT, as slugText.js does -- CalcBandLoc's row wrap depends on it.
//
// NOT DONE HERE, AND SAID: the "32f" atlas format (the device carries rgba16float and Slug specifies 16f; a
// selfcheck wanting 32f uses text/slugEval.js), and buffer reuse across set() calls -- each set() makes fresh
// device buffers and destroys the old ones, which task 12 measures before anything cleverer is built.
//
// Slug shader code: Copyright 2017 Eric Lengyel, MIT OR Apache-2.0 -- SLUG_NOTICE is re-exported for the page.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

import { packAtlas } from "../text/slugAtlas.js";
import { slugShaderSource, VERTEX_LAYOUT, VERTEX_STRIDE, SLUG_NOTICE } from "../text/slugShader.js";
import { slugShaderWgsl, SLUG_TEXTURE_FORMATS } from "../text/slugShaderWgsl.js";
import { layoutText, buildVertices, orthoRows } from "../text/slugText.js";

export { SLUG_NOTICE, orthoRows };

/** The uniform list, in the WGSL struct's order -- gfx/device.js packs the buffer from this and checks it against the struct. */
export const SLUG_UNIFORMS = Object.freeze([
    { name: "m0", type: "vec4" }, { name: "m1", type: "vec4" }, { name: "m2", type: "vec4" }, { name: "m3", type: "vec4" },
    { name: "viewport", type: "vec2" },
]);

/**
 * The GLSL pair with its uniforms renamed to the struct's fields. Returns { vertex, fragment, replaced } and
 * throws if the reference text did not carry exactly the reads the rewrite expects.
 */
export function glslForDevice(logWidth, defines = {}) {
    const src = slugShaderSource(logWidth, defines);
    let vertex = src.vertex, replaced = 0;
    const swap = (from, to) => { const n = vertex.split(from).length - 1; vertex = vertex.split(from).join(to); replaced += n; return n; };
    const decl = swap("uniform vec4 slug_matrix[4];", "uniform vec4 m0; uniform vec4 m1; uniform vec4 m2; uniform vec4 m3;");
    const reads = [0, 1, 2, 3].map((i) => swap(`slug_matrix[${i}]`, `m${i}`));
    const vp = swap("slug_viewport", "viewport");
    // The reference reads rows 0, 1 and 3 once each in SlugDilate's call and every row three times (.x, .y, .w) in the
    // projection: 4 / 4 / 3 / 4 reads of slug_matrix[0..3] as written in text/slugShader.js, and slug_viewport once
    // plus its declaration. Any other count means that file changed shape. *** THE FIRST DRAFT EXPECTED 4/4/2/4 AND
    // THIS CHECK REFUSED IT ON ITS FIRST RUN *** -- row 2 is read three times like the others; I had miscounted, and
    // a rewrite trusted on a miscount would have been trusted on nothing.
    const expect = { decl: 1, reads: [4, 4, 3, 4], vp: 2 };
    const okShape = decl === expect.decl && reads.every((r, i) => r === expect.reads[i]) && vp === expect.vp;
    if (!okShape) throw new Error(`slugDevice: the GLSL uniform rewrite found decl ${decl}, reads ${reads.join("/")}, viewport ${vp} -- expected ` +
        `${expect.decl}, ${expect.reads.join("/")}, ${expect.vp}. text/slugShader.js changed shape; read it before trusting this transplant.`);
    return { vertex, fragment: src.fragment, replaced };
}

/** The vertex buffer layout for the device, derived from slugShader.VERTEX_LAYOUT (the same rule as VERTEX_FORMATS). */
export function slugVertexBuffers() {
    return [{ stride: VERTEX_STRIDE, stepMode: "vertex",
              attributes: VERTEX_LAYOUT.map((a) => ({ name: a.name, size: a.size, offset: a.offset, location: a.location,
                                                        ...(a.type === "uint" ? { format: "uint32x" + a.size } : {}) })) }];
}

/** The pipeline descriptor: both languages, the six attributes, the five uniforms, premultiplied blend, no depth. */
export function slugPipelineDesc(logWidth, defines = {}) {
    const glsl = glslForDevice(logWidth, defines);
    return {
        shaders: { wgsl: slugShaderWgsl(logWidth, defines).wgsl, glsl: { vertex: glsl.vertex, fragment: glsl.fragment } },
        vs: "vs", fs: "fs",
        buffers: slugVertexBuffers(),
        // v4500 (task 47): under defines.fill the uniform list gains fillRect, matching the struct the WGSL declares
        uniforms: SLUG_UNIFORMS.map((u) => ({ ...u })).concat(defines.fill ? [{ name: "fillRect", type: "vec4" }] : []),
        fill: !!defines.fill,
        blend: "premultiplied",
        depthWrite: false, depthCompare: "always",   // text is an overlay: it neither reads nor writes the scene's depth
    };
}

/**
 * DIAGNOSTIC VARIANTS, for gates: the same pipeline with the fragment's tail replaced by one that writes the f32
 * BITS of one of its inputs as four bytes (blend off), so a gate can read what the rasteriser actually handed the
 * fragment -- its texcoord and its fwidth -- rather than assume it. `which` is one of tx, ty, fwx, fwy. The
 * replacement is asserted to have applied in BOTH languages, and the two atlas textures are kept referenced in
 * the WGSL: with layout "auto" a declared-but-unread binding is dropped from the layout, gfx/device.js still
 * binds it from the declaration, and the frame is silently blank (v4460's finding; task 22 is the device-side fix).
 */
export const CAPTURE_INPUTS = Object.freeze({
    tx: ["in.texcoord.x", "vTexcoord.x"], ty: ["in.texcoord.y", "vTexcoord.y"],
    fwx: ["fwidth(in.texcoord).x", "fwidth(vTexcoord).x"], fwy: ["fwidth(in.texcoord).y", "fwidth(vTexcoord).y"],
});
const WGSL_FS_TAIL = /let coverage = SlugRender\(in\.texcoord, fwidth\(in\.texcoord\), in\.banding, in\.glyph\);\s*\/\/[^\n]*\n\s*return in\.color \* coverage;/;
const GLSL_FS_TAIL = /float coverage = SlugRender\(vTexcoord, vBanding, vGlyph\);\s*fragColor = vColor \* coverage;/;
export function slugCaptureDesc(logWidth, which) {
    const pair = CAPTURE_INPUTS[which];
    if (!pair) throw new Error("slugDevice: capture input must be one of " + Object.keys(CAPTURE_INPUTS).join(", "));
    const d = slugPipelineDesc(logWidth);
    d.blend = "none";
    const keep = " _ = textureLoad(curveTexture, vec2i(0, 0), 0); _ = textureLoad(bandTexture, vec2i(0, 0), 0);";
    const w2 = d.shaders.wgsl.replace(WGSL_FS_TAIL, "let bits = bitcast<u32>(" + pair[0] + ");" + keep + " return vec4f(f32(bits & 0xFFu), f32((bits >> 8u) & 0xFFu), f32((bits >> 16u) & 0xFFu), f32(bits >> 24u)) / 255.0;");
    const g2 = d.shaders.glsl.fragment.replace(GLSL_FS_TAIL, "uint bits = floatBitsToUint(" + pair[1] + "); fragColor = vec4(float(bits & 0xFFu), float((bits >> 8u) & 0xFFu), float((bits >> 16u) & 0xFFu), float(bits >> 24u)) / 255.0;");
    if (w2 === d.shaders.wgsl || g2 === d.shaders.glsl.fragment) throw new Error("slugDevice: the capture replacement did not apply in " + (w2 === d.shaders.wgsl ? "WGSL" : "GLSL") + " -- the shipped fragment tail changed shape");
    d.shaders.wgsl = w2; d.shaders.glsl.fragment = g2;
    return d;
}

/** The atlas width the backend can carry: 4096 as the reference, or what MAX_TEXTURE_SIZE allows on WebGL2. */
export function logWidthFor(device) {
    if (device && device.backend === "webgl2" && device.gl) {
        const max = device.gl.getParameter(device.gl.MAX_TEXTURE_SIZE);
        const lw = Math.min(12, Math.floor(Math.log2(max)));
        if (lw < 8) throw new Error("slugDevice: MAX_TEXTURE_SIZE of " + max + " is too small for a glyph atlas");
        return lw;
    }
    return 12;
}

/** A font packed for the device: two textures and one pipeline. */
export class SlugFontDevice {
    /**
     * @param device a gfx/device.js device (any backend; the null one records)
     * @param font a slugFont.parseFont result
     * @param chars a string of every character to include
     * @param opts { evenOdd, weight, maxBands, logWidth }
     */
    constructor(device, font, chars, opts = {}) {
        if (!device || typeof device.texture !== "function" || typeof device.pipeline !== "function") throw new Error("slugDevice: a gfx/device.js device is required");
        if (opts.format && opts.format !== "16f") throw new Error("slugDevice: the device carries rgba16float only; the 32f atlas is for text/slugEval.js");
        this.device = device;
        this.font = font;
        this.opts = opts;
        this.logWidth = opts.logWidth || logWidthFor(device);

        const wanted = new Map();
        for (const ch of chars) {
            const gi = font.glyphIndex(ch.codePointAt(0));
            if (!wanted.has(gi)) wanted.set(gi, font.outline(gi).contours);
        }
        const list = [...wanted].map(([gi, contours]) => ({ key: gi, contours }));
        this.atlas = packAtlas(list, { format: "16f", maxBands: opts.maxBands, epsilon: opts.epsilon, logWidth: this.logWidth });

        const a = this.atlas;
        this.curveTexture = device.texture({ format: SLUG_TEXTURE_FORMATS.curve, width: a.width, height: a.curveTexels, data: a.curveData, nearest: true });
        this.bandTexture = device.texture({ format: SLUG_TEXTURE_FORMATS.band, width: a.width, height: a.bandTexels, data: a.bandData, nearest: true });
        this.desc = slugPipelineDesc(this.logWidth, { evenOdd: opts.evenOdd, weight: opts.weight, fill: opts.fill });
        this.pipeline = device.pipeline(this.desc);
        this.notice = SLUG_NOTICE;
    }

    /**
     * v4487 -- FROM A PACK, NO PARSE: text/slugPack.mjs decodePack's { font, atlas } become the textures and the pipeline directly.
     * The pack was baked at logWidth 12; a device that cannot carry a 4096-wide texture is refused by name rather than handed an
     * atlas whose band rows wrap at a width its shader was not compiled for (text/slugAtlas.js's rule 1, the v3823 plant).
     */
    /**
     * v4498 (task 44): a font device over an atlas packed by the caller -- one morphed glyph a frame, from render/slugMorph.mjs's
     * packMorphed. `opts.pipeline` reuses a pipeline built once (a pipeline a frame would be the cost, not the textures); the two
     * textures are created here and the caller destroys the previous frame's device. `font` is kept for layout metrics.
     */
    static fromAtlas(device, font, atlas, opts = {}) {
        if (!device || typeof device.texture !== "function" || typeof device.pipeline !== "function") throw new Error("slugDevice: a gfx/device.js device is required");
        if (!atlas || !atlas.glyphs || !atlas.curveData) throw new Error("slugDevice: fromAtlas needs a packAtlas result");
        const lw = logWidthFor(device);
        if (atlas.logWidth > lw) throw new Error(`slugDevice: the atlas was packed at width ${1 << atlas.logWidth} and this device carries ${1 << lw} at most`);
        const self = Object.create(SlugFontDevice.prototype);
        self.device = device; self.font = font; self.opts = opts; self.logWidth = atlas.logWidth; self.atlas = atlas; self.packed = false;
        self.curveTexture = device.texture({ format: SLUG_TEXTURE_FORMATS.curve, width: atlas.width, height: atlas.curveTexels, data: atlas.curveData, nearest: true });
        self.bandTexture = device.texture({ format: SLUG_TEXTURE_FORMATS.band, width: atlas.width, height: atlas.bandTexels, data: atlas.bandData, nearest: true });
        if (opts.pipeline) { self.pipeline = opts.pipeline; self.desc = opts.desc || null; self.sharedPipeline = true; }
        else { self.desc = slugPipelineDesc(self.logWidth, { evenOdd: opts.evenOdd, weight: opts.weight, fill: opts.fill }); self.pipeline = device.pipeline(self.desc); }
        self.notice = SLUG_NOTICE;
        return self;
    }

    static fromPack(device, pack, opts = {}) {
        if (!device || typeof device.texture !== "function" || typeof device.pipeline !== "function") throw new Error("slugDevice: a gfx/device.js device is required");
        if (!pack || !pack.atlas || !pack.font || !pack.font.packed) throw new Error("slugDevice: fromPack needs a decoded slug pack ({ font, atlas } from text/slugPack.mjs decodePack)");
        const lw = logWidthFor(device);
        if (pack.atlas.logWidth > lw) throw new Error(`slugDevice: the pack was baked at width ${1 << pack.atlas.logWidth} and this device carries ${1 << lw} at most; pack it narrower or parse the TrueType here`);
        const self = Object.create(SlugFontDevice.prototype);
        self.device = device; self.font = pack.font; self.opts = opts; self.logWidth = pack.atlas.logWidth; self.atlas = pack.atlas; self.packed = true;
        const a = pack.atlas;
        self.curveTexture = device.texture({ format: SLUG_TEXTURE_FORMATS.curve, width: a.width, height: a.curveTexels, data: a.curveData, nearest: true });
        self.bandTexture = device.texture({ format: SLUG_TEXTURE_FORMATS.band, width: a.width, height: a.bandTexels, data: a.bandData, nearest: true });
        self.desc = slugPipelineDesc(self.logWidth, { evenOdd: opts.evenOdd, weight: opts.weight });
        self.pipeline = device.pipeline(self.desc);
        self.notice = SLUG_NOTICE;
        return self;
    }

    /** Bytes the two textures occupy, the same arithmetic as slugText.SlugFontGPU.byteSize. */
    get byteSize() { const a = this.atlas; return a.width * a.curveTexels * 8 + a.width * a.bandTexels * 4; }

    entryFor(glyphIndex) { return this.atlas.glyphs.get(glyphIndex); }

    destroy() { this.curveTexture.destroy(); this.bandTexture.destroy(); }
}

/** One drawable batch of text on the device. set() lays out and uploads; draw() issues it inside a pass. */
export class SlugDeviceBatch {
    constructor(fontDevice) {
        this.fontDevice = fontDevice;
        this.device = fontDevice.device;
        this.vb = null; this.ib = null;
        this.indexCount = 0;
        this.layout = null;
        this.quads = 0;
    }

    /** Lay out `text` and upload it. opts pass through to layoutText and buildVertices. Returns the layout. */
    set(text, opts = {}) {
        const f = this.fontDevice;
        const laid = layoutText(f.font, text, opts);
        const built = buildVertices(laid.glyphs, (gi) => f.entryFor(gi), opts);
        this._upload(built, laid);
        return laid;
    }

    /**
     * v4493 (task 12): REUSE THE BUFFERS WHEN THE NEW STREAM FITS. Before, every set() destroyed both buffers and
     * created two more -- ev/esShipLabels.js and orrery-gpu.html call set() on every label every frame, so 24 labels
     * were 48 buffer creations a frame. A write into an existing buffer is ordered by the queue behind the commands
     * already submitted (queue.writeBuffer on WebGPU, bufferSubData on WebGL2), so a batch drawn last frame may be
     * rewritten this frame with no fence; that is the ordering the plan's ring buffer lacked. Growth reallocates.
     * `stats` counts sets, allocations and bytes written, so a gate can hold "no allocation once warm".
     */
    _upload(built, laid) {
        this.indexCount = built.indices.length;
        this.quads = built.quadCount;
        this.layout = laid;
        this.built = built;
        const st = this.stats || (this.stats = { sets: 0, allocations: 0, bytes: 0 });
        st.sets++;
        if (!this.indexCount) return;
        const vdata = new Float32Array(built.buffer), vBytes = vdata.byteLength, iBytes = built.indices.byteLength;
        if (this.vb && this.ib && vBytes <= this.vb.size && iBytes <= this.ib.size) {
            // The index stream is STRUCTURAL: quad k is always 4k+{0,1,2, 0,2,3} (buildVertices and buildCurvedVertices both), so
            // the indices written for N quads are the first 6M of any M <= N quads. A reuse never needs to write them (found by
            // v4493's sabotage D: skipping the index write was invisible, because it was a write of the same bytes).
            this.vb.write(vdata);
            st.bytes += vBytes;
        } else {
            if (this.vb) { this.vb.destroy(); this.ib.destroy(); this.vb = this.ib = null; }
            this.vb = this.device.buffer({ usage: "vertex", data: vdata });
            this.ib = this.device.buffer({ usage: "index", data: built.indices });
            st.allocations += 2;
            st.bytes += vBytes + iBytes;
        }
    }

    /**
     * Upload a vertex stream somebody else built in text/slugShader.js's VERTEX_LAYOUT -- text/slugCurve.mjs
     * buildCurvedVertices, for one. `built` is { buffer, indices, quadCount }; `layout` is recorded as given.
     */
    setBuilt(built, layout = null) {
        if (!built || !(built.buffer instanceof ArrayBuffer) || !(built.indices instanceof Uint32Array)) throw new Error("slugDevice: setBuilt wants { buffer: ArrayBuffer, indices: Uint32Array }");
        this._upload(built, layout);
        return layout;
    }

    /**
     * Draw inside a device pass. `matrixRows` is 16 floats -- four rows, each read as (m.x, m.y, -, m.w);
     * orthoRows() builds the screen-space case. `viewport` is [width, height] in pixels.
     */
    draw(pass, matrixRows, viewport, fill = null) {
        if (!this.indexCount) return;
        const f = this.fontDevice;
        // v4500 (task 47): a fill is { texture, rect: [x0, y0, x1, y1] em }, and the pipeline must have been built with fill: true --
        // each refused by name: a fill on a pipeline without one, a fill pipeline drawn without one
        const hasFill = !!(f.desc && f.desc.fill);
        if (fill && !hasFill) throw new Error("slugDevice: draw() was given a fill but this font device's pipeline was built without one -- pass { fill: true } to SlugFontDevice");
        if (!fill && hasFill) throw new Error("slugDevice: this font device's pipeline was built with a fill and draw() was given none -- pass { texture, rect }");
        pass.use(f.pipeline);
        for (let i = 0; i < 4; i++) pass.uniform("m" + i, matrixRows.subarray ? matrixRows.subarray(i * 4, i * 4 + 4) : matrixRows.slice(i * 4, i * 4 + 4));
        pass.uniform("viewport", [viewport[0], viewport[1]]);
        pass.texture("curveTexture", f.curveTexture, 0);
        pass.texture("bandTexture", f.bandTexture, 1);
        if (fill) { pass.uniform("fillRect", fill.rect); pass.texture("fillTexture", fill.texture, 2); }
        pass.vertices(this.vb);
        pass.indices(this.ib);
        pass.drawIndexed(this.indexCount);
    }

    destroy() { if (this.vb) { this.vb.destroy(); this.ib.destroy(); } this.vb = this.ib = null; this.indexCount = 0; }
}
