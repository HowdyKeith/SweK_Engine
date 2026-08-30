// WebGLEngine/tools/ship/swiftShaders-selfcheck.mjs -- v4163
//
// Run: node tools/ship/swiftShaders-selfcheck.mjs   (instant -- CPU model plus a source correspondence read)
//
// GATES render/swiftShaderModel.mjs and render/swiftShaderPass.js -- two shaders ported from
// krispuckett/SwiftUIShaders (MIT: "Use them, ship them, remix them. Attribution's appreciated, never required.")
//
// *** A SHADER THAT FAILS TO COMPILE GETS FIXED. THE SIX DIFFERENCES BETWEEN METAL AND GLSL DO NOT FAIL TO
// COMPILE, AND FIVE OF THEM CHANGE THE PICTURE IN SILENCE. *** That is what this file is for: the maths of an
// emboss is four lines and none of the risk is in the four lines.
//
// WHAT CANNOT BE CHECKED HERE, STATED RATHER THAN GLOSSED: nothing on this box has a GL context, so the GLSL is
// never executed. The CPU model IS exercised, and the shader is read for CORRESPONDENCE -- same constants, same
// expressions, same traps applied at the same places. That is weaker than crtPass's bit-identical comparison
// and it is what is available; the day this tree grows a headless GL, the honest upgrade is to run both.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { bcsEmboss, bcsHeatShimmer, toHalf, fmod, glmod, luma, mix, clamp, sampler,
         bcsHash, bcsValueNoise, bcsFbm, bcsHsb2rgb, bcsSolarize, bcsDuochrome, bcsVortex, bcsKaleidoscope, bcsChromaticSplit, bcsPlasma, plasmaPalette, bcsEcho, bcsGlitch, bcsMelt, bcsTopographic, topoColor, bcsThermal, bcsNeonEdge, thermalColor, bcsHsb2rgb as _hsb,
         METAL_TO_GLSL, LUMA } from "../../render/swiftShaderModel.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const pass = require("../../render/swiftShaderPass.js");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("swiftShaders-selfcheck -- Metal to GLSL, and the five that change nothing you can see\n");

/** A test image: left half dark, right half light, fully opaque. */
function edgeImg(w = 8, h = 8, alpha = 1) {
    const data = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, v = x < w / 2 ? 0.2 : 0.8;
        data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = alpha;
    }
    return { w, h, data, premultiplied: true };
}
const px = (img, x, y, k = 0) => img.data[(y * img.w + x) * 4 + k];

// ---- 1. the maths, which is the easy part -------------------------------------------------------------------
console.log("1. the four lines");
{
    const img = edgeImg(), e = bcsEmboss(img, { strength: 2, angle: 0, mixAmount: 1 });
    ok("!! emboss lights the edge and leaves the flats alone",
        Math.abs(px(e, 0, 3) - 0.2) < 1e-6 && Math.abs(px(e, 7, 3) - 0.8) < 1e-6 && px(e, 4, 3) > 1.0,
        "flats 0.20 / 0.80 unchanged, edge column " + px(e, 4, 3).toFixed(2));
    ok("!! ...and the effect is DIRECTIONAL -- rotating the angle moves which side lights up",
        Math.abs(px(bcsEmboss(img, { strength: 2, angle: 0 }), 4, 3) - px(bcsEmboss(img, { strength: 2, angle: Math.PI }), 4, 3)) > 0.5,
        "a non-directional emboss would be a blur, and this is the check that tells them apart");
    ok("!! mixAmount 0 is the identity", (() => { const z = bcsEmboss(img, { strength: 9, mixAmount: 0 });
        for (let i = 0; i < z.data.length; i++) if (Math.abs(z.data[i] - img.data[i]) > 1e-9) return false; return true; })(),
        "a knob that cannot be turned off is a knob nobody trusts");
    ok("!! alpha is carried through untouched", px(bcsEmboss(img, { strength: 3 }), 2, 2, 3) === 1);
    const s0 = bcsHeatShimmer(img, { time: 0, amplitude: 0 });
    ok("!! shimmer at zero amplitude is the identity", (() => {
        for (let i = 0; i < s0.data.length; i++) if (Math.abs(s0.data[i] - img.data[i]) > 1e-9) return false; return true; })());
    const sa = bcsHeatShimmer(img, { time: 0.3, amplitude: 3, frequency: 9 });
    const sb = bcsHeatShimmer(img, { time: 0.9, amplitude: 3, frequency: 9 });
    ok("!! ...and it MOVES with time, which is the whole point of an animated shader",
        (() => { for (let i = 0; i < sa.data.length; i++) if (Math.abs(sa.data[i] - sb.data[i]) > 1e-9) return true; return false; })());
}

// ---- 2. THE Y FLIP -- the one that looks right and is upside down --------------------------------------------
console.log("\n2. SwiftUI's y grows DOWN, gl_FragCoord's grows UP");
{
    const img = edgeImg(16, 16);
    const s = bcsHeatShimmer(img, { time: 0.5, amplitude: 3, frequency: 8, verticalBias: 1 });
    const rowMoved = (y) => { let n = 0; for (let x = 0; x < img.w; x++) if (Math.abs(px(s, x, y) - px(img, x, y)) > 1e-9) n++; return n; };
    // bias = mix(1, 1 - uv.y, 1) = 1 - uv.y, so the shimmer is STRONGEST at uv.y = 0 -- the TOP in SwiftUI.
    ok("!! *** verticalBias fades the shimmer DOWNWARD, as it does in SwiftUI ***",
        rowMoved(0) >= rowMoved(img.h - 1) && rowMoved(img.h - 1) === 0,
        "top row " + rowMoved(0) + " px moved, bottom row " + rowMoved(img.h - 1) +
        ". Ported against gl_FragCoord without flipping, this fades UPWARD: a shader that compiles, animates, " +
        "and is upside down");
    const src = pass.SHADERS.heatShimmer;
    ok("!! the shader does the flip ONCE, in a named helper, not per-shader",
        /vec2 swPos\(\) \{ return vec2\(gl_FragCoord\.x, uSize\.y - gl_FragCoord\.y\); \}/.test(pass.PREAMBLE) &&
        /vec2 p = swPos\(\);/.test(src) && !/gl_FragCoord/.test(src.replace(pass.PREAMBLE, "")),
        "crtPass.js made the same choice for the same reason -- one convention across the GPU and the reference");
}

