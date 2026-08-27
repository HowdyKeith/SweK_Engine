// WebGLEngine/render/mossPatches.js — v4076
// ---------------------------------------------------------------------------------------------------------------
// GPU-instanced moss, drawn in one instanced call, on the VOXEL terrain. Placement comes from
// render/mossField.js's buildMossVoxel() rather than a second scatter loop written here -- the planet's moss
// (es-box3d-fly3d.html) and this terrain's moss are ONE generator, exactly as render/cloudField.js made the
// engine's sky and the planet's sky one function instead of two that started identical.
//
// MOSS IS NOT GRASS WEARING A DIFFERENT COLOUR. render/vegetation.js already owns GRASS tops (dense, uniform,
// wind-blown blades); this file targets STONE and DIRT tops -- the surfaces grass has NOT claimed -- so the two
// systems are ecologically complementary rather than competing for the same ground. Moss also does not sway:
// it is short and clings to what it grows on, so there is no wind uniform here at all, which is most of why
// this shader is smaller than vegetation.js's.
//
// *** SLOPE, NOT JUST SURFACE TYPE. *** Moss thins out on steep ground the same way it does on the planet shell
// in es-box3d-fly3d.html, and it uses the SAME formula: mossField.js's slopeDensityMul(gradMag, maxSlope), fed a
// gradMag computed here as a central difference of terrainTopAt() over a few units -- a crude, real, computable
// proxy for slope. STATED RATHER THAN LEFT IMPLICIT: this is not a moisture or shade model, because neither
// concept exists anywhere in world/ yet (checked before writing this); slope is the one terrain fact already
// available on both terrain kinds, so it is the one this round builds on. A shade/dampness mask is a real
// follow-on, not a silent gap.
//
// EACH LOCATION GROWS THE SAME MOSS EVERY TIME, WHICH GRASS DOES NOT DO. vegetation.js reseeds itself with
// Math.random() on every rebuild, so the same patch of ground shows different blades each time you return to it
// -- fine for a uniform lawn, where no single blade matters. A moss CLUMP is a place, and returning to it should
// find the same clump, so the placement seed here is hashed from the rebuild anchor on a coarse grid (the same
// Math.imul(cx,73856093)^Math.imul(cz,19349663) constants world/worleyBiomes.js's cell hash already uses, not a
// second scheme invented for this file) rather than drawn from Math.random().
// ---------------------------------------------------------------------------------------------------------------

import { VOXEL } from "../world/voxelFormat.js";
import { terrainTopAt } from "../simulation/cameraGroundClamp.js";
import { buildMossVoxel, slopeDensityMul } from "./mossField.js";

const VS = `#version 300 es
layout(location=0) in vec3  aPos;       // clump-local vertex (y: 0=base..~0.22=top -- a hummock, not a blade)
layout(location=1) in vec3  aOffset;    // instance world position (base, already on the surface)
layout(location=2) in float aScale;     // instance scale
layout(location=3) in float aRot;       // instance Y rotation
layout(location=4) in float aTint;      // 0..1 -- dark mossy green .. lighter yellow-green

uniform mat4  uViewProj;
uniform vec3  uCamPos;

out vec3  vWorld;
out float vH;        // 0 base .. 1 top
out float vTint;

void main() {
    vec3 p = aPos * aScale;
    float c = cos(aRot), s = sin(aRot);
    vec3 r = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
    vec3 w = r + aOffset;
    vWorld = w;
    vH = clamp(p.y / max(1e-4, 0.22 * aScale), 0.0, 1.0);
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
    // A hummock reads as roughly upward-facing everywhere on it; cheap lambert against the sun + ambient,
    // same idiom vegetation.js uses for its blades.
    float diff = max(0.0, dot(vec3(0.0, 1.0, 0.0), normalize(uSunDir)));
    float light = 0.5 + diff * 0.6;

    // Dark green-black base, lighter yellow-green toward the top -- MOSS_CHAR's tint range in mossField.js.
    vec3 baseCol = mix(vec3(0.05, 0.14, 0.05), vec3(0.14, 0.30, 0.10), vTint);
    vec3 topCol  = vec3(0.30, 0.42, 0.16);
    vec3 col = mix(baseCol, topCol, vH * vH) * light;

    float dist = length(vWorld - uCamPos);
    float fog = clamp((dist - uFogNear) / max(1.0, uFogFar - uFogNear), 0.0, 1.0);
    col = mix(col, uFogColor, fog);

    oColor = vec4(col, 1.0);
}`;

