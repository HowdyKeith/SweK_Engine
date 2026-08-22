// FILE: render/CascadedShadowPass.js
// VERSION: v1 — round 298
//
// Cascaded Shadow Maps (CSM). Splits the view frustum into N slices and
// renders a per-slice depth map at a tight orthographic frustum sized to
// the slice's world-space extent. Result: near geometry gets close-to-
// the-pixel shadow detail, far geometry gets shadows at lower effective
// resolution but they're still cast. The single-shadow-map version had
// to pick one extent (~90m half-XY) which is either too coarse close-up
// (visible blockiness) or too narrow far away (popping cutoff edge).
//
// Algorithm:
//   1. Compute split distances along view Z. Practical CSM uses a blend
//      of linear and logarithmic splits — log handles huge depth ranges
//      gracefully but bunches close-cascade extents too tight; linear is
//      uniform but wastes near-cascade resolution. The "practical" blend
//      from Zhang et al. (2006) with λ=0.5 is the industry default.
//   2. For each slice, find the world-space frustum corners (8 verts of
//      the truncated view pyramid). Transform into light view space.
//      The axis-aligned bounding box of those 8 points in light space
//      gives the tight orthographic extent.
//   3. Snap the AABB to texel size to eliminate shimmer when the camera
//      moves.
//   4. Build VP for the cascade.
//
// Public API mirrors ShadowPass for one-cascade callers, with cascade
// index added:
//   buildLightMatrices(camera, sunDir, viewProj)
//   bind(cascadeIdx) / unbind()
//   getDepthTexture(cascadeIdx)
//   getLightVP(cascadeIdx)
//   splitDistances → Float32Array(N) of cascade end distances in view Z
//
// Integration: see docs/csm-integration-r298.md for the shader sketch.

export class CascadedShadowPass {
    constructor(gl, opts = {}) {
        this.gl = gl;
        this.numCascades = opts.numCascades ?? 3;
        this.size = opts.size ?? 1024;            // per-cascade resolution
        this.lambda = opts.lambda ?? 0.5;          // 0=linear, 1=log split
        this.nearPlane = opts.nearPlane ?? 0.1;
        this.farPlane  = opts.farPlane  ?? 300;    // max shadow distance
        this.enabled = true;

        // Per-cascade state
        this.fbos = new Array(this.numCascades);
        this.depthTextures = new Array(this.numCascades);
        this.lightVPs = new Array(this.numCascades);    // Float32Array(16) each
        this.splitDistances = new Float32Array(this.numCascades);
        this.splitDistancesView = new Float32Array(this.numCascades); // for FS uniform

        for (let i = 0; i < this.numCascades; i++) {
            this.lightVPs[i] = new Float32Array(16);
            // FBO + depth texture per cascade
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24,
                this.size, this.size, 0,
                gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,
                gl.TEXTURE_2D, tex, 0);
            gl.drawBuffers([gl.NONE]);
            gl.readBuffer(gl.NONE);
            const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (status !== gl.FRAMEBUFFER_COMPLETE) {
                console.error(`[CSM] cascade ${i} FBO incomplete: 0x${status.toString(16)}`);
                this.enabled = false;
            }
            this.fbos[i] = fbo;
            this.depthTextures[i] = tex;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // Compute initial splits — these only change if farPlane changes
        this._computeSplits();
        console.log(`[CSM] v1 ready — ${this.numCascades} cascades × ${this.size}² @ λ=${this.lambda}`);
    }

    // Practical split scheme: blend linear + logarithmic.
    // sLinear(i) = near + (far - near) * i / N
    // sLog(i)    = near * (far / near)^(i / N)
    // s(i)       = λ * sLog(i) + (1-λ) * sLinear(i)
    _computeSplits() {
        const N = this.numCascades;
        const n = this.nearPlane, f = this.farPlane;
        const ratio = f / n;
        for (let i = 1; i <= N; i++) {
            const t = i / N;
            const sLin = n + (f - n) * t;
            const sLog = n * Math.pow(ratio, t);
            this.splitDistances[i - 1] = this.lambda * sLog + (1 - this.lambda) * sLin;
            this.splitDistancesView[i - 1] = this.splitDistances[i - 1];
        }
    }