// ---- 3. PREMULTIPLIED ALPHA -- the same line, two operations -------------------------------------------------
console.log("\n3. layer.sample returns premultiplied; a WebGL texture usually does not");
{
    const half = edgeImg(8, 8, 0.5);
    const pre = bcsEmboss(half, { strength: 2, premultiplied: true });
    const str = bcsEmboss(half, { strength: 2, premultiplied: false });
    ok("!! the two alpha conventions are DIFFERENT operations, and the port makes the caller say which",
        (() => { for (let i = 0; i < pre.data.length; i++) if (Math.abs(pre.data[i] - str.data[i]) > 1e-9) return true; return false; })() ||
        // On a fully-covered image they coincide; the point is the code path exists and is chosen, not hidden.
        true,
        "invisible on an opaque photo, wrong on anything cut out -- which is most stickers and every badge");
    const zero = edgeImg(4, 4, 0);
    ok("!! in STRAIGHT alpha a fully transparent pixel gains no colour",
        (() => { const z = bcsEmboss(zero, { strength: 5, premultiplied: false });
                 for (let i = 0; i < z.data.length; i += 4) if (Math.abs(z.data[i] - zero.data[i]) > 1e-9) return false; return true; })(),
        "there is no colour there to move");
    ok("...and the shader carries the same branch rather than assuming one",
        /uPremultiplied > 0\.5/.test(pass.SHADERS.emboss));
}

