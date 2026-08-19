// FILE: engine/MtoRenderer.js
// VERSION: v1 — round 351
//
// World-entity renderer for .mto medical tomographic volumes. Each
// sample is rendered as an instanced unit cube, but unlike OvmRenderer
// the cube is shaded by the precomputed smooth gradient normal — not
// the corner's face normal. That makes the volume read as a CT/MRI
// surface render rather than a faceted lego sculpture.
//
// Two coloring modes (a uniform, swapped via setColorMode):
//   "tissue"     — class ID → TISSUE_PALETTE color
//   "intensity"  — greyscale 0-255 from the intensity field (HU-mapped)

import { TISSUE_PALETTE, tissueColor } from "./mtoGenerator.js";
import { extractFrustumPlanes, sphereInFrustum, transformSphere, multiplyMat4 } from "./Frustum.js";
import { bitReverseIndices, applyPermutation, applyPermutation1, computeLodLevel, LOD_FRACTIONS } from "./InstanceLod.js";

// v354 — same int16-coord bounding sphere as OVM, expanded by the
// half-diagonal of one voxel.
function _mtoBoundingSphere(coords, count, voxelScale) {
    if (count === 0) return { localCenter: [0, 0, 0], localRadius: 0 };
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < count; i++) {
        cx += coords[i * 3];
        cy += coords[i * 3 + 1];
        cz += coords[i * 3 + 2];
    }
    cx /= count; cy /= count; cz /= count;
    let maxSq = 0;
    for (let i = 0; i < count; i++) {
        const dx = coords[i * 3]     - cx;
        const dy = coords[i * 3 + 1] - cy;
        const dz = coords[i * 3 + 2] - cz;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq > maxSq) maxSq = dSq;
    }
    return {
        localCenter: [cx * voxelScale, cy * voxelScale, cz * voxelScale],
        localRadius: (Math.sqrt(maxSq) + 0.866) * voxelScale,
    };
}

// v355 — scramble an mto struct so any prefix is uniform
function _scrambleMto(mto, perm) {
    return {
        count: mto.count,
        coords:    applyPermutation(mto.coords,    perm, 3),
        normals:   applyPermutation(mto.normals,   perm, 3),
        intensity: applyPermutation1(mto.intensity, perm),
        classes:   applyPermutation1(mto.classes,   perm),
    };
}

let _nextEntityId = 1;

export function computeMtoColors(mto, mode = "tissue") {
    const out = new Float32Array(mto.count * 3);
    if (mode === "intensity") {
        for (let i = 0; i < mto.count; i++) {
            const v = mto.intensity[i] / 255;
            out[i*3] = v; out[i*3+1] = v; out[i*3+2] = v;
        }
    } else {
        for (let i = 0; i < mto.count; i++) {
            const c = tissueColor(mto.classes[i]);
            out[i*3] = c[0]; out[i*3+1] = c[1]; out[i*3+2] = c[2];
        }
    }
    return out;
}

export class MtoRenderer {
    constructor({ gl }) {
        this.gl = gl;
        this.entities = [];
        this._buildProgram();
        this._buildCubeBuffer();
    }

    _buildProgram() {
        const gl = this.gl;
        const vsSrc = `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_corner_pos;
layout(location = 1) in vec3 i_sample_coord;
layout(location = 2) in vec3 i_smooth_normal;
layout(location = 3) in vec3 i_color;
uniform mat4 u_view;
uniform mat4 u_proj;
uniform mat4 u_model;
uniform mat3 u_normalMat;
uniform float u_voxel_scale;
out vec3 v_world_pos;
out vec3 v_normal;
out vec3 v_color;
void main() {
    vec3 local = (i_sample_coord + a_corner_pos) * u_voxel_scale;
    vec4 wp = u_model * vec4(local, 1.0);
    v_world_pos = wp.xyz;
    // Use the precomputed gradient normal, NOT the cube's face normal.
    // This is the key visual difference vs OvmRenderer — surface
    // samples shade smoothly across the volume.
    v_normal = u_normalMat * i_smooth_normal;
    v_color = i_color;
    gl_Position = u_proj * u_view * wp;
}`;
        const fsSrc = `#version 300 es
precision highp float;
in vec3 v_world_pos;
in vec3 v_normal;
in vec3 v_color;
uniform vec3 u_light_dir;
uniform vec3 u_view_pos;
out vec4 fragColor;
void main() {
    vec3 N = normalize(v_normal);
    float diff = max(dot(N, u_light_dir), 0.0);
    vec3 V = normalize(u_view_pos - v_world_pos);
    vec3 R = reflect(-u_light_dir, N);
    float spec = pow(max(dot(V, R), 0.0), 18.0) * 0.18;
    // Slight rim term — medical renders read better with edge definition
    float rim = pow(1.0 - max(dot(V, N), 0.0), 2.5) * 0.20;
    vec3 ambient = v_color * 0.30;
    vec3 direct  = diff * v_color * 0.80;
    fragColor = vec4(ambient + direct + vec3(spec + rim), 1.0);
}`;
        this.prog = this._link(vsSrc, fsSrc);
        const p = this.prog;
        this.u_view      = gl.getUniformLocation(p, "u_view");
        this.u_proj      = gl.getUniformLocation(p, "u_proj");
        this.u_model     = gl.getUniformLocation(p, "u_model");
        this.u_normalMat = gl.getUniformLocation(p, "u_normalMat");
        this.u_voxelScale= gl.getUniformLocation(p, "u_voxel_scale");
        this.u_lightDir  = gl.getUniformLocation(p, "u_light_dir");
        this.u_viewPos   = gl.getUniformLocation(p, "u_view_pos");
    }

