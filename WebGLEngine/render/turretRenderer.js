// FILE: render/turretRenderer.js
// VERSION: v1 - round 43r
//
// Instanced renderer for OGRE defender turrets visualized as a half-dome
// base + a rotating tube cannon. One draw call per geometry (dome + tube
// separately) per frame, fully instanced. Per-instance: position, scale,
// base color, tube color, aim yaw.
//
// The dome doesn't rotate; the tube rotates around its base anchor to
// point at the current target (the OGRE chassis when active, otherwise
// rests forward).
//
// Procedural geometry built at construction. Both meshes share the same
// vertex layout (pos + normal). The dome and tube get separate VAOs +
// separate instance buffers so they can have different per-instance
// data (color, scale offsets).

// Round 48 — exported so OgreScenario can compute world-space tube-tip
// positions for muzzle flash + projectile spawn without duplicating the
// magic numbers below. Keep these in sync with buildTubeGeometry().
export const TURRET_GEOM = {
    TUBE_LENGTH: 2.4,
    TUBE_RADIUS: 0.22,
    TUBE_BASE_ELEV: 0.55,           // tube Y above dome anchor (mesh-local)
    DEFAULT_INST_SCALE: 1.4,        // what getTurretInstances passes
    DOME_RADIUS: 1.0,
};

const DOME_SEGMENTS = 14;
const DOME_RINGS    = 7;
const TUBE_SEGMENTS = 12;
const TUBE_LENGTH   = TURRET_GEOM.TUBE_LENGTH;
const TUBE_RADIUS   = TURRET_GEOM.TUBE_RADIUS;
const DOME_RADIUS   = TURRET_GEOM.DOME_RADIUS;

const VS = `#version 300 es
layout(location=0) in vec3 aPos;       // mesh local
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 iPos;       // per-instance world position
layout(location=3) in vec3 iColor;     // per-instance color
layout(location=4) in float iScale;    // per-instance scale
layout(location=5) in float iYaw;      // per-instance rotation around Y (tube only; dome ignores)
layout(location=6) in float iRecoil;   // round 49 — per-instance recoil offset along tube -X (mesh-local). 0 for dome.
layout(location=7) in float iSelected; // round 49 — 0..1 brightness lift for selected defenders

uniform mat4 uViewProj;
uniform int  uApplyYaw;                // 1 for tube, 0 for dome

out vec3 vNormal;
out vec3 vColor;
out vec3 vWorld;
out float vSelected;

void main() {
    // Recoil pushes the tube along its own -X (back into the base) BEFORE
    // yaw rotation, so the kickback always points away from the muzzle.
    // Dome instances send iRecoil=0 so this is a no-op for them.
    vec3 p = aPos;
    p.x -= iRecoil;
    p = p * iScale;
    vec3 n = aNormal;
    if (uApplyYaw == 1) {
        // Round 49 (post) - rotation sign FIX. Previously this matrix
        // mapped local +X to (cos(yaw), -sin(yaw)), which puts the tube
        // 180° mirrored on Z relative to the target. With yaw =
        // atan2(dz, dx), we want local +X to go to (cos(yaw), sin(yaw))
        // so the tube actually points AT the target. The inverse-Z
        // rotation matrix below does that. Also brings the visible
        // tube into agreement with _tubeTipWorld(), so muzzle flash +
        // projectile origin (computed in the simulation) now coincide
        // with the rendered tube tip.
        float c = cos(iYaw), s = sin(iYaw);
        p = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
        n = vec3(c * n.x - s * n.z, n.y, s * n.x + c * n.z);
    }
    vec3 world = iPos + p;
    vNormal = n;
    vColor  = iColor;
    vWorld  = world;
    vSelected = iSelected;
    gl_Position = uViewProj * vec4(world, 1.0);
}`;

