#!/usr/bin/env node
// WebGLEngine/tools/ship/changedPaths-selfcheck.mjs -- v4283
//
// GRADES tools/ship/changedPaths.mjs and the two silent green lights it closes in the --affected pre-filter.
//
// *** --affected EXISTS TO STOP A GATE GOING UNRUN, AND IT HAD TWO WAYS OF RUNNING NOTHING AND EXITING ZERO. ***
//
//   1  THE FORM. affected.mjs matches ENGINE-relative paths. `git diff --name-only` prints REPO-relative ones
//      -- "WebGLEngine/main.js" -- from every directory, and HANDOFF.md documents feeding changed files to the
//      flag. The two never composed. Nothing checked the paths named files at all, so a typo bought the same
//      clean green in 0.0 seconds.
//
//   2  THE WORKING DIRECTORY. walk() returns ROOT-relative paths and the selection filter relativised them a
//      SECOND time, which resolves against process.cwd(). Run from the engine root it was right; run from the
//      repository root -- where git is run and where the ship ritual stands -- every path became "../..." and
//      matched nothing. ZERO GATES, EXIT ZERO, from the directory you are most likely to be standing in.
//
// Both printed the evidence and neither was read: "0 of 1355 gates reach 3 changed file(s) (0.1%)" is a count
// of zero beside a fraction that is not zero, because the ANALYSIS found the gate and the RUNNER dropped it.
//
// ---- WHAT THIS GATE REFUSES TO CLAIM -------------------------------------------------------------------------
//
// Not that --affected now selects the RIGHT gates. That is affected.mjs's own question, validated against the
// mutation table, and this round did not touch the analysis. What is checked here is narrower and was the thing
// actually broken: that the paths reaching the analysis are the paths the caller meant, that a path naming
// nothing is refused rather than answered, and that the answer does not depend on where you were standing.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { classifyPath, normaliseChanged, ENGINE_REL, ENG, ROOT } from "./changedPaths.mjs";
import { affectedGates } from "./affected.mjs";
import { gateFiles } from "./staleness.mjs";

let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const report = (m) => console.log("  ----  " + m);
const RUNNER = path.join(ENG, "tools/ship/selfchecks.mjs");
// *** EVERY SPAWN CARRIES --select-only, AND THAT FLAG EXISTS BECAUSE OF A SABOTAGE. *** Breaking the comma
// refusal did not turn this gate red -- it made the runner fall THROUGH to a real run of 96 gates and the
// check hung past two minutes. A gate whose failure mode is "takes twenty minutes" reports nothing anyone
// will read. --select-only bounds every spawn to the selection, and exits 3 so a plan can never be misread
// as a pass. The refusal paths exit 2 BEFORE reaching it, which is what sections 2 and 3 are reading.
const run = (args, cwd) => {
    try { return { out: execFileSync(process.execPath, [RUNNER, ...args, "--select-only"],
                                     { cwd, encoding: "utf8", maxBuffer: 8e6, timeout: 60000 }), code: 0 }; }
    catch (e) { return { out: String(e.stdout || "") + String(e.stderr || ""), code: e.status == null ? -1 : e.status }; }
};
const selected = (o) => { const m = /--affected: (\d+) of (\d+) gates/.exec(o); return m ? +m[1] : null; };

console.log("changedPaths-selfcheck -- the pre-filter's own silent green lights\n");

