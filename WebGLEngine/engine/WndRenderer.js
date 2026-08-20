// FILE: engine/WndRenderer.js
// VERSION: v1 — round 353
//
// World-entity renderer for .wnd 3D fluid fields. Architecturally
// different from MOL/MTO/OVM/P3D — those are instanced geometry, this
// is *volume raymarching* through a 3D texture.
//
// Each entity owns one gl.TEXTURE_3D holding the RGBA32F velocity
// field plus a unit cube (used as the raymarching bounding box). The
// fragment shader steps along each view ray, samples the volume, and
// accumulates color/alpha via front-to-back compositing.
//
// Two display modes (uniform u_mode, no buffer re-upload needed):
//   "magnitude" — heatmap of ‖velocity‖ (the magnitudeToColor ramp)
//   "vector"    — color = normalized velocity (R=u+, G=v+, B=w+)
//
// v354 — frustum culling: unit cube has radius sqrt(3)/2 ≈ 0.866 in
// local space, scaled by entity.scale.

import { extractFrustumPlanes, sphereInFrustum, transformSphere, multiplyMat4 } from "./Frustum.js";

const WND_LOCAL_CENTER = [0, 0, 0];
const WND_LOCAL_RADIUS = 0.866;   // half-diagonal of unit cube

let _nextEntityId = 1;

