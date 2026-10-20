// WebGLEngine/tools/ship/stereoDevice-selfcheck.mjs -- v4483
//
// Run: node tools/ship/stereoDevice-selfcheck.mjs
//
// *** #174: THE CPU/GPU PAIR MUST AGREE BY VALUE, NOT BY EYE. *** v4463 built render/stereographic.js, compared
// its JS against its own emitted GLSL by mechanically rewriting the shader into JS, and closed by declaring the
// limit: "a real driver may differ in precision or in normalize(), and the shader's actual output still needs a
// screenshot." v4482 wired the projection to a real consumer and repeated that #174 was open. This closes it,
// on a real device, three ways -- and NEITHER GPU IS THE ANSWER KEY (v4479's rule: two backends that agree with
// each other and disagree with the arithmetic are both wrong).
//
// ---- THE ROUND'S REAL SUBJECT IS THE INSTRUMENT --------------------------------------------------------------
//
// "Needs a screenshot" understates the problem, because A SCREENSHOT IS EIGHT BITS. Every GLSL gate in this tree
// compares RGBA8 pixels, so the finest agreement any of them can assert is 1/255 -- useless for arithmetic.
// Section 1 calibrates a 24-bit packer on this device BEFORE any agreement is claimed, and every later section
// is forbidden from reporting a difference below the floor it measures.
//
// ---- AND TWO MEASUREMENTS WERE THROWN AWAY BEFORE THESE WERE KEPT ---------------------------------------------
//
// The first probe generated its test points with sin and cos on each side independently and read a WGSL-vs-CPU
// difference of 1.839e-4 -- fifteen hundred f32 ulp, which would have been reported as a real disagreement. It
// is not the projection: SwiftShader's cos and V8's Math.cos differ, and stereoUnproject amplifies the
// difference. *** A TEST POINT COMPUTED TWICE IS A TEST OF WHATEVER COMPUTED IT. *** Section 5 keeps that as a
// control with the number, because a methodology choice nobody can see the cost of is a coincidence.
//
// The second probe packed the three components into three ROWS of one image and read 1.409 -- a whole unit,
// which looks like catastrophe and was a row-order mistake in the readback, the harness flipping rows under a
// check that assumed it did not. The fix is structural: one row, component chosen by column, so there is no
// order to get wrong.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as St from "../../render/stereographic.js";
import * as P from "./glslFloatPack.mjs";
import { runWgslCompute, renderGlslToPixels, webgpuSkipReason } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const M = P.MEASURED_AT_V4483;
const near = (a, b, e) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const ULP = 2 ** -23;

// *** A GATE THAT SKIPS IS NOT A GATE THAT PASSES. *** headlessGpu-selfcheck's rule, and it applies here with
// more force: this gate exists ONLY to say what a real driver does, so no driver means no answer, not a pass.
const skip = webgpuSkipReason();
if (skip) {
    console.log("  FAIL  !! *** NO DEVICE -- " + skip + " ***");
    console.log("Every number below has to come off a real driver. There is nothing to report without one.");
    console.log("stereoDevice-selfcheck: 1 FAILED");
    process.exit(1);
}

const VS = `#version 300 es
out vec2 vUV;
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  vUV = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

// *** THE TEST POINTS ARE A LATTICE: no sin, no cos, every value exact in f32 on both sides. *** See the header.
const N = 64;
const pt = (i) => [((i % 8) - 3.5) * 0.75, (Math.floor(i / 8) - 3.5) * 0.75];
const LAT_GLSL = `vec2 pt(float i){ return vec2(mod(i, 8.0) - 3.5, floor(i / 8.0) - 3.5) * 0.75; }`;
const LAT_WGSL = `fn pt(i: f32) -> vec2<f32> { return vec2<f32>(i % 8.0 - 3.5, floor(i / 8.0) - 3.5) * 0.75; }`;
const cpu = Array.from({ length: N }, (_, i) => St.stereoUnproject(...pt(i)));

// ---- 1. *** CALIBRATE THE INSTRUMENT BEFORE CLAIMING ANY AGREEMENT *** -----------------------------------------
let floorSigned = P.PACK24_FLOOR_SIGNED;
{
    // k * 0x010101 walks all three bytes together and stays under 2^24, so every value is exact in f32 and this
    // measures the TRANSPORT -- pack, framebuffer, readPixels, unpack -- and nothing else.
    const cal = await renderGlslToPixels({ vertex: VS, width: 256, height: 1, srcSize: 8,
        fragment: `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o;
