// render/screenWallRenderer.js — v523 — in-world "video wall": textures the
// exposed faces of SCREEN voxels (id 20) with a live image (the phone camera
// frame). Self-contained pass run AFTER terrain; mirrors the engine's GL idioms
// (uViewProj from camera.getViewProjMatrix(), interleaved x,y,z,u,v quads).
//
// rebuild() scans SCREEN voxels near a point and emits one textured quad per
// exposed face; setSource() updates the texture from a data URL / <img>. Culling
// is disabled while drawing so face winding can't hide the wall. NOTE: this is a
// fresh GL renderer that could not be GPU-tested at author time — quad/UV
// alignment may need a small tweak in-app (see VOXEL_CORNER below).

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
uniform mat4 uViewProj;
out vec2 vUV;
void main() { vUV = aUV; gl_Position = uViewProj * vec4(aPos, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 oColor;
uniform sampler2D uTex;
void main() { oColor = vec4(texture(uTex, vUV).rgb, 1.0); }`;

// Voxel (x,y,z) occupies the cube [x,x+1]^3 (corner-based, matching the cube
// mesher). If the wall renders offset by a block, flip this to center the cube.
const VOXEL_CORNER = true;

// 6 cube faces: outward neighbour offset + 4 corners (CCW from outside) + UVs.
const FACES = [
    { n: [ 1, 0, 0], c: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
    { n: [-1, 0, 0], c: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },
    { n: [ 0, 1, 0], c: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]] },
    { n: [ 0,-1, 0], c: [[0,0,1],[0,0,0],[1,0,0],[1,0,1]] },
    { n: [ 0, 0, 1], c: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]] },
    { n: [ 0, 0,-1], c: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] },
];
const UV = [[0,1],[0,0],[1,0],[1,1]];        // bottom-left, top-left, top-right, bottom-right

const SCREEN = 20, AIR = 0, MAX_QUADS = 4000;

export class ScreenWallRenderer {
    constructor(gl) {
        this.gl = gl;
        this._program = this._link(gl, VS, FS);
        this._u = { viewProj: gl.getUniformLocation(this._program, "uViewProj"), tex: gl.getUniformLocation(this._program, "uTex") };
        this._vao = gl.createVertexArray();
        gl.bindVertexArray(this._vao);
        this._vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);   // aPos
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);  // aUV (stride 5 floats)
        gl.bindVertexArray(null);
        this._tex = gl.createTexture();
        this._hasTex = false;
        this._vertCount = 0;
        this._img = null;
        console.log("[ScreenWall] renderer ready — window.screenWall.placeWall() then point a phone camera at it");
    }

    _compile(gl, type, src) {
        const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.error("[ScreenWall] shader:", gl.getShaderInfoLog(sh));
        return sh;
    }
    _link(gl, vs, fs) {
        const p = gl.createProgram();
        gl.attachShader(p, this._compile(gl, gl.VERTEX_SHADER, vs));
        gl.attachShader(p, this._compile(gl, gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error("[ScreenWall] link:", gl.getProgramInfoLog(p));
        return p;
    }

    /** Update the wall texture from a data URL (or <img>). */
    setSource(src) {
        const gl = this.gl;
        const upload = (img) => {
            try {
                gl.bindTexture(gl.TEXTURE_2D, this._tex);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.bindTexture(gl.TEXTURE_2D, null);
                this._hasTex = true;
            } catch (e) { console.warn("[ScreenWall] tex upload:", e?.message); }
        };
        if (typeof src === "string") {
            if (!this._img) this._img = new Image();
            this._img.onload = () => upload(this._img);
            this._img.src = src;
        } else if (src) { upload(src); }
    }

    /** Scan SCREEN voxels near (cx,cz) and build a textured quad per exposed face. */
    rebuild(world, cx, cz, radius = 40) {
        if (!world?.voxelAt) { this._vertCount = 0; return { quads: 0 }; }
        cx = cx | 0; cz = cz | 0; const R = radius | 0;
        const verts = []; let quads = 0;
        for (let x = cx - R; x <= cx + R && quads < MAX_QUADS; x++) {
            for (let z = cz - R; z <= cz + R && quads < MAX_QUADS; z++) {
                if (world.getChunk && !world.getChunk(x, z)) continue;
                for (let y = 1; y < 62 && quads < MAX_QUADS; y++) {
                    if (world.voxelAt(x, y, z) !== SCREEN) continue;
                    for (const f of FACES) {
                        if (world.voxelAt(x + f.n[0], y + f.n[1], z + f.n[2]) !== AIR) continue;
                        const tri = [0, 1, 2, 0, 2, 3];   // two triangles from the 4 corners
                        const o = 0.02;                   // nudge out along the normal (anti z-fight)
                        for (const ci of tri) {
                            const c = f.c[ci], uv = UV[ci];
                            verts.push(x + c[0] + f.n[0] * o, y + c[1] + f.n[1] * o, z + c[2] + f.n[2] * o, uv[0], uv[1]);
                        }
                        quads++;
                        if (quads >= MAX_QUADS) break;
                    }
                }
            }
        }
        const gl = this.gl;
        const data = new Float32Array(verts);
        gl.bindVertexArray(this._vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.bindVertexArray(null);
        this._vertCount = verts.length / 5;
        return { quads };
    }

    clear() { this._vertCount = 0; }

    render(camera) {
        if (!this._hasTex || this._vertCount === 0 || !camera?.getViewProjMatrix) return;
        const gl = this.gl;
        const cullOn = gl.isEnabled(gl.CULL_FACE);
        gl.useProgram(this._program);
        gl.uniformMatrix4fv(this._u.viewProj, false, camera.getViewProjMatrix());
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._tex);
        gl.uniform1i(this._u.tex, 0);
        gl.disable(gl.CULL_FACE);                 // draw both sides — winding can't hide it
        gl.enable(gl.DEPTH_TEST);
        gl.bindVertexArray(this._vao);
        gl.drawArrays(gl.TRIANGLES, 0, this._vertCount);
        gl.bindVertexArray(null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        if (cullOn) gl.enable(gl.CULL_FACE);
    }
}
