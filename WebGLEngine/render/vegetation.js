// FILE: render/vegetation.js
// VERSION: v1 — round 418
//
// GPU-instanced grass, drawn in one instanced call. Adapted from an
// external reference sketch but rebuilt for this engine:
//   * Blades are placed on the ACTUAL terrain surface (terrainTopAt),
//     and only on grass/dirt tops — never water, sand, snow, stone, lava.
//   * Atmosphere-matched: same fog color/near/far and sun direction as
//     the voxel terrain, so distant grass fades into the horizon instead
//     of popping as a hard green carpet.
//   * Follows the camera: rebuilds around the player when they move far
//     enough, so grass exists wherever you walk without scattering over
//     the whole (mostly-unloaded) world up front.
//   * Wind animation in the vertex shader, stronger toward the blade tip.
//
// Separate VAO + program — no shared state with the voxel renderer beyond
// reading its sun/fog each frame. Opt-in via window.vegetation / the
// Settings panel; cheap enough to leave on (one instanced draw).

import { VOXEL } from "../world/voxelFormat.js";
import { terrainTopAt } from "../simulation/cameraGroundClamp.js";

const VS = `#version 300 es
layout(location=0) in vec3  aPos;       // blade-local vertex (y: 0=base..~1.6=tip)
layout(location=1) in vec3  aOffset;    // instance world position (base)
layout(location=2) in float aScale;     // instance scale
layout(location=3) in float aRot;       // instance Y rotation
layout(location=4) in float aTint;      // 0..1 per-instance color variation

uniform mat4  uViewProj;
uniform float uTime;
uniform float uWind;
uniform vec2  uWindDir;     // v431 — normalized world-XZ wind direction
uniform vec3  uCamPos;

out vec3  vWorld;
out float vH;        // 0 base .. 1 tip
out float vTint;

void main() {
    vec3 p = aPos * aScale;
    float c = cos(aRot), s = sin(aRot);
    vec3 r = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);

    // Wind: phase varies per-blade by world position; sway grows toward
    // the tip (p.y). Two frequencies for a less mechanical motion.
    float ph = uTime * 1.7 + aOffset.x * 0.7 + aOffset.z * 0.5;
    float sway = (sin(ph) + 0.3 * sin(ph * 2.3)) * 0.09 * uWind * max(0.0, p.y);

    vec3 w = r + aOffset;
    // v431 — lean + sway along the wind direction so the field visibly
    // blows one way (and gusts back) instead of a fixed diagonal jitter.
    w.x += sway * uWindDir.x;
    w.z += sway * uWindDir.y;

    vWorld = w;
    vH = clamp(p.y / (1.6 * aScale), 0.0, 1.0);
    vTint = aTint;
    gl_Position = uViewProj * vec4(w, 1.0);
}`;

const FS = `#version 300 es
precision highp float;

in vec3  vWorld;
in float vH;
in float vTint;
out vec4 oColor;

uniform vec3  uSunDir;
uniform vec3  uCamPos;
uniform vec3  uFogColor;
uniform float uFogNear;
uniform float uFogFar;

void main() {
    // Grass faces roughly up; cheap lambert against the sun + ambient.
    float diff = max(0.0, dot(vec3(0.0, 1.0, 0.0), normalize(uSunDir)));
    float light = 0.45 + diff * 0.75;

    // Base green varies per-instance; brighter, yellower toward the tip.
    vec3 baseCol = mix(vec3(0.10, 0.34, 0.08), vec3(0.16, 0.52, 0.12), vTint);
    vec3 tipCol  = vec3(0.42, 0.62, 0.20);
    vec3 col = mix(baseCol, tipCol, vH * vH) * light;
    // Darken at the very base so blades read as rooted, not floating.
    col *= mix(0.55, 1.0, vH);

    // Distance fog — identical curve to the voxel terrain.
    float dist = length(vWorld - uCamPos);
    float fog = clamp((dist - uFogNear) / max(1.0, uFogFar - uFogNear), 0.0, 1.0);
    col = mix(col, uFogColor, fog);

    oColor = vec4(col, 1.0);
}`;

