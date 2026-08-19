// =============================================================================
// FILE: /render/GPUParticles.js
// ROUND: 401
// =============================================================================
//
// Hardened WebGL2 transform-feedback particle system. Drives 100k+ particles
// fully on the GPU — physics in the vertex shader, no CPU round-trip per
// frame, no per-frame allocations on the hot path.
//
// This is a from-scratch take on the pattern. The version this project was
// handed earlier looked correct on the surface but had four hot-path bugs
// that would have made it slower than the existing CPU debris system:
//
//   1. CPU mirror + 131k spawn() calls per frame on the resync path — that
//      defeats the entire point of keeping particles GPU-resident.
//   2. WEBGL_multi_draw used to draw N identical 1-instance quads. That's
//      strictly worse than a single drawArraysInstanced(... N).
//   3. New Int32Array allocation per particle per frame for the multi-draw
//      params buffer.
//   4. The "fragment shader voxelizer" never bound a 3D-texture FBO, so
//      it rasterized into the screen and the density texture stayed empty.
//
// This module fixes all of those:
//
//   • Particles live exclusively on the GPU after spawn. There is no CPU
//     mirror and no per-frame readback.
//   • Spawns are STAGED into a pre-allocated Float32Array (capacity fixed at
//     construction). update() uploads the whole batch in one (or at-most-two
//     when the ring wraps) bufferSubData calls.
//   • Update path: drawArrays(POINTS, 0, aliveCount) with transform feedback
//     writing into the back buffer. RASTERIZER_DISCARD on so no fragments.
//   • Render path: a single drawArraysInstanced(TRIANGLE_STRIP, 0, 4, N).
//     Per-instance attributes via divisor=1; quad corners come from
//     gl_VertexID — no quad VBO needed.
//   • Recycling: a write cursor advances modulo capacity. When it wraps,
//     the oldest particles get overwritten — natural FIFO recycling with no
//     free list to manage.
//
// USAGE:
//
//   const particles = new GPUParticles(gl, { maxParticles: 100000 });
//   if (!particles.isSupported()) {
//       // WebGL1 fallback: skip GPU particles, use the CPU debris system
//   }
//
//   // From kaiju AI, civ destruction, etc:
//   particles.spawnBurst({
//       x: kaiju.x, y: kaiju.y + 20, z: kaiju.z,
//       count:      80,
//       speed:      18,
//       direction:  [0, 1, 0],
//       spreadAngle: 0.8,
//       life:       2.5,
//       size:       0.4,
//   });
//
//   // From main render loop, each frame:
//   particles.update(dt);
//   particles.render(camera);          // camera.viewProj, .right, .up
//
// PER-INSTANCE LAYOUT (32 bytes, 8 floats):
//   bytes  0..11   pos      (vec3 world position)
//   bytes  12..23  vel      (vec3 world-space velocity)
//   bytes  24..27  life     (float, seconds remaining; <= 0 = dead)
//   bytes  28..31  size     (float, world-units half-extent of the quad)

// v411 — per-particle color. Stride grew from 8 floats (32 bytes) to
// 11 floats (44 bytes): pos(3) vel(3) lifeSize(2) color(3). Color is
// carried through transform feedback unchanged so each particle keeps
// the color it was spawned with — different effects (tree dust, ember,
// monument light, requiem smoke) now read as different hues in the
// same particle system, instead of sharing one global color uniform.
// v413 — per-particle shape (round 413). Stride grew 11→12 floats
// (44→48 bytes): pos(3) vel(3) lifeSize(2) color(3) shape(1). The shape
// index selects a procedural sprite look in the fragment shader (soft
// blob / spark / ring / flare / smoke) so different effects read
// distinctly without uploading any textures. Carried through transform
// feedback like color.
const STRIDE_BYTES   = 48;
const STRIDE_FLOATS  = 12;

