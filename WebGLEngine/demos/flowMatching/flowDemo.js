// FILE: demos/flowMatching/flowDemo.js
// VERSION: v1 — round 344
//
// Visualizes a Flow Matching integration loop in real time. Each
// integration step, the demo:
//   1. Advances the sampler one step (Euler or Midpoint integration)
//   2. Uploads the new RGBA voxel state to a per-instance buffer
//   3. Renders the grid with instanced unit cubes
//
// Toggle the integrator, change targets, scrub steps, export to .vx.

import { FlowMatchingSampler, TARGETS } from "../../engine/flowMatching.js";
import { encodeVX, estimateCompression } from "../../engine/vxFormat.js";

export class FlowDemo {
    constructor({ gl, world, camera }) {
        this.gl = gl;
        this.world = world;
        this.camera = camera;
        this.dim = 24;            // 24³ = 13,824 cubes
        this.cubeSize = 0.45;
        this.spacing = 1.2;
        this.playing = false;
        this.lastStepTime = 0;
        this.stepInterval = 80;   // ms between steps when playing
        this.sampler = new FlowMatchingSampler({ dim: this.dim, steps: 16, target: "sphere", integrator: "euler" });
        this._buildProgram();
        this._buildBuffers();
        this._uploadInstanceColors();
        this._buildPanel();
    }

