// FILE: engine/MolRenderer.js
// VERSION: v1 — round 350
//
// Molecular structure renderer. Each atom is an instance of a small
// shared icosphere (8-subdivision-0 = 20 triangles, plenty for sphere
// silhouettes at typical viewing distances). Per-instance attributes:
//
//   atom position (xyz)        — float32 × 3
//   atom radius                — float32 (looked up from VDW table)
//   atom color (rgb)           — float32 × 3
//
// Coloring mode is a uniform, not a per-atom attribute, so toggling
// between CPK and pLDDT just changes how the per-instance color is
// computed at upload time. Re-uploading is cheap (one bufferSubData
// per entity per mode change).

import { CPK_COLORS, VDW_RADIUS } from "./molGenerator.js";
import { extractFrustumPlanes, sphereInFrustum, computeBoundingSphere, transformSphere, multiplyMat4 } from "./Frustum.js";
import { bitReverseIndices, applyPermutation, applyPermutation1, computeLodLevel, LOD_FRACTIONS } from "./InstanceLod.js";

// v354 — bounding sphere over atom positions, expanded by the largest
// rendered atom radius (so VDW spheres don't pop at frustum edges).
function _molBoundingSphere(mol, atomScale, radii) {
    const { center, radius } = computeBoundingSphere(mol.positions, mol.count);
    let maxR = 0;
    for (let i = 0; i < mol.count; i++) if (radii[i] > maxR) maxR = radii[i];
    return { localCenter: center, localRadius: radius + maxR };
}

// v355 — apply a bit-reversal permutation to a mol struct so any
// prefix is a visually uniform atom subset.
function _scrambleMol(mol, perm) {
    return {
        count: mol.count,
        positions: applyPermutation(mol.positions, perm, 3),
        fields:    applyPermutation(mol.fields,    perm, 2),
        elements:  applyPermutation(mol.elements,  perm, 4),
    };
}

let _nextEntityId = 1;

/** Build a low-poly icosphere (20 tris, 12 vertices — base icosahedron). */
function buildIcosphere() {
    const t = (1 + Math.sqrt(5)) / 2;
    const verts = [
        [-1, t, 0], [ 1, t, 0], [-1,-t, 0], [ 1,-t, 0],
        [ 0,-1, t], [ 0, 1, t], [ 0,-1,-t], [ 0, 1,-t],
        [ t, 0,-1], [ t, 0, 1], [-t, 0,-1], [-t, 0, 1],
    ];
    const positions = new Float32Array(12 * 3);
    const normals   = new Float32Array(12 * 3);
    for (let i = 0; i < 12; i++) {
        const v = verts[i];
        const L = Math.hypot(v[0], v[1], v[2]);
        positions[i*3]   = v[0] / L;
        positions[i*3+1] = v[1] / L;
        positions[i*3+2] = v[2] / L;
        // Normal = position direction (unit sphere)
        normals[i*3]   = v[0] / L;
        normals[i*3+1] = v[1] / L;
        normals[i*3+2] = v[2] / L;
    }
    const indices = new Uint16Array([
        0,11,5,  0,5,1,   0,1,7,   0,7,10,  0,10,11,
        1,5,9,   5,11,4,  11,10,2, 10,7,6,  7,1,8,
        3,9,4,   3,4,2,   3,2,6,   3,6,8,   3,8,9,
        4,9,5,   2,4,11,  6,2,10,  8,6,7,   9,8,1,
    ]);
    return { positions, normals, indices };
}

/**
 * Compute per-instance color array given the molecule's element + field
 * data and a coloring mode.
 *
 *   "cpk"   — element-based (CPK palette via CPK_COLORS)
 *   "plddt" — pLDDT confidence (red=low, blue=high). AlphaFold convention.
 *
 * @returns Float32Array(count * 3) ready for bufferSubData upload.
 */
