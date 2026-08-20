// FILE: demos/p3d/p3dDemo.js
// VERSION: v1 — round 347
//
// Pixal3D (.p3d) mesh viewer. Unlike the other v343-v345 demos which
// render with instanced cubes, .p3d is a real triangle mesh — same
// pipeline a Pixal3D Python output would feed into.
//
// What this demo shows:
//   - Load a .p3d mesh (synthetic generator or imported file)
//   - Render with smooth Lambertian shading using computed normals
//   - Auto-rotate slowly so you can see the silhouette
//   - Toggle wireframe overlay to inspect the topology
//   - Export to .p3d binary

import { encodeP3D, decodeP3D, p3dBBox, computeMeshNormals } from "../../engine/p3dFormat.js";
import { P3D_GENERATORS } from "../../engine/p3dGenerator.js";

export class P3dDemo {
    constructor({ gl, world, camera }) {
        this.gl = gl;
        this.world = world;
        this.camera = camera;
        this.mesh = null;
        this.normals = null;
        this.autoRotate = true;
        this.rotation = 0;
        this.lastFrame = performance.now();
        this.wireframe = false;
        this.generatorName = "icosphere";
        this.color = [0.55, 0.85, 0.65];
        this._buildPrograms();
        this._allocBuffers();
        this._loadGenerated();
        this._buildPanel();
    }

