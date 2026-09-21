#!/usr/bin/env node
// WebGLEngine/tools/ship/constantRows-selfcheck.mjs -- v4651
//
// Run: node tools/ship/constantRows-selfcheck.mjs
// RUNTIME: 1,960 ms median of three (1,948 1,960 2,025) -- faster than v4652's 2,152 because codeOnly
// blanks string contents, so the scanner walks past fixture source instead of tokenising it.
//
// *** A FIFTH MECHANISM FOR tools/ship/vacuity.mjs's LIST, AND THE ONE CASE WHERE THAT FILE'S REFUSAL TO
// SCAN DOES NOT APPLY. ***
//
// vacuity.mjs (v4459) names four ways a control stops being able to fail, and then REFUSES to build a
// scanner for them, with the number as its reason: a census of assertions resting on `.every(`, `.length ===
// 0` or `!xs.length` finds 3,206 of them in 948 of 1,482 gates -- 64% -- and "a scanner that cried wolf
// three thousand times would be switched off in a week". That reasoning is correct and this file accepts it.
//
// The fifth mechanism is different in kind: THE CONDITION TESTS THE LANGUAGE INSTEAD OF THE MODULE. This
// session wrote two in three rounds and found both by sabotage rather than by reading --
//
//   v4648  a row meant to hold render/visibility.mjs's packer to an unsigned result asserted
//          `near > 0 && near < 4294967296 && shifted < 0`, with `shifted` computed in the gate.
//   v4650  a row meant to hold render/edgeReveal.mjs's rounding convention read
//          `Math.round(2.5) !== Math.ceil(2.5 - 0.5)` and never called the module at all. A mutation
//          swapping edgeColumn's ceil for Math.round scored ZERO failing rows.
//
// -- and it IS mechanically detectable, because the predicate is syntactic rather than a fact about a
// collection at run time. The number is what earns the scan: TEN rows tree-wide, not 3,206. The obvious
// looser predicate was measured and rejected on vacuity.mjs's own grounds -- "the condition names no
// IMPORTED symbol" flags 21,800 of 28,827, 76%, because most rows legitimately test a local holding a
// module's result.
//
// *** AND MOST OF THE ELEVEN ARE NOT DEFECTS. *** A gate whose module depends on a language guarantee is
// entitled to assert it, and several do, each paired with a row that uses the module. The census NAMES and
// RATCHETS; it does not condemn. What it makes impossible is a row of this shape arriving unnoticed, which
// is the only thing that actually went wrong.
//
// *** THE ONE UNAMBIGUOUS DEFECT AMONG THEM WAS REPAIRED IN THIS ROUND. *** tools/ship/ollamaReadiness-
// selfcheck.mjs carried `ok("a no-model-pinned fleet is still READY but says what that means", (() => {
// return true; })())` -- a label making a claim and a condition that could not fail. The very next row
// makes that claim properly against a real unpinned fleet, so the repair was a deletion. The census found
// ELEVEN candidates and exactly one of them was that; the seed below is the ten that remain.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { constantRows, conditionsOf, freeIdentifiers, isConstantCondition, isParsable, readGates,
         CONSTANT_GLOBALS } from "./constantRows.mjs";
import { gateFiles } from "./assertionShape.mjs";
import { VACUITY_AT_V4459 } from "./vacuity.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

const gates = gateFiles(ENG);
const R = constantRows(readGates(gates, ENG));

console.log("\n1. THE CENSUS");
say("scanned", `${R.scanned} ok() conditions across ${gates.length} gates`);
say("classes", `expr ${R.expr.length}, alwaysTrue ${R.alwaysTrue.length}, alwaysFalse ${R.alwaysFalse.length}, unresolved ${R.unresolved.length}`);
for (const x of R.expr) say(`  ${path.basename(x.file)}`, x.cond.replace(/\s+/g, " ").slice(0, 96));

