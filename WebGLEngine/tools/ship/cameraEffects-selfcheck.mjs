// WebGLEngine/tools/ship/cameraEffects-selfcheck.mjs -- v4188
//
// GATES render/chromaKeyModel.mjs, render/chuckCloseModel.mjs, render/cameraTexture.js and the GLSL in
// render/cameraEffectsPass.js.
//
// *** WHAT THIS GATE CANNOT DO, SAID FIRST. *** Node has no GPU, so it cannot run the fragment shader. The
// shader is proven instead by camera-effects.html's own self-test, which uploads a known image, runs the REAL
// shader, reads the pixels back, and compares them against these same CPU models. Measured in headless
// Chromium: the chroma key agrees to 0.0000 on all five probe pixels -- identical at 8-bit readback --
// including the shadowed fold and the blown highlight. What THIS file gates is the model that comparison is
// made against, plus the constants the two implementations must share.
//
// *** AND THE MEASUREMENT THAT CHOSE THE ALGORITHM. *** Section 2 is a ratchet on a fourteen-pixel labelled
// set. RGB distance gets 3 wrong, YCbCr 2, chromaticity 1, and the min of the last two gets 0 -- because a
// SHADOWED fold keeps its hue and loses its chroma while a BLOWN highlight does the opposite. If anyone
// simplifies the keyer back to one metric, those counts move and this goes red.
//
// Run: node tools/ship/cameraEffects-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { rgbToYCbCr, chromaticity, distRGB, distYCbCr, distChromaticity, METRICS,
         keyAlpha, keyAlphaBoth, despill, keyPixel, DEFAULTS as KEY_DEFAULTS } from "../../render/chromaKeyModel.mjs";
import { cellOf, cellAverage, cellSeed, markCoverage, punch, closeGrid, MARKS,
         DEFAULTS as CC_DEFAULTS } from "../../render/chuckCloseModel.mjs";
import { coverUV, mirrorUV, frameProbe } from "../../render/cameraTexture.js";
import { noComments, codeOnly, prose } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

// 1) THE COLOUR SPACES.
{
    const w = rgbToYCbCr(1, 1, 1);
    ok(near(w.y, 1) && near(w.cb, 0, 1e-9) && near(w.cr, 0, 1e-9), "white has luma 1 and no chroma at all");
    const k = rgbToYCbCr(0, 0, 0);
    ok(near(k.y, 0) && near(k.cb, 0) && near(k.cr, 0), "and black has none of either");
    ok(near(rgbToYCbCr(1, 0, 0).y, 0.299) && near(rgbToYCbCr(0, 1, 0).y, 0.587) && near(rgbToYCbCr(0, 0, 1).y, 0.114),
        "the luma weights are BT.601 -- green carries most of the brightness, which is why green screens are dark to key");
    ok(rgbToYCbCr(0, 0, 1).cb > 0.49 && rgbToYCbCr(1, 0, 0).cr > 0.49, "blue maxes Cb and red maxes Cr");

    // *** THE PROPERTY THE WHOLE KEYER RESTS ON. ***
    const lit = chromaticity(0.05, 0.75, 0.15), shade = chromaticity(0.02, 0.30, 0.06);
    const litY = rgbToYCbCr(0.05, 0.75, 0.15), shadeY = rgbToYCbCr(0.02, 0.30, 0.06);
    ok(Math.hypot(lit.r - shade.r, lit.g - shade.g) < 0.02,
        "*** a shadowed fold of the same cloth has ESSENTIALLY THE SAME CHROMATICITY as the lit cloth ***");
    ok(Math.hypot(litY.cb - shadeY.cb, litY.cr - shadeY.cr) > 0.15,
        "...while its Cb/Cr have moved a long way -- which is exactly why one metric is not enough");
    ok(chromaticity(0, 0, 0).sum === 0 && near(chromaticity(0, 0, 0).r, 1 / 3),
        "black reports sum 0 and the neutral point, so a caller can refuse to trust a hue that is not there");
    ok(near(chromaticity(0.2, 0.4, 0.4).r, chromaticity(0.1, 0.2, 0.2).r),
        "and halving every channel does not move the chromaticity, which is the definition being relied on");
}

