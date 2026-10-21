// WebGLEngine/tools/ship/recordProbe-selfcheck.mjs -- v4675
//
// *** THE EXPERIMENT THAT DECIDES WHETHER A FROZEN RECORD IS GUARDED WAS RUN TWICE AND COMMITTED NEITHER
// TIME. ***
//
// tools/ship/frozenRecords.mjs carries PROBE_AT_V4487 and PROBE_AT_V4536 -- two runs of "bump an integer by
// 7, run every gate that NAMES the record, restore and verify". The method is right and no static rule can
// replace it. But the harness went in nobody's commit, so the experiment was a MEMORY rather than a
// MECHANISM, and v4536's headline sat unchanged for 138 rounds because nothing could re-ask the question.
//
// tools/ship/recordProbe.mjs is that harness, committed. This grades it, and the rows below are mostly the
// scars of getting it wrong: FOUR defects in the probe were found by refusing to believe its own output, and
// each one has a row here so the next draft cannot reintroduce it.
"use strict";

import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as RP from "./recordProbe.mjs";
import * as FR from "./frozenRecords.mjs";
import { PROBE_AT_V4675 as P } from "./frozenRecords.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
// *** THIS FILE MAY NOT CONTAIN THE LITERAL A RECORD DECLARATION LOOKS LIKE. ***
// frozenRecords.RECORD_RE is a TEXT SCAN for `export const NAME_VNNNN = Object.freeze(`. This gate's fixtures
// are examples of records, so when they were written out literally the census filed nine of them as real and
// a census run MUTATED THIS GATE -- it replaced part of section 1's assertion with the probe's own sentinel
// and left the file unparseable. Every fixture below is assembled by EC() so the pattern never exists in the
// source, which is the same reason tools/ship/orphanSets.mjs is excluded from the mention scan it feeds.
const EC = (n) => "export const " + n + " = Object.freeze(";
const sec = (t) => console.log("\n" + t);

console.log("recordProbe-selfcheck -- can the tree re-ask whether a record is guarded?\n");

// =============================================================================================================
sec("1. *** A DECLARATION IS NOT A MENTION, AND THE FIRST DRAFT COULD NOT TELL ***");
{
    // *** MEASURED, ON THIS ROUND'S OWN WORK. *** The locator was src.indexOf("export const " + name). In
    // tools/ship/orphanSets.mjs a COMMENT reads "RECORD_EXPORT matches `export const ADMITTED_V4673`", so the
    // locator landed in prose, recordBody scanned forward to the next Object.freeze( and returned a 25 KB body
    // belonging to a DIFFERENT record -- and every measurement taken through that offset was about the wrong
    // thing. ADMITTED_V4673 was filed as "nothing noticed" because of it; with the real body it is NOTICED.
    const fixture = [
        "// RECORD_EXPORT matches `" + EC("FAKE_V4675") + "`, which is prose and not a declaration",
        EC("OTHER_V4675") + '{ a: 1 });',
        EC("FAKE_V4675") + '{ b: 2 });',
    ].join("\n");
    const iFake = RP.declarationOf(fixture, "FAKE_V4675");
    const iOther = RP.declarationOf(fixture, "OTHER_V4675");
    say(`fixture: the name appears in a comment at 0 and is declared at ${iFake}`);
    ok("!! *** the locator finds the DECLARATION, not the first mention of the name ***",
        iFake > fixture.indexOf("OTHER_V4675") && iOther < iFake && RP.declarationOf(fixture, "NOPE_V4675") === -1,
        `${iFake} rather than 0 or 26. TWO MISTAKES ARE REFUSED HERE, and the second was found by this very ` +
        `fixture: RECORD_RE stops a bare NAME in prose being read as a declaration, and inComment() stops a ` +
        `comment that quotes the WHOLE declaration being read as one -- which this fixture does on line 1, ` +
        `and which located offset 26 until it was fixed. An absent record answers -1 rather than pointing at ` +
        `whatever came first.`);
    // *** EVERY BRANCH OF isCodeOffset IS DRIVEN ON A FIXTURE, BECAUSE THE LIVE TREE SUPPLIES NONE. ***
    // Sabotages S13 and S15 removed the string and comment rejections and this section stayed GREEN: once the
    // round had de-patterned its own prose, no record in the census is quoted any more, so both branches were
    // populations of zero. A branch the tree cannot currently exercise still has to be graded.
    const D = EC("Q_V4675") + '{ n: 1 })';
    const cases = [
        ["plain code",                 "const x = 1;\n" + D,                                    true],
        ["inside a line comment",      "// " + D + "\nconst x = 1;",                             false],
        ["inside a block comment",     "/* " + D + " */\nconst x = 1;",                          false],
        ["inside a double-quoted str", 'const s = "' + D + '";',                                  false],
        ["inside a template literal",  "const s = `" + D + "`;",                                  false],
        ["after a template with ${}",  "const s = `a${ \"q\" }b`;\n" + D,                      true],
        ["after a regex with a quote", "const re = /[\"']/;\n" + D,                             true],
    ];
    const wrong = cases.filter(([, src, want]) => {
        const at = src.indexOf("export const Q_V4675");
        return RP.isCodeOffset(src, at) !== want;
    }).map(([n]) => n);
    say(`isCodeOffset over ${cases.length} hand-built positions: ${cases.length - wrong.length} correct`);
    ok("!! *** a declaration is code only when it is not quoted, commented, or inside an interpolation ***",
        wrong.length === 0,
        wrong.length ? "WRONG: " + wrong.join("; ")
                     : `all ${cases.length}. The last two are the ones that cost real records: a template with ` +
                       `an interpolated expression swallowed MEASURED_AT_V4415 1,359 bytes past its start, and ` +
                       `a regex holding a quote read as an unterminated string. Both are positive cases -- a ` +
                       `scanner that gives up and calls everything quoted would fail here, not pass.`);

    // And on the real file that produced the bug.
    const src = fs.readFileSync(path.join(ENG, "tools", "ship", "orphanSets.mjs"), "utf8");
    const { body } = FR.recordBody(src, RP.declarationOf(src, "ADMITTED_V4673"));
    ok("  and on the live file whose comment caused it, the body is the record and nothing else",
        body.startsWith(EC("ADMITTED_V4673") + "[") && !body.includes("use strict") &&
        body.length < 20000,
        `${body.length} bytes; the broken locator returned 25,129 bytes of a different record`);
}

