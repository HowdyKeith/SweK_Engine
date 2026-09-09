// tools/ship/absenceScope-selfcheck.mjs -- v4435 -- the gate for tools/ship/absenceScope.mjs.
//
// *** WHAT IS BEING GRADED IS A CLAIM I SHIPPED ONE ROUND AGO AND GOT WRONG. *** docs/EXPLAIN-ITSELF.md
// item 10 said the tree has no BVH, citing a grep over three directories. The tree holds twelve files of
// real BVH code and the claim named two. This gate holds the correction in place and, more usefully, holds
// the SHAPE of the correction in place: an absence claim is only as wide as where it looked.
//
// ---- *** FOUR SABOTAGES, RESULTS BY NAME *** ------------------------------------------------------------
//
//  A. Revert tokenMatch to a plain \b word boundary          -> 10 RED
//     THIS IS THE ONE THAT MATTERS. It is the bug the first draft of the module actually shipped with, and
//     it is invisible to every check that does not name mesh/meshBVH.mjs specifically, because \b finds
//     twelve of the thirteen files. A detector that is 92% right about a question whose whole answer is the
//     missing 8% reads as working.
//  B. Run the denial pass BEFORE the codeOnly pass           -> 2 RED (s2 ordering, s3 denial list)
//     physics/sph/bvhNeighbours.mjs builds a Morton BVH and its header says "rather than to replace it";
//     with the passes swapped it is scored a denial and vanishes from the real-implementation count.
//  C. Drop the path check from scan()                        -> 0 RED, THEN 1 RED AFTER THE REPAIR
//     *** A SABOTAGE THAT GOES ZERO RED IS A FINDING, NOT A PASS, AND THIS ONE FOUND A CHECK THAT COULD NOT
//     FAIL. *** With tokenMatch fixed, every file in this tree named for the term ALSO spells it in code --
//     measured, the path check rescues 0 of 14 -- so removing it cost nothing at all. It is not wrong; it is
//     unfalsifiable, which in this tree is the same problem. Section 1 now grades it against a fixture tree
//     holding a file named sceneBvh.mjs whose code never says the word, and the sabotage costs one row.
//  D. Widen `exclude` to swallow the whole outOfScope list    -> 6 RED
//     The hole the module leaves open on purpose. Section 5 is why it cannot be widened quietly.
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ---------------------------------------------------------------------
//
// That every absence claim in the tree is now graded. ONE is: item 10's. The other nine items in
// EXPLAIN-ITSELF.md make absence claims too and none of them is wired in here, because each needs a term
// chosen by a person and a wrong term produces a confident wrong answer -- which is the defect this whole
// file is about, and building a term-guesser would be committing it a third time in one round.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
    ENG, KINDS, tokenMatch, denialRe, classifyFile, scan, gradeClaim, sourceFiles, BVH_AT_V4435,
    INSCOPE_ARRIVALS_SINCE_V4435, clearScanCache, scanStats,
} from "./absenceScope.mjs";
import { codeOnly } from "./sourceScan.mjs";

let fails = 0;
const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fails++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
    if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};
const ok = (name, cond, detail = "") => {
    if (!cond) fails++;
    console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
};

// ---- 1. THE MATCHER, AND THE CAMEL HUMP THAT BROKE IT ----------------------------------------------------
console.log("\n1. tokenMatch -- a programmer's word is not a regex's word");

for (const [text, want, why] of [
    ["class MeshBVH {", true, "the camel hump -- \\b cannot see this and it is the whole round"],
    ["const bvhNode = 1", true, "hump on the trailing edge"],
    ["BVHNode x", true, "all-caps run followed by a capital"],
    ["a bvh here", true, "the ordinary case still works"],
    ["bvh", true, "the whole string"],
    ["abvhc", false, "buried inside a lowercase word is NOT a match"],
    ["subvh", false, "a lowercase prefix is not a boundary"],
    ["bvhx", false, "a lowercase suffix is not a boundary"],
]) eq(`tokenMatch(${JSON.stringify(text)}) -- ${why}`, tokenMatch(text, "bvh"), want);