export class WndRenderer {
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
uniform mat4 u_view;
uniform mat4 u_proj;
uniform mat4 u_model;
out vec3 v_local_pos;
void main() {
    v_local_pos = a_corner_pos;   // [-0.5, 0.5] cube
    gl_Position = u_proj * u_view * u_model * vec4(a_corner_pos, 1.0);
}`;
        // Raymarcher. ~48 steps gives decent quality without melting the GPU
        // on integrated graphics; bumped up the count if we want crisper
        // detail at the cost of fragment-shader time.
        const fsSrc = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec3 v_local_pos;
uniform sampler3D u_volume;
uniform vec3 u_cam_local;     // camera position in cube-local coords (-0.5..0.5)
uniform float u_max_mag;       // expected max magnitude (for normalization)
uniform int u_mode;            // 0 = magnitude heatmap, 1 = vector RGB
uniform int u_steps;
uniform float u_density;       // 0..1, how much each sample contributes

out vec4 fragColor;

// magnitudeToColor — must match the JS-side ramp in wndGenerator.js
vec3 magnitudeToColor(float m) {
    m = clamp(m, 0.0, 1.0);
    if      (m < 0.2) { float t = m / 0.2;        return vec3(0.0, t * 0.7,        0.4 + t * 0.6); }
    else if (m < 0.4) { float t = (m - 0.2) / 0.2; return vec3(0.0, 0.7 + t * 0.3,  1.0 - t * 0.7); }
    else if (m < 0.6) { float t = (m - 0.4) / 0.2; return vec3(t,   1.0,            0.3 - t * 0.3); }
    else if (m < 0.8) { float t = (m - 0.6) / 0.2; return vec3(1.0, 1.0 - t * 0.5,  0.0); }
    else              { float t = (m - 0.8) / 0.2; return vec3(1.0, 0.5 - t * 0.5,  0.0); }
}

void main() {
    vec3 dir = normalize(v_local_pos - u_cam_local);
    // Ray-cube intersection (slab method) — find entry/exit t values.
    vec3 invDir = 1.0 / dir;
    vec3 tMin = (vec3(-0.5) - u_cam_local) * invDir;
    vec3 tMax = (vec3( 0.5) - u_cam_local) * invDir;
    vec3 t1 = min(tMin, tMax);
    vec3 t2 = max(tMin, tMax);
    float tEntry = max(max(t1.x, t1.y), t1.z);
    float tExit  = min(min(t2.x, t2.y), t2.z);
    if (tExit < max(tEntry, 0.0)) discard;
    tEntry = max(tEntry, 0.0);

    vec4 accum = vec4(0.0);
    int steps = max(8, u_steps);
    float dt = (tExit - tEntry) / float(steps);
    vec3 p = u_cam_local + dir * tEntry;
    vec3 stepVec = dir * dt;
    for (int i = 0; i < 128; i++) {
        if (i >= steps) break;
        vec3 uvw = p + 0.5;   // [-0.5..0.5] → [0..1] for sampler3D
        vec4 sampled = texture(u_volume, uvw);
        float mag = length(sampled.rgb) / max(u_max_mag, 0.001);

        vec3 color;
        if (u_mode == 1) {
            // Vector mode: signed velocity components mapped to color
            color = sampled.rgb / max(u_max_mag, 0.001) * 0.5 + 0.5;
        } else {
            color = magnitudeToColor(mag);
        }

        // Density gating — skip near-zero samples to keep the volume
        // visually airy rather than a solid blue cube of low values
        float alpha = clamp(mag * u_density, 0.0, 1.0) * 0.06;
        accum.rgb += color * alpha * (1.0 - accum.a);
        accum.a   += alpha * (1.0 - accum.a);
        if (accum.a > 0.95) break;
        p += stepVec;
    }
    if (accum.a < 0.005) discard;
    fragColor = accum;
}`;
        this.prog = this._link(vsSrc, fsSrc);
        const p = this.prog;
        this.u_view     = gl.getUniformLocation(p, "u_view");
        this.u_proj     = gl.getUniformLocation(p, "u_proj");
        this.u_model    = gl.getUniformLocation(p, "u_model");
        this.u_volume   = gl.getUniformLocation(p, "u_volume");
        this.u_camLocal = gl.getUniformLocation(p, "u_cam_local");
        this.u_maxMag   = gl.getUniformLocation(p, "u_max_mag");
        this.u_mode     = gl.getUniformLocation(p, "u_mode");
        this.u_steps    = gl.getUniformLocation(p, "u_steps");
        this.u_density  = gl.getUniformLocation(p, "u_density");
    }

    _link(vsSrc, fsSrc) {
        const gl = this.gl;
        const cmp = (s, t) => {
            const sh = gl.createShader(t);
            gl.shaderSource(sh, s);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                throw new Error("[WndRenderer shader] " + gl.getShaderInfoLog(sh));
            }
            return sh;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, cmp(vsSrc, gl.VERTEX_SHADER));
        gl.attachShader(prog, cmp(fsSrc, gl.FRAGMENT_SHADER));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error("[WndRenderer link] " + gl.getProgramInfoLog(prog));
        }
        return prog;
    }

    _buildCubeBuffer() {
        const gl = this.gl;
        const h = 0.5;
        const corners = new Float32Array([
            -h,-h,-h,  h,-h,-h,
            -h, h,-h,  h, h,-h,
            -h,-h, h,  h,-h, h,
            -h, h, h,  h, h, h,
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

    /**
     * Add a wind field as a world entity.
     *
     * @param {{wnd, position?, rotation?, scale?, mode?, steps?, density?, name?}} opts
     */
    add({ wnd, position = [0, 8, -12], rotation = 0, scale = 6, mode = "magnitude", steps = 48, density = 1.0, name = null }) {
        if (!wnd || typeof wnd.width !== "number")    throw new Error("WndRenderer.add: wnd must have width");
        if (!(wnd.data instanceof Float32Array))       throw new Error("WndRenderer.add: wnd.data must be Float32Array");
        const expected = wnd.width * wnd.height * wnd.depth * 4;
        if (wnd.data.length !== expected) {
            throw new Error(`WndRenderer.add: data length ${wnd.data.length} != ${expected}`);
        }
        const gl = this.gl;
        const id = _nextEntityId++;

        // Compute max magnitude for shader normalization
        let maxMag = 0;
        const voxels = wnd.width * wnd.height * wnd.depth;
        for (let i = 0; i < voxels; i++) {
            const u = wnd.data[i*4], v = wnd.data[i*4+1], w = wnd.data[i*4+2];
            const m = Math.hypot(u, v, w);
            if (m > maxMag) maxMag = m;
        }
        if (maxMag === 0) maxMag = 1;

        // Upload as a 3D RGBA32F texture
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_3D, tex);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.texImage3D(
            gl.TEXTURE_3D, 0, gl.RGBA32F,
            wnd.width, wnd.height, wnd.depth,
            0, gl.RGBA, gl.FLOAT, wnd.data
        );

        // Cube VAO (single attribute, shared geometry already on this.bufPos)
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIdx);
        gl.bindVertexArray(null);

        const entity = {
            id,
            name: name || `wnd-${id}`,
            position: position.slice(),
            rotation, scale,
            mode, steps, density, maxMag,
            width: wnd.width, height: wnd.height, depth: wnd.depth,
            tex, vao,
            createdAt: Date.now(),
        };
        this.entities.push(entity);
        return id;
    }

    setMode(id, mode) {
        const e = this.entities.find(ent => ent.id === id);
        if (!e) return false;
        if (mode !== "magnitude" && mode !== "vector") return false;
        e.mode = mode;
        return true;
    }

    remove(id) {
        const idx = this.entities.findIndex(e => e.id === id);
        if (idx < 0) return false;
        const e = this.entities[idx];
        const gl = this.gl;
        gl.deleteVertexArray(e.vao);
        gl.deleteTexture(e.tex);
        this.entities.splice(idx, 1);
        return true;
    }

    clear() {
        const n = this.entities.length;
        const gl = this.gl;
        for (const e of this.entities) {
            gl.deleteVertexArray(e.vao);
            gl.deleteTexture(e.tex);
        }
        this.entities = [];
        return n;
    }

    list() {
        return this.entities.map(e => ({
            id: e.id, name: e.name,
            position: e.position.slice(), rotation: e.rotation, scale: e.scale,
            mode: e.mode, steps: e.steps, density: e.density,
            dims: [e.width, e.height, e.depth],
            maxMag: e.maxMag,
        }));
    }

    update(id, patch) {
        const e = this.entities.find(ent => ent.id === id);
        if (!e) return false;
        if (patch.position) e.position = patch.position.slice();
        if (patch.rotation !== undefined) e.rotation = patch.rotation;
        if (patch.scale    !== undefined) e.scale    = patch.scale;
        if (patch.steps    !== undefined) e.steps    = Math.max(8, Math.min(128, patch.steps | 0));
        if (patch.density  !== undefined) e.density  = Math.max(0, Math.min(4, patch.density));
        if (patch.name)    e.name = patch.name;
        if (patch.mode)    this.setMode(id, patch.mode);
        return true;
    }

    render(camera) {
        if (this.entities.length === 0) return;
        const gl = this.gl;
        gl.useProgram(this.prog);
        gl.uniformMatrix4fv(this.u_view, false, camera.viewMatrix);
        gl.uniformMatrix4fv(this.u_proj, false, camera.projMatrix);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied alpha

        const camX = camera.position?.x ?? 0;
        const camY = camera.position?.y ?? 5;
        const camZ = camera.position?.z ?? 0;
        // v354 frustum culling — unit-cube bounding sphere per entity
        const vp = multiplyMat4(camera.projMatrix, camera.viewMatrix);
        const planes = extractFrustumPlanes(vp);
        let drawn = 0, culled = 0;

        for (const e of this.entities) {
            const [wx, wy, wz, wr] = transformSphere(WND_LOCAL_CENTER, WND_LOCAL_RADIUS, e.position, e.rotation, e.scale);
            if (!sphereInFrustum(wx, wy, wz, wr, planes)) { culled++; continue; }
            drawn++;
            const cos = Math.cos(e.rotation), sin = Math.sin(e.rotation);
            const s = e.scale;
            const model = new Float32Array([
                cos * s, 0, sin * s, 0,
                0, s, 0, 0,
                -sin * s, 0, cos * s, 0,
                e.position[0], e.position[1], e.position[2], 1,
            ]);
            // Camera in entity-local space (inverse of model matrix on cam pos).
            // For our rotate-around-Y + uniform scale + translate, this is:
            //   p_local = R^-1 * (p_world - t) / s
            const dx = camX - e.position[0];
            const dy = camY - e.position[1];
            const dz = camZ - e.position[2];
            // R^-1 for yaw rotation has cos/sin swapped sign in [0][2] and [2][0]
            const lx =  cos * dx - sin * dz;
            const lz =  sin * dx + cos * dz;
            const camLocal = [lx / s, dy / s, lz / s];

            gl.uniformMatrix4fv(this.u_model, false, model);
            gl.uniform3f(this.u_camLocal, camLocal[0], camLocal[1], camLocal[2]);
            gl.uniform1f(this.u_maxMag, e.maxMag);
            gl.uniform1i(this.u_mode, e.mode === "vector" ? 1 : 0);
            gl.uniform1i(this.u_steps, e.steps);
            gl.uniform1f(this.u_density, e.density);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_3D, e.tex);
            gl.uniform1i(this.u_volume, 0);

            gl.bindVertexArray(e.vao);
            gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
        }
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
        this._lastCullStats = { drawn, culled, total: this.entities.length };
    }

    getCullStats() {
        return this._lastCullStats || { drawn: 0, culled: 0, total: this.entities.length };
    }

    dispose() {
        this.clear();
        const gl = this.gl;
        if (this.prog)   gl.deleteProgram(this.prog);
        if (this.bufPos) gl.deleteBuffer(this.bufPos);
        if (this.bufIdx) gl.deleteBuffer(this.bufIdx);
    }
}
