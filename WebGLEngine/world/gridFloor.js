// FILE: world/gridFloor.js
// v1605 — grid-ready gate. The empty sandbox's grid is the first thing the user should see; heavier startup
// work (the bridge image-sync handshake, the 3D avatar stage) is deferred until the grid has actually drawn.
// onSwekGridReady(fn) runs fn now if the grid already drew, else on the first-draw event, with a fallback
// timeout so nothing is ever stranded if the event is missed.
if (typeof window !== "undefined" && !window.onSwekGridReady) {
    window.__swekGridReady = false;
    window.onSwekGridReady = (fn, fallbackMs) => {
        if (window.__swekGridReady) { try { fn(); } catch {} return; }
        let done = false;
        const f = () => { if (done) return; done = true; try { fn(); } catch {} };
        try { window.addEventListener("swek:gridready", f, { once: true }); } catch { }
        setTimeout(f, fallbackMs || 12000);
    };
}

// v965 — bare grid-plane "blank world" floor (procedural WebGL2 grid on y=0,
//        snapped to the camera so it reads as an infinite reference grid).
// v967 — robustness pass after it rendered blank on v965:
//        * disable CULL_FACE (a ground quad gets backface-culled depending on
//          view direction — the most likely reason it was invisible) and
//          DEPTH_TEST (it's a backdrop; nothing to occlude in the blank world);
//        * loud diagnostics: compile/link errors are captured + surfaced via
//          window.gridWorld.status(), and the first render logs matrix/cam/gl
//          state so we can see exactly what happened on the rig;
//        * brighter, thicker lines + wider bright band so a working grid is
//          unmistakable.

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;     // unit quad corners in [-1,1]
uniform mat4 uViewProj;
uniform vec2 uCamXZ;                     // camera XZ (snapped to 1u)
uniform float uHalf;                     // half-extent of the ground plane
out vec2 vWorldXZ;
out vec2 vCamXZ;
out float vHalf;
void main() {
    vec2 xz = uCamXZ + aCorner * uHalf;
    vWorldXZ = xz;
    vCamXZ = uCamXZ;
    vHalf = uHalf;
    gl_Position = uViewProj * vec4(xz.x, 0.0, xz.y, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vWorldXZ;
in vec2 vCamXZ;
in float vHalf;
out vec4 frag;

// Anti-aliased grid coverage at a given cell size (derivative-based), with a
// minimum line width so lines stay visible at grazing angles / far distances.
float gridLine(vec2 coord, float scale, float widthPx) {
    vec2 c = coord / scale;
    vec2 w = fwidth(c) * widthPx;
    vec2 g = abs(fract(c - 0.5) - 0.5) / max(w, vec2(1e-4));
    return 1.0 - min(min(g.x, g.y), 1.0);
}

void main() {
    float minor = gridLine(vWorldXZ, 1.0, 1.0);    // every 1 unit
    float major = gridLine(vWorldXZ, 10.0, 1.5);   // every 10 units
    float d = distance(vWorldXZ, vCamXZ);
    float fade = 1.0 - smoothstep(vHalf * 0.45, vHalf * 0.98, d);

    vec3 minorCol = vec3(0.22, 0.40, 0.58);
    vec3 majorCol = vec3(0.50, 0.74, 1.00);
    vec3 col = minorCol;
    float a = minor * 0.55;
    if (major * 0.9 > a) { col = majorCol; a = major * 0.9; }

    // X/Z axis lines brightest (z=0 runs along X, x=0 runs along Z)
    float axisX = 1.0 - min(abs(vWorldXZ.y) / max(fwidth(vWorldXZ.y) * 2.0, 1e-4), 1.0);
    float axisZ = 1.0 - min(abs(vWorldXZ.x) / max(fwidth(vWorldXZ.x) * 2.0, 1e-4), 1.0);
    float axis = max(axisX, axisZ);
    if (axis > 0.0) { col = mix(col, vec3(0.70, 0.88, 1.0), axis); a = max(a, axis); }

    a *= fade;
    if (a <= 0.002) discard;
    frag = vec4(col, a);
}`;

export class GridFloor {
    constructor(gl) {
        this.gl = gl;
        this.half = 700;
        this.ok = false;
        this.error = null;
        this._logged = false;
        const vs = this._compile(gl.VERTEX_SHADER, VS, "vertex");
        const fs = this._compile(gl.FRAGMENT_SHADER, FS, "fragment");
        this.prog = gl.createProgram();
        gl.attachShader(this.prog, vs);
        gl.attachShader(this.prog, fs);
        gl.linkProgram(this.prog);
        if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) {
            this.error = "link: " + gl.getProgramInfoLog(this.prog);
            console.error("[gridFloor] PROGRAM LINK FAILED:", this.error);
            return;
        }
        this.loc = {
            uViewProj: gl.getUniformLocation(this.prog, "uViewProj"),
            uCamXZ:    gl.getUniformLocation(this.prog, "uCamXZ"),
            uHalf:     gl.getUniformLocation(this.prog, "uHalf"),
        };
        const verts = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);
        this.vao = gl.createVertexArray();
        this.vbo = gl.createBuffer();
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        this.ok = true;
        console.log("[gridFloor] program linked OK — ready");
    }

    _compile(type, src, label) {
        const gl = this.gl;
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(s);
            this.error = (label || "shader") + ": " + log;
            console.error("[gridFloor] " + (label || "shader") + " COMPILE FAILED:", log);
        }
        return s;
    }

    status() { return { ok: this.ok, error: this.error, half: this.half }; }

    // viewProj: Float32Array(16) (camera.viewProj). camPos: {x,y,z}.
    render(viewProj, camPos) {
        const gl = this.gl;
        if (!this.ok || !this.prog) return;
        if (!viewProj) { if (!this._logged) console.warn("[gridFloor] render skipped — no viewProj matrix"); this._logged = true; return; }
        const cx = Math.round(camPos?.x ?? 0);
        const cz = Math.round(camPos?.z ?? 0);

        gl.useProgram(this.prog);
        gl.uniformMatrix4fv(this.loc.uViewProj, false, viewProj);
        gl.uniform2f(this.loc.uCamXZ, cx, cz);
        gl.uniform1f(this.loc.uHalf, this.half);

        const prevBlend = gl.isEnabled(gl.BLEND);
        const prevCull  = gl.isEnabled(gl.CULL_FACE);
        const prevDepth = gl.isEnabled(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.CULL_FACE);    // ground quad must be double-sided
        gl.disable(gl.DEPTH_TEST);   // backdrop — draw regardless of depth state
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindVertexArray(null);
        // restore
        if (prevCull)  gl.enable(gl.CULL_FACE);
        if (prevDepth) gl.enable(gl.DEPTH_TEST);
        if (!prevBlend) gl.disable(gl.BLEND);

        if (!this._logged) {
            const err = gl.getError();
            console.log(`[gridFloor] first draw — cam xz=(${cx},${cz}) half=${this.half} vp[0..3]=` +
                `[${viewProj[0].toFixed(2)},${viewProj[1].toFixed(2)},${viewProj[2].toFixed(2)},${viewProj[3].toFixed(2)}] glError=${err}`);
            this._logged = true;
            // v1605 — the grid is on screen: release the deferred startup work (sync handshake + 3D stage).
            try { window.__swekGridReady = true; window.dispatchEvent(new Event("swek:gridready")); } catch { }
        }
    }
}
