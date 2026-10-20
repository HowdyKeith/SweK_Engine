// WebGLEngine/tools/ship/emitterCompile-selfcheck.mjs -- v4487
//
// Run: node tools/ship/emitterCompile-selfcheck.mjs
//
// Hands v4486's fourteen emitters to a real driver and grades render/emitterCompile.mjs against what comes back.
//
// *** THIS GATE LAUNCHES A BROWSER AND IS SLOW ON PURPOSE. *** v4486 counted shader text without running a
// line of it, which is a census of STRINGS. Nine rows compile here for real -- eleven programs, nine GLSL
// through WebGL2 and two WGSL through WebGPU -- and two of those are compared BY VALUE against their JS twins.
//
// *** SECTION 3 REPRODUCES A DEFECT THIS ROUND FIXED, USING THE BROKEN EXPRESSION AS A FIXTURE. *** fx/dither.js
// shipped a GLSL and a WGSL that its own header calls one function of one array. The 64 constants were indeed
// one array. The wrap around them was written once per language and the WGSL used `%`, which in WGSL keeps the
// dividend's sign -- so at a negative coordinate the two shaders differed by 0.984375, the whole span of the
// offset, at every one of 192 probe points. A fix whose defect can no longer be demonstrated is a claim, so
// the old expression is still driven here, beside the new one, on the same device.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "../../render/emitterCompile.mjs";
import { HAND_VERIFIED } from "../../render/shaderEmitters.mjs";
import { renderGlslToPixels, runWgslCompute, webgpuSkipReason } from "./webgpuHarness.mjs";
import { PACK24_GLSL, unpack24Signed, PACK24_FLOOR_SIGNED } from "./glslFloatPack.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => fs.readFileSync(path.join(ENG, ...p), "utf8");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

