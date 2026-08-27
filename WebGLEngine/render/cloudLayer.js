// FILE: render/cloudLayer.js
// VERSION: v438 — wind-driven cloud layer.
//
// Soft camera-facing billboard "puffs" grouped into clouds, drifting with
// the SAME wind vector the grass uses (so the sky and the field move
// together). Six meteorological types, each with its own altitude band,
// shape, coverage and shading (dark-based storm clouds, high wispy cirrus,
// flat stratus sheets, towering cumulonimbus, etc.). Opt-in: default off.
//
// GLSL note: no backticks inside the shader strings (they live in a JS
// template literal — a stray backtick would close it early).

// v4055 -- the TYPES table and the puff placement moved to render/cloudField.js so the Three.js planet
// page can build the SAME clouds. This file keeps what is genuinely its own: the WebGL2 program that
// draws them. One generator, two renderers -- rather than a second copy of the placement per sky.
import { CLOUD_TYPES as FIELD_TYPES, cloudType, buildPuffsFlat } from "./cloudField.js";

export const CLOUD_TYPES = FIELD_TYPES;

const VS = "#version 300 es\n" +
    "in vec2 aCorner;\n" +
    "uniform mat4 uViewProj;\n" +
    "uniform vec3 uCloudPos;\n" +
    "uniform vec2 uSize;\n" +
    "uniform vec3 uRight;\n" +
    "uniform vec3 uUp;\n" +
    "out vec2 vUv;\n" +
    "void main(){\n" +
    "  vec3 world = uCloudPos + aCorner.x * uSize.x * uRight + aCorner.y * uSize.y * uUp;\n" +
    "  gl_Position = uViewProj * vec4(world, 1.0);\n" +
    "  vUv = aCorner;\n" +
    "}\n";

const FS = "#version 300 es\n" +
    "precision highp float;\n" +
    "in vec2 vUv;\n" +
    "uniform vec3 uColTop;\n" +
    "uniform vec3 uColBot;\n" +
    "uniform vec3 uSun;\n" +
    "uniform float uDensity;\n" +
    "out vec4 frag;\n" +
    "void main(){\n" +
    "  float r = length(vUv);\n" +
    "  float a = smoothstep(1.0, 0.18, r) * uDensity;\n" +
    "  if (a < 0.01) discard;\n" +
    "  vec3 col = mix(uColBot, uColTop, clamp(vUv.y * 0.5 + 0.5, 0.0, 1.0));\n" +
    "  col *= (0.86 + 0.14 * clamp(uSun, 0.0, 1.0));\n" +
    "  frag = vec4(col, a);\n" +
    "}\n";

export class CloudLayer {
    constructor(gl) {
        this.gl = gl;
        this.enabled = false;
        this.type = "cumulus";
        this.speedScale = 1.6;       // clouds read faster than the gentle grass sway
        this.region = 480;           // half-extent of the wrap box around the camera
        this.puffs = [];
        this._cam = { x: 0, z: 0 };
        if (gl) this._init();
    }

