// FILE: render/particleSystem.js
// VERSION: v1
//
// General-purpose GPU-instanced particle system. Owns a fixed-size
// pool of particles; emitters call spawn() to acquire one.
//
// Each particle:
//   * world position + velocity
//   * age + ttl (alpha fades over age)
//   * RGBA color
//   * size (in world units)
//   * gravity (per-particle, defaults 0 — float-up by default)
//
// Render: instanced billboards. Each particle is a unit quad oriented
// toward the camera via right + up vectors derived from camera basis.
// Fragment shader does soft-circle alpha falloff; alpha-blended over
// terrain. Cheap and atmospheric.

const VS = `#version 300 es
layout(location=0) in vec2 aLocalPos;     // -1..1 unit quad
layout(location=1) in vec3 aWorldPos;     // particle center
layout(location=2) in float aSize;        // particle radius
layout(location=3) in vec4 aColor;        // RGBA, A already faded
layout(location=4) in vec2 aSpriteUV0;    // atlas cell UV min
layout(location=5) in vec2 aSpriteUV1;    // atlas cell UV max

uniform mat4 uViewProj;
uniform vec3 uCamRight;
uniform vec3 uCamUp;

out vec2 vAtlasUV;
out vec4 vColor;
out vec3 vWorld;

void main() {
    vec3 world = aWorldPos
        + uCamRight * aLocalPos.x * aSize
        + uCamUp    * aLocalPos.y * aSize;
    gl_Position = uViewProj * vec4(world, 1.0);
    // aLocalPos.x = -1..1 → t = 0..1 across cell
    vec2 t = aLocalPos * 0.5 + 0.5;
    vAtlasUV = mix(aSpriteUV0, aSpriteUV1, t);
    vColor   = aColor;
    vWorld   = world;
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vAtlasUV;
in vec4 vColor;
in vec3 vWorld;
out vec4 outColor;

uniform sampler2D uAtlas;
uniform vec3 uCamPos;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;

// Round 50 — soft particles. Sample scene depth and fade alpha as the
// particle approaches geometry. uViewport = (W, H) for gl_FragCoord
// → UV. uSoftFade = world-space distance over which to fade (1.5u
// works for most embers).
uniform sampler2D uSceneDepth;
uniform vec2 uViewport;
uniform float uSoftFade;

float linearizeDepth(float z) {
    float n = 0.1, f = 500.0;
    float ndc = z * 2.0 - 1.0;
    return (2.0 * n * f) / (f + n - ndc * (f - n));
}

void main() {
    vec4 sprite = texture(uAtlas, vAtlasUV);
    if (sprite.a < 0.02) discard;
    // Tint sprite by particle color, multiplying alpha
    vec3 rgb = vColor.rgb * sprite.rgb;
    float a  = vColor.a   * sprite.a;

    // Round 50 — soft alpha based on scene depth at this pixel.
    // gl_FragCoord.xy is in pixel coords; divide by viewport for UV.
    vec2 sUV = gl_FragCoord.xy / uViewport;
    float sceneZ = texture(uSceneDepth, sUV).r;
    float particleZ = gl_FragCoord.z;
    if (sceneZ < 0.999 && uSoftFade > 0.0) {
        // Linearize both, take the world-space delta
        float lScene = linearizeDepth(sceneZ);
        float lPart  = linearizeDepth(particleZ);
        float delta  = lScene - lPart;     // positive when particle in front
        // Fade as particle approaches geometry (delta near 0).
        // Negative delta = particle is BEHIND geometry; depth test
        // would have killed it but for transparent quads with depth
        // disabled, we belt-and-suspenders here.
        float soft = smoothstep(0.0, uSoftFade, delta);
        a *= soft;
        if (a < 0.005) discard;
    }

    // Particle distance fog — same band as terrain so embers fade
    // into the horizon haze rather than popping at distance
    float dist = length(vWorld - uCamPos);
    float fogF = smoothstep(uFogNear, uFogFar, dist) * 0.85;
    rgb = mix(rgb, uFogColor, fogF);
    // Round 137 — HDR emissive boost. Bright particles (explosion
    // sparks, lava embers, plasma trails, hellspawn fire) have
    // saturated channels; smoothstep detects them and pushes the
    // output above 1.0 so the bloom + ACES tone-map pipeline reads
    // them as glowing rather than just "saturated colored". Applied
    // post-fog so distant embers naturally lose their bloom along
    // with their saturation. 2.5× matches the voxel emissive boost.
    float maxC = max(rgb.r, max(rgb.g, rgb.b));
    float emissive = smoothstep(0.85, 0.95, maxC);
    rgb *= mix(1.0, 2.5, emissive);
    outColor = vec4(rgb, a);
}`;

