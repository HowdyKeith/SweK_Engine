// render/fxaaPass.js
// A real GL post-process pass: the finished frame (bloom's composite, or bloom-then-phosphor's when the CRT
// pass is also on) is captured into this pass's own FBO, then a single fullscreen FXAA shader draws the
// anti-aliased result onward -- to the screen by default, or to outputFBO when a downstream pass (phosphor)
// needs to run after it, the exact redirect convention render/bloomPass.js already established for the same
// reason ("phosphor pass redirects the final composite here when active (null = screen)"). Fully opt-in
// (ui/graphicsSettings.js's "fxaa" toggle, default OFF); if the shader fails to compile it disables itself
// and the normal path is untouched, matching render/phosphorPass.js's own fallback convention.
//
// GAP THIS CLOSES, VERIFIED BY GREP NOT ASSUMED: render/ has extensive postprocessing -- bloom, godrays, SSR,
// the CRT/phosphor pass, the whole swiftShaderPass roster -- and, before this file, no screen-space
// anti-aliasing pass of any kind. That is exactly the situation where hardware MSAA is unavailable (this
// engine's effect chain runs entirely in off-screen render targets, not straight to the backbuffer).
//
// THE ALGORITHM, NOT A PACKAGE. The backlog item that logged this gap named mattdesl/three-shader-fxaa (MIT)
// as a wrapper not worth adopting as written (an old r69-78 EffectComposer/ShaderPass binding) around the
// technique that IS worth taking: NVIDIA's public FXAA, in the small, renderer-agnostic 5-tap shape almost
// every MIT/public-domain GLSL port of it converges on. Cross-checked directly, not assumed from memory: this
// tree's own vendored three.webgpu.js was grepped first and carries no FXAA implementation at all (one doc
// comment mentions FXAA only as an example of an effect needing sRGB input, nothing to copy); the underlying
// public algorithm was then confirmed against mattdesl/glsl-fxaa's actual source (fetched directly, not
// recalled) -- same NW/NE/SW/SE/M five-sample pattern, same BT.601 luma weights (0.299, 0.587, 0.114), and the
// exact published tuning constants FXAA_REDUCE_MIN = 1/128, FXAA_REDUCE_MUL = 1/8, FXAA_SPAN_MAX = 8.0 used
// below verbatim. What follows is this tree's own GLSL 300 es authoring (this file's own VS/FS, its own
// uniform names, its own class shape matching phosphorPass.js/bloomPass.js) built from that confirmed
// algorithm shape, not a copy of glsl-fxaa's or anyone else's source file.
//
// HOW IT WORKS, IN ONE PARAGRAPH: sample luma at the 4 diagonal neighbours and the centre; a big local
// contrast (max-min luma) means an edge is nearby. Build a blend DIRECTION from how luma differs
// diagonally (horizontal-looking edges push one way, vertical the other), normalise it against the smaller
// of the two axis differences (so a direction is still found even when contrast is otherwise small, floored
// by FXAA_REDUCE_MIN so a perfectly flat 2x2 block never divides by ~0), clamp its reach to FXAA_SPAN_MAX
// texels, and take two blends along that direction -- a narrow one (rgbA) and a wider one (rgbB). If the wide
// blend's luma falls outside the local [min,max] range it overshot onto more geometry than this edge, and the
// narrow blend is used instead. In a flat region the direction is ~(0,0), so both blends land on the centre
// sample and the pixel is returned essentially unchanged -- identity preservation falls out of the same
// formula, it is not a separate early-exit branch.
"use strict";

// Exported as named string constants, not inlined in the class -- the tree's own WGSL-sabotage convention
// (see e.g. physics/render/fresnelF82Wgsl.mjs, ui/barycentricWireframe.js's WIREFRAME_FRAG_GLSL), so
// tools/ship/fxaaPass-selfcheck.mjs can .replace() one exact substring of the REAL compiled source and
// compile that directly, rather than reconstructing a class instance around modified source (fragile: an
// earlier round's blob-URL dynamic-import sabotage approach was replaced with exactly this shape for the
// same reason -- fewer moving parts between "the text that was changed" and "the program that ran").
export const FXAA_VERT_GLSL = `#version 300 es
out vec2 vUV;
void main() {
  vec2 uv = vec2((gl_VertexID == 1) ? 2.0 : 0.0, (gl_VertexID == 2) ? 2.0 : 0.0);
  vUV = uv;
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}`;

