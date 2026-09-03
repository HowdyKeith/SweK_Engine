// gfx/device.js -- SweK's unified WebGL2 / WebGPU device (the MUGL idea, kept in-house). One WebGPU-shaped API that
// both backends implement, so a demo writes its render ONCE and runs on either runtime: requestDevice() picks WebGPU
// when it's available and falls back to WebGL2, and a `null` backend records operations so the abstraction's control
// flow is verifiable headless (the real GPU draws are rig-only). Shaders are inherently backend-specific, so a pipeline
// carries both { wgsl } and { glsl } and each backend takes its own; everything else -- buffers, pipelines, passes,
// draws -- is unified.
//
// ---- v4299 (Level 11) -- LEVEL 11: THE WebGPU BACKEND BINDS TEXTURES, AND THE DEVICE CAN BE DRIVEN FROM THE GPU ----------------
//
// Until this round pass.texture() on WebGPU THREW BY NAME (v4273 made it refuse; before that it was `() => {}` and
// silently drew the frame without its source). The orrery's post stage, this module's first non-demo consumer, was
// therefore pinned to WebGL2. Bindings are now DERIVED FROM THE SHADER: render/wgslSpec.mjs parses every
// `@group(0) @binding(N) var name: texture_2d<f32>` / `sampler` / `var<storage>` / `var<uniform>` out of the WGSL at
// pipeline creation, and the bind group is assembled from what the pass bound BY NAME. A texture the shader declares
// and nothing bound is refused with the name and the binding number, not drawn black.
//
// The same round adds what GPU-driven rendering needs and nothing else: buffers with a declared USAGE (vertex, index,
// storage, indirect, uniform), compute pipelines, a dispatch that runs BEFORE the frame's render pass, an index
// buffer, an instance-stepped second vertex buffer, drawIndexed, and drawIndexedIndirect (v4339 adds
// dispatchWorkgroupsIndirect, so a pass can size the next one without a readback). WebGL2 has no compute and
// no indirect draw, so on that backend those two REFUSE BY NAME and point at the CPU twin in render/gpuDriven.mjs,
// which produces the same per-LOD instance records the compute shader does. Everything else -- index buffers,
// instancing, drawIndexed -- WebGL2 does natively, so a GPU-driven scene draws on both.
"use strict";

import { checkHostUniforms } from "../render/wgslLayout.mjs";
import { parseBindings } from "../render/wgslSpec.mjs";


// std140-ish uniform layout: compute each uniform's byte offset + the total (padded to 16) so the WebGPU backend can
// pack a single uniform buffer. sizes/alignments: f32 4/4, vec2 8/8, vec3 12/16, vec4 16/16, mat4 64/16.
// *** THE SIZE HERE IS THE UNIFORM-ADDRESS-SPACE SIZE, AND NOTHING SAID SO UNTIL v4278. ***
// `Math.max(16, ...)` is not a defensive minimum -- it is WGSL's rule that a struct in the uniform space is
// aligned to RoundUp(16, its natural alignment). render/wgslLayout.mjs computes the same number from the
// shader text and agrees with this function exactly; it returns 24 for badTvWgsl's six-f32 struct under the
// STORAGE rule and 32 under this one. Two files, two right answers, to a question neither had named.
function _uniformLayout(uniforms) {
    const SZ = { f32: 4, vec2: 8, vec3: 12, vec4: 16, mat4: 64 }, AL = { f32: 4, vec2: 8, vec3: 16, vec4: 16, mat4: 16 };
    let off = 0; const offsets = {};
    for (const u of uniforms || []) { const a = AL[u.type] || 4, z = SZ[u.type] || 4; off = Math.ceil(off / a) * a; offsets[u.name] = off; off += z; }
    return { offsets, size: Math.max(16, Math.ceil(off / 16) * 16) };
}

/** Buffer usages a caller may declare. The names are the contract; each backend maps them to its own flags. */
const BUFFER_USAGES = Object.freeze(["vertex", "index", "storage", "indirect", "uniform"]);
function _usageList(u) {
    const list = u == null ? ["vertex"] : (Array.isArray(u) ? u : [u]);
    for (const x of list) if (!BUFFER_USAGES.includes(x))
        throw new Error(`gfx/device: unknown buffer usage ${JSON.stringify(x)} -- one of ${BUFFER_USAGES.join(", ")}`);
    return list;
}

/**
 * Vertex-buffer layouts, one per slot. The legacy single-buffer form `{ attributes, stride }` is slot 0; the
 * Level 11 form `buffers: [{ stride, stepMode, attributes }]` declares several, and `stepMode: "instance"` is what a
 * GPU-driven draw needs -- one record per instance, advanced per instance rather than per vertex.
 * Attribute formats: float32xN (default from `size`) or uint32 / uint32xN for integer attributes.
 */
function _vertexLayouts(d) {
    if (Array.isArray(d.buffers)) return d.buffers.map((b) => ({ stride: b.stride || 0, stepMode: b.stepMode || "vertex", attributes: b.attributes || [] }));
    return [{ stride: d.stride || 0, stepMode: "vertex", attributes: d.attributes || [] }];
}
function _attrFormat(a) { return a.wgpuFormat || a.format || ("float32x" + a.size); }

function detectBackends() {
    const out = { webgpu: false, webgl2: false };
    try { out.webgpu = (typeof navigator !== "undefined" && !!navigator.gpu); } catch (e) {}
    try { out.webgl2 = (typeof document !== "undefined" && !!document.createElement("canvas").getContext("webgl2")); } catch (e) {}
    return out;
}

/** The refusal every backend without a feature gives: the same words, so a gate can match one phrase. */
function _refuse(backend, what, instead) {
    return new Error(`gfx/device: the ${backend} backend has no ${what}, so it cannot be honoured here. ${instead}`);
}
const CPU_TWIN = "render/gpuDriven.mjs cullLodCpu() produces the same per-LOD instance records on the CPU; draw them with pass.instances() + pass.drawIndexed().";

