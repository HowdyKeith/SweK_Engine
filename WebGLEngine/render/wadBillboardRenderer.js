// FILE: render/wadBillboardRenderer.js
// VERSION: v1 — round 419
//
// Draws the camera-facing Doom sprite quads that BillboardManager
// (tools/wadBillboards.js) produces via prepareFrame(camera). That
// module builds the geometry + sorts far-to-near but explicitly leaves
// the actual GL draw to the engine — this is that draw pass.
//
//   * Alpha-TESTED, not blended: Doom sprites are 1-bit cutouts, so we
//     `discard` transparent texels and write depth like opaque geometry.
//     That means no blending artifacts and no dependence on the sort.
//   * Own shader + a single reused dynamic VBO (one quad uploaded at a
//     time) + a static [0,1,2,0,2,3] index buffer. No shared state with
//     the voxel renderer beyond reading its fog each frame.
//   * GL textures are created lazily from each frame's RGBA pixels and
//     cached by "NAME+FRAME+ROT", so a frame uploads once, not per draw.
//   * NEAREST filtering keeps the pixel-art crisp.
//
// Additive + opt-in: no-op until window._wadBillboards exists (set when a
// WAD is voxelized in Doom mode) or wadSprites.test() seeds a demo.

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
uniform mat4 uViewProj;
out vec2 vUV;
out vec3 vWorld;
void main() {
    vUV = aUV;
    vWorld = aPos;
    gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec3 vWorld;
out vec4 oColor;

uniform sampler2D uTex;
uniform vec3  uCamPos;
uniform vec3  uFogColor;
uniform float uFogNear;
uniform float uFogFar;

void main() {
    vec4 t = texture(uTex, vUV);
    if (t.a < 0.5) discard;          // Doom 1-bit sprite cutout
    float dist = length(vWorld - uCamPos);
    float fog = clamp((dist - uFogNear) / max(1.0, uFogFar - uFogNear), 0.0, 1.0);
    oColor = vec4(mix(t.rgb, uFogColor, fog), 1.0);
}`;

export class WadBillboardRenderer {
    constructor(gl, opts = {}) {
        this.gl = gl;
        this.enabled = opts.enabled ?? true;
        this._lastCount = 0;
        this._texCache  = new Map();   // "NAMEFRAMEROT" → WebGLTexture
        this._program = this._link(gl, VS, FS);
        this._u = {
            viewProj: gl.getUniformLocation(this._program, "uViewProj"),
            tex:      gl.getUniformLocation(this._program, "uTex"),
            camPos:   gl.getUniformLocation(this._program, "uCamPos"),
            fogColor: gl.getUniformLocation(this._program, "uFogColor"),
            fogNear:  gl.getUniformLocation(this._program, "uFogNear"),
            fogFar:   gl.getUniformLocation(this._program, "uFogFar"),
        };

        // One reusable VAO: interleaved (x,y,z,u,v) dynamic VBO + static
        // two-triangle index buffer. Each quad bufferSubData's its 20
        // floats then draws 6 indices.
        this._vao = gl.createVertexArray();
        gl.bindVertexArray(this._vao);
        this._vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
        gl.bufferData(gl.ARRAY_BUFFER, 20 * 4, gl.DYNAMIC_DRAW);     // 4 verts × 5 floats
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);        // aPos  (stride 5 floats = 20 bytes)
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);       // aUV   (offset 3 floats = 12 bytes)
        this._ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
        gl.bindVertexArray(null);

        console.log("[WadBillboards] renderer ready — draws window._wadBillboards · wadSprites.test()");
    }

    _compile(gl, type, src) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
            console.error("[WadBillboards] shader:", gl.getShaderInfoLog(sh));
        return sh;
    }
    _link(gl, vs, fs) {
        const p = gl.createProgram();
        gl.attachShader(p, this._compile(gl, gl.VERTEX_SHADER, vs));
        gl.attachShader(p, this._compile(gl, gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS))
            console.error("[WadBillboards] link:", gl.getProgramInfoLog(p));
        return p;
    }

    // Lazily build + cache a GL texture from a decoded frame
    // ({ width, height, rgba }). Pixel-art look: NEAREST, CLAMP.
    _getTexture(key, frame) {
        let tex = this._texCache.get(key);
        if (tex) return tex;
        const gl = this.gl;
        if (!frame || !frame.rgba || !frame.width || !frame.height) return null;
        tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, frame.width, frame.height, 0,
            gl.RGBA, gl.UNSIGNED_BYTE,
            frame.rgba instanceof Uint8Array ? frame.rgba : new Uint8Array(frame.rgba));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.bindTexture(gl.TEXTURE_2D, null);
        this._texCache.set(key, tex);
        return tex;
    }

    /** Drop cached textures (e.g. when a new WAD is loaded). */
    clearTextureCache() {
        const gl = this.gl;
        for (const tex of this._texCache.values()) { try { gl.deleteTexture(tex); } catch {} }
        this._texCache.clear();
    }

    /**
     * Draw every camera-facing quad the BillboardManager produces this
     * frame. `bm` is a BillboardManager; env carries the terrain fog so
     * sprites fade into the horizon consistently.
     */
    render(bm, camera, env = {}) {
        if (!this.enabled || !bm || !camera) { this._lastCount = 0; return; }
        const mvp = camera.getViewProjMatrix?.();
        if (!mvp) return;
        const quads = bm.prepareFrame(camera);
        if (!quads || quads.length === 0) { this._lastCount = 0; return; }

        const gl = this.gl;
        const cp = camera.position || { x: 0, y: 0, z: 0 };

        gl.useProgram(this._program);
        gl.uniformMatrix4fv(this._u.viewProj, false, mvp);
        gl.uniform1i(this._u.tex, 0);
        gl.uniform3f(this._u.camPos, cp.x, cp.y, cp.z);
        gl.uniform3fv(this._u.fogColor, env.fogColor || [0.78, 0.65, 0.55]);
        gl.uniform1f(this._u.fogNear, env.fogNear ?? 60.0);
        gl.uniform1f(this._u.fogFar,  env.fogFar  ?? 220.0);

        // Alpha-tested opaque: depth test + write on, cull off (quads are
        // single-sided but always camera-facing), no blending.
        const cullWas = gl.isEnabled(gl.CULL_FACE);
        if (cullWas) gl.disable(gl.CULL_FACE);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindVertexArray(this._vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);

        let drawn = 0;
        for (const q of quads) {
            const tex = this._getTexture(`${q.name}${q.frame}${q.rot}`, q.texture);
            if (!tex) continue;
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, q.vertices);
            gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_BYTE, 0);
            drawn++;
        }

        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindVertexArray(null);
        if (cullWas) gl.enable(gl.CULL_FACE);
        this._lastCount = drawn;
    }

    getState() { return { enabled: this.enabled, drawn: this._lastCount, cachedTextures: this._texCache.size }; }
}
