// WebGLEngine/tools/render-qa/traceAscii.mjs -- v3509
//
// *** THE STANDING LIMITATION OF THE WHOLE PATH-TRACER ARC IS ONE SENTENCE: "THE SANDBOX HAS NO GPU, SO PIXELS
// ARE KEITH'S." FOURTEEN ROUNDS OF GRADED RENDERER AND NOBODY IN HERE HAS EVER SEEN ONE OF ITS PICTURES. ***
//
// Both halves have been sitting in the tree the whole time and NOTHING HAS EVER PUT THEM TOGETHER:
// physics/render/pathTracer.mjs returns a Float64Array of radiance with no canvas and no GL, and
// tools/render-qa/asciify.mjs (v3322) turns RGBA into shape-matched text with no canvas and no GL.
// *** A CONVERGED TRACE PRINTED AS CHARACTERS IS A PICTURE THIS SIDE OF THE NETWORK CAN ACTUALLY LOOK AT. ***
//
// Prompted by Keith's Lallapallooza/c_ascii_render link. THE REPO ITSELF IS REFUSED -- pure C, and the
// technique has been here since v3322 -- but it is worth naming the distinction that made the idea land: that
// renderer's FRAMEBUFFER IS THE CHARACTER GRID, while asciify converts a frame already rendered. THE SECOND IS
// WHAT SweK HAS AND THE SECOND IS WHAT THIS NEEDED.
//
// *** AND THE PICTURE IS NOT THE CHECK. *** This whole arc exists because a 27% error looks like a slightly
// different material (v3467). What the ASCII buys is READABILITY WHEN A GATE FAILS: a number says the furnace
// read 0.71, and the disc printed beside it says whether it is dark all over or dark down one side. The
// assertions live in traceAscii-selfcheck.mjs and they are made on the TEXT, not on the eye.
"use strict";
import { render, coverage } from "../../physics/render/pathTracer.mjs";
import { buildTable } from "../../physics/render/energyCompensation.mjs";
import { asciify, RAMP } from "./asciify.mjs";
import { pathToFileURL } from "node:url";

export const CAM = { w: 120, h: 120, spp: 64, seed: 5, eye: [0, 0, 4], look: [0, 0, 0], fovDeg: 40, maxDepth: 8 };

/**
 * The scenes worth looking at, each one the subject of a round that has only ever been a number.
 * `expect` is what the picture should show IN WORDS, so the register states its own prediction and a reader
 * can disagree with it -- a caption that only described what was drawn would agree with anything.
 */
export function scenes() {
    const T = (a) => buildTable(a, { K: 16, N: 120, M: 120 });
    return [
        { name: "furnace", why: "v3467: a diffuse sphere of albedo 0.18 in a white furnace reads EXACTLY its albedo",
          expect: "a FLAT disc -- one glyph across the whole sphere, darker than the sky, with no shading",
          scene: [{ centre: [0, 0, 0], radius: 1, albedo: 0.18 }], sky: () => 1 },
        { name: "rough-metal", why: "v3490/v3493: single-scattering GGX loses energy to masking, and it grows with roughness",
          // *** MY FIRST CAPTION HERE SAID "still flat -- the loss is uniform". THE PICTURE SAID OTHERWISE
          // AND THE PICTURE IS RIGHT: v3490 measured E as a function of VIEW ANGLE, and at roughness 0.8
          // grazing returns 0.700929 against 0.442236 head-on. So the disc MUST brighten toward the rim,
          // and the disc MEAN -- the only number this scene ever had -- AVERAGES EXACTLY THAT AWAY. The
          // caption was corrected by the artefact this register exists to produce, ON ITS FIRST RUN. ***
          expect: "a disc darker than the sky and BRIGHTER AT THE RIM THAN AT THE CENTRE -- v3490's angle dependence, which the disc mean hides",
          scene: [{ centre: [0, 0, 0], radius: 1, roughness: 0.8 }], sky: () => 1 },
        { name: "rough-compensated", why: "v3492/v3493: the multiple-scattering term must drive E back to 1 at every angle",
          expect: "THE SPHERE DISAPPEARS -- the disc and the sky must print the SAME glyph",
          scene: [{ centre: [0, 0, 0], radius: 1, roughness: 0.8, msTable: T(0.8) }], sky: () => 1 },
        { name: "lit-sphere", why: "v3469/v3489: a sphere lit by one sphere light, with a real terminator",
          expect: "a BOWED light/dark boundary -- bright toward the light, dark away, and the bow is the sphere",
          scene: [{ centre: [0, 0, 0], radius: 1, albedo: 0.9 },
                  { centre: [3, 3, 3], radius: 1.2, emit: 6, albedo: 0 }], sky: () => 0.02 },
    ];
}

/** Radiance -> RGBA. Normalised by the frame's own maximum, WHICH IS SAID rather than hidden: the glyph a
 *  pixel gets is relative to the brightest thing in ITS OWN frame, so two frames are not comparable by eye. */
export function toRgba(buf, w, h) {
    let mx = 0; for (const v of buf) mx = Math.max(mx, v);
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const v = Math.round(255 * Math.min(1, buf[i] / (mx || 1)));
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    }
    return { data: d, max: mx };
}

export function renderAscii(s, { cols = 58, cam = CAM } = {}) {
    const buf = render(s.scene, { ...cam, sky: s.sky });
    const { data, max } = toRgba(buf, cam.w, cam.h);
    const { text } = asciify(data, cam.w, cam.h, { cols });
    // The disc's own reading, measured on an ERODED interior so silhouette pixels -- which mix sphere and sky
    // because coverage samples pixel CENTRES while the renderer jitters (v3473) -- cannot drag it.
    const m = coverage(s.scene, { ...cam, sky: s.sky }), W = cam.w, e = new Uint8Array(m.length);
    for (let y = 3; y < cam.h - 3; y++) for (let x = 3; x < W - 3; x++) {
        let a = 1; for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (!m[(y + j) * W + x + i]) a = 0;
        e[y * W + x] = a;
    }
    let sum = 0, n = 0; for (let i = 0; i < m.length; i++) if (e[i]) { sum += buf[i]; n++; }
    return { text, discMean: n ? sum / n : NaN, frameMax: max, glyphs: new Set(text.replace(/\n/g, "")).size };
}

export function reportLines(opts = {}) {
    const out = [];
    for (const s of scenes()) {
        const r = renderAscii(s, opts);
        out.push("", `--- ${s.name} ---`, `  ${s.why}`, `  EXPECT: ${s.expect}`,
                 `  disc mean ${r.discMean.toFixed(6)}, frame max ${r.frameMax.toFixed(4)}, ${r.glyphs} distinct glyphs`, "");
        out.push(r.text);
    }
    out.push("", `ramp "${RAMP}" -- dark to light. THE PICTURE IS NOT THE CHECK: the assertions are in`,
             "traceAscii-selfcheck.mjs and they are made on the TEXT. What this buys is that when one of them",
             "fails, a person can see WHETHER the disc is dark all over or dark down one side -- which a number",
             "cannot say and which nobody on this side of the network has ever been able to look at.");
    return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    console.log("[traceAscii] converged path traces, printed as characters");
    for (const l of reportLines()) console.log(l);
}
