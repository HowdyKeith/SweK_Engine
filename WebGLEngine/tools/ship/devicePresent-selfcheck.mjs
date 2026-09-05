#!/usr/bin/env node
// WebGLEngine/tools/ship/devicePresent-selfcheck.mjs -- v4462
//
// GRADES render/devicePresent.mjs -- THE PRESENTED-FRAME CHECK -- ON WHAT THIS BOX CAN SHOW, AND NAMES WHAT ONLY THE
// RIG CAN.
//
// Every device gate in this tree reads an OFFSCREEN texture on WebGPU, because this build box loses the device on a
// render pass whose attachment is the canvas (gfx/device.js Level 11: four variants tried, all lost). Their last
// lines all say "unchecked: presenting to a canvas". This gate runs the one routine the page runs, on both backends,
// and asserts exactly what the box can answer:
//   - WebGL2 PRESENTS here: the device's canvas readback, the offscreen frame and the compositor's 2D copy of the
//     presented canvas all equal the pattern and each other, byte for byte. That is a real presentation claim on
//     one backend, and it is asserted.
//   - WebGPU either PRESENTS (asserted the same way, and the gate says so) or LOSES THE DEVICE with the browser's
//     own message -- in which case the gate prints the rig-pending line and does not go red, because a red that
//     nobody can clear from here is a red that gets registered, and the whole point of this page is that the
//     answer lives on Galaxina. A THIRD state -- neither presented nor lost -- IS red.
//
// The pure half (the pattern, the comparison) is held to fabricated inputs first, so "0 of 2048 differ" is a
// measurement and not a comparison that cannot fail.
//
// SABOTAGE LOG (v4462) -- each applied to render/devicePresent.mjs, gate run, exit read, file restored byte for byte:
//   A  the right half drawn red too                    -> exit=1, 1 red: all three WebGL2 readbacks disagree with the pattern.
//   B  drawImage dropped (the compositor copy is blank) -> exit=1, 2 red: the source check and C against the pattern.
//   C  the offscreen frame read without its draw        -> exit=1, 1 red: B against the pattern and A against B.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { expectedPattern, comparePixels, LEFT, RIGHT } from "../../render/devicePresent.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const codeOf = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const W = 64, H = 32;
export const RIG_LINE = "RIG-ONLY: open device-present.html on Galaxina (WebGPU) and read PASS on all three readbacks; " +
    "the build box loses the WebGPU device on a presented pass, so only the rig can answer whether presentation is right.";

console.log("\n1. THE PATTERN AND THE COMPARISON, HELD TO FABRICATED INPUTS");
{
    const w = expectedPattern(W, H);
    ok("the pattern is left red, right blue, opaque", w[0] === 255 && w[3] === 255 && w[(W / 2) * 4 + 2] === 255 && w[(W / 2) * 4] === 0 && LEFT[0] === 255 && RIGHT[2] === 255);
    ok("  and every row is the same", (() => { for (let y = 1; y < H; y++) for (let i = 0; i < W * 4; i++) if (w[y * W * 4 + i] !== w[i]) return false; return true; })());
    ok("comparePixels: identical arrays differ nowhere", comparePixels(w, w).differing === 0 && comparePixels(w, w).worst === 0);
    const b = w.slice(); b[5 * 4 + 1] = 40;
    ok("CONTROL: one byte off is one pixel differing, worst 40", comparePixels(w, b).differing === 1 && comparePixels(w, b).worst === 40);
    ok("CONTROL: a length mismatch is refused with a reason, not counted as agreement", comparePixels(w, new Uint8Array(8)).differing === -1);
    const page = read("device-present.html"), mod = codeOf(read("render/devicePresent.mjs"));
    ok("the page carries demo:title, demo:desc and demo:category and imports the module", /demo:title/.test(page) && /demo:desc/.test(page) && /demo:category/.test(page) && /render\/devicePresent\.mjs/.test(page));
    ok("  and exposes its numbers on window.__present for a harness", /window\.__present/.test(page));
    ok("  and the front door links it", /href="\/device-present\.html"/.test(read("server.html")));
    ok("the module requests the device in CANVAS mode (no offscreen at requestDevice) and reads the offscreen frame per frame",
        /requestDevice\(canvas, \{ backend \}\)/.test(mod) && /offscreen: true, read: true/.test(mod) && !/requestDevice\([^)]*offscreen/.test(mod));
    ok("  and takes the compositor's copy through drawImage + getImageData", /drawImage\(canvas, 0, 0\)/.test(mod) && /getImageData/.test(mod));
}

console.log("\n2. ON THIS BOX: WebGL2 PRESENTS; WebGPU PRESENTS OR LOSES THE DEVICE, AND SAYS WHICH");
{
    const skip = webgpuSkipReason();
    if (skip) {
        console.log(`  SKIP  ${skip}`);
        report("*** NOT A PASS. *** Section 1 is pure. Only this one presents a frame.");
        fails++;
    } else {
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H }, script: `async (a) => {
            const { presentCheck, describe } = await import("/render/devicePresent.mjs");
            const out = {};
            for (const backend of ["webgl2", "webgpu"]) {
                const cv = document.createElement("canvas"); cv.width = a.W; cv.height = a.H; document.body.appendChild(cv);
                const r = await Promise.race([presentCheck(cv, backend), new Promise((res) => setTimeout(() => res({ backend, state: "timeout", lost: "presentCheck did not settle in 20 s" }), 20000))]);
                delete r.device; out[backend] = { ...r, line: describe(r) };
            }
            return out;
        }`, timeoutMs: 90000 });
        ok("*** the routine ran on both backends ***", r.ok && r.result && r.result.webgl2 && r.result.webgpu, r.ok ? "" : r.reason);
        if (r.ok) {
            const L = r.result.webgl2, G = r.result.webgpu;
            report(L.line); report(G.line);
            const allZero = (x) => x.state === "presented" && [x.A, x.B, x.C, x.AB, x.AC].every((c) => c && c.differing === 0);
            ok("*** WebGL2 presents: canvas readback, offscreen frame and the compositor's copy all equal the pattern and each other ***", allZero(L), L.line);
            ok("  WebGL2: the comparison counted every pixel", L.A && L.A.n === W * H, L.A ? `${L.A.n} pixels` : "n/a");
            if (G.state === "presented") {
                ok("*** WebGPU presents on this box, and all three readbacks agree with the pattern ***", allZero(G), G.line);
                report("this box presented on WebGPU -- the Level 11 note about losing the device no longer describes it; say so in the changelog");
            } else {
                ok("WebGPU: the outcome is the named one -- the device was lost on the presented pass, with the browser's message", G.state === "device-lost" && /lost|Instance reference|destroyed/i.test(String(G.lost)), `${G.state}: ${String(G.lost).slice(0, 120)}`);
                report("rig-pending -- " + RIG_LINE);
            }
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WebGPU PRESENTATION ITSELF unless the line above says this box presented -- that is the rig's " +
    "answer and the page's purpose; a canvas the page has resized between frames; and a frame drawn after the " +
    "compositor has run (the 2D copy is taken in the same task as the frame, which is the only moment it is defined " +
    "without preserveDrawingBuffer).");
process.exit(fails ? 1 : 0);
