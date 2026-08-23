// tools/roundhouse/magmapTaichi-selfcheck.mjs
//
// Run: node tools/roundhouse/magmapTaichi-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** WHAT THIS GATE CAN AND CANNOT SAY, DECIDED BEFORE IT WAS WRITTEN. ***
//
// It CANNOT run the taichi kernel. taichi's WgslCodegen imports Runtime, Runtime requires navigator.gpu before
// anything compiles, and there is no headless path that even emits the generated WGSL. Measured, not assumed:
// navigator.gpu is ABSENT in this container's headless Chromium under --enable-unsafe-webgpu, swiftshader,
// --use-webgpu-adapter=swiftshader and --use-vulkan=swiftshader alike.
//
// So it grades THE THINGS THAT ARE TRUE WITHOUT A GPU, and says plainly that the comparison is unrun. The
// alternative -- an emulator standing in for taichi -- is refused in magmapTaichi.mjs and refused again here:
// this tree already owns that lesson ("an emulator that claimed to be a GPU would make this whole file the
// thing the house rule warns about: a test that passes because the experiment did not run").
//
// A GATE THAT REPORTS "PASS" MUST NOT BE READ AS "TAICHI WORKS". It is read as: the vendored bundle is intact
// and licensed, the kernel obeys the operation discipline the tolerance was earned against, and the proposer
// refuses rather than fabricating. The verdict on taichi itself is a rig measurement and is NOT IN HERE.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KERNEL_SRC, ALLOWED_TI_OPS, FORBIDDEN_TI_OPS, TAICHI_URL, magmapTaichi } from "./magmapTaichi.mjs";
import { MAGMAP_TOL, F32_FLOOR } from "./magmapGpu.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (n, d) => console.log("  ----  " + n + (d ? "   " + d : ""));

console.log("magmapTaichi-selfcheck -- a second proposer for the map, and an honest account of what is unrun\n");