    // Build per-cascade light VP matrices given the current camera +
    // sun direction. Snaps to texel size for stability.
    //
    // camera: { position: {x,y,z}, forward: {x,y,z}, up: {x,y,z}, right: {x,y,z}, fovY, aspect }
    // sunDir: world-space DIRECTION TO SUN (will be normalized)
    buildLightMatrices(camera, sunDir) {
        const N = this.numCascades;
        for (let i = 0; i < N; i++) {
            const near = i === 0 ? this.nearPlane : this.splitDistances[i - 1];
            const far  = this.splitDistances[i];
            this._buildCascade(i, camera, sunDir, near, far);
        }
    }

    // Build VP for one cascade.
    _buildCascade(idx, camera, sunDir, near, far) {
        // 1. World-space frustum corners of this slice
        const corners = _frustumCorners(camera, near, far, _CORNERS_SCRATCH);

        // 2. Sun direction (DIR TO sun) → light view direction is -sunDir
        let sx = sunDir[0], sy = sunDir[1], sz = sunDir[2];
        const sLen = Math.hypot(sx, sy, sz) || 1;
        sx /= sLen; sy /= sLen; sz /= sLen;

        // 3. Light view matrix. Eye is the centroid of corners offset
        //    along +sunDir; look-at is the centroid.
        let cxSum = 0, cySum = 0, czSum = 0;
        for (let c = 0; c < 8; c++) {
            cxSum += corners[c * 3 + 0];
            cySum += corners[c * 3 + 1];
            czSum += corners[c * 3 + 2];
        }
        const centerX = cxSum / 8, centerY = cySum / 8, centerZ = czSum / 8;

        // Choose an up vector — avoid degeneracy when sun is straight up/down
        let ux = 0, uy = 1, uz = 0;
        if (Math.abs(sy) > 0.98) { ux = 0; uy = 0; uz = 1; }

        // right = (-sunDir) × up,  up' = right × (-sunDir)
        const fwdX = -sx, fwdY = -sy, fwdZ = -sz;   // light's forward = into the scene
        let rx = fwdY * uz - fwdZ * uy;
        let ry = fwdZ * ux - fwdX * uz;
        let rz = fwdX * uy - fwdY * ux;
        const rLen = Math.hypot(rx, ry, rz) || 1;
        rx /= rLen; ry /= rLen; rz /= rLen;
        const upX = ry * fwdZ - rz * fwdY;
        const upY = rz * fwdX - rx * fwdZ;
        const upZ = rx * fwdY - ry * fwdX;

        // 4. Transform corners into light view space; find AABB
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let c = 0; c < 8; c++) {
            const wx = corners[c*3+0] - centerX;
            const wy = corners[c*3+1] - centerY;
            const wz = corners[c*3+2] - centerZ;
            const lx = rx*wx + ry*wy + rz*wz;
            const ly = upX*wx + upY*wy + upZ*wz;
            const lz = fwdX*wx + fwdY*wy + fwdZ*wz;
            if (lx < minX) minX = lx; if (lx > maxX) maxX = lx;
            if (ly < minY) minY = ly; if (ly > maxY) maxY = ly;
            if (lz < minZ) minZ = lz; if (lz > maxZ) maxZ = lz;
        }

        // 5. Texel-snap the AABB to reduce shimmer. The "world unit per
        //    shadow-map texel" is (maxX-minX)/size. Snap min to a grid
        //    of that size.
        const worldPerTexelX = (maxX - minX) / this.size;
        const worldPerTexelY = (maxY - minY) / this.size;
        if (worldPerTexelX > 0 && worldPerTexelY > 0) {
            minX = Math.floor(minX / worldPerTexelX) * worldPerTexelX;
            maxX = Math.ceil(maxX / worldPerTexelX) * worldPerTexelX;
            minY = Math.floor(minY / worldPerTexelY) * worldPerTexelY;
            maxY = Math.ceil(maxY / worldPerTexelY) * worldPerTexelY;
        }

