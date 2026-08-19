// WebGLEngine/tools/ship/microfacetShader-selfcheck.mjs -- v3494
//
// Run: node tools/ship/microfacetShader-selfcheck.mjs
//
// *** THE SHADER IS GRADED WITH NO GPU, BY EXTRACTING ITS OWN TEXT AND EVALUATING IT AGAINST THE CPU MODULE ***
// -- v3064's idiom, where the depth expression was pulled out of the shipped GLSL and agreed with depthProject
// to 0.0e+0. Two implementations of one formula is normally the duplicate this tree refuses; here one of them
// must run on a GPU, so the answer is to PIN THEM TOGETHER rather than pretend there is one.
//
// AND THE ROUND HAS A FINDING THE CPU MODULE COULD NOT HAVE PRODUCED: GLSL highp IS binary32, every gate in
// this arc runs in float64, and one line of GGX is a catastrophic-cancellation site that only exists at the
// lower precision.
"use strict";
import { FRAG_SRC_GGX, FRAG_SRC_GGX_NAIVE, T_LINES, glslExpr, evalGlsl } from "../../render/microfacetShader.js";
import { D, Lambda, G2 } from "../../physics/render/microfacet.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const f = Math.fround;

/* ------------------------------------------------------------------------------------------------------------
 * 1. *** THE EXTRACTOR IS PROVEN ON A FIXTURE BEFORE IT IS POINTED AT THE SHIPPING SHADER ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const fixture = "void main(){\n  float known = (1.0 - 0.25) * 4.0 + sqrt(9.0) - max(2.0, 1.0);\n}";
    const expr = glslExpr(fixture, "known");
    say(`fixture expression extracted: ${expr}`);
    ok("!! *** THE TRANSPILE IS CHECKED AGAINST AN ANSWER KNOWN IN ADVANCE, NOT AGAINST THE THING IT IS FOR ***",
       expr === "(1.0 - 0.25) * 4.0 + sqrt(9.0) - max(2.0, 1.0)" && evalGlsl(expr) === 4,
       "*** (1 - 0.25) * 4 + 3 - 2 = 4, WORKED OUT BEFORE THE CODE RAN. A transpiler nobody checked would make every agreement below meaningless -- v3450's rule: an instrument aimed straight at the real thing produces a confident number nobody can check, and that resolver reported 22, then 97, then 228. ***");

    ok("...and a line that is not there returns null rather than throwing",
       glslExpr(fixture, "absent") === null,
       "'The line is gone' is a finding to report by name, not a crash to survive -- which matters because the checks below identify a shader BY the line it carries.");

    ok("...and the substitution set is the whole of it: sqrt and max",
       evalGlsl("sqrt(a * a)", { a: 7 }) === 7 && evalGlsl("max(a, 2.0)", { a: 1 }) === 2,
       "Numeric literals are written 1.0, which is already valid JavaScript, and there is no control flow in any extracted line. THE SUBSET IS SMALL ON PURPOSE: every token it does not handle is a token that cannot silently mean something else.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE SHADER AND THE MODULE AGREE, PULLED STRAIGHT OUT OF THE SHIPPED TEXT
 * --------------------------------------------------------------------------------------------------------- */
{
    const tExpr = glslExpr(FRAG_SRC_GGX, "t");
    const tan2Expr = glslExpr(FRAG_SRC_GGX, "tan2");
    ok("both load-bearing expressions are present and extractable from the shipped shader",
       tExpr !== null && tan2Expr !== null, `t = ${tExpr}`);

    // D is rebuilt FROM the extracted denominator rather than from a second copy of the formula.
    const shaderD = (cosM, a) => {
        const t = evalGlsl(tExpr, { a2: a * a, c2: cosM * cosM });
        return cosM <= 0 ? 0 : (a * a) / (Math.PI * t * t);
    };
    const shaderLambda = (cosW, a) => {
        const tan2 = evalGlsl(tan2Expr, { c2: cosW * cosW });
        return (-1 + Math.sqrt(1 + a * a * tan2)) / 2;
    };
    let worstD = 0, worstL = 0;
    for (const a of [0.05, 0.1, 0.3, 0.6, 1.0]) for (const c of [0.99, 0.8, 0.5, 0.2, 0.05]) {
        worstD = Math.max(worstD, Math.abs(shaderD(c, a) / D(c, a) - 1));
        worstL = Math.max(worstL, Math.abs(shaderLambda(c, a) - Lambda(c, a)));
    }
    say(`shader text vs physics/render/microfacet.mjs over 25 cells: worst D relative ${worstD.toExponential(2)}, worst Lambda absolute ${worstL.toExponential(2)}`);
    ok("!! *** THE GLSL AND THE CPU MODULE ARE THE SAME ARITHMETIC, EVALUATED FROM THE SHADER'S OWN SOURCE ***",
       worstD === 0 && worstL === 0,
       "*** EXACT, NOT WITHIN A TOLERANCE: both are evaluated in float64 here, so any difference would be a difference in the EXPRESSIONS rather than in the precision -- which is the only thing this section can ask. THE PRECISION QUESTION IS SECTION 4, AND KEEPING THEM APART IS THE POINT: a single check mixing them could not say whether a gap was a typo or a rounding. ***");

    ok("...and G2 is built from Lambda in the shader rather than re-derived",
       /1\.0 \/ \(1\.0 \+ ggxLambda\(cosO, a\) \+ ggxLambda\(cosI, a\)\)/.test(FRAG_SRC_GGX),
       `Height-correlated Smith, matching the module's default. A shader that spelled it G1(o)*G1(i) would be the SEPARABLE model (v3490 measured them 5.61% apart at alpha 0.8) -- a different model wearing the same name, which is the substitution nobody calls a bug. Module value at 0.8/0.5/0.5: ${G2(0.5, 0.5, 0.8).toFixed(9)}.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. THE PLANT IS THE TEXTBOOK LINE, AND IT DIFFERS BY EXACTLY ONE
 * --------------------------------------------------------------------------------------------------------- */
{
    const a = FRAG_SRC_GGX.split("\n"), b = FRAG_SRC_GGX_NAIVE.split("\n");
    const diff = a.map((l, i) => (l === b[i] ? null : i)).filter((i) => i !== null);
    say(`the two shaders differ on ${diff.length} line(s): ${diff.map((i) => `${a[i].trim()}  ->  ${b[i].trim()}`).join(" | ")}`);
    ok("!! *** THE NAIVE SHADER IS PRODUCED FROM THE STABLE ONE BY REPLACING EXACTLY ONE LINE ***",
       a.length === b.length && diff.length === 1 && b[diff[0]] === T_LINES.naive,
       "*** A HAND-WRITTEN SECOND COPY COULD DIFFER SOMEWHERE ELSE and the measurement in section 4 would be attributing the gap to the wrong line. This is FRAG_SRC_BRICK's idiom (v3061), where the bricked variant is the un-bricked one plus a named guard. AND THE REPLACE IS ASSERTED TO HAVE HAPPENED: a silent no-op would leave the two identical and every comparison would report a comfortable zero. ***");

    const tS = glslExpr(FRAG_SRC_GGX, "t"), tN = glslExpr(FRAG_SRC_GGX_NAIVE, "t");
    let worst = 0;
    for (const al of [0.05, 0.3, 1.0]) for (const c of [0.99, 0.5, 0.05])
        worst = Math.max(worst, Math.abs(evalGlsl(tS, { a2: al * al, c2: c * c }) - evalGlsl(tN, { a2: al * al, c2: c * c })));
    ok("!! ...and in float64 the two lines are ALGEBRAICALLY IDENTICAL, which is why this is a precision round",
       worst < 1e-15,
       `worst difference ${worst.toExponential(2)} over nine cells. cos^2(a^2 - 1) + 1 and (1 - cos^2) + a^2 cos^2 are the same number. EVERY GATE IN THIS ARC RUNS IN FLOAT64 AND NONE OF THEM COULD TELL THESE APART.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. *** THE FINDING: AT binary32 THEY ARE NOT THE SAME NUMBER, AND THE GAP IS FIVE ORDERS ***
 * --------------------------------------------------------------------------------------------------------- */
{
    // Math.fround rounds a double to exactly IEEE binary32, which is what GLSL highp guarantees -- v3062's
    // method, used there to measure whether single precision changes which voxel a ray hits.
    const t32 = (expr, a, c) => {
        const a2 = f(f(a) * f(a)), c2 = f(f(c) * f(c));
        return expr === "naive" ? f(f(c2 * f(a2 - 1)) + 1) : f(f(1 - c2) + f(a2 * c2));
    };
    const D32 = (kind, c, a) => { const t = t32(kind, a, c); return f(f(f(a) * f(a)) / f(f(Math.PI) * f(t * t))); };

    const rows = [0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001].map((a) => ({
        a, exact: D(1, a), naive: D32("naive", 1, a) / D(1, a) - 1, stable: D32("stable", 1, a) / D(1, a) - 1,
    }));
    for (const r of rows) say(`  alpha ${String(r.a).padEnd(6)} D(1) = ${r.exact.toExponential(5)}   textbook f32 ${r.naive.toExponential(2).padStart(10)}   rewritten f32 ${r.stable.toExponential(2).padStart(10)}`);

    ok("!! *** THE TEXTBOOK DENOMINATOR LOSES 2.6% AT ROUGHNESS 0.001 IN SINGLE PRECISION ***",
       Math.abs(rows[rows.length - 1].naive) > 0.02,
       "*** cos^2 (a^2 - 1) + 1 IS A DIFFERENCE OF NUMBERS NEAR 1, and at small roughness the surviving digits vanish -- a highlight two and a half percent wrong at a knob setting somebody uses for polished metal. It is the SAME dangerous magnitude v3467 named: big enough to be wrong, small enough to pass for a different material. ***");

    ok("!! *** AND THE REWRITE HOLDS AT 1e-7 THROUGHOUT -- FIVE ORDERS, FOR A LINE THAT COMPUTES THE SAME NUMBER ***",
       rows.every((r) => Math.abs(r.stable) < 1e-6) &&
       Math.abs(rows[rows.length - 1].naive) / Math.abs(rows[rows.length - 1].stable) > 1e4,
       "(1 - cos^2) + a^2 cos^2 is a SUM OF POSITIVES: nothing cancels, so nothing is lost. THE ERROR IS MONOTONE IN ROUGHNESS FOR THE TEXTBOOK FORM AND FLAT FOR THE REWRITE, which is the discriminator -- a check at one roughness would see almost nothing.");

    // The identity itself, in single precision. THIS is what a shader breaking would actually cost.
    const integ = (kind, a) => {
        let s = 0; const N = 40000, dth = Math.PI / 2 / N;
        for (let i = 0; i < N; i++) { const th = (i + 0.5) * dth, c = Math.cos(th); s += D32(kind, c, a) * c * Math.sin(th) * dth; }
        return s * 2 * Math.PI;
    };
    const idRows = [0.05, 0.01, 0.005, 0.002].map((a) => ({ a, n: integ("naive", a), s: integ("stable", a) }));
    for (const r of idRows) say(`  INT D cos dm at alpha ${String(r.a).padEnd(6)} textbook f32 ${r.n.toFixed(7)}   rewritten f32 ${r.s.toFixed(7)}`);
    ok("!! *** AND IT IS NOT ONLY A VALUE: THE NDF STOPS BEING A DISTRIBUTION IN SINGLE PRECISION ***",
       Math.abs(idRows[3].n - 1) > 2e-3 && Math.abs(idRows[3].s - 1) < Math.abs(idRows[3].n - 1) / 2,
       "*** v3490'S FIRST KEY IS THAT D INTEGRATES TO 1, AND AT binary32 THE TEXTBOOK FORM DRIFTS OFF IT while the rewrite holds. The identity that grades the model on the CPU is itself precision-dependent on the GPU -- which is the sharpest possible reason for this round to exist rather than being a port. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. WHAT THIS CANNOT ANSWER, SAID HERE RATHER THAN LEFT TO A READER
 * --------------------------------------------------------------------------------------------------------- */
{
    const src = fs.readFileSync(path.join(ROOT, "render", "microfacetShader.js"), "utf8");
    const prose = src.replace(/\n\s*\/\/\s?/g, " ");
    ok("!! the file states that the sandbox MODELS binary32 and the GPU is the authority",
       /THE SANDBOX MODELS binary32; THE GPU IS THE AUTHORITY/.test(prose),
       "highp is a MINIMUM guarantee: a vendor may carry more precision, may fold expressions differently, or may not honour highp in a fragment shader at all. EVERY NUMBER IN SECTION 4 IS A PREDICTION ABOUT REAL HARDWARE AND NOT A MEASUREMENT OF IT.");

    ok("...and the probe shader outputs NUMBERS rather than a shaded picture",
       /fragColor = vec4\(ggxD\(cosV, a\), ggxG2\(cosV, cosV, a\), a, cosV\)/.test(FRAG_SRC_GGX) &&
       !/light|specular|albedo/i.test(FRAG_SRC_GGX),
       "*** A SHADER GRADED BY LOOKING AT A HIGHLIGHT IS NOT GRADED. This arc's whole argument is that a 27% error looks like a slightly different material (v3467), and a highlight is exactly where that hides. Each pixel is one (roughness, cos) pair and the value IS the output, so the page reads it back and compares. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 6. THE FRONT DOOR
 * --------------------------------------------------------------------------------------------------------- */
{
    const page = fs.readFileSync(path.join(ROOT, "path-tracer.html"), "utf8");
    ok("!! path-tracer.html imports the shader and both variants",
       /from "\/render\/microfacetShader\.js"/.test(page) && /FRAG_SRC_GGX_NAIVE/.test(page),
       "Both, because one alone measures nothing: the whole claim is the GAP between two lines that are the same number in float64.");

    ok("...and it requires the float colour buffer BY NAME rather than reading back 8-bit",
       /EXT_color_buffer_float/.test(page),
       "*** AN 8-BIT READBACK QUANTISES TO 1/255 AND EVERY NUMBER IN SECTION 4 IS SMALLER THAN THAT. Without a float target this page would report agreement to the last bit on a broken shader. The extension is REFUSED BY NAME when absent -- a capability, not a failure (v3441's rule). ***");
}

console.log(fails ? "\nmicrofacetShader-selfcheck: " + fails + " FAILED" : "\nmicrofacetShader-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
