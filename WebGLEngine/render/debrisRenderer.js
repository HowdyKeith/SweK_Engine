// FILE: render/debrisRenderer.js
// VERSION: v1
//
// Instanced cube renderer for VoxelDebrisSystem particles. One unit
// cube mesh (8 verts / 36 indices) drawn N times per frame with
// per-instance (offset, scale, color). Lighting is a screen-space
// face normal via dFdx/dFdy — same approach as EntityMeshRenderer's
// fallback path, fine for tiny short-lived cubes where per-vertex
// normals would be overkill.
//
// Self-contained: own program, own VAO, own instance buffer. Doesn't
// share state with voxelrenderer or EntityMeshRenderer; whatever GL
// state they leave behind, this renderer rebinds what it needs.

const VS = `#version 300 es
layout(location=0) in vec3 aPos;       // unit cube vertex (-0.5..+0.5)
layout(location=1) in vec3 aOffset;    // particle world position
layout(location=2) in float aScale;    // particle size (world units)
layout(location=3) in vec3 aColor;     // particle tint

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
    float ndl = max(0.4, dot(n, SUN));
    outColor = vec4(vColor * ndl, 1.0);
}`;

const INSTANCE_FLOATS    = 7;                // offsetXYZ + scale + colorRGB
const INSTANCE_BYTES     = INSTANCE_FLOATS * 4;
const INITIAL_CAPACITY   = 64;

// Unit cube centered at origin: 8 vertices, 36 indices (12 triangles).
// Winding is CCW from outside; matches gl.CULL_FACE / gl.cullFace(BACK)
// so backface culling can stay enabled.
const CUBE_VERTS = new Float32Array([
    -0.5, -0.5, -0.5,  +0.5, -0.5, -0.5,  +0.5, +0.5, -0.5,  -0.5, +0.5, -0.5,
    -0.5, -0.5, +0.5,  +0.5, -0.5, +0.5,  +0.5, +0.5, +0.5,  -0.5, +0.5, +0.5,
]);
const CUBE_INDICES = new Uint16Array([
    0, 2, 1,  0, 3, 2,    // -Z face
    4, 5, 6,  4, 6, 7,    // +Z face
    0, 1, 5,  0, 5, 4,    // -Y face
    3, 6, 2,  3, 7, 6,    // +Y face
    0, 4, 7,  0, 7, 3,    // -X face
    1, 2, 6,  1, 6, 5,    // +X face
]);

export class DebrisRenderer {
    constructor(gl) {
        this.gl = gl;
        this.lastDrawn = 0;
        this._init();
    }

    _compile(type, src) {
        const gl = this.gl;
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.error("[DebrisRenderer] shader:", gl.getShaderInfoLog(sh));
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
            console.error("[DebrisRenderer] link:", gl.getProgramInfoLog(program));
        }
        this.program = program;
        this.uViewProj = gl.getUniformLocation(program, "uViewProj");

        // VAO with mesh + instance attributes
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        // Mesh positions (loc 0)
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, CUBE_VERTS, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        // Mesh indices
        const ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, CUBE_INDICES, gl.STATIC_DRAW);

        // Instance buffer (offset / scale / color, interleaved)
        const instBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
        gl.bufferData(gl.ARRAY_BUFFER, INITIAL_CAPACITY * INSTANCE_BYTES, gl.STREAM_DRAW);

        gl.enableVertexAttribArray(1);                                  // aOffset
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, INSTANCE_BYTES, 0);
        gl.vertexAttribDivisor(1, 1);

        gl.enableVertexAttribArray(2);                                  // aScale
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, INSTANCE_BYTES, 12);
        gl.vertexAttribDivisor(2, 1);

        gl.enableVertexAttribArray(3);                                  // aColor
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, INSTANCE_BYTES, 16);
        gl.vertexAttribDivisor(3, 1);

        gl.bindVertexArray(null);

        this.vao = vao;
        this.instBuf = instBuf;
        this.instCapacity = INITIAL_CAPACITY;

        console.log("[DebrisRenderer] v1 ready");
    }

    render(debrisSystem, camera) {
        const gl = this.gl;
        const { data, count } = debrisSystem.getInstanceData();
        this.lastDrawn = count;
        if (count === 0) return;

        // Grow instance buffer if a sudden burst exceeds capacity.
        // Doubles each grow so reallocations are infrequent.
        if (count > this.instCapacity) {
            this.instCapacity = Math.max(count, this.instCapacity * 2);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
            gl.bufferData(gl.ARRAY_BUFFER, this.instCapacity * INSTANCE_BYTES, gl.STREAM_DRAW);
        }

        // Stream the live particle slice into the GPU buffer.
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);

        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uViewProj, false, camera.getViewProjMatrix());

        gl.bindVertexArray(this.vao);
        gl.drawElementsInstanced(gl.TRIANGLES, CUBE_INDICES.length, gl.UNSIGNED_SHORT, 0, count);
        gl.bindVertexArray(null);
    }

    snapshot() {
        return { drawn: this.lastDrawn };
    }
}
