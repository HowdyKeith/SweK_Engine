// @ts-check
// WebGLEngine/render/crtPass.js -- v4119
//
// THE CRT POST-PROCESS, ON THE GPU. Its GLSL is a LINE-FOR-LINE MIRROR of render/crtModel.js.
//
// *** THE TWO FILES ARE A MATCHED PAIR AND THAT IS THE WHOLE DESIGN. *** A CRT filter is the kind of thing
// that can only ever be judged by looking at it, which in this tree means it cannot be judged at all. So the
// same transfer function exists twice -- there in plain JavaScript, here in GLSL -- and
// tools/ship/crtPass-selfcheck.mjs renders a known image through both and requires them to agree to within one
// 8-bit level. If somebody "improves" one, the gate fails; there is nowhere for a quiet divergence to live.
//
// *** texelFetch, NOT texture(). *** Integer coordinates, no filtering, no mip selection -- so the GPU samples
// exactly the texel the CPU model indexes. With bilinear filtering the hardware interpolates at a precision
// JavaScript cannot reproduce, and the comparison would have to slacken into "close enough", which is where a
// real disagreement would hide.
//
// Input is anything texImage2D takes (a 2D canvas, an image, a video); output is this pass's own canvas, ready
// to be a CanvasTexture or drawn anywhere. It owns a WebGL2 context and nothing else.
"use strict";
import { DEFAULTS, PRESETS } from "./crtModel.js";

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

// *** EVERY BLOCK BELOW NAMES THE crtModel.js FUNCTION IT MIRRORS. *** That is not decoration: when the gate
// reports a mismatch, the first question is which of the two moved, and the pairing has to be readable.
const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uTex;
uniform vec2  uSize;        // output size in pixels
uniform float uCurvature, uScanlines, uScanDepth, uMaskPitch, uMaskDepth, uVignette, uBleed, uGain;
uniform vec3  uTint;
out vec4 fragColor;

vec3 fetch(int x, int y) {
    int mx = int(uSize.x) - 1, my = int(uSize.y) - 1;
    return texelFetch(uTex, ivec2(clamp(x, 0, mx), clamp(y, 0, my)), 0).rgb;
}

