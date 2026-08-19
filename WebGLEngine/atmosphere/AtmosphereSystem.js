// FILE: atmosphere/AtmosphereSystem.js
// VERSION: v1 (Round 157)
//
// Self-contained atmospheric layer: volumetric-feeling cloud sprites at
// sky altitude + lightning streak during storm flashes. Reads weather
// state from WeatherSystem; owns its own WebGL2 program, VBO, instance
// buffers. Draws after sky, before opaque entities.
//
// Render order (caller responsibility):
//   skyRenderer.render(camera)
//   atmosphereSystem.render(camera, viewProj)   <-- here
//   (entities, water, particles ...)
//
// Update order:
//   weatherSystem.tick(dt, camera)
//   atmosphereSystem.tick(dt, camera)            <-- here
//
// No external textures. Cloud silhouettes come from procedural value
// noise in the fragment shader.

const VS = `#version 300 es
layout(location=0) in vec2 aCorner;          // unit quad corner -1..1
layout(location=1) in vec3 aInstancePos;     // per-cloud world center
layout(location=2) in vec2 aInstanceSize;    // per-cloud width/height
layout(location=3) in float aInstanceSeed;   // per-cloud noise offset

uniform mat4 uViewProj;
uniform vec3 uCamRight;
uniform vec3 uCamUp;

out vec2 vUv;
out float vSeed;
out float vDepth;

void main() {
    // Build a camera-facing billboard
    vec3 worldPos = aInstancePos
                  + uCamRight * (aCorner.x * aInstanceSize.x)
                  + uCamUp    * (aCorner.y * aInstanceSize.y);
    vec4 clip = uViewProj * vec4(worldPos, 1.0);
    gl_Position = clip;
    vUv = aCorner;           // -1..1
    vSeed = aInstanceSeed;
    vDepth = clip.w;         // for distance-fade
}`;

const FS = `#version 300 es
precision highp float;

in vec2 vUv;
in float vSeed;
in float vDepth;
out vec4 outColor;

uniform vec3 uTintBright;    // sun-lit side
uniform vec3 uTintDark;      // shadowed side
uniform vec3 uSunDir;        // world-space sun direction
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform float uDensity;      // 0..1 global alpha modulation
uniform float uFlash;        // 0..1 lightning flash; brightens clouds
uniform float uTime;         // seconds, for slow internal swirl

// --- Hash + value-noise + fbm. Cheap, no textures. ---
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
    float v = 0.0, amp = 0.5;
    for (int i = 0; i < 4; i++) {
        v += amp * vnoise(p);
        p *= 2.03;
        amp *= 0.5;
    }
    return v;
}

void main() {
    // Soft disc falloff out from quad center
    float r = length(vUv);
    if (r > 1.0) discard;
    float discMask = pow(1.0 - r, 1.3);     // 1 at center, 0 at edge

    // Internal noise gives cloud-like fluff. Seed offsets per cloud so
    // they don't all look identical. Slow drift over time.
    vec2 nUv = vUv * 1.6 + vec2(vSeed * 37.0, vSeed * 41.0) + uTime * 0.015;
    float n = fbm(nUv);
    // Boost contrast so it forms wisps/puffs
    n = smoothstep(0.30, 0.85, n);

    float coverage = discMask * n;
    if (coverage < 0.01) discard;

    // Side lighting: gradient across the billboard along the projected
    // sun direction. Project sun into the camera's billboard plane.
    float sx = dot(uSunDir, uCamRight);
    float sy = dot(uSunDir, uCamUp);
    vec2 sunBillboard = normalize(vec2(sx, sy) + vec2(0.001));
    float litTerm = dot(vUv, sunBillboard) * 0.5 + 0.5;   // 0..1
    vec3 cloudColor = mix(uTintDark, uTintBright, litTerm);

    // Lightning flash: brighten clouds toward white briefly
    cloudColor = mix(cloudColor, vec3(1.0), uFlash * 0.6);

    // Distance fade — far clouds (vDepth in view space) fade so the
    // cloud layer doesn't have a hard ring at the spread radius.
    float fade = smoothstep(2000.0, 600.0, vDepth);
    float alpha = coverage * uDensity * fade;

    outColor = vec4(cloudColor * alpha, alpha);   // premultiplied
}`;

