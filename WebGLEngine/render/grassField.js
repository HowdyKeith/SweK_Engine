// FILE: render/grassField.js
// VERSION: v4172 -- the GLSL half of the grass port, graded against render/grassModel.mjs.
//
// Ported from boona13/threejs-grass-water-shaders (MIT). Shaped like render/swiftShaderPass.js: the shader
// SOURCE lives here, the arithmetic is mirrored on the CPU next door, and the gate compares them.
//
// *** ESM, DELIBERATELY, AND THE REASON IS ONE ROUND OLD. *** v4169 found swiftShaderPass.js and
// holoFoilShader.js both ending in `module.exports` -- a ReferenceError in a browser ES module -- so fourteen
// shader ports and a three.js material patch could be loaded by exactly one thing: their own gates, through
// Node's createRequire. Every check passed while the code could not ship. This file is `export` from the
// start and its gate imports it the way a page would.
//
// *** AND IT DOES NOT IMPORT THREE. *** The material factory takes THREE as an argument. That keeps the
// module loadable and gradeable in Node with no renderer, which is the only environment the gate has -- and
// it is the same reason holoFoilShader patches a material passed IN rather than constructing one.
//
// THE WATER HALF OF THE UPSTREAM REPO IS NOT PORTED: shaders/waterReflectRefract.frag.glsl already exists.
"use strict";

const WIND_LATTICE_GLSL = `
float windHash(uvec2 p) {
  uint y = p.y;
  uint h = y + (y << 10u);
  h ^= h >> 6u;
  h += h << 3u;
  h ^= h >> 11u;
  uint x = p.x;
  h = ((x * 1664525u) + (h + (h << 15u)) + 1013904223u) * 1664525u;
  h ^= h >> 11u;
  h ^= (h << 7u) & 2636928640u;
  h ^= (h << 15u) & 4022730752u;
  h ^= h >> 18u;
  return uintBitsToFloat((h & 8388607u) | 1065353216u) - 1.0;
}

float windNoise(vec2 worldXZ, float uTime) {
  vec2 uv = worldXZ * 0.1 + vec2(uTime * 1.2, 0.0);
  ivec2 i = ivec2(floor(uv));
  vec2 f = fract(uv);
  vec2 s = f * f * (3.0 - 2.0 * f);
  float n00 = windHash(uvec2(i));
  float n10 = windHash(uvec2(i + ivec2(1, 0)));
  float n01 = windHash(uvec2(i + ivec2(0, 1)));
  float n11 = windHash(uvec2(i + ivec2(1)));
  return mix(mix(n00, n10, s.x), mix(n01, n11, s.x), s.y);
}`;

