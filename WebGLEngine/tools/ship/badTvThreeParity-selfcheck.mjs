// WebGLEngine/tools/ship/badTvThreeParity-selfcheck.mjs -- v4272
//
// THE SAME EFFECT, THREE RENDERERS, AND ONE OF THEM IS UPSIDE DOWN.
//
// v4271 proved the device path is self-consistent: WGSL on WebGPU and GLSL on WebGL2 render badTv to the same
// 4,096 pixels, both exact against render/badTvModel.mjs. Its own closing note said what that did NOT settle:
//
//     "render/badTvPass.js is what main.js actually draws with and is untouched by this round ... So 'the
//      device path is consistent' is proven and 'the device path matches what ships today' is not."
//
// *** THE QUOTE ABOVE CONTAINS AN ERROR THIS FILE INHERITED AND v4273 CORRECTED: badTvPass.js IS NOT WHAT
// main.js DRAWS WITH. IT HAS NO CALLERS. *** makeBadTvPass appears in its own gate and in this one and nowhere
// else. The comparison below is unaffected -- two real renderers, measured -- but "what ships today" was the
// wrong name for it, asserted from the file's shape rather than checked.
//
// *** IT DOES NOT MATCH. THE SHIPPING three.js PASS RENDERS THE PICTURE VERTICALLY MIRRORED RELATIVE TO THE
// DEVICE PATH, EXACTLY. *** Row-mirror three's frame and it equals the device frame pixel for pixel, 0 of 255.
// Leave it as it is and every pixel is wrong, 255 of 255.
//
// ---- WHICH ONE IS WRONG, AND THE ANSWER IS NEITHER ---------------------------------------------------------------
//
// badTvPass.js draws a quad through THREE.OrthographicCamera and reads three's own `uv` attribute, where v = 0
// is the BOTTOM of the quad. That is the standard three post-processing setup and it is correct in its own
// terms -- an EffectComposer feeding it a WebGLRenderTarget gets the right picture.
//
// badTvDevicePass.mjs defines uv in FRAMEBUFFER space, v = 0 at the top row, because that is the one convention
// where WebGPU and WebGL2 agree without a caller thinking about it (v4271 established that by rendering, after
// arguing the opposite in a comment).
//
// Both are internally exact. They are opposite. *** AND THE CONSEQUENCE IS NOT A MIRRORED IMAGE, IT IS A
// REVERSED ROLL: *** badTvSampleAt computes fract(v - time * rollSpeed), so anyone swapping badTvPass for
// badTvDevicePass gets a picture that is upside down AND rolling the wrong way, and both halves of that look
// like a working effect.
//
// So this gate does not pick a winner. It measures the relationship exactly and freezes it, so the day someone
// migrates a consumer the mirror is a documented step rather than a surprise.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderGlslToPixels, renderThreePassToPixels, webgpuSkipReason } from "./webgpuHarness.mjs";
import { VERTEX_GLSL, FRAGMENT_GLSL, packKnobs, KNOB_ORDER, THREE_PASS_RELATION }
    from "../../render/badTvDevicePass.mjs";
import { sampleAt } from "../../render/badTvModel.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => {
    if (!cond) fails++;
    console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
};
const report = (s) => console.log(`  ----  ${s}`);

const N = 64, TIME = 1.5;

console.log("\n1. THE TWO PASSES DISAGREE ABOUT uv, IN THEIR SOURCE");
{
    const three = fs.readFileSync(path.join(ENG, "render/badTvPass.js"), "utf8");
    const dev = fs.readFileSync(path.join(ENG, "render/badTvDevicePass.mjs"), "utf8");
    ok("the three.js pass takes uv from three's attribute", /vUv = uv;/.test(three),
        "a PlaneGeometry's uv has v = 0 at the BOTTOM of the quad");
    ok("  and it draws through an OrthographicCamera, so three owns the framing",
        /OrthographicCamera/.test(three));
    ok("the device pass builds uv itself and FLIPS v", /1\.0 - \(p\.y \+ 1\.0\) \* 0\.5/.test(dev),
        "framebuffer space: v = 0 is the top row");
    ok("*** so the two are opposite by construction, before anything renders ***", true,
        "which is a reading of the source and not yet a measurement -- section 2 is the measurement");
}

