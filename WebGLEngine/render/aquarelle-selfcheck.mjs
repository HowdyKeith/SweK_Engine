// WebGLEngine/render/aquarelle-selfcheck.mjs -- v4177
//
// GATES render/aquarelleModel.mjs and render/aquarellePass.js -- the port of Ramotion/aquarelle (MIT).
//
// A nine-year-old three.js pass has a failure mode a new one does not: DEAD API. Four calls in the original
// no longer exist or no longer mean what they meant, and two of them fail SILENTLY rather than throwing --
// passing a render target to renderer.render() draws to the screen and ignores the target, which reads as
// "the pass does nothing". Section 3 pins all four as absences, because an absence is what has to be true.
//
// Section 2 pins the constants against the original's, digit for digit. This tree has been bitten there
// before: v4169's flat DEFAULT_KNOBS map was missing 18 knobs and would have shipped 7 confidently wrong
// values. The mask warp here is THREE TIMES the image warp, and that asymmetry is the whole look.
//
// Run: node render/aquarelle-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { readFileSync } from "node:fs";
import { sourceOffset, maskShift, aquarellePixel, maxReach, DEFAULTS, MASK_OCTAVES, ANGLE_SCALE } from "./aquarelleModel.mjs";
import { FRAGMENT_SHADER, VERTEX_SHADER, makeAquarellePass } from "./aquarellePass.js";
import { codeOnly, noComments } from "../tools/ship/sourceScan.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const src = (p) => readFileSync(new URL(p, import.meta.url).pathname, "utf8");

// 1) THE MODEL IS DETERMINISTIC AND PURE -- the property the whole port rests on.
{
    ok(JSON.stringify(maskShift(0.3, 0.7)) === JSON.stringify(maskShift(0.3, 0.7)), "maskShift is deterministic");
    ok(JSON.stringify(sourceOffset(0.3, 0.7)) === JSON.stringify(sourceOffset(0.3, 0.7)), "and so is sourceOffset");
    const a = sourceOffset(0.3, 0.7), b = sourceOffset(0.3, 0.7, { amplitude: 100 });
    ok(a[0] !== b[0], "amplitude actually changes the source offset -- a knob that moves nothing is this tree's most-found defect");
    const c = sourceOffset(0.3, 0.7, { frequency: 40 });
    ok(c[0] !== a[0], "and so does frequency");
    ok(sourceOffset(0.3, 0.7, {}).every(Number.isFinite) && maskShift(0, 0).every(Number.isFinite), "finite at the UV origin and with empty opts");
}

// 2) *** THE CONSTANTS ARE THE ORIGINAL'S, DIGIT FOR DIGIT. ***
{
    ok(DEFAULTS.amplitude === 50 && DEFAULTS.frequency === 10, "Amplitude 50 and Frequency 10, the original's uniform defaults");
    ok(ANGLE_SCALE === 3.14, "the angle multiplier is 3.14 -- the original's literal, not Math.PI, which is a DIFFERENT number and would change every offset");
    ok(MASK_OCTAVES.length === 2, "two mask octaves");
    ok(MASK_OCTAVES[0].frequency === 20 && MASK_OCTAVES[0].amplitude === 0.07, "large octave: frequency 20, amplitude 0.07");
    ok(MASK_OCTAVES[1].frequency === 70 && MASK_OCTAVES[1].amplitude === 0.02, "small octave: frequency 70, amplitude 0.02");
    ok(Object.isFrozen(DEFAULTS) && Object.isFrozen(MASK_OCTAVES), "and they are frozen, so a caller cannot mutate the reference the shader is built from");

    // *** THE ASYMMETRY IS THE LOOK. *** The mask is warped about three times as far as the image.
    const reach = maxReach();
    ok(Math.abs(reach.source - 0.05) < 1e-9, "the SOURCE warp reaches 0.05 UV at the default amplitude");
    ok(Math.abs(reach.mask - 0.09) < 1e-9, "the MASK warp reaches 0.09 UV");
    ok(reach.mask > reach.source * 1.5,
        `and the mask is warped ${(reach.mask / reach.source).toFixed(1)}x further than the image -- tidying both into one shared amplitude would dissolve evenly and stop looking like paper`);

    // THE OCTAVES ARE SUMMED, NOT CHAINED. Each reads the noise at the ORIGINAL uv. Chaining them is the
    // obvious "improvement" to make by accident and it smears far more.
    const modelSrc = codeOnly(src("./aquarelleModel.mjs"));
    ok(/snoise3\(u \* o\.frequency, v \* o\.frequency, 0\)/.test(modelSrc),
        "each octave samples the noise at the ORIGINAL uv, not at the running shifted one -- summed displacements, not a domain warp fed through itself");
}

