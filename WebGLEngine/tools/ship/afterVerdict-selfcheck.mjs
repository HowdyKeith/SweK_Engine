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
"use strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as AV from "./afterVerdict.mjs";
import { reach } from "./recordReach.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(ENG, "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
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

console.log(fails ? `\nafterVerdict-selfcheck: ${fails} FAILED` : "\nafterVerdict-selfcheck: all checks pass");
console.log("unchecked here: whether every gate on the plan is green -- that is what running the command answers, and it " +
    "costs the minutes printed above, so it is the ritual's step and not this gate's.");
process.exitCode = fails ? 1 : 0;