// 12 floats per instance: pos(3) + size(1) + color(4) + uv0(2) + uv1(2)
const INSTANCE_FLOATS = 12;
const INSTANCE_BYTES  = INSTANCE_FLOATS * 4;

export class ParticleSystem {
    constructor(gl, opts = {}) {
        this.gl = gl;
        this.maxParticles = opts.maxParticles ?? 2000;
        this.atlas = opts.atlas ?? null;

        // Fog uniforms — main.js patches these from sky/terrain settings
        this.fogColor  = opts.fogColor  ?? [0.78, 0.65, 0.55];
        this.fogNear   = opts.fogNear   ?? 60.0;
        this.fogFar    = opts.fogFar    ?? 220.0;

        // Round 27 — global gravity multiplier. Scenarios set this on
        // environments with different gravity (moon = 0.17, mars = 0.38).
        // Particles still specify their own per-particle gravity; this
        // scales all of them uniformly.
        this.gravityMul = opts.gravityMul ?? 1.0;

        this.particles = [];
        this._instanceData = new Float32Array(this.maxParticles * INSTANCE_FLOATS);

        // Default sprite UV (cell 0 — soft circle) if atlas present,
        // else full-texture rect (legacy fallback if atlas missing).
        this._defaultUV = this.atlas
            ? this.atlas.getCellUV(0)
            : { u0: 0, v0: 0, u1: 1, v1: 1 };

        this._init();
    }