const FS = `#version 300 es
precision highp float;

uniform vec3  uSunDir;
uniform vec3  uCamPos;
uniform vec3  uFogColor;
uniform float uFogNear;
uniform float uFogFar;

in vec3 vNormal;
in vec3 vColor;
in vec3 vWorld;
in float vSelected;
out vec4 outColor;

void main() {
    vec3 N = normalize(vNormal);
    float ndl   = max(0.0, dot(N, uSunDir));
    float ambient = 0.45;
    vec3 lit = vColor * (ambient + 0.65 * ndl);
    // Specular highlight for the metal look
    vec3 V = normalize(uCamPos - vWorld);
    vec3 H = normalize(uSunDir + V);
    float spec = pow(max(0.0, dot(N, H)), 24.0) * 0.5;
    lit += vec3(spec);
    // Round 49 — selection glow. Rim lighting (back-facing edges) tinted
    // cyan-orange and modulated by vSelected (CPU pulses it 0..1). Adds
    // an unmistakable highlight without an extra draw call.
    if (vSelected > 0.01) {
        float rim = pow(1.0 - max(0.0, dot(N, V)), 2.5);
        vec3 glowTint = vec3(1.0, 0.78, 0.35);   // warm orange
        lit += glowTint * rim * vSelected * 1.6;
        // Also a flat brightness lift so the dome top reads as 'lit up'
        lit += vColor * vSelected * 0.20;
    }
    // Fog
    float dist = length(vWorld - uCamPos);
    float fogF = smoothstep(uFogNear, uFogFar, dist) * 0.85;
    outColor = vec4(mix(lit, uFogColor, fogF), 1.0);
}`;

// Build a UV-sphere upper hemisphere (y >= 0) with bottom-cap disk
// closing it off, so the dome looks solid even from below.
function buildDomeGeometry() {
    const verts = [];
    const norms = [];
    const inds = [];
    // Hemisphere band by band
    for (let r = 0; r <= DOME_RINGS; r++) {
        const v = r / DOME_RINGS;           // 0 at top, 1 at equator
        const phi = v * Math.PI * 0.5;      // 0 .. π/2
        const y = Math.cos(phi) * DOME_RADIUS;
        const ringR = Math.sin(phi) * DOME_RADIUS;
        for (let s = 0; s <= DOME_SEGMENTS; s++) {
            const u = s / DOME_SEGMENTS;
            const theta = u * Math.PI * 2;
            const x = Math.cos(theta) * ringR;
            const z = Math.sin(theta) * ringR;
            verts.push(x, y, z);
            // Normal on the sphere surface points outward radially
            const nrm = Math.hypot(x, y, z) || 1;
            norms.push(x / nrm, y / nrm, z / nrm);
        }
    }
    const stride = DOME_SEGMENTS + 1;
    for (let r = 0; r < DOME_RINGS; r++) {
        for (let s = 0; s < DOME_SEGMENTS; s++) {
            const a = r * stride + s;
            const b = a + stride;
            inds.push(a, b, a + 1, a + 1, b, b + 1);
        }
    }
    // Bottom-cap disk so the underside isn't open
    const baseY = 0;
    const centerIdx = verts.length / 3;
    verts.push(0, baseY, 0);
    norms.push(0, -1, 0);
    const rimStart = verts.length / 3;
    for (let s = 0; s <= DOME_SEGMENTS; s++) {
        const u = s / DOME_SEGMENTS;
        const theta = u * Math.PI * 2;
        verts.push(Math.cos(theta) * DOME_RADIUS, baseY, Math.sin(theta) * DOME_RADIUS);
        norms.push(0, -1, 0);
    }
    for (let s = 0; s < DOME_SEGMENTS; s++) {
        inds.push(centerIdx, rimStart + s + 1, rimStart + s);
    }
    return { verts, norms, inds };
}

