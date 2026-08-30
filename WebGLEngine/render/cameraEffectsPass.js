// FILE: render/cameraEffectsPass.js -- v4188
//
// The GLSL half of render/chromaKeyModel.mjs and render/chuckCloseModel.mjs, plus a minimal raw-WebGL2
// runner. Raw GL and not three.js because main.js renders through render/voxelrenderer.js on raw WebGL2 --
// a camera effect that needed three loaded would be unusable from the engine it is meant to plug into.
//
// *** THE SHADERS MIRROR THE .mjs FILES LINE FOR LINE ON PURPOSE. *** Two implementations of one rule drift,
// and the drift is invisible: the CPU gate stays green while the screen shows something else. So the same
// constants, the same smoothstep, the same dark floor -- and tools/ship/cameraEffects-selfcheck.mjs renders
// the shader in a real browser and compares its pixels against the model rather than trusting the likeness.
"use strict";

export const VERTEX_SHADER = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/** Shared helpers: the colour spaces, identical to chromaKeyModel.mjs. */
export const COLOUR_GLSL = `
vec2 cbcr(vec3 c) {
    return vec2(dot(c, vec3(-0.168736, -0.331264, 0.5)), dot(c, vec3(0.5, -0.418688, -0.081312)));
}
vec2 chromaticity(vec3 c) {
    float s = c.r + c.g + c.b;
    if (s <= 1e-6) return vec2(1.0 / 3.0);
    return vec2(c.r / s, c.g / s);
}`;

/**
 * CHROMA KEY. alpha 0 is backdrop, 1 is subject.
 * The min() of the two verdicts is the measured result from the model's header: chromaticity holds the hue
 * through a SHADOWED fold, Cb/Cr holds the chroma through a BLOWN highlight, and each covers the other's
 * blind end. Wrong answers over eleven labelled pixels: RGB 3, YCbCr 2, chromaticity 1, both 0.
 */
export const CHROMA_KEY_GLSL = `
float keyAlphaChroma(vec3 c, vec3 k, float sim, float smo, float darkFloor) {
    if (c.r + c.g + c.b < darkFloor) return 1.0;      // no reliable hue near black -- an unlit pixel is subject
    return smoothstep(sim, sim + smo, length(chromaticity(c) - chromaticity(k)));
}
float keyAlphaY(vec3 c, vec3 k, float sim, float smo) {
    return smoothstep(sim, sim + smo, length(cbcr(c) - cbcr(k)));
}
float keyAlpha(vec3 c, vec3 k, float sim, float smo, float darkFloor) {
    return min(keyAlphaChroma(c, k, sim, smo, darkFloor), keyAlphaY(c, k, sim, smo));
}
vec3 despill(vec3 c, vec3 k, float amount) {
    int ki = (k.g >= k.r && k.g >= k.b) ? 1 : ((k.b >= k.r) ? 2 : 0);
    float v = (ki == 1) ? c.g : ((ki == 2) ? c.b : c.r);
    float cap = (ki == 1) ? (c.r + c.b) * 0.5 : ((ki == 2) ? (c.r + c.g) * 0.5 : (c.g + c.b) * 0.5);
    float nv = (v > cap) ? v + (cap - v) * amount : v;
    if (ki == 1) return vec3(c.r, nv, c.b);
    if (ki == 2) return vec3(c.r, c.g, nv);
    return vec3(nv, c.g, c.b);
}`;

/**
 * CHUCK CLOSE. Each cell is one mark, coloured by the cell's mean.
 *
 * *** THE MEAN IS SAMPLED HERE AND EXACT ON THE CPU, AND THAT DIFFERENCE IS DECLARED. *** The camera texture
 * is NPOT with no mipmaps (see render/cameraTexture.js -- asking for one yields black), so there is no
 * textureLod to average with, and a cell of a 1280-wide frame at grid 48 is ~27 pixels across: 700-odd taps
 * per pixel is not a shader. This takes TAPS x TAPS evenly spaced samples instead. That is an approximation
 * of chuckCloseModel.mjs's exact mean and the gate measures the gap rather than asserting there is none.
 */
