// WebGLEngine/render/microfacetShader.js -- v3494
//
// *** THE GGX BRDF IN GLSL, AND THE ROUND EXISTS BECAUSE OF SOMETHING THE CPU VERSION CANNOT SEE. ***
//
// physics/render/microfacet.mjs has been graded since v3490 and every one of its gates runs in float64. GLSL
// `highp float` is IEEE binary32. Those are different machines, and one expression in this BRDF is a
// catastrophic-cancellation site that is INVISIBLE AT DOUBLE PRECISION:
//
//     the textbook denominator      t = cos^2 (a^2 - 1) + 1        A DIFFERENCE OF NUMBERS NEAR 1
//     algebraically identical       t = (1 - cos^2) + a^2 cos^2    A SUM OF POSITIVES
//
// Measured with Math.fround, which rounds a double to exactly binary32 (v3062's method): at roughness 0.001 the
// textbook form is 2.60e-2 out and the rewrite is 1.33e-7 out -- FIVE ORDERS -- and the NDF identity itself
// drifts to 1.00235 in the textbook form while the rewrite holds. *** IN FLOAT64 THE TWO ARE INDISTINGUISHABLE,
// SO NO GATE IN THIS ARC COULD EVER HAVE FOUND IT. THE FINDING ONLY EXISTS AT THE PRECISION THE GPU RUNS AT. ***
//
// ================================================================================================
// HOW THIS IS GRADED WITH NO GPU, AND WHY THE SHAPE OF THE SOURCE IS PART OF THE DESIGN
// ================================================================================================
//
// v3064 established the idiom: EXTRACT THE EXPRESSION OUT OF THE SHIPPED SHADER TEXT AND EVALUATE IT against
// the CPU implementation, so the two cannot drift. That only works if the expressions are extractable, so every
// line the gate reads is a SINGLE ASSIGNMENT in a subset that is valid JavaScript once PI and the two intrinsics
// are substituted: + - * / sqrt max, numeric literals written 1.0, and one ternary. NO CONTROL FLOW, NO LOOPS.
//
// *** AND THE NAIVE VARIANT IS PRODUCED FROM THE STABLE ONE BY A STRING REPLACE, exactly as FRAG_SRC_BRICK is
// produced from FRAG_SRC_UI. TWO SHADERS THAT DIFFER BY ONE LINE BY CONSTRUCTION -- a hand-written second copy
// could differ somewhere else and the measurement would be attributing the gap to the wrong line. ***
//
// WHAT THIS FILE CANNOT ANSWER: whether a real driver agrees. highp is a MINIMUM guarantee and a vendor may
// carry more, may fold expressions differently, or may not honour highp in a fragment shader at all. THE
// SANDBOX MODELS binary32; THE GPU IS THE AUTHORITY, and the page reads the numbers back to ask it.
//
// ================================================================================================
// v4408 -- ASKED. THE ARITHMETIC PREDICTION IS RIGHT TO FOUR FIGURES AND ONE SENTENCE ABOVE IS TOO NARROW.
// ================================================================================================
//
// physics/render/microfacetWgsl.mjs translates the three functions below into WGSL from THIS TEXT -- no second
// copy -- and physics/render/microfacetWgsl-selfcheck.mjs runs them on a device. Two answers came back.
//
// *** THE MODEL WAS RIGHT ABOUT THE ARITHMETIC. *** At roughness 0.001 and cos 1 the device returns 2.604e-2
// for the textbook denominator and 1.333e-7 for the rewrite -- the same two numbers Math.fround predicted, to
// four significant figures, and the two forms agree with the model to a last-bit difference over a 20-cell
// (roughness, cos) grid. The finding this round shipped is confirmed on silicon.
//
// *** AND "THE REWRITE HOLDS AT 1e-7 THROUGHOUT" IS A ROUGHNESS SWEEP AT cos = 1. *** The gate's rows are
// D32(kind, 1, a): seven roughnesses, ONE cosine -- and cos = 1 is the single point where (1 - c2) has nothing
// to cancel, because 1 - 1*1 is exactly 0 in every precision. Every PIXEL of the shader below is a different
// (roughness, cos) pair, so the axis that was not swept is the one the shader spans. Along it the rewrite is
// 9.9e-5 out at cos = 0.9999 -- three orders worse than the number that sentence quotes, in the model and on
// the device alike. (1 - c2) IS ITSELF A DIFFERENCE OF NUMBERS NEAR 1: v3494 removed the cancellation in
// (a^2 - 1) and this is the half that stayed. Nothing here is wrong; the claim is narrower than it reads.
//
// *** THE LARGER BILL IS PAID BY A CONSUMER THIS FILE CANNOT SEE. *** A fragment shader writing one lobe value
// per pixel cannot take an integral, so microfacet.mjs's first key -- INT D(m)(n.m)dm = 1 -- stayed on the CPU.
// A compute pass can take it, and on a device that builds the grid with the BUILT-IN sin and cos it reads 0.837
// at roughness 0.02. WGSL bounds sin and cos by an ABSOLUTE error of 2^-11 inside [-PI, PI], so a conformant
// device may return a cos that is four decimals correct, and (1.0 - c2) then reads twenty-eight times too
// large near the pole. Handing the same kernel the same grid's sine and cosine from the host drops the residual
// from 1.63e-1 to 2.50e-5 and lands it on the f32 mirror. THE ARITHMETIC HERE IS FINE; THE DANGER IS FEEDING IT
// A COSINE THE HARDWARE COMPUTED.
"use strict";

