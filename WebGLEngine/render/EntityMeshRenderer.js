// FILE: render/EntityMeshRenderer.js
// VERSION: v1 - INSTANCED TRIANGLE-MESH ENTITY RENDERER
//
// Renders ECS entities that have a Render component with an assetId.
// Each unique assetId becomes one VAO + instance buffer + draw call,
// regardless of how many entities share that asset.
//
// Mesh data has only positions (no normals, no UVs, no colors). Lighting
// is cheap-but-good: fragment shader computes a face normal from the
// gradient of vWorld via dFdx/dFdy and shades against a fixed sun.
// Per-instance color comes from entityVisuals (kind -> color) so meshes
// pick up the same player/enemy/prop tinting as cubes.
//
// Lifecycle:
//   - Entities pass through every frame; renderer groups by assetId.
//   - First time an assetId is seen, we kick off an async load.
//   - While loading or after permanent failure, the entity simply
//     doesn't draw via this renderer (caller's cube fallback shows it).
//   - Once the mesh is loaded, it stays cached for the session.

import { colorFor, scaleFor, animFor, shininessFor, heightScaleFor } from "./entityVisuals.js";
import { SkeletalAnimator } from "../gpu/SkeletalAnimator.js";
import { MaterialSetTextureCache } from "./MaterialSetTextureCache.js";
// Round 312 — frame-budget controls.
import {
    shouldCullEntity, decideAnimatorUpdate, animatorNeedsEveryFrame, ENTITY_PERF,
} from "./entityPerf.js";
// Round 315 — split render.entities into rigged vs batched for profiling.
// No-op when the profiler isn't active.
import { profStart, profEnd } from "../debug/frameProfiler.js";

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aOffset;
layout(location=2) in vec3 aScale;          // round 41 — non-uniform xyz scale
layout(location=3) in vec3 aColor;
layout(location=4) in vec3 aNormal;
layout(location=5) in vec3 aVertexColor;
layout(location=6) in vec2 aTexCoord;
layout(location=7) in float aYaw;
layout(location=8) in float aTilt;
layout(location=9) in float aAnim;
// Round 19 stage 2 — skinning attributes
layout(location=10) in uvec4 aJoints;
layout(location=11) in vec4  aWeights;
// Round 81 — roll (rotation around the entity's local Z axis after
// yaw + pitch). Enables full tumbling motion for hurled projectiles.
layout(location=12) in float aTiltZ;

uniform mat4  uViewProj;
uniform float uTime;
uniform bool  uHasSkin;
uniform mat4  uJointMatrices[128];

out vec3 vWorld;
out vec3 vColor;
out vec3 vNormal;
out vec3 vVertexColor;
out vec2 vTexCoord;

