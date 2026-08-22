// FILE: render/BeamRibbonRenderer.js
// VERSION: v1 (v796 — round 31, true continuous beam)
//
// Draws active beam ribbons as thin world-space quads between a source
// kaiju and a target. Replaces the visual gap between the 80ms-interval
// particle bursts from _executeBeam with a sustained ribbon mesh that's
// rebuilt each frame from current source/target positions.
//
// Architecture:
//   - One renderer instance owns the shader + 2 dynamic buffers
//   - Per-beam state lives in BeamRibbonManager (separate file)
//   - Each frame: manager passes active beams; renderer builds quad
//     vertices CPU-side, uploads, draws
//
// Quad construction (per beam, each frame):
//   length axis  = normalize(target - source)
//   camera fwd   = normalize(target - eye) — approximation
//   width axis   = normalize(cross(length, camera fwd))
//   4 corners    = midpoint ± length/2 along length-axis ± width/2 along width-axis
//
// This billboards the quad to face the camera while preserving the
// beam's direction. Width is constant in world units (not screen
// pixels — so beams shrink with distance, which feels right).

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
uniform mat4 uViewProj;
out vec2 vUv;
void main() {
    gl_Position = uViewProj * vec4(aPos, 1.0);
    vUv = aUv;
}`;

const FS = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform vec4 uColor;
out vec4 fragColor;
void main() {
    // Soft falloff toward the edges (perpendicular to length)
    float edgeT = 1.0 - abs(vUv.y - 0.5) * 2.0;
    edgeT = smoothstep(0.0, 1.0, edgeT);
    // Length-wise alpha pulse — slight taper near source + target
    float endTaper = 1.0 - smoothstep(0.85, 1.0, abs(vUv.x - 0.5) * 2.0);
    fragColor = vec4(uColor.rgb, uColor.a * edgeT * endTaper);
}`;

function _compile(gl, src, type) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error("BeamRibbon shader compile: " + log);
    }
    return sh;
}

export class BeamRibbonRenderer {
    constructor(gl) {
        this.gl = gl;
        const vs = _compile(gl, VS, gl.VERTEX_SHADER);
        const fs = _compile(gl, FS, gl.FRAGMENT_SHADER);
        this.prog = gl.createProgram();
        gl.attachShader(this.prog, vs);
        gl.attachShader(this.prog, fs);
        gl.linkProgram(this.prog);
        if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(this.prog);
            gl.deleteProgram(this.prog);
            throw new Error("BeamRibbon link: " + log);
        }
        this.uViewProj = gl.getUniformLocation(this.prog, "uViewProj");
        this.uColor    = gl.getUniformLocation(this.prog, "uColor");

