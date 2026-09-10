// WebGLEngine/tools/ship/backlogAbsence-selfcheck.mjs -- v4537
//
// Run: node tools/ship/backlogAbsence-selfcheck.mjs
//
// GATES tools/ship/backlogAbsence.mjs, which points tools/ship/absenceScope.mjs at the absence claims
// tools/ship/nextRounds.mjs actually makes. Before this round gradeClaim() had one call site in the whole
// tree -- absenceScope's own selfcheck, grading absenceScope's own frozen record from the round that wrote
// it. The instrument and its subject sat in the same directory for a hundred rounds without meeting.
//
// *** SECTION 3 IS THE ROW THAT WOULD HAVE CAUGHT THIS ROUND'S OWN DEFECT AND IT IS WHY THE ROW EXISTS. ***
// The first draft of the register spelt all six of its search terms as string literals and quoted them again
// in its header. absenceScope reads a string literal as CODE and a comment as a MENTION, so the module
// landed in ALL SIX of its own censuses and moved two of them from one denial to two -- measured, before it
// had graded anything. That is v4409's rule (a fixture is not a gate; build the needle by concatenation) for
// the sixth time this session, and it was found by asking rather than by assuming.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------
//
//   A  the control claim's mustFail flag cleared             3 RED -- sections 1, 2 and 4b together. The
//                                                            control stops being exempt and fails section 1
//                                                            as a live claim, section 2 has no control left,
//                                                            and the record reads 0 failing against 1.
//   B  one needle spelt whole instead of split               1 RED, section 3, naming the term.
//   C  the recorded sentence floor lowered below the live    1 RED, section 4 -- 8 against a floor of 7.
//   D  the scope dropped from gradeClaim, so every claim is  2 RED, sections 1 and 4b. *** THIS IS THE ROUND'S
//      graded tree-wide the way a plain grep would              THESIS DRIVEN RATHER THAN ARGUED: *** one
//                                                               claim that HOLDS goes to FAILING, because its
//                                                               twelve out-of-scope files become in-scope. A
//                                                               true claim reads as false the moment the
//                                                               instrument stops honouring the scope its
//                                                               author wrote, which is the whole difference
//                                                               between gradeClaim and a grep.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as AS from "../../tools/ship/absenceScope.mjs";
import * as BA from "../../tools/ship/backlogAbsence.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

const rows = BA.gradeAll();
const live = rows.filter((r) => !r.mustFail);
const control = rows.filter((r) => r.mustFail);

// =============================================================================================================
console.log("\n1. *** THE BACKLOG'S OWN ABSENCE CLAIMS, GRADED BY THE INSTRUMENT BUILT FOR EXACTLY THAT ***");
{
    const broken = live.filter((r) => !r.holds);
    ok("!! *** EVERY LIVE ABSENCE CLAIM IN nextRounds.mjs SURVIVES BEING RE-DERIVED ***",
        broken.length === 0 && live.length === BA.CLAIMS.filter((c) => !c.mustFail).length,
        live.length + " claims graded, " + (live.length - broken.length) + " hold" +
        (broken.length ? ". *** FAILING: *** " + broken.map((b) => b.id + " (" + b.term + "): " + b.missed +
            " in scope and missed -- " + b.files.slice(0, 3).join(", ")).join("; ")
        : ". *** AND THE ACQUITTALS ARE THE ARGUMENT FOR WIRING THIS, NOT THE CONVICTIONS: *** one of them is " +
          "an entry whose token returns TWELVE code files tree-wide and would read as refuted by a plain grep. " +
          "Every one of the twelve is outside the single directory its author scoped the claim to -- the same " +
          "word names a matrix layout in math/solverFit.mjs. gradeClaim separates OUT OF SCOPE from IN SCOPE " +
          "AND MISSED, which a grep cannot, and that distinction is the whole reason this file is not a grep."));
    for (const r of live) report(r.id + " / " + r.term + ": " + (r.holds ? "holds" : "FAILS") +
        ", " + r.inScope + " in scope, " + r.missed + " missed, " + r.outOfScope + " out of scope");
}