void main() {
    // Round 19 — skinning. Linear blend skinning when uHasSkin is set.
    // Output is in mesh local space (still needs yaw/tilt + scale + offset).
    vec3 skinnedPos = aPos;
    vec3 skinnedNormal = aNormal;
    if (uHasSkin) {
        mat4 skinMat = aWeights.x * uJointMatrices[aJoints.x]
                     + aWeights.y * uJointMatrices[aJoints.y]
                     + aWeights.z * uJointMatrices[aJoints.z]
                     + aWeights.w * uJointMatrices[aJoints.w];
        skinnedPos    = (skinMat * vec4(aPos, 1.0)).xyz;
        skinnedNormal = (skinMat * vec4(aNormal, 0.0)).xyz;
    }

    // Round 53 — yaw + tilt rotation. Round 81 — added roll (tiltZ).
    // Order: roll first, then pitch, then yaw. Right-to-left in math,
    // so the local Z axis rotates before the world-Y yaw composes it
    // into world space — matches what intuition expects for tumbling
    // objects ("spin in place, then point somewhere").
    float cy = cos(aYaw),  sy = sin(aYaw);
    float cp = cos(aTilt), sp = sin(aTilt);
    float cr = cos(aTiltZ), sr = sin(aTiltZ);
    mat3 pitchMat = mat3(
        1.0, 0.0,  0.0,
        0.0, cp,   sp,
        0.0,-sp,   cp
    );
    mat3 yawMat = mat3(
        cy,  0.0, -sy,
        0.0, 1.0,  0.0,
        sy,  0.0,  cy
    );
    mat3 rollMat = mat3(
        cr,  sr,  0.0,
       -sr,  cr,  0.0,
        0.0, 0.0, 1.0
    );
    mat3 rot = yawMat * pitchMat * rollMat;

    // Round 12 — procedural idle animation modes (skipped for skinned
    // meshes, since the skin animation IS the motion).
    vec3 animPos = skinnedPos;
    if (!uHasSkin && aAnim > 0.5) {
        float phase = aOffset.x * 0.07 + aOffset.z * 0.05;
        if (aAnim < 1.5) {
            float weight = clamp(aPos.y, 0.0, 2.0);
            float bob  = sin(uTime * 1.4 + phase)        * 0.04 * weight;
            float sway = sin(uTime * 0.8 + phase * 1.3)  * 0.02 * weight;
            animPos.y += bob;
            animPos.x += sway;
        } else if (aAnim < 2.5) {
            float breath = sin(uTime * 1.6 + phase) * 0.025;
            animPos *= (1.0 + breath);
        } else if (aAnim < 3.5) {
            float gait = sin(uTime * 4.0 + phase) * 0.05;
            float c = cos(gait), s = sin(gait);
            animPos = vec3(animPos.x, animPos.y * c - animPos.z * s, animPos.y * s + animPos.z * c);
        } else if (aAnim < 4.5) {
            float roll = uTime * 18.0 + phase * 4.0;
            float c = cos(roll), s = sin(roll);
            animPos = vec3(animPos.x, animPos.y * c - animPos.z * s, animPos.y * s + animPos.z * c);
        } else {
            // Round 28 — anim mode 5: belt scroll. Visualize ammo belt
            // feeding into the cannon by translating verts along local Z
            // in a sawtooth pattern. Periodic, no rotation.
            float scroll = mod(uTime * 4.0 + phase, 1.0);
            animPos.z += (scroll - 0.5) * 0.12;
        }
    }

    vec3 rotatedPos    = rot * animPos;
    vec3 rotatedNormal = rot * skinnedNormal;

    vec3 worldPos = rotatedPos * aScale + aOffset;     // round 41 — component-wise xyz
    vWorld = worldPos;
    vColor = aColor;
    vNormal = rotatedNormal;
    vVertexColor = aVertexColor;
    vTexCoord = aTexCoord;
    gl_Position = uViewProj * vec4(worldPos, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vColor;
in vec3 vNormal;
in vec3 vVertexColor;
in vec2 vTexCoord;
out vec4 outColor;

uniform sampler2D uTexture;       // round 17 — base color
uniform bool      uHasTexture;    // round 17 — sample only when bound
uniform vec3      uSunDir;        // round 33 — env-driven (was const SUN)
uniform vec3      uCameraPos;     // round 33 — for view-direction specular
uniform float     uShininess;     // round 33 — Phong exponent (0 = matte)
uniform float     uSpecStrength;  // round 33 — specular brightness scalar
uniform vec3      uSkyHorizon;    // round 34 — env horizon color
uniform vec3      uSkyZenith;     // round 34 — env zenith color
// v824 — day/night ambient + moonlight
uniform float     uAmbientFloor;  // minimum lighting level (0..1); default 0.40
uniform vec3      uAmbientTint;   // multiplicative tint on ambient floor (1,1,1 = neutral)
uniform vec3      uMoonDir;       // normalized; only matters if uMoonStrength > 0
uniform float     uMoonStrength;  // 0..1; additive moonlight contribution
uniform vec3      uMoonTint;      // moon color (cool blue-white default)

// Round 177 — parallax material set support. When the engine has a
// registered parallax material set for the kind being drawn, the
// renderer binds three additional textures (albedo + height + normal)
// and sets uHasParallax=1. The shader then:
//   1. Computes a cotangent frame in the fragment from screen-space
//      derivatives of position + UV (Christian Schueler's "Followup:
//      Normal Mapping Without Precomputed Tangents"). This means we
//      don't need to bake tangents into vertex data.
//   2. Transforms the view direction into tangent space.
//   3. Runs parallax occlusion mapping with 16-step linear search +
//      6-step binary refinement.
//   4. Samples the normal map at the displaced UV and uses it for
//      lighting instead of the geometric normal.
//
// When uHasParallax=0 (the common case until a material set is
// registered for this kind), the shader uses the existing base-color
// path unchanged. Zero perf cost for unparallaxed entities.
uniform sampler2D uHeightMap;
uniform sampler2D uNormalMap;
uniform bool      uHasParallax;
uniform float     uHeightScale;   // typ. 0.05-0.15 depending on subject

// Cotangent frame from screen-space derivatives. Returns a basis where
// the third column is the geometric normal — multiplying a tangent-
// space vector by this matrix gives a world-space vector.
mat3 cotangentFrame(vec3 N, vec3 p, vec2 uv) {
    vec3 dp1 = dFdx(p);
    vec3 dp2 = dFdy(p);
    vec2 duv1 = dFdx(uv);
    vec2 duv2 = dFdy(uv);
    vec3 dp2perp = cross(dp2, N);
    vec3 dp1perp = cross(N, dp1);
    vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
    vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
    float invmax = inversesqrt(max(dot(T, T), dot(B, B)));
    return mat3(T * invmax, B * invmax, N);
}

vec2 parallaxOcclusion(vec2 uv, vec3 viewTS) {
    const int LINEAR_STEPS = 16;
    float vz = max(viewTS.z, 0.1);
    float steps = mix(float(LINEAR_STEPS) * 1.5, float(LINEAR_STEPS) * 0.6, viewTS.z);
    float layerDepth = 1.0 / steps;
    vec2 deltaUV = (viewTS.xy / vz) * uHeightScale * layerDepth;

    vec2 curUV = uv;
    float curLayerDepth = 0.0;
    float curSample = 1.0 - texture(uHeightMap, curUV).r;
    for (int i = 0; i < LINEAR_STEPS; i++) {
        if (curLayerDepth >= curSample) break;
        curUV -= deltaUV;
        curSample = 1.0 - texture(uHeightMap, curUV).r;
        curLayerDepth += layerDepth;
    }
    vec2 prevUV = curUV + deltaUV;
    float depthAfter  = curSample - curLayerDepth;
    float depthBefore = (1.0 - texture(uHeightMap, prevUV).r) - (curLayerDepth - layerDepth);
    float weight = depthAfter / max(depthAfter - depthBefore, 0.001);
    return mix(curUV, prevUV, weight);
}

void main() {
    vec3 normal;
    float nLen2 = dot(vNormal, vNormal);
    if (nLen2 > 0.01) {
        normal = normalize(vNormal);
    } else {
        vec3 ddx = dFdx(vWorld);
        vec3 ddy = dFdy(vWorld);
        normal = normalize(cross(ddx, ddy));
    }

    // Round 177 — parallax path. When a material set is bound for
    // this entity's kind, override the base-color sampling and the
    // normal with parallax-displaced + normal-mapped versions.
    vec3 surface = vColor * vVertexColor;
    vec2 finalUV = vTexCoord;
    if (uHasParallax) {
        // Tangent-space transform via cotangent frame
        mat3 TBN = cotangentFrame(normal, vWorld, vTexCoord);
        mat3 invTBN = transpose(TBN);
        vec3 viewWS = normalize(uCameraPos - vWorld);
        vec3 viewTS = normalize(invTBN * viewWS);
        finalUV = parallaxOcclusion(vTexCoord, viewTS);
        // Sample tangent-space normal map at the displaced UV and
        // transform back to world space for lighting. We tint slightly
        // with the asset's vColor so the kind's identity tint still
        // reads through (kaiju_water remains bluish, etc.).
        vec3 nTS = texture(uNormalMap, finalUV).rgb * 2.0 - 1.0;
        normal = normalize(TBN * normalize(nTS));
        vec3 albedo = texture(uTexture, finalUV).rgb;
        surface = albedo * mix(vec3(1.0), vColor, 0.35);
    } else if (uHasTexture) {
        vec4 tx = texture(uTexture, vTexCoord);
        surface *= tx.rgb;
    }

    // v824 — three-light model: sun (white directional), moon (cool
    // directional, only active at night), ambient (floor with tint —
    // neutral by day, cool by night). Defaults match the original
    // max(0.4, dot(N, sunDir)) behavior when ambient tint = (1,1,1),
    // ambient floor = 0.4, moon strength = 0.
    float sunNdl  = max(0.0, dot(normal, uSunDir));
    float moonNdl = max(0.0, dot(normal, uMoonDir)) * uMoonStrength;
    vec3 sunPart   = vec3(1.0) * sunNdl;
    vec3 moonPart  = uMoonTint   * moonNdl;
    vec3 ambient   = uAmbientTint * uAmbientFloor;
    vec3 totalLight = sunPart + moonPart + ambient;
    // Sun back-face floor: in the original model, surfaces facing away
    // from the sun got max(0.4, dot) = 0.4 floor. Preserve that so the
    // numeric range over [0..2] doesn't blow out (sun on front +
    // ambient on top).
    // (No clamp here — HDR pipeline handles >1 values.)
    float ndl = max(uAmbientFloor, dot(normal, uSunDir));   // kept for downstream specular use
    // Round 33 — Blinn-Phong specular term
    // Round 34 — sky reflection mixed in from env-driven horizon+zenith.
    // Reflectivity scales with shininess (gloss = more sky pickup).
    vec3 specular = vec3(0.0);
    vec3 viewDir = normalize(uCameraPos - vWorld);
    if (uShininess > 0.5) {
        vec3 halfVec = normalize(uSunDir + viewDir);
        float specDot = max(0.0, dot(normal, halfVec));
        specular = vec3(pow(specDot, uShininess) * uSpecStrength);
        vec3 reflDir = reflect(-viewDir, normal);
        float skyT = clamp(reflDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 skyCol = mix(uSkyHorizon, uSkyZenith, skyT);
        float reflectivity = clamp(uShininess / 192.0, 0.05, 0.30);
        specular += skyCol * reflectivity;
    }
    // Round 137 — HDR emissive boost. Saturated entity colors
    // (portal_holy, portal_tech, hellspawn_portal, caster_wizard,
    // any kaiju kind tinted toward 1.0 on a channel) push above 1.0
    // so the scene FBO + bloom + ACES pipeline reads them as
    // glowing markers rather than just bright cubes. 2.0× (vs the
    // 2.5× voxel boost) since entities tend to be smaller — too
    // much boost would over-bloom and wash out detail.
    vec3 finalColor = surface * totalLight + specular;
    float maxC = max(finalColor.r, max(finalColor.g, finalColor.b));
    float emissive = smoothstep(0.85, 0.95, maxC);
    finalColor *= mix(1.0, 2.0, emissive);
    outColor = vec4(finalColor, 1.0);
}`;

// Round 50 - shadow casting. Depth-only VS that replicates the full
// position transform chain from the color VS so depth silhouettes match.
// Drops normal, color, texture, vertex-color, UV outputs (depth FS is
// no-op). Uses uLightVP instead of uViewProj. Skin + procedural anim +
// yaw/tilt all preserved so rigged kaiju cast their actual posed
// silhouette.
const DEPTH_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aOffset;
layout(location=2) in vec3 aScale;
layout(location=7) in float aYaw;
layout(location=8) in float aTilt;
layout(location=9) in float aAnim;
layout(location=10) in uvec4 aJoints;
layout(location=11) in vec4  aWeights;
layout(location=12) in float aTiltZ;

uniform mat4  uLightVP;
uniform float uTime;
uniform bool  uHasSkin;
uniform mat4  uJointMatrices[128];

void main() {
    // Skinning - same as color VS. Uses last frame's joint matrices when
    // the depth pass runs before color (1-frame lag invisible at 60fps).
    vec3 skinnedPos = aPos;
    if (uHasSkin) {
        mat4 skinMat = aWeights.x * uJointMatrices[aJoints.x]
                     + aWeights.y * uJointMatrices[aJoints.y]
                     + aWeights.z * uJointMatrices[aJoints.z]
                     + aWeights.w * uJointMatrices[aJoints.w];
        skinnedPos = (skinMat * vec4(aPos, 1.0)).xyz;
    }
    // Yaw + tilt rotation matrices identical to color VS. Round 81 adds roll.
    float cy = cos(aYaw),  sy = sin(aYaw);
    float cp = cos(aTilt), sp = sin(aTilt);
    float cr = cos(aTiltZ), sr = sin(aTiltZ);
    mat3 pitchMat = mat3(
        1.0, 0.0,  0.0,
        0.0, cp,   sp,
        0.0,-sp,   cp
    );
    mat3 yawMat = mat3(
        cy,  0.0, -sy,
        0.0, 1.0,  0.0,
        sy,  0.0,  cy
    );
    mat3 rollMat = mat3(
        cr,  sr,  0.0,
       -sr,  cr,  0.0,
        0.0, 0.0, 1.0
    );
    mat3 rot = yawMat * pitchMat * rollMat;
    // Procedural animation modes 1..5 - identical math to color VS so the
    // shadow silhouette ripples in sync with the rendered mesh.
    vec3 animPos = skinnedPos;
    if (!uHasSkin && aAnim > 0.5) {
        float phase = aOffset.x * 0.07 + aOffset.z * 0.05;
        if (aAnim < 1.5) {
            float weight = clamp(aPos.y, 0.0, 2.0);
            float bob  = sin(uTime * 1.4 + phase)        * 0.04 * weight;
            float sway = sin(uTime * 0.8 + phase * 1.3)  * 0.02 * weight;
            animPos.y += bob;
            animPos.x += sway;
        } else if (aAnim < 2.5) {
            float breath = sin(uTime * 1.6 + phase) * 0.025;
            animPos *= (1.0 + breath);
        } else if (aAnim < 3.5) {
            float gait = sin(uTime * 4.0 + phase) * 0.05;
            float c = cos(gait), s = sin(gait);
            animPos = vec3(animPos.x, animPos.y * c - animPos.z * s, animPos.y * s + animPos.z * c);
        } else if (aAnim < 4.5) {
            float roll = uTime * 18.0 + phase * 4.0;
            float c = cos(roll), s = sin(roll);
            animPos = vec3(animPos.x, animPos.y * c - animPos.z * s, animPos.y * s + animPos.z * c);
        } else {
            float scroll = mod(uTime * 4.0 + phase, 1.0);
            animPos.z += (scroll - 0.5) * 0.12;
        }
    }
    vec3 rotatedPos = rot * animPos;
    vec3 worldPos   = rotatedPos * aScale + aOffset;
    gl_Position = uLightVP * vec4(worldPos, 1.0);
}`;

const DEPTH_FS = `#version 300 es
precision highp float;
void main() {}
`;

const INSTANCE_FLOATS = 13;      // round 81 — added aTiltZ (was 12)
const INSTANCE_BYTES  = INSTANCE_FLOATS * 4;

export class EntityMeshRenderer {
    constructor(gl, assetLoader) {
        this.gl = gl;
        this.loader = assetLoader;
        this.lastDrawn = 0;
        this.lastAssetsUsed = 0;

        // assetId -> { vao, instanceBuf, capacity, mesh }
        this.assetVAOs = new Map();
        // assetId -> reusable Float32Array for packing
        this._instanceBuffers = new Map();
        // Round 19 stage 2 — skeletal animators per rigged asset.
        // Single animator per mesh (all instances of the same mesh share
        // joint matrices for now; stage 3 will add per-instance state).
        this._animators = new Map();
        this._lastAnimT = performance.now() * 0.001;

        // Round 185 — GL error aggregator for the WebGL "Insufficient
        // buffer size" / INVALID_OPERATION spam diagnostic. Keys are
        // `${assetId}|${errName}|${drawPath}`; values record count,
        // representative state, and last-emit timestamp for rate-
        // limiting console warnings. window._emrErrors() dumps a
        // tabular summary; window._emrErrorsClear() resets.
        this._emrErrorAgg = new Map();
        if (typeof window !== "undefined") {
            const self = this;
            window._emrErrors = function() {
                const rows = [];
                for (const [, r] of self._emrErrorAgg) {
                    rows.push({
                        asset:        r.assetId,
                        err:          r.errName,
                        path:         r.drawPath,
                        count:        r.count,
                        liveInst:     r.lastInstanceCount,
                        liveCap:      r.lastCapacity,
                        verts:        r.meshVerts,
                        indices:      r.meshIndices,
                        multi:        r.multiMaterial,
                        firstSeen:    r.firstSeenAt,
                    });
                }
                if (rows.length === 0) {
                    console.log("[EntityMesh] no GL errors recorded since boot");
                } else {
                    console.table(rows);
                }
                return rows;
            };
            window._emrErrorsClear = function() {
                self._emrErrorAgg.clear();
                console.log("[EntityMesh] error aggregator cleared");
            };
        }

        this._init();

        // Round 178 — listen for mesh hot-swaps from the loader. When
        // the bench/roster's Trellis step lands a GLB and the user
        // (or auto-wiring) swaps the kind, the loader notifies us
        // here so we can drop our VAO + instance buffer caches keyed
        // by that asset name. Next render frame rebuilds them against
        // the new mesh's buffers.
        if (typeof assetLoader?.onMeshSwap === "function") {
            assetLoader.onMeshSwap((name, oldMesh, newMesh) => {
                // Invalidate the VAO cache
                const entry = this.assetVAOs.get(name);
                if (entry) {
                    if (entry.vao)         try { gl.deleteVertexArray(entry.vao);   } catch {}
                    if (entry.instanceBuf) try { gl.deleteBuffer(entry.instanceBuf); } catch {}
                    this.assetVAOs.delete(name);
                }
                // Drop the per-asset CPU packing buffer too — the new
                // mesh may have a different instance budget.
                this._instanceBuffers.delete(name);
                // Drop animators (a Trellis-generated GLB is unrigged
                // — no animator survives the swap anyway).
                this._animators.delete(name);
                console.log(`[EntityMeshRenderer] invalidated caches for swapped asset "${name}"`);
            });
        }
    }

    // Round 33 — set the sun direction. Called by OgreScenario when
    // environment changes. Vector should be normalized; renderer accepts
    // any direction and pushes to shader on next draw.
    setSun(dir) {
        if (!Array.isArray(dir) || dir.length < 3) return;
        const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
        this.sunDir = [dir[0] / len, dir[1] / len, dir[2] / len];
    }

    // Round 34 — set sky horizon + zenith colors for reflection sampling.
    setSky({ horizon, zenith }) {
        if (Array.isArray(horizon) && horizon.length >= 3) this.skyHorizon = horizon.slice(0, 3);
        if (Array.isArray(zenith)  && zenith.length  >= 3) this.skyZenith  = zenith.slice(0, 3);
    }

    // Round 34 — set fog color for sky-reflection sampling
    setFog(color) {
        if (!Array.isArray(color) || color.length < 3) return;
        this.fogColor = [color[0], color[1], color[2]];
    }

    _compile(type, src) {
        const gl = this.gl;
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.error("[EntityMesh] shader:", gl.getShaderInfoLog(sh));
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
            console.error("[EntityMesh] link:", gl.getProgramInfoLog(program));
        }
        this.program = program;
        this.uViewProj = gl.getUniformLocation(program, "uViewProj");
        this.uTime     = gl.getUniformLocation(program, "uTime");
        this.uHasSkin       = gl.getUniformLocation(program, "uHasSkin");
        this.uJointMatrices = gl.getUniformLocation(program, "uJointMatrices");
        // Round 33 — specular + env sun
        this.uSunDir       = gl.getUniformLocation(program, "uSunDir");
        this.uCameraPos    = gl.getUniformLocation(program, "uCameraPos");
        this.uShininess    = gl.getUniformLocation(program, "uShininess");
        this.uSpecStrength = gl.getUniformLocation(program, "uSpecStrength");
        // Round 34 — env sky reflection
        this.uSkyHorizon   = gl.getUniformLocation(program, "uSkyHorizon");
        this.uSkyZenith    = gl.getUniformLocation(program, "uSkyZenith");
        // v824 — ambient floor + moonlight (set per-frame by main loop)
        this.uAmbientFloor  = gl.getUniformLocation(program, "uAmbientFloor");
        this.uAmbientTint   = gl.getUniformLocation(program, "uAmbientTint");
        this.uMoonDir       = gl.getUniformLocation(program, "uMoonDir");
        this.uMoonStrength  = gl.getUniformLocation(program, "uMoonStrength");
        this.uMoonTint      = gl.getUniformLocation(program, "uMoonTint");
        // Defaults preserve original behavior (max(0.4, dot(N, sunDir)) with no moon)
        this.ambientFloor  = 0.40;
        this.ambientTint   = [1.0, 1.0, 1.0];
        this.moonDir       = [0, 1, 0];
        this.moonStrength  = 0.0;
        this.moonTint      = [0.55, 0.65, 0.95];     // cool blue (only used when strength > 0)
        // Defaults — overridable via setSun() / setSky()
        this.sunDir     = [0.4082, 0.8165, 0.4082];
        this.skyHorizon = [0.78, 0.65, 0.55];
        this.skyZenith  = [0.45, 0.62, 0.85];
        // Round 17 — texture uniforms
        this.uTexture     = gl.getUniformLocation(program, "uTexture");
        this.uHasTexture  = gl.getUniformLocation(program, "uHasTexture");

        // Round 177 — parallax material set uniforms
        this.uHeightMap   = gl.getUniformLocation(program, "uHeightMap");
        this.uNormalMap   = gl.getUniformLocation(program, "uNormalMap");
        this.uHasParallax = gl.getUniformLocation(program, "uHasParallax");
        this.uHeightScale = gl.getUniformLocation(program, "uHeightScale");
        // Lazy-create the cache. Spinning it up here means the cache
        // will see any material sets restored from localStorage on
        // page load (main.js logs the restore count before constructing
        // this renderer).
        this._matSetCache = new MaterialSetTextureCache(gl);

        // Round 50 - depth-only program for shadow casting. Shares the
        // same VAOs (per-asset) so we don't need any extra attribute
        // setup; the depth VS just declares the locations it reads.
        // First frame on a freshly-loaded rigged mesh: animator.jointMatrices
        // is identity by default which is fine; once the color pass updates
        // it, depth pass uses last frame's pose (1-frame lag).
        const depthProgram = gl.createProgram();
        gl.attachShader(depthProgram, this._compile(gl.VERTEX_SHADER,   DEPTH_VS));
        gl.attachShader(depthProgram, this._compile(gl.FRAGMENT_SHADER, DEPTH_FS));
        gl.linkProgram(depthProgram);
        if (!gl.getProgramParameter(depthProgram, gl.LINK_STATUS)) {
            console.error("[EntityMesh] depth link:", gl.getProgramInfoLog(depthProgram));
        }
        this.depthProgram = depthProgram;
        this.uLightVP_depth       = gl.getUniformLocation(depthProgram, "uLightVP");
        this.uTime_depth          = gl.getUniformLocation(depthProgram, "uTime");
        this.uHasSkin_depth       = gl.getUniformLocation(depthProgram, "uHasSkin");
        this.uJointMatrices_depth = gl.getUniformLocation(depthProgram, "uJointMatrices");
    }

    _getOrCreateAssetVAO(assetId, mesh) {
        let entry = this.assetVAOs.get(assetId);
        // Round 262 — sanity check: if the cached entry's mesh reference
        // doesn't match the current mesh, the mesh was swapped / mutated
        // without firing the swap listener. Tear down and rebuild. This
        // is belt-and-suspenders for any loader path that updates mesh
        // shape (vertices, indices, primitiveRanges) without notifying
        // us — the next render frame rebuilds against the current state.
        if (entry && entry.mesh !== mesh) {
            const gl = this.gl;
            if (entry.vao)         try { gl.deleteVertexArray(entry.vao);   } catch {}
            if (entry.instanceBuf) try { gl.deleteBuffer(entry.instanceBuf); } catch {}
            this.assetVAOs.delete(assetId);
            this._instanceBuffers.delete(assetId);
            this._animators.delete(assetId);
            entry = null;
        }
        if (entry) return entry;

        const gl = this.gl;
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        // Mesh positions
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        // Mesh indices (bound to VAO)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);

        // Optional per-vertex normals (loc 4). If the mesh has no
        // normal buffer, leave the attribute disabled and set its
        // generic value to zero — the FS treats |aNormal|==0 as
        // "no real normal, fall back to dFdx/dFdy".
        if (mesh.nbo) {
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nbo);
            gl.enableVertexAttribArray(4);
            gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 0, 0);
        } else {
            gl.disableVertexAttribArray(4);
            gl.vertexAttrib3f(4, 0, 0, 0);
        }

        // Optional per-vertex material colors (loc 5). Default to white
        // when absent so the per-instance tint shows through unmodified.
        if (mesh.cbo) {
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.cbo);
            gl.enableVertexAttribArray(5);
            gl.vertexAttribPointer(5, 3, gl.FLOAT, false, 0, 0);
        } else {
            gl.disableVertexAttribArray(5);
            gl.vertexAttrib3f(5, 1, 1, 1);
        }

        // Round 17 — optional UV (loc 6). Default to (0,0) when absent
        // so the FS shouldn't try to sample without a real coordinate.
        if (mesh.tbo) {
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.tbo);
            gl.enableVertexAttribArray(6);
            gl.vertexAttribPointer(6, 2, gl.FLOAT, false, 0, 0);
        } else {
            gl.disableVertexAttribArray(6);
            gl.vertexAttrib2f(6, 0, 0);
        }

        // Per-instance buffer (offset+scale+color, interleaved)
        const instBuf = gl.createBuffer();
        const initialCap = 16;
        const initialBytes = initialCap * INSTANCE_BYTES;
        gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
        gl.bufferData(gl.ARRAY_BUFFER, initialBytes, gl.STREAM_DRAW);

        gl.enableVertexAttribArray(1);                                 // aOffset (vec3)
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, INSTANCE_BYTES, 0);
        gl.vertexAttribDivisor(1, 1);

        gl.enableVertexAttribArray(2);                                 // aScale (vec3, round 41)
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, INSTANCE_BYTES, 12);
        gl.vertexAttribDivisor(2, 1);

        gl.enableVertexAttribArray(3);                                 // aColor (vec3) — offset shifted by +8
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, INSTANCE_BYTES, 24);
        gl.vertexAttribDivisor(3, 1);

        // Round 53 — yaw + tilt (radians) per instance — offsets shifted by +8
        gl.enableVertexAttribArray(7);                                 // aYaw
        gl.vertexAttribPointer(7, 1, gl.FLOAT, false, INSTANCE_BYTES, 36);
        gl.vertexAttribDivisor(7, 1);

        gl.enableVertexAttribArray(8);                                 // aTilt
        gl.vertexAttribPointer(8, 1, gl.FLOAT, false, INSTANCE_BYTES, 40);
        gl.vertexAttribDivisor(8, 1);

        // Round 12 — animation type/intensity per instance — offset shifted by +8
        gl.enableVertexAttribArray(9);                                 // aAnim
        gl.vertexAttribPointer(9, 1, gl.FLOAT, false, INSTANCE_BYTES, 44);
        gl.vertexAttribDivisor(9, 1);

        // Round 81 — roll (third rotation axis) per instance. Enables
        // full 3-axis tumbling for hurled projectiles. Lives at byte
        // offset 48 (last float in the widened 13-float layout).
        gl.enableVertexAttribArray(12);                                // aTiltZ
        gl.vertexAttribPointer(12, 1, gl.FLOAT, false, INSTANCE_BYTES, 48);
        gl.vertexAttribDivisor(12, 1);

        // Round 19 stage 2 — skinning attributes for rigged meshes.
        // JOINTS_0 is uvec4 of joint indices (UNSIGNED_BYTE or _SHORT).
        // WEIGHTS_0 is vec4 of normalized weights summing to 1.0.
        // Use vertexAttribIPointer for the integer-typed joints attribute.
        if (mesh.jbo && mesh.wbo) {
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.jbo);
            gl.enableVertexAttribArray(10);                            // aJoints (uvec4)
            gl.vertexAttribIPointer(10, 4, mesh.jointsComponentType ?? gl.UNSIGNED_SHORT, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.wbo);
            gl.enableVertexAttribArray(11);                            // aWeights (vec4)
            gl.vertexAttribPointer(11, 4, gl.FLOAT, false, 0, 0);
        } else {
            // Round 42 — CRITICAL: shader declares `uvec4 aJoints` (integer
            // type). When no buffer is bound, WebGL2 falls back to the
            // generic vertex attribute value, which DEFAULTS TO FLOAT type.
            // Reading an integer-typed shader input from a float generic
            // is a "type mismatch" that floods INVALID_OPERATION errors on
            // every draw. Setting an integer generic with vertexAttribI4ui
            // makes the generic value's data type unsigned-int, matching
            // uvec4. (vertexAttrib4f also fixes aWeights as float.)
            gl.disableVertexAttribArray(10);
            gl.vertexAttribI4ui(10, 0, 0, 0, 0);                       // uvec4 fallback
            gl.disableVertexAttribArray(11);
            gl.vertexAttrib4f(11, 0, 0, 0, 0);                         // vec4 fallback
        }

        gl.bindVertexArray(null);

        entry = { vao, instanceBuf: instBuf, capacity: initialCap, mesh };
        this.assetVAOs.set(assetId, entry);
        this._instanceBuffers.set(assetId, new Float32Array(initialCap * INSTANCE_FLOATS));
        return entry;
    }

    _ensureInstanceCapacity(assetId, entry, needed) {
        if (needed <= entry.capacity) return;
        const gl = this.gl;
        let cap = entry.capacity;
        while (cap < needed) cap *= 2;
        entry.capacity = cap;
        this._instanceBuffers.set(assetId, new Float32Array(cap * INSTANCE_FLOATS));
        gl.bindBuffer(gl.ARRAY_BUFFER, entry.instanceBuf);
        gl.bufferData(gl.ARRAY_BUFFER, cap * INSTANCE_BYTES, gl.STREAM_DRAW);
    }

    // Round 200 — LOD VAO. Built lazily the first time a far-distance
    // draw decides to use mesh.lodMesh. Shares the same instance buffer
    // as the main VAO (entities have the same per-instance data
    // regardless of which mesh resolution we draw with); points its
    // position attribute at lodMesh._vbo, its element array at
    // lodMesh._ibo. Normals/colors/UVs default to neutral generic
    // values since the v197 decimator output has positions+indices only.
    // Multi-material and rigged meshes are excluded upstream — those
    // don't benefit from LOD anyway.
    _ensureLODVAO(assetId, entry, mesh) {
        if (entry.lodVao) return entry.lodVao;
        const lodGL = this.loader.ensureLODGPUBuffers?.(assetId);
        if (!lodGL) return null;
        const gl = this.gl;
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        // Position (loc 0) from the LOD vertex buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, lodGL.vbo);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        // Element array
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lodGL.ibo);

        // Neutral defaults — lodMesh has no normal/color/UV buffers
        gl.disableVertexAttribArray(4); gl.vertexAttrib3f(4, 0, 0, 0);
        gl.disableVertexAttribArray(5); gl.vertexAttrib3f(5, 1, 1, 1);
        gl.disableVertexAttribArray(6); gl.vertexAttrib2f(6, 0, 0);

        // Reuse the SAME instance buffer (per-instance data is mesh-agnostic).
        // All per-instance attribute pointers must be redeclared on the new VAO
        // since VAO state is fully self-contained.
        gl.bindBuffer(gl.ARRAY_BUFFER, entry.instanceBuf);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, INSTANCE_BYTES, 0);  gl.vertexAttribDivisor(1, 1);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, INSTANCE_BYTES, 12); gl.vertexAttribDivisor(2, 1);
        gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, INSTANCE_BYTES, 24); gl.vertexAttribDivisor(3, 1);
        gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 1, gl.FLOAT, false, INSTANCE_BYTES, 36); gl.vertexAttribDivisor(7, 1);
        gl.enableVertexAttribArray(8); gl.vertexAttribPointer(8, 1, gl.FLOAT, false, INSTANCE_BYTES, 40); gl.vertexAttribDivisor(8, 1);
        gl.enableVertexAttribArray(9); gl.vertexAttribPointer(9, 1, gl.FLOAT, false, INSTANCE_BYTES, 44); gl.vertexAttribDivisor(9, 1);
        gl.enableVertexAttribArray(12); gl.vertexAttribPointer(12, 1, gl.FLOAT, false, INSTANCE_BYTES, 48); gl.vertexAttribDivisor(12, 1);
        // Joint/weight defaults (no rigged LOD)
        gl.disableVertexAttribArray(10); gl.vertexAttribI4ui(10, 0, 0, 0, 0);
        gl.disableVertexAttribArray(11); gl.vertexAttrib4f(11, 0, 0, 0, 0);

        gl.bindVertexArray(null);
        entry.lodVao = vao;
        entry.lodIndexCount = lodGL.indexCount;
        return vao;
    }

    // entities: full list including non-meshed ones. Returns the entity
    // ids consumed (drew via mesh) so the cube renderer can skip them.
    // Round 123 — multi-material instanced draw. Walks mesh.primitiveRanges
    // and binds the matching per-primitive texture before each
    // drawElementsInstanced call. Single-texture meshes don't use this
    // path; callers branch on mesh.isMultiMaterial. Cost: one draw call
    // per primitive per asset per frame instead of one per asset. For
    // ~5 primitives × ~10 robots this is ~50 extra calls per frame,
    // which is well under the per-frame budget at any reasonable
    // resolution.
    //
    // The helper assumes the caller has already bound the VAO and set
    // all uniforms common across primitives (uViewProj, joint matrices,
    // etc.). Only the texture-related uniforms change between passes.
    // Round 417 — draw an instanced batch, choosing the right GL call by
    // whether the mesh actually has an index buffer. Procedural meshes
    // (civ_plaza, kaiju_water, obelisk, etc.) carry vertices but no IBO;
    // drawElementsInstanced on a VAO with no ELEMENT_ARRAY_BUFFER bound is
    // INVALID_OPERATION *even when count is 0* (WebGL spec), which is the
    // source of the long-standing [EntityMesh] INVALID_OPERATION spam.
    // Non-indexed meshes must use drawArraysInstanced over the raw vertex
    // list instead. `indexed` lets callers force the element path for the
    // decimated LOD VAO (which always has its own IBO bound).
    _drawInstanced(mesh, idxCount, instanceCount, indexed) {
        const gl = this.gl;
        if (indexed && idxCount > 0) {
            gl.drawElementsInstanced(gl.TRIANGLES, idxCount, gl.UNSIGNED_INT, 0, instanceCount);
        } else {
            // Fall back to non-indexed. vertexCount must be a multiple of
            // 3 for a triangle list; trailing stragglers (if any) are
            // ignored by the rasterizer rather than erroring.
            gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.vertexCount | 0, instanceCount);
        }
    }

    _drawInstancedMultiMaterial(mesh, instanceCount) {
        const gl = this.gl;
        const ranges = mesh.primitiveRanges;
        const texByMat = mesh.texturesByMaterial || {};
        gl.activeTexture(gl.TEXTURE0);
        for (const r of ranges) {
            const tex = (r.materialIdx != null) ? texByMat[r.materialIdx] : null;
            if (tex) {
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.uniform1i(this.uTexture, 0);
                gl.uniform1i(this.uHasTexture, 1);
            } else {
                // Primitive lacks a baseColorTexture — render via per-vertex
                // color baked at parse time. Same fallback the single-texture
                // path uses for textureless meshes.
                gl.uniform1i(this.uHasTexture, 0);
            }
            // Indices are UNSIGNED_INT (4 bytes each), offset is in bytes
            gl.drawElementsInstanced(
                gl.TRIANGLES,
                r.indexCount,
                gl.UNSIGNED_INT,
                r.indexStart * 4,
                instanceCount
            );
        }
    }

    // Round 185 — always-on rate-limited GL error capture. Called after
    // every drawElementsInstanced in the render and renderDepth paths.
    // Replaces the v180 on-demand `window._emrDiag` flag with structured
    // warnings that fire automatically when getError() returns non-zero.
    // Throttled per (assetId, errName, drawPath) to once per 5 seconds
    // so the console doesn't flood at 300+ errors/frame, but each
    // unique error gets at least one warning with all the state needed
    // to diagnose it. window._emrErrors() / _emrErrorsClear() at any
    // time for forensic review.
    _recordGLError(assetId, mesh, entry, ents, drawPath) {
        // Round 320 — gl.getError() is a forced GPU sync point. The
        // WebGL spec requires the driver to flush pending commands
        // before returning the actual error state. v319 measured
        // ~6ms/call entirely from this getError, not bufferSubData
        // as initially hypothesized. With ~7 batched calls/frame +
        // shadow pass, this was costing ~40ms/frame on slow scenes.
        //
        // Fix: sample 1 in N calls per renderer instance. Persistent
        // errors (the only kind worth catching) still show up within
        // a second; transient one-shot errors may be missed but are
        // rare and not worth the per-call cost.
        //
        // Restore the original behavior for debugging by setting
        // window.engineConfig.entityMeshErrorPollEvery = 1.
        const checkEvery = (typeof window !== "undefined" && window.engineConfig?.entityMeshErrorPollEvery) ?? 64;
        this._emrCheckCounter = (this._emrCheckCounter ?? 0) + 1;
        if (this._emrCheckCounter % checkEvery !== 0) return;

        const gl = this.gl;
        const err = gl.getError();
        if (err === gl.NO_ERROR) return;
        const errName =
              err === gl.INVALID_OPERATION ? "INVALID_OPERATION"
            : err === gl.INVALID_VALUE     ? "INVALID_VALUE"
            : err === gl.INVALID_ENUM      ? "INVALID_ENUM"
            : err === gl.INVALID_FRAMEBUFFER_OPERATION ? "INVALID_FRAMEBUFFER_OPERATION"
            : err === gl.OUT_OF_MEMORY     ? "OUT_OF_MEMORY"
            : `0x${err.toString(16)}`;
        const key = `${assetId}|${errName}|${drawPath}`;
        const agg = this._emrErrorAgg;
        let rec = agg.get(key);
        const nowMs = performance.now();
        if (!rec) {
            if (agg.size >= 50) return;   // bounded
            rec = {
                assetId, errName, drawPath,
                // -Infinity so the first error for this key always
                // emits, regardless of when in process lifetime it
                // occurred. Otherwise nowMs - 0 might be < 5000ms on
                // pages that error within the first 5s of load and
                // the user would never see the first warning.
                count: 0, lastEmitMs: -Infinity,
                firstSeenAt: new Date().toISOString(),
                instanceCount: ents.length,
                capacity:      entry.capacity,
                meshVerts:     mesh.vertexCount,
                meshIndices:   mesh.indexCount,
                multiMaterial: !!mesh.isMultiMaterial,
                primitiveRanges: mesh.primitiveRanges?.length ?? 0,
                hasNbo: !!mesh.nbo, hasCbo: !!mesh.cbo, hasTbo: !!mesh.tbo,
                hasJbo: !!mesh.jbo, hasWbo: !!mesh.wbo,
            };
            agg.set(key, rec);
        }
        rec.count++;
        rec.lastInstanceCount = ents.length;
        rec.lastCapacity      = entry.capacity;
        if (nowMs - rec.lastEmitMs > 5000) {
            rec.lastEmitMs = nowMs;
            console.warn(
                `[EntityMesh] ${errName} ×${rec.count} on "${assetId}" (${drawPath}): ` +
                `instances=${rec.lastInstanceCount}/${rec.lastCapacity} ` +
                `verts=${rec.meshVerts} indices=${rec.meshIndices}` +
                `${rec.multiMaterial ? ` multiMat(${rec.primitiveRanges})` : ""}` +
                ` — window._emrErrors() for full table`
            );
        }
    }

    render(entities, camera) {
        const gl = this.gl;
        // Round 185 — always-on rate-limited GL error capture. Each
        // draw site below calls this._recordGLError(...) after its
        // drawElementsInstanced. The helper is a class method so the
        // shadow pass (renderDepth) can use it too.
        this.lastDrawn = 0;
        this.lastAssetsUsed = 0;
        const consumed = new Set();
        if (!entities || entities.length === 0) return consumed;

        // Round 312 — frustum + distance culling. Pre-compute the
        // camera forward vector once. Convention: yaw=0 → look toward
        // -Z, +pitch looks up. Matches camera basis used elsewhere.
        ENTITY_PERF._resetFrameStats();
        const cy = Math.cos(camera.yaw  ?? 0), sy = Math.sin(camera.yaw  ?? 0);
        const cp = Math.cos(camera.pitch ?? 0), sp = Math.sin(camera.pitch ?? 0);
        const camFwd = { x: sy * cp, y: sp, z: -cy * cp };

        // Group by assetId
        const groups = new Map();
        for (const e of entities) {
            if (!e.assetId) continue;
            ENTITY_PERF.stats.totalEntities++;
            // Per-entity cull check. Skipped entities aren't even
            // grouped — saves the per-asset loop overhead too.
            const cullReason = shouldCullEntity(e, camera, camFwd);
            if (cullReason === "far") {
                ENTITY_PERF.stats.culledFar++;
                continue;
            }
            if (cullReason === "frustum") {
                ENTITY_PERF.stats.culledFrustum++;
                continue;
            }
            const g = groups.get(e.assetId);
            if (g) g.push(e);
            else groups.set(e.assetId, [e]);
        }
        if (groups.size === 0) return consumed;

        // Set up shared GL state once. Disable cull for mesh draws —
        // GLB triangle winding after the VBA primitive merge isn't
        // guaranteed to be GL-standard CCW, so culling can hide half
        // an alien's faces. Restored after the loop. Voxel terrain's
        // greedy mesh re-enables cull on its next draw via its own VAO.
        gl.useProgram(this.program);
        const cullWasEnabled = gl.isEnabled(gl.CULL_FACE);
        if (cullWasEnabled) gl.disable(gl.CULL_FACE);

        const mvp = camera.getViewProjMatrix?.() || camera.getMatrix?.();
        if (mvp) gl.uniformMatrix4fv(this.uViewProj, false, mvp);
        const nowSec = performance.now() * 0.001;
        const animDt = Math.min(0.1, Math.max(0, nowSec - this._lastAnimT));
        this._lastAnimT = nowSec;
        if (this.uTime) gl.uniform1f(this.uTime, nowSec);
        // Round 33 — env sun direction + camera position for specular
        if (this.uSunDir) gl.uniform3fv(this.uSunDir, this.sunDir);
        // v824 — ambient floor + moonlight
        if (this.uAmbientFloor) gl.uniform1f(this.uAmbientFloor, this.ambientFloor);
        if (this.uAmbientTint)  gl.uniform3fv(this.uAmbientTint, this.ambientTint);
        if (this.uMoonDir)      gl.uniform3fv(this.uMoonDir, this.moonDir);
        if (this.uMoonStrength) gl.uniform1f(this.uMoonStrength, this.moonStrength);
        if (this.uMoonTint)     gl.uniform3fv(this.uMoonTint, this.moonTint);
        if (this.uCameraPos && camera?.position) {
            gl.uniform3f(this.uCameraPos, camera.position.x, camera.position.y, camera.position.z);
        }
        if (this.uSpecStrength) gl.uniform1f(this.uSpecStrength, 0.65);
        // Round 34 — env sky for reflection sampling
        if (this.uSkyHorizon) gl.uniform3fv(this.uSkyHorizon, this.skyHorizon);
        if (this.uSkyZenith)  gl.uniform3fv(this.uSkyZenith,  this.skyZenith);
        if (this.uFogColor) gl.uniform3fv(this.uFogColor, this.fogColor);

        for (const [assetId, ents] of groups) {
            // Lookup or kick off load
            let mesh = this.loader.cache.get(assetId);
            if (mesh === undefined) {
                this.loader.loadAsset(assetId);
                continue;
            }
            if (mesh === null) continue;

            const entry = this._getOrCreateAssetVAO(assetId, mesh);
            this._ensureInstanceCapacity(assetId, entry, ents.length);

            // Round 17 — bind base-color texture.
            // Round 123 — for multi-material meshes the helper will
            // rebind textures per primitive range; skip the single
            // global bind here. Single-texture meshes use the legacy
            // path with one bind for the whole asset.
            //
            // Round 177 — parallax material set override. Before the
            // base-color bind, check if a registered material set
            // exists for this asset's representative kind. If so, the
            // material set's albedo replaces the base color at
            // TEXTURE0 and we bind height+normal to TEXTURE1+TEXTURE2
            // so the parallax FS path takes over. We still apply the
            // per-vertex color tint inside the shader, just attenuated
            // (mix 0.35) so the AI-generated material reads as the
            // dominant surface rather than being washed out by the
            // kind's flat color.
            //
            // Multi-material meshes (e.g. the rigged RobotExpressive
            // GLB) are skipped — they have their own per-primitive
            // textures, and overriding all of them with a single
            // material set wouldn't make visual sense. Procedural
            // single-mesh kaiju (the common case from gpuAssetLoader)
            // get the override.
            const repKind = ents[0]?.kind || "other";
            const matSet = (!mesh.isMultiMaterial) ? this._matSetCache.get(repKind) : null;
            if (matSet) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, matSet.albedo);
                gl.uniform1i(this.uTexture, 0);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, matSet.height);
                gl.uniform1i(this.uHeightMap, 1);
                gl.activeTexture(gl.TEXTURE2);
                gl.bindTexture(gl.TEXTURE_2D, matSet.normal);
                gl.uniform1i(this.uNormalMap, 2);
                gl.uniform1i(this.uHasParallax, 1);
                gl.uniform1i(this.uHasTexture, 1);     // for the !uHasParallax fallback
                // Round 179 — per-kind height scale from entityVisuals.
                // Replaces the round-177 hard-coded 0.08. Lets organic
                // kaiju (rock, bone, lava-crack) read with more depth
                // while metallic kaiju (kaiju_tech) stay tight.
                gl.uniform1f(this.uHeightScale, heightScaleFor(repKind));
                // Reset active texture back to 0 so anything down-
                // stream that expects TEXTURE0 active by convention
                // still works.
                gl.activeTexture(gl.TEXTURE0);
            } else if (mesh.isMultiMaterial) {
                gl.uniform1i(this.uHasParallax, 0);
                // _drawInstancedMultiMaterial handles per-prim binding
            } else if (mesh.texture) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, mesh.texture);
                gl.uniform1i(this.uTexture, 0);
                gl.uniform1i(this.uHasTexture, 1);
                gl.uniform1i(this.uHasParallax, 0);
            } else {
                gl.uniform1i(this.uHasTexture, 0);
                gl.uniform1i(this.uHasParallax, 0);
            }
            // Round 33 — set per-asset Phong shininess. Use first
            // entity's kind as representative (most assets are 1:1 with kind).
            if (this.uShininess) {
                const kind = ents[0]?.kind || "other";
                gl.uniform1f(this.uShininess, shininessFor(kind));
            }

            const isRigged = mesh.isRigged && mesh.skin && mesh.animations?.length > 0;
            const buf = this._instanceBuffers.get(assetId);

            if (isRigged) {
                // Round 19 stage 3 — per-instance animators. Each entity
                // gets its own SkeletalAnimator with a random initial time
                // offset so multiple instances of the same mesh don't
                // animate in lockstep. Cost: one draw call per rigged
                // entity instead of one batched draw. For typical scene
                // (≤20 rigged kaiju) the overhead is negligible.
                profStart("entities.rigged");
                gl.uniform1i(this.uHasSkin, 1);
                gl.bindVertexArray(entry.vao);
                for (const e of ents) {
                    const kind  = e.kind || "other";
                    const baseScale = (e.scale != null) ? e.scale : scaleFor(kind);
                    // Round 41 — non-uniform scale, falls back to baseScale
                    const sx = (e.scaleX != null) ? e.scaleX : baseScale;
                    const sy = (e.scaleY != null) ? e.scaleY : baseScale;
                    const sz = (e.scaleZ != null) ? e.scaleZ : baseScale;
                    const color = colorFor(kind);
                    const cm = (e.colorMul != null) ? e.colorMul : 1.0;
                    const tint = e.colorTint;
                    let cr = color[0] * cm + (tint ? tint[0] : 0);
                    let cg = color[1] * cm + (tint ? tint[1] : 0);
                    let cb = color[2] * cm + (tint ? tint[2] : 0);
                    // v549 — lerp-to-color tint (entity:tint). Composes last.
                    if (e.tintMix > 0 && e.tintColor) {
                        const m = e.tintMix, tc = e.tintColor;
                        cr = cr * (1 - m) + tc[0] * m; cg = cg * (1 - m) + tc[1] * m; cb = cb * (1 - m) + tc[2] * m;
                    }
                    buf[0] = e.x;
                    buf[1] = e.y + sy * 0.5;            // ground anchor uses Y scale
                    buf[2] = e.z;
                    buf[3] = sx;
                    buf[4] = sy;
                    buf[5] = sz;
                    buf[6] = cr;
                    buf[7] = cg;
                    buf[8] = cb;
                    buf[9]  = e.yaw   ?? 0;
                    buf[10] = e.tiltX ?? 0;
                    buf[11] = 0;     // skinning replaces procedural anim
                    buf[12] = e.tiltZ ?? 0;     // round 81 — roll
                    gl.bindBuffer(gl.ARRAY_BUFFER, entry.instanceBuf);
                    // Round 319 — orphan (see batched paths for full
                    // rationale). Rigged is one-entity-per-call so
                    // bufferSubData of just INSTANCE_FLOATS, but the
                    // sync stall risk is the same — and rigged fires
                    // once per entity per frame, so the stall hits
                    // N times per frame.
                    gl.bufferData(gl.ARRAY_BUFFER, entry.capacity * INSTANCE_BYTES, gl.STREAM_DRAW);
                    gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf.subarray(0, INSTANCE_FLOATS));

                    // Per-entity animator
                    const animator = this._getOrCreateInstanceAnimator(e.id, mesh);
                    // Round 19 stage 3 — clip selection from entity property.
                    // Stage 4 will hook gameplay states; for now any caller
                    // can set e.animClip = "walk" / "attack" / etc.
                    if (e.animClip && animator._lastClipName !== e.animClip) {
                        animator.setClipByName(e.animClip);
                        animator._lastClipName = e.animClip;
                    }
                    // Round 312 — distance-throttled animator update.
                    // Animators driving a Ragdoll (onPose set) need
                    // every-frame dt for physics integration; everything
                    // else gets tiered by distance. The animator's
                    // jointMatrices buffer persists across skipped
                    // frames, so the previous pose is correctly reused.
                    let dtToApply = animDt;
                    if (!animatorNeedsEveryFrame(animator)) {
                        const dx = e.x - camera.position.x;
                        const dy = (e.y || 0) - camera.position.y;
                        const dz = e.z - camera.position.z;
                        const distSq = dx*dx + dy*dy + dz*dz;
                        dtToApply = decideAnimatorUpdate(animator, distSq, animDt);
                    }
                    if (dtToApply !== null) {
                        animator.update(dtToApply);
                        ENTITY_PERF.stats.animatorUpdates++;
                    } else {
                        ENTITY_PERF.stats.animatorSkips++;
                    }
                    gl.uniformMatrix4fv(this.uJointMatrices, false, animator.jointMatrices);

                    if (mesh.isMultiMaterial) {
                        this._drawInstancedMultiMaterial(mesh, 1);
                    } else {
                        this._drawInstanced(mesh, mesh.indexCount, 1, !!mesh.ibo);
                    }
                    // v837 — limb pass for severed limbs. Body pass above
                    // shows the amputated body (detached bones pinned to
                    // parent); this second pass shows the flying limb
                    // (detached bones get real physics matrices, body
                    // collapses to identity). Only invoked when the
                    // animator is a MeshRigBridge with detached bones.
                    if (animator.computeLimbJointMatrices && animator.detachedBones?.size > 0) {
                        const limbMats = animator.computeLimbJointMatrices();
                        if (limbMats) {
                            gl.uniformMatrix4fv(this.uJointMatrices, false, limbMats);
                            if (mesh.isMultiMaterial) {
                                this._drawInstancedMultiMaterial(mesh, 1);
                            } else {
                                this._drawInstanced(mesh, mesh.indexCount, 1, !!mesh.ibo);
                            }
                            ENTITY_PERF.stats.drewRigged++;
                            ENTITY_PERF.stats.limbDraws = (ENTITY_PERF.stats.limbDraws || 0) + 1;
                        }
                    }
                    // Round 185 — error capture (single-instance rigged path).
                    // Pass a 1-element ents synthetic so the live-instance
                    // count reflects this single draw, not the loop's overall.
                    this._recordGLError(assetId, mesh, entry, [e], "rigged-1x");
                    consumed.add(e.id);
                    this.lastDrawn++;
                    ENTITY_PERF.stats.drewRigged++;   // round 313 — counter wired
                }
                gl.bindVertexArray(null);
                this.lastAssetsUsed++;
                profEnd("entities.rigged");
            } else {
                // Non-rigged: original batched path. Pack all instances
                // into one buffer write + one instanced draw.
                profStart("entities.batched");
                gl.uniform1i(this.uHasSkin, 0);

                // Round 200 — LOD selection. Compute average squared
                // distance from camera to entities in this group. If
                // it's beyond LOD_THRESHOLD² and the v197 quadric
                // decimator has produced lodMesh data for this asset,
                // bind the lodVao + use its (smaller) index count.
                // Multi-material meshes skip LOD — they have per-
                // primitive ranges that don't translate to the
                // single-buffer lodMesh layout.
                let useLOD = false;
                let drawVao      = entry.vao;
                let drawIdxCount = mesh.indexCount;
                if (!mesh.isMultiMaterial && mesh.lodMesh && camera?.position) {
                    const LOD_THRESHOLD = this.lodThreshold ?? 40;
                    const cpx = camera.position.x, cpy = camera.position.y, cpz = camera.position.z;
                    let sumD2 = 0;
                    for (let k = 0; k < ents.length; k++) {
                        const e = ents[k];
                        const dx = e.x - cpx, dy = (e.y || 0) - cpy, dz = e.z - cpz;
                        sumD2 += dx * dx + dy * dy + dz * dz;
                    }
                    const avgDist = Math.sqrt(sumD2 / ents.length);
                    if (avgDist > LOD_THRESHOLD) {
                        const lodVao = this._ensureLODVAO(assetId, entry, mesh);
                        if (lodVao) {
                            useLOD = true;
                            drawVao = lodVao;
                            drawIdxCount = entry.lodIndexCount;
                            this.lastLODDrawn = (this.lastLODDrawn || 0) + ents.length;
                        }
                    }
                }

                let off = 0;
                for (const e of ents) {
                    const kind  = e.kind || "other";
                    const baseScale = (e.scale != null) ? e.scale : scaleFor(kind);
                    const sx = (e.scaleX != null) ? e.scaleX : baseScale;
                    const sy = (e.scaleY != null) ? e.scaleY : baseScale;
                    const sz = (e.scaleZ != null) ? e.scaleZ : baseScale;
                    const color = colorFor(kind);
                    const cm = (e.colorMul != null) ? e.colorMul : 1.0;
                    const tint = e.colorTint;
                    let cr = color[0] * cm + (tint ? tint[0] : 0);
                    let cg = color[1] * cm + (tint ? tint[1] : 0);
                    let cb = color[2] * cm + (tint ? tint[2] : 0);
                    if (e.tintMix > 0 && e.tintColor) {     // v549 — lerp-to-color tint
                        const m = e.tintMix, tc = e.tintColor;
                        cr = cr * (1 - m) + tc[0] * m; cg = cg * (1 - m) + tc[1] * m; cb = cb * (1 - m) + tc[2] * m;
                    }
                    buf[off + 0] = e.x;
                    buf[off + 1] = e.y + sy * 0.5;
                    buf[off + 2] = e.z;
                    buf[off + 3] = sx;
                    buf[off + 4] = sy;
                    buf[off + 5] = sz;
                    buf[off + 6] = cr;
                    buf[off + 7] = cg;
                    buf[off + 8] = cb;
                    buf[off + 9]  = e.yaw   ?? 0;
                    buf[off + 10] = e.tiltX ?? 0;
                    buf[off + 11] = animFor(kind);
                    buf[off + 12] = e.tiltZ ?? 0;     // round 81 — roll
                    off += INSTANCE_FLOATS;
                    consumed.add(e.id);
                }
                gl.bindBuffer(gl.ARRAY_BUFFER, entry.instanceBuf);
                // Round 319 — buffer orphan to avoid GPU sync stall.
                // The driver may still be reading entry.instanceBuf
                // for the previous frame's drawElementsInstanced when
                // we call bufferSubData; without orphaning, the CPU
                // blocks waiting for the GPU to finish. Calling
                // bufferData with size only (no data) tells the
                // driver "I don't need the old contents — allocate
                // fresh storage". The old storage stays in use for
                // the previous frame; the new storage receives our
                // upload. v318 measured 5.95ms per call for ONE
                // instanced draw — almost entirely sync wait.
                // Preserves the capacity invariant from
                // _ensureInstanceCapacity (entry.capacity matches
                // actual GL buffer size).
                gl.bufferData(gl.ARRAY_BUFFER, entry.capacity * INSTANCE_BYTES, gl.STREAM_DRAW);
                gl.bufferSubData(
                    gl.ARRAY_BUFFER, 0,
                    buf.subarray(0, ents.length * INSTANCE_FLOATS)
                );
                gl.bindVertexArray(drawVao);
                if (mesh.isMultiMaterial) {
                    this._drawInstancedMultiMaterial(mesh, ents.length);
                } else {
                    // LOD VAO always has its own IBO; otherwise use the
                    // mesh's IBO presence to pick element vs array draw.
                    this._drawInstanced(mesh, drawIdxCount, ents.length, useLOD || !!mesh.ibo);
                }
                // Round 185 — always-on rate-limited error capture
                // (was the v180 _emrDiag flag-driven inline block).
                this._recordGLError(assetId, mesh, entry, ents, useLOD ? "batched-lod" : "batched");
                gl.bindVertexArray(null);
                this.lastDrawn += ents.length;
                this.lastAssetsUsed++;
                ENTITY_PERF.stats.drewNonRigged += ents.length;   // round 313
                profEnd("entities.batched");
            }
        }

        // Round 62 — animator GC removed from the hot render path.
        // Previous behavior deleted any animator whose entity wasn't drawn
        // this frame, which incorrectly killed animators for entities
        // that were merely offscreen (frustum-culled) for one frame. It
        // also created a race where setClip() called immediately after
        // spawn() saw no animator because the entity hadn't been drawn
        // yet. Animators now stick around for the entity's full lifetime
        // and are explicitly removed by removeAnimator() on entity
        // despawn (wired into commandRouter's entity:despawn handler).

        if (cullWasEnabled) gl.enable(gl.CULL_FACE);

        return consumed;
    }

    // Round 50 - shadow casting. Depth-only pass into the bound shadow
    // FBO. Groups by assetId same as render(); for rigged meshes uses the
    // cached animator's LAST joint matrices (no animator.update() here -
    // depth pass runs before color pass so animator state is still from
    // the previous frame; 16ms lag invisible). For non-rigged, batch-packs
    // instances same as render() and does one drawInstanced per asset.
    // Skips entities whose mesh hasn't loaded yet (those fall through to
    // the cube renderer in main.js's shadow wiring).
    renderDepth(entities, lightVP) {
        const gl = this.gl;
        if (!entities || entities.length === 0) return;
        // Group by assetId
        const groups = new Map();
        for (const e of entities) {
            if (!e.assetId) continue;
            const g = groups.get(e.assetId);
            if (g) g.push(e);
            else groups.set(e.assetId, [e]);
        }
        if (groups.size === 0) return;

        gl.useProgram(this.depthProgram);
        gl.uniformMatrix4fv(this.uLightVP_depth, false, lightVP);
        const nowSec = performance.now() * 0.001;
        if (this.uTime_depth) gl.uniform1f(this.uTime_depth, nowSec);
        const cullWasEnabled = gl.isEnabled(gl.CULL_FACE);
        if (cullWasEnabled) gl.disable(gl.CULL_FACE);

        for (const [assetId, ents] of groups) {
            const mesh = this.loader.cache.get(assetId);
            if (mesh === undefined) continue;       // not yet loaded
            if (mesh === null) continue;            // permanently failed
            const entry = this._getOrCreateAssetVAO(assetId, mesh);
            this._ensureInstanceCapacity(assetId, entry, ents.length);
            const buf = this._instanceBuffers.get(assetId);
            const isRigged = mesh.isRigged && mesh.skin && mesh.animations?.length > 0;

            if (isRigged) {
                gl.uniform1i(this.uHasSkin_depth, 1);
                gl.bindVertexArray(entry.vao);
                for (const e of ents) {
                    const kind  = e.kind || "other";
                    const baseScale = (e.scale != null) ? e.scale : scaleFor(kind);
                    const sx = (e.scaleX != null) ? e.scaleX : baseScale;
                    const sy = (e.scaleY != null) ? e.scaleY : baseScale;
                    const sz = (e.scaleZ != null) ? e.scaleZ : baseScale;
                    buf[0] = e.x;
                    buf[1] = e.y + sy * 0.5;
                    buf[2] = e.z;
                    buf[3] = sx; buf[4] = sy; buf[5] = sz;
                    // Color slots unused by depth FS but keep slots 6-8 packed
                    // so the stride math doesn't break.
                    buf[6] = 0; buf[7] = 0; buf[8] = 0;
                    buf[9]  = e.yaw   ?? 0;
                    buf[10] = e.tiltX ?? 0;
                    buf[11] = 0;     // skinned: anim is the skin, no procedural
                    buf[12] = e.tiltZ ?? 0;     // round 81 — roll
                    gl.bindBuffer(gl.ARRAY_BUFFER, entry.instanceBuf);
                    // Round 319 — orphan (rigged depth pass).
                    gl.bufferData(gl.ARRAY_BUFFER, entry.capacity * INSTANCE_BYTES, gl.STREAM_DRAW);
                    gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf.subarray(0, INSTANCE_FLOATS));

                    // Reuse the animator's CURRENT joint matrices. The color
                    // pass will call animator.update() later this frame and
                    // overwrite for the next frame's depth pass. First frame
                    // before any update: identity matrices (rest pose).
                    const animator = this._animators.get(e.id);
                    if (animator?.jointMatrices) {
                        gl.uniformMatrix4fv(this.uJointMatrices_depth, false, animator.jointMatrices);
                    }
                    this._drawInstanced(mesh, mesh.indexCount, 1, !!mesh.ibo);
                    // v837 — limb pass for the depth/shadow buffer.
                    // Severed limb casts a shadow at its physics position.
                    if (animator?.computeLimbJointMatrices && animator.detachedBones?.size > 0) {
                        const limbMats = animator.computeLimbJointMatrices();
                        if (limbMats) {
                            gl.uniformMatrix4fv(this.uJointMatrices_depth, false, limbMats);
                            this._drawInstanced(mesh, mesh.indexCount, 1, !!mesh.ibo);
                        }
                    }
                    // Round 185 — error capture (rigged shadow path)
                    this._recordGLError(assetId, mesh, entry, [e], "depth-rigged-1x");
                }
                gl.bindVertexArray(null);
            } else {
                // Non-rigged batched path - one upload + one draw per asset.
                gl.uniform1i(this.uHasSkin_depth, 0);
                let off = 0;
                for (const e of ents) {
                    const kind  = e.kind || "other";
                    const baseScale = (e.scale != null) ? e.scale : scaleFor(kind);
                    const sx = (e.scaleX != null) ? e.scaleX : baseScale;
                    const sy = (e.scaleY != null) ? e.scaleY : baseScale;
                    const sz = (e.scaleZ != null) ? e.scaleZ : baseScale;
                    buf[off + 0] = e.x;
                    buf[off + 1] = e.y + sy * 0.5;
                    buf[off + 2] = e.z;
                    buf[off + 3] = sx;
                    buf[off + 4] = sy;
                    buf[off + 5] = sz;
                    buf[off + 6] = 0; buf[off + 7] = 0; buf[off + 8] = 0;
                    buf[off + 9]  = e.yaw   ?? 0;
                    buf[off + 10] = e.tiltX ?? 0;
                    buf[off + 11] = animFor(kind);
                    buf[off + 12] = e.tiltZ ?? 0;     // round 81 — roll
                    off += INSTANCE_FLOATS;
                }
                gl.bindBuffer(gl.ARRAY_BUFFER, entry.instanceBuf);
                // Round 319 — buffer orphan (same reasoning as
                // batched color path above). Depth pass uses the
                // SAME instance buffer as the color pass (entry.
                // instanceBuf is shared), so orphaning here is also
                // critical for back-to-back depth+color upload to
                // not sync-stall.
                gl.bufferData(gl.ARRAY_BUFFER, entry.capacity * INSTANCE_BYTES, gl.STREAM_DRAW);
                gl.bufferSubData(
                    gl.ARRAY_BUFFER, 0,
                    buf.subarray(0, ents.length * INSTANCE_FLOATS)
                );
                gl.bindVertexArray(entry.vao);
                this._drawInstanced(mesh, mesh.indexCount, ents.length, !!mesh.ibo);
                // Round 185 — error capture (batched shadow path)
                this._recordGLError(assetId, mesh, entry, ents, "depth-batched");
                gl.bindVertexArray(null);
            }
        }

        if (cullWasEnabled) gl.enable(gl.CULL_FACE);
    }

    // Round 19 stage 3 — get-or-create per-instance animator with a
    // random initial time offset. Random phase per entity ensures
    // multiple instances of the same rigged mesh visibly desync.
    _getOrCreateInstanceAnimator(entityId, mesh) {
        let animator = this._animators.get(entityId);
        if (!animator) {
            animator = new SkeletalAnimator(mesh);
            const clip = animator.animations[0];
            if (clip && clip.duration > 0) {
                animator.timeSeconds = Math.random() * clip.duration;
            }
            // Round 53 - wire animation events to the global bus.
            // Animator passes (eventName, ctx); we add entityId so
            // subscribers can locate the source entity for VFX/audio.
            // Bus is optional — events silently no-op if it's not
            // installed yet.
            animator.onEvent = (eventName, ctx) => {
                const bus = window.animEvents;
                if (!bus) return;
                bus.emit(eventName, { entityId, ...ctx });
            };
            this._animators.set(entityId, animator);
        }
        return animator;
    }

    // Round 62 — public hook for the command router. After entity:spawnMesh
    // creates a rigged entity, the router calls this so the animator exists
    // BEFORE the first render frame. Without this, anim.setClip() called
    // immediately after anim.spawn() races the draw loop and fails with
    // "no animator for entity N" — which is exactly the symptom we hit on
    // RobotExpressive. Returns the animator (or null if asset is missing /
    // not rigged / still loading; renderer's draw path will retry on the
    // first frame the asset is available).
    ensureAnimator(entityId, assetId) {
        const mesh = this.loader?.cache?.get(assetId);
        if (!mesh) return null;                  // not loaded yet
        if (!mesh.isRigged || !mesh.skin)        // static mesh, no rig
            return null;
        if (!mesh.animations?.length)             // skin but no clips
            return null;
        return this._getOrCreateInstanceAnimator(entityId, mesh);
    }

    // Round 62 — wired into entity:despawn so an entity's animator goes
    // away with the entity instead of waiting for the next render frame
    // (which never comes if the entity died offscreen).
    removeAnimator(entityId) {
        return this._animators.delete(entityId);
    }

    snapshot() {
        return {
            assets: this.assetVAOs.size,
            drawn: this.lastDrawn,
            used: this.lastAssetsUsed,
        };
    }
}
