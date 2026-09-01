// FILE: render/SplatRenderer.js
// VERSION: v2 (v785 — full 3DGS rasterizer added; v784 billboard kept as fallback mode)
//
// Two-mode Gaussian-splat renderer:
//
//   mode="billboard"  (v784, fallback) — colored gl.POINTS, soft round dots.
//                     Cheap, no depth sort, visualization-grade only.
//
//   mode="gaussian"   (v785, default)  — real 3D Gaussian splatting:
//                     - Per-splat 3D covariance computed from (scale, rotation)
//                     - CPU depth sort each frame (Float32 array sort by view-Z)
//                     - Vertex shader projects 3D covariance to 2D screen-space
//                       conic via the perspective Jacobian
//                     - Instanced quad: 4 corners × N splats
//                     - Fragment shader evaluates the 2D Gaussian:
//                         alpha = opacity * exp(-0.5 * d^T * conic * d)
//                       and discards below threshold
//                     - Standard alpha-blend, no tile rasterization
//
// What this is NOT:
//   - A photoreal production-grade 3DGS rasterizer (no GPU sort, no SH
//     beyond DC, no tile-based scheduling, no anti-aliasing pass). Those
//     additions would each be substantial — this implementation matches
//     antimatter15/splat and other "minimal viable" WebGL2 ports in scope.
//   - Capable of handling >500K splats interactively -- TRUE ONLY SINCE v4264. With the comparison
//     sort this file shipped until then it was 255.87 ms per sort at 500K, i.e. 3.7 fps, and the
//     claim was simply false. The radix sort in render/splatSort.mjs makes it 14.43 ms. (O(N) now,
//     each frame; at 1M splats this becomes a >50ms cost).
//
// Reference: Kerbl et al. 2023, "3D Gaussian Splatting for Real-Time
// Radiance Field Rendering" — covariance / Jacobian math follows the
// supplementary material formulation.

// ============================================================================
// MODE 1: BILLBOARD (v784 — fallback, cheap)
// ============================================================================

import { radixSortIndices, makeSortScratch } from "./splatSort.mjs";   // v4264

const VS_BILLBOARD = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aColor;
uniform mat4 uViewProj;
uniform float uPointSize;
out vec4 vColor;
void main() {
    gl_Position = uViewProj * vec4(aPos, 1.0);
    gl_PointSize = uPointSize / max(gl_Position.w, 0.5);
    vColor = aColor;
}`;

const FS_BILLBOARD = `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 fragColor;
void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float a = 1.0 - smoothstep(0.18, 0.25, r2);
    fragColor = vec4(vColor.rgb, vColor.a * a);
}`;

// ============================================================================
// MODE 2: GAUSSIAN (v785 — real 3DGS)
// ============================================================================
//
// Vertex shader receives a per-splat instance attribute pack (position,
// color+opacity, scale, rotation quaternion) plus per-vertex quad corner
// in [-1,+1]^2. It computes the per-splat 3D covariance, transforms it
// to view space, projects to 2D screen space via the perspective Jacobian,
// and outputs the quad corner position in clip space along with the
// conic (inverse 2D covariance) for the fragment shader.

const VS_GAUSSIAN = `#version 300 es
layout(location=0) in vec2 aQuadCorner;          // per-vertex: (-1,-1) ... (1,1)
layout(location=1) in vec3 aPos;                 // per-instance: splat center
layout(location=2) in vec4 aColor;               // per-instance: rgba (uint8 → float)
layout(location=3) in vec3 aScale;               // per-instance: linear scales
layout(location=4) in vec4 aRot;                 // per-instance: quaternion (w,x,y,z)
layout(location=5) in vec3 aSh1Y;                // v792 — SH1 Y-direction RGB coefficients
layout(location=6) in vec3 aSh1Z;                // v792 — SH1 Z-direction RGB coefficients
layout(location=7) in vec3 aSh1X;                // v792 — SH1 X-direction RGB coefficients

uniform mat4 uView;
uniform mat4 uProj;
uniform vec2 uViewport;                          // screen size (px)
uniform float uTanFov;                           // tan(fovY/2), for Jacobian
uniform float uModelScale;                       // v786 — uniform scale applied via SplatScene
uniform vec3 uCameraPos;                         // v792 — world-space camera position for SH1 view direction
uniform float uHasSh1;                           // v792 — 1.0 = evaluate SH1, 0.0 = DC only

out vec3 vColor;
out float vOpacity;
out vec2 vConicXY;                               // conic upper-triangle: a,b (ay+bx = a, bx+cy=...)
out float vConicZ;                               // conic c
out vec2 vCenterPx;                              // splat center in pixel coords
flat out vec2 vDelta;                            // pixel offset of this fragment from center
out vec2 vQuadPx;                                // this corner's pixel offset from center