// --- null backend: implements the full interface, records the op stream. Used for tests + as a headless fallback. ----
function nullBackend(opts = {}) {
    const ops = [];
    const dev = {
        backend: "null", ops,
        buffer: (d) => { const usage = _usageList(d.usage); const data = d.data ? d.data.slice() : null;
            return { __buf: true, usage, count: (d.data && d.data.length) || 0, size: d.data ? d.data.byteLength : (d.size || 0), data,
                     write: (v, off = 0) => { ops.push(["write", usage[0], off]); if (data && v && v.byteLength) new Uint8Array(data.buffer, data.byteOffset).set(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), off); },
                     destroy: () => ops.push(["destroyBuffer"]) }; },
        read: async (b) => (b && b.data) ? b.data.buffer.slice(b.data.byteOffset, b.data.byteOffset + b.data.byteLength) : new ArrayBuffer(0),
        pipeline: (d) => ({ __pipe: true, attributes: d.attributes || [], stride: d.stride || 0, layouts: _vertexLayouts(d), topology: d.topology || "triangle-list",
                            bindings: (d.shaders && typeof d.shaders.wgsl === "string") ? parseBindings(d.shaders.wgsl) : [] }),
        compute: (d) => ({ __compute: true, bindings: typeof d.wgsl === "string" ? parseBindings(d.wgsl) : [], _bound: {},
                           bind: function (n, b) { this._bound[n] = b; ops.push(["bind", n, !!(b && b.__buf)]); return this; },
                           bindTexture: function (n, t) { this._bound[n] = t; ops.push(["bindTexture", n, !!(t && t.__tex)]); return this; } }),
        depthTexture: () => null,
        texture: (d) => ({ __tex: true, w: d.width || (d.source && d.source.width) || 0, h: d.height || (d.source && d.source.height) || 0,
                           nearest: !!d.nearest, render: !!d.render, update: () => ops.push(["updateTexture"]), destroy: () => ops.push(["destroyTexture"]) }),
        frame: (fn, o) => {
            let cleared = false;
            const pass = {
                dispatch: (c, wg) => { if (cleared) throw new Error("gfx/device: dispatch() must come before pass.clear() -- compute work runs before the frame's render pass"); ops.push(["dispatch", c && c.__compute ? "compute" : "?", wg]); },
                clear: (c) => { cleared = true; ops.push(["clear", c]); }, begin: () => { cleared = true; ops.push(["begin"]); }, use: (p) => ops.push(["use", p && p.__pipe ? "pipe" : "?"]),
                vertices: (b, slot = 0) => ops.push(["vertices", !!(b && b.__buf), slot]), instances: (b, off = 0) => ops.push(["instances", !!(b && b.__buf), off]),
                indices: (b) => ops.push(["indices", !!(b && b.__buf)]), uniform: (n) => ops.push(["uniform", n]), texture: (n) => ops.push(["texture", n]),
                storage: (n) => ops.push(["storage", n]), draw: (n, inst = 1) => ops.push(["draw", n, inst]),
                drawIndexed: (n, inst = 1, first = 0) => ops.push(["drawIndexed", n, inst, first]),
                dispatchIndirect: (c, b, off = 0) => { if (cleared) throw new Error("gfx/device: dispatchIndirect() must come before pass.clear() -- compute work runs before the frame's render pass"); ops.push(["dispatchIndirect", c && c.__compute ? "compute" : "?", !!(b && b.__buf), off]); },
                drawIndexedIndirect: (b, off = 0) => ops.push(["drawIndexedIndirect", !!(b && b.__buf), off]) };
            fn({ pass, device: dev }); ops.push(["submit"]);
            if (o && o.read) return Promise.resolve({ pixels: null, width: 0, height: 0, backend: "null" }); },
        destroy: () => {}
    };
    return dev;
}