    _init() {
        const gl = this.gl;
        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.error("[Particles] shader:", gl.getShaderInfoLog(s));
            }
            return s;
        };
        this.program = gl.createProgram();
        gl.attachShader(this.program, compile(gl.VERTEX_SHADER, VS));
        gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error("[Particles] link:", gl.getProgramInfoLog(this.program));
        }

        this.uViewProj = gl.getUniformLocation(this.program, "uViewProj");
        this.uCamRight = gl.getUniformLocation(this.program, "uCamRight");
        this.uCamUp    = gl.getUniformLocation(this.program, "uCamUp");
        this.uAtlas    = gl.getUniformLocation(this.program, "uAtlas");
        this.uCamPos   = gl.getUniformLocation(this.program, "uCamPos");
        this.uFogColor = gl.getUniformLocation(this.program, "uFogColor");
        this.uFogNear  = gl.getUniformLocation(this.program, "uFogNear");
        this.uFogFar   = gl.getUniformLocation(this.program, "uFogFar");
        // Round 50 — soft particles
        this.uSceneDepth = gl.getUniformLocation(this.program, "uSceneDepth");
        this.uViewport   = gl.getUniformLocation(this.program, "uViewport");
        this.uSoftFade   = gl.getUniformLocation(this.program, "uSoftFade");
        this._sceneDepthTex = null;        // patched from main.js per frame
        this._softFade      = 1.5;          // world-space fade distance

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        // Static unit-quad as triangle strip (4 verts)
        this.quadBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
             1,  1,
        ]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        // Per-instance buffer
        this.instanceBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
        gl.bufferData(gl.ARRAY_BUFFER, this.maxParticles * INSTANCE_BYTES, gl.DYNAMIC_DRAW);
        // aWorldPos at location 1 (vec3, offset 0)
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, INSTANCE_BYTES, 0);
        gl.vertexAttribDivisor(1, 1);
        // aSize at location 2 (float, offset 12)
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, INSTANCE_BYTES, 12);
        gl.vertexAttribDivisor(2, 1);
        // aColor at location 3 (vec4, offset 16)
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 4, gl.FLOAT, false, INSTANCE_BYTES, 16);
        gl.vertexAttribDivisor(3, 1);
        // aSpriteUV0 at location 4 (vec2, offset 32)
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 2, gl.FLOAT, false, INSTANCE_BYTES, 32);
        gl.vertexAttribDivisor(4, 1);
        // aSpriteUV1 at location 5 (vec2, offset 40)
        gl.enableVertexAttribArray(5);
        gl.vertexAttribPointer(5, 2, gl.FLOAT, false, INSTANCE_BYTES, 40);
        gl.vertexAttribDivisor(5, 1);

        gl.bindVertexArray(null);
    }

    // Spawn a new particle. Returns the particle for emitter to mutate
    // post-spawn if needed (e.g. set initial offset). Returns null if
    // pool full — caller can ignore (frame skips, no big deal).
    spawn({ x, y, z, vx = 0, vy = 0, vz = 0, ttl = 2, size = 0.3, r = 1, g = 0.7, b = 0.3, a = 1, gravity = 0, sprite = 0 }) {
        if (this.particles.length >= this.maxParticles) return null;
        const uv = this.atlas ? this.atlas.getCellUV(sprite) : this._defaultUV;
        const p = {
            x, y, z,
            vx, vy, vz,
            age: 0, ttl,
            r, g, b, a,
            size,
            gravity,
            startA: a,
            u0: uv.u0, v0: uv.v0, u1: uv.u1, v1: uv.v1,
        };
        this.particles.push(p);
        return p;
    }

    tick(delta) {
        // Backwards iterate so splice doesn't invalidate index
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.age += delta;
            if (p.age >= p.ttl) {
                this.particles.splice(i, 1);
                continue;
            }
            p.x  += p.vx * delta;
            p.y  += p.vy * delta;
            p.z  += p.vz * delta;
            p.vy -= p.gravity * this.gravityMul * delta;
            // Linear alpha fade over life
            const t = p.age / p.ttl;
            p.a = p.startA * (1.0 - t);
        }
    }

    // Round 50 — main.js calls this with the depth-copy texture each
    // frame after bloomPass.copySceneDepth(). Pass null to disable.
    setSceneDepth(tex) { this._sceneDepthTex = tex; }

    render(camera) {
        if (this.particles.length === 0) return;
        const gl = this.gl;
        const mvp = camera.getViewProjMatrix?.() || camera.getMatrix?.();
        if (!mvp) return;

        // Derive camera basis (right + up) from yaw/pitch. Camera
        // convention: forward = (sin y cos p, sin p, -cos y cos p),
        // right = (cos y, 0, sin y), up = right × forward.
        const yaw = camera.yaw ?? 0, pitch = camera.pitch ?? 0;
        const cy = Math.cos(yaw),   sy = Math.sin(yaw);
        const cp = Math.cos(pitch), sp = Math.sin(pitch);
        const fx = sy * cp, fy = sp, fz = -cy * cp;
        const rx = cy,      ry = 0,  rz = sy;
        // up = right × forward
        const ux = ry * fz - rz * fy;
        const uy = rz * fx - rx * fz;
        const uz = rx * fy - ry * fx;

        // Pack per-instance data
        const buf = this._instanceData;
        let off = 0;
        for (const p of this.particles) {
            buf[off + 0] = p.x;
            buf[off + 1] = p.y;
            buf[off + 2] = p.z;
            buf[off + 3] = p.size;
            buf[off + 4] = p.r;
            buf[off + 5] = p.g;
            buf[off + 6] = p.b;
            buf[off + 7] = p.a;
            buf[off + 8]  = p.u0;
            buf[off + 9]  = p.v0;
            buf[off + 10] = p.u1;
            buf[off + 11] = p.v1;
            off += INSTANCE_FLOATS;
        }

        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uViewProj, false, mvp);
        gl.uniform3f(this.uCamRight, rx, ry, rz);
        gl.uniform3f(this.uCamUp,    ux, uy, uz);
        gl.uniform3f(this.uCamPos, camera.position.x, camera.position.y, camera.position.z);
        gl.uniform3fv(this.uFogColor, this.fogColor);
        gl.uniform1f(this.uFogNear, this.fogNear);
        gl.uniform1f(this.uFogFar,  this.fogFar);

        // Bind sprite atlas at texture unit 0
        if (this.atlas?.texture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.atlas.texture);
            gl.uniform1i(this.uAtlas, 0);
        }

        // Round 50 — soft particles. Bind scene-depth copy at unit 1.
        // If main.js hasn't set _sceneDepthTex, pass uSoftFade=0 to disable.
        if (this._sceneDepthTex) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this._sceneDepthTex);
            gl.uniform1i(this.uSceneDepth, 1);
            gl.uniform2f(this.uViewport, gl.drawingBufferWidth, gl.drawingBufferHeight);
            gl.uniform1f(this.uSoftFade, this._softFade);
        } else {
            gl.uniform1f(this.uSoftFade, 0.0);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0,
            buf.subarray(0, this.particles.length * INSTANCE_FLOATS));

        // Additive-friendly blending. Standard alpha for soft particles
        // gives a believable haze; for true emissive embers, additive
        // (gl.ONE, gl.ONE) would brighten when overlapping. Stick with
        // standard alpha for v1 — predictable, and lava embers already
        // glow via VS color values without needing additive.
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        const cullWasEnabled = gl.isEnabled(gl.CULL_FACE);
        if (cullWasEnabled) gl.disable(gl.CULL_FACE);

        gl.bindVertexArray(this.vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.particles.length);
        gl.bindVertexArray(null);

        gl.depthMask(true);
        gl.disable(gl.BLEND);
        if (cullWasEnabled) gl.enable(gl.CULL_FACE);
    }

    snapshot() {
        return { active: this.particles.length, capacity: this.maxParticles };
    }
}
