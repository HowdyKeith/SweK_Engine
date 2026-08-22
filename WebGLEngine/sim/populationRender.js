// WebGLEngine/sim/populationRender.js -- v3150
//
// DRAW THE POPULATION FIELD, BECAUSE A WRONG SIMULATION IS OTHERWISE INVISIBLE.
//
// The field has been readable since v3118, writable since v3122 and able to GROW since v3149, and NOTHING HAS
// EVER DRAWN IT. Every check on it is numeric: conservation, bounded motion, determinism, a JS reference. Those
// are strong and they share one blind spot -- THEY ALL COMPARE THE SIMULATION TO ITSELF. A field that agrees
// with its own reference and looks like static, or a clump, or nothing, would pass every one of them.
//
// *** ONE INSTANCED DRAW, NOT A LOOP. *** A million agents is a million draw calls if you iterate on the CPU,
// which is the same mistake as reading 16 MB back per frame wearing different clothes. gl_InstanceID indexes
// the SLOT; the texel at that slot carries the position. That is v3121's law again -- SLOT IS NOT POSITION --
// and here it is load-bearing in the other direction: the instance id must NOT be used as a coordinate.
//
// *** A DEAD AGENT MUST NOT BE DRAWN, AND MUST NOT BE DRAWN AT THE ORIGIN. *** Liveness is the low bit of the
// alpha channel and a dead slot still holds a position -- usually the one it died at. Drawing it anyway gives a
// field that never empties; drawing it at (0,0,0) gives A GROWING PILE AT THE ORIGIN that looks like a physics
// bug and is a rendering one. The vertex shader collapses a dead instance to zero size AND pushes it behind the
// near plane, because either alone leaves a driver-dependent dot.
//
// THE RENDERER NEVER READS BACK AND NEVER WRITES THE FIELD. Both are gated. A readback here would reintroduce
// exactly the stall v3118 spent a round removing, and binding the field as a draw target while sampling it is
// undefined in GL and LOOKS ALMOST RIGHT.

export const VERT_SRC = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uField;      // RGBA32F: RGB = world position, A = kind*2 + alive
uniform int   uSide;           // field side in texels
uniform mat4  uViewProj;
uniform float uPointScale;

out float vKind;

void main() {
    // gl_InstanceID IS A SLOT INDEX, NOT A POSITION. The texel it names carries the position; using the id
    // itself as a coordinate gives smooth convincing motion corresponding to nothing (v3121).
    int slot = gl_InstanceID;
    ivec2 at = ivec2(slot % uSide, slot / uSide);
    vec4 texel = texelFetch(uField, at, 0);          // texelFetch, never texture(): a LINEAR sample between two
                                                     // packed integers gives a low bit that is noise (v3119)
    float packed = texel.a;
    float alive = packed - 2.0 * floor(packed * 0.5 + 0.0001);
    vKind = floor(packed * 0.5 + 0.0001);

    if (alive < 0.5) {
        // DEAD: zero size AND behind the near plane. Either alone leaves a driver-dependent dot, and a dead
        // agent rendered at its death position gives a field that never empties.
        gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
        gl_PointSize = 0.0;
        return;
    }
    gl_Position = uViewProj * vec4(texel.rgb, 1.0);
    gl_PointSize = uPointScale;
}`;

export const FRAG_SRC = `#version 300 es
precision highp float;
in float vKind;
out vec4 fragColor;
void main() {
    // Colour BY KIND so a population that is all one kind is visibly different from a mixed one -- a field
    // drawn in a single colour hides exactly the thing the kind channel exists to carry.
    float h = fract(vKind * 0.1379);
    vec3 c = clamp(abs(fract(h + vec3(0.0, 0.6667, 0.3333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
    fragColor = vec4(c, 1.0);
}`;

/**
 * How many instances, and why it is every slot rather than every live agent.
 *
 * THE LIVE COUNT IS NOT KNOWN ON THE CPU WITHOUT A READBACK, and a readback per frame is the thing v3118
 * removed. So the draw covers the whole field and the vertex shader collapses the dead. That trades GPU work
 * for latency, deliberately, and the cost is stated rather than hidden: at side 1024 this is 1,048,576
 * instances whether twelve agents are alive or a million.
 */
export function instanceCount(field) {
    if (!field || !Number.isInteger(field.slots) || field.slots <= 0) {
        throw new RangeError("instanceCount needs a field plan with a positive integer slots");
    }
    return field.slots;
}

/**
 * Issue the draw. `gl` may be a real context or the recording proxy from render/glBootstrap.js, which is how
 * the DRAW INTENT is checked on a machine with no GPU -- the shape of the call is verifiable even where the
 * pixels are not.
 */
export function drawPopulation(gl, { program, fieldTex, field, viewProj, pointScale = 2.0, vao = null }) {
    if (!program) throw new TypeError("drawPopulation needs a linked program");
    if (!field) throw new TypeError("drawPopulation needs a field plan");
    const n = instanceCount(field);
    gl.useProgram(program);
    if (vao) gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fieldTex);
    gl.uniform1i(gl.getUniformLocation(program, "uField"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uSide"), field.side);
    gl.uniform1f(gl.getUniformLocation(program, "uPointScale"), pointScale);
    if (viewProj) gl.uniformMatrix4fv(gl.getUniformLocation(program, "uViewProj"), false, viewProj);
    // ONE CALL. A CPU loop over agents would be `slots` draw calls -- the readback mistake in another costume.
    gl.drawArraysInstanced(gl.POINTS, 0, 1, n);
    return { instances: n, calls: 1 };
}