export function computeAtomColors(mol, mode = "cpk") {
    const out = new Float32Array(mol.count * 3);
    if (mode === "plddt") {
        // pLDDT scale (0-100): >90 dark blue, 70-90 light blue, 50-70 yellow,
        // <50 orange/red. AlphaFold's published color ramp.
        for (let i = 0; i < mol.count; i++) {
            const p = Math.max(0, Math.min(100, mol.fields[i * 2]));
            let r, g, b;
            if (p > 90)      { r = 0.00; g = 0.31; b = 0.73; }   // dark blue
            else if (p > 70) { r = 0.40; g = 0.78; b = 0.93; }   // light blue
            else if (p > 50) { r = 1.00; g = 0.86; b = 0.27; }   // yellow
            else             { r = 1.00; g = 0.49; b = 0.27; }   // orange-red
            out[i*3] = r; out[i*3+1] = g; out[i*3+2] = b;
        }
    } else {
        // CPK by element
        for (let i = 0; i < mol.count; i++) {
            const eid = mol.elements[i * 4];
            const col = CPK_COLORS[eid] || CPK_COLORS[0];
            out[i*3] = col[0]; out[i*3+1] = col[1]; out[i*3+2] = col[2];
        }
    }
    return out;
}

/** Per-instance radii array, indexed by element ID. */
export function computeAtomRadii(mol, scale = 1.0) {
    const out = new Float32Array(mol.count);
    for (let i = 0; i < mol.count; i++) {
        const eid = mol.elements[i * 4];
        out[i] = (VDW_RADIUS[eid] || VDW_RADIUS[0]) * scale;
    }
    return out;
}

export class MolRenderer {
    constructor({ gl }) {
        this.gl = gl;
        this.entities = [];
        this._buildProgram();
        this._buildSphereBuffer();
    }

    _buildProgram() {
        const gl = this.gl;
        const vsSrc = `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_sphere_pos;
layout(location = 1) in vec3 a_sphere_normal;
layout(location = 2) in vec3 i_atom_pos;
layout(location = 3) in float i_atom_radius;
layout(location = 4) in vec3 i_atom_color;

uniform mat4 u_view;
uniform mat4 u_proj;
uniform mat4 u_model;
uniform mat3 u_normalMat;

out vec3 v_world_pos;
out vec3 v_normal;
out vec3 v_color;

void main() {
    vec3 local = i_atom_pos + a_sphere_pos * i_atom_radius;
    vec4 wp = u_model * vec4(local, 1.0);
    v_world_pos = wp.xyz;
    v_normal = u_normalMat * a_sphere_normal;
    v_color = i_atom_color;
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
    // Specular pop — molecules look better with a hint of glossiness
    vec3 V = normalize(u_view_pos - v_world_pos);
    vec3 R = reflect(-u_light_dir, N);
    float spec = pow(max(dot(V, R), 0.0), 32.0) * 0.35;
    // Slight rim term for definition against dark backgrounds
    float rim = pow(1.0 - max(dot(V, N), 0.0), 2.0) * 0.15;
    vec3 ambient = v_color * 0.25;
    vec3 direct  = diff * v_color * 0.85;
    fragColor = vec4(ambient + direct + vec3(spec + rim), 1.0);
}`;
        this.prog = this._link(vsSrc, fsSrc);
        const p = this.prog;
        this.u_view      = gl.getUniformLocation(p, "u_view");
        this.u_proj      = gl.getUniformLocation(p, "u_proj");
        this.u_model     = gl.getUniformLocation(p, "u_model");
        this.u_normalMat = gl.getUniformLocation(p, "u_normalMat");
        this.u_lightDir  = gl.getUniformLocation(p, "u_light_dir");
        this.u_viewPos   = gl.getUniformLocation(p, "u_view_pos");
    }