void main() {
    // *** IMAGE SPACE, NOT GL SPACE. *** gl_FragCoord.y runs bottom-up; crtModel.js indexes rows top-down, and
    // the scanline phase depends on which row you are on. Flipping here rather than anywhere else keeps ONE
    // coordinate convention across both implementations.
    int px = int(gl_FragCoord.x);
    int py = int(uSize.y) - 1 - int(gl_FragCoord.y);
    float u = (float(px) + 0.5) / uSize.x;
    float v = (float(py) + 0.5) / uSize.y;

    // --- barrel() -------------------------------------------------------------------------------
    float cx = u * 2.0 - 1.0, cy = v * 2.0 - 1.0;
    float r2 = cx * cx + cy * cy;
    float f  = 1.0 + uCurvature * r2;
    float su = (cx * f) * 0.5 + 0.5, sv = (cy * f) * 0.5 + 0.5;
    if (su < 0.0 || su > 1.0 || sv < 0.0 || sv > 1.0) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

    int sx = clamp(int(floor(su * uSize.x)), 0, int(uSize.x) - 1);
    int sy = clamp(int(floor(sv * uSize.y)), 0, int(uSize.y) - 1);

    // --- horizontal beam bleed (three taps, weights summing to exactly 1) -----------------------
    vec3 c = fetch(sx, sy);
    if (uBleed > 0.0) {
        vec3 l = fetch(sx - 1, sy), r = fetch(sx + 1, sy);
        float side = uBleed * 0.5, mid = 1.0 - uBleed;
        c = l * side + c * mid + r * side;
    }

    // --- scanline() -----------------------------------------------------------------------------
    // ROW EDGE, not pixel centre -- see crtModel.js's scanline(). At two rows per line the centre-sampled
    // phase lands on a cosine zero for every row and the scanlines DISAPPEAR into a flat dim, identically on
    // both sides. Mirrored here so the pair stays a pair.
    float vRow = float(py) / uSize.y;
    float sc = 1.0 - uScanDepth * 0.5 * (1.0 - cos(vRow * uScanlines * 6.28318530717958647692));

    // --- mask() ---------------------------------------------------------------------------------
    int idx = int(mod(float(px), uMaskPitch)) % 3;
    vec3 mk = vec3(1.0 - uMaskDepth);
    if (idx == 0) mk.r = 1.0 + uMaskDepth * 2.0;
    else if (idx == 1) mk.g = 1.0 + uMaskDepth * 2.0;
    else mk.b = 1.0 + uMaskDepth * 2.0;

    // --- vignette() -----------------------------------------------------------------------------
    float vg = clamp(1.0 - uVignette * r2 * 0.5, 0.0, 1.0);

    float k = uGain * sc * vg;
    fragColor = vec4(clamp(c * mk * k * uTint, 0.0, 1.0), 1.0);
}`;

/** @param {WebGL2RenderingContext} gl @param {number} type @param {string} src @returns {WebGLShader} */
function compile(gl, type, src) {
    const s = gl.createShader(type);
    if (!s) throw new Error("crtPass shader: createShader returned null");
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("crtPass shader: " + gl.getShaderInfoLog(s));
    return s;
}

/**
 * A CRT pass with its own canvas and WebGL2 context.
 *
 * `makeCrtPass(w, h)` -> { canvas, render(source, params), resize(w,h), readPixels(), dispose() }
 * A missing WebGL2 context returns null rather than throwing: a caller that cannot have the effect should be
 * able to fall through to drawing the source unchanged, not lose the page.
 * @param {number} width @param {number} height @param {{ canvas?: HTMLCanvasElement }} [opts]
 */
export function makeCrtPass(width, height, opts = {}) {
    const canvas = opts.canvas || (typeof document !== "undefined" ? document.createElement("canvas") : null);
    if (!canvas) return null;
    canvas.width = width; canvas.height = height;
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!gl) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("crtPass link: " + gl.getProgramInfoLog(prog));

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // NEAREST on both axes and no wrap: the sampling has to be exactly what crtModel.js does.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    /** @type {Record<string, WebGLUniformLocation | null>} */
    const U = {};
    for (const n of ["uTex", "uSize", "uCurvature", "uScanlines", "uScanDepth", "uMaskPitch",
                     "uMaskDepth", "uVignette", "uBleed", "uGain", "uTint"]) U[n] = gl.getUniformLocation(prog, n);

    // *** GL AND CANVAS ARE RE-CAPTURED HERE, NON-NULL, FOR THE CLOSURES BELOW. *** The two early returns
    // above prove both non-null for the REST OF THIS FUNCTION'S OWN BODY, but that narrowing does not cross
    // into a nested function's body -- TypeScript cannot see that render/readPixels/resize/dispose only ever
    // run after makeCrtPass has already returned successfully. Rather than re-checking or asserting inside
    // each one, the proof is done once, here, and the closures close over these instead.
    const GL = gl, CV = canvas;

    /** @param {TexImageSource | Uint8Array | Uint8ClampedArray} source
     * @param {import("./crtModel.js").CrtParams} [params] @returns {HTMLCanvasElement} */
    function render(source, params = DEFAULTS) {
        const p = { ...DEFAULTS, ...params };
        GL.bindTexture(GL.TEXTURE_2D, tex);
        // FLIP_Y stays FALSE: texel row 0 must be the source's FIRST row, because crtModel.js indexes rows
        // from the top and the shader flips gl_FragCoord to match. Turning this on would move the scanlines
        // half a period and nothing else, which is exactly the kind of bug a look would never catch.
        GL.pixelStorei(GL.UNPACK_FLIP_Y_WEBGL, false);
        if (source instanceof Uint8Array || source instanceof Uint8ClampedArray) {
            GL.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, CV.width, CV.height, 0, GL.RGBA,
                          GL.UNSIGNED_BYTE, source instanceof Uint8Array ? source : new Uint8Array(source));
        } else {
            GL.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, GL.RGBA, GL.UNSIGNED_BYTE, source);
        }
        GL.viewport(0, 0, CV.width, CV.height);
        GL.useProgram(prog);
        GL.bindVertexArray(vao);
        GL.uniform1i(U.uTex, 0);
        GL.uniform2f(U.uSize, CV.width, CV.height);
        GL.uniform1f(U.uCurvature, p.curvature);
        GL.uniform1f(U.uScanlines, p.scanlines);
        GL.uniform1f(U.uScanDepth, p.scanDepth);
        GL.uniform1f(U.uMaskPitch, p.maskPitch);
        GL.uniform1f(U.uMaskDepth, p.maskDepth);
        GL.uniform1f(U.uVignette, p.vignette);
        GL.uniform1f(U.uBleed, p.bleed);
        GL.uniform1f(U.uGain, p.gain);
        GL.uniform3f(U.uTint, p.tint[0], p.tint[1], p.tint[2]);
        GL.drawArrays(GL.TRIANGLES, 0, 3);
        return CV;
    }

    /** Read back in IMAGE ORDER (top row first) -- readPixels is bottom-up, so it is flipped here once.
     * @returns {Uint8ClampedArray} */
    function readPixels() {
        const w = CV.width, h = CV.height;
        const raw = new Uint8Array(w * h * 4);
        GL.readPixels(0, 0, w, h, GL.RGBA, GL.UNSIGNED_BYTE, raw);
        const out = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) out.set(raw.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
        return out;
    }

    return {
        canvas, gl,
        render, readPixels,
        /** @param {number} w @param {number} h */
        resize(w, h) { CV.width = w; CV.height = h; },
        dispose() { try { GL.getExtension("WEBGL_lose_context")?.loseContext(); } catch (e) {} },
    };
}

export { PRESETS, DEFAULTS };