// *** THE ROW THAT MAKES THIS FILE WORTH ANYTHING. *** A detector validated only against the tree it was
// written on is a description of that tree. This drives it against the EXACT text of v4650's defective row
// and against the text that replaced it, and demands opposite answers.
console.log("\n2. IT CATCHES THE ROW IT WAS BUILT FOR, AND NOT THE REPAIR");
// *** THE PROBES ARE ASSEMBLED AT RUN TIME AND THAT IS NOT FUSSINESS. *** Written as plain literals they
// were SOURCE, in a file this census scans, and the census duly found v4650's defective row inside this
// gate's own fixture -- twelve rows where eleven live in the tree. Excluding this file from the population
// would have been the other repair and it is worse: a detector with a blind spot over itself is the shape
// recordDrift.mjs's own header warns about, where a check's arrival moves the rows it checks. Concatenated,
// the text never appears as a call and the census keeps scanning this gate like any other.
const CALL = "o" + "k(";
const BROKEN = `${CALL}"...and Math.round is NOT the same spelling", Math.round(2.5) !== Math.ceil(2.5 - 0.5), "note");`;
const FIXED = `${CALL}"...and AT AN EXACT TIE edgeColumn takes the lower column", tieP === 2.5 && edgeColumn(TIE) === 2 && Math.round(tieP) === 3, "note");`;
const brokenOut = constantRows([{ path: "probe", text: BROKEN }]);
const fixedOut = constantRows([{ path: "probe", text: FIXED }]);
ok("!! *** v4650's defective row is flagged, verbatim ***",
   brokenOut.expr.length === 1 && /Math\.round\(2\.5\)/.test(brokenOut.expr[0].cond),
   `flagged ${brokenOut.expr.length}: ${brokenOut.expr[0] ? brokenOut.expr[0].cond : "(none)"}. A mutation ` +
   "swapping render/edgeReveal.mjs's ceil for Math.round scored zero failing rows against that row, which " +
   "is how it was found -- by sabotage, three rounds after the same shape appeared at v4648.");
ok("!! *** ...and the row that REPLACED it is not, so this is not a rule against mentioning Math ***",
   fixedOut.expr.length === 0,
   `flagged ${fixedOut.expr.length}. The repair still names Math.round twice; what it adds is edgeColumn and ` +
   "a value computed from the fixture. A detector that condemned both would be a style rule wearing a " +
   "correctness row's clothes, which is exactly what the row it caught was.");

