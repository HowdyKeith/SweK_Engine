// FILE: render/SSAOPass.js
// VERSION: v1 — round 299
//
// Screen-space ambient occlusion. Reconstructs view-space normals from
// the scene depth buffer, samples a hemisphere of random directions per
// fragment, and accumulates how many of those samples are "occluded"
// (depth-tested against neighboring fragments). Output is a single-
// channel texture in [0..1] where 0 = fully occluded (deep crevice)
// and 1 = no occlusion (open surface). The main composite multiplies
// the scene color by this factor — corners + cracks darken naturally.
//
// Why depth-only normal reconstruction (vs a G-buffer normal pass):
//   - No additional fragment shader cost in the main scene pass
//   - No new MRT setup required
//   - Quality is acceptable for the engine's visual style (voxels +
//     low-poly meshes have flat shading anyway; precise normals don't
//     improve SSAO contact darkening noticeably)
//   - Cross-product of depth-derivative gives a usable approximation
//
// Pipeline:
//   1) main render emits depth → sceneDepthTex
//   2) ssaoPass.render(sceneDepthTex, projMatrix, invProj) →
//      ssaoTex (single-channel, half-res for perf)
//   3) ssaoPass.blur(ssaoTex) → ssaoBlurredTex
//   4) composite multiplies scene color by ssaoBlurredTex
//
// Half-res is industry standard — ambient occlusion is low-frequency,
// upsampling looks fine. Quarter-res is too lossy; full-res is overkill.

const SSAO_VERT_SRC = `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() {
    vUV = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const SSAO_FRAG_SRC = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 outColor;

uniform sampler2D uDepthTex;
uniform sampler2D uNoiseTex;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform vec3 uSamples[16];
uniform vec2 uViewportSize;
uniform vec2 uNoiseScale;     // viewportSize / 4.0 — tile the 4×4 noise
uniform float uRadius;        // world-space sample radius (default 0.5)
uniform float uBias;          // small offset to combat z-fighting

// Reconstruct view-space position from depth + UV.
// Standard NDC → view space inversion. Depth is in [0..1] (GL_DEPTH_COMPONENT)
// and we map to [-1..1] for the inverse projection.
vec3 viewPosFromDepth(vec2 uv, float depth) {
    float z = depth * 2.0 - 1.0;
    vec4 clipPos = vec4(uv * 2.0 - 1.0, z, 1.0);
    vec4 viewPos = uInvProj * clipPos;
    return viewPos.xyz / viewPos.w;
}

// Approximate view-space normal from the depth-derivative cross product.
// Sample 3 nearby depths, build two tangent vectors, cross them.
vec3 normalFromDepth(vec2 uv) {
    vec2 texelSize = 1.0 / uViewportSize;
    float dC = texture(uDepthTex, uv).r;
    float dX = texture(uDepthTex, uv + vec2(texelSize.x, 0.0)).r;
    float dY = texture(uDepthTex, uv + vec2(0.0, texelSize.y)).r;
    vec3 pC = viewPosFromDepth(uv, dC);
    vec3 pX = viewPosFromDepth(uv + vec2(texelSize.x, 0.0), dX);
    vec3 pY = viewPosFromDepth(uv + vec2(0.0, texelSize.y), dY);
    return normalize(cross(pX - pC, pY - pC));
}

void main() {
    float depth = texture(uDepthTex, vUV).r;
    if (depth >= 0.9999) {
        // Sky / cleared — no occlusion
        outColor = vec4(1.0);
        return;
    }
    vec3 viewPos = viewPosFromDepth(vUV, depth);
    vec3 normal  = normalFromDepth(vUV);

    // Random rotation from the noise texture — eliminates banding
    vec3 randomVec = normalize(texture(uNoiseTex, vUV * uNoiseScale).xyz * 2.0 - 1.0);

    // Build the TBN basis for the hemisphere
    vec3 tangent   = normalize(randomVec - normal * dot(randomVec, normal));
    vec3 bitangent = cross(normal, tangent);
    mat3 TBN       = mat3(tangent, bitangent, normal);

    // Sample 16 hemisphere directions; for each, project into clip space
    // and compare to the depth buffer at that screen location.
    float occlusion = 0.0;
    for (int i = 0; i < 16; i++) {
        vec3 sampleDir = TBN * uSamples[i];
        vec3 samplePos = viewPos + sampleDir * uRadius;

        // Project to clip → NDC → UV
        vec4 offset = uProj * vec4(samplePos, 1.0);
        offset.xyz /= offset.w;
        offset.xy = offset.xy * 0.5 + 0.5;

        // Depth at that screen location
        float sampleDepth = texture(uDepthTex, offset.xy).r;
        vec3 sampleScene  = viewPosFromDepth(offset.xy, sampleDepth);
        // Range check — fade contribution when sample is too far away
        float rangeCheck = smoothstep(0.0, 1.0, uRadius / abs(viewPos.z - sampleScene.z));
        // If the scene depth is CLOSER (smaller z, i.e. less negative)
        // than our hemisphere sample, the sample is occluded.
        occlusion += (sampleScene.z >= samplePos.z + uBias ? 1.0 : 0.0) * rangeCheck;
    }
    occlusion = 1.0 - (occlusion / 16.0);
    outColor = vec4(occlusion, occlusion, occlusion, 1.0);
}`;