// Module-level fallback vectors so render() doesn't allocate when the
// camera object happens to be missing the .right / .up fields. Typed
// arrays can't be frozen, but these are private to the module and only
// passed to gl.uniform3fv (which reads, never writes).
const FALLBACK_RIGHT = new Float32Array([1, 0, 0]);
const FALLBACK_UP    = new Float32Array([0, 1, 0]);
// Reusable scratch buffers for compute-right/up-from-yaw — also
// pre-allocated, never reallocated on the hot path.
const SCRATCH_RIGHT = new Float32Array(3);
const SCRATCH_UP    = new Float32Array(3);
const WHITE         = new Float32Array([1, 1, 1]);   // v411 default tint

const UPDATE_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aVel;
layout(location = 2) in vec2 aLifeSize;
layout(location = 3) in vec3 aColor;
layout(location = 4) in float aShape;

out vec3 vPos;
out vec3 vVel;
out vec2 vLifeSize;
out vec3 vColor;
out float vShape;

uniform float uDT;
uniform float uGravity;
uniform float uDrag;

void main() {
    float life = aLifeSize.x - uDT;
    vec3  vel  = aVel;
    vec3  pos  = aPos;
    if (life > 0.0) {
        // Frame-rate-independent linear drag: vel *= exp(-drag * dt)
        // is correct for all dt. For small drag*dt this approaches the
        // simpler (1 - drag*dt) form.
        vel *= exp(-uDrag * uDT);
        vel.y -= uGravity * uDT;
        pos  += vel * uDT;
    } else {
        life = 0.0;
        // Freeze dead particles in place. Their next-frame update will
        // see life <= 0 again and skip the integration, so they're a
        // no-op cost-wise besides the shader invocation.
    }
    vPos = pos;
    vVel = vel;
    vLifeSize = vec2(life, aLifeSize.y);
    vColor = aColor;     // carried through unchanged
    vShape = aShape;     // carried through unchanged
}
`;

// Transform feedback skips fragment processing — we still need a fragment
// shader for WebGL2 to accept the program, but it never runs.
const UPDATE_FS = `#version 300 es
precision mediump float;
out vec4 oColor;
void main() { oColor = vec4(0.0); }
`;

const RENDER_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aVel;       // available for shader-side variation if wanted
layout(location = 2) in vec2 aLifeSize;
layout(location = 3) in vec3 aColor;
layout(location = 4) in float aShape;

uniform mat4 uViewProj;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;

out vec2  vUV;
out float vAlpha;
out vec3  vColor;
flat out float vShape;

void main() {
    float life = aLifeSize.x;
    float size = aLifeSize.y;

    if (life <= 0.0 || size <= 0.0) {
        // Cull dead particles: push past the far plane.
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        vUV = vec2(0.5);
        vAlpha = 0.0;
        vColor = vec3(0.0);
        vShape = 0.0;
        return;
    }

    // Quad corners from gl_VertexID 0..3 (TRIANGLE_STRIP order):
    //   0 = (-1, -1)   1 = (+1, -1)   2 = (-1, +1)   3 = (+1, +1)
    float fx = float(gl_VertexID & 1);
    float fy = float((gl_VertexID >> 1) & 1);
    vec2 corner = vec2(fx * 2.0 - 1.0, fy * 2.0 - 1.0);

    vec3 worldPos = aPos
                  + uCameraRight * (corner.x * size)
                  + uCameraUp    * (corner.y * size);
    gl_Position = uViewProj * vec4(worldPos, 1.0);

    vUV    = corner * 0.5 + 0.5;
    // Fade out over the last ~0.5 seconds of life
    vAlpha = clamp(life * 2.0, 0.0, 1.0);
    vColor = aColor;
    vShape = aShape;
}
`;

