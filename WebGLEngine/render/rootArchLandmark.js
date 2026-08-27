// WebGLEngine/render/rootArchLandmark.js — v4077
// ---------------------------------------------------------------------------------------------------------------
// Draws world/rootArch.js's swept-tube geometry on the VOXEL terrain, as ONE static raw-GL mesh -- not an
// InstancedMesh like render/mossPatches.js's clumps, because there is exactly one of these per world, not
// hundreds. Built ONCE (world/rootArchPlace.js finds a real site the first time real terrain has streamed in
// under it) and never rebuilt as the camera moves, exactly as world/rootArch.js's own header states a landmark
// should behave -- the opposite of render/mossPatches.js's rebuild-on-camera-move loop, and deliberately so.
//
// A THIN LAMBERT SHADER, NOT MOSSPATCHES' HUMMOCK SHADER: the mesh already carries real per-vertex normals from
// the swept-tube's own radial direction (world/rootArch.js), so this shades with them directly instead of the
// height-based two-tone mix a flat clump needs. One flat weathered-wood colour -- a root/arch is bark and stone,
// not something that needs a species table the way moss does.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

import { rootArch } from "../world/rootArch.js";
import { findRootArchSite } from "../world/rootArchPlace.js";

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;

uniform mat4  uViewProj;
uniform vec3  uOffset;
uniform float uRotY;

out vec3 vWorld;
out vec3 vNormal;

void main() {
    float c = cos(uRotY), s = sin(uRotY);
    vec3 p = vec3(aPos.x * c - aPos.z * s, aPos.y, aPos.x * s + aPos.z * c);
    vec3 n = vec3(aNormal.x * c - aNormal.z * s, aNormal.y, aNormal.x * s + aNormal.z * c);
    vec3 w = p + uOffset;
    vWorld = w;
    vNormal = n;
    gl_Position = uViewProj * vec4(w, 1.0);
}`;

const FS = `#version 300 es
precision highp float;

in vec3 vWorld;
in vec3 vNormal;
out vec4 oColor;

uniform vec3  uSunDir;
uniform vec3  uCamPos;
uniform vec3  uFogColor;
uniform float uFogNear;
uniform float uFogFar;

void main() {
    vec3 n = normalize(vNormal);
    float diff = max(0.0, dot(n, normalize(uSunDir)));
    float light = 0.32 + diff * 0.68;
    vec3 col = vec3(0.34, 0.27, 0.18) * light;   // weathered root/rock brown

    float dist = length(vWorld - uCamPos);
    float fog = clamp((dist - uFogNear) / max(1.0, uFogFar - uFogNear), 0.0, 1.0);
    col = mix(col, uFogColor, fog);

    oColor = vec4(col, 1.0);
}`;

export class RootArchLandmark {
    constructor(gl, world, opts = {}) {
        this.gl = gl;
        this.world = world;
        this.enabled = opts.enabled ?? true;
        this.seed = opts.seed ?? 4242;
        this._vao = null;
        this._buffers = [];
        this._indexCount = 0;
        this._placement = null;   // { x, y, z, rotY, mesh } once placed
        this._lastTryMs = -Infinity;
        this._retryMs = 800;   // don't hammer the placement search every frame while terrain is still streaming
        this._program = this._link(gl, VS, FS);
        this._u = {
            viewProj: gl.getUniformLocation(this._program, "uViewProj"),
            offset:   gl.getUniformLocation(this._program, "uOffset"),
            rotY:     gl.getUniformLocation(this._program, "uRotY"),
            camPos:   gl.getUniformLocation(this._program, "uCamPos"),
            sunDir:   gl.getUniformLocation(this._program, "uSunDir"),
            fogColor: gl.getUniformLocation(this._program, "uFogColor"),
            fogNear:  gl.getUniformLocation(this._program, "uFogNear"),
            fogFar:   gl.getUniformLocation(this._program, "uFogFar"),
        };
        console.log("[RootArchLandmark] ready — window.rootArch.state()");
    }

    _compile(gl, type, src) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
            console.error("[RootArchLandmark] shader:", gl.getShaderInfoLog(sh));
        return sh;
    }
    _link(gl, vs, fs) {
        const p = gl.createProgram();
        gl.attachShader(p, this._compile(gl, gl.VERTEX_SHADER, vs));
        gl.attachShader(p, this._compile(gl, gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS))
            console.error("[RootArchLandmark] link:", gl.getProgramInfoLog(p));
        return p;
    }

    /** Idempotent: does nothing once placed. Returns the placement, or null if no site qualified yet. */
    place() {
        if (this._placement) return this._placement;
        if (!this.world) return null;
        const site = findRootArchSite(this.world, { seed: this.seed });
        if (!site) return null;
        const mesh = rootArch(this.seed, {});
        this._upload(mesh);
        this._placement = { x: site.x, y: site.y, z: site.z, rotY: site.rotY, mesh };
        console.log(`[RootArchLandmark] placed at (${site.x}, ${site.y}, ${site.z}), ${mesh.branchCount} branches, ${mesh.triangleCount} tris`);
        return this._placement;
    }

    _upload(mesh) {
        const gl = this.gl;
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const mk = (data, loc, size) => {
            const b = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, b);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
            this._buffers.push(b);
        };
        mk(mesh.positions, 0, 3);
        mk(mesh.normals, 1, 3);
        const ib = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
        this._buffers.push(ib);
        gl.bindVertexArray(null);
        this._vao = vao;
        this._indexCount = mesh.indices.length;
    }

    render(camera, timeSec, env = {}) {
        if (!this.enabled || !camera) return;
        if (!this._placement) {
            const now = performance.now();
            if (now - this._lastTryMs < this._retryMs) return;
            this._lastTryMs = now;
            if (!this.place()) return;
        }
        const gl = this.gl;
        const mvp = camera.getViewProjMatrix?.();
        if (!mvp) return;

        gl.useProgram(this._program);
        gl.uniformMatrix4fv(this._u.viewProj, false, mvp);
        gl.uniform3f(this._u.offset, this._placement.x, this._placement.y, this._placement.z);
        gl.uniform1f(this._u.rotY, this._placement.rotY);
        const cp = camera.position || { x: 0, y: 0, z: 0 };
        gl.uniform3f(this._u.camPos, cp.x, cp.y, cp.z);
        gl.uniform3fv(this._u.sunDir,   env.sunDir   || [0.4, 0.85, 0.3]);
        gl.uniform3fv(this._u.fogColor, env.fogColor || [0.78, 0.65, 0.55]);
        gl.uniform1f(this._u.fogNear, env.fogNear ?? 60.0);
        gl.uniform1f(this._u.fogFar,  env.fogFar  ?? 220.0);

        gl.bindVertexArray(this._vao);
        gl.drawElements(gl.TRIANGLES, this._indexCount, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
    }

    getState() {
        return {
            enabled: this.enabled,
            placed: !!this._placement,
            position: this._placement ? { x: this._placement.x, y: this._placement.y, z: this._placement.z } : null,
            branchCount: this._placement ? this._placement.mesh.branchCount : 0,
            triangleCount: this._placement ? this._placement.mesh.triangleCount : 0,
        };
    }
}