// =============================================================================================================
console.log("\n2. *** AND IT CONVICTS, WHICH SIX ACQUITTALS ON THEIR OWN WOULD NEVER HAVE SHOWN ***");
{
    ok("!! *** THE CONTROL CLAIM FAILS BY NAME: A REGISTER THAT ONLY EVER PASSES HAS NEVER BEEN SEEN TO WORK ***",
        control.length === 1 && !control[0].holds && control[0].missed > 0,
        control.length + " control claim, " + (control[0] ? control[0].missed + " code file(s) IN SCOPE AND " +
        "MISSED: " + control[0].files.slice(0, 4).join(", ") : "MISSING") + ". *** THIS IS THE CLAIM THE ROUND " +
        "STARTED FROM, RESTATED AGAINST A TOKEN THIS TREE REALLY CARRIES. *** An entry on another branch says " +
        "this tree has nothing resembling a GPU path tracer as a rendering feature; the files above are a " +
        "shipped WebGL2 fullscreen fragment shader stepping a ray per pixel through a 3D texture of the real " +
        "generated world, and an octree shader that descends an acceleration structure encoded into a texture " +
        "-- the very architecture that entry calls foreign here. They predate this module by hundreds of " +
        "rounds, so this row is a measurement and not a fixture grading its own plant.");
    report("the entry itself is NOT graded: it lives on origin/claude/shader-porting-swek-ozgvb0 and is on " +
           "neither main nor here. A gate whose subject sits on another branch is a gate that can go red " +
           "without this tree moving, so the finding is recorded in prose and the CONTROL carries the check.");
}

// =============================================================================================================
console.log("\n3. *** THE REGISTER IS NOT IN ITS OWN CENSUS, WHICH THE FIRST DRAFT OF IT WAS ***");
{
    // *** THE CACHE IS DELIBERATELY NOT CLEARED HERE, AND THAT IS A BUDGET DECISION WITH A MEASUREMENT. ***
    // absenceScope caches its walk and its file reads per process. The first draft called clearScanCache()
    // out of tidiness and the gate came in at 3,011 ms against tools/ship/sweepCoverage.mjs's 3,000 ms
    // budget -- eleven milliseconds over, which does not fail a gate, it EXILES it from the quick sweep.
    // Nothing here needs a cold read: the question is which files carry a token, and the files have not
    // changed since section 1 asked the same thing.
    const dirty = [];
    for (const c of BA.CLAIMS) {
        const t = BA.termOf(c), s = AS.scan(t);
        const self = [...s.code, ...s.denial, ...s.mention].filter((f) => /backlogAbsence/.test(f));
        if (self.length) dirty.push(t);
    }
    ok("!! *** NO NEEDLE IN THIS REGISTER FINDS THE REGISTER ***",
        dirty.length === 0,
        dirty.length === 0
            ? "all " + BA.CLAIMS.length + " terms scanned; this module appears in none of their code, denial or " +
              "mention buckets. *** THE FIRST DRAFT APPEARED IN ALL SIX, *** because it spelt each term as a " +
              "string literal and quoted them again in prose -- and it moved two censuses from one denial to " +
              "two before it had graded anything. The needles are built by concatenation and the prose " +
              "describes the tokens rather than spelling them."
            : "*** " + dirty.length + " TERM(S) FIND THIS FILE: " + dirty.join(", ") + " *** -- a register that " +
              "lands in the census it takes is v4409's defect, and the count it reports is partly itself.");
}