    _buildPrograms() {
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
uniform vec3 u_light_dir;
uniform vec3 u_color;
uniform vec3 u_view_pos;
uniform int u_wireframe;
out vec4 fragColor;
void main() {
    vec3 N = normalize(v_normal);
    float diff = max(dot(N, u_light_dir), 0.15);
    // Specular highlight — gives the mesh a bit of 3D pop on smooth surfaces
    vec3 V = normalize(u_view_pos - v_world_pos);
    vec3 R = reflect(-u_light_dir, N);
    float spec = pow(max(dot(V, R), 0.0), 24.0) * 0.25;
    vec3 base = u_color * (diff + 0.2) + vec3(spec);
    if (u_wireframe == 1) {
        // For wireframe pass, override color
        base = vec3(0.0, 1.0, 0.55);
    }
    fragColor = vec4(base, 1.0);
}`;
        this.prog = this._link(vsSrc, fsSrc);
        const p = this.prog;
        this.u_view      = gl.getUniformLocation(p, "u_view");
        this.u_proj      = gl.getUniformLocation(p, "u_proj");
        this.u_model     = gl.getUniformLocation(p, "u_model");
        this.u_normalMat = gl.getUniformLocation(p, "u_normalMat");
        this.u_lightDir  = gl.getUniformLocation(p, "u_light_dir");
        this.u_color     = gl.getUniformLocation(p, "u_color");
        this.u_viewPos   = gl.getUniformLocation(p, "u_view_pos");
        this.u_wire      = gl.getUniformLocation(p, "u_wireframe");
    }

    _link(vsSrc, fsSrc) {
        const gl = this.gl;
        const cmp = (s, t) => {
            const sh = gl.createShader(t);
            gl.shaderSource(sh, s);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                throw new Error("[p3d shader] " + gl.getShaderInfoLog(sh));
            }
            return sh;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, cmp(vsSrc, gl.VERTEX_SHADER));
        gl.attachShader(prog, cmp(fsSrc, gl.FRAGMENT_SHADER));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error("[p3d link] " + gl.getProgramInfoLog(prog));
        }
        return prog;
    }

    _allocBuffers() {
        const gl = this.gl;
        this.bufPos = gl.createBuffer();
        this.bufNorm = gl.createBuffer();
        this.bufIdx = gl.createBuffer();
        // Wire-frame line indices buffer (one pair per triangle edge)
        this.bufLineIdx = gl.createBuffer();

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNorm);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIdx);
        gl.bindVertexArray(null);
    }

    _loadMesh(mesh) {
        const gl = this.gl;
        this.mesh = mesh;
        this.normals = computeMeshNormals(mesh.vertices, mesh.indices);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNorm);
        gl.bufferData(gl.ARRAY_BUFFER, this.normals, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIdx);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

        // Build line indices (each triangle → 3 line segments)
        const triCount = mesh.indices.length / 3;
        const lineIdx = new Uint16Array(triCount * 6);
        for (let t = 0; t < triCount; t++) {
            const i0 = mesh.indices[t*3], i1 = mesh.indices[t*3+1], i2 = mesh.indices[t*3+2];
            lineIdx[t*6+0] = i0; lineIdx[t*6+1] = i1;
            lineIdx[t*6+2] = i1; lineIdx[t*6+3] = i2;
            lineIdx[t*6+4] = i2; lineIdx[t*6+5] = i0;
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufLineIdx);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lineIdx, gl.STATIC_DRAW);
        this.indexCount     = mesh.indices.length;
        this.lineIndexCount = lineIdx.length;
        this._bbox = p3dBBox(mesh);
    }

    _loadGenerated() {
        const gen = P3D_GENERATORS[this.generatorName];
        let opts = {};
        if (this.generatorName === "sphere")    opts = { radius: 2.5, longitudeSteps: 32, latitudeSteps: 20 };
        if (this.generatorName === "torus")     opts = { majorRadius: 2.5, minorRadius: 0.9 };
        if (this.generatorName === "icosphere") opts = { subdivisions: 3, radius: 2.5 };
        if (this.generatorName === "ribbon")    opts = { length: 5, width: 0.8, segments: 40, twists: 3 };
        this._loadMesh(gen(opts));
    }

    _buildPanel() {
        const panel = document.createElement("div");
        Object.assign(panel.style, {
            position: "fixed", top: "60px", left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(8,14,20,0.94)",
            border: "1px solid #6ad",
            borderRadius: "8px",
            padding: "14px 20px",
            color: "#cfd",
            fontFamily: "monospace", fontSize: "12px",
            minWidth: "520px",
            zIndex: "8800",
            boxShadow: "0 0 24px rgba(80,180,255,0.20)",
        });
        panel.innerHTML = `
            <div style="color:#6cf; font-size:13px; letter-spacing:1.5px; padding-bottom:8px; border-bottom:1px solid #233; margin-bottom:10px;">🧱 PIXAL3D MESH VIEWER — .p3d</div>
            <div style="color:#aab; margin-bottom:10px; line-height:1.5;">
                Low-VRAM mesh format from the Pixal3D pipeline (12B header + float32 verts + uint16 indices).
                Compatible with the Python encoder in <code style="color:#6cf;">lastai_finally.txt</code>:
                trimesh.creation.icosphere → marching cubes on CPU → .p3d emit.
            </div>
            <div style="display:flex; gap:6px; margin-bottom:8px; align-items:center;">
                <span style="color:#889; min-width:80px;">Mesh:</span>
                <select id="p3d-gen" style="flex:1; background:#06060c; border:1px solid #333; color:#cfd; padding:3px; font-family:monospace;">
                    <option value="icosphere" selected>icosphere (subdivided)</option>
                    <option value="sphere">UV sphere</option>
                    <option value="torus">torus</option>
                    <option value="ribbon">twisted ribbon</option>
                </select>
            </div>
            <div style="display:flex; gap:12px; margin-bottom:10px; align-items:center;">
                <label style="cursor:pointer;"><input id="p3d-rotate" type="checkbox" checked/> Auto-rotate</label>
                <label style="cursor:pointer;"><input id="p3d-wire" type="checkbox"/> Wireframe overlay</label>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:10px;">
                <button id="p3d-regen"  style="flex:1; background:#48c; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">🔄 Regenerate</button>
                <button id="p3d-export" style="flex:1; background:#a64; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">💾 Export .p3d</button>
                <button id="p3d-import" style="flex:1; background:#2a4; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">📂 Import .p3d</button>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:10px;">
                <button id="p3d-place" style="flex:1; background:#6a4; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">📍 Place in world (window.p3d.add)</button>
            </div>
            <input id="p3d-file" type="file" accept=".p3d" style="display:none"/>
            <div id="p3d-status" style="background:#06060c; padding:6px 10px; border-radius:4px; font-size:11px; color:#9cf;">— loading —</div>
        `;
        document.body.appendChild(panel);
        this.panel = panel;
        const $ = id => panel.querySelector("#" + id);
        $("p3d-gen").addEventListener("change", e => { this.generatorName = e.target.value; this._loadGenerated(); this._refreshStatus(); });
        $("p3d-rotate").addEventListener("change", e => { this.autoRotate = e.target.checked; });
        $("p3d-wire").addEventListener("change", e => { this.wireframe = e.target.checked; });
        $("p3d-regen").addEventListener("click", () => { this._loadGenerated(); this._refreshStatus(); });
        $("p3d-export").addEventListener("click", () => this._exportMesh());
        $("p3d-import").addEventListener("click", () => $("p3d-file").click());
        $("p3d-file").addEventListener("change", e => this._importMesh(e.target.files[0]));
        $("p3d-place").addEventListener("click", () => this._placeInWorld());
        this._refreshStatus();
    }

    _placeInWorld() {
        // v348 — drop the current mesh into the main world via window.p3d.add.
        // The demo's exclusive isolation hides the world, so this confirms the
        // entity exists via the console log + list; the user switches off the
        // demo to see it positioned in front of the camera.
        if (!window.p3d || typeof window.p3d.add !== "function") {
            this._setStatus("× window.p3d not available — engine init failed?");
            return;
        }
        const id = window.p3d.add(this.mesh, {
            color: this.color,
            name:  `${this.generatorName}-from-demo-${Date.now()}`,
        });
        const total = window.p3d.list().length;
        this._setStatus(`📍 placed as world entity id=${id} · ${total} p3d entit${total === 1 ? "y" : "ies"} in scene — exit demo to see it`);
    }

    _refreshStatus() {
        const bytes = 12 + this.mesh.vertices.length * 4 + this.mesh.indices.length * 2;
        const v = this.mesh.vertices.length / 3, f = this.mesh.indices.length / 3;
        this._setStatus(`${v} verts · ${f} tris · ${bytes}B .p3d · bbox ${this._bbox.size[0].toFixed(1)}×${this._bbox.size[1].toFixed(1)}×${this._bbox.size[2].toFixed(1)}`);
    }

    _exportMesh() {
        const buf = encodeP3D(this.mesh);
        const blob = new Blob([buf], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${this.generatorName}_${this.mesh.vertices.length / 3}v.p3d`;
        document.body.appendChild(a);
        a.click(); a.remove();
        URL.revokeObjectURL(url);
        this._setStatus(`exported ${a.download} (${buf.byteLength}B)`);
    }

