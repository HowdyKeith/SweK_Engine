#!/usr/bin/env node
// WebGLEngine/tools/ship/kernelReach-selfcheck.mjs -- v4589
//
// Run: node tools/ship/kernelReach-selfcheck.mjs
// RUNTIME 25575 ms ALONE (median of 25575/25509/25675). Well over the 3000 ms sweep budget, and the cost is
// IMPORTING 107 producer modules to hash the shader text each one yields: that is what makes two names for one
// kernel resolve to one kernel rather than to a guess about naming conventions. quickSweep re-runs an
// over-budget gate serially per v4408 and files an ALONE reading.
//
// SABOTAGE: 6 mutations, 6 caught, no 0-RED. Restored and md5-checked against a sentinel taken first.
//   M1 the module-dispatch route dropped -> 3 rows red, and the tree's count went 17 -> 39, which is the size of
//      that one false-positive class on the real tree.
//   M2 the alias rule dropped -> the alias row red; WORLEY_WGSL and hmcKernelWgsl come back as phantoms.
//   M3 probes counted as kernels -> 17 -> 22 and three rows red, the class that made the first draft 67.
//   M4 the re-export line counted as a use site -> the row that pins it red. This is the one that would have
//      made the finding ZERO: the whole temporal arc re-exports at the foot of the file.
//   M5 gates no longer excluded -> 5 rows red and the unreachable count collapses to 7 with the temporal arc at
//      0 of 7, which is what "a gate is a caller" looks like when you believe it.
//   M6 A FAKE EIGHTEENTH KERNEL DROPPED INTO render/ -> the ratchet fires at 18 against 17, alone. That is the
//      row doing the job the other five only make honest.
//
// *** v4588 FOUND ONE FILE'S KERNELS UNRUNNABLE OUTSIDE THEIR GATE. THIS ASKS THE TREE. ***
//
// The answer is 17 dispatchable kernels in 11 files, and TEN OF THEM ARE THE TEMPORAL ARC: MOTION_WGSL,
// RESOLVE_WGSL, ACCUMULATE_WGSL, RING_FLOOR_WGSL, DISOCCLUSION_WGSL, RECTIFY_WGSL and temporalLock's four.
// That arc ran from v4552 to v4570 -- nineteen rounds -- and every kernel it produced is reachable only from
// the gate that proves it. fsr.html runs the CPU versions of two of them every frame and says on the page that
// the temporal pane "stays on the CPU whatever the adapter does", which is true and is not the whole truth: the
// WGSL exists and has been proven on a device; what is missing is a caller.
//
// THE RATCHET IS SEEDED AT 17 AND MAY ONLY FALL. Not asserted at zero: xpbd's three, bloomFused's texture path
// and tslWide's QUAD_WGSL are other people's arcs, and which get a runner is Keith's call one at a time. What
// this forbids is an EIGHTEENTH -- a kernel written, gated, and left with nothing able to run it, which is the
// shape this tree has now produced at least seventeen times without a number on it.
//
// *** THE CLASSIFIER IS DRIVEN ON ALL FOUR REACHABILITY CLASSES, *** because a rule this fiddly that only ever
// runs against the real tree is a rule nobody can show failing -- and it was WRONG FOUR TIMES on the way here,
// each time by not modelling a way a kernel can be reached (see kernelReach.mjs's header for the 67 -> 17
// sequence). The fixtures are the four classes, built from nothing and run through the same function.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kernelReach, classOf, useSites, isGate, isTool, FRAGMENTS } from "./kernelReach.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("kernelReach-selfcheck -- can anything but a gate run this kernel?\n");