const RENDER_FS = `#version 300 es
precision highp float;

in vec2  vUV;
in float vAlpha;
in vec3  vColor;
flat in float vShape;
out vec4 oColor;

uniform vec3 uTint;     // global multiplier (default white); per-particle color is primary

void main() {
    if (vAlpha <= 0.0) discard;
    vec2 d = vUV * 2.0 - 1.0;     // -1..1 across the quad
    float r2 = dot(d, d);
    float r  = sqrt(r2);
    int shape = int(vShape + 0.5);
    float a;

    if (shape == 1) {
        // SPARK — tight bright core, fast falloff. Embers, hot sparks.
        if (r2 > 1.0) discard;
        float f = 1.0 - r2;
        a = f * f * f * f + smoothstep(0.18, 0.0, r) * 0.9;
    } else if (shape == 2) {
        // RING — bright annulus, hollow center. Lure lights, pulses.
        float ring = 1.0 - smoothstep(0.0, 0.32, abs(r - 0.62));
        if (ring <= 0.01) discard;
        a = ring;
    } else if (shape == 3) {
        // FLARE — soft core plus a 4-point cross. Monument apex, magic.
        if (r > 1.2) discard;
        float core = smoothstep(1.0, 0.0, r);
        float cross = max(
            smoothstep(0.10, 0.0, abs(d.x)) * smoothstep(1.0, 0.0, abs(d.y)),
            smoothstep(0.10, 0.0, abs(d.y)) * smoothstep(1.0, 0.0, abs(d.x)));
        a = max(core * core, cross * 0.8);
    } else if (shape == 4) {
        // SMOKE — very soft, low-density wide blob. Plumes, haze.
        if (r2 > 1.0) discard;
        float f = 1.0 - r2;
        a = f * 0.45;
    } else {
        // 0 = SOFT BLOB (default) — the original round particle.
        if (r2 > 1.0) discard;
        float f = 1.0 - r2;
        a = f * f;
    }

    oColor = vec4(vColor * uTint, a * vAlpha);
}
`;

export class GPUParticles {
    constructor(gl, opts = {}) {
        this.gl              = gl;
        this.maxParticles    = opts.maxParticles    ?? 100000;
        this.maxSpawnsPerFlush = opts.maxSpawnsPerFlush ?? 4096;
        this.gravity         = opts.gravity         ?? 9.8;
        this.drag            = opts.drag             ?? 0.5;
        this.color           = opts.color            ?? [1.0, 0.7, 0.3];   // ember

        // Lifecycle state
        this.supported    = false;
        this.aliveCount   = 0;     // count of slots whose data is "real" particles
        this.writeCursor  = 0;     // next slot to overwrite on spawn
        this.current      = 0;     // which ping-pong buffer holds the latest state

        // Pre-allocated spawn staging — fixed size, never reallocates.
        this.staging      = new Float32Array(this.maxSpawnsPerFlush * STRIDE_FLOATS);
        this.stagingCount = 0;

        // GPU resources (filled by _init)
        this.buffers      = null;
        this.updateVaos   = null;
        this.renderVaos   = null;
        this.tf           = null;
        this.updateProg   = null;
        this.renderProg   = null;

        this._init();
    }

    /**
     * Returns false on WebGL1 contexts or when WebGL2 transform feedback
     * isn't usable. Caller should fall back to a CPU particle path.
     */
    isSupported() { return this.supported; }