// =============================================================================================================
sec("2. *** A MUTATION MUST CHANGE WHAT THE RECORD ASSERTS, NOT WHAT IT SAYS ABOUT ITSELF ***");
{
    // The first draft took the first quoted string in the body. On several records that was comment prose --
    // it "corrupted" `"a red that has been repaired and left on"` and then counted every guardian that
    // ignored the change as BLIND. A guardian that does not care about a comment is not blind, it is correct,
    // and the error inflated the finding in the direction that flatters the round.
    const body = [
        EC("T_V4675") + '{',
        '    // "this string is prose and must never be the target"',
        '    names: ["real/module.mjs", "other/module.mjs"],',
        '})',
    ].join("\n");
    const r = RP.perturb(body, "retitle");
    say(`retitle chose: ${r && r.what}`);
    ok("!! *** the target survives comment-stripping, so prose is never what gets corrupted ***",
        r && /real\/module\.mjs/.test(r.what) && !/prose/.test(r.what) &&
        r.body.includes("this string is prose and must never be the target"),
        `it took the data element and left the comment untouched. THIS IS THE ROW THAT MATTERS MOST for ` +
        `honesty: with prose as a legal target this probe reported 10 records that nothing noticed, and with ` +
        `it excluded the number is 2. Eight of that ten were the instrument, not the tree.`);
    // The bump rule is borrowed from frozenRecords and must also refuse a commented number.
    const numbered = EC("N_V4675") + '{\n    // stale: 99,\n    live: 12,\n})';
    const b = RP.perturb(numbered, "bump");
    ok("  and a number that only appears in a comment is not a field either",
        b && /live 12 -> 19/.test(b.what), b && b.what);
}