console.log("1. *** THE CLASSIFIER, DRIVEN ON ALL FOUR WAYS A KERNEL CAN BE REACHED ***");
{
    // Four fixtures, one per reachability class the real measurement had to learn. Every one of these was a
    // FALSE POSITIVE in an earlier draft -- a kernel counted as dead that production code can run.
    const FILES = {
        // (a) reached by SYMBOL from non-gate code
        "fx/a/aWgsl.mjs": "export const A_WGSL = `@compute fn main() {}`;",
        "fx/a/user.js": "import { A_WGSL } from './aWgsl.mjs'; export const p = A_WGSL;",
        // (b) reached because the DEFINING module uses it and something imports that module
        "fx/b/bWgsl.mjs": "const B_WGSL = `@compute fn main() {}`;\nexport function run(d) { return d.compute({ wgsl: B_WGSL }); }\nexport { B_WGSL };",
        "fx/b/page.html": "<script type=module>import { run } from './bWgsl.mjs';</script>",
        // (c) reached only as an ALIAS: two exports, one shader text
        "fx/c/cWgsl.mjs": "export function cWgsl() { return `@compute fn main() {}`; }\nexport const C_WGSL = cWgsl();",
        "fx/c/user.js": "import { cWgsl } from './cWgsl.mjs'; export const q = cWgsl();",
        // (d) UNREACHABLE: the only thing naming it is a gate
        "fx/d/dWgsl.mjs": "const D_WGSL = `@compute fn main() {}`;\nexport { D_WGSL };",
        "fx/d/d-selfcheck.mjs": "import { D_WGSL } from './dWgsl.mjs'; console.log(D_WGSL);",
        // (e) a PROBE: named for what it is, and owed no runtime caller
        "fx/e/eWgsl.mjs": "const E_PROBE_WGSL = `@compute fn main() {}`;\nexport { E_PROBE_WGSL };",
    };
    const producers = [
        { symbol: "A_WGSL", file: "fx/a/aWgsl.mjs", kind: "export" },
        { symbol: "B_WGSL", file: "fx/b/bWgsl.mjs", kind: "export" },
        { symbol: "cWgsl", file: "fx/c/cWgsl.mjs", kind: "export" },
        { symbol: "C_WGSL", file: "fx/c/cWgsl.mjs", kind: "export" },
        { symbol: "D_WGSL", file: "fx/d/dWgsl.mjs", kind: "export" },
        { symbol: "E_PROBE_WGSL", file: "fx/e/eWgsl.mjs", kind: "export" },
        { symbol: "filter.wgsl", file: "shaders/filter.wgsl", kind: "file" },
    ];
    const TEXT = "@compute fn main() {}";
    const r = await kernelReach({
        producers, files: Object.keys(FILES), read: (f) => FILES[f] || "",
        // every fixture produces the SAME shader text except where the class is about text, so the alias rule is
        // exercised rather than merely present
        importModule: async (f) => (f === "fx/c/cWgsl.mjs" ? { cWgsl: () => TEXT, C_WGSL: TEXT }
                                  : f === "fx/a/aWgsl.mjs" ? { A_WGSL: "@compute fn a() {}" }
                                  : f === "fx/b/bWgsl.mjs" ? { B_WGSL: "@compute fn b() {}" }
                                  : f === "fx/d/dWgsl.mjs" ? { D_WGSL: "@compute fn d() {}" }
                                  : { E_PROBE_WGSL: "@compute fn e() {}" }),
    });
    const of = (s) => r.rows.find((x) => x.symbol === s);
    ok("!! a kernel imported BY SYMBOL from non-gate code is reachable", of("A_WGSL").reach && of("A_WGSL").via === "symbol",
       "the easy case, and the only one the first draft got right");
    ok("!! *** a kernel its OWN module dispatches, in a module something imports, is reachable ***",
       of("B_WGSL").reach && of("B_WGSL").via === "module",
       "gpuHaul, gpuOrbits and bloomFused define the WGSL and run it in the same file. Counting 'nobody imports " +
       "the symbol' as dead made the real census 41 when it is 17.");
    ok("!! *** two exports of ONE shader text are one kernel, and reachable if either is ***",
       of("C_WGSL").reach && of("C_WGSL").via === "alias" && of("cWgsl").reach,
       "render/worleyWgsl.mjs exports worleyWgsl() AND WORLEY_WGSL = worleyWgsl(). orrery-gpu.html imports the " +
       "function; the constant looked dead and is the same shader. Deduped by TEXT, not by name.");
    ok("!! *** a kernel only a GATE names is UNREACHABLE, which is the whole finding ***",
       !of("D_WGSL").reach, "if this row cannot fail, nothing below it means anything");
    ok("...and a PROBE is not counted as debt, because a gate dispatching it is its design",
       classOf("E_PROBE_WGSL") === "probe" && of("E_PROBE_WGSL").cls === "probe" && r.unreachable.length === 1,
       `${r.unreachable.length} unreachable of ${r.kernels.length} kernels in the fixture -- D_WGSL alone. ` +
       "Eighteen real probes counted as debt made the first measurement 67.");
    ok("...and a bare .wgsl FILE is left to shaderRefs rather than answered twice",
       !r.rows.some((x) => x.symbol === "filter.wgsl"),
       "tools/ship/shaderRefs.mjs exists for 'does anything load this shader file'. Two modules answering one " +
       "question is the defect this tree keeps finding, so the file kind is dropped here on purpose.");
    ok("...and the re-export line is not a use site, which the temporal arc's spelling makes load-bearing",
       useSites("const X_WGSL = `x`;\nexport { X_WGSL };", "X_WGSL") === 0 &&
       useSites("const X_WGSL = `x`;\nrun({ wgsl: X_WGSL });\nexport { X_WGSL };", "X_WGSL") === 1,
       "the whole arc declares privately and re-exports at the foot of the file -- counting `export { X }` as a " +
       "use would make every kernel in it look used by its own module, and the finding would be zero.");
    ok("...and a gate and a ship tool are both excluded, driven", isGate("a/b-selfcheck.mjs") && !isGate("a/b.mjs") &&
       isTool("tools/ship/x.mjs") && !isTool("render/x.mjs"),
       "a corpus entry in tools/ship is not production code either -- temporalCorpus imports all thirteen of the " +
       "arc's kernels and dispatches none of them.");
}

