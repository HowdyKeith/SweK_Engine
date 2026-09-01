// FILE: engine/SplatRenderer.js
// VERSION: v2 — round 342  (Tier 2: covariance ellipse projection)
//
// Real Gaussian splat rendering. Each splat is rendered as a 3-sigma
// bounding quad whose interior is shaded with the proper Mahalanobis
// distance against the inverse of the screen-space covariance:
//
//   Σ_3D = R · S² · Rᵀ              (3D covariance from rotation + scale)
//   T    = J · W                     (Jacobian × view-rotation)
//   Σ_2D = T · Σ_3D · Tᵀ             (screen-space 2×2 — extract upper-left)
//   conic = Σ_2D⁻¹                   (the inverse, packed as 3 floats)
//   density(d) = exp(-½ · dᵀ · conic · d)   evaluated per fragment
//
// This matches the math from Kerbl et al. (2023) "3D Gaussian Splatting
// for Real-Time Radiance Field Rendering". What we still don't do:
//
//   - Spherical harmonics for view-dependent color. We only use the
//     SH band-0 base color from the parser, so reflections/specular
//     lose detail. Splats imported from CRM/Hunyuan already discard
//     these in the parser anyway.
//   - GPU sort. *** THIS LINE USED TO SAY THE CPU SORT WAS "radix-style" AND IT WAS NOT: *** it was
//     Array.prototype.sort with a closure comparator. As of v4264 it genuinely is a radix sort
//     (render/splatSort.mjs), so the description and the code finally agree.
//     For <100k splats it's fine. Above that, port to GPU compute.
//
// The cost upgrade over Tier 1: the vertex shader now does ~30 extra
// FLOPs per splat (quat→mat, two 3×3 multiplies, eigenvalue solve).
// For 50k splats on a 1080 that's <0.4ms in the VS budget. Negligible.

import { radixSortIndices, makeSortScratch } from "../render/splatSort.mjs";   // v4264

export class SplatRenderer {
    constructor(gl, splat) {
        this.gl = gl;
        this.splat = splat;
        this.position = [0, 0, 0];
        this.scale = 1.0;
        this.visible = true;
        this._sortKeys = new Float32Array(splat.count);
        this._sortScratch = makeSortScratch(splat.count);   // v4264 -- allocated once, not per frame
        this._indices  = new Uint32Array(splat.count);
        for (let i = 0; i < splat.count; i++) this._indices[i] = i;
        this._lastCamX = NaN; this._lastCamY = NaN; this._lastCamZ = NaN;

        this._initProgram();
        this._initBuffers();
    }