// =============================================================================================================
sec("3. *** \"NOTHING COULD CORRUPT IT\" WAS THREE ANSWERS IN ONE ***");
{
    // 18 of the first cut's 20 unperturbable records were one family, which is a pattern and not a
    // coincidence. Reading them settled it, and it is the TREE rather than the probe.
    const empty = EC("E_V4675") + '[])';
    const derived = EC("D_V4675") + 'OTHER_GATES.map((g) => ({ g })))';
    const literal = EC("L_V4675") + '{ n: 3 })';
    say(`shapes: empty -> ${RP.shapeOf(empty)}, derived -> ${RP.shapeOf(derived)}, literal -> ${RP.shapeOf(literal)}`);
    ok("!! *** EMPTY, DERIVED and LITERAL are distinguished, because they mean different things ***",
        RP.shapeOf(empty) === "empty" && RP.shapeOf(derived) === "derived" && RP.shapeOf(literal) === "literal",
        `an EMPTY record (Object.freeze([])) has nothing in it to make false, so an unnoticed corruption is ` +
        `not a finding about it. A DERIVED one (Object.freeze(X.map(...))) holds no frozen value at all: the ` +
        `corruption that tests it is a corruption of its SOURCE, which is already a record in this census ` +
        `with its own guardians -- it is not unguarded, it INHERITS. Only a LITERAL with no available ` +
        `mutation is a gap in the vocabulary. Folding the three together is the two-things-one-label fault, ` +
        `and it was in this round's own bucket.`);
    // MEASURED over the live census, and this is a pure function of the source -- no gate runs.
    const shapes = {}, phantoms = [];
    for (const rec of FR.census().records) {
        const src = fs.readFileSync(path.join(ENG, rec.file), "utf8");
        const i = RP.declarationOf(src, rec.name);
        if (i < 0) { phantoms.push(rec.name); continue; }
        const sh = RP.shapeOf(FR.recordBody(src, i).body);
        shapes[sh] = (shapes[sh] || 0) + 1;
    }
    say(`live census shapes: ${JSON.stringify(shapes)}`);
    // *** AN UNREADABLE RECORD IS A FINDING ABOUT THE CENSUS, NOT ABOUT THE LOCATOR. *** The first cut of this
    // row failed on any unreadable count, which asserts that the census is never wrong -- and it is: RECORD_RE
    // is a text scan over RAW source, so a comment that quotes a whole declaration becomes a record that does
    // not exist. This round created one that way, in recordProbe.mjs's own note about gate fixtures, and its
    // own locator is what caught it. The phantoms are NAMED so the next one is attributable rather than a tick
    // in a total.
    if (phantoms.length) say(`census phantoms (pattern present, declaration absent): ${phantoms.join(", ")}`);
    ok("!! *** the census claims no record the locator cannot find, and all three shapes are populated ***",
        phantoms.length === 0 && (shapes.literal || 0) > 100 && (shapes.empty || 0) > 0 && (shapes.derived || 0) > 0,
        (phantoms.length ? `PHANTOMS: ${phantoms.join(", ")} -- each is a comment quoting a declaration, which ` +
                           `RECORD_RE reads as real. ` : "") +
        `all three shapes are actually present, so none of the three branches above is a population of zero.`);
}

// =============================================================================================================
sec("4. *** THE VOCABULARY REACHES WHAT IT CLAIMS TO REACH ***");
{
    // The whole round: the +7 bump is integer-only and 78 of 148 records hold no integer, so for those the
    // question had never been asked. Two more mutations answer it.
    const kinds = RP.kindsFor(EC("A_V4675") + '{\n    n: 1,\n    names: ["a/b.mjs", "c/d.mjs"],\n})');
    const numOnly = RP.kindsFor(EC("B_V4675") + '{\n    n: 1,\n})');
    const listOnly = RP.kindsFor(EC("C_V4675") + '["a/b.mjs", "c/d.mjs"])');
    say(`kinds available: mixed ${JSON.stringify(kinds)}, numeric-only ${JSON.stringify(numOnly)}, list-only ${JSON.stringify(listOnly)}`);
    ok("!! *** a list-valued record is perturbable, which is exactly what the old probe could not do ***",
        listOnly.includes("retitle") && listOnly.includes("drop") && !listOnly.includes("bump") &&
        numOnly.includes("bump") && numOnly.length === 1,
        `a record of names takes retitle and drop and not bump; a record of numbers takes bump alone. ` +
        `PROBE_AT_V4536 had only bump, so every list-valued record went unasked.`);
    // *** AND A CHANGED VALUE IS TRIED BEFORE A CHANGED LENGTH, WITH "UNNOTICED" CLAIMED ONLY AFTER BOTH. ***
    const p1 = RP.perturb(EC("Z_V4675") + '["a/b.mjs", "c/d.mjs"])', "retitle");
    const p2 = RP.perturb(EC("Z_V4675") + '["a/b.mjs", "c/d.mjs"])', "drop");
    ok("  retitle keeps the length and drop changes it, so the two ask different questions",
        p1 && p2 && p1.body.includes(RP.SENTINEL) && !p2.body.includes(RP.SENTINEL) &&
        (p2.body.match(/\.mjs/g) || []).length === 1,
        `a guardian blind to a changed VALUE may still catch a changed LENGTH, so a record whose retitle ` +
        `nobody notices is probed again with an element removed. Calling a guardian blind on the one ` +
        `mutation it happens not to look at would overstate the finding.`);
}

