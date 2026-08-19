// FILE: render/EntityCubeRenderer.js
// VERSION: v1 - INSTANCED SOLID CUBES WITH DIRECTIONAL SHADING
//
// Replaces the wireframe debug renderer with proper-looking solid cubes:
//   * Instanced rendering — one draw call per render() regardless of
//     entity count
//   * Per-face directional shading (top brighter, bottom darker, sides
//     shaded by N·L against a fixed sun) so cubes look 3D not flat
//   * Depth-tested + depth-written so cubes occlude the world and each
//     other correctly
//
// Per-instance data layout (7 floats / 28 bytes):
//   offsetX, offsetY, offsetZ, scale, colorR, colorG, colorB
//
// Capacity: starts at 256 instances, grows on demand.

import { colorFor, scaleFor } from "./entityVisuals.js";

const INSTANCE_FLOATS = 7;
const INSTANCE_BYTES  = INSTANCE_FLOATS * 4;

// CCW from outside on every face. 6 faces × 2 triangles × 3 verts = 36.
const CUBE_VERTS = new Float32Array([
    // +X face
     0.5,-0.5,-0.5,  0.5, 0.5,-0.5,  0.5, 0.5, 0.5,
     0.5,-0.5,-0.5,  0.5, 0.5, 0.5,  0.5,-0.5, 0.5,
    // -X face
    -0.5,-0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5,-0.5,
    -0.5,-0.5, 0.5, -0.5, 0.5,-0.5, -0.5,-0.5,-0.5,
    // +Y face (top)
    -0.5, 0.5,-0.5, -0.5, 0.5, 0.5,  0.5, 0.5, 0.5,
    -0.5, 0.5,-0.5,  0.5, 0.5, 0.5,  0.5, 0.5,-0.5,
    // -Y face (bottom)
    -0.5,-0.5, 0.5, -0.5,-0.5,-0.5,  0.5,-0.5,-0.5,
    -0.5,-0.5, 0.5,  0.5,-0.5,-0.5,  0.5,-0.5, 0.5,
    // +Z face (front)
    -0.5,-0.5, 0.5,  0.5,-0.5, 0.5,  0.5, 0.5, 0.5,
    -0.5,-0.5, 0.5,  0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    // -Z face (back)
     0.5,-0.5,-0.5, -0.5,-0.5,-0.5, -0.5, 0.5,-0.5,
     0.5,-0.5,-0.5, -0.5, 0.5,-0.5,  0.5, 0.5,-0.5,
]);

const CUBE_NORMALS = new Float32Array([
     1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
     0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
     0,-1, 0,  0,-1, 0,  0,-1, 0,  0,-1, 0,  0,-1, 0,  0,-1, 0,
     0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
     0, 0,-1,  0, 0,-1,  0, 0,-1,  0, 0,-1,  0, 0,-1,  0, 0,-1,
]);

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aOffset;     // per-instance
layout(location=3) in float aScale;     // per-instance
layout(location=4) in vec3 aColor;      // per-instance

uniform mat4 uViewProj;

out vec3 vColor;
out vec3 vNormal;

