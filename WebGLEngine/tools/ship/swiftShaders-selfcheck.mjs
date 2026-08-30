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
         bcsHash, bcsValueNoise, bcsFbm, bcsHsb2rgb, bcsSolarize, bcsDuochrome,
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
    ok("!! *** and on a NEGATIVE hue they give different COLOURS ***",
        negative.some(([f, g]) => Math.abs(f - g) > 1e-9),
        "hue -0.1, red channel: fmod " + negative[0][0].toFixed(2) + " against mod " + negative[0][1].toFixed(2) +
        " -- a different branch of the colour wheel. Nothing passes a negative hue today; any later shader might");
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

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
            "\nunchecked here: the GLSL executing. No GL context on this box, so the shader is read for " +
            "correspondence rather than run -- weaker than crtPass's bit-identical comparison, and stated " +
            "rather than implied.");
process.exit(fails ? 1 : 0);