// --- WebGL2 backend (real; rig) ------------------------------------------------------------------------------------
function _glProgram(gl, vs, fs) {
    const c = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram(); gl.attachShader(p, c(gl.VERTEX_SHADER, vs)); gl.attachShader(p, c(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p)); return p;
}
function webgl2Backend(canvas, opts = {}) {
    // Level 11 -- antialias OFF by default. The WebGPU backend renders with one sample per pixel, and a WebGL2
    // canvas defaults to MSAA; measured at Level 11, that alone made 3,417 of 65,536 pixels differ between the two
    // backends on a scene of 100 small quads, every one an edge blended on GL and hard on WebGPU. Parity is
    // the promise, so the default is the setting both can keep; a caller may still ask for it by name.
    const gl = (canvas && canvas.getContext) ? canvas.getContext("webgl2", { antialias: false, ...(opts.contextAttribs || {}) }) : null; if (!gl) return null;
    gl.enable(gl.DEPTH_TEST);
    let fbo = null, fboW = 0, fboH = 0;
    const glTarget = (usage) => usage.includes("index") ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
    const upload = (t, d, nearest) => {
        if (d.source) { gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, !!d.flipY); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, d.source); }
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, d.width, d.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, d.data || null);
        const f = nearest ? gl.NEAREST : gl.LINEAR;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    };
    const dev = {
        backend: "webgl2", gl,
        buffer: (d) => {
            const usage = _usageList(d.usage);
            if (usage.includes("storage") || usage.includes("indirect"))
                throw _refuse("webgl2", "storage or indirect buffers", CPU_TWIN);
            const b = gl.createBuffer(), tgt = glTarget(usage); gl.bindBuffer(tgt, b);
            if (d.data) gl.bufferData(tgt, d.data, gl.STATIC_DRAW); else gl.bufferData(tgt, d.size || 0, gl.DYNAMIC_DRAW);
            const h = { gl: b, usage, tgt, size: d.data ? d.data.byteLength : (d.size || 0), count: (d.count || (d.data ? d.data.length / (d.components || 1) : 0)),
                        indexType: (d.data instanceof Uint16Array) ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT,
                        write: (v, off = 0) => { gl.bindBuffer(tgt, b); gl.bufferSubData(tgt, off, v); }, destroy: () => gl.deleteBuffer(b) };
            return h;
        },
        read: async (b) => { const out = new Uint8Array(b.size); gl.bindBuffer(b.tgt, b.gl); gl.getBufferSubData(b.tgt, 0, out); return out.buffer; },
        depthTexture: () => null,
        // v4301 -- `topology: "line-list"` draws gl.LINES, the same word the WebGPU pipeline takes; anything else is triangles.
        pipeline: (d) => ({ prog: _glProgram(gl, d.shaders.glsl.vertex, d.shaders.glsl.fragment), attributes: d.attributes, stride: d.stride || 0, layouts: _vertexLayouts(d), _u: {}, cull: d.cull || "none", frontFace: d.frontFace || "ccw", mode: d.topology === "line-list" ? gl.LINES : gl.TRIANGLES }),
        compute: () => { throw _refuse("webgl2", "compute pipelines", CPU_TWIN); },
        // *** `source` ACCEPTS A CANVAS OR IMAGE, WHICH v4273's FIRST REAL CONSUMER NEEDED AND THIS DID NOT HAVE.
        // *** ui/orreryPost.mjs feeds the orrery's 2D canvas through a post effect, and a post stage's source is
        // ALWAYS an already-drawn surface. This only took {width, height, data} -- raw bytes -- so the only way
        // to use a canvas was getImageData() every frame, a full readback to hand back something the GL call can
        // take directly. The two-argument form of texImage2D does it with no copy. `data` still works unchanged.
        // Level 11: `nearest` selects point sampling on BOTH backends (a gate reading texels back needs it), and the
        // handle carries update() and destroy() so a per-frame source re-uploads into ONE texture instead of
        // allocating a new one every frame and never freeing it, which is what orreryPost did until this round.
        texture: (d) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); upload(t, d, d.nearest);
            const w = d.width || (d.source && d.source.width) || 0, h = d.height || (d.source && d.source.height) || 0;
            const tex = { gl: t, w, h, nearest: !!d.nearest, render: !!d.render, update: (nd) => { gl.bindTexture(gl.TEXTURE_2D, t); upload(t, { flipY: d.flipY, ...nd }, d.nearest); },
                          destroy: () => { gl.deleteTexture(t); for (const k of ["_fb", "_fbOut"]) if (tex[k]) gl.deleteFramebuffer(tex[k]); if (tex._rb) gl.deleteRenderbuffer(tex._rb); if (tex._scratch) gl.deleteTexture(tex._scratch); } };
            return tex; },
        frame: (fn, o) => {
            let cur = null, idx = null, cleared = false;
            // Level 13 -- an offscreen frame draws into an owned framebuffer (colour texture + depth renderbuffer)
            // sized to the canvas, so a pick picture is read back without touching what the page shows.
            // v4318 -- `target`: a device texture (RENDER_ATTACHMENT on WebGPU, a framebuffer here) receives the frame
            // *** AND THE ROWS ARE TURNED OVER, SO A TARGET SAMPLES THE SAME WAY ON BOTH BACKENDS. *** GL stores a framebuffer's
            // row 0 at the BOTTOM; WebGPU's row 0 is the top, and every uploaded texture's row 0 is the top. A shader sampling
            // a target at v = 0 would read the bottom of the picture here and the top there. So the frame draws into a scratch
            // texture and is blitted into the target upside down (blitFramebuffer with an inverted destination): the target's
            // row 0 is the top, as a WebGPU target's is, and one shader reads both.
            if (o && o.target) {
                const t = o.target; if (!t || !t.gl) throw new Error("gfx/device: frame target must be a texture from device.texture()");
                if (!t._fb) { const w = t.w || 1, h = t.h || 1;
                    const sc = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, sc); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                    const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
                    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sc, 0); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
                    const fbOut = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbOut); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.gl, 0);
                    t._fb = fb; t._rb = rb; t._scratch = sc; t._fbOut = fbOut; }
                // a target that is loaded rather than cleared (pass.begin) keeps what it holds: copy it back into the scratch, upside down again
                gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t._fbOut); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t._fb); gl.blitFramebuffer(0, 0, t.w, t.h, 0, t.h, t.w, 0, gl.COLOR_BUFFER_BIT, gl.NEAREST);
                gl.bindFramebuffer(gl.FRAMEBUFFER, t._fb); gl.viewport(0, 0, t.w, t.h);
            } else if (o && o.offscreen) {
                const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
                if (!fbo || fboW !== w || fboH !== h) {
                    if (fbo) { gl.deleteFramebuffer(fbo.fb); gl.deleteTexture(fbo.tex); gl.deleteRenderbuffer(fbo.rb); }
                    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                    const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
                    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
                    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
                    fbo = { fb, tex, rb }; fboW = w; fboH = h;
                }
                gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fb);
            } else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); }
            const bindSlot = (b, slot, byteOffset) => {
                const lay = cur.layouts[slot]; if (!lay) throw new Error(`gfx/device: pipeline declares ${cur.layouts.length} vertex buffer slot(s) and slot ${slot} was bound`);
                gl.bindBuffer(gl.ARRAY_BUFFER, b.gl);
                for (const a of lay.attributes) { const loc = gl.getAttribLocation(cur.prog, a.name); if (loc < 0) continue; gl.enableVertexAttribArray(loc);
                    const fmt = _attrFormat(a), n = a.size || Number((fmt.match(/x(\d)$/) || [0, 1])[1]);
                    if (/^uint32/.test(fmt)) gl.vertexAttribIPointer(loc, n, gl.UNSIGNED_INT, lay.stride, byteOffset + a.offset);
                    else gl.vertexAttribPointer(loc, n, gl.FLOAT, false, lay.stride, byteOffset + a.offset);
                    gl.vertexAttribDivisor(loc, lay.stepMode === "instance" ? 1 : 0); }
            };
            const pass = {
                dispatch: () => { throw _refuse("webgl2", "compute pipelines", CPU_TWIN); },
                dispatchIndirect: () => { throw _refuse("webgl2", "compute pipelines", CPU_TWIN); },
                clear: (c) => { cleared = true; gl.clearColor(c[0], c[1], c[2], c[3] == null ? 1 : c[3]); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); },
                // Level 13 -- begin(): draw ON TOP of what the last frame left, colour and depth both kept. GL keeps
                // them by not clearing; WebGPU says loadOp: "load". A second occlusion phase needs exactly this.
                begin: () => { cleared = true; },
                use: (p) => { gl.useProgram(p.prog); cur = p;
                    if (p.cull && p.cull !== "none") { gl.enable(gl.CULL_FACE); gl.cullFace(p.cull === "front" ? gl.FRONT : gl.BACK); } else gl.disable(gl.CULL_FACE);
                    gl.frontFace(p.frontFace === "cw" ? gl.CW : gl.CCW); },
                vertices: (b, slot = 0) => bindSlot(b, slot, 0),
                instances: (b, byteOffset = 0) => bindSlot(b, 1, byteOffset),
                indices: (b) => { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.gl); idx = b; },
                uniform: (n, v) => { const loc = gl.getUniformLocation(cur.prog, n); if (loc == null) return; if (Array.isArray(v) || v instanceof Float32Array) { const fn = { 2: "uniform2fv", 3: "uniform3fv", 4: "uniform4fv", 16: "uniformMatrix4fv" }[v.length]; if (v.length === 16) gl.uniformMatrix4fv(loc, false, v); else gl[fn || "uniform1fv"](loc, v); } else gl.uniform1f(loc, v); },
                texture: (n, t, unit = 0) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.gl); gl.uniform1i(gl.getUniformLocation(cur.prog, n), unit); },
                storage: () => { throw _refuse("webgl2", "storage buffers", CPU_TWIN); },
                draw: (n, instances = 1) => { const mode = cur ? cur.mode : gl.TRIANGLES; if (instances > 1) gl.drawArraysInstanced(mode, 0, n, instances); else gl.drawArrays(mode, 0, n); },
                drawIndexed: (n, instances = 1, firstIndex = 0, baseVertex = 0, firstInstance = 0) => {
                    if (!idx) throw new Error("gfx/device: drawIndexed() with no index buffer bound -- call pass.indices(buf) first");
                    if (baseVertex || firstInstance) throw _refuse("webgl2", "baseVertex / firstInstance (WEBGL_draw_instanced_base_vertex_base_instance is not assumed)", "Pack meshes with absolute indices -- render/gpuDriven.mjs packMeshes() does -- so both are 0.");
                    const bytes = idx.indexType === gl.UNSIGNED_SHORT ? 2 : 4;
                    const mode = cur ? cur.mode : gl.TRIANGLES;
                    if (instances > 1) gl.drawElementsInstanced(mode, n, idx.indexType, firstIndex * bytes, instances); else gl.drawElements(mode, n, idx.indexType, firstIndex * bytes); },
                drawIndexedIndirect: () => { throw _refuse("webgl2", "indirect draws", CPU_TWIN); }
            };
            fn({ pass, device: dev });
            // Level 11 -- READ THE FRAME BACK, IN THE SAME TASK. Without preserveDrawingBuffer the buffer is gone
            // once the frame presents, so this is the only moment a caller can have the pixels. Rows come back
            // bottom-first from readPixels and are flipped here, so both backends hand back the same picture.
            const finishTarget = () => { const t = o.target; gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t._fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t._fbOut);
                gl.blitFramebuffer(0, 0, t.w, t.h, 0, t.h, t.w, 0, gl.COLOR_BUFFER_BIT, gl.NEAREST); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); };
            if (o && o.read) {
                const w = o.target ? o.target.w : gl.drawingBufferWidth, h = o.target ? o.target.h : gl.drawingBufferHeight, raw = new Uint8Array(w * h * 4), px = new Uint8Array(w * h * 4);
                gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
                for (let y = 0; y < h; y++) px.set(raw.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
                if (o.target) finishTarget(); else if (o.offscreen) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); }
                return Promise.resolve({ pixels: px, width: w, height: h, backend: "webgl2" });
            }
            if (o && o.target) finishTarget(); else if (o && o.offscreen) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); }
        },
        destroy: () => {}
    };
    return dev;
}

