// FILE: demos/nrc/nrcDemo.js
// VERSION: v1 — round 343
//
// Renders an N³ grid of small cubes whose colors come entirely from a
// 3→8→8→3 MLP inference inside a WebGL2 fragment shader. The grid sits
// roughly in front of the camera in world space.
//
// Three things to look at while the demo runs:
//   1. The pure-random init pass — colors look like noisy mush
//   2. Click "Train on target" — the field morphs over ~2 seconds toward
//      a known pattern (sin·cos·sin oscillation) as SGD converges
//   3. Click "Randomize" repeatedly — every new seed gives a different
//      "imagined" lighting field. None of this data is precomputed;
//      every fragment runs the MLP per draw call.

import { NeuralRadianceCache } from "../../engine/NeuralRadianceCache.js";

export class NrcDemo {
    constructor({ gl, world, camera }) {
        this.gl = gl;
        this.world = world;
        this.camera = camera;
        this.nrc = null;
        this.gridDim = 16;
        this.cubeSize = 0.5;
        this.spacing = 1.5;
        this.lastLoss = null;
        this._buildProgram();
        this._buildBuffers();
        this._buildPanel();
    }

    _buildProgram() {
        const gl = this.gl;
        this.nrc = new NeuralRadianceCache(gl, { dims: [3, 8, 8, 3], activations: ["relu", "relu", "sigmoid"] });

        const nrcGLSL = this.nrc.getShaderGLSL("nrcEvaluate", "u_nrcWeights");

        const vsSrc = `#version 300 es
precision highp float;

layout(location = 0) in vec3 a_corner;        // unit-cube vertex
layout(location = 1) in vec3 a_cellOffset;    // per-instance grid offset

uniform mat4 u_view;
uniform mat4 u_proj;
uniform float u_cubeSize;
uniform vec3 u_origin;

out vec3 v_cellPos;   // normalized [0,1] inside grid — NRC input

void main() {
    vec3 worldP = u_origin + a_cellOffset + a_corner * u_cubeSize;
    gl_Position = u_proj * u_view * vec4(worldP, 1.0);
    // Pass the cell index (normalized) as the NRC input. The cube
    // surface itself uses a single uniform color per instance (no
    // interpolation needed) — we read NRC once at the cube center.
    v_cellPos = a_cellOffset / vec3(${this.gridDim - 1}.0);
}`;

        const fsSrc = `#version 300 es
precision highp float;

in vec3 v_cellPos;
out vec4 fragColor;

${nrcGLSL}

void main() {
    float in_v[3];
    in_v[0] = v_cellPos.x;
    in_v[1] = v_cellPos.y;
    in_v[2] = v_cellPos.z;
    float out_v[3];
    nrcEvaluate(in_v, out_v);
    fragColor = vec4(out_v[0], out_v[1], out_v[2], 1.0);
}`;

        const compile = (src, type) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                const log = gl.getShaderInfoLog(s);
                console.error("[nrc] shader compile error:\n" + log);
                console.error("[nrc] source:\n" + src);
                throw new Error("[nrc] shader compile failed: " + log);
            }
            return s;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, compile(vsSrc,  gl.VERTEX_SHADER));
        gl.attachShader(prog, compile(fsSrc,  gl.FRAGMENT_SHADER));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error("[nrc] program link failed: " + gl.getProgramInfoLog(prog));
        }
        this.prog = prog;
        this.u_view      = gl.getUniformLocation(prog, "u_view");
        this.u_proj      = gl.getUniformLocation(prog, "u_proj");
        this.u_cubeSize  = gl.getUniformLocation(prog, "u_cubeSize");
        this.u_origin    = gl.getUniformLocation(prog, "u_origin");
        this.u_weights   = gl.getUniformLocation(prog, "u_nrcWeights");
    }

    _buildBuffers() {
        const gl = this.gl;
        // Unit cube (24 vertices — 6 faces × 4 corners, drawn as 6 quads via TRIANGLE_STRIP per face,
        // or simpler: 36-index list of triangles). Go simple: 36 triangle verts.
        const halfSize = 0.5;
        const cube = [
            // +X
             halfSize, -halfSize, -halfSize,   halfSize,  halfSize, -halfSize,   halfSize, -halfSize,  halfSize,
             halfSize,  halfSize, -halfSize,   halfSize,  halfSize,  halfSize,   halfSize, -halfSize,  halfSize,
            // -X
            -halfSize, -halfSize, -halfSize,  -halfSize, -halfSize,  halfSize,  -halfSize,  halfSize, -halfSize,
            -halfSize, -halfSize,  halfSize,  -halfSize,  halfSize,  halfSize,  -halfSize,  halfSize, -halfSize,
            // +Y
            -halfSize,  halfSize, -halfSize,  -halfSize,  halfSize,  halfSize,   halfSize,  halfSize, -halfSize,
            -halfSize,  halfSize,  halfSize,   halfSize,  halfSize,  halfSize,   halfSize,  halfSize, -halfSize,
            // -Y
            -halfSize, -halfSize, -halfSize,   halfSize, -halfSize, -halfSize,  -halfSize, -halfSize,  halfSize,
             halfSize, -halfSize, -halfSize,   halfSize, -halfSize,  halfSize,  -halfSize, -halfSize,  halfSize,
            // +Z
            -halfSize, -halfSize,  halfSize,   halfSize, -halfSize,  halfSize,  -halfSize,  halfSize,  halfSize,
             halfSize, -halfSize,  halfSize,   halfSize,  halfSize,  halfSize,  -halfSize,  halfSize,  halfSize,
            // -Z
            -halfSize, -halfSize, -halfSize,  -halfSize,  halfSize, -halfSize,   halfSize, -halfSize, -halfSize,
            -halfSize,  halfSize, -halfSize,   halfSize,  halfSize, -halfSize,   halfSize, -halfSize, -halfSize,
        ];
        this.bufCorner = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufCorner);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cube), gl.STATIC_DRAW);
        this.vertexCount = cube.length / 3;

        // Per-instance grid offsets
        const N = this.gridDim;
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
        gl.bindVertexArray(null);
    }

    _buildPanel() {
        const panel = document.createElement("div");
        Object.assign(panel.style, {
            position: "fixed", top: "60px", left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(8,12,24,0.94)",
            border: "1px solid #4a8",
            borderRadius: "8px",
            padding: "14px 20px",
            color: "#cfd",
            fontFamily: "monospace", fontSize: "12px",
            minWidth: "420px",
            zIndex: "8800",
            boxShadow: "0 0 24px rgba(80,255,180,0.20)",
        });
        panel.innerHTML = `
            <div style="color:#4f8; font-size:13px; letter-spacing:1.5px; padding-bottom:8px; border-bottom:1px solid #233; margin-bottom:10px;">🧠 NEURAL RADIANCE CACHE</div>
            <div style="color:#aab; margin-bottom:10px; line-height:1.5;">
                A 3→8→8→3 MLP runs <b>per fragment</b>. Weights live in a 131-float R32F texture.
                The grid shows the network's "imagined" RGB output for each (x,y,z).
            </div>
            <div style="display:flex; gap:8px; margin-bottom:10px;">
                <button id="nrc-randomize" style="flex:1; background:#2a4; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">🎲 Randomize</button>
                <button id="nrc-train" style="flex:1; background:#48c; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">🏋 Train on sin·cos·sin</button>
            </div>
            <div id="nrc-status" style="background:#06060c; padding:6px 10px; border-radius:4px; font-size:11px; color:#9cf;">ready · click randomize to seed new weights</div>
        `;
        document.body.appendChild(panel);
        this.panel = panel;
        panel.querySelector("#nrc-randomize").addEventListener("click", () => this.randomize());
        panel.querySelector("#nrc-train").addEventListener("click", () => this.trainOnTarget());
    }

    randomize() {
        this.nrc.randomize();
        this.nrc.upload();
        this._setStatus("randomized · new weight seed uploaded to GPU");
    }

    /**
     * Generate samples from sin(2πx)·cos(2πy)·sin(2πz) (mapped to [0,1] RGB
     * with phase shifts per channel) and run SGD for a couple seconds. The
     * grid colors morph live as training progresses.
     */
    trainOnTarget() {
        this._setStatus("generating training samples…");
        const N = 8;   // 8³ = 512 samples
        const samples = [];
        for (let x = 0; x < N; x++) {
            for (let y = 0; y < N; y++) {
                for (let z = 0; z < N; z++) {
                    const u = x / (N - 1), v = y / (N - 1), w = z / (N - 1);
                    const r = 0.5 + 0.5 * Math.sin(2 * Math.PI * u) * Math.cos(2 * Math.PI * v);
                    const g = 0.5 + 0.5 * Math.cos(2 * Math.PI * v) * Math.sin(2 * Math.PI * w);
                    const b = 0.5 + 0.5 * Math.sin(2 * Math.PI * u) * Math.sin(2 * Math.PI * w);
                    samples.push({ x: [u, v, w], y: [r, g, b] });
                }
            }
        }
        // Train in chunks so the UI doesn't freeze; upload after each chunk
        const totalEpochs = 60;
        const chunkSize = 4;
        let done = 0;
        const tick = () => {
            const t0 = performance.now();
            const r = this.nrc.train(samples, { epochs: chunkSize, lr: 0.08, log: false });
            done += chunkSize;
            this.lastLoss = r.finalLoss;
            const dt = performance.now() - t0;
            this._setStatus(`training… ${done}/${totalEpochs} epochs · loss=${r.finalLoss.toFixed(5)} · ${dt.toFixed(0)}ms/chunk`);
            if (done < totalEpochs) {
                setTimeout(tick, 16);
            } else {
                this._setStatus(`training complete · final loss=${r.finalLoss.toFixed(5)} · the grid now approximates sin·cos·sin`);
            }
        };
        tick();
    }

    _setStatus(text) {
        const el = this.panel?.querySelector("#nrc-status");
        if (el) el.textContent = text;
    }

    /** Called by main loop each frame. */
    render() {
        const gl = this.gl;
        gl.useProgram(this.prog);
        gl.bindVertexArray(this.vao);
        // Bind weight texture
        this.nrc.bind(7);    // unit 7 — out of the way of terrain/water/etc
        gl.uniform1i(this.u_weights, 7);
        gl.uniformMatrix4fv(this.u_view, false, this.camera.viewMatrix);
        gl.uniformMatrix4fv(this.u_proj, false, this.camera.projMatrix);
        gl.uniform1f(this.u_cubeSize, this.cubeSize);
        // Position the grid roughly 10 units in front of the camera at first activation
        if (!this._origin) {
            const fx = (Math.cos(this.camera.yaw ?? 0) * Math.sin(this.camera.pitch ?? 0));
            this._origin = [
                (this.camera.position?.x ?? 0) - this.gridDim * this.spacing / 2,
                (this.camera.position?.y ?? 5),
                (this.camera.position?.z ?? 0) - 15,
            ];
        }
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
        if (this.nrc)        this.nrc.dispose();
    }
}