// *** THE ATTRIBUTELESS VERTEX SHADER, AND THE REASON THIS FILE HAS ONE AT THE TOP. *** webgpuHarness binds an
// EMPTY vertex array and draws three vertices, so a vertex shader that reads an attribute collapses to a
// degenerate triangle and the frame comes back BLACK with ok:true. Its header has said so since v4284. This
// round wrote `in vec2 aPos` anyway and spent three probes blaming a shader for a frame that never drew.
const VS = `#version 300 es
out vec2 vUv;
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const R = (...p) => "../../" + p.join("/");
const dither = await import(R("fx", "dither.js"));
const vorton = await import(R("fx", "vorton", "vortonNebula.js"));
const holo = await import(R("render", "holoFoilShader.js"));
const panini = await import(R("render", "panini.js"));
const parallax = await import(R("render", "parallaxOcclusion.js"));
const ashima = await import(R("shaders", "ashimaNoise.js"));
const { NeuralRadianceCache } = await import(R("engine", "NeuralRadianceCache.js"));

const skip = webgpuSkipReason();

// ---- 1. *** THE CENSUS COVERS THE SAME POPULATION v4486 COUNTED, ROW FOR ROW *** ------------------------------
{
    const emitters = HAND_VERIFIED.filter((h) => h.kind === "emitter").map((h) => h.file);
    const rows = C.ROWS.map((r) => r.file);
    ok("*** every emitter v4486 found has a row here, and there are no extras ***",
        emitters.length === rows.length && emitters.every((f, i) => rows[i] === f),
        `${rows.length} rows against ${emitters.length} emitters, same order -- a compile census that quietly ` +
        "dropped a row would report a perfect score over a smaller tree");
    const E = C.EVIDENCE, n = (v) => C.ROWS.filter((r) => r.evidence === v).length;
    ok("...and the recorded totals are what the rows actually say",
        n(E.COMPILED) + n(E.GRADED) === C.MEASURED_AT_V4487.compiledHere &&
        n(E.GRADED) === C.MEASURED_AT_V4487.gradedHere &&
        n(E.ELSEWHERE) === C.MEASURED_AT_V4487.receiptElsewhere &&
        n(E.NONE) === C.MEASURED_AT_V4487.notAShader &&
        C.ROWS.length === C.MEASURED_AT_V4487.rows,
        `compiled ${n(E.COMPILED)} + graded ${n(E.GRADED)}, elsewhere ${n(E.ELSEWHERE)}, not-a-shader ${n(E.NONE)}`);
    ok("...and the program count is derived from the rows' languages, not typed beside them",
        C.ROWS.filter((r) => r.evidence === E.COMPILED || r.evidence === E.GRADED)
              .reduce((a, r) => a + r.langs.length, 0) === C.MEASURED_AT_V4487.programsCompiled,
        `${C.MEASURED_AT_V4487.programsCompiled} programs from ${C.MEASURED_AT_V4487.compiledHere} rows -- ` +
        "dither and vorton each ship a pair");
    // *** A ROW WITH NO DEVICE EVIDENCE MUST SAY WHY, OR IT IS A SKIP WEARING A PASS. ***
    ok("!! every row without its own compile carries a reason, and the two kinds are not merged",
        C.ROWS.filter((r) => r.evidence === E.ELSEWHERE || r.evidence === E.NONE)
              .every((r) => typeof r.note === "string" && r.note.length > 30),
        "'another gate owns this' and 'this is not a shader' are different sentences and are stored as such");
}

// ---- 2. *** NINE ROWS, ELEVEN PROGRAMS, ON A REAL DRIVER *** --------------------------------------------------
const nrc = Object.create(NeuralRadianceCache.prototype);
nrc.dims = [8, 16, 16, 3]; nrc.activations = ["relu", "relu", "sigmoid"]; nrc._buildWeights();

const GLSL_CASES = [
    ["engine/NeuralRadianceCache.js", "", nrc.getShaderGLSL(),
     "float i8[8]; for(int i=0;i<8;i++) i8[i] = vUv.x; float o3[3]; nrcEvaluate(i8, o3);\n" +
     "  fragColor = vec4(o3[0], o3[1], o3[2], 1.0);"],
    ["fx/dither.js", "", dither.DITHER_GLSL,
     "fragColor = vec4(ditherQuantize(vec3(vUv, 0.5), gl_FragCoord.xy, 4.0), 1.0);"],
    ["fx/vorton/vortonNebula.js", `uniform vec3 uVortons[${vorton.NV}]; uniform float uSig2;`, vorton.SWIRL_GLSL,
     "fragColor = vec4(vortonSwirl(vUv), 0.0, 1.0);"],
    // *** THE ONLY COMPILE ERROR OF THE ROUND WAS HERE, AND IT WAS THE CALL SITE. *** The first probe wrote
    // holoFoil(vUv, normal, 1.0) against a signature of (vec3 base, float ci, vec2 uvSurf) and the driver
    // said "no matching overloaded function found". The shader was right; the caller was not.
    ["render/holoFoilShader.js", "", holo.HOLO_GLSL, "fragColor = vec4(holoFoil(vec3(0.5), 0.7, vUv), 1.0);"],
    ["render/panini.js", "", panini.paniniGLSL(),
     "fragColor = vec4(paniniProject(vec3(vUv, -1.0), 1.0), 0.0, 1.0);"],
    ["render/parallaxOcclusion.js", "uniform sampler2D uHeightMap;", parallax.PARALLAX_GLSL,
     "fragColor = vec4(parallaxUV(vUv, vec3(0.1, 0.1, 1.0), 0.05, 8), 0.0, 1.0);"],
    ["shaders/ashimaNoise.js", "", ashima.NOISE_COMMON.join("\n") + "\n" + ashima.SNOISE3.join("\n"),
     "fragColor = vec4(vec3(snoise(vec3(vUv, 0.0))), 1.0);"],
];

if (skip) { say("SKIPPED, no device: " + skip); }
else {
    console.log("\n2. NINE ROWS ON A REAL DRIVER -- COMPILE AND LINK, WHICH IS NOT CORRECTNESS");
    const seen = new Map();
    for (const [file, decls, body, call] of GLSL_CASES) {
        const fragment = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
${decls}
${body}
void main(){ ${call} }`;
        const r = await renderGlslToPixels({ vertex: VS, fragment, width: 8, height: 8 });
        seen.set(file, r);
        ok(file + " compiles and links as GLSL ES 3.00",
            r.ok === true && !r.error, r.ok ? "distinct colours " + r.distinctColours
                                            : String(r.error || r.reason).replace(/\s+/g, " ").slice(0, 180));
    }
    // The two ES 1.00 rows: a whole fragment shader in a .js file, and a vertex shader that wants an attribute.
    {
        const vsrc = (read("render", "transitionPass.js").match(/`([^`]*gl_Position[^`]*)`/) || [])[1];
        ok("render/transitionPass.js's vertex shader is found in the file's own source",
            typeof vsrc === "string" && /attribute/.test(vsrc),
            "a module-private const, which is why v4486 classified the file by its BODY and not a preamble");
        const r = await renderGlslToPixels({ vertex: vsrc,
            fragment: "precision mediump float;\nvarying vec2 vUv;\nvoid main(){ gl_FragColor = vec4(vUv, 0.0, 1.0); }",
            width: 8, height: 8 });
        ok("...and it compiles and links as GLSL ES 1.00", r.ok === true && !r.error,
            String(r.error || ("distinct " + r.distinctColours)).slice(0, 120));
        // *** AND IT DRAWS NOTHING, WHICH IS CORRECT AND IS ASSERTED RATHER THAN LEFT TO LOOK LIKE A PASS. ***
        ok("!! ...and draws ONE colour, because it reads an attribute the attributeless harness cannot feed",
            r.ok && r.distinctColours === 1,
            "the v4284 trap, stated as the expectation: a black frame here is the harness, not the shader");
        const v = await renderGlslToPixels({ vertex: vsrc.replace("aPos * 0.5 + 0.5", "vec2(0.5)"),
            fragment: "precision mediump float;\nvarying vec2 vUv;\nvoid main(){ gl_FragColor = vec4(vUv, 0.0, 1.0); }",
            width: 8, height: 8 });
        ok("!! ...and the control says the harness CAN draw: nothing here is measuring a dead frame",
            v.ok === true, "same shader, gl_Position still attribute-driven, so still one colour: " +
            (v.ok ? v.distinctColours : "ERR"));
    }
    {
        // ES 1.00 has no gl_VertexID, so this one cannot be fed attributelessly either -- it compiles and
        // links and draws nothing, for the same structural reason as transitionPass above.
        const r = await renderGlslToPixels({
            vertex: "attribute vec2 aPos; varying vec3 vNormal; varying vec2 vUV; varying float vMaterial;\n" +
                    "void main(){ vNormal = vec3(0.0, 1.0, 0.0); vUV = aPos; vMaterial = 0.0;\n" +
                    "  gl_Position = vec4(aPos, 0.0, 1.0); }",
            fragment: read("shaders", "voxel.frag.js"), width: 8, height: 8 });
        ok("shaders/voxel.frag.js compiles and links -- the whole file, which is GLSL and not JavaScript",
            r.ok === true && !r.error,
            r.ok ? "distinct " + r.distinctColours : String(r.error || r.reason).replace(/\s+/g, " ").slice(0, 180));
    }
    // The two WGSL rows.
    for (const [file, body] of [["fx/dither.js", dither.DITHER_WGSL], ["fx/vorton/vortonNebula.js", vorton.SWIRL_WGSL]]) {
        const code = body + `
@group(0) @binding(0) var<storage, read_write> out: array<f32>;
@compute @workgroup_size(1) fn main() { out[0] = 1.0; }`;
        const r = await runWgslCompute({ code, outCount: 1, compileOnly: true });
        ok(file + " compiles as WGSL on a WebGPU device", r.ok === true,
            String(r.error || r.reason || "").replace(/\s+/g, " ").slice(0, 180));
    }

    // The census's recorded distinct-colour counts are receipts, so they are checked against this run.
    // *** THE FIRST DRAFT OF THIS ROW READ vorton's 64 OFF SECTION 4 AND CHECKED IT AGAINST SECTION 2. ***
    // Section 4 binds the vorton uniforms and gets 64 colours; section 2 binds nothing and gets one. Same
    // shader, two runs, and a receipt that names neither is a receipt for whichever run the reader assumes.
    //
    // *** AND THE SECOND DRAFT TYPED THE EXPECTATIONS OUT BESIDE THE RECORD INSTEAD OF READING THEM FROM IT, ***
    // so a sabotage that changed the row's `distinct` field cost zero red: the record was decoration and this
    // row was checking a copy of it. The expectations come from C.ROWS now, which is the thing being graded.
    const check = C.ROWS.filter((r) => typeof r.distinct === "number" && seen.has(r.file))
                        .map((r) => [r.file, r.distinct]);
    ok("...and the recorded distinct-colour counts are what this run produced",
        check.length >= 5 && check.every(([f, n]) => seen.get(f).distinctColours === n),
        check.map(([f, n]) => f.split("/").pop() + " " + (seen.get(f) || {}).distinctColours + "/" + n).join(", "));
    ok("!! ...and the rows that legitimately draw ONE colour are recorded as expecting one",
        C.ROWS.filter((r) => r.distinct === 1).every((r) => /flat|black|attribute|uniform/i.test(r.note || "")),
        "an unbound uniform and a genuinely flat output both give one colour; so does a frame that never drew, " +
        "and the difference is a sentence, so every such row carries one");
}

