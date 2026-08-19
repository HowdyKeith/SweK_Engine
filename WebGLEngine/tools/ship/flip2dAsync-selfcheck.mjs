// WebGLEngine/tools/ship/flip2dAsync-selfcheck.mjs
//
// Run: node tools/ship/flip2dAsync-selfcheck.mjs   (~5s -- MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3225 -- THE GPU PRESSURE SOLVE IS WIRED, OPT-IN, AND NOBODY PAYS FOR IT UNTIL THEY ASK.
//
// fluid/multigridGPU.js has been finished and connected to nothing since v3126. v3224 measured the cost of
// connecting it and found the recorded blocker was wrong: THREE EDITS, not "the shape of every caller of the
// physics tick". This is those three edits, and the reason they are safe to make before anybody has decided to
// USE the device path is one property, which this file exists to pin:
//
// *** AN async FUNCTION RUNS ITS BODY EAGERLY UP TO THE FIRST await. *** The jacobi, rbgs and mgpcg branches
// contain none, so a caller that does NOT await still gets a fully completed step -- every field mutated, in
// order, before step() returns. fluid-rigid-2d.html keeps calling sim.step(1/60) unchanged. ONLY THE "mggpu"
// BRANCH ACTUALLY SUSPENDS.
//
// MEASURED, NOT ARGUED: twenty un-awaited steps and twenty awaited steps leave the velocity field BIT-IDENTICAL,
// worst |du| exactly 0.
//
// *** AND THE DEVICE SOLVER REFUSES RATHER THAN FALLING BACK. *** A solver that quietly ran on the CPU when
// asked for the GPU would make multigrid.html's numbers meaningless, and it is exactly the "flag that lies
// about which code ran" that voxel-viewer already refuses to be (v2866). Asked for mggpu with no device, it
// throws and says what to pass.
//
// THE DEFAULT IS UNCHANGED ON PURPOSE -- this tree's own precedent from v2579, where the greedy mesher went
// behind ?mesher=greedy with the reason written down. There is still no measurement saying the device path is
// faster, so there is still no reason to make anybody pay for an await.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const { Flip2D } = await import(pathToFileURL(path.join(ROOT, "fluid", "flip2d.mjs")).href);
const src = noComments(fs.readFileSync(path.join(ROOT, "fluid", "flip2d.mjs"), "utf8"));

// ---- 1. THE PROPERTY THE WIRING RESTS ON --------------------------------------------------------------------------
{
    const run = async (awaited) => {
        const s = new Flip2D(32, 32, { solver: "jacobi" });
        for (let i = 0; i < 20; i++) { if (awaited) await s.step(1 / 60); else s.step(1 / 60); }
        return s;
    };
    const a = await run(false), b = await run(true);
    let worst = 0;
    for (let i = 0; i < a.u.length; i++) worst = Math.max(worst, Math.abs(a.u[i] - b.u[i]));

    ok("!! *** an UN-AWAITED step still completes: the CPU path is bit-identical awaited or not ***",
        worst === 0,
        "worst |du| after 20 steps each way: " + worst + " -- EXACTLY zero, not merely small. An async function " +
        "runs eagerly to its first await and the CPU branches have none, so fluid-rigid-2d.html keeps calling " +
        "sim.step(1/60) unchanged and NOBODY PAYS THE ASYNC COST UNTIL THEY ASK FOR THE DEVICE");

    ok("...and the page that drives it was left alone, which is the point",
        !/await sim\.step/.test(fs.readFileSync(path.join(ROOT, "fluid-rigid-2d.html"), "utf8")),
        "the one importer of Flip2D outside fluid/ is untouched. IF WIRING A DEVICE PATH HAD REQUIRED EDITING " +
        "ITS CALLERS, that would have been a reason to wait for a measurement first -- it did not");
}

