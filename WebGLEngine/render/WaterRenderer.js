// FILE: render/WaterRenderer.js
// VERSION: v1 - INSTANCED ANIMATED WATER SURFACE
//
// Renders only the TOP SURFACE of water voxels — voxels of type WATER
// (10) or FLOWING_WATER (11) where the cell directly above is NOT
// water. Each surface tile is drawn as an upward-facing unit quad,
// instanced with per-tile (x, y, z) offset.
//
// Vertex shader displaces Y by sin/cos of (worldX, worldZ, time),
// computes an approximate normal from the wave gradient. Fragment
// shader does directional N·L shading against a fixed sun, mixes
// deep + surface colors by upness (rough fresnel proxy), adds a
// power-32 specular highlight, alpha 0.75.
//
// Required: voxelrenderer.skipWater = true so water voxels are
// excluded from the greedy mesh; otherwise we'd double-render
// (opaque blocks underneath, animated surface on top).
//
// Throttle: collect() walks every voxel of every chunk to find
// water; called every collectInterval ms (default 100 = 10Hz). At
// typical scene scale (81 chunks × 16x64x16 voxels = ~1.3M reads
// per scan) this is fine; for larger worlds add a "chunk has water?"
// dirty flag.

const VS = `#version 300 es
layout(location=0) in vec3 aPos;        // unit quad vertex
layout(location=1) in vec3 aOffset;     // instanced: water voxel position

uniform mat4 uViewProj;
uniform float uTime;
uniform float uAmplitude;
uniform sampler2D uDisturb;    // WaterField displacement (R16F, tex unit 2)
uniform vec2  uFieldOrigin;    // world xz of field cell (0,0)
uniform vec2  uFieldInvSize;   // 1.0 / (cells * cellSize), in world units
uniform float uDisturbActive;  // 0 = no field bound

out vec3 vWorld;
out vec3 vNormal;

// Round 13 — multi-octave wave displacement.
// Three octaves: large slow swell, medium chop, small high-frequency
// detail. Returns vec3(height, dHeight/dx, dHeight/dz) so the caller
// can use the gradient for the normal.
vec3 waveSample(vec2 p, float t) {
    // Octave 1 — long swell
    float a1 = 1.0;
    float k1x = 0.40, k1z = 0.40, w1 = 1.20;
    float h1 = sin(p.x * k1x + t * w1) * cos(p.y * k1z + t * 0.9);
    float d1x =  cos(p.x * k1x + t * w1) * cos(p.y * k1z + t * 0.9) * k1x;
    float d1z = -sin(p.x * k1x + t * w1) * sin(p.y * k1z + t * 0.9) * k1z;

    // Octave 2 — medium chop
    float a2 = 0.55;
    float k2x = 0.95, k2z = 1.10, w2 = 1.85;
    float h2 = sin(p.x * k2x + p.y * 0.4 + t * w2) * 0.85;
    float d2x = cos(p.x * k2x + p.y * 0.4 + t * w2) * k2x * 0.85;
    float d2z = cos(p.x * k2x + p.y * 0.4 + t * w2) * 0.4 * 0.85;

    // Octave 3 — fine ripples
    float a3 = 0.25;
    float k3x = 2.30, k3z = 2.10, w3 = 3.50;
    float h3 = sin(p.x * k3x - p.y * k3z + t * w3) * 0.6;
    float d3x =  cos(p.x * k3x - p.y * k3z + t * w3) * k3x * 0.6;
    float d3z = -cos(p.x * k3x - p.y * k3z + t * w3) * k3z * 0.6;

    return vec3(
        a1 * h1 + a2 * h2 + a3 * h3,
        a1 * d1x + a2 * d2x + a3 * d3x,
        a1 * d1z + a2 * d2z + a3 * d3z
    );
}

void main() {
    vec3 worldPos = aPos + aOffset + vec3(0.0, 1.0, 0.0);

    vec3 ws = waveSample(worldPos.xz, uTime);
    worldPos.y += ws.x * uAmplitude;

    // Normal from analytical gradient (-dHeight/dx, 1, -dHeight/dz)
    vNormal = normalize(vec3(-ws.y * uAmplitude, 1.0, -ws.z * uAmplitude));

    // WaterField disturbance (splash rings / wakes / tidal). Additive on top
    // of the procedural waves; only where the field patch overlaps this water.
    if (uDisturbActive > 0.5) {
        vec2 uv = (worldPos.xz - uFieldOrigin) * uFieldInvSize;
        if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
            float dC = texture(uDisturb, uv).r;
            float dX = texture(uDisturb, uv + vec2(uFieldInvSize.x, 0.0)).r - dC;
            float dZ = texture(uDisturb, uv + vec2(0.0, uFieldInvSize.y)).r - dC;
            worldPos.y += dC;
            vNormal = normalize(vNormal + vec3(-dX, 0.0, -dZ) * 6.0);
        }
    }

    vWorld = worldPos;
    gl_Position = uViewProj * vec4(worldPos, 1.0);
}`;