// Lightning streak — a single vertical line shader. Triggered when
// weather flash intensity > 0. Cheap.
const LIGHT_VS = `#version 300 es
layout(location=0) in vec2 aPos;     // -1..1 along streak, 0..1 lateral
uniform mat4 uViewProj;
uniform vec3 uA;        // top of streak (world)
uniform vec3 uB;        // bottom of streak (world)
uniform vec3 uCamRight;
uniform float uHalfWidth;
out vec2 vUv;
void main() {
    vec3 axis = uA + (uB - uA) * (0.5 + 0.5 * aPos.x);
    vec3 world = axis + uCamRight * (aPos.y * uHalfWidth);
    gl_Position = uViewProj * vec4(world, 1.0);
    vUv = aPos;
}`;
const LIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform float uIntensity;        // 0..1
uniform float uSeed;             // jitter per flash
float hash(float x) { return fract(sin(x * 91.345) * 43758.5); }
void main() {
    // Lateral falloff — bright center, transparent edges
    float lat = 1.0 - abs(vUv.y);
    lat = pow(lat, 4.0);
    // Vertical jitter — wobble along the streak
    float jitterT = (vUv.x * 0.5 + 0.5) * 12.0 + uSeed * 100.0;
    float jitter  = (hash(floor(jitterT)) - 0.5) * 0.4;
    lat *= 1.0 - smoothstep(0.0, 0.3, abs(jitter));
    if (lat < 0.01) discard;
    vec3 col = vec3(1.0, 0.95, 1.0);
    outColor = vec4(col * lat * uIntensity, lat * uIntensity);
}`;

function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw new Error(`[Atmosphere] shader compile failed: ${log}`);
    }
    return s;
}
function link(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(p);
        gl.deleteProgram(p);
        throw new Error(`[Atmosphere] program link failed: ${log}`);
    }
    return p;
}

// Per-weather-state cloud parameters. Density is the global alpha
// modulation (how thick the layer looks); tints set the lit/shadow
// colors. Wind is the drift velocity in world XZ.
//
// Round 158 — also: per-state distribution across cloud TYPES
// (cirrus, cumulus, storm). Cirrus are thin/high; cumulus are puffy
// at mid altitude; storm clouds are dark and low. Distribution shifts
// across weather: clear is mostly cirrus, cloudy is mostly cumulus,
// storm is mostly storm clouds.
const STATE_CLOUD = {
    clear:  { density: 0.20, brightR: 1.00, brightG: 1.00, brightB: 1.00,
                              darkR:   0.78, darkG:   0.80, darkB:   0.85,
                              windX:   0.4,  windZ:   0.2,
                              mix:     { cirrus: 0.65, cumulus: 0.30, storm: 0.05 } },
    cloudy: { density: 0.65, brightR: 0.95, brightG: 0.95, brightB: 0.96,
                              darkR:   0.55, darkG:   0.58, darkB:   0.65,
                              windX:   0.8,  windZ:   0.5,
                              mix:     { cirrus: 0.15, cumulus: 0.75, storm: 0.10 } },
    rain:   { density: 0.85, brightR: 0.60, brightG: 0.62, brightB: 0.68,
                              darkR:   0.30, darkG:   0.32, darkB:   0.38,
                              windX:   1.4,  windZ:   1.0,
                              mix:     { cirrus: 0.05, cumulus: 0.55, storm: 0.40 } },
    snow:   { density: 0.75, brightR: 0.92, brightG: 0.95, brightB: 1.00,
                              darkR:   0.65, darkG:   0.70, darkB:   0.80,
                              windX:   0.5,  windZ:   0.3,
                              mix:     { cirrus: 0.20, cumulus: 0.70, storm: 0.10 } },
    storm:  { density: 0.95, brightR: 0.40, brightG: 0.42, brightB: 0.50,
                              darkR:   0.12, darkG:   0.14, darkB:   0.20,
                              windX:   2.5,  windZ:   2.0,
                              mix:     { cirrus: 0.05, cumulus: 0.20, storm: 0.75 } },
};

// Per-type shape parameters. The cloudCount is distributed across
// types according to the current weather state's mix; type controls
// altitude, billboard aspect ratio, and base size.
const CLOUD_TYPES = {
    cirrus:  { altitudeOffset:  60, altitudeJitter:  10, sizeMin: 60, sizeMax: 110, aspectY: 0.18, seedOffset: 0   },
    cumulus: { altitudeOffset:   0, altitudeJitter:  15, sizeMin: 35, sizeMax:  90, aspectY: 0.70, seedOffset: 0.3 },
    storm:   { altitudeOffset: -30, altitudeJitter:  20, sizeMin: 70, sizeMax: 140, aspectY: 0.85, seedOffset: 0.7 },
};

export class AtmosphereSystem {
    constructor(gl, weatherSystem, opts = {}) {
        this.gl = gl;
        this.weather = weatherSystem;

        // Tunables
        this.cloudCount    = opts.cloudCount    ?? 90;
        this.cloudAltitude = opts.cloudAltitude ?? 120;
        this.cloudAltitudeJitter = opts.cloudAltitudeJitter ?? 15;
        this.cloudSpread   = opts.cloudSpread   ?? 600;   // half-extent
        this.cloudSizeMin  = opts.cloudSizeMin  ?? 35;
        this.cloudSizeMax  = opts.cloudSizeMax  ?? 90;

        // Smoothed parameters — interpolated from weather so transitions
        // don't pop. Initialized to clear.
        const init = STATE_CLOUD.clear;
        this._curDensity = init.density;
        this._curBright  = [init.brightR, init.brightG, init.brightB];
        this._curDark    = [init.darkR,   init.darkG,   init.darkB];
        this._curWind    = [init.windX,   init.windZ];

        // Lightning streak state
        this._streakActive = false;
        this._streakA = [0, 200, 0];
        this._streakB = [0,   0, 0];
        this._streakSeed = 0;
        this._lastFlashWatch = 0;

        this._time = 0;

        this._initClouds();
        this._initShaders();
    }

    // ---- public API ----

    tick(dt, camera) {
        this._time += dt;

        // Round 158 — if the weather state changed since last layout,
        // re-distribute clouds across types. Cheap (90 random rolls).
        // The drift+wrap below then continues from the new positions.
        if (this.weather?.state && this.weather.state !== this._lastLayoutState) {
            this._redistributeClouds();
        }

        // Pull weather state and ease toward it. Easing avoids jarring
        // jumps when state changes.
        const target = STATE_CLOUD[this.weather?.state] ?? STATE_CLOUD.clear;
        const k = 1.0 - Math.exp(-dt * 0.6);   // ~1.7s e-folding
        this._curDensity = lerp(this._curDensity, target.density, k);
        this._curBright[0] = lerp(this._curBright[0], target.brightR, k);
        this._curBright[1] = lerp(this._curBright[1], target.brightG, k);
        this._curBright[2] = lerp(this._curBright[2], target.brightB, k);
        this._curDark[0]   = lerp(this._curDark[0],   target.darkR,   k);
        this._curDark[1]   = lerp(this._curDark[1],   target.darkG,   k);
        this._curDark[2]   = lerp(this._curDark[2],   target.darkB,   k);
        this._curWind[0]   = lerp(this._curWind[0],   target.windX,   k);
        this._curWind[1]   = lerp(this._curWind[1],   target.windZ,   k);

        // Drift clouds + wrap relative to camera so layer always
        // surrounds the player (toroidal).
        const cx = camera?.position?.x ?? 0;
        const cz = camera?.position?.z ?? 0;
        const wx = this._curWind[0] * dt;
        const wz = this._curWind[1] * dt;
        for (let i = 0; i < this.cloudCount; i++) {
            const base = i * 4;
            this._instData[base + 0] += wx;
            this._instData[base + 2] += wz;
            // Wrap when farther than spread on either axis
            let dx = this._instData[base + 0] - cx;
            let dz = this._instData[base + 2] - cz;
            if (dx >  this.cloudSpread) this._instData[base + 0] -= 2 * this.cloudSpread;
            if (dx < -this.cloudSpread) this._instData[base + 0] += 2 * this.cloudSpread;
            if (dz >  this.cloudSpread) this._instData[base + 2] -= 2 * this.cloudSpread;
            if (dz < -this.cloudSpread) this._instData[base + 2] += 2 * this.cloudSpread;
        }
        this._instDirty = true;

        // Watch the weather's flash intensity to fire a streak. The
        // WeatherSystem already brightens horizon during a flash; we
        // pick up the same signal and draw a vertical bolt.
        const flash = this.weather?._flashIntensity ?? 0;
        if (flash > 0.5 && this._lastFlashWatch <= 0.5) {
            // Rising edge — spawn a new streak at a random azimuth
            this._spawnStreak(camera);
        }
        this._lastFlashWatch = flash;
        // Streak fades out automatically with flash
        if (flash < 0.05) this._streakActive = false;
    }

    render(camera, viewProj) {
        const gl = this.gl;
        if (!viewProj) viewProj = camera?.viewProj ?? camera?.getViewProjMatrix?.();
        if (!viewProj) return;
        if (this._curDensity < 0.01 && !this._streakActive) return;   // nothing visible

        // Build camera right/up from yaw+pitch — most reliable across
        // this codebase since the camera exposes these directly.
        // Engine convention: forward = (sy*cp, sp, -cy*cp), worldUp=+Y.
        //   right = normalize(forward × worldUp) = (cy, 0, sy)
        //   up    = right × forward             = (-sy*sp, cp, cy*sp)
        const yaw = camera?.yaw ?? 0;
        const pitch = camera?.pitch ?? 0;
        const cy = Math.cos(yaw),   sy = Math.sin(yaw);
        const cp = Math.cos(pitch), sp = Math.sin(pitch);
        const right = [cy, 0, sy];
        const up    = [-sy * sp, cp, cy * sp];

        // ---- clouds ----
        gl.useProgram(this._prog);
        gl.bindVertexArray(this._vao);

        if (this._instDirty) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._instBuf);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._instData);
            this._instDirty = false;
        }

        gl.uniformMatrix4fv(this._uViewProj, false, viewProj);
        gl.uniform3f(this._uCamRight, right[0], right[1], right[2]);
        gl.uniform3f(this._uCamUp,    up[0],    up[1],    up[2]);
        gl.uniform3f(this._uTintBright, this._curBright[0], this._curBright[1], this._curBright[2]);
        gl.uniform3f(this._uTintDark,   this._curDark[0],   this._curDark[1],   this._curDark[2]);
        const sd = this.weather?.sunDir ?? [0, 1, 0];
        gl.uniform3f(this._uSunDir, sd[0], sd[1], sd[2]);
        gl.uniform1f(this._uDensity, this._curDensity);
        gl.uniform1f(this._uFlash, this.weather?._flashIntensity ?? 0);
        gl.uniform1f(this._uTime, this._time);

        // Premultiplied alpha blending — fragment outputs color*alpha.
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        // Depth test ON so terrain occludes clouds; depth write OFF so
        // we don't block transparent objects rendered after us.
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.disable(gl.CULL_FACE);

        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.cloudCount);

        // ---- lightning streak ----
        if (this._streakActive) {
            gl.useProgram(this._lightProg);
            gl.bindVertexArray(this._lightVao);
            gl.uniformMatrix4fv(this._uLightViewProj, false, viewProj);
            gl.uniform3f(this._uLightA, this._streakA[0], this._streakA[1], this._streakA[2]);
            gl.uniform3f(this._uLightB, this._streakB[0], this._streakB[1], this._streakB[2]);
            gl.uniform3f(this._uLightCamRight, right[0], right[1], right[2]);
            gl.uniform1f(this._uLightHalf, 4.0);     // half-width in world units
            gl.uniform1f(this._uLightIntensity, this.weather?._flashIntensity ?? 0);
            gl.uniform1f(this._uLightSeed, this._streakSeed);
            // Additive — the bolt brightens whatever's behind it
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        // Restore typical state
        gl.depthMask(true);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(null);
    }

    dispose() {
        const gl = this.gl;
        gl.deleteProgram(this._prog);
        gl.deleteProgram(this._lightProg);
        gl.deleteVertexArray(this._vao);
        gl.deleteVertexArray(this._lightVao);
        gl.deleteBuffer(this._quadBuf);
        gl.deleteBuffer(this._instBuf);
        gl.deleteBuffer(this._lightQuadBuf);
    }

    // ---- internals ----

    _initClouds() {
        const stride = 6;
        this._instData = new Float32Array(this.cloudCount * stride);
        this._instStride = stride;
        // Round 158 — per-cloud type ("cirrus"|"cumulus"|"storm").
        // Stored separately so we can re-distribute on weather change
        // without rebuilding the GPU buffer layout.
        this._cloudType = new Array(this.cloudCount).fill("cumulus");
        // Track the weather state we last laid out for, so we only
        // re-distribute when it actually changes.
        this._lastLayoutState = null;

        // Initial layout uses the current weather state's mix
        this._redistributeClouds();

        // Unit quad as a triangle strip (4 verts)
        this._quad = new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
             1,  1,
        ]);
    }

    // Round 158 — assign each cloud a type drawn from the current
    // weather state's mix, then re-place it at an appropriate altitude
    // and size for its type. Called on init and on state change.
    _redistributeClouds() {
        const state = this.weather?.state ?? "clear";
        const mix = (STATE_CLOUD[state] ?? STATE_CLOUD.clear).mix;
        const types = ["cirrus", "cumulus", "storm"];
        const cumW = []; let acc = 0;
        for (const t of types) { acc += mix[t] ?? 0; cumW.push(acc); }
        const total = acc || 1;

        for (let i = 0; i < this.cloudCount; i++) {
            const r = Math.random() * total;
            let typeName = types[types.length - 1];
            for (let j = 0; j < types.length; j++) {
                if (r < cumW[j]) { typeName = types[j]; break; }
            }
            this._cloudType[i] = typeName;

            const t = CLOUD_TYPES[typeName];
            const o = i * 6;
            this._instData[o + 0] = (Math.random() * 2 - 1) * this.cloudSpread;
            this._instData[o + 1] = this.cloudAltitude
                + t.altitudeOffset
                + (Math.random() * 2 - 1) * t.altitudeJitter;
            this._instData[o + 2] = (Math.random() * 2 - 1) * this.cloudSpread;
            const sz = t.sizeMin + Math.random() * (t.sizeMax - t.sizeMin);
            this._instData[o + 3] = sz;
            this._instData[o + 4] = sz * t.aspectY;
            this._instData[o + 5] = Math.random() * 0.6 + t.seedOffset;
        }
        this._instDirty = true;
        this._lastLayoutState = state;
    }

    _initShaders() {
        const gl = this.gl;
        const vs = compile(gl, gl.VERTEX_SHADER, VS);
        const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
        this._prog = link(gl, vs, fs);
        gl.deleteShader(vs); gl.deleteShader(fs);

        this._vao = gl.createVertexArray();
        gl.bindVertexArray(this._vao);

        this._quadBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf);
        gl.bufferData(gl.ARRAY_BUFFER, this._quad, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        this._instBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._instBuf);
        gl.bufferData(gl.ARRAY_BUFFER, this._instData, gl.DYNAMIC_DRAW);
        // pos (3 floats)
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 0);
        gl.vertexAttribDivisor(1, 1);
        // size (2 floats)
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 24, 12);
        gl.vertexAttribDivisor(2, 1);
        // seed (1 float)
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 24, 20);
        gl.vertexAttribDivisor(3, 1);

        gl.bindVertexArray(null);

        // Uniform locations
        this._uViewProj    = gl.getUniformLocation(this._prog, "uViewProj");
        this._uCamRight    = gl.getUniformLocation(this._prog, "uCamRight");
        this._uCamUp       = gl.getUniformLocation(this._prog, "uCamUp");
        this._uTintBright  = gl.getUniformLocation(this._prog, "uTintBright");
        this._uTintDark    = gl.getUniformLocation(this._prog, "uTintDark");
        this._uSunDir      = gl.getUniformLocation(this._prog, "uSunDir");
        this._uDensity     = gl.getUniformLocation(this._prog, "uDensity");
        this._uFlash       = gl.getUniformLocation(this._prog, "uFlash");
        this._uTime        = gl.getUniformLocation(this._prog, "uTime");

        // Lightning program
        const lvs = compile(gl, gl.VERTEX_SHADER, LIGHT_VS);
        const lfs = compile(gl, gl.FRAGMENT_SHADER, LIGHT_FS);
        this._lightProg = link(gl, lvs, lfs);
        gl.deleteShader(lvs); gl.deleteShader(lfs);

        this._lightVao = gl.createVertexArray();
        gl.bindVertexArray(this._lightVao);
        this._lightQuadBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._lightQuadBuf);
        gl.bufferData(gl.ARRAY_BUFFER, this._quad, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        this._uLightViewProj  = gl.getUniformLocation(this._lightProg, "uViewProj");
        this._uLightA         = gl.getUniformLocation(this._lightProg, "uA");
        this._uLightB         = gl.getUniformLocation(this._lightProg, "uB");
        this._uLightCamRight  = gl.getUniformLocation(this._lightProg, "uCamRight");
        this._uLightHalf      = gl.getUniformLocation(this._lightProg, "uHalfWidth");
        this._uLightIntensity = gl.getUniformLocation(this._lightProg, "uIntensity");
        this._uLightSeed      = gl.getUniformLocation(this._lightProg, "uSeed");
    }

    _spawnStreak(camera) {
        // Spawn a bolt at a random azimuth 80-200 units from camera,
        // reaching from cloud altitude down to ~5 units above ground.
        const cx = camera?.position?.x ?? 0;
        const cz = camera?.position?.z ?? 0;
        const az = Math.random() * Math.PI * 2;
        const dist = 80 + Math.random() * 120;
        const x = cx + Math.cos(az) * dist;
        const z = cz + Math.sin(az) * dist;
        this._streakA = [x, this.cloudAltitude - 5, z];
        this._streakB = [x + (Math.random() - 0.5) * 12,
                         5,
                         z + (Math.random() - 0.5) * 12];
        this._streakSeed = Math.random();
        this._streakActive = true;
    }
}

function lerp(a, b, t) { return a + (b - a) * t; }