    _link(vsSrc, fsSrc) {
        const gl = this.gl;
        const cmp = (s, t) => {
            const sh = gl.createShader(t);
            gl.shaderSource(sh, s);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error("[MtoRenderer shader] " + gl.getShaderInfoLog(sh));
            return sh;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, cmp(vsSrc, gl.VERTEX_SHADER));
        gl.attachShader(prog, cmp(fsSrc, gl.FRAGMENT_SHADER));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("[MtoRenderer link] " + gl.getProgramInfoLog(prog));
        return prog;
    }

    _buildCubeBuffer() {
        const gl = this.gl;
        const h = 0.5;
        const corners = new Float32Array([
            -h,-h,-h,  h,-h,-h,  -h, h,-h,  h, h,-h,
            -h,-h, h,  h,-h, h,  -h, h, h,  h, h, h,
        ]);
        const indices = new Uint16Array([
            1, 3, 5,   3, 7, 5,    // +X
            0, 4, 2,   4, 6, 2,    // -X
            2, 6, 3,   6, 7, 3,    // +Y
            0, 1, 4,   1, 5, 4,    // -Y
            4, 5, 6,   5, 7, 6,    // +Z
            0, 2, 1,   2, 3, 1,    // -Z
        ]);
        this.bufPos = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
        gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
        this.bufIdx = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIdx);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        this.indexCount = indices.length;
    }

    add({ mto, position = [0, 5, -10], rotation = 0, scale = 1, voxelScale = 1, colorMode = "tissue", name = null }) {
        if (!mto || typeof mto.count !== "number")           throw new Error("MtoRenderer.add: mto must have count");
        if (!(mto.coords    instanceof Int16Array))           throw new Error("MtoRenderer.add: coords must be Int16Array");
        if (!(mto.normals   instanceof Float32Array))         throw new Error("MtoRenderer.add: normals must be Float32Array");
        if (!(mto.intensity instanceof Uint8Array))           throw new Error("MtoRenderer.add: intensity must be Uint8Array");
        if (!(mto.classes   instanceof Uint8Array))           throw new Error("MtoRenderer.add: classes must be Uint8Array");

        const gl = this.gl;
        const id = _nextEntityId++;

        // v355 — bit-reverse permutation so any prefix is a uniform
        // sample subset for LoD. Keep the scrambled mto on the entity
        // so setColorMode recomputes colors in matching order.
        const perm = bitReverseIndices(mto.count);
        const scrambledMto = _scrambleMto(mto, perm);

        // int16 coords → float32 for the shader (lets us share the same
        // attribute pointer schema as MOL/P3D)
        const fcoords = new Float32Array(mto.count * 3);
        for (let i = 0; i < mto.count * 3; i++) fcoords[i] = scrambledMto.coords[i];

        const colors = computeMtoColors(scrambledMto, colorMode);

        const bufCoord  = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bufCoord);
        gl.bufferData(gl.ARRAY_BUFFER, fcoords, gl.STATIC_DRAW);
        const bufNormal = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bufNormal);
        gl.bufferData(gl.ARRAY_BUFFER, scrambledMto.normals, gl.STATIC_DRAW);
        const bufColor  = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bufColor);
        gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);   // dynamic: mode swap

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufCoord);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(1, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufNormal);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(2, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufColor);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(3, 1);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIdx);
        gl.bindVertexArray(null);

        const entity = {
            id,
            name: name || `mto-${id}`,
            position: position.slice(),
            rotation,
            scale,
            voxelScale,
            colorMode,
            mto: scrambledMto,   // v355 — scrambled for LoD prefix uniformity
            vao, bufCoord, bufNormal, bufColor,
            sampleCount: mto.count,
            ..._mtoBoundingSphere(scrambledMto.coords, mto.count, voxelScale),
            lodEnabled: true,    // v355
            createdAt: Date.now(),
        };
        this.entities.push(entity);
        return id;
    }

    setColorMode(id, mode) {
        const e = this.entities.find(ent => ent.id === id);
        if (!e) return false;
        if (mode !== "tissue" && mode !== "intensity") return false;
        e.colorMode = mode;
        const colors = computeMtoColors(e.mto, mode);
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, e.bufColor);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, colors);
        return true;
    }

    remove(id) {
        const idx = this.entities.findIndex(e => e.id === id);
        if (idx < 0) return false;
        const e = this.entities[idx];
        const gl = this.gl;
        gl.deleteVertexArray(e.vao);
        gl.deleteBuffer(e.bufCoord);
        gl.deleteBuffer(e.bufNormal);
        gl.deleteBuffer(e.bufColor);
        this.entities.splice(idx, 1);
        return true;
    }

    clear() {
        const n = this.entities.length;
        const gl = this.gl;
        for (const e of this.entities) {
            gl.deleteVertexArray(e.vao);
            gl.deleteBuffer(e.bufCoord);
            gl.deleteBuffer(e.bufNormal);
            gl.deleteBuffer(e.bufColor);
        }
        this.entities = [];
        return n;
    }

    list() {
        return this.entities.map(e => ({
            id: e.id, name: e.name,
            position: e.position.slice(), rotation: e.rotation,
            scale: e.scale, voxelScale: e.voxelScale,
            colorMode: e.colorMode, sampleCount: e.sampleCount,
        }));
    }

    update(id, patch) {
        const e = this.entities.find(ent => ent.id === id);
        if (!e) return false;
        if (patch.position) e.position = patch.position.slice();
        if (patch.rotation !== undefined)   e.rotation = patch.rotation;
        if (patch.scale !== undefined)      e.scale = patch.scale;
        if (patch.voxelScale !== undefined) e.voxelScale = patch.voxelScale;
        if (patch.name)     e.name = patch.name;
        if (patch.colorMode) this.setColorMode(id, patch.colorMode);
        return true;
    }

    render(camera) {
        if (this.entities.length === 0) return;
        const gl = this.gl;
        gl.useProgram(this.prog);
        gl.uniformMatrix4fv(this.u_view, false, camera.viewMatrix);
        gl.uniformMatrix4fv(this.u_proj, false, camera.projMatrix);
        gl.uniform3f(this.u_lightDir, 0.4, 0.8, 0.5);
        gl.uniform3f(this.u_viewPos, camera.position?.x ?? 0, camera.position?.y ?? 5, camera.position?.z ?? 0);
        gl.enable(gl.DEPTH_TEST);
        const vp = multiplyMat4(camera.projMatrix, camera.viewMatrix);
        const planes = extractFrustumPlanes(vp);
        const camX = camera.position?.x ?? 0;
        const camY = camera.position?.y ?? 5;
        const camZ = camera.position?.z ?? 0;
        let drawn = 0, culled = 0;
        const lodHist = [0, 0, 0, 0];
        for (const e of this.entities) {
            const [wx, wy, wz, wr] = transformSphere(e.localCenter, e.localRadius, e.position, e.rotation, e.scale);
            if (!sphereInFrustum(wx, wy, wz, wr, planes)) { culled++; continue; }
            const dx = wx - camX, dy = wy - camY, dz = wz - camZ;
            const dist = Math.hypot(dx, dy, dz);
            const lod = e.lodEnabled ? computeLodLevel(dist, wr) : 0;
            const instCount = Math.max(1, Math.floor(e.sampleCount * LOD_FRACTIONS[lod]));
            lodHist[lod]++;
            drawn++;
            const cos = Math.cos(e.rotation), sin = Math.sin(e.rotation);
            const s = e.scale;
            const model = new Float32Array([
                cos * s, 0, sin * s, 0,
                0, s, 0, 0,
                -sin * s, 0, cos * s, 0,
                e.position[0], e.position[1], e.position[2], 1,
            ]);
            const normalMat = new Float32Array([
                cos, 0, sin,
                0, 1, 0,
                -sin, 0, cos,
            ]);
            gl.uniformMatrix4fv(this.u_model, false, model);
            gl.uniformMatrix3fv(this.u_normalMat, false, normalMat);
            gl.uniform1f(this.u_voxelScale, e.voxelScale);
            gl.bindVertexArray(e.vao);
            gl.drawElementsInstanced(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0, instCount);
        }
        gl.bindVertexArray(null);
        this._lastCullStats = { drawn, culled, total: this.entities.length, lodHist };
    }

    getCullStats() {
        return this._lastCullStats || { drawn: 0, culled: 0, total: this.entities.length, lodHist: [0,0,0,0] };
    }

    setLodEnabled(enabled) {
        for (const e of this.entities) e.lodEnabled = !!enabled;
    }

    dispose() {
        const gl = this.gl;
        this.clear();
        if (this.prog)   gl.deleteProgram(this.prog);
        if (this.bufPos) gl.deleteBuffer(this.bufPos);
        if (this.bufIdx) gl.deleteBuffer(this.bufIdx);
    }
}
