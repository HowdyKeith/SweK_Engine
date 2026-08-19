// WebGLEngine/tools/ship/multigridBench-selfcheck.mjs
//
// Run: node tools/ship/multigridBench-selfcheck.mjs   (~20s -- MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3224 -- THE PAGE THAT TURNS "SHOULD WE WIRE THE GPU MULTIGRID" INTO A TABLE.
//
// fluid/multigridGPU.js has been finished, gated and connected to nothing since v3126. The question stalled
// because it had no number attached, and BOTH HALVES OF MY OWN ANSWER TO IT WERE WRONG:
//
//   (1) I recorded the blocker as "wiring it changes the shape of every caller of the physics tick". MEASURED,
//       IT IS THREE EDITS. _project already carries a solver switch (mgpcg / rbgs), so the device path is a
//       third branch rather than a rewrite; step() and _project() become async; and Flip2D has exactly ONE
//       importer outside fluid/ -- fluid-rigid-2d.html. THE COST WAS NEVER THE PROBLEM.
//
//   (2) *** THEN I MEASURED THE TWO CPU PATHS ONCE, COLD, AND NEARLY REPORTED A FREE WIN. *** The gather form
//       came back 1.45x FASTER than the scatter form the fluid actually runs -- which would have meant a
//       speedup with no GPU and no async at all. WARMED UP IT IS SLOWER EVERYWHERE: 0.96, 0.67, 0.81, 0.85 at
//       32, 64, 128 and 192 squared. THE FIRST NUMBER WAS JIT WARM-UP, and this tree had already written that
//       trap down about its own brick panel ("the first march includes JIT warmup, so compare QUERIES and not
//       milliseconds"). One unwarmed pair, one false conclusion, caught only by sweeping sizes.
//
// SO THE PAGE DISCARDS WARM-UP RUNS AND SAYS SO ON ITS FACE, which is what this gate pins. A benchmark whose
// warm-up policy lives in a comment is one edit away from being the measurement that misled me.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const page = fs.readFileSync(path.join(ROOT, "multigrid.html"), "utf8");
const code = noComments(page);

// ---- 1. THE MEASUREMENT DISCIPLINE THE PAGE EXISTS FOR --------------------------------------------------------------
{
    ok("!! *** warm-up runs are EXECUTED AND DISCARDED, not skipped ***",
        /for \(let i = 0; i < warm; i\+\+\)/.test(code) && /performance\.now\(\)/.test(code),
        "the JIT has to compile the code before a timing means anything, so the warm-up runs really run and " +
        "then are not counted. A COLD PAIR MADE THE GATHER PATH LOOK 1.45x FASTER THAN THE SCATTER PATH IT IS " +
        "SLOWER THAN -- one measurement, one false conclusion, and it was mine");

    ok("!! ...and the policy is on the PAGE, not in a comment",
        /thrown away/i.test(page) && /1\.45/.test(page),
        "a benchmark whose warm-up policy lives only in a comment is one edit from becoming the measurement " +
        "that misled somebody. The reversal that caused this page is printed where a reader will meet it");

    ok("...and the problem is DERIVED, so two runs are comparable",
        /Math\.sin\(i \* 0\.017\)/.test(code) && !/Math\.random/.test(code),
        "a random field makes two runs incomparable and a uniform one lets a broken solve look correct");
}

// ---- 2. IT COMPARES AGAINST WHAT THE FLUID ACTUALLY RUNS -------------------------------------------------------------
{
    ok("!! the reference is the SCATTER path, which is the one flip2d uses today",
        /PoissonMG/.test(code) && /shadowSolve/.test(code) && /GpuMultigrid/.test(code),
        "three paths on one problem: the solve the fluid runs, the GPU-shaped gather rewrite, and the device " +
        "port. Correctness is measured against the path in service, because that is the only reference that " +
        "decides anything");

    const gate = fs.readFileSync(path.join(ROOT, "fluid", "multigridGPU-selfcheck.mjs"), "utf8");
    ok("...and CORRECTNESS is already settled elsewhere, so this page is only about cost",
        /matches PoissonMG/.test(gate),
        "fluid/multigridGPU-selfcheck gates the port's agreement with PoissonMG headlessly. THIS PAGE IS NOT " +
        "ASKING WHETHER THE PORT IS RIGHT -- conflating the two would let a speed result be read as a " +
        "correctness result");
}