// ---- 1. THE VENDORED BUNDLE IS INTACT, AND IT IS LICENSED ----------------------------------------------------
console.log("1. THE VENDORED DEPENDENCY");
{
    const dir = path.join(ENG, "vendor", "taichi-js");
    const bundle = path.join(dir, "taichi.js");
    const lic = path.join(dir, "LICENSE");
    ok("!! the bundle is vendored, not fetched from a CDN at runtime",
        fs.existsSync(bundle),
        "a page that pulls its compute framework off the network at load is a page that stops working when " +
        "somebody else's host does, and this engine runs on a LAN rig by design");
    ok("!! ...and its LICENCE is beside it",
        fs.existsSync(lic) && /MIT/.test(fs.readFileSync(lic, "utf8")),
        "*** VENDORING SOMEBODY'S ENGINE WITHOUT THEIR LICENCE IS NOT A PACKAGING DETAIL, IT IS TAKING IT *** " +
        "-- the krbn rule from v2608, applied to the second thing this tree has vendored for compute");
    ok("...and the licence names its author, so a reader can check it",
        /Dunfan Lu/.test(fs.readFileSync(lic, "utf8")),
        "an MIT header with no copyright holder is not a licence grant, it is a template");
    ok("!! ...and PROVENANCE records the version and what was deliberately NOT taken",
        (() => { const p = path.join(dir, "PROVENANCE.md");
                 if (!fs.existsSync(p)) return false; const s = fs.readFileSync(p, "utf8");
                 return /0\.0\.36/.test(s) && /107 MB/.test(s) && /high-severity/.test(s); })(),
        "the npm package installs 107 MB and carries 5 high-severity advisories through @loaders.gl/gltf, a " +
        "RENDERER dependency no compute kernel touches. Taking the self-contained bundle alone is a deliberate " +
        "narrowing, and a narrowing nobody wrote down is one the next person silently undoes");
    const size = fs.statSync(bundle).size;
    say("bundle size", (size / 1048576).toFixed(1) + " MB -- mostly the TypeScript compiler, which taichi " +
        "re-parses kernel source with AT RUNTIME (KernelFactory -> ParsedFunction.makeFromCode)");
    ok("...and the path the page loads is ONE declaration, shared with the module",
        TAICHI_URL === "/vendor/taichi-js/taichi.js" && fs.existsSync(path.join(ENG, TAICHI_URL.replace(/^\//, ""))),
        "a URL spelled once in a page and once in a module is two declarations about one file");
}

// ---- 2. THE KERNEL KEEPS THE DISCIPLINE THE TOLERANCE WAS EARNED AGAINST -------------------------------------
console.log("\n2. *** THE OPERATION DISCIPLINE, ASSERTED OVER THE SOURCE TAICHI WILL ACTUALLY COMPILE ***");
{
    // Comments are stripped first: this file's own prose NAMES ti.rsqrt in order to forbid it, and a raw scan
    // would convict the explanation. Same prose-as-code trap winPathGuard spent v3936 fixing.
    const code = KERNEL_SRC.split("\n").filter((L) => !L.trim().startsWith("//")).join("\n");

    const used = ALLOWED_TI_OPS.filter((o) => code.includes(o));
    const bad = FORBIDDEN_TI_OPS.filter((o) => code.includes(o));
    say("ti.* operations used", used.join(", ") || "(none)");
    ok("!! *** the kernel names NO operation whose f32 rounding WGSL does not pin ***",
        bad.length === 0,
        "*** THE TOLERANCE IS A CLAIM ABOUT WHAT THE HARDWARE CAN DO, AND IT WAS EARNED AGAINST + - * / sqrt " +
        "ONLY. *** taichi lowers ti.rsqrt to inverseSqrt() and ti.pow to pow(), so reaching for one here would " +
        "move the error floor underneath a tolerance nobody re-derived. Forbidden and found: " +
        (bad.join(", ") || "none"));
    ok("...and it does use sqrt, so the check is not passing on an empty kernel",
        code.includes("ti.sqrt") && used.length >= 2,
        "*** A DISCIPLINE CHECK THAT WOULD PASS ON A BLANK STRING IS NOT CHECKING ANYTHING *** -- the same " +
        "empty-scan trap this tree keeps finding, in an allow-list");
    ok("!! ...and the trig tables are READ, never recomputed on the device",
        code.includes("cosT[j]") && code.includes("sinT[j]") && !/\bti\.(sin|cos)\b/.test(code),
        "the tables arrive precomputed from the CPU's strictTrig precisely because WGSL pins the rounding of " +
        "no transcendental -- computing them on the device is the same defect as calling ti.sin here");
    ok("!! ...and the accumulation stays SEQUENTIAL within a thread",
        /for \(let i of ti\.range/.test(code) && /for \(let j of ti\.range/.test(code) &&
        /acc  = acc \+/.test(code) && !/ti\.(atomic|reduce)/.test(code),
        "the hand-written kernel's guarantee is 'the accumulation is sequential within the thread, so there is " +
        "no reduction order to be nondeterministic about'. An atomic or a reduce here would hand the sum an " +
        "order the f64 reference never agreed to");
}

// ---- 3. THE PROPOSER REFUSES RATHER THAN EMULATING -----------------------------------------------------------
console.log("\n3. *** IT REFUSES WHERE IT CANNOT MEASURE ***");
{
    let threw = null;
    try { await magmapTaichi(null, {}); } catch (e) { threw = String(e && e.message || e); }
    ok("!! passing no taichi module is refused, not defaulted",
        threw !== null && /does not import it/.test(threw),
        "importing a 3.5 MB bundle that calls navigator.gpu at init, as a side effect of a node gate reading " +
        "this file, is not something a module should do quietly");

    let noGpu = null;
    try { await magmapTaichi({}, {}); } catch (e) { noGpu = String(e && e.message || e); }
    ok("!! *** and with no WebGPU it REFUSES rather than emulating ***",
        noGpu !== null && /REFUSES to emulate/.test(noGpu),
        "*** magmapGpu HAS an emulator because it reproduces arithmetic THIS TREE WROTE and can therefore " +
        "model. NOBODY HERE KNOWS WHAT WGSL TAICHI EMITS. *** An emulator for it would be a guess wearing a " +
        "measurement's clothes -- the exact failure magmapGpu's own header names, one dependency further out");

    ok("...and there is deliberately no magmapTaichiEmulated to reach for",
        !/export function magmapTaichiEmulated|export async function magmapTaichiEmulated/
            .test(fs.readFileSync(path.join(HERE, "magmapTaichi.mjs"), "utf8")),
        "the absence is the design, so it is asserted rather than left to be noticed");
}

// ---- 4. WHAT IS STILL UNRUN, NAMED -------------------------------------------------------------------------
console.log("\n4. *** THE MEASUREMENT THIS GATE DOES NOT MAKE ***");
{
    say("adjudication tolerance", "MAGMAP_TOL = " + MAGMAP_TOL + ", earned against a measured f32 floor of " + F32_FLOOR);
    say("UNRUN, and it is the whole question",
        "whether taichi's generated WGSL lands inside that floor, and what it costs against the hand-written " +
        "kernel. Both need a device. Run magmap-bench.html on the rig.");
    say("why it cannot run here",
        "WgslCodegen imports Runtime; Runtime requires navigator.gpu before compiling. Headless Chromium in " +
        "this container reports navigator.gpu ABSENT under every documented enabling flag, so there is not " +
        "even a path that PRINTS the generated shader.");
    ok("!! this gate does not claim the comparison happened",
        true,
        "*** IT PASSES ON VENDORING, DISCIPLINE AND REFUSAL -- NOT ON TAICHI WORKING. *** Reading a green here " +
        "as 'the replacement is validated' would be exactly the substitution this file was written to prevent.");
}

console.log(fails ? "\nmagmapTaichi-selfcheck: " + fails + " FAILED" : "\nmagmapTaichi-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