console.log("1. *** THE FORM git ACTUALLY PRINTS, WHICH IS NOT THE FORM THE SELECTOR MATCHED ***");
{
    // Read off git rather than typed, so the check is about what the tool really emits.
    const names = execFileSync("git", ["diff", "--name-only", "HEAD~1", "HEAD"],
                               { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean);
    ok("CONTROL: git prints repo-root-relative paths, whatever directory it runs in",
        names.some((n) => n.startsWith(ENGINE_REL + "/")),
        names.slice(0, 2).join(" "));
    const fromEng = execFileSync("git", ["diff", "--name-only", "HEAD~1", "HEAD"],
                                 { cwd: ENG, encoding: "utf8" }).trim();
    ok("  and the SAME paths from inside the engine -- git does not rebase them on your cwd",
        fromEng === names.join("\n"), "which is exactly why this could never have worked by accident");

    const engineFiles = names.filter((n) => n.startsWith(ENGINE_REL + "/"));
    const raw = affectedGates(engineFiles);
    const cooked = affectedGates(normaliseChanged(engineFiles).resolved);
    ok("*** git's own output selects ZERO gates when passed through unnormalised ***", raw.gates.length === 0,
        `${engineFiles.length} real changed file(s) -> ${raw.gates.length} gates`);
    ok("*** and a non-zero set once normalised, which is the bug in one line ***", cooked.gates.length > 0,
        `-> ${cooked.gates.length} gate(s): ${cooked.gates.join(" ")}`);
    report("this pair is the whole finding. Both calls are given the same real files from the same real " +
        "commit; only the SPELLING differs, and the spelling git produces is the one that selected nothing.");
}

console.log("\n2. *** A PATH THAT NAMES NOTHING IS A QUESTION, NOT AN ANSWER ***");
{
    const bogus = "physics/render/pathTrcaer.mjs";                       // a plausible transposition
    ok("CONTROL: the analysis itself still answers zero for it, which is why it looked like a finding",
        affectedGates([bogus]).gates.length === 0,
        "affected.mjs cannot know a string is a typo -- that is this module's job, not its job");
    const r = run(["--affected", bogus], ENG);
    ok("*** the runner now REFUSES rather than reporting a green run of no gates ***", r.code === 2,
        `exit ${r.code}` + (/REFUSING/.test(r.out) ? ", and says REFUSING" : ", WITHOUT a refusal line"));
    ok("  and names the path it could not establish", r.out.includes(bogus));
    const c = run(["--affected", "physics/render/pathTracer.mjs,main.js"], ENG);
    ok("  a comma-joined list is refused too, and told to use spaces", c.code === 2 && /SPACES/.test(c.out),
        "a comma is legal in a filename, so splitting would GUESS -- and a selector that guesses under-selects");
    // *** ZERO MUST STILL BE REACHABLE, OR THIS ROUND TRADED ONE FALSE ANSWER FOR ANOTHER. ***
    const shader = "shaders/voxel.vert.glsl";
    ok("CONTROL: the file used for the next check really exists", fs.existsSync(path.join(ENG, shader)));
    ok("*** a REAL file that genuinely reaches no gate still reports zero rather than being refused ***",
        classifyPath(shader).kind === "engine-relative" && affectedGates([shader]).gates.length === 0,
        "an import-graph selector cannot see a .glsl file, and saying so is the honest answer");
    report("the bug was never that zero can be reported. It is the graveyard census's whole subject and it " +
        "has to stay reachable. The bug was that zero was reported for inputs NOBODY HAD ESTABLISHED WERE " +
        "FILES -- unmeasured wearing measured's clothes, which is the third state this session keeps finding.");
}

console.log("\n3. *** THE WORKING DIRECTORY MUST NOT DECIDE HOW MANY GATES RUN ***");
{
    const args = ["--affected", "brain/brain.js", "main.js", "tools/ship/roughDiffuseWired-selfcheck.mjs"];
    const rh = run(args, ENG), rr = run(args, ROOT), ra = run(args, path.parse(ENG).root);
    // --select-only exits 3 on success, so a code that is NOT 3 means the run refused or died, and the
    // selection count read out of it would be meaningless. Reported rather than silently becoming null.
    const here = rh.code === 3 ? selected(rh.out) : null;
    const repo = rr.code === 3 ? selected(rr.out) : null;
    const away = ra.code === 3 ? selected(ra.out) : null;
    const shown = (v, r) => (v === null ? `none (exit ${r.code})` : String(v));
    ok("*** the same arguments select the same gates from three different directories ***",
        here !== null && here === repo && here === away,
        `engine ${shown(here, rh)}, repo root ${shown(repo, rr)}, filesystem root ${shown(away, ra)}`);
    ok("  and that number is not zero, so the agreement is not three ways of failing",
        here > 0, `${here} gate(s) -- three agreeing zeros would satisfy the line above and prove nothing`);
    // The defect in one expression, evaluated rather than described: walk() hands back ROOT-relative strings,
    // and relativising one of those AGAIN resolves it against the cwd.
    const p = "tools/ship/roughDiffuseWired-selfcheck.mjs";
    ok("CONTROL: the old expression really was cwd-dependent",
        path.relative(ENG, p) !== path.relative(ENG, path.join(ROOT, p)),
        `from the repo root it yields "${path.relative(ENG, path.join(ROOT, p))}", which matches no key`);
}

console.log("\n4. THE INVARIANT THAT WOULD HAVE CAUGHT IT, AND WHY IT IS SOUND");
{
    // selfchecks.mjs now refuses when the selector and the runner disagree. That refusal is only safe if the
    // two are drawing from the same population, so THAT is checked here rather than assumed.
    const src = fs.readFileSync(RUNNER, "utf8");
    ok("the runner refuses when its kept set differs from the selected set",
        /all\.length !== a\.gates\.length/.test(src) && /process\.exit\(2\)/.test(src));
    const walkSet = new Set();
    (function w(dir) {
        for (const f of fs.readdirSync(dir)) {
            if (f === "node_modules" || f === ".git" || f === "vendor" || f === ".venv") continue;
            const p = path.join(dir, f);
            let st; try { st = fs.statSync(p); } catch { continue; }
            if (st.isDirectory()) w(p); else if (/selfcheck.*\.mjs$/.test(f)) walkSet.add(path.relative(ENG, p));
        }
    })(ENG);
    const gset = new Set(gateFiles().map((p) => path.relative(ENG, p)));
    const extra = [...walkSet].filter((x) => !gset.has(x));
    const missing = [...gset].filter((x) => !walkSet.has(x));
    ok("*** the runner's walk and gateFiles() hold the same gates ***", missing.length === 0,
        missing.length ? missing.join(" ") : `${gset.size} gates, ${walkSet.size} walked, so a selected gate always survives the filter`);
    ok("  and the runner's walk finds exactly one thing gateFiles does not: ITSELF",
        extra.length === 1 && extra[0] === "tools/ship/selfchecks.mjs", extra.join(" "));
    // *** THE FLAG ADDED FOR THIS GATE MUST NOT BECOME THE THING THE GATE IS ABOUT. *** --select-only runs no
    // checks. If it exited 0 it would be a fourth way to get a green run of nothing, and a deliberate one.
    const so = run(["--affected", "main.js"], ENG);
    ok("*** --select-only exits 3, so a plan can never be read as a pass ***", so.code === 3, `exit ${so.code}`);
    ok("  and says out loud that nothing was run", /NOTHING WAS RUN/.test(so.out));
    report("the invariant refuses on a real disagreement and cannot fire on this one, because SELF is dropped " +
        "before the comparison. An invariant that could fire spuriously in a SHIP TOOL is worse than none.");

    // v4283 also deleted a walker that nothing called. Checked here because dead code with a live-looking
    // shape is what gets revived.
    // *** THIS CHECK WENT RED ON ITS FIRST RUN AND THE MODULE WAS CORRECT. *** The comment left behind in
    // affected.mjs explaining what was deleted SPELLS THE DELETED PATTERN OUT, so a test against raw source
    // found it and called the walker present. Eleventh time this tree has been bitten by a file grading a
    // marker it also discusses; comments are stripped before the question is asked, which is the only form
    // of this check that is about the CODE.
    const affRaw = fs.readFileSync(path.join(ENG, "tools/ship/affected.mjs"), "utf8");
    const codeOnly = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
    const aff = codeOnly(affRaw);
    ok("*** the orphaned third walker is gone from the CODE, not merely unused ***",
        !/function walk\(/.test(aff) && !/vendor\|/.test(aff),
        "its skip pattern matched a gate whose name merely starts with the excluded word");
    ok("  CONTROL: the stripper is doing work -- the pattern IS still discussed in the prose",
        /vendor/.test(affRaw) && !/vendor\|/.test(aff),
        "a deletion that may not be explained is not a deletion anyone can learn from");
    ok("  CONTROL: the pattern really was that greedy",
        /[\\/]vendor/.test("/x/tools/ship/vendoredLicences-selfcheck.mjs"),
        "unanchored to a path segment, so a gate whose name STARTS with the excluded word was excluded too");
}

// =============================================================================================================
// SABOTAGE LOG -- grep-confirmed before the result was read, exit codes and FAIL summaries both read, restored
// md5-identical (selfchecks ced93cf50f537944, changedPaths 0d7d62c0e595bdb8). MEASURED.
//
//   A  the double relativisation restored -- the cwd bug exactly as it stood for versions.
//      -> exit=1, 1 red. Section 3 reads "engine 1, repo root none (exit 2), filesystem root none (exit 2)":
//      the runner now REFUSES from those directories rather than quietly selecting nothing, because the
//      selector/runner invariant fires before the count is even printed. *** THE SABOTAGE THAT REINTRODUCES
//      THE BUG NO LONGER PRODUCES A GREEN RUN, WHICH IS THE POINT OF THE ROUND *** -- it produces a refusal.
//
//   B  "missing" dropped from REFUSING, so a typo is answered rather than refused.
//      -> exit=1, 1 red, and the red is NOT the one aimed at. The runner still exits 2, via the separate
//      guard for "every path is outside the engine" -- defence in depth that happens to catch it. What fails
//      is the check that the refusal NAMES the path, and that difference matters: the fallback message would
//      have told the caller their file was outside the engine when in fact they had mistyped it. A refusal
//      for the wrong reason sends someone looking in the wrong place.
//
//   C  repo-relative paths stop being recognised, so git's own output is treated as missing again.
//      -> exit=1, 1 red, in section 1: the normalised set drops to 0 gates and the "bug in one line" pair
//      collapses into two identical zeros. This is the headline defect reintroduced, and the check that
//      catches it is the one comparing the SAME files under two spellings.
//
//   D  the comma list SPLIT on a guess -- take the first real piece and proceed -- instead of refused.
//      -> exit=1, 1 red. *** THE FIRST TIME THIS WAS RUN IT DID NOT GO RED, IT HUNG. *** Without the refusal
//      the runner fell through to a real run of the 96 gates the first piece selects, and the check sat past
//      two minutes reporting nothing. A gate whose failure mode is "takes twenty minutes" is a gate nobody
//      reads the result of. --select-only exists because of this sabotage, every spawn here carries it, and
//      the redone sabotage reddens in seconds.
//
//   E  --select-only exits 0 instead of 3.
//      -> exit=1, 3 red. The most reds of any, and it is a flag that runs no checks: with a zero exit it is
//      a FOURTH way to get a green run of nothing, and a deliberate one. Section 3's three directories all
//      read "none (exit 0)" because a code that is not 3 means the number in that output cannot be trusted.
//
//   F  the selector/runner agreement invariant deleted from selfchecks.mjs.
//      -> exit=1, 1 red, AND IT IS A SOURCE CHECK RATHER THAN A BEHAVIOURAL ONE. Nothing observable changes,
//      because with A fixed there is no disagreement left to catch. That is the honest relationship: the
//      invariant is a belt for a bug already fixed by braces, and the only way to check a belt nobody is
//      currently falling against is to look at whether it is still buckled. Recorded rather than dressed up
//      as a behavioural result.
//
// None went 0 RED. B and D are the pair worth keeping: B because a refusal for the wrong reason is its own
// defect, and D because it is the one that improved the tooling rather than the module.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER --affected SELECTS THE RIGHT GATES. That is affected.mjs's question, it " +
    "is validated against tools/mutate's known breakages, and this round did not touch the analysis -- only " +
    "what reaches it and what survives it. Also unchecked: every OTHER consumer of a changed-file list in this " +
    "tree. --budget was found taking the same raw argv and was fixed with it, but the search for others was a " +
    "grep, not a proof, and a grep does not find a caller that builds the list some other way.");
process.exit(fails ? 1 : 0);