// Tube = cylinder along +X axis (so yaw rotates it around Y to aim).
// Origin at the back of the tube (the muzzle end is +X * TUBE_LENGTH).
// The tube sits slightly above the dome equator (raised on Y).
function buildTubeGeometry() {
    const verts = [];
    const norms = [];
    const inds = [];
    const baseElev = 0.55;     // raise the tube above dome equator
    for (let s = 0; s <= TUBE_SEGMENTS; s++) {
        const u = s / TUBE_SEGMENTS;
        const theta = u * Math.PI * 2;
        const cy = Math.cos(theta), sy = Math.sin(theta);
        // back ring (x=0)
        verts.push(0, baseElev + cy * TUBE_RADIUS, sy * TUBE_RADIUS);
        norms.push(0, cy, sy);
        // front ring (x=TUBE_LENGTH)
        verts.push(TUBE_LENGTH, baseElev + cy * TUBE_RADIUS, sy * TUBE_RADIUS);
        norms.push(0, cy, sy);
    }
    // Sides (paired stride of 2)
    for (let s = 0; s < TUBE_SEGMENTS; s++) {
        const a = s * 2;
        const b = a + 2;
        // Two triangles per segment (back-front-front, back-front-back)
        inds.push(a, a + 1, b + 1, a, b + 1, b);
    }
    // Front cap (disk at +X)
    const frontCenter = verts.length / 3;
    verts.push(TUBE_LENGTH, baseElev, 0);
    norms.push(1, 0, 0);
    const frontStart = verts.length / 3;
    for (let s = 0; s <= TUBE_SEGMENTS; s++) {
        const u = s / TUBE_SEGMENTS;
        const theta = u * Math.PI * 2;
        verts.push(TUBE_LENGTH, baseElev + Math.cos(theta) * TUBE_RADIUS, Math.sin(theta) * TUBE_RADIUS);
        norms.push(1, 0, 0);
    }
    for (let s = 0; s < TUBE_SEGMENTS; s++) {
        inds.push(frontCenter, frontStart + s, frontStart + s + 1);
    }
    return { verts, norms, inds };
}

export class TurretRenderer {

    constructor(gl) {
        this.gl = gl;
        this.lastDrawn = 0;
        this._capacity = 64;
        // Per-instance: pos(3) + color(3) + scale(1) + yaw(1) = 8 floats
        this._stride = 10;     // round 49 - was 8 (added iRecoil, iSelected)
        this._instanceData = new Float32Array(this._capacity * this._stride);

        this._compile();
        this._buildBuffers();

        // Atmospheric uniforms updated each frame by main.js (matches voxel)
        this.sunDir   = [0.4, 0.85, 0.3];
        this.fogColor = [0.78, 0.65, 0.55];
        this.fogNear  = 60.0;
        this.fogFar   = 220.0;
    }

    _compile() {
        const gl = this.gl;
        const sh = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.error("[Turret] shader:", gl.getShaderInfoLog(s));
            }
            return s;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
        gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error("[Turret] link:", gl.getProgramInfoLog(prog));
        }
        this.program = prog;
        this.uViewProj = gl.getUniformLocation(prog, "uViewProj");
        this.uApplyYaw = gl.getUniformLocation(prog, "uApplyYaw");
        this.uSunDir   = gl.getUniformLocation(prog, "uSunDir");
        this.uCamPos   = gl.getUniformLocation(prog, "uCamPos");
        this.uFogColor = gl.getUniformLocation(prog, "uFogColor");
        this.uFogNear  = gl.getUniformLocation(prog, "uFogNear");
        this.uFogFar   = gl.getUniformLocation(prog, "uFogFar");

        // Round 50 - depth-only program for shadow casting. Replicates the
        // VS transform (recoil along -X before scale + yaw) but writes
        // only gl_Position. Uses uLightVP instead of uViewProj. Same VAO
        // works because we declare the same attribute locations.
        const DEPTH_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=2) in vec3 iPos;
layout(location=4) in float iScale;
layout(location=5) in float iYaw;
layout(location=6) in float iRecoil;

uniform mat4 uLightVP;
uniform int  uApplyYaw;

void main() {
    vec3 p = aPos;
    p.x -= iRecoil;
    p = p * iScale;
    if (uApplyYaw == 1) {
        // Round 49 fix - rotation matches the color-pass VS so the
        // depth-pass tube tip lines up with the visible tube.
        float c = cos(iYaw), s = sin(iYaw);
        p = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
    }
    vec3 world = iPos + p;
    gl_Position = uLightVP * vec4(world, 1.0);
}`;
        const DEPTH_FS = `#version 300 es
