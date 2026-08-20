// FILE: render/civilizationMarkerRenderer.js
// VERSION: v1
//
// Instanced "obelisk" marker per active civilization. One stretched
// cube (1×3×1) drawn at each civ's center, colored by id, scaled by
// stability. Civ count is bounded at 24 so the per-frame instance
// buffer rebuild is negligible — no need for the dirty-tracking
// optimization debrisRenderer uses for hundreds of particles.
//
// The cube primitive is taller than wide so markers read as obelisks
// from typical camera angles, distinguishable from voxel cubes and
// debris particles. Color is HSL with golden-angle hue (id * 137.5°)
// for max separation across the list.

const VS = `#version 300 es
layout(location=0) in vec3 aPos;       // unit obelisk vertex
layout(location=1) in vec3 aOffset;    // civ world position
layout(location=2) in float aScale;    // marker scale
layout(location=3) in vec3 aColor;     // civ tint

uniform mat4 uViewProj;

out vec3 vWorld;
out vec3 vColor;

void main() {
    vec3 world = aPos * aScale + aOffset;
    vWorld = world;
    vColor = aColor;
    gl_Position = uViewProj * vec4(world, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vColor;
out vec4 outColor;

const vec3 SUN = vec3(0.4082, 0.8165, 0.4082);

void main() {
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    // Slightly higher ambient than debris — markers should always be
    // visible even when facing away from the sun
    float ndl = max(0.55, dot(n, SUN));
    outColor = vec4(vColor * ndl, 1.0);
}`;

const INSTANCE_FLOATS = 7;                     // offsetXYZ + scale + colorRGB
const INSTANCE_BYTES  = INSTANCE_FLOATS * 4;
const MAX_CIVS        = 24;                    // matches CivilizationManager cap

const MIN_SCALE = 0.4;                         // floor so dying civs remain visible
const MAX_SCALE = 1.6;

// Obelisk primitive: 1 unit wide, 3 units tall, 1 unit deep, base
// sitting on the marker's anchor (so markers stand ON the civ.center
// rather than straddling it).
const OBELISK_VERTS = new Float32Array([
    // y=0 (base)
    -0.5, 0.0, -0.5,   +0.5, 0.0, -0.5,   +0.5, 0.0, +0.5,   -0.5, 0.0, +0.5,
    // y=3 (top)
    -0.5, 3.0, -0.5,   +0.5, 3.0, -0.5,   +0.5, 3.0, +0.5,   -0.5, 3.0, +0.5,
]);
const OBELISK_INDICES = new Uint16Array([
    0, 2, 1,  0, 3, 2,    // base (-Y)
    4, 5, 6,  4, 6, 7,    // top  (+Y)
    0, 1, 5,  0, 5, 4,    // -Z face
    1, 2, 6,  1, 6, 5,    // +X face
    2, 3, 7,  2, 7, 6,    // +Z face
    3, 0, 4,  3, 4, 7,    // -X face
]);

export class CivilizationMarkerRenderer {
    constructor(gl) {
        this.gl = gl;
        this.lastDrawn = 0;

        // Reusable scratch buffer — one float32 per instance attribute
        // slot, sized for MAX_CIVS so we never allocate during render.
        this._scratch = new Float32Array(MAX_CIVS * INSTANCE_FLOATS);

        // Compile program
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, VS);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            console.error("[CivMarker] VS compile:", gl.getShaderInfoLog(vs));
        }
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, FS);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.error("[CivMarker] FS compile:", gl.getShaderInfoLog(fs));
        }
        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("[CivMarker] link:", gl.getProgramInfoLog(program));
        }
        this.program = program;
        this.uViewProj = gl.getUniformLocation(program, "uViewProj");

        // VAO + buffers
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, OBELISK_VERTS, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        const ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, OBELISK_INDICES, gl.STATIC_DRAW);

        const instBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
        gl.bufferData(gl.ARRAY_BUFFER, MAX_CIVS * INSTANCE_BYTES, gl.STREAM_DRAW);

        gl.enableVertexAttribArray(1);                                // aOffset
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, INSTANCE_BYTES, 0);
        gl.vertexAttribDivisor(1, 1);

        gl.enableVertexAttribArray(2);                                // aScale
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, INSTANCE_BYTES, 12);
        gl.vertexAttribDivisor(2, 1);

        gl.enableVertexAttribArray(3);                                // aColor
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, INSTANCE_BYTES, 16);
        gl.vertexAttribDivisor(3, 1);

        gl.bindVertexArray(null);

        this.vao = vao;
        this.instBuf = instBuf;

        console.log("[CivMarkerRenderer] v1 ready");
    }

    render(civManager, camera) {
        if (!civManager) return;
        // Round 14 — civs with a loaded GLB render via the mesh
        // renderer (their _meshEntityId is set). Skip them here.
        const civs = civManager.getAll().filter(c => c._meshEntityId == null);
        const count = Math.min(civs.length, MAX_CIVS);
        this.lastDrawn = count;
        if (count === 0) return;

        const gl = this.gl;
        const buf = this._scratch;

        // Pack instance attributes
        for (let i = 0; i < count; i++) {
            const civ = civs[i];
            const base = i * INSTANCE_FLOATS;
            // offset: civ.center as-is. The obelisk primitive's base
            // anchors at y=0 in mesh-local space, so the marker stands
            // ON civ.center.y rather than straddling it.
            buf[base + 0] = civ.center.x;
            buf[base + 1] = civ.center.y;
            buf[base + 2] = civ.center.z;

            // scale: linear from MIN to MAX by stability ∈ [0,1]
            const stab = clamp01(civ.stability ?? 0);
            buf[base + 3] = MIN_SCALE + (MAX_SCALE - MIN_SCALE) * stab;

            // color: golden-angle hue distribution, fixed S/L
            const [r, g, b] = hslToRgb(((civ.id * 137.5) % 360) / 360, 0.7, 0.6);
            buf[base + 4] = r;
            buf[base + 5] = g;
            buf[base + 6] = b;
        }

        // Stream the live slice
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf, 0, count * INSTANCE_FLOATS);

        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uViewProj, false, camera.getViewProjMatrix());

        gl.bindVertexArray(this.vao);
        gl.drawElementsInstanced(
            gl.TRIANGLES, OBELISK_INDICES.length, gl.UNSIGNED_SHORT, 0, count
        );
        gl.bindVertexArray(null);
    }

    snapshot() {
        return { drawn: this.lastDrawn };
    }
}

// ---- helpers --------------------------------------------------------

function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Standard HSL→RGB. h, s, l ∈ [0,1]. Returns [r, g, b] also in [0,1].
function hslToRgb(h, s, l) {
    if (s === 0) return [l, l, l];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
        hue2rgb(p, q, h + 1 / 3),
        hue2rgb(p, q, h),
        hue2rgb(p, q, h - 1 / 3),
    ];
}
function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
}