const GRASS_VERTEX = `
  precision highp float;
  precision highp int;

  #include <common>
  #include <shadowmap_pars_vertex>

  ${WIND_LATTICE_GLSL}

  uniform float time;
  uniform float windSpeed;
  uniform float windStrength;
  uniform float gustStrength;
  uniform float bendStrength;
  uniform float growthDuration;
  uniform vec2  pushCenter;
  uniform float pushRadius;
  uniform float pushStrength;
  uniform float pushEnabled;

  uniform sampler2D uTerrainHeightmap;
  // x = worldSize, y = 1.0 / resolution (texel size for finite-difference slope)
  uniform vec2 uTerrainParams;

  in float birthTime;

  out vec3  vWorldNormal;
  out vec3  vBladeColor;
  out float vGradient;
  out vec3  vWorldPos;

  void main() {
    vec3 transformed   = position;
    vec3 objectNormal  = vec3(normal);
    float gradient     = uv.y;
    float tipWeight    = gradient * gradient;
    vec3 instanceOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;

    float viewDist        = length(cameraPosition - instanceOrigin);
    float distWidthBoost  = 1.0 + smoothstep(8.0, 24.0, viewDist) * 1.5;
    float windDamping     = 1.0 - smoothstep(12.0, 24.0, viewDist) * 0.55;

    // Sample terrain height at blade root (UV = (xz / worldSize) + 0.5)
    vec2 terrainUV = instanceOrigin.xz / uTerrainParams.x + 0.5;
    float terrainH = texture(uTerrainHeightmap, terrainUV).r;

    // Slope from 2 forward-neighbour samples (cheap finite difference)
    float ts        = uTerrainParams.y;
    float worldStep = uTerrainParams.x * ts;
    float hR        = texture(uTerrainHeightmap, terrainUV + vec2(ts,  0.0)).r;
    float hU        = texture(uTerrainHeightmap, terrainUV + vec2(0.0, ts )).r;
    float slopeMag  = length(vec2(hR - terrainH, hU - terrainH)) / max(worldStep, 1e-5);

    // Cull blades on rocky slopes — no grass on cliffs.
    if (slopeMag > 0.65) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    // Stochastic thinning across the slope shoulder for a soft transition.
    float slopeSuppress = smoothstep(0.28, 0.65, slopeMag);
    float bladeHash     = fract(sin(dot(instanceOrigin.xz, vec2(127.1, 311.7))) * 43758.545);
    if (bladeHash < slopeSuppress) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    // Grow-in animation (smoothstep over growthDuration seconds since birthTime)
    float growth = clamp((time - birthTime) / max(growthDuration, 1e-4), 0.0, 1.0);
    growth       = growth * growth * (3.0 - 2.0 * growth);

    // Two-octave wind sway (one slow, one gust) plus a bend term that arcs the blade.
    float windA = sin(windNoise(instanceOrigin.xz, time * windSpeed) * 3.14159 - 1.5708 + 0.3)
                * 0.0735 * windStrength;
    float windB = sin(windNoise(instanceOrigin.xz + vec2(13.7, -9.1), time * (windSpeed * 0.73 + 0.21)) * 3.14159 - 1.5708 + 0.3)
                * 0.0735 * gustStrength;
    float sway  = (windA + windB) * windDamping;
    float bend  = bendStrength
                * (0.65 + windNoise(instanceOrigin.xz + vec2(-4.3, 7.1), time * (windSpeed * 0.41 + 0.13)) * 0.7)
                * windDamping;

    // Push field — used for footsteps / animals brushing through grass.
    vec2  pushOffset  = vec2(0.0);
    float pushFlatten = 0.0;
    if (pushEnabled > 0.5 && pushRadius > 1e-4) {
      vec2 away = instanceOrigin.xz - pushCenter;
      float distSq = dot(away, away);
      float radiusSq = pushRadius * pushRadius;
      if (distSq < radiusSq) {
        float dist = sqrt(max(distSq, 1e-8));
        vec2  pushDir = dist > 1e-4 ? away / dist : vec2(0.0, 1.0);
        float field   = 1.0 - smoothstep(0.0, pushRadius, dist);
        field        *= field;
        pushOffset    = pushDir * (pushStrength * field * tipWeight);
        pushFlatten   = field * tipWeight;
      }
    }

    float widthGrowth = mix(0.24, 1.0, growth);
    transformed.x *= mix(1.0, 0.42, gradient * 0.88);
    transformed.x *= widthGrowth * distWidthBoost;
    transformed.y *= growth * (1.0 - pushFlatten * 0.22);
    transformed.z *= growth;
    transformed.x += sway * tipWeight + pushOffset.x;
    transformed.z += (bend + sway * 0.9) * tipWeight + pushOffset.y;

    vec3 transformedNormal = objectNormal;
    mat3 im = mat3(instanceMatrix);
    transformedNormal /= vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
    transformedNormal  = normalize(normalMatrix * (im * transformedNormal));

    vWorldNormal = normalize(inverseTransformDirection(transformedNormal, viewMatrix));
    vBladeColor  = instanceColor;
    vGradient    = gradient;
    vec3 bladeWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
    vWorldPos    = bladeWorldPos + vec3(0.0, terrainH, 0.0);

    #include <project_vertex>

    // Lift the projected position by terrain height in view space.
    vec4 terrainLift = projectionMatrix * (viewMatrix * vec4(0.0, terrainH, 0.0, 0.0));
    gl_Position += terrainLift;

    #include <worldpos_vertex>
    #include <shadowmap_vertex>
  }`;

