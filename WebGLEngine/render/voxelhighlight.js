// FILE: render/voxelhighlight.js
// VERSION: v7 (v621) — multi-box rendering. Internal state is now a list of
//                       OBB configurations; render() loops over each. Single-
//                       box setters (setTarget / setBox / setAABB / setOBB)
//                       still work as 1-item list replacements — back-compat
//                       preserved. New `setMulti(boxes)` and `addOBB(...)`
//                       enable multi-select highlight.
//
// History:
//   v1 — translation bug.
//   v2 (v613) — uPos + uColor.
//   v3 (v617) — uScale float + setBox(center, size).
//   v4 (v618) — uScale promoted to vec3 + setAABB.
//   v5 (v619) — uLocalMin + uYaw → setOBB(pos, localAABB, yaw).
//   v6 (v620) — uYaw replaced with uRot (mat3) → setOBB takes mat3.
//   v7 (v621) — internal _boxes list, multi-box render in one pass.

const IDENTITY_MAT3 = new Float32Array([1, 0, 0,  0, 1, 0,  0, 0, 1]);

function _emptyBox() {
    return {
        pos: { x: 0, y: 0, z: 0 },
        localMin: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rot: new Float32Array(IDENTITY_MAT3),
    };
}

export class VoxelHighlight {
    constructor(gl, color) {
        this.gl = gl;
        this.program = null;
        this.vao = null;
        this.uViewProj = null;
        this.uPos = null;
        this.uLocalMin = null;
        this.uScale = null;
        this.uRot = null;
        this.uColor = null;

        // v7 — list of boxes to render this frame. Single-select paths
        // populate a 1-element list; multi-select fills it with N.
        this._boxes = [];
        this.color = color ? { r: color.r, g: color.g, b: color.b, a: color.a ?? 1 } : { r: 1, g: 1, b: 0, a: 1 };

        this.init();
    }

    get visible() { return this._boxes.length > 0; }