const FS = `#version 300 es
precision highp float;

in vec3 vWorld;
in vec3 vNormal;

out vec4 outColor;

uniform float uTime;
uniform mat4 uViewProj;          // round 51 — for SSR projection
uniform vec3 uCamPos;            // round 51
// Round 50 — shoreline foam
uniform sampler2D uSceneDepth;
uniform vec2 uViewport;
uniform float uFoamRange;
// Round 51 — SSR
uniform sampler2D uSceneColor;
uniform float uSSRStrength;       // 0 = off, 1 = full mirror
// Round 423 — screen-space refraction
uniform float uRefractStrength;   // 0 = off; wave-distortion scale when on
uniform float uCausticStrength;   // v453b — surface sparkle intensity (0 = off)
uniform float uDepthFade;         // how fast water color absorbs the lakebed with depth

const vec3 SUN     = vec3(0.4082, 0.8165, 0.4082);
const vec3 DEEP    = vec3(0.05, 0.18, 0.40);
const vec3 SURFACE = vec3(0.30, 0.55, 0.85);
const vec3 FOAM    = vec3(0.85, 0.92, 1.00);

float linearizeDepth(float z) {
    float n = 0.1, f = 500.0;
    float ndc = z * 2.0 - 1.0;
    return (2.0 * n * f) / (f + n - ndc * (f - n));
}

// Round 51 — screen-space reflection. March along the world-space
// reflection ray, project each step to NDC, compare ray depth to
// scene depth at that pixel. On hit, sample scene color. Returns
// (rgb, hit) — alpha is 1 if hit, 0 if miss.
vec4 ssrSample(vec3 worldOrigin, vec3 worldDir) {
    const int MAX_STEPS = 16;
    float stepLen = 0.6;
    vec3 ray = worldOrigin + worldDir * 0.4;     // small offset off the surface
    for (int i = 0; i < MAX_STEPS; i++) {
        ray += worldDir * stepLen;
        vec4 clip = uViewProj * vec4(ray, 1.0);
        if (clip.w <= 0.0) return vec4(0.0);
        vec3 ndc = clip.xyz / clip.w;
        if (ndc.x < -1.0 || ndc.x > 1.0 || ndc.y < -1.0 || ndc.y > 1.0) return vec4(0.0);
        vec2 uv = ndc.xy * 0.5 + 0.5;
        float sceneZ = texture(uSceneDepth, uv).r;
        float rayZ = ndc.z * 0.5 + 0.5;
        if (sceneZ >= 0.999) {
            stepLen *= 1.4;
            continue;          // ray passed sky; keep marching
        }
        if (rayZ >= sceneZ) {
            // Hit. Refine by stepping back half once for a better surface.
            float thickness = 0.6;     // accept hits within this NDC depth band
            if (rayZ - sceneZ < thickness) {
                // Edge fade — softer at screen edges
                float edgeFade = smoothstep(0.0, 0.15, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
                vec3 col = texture(uSceneColor, uv).rgb;
                return vec4(col, edgeFade);
            }
            return vec4(0.0);          // miss (ray clearly behind surface = sky/voids)
        }
        stepLen *= 1.4;                // exponential step growth
    }
    return vec4(0.0);
}

// v453b — surface caustic sparkle. Layered-sine caustics (same math as the
// underwater overlay) thresholded to bright ridges, so the surface catches
// glints of light that ride the waves rather than a flat tint.
float caustic(vec2 uv, float t) {
    float c = sin(uv.x * 12.0 + t * 1.8) * cos(uv.y * 10.0 + t * 2.1);
    c += sin(uv.x * 18.0 - t * 1.3) * cos(uv.y * 15.0 + t * 0.9);
    c += sin(uv.x * 25.0 + t * 2.7) * 0.5;
    return c * 0.5 + 0.5;
}

void main() {
    float ndl = clamp(dot(vNormal, SUN), 0.4, 1.0);

    // Mix deep + surface based on how upward-facing this fragment is.
    float upness = clamp(vNormal.y, 0.0, 1.0);
    vec3 waterCol = mix(DEEP, SURFACE, upness * 0.7);
    waterCol *= ndl;

    // Specular highlight in the sun direction
    vec3 refl = reflect(-SUN, vNormal);
    float spec = pow(max(0.0, refl.y), 32.0) * 0.5;
    waterCol += vec3(spec);

    // Shared screen UV + linear depths (used by refraction AND foam).
    vec2 sUV = gl_FragCoord.xy / uViewport;
    float sceneZ = texture(uSceneDepth, sUV).r;
    float lWater = linearizeDepth(gl_FragCoord.z);
    float waterDepth = (sceneZ < 0.999) ? max(0.0, linearizeDepth(sceneZ) - lWater) : 0.0;

    vec3 col = waterCol;

    // Round 423 — screen-space refraction (opt-in via uRefractStrength).
    // Sample the pre-water scene color behind the surface at a wave-
    // distorted screen UV, then absorb toward the water color with depth
    // (Beer-Lambert): shallow shows the lakebed, deep goes opaque blue.
    if (uRefractStrength > 0.0) {
        vec2 refractUV = sUV + vNormal.xz * uRefractStrength * 0.04;
        // Depth guard: if the distorted tap is in FRONT of the water
        // (a foreground object), revert to the straight tap so we don't
        // smear nearby geometry across the surface.
        if (texture(uSceneDepth, refractUV).r < gl_FragCoord.z) refractUV = sUV;
        vec3 below = texture(uSceneColor, refractUV).rgb;
        // v488 — project caustics onto the submerged floor seen through the
        // surface. Bright focused ridges of light, strongest in shallow water
        // and fading as depth absorbs them. Reuses the surface caustic() field
        // at a coarser scale + offset phase so floor and surface don't lock-step.
        float floorCaustic = caustic(vWorld.xz * 0.12 + vec2(7.3, 2.1), uTime * 0.85);
        floorCaustic = smoothstep(0.55, 1.0, floorCaustic);
        float shallow = exp(-waterDepth * uDepthFade);   // 1 = shallow, →0 deep
        below += vec3(0.42, 0.72, 0.95) * floorCaustic * shallow * uCausticStrength * 0.55;
        float tint = 1.0 - exp(-waterDepth * uDepthFade);
        col = mix(below, waterCol, clamp(tint, 0.0, 1.0));
    }

    // Round 51 — SSR. Compute reflection direction in world space, march.
    if (uSSRStrength > 0.0) {
        vec3 V = normalize(vWorld - uCamPos);
        vec3 R = reflect(V, vNormal);
        vec4 ssr = ssrSample(vWorld, R);
        // Fresnel approximation — more reflection at grazing angles.
        float fresnel = pow(1.0 - max(0.0, -V.y), 3.0);
        fresnel = mix(0.25, 1.0, fresnel);     // baseline 25% even when looking down
        float reflectMix = ssr.a * fresnel * uSSRStrength;
        col = mix(col, ssr.rgb, reflectMix);
    }

    // v453b — surface sparkle: bright caustic ridges glinting on the waves.
    // Subtle + additive so it reads as light catching the surface, not a haze.
    float spark = caustic(vWorld.xz * 0.18, uTime);
    spark = smoothstep(0.72, 1.0, spark);
    col += vec3(0.65, 0.85, 1.0) * spark * (0.16 * uCausticStrength);

    // Round 50 — shoreline foam. Brighter where the terrain below is
    // shallow; animated bands break up uniform shorelines into wavefronts.
    float foamMix = 0.0;
    if (uFoamRange > 0.0 && sceneZ < 0.999) {
        foamMix = 1.0 - smoothstep(0.0, uFoamRange, waterDepth);
        foamMix = clamp(foamMix, 0.0, 1.0);
        float wave = 0.5 + 0.5 * sin(vWorld.x * 0.4 + vWorld.z * 0.4 + uTime * 1.2);
        foamMix *= 0.45 + 0.55 * wave;
    }
    col = mix(col, FOAM, foamMix * 0.85);

    // Opaque when refraction composited the background itself; otherwise
    // the original translucent alpha blend.
    float alpha = (uRefractStrength > 0.0) ? 1.0 : mix(0.75, 0.95, foamMix);
    outColor = vec4(col, alpha);
}`;