const GRASS_FRAGMENT = `
  precision highp float;

  #include <common>
  #include <packing>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>
  #include <shadowmask_pars_fragment>

  uniform float tipLift;
  uniform vec3  uSunDir;
  uniform vec3  uSunColor;
  uniform vec3  uAmbientColor;
  uniform vec3  uFillDir;
  uniform vec3  uFillColor;

  in vec3  vWorldNormal;
  in vec3  vBladeColor;
  in float vGradient;
  in vec3  vWorldPos;
  out vec4 fragColor;

  void main() {
    float normalLen = length(vWorldNormal);
    if (normalLen <= 1e-6) discard;

    vec3 normal  = vWorldNormal / normalLen;
    vec3 sunDir  = normalize(uSunDir);
    vec3 fillDir = normalize(uFillDir);

    float sun  = max(0.0, dot(normal, sunDir));
    float hemi = 0.5 + 0.5 * normal.y;
    float fill = max(0.0, dot(normal, fillDir));

    float tip      = smoothstep(0.0, 1.0, vGradient);
    vec3 tipColor  = min(vec3(1.0), vBladeColor + vec3(tipLift, tipLift * 0.9, tipLift * 0.28));
    vec3 color     = mix(vBladeColor * 0.78, tipColor, tip);

    vec3 lighting = uAmbientColor * mix(0.82, 1.18, hemi)
                  + uSunColor * sun
                  + uFillColor * fill;
    color *= lighting;

    #if NUM_DIR_LIGHT_SHADOWS > 0
      DirectionalLightShadow dls = directionalLightShadows[0];
      float grassShadow = getShadow(directionalShadowMap[0], dls.shadowMapSize, dls.shadowIntensity,
                                    dls.shadowBias, dls.shadowRadius, vDirectionalShadowCoord[0]);
      color *= mix(0.5, 1.0, grassShadow);
    #endif

    color = pow(max(color, vec3(0.0)), vec3(0.92));
    fragColor = vec4(color, 1.0);
  }`;

/** The uniforms the pair declares, with the upstream defaults. Named here so a caller need not read GLSL. */
const GRASS_UNIFORM_DEFAULTS = Object.freeze({
    time: 0, windSpeed: 1, windStrength: 1, gustStrength: 1, bendStrength: 0.3, growthDuration: 1,
    pushCenter: [0, 0], pushRadius: 0, pushStrength: 0, pushEnabled: 0,
    tipLift: 0.25,
});

/** The two slope constants, exported because grassModel.mjs asserts the SAME numbers rather than retyping them. */
const SLOPE_CULL = 0.65;        // above this, no blade is drawn at all
const SLOPE_SHOULDER = 0.28;    // below this, no thinning; between the two, a weighted per-blade coin

/**
 * Build the grass ShaderMaterial. THREE is passed in rather than imported -- see the header.
 * @param {*} THREE the three.js namespace
 * @param {object} [uniforms] overrides on GRASS_UNIFORM_DEFAULTS
 */
function makeGrassMaterial(THREE, uniforms = {}) {
    if (!THREE || !THREE.ShaderMaterial) throw new Error("makeGrassMaterial: pass the three.js namespace");
    const u = { ...GRASS_UNIFORM_DEFAULTS, ...uniforms };
    const wrap = {};
    for (const [k, v] of Object.entries(u)) wrap[k] = { value: Array.isArray(v) ? new THREE.Vector2(v[0], v[1]) : v };
    wrap.uTerrainHeightmap = { value: uniforms.uTerrainHeightmap || null };
    wrap.uTerrainParams = { value: new THREE.Vector2(uniforms.worldSize || 100, 1 / (uniforms.resolution || 256)) };
    for (const k of ["uSunDir", "uSunColor", "uAmbientColor", "uFillDir", "uFillColor"]) {
        wrap[k] = { value: uniforms[k] || new THREE.Vector3(1, 1, 1) };
    }
    return new THREE.ShaderMaterial({
        vertexShader: GRASS_VERTEX, fragmentShader: GRASS_FRAGMENT,
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights, wrap]),
        lights: true, glslVersion: THREE.GLSL3, side: THREE.DoubleSide,
    });
}

export { WIND_LATTICE_GLSL, GRASS_VERTEX, GRASS_FRAGMENT, GRASS_UNIFORM_DEFAULTS,
         SLOPE_CULL, SLOPE_SHOULDER, makeGrassMaterial };
