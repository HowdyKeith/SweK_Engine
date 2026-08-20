// render/phosphorPass.js — v1074
// A real GL post-process pass: bloom composites the finished frame into this
// pass's FBO, then a fullscreen CRT shader draws it to the screen with barrel
// distortion, scanlines, a phosphor monochrome tint, phosphor glow, chromatic
// aberration, and vignette. Fully opt-in (window.phosphor / Settings); if the
// shader fails to compile it disables itself and the normal path is untouched.
//
// The tint defaults to the live --game-color CSS var (so it follows the Pip-Boy
// EffectColor wired in v1073), falling back to Pip-Boy green.

const VS = `#version 300 es
out vec2 vUV;
void main() {
  vec2 uv = vec2((gl_VertexID == 1) ? 2.0 : 0.0, (gl_VertexID == 2) ? 2.0 : 0.0);
  vUV = uv;
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 frag;
uniform sampler2D uTex;
uniform vec2  uRes;
uniform float uTime;
uniform vec3  uTint;        // phosphor color
uniform float uTintAmt;     // 0..1 monochrome-toward-phosphor
uniform float uScan;        // scanline strength
uniform float uBarrel;      // barrel curvature
uniform float uAberration;  // chromatic aberration (px)
uniform float uVignette;    // vignette strength
uniform float uBloom;       // phosphor glow
uniform float uFlicker;     // subtle brightness flicker

vec2 barrel(vec2 uv, float k) {
  vec2 c = uv * 2.0 - 1.0;
  float r2 = dot(c, c);
  c *= 1.0 + k * r2;
  return c * 0.5 + 0.5;
}

void main() {
  vec2 uv = barrel(vUV, uBarrel);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { frag = vec4(0.0, 0.0, 0.0, 1.0); return; }

  // chromatic aberration: split RGB sample along the radial direction
  vec2 dir = (uv - 0.5);
  vec2 ab = dir * (uAberration / uRes);
  vec3 col;
  col.r = texture(uTex, uv + ab).r;
  col.g = texture(uTex, uv).g;
  col.b = texture(uTex, uv - ab).b;

  // phosphor: push toward a monochrome tint by luminance
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 phosphor = uTint * lum;
  col = mix(col, phosphor, uTintAmt);

  // cheap phosphor bloom — soft additive glow from bright areas
  col += uTint * smoothstep(0.5, 1.0, lum) * uBloom;

  // scanlines (per drawing-buffer row)
  float sl = sin(uv.y * uRes.y * 3.14159265) * 0.5 + 0.5;
  col *= 1.0 - uScan * (1.0 - sl);

  // aperture-grille tint per column (very subtle RGB mask)
  float m = mod(gl_FragCoord.x, 3.0);
  vec3 mask = (m < 1.0) ? vec3(1.0, 0.92, 0.92) : (m < 2.0) ? vec3(0.92, 1.0, 0.92) : vec3(0.92, 0.92, 1.0);
  col *= mix(vec3(1.0), mask, 0.10);

  // gentle flicker
  col *= 1.0 - uFlicker * (sin(uTime * 8.0) * 0.5 + 0.5) * 0.03;

  // vignette
  float vig = 1.0 - dot(dir, dir) * uVignette * 2.0;
  col *= clamp(vig, 0.0, 1.0);

  frag = vec4(col, 1.0);
}`;

export class PhosphorPass {
    constructor(gl, width, height) {
        this.gl = gl;
        this.width = Math.max(1, width | 0);
        this.height = Math.max(1, height | 0);
        this.ok = false;
        this.enabled = false;

        // tunables
        this.tint = [0.10, 0.85, 0.30];   // Pip-Boy green fallback
        this.tintAmt = 0.85;
        this.scan = 0.22;
        this.barrel = 0.12;
        this.aberration = 1.6;
        this.vignette = 0.55;
        this.bloom = 0.18;
        this.flicker = 1.0;

        try {
            this.prog = this._compile(VS, FS);
            this.vao = gl.createVertexArray();   // empty VAO for gl_VertexID triangle
            this._loc = {};
            for (const n of ["uTex", "uRes", "uTime", "uTint", "uTintAmt", "uScan", "uBarrel", "uAberration", "uVignette", "uBloom", "uFlicker"]) {
                this._loc[n] = gl.getUniformLocation(this.prog, n);
            }
            this._buildTarget();
            this.ok = true;
        } catch (e) {
            console.warn("[phosphor] disabled — shader/setup failed:", e && e.message);
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

    // The FBO bloom should composite into (instead of the screen) when active.
    get inputFBO() { return this.fbo; }

    setTint(rgb01) { if (Array.isArray(rgb01) && rgb01.length >= 3) this.tint = [rgb01[0], rgb01[1], rgb01[2]]; }

    // Draw the stored frame to the screen with the CRT shader.
    render(time) {
        if (!this.ok || !this.enabled) return;
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.width, this.height);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.useProgram(this.prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.uniform1i(this._loc.uTex, 0);
        gl.uniform2f(this._loc.uRes, this.width, this.height);
        gl.uniform1f(this._loc.uTime, (time || performance.now()) * 0.001);
        gl.uniform3fv(this._loc.uTint, this.tint);
        gl.uniform1f(this._loc.uTintAmt, this.tintAmt);
        gl.uniform1f(this._loc.uScan, this.scan);
        gl.uniform1f(this._loc.uBarrel, this.barrel);
        gl.uniform1f(this._loc.uAberration, this.aberration);
        gl.uniform1f(this._loc.uVignette, this.vignette);
        gl.uniform1f(this._loc.uBloom, this.bloom);
        gl.uniform1f(this._loc.uFlicker, this.flicker);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }
}