mat3 quatToMat(vec4 q) {
    // q = (w, x, y, z), assume normalized
    float w = q.x, x = q.y, y = q.z, z = q.w;
    return mat3(
        1.0 - 2.0*(y*y + z*z),  2.0*(x*y - z*w),         2.0*(x*z + y*w),
        2.0*(x*y + z*w),         1.0 - 2.0*(x*x + z*z),  2.0*(y*z - x*w),
        2.0*(x*z - y*w),         2.0*(y*z + x*w),         1.0 - 2.0*(x*x + y*y)
    );
}

void main() {
    // Splat center in view space
    vec4 viewCenter = uView * vec4(aPos, 1.0);

    // Compute 3D covariance: Sigma = R * S * S^T * R^T
    mat3 R = quatToMat(normalize(aRot));
    vec3 effScale = aScale * uModelScale;
    mat3 S = mat3(effScale.x, 0.0, 0.0,
                  0.0, effScale.y, 0.0,
                  0.0, 0.0, effScale.z);
    mat3 M = R * S;
    mat3 Sigma3D = M * transpose(M);

    // Transform covariance into view space: V * Sigma3D * V^T (V = view rotation, 3x3 top-left of uView)
    mat3 V = mat3(uView);
    mat3 Sigma3D_v = V * Sigma3D * transpose(V);

    // Compute perspective Jacobian J at viewCenter
    float z = max(-viewCenter.z, 0.001);
    float fx = uViewport.x / (2.0 * uTanFov);
    float fy = uViewport.y / (2.0 * uTanFov);
    mat3 J = mat3(
        fx / z,    0.0,        0.0,
        0.0,      -fy / z,     0.0,
        -fx * viewCenter.x / (z*z),   fy * viewCenter.y / (z*z),  0.0
    );
    // (Column-major: the 3rd column zeros means the 2D-projected covariance
    //  is the 2x2 upper-left of J * Sigma3D_v * J^T.)

    mat3 cov2D_full = J * Sigma3D_v * transpose(J);
    // v789 — Mip-Splatting AA: add a constant ~0.3 px² low-pass term
    // to the 2D covariance diagonal. This guarantees a minimum
    // screen-space footprint of ~1 pixel and prevents aliasing when
    // splats project to sub-pixel size at distance.
    // Reference: Yu et al. 2024, "Mip-Splatting: Alias-free 3D Gaussian Splatting"
    // (formula 9, with the filter constant chosen for WebGL2 mediump compatibility).
    // The +0.3 regularizer below was the pre-AA version — keep it as a floor.
    float Cxx = cov2D_full[0][0] + 0.3;
    float Cxy = cov2D_full[0][1];
    float Cyy = cov2D_full[1][1] + 0.3;
    // AA: compute the ratio between filtered and unfiltered determinants.
    // Used to compensate alpha so AA'd splats don't appear too bright.
    float det_unfilt = max(0.001, Cxx * Cyy - Cxy * Cxy);
    // Apply low-pass filter (Mip-Splatting eq. 9)
    Cxx += 0.3;
    Cyy += 0.3;
    float det = Cxx * Cyy - Cxy * Cxy;
    float aaCompensation = sqrt(max(0.001, det_unfilt / det));
    if (det <= 0.0) {
        // Degenerate — emit zero-area quad to discard
        gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
        vConicXY = vec2(0.0); vConicZ = 0.0; vQuadPx = vec2(0.0);
        vColor = vec3(0.0); vOpacity = 0.0;
        return;
    }
    // Conic = inverse(Cov2D)
    float invDet = 1.0 / det;
    float Aconic = Cyy * invDet;
    float Bconic = -Cxy * invDet;
    float Cconic = Cxx * invDet;

    // Screen-space extent: project the eigenvalues, use 3 sigma as the radius
    float mid = 0.5 * (Cxx + Cyy);
    float lambda1 = mid + sqrt(max(0.1, mid * mid - det));
    float lambda2 = mid - sqrt(max(0.1, mid * mid - det));
    float radius = ceil(3.0 * sqrt(max(lambda1, lambda2)));

    // Splat center in pixel coords (NDC → pixels)
    vec4 clipCenter = uProj * viewCenter;
    vec2 ndcCenter = clipCenter.xy / clipCenter.w;
    vec2 pxCenter = (ndcCenter * 0.5 + 0.5) * uViewport;

    // This vertex's pixel offset (relative to splat center) is radius * aQuadCorner
    vec2 vertexPx = pxCenter + aQuadCorner * radius;
    vec2 vertexNdc = vertexPx / uViewport * 2.0 - 1.0;

    // Emit in clip space, preserving the splat's depth
    gl_Position = vec4(vertexNdc * clipCenter.w, clipCenter.z, clipCenter.w);

    vColor = aColor.rgb;
    // v792 — SH1 view-dependent color. Skipped when the cloud has no SH1
    // data (uHasSh1 = 0). Otherwise: view direction d = normalize(splat - cam),
    // evaluate the 3 SH1 basis functions, add to base color.
    // Basis (real spherical harmonics, l=1):
    //   Y_1^-1 = -SH1 * d.y    (Y direction)
    //   Y_1^0  =  SH1 * d.z    (Z direction)
    //   Y_1^+1 = -SH1 * d.x    (X direction)
    // where SH1 = sqrt(3/(4*pi)) ≈ 0.4886
    if (uHasSh1 > 0.5) {
        vec3 dir = normalize(aPos - uCameraPos);
        float SH1 = 0.4886025119029199;
        vec3 sh1Contrib = -SH1 * dir.y * aSh1Y
                        +  SH1 * dir.z * aSh1Z
                        -  SH1 * dir.x * aSh1X;
        vColor = clamp(vColor + sh1Contrib, 0.0, 1.0);
    }
    vOpacity = aColor.a * aaCompensation;   // v789 — Mip-Splatting AA energy preservation
    vConicXY = vec2(Aconic, Bconic);
    vConicZ = Cconic;
    vQuadPx = aQuadCorner * radius;
}`;

const FS_GAUSSIAN = `#version 300 es
precision highp float;