export class MossPatches {
    constructor(gl, world, opts = {}) {
        this.gl = gl;
        this.world = world;
        this.enabled = opts.enabled ?? true;
        this.patches = opts.patches ?? 40;         // clump centres per rebuild
        this.region  = opts.region  ?? 55;         // placement disk radius (world units)
        this.maxSlope = opts.maxSlope ?? 1.6;      // rise-over-run past which moss is fully derated to zero
        this._count  = 0;
        this._vao    = null;
        this._buffers = [];
        this._buildCenter = null;
        this._rebuildDist = 40;
        this._lastBuildMs = 0;
        this._program = this._link(gl, VS, FS);
        this._u = {
            viewProj: gl.getUniformLocation(this._program, "uViewProj"),
            camPos:   gl.getUniformLocation(this._program, "uCamPos"),
            sunDir:   gl.getUniformLocation(this._program, "uSunDir"),
            fogColor: gl.getUniformLocation(this._program, "uFogColor"),
            fogNear:  gl.getUniformLocation(this._program, "uFogNear"),
            fogFar:   gl.getUniformLocation(this._program, "uFogFar"),
        };
        this._clump = this._makeClumpGeometry();
        console.log("[MossPatches] ready — window.moss.on()/off()/density(n)");
    }

    _compile(gl, type, src) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
            console.error("[MossPatches] shader:", gl.getShaderInfoLog(sh));
        return sh;
    }
    _link(gl, vs, fs) {
        const p = gl.createProgram();
        gl.attachShader(p, this._compile(gl, gl.VERTEX_SHADER, vs));
        gl.attachShader(p, this._compile(gl, gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS))
            console.error("[MossPatches] link:", gl.getProgramInfoLog(p));
        return p;
    }

    // A short, squat hummock -- two crossed quads like vegetation.js's blade, but H is an order of magnitude
    // smaller and W wider, so it reads as a low clump rather than a blade of grass.
    _makeClumpGeometry() {
        const W = 0.42, H = 0.22;
        const quad = (ax, az) => [
            -W*ax, 0, -W*az,   W*ax, 0, W*az,   W*ax, H, W*az,
            -W*ax, 0, -W*az,   W*ax, H, W*az,  -W*ax, H, -W*az,
        ];
        return new Float32Array([...quad(1, 0), ...quad(0, 1)]);
    }

    _disposeInstances() {
        const gl = this.gl;
        if (this._vao) { try { gl.deleteVertexArray(this._vao); } catch {} this._vao = null; }
        for (const b of this._buffers) { try { gl.deleteBuffer(b); } catch {} }
        this._buffers = [];
        this._count = 0;
    }

    /** Scatter moss patches on real terrain around (cx, cz), on stone/dirt only and slope-derated. */
    rebuild(cx, cz) {
        const gl = this.gl, world = this.world;
        if (!world) return;
        this._disposeInstances();

        const probe = world.voxelAt ? world.voxelAt.bind(world)
                    : world.getVoxel ? world.getVoxel.bind(world) : null;
        if (!probe) { this._buildCenter = { x: cx, z: cz }; this._lastBuildMs = performance.now(); return; }

        // v4076 -- coarse-grid hash so the SAME location grows the SAME moss on return, unlike vegetation.js's
        // per-rebuild Math.random() reseed (fine for a uniform lawn; wrong for a clump that is meant to be a
        // place). The multiplier constants are the ones world/worleyBiomes.js's cell hash already uses.
        const gx = Math.floor(cx / 8), gz = Math.floor(cz / 8);
        const seed = (Math.imul(gx, 73856093) ^ Math.imul(gz, 19349663)) >>> 0;

        const D = 3;   // central-difference step for the slope proxy, in world units
        const patchDensity = (px, pz) => {
            const ix = Math.floor(px), iz = Math.floor(pz);
            const h0 = terrainTopAt(world, ix, iz);
            const dEast  = (terrainTopAt(world, ix + D, iz) - terrainTopAt(world, ix - D, iz)) / (2 * D);
            const dNorth = (terrainTopAt(world, ix, iz + D) - terrainTopAt(world, ix, iz - D)) / (2 * D);
            const gradMag = Math.hypot(dEast, dNorth);
            return slopeDensityMul(gradMag, this.maxSlope);
        };
        const accept = (x, z) => {
            const ix = Math.floor(x), iz = Math.floor(z);
            const topY = terrainTopAt(world, ix, iz);
            const t = probe(ix, topY, iz);
            // moss favours STONE and DIRT -- the tops grass does not mostly occupy (vegetation.js: GRASS
            // mostly, DIRT sparsely) -- so the two ground covers read as distinct rather than doubled up.
            if (t !== VOXEL.STONE && t !== VOXEL.DIRT) return { ok: false };
            return { ok: true, y: topY + 0.02 };   // sits low, almost flush -- a hummock, not a raised block
        };

        const tufts = buildMossVoxel({ cx, cz, region: this.region, seed, patches: this.patches, accept, patchDensity });
        const offs = [], scl = [], rot = [], tint = [];
        for (const t of tufts) { offs.push(t.x, t.y, t.z); scl.push(t.scale); rot.push(t.rot); tint.push(t.tint); }

        this._count = tufts.length;
        this._buildCenter = { x: cx, z: cz };
        this._lastBuildMs = performance.now();
        if (this._count === 0) return;

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
        mk(this._clump, 0, 3, 0);
        mk(new Float32Array(offs), 1, 3, 1);
        mk(new Float32Array(scl),  2, 1, 1);
        mk(new Float32Array(rot),  3, 1, 1);
        mk(new Float32Array(tint), 4, 1, 1);
        gl.bindVertexArray(null);
        this._vao = vao;
        this._clumpVerts = this._clump.length / 3;
    }

    render(camera, timeSec, env = {}) {
        if (!this.enabled || !camera) return;
        const gl = this.gl;
        const cp = camera.position || { x: 0, y: 0, z: 0 };

        const need = !this._buildCenter ||
            (Math.hypot(cp.x - this._buildCenter.x, cp.z - this._buildCenter.z) > this._rebuildDist &&
             performance.now() - this._lastBuildMs > 400);
        if (need) this.rebuild(cp.x, cp.z);
        if (!this._vao || this._count === 0) return;

        const mvp = camera.getViewProjMatrix?.();
        if (!mvp) return;

        gl.useProgram(this._program);
        gl.uniformMatrix4fv(this._u.viewProj, false, mvp);
        gl.uniform3f(this._u.camPos, cp.x, cp.y, cp.z);
        gl.uniform3fv(this._u.sunDir,   env.sunDir   || [0.4, 0.85, 0.3]);
        gl.uniform3fv(this._u.fogColor, env.fogColor || [0.78, 0.65, 0.55]);
        gl.uniform1f(this._u.fogNear, env.fogNear ?? 60.0);
        gl.uniform1f(this._u.fogFar,  env.fogFar  ?? 220.0);

        const cullWas = gl.isEnabled(gl.CULL_FACE);
        if (cullWas) gl.disable(gl.CULL_FACE);
        gl.bindVertexArray(this._vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, this._clumpVerts, this._count);
        gl.bindVertexArray(null);
        if (cullWas) gl.enable(gl.CULL_FACE);
    }

    setDensity(n) { this.patches = Math.max(0, n | 0); this._buildCenter = null; }
    setMaxSlope(s) { this.maxSlope = Math.max(0, +s || 0); this._buildCenter = null; }
    getState() { return { enabled: this.enabled, patches: this.patches, count: this._count, maxSlope: this.maxSlope }; }
}