precision highp float;
void main() {}
`;
        const depthProg = gl.createProgram();
        gl.attachShader(depthProg, sh(gl.VERTEX_SHADER, DEPTH_VS));
        gl.attachShader(depthProg, sh(gl.FRAGMENT_SHADER, DEPTH_FS));
        gl.linkProgram(depthProg);
        if (!gl.getProgramParameter(depthProg, gl.LINK_STATUS)) {
            console.error("[Turret] depth link:", gl.getProgramInfoLog(depthProg));
        }
        this.depthProgram = depthProg;
        this.uLightVP_depth   = gl.getUniformLocation(depthProg, "uLightVP");
        this.uApplyYaw_depth  = gl.getUniformLocation(depthProg, "uApplyYaw");
    }

    _buildBuffers() {
        const gl = this.gl;

        const mkMesh = (geom) => {
            const vao = gl.createVertexArray();
            gl.bindVertexArray(vao);
            const vb = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vb);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geom.verts), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
            const nb = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, nb);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geom.norms), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
            const ib = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geom.inds), gl.STATIC_DRAW);
            // Instance buffer (shared layout)
            const instBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
            gl.bufferData(gl.ARRAY_BUFFER, this._instanceData.byteLength, gl.STREAM_DRAW);
            const STRIDE_BYTES = this._stride * 4;
            gl.enableVertexAttribArray(2);                 // iPos
            gl.vertexAttribPointer(2, 3, gl.FLOAT, false, STRIDE_BYTES, 0);
            gl.vertexAttribDivisor(2, 1);
            gl.enableVertexAttribArray(3);                 // iColor
            gl.vertexAttribPointer(3, 3, gl.FLOAT, false, STRIDE_BYTES, 12);
            gl.vertexAttribDivisor(3, 1);
            gl.enableVertexAttribArray(4);                 // iScale
            gl.vertexAttribPointer(4, 1, gl.FLOAT, false, STRIDE_BYTES, 24);
            gl.vertexAttribDivisor(4, 1);
            gl.enableVertexAttribArray(5);                 // iYaw
            gl.vertexAttribPointer(5, 1, gl.FLOAT, false, STRIDE_BYTES, 28);
            gl.vertexAttribDivisor(5, 1);
            // Round 49 — recoil offset (mesh-local -X) + selection lift
            gl.enableVertexAttribArray(6);                 // iRecoil
            gl.vertexAttribPointer(6, 1, gl.FLOAT, false, STRIDE_BYTES, 32);
            gl.vertexAttribDivisor(6, 1);
            gl.enableVertexAttribArray(7);                 // iSelected
            gl.vertexAttribPointer(7, 1, gl.FLOAT, false, STRIDE_BYTES, 36);
            gl.vertexAttribDivisor(7, 1);
            gl.bindVertexArray(null);
            return { vao, instBuf, indexCount: geom.inds.length };
        };
        this.dome = mkMesh(buildDomeGeometry());
        this.tube = mkMesh(buildTubeGeometry());
    }

    _ensureCapacity(n) {
        if (n <= this._capacity) return;
        const gl = this.gl;
        let c = this._capacity;
        while (c < n) c *= 2;
        this._capacity = c;
        this._instanceData = new Float32Array(c * this._stride);
        for (const m of [this.dome, this.tube]) {
            gl.bindBuffer(gl.ARRAY_BUFFER, m.instBuf);
            gl.bufferData(gl.ARRAY_BUFFER, this._instanceData.byteLength, gl.STREAM_DRAW);
        }
    }

    // instances: Array<{ x, y, z, scale, baseColor:[r,g,b], tubeColor:[r,g,b], aimYaw }>
    // We pack into the shared instance buffer; the dome ignores yaw via uApplyYaw=0,
    // the tube reads it. baseColor/tubeColor get swapped between the two draws via
    // a second pass — actually we use two separate fills below for clarity.
    render(instances, camera) {
        const gl = this.gl;
        if (!instances || instances.length === 0) { this.lastDrawn = 0; return; }

        const n = instances.length;
        this._ensureCapacity(n);
        const mvp = camera.getViewProjMatrix();
        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uViewProj, false, mvp);
        const cp = camera.position;
        gl.uniform3f(this.uCamPos, cp.x, cp.y, cp.z);
        gl.uniform3fv(this.uSunDir,   this.sunDir);
        gl.uniform3fv(this.uFogColor, this.fogColor);
        gl.uniform1f(this.uFogNear,   this.fogNear);
        gl.uniform1f(this.uFogFar,    this.fogFar);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);

        const data = this._instanceData;

        // --- Pass 1: domes (use baseColor) ---
        for (let i = 0; i < n; i++) {
            const inst = instances[i];
            const o = i * this._stride;
            data[o]     = inst.x;
            data[o + 1] = inst.y;
            data[o + 2] = inst.z;
            const c = inst.baseColor || [0.35, 0.40, 0.48];
            data[o + 3] = c[0]; data[o + 4] = c[1]; data[o + 5] = c[2];
            data[o + 6] = inst.scale || 1.0;
            data[o + 7] = 0.0;   // dome ignores yaw
            // Round 49 — dome gets no recoil but DOES get selection glow
            data[o + 8] = 0.0;
            data[o + 9] = inst.selected || 0.0;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dome.instBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n * this._stride));
        gl.uniform1i(this.uApplyYaw, 0);
        gl.bindVertexArray(this.dome.vao);
        gl.drawElementsInstanced(gl.TRIANGLES, this.dome.indexCount, gl.UNSIGNED_SHORT, 0, n);

        // --- Pass 2: tubes (use tubeColor + per-instance yaw) ---
        for (let i = 0; i < n; i++) {
            const inst = instances[i];
            const o = i * this._stride;
            const c = inst.tubeColor || [0.20, 0.22, 0.28];
            data[o + 3] = c[0]; data[o + 4] = c[1]; data[o + 5] = c[2];
            data[o + 7] = inst.aimYaw || 0.0;
            // Round 49 — tube gets the actual recoil + selection glow
            data[o + 8] = inst.recoil || 0.0;
            data[o + 9] = inst.selected || 0.0;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.tube.instBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n * this._stride));
        gl.uniform1i(this.uApplyYaw, 1);
        gl.bindVertexArray(this.tube.vao);
        gl.drawElementsInstanced(gl.TRIANGLES, this.tube.indexCount, gl.UNSIGNED_SHORT, 0, n);

        gl.bindVertexArray(null);
        this.lastDrawn = n;
    }

    // Round 50 - shadow casting. Depth-only pass. Packs the same instance
    // data the color pass would use (offset/scale/yaw/recoil — color is
    // ignored by the depth FS) and draws dome + tube into the shadow FBO.
    // Domes pass uApplyYaw=0; tubes pass uApplyYaw=1 so their per-instance
    // yaw is applied and the depth silhouette matches the visible tube.
    renderDepth(instances, lightVP) {
        const gl = this.gl;
        const n = instances?.length || 0;
        if (n === 0) return;
        while (n > this._capacity) {
            this._capacity *= 2;
            this._instanceData = new Float32Array(this._capacity * this._stride);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.dome.instBuf);
            gl.bufferData(gl.ARRAY_BUFFER, this._instanceData.byteLength, gl.STREAM_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.tube.instBuf);
            gl.bufferData(gl.ARRAY_BUFFER, this._instanceData.byteLength, gl.STREAM_DRAW);
        }
        gl.useProgram(this.depthProgram);
        gl.uniformMatrix4fv(this.uLightVP_depth, false, lightVP);
        gl.enable(gl.DEPTH_TEST);

        const data = this._instanceData;
        // --- Pass 1: domes (no yaw, no recoil) ---
        for (let i = 0; i < n; i++) {
            const inst = instances[i];
            const o = i * this._stride;
            data[o]     = inst.x;
            data[o + 1] = inst.y;
            data[o + 2] = inst.z;
            // color slots are filled with zeros for cleanliness but unused
            data[o + 3] = 0; data[o + 4] = 0; data[o + 5] = 0;
            data[o + 6] = inst.scale || 1.0;
            data[o + 7] = 0.0;     // dome ignores yaw
            data[o + 8] = 0.0;     // no recoil on dome
            data[o + 9] = 0.0;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dome.instBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n * this._stride));
        gl.uniform1i(this.uApplyYaw_depth, 0);
        gl.bindVertexArray(this.dome.vao);
        gl.drawElementsInstanced(gl.TRIANGLES, this.dome.indexCount, gl.UNSIGNED_SHORT, 0, n);

        // --- Pass 2: tubes (yaw + recoil applied) ---
        for (let i = 0; i < n; i++) {
            const inst = instances[i];
            const o = i * this._stride;
            data[o + 7] = inst.aimYaw || 0.0;
            data[o + 8] = inst.recoil || 0.0;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.tube.instBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n * this._stride));
        gl.uniform1i(this.uApplyYaw_depth, 1);
        gl.bindVertexArray(this.tube.vao);
        gl.drawElementsInstanced(gl.TRIANGLES, this.tube.indexCount, gl.UNSIGNED_SHORT, 0, n);

        gl.bindVertexArray(null);
    }
}
