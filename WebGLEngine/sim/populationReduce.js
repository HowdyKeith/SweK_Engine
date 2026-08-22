// WebGLEngine/sim/populationReduce.js -- v3119
//
// THE REDUCTION, WRITTEN TWICE ON PURPOSE.
//
// v3118 established the plan: hold population in a float texture, reduce to tiles on the GPU, read back the
// small thing. This is the reduction itself -- and it exists in TWO forms that must agree: a GLSL fragment
// shader that runs on the device, and a plain JS reference that runs anywhere.
//
// WHY TWO. The GPU half cannot be executed in this sandbox, so a shader shipped alone would be a claim with no
// evidence -- "it looked fine on the rig" is what this project is arranged against. But the shader's ARITHMETIC
// is not device-specific: summing the live flags in a 32x32 block is the same operation in GLSL and in
// JavaScript. So the reference is the testable statement of intent, the shader is the fast statement of the
// same thing, and A GATE CHECKS THEM AGAINST EACH OTHER ON A SYNTHETIC FIELD. What remains unverified is
// whether WebGL runs it, not whether it is right.
//
// THE RISK THIS ACCEPTS, stated plainly: two implementations of one rule can drift. That is the exact cost the
// one-owner law exists to avoid, and it is paid deliberately here because the alternative -- shipping only the
// shader -- pays it too AND gives up the ability to notice. Drift that a gate catches every run is a different
// animal from drift nobody can see.

/** The alpha channel packs kind*2 + alive, so a slot is live when its packed value is odd. */
export const LIVE_FROM_PACKED = "mod(floor(a + 0.5), 2.0)";

/**
 * JS REFERENCE. Sum live slots per tile over a field laid out row-major, RGBA per texel.
 * @param rgba  Float32Array length side*side*4
 * @returns Float32Array length tilesPerSide^2, tile-row-major -- the SAME order spawnIntents() decodes
 */
export function reduceReference(rgba, side, tile) {
    if (side % tile !== 0) throw new RangeError("tile must divide side exactly: " + side + " % " + tile);
    const tps = side / tile;
    const out = new Float32Array(tps * tps);
    // v3123 -- AND A FREE SLOT PER TILE, AT ZERO EXTRA COST. The reduction ALREADY reads every texel in the
    // tile to count the live ones; noticing a dead one on the way costs nothing and is the difference between
    // a system that can report crowding and one that can act on it. Same shape as v3104's rr.bytes and v3114's
    // blendshapes: the answer was already being computed and thrown away.
    const free = new Float32Array(tps * tps).fill(-1);
    for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
            const t = Math.floor(y / tile) * tps + Math.floor(x / tile);
            const a = rgba[(y * side + x) * 4 + 3];
            if (Math.round(a) % 2 === 1) { out[t] += 1; continue; }
            // FIRST dead slot wins, so the answer does not depend on scan order beyond "first" -- a LAST-wins
            // rule would give a different free slot for the same field read in a different direction, and the
            // GPU's fragment order is not something to build on.
            if (free[t] < 0) free[t] = y * side + x;
        }
    }
    return { counts: out, free };
}

/**
 * GLSL for the same sum. One invocation per TILE; it walks that tile's texels and counts the odd alphas.
 *
 * A LOOP WITH A CONSTANT BOUND, because GLSL ES 3.00 will not unroll a loop whose trip count it cannot see, and
 * some drivers refuse to compile one at all. TILE is substituted as a literal for that reason and not for speed.
 */
export function reduceShaderSource(tile) {
    if (!Number.isInteger(tile) || tile <= 0) throw new RangeError("tile must be a positive integer");
    return `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform int uTile;          // kept for readability; the loop bound below is the literal
uniform int uSide;          // needed to turn a texel coordinate into the flat slot index the CPU uses
out vec4 fragColor;
void main() {
    ivec2 t = ivec2(gl_FragCoord.xy);            // one invocation per TILE
    ivec2 base = t * ${tile};
    float live = 0.0;
    float freeSlot = -1.0;
    for (int dy = 0; dy < ${tile}; dy++) {
        for (int dx = 0; dx < ${tile}; dx++) {
            ivec2 at = base + ivec2(dx, dy);
            float a = texelFetch(uField, at, 0).a;
            if (freeSlot < 0.0 && mod(floor(a + 0.5), 2.0) < 0.5) freeSlot = float(at.y * uSide + at.x);
            // ODD alpha means live. floor(a + 0.5) rather than a bare cast: the packed value arrives as a
            // float and a value stored as 2469.0 can read back as 2468.9999, which truncates to EVEN and
            // would silently mark a live agent dead -- and a population that loses agents to rounding is a
            // bug that looks exactly like emigration.
            live += ${LIVE_FROM_PACKED};
        }
    }
    // v3123 -- G carries a FREE SLOT INDEX (-1 if the tile is full). Found on the same pass that counts, so
    // it is free; FIRST dead slot wins so the result does not depend on fragment ordering.
    fragColor = vec4(live, freeSlot, 0.0, 1.0);
}`;
}