    _buildProgram() {
        const gl = this.gl;
        const vsSrc = `#version 300 es
precision highp float;

layout(location = 0) in vec3 a_corner;        // unit-cube corner
layout(location = 1) in vec3 a_cellOffset;    // grid offset per instance
layout(location = 2) in vec4 a_cellColor;     // RGBA from sampler state

uniform mat4 u_view;
uniform mat4 u_proj;
uniform float u_cubeSize;
uniform vec3 u_origin;

out vec4 v_color;
out float v_occupancy;

void main() {
    vec3 worldP = u_origin + a_cellOffset + a_corner * u_cubeSize;
    gl_Position = u_proj * u_view * vec4(worldP, 1.0);
    v_color = a_cellColor;
    v_occupancy = a_cellColor.a;
}`;

        const fsSrc = `#version 300 es
precision highp float;
in vec4 v_color;
in float v_occupancy;
out vec4 fragColor;
void main() {
    // Discard cells well below the occupancy threshold so we see the
    // shape emerge rather than a solid block of cubes. Below 0.15 it
    // would be noise from x_0 anyway.
    if (v_occupancy < 0.15) discard;
    fragColor = vec4(v_color.rgb, 1.0);
}`;

        const compile = (src, type) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                throw new Error("[flow] shader: " + gl.getShaderInfoLog(s));
            }
            return s;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, compile(vsSrc, gl.VERTEX_SHADER));
        gl.attachShader(prog, compile(fsSrc, gl.FRAGMENT_SHADER));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error("[flow] program link: " + gl.getProgramInfoLog(prog));
        }
        this.prog = prog;
        this.u_view     = gl.getUniformLocation(prog, "u_view");
        this.u_proj     = gl.getUniformLocation(prog, "u_proj");
        this.u_cubeSize = gl.getUniformLocation(prog, "u_cubeSize");
        this.u_origin   = gl.getUniformLocation(prog, "u_origin");
    }

    _buildBuffers() {
        const gl = this.gl;
        const half = 0.5;
        // 36-vertex unit cube
        const cube = [];
        const faces = [
            [[1,-1,-1],[1,1,-1],[1,-1,1],[1,1,-1],[1,1,1],[1,-1,1]],          // +X
            [[-1,-1,-1],[-1,-1,1],[-1,1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]],    // -X
            [[-1,1,-1],[-1,1,1],[1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]],          // +Y
            [[-1,-1,-1],[1,-1,-1],[-1,-1,1],[1,-1,-1],[1,-1,1],[-1,-1,1]],    // -Y
            [[-1,-1,1],[1,-1,1],[-1,1,1],[1,-1,1],[1,1,1],[-1,1,1]],          // +Z
            [[-1,-1,-1],[-1,1,-1],[1,-1,-1],[-1,1,-1],[1,1,-1],[1,-1,-1]],    // -Z
        ];
        for (const face of faces) for (const v of face) cube.push(v[0]*half, v[1]*half, v[2]*half);
        this.bufCorner = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufCorner);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cube), gl.STATIC_DRAW);
        this.vertexCount = cube.length / 3;

        // Per-instance offsets (static)
        const N = this.dim;
        const offsets = new Float32Array(N * N * N * 3);
        let idx = 0;
        for (let x = 0; x < N; x++) {
            for (let y = 0; y < N; y++) {
                for (let z = 0; z < N; z++) {
                    offsets[idx++] = x * this.spacing;
                    offsets[idx++] = y * this.spacing;
                    offsets[idx++] = z * this.spacing;
                }
            }
        }
        this.instanceCount = N * N * N;
        this.bufOffsets = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufOffsets);
        gl.bufferData(gl.ARRAY_BUFFER, offsets, gl.STATIC_DRAW);

        // Per-instance colors (dynamic — uploaded each step)
        this.bufColors = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufColors);
        gl.bufferData(gl.ARRAY_BUFFER, N * N * N * 4 * 4, gl.DYNAMIC_DRAW);

        // VAO
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufCorner);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufOffsets);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(1, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufColors);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(2, 1);
        gl.bindVertexArray(null);
    }

    /** Re-pack sampler state (RGBA) into the color buffer and upload. */
    _uploadInstanceColors() {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufColors);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.sampler.x);
    }

    _buildPanel() {
        const panel = document.createElement("div");
        Object.assign(panel.style, {
            position: "fixed", top: "60px", left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(8,12,24,0.94)",
            border: "1px solid #4ac",
            borderRadius: "8px",
            padding: "14px 20px",
            color: "#cfd",
            fontFamily: "monospace", fontSize: "12px",
            minWidth: "480px",
            zIndex: "8800",
            boxShadow: "0 0 24px rgba(80,200,255,0.20)",
        });
        panel.innerHTML = `
            <div style="color:#4cf; font-size:13px; letter-spacing:1.5px; padding-bottom:8px; border-bottom:1px solid #233; margin-bottom:10px;">🌊 FLOW MATCHING SAMPLER</div>
            <div style="color:#aab; margin-bottom:10px; line-height:1.5;">
                Euler / Midpoint integration over an Optimal Transport path from
                Gaussian noise (x₀) to a procedural target (x₁). 24³ voxels, RGBA per cell.
            </div>
            <div style="display:flex; gap:6px; margin-bottom:8px; align-items:center;">
                <span style="color:#889; min-width:60px;">Target:</span>
                <select id="flow-target" style="flex:1; background:#06060c; border:1px solid #333; color:#cfd; padding:3px; font-family:monospace;">
                    <option value="sphere">sphere</option>
                    <option value="torus">torus</option>
                    <option value="spiral">spiral</option>
                    <option value="random">random</option>
                </select>
                <span style="color:#889; min-width:80px; padding-left:8px;">Integrator:</span>
                <select id="flow-integ" style="flex:1; background:#06060c; border:1px solid #333; color:#cfd; padding:3px; font-family:monospace;">
                    <option value="euler">Euler</option>
                    <option value="midpoint">Midpoint</option>
                </select>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:10px; align-items:center;">
                <span style="color:#889; min-width:60px;">Steps:</span>
                <input id="flow-steps" type="range" min="8" max="32" value="16" style="flex:1;"/>
                <span id="flow-steps-val" style="color:#cfd; min-width:30px;">16</span>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:10px;">
                <button id="flow-play"  style="flex:1; background:#48c; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">▶ Play</button>
                <button id="flow-step"  style="flex:1; background:#2a4; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">⏭ Step</button>
                <button id="flow-reset" style="flex:1; background:#444; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">↺ Reset</button>
                <button id="flow-export" style="flex:1; background:#a64; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">💾 .vx</button>
            </div>
            <div id="flow-status" style="background:#06060c; padding:6px 10px; border-radius:4px; font-size:11px; color:#9cf;">step 0/16 · t=0.000 · noise (x₀)</div>
        `;
        document.body.appendChild(panel);
        this.panel = panel;
        const $ = id => panel.querySelector("#" + id);

        $("flow-target").addEventListener("change", e => {
            this.sampler.targetName = e.target.value;
            this._restart();
        });
        $("flow-integ").addEventListener("change", e => {
            this.sampler.integrator = e.target.value;
        });
        $("flow-steps").addEventListener("input", e => {
            const v = +e.target.value;
            $("flow-steps-val").textContent = v;
            this.sampler.steps = v;
            this._restart();
        });
        $("flow-play").addEventListener("click", () => {
            this.playing = !this.playing;
            $("flow-play").textContent = this.playing ? "⏸ Pause" : "▶ Play";
            this.lastStepTime = performance.now();
        });
        $("flow-step").addEventListener("click", () => this._oneStep());
        $("flow-reset").addEventListener("click", () => this._restart());
        $("flow-export").addEventListener("click", () => this._exportVX());
    }

    _restart() {
        this.sampler.reset();
        this._uploadInstanceColors();
        this.playing = false;
        this.panel.querySelector("#flow-play").textContent = "▶ Play";
        this._setStatus(`step 0/${this.sampler.steps} · t=0.000 · noise (x₀)`);
    }

    _oneStep() {
        const more = this.sampler.step();
        this._uploadInstanceColors();
        if (!more) {
            this.playing = false;
            this.panel.querySelector("#flow-play").textContent = "▶ Play";
            this._setStatus(`step ${this.sampler.stepIdx}/${this.sampler.steps} · t=1.000 · converged to target (x₁)`);
        } else {
            this._setStatus(`step ${this.sampler.stepIdx}/${this.sampler.steps} · t=${this.sampler.t.toFixed(3)} · integrating ${this.sampler.integrator}`);
        }
    }

    _exportVX() {
        const N = this.sampler.dim;
        const grid = {
            width:    N,
            height:   N,
            depth:    N,
            channels: 4,
            data: this.sampler.toRgbaU8(),
        };
        const stats = estimateCompression(grid);
        const buf = encodeVX(grid);
        const blob = new Blob([buf], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `flow_${this.sampler.targetName}_${N}_${Date.now()}.vx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        const ratioPct = (stats.ratio * 100).toFixed(1);
        this._setStatus(`exported .vx · raw=${stats.rawBytes}B compressed=${stats.encodedBytes}B (${ratioPct}% smaller, ${stats.pairs} RLE pairs)`);
    }

    _setStatus(text) {
        const el = this.panel?.querySelector("#flow-status");
        if (el) el.textContent = text;
    }

    render(now = performance.now()) {
        // Animation tick: advance one step if playing and interval elapsed
        if (this.playing && (now - this.lastStepTime) >= this.stepInterval) {
            this.lastStepTime = now;
            this._oneStep();
        }
        const gl = this.gl;
        if (!this._origin) {
            this._origin = [
                (this.camera.position?.x ?? 0) - this.dim * this.spacing / 2,
                (this.camera.position?.y ?? 5),
                (this.camera.position?.z ?? 0) - 20,
            ];
        }
        gl.useProgram(this.prog);
        gl.bindVertexArray(this.vao);
        gl.uniformMatrix4fv(this.u_view, false, this.camera.viewMatrix);
        gl.uniformMatrix4fv(this.u_proj, false, this.camera.projMatrix);
        gl.uniform1f(this.u_cubeSize, this.cubeSize);
        gl.uniform3f(this.u_origin, this._origin[0], this._origin[1], this._origin[2]);
        gl.enable(gl.DEPTH_TEST);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, this.vertexCount, this.instanceCount);
        gl.bindVertexArray(null);
    }

    dispose() {
        const gl = this.gl;
        try { this.panel?.remove(); } catch {}
        if (this.prog)       gl.deleteProgram(this.prog);
        if (this.vao)        gl.deleteVertexArray(this.vao);
        if (this.bufCorner)  gl.deleteBuffer(this.bufCorner);
        if (this.bufOffsets) gl.deleteBuffer(this.bufOffsets);
        if (this.bufColors)  gl.deleteBuffer(this.bufColors);
    }
}
