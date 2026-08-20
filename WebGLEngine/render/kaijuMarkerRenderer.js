// FILE: render/kaijuMarkerRenderer.js
// VERSION: v1
//
// Instanced obelisk renderer for kaiju. Parallel to
// CivilizationMarkerRenderer but with three differentiating tweaks:
//
//   1. Larger primitive (1.5×3.5×1.5 base, scale 3 = ~5×10×5 voxels)
//      so kaiju silhouettes read as bigger than civ markers from any
//      camera angle.
//   2. Reddish palette (orange-red H≈15°, occasional purple variation
//      via id-hash) — distinct from civ markers' rainbow distribution.
//   3. Bobbing animation: per-frame sin(time + phase) Y offset so
//      kaiju visibly look "alive" rather than static. Phase is
//      derived from kaiju.id so each kaiju bobs at a slightly
//      different rhythm.
//
// Color also dims with energy — full red at 1.0, dark crimson at 0.1
// — so the visual reads as health draining during combat.

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aOffset;
layout(location=2) in float aScale;
layout(location=3) in vec3 aColor;

uniform mat4 uViewProj;

out vec3 vWorld;
out vec3 vColor;

void main() {
    vec3 world = aPos * aScale + aOffset;
    vWorld = world;
    vColor = aColor;
    gl_Position = uViewProj * vec4(world, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vColor;
out vec4 outColor;

const vec3 SUN = vec3(0.4082, 0.8165, 0.4082);

void main() {
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    // Higher ambient than civ markers — kaiju should glow ominously
    float ndl = max(0.6, dot(n, SUN));
    outColor = vec4(vColor * ndl, 1.0);
}`;

const INSTANCE_FLOATS = 7;
const INSTANCE_BYTES  = INSTANCE_FLOATS * 4;
const MAX_KAIJU       = 4;

const BASE_SCALE = 3.0;        // multiplier on primitive size
const BOB_AMPL   = 0.35;       // vertical bob amplitude in world units
const BOB_FREQ   = 1.8;        // bobs per second

// Slightly bigger and chunkier than the civ obelisk — 1.5×3.5×1.5
const KAIJU_VERTS = new Float32Array([
    -0.75, 0.0, -0.75,   +0.75, 0.0, -0.75,   +0.75, 0.0, +0.75,   -0.75, 0.0, +0.75,
    -0.75, 3.5, -0.75,   +0.75, 3.5, -0.75,   +0.75, 3.5, +0.75,   -0.75, 3.5, +0.75,
]);
const KAIJU_INDICES = new Uint16Array([
    0, 2, 1,  0, 3, 2,
    4, 5, 6,  4, 6, 7,
    0, 1, 5,  0, 5, 4,
    1, 2, 6,  1, 6, 5,
    2, 3, 7,  2, 7, 6,
    3, 0, 4,  3, 4, 7,
]);

export class KaijuMarkerRenderer {
    constructor(gl) {
        this.gl = gl;
        this.lastDrawn = 0;
        this._scratch = new Float32Array(MAX_KAIJU * INSTANCE_FLOATS);

        // Compile program
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, VS);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            console.error("[KaijuMarker] VS compile:", gl.getShaderInfoLog(vs));
        }
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, FS);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.error("[KaijuMarker] FS compile:", gl.getShaderInfoLog(fs));
        }
        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("[KaijuMarker] link:", gl.getProgramInfoLog(program));
        }
        this.program = program;
        this.uViewProj = gl.getUniformLocation(program, "uViewProj");

        // VAO + buffers
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, KAIJU_VERTS, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        const ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, KAIJU_INDICES, gl.STATIC_DRAW);

        const instBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
        gl.bufferData(gl.ARRAY_BUFFER, MAX_KAIJU * INSTANCE_BYTES, gl.STREAM_DRAW);

        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, INSTANCE_BYTES, 0);
        gl.vertexAttribDivisor(1, 1);

        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, INSTANCE_BYTES, 12);
        gl.vertexAttribDivisor(2, 1);

        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, INSTANCE_BYTES, 16);
        gl.vertexAttribDivisor(3, 1);

        gl.bindVertexArray(null);

        this.vao = vao;
        this.instBuf = instBuf;

        console.log("[KaijuMarkerRenderer] v1 ready");
    }

    render(kaijuManager, camera) {
        if (!kaijuManager) return;
        // Round 14 — kaiju with a loaded GLB render via the mesh
        // renderer (their _meshEntityId is set). Skip them here to
        // avoid double-render.
        const kaiju = kaijuManager.getAll().filter(k => k._meshEntityId == null);
        const count = Math.min(kaiju.length, MAX_KAIJU);
        this.lastDrawn = count;
        if (count === 0) return;

        const gl = this.gl;
        const buf = this._scratch;
        const tSec = performance.now() / 1000;

        for (let i = 0; i < count; i++) {
            const k = kaiju[i];
            const base = i * INSTANCE_FLOATS;
            const config = k.config || {};

            // Bob phase tied to id so each kaiju animates differently.
            // Amplitude comes from the kind config — water bobs more,
            // underground bobs almost not at all.
            const phase = k.id * 1.37;
            const bobAmpl = config.bobAmpl ?? BOB_AMPL;
            const bob = Math.sin(tSec * BOB_FREQ * Math.PI * 2 + phase) * bobAmpl;

            // Position — Y animated when grounded, raw during spawning
            // so the descent / rise reads cleanly without extra wobble.
            buf[base + 0] = k.position.x;
            buf[base + 1] = k.position.y + (k.state === "spawning" ? 0 : bob);
            buf[base + 2] = k.position.z;

            // Scale from kind config.
            buf[base + 3] = config.scale ?? BASE_SCALE;

            // Color from kind config, dimmed by energy. Allied kaiju
            // (round 10) blend 30% toward their patron civ's hue, so
            // a hell kaiju summoned by an orange-hued civ reads as
            // orange-on-red — visibly distinct from a wild hell kaiju.
            const baseColor = config.color ?? [1.0, 0.15, 0.15];
            const alleg = k.allegianceColor;
            const blend = alleg ? 0.30 : 0;
            const r0 = baseColor[0] * (1 - blend) + (alleg ? alleg[0] : 0) * blend;
            const g0 = baseColor[1] * (1 - blend) + (alleg ? alleg[1] : 0) * blend;
            const b0 = baseColor[2] * (1 - blend) + (alleg ? alleg[2] : 0) * blend;
            let dim = 0.4 + 0.6 * Math.max(0.1, k.energy);
            // Round 20 — queens shimmer (slow pulse) + brighter base.
            // Scale boost is already baked into config.scale by the
            // ascension code, so it shows up via the buf[base+3] line above.
            if (k.becameQueen) {
                const pulse = 0.85 + 0.15 * Math.sin(tSec * 1.5 + phase);
                dim *= pulse * 1.25;
            }
            buf[base + 4] = Math.min(1, r0 * dim);
            buf[base + 5] = Math.min(1, g0 * dim);
            buf[base + 6] = Math.min(1, b0 * dim);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf, 0, count * INSTANCE_FLOATS);

        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uViewProj, false, camera.getViewProjMatrix());

        gl.bindVertexArray(this.vao);
        gl.drawElementsInstanced(
            gl.TRIANGLES, KAIJU_INDICES.length, gl.UNSIGNED_SHORT, 0, count
        );
        gl.bindVertexArray(null);
    }

    snapshot() {
        return { drawn: this.lastDrawn };
    }
}