export class Vegetation {
    constructor(gl, world, opts = {}) {
        this.gl = gl;
        this.world = world;
        this.enabled = opts.enabled ?? true;
        this.density = opts.density ?? 9000;     // blades per rebuild
        this.radius  = opts.radius  ?? 105;       // placement disk radius (world units)
        this.wind    = opts.wind    ?? 1.0;
        // v431 — directional wind. _windFixed (radians) pins the direction;
        // null = slow auto-drift so the breeze visibly shifts over time.
        this._windFixed = null;
        this._count  = 0;
        this._vao    = null;
        this._buffers = [];
        this._buildCenter = null;
        this._rebuildDist = 45;                   // re-anchor when camera moves this far
        this._lastBuildMs = 0;
        this._program = this._link(gl, VS, FS);
        this._u = {
            viewProj: gl.getUniformLocation(this._program, "uViewProj"),
            time:     gl.getUniformLocation(this._program, "uTime"),
            wind:     gl.getUniformLocation(this._program, "uWind"),
            windDir:  gl.getUniformLocation(this._program, "uWindDir"),
            camPos:   gl.getUniformLocation(this._program, "uCamPos"),
            sunDir:   gl.getUniformLocation(this._program, "uSunDir"),
            fogColor: gl.getUniformLocation(this._program, "uFogColor"),
            fogNear:  gl.getUniformLocation(this._program, "uFogNear"),
            fogFar:   gl.getUniformLocation(this._program, "uFogFar"),
        };
        this._blade = this._makeBladeGeometry();
        console.log("[Vegetation] ready — window.vegetation.on()/off()/density(n)");
    }

