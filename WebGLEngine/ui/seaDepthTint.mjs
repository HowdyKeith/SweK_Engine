// WebGLEngine/ui/seaDepthTint.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// *** WHAT A SUBMERGED OBJECT LOOKS LIKE WITHOUT A DEPTH COMPOSITE. *** Step 3 of ocean-src-integration.
// A true composite would draw SweK objects against the SEA'S depth target (so a hull passes into the water at the waterline, behind a crest). Upstream's sea does not expose its depth and a transparent
// canvas laid over it cannot do this: every object would sit in front of all the water. This is the approximation a page can have on any GPU: a submerged fragment is mixed toward the water colour by
// 1 - exp(-density * depth), where depth is how far below the mean sea level its world position is. It is a function of the fragment's height alone (a flat level, not the wave under it), so near the
// waterline a hull below a crest is not tinted by the crest -- said here, and measured in the gate, not hidden.
//
// tintFactor / mixTint are the pure forms (CPU twin); applyDepthTint(THREE, material, opts) injects the same arithmetic into a three.js material with onBeforeCompile; GLSL_CHUNK is the text it injects.
"use strict";

/** How much of the water colour a fragment `depth` metres under the level takes: 0 at or above the level, rising to 1. */
export const tintFactor = (depth, density = 0.06) => (depth > 0 ? 1 - Math.exp(-density * depth) : 0);
/** The colour after the tint: rgb in 0..1 arrays. */
export const mixTint = (rgb, water, depth, density = 0.06) => { const f = tintFactor(depth, density); return [rgb[0] + (water[0] - rgb[0]) * f, rgb[1] + (water[1] - rgb[1]) * f, rgb[2] + (water[2] - rgb[2]) * f]; };

export const GLSL_VARYING = "varying float vSeaY;";
export const GLSL_CHUNK = "float seaDepth = max(0.0, uSeaLevel - vSeaY); float seaMix = 1.0 - exp(-uSeaDensity * seaDepth); gl_FragColor.rgb = mix(gl_FragColor.rgb, uSeaColor, seaMix);";

/**
 * Inject the tint into a three.js material (MeshStandard/Phong/Lambert/Basic). Uniforms are on material.userData.sea so a page can change them live. Returns the material.
 * `scale` converts the page's unit to metres for the density only (density is per metre of depth in the page's own units when scale is 1).
 */
export function applyDepthTint(THREE, material, { level = 0, density = 0.06, color = 0x0a3b46 } = {}) {
    // the colour is given as the display colour it should end at (a hex such as 0x0a3b46), as 0..1 rgb: the chunk runs after three's output colour conversion, so no colour space is applied twice
    const u = { uSeaLevel: { value: level }, uSeaDensity: { value: density }, uSeaColor: { value: new THREE.Vector3(((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255) } };
    material.userData.sea = u;
    const prior = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
        if (prior) prior(shader, renderer);
        Object.assign(shader.uniforms, u);
        shader.vertexShader = shader.vertexShader.replace("void main() {", GLSL_VARYING + "\nvoid main() {").replace("#include <begin_vertex>", "#include <begin_vertex>\n  vSeaY = (modelMatrix * vec4(transformed, 1.0)).y;");
        shader.fragmentShader = shader.fragmentShader.replace("void main() {", "uniform float uSeaLevel; uniform float uSeaDensity; uniform vec3 uSeaColor;\n" + GLSL_VARYING + "\nvoid main() {").replace(/(#include <dithering_fragment>)/, "$1\n  " + GLSL_CHUNK);
    };
    material.customProgramCacheKey = () => "seaTint";
    material.needsUpdate = true;
    return material;
}

export function reportLines() {
    return ["[seaDepthTint] submerged fragments mix toward the water colour by 1 - exp(-density * depth); depth is below a FLAT level (not the wave overhead)",
        "  density 0.06/m: " + [1, 5, 14, 40].map((d) => d + " m -> " + (100 * tintFactor(d)).toFixed(0) + "%").join(", ")];
}