${P.PACK24_GLSL}
void main(){ o = pack24(floor(vUV.x * 256.0) * 65793.0 / ${P.PACK24_MAX}.0); }` });
    ok("the GLSL harness reached a real device", cal.ok && !cal.skipped, cal.reason || `renderer: ${cal.renderer}`);
    let worst = 0;
    if (cal.pixels) for (let i = 0; i < 256; i++) {
        const got = Math.round(P.unpack24(cal.pixels, i) * P.PACK24_MAX);
        worst = Math.max(worst, Math.abs(got - i * 65793));
    }
    say(`24-bit transport over 256 exactly-representable values: worst ${worst} step(s) of 2^-24 = ${(worst / P.PACK24_MAX).toExponential(2)}`);
    ok("!! *** THE PACKER RETURNS 23 BITS WHERE EVERY OTHER GLSL GATE IN THIS TREE GETS 8 ***",
        worst === M.worstErrorSteps && near(worst / P.PACK24_MAX, M.worstErrorAbsolute, 1e-9) &&
        M.bitsAchieved === 23 && M.improvementFactor > 30000,
        `${(1 / 255).toExponential(2)} against ${(worst / P.PACK24_MAX).toExponential(2)} -- ${M.improvementFactor}x. ` +
        "An arithmetic claim graded at 1/255 cannot tell a correct projection from one wrong in the fourth decimal");

    // *** THE CONTROL THAT PROVES THE min() MATTERS. *** The naive idiom, run on the same device, at the one
    // input where f32 cannot hold the rounding term.
    const naive = await renderGlslToPixels({ vertex: VS, width: 2, height: 1, srcSize: 8,
        fragment: `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o;
vec4 packNaive(float v) {
    float s = floor(clamp(v, 0.0, 1.0) * ${P.PACK24_MAX}.0 + 0.5);
    float b0 = floor(s / 65536.0);
    float b1 = floor((s - b0 * 65536.0) / 256.0);
    float b2 = s - b0 * 65536.0 - b1 * 256.0;
    return vec4(b0, b1, b2, 255.0) / 255.0;
}
${P.PACK24_GLSL}
void main(){ o = vUV.x < 0.5 ? packNaive(1.0) : pack24(1.0); }` });
    const nv = naive.pixels ? P.unpack24(naive.pixels, 0) : null;
    const sv = naive.pixels ? P.unpack24(naive.pixels, 1) : null;
    say(`at v = 1.0 exactly: naive decodes ${nv} (bytes ${naive.pixels ? [naive.pixels[0], naive.pixels[1], naive.pixels[2]].join(",") : "?"}), shipped decodes ${sv}`);
    ok("!! *** THE OBVIOUS IDIOM IS WRONG AT EXACTLY ONE INPUT AND IT IS THE MAXIMUM *** -- driven, not argued",
        nv !== null && sv === 1 && nv !== 1 && near(1 - nv, M.naiveDecodedError, 1e-9),
        `floor(v * ${P.PACK24_MAX} + 0.5) at v = 1 rounds to 2^24 BEFORE floor runs, because 16777215.5 needs 25 ` +
        `mantissa bits. The high byte computes as 256, saturates, and both low bytes zero out: ${nv} instead of 1. ` +
        "The extremes are where a projection's horizon and poles live, so this is the value it could least afford");
    floorSigned = 2 * (worst / P.PACK24_MAX);
}

// ---- 2. WGSL AGAINST THE CPU, AT FULL f32 -- THE ONLY PATH WITH NO 8-BIT DOOR ----------------------------------
let wgslVals = null;
{
    const w = await runWgslCompute({ code: `
