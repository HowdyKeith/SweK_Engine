// FILE: render/voxelrenderer.js
// VERSION: v41 - PALETTE INDEXED BY VOXEL ID (was off-by-one, terrain rendered grey)
import { Frustum } from "./frustum.js";   // round 43p
import { getMaterialRegistry } from "../engine/MaterialRegistry.js";   // v398
import { meshChunkMC, isMcSolidId } from "../world/chunkMarchingCubes.js";   // v434 — smooth terrain
//
// v41 fix: PALETTE was indexed by position [1..3] with comments saying
// "dirt, grass, stone" but the world's VOXEL ids are STONE=1, DIRT=2,
// GRASS=3 (see world/voxelFormat.js). The visible top layer of terrain
// (GRASS=3) was therefore being coloured with PALETTE[3] which was the
// stone-grey value — so the entire viewable terrain came out grey.
// Also added entries for SAND(4), WATER(10), FLOWING_WATER(11), LAVA(12)
// so editor-placed voxels of those types stop falling through to the
// white-ish [1,1,1] default.

const PALETTE = (() => {
    const p = [];
    p[1]  = [0.65, 0.65, 0.70];   // STONE — grey
    p[2]  = [0.60, 0.50, 0.30];   // DIRT — brown
    p[3]  = [0.30, 0.80, 0.30];   // GRASS — green
    p[4]  = [0.92, 0.85, 0.55];   // SAND — pale yellow
    p[5]  = [0.95, 0.97, 1.00];   // SNOW — bright white-blue (round 29; blooms)
    p[6]  = [0.22, 0.18, 0.16];   // ASH — warm dark gray (round 29)
    // Round 251 — destruction rubble: darker, cooler gray-brown than dirt
    // so destroyed walls visually distinguish from natural terrain.
    p[7]  = [0.38, 0.32, 0.28];   // RUBBLE — muted dark brown-gray
    p[10] = [0.20, 0.45, 0.85];   // WATER — blue (rendered separately by WaterRenderer when skipWater=true)
    p[11] = [0.25, 0.55, 0.95];   // FLOWING_WATER — lighter blue
    p[12] = [0.95, 0.40, 0.10];   // LAVA — orange
    p[20] = [0.10, 0.10, 0.15];   // SCREEN — near-black (TV-wall placeholders)
    p[30] = [0.20, 0.95, 0.95];   // MEMORY — bright cyan (AI memory cluster obelisk)
    return p;
})();

export class VoxelRenderer {

    constructor(gl, canvas) {

        this.gl = gl;
        this.canvas = canvas;

        this.program = null;
        this.uViewProj = null;

        this.meshes = new Map();

        // When true, water voxels are excluded from greedy meshes so
        // WaterRenderer can draw them with waves + transparency. main.js
        // sets this true after constructing a WaterRenderer; otherwise
        // water renders as opaque blocks (legacy behaviour).
        this.skipWater = false;

        this.init();
    }