// --- WebGPU backend (real; rig) ------------------------------------------------------------------------------------
// The usage flags, with the spec's values as a fallback: a Node process grading this backend through a stubbed
// navigator.gpu (backendParity-selfcheck) has no GPUBufferUsage global, and a ReferenceError at configure time
// would report "the stub failed" about a backend that is fine. The numbers are the WebGPU spec's constants.
const BU = () => (typeof GPUBufferUsage !== "undefined" ? GPUBufferUsage : { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256 });
const TU = () => (typeof GPUTextureUsage !== "undefined" ? GPUTextureUsage : { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 });
const MM = () => (typeof GPUMapMode !== "undefined" ? GPUMapMode : { READ: 1, WRITE: 2 });
// *** A WGSL COMPILE ERROR IS SILENT IN THIS API, AND Level 11's FIRST GPU-DRIVEN FRAME DREW NOTHING BECAUSE OF ONE. ***
// createShaderModule never throws; the failure arrives on an async getCompilationInfo() and the pipeline simply
// does nothing. The field was named `meta`, which is a reserved word in WGSL; the twin on the CPU produced 100
// instances and the GPU produced 0, and nothing in between had said a word. So every module's compilation is
// watched: the pipeline carries `compiled` (a promise of null or the message) and `error`, and the first use()
// or dispatch() after a failure refuses BY NAME with the compiler's own line numbers.
function _watchCompile(mod, what) {
    if (typeof mod.getCompilationInfo !== "function") return Promise.resolve(null);
    return mod.getCompilationInfo().then((info) => {
        const errs = (info.messages || []).filter((m) => m.type === "error").map((m) => `${m.lineNum}:${m.linePos} ${m.message}`);
        return errs.length ? `gfx/device: the WGSL for this ${what} did not compile, so it would draw nothing: ${errs.join(" | ")}` : null;
    }).catch(() => null);
}
const GPU_USAGE = (usage) => {
    const U = BU(); let f = U.COPY_DST | U.COPY_SRC;
    for (const u of usage) f |= { vertex: U.VERTEX, index: U.INDEX, storage: U.STORAGE, indirect: U.INDIRECT | U.STORAGE, uniform: U.UNIFORM }[u];
    return f;
};
async function webgpuBackend(canvas, opts = {}) {
    if (typeof navigator === "undefined" || !navigator.gpu) return null;
    const adapter = await navigator.gpu.requestAdapter(); if (!adapter) return null;
    const gpu = await adapter.requestDevice(); const ctx = (canvas && canvas.getContext) ? canvas.getContext("webgpu") : null; if (!ctx) return null; const fmt = navigator.gpu.getPreferredCanvasFormat();
    // *** Level 11 -- `offscreen: true` RENDERS INTO AN OWNED TEXTURE AND NEVER PRESENTS. *** Measured on the build
    // box's headless shell: ANY render pass whose attachment is the canvas's current texture loses the device
    // ("A valid external Instance reference no longer exists"), attached to the DOM or not, COPY_SRC or not,
    // waited on or not -- four variants, all lost. An offscreen texture of the same format renders and reads
    // back correctly. So a gate that wants pixels from this backend asks for offscreen, and the frame's readback
    // copies from wherever the frame went. On a browser with a compositor the canvas path is the product.
    const offscreen = !!opts.offscreen;
    // *** Level 12 -- DEPTH, ON BY DEFAULT, BECAUSE THE WebGL2 BACKEND HAS HAD gl.enable(DEPTH_TEST) SINCE IT WAS
    // WRITTEN AND THIS ONE HAD NOTHING. *** Two overlapping instances drew in submission order here and in
    // depth order there, so the backends agreed only on scenes built not to overlap -- Level 11's gpuDriven gate
    // says so in its own unchecked note. depth32float rather than depth24plus: it is the one depth format a
    // copyTextureToBuffer may read, and the Hi-Z pyramid (render/gpuDriven.mjs) needs the frame's depth as
    // numbers. `depth: false` opts out for a pure post effect.
    const depth = opts.depth !== false, DEPTH_FORMAT = "depth32float";
    let own = null, ownW = 0, ownH = 0, dtex = null, dW = 0, dH = 0;
    const depthTarget = (w, h) => { if (!depth) return null;
        if (!dtex || dW !== w || dH !== h) { try { dtex?.destroy(); } catch (e) {} dtex = gpu.createTexture({ size: [w, h], format: DEPTH_FORMAT, usage: TU().RENDER_ATTACHMENT | TU().TEXTURE_BINDING | TU().COPY_SRC }); dW = w; dH = h; dtex._view = dtex.createView(); }
        return dtex; };
    const ownTarget = () => { const w = canvas.width || 1, h = canvas.height || 1;
        if (!own || ownW !== w || ownH !== h) { try { own?.destroy(); } catch (e) {} own = gpu.createTexture({ size: [w, h], format: fmt, usage: TU().RENDER_ATTACHMENT | TU().COPY_SRC }); ownW = w; ownH = h; }
        return own; };
    if (!offscreen) ctx.configure({ device: gpu, format: fmt, alphaMode: "premultiplied", usage: TU().RENDER_ATTACHMENT | TU().COPY_SRC });
    // One sampler per filter mode, made on first use. Repeat addressing and no mip chain: the WebGL2 backend's
    // texture parameters, which is what makes a pixel diff between the two a comparison of pictures and not of
    // sampler defaults.
    const samplers = {};
    const samplerFor = (nearest) => { const k = nearest ? "nearest" : "linear"; if (!samplers[k]) samplers[k] = gpu.createSampler({ magFilter: k, minFilter: k, addressModeU: "repeat", addressModeV: "repeat" }); return samplers[k]; };
    /** Assemble a bind group from what was bound by name against what the shader declares. Refuses by name. */
    const bindGroupFor = (p) => {
        if (p._bg && p._bgGen === p._gen) return p._bg;
        const entries = [];
        if (p.ubuf) entries.push({ binding: p.uniformBinding, resource: { buffer: p.ubuf } });
        let nearest = null;
        for (const t of p.texBindings) {
            const tex = p._tex[t.name];
            if (!tex || !tex.view) throw new Error(`gfx/device: the shader declares texture "${t.name}" at @group(0) @binding(${t.binding}) and nothing was bound to it -- call pass.texture(${JSON.stringify(t.name)}, tex) before drawing. Drawing anyway would present the effect over nothing.`);
            if (nearest == null) nearest = !!tex.nearest;
            entries.push({ binding: t.binding, resource: tex.view });
        }
        for (const s of p.samplerBindings) entries.push({ binding: s.binding, resource: samplerFor(!!nearest) });
        for (const s of p.storageBindings) {
            const b = p._stor[s.name];
            if (!b) throw new Error(`gfx/device: the shader declares storage buffer "${s.name}" at @group(0) @binding(${s.binding}) and nothing was bound to it -- call ${p.__compute ? "compute.bind" : "pass.storage"}(${JSON.stringify(s.name)}, buf) first.`);
            entries.push({ binding: s.binding, resource: { buffer: b.buf.gpu, offset: b.offset || 0, ...(b.size ? { size: b.size } : {}) } });
        }
        for (const u of p.uniformBindings) {
            if (p.ubuf && u.binding === p.uniformBinding) continue;
            const b = p._stor[u.name];
            if (!b) throw new Error(`gfx/device: the shader declares uniform "${u.name}" at @group(0) @binding(${u.binding}) and nothing was bound to it -- bind a buffer with usage "uniform" under that name.`);
            entries.push({ binding: u.binding, resource: { buffer: b.buf.gpu, offset: b.offset || 0, ...(b.size ? { size: b.size } : {}) } });
        }
        p._bg = gpu.createBindGroup({ layout: p.pipe.getBindGroupLayout(0), entries }); p._bgGen = p._gen;
        return p._bg;
    };
    // *** v4404 -- A MODULE MAY HAVE MORE THAN ONE ENTRY POINT, AND UNTIL NOW THIS ASSUMED IT DID NOT. ***
    // WebGPU's layout:"auto" builds a bind group layout from what the CHOSEN entry point actually uses, not from
    // what the module declares. simulation/lbm/lbmShader.js is the first module here with two -- collideStream
    // touches all five bindings and stream touches three -- and both halves of the mismatch are errors: binding
    // the extra two to `stream` is rejected by the device ("binding index 2 not present in the bind group
    // layout") and NOT binding them is refused by the loop below ("nothing was bound to it"). There was no way
    // to be right. `uses` lets a caller name the subset one entry point needs; omitted, every declared binding is
    // required exactly as before, so nothing that already worked changes.
    const classify = (wgsl, uses) => {
        const keep = Array.isArray(uses) ? new Set(uses) : null;
        const all = parseBindings(wgsl).filter((b) => b.group === 0).filter((b) => !keep || keep.has(b.name));
        return { texBindings: all.filter((b) => /^texture_/.test(b.type)), samplerBindings: all.filter((b) => /^sampler/.test(b.type)),
                 storageBindings: all.filter((b) => b.addressSpace === "storage"), uniformBindings: all.filter((b) => b.addressSpace === "uniform"), all };
    };
    const bindByName = (p, n, buf, o = {}) => {
        const known = p.all.find((b) => b.name === n && (b.addressSpace === "storage" || b.addressSpace === "uniform"));
        if (!known) throw new Error(`gfx/device: the shader declares no storage or uniform binding named ${JSON.stringify(n)} -- it declares ${p.all.map((b) => b.name).join(", ") || "none"}.`);
        if (!buf || !buf.gpu) throw new Error(`gfx/device: binding ${JSON.stringify(n)} needs a buffer from device.buffer(); got ${buf == null ? "nothing" : typeof buf}`);
        p._stor[n] = { buf, offset: o.offset || 0, size: o.size || 0 }; p._gen++;
    };
    const dev = {
        backend: "webgpu", gpu, ctx, fmt, offscreen, depth,
        /** The frame's depth texture as a bindable handle (null until a frame has cleared, or with depth off). */
        depthTexture: () => (dtex ? { gpu: dtex, view: dtex._view, w: dW, h: dH, nearest: true, depth: true } : null),
        buffer: (d) => { const usage = _usageList(d.usage); const size = Math.max(4, Math.ceil((d.data ? d.data.byteLength : (d.size || 0)) / 4) * 4);
            const b = gpu.createBuffer({ size, usage: GPU_USAGE(usage) }); if (d.data) gpu.queue.writeBuffer(b, 0, d.data);
            return { gpu: b, usage, size, count: (d.count || (d.data ? d.data.length / (d.components || 1) : 0)), indexFormat: (d.data instanceof Uint16Array) ? "uint16" : "uint32",
                     write: (v, off = 0) => gpu.queue.writeBuffer(b, off, v), destroy: () => { try { b.destroy(); } catch (e) {} } }; },
        read: async (b) => { const st = gpu.createBuffer({ size: b.size, usage: BU().COPY_DST | BU().MAP_READ });
            const enc = gpu.createCommandEncoder(); enc.copyBufferToBuffer(b.gpu, 0, st, 0, b.size); gpu.queue.submit([enc.finish()]);
            await st.mapAsync(MM().READ); const out = st.getMappedRange().slice(0); st.unmap(); st.destroy(); return out; },
        pipeline: (d) => {
            // *** REFUSE BY NAME RATHER THAN HAND THE GPU `undefined`. *** v4269 counted what can actually take
            // this backend: 118 modules in this tree ship GLSL, 38 ship WGSL, and 5 ship both. So a pipeline
            // arriving here with no wgsl is the COMMON case, not a freak one, and until now it reached
            // createShaderModule as `code: undefined` -- a driver-shaped error naming neither the pipeline nor
            // the missing language. The abstraction's whole promise is that a render travels; when one cannot,
            // the caller is owed the reason in the terms the contract is written in.
            if (!d.shaders || typeof d.shaders.wgsl !== "string") {
                throw new Error("gfx/device: this pipeline has no WGSL, so it cannot run on the WebGPU backend. " +
                    "A pipeline must carry both { wgsl } and { glsl }; this one carries " +
                    (d.shaders && typeof d.shaders.glsl === "string" ? "only glsl" : "neither") +
                    ". Request the webgl2 backend, or add a WGSL path -- see render/backendParity.mjs.");
            }
            // *** AND THE SECOND THING THIS PIPELINE NEVER CHECKED: THAT THE HOST AND THE SHADER AGREE ABOUT
            // WHAT THE UNIFORM BUFFER CONTAINS. *** `layout: "auto"` below means WebGPU derives the real
            // buffer layout FROM THE SHADER, while _uniformLayout() computes write offsets from `d.uniforms`
            // -- a list the CALLER supplies, in the caller's order. Reorder either and every value lands in
            // the wrong field. The module compiles. The pipeline builds. The pass runs. The draw completes.
            // Nothing in that chain has an error to raise, which is exactly why this one has to be asked for.
            //
            // It refuses only on a POSITIVE disagreement: render/wgslLayout.mjs returns ok with a reason
            // whenever it cannot resolve the struct, so a shader this scanner does not understand is passed
            // through untouched rather than blocked by a scanner's shortcoming.
            const agree = checkHostUniforms(d.shaders.wgsl, d.uniforms);
            if (!agree.ok) {
                throw new Error("gfx/device: this pipeline's uniform list does not match the struct its WGSL " +
                    "declares, so every uniform would be written at the wrong offset and the draw would " +
                    "succeed anyway. " + agree.complaints.join("; ") +
                    ". The shader is the authority on its own layout -- derive the list from it (see " +
                    "render/wgslLayout.mjs fieldOrder) rather than restating it here.");
            }
            const mod = gpu.createShaderModule({ code: d.shaders.wgsl });
            const compiled = _watchCompile(mod, "render pipeline");
            const layouts = _vertexLayouts(d);
            let loc = 0;
            const buffers = layouts.filter((l) => l.attributes.length).map((l) => ({ arrayStride: l.stride, stepMode: l.stepMode,
                attributes: l.attributes.map((a) => ({ shaderLocation: a.location != null ? a.location : loc++, offset: a.offset, format: _attrFormat(a) })) }));
            // Level 13 -- `cull: "back" | "front"` and `frontFace: "ccw" | "cw"` travel in the descriptor, so a terrain
            // sheet drops its underside on both backends by the same words. Default: no culling, as before.
            const pipe = gpu.createRenderPipeline({ layout: "auto", vertex: { module: mod, entryPoint: d.vs || "vs", buffers }, fragment: { module: mod, entryPoint: d.fs || "fs", targets: [{ format: fmt }] },
                primitive: { topology: d.topology || "triangle-list", cullMode: d.cull || "none", frontFace: d.frontFace || "ccw" },
                ...(depth ? { depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: d.depthWrite !== false, depthCompare: d.depthCompare || "less" } } : {}) });
            const cls = classify(d.shaders.wgsl);
            let ubuf = null, uni = null, uniformBinding = 0;
            if (d.uniforms && d.uniforms.length) {
                // The uniform buffer lives at whichever binding the shader gave its uniform struct -- badTv says 0,
                // a shader that puts its sampler first would say something else, and the number is READ, not assumed.
                uniformBinding = cls.uniformBindings.length ? cls.uniformBindings[0].binding : 0;
                uni = _uniformLayout(d.uniforms); ubuf = gpu.createBuffer({ size: uni.size, usage: BU().UNIFORM | BU().COPY_DST });
            }
            const p = { pipe, ubuf, uni, uniformBinding, layouts, ...cls, _tex: {}, _stor: {}, _gen: 1, _bg: null, _bgGen: 0, error: null, compiled };
            compiled.then((e) => { p.error = e; });
            return p;
        },
        compute: (d) => {
            if (!d || typeof d.wgsl !== "string") throw new Error("gfx/device: compute() needs { wgsl } -- a compute pipeline is WGSL-only, there is no GLSL compute stage in WebGL2 to pair it with.");
            const mod = gpu.createShaderModule({ code: d.wgsl });
            const compiled = _watchCompile(mod, "compute pipeline");
            const pipe = gpu.createComputePipeline({ layout: "auto", compute: { module: mod, entryPoint: d.entryPoint || "main" } });
            const c = { __compute: true, pipe, ubuf: null, uniformBinding: -1, ...classify(d.wgsl, d.uses), _tex: {}, _stor: {}, _gen: 1, _bg: null, _bgGen: 0, error: null, compiled };
            compiled.then((e) => { c.error = e; });
            c.bind = (n, buf, o) => { bindByName(c, n, buf, o); return c; };
            // Level 12 -- a compute pass may read a texture (the Hi-Z build reads the frame's depth). Same rule as
            // the render pass: the name must be one the shader declares.
            c.bindTexture = (n, t) => { if (!c.texBindings.some((b) => b.name === n)) throw new Error(`gfx/device: the compute shader declares no texture named ${JSON.stringify(n)} -- it declares ${c.texBindings.map((b) => b.name).join(", ") || "none"}.`);
                c._tex[n] = t; c._gen++; return c; };
            return c;
        },
        texture: (d) => {
            const w = d.width || (d.source && (d.source.width || d.source.videoWidth)) || 0, h = d.height || (d.source && (d.source.height || d.source.videoHeight)) || 0;
            // v4318 -- `render: true`: a target for frame({ target }), in the CANVAS format so every render pipeline (built for fmt)
            // can draw into it; never uploaded to (a bgra8unorm target would take RGBA bytes the wrong way round), sampled as any texture
            const t = gpu.createTexture({ size: [w, h], format: d.render ? fmt : "rgba8unorm", usage: TU().TEXTURE_BINDING | TU().COPY_DST | TU().COPY_SRC | TU().RENDER_ATTACHMENT });
            const put = (nd) => {
                if (nd.source) gpu.queue.copyExternalImageToTexture({ source: nd.source, flipY: !!(nd.flipY != null ? nd.flipY : d.flipY) }, { texture: t }, [w, h]);
                else if (nd.data) gpu.queue.writeTexture({ texture: t }, nd.data, { bytesPerRow: w * 4 }, { width: w, height: h });
            };
            put(d);
            return { gpu: t, view: t.createView(), w, h, nearest: !!d.nearest, render: !!d.render, update: put, destroy: () => { try { t.destroy(); } catch (e) {} } };
        },
        frame: (fn, o) => {
            // Level 13 -- `offscreen` per FRAME: a pick picture is drawn to the owned texture and read back, and the
            // presented canvas never sees it. The depth attachment is shared, so a pick frame that begin()s on
            // a drawn frame's depth would be wrong -- a pick frame clears, as its caller must.
            if (o && o.target && !(o.target.gpu && o.target.view)) throw new Error("gfx/device: frame target must be a texture from device.texture()");
            const enc = gpu.createCommandEncoder(); const target = (o && o.target) ? o.target.gpu : (offscreen || (o && o.offscreen)) ? ownTarget() : ctx.getCurrentTexture(); const view = target.createView(); let rp = null, cur = null, idx = null;
            const ready = () => { if (!rp) throw new Error("gfx/device: draw before pass.clear() -- the render pass begins at clear()"); rp.setBindGroup(0, bindGroupFor(cur)); };
            const pass = {
                // Compute runs on the SAME encoder, before the render pass, so a cull that fills an indirect buffer
                // is ordered before the draw that reads it without the caller managing a fence.
                dispatch: (c, wg) => { if (rp) throw new Error("gfx/device: dispatch() must come before pass.clear() -- a compute pass cannot run inside the frame's render pass; put the compute work first");
                    if (!c || !c.__compute) throw new Error("gfx/device: dispatch() needs a pipeline from device.compute()");
                    if (c.error) throw new Error(c.error);
                    const cp = enc.beginComputePass(); cp.setPipeline(c.pipe); cp.setBindGroup(0, bindGroupFor(c)); const g = Array.isArray(wg) ? wg : [wg]; cp.dispatchWorkgroups(g[0] || 1, g[1] || 1, g[2] || 1); cp.end(); },
                // v4339 -- THE DISPATCH SIZE ITSELF IN A BUFFER. The cull pass has always been able to fill an indirect
                // DRAW; this is the other half, and it is what lets one pass decide how much work the next one does
                // without a readback. The buffer holds three u32 -- workgroupsX, Y, Z -- at `byteOffset`, and the GPU
                // reads them when the command runs, not when it is encoded.
                dispatchIndirect: (c, b, byteOffset = 0) => { if (rp) throw new Error("gfx/device: dispatchIndirect() must come before pass.clear() -- a compute pass cannot run inside the frame's render pass; put the compute work first");
                    if (!c || !c.__compute) throw new Error("gfx/device: dispatchIndirect() needs a pipeline from device.compute()");
                    if (c.error) throw new Error(c.error);
                    if (!b || !b.usage || !b.usage.includes("indirect")) throw new Error("gfx/device: dispatchIndirect() needs a buffer created with usage \"indirect\" -- it holds three u32 (workgroupsX, Y, Z) the GPU reads when the command runs");
                    const cp = enc.beginComputePass(); cp.setPipeline(c.pipe); cp.setBindGroup(0, bindGroupFor(c)); cp.dispatchWorkgroupsIndirect(b.gpu, byteOffset); cp.end(); },
                clear: (c) => { const dt = depthTarget(target.width, target.height);
                    rp = enc.beginRenderPass({ colorAttachments: [{ view, clearValue: { r: c[0], g: c[1], b: c[2], a: c[3] == null ? 1 : c[3] }, loadOp: "clear", storeOp: "store" }],
                        ...(dt ? { depthStencilAttachment: { view: dt._view, depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" } } : {}) }); },
                // Level 13 -- begin(): the pass LOADS colour and depth instead of clearing them, so a second phase
                // draws over the first. In canvas mode the current texture is the same object within one task,
                // which is what makes two frames in one tick land on one picture.
                begin: () => { const dt = depthTarget(target.width, target.height);
                    rp = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: "load", storeOp: "store" }],
                        ...(dt ? { depthStencilAttachment: { view: dt._view, depthLoadOp: "load", depthStoreOp: "store" } } : {}) }); },
                use: (p) => { if (p.error) throw new Error(p.error); rp.setPipeline(p.pipe); cur = p; },
                vertices: (b, slot = 0) => rp.setVertexBuffer(slot, b.gpu),
                instances: (b, byteOffset = 0) => rp.setVertexBuffer(1, b.gpu, byteOffset),
                indices: (b) => { rp.setIndexBuffer(b.gpu, b.indexFormat || "uint32"); idx = b; },
                uniform: (n, v) => { if (!cur || !cur.ubuf || !cur.uni || cur.uni.offsets[n] == null) return; const data = (v instanceof Float32Array) ? v : Float32Array.from(Array.isArray(v) ? v : [v]); gpu.queue.writeBuffer(cur.ubuf, cur.uni.offsets[n], data); },
                // Level 11: BOUND, AT LAST. The name is looked up in what the shader declared; an undeclared name is
                // refused here rather than silently ignored, because "bound a texture the shader never reads" is
                // the same picture-without-its-source failure v4273 found, arrived at from the other side.
                texture: (n, t) => { if (!cur) throw new Error("gfx/device: pass.texture() before pass.use()");
                    if (!cur.texBindings.some((b) => b.name === n)) throw new Error(`gfx/device: the shader declares no texture named ${JSON.stringify(n)} -- it declares ${cur.texBindings.map((b) => b.name).join(", ") || "none"}. A bind the shader cannot see is a frame without its source.`);
                    cur._tex[n] = t; cur._gen++; },
                storage: (n, b, o) => { if (!cur) throw new Error("gfx/device: pass.storage() before pass.use()"); bindByName(cur, n, b, o); },
                draw: (n, instances = 1) => { ready(); rp.draw(n, instances); },
                drawIndexed: (n, instances = 1, firstIndex = 0, baseVertex = 0, firstInstance = 0) => { ready(); if (!idx) throw new Error("gfx/device: drawIndexed() with no index buffer bound -- call pass.indices(buf) first"); rp.drawIndexed(n, instances, firstIndex, baseVertex, firstInstance); },
                drawIndexedIndirect: (b, byteOffset = 0) => { ready(); if (!idx) throw new Error("gfx/device: drawIndexedIndirect() with no index buffer bound -- call pass.indices(buf) first");
                    if (!b || !b.usage || !b.usage.includes("indirect")) throw new Error("gfx/device: drawIndexedIndirect() needs a buffer created with usage \"indirect\"");
                    rp.drawIndexedIndirect(b.gpu, byteOffset); }
            };
            fn({ pass, device: dev }); if (rp) rp.end();
            if (!(o && o.read)) { gpu.queue.submit([enc.finish()]); return; }
            // Level 11 -- the readback: copy the presented texture before submit, then map. bytesPerRow is padded
            // to 256 as the API requires, and a bgra8unorm canvas is swizzled to RGBA so a caller comparing this
            // to the WebGL2 readback compares colours and not channel orders.
            const w = target.width, h = target.height, bpr = Math.ceil(w * 4 / 256) * 256;
            const st = gpu.createBuffer({ size: bpr * h, usage: BU().COPY_DST | BU().MAP_READ });
            enc.copyTextureToBuffer({ texture: target }, { buffer: st, bytesPerRow: bpr }, [w, h]);
            // the depth image too, as f32 -- the twin of a Hi-Z cull needs the same numbers the GPU reduced
            const wantDepth = depth && dtex && o.depth !== false;
            const sd = wantDepth ? gpu.createBuffer({ size: bpr * h, usage: BU().COPY_DST | BU().MAP_READ }) : null;
            if (sd) enc.copyTextureToBuffer({ texture: dtex, aspect: "depth-only" }, { buffer: sd, bytesPerRow: bpr }, [w, h]);
            gpu.queue.submit([enc.finish()]);
            return Promise.all([st.mapAsync(MM().READ), sd ? sd.mapAsync(MM().READ) : null]).then(() => {
                const raw = new Uint8Array(st.getMappedRange()), px = new Uint8Array(w * h * 4), bgra = /^bgra/.test(fmt);
                for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * bpr + x * 4, j = (y * w + x) * 4;
                    if (bgra) { px[j] = raw[i + 2]; px[j + 1] = raw[i + 1]; px[j + 2] = raw[i]; } else { px[j] = raw[i]; px[j + 1] = raw[i + 1]; px[j + 2] = raw[i + 2]; } px[j + 3] = raw[i + 3]; }
                st.unmap(); st.destroy();
                let dz = null;
                if (sd) { const rf = new Float32Array(sd.getMappedRange()); dz = new Float32Array(w * h); for (let y = 0; y < h; y++) dz.set(rf.subarray(y * bpr / 4, y * bpr / 4 + w), y * w); sd.unmap(); sd.destroy(); }
                return { pixels: px, width: w, height: h, backend: "webgpu", format: fmt, depth: dz };
            });
        },
        destroy: () => { try { own?.destroy(); } catch (e) {} try { gpu.destroy(); } catch (e) {} }
    };
    return dev;
}