    /**
     * Stage one particle for upload to the GPU on the next update().
     * Returns false if the staging buffer is full (caller can wait one
     * frame and try again; bumping maxSpawnsPerFlush in the constructor
     * is the right fix for high-spawn-rate scenes).
     */
    spawn(p) {
        if (!this.supported) return false;
        if (this.stagingCount >= this.maxSpawnsPerFlush) return false;
        const off = this.stagingCount * STRIDE_FLOATS;
        const s   = this.staging;
        s[off]     = p.x  ?? 0;
        s[off + 1] = p.y  ?? 0;
        s[off + 2] = p.z  ?? 0;
        s[off + 3] = p.vx ?? 0;
        s[off + 4] = p.vy ?? 0;
        s[off + 5] = p.vz ?? 0;
        s[off + 6] = p.life ?? 2.0;
        s[off + 7] = p.size ?? 1.0;
        // v411 — per-particle color. Accept either {r,g,b} or
        // {color:[r,g,b]}; default to the system color (this.color).
        const dc = this.color;
        s[off + 8]  = p.r ?? p.color?.[0] ?? dc[0];
        s[off + 9]  = p.g ?? p.color?.[1] ?? dc[1];
        s[off + 10] = p.b ?? p.color?.[2] ?? dc[2];
        // v413 — shape index (0 soft / 1 spark / 2 ring / 3 flare / 4 smoke)
        s[off + 11] = p.shape ?? 0;
        this.stagingCount++;
        return true;
    }

    /**
     * Emit a cone of particles from a point. Cheaper at call sites than
     * looping spawn() — and the parameter math is the case kaiju AI keeps
     * reaching for.
     *
     *   spawnBurst({
     *     x, y, z,           origin in world units
     *     count,              how many to emit (clamped to remaining capacity)
     *     speed,               m/s base velocity
     *     direction: [x,y,z],   normalized; default = +Y (upward)
     *     spreadAngle,           radians from the direction axis (0 = laser, π = full sphere)
     *     life, size,             passed through to each particle
     *   })
     *
     * Returns the number of particles actually spawned (may be less than
     * count if the staging buffer is near full).
     */
    spawnBurst(opts) {
        if (!this.supported) return 0;
        const cx = opts.x ?? 0, cy = opts.y ?? 0, cz = opts.z ?? 0;
        const speed = opts.speed ?? 10;
        const life  = opts.life  ?? 2.0;
        const size  = opts.size  ?? 0.5;
        const count = opts.count ?? 20;
        const dx = opts.direction?.[0] ?? 0;
        const dy = opts.direction?.[1] ?? 1;
        const dz = opts.direction?.[2] ?? 0;
        const spread = opts.spreadAngle ?? 0.6;
        // v411 — optional per-burst color (passes to each particle).
        const r = opts.r ?? opts.color?.[0];
        const g = opts.g ?? opts.color?.[1];
        const b = opts.b ?? opts.color?.[2];
        const shape = opts.shape ?? 0;     // v413 — per-burst shape

        // Build a basis around (dx, dy, dz). Pick an axis not parallel to it
        // for the "up" reference, then cross to get a tangent plane.
        const dl = Math.hypot(dx, dy, dz) || 1;
        const fwd = [dx / dl, dy / dl, dz / dl];
        const refA = Math.abs(fwd[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
        const right = _normalize(_cross(refA, fwd));
        const up    = _cross(fwd, right);

        let spawned = 0;
        for (let i = 0; i < count; i++) {
            // Random direction inside a cone of half-angle `spread`
            const phi      = Math.random() * Math.PI * 2;
            const cosTheta = 1 - Math.random() * (1 - Math.cos(spread));
            const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
            const rx = sinTheta * Math.cos(phi);
            const ry = cosTheta;
            const rz = sinTheta * Math.sin(phi);
            // ry is along fwd; rx along right; rz along up.
            const vx = (right[0] * rx + fwd[0] * ry + up[0] * rz) * speed;
            const vy = (right[1] * rx + fwd[1] * ry + up[1] * rz) * speed;
            const vz = (right[2] * rx + fwd[2] * ry + up[2] * rz) * speed;
            if (!this.spawn({ x: cx, y: cy, z: cz, vx, vy, vz, life, size, r, g, b, shape })) break;
            spawned++;
        }
        return spawned;
    }

    /**
     * Advance the simulation by `dt` seconds and absorb any pending spawns.
     *
     * Order of operations:
     *   1. Run transform feedback: read buffer A → write buffer B with
     *      all alive particles' positions integrated.
     *   2. Upload staged spawns into buffer B at writeCursor. This either
     *      a single bufferSubData (fits) or two (wraps).
     *   3. Make B the current buffer; A is the next frame's write target.
     */
    update(dt) {
        if (!this.supported) return;
        // v403 — fast path: nothing to integrate AND nothing to spawn.
        // Skip even the ping-pong swap; no GL calls at all this frame.
        if (this.aliveCount === 0 && this.stagingCount === 0) return;

        const gl    = this.gl;
        const read  = this.current;
        const write = 1 - read;

        // 1. Transform feedback pass — read → write.
        if (this.aliveCount > 0) {
            gl.useProgram(this.updateProg.handle);
            gl.bindVertexArray(this.updateVaos[read]);
            gl.uniform1f(this.updateProg.uDT,      dt);
            gl.uniform1f(this.updateProg.uGravity, this.gravity);
            gl.uniform1f(this.updateProg.uDrag,    this.drag);

            gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.tf);
            gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.buffers[write]);

            gl.enable(gl.RASTERIZER_DISCARD);
            gl.beginTransformFeedback(gl.POINTS);
            gl.drawArrays(gl.POINTS, 0, this.aliveCount);
            gl.endTransformFeedback();
            gl.disable(gl.RASTERIZER_DISCARD);

            gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
            gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
            gl.bindVertexArray(null);
        }

        // 2. Flush spawn staging into the just-written buffer.
        if (this.stagingCount > 0) {
            this._flushSpawnsInto(this.buffers[write]);
        }

        // 3. Swap.
        this.current = write;
    }

