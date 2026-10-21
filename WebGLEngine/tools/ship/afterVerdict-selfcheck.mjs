// WebGLEngine/tools/ship/afterVerdict-selfcheck.mjs -- v4835
//
// Run: node tools/ship/afterVerdict-selfcheck.mjs
//
// GATES tools/ship/afterVerdict.mjs, the ship ritual's step 4b as a command. Four things it must hold:
//   1. the timing-record pattern MOVED out of .claude/skills/ship/SKILL.md, character for character, and the skill
//      names the command instead of carrying a second copy;
//   2. a mention in a COMMENT selects nothing (labResults' fifteen minutes), and one in code does;
//   3. the plan DERIVES the two gates v4819 shipped red past its verdict -- orreryFleet and universeWire -- from
//      recordReach's blockers, and a world where one of them is under the sweep's line drops it;
//   4. a red is named and the run exits 1; a gate killed at the timeout is a red, not a pass.
//
// SABOTAGES, five, each red by name:
//   P. recordGuardians returns nothing                         -> 2 (orreryFleet on the plan; every blocker on it)
//   Q. the reader test reads the raw text, comments and all      -> 1 (the prose row)
//   R. a run with no exit status (killed) counts as passing       -> 1 (the red/timeout row)
//   T. the pattern loses one alternative (gate-timings)           -> 1 (the character-for-character row)
//   U. step 4b goes back to a hand-typed one-liner                -> 2 (names the command; carries no copy)
// v4846 -- SECTION 6 (TREE_RATCHETS, the third kind). Sabotages, each applied to tools/ship/afterVerdict.mjs, the gate run, restored:
//   V  plan() never adds treeRatchets                                     -> RED (over the line it is on the plan)
//   W  treeRatchets keeps a gate UNDER the line too                       -> RED (under the line it is left off)
//   X  a holds name misspelled (BASELINE_WIDEN)                           -> RED (each named in the gate's code)
"use strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as AV from "./afterVerdict.mjs";
import { reach } from "./recordReach.mjs";
import { enumerateGates } from "./gateSweep.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(ENG, "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
// v4838 -- SECTION 5 (a shallow clone cannot grade the two gates that read git history). Six sabotages, each applied to tools/ship/afterVerdict.mjs, the gate run, the file restored (md5-identical):
//   A  the shallow skip never fires (`false &&`)                          -> 1 RED (the not-run / not-red / named row)
//   B  ungraded gates exit 0, which would read as a pass                   -> 1 RED (the exit-3 row)
//   C  isShallow trusts stdout without the exit status. *** FIRST TRY WENT 0 RED: the "failed command" fixture printed nothing, so the check was never needed. The fixture is now a failed command that STILL printed "true". *** -> 1 RED
//   D  a red no longer outranks the ungraded count (exit 1 -> 0 when ungraded) -> 1 RED
//   E  a history gate misspelled in NEEDS_HISTORY (not a real gate)         -> 1 RED (the real-gates row)
//   F  the command line never passes `shallow` on to runAll                  -> 1 RED (the wiring row)
// MEASURED, NOT ARGUED: on a depth-1 clone of the v4837 commit orreryFleet-selfcheck and budgetExile-selfcheck both exit 1; after `git fetch --unshallow` (2,400 commits) both exit 0. Keith's rig saw exactly these two.
console.log("afterVerdict-selfcheck -- step 4b is a command, and it runs what no ship-time step ran\n");