    init() {

        const gl = this.gl;

        const vs = `#version 300 es
        layout(location=0) in vec3 aPos;
        layout(location=1) in vec3 aColor;
        layout(location=2) in float aAO;     // round 43j - per-vertex corner AO 0..1

        uniform mat4 uViewProj;

        out vec3 vColor;
        out vec3 vWorld;
        out float vAO;

        void main() {
            vColor = aColor;
            vWorld = aPos;
            vAO    = aAO;
            gl_Position = uViewProj * vec4(aPos, 1.0);
        }`;

        // v45 — atmospheric upgrade. Adds:
        //   * Half-Lambert diffuse from sun direction (face normal via
        //     dFdx/dFdy — flat shading, no normal attribute needed)
        //   * Distance fog blending toward horizon color, so distant
        //     terrain fades into sky (matches SkyRenderer horizon)
        //   * Emissive lift on saturated colors — lava & memory's
        //     near-1.0 channels skip lighting attenuation, reading as
        //     glowing
        const fs = `#version 300 es
        precision highp float;

        in vec3 vColor;
        in vec3 vWorld;
        in float vAO;            // round 43j - 0=dark corner, 1=open

        uniform vec3 uCamPos;
        uniform vec3 uSunDir;
        uniform vec3 uFogColor;
        uniform float uFogNear;
        uniform float uFogFar;
        uniform float uTime;          // round 34 — for animated water ripples
        uniform float uEmissiveBoost;  // v492 — lava/memory glow strength (default 2.5)
        uniform vec4 uCloudShadow;     // v1278 — x=on, y=coverage, z=scale, w=darken
        // cheap value-noise fbm for drifting cloud shadows (cs_ prefix avoids clashes)
        float cs_hash(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
        float cs_vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
            float a=cs_hash(i), b=cs_hash(i+vec2(1.0,0.0)), c=cs_hash(i+vec2(0.0,1.0)), d=cs_hash(i+vec2(1.0,1.0));
            return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
        float cs_fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*cs_vnoise(p); p*=2.02; a*=0.5; } return v; }

        // Round 48 — dynamic point lights (projectiles, explosions).
        // Up to 8 active. uLightCount = how many of the array slots
        // are valid. uLightPos[i].xyz = world position; uLightCol[i].rgb
        // = color (HDR-ish, can exceed 1.0); uLightRange[i] = radius.
        const int MAX_LIGHTS = 8;
        uniform int uLightCount;
        uniform vec3 uLightPos[MAX_LIGHTS];
        uniform vec3 uLightCol[MAX_LIGHTS];
        uniform float uLightRange[MAX_LIGHTS];

        // Round 43k - directional sun shadow map. uShadowEnabled is 0/1.
        // When enabled, project the fragment into shadow-space and
        // compare its depth against the depth texture; if blocked,
        // multiply diffuse contribution by 1 - uShadowDarken.
        uniform int       uShadowEnabled;
        uniform mat4      uShadowVP;
        uniform sampler2D uShadowMap;
        uniform float     uShadowDarken;
        uniform float     uShadowBias;

        // Round 302 — CSM cascades. uShadowCascadeCount > 1 enables
        // cascade sampling; the per-cascade VPs + maps cover successive
        // view-space Z slices defined by uSplitDistances. View-space Z
        // = dot(vWorld - uCamPos, uCamForward) — see selectCascade.
        // When uShadowCascadeCount == 1, uShadowMap/uShadowVP are used
        // and the cascade uniforms are ignored (backward compat).
        uniform int       uShadowCascadeCount;       // 0=off, 1=single, 2..3=CSM
        uniform vec3      uCamForward;
        uniform vec4      uSplitDistances;           // x..z = cascade end view-Z; w unused
        uniform mat4      uLightVPCascade0;
        uniform mat4      uLightVPCascade1;
        uniform mat4      uLightVPCascade2;
        uniform sampler2D uShadowMapCascade0;
        uniform sampler2D uShadowMapCascade1;
        uniform sampler2D uShadowMapCascade2;

        // v414 — opt-in per-voxel detail texture (triplanar). uDetailMix==0
        // (the default) makes the sample a no-op so the render path is
        // byte-for-byte identical to before. >0 blends a tiling detail
        // texture onto the lit voxel surface using the existing per-voxel
        // triplanar uv (round 43i), giving voxels real surface texture
        // instead of flat color.
        uniform highp sampler2DArray uDetailArray; // v426 Tier B: true array texture
        // v2832 -- PARALLAX OCCLUSION on voxel faces. 0 disables the whole thing, which is the default: this
        // rides ON TOP of the existing detail layer and must not change a single pixel until asked for.
        uniform float uParallaxScale;   // surface depth in world units; 0 = off
        uniform int   uParallaxLayers;  // steep-search step count
        uniform float     uDetailMix;     // 0 = off
        uniform float     uDetailScale;   // tiling frequency

        out vec4 outColor;

        
        // v2832 -- steep parallax + one interpolation step, the same algorithm render/parallaxOcclusion.js
        // gates against a 4000-layer reference. HEIGHT COMES FROM THE DETAIL TEXTURE'S OWN LUMINANCE rather than
        // a new per-material heightmap asset: a dark grain reads as a groove, which is what those textures
        // already depict. That is an approximation and is stated as one -- a dedicated height channel would be
        // better, but inventing an asset pipeline to prove the shader works would be the wrong order.
        float swekHeightAt(vec2 uvw, float layer) {
            vec3 c = texture(uDetailArray, vec3(fract(uvw), layer)).rgb;
            return dot(c, vec3(0.299, 0.587, 0.114));      // luminance; 1 = high, 0 = groove
        }

        // THE TANGENT BASIS IS EXACT HERE AND NEEDS NO ATTRIBUTE, which is what makes this feasible without
        // touching the mesher: a voxel face is AXIS-ALIGNED, so the same dominant-axis choice that picks the
        // triplanar uv also names its two tangent directions. On a general mesh this would need a tangent
        // attribute and a mesh format change.
        vec2 swekParallax(vec2 uvw, vec3 N, vec3 viewW, float layer) {
            if (uParallaxScale <= 0.0) return uvw;
            vec3 aN = abs(N);
            vec3 T, B;
            if (aN.y > aN.x && aN.y > aN.z)      { T = vec3(1.0, 0.0, 0.0); B = vec3(0.0, 0.0, 1.0); }  // uv = xz
            else if (aN.x > aN.z)                { T = vec3(0.0, 1.0, 0.0); B = vec3(0.0, 0.0, 1.0); }  // uv = yz
            else                                 { T = vec3(1.0, 0.0, 0.0); B = vec3(0.0, 1.0, 0.0); }  // uv = xy
            vec3 vt = normalize(vec3(dot(viewW, T), dot(viewW, B), abs(dot(viewW, N))));
            if (vt.z < 0.05) return uvw;                 // grazing: the march degenerates, so leave it alone
            int layers = uParallaxLayers < 4 ? 4 : (uParallaxLayers > 64 ? 64 : uParallaxLayers);
            float stepH = 1.0 / float(layers);
            vec2 delta = (vt.xy / vt.z) * uParallaxScale * stepH;
            float curH = 1.0, prevH = 1.0;
            vec2 cur = uvw, prev = uvw;
            float sampled = swekHeightAt(cur, layer);
            for (int i = 0; i < 64; i++) {
                if (i >= layers || sampled >= curH) break;
                prev = cur; prevH = curH;
                cur -= delta; curH -= stepH;
                sampled = swekHeightAt(cur, layer);
            }
            // one linear interpolation between the last two steps -- the difference between a stair-stepped
            // surface and a smooth one, for the cost of a single mix
            float after = sampled - curH;
            float before = swekHeightAt(prev, layer) - prevH;
            float w = after / max(1e-5, after - before);
            return mix(cur, prev, clamp(w, 0.0, 1.0));
        }

void main() {
            vec3 ddx = dFdx(vWorld);
            vec3 ddy = dFdy(vWorld);
            vec3 N = normalize(cross(ddx, ddy));

            // Round 34 — water detection by color signature. Water voxels
            // are reasonably distinctive blue ([0.20, 0.45, 0.85]). When
            // matched, take the water shader path: animated ripples + sun
            // glint + sky reflection.
            bool isWater = (vColor.b > 0.7 && vColor.r < 0.35 && vColor.g < 0.55);

            // Round 33 — procedural surface texture (skipped on water + emissive)
            float maxC = max(vColor.r, max(vColor.g, vColor.b));
            float emissive = smoothstep(0.85, 0.95, maxC);
            vec3 baseColor;
            vec3 lit;
            if (isWater) {
                // Round 37 — semi-transparent water via dither discard.
                // Discards a 4x4 Bayer-pattern subset of fragments so the
                // underwater scene (seafloor, sub, torpedoes) is visible
                // through gaps. Cheap; no blending or sorting required.
                // 8 of 16 cells discarded → 50% see-through.
                vec2 fc = floor(gl_FragCoord.xy);
                float bx = mod(fc.x, 4.0);
                float by = mod(fc.y, 4.0);
                int bi = int(bx) + int(by) * 4;
                // 4x4 Bayer threshold matrix (normalized 0-15)
                int thresh = 0;
                if (bi == 0)  thresh = 0;  if (bi == 1)  thresh = 8;
                if (bi == 2)  thresh = 2;  if (bi == 3)  thresh = 10;
                if (bi == 4)  thresh = 12; if (bi == 5)  thresh = 4;
                if (bi == 6)  thresh = 14; if (bi == 7)  thresh = 6;
                if (bi == 8)  thresh = 3;  if (bi == 9)  thresh = 11;
                if (bi == 10) thresh = 1;  if (bi == 11) thresh = 9;
                if (bi == 12) thresh = 15; if (bi == 13) thresh = 7;
                if (bi == 14) thresh = 13; if (bi == 15) thresh = 5;
                if (thresh < 8) discard;     // ~half of fragments removed
                // Animated ripple — perturb normal in XZ via two sin waves
                float wA = sin(vWorld.x * 0.7 + uTime * 1.5);
                float wB = cos(vWorld.z * 0.6 + uTime * 1.2);
                float wC = sin((vWorld.x + vWorld.z) * 0.4 + uTime * 0.9);
                vec3 N2 = normalize(N + vec3(wA * 0.05, 0.0, wB * 0.05) + vec3(0.0, wC * 0.02, 0.0));
                float ndlW = dot(N2, uSunDir);
                float diffW = mix(0.55, 1.05, ndlW * 0.5 + 0.5);
                // Sun glint specular (sharp)
                vec3 viewDir = normalize(uCamPos - vWorld);
                vec3 halfVec = normalize(uSunDir + viewDir);
                float specDot = max(0.0, dot(N2, halfVec));
                float spec = pow(specDot, 96.0) * 1.2;
                // Sky reflection — slight horizon-color contribution
                vec3 reflDir = reflect(-viewDir, N2);
                float skyT = clamp(reflDir.y, 0.0, 1.0);
                vec3 skyCol = mix(uFogColor, vec3(0.45, 0.62, 0.85), skyT);
                lit = vColor * diffW + vec3(spec) + skyCol * 0.20;
            } else {
                // ============================================================
                // Round 43i - per-voxel-type procedural surface detail.
                // Voxel kind is classified by color signature; each kind gets
                // its own texture pattern + frequency + specular response.
                // Triplanar-style: detail frequency is keyed to the dominant
                // face normal so grain follows the surface orientation.
                // ============================================================

                // Color-signature classification (no extra uniforms needed)
                bool isSnow  = (vColor.r > 0.85 && vColor.g > 0.85 && vColor.b > 0.85);
                bool isStone = (!isSnow && abs(vColor.r - vColor.g) < 0.06
                                && abs(vColor.g - vColor.b) < 0.06 && maxC < 0.75);
                bool isSand  = (vColor.r > 0.72 && vColor.g > 0.60 && vColor.b < 0.55 && !isStone);
                bool isGrass = (vColor.g > 0.45 && vColor.r < 0.55 && vColor.b < 0.45);
                bool isDirt  = (vColor.r > 0.32 && vColor.r < 0.65 && vColor.g > 0.20
                                && vColor.g < 0.50 && vColor.b < 0.40 && !isGrass && !isSand);
                bool isLava  = (vColor.r > 0.80 && vColor.g < 0.55 && vColor.b < 0.25);

                // Pick 2D sample coords by dominant face axis (triplanar lite).
                // For a top/bottom face (|N.y|>0.7) use xz; for a +x/-x face
                // use yz; otherwise xy. Keeps detail oriented to the surface.
                vec2 uv;
                vec3 aN = abs(N);
                if (aN.y > aN.x && aN.y > aN.z)      uv = vWorld.xz;
                else if (aN.x > aN.z)                uv = vWorld.yz;
                else                                 uv = vWorld.xy;

                // Hashed pseudo-noise — same trick as before, used 3x at
                // different scales for 3-octave FBM-style variation.
                vec2 h1p = floor(uv * 8.0);
                vec2 h2p = floor(uv * 2.5);
                vec2 h3p = floor(uv * 0.7);
                float h1 = fract(sin(dot(h1p, vec2(12.9898, 78.233))) * 43758.5453);
                float h2 = fract(sin(dot(h2p, vec2(45.7321, 91.117))) * 31415.9265);
                float h3 = fract(sin(dot(h3p, vec2(28.4421, 63.873))) * 18723.1837);

                // Default modulation - mild, used as a fallback
                float surfTex = 0.85 + h1 * 0.10 + h2 * 0.07 + h3 * 0.05;
                float voxShin = 0.0;          // 0 = matte default

                if (isStone) {
                    // Stone: subtle high-freq speckle + lower-freq blotches.
                    // Plus a "crack" near grid lines for face-edge interest.
                    vec2 cell = fract(uv) - 0.5;
                    float crackD = min(abs(cell.x), abs(cell.y));
                    float crackMask = smoothstep(0.0, 0.04, crackD);   // 1 away from line, 0 on line
                    surfTex = (0.78 + h1 * 0.18 + h2 * 0.12) * mix(0.85, 1.0, crackMask);
                    voxShin = 12.0;
                } else if (isSnow) {
                    // Snow: smooth low-freq undulation + tiny sparkle.
                    surfTex = 0.92 + h2 * 0.06 + h3 * 0.04;
                    float sparkle = step(0.985, h1) * 0.35;             // rare bright pixels
                    surfTex += sparkle;
                    voxShin = 24.0;
                } else if (isSand) {
                    // Sand: high-freq grain. Very granular, no specular.
                    surfTex = 0.85 + h1 * 0.20 + h2 * 0.05;
                    voxShin = 0.0;
                } else if (isGrass) {
                    // Grass: clumped variation. Lower freq, no specular.
                    surfTex = 0.78 + h2 * 0.20 + h3 * 0.10;
                    voxShin = 0.0;
                } else if (isDirt) {
                    // Dirt: chunky, darker patches scattered.
                    float chunk = step(0.65, h2) * 0.18;
                    surfTex = (0.82 + h1 * 0.12) - chunk;
                    voxShin = 0.0;
                } else if (isLava) {
                    // Lava: animated bright veins. Use uTime for slow flow.
                    float flow = sin(uv.x * 0.3 + uv.y * 0.2 + uTime * 0.4);
                    surfTex = 0.92 + flow * 0.10 + h1 * 0.08;
                    voxShin = 0.0;       // emissive path handles glow
                }

                baseColor = mix(vColor * surfTex, vColor, emissive);

                // Round 132 — PER-VOXEL COLOR JITTER. Greedy meshing
                // merges N same-material voxels into a single quad, so
                // surface-fragment noise (surfTex) reads as continuous
                // detail across the merged span — but every voxel still
                // looks identical in BASE hue. floor(vWorld) on the
                // per-fragment world position picks out the *individual*
                // voxel cell (1u per voxel) even inside a merged face;
                // hashing that gives each voxel a stable per-cell hue
                // shift. Result: large grass/dirt/stone fields stop
                // looking like wallpaper and start reading as a mosaic
                // of individual blocks. Skipped on emissive (lava etc)
                // since uniform glow is desirable there.
                vec3 voxCell = floor(vWorld - N * 0.001);   // bias inward
                float voxHash = fract(sin(dot(voxCell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
                float voxJitter = (voxHash - 0.5) * 0.08;   // ±4%
                baseColor *= mix(1.0 + voxJitter, 1.0, emissive);

                // Half-Lambert lighting
                float ndl = dot(N, uSunDir);
                float diff = ndl * 0.5 + 0.5;
                diff = mix(0.45, 1.0, diff);
                // Round 136 — HDR emissive boost. With the scene FBO
                // promoted to RGBA16F, values >1.0 survive into the
                // bloom + tone-map stages. Lava and memory blocks now
                // output ~2.5× their base color, which:
                //   * Pushes luminance above bloom threshold (0.55)
                //     so the bloom extraction picks them up
                //   * Gives ACES tone-mapping real headroom to remap
                //     (was 1.15× = barely above 1.0, ACES had nothing
                //      to do; now 2.5× = proper HDR range)
                //   * Compounds with bloom intensity (0.70) so the
                //     glow around lava is visible from a distance
                lit = mix(baseColor * diff, baseColor * uEmissiveBoost, emissive);

                // Round 43i - Blinn-Phong specular for stone + snow only.
                // Cheap because most voxel pixels are non-glossy; the
                // branch above means non-glossy types pay nothing.
                if (voxShin > 0.5) {
                    vec3 viewDir = normalize(uCamPos - vWorld);
                    vec3 halfVec = normalize(uSunDir + viewDir);
                    float specDot = max(0.0, dot(N, halfVec));
                    float specStrength = isSnow ? 0.45 : 0.20;
                    lit += vec3(pow(specDot, voxShin) * specStrength);
                }

                // Round 43j - corner ambient occlusion. vAO is computed
                // per-vertex in the mesher (0 at corners with 2+ blocked
                // neighbors, 1 in open space). Skip on emissive surfaces
                // since glowing voxels shouldn't darken into corners.
                // Round 132 — floor lowered 0.55 → 0.42 for deeper corner
                // shadows. Combined with the anisotropic triangle flip
                // in the mesher, AO reads as pronounced contact shadow
                // rather than a vague brightness dip.
                float aoFactor = mix(0.42, 1.0, vAO);
                lit *= mix(aoFactor, 1.0, emissive);

                // v416/v426 — opt-in per-voxel-type detail texture. uv is the
                // per-voxel triplanar coordinate (round 43i). The detail
                // texture is a 2D array (Tier B); we pick the layer from the
                // same color classification computed above, so stone, grass,
                // sand, etc. each show their own surface grain. uDetailMix
                // ==0 (default) makes this whole block a no-op.
                if (uDetailMix > 0.0) {
                    float layer = 6.0;               // 6 = generic default
                    if      (isLava)  layer = 5.0;
                    else if (isSnow)  layer = 4.0;
                    else if (isSand)  layer = 3.0;
                    else if (isGrass) layer = 2.0;
                    else if (isDirt)  layer = 1.0;
                    else if (isStone) layer = 0.0;
                    // U tiles freely (REPEAT); V stays inside the tile's
                    // band with a half-texel inset so LINEAR can't bleed
                    // into the neighbouring row.
                    // v426 (Tier B): each material is its own array layer — both
                    // axes REPEAT-wrap and each layer has its own mip chain,
                    // so no atlas v-offset hack and no cross-material bleed.
                    // march the view ray through the height field before sampling colour, so a groove is
                    // occluded by the ridge in front of it instead of merely being painted darker
                    vec2 puv = swekParallax(uv * uDetailScale, N, normalize(uCamPos - vWorld), layer);
                    vec3 dtex = texture(uDetailArray, vec3(fract(puv), layer)).rgb;
                    lit = mix(lit, lit * (dtex * 2.0), uDetailMix);
                }
            }

            // Round 48 — dynamic point lights. Inverse-square falloff
            // capped at the light's range. Each light adds to the
            // unfogged "lit" color before fog mixing.
            vec3 pointLightSum = vec3(0.0);
            for (int i = 0; i < MAX_LIGHTS; i++) {
                if (i >= uLightCount) break;
                vec3 toL = uLightPos[i] - vWorld;
                float distL = length(toL);
                float range = uLightRange[i];
                if (distL < range) {
                    vec3 Ldir = toL / max(distL, 0.001);
                    float ndlL = max(0.0, dot(N, Ldir));
                    // Smooth radial falloff (1 at center, 0 at range edge)
                    float fall = 1.0 - distL / range;
                    fall = fall * fall;
                    pointLightSum += uLightCol[i] * vColor * (ndlL * 0.6 + 0.4) * fall;
                }
            }
            lit += pointLightSum;

            // Round 43k / 302 - directional sun shadow.
            // Single-cascade path: project into uShadowVP space + 9-tap PCF.
            // CSM path (uShadowCascadeCount > 1): pick cascade by view-space Z,
            // then project + 4-tap PCF for the chosen cascade. Cascades have
            // tighter coverage close to the camera (higher per-texel detail).
            if (uShadowEnabled == 1) {
                float shadowOcc = 0.0;
                bool inSomeCascade = false;
                if (uShadowCascadeCount > 1) {
                    // View-space Z = projection of (vWorld - cam) onto cam forward.
                    // splits.xyz are the END distances of cascades 0,1,2.
                    float viewZ = dot(vWorld - uCamPos, uCamForward);
                    int cIdx = 2;
                    if (viewZ < uSplitDistances.x)      cIdx = 0;
                    else if (viewZ < uSplitDistances.y) cIdx = 1;
                    // Choose VP + map for the cascade. We unroll because
                    // GLSL ES samplers can't be indexed by a non-constant.
                    mat4 cVP;
                    vec4 sc4;
                    vec3 sc;
                    // Far-cascade bias is larger (worse depth precision)
                    float biasScale = 1.0 + float(cIdx) * 0.6;
                    float bias = (uShadowBias + 0.002 * (1.0 - max(0.0, dot(N, uSunDir)))) * biasScale;
                    if (cIdx == 0) {
                        cVP = uLightVPCascade0;
                        sc4 = cVP * vec4(vWorld, 1.0);
                        sc  = sc4.xyz / sc4.w * 0.5 + 0.5;
                        if (sc.x > 0.005 && sc.x < 0.995 && sc.y > 0.005 && sc.y < 0.995 && sc.z > 0.0 && sc.z < 1.0) {
                            inSomeCascade = true;
                            vec2 texel = vec2(1.0) / vec2(textureSize(uShadowMapCascade0, 0));
                            float occ = 0.0;
                            for (int oy = -1; oy <= 1; oy++) {
                                for (int ox = -1; ox <= 1; ox++) {
                                    float d = texture(uShadowMapCascade0, sc.xy + vec2(float(ox), float(oy)) * texel).r;
                                    occ += (sc.z - bias > d) ? 1.0 : 0.0;
                                }
                            }
                            shadowOcc = occ / 9.0;
                        }
                    } else if (cIdx == 1) {
                        cVP = uLightVPCascade1;
                        sc4 = cVP * vec4(vWorld, 1.0);
                        sc  = sc4.xyz / sc4.w * 0.5 + 0.5;
                        if (sc.x > 0.005 && sc.x < 0.995 && sc.y > 0.005 && sc.y < 0.995 && sc.z > 0.0 && sc.z < 1.0) {
                            inSomeCascade = true;
                            vec2 texel = vec2(1.0) / vec2(textureSize(uShadowMapCascade1, 0));
                            float occ = 0.0;
                            for (int oy = -1; oy <= 1; oy++) {
                                for (int ox = -1; ox <= 1; ox++) {
                                    float d = texture(uShadowMapCascade1, sc.xy + vec2(float(ox), float(oy)) * texel).r;
                                    occ += (sc.z - bias > d) ? 1.0 : 0.0;
                                }
                            }
                            shadowOcc = occ / 9.0;
                        }
                    } else {
                        cVP = uLightVPCascade2;
                        sc4 = cVP * vec4(vWorld, 1.0);
                        sc  = sc4.xyz / sc4.w * 0.5 + 0.5;
                        if (sc.x > 0.005 && sc.x < 0.995 && sc.y > 0.005 && sc.y < 0.995 && sc.z > 0.0 && sc.z < 1.0) {
                            inSomeCascade = true;
                            vec2 texel = vec2(1.0) / vec2(textureSize(uShadowMapCascade2, 0));
                            float occ = 0.0;
                            for (int oy = -1; oy <= 1; oy++) {
                                for (int ox = -1; ox <= 1; ox++) {
                                    float d = texture(uShadowMapCascade2, sc.xy + vec2(float(ox), float(oy)) * texel).r;
                                    occ += (sc.z - bias > d) ? 1.0 : 0.0;
                                }
                            }
                            shadowOcc = occ / 9.0;
                        }
                    }
                } else {
                    // Single-cascade fallback (round 43k path)
                    vec4 sc4 = uShadowVP * vec4(vWorld, 1.0);
                    vec3 sc  = sc4.xyz / sc4.w * 0.5 + 0.5;
                    if (sc.x > 0.005 && sc.x < 0.995 && sc.y > 0.005 && sc.y < 0.995 && sc.z > 0.0 && sc.z < 1.0) {
                        inSomeCascade = true;
                        vec2 texel = vec2(1.0) / vec2(textureSize(uShadowMap, 0));
                        float bias = uShadowBias + 0.002 * (1.0 - max(0.0, dot(N, uSunDir)));
                        float occ = 0.0;
                        for (int oy = -1; oy <= 1; oy++) {
                            for (int ox = -1; ox <= 1; ox++) {
                                float d = texture(uShadowMap, sc.xy + vec2(float(ox), float(oy)) * texel).r;
                                occ += (sc.z - bias > d) ? 1.0 : 0.0;
                            }
                        }
                        shadowOcc = occ / 9.0;
                    }
                }
                if (inSomeCascade) {
                    float shadowFactor = mix(1.0, 1.0 - uShadowDarken, shadowOcc);
                    lit *= mix(shadowFactor, 1.0, emissive);
                }
            }

            // v1278 — CLOUD SHADOWS: drifting clouds dim the sun term. Project the
            // world point along the sun direction onto a coverage field scrolled by
            // time (wind). Inert when uCloudShadow.x == 0 (default).
            if (uCloudShadow.x > 0.5) {
                vec2 cp = (vWorld.xz + uSunDir.xz * (vWorld.y + 40.0)) * uCloudShadow.z
                        + vec2(uTime * 0.012, uTime * 0.008);
                float cov = cs_fbm(cp);
                float sh = smoothstep(uCloudShadow.y - 0.12, uCloudShadow.y + 0.06, cov);
                lit *= mix(1.0, 1.0 - uCloudShadow.w, sh);
            }

            // Round 134 — AERIAL PERSPECTIVE FOG. Three upgrades over
            // the previous linear-smoothstep fog:
            //   1. Exponential-squared falloff (1 - exp(-(d/far)^2 * k))
            //      models real atmosphere optical depth — gradual
            //      build-up near, faster transition mid-far, plateaus
            //      asymptotically rather than clamping at a hard
            //      distance band.
            //   2. Direction-aware fog color: viewDir.y picks where on
            //      the sky the distant fragment sits against. Looking
            //      up at a tall peak → fog tints toward zenith blue.
            //      Looking at the horizon → fog stays the warm
            //      horizon color (matches sky shader's gradient).
            //   3. Slightly higher max blend (0.92 vs 0.85) so the
            //      furthest terrain dissolves more cleanly into the
            //      sky instead of leaving a visible color band.
            const vec3 zenithCol = vec3(0.55, 0.72, 0.92);
            vec3 vd = normalize(vWorld - uCamPos);
            float skyDot = max(0.0, vd.y);
            vec3 fogCol = mix(uFogColor, zenithCol, smoothstep(0.0, 0.6, skyDot));
            float dist = length(vWorld - uCamPos);
            float fogD = dist / max(uFogFar, 0.001);
            float fogF = (1.0 - exp(-fogD * fogD * 2.5)) * 0.92;
            vec3 finalCol = mix(lit, fogCol, fogF);

            outColor = vec4(finalCol, 1.0);
        }`;

        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.error("[RENDERER] shader:", gl.getShaderInfoLog(s));
            }
            return s;
        };

        this.program = gl.createProgram();
        gl.attachShader(this.program, compile(gl.VERTEX_SHADER, vs));
        gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error("[RENDERER] link:", gl.getProgramInfoLog(this.program));
        }

        this.uViewProj  = gl.getUniformLocation(this.program, "uViewProj");
        this.uCamPos    = gl.getUniformLocation(this.program, "uCamPos");
        this.uSunDir    = gl.getUniformLocation(this.program, "uSunDir");
        this.uTime      = gl.getUniformLocation(this.program, "uTime");
        this.uEmissiveBoost = gl.getUniformLocation(this.program, "uEmissiveBoost");
        this.uCloudShadow = gl.getUniformLocation(this.program, "uCloudShadow");   // v1278
        this.uFogColor  = gl.getUniformLocation(this.program, "uFogColor");
        this.uFogNear   = gl.getUniformLocation(this.program, "uFogNear");
        this.uFogFar    = gl.getUniformLocation(this.program, "uFogFar");

        // v414 — opt-in per-voxel detail texture (default off).
        this.uDetailArray = gl.getUniformLocation(this.program, "uDetailArray");
        this.uDetailMix   = gl.getUniformLocation(this.program, "uDetailMix");
        this.uDetailScale = gl.getUniformLocation(this.program, "uDetailScale");
        this._detailMix   = 0.0;      // 0 = off; render path unchanged
        this._detailScale = 0.25;     // world-units → uv tiling
        // v2832 -- parallax occlusion on the detail layer. Also default OFF, and doubly so: it does nothing
        // unless the detail layer is on too, because it displaces the coordinate that layer is sampled at.
        this.uParallaxScale  = gl.getUniformLocation(this.program, "uParallaxScale");
        this.uParallaxLayers = gl.getUniformLocation(this.program, "uParallaxLayers");
        this._parallaxScale  = 0.0;   // surface depth in uv units; 0 = off
        this._parallaxLayers = 24;
        this._detailUnit  = 8;        // TEXTURE8 (3..7 used by shadows/bloom)
        this._detailTex   = this._createDefaultDetailTexture(gl);

        // Round 48 — dynamic point lights
        this.uLightCount = gl.getUniformLocation(this.program, "uLightCount");
        this.uLightPos   = gl.getUniformLocation(this.program, "uLightPos");
        this.uLightCol   = gl.getUniformLocation(this.program, "uLightCol");
        this.uLightRange = gl.getUniformLocation(this.program, "uLightRange");
        this.MAX_LIGHTS  = 8;
        this._lightCount = 0;
        this._lightPosArr   = new Float32Array(this.MAX_LIGHTS * 3);
        this._lightColArr   = new Float32Array(this.MAX_LIGHTS * 3);
        this._lightRangeArr = new Float32Array(this.MAX_LIGHTS);

        // Round 43k - shadow map uniforms (in main lit program)
        this.uShadowEnabled = gl.getUniformLocation(this.program, "uShadowEnabled");
        this.uShadowVP      = gl.getUniformLocation(this.program, "uShadowVP");
        this.uShadowMap     = gl.getUniformLocation(this.program, "uShadowMap");
        this.uShadowDarken  = gl.getUniformLocation(this.program, "uShadowDarken");
        this.uShadowBias    = gl.getUniformLocation(this.program, "uShadowBias");
        // Round 302 — CSM uniform locations
        this.uShadowCascadeCount = gl.getUniformLocation(this.program, "uShadowCascadeCount");
        this.uCamForward         = gl.getUniformLocation(this.program, "uCamForward");
        this.uSplitDistances     = gl.getUniformLocation(this.program, "uSplitDistances");
        this.uLightVPCascade0    = gl.getUniformLocation(this.program, "uLightVPCascade0");
        this.uLightVPCascade1    = gl.getUniformLocation(this.program, "uLightVPCascade1");
        this.uLightVPCascade2    = gl.getUniformLocation(this.program, "uLightVPCascade2");
        this.uShadowMapCascade0  = gl.getUniformLocation(this.program, "uShadowMapCascade0");
        this.uShadowMapCascade1  = gl.getUniformLocation(this.program, "uShadowMapCascade1");
        this.uShadowMapCascade2  = gl.getUniformLocation(this.program, "uShadowMapCascade2");
        this.shadowVP = null;       // set per frame by main.js
        this.shadowMap = null;
        this.shadowDarken = 0.55;
        this.shadowBias   = 0.001;
        // Round 302 — CSM state set per-frame by main.js. When csm is null
        // or its cascades aren't populated, falls back to single-cascade.
        this.csm = null;
        this.camForward = null;     // {x,y,z} world-space forward dir

        // Round 43k - depth-only program for shadow pass. Renders the
        // same VAOs (uses location 0 = aPos) into the shadow FBO, no
        // color writes, no FS work other than implicit depth.
        const depthVS = `#version 300 es
        layout(location=0) in vec3 aPos;
        uniform mat4 uLightVP;
        void main() {
            gl_Position = uLightVP * vec4(aPos, 1.0);
        }`;
        const depthFS = `#version 300 es
        precision highp float;
        void main() {}
        `;
        this.depthProgram = gl.createProgram();
        gl.attachShader(this.depthProgram, compile(gl.VERTEX_SHADER, depthVS));
        gl.attachShader(this.depthProgram, compile(gl.FRAGMENT_SHADER, depthFS));
        gl.linkProgram(this.depthProgram);
        if (!gl.getProgramParameter(this.depthProgram, gl.LINK_STATUS)) {
            console.error("[RENDERER] depth program link:", gl.getProgramInfoLog(this.depthProgram));
        }
        this.uLightVP_depth = gl.getUniformLocation(this.depthProgram, "uLightVP");

        // Round 54 - stair-step smoothing overlay. Slope quads use a
        // separate program because (a) they need vertex-supplied normals
        // (the cube shader infers normal from face direction encoded in
        // attribute, but slope normals are diagonal), (b) they have no
        // AO data, (c) they're rendered after cubes with polygon offset
        // to win z-fight at coincident edges. Layout: aPos(0), aColor(1),
        // aNormal(2). Same fog + sun uniforms as the main program for
        // visual consistency.
        const slopeVS = `#version 300 es
        layout(location=0) in vec3 aPos;
        layout(location=1) in vec3 aColor;
        layout(location=2) in vec3 aNormal;
        uniform mat4 uViewProj;
        out vec3 vWorld;
        out vec3 vColor;
        out vec3 vNormal;
        void main() {
            vWorld  = aPos;
            vColor  = aColor;
            vNormal = aNormal;
            gl_Position = uViewProj * vec4(aPos, 1.0);
        }`;
        const slopeFS = `#version 300 es
        precision highp float;
        in vec3 vWorld;
        in vec3 vColor;
        in vec3 vNormal;
        out vec4 outColor;
        uniform vec3 uCamPos;
        uniform vec3 uSunDir;
        uniform vec3 uFogColor;
        uniform float uFogNear;
        uniform float uFogFar;
        void main() {
            vec3 N = normalize(vNormal);
            float ndl = max(0.0, dot(N, normalize(uSunDir)));
            // Match main shader's lighting model roughly: ambient + N.L
            vec3 lit = vColor * (0.35 + 0.65 * ndl);
            // Round 134 — match main shader's aerial-perspective fog
            // so the stair-step overlay blends seamlessly into the
            // voxel terrain at distance. Same formula, same constants.
            const vec3 zenithCol = vec3(0.55, 0.72, 0.92);
            vec3 vd = normalize(vWorld - uCamPos);
            float skyDot = max(0.0, vd.y);
            vec3 fogCol = mix(uFogColor, zenithCol, smoothstep(0.0, 0.6, skyDot));
            float dist = length(vWorld - uCamPos);
            float fogD = dist / max(uFogFar, 0.001);
            float fogF = (1.0 - exp(-fogD * fogD * 2.5)) * 0.92;
            vec3 finalCol = mix(lit, fogCol, fogF);
            outColor = vec4(finalCol, 1.0);
        }`;
        this.slopeProgram = gl.createProgram();
        gl.attachShader(this.slopeProgram, compile(gl.VERTEX_SHADER, slopeVS));
        gl.attachShader(this.slopeProgram, compile(gl.FRAGMENT_SHADER, slopeFS));
        gl.linkProgram(this.slopeProgram);
        if (!gl.getProgramParameter(this.slopeProgram, gl.LINK_STATUS)) {
            console.error("[RENDERER] slope program link:", gl.getProgramInfoLog(this.slopeProgram));
        }
        this.uViewProj_slope = gl.getUniformLocation(this.slopeProgram, "uViewProj");
        this.uCamPos_slope   = gl.getUniformLocation(this.slopeProgram, "uCamPos");
        this.uSunDir_slope   = gl.getUniformLocation(this.slopeProgram, "uSunDir");
        this.uFogColor_slope = gl.getUniformLocation(this.slopeProgram, "uFogColor");
        this.uFogNear_slope  = gl.getUniformLocation(this.slopeProgram, "uFogNear");
        this.uFogFar_slope   = gl.getUniformLocation(this.slopeProgram, "uFogFar");
        // Toggle via gfxSettings.set("slopes", false) - default ON
        this.slopesEnabled = true;

        // Defaults — main.js / SkyRenderer can override per frame
        this.sunDir    = [0.4, 0.85, 0.3];
        this.fogColor  = [0.78, 0.65, 0.55];   // matches sky horizon default
        this.fogNear   = 60.0;
        this.fogFar    = 220.0;

        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);

        // Round 43p - frustum culling + perf counters
        this.frustum = new Frustum();
        this.frustumCullEnabled = true;
        // Stats exposed to UI / debug HUD
        this.stats = { chunksTotal: 0, chunksDrawn: 0, chunksCulled: 0, lastBuildMs: 0, workerQueue: 0 };

        // Round 43q - off-thread chunk meshing. The worker imports the
        // pure mesher core and posts back transferable Float32Arrays.
        // _pendingMesh tracks chunks currently being meshed so we don't
        // re-queue them while in flight; _meshQueue holds chunks waiting
        // for the worker to free up. We cap to one in-flight job per
        // worker to keep latency tight; multiple workers is a follow-up.
        this._pendingMesh = new Map();   // chunkKey -> requestId
        this._meshQueue = [];            // array of {chunk, neighbors}
        this._nextMeshId = 1;
        // v2799 — MESH WORKER POOL. The single-worker cap ("multiple
        // workers is a follow-up") became the pipeline bottleneck once
        // terrain gen moved to wasm + its own worker: chunks arrive faster
        // than one mesher can drain them. Pool size leaves headroom for
        // the main thread + terrain gen worker on small machines.
        // Tune: window.__swekMeshWorkers = N (before renderer construction).
        this._meshWorkers = [];          // [{ worker, busy }]
        this.meshWorker = null;          // legacy alias (first pool entry)
        try {
            let poolSize = 2;
            try {
                const hc = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) | 0;
                if (hc > 0) poolSize = Math.max(1, Math.min(4, hc - 2));
                if (typeof window !== "undefined" && (window.__swekMeshWorkers | 0) > 0) {
                    poolSize = Math.max(1, Math.min(8, window.__swekMeshWorkers | 0));
                }
            } catch {}
            for (let i = 0; i < poolSize; i++) {
                const worker = new Worker(
                    new URL("../worker/chunkMesher.worker.js", import.meta.url),
                    { type: "module" }
                );
                const entry = { worker, busy: false, id: i };
                worker.onmessage = (e) => this._onWorkerMesh(entry, e.data);
                worker.onerror = (e) => {
                    console.error(`[RENDERER] mesh worker ${entry.id} error:`, e.message);
                    entry.busy = false;
                    this._drainMeshQueue();
                };
                this._meshWorkers.push(entry);
                // Round 283 — track activity for the ECG HUD.
                try {
                    import("../ui/workerActivity.js").then(mod =>
                        mod.registerWorker?.("chunkMesher" + i, worker));
                } catch {}
            }
            this.meshWorker = this._meshWorkers[0]?.worker ?? null;
            this.workerEnabled = this._meshWorkers.length > 0;
            console.log(`[RENDERER] mesh worker pool spawned (${this._meshWorkers.length})`);
        } catch (err) {
            console.warn("[RENDERER] mesh worker unavailable — falling back to sync:", err?.message);
            this.workerEnabled = this._meshWorkers.length > 0;
            if (!this.workerEnabled) this.meshWorker = null;
        }

        console.log("[RENDERER] v45 ready (lighting + fog + emissive)");
    }

    // ===================================================================
    // v414 — opt-in per-voxel detail texture (triplanar).
    // ===================================================================

    // Generate a neutral tileable grayscale detail texture. Centered on
    // ~0.5 so that with the shader's dtex*2.0, the average is ×1.0 — i.e.
    // even at full mix the overall brightness is preserved; only relief
    // (grain, cracks, panel lines) is added. REPEAT-wrapped + mipmapped.
    // Generate the per-voxel-type detail atlas: a vertical stack of
    // NVOX tiles (TILE×TILE each), one relief pattern per material. Each
    // tile is centered on ~mid-gray so (with the shader's dtex*2.0) it
    // modulates surface relief without shifting hue — the voxel keeps its
    // palette/classification color and just gains material-specific grain.
    // Row order matches the FS: 0 stone,1 dirt,2 grass,3 sand,4 snow,
    // 5 lava,6 default. CLAMP_T (no vertical wrap), REPEAT_S (tiles
    // horizontally), LINEAR no-mipmap (avoids cross-row mip bleed).
    _createDefaultDetailTexture(gl) {
        const TILE = 128, NVOX = 7, H = TILE * NVOX;
        this._detailTile = TILE; this._detailLayers = NVOX;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
        // Allocate the array: NVOX layers of TILE×TILE (one per material).
        gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, TILE, TILE, NVOX, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        const cv = (typeof document !== "undefined") ? document.createElement("canvas") : null;
        if (cv) {
            cv.width = TILE; cv.height = H;
            const ctx = cv.getContext("2d");
            const rnd = (() => { let s = 1337; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
            const tile = (row, draw) => { ctx.save(); ctx.translate(0, row * TILE); ctx.beginPath();
                ctx.rect(0, 0, TILE, TILE); ctx.clip(); ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, TILE, TILE); draw(ctx); ctx.restore(); };
            const speckle = (ctx, n, lo, hi, sz) => { for (let i = 0; i < n; i++) {
                const v = Math.floor(lo + rnd() * (hi - lo)); ctx.fillStyle = `rgb(${v},${v},${v})`;
                ctx.fillRect(rnd() * TILE, rnd() * TILE, sz, sz); } };
            // 0 stone — angular cracks + grey mottle
            tile(0, (c) => { speckle(c, 700, 96, 150, 2);
                c.strokeStyle = "rgba(70,70,70,0.6)"; c.lineWidth = 2;
                for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(rnd()*TILE, rnd()*TILE);
                    c.lineTo(rnd()*TILE, rnd()*TILE); c.stroke(); } });
            // 1 dirt — clumpy speckle
            tile(1, (c) => { speckle(c, 1400, 80, 150, 3); });
            // 2 grass — vertical blades
            tile(2, (c) => { for (let i = 0; i < 260; i++) { const x = rnd()*TILE, h = 6 + rnd()*16;
                const v = Math.floor(95 + rnd()*70); c.strokeStyle = `rgb(${v-20},${v},${v-30})`;
                c.lineWidth = 1; c.beginPath(); c.moveTo(x, TILE); c.lineTo(x + (rnd()-0.5)*3, TILE-h); c.stroke(); } });
            // 3 sand — fine grain + faint ripples
            tile(3, (c) => { speckle(c, 2200, 110, 150, 1);
                c.strokeStyle = "rgba(120,120,120,0.4)"; c.lineWidth = 1;
                for (let y = 8; y < TILE; y += 14) { c.beginPath();
                    for (let x = 0; x <= TILE; x += 6) c.lineTo(x, y + Math.sin(x*0.2)*2); c.stroke(); } });
            // 4 snow — bright sparkle
            tile(4, (c) => { c.fillStyle = "#9a9a9a"; c.fillRect(0,0,TILE,TILE);
                speckle(c, 500, 150, 210, 2); });
            // 5 lava — cracked cells (dark seams, bright centers)
            tile(5, (c) => { c.fillStyle = "#6a6a6a"; c.fillRect(0,0,TILE,TILE);
                for (let i = 0; i < 22; i++) { const x = rnd()*TILE, y = rnd()*TILE, r = 8 + rnd()*16;
                    const g = c.createRadialGradient(x,y,1,x,y,r); g.addColorStop(0,"#c8c8c8"); g.addColorStop(1,"#5a5a5a");
                    c.fillStyle = g; c.beginPath(); c.arc(x,y,r,0,7); c.fill(); } });
            // 6 default — mild grain
            tile(6, (c) => { speckle(c, 600, 105, 150, 2); });
            // Upload each TILE×TILE region as its own array layer.
            const ctx2 = cv.getContext("2d");
            for (let i = 0; i < NVOX; i++) {
                const img = ctx2.getImageData(0, i * TILE, TILE, TILE);
                gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, TILE, TILE, 1, gl.RGBA, gl.UNSIGNED_BYTE, img);
            }
        } else {
            // headless fallback: every layer mid-gray (relief no-op)
            const flat = new Uint8Array(TILE * TILE * 4).fill(128);
            for (let i = 3; i < flat.length; i += 4) flat[i] = 255;
            for (let i = 0; i < NVOX; i++)
                gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, TILE, TILE, 1, gl.RGBA, gl.UNSIGNED_BYTE, flat);
        }
        // Both axes REPEAT (per-layer, no cross-material bleed) + per-layer mips.
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D_ARRAY);   // TILE=128 is POT
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
        return tex;
    }

    /** Set blend amount 0..1. 0 disables (render path unchanged). */
    setDetailMix(v)   { this._detailMix = Math.max(0, Math.min(1, +v || 0)); }
    /** Set tiling frequency (world-units → uv). Lower = bigger features. */
    setDetailScale(v) { const n = Number.isFinite(+v) ? +v : 0.25; this._detailScale = Math.max(0.01, n); }
    getDetailState()  { return { mix: this._detailMix, scale: this._detailScale, parallaxScale: this._parallaxScale, parallaxLayers: this._parallaxLayers }; }
    // v2832 -- POM controls. Clamped rather than trusted: a large scale makes the march overshoot the tile and
    // swim, and more layers cost fill rate for a difference nobody can see past about 32.
    setParallax(scale, layers) {
        this._parallaxScale  = Math.max(0, Math.min(0.25, +scale || 0));
        if (layers !== undefined) this._parallaxLayers = Math.max(4, Math.min(64, layers | 0));
    }
    getParallaxState() { return { scale: this._parallaxScale, layers: this._parallaxLayers }; }

    /**
     * Replace the detail texture with caller-supplied RGBA pixels — e.g.
     * a WAD wall texture or atlas. width/height should be power-of-two
     * for mipmapped REPEAT tiling.
     */
    setDetailLayer(layer, rgba, width, height) {
        const gl = this.gl;
        const TILE = this._detailTile || 128;
        let src;   // ImageData or Uint8Array sized TILE×TILE
        if (width === TILE && height === TILE) {
            src = rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba);
        } else if (typeof document !== "undefined") {
            const a = document.createElement("canvas"); a.width = width; a.height = height;
            const actx = a.getContext("2d");
            const id = actx.createImageData(width, height);
            id.data.set(rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba));
            actx.putImageData(id, 0, 0);
            const b = document.createElement("canvas"); b.width = TILE; b.height = TILE;
            const bctx = b.getContext("2d"); bctx.drawImage(a, 0, 0, TILE, TILE);
            src = bctx.getImageData(0, 0, TILE, TILE);
        } else { return; }
        const L = Math.max(0, Math.min((this._detailLayers || 7) - 1, layer | 0));
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this._detailTex);
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, L, TILE, TILE, 1, gl.RGBA, gl.UNSIGNED_BYTE, src);
        gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    }
    // Back-compat: old single-texture override now fills the generic layer (6).
    setDetailTexture(rgba, width, height) { this.setDetailLayer(6, rgba, width, height); }

    // Round 43q - construct a VAO from already-meshed typed arrays (the
    // worker output path). Identical buffer layout to the sync path,
    // just no JS Array → Float32Array conversion (already typed).
    // PATCH-VR1: the record now carries its buffer handles + byte capacities.
    // Deleting a VAO does NOT delete the buffers attached to it -- the old
    // { vao, count } shape discarded the VBO handles, permanently leaking 3
    // buffers per remesh (6 with slopes). PATCH-VR3: buffers are DYNAMIC_DRAW
    // so remesh storms can update them IN PLACE (_updateMeshBuffers) instead
    // of cycling create/delete through the driver.
    _buildVAOFromArrays(vertsArr, colsArr, aosArr) {
        const gl = this.gl;
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const vb = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.bufferData(gl.ARRAY_BUFFER, vertsArr, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        const cb = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, cb);
        gl.bufferData(gl.ARRAY_BUFFER, colsArr, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

        const ab = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, ab);
        gl.bufferData(gl.ARRAY_BUFFER, aosArr, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

        return { vao, vb, cb, ab,
                 capV: vertsArr.byteLength, capC: colsArr.byteLength, capA: aosArr.byteLength,
                 count: vertsArr.length / 3 };
    }

    // PATCH-VR4 -- public eviction: free a chunk's GPU mesh by key ("cx,cz").
    // Wired to ChunkStreamer.onChunkUnloaded in main.js; also safe to call
    // from the console (window.renderer?.removeChunkMesh?.("3,-2")).
    removeChunkMesh(key) {
        const m = this.meshes.get(key);
        if (!m) return false;
        this._disposeMesh(m);
        this.meshes.delete(key);
        return true;
    }

    // PATCH-VR1 -- free a mesh record's GPU objects (buffers AND VAO), main
    // mesh + slope overlay. Null-safe; tolerates records from any builder.
    _disposeMesh(mesh) {
        if (!mesh) return;
        const gl = this.gl;
        if (mesh.vb)  gl.deleteBuffer(mesh.vb);
        if (mesh.cb)  gl.deleteBuffer(mesh.cb);
        if (mesh.ab)  gl.deleteBuffer(mesh.ab);
        if (mesh.vao) gl.deleteVertexArray(mesh.vao);
        const s = mesh.slopes;
        if (s) {
            if (s.vb)  gl.deleteBuffer(s.vb);
            if (s.cb)  gl.deleteBuffer(s.cb);
            if (s.nb)  gl.deleteBuffer(s.nb);
            if (s.vao) gl.deleteVertexArray(s.vao);
        }
        mesh.vao = null; mesh.vb = null; mesh.cb = null; mesh.ab = null;
        mesh.count = 0; mesh.slopes = null;
    }

    // PATCH-VR3 -- grow-only in-place buffer update. Under capacity: orphan
    // (bufferData with the same size lets the driver hand back fresh storage
    // instead of stalling on in-flight draws) then bufferSubData the payload.
    // Over capacity: reallocate with 25% headroom so a chunk that oscillates
    // around a size settles instead of reallocating every remesh.
    _updateBuf(buf, arr, cap) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        if (!(cap > 0) || arr.byteLength > cap) {
            cap = Math.max(16, Math.ceil(arr.byteLength * 1.25));
        }
        gl.bufferData(gl.ARRAY_BUFFER, cap, gl.DYNAMIC_DRAW);
        if (arr.byteLength > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr);
        return cap;
    }

    // PATCH-VR3 -- remesh an existing record in place. The VAO's attribute
    // bindings reference the buffer OBJECTS, which are unchanged -- only
    // their contents move -- so no VAO churn at all on the storm path.
    _updateMeshBuffers(mesh, vertsArr, colsArr, aosArr) {
        mesh.capV = this._updateBuf(mesh.vb, vertsArr, mesh.capV);
        mesh.capC = this._updateBuf(mesh.cb, colsArr,  mesh.capC);
        mesh.capA = this._updateBuf(mesh.ab, aosArr,   mesh.capA);
        mesh.count = vertsArr.length / 3;
    }

    // PATCH-VR3 -- slope overlay in-place update. A remesh that produces no
    // slopes KEEPS the buffers (count=0 skips the draw) so a later remesh
    // that has slopes again reuses them instead of recreating.
    _updateSlopeMesh(mesh, vertsArr, normalsArr, colsArr) {
        if (!vertsArr || vertsArr.length === 0) {
            if (mesh.slopes) mesh.slopes.count = 0;
            return;
        }
        const s = mesh.slopes;
        if (!s || !s.vao || !s.vb || !(s.capV > 0)) {
            if (s) this._disposeSlopes(mesh);
            mesh.slopes = this._buildSlopeVAOFromArrays(vertsArr, normalsArr, colsArr);
            return;
        }
        s.capV = this._updateBuf(s.vb, vertsArr,   s.capV);
        s.capC = this._updateBuf(s.cb, colsArr,    s.capC);
        s.capN = this._updateBuf(s.nb, normalsArr, s.capN);
        s.count = vertsArr.length / 3;
    }

    // PATCH-VR1 helper -- dispose only the slope overlay of a record.
    _disposeSlopes(mesh) {
        const s = mesh && mesh.slopes;
        if (!s) return;
        const gl = this.gl;
        if (s.vb)  gl.deleteBuffer(s.vb);
        if (s.cb)  gl.deleteBuffer(s.cb);
        if (s.nb)  gl.deleteBuffer(s.nb);
        if (s.vao) gl.deleteVertexArray(s.vao);
        mesh.slopes = null;
    }

    // Round 54 - build a slope VAO from the worker's slope arrays.
    // Layout: aPos(0), aColor(1), aNormal(2). Returns null when there
    // are no slope verts (most chunks without stair patterns).
    _buildSlopeVAOFromArrays(vertsArr, normalsArr, colsArr) {
        if (!vertsArr || vertsArr.length === 0) return null;
        const gl = this.gl;
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const vb = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.bufferData(gl.ARRAY_BUFFER, vertsArr, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        const cb = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, cb);
        gl.bufferData(gl.ARRAY_BUFFER, colsArr, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

        const nb = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, nb);
        gl.bufferData(gl.ARRAY_BUFFER, normalsArr, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);
        // PATCH-VR1: carry handles + capacities (see _buildVAOFromArrays).
        return { vao, vb, cb, nb,
                 capV: vertsArr.byteLength, capC: colsArr.byteLength, capN: normalsArr.byteLength,
                 count: vertsArr.length / 3 };
    }

    // Round 43q - worker response handler. Build the VAO and replace
    // the cached mesh atomically. If the chunk was modified during the
    // worker run (its current dirty flag is set), discard this stale
    // result — the dirty path will re-queue.
    _onWorkerMesh(entry, msg) {
        entry.busy = false;
        const key = msg.cx + "," + msg.cz;
        const pendingId = this._pendingMesh.get(key);
        this._pendingMesh.delete(key);
        // Build the VAO regardless (the alternative is re-dispatching;
        // a brief flash of slightly-stale mesh is acceptable).
        if (pendingId === msg.id) {
            // PATCH-VR2/VR3: the old path built a NEW vao+3 buffers and then
            // deleted only the old VAOs -- deleting a VAO does not delete its
            // attached buffers, so every worker remesh leaked 3-6 VBOs (the
            // unbounded-VRAM bug under kaiju destruction). Now: if a healthy
            // tracked record exists, update its buffers IN PLACE (zero GL
            // object churn); otherwise dispose whatever was there and build
            // a fresh tracked record.
            let mesh = this.meshes.get(key);
            if (mesh && mesh.vao && mesh.vb && mesh.capV > 0) {
                this._updateMeshBuffers(mesh, msg.verts, msg.cols, msg.aos);
                this._updateSlopeMesh(mesh, msg.slopeVerts, msg.slopeNormals, msg.slopeCols);
            } else {
                if (mesh) this._disposeMesh(mesh);
                mesh = this._buildVAOFromArrays(msg.verts, msg.cols, msg.aos);
                // Round 54 - also build slope VAO (may be null if no slopes
                // in this chunk).
                mesh.slopes = this._buildSlopeVAOFromArrays(
                    msg.slopeVerts, msg.slopeNormals, msg.slopeCols);
                this.meshes.set(key, mesh);
            }
        }
        this._drainMeshQueue();
    }

    // v2799 — dispatch queued jobs to EVERY idle worker in the pool.
    _idleMeshWorker() {
        for (const e of this._meshWorkers) if (!e.busy) return e;
        return null;
    }

    _drainMeshQueue() {
        while (this._meshQueue.length > 0) {
            const idle = this._idleMeshWorker();
            if (!idle) return;
            const next = this._meshQueue.shift();
            this._dispatchMesh(next.chunk, next.chunkMap, idle);
        }
    }

    // Round 43q / v2799 — send one chunk to an idle pool worker. Caller is
    // responsible for not re-dispatching a chunk already in pendingMesh.
    _dispatchMesh(chunk, chunkMap, entry = null) {
        entry = entry || this._idleMeshWorker();
        if (!entry) {   // no idle worker — requeue (front) and wait
            this._meshQueue.unshift({ chunk, chunkMap });
            return;
        }
        const id = this._nextMeshId++;
        this._pendingMesh.set(chunk._key, id);
        entry.busy = true;

        // Gather neighbor voxel buffers — 8 surrounding chunks. Copy
        // (not transfer) so the main thread retains its buffer.
        const neighbors = {};
        const offsets = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (const [dx, dz] of offsets) {
            const adj = chunkMap.get((chunk.cx + dx) + "," + (chunk.cz + dz));
            if (adj) {
                // Copy the Uint8Array so we don't transfer ownership
                neighbors[dx + "," + dz] = new Uint8Array(adj.voxels);
            }
        }

        entry.worker.postMessage({
            cmd: "mesh",
            id,
            cx: chunk.cx,
            cz: chunk.cz,
            size: chunk.size,
            height: chunk.height,
            voxels: new Uint8Array(chunk.voxels),   // copy too
            neighbors,
            skipWater: this.skipWater,
            // v2776 - flip chunks onto the RLE mesher via ?rle=1 or window.__swekRLEMesh=true (default: greedy mesher)
            useRLE: (typeof location !== "undefined" && new URLSearchParams(location.search).get("rle") === "1") || (typeof window !== "undefined" && !!window.__swekRLEMesh),
        });
    }

    // ------------------------------------------------------------
    // v434 — world-space voxel lookup with cross-chunk neighbor support,
    // used by the marching-cubes terrain path.
    _voxelAtWorld(chunk, chunkMap, wx, wy, wz) {
        const S = chunk.size, H = chunk.height;
        if (wy < 0 || wy >= H) return 0;
        const cx = Math.floor(wx / S), cz = Math.floor(wz / S);
        const lx = wx - cx * S, lz = wz - cz * S;
        if (cx === chunk.cx && cz === chunk.cz) return chunk.get(lx, wy, lz);
        if (chunkMap) {
            const adj = chunkMap.get(`${cx},${cz}`);
            if (adj) return adj.get(lx, wy, lz);
        }
        return 0;
    }

    // v434 — marching-cubes mesh for one chunk, in the same VAO layout as
    // the blocky path (pos@0, color@1, AO@2). The smooth geometry is purely
    // visual; the voxel grid is the source of truth for everything else.
    buildChunkMeshMC(chunk, chunkMap) {
        const gl = this.gl;
        const S = chunk.size, H = chunk.height;
        const X0 = chunk.cx * S, Z0 = chunk.cz * S;

        const solidSample = (wx, wy, wz) => this._voxelAtWorld(chunk, chunkMap, wx, wy, wz);
        // Surface vertex colour = the top-most solid voxel in the 2×2×2 cell
        // it borders, mapped through the same material colours as the blocky
        // mesher — so snow reads as snow, grass as grass, etc.
        const colorAt = (vx, vy, vz) => {
            const bx = Math.floor(vx), by = Math.floor(vy), bz = Math.floor(vz);
            let bestId = 0, bestY = -Infinity;
            for (let oz = -1; oz <= 0; oz++)
                for (let oy = -1; oy <= 0; oy++)
                    for (let ox = -1; ox <= 0; ox++) {
                        const yy = by + oy;
                        const id = this._voxelAtWorld(chunk, chunkMap, bx + ox, yy, bz + oz);
                        if (isMcSolidId(id) && yy > bestY) { bestY = yy; bestId = id; }
                    }
            return getMaterialRegistry().getColor(bestId) || PALETTE[bestId] || [0.5, 0.5, 0.5];
        };

        const m = meshChunkMC({ solidSample, colorAt, X0, Z0, S, H });
        if (!m || m.count === 0) return { vao: null, count: 0, slopes: null };

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const vb = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.bufferData(gl.ARRAY_BUFFER, m.positions, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        const cb = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, cb);
        gl.bufferData(gl.ARRAY_BUFFER, m.colors, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        const ab = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, ab);
        gl.bufferData(gl.ARRAY_BUFFER, m.aos, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        // PATCH-VR1: carry handles + capacities so _disposeMesh can free
        // this record and the worker path can update it in place later.
        return { vao, vb, cb, ab,
                 capV: m.positions.byteLength, capC: m.colors.byteLength, capA: m.aos.byteLength,
                 count: m.count, slopes: null };
    }

    buildChunkMesh(chunk, chunkMap) {

        // v434 — opt-in smooth (marching-cubes) terrain. Voxel data is
        // untouched (collision still uses the grid); only the visible mesh
        // is the rounded isosurface. Falls back to blocky on any error.
        if (this.smoothTerrain) {
            try {
                const mc = this.buildChunkMeshMC(chunk, chunkMap);
                if (mc) return mc;
            } catch (e) {
                if (!this._mcWarned) { console.warn("[MC] terrain mesh failed, using blocky:", e.message); this._mcWarned = true; }
            }
        }

        const gl = this.gl;

        const S = chunk.size;
        const H = chunk.height;

        const verts = [];
        const cols = [];
        const aos = [];          // round 43j - per-vertex AO 0..1

        const dims = [S, H, S];

        for (let d = 0; d < 3; d++) {

            const u = (d + 1) % 3;
            const v = (d + 2) % 3;

            const sliceMax = dims[d];

            for (let slice = 0; slice < sliceMax; slice++) {

                const mask = new Int32Array(dims[u] * dims[v]);

                for (let j = 0; j < dims[v]; j++) {
                    for (let i = 0; i < dims[u]; i++) {

                        const a = this.sample(chunk, chunkMap, slice,     i, j, d);
                        const b = this.sample(chunk, chunkMap, slice + 1, i, j, d);

                        const idx = i + j * dims[u];

                        // Encode face direction in the sign of the mask
                        // value. Greedy merge compares mask values
                        // strictly, so opposite-direction faces of the
                        // same voxel type no longer get fused into a
                        // single quad with one winding (which produced
                        // the horizontal dashed-stripe artifacts).
                        if (a && !b) mask[idx] =  a;   // +d face
                        if (!a && b) mask[idx] = -b;   // -d face
                    }
                }

                this.greedy(mask, dims[u], dims[v], (i, j, w, h, code) => {

                    this.emitQuad(chunk, verts, cols, aos,
                        chunkMap, d, u, v, slice,
                        i, j, w, h, code
                    );
                });
            }
        }

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const vb = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        const cb = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, cb);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cols), gl.STATIC_DRAW);

        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

        // Round 43j - per-vertex AO (1 float per vertex)
        const ab = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, ab);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(aos), gl.STATIC_DRAW);

        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

        // Round 54 - inline path also needs to build the slope mesh. We
        // recompute via meshSlopes on the raw chunk voxel data so this
        // path stays equivalent to the worker path.
        // Avoid an import dependency by inlining the call via a helper.
        const slopeMesh = this._buildInlineSlopeMesh(chunk, chunkMap);

        // PATCH-VR1: carry handles + capacities (float32 = 4 bytes/element).
        return { vao, vb, cb, ab,
                 capV: verts.length * 4, capC: cols.length * 4, capA: aos.length * 4,
                 count: verts.length / 3, slopes: slopeMesh };
    }

    // Round 54 - inline-path slope mesher. Calls into chunkMesherCore's
    // meshSlopes by gathering neighbor voxel buffers in the same shape
    // the worker uses, then builds a GL VAO from the result.
    _buildInlineSlopeMesh(chunk, chunkMap) {
        const neighbors = {};
        const offsets = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (const [dx, dz] of offsets) {
            const adj = chunkMap?.get?.((chunk.cx + dx) + "," + (chunk.cz + dz));
            if (adj) neighbors[dx + "," + dz] = adj.voxels;
        }
        // Lazy import - we only need this on the inline fallback path.
        if (!this._meshSlopesFn) {
            try {
                // Synchronous import isn't possible in ESM; we accept that
                // the first call may return empty slopes until the dynamic
                // import resolves. Cache the function.
                import("../world/chunkMesherCore.js").then(m => {
                    this._meshSlopesFn = m.meshSlopes;
                });
                return null;
            } catch { return null; }
        }
        const slopes = this._meshSlopesFn({
            voxels:    chunk.voxels,
            neighbors,
            size:      chunk.size,
            height:    chunk.height,
            cx:        chunk.cx,
            cz:        chunk.cz,
        });
        return this._buildSlopeVAOFromArrays(slopes.verts, slopes.normals, slopes.cols);
    }

    // Sample a voxel value at the given slice position.  The slice
    // direction is determined by `d` (0=X, 1=Y, 2=Z).  i, j are the
    // in-plane coordinates on axes (d+1)%3 and (d+2)%3.
    //
    // v41+ fix: previous version ignored d entirely and always called
    // chunk.get(i, slice, j) — i.e. assumed (X=i, Y=slice, Z=j).  That's
    // only correct for d=1 (top/bottom faces).  For d=0 or d=2 (side
    // faces) it sampled completely wrong voxels, which is why side
    // faces almost never emitted and terrain looked like floating
    // top-face slabs.
    //
    // Now constructs the 3D position from (slice, i, j, d), looks up
    // adjacent chunks via chunkMap when the position falls outside
    // [0..S) × [0..S), and returns 0 (AIR) for out-of-vertical bounds
    // so top/bottom of world correctly mesh as exposed.
    sample(chunk, chunkMap, slice, i, j, d) {
        const S = chunk.size;
        const H = chunk.height;

        // Build the local 3D position.
        const pos = [0, 0, 0];
        pos[d]            = slice;
        pos[(d + 1) % 3]  = i;
        pos[(d + 2) % 3]  = j;
        let lx = pos[0], ly = pos[1], lz = pos[2];

        // Vertical out-of-bounds → air
        if (ly < 0 || ly >= H) return 0;

        // Horizontal: walk into the adjacent chunk if needed
        let cx = chunk.cx;
        let cz = chunk.cz;
        if (lx < 0)   { cx--; lx += S; }
        else if (lx >= S) { cx++; lx -= S; }
        if (lz < 0)   { cz--; lz += S; }
        else if (lz >= S) { cz++; lz -= S; }

        if (cx === chunk.cx && cz === chunk.cz) {
            const n = chunk.get(lx, ly, lz);
            if (this.skipWater && (n === 10 || n === 11)) return 0;
            return n;
        }

        if (chunkMap) {
            const adj = chunkMap.get(`${cx},${cz}`);
            if (adj) {
                const n = adj.get(lx, ly, lz);
                if (this.skipWater && (n === 10 || n === 11)) return 0;
                return n;
            }
        }
        // Adjacent chunk not loaded → treat as air so the boundary
        // face renders (better than emitting no face and seeing into
        // the void at chunk seams).
        return 0;
    }

    greedy(mask, w, h, emit) {

        const used = new Uint8Array(mask.length);

        for (let j = 0; j < h; j++) {
            for (let i = 0; i < w; i++) {

                const idx = i + j * w;
                const v = mask[idx];

                if (!v || used[idx]) continue;

                let rw = 1;
                while (i + rw < w && mask[idx + rw] === v) rw++;

                let rh = 1;

                outer:
                while (j + rh < h) {
                    for (let k = 0; k < rw; k++) {
                        if (mask[idx + k + rh * w] !== v) break outer;
                    }
                    rh++;
                }

                for (let y = 0; y < rh; y++) {
                    for (let x = 0; x < rw; x++) {
                        used[idx + x + y * w] = 1;
                    }
                }

                emit(i, j, rw, rh, v);
            }
        }
    }

    // Round 43j - sample a voxel at chunk-local (lx, ly, lz) coords,
    // resolving cross-chunk lookups. Like sample() but takes raw 3D
    // coords. Used for the 4-corner AO neighborhood checks.
    sampleAt(chunk, chunkMap, lx, ly, lz) {
        const S = chunk.size;
        const H = chunk.height;
        if (ly < 0 || ly >= H) return 0;
        let cx = chunk.cx, cz = chunk.cz;
        if (lx < 0)        { cx--; lx += S; }
        else if (lx >= S)  { cx++; lx -= S; }
        if (lz < 0)        { cz--; lz += S; }
        else if (lz >= S)  { cz++; lz -= S; }
        let c = chunk;
        if (cx !== chunk.cx || cz !== chunk.cz) {
            c = chunkMap?.get(`${cx},${cz}`);
            if (!c) return 0;
        }
        const n = c.get(lx, ly, lz);
        if (this.skipWater && (n === 10 || n === 11)) return 0;
        return n;
    }

    // Round 43j - per-corner AO factor. The face plane is at d-axis
    // position slice+1 (for sign>0) or slice (for sign<0). For each
    // corner of the quad, sample the 3 air-side voxels surrounding it
    // that are OUTSIDE the quad's u-v extent. The 4th surrounding
    // voxel (the one that's the face's own air-side neighbor) is the
    // reason the face exists and is always air, so we skip it.
    //
    // The offset triplet differs at each of the 4 quad corners:
    //   A (min-u, min-v): du,dv in [(-1,-1), ( 0,-1), (-1, 0)]
    //   B (max-u, min-v): du,dv in [(-1,-1), ( 0,-1), ( 0, 0)]
    //   C (max-u, max-v): du,dv in [( 0,-1), (-1, 0), ( 0, 0)]
    //   D (min-u, max-v): du,dv in [(-1,-1), (-1, 0), ( 0, 0)]
    cornerAO(chunk, chunkMap, d, u, v, slice, sign, cu, cv, offsets) {
        const outSlice = sign > 0 ? slice + 1 : slice;
        const samp = (du, dv) => {
            const pos = [0, 0, 0];
            pos[d] = outSlice;
            pos[u] = cu + du;
            pos[v] = cv + dv;
            return this.sampleAt(chunk, chunkMap, pos[0], pos[1], pos[2]) ? 1 : 0;
        };
        const s1 = samp(offsets[0][0], offsets[0][1]);
        const s2 = samp(offsets[1][0], offsets[1][1]);
        const sc = samp(offsets[2][0], offsets[2][1]);
        // Classic AO: if both sides blocked it's the darkest; else the
        // ordinary sum. Sides are entries 0,1; corner is 2.
        let ao;
        if (s1 && s2) ao = 3;
        else ao = s1 + s2 + sc;
        return (3 - ao) / 3;    // 0=darkest, 1=open
    }

    emitQuad(chunk, verts, cols, aos, chunkMap, d, u, v, slice, i, j, w, h, code) {

        const A = [0,0,0], B = [0,0,0], C = [0,0,0], D = [0,0,0];

        const dPos = slice + 1;
        A[d]=dPos; B[d]=dPos;
        C[d]=dPos; D[d]=dPos;

        A[u]=i;     B[u]=i+w;
        C[u]=i+w;   D[u]=i;

        A[v]=j;     B[v]=j;
        C[v]=j+h;   D[v]=j+h;

        const ox = chunk.cx * chunk.size;
        const oz = chunk.cz * chunk.size;

        for (const p of [A,B,C,D]) {
            p[0] += ox;
            p[2] += oz;
        }

        const absCode = code < 0 ? -code : code;
        // v398 — prefer the MaterialRegistry; fall back to the
        // hardcoded PALETTE for the legacy 12 voxel ids. The registry
        // path is what enables PLAYPAL ids 100..355, sector-light
        // tints, and atlas materials to render with the right color
        // without changing how voxels are stored.
        const col = getMaterialRegistry().getColor(absCode) || PALETTE[absCode] || [1,1,1];
        const sign = code > 0 ? 1 : -1;

        // Round 43j - corner AO with per-corner offset patterns.
        // Convention: entries [0] and [1] are the "sides" (the two
        // voxels sharing an EDGE with the face quad); entry [2] is
        // the "corner" (the voxel touching ONLY at the vertex point).
        // Both-sides-blocked → darkest; otherwise sides + corner sum.
        //
        // Vertex A (min-u, min-v): sides at -u and -v; corner at -u-v
        // Vertex B (max-u, min-v): sides at +u and -u-v;   corner at +u-v
        // Vertex C (max-u, max-v): sides at +u-v and +v-u; corner at +u+v
        // Vertex D (min-u, max-v): sides at -u-v and +v;   corner at -u+v
        const aoA = this.cornerAO(chunk, chunkMap, d, u, v, slice, sign, i,     j,
            [[-1,  0], [ 0, -1], [-1, -1]]);
        const aoB = this.cornerAO(chunk, chunkMap, d, u, v, slice, sign, i + w, j,
            [[ 0,  0], [-1, -1], [ 0, -1]]);
        const aoC = this.cornerAO(chunk, chunkMap, d, u, v, slice, sign, i + w, j + h,
            [[ 0, -1], [-1,  0], [ 0,  0]]);
        const aoD = this.cornerAO(chunk, chunkMap, d, u, v, slice, sign, i,     j + h,
            [[-1, -1], [ 0,  0], [-1,  0]]);

        if (code > 0) {
            // Round 132 — anisotropic flip (see chunkMesherCore for rationale)
            const flip = (aoA + aoC) < (aoB + aoD);
            if (!flip) {
                verts.push(...A,...B,...C, ...A,...C,...D);
                aos.push(aoA, aoB, aoC, aoA, aoC, aoD);
            } else {
                verts.push(...A,...B,...D, ...B,...C,...D);
                aos.push(aoA, aoB, aoD, aoB, aoC, aoD);
            }
        } else {
            const flip = (aoA + aoC) < (aoB + aoD);
            if (!flip) {
                verts.push(...A,...C,...B, ...A,...D,...C);
                aos.push(aoA, aoC, aoB, aoA, aoD, aoC);
            } else {
                verts.push(...A,...D,...B, ...B,...D,...C);
                aos.push(aoA, aoD, aoB, aoB, aoD, aoC);
            }
        }

        for (let i = 0; i < 6; i++) cols.push(...col);
    }

    // Round 48 — set the active dynamic point lights for this frame.
    // Pass a list of {x, y, z, r, g, b, range}. Order doesn't matter;
    // truncated to MAX_LIGHTS.
    setDynamicLights(lights) {
        const n = Math.min(this.MAX_LIGHTS, lights ? lights.length : 0);
        this._lightCount = n;
        for (let i = 0; i < n; i++) {
            const L = lights[i];
            this._lightPosArr[i * 3]     = L.x ?? 0;
            this._lightPosArr[i * 3 + 1] = L.y ?? 0;
            this._lightPosArr[i * 3 + 2] = L.z ?? 0;
            this._lightColArr[i * 3]     = L.r ?? 1;
            this._lightColArr[i * 3 + 1] = L.g ?? 1;
            this._lightColArr[i * 3 + 2] = L.b ?? 1;
            this._lightRangeArr[i]       = L.range ?? 8;
        }
    }

    render(chunks, camera, opts = {}) {

        const gl = this.gl;

        // Multi-viewport support for TV wall. If a viewport is passed,
        // render to that rect and skip the canvas-wide clear (caller is
        // responsible for clearing once per frame before any cell renders).
        if (opts.viewport) {
            const [vx, vy, vw, vh] = opts.viewport;
            gl.viewport(vx, vy, vw, vh);
            gl.scissor(vx, vy, vw, vh);
            gl.enable(gl.SCISSOR_TEST);
        } else {
            gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            gl.disable(gl.SCISSOR_TEST);
            // Use fog horizon color as clear so far-distance pixels
            // not covered by sky/terrain blend smoothly. SkyRenderer
            // (when present) overdraws this anyway.
            const fc = this.fogColor || [0.78, 0.65, 0.55];
            gl.clearColor(fc[0], fc[1], fc[2], 1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }

        gl.useProgram(this.program);

        const mvp = camera.getViewProjMatrix();
        gl.uniformMatrix4fv(this.uViewProj, false, mvp);

        // v45 — atmospheric uniforms. main.js may patch sunDir /
        // fogColor each frame to match SkyRenderer; defaults work
        // standalone too.
        const cp = camera.position;
        gl.uniform3f(this.uCamPos, cp.x, cp.y, cp.z);
        gl.uniform3fv(this.uSunDir,   this.sunDir);
        if (this.uTime) gl.uniform1f(this.uTime, performance.now() * 0.001);
        if (this.uCloudShadow) { const c = this.cloudShadow || {}; gl.uniform4f(this.uCloudShadow, c.on ? 1 : 0, c.coverage ?? 0.5, c.scale ?? 0.0035, c.darken ?? 0.45); }
        if (this.uEmissiveBoost) gl.uniform1f(this.uEmissiveBoost, this.emissiveBoost ?? 2.5);
        gl.uniform3fv(this.uFogColor, this.fogColor);
        gl.uniform1f(this.uFogNear,   this.fogNear);
        gl.uniform1f(this.uFogFar,    this.fogFar);

        // v414 — detail texture. Always bind (cheap) so the sampler has a
        // valid texture; uDetailMix gates whether it actually contributes.
        // uDetailMix defaults to 0 → the FS block is a no-op and output is
        // identical to the pre-v414 renderer.
        if (this.uDetailArray) {
            gl.activeTexture(gl.TEXTURE0 + this._detailUnit);
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, this._detailTex);
            gl.uniform1i(this.uDetailArray, this._detailUnit);
            gl.uniform1f(this.uDetailMix, this._detailMix);
            gl.uniform1f(this.uDetailScale, this._detailScale);
            gl.uniform1f(this.uParallaxScale, this._parallaxScale);
            gl.uniform1i(this.uParallaxLayers, this._parallaxLayers);
            gl.activeTexture(gl.TEXTURE0);   // v417 — hygiene: don't leave unit 8 active for later renderers
        }

        // Round 48 — dynamic light uniforms. Arrays sized for 8 even
        // if only N are active; uLightCount gates the in-shader loop.
        gl.uniform1i(this.uLightCount, this._lightCount);
        if (this._lightCount > 0) {
            gl.uniform3fv(this.uLightPos,   this._lightPosArr);
            gl.uniform3fv(this.uLightCol,   this._lightColArr);
            gl.uniform1fv(this.uLightRange, this._lightRangeArr);
        }

        // Round 43k - directional sun shadow map. shadowVP + shadowMap
        // are set per-frame by main.js after the depth pass runs.
        // Round 302 - CSM upgrade. If this.csm is set AND its cascades
        // have been rendered this frame, bind 3 cascade maps + 3 VPs +
        // split distances, and set uShadowCascadeCount > 1 so the FS
        // takes the cascade-selection branch. Falls back to single-
        // cascade path if csm is null or _renderOn is false.
        if (this.shadowVP && this.shadowMap) {
            gl.uniform1i(this.uShadowEnabled, 1);
            gl.uniformMatrix4fv(this.uShadowVP, false, this.shadowVP);
            gl.uniform1f(this.uShadowDarken,   this.shadowDarken);
            gl.uniform1f(this.uShadowBias,     this.shadowBias);
            // Single-cascade map binding (kept on TEXTURE3 — same as before)
            gl.activeTexture(gl.TEXTURE3);
            gl.bindTexture(gl.TEXTURE_2D, this.shadowMap);
            gl.uniform1i(this.uShadowMap, 3);

            const csmActive = this.csm && this.csm._renderOn && this.csm.enabled;
            if (csmActive) {
                gl.uniform1i(this.uShadowCascadeCount, this.csm.getNumCascades());
                // Camera forward — required for view-space Z cascade selection.
                // Fallback to a reasonable default if not provided.
                const f = this.camForward || { x: 0, y: 0, z: -1 };
                gl.uniform3f(this.uCamForward, f.x, f.y, f.z);
                const splits = this.csm.getSplitDistancesVec4();
                gl.uniform4f(this.uSplitDistances, splits[0], splits[1], splits[2], splits[3]);
                // Per-cascade VPs
                gl.uniformMatrix4fv(this.uLightVPCascade0, false, this.csm.getLightVP(0));
                gl.uniformMatrix4fv(this.uLightVPCascade1, false, this.csm.getLightVP(1));
                gl.uniformMatrix4fv(this.uLightVPCascade2, false, this.csm.getLightVP(2));
                // Per-cascade depth textures — cascade 0 already on
                // TEXTURE3 (reusing the single-shadow slot), 1 + 2 on
                // TEXTURE6 + 7 (TEXTURE4 = bloom god-ray, TEXTURE5 may
                // be used by other systems).
                gl.activeTexture(gl.TEXTURE3);
                gl.bindTexture(gl.TEXTURE_2D, this.csm.getDepthTexture(0));
                gl.uniform1i(this.uShadowMapCascade0, 3);
                gl.activeTexture(gl.TEXTURE6);
                gl.bindTexture(gl.TEXTURE_2D, this.csm.getDepthTexture(1));
                gl.uniform1i(this.uShadowMapCascade1, 6);
                gl.activeTexture(gl.TEXTURE7);
                gl.bindTexture(gl.TEXTURE_2D, this.csm.getDepthTexture(2));
                gl.uniform1i(this.uShadowMapCascade2, 7);
            } else {
                gl.uniform1i(this.uShadowCascadeCount, 1);
            }
        } else {
            gl.uniform1i(this.uShadowEnabled, 0);
            gl.uniform1i(this.uShadowCascadeCount, 0);
        }

        // Round 43p - extract camera frustum for culling. Used both for
        // chunk-vs-frustum visibility tests and for the chunkMap below
        // (only chunks ACTUALLY drawn need a neighbor lookup).
        this.frustum.extractFrom(mvp);

        // Round 43p - chunkMap is built using cached keys (no string
        // allocation per frame; chunk._key is set once at construction).
        // The map is used by the chunk mesher for cross-chunk neighbor
        // lookup so face culling on chunk boundaries is correct.
        const chunkMap = this._chunkMap || (this._chunkMap = new Map());
        chunkMap.clear();
        for (const c of chunks) {
            chunkMap.set(c._key, c);
        }

        // PATCH-VR4 -- orphan sweep. Nothing ever called meshes.delete, so
        // meshes for chunks the world no longer holds (streaming eviction,
        // world resets) sat in the Map forever holding GPU objects. Every
        // ~120 update passes, when the cache is larger than the live set,
        // dispose entries whose key is absent from the live chunk map.
        // (Deleting during Map iteration is defined-safe in JS.)
        this._evictTick = (this._evictTick | 0) + 1;
        if (this.meshes.size > chunkMap.size && (this._evictTick % 120) === 0) {
            for (const key of this.meshes.keys()) {
                if (!chunkMap.has(key)) this.removeChunkMesh(key);
            }
        }

        // Round 43p - dirty rebuild list reused across frames (no per-frame
        // array alloc). Uses cached chunk._key, _cwx, _cwz (no string ops).
        // Round 43q - if worker is available, ENQUEUE jobs (one in flight,
        // rest queued); else fall back to synchronous meshing with the
        // old 16/frame cap.
        const MAX_REBUILDS_PER_FRAME = 16;
        const dirtyChunks = this._dirtyChunks || (this._dirtyChunks = []);
        dirtyChunks.length = 0;
        const camPos = camera.position || { x: 0, z: 0 };
        for (const chunk of chunks) {
            if (!this.meshes.has(chunk._key) || chunk.dirty) {
                // Skip if already in flight; the worker response will
                // settle it. If the chunk was modified AFTER dispatch
                // (dirty=true now and a request is pending), it will be
                // re-meshed automatically on next frame after the in-flight
                // job lands (because dirty is still set).
                if (this._pendingMesh && this._pendingMesh.has(chunk._key)) continue;
                const dx = chunk._cwx - camPos.x;
                const dz = chunk._cwz - camPos.z;
                chunk._d2 = dx * dx + dz * dz;
                dirtyChunks.push(chunk);
            }
        }
        if (dirtyChunks.length > 1) {
            dirtyChunks.sort((a, b) => a._d2 - b._d2);
        }

        const buildStart = performance.now();
        if (this.workerEnabled && !this.smoothTerrain) {
            // Async path: queue close chunks; the pool drains them as
            // workers free up. Closer chunks first (front of queue).
            // v2799 — queue limit scales with pool size so a bigger pool
            // can actually be kept fed during streaming bursts.
            const queueLimit = 32 * Math.max(1, this._meshWorkers.length);
            for (const chunk of dirtyChunks) {
                if (this._meshQueue.length >= queueLimit) break;
                // De-dupe queue entries
                if (this._meshQueue.find(q => q.chunk === chunk)) continue;
                const idle = this._idleMeshWorker();
                if (!idle) {
                    this._meshQueue.push({ chunk, chunkMap });
                } else {
                    chunk.dirty = false;
                    this._dispatchMesh(chunk, chunkMap, idle);
                }
            }
            // Mark queued chunks as not-dirty so they don't re-enqueue
            // every frame (the worker holds the work item now).
            for (const q of this._meshQueue) q.chunk.dirty = false;
            this.stats.workerQueue = this._meshQueue.length +
                this._meshWorkers.reduce((n, e) => n + (e.busy ? 1 : 0), 0);
        } else {
            // Sync fallback (no worker): old 16/frame cap.
            const rebuildBudget = Math.min(dirtyChunks.length, MAX_REBUILDS_PER_FRAME);
            for (let r = 0; r < rebuildBudget; r++) {
                const chunk = dirtyChunks[r];
                // PATCH-VR2: the sync fallback overwrote the map entry without
                // freeing ANYTHING -- the old VAO and all its buffers leaked on
                // every rebuild. Dispose first. (In-place reuse is worker-path
                // only; this path already caps at 16 rebuilds/frame and only
                // runs when workers are unavailable.)
                this._disposeMesh(this.meshes.get(chunk._key));
                this.meshes.set(chunk._key, this.buildChunkMesh(chunk, chunkMap));
                chunk.dirty = false;
            }
            this.stats.workerQueue = dirtyChunks.length - rebuildBudget;
        }
        this.stats.lastBuildMs = performance.now() - buildStart;

        // Round 43p - frustum-culled draw pass. Skip chunks outside the
        // camera view AND skip empty meshes (chunks that meshed to zero
        // verts because they're all-air or fully buried).
        let drawn = 0, culled = 0;
        for (const chunk of chunks) {
            const mesh = this.meshes.get(chunk._key);
            if (!mesh) continue;
            if (mesh.count === 0) continue;          // all-air chunk
            if (this.frustumCullEnabled && !this.frustum.aabbVisible(chunk._aabb)) {
                culled++;
                continue;
            }
            gl.bindVertexArray(mesh.vao);
            gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
            drawn++;
        }
        this.stats.chunksTotal  = chunks.length;
        this.stats.chunksDrawn  = drawn;
        this.stats.chunksCulled = culled;

        // Round 54 - stair-step smoothing overlay pass. Renders slope
        // quads after cubes using the separate slope program + polygon
        // offset to win z-fight at coincident edges. Same culling as
        // the cube pass. Toggle: renderer.slopesEnabled = false.
        if (this.slopesEnabled) {
            gl.useProgram(this.slopeProgram);
            gl.uniformMatrix4fv(this.uViewProj_slope, false, mvp);
            if (camera?.position) {
                gl.uniform3f(this.uCamPos_slope,
                    camera.position.x, camera.position.y, camera.position.z);
            }
            gl.uniform3fv(this.uSunDir_slope,  this.sunDir);
            gl.uniform3fv(this.uFogColor_slope, this.fogColor);
            gl.uniform1f(this.uFogNear_slope,   this.fogNear);
            gl.uniform1f(this.uFogFar_slope,    this.fogFar);
            // Pull slope geometry slightly toward camera so it wins
            // z-fights at edges shared with cube faces.
            gl.enable(gl.POLYGON_OFFSET_FILL);
            gl.polygonOffset(-1.0, -1.0);
            let slopesDrawn = 0;
            for (const chunk of chunks) {
                const mesh = this.meshes.get(chunk._key);
                if (!mesh || !mesh.slopes || mesh.slopes.count === 0) continue;
                if (this.frustumCullEnabled && !this.frustum.aabbVisible(chunk._aabb)) continue;
                gl.bindVertexArray(mesh.slopes.vao);
                gl.drawArrays(gl.TRIANGLES, 0, mesh.slopes.count);
                slopesDrawn++;
            }
            gl.disable(gl.POLYGON_OFFSET_FILL);
            gl.polygonOffset(0, 0);
            this.stats.slopesDrawn = slopesDrawn;
        }

        // Leave scissor state for caller — TV-wall cells need subsequent
        // passes (water, etc.) to inherit the viewport+scissor of this
        // cell. main.js disables SCISSOR_TEST after the cell's full pass.
    }

    // Round 43k - depth-only render for the shadow pass. Caller has
    // already bound the shadow FBO + set viewport + cleared depth.
    // This iterates the same chunks and draws their VAOs using the
    // depth-only program. No rebuild work — meshes are assumed to
    // exist from a recent normal render() pass.
    renderDepth(chunks, lightVP) {
        const gl = this.gl;
        gl.useProgram(this.depthProgram);
        gl.uniformMatrix4fv(this.uLightVP_depth, false, lightVP);
        // Round 43p - reuse a scratch Frustum extracted from the light's
        // view-proj. The shadow map only needs casters within the light
        // frustum; combined with the empty-mesh skip this typically halves
        // shadow-pass draw count.
        const lf = this._lightFrustum || (this._lightFrustum = new Frustum());
        lf.extractFrom(lightVP);
        for (const chunk of chunks) {
            const mesh = this.meshes.get(chunk._key);
            if (!mesh || mesh.count === 0) continue;
            if (!lf.aabbVisible(chunk._aabb)) continue;
            gl.bindVertexArray(mesh.vao);
            gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
        }
    }
}