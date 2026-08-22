// FILE: engine/OvmRenderer.js
// VERSION: v1 — round 349
//
// World-entity renderer for .ovm sparse voxel assets. Parallel to
// SplatRenderer and P3dRenderer. Each loaded asset becomes an entity
// with its own instance buffers + transform; all entities share one
// shader program.
//
// Pipeline features kept from the v345/v346 demo renderer:
//   - Indexed cube (8 unique corners + 36 indices) so gl_VertexID
//     returns the corner index for AO lookup
//   - Per-instance shape_offset displaces the cube (dual-grid)
//   - Per-instance RGBA PBR material
//   - Per-instance uint32 AO bitmask (8 corners × 4 bits)
//
// Pipeline features intentionally SIMPLIFIED for world rendering:
//   - No per-entity shadow framebuffer. The main world has its own
//     shadow system (TEXTURE3); we don't want to duplicate that work
//     per OVM entity. AO alone gives the crevice-darkening that makes
//     the dual-grid look read correctly.
//   - No PCF shadow lookups in the fragment shader. The demo had them
//     because it ran in exclusive isolation against a 1024² depth FBO
//     dedicated to one asset.
//
// API (also exposed at window.ovm):
//   add({ asset, position?, rotation?, scale?, voxelScale?, tint?, name? }) → id
//   remove(id) → boolean
//   clear() → number removed
//   list() → [{ id, name, position, ... }]
//   update(id, patch) → boolean
//   render(camera) → void

import { computeAOBitmasks } from "./ovmGenerator.js";
import { extractFrustumPlanes, sphereInFrustum, computeBoundingSphere, transformSphere, multiplyMat4 } from "./Frustum.js";
import { bitReverseIndices, applyPermutation, applyPermutation1, computeLodLevel, LOD_FRACTIONS, LOD_LEVELS } from "./InstanceLod.js";

let _nextEntityId = 1;