console.log("\n3. THE LOOSER PREDICATE, MEASURED AND REJECTED ON vacuity.mjs's OWN GROUNDS");
// "the condition names no IMPORTED symbol" -- run here rather than described, because a number that
// justifies a design decision has to be reproducible or it is a memory.
const impRe = /import\s*(?:\{([^}]*)\}|(\w+))\s*from/g;
let loose = 0, looseScanned = 0;
for (const f of readGates(gates, ENG)) {
    const syms = new Set(); let m; impRe.lastIndex = 0;
    while ((m = impRe.exec(f.text))) for (const s of (m[1] || m[2] || "").split(","))
        { const n = s.trim().split(/\s+as\s+/).pop().trim(); if (n) syms.add(n); }
    if (!syms.size) continue;
    for (const { cond } of conditionsOf(f.text)) {
        looseScanned++;
        if (![...syms].some((sy) => new RegExp(`\\b${sy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(cond))) loose++;
    }
}
say("loose predicate", `${loose} of ${looseScanned} (${(100 * loose / looseScanned).toFixed(1)}%)`);
ok("!! *** the obvious predicate flags most of the tree, which is the objection vacuity.mjs raises ***",
   loose > looseScanned * 0.5 && R.expr.length < 50,
   `${(100 * loose / looseScanned).toFixed(1)}% against this file's ${R.expr.length} rows. vacuity.mjs " +
   "refused a scanner because its own candidate predicate found 3,206 across 64% of gates and "a scanner " +
   "that cried wolf three thousand times would be switched off in a week". That refusal stands; this " +
   "predicate is narrow enough to answer it, and the comparison is RUN rather than quoted.`.replace(/"/g, "'"));
ok("  ...and vacuity.mjs's four mechanisms are still four -- this is a FIFTH, not a re-statement",
   VACUITY_AT_V4459.mechanisms.length === 4
   && !VACUITY_AT_V4459.mechanisms.some((m) => /language|built-?in|constant/i.test(m.kind)),
   `${VACUITY_AT_V4459.mechanisms.length} recorded there: ${VACUITY_AT_V4459.mechanisms.map((m) => m.kind).join("; ")}. ` +
   "None of them is 'the condition never reaches the module', which is what these eleven are.");

console.log("\n4. THE OTHER CLASSES, COUNTED AND NOT CONDEMNED");
ok("`false` as a condition is a DELIBERATE idiom here, so it is counted rather than flagged",
   R.alwaysFalse.length > 50 && !R.expr.some((x) => x.cond === "false"),
   `${R.alwaysFalse.length} rows. It is the forced red a gate prints when its subject could not be reached ` +
   "at all -- '*** NOT A PASS. *** The adapter path has not run' -- and a census that called those defects " +
   "would be asking gates to report a skip as a pass.");
// *** v4652 -- THIS ROW'S EXPLANATION WAS WRONG AND THE NUMBER FELL 957 -> 59 WHEN THE REAL CAUSE WAS
// FIXED. *** It said the cause was "upstream: sourceScan.mjs's noComments cuts a regex literal containing an
// escaped slash". That was never tested and is false -- noComments handles regex literals through
// regexAllowedHere and regexBody, and on the exact shape accused it returns the source byte for byte. The
// fault was in this census's own extractor, which hand-rolled a regex heuristic instead of importing those
// two, and in isParsable, which wrapped conditions in a NON-ASYNC function so every `(await x).y === z`
// read as unparsable. Both repaired; the accusation is recorded at constantRows.mjs's own site.
const metaOnly = R.unresolved.filter((x) => /import\.meta/.test(x.cond)).length;
ok("!! ...and UNRESOLVED conditions are named rather than dropped, which is kernelReach.mjs's rule",
   R.unresolved.length > 0 && R.unresolved.every((x) => !isParsable(x.cond)),
   `${R.unresolved.length} of ${R.scanned} (${(100 * R.unresolved.length / R.scanned).toFixed(1)}%), down from ` +
   "957 at v4651 when this census blamed a shared instrument for its own extractor's mistake.");
ok("!! ...and EVERY remaining one is import.meta, which is module-only syntax and not a defect in anything",
   metaOnly === R.unresolved.length && R.unresolved.length > 0,
   `${metaOnly} of ${R.unresolved.length} contain import.meta. new Function cannot parse it at all -- "Cannot ` +
   "use 'import.meta' outside a module' -- so these are a limit of the TEST and not a fault in the tree or " +
   "in the extractor. Naming the whole remainder is what stops the next reader looking for a bug that is " +
   "not there, which is exactly what v4651's wrong attribution did.");

console.log("\n5. THE DETECTOR'S OWN FALSE-POSITIVE MODES, EACH DRIVEN");
// *** A LABEL SPLIT ACROSS CONCATENATED STRINGS, WHICH THIS CENSUS SILENTLY SKIPPED UNTIL v4652. *** The
// extractor claimed to handle it -- the character class it skipped included `+`, with a comment saying "a
// label may be several strings concatenated" -- and then required a COMMA, which is not what follows a `+`.
// Every such row was dropped. A sabotage removing the `+` scored ZERO because the code was already inert:
// dead code defended by a comment describing what it does not do, which is worse than no code, since a
// reader checking whether the case is handled finds a sentence saying yes. Repaired, the census finds 102
// MORE conditions -- 29,032 to 29,134 -- and none of them is constant, so the seed does not move.
const CAT = "o" + "k(";
const catProbe = constantRows([{ path: "probe", text: `${CAT}"part one " +\n  "part two", 2 + 2 === 4, "note");` }]);
// *** SOURCE INSIDE A STRING LITERAL IS NOT A ROW OF THIS TREE, AND UNTIL v4653 IT WAS COUNTED AS ONE. ***
// Several gates BUILD gate source as string literals. tools/ship/gateMutation-selfcheck.mjs plants a decoy
// that "counts failures and never reports them" to prove its probe catches one, and every ok(...) inside
// that fixture was counted here -- it read as 8 always-true rows out of 17, a 47% inflation, and all eight
// were lines in a string being written to a temporary file. The extractor reads codeOnly now, which blanks
// string CONTENTS while noComments keeps them: right for finding text a file mentions, wrong for finding
// calls a file MAKES.
const FIX = "o" + "k(";
const fixtureProbe = constantRows([{ path: "probe",
    text: `const decoy = ['${FIX}"planted", true);']; ${FIX}"real", 2 + 2 === 4, "note");` }]);
ok("!! *** an ok() inside a STRING LITERAL is not counted as a row ***",
   fixtureProbe.scanned === 1 && fixtureProbe.alwaysTrue.length === 0 && fixtureProbe.expr.length === 1,
   `scanned ${fixtureProbe.scanned} (the real one), alwaysTrue ${fixtureProbe.alwaysTrue.length}, expr ` +
   `${fixtureProbe.expr.length}. The planted line is a fixture this census must walk past and the row beside ` +
   "it is a real one it must still see -- both halves, because an extractor that simply stopped reading " +
   "string-bearing files would pass the first half and lose the tree.");
// *** AND BLANKING REGEX BODIES REVEALED A ROW THAT STRING-STRIPPING ALONE COULD NOT. *** freeIdentifiers
// strips string literals but not regex bodies, so /[\\/]vendor/.test("...") read as though `vendor` were an
// identifier carrying a value. It is not: a regex literal tested against a string literal is arithmetic over
// constants. That row is tools/ship/changedPaths-selfcheck.mjs's, it is labelled CONTROL and deliberate, and
// it is the eleventh.
ok("!! ...and a regex literal's BODY is not an identifier either",
   isConstantCondition('/[\\/]vendor/.test("/x/tools/ship/vendoredLicences-selfcheck.mjs")') === true,
   "the pattern's own words looked like free identifiers to a census that stripped strings and nothing else, " +
   "which hid a genuinely constant row until the extractor moved to codeOnly");
// *** THE THREE ROWS THAT HOLD THE REGEX BOUNDARY. *** The first attempt at stripping regex bodies from
// freeIdentifiers was written AS A REGEX -- one round after v4652 shipped a round about not re-deriving
// sourceScan.mjs's lexer -- and a regex cannot find a regex literal. Requiring at least one body character,
// it skipped the EMPTY regexes codeOnly leaves behind and then matched from the first slash to the last,
// eating every identifier between them. Nine false positives, 11 rows becoming 20, each one a row that does
// read the tree. These hold both sides of the line.
ok("!! ...but a regex against a VARIABLE still depends on the tree",
   isConstantCondition("/[x]vendor/.test(somePath)") === false,
   "the row above must not be satisfied by deleting identifiers wholesale");
ok("!! ...and two BLANKED regexes do not swallow what lies between them",
   isConstantCondition("//.test(noComments(hb)) && codeHas(hb, //)") === false,
   "the exact shape the regex-based stripper mis-read: noComments, hb and codeHas all eaten, and a row that " +
   "reads three real values reported as one that reads none. Nine rows arrived that way.");
ok("...and ordinary DIVISION is not mistaken for a regex",
   freeIdentifiers("a / b > c / d").join(",") === "a,b,c,d",
   "regexAllowedHere knows a value cannot be followed by a regex; a hand-rolled test does not");
ok("!! a label split across concatenated strings is FOUND, not skipped",
   catProbe.scanned === 1 && catProbe.expr.length === 1 && catProbe.expr[0].cond === "2 + 2 === 4",
   `scanned ${catProbe.scanned}, flagged ${catProbe.expr.length}. This is a FALSE NEGATIVE row: what it ` +
   "guards against is the census quietly measuring a smaller population than the tree has, which no ceiling " +
   "ratchet can see because the number only goes DOWN. Second round running that this failure mode has had " +
   "to be closed by a direct row -- v4651's string-stripping was the first.");
ok("a SPREAD is not a property access",
   isConstantCondition("Math.max(...vs) > 3") === false,
   "`...vs` looks like `.vs` to a naive property stripper, and stripping it erased the only identifier that " +
   "carried a value. That mistake alone took the census from 5 rows to 56.");
ok("...and `of` is an identifier, not only a keyword",
   isConstantCondition('of("A_WGSL").reach && of("A_WGSL").via === "symbol"') === false,
   "tools/ship/kernelReach-selfcheck.mjs names a local helper `of`; filtering it by NAME erased what four of " +
   "its rows read and reported them as constant.");
ok("...and globalThis is a source of information, not a literal",
   isConstantCondition("globalThis.__uintAuto === true") === false,
   "it is how this tree's browser-side gates hand values back, so listing it as a constant global made every " +
   "gate that stashes a result on it look vacuous -- tools/ship/brickShader-selfcheck.mjs was the instance.");
// *** THIS ROW USED TO DRIVE A REGEX AND SO TESTED NOTHING. *** It read
// `isConstantCondition('/Math/.test(label)') === false` -- but `label` is a free identifier either way, so
// removing the string-stripping entirely left it green. MEASURED, that removal is a FALSE NEGATIVE worth one
// row: "vendor/box3d/LICENSE".startsWith("vendor/") stops being flagged because the string's own words --
// vendor, box3d, LICENSE -- read as identifiers that are not built-ins. The ratchet's slack half could not
// see a single row going missing either. So the property is asserted directly, and in the direction that
// breaks: the detector must say YES here.
ok("!! ...and a string literal's CONTENTS are not identifiers, which is worth a row of its own",
   isConstantCondition('"vendor/box3d/LICENSE".startsWith("vendor/")') === true
   && freeIdentifiers('"vendor/box3d/LICENSE".startsWith("vendor/")').length === 0,
   "without stripping them the census reads vendor, box3d and LICENSE as free identifiers, decides the " +
   "condition depends on the tree, and silently drops a real row -- 10 becomes 9 with no row firing. A " +
   "false NEGATIVE is the failure mode a ratchet is worst at seeing, since the number only goes down.");
ok("...and a genuinely constant expression IS flagged, so the four rows above are not vacuous themselves",
   isConstantCondition("2 + 2 === 4") && isConstantCondition("Number.isNaN(0 * Infinity)"),
   "four rows asserting a detector says NO are worth nothing without one asserting it ever says YES");

console.log("\n6. THE RATCHET");
// Seeded at what was measured. It may only fall, and the slack half fails if it is left behind -- the
// two-sided shape tools/ship/kernelReach-selfcheck.mjs uses, and which went red there on the same run a
// round's work landed, which is the behaviour a ratchet is for.
const EXPR_AT_V4651 = 11;
ok("!! *** no TWELFTH constant-expression row arrives unnoticed ***",
   R.expr.length <= EXPR_AT_V4651,
   `${R.expr.length} against a frozen ${EXPR_AT_V4651}. OWED for each: a row that reaches the module, or a ` +
   "note saying the language guarantee IS the subject. Several of the ten are the second kind and are " +
   "paired with a row that uses the module on the next line.");
ok("...and the ratchet is not left behind by real progress",
   R.expr.length >= EXPR_AT_V4651 - 3,
   `${R.expr.length} against ${EXPR_AT_V4651}. A ratchet with slack in it is a ratchet holding nothing.`);
ok("...and the population is not degenerate, which would make every row above vacuous",
   R.scanned > 20000 && gates.length > 1500 && new Set(R.expr.map((x) => x.file)).size > 5,
   `${R.scanned} conditions across ${gates.length} gates; the ten sit in ` +
   `${new Set(R.expr.map((x) => x.file)).size} different files, so this is not one gate's habit.`);

console.log(fails ? `\nconstantRows-selfcheck: ${fails} FAILED` : "\nconstantRows-selfcheck: ALL GREEN");
console.log("unchecked here: whether each of the ten IS a defect, which is a judgement about intent and " +
            "not a fact this file can derive -- several are language-contract rows paired with a row that " +
            "uses the module, and the census names them so a reader can decide; the 216 `true` rows, which " +
            "are the same mechanism in a blunter form and are counted but NOT ratcheted, because a bare " +
            "`true` is sometimes a placeholder a later row supersedes and sorting those out is a round of " +
            "its own; the 59 UNRESOLVED conditions, every one of them an import.meta this parse test cannot " +
            "read at all rather than a defect anywhere; and vacuity.mjs's other four mechanisms, which remain undetectable " +
            "by scanning for the reason that file gives and which this one does not dispute.");
//
// *** v4652 -- THE ROUND THAT CORRECTED THIS FILE'S ACCOUNT OF ITS OWN UNRESOLVED COUNT. ***
// v4651 shipped, here and in its closing and its commit message, the claim that sourceScan.mjs's noComments
// mangles regex literals. It does not, and the claim was never run. The extractor below hand-rolled a regex
// heuristic that sourceScan.mjs EXPORTS two primitives to prevent -- its header says "Rewriting this
// heuristic a second time would be exactly the '179 files mis-lexed the same way' defect this file's own
// header is about" -- and the copy was worse than the original in three ways it had no idea about: it did
// not know a `}` can precede a regex, that `return /x/` is a regex, or that `<` is unsafe because .html
// source contains `</tag>`. Importing them, and making isParsable's wrapper async, took the unresolved count
// from 957 to 59, every one of which is import.meta.
//
// SABOTAGE LOG -- each applied to tools/ship/constantRows.mjs, run, and restored.
//   Y1  globalThis back in the constant set              2 RED (its own row, and the ratchet at 11)
//   Y2  spread treated as a property access              2 RED (its own row, and the ratchet at 45)
//   Y3  `of` filtered as a keyword again                 2 RED (its own row, and the ratchet at 14)
//   Y4  string literals not stripped                     0-RED at first; now 1 RED
//   Y5  unparsable conditions counted as constant        2 RED (the unresolved row, and the ratchet at 22)
//   -- v4652, against the repaired extractor --
//   Z1  back to the hand-rolled regex heuristic          1 RED, the import.meta row
//   Z2  isParsable's wrapper back to non-async           1 RED, the import.meta row
//   Z3  regex literals not skipped at all                1 RED, the import.meta row
//   Z4  string literals not skipped in the splitter      1 RED, the import.meta row
//   Z5  the concatenated-label loop removed              0-RED at first; now 1 RED
//   -- v4653, after the extractor moved to codeOnly --
//   W1  back to noComments, so fixtures count again       1 RED, the string-literal row
//   W2  regex bodies not stripped in freeIdentifiers      1 RED, the regex-body row
//   W3  the empty regex not restored before parsing       1 RED, the import.meta row
//   W4  regexAllowedHere ignored, every slash a regex     2 RED (the division row, and the ratchet at 12)
//
// *** v4653 -- THE CENSUS WAS COUNTING FIXTURE SOURCE AS ROWS OF THE TREE. *** Several gates BUILD gate
// source as string literals: tools/ship/gateMutation-selfcheck.mjs plants a decoy that "counts failures and
// never reports them" to prove its probe catches one. noComments keeps string CONTENTS, so every ok(...)
// inside such a fixture was a row here -- that file read as 8 always-true rows out of 17, a 47% inflation,
// and all eight were lines in a string being written to a temporary file. Reading codeOnly instead takes
// alwaysTrue from 216 to 208 and the population from 29,134 to 29,125.
//
// *** AND THE REPAIR'S FIRST DRAFT WAS A REGEX FOR FINDING REGEX LITERALS, ONE ROUND AFTER v4652 SHIPPED A
// ROUND ABOUT EXACTLY THAT. *** Requiring at least one body character, it skipped the EMPTY regexes codeOnly
// leaves behind and matched from the first slash to the last, eating every identifier between them: nine
// false positives, 11 rows becoming 20, each a row that does read the tree. Importing sourceScan.mjs's two
// primitives was the fix for the second time in two rounds. Three rows hold that boundary now, on both
// sides -- a regex against a literal IS constant, a regex against a variable is NOT, and ordinary division
// is not a regex at all.
//
// *** Z5 WAS A NO-OP BEFORE IT WAS A 0-RED, WHICH IS A DISTINCTION WORTH KEEPING. *** The first attempt
// mutated the `+` out of the label-skipping character class and nothing moved -- not because the gate was
// blind but because THE CODE WAS ALREADY INERT: it skipped `+` and then required a comma, which is not what
// follows a `+` in `ok("a " + "b", cond)`. Every concatenated-label row was being dropped. Repaired, the
// census finds 102 MORE conditions and none of them is constant, so the seed holds at ten.
//
// *** AND THAT IS THE SECOND ROUND RUNNING THAT A FALSE NEGATIVE HAD TO BE CLOSED BY A DIRECT ROW. ***
// v4651's string-stripping hid one row; this hid 102. Neither is visible to a ceiling ratchet, because both
// make the number go DOWN. A census needs a row asserting it can still SEE something, not only rows
// asserting it has not started seeing too much.
//
// *** Y4 IS THE INTERESTING ONE AND IT IS THIS FILE'S OWN SUBJECT LOOKING BACK AT IT. *** The row meant to
// catch it drove a REGEX -- `isConstantCondition('/Math/.test(label)')` -- where `label` is a free
// identifier whether strings are stripped or not, so the row was green either way. That is not quite the
// fifth mechanism (it did call the module) but it is the same failure: the fixture could not reach the
// behaviour the label named. And the damage it hid is the kind a ratchet is worst at seeing -- a FALSE
// NEGATIVE, 10 rows becoming 9, a number that only goes DOWN and so never trips a ceiling. The row asserts
// the property directly now, in the direction that breaks.
//
process.exitCode = fails ? 1 : 0;