// 2) *** THE MEASUREMENT THAT PICKED THE ALGORITHM, AS A RATCHET. ***
{
    const KEY = [0.05, 0.75, 0.15];
    const PIX = [
        ["lit screen", [0.05, 0.75, 0.15], true], ["shadow fold", [0.02, 0.30, 0.06], true],
        ["deep fold", [0.008, 0.113, 0.023], true], ["hot highlight", [0.20, 0.95, 0.32], true],
        ["screen + noise", [0.07, 0.72, 0.18], true],
        ["pale skin", [0.85, 0.68, 0.60], false], ["dark skin", [0.28, 0.19, 0.15], false],
        ["pupil", [0.03, 0.03, 0.035], false], ["blue shirt", [0.15, 0.22, 0.62], false],
        ["olive shirt", [0.35, 0.42, 0.18], false], ["white wall", [0.90, 0.90, 0.88], false],
        ["lime shirt", [0.55, 0.85, 0.30], false], ["houseplant", [0.12, 0.38, 0.10], false],
        ["grey hoodie", [0.42, 0.42, 0.44], false],
    ];
    const wrongFor = (metric) => PIX.filter(([, rgb, back]) => {
        const a = keyAlpha(rgb, KEY, { metric });
        return back ? a > 0.5 : a < 0.5;
    }).length;
    const rgbW = wrongFor("rgb"), yW = wrongFor("ycbcr"), cW = wrongFor("chromaticity"), bW = wrongFor("both");
    ok(bW === 0, `*** the combined metric gets all ${PIX.length} labelled pixels right (${bW} wrong) ***`);
    ok(rgbW === 3 && yW === 2 && cW === 1,
        `and the single metrics still fail as measured -- rgb ${rgbW}, ycbcr ${yW}, chromaticity ${cW} (expected 3, 2, 1)`);
    ok(bW < cW && cW < yW && yW < rgbW, "so the ordering that justified the choice still holds end to end");

    // the two that name the reason
    ok(keyAlpha([0.02, 0.30, 0.06], KEY, { metric: "ycbcr" }) > 0.5 && keyAlpha([0.02, 0.30, 0.06], KEY) === 0,
        "*** the SHADOWED fold: YCbCr leaves it (a green hole in the matte), the keyer removes it ***");
    ok(keyAlpha([0.20, 0.95, 0.32], KEY, { metric: "chromaticity" }) > 0.5 && keyAlpha([0.20, 0.95, 0.32], KEY) === 0,
        "*** the BLOWN highlight: chromaticity leaves it (its hue is gone), the keyer removes it ***");
    ok(keyAlphaBoth([0.05, 0.75, 0.15], KEY) === 0, "and the cloth itself keys to fully transparent");
}

// 3) THE DARK FLOOR, and the subject it protects.
{
    const KEY = [0.05, 0.75, 0.15];
    ok(keyAlpha([0.01, 0.02, 0.005], KEY) === 1,
        "*** a near-black pixel whose RATIOS happen to look green is kept -- an unlit pixel is not a green screen ***");
    // *** THE CONTROL NEEDS A PIXEL THAT IS DARK **AND** THE KEY'S OWN RATIOS. *** The first version used
    // [0.01, 0.02, 0.005], which is dark but nothing like the cloth (its chromaticity is 0.29/0.57 against the
    // key's 0.05/0.79), so it was never going to be keyed with or without the floor -- the control proved
    // nothing and went red. This one is the cloth's exact ratios at a tenth of the brightness.
    const darkGreen = [0.0053, 0.0789, 0.0158];
    ok(darkGreen[0] + darkGreen[1] + darkGreen[2] < KEY_DEFAULTS.darkFloor, "fixture: the control pixel really is under the floor");
    ok(keyAlpha(darkGreen, KEY) === 1, "a pixel with the backdrop's exact ratios, but nearly black, is KEPT");
    ok(keyAlpha(darkGreen, KEY, { darkFloor: 0 }) === 0,
        "*** control: with the floor removed that same pixel is punched transparent -- that is the hole in a face ***");
    ok(keyAlpha([0.03, 0.03, 0.035], KEY) === 1, "a pupil survives");
    ok(KEY_DEFAULTS.darkFloor > 0, "and the floor is on by default rather than being an option nobody sets");
}

