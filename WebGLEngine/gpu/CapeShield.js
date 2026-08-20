// FILE: gpu/CapeShield.js
// VERSION: v873 — Defensive cape-shield entity for kaiju/OGRE.
//
// First main-engine consumer of the v870 ClothSim module. Each shield
// is a 4×6 cloth grid pinned at its 4 corners, simulated each frame
// (verlet + constraints + face-normal recompute), drawn with a small
// dedicated shader. Designed to spawn in front of a kaiju or OGRE as
// a floating defensive barrier.
//
// API mirrors the engine's overlay-renderer pattern (rigSystem,
// worldLabels, beamRibbonRenderer): each frame the main render loop
// calls update() + drawOverlays(viewProj, gl). The shield owns its
// own GL state (shader, VAO, buffers, blend mode) — no integration
// with engine lighting/shadow pipeline in v873. Polish + lighting
// integration is a follow-up.
//
// Geometry layout (local space, before world transform):
//   width  = 2.0u  (X range: -1.0 to +1.0)
//   height = 2.5u  (Y range: -1.25 to +1.25)
//   plane oriented in +XY, facing +Z (so normal at rest = +Z)
//   4 corners pinned to world-space anchors derived from
//   position + facing rotation each frame.

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

// v881 — Minimal depth-only shader for shadow casting. Vertex transforms
// by light VP; fragment writes only depth (no color output).
const DEPTH_VERT_SRC = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
void main() {
    gl_Position = uLightVP * vec4(aPos, 1.0);
}`;
const DEPTH_FRAG_SRC = `#version 300 es
precision highp float;
void main() {}`;

// Shared shader program — compiled once, reused across all shield instances.
let _sharedProgram = null;
let _sharedUViewProj = null;
let _sharedUColor    = null;
let _sharedUSunDir   = null;

// v881 — Shared depth program for shadow casting.
let _depthProgram   = null;
let _depthULightVP  = null;

function _compileShader(gl, kind, src) {
    const sh = gl.createShader(kind);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error("[CapeShield] shader compile failed: " + log);
    }
    return sh;
}

function _getProgram(gl) {
    if (_sharedProgram) return _sharedProgram;
    const vs = _compileShader(gl, gl.VERTEX_SHADER,   VERT_SRC);
    const fs = _compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(p);
        gl.deleteProgram(p);
        throw new Error("[CapeShield] program link failed: " + log);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    _sharedProgram = p;
    _sharedUViewProj = gl.getUniformLocation(p, "uViewProj");
    _sharedUColor    = gl.getUniformLocation(p, "uColor");
    _sharedUSunDir   = gl.getUniformLocation(p, "uSunDir");
    return p;
}

// v881 — Compile + cache depth-only program for shadow casting
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
        throw new Error("[CapeShield] depth program link failed: " + log);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    _depthProgram  = p;
    _depthULightVP = gl.getUniformLocation(p, "uLightVP");
    return p;
}

// ─── Local geometry: 4×6 grid, plane in +XY ─────────────────────
function _buildShieldGeometry(width = 2.0, height = 2.5, cols = 4, rows = 6) {
    const halfW = width  * 0.5;
    const halfH = height * 0.5;
    const stride = cols + 1;
    const positions = [];
    const indices   = [];
    for (let r = 0; r <= rows; r++) {
        const ty = r / rows;
        const y = halfH - ty * height;             // top → bottom
        for (let c = 0; c <= cols; c++) {
            const tx = c / cols;
            const x = -halfW + tx * width;
            positions.push(x, y, 0);
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
        // 4-corner pin: TL, TR, BL, BR
        pinnedIndices: [0, cols, rows * stride, rows * stride + cols],
        // Local-space pin offsets (used to recompute world anchors each frame)
        cornerLocals: [
            [-halfW, +halfH, 0],   // TL
            [+halfW, +halfH, 0],   // TR
            [-halfW, -halfH, 0],   // BL
            [+halfW, -halfH, 0],   // BR
        ],
    };
}

let _nextId = 1;

export class CapeShield {
    /**
     * @param {Object} opts
     * @param {WebGL2RenderingContext} opts.gl
     * @param {[number,number,number]} [opts.position]  — world XYZ of shield center
     * @param {[number,number,number]} [opts.facing]    — facing direction; shield's +Z faces this way
     * @param {[number,number,number,number]} [opts.color] — RGBA; default semi-transparent blue
     * @param {number} [opts.width]                     — default 2.0u
     * @param {number} [opts.height]                    — default 2.5u
     * @param {number} [opts.hp]                        — default 100; v874 will tie this to combat
     * @param {number} [opts.lifetimeSec]               — default -1 (persistent). >0 = seconds remaining.
     */
    constructor(opts = {}) {
        if (!opts.gl) throw new Error("CapeShield: gl required");
        this.id = _nextId++;
        this.gl = opts.gl;
        this.alive = true;

        // World-space state
        this.position = (opts.position || [0, 5, 0]).slice();
        // Facing: which way the shield's front faces. Default: +Z (toward camera in typical setups)
        this.facing = (opts.facing || [0, 0, 1]).slice();
        this.up = [0, 1, 0];  // for now, world-up assumed
        this.baseColor = (opts.color || [0.45, 0.65, 1.0, 0.75]).slice();
        this.color = this.baseColor.slice();   // mutated by _updateColorFromHP each frame
        this.hp = (opts.hp !== undefined ? opts.hp : 100);
        this.maxHp = this.hp;
        this.lifetimeSec = (opts.lifetimeSec !== undefined ? opts.lifetimeSec : -1);
        this.spawnedAt = performance.now();

        // v875 — Optional kaiju attachment. When set, update() each frame
        // syncs this.position + this.facing from the kaiju's world position
        // so the shield tracks the kaiju while sitting between it and the
        // camera. Cleared automatically when the kaiju dies / despawns.
        this.attachedToKaijuId = opts.attachedToKaijuId ?? null;
        this.attachOffsetFromKaiju = opts.attachOffsetFromKaiju ?? 4.0;   // distance from kaiju center toward camera

        // Build geometry
        this.geom = _buildShieldGeometry(opts.width || 2.0, opts.height || 2.5, 4, 6);

        // Build sim
        const edges = buildGridEdges(this.geom.positions, this.geom.rows, this.geom.cols);
        this.sim = new ClothSimulator({
            positions:     this.geom.positions,
            indices:       this.geom.indices,
            pinnedIndices: this.geom.pinnedIndices,
            edges,
            gravity: -1.0,    // gentle pull (shields shouldn't sag dramatically)
            damping: 0.95,
            iters:   8,
            dtFixed: 1/60,
        });

        // Initialize sim positions: transform local geometry into world via current pose.
        // For first frame, just place verts at position + local (no rotation if facing = +Z).
        const initial = new Float32Array(this.geom.positions.length);
        this._computeAllWorldPositions(this.geom.positions, initial);
        this.sim.initialize(initial);

        // Wind off by default (shields are still in space; let them ripple from impacts later)
        this.sim.setWind(null);

        // GL state
        _getProgram(this.gl);
        this._initGL();
    }

    /**
     * Compute world XYZ for a local-space vert via the shield's current pose.
     * For v873 we use a simplified rotation: facing → +Z basis, world-up → +Y basis,
     * cross product → +X basis. (No quaternion needed for axis-aligned shields.)
     */
    _computeBasis() {
        const fz = this.facing;
        // Normalize facing
        const flen = Math.hypot(fz[0], fz[1], fz[2]) || 1;
        const f = [fz[0] / flen, fz[1] / flen, fz[2] / flen];
        // X basis = up × facing (right-hand rule)
        const up = this.up;
        const x = [
            up[1] * f[2] - up[2] * f[1],
            up[2] * f[0] - up[0] * f[2],
            up[0] * f[1] - up[1] * f[0],
        ];
        const xlen = Math.hypot(x[0], x[1], x[2]) || 1;
        const X = [x[0] / xlen, x[1] / xlen, x[2] / xlen];
        // Y basis = facing × X (re-orthogonalize)
        const Y = [
            f[1] * X[2] - f[2] * X[1],
            f[2] * X[0] - f[0] * X[2],
            f[0] * X[1] - f[1] * X[0],
        ];
        return { X, Y, Z: f };
    }

    _computeAllWorldPositions(localPositions, outWorld) {
        const { X, Y, Z } = this._computeBasis();
        const px = this.position[0], py = this.position[1], pz = this.position[2];
        for (let i = 0; i < localPositions.length; i += 3) {
            const lx = localPositions[i + 0];
            const ly = localPositions[i + 1];
            const lz = localPositions[i + 2];
            outWorld[i + 0] = px + X[0]*lx + Y[0]*ly + Z[0]*lz;
            outWorld[i + 1] = py + X[1]*lx + Y[1]*ly + Z[1]*lz;
            outWorld[i + 2] = pz + X[2]*lx + Y[2]*ly + Z[2]*lz;
        }
    }

    _computeCornerWorld(outAnchors) {
        const { X, Y, Z } = this._computeBasis();
        const px = this.position[0], py = this.position[1], pz = this.position[2];
        for (let k = 0; k < 4; k++) {
            const c = this.geom.cornerLocals[k];
            const lx = c[0], ly = c[1], lz = c[2];
            outAnchors[k * 3 + 0] = px + X[0]*lx + Y[0]*ly + Z[0]*lz;
            outAnchors[k * 3 + 1] = py + X[1]*lx + Y[1]*ly + Z[1]*lz;
            outAnchors[k * 3 + 2] = pz + X[2]*lx + Y[2]*ly + Z[2]*lz;
        }
    }

    _initGL() {
        const gl = this.gl;
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        this.posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, this.sim.worldPos, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        this.nrmBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.nrmBuf);
        // Initialize with zero normals; sim.step() will write real ones next frame
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.sim.normals.length), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

        this.idxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.geom.indices, gl.STATIC_DRAW);

        gl.bindVertexArray(null);
        this.indexCount = this.geom.indices.length;
    }

    // ─── Public API ─────────────────────────────────────────────
    setPosition(x, y, z) { this.position[0] = x; this.position[1] = y; this.position[2] = z; }
    setFacing(x, y, z)   { this.facing[0] = x; this.facing[1] = y; this.facing[2] = z; }
    setColor(r, g, b, a) { this.baseColor[0] = r; this.baseColor[1] = g; this.baseColor[2] = b; this.baseColor[3] = a === undefined ? this.baseColor[3] : a; }

    takeDamage(amount) {
        this.hp = Math.max(0, this.hp - amount);
        if (this.hp <= 0) this.alive = false;
    }

    // v875 — Apply an impact at a world-space point. Finds the nearest
    // non-pinned vertex (within a small radius), pushes it inward
    // (opposite of `direction` if given, else from shield center toward
    // the impact point), and sets prev-pos behind it so the verlet
    // sim gives it an inward velocity that springs back over the next
    // ~10 frames. Neighbors get partial impulse.
    //
    // @param {[number,number,number]} worldPos — where the projectile hit
    // @param {[number,number,number]} [direction] — direction of incoming projectile (normalized)
    // @param {number} [strength] — impulse magnitude in world units (default 0.4)
    applyImpact(worldPos, direction, strength = 0.4) {
        if (!this.sim || !this.sim.initialized) return;
        const wp = this.sim.worldPos;
        const prev = this.sim.prevWorldPos;
        // Direction the verts should be pushed (opposite of incoming projectile)
        let px = -((direction?.[0]) || 0);
        let py = -((direction?.[1]) || 0);
        let pz = -((direction?.[2]) || 0);
        if (Math.hypot(px, py, pz) < 1e-4) {
            // Fall back: push along the negative of facing (into the shield)
            px = -this.facing[0]; py = -this.facing[1]; pz = -this.facing[2];
        }
        const plen = Math.hypot(px, py, pz) || 1;
        px /= plen; py /= plen; pz /= plen;

        // Find verts within radius of the impact point + apply impulse weighted by closeness
        const RADIUS = 0.8;            // verts within this distance get pushed
        const RADIUS_SQ = RADIUS * RADIUS;
        for (let i = 0; i < this.sim.vertCount; i++) {
            if (this.sim.pinnedSet.has(i)) continue;
            const i3 = i * 3;
            const dx = wp[i3 + 0] - worldPos[0];
            const dy = wp[i3 + 1] - worldPos[1];
            const dz = wp[i3 + 2] - worldPos[2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= RADIUS_SQ) continue;
            // Falloff: closer = stronger impulse (linear)
            const t = 1.0 - Math.sqrt(d2) / RADIUS;
            const impulse = strength * t;
            // Inward push: move BACK in prev-pos so verlet propels current forward
            prev[i3 + 0] = wp[i3 + 0] - px * impulse;
            prev[i3 + 1] = wp[i3 + 1] - py * impulse;
            prev[i3 + 2] = wp[i3 + 2] - pz * impulse;
        }

        // v877 — Hit VFX: spawn a small particle burst at the impact point.
        // Color matches shield's current HP color (blue=fresh, orange/red=low).
        // Sparks fly outward away from the shield surface, along the incoming
        // projectile direction (so it looks like the projectile bounced off
        // shattering into shards).
        try {
            const ps = (typeof window !== "undefined") ? window.particles : null;
            if (ps?.spawn) {
                const cr = this.color[0], cg = this.color[1], cb = this.color[2];
                // p = -direction; spark direction = -p = direction (incoming → outgoing reverse, deflected back)
                const sx = -px, sy = -py, sz = -pz;
                const rand = (a, b) => a + Math.random() * (b - a);
                for (let i = 0; i < 12; i++) {
                    ps.spawn({
                        x: worldPos[0], y: worldPos[1], z: worldPos[2],
                        vx: sx * rand(2, 5) + rand(-1.5, 1.5),
                        vy: sy * rand(2, 5) + rand(-1.5, 1.5) + 1,    // slight upward bias
                        vz: sz * rand(2, 5) + rand(-1.5, 1.5),
                        ttl: rand(0.4, 0.9),
                        size: rand(0.15, 0.35),
                        r: Math.min(1, cr * 1.4),
                        g: Math.min(1, cg * 1.4),
                        b: Math.min(1, cb * 1.4),
                        a: 0.9,
                        gravity: -4,
                    });
                }
            }
        } catch {}
    }

    // v875 — Attach this shield to a kaiju. Each frame, position
    // sync runs in update(): shield placed between the kaiju and the
    // camera, facing the camera.
    attachToKaiju(kaijuId) {
        this.attachedToKaijuId = kaijuId;
    }
    detachFromKaiju() {
        this.attachedToKaijuId = null;
    }

    // v875 — HP → color blend. As HP drops:
    //   100% → baseColor (blue)
    //    50% → orange-amber
    //     0% → red, slightly more transparent
    _updateColorFromHP() {
        const ratio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
        // Lerp baseColor → orange at 50%, orange → red at 0%
        const ORANGE = [0.95, 0.55, 0.15, 0.75];
        const RED    = [0.95, 0.25, 0.20, 0.55];   // also more transparent
        let cr, cg, cb, ca;
        if (ratio >= 0.5) {
            // ratio 0.5..1.0 → blend orange (0.5) → base (1.0)
            const t = (ratio - 0.5) * 2;
            cr = ORANGE[0] + (this.baseColor[0] - ORANGE[0]) * t;
            cg = ORANGE[1] + (this.baseColor[1] - ORANGE[1]) * t;
            cb = ORANGE[2] + (this.baseColor[2] - ORANGE[2]) * t;
            ca = ORANGE[3] + (this.baseColor[3] - ORANGE[3]) * t;
        } else {
            // ratio 0..0.5 → blend red (0) → orange (0.5)
            const t = ratio * 2;
            cr = RED[0] + (ORANGE[0] - RED[0]) * t;
            cg = RED[1] + (ORANGE[1] - RED[1]) * t;
            cb = RED[2] + (ORANGE[2] - RED[2]) * t;
            ca = RED[3] + (ORANGE[3] - RED[3]) * t;
        }
        this.color[0] = cr;
        this.color[1] = cg;
        this.color[2] = cb;
        this.color[3] = ca;
    }

    // Called once per frame from CapeShieldManager. Steps the sim
    // (cape physics) and checks lifetime/HP.
    update() {
        if (!this.alive) return;

        // v875 — If attached to a kaiju, sync position+facing from it.
        // Shield sits between the kaiju and the camera (so player-fired
        // projectiles hit the shield before reaching the kaiju).
        if (this.attachedToKaijuId != null && typeof window !== "undefined") {
            const km = window.kaijuManager;
            const k = km?.kaiju?.get?.(this.attachedToKaijuId);
            if (!k || k.energy === 0) {
                this.alive = false;
                return;
            }
            const cam = window.camera;
            if (cam) {
                // Direction from kaiju to camera
                let dx = (cam.position?.x ?? 0) - k.position.x;
                let dy = (cam.position?.y ?? 0) - k.position.y;
                let dz = (cam.position?.z ?? 0) - k.position.z;
                const dlen = Math.hypot(dx, dy, dz) || 1;
                dx /= dlen; dy /= dlen; dz /= dlen;
                const off = this.attachOffsetFromKaiju;
                this.position[0] = k.position.x + dx * off;
                this.position[1] = k.position.y + dy * off + 1.5;   // slight Y lift
                this.position[2] = k.position.z + dz * off;
                // Shield faces toward camera
                this.facing[0] = dx; this.facing[1] = dy; this.facing[2] = dz;
            }
        }

        // Lifetime decay
        if (this.lifetimeSec > 0) {
            const ageSec = (performance.now() - this.spawnedAt) / 1000;
            if (ageSec >= this.lifetimeSec) {
                this.alive = false;
                return;
            }
        }

        // Recompute pin anchors based on current position/facing
        const pinAnchors = new Float32Array(this.geom.pinnedIndices.length * 3);
        this._computeCornerWorld(pinAnchors);

        // Step the sim
        this.sim.step(pinAnchors);

        // v875 — color tracks HP each frame (blue → orange → red)
        this._updateColorFromHP();

        // Upload positions + normals to GPU
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.sim.worldPos);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.nrmBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.sim.normals);
    }

    // Called from the engine's render loop. viewProj is the camera's
    // matrix; gl is the WebGL2 context (same we constructed with).
    // v881 — Render shield into the active shadow framebuffer. Called
    // inside the engine's shadowPass.bind()/unbind() block. Reuses the
    // existing position buffer (depth shader only needs attribute 0 =
    // position). Two-sided + opaque depth (shield casts a full-strength
    // shadow regardless of color alpha — receivers get the silhouette).
    renderDepth(lightVP, gl) {
        if (!this.alive) return;
        gl = gl || this.gl;
        const program = _getDepthProgram(gl);
        gl.useProgram(program);
        gl.uniformMatrix4fv(_depthULightVP, false, lightVP);

        // Two-sided depth so both faces contribute to shadow
        const cullWasEnabled = gl.isEnabled(gl.CULL_FACE);
        gl.disable(gl.CULL_FACE);

        gl.bindVertexArray(this.vao);
        gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);

        if (cullWasEnabled) gl.enable(gl.CULL_FACE);
    }

    drawOverlays(viewProj, gl) {
        if (!this.alive) return;
        gl = gl || this.gl;
        const program = _getProgram(gl);
        gl.useProgram(program);
        gl.uniformMatrix4fv(_sharedUViewProj, false, viewProj);
        gl.uniform4fv(_sharedUColor, this.color);
        // v877 — use engine's sun direction if available; fallback to default
        const sun = (typeof window !== "undefined" && window.renderer?.sunDir);
        if (sun && sun.length >= 3) {
            // Normalize
            const L = Math.hypot(sun[0], sun[1], sun[2]) || 1;
            gl.uniform3f(_sharedUSunDir, sun[0]/L, sun[1]/L, sun[2]/L);
        } else {
            gl.uniform3f(_sharedUSunDir, 0.371, 0.789, 0.490);  // hardcoded default
        }

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        // v877 — explicit save+restore of cull state (closes v873 honest gap about state leak)
        const cullWasEnabled = gl.isEnabled(gl.CULL_FACE);
        gl.disable(gl.CULL_FACE);                 // shield is two-sided

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
        this.alive = false;
    }
}
