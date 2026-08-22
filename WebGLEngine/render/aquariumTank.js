// FILE: render/aquariumTank.js
// VERSION: v1 — round 421
//
// Transparent glass walls + animated caustics for the aquarium demo.
// Additive + opt-in: its own two shader programs and VAOs, no shared
// state with the voxel renderer. Renders nothing until the aquarium demo
// calls setActive(true, bounds); the demo's stop() switches it back off.
//
//   * Glass: four blended wall quads with a Fresnel rim (alpha rises at
//     grazing angles, so edges read as glass) plus a faint moving sheen.
//     Depth-tested but does NOT write depth, so creatures behind the
//     glass still show through.
//   * Caustics: a floor quad with a cheap animated vein pattern, additive
//     blended so it lightens the tank floor like rippling light.
//
// All blend / depthMask / cull state is saved and restored around the
// draw so the next renderer in the frame is unaffected.

const GLASS_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uViewProj;
out vec3 vWorld;
out vec3 vN;
void main() {
    vWorld = aPos;
    vN = aNormal;
    gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const GLASS_FS = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vN;
out vec4 oColor;
uniform vec3  uCamPos;
uniform float uTime;
void main() {
    vec3 V = normalize(uCamPos - vWorld);
    float fres = pow(1.0 - abs(dot(normalize(vN), V)), 3.0);   // grazing → bright rim
    float sheen = 0.04 * sin(vWorld.y * 0.5 + uTime * 1.5)
                + 0.04 * sin(vWorld.x * 0.3 + vWorld.z * 0.3 - uTime);
    vec3 glass = vec3(0.45, 0.65, 0.85);
    float a = clamp(0.06 + fres * 0.5 + max(0.0, sheen), 0.0, 0.7);
    oColor = vec4(glass, a);
}`;

const CAUSTIC_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
out vec3 vWorld;
void main() {
    vWorld = aPos;
    gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const CAUSTIC_FS = `#version 300 es
precision highp float;
in vec3 vWorld;
out vec4 oColor;
uniform float uTime;
void main() {
    vec2 p = vWorld.xz * 0.15;
    float t = uTime * 0.6;
    float c = 0.0;
    c += abs(sin(p.x * 1.3 + t) + sin(p.y * 1.7 - t * 0.8));
    c += abs(sin((p.x + p.y) * 1.1 - t * 1.2) + sin((p.x - p.y) * 0.9 + t));
    c = 1.0 - clamp(c * 0.35, 0.0, 1.0);
    c = pow(c, 2.5);                              // sharpen into veins
    oColor = vec4(vec3(0.5, 0.8, 1.0) * c, c * 0.5);
}`;

export class AquariumTankRenderer {
    constructor(gl) {
        this.gl = gl;
        this.active = false;
        this._bounds = null;
        this._glassVerts = 0;
        this._floorVerts = 0;

        this._glassProg = this._link(gl, GLASS_VS, GLASS_FS);
        this._gu = {
            viewProj: gl.getUniformLocation(this._glassProg, "uViewProj"),
            camPos:   gl.getUniformLocation(this._glassProg, "uCamPos"),
            time:     gl.getUniformLocation(this._glassProg, "uTime"),
        };
        this._caustProg = this._link(gl, CAUSTIC_VS, CAUSTIC_FS);
        this._cu = {
            viewProj: gl.getUniformLocation(this._caustProg, "uViewProj"),
            time:     gl.getUniformLocation(this._caustProg, "uTime"),
        };

        this._glassVAO = gl.createVertexArray();
        this._glassVBO = gl.createBuffer();
        this._floorVAO = gl.createVertexArray();
        this._floorVBO = gl.createBuffer();
        console.log("[AquariumTank] glass + caustics renderer ready (inactive)");
    }

    _compile(gl, type, src) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
            console.error("[AquariumTank] shader:", gl.getShaderInfoLog(sh));
        return sh;
    }
    _link(gl, vs, fs) {
        const p = gl.createProgram();
        gl.attachShader(p, this._compile(gl, gl.VERTEX_SHADER, vs));
        gl.attachShader(p, this._compile(gl, gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS))
            console.error("[AquariumTank] link:", gl.getProgramInfoLog(p));
        return p;
    }

    // Build glass-wall (pos+normal) and floor (pos) geometry for the
    // given tank bounds. Static — only rebuilt when bounds change.
    _buildGeometry(half, cy, hh) {
        const gl = this.gl;
        const y0 = cy - hh, y1 = cy + hh;
        const g = [];
        // quad: p0,p1,p2 + p0,p2,p3, each carrying normal n
        const quad = (p0, p1, p2, p3, n) => {
            for (const v of [p0, p1, p2, p0, p2, p3]) g.push(v[0], v[1], v[2], n[0], n[1], n[2]);
        };
        // +X / -X / +Z / -Z walls
        quad([ half, y0, -half], [ half, y0,  half], [ half, y1,  half], [ half, y1, -half], [ 1, 0, 0]);
        quad([-half, y0, -half], [-half, y0,  half], [-half, y1,  half], [-half, y1, -half], [-1, 0, 0]);
        quad([-half, y0,  half], [ half, y0,  half], [ half, y1,  half], [-half, y1,  half], [ 0, 0, 1]);
        quad([-half, y0, -half], [ half, y0, -half], [ half, y1, -half], [-half, y1, -half], [ 0, 0,-1]);
        const glass = new Float32Array(g);
        this._glassVerts = glass.length / 6;
        gl.bindVertexArray(this._glassVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._glassVBO);
        gl.bufferData(gl.ARRAY_BUFFER, glass, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);

        // Floor quad (caustics) at y0.
        const floor = new Float32Array([
            -half, y0, -half,   half, y0, -half,   half, y0, half,
            -half, y0, -half,   half, y0,  half,  -half, y0, half,
        ]);
        this._floorVerts = floor.length / 3;
        gl.bindVertexArray(this._floorVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._floorVBO);
        gl.bufferData(gl.ARRAY_BUFFER, floor, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
        gl.bindVertexArray(null);
    }

    /** Turn the tank on/off. bounds = { half, cy, hh }. */
    setActive(on, bounds) {
        this.active = !!on;
        if (on && bounds) {
            const b = this._bounds;
            if (!b || b.half !== bounds.half || b.cy !== bounds.cy || b.hh !== bounds.hh) {
                this._buildGeometry(bounds.half, bounds.cy, bounds.hh);
                this._bounds = { ...bounds };
            }
        }
    }

    render(camera, timeSec, env = {}) {
        if (!this.active || !camera || !this._bounds) return;
        const mvp = camera.getViewProjMatrix?.();
        if (!mvp) return;
        const gl = this.gl;
        const cp = camera.position || { x: 0, y: 0, z: 0 };

        // Save state we touch.
        const cullWas  = gl.isEnabled(gl.CULL_FACE);
        const blendWas = gl.isEnabled(gl.BLEND);
        const depthWas = gl.isEnabled(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);             // v504 — depth-test vs the world so the additive
                                              // caustic floor doesn't paint a flat plane over the scene
        gl.depthMask(false);                 // transparent: test depth, don't write it
        if (cullWas) gl.disable(gl.CULL_FACE);

        // Caustics first (additive), so glass tint layers over it.
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.useProgram(this._caustProg);
        gl.uniformMatrix4fv(this._cu.viewProj, false, mvp);
        gl.uniform1f(this._cu.time, timeSec || 0);
        gl.bindVertexArray(this._floorVAO);
        gl.drawArrays(gl.TRIANGLES, 0, this._floorVerts);

        // Glass walls (standard alpha).
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(this._glassProg);
        gl.uniformMatrix4fv(this._gu.viewProj, false, mvp);
        gl.uniform3f(this._gu.camPos, cp.x, cp.y, cp.z);
        gl.uniform1f(this._gu.time, timeSec || 0);
        gl.bindVertexArray(this._glassVAO);
        gl.drawArrays(gl.TRIANGLES, 0, this._glassVerts);

        // Restore.
        gl.bindVertexArray(null);
        gl.depthMask(true);
        if (!depthWas) gl.disable(gl.DEPTH_TEST);
        if (!blendWas) gl.disable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);   // leave a sane default
        if (cullWas) gl.enable(gl.CULL_FACE);
    }

    getState() { return { active: this.active, bounds: this._bounds, glassVerts: this._glassVerts }; }
}
