// utils/phoneSim.js — shared WebGL2 FBO ping-pong framework for phone CA demos
// Each demo provides:
//   { simSize, updateFS, displayFS, uniforms(gl, prog, time), seed(gl, tex, size), stepsPerFrame, internalFmt, type }
// Standard VS + scaffolding (canvas resize, WebGL2 init, render loop) provided here.

export const STANDARD_VS = `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main(){ vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

export function setupPhoneSim(opts) {
    const canvas = opts.canvas;
    const simSize = opts.simSize || 256;
    const stepsPerFrame = opts.stepsPerFrame || 4;
    const internalFmt = opts.internalFmt || "RGBA16F";
    const typeName = opts.type || "FLOAT";
    const reseedOnTap = opts.reseedOnTap !== false;
    const needsFloat = internalFmt === "RGBA16F" || internalFmt === "RGBA32F";

    function resize() {
        const host = canvas.parentElement;
        const size = Math.min(host.clientWidth, host.clientHeight, 600);
        canvas.style.width = size + "px";
        canvas.style.height = size + "px";
    }
    window.addEventListener("resize", resize);
    resize();

    const gl = canvas.getContext("webgl2", { antialias: false, depth: false, preserveDrawingBuffer: true });
    if (!gl) {
        return { error: "WebGL2 not supported" };
    }
    if (needsFloat && !gl.getExtension("EXT_color_buffer_float")) {
        return { error: "Float textures (EXT_color_buffer_float) not supported" };
    }

    function compile(type, src) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.error("[phoneSim] compile:", gl.getShaderInfoLog(sh));
            return null;
        }
        return sh;
    }
    function link(vs, fs) {
        const p = gl.createProgram();
        gl.attachShader(p, vs); gl.attachShader(p, fs);
        gl.bindAttribLocation(p, 0, "aPos");
        gl.linkProgram(p);
        return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
    }
    function createTex() {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        const fmt = gl[internalFmt];
        const type = gl[typeName];
        gl.texImage2D(gl.TEXTURE_2D, 0, fmt, simSize, simSize, 0, gl.RGBA, type, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        return t;
    }
    function createFBO(tex) {
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return fb;
    }

    const vs = compile(gl.VERTEX_SHADER, STANDARD_VS);
    const updateProg = link(vs, compile(gl.FRAGMENT_SHADER, opts.updateFS));
    const displayProg = link(vs, compile(gl.FRAGMENT_SHADER, opts.displayFS));
    if (!updateProg || !displayProg) return { error: "shader link failed" };

    const verts = new Float32Array([-1, -1, 3, -1, -1, 3]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    let texA = createTex(), texB = createTex();
    let fboA = createFBO(texA), fboB = createFBO(texB);
    let readingFromA = true;

    function reseed() {
        opts.seed(gl, texA, simSize);
        readingFromA = true;
    }
    reseed();

    if (reseedOnTap) {
        canvas.addEventListener("click", reseed);
        canvas.addEventListener("touchend", function (e) { e.preventDefault(); reseed(); });
    }

    let startTime = performance.now();
    let fpsAccum = 0, fpsCount = 0, lastFpsTime = startTime;
    let currentFps = 0;
    function frame() {
        const now = performance.now();
        const elapsed = (now - startTime) / 1000;
        fpsCount++;
        if (now - lastFpsTime > 1000) {
            currentFps = (fpsCount * 1000) / (now - lastFpsTime);
            fpsCount = 0; lastFpsTime = now;
        }

        gl.useProgram(updateProg);
        gl.bindVertexArray(vao);
        gl.viewport(0, 0, simSize, simSize);
        // Demo-specific uniforms
        if (opts.updateUniforms) opts.updateUniforms(gl, updateProg, elapsed);

        for (let s = 0; s < stepsPerFrame; s++) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, readingFromA ? texA : texB);
            gl.bindFramebuffer(gl.FRAMEBUFFER, readingFromA ? fboB : fboA);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            readingFromA = !readingFromA;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(displayProg);
        if (opts.displayUniforms) opts.displayUniforms(gl, displayProg, elapsed);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readingFromA ? texA : texB);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        if (opts.onFrame) opts.onFrame(currentFps, elapsed);
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return {
        ok: true,
        gl, vao, updateProg, displayProg,
        reseed,
        getFps: () => currentFps,
    };
}
