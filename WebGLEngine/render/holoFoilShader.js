// FILE: render/holoFoilShader.js
// VERSION: v4163 -- the GLSL half of the holofoil, and the three.js onBeforeCompile patch that puts it on
// svg-forge's extruded geometry. Checked against render/holoFoil.mjs.
//
// The effect is jal-co/holosticker's (MIT). No code of theirs is here: three.js is vendored already and
// svg-forge.html already extrudes an SVG, so what was missing was a material.
//
// *** IT PATCHES MeshStandardMaterial RATHER THAN REPLACING IT. *** svg-forge's medal already has metalness,
// roughness, a base colour and the page's lights; a bespoke ShaderMaterial would throw all of that away and
// then have to re-earn it. onBeforeCompile injects the foil at the end of the standard fragment chain, so the
// PBR shading underneath is three's own and stays correct when three is updated.
"use strict";

/** The wavelengths, spelled once and shared with the model. */
const LAMBDA = "vec3(600.0, 550.0, 450.0)";

const HOLO_GLSL = `
uniform float uThicknessNm, uIor, uFilmStrength, uGratingStrength, uFlakeStrength;
uniform float uGratingNm, uFlakeDensity, uFlakeCoverage, uFlakeSeed;

float hf_hash2(vec2 p, float seed) {
    // Integer lattice, matching the model's hash2: a flake must sit on the SURFACE, not on the screen.
    vec3 q = vec3(floor(p), seed);
    return fract(sin(dot(q, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}
float hf_fresnel(float ci) { float c = 1.0 - clamp(abs(ci), 0.0, 1.0); float c2 = c * c; return 0.04 + 0.96 * c2 * c2 * c; }

vec3 hf_thinFilm(float ci) {
    // Snell into the film, then the extra path both ways. The + PI is the half-wave shift on the external
    // reflection; drop it and every colour is the complement of what a film shows -- still pretty, still wrong.
    float sinI2 = 1.0 - clamp(abs(ci), 0.0, 1.0) * clamp(abs(ci), 0.0, 1.0);
    float cosT = sqrt(max(0.0, 1.0 - sinI2 / (uIor * uIor)));
    float d = 2.0 * uIor * uThicknessNm * cosT;
    vec3 lam = ${LAMBDA};
    return 0.5 + 0.5 * cos(6.283185307179586 * d / lam + 3.141592653589793);
}

vec3 hf_diffraction(float sinTheta) {
    vec3 lam = ${LAMBDA};
    vec3 peak = lam / uGratingNm;                       // first order
    vec3 dx = abs(vec3(abs(sinTheta)) - peak);
    return exp(-144.0 * dx * dx);                       // sharpness 12, squared
}

float hf_flake(vec2 uvSurf, float ci) {
    vec2 g = uvSurf * uFlakeDensity;
    if (hf_hash2(g, uFlakeSeed) > uFlakeCoverage) return 0.0;
    float tilt = hf_hash2(g, uFlakeSeed + 977.0) * 2.0 - 1.0;
    float align = 1.0 - abs(ci - (0.5 + 0.5 * tilt));
    return pow(clamp(align, 0.0, 1.0), 24.0);
}

vec3 holoFoil(vec3 base, float ci, vec2 uvSurf) {
    float sinTheta = sqrt(max(0.0, 1.0 - ci * ci));
    vec3 film = hf_thinFilm(ci);
    vec3 grate = hf_diffraction(sinTheta);
    float flake = hf_flake(uvSurf, ci);
    float f = hf_fresnel(ci);
    // CLAMPED: three additive layers over a base blow out, spectacular on a dark logo and a white blob on a
    // light one -- the failure that gets blamed on the artwork.
    return clamp(base * (1.0 - uFilmStrength * f)
               + film * uFilmStrength * f
               + grate * uGratingStrength * f
               + vec3(flake) * uFlakeStrength, 0.0, 1.0);
}
`;

const DEFAULTS = {
    uThicknessNm: 380, uIor: 1.4, uFilmStrength: 0.6, uGratingStrength: 0.35, uFlakeStrength: 0.8,
    uGratingNm: 1200, uFlakeDensity: 40, uFlakeCoverage: 0.12, uFlakeSeed: 1,
};

/**
 * Attach the foil to an existing MeshStandardMaterial.
 *
 * Returns the uniforms object so a page can drive the knobs live. `vViewPosition` and `vNormal` are three's own
 * varyings, so nothing new has to be plumbed through the vertex stage.
 */
function applyHoloFoil(material, opts = {}) {
    const uniforms = {};
    for (const [k, v] of Object.entries({ ...DEFAULTS, ...opts })) uniforms[k] = { value: v };
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.fragmentShader = shader.fragmentShader
            .replace("void main() {", HOLO_GLSL + "\nvoid main() {")
            // At the END of the chain, so three's PBR has already produced outgoingLight.
            .replace(
                "#include <opaque_fragment>",
                `{
                    float hf_ci = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
                    // SURFACE coordinates, not screen: a flake seeded from gl_FragCoord crawls across the
                    // object as it turns, and the surface then appears to slide under its own sparkle.
                    vec2 hf_uv = vec2(vViewPosition.x, vViewPosition.y);
                    #ifdef USE_UV
                        hf_uv = vUv;
                    #endif
                    outgoingLight = holoFoil(outgoingLight, hf_ci, hf_uv);
                }
                #include <opaque_fragment>`);
    };
    material.needsUpdate = true;
    return uniforms;
}

module.exports = { HOLO_GLSL, DEFAULTS, LAMBDA, applyHoloFoil };