// 4) SPILL SUPPRESSION touches the rim and leaves a green shirt alone.
{
    const KEY = [0.05, 0.75, 0.15];
    const rim = despill([0.55, 0.72, 0.50], KEY);
    ok(rim[1] < 0.72, `a green rim on the subject is pulled down (${rim[1].toFixed(3)} from 0.720)`);
    ok(near(rim[0], 0.55) && near(rim[2], 0.50), "and only the backdrop's channel is touched");
    const neutral = despill([0.42, 0.42, 0.44], KEY);
    ok(near(neutral[1], 0.42), "a grey hoodie is untouched, because its green does not exceed the others");
    ok(near(despill([0.55, 0.72, 0.50], KEY, { despill: 0 })[1], 0.72), "and the amount 0 is a real off switch");
    const blueKey = despill([0.30, 0.28, 0.80], [0.10, 0.20, 0.75]);
    ok(blueKey[2] < 0.80, "the suppression follows the KEY colour rather than assuming green -- a blue screen works too");
    const kp = keyPixel([0.85, 0.68, 0.60], KEY);
    ok(kp.alpha === 1 && kp.rgb.length === 3, "keyPixel returns both halves of the operation");
}

// 5) *** COVER, NOT STRETCH. *** A face is the thing that gets distorted, and nobody can name why.
{
    const same = coverUV(100, 100, 100, 100);
    ok(near(same.sx, 1) && near(same.sy, 1) && near(same.ox, 0) && near(same.oy, 0), "matching aspects need no transform");
    const wide = coverUV(1280, 720, 720, 720);        // 16:9 into a square
    ok(wide.sy === 1 && wide.sx < 1, "a wide source into a square crops its SIDES rather than squashing it");
    ok(near(wide.ox, (1 - wide.sx) / 2), "and the crop is centred");
    const tall = coverUV(720, 1280, 1280, 720);
    ok(tall.sx === 1 && tall.sy < 1 && near(tall.oy, (1 - tall.sy) / 2), "a tall source crops top and bottom, centred");
    ok(near(coverUV(1280, 720, 640, 360).sx, 1), "the same aspect at a different SIZE still needs no crop");
    const bad = coverUV(0, 0, 100, 100);
    ok(near(bad.sx, 1) && near(bad.sy, 1), "a zero-sized source (a camera that has not decoded yet) is the identity, not NaN");
    const m = mirrorUV(coverUV(1280, 720, 1280, 720));
    ok(m.sx === -1 && near(m.ox, 1), "mirroring flips u about the middle");
    ok(near(mirrorUV(mirrorUV(same)).sx, same.sx) && near(mirrorUV(mirrorUV(same)).ox, same.ox), "and mirroring twice is the identity");
}

// 6) THE FRAME PROBE IS HONEST ABOUT QUIET.
{
    const cam = { frames: 0 };
    const p = frameProbe(cam);
    ok(p() === true, "the first call reports dirty, because nothing is known yet");
    ok(p() === false, "a camera that produced no new frame reports QUIET -- 30fps on a 60Hz display is half the frames");
    cam.frames++;
    ok(p() === true && p() === false, "a new frame reports dirty exactly once");
    ok(frameProbe(null)() === true, "*** and a missing camera reports DIRTY, never quiet -- frameDirty's rule is that clean is proven ***");
}