    async _importMesh(file) {
        if (!file) return;
        try {
            const buf = await file.arrayBuffer();
            const mesh = decodeP3D(buf);
            this._loadMesh({ vertices: mesh.vertices, indices: mesh.indices });
            this._setStatus(`imported ${file.name} · ${mesh.numVerts} verts / ${mesh.numFaces} tris`);
        } catch (e) {
            this._setStatus(`× import failed: ${e.message}`);
        }
    }

    _setStatus(text) {
        const el = this.panel?.querySelector("#p3d-status");
        if (el) el.textContent = text;
    }

    render() {
        const gl = this.gl;
        const now = performance.now();
        const dt = (now - this.lastFrame) / 1000;
        this.lastFrame = now;
        if (this.autoRotate) this.rotation += dt * 0.4;

        // Model matrix: rotate around Y axis, position 8 units in front of camera
        const cos = Math.cos(this.rotation), sin = Math.sin(this.rotation);
        const px = (this.camera.position?.x ?? 0);
        const py = (this.camera.position?.y ?? 5);
        const pz = (this.camera.position?.z ?? 0) - 8;
        const model = new Float32Array([
            cos, 0, sin, 0,
            0,   1, 0,   0,
            -sin,0, cos, 0,
            px, py, pz, 1,
        ]);
        // Normal matrix = upper 3x3 of inverse-transpose(model). For pure
        // rotation/translation this is just the upper 3x3 of model.
        const normalMat = new Float32Array([
            cos, 0, sin,
            0,   1, 0,
            -sin,0, cos,
        ]);

        gl.useProgram(this.prog);
        gl.bindVertexArray(this.vao);
        gl.uniformMatrix4fv(this.u_view, false, this.camera.viewMatrix);
        gl.uniformMatrix4fv(this.u_proj, false, this.camera.projMatrix);
        gl.uniformMatrix4fv(this.u_model, false, model);
        gl.uniformMatrix3fv(this.u_normalMat, false, normalMat);
        gl.uniform3f(this.u_lightDir, 0.4, 0.8, 0.5);
        gl.uniform3f(this.u_color, this.color[0], this.color[1], this.color[2]);
        gl.uniform3f(this.u_viewPos, this.camera.position?.x ?? 0, this.camera.position?.y ?? 5, this.camera.position?.z ?? 0);
        gl.uniform1i(this.u_wire, 0);

        gl.enable(gl.DEPTH_TEST);
        // Main filled triangles
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIdx);
        gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);

        // Wireframe overlay
        if (this.wireframe) {
            gl.uniform1i(this.u_wire, 1);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufLineIdx);
            gl.drawElements(gl.LINES, this.lineIndexCount, gl.UNSIGNED_SHORT, 0);
        }
        gl.bindVertexArray(null);
    }

    dispose() {
        const gl = this.gl;
        try { this.panel?.remove(); } catch {}
        if (this.prog)        gl.deleteProgram(this.prog);
        if (this.vao)         gl.deleteVertexArray(this.vao);
        if (this.bufPos)      gl.deleteBuffer(this.bufPos);
        if (this.bufNorm)     gl.deleteBuffer(this.bufNorm);
        if (this.bufIdx)      gl.deleteBuffer(this.bufIdx);
        if (this.bufLineIdx)  gl.deleteBuffer(this.bufLineIdx);
    }
}
