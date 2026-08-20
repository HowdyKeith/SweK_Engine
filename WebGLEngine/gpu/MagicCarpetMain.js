// FILE: gpu/MagicCarpetMain.js
// VERSION: v876 — Magic carpet that follows player camera in the main engine.
//
// Singleton renderer (vs CapeShield which is multi-instance). The
// carpet visually sits ~1 unit below the camera in the player's lower
// FOV; 4 corners pinned to anchors computed from camera.position +
// camera.yaw each frame so the carpet translates + rotates with the
// player. Pitch is ignored — carpet stays horizontal regardless of
// where the player is looking. Interior verts simulate verlet physics
// with gentle gravity + optional wind bob for "floating magic carpet"
// feel.
//
// The user's existing WASD/yaw/pitch movement in the engine "drives"
// the carpet — no new flight control system needed.
//
// API (window.magicCarpet):
//   mount(opts?)       — start rendering, carpet follows camera
//   dismount()         — stop, free GL resources
//   isMounted()
//   setColor(r,g,b,a)  — recolor live
//   setBob(true|0.05)  — toggle / set vertical bob amount (default 0.03u)
//   snapshot()         — debug state
//
// Render loop integration (two lines in main.js, matching CapeShield):
//   window.magicCarpetMain?.update?.();
//   window.magicCarpetMain?.drawOverlays?.(camera.viewProj, gl);

import { ClothSimulator, buildGridEdges } from "./ClothSim.js";

const VERT_SRC = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uViewProj;
out vec3 vNormal;
void main() {
    gl_Position = uViewProj * vec4(aPos, 1.0);
    vNormal = aNormal;
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in vec3 vNormal;
uniform vec4 uColor;
uniform vec3 uSunDir;       // v877: world-space sun direction (matches engine)
out vec4 outColor;
void main() {
    vec3 n = normalize(vNormal);
    float lambert = max(dot(n, uSunDir), 0.0);
    float ambient = 0.45;
    float light = ambient + lambert * 0.55;
    outColor = vec4(uColor.rgb * light, uColor.a);
}`;

// v881 — Minimal depth-only shader for shadow casting
const DEPTH_VERT_SRC = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
void main() {
    gl_Position = uLightVP * vec4(aPos, 1.0);
}`;
const DEPTH_FRAG_SRC = `#version 300 es
precision highp float;
void main() {}`;

let _program = null;
let _uViewProj = null;
let _uColor    = null;
let _uSunDir   = null;

let _depthProgram = null;
let _depthULightVP = null;

function _compileShader(gl, kind, src) {
    const sh = gl.createShader(kind);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error("[MagicCarpet] shader compile failed: " + log);
    }
    return sh;
}
function _getProgram(gl) {
    if (_program) return _program;
    const vs = _compileShader(gl, gl.VERTEX_SHADER,   VERT_SRC);
    const fs = _compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(p);
        gl.deleteProgram(p);
        throw new Error("[MagicCarpet] program link failed: " + log);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    _program = p;
    _uViewProj = gl.getUniformLocation(p, "uViewProj");
    _uColor    = gl.getUniformLocation(p, "uColor");
    _uSunDir   = gl.getUniformLocation(p, "uSunDir");
    return p;
}

// v881 — Depth program for shadow casting
function _getDepthProgram(gl) {
    if (_depthProgram) return _depthProgram;
    const vs = _compileShader(gl, gl.VERTEX_SHADER,   DEPTH_VERT_SRC);
    const fs = _compileShader(gl, gl.FRAGMENT_SHADER, DEPTH_FRAG_SRC);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(p);
        gl.deleteProgram(p);
        throw new Error("[MagicCarpet] depth program link failed: " + log);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    _depthProgram  = p;
    _depthULightVP = gl.getUniformLocation(p, "uLightVP");
    return p;
}