// =============================================================================================================
console.log("\n4. *** THE RATCHET, BECAUSE A HAND-LISTED REGISTER GOES QUIETLY STALE ***");
{
    const live_n = BA.claimSentences();
    const floor = BA.BACKLOG_AT_V4537.sentenceFloor;
    ok("!! a new absence claim cannot arrive in nextRounds.mjs unnoticed",
        live_n <= floor,
        live_n + " absence-shaped sentences against a recorded floor of " + floor + ". *** THIS COUNTS A " +
        "SHAPE AND NOT A MEANING, AND THAT IS SAID RATHER THAN LEFT TO BE DISCOVERED: *** most of what it " +
        "counts cannot be graded at all -- 'NOTHING IS WIRED' is about a caller and 'nothing has complained " +
        "about bandwidth' is about a want, and neither is a token a scanner can look for. It is a TRIPWIRE on " +
        "the file's vocabulary, so a rise forces somebody to look and decide. Reading it as 'the backlog " +
        "makes " + live_n + " absence claims' would be a proxy reported as a fact, which is the defect this " +
        "file exists to catch one level down.");
    ok("   ...and the recorded reading still matches the register",
        BA.BACKLOG_AT_V4537.claims === BA.CLAIMS.length &&
        BA.BACKLOG_AT_V4537.holding === live.filter((r) => r.holds).length &&
        BA.BACKLOG_AT_V4537.failing === control.filter((r) => !r.holds).length,
        BA.CLAIMS.length + " claims, " + live.filter((r) => r.holds).length + " holding, " +
        control.filter((r) => !r.holds).length + " failing, against a record of " +
        BA.BACKLOG_AT_V4537.claims + "/" + BA.BACKLOG_AT_V4537.holding + "/" + BA.BACKLOG_AT_V4537.failing);
}

// =============================================================================================================
console.log("\n5. *** WHAT THIS ROUND FOUND, RE-DERIVED RATHER THAN REMEMBERED ***");
{
    const src = (rel) => { try { return fs.readFileSync(path.join(ENG, rel), "utf8"); } catch { return ""; } };
    const files = ["tools/ship/absenceScope-selfcheck.mjs", "tools/ship/backlogAbsence.mjs",
                   "tools/ship/backlogAbsence-selfcheck.mjs", "tools/ship/nextRounds.mjs"];
    let sites = 0;
    for (const f of files) sites += (src(f).match(/\bgradeClaim\s*\(/g) || []).length;
    const nr = src("tools/ship/nextRounds.mjs");
    const nrImports = (nr.match(/^import .*$/gm) || []).length;
    const importsGrader = (nr.match(/^import .*$/gm) || []).some((l) => /absenceScope/.test(l));
    const namesGrader = /absenceScope/.test(nr);
    ok("!! nextRounds.mjs NAMES the grader in its own prose and does not import it",
        !importsGrader && namesGrader && nrImports >= 1,
        "the backlog file has " + nrImports + " import(s), none of them the grader, while its own entry text " +
        "does name it. *** THE FIRST DRAFT OF THIS ROW ASSERTED THE FILE DID NOT MENTION IT AT ALL AND WENT " +
        "RED -- ON THE ASSERTION, NOT THE TREE. *** The sharper fact is the one that replaced it: somebody " +
        "writing an entry knew the grader existed and wrote its name down, and still nothing called it. " +
        "*** BEFORE THIS ROUND gradeClaim() HAD ONE CALL SITE IN THE TREE *** -- absenceScope's own selfcheck, " +
        "on absenceScope's own frozen record. The instrument existed, was careful, was known about, and " +
        "reached nothing but itself: a check nothing reaches rather than a check that is wrong.");
    report("gradeClaim call sites across the four files that could plausibly hold one: " + sites +
           ", against " + BA.BACKLOG_AT_V4537.gradeClaimCallSitesBeforeThisRound + " before this round");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: whether the TERMS in the register are the right ones, which is a judgement and stays " +
    "a person's job -- absenceScope's own header says so and this file cannot improve on it. Also unchecked: " +
    "every absence claim that is about a WANT or a CALLER rather than a token, which is most of them and " +
    "which no scanner can grade; the 475 pages carrying 5.09 MB of script that absenceScope's file set does " +
    "not include, measured this round and found to flip NO term tested, so it is recorded as a gap with no " +
    "demonstrated cost rather than as a defect; and the off-branch entry itself, which no gate here can read.");
process.exit(fails ? 1 : 0);