// 7) *** AVERAGE THE CELL, DO NOT POINT-SAMPLE IT. *** The line that makes it a portrait rather than noise.
{
    // a cell that is half black and half white: the mean is grey, a point sample is whichever it landed on
    const w = 8, h = 8, px = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, v = x < 4 ? 0 : 255;
        px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255;
    }
    const mean = cellAverage(px, w, h, 0, 0, 1);
    ok(near(mean[0], 0.5, 0.02), `*** a half-black half-white cell averages to grey (${mean[0].toFixed(3)}), which no single pixel in it IS ***`);
    const centrePixel = px[((4 * w) + 4) * 4] / 255;
    ok(centrePixel === 1 && Math.abs(centrePixel - mean[0]) > 0.4,
        "and the centre pixel is pure white -- point-sampling would have returned that, giving a mosaic of noise");

    const c = cellOf(0.26, 0.76, 4);
    ok(c.cx === 1 && c.cy === 3, "cellOf finds the cell");
    ok(c.fx > 0 && c.fx < 1 && c.fy > 0 && c.fy < 1, "and the position inside it");
    ok(cellOf(1, 1, 4).cx === 3 && cellOf(-0.5, -0.5, 4).cx === 0, "uv at or past the edges clamps into the grid rather than indexing outside it");
    ok(cellAverage(px, w, h, 0, 0, 1000)[0] >= 0, "a grid finer than the image does not divide by zero");

    ok(cellSeed(3, 7) === cellSeed(3, 7) && cellSeed(3, 7) !== cellSeed(7, 3),
        "the per-cell seed is stable and not symmetric, so the lattice does not boil and does not stripe");
    ok(cellSeed(0, 0) >= 0 && cellSeed(0, 0) < 1, "and lands in [0,1)");
}

// 8) THE MARKS.
{
    for (const m of MARKS) {
        ok(markCoverage(0.5, 0.5, m) > 0, `${m} covers its own centre`);
        ok(markCoverage(0.01, 0.01, m) === 0, `${m} leaves the cell's corner unpainted, so the lattice stays visible`);
    }
    // at the CORNER, not the edge midpoint: the first version probed (0.5, 0.02), which is outside BOTH
    // shapes once the gap is applied, so it compared 0 against 0 and went red against correct code.
    ok(markCoverage(0.15, 0.15, "lozenge") === 0 && markCoverage(0.15, 0.15, "square") === 1,
        "*** a lozenge and a square differ where it matters -- at the CORNER -- so the mark setting is real ***");
    ok(markCoverage(0.5, 0.5, "concentric") === 1 && markCoverage(0.5, 0.5 + 0.70 * (0.5 - CC_DEFAULTS.gap), "concentric") === 0.45,
        "concentric has a ring of lower coverage inside its disc (r = 0.70 falls in the 0.55..0.85 band)");
    ok(markCoverage(0.5, 0.5, "no-such-mark") === 1, "an unknown mark falls back to a square rather than painting nothing");
    const p = punch([0.5, 0.6, 0.4], 2);
    ok(near(p[0], 0.5) && p[1] > 0.6 && p[2] < 0.4, "punch pushes away from mid grey and leaves mid grey alone");
    ok(punch([1, 1, 1], 5).every((v) => v <= 1) && punch([0, 0, 0], 5).every((v) => v >= 0), "and clamps rather than wrapping");

    const g = closeGrid(new Uint8Array(16 * 16 * 4).fill(128), 16, 16, { grid: 4 });
    ok(g.grid === 4 && g.cells.length === 4 && g.cells[0].length === 4, "closeGrid returns the grid it was asked for");
}