// Two triangles for a unit quad in the XZ plane (y = 0). CCW from above.
const QUAD_VERTS = new Float32Array([
    0, 0, 0,   1, 0, 0,   1, 0, 1,
    0, 0, 0,   1, 0, 1,   0, 0, 1,
]);

const INSTANCE_FLOATS = 3;
const VOXEL_WATER = 10;
const VOXEL_FLOWING_WATER = 11;

// Round 262 — side-face rendering. Static vertical unit quad in the
// XY plane (z=0). The vertex shader rotates it to face ±X or ±Z based
// on the per-instance face index (0=+X, 1=-X, 2=+Z, 3=-Z). The TOP
// edge samples the same wave function as the top-surface pass so
// sides connect seamlessly with the animated top.
const SIDE_QUAD_VERTS = new Float32Array([
    0, 0, 0,   1, 0, 0,   1, 1, 0,
    0, 0, 0,   1, 1, 0,   0, 1, 0,
]);
const SIDE_INSTANCE_FLOATS = 4;     // pos.x, pos.y, pos.z, faceIdx

const SIDE_VS = `#version 300 es
layout(location=0) in vec3 aPos;        // unit vertical quad
layout(location=1) in vec4 aOffset;     // .xyz = voxel pos, .w = faceIdx (0..3)

uniform mat4 uViewProj;
uniform float uTime;
uniform float uAmplitude;

out vec3 vWorld;
out vec3 vNormal;
out float vLocalY;

// Match the top-pass wave so side top edges align with surface ripples.
vec3 waveSample(vec2 p, float t) {
    float h1  = sin(p.x * 0.40 + t * 1.20) * cos(p.y * 0.40 + t * 0.9);
    float h2  = sin(p.x * 0.95 + p.y * 0.4 + t * 1.85) * 0.85;
    float h3  = sin(p.x * 2.30 - p.y * 2.10 + t * 3.50) * 0.6;
    return vec3(h1 + 0.55 * h2 + 0.25 * h3, 0.0, 0.0);
}

void main() {
    int faceIdx = int(aOffset.w + 0.5);
    vec3 worldPos = aOffset.xyz;
    vec3 normal;

    // Place the quad in the correct plane oriented by face index.
    // aPos: x∈[0,1] runs along the face's tangent axis, y∈[0,1] vertical.
    if (faceIdx == 0) {           // +X face
        worldPos.x += 1.0;
        worldPos.z += aPos.x;
        worldPos.y += aPos.y;
        normal = vec3( 1.0, 0.0, 0.0);
    } else if (faceIdx == 1) {    // -X face
        worldPos.z += (1.0 - aPos.x); // wind for outward normal
        worldPos.y += aPos.y;
        normal = vec3(-1.0, 0.0, 0.0);
    } else if (faceIdx == 2) {    // +Z face
        worldPos.z += 1.0;
        worldPos.x += (1.0 - aPos.x);
        worldPos.y += aPos.y;
        normal = vec3( 0.0, 0.0, 1.0);
    } else {                       // -Z face
        worldPos.x += aPos.x;
        worldPos.y += aPos.y;
        normal = vec3( 0.0, 0.0,-1.0);
    }

    // Top edge: lift to voxel-top (y+1) and add wave displacement so
    // this side meets the animated top surface flush. Bottom edge
    // stays at voxel-bottom (y+0).
    if (aPos.y > 0.5) {
        worldPos.y = aOffset.y + 1.0;
        vec3 ws = waveSample(worldPos.xz, uTime);
        worldPos.y += ws.x * uAmplitude;
    }

    vWorld = worldPos;
    vNormal = normal;
    vLocalY = aPos.y;       // 0 = bottom edge, 1 = top edge
    gl_Position = uViewProj * vec4(worldPos, 1.0);
}`;