    _initProgram() {
        const gl = this.gl;
        const vsSrc = `#version 300 es
precision highp float;

// Per-vertex (quad corner)
layout(location = 0) in vec2 a_corner;   // (-1,-1) (1,-1) (-1,1) (1,1)

// Per-instance (the splat)
layout(location = 1) in vec3 a_pos;
layout(location = 2) in vec3 a_scale;    // log-space scale
layout(location = 3) in vec3 a_color;
layout(location = 4) in float a_opacity; // pre-sigmoid
layout(location = 5) in vec4 a_quat;     // (w, x, y, z)

uniform mat4 u_view;
uniform mat4 u_proj;
uniform vec3 u_worldOffset;
uniform float u_worldScale;
uniform vec2 u_viewport;   // (width, height) in pixels

out vec2 v_offset;         // NDC offset from splat center (varies across quad)
out vec3 v_conic;          // inverse 2×2 covariance, packed (a, b, c)
out vec3 v_color;
out float v_opacity;

mat3 quatToMat3(vec4 q) {
    // Robust against unnormalized quaternions
    q = normalize(q);
    float w = q.x, x = q.y, y = q.z, z = q.w;
    // Standard "active" rotation matrix
    return mat3(
        vec3(1.0 - 2.0*(y*y + z*z), 2.0*(x*y + w*z),     2.0*(x*z - w*y)),
        vec3(2.0*(x*y - w*z),       1.0 - 2.0*(x*x + z*z), 2.0*(y*z + w*x)),
        vec3(2.0*(x*z + w*y),       2.0*(y*z - w*x),     1.0 - 2.0*(x*x + y*y))
    );
}

void main() {
    vec3 worldP = a_pos * u_worldScale + u_worldOffset;
    vec4 viewP = u_view * vec4(worldP, 1.0);

    // Positive depth. Cull anything behind the near plane.
    float z = -viewP.z;
    if (z < 0.01) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }

    // ---------------- 3D covariance Σ = R · S² · Rᵀ ---------------
    mat3 R = quatToMat3(a_quat);
    vec3 s = exp(a_scale) * u_worldScale;
    mat3 S = mat3(
        vec3(s.x, 0.0, 0.0),
        vec3(0.0, s.y, 0.0),
        vec3(0.0, 0.0, s.z)
    );
    mat3 M = R * S;
    mat3 cov3D = M * transpose(M);

    // ---------------- Screen-space covariance Σ_2D = (JW) Σ (JW)ᵀ ---
    // Perspective Jacobian — output in NDC half-units so we can feed
    // the conic directly without a viewport conversion.
    float fx = u_proj[0][0];
    float fy = u_proj[1][1];
    mat3 J = mat3(
        vec3(fx / z, 0.0, 0.0),
        vec3(0.0, fy / z, 0.0),
        vec3(-fx * viewP.x / (z*z), -fy * viewP.y / (z*z), 0.0)
    );
    mat3 W = mat3(u_view);
    mat3 T = J * W;
    mat3 cov2D = T * cov3D * transpose(T);

    // Add ~1-pixel isotropic blur to avoid singular matrices at very
    // tiny splats. In NDC units 2/height ≈ 1 pixel in y.
    float blurNDC = 2.0 / u_viewport.y;
    float a = cov2D[0][0] + blurNDC;
    float b = cov2D[0][1];
    float c = cov2D[1][1] + blurNDC;
    float det = a * c - b * b;
    if (det <= 0.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }

    // Conic = Σ_2D⁻¹. Pack as (c, -b, a)/det because the fragment uses
    //   power = -½(conic.x dx² + 2·conic.y·dx·dy + conic.z·dy²)
    v_conic = vec3(c, -b, a) / det;

    // ---------------- Bounding radius via eigenvalues ----------------
    float mid = 0.5 * (a + c);
    float disc = max(0.0, mid*mid - det);
    float lambda1 = mid + sqrt(disc);
    float lambda2 = mid - sqrt(disc);
    float radius = 3.0 * sqrt(max(lambda1, lambda2));  // 3σ in NDC

    // Project center; offset corner in clip space (scaled by clip.w
    // so perspective division works out to the NDC offset).
    vec4 clipP = u_proj * viewP;
    clipP.xy += a_corner * radius * clipP.w;
    gl_Position = clipP;

    // Pass the NDC offset (same units as conic) to the fragment shader
    v_offset = a_corner * radius;
    v_color = a_color;
    v_opacity = 1.0 / (1.0 + exp(-a_opacity));
}`;

        const fsSrc = `#version 300 es
precision highp float;

in vec2 v_offset;
in vec3 v_conic;
in vec3 v_color;
in float v_opacity;

out vec4 fragColor;

void main() {
    // Mahalanobis squared: dᵀ Σ⁻¹ d
    //   = conic.x·dx² + 2·conic.y·dx·dy + conic.z·dy²
    // (conic.y already encodes the off-diagonal with -b/det)
    float power = -0.5 * (v_conic.x * v_offset.x * v_offset.x
                        + v_conic.z * v_offset.y * v_offset.y)
                  - v_conic.y * v_offset.x * v_offset.y;
    if (power > 0.0) discard;   // outside ellipse (numerical)
    float alpha = min(0.99, v_opacity * exp(power));
    if (alpha < 0.003) discard; // negligible contribution
    fragColor = vec4(v_color, alpha);
}`;

        const compile = (src, type) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                throw new Error("[splat shader] " + gl.getShaderInfoLog(s) + "\n" + src);
            }
            return s;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, compile(vsSrc, gl.VERTEX_SHADER));
        gl.attachShader(prog, compile(fsSrc, gl.FRAGMENT_SHADER));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error("[splat link] " + gl.getProgramInfoLog(prog));
        }
        this.prog = prog;
        this.u_view     = gl.getUniformLocation(prog, "u_view");
        this.u_proj     = gl.getUniformLocation(prog, "u_proj");
        this.u_off      = gl.getUniformLocation(prog, "u_worldOffset");
        this.u_ws       = gl.getUniformLocation(prog, "u_worldScale");
        this.u_viewport = gl.getUniformLocation(prog, "u_viewport");
    }

    _initBuffers() {
        const gl = this.gl;
        const s = this.splat;

        // Static quad corners
        const corners = new Float32Array([-1, -1,  1, -1, -1,  1,  1,  1]);
        this.bufCorner = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufCorner);
        gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);

        // Per-instance buffers
        this.bufPos     = gl.createBuffer();
        this.bufScale   = gl.createBuffer();
        this.bufColor   = gl.createBuffer();
        this.bufOpacity = gl.createBuffer();
        this.bufQuat    = gl.createBuffer();   // v342 — NEW

        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
        gl.bufferData(gl.ARRAY_BUFFER, s.count * 3 * 4, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufScale);
        gl.bufferData(gl.ARRAY_BUFFER, s.count * 3 * 4, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufColor);
        gl.bufferData(gl.ARRAY_BUFFER, s.count * 3 * 4, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufOpacity);
        gl.bufferData(gl.ARRAY_BUFFER, s.count * 4, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufQuat);
        gl.bufferData(gl.ARRAY_BUFFER, s.count * 4 * 4, gl.DYNAMIC_DRAW);

        // VAO
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufCorner);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(1, 1);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufScale);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(2, 1);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufColor);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(3, 1);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufOpacity);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(4, 1);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufQuat);
        gl.enableVertexAttribArray(5);
        gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(5, 1);

        gl.bindVertexArray(null);

        // Sorted-upload scratch
        this._sortedPos     = new Float32Array(s.count * 3);
        this._sortedScale   = new Float32Array(s.count * 3);
        this._sortedColor   = new Float32Array(s.count * 3);
        this._sortedOpacity = new Float32Array(s.count);
        this._sortedQuat    = new Float32Array(s.count * 4);  // v342
    }

    _sort(camX, camY, camZ) {
        const moved = camX !== this._lastCamX || camY !== this._lastCamY || camZ !== this._lastCamZ;
        if (!moved) return false;
        const pos = this.splat.positions;
        const keys = this._sortKeys;
        const idx = this._indices;
        const ox = this.position[0], oy = this.position[1], oz = this.position[2];
        const ws = this.scale;
        for (let i = 0; i < this.splat.count; i++) {
            const dx = pos[i * 3 + 0] * ws + ox - camX;
            const dy = pos[i * 3 + 1] * ws + oy - camY;
            const dz = pos[i * 3 + 2] * ws + oz - camZ;
            keys[i] = -(dx * dx + dy * dy + dz * dz);
        }
        // v4264 -- was `Array.from(idx).sort((a, b) => keys[a] - keys[b])`, which boxed every index into a
        // plain Array once per frame and paid a call per comparison. Measured 255.87 ms at 500K splats;
        // the radix sort is 14.43 ms for the SAME permutation. See render/splatSort.mjs.
        radixSortIndices(keys, idx, this._sortScratch);
        this._lastCamX = camX; this._lastCamY = camY; this._lastCamZ = camZ;
        return true;
    }

    _uploadSorted() {
        const gl = this.gl;
        const s = this.splat;
        const idx = this._indices;
        const sp = this._sortedPos, ss = this._sortedScale, sc = this._sortedColor;
        const so = this._sortedOpacity, sq = this._sortedQuat;
        for (let i = 0; i < s.count; i++) {
            const k = idx[i];
            sp[i * 3 + 0] = s.positions[k * 3 + 0];
            sp[i * 3 + 1] = s.positions[k * 3 + 1];
            sp[i * 3 + 2] = s.positions[k * 3 + 2];
            ss[i * 3 + 0] = s.scales[k * 3 + 0];
            ss[i * 3 + 1] = s.scales[k * 3 + 1];
            ss[i * 3 + 2] = s.scales[k * 3 + 2];
            sc[i * 3 + 0] = s.colors[k * 3 + 0];
            sc[i * 3 + 1] = s.colors[k * 3 + 1];
            sc[i * 3 + 2] = s.colors[k * 3 + 2];
            so[i] = s.opacities[k];
            sq[i * 4 + 0] = s.quats[k * 4 + 0];
            sq[i * 4 + 1] = s.quats[k * 4 + 1];
            sq[i * 4 + 2] = s.quats[k * 4 + 2];
            sq[i * 4 + 3] = s.quats[k * 4 + 3];
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, sp);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufScale);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, ss);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufColor);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, sc);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufOpacity);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, so);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufQuat);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, sq);
    }

    draw(viewMat, projMat, camPos /*, opts */) {
        if (!this.visible) return;
        const gl = this.gl;
        const moved = this._sort(camPos[0], camPos[1], camPos[2]);
        if (moved || this._firstDraw !== false) this._uploadSorted();
        this._firstDraw = false;

        gl.useProgram(this.prog);
        gl.bindVertexArray(this.vao);
        gl.uniformMatrix4fv(this.u_view, false, viewMat);
        gl.uniformMatrix4fv(this.u_proj, false, projMat);
        gl.uniform3f(this.u_off, this.position[0], this.position[1], this.position[2]);
        gl.uniform1f(this.u_ws,  this.scale);
        // Viewport: needed for the ~1-pixel blur term that prevents
        // singular cov2D matrices. Read live so canvas resizes work.
        gl.uniform2f(this.u_viewport, gl.drawingBufferWidth, gl.drawingBufferHeight);

        const prevBlend = gl.isEnabled(gl.BLEND);
        const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.splat.count);
        gl.depthMask(prevDepthMask);
        if (!prevBlend) gl.disable(gl.BLEND);

        gl.bindVertexArray(null);
    }

    dispose() {
        const gl = this.gl;
        if (this.prog)       gl.deleteProgram(this.prog);
        if (this.vao)        gl.deleteVertexArray(this.vao);
        if (this.bufCorner)  gl.deleteBuffer(this.bufCorner);
        if (this.bufPos)     gl.deleteBuffer(this.bufPos);
        if (this.bufScale)   gl.deleteBuffer(this.bufScale);
        if (this.bufColor)   gl.deleteBuffer(this.bufColor);
        if (this.bufOpacity) gl.deleteBuffer(this.bufOpacity);
        if (this.bufQuat)    gl.deleteBuffer(this.bufQuat);
    }
}