void main() {
    vec3 worldPos = aPos * aScale + aOffset;
    vColor  = aColor;
    vNormal = aNormal;
    gl_Position = uViewProj * vec4(worldPos, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vColor;
in vec3 vNormal;
out vec4 outColor;

const vec3 SUN = vec3(0.4082, 0.8165, 0.4082);  // normalized (1,2,1)

void main() {
    float ndl = max(0.4, dot(vNormal, SUN));   // ambient floor 0.4
    outColor = vec4(vColor * ndl, 1.0);
}`;

// Round 50 - shadow casting. Depth-only VS replicates the position
// transform from VS (pos * scale + offset) but with uLightVP instead of
// uViewProj. Locations 0/2/3 are the only attribs we touch; 1/4 (normal,
// color) are skipped via attrib divisor inertia. FS is a no-op since
// only depth is written.
const DEPTH_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=2) in vec3 aOffset;
layout(location=3) in float aScale;

uniform mat4 uLightVP;

void main() {
    vec3 worldPos = aPos * aScale + aOffset;
    gl_Position = uLightVP * vec4(worldPos, 1.0);
}`;

const DEPTH_FS = `#version 300 es
precision highp float;
void main() {}
`;

export class EntityCubeRenderer {
    constructor(gl) {
        this.gl = gl;
        this.lastDrawn = 0;
        this.capacity = 256;
        this._instanceData = new Float32Array(this.capacity * INSTANCE_FLOATS);
        this._init();
    }

    _compile(type, src) {
        const gl = this.gl;
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.error("[EntityCube] shader:", gl.getShaderInfoLog(sh));
        }
        return sh;
    }

    _init() {
        const gl = this.gl;

        const program = gl.createProgram();
        gl.attachShader(program, this._compile(gl.VERTEX_SHADER,   VS));
        gl.attachShader(program, this._compile(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("[EntityCube] link:", gl.getProgramInfoLog(program));
        }
        this.program = program;
        this.uViewProj = gl.getUniformLocation(program, "uViewProj");

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        // Static geometry: positions
        const posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, CUBE_VERTS, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        // Static geometry: normals
        const normBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
        gl.bufferData(gl.ARRAY_BUFFER, CUBE_NORMALS, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

        // Per-instance data: offset (3) + scale (1) + color (3) interleaved.
        const instBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
        gl.bufferData(gl.ARRAY_BUFFER, this._instanceData.byteLength, gl.STREAM_DRAW);

        // aOffset (location 2): vec3, byte offset 0
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, INSTANCE_BYTES, 0);
        gl.vertexAttribDivisor(2, 1);

        // aScale (location 3): float, byte offset 12
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 1, gl.FLOAT, false, INSTANCE_BYTES, 12);
        gl.vertexAttribDivisor(3, 1);

        // aColor (location 4): vec3, byte offset 16
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 3, gl.FLOAT, false, INSTANCE_BYTES, 16);
        gl.vertexAttribDivisor(4, 1);

        gl.bindVertexArray(null);

        this.vao = vao;
        this.instanceBuf = instBuf;

        // Round 50 - depth-only program for shadow casting. Reuses the
        // same VAO (location 0/2/3 attribs). Linked separately so we can
        // swap programs without re-binding VAO between depth + color passes.
        const depthProgram = gl.createProgram();
        gl.attachShader(depthProgram, this._compile(gl.VERTEX_SHADER,   DEPTH_VS));
        gl.attachShader(depthProgram, this._compile(gl.FRAGMENT_SHADER, DEPTH_FS));
        gl.linkProgram(depthProgram);
        if (!gl.getProgramParameter(depthProgram, gl.LINK_STATUS)) {
            console.error("[EntityCube] depth link:", gl.getProgramInfoLog(depthProgram));
        }
        this.depthProgram = depthProgram;
        this.uLightVP_depth = gl.getUniformLocation(depthProgram, "uLightVP");
    }

    _ensureCapacity(needed) {
        if (needed <= this.capacity) return;
        const gl = this.gl;
        let cap = this.capacity;
        while (cap < needed) cap *= 2;
        this.capacity = cap;
        this._instanceData = new Float32Array(cap * INSTANCE_FLOATS);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
        gl.bufferData(gl.ARRAY_BUFFER, this._instanceData.byteLength, gl.STREAM_DRAW);
    }

    // entities: Array<{ id, kind, x, y, z }>
    render(entities, camera) {
        const gl = this.gl;
        if (!entities || entities.length === 0) {
            this.lastDrawn = 0;
            return;
        }

        this._ensureCapacity(entities.length);

        // Pack per-instance data.
        const buf = this._instanceData;
        let off = 0;
        for (const e of entities) {
            const kind  = e.kind || "other";
            const scale = scaleFor(kind);
            const color = colorFor(kind, e.id);
            // Center cube vertically so the bottom touches e.y (ground anchor).
            buf[off + 0] = e.x;
            buf[off + 1] = e.y + scale * 0.5;
            buf[off + 2] = e.z;
            buf[off + 3] = scale;
            buf[off + 4] = color[0];
            buf[off + 5] = color[1];
            buf[off + 6] = color[2];
            off += INSTANCE_FLOATS;
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf.subarray(0, entities.length * INSTANCE_FLOATS));

        gl.useProgram(this.program);
        const mvp = camera.getViewProjMatrix?.() || camera.getMatrix?.();
        if (mvp) gl.uniformMatrix4fv(this.uViewProj, false, mvp);

        gl.bindVertexArray(this.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, entities.length);
        gl.bindVertexArray(null);

        this.lastDrawn = entities.length;
    }

    // Round 50 - shadow casting. Depth-only pass. Packs the same instance
    // buffer with offset+scale (color/normal are ignored by the depth FS),
    // binds the depth program with the light's view-proj matrix, draws
    // through the same VAO. Cost: one extra instance-buffer upload per
    // frame (~7 floats * entity_count = ~3KB at 100 entities) plus the
    // depth draw call itself. Cheap. Called from main.js inside the
    // shadow-pass bind block, before the color pass.
    renderDepth(entities, lightVP) {
        const gl = this.gl;
        if (!entities || entities.length === 0) return;
        this._ensureCapacity(entities.length);
        // Pack instance data - same logic as render() so the depth-pass
        // geometry matches the color pass exactly. We pack color too (so
        // we can skip a second pack later if needed) but the depth FS
        // ignores it.
        const buf = this._instanceData;
        let off = 0;
        for (const e of entities) {
            const kind  = e.kind || "other";
            const scale = scaleFor(kind);
            const color = colorFor(kind, e.id);
            buf[off + 0] = e.x;
            buf[off + 1] = e.y + scale * 0.5;
            buf[off + 2] = e.z;
            buf[off + 3] = scale;
            buf[off + 4] = color[0];
            buf[off + 5] = color[1];
            buf[off + 6] = color[2];
            off += INSTANCE_FLOATS;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf.subarray(0, entities.length * INSTANCE_FLOATS));
        gl.useProgram(this.depthProgram);
        gl.uniformMatrix4fv(this.uLightVP_depth, false, lightVP);
        gl.bindVertexArray(this.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, entities.length);
        gl.bindVertexArray(null);
    }
}