// =============================================================================================================
sec("5. *** THE CONTROL IS TAKEN BEFORE THE TREATMENT, AND THAT IS THE WORST BUG THIS ROUND HAD ***");
{
    // *** A PROBE WHOSE BASELINE IS MEASURED AFTER THE CORRUPTION MEASURES THE CORRUPTION. *** The first draft
    // called base(g) lazily inside the mutation loop, so a guardian first encountered while some OTHER record
    // sat corrupted was measured against the corrupted tree: a gate that NOTICED had its red cached as
    // "already red at baseline", and every record it guards was then filed UNMEASURABLE. It reported 48 of 81
    // gates red at baseline; three spot-checks -- playerGround, cameraFall, colourReach -- were ALL GREEN by
    // hand. With the baseline taken first the number is 11, which is the tree's known standing reds.
    const src = fs.readFileSync(path.join(ENG, "tools", "ship", "recordProbe.mjs"), "utf8");
    const baselineAt = src.indexOf("baseline.set(g, runGate(g, root, capMs))");
    const firstWrite = src.indexOf("fs.writeFileSync(file, src.slice(0, idx)");
    say(`baseline loop at ${baselineAt}, first corrupting write at ${firstWrite}`);
    ok("!! *** the baseline pass is written BEFORE the first mutation, in the source order that runs it ***",
        baselineAt > 0 && firstWrite > 0 && baselineAt < firstWrite && !/const base = \(g\) => \{ if \(!baseline\.has/.test(src),
        `the whole baseline is taken over every guardian on the pristine tree, and the lazy memo that ` +
        `deferred it into the loop is gone. A control taken after the treatment inverts the result: gates ` +
        `doing their job get recorded as unable to answer.`);
    ok("  a gate that was already red is UNMEASURABLE rather than blind",
        /verdict: "unmeasurable", why: b\.killed/.test(src),
        "v4536's rule: a gate whose verdict cannot change cannot answer, and counting it as blind would " +
        "credit this round with findings that belong to the standing reds");
}

// =============================================================================================================
sec("6. *** IT WRITES TO TRACKED SOURCE, SO THE RESTORE IS AUDITED RATHER THAN ASSUMED ***");
{
    const src = fs.readFileSync(path.join(ENG, "tools", "ship", "recordProbe.mjs"), "utf8");
    ok("!! *** every touched file is verified byte-for-byte, and a failure THROWS instead of reporting ***",
        /RESTORE FAILED for/.test(src) && /FILES LEFT MODIFIED/.test(src) &&
        /touched\.has\(file\)\) touched\.set\(file, src\)/.test(src),
        `at any instant during a run one tracked record is corrupted on disk, and git status cannot tell ` +
        `that from somebody's work in progress. The original bytes of every touched file are held and ` +
        `re-checked at the end; a run that cannot restore refuses to hand back results at all.`);
    // *** THE WHOLE COMPOSITION IS DRIVEN, ON A SCRATCH TREE, AND NOT ON THIS ONE. ***
    //
    // The first cut of this row probed a REAL record in the real tree. That is a mistake of a kind this file
    // should not make: the probe CORRUPTS TRACKED SOURCE for the length of a guardian run, and at ship time
    // quickSweep runs eight gates at once -- so a concurrent gate reading orphanSets.mjs mid-probe would go
    // falsely red, and the cause would be this gate. tools/ship/recordTier-selfcheck.mjs declines to run its
    // own tier for the neighbouring reason. A scratch tree exercises mutation, guardian spawn, restore and
    // the restore audit end to end, in milliseconds, with nothing tracked at risk.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "recordProbe-"));
    try {
        const recFile = "fix.mjs", gateFile = "fix-selfcheck.mjs";
        const original = EC("FIX_V4675") + '["keep/me.mjs", "and/me.mjs"]);\n';
        fs.writeFileSync(path.join(tmp, recFile), original);
        // A guardian that genuinely reads the record and fails when it has been made false.
        fs.writeFileSync(path.join(tmp, gateFile),
            'import { FIX_V4675 as F } from "./fix.mjs";\n' +
            'const bad = F.length !== 2 || F.some((x) => !x.endsWith("me.mjs"));\n' +
            'console.log(bad ? "  FAIL  fix-selfcheck" : "  PASS  fix-selfcheck");\n' +
            'process.exit(bad ? 1 : 0);\n');
        const res = RP.probe({ root: tmp, records: [{ name: "FIX_V4675", file: recFile, guardians: [gateFile], fields: [] }] });
        const after = fs.readFileSync(path.join(tmp, recFile), "utf8");
        const row = res.rows[0];
        ok("!! *** mutation, guardian spawn, restore and audit all work end to end on a scratch tree ***",
            after === original && res.filesTouched === 1 && row.pairs.length === 1 &&
            row.pairs[0].verdict === "noticed" && row.shape === "literal",
            `the fixture guardian NOTICED the corruption and the file came back byte-identical ` +
            `(${original.length} bytes). This is the composition -- nothing here is asserted from source text.`);
        // *** THE PARTITION IS RE-DERIVED HERE, NOT READ OFF THE FLAG. *** Sabotage S12 hardcoded
        // `complete: true` and this row stayed green, because it graded the claim instead of the property.
        const sum = RP.summarise(res);
        const classes = ["empty", "derived", "unguarded", "opaque", "noticed", "unmeasurable", "blind"];
        const names = classes.flatMap((k) => sum[k] || []);
        ok("  and the partition covers every record exactly once, counted here rather than believed",
            names.length === res.rows.length && new Set(names).size === res.rows.length && sum.partition.complete,
            `${names.length} names across ${classes.length} classes over ${res.rows.length} record(s), all ` +
            `distinct. The first draft put four records in two classes and three in none -- 149 over 148 -- ` +
            `and the flag alone cannot catch that being reintroduced.`);
        // *** AND A GUARDIAN THAT IGNORES THE RECORD IS REPORTED BLIND, WHICH IS THE FINDING'S OWN SHAPE. ***
        fs.writeFileSync(path.join(tmp, gateFile), 'console.log("  PASS  blind"); process.exit(0);\n');
        const blind = RP.probe({ root: tmp, records: [{ name: "FIX_V4675", file: recFile, guardians: [gateFile], fields: [] }] });
        ok("!! *** a guardian that never reads the record is BLIND, not noticed ***",
            blind.rows[0].pairs.every((x) => x.verdict === "blind") &&
            RP.summarise(blind).blind.length === 1 &&
            fs.readFileSync(path.join(tmp, recFile), "utf8") === original,
            `a gate that passes whatever the record says is exactly what this round went looking for, and the ` +
            `positive control above proves the probe can tell the two apart rather than reporting one of them ` +
            `always. Both mutations were tried before blind was concluded.`);
        // *** THE TWO LEXERS MUST AGREE, BECAUSE THERE ARE TWO AND THAT IS THE HAZARD. ***
        //
        // This round first answered the phantom problem by EXCLUDING every record declared inside a gate, on
        // the reasoning that a gate's frozen values are fixtures. Its own evidence refuted that: all NINE
        // records it excluded are real, and all nine are NOTICED by their own gate -- CORPUS_AT_V4583,
        // KIT_AT_V4623, SPOT_CHECK_V4575, SURVIVORS_V4577 among them. The rule cost nine records of coverage
        // to solve a problem that was never about where a record lives; it was about RECORD_RE matching inside
        // a STRING, which is what the fixtures were.
        //
        // The fix is isCodeOffset, and it is a SECOND LEXER beside frozenRecords.recordBody. Every rule it
        // first omitted, the two disagreed on: comments, regex literals, and `${...}` interpolation. So the
        // agreement is asserted over the live census rather than hoped for.
        const pop = RP.defaultRecords(), everything = FR.census().records;
        const phantom = everything.filter((r) => !pop.some((p) => p.name === r.name));
        const disagree = [];
        for (const rec of everything) {
            const src = fs.readFileSync(path.join(ENG, rec.file), "utf8");
            const i = RP.declarationOf(src, rec.name);
            if (i < 0) continue;
            const { body, balanced } = FR.recordBody(src, i);
            // recordBody must agree this is a record: a balanced body that starts with the declaration.
            if (!balanced || !body.startsWith("export const " + rec.name)) disagree.push(rec.name);
        }
        say(`census ${everything.length}; locatable as code ${pop.length}; recordBody disagrees on ${disagree.length}`);
        ok("!! *** every census record is locatable as CODE, and the two lexers agree on every one ***",
            phantom.length === 0 && disagree.length === 0 && pop.length === everything.length,
            (phantom.length ? `PHANTOMS: ${phantom.map((p) => p.name).join(", ")} ` : "") +
            (disagree.length ? `DISAGREE: ${disagree.join(", ")} ` : "") +
            `${pop.length} of ${everything.length}. A phantom means RECORD_RE claimed a declaration that is ` +
            `quoted rather than written; a disagreement means the two scanners have drifted, which cost this ` +
            `round three separate defects and one record (MEASURED_AT_V4415, lost inside a WGSL template).`);

        // *** S10: THE RESTORE MUST SURVIVE A KILL, DRIVEN RATHER THAN DESCRIBED. ***
        // A run that is SIGTERMed is not exotic -- it is a CI timeout, a container reclaim or a Ctrl-C, and one
        // of them left `__recordProbe..._not_a_real_value__` sitting in tools/ship/orphanSets.mjs during this
        // very round. The handler is armed when the first file is touched; this kills a real run to prove it.
        const slowGate = "slow-selfcheck.mjs";
        fs.writeFileSync(path.join(tmp, slowGate),
            'const t = Date.now(); while (Date.now() - t < 150) {}\nprocess.exit(0);\n');
        fs.writeFileSync(path.join(tmp, recFile), original);
        const driver = path.join(tmp, "drive.mjs");
        fs.writeFileSync(driver,
            'import { probe } from ' + JSON.stringify(path.join(ENG, "tools", "ship", "recordProbe.mjs")) + ';\n' +
            'probe({ root: ' + JSON.stringify(tmp) + ', records: [{ name: "FIX_V4675", file: ' + JSON.stringify(recFile) +
            ', guardians: [' + JSON.stringify(slowGate) + '], fields: [] }] });\n');
        const child = spawn(process.execPath, [driver], { stdio: "ignore" });
        // Wait until the file is actually corrupted, then kill -- so the test cannot pass by killing too early.
        let sawCorruption = false;
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
            if (fs.readFileSync(path.join(tmp, recFile), "utf8") !== original) { sawCorruption = true; break; }
        }
        child.kill("SIGTERM");
        // *** AND THE RESTORE IS NOT INSTANT, WHICH IS WORTH KNOWING RATHER THAN GLOSSING. *** The probe runs
        // each guardian through spawnSync, and spawnSync BLOCKS THE EVENT LOOP -- so a JS signal handler cannot
        // run until the guardian in flight returns. The corruption window after a kill is therefore bounded by
        // ONE guardian's runtime, not by zero. The first cut of this row busy-waited and read the file before
        // the child could act, and reported a working restore as broken.
        await once(child, "exit");
        const restored = fs.readFileSync(path.join(tmp, recFile), "utf8") === original;
        say(`corruption observed mid-run: ${sawCorruption}; restored after SIGTERM: ${restored}`);
        ok("!! *** a run killed WHILE a file is corrupted still restores it ***",
            sawCorruption && restored,
            `the kill is delivered only after the corruption is SEEN on disk, so this cannot pass by racing ` +
            `ahead of the mutation, and the wait is on the child's ACTUAL exit rather than a timer. Without the ` +
            `handler the sentinel survives -- which is how one reached tools/ship/orphanSets.mjs during this ` +
            `round, where git status could not tell it from somebody's work in progress.`);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

// =============================================================================================================
sec("7. *** THIS FILE MAY NOT CONTAIN A LITERAL RECORD DECLARATION, AND THAT RULE ENFORCES ITSELF NOW ***");
{
    // *** THREE TIMES IN ONE ROUND. *** RECORD_RE is a text scan over raw source, so any fixture written out
    // literally here becomes a record in the live census. It cost, in order: a census run that MUTATED THIS
    // FILE and left it unparseable; a phantom from a comment in recordProbe.mjs that quoted a declaration; and
    // a phantom from section 1's own `const D = ...` fixture, caught by section 6 two minutes after it was
    // written. Remembering to use EC() is not a mechanism. This is.
    const self = fs.readFileSync(path.join(ENG, "tools", "ship", "recordProbe-selfcheck.mjs"), "utf8");
    const hits = [...self.matchAll(new RegExp(FR.RECORD_RE.source, "g"))].map((m) => m[1]);
    say(`${hits.length} literal record-declaration pattern(s) in this file`);
    ok("!! *** no literal record declaration appears in this gate's own source ***",
        hits.length === 0,
        hits.length ? `FOUND: ${hits.join(", ")} -- each becomes a record in the census the moment it is ` +
                      `written, because RECORD_RE reads raw text. Assemble it with EC() instead.`
                    : `every fixture is assembled by EC() so the pattern never exists in the file. The sibling ` +
                      `rule for tools/ship/recordProbe.mjs's prose is the same one, and section 6's phantom ` +
                      `row catches a breach of either from the other side.`);
}

// =============================================================================================================
sec("8. *** THE RECORD THIS ROUND WROTE HAS A GUARDIAN, WHICH IS THIS SECTION ***");
{
    // *** AND IT DID NOT, UNTIL recordReach SAID SO. *** Appending PROBE_AT_V4675 took the census's unguarded
    // count from 17 to 18: a round whose whole subject is records nothing checks had written one nothing
    // checked. The fix is a guardian, not a ratchet bump.
    //
    // What is checkable about a probe record is its INTERNAL ARITHMETIC -- the classes must sum to the
    // population, the pairs must be at least as many as the records that have guardians, and a class that is
    // reported as a list must agree with the count beside it. A guardian that only re-read the numbers would
    // be a second copy of them.
    const classes = P.noticed + P.blind + P.unmeasurable + P.opaque + P.empty + P.derived + P.unguarded;
    say(`${P.records} records = ${P.noticed} noticed + ${P.blind} blind + ${P.unmeasurable} unmeasurable + ` +
        `${P.opaque} opaque + ${P.empty} empty + ${P.derived} derived + ${P.unguarded} unguarded = ${classes}`);
    ok("!! *** the seven classes sum to the population probed ***",
        classes === P.records && P.records > 100,
        `${classes} against ${P.records}. This is the arithmetic v4536 could not be checked on, because it ` +
        `stored three totals and no classes.`);
    ok("!! *** the named lists agree with the counts beside them ***",
        P.nothingNoticed.length === P.blind && P.opaqueRecords.length === P.opaque &&
        P.blindPairs.length > 0 && P.pairs >= P.blindPairs.length,
        `${P.nothingNoticed.length} named against ${P.blind} counted, ${P.opaqueRecords.length} against ` +
        `${P.opaque}, and ${P.blindPairs.length} blind pairs inside ${P.pairs} total. THE NAMES ARE THE WHOLE ` +
        `POINT OF THE RECORD: v4536 stored "unnoticed: 61" and nobody could name one of the 61.`);
    // *** AND THE COST OF THE RUN IS RECORDED, INCLUDING WHAT WAS THROWN AWAY. ***
    ok("  and the discarded passes are recorded rather than quietly dropped",
        P.passesRun > P.passesDiscarded && P.passesDiscarded >= 1 && P.harnessDefects >= P.passesDiscarded,
        `${P.passesRun} passes run, ${P.passesDiscarded} discarded, ${P.harnessDefects} harness defects. A ` +
        `reading thrown away is evidence about the method, which is frozenRecords' own rule for the v4487 ` +
        `numbers it keeps beside the v4536 re-take.`);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: whether a frozen record is load-bearing can only be answered by corrupting it " +
    "and seeing who shouts, and this tree answered it twice with a harness nobody committed. The experiment " +
    "is a mechanism now. Four defects in it were found by refusing to believe its own output -- a locator " +
    "that matched prose, a mutation that corrupted comments, a baseline taken after the treatment, and a " +
    "bucket that was three answers in one -- and each has a row above." +
    "\nWHAT IS NOT CLAIMED: that a record nothing notices is WRONG. It means no guardian that could answer " +
    "changed its verdict when the record was made false, which is a statement about coverage and not about " +
    "correctness." +
    "\nAND NOT CLAIMED: that the vocabulary is complete. A LITERAL record with no available mutation is a " +
    "real gap and is counted as `opaque` rather than folded into the shapes that are not gaps at all.");
process.exit(fails ? 1 : 0);
