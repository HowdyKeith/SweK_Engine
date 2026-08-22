// FILE: engine/P3dRenderer.js
// VERSION: v1 — round 348
//
// Renders multiple .p3d meshes as positioned world entities, parallel
// to how SplatRenderer handles .ply splats. Each loaded mesh gets its
// own VAO + buffers + per-entity transform, all drawn through one
// shared shader program in the main render loop.
//
// API surface (also exposed at window.p3d for console access):
//   add({ mesh, position?, rotation?, scale?, color?, name? }) → id
//   remove(id) → boolean
//   clear() → number removed
//   list() → [{ id, name, position, ... }]
//   render(camera) → void
//
// World-entity vs the demo viewer:
//   - The demo (demos/p3d/p3dDemo.js) renders a single mesh in
//     "exclusive" isolation, hiding the world. For browsing one file.
//   - This renderer slots into the main world loop so multiple .p3d
//     meshes can co-exist with the voxel world, the splat assets, etc.

import { computeMeshNormals } from "./p3dFormat.js";
import { extractFrustumPlanes, sphereInFrustum, computeBoundingSphere, transformSphere, multiplyMat4 } from "./Frustum.js";

let _nextEntityId = 1;

export class P3dRenderer {
    constructor({ gl }) {
        this.gl = gl;
        this.entities = [];
        if (!gl) { this.dead = true; try { console.warn("[P3dRenderer] no WebGL2 context -- renderer disabled."); } catch {} return; }
        this._buildProgram();
    }