export const CHUCK_CLOSE_GLSL = `
const int TAPS = 5;
vec3 cellMean(sampler2D tex, vec2 cellOrigin, vec2 cellSize) {
    vec3 sum = vec3(0.0);
    for (int j = 0; j < TAPS; j++) {
        for (int i = 0; i < TAPS; i++) {
            vec2 f = (vec2(float(i), float(j)) + 0.5) / float(TAPS);
            sum += texture(tex, cellOrigin + f * cellSize).rgb;
        }
    }
    return sum / float(TAPS * TAPS);
}
float markCoverage(vec2 f, int kind, float gap) {
    vec2 p = (f - 0.5) / (0.5 - gap);
    vec2 a = abs(p);
    if (kind == 0) return (a.x <= 1.0 && a.y <= 1.0) ? 1.0 : 0.0;          // square
    if (kind == 1) return ((a.x + a.y) <= 1.0) ? 1.0 : 0.0;                // lozenge
    if (kind == 2) return (length(p) <= 1.0) ? 1.0 : 0.0;                  // disc
    float r = length(p);                                                    // concentric
    if (r > 1.0) return 0.0;
    return (r > 0.55 && r < 0.85) ? 0.45 : 1.0;
}
vec3 punch(vec3 c, float k) { return clamp(0.5 + (c - 0.5) * k, 0.0, 1.0); }`;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec4 uCover;          // sx, sy, ox, oy from coverUV()
uniform vec3 uKey;
uniform float uSimilarity, uSmoothness, uDarkFloor, uDespill;
uniform float uKeyOn, uCloseOn;
uniform float uGrid, uGap, uContrast;
uniform int uMark;
uniform vec3 uBackdrop;       // what replaces the keyed-out backdrop
${COLOUR_GLSL}
${CHROMA_KEY_GLSL}
${CHUCK_CLOSE_GLSL}
vec2 srcUv(vec2 uv) { return uv * uCover.xy + uCover.zw; }
void main() {
    vec3 col;
    float a = 1.0;
    if (uCloseOn > 0.5) {
        float g = max(1.0, floor(uGrid));
        vec2 cell = floor(vUv * g);
        vec2 f = vUv * g - cell;
        // the cell's footprint in SOURCE uv, so the mean is taken over the region the mark stands for
        vec2 o0 = srcUv(cell / g), o1 = srcUv((cell + 1.0) / g);
        col = punch(cellMean(uTex, o0, o1 - o0), uContrast);
        if (uKeyOn > 0.5) a = keyAlpha(col, uKey, uSimilarity, uSmoothness, uDarkFloor);
        if (uKeyOn > 0.5 && a > 0.0) col = despill(col, uKey, uDespill);
        float m = markCoverage(f, uMark, uGap);
        col = mix(uBackdrop, col, m * a);
    } else {
        col = texture(uTex, srcUv(vUv)).rgb;
        if (uKeyOn > 0.5) {
            a = keyAlpha(col, uKey, uSimilarity, uSmoothness, uDarkFloor);
            if (a > 0.0) col = despill(col, uKey, uDespill);
            col = mix(uBackdrop, col, a);
        }
    }
    fragColor = vec4(col, 1.0);
}`;

/** A fullscreen-quad program on raw WebGL2. Returns { draw, dispose } or throws with the compile log. */
export function makeCameraEffectsPass(gl) {
    const compile = (type, src) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(sh);
            gl.deleteShader(sh);
            throw new Error("cameraEffectsPass shader: " + log);   // thrown, never swallowed: a silent black screen is the worst outcome
        }
        return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.bindAttribLocation(prog, 0, "aPos");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("cameraEffectsPass link: " + gl.getProgramInfoLog(prog));

    const vao = gl.createVertexArray();
    const buf = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one big triangle
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const U = {};
    for (const n of ["uTex", "uCover", "uKey", "uSimilarity", "uSmoothness", "uDarkFloor", "uDespill",
                     "uKeyOn", "uCloseOn", "uGrid", "uGap", "uContrast", "uMark", "uBackdrop"]) {
        U[n] = gl.getUniformLocation(prog, n);
    }
    return {
        program: prog,
        draw(texture, o = {}) {
            gl.useProgram(prog);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.uniform1i(U.uTex, 0);
            const c = o.cover || { sx: 1, sy: 1, ox: 0, oy: 0 };
            gl.uniform4f(U.uCover, c.sx, c.sy, c.ox, c.oy);
            const k = o.key || [0.05, 0.75, 0.15];
            gl.uniform3f(U.uKey, k[0], k[1], k[2]);
            const bd = o.backdrop || [0, 0, 0];
            gl.uniform3f(U.uBackdrop, bd[0], bd[1], bd[2]);
            gl.uniform1f(U.uSimilarity, o.similarity ?? 0.08);
            gl.uniform1f(U.uSmoothness, o.smoothness ?? 0.06);
            gl.uniform1f(U.uDarkFloor, o.darkFloor ?? 0.12);
            gl.uniform1f(U.uDespill, o.despill ?? 1.0);
            gl.uniform1f(U.uKeyOn, o.keyOn ? 1 : 0);
            gl.uniform1f(U.uCloseOn, o.closeOn ? 1 : 0);
            gl.uniform1f(U.uGrid, o.grid ?? 48);
            gl.uniform1f(U.uGap, o.gap ?? 0.06);
            gl.uniform1f(U.uContrast, o.contrast ?? 1.15);
            gl.uniform1i(U.uMark, o.mark ?? 1);
            gl.bindVertexArray(vao);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.bindVertexArray(null);
        },
        dispose() { try { gl.deleteProgram(prog); gl.deleteVertexArray(vao); gl.deleteBuffer(buf); } catch {} },
    };
}
