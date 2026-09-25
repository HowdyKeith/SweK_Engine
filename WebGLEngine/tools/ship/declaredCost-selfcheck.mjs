// WebGLEngine/tools/ship/declaredCost-selfcheck.mjs -- v4666
//
// Run: node tools/ship/declaredCost-selfcheck.mjs   (~0.6s MEASURED v4666)
//
// *** THE GATE FOR A CENSUS WHOSE POPULATION INCLUDES THIS FILE'S OWN THIRD LINE. *** declaredCost reads the
// `// Run: node <gate>   (~Ns)` header that 271 gates carry, and the line above is one of them -- so the
// population is excluded by IDENTITY rather than by name, which is the convention checkerCensus set when it
// counted itself.
//
// SABOTAGES, RESULTS BY NAME:
//   A. the unit is ignored and every declaration reads as seconds   -> RED (2 rows). "~0.2s" and "~200ms"
//      are both in the tree and differ by a THOUSAND; this is the one that would silently mis-cost 271 gates.
//   B. a capped reading is classified as a measurement               -> RED (4 rows)
//   C. costOf prefers the header over a real recorded reading        -> RED (1 row)
//   D. the header match is unanchored, so prose ABOUT a Run: line reads as one -> RED (1 row)
//   E. the rotation stops ordering its killed pool by cost           -> RED (1 row)
//   F. this gate stops excluding itself from the census it runs      -> RED (1 row)
//
// *** AND F WAS RESTORED BY HAND AFTER `git checkout --` DID NOTHING, which is worth one line: this file was
// UNTRACKED when it was sabotaged, so the restore silently succeeded and changed nothing, and the gate went
// on reporting 272 against 272. A restore that cannot fail is not a restore. Backups, not checkout.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { declaredOf, census, costOf, walkGates, DECLARED_RE, ENG } from "./declaredCost.mjs";
import { codeOnly } from "./sourceScan.mjs";

const SELF = fileURLToPath(import.meta.url);
const SELF_REL = path.relative(ENG, SELF).split(path.sep).join("/");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);

console.log("declaredCost-selfcheck -- every expensive gate writes its cost at the top of itself\n");

