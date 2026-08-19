// WebGLEngine/simulation/lbm/shaderConstants-selfcheck.mjs -- v2977
//
// Run: node simulation/lbm/shaderConstants-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// THE TEST lbmShader.js SAYS IT ALREADY HAS.
//
// That file's header states, verbatim: "the test below pulls the constants back OUT of the generated WGSL and
// checks them against the module, so a drift would fail the gate rather than the physics."
//
// THERE IS NO SUCH TEST. The file ends at its export, and no gate anywhere in the tree references lbmShader or
// lbm3dShader. A claim stated in a source header, describing a verification that does not exist -- which is the
// v2887 lesson exactly (a gate can enforce that a claim is PRESENT and still pass a FALSE one), except here the
// false claim was the promise of the gate itself.
//
// TWO IDEAS, BOTH BORROWED, AND BOTH ALREADY HALF-PRESENT:
//
//   uniffi-rs (mozilla): one core, MANY bindings, GENERATED rather than hand-written -- because hand-written
//   drift between implementations is invisible. lbmShader.js already does this: it interpolates E, W, OPP, CS2
//   and Q from lbm2d.js rather than retyping them. The DISCIPLINE was there; the VERIFICATION of it was not.
//
//   tilelang (tile-ai): verify a kernel's NUMERICS against a reference before trusting it. Not "does it compile"
//   -- does it compute the same thing. This sandbox has no GPU, so the kernel cannot be RUN here; but its
//   constants can be read back out and checked, and the constants are where a silent physics change would hide.
//
// AND THE CONSTANTS HAVE EXACT KEYS OF THEIR OWN, which is the part that makes this an instrument rather than a
// string comparison. A D2Q9 weight set must sum to exactly 1. OPP must be an involution, and OPP[i] must point
// at -E[i], or bounce-back reflects into the wrong direction and the wall leaks momentum. CS2 must be 1/3.
// Matching the module is not enough if the module were wrong -- so both are checked.
import { E, W, OPP, CS2, Q } from "./lbm2d.js";
import { E3, W3, OPP3, Q3 } from "./lbm3d.js";
import { LBM_WGSL } from "./lbmShader.js";
import * as shader3d from "./lbm3dShader.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const src3d = shader3d.LBM3D_WGSL || shader3d.LBM3D_SHADER ||
              (typeof shader3d.lbm3dShaderSource === "function" ? shader3d.lbm3dShaderSource() : "");

// ---- readers: pull the constants back OUT of the generated text ------------------------------------------------
const nums = (s) => (s.match(/-?\d+\.?\d*/g) || []).map(Number);

function readScalar(wgsl, name) {
    const m = wgsl.match(new RegExp("const\\s+" + name + "\\s*:\\s*\\w+\\s*=\\s*([0-9.]+)u?"));
    return m ? Number(m[1]) : null;
}
function readVecArray(wgsl, name, dim) {
    // NOT one big regex. `array<vec2<f32>, 9>` contains a nested `>`, so [^>]* stops in the wrong place -- my
    // first version could not parse its own generator's output and reported "could not parse", which reads like
    // a drift and was a broken reader. Find the declaration, then take everything to the closing `);`.
    const decl = new RegExp("const\\s+" + name + "\\s*:\\s*array<vec" + dim + "<f32>");
    const at = wgsl.search(decl);
    if (at < 0) return null;
    const eq = wgsl.indexOf("=", at);
    const end = wgsl.indexOf(");", eq);
    if (eq < 0 || end < 0) return null;
    const body = wgsl.slice(eq, end);
    const v = [...body.matchAll(new RegExp("vec" + dim + "<f32>\\(([^)]*)\\)", "g"))].map((x) => nums(x[1]));
    return v.length ? v : null;
}
function readFloatArray(wgsl, name) {
    const m = wgsl.match(new RegExp("const\\s+" + name + "\\s*:\\s*array<f32[^=]*=\\s*array<[^>]*>\\(([^)]*)\\)"));
    return m ? nums(m[1]) : null;
}
function readUintArray(wgsl, name) {
    const m = wgsl.match(new RegExp("const\\s+" + name + "\\s*:\\s*array<u32[^=]*=\\s*array<[^>]*>\\(([^)]*)\\)"));
    return m ? nums(m[1]) : null;
}

// ---- 1. THE CONSTANTS ARE PHYSICALLY RIGHT (tilelang: verify the numerics, not the syntax) -----------------------
{
    const sum = W.reduce((a, b) => a + b, 0);
    ok("!! D2Q9 weights sum to EXACTLY 1", Math.abs(sum - 1) < 1e-15, sum.toPrecision(17));
    ok("D3Q19 weights sum to exactly 1", Math.abs(W3.reduce((a, b) => a + b, 0) - 1) < 1e-15);
    ok("CS2 is exactly 1/3", Math.abs(CS2 - 1 / 3) < 1e-15, CS2.toPrecision(17));

    ok("!! OPP is an involution", OPP.every((o, i) => OPP[o] === i),
       "OPP[OPP[i]] must be i, or a bounce-back does not come back");
    ok("!! ...and OPP[i] points at MINUS E[i]", OPP.every((o, i) => E[o][0] === -E[i][0] && E[o][1] === -E[i][1]),
       "if this is wrong the wall reflects into the wrong direction and leaks momentum -- silently, as a plausible flow");
    ok("D3Q19 OPP is an involution pointing at -E3", OPP3.every((o, i) =>
        OPP3[o] === i && E3[o].every((c, k) => c === -E3[i][k])));
    ok("the rest direction is the zero vector", E[0][0] === 0 && E[0][1] === 0 && W[0] === 4 / 9);
    ok("Q matches the direction count", Q === E.length && Q === W.length && Q3 === E3.length);
}