    _buildProgram() {
        const gl = this.gl;
        const vsSrc = `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
uniform mat4 u_view;
uniform mat4 u_proj;
uniform mat4 u_model;
uniform mat3 u_normalMat;
out vec3 v_world_pos;
out vec3 v_normal;
void main() {
    vec4 wp = u_model * vec4(a_position, 1.0);
    v_world_pos = wp.xyz;
    v_normal = u_normalMat * a_normal;
    gl_Position = u_proj * u_view * wp;
}`;
        const fsSrc = `#version 300 es
precision highp float;
in vec3 v_world_pos;
in vec3 v_normal;
uniform vec3 u_color;
uniform vec3 u_light_dir;
uniform vec3 u_view_pos;
out vec4 fragColor;
void main() {
    vec3 N = normalize(v_normal);
    float diff = max(dot(N, u_light_dir), 0.15);
    vec3 V = normalize(u_view_pos - v_world_pos);
    vec3 R = reflect(-u_light_dir, N);
    float spec = pow(max(dot(V, R), 0.0), 24.0) * 0.20;
    vec3 base = u_color * (diff + 0.25) + vec3(spec);
    fragColor = vec4(base, 1.0);
}`;
        const compile = (src, type) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                throw new Error("[P3dRenderer shader] " + gl.getShaderInfoLog(s));
            }
            return s;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, compile(vsSrc, gl.VERTEX_SHADER));
        gl.attachShader(prog, compile(fsSrc, gl.FRAGMENT_SHADER));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error("[P3dRenderer link] " + gl.getProgramInfoLog(prog));
        }
        this.prog = prog;
        this.u_view      = gl.getUniformLocation(prog, "u_view");
        this.u_proj      = gl.getUniformLocation(prog, "u_proj");
        this.u_model     = gl.getUniformLocation(prog, "u_model");
        this.u_normalMat = gl.getUniformLocation(prog, "u_normalMat");
        this.u_color     = gl.getUniformLocation(prog, "u_color");
        this.u_lightDir  = gl.getUniformLocation(prog, "u_light_dir");
        this.u_viewPos   = gl.getUniformLocation(prog, "u_view_pos");
    }

    /**
     * Add a mesh as a world entity.
     *
     * @param {{ mesh: {vertices, indices}, position?: [x,y,z], rotation?: number,
     *          scale?: number, color?: [r,g,b], name?: string }} opts
     * @returns {number} entity ID
     */
    add({ mesh, position = [0, 5, -10], rotation = 0, scale = 1, color = [0.55, 0.85, 0.65], name = null }) {
        if (!mesh?.vertices || !mesh?.indices) throw new Error("P3dRenderer.add: mesh must have vertices and indices");
        const gl = this.gl;
        const id = _nextEntityId++;
        const normals = computeMeshNormals(mesh.vertices, mesh.indices);
        const vertCount = mesh.vertices.length / 3;
        const { center: localCenter, radius: localRadius } = computeBoundingSphere(mesh.vertices, vertCount);
        const bufPos = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bufPos);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
        const bufNorm = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bufNorm);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
        const bufIdx = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufPos);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufNorm);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx);
        gl.bindVertexArray(null);

        const entity = {
            id,
            name: name || `p3d-${id}`,
            position: position.slice(),
            rotation,
            scale,
            color: color.slice(),
            vao,
            bufPos,
            bufNorm,
            bufIdx,
            indexCount: mesh.indices.length,
            vertCount:  vertCount,
            localCenter, localRadius,         // v354 frustum culling
            createdAt:  Date.now(),
        };
        this.entities.push(entity);
        return id;
    }

    remove(id) {
        const idx = this.entities.findIndex(e => e.id === id);
        if (idx < 0) return false;
        const e = this.entities[idx];
        const gl = this.gl;
        gl.deleteVertexArray(e.vao);
        gl.deleteBuffer(e.bufPos);
        gl.deleteBuffer(e.bufNorm);
        gl.deleteBuffer(e.bufIdx);
        this.entities.splice(idx, 1);
        return true;
    }

    clear() {
        const n = this.entities.length;
        const gl = this.gl;
        for (const e of this.entities) {
            gl.deleteVertexArray(e.vao);
            gl.deleteBuffer(e.bufPos);
            gl.deleteBuffer(e.bufNorm);
            gl.deleteBuffer(e.bufIdx);
        }
        this.entities = [];
        return n;
    }

    list() {
        return this.entities.map(e => ({
            id:        e.id,
            name:      e.name,
            position:  e.position.slice(),
            rotation:  e.rotation,
            scale:     e.scale,
            color:     e.color.slice(),
            vertCount: e.vertCount,
            triCount:  e.indexCount / 3,
        }));
    }

    /** Update a single entity's transform/color in place. */
    update(id, patch) {
        const e = this.entities.find(ent => ent.id === id);
        if (!e) return false;
        if (patch.position) e.position = patch.position.slice();
        if (patch.rotation !== undefined) e.rotation = patch.rotation;
        if (patch.scale    !== undefined) e.scale    = patch.scale;
        if (patch.color)   e.color    = patch.color.slice();
        if (patch.name)    e.name     = patch.name;
        return true;
    }

    render(camera) {
        if (this.entities.length === 0) return;
        const gl = this.gl;
        gl.useProgram(this.prog);
        gl.uniformMatrix4fv(this.u_view, false, camera.viewMatrix);
        gl.uniformMatrix4fv(this.u_proj, false, camera.projMatrix);
        gl.uniform3f(this.u_lightDir, 0.4, 0.8, 0.5);
        gl.uniform3f(this.u_viewPos,
            camera.position?.x ?? 0,
            camera.position?.y ?? 5,
            camera.position?.z ?? 0);
        gl.enable(gl.DEPTH_TEST);
        // v354 — extract frustum planes once per render call
        const vp = multiplyMat4(camera.projMatrix, camera.viewMatrix);
        const planes = extractFrustumPlanes(vp);
        let drawn = 0, culled = 0;
        for (const e of this.entities) {
            // Frustum cull via transformed bounding sphere
            const [wx, wy, wz, wr] = transformSphere(e.localCenter, e.localRadius, e.position, e.rotation, e.scale);
            if (!sphereInFrustum(wx, wy, wz, wr, planes)) { culled++; continue; }
            drawn++;
            const cos = Math.cos(e.rotation), sin = Math.sin(e.rotation);
            const s = e.scale;
            const model = new Float32Array([
                cos * s, 0,     sin * s, 0,
                0,       s,     0,       0,
                -sin * s, 0,    cos * s, 0,
                e.position[0], e.position[1], e.position[2], 1,
            ]);
            const normalMat = new Float32Array([
                cos, 0, sin,
                0,   1, 0,
                -sin,0, cos,
            ]);
            gl.uniformMatrix4fv(this.u_model, false, model);
            gl.uniformMatrix3fv(this.u_normalMat, false, normalMat);
            gl.uniform3f(this.u_color, e.color[0], e.color[1], e.color[2]);
            gl.bindVertexArray(e.vao);
            gl.drawElements(gl.TRIANGLES, e.indexCount, gl.UNSIGNED_SHORT, 0);
        }
        gl.bindVertexArray(null);
        this._lastCullStats = { drawn, culled, total: this.entities.length };
    }

    /** v354 — get the most recent frustum cull results from render(). */
    getCullStats() {
        return this._lastCullStats || { drawn: 0, culled: 0, total: this.entities.length };
    }

    dispose() {
        this.clear();
        if (this.prog) this.gl.deleteProgram(this.prog);
    }
}