    _compile(type, src) {
        const gl = this.gl;
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.warn("[clouds] shader compile failed:", gl.getShaderInfoLog(s));
        }
        return s;
    }

    _init() {
        const gl = this.gl;
        const p = gl.createProgram();
        gl.attachShader(p, this._compile(gl.VERTEX_SHADER, VS));
        gl.attachShader(p, this._compile(gl.FRAGMENT_SHADER, FS));
        gl.bindAttribLocation(p, 0, "aCorner");
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.warn("[clouds] link failed:", gl.getProgramInfoLog(p));
        }
        this.program = p;
        this.u = {
            viewProj: gl.getUniformLocation(p, "uViewProj"),
            cloudPos: gl.getUniformLocation(p, "uCloudPos"),
            size: gl.getUniformLocation(p, "uSize"),
            right: gl.getUniformLocation(p, "uRight"),
            up: gl.getUniformLocation(p, "uUp"),
            colTop: gl.getUniformLocation(p, "uColTop"),
            colBot: gl.getUniformLocation(p, "uColBot"),
            sun: gl.getUniformLocation(p, "uSun"),
            density: gl.getUniformLocation(p, "uDensity"),
        };
        const quad = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        const vb = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }

    setType(type, centerX = 0, centerZ = 0) {
        if (!cloudType(type)) return false;
        this.type = type;
        this.enabled = true;
        this.regenerate(centerX, centerZ);
        return true;
    }
    off() { this.enabled = false; this.puffs.length = 0; }

    // Build a fresh field of clouds (clusters of puffs) for the active type,
    // scattered across the wrap box centered on (cx,cz).
    regenerate(cx = this._cam.x, cz = this._cam.z) {
        if (!cloudType(this.type)) return;
        // v4055 -- placement comes from render/cloudField.js now. It is SEEDED where this used to call
        // Math.random() inline, so a sky can be rebuilt exactly; a fresh seed per call keeps the engine's own
        // behaviour (a new field every regenerate) identical to what it was.
        this.puffs = buildPuffsFlat({ type: this.type, cx, cz, region: this.region,
                                      seed: (Math.random() * 0xffffffff) >>> 0 });
        this._cam = { x: cx, z: cz };
    }

    update(dt, wind, camX, camZ) {
        if (!this.enabled || !this.puffs.length) return;
        const R = this.region;
        const vx = (wind?.dx || 0) * (wind?.speed || 0) * this.speedScale;
        const vz = (wind?.dz || 0) * (wind?.speed || 0) * this.speedScale;
        for (const p of this.puffs) {
            p.x += vx * dt;
            p.z += vz * dt;
            // Keep the field wrapped around the camera so clouds are always
            // overhead and drift endlessly.
            if (p.x < camX - R) p.x += 2 * R; else if (p.x > camX + R) p.x -= 2 * R;
            if (p.z < camZ - R) p.z += 2 * R; else if (p.z > camZ + R) p.z -= 2 * R;
        }
        this._cam = { x: camX, z: camZ };
    }

    render(camera, sunColor) {
        if (!this.enabled || !this.puffs.length || !this.program) return;
        const gl = this.gl;
        const mvp = camera.getViewProjMatrix?.();
        if (!mvp) return;

        // Camera basis (engine convention: yaw=0 → -Z, +pitch up).
        const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
        const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
        const f = [sy * cp, sp, -cy * cp];
        // right = normalize(f × worldUp);  up = normalize(right × f)
        let r = [-f[2], 0, f[0]];
        let rl = Math.hypot(r[0], r[1], r[2]) || 1; r = [r[0] / rl, r[1] / rl, r[2] / rl];
        let u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
        let ul = Math.hypot(u[0], u[1], u[2]) || 1; u = [u[0] / ul, u[1] / ul, u[2] / ul];

        gl.useProgram(this.program);
        const cullWas = gl.isEnabled(gl.CULL_FACE);
        if (cullWas) gl.disable(gl.CULL_FACE);
        const blendWas = gl.isEnabled(gl.BLEND);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        const oldDepthFunc = gl.getParameter(gl.DEPTH_FUNC);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);

        gl.uniformMatrix4fv(this.u.viewProj, false, mvp);
        gl.uniform3f(this.u.right, r[0], r[1], r[2]);
        gl.uniform3f(this.u.up, u[0], u[1], u[2]);
        const sc = sunColor || [1, 1, 1];
        gl.uniform3f(this.u.sun, sc[0], sc[1], sc[2]);

        gl.bindVertexArray(this.vao);
        // Sort back-to-front (far first) for cleaner alpha over the dome.
        const cxp = camera.position.x, czp = camera.position.z;
        this.puffs.sort((a, b) =>
            ((b.x - cxp) ** 2 + (b.z - czp) ** 2) - ((a.x - cxp) ** 2 + (a.z - czp) ** 2));
        for (const p of this.puffs) {
            gl.uniform3f(this.u.cloudPos, p.x, p.y, p.z);
            gl.uniform2f(this.u.size, p.w, p.h);
            gl.uniform3fv(this.u.colTop, p.colTop);
            gl.uniform3fv(this.u.colBot, p.colBot);
            gl.uniform1f(this.u.density, p.density);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
        gl.bindVertexArray(null);

        gl.depthMask(true);
        gl.depthFunc(oldDepthFunc);
        if (!blendWas) gl.disable(gl.BLEND);
        if (cullWas) gl.enable(gl.CULL_FACE);
    }
}