// Simple 4x4 box blur to denoise the SSAO output. Single-channel input.
const SSAO_BLUR_FRAG_SRC = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uSSAO;
void main() {
    vec2 texelSize = 1.0 / vec2(textureSize(uSSAO, 0));
    float sum = 0.0;
    for (int x = -2; x < 2; x++) {
        for (int y = -2; y < 2; y++) {
            vec2 offset = vec2(float(x), float(y)) * texelSize;
            sum += texture(uSSAO, vUV + offset).r;
        }
    }
    float v = sum / 16.0;
    outColor = vec4(v, v, v, 1.0);
}`;

export class SSAOPass {
    constructor(gl, opts = {}) {
        this.gl = gl;
        this.width  = opts.width  ?? 512;
        this.height = opts.height ?? 256;
        this.radius = opts.radius ?? 0.5;     // world-space sample radius
        this.bias   = opts.bias   ?? 0.025;
        this.enabled = true;

        // Compile programs
        this.program     = _compileProgram(gl, SSAO_VERT_SRC, SSAO_FRAG_SRC);
        this.programBlur = _compileProgram(gl, SSAO_VERT_SRC, SSAO_BLUR_FRAG_SRC);
        if (!this.program || !this.programBlur) {
            this.enabled = false;
            console.error("[SSAOPass] program compilation failed; disabled");
            return;
        }
        gl.useProgram(this.program);
        this.uDepthTex    = gl.getUniformLocation(this.program, "uDepthTex");
        this.uNoiseTex    = gl.getUniformLocation(this.program, "uNoiseTex");
        this.uProj        = gl.getUniformLocation(this.program, "uProj");
        this.uInvProj     = gl.getUniformLocation(this.program, "uInvProj");
        this.uSamples     = gl.getUniformLocation(this.program, "uSamples");
        this.uViewportSize= gl.getUniformLocation(this.program, "uViewportSize");
        this.uNoiseScale  = gl.getUniformLocation(this.program, "uNoiseScale");
        this.uRadius      = gl.getUniformLocation(this.program, "uRadius");
        this.uBias        = gl.getUniformLocation(this.program, "uBias");

        gl.useProgram(this.programBlur);
        this.uBlurSSAO    = gl.getUniformLocation(this.programBlur, "uSSAO");

        // FBOs
        this.fboMain = this._makeFBO();
        this.fboBlur = this._makeFBO();

        // Fullscreen quad
        this.quadVao = gl.createVertexArray();
        gl.bindVertexArray(this.quadVao);
        const quadVbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1,-1,  1,-1,  -1, 1,
            -1, 1,  1,-1,   1, 1,
        ]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        // Generate 16 sample vectors in a unit hemisphere oriented +Z.
        // Use Hammersley-like distribution for good coverage.
        this.samples = new Float32Array(16 * 3);
        for (let i = 0; i < 16; i++) {
            const u = (i + 0.5) / 16;
            const v = _radicalInverse(i + 1);
            const r = Math.sqrt(u);
            const phi = v * Math.PI * 2;
            const x = r * Math.cos(phi);
            const y = r * Math.sin(phi);
            const z = Math.sqrt(Math.max(0, 1 - x*x - y*y));
            // Scale samples to bias toward center (more samples close to origin)
            // — better contact occlusion vs ambient occlusion.
            let scale = i / 16;
            scale = 0.1 + 0.9 * (scale * scale);
            this.samples[i*3+0] = x * scale;
            this.samples[i*3+1] = y * scale;
            this.samples[i*3+2] = z * scale;
        }

        // 4x4 RGB noise texture, RG components only (Z=0). Random
        // tangent rotations per pixel tile to break sample banding.
        this.noiseTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
        const noise = new Float32Array(4 * 4 * 3);
        for (let i = 0; i < 16; i++) {
            noise[i*3+0] = Math.random() * 2 - 1;
            noise[i*3+1] = Math.random() * 2 - 1;
            noise[i*3+2] = 0;
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB16F, 4, 4, 0, gl.RGB, gl.FLOAT, noise);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

        console.log(`[SSAOPass] v1 ready — ${this.width}x${this.height}, 16 samples, radius=${this.radius}`);
    }

    _makeFBO() {
        const gl = this.gl;
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, this.width, this.height, 0,
            gl.RED, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D, tex, 0);
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.error(`[SSAOPass] FBO incomplete: 0x${status.toString(16)}`);
        }
        return { fbo, tex };
    }

    // Render SSAO into fboMain.tex. Caller provides:
    //   sceneDepthTex — the depth texture from the main scene pass
    //   projMatrix    — the current camera projection (mat4, Float32Array)
    //   invProjMatrix — its inverse (used to reconstruct view-space position)
    //   viewportWidth/Height — for normal reconstruction sampling
    render(sceneDepthTex, projMatrix, invProjMatrix, viewportWidth, viewportHeight) {
        if (!this.enabled) return null;
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboMain.fbo);
        gl.viewport(0, 0, this.width, this.height);
        gl.disable(gl.DEPTH_TEST);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.program);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneDepthTex);
        gl.uniform1i(this.uDepthTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
        gl.uniform1i(this.uNoiseTex, 1);
        gl.uniformMatrix4fv(this.uProj, false, projMatrix);
        gl.uniformMatrix4fv(this.uInvProj, false, invProjMatrix);
        gl.uniform3fv(this.uSamples, this.samples);
        gl.uniform2f(this.uViewportSize, viewportWidth, viewportHeight);
        gl.uniform2f(this.uNoiseScale, viewportWidth / 4, viewportHeight / 4);
        gl.uniform1f(this.uRadius, this.radius);
        gl.uniform1f(this.uBias, this.bias);

        gl.bindVertexArray(this.quadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindVertexArray(null);
        return this.fboMain.tex;
    }

    // Apply the box blur. Returns the blurred AO texture.
    blur() {
        if (!this.enabled) return null;
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBlur.fbo);
        gl.viewport(0, 0, this.width, this.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.programBlur);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.fboMain.tex);
        gl.uniform1i(this.uBlurSSAO, 0);
        gl.bindVertexArray(this.quadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindVertexArray(null);
        return this.fboBlur.tex;
    }

    getAOTexture() { return this.fboBlur.tex; }
}

// =============================================================================
// Helpers
// =============================================================================

// Radical inverse base-2 (Halton sequence component). Used for low-
// discrepancy sample distribution. Returns in [0..1).
function _radicalInverse(i) {
    let r = 0, denom = 1;
    while (i > 0) {
        denom *= 2;
        r += (i & 1) / denom;
        i >>= 1;
    }
    return r;
}

function _compileProgram(gl, vertSrc, fragSrc) {
    const vs = _compileShader(gl, gl.VERTEX_SHADER, vertSrc);
    const fs = _compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, "aPos");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("[SSAOPass] link error:", gl.getProgramInfoLog(program));
        return null;
    }
    return program;
}

function _compileShader(gl, type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("[SSAOPass] shader compile error:", gl.getShaderInfoLog(shader));
        console.error(src.split("\n").map((l, i) => `${i+1}: ${l}`).join("\n"));
        return null;
    }
    return shader;
}

export function makeSSAOPass(gl, opts) {
    return new SSAOPass(gl, opts);
}