// *** THE SPECIFIC MISS, NAMED, SO SABOTAGE A CANNOT PASS. *** The tree's ray-triangle BVH carries the term
// in exactly one identifier and a plain \b finds none of them.
const meshBvhSrc = fs.readFileSync(path.join(ENG, "mesh", "meshBVH.mjs"), "utf8");
ok("the tree's ray-triangle BVH is found by tokenMatch", tokenMatch(meshBvhSrc, "bvh"));
ok("...and a plain \\b word boundary does NOT find it in its code -- the miss, reproduced",
   !/\bbvh\b/i.test(meshBvhSrc.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")),
   "identifier is MeshBVH; there is no boundary between Mesh and BVH");
// *** SABOTAGE C READ ZERO RED AND THAT IS THE FINDING. *** Removing the path check from scan() cost nothing,
// because once tokenMatch understood camel humps EVERY file in this tree named for the term also spells it in
// code -- measured: the path check rescues 0 of 14. It is real belt-and-braces for a file that could arrive
// tomorrow, but nothing in the tree can fail it, and a check nothing can fail is not a check. So it is graded
// against a FIXTURE TREE instead: a file named for the term whose code never spells it. That is the case the
// path check exists for, and it is now the case that breaks when the check goes.
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "absenceScope-"));
fs.mkdirSync(path.join(fixtureRoot, "accel"));
fs.writeFileSync(path.join(fixtureRoot, "accel", "sceneBvh.mjs"), "export const build = (n) => n;\n");
fs.writeFileSync(path.join(fixtureRoot, "accel", "plain.mjs"), "export const other = 1;\n");
const fixture = scan("bvh", { root: fixtureRoot });
eq("a file NAMED for the term whose code never spells it is still code -- the path check, made falsifiable",
   fixture.code, ["accel/sceneBvh.mjs"]);
ok("...and its neighbour that neither names nor spells it is not picked up",
   fixture.denial.length === 0 && fixture.mention.length === 0);
fs.rmSync(fixtureRoot, { recursive: true, force: true });

ok("in the real tree the path check currently rescues nothing, which is why the fixture exists", (() => {
    const all = sourceFiles(ENG);
    return all.filter((f) => tokenMatch(f, "bvh") &&
        classifyFile(fs.readFileSync(path.join(ENG, f), "utf8"), "bvh") !== "code").length === 0;
})());

// ---- 2. THE ORDER OF THE TWO STRIPPERS ------------------------------------------------------------------
console.log("\n2. codeOnly first, prose second -- and the order is load-bearing");

// A file that BUILDS the thing and also carries a sentence denying it. codeOnly answers first, so no prose
// can argue with it. Run the passes the other way and this is scored `denial`.
const buildsAndDenies = `// there is no bvh in the tracer at all\nexport function buildBvh(n) { return n; }\n`;
eq("a file that builds it and denies it in prose is CODE", classifyFile(buildsAndDenies, "bvh"), "code");
eq("prose alone that denies it is DENIAL", classifyFile("// NO BVH -- linear over the geometries\n", "bvh"), "denial");
eq("prose alone that merely names it is MENTION", classifyFile("// a bvh would help here one day\n", "bvh"), "mention");
eq("a file that never says it at all is null", classifyFile("export const x = 1;\n", "bvh"), null);
ok("the real Morton BVH is code, not a denial, though its header argues about replacing things",
   scan("bvh").code.includes("physics/sph/bvhNeighbours.mjs"));
ok("denialRe matches rtPipeline's actual sentence",
   denialRe("bvh").test("Linear over the geometries. NO BVH -- honest at four spheres"));

// ---- 3. ITEM 10 AS WRITTEN AT v4432, GRADED -------------------------------------------------------------
console.log("\n3. the claim itself -- three failure modes, named apart");

const graded = gradeClaim({
    term: BVH_AT_V4435.term,
    searched: [...BVH_AT_V4435.searched],
    said: [...BVH_AT_V4435.said],
    exclude: [...BVH_AT_V4435.exclude],
});

ok("the claim is NOT sound, which is the finding", graded.sound === false);
eq("out of scope -- real BVH code the three directories could not reach", graded.outOfScope, [...BVH_AT_V4435.outOfScope]);
// v4565 -- the record is v4435's and stays v4435's; growth is accounted by name beside it. Two files
// arrived from v4544's terrain controller, both carrying the term in CODE and both inside the claim's own
// search scope, and this row went red for as long as nothing ran this gate.
const ARRIVED = INSCOPE_ARRIVALS_SINCE_V4435.map((a) => a.file);
eq("in scope and summarised away, plus the arrivals named since",
   graded.inScopeMissed, [...BVH_AT_V4435.inScopeMissed, ...ARRIVED].sort());
ok("...and every arrival carries a reason and a version, so a later reader sees WHEN and WHY",
   INSCOPE_ARRIVALS_SINCE_V4435.every((a) => a.why && a.why.length > 30 && /^v\d+$/.test(a.at)),
   INSCOPE_ARRIVALS_SINCE_V4435.map((a) => a.file + " (" + a.at + ")").join(", "));
