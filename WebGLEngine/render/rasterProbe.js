// render/rasterProbe.js
//
// A DELIBERATELY BORING RASTER OBJECT (v3068), so compositing has something to be wrong against.
//
// FRAG_SRC_DEPTH (v3064) makes the marcher write gl_FragDepth, and depthProject (v3063) proved the number is
// right. Neither shows whether voxels and triangles actually interleave, because raymarch-live.html draws the
// region alone -- there is nothing in that frame for a depth buffer to arbitrate. This is that something: a few
// axis-aligned boxes rasterised through the region with an ordinary vertex/fragment pair and an ordinary depth
// write.
//
// WHY BOXES THAT PASS THROUGH THE TERRAIN. A probe floating in front of everything proves nothing -- it looks
// identical whether depth works or not. These are placed to be PARTLY BURIED: each one should have some of its
// length hidden inside terrain and some sticking out. If the marcher's depth is wrong, the buried fraction
// changes, and it changes MORE toward the screen edges because the error is 1/cos of the angle from centre. That
// is the visible signature of writing t instead of view-space z, and it is why the probe spans the frame rather
// than sitting in the middle of it.
//
// It shares the marcher's near and far. A probe on a different projection would disagree for a second reason and
// the two would be impossible to tell apart.
//
// Browser-safe: no imports, no DOM, no node builtins.

export const PROBE_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform vec3 uOffset;
out vec3 vLocal;
void main(){
    vLocal = aPos;
    gl_Position = uViewProj * vec4(aPos + uOffset, 1.0);
}`;

export const PROBE_FRAG = `#version 300 es
precision highp float;
in vec3 vLocal;
uniform vec3 uColor;
out vec4 fragColor;
void main(){
    // Flat-ish shading with a cheap edge darkening, so the SHAPE is readable where it emerges from terrain.
    // A solid colour would make a partly-buried box hard to judge, which is the one thing this exists for.
    float e = min(min(abs(vLocal.x), abs(vLocal.y)), abs(vLocal.z));
    fragColor = vec4(uColor * (0.55 + 0.45 * smoothstep(0.0, 0.25, e)), 1.0);
}`;

/** Unit cube, 36 vertices, centred on the origin so uOffset places it and vLocal is symmetric for the shading. */
export function unitCube(half = 0.5) {
    const h = half;
    const q = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
    const p = [[-h, -h, -h], [h, -h, -h], [h, h, -h], [-h, h, -h], [-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]];
    return new Float32Array([
        ...q(p[0], p[1], p[2], p[3]), ...q(p[5], p[4], p[7], p[6]),
        ...q(p[4], p[0], p[3], p[7]), ...q(p[1], p[5], p[6], p[2]),
        ...q(p[3], p[2], p[6], p[7]), ...q(p[4], p[5], p[1], p[0]),
    ]);
}

/** Column-major perspective * lookAt, matching the marcher's near/far exactly. */
export function viewProj(eye, fwd, right, up, tanFov, aspect, near, far) {
    const f = [-fwd[0], -fwd[1], -fwd[2]];                 // camera looks down -Z in view space
    const m = [
        right[0], up[0], f[0], 0,
        right[1], up[1], f[1], 0,
        right[2], up[2], f[2], 0,
        -(right[0] * eye[0] + right[1] * eye[1] + right[2] * eye[2]),
        -(up[0] * eye[0] + up[1] * eye[1] + up[2] * eye[2]),
        -(f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2]),
        1,
    ];
    const t = tanFov, a = aspect;
    const P = [
        1 / (t * a), 0, 0, 0,
        0, 1 / t, 0, 0,
        0, 0, -(far + near) / (far - near), -1,
        0, 0, -2 * far * near / (far - near), 0,
    ];
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += P[k * 4 + r] * m[c * 4 + k];
        out[c * 4 + r] = s;
    }
    return out;
}

export class RasterProbe {
    constructor(gl) {
        this.gl = gl; this.dead = false; this.error = null;
        try {
            const sh = (type, src) => {
                const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
                if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "compile failed");
                return s;
            };
            this.prog = gl.createProgram();
            gl.attachShader(this.prog, sh(gl.VERTEX_SHADER, PROBE_VERT));
            gl.attachShader(this.prog, sh(gl.FRAGMENT_SHADER, PROBE_FRAG));
            gl.linkProgram(this.prog);
            if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.prog) || "link failed");
            this.vao = gl.createVertexArray();
            gl.bindVertexArray(this.vao);
            this.buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
            gl.bufferData(gl.ARRAY_BUFFER, unitCube(0.5), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
            gl.bindVertexArray(null);
            this._u = {};
        } catch (e) { this.dead = true; this.error = String((e && e.message) || e); }
    }

    /** boxes: [{ offset:[x,y,z], color:[r,g,b] }] in the same space the marcher uses. */
    draw(cam, aspect, near, far, boxes) {
        if (this.dead) return false;
        const gl = this.gl;
        const u = (n) => (this._u[n] !== undefined ? this._u[n] : (this._u[n] = gl.getUniformLocation(this.prog, n)));
        gl.useProgram(this.prog);
        gl.bindVertexArray(this.vao);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.uniformMatrix4fv(u("uViewProj"), false, viewProj(cam.eye, cam.fwd, cam.right, cam.up, cam.tanFov, aspect, near, far));
        for (const b of boxes) {
            gl.uniform3f(u("uOffset"), b.offset[0], b.offset[1], b.offset[2]);
            gl.uniform3f(u("uColor"), b.color[0], b.color[1], b.color[2]);
            gl.drawArrays(gl.TRIANGLES, 0, 36);
        }
        return true;
    }

    dispose() { try { const gl = this.gl; gl.deleteProgram(this.prog); gl.deleteVertexArray(this.vao); gl.deleteBuffer(this.buf); } catch {} }
}