// v354 — compute bounding sphere for an .ovm asset (int16 coords).
// Centroid + max distance, then add the half-diagonal of one voxel
// (sqrt(3)/2 ≈ 0.866) so edge voxels don't pop on culling boundaries.
function _ovmBoundingSphere(coords, count, voxelScale) {
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

export class OvmRenderer {
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
layout(location = 1) in vec3 a_corner_normal;
layout(location = 2) in vec3 i_spatial_coord;
layout(location = 3) in vec3 i_shape_offset;
layout(location = 4) in vec4 i_pbr_material;
layout(location = 5) in uint i_ao_bitmask;

uniform mat4 u_view;
uniform mat4 u_proj;
uniform mat4 u_model;
uniform mat3 u_normalMat;
uniform float u_voxel_scale;

out vec3 v_world_pos;
out vec3 v_normal;
out vec4 v_pbr_material;
out float v_ao;

void main() {
    vec3 deformed = a_corner_pos + i_shape_offset;
    vec3 local_pos = (deformed + i_spatial_coord) * u_voxel_scale;
    vec4 wp = u_model * vec4(local_pos, 1.0);
    v_world_pos    = wp.xyz;
    v_normal       = u_normalMat * a_corner_normal;
    v_pbr_material = i_pbr_material;

    int corner_idx = gl_VertexID & 7;
    uint shifted = i_ao_bitmask >> (uint(corner_idx) * 4u);
    float ao_score = float(shifted & 0x3u);  // 0..3
    v_ao = 0.25 + (ao_score / 3.0) * 0.75;    // [0.25, 1.0]

    gl_Position = u_proj * u_view * wp;
}`;
        const fsSrc = `#version 300 es
precision highp float;
in vec3 v_world_pos;
in vec3 v_normal;
in vec4 v_pbr_material;
in float v_ao;

uniform vec3 u_light_dir;
uniform vec3 u_tint;
uniform vec3 u_view_pos;

out vec4 fragColor;

void main() {
    if (v_pbr_material.a < 0.05) discard;
    vec3 N = normalize(v_normal);
    float diff = max(dot(N, u_light_dir), 0.0);
    vec3 base = v_pbr_material.rgb * u_tint;
    vec3 ambient = (0.3 * v_ao) * base;
    vec3 direct  = diff * base * (0.5 + 0.5 * v_ao);
    // Soft spec for some pop on smooth surfaces
    vec3 V = normalize(u_view_pos - v_world_pos);
    vec3 R = reflect(-u_light_dir, N);
    float spec = pow(max(dot(V, R), 0.0), 24.0) * 0.10;
    fragColor = vec4(ambient + direct + vec3(spec), 1.0);
}`;
        this.prog = this._link(vsSrc, fsSrc);
        const p = this.prog;
        this.u_view      = gl.getUniformLocation(p, "u_view");
        this.u_proj      = gl.getUniformLocation(p, "u_proj");
        this.u_model     = gl.getUniformLocation(p, "u_model");
        this.u_normalMat = gl.getUniformLocation(p, "u_normalMat");
        this.u_voxelScale = gl.getUniformLocation(p, "u_voxel_scale");
        this.u_lightDir   = gl.getUniformLocation(p, "u_light_dir");
        this.u_tint       = gl.getUniformLocation(p, "u_tint");
        this.u_viewPos    = gl.getUniformLocation(p, "u_view_pos");
    }

    _link(vsSrc, fsSrc) {
        const gl = this.gl;
        const cmp = (s, t) => {
            const sh = gl.createShader(t);
            gl.shaderSource(sh, s);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                throw new Error("[OvmRenderer shader] " + gl.getShaderInfoLog(sh));
            }
            return sh;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, cmp(vsSrc, gl.VERTEX_SHADER));
        gl.attachShader(prog, cmp(fsSrc, gl.FRAGMENT_SHADER));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error("[OvmRenderer link] " + gl.getProgramInfoLog(prog));
        }
        return prog;
    }

    _buildCubeBuffer() {
        const gl = this.gl;
        const h = 0.5;
        // 8 corners — index = bit0:X, bit1:Y, bit2:Z (matches the AO bitmask scheme)
        const corners = [
            -h, -h, -h,    h, -h, -h,
            -h,  h, -h,    h,  h, -h,
            -h, -h,  h,    h, -h,  h,
            -h,  h,  h,    h,  h,  h,
        ];
        const inv = 1 / Math.sqrt(3);
        const normals = [
            -inv,-inv,-inv,  inv,-inv,-inv,
            -inv, inv,-inv,  inv, inv,-inv,
            -inv,-inv, inv,  inv,-inv, inv,
            -inv, inv, inv,  inv, inv, inv,
        ];
        // 36 indices — 12 triangles, CCW from outside
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
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(corners), gl.STATIC_DRAW);
        this.bufNorm = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNorm);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
        this.bufIdx = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIdx);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        this.indexCount = indices.length;
    }

    /**
     * Add a sparse voxel asset as a world entity.
     *
     * @param {object} opts
     * @param {{count, coords, offsets, materials, aoBitmasks?}} opts.asset
     * @param {[x,y,z]}                              opts.position
     * @param {number}                               opts.rotation (radians around Y)
     * @param {number}                               opts.scale (uniform world scale)
     * @param {number}                               opts.voxelScale (per-voxel size, default 1)
     * @param {[r,g,b]}                              opts.tint (multiplied with material color)
     * @param {string}                               opts.name
     * @returns {number} entity ID
     */
    add({ asset, position = [0, 5, -10], rotation = 0, scale = 1, voxelScale = 1, tint = [1, 1, 1], name = null }) {
        if (!asset || typeof asset.count !== "number")             throw new Error("OvmRenderer.add: asset must have count");
        if (!(asset.coords instanceof Int16Array))                  throw new Error("OvmRenderer.add: asset.coords must be Int16Array");
        if (!(asset.offsets instanceof Float32Array))               throw new Error("OvmRenderer.add: asset.offsets must be Float32Array");
        if (!(asset.materials instanceof Uint8Array))               throw new Error("OvmRenderer.add: asset.materials must be Uint8Array");

        const gl = this.gl;
        const id = _nextEntityId++;

        // v355 — scramble instance order via bit-reversal so any prefix
        // (LoD subset) is a visually uniform sample of the full asset.
        const perm = bitReverseIndices(asset.count);
        const scrambledCoords = applyPermutation(asset.coords,    perm, 3);
        const scrambledOffsets = applyPermutation(asset.offsets,   perm, 3);
        const scrambledMaterials = applyPermutation(asset.materials, perm, 4);

        // Convert int16 coords to float32 for the shader (no integer
        // attribute plumbing — keeps API simple, small assets only)
        const fcoords = new Float32Array(asset.count * 3);
        for (let i = 0; i < asset.count * 3; i++) fcoords[i] = scrambledCoords[i];

        // AO bitmasks: use provided, else compute on the fly from coords.
        // Computed AO must match the SCRAMBLED coord order, so compute
        // from scrambledCoords; if the user provided pre-baked AO,
        // permute it to match.
        const ao = asset.aoBitmasks instanceof Uint32Array
            ? applyPermutation1(asset.aoBitmasks, perm)
            : computeAOBitmasks(scrambledCoords, asset.count);

        const bufCoord    = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bufCoord);
        gl.bufferData(gl.ARRAY_BUFFER, fcoords, gl.STATIC_DRAW);
        const bufOffset   = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bufOffset);
        gl.bufferData(gl.ARRAY_BUFFER, scrambledOffsets, gl.STATIC_DRAW);
        const bufMaterial = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bufMaterial);
        gl.bufferData(gl.ARRAY_BUFFER, scrambledMaterials, gl.STATIC_DRAW);
        const bufAO       = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bufAO);
        gl.bufferData(gl.ARRAY_BUFFER, ao, gl.STATIC_DRAW);

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNorm);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufCoord);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(2, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufOffset);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(3, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufMaterial);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, 0, 0);   // normalized → [0,1]
        gl.vertexAttribDivisor(4, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufAO);
        gl.enableVertexAttribArray(5);
        gl.vertexAttribIPointer(5, 1, gl.UNSIGNED_INT, 0, 0);          // integer attr
        gl.vertexAttribDivisor(5, 1);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIdx);
        gl.bindVertexArray(null);

        const entity = {
            id,
            name: name || `ovm-${id}`,
            position: position.slice(),
            rotation,
            scale,
            voxelScale,
            tint: tint.slice(),
            vao,
            bufCoord,
            bufOffset,
            bufMaterial,
            bufAO,
            voxelCount: asset.count,
            // v354 — bounding sphere over int16 coords, expanded by half
            // the cube diagonal so we don't cull voxels at the edges.
            ..._ovmBoundingSphere(scrambledCoords, asset.count, voxelScale),
            // v355 — LoD enabled by default
            lodEnabled: true,
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
        gl.deleteBuffer(e.bufCoord);
        gl.deleteBuffer(e.bufOffset);
        gl.deleteBuffer(e.bufMaterial);
        gl.deleteBuffer(e.bufAO);
        this.entities.splice(idx, 1);
        return true;
    }

    clear() {
        const n = this.entities.length;
        const gl = this.gl;
        for (const e of this.entities) {
            gl.deleteVertexArray(e.vao);
            gl.deleteBuffer(e.bufCoord);
            gl.deleteBuffer(e.bufOffset);
            gl.deleteBuffer(e.bufMaterial);
            gl.deleteBuffer(e.bufAO);
        }
        this.entities = [];
        return n;
    }

    list() {
        return this.entities.map(e => ({
            id:         e.id,
            name:       e.name,
            position:   e.position.slice(),
            rotation:   e.rotation,
            scale:      e.scale,
            voxelScale: e.voxelScale,
            tint:       e.tint.slice(),
            voxelCount: e.voxelCount,
        }));
    }

    update(id, patch) {
        const e = this.entities.find(ent => ent.id === id);
        if (!e) return false;
        if (patch.position)   e.position = patch.position.slice();
        if (patch.rotation !== undefined)   e.rotation = patch.rotation;
        if (patch.scale !== undefined)      e.scale = patch.scale;
        if (patch.voxelScale !== undefined) e.voxelScale = patch.voxelScale;
        if (patch.tint)       e.tint = patch.tint.slice();
        if (patch.name)       e.name = patch.name;
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
        // v354 frustum culling + v355 LoD
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
            // LoD: bigger distance / smaller radius → coarser LoD
            const dx = wx - camX, dy = wy - camY, dz = wz - camZ;
            const dist = Math.hypot(dx, dy, dz);
            const lod = e.lodEnabled ? computeLodLevel(dist, wr) : 0;
            const instCount = Math.max(1, Math.floor(e.voxelCount * LOD_FRACTIONS[lod]));
            lodHist[lod]++;
            drawn++;
            const cos = Math.cos(e.rotation), sin = Math.sin(e.rotation);
            const s = e.scale;
            const model = new Float32Array([
                cos * s, 0,        sin * s, 0,
                0,       s,        0,       0,
                -sin * s, 0,       cos * s, 0,
                e.position[0], e.position[1], e.position[2], 1,
            ]);
            const normalMat = new Float32Array([
                cos, 0, sin,
                0,   1, 0,
                -sin,0, cos,
            ]);
            gl.uniformMatrix4fv(this.u_model, false, model);
            gl.uniformMatrix3fv(this.u_normalMat, false, normalMat);
            gl.uniform1f(this.u_voxelScale, e.voxelScale);
            gl.uniform3f(this.u_tint, e.tint[0], e.tint[1], e.tint[2]);
            gl.bindVertexArray(e.vao);
            gl.drawElementsInstanced(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0, instCount);
        }
        gl.bindVertexArray(null);
        this._lastCullStats = { drawn, culled, total: this.entities.length, lodHist };
    }

    getCullStats() {
        return this._lastCullStats || { drawn: 0, culled: 0, total: this.entities.length, lodHist: [0,0,0,0] };
    }

    /** v355 — globally toggle LoD on/off for all entities */
    setLodEnabled(enabled) {
        for (const e of this.entities) e.lodEnabled = !!enabled;
    }

    dispose() {
        const gl = this.gl;
        this.clear();
        if (this.prog)    gl.deleteProgram(this.prog);
        if (this.bufPos)  gl.deleteBuffer(this.bufPos);
        if (this.bufNorm) gl.deleteBuffer(this.bufNorm);
        if (this.bufIdx)  gl.deleteBuffer(this.bufIdx);
    }
}