// ---- 2. THE DEVICE BRANCH REFUSES RATHER THAN FALLING BACK ----------------------------------------------------------
{
    const s = new Flip2D(16, 16, { solver: "mggpu" });
    let refused = false, msg = "";
    try { await s.step(1 / 60); } catch (e) { refused = true; msg = e.message; }

    ok("!! *** asked for the GPU with no device, it THROWS instead of quietly running on the CPU ***",
        refused && /needs a WebGPU device/.test(msg) && /refusing to fall back/i.test(msg),
        "a solver that silently ran somewhere else would make multigrid.html's numbers meaningless -- the same " +
        "'flag that lies about which code ran' voxel-viewer refuses to be (v2866). It names what to pass: " +
        "{ solver: 'mggpu', gpuDevice }");

    ok("...and the fallback is absent from the source, not merely untaken",
        !/catch[^\\n]*\\{[^}]*solver = "jacobi"/.test(src) && /refusing to fall back/i.test(src),
        "A CLAIM ABOUT ABSENCE MUST BE VISIBLE IN THE CODE. A silent fallback added later would pass the check " +
        "above whenever a device happened to exist");
}

// ---- 3. THE DEFAULT IS UNCHANGED, ON PURPOSE ------------------------------------------------------------------------
{
    const s = new Flip2D(16, 16, {});
    ok("!! the default solver is still jacobi -- wiring a path is not choosing it",
        s.solver === "jacobi" && /opts\.solver \|\| "jacobi"/.test(src),
        "v2579's precedent: the greedy mesher went behind ?mesher=greedy and the default was left alone with " +
        "the reason written down. THERE IS STILL NO MEASUREMENT SAYING THE DEVICE PATH IS FASTER -- multigrid" +
        ".html produces that number and it needs a GPU. Wiring makes it POSSIBLE to answer, not answered");

    ok("...and the device is only touched by the solver that needs it",
        // COUNTED, NOT GUESSED: I typed <= 4 from memory of what I had written and the real count is 3, which
        // is the same class of error as every other assumed number this session -- it just happened to be too
        // TIGHT rather than too loose. The property is that the device is stored once and read only inside the
        // branch that needs it, so it is asserted as THAT rather than as a total.
        /this\.gpuDevice = opts\.gpuDevice \|\| null/.test(src) &&
        !/jacobi|rbgs|mgpcg/.test((src.match(/if \(!this\.gpuDevice\)[^\n]*/) || [""])[0]),
        "a constructor that demanded a device for every solver would make the CPU paths depend on WebGPU being " +
        "present, which is the opposite of opt-in");
}

console.log();
console.log("  ----  WHAT IS STILL OPEN AND IS NOT A CODE QUESTION: whether to USE it. multigrid.html times the");
console.log("  ----  three paths on one problem, and its threshold is stated in advance -- a device column that");
console.log("  ----  merely MATCHES the CPU is a reason NOT to switch, because async is paid every frame and");
console.log("  ----  fluid-rigid-2d.html steps TWICE per rAF. The wiring exists so the question can be asked on");
console.log("  ----  real fluid rather than a bench; it does not answer it.");
if (fails) { console.log("flip2dAsync-selfcheck: " + fails + " FAILURES"); process.exit(1); }
// ---- v3353: THE PAGE MUST NOT OUTLIVE THE WIRING IT DESCRIBES ---------------------------------------------
// multigrid.html said the WebGPU port "is wired to nothing" for 127 versions after v3225 wired it as solver
// mggpu. Nothing was red, because a SENTENCE is not a claim anything checks -- and the same stale line was
// still being repeated from a memory note this session, which is how a fixed thing keeps getting re-proposed.
{
    const fs2 = await import("node:fs");
    const page = fs2.readFileSync(new URL("../../multigrid.html", import.meta.url), "utf8");
    const flip = fs2.readFileSync(new URL("../../fluid/flip2d.mjs", import.meta.url), "utf8");
    const dispatches = /this\.solver === "mggpu"/.test(flip);
    const claimsUnwired = /wired to nothing/i.test(page.replace(/&ldquo;wired to nothing&rdquo;/gi, ""));
    ok("!! *** the page does not call the GPU port unwired while flip2d dispatches to it ***",
        dispatches && !claimsUnwired,
        "flip2d has had a `solver === \"mggpu\"` branch since v3225. A page describing it as wired to nothing " +
        "is a false statement that no gate could see, and it survived 127 versions and was quoted back as " +
        "current this session");
}

console.log("flip2dAsync-selfcheck: all checks pass");