// Build a 5×5 grid carpet in LOCAL space (corners at ±halfW, ±halfD).
function _buildCarpetGeometry(width = 1.8, depth = 1.4, cols = 4, rows = 4) {
    const halfW = width * 0.5;
    const halfD = depth * 0.5;
    const stride = cols + 1;
    const positions = [];
    const indices   = [];
    for (let r = 0; r <= rows; r++) {
        const tz = r / rows;
        const z = -halfD + tz * depth;
        for (let c = 0; c <= cols; c++) {
            const tx = c / cols;
            const x = -halfW + tx * width;
            // Slight dome at center for visual interest
            const cx = (tx - 0.5), cz = (tz - 0.5);
            const dome = Math.max(0, (1 - 4*cx*cx) * (1 - 4*cz*cz)) * 0.05;
            positions.push(x, dome, z);
        }
    }
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const b0 = r * stride + c;
            const b1 = r * stride + c + 1;
            const b2 = (r + 1) * stride + c;
            const b3 = (r + 1) * stride + c + 1;
            indices.push(b0, b2, b1);
            indices.push(b1, b2, b3);
        }
    }
    return {
        positions: new Float32Array(positions),
        indices:   new Uint32Array(indices),
        cols, rows, stride,
        pinnedIndices: [0, cols, rows * stride, rows * stride + cols],
        cornerLocals: [
            [-halfW, 0, -halfD],   // back-left (using camera yaw, this is rear-left)
            [+halfW, 0, -halfD],
            [-halfW, 0, +halfD],   // forward-left
            [+halfW, 0, +halfD],
        ],
    };
}

class MagicCarpet {
    constructor({ gl }) {
        if (!gl) throw new Error("MagicCarpet: gl required");
        this.gl = gl;
        this.mounted = false;
        this.color = [0.65, 0.20, 0.20, 0.95];   // crimson Persian rug
        this.yOffset = -1.0;                      // 1u below camera (player's feet)
        this.bobAmount = 0.03;                    // ±0.03u vertical wave for floating feel
        this.bobEnabled = true;

        // v880 — Tilt state (visual lean based on movement)
        this._prevPos = null;       // previous frame camera position {x,y,z}
        this._prevYaw = null;       // previous frame camera yaw
        this._prevTime = 0;         // previous frame timestamp (ms)
        this._smoothFwdSpeed = 0;   // low-passed forward velocity (units/sec)
        this._smoothYawRate  = 0;   // low-passed yaw delta (rad/sec)
        this._pitch = 0;            // current carpet pitch (rad; +=tip forward)
        this._roll  = 0;            // current carpet roll  (rad; +=bank right)
        this.tiltEnabled = true;    // can be disabled via setTilt(false)

        // v880 — World collision state (opt-in)
        this.collisionEnabled = false;
        this._prevValidPos = null;  // last known non-solid camera position
        this._collisionStats = { hits: 0, lastHitAt: 0 };

        this.geom = _buildCarpetGeometry(1.8, 1.4, 4, 4);
        const edges = buildGridEdges(this.geom.positions, this.geom.rows, this.geom.cols);
        this.sim = new ClothSimulator({
            positions:     this.geom.positions,
            indices:       this.geom.indices,
            pinnedIndices: this.geom.pinnedIndices,
            edges,
            gravity: -0.4,                        // gentle (carpet shouldn't sag much)
            damping: 0.94,
            iters:   6,
            dtFixed: 1/60,
        });

        _getProgram(gl);
        this._initGL();
    }

