// FILE: demos/ovm/ovmDemo.js
// VERSION: v2 — round 346 (AO bitmask + PCF shadow mapping added on top of v345)
//
// Visualizes a .ovm sparse voxel asset with three production-grade
// optimizations layered on top:
//
//   1. Dual-grid shape offset (v345) — voxels displace toward the
//      analytical surface, breaking the rigid Minecraft-cube look.
//   2. Vertex-attribute Ambient Occlusion (v346 NEW) — 8 corners × 4
//      bits packed in a uint32 per voxel. Fragment shader darkens
//      crevices with zero post-processing cost.
//   3. PCF shadow mapping (v346 NEW) — two-pass: depth-only render
//      to a 1024² framebuffer from the light's view, then PCF 3×3
//      sampling in the main fragment shader.
//
// Cube is now drawn with INDEXED rendering (8 unique corner vertices +
// 36 indices) so that gl_VertexID returns the corner index (0-7) for
// the AO lookup. Trade-off: normals are corner-smoothed (Gouraud) rather
// than face-flat. This actually fits the deformed dual-grid look better.

import { encodeOVM, decodeOVM, ovmBBox } from "../../engine/ovmFormat.js";
import { OVM_GENERATORS, generateWithAO } from "../../engine/ovmGenerator.js";

const SHADOW_MAP_SIZE = 1024;

export class OvmDemo {
    constructor({ gl, world, camera }) {
        this.gl = gl;
        this.world = world;
        this.camera = camera;
        this.voxelScale = 1.0;
        this.smoothness = 0.4;
        this.generatorName = "sphere";
        this.aoEnabled     = true;
        this.shadowsEnabled = true;
        this.asset = null;

        this.lightDir = [0.4, 0.8, 0.5];
        // Normalize light direction
        const ld = Math.hypot(this.lightDir[0], this.lightDir[1], this.lightDir[2]);
        this.lightDir = this.lightDir.map(v => v / ld);

        this._buildMainProgram();
        this._buildShadowProgram();
        this._buildCubeBuffer();
        this._allocInstanceBuffers();
        this._buildShadowFramebuffer();
        this._loadGenerated();
        this._buildPanel();
    }