// 3) *** THE FOUR DEAD APIs ARE GONE. Two of them fail SILENTLY, which is why absence is asserted. ***
{
    const passSrc = src("./aquarellePass.js");
    const code = codeOnly(passSrc);
    ok(!/PlaneBufferGeometry/.test(code), "no PlaneBufferGeometry -- MEASURED at zero occurrences in our vendored three, so the original's line THROWS");
    ok(/PlaneGeometry/.test(code), "and PlaneGeometry is used instead");
    ok(!/window\.THREE/.test(code), "no window.THREE global patch");
    ok(/function makeAquarellePass\(THREE/.test(code), "THREE arrives as a PARAMETER, matching makeSwiftShaderPass and makeGrassMaterial");
    ok(!/THREE\.Pass\.call/.test(code) && !/Object\.create\(THREE\.Pass/.test(code), "no pre-class Pass prototype idiom");
    ok(/setRenderTarget/.test(code),
        "the render target is chosen with setRenderTarget -- passing it to render() as a 3rd argument is IGNORED by modern three and silently draws to the screen, which reads as the pass doing nothing");
    ok(!/renderer\.render\([^)]*,[^)]*,[^)]*,/.test(code), "and render() is never called with the removed target/clear arguments");
    ok(!/import .* from ["']three/.test(code) && !/vendor\/three/.test(code),
        "and the module imports three NOWHERE, so a page that never loads three can still read its knobs");

    // the material is on the mesh at construction, not assigned during render
    ok(/new THREE\.Mesh\(new THREE\.PlaneGeometry\(2, 2\), material\)/.test(code),
        "the quad gets its material at construction rather than during render, so it is never briefly default-material");
    let threw = null;
    try { makeAquarellePass(null); } catch (e) { threw = e; }
    ok(threw instanceof TypeError, "and calling it without THREE is refused loudly rather than failing later on an undefined");
}

// 4) THE SHADER AND THE MODEL CANNOT DRIFT, because the shader is BUILT from the model's constants.
{
    const frag = FRAGMENT_SHADER;
    ok(frag.includes("* 3.14;"), "the generated GLSL carries the 3.14 angle scale");
    ok(frag.includes("vUv * 20.0") && frag.includes("* 0.07;"), "the large octave's 20 / 0.07");
    ok(frag.includes("vUv * 70.0") && frag.includes("* 0.02;"), "the small octave's 70 / 0.02");
    ok(frag.includes("gl_FragColor = vec4(src.rgb, msk.a);"),
        "and the output is the SOURCE's colour with the MASK's alpha, which is the original's last line");
    ok(/uniform sampler2D Texture;/.test(frag) && /uniform sampler2D Mask;/.test(frag) &&
       /uniform float Amplitude;/.test(frag) && /uniform float Frequency;/.test(frag),
        "all four of the original's uniforms are declared, under their original names");
    ok(/float snoise\(vec3 v\)/.test(frag), "the 3D simplex is present");
    ok(/Ashima/.test(frag), "and Ashima's credit rides IN the shipped shader, not only in a source comment");

    // built, not typed: the constants must come from the model
    const code = codeOnly(src("./aquarellePass.js"));
    ok(/ANGLE_SCALE\.toFixed/.test(code) && /o\.frequency\.toFixed/.test(code) && /o\.amplitude\.toFixed/.test(code),
        "the shader INTERPOLATES the model's constants rather than repeating them as literals -- a second hand-written 0.07 is how a shader and its reference start disagreeing while both look reasonable");
    ok(!/0\.07/.test(code.replace(/toFixed\(2\)/g, "")), "so 0.07 appears nowhere as a literal in the pass");

    ok(/varying vec2 vUv/.test(VERTEX_SHADER) && /gl_Position/.test(VERTEX_SHADER), "the vertex shader passes uv through and sets a position");
}

// 5) THE PIXEL OPERATION composes the two samplers the way the original does.
{
    const source = () => [0.2, 0.4, 0.6, 1.0];
    const mask = () => [0.9, 0.9, 0.9, 0.25];
    const px = aquarellePixel(0.5, 0.5, source, mask);
    ok(px[0] === 0.2 && px[1] === 0.4 && px[2] === 0.6, "the colour comes from the SOURCE");
    ok(px[3] === 0.25, "and the alpha comes from the MASK -- the two textures contribute different channels, which is the whole mechanism");

    // and the samplers are called at the WARPED coordinates, not at uv
    let srcAt = null, mskAt = null;
    aquarellePixel(0.5, 0.5, (u, v) => { srcAt = [u, v]; return [0, 0, 0, 1]; }, (u, v) => { mskAt = [u, v]; return [0, 0, 0, 1]; });
    ok(srcAt[0] !== 0.5 || srcAt[1] !== 0.5, "the source is sampled at an OFFSET position, not at uv");
    ok(mskAt[0] !== 0.5 || mskAt[1] !== 0.5, "and the mask at a shifted one");
    const d = Math.hypot(mskAt[0] - 0.5, mskAt[1] - 0.5), e = Math.hypot(srcAt[0] - 0.5, srcAt[1] - 0.5);
    ok(d > e, `and the mask is displaced further than the source (${d.toFixed(4)} vs ${e.toFixed(4)}) at this pixel, as the constants require`);
}

console.log(`aquarelle-selfcheck: ${pass} passed, ${fail} failed`);
console.log("unchecked here: the pass RENDERING. That needs a GL context and a GPU. What is settled headlessly\n" +
            "is that the maths matches the original digit for digit, that the shader is generated from the same\n" +
            "constants the CPU model exports so the two cannot drift, and that all four dead three.js APIs are\n" +
            "gone -- including the two that would have failed silently.");
// ---- v4302 (#144): THE NAMING TRAP, asserted from this side too -------------------------------------------
// This file's "mask" is a dissolve texture; render/crtModel.js's mask() is the aperture grille. The paragraph
// that says so lives in both headers and each names the other, so the grep stops at the disambiguation.
{
    const pass = src("./aquarellePass.js"), model = src("./aquarelleModel.mjs"), crt = src("./crtModel.js");
    ok(/DISSOLVE MASK/.test(pass) && /crtModel\.js/.test(pass) && /APERTURE GRILLE/.test(pass),
       "aquarellePass.js names crtModel.js's aperture grille as the OTHER mask");
    ok(/crtModel\.js/.test(model) && /aperture grille/i.test(model),
       "aquarelleModel.mjs says the same in two lines");
    ok(/APERTURE GRILLE/.test(crt) && /aquarellePass\.js/.test(crt),
       "and crtModel.js points back here");
}
console.log(fail ? "\n" + fail + " FAILED" : "\nnaming trap (#144): both headers disambiguate and name each other");
process.exit(fail ? 1 : 0);