    _initGL() {
        const gl = this.gl;
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        this.posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.geom.positions.length), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        this.nrmBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.nrmBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.geom.positions.length), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

        this.idxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.geom.indices, gl.STATIC_DRAW);

        gl.bindVertexArray(null);
        this.indexCount = this.geom.indices.length;
    }

    // v880 — Compute world position for a local-space point given current
    // camera state PLUS tilt (pitch + roll from movement). Carpet rotates
    // with camera yaw and additionally pitches forward + rolls sideways
    // proportional to player movement. Camera PITCH is ignored so the
    // carpet stays approximately horizontal (only the movement-tilt
    // affects pitch, not the player looking down).
    //
    // Rotation order: yaw (around Y) → pitch (around X) → roll (around Z).
    // Applied to local (lx, ly, lz), then translated by camera position
    // + yOffset + bob.
    _localToWorld(lx, ly, lz, cam) {
        // Yaw around Y
        const yaw = cam.yaw || 0;
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        let x1 = cy * lx + sy * lz;
        const y1 = ly;
        let z1 = -sy * lx + cy * lz;

        // Pitch around X (carpet's local X axis after yaw, which now points "right of camera")
        const cp = Math.cos(this._pitch), sp = Math.sin(this._pitch);
        const y2 = cp * y1 - sp * z1;
        let z2 = sp * y1 + cp * z1;

        // Roll around Z (carpet's local Z axis after yaw — points forward; roll rotates carpet around it)
        const cr = Math.cos(this._roll),  sr = Math.sin(this._roll);
        const x3 = cr * x1 - sr * y2;
        const y3 = sr * x1 + cr * y2;

        const wx = (cam.position?.x ?? 0) + x3;
        const wy = (cam.position?.y ?? 0) + this.yOffset + y3 + this._bobOffset;
        const wz = (cam.position?.z ?? 0) + z2;
        return [wx, wy, wz];
    }

    mount() {
        if (this.mounted) return;
        const cam = (typeof window !== "undefined") ? window.camera : null;
        if (!cam || !cam.position) {
            console.warn("[MagicCarpet] mount failed — no window.camera.position");
            return;
        }
        this._bobOffset = 0;
        // Initialize sim with all verts in their world-space rest position
        const initial = new Float32Array(this.geom.positions.length);
        for (let i = 0; i < this.geom.positions.length; i += 3) {
            const w = this._localToWorld(
                this.geom.positions[i + 0],
                this.geom.positions[i + 1],
                this.geom.positions[i + 2],
                cam
            );
            initial[i + 0] = w[0];
            initial[i + 1] = w[1];
            initial[i + 2] = w[2];
        }
        this.sim.initialize(initial);
        this.mounted = true;
        try { console.log("[MagicCarpet] mounted — flying with camera"); } catch {}
    }

    dismount() {
        this.mounted = false;
        try { console.log("[MagicCarpet] dismounted"); } catch {}
    }

    setColor(r, g, b, a) {
        this.color[0] = r; this.color[1] = g; this.color[2] = b;
        if (a !== undefined) this.color[3] = a;
    }

    setBob(amountOrToggle) {
        if (typeof amountOrToggle === "boolean") {
            this.bobEnabled = amountOrToggle;
        } else if (typeof amountOrToggle === "number") {
            this.bobAmount = Math.max(0, Math.min(0.3, amountOrToggle));
            this.bobEnabled = this.bobAmount > 0;
        }
    }

    // v880 — Toggle movement-based tilt (pitch from forward speed, roll from yaw rate)
    setTilt(enabled) {
        this.tiltEnabled = !!enabled;
        if (!this.tiltEnabled) {
            this._pitch = 0;
            this._roll  = 0;
            this._smoothFwdSpeed = 0;
            this._smoothYawRate  = 0;
        }
    }

    // v880 — Toggle world collision (opt-in; off by default to avoid
    // surprising the player by clamping their movement).
    setCollision(enabled) {
        this.collisionEnabled = !!enabled;
        if (!this.collisionEnabled) this._prevValidPos = null;
        try { console.log("[MagicCarpet] collision " + (this.collisionEnabled ? "ON" : "OFF")); } catch {}
    }

    snapshot() {
        const cam = (typeof window !== "undefined") ? window.camera : null;
        return {
            mounted: this.mounted,
            color: this.color.slice(),
            yOffset: this.yOffset,
            bobEnabled: this.bobEnabled,
            bobAmount: this.bobAmount,
            tiltEnabled: this.tiltEnabled,
            pitch: this._pitch,
            roll: this._roll,
            smoothFwdSpeed: this._smoothFwdSpeed,
            smoothYawRate:  this._smoothYawRate,
            collisionEnabled: this.collisionEnabled,
            collisionHits: this._collisionStats.hits,
            cameraPos: cam ? [cam.position?.x, cam.position?.y, cam.position?.z] : null,
            cameraYaw: cam?.yaw,
        };
    }

    update() {
        if (!this.mounted) return;
        const cam = (typeof window !== "undefined") ? window.camera : null;
        if (!cam || !cam.position) return;

        // v880 — World collision (opt-in). Check if camera moved into a
        // solid voxel; if so, restore previous valid position via
        // axis-sliding (so player can slide along walls rather than
        // getting stuck).
        if (this.collisionEnabled) {
            const w = (typeof window !== "undefined") ? window.world : null;
            if (w?.voxelAt) {
                const _isSolid = (x, y, z) => {
                    const v = w.voxelAt(Math.floor(x), Math.floor(y), Math.floor(z));
                    // 0 = air, 10/11 = water variants; everything else solid
                    return v !== 0 && v !== 10 && v !== 11;
                };
                const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
                if (this._prevValidPos == null) {
                    // First frame after enable: just record current pos as valid
                    if (!_isSolid(cx, cy, cz)) {
                        this._prevValidPos = { x: cx, y: cy, z: cz };
                    }
                } else {
                    const px = this._prevValidPos.x, py = this._prevValidPos.y, pz = this._prevValidPos.z;
                    // Axis-sliding: try X first (preserve Y, Z from prev), then Y, then Z
                    let okX = !_isSolid(cx, py, pz);
                    let okY = !_isSolid(okX ? cx : px, cy, pz);
                    let okZ = !_isSolid(okX ? cx : px, okY ? cy : py, cz);
                    const newX = okX ? cx : px;
                    const newY = okY ? cy : py;
                    const newZ = okZ ? cz : pz;
                    if (!okX || !okY || !okZ) {
                        cam.position.x = newX;
                        cam.position.y = newY;
                        cam.position.z = newZ;
                        this._collisionStats.hits++;
                        this._collisionStats.lastHitAt = performance.now();
                    }
                    this._prevValidPos = { x: newX, y: newY, z: newZ };
                }
            }
        } else {
            this._prevValidPos = null;
        }

        // v880 — Tilt: compute smoothed forward velocity + yaw rate from
        // frame-to-frame camera delta, lerped into pitch + roll angles.
        if (this.tiltEnabled) {
            const nowMs = performance.now();
            if (this._prevPos != null && this._prevTime > 0) {
                const dt = Math.max(0.001, Math.min(0.1, (nowMs - this._prevTime) / 1000));
                const dx = cam.position.x - this._prevPos.x;
                const dz = cam.position.z - this._prevPos.z;
                const yaw = cam.yaw || 0;
                // Forward direction in world XZ (FPS convention: forward = (+sin, 0, -cos) for camera looking down -Z at yaw=0)
                const fwdX = Math.sin(yaw), fwdZ = -Math.cos(yaw);
                const fwdSpeed = (dx * fwdX + dz * fwdZ) / dt;
                // Yaw rate (unwrap delta to nearest ±π)
                let yawDelta = (cam.yaw || 0) - this._prevYaw;
                while (yawDelta >  Math.PI) yawDelta -= 2 * Math.PI;
                while (yawDelta < -Math.PI) yawDelta += 2 * Math.PI;
                const yawRate = yawDelta / dt;
                // Low-pass smoothing (alpha = how fast to converge)
                const alpha = 0.15;
                this._smoothFwdSpeed = this._smoothFwdSpeed * (1 - alpha) + fwdSpeed * alpha;
                this._smoothYawRate  = this._smoothYawRate  * (1 - alpha) + yawRate  * alpha;
                // Pitch from forward speed (+ = tip nose down for diving-forward feel)
                const MAX_TILT = 0.25;   // ~14° max
                this._pitch = Math.max(-MAX_TILT, Math.min(MAX_TILT, this._smoothFwdSpeed * 0.04));
                // Roll from yaw rate (+ = bank right when turning right)
                this._roll  = Math.max(-MAX_TILT, Math.min(MAX_TILT, this._smoothYawRate  * 0.10));
            }
            this._prevPos  = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
            this._prevYaw  = cam.yaw || 0;
            this._prevTime = nowMs;
        } else {
            this._pitch = 0;
            this._roll  = 0;
        }

        // Vertical bob — slow sine wave for floating feel
        if (this.bobEnabled) {
            const t = performance.now() * 0.001 * 0.6;   // ~0.6Hz
            this._bobOffset = Math.sin(t) * this.bobAmount;
        } else {
            this._bobOffset = 0;
        }

        // Compute 4 corner pin anchors in world space
        const pinAnchors = new Float32Array(this.geom.pinnedIndices.length * 3);
        for (let k = 0; k < this.geom.cornerLocals.length; k++) {
            const c = this.geom.cornerLocals[k];
            const w = this._localToWorld(c[0], c[1], c[2], cam);
            pinAnchors[k * 3 + 0] = w[0];
            pinAnchors[k * 3 + 1] = w[1];
            pinAnchors[k * 3 + 2] = w[2];
        }

        this.sim.step(pinAnchors);

        // Upload buffers
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.sim.worldPos);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.nrmBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.sim.normals);
    }

    // v881 — Render carpet into the active shadow framebuffer.
    renderDepth(lightVP, gl) {
        if (!this.mounted) return;
        gl = gl || this.gl;
        const program = _getDepthProgram(gl);
        gl.useProgram(program);
        gl.uniformMatrix4fv(_depthULightVP, false, lightVP);

        // Two-sided depth
        const cullWasEnabled = gl.isEnabled(gl.CULL_FACE);
        gl.disable(gl.CULL_FACE);

        gl.bindVertexArray(this.vao);
        gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);

        if (cullWasEnabled) gl.enable(gl.CULL_FACE);
    }

    drawOverlays(viewProj, gl) {
        if (!this.mounted) return;
        gl = gl || this.gl;
        const program = _getProgram(gl);
        gl.useProgram(program);
        gl.uniformMatrix4fv(_uViewProj, false, viewProj);
        gl.uniform4fv(_uColor, this.color);
        // v877 — engine's sun direction for consistent lighting
        const sun = (typeof window !== "undefined" && window.renderer?.sunDir);
        if (sun && sun.length >= 3) {
            const L = Math.hypot(sun[0], sun[1], sun[2]) || 1;
            gl.uniform3f(_uSunDir, sun[0]/L, sun[1]/L, sun[2]/L);
        } else {
            gl.uniform3f(_uSunDir, 0.371, 0.789, 0.490);
        }

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        // v876 — explicitly save + restore cull state (lesson from v873 honest gap)
        const cullWasEnabled = gl.isEnabled(gl.CULL_FACE);
        gl.disable(gl.CULL_FACE);

        gl.bindVertexArray(this.vao);
        gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);

        gl.disable(gl.BLEND);
        if (cullWasEnabled) gl.enable(gl.CULL_FACE);
    }

    destroy() {
        const gl = this.gl;
        try {
            if (this.vao)    gl.deleteVertexArray(this.vao);
            if (this.posBuf) gl.deleteBuffer(this.posBuf);
            if (this.nrmBuf) gl.deleteBuffer(this.nrmBuf);
            if (this.idxBuf) gl.deleteBuffer(this.idxBuf);
        } catch {}
        this.mounted = false;
    }
}

export function installMagicCarpet(gl) {
    if (typeof window === "undefined") return null;
    if (window.magicCarpetMain) return window.magicCarpetMain;
    const carpet = new MagicCarpet({ gl });
    window.magicCarpetMain = carpet;
    window.magicCarpet = {
        mount:        (opts) => { carpet.mount(opts); return carpet.snapshot(); },
        dismount:     () => { carpet.dismount(); return carpet.snapshot(); },
        isMounted:    () => carpet.mounted,
        setColor:     (r, g, b, a) => { carpet.setColor(r, g, b, a); return carpet.color.slice(); },
        setBob:       (x) => { carpet.setBob(x); return { bobEnabled: carpet.bobEnabled, bobAmount: carpet.bobAmount }; },
        // v880
        setTilt:      (enabled) => { carpet.setTilt(enabled); return { tiltEnabled: carpet.tiltEnabled }; },
        setCollision: (enabled) => { carpet.setCollision(enabled); return { collisionEnabled: carpet.collisionEnabled }; },
        snapshot:     () => carpet.snapshot(),
    };
    try { console.log("[MagicCarpet] installed v880 — magicCarpet.mount() · .setTilt(true) · .setCollision(true) to enable world collision"); } catch {}
    return carpet;
}