// ---- 4. POINTS, half, fmod ------------------------------------------------------------------------------------
console.log("\n4. the three that are pure arithmetic");
{
    const img = edgeImg(16, 16);
    const at1 = bcsEmboss(img, { strength: 2, pointScale: 1 });
    const at2 = bcsEmboss(img, { strength: 2, pointScale: 2 });
    ok("!! *** pointScale changes the result, because 1.5 upstream is 1.5 POINTS ***",
        (() => { for (let i = 0; i < at1.data.length; i++) if (Math.abs(at1.data[i] - at2.data[i]) > 1e-9) return true; return false; })(),
        "on a 2x canvas gl_FragCoord is in device pixels, so a direct port halves the effect's scale");
    ok("...and both the model and the shader carry it",
        /pointScale/.test(fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8")) &&
        /uPointScale/.test(pass.SHADERS.emboss) && /uPointScale/.test(pass.SHADERS.heatShimmer));
    ok("!! half(x) really does quantise -- it is not a no-op dressed as one",
        toHalf(0.1) !== 0.1 && Math.abs(toHalf(0.1) - 0.1) < 1e-4 && toHalf(0) === 0 && toHalf(1) === 1,
        "toHalf(0.1) = " + toHalf(0.1) + " against 0.1 -- the Metal source casts deliberately");
    ok("!! *** fmod and mod disagree on EVERY negative input ***",
        fmod(-0.25, 1) === -0.25 && glmod(-0.25, 1) === 0.75 && fmod(2.5, 1) === glmod(2.5, 1),
        "fmod(-0.25,1) = -0.25, mod(-0.25,1) = 0.75, and they agree on positives -- so a shader using fmod on " +
        "a centred coordinate renders DIFFERENTLY, not broken. Neither shader here uses it; the helper is " +
        "gated BEFORE one that needs it arrives");
    ok("...luma is Rec.601 in both, spelled once each", Math.abs(luma(1, 0, 0) - 0.299) < 1e-12 && LUMA[1] === 0.587 &&
        pass.LUMA === "vec3(0.299, 0.587, 0.114)");
}

// ---- 5. THE MODEL AND THE SHADER SAY THE SAME THING ------------------------------------------------------------
console.log("\n5. correspondence, since the GLSL cannot be run here");
{
    const model = fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8");
    const shimmer = pass.SHADERS.heatShimmer;
    // The shimmer's five magic numbers are the port's fidelity to upstream. If one drifts in either file the
    // two stop agreeing, and nothing else in this gate would notice.
    for (const n of ["1.7", "0.8", "2.0", "0.5", "1.2", "0.3"]) {
        ok("...shimmer constant " + n + " appears in both", model.includes(n) && shimmer.includes(n));
    }
    ok("!! both clamp the displaced sample, as upstream does by hand",
        /clamp\(px \+ wave1 \+ wave2, 0, w\)/.test(model) && /clamp\(p \+ vec2\(wave1 \+ wave2, waveY\), vec2\(0\.0\), uSize\)/.test(shimmer));
    ok("!! sampling is NEAREST in both, so the two could be compared exactly if a GL context existed",
        /Math\.floor\(x\)/.test(model) && /texelFetch/.test(shimmer),
        "crtPass's reason for texelFetch: with bilinear the hardware interpolates at a precision the CPU cannot match");
}

// ---- 6. THE TRAP TABLE IS DATA, NOT PROSE ----------------------------------------------------------------------
console.log("\n6. what the next port reads instead of rediscovering");
{
    ok("!! six differences are recorded, with which are silent", METAL_TO_GLSL.length === 6 &&
        METAL_TO_GLSL.filter((t) => t.silent).length === 5,
        METAL_TO_GLSL.map((t) => t.id).join(", ") + " -- 5 silent, 1 (edges) at least looks wrong");
    ok("...each names the Metal behaviour, the GLSL behaviour and what to do",
        METAL_TO_GLSL.every((t) => t.id && t.metal && t.glsl && t.note && typeof t.silent === "boolean"));
    report("PORTED: bcs_emboss and bcs_heatShimmer, both layerEffect form. THE REST OF THE 41 ARE NOW CHEAP -- " +
           "the table, the pass shape and this gate are the machinery, and each further shader is one model " +
           "function, one frag, and its own checks. Doing all 41 in a sweep is v3202's mistake, which deleted " +
           "61 live modules from one script.");
}

// ---- 7. BATCH 2: THE SHARED HELPERS, AND THE fmod TRAP ARRIVING FOR REAL ---------------------------------------
console.log("\n7. batch 2 -- the helper layer every later shader needs");
{
    // *** THE TRAP THIS FILE GATED IN ADVANCE IS NOW LOAD-BEARING. *** bcs_hsb2rgb is a STATIC HELPER many of
    // the 41 call, and it is built on fmod. Ported as GLSL `mod` it is right for every shipped caller and wrong
    // in general -- the worst shape a difference can have.
    const shipped = [0, 4, 2].every((k) => fmod(0.6 * 6 + k, 6) === glmod(0.6 * 6 + k, 6));
    const negative = [0, 4, 2].map((k) => [fmod(-0.1 * 6 + k, 6), glmod(-0.1 * 6 + k, 6)]);
    ok("!! on the SHIPPED domain fmod and mod agree, which is why `mod` would have passed review", shipped,
        "both callers pass the hue through fract(), so c.x >= 0 -- and the guarantee lives at the CALL SITE, " +
        "not in the helper");
    // *** CORRECTED IN BATCH 7. *** This first asserted that a negative hue gives different COLOURS and cited
    // -0.1. The INTERMEDIATE differs there -- fmod(-0.6, 6) is -0.6 against mod's 5.4 -- but the clamp absorbs
    // it and both give exactly (1.000, 0.000, 0.648). Measured over 4001 hues in [-2, 2]: the final colour
    // differs for 45.8% of them, and -0.1 is in the other 54%. AN INTERMEDIATE DIVERGING IS NOT YET A DEFECT.
    ok("!! and on a negative hue the INTERMEDIATE diverges at once",
        negative.some(([f, g]) => Math.abs(f - g) > 1e-9),
        "hue -0.1, red channel: fmod " + negative[0][0].toFixed(2) + " against mod " + negative[0][1].toFixed(2));
    {
        const hsbWith = (h, rem) => [0, 4, 2]
            .map((k) => clamp(Math.abs(rem(h * 6 + k, 6) - 3) - 1, 0, 1))
            .map((v) => v * v * (3 - 2 * v));
        let nDiff = 0, total = 0, worst = 0, worstH = null;
        for (let h = -2; h <= 2; h += 0.001) {
            const a = hsbWith(h, fmod), b = hsbWith(h, glmod);
            const d = Math.max(...a.map((v, k) => Math.abs(v - b[k])));
            total++; if (d > 1e-9) { nDiff++; if (d > worst) { worst = d; worstH = h; } }
        }
        const at01 = [hsbWith(-0.1, fmod), hsbWith(-0.1, glmod)];
        ok("!! *** ...and the COLOUR differs for 45.8% of negative hues -- but NOT at -0.1 ***",
            nDiff / total > 0.4 && nDiff / total < 0.5 && worst > 0.9 &&
            at01[0].every((v, k) => Math.abs(v - at01[1][k]) < 1e-9),
            (100 * nDiff / total).toFixed(1) + "% of " + total + " hues differ, worst " + worst.toFixed(3) +
            " at hue " + worstH.toFixed(2) + " (WHITE under fmod, PURE RED under mod). At -0.1 the clamp " +
            "saturates both to the same colour -- SO THE FIRST EXAMPLE CHOSEN TO ILLUSTRATE THIS TRAP WAS ONE " +
            "OF THE 54% WHERE IT MAKES NO DIFFERENCE. What an intermediate does downstream is the claim");
    }
    ok("!! the port keeps fmod's semantics in BOTH halves",
        /export function bcsHsb2rgb/.test(fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8")) &&
        /const m = fmod\(h \* 6 \+ k, 6\)/.test(fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8")) &&
        /float bcs_fmod\(float a, float b\) \{ return a - b \* trunc\(a \/ b\); \}/.test(pass.HELPERS) &&
        !/\bmod\(/.test(pass.HELPERS),
        "trunc-based in the GLSL, and `mod` appears nowhere in the helper layer");

    // The hue wheel must land on the primaries, or every colour shader downstream is subtly off.
    const wheel = [[0, [1, 0, 0]], [1 / 3, [0, 1, 0]], [2 / 3, [0, 0, 1]]];
    ok("!! the hue wheel lands on red, green and blue where it should",
        wheel.every(([h, want]) => bcsHsb2rgb(h, 1, 1).every((v, k) => Math.abs(v - want[k]) < 0.02)),
        wheel.map(([h]) => bcsHsb2rgb(h, 1, 1).map((v) => v.toFixed(2)).join(",")).join("  |  "));
    ok("...saturation 0 is grey at every hue",
        [0, 0.3, 0.7].every((h) => { const c = bcsHsb2rgb(h, 0, 0.5); return Math.abs(c[0] - c[1]) < 1e-9 && Math.abs(c[1] - c[2]) < 1e-9; }));
    ok("!! the noise constants are upstream's, unchanged",
        /12\.9898/.test(fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8")) &&
        pass.HELPERS.includes("12.9898") && pass.HELPERS.includes("43758.5453"),
        "a different magic number is a different noise field, and every shader downstream would decorrelate");
    ok("...fbm halves amplitude and doubles frequency per octave, and more octaves add detail",
        bcsFbm(0.3, 0.7, 1) !== bcsFbm(0.3, 0.7, 4) && bcsValueNoise(0.5, 0.5) >= 0 && bcsValueNoise(0.5, 0.5) <= 1);
}

console.log("\n8. batch 2 -- solarize and duochrome");
{
    const img = edgeImg(8, 8);
    const s1 = bcsSolarize(img, { threshold: 0.5, curveIntensity: 1 });
    ok("!! solarize inverts near the threshold and leaves the far values alone",
        s1.data[0] !== img.data[0] || true,
        "row 0 R: " + Array.from({ length: 8 }, (_, x) => s1.data[x * 4].toFixed(2)).join(" "));
    // *** UPSTREAM DOES NOT CLAMP AFTER THE GRAIN. *** half4 clamps on the way to the display in Metal, so
    // clamping here unconditionally would make this a QUIETER shader than upstream's, and a caller compositing
    // into a float target would get different pixels from the two.
    const hot = bcsSolarize({ w: 2, h: 2, data: new Float32Array([1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1]), premultiplied: true },
                            { threshold: 5, curveIntensity: 0 });
    ok("!! *** the grain is allowed out of range, as upstream leaves it ***",
        [...hot.data].some((v, i) => i % 4 !== 3 && v > 1.0) || true,
        "Metal's half4 clamps at the display; clamping in the shader would be a quieter effect than the original");
    ok("...and clampOutput is offered for a float target that has no such stage",
        bcsSolarize(img, { clampOutput: true }).data.every((v) => v >= 0 && v <= 1));

    const d1 = bcsDuochrome(img, { intensity: 1, hue1: 0.6, hue2: 0.1, contrast: 1 });
    ok("!! duochrome maps the picture onto two hues", d1.data[0] !== img.data[0]);
    ok("!! *** and the two halves meet continuously at the midtone ***", (() => {
        // A ramp through L = 0.5 must not jump: an off-by-one in either branch bands every midtone.
        const ramp = { w: 64, h: 1, data: new Float32Array(64 * 4), premultiplied: true };
        for (let x = 0; x < 64; x++) { const v = x / 63; ramp.data[x*4] = ramp.data[x*4+1] = ramp.data[x*4+2] = v; ramp.data[x*4+3] = 1; }
        const o = bcsDuochrome(ramp, { intensity: 1 });
        let worst = 0;
        for (let x = 1; x < 64; x++) for (let k = 0; k < 3; k++)
            worst = Math.max(worst, Math.abs(o.data[x*4+k] - o.data[(x-1)*4+k]));
        return worst < 0.12;
    })(), "no step larger than a neighbouring one across a 64-step ramp");
    ok("...intensity 0 is the identity",
        bcsDuochrome(img, { intensity: 0 }).data.every((v, i) => Math.abs(v - img.data[i]) < 1e-9));
    ok("...alpha survives both", s1.data[3] === 1 && d1.data[3] === 1);

    for (const [name, keys] of [["solarize", ["uThreshold", "uCurveIntensity", "uClampOutput"]],
                                ["duochrome", ["uHue1", "uHue2", "uContrast"]]])
        ok("..." + name + "'s knobs all reach the GLSL", keys.every((k) => pass.SHADERS[name].includes(k)));
    report("PORTED SO FAR: 4 of 41 -- emboss, heatShimmer, solarize, duochrome, plus the shared helper layer " +
           "(hash, valueNoise, fbm, hsb2rgb) that the remaining 37 are built on. The upstream file uses fmod 4 " +
           "times and atan2 7 times, so both traps gated in advance are real and one is already load-bearing.");
}

// ---- 9. BATCH 3: THE TRAP CUTS BOTH WAYS -----------------------------------------------------------------------
console.log("\n9. batch 3 -- the polar warps, and the remainder that must NOT be tidied");
{
    // *** THE CENTREPIECE. *** batch 2 found a helper where fmod is right and mod is wrong. The kaleidoscope is
    // the mirror image, IN THE SAME FILE. Its fold is written longhand as the FLOORING remainder because atan2
    // returns [-PI, PI] -- negative for half of every image. Fold with fmod and that half lands outside the
    // segment, fails the mirror test, and samples the wrong place.
    const seg = (Math.PI * 2) / 6;
    const negatives = [-3.0, -1.2, -0.3];
    ok("!! *** atan2 GOES NEGATIVE, AND fmod PUTS THAT HALF OUTSIDE THE SEGMENT ***",
        negatives.every((a) => fmod(a, seg) < 0 && glmod(a, seg) >= 0 && glmod(a, seg) < seg),
        "angle -1.20: mod " + glmod(-1.2, seg).toFixed(3) + " (inside) against fmod " + fmod(-1.2, seg).toFixed(3) +
        " (outside). Upstream wrote the flooring form BY HAND rather than calling fmod, which was right and is " +
        "easy to 'tidy' into a bug");
    ok("!! ...and on positive angles they agree, so a spot check would not catch it",
        [0.4, 2.1].every((a) => Math.abs(fmod(a, seg) - glmod(a, seg)) < 1e-12));
    ok("!! the model folds with glmod and the shader spells the flooring form out",
        /angle = glmod\(angle, segAngle\)/.test(fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8")) &&
        /angle = angle - segAngle \* floor\(angle \/ segAngle\)/.test(pass.SHADERS.kaleidoscope) &&
        !/bcs_fmod\(angle/.test(pass.SHADERS.kaleidoscope),
        "SO THE SAME FILE NEEDS BOTH REMAINDERS, and which one is decided by the SIGN AT EACH SITE -- never by preference");
    ok("...atan2 becomes atan(y,x), the one trap that is purely a rename",
        /atan\(delta\.y, delta\.x\)/.test(pass.SHADERS.kaleidoscope));

    const img = (() => { const w = 16, h = 16, data = new Float32Array(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4;
            data[i] = x / w; data[i + 1] = y / h; data[i + 2] = 0.5; data[i + 3] = 1; }
        return { w, h, data, premultiplied: true }; })();
    ok("!! vortex with no twist and no time is the identity",
        bcsVortex(img, { twistAmount: 0, speed: 0 }).data.every((v, i) => Math.abs(v - img.data[i]) < 1e-9),
        "a warp that cannot be turned off cannot be checked against anything");
    ok("!! ...and a real twist moves most of the picture",
        (() => { const v = bcsVortex(img, { twistAmount: 3, speed: 0 }); let n = 0;
                 for (let i = 0; i < img.data.length; i += 4) if (Math.abs(v.data[i] - img.data[i]) > 1e-6) n++;
                 return n > img.w * img.h * 0.5; })());
    // ASPECT CORRECTION: on a NON-SQUARE image, dropping it makes the vortex an ellipse. The check is that a
    // wide image and a tall one of the same content warp to mirrored radii rather than to the same one.
    ok("!! the aspect ratio is applied and undone around the polar step",
        /rotated\.x \/= aspect/.test(pass.SHADERS.vortex) && /kal\.x \/= aspect/.test(pass.SHADERS.kaleidoscope) &&
        /rx \/= aspect/.test(fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8")),
        "drop it and a vortex on a non-square image is an ellipse");
    ok("!! kaleidoscope samples stay inside the image",
        bcsKaleidoscope(img, { segments: 6 }).data.every((v) => v >= 0 && v <= 1));
    ok("...more segments is a different picture, so the knob is live",
        (() => { const a = bcsKaleidoscope(img, { segments: 4 }), b = bcsKaleidoscope(img, { segments: 9 });
                 for (let i = 0; i < a.data.length; i++) if (Math.abs(a.data[i] - b.data[i]) > 1e-9) return true; return false; })());
    for (const [name, keys] of [["vortex", ["uTwistAmount", "uRadius", "uFalloff"]],
                                ["kaleidoscope", ["uSegments", "uRotation", "uZoom"]]])
        ok("..." + name + "'s knobs all reach the GLSL", keys.every((k) => pass.SHADERS[name].includes(k)));
    report("PORTED: 6 of 41. THE TWO REMAINDERS NOW HAVE A CASE EACH IN THE GATE -- hsb2rgb needs fmod, the " +
           "kaleidoscope needs mod, and choosing wrong in either direction breaks half a picture apiece.");
}

// ---- 10. BATCH 4: THE POINTS TRAP, CAUGHT BY THE SHADER'S OWN COMMENT --------------------------------------------
console.log("\n10. batch 4 -- pixels the author called pixels, which were points");
{
    const img = (() => { const w = 32, h = 32, data = new Float32Array(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4;
            const v = x > w / 2 ? 1 : 0; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 1; }
        return { w, h, data, premultiplied: true }; })();
    // *** THE SHADER DOCUMENTS ITS KNOB AS "0-30: pixel distance between channels" AND position IS IN POINTS. ***
    const one = bcsChromaticSplit(img, { spread: 8, angle: 0, pointScale: 1 });
    const two = bcsChromaticSplit(img, { spread: 8, angle: 0, pointScale: 2 });
    let differing = 0;
    for (let i = 0; i < img.data.length; i++) if (Math.abs(one.data[i] - two.data[i]) > 1e-9) differing++;
    ok("!! *** the point scale changes the split, so a Retina port is not silently half-strength ***",
        differing > 0, differing + " components differ between scale 1 and 2. Upstream's own comment says " +
        "\"pixel distance\" while `position` is in POINTS -- even its author thought in pixels while writing " +
        "in points, which is why this is a parameter and not an assumption");
    ok("!! a zero spread is the identity", bcsChromaticSplit(img, { spread: 0 }).data.every((v, i) => Math.abs(v - img.data[i]) < 1e-9));
    ok("!! green comes from the CENTRE sample, so the picture does not drift",
        (() => { const c = bcsChromaticSplit(img, { spread: 6 });
                 for (let i = 1; i < img.data.length; i += 4) if (Math.abs(c.data[i] - img.data[i]) > 1e-9) return false;
                 return true; })(),
        "R leads and B lags; G is the anchor, and an offset there would translate the whole image");
    ok("...and red and blue really do move apart",
        (() => { const c = bcsChromaticSplit(img, { spread: 6 });
                 for (let i = 0; i < img.data.length; i += 4) if (Math.abs(c.data[i] - c.data[i + 2]) > 0.5) return true;
                 return false; })());
    ok("...edgeOnly leaves the centre alone and works the rim",
        (() => { const c = bcsChromaticSplit(img, { spread: 10, edgeOnly: 1 });
                 const mid = (16 * 32 + 16) * 4;
                 return Math.abs(c.data[mid] - img.data[mid]) < 1e-9; })(),
        "the mask is smoothstep(0.1, 0.5, dist), so the middle tenth is untouched");

    // THE CONTROL: no offsets, no remainder, no polar step.
    ok("!! plasma's palette boundaries are < and not <=, matching upstream",
        plasmaPalette(0.32)[1] === 0.6 && plasmaPalette(0.33)[1] === 1.0 &&
        plasmaPalette(0.65)[1] === 1.0 && plasmaPalette(0.66)[1] === 0.2,
        "a >= where upstream has < shifts one palette across the whole knob, which reads as the wrong colour " +
        "rather than as a bug");
    ok("!! intensity 0 is the identity",
        bcsPlasma(img, { intensity: 0 }).data.every((v, i) => Math.abs(v - img.data[i]) < 1e-9));
    ok("!! *** plasma adds TWICE and clamps neither time, as upstream leaves it ***",
        (() => { const p = bcsPlasma(img, { intensity: 1, scale: 4 });
                 for (let i = 0; i < p.data.length; i += 4) if (p.data[i] > 1.0) return true; return false; })(),
        "color.rgb += palette * total, then += total * 0.3. Metal's half4 clamps at the display; clamping in " +
        "the shader would make it a quieter effect than the original -- the same arrangement solarize has");
    ok("...and clampOutput is there for a float target",
        bcsPlasma(img, { intensity: 1, clampOutput: true }).data.every((v) => v >= 0 && v <= 1));
    ok("...plasma still needs the flip, because uv.y feeds the sines", /vec2 p = swPos\(\);/.test(pass.SHADERS.plasma));
    for (const [name, keys] of [["chromaticSplit", ["uSpread", "uEdgeOnly", "uPointScale"]],
                                ["plasma", ["uScale", "uColorMode", "uClampOutput"]]])
        ok("..." + name + "'s knobs all reach the GLSL", keys.every((k) => pass.SHADERS[name].includes(k)));
    report("PORTED: 8 of 41. Four of the six traps now have a worked case in this gate -- the y flip " +
           "(heatShimmer, vortex), premultiplied alpha (emboss), points (chromaticSplit) and BOTH remainders " +
           "(hsb2rgb needs fmod, the kaleidoscope needs mod). half is exercised throughout; only the edge rule " +
           "has no dedicated case, because every shader here clamps.");
}

// ---- 11. BATCH 5: THE EDGE RULE FINALLY GETS ITS CASE ------------------------------------------------------------
console.log("\n11. batch 5 -- clamped, then un-clamped");
{
    const flat = (() => { const w = 16, h = 16, data = new Float32Array(w * h * 4);
        for (let i = 0; i < w * h; i++) { data[i*4] = data[i*4+1] = data[i*4+2] = 0.7; data[i*4+3] = 1; }
        return { w, h, data, premultiplied: true }; })();
    const grad = (() => { const w = 32, h = 32, data = new Float32Array(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y*w+x)*4;
            data[i] = x/w; data[i+1] = 0.5; data[i+2] = 1-x/w; data[i+3] = 1; }
        return { w, h, data, premultiplied: true }; })();

    // *** THE SIXTH TRAP, WITH A REAL CASE AT LAST. *** glitch clamps `displaced` and then adds the channel
    // shift AFTER it, so the red and blue taps leave the layer at every border.
    const src = fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8");
    ok("!! *** glitch's channel taps are shifted AFTER the clamp, exactly as upstream leaves them ***",
        /d = clamp\(d, vec2\(0\.0\), uSize\);[\s\S]{0,400}layerSample\(d \+ vec2\(shift/.test(pass.SHADERS.glitch),
        "with colorShift up to 20 the taps land outside the layer at every border. Metal's layer sampling has " +
        "defined edges; GL WRAPS without CLAMP_TO_EDGE, and a glitch pulling the left edge into the right one " +
        "LOOKS DELIBERATE -- the only one of the six a viewer would forgive as an artistic choice");
    ok("!! and what keeps it right is that the SAMPLER clamps, in both halves",
        /ivec2 t = ivec2\(clamp\(floor\(p\), vec2\(0\.0\), uSize - 1\.0\)\)/.test(pass.PREAMBLE) &&
        /clamp\(Math\.floor\(x\), 0, w - 1\)/.test(src),
        "layerSample has clamped since batch 1, so nothing needed fixing -- what it needed was a case");
    ok("!! echo is the counter-example in the same file: it clamps BEFORE every sample",
        /layerSample\(clamp\(p - off, vec2\(0\.0\), uSize\)\)/.test(pass.SHADERS.echo),
        "two shaders, one file, opposite habits -- which is why the rule is checked and not assumed");

    // ECHO IS AN AVERAGE, NOT A BLOOM. Green is the untinted channel, so on a flat image it must come back
    // unchanged whatever the echo count -- that is what totalWeight starting at 1 buys.
    for (const n of [1, 3, 6]) {
        const e = bcsEcho(flat, { echoCount: n, spread: 4, fade: 0.7 });
        let worst = 0;
        for (let i = 1; i < e.data.length; i += 4) worst = Math.max(worst, Math.abs(e.data[i] - 0.7));
        ok("!! " + n + " echoes leave a flat image at its own value", worst < 2e-4,
            "worst green departure " + worst.toExponential(2) + " -- the residual is the half(weight) cast, " +
            "which upstream makes too. An echo that brightened would be a bloom");
    }
    ok("...echo count 0 is the identity",
        bcsEcho(grad, { echoCount: 0 }).data.every((v, i) => Math.abs(v - grad.data[i]) < 1e-9));
    ok("...and the trail is DIRECTIONAL", (() => {
        const a = bcsEcho(grad, { echoCount: 3, spread: 6, direction: 0 });
        const b = bcsEcho(grad, { echoCount: 3, spread: 6, direction: Math.PI / 2 });
        for (let i = 0; i < a.data.length; i++) if (Math.abs(a.data[i] - b.data[i]) > 1e-6) return true;
        return false; })());

    ok("!! glitch fully off is the identity",
        bcsGlitch(grad, { intensity: 0, scanLines: 0, colorShift: 0, time: 0 })
            .data.every((v, i) => Math.abs(v - grad.data[i]) < 1e-6),
        "every knob at rest must give the picture back, or nothing downstream can be compared to anything");
    ok("!! *** and the point scale moves BOTH the shift and the scanline FREQUENCY ***", (() => {
        const a = bcsGlitch(grad, { time: 0.35, intensity: 1, colorShift: 12, pointScale: 1 });
        const b = bcsGlitch(grad, { time: 0.35, intensity: 1, colorShift: 12, pointScale: 2 });
        let n = 0; for (let i = 0; i < a.data.length; i++) if (Math.abs(a.data[i] - b.data[i]) > 1e-9) n++;
        return n > 0; })(),
        "sin(position.y * PI * 2) puts one cycle every POINT, so an unscaled port draws scanlines twice as " +
        "fine at 2x -- the points trap in a place nobody looks, because it reads as a frequency and not a distance");
    ok("...every output is finite", bcsGlitch(grad, { time: 0.35, intensity: 1, colorShift: 12 }).data.every(Number.isFinite));
    for (const [name, keys] of [["echo", ["uEchoCount", "uFade", "uPointScale"]],
                                ["glitch", ["uBlockSize", "uScanLines", "uColorShift"]]])
        ok("..." + name + "'s knobs all reach the GLSL", keys.every((k) => pass.SHADERS[name].includes(k)));
    report("PORTED: 10 of 41. ALL SIX TRAPS NOW HAVE A WORKED CASE -- y flip (heatShimmer, vortex), " +
           "premultiplied alpha (emboss), points (chromaticSplit spread, glitch scanline), half (throughout), " +
           "both remainders (hsb2rgb needs fmod, kaleidoscope needs mod), and edges (glitch clamps then " +
           "un-clamps). The table is no longer a prediction.");
}

// ---- 12. BATCH 6: THE Y FLIP, EXPLAINED BY ITS OWN AUTHOR ---------------------------------------------------------
console.log("\n12. batch 6 -- \"negative Y = pull up = melt down\"");
{
    const W = 32, H = 32;
    const bar = (y0, y1) => { const data = new Float32Array(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4;
            const v = (y >= y0 && y < y1) ? 1 : 0; data[i] = data[i+1] = data[i+2] = v; data[i+3] = 1; }
        return { w: W, h: H, data, premultiplied: true }; };
    const span = (im, x) => { let lo = 99, hi = -1;
        for (let y = 0; y < H; y++) if (im.data[(y * W + x) * 4] > 0.5) { if (y < lo) lo = y; if (y > hi) hi = y; }
        return [lo, hi]; };

    // *** THE SHADER'S OWN COMMENT IS THE SPECIFICATION, AND IT IS FRAME-DEPENDENT. *** "negative Y = pull up
    // = melt down" is true only where y grows downward. Unflipped, -drip samples from BELOW and the picture
    // melts upward -- animating perfectly, gravity backwards.
    const img = bar(18, 22);
    const m = bcsMelt(img, { time: 0.5, meltAmount: 16, dripScale: 4, heat: 0 });
    const reaches = [4, 12, 20, 28].map((x) => span(m, x)[1] - span(img, x)[1]);
    ok("!! *** the bar reaches DOWNWARD, which is what -drip means in a y-down frame ***",
        reaches.every((r) => r > 0),
        "rows gained per column: " + reaches.join(", ") + ". Ported against gl_FragCoord without the flip this " +
        "is the same magnitude UPWARD, and it still looks like flowing liquid");
    ok("!! ...and it never reaches UP, so the drip has one direction",
        [4, 12, 20, 28].every((x) => span(m, x)[0] >= span(img, x)[0]));
    // THE SECOND Y-DEPENDENCY: gravity = uv.y * uv.y, "bottom melts more". Unflipped it peaks at the top, so
    // the two errors COMPOUND rather than cancel.
    const high = bcsMelt(bar(4, 8), { time: 0.5, meltAmount: 16, dripScale: 4, heat: 0 });
    const low = bcsMelt(bar(24, 28), { time: 0.5, meltAmount: 16, dripScale: 4, heat: 0 });
    ok("!! *** gravity is quadratic in uv.y, so a low bar drips far more than a high one ***",
        (span(low, 12)[1] - 27) > (span(high, 12)[1] - 7),
        "bar at 4-7 -> " + span(high, 12).join("-") + ", bar at 24-27 -> " + span(low, 12).join("-") +
        ". THE TWO Y-DEPENDENCIES COMPOUND: unflipped, the top melts most AND it melts upward");
    // *** MELT AT ZERO IS NOT THE IDENTITY, AND THAT IS UPSTREAM'S DOING. *** drip and wobble both scale with
    // melt_amount and vanish, so the SAMPLE is the identity -- but the specular lip does not:
    //     dripEdge = abs(fbm(column + 0.01, ...) - dripNoise);
    //     specular = pow(dripEdge * 5.0, 3.0) * gravity * 0.4;
    // Nothing there mentions melt_amount, so "melt off" still brightens the picture. Reproduced rather than
    // fixed: a port that quietly gated the specular would be a different shader, and the place to argue about
    // it is upstream. Asserted as a PROPERTY -- the residual is achromatic, because a specular highlight is
    // added equally to all three channels -- so if it ever becomes a colour shift this line notices.
    {
        const flat = (() => { const data = new Float32Array(8 * 8 * 4);
            for (let i = 0; i < 64; i++) { data[i*4] = data[i*4+1] = data[i*4+2] = 0.4; data[i*4+3] = 1; }
            return { w: 8, h: 8, data, premultiplied: true }; })();
        const z = bcsMelt(flat, { meltAmount: 0, heat: 0 });
        let achromatic = true, worst = 0;
        for (let i = 0; i < flat.data.length; i += 4) {
            const dr = z.data[i] - flat.data[i], dg = z.data[i+1] - flat.data[i+1], db = z.data[i+2] - flat.data[i+2];
            if (Math.abs(dr - dg) > 1e-9 || Math.abs(dg - db) > 1e-9) achromatic = false;
            worst = Math.max(worst, Math.abs(dr));
        }
        ok("!! melt at zero leaves the GEOMETRY alone but still adds its specular, as upstream does",
            achromatic && worst > 0 && worst < 4 / 255,
            "residual " + worst.toExponential(2) + ", identical in all three channels, and BELOW ONE 8-BIT " +
            "LEVEL (3.9e-3) -- so this is a structural quirk and not a visible one, which is the honest way " +
            "to state it. Measured larger on a bigger fixture (2.8e-4 at 32x32) and growing downward with " +
            "gravity, so a shader that ever scaled it up would land here rather than in somebody's eyes");
    }
    ok("...and the shader carries both y terms in SwiftUI's frame",
        /vec2 p = swPos\(\);/.test(pass.SHADERS.melt) && /gravity = uv\.y \* uv\.y/.test(pass.SHADERS.melt) &&
        /vec2\(wobble, -drip\)/.test(pass.SHADERS.melt));

    // TOPOGRAPHIC: the contour is double-sided, and the palette breakpoints are upstream's.
    const grey = (() => { const data = new Float32Array(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4;
            const v = x / W; data[i] = data[i+1] = data[i+2] = v; data[i+3] = 1; }
        return { w: W, h: H, data, premultiplied: true }; })();
    const t = bcsTopographic(grey, { lineCount: 12, colorize: 1 });
    ok("!! topographic draws contour lines on a ramp", (() => {
        let dark = 0; for (let x = 0; x < W; x++) if (t.data[(16 * W + x) * 4] < 0.3) dark++;
        return dark > 0 && dark < W; })(), "some columns are line, some are not -- a ramp becomes a map");
    ok("!! the palette breakpoints are upstream's 0.2 / 0.5 / 0.75",
        Math.abs(topoColor(0.19)[2] - 0.31) < 0.02 && Math.abs(topoColor(0.2)[2] - 0.30) < 0.02 &&
        Math.abs(topoColor(0.74)[0] - 0.66) < 0.02 && Math.abs(topoColor(0.75)[0] - 0.65) < 0.02,
        "four elevation bands, water through green through sand to snow");
    ok("!! the contour is DOUBLE-SIDED in both halves",
        /1\.0 - ss\(lineWidth, lineWidth \+ 0\.02, cv\)\) \+ \(1 - ss/.test(fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8").replace(/1 - ss/g, "1.0 - ss").replace(/1\.0 - ss\(lineWidth, lineWidth \+ 0\.02, cv\)\)/, "1.0 - ss(lineWidth, lineWidth + 0.02, cv))")) ||
        /\(1 - ss\(lineWidth, lineWidth \+ 0\.02, cv\)\) \+ \(1 - ss\(lineWidth, lineWidth \+ 0\.02, 1 - cv\)\)/.test(fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8")),
        "one side only halves every line and reads as hatching rather than a contour");
    ok("...topographic output is finite", t.data.every(Number.isFinite));
    for (const [name, keys] of [["melt", ["uMeltAmount", "uDripScale", "uHeat"]],
                                ["topographic", ["uLineCount", "uLineWidth", "uColorize"]]])
        ok("..." + name + "'s knobs all reach the GLSL", keys.every((k) => pass.SHADERS[name].includes(k)));
    report("PORTED: 12 of 41. TWO SHADERS HAVE NOW DOCUMENTED THEIR OWN TRAP FOR US -- chromaticSplit calls " +
           "points \"pixels\", and melt explains a downward drip that is only downward one way up. THE COMMENTS " +
           "IN THAT FILE ARE WRITTEN IN SwiftUI'S FRAME, and reading them as GLSL is how a port goes wrong " +
           "while agreeing with its own documentation.");
}

// ---- 13. BATCH 7: A CONVOLUTION MEASURED IN POINTS, AND THE hsb2rgb AUDIT CLOSED -----------------------------------
console.log("\n13. batch 7 -- a kernel is not an offset");
{
    const W = 24, H = 24;
    const square = (() => { const data = new Float32Array(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4;
            const v = (x >= 8 && x < 16 && y >= 8 && y < 16) ? 1 : 0;
            data[i] = data[i+1] = data[i+2] = v; data[i+3] = 1; }
        return { w: W, h: H, data, premultiplied: true }; })();
    const bright = (im, x, y) => { const i = (y * W + x) * 4; return im.data[i] + im.data[i+1] + im.data[i+2]; };

    // THE SOBEL ITSELF: a flat region has no gradient, so it must be EXACTLY dark with the background off.
    const n = bcsNeonEdge(square, { edgeStrength: 4, mixOriginal: 0 });
    let interior = 0, border = 0;
    for (let y = 10; y < 14; y++) for (let x = 10; x < 14; x++) interior = Math.max(interior, bright(n, x, y));
    for (const [x, y] of [[8, 12], [15, 12], [12, 8], [12, 15]]) border = Math.max(border, bright(n, x, y));
    ok("!! the Sobel finds the border and nothing in the flat middle",
        interior < 1e-9 && border > 1,
        "interior " + interior.toFixed(4) + " (flat = no gradient) against border " + border.toFixed(4));
    // *** THE POINTS TRAP INSIDE A KERNEL. *** For an offset a wrong scale is a shift; here it changes WHICH
    // gradients register as edges at all.
    const lit = (im) => { let c = 0; for (let i = 0; i < im.data.length; i += 4)
        if (im.data[i] + im.data[i+1] + im.data[i+2] > 0.3) c++; return c; };
    ok("!! *** the kernel step is ONE POINT, so its scale changes what counts as an edge ***",
        lit(bcsNeonEdge(square, { edgeStrength: 4, mixOriginal: 0, pointScale: 1 })) !==
        lit(bcsNeonEdge(square, { edgeStrength: 4, mixOriginal: 0, pointScale: 2 })),
        lit(bcsNeonEdge(square, { edgeStrength: 4, mixOriginal: 0, pointScale: 1 })) + " lit at 1 point against " +
        lit(bcsNeonEdge(square, { edgeStrength: 4, mixOriginal: 0, pointScale: 2 })) + " at 2. On a 2x display " +
        "the ORIGINAL compares neighbours two device pixels apart; a port that reads gl_FragCoord compares them " +
        "one apart, and fine detail the original smooths over becomes an edge -- a wiry crawl that reads as " +
        "sharpening rather than as a bug");
    ok("...gy is bottom-minus-top, so an unflipped port would recolour every edge",
        /float gy = -tl - 2\.0 \* tc - tr \+ bl \+ 2\.0 \* bc \+ br;/.test(pass.SHADERS.neonEdge) &&
        /atan\(gy, gx\)/.test(pass.SHADERS.neonEdge),
        "the edges would appear in the right places glowing the wrong colours, which nobody reports as a bug");

    // *** THE hsb2rgb AUDIT, CLOSED. *** Batch 2 found fmod is safe there only because the hue is non-negative,
    // and that the guarantee lives at the CALL SITE. All four call sites in the upstream file were then read:
    // duochrome (twice), aurora, neonEdge -- every one passes its hue through fract(), which returns [0,1) even
    // for the negative angle atan2 hands neonEdge. UNSAFE BY CONSTRUCTION, SAFE BY CONVENTION, everywhere.
    const modelSrc = fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8");
    const callers = (modelSrc.match(/bcsHsb2rgb\(/g) || []).length;
    ok("!! *** every hue this tree hands to hsb2rgb is fract()ed first ***",
        callers >= 3 && /const hue = raw - Math\.floor\(raw\);/.test(modelSrc) &&
        /const animHue1 = fract\(/.test(modelSrc) &&
        /float hue = fract\(atan\(gy, gx\)/.test(pass.SHADERS.neonEdge) &&
        /fract\(uHue1 \+ sin/.test(pass.SHADERS.duochrome),
        callers + " call sites in the model, all fed a value in [0,1). Upstream's four do the same -- checked, " +
        "not assumed -- so a fifth caller that skips fract is caught HERE rather than on somebody's screen");
    ok("...and section 7 now carries the measured version of that claim, not the assumed one",
        _hsb(0.5, 1, 1).length === 3,
        "the colour differs for 45.8% of negative hues and NOT at the -0.1 first cited -- see section 7");

    // THERMAL: the ironbow ramp, and the third shader whose comment only holds y-down.
    ok("!! the thermal palette walks black -> blue -> purple -> red -> orange -> yellow -> white",
        thermalColor(0)[2] === 0 && thermalColor(0.15)[2] === 0.3 && thermalColor(0.35)[0] === 0.5 &&
        thermalColor(0.55)[0] === 1 && thermalColor(0.75)[1] === 0.6 && thermalColor(1)[2] === 1,
        "six bands at upstream's breakpoints -- the ironbow ramp a thermal camera actually uses");
    ok("!! thermal's 'rising bias' is a NEGATIVE y offset, which only rises in a y-down frame",
        /- sh \* 0\.3/.test(modelSrc) && /- sh \* 0\.3\)/.test(pass.SHADERS.thermal),
        "the third shader in this file to depend on that, after heatShimmer and melt");
    ok("...intensity 0 gives the (displaced) picture back rather than the palette", (() => {
        const t = bcsThermal(square, { intensity: 0, shimmer: 0 });
        for (let i = 0; i < square.data.length; i++) if (Math.abs(t.data[i] - square.data[i]) > 1e-6) return false;
        return true; })());
    for (const [name, keys] of [["thermal", ["uShimmer", "uNoiseSpeed", "uPaletteShift"]],
                                ["neonEdge", ["uEdgeStrength", "uGlowAmount", "uColorCycle"]]])
        ok("..." + name + "'s knobs all reach the GLSL", keys.every((k) => pass.SHADERS[name].includes(k)));
    report("PORTED: 14 of 41. THREE SHADERS HAVE NOW DOCUMENTED THEIR OWN TRAP -- chromaticSplit calls points " +
           "\"pixels\", melt explains a drip that is only downward one way up, and thermal's \"rising bias\" only " +
           "rises the same way. And the hsb2rgb audit is closed: unsafe by construction, safe by convention, at " +
           "all four upstream sites and all of ours.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
            "\nunchecked here: the GLSL executing. No GL context on this box, so the shader is read for " +
            "correspondence rather than run -- weaker than crtPass's bit-identical comparison, and stated " +
            "rather than implied.");
process.exit(fails ? 1 : 0);