// ---- 3. *** THE THREE-WAY, AND THE DEFECT DRIVEN BESIDE ITS FIX *** -------------------------------------------
if (skip) { say("SKIPPED, no device: " + skip); }
else {
    console.log("\n3. fx/dither.js: THREE IMPLEMENTATIONS OF ONE FUNCTION, COMPARED BY VALUE");
    const W = C.DITHER_THREE_WAY.grid, cx = (i) => i - W / 2 + 0.5;
    const pts = [];
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) pts.push([cx(x), cx(y)]);

    const fragment = `#version 300 es
precision highp float;
out vec4 fragColor;
${dither.DITHER_GLSL}
${PACK24_GLSL}
void main(){ vec2 c = floor(gl_FragCoord.xy) - ${(W / 2).toFixed(1)} + 0.5;
  fragColor = pack24(ditherOffset(c) * 0.5 + 0.5); }`;
    const g = await renderGlslToPixels({ vertex: VS, fragment, width: W, height: W });
    ok("the GLSL half runs and the frame is not a dead one",
        g.ok === true && g.distinctColours > 1, "distinct colours " + (g.ok ? g.distinctColours : "ERR"));

    const wgslRun = async (body) => {
        const code = body + `
@group(0) @binding(0) var<storage, read_write> out: array<f32>;
@compute @workgroup_size(1) fn main() {
  var p = array<vec2f, ${pts.length}>(${pts.map(([x, y]) => `vec2f(${x}, ${y})`).join(", ")});
  for (var i: i32 = 0; i < ${pts.length}; i = i + 1) { out[i] = ditherOffset(p[i]); } }`;
        return runWgslCompute({ code, outCount: pts.length });
    };
    const w = await wgslRun(dither.DITHER_WGSL);
    // *** THE DEFECT, KEPT AS A FIXTURE. *** The shipped wrap floors; this is what it used to be.
    const BROKEN = dither.DITHER_WGSL
        .replace("let x = i32(fragCoord.x - DITHER_N * floor(fragCoord.x / DITHER_N));", "let x = i32(fragCoord.x % DITHER_N);")
        .replace("let y = i32(fragCoord.y - DITHER_N * floor(fragCoord.y / DITHER_N));", "let y = i32(fragCoord.y % DITHER_N);");
    ok("!! the pre-fix expression is reconstructed from the shipped source, not retyped beside it",
        BROKEN !== dither.DITHER_WGSL && /%\s*DITHER_N/.test(BROKEN) && !/%\s*DITHER_N/.test(dither.DITHER_WGSL),
        "if the shipped wrap is ever rewritten this substitution stops biting and the row below goes red");
    const b = await wgslRun(BROKEN);

    const stat = (pick) => {
        let pos = 0, neg = 0, negDiffer = 0;
        for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x;
            const d = Math.abs(pick(i, (W - 1 - y) * W + x));
            if (cx(x) < 0 || cx(y) < 0) { neg = Math.max(neg, d); if (d > PACK24_FLOOR_SIGNED) negDiffer++; }
            else pos = Math.max(pos, d);
        }
        return { pos, neg, negDiffer };
    };
    const js = (i) => dither.bayerOffset(Math.floor(cx(i % W)), Math.floor(cx(Math.floor(i / W))));
    const gl = (row) => unpack24Signed(g.pixels, row, 1);

    const T = C.DITHER_THREE_WAY;
    const sWJ = stat((i) => w.values[i] - js(i));
    const sGJ = stat((i, row) => gl(row) - js(i));
    const sBJ = stat((i) => b.values[i] - js(i));
    const sBG = stat((i, row) => b.values[i] - gl(row));

    say(`${pts.length} probe points from ${T.coordFrom} to ${T.coordTo}; ${T.negativeSamples} have a negative coordinate`);
    ok("*** the GLSL agrees with the JS EVERYWHERE, negative coordinates included ***",
        sGJ.pos <= T.transportFloor && sGJ.neg <= T.transportFloor,
        `worst ${Math.max(sGJ.pos, sGJ.neg).toExponential(3)} against the pack24 floor ${PACK24_FLOOR_SIGNED} ` +
        "-- GLSL's mod() floors, which is what the JS wrap does");
    ok("*** and the fixed WGSL now agrees EXACTLY, at every one of the 256 points ***",
        sWJ.pos === 0 && sWJ.neg === 0 && sWJ.negDiffer === 0 && T.after.wgslVsJs === 0,
        "f32 out of a storage buffer, so there is no transport floor on this side at all");
    ok("*** and the PRE-FIX expression, on the same device, is off by the full span of the offset ***",
        Math.abs(sBJ.neg - T.before.wgslVsJs) < 1e-9 && sBJ.pos === 0 &&
        sBJ.negDiffer === T.before.disagreeing && T.before.disagreeing === T.negativeSamples,
        `${sBJ.neg} at ${sBJ.negDiffer} of ${T.negativeSamples} negative points, and EXACTLY 0 at the other ` +
        `${pts.length - T.negativeSamples} -- which is why nothing on screen was ever wrong`);
    ok("!! ...so the two shaders that a header calls one function were as far apart as the function can be",
        Math.abs(sBG.neg - T.before.glslVsWgsl) < 1e-6 && Math.abs(T.before.glslVsWgsl - 63 / 64) < 1e-9,
        `0.984375 is 63/64: the offset runs from -0.4921875 to +0.4921875, so this is its whole range`);
    ok("!! ...and the divergence was LATENT, which the record states rather than dropping",
        T.reachable === false && /never negative/.test(T.reachability) &&
        /@builtin\(position\)/.test(read("fx", "wormhole", "wormholeNebula.js").slice(0, 20000) + read("fx", "wormhole", "wormholeNebula.js")),
        "both call sites pass a fragment coordinate; the finding is a public function two backends may call, " +
        "not a picture that was wrong");
}