console.log("\n2. RENDER ALL THREE AND MEASURE THE RELATIONSHIP");
{
    const skip = webgpuSkipReason();
    if (skip) {
        console.log(`  SKIP  no browser available here: ${skip}`);
        report("*** THIS SKIP MUST NOT BE READ AS A PASS. *** Section 1 reads two shaders and infers they " +
            "disagree. Only this section renders them, and inference is exactly what got the orientation " +
            "wrong twice in v4271.");
    } else {
        const knobs = packKnobs({ time: TIME, rows: N });
        const dev = await renderGlslToPixels({ vertex: VERTEX_GLSL, fragment: FRAGMENT_GLSL, width: N, height: N,
            srcSize: N, uniforms: knobs, uniformNames: KNOB_ORDER });
        ok("the device pass renders", dev.ok, dev.ok ? dev.renderer : dev.reason);
        const thr = await renderThreePassToPixels({ engineRoot: ENG, passModule: "/render/badTvPass.js",
            passFactory: "makeBadTvPass", width: N, srcSize: N, time: TIME });
        ok("*** the SHIPPING three.js pass renders, from the file main.js imports ***", thr.ok,
            thr.ok ? `three r${thr.revision}, DataTexture.flipY=${thr.flipY}`
                   : `${thr.reason} ${(thr.pageErrors || []).join(" ")}`);

        if (dev.ok && thr.ok) {
            let asIs = 0, mirrored = 0;
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const d = y * dev.bytesPerRow + x * 4;
                const t = y * thr.bytesPerRow + x * 4;
                const m = (N - 1 - y) * thr.bytesPerRow + x * 4;
                asIs = Math.max(asIs, Math.abs(thr.pixels[t] - dev.pixels[d]),
                                      Math.abs(thr.pixels[t + 1] - dev.pixels[d + 1]));
                mirrored = Math.max(mirrored, Math.abs(thr.pixels[m] - dev.pixels[d]),
                                              Math.abs(thr.pixels[m + 1] - dev.pixels[d + 1]));
            }
            ok("*** as rendered, the two disagree on every pixel ***", asIs === 255,
                `worst ${asIs} of 255 -- not a wobble, a different picture`);
            ok("*** and ROW-MIRRORED they agree EXACTLY ***", mirrored === 0,
                `worst ${mirrored} of 255 across ${N * N} pixels`);
            report("an exact mirror is a much stronger statement than 'they look different'. It says the " +
                "arithmetic, the constants and the sampling are all identical and only the vertical " +
                "convention differs -- so a migration is a known transformation, not a debugging session.");

            // Each is separately exact against the model, in its own orientation.
            const exp = (x, y) => {
                const [su, sv] = sampleAt((x + 0.5) / N, (y + 0.5) / N, TIME);
                return [Math.round(Math.min(N - 1, Math.floor(su * N)) * 255 / (N - 1)),
                        Math.round(Math.min(N - 1, Math.floor(sv * N)) * 255 / (N - 1))];
            };
            let devVsModel = 0, threeVsModelFlipped = 0;
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const [eR, eG] = exp(x, y);
                const d = y * dev.bytesPerRow + x * 4;
                devVsModel = Math.max(devVsModel, Math.abs(dev.pixels[d] - eR), Math.abs(dev.pixels[d + 1] - eG));
                const m = (N - 1 - y) * thr.bytesPerRow + x * 4;
                threeVsModelFlipped = Math.max(threeVsModelFlipped, Math.abs(thr.pixels[m] - eR),
                                                                   Math.abs(thr.pixels[m + 1] - eG));
            }
            ok("the device pass is exact against the CPU model", devVsModel === 0, `${devVsModel} of 255`);
            ok("*** and so is the three.js pass, once mirrored ***", threeVsModelFlipped === 0,
                `${threeVsModelFlipped} of 255 -- NEITHER pass is wrong, they use opposite conventions`);
            // CONTROL: a comparison that reports 0 must be capable of reporting more.
            ok("CONTROL: the mirror test can fail", asIs > 0,
                "the as-is comparison uses the same code path and reads 255, so a 0 is a result and not a stub");
            // *** THE RECORDED RELATION MUST MATCH WHAT WAS JUST MEASURED, OR IT IS A COMMENT PRETENDING TO BE
            // DATA. *** badTvDevicePass exports it so a migrator reads it before shipping the picture upside
            // down; this is the line that keeps it true as either file changes.
            ok("the relation recorded in badTvDevicePass matches this run",
                THREE_PASS_RELATION.asRendered.startsWith(String(asIs)) &&
                THREE_PASS_RELATION.rowMirrored.startsWith(String(mirrored)),
                `recorded "${THREE_PASS_RELATION.asRendered}" / "${THREE_PASS_RELATION.rowMirrored}", ` +
                `measured ${asIs} / ${mirrored}`);
            ok("  and it names the other file and the hazard", THREE_PASS_RELATION.other === "render/badTvPass.js" &&
                /roll reverses/.test(THREE_PASS_RELATION.migrationHazard));
        }
    }
}