// Pick a backend: prefer WebGPU (or opts.prefer / opts.backend), fall back to WebGL2, then the null recorder.
async function requestDevice(canvas, opts = {}) {
    if (opts.backend === "null") return nullBackend(opts);
    const avail = opts._backends || detectBackends();
    const order = opts.backend ? [opts.backend] : (opts.prefer === "webgl2" ? ["webgl2", "webgpu"] : ["webgpu", "webgl2"]);
    for (const b of order) {
        if (b === "webgpu" && avail.webgpu) { const d = await webgpuBackend(canvas, opts); if (d) return d; }
        if (b === "webgl2" && avail.webgl2) { const d = webgl2Backend(canvas, opts); if (d) return d; }
    }
    return nullBackend(opts);
}

/** What each backend can do, as data, so a consumer chooses by capability rather than by backend name. */
const CAPABILITIES = Object.freeze({
    webgpu: Object.freeze({ textures: true, compute: true, indirect: true, storage: true, instancing: true, indexed: true, depth: true, depthRead: true }),
    webgl2: Object.freeze({ textures: true, compute: false, indirect: false, storage: false, instancing: true, indexed: true, depth: true, depthRead: false }),
    null:   Object.freeze({ textures: true, compute: true, indirect: true, storage: true, instancing: true, indexed: true, depth: true, depthRead: false }),
});

export { requestDevice, detectBackends, nullBackend, webgl2Backend, webgpuBackend, _uniformLayout, BUFFER_USAGES, CAPABILITIES };
if (typeof module !== "undefined" && module.exports) module.exports = { requestDevice, detectBackends, nullBackend, webgl2Backend, webgpuBackend };