    // -----------------------------------------------------------------
    //  Main rendering shader (color pass)
    // -----------------------------------------------------------------
    _buildMainProgram() {
        const gl = this.gl;
        const vsSrc = `#version 300 es
precision highp float;

layout(location = 0) in vec3 a_corner_pos;        // unit cube corner [-0.5..0.5]
layout(location = 1) in vec3 a_corner_normal;     // smoothed corner normal
layout(location = 2) in vec3 i_spatial_coord;
layout(location = 3) in vec3 i_shape_offset;
layout(location = 4) in vec4 i_pbr_material;
layout(location = 5) in uint i_ao_bitmask;        // v346 — packed AO

uniform mat4 u_view;
uniform mat4 u_proj;
uniform mat4 u_light_vp;       // light view-projection matrix (for shadow)
uniform float u_voxel_scale;
uniform vec3 u_origin;
uniform int u_ao_enabled;       // 0 or 1
uniform int u_shadows_enabled;

out vec3 v_world_position;
out vec3 v_world_normal;
out vec4 v_pbr_material;
out vec4 v_light_space_pos;
out float v_ambient_occlusion;

void main() {
    vec3 deformed = a_corner_pos + i_shape_offset;
    vec3 world_pos = u_origin + (deformed + i_spatial_coord) * u_voxel_scale;
    v_world_position = world_pos;
    v_world_normal   = a_corner_normal;
    v_pbr_material   = i_pbr_material;
    v_light_space_pos = u_light_vp * vec4(world_pos, 1.0);

    // ---- AO ---- gl_VertexID is the index value from the index buffer,
    // which we set up so that 0-7 map directly to the 8 cube corners.
    int corner_idx = gl_VertexID & 7;
    uint shifted = i_ao_bitmask >> (uint(corner_idx) * 4u);
    float ao_score = float(shifted & 0x3u);   // 0..3 (low 2 bits of the 4-bit slot)
    float ao_norm = ao_score / 3.0;            // 0..1
    v_ambient_occlusion = (u_ao_enabled == 1) ? (0.25 + ao_norm * 0.75) : 1.0;

    gl_Position = u_proj * u_view * vec4(world_pos, 1.0);
}`;

        const fsSrc = `#version 300 es
precision highp float;
in vec3 v_world_position;
in vec3 v_world_normal;
in vec4 v_pbr_material;
in vec4 v_light_space_pos;
in float v_ambient_occlusion;

uniform vec3 u_light_dir;
uniform sampler2D u_shadow_map;
uniform int u_shadows_enabled;

out vec4 fragColor;

/**
 * PCF shadow lookup — 3×3 percentage-closer filtering.
 * Returns 0.0 (fully lit) to 1.0 (fully in shadow).
 */
float calculateShadow(vec4 light_space_pos, vec3 normal) {
    vec3 proj = light_space_pos.xyz / light_space_pos.w;
    proj = proj * 0.5 + 0.5;
    if (proj.z > 1.0 || proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0) return 0.0;
    float current_depth = proj.z;
    // Slope-scale bias: steeper-than-light surfaces need larger bias
    float bias = max(0.005 * (1.0 - dot(normal, u_light_dir)), 0.0008);
    vec2 texel_size = 1.0 / vec2(textureSize(u_shadow_map, 0));
    float shadow = 0.0;
    for (int x = -1; x <= 1; ++x) {
        for (int y = -1; y <= 1; ++y) {
            float pcf_depth = texture(u_shadow_map, proj.xy + vec2(x, y) * texel_size).r;
            shadow += (current_depth - bias > pcf_depth) ? 1.0 : 0.0;
        }
    }
    return shadow / 9.0;
}

void main() {
    if (v_pbr_material.a < 0.05) discard;
    vec3 base_color = v_pbr_material.rgb;
    vec3 normal = normalize(v_world_normal);
    float diffuse_factor = max(dot(normal, u_light_dir), 0.0);

    float shadow_attenuation = (u_shadows_enabled == 1) ? calculateShadow(v_light_space_pos, normal) : 0.0;

    // Ambient term modulated by AO — crevices stay dark even where light hits
    vec3 ambient = (0.3 * v_ambient_occlusion) * base_color;
    // Direct light also gets a soft AO term so bounce lighting in alcoves
    // doesn't blow out
    vec3 direct = (1.0 - shadow_attenuation) * diffuse_factor * base_color * (0.5 + 0.5 * v_ambient_occlusion);

    fragColor = vec4(ambient + direct, 1.0);
}`;
        this.progMain = this._linkProgram(vsSrc, fsSrc);
        const p = this.progMain;
        this.u_view       = gl.getUniformLocation(p, "u_view");
        this.u_proj       = gl.getUniformLocation(p, "u_proj");
        this.u_lightVP    = gl.getUniformLocation(p, "u_light_vp");
        this.u_vs         = gl.getUniformLocation(p, "u_voxel_scale");
        this.u_orig       = gl.getUniformLocation(p, "u_origin");
        this.u_aoEnabled  = gl.getUniformLocation(p, "u_ao_enabled");
        this.u_shadowsEnabled = gl.getUniformLocation(p, "u_shadows_enabled");
        this.u_lightDir   = gl.getUniformLocation(p, "u_light_dir");
        this.u_shadowMap  = gl.getUniformLocation(p, "u_shadow_map");
    }

