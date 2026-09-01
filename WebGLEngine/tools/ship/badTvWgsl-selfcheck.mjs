// WebGLEngine/tools/ship/badTvWgsl-selfcheck.mjs -- v4270
//
// GRADES render/badTvWgsl.mjs BY RUNNING IT ON A GPU AND COMPARING THE NUMBERS TO render/badTvModel.mjs.
//
// *** THIS GATE EXISTS BECAUSE v4269 WAS WRONG ABOUT WHAT THIS BOX CAN DO. *** That round wrote, in its gate
// output and its changelog and this file's subject module's header, "NOTHING HERE CAN EXECUTE WGSL", and
// concluded that a WGSL port could only be checked structurally. It was never tested. Chromium serves a
// WebGPU adapter here -- google/swiftshader -- and compiles and runs WGSL, so the port is graded the way every
// other shader in this tree is graded: against an independent CPU model, numerically.
//
// The reason the claim looked true is worth more than the claim. The first probe evaluated on about:blank and
// got navigator.gpu === undefined under three different flag sets. about:blank IS NOT A SECURE CONTEXT, and
// ui/webgpuProbe.mjs has said since v3666 that "'THE BROWSER HAS NO WebGPU' AND 'THIS ORIGIN DOES NOT GET
// WebGPU' ARE TWO THINGS WEARING ONE LABEL". Served over http://127.0.0.1 the adapter appears immediately.
// The tree had the answer written down and the mistake was made anyway, which is why the harness now carries
// the origin requirement in its own name and header rather than as a remembered detail.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runWgslCompute, webgpuSkipReason, SECURE_HOST, LAUNCH_ARGS } from "./webgpuHarness.mjs";
import { SNOISE2_WGSL, BADTV_WGSL, PROBE_WGSL, FRAGMENT_WGSL, KNOB_ORDER, packKnobs } from "../../render/badTvWgsl.mjs";
import { sampleAt, offsetAt, DEFAULTS, COARSE_FREQ, FINE_FREQ, COARSE_GAIN, FINE_GAIN } from "../../render/badTvModel.mjs";
import { SNOISE2, NOISE_COMMON } from "../../shaders/ashimaNoise.js";
import { validateWgsl, parseEntryPoints } from "../../render/wgslSpec.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => {
    if (!cond) fails++;
    console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
};
const report = (s) => console.log(`  ----  ${s}`);

// *** f32 EPSILON IS 1.19e-7. THE TOLERANCE IS SET FROM THAT, NOT FROM WHAT THE RUN HAPPENED TO PRODUCE. ***
// A tolerance chosen after seeing the answer is not a test. This is two f32 ulps at magnitude 1, which is the
// most a correctly transliterated chain of adds and multiplies should drift from an f64 evaluation of the
// same expression. The run comes in around 3e-8; if a future GPU lands at 2e-7 the right response is to ask
// what changed, not to widen this.
const F32_EPS = 1.1920929e-7;
const TOL = 2 * F32_EPS;