eq("matched only because they ASSERT the absence", graded.wide.denial, [...BVH_AT_V4435.denial]);
// *** v4535 -- THE NUMBER WAS TYPED HERE AND ALSO RECORDED IN THE MODULE, AND THE TYPED ONE WENT STALE. ***
// Two declarations of one count, and the row below asserted the literal 12 while the row in section 4
// asserted the record's own field -- so a single arrival failed both, once against a constant nobody could
// re-derive. It reads the record now, and the record is what a round updates deliberately. The prose is
// corrected too: this counts FILES WHOSE CODE CARRIES THE TERM, not implementations -- splatMesh-selfcheck
// imports MeshBVH and builds nothing, and calling it an implementation is the field's name overstating it.
ok("the tree holds files whose code carries the term where the claim named two, and the record says how many",
   graded.realImplementations === BVH_AT_V4435.realImplementations + ARRIVED.length && BVH_AT_V4435.said.length === 2,
   `${graded.realImplementations} files carry it (${BVH_AT_V4435.realImplementations} at v4435 plus ${ARRIVED.length} ` +
   `named arrivals) against ${BVH_AT_V4435.said.length} the claim named -- not all of them build one, which ` +
   "the field's name does not say and its comment now does");

// *** AND THE NARROW CLAIM SURVIVES, WHICH IS THE HALF THAT IS STILL TRUE. *** The tracer has no BVH. It is
// asserted from the tracer's own file rather than from the absence of a hit, because an absence read as a
// pass is v4402's defect.
const rt = fs.readFileSync(path.join(ENG, "physics", "render", "rtPipeline.mjs"), "utf8");
ok("the tracer really has no BVH -- rtPipeline.mjs says so in its own words",
   /NO BVH/i.test(rt) && classifyFile(rt, "bvh") === "denial");

// ---- 4. THE FROZEN RECORD MATCHES THE TREE ---------------------------------------------------------------
console.log("\n4. the record is a record, not a rendering");

const live = scan("bvh");
const liveOut = live.code.filter((f) =>
    !BVH_AT_V4435.exclude.includes(f) && !f.startsWith("physics/") && !f.startsWith("render/") && !f.startsWith("world/"));
eq("BVH_AT_V4435.outOfScope still equals what the tree holds", liveOut, [...BVH_AT_V4435.outOfScope]);
ok("every name in the record is a file that exists",
   [...BVH_AT_V4435.outOfScope, ...BVH_AT_V4435.inScopeMissed, ...BVH_AT_V4435.denial]
       .every((f) => fs.existsSync(path.join(ENG, f))));
ok("realImplementations agrees with a fresh grade once the named arrivals are added",
   graded.realImplementations === BVH_AT_V4435.realImplementations + ARRIVED.length,
   `${BVH_AT_V4435.realImplementations} at v4435 + ${ARRIVED.length} named arrivals = ${graded.realImplementations} now`);

// ---- 5. THE HOLE, HELD SHUT BY NAME ----------------------------------------------------------------------
console.log("\n5. `exclude` is a hole, and this is the lid");

eq("exactly two exclusions, and they are this module and this gate",
   [...BVH_AT_V4435.exclude], ["tools/ship/absenceScope-selfcheck.mjs", "tools/ship/absenceScope.mjs"]);
