// render/voxelRaymarchPass.js
//
// GPU ray-march render pass (v2783). Draws a fullscreen triangle running the gated DDA fragment shader
// (render/voxelRaymarchShader.js) against a 3D-texture voxel volume -- an alternative to the rasterized mesh
// path. Reusable unit: the standalone demo (raymarch-gl-demo.html) drives it, and main.js can instantiate it
// behind ?raymarch=1. Stub-safe: constructing against glBootstrap's no-op stub (when WebGL2 is unavailable) does
// not throw -- it just no-ops, like every other renderer. Browser-safe (imports only the shader strings).

import { VERT_SRC, FRAG_SRC, FRAG_SRC_UI, FRAG_SRC_BRICK, FRAG_SRC_DEPTH } from "./voxelRaymarchShader.js";

export class VoxelRaymarchPass {
    // opts.uint (v3041, DEFAULT OFF) -- upload the volume as R8UI and read it in the shader with usampler3D, so
    // the material id is the byte itself rather than a float reconstruction. Same DDA, same palette, same output;
    // this is a substitution behind a flag, and the unorm path stays exactly as it was.
    constructor(gl, opts = {}) {
        this.gl = gl;
        this.dead = false;
        this.error = null;
        this.tex = null;
        this.dims = [0, 0, 0];
        this.uint = !!opts.uint;
        this._u = {};
        try {
            // v3061 -- opts.brick implies uint: the brick variant is built FROM the uint one, and an R8 volume
            // with an R8UI brick map would be two formats for one idea.
            this.brick = !!opts.brick;
            // v3064 -- opts.depth implies brick implies uint. The depth variant is built FROM the brick one, so
            // asking for compositing without the skip would mean maintaining a fourth shader for no reason.
            this.depth = !!opts.depth;
            if (this.depth) this.brick = true;
            if (this.brick && !this.uint) this.uint = true;
            this.near = opts.near || 0.1;
            this.far = opts.far || 200;
            this.brickTex = null; this.brickShift = 3;
            this.prog = this._link(VERT_SRC, this.depth ? FRAG_SRC_DEPTH : (this.brick ? FRAG_SRC_BRICK : (this.uint ? FRAG_SRC_UI : FRAG_SRC)));
            this.vao = gl.createVertexArray();     // empty VAO; the vertex shader builds the triangle from gl_VertexID
        } catch (e) {
            this.dead = true;
            // v3047 -- KEEP THE REASON. This was console.warn only, so a caller could see dead:true and had no way
            // to say WHY. raymarch-live.html then drew nothing and reported nothing, which is the black-screen-
            // without-a-reason failure v2778 wrote showGLUnavailable to end. A shader info log is the whole
            // diagnosis; discarding it to the console means the page cannot repeat it.
            this.error = String((e && e.message) || e);
            try { console.warn("[raymarch] pass disabled:", this.error); } catch {}
        }
    }

    _link(vsSrc, fsSrc) {
        const gl = this.gl;
        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader compile failed");
            return s;
        };
        const p = gl.createProgram();
        gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "program link failed");
        return p;
    }

    // data = Uint8Array(dx*dy*dz) of material ids (0 = air). Stored as an R8 3D texture the shader texelFetches.
    uploadVolume(data, dx, dy, dz) {
        if (this.dead) return;
        const gl = this.gl;
        this.dims = [dx, dy, dz];
        if (!this.tex) this.tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_3D, this.tex);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        // NEAREST above is mandatory in uint mode, not a preference: an integer texture with a LINEAR filter is
        // incomplete and samples as zero. That constraint is the right one for a DDA anyway -- a filtered
        // boundary sample is neither solid nor empty, and traversal must not depend on sampler state.
        if (this.uint) gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8UI, dx, dy, dz, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, data);
        else           gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8,   dx, dy, dz, 0, gl.RED,         gl.UNSIGNED_BYTE, data);
    }

    /**
     * Upload the coarse occupancy map (v3061). data is rleBrickMap's byte-per-brick array, 1 = holds any solid.
     * brick must be a power of two, because the shader indexes with `p >> uBrickShift` -- refused, not rounded.
     * THE MAP MUST HAVE BEEN VERIFIED ON THE CPU FIRST (verifyBrickMap): a brick wrongly marked EMPTY makes the
     * shader skip a solid voxel and a ray passes through a wall, silently. This cannot check that.
     */
    uploadBrick(data, bx, by, bz, brick) {
        if (this.dead || !this.brick) return { ok: false, reason: this.brick ? "pass is dead" : "this pass was not built with { brick: true }" };
        const shift = Math.log2(brick);
        if (!Number.isInteger(shift)) return { ok: false, reason: "brick size " + brick + " is not a power of two; the shader indexes with a bit shift" };
        this.brickShift = shift;
        const gl = this.gl;
        if (!this.brickTex) this.brickTex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_3D, this.brickTex);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8UI, bx, by, bz, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, data);
        return { ok: true, reason: null };
    }

    // cam: { eye, fwd, right, up, tanFov } (arrays + scalar). Draws over the current framebuffer viewport.
    render(cam, resW, resH) {
        if (this.dead || !this.tex) return;
        const gl = this.gl;
        gl.useProgram(this.prog);
        gl.bindVertexArray(this.vao);
        const u = (n) => (this._u[n] !== undefined ? this._u[n] : (this._u[n] = gl.getUniformLocation(this.prog, n)));
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_3D, this.tex);
        gl.uniform1i(u("uVolume"), 0);
        // v3061 -- the brick map rides texture unit 1. Bound every frame beside the volume so a caller cannot
        // leave the shader sampling whatever the last pass left on unit 1, which would read as random occupancy
        // and skip real geometry.
        if (this.depth) {
            // The marcher now participates in the depth buffer, so it must TEST and WRITE like everything else.
            // Leaving these to whatever the last pass set is how a composite silently becomes an overlay.
            gl.enable(gl.DEPTH_TEST);
            gl.depthMask(true);
            gl.uniform1f(u("uNear"), this.near);
            gl.uniform1f(u("uFar"), this.far);
        }
        if (this.brick && this.brickTex) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_3D, this.brickTex);
            gl.uniform1i(u("uBricks"), 1);
            gl.uniform1i(u("uBrickShift"), this.brickShift);
            gl.activeTexture(gl.TEXTURE0);
        }
        gl.uniform3i(u("uDims"), this.dims[0], this.dims[1], this.dims[2]);
        gl.uniform3f(u("uEye"), cam.eye[0], cam.eye[1], cam.eye[2]);
        gl.uniform3f(u("uFwd"), cam.fwd[0], cam.fwd[1], cam.fwd[2]);
        gl.uniform3f(u("uRight"), cam.right[0], cam.right[1], cam.right[2]);
        gl.uniform3f(u("uUp"), cam.up[0], cam.up[1], cam.up[2]);
        gl.uniform1f(u("uTanFov"), cam.tanFov);
        gl.uniform1f(u("uAspect"), resW / resH);
        gl.uniform2f(u("uRes"), resW, resH);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    dispose() {
        if (this.dead) return;
        const gl = this.gl;
        try { if (this.tex) gl.deleteTexture(this.tex); } catch {}
        try { if (this.vao) gl.deleteVertexArray(this.vao); } catch {}
        try { if (this.prog) gl.deleteProgram(this.prog); } catch {}
    }
}
