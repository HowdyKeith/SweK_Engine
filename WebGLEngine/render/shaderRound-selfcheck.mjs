#!/usr/bin/env node
// WebGLEngine/render/shaderRound-selfcheck.mjs -- v4734
//
// EVERY round() IN A SHADER, WITH A VERDICT. WGSL's and GLSL's round() break a tie to EVEN; JavaScript's Math.round
// breaks it UPWARD. A kernel mirrored by a JS function that rounds is therefore not bitwise at an exact half, and this
// tree has now found that FOUR times, each time on a fixture that happened to land on one:
//   v4553/v4559  render/temporalLockWgsl.mjs -- the ring's fill index            -> floor
//   v4728        render/temporalResolveWgsl.mjs -- the resolve's base texel        -> floor(x + 0.5)
//   v4734        render/frameInterpWgsl.mjs -- a block's landing at t * flow       -> floor(x + 0.5)
//                render/holeFillWgsl.mjs -- the depth side mode's fetch            -> floor(x + 0.5)
//                render/opticalFlowWgsl.mjs -- a block's origin at a coarse level   -> floor(x + 0.5)
// The first three waited rounds to be found because every device row drove content that never landed on a tie. This
// gate does not wait: it scans every file that carries shader source and asserts the set of round() calls it finds
// EQUALS the set below, each with the reason it stays. A new one goes red until somebody writes down why it is safe
// -- which is a census asserting set equality, v4591's shape, so a site can be neither added nor removed silently.
//
// The markers are assembled, not spelled: render/backendParity.mjs counts a file containing a WGSL entry-point
// attribute as one that SHIPS WGSL, and a gate that greps for the marker may not contain it (v4278). The first draft
// assembled the WGSL ones and spelled the GLSL ones, and counted ITSELF -- its own doc comment naming round() was the
// first "unexplained" site it found.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };

/** Every round() a shader-bearing file may contain, and why it may. Keyed "file :: the trimmed line". */
export const KEPT = Object.freeze({
    "physics/mpm/gpuKernel.mjs :: atomicAdd(&acc[slot], i32(round(clamp(x, -CLIP, CLIP))));":
        "fixed-point quantisation of a CONTINUOUS product: a tie is measure-zero, the mirror (quantise) says so in its own " +
        "header, and ties-to-even is the UNBIASED rule for a sum of many -- the right one for an accumulator",
    "ui/barycentricWireframe.js :: const posKey = (x, y, z) => round(x) + \",\" + round(y) + \",\" + round(z);":
        "JavaScript, not shader: a local helper that keys vertex positions, in a file that also carries GLSL",
});

const AT = String.fromCharCode(64);
const MARKERS = [AT + "compute", AT + "fragment", AT + "vertex", "gl_" + "FragColor", "#version " + "300 es"];
// tools/ holds the records and their prose (gateSweep.mjs's closings name round() and the markers in sentences), and a
// gate is not a product kernel: the census is of what SHIPS. A gate's own throwaway probe kernels are its business.
const SKIP_DIRS = new Set(["node_modules", "vendor", ".git", "tools"]);
function walk(dir, out) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out); }
        else if (/\.(mjs|js|wgsl|glsl)$/.test(e.name) && !/-selfcheck\.mjs$/.test(e.name)) out.push(path.join(dir, e.name));
    }
    return out;
}