console.log("\n1. THE CONSTANTS ARE NOT RETYPED FROM MEMORY");
{
    const glsl = [...NOISE_COMMON, ...SNOISE2].join("\n");
    // Every long float literal in the GLSL chunk must appear in the WGSL, character for character.
    const lits = [...new Set((glsl.match(/\d+\.\d{6,}/g) || []))];
    ok("the GLSL chunk has the long simplex constants to compare", lits.length >= 6, `${lits.length} found`);
    const missing = lits.filter((L) => !SNOISE2_WGSL.includes(L));
    ok("*** every long constant in the GLSL appears verbatim in the WGSL ***", missing.length === 0,
        missing.join(" ") || `${lits.length} checked: ${lits.slice(0, 3).join(", ")}...`);
    // CONTROL: the comparison must be able to fail.
    // *** THE FIRST VERSION OF THIS CONTROL WAS BROKEN AND THE GATE CAUGHT IT ON ITS FIRST RUN. *** It asserted
    // that the TRUNCATED constant "0.21132486540518" was absent -- but that string is a PREFIX of the real
    // "0.211324865405187", so includes() finds it and the control failed while the code was correct. A
    // substring test cannot detect a dropped TRAILING digit at all. So the control alters a digit instead,
    // which is a change a substring test genuinely can see.
    const wrong = lits.map((L) => L.slice(0, -1) + (L.endsWith("9") ? "8" : "9"));
    const falsePositives = wrong.filter((w) => SNOISE2_WGSL.includes(w));
    ok("CONTROL: a constant with an ALTERED digit is absent", falsePositives.length === 0,
        falsePositives.join(" ") || `${wrong.length} perturbed constants, none present`);
    ok("  and the check is a real substring test, not a no-op",
        lits.every((L) => SNOISE2_WGSL.includes(L)) && wrong.length === lits.length);

    // The effect's own numbers come from the model by interpolation, not by typing.
    ok("the WGSL interpolates COARSE_FREQ from the model", BADTV_WGSL.includes(COARSE_FREQ.toFixed(1)));
    ok("  and FINE_FREQ", BADTV_WGSL.includes(FINE_FREQ.toFixed(1)));
    ok("  and COARSE_GAIN", BADTV_WGSL.includes(String(COARSE_GAIN)));
    ok("  and FINE_GAIN", BADTV_WGSL.includes(String(FINE_GAIN)));
    ok("*** and the cube is written as the original wrote it, not simplified ***",
        /offset \* k\.distortion \* offset \* k\.distortion \* offset/.test(BADTV_WGSL),
        "offset^3 * distortion^2 -- badTvPass.js records that feeding snoise3 here would multiply the tear by ~64");
    report("badTvPass.js's GLSL is built from the model's constants for the same reason: 'a second " +
        "hand-written 0.2 or 50.0 is how a port drifts'. The WGSL now follows that rule and the check enforces it.");
}