    init() {
        const gl = this.gl;

        const vs = `#version 300 es
        layout(location=0) in vec3 aPos;

        uniform mat4 uViewProj;
        uniform vec3 uPos;
        uniform vec3 uLocalMin;
        uniform vec3 uScale;
        uniform mat3 uRot;

        void main() {
            vec3 local = aPos * uScale + uLocalMin;
            vec3 rotated = uRot * local;
            gl_Position = uViewProj * vec4(rotated + uPos, 1.0);
        }`;

        const fs = `#version 300 es
        precision highp float;
        uniform vec4 uColor;
        out vec4 outColor;

        void main() {
            outColor = uColor;
        }`;

        const compile = (type, src) => {
            const sh = gl.createShader(type);
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(sh));
            }
            return sh;
        };

        this.program = gl.createProgram();
        gl.attachShader(this.program, compile(gl.VERTEX_SHADER, vs));
        gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(this.program);

        this.uViewProj = gl.getUniformLocation(this.program, "uViewProj");
        this.uPos      = gl.getUniformLocation(this.program, "uPos");
        this.uLocalMin = gl.getUniformLocation(this.program, "uLocalMin");
        this.uScale    = gl.getUniformLocation(this.program, "uScale");
        this.uRot      = gl.getUniformLocation(this.program, "uRot");
        this.uColor    = gl.getUniformLocation(this.program, "uColor");

        const verts = [
            0,0,0, 1,0,0,  1,0,0, 1,0,1,  1,0,1, 0,0,1,  0,0,1, 0,0,0,
            0,1,0, 1,1,0,  1,1,0, 1,1,1,  1,1,1, 0,1,1,  0,1,1, 0,1,0,
            0,0,0, 0,1,0,  1,0,0, 1,1,0,  1,0,1, 1,1,1,  0,0,1, 0,1,1,
        ];

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    }

    // --- single-box setters (clear list, push one entry) ---

    setTarget(hit) {
        if (!hit) { this._boxes.length = 0; return; }
        const b = _emptyBox();
        b.pos.x = hit.x; b.pos.y = hit.y; b.pos.z = hit.z;
        // localMin = 0, scale = (1,1,1), rot = identity (already in _emptyBox)
        this._boxes = [b];
    }

    setBox(centerX, centerY, centerZ, size) {
        const b = _emptyBox();
        b.pos.x = centerX - size * 0.5; b.pos.y = centerY; b.pos.z = centerZ - size * 0.5;
        b.scale.x = size; b.scale.y = size; b.scale.z = size;
        this._boxes = [b];
    }

    setAABB(aabb) {
        if (!aabb) { this._boxes.length = 0; return; }
        const b = _emptyBox();
        b.pos.x = aabb.minX; b.pos.y = aabb.minY; b.pos.z = aabb.minZ;
        b.scale.x = aabb.maxX - aabb.minX;
        b.scale.y = aabb.maxY - aabb.minY;
        b.scale.z = aabb.maxZ - aabb.minZ;
        this._boxes = [b];
    }

    setOBB(entityPos, localAABB, rotMat3, entityScale = { x: 1, y: 1, z: 1 }) {
        if (!localAABB) { this._boxes.length = 0; return; }
        this._boxes = [_buildOBB(entityPos, localAABB, rotMat3, entityScale)];
    }

    // --- multi-box (v621) ---

    // Replace the entire list. Each item: { entityPos, localAABB, rotMat3, entityScale }
    setMulti(items) {
        if (!items || !items.length) { this._boxes.length = 0; return; }
        this._boxes = items.map(it => _buildOBB(it.entityPos, it.localAABB, it.rotMat3, it.entityScale));
    }

    // Append one more OBB without disturbing existing.
    addOBB(entityPos, localAABB, rotMat3, entityScale = { x: 1, y: 1, z: 1 }) {
        if (!localAABB) return;
        this._boxes.push(_buildOBB(entityPos, localAABB, rotMat3, entityScale));
    }

    setColor(r, g, b, a = 1) {
        this.color.r = r; this.color.g = g; this.color.b = b; this.color.a = a;
    }

    clear() { this._boxes.length = 0; }

    render(camera) {
        if (this._boxes.length === 0) return;
        const gl = this.gl;

        gl.useProgram(this.program);
        const mvp = camera.getViewProjMatrix();
        gl.uniformMatrix4fv(this.uViewProj, false, mvp);
        gl.uniform4f(this.uColor, this.color.r, this.color.g, this.color.b, this.color.a);
        gl.bindVertexArray(this.vao);

        for (const b of this._boxes) {
            gl.uniform3f(this.uPos,      b.pos.x,      b.pos.y,      b.pos.z);
            gl.uniform3f(this.uLocalMin, b.localMin.x, b.localMin.y, b.localMin.z);
            gl.uniform3f(this.uScale,    b.scale.x,    b.scale.y,    b.scale.z);
            gl.uniformMatrix3fv(this.uRot, false, b.rot);
            gl.drawArrays(gl.LINES, 0, 24);
        }
    }
}

// Build a single OBB record from entity-space inputs.
function _buildOBB(entityPos, localAABB, rotMat3, entityScale) {
    const b = _emptyBox();
    b.pos.x = entityPos.x; b.pos.y = entityPos.y; b.pos.z = entityPos.z;
    const sx = entityScale?.x ?? 1, sy = entityScale?.y ?? 1, sz = entityScale?.z ?? 1;
    b.localMin.x = localAABB.minX * sx;
    b.localMin.y = localAABB.minY * sy;
    b.localMin.z = localAABB.minZ * sz;
    b.scale.x = (localAABB.maxX - localAABB.minX) * sx;
    b.scale.y = (localAABB.maxY - localAABB.minY) * sy;
    b.scale.z = (localAABB.maxZ - localAABB.minZ) * sz;
    if (rotMat3 && rotMat3.length >= 9) {
        b.rot.set(rotMat3, 0);
    }
    return b;
}