    // -----------------------------------------------------------------
    //  Shadow-pass shader (depth only)
    // -----------------------------------------------------------------
    _buildShadowProgram() {
        const vsSrc = `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_corner_pos;
layout(location = 2) in vec3 i_spatial_coord;
layout(location = 3) in vec3 i_shape_offset;

uniform mat4 u_light_vp;
uniform float u_voxel_scale;
uniform vec3 u_origin;

void main() {
    vec3 deformed = a_corner_pos + i_shape_offset;
    vec3 world_pos = u_origin + (deformed + i_spatial_coord) * u_voxel_scale;
    gl_Position = u_light_vp * vec4(world_pos, 1.0);
}`;
        // Fragment shader: empty — depth is written automatically
        const fsSrc = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
    // Depth is auto-written; color attachment not used (we use depth FBO only)
    fragColor = vec4(1.0);
}`;
        this.progShadow = this._linkProgram(vsSrc, fsSrc);
        const p = this.progShadow;
        this.u_shadow_lightVP = this.gl.getUniformLocation(p, "u_light_vp");
        this.u_shadow_vs      = this.gl.getUniformLocation(p, "u_voxel_scale");
        this.u_shadow_orig    = this.gl.getUniformLocation(p, "u_origin");
    }

    _linkProgram(vsSrc, fsSrc) {
        const gl = this.gl;
        const compile = (src, type) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                throw new Error("[ovm shader] " + gl.getShaderInfoLog(s) + "\n" + src);
            }
            return s;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, compile(vsSrc, gl.VERTEX_SHADER));
        gl.attachShader(prog, compile(fsSrc, gl.FRAGMENT_SHADER));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error("[ovm link] " + gl.getProgramInfoLog(prog));
        }
        return prog;
    }

    // -----------------------------------------------------------------
    //  Indexed unit cube — 8 corners + 36 indices
    //  Corner index encoding (binary): bit0=X, bit1=Y, bit2=Z
    // -----------------------------------------------------------------
    _buildCubeBuffer() {
        const gl = this.gl;
        const h = 0.5;
        // 8 corner positions matching the AO bitmask corner encoding
        const corners = [
            -h, -h, -h,    // 0: (-,-,-)
             h, -h, -h,    // 1: (+,-,-)
            -h,  h, -h,    // 2: (-,+,-)
             h,  h, -h,    // 3: (+,+,-)
            -h, -h,  h,    // 4: (-,-,+)
             h, -h,  h,    // 5: (+,-,+)
            -h,  h,  h,    // 6: (-,+,+)
             h,  h,  h,    // 7: (+,+,+)
        ];
        // Corner-smoothed normals: each corner's normal = its position
        // direction normalized. Gives Gouraud shading.
        const inv = 1 / Math.sqrt(3);
        const normals = [
            -inv, -inv, -inv,
             inv, -inv, -inv,
            -inv,  inv, -inv,
             inv,  inv, -inv,
            -inv, -inv,  inv,
             inv, -inv,  inv,
            -inv,  inv,  inv,
             inv,  inv,  inv,
        ];
        // 36 indices — 12 triangles, 2 per face. Counter-clockwise winding
        // when viewed from outside (facing normal direction).
        const indices = new Uint16Array([
            // +X face (corners 1,3,5,7)
            1, 3, 5,   3, 7, 5,
            // -X face (corners 0,4,2,6)
            0, 4, 2,   4, 6, 2,
            // +Y face (corners 2,3,6,7)
            2, 6, 3,   6, 7, 3,
            // -Y face (corners 0,1,4,5)
            0, 1, 4,   1, 5, 4,
            // +Z face (corners 4,5,6,7)
            4, 5, 6,   5, 7, 6,
            // -Z face (corners 0,1,2,3)
            0, 2, 1,   2, 3, 1,
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

    _allocInstanceBuffers() {
        const gl = this.gl;
        this.bufCoord    = gl.createBuffer();
        this.bufOffset   = gl.createBuffer();
        this.bufMaterial = gl.createBuffer();
        this.bufAO       = gl.createBuffer();  // v346

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNorm);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufCoord);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(2, 1);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufOffset);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(3, 1);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufMaterial);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, 0, 0);
        gl.vertexAttribDivisor(4, 1);

        // v346 — AO bitmask is INTEGER attribute (note the I in vertexAttribIPointer)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufAO);
        gl.enableVertexAttribArray(5);
        gl.vertexAttribIPointer(5, 1, gl.UNSIGNED_INT, 0, 0);
        gl.vertexAttribDivisor(5, 1);

        // Bind index buffer to VAO
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIdx);

        gl.bindVertexArray(null);
    }

    // -----------------------------------------------------------------
    //  Shadow framebuffer
    // -----------------------------------------------------------------
    _buildShadowFramebuffer() {
        const gl = this.gl;
        this.shadowFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);

        this.shadowTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24,
            SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, 0,
            gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,
            gl.TEXTURE_2D, this.shadowTex, 0);
        // No color attachment — depth only
        gl.drawBuffers([gl.NONE]);
        gl.readBuffer(gl.NONE);

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.warn("[ovm] shadow FBO incomplete:", status);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // -----------------------------------------------------------------
    //  Asset (un)load
    // -----------------------------------------------------------------
    _loadAsset(asset) {
        this.asset = asset;
        const gl = this.gl;
        // Convert Int16 coords to Float32 for shader (small assets — keep
        // simple, no integer attribute plumbing)
        const fcoords = new Float32Array(asset.count * 3);
        for (let i = 0; i < asset.count * 3; i++) fcoords[i] = asset.coords[i];
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufCoord);
        gl.bufferData(gl.ARRAY_BUFFER, fcoords, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufOffset);
        gl.bufferData(gl.ARRAY_BUFFER, asset.offsets, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufMaterial);
        gl.bufferData(gl.ARRAY_BUFFER, asset.materials, gl.STATIC_DRAW);

        // v346 — AO bitmasks. If asset doesn't include them (e.g. .ovm
        // imported from disk without AO baked in), compute on the fly.
        let bitmasks = asset.aoBitmasks;
        if (!bitmasks) {
            // Lazy-import to avoid circular ref at module init
            const { computeAOBitmasks } = OVM_GENERATORS;
            bitmasks = window._computeAO ? window._computeAO(asset.coords, asset.count) : new Uint32Array(asset.count);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufAO);
        gl.bufferData(gl.ARRAY_BUFFER, bitmasks, gl.STATIC_DRAW);

        this.instanceCount = asset.count;
        this._bbox = ovmBBox(asset);
    }

    _loadGenerated() {
        const opts = { smoothness: this.smoothness };
        if (this.generatorName === "sphere")     Object.assign(opts, { radius: 8 });
        if (this.generatorName === "torus")      Object.assign(opts, { majorRadius: 8, minorRadius: 3 });
        if (this.generatorName === "roundedBox") Object.assign(opts, { size: 12, cornerRadius: 4 });
        if (this.generatorName === "terrain")    Object.assign(opts, { size: 24, amplitude: 4 });
        this._loadAsset(generateWithAO(this.generatorName, opts));
    }

    // -----------------------------------------------------------------
    //  Light view-projection matrix
    //  Orthographic projection centered on the asset, framed from above.
    // -----------------------------------------------------------------
    _computeLightVP() {
        const bb = this._bbox || { min: [-10,-10,-10], max: [10,10,10], center: [0,0,0], size: [20,20,20] };
        const cx = bb.center[0] * this.voxelScale + this._origin[0];
        const cy = bb.center[1] * this.voxelScale + this._origin[1];
        const cz = bb.center[2] * this.voxelScale + this._origin[2];
        // Light position: 30 units back along -lightDir from the center
        const dist = Math.max(bb.size[0], bb.size[1], bb.size[2]) * this.voxelScale + 20;
        const lx = cx - this.lightDir[0] * dist;
        const ly = cy - this.lightDir[1] * dist;
        const lz = cz - this.lightDir[2] * dist;
        // lookAt: light → asset center, world-up = (0,1,0)
        const fx = cx - lx, fy = cy - ly, fz = cz - lz;
        const fLen = Math.hypot(fx, fy, fz);
        const Fx = fx / fLen, Fy = fy / fLen, Fz = fz / fLen;
        // right = forward × up
        let Rx = Fy * 0 - Fz * 1, Ry = Fz * 0 - Fx * 0, Rz = Fx * 1 - Fy * 0;
        // up vector cross — fallback if forward parallel to (0,1,0)
        if (Math.abs(Fy) > 0.999) {
            Rx = 1; Ry = 0; Rz = 0;
        } else {
            const rLen = Math.hypot(Rx, Ry, Rz) || 1;
            Rx /= rLen; Ry /= rLen; Rz /= rLen;
        }
        // upWorld = right × forward
        const Ux = Ry * Fz - Rz * Fy;
        const Uy = Rz * Fx - Rx * Fz;
        const Uz = Rx * Fy - Ry * Fx;
        // View matrix (column-major) — lookAt(lightPos, center, up)
        const view = new Float32Array([
            Rx,  Ux,  -Fx, 0,
            Ry,  Uy,  -Fy, 0,
            Rz,  Uz,  -Fz, 0,
            -(Rx * lx + Ry * ly + Rz * lz),
            -(Ux * lx + Uy * ly + Uz * lz),
             (Fx * lx + Fy * ly + Fz * lz),
            1,
        ]);
        // Orthographic projection covering the asset (with padding)
        const ortho = Math.max(bb.size[0], bb.size[1], bb.size[2]) * this.voxelScale * 0.75 + 4;
        const near = 0.1, far = dist * 2 + 20;
        const proj = new Float32Array([
            1 / ortho, 0, 0, 0,
            0, 1 / ortho, 0, 0,
            0, 0, -2 / (far - near), 0,
            0, 0, -(far + near) / (far - near), 1,
        ]);
        // Multiply: lightVP = proj * view
        return this._mat4Mul(proj, view);
    }

    _mat4Mul(a, b) {
        const r = new Float32Array(16);
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                let s = 0;
                for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
                r[i * 4 + j] = s;
            }
        }
        return r;
    }

    // -----------------------------------------------------------------
    //  Panel
    // -----------------------------------------------------------------
    _buildPanel() {
        const panel = document.createElement("div");
        Object.assign(panel.style, {
            position: "fixed", top: "60px", left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(8,12,24,0.94)",
            border: "1px solid #c84",
            borderRadius: "8px",
            padding: "14px 20px",
            color: "#cfd",
            fontFamily: "monospace", fontSize: "12px",
            minWidth: "520px",
            zIndex: "8800",
            boxShadow: "0 0 24px rgba(220,160,80,0.20)",
        });
        panel.innerHTML = `
            <div style="color:#fa6; font-size:13px; letter-spacing:1.5px; padding-bottom:8px; border-bottom:1px solid #233; margin-bottom:10px;">🧊 O-VOXEL · AO · PCF SHADOWS</div>
            <div style="color:#aab; margin-bottom:10px; line-height:1.5;">
                Indexed cube + 8-corner packed AO (uint32/voxel) + 1024² shadow map with 3×3 PCF.
                Toggle AO and shadows independently to see what each contributes.
            </div>
            <div style="display:flex; gap:6px; margin-bottom:8px; align-items:center;">
                <span style="color:#889; min-width:80px;">Generator:</span>
                <select id="ovm-gen" style="flex:1; background:#06060c; border:1px solid #333; color:#cfd; padding:3px; font-family:monospace;">
                    <option value="sphere">sphere</option>
                    <option value="torus">torus</option>
                    <option value="roundedBox">rounded box</option>
                    <option value="terrain">terrain patch</option>
                </select>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:8px; align-items:center;">
                <span style="color:#889; min-width:80px;">Smoothness:</span>
                <input id="ovm-smooth" type="range" min="0" max="50" value="40" style="flex:1;"/>
                <span id="ovm-smooth-val" style="color:#cfd; min-width:30px;">0.40</span>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:10px; align-items:center;">
                <label style="flex:1; cursor:pointer;"><input id="ovm-ao" type="checkbox" checked/> Ambient occlusion</label>
                <label style="flex:1; cursor:pointer;"><input id="ovm-shadow" type="checkbox" checked/> PCF shadows</label>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:10px;">
                <button id="ovm-regen"  style="flex:1; background:#48c; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">🔄 Regenerate</button>
                <button id="ovm-export" style="flex:1; background:#a64; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">💾 Export .ovm</button>
                <button id="ovm-import" style="flex:1; background:#2a4; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">📂 Import .ovm</button>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:10px;">
                <button id="ovm-place" style="flex:1; background:#6a4; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">📍 Place in world (window.ovm.add)</button>
            </div>
            <input id="ovm-file" type="file" accept=".ovm" style="display:none"/>
            <div id="ovm-status" style="background:#06060c; padding:6px 10px; border-radius:4px; font-size:11px; color:#9cf;">— loading —</div>
        `;
        document.body.appendChild(panel);
        this.panel = panel;
        const $ = id => panel.querySelector("#" + id);
        $("ovm-gen").addEventListener("change", e => { this.generatorName = e.target.value; this._loadGenerated(); this._refreshStatus(); });
        $("ovm-smooth").addEventListener("input", e => {
            this.smoothness = +e.target.value / 100;
            $("ovm-smooth-val").textContent = this.smoothness.toFixed(2);
            this._loadGenerated(); this._refreshStatus();
        });
        $("ovm-ao").addEventListener("change", e => { this.aoEnabled = e.target.checked; });
        $("ovm-shadow").addEventListener("change", e => { this.shadowsEnabled = e.target.checked; });
        $("ovm-regen").addEventListener("click", () => { this._loadGenerated(); this._refreshStatus(); });
        $("ovm-export").addEventListener("click", () => this._exportAsset());
        $("ovm-import").addEventListener("click", () => $("ovm-file").click());
        $("ovm-file").addEventListener("change", e => this._importAsset(e.target.files[0]));
        $("ovm-place").addEventListener("click", () => this._placeInWorld());
        this._refreshStatus();
    }

    _placeInWorld() {
        // v349 — drop the current asset into the main world via window.ovm.add.
        // The demo runs in exclusive isolation so user exits to see it.
        if (!window.ovm || typeof window.ovm.add !== "function") {
            this._setStatus("× window.ovm not available — engine init failed?");
            return;
        }
        const id = window.ovm.add(this.asset, {
            name: `${this.generatorName}-from-demo-${Date.now()}`,
        });
        const total = window.ovm.list().length;
        this._setStatus(`📍 placed as world entity id=${id} · ${total} ovm entit${total === 1 ? "y" : "ies"} in scene — exit demo to see it`);
    }

    _refreshStatus() {
        const bytes = 8 + this.asset.count * 22;
        const aoBytes = this.asset.count * 4;
        const bb = this._bbox;
        this._setStatus(`${this.asset.count} voxels · ${bytes}B .ovm + ${aoBytes}B AO · bbox ${bb.size[0]}×${bb.size[1]}×${bb.size[2]}`);
    }

    _exportAsset() {
        const buf = encodeOVM(this.asset);
        const blob = new Blob([buf], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${this.generatorName}_${this.asset.count}.ovm`;
        document.body.appendChild(a);
        a.click(); a.remove();
        URL.revokeObjectURL(url);
        this._setStatus(`exported ${a.download} (${buf.byteLength}B)`);
    }

    async _importAsset(file) {
        if (!file) return;
        try {
            const buf = await file.arrayBuffer();
            const asset = decodeOVM(buf);
            // AO not baked into .ovm; recompute from coords on import
            const { computeAOBitmasks } = await import("../../engine/ovmGenerator.js");
            asset.aoBitmasks = computeAOBitmasks(asset.coords, asset.count);
            this._loadAsset(asset);
            this._setStatus(`imported ${file.name} · ${asset.count} voxels (AO recomputed)`);
        } catch (e) {
            this._setStatus(`× import failed: ${e.message}`);
        }
    }

    _setStatus(text) {
        const el = this.panel?.querySelector("#ovm-status");
        if (el) el.textContent = text;
    }

    // -----------------------------------------------------------------
    //  Render — two-pass
    // -----------------------------------------------------------------
    render() {
        const gl = this.gl;
        if (!this._origin) {
            this._origin = [
                (this.camera.position?.x ?? 0),
                (this.camera.position?.y ?? 8),
                (this.camera.position?.z ?? 0) - 25,
            ];
        }
        const lightVP = this._computeLightVP();

        // ---- PASS 1: shadow depth from light's POV ----
        if (this.shadowsEnabled) {
            const prevViewport = gl.getParameter(gl.VIEWPORT);
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
            gl.viewport(0, 0, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
            gl.clear(gl.DEPTH_BUFFER_BIT);
            gl.enable(gl.DEPTH_TEST);
            gl.useProgram(this.progShadow);
            gl.bindVertexArray(this.vao);
            gl.uniformMatrix4fv(this.u_shadow_lightVP, false, lightVP);
            gl.uniform1f(this.u_shadow_vs, this.voxelScale);
            gl.uniform3f(this.u_shadow_orig, this._origin[0], this._origin[1], this._origin[2]);
            gl.drawElementsInstanced(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0, this.instanceCount);
            gl.bindVertexArray(null);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
        }

        // ---- PASS 2: main color render ----
        gl.useProgram(this.progMain);
        gl.bindVertexArray(this.vao);
        gl.uniformMatrix4fv(this.u_view, false, this.camera.viewMatrix);
        gl.uniformMatrix4fv(this.u_proj, false, this.camera.projMatrix);
        gl.uniformMatrix4fv(this.u_lightVP, false, lightVP);
        gl.uniform1f(this.u_vs, this.voxelScale);
        gl.uniform3f(this.u_orig, this._origin[0], this._origin[1], this._origin[2]);
        gl.uniform1i(this.u_aoEnabled, this.aoEnabled ? 1 : 0);
        gl.uniform1i(this.u_shadowsEnabled, this.shadowsEnabled ? 1 : 0);
        gl.uniform3f(this.u_lightDir, this.lightDir[0], this.lightDir[1], this.lightDir[2]);
        // Bind shadow texture to unit 6 (avoiding reserved unit 3 = main shadow)
        gl.activeTexture(gl.TEXTURE6);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
        gl.uniform1i(this.u_shadowMap, 6);
        gl.enable(gl.DEPTH_TEST);
        gl.drawElementsInstanced(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0, this.instanceCount);
        gl.bindVertexArray(null);
    }

    dispose() {
        const gl = this.gl;
        try { this.panel?.remove(); } catch {}
        if (this.progMain)   gl.deleteProgram(this.progMain);
        if (this.progShadow) gl.deleteProgram(this.progShadow);
        if (this.vao)        gl.deleteVertexArray(this.vao);
        if (this.bufPos)     gl.deleteBuffer(this.bufPos);
        if (this.bufNorm)    gl.deleteBuffer(this.bufNorm);
        if (this.bufIdx)     gl.deleteBuffer(this.bufIdx);
        if (this.bufCoord)   gl.deleteBuffer(this.bufCoord);
        if (this.bufOffset)  gl.deleteBuffer(this.bufOffset);
        if (this.bufMaterial)gl.deleteBuffer(this.bufMaterial);
        if (this.bufAO)      gl.deleteBuffer(this.bufAO);
        if (this.shadowFBO)  gl.deleteFramebuffer(this.shadowFBO);
        if (this.shadowTex)  gl.deleteTexture(this.shadowTex);
    }
}