        // Single VAO with pos (vec3) + uv (vec2) per vertex, dynamic
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        this.posBuf = gl.createBuffer();
        this.uvBuf  = gl.createBuffer();
        // 4 vertices per quad, position vec3 = 12 bytes, uv vec2 = 8 bytes
        gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, 4 * 3 * 4, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
        // UVs are static per draw — (-1,-1) (1,-1) (-1,1) (1,1) → remapped to [0..1]
        const uvs = new Float32Array([0,0,  1,0,  0,1,  1,1]);
        gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        // Per-frame quad buffer (re-uploaded each draw)
        this._quadPos = new Float32Array(4 * 3);
    }

    /**
     * Draw a single beam ribbon.
     * @param {Float32Array} viewProj  4x4 column-major
     * @param {Object} cam  camera with eye position (camera.position.{x,y,z})
     * @param {{x,y,z}} source
     * @param {{x,y,z}} target
     * @param {[number,number,number,number]} color  RGBA in 0..1
     * @param {number} width  half-width of the quad in world units
     */
    drawBeam(viewProj, cam, source, target, color, width = 0.4) {
        const gl = this.gl;
        // Length axis
        let lx = target.x - source.x, ly = target.y - source.y, lz = target.z - source.z;
        const lengthMag = Math.hypot(lx, ly, lz) || 1;
        lx /= lengthMag; ly /= lengthMag; lz /= lengthMag;
        // Camera direction from midpoint
        const mx = (source.x + target.x) * 0.5;
        const my = (source.y + target.y) * 0.5;
        const mz = (source.z + target.z) * 0.5;
        const eyeX = cam?.position?.x ?? 0;
        const eyeY = cam?.position?.y ?? 0;
        const eyeZ = cam?.position?.z ?? 0;
        let cfx = mx - eyeX, cfy = my - eyeY, cfz = mz - eyeZ;
        const cfMag = Math.hypot(cfx, cfy, cfz) || 1;
        cfx /= cfMag; cfy /= cfMag; cfz /= cfMag;
        // Width axis = cross(length, cam-fwd)
        let wx = ly * cfz - lz * cfy;
        let wy = lz * cfx - lx * cfz;
        let wz = lx * cfy - ly * cfx;
        const wMag = Math.hypot(wx, wy, wz);
        if (wMag < 1e-5) return;     // length || cam-fwd — degenerate (looking straight down the beam)
        wx = wx * width / wMag;
        wy = wy * width / wMag;
        wz = wz * width / wMag;

        // 4 corners: source-side ±width, target-side ±width
        const Q = this._quadPos;
        Q[0]  = source.x + wx; Q[1]  = source.y + wy; Q[2]  = source.z + wz;       // source-top
        Q[3]  = source.x - wx; Q[4]  = source.y - wy; Q[5]  = source.z - wz;       // source-bot
        Q[6]  = target.x + wx; Q[7]  = target.y + wy; Q[8]  = target.z + wz;       // target-top
        Q[9]  = target.x - wx; Q[10] = target.y - wy; Q[11] = target.z - wz;       // target-bot
        // Wait — UV order is (0,0),(1,0),(0,1),(1,1) which maps to corners
        // bottom-left, bottom-right, top-left, top-right.
        // For TRIANGLE_STRIP with 4 verts, we need (0,1,2,3) to form 2 triangles.
        // With strip order:
        //   v0,v1,v2 (first tri), v1,v3,v2 (second tri) — but it's actually v2,v3,v1 for strip.
        // Best to re-arrange so the quad winds correctly. Strip vertex order:
        //   v0 (bot-left) → v1 (bot-right) → v2 (top-left) → v3 (top-right)
        // So Q should be:
        //   v0: source-bot, v1: target-bot, v2: source-top, v3: target-top
        // Re-assign:
        Q[0]  = source.x - wx; Q[1]  = source.y - wy; Q[2]  = source.z - wz;       // v0 = source-bot
        Q[3]  = target.x - wx; Q[4]  = target.y - wy; Q[5]  = target.z - wz;       // v1 = target-bot
        Q[6]  = source.x + wx; Q[7]  = source.y + wy; Q[8]  = source.z + wz;       // v2 = source-top
        Q[9]  = target.x + wx; Q[10] = target.y + wy; Q[11] = target.z + wz;       // v3 = target-top

        gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, Q);

        gl.useProgram(this.prog);
        gl.uniformMatrix4fv(this.uViewProj, false, viewProj);
        gl.uniform4f(this.uColor, color[0], color[1], color[2], color[3]);

        gl.bindVertexArray(this.vao);
        gl.enable(gl.BLEND);
        // Additive blending — beams glow rather than darken what's behind
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(null);
    }

    dispose() {
        const gl = this.gl;
        try { gl.deleteVertexArray(this.vao); } catch {}
        try { gl.deleteBuffer(this.posBuf); } catch {}
        try { gl.deleteBuffer(this.uvBuf); } catch {}
        try { gl.deleteProgram(this.prog); } catch {}
    }
}

/**
 * Color map per attack name (RGBA 0..1 + optional half-width in world units).
 * Layout: [r, g, b, a, halfWidth]. halfWidth defaults to 0.4 when missing.
 * Falls back to white-ish for unmapped attacks.
 */
export const BEAM_COLORS = {
    laser:        [1.0, 0.2, 0.2, 0.85, 0.30],   // red, thin
    ice_ray:      [0.5, 0.9, 1.0, 0.85, 0.25],   // pale cyan, thinnest
    flamethrower: [1.0, 0.6, 0.1, 0.85, 0.70],   // orange, wide cone
    lightning:    [0.9, 0.9, 1.0, 0.95, 0.55],   // bright white-blue, thick
    tractor_beam: [0.4, 1.0, 0.4, 0.75, 0.45],   // green, medium
    hell_curse:   [0.7, 0.2, 1.0, 0.85, 0.50],   // purple, medium
    rad_pulse:    [0.6, 1.0, 0.4, 0.85, 0.60],   // sickly green, wide
    plasma_beam:  [0.9, 0.4, 1.0, 0.85, 0.40],   // magenta, medium
};