export const VERT_SRC = `#version 300 es
// A full-screen triangle from gl_VertexID -- no buffers, nothing to bind wrong.
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * The probe shader. It draws NO PICTURE: each pixel is one (roughness, cos) pair and the output is the three
 * quantities themselves, so the page reads numbers back and compares them.
 *
 * *** A SHADER GRADED BY LOOKING AT A HIGHLIGHT IS NOT GRADED. The whole argument of this arc is that a 27%
 * error looks like a slightly different material (v3467), and a highlight is exactly where that hides. ***
 */
export const FRAG_SRC_GGX = `#version 300 es
precision highp float;
uniform vec2 uGrid;          // how many cells across and down
uniform vec2 uAlphaRange;    // roughness at the top and bottom row
out vec4 fragColor;

float ggxD(float cosM, float a){
  float a2 = a * a;
  float c2 = cosM * cosM;
  float t = (1.0 - c2) + a2 * c2;
  return cosM <= 0.0 ? 0.0 : a2 / (3.141592653589793 * t * t);
}

float ggxLambda(float cosW, float a){
  float c2 = cosW * cosW;
  float tan2 = (1.0 - c2) / max(c2, 1.0e-16);
  return (-1.0 + sqrt(1.0 + a * a * tan2)) / 2.0;
}

float ggxG2(float cosO, float cosI, float a){
  return 1.0 / (1.0 + ggxLambda(cosO, a) + ggxLambda(cosI, a));
}

void main(){
  // x is cos, y is roughness. Cell centres, so no cell sits on a degenerate edge.
  float cosV = (floor(gl_FragCoord.x) + 0.5) / uGrid.x;
  float ty   = (floor(gl_FragCoord.y) + 0.5) / uGrid.y;
  float a    = uAlphaRange.x * pow(uAlphaRange.y / uAlphaRange.x, ty);
  fragColor = vec4(ggxD(cosV, a), ggxG2(cosV, cosV, a), a, cosV);
}`;

/**
 * The plant, and it is the textbook form rather than an invented fault.
 *
 * *** PRODUCED BY REPLACING EXACTLY ONE LINE, so the two shaders are provably identical everywhere else. The
 * replacement is asserted to have happened -- a silent no-op replace would leave the "naive" shader equal to
 * the stable one and every comparison would report a comfortable zero. ***
 */
const STABLE_T = "  float t = (1.0 - c2) + a2 * c2;";
const NAIVE_T = "  float t = c2 * (a2 - 1.0) + 1.0;";
export const FRAG_SRC_GGX_NAIVE = FRAG_SRC_GGX.replace(STABLE_T, NAIVE_T);
export const T_LINES = { stable: STABLE_T, naive: NAIVE_T };

/**
 * Pull a `float <name> = <expr>;` out of a shader and hand back the expression TEXT.
 *
 * Returns null rather than throwing, because "the line is not there any more" is a finding the gate should
 * report by name rather than a crash it should survive.
 */
export function glslExpr(src, name) {
    const m = src.match(new RegExp("float\\s+" + name + "\\s*=\\s*([^;]+);"));
    return m ? m[1].trim() : null;
}

/**
 * Evaluate an extracted GLSL expression as JavaScript.
 *
 * *** THE SUBSTITUTION SET IS DELIBERATELY TINY AND THE GATE PROVES IT ON A FIXTURE WHOSE ANSWER IS KNOWN
 * BEFORE POINTING IT AT THE SHIPPING SHADER. A transpiler nobody checked would make every agreement below
 * meaningless -- v3450's rule, that an instrument aimed straight at the real thing produces a confident number
 * nobody can check. ***
 */
export function evalGlsl(expr, vars = {}) {
    const js = expr.replace(/\bsqrt\s*\(/g, "Math.sqrt(").replace(/\bmax\s*\(/g, "Math.max(");
    const names = Object.keys(vars);
    return Function(...names, '"use strict";return (' + js + ");")(...names.map((n) => vars[n]));
}
