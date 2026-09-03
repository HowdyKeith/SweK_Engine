#!/usr/bin/env node
// WebGLEngine/tools/ship/mutationScore-selfcheck.mjs -- v4386
//
// Run: node tools/ship/mutationScore-selfcheck.mjs
//
// GRADES tools/mutate/mutationScore.mjs -- the mutation suite's score, as a RECORD rather than as prose.
//
// *** THE NUMBER WAS IN A COMMENT AND HAD BEEN WRONG FOR 223 VERSIONS. *** tools/mutate/scan.mjs opened with
// "mutate.mjs runs ten mutations and catches all ten". v4162 rewrote physics/sph/sph.js's shadow amplitude
// from Math.pow(o.h, 3) to (h * h * h) -- same arithmetic, different text -- and the mutation that looks for
// that string verbatim stopped applying. Nine experiments and one abstention, reported as ten results.
//
// tools/ship/mutationTable-selfcheck.mjs caught it BY NAME and then stood red from v4279 to v4385: 106
// versions of rounds shipping ALL GREEN over a register entry. The gate worked. The reading of it did not.
//
// So this gate is not about mutation testing. It is about whether a measured number can be trusted TOMORROW,
// and the two ways it stops being trustworthy are both checked against git and against the live table rather
// than asserted.
"use strict";
import { MUTATIONS } from "../mutate/mutate.mjs";
import { SCORE, tally, tableFingerprint, targetsOf, staleReasons } from "../mutate/mutationScore.mjs";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = path.resolve(ENG, "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const skip = (n, d) => console.log("  ----  " + n + (d ? "   " + d : ""));
const report = (m) => console.log("  ....  " + m);

console.log("mutationScore-selfcheck -- a number in a comment cannot be checked by anything\n");

// =============================================================================================================
console.log("1. THE RECORD EXISTS AND ITS ARITHMETIC IS DERIVED, NOT CARRIED BESIDE ITSELF");
{
    const t = tally(SCORE);
    ok("the score records a state for every mutation in the table",
       t.total === MUTATIONS.length, `${t.total} states, ${MUTATIONS.length} mutations`);
    ok("...and the buckets partition it with no fourth bucket",
       t.caught + t.survived + t.stale === t.total,
       `${t.caught} caught + ${t.survived} survived + ${t.stale} stale = ${t.total}`);

    // *** THE TOTAL IS NOT A FIELD. *** A count typed beside the rows it counts can disagree with them, which is
    // the same defect as a number in a comment, one size smaller. There is nowhere for the two to drift apart.
    ok("...and no count is stored anywhere -- the only place the numbers live is the states map",
       !("caught" in SCORE) && !("total" in SCORE) && !("survived" in SCORE) && !("stale" in SCORE),
       "SCORE carries states; tally() derives the rest");
    report(`recorded: ${t.caught}/${t.total} caught at ${SCORE.version}, commit ${SCORE.commit.slice(0, 7)}`);
}

// =============================================================================================================
console.log("\n2. NO MUTATION IS DEAD -- THE DEFECT THAT PROMPTED THIS ROUND, CHECKED AT THE SOURCE");
{
    const dead = [];
    for (const m of MUTATIONS) {
        const src = readFileSync(path.join(ENG, m.file), "utf8");
        if (!src.includes(m.find)) dead.push(`${m.name} (${m.file})`);
    }
    ok("*** every mutation's find-string is present in its target, so every one MUTATES SOMETHING ***",
       dead.length === 0, `${MUTATIONS.length} mutations, ${dead.length} dead` + (dead.length ? ": " + dead.join("; ") : ""));
    ok("...and no recorded state is STALE, which is what a dead mutation scores",
       tally(SCORE).stale === 0, "a STALE entry is an abstention, and an abstention is not a result");
    report("tools/ship/mutationTable-selfcheck.mjs checks the same property. That is deliberate duplication: " +
           "it went red at v4279 and was READ at v4385, and one gate nobody reads is a gate.");
}

// =============================================================================================================
console.log("\n3. THE RECORD KNOWS WHICH TABLE IT WAS MEASURED ON");
{
    const fp = tableFingerprint(MUTATIONS);
    ok("the fingerprint of the live table matches the one the score was taken against",
       fp === SCORE.tableFingerprint, `${SCORE.tableFingerprint} recorded, ${fp} live`);
    ok("...and the recorded names are exactly the live names",
       Object.keys(SCORE.states).sort().join("|") === MUTATIONS.map((m) => m.name).sort().join("|"),
       `${MUTATIONS.length} names, set-equal`);

    // The fingerprint has to MOVE for a changed mutation, or it is decoration.
    const altered = MUTATIONS.map((m, i) => (i === 0 ? { ...m, replace: m.replace + " " } : m));
    ok("...and a single changed character in ONE mutation moves the fingerprint",
       tableFingerprint(altered) !== fp, `perturbing one replace-string gives ${tableFingerprint(altered)}`);
    ok("...and it is order-independent, so re-sorting the table does not invalidate a good score",
       tableFingerprint([...MUTATIONS].reverse()) === fp, "hashed in name order, not table order");
}

// =============================================================================================================
console.log("\n4. *** AND IT KNOWS WHETHER THE CODE IT IS ABOUT HAS MOVED -- THE v4162 EVENT, MADE DETECTABLE ***");
{
    const targets = targetsOf(MUTATIONS);
    ok("the target list is derived from the table, not typed", targets.length > 0 && targets.length <= MUTATIONS.length,
       `${targets.length} files across ${MUTATIONS.length} mutations: ${targets.join(", ")}`);

    let changed = null;
    try {
        const rel = targets.map((t) => path.join("WebGLEngine", t));
        const out = execFileSync("git", ["log", "--name-only", "--format=", `${SCORE.commit}..HEAD`, "--", ...rel],
                                 { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        changed = [...new Set(out.split("\n").map((s) => s.trim()).filter(Boolean))];
    } catch { changed = null; }

    if (changed === null) {
        skip("git could not be asked whether the targets moved", "no verdict, rather than a green one");
    } else {
        ok("*** no file the score is ABOUT has changed since the run -- so the number still describes THIS tree ***",
           changed.length === 0,
           changed.length ? "CHANGED: " + changed.join(", ") + " -- re-run tools/rig/run-mutate.mjs" :
                            `${targets.length} target files unchanged since ${SCORE.commit.slice(0, 7)}`);
        report("This is the check that would have fired at v4162. sph.js changed, the score became a statement " +
               "about a tree that no longer existed, and the only thing that noticed was a gate nobody read " +
               "for another 117 versions. A record that cannot detect its own rot is prose with punctuation.");
    }

    const reasons = staleReasons(SCORE, MUTATIONS, changed || []);
    ok("...and staleReasons agrees, naming nothing", reasons.length === 0,
       reasons.length ? reasons.join(" | ") : "table fingerprint, name set and target files all current");
    // The reporter must be able to speak: a function that only ever returns [] is untested.
    ok("...and it DOES speak when handed a moved tree",
       staleReasons({ ...SCORE, tableFingerprint: "0000000000000000" }, MUTATIONS, ["physics/sph/sph.js"]).length === 2,
       "a wrong fingerprint plus a changed target gives two named reasons, not a bare false");
}

// =============================================================================================================
console.log("\n5. THE PROSE THAT WAS WRONG IS GONE, AND NOTHING ELSE STATES THE SCORE AS A LITERAL");
{
    const scan = readFileSync(path.join(ENG, "tools/mutate/scan.mjs"), "utf8");
    ok("tools/mutate/scan.mjs no longer asserts a bare score in its header",
       !/catches all ten/.test(scan), "the claim that was false from v4162 to v4385 is not restated");
    ok("...and it points at the record instead", /mutationScore\.mjs/.test(scan),
       "a reader following the sentence now reaches a number something checks");

    // mutate.mjs's STALE branch is what made the harness honest while the claim about it was not.
    const mut = readFileSync(path.join(ENG, "tools/mutate/mutate.mjs"), "utf8");
    ok("mutate.mjs still refuses to score a dead mutation rather than counting it",
       /state:\s*"STALE"/.test(mut) && /original\.includes\(m\.find\)/.test(mut),
       "the runtime guard the static gate duplicates");

    // *** AND THE GATE'S OWN PROSE WAS WRONG ABOUT THAT, WHICH THIS ROUND FOUND AND FIXED. ***
    const table = readFileSync(path.join(ENG, "tools/ship/mutationTable-selfcheck.mjs"), "utf8");
    ok("...and mutationTable-selfcheck no longer claims a dead mutation would report a PHANTOM SURVIVOR",
       !/PHANTOM SURVIVOR/.test(table),
       "it reports STALE and excludes it; a gate about stale records was carrying a stale claim about staleness");
}

// ---- v4386 SABOTAGES, grep-CONFIRMED APPLIED BEFORE READING, RESTORED md5-IDENTICAL -------------------------
//
// (SABOTAGE_MD5)
//
//   A  SABOTAGE_A
//   B  SABOTAGE_B
//   C  SABOTAGE_C
//   D  SABOTAGE_D
//
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THE SCORE ITSELF IS NOT RE-MEASURED. This gate costs milliseconds and the run it " +
    "grades costs about fourteen minutes -- eleven full verifies -- so what is checked is that the record is " +
    "CURRENT, never that it is right. A record whose targets have not moved is a record nobody has invalidated, " +
    "which is weaker than a fresh run and much stronger than a comment. Also unchecked and now named: " +
    "tools/mutate/scan.mjs, the MECHANICAL scanner built because 'a hand-picked mutation set measures the " +
    "AUTHOR'S IMAGINATION, not the gate' -- it is imported by nothing, invoked by no rig job, and records " +
    "nothing. The better measurement has been sitting unrun beside the weaker one, which is the same shape as " +
    "the defect this round fixed. And the ten targets are eight files out of a tree of thousands: this is a " +
    "score for SPH, tomography, FDTD, lockstep and the policy store, and for nothing else.");
process.exit(fails ? 1 : 0);