        // 6. Z range — pull the near plane further back to capture
        //    objects behind the frustum that can still cast shadows
        //    INTO the frustum. Industry: extend by ~50m.
        const Z_PADDING = 50;
        minZ -= Z_PADDING;
        maxZ += Z_PADDING;

        // 7. Build light view (column-major). Eye = centerX/Y/Z (in
        //    world); we already moved corners relative to it above.
        //    For the GPU we want full WORLD→LIGHT-CLIP, so view matrix
        //    is the rotation+translation back to eye.
        const v = _VIEW_SCRATCH;
        v[0]  = rx;   v[1]  = upX;  v[2]  = fwdX; v[3]  = 0;
        v[4]  = ry;   v[5]  = upY;  v[6]  = fwdY; v[7]  = 0;
        v[8]  = rz;   v[9]  = upZ;  v[10] = fwdZ; v[11] = 0;
        v[12] = -(rx*centerX + ry*centerY + rz*centerZ);
        v[13] = -(upX*centerX + upY*centerY + upZ*centerZ);
        v[14] = -(fwdX*centerX + fwdY*centerY + fwdZ*centerZ);
        v[15] = 1;

        // 8. Ortho projection (column-major). Maps [minX..maxX] → [-1..1] etc.
        const w = maxX - minX, h = maxY - minY, d = maxZ - minZ;
        if (w <= 0 || h <= 0 || d <= 0) return;
        const p = _PROJ_SCRATCH;
        p[0]  = 2 / w;       p[1] = 0;            p[2] = 0;             p[3] = 0;
        p[4]  = 0;           p[5] = 2 / h;        p[6] = 0;             p[7] = 0;
        p[8]  = 0;           p[9] = 0;            p[10] = -2 / d;       p[11] = 0;
        p[12] = -(maxX+minX)/w; p[13] = -(maxY+minY)/h; p[14] = -(maxZ+minZ)/d; p[15] = 1;

        // 9. vp = p * v
        const out = this.lightVPs[idx];
        _mat4Mul(p, v, out);
    }

    bind(cascadeIdx) {
        if (!this.enabled || cascadeIdx < 0 || cascadeIdx >= this.numCascades) return false;
        const gl = this.gl;
        // v648 — feedback-loop guard (same fix as ShadowPass). The cascade
        // depth textures are bound to TEXTURE3/6/7 by voxelrenderer during
        // the main pass. When the next frame's shadow pass attaches one of
        // them as a depth target, the prior-frame sampler binding is still
        // active and any draw inside this pass triggers a feedback-loop
        // INVALID_OPERATION. Unbind all three before attaching the FBO.
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[cascadeIdx]);
        gl.viewport(0, 0, this.size, this.size);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.colorMask(false, false, false, false);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        // Use larger offset for far cascades (worse depth precision)
        const offsetFactor = 1.5 + cascadeIdx * 0.5;
        gl.polygonOffset(offsetFactor, 4.0);
        return true;
    }

    unbind() {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.colorMask(true, true, true, true);
        gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    getDepthTexture(idx) { return this.depthTextures[idx]; }
    getLightVP(idx)      { return this.lightVPs[idx]; }
    getSplitDistances()  { return this.splitDistancesView; }
    getNumCascades()     { return this.numCascades; }

    // For shader: pack split distances into a vec4 (supports up to 4 cascades)
    getSplitDistancesVec4() {
        const v = [0, 0, 0, 0];
        for (let i = 0; i < Math.min(4, this.numCascades); i++) {
            v[i] = this.splitDistances[i];
        }
        return v;
    }
}

// =============================================================================
// Math helpers
// =============================================================================

// Module-scope scratch — buildLightMatrices is called once per frame and
// reuses these for all N cascades. Safe because each cascade fully
// consumes the scratch before the next iteration starts.
const _CORNERS_SCRATCH = new Float32Array(8 * 3);   // 8 corners × xyz
const _VIEW_SCRATCH    = new Float32Array(16);
const _PROJ_SCRATCH    = new Float32Array(16);
const _CSM_TMP_MAT4    = new Float32Array(16);