// ---- 2. THE ROUND TRIP: what the module says vs what the WGSL actually contains -----------------------------------
//
// This is the check the header promised. It is the uniffi property made testable: generation is only worth doing
// if something proves the generated artifact still says what the source says.
{
    ok("the 2D shader source is non-empty", LBM_WGSL.length > 500, LBM_WGSL.length + " chars");
    ok("the 3D shader source is non-empty", src3d.length > 500, src3d.length + " chars");

    ok("WGSL Q matches the module", readScalar(LBM_WGSL, "Q") === Q, String(readScalar(LBM_WGSL, "Q")));
    const wE = readVecArray(LBM_WGSL, "E", 2);
    ok("!! WGSL E matches the module EXACTLY", wE && wE.length === Q && wE.every((v, i) => v[0] === E[i][0] && v[1] === E[i][1]),
       wE ? wE.length + " directions" : "could not parse");
    const wO = readUintArray(LBM_WGSL, "OPP");
    ok("WGSL OPP matches the module exactly", wO && wO.every((o, i) => o === OPP[i]), wO ? wO.join(",") : "could not parse");

    const w3E = readVecArray(src3d, "E", 3);
    ok("WGSL 3D E matches the module exactly", w3E && w3E.length === Q3 && w3E.every((v, i) => v.every((c, k) => c === E3[i][k])),
       w3E ? w3E.length + " directions" : "could not parse");
}

// ---- 3. THE WEIGHTS ARE NOT BIT-IDENTICAL, AND THAT IS THE INTERESTING PART -----------------------------------------
//
// The generator writes weights with toFixed(10). 4/9 is 0.4444444444444444... so the emitted 0.4444444444 is NOT
// the same f64. It IS the same f32 -- and f32 is what the GPU runs. So the honest claim is not "the constants are
// identical", it is "they differ in f64 and agree exactly once rounded to the precision the hardware uses".
//
// Saying the first would be a lie that happens to be harmless. Saying the second is a measurement.
{
    const wW = readFloatArray(LBM_WGSL, "W");
    ok("WGSL W parses", wW && wW.length === Q, wW ? wW.length + " weights" : "could not parse");
    const f64same = wW.every((w, i) => w === W[i]);
    ok("!! the weights are NOT bit-identical in f64", !f64same,
       "toFixed(10) truncates: 4/9 becomes 0.4444444444, which is a different double");
    ok("!! ...and ARE exactly equal in f32, which is what the GPU runs",
       wW.every((w, i) => Math.fround(w) === Math.fround(W[i])),
       "the truncation is below f32's ~7 significant digits, so the hardware sees the same number");
    ok("...and the emitted weights still sum to 1 within f32", Math.abs(wW.reduce((a, b) => a + b, 0) - 1) < 1e-7,
       wW.reduce((a, b) => a + b, 0).toPrecision(12));
}

// ---- 4. THE SHADERS DO NOT RETYPE ANYTHING (the uniffi rule, checked in the source) -----------------------------------
{
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    for (const f of ["lbmShader.js", "lbm3dShader.js"]) {
        const raw = fs.readFileSync(path.join(HERE, f), "utf8");
        const code = raw.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
        ok(f + " IMPORTS its constants", /import \{[^}]*\} from "\.\/lbm/.test(code),
           "one source of truth; a retyped weight is a silent physics change on a machine you cannot test");
        // A literal 0.4444 or 0.02777 in the CODE would mean someone typed a weight by hand.
        ok("..." + f + " contains no hand-typed lattice weight", !/0\.4444|0\.1111|0\.02777|0\.0555/.test(code),
           "checked against code with comments stripped -- the headers legitimately discuss these numbers");
    }
}

// ---- 5. SABOTAGE: the round trip must actually be able to fail ---------------------------------------------------------
{
    const drifted = LBM_WGSL.replace("0u, 3u, 4u", "0u, 4u, 3u");   // swap two opposites
    const wO = readUintArray(drifted, "OPP");
    ok("!! SABOTAGE: a swapped OPP entry IS caught by the reader", wO && !wO.every((o, i) => o === OPP[i]),
       "read back as " + (wO ? wO.slice(0, 5).join(",") : "?") + " against " + OPP.slice(0, 5).join(",") +
       " -- a control that cannot fail is decoration, and this one is the whole point of the file");
    ok("...and the unmodified source still passes the same reader", readUintArray(LBM_WGSL, "OPP").every((o, i) => o === OPP[i]),
       "so the sabotage proves the check, not a broken parser");
}

console.log(fails ? "\nshaderConstants-selfcheck: " + fails + " FAILED" : "\nshaderConstants-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