console.log("1. the pattern moved out of the skill rather than being copied");
{
    const skill = fs.readFileSync(path.join(ROOT, ".claude", "skills", "ship", "SKILL.md"), "utf8");
    const step = (skill.split(/^## 4b\./m)[1] || "").split(/^## /m)[0];
    ok("!! step 4b of the ship skill runs tools/ship/afterVerdict.mjs", /node tools\/ship\/afterVerdict\.mjs/.test(step),
        step ? step.split("\n").find((l) => /afterVerdict/.test(l)) || "(step 4b names no afterVerdict command)" : "no step 4b in SKILL.md");
    ok("...and carries no copy of the pattern, so there is one list and not two",
        !step.includes("sweep-timings|quickSweep") && !/enumerateGates\(\)\.filter/.test(step),
        "a second copy is how a list drifts: the next edit lands in one of them");
    // the pattern as the skill held it until v4835 (frozen here as the evidence of the move, not as a second list)
    const SKILL_UNTIL_V4835 = String.raw`sweep-timings|quickSweep\.mjs|sweepCoverage\.mjs|sweepRotation\.mjs|recordReach\.mjs|declaredCost\.mjs|budgetExile\.mjs|redCensus\.mjs|timingsTarget|readTimings|capReading|gate-timings`;
    ok("...and the pattern the command holds is the one the skill held until v4835, character for character",
        AV.TIMING_READER.source === SKILL_UNTIL_V4835, AV.TIMING_READER.source.length + " characters");
}

console.log("\n2. a mention in prose selects nothing; a mention in code does");
{
    const src = {
        "a/prose-selfcheck.mjs": "// this gate once read tools/ship/sweep-timings.json, at length\nconsole.log('ok');\n",
        "a/code-selfcheck.mjs": "import fs from 'node:fs';\nconst t = JSON.parse(fs.readFileSync('tools/ship/sweep-timings.json', 'utf8'));\n",
        "a/module-selfcheck.mjs": "import { readTimings } from '../tools/ship/recordReach.mjs';\n",
    };
    const got = AV.timingReaders({ gates: Object.keys(src), read: (g) => src[g] });
    ok("!! *** a gate that names the record only in a comment is NOT selected -- labResults' fifteen minutes ***",
        !got.includes("a/prose-selfcheck.mjs"), JSON.stringify(got));
    ok("...a gate that reads it in code is, and so is one that imports a module that reads it",
        got.includes("a/code-selfcheck.mjs") && got.includes("a/module-selfcheck.mjs"), JSON.stringify(got));
    const live = AV.timingReaders();
    const lab = live.find((g) => /labResults-selfcheck/.test(g));
    say(`on this tree: ${live.length} timing-record readers; labResults ${lab ? "IS still selected (" + lab + ")" : "is not"}`);
}

console.log("\n3. the plan holds the two gates v4819 shipped red past its verdict, by derivation");
{
    const R = reach();
    const p = AV.plan({ r: R });
    const has = (g) => p.find((x) => x.gate === g);
    const FLEET = "tools/ship/orreryFleet-selfcheck.mjs", WIRE = "tools/ship/universeWire-selfcheck.mjs";
    const f = has(FLEET), w = has(WIRE);
    ok("!! *** orreryFleet-selfcheck is on the plan as a frozen record's only guard over the sweep's line ***",
        !!f && f.why.some((x) => x.startsWith("the only guard")), f ? f.why.join("; ").slice(0, 200) : "absent from the plan");
    ok("!! *** universeWire-selfcheck is on it too ***", !!w, w ? w.why.join("; ").slice(0, 200) : "absent from the plan");
    ok("...every recordReach blocker is on the plan, and nothing is on it for no reason",
        R.blockers.every((b) => has(b.gate)) && p.every((x) => x.why.length > 0),
        `${R.blockers.length} blockers, ${p.length} on the plan`);
    // A world where orreryFleet is under the line: the quick sweep runs it, so the plan must not.
    const T = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-timings.json"), "utf8"));
    const cheap = { ...T, ok: true, entries: Object.keys(T.timings).length, timings: { ...T.timings, [FLEET]: 900 } };
    const p2 = AV.plan({ r: reach({ timings: cheap }) });
    const f2 = p2.find((x) => x.gate === FLEET);
    ok("...and in a world where orreryFleet reads 900 ms, it leaves the guard half -- the quick sweep runs it there",
        !f2 || !f2.why.some((x) => x.startsWith("the only guard")), f2 ? f2.why.join("; ") : "not on the plan");
    const cost = p.reduce((s, x) => s + (T.timings[x.gate] || 0), 0);
    say(`the step on this tree: ${p.length} gates, ${(cost / 60000).toFixed(1)} minutes by the shared record's newest readings`);
}

console.log("\n3b. v4846 -- a tree-wide count a merge moves is graded whenever the sweep does not run its gate");
{
    const { noComments } = await import("./sourceScan.mjs");
    const missing = AV.TREE_RATCHETS.flatMap((x) => { let c = ""; try { c = noComments(fs.readFileSync(path.join(ENG, x.gate), "utf8")); } catch { return [x.gate + " (no such gate)"]; }
        return x.holds.filter((h) => !new RegExp((/\.(json|mjs)$/.test(h) ? "" : "\\b(?:const|let)\\s+") + h.replace(/\./g, "\\.") + (/\.(json|mjs)$/.test(h) ? "" : "\\s*=\\s*\\d")).test(c)).map((h) => x.gate + ": " + h); });
    ok("!! every TREE_RATCHETS gate exists and freezes the number it is listed for -- a constant declared in its code, or the file it reads",
        missing.length === 0, missing.length ? "NOT FOUND: " + missing.join(", ") : AV.TREE_RATCHETS.map((x) => path.basename(x.gate, "-selfcheck.mjs") + " " + x.holds.join("/")).join("; "));
    const T = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-timings.json"), "utf8"));
    const DG = "tools/ship/definitionGates-selfcheck.mjs", world = (ms) => ({ ...T, timings: { ...T.timings, [DG]: ms } });
    const over = AV.plan({ r: reach(), timings: world(3100) }).find((x) => x.gate === DG), under = AV.plan({ r: reach(), timings: world(1200) }).find((x) => x.gate === DG);
    ok("!! *** definitionGates at 3,100 ms -- where it sat while main went red on it twice -- is on the plan, as a tree-wide count; at 1,200 ms the sweep runs it and the plan leaves it off ***",
        !!over && over.why.some((w) => /tree-wide count a merge moves/.test(w)) && !under,
        over ? over.why.join("; ").slice(0, 160) : "absent at 3,100 ms");
    const live = AV.plan({ r: reach() }), off = AV.TREE_RATCHETS.filter((x) => !(T.timings[x.gate] <= (T.budgetMs ?? 3000)) && !live.find((p) => p.gate === x.gate));
    ok("...and on this tree every one is either under the sweep's line or on the plan -- none is run by nothing",
        off.length === 0, AV.TREE_RATCHETS.map((x) => `${path.basename(x.gate, "-selfcheck.mjs")} ${T.timings[x.gate] ?? "untimed"} ms ${live.find((p) => p.gate === x.gate) ? "planned" : "swept"}`).join(", "));
}

console.log("\n4. a red is named and the run says so; a timeout is a red");
{
    const lines = [];
    const fake = { "x/pass-selfcheck.mjs": { status: 0 }, "x/fail-selfcheck.mjs": { status: 1 }, "x/hang-selfcheck.mjs": { status: null, signal: "SIGTERM" } };
    const list = Object.keys(fake).map((g) => ({ gate: g, why: ["fixture"] }));
    const reds = AV.runAll(list, { run: (g) => fake[g], out: (m) => lines.push(m) });
    ok("!! *** the failing gate and the killed one are both RED, by name; the passing one is not ***",
        reds.length === 2 && reds.some((r) => r.gate === "x/fail-selfcheck.mjs") && reds.some((r) => r.gate === "x/hang-selfcheck.mjs" && /killed/.test(String(r.code))),
        lines.join(" | "));
    // The real CLI, driven: --list writes nothing and exits 0; an unknown option is refused before anything runs.
    const cli = (args) => spawnSync(process.execPath, [path.join(ENG, "tools", "ship", "afterVerdict.mjs"), ...args], { cwd: ENG, encoding: "utf8", timeout: 120000 });
    const l = cli(["--list"]);
    ok("--list prints the plan and runs nothing", l.status === 0 && /\[afterVerdict\] \d+ gates:/.test(l.stdout), (l.stdout || "").split("\n")[0]);
    const b = cli(["--lst"]);
    ok("...and a mistyped option is refused with exit 2 and the nearest spelling", b.status === 2 && /did you mean --list/.test(b.stderr), (b.stderr || "").split("\n")[0]);
}

console.log("\n5. a shallow clone cannot grade the two gates that read git history, and says so (v4838)");
{
    const names = Object.keys(AV.NEEDS_HISTORY), all = new Set(enumerateGates().map((g) => g.split(path.sep).join("/")));
    ok("!! *** the history gates are real gates in this tree, each with a stated reason, and orreryFleet-selfcheck really runs `git log` ***",
        names.length === 2 && names.every((g) => all.has(g) && AV.NEEDS_HISTORY[g].length > 20) &&
        /execFileSync\("git", \["log"/.test(fs.readFileSync(path.join(ENG, "tools", "ship", "orreryFleet-selfcheck.mjs"), "utf8")), names.join(", "));
    // a real shallow clone of a real two-commit repository, and the original: the answer is read from git, not typed
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "av-shallow-")), git = (cwd, ...a) => spawnSync("git", a, { cwd, encoding: "utf8" });
    git(tmp, "init", "-q", "src"); const src = path.join(tmp, "src");
    git(src, "config", "user.email", "t@t"); git(src, "config", "user.name", "t");
    for (const n of [1, 2]) { fs.writeFileSync(path.join(src, "f.txt"), String(n)); git(src, "add", "-A"); git(src, "commit", "-q", "-m", "c" + n); }
    git(tmp, "clone", "-q", "--depth", "1", "file://" + src, "shallow");
    ok("!! isShallow() reads git: a depth-1 clone is shallow, its source is not, and a directory that is no repository is not", AV.isShallow({ cwd: path.join(tmp, "shallow") }) === true && AV.isShallow({ cwd: src }) === false && AV.isShallow({ cwd: os.tmpdir() }) === false);
    fs.rmSync(tmp, { recursive: true, force: true });
    ok('...and its injected answers: "true" is shallow; "false", a failed command that still printed "true", and no answer are not', AV.isShallow({ run: () => ({ status: 0, stdout: "true\n" }) }) && !AV.isShallow({ run: () => ({ status: 0, stdout: "false\n" }) }) && !AV.isShallow({ run: () => ({ status: 128, stdout: "true\n" }) }) && !AV.isShallow({ run: () => ({ status: null, stdout: "" }) }));
    const calls = [], lines = [], fake = (g) => { calls.push(g); return { status: g.includes("fail") ? 1 : 0 }; };
    const [H1, H2] = names, plan5 = [{ gate: "x/pass-selfcheck.mjs", why: ["f"] }, { gate: H1, why: ["f"] }, { gate: "x/fail-selfcheck.mjs", why: ["f"] }, { gate: H2, why: ["f"] }];
    const ungraded = [], reds = AV.runAll(plan5, { shallow: true, ungraded, run: fake, out: (m) => lines.push(m) });
    ok("!! *** on a shallow clone the two history gates are NOT RUN and are NOT reds -- they are ungraded, named, with the command that fixes it; the other gates run and a real red is still a red ***",
        !calls.includes(H1) && !calls.includes(H2) && calls.length === 2 && ungraded.map((u) => u.gate).join() === names.join() && reds.length === 1 && reds[0].gate === "x/fail-selfcheck.mjs" &&
        lines.filter((l) => /SKIP/.test(l) && /git fetch --unshallow/.test(l)).length === 2, lines.join(" | ").slice(0, 300));
    calls.length = 0; const reds2 = AV.runAll(plan5, { shallow: false, ungraded: [], run: fake, out: () => {} });
    ok("...and on a full clone the same plan runs ALL FOUR gates (the skip is the shallow clone's, never a standing exemption)", calls.length === 4 && calls.includes(H1) && calls.includes(H2) && reds2.length === 1);
    const o0 = AV.outcome({ reds: [], ungraded: [], total: 57 }), o1 = AV.outcome({ reds: [{ gate: "a" }], ungraded: [{ gate: H1 }], total: 57 }), o3 = AV.outcome({ reds: [], ungraded: [{ gate: H1 }, { gate: H2 }], total: 57 });
    ok("!! *** a run with ungraded gates exits 3 -- not 0 (that would read as a pass) and not 1 (that would read as a defect in the tree) ***; a red outranks it with 1; a clean run is 0",
        o0.code === 0 && /all 57 green/.test(o0.line) && o1.code === 1 && /1 RED/.test(o1.line) && /1 more NOT GRADED/.test(o1.line) && o3.code === 3 && /55 green, 2 NOT GRADED/.test(o3.line) && /git fetch --unshallow/.test(o3.line), `${o0.code} / ${o1.code} / ${o3.code}: ${o3.line.slice(0, 120)}`);
    const avSrc = fs.readFileSync(path.join(ENG, "tools", "ship", "afterVerdict.mjs"), "utf8");
    ok("...and the command line is wired to all of it: it asks isShallow(), hands the answer to runAll, and exits with outcome()'s code", /isShallow\(\)/.test(avSrc) && /runAll\(p, \{ timeoutMs, shallow, ungraded \}\)/.test(avSrc) && /process\.exitCode = o\.code/.test(avSrc));
}

console.log(fails ? `\nafterVerdict-selfcheck: ${fails} FAILED` : "\nafterVerdict-selfcheck: all checks pass");
console.log("unchecked here: whether every gate on the plan is green -- that is what running the command answers, and it " +
    "costs the minutes printed above, so it is the ritual's step and not this gate's.");
process.exitCode = fails ? 1 : 0;