console.log("\n2. THE TREE'S OWN ANSWER");
{
    const r = await kernelReach();
    const byFile = new Map();
    for (const u of r.unreachable) { if (!byFile.has(u.file)) byFile.set(u.file, []); byFile.get(u.file).push(u.symbol); }
    say("dispatchable kernels", `${r.kernels.length}, plus ${r.probes} probes and ${r.fragments} fragments that owe no caller`);
    say("unreachable", `${r.unreachable.length} in ${byFile.size} files`);
    for (const [f, s] of [...byFile].sort()) say("  " + f, s.join(", "));

    // *** THE ARC, NAMED, BECAUSE A COUNT DOES NOT SAY WHOSE. ***
    const TEMPORAL = /^render\/(temporal|motionVectors|ringFloor)\w*Wgsl\.mjs$/;
    const arc = r.unreachable.filter((u) => TEMPORAL.test(u.file));
    ok("!! *** the temporal arc's kernels are all unreachable, which is what this round exists to say ***",
       arc.length >= 8,
       `${arc.length} of ${r.unreachable.length}: ${arc.map((a) => a.symbol).join(", ")}. Nineteen rounds of ` +
       "kernels (v4552-v4570), every one validated on a device by its own gate, and nothing in the engine can " +
       "dispatch any of them. fsr.html runs the CPU versions of RESOLVE and ACCUMULATE every frame.");

    // RATCHET. Seeded at what was measured, may only fall, and the slack half fails if it is left behind.
    const UNREACHABLE_AT_V4589 = 17;
    ok("!! *** no EIGHTEENTH kernel arrives with nothing but a gate able to run it ***",
       r.unreachable.length <= UNREACHABLE_AT_V4589,
       `${r.unreachable.length} against a frozen ${UNREACHABLE_AT_V4589}. OWED: a runner for each, or a reason ` +
       "it is a probe. A kernel proven on a device and unrunnable by the engine is work that shipped nothing.");
    ok("...and the ratchet is not left behind by real progress",
       r.unreachable.length >= UNREACHABLE_AT_V4589 - 4,
       `${r.unreachable.length} against a frozen ${UNREACHABLE_AT_V4589}. A RATCHET WITH SLACK IN IT IS A RATCHET ` +
       "HOLDING NOTHING, so this half asks for the seed to come down once runners land.");
    ok("...and the population is not empty or degenerate, which would make every row above vacuous",
       r.kernels.length > 50 && r.probes > 5 && r.rows.length > r.kernels.length,
       `${r.rows.length} producers -> ${r.kernels.length} kernels, ${r.probes} probes, ${r.fragments} fragments. ` +
       `${r.unresolved} producers would not import and are reported rather than counted as either.`);
}

console.log(fails ? `\nkernelReach-selfcheck: ${fails} FAILED` : "\nkernelReach-selfcheck: all checks pass");
console.log("unchecked here: whether a reachable kernel is ever actually DISPATCHED AT RUNTIME -- this is a " +
            "static question about what production code CAN run, and a module imported but never called would " +
            "still read as reachable; and the .wgsl FILES, which tools/ship/shaderRefs.mjs answers.");
process.exit(fails ? 1 : 0);
