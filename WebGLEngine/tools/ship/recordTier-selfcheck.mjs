// WebGLEngine/tools/ship/recordTier-selfcheck.mjs -- v4576
//
// Gates tools/ship/recordTier.mjs. The subject is in that file's header.
//
// *** IT DOES NOT RUN THE TIER. *** The tier is 93 seconds of gate time by construction -- it exists precisely
// because those gates cost more than the sweep can afford -- so a gate that ran it would itself be over budget
// and would be skipped at ship time, which is the exact failure the tier was built to end. What this checks is
// that the tier's LIST is derived rather than typed, that its verdict rules are the ones this tree already
// settled, and that it is wired into the ritual.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tierGates } from "./recordTier.mjs";
import { reach, ENG } from "./recordReach.mjs";
import { STEPS } from "./shipRitual.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

console.log("1. THE LIST IS DERIVED, WHICH IS THE WHOLE DIFFERENCE BETWEEN THIS AND NINE TYPED NAMES");
{
    const gates = tierGates();
    const r = reach();
    ok("!! *** the tier's population comes from recordReach, not from a list in the file ***",
       gates.length === r.blockers.length && gates.every((g) => r.blockers.some((b) => b.gate === g.gate)),
       `${gates.length} guardian gate(s), covering ${gates.reduce((a, g) => a + g.records.length, 0)} record(s). ` +
       "A name here would be a second declaration that goes stale the first time a gate crosses the budget in " +
       "either direction, which is what shipRitual-selfcheck exists to refuse");
    const src = fs.readFileSync(path.join(ENG, "tools", "ship", "recordTier.mjs"), "utf8");
    const named = gates.filter((g) => src.includes(g.gate));
    ok("!! ...and the module does not name a single one of them in its own source",
       named.length === 0,
       named.length ? "TYPED: " + named.map((g) => g.gate).join(", ")
                    : "zero of " + gates.length + " gate paths appear in recordTier.mjs. The list cannot rot " +
                      "because there is no list");
    ok("  every gate it would run exists on disk",
       gates.every((g) => fs.existsSync(path.join(ENG, g.gate))),
       gates.map((g) => g.gate.split("/").pop()).join(", "));
    ok("!! and every one of them really is over the sweep budget, which is why it is here",
       gates.every((g) => g.ms > 3000),
       `cheapest is ${Math.min(...gates.map((g) => g.ms))} ms against a 3,000 ms budget; dearest ` +
       `${Math.max(...gates.map((g) => g.ms))} ms`);
}

console.log("\n2. THE VERDICT RULES ARE THE ONES THIS TREE ALREADY SETTLED, NOT NEW ONES");
{
    const src = fs.readFileSync(path.join(ENG, "tools", "ship", "recordTier.mjs"), "utf8");
    // *** A COUNT OF FAILURES IS NOT A VERDICT UNLESS THE PROCESS FINISHED. *** v4392's rule, the reason
    // KILLED_PASS_V4568 exists, and the thing a fresh runner gets wrong by treating a kill as an exit code.
    ok("!! *** a gate killed at the cap gets NO VERDICT -- neither red nor green ***",
       /killed/.test(src) && /noVerdict/.test(src) && /r\.signal/.test(src),
       "spawnSync reports a kill through `signal`, not through `status`. tools/ship/redCensus.mjs's runGate " +
       "learned that at v4568 when execFileSync's timeout produced a status and domScope was called red for it");
    ok("!! ...and it runs SERIALLY, because a tier that manufactured its own false reds would be worse than none",
       !/workers|Promise\.all|spawn\(/.test(src) && /spawnSync/.test(src),
       "SWEEP_CONTENTION_V4562 measured an 8-worker pass inflating a serial reading by a 2.41x median. These " +
       "are the expensive tail: running them together is how a 21 s gate becomes a 50 s one and hits its cap");
    ok("  and `ok` is false when anything is red OR has no verdict",
       /ok: red\.length === 0 && noVerdict\.length === 0/.test(src),
       "an unfinished gate is not a passing one, and folding the two together is how the killed bucket filled");
}

console.log("\n3. IT IS WIRED INTO THE RITUAL, WHICH IS THE ONLY THING THAT MAKES IT RUN");
{
    const step = STEPS.find((s) => s.id === "record-tier");
    ok("!! *** the ship ritual has a record-tier step ***", !!step,
       step ? step.command : "NO STEP -- a tier nobody runs is a slower version of no tier at all");
    ok("  ...and it names this module as its command and this gate as its guard",
       !!step && /recordTier\.mjs/.test(step.command) && step.gate === "tools/ship/recordTier-selfcheck.mjs",
       step ? `${step.command}  guarded by ${step.gate}` : "");
    // *** THE POINT OF THE ROUND, ASSERTED AS A NUMBER RATHER THAN DESCRIBED. ***
    const r = reach();
    ok("!! the tier covers EVERY record whose only guardian is over budget",
       r.overBudget === tierGates().reduce((a, g) => a + g.records.length, 0),
       `${r.overBudget} record(s) had a working guardian the sweep could not afford, and the tier runs the ` +
       `guardian of every one. ${r.checked} of ${r.total} records are checked by the sweep; ${r.unguarded} ` +
       "have no guardian at all and are a separate, named problem");
}

console.log();
console.log("  ----  WHAT THIS DOES NOT CLAIM");
console.log("  ----  THAT THE TIER PASSES. It is not run here, for the reason in the header: running 93 s of");
console.log("  ----  gates from inside a gate would put this one over the budget too. The ritual runs it, and");
console.log("  ----  its exit code is the verdict.");
console.log("  ----  NOR THAT EVERY RECORD IS NOW CHECKED. The records with NO guardian are untouched by this");
console.log("  ----  and are counted above rather than absorbed -- a tier can only run a gate that exists.");
if (fails) { console.log("\n[recordTier-selfcheck] FAILED " + fails); process.exit(1); }
console.log("\n[recordTier-selfcheck] all passed");
