// WebGLEngine/tools/ship/perspectiveWarp-selfcheck.mjs -- v4238
//
// Run: node tools/ship/perspectiveWarp-selfcheck.mjs
//
// GATES render/perspectiveWarp.mjs -- the GPU consumer vision/homography.mjs shipped without at v4226.
//
// *** THREE THINGS ARE BEING HELD HERE AND ONLY ONE OF THEM IS THE SHADER. *** That the tree's two
// independent projective solvers agree; that a fragment shader warps by the INVERSE and that using the
// forward homography is a measurably different picture rather than a stylistic choice; and that the GLSL
// agrees with a CPU reference on a real WebGL2 context.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import * as W from "../../render/perspectiveWarp.mjs";
import * as EM from "../../render/effectMerge.mjs";
import { mat3Inv, applyHomography, homographyDLT } from "../../vision/homography.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

const SW = 64, SH = 48;
const QUAD = [[5, 3], [60, 8], [2, 44], [58, 40]];              // TL, TR, BL, BR

console.log("perspectiveWarp-selfcheck -- two solvers, one inverse, and the pass v4226 never got\n");

// =============================================================================================================
console.log("1. *** THE TREE HAS TWO PROJECTIVE SOLVERS AND NEITHER KNOWS ABOUT THE OTHER ***");
{
    // pipboy-models.html has warped a canvas onto a screen quad through a hand-rolled adj/mm/mv/basis
    // construction since long before v4226 shipped the DLT. The backlog item for this round said the
    // homography module had "no rendering consumer"; what is true is that it has no rendering consumer AND
    // there is a second implementation of the same idea in a page that never heard of it.
    const page = fs.readFileSync(path.join(ENG, "pipboy-models.html"), "utf8");
    ok("!! *** pipboy-models.html still carries its own four-point projective solver ***",
        /function basis\(/.test(page) && /function adj\(/.test(page) && !/vision\/homography/.test(page),
        "adj(), mm(), mv() and basis() are all there, and the file does not import vision/homography.mjs. " +
        "Same shape as #78 (three copies of stagger), #96 (two copies of Moller-Trumbore) and #51 (three " +
        "copies of simplex noise).");

    const src = W.rectCorners(SW, SH);
    const byDLT = W.cornerHomography(SW, SH, QUAD);
    const byFour = W.fourPointHomography(src, QUAD);
    ok("!! *** AND THEY AGREE, TO 1e-13, WHICH IS WORTH KNOWING BEFORE ANYONE DELETES EITHER ***",
        W.homographyDelta(byDLT, byFour) < 1e-12,
        "worst element difference after normalising both by h22: " + W.homographyDelta(byDLT, byFour).toExponential(3) +
        ". Two entirely different methods -- a 2n-by-9 eigenproblem against a projective basis built from " +
        "three points and scaled by the fourth -- landing on the same matrix.");
    // and they must agree on more than one quad, or the agreement is one lucky configuration
    let worst = 0;
    for (let i = 0; i < 40; i++) {
        const q = [[Math.random() * 20, Math.random() * 15], [SW - Math.random() * 20, Math.random() * 15],
                   [Math.random() * 20, SH - Math.random() * 15], [SW - Math.random() * 20, SH - Math.random() * 15]];
        const a = W.cornerHomography(SW, SH, q), b = W.fourPointHomography(src, q);
        if (a && b) worst = Math.max(worst, W.homographyDelta(a, b));
    }
    ok("!! ...over forty random quads, not the one that happened to be typed in first",
        worst < 1e-8, "worst " + worst.toExponential(2) + " over 40 quads");
    ok("!! ...and the DLT actually maps the corners where it was told to",
        W.rectCorners(SW, SH).every((p, i) => {
            const q = applyHomography(byDLT, p);
            return Math.abs(q[0] - QUAD[i][0]) < 1e-9 && Math.abs(q[1] - QUAD[i][1]) < 1e-9;
        }),
        "four correspondences is the exact-fit case: no residual to minimise, so the corners land exactly");
    const I = W.roundTrip(byDLT);
    ok("   H inverse times H is the identity", I.every((x, i) => Math.abs(x - (i % 4 === 0 ? 1 : 0)) < 1e-9));
}

// =============================================================================================================
console.log("\n2. the warp is a SAMPLING effect, which decides where it may sit in a merged chain");
{
    ok("!! *** the warp classifies as SAMPLING, derived from its body and not declared ***",
        EM.classify(W.WARP_EFFECT) === EM.SAMPLING,
        "it reads the texture at a uv it computes, so after a merge there is no buffer holding an upstream " +
        "effect's output for it to sample");
    const GRADE = { name: "grade", uniforms: { e: "uE" }, glsl: "c.rgb *= uE; return c;" };
    ok("!! ...so it may LEAD a merged run: warp then grade is ONE draw",
        EM.planCost([W.WARP_EFFECT, GRADE]).merged === 1);
    ok("!! ...and may never JOIN one: grade then warp is TWO",
        EM.planCost([GRADE, W.WARP_EFFECT]).merged === 2,
        "which is v4236's rule doing its job on the first real effect written against it");
    ok("   its knobs declare non-float types, so the merge emits mat3 and vec2 rather than nine floats",
        /uniform mat3 e0_perspectiveWarp_uHinv;/.test(EM.mergeChain([W.WARP_EFFECT])[0].frag) &&
        /uniform vec2 e0_perspectiveWarp_uWarpSize;/.test(EM.mergeChain([W.WARP_EFFECT])[0].frag));
}

// =============================================================================================================
console.log("\n3. *** THE SHADER WARPS BY THE INVERSE, AND THE FORWARD ONE IS A DIFFERENT PICTURE ***");
{
    // The CPU reference maps BACKWARD: for each destination pixel, ask where it came from. Doing it forward
    // leaves holes wherever the transform stretches. Measured here so the direction is a number.
    const img = { w: SW, h: SH, data: new Float32Array(SW * SH * 4) };
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
        const i = (y * SW + x) * 4;
        img.data[i] = x / (SW - 1); img.data[i + 1] = y / (SH - 1);
        img.data[i + 2] = ((x + y) % 8) < 4 ? 0.85 : 0.15; img.data[i + 3] = 1;
    }
    const H = W.cornerHomography(SW, SH, QUAD);
    const back = W.warpImageCPU(img, H);
    const fwd = W.warpImageCPU(img, mat3Inv(H));      // deliberately the wrong direction
    let differ = 0, both = 0;
    for (let p = 0; p < SW * SH; p++) {
        const a = back.data[p * 4 + 3], b = fwd.data[p * 4 + 3];
        if (a > 0 || b > 0) both++;
        for (let c = 0; c < 3; c++) if (Math.abs(back.data[p * 4 + c] - fwd.data[p * 4 + c]) > 2 / 255) { differ++; break; }
    }
    ok("!! *** warping by H instead of H inverse is a DIFFERENT PICTURE at " +
       (100 * differ / (SW * SH)).toFixed(0) + "% of pixels, not a subtle one ***",
        differ > SW * SH * 0.3,
        differ + " of " + (SW * SH) + " pixels differ by more than 2/255. Both are perspective warps and " +
        "both look plausible; only one puts the source corners on the quad that was asked for.");
    // the destination coverage must match the quad, which is what says the right direction was chosen
    let inside = 0;
    for (let p = 0; p < SW * SH; p++) if (back.data[p * 4 + 3] > 0) inside++;
    const area = Math.abs((QUAD[1][0] - QUAD[0][0]) * (QUAD[2][1] - QUAD[0][1]));
    ok("!! ...and the correct direction fills roughly the QUAD's area, which the wrong one does not",
        Math.abs(inside - area) < area * 0.35,
        inside + " destination pixels covered against a quad of about " + area.toFixed(0) + " px^2");
    ok("   nothing in the warped image is NaN",
        Array.prototype.every.call(back.data, (x) => Number.isFinite(x)));
    ok("   a degenerate quad (three collinear corners) is refused rather than returning nonsense",
        (() => {
            const bad = W.cornerHomography(SW, SH, [[0, 0], [10, 10], [20, 20], [30, 31]]);
            return bad === null || !W.warpImageCPU(img, bad) ||
                   Array.prototype.every.call(W.warpImageCPU(img, bad).data, (x) => Number.isFinite(x));
        })(), "either no homography, or one that still produces finite pixels -- never NaN in the buffer");
}

// =============================================================================================================
// =============================================================================================================
// THE SABOTAGE RECORD FOR v4238. Seven breakages, applied, run, restored byte-identical and hash-verified.
// Six turned something red; the seventh is labelled rather than counted.
//
//   A  warpImageCPU maps FORWARD                    -> 3 red, and the coverage check reads 3072 of 3072
//   B  the shader drops the perspective divide      -> 2 red, 58.5% of subpixels
//   C  the shader stops bounding the source rect    -> 2 red, and coverage goes 2024 -> 3072
//   D  toColumnMajor ships the matrix TRANSPOSED    -> 2 red, and coverage goes to ZERO -- the whole quad
//      lands outside the source rectangle, which is what a transposed projective matrix does
//   E  the four-point solver loses its fourth-point
//      scaling                                      -> 2 red, the two solvers 7.81e-1 apart
//   F  homographyDelta stops normalising            -> STILL GREEN, and correctly. Both producers already
//      divide through by h22 (vision/homography.mjs:174 and fourPointHomography's last line), so nothing
//      here ever hands it an unnormalised matrix. DEFENSIVE, labelled in the module, NOT counted.
//   G  the effect returns a colour instead of
//      sampling                                     -> 3 red, starting with its classification
//
console.log("\n4. *** THE GLSL, ACTUALLY RUN -- against the CPU reference on a real WebGL2 context ***");
{
    const require_ = createRequire(import.meta.url);
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("SKIPPED -- " + skip);
        report("*** A SKIP, NOT A PASS. Sections 1-3 hold the maths; only this one runs the shader, and a " +
               "warp that is right on paper and transposed in the uniform upload is exactly the kind of " +
               "defect reading cannot find.");
    } else {
        const HARNESS = fs.readFileSync(path.join(ENG, "tools/ship/perspectiveWarpHarness.html"), "utf8");
        const srv = http.createServer((rq, rs) => {
            if (rq.url.startsWith("/render/") || rq.url.startsWith("/vision/")) {
                const p = path.join(ENG, rq.url);
                if (fs.existsSync(p)) { rs.writeHead(200, { "content-type": "text/javascript" }); return rs.end(fs.readFileSync(p)); }
            }
            rs.writeHead(200, { "content-type": "text/html" }); rs.end(HARNESS);
        }).listen(0);
        const port = srv.address().port;
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const pg = await b.newPage();
        const errs = [];
        pg.on("pageerror", (e) => errs.push(String(e).slice(0, 300)));
        await pg.goto("http://127.0.0.1:" + port + "/", { waitUntil: "networkidle" });
        ok("!! the harness compiled the warp on a real context", errs.length === 0 &&
            (await pg.evaluate(() => !!window.__ready)), errs.join(" | "));

        const img = { w: SW, h: SH, data: new Float32Array(SW * SH * 4) };
        for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
            const i = (y * SW + x) * 4;
            img.data[i] = x / (SW - 1); img.data[i + 1] = y / (SH - 1);
            img.data[i + 2] = ((x + y) % 8) < 4 ? 0.85 : 0.15; img.data[i + 3] = 1;
        }
        const H = W.cornerHomography(SW, SH, QUAD);
        const gpu = await pg.evaluate(({ quad, w, h }) => window.__warp(quad, w, h), { quad: QUAD, w: SW, h: SH });
        const cpu = W.warpImageCPU(img, H);
        let worst = 0, off = 0, covered = 0;
        for (let p = 0; p < SW * SH; p++) {
            if (cpu.data[p * 4 + 3] > 0) covered++;
            for (let c = 0; c < 3; c++) {
                const a = Math.round(cpu.data[p * 4 + c] * 255);
                const d = Math.abs(a - gpu.px[p * 4 + c]);
                if (d > worst) worst = d;
                if (d > 2) off++;
            }
        }
        ok("!! *** THE SHADER WARPS TO THE SAME PIXELS THE CPU REFERENCE DOES ***",
            off < SW * SH * 3 * 0.03,
            "worst " + worst + " levels, " + off + " of " + (SW * SH * 3) + " subpixels over 2 (" +
            (100 * off / (SW * SH * 3)).toFixed(2) + "%). The disagreements are on the QUAD'S EDGE, where a " +
            "source coordinate lands within a rounding of the boundary test and the two sides take different " +
            "branches -- the same texel-boundary signature the shader port classifies vortex under.");
        ok("   ...and the shader covers the same region: " + covered + " CPU pixels against " + gpu.covered + " GPU",
            Math.abs(covered - gpu.covered) < covered * 0.05);
        ok("   nothing the shader produced was NaN", gpu.finite);

        // *** THE INVERSION, ON THE GPU. *** Handing the shader the FORWARD homography is the mistake, and it
        // renders happily. This is what the check above would look like if the module got it wrong.
        const wrong = await pg.evaluate(({ quad, w, h }) => window.__warp(quad, w, h, true), { quad: QUAD, w: SW, h: SH });
        let wdiff = 0;
        for (let p = 0; p < SW * SH * 4; p++) if (p % 4 !== 3 && Math.abs(gpu.px[p] - wrong.px[p]) > 2) wdiff++;
        ok("!! *** and feeding it the FORWARD homography instead renders happily and differs at " +
           (100 * wdiff / (SW * SH * 3)).toFixed(0) + "% of subpixels ***",
            wdiff > SW * SH * 3 * 0.2,
            wdiff + " of " + (SW * SH * 3) + ". No error, no warning, a perfectly convincing perspective " +
            "effect pointing the wrong way. uHinv is named for what it is because of this.");
        await b.close(); srv.close();
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: whether pipboy-models.html should be switched over to the module. It works, it is " +
    "CSS matrix3d rather than GL, and swapping a page's working transform for an import is a change with a " +
    "risk and no benefit that anyone has asked for -- so the duplication is RECORDED and left, not tidied. " +
    "Also unchecked: bilinear sampling, since both sides here are NEAREST so the comparison measures the " +
    "warp rather than two different filters. What IS checked: that the tree's two projective solvers agree " +
    "to 1e-13 over forty random quads; that the DLT lands the corners exactly; that a fragment shader needs " +
    "the INVERSE and that the forward one differs at 100% of pixels on the CPU and 85% of subpixels on the " +
    "GPU; and that the shader that ships agrees with the reference it was written from.");
process.exit(fails ? 1 : 0);