// Compute 8 world-space corners of the view frustum slice from `near` to
// `far` planes along the camera forward axis. Writes 24 floats into out.
// Layout per corner: [near-bottom-left, near-bottom-right, near-top-right,
// near-top-left, far-bottom-left, far-bottom-right, far-top-right,
// far-top-left]. Camera needs .position, .forward, .up, .right, .fovY,
// .aspect — but we accept either explicit basis vectors or compute from
// (forward,worldUp) if not provided.
function _frustumCorners(camera, near, far, out) {
    const pos = camera.position;
    let fx, fy, fz, ux, uy, uz, rx, ry, rz;
    // Camera basis: explicit if provided, else derive from forward + worldUp
    if (camera.forward && camera.up && camera.right) {
        fx = camera.forward.x; fy = camera.forward.y; fz = camera.forward.z;
        ux = camera.up.x;      uy = camera.up.y;      uz = camera.up.z;
        rx = camera.right.x;   ry = camera.right.y;   rz = camera.right.z;
    } else if (camera.forward) {
        fx = camera.forward.x; fy = camera.forward.y; fz = camera.forward.z;
        const fLen = Math.hypot(fx, fy, fz) || 1;
        fx /= fLen; fy /= fLen; fz /= fLen;
        // right = forward × worldUp(+Y)
        rx = fy * 0 - fz * 1;  // 0,1,0 cross
        ry = fz * 0 - fx * 0;
        rz = fx * 1 - fy * 0;
        const rLen = Math.hypot(rx, ry, rz) || 1;
        rx /= rLen; ry /= rLen; rz /= rLen;
        // up = right × forward
        ux = ry * fz - rz * fy;
        uy = rz * fx - rx * fz;
        uz = rx * fy - ry * fx;
    } else {
        // Fallback: look down -Z
        fx = 0; fy = 0; fz = -1;
        ux = 0; uy = 1; uz = 0;
        rx = 1; ry = 0; rz = 0;
    }
    const fovY = camera.fovY ?? (Math.PI / 4);
    const aspect = camera.aspect ?? (16 / 9);
    const tanHalf = Math.tan(fovY / 2);

    // For each plane (near/far): center = pos + forward*dist
    //                            half_h = tanHalf * dist
    //                            half_w = half_h * aspect
    // 4 corners around the center using up + right.
    function emit(o, dist, idxBase) {
        const cx = pos.x + fx * dist;
        const cy = pos.y + fy * dist;
        const cz = pos.z + fz * dist;
        const hh = tanHalf * dist;
        const hw = hh * aspect;
        // bottom-left: c - up*hh - right*hw
        o[idxBase + 0 ] = cx - ux*hh - rx*hw;
        o[idxBase + 1 ] = cy - uy*hh - ry*hw;
        o[idxBase + 2 ] = cz - uz*hh - rz*hw;
        // bottom-right
        o[idxBase + 3 ] = cx - ux*hh + rx*hw;
        o[idxBase + 4 ] = cy - uy*hh + ry*hw;
        o[idxBase + 5 ] = cz - uz*hh + rz*hw;
        // top-right
        o[idxBase + 6 ] = cx + ux*hh + rx*hw;
        o[idxBase + 7 ] = cy + uy*hh + ry*hw;
        o[idxBase + 8 ] = cz + uz*hh + rz*hw;
        // top-left
        o[idxBase + 9 ] = cx + ux*hh - rx*hw;
        o[idxBase + 10] = cy + uy*hh - ry*hw;
        o[idxBase + 11] = cz + uz*hh - rz*hw;
    }
    emit(out, near, 0);
    emit(out, far,  12);
    return out;
}

// out = a * b   (column-major 4x4)
function _mat4Mul(a, b, out) {
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            let s = 0;
            for (let k = 0; k < 4; k++) s += a[r + k*4] * b[k + c*4];
            out[r + c*4] = s;
        }
    }
}

export function makeCascadedShadowPass(gl, opts) {
    return new CascadedShadowPass(gl, opts);
}