    /**
     * Draw the current particles as camera-facing soft quads. Expects a
     * camera object with `viewProj` (mat4 as Float32Array(16)), `right`
     * (vec3), and `up` (vec3). The engine's camera class already exposes
     * these; if it doesn't have viewProj packed, pre-compose it before
     * calling.
     */
    render(camera) {
        if (!this.supported) return;
        if (this.aliveCount === 0) return;
        const gl = this.gl;

        // v403 — sanity check, ONE TIME ONLY (not per frame), that the
        // caller's camera carries the matrix we need.
        if (!camera?.viewProj && !this._warnedNoViewProj) {
            this._warnedNoViewProj = true;
            console.warn("[GPUParticles] camera is missing viewProj — particles will not render correctly");
        }

        gl.useProgram(this.renderProg.handle);
        gl.bindVertexArray(this.renderVaos[this.current]);
        gl.uniformMatrix4fv(this.renderProg.uViewProj, false, camera.viewProj);

        // v403 — Resolve right/up. Order of preference:
        //   1. camera.right / camera.up if present (mat4 row vectors)
        //   2. Derive from camera.yaw / camera.pitch (the engine's
        //      convention: yaw=0 looks toward -Z, +X is right)
        //   3. World axes (last-resort frozen constants)
        let right = camera.right, up = camera.up;
        if (!right && typeof camera.yaw === "number") {
            const yaw = camera.yaw;
            const pitch = camera.pitch ?? 0;
            // right = perpendicular to forward on XZ plane
            SCRATCH_RIGHT[0] = Math.cos(yaw);
            SCRATCH_RIGHT[1] = 0;
            SCRATCH_RIGHT[2] = Math.sin(yaw);
            // up = world Y rotated by pitch around the right axis
            SCRATCH_UP[0] = Math.sin(yaw) * Math.sin(pitch);
            SCRATCH_UP[1] = Math.cos(pitch);
            SCRATCH_UP[2] = -Math.cos(yaw) * Math.sin(pitch);
            right = SCRATCH_RIGHT;
            up    = SCRATCH_UP;
        }
        gl.uniform3fv(this.renderProg.uCameraRight, right ?? FALLBACK_RIGHT);
        gl.uniform3fv(this.renderProg.uCameraUp,    up    ?? FALLBACK_UP);
        // v411 — per-particle color is primary; uTint is a global
        // multiplier left at white. (A future caller could pulse the
        // whole system brighter/darker by setting this.tint.)
        gl.uniform3fv(this.renderProg.uTint, this.tint ?? WHITE);

        // v403 — drop the gl.isEnabled / gl.getParameter state reads.
        // Those are synchronous CPU/GPU sync points; calling them every
        // particle draw introduced visible stutter when the GPU was
        // already busy. Instead, set the state we need, then restore to
        // the engine's known defaults (BLEND off, DEPTH_WRITE on).
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);

        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.aliveCount);

        // Restore to engine defaults (NOT to whatever-was-set-before).
        // The engine's draws assume these defaults at their entry.
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(null);
    }

    /**
     * Reset alive counter + cursor. Doesn't zero the GPU buffer contents
     * — there's no reason to; future spawns will overwrite slots and the
     * update shader skips slots with life <= 0 anyway.
     */
    clear() {
        this.aliveCount   = 0;
        this.writeCursor  = 0;
        this.stagingCount = 0;
    }

    /**
     * Free all GL resources. Call before discarding the instance.
     */
    destroy() {
        if (!this.supported) return;
        const gl = this.gl;
        if (this.buffers)    for (const b of this.buffers)    gl.deleteBuffer(b);
        if (this.updateVaos) for (const v of this.updateVaos) gl.deleteVertexArray(v);
        if (this.renderVaos) for (const v of this.renderVaos) gl.deleteVertexArray(v);
        if (this.tf)         gl.deleteTransformFeedback(this.tf);
        if (this.updateProg) gl.deleteProgram(this.updateProg.handle);
        if (this.renderProg) gl.deleteProgram(this.renderProg.handle);
        this.supported = false;
    }

    get capacity() { return this.maxParticles; }
    get pendingSpawns() { return this.stagingCount; }

    // ---- internals ----

    _init() {
        const gl = this.gl;
        // WebGL2 detection via a constant only present on WebGL2 contexts
        if (!gl || typeof gl.createTransformFeedback !== "function") {
            console.warn("[GPUParticles] WebGL2 transform feedback unavailable; particles disabled");
            return;
        }
        try {
            this._initBuffers();
            this._initVAOs();
            this._initPrograms();
            this.tf = gl.createTransformFeedback();
            this.supported = true;
        } catch (e) {
            console.warn("[GPUParticles] init failed:", e);
            this.supported = false;
        }
    }

    _initBuffers() {
        const gl = this.gl;
        this.buffers = [gl.createBuffer(), gl.createBuffer()];
        for (let i = 0; i < 2; i++) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[i]);
            // Allocate once; never reallocate. Initialize to zero (life=0
            // for every slot) so any junk slots render-cull at startup.
            gl.bufferData(gl.ARRAY_BUFFER, STRIDE_BYTES * this.maxParticles, gl.DYNAMIC_DRAW);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    _initVAOs() {
        const gl = this.gl;
        this.updateVaos = [gl.createVertexArray(), gl.createVertexArray()];
        this.renderVaos = [gl.createVertexArray(), gl.createVertexArray()];

        for (let i = 0; i < 2; i++) {
            // Update VAO: divisor 0 — one shader invocation per slot.
            gl.bindVertexArray(this.updateVaos[i]);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[i]);
            _wireAttrs(gl, 0);

            // Render VAO: divisor 1 — same data but per-instance, so
            // gl_VertexID 0..3 walks the 4 quad corners.
            gl.bindVertexArray(this.renderVaos[i]);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[i]);
            _wireAttrs(gl, 1);
        }
        gl.bindVertexArray(null);
    }

    _initPrograms() {
        const gl = this.gl;
        const updateHandle = _linkProgram(gl, UPDATE_VS, UPDATE_FS,
            ["vPos", "vVel", "vLifeSize", "vColor", "vShape"]);
        this.updateProg = {
            handle:   updateHandle,
            uDT:      gl.getUniformLocation(updateHandle, "uDT"),
            uGravity: gl.getUniformLocation(updateHandle, "uGravity"),
            uDrag:    gl.getUniformLocation(updateHandle, "uDrag"),
        };
        const renderHandle = _linkProgram(gl, RENDER_VS, RENDER_FS);
        this.renderProg = {
            handle:        renderHandle,
            uViewProj:     gl.getUniformLocation(renderHandle, "uViewProj"),
            uCameraRight:  gl.getUniformLocation(renderHandle, "uCameraRight"),
            uCameraUp:     gl.getUniformLocation(renderHandle, "uCameraUp"),
            uTint:         gl.getUniformLocation(renderHandle, "uTint"),
        };
    }

    /**
     * Upload the staged spawn data into `buffer` at writeCursor. Wraps
     * cleanly when the cursor + stagingCount crosses maxParticles —
     * splits into two bufferSubData calls in that case. Advances cursor
     * and aliveCount, then resets stagingCount to 0.
     */
    _flushSpawnsInto(buffer) {
        const gl    = this.gl;
        const total = this.stagingCount;
        const start = this.writeCursor;

        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

        if (start + total <= this.maxParticles) {
            // Single contiguous write.
            gl.bufferSubData(gl.ARRAY_BUFFER,
                start * STRIDE_BYTES,
                this.staging,
                0,
                total * STRIDE_FLOATS);
        } else {
            // Wrap: write tail then head.
            const firstSlots  = this.maxParticles - start;
            const secondSlots = total - firstSlots;
            gl.bufferSubData(gl.ARRAY_BUFFER,
                start * STRIDE_BYTES,
                this.staging,
                0,
                firstSlots * STRIDE_FLOATS);
            gl.bufferSubData(gl.ARRAY_BUFFER,
                0,
                this.staging,
                firstSlots * STRIDE_FLOATS,
                secondSlots * STRIDE_FLOATS);
        }

        this.writeCursor = (start + total) % this.maxParticles;
        this.aliveCount  = Math.min(this.maxParticles, this.aliveCount + total);
        this.stagingCount = 0;
    }
}