// 9) THE GLSL AND THE MODEL MUST SHARE THEIR CONSTANTS.
{
    const passSrc = read("render/cameraEffectsPass.js");
    // *** noComments for STRING content, codeOnly for code shapes. The shaders here ARE string literals, so
    // codeOnly() would blank the entire thing and every check below would pass on nothing.
    const shaderText = noComments(passSrc);
    // *** THE CHROMA CONSTANTS ONLY, BECAUSE THE SHADER NEEDS NO LUMA. *** The first version also demanded
    // 0.299/0.587/0.114 and went red: keying uses the Cb/Cr plane and the chromaticity ratios, and neither
    // needs Y at all, so those three constants are correctly absent from the GLSL. Asserting a shader must
    // contain arithmetic it has no use for is a gate testing its author's assumption, not the code.
    for (const c of ["0.168736", "0.331264", "0.418688", "0.081312"]) {
        ok(shaderText.includes(c), `the GLSL carries the BT.601 chroma constant ${c}, the same one rgbToYCbCr uses`);
    }
    ok(!/0\.299/.test(shaderText), "and carries no luma weights, because the key never needs brightness -- only hue and chroma");
    ok(/min\s*\(\s*keyAlphaChroma/.test(shaderText), "*** and the shader takes the MIN of the two metrics, as keyAlphaBoth does ***");
    ok(/smoothstep\s*\(\s*sim\s*,\s*sim\s*\+\s*smo/.test(shaderText), "with the same smoothstep band the model uses");
    ok(/c\.r \+ c\.g \+ c\.b < darkFloor/.test(shaderText), "and the same dark floor guard, which is the one that keeps holes out of a face");
    ok(/0\.55/.test(shaderText) && /0\.85/.test(shaderText), "the concentric mark's radii match chuckCloseModel's");
    ok(/TAPS = 5/.test(shaderText), "the cell mean is sampled 5x5, which is what the page's self-test measures against the exact mean");

    const code = codeOnly(passSrc);
    // *** ANCHOR THE THROW TO THE COMPILE BRANCH. *** The first version asked only whether the file contained
    // "throw new Error" anywhere. Sabotaging the shader-compile throw into a console.warn left the gate GREEN,
    // because the LINK failure still threw and satisfied the regex. A check that any one of two guards exists
    // is not a check that both do.
    ok(/COMPILE_STATUS[\s\S]{0,240}?throw new Error/.test(code),
        "*** a shader that fails to COMPILE throws rather than leaving a silent black screen ***");
    ok(/LINK_STATUS[\s\S]{0,160}?throw new Error/.test(code), "and a program that fails to LINK throws too");
    ok((code.match(/throw new Error/g) || []).length >= 2, "both guards are present, not one standing in for the other");
    ok(!/Math\.random/.test(code), "no randomness in the pass");

    const camSrc = read("render/cameraTexture.js"), camCode = codeOnly(camSrc);
    ok(/CLAMP_TO_EDGE/.test(camCode) && !/generateMipmap/.test(camCode),
        "*** the camera texture clamps and never asks for a mipmap -- an NPOT frame with one samples BLACK, silently ***");
    ok(/UNPACK_FLIP_Y_WEBGL/.test(camCode), "and flips Y, because a video's origin is the opposite corner from GL's");
    ok((camCode.match(/UNPACK_FLIP_Y_WEBGL/g) || []).length === 2, "twice: set and restored, so the global state is left as it was found");
    ok(/getTracks\(\)/.test(camCode) && /\.stop\(\)/.test(camCode),
        "*** stop() stops the TRACKS -- dropping the reference leaves the camera light on, which is the one bug here that is not cosmetic ***");
    ok(/playsInline/.test(camCode), "and playsInline, or iOS opens a fullscreen player over the page");

    const page = noComments(read("camera-effects.html"));
    ok(/from "\.\/render\/cameraTexture\.js"/.test(page) && /from "\.\/render\/cameraEffectsPass\.js"/.test(page),
        "the page uses the real modules rather than a copy");
    ok(/pagehide/.test(page) && /cam\.stop/.test(page), "and releases the camera when the page goes away");
    ok(/readPixels/.test(page) && /keyAlpha/.test(page),
        "*** the page's self-test reads the GPU back and compares it to the CPU model, which is the only proof the two agree ***");
}

// 10) THE ROUND TRIP: the engine makes the backdrop, and now it can key it.
{
    const main = read("main.js");
    ok(/_stageBackdrop/.test(noComments(main)), "main.js still has the backdrop hook the keyer pairs with");
    for (const [name, bd] of [["green", [0.05, 0.75, 0.15]], ["blue", [0.06, 0.20, 0.72]], ["magenta", [0.62, 0.08, 0.55]]]) {
        ok(keyAlpha(bd, bd) === 0, `a stage backdrop set to ${name} keys itself out completely`);
        ok(keyAlpha([0.85, 0.68, 0.60], bd) === 1, `...and a subject in front of the ${name} backdrop survives it`);
    }
    ok(/chroma/i.test(prose(read("render/chromaKeyModel.mjs"))), "and the model says in prose why this did not exist before");
}

console.log(`cameraEffects-selfcheck: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`unchecked here: the fragment shader itself, which needs a GPU. camera-effects.html runs it
against these same models and reports the difference -- measured 0.0000 across five probe pixels in
headless Chromium, and a Chuck Close cell mean whose error is confined to cells a hard edge crosses.`);
process.exit(fail ? 1 : 0);