const SIDE_FS = `#version 300 es
precision highp float;

in vec3 vWorld;
in vec3 vNormal;
in float vLocalY;

out vec4 outColor;

void main() {
    // Vertical gradient: dark deep blue at bottom → lighter blue at top.
    // Alpha follows the gradient so the bottom looks denser/more opaque.
    vec3 deepCol    = vec3(0.06, 0.18, 0.42);
    vec3 surfaceCol = vec3(0.22, 0.52, 0.82);
    vec3 col = mix(deepCol, surfaceCol, vLocalY);
    float alpha = mix(0.85, 0.62, vLocalY);
    outColor = vec4(col, alpha);
}`;

export class WaterRenderer {
    constructor(gl, world, opts = {}) {
        this.gl = gl;
        this.world = world;
        this._meshedChunks = null;   // v511 — set to the voxel renderer's mesh Map; gates water on land being drawn
        this.amplitude       = opts.amplitude ?? 0.32;   // was 0.18 — more visible chop
        this._amplitudeBoost  = 1.0;                       // weather-driven multiplier
        // Round 316 — bumped from 100ms (10Hz) to 250ms (4Hz). Round
        // 317 — bumped to 500ms (2Hz). The collect() pass loops every
        // voxel in every chunk (169 chunks × 16k voxels = 2.7M reads)
        // to find water surfaces; on a 167-chunk world it takes
        // ~28-57ms. The wave animation itself is GPU-side via uTime
        // so visual smoothness is unaffected — only the surface-list
        // refresh slows. v316 at 4Hz still cost ~28ms/frame mean; v317
        // at 2Hz expected ~14ms/frame mean. Override via
        // window.engineConfig.waterCollectIntervalMs.
        this.collectInterval = opts.collectInterval
            ?? (typeof window !== "undefined" && window.engineConfig?.waterCollectIntervalMs)
            ?? 500;
        this.lastCollect     = 0;

        this.instanceCount = 0;
        this.capacity = 256;
        this._instanceData = new Float32Array(this.capacity * INSTANCE_FLOATS);

        // Round 262 — separate buffer for side faces (per-instance
        // includes a faceIdx in .w). Sized independently of top tiles.
        this.sideInstanceCount = 0;
        this.sideCapacity = 256;
        this._sideInstanceData = new Float32Array(this.sideCapacity * SIDE_INSTANCE_FLOATS);

        this._init();
    }