console.log("\n1. THE CENSUS: every round() in a file that carries shader source");
const found = new Map();
let scanned = 0;
for (const f of walk(ENG, [])) {
    const src = fs.readFileSync(f, "utf8");
    if (!MARKERS.some((m) => src.includes(m))) continue;
    scanned++;
    const rel = path.relative(ENG, f).split(path.sep).join("/");
    src.split("\n").forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, "");               // a comment naming round() is not a call
        if (!/(^|[^A-Za-z0-9_.])round\(/.test(code)) return;
        if (/^\s*\*/.test(line)) return;                          // a JSDoc line
        found.set(`${rel} :: ${line.trim()}`, i + 1);
    });
}
const kept = new Set(Object.keys(KEPT)), seen = new Set(found.keys());
const unexplained = [...seen].filter((k) => !kept.has(k)), stale = [...kept].filter((k) => !seen.has(k));
ok(`*** the round() calls in ${scanned} shader-bearing files are EXACTLY the ${kept.size} kept with a reason ***`,
   unexplained.length === 0 && stale.length === 0 && scanned > 50,
   unexplained.length ? `UNEXPLAINED: ${unexplained.map((k) => `${k} (line ${found.get(k)})`).join("; ")}` :
   stale.length ? `KEPT BUT GONE -- take it off the list: ${stale.join("; ")}` :
   "a new round() goes red here until its verdict is written into KEPT; one that is removed goes red until it is taken off");

console.log("\n2. THE FIVE THAT WERE CHANGED, AND WHAT THEY WERE CHANGED TO");
{
    const read = (p) => fs.readFileSync(path.join(ENG, p), "utf8");
    const has = (p, re) => re.test(read(p));
    ok("the resolve's base texel is floor(x + 0.5) (v4728)", has("render/temporalResolveWgsl.mjs", /let bx = i32\(floor\(sx \+ 0\.5\)\);/));
    ok("the ring's fill index and the lock's carry are floor(u * w) (v4553, v4559)", has("render/temporalLockWgsl.mjs", /floor\(/) && !/[^.A-Za-z]round\(/.test(read("render/temporalLockWgsl.mjs").replace(/\/\/.*$/gm, "")));
    ok("[v4734] a block's landing is floor(x + 0.5)", has("render/frameInterpWgsl.mjs", /i32\(floor\(f32\(bx \* u\.block\) \+ ax \+ 0\.5\)\)/));
    ok("[v4734] the depth side mode's fetch is floor(x + 0.5)", has("render/holeFillWgsl.mjs", /i32\(floor\(x \+ 0\.5\)\)/) && has("render/holeFillWgsl.mjs", /i32\(floor\(y \+ 0\.5\)\)/));
    ok("[v4734] a block's origin and the guess carried down are floor(x + 0.5)",
       has("render/opticalFlowWgsl.mjs", /let ox = i32\(floor\(f32\(i32\(g\.x\) \* u\.block\) \/ f32\(u\.scale\) \+ 0\.5\)\);/) &&
       has("render/opticalFlowWgsl.mjs", /let gx = i32\(floor\(-flowIn\[i \* 2u\] \/ f32\(u\.scale\) \+ 0\.5\)\);/));
}

// ---- v4734 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against the three kernels, each run against its device gate AND this one:            device gate   here
//   T1 frameInterpWgsl's landing back to round()                                            1          2
//   T5 ...floored without the half (a fix done wrong)                                       21         1
//   T2 holeFillWgsl's depth fetch back to round()                                           2          2
//   T6 ...floored without the half                                                          2          1
//   T3 opticalFlowWgsl's block origin back to round()                                       1          2
//   T4 opticalFlowWgsl's carried guess back to round()                                      0          2
//   T7 ...the origin floored without the half                                               1          1
// And against the census itself: R1 a round() added to render/dilateWgsl.mjs's code -> 1; R2 the MPM site taken off
// KEPT -> 1; R3 a KEPT entry whose site no longer exists -> 1.
// *** T4 IS 0 RED ON THE DEVICE, AND THAT IS ARITHMETIC, NOT A BLIND SPOT. *** The guess a level carries down is the
// level above's whole-pixel answer, doubled, divided by this level's scale: always whole, so round() has no tie to
// break there. It was changed anyway, so the kernel has one rounding rule and not two -- two spellings of one law is
// how the ring's copy drifted from the kernel's at v4559 -- and this census is what holds it.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: TSL, whose round() compiles to the same tie-to-even and is not text this scan can read as a call site " +
    "(fx/fsr/fsrTsl.mjs and render/*Tsl.mjs use floor throughout, by hand); and GLSL built at runtime from pieces no file holds whole.");
process.exitCode = fails ? 1 : 0;