// ---- 4. *** THE CONTROL: THE OTHER DUAL-LANGUAGE EMITTER, SAME METHOD, AND IT AGREES *** ----------------------
if (skip) { say("SKIPPED, no device: " + skip); }
else {
    console.log("\n4. fx/vorton: THE CONTROL, BECAUSE ONE DISAGREEING PAIR IS ALSO WHAT A BROKEN METHOD LOOKS LIKE");
    const NV = vorton.NV, sigma = 0.35, sig2 = sigma * sigma;
    const vt = [];
    for (let i = 0; i < NV; i++) vt.push({ x: (i % 4) * 0.4 - 0.6, y: Math.floor(i / 4) * 0.5 - 0.5, s: (i % 3) - 1 + 0.25 });
    const N = 8, pts = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push([i / 4 - 1, j / 4 - 1]);
    // v4483's rule: a test point computed with trig measures the trig library, so the lattice has none.
    ok("!! the probe lattice and the vorton set contain no transcendental -- v4483's rule, restated here",
        pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) &&
        !/Math\.(sin|cos|tan|exp|log)/.test(
            read("tools", "ship", "emitterCompile-selfcheck.mjs").split("4. ***")[1] || "x"),
        "a point computed twice is a test of whatever computed it");

    const w = await runWgslCompute({ outCount: pts.length * 2, code: vorton.SWIRL_WGSL + `
@group(0) @binding(0) var<storage, read_write> out: array<f32>;
@compute @workgroup_size(1) fn main() {
  var vt = array<vec3f, ${NV}>(${vt.map((v) => `vec3f(${v.x}, ${v.y}, ${v.s})`).join(", ")});
  var p = array<vec2f, ${pts.length}>(${pts.map(([x, y]) => `vec2f(${x}, ${y})`).join(", ")});
  for (var i: i32 = 0; i < ${pts.length}; i = i + 1) {
    let s = vortonSwirl(p[i], &vt, ${sig2});
    out[i * 2] = s.x; out[i * 2 + 1] = s.y; } }` });
    const g = await renderGlslToPixels({ vertex: VS, width: N, height: N,
        uniformNames: ["uSig2"], uniforms: [sig2],
        uniformArrays: { uVortons: { stride: 3, data: vt.flatMap((v) => [v.x, v.y, v.s]) } },
        fragment: `#version 300 es
precision highp float;
uniform vec3 uVortons[${NV}]; uniform float uSig2;
out vec4 fragColor;
${vorton.SWIRL_GLSL}
${PACK24_GLSL}
void main(){ vec2 c = floor(gl_FragCoord.xy);
  fragColor = pack24(vortonSwirl(vec2(c.x / 4.0 - 1.0, c.y / 4.0 - 1.0)).x * 0.25 + 0.5); }` });
    ok("every uniform the control needs actually bound -- an unbound one reads zero and looks like agreement",
        g.ok === true && Array.isArray(g.unresolved) && g.unresolved.length === 0,
        "unresolved: " + JSON.stringify((g || {}).unresolved));

    let mWJ = 0, mGJ = 0, mGW = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = j * N + i, [px, py] = pts[k];
        const ref = vorton.swirlOffset(px, py, vt, sigma)[0];
        const wg = w.values[k * 2], gl = unpack24Signed(g.pixels, (N - 1 - j) * N + i, 2);
        mWJ = Math.max(mWJ, Math.abs(wg - ref));
        mGJ = Math.max(mGJ, Math.abs(gl - ref));
        mGW = Math.max(mGW, Math.abs(gl - wg));
    }
    const S = C.SWIRL_THREE_WAY, floor = PACK24_FLOOR_SIGNED * 2;
    // *** THE RECORDED NUMBERS ARE GRADED AGAINST THIS RUN, NOT JUST THE FLOOR. *** A first draft asserted
    // only that the live values cleared the floor, so the three figures in SWIRL_THREE_WAY were decoration:
    // a sabotage that quadrupled one of them cost zero red. The band is loose enough for a driver to differ
    // and tight enough that a fabricated figure cannot hide inside it.
    const near = (a, b) => a <= b * 1.5 && a >= b / 1.5;
    ok("!! the recorded control figures are what this run measured, not numbers typed beside it",
        near(mWJ, S.wgslVsJs) && near(mGJ, S.glslVsJs) && near(mGW, S.glslVsWgsl),
        `recorded ${S.wgslVsJs.toExponential(3)}/${S.glslVsJs.toExponential(3)}/${S.glslVsWgsl.toExponential(3)}, ` +
        `measured ${mWJ.toExponential(3)}/${mGJ.toExponential(3)}/${mGW.toExponential(3)}`);
    ok("*** the OTHER dual-language pair agrees, on the same harness and the same packer ***",
        mWJ <= floor && mGJ <= floor && mGW <= floor && Math.abs(S.transportFloor - floor) < 1e-9,
        `WGSL-JS ${mWJ.toExponential(3)}, GLSL-JS ${mGJ.toExponential(3)}, GLSL-WGSL ${mGW.toExponential(3)}, ` +
        `floor ${floor.toExponential(3)} -- so the dither number is dither's, not the method's`);
    ok("!! ...and this control can still fail: a reference bent by one part in ten thousand clears the floor",
        Math.abs(vorton.swirlOffset(pts[5][0], pts[5][1], vt, sigma)[0] * 1.0001 -
                 vorton.swirlOffset(pts[5][0], pts[5][1], vt, sigma)[0]) > floor,
        "a tolerance nothing can breach is not a tolerance");
}

// ---- 5. *** WHAT COMPILING DOES NOT SAY *** -------------------------------------------------------------------
{
    const E = C.EVIDENCE;
    const graded = C.ROWS.filter((r) => r.evidence === E.GRADED || r.evidence === E.ELSEWHERE).length;
    ok("*** the record separates a COMPILE RECEIPT from a VALUE GRADE, and most rows are receipts ***",
        C.ROWS.filter((r) => r.evidence === E.COMPILED).length > C.ROWS.filter((r) => r.evidence === E.GRADED).length,
        `${C.ROWS.filter((r) => r.evidence === E.COMPILED).length} rows say only 'a driver accepted this'. ` +
        "backendParity's own footer says the same of its count: it cannot tell a correct shader from a broken one");
    ok("...and the file says so where a reader will hit it, not only in a field name",
        /COMPILING IS NOT CORRECTNESS/.test(read("render", "emitterCompile.mjs")),
        `${graded} of ${C.ROWS.length} rows carry a value grade, here or in another gate`);
}

console.log("\nemitterCompile-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