    _compile(type, src) {
        const gl = this.gl;
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.error("[WaterRenderer] shader:", gl.getShaderInfoLog(sh));
        }
        return sh;
    }

    _init() {
        const gl = this.gl;

        const program = gl.createProgram();
        gl.attachShader(program, this._compile(gl.VERTEX_SHADER,   VS));
        gl.attachShader(program, this._compile(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("[WaterRenderer] link:", gl.getProgramInfoLog(program));
        }
        this.program    = program;
        this.uViewProj  = gl.getUniformLocation(program, "uViewProj");
        this.uTime      = gl.getUniformLocation(program, "uTime");
        this.uAmplitude = gl.getUniformLocation(program, "uAmplitude");
        // WaterField disturbance (added)
        this.uDisturb       = gl.getUniformLocation(program, "uDisturb");
        this.uFieldOrigin   = gl.getUniformLocation(program, "uFieldOrigin");
        this.uFieldInvSize  = gl.getUniformLocation(program, "uFieldInvSize");
        this.uDisturbActive = gl.getUniformLocation(program, "uDisturbActive");
        this._waterField    = null;
        // Round 50 — shoreline foam
        this.uSceneDepth = gl.getUniformLocation(program, "uSceneDepth");
        this.uViewport   = gl.getUniformLocation(program, "uViewport");
        this.uFoamRange  = gl.getUniformLocation(program, "uFoamRange");
        // Round 51 — SSR
        this.uCamPos      = gl.getUniformLocation(program, "uCamPos");
        this.uSceneColor  = gl.getUniformLocation(program, "uSceneColor");
        this.uSSRStrength = gl.getUniformLocation(program, "uSSRStrength");
        // Round 423 — screen-space refraction
        this.uRefractStrength = gl.getUniformLocation(program, "uRefractStrength");
        this.uCausticStrength = gl.getUniformLocation(program, "uCausticStrength");
        this.uDepthFade       = gl.getUniformLocation(program, "uDepthFade");
        this._sceneDepthTex = null;
        this._sceneColorTex = null;
        this._foamRange     = 1.5;
        this._ssrStrength   = 0.65;
        this._refractStrength = 1.0;    // v424 — ON by default (validated on GPU)
        this._causticStrength = 1.0;    // v453b — surface sparkle ON by default
        this._depthFade       = 0.12;   // absorption rate (higher = goes opaque sooner)

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        // Static unit quad
        const posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTS, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        // Per-instance water positions
        const instBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
        gl.bufferData(gl.ARRAY_BUFFER, this._instanceData.byteLength, gl.STREAM_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(1, 1);

        gl.bindVertexArray(null);
        this.vao = vao;
        this.instanceBuf = instBuf;

        // Round 262 — side-face program + VAO. Separate from the top
        // pass because the shader (SIDE_VS/FS) does no wave displacement
        // and the per-instance layout differs (vec4 vs vec3).
        const sideProgram = gl.createProgram();
        gl.attachShader(sideProgram, this._compile(gl.VERTEX_SHADER,   SIDE_VS));
        gl.attachShader(sideProgram, this._compile(gl.FRAGMENT_SHADER, SIDE_FS));
        gl.linkProgram(sideProgram);
        if (!gl.getProgramParameter(sideProgram, gl.LINK_STATUS)) {
            console.error("[WaterRenderer] side link:", gl.getProgramInfoLog(sideProgram));
        }
        this.sideProgram    = sideProgram;
        this.uSideViewProj  = gl.getUniformLocation(sideProgram, "uViewProj");
        this.uSideTime      = gl.getUniformLocation(sideProgram, "uTime");
        this.uSideAmplitude = gl.getUniformLocation(sideProgram, "uAmplitude");

        const sideVao = gl.createVertexArray();
        gl.bindVertexArray(sideVao);

        const sidePosBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, sidePosBuf);
        gl.bufferData(gl.ARRAY_BUFFER, SIDE_QUAD_VERTS, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        const sideInstBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, sideInstBuf);
        gl.bufferData(gl.ARRAY_BUFFER, this._sideInstanceData.byteLength, gl.STREAM_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(1, 1);

        gl.bindVertexArray(null);
        this.sideVao = sideVao;
        this.sideInstanceBuf = sideInstBuf;
    }

    _ensureCapacity(needed) {
        if (needed <= this.capacity) return;
        const gl = this.gl;
        let cap = this.capacity;
        while (cap < needed) cap *= 2;
        this.capacity = cap;
        this._instanceData = new Float32Array(cap * INSTANCE_FLOATS);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
        gl.bufferData(gl.ARRAY_BUFFER, this._instanceData.byteLength, gl.STREAM_DRAW);
    }

    // Round 262 — side-instance capacity grower.
    _ensureSideCapacity(needed) {
        if (needed <= this.sideCapacity) return;
        const gl = this.gl;
        let cap = this.sideCapacity;
        while (cap < needed) cap *= 2;
        this.sideCapacity = cap;
        this._sideInstanceData = new Float32Array(cap * SIDE_INSTANCE_FLOATS);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.sideInstanceBuf);
        gl.bufferData(gl.ARRAY_BUFFER, this._sideInstanceData.byteLength, gl.STREAM_DRAW);
    }

    // Walk all chunks. Emit instances for TOP-SURFACE water voxels
    // (those whose cell directly above is NOT also water — avoids
    // overdrawing a wave quad for every cell of a deep water column)
    // and SIDE-FACE water voxels (round 262 — those with one or more
    // horizontal neighbors that are air, so the sides of a water
    // column are visible against surrounding air gaps).
    collect() {
        const world = this.world;
        const tmp = [];
        const sideTmp = [];

        // Helper: read neighbor voxel handling cross-chunk lookup.
        // v465 — returns -1 (NOT 0/air) when the adjacent chunk isn't loaded.
        // A side face is only emitted for genuine air (=== 0); the ocean fill
        // never leaves a real air-edge inside loaded terrain, so every "water
        // wall" was actually the loaded-world / streaming boundary. Returning
        // -1 there suppresses those walls while still drawing real edges
        // (e.g. a flowing-water column / future waterfall) against true air.
        const readNeighbor = (chunk, S, lx, ly, lz) => {
            if (ly < 0) return 0;
            if (lx >= 0 && lx < S && lz >= 0 && lz < S) {
                return chunk.get(lx, ly, lz);
            }
            const adjCx = chunk.cx + Math.floor(lx / S);
            const adjCz = chunk.cz + Math.floor(lz / S);
            const adj = world.chunks.get(`${adjCx},${adjCz}`);
            if (!adj) return -1;
            const wlx = ((lx % S) + S) % S;
            const wlz = ((lz % S) + S) % S;
            return adj.get(wlx, ly, wlz);
        };

        for (const chunk of world.chunks.values()) {
            // v511 — don't render a chunk's water until its LAND mesh exists.
            // Terrain meshes on a worker (async) while water reads voxel data
            // directly (instant), so without this gate water shows through
            // not-yet-drawn land on load. _meshedChunks is the voxel renderer's
            // mesh Map (keyed by chunk._key); absent = land not drawn yet.
            if (this._meshedChunks && chunk._key != null && !this._meshedChunks.has(chunk._key)) continue;
            const S = chunk.size;
            const H = chunk.height;
            const ox = chunk.cx * S;
            const oz = chunk.cz * S;

            for (let x = 0; x < S; x++) {
                for (let z = 0; z < S; z++) {
                    for (let y = 0; y < H; y++) {
                        const v = chunk.get(x, y, z);
                        if (v !== VOXEL_WATER && v !== VOXEL_FLOWING_WATER) continue;

                        // TOP SURFACE — skip if water above (interior column)
                        const above = (y + 1 < H) ? chunk.get(x, y + 1, z) : 0;
                        if (above !== VOXEL_WATER && above !== VOXEL_FLOWING_WATER) {
                            tmp.push(ox + x, y, oz + z);
                        }

                        // SIDE FACES (round 262) — emit one per horizontal
                        // neighbor that is air. Solid neighbors (stone etc.)
                        // already block the view via their own draw, so we
                        // only need water sides where the neighbor is air.
                        // 4 face indices: 0=+X, 1=-X, 2=+Z, 3=-Z.
                        const nPx = readNeighbor(chunk, S, x + 1, y, z);
                        if (nPx === 0) sideTmp.push(ox + x, y, oz + z, 0);
                        const nMx = readNeighbor(chunk, S, x - 1, y, z);
                        if (nMx === 0) sideTmp.push(ox + x, y, oz + z, 1);
                        const nPz = readNeighbor(chunk, S, x, y, z + 1);
                        if (nPz === 0) sideTmp.push(ox + x, y, oz + z, 2);
                        const nMz = readNeighbor(chunk, S, x, y, z - 1);
                        if (nMz === 0) sideTmp.push(ox + x, y, oz + z, 3);
                    }
                }
            }
        }

        // Upload top instances
        const count = tmp.length / 3;
        this._ensureCapacity(count);
        for (let i = 0; i < tmp.length; i++) this._instanceData[i] = tmp[i];
        this.instanceCount = count;
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
        gl.bufferSubData(
            gl.ARRAY_BUFFER, 0,
            this._instanceData.subarray(0, count * INSTANCE_FLOATS)
        );

        // Upload side instances (round 262)
        const sideCount = sideTmp.length / SIDE_INSTANCE_FLOATS;
        this._ensureSideCapacity(sideCount);
        for (let i = 0; i < sideTmp.length; i++) this._sideInstanceData[i] = sideTmp[i];
        this.sideInstanceCount = sideCount;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.sideInstanceBuf);
        gl.bufferSubData(
            gl.ARRAY_BUFFER, 0,
            this._sideInstanceData.subarray(0, sideCount * SIDE_INSTANCE_FLOATS)
        );
    }

    // Throttled collect — re-scans water positions only every collectInterval ms.
    update(now = performance.now()) {
        if (now - this.lastCollect > this.collectInterval) {
            this.collect();
            this.lastCollect = now;
        }
    }

    // Round 35 — weather scales wave amplitude. Storm 2.5×, rain 1.6×,
    // cloudy 1.2×, clear 1.0×, snow 0.7× (frozen-ish water).
    setAmplitudeBoost(mul) {
        this._amplitudeBoost = Math.max(0.0, mul);
    }

    setSceneDepth(tex) { this._sceneDepthTex = tex; }
    setSceneColor(tex) { this._sceneColorTex = tex; }
    // Round 423 — screen-space refraction controls.
    setRefraction(strength) { this._refractStrength = Math.max(0, +strength || 0); }
    setCaustics(strength) { this._causticStrength = Math.max(0, strength == null ? 1 : +strength); }
    setDepthFade(v) { this._depthFade = Math.max(0.001, +v || 0.12); }

    render(camera, time) {
        if (this.instanceCount === 0 && this.sideInstanceCount === 0) return;
        const gl = this.gl;

        const mvp = camera.getViewProjMatrix?.() || camera.getMatrix?.();

        // Translucent: alpha blend on, depth-test on, depth-write off
        // (so other transparent surfaces behind water still show through).
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        // See water from below too — disable culling for the water pass.
        gl.disable(gl.CULL_FACE);

        // ---- TOP SURFACE PASS ----
        if (this.instanceCount > 0) {
            gl.useProgram(this.program);
            if (mvp) gl.uniformMatrix4fv(this.uViewProj, false, mvp);
            gl.uniform1f(this.uTime, time);
            gl.uniform1f(this.uAmplitude, this.amplitude * this._amplitudeBoost);
            gl.uniform1f(this.uCausticStrength, this._causticStrength ?? 1.0);   // v453b surface sparkle

            // Round 50 — shoreline foam. Bind scene-depth copy at unit 0.
            if (this._sceneDepthTex) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, this._sceneDepthTex);
                gl.uniform1i(this.uSceneDepth, 0);
                gl.uniform2f(this.uViewport, gl.drawingBufferWidth, gl.drawingBufferHeight);
                gl.uniform1f(this.uFoamRange, this._foamRange);
            } else {
                gl.uniform1f(this.uFoamRange, 0.0);
            }

            // Round 51 — SSR. Bind scene-color copy at unit 1; pass camera
            // pos for ray origin. SSR disabled if no scene color set.
            gl.uniform3f(this.uCamPos, camera.position.x, camera.position.y, camera.position.z);
            if (this._sceneColorTex) {
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, this._sceneColorTex);
                gl.uniform1i(this.uSceneColor, 1);
                gl.uniform1f(this.uSSRStrength, this._ssrStrength);
                // Round 423 — refraction needs the scene-color tap too.
                gl.uniform1f(this.uRefractStrength, this._refractStrength);
                gl.uniform1f(this.uDepthFade, this._depthFade);
            } else {
                gl.uniform1f(this.uSSRStrength, 0.0);
                gl.uniform1f(this.uRefractStrength, 0.0);
            }

            // WaterField disturbance — bind at texture unit 2 (added)
            const wf = this._waterField;
            if (wf && wf.texture) {
                gl.activeTexture(gl.TEXTURE2);
                gl.bindTexture(gl.TEXTURE_2D, wf.texture);
                gl.uniform1i(this.uDisturb, 2);
                gl.uniform2f(this.uFieldOrigin, wf.originX, wf.originZ);
                gl.uniform2f(this.uFieldInvSize, wf.invSizeX, wf.invSizeZ);
                gl.uniform1f(this.uDisturbActive, 1.0);
            } else {
                gl.uniform1f(this.uDisturbActive, 0.0);
            }

            gl.bindVertexArray(this.vao);
            gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.instanceCount);
            gl.bindVertexArray(null);
        }

        // ---- SIDE FACE PASS (round 262) ----
        // Drawn AFTER tops so the surface foam/SSR write to the depth
        // buffer first, then sides blend behind. Sides use their own
        // simpler program with no wave displacement.
        if (this.sideInstanceCount > 0) {
            gl.useProgram(this.sideProgram);
            if (mvp) gl.uniformMatrix4fv(this.uSideViewProj, false, mvp);
            gl.uniform1f(this.uSideTime, time);
            if (this.uSideAmplitude) gl.uniform1f(this.uSideAmplitude, this.amplitude * this._amplitudeBoost);
            gl.bindVertexArray(this.sideVao);
            gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.sideInstanceCount);
            gl.bindVertexArray(null);
        }

        // Restore state
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.enable(gl.CULL_FACE);
    }

    // Attach a WaterField so its disturbance texture rides on the surface.
    setWaterField(field) { this._waterField = field; }
    setMeshedChunks(map) { this._meshedChunks = map; }   // v511 — gate water on land being drawn

    snapshot() {
        return {
            instances: this.instanceCount,
            sideInstances: this.sideInstanceCount,
        };
    }
}