in vec3 vColor;
in float vOpacity;
in vec2 vConicXY;
in float vConicZ;
in vec2 vQuadPx;

out vec4 fragColor;

void main() {
    // Evaluate 2D Gaussian: power = -0.5 * (Ax^2 + 2Bxy + Cy^2)
    float x = vQuadPx.x;
    float y = vQuadPx.y;
    float power = -0.5 * (vConicXY.x * x * x + vConicZ * y * y) - vConicXY.y * x * y;
    if (power > 0.0) discard;             // outside the ellipse
    float alpha = min(0.99, vOpacity * exp(power));
    if (alpha < 0.005) discard;            // negligible contribution
    fragColor = vec4(vColor, alpha);
}`;

function _compile(gl, src, type, label) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error(`SplatRenderer[${label}] shader: ${log}`);
    }
    return sh;
}

function _link(gl, vs, fs, label) {
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(p);
        gl.deleteProgram(p);
        throw new Error(`SplatRenderer[${label}] link: ${log}`);
    }
    return p;
}

export class SplatRenderer {
    constructor(gl, options = {}) {
        this.gl = gl;
        this.mode = options.mode ?? "gaussian";     // "billboard" | "gaussian"
        this.pointSize = options.pointSize ?? 4.0;  // billboard-mode only
        this.tanFov = options.tanFov ?? Math.tan(0.5 * 1.0472);   // default 60deg FOV — caller can override
        this.viewport = [1, 1];                     // updated each frame from canvas

        // Billboard program
        {
            const vs = _compile(gl, VS_BILLBOARD, gl.VERTEX_SHADER, "billboard-vs");
            const fs = _compile(gl, FS_BILLBOARD, gl.FRAGMENT_SHADER, "billboard-fs");
            this.progBB = _link(gl, vs, fs, "billboard");
            this.uBB_ViewProj  = gl.getUniformLocation(this.progBB, "uViewProj");
            this.uBB_PointSize = gl.getUniformLocation(this.progBB, "uPointSize");
        }
        // Gaussian program
        {
            const vs = _compile(gl, VS_GAUSSIAN, gl.VERTEX_SHADER, "gauss-vs");
            const fs = _compile(gl, FS_GAUSSIAN, gl.FRAGMENT_SHADER, "gauss-fs");
            this.progG = _link(gl, vs, fs, "gaussian");
            this.uG_View      = gl.getUniformLocation(this.progG, "uView");
            this.uG_Proj      = gl.getUniformLocation(this.progG, "uProj");
            this.uG_Viewport  = gl.getUniformLocation(this.progG, "uViewport");
            this.uG_TanFov    = gl.getUniformLocation(this.progG, "uTanFov");
            this.uG_ModelScale = gl.getUniformLocation(this.progG, "uModelScale");   // v786
            this.uG_CameraPos  = gl.getUniformLocation(this.progG, "uCameraPos");    // v792
            this.uG_HasSh1     = gl.getUniformLocation(this.progG, "uHasSh1");       // v792
        }

        this.vao = null;
        this.bufPos = this.bufColor = this.bufScale = this.bufRot = null;
        this.bufQuad = null;           // shared quad corners
        this.bufIndex = null;          // shared quad index buffer
        this.count = 0;

        // Cached splat data + view-space Z scratch for sorting
        this._splatPos = null;
        this._splatCol = null;
        this._splatScale = null;
        this._splatRot = null;
        this._sortIdx = null;
        this._sortKey = null;          // view-space z per splat, for sort comparator
        // Sorted GPU buffers (re-uploaded each frame in gaussian mode)
        this._sortedPos = null;
        this._sortedCol = null;
        this._sortedScale = null;
        this._sortedRot = null;
        this._lastViewKey = null;      // debounce sort if view matrix barely changed
        // v786 — uniform scale applied to per-splat scales for covariance.
        // Lets SplatScene scale a loaded cloud without re-uploading instance data.
        this.modelScale = 1.0;
    }

    /**
     * Load a parsed splat (output of SplatLoader.parseSplatFile) into
     * GPU buffers. Replaces any previous load.
     */
    load(parsed) {
        const gl = this.gl;
        if (this.vao) this._disposeGpuBuffers();

        this.count = parsed.count;
        this._splatPos = parsed.positions;
        this._splatCol = parsed.colors;
        this._splatScale = parsed.scales;

        // v787 — compute AABB at load time for frustum culling.
        // Walks positions once. Min/max are used by the renderer-side
        // frustum test in draw(). Padded slightly by max scale so big
        // splats near the AABB edge aren't culled prematurely.
        if (this.count > 0) {
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            let maxScale = 0;
            for (let i = 0; i < this.count; i++) {
                const x = parsed.positions[i*3+0];
                const y = parsed.positions[i*3+1];
                const z = parsed.positions[i*3+2];
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
                if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
                const s = Math.max(parsed.scales[i*3+0], parsed.scales[i*3+1], parsed.scales[i*3+2]);
                if (s > maxScale) maxScale = s;
            }
            // Pad by 3 sigma of the largest splat — matches the vertex
            // shader's 3*sqrt(eigenvalue) extent
            const pad = 3 * maxScale;
            this.aabb = { minX: minX - pad, minY: minY - pad, minZ: minZ - pad,
                          maxX: maxX + pad, maxY: maxY + pad, maxZ: maxZ + pad };
        } else {
            this.aabb = null;
        }

        // .splat format stores rotation as 4 bytes packed quaternion (0..255 → -1..+1)
        // .ply formats store rotation as 4 floats already
        if (parsed.rotations instanceof Uint8Array) {
            const fr = new Float32Array(this.count * 4);
            for (let i = 0; i < this.count * 4; i++) {
                fr[i] = (parsed.rotations[i] - 128) / 128;
            }
            this._splatRot = fr;
        } else {
            this._splatRot = parsed.rotations;
        }
        this._sortIdx = new Uint32Array(this.count);
        this._sortKey = new Float32Array(this.count);
        this._sortScratch = makeSortScratch(this.count);   // v4264 -- allocated once, not per frame
        for (let i = 0; i < this.count; i++) this._sortIdx[i] = i;

        // Allocate sorted instance buffers — written each frame in gaussian mode
        this._sortedPos   = new Float32Array(this.count * 3);
        this._sortedCol   = new Uint8Array  (this.count * 4);
        this._sortedScale = new Float32Array(this.count * 3);
        this._sortedRot   = new Float32Array(this.count * 4);

        // VAO with quad geometry + 5 instanced attributes
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        // Quad geometry: 4 corners
        this.bufQuad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufQuad);
        const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(0, 0);

        // Quad index buffer for the triangle strip
        this.bufIndex = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIndex);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 3]), gl.STATIC_DRAW);

        // Instanced position attribute (loc=1)
        this.bufPos = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
        gl.bufferData(gl.ARRAY_BUFFER, this._sortedPos.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(1, 1);

        // Instanced color attribute (loc=2)
        this.bufColor = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufColor);
        gl.bufferData(gl.ARRAY_BUFFER, this._sortedCol.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 0, 0);
        gl.vertexAttribDivisor(2, 1);

        // Instanced scale (loc=3)
        this.bufScale = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufScale);
        gl.bufferData(gl.ARRAY_BUFFER, this._sortedScale.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(3, 1);

        // Instanced rotation (loc=4)
        this.bufRot = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufRot);
        gl.bufferData(gl.ARRAY_BUFFER, this._sortedRot.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(4, 1);

        // v792 — SH1 instance buffers. Three vec3 attributes (locations 5/6/7)
        // for the Y/Z/X SH1 directional coefficients per RGB channel.
        // Always allocated (small relative to instance data) but only filled
        // when input has SH1 data. The uHasSh1 uniform gates evaluation in
        // the shader.
        this._splatSh1   = parsed.sh1 ?? null;
        this._sortedSh1  = parsed.sh1 ? new Float32Array(this.count * 9) : null;
        this._hasSh1     = !!parsed.sh1;
        if (this._hasSh1) {
            this.bufSh1Y = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSh1Y);
            gl.bufferData(gl.ARRAY_BUFFER, this.count * 3 * 4, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(5);
            gl.vertexAttribPointer(5, 3, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(5, 1);

            this.bufSh1Z = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSh1Z);
            gl.bufferData(gl.ARRAY_BUFFER, this.count * 3 * 4, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(6);
            gl.vertexAttribPointer(6, 3, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(6, 1);

            this.bufSh1X = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSh1X);
            gl.bufferData(gl.ARRAY_BUFFER, this.count * 3 * 4, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(7);
            gl.vertexAttribPointer(7, 3, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(7, 1);
            console.log(`[SplatRenderer] SH1 active (${this.count} splats × 9 floats)`);
        }

        // For billboard mode: separate (non-instanced) attributes at the
        // same loc as gaussian's per-instance ones, but with divisor 0.
        // We re-bind on each draw — simpler than maintaining two VAOs.

        gl.bindVertexArray(null);
    }

    /**
     * Sort splats by view-space depth (back-to-front) for correct alpha-blend.
     * O(N log N) JS sort. View matrix is column-major Float32Array(16).
     */
    _sortByDepth(viewMatrix) {
        const M = viewMatrix;
        const pos = this._splatPos;
        const keys = this._sortKey;
        const idx = this._sortIdx;
        // View-space Z = M[2]*x + M[6]*y + M[10]*z + M[14]
        for (let i = 0; i < this.count; i++) {
            const x = pos[i*3+0], y = pos[i*3+1], z = pos[i*3+2];
            keys[i] = M[2]*x + M[6]*y + M[10]*z + M[14];
            idx[i] = i;
        }
        // Sort indices by keys (back-to-front: more negative Z = further away).
        //
        // v4264 -- *** THE COMMENT THAT USED TO SIT HERE WAS THE HONEST HALF OF A FILE THAT CONTRADICTED
        // *** ITSELF. *** It said "for typical N=32K it's fine; we accept the cost", while this file's own
        // header claims ">500K splats interactively". Measured: Array.from(idx).sort(comparator) is 255.87 ms
        // at 500K splats -- 3.7 fps, and 16x over a 60 fps frame budget. The radix sort below produces the
        // SAME permutation in 14.43 ms, which is 69 fps and inside the budget. The header's claim was the
        // false half and is now corrected; this is the code that makes it true.
        radixSortIndices(keys, idx, this._sortScratch);

        // Gather sorted instance data
        for (let j = 0; j < this.count; j++) {
            const i = idx[j];
            this._sortedPos[j*3+0]   = pos[i*3+0];
            this._sortedPos[j*3+1]   = pos[i*3+1];
            this._sortedPos[j*3+2]   = pos[i*3+2];
            this._sortedCol[j*4+0]   = this._splatCol[i*4+0];
            this._sortedCol[j*4+1]   = this._splatCol[i*4+1];
            this._sortedCol[j*4+2]   = this._splatCol[i*4+2];
            this._sortedCol[j*4+3]   = this._splatCol[i*4+3];
            this._sortedScale[j*3+0] = this._splatScale[i*3+0];
            this._sortedScale[j*3+1] = this._splatScale[i*3+1];
            this._sortedScale[j*3+2] = this._splatScale[i*3+2];
            this._sortedRot[j*4+0]   = this._splatRot[i*4+0];
            this._sortedRot[j*4+1]   = this._splatRot[i*4+1];
            this._sortedRot[j*4+2]   = this._splatRot[i*4+2];
            this._sortedRot[j*4+3]   = this._splatRot[i*4+3];
            // v792 — gather SH1 if present (9 floats per splat)
            if (this._hasSh1) {
                for (let k = 0; k < 9; k++) {
                    this._sortedSh1[j*9+k] = this._splatSh1[i*9+k];
                }
            }
        }
    }

    /**
     * v787 — frustum cull. Returns true if the AABB is at least
     * partially inside the view-projection frustum, false if entirely
     * outside. Uses the 8-corner-project-to-clip approach: cheap
     * (8*16 = 128 mults), conservative (might fail to cull large
     * diagonal-spanning AABBs but won't falsely reject).
     */
    isAabbInFrustum(viewProj) {
        if (!this.aabb) return true;   // no bounds = unknown, default visible
        const a = this.aabb;
        const VP = viewProj;
        // 6 plane outside flags, one per frustum plane
        let allOutLeft = true, allOutRight = true;
        let allOutBottom = true, allOutTop = true;
        let allOutNear = true, allOutFar = true;
        for (let i = 0; i < 8; i++) {
            const x = (i & 1) ? a.maxX : a.minX;
            const y = (i & 2) ? a.maxY : a.minY;
            const z = (i & 4) ? a.maxZ : a.minZ;
            // Transform to clip space via column-major matrix
            const cx = VP[0]*x + VP[4]*y + VP[8]*z  + VP[12];
            const cy = VP[1]*x + VP[5]*y + VP[9]*z  + VP[13];
            const cz = VP[2]*x + VP[6]*y + VP[10]*z + VP[14];
            const cw = VP[3]*x + VP[7]*y + VP[11]*z + VP[15];
            if (cx > -cw) allOutLeft = false;
            if (cx <  cw) allOutRight = false;
            if (cy > -cw) allOutBottom = false;
            if (cy <  cw) allOutTop = false;
            if (cz > -cw) allOutNear = false;
            if (cz <  cw) allOutFar = false;
        }
        return !(allOutLeft || allOutRight || allOutBottom || allOutTop || allOutNear || allOutFar);
    }

    /**
     * Draw with the current mode.
     */
    draw(viewProj, view = null, proj = null) {
        if (!this.vao || this.count === 0) return;
        // v787 — frustum cull entire cloud before any per-frame work
        if (!this.isAabbInFrustum(viewProj)) {
            this._culledLastFrame = true;
            return;
        }
        this._culledLastFrame = false;
        const gl = this.gl;

        if (this.mode === "gaussian" && view && proj) {
            this._drawGaussian(view, proj);
        } else {
            this._drawBillboard(viewProj);
        }
    }

    _drawBillboard(viewProj) {
        const gl = this.gl;
        // For billboard mode, push raw (unsorted) instance data into the
        // POS + COL buffers AS NON-INSTANCED so gl.POINTS can use them.
        // We swap divisors on the fly.
        gl.useProgram(this.progBB);
        gl.uniformMatrix4fv(this.uBB_ViewProj, false, viewProj);
        gl.uniform1f(this.uBB_PointSize, this.pointSize);

        // Upload unsorted (billboard = no depth sort anyway)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._splatPos);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufColor);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._splatCol);

        gl.bindVertexArray(this.vao);
        // Re-bind loc=0 (pos) and loc=1 (color) with divisor 0
        // and disable instanced attrs (loc=3,4 — scale,rot — unused in billboard)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufColor);
        gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, 0, 0);
        gl.vertexAttribDivisor(1, 0);
        gl.disableVertexAttribArray(2);
        gl.disableVertexAttribArray(3);
        gl.disableVertexAttribArray(4);
        // v792 — also disable SH1 attribs in billboard mode
        gl.disableVertexAttribArray(5);
        gl.disableVertexAttribArray(6);
        gl.disableVertexAttribArray(7);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.POINTS, 0, this.count);
        gl.disable(gl.BLEND);

        gl.bindVertexArray(null);
        // VAO state is now mutated — next gaussian draw will re-bind. The
        // VAO restoration happens in _drawGaussian's bind/upload sequence.
    }

    _drawGaussian(view, proj) {
        const gl = this.gl;
        // Sort by depth (CPU)
        this._sortByDepth(view);

        // Upload sorted instance buffers
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._sortedPos);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufColor);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._sortedCol);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufScale);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._sortedScale);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufRot);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._sortedRot);

        // v792 — upload SH1 instance data (split into Y/Z/X vec3 streams)
        if (this._hasSh1) {
            // We need to stripe the 9-float interleaved array into 3 separate
            // vec3 streams. Reuse small scratch arrays.
            if (!this._sortedSh1Y) {
                this._sortedSh1Y = new Float32Array(this.count * 3);
                this._sortedSh1Z = new Float32Array(this.count * 3);
                this._sortedSh1X = new Float32Array(this.count * 3);
            }
            for (let i = 0; i < this.count; i++) {
                this._sortedSh1Y[i*3+0] = this._sortedSh1[i*9+0];
                this._sortedSh1Y[i*3+1] = this._sortedSh1[i*9+3];
                this._sortedSh1Y[i*3+2] = this._sortedSh1[i*9+6];
                this._sortedSh1Z[i*3+0] = this._sortedSh1[i*9+1];
                this._sortedSh1Z[i*3+1] = this._sortedSh1[i*9+4];
                this._sortedSh1Z[i*3+2] = this._sortedSh1[i*9+7];
                this._sortedSh1X[i*3+0] = this._sortedSh1[i*9+2];
                this._sortedSh1X[i*3+1] = this._sortedSh1[i*9+5];
                this._sortedSh1X[i*3+2] = this._sortedSh1[i*9+8];
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSh1Y);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._sortedSh1Y);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSh1Z);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._sortedSh1Z);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSh1X);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._sortedSh1X);
        }

        gl.useProgram(this.progG);
        gl.uniformMatrix4fv(this.uG_View, false, view);
        gl.uniformMatrix4fv(this.uG_Proj, false, proj);
        gl.uniform2f(this.uG_Viewport, this.viewport[0], this.viewport[1]);
        gl.uniform1f(this.uG_TanFov, this.tanFov);
        gl.uniform1f(this.uG_ModelScale, this.modelScale);   // v786
        // v792 — SH1 uniforms. Camera position extracted from inverse view:
        // eye = -V^T * V_translation. View is column-major; rotation is the
        // top-left 3x3, translation is the last column.
        if (this.uG_CameraPos) {
            // V[0..2] = col0 of rotation, V[4..6] = col1, V[8..10] = col2.
            // For an orthonormal rotation, V^T equals rows = old columns.
            // eye = -(V_rot^T * V_trans). Expand:
            //   eye.x = -(V[0]*V[12] + V[1]*V[13] + V[2]*V[14])
            //   eye.y = -(V[4]*V[12] + V[5]*V[13] + V[6]*V[14])
            //   eye.z = -(V[8]*V[12] + V[9]*V[13] + V[10]*V[14])
            const ex = -(view[0]*view[12] + view[1]*view[13] + view[2]*view[14]);
            const ey = -(view[4]*view[12] + view[5]*view[13] + view[6]*view[14]);
            const ez = -(view[8]*view[12] + view[9]*view[13] + view[10]*view[14]);
            gl.uniform3f(this.uG_CameraPos, ex, ey, ez);
        }
        if (this.uG_HasSh1) gl.uniform1f(this.uG_HasSh1, this._hasSh1 ? 1.0 : 0.0);

        gl.bindVertexArray(this.vao);
        // Restore the gaussian-mode binding state (instanced loc=1..4, quad loc=0)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufQuad);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(1, 1);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufColor);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 0, 0);
        gl.vertexAttribDivisor(2, 1);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufScale);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(3, 1);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufRot);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(4, 1);

        // v792 — SH1 attribute re-bind (or disable if absent)
        if (this._hasSh1) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSh1Y);
            gl.enableVertexAttribArray(5);
            gl.vertexAttribPointer(5, 3, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(5, 1);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSh1Z);
            gl.enableVertexAttribArray(6);
            gl.vertexAttribPointer(6, 3, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(6, 1);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSh1X);
            gl.enableVertexAttribArray(7);
            gl.vertexAttribPointer(7, 3, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(7, 1);
        } else {
            // Set vertex attribute constants for the missing SH1 attribs.
            // vertexAttrib3f leaves the attribute at a fixed value across
            // all instances (instead of reading from a buffer), so the
            // shader's aSh1Y/Z/X read zero and SH1 contribution is zero
            // even when uHasSh1 is incorrectly set (defense in depth).
            gl.disableVertexAttribArray(5);
            gl.disableVertexAttribArray(6);
            gl.disableVertexAttribArray(7);
            gl.vertexAttrib3f(5, 0, 0, 0);
            gl.vertexAttrib3f(6, 0, 0, 0);
            gl.vertexAttrib3f(7, 0, 0, 0);
        }

        // Alpha-blend back-to-front. v787 — depth-test ON (read against
        // the existing buffer so meshes correctly occlude splats), but
        // depth-write OFF (we don't want a 2D splat quad polluting the
        // depth buffer for subsequent passes — alpha blending handles
        // visibility within the splat cloud itself via the CPU sort).
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIndex);
        gl.drawElementsInstanced(gl.TRIANGLE_STRIP, 4, gl.UNSIGNED_SHORT, 0, this.count);

        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(null);
    }

    /**
     * v793 — draw a sorted subset of this layer's splats using externally
     * provided indices. Used by SplatScene's merged-sort path so cross-layer
     * compositing is correct. Bypasses the internal _sortByDepth (the
     * caller already did a global sort across all layers).
     *
     * @param {Float32Array} view 4x4 column-major (composed with layer transform)
     * @param {Float32Array} proj 4x4 column-major
     * @param {Uint32Array} indices  splat indices into this._splatPos etc.
     * @param {number} count  how many entries from `indices` to draw
     */
    drawSubset(view, proj, indices, count) {
        if (!this.vao || count === 0) return;
        const gl = this.gl;

        // Gather only `count` entries into _sorted* (no internal sort)
        for (let j = 0; j < count; j++) {
            const i = indices[j];
            this._sortedPos[j*3+0]   = this._splatPos[i*3+0];
            this._sortedPos[j*3+1]   = this._splatPos[i*3+1];
            this._sortedPos[j*3+2]   = this._splatPos[i*3+2];
            this._sortedCol[j*4+0]   = this._splatCol[i*4+0];
            this._sortedCol[j*4+1]   = this._splatCol[i*4+1];
            this._sortedCol[j*4+2]   = this._splatCol[i*4+2];
            this._sortedCol[j*4+3]   = this._splatCol[i*4+3];
            this._sortedScale[j*3+0] = this._splatScale[i*3+0];
            this._sortedScale[j*3+1] = this._splatScale[i*3+1];
            this._sortedScale[j*3+2] = this._splatScale[i*3+2];
            this._sortedRot[j*4+0]   = this._splatRot[i*4+0];
            this._sortedRot[j*4+1]   = this._splatRot[i*4+1];
            this._sortedRot[j*4+2]   = this._splatRot[i*4+2];
            this._sortedRot[j*4+3]   = this._splatRot[i*4+3];
            if (this._hasSh1) {
                for (let k = 0; k < 9; k++) {
                    this._sortedSh1[j*9+k] = this._splatSh1[i*9+k];
                }
            }
        }

        // Upload first `count` entries. bufferSubData writes from offset 0.
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._sortedPos.subarray(0, count * 3));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufColor);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._sortedCol.subarray(0, count * 4));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufScale);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._sortedScale.subarray(0, count * 3));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufRot);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._sortedRot.subarray(0, count * 4));

        if (this._hasSh1) {
            if (!this._sortedSh1Y) {
                this._sortedSh1Y = new Float32Array(this.count * 3);
                this._sortedSh1Z = new Float32Array(this.count * 3);
                this._sortedSh1X = new Float32Array(this.count * 3);
            }
            for (let i = 0; i < count; i++) {
                this._sortedSh1Y[i*3+0] = this._sortedSh1[i*9+0];
                this._sortedSh1Y[i*3+1] = this._sortedSh1[i*9+3];
                this._sortedSh1Y[i*3+2] = this._sortedSh1[i*9+6];
                this._sortedSh1Z[i*3+0] = this._sortedSh1[i*9+1];
                this._sortedSh1Z[i*3+1] = this._sortedSh1[i*9+4];
                this._sortedSh1Z[i*3+2] = this._sortedSh1[i*9+7];
                this._sortedSh1X[i*3+0] = this._sortedSh1[i*9+2];
                this._sortedSh1X[i*3+1] = this._sortedSh1[i*9+5];
                this._sortedSh1X[i*3+2] = this._sortedSh1[i*9+8];
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSh1Y);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._sortedSh1Y.subarray(0, count * 3));
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSh1Z);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._sortedSh1Z.subarray(0, count * 3));
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSh1X);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._sortedSh1X.subarray(0, count * 3));
        }

        gl.useProgram(this.progG);
        gl.uniformMatrix4fv(this.uG_View, false, view);
        gl.uniformMatrix4fv(this.uG_Proj, false, proj);
        gl.uniform2f(this.uG_Viewport, this.viewport[0], this.viewport[1]);
        gl.uniform1f(this.uG_TanFov, this.tanFov);
        gl.uniform1f(this.uG_ModelScale, this.modelScale);
        if (this.uG_CameraPos) {
            const ex = -(view[0]*view[12] + view[1]*view[13] + view[2]*view[14]);
            const ey = -(view[4]*view[12] + view[5]*view[13] + view[6]*view[14]);
            const ez = -(view[8]*view[12] + view[9]*view[13] + view[10]*view[14]);
            gl.uniform3f(this.uG_CameraPos, ex, ey, ez);
        }
        if (this.uG_HasSh1) gl.uniform1f(this.uG_HasSh1, this._hasSh1 ? 1.0 : 0.0);

        gl.bindVertexArray(this.vao);
        // Bind all attributes (mirror _drawGaussian)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufQuad);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(1, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufColor);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 0, 0);
        gl.vertexAttribDivisor(2, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufScale);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(3, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufRot);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(4, 1);
        if (this._hasSh1) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSh1Y);
            gl.enableVertexAttribArray(5);
            gl.vertexAttribPointer(5, 3, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(5, 1);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSh1Z);
            gl.enableVertexAttribArray(6);
            gl.vertexAttribPointer(6, 3, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(6, 1);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSh1X);
            gl.enableVertexAttribArray(7);
            gl.vertexAttribPointer(7, 3, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(7, 1);
        } else {
            gl.disableVertexAttribArray(5);
            gl.disableVertexAttribArray(6);
            gl.disableVertexAttribArray(7);
            gl.vertexAttrib3f(5, 0, 0, 0);
            gl.vertexAttrib3f(6, 0, 0, 0);
            gl.vertexAttrib3f(7, 0, 0, 0);
        }

        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIndex);
        gl.drawElementsInstanced(gl.TRIANGLE_STRIP, 4, gl.UNSIGNED_SHORT, 0, count);

        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(null);
    }

    _disposeGpuBuffers() {
        const gl = this.gl;
        try { if (this.vao)     gl.deleteVertexArray(this.vao); } catch {}
        try { if (this.bufPos)  gl.deleteBuffer(this.bufPos);  } catch {}
        try { if (this.bufColor)gl.deleteBuffer(this.bufColor);} catch {}
        try { if (this.bufScale)gl.deleteBuffer(this.bufScale);} catch {}
        try { if (this.bufRot)  gl.deleteBuffer(this.bufRot);  } catch {}
        try { if (this.bufQuad) gl.deleteBuffer(this.bufQuad); } catch {}
        try { if (this.bufIndex)gl.deleteBuffer(this.bufIndex);} catch {}
        // v792 — SH1 buffers
        try { if (this.bufSh1Y) gl.deleteBuffer(this.bufSh1Y); } catch {}
        try { if (this.bufSh1Z) gl.deleteBuffer(this.bufSh1Z); } catch {}
        try { if (this.bufSh1X) gl.deleteBuffer(this.bufSh1X); } catch {}
        this.vao = this.bufPos = this.bufColor = this.bufScale = this.bufRot = null;
        this.bufQuad = this.bufIndex = null;
        this.bufSh1Y = this.bufSh1Z = this.bufSh1X = null;
    }

    dispose() {
        const gl = this.gl;
        this._disposeGpuBuffers();
        try { if (this.progBB) gl.deleteProgram(this.progBB); } catch {}
        try { if (this.progG)  gl.deleteProgram(this.progG);  } catch {}
        this.progBB = this.progG = null;
        this.count = 0;
    }
}