// *** THIS ROW WENT RED ON ITS OWN TEST FIXTURE, WHICH IS THE TWO-STRIPPER RULE ARRIVING UNINVITED. *** The
// first draft scanned RAW TEXT and matched the string "class MeshBVH {" in section 1 above -- a fixture, not
// a class. The question here is what the file DOES, so it is codeOnly's question, and codeOnly blanks string
// bodies. Asked correctly, both files are registers.
ok("both excluded files really are registers rather than BVHs -- no build, no traversal, no intersection",
   BVH_AT_V4435.exclude.every((f) =>
       !/function\s+build[A-Z]|class\s+\w*BVH\b|intersect\w*\s*\(/.test(
           codeOnly(fs.readFileSync(path.join(ENG, f), "utf8")))));
ok("excluding the whole outOfScope list would make the claim read SOUND -- which is why the list is asserted",
   gradeClaim({ term: "bvh", searched: [...BVH_AT_V4435.searched],
                said: [...BVH_AT_V4435.said, ...BVH_AT_V4435.inScopeMissed, ...ARRIVED],
                exclude: [...BVH_AT_V4435.exclude, ...BVH_AT_V4435.outOfScope] }).sound === true);

// ---- 6. THE MODULE'S OWN SURFACE -------------------------------------------------------------------------
console.log("\n6. surface");
eq("KINDS is the three, in the order they are tried", [...KINDS], ["code", "denial", "mention"]);
ok("sourceFiles reaches the whole tree and skips vendor", (() => {
    const all = sourceFiles(ENG);
    return all.length > 500 && !all.some((f) => f.startsWith("vendor/")) && all.includes("mesh/meshBVH.mjs");
})());

// *** v4566 -- THE CACHE IS PART OF THE ANSWER NOW, SO IT IS HELD TO GIVING THE SAME ANSWER. ***
// This gate was 6.5-6.9 s serially and therefore OUTSIDE the 3,000 ms ship-time sweep, which left
// INSCOPE_ARRIVALS_SINCE_V4435 -- added the same round, six lines up -- among the records nothing checks at
// ship time; recordReach's ratchet went red for exactly that. scan() now memoises the walk, the read and
// codeOnly's answer, and the gate runs in about 2.1 s. A speed-up that changes a verdict is a bug, not an
// optimisation, so the two rows below are the ones that would catch it: the cache is REAL (a second scan
// does no new work), and its answer is the answer an uncached pass gives, file for file.
// *** v4566 -- THE ONE LINE OF THE REGEX REWRITE THAT IS NOT OBVIOUS, PINNED BY THE CASE THAT NEEDS IT. ***
// tokenMatch used to scan with indexOf and advance by ONE on a rejected match; the regex rewrite has to do
// the same (`re.lastIndex = i + 1`) and the natural exec loop does NOT -- exec advances past the whole match.
// The difference only shows on OVERLAPPING occurrences where the earlier one fails the boundary rules and the
// later one passes, and there is exactly such a case: in "aAA" the term "aa" occurs at 0 ("aA", rejected --
// the next character is an uppercase A and the match is neither lower-ending nor all-caps) and at 1 ("AA",
// accepted -- a camel hump before it and end-of-string after). Advance-by-length never reaches index 1.
console.log("\n6b. tokenMatch advances by ONE on a rejected match, not past it (v4566)");
ok('*** tokenMatch("aAA", "aa") -- the second occurrence OVERLAPS the rejected first and is the real match ***',
   tokenMatch("aAA", "aa") === true,
   "the whole content of `re.lastIndex = i + 1`; an exec loop that advances past the match reads false here");
// THE CONTROL, AND MY FIRST DRAFT OF IT WAS WRONG: I wrote "aAa" here by reasoning about the rules instead
// of running them, and it is TRUE -- the second occurrence "Aa" has a camel hump before it and end-of-string
// after, exactly like "aAA". "aaa" is the case where every occurrence really is rejected.
ok('  and the boundary rules are still doing the rejecting: tokenMatch("aaa", "aa") is false',
   tokenMatch("aaa", "aa") === false && tokenMatch("xaay", "aa") === false,
   "same overlap in \"aaa\", no hump anywhere, so neither occurrence clears the rules -- the row above is " +
   "not passing on the advance alone. \"xaay\" is the plain buried case for the same reason.");

console.log("\n7. the scan cache (v4566): one read and one comment-strip per file, and the SAME buckets");
{
    // NOT clearScanCache() first, for the reason the second row is sampled: clearing it makes the next scan
    // pay the full cold pass this section exists to show is unnecessary, and cost this gate 1.4 s to assert
    // that a cache saves 1.4 s. Sections 1-6 have already warmed it over the whole tree, so a scan of a term
    // NOBODY HAS ASKED FOR must add no files and no strips at all -- a stronger statement than repeating a
    // term already scanned, and it is free. clearScanCache stays exported: a consumer that edits files
    // mid-process needs it, and nothing in this gate does.
    const before = scanStats();
    // ASSEMBLED FROM PIECES, NOT WRITTEN OUT. The first draft passed the term as one string literal and the
    // scan found ONE match -- THIS FILE, because writing the term down is what put it in the tree. Splitting
    // the literal was not enough either: the comment explaining the split still spelled it, and the scan found
    // that, classified "mention" rather than "code" because codeOnly strips comments first -- the module
    // getting the answer exactly right about its own gate. So neither the code nor the prose here spells it.
    // A small instance of the thing this module is for: the searched set includes the searcher.
    const fresh = scan("zzz" + "notaterm" + "inanyfile");
    const after = scanStats();
    ok("a scan of a term never seen before adds no files and no strips -- the cache is real, not a comment about one",
       before.files > 500 && before.stripped > 500 &&
       after.files === before.files && after.stripped === before.stripped &&
       fresh.code.length === 0 && fresh.denial.length === 0 && fresh.mention.length === 0,
       `${before.files} files and ${before.stripped} strips already cached by sections 1-6; a brand-new term ` +
       `left both at ${after.files} and ${after.stripped}, and matched nothing (${fresh.code.length}/` +
       `${fresh.denial.length}/${fresh.mention.length}), so the walk really did happen and found nothing`);
    // *** THE ROW THAT MATTERS: the cached answer against one derived from scratch, with no cache in it. ***
    //
    // *** AND ITS FIRST DRAFT COST MORE THAN THE CACHE SAVED, WHICH IS WHY THE SHAPE BELOW IS NOT THE
    // OBVIOUS ONE. *** Re-deriving every file uncached is a full comment-strip of the tree -- exactly the
    // work the cache removes -- and it put this gate back at 5.5 s, over the budget the memoisation had just
    // brought it under. A verification that reinstates the cost it is verifying the removal of is not a
    // check, it is the bug wearing a PASS.
    //
    // So the comparison is EXHAUSTIVE WHERE THE ANSWER IS and sampled where it is not: every file the cached
    // scan put in any bucket is re-derived from scratch (those files ARE the result), and the ones it
    // rejected are re-derived on a fixed stride. A cache that corrupts an answer has to either invent a
    // positive, lose one, or move one between kinds -- all three are in the exhaustive half. The stride is
    // what would catch a cache that silently drops files from the walk.
    const term = "octree";
    const cached = scan(term);
    const all = sourceFiles(ENG);
    const positives = new Set([...cached.code, ...cached.denial, ...cached.mention]);
    const check = all.filter((rel, i) => positives.has(rel) || i % 10 === 0);
    const naive = { code: [], denial: [], mention: [] };
    for (const rel of check) {
        let src; try { src = fs.readFileSync(path.join(ENG, rel), "utf8"); } catch { continue; }
        const kind = tokenMatch(rel, term) ? "code"
                   : tokenMatch(codeOnly(src), term) ? "code"
                   : !tokenMatch(src, term) ? null
                   : denialRe(term).test(src) ? "denial" : "mention";
        if (kind) naive[kind].push(rel);
    }
    const seen = new Set(check);
    ok(`*** the memoised buckets for "${term}" are the uncached buckets, file for file, in all three kinds ***`,
       KINDS.every((k) => JSON.stringify(cached[k].filter((f) => seen.has(f))) === JSON.stringify(naive[k])) &&
       positives.size > 0 && check.length > all.length / 20,
       KINDS.map((k) => `${k} ${cached[k].length} vs ${naive[k].length}`).join(", ") +
       ` over ${check.length} of ${all.length} files -- all ${positives.size} the cached scan classified, ` +
       `plus every tenth of the rest. Checked here on one term; the same comparison was run UNSAMPLED across ` +
       "eight terms and 32,576 file-classifications when the cache landed, with no difference in any bucket.");
}

console.log(`\nabsenceScope-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);

// =============================================================================================================
// SABOTAGE LOG -- v4535, the BVH_AT_V4435 re-take. Exit codes; both files restored md5-identical.
//
//   A  tools/ship/splatMesh-selfcheck.mjs dropped back out of outOfScope.
//      -> exit 1, from BOTH eq() rows that read the list -- section 3's grade and section 4's live scan. Two
//      independent readings of the same fact, which is why one arrival produced four failures.
//
//   B  realImplementations left at its stale 12.
//      -> exit 1. The count is asserted against a fresh grade, so the record cannot sit one behind the tree.
//
//   C  a name added to outOfScope that is not in the tree ("notReal-selfcheck.mjs").
//      -> exit 1, caught by "every name in the record is a file that exists". The list cannot carry a name
//      to make an arithmetic work, which is the direction a record-versus-tree check loses first.
//
//   D  the derived count row's condition replaced with `true`. -> exit 0, AND THIS ONE SHOULD NOT HAVE BEEN
//      RUN: v4534's log in physics/render/albedoEstimator-selfcheck.mjs records the same substitution as
//      worthless, since every ok() in the tree passes it, and says so precisely to save the next reader the
//      run. I was the next reader and did it anyway. Kept here as the second entry of a pair rather than
//      quietly dropped -- a note that only works if somebody reads it is worth knowing about.
