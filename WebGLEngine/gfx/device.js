// gfx/device.js -- SweK's unified WebGL2 / WebGPU device (the MUGL idea, kept in-house). One WebGPU-shaped API that
// both backends implement, so a demo writes its render ONCE and runs on either runtime: requestDevice() picks WebGPU
// when it's available and falls back to WebGL2, and a `null` backend records operations so the abstraction's control
// flow is verifiable headless (the real GPU draws are rig-only). Shaders are inherently backend-specific, so a pipeline
// carries both { wgsl } and { glsl } and each backend takes its own; everything else -- buffers, pipelines, passes,
// draws -- is unified.
"use strict";

import { checkHostUniforms } from "../render/wgslLayout.mjs";


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

function detectBackends() {
    const out = { webgpu: false, webgl2: false };
    try { out.webgpu = (typeof navigator !== "undefined" && !!navigator.gpu); } catch (e) {}
    try { out.webgl2 = (typeof document !== "undefined" && !!document.createElement("canvas").getContext("webgl2")); } catch (e) {}
    return out;
}

// --- null backend: implements the full interface, records the op stream. Used for tests + as a headless fallback. ----
function nullBackend(opts = {}) {
    const ops = [];
    const dev = {
        backend: "null", ops,
        buffer: (d) => ({ __buf: true, count: (d.data && d.data.length) || 0 }),
        pipeline: (d) => ({ __pipe: true, attributes: d.attributes || [], stride: d.stride || 0 }),
        texture: (d) => ({ __tex: true, w: d.width, h: d.height }),
        frame: (fn) => { const pass = { clear: (c) => ops.push(["clear", c]), use: (p) => ops.push(["use", p && p.__pipe ? "pipe" : "?"]), vertices: (b) => ops.push(["vertices", !!(b && b.__buf)]), uniform: (n) => ops.push(["uniform", n]), texture: (n) => ops.push(["texture", n]), draw: (n) => ops.push(["draw", n]) }; fn({ pass, device: dev }); ops.push(["submit"]); },
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
    const gl = (canvas && canvas.getContext) ? canvas.getContext("webgl2", opts.contextAttribs || {}) : null; if (!gl) return null;
    gl.enable(gl.DEPTH_TEST);
    const dev = {
        backend: "webgl2", gl,
        buffer: (d) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, d.data, gl.STATIC_DRAW); return { gl: b, count: (d.count || (d.data.length / (d.components || 1))) }; },
        pipeline: (d) => ({ prog: _glProgram(gl, d.shaders.glsl.vertex, d.shaders.glsl.fragment), attributes: d.attributes, stride: d.stride || 0, _u: {} }),
        // *** `source` ACCEPTS A CANVAS OR IMAGE, WHICH v4273's FIRST REAL CONSUMER NEEDED AND THIS DID NOT HAVE.
        // *** ui/orreryPost.mjs feeds the orrery's 2D canvas through a post effect, and a post stage's source is
        // ALWAYS an already-drawn surface. This only took {width, height, data} -- raw bytes -- so the only way
        // to use a canvas was getImageData() every frame, a full readback to hand back something the GL call can
        // take directly. The two-argument form of texImage2D does it with no copy. `data` still works unchanged.
        texture: (d) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
            if (d.source) { gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, !!d.flipY); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, d.source); }
            else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, d.width, d.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, d.data || null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); return { gl: t }; },
        frame: (fn) => {
            let cur = null;
            const pass = {
                clear: (c) => { gl.clearColor(c[0], c[1], c[2], c[3] == null ? 1 : c[3]); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); },
                use: (p) => { gl.useProgram(p.prog); cur = p; },
                vertices: (b) => { gl.bindBuffer(gl.ARRAY_BUFFER, b.gl); for (const a of cur.attributes) { const loc = gl.getAttribLocation(cur.prog, a.name); if (loc < 0) continue; gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, a.size, gl.FLOAT, false, cur.stride, a.offset); } },
                uniform: (n, v) => { const loc = gl.getUniformLocation(cur.prog, n); if (loc == null) return; if (Array.isArray(v) || v instanceof Float32Array) { const fn = { 2: "uniform2fv", 3: "uniform3fv", 4: "uniform4fv", 16: "uniformMatrix4fv" }[v.length]; if (v.length === 16) gl.uniformMatrix4fv(loc, false, v); else gl[fn || "uniform1fv"](loc, v); } else gl.uniform1f(loc, v); },
                texture: (n, t, unit = 0) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.gl); gl.uniform1i(gl.getUniformLocation(cur.prog, n), unit); },
                draw: (n) => gl.drawArrays(gl.TRIANGLES, 0, n)
            };
            fn({ pass, device: dev });
        },
        destroy: () => {}
    };
    return dev;
}

