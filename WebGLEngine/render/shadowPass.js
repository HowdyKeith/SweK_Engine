// FILE: render/shadowPass.js
// VERSION: v1 - directional sun shadow map (round 43k)
//
// Renders an orthographic depth-only pass from the sun's perspective
// into a 2048x2048 depth texture. The main voxel FS samples this map
// to determine which fragments are occluded from direct sun.
//
// Pipeline:
//   1) buildLightMatrix(camera, sunDir) → ortho view+proj covering an
//      area around the camera in world space. Camera-centered so the
//      shadow stays where the player is looking.
//   2) bind() → set FBO + viewport, clear depth, enable depth write,
//      DISABLE color write, return.
//   3) Caller renders all shadow-casting geometry with the shadow
//      view-proj matrix. (Voxel terrain currently; entities could be
//      added later.)
//   4) unbind() → restore default framebuffer + color writes.
//
// The depth texture is exposed via getDepthTexture() so the main
// renderer can bind it as sampler2DShadow / sampler2D in its FS.

export class ShadowPass {

    constructor(gl, size = 2048) {
        this.gl = gl;
        this.size = size;

        // Light view-projection. World->[-1,1]^3 (clip space).
        this.lightVP = new Float32Array(16);
        this.enabled = true;
        // Range of the orthographic frustum, world-space. Half-extents.
        this.halfExtentXY = 90;     // covers ~180m around the camera
        this.halfExtentZ  = 150;    // depth along light direction

        // ---- FBO + depth texture --------------------------------------
        this.fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);

        this.depthTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.depthTex);
        gl.texImage2D(
            gl.TEXTURE_2D, 0,
            gl.DEPTH_COMPONENT24,
            size, size, 0,
            gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        // Clamp + light grey "no-shadow" past edge — fragments outside
        // the light frustum get treated as fully lit.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.DEPTH_ATTACHMENT,
            gl.TEXTURE_2D,
            this.depthTex,
            0
        );
        // No color buffer — depth-only pass
        gl.drawBuffers([gl.NONE]);
        gl.readBuffer(gl.NONE);

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.error(`[ShadowPass] FBO incomplete: 0x${status.toString(16)}`);
            this.enabled = false;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        console.log(`[ShadowPass] v1 ready (${size}x${size} depth)`);
    }

    // Build a camera-centered orthographic light-view-projection matrix.
    // The sun direction points FROM ground TO sun (so light flows in
    // -sunDir direction). The light is placed far away along +sunDir.
    //
    // The frustum is an axis-aligned box in light space. We orient it
    // so the light's view direction is -sunDir, with a stable up axis.
    buildLightMatrix(camera, sunDir) {
        // Normalize sun direction
        const sx = sunDir[0], sy = sunDir[1], sz = sunDir[2];
        const sLen = Math.hypot(sx, sy, sz) || 1;
        const dx = sx / sLen, dy = sy / sLen, dz = sz / sLen;

        // Light is "looking" in -d direction (light points down toward
        // ground from above). Eye is far along +d from a focus point.
        // Focus point: snap to camera position, projected onto an X-Z
        // grid for stability (reduces shimmer when camera moves).
        const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
        const focusX = Math.floor(cx);     // simple snap; full texel-snap is more involved
        const focusY = cy;
        const focusZ = Math.floor(cz);

        const distBack = this.halfExtentZ;
        const eyeX = focusX + dx * distBack;
        const eyeY = focusY + dy * distBack;
        const eyeZ = focusZ + dz * distBack;

        // Right vector. Use world up (+Y) unless sun is nearly vertical;
        // in that case fall back to world +Z as the assist axis.
        let ux = 0, uy = 1, uz = 0;
        if (Math.abs(dy) > 0.98) { ux = 0; uy = 0; uz = 1; }
        // right = (-d) × up — that's the light's right axis
        // Actually we want: view forward = -d, so right = forward × up = (-d) × up
        let rx = -dy * uz - (-dz) * uy;
        let ry = -dz * ux - (-dx) * uz;
        let rz = -dx * uy - (-dy) * ux;
        const rLen = Math.hypot(rx, ry, rz) || 1;
        rx /= rLen; ry /= rLen; rz /= rLen;

        // Recompute up to be orthogonal: up' = right × forward = right × (-d)
        const upX = ry * (-dz) - rz * (-dy);
        const upY = rz * (-dx) - rx * (-dz);
        const upZ = rx * (-dy) - ry * (-dx);

        // Light view matrix (column-major). Looking from eye in -d direction.
        // row 0: right
        // row 1: up
        // row 2: +d (negated forward, since forward is -d, so -forward = d)
        const v00 = rx,  v01 = upX, v02 = dx;
        const v10 = ry,  v11 = upY, v12 = dy;
        const v20 = rz,  v21 = upZ, v22 = dz;
        const v30 = -(rx * eyeX + ry * eyeY + rz * eyeZ);
        const v31 = -(upX * eyeX + upY * eyeY + upZ * eyeZ);
        const v32 = -(dx * eyeX + dy * eyeY + dz * eyeZ);

        // Orthographic projection, column-major. left=-h, right=+h,
        // bottom=-h, top=+h, near=0, far=2*distBack.
        const h = this.halfExtentXY;
        const near = 0;
        const far = distBack * 2;
        const p00 = 1 / h;
        const p11 = 1 / h;
        const p22 = -2 / (far - near);
        const p32 = -(far + near) / (far - near);

        // out = P * V (column-major)
        const o = this.lightVP;
        o[0]  = p00 * v00;
        o[1]  = p11 * v01;
        o[2]  = p22 * v02;
        o[3]  = 0;
        o[4]  = p00 * v10;
        o[5]  = p11 * v11;
        o[6]  = p22 * v12;
        o[7]  = 0;
        o[8]  = p00 * v20;
        o[9]  = p11 * v21;
        o[10] = p22 * v22;
        o[11] = 0;
        o[12] = p00 * v30;
        o[13] = p11 * v31;
        o[14] = p22 * v32 + p32;
        o[15] = 1;

        return this.lightVP;
    }

    bind() {
        if (!this.enabled) return false;
        const gl = this.gl;
        // v648 — feedback-loop guard. The depthTex this FBO writes to is
        // also bound to TEXTURE3 by voxelrenderer for shadow sampling in
        // the main pass. The binding persists across frames, so when the
        // next frame's shadow pass starts the FBO target and a sampler
        // unit both reference depthTex — any drawArraysInstanced inside
        // this pass then triggers "Feedback loop formed between
        // Framebuffer and active Texture" (which was firing ~200x/frame
        // in the kaiju demo). Explicitly unbind unit 3 before we attach
        // the FBO. Also clear 6+7 because the previous frame may have
        // bound cascade 1/2 there if CSM ran instead of single-shadow.
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.viewport(0, 0, this.size, this.size);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.colorMask(false, false, false, false);
        // Polygon offset reduces "shadow acne" by pushing depth slightly
        // away from the surface during the depth pass.
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(1.5, 4.0);
        return true;
    }

    unbind() {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.colorMask(true, true, true, true);
        gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    getDepthTexture() { return this.depthTex; }
    getLightVP()      { return this.lightVP; }
}
