// FILE: gpu/VoxelMemoryGPU.js
// VERSION: v2 - PING-PONG + SHADER + EXT CHECK + GRACEFUL DEGRADATION
//
// 2D top-down heatmap of memory field activity. Each texel at (x, z) holds
// signal strength in the R channel. Decay runs as a fragment-shader pass
// from one texture to a paired one (ping-pong), which is necessary because
// reading and writing the same texture in a single render pass is undefined
// behaviour.
//
// Scope:
//   This is a SECONDARY visualization buffer — the CPU VoxelMemoryField
//   remains canonical for queryNear() / get() / civilization scanning.
//   GPU mirrors writes for visualization-only.
//
// Design choices vs the parked v1:
//   * EXT_color_buffer_float check at construction → graceful no-op on
//     systems that don't support rendering to RGBA32F.
//   * Two textures + two FBOs, swapped each decay pass.
//   * Built-in vertex+fragment shaders — no caller burden.
//   * Full-screen TRIANGLE, attributeless -- see QUAD_VS/TRI_VS below (v4241).
//   * Negative-safe coord wrap (((x % s) + s) % s).

// *** v4241 -- THIS WAS THE ONE REAL FULLSCREEN QUAD IN THE TREE, AND IT TOOK A STACK-ATTRIBUTED CENSUS TO
// FIND IT. *** v4236 measured "six fullscreen draws a frame, five of six already using the fullscreen
// triangle, one still a quad" and filed the quad as a post-processing pass to be tracked down. It is not a
// post pass at all: it is this decay step, a GPGPU pass over a square framebuffer with depth off. The
// classifier that produced that number counted any drawArrays of six vertices or fewer as fullscreen, which
// swept in world-space billboards and missed which file was calling.
//
// The old quad is KEPT AND EXPORTED, because the gate's whole claim is that the triangle renders exactly
// what the quad rendered, and that comparison needs both vertex stages to exist.
export const QUAD_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main() {
    vUV = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/**
 * The fullscreen TRIANGLE: three vertices, no buffer, no attribute.
 *
 * gl_VertexID 0,1,2 becomes (-1,-1), (3,-1), (-1,3) -- a triangle that overhangs the viewport on two sides
 * and therefore covers it with ONE primitive. A quad covers the same area with two, and every fragment along
 * their shared diagonal is rasterised twice; the triangle has no diagonal to share. The vUV mapping is the
 * SAME expression, so the interpolated coordinate at every covered pixel is identical -- which is why the
 * gate can demand byte-equality rather than a tolerance.
 */
export const TRI_VS = `#version 300 es
out vec2 vUV;
void main() {
    vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
    vUV = p * 0.5 + 0.5;
    gl_Position = vec4(p, 0.0, 1.0);
}`;

const VS = TRI_VS;

export const DECAY_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSrc;
uniform float uDecay;
out vec4 outColor;
void main() {
    vec4 c = texture(uSrc, vUV);
    c.r *= uDecay;
    if (c.r < 0.001) c.r = 0.0;
    outColor = c;
}`;
const FS = DECAY_FS;

export class VoxelMemoryGPU {
    constructor(gl, size = 128) {
        this.gl = gl;
        this.size = size;
        this.supported = false;       // true after _init succeeds
        this.unsupportedReason = null;
        this.writeCount = 0;
        this.decayCount = 0;
        this._init();
    }

    _init() {
        const gl = this.gl;
        if (!gl || typeof gl.getExtension !== "function") {
            this.unsupportedReason = "no GL context";
            return;
        }
        // Render-to-RGBA32F requires this extension on most browsers/devices.
        const ext = gl.getExtension("EXT_color_buffer_float");
        if (!ext) {
            this.unsupportedReason = "EXT_color_buffer_float not available";
            console.warn(`[VoxelMemoryGPU] ${this.unsupportedReason}; GPU mirror disabled`);
            return;
        }

        this.texA = this._createTexture();
        this.texB = this._createTexture();
        this.fboA = this._createFBO(this.texA);
        this.fboB = this._createFBO(this.texB);

        // Verify FBO completeness on at least one of the pair.
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA);
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            this.unsupportedReason = `FBO incomplete: 0x${status.toString(16)}`;
            console.warn(`[VoxelMemoryGPU] ${this.unsupportedReason}`);
            return;
        }

        this.current    = this.texA;
        this.currentFBO = this.fboA;

        this.program = this._compileProgram();
        this.uSrc    = gl.getUniformLocation(this.program, "uSrc");
        this.uDecay  = gl.getUniformLocation(this.program, "uDecay");

        this.quadVAO = this._createFullScreenQuad();

        this.supported = true;
        console.log(`[VoxelMemoryGPU] ready (${this.size}x${this.size} RGBA32F, ping-pong)`);
    }

    _createTexture() {
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA32F,
            this.size, this.size, 0,
            gl.RGBA, gl.FLOAT, null
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
    }

    _createFBO(tex) {
        const gl = this.gl;
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D, tex, 0
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return fbo;
    }

    _compile(type, src) {
        const gl = this.gl;
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.error("[VoxelMemoryGPU] shader:", gl.getShaderInfoLog(sh));
        }
        return sh;
    }

    _compileProgram() {
        const gl = this.gl;
        const p = gl.createProgram();
        gl.attachShader(p, this._compile(gl.VERTEX_SHADER,   VS));
        gl.attachShader(p, this._compile(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.error("[VoxelMemoryGPU] link:", gl.getProgramInfoLog(p));
        }
        return p;
    }

    // v4241 -- an EMPTY vertex array. The triangle is built from gl_VertexID, so there is no buffer to
    // upload, no attribute to enable and no vertexAttribPointer to get wrong. The name is kept because
    // callers and the gate refer to this.quadVAO, and renaming it would be churn for no reader's benefit.
    _createFullScreenQuad() {
        return this.gl.createVertexArray();
    }

    // -------------------------------------------------------------------
    //  Public API
    // -------------------------------------------------------------------

    // Write a strength sample at world (x, *, z). Y is intentionally
    // dropped — this is a top-down 2D heatmap, not a 3D voxel grid. The
    // CPU VoxelMemoryField holds the full 3D data; this is for viz.
    //
    // Coords wrap modulo size with proper handling of negatives so
    // world (-1, *, -1) lands at (size-1, size-1) rather than (-1, -1).
    write(x, y, z, strength = 1, time = 0) {
        if (!this.supported) return;
        const gl = this.gl;
        const px = ((x | 0) % this.size + this.size) % this.size;
        const py = ((z | 0) % this.size + this.size) % this.size;

        // Read-modify-write: accumulate strength rather than overwrite, so
        // multiple signals at the same cell stack. We read 1 pixel, add,
        // upload. Cheap (1×1 readback ~ 16 bytes).
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fboFor(this.current));
        const px4 = new Float32Array(4);
        gl.readPixels(px, py, 1, 1, gl.RGBA, gl.FLOAT, px4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        const data = new Float32Array([
            (px4[0] || 0) + strength,
            time,
            0,
            1,
        ]);
        gl.bindTexture(gl.TEXTURE_2D, this.current);
        gl.texSubImage2D(
            gl.TEXTURE_2D, 0, px, py, 1, 1,
            gl.RGBA, gl.FLOAT, data
        );
        this.writeCount++;
    }

    // Run one decay pass: render from current → other texture, then swap.
    // Default rate 0.99 per call; with decay called once per frame at
    // 60fps the half-life is about 70 frames (1.2s). Tune via rate arg.
    decay(rate = 0.99) {
        if (!this.supported) return;
        const gl = this.gl;

        const otherTex = (this.current === this.texA) ? this.texB : this.texA;
        const otherFBO = (this.current === this.texA) ? this.fboB : this.fboA;

        gl.useProgram(this.program);
        gl.uniform1f(this.uDecay, rate);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.current);
        gl.uniform1i(this.uSrc, 0);

        gl.bindFramebuffer(gl.FRAMEBUFFER, otherFBO);
        gl.viewport(0, 0, this.size, this.size);
        gl.disable(gl.SCISSOR_TEST);
        gl.disable(gl.DEPTH_TEST);

        gl.bindVertexArray(this.quadVAO);
        gl.drawArrays(gl.TRIANGLES, 0, 3);      // v4241 -- one primitive, no shared diagonal
        gl.bindVertexArray(null);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.enable(gl.DEPTH_TEST);

        this.current    = otherTex;
        this.currentFBO = otherFBO;
        this.decayCount++;
    }

    _fboFor(tex) {
        return tex === this.texA ? this.fboA : this.fboB;
    }

    // Read the entire heatmap into an RGBA32F buffer. Caller can pass
    // their own buffer to avoid per-call allocation. ~64KB for size=128
    // (128*128*4*4 = 262KB actually; tune if hot).
    readSeeds(buffer = null) {
        if (!this.supported) return null;
        const gl = this.gl;
        const out = buffer || new Float32Array(this.size * this.size * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fboFor(this.current));
        gl.readPixels(0, 0, this.size, this.size, gl.RGBA, gl.FLOAT, out);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return out;
    }

    snapshot() {
        return {
            supported: this.supported,
            reason: this.unsupportedReason,
            size: this.size,
            writes: this.writeCount,
            decays: this.decayCount,
        };
    }
}