// ---- 3. THE ABSENCE OF A GPU IS NAMED, NOT LEFT BLANK -----------------------------------------------------------------
{
    ok("!! *** a missing device is REPORTED WITH ITS REASON rather than shown as an empty column ***",
        /navigator\.gpu/.test(code) && /requestAdapter\(\) returned null/.test(page) && /NO DEVICE COLUMN/.test(page),
        "a column of dashes and a column of ones mean OPPOSITE THINGS, and a page that rendered both as empty " +
        "would be useless exactly where the decision lives. UNSUPPORTED IS A CAPABILITY, NOT A FAILURE (v3120)");

    ok("!! ...and a device path that THROWS is a finding, not a blank",
        /devErr/.test(code) && /has never been executed on hardware/.test(page),
        "this port has never run on a GPU. The first execution failing is information worth having, and a page " +
        "that swallowed the exception would report it as slow rather than broken");
}

// ---- 4. THE VERDICT CAN SAY NO ------------------------------------------------------------------------------------
{
    ok("!! *** a device that merely MATCHES the CPU is reported as a reason NOT to wire it ***",
        /reason NOT to wire it/i.test(page) && /async is a cost paid every frame/i.test(page),
        "async is paid every frame whether the GPU helps or not, and fluid-rigid-2d.html steps TWICE per rAF, " +
        "so an awaited solve is two round-trips inside one animation frame. A BENCHMARK THAT CAN ONLY RECOMMEND " +
        "ITS SUBJECT IS AN ADVERT -- the threshold is stated before the numbers arrive, so reading them is not " +
        "motivated");

    // *** AND THE ENTRY IS GONE, WHICH IS THE ANTIDOTE FIRING ON ITS OWN ROUND. *** unwiredRegister's header
    // says "WHEN ONE IS WIRED, ITS ENTRY IS DELETED, NOT EDITED". Building this page gave multigridGPU.js a
    // consumer, graveyard stopped calling it an orphaned utility, and the register's staleness check went red
    // naming it -- so the line went, rather than being softened into "partly wired". THE REASONING DID NOT
    // EVAPORATE WITH IT: it moved into this page's header, which is a better home for it than a register of
    // things nobody calls. THE FLUID WIRING DECISION IS STILL OPEN; it is simply no longer blocked on a missing
    // number.
    const reg = fs.readFileSync(path.join(ROOT, "tools", "ship", "unwiredRegister.mjs"), "utf8");
    ok("!! the register entry is DELETED, not edited, now the module has a consumer",
        !/"fluid\/multigridGPU\.js", \{/.test(reg) && /CAME OFF THIS LIST AT v3224 AND ITS ENTRY WAS DELETED/.test(reg),
        "naming the correct response in advance produced it for the fourth time this session. A softened entry " +
        "-- 'partly wired', 'benched but not wired' -- would have been a suppression holding nothing, which is " +
        "exactly what the staleness check that caught this exists to prevent");

    ok("...and the corrected blocker is recorded in this page rather than lost with the entry",
        /THREE EDITS/.test(fs.readFileSync(path.join(ROOT, "multigrid.html"), "utf8")),
        "the v3223 entry said wiring it 'changes the shape of every caller of the physics tick'. That was WRONG " +
        "BY INSPECTION, and deleting the entry must not delete the correction with it");
}

console.log();
console.log("  ----  THE ONE THING THIS CANNOT DO IS ANSWER THE QUESTION. There is no GPU in the sandbox, so the");
console.log("  ----  device column is empty here BY CONSTRUCTION and the CPU columns settle nothing on their own:");
console.log("  ----  the gather path exists to run on a GPU and is slower without one. THE PAGE IS THE INSTRUMENT;");
console.log("  ----  the measurement is Keith's, on the rig, and it is three button presses.");
if (fails) { console.log("multigridBench-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("multigridBench-selfcheck: all checks pass");