console.log("\n2. WGSL THE LANGUAGE DIFFERENCES THAT COULD SILENTLY CHANGE THE PICTURE");
{
    ok("no user-function overloading: mod289 is split by arity",
        SNOISE2_WGSL.includes("mod289_3") && SNOISE2_WGSL.includes("mod289_4") &&
        !/fn mod289\(/.test(SNOISE2_WGSL), "WGSL cannot overload, so merging these back would not compile");
    ok("no swizzle assignment: x12 is rebuilt rather than partially assigned",
        !/x12\.xy\s*[-+]?=/.test(SNOISE2_WGSL) && /x12 = vec4f\(x12\.xy - i1, x12\.zw\)/.test(SNOISE2_WGSL));
    ok("*** select() is used with the FALSE case first ***",
        /select\(vec2f\(0\.0, 1\.0\), vec2f\(1\.0, 0\.0\), x0\.x > x0\.y\)/.test(SNOISE2_WGSL),
        "GLSL's ternary is (cond ? true : false); select is (false, true, cond) -- reversing it inverts the corner");
    // The GLSL says exactly that, and the two must agree about which corner is which.
    ok("  and it matches the GLSL ternary it replaces",
        /\(x0\.x > x0\.y\) \? vec2\(1\.0, 0\.0\) : vec2\(0\.0, 1\.0\)/.test(SNOISE2.join("\n")),
        "GLSL picks (1,0) when x0.x > x0.y; select's third argument is that same condition with (1,0) as its TRUE value");
    report("this is the check that cannot be done by eye: a reversed select still produces noise, still " +
        "tears the picture, and is a different function.");
}

console.log("\n3. THE SHIPPING SHADER, PARSED AND THEN COMPILED BY A REAL DRIVER");
{
    // validateWgsl returns an ARRAY of problems -- empty means clean. (Assumed an {errors} object first; the
    // gate threw on the very first run rather than silently reading undefined as zero.)
    const v = validateWgsl(FRAGMENT_WGSL);
    ok("wgslSpec accepts the fragment shader", Array.isArray(v) && v.length === 0,
        Array.isArray(v) ? (v.join(" | ") || "0 problems") : "validateWgsl did not return an array");
    const vp = validateWgsl(PROBE_WGSL);
    ok("  and the probe shader", Array.isArray(vp) && vp.length === 0, (vp || []).join(" | ") || "0 problems");
    const eps = parseEntryPoints(FRAGMENT_WGSL);
    const stages = eps.map((e) => e.stage).sort();
    ok("it declares a vertex and a fragment entry", stages.includes("vertex") && stages.includes("fragment"),
        stages.join(","));
    ok("  named vs and fs, which is what gfx/device.js defaults to",
        eps.some((e) => e.name === "vs") && eps.some((e) => e.name === "fs"),
        "device.js reads d.vs || 'vs' and d.fs || 'fs'");
    ok("the probe shader declares a compute entry",
        parseEntryPoints(PROBE_WGSL).some((e) => e.stage === "compute"));
    report("wgslSpec PARSES WGSL; it does not compile it. Section 4 hands both to a driver, which is the only " +
        "thing that can actually reject a shader.");
}

console.log("\n4. RUN IT ON A GPU");
{
    const skip = webgpuSkipReason();
    if (skip) {
        console.log(`  SKIP  no WebGPU available here: ${skip}`);
        report("*** THIS IS THE ONE SKIP THAT MUST NEVER BE READ AS A PASS. *** Sections 1-3 check text and " +
            "structure; only this one checks that the shader COMPUTES the right thing. If it is skipping, the " +
            "port is unverified, whatever the summary line says.");
    } else {
        console.log(`        serving over ${SECURE_HOST} with ${LAUNCH_ARGS.join(" ")} -- NOT about:blank`);
        const rows = 32, time = 1.5;
        const r = await runWgslCompute({ code: PROBE_WGSL, entryPoint: "probe", outCount: rows * 2,
                                         uniforms: packKnobs({ time, rows }), workgroups: 1 });
        ok("the probe compiled and ran", r.ok, r.ok ? `adapter: ${r.adapter.vendor}/${r.adapter.architecture}`
                                                    : `${r.reason} ${(r.errors || []).join(" | ")}`);
        if (r.ok) {
            let worstU = 0, worstV = 0, worstRow = -1;
            for (let i = 0; i < rows; i++) {
                const [cu, cv] = sampleAt(0.5, i / rows, time);
                const du = Math.abs(r.values[i * 2] - cu), dv = Math.abs(r.values[i * 2 + 1] - cv);
                if (du > worstU) { worstU = du; worstRow = i; }
                if (dv > worstV) worstV = dv;
            }
            ok(`*** GPU agrees with badTvModel.sampleAt within ${TOL.toExponential(2)} ***`,
                worstU < TOL && worstV < TOL,
                `worst u ${worstU.toExponential(3)} (row ${worstRow}), worst v ${worstV.toExponential(3)}`);
            // *** A TOLERANCE TEST PASSES TRIVIALLY IF THE VALUES ARE ALL THE SAME. *** The effect must vary.
            const us = r.values.filter((_, i) => i % 2 === 0);
            const spread = Math.max(...us) - Math.min(...us);
            ok("CONTROL: the sampled u actually VARIES across rows", spread > 1e-3,
                `spread ${spread.toExponential(3)} -- a constant output would pass the tolerance check above`);
            // And it must vary the way the model says, not merely vary.
            const cpuUs = Array.from({ length: rows }, (_, i) => sampleAt(0.5, i / rows, time)[0]);
            const cpuSpread = Math.max(...cpuUs) - Math.min(...cpuUs);
            ok("  and by the same amount the model does", Math.abs(spread - cpuSpread) < TOL,
                `gpu ${spread.toFixed(8)} vs cpu ${cpuSpread.toFixed(8)}`);
            // A second time, so the check is not accidentally passing on one lucky frame.
            const r2 = await runWgslCompute({ code: PROBE_WGSL, entryPoint: "probe", outCount: rows * 2,
                                              uniforms: packKnobs({ time: 4.25, rows }), workgroups: 1 });
            let worst2 = 0;
            if (r2.ok) for (let i = 0; i < rows; i++) {
                worst2 = Math.max(worst2, Math.abs(r2.values[i * 2] - sampleAt(0.5, i / rows, 4.25)[0]));
            }
            ok("  and at a second time value", r2.ok && worst2 < TOL, `worst ${worst2.toExponential(3)} at t=4.25`);
            ok("  and the two times DISAGREE with each other, so time is really read",
                r2.ok && Math.abs(r2.values[2] - r.values[2]) > 1e-4,
                "a shader ignoring the uniform would match the model at t=0 and nowhere else");
        }
        const fr = await runWgslCompute({ code: FRAGMENT_WGSL, compileOnly: true, outCount: 0 });
        ok("*** and the SHIPPING fragment shader compiles on a real driver ***", fr.ok,
            fr.ok ? "vs + fs, texture + sampler bindings accepted" : `${fr.reason} ${(fr.errors || []).join(" | ")}`);
    }
}

console.log("\n5. THE v4269 CLAIM THIS ROUND WITHDREW");
{
    const bp = fs.readFileSync(path.join(ENG, "render/backendParity.mjs"), "utf8");
    const gate = fs.readFileSync(path.join(ENG, "tools/ship/backendParity-selfcheck.mjs"), "utf8");
    // *** A NEGATIVE PROSE CHECK IS STILL A PROSE CHECK, AND THIS ONE WAS THE MORE DANGEROUS DIRECTION. ***
    // Written as a literal, a re-wrap of the retracted sentence across two comment lines would have made it
    // stop matching -- and this assertion is an ABSENCE, so it would have gone quietly GREEN with the false
    // claim still sitting in the file. gateQuality flagged it at v4279. Whitespace-insensitive now, so the
    // sentence cannot hide behind a line break.
    const RETRACTED = /NOTHING\s+HERE\s+CAN\s+EXECUTE\s+WGSL/;
    ok("*** neither v4269 file still asserts that WGSL cannot be executed here ***",
        !RETRACTED.test(bp) && !RETRACTED.test(gate),
        "the claim was inferred from 'the build box has no GPU' and never tested");
    ok("  and both now point at the harness that disproved it",
        /webgpuHarness/.test(bp) && /webgpuHarness/.test(gate));
    ok("  the parity count itself is unaffected and still recorded",
        /PARITY_BASELINE/.test(bp), "the census was right; only the note about grading was wrong");
    report("the census v4269 took stands. What it got wrong was a capability claim about this machine, made " +
        "without running anything -- the same shape as the guessed sabotage counts v4267 shipped.");
}

// =============================================================================================================
// SABOTAGE LOG -- grep-confirmed before the result was read, exit codes read, restored md5-identical. MEASURED.
//
//   A  select()'s two value arguments swapped -- the exact mistake the header warns about.
//      -> exit=1, 5 red. *** AND THIS IS THE ONE THAT JUSTIFIES RUNNING ANYTHING ON A GPU AT ALL. *** The
//      shader still compiles, still runs, still produces noise, and still tears the picture. What changes is
//      the number: agreement with the CPU model goes from 3.2e-8 to 2.1e-2, six orders of magnitude, and the
//      variation-spread check reads 0.031 against the model's 0.051. A structural check cannot see this. A
//      person looking at the output cannot see it either -- inverted simplex corners look like simplex noise.
//
//   B  one digit altered in Ashima's C.x constant, 0.211324865405187 -> ...180.
//      -> exit=1, 2 red, BOTH IN THE CONSTANT CHECK AND NEITHER IN THE GPU COMPARISON. The perturbation is in
//      the 15th significant figure, far below f32, so the GPU produces bit-identical output and the numeric
//      test passes. *** THE TWO CHECKS ARE NOT REDUNDANT: *** the text check catches drift the arithmetic
//      cannot feel yet, and the arithmetic check catches structure the text looks fine in. Dropping either on
//      the grounds that the other covers it would leave a hole shaped exactly like the other sabotage.
//
//   C  COARSE_GAIN retyped as a literal 0.25 instead of interpolated from badTvModel.
//      -> exit=1, 3 red, all numeric: 2.6e-2 at both time values and a spread of 0.097 against 0.051. This is
//      the "second hand-written 0.2" badTvPass.js's header names as how a port drifts, and here it is caught
//      by the model comparison rather than by anybody noticing the number changed.
//
// None went 0 RED. Every check reads either the shipped text of another file or numbers off a real device.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER IT LOOKS RIGHT. This proves the WGSL computes badTvModel's sample " +
    "coordinates to f32 precision and that the fragment shader compiles -- not that a frame drawn with it " +
    "resembles a failing television. Nothing renders a texture through it and compares pixels. Also " +
    "unchecked: the WebGL2 half. render/badTvPass.js is untouched by this round and is still the only " +
    "version anything in the engine actually draws with; badTvWgsl.mjs has NO CONSUMER yet, which is the " +
    "orphan shape this tree catches elsewhere and is accepted here only because gfx/device.js has no " +
    "production consumer either -- wiring both is the next round, not this one.");
process.exit(fails ? 1 : 0);