export const FXAA_FRAG_GLSL = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 frag;
uniform sampler2D uTex;
uniform vec2 uRes;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);
const float FXAA_REDUCE_MIN = 1.0 / 128.0;
const float FXAA_REDUCE_MUL = 1.0 / 8.0;
const float FXAA_SPAN_MAX = 8.0;

void main() {
  vec2 texel = 1.0 / uRes;
  vec2 uv = vUV;

  vec3 rgbNW = texture(uTex, uv + vec2(-1.0, -1.0) * texel).rgb;
  vec3 rgbNE = texture(uTex, uv + vec2( 1.0, -1.0) * texel).rgb;
  vec3 rgbSW = texture(uTex, uv + vec2(-1.0,  1.0) * texel).rgb;
  vec3 rgbSE = texture(uTex, uv + vec2( 1.0,  1.0) * texel).rgb;
  vec3 rgbM  = texture(uTex, uv).rgb;

  float lumaNW = dot(rgbNW, LUMA);
  float lumaNE = dot(rgbNE, LUMA);
  float lumaSW = dot(rgbSW, LUMA);
  float lumaSE = dot(rgbSE, LUMA);
  float lumaM  = dot(rgbM,  LUMA);

  float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
  float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));

  vec2 dir;
  dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
  dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));

  float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcpDirMin, vec2(-FXAA_SPAN_MAX), vec2(FXAA_SPAN_MAX)) * texel;

  vec3 rgbA = 0.5 * (
      texture(uTex, uv + dir * (1.0 / 3.0 - 0.5)).rgb +
      texture(uTex, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (
      texture(uTex, uv + dir * -0.5).rgb +
      texture(uTex, uv + dir *  0.5).rgb);

  float lumaB = dot(rgbB, LUMA);
  vec3 result = (lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB;
  frag = vec4(result, 1.0);
}`;

export class FxaaPass {
    constructor(gl, width, height) {
        this.gl = gl;
        this.width = Math.max(1, width | 0);
        this.height = Math.max(1, height | 0);
        this.ok = false;
        this.enabled = false;
        this.outputFBO = null;   // redirected to phosphorPass.inputFBO when that pass is also active (null = screen)

        try {
            this.prog = this._compile(FXAA_VERT_GLSL, FXAA_FRAG_GLSL);
            this.vao = gl.createVertexArray();   // empty VAO for gl_VertexID triangle
            this._loc = { uTex: gl.getUniformLocation(this.prog, "uTex"), uRes: gl.getUniformLocation(this.prog, "uRes") };
            this._buildTarget();
            this.ok = true;
        } catch (e) {
            console.warn("[fxaa] disabled -- shader/setup failed:", e && e.message);
            this.ok = false;
        }
    }

    _compile(vsSrc, fsSrc) {
        const gl = this.gl;
        const mk = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error("compile: " + log); }
            return s;
        };
        const vs = mk(gl.VERTEX_SHADER, vsSrc), fs = mk(gl.FRAGMENT_SHADER, fsSrc);
        const p = gl.createProgram();
        gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
        gl.deleteShader(vs); gl.deleteShader(fs);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { const log = gl.getProgramInfoLog(p); gl.deleteProgram(p); throw new Error("link: " + log); }
        return p;
    }

    _buildTarget() {
        const gl = this.gl;
        if (this.tex) gl.deleteTexture(this.tex);
        if (this.fbo) gl.deleteFramebuffer(this.fbo);
        this.tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    resize(width, height) {
        width = Math.max(1, width | 0); height = Math.max(1, height | 0);
        if (width === this.width && height === this.height) return;
        this.width = width; this.height = height;
        if (this.ok) this._buildTarget();
    }

    // The FBO an upstream pass (bloom) should composite into instead of the screen.
    get inputFBO() { return this.fbo; }

    // Draw the stored frame through the FXAA shader, to outputFBO (or the screen when null).
    render() {
        if (!this.ok || !this.enabled) return;
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.outputFBO || null);
        gl.viewport(0, 0, this.width, this.height);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.useProgram(this.prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.uniform1i(this._loc.uTex, 0);
        gl.uniform2f(this._loc.uRes, this.width, this.height);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }
}