// ---- shared helpers (module scope) ----

function _wireAttrs(gl, divisor) {
    // location 0 — pos (vec3) at byte offset 0
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE_BYTES, 0);
    gl.vertexAttribDivisor(0, divisor);
    // location 1 — vel (vec3) at byte offset 12
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE_BYTES, 12);
    gl.vertexAttribDivisor(1, divisor);
    // location 2 — lifeSize (vec2) at byte offset 24
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, STRIDE_BYTES, 24);
    gl.vertexAttribDivisor(2, divisor);
    // location 3 — color (vec3) at byte offset 32  (v411)
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, STRIDE_BYTES, 32);
    gl.vertexAttribDivisor(3, divisor);
    // location 4 — shape (float) at byte offset 44  (v413)
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, STRIDE_BYTES, 44);
    gl.vertexAttribDivisor(4, divisor);
}

function _linkProgram(gl, vsSrc, fsSrc, transformFeedbackVaryings) {
    const vs = _compileShader(gl, gl.VERTEX_SHADER,   vsSrc);
    const fs = _compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    if (transformFeedbackVaryings) {
        // v411 — INTERLEAVED_ATTRIBS: all varyings written contiguously
        // into the single bound buffer, in declaration order, matching
        // the interleaved input layout. (Was SEPARATE_ATTRIBS, which
        // expects one buffer per varying — wrong for this design; only
        // vPos would have been captured, leaving vel/life/color stale.)
        gl.transformFeedbackVaryings(prog, transformFeedbackVaryings, gl.INTERLEAVED_ATTRIBS);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(prog);
        gl.deleteProgram(prog);
        throw new Error("GPUParticles program link failed: " + log);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
}

function _compileShader(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error("GPUParticles shader compile failed: " + log);
    }
    return sh;
}

function _cross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
}

function _normalize(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
}