// --- WebGPU backend (real; rig) ------------------------------------------------------------------------------------
async function webgpuBackend(canvas, opts = {}) {
    if (typeof navigator === "undefined" || !navigator.gpu) return null;
    const adapter = await navigator.gpu.requestAdapter(); if (!adapter) return null;
    const gpu = await adapter.requestDevice(); const ctx = (canvas && canvas.getContext) ? canvas.getContext("webgpu") : null; if (!ctx) return null; const fmt = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device: gpu, format: fmt, alphaMode: "premultiplied" });
    const dev = {
        backend: "webgpu", gpu, ctx, fmt,
        buffer: (d) => { const b = gpu.createBuffer({ size: d.data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }); gpu.queue.writeBuffer(b, 0, d.data); return { gpu: b, count: (d.count || (d.data.length / (d.components || 1))) }; },
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
            const pipe = gpu.createRenderPipeline({ layout: "auto", vertex: { module: mod, entryPoint: d.vs || "vs", buffers: [{ arrayStride: d.stride, attributes: d.attributes.map((a, i) => ({ shaderLocation: i, offset: a.offset, format: a.wgpuFormat || ("float32x" + a.size) })) }] }, fragment: { module: mod, entryPoint: d.fs || "fs", targets: [{ format: fmt }] }, primitive: { topology: "triangle-list" } });
            let ubuf = null, bind = null, uni = null;
            if (d.uniforms && d.uniforms.length) { uni = _uniformLayout(d.uniforms); ubuf = gpu.createBuffer({ size: uni.size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }); bind = gpu.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubuf } }] }); }
            return { pipe, ubuf, bind, uni };
        },
        texture: (d) => { const t = gpu.createTexture({ size: [d.width, d.height], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT }); if (d.data) gpu.queue.writeTexture({ texture: t }, d.data, { bytesPerRow: d.width * 4 }, { width: d.width, height: d.height }); return { gpu: t }; },
        frame: (fn) => {
            const enc = gpu.createCommandEncoder(); const view = ctx.getCurrentTexture().createView(); let rp = null, cur = null;
            const pass = {
                clear: (c) => { rp = enc.beginRenderPass({ colorAttachments: [{ view, clearValue: { r: c[0], g: c[1], b: c[2], a: c[3] == null ? 1 : c[3] }, loadOp: "clear", storeOp: "store" }] }); },
                use: (p) => { rp.setPipeline(p.pipe); if (p.bind) rp.setBindGroup(0, p.bind); cur = p; },
                vertices: (b) => rp.setVertexBuffer(0, b.gpu),
                uniform: (n, v) => { if (!cur || !cur.ubuf || !cur.uni || cur.uni.offsets[n] == null) return; const data = (v instanceof Float32Array) ? v : Float32Array.from(Array.isArray(v) ? v : [v]); gpu.queue.writeBuffer(cur.ubuf, cur.uni.offsets[n], data); },
                // *** THIS WAS `() => {}` AND IT SILENTLY DROPPED EVERY TEXTURE BIND. *** v4273 attached the
                // first non-demo consumer -- ui/orreryPost.mjs, a post stage reading the orrery's 2D canvas --
                // and that is what surfaced it: the pipeline builds without throwing, this runs, nothing is
                // bound, and the frame draws without its source. A post-processing effect is a texture
                // consumer BY DEFINITION, so the practical reading is that this backend can carry a
                // texture-free render and no post effect at all, while WebGL2 carries both. Neither the
                // pipeline nor the pass said so.
                //
                // Implementing it properly means declaring texture and sampler bindings at pipeline creation
                // and building the bind group from them, which is surgery on a module with existing
                // consumers. Until that round, it REFUSES BY NAME -- the same choice v4269 made for a
                // pipeline arriving with no WGSL. A caller that cannot have the feature is owed the reason,
                // not a picture with the source missing.
                texture: (n) => {
                    throw new Error("gfx/device: the WebGPU backend cannot bind textures yet, so pass.texture(" +
                        JSON.stringify(n) + ") cannot be honoured. It was a silent no-op until v4273. Request " +
                        "the webgl2 backend for anything that samples a texture -- see ui/orreryPost.mjs, " +
                        "which does exactly that and says why.");
                },
                draw: (n) => rp.draw(n)
            };
            fn({ pass, device: dev }); if (rp) rp.end(); gpu.queue.submit([enc.finish()]);
        },
        destroy: () => { try { gpu.destroy(); } catch (e) {} }
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

export { requestDevice, detectBackends, nullBackend, webgl2Backend, webgpuBackend, _uniformLayout };
if (typeof module !== "undefined" && module.exports) module.exports = { requestDevice, detectBackends, nullBackend, webgl2Backend, webgpuBackend };