    _compile(gl, type, src) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
            console.error("[Vegetation] shader:", gl.getShaderInfoLog(sh));
        return sh;
    }
    _link(gl, vs, fs) {
        const p = gl.createProgram();
        gl.attachShader(p, this._compile(gl, gl.VERTEX_SHADER, vs));
        gl.attachShader(p, this._compile(gl, gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS))
            console.error("[Vegetation] link:", gl.getProgramInfoLog(p));
        return p;
    }

    // Two crossed quads → a blade with volume from any view angle.
    _makeBladeGeometry() {
        const W = 0.13, H = 1.55;
        const quad = (ax, az) => [
            -W*ax, 0, -W*az,   W*ax, 0, W*az,   W*ax, H, W*az,
            -W*ax, 0, -W*az,   W*ax, H, W*az,  -W*ax, H, -W*az,
        ];
        return new Float32Array([...quad(1, 0), ...quad(0, 1)]); // X-plane + Z-plane
    }

    _disposeInstances() {
        const gl = this.gl;
        if (this._vao) { try { gl.deleteVertexArray(this._vao); } catch {} this._vao = null; }
        for (const b of this._buffers) { try { gl.deleteBuffer(b); } catch {} }
        this._buffers = [];
        this._count = 0;
    }

    /** Scatter grass on real terrain around (cx, cz). */
    rebuild(cx, cz) {
        const gl = this.gl, world = this.world;
        if (!world) return;
        this._disposeInstances();

        const offs = [], scl = [], rot = [], tint = [];
        const R = this.radius;
        let placed = 0;
        // Oversample candidates; keep only those landing on grass/dirt.
        const tries = this.density * 3;
        for (let i = 0; i < tries && placed < this.density; i++) {
            const a = Math.random() * Math.PI * 2;
            const rr = Math.sqrt(Math.random()) * R;          // uniform disk
            const x = cx + Math.cos(a) * rr;
            const z = cz + Math.sin(a) * rr;
            const ix = Math.floor(x), iz = Math.floor(z);
            const topY = terrainTopAt(world, ix, iz);
            // Type of the surface voxel
            const probe = world.voxelAt ? world.voxelAt.bind(world)
                        : world.getVoxel ? world.getVoxel.bind(world) : null;
            if (!probe) break;
            const t = probe(ix, topY, iz);
            // Grass mostly on GRASS tops; sparse stubble on DIRT.
            if (t === VOXEL.GRASS || (t === VOXEL.DIRT && Math.random() < 0.25)) {
                offs.push(x, topY + 1, z);             // sit on top face of the voxel
                scl.push(0.65 + Math.random() * 0.7);
                rot.push(Math.random() * Math.PI * 2);
                tint.push(Math.random());
                placed++;
            }
        }
        this._count = placed;
        this._buildCenter = { x: cx, z: cz };
        this._lastBuildMs = performance.now();
        if (placed === 0) return;

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const mk = (data, loc, size, divisor) => {
            const b = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, b);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
            if (divisor) gl.vertexAttribDivisor(loc, divisor);
            this._buffers.push(b);
        };
        mk(this._blade, 0, 3, 0);
        mk(new Float32Array(offs), 1, 3, 1);
        mk(new Float32Array(scl),  2, 1, 1);
        mk(new Float32Array(rot),  3, 1, 1);
        mk(new Float32Array(tint), 4, 1, 1);
        gl.bindVertexArray(null);
        this._vao = vao;
        this._bladeVerts = this._blade.length / 3;
    }

    render(camera, timeSec, env = {}) {
        if (!this.enabled || !camera) return;
        const gl = this.gl;
        const cp = camera.position || { x: 0, y: 0, z: 0 };

        // Lazy/anchored (re)build so grass follows the camera. Throttled
        // so a fast-moving camera doesn't rebuild every frame.
        const need = !this._buildCenter ||
            (Math.hypot(cp.x - this._buildCenter.x, cp.z - this._buildCenter.z) > this._rebuildDist &&
             performance.now() - this._lastBuildMs > 400);
        if (need) this.rebuild(cp.x, cp.z);
        if (!this._vao || this._count === 0) return;

        const mvp = camera.getViewProjMatrix?.();
        if (!mvp) return;

        gl.useProgram(this._program);
        gl.uniformMatrix4fv(this._u.viewProj, false, mvp);
        gl.uniform1f(this._u.time, timeSec || 0);
        // v431 — directional wind. The base angle drifts slowly (with a
        // gentle wander) so the field leans + sways one way and the breeze
        // shifts over time; a slow gust pulse modulates strength, and
        // storms (env.windBoost) push it harder.
        const ts = timeSec || 0;
        const ang = (this._windFixed != null)
            ? this._windFixed
            : ts * 0.04 + Math.sin(ts * 0.11) * 0.5;
        gl.uniform2f(this._u.windDir, Math.cos(ang), Math.sin(ang));
        const gust = 0.65 + 0.45 * (0.5 + 0.5 * Math.sin(ts * 0.9));
        gl.uniform1f(this._u.wind, this.wind * gust * (env.windBoost ?? 1.0));
        gl.uniform3f(this._u.camPos, cp.x, cp.y, cp.z);
        gl.uniform3fv(this._u.sunDir,   env.sunDir   || [0.4, 0.85, 0.3]);
        gl.uniform3fv(this._u.fogColor, env.fogColor || [0.78, 0.65, 0.55]);
        gl.uniform1f(this._u.fogNear, env.fogNear ?? 60.0);
        gl.uniform1f(this._u.fogFar,  env.fogFar  ?? 220.0);

        // Thin double-sided blades — draw both faces. Restore cull after.
        const cullWas = gl.isEnabled(gl.CULL_FACE);
        if (cullWas) gl.disable(gl.CULL_FACE);
        gl.bindVertexArray(this._vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, this._bladeVerts, this._count);
        gl.bindVertexArray(null);
        if (cullWas) gl.enable(gl.CULL_FACE);
    }

    setDensity(n) { this.density = Math.max(0, n | 0); this._buildCenter = null; }  // force rebuild
    setWind(w)    { this.wind = Math.max(0, +w || 0); }

    // v438 — the live wind vector (same math the blades use), so clouds and
    // anything else drift in lock-step with the grass. dx/dz are a unit XZ
    // direction; speed includes the gust pulse + storm boost.
    windVector(timeSec = 0, env = {}) {
        const ang = (this._windFixed != null)
            ? this._windFixed
            : timeSec * 0.04 + Math.sin(timeSec * 0.11) * 0.5;
        const gust = 0.65 + 0.45 * (0.5 + 0.5 * Math.sin(timeSec * 0.9));
        return { dx: Math.cos(ang), dz: Math.sin(ang), speed: this.wind * gust * (env.windBoost ?? 1.0) };
    }
    // v431 — pin the wind to a compass-ish angle (degrees, world XZ) or
    // pass nothing to resume the slow auto-drift.
    windDir(deg)  { this._windFixed = (deg == null) ? null : (+deg * Math.PI / 180); }
    windAuto()    { this._windFixed = null; }
    getState()    { return { enabled: this.enabled, density: this.density, count: this._count, wind: this.wind, windFixedDeg: this._windFixed == null ? null : (this._windFixed * 180 / Math.PI) }; }
}