// -----------------------------------------------------------------------------------------------------------
console.log("1. *** THE UNIT IS PART OF THE READING, NOT A SUFFIX GUESSED AFTERWARDS ***");
{
    const L = (t) => "// tools/x.mjs\n//\n// Run: node tools/x.mjs   " + t + "\n";
    const cases = [
        ["(~616s)", 616000, "seconds, the shape khConvergence uses"],
        ["(~0.2s)", 200, "a fraction of a second -- 0.2 and 200 differ by a THOUSAND and both are in the tree"],
        ["(~200ms)", 200, "milliseconds, the same duration written the other way"],
        ["(~2m)", 120000, "minutes, which a handful use"],
        ["(~238s - MEASURED v3941, was ~40s)", 238000, "the first number wins: the tail is history, not a second claim"],
        ["(~6 s: synthetic grading + one real scoped run)", 6000, "a space before the unit and prose after it"],
    ];
    const wrong = cases.filter(([t, want]) => (declaredOf(L(t)) || {}).ms !== want);
    ok("*** every unit in the tree reads as the duration it means ***",
        wrong.length === 0,
        wrong.length ? "WRONG: " + wrong.map(([t, w]) => `${t} wanted ${w} got ${JSON.stringify(declaredOf(L(t)))}`).join("; ")
                     : `${cases.length} forms, all from real headers. ` + cases.map(([t, w]) => `${t}=${w}ms`).join("  "));
    // *** AND THE THINGS THAT ARE NOT A DECLARATION MUST NOT READ AS ONE. *** A zero here is a gate credited
    // with a cost it never stated, which is worse than having none: the rotation would act on it.
    const notDeclarations = [
        ["// Run: node tools/x.mjs", "no parenthesis at all -- most of the tree"],
        ["(~fast)", "a word where the number goes"],
        ["(about 3s)", "the tilde is the marker and this has none"],
        ["(~3 hours)", "a unit this file does not read, and guessing would be worse than refusing"],
    ];
    const falsePositives = notDeclarations.filter(([t]) => declaredOf(L(t)) !== null);
    ok("!! CONTROL: a line that is not a declaration returns NULL rather than a number",
        falsePositives.length === 0,
        falsePositives.length ? "READ AS A COST: " + falsePositives.map((x) => x[0]).join("; ")
                              : notDeclarations.map((x) => x[1]).join("; "));
    ok("  ...and the match is anchored at the start of a COMMENT LINE, so prose about a Run: line is not one",
        declaredOf("const s = 'Run: node x.mjs   (~9s)';\n") === null &&
        declaredOf("// see the Run: node x.mjs   (~9s) line above\n") === null,
        "a string literal and a mid-sentence mention both refuse. This file's own header talks about the " +
        "form it parses, which is the trap sourceScan.mjs names and this gate would walk into first");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n2. *** THE TWO WAYS A HEADER AND A RECORD DISAGREE ARE DIFFERENT FACTS ***");
{
    // Driven on a SYNTHETIC timings record over the real tree, so the classifier is exercised on both arms
    // without waiting for the tree to contain an example of each.
    const real = census(ENG, null, { exclude: (g) => g === SELF_REL });
    const pick = real.suppliesFloor[0] || real.rotted[0];
    const T = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-timings.json"), "utf8"));
    const bend = (gate, ms, finished) => {
        const t = JSON.parse(JSON.stringify(T));
        t.timings[gate] = ms; t.finished = t.finished || {}; t.finished[gate] = finished;
        return census(ENG, t, { exclude: (g) => g === SELF_REL });
    };
    const g = pick.gate, declared = pick.declaredMs;
    const capped = bend(g, Math.round(declared / 4), false);
    const rotted = bend(g, Math.round(declared / 4), true);
    const agreed = bend(g, declared, true);
    const inFloor = capped.suppliesFloor.some((r) => r.gate === g);
    const inRotted = rotted.rotted.some((r) => r.gate === g);
    const inAgree = !agreed.rotted.some((r) => r.gate === g) && !agreed.suppliesFloor.some((r) => r.gate === g);
    report(`${g}: declares ${declared} ms, driven against a recorded ${Math.round(declared / 4)} ms ` +
        "both ways -- once as a cap kill, once as a completed run");
    ok("*** the SAME two numbers are a FLOOR when the run was killed and ROT when it finished ***",
        inFloor && inRotted,
        "a capped reading is a lower bound and the header is the only measurement that gate has; a finished " +
        "reading is a measurement and a header four times off it is prose nobody re-took. Reported as one " +
        "number, half of them would be chased and the other half would be wrong to chase");
    ok("  ...and a record that agrees is in neither list",
        inAgree, "the classifier is not simply putting everything somewhere");
    // *** THE THIRD ARM, which the live tree has NO example of and which is the one that would be a defect. ***
    const contra = bend(g, declared * 4, false);
    ok("!! *** a header claiming a gate finishes INSIDE a cap it demonstrably died at is a CONTRADICTION ***",
        contra.contradicts.some((r) => r.gate === g) && real.contradicts.length === 0,
        `driven on a fixture because the tree holds none today (${real.contradicts.length} live). A declared ` +
        "cost BELOW a cap the gate was killed at is not a floor and not rot -- it is a claim the record " +
        "refutes, and it would be the one worth acting on");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n3. *** costOf: WHICH NUMBER A CALLER GETS, AND WHERE IT CAME FROM ***");
{
    const T = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-timings.json"), "utf8"));
    const fin = Object.keys(T.timings).find((k) => T.finished[k] !== false && T.timings[k] > 0);
    const kill = (census(ENG, null, { exclude: (g) => g === SELF_REL }).suppliesFloor[0] || {}).gate;
    const a = costOf(fin, ENG, T), b = kill ? costOf(kill, ENG, T) : null;
    report(`${fin}: ${a.ms} ms from ${a.from}` + (b ? `   |   ${kill}: ${b.ms} ms from ${b.from}` : ""));
    ok("*** a gate that FINISHED is costed from the record, whatever its header says ***",
        a.from === "recorded" && a.ms === T.timings[fin],
        "a reading beats prose when there is a reading. The header is a fallback and never an override");
    ok("*** a gate that has NEVER FINISHED is costed from its own header, and the source is returned with it ***",
        b && b.from === "declared" && b.ms > T.timings[kill],
        b ? `${b.ms} ms declared against a recorded ${T.timings[kill]} that is a kill` : "no such gate today");
    ok("  ...and a caller can always tell a reading from a claim, which is the whole point of the field",
        ["recorded", "declared", "cap", "none"].includes(a.from) && (!b || b.from !== a.from),
        "v4665 found three gates reporting the shape of a checkout as fact for want of exactly this " +
        "distinction. A number without its provenance is how a cap kill becomes a measurement");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n4. *** THE ROTATION ACTUALLY USES IT, which is the difference between an export and a feature ***");
{
    const SRC = codeOnly(fs.readFileSync(path.join(ENG, "tools", "ship", "sweepRotation.mjs"), "utf8"));
    ok("*** --killed orders its pool by expected cost and refuses what this cap cannot reach ***",
        /costOf\(/.test(SRC) && /declaredTooBig/.test(SRC) && /reachable\.sort/.test(SRC),
        "it took c.killed.slice(0, slots) -- the census's alphabetical order -- so a 90 s run would spend 90 " +
        "s on a gate declaring 616 and kill it again. That mode's own note already said re-running at the " +
        "cap can only reproduce the death; it had no number to act on");
    ok("  ...and a skipped gate is NAMED with the cap that would reach it, not silently dropped",
        /would reach it/.test(fs.readFileSync(path.join(ENG, "tools", "ship", "sweepRotation.mjs"), "utf8")),
        "it stays in c.killed and --cap-s takes it whenever somebody is willing to spend that. A gate " +
        "removed from a pool without a reason is how budgetExile's one-way door was built");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n5. *** THE LIVE CENSUS, RATCHETED ***");
{
    const c = census(ENG, null, { exclude: (g) => g === SELF_REL });
    report(`${c.gates} gates, ${c.declaring} declare a cost, ${c.missing} do not. ` +
        `${c.agree} agree with the record, ${c.rotted.length} have rotted, ${c.suppliesFloor.length} supply ` +
        `a floor the record cannot, ${c.contradicts.length} contradict it`);
    for (const r of c.rotted.slice(0, 5))
        report(`   ROTTED  declared ${String(r.declaredMs).padStart(7)} ms, recorded ${String(r.recordedMs).padStart(7)} ms  ${r.gate}`);
    // *** A RATCHET AND NOT A TARGET, and the reason is that 138 headers is 138 separate re-measurements --
    // each one a gate run to completion -- which is a pass of its own and not a tail-end edit. What must not
    // happen is the number growing while nobody looks, which is how it reached 138.
    const ROTTED_AT_V4666 = 138;
    ok("*** no NEW header has rotted: the count ratchets down, never up ***",
        c.rotted.length <= ROTTED_AT_V4666,
        `${c.rotted.length} against a frozen ${ROTTED_AT_V4666}. Each one is a gate whose header claims a ` +
        "cost more than 2x from what the record measured, both having finished. Paying it down means " +
        "running each gate and re-writing its line, which is a pass and not an edit");
    ok("  ...and the population it is measured over is not empty and not everything",
        c.declaring > 100 && c.declaring < c.gates && c.missing > 0,
        `${c.declaring} of ${c.gates} declare. A ratchet over a population of zero passes forever, and one ` +
        "over the whole tree would be counting the 1,490 gates that make no claim at all");
    // *** AND THIS FILE IS OUT OF ITS OWN POPULATION BY IDENTITY. *** Its third line is a declaration.
    const withSelf = census(ENG);
    ok("!! CONTROL: this gate's OWN header is a declaration, and it is excluded by identity rather than by name",
        withSelf.declaring === c.declaring + 1 && declaredOf(fs.readFileSync(SELF, "utf8")) !== null,
        `${withSelf.declaring} counting this file against ${c.declaring} without it. checkerCensus's rule: a ` +
        "rename must not silently re-open an exclusion, so the comparison is import.meta.url and not a string");
}

// ---- v4670: noRecord WAS COMPUTED AND NOTHING READ IT -------------------------------------------------------
//
// *** census() HAS RETURNED A `noRecord` LIST SINCE IT WAS WRITTEN, AND NO GATE IN THE TREE REFERENCED IT. ***
// A gate that DECLARES a cost and has no recorded timing cannot have its declaration compared with anything, so
// it is not in `agree` and not in `rotted` -- it is in a third list, and that list was decoration. The same
// shape assertionShape found in itself (four of nine rows compared) and runtimeGap found in itself (three of
// twelve). Third sighting, and this time the consequence was paid:
//
//   tools/ship/cloneProvision-selfcheck.mjs declared 0.2s, ran 60.1s, and sat in `noRecord` where nothing
//   looked. The 0.2s was TRUE when written; v4668c's kill-escalation rows took it to 7.1s of real work, and a
//   60 s deadline timer whose handle had been thrown away held the process for the other 53. The declaration
//   disagreeing with the clock was the ONLY visible symptom of a real defect, and it was in an unread list.
//
// So the list is asserted on now. NOT at zero: a gate added on a box whose CPU model differs from the one that
// captured sweep-timings.json CANNOT be entered into that record (its `host` is a single file-wide field keyed
// on a CPU-model hash -- see task #85), so a newly added gate legitimately has no recorded timing. What must be
// true is that the population is SMALL, BOUNDED and NAMED, and that every member actually declares a cost --
// because a member that declares nothing is in `missing` and is a different, larger problem.
{
    // The census is re-derived here rather than reached for: `c` above is block-scoped, and the first version of
    // this section read it anyway -- the gate CRASHED with "c is not defined" instead of failing, exit 1 with
    // ZERO FAIL rows. That is the fourth sighting of that shape this session and the reason failLines.mjs grades
    // exit codes rather than counting FAIL lines.
    const SELF_REL = path.relative(ENG, fileURLToPath(import.meta.url)).split(path.sep).join("/");
    const nr = census(ENG, null, { exclude: (g) => g === SELF_REL }).noRecord;
    ok("!! *** every gate with no recorded timing is NAMED, and the list is bounded rather than reported ***",
        nr.length <= 4 && nr.every((r) => typeof r.declaredMs === "number" && r.declaredMs > 0),
        nr.length
            ? `${nr.length}: ` + nr.map((r) => `${r.gate} declares ${(r.declaredMs / 1000).toFixed(1)}s`).join("; ") +
              ". A gate added on a box that cannot write sweep-timings.json has no reading through no fault of " +
              "its own; FOUR is the bound because that is more rounds of new gates than should ever be waiting"
            : "none -- every declaring gate has a recorded reading to be compared against");

    ok("...and each one's declaration is a MEASUREMENT, not the placeholder the header format allows",
        nr.every((r) => r.declaredMs >= 1000 || /\(~\s*[0-9.]+\s*ms/.test(fs.readFileSync(path.join(ENG, r.gate), "utf8").slice(0, 4000))),
        "a sub-second declaration on a gate nothing has timed is exactly the shape that hid v4668's leak, so it " +
        "has to be a number somebody took rather than a round guess");

    // THE CONTROL: this row would be vacuous if noRecord were empty, and it is not empty today -- but it will
    // be one day, and a row that passes because a list is empty is the defect two sections above.
    ok("...and the assertion is not vacuous today, which is stated rather than assumed",
        nr.length > 0,
        `noRecord holds ${nr.length}. IF THIS ROW EVER GOES RED IT IS GOOD NEWS -- it means every declaring ` +
        "gate has a reading -- and the row above should then be re-read as a bound on an empty set, which is " +
        "not a check. Delete this row and tighten that one to zero when that happens; do not leave both");
}

console.log(fails ? `\ndeclaredCost-selfcheck: ${fails} FAILED` : "\ndeclaredCost-selfcheck: all checks pass");
console.log("\nunchecked here: WHETHER ANY DECLARED COST IS TRUE. This file grades the reading of a header " +
    "against a record, and a header that is wrong in the same way the record is wrong would pass. The 7 that " +
    "supply a floor are unverifiable by construction -- the gate has never finished, which is why the header " +
    "is all there is -- and the honest use of them is the rotation's cap selection, where being roughly right " +
    "beats having no number. Also unchecked: the 39 never-finished gates that declare NOTHING, which are the " +
    "ones no instrument in this tree can cost at all.");
process.exitCode = fails ? 1 : 0;