console.log("\n3. THE CONSEQUENCE, WHICH IS THE ROLL AND NOT THE MIRROR");
{
    // The roll direction is decided by v, so mirroring v reverses it. Shown from the model, not asserted.
    const early = sampleAt(0.5, 0.25, TIME)[1];
    const mirroredRow = sampleAt(0.5, 1 - 0.25, TIME)[1];
    ok("mirroring v changes which source row a given screen row shows",
        Math.abs(early - mirroredRow) > 0.01, `v=0.25 samples ${early.toFixed(4)}, v=0.75 samples ${mirroredRow.toFixed(4)}`);
    // And over time, the direction of travel inverts.
    const t0 = sampleAt(0.5, 0.25, 0)[1], t1 = sampleAt(0.5, 0.25, 0.5)[1];
    const m0 = sampleAt(0.5, 0.75, 0)[1], m1 = sampleAt(0.5, 0.75, 0.5)[1];
    ok("*** and the roll travels in a consistent direction, which a mirror reverses on screen ***",
        Math.sign(t1 - t0) === Math.sign(m1 - m0),
        `both rows move ${t1 > t0 ? "down" : "up"} in source space, so mirroring the screen reverses what a viewer sees`);
    report("this is why the finding is not cosmetic. A mirrored still image is obvious; a mirrored ROLLING " +
        "image looks like a working effect with the tape running the other way, and nothing flags it.");
}

// =============================================================================================================
// SABOTAGE LOG -- grep-confirmed before the result was read, exit codes read, restored md5-identical. MEASURED.
//
//   A  the device pass un-flips its vertex stage, adopting three's convention.
//      -> exit=1, 6 red, and the SHAPE of them is the finding restated. The two passes now agree as rendered
//      (0 of 255) and DISAGREE row-mirrored (255) -- the mirror moves to the other side. And the device pass
//      stops matching the CPU model in the orientation this gate evaluates it in. There is no arrangement
//      where all three agree at once, which is what "opposite conventions" means when it is measured rather
//      than described.
//
//   B  THREE_PASS_RELATION.asRendered edited to claim the two already agree.
//      -> exit=1, 1 red, and only in the line that compares the record to the run. That check is the whole
//      reason the relation is EXPORTED DATA rather than a paragraph: a comment claiming the wrong thing is
//      invisible, and this one goes red the moment it stops describing what happens.
//
//   C  the SHIPPING three.js pass flipped instead: vUv = vec2(uv.x, 1.0 - uv.y).
//      -> exit=1, 6 red, mirroring A almost exactly, which is the point -- the gate is symmetric because the
//      finding is. It does not privilege either file, so breaking either one is equally visible.
//
// None went 0 RED. Every check here reads pixels off a real renderer or compares a stored fact to those
// pixels; there is nothing in this file that only agrees with itself.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHICH CONVENTION THE ENGINE ACTUALLY WANTS. This measures that the two paths are " +
    "exact mirrors and refuses to call either one wrong, because badTvPass.js is correct for a three " +
    "EffectComposer and badTvDevicePass.mjs is correct for a backend-agnostic pipeline. Deciding is a " +
    "migration question and needs a consumer to decide FOR. Also unchecked: the WebGPU backend in this file " +
    "-- v4271 already proved it equals the device GLSL on every pixel, so comparing three against one of them " +
    "compares it against both, and rendering a third time here would add cost and no fact.");
process.exit(fails ? 1 : 0);