    _link(vsSrc, fsSrc) {
        const gl = this.gl;
        const cmp = (s, t) => {
            const sh = gl.createShader(t);
            gl.shaderSource(sh, s);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                throw new Error("[MolRenderer shader] " + gl.getShaderInfoLog(sh));
            }
            return sh;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, cmp(vsSrc, gl.VERTEX_SHADER));
        gl.attachShader(prog, cmp(fsSrc, gl.FRAGMENT_SHADER));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error("[MolRenderer link] " + gl.getProgramInfoLog(prog));
        }
        return prog;
    }

    _buildSphereBuffer() {
        const gl = this.gl;
        const { positions, normals, indices } = buildIcosphere();
        this.bufPos = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        this.bufNorm = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNorm);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
        this.bufIdx = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIdx);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        this.indexCount = indices.length;
    }

    /**
     * Add a molecule as a world entity.
     *
     * @param {object} opts
     * @param {{count, positions, fields, elements}} opts.mol
     * @param {[x,y,z]} opts.position
     * @param {number}  opts.rotation
     * @param {number}  opts.scale         entity scale (world)
     * @param {number}  opts.atomScale     per-atom radius multiplier (default 0.4 — gives space-fill style)
     * @param {"cpk"|"plddt"} opts.colorMode
     * @param {string}  opts.name
     */
    add({ mol, position = [0, 5, -10], rotation = 0, scale = 1, atomScale = 0.4, colorMode = "cpk", name = null }) {
        if (!mol || typeof mol.count !== "number")          throw new Error("MolRenderer.add: mol must have count");
        if (!(mol.positions instanceof Float32Array))        throw new Error("MolRenderer.add: positions must be Float32Array");
        if (!(mol.fields    instanceof Float32Array))        throw new Error("MolRenderer.add: fields must be Float32Array");
        if (!(mol.elements  instanceof Uint8Array))          throw new Error("MolRenderer.add: elements must be Uint8Array");

        const gl = this.gl;
        const id = _nextEntityId++;

        // v355 — bit-reverse permutation so any prefix is a uniform
        // atom subset for LoD. Keep the scrambled mol on the entity
        // so setColorMode recomputes colors in the matching order.
        const perm = bitReverseIndices(mol.count);
        const scrambledMol = _scrambleMol(mol, perm);
        const colors = computeAtomColors(scrambledMol, colorMode);
        const radii  = computeAtomRadii(scrambledMol, atomScale);

        const bufAtomPos = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bufAtomPos);
        gl.bufferData(gl.ARRAY_BUFFER, scrambledMol.positions, gl.STATIC_DRAW);
        const bufAtomRadius = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bufAtomRadius);
        gl.bufferData(gl.ARRAY_BUFFER, radii, gl.STATIC_DRAW);
        const bufAtomColor = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bufAtomColor);
        gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);   // dynamic: color mode swaps

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNorm);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufAtomPos);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(2, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufAtomRadius);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(3, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufAtomColor);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(4, 1);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIdx);
        gl.bindVertexArray(null);

        const entity = {
            id,
            name: name || `mol-${id}`,
            position: position.slice(),
            rotation,
            scale,
            atomScale,
            colorMode,
            mol: scrambledMol,   // v355 — scrambled order so prefix is uniform; setColorMode uses this
            vao,
            bufAtomPos,
            bufAtomRadius,
            bufAtomColor,
            atomCount: mol.count,
            // v354 — sphere over atom positions, expanded by the largest
            // atomic radius so VDW spheres don't pop at the boundary.
            ..._molBoundingSphere(scrambledMol, atomScale, radii),
            // v355 — LoD enabled by default
            lodEnabled: true,
            createdAt: Date.now(),
        };
        this.entities.push(entity);
        return id;
    }

    /** Switch an entity's color mode. Re-uploads the color buffer only. */
    setColorMode(id, mode) {
        const e = this.entities.find(ent => ent.id === id);
        if (!e) return false;
        if (mode !== "cpk" && mode !== "plddt") return false;
        e.colorMode = mode;
        const colors = computeAtomColors(e.mol, mode);
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, e.bufAtomColor);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, colors);
        return true;
    }

    remove(id) {
        const idx = this.entities.findIndex(e => e.id === id);
        if (idx < 0) return false;
        const e = this.entities[idx];
        const gl = this.gl;
        gl.deleteVertexArray(e.vao);
        gl.deleteBuffer(e.bufAtomPos);
        gl.deleteBuffer(e.bufAtomRadius);
        gl.deleteBuffer(e.bufAtomColor);
        this.entities.splice(idx, 1);
        return true;
    }

    clear() {
        const n = this.entities.length;
        const gl = this.gl;
        for (const e of this.entities) {
            gl.deleteVertexArray(e.vao);
            gl.deleteBuffer(e.bufAtomPos);
            gl.deleteBuffer(e.bufAtomRadius);
            gl.deleteBuffer(e.bufAtomColor);
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
            atomScale: e.atomScale,
            colorMode: e.colorMode,
            atomCount: e.atomCount,
        }));
    }

    update(id, patch) {
        const e = this.entities.find(ent => ent.id === id);
        if (!e) return false;
        if (patch.position)   e.position = patch.position.slice();
        if (patch.rotation !== undefined) e.rotation = patch.rotation;
        if (patch.scale !== undefined)    e.scale = patch.scale;
        if (patch.name)       e.name = patch.name;
        if (patch.colorMode)  this.setColorMode(id, patch.colorMode);
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
            const instCount = Math.max(1, Math.floor(e.atomCount * LOD_FRACTIONS[lod]));
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