@group(0) @binding(0) var<storage, read_write> out_: array<f32>;
${LAT_WGSL}
${St.stereoWGSL().split("\n").filter((l) => !/^\/\//.test(l)).join("\n")}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x; if (i >= ${N}u) { return; }
  let d = stereoUnproject(pt(f32(i)));
  out_[i*3u+0u] = d.x; out_[i*3u+1u] = d.y; out_[i*3u+2u] = d.z;
}`, outCount: N * 3, workgroups: 1 });
    ok("the WGSL emitted by render/stereographic.js COMPILES on a real driver",
        w.ok && !w.skipped, w.reason || (w.errors || []).join("; ") || "no compilation errors");
    wgslVals = w.values;
    let worst = 0, at = -1;
    for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) {
        const e = Math.abs(w.values[i * 3 + k] - cpu[i][k]);
        if (e > worst) { worst = e; at = i; }
    }
    say(`WGSL vs CPU over ${N} lattice points, ${N * 3} components: worst |diff| = ${worst.toExponential(3)} at i=${at}`);
    ok("!! *** THE WebGPU PATH AGREES WITH THE JS TO UNDER HALF AN f32 ULP *** -- exact bits, no 8-bit door",
        worst < ULP && near(worst / ULP, 0.42, 0.05),
        `${(worst / ULP).toFixed(2)} ulp, where one ulp near 1.0 is ${ULP.toExponential(2)}. A storage buffer ` +
        "returns the bits the shader wrote, so this comparison has no instrument floor to hide behind");

    let worstLen = 0;
    for (let i = 0; i < N; i++)
        worstLen = Math.max(worstLen, Math.abs(Math.hypot(w.values[i * 3], w.values[i * 3 + 1], w.values[i * 3 + 2]) - 1));
    ok("...and the driver's unproject returns a UNIT vector, which is the whole contract of the inverse",
        worstLen < ULP,
        `worst |length - 1| = ${worstLen.toExponential(3)}, under one ulp. v4463 named normalize() as a place a ` +
        "real driver might differ; it does not, on this one");
}

// ---- 3. GLSL AGAINST THE CPU, THROUGH THE CALIBRATED PACKER ----------------------------------------------------
let glslVals = null;
{
    // *** ONE ROW, COMPONENT CHOSEN BY COLUMN. *** The first draft used three rows and read 1.409 because the
    // harness flips rows and the readback did not. There is no row order left to get wrong.
    const g = await renderGlslToPixels({ vertex: VS, width: N * 3, height: 1, srcSize: 8,
        fragment: `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o;
${P.PACK24_GLSL}
${LAT_GLSL}
${St.stereoGLSL().split("\n").filter((l) => !/^\/\//.test(l)).join("\n")}
void main(){
  float j = floor(vUV.x * ${N * 3}.0);
  float comp = floor(j / ${N}.0);
  vec3 d = stereoUnproject(pt(mod(j, ${N}.0)));
  float v = comp < 0.5 ? d.x : (comp < 1.5 ? d.y : d.z);
  o = pack24(v * 0.5 + 0.5);
}` });
    ok("the GLSL emitted by render/stereographic.js compiles and draws on a real driver",
        g.ok && !g.skipped && g.pixels, g.reason || `${g.pixels.length / 4} pixels read back`);
    glslVals = Array.from({ length: 3 }, (_, k) => Array.from({ length: N }, (_, i) => P.unpack24Signed(g.pixels, k * N + i)));
    let worst = 0, at = -1;
    for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) {
        const e = Math.abs(glslVals[k][i] - cpu[i][k]);
        if (e > worst) { worst = e; at = i; }
    }
    say(`GLSL vs CPU: worst |diff| = ${worst.toExponential(3)} at i=${at}; the instrument floor is ${floorSigned.toExponential(2)}`);
    ok("!! THE WebGL2 PATH AGREES WITH THE JS AS CLOSELY AS THE INSTRUMENT CAN SEE",
        worst < floorSigned,
        `${worst.toExponential(3)} against a transport floor of ${floorSigned.toExponential(2)}. *** THIS IS NOT ` +
        "A CLAIM THAT GLSL IS 1.8e-7 WRONG: *** a difference at the instrument's own resolution is a measurement " +
        "of the instrument. What is established is that no disagreement LARGER than the floor exists");
    ok("...and the gate refuses to report tighter than its own resolution, which is the point of section 1",
        floorSigned > 0 && floorSigned >= 2 * M.worstErrorAbsolute * 0.99 && worst > floorSigned / 100,
        "a check that asserted GLSL agreement at 1e-12 would be asserting something no readback here can see");
}

// ---- 4. *** THE THREE-WAY: NEITHER GPU IS THE ANSWER KEY *** ---------------------------------------------------
{
    let gw = 0;
    for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++)
        gw = Math.max(gw, Math.abs(glslVals[k][i] - wgslVals[i * 3 + k]));
    say(`GLSL vs WGSL: worst |diff| = ${gw.toExponential(3)}`);
    ok("!! the two shader languages agree with EACH OTHER, and with the JS, and all three at the floor",
        gw < floorSigned,
        "v4479's rule: two backends that agree with each other and disagree with the arithmetic are BOTH wrong, " +
        "and a check comparing only the two would call that a pass. The JS is the reference and it is third");

    // The comparison has to be capable of failing: perturb the reference and watch the margin move.
    let bent = 0;
    for (let i = 0; i < N; i++) bent = Math.max(bent, Math.abs(wgslVals[i * 3] - cpu[i][0] * 1.000001));
    ok("CONTROL: a reference bent by one part in a million is REJECTED at this resolution",
        bent > floorSigned * 4,
        `a 1e-6 relative bend reads ${bent.toExponential(2)}, ${(bent / floorSigned).toFixed(0)}x the floor. ` +
        "At 8 bits that bend would have been invisible, which is what made this round about the instrument");
}

// ---- 5. *** THE CONTROL FOR THE METHODOLOGY: A TEST POINT COMPUTED TWICE TESTS WHATEVER COMPUTED IT *** ---------
{
    const w = await runWgslCompute({ code: `
@group(0) @binding(0) var<storage, read_write> out_: array<f32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x; if (i >= ${N}u) { return; }
  let a = f32(i) * 2.399963229728653;
  let r = 0.05 + (f32(i) / ${N}.0) * 6.0;
  out_[i*2u+0u] = r * cos(a); out_[i*2u+1u] = r * sin(a);
}`, outCount: N * 2, workgroups: 1 });
    const fr = Math.fround;
    let worstTrig = 0;
    for (let i = 0; i < N; i++) {
        const a = fr(fr(i) * fr(2.399963229728653)), r = fr(fr(0.05) + fr(fr(fr(i) / fr(N)) * fr(6)));
        worstTrig = Math.max(worstTrig, Math.abs(w.values[i * 2] - fr(r * fr(Math.cos(a)))),
                                        Math.abs(w.values[i * 2 + 1] - fr(r * fr(Math.sin(a)))));
    }
    say(`the same spiral built by the driver's trig and by V8's: worst |diff| = ${worstTrig.toExponential(3)} = ${(worstTrig / ULP).toFixed(0)} ulp`);
    ok("!! *** THE DRIVER'S sin/cos AND V8's DISAGREE BY HUNDREDS OF ULP, WHICH IS WHY THE POINTS ARE A LATTICE ***",
        worstTrig > 50 * ULP,
        "the first probe of this round generated its spiral separately on each side and read a 1.839e-4 " +
        "WGSL-vs-CPU difference -- fifteen hundred ulp, which it would have reported as the projection " +
        "disagreeing. It was the trig. A methodology choice whose cost nobody measured is a coincidence");

    const src = fs.readFileSync(path.join(ENG, "tools", "ship", "stereoDevice-selfcheck.mjs"), "utf8");
    const latticeDefs = src.slice(src.indexOf("const LAT_GLSL"), src.indexOf("const cpu ="));
    ok("...and the lattice this gate actually grades on contains no transcendental at all",
        !/\b(sin|cos|tan|exp|log|pow|sqrt)\s*\(/.test(latticeDefs) && /mod\(i, 8\.0\)/.test(latticeDefs),
        "mod, floor, subtract and multiply -- every value exactly representable, so both sides start from " +
        "identical bits and the difference that remains is the projection's");
}

// ---- 6. THE SHADERS ARE THE SHIPPED ONES, AND THE FILE NOW BEARS BOTH LANGUAGES ---------------------------------
{
    const stereo = fs.readFileSync(path.join(ENG, "render", "stereographic.js"), "utf8");
    ok("both emitters live in render/stereographic.js and this gate calls them rather than retyping",
        typeof St.stereoGLSL === "function" && typeof St.stereoWGSL === "function" &&
        /export function stereoWGSL/.test(stereo) && /export function stereoGLSL/.test(stereo),
        "the shader text graded above came out of the shipping module at run time");
    const w = St.stereoWGSL(), g = St.stereoGLSL();
    ok("!! the two texts are NOT asserted to match -- #118's rule -- and they genuinely do not",
        w !== g && /vec3<f32>/.test(w) && !/vec3<f32>/.test(g) && /fn stereoUnproject/.test(w) && /vec3 stereoUnproject/.test(g),
        "WGSL and GLSL spell the same arithmetic differently, so a text comparison would fail on correct code " +
        "and pass on a shared typo. Sections 2 to 4 compare what they COMPUTE");
    // *** THIS ROW WENT ZERO-RED AND THE REASON IS A SUBSTRING. *** Its first draft asserted
    // `["stereoProject", "stereoUnproject"].every((f) => w.includes(f))`, and a sabotage that renamed the
    // WGSL entry point to stereoProjectXX PASSED IT -- because "stereoProjectXX" contains "stereoProject".
    // A name check that a longer name satisfies is v4480's family again: text where behaviour was meant.
    // So the driver is asked instead. This module CALLS both entry points; if either is renamed or missing,
    // WGSL compilation fails and the row goes red for the right reason.
    const callBoth = await runWgslCompute({ compileOnly: true, outCount: 0, code: `
${w}
@compute @workgroup_size(1) fn main() {
  let a = stereoProject(vec3<f32>(0.3, 0.4, -0.5));
  let b = stereoUnproject(a);
  _ = b.x;
}` });
    ok("!! ...and both WGSL entry points EXIST BY THE NAMES A CALLER USES -- compiled, not grepped",
        callBoth.ok && !callBoth.skipped,
        callBoth.ok
            ? "a module calling stereoProject and stereoUnproject compiles on the driver"
            : "compilation failed: " + ((callBoth.errors || []).join("; ") || callBoth.reason));
    ok("...and the GLSL side declares the same pair, in GLSL's spelling",
        /vec2 stereoProject\(vec3 /.test(g) && /vec3 stereoUnproject\(vec2 /.test(g),
        "a WGSL emitter missing the forward projection would pass every value check above, which only " +
        "exercises the inverse");
}

console.log("stereoDevice-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
