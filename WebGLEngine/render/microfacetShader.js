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
