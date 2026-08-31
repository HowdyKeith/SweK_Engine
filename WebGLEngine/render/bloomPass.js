// FILE: render/bloomPass.js
// VERSION: v1
//
// Real bloom post-process. Pipeline:
//   1) Render scene into sceneFBO (RGBA8, full res, with depth buffer)
//   2) Brightness extract → brightFBO (half res), keep only pixels
//      with luminance > threshold
//   3) Horizontal blur → blurFBO_H (half res, 9-tap Gaussian)
//   4) Vertical blur   → blurFBO_V (half res, 9-tap Gaussian)
//   5) Composite scene + blur to default framebuffer with intensity
//
// Threshold ~0.85 means only saturated emissive surfaces bloom — the
// sun disc, lava, memory blocks, queen marker pulses. Diffuse-lit
// terrain stays clean.

const PASSTHROUGH_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main() {
    vUV = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uScene;
uniform float uThreshold;
void main() {
    vec3 c = texture(uScene, vUV).rgb;
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    // Soft threshold so the bloom edge isn't sharp
    float w = smoothstep(uThreshold, uThreshold + 0.15, lum);
    outColor = vec4(c * w, 1.0);
}`;

const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uTexel;       // pixel size in UV
uniform vec2 uDir;         // (1,0) horizontal, (0,1) vertical
// v4212 -- (u0,v0,u1,v1) of the region this fragment's EYE owns. (0,0,1,1) on a monitor, which makes every
// clamp below the identity and leaves the desktop path bit-for-bit what it was.
uniform vec4 uEyeRect;

const float W0 = 0.227027;
const float W1 = 0.194594;
const float W2 = 0.121622;
const float W3 = 0.054054;
const float W4 = 0.016216;

// *** v4212 -- IN STEREO THE SEAM IS THE MIDDLE OF THE TEXTURE, NOT ITS EDGE. *** An XRWebGLLayer hands both
// eyes ONE framebuffer with two viewports side by side, so this 9-tap kernel at the left eye's inner border
// reaches 4 texels -- 8 full-resolution pixels, since the blur runs at half res -- straight into the right
// eye. A bright window on one side then glows on the other side's inner border, where there is no light.
// GL_CLAMP_TO_EDGE does not help: it guards the edge of the TEXTURE, and this boundary is interior.
// SCISSORING DOES NOT HELP EITHER -- a scissor restricts WRITES, and this is a READ.
// The tap is clamped into the eye's own rect, inset by half a texel so it lands on the last texel CENTRE
// rather than on the boundary between two texels, where linear filtering would coin-flip into the neighbour.
vec3 tapClamped(vec2 uv) {
    vec2 h = uTexel * 0.5;
    return texture(uTex, clamp(uv, uEyeRect.xy + h, uEyeRect.zw - h)).rgb;
}

void main() {
    vec2 step = uTexel * uDir;
    vec3 sum = tapClamped(vUV) * W0;
    sum += tapClamped(vUV + step * 1.0) * W1;
    sum += tapClamped(vUV - step * 1.0) * W1;
    sum += tapClamped(vUV + step * 2.0) * W2;
    sum += tapClamped(vUV - step * 2.0) * W2;
    sum += tapClamped(vUV + step * 3.0) * W3;
    sum += tapClamped(vUV - step * 3.0) * W3;
    sum += tapClamped(vUV + step * 4.0) * W4;
    sum += tapClamped(vUV - step * 4.0) * W4;
    outColor = vec4(sum, 1.0);
}`;

// Round 52 — SSAO. Half-res depth-only AO. 8 rotated samples within a
// disc; samples with depth closer to camera than the current pixel
// (within radius band) count as occluders. Output: single-channel 0..1
// where 1 = unoccluded, 0 = fully occluded. Multiplied into scene
// color in the composite step.
const SSAO_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;

uniform sampler2D uSceneDepth;
uniform vec2 uViewport;       // half-res pixel size (W/2, H/2)
uniform float uRadius;        // world units of AO falloff
uniform float uBias;          // ignore samples within this depth delta

// 8 sample directions in unit disc — pre-distributed so they tile
// well after per-pixel rotation
const vec2 KERNEL[8] = vec2[](
    vec2( 0.95,  0.0 ), vec2(-0.95,  0.0 ),
    vec2( 0.0,   0.95), vec2( 0.0,  -0.95),
    vec2( 0.65,  0.65), vec2(-0.65,  0.65),
    vec2(-0.65, -0.65), vec2( 0.65, -0.65)
);

float linearizeDepth(float z) {
    float n = 0.1, f = 500.0;
    float ndc = z * 2.0 - 1.0;
    return (2.0 * n * f) / (f + n - ndc * (f - n));
}

void main() {
    float depth = texture(uSceneDepth, vUV).r;
    if (depth >= 0.999) { outColor = vec4(1.0); return; }

    float lDepth = linearizeDepth(depth);
    // Screen-space radius scales inversely with depth so far surfaces
    // sample a smaller region (no AO halo on horizon).
    vec2 step = (uRadius / max(1.0, lDepth)) / uViewport;

    // Per-pixel rotation — 4×4 tile of distinct angles to break up
    // banding without a noise texture.
    float idx = mod(gl_FragCoord.x, 4.0) + mod(gl_FragCoord.y, 4.0) * 4.0;
    float angle = idx * (6.2831853 / 16.0);
    float ca = cos(angle), sa = sin(angle);

    float occ = 0.0;
    for (int i = 0; i < 8; i++) {
        vec2 k = KERNEL[i];
        vec2 r = vec2(ca * k.x - sa * k.y, sa * k.x + ca * k.y);
        vec2 sUV = vUV + r * step;
        if (sUV.x < 0.0 || sUV.x > 1.0 || sUV.y < 0.0 || sUV.y > 1.0) continue;
        float sd = texture(uSceneDepth, sUV).r;
        if (sd >= 0.999) continue;
        float lSd = linearizeDepth(sd);
        // Sample is in front (closer) → occluder. Window the contribution
        // by uBias..uRadius so distant occluders don't dim the whole scene.
        float diff = lDepth - lSd;
        if (diff > uBias) {
            float w = 1.0 - smoothstep(uBias, uRadius, diff);
            occ += w;
        }
    }
    occ /= 8.0;
    // Output as multiplier — clamp to keep at most "halfway dark"
    float ao = clamp(1.0 - occ * 0.85, 0.15, 1.0);
    outColor = vec4(ao);
}`;

// Round 54 — volumetric god rays / crepuscular rays / light shafts.
// Classic Mitchell-style screen-space radial blur. Each fragment marches
// toward the sun's screen position; samples that are bright AND at the
// far plane (sky / sun disc) contribute, terrain silhouettes occlude.
// Half-res. Output is pure radial brightness — added on top of the
// scene in the composite step.
const GODRAYS_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;

uniform sampler2D uScene;
uniform sampler2D uSceneDepth;
uniform vec2 uSunPosUV;       // sun's NDC mapped to UV (0..1)
uniform float uVisibility;    // 0..1 — fade when sun is below horizon / far off-screen
uniform float uIntensity;     // overall multiplier
uniform float uThreshold;     // luminance gate; bright sky and sun pass

const int N_SAMPLES = 48;
const float DECAY = 0.965;
const float DENSITY = 0.9;

void main() {
    if (uVisibility < 0.001) { outColor = vec4(0.0); return; }
    vec2 deltaUV = (vUV - uSunPosUV) * (DENSITY / float(N_SAMPLES));
    vec2 uv = vUV;
    vec3 col = vec3(0.0);
    float illum = 1.0;
    for (int i = 0; i < N_SAMPLES; i++) {
        uv -= deltaUV;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
        float d = texture(uSceneDepth, uv).r;
        if (d >= 0.999) {
            // Sky / far. Add bright color, gated by luminance threshold.
            vec3 c = texture(uScene, uv).rgb;
            float lum = max(c.r, max(c.g, c.b));
            if (lum > uThreshold) {
                col += c * illum * (lum - uThreshold);
            }
        }
        illum *= DECAY;
    }
    col *= uIntensity * uVisibility / float(N_SAMPLES);
    outColor = vec4(col, 1.0);
}`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uSceneDepth;
uniform sampler2D uSSAO;
uniform sampler2D uGodRays;          // round 54
uniform float uBloomIntensity;
uniform float uVignetteStrength;
uniform vec4  uEyeRect;   // v4212 -- (u0,v0,u1,v1) of this eye; (0,0,1,1) on a monitor
uniform float uExposure;
uniform float uOutlineStrength;
uniform vec3  uOutlineColor;
uniform vec2  uTexelSize;
uniform float uSSAOStrength;
uniform float uGodRayStrength;       // round 54

// Round 13 — heat distortion uniforms
uniform int   uHeatCount;            // 0..8
uniform vec2  uHeatSourcesUV[8];     // screen-space UV [0..1]
uniform float uHeatRadii[8];         // UV-space falloff radius
uniform float uHeatStrength[8];      // 0..1 intensity per source
uniform float uHeatTime;             // wall-clock seconds for noise

// Round 48 — ACES filmic tone map.
vec3 aces(vec3 x) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// Round 49 — linearize a non-linear depth sample.
float linearizeDepth(float z) {
    float n = 0.1, f = 500.0;
    float ndc = z * 2.0 - 1.0;
    return (2.0 * n * f) / (f + n - ndc * (f - n));
}

void main() {
    // Round 13 — accumulate heat distortion strength at this pixel
    // by summing falloffs from each active heat source. Strength
    // peaks at the source center, falls off smoothly to zero past
    // the radius.
    vec2 sampleUV = vUV;
    if (uHeatCount > 0) {
        float heat = 0.0;
        for (int i = 0; i < 8; i++) {
            if (i >= uHeatCount) break;
            vec2 d = vUV - uHeatSourcesUV[i];
            // Squash Y less than X — heat rises, so the visible plume
            // is taller than wide.
            d.y *= 0.5;
            float r = max(uHeatRadii[i], 1e-4);
            float dist = length(d) / r;
            // Smooth falloff; bias toward area ABOVE the source so
            // distortion appears mostly above (rising heat, not below).
            float verticalBias = smoothstep(0.5, -0.5, (vUV.y - uHeatSourcesUV[i].y) / r);
            heat += uHeatStrength[i] * verticalBias * (1.0 - smoothstep(0.0, 1.0, dist));
        }
        heat = clamp(heat, 0.0, 1.5);
        if (heat > 0.001) {
            // Animated noise UV offset. Two octaves of sin give a
            // shimmering wave that's stable to look at but never
            // periodic-looking.
            float t = uHeatTime;
            vec2 offset = vec2(
                sin(vUV.x * 70.0 + vUV.y * 30.0 + t * 3.5) +
                sin(vUV.x * 35.0 + vUV.y * 95.0 - t * 2.7) * 0.6,
                cos(vUV.y * 80.0 + vUV.x * 25.0 + t * 4.1) +
                cos(vUV.x * 45.0 + vUV.y * 50.0 - t * 3.3) * 0.6
            );
            sampleUV = vUV + offset * 0.0035 * heat;
        }
    }

    vec3 scene = texture(uScene, sampleUV).rgb;
    vec3 bloom = texture(uBloom, sampleUV).rgb;
    vec3 col = (scene + bloom * uBloomIntensity) * uExposure;

    // Round 54 — god rays.
    if (uGodRayStrength > 0.0) {
        vec3 gr = texture(uGodRays, sampleUV).rgb;
        col += gr * uGodRayStrength;
    }

    // Round 52 — SSAO multiplier.
    if (uSSAOStrength > 0.0) {
        float ao = texture(uSSAO, sampleUV).r;
        ao = mix(1.0, ao, uSSAOStrength);
        col *= ao;
    }

    // Round 49 — Sobel on linearized depth.
    if (uOutlineStrength > 0.001) {
        float dC = texture(uSceneDepth, vUV).r;
        if (dC < 0.999) {
            float lC = linearizeDepth(dC);
            float lTL = linearizeDepth(texture(uSceneDepth, vUV + vec2(-uTexelSize.x, -uTexelSize.y)).r);
            float lT  = linearizeDepth(texture(uSceneDepth, vUV + vec2( 0.0,         -uTexelSize.y)).r);
            float lTR = linearizeDepth(texture(uSceneDepth, vUV + vec2( uTexelSize.x, -uTexelSize.y)).r);
            float lL  = linearizeDepth(texture(uSceneDepth, vUV + vec2(-uTexelSize.x,  0.0       )).r);
            float lR  = linearizeDepth(texture(uSceneDepth, vUV + vec2( uTexelSize.x,  0.0       )).r);
            float lBL = linearizeDepth(texture(uSceneDepth, vUV + vec2(-uTexelSize.x,  uTexelSize.y)).r);
            float lB  = linearizeDepth(texture(uSceneDepth, vUV + vec2( 0.0,          uTexelSize.y)).r);
            float lBR = linearizeDepth(texture(uSceneDepth, vUV + vec2( uTexelSize.x,  uTexelSize.y)).r);
            // Sobel kernels
            float gx = -lTL - 2.0 * lL - lBL + lTR + 2.0 * lR + lBR;
            float gy = -lTL - 2.0 * lT - lTR + lBL + 2.0 * lB + lBR;
            float grad = length(vec2(gx, gy));
            // Threshold scaled by depth so distant outlines don't drown
            // the screen; curve = 1.5% of linear-depth range.
            float threshold = lC * 0.015 + 0.04;
            float edge = smoothstep(threshold, threshold * 2.0, grad);
            // Outline color blends OVER scene; never makes pixels
            // brighter than they should be.
            col = mix(col, uOutlineColor, edge * uOutlineStrength);
        }
    }

    // Tone map after outline — outline color itself stays clamped.
    col = aces(col);

    // Vignette
    // *** v4212 -- vUV MINUS 0.5 IS THE CENTRE OF THE TARGET, AND IN STEREO THE CENTRE OF THE TARGET IS THE
    // BRIDGE OF YOUR NOSE. *** Two eyes side by side put UV 0.5 exactly on the seam, so each eye came out
    // brightest at its inner edge and darkest at its outer one -- measured at 0.25 in UV from each eye's real
    // centre, a quarter of the framebuffer's width. Normalising within the eye's own rect fixes it and, for
    // the full-frame rect a monitor passes, REDUCES ALGEBRAICALLY TO THE OLD LINE: (vUV - 0.5) / 1.0.
    vec2 eyeCentre = (uEyeRect.xy + uEyeRect.zw) * 0.5;
    vec2 eyeSize   = max(uEyeRect.zw - uEyeRect.xy, vec2(1e-6));
    vec2 ctr = (vUV - eyeCentre) / eyeSize;
    float dist2 = dot(ctr, ctr);
    float vig = 1.0 - uVignetteStrength * smoothstep(0.10, 0.55, dist2);
    col *= vig;

    outColor = vec4(col, 1.0);
}`;

export class BloomPass {
    constructor(gl, width, height) {
        this.gl = gl;
        this.outputFBO = null;   // v1074 — phosphor pass redirects the final composite here when active (null = screen)
        // Tuned for the palette: lava luminance ~0.58, memory ~0.83,
        // sun disc ~0.95. Threshold 0.55 catches all three; sand at
        // ~0.53 gets a faint warm glow which reads as desert haze.
        this.threshold = 0.55;
        this.intensity = 0.70;
        // Round 48 — tone-mapping + vignette
        this.exposure = 1.05;
        // v3829 — sqrt-mean auto-exposure seam. If a host assigns a controller from render/autoExposure.js and
        // feeds it the scene luminance (ctl.update(...)), its .value overrides the fixed exposure above. null =
        // manual exposure, unchanged behavior.
        this.autoExposureCtl = null;
        this.vignetteStrength = 0.45;
        // v4212 -- (u0, v0, u1, v1) of the region the CURRENT pass belongs to. The whole target unless a
        // stereo caller narrows it per eye; see setEyeRect(). Every shader that reads it reduces to its
        // pre-v4212 form for this value, so nothing on a monitor changes.
        this.eyeRect = [0, 0, 1, 1];
        // Round 49 — outline pass
        this.outlineStrength = 0.85;
        this.outlineColor = [0.05, 0.05, 0.08];
        // Round 52 — SSAO
        this.ssaoStrength = 0.85;       // 0 = off, 1 = full
        this.ssaoRadius   = 1.4;        // world units
        this.ssaoBias     = 0.05;
        // Round 54 — god rays
        this.godRayStrength  = 0.7;     // composite multiplier
        this.godRayIntensity = 1.5;     // per-pass intensity
        this.godRayThreshold = 0.55;    // luminance gate (sky / sun pass)
        // Round 13 — heat distortion
        this.heatSources = [];          // [{x,y,z,radius,strength}] world-space
        this.heatProjected = new Float32Array(8 * 2);  // UV array packed
        this.heatRadii = new Float32Array(8);
        this.heatStrength = new Float32Array(8);
        this.heatCount = 0;
        this.sunPosUV        = [0.5, 0.5];
        this.sunVisibility   = 0.0;     // updated each frame from main

        this._initFullscreenQuad();
        this._initPrograms();
        this.resize(width, height);
    }

    _initFullscreenQuad() {
        const gl = this.gl;
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,  3, -1,  -1, 3,
        ]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }

    _compileProgram(vsSrc, fsSrc, label) {
        const gl = this.gl;
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS))
            console.error(`[BloomPass:${label}] VS:`, gl.getShaderInfoLog(vs));
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS))
            console.error(`[BloomPass:${label}] FS:`, gl.getShaderInfoLog(fs));
        const p = gl.createProgram();
        gl.attachShader(p, vs); gl.attachShader(p, fs);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS))
            console.error(`[BloomPass:${label}] link:`, gl.getProgramInfoLog(p));
        return p;
    }

    _initPrograms() {
        this.brightProg    = this._compileProgram(PASSTHROUGH_VS, BRIGHT_FS,    "bright");
        this.blurProg      = this._compileProgram(PASSTHROUGH_VS, BLUR_FS,      "blur");
        this.ssaoProg      = this._compileProgram(PASSTHROUGH_VS, SSAO_FS,      "ssao");
        this.godRayProg    = this._compileProgram(PASSTHROUGH_VS, GODRAYS_FS,   "godrays");
        this.compositeProg = this._compileProgram(PASSTHROUGH_VS, COMPOSITE_FS, "composite");
    }

    _createColorTex(w, h) {
        const gl = this.gl;
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        // Round 136 — HDR scene color. Promote from RGBA8 to RGBA16F
        // (half-float) so emissive surfaces can output values > 1.0
        // and tone-mapping + bloom have headroom to work with. Without
        // this, scene values clamp to 1.0 in the FBO and the ACES
        // tonemap below has nothing to remap — bloom only catches
        // already-bright pixels, never "very bright" ones.
        //
        // Requires EXT_color_buffer_half_float for rendering. Widely
        // supported on modern GPUs. Falls back to RGBA8 cleanly if
        // the extension is missing.
        const ext = this._hdrExt ?? (this._hdrExt = gl.getExtension("EXT_color_buffer_half_float"));
        if (ext) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
            this._hdrEnabled = true;
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            this._hdrEnabled = false;
            if (!this._hdrWarned) {
                console.warn("[BloomPass] EXT_color_buffer_half_float not supported; falling back to LDR (8-bit) — bloom will be weaker");
                this._hdrWarned = true;
            }
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    }

    _createFBO(colorTex, depthAttachment) {
        const gl = this.gl;
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
        if (depthAttachment) {
            // Round 49 — depth is now a TEXTURE so the composite pass
            // can sample it for outline detection. Attached via
            // framebufferTexture2D instead of framebufferRenderbuffer.
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthAttachment, 0);
        }
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.warn("[BloomPass] FBO incomplete:", status.toString(16));
        }
        return fbo;
    }

    _createDepthTex(width, height) {
        const gl = this.gl;
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        // DEPTH_COMPONENT24 with UNSIGNED_INT, sample-able as float in shader
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24,
                      width, height, 0,
                      gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    }

    /**
     * v4212 -- narrow the post chain to ONE EYE's sub-rectangle of a shared XR framebuffer.
     * @param rect {u0,v0,u1,v1} in UV, or null/omitted to restore the full target.
     * Call it per eye between bind() and apply(); call setEyeRect(null) when leaving VR, or the desktop
     * inherits half a frame -- which is why exit() in main.js resets it rather than trusting the next entry.
     */
    setEyeRect(rect) {
        this.eyeRect = rect
            ? [rect.u0, rect.v0, rect.u1, rect.v1]
            : [0, 0, 1, 1];
    }

    resize(width, height) {
        const gl = this.gl;
        if (width === this.width && height === this.height) return;
        this.width = width;
        this.height = height;
        const halfW = Math.max(1, width  >> 1);
        const halfH = Math.max(1, height >> 1);
        this.halfW = halfW;
        this.halfH = halfH;

        // Clean up previous resources
        if (this.sceneTex) gl.deleteTexture(this.sceneTex);
        if (this.brightTex) gl.deleteTexture(this.brightTex);
        if (this.blurTexH) gl.deleteTexture(this.blurTexH);
        if (this.blurTexV) gl.deleteTexture(this.blurTexV);
        // Round 49 — sceneDepth is now a texture, not a renderbuffer
        if (this.sceneDepth) gl.deleteTexture(this.sceneDepth);
        if (this.sceneFBO) gl.deleteFramebuffer(this.sceneFBO);
        if (this.brightFBO) gl.deleteFramebuffer(this.brightFBO);
        if (this.blurFBO_H) gl.deleteFramebuffer(this.blurFBO_H);
        if (this.blurFBO_V) gl.deleteFramebuffer(this.blurFBO_V);

        // Scene FBO at full res with depth texture
        this.sceneTex   = this._createColorTex(width, height);
        this.sceneDepth = this._createDepthTex(width, height);
        this.sceneFBO = this._createFBO(this.sceneTex, this.sceneDepth);

        // Round 50 — depth copy FBO. After scene + entities render,
        // we blit the scene depth into this texture so particles +
        // water shaders can sample it WITHOUT the WebGL2 feedback-loop
        // restriction. (Sampling a texture currently bound as the FBO's
        // depth attachment is undefined behavior.)
        if (this.depthCopyTex) gl.deleteTexture(this.depthCopyTex);
        if (this.depthCopyFBO) gl.deleteFramebuffer(this.depthCopyFBO);
        this.depthCopyTex = this._createDepthTex(width, height);
        this.depthCopyFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthCopyFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depthCopyTex, 0);
        // Color attachment is required for completeness on some impls;
        // we don't write to it. Reuse the smallest possible color tex.
        if (!this.depthCopyColor) {
            this.depthCopyColor = this._createColorTex(1, 1);
            gl.bindTexture(gl.TEXTURE_2D, this.depthCopyColor);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        } else {
            gl.bindTexture(gl.TEXTURE_2D, this.depthCopyColor);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.depthCopyColor, 0);

        // Round 51 — scene COLOR copy FBO. SSR on water + future post
        // effects need to sample the opaque scene color while still
        // rendering into the same scene FBO. Blit color from sceneFBO
        // → colorCopyFBO before water renders.
        if (this.colorCopyTex) gl.deleteTexture(this.colorCopyTex);
        if (this.colorCopyFBO) gl.deleteFramebuffer(this.colorCopyFBO);
        this.colorCopyTex = this._createColorTex(width, height);
        this.colorCopyFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.colorCopyFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorCopyTex, 0);

        // Bright + blur FBOs at half res, no depth
        this.brightTex = this._createColorTex(halfW, halfH);
        this.brightFBO = this._createFBO(this.brightTex, null);

        this.blurTexH = this._createColorTex(halfW, halfH);
        this.blurFBO_H = this._createFBO(this.blurTexH, null);

        this.blurTexV = this._createColorTex(halfW, halfH);
        this.blurFBO_V = this._createFBO(this.blurTexV, null);

        // Round 52 — SSAO output texture at half-res, single channel
        // packed in RGBA. Cleanup old before recreating.
        if (this.ssaoTex) gl.deleteTexture(this.ssaoTex);
        if (this.ssaoFBO) gl.deleteFramebuffer(this.ssaoFBO);
        this.ssaoTex = this._createColorTex(halfW, halfH);
        this.ssaoFBO = this._createFBO(this.ssaoTex, null);

        // Round 54 — god ray output texture at half-res.
        if (this.godRayTex) gl.deleteTexture(this.godRayTex);
        if (this.godRayFBO) gl.deleteFramebuffer(this.godRayFBO);
        this.godRayTex = this._createColorTex(halfW, halfH);
        this.godRayFBO = this._createFBO(this.godRayTex, null);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // Round 50 — copy current scene depth to the depth-copy texture.
    // Call AFTER scene + entities render, BEFORE particles/water render.
    // Particles + water shaders sample depthCopyTex to compute soft
    // alpha and shoreline foam.
    copySceneDepth() {
        const gl = this.gl;
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.sceneFBO);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.depthCopyFBO);
        gl.blitFramebuffer(
            0, 0, this.width, this.height,
            0, 0, this.width, this.height,
            gl.DEPTH_BUFFER_BIT, gl.NEAREST,
        );
        // Restore the scene FBO as the bound target so subsequent
        // particle/water draws go where they expect.
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
    }

    // Round 51 — copy current scene color (opaque pass results) to
    // the color-copy texture. Used by water shader for SSR. Call right
    // after copySceneDepth(), before water renders.
    copySceneColor() {
        const gl = this.gl;
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.sceneFBO);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.colorCopyFBO);
        gl.blitFramebuffer(
            0, 0, this.width, this.height,
            0, 0, this.width, this.height,
            gl.COLOR_BUFFER_BIT, gl.LINEAR,
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
    }

    // Round 50/51 — accessors used by particle + water renderers.
    getSceneDepthTex() { return this.depthCopyTex; }
    getSceneColorTex() { return this.colorCopyTex; }

    // Call before scene rendering. Subsequent gl.bindFramebuffer(null)
    // calls in user code (none expected) would unbind the scene FBO.
    bind() {
        const gl = this.gl;
        // v648 — feedback-loop guard (matches the shadow-pass fix). The
        // post-process composite at the end of the previous frame binds
        // sceneTex to TEXTURE0 (line ~641) and sceneDepth to TEXTURE1/2
        // (lines ~689/715). Those bindings persist across frames, so when
        // the next frame's scene render begins with sceneFBO as the draw
        // target AND sceneTex still bound to a sampler, drawing entities
        // triggers "Feedback loop formed between Framebuffer and active
        // Texture". Clear units 0-2 explicitly.
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
        gl.viewport(0, 0, this.width, this.height);
    }

    // Call after all scene rendering. Runs the bloom passes and the
    // final composite to the default framebuffer.
    // Round 13 — set the heat-distortion sources for the next composite.
    // sources is an array of {x, y, z, radius, strength}. radius is in
    // world units; strength is 0..1. Projects each into screen UV using
    // the supplied camera's view-projection. Sources behind the camera
    // or outside the frustum are skipped.
    setHeatSources(sources, camera) {
        if (!sources || sources.length === 0 || !camera) {
            this.heatCount = 0;
            return;
        }
        const vp = camera.viewProj;
        if (!vp) { this.heatCount = 0; return; }
        let n = 0;
        for (let i = 0; i < sources.length && n < 8; i++) {
            const s = sources[i];
            const x = s.x, y = s.y, z = s.z;
            // Project world to clip
            const cx = vp[0]*x + vp[4]*y + vp[8]*z  + vp[12];
            const cy = vp[1]*x + vp[5]*y + vp[9]*z  + vp[13];
            const cz = vp[2]*x + vp[6]*y + vp[10]*z + vp[14];
            const cw = vp[3]*x + vp[7]*y + vp[11]*z + vp[15];
            if (cw <= 0) continue;     // behind camera
            const ndcX = cx / cw;
            const ndcY = cy / cw;
            const ndcZ = cz / cw;
            if (ndcZ < -1 || ndcZ > 1) continue;
            const u = ndcX * 0.5 + 0.5;
            const v = ndcY * 0.5 + 0.5;
            // Skip if completely off-screen with margin
            if (u < -0.2 || u > 1.2 || v < -0.2 || v > 1.2) continue;
            // UV-space radius — convert world radius to UV using cw (depth).
            // Closer sources render bigger plumes.
            const uvR = Math.min(0.6, (s.radius || 4) / Math.max(cw, 0.5) * 0.5);
            this.heatProjected[n * 2 + 0] = u;
            this.heatProjected[n * 2 + 1] = v;
            this.heatRadii[n] = uvR;
            this.heatStrength[n] = Math.min(1.5, s.strength || 1.0);
            n++;
        }
        this.heatCount = n;
    }

    /**
     * @param outRect  v4212 -- optional {x,y,width,height} IN PIXELS on the output framebuffer. Stereo passes
     *                 one eye's XRWebGLLayer viewport; a monitor passes nothing and gets the full target.
     *                 The blur's WRITES are scissored to the matching half-res box so the two eyes' passes do
     *                 not overwrite each other, while the clamp in the shader is what stops the READS
     *                 crossing -- both are needed and neither substitutes for the other.
     */
    apply(outRect = null) {
        const gl = this.gl;
        const eyeScissor = outRect ? {
            half: [Math.floor(outRect.x / 2), Math.floor(outRect.y / 2),
                   Math.ceil(outRect.width / 2), Math.ceil(outRect.height / 2)],
            full: [outRect.x, outRect.y, outRect.width, outRect.height],
        } : null;
        if (eyeScissor) gl.enable(gl.SCISSOR_TEST);
        const scissorHalf = () => { if (eyeScissor) gl.scissor(...eyeScissor.half); };
        const scissorFull = () => { if (eyeScissor) gl.scissor(...eyeScissor.full); };
        scissorHalf();

        // Pass 1 — brightness extract: scene → brightTex (half res)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.brightFBO);
        gl.viewport(0, 0, this.halfW, this.halfH);
        scissorHalf();
        gl.useProgram(this.brightProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
        gl.uniform1i(gl.getUniformLocation(this.brightProg, "uScene"), 0);
        gl.uniform1f(gl.getUniformLocation(this.brightProg, "uThreshold"), this.threshold);
        gl.bindVertexArray(this.vao);
        gl.disable(gl.DEPTH_TEST);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // Pass 2 — horizontal blur: brightTex → blurTexH
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFBO_H);
        gl.useProgram(this.blurProg);
        gl.bindTexture(gl.TEXTURE_2D, this.brightTex);
        gl.uniform1i(gl.getUniformLocation(this.blurProg, "uTex"), 0);
        gl.uniform2f(gl.getUniformLocation(this.blurProg, "uTexel"), 1.0 / this.halfW, 1.0 / this.halfH);
        gl.uniform4f(gl.getUniformLocation(this.blurProg, "uEyeRect"), this.eyeRect[0], this.eyeRect[1], this.eyeRect[2], this.eyeRect[3]);   // v4212
        gl.uniform2f(gl.getUniformLocation(this.blurProg, "uDir"), 1, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // Pass 3 — vertical blur: blurTexH → blurTexV
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFBO_V);
        gl.bindTexture(gl.TEXTURE_2D, this.blurTexH);
        gl.uniform2f(gl.getUniformLocation(this.blurProg, "uDir"), 0, 1);
        gl.uniform4f(gl.getUniformLocation(this.blurProg, "uEyeRect"), this.eyeRect[0], this.eyeRect[1], this.eyeRect[2], this.eyeRect[3]);   // v4212 -- re-uploaded: the vertical pass may follow a program change
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // Round 52 — Pass 3.5: SSAO at half-res from sceneDepth.
        // Safe to sample sceneDepth here because sceneFBO is not bound.
        if (this.ssaoStrength > 0.0) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.ssaoFBO);
            gl.viewport(0, 0, this.halfW, this.halfH);
            gl.useProgram(this.ssaoProg);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.sceneDepth);
            gl.uniform1i(gl.getUniformLocation(this.ssaoProg, "uSceneDepth"), 0);
            gl.uniform2f(gl.getUniformLocation(this.ssaoProg, "uViewport"), this.halfW, this.halfH);
            gl.uniform1f(gl.getUniformLocation(this.ssaoProg, "uRadius"), this.ssaoRadius);
            gl.uniform1f(gl.getUniformLocation(this.ssaoProg, "uBias"),   this.ssaoBias);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        // Round 54 — Pass 3.6: god rays at half-res. Marches each
        // pixel toward the sun's screen position, accumulating bright
        // sky pixels with decay. Output is additive over the scene.
        if (this.godRayStrength > 0.0 && this.sunVisibility > 0.0) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.godRayFBO);
            gl.viewport(0, 0, this.halfW, this.halfH);
            gl.useProgram(this.godRayProg);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
            gl.uniform1i(gl.getUniformLocation(this.godRayProg, "uScene"), 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.sceneDepth);
            gl.uniform1i(gl.getUniformLocation(this.godRayProg, "uSceneDepth"), 1);
            gl.uniform2f(gl.getUniformLocation(this.godRayProg, "uSunPosUV"),
                         this.sunPosUV[0], this.sunPosUV[1]);
            gl.uniform1f(gl.getUniformLocation(this.godRayProg, "uVisibility"), this.sunVisibility);
            gl.uniform1f(gl.getUniformLocation(this.godRayProg, "uIntensity"),  this.godRayIntensity);
            gl.uniform1f(gl.getUniformLocation(this.godRayProg, "uThreshold"),  this.godRayThreshold);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        // Pass 4 — composite scene + blur → default framebuffer (or phosphor FBO)
        // v4212 -- in stereo the output is the XRWebGLLayer's framebuffer and the destination is ONE EYE's
        // viewport within it, so the composite is placed rather than stretched over the whole target.
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.outputFBO || null);
        if (eyeScissor) { scissorFull(); gl.viewport(...eyeScissor.full); }
        else gl.viewport(0, 0, this.width, this.height);
        gl.useProgram(this.compositeProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
        gl.uniform1i(gl.getUniformLocation(this.compositeProg, "uScene"), 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.blurTexV);
        gl.uniform1i(gl.getUniformLocation(this.compositeProg, "uBloom"), 1);
        gl.uniform1f(gl.getUniformLocation(this.compositeProg, "uBloomIntensity"), this.intensity);
        // Round 48 — tone-mapping + vignette uniforms
        gl.uniform1f(gl.getUniformLocation(this.compositeProg, "uExposure"), this.autoExposureCtl ? this.autoExposureCtl.value : (this.exposure ?? 1.0));
        gl.uniform1f(gl.getUniformLocation(this.compositeProg, "uVignetteStrength"), this.vignetteStrength ?? 0.45);
        gl.uniform4f(gl.getUniformLocation(this.compositeProg, "uEyeRect"), this.eyeRect[0], this.eyeRect[1], this.eyeRect[2], this.eyeRect[3]);   // v4212 -- the vignette centres on THIS eye, not on the seam
        // Round 49 — outline uniforms + depth texture binding
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.sceneDepth);
        gl.uniform1i(gl.getUniformLocation(this.compositeProg, "uSceneDepth"), 2);
        gl.uniform1f(gl.getUniformLocation(this.compositeProg, "uOutlineStrength"), this.outlineStrength ?? 0.85);
        gl.uniform3fv(gl.getUniformLocation(this.compositeProg, "uOutlineColor"), this.outlineColor ?? [0.05, 0.05, 0.08]);
        gl.uniform2f(gl.getUniformLocation(this.compositeProg, "uTexelSize"), 1.0 / this.width, 1.0 / this.height);
        // Round 52 — SSAO multiplier binding
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.ssaoTex);
        gl.uniform1i(gl.getUniformLocation(this.compositeProg, "uSSAO"), 3);
        gl.uniform1f(gl.getUniformLocation(this.compositeProg, "uSSAOStrength"), this.ssaoStrength ?? 0.0);
        // Round 54 — god ray binding
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, this.godRayTex);
        gl.uniform1i(gl.getUniformLocation(this.compositeProg, "uGodRays"), 4);
        gl.uniform1f(gl.getUniformLocation(this.compositeProg, "uGodRayStrength"),
                     (this.sunVisibility > 0.0 ? this.godRayStrength : 0.0));
        // Round 13 — heat distortion uniforms
        gl.uniform1i(gl.getUniformLocation(this.compositeProg, "uHeatCount"), this.heatCount);
        gl.uniform1f(gl.getUniformLocation(this.compositeProg, "uHeatTime"), performance.now() * 0.001);
        if (this.heatCount > 0) {
            gl.uniform2fv(gl.getUniformLocation(this.compositeProg, "uHeatSourcesUV"), this.heatProjected);
            gl.uniform1fv(gl.getUniformLocation(this.compositeProg, "uHeatRadii"), this.heatRadii);
            gl.uniform1fv(gl.getUniformLocation(this.compositeProg, "uHeatStrength"), this.heatStrength);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.bindVertexArray(null);
        gl.activeTexture(gl.TEXTURE0);
        gl.enable(gl.DEPTH_TEST);
        // *** v4212 -- A SCISSOR LEFT ENABLED IS A STATE LEAK THAT SHOWS UP SOMEWHERE ELSE ENTIRELY. *** This
        // is the only place that turns SCISSOR_TEST on, so it is the only place that can be sure of turning it
        // off; leaving it set would silently clip the NEXT thing drawn -- the other eye, the HUD, or the whole
        // desktop frame after leaving VR -- to whichever eye happened to be last. Unconditional, not guarded
        // on eyeScissor, so that a throw partway through cannot strand the flag either.
        gl.disable(gl.SCISSOR_TEST);
    }
}
