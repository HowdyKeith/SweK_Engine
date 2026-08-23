// tools/ship/orphanTriage-selfcheck.mjs
//
// RUNTIME 92s MEASURED with date(1) around the run at v3558, RE-TAKEN AND NOT CARRIED FORWARD -- the header
// said 35s, correct for v3548, and this round's sections 6 and 7 added two more full classify() passes plus a
// three-stripper sweep over every actionable module. NEARLY TRIPLE. A STATED RUNTIME NOBODY RE-MEASURES IS A
// MEMORY (v3211-v3213 found one wrong in 59 of 82 headers; v3544's own said 250s against 1200s), and the way
// it goes wrong is exactly this: the number stays right where it was while the file grows underneath it.
//
// *** NOTHING IN THIS GATE IS A FROZEN COUNT. *** The subject is a CENSUS, and v3453's law is that a ratchet
// which rises every round stops being a ratchet. What is asserted is that the derivation AGREES WITH THE ONE
// IT COPIES, that the classes PARTITION, that the zero overlap is a REAL READING rather than two sets that
// never meet, and that the spawn corpus EXCLUDES PROSE -- proven by driving the broken corpus, not described.
//
// v3558 -- TWO NEW CLASSES, AND SECTIONS 6 AND 7 EXIST BECAUSE v3551 NEARLY SHIPPED ONE THAT COLLAPSED THE
// PILE TO ZERO. Every classifier added here must be shown to admit SOME members and REFUSE others, with the
// refused case NAMED, because a question whose answer is structurally guaranteed is not evidence.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { actionable, classify, spawnSites, hasMainBlock, ENG, PROJ, SPAWN_EXT,
         MEASURED_V3548, MEASURED_V3558 } from "./orphanTriage.mjs";
import { codeOnly, noComments } from "./sourceScan.mjs";
import { gradedCoverage } from "../roundhouse/gradedCoverage.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("orphanTriage-selfcheck -- which orphans, and is the sort derived?\n");

const act = actionable();
const cov = gradedCoverage(ENG + path.sep);
const r = classify({ list: act, cov });

// ---------------------------------------------------------------------------
console.log("1. *** THE OBSERVER EFFECT: WRITING THIS ROUND CHANGED THE NUMBER IT MEASURES ***");
{
    // graveyard reported 104 actionable on the tree WITHOUT this file. This derivation reads 103, and the one
    // module that came off is tools/ship/moduleRefs.mjs -- BECAUSE THIS FILE'S OWN MODULE IMPORTS IT. An
    // analysis primitive does not only ADD itself to the pile (v3453's finding); it can RESCUE others from it
    // by becoming their first non-gate importer. THAT IS DERIVED HERE RATHER THAN ASSERTED: read this round's
    // own import specifiers and check that every difference is one of them.
    const selfSrc = fs.readFileSync(path.join(ENG, "tools/ship/orphanTriage.mjs"), "utf8");
    const mineImports = [...selfSrc.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1])
        .filter((s) => s.startsWith("."))
        .map((s) => path.relative(ENG, path.resolve(path.join(ENG, "tools/ship"), s)).split(path.sep).join("/"));
    report("this module's own relative imports", mineImports.join(", "));
    ok("!! every module this file imports is ABSENT from the pile it measures",
        mineImports.every((m) => !act.includes(m)),
        "so the pile this round reports is the pile AFTER this round, and the difference from graveyard's " +
        "104 is THIS FILE'S DOING. *** AN ANALYSIS PRIMITIVE ADDS ITSELF AND CAN REMOVE OTHERS -- v3453 " +
        "recorded only the first half. A CENSUS THAT MOVES WHEN YOU MEASURE IT MUST SAY SO. ***");
    ok("...and graveyard's number is NOT adjusted to match", act.length !== 100,
        act.length + " here; graveyard keeps its own derivation and its own baseline of 100 and stays RED. " +
        "CHANGING A CLASSIFIER TO MAKE A COUNT FALL IS HOW A RATCHET STOPS MEANING ANYTHING (v3453)");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE ZERO OVERLAP IS BY CONSTRUCTION -- AND IT IS A REAL READING, NOT TWO SETS THAT NEVER MEET ***");
{
    const gradedHit = act.filter((a) => cov.graded.includes(a));
    const ungradedHit = act.filter((a) => cov.ungraded.includes(a));
    ok("!! *** graded INTERSECT actionable = 0 ***", gradedHit.length === 0,
        "GRADED means REACHABLE FROM A DEVICE BIND; a bind is a NON-GATE IMPORTER; a non-gate importer is " +
        "exactly what disqualifies a module from being GATE-ONLY. The two sets CANNOT intersect. *** v3448 " +
        "recorded, and this project's notes carried for ~100 versions, that these were 'TWO INSTRUMENTS, ONE " +
        "POPULATION, OPPOSITE FRAMINGS, AND NOTHING COMPARED THEM'. COMPARED: THEY ARE COMPLEMENTARY, AND " +
        "THERE WAS NEVER A CONFLICT TO RESOLVE. ***");
    ok("!! ...and the sets DO meet elsewhere, so the zero is a reading rather than a vacuity",
        ungradedHit.length > 0 && cov.graded.length > 0 && act.length > 0,
        ungradedHit.length + " actionable modules are in gradedCoverage's UNGRADED list, against " +
        cov.graded.length + " graded and " + act.length + " actionable. *** THE REAL OVERLAP IS THE AGREEING " +
        "ONE -- both instruments saying the same thing about the same modules from two directions. WITHOUT " +
        "THIS LINE THE ZERO ABOVE COULD BE TWO POPULATIONS THAT SIMPLY NEVER TOUCH. ***");
    // The v3448 claim named six. Two aged out correctly and nobody noticed.
    const findIn = (n, arr) => arr.filter((f) => f.includes(n));
    for (const n of ["friedmann", "lensing", "beerLambert", "kerrLadder"]) {
        const g = findIn(n, cov.graded), u = findIn(n, cov.ungraded), a = findIn(n, act);
        report("v3448 named " + n.padEnd(12),
            "graded:" + (g.length ? "Y" : "n") + " ungraded:" + (u.length ? "Y" : "n") +
            " actionable:" + (a.length ? "Y" : "n"));
    }
    ok("...and two of the six have since become GRADED and left the pile",
        findIn("friedmann", cov.graded).length > 0 && findIn("lensing", cov.graded).length > 0,
        "bound to the astroparticle device from v3501 onward. THE RECORD AGED OUT CORRECTLY AND NOBODY " +
        "NOTICED, which is what a comparison is for. (halo and oscillation are MODES, not standalone modules, " +
        "so they were never in any of the three lists at all.)");
}

// ---------------------------------------------------------------------------
console.log("\n3. THE CLASSES PARTITION -- every module lands in exactly one");
{
    const buckets = Object.values(r.split);
    const sum = buckets.reduce((a, b) => a + b.length, 0);
    ok("!! the split sums to the total, so nothing is double-counted or dropped", sum === r.total,
        Object.entries(r.split).map(([k, v]) => k + " " + v.length).join("  ") + "  = " + sum +
        " of " + r.total);
    const seen = new Set();
    let dup = null;
    for (const b of buckets) for (const f of b) { if (seen.has(f)) dup = f; seen.add(f); }
    ok("...and no module appears twice", dup === null, dup ? "DUPLICATE: " + dup : "all distinct");
    report("*** THE READ-ONE-AT-A-TIME LIST IS NOW " + r.split.unclassified.length + " ***",
        "down from " + r.total + ", and NOT ONE OF THEM IS DECIDED HERE -- sorted by evidence, judged by nobody");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE SPAWN CORPUS EXCLUDES PROSE, AND THE DEFECT IS DRIVEN RATHER THAN DESCRIBED ***");
{
    // *** I BUILT THE BROKEN CORPUS FIRST AND IT REPORTED 31 OF 36 SPAWNED WHERE THE TRUTH IS A HANDFUL. ***
    // It swept BACKLOG.md, TODO.md, knowledge-index.json and the okf/claims prose, so A PROSE MENTION COUNTED
    // AS A SPAWN -- the exact defect graveyard was rebuilt to fix at v3451, committed inside the round about
    // it. Rebuilding the broken corpus here makes the claim FAIL-SHOWN instead of a story in a comment.
    const proseCorpus = new Map();
    (function w(d) {
        for (const e of fs.readdirSync(d)) {
            if (e === "node_modules" || e.startsWith(".")) continue;
            const p = path.join(d, e);
            let st; try { st = fs.statSync(p); } catch { continue; }
            if (st.isDirectory()) w(p);
            else if (/\.(md|json)$/i.test(e)) {
                try { proseCorpus.set(p, fs.readFileSync(p, "utf8")); } catch { /* unreadable */ }
            }
        }
    })(PROJ);
    const loose = classify({ list: act, cov, spawn: proseCorpus });
    report("spawned, EXECUTABLES only", String(r.split.spawned.length));
    report("spawned, PROSE corpus (.md + .json)", String(loose.split.spawned.length) +
           "   over " + proseCorpus.size + " prose/artefact files");
    ok("!! *** A PROSE CORPUS INFLATES THE SPAWNED CLASS SEVERALFOLD ***",
        loose.split.spawned.length > r.split.spawned.length * 3,
        "*** THE CHANGELOG, THE TODO AND knowledge-index.json NAME MODULES FOR A READER. A FILE THAT NAMES A " +
        "MODULE IS NEVER ITS LAUNCHER -- v3223's rule about registers, and v3451's about substring matching, " +
        "arriving a third time in the round examining both. The corpus is .bat/.sh/.command/.ps1 and " +
        "package.json's SCRIPTS VALUE, nothing else. ***");
    ok("...and the honest corpus is executables, asserted rather than assumed",
        [...spawnSites().keys()].every((f) => SPAWN_EXT.test(f) || path.basename(f) === "package.json"),
        "every file in the spawn corpus is a launcher or a package manifest; not one is markdown");
    for (const s of r.split.spawned) report("SPAWNED  " + s.padEnd(38), r.why.get(s) || "");
}

// ---------------------------------------------------------------------------
console.log("\n5. WHAT IS OWED, AND WHAT THIS ROUND DELIBERATELY DID NOT DO");
{
    // *** CORRECTED AT v3551: THE hasOwnGate FIX WAS A TWO-STEP PROCESS AND BOTH STEPS ARE WORTH RECORDING. ***
    // First attempt: widen hasOwnGate to "any gate consumer, any directory" -- and unclassified COLLAPSED FROM
    // 32 TO 0, because actionable() already REQUIRES consumers.every(isGate) to admit a module at all, so
    // "has a gate consumer" is guaranteed true for every actionable member and answers nothing. THE REAL FIX
    // was narrower: widen the SAME-BASENAME search to the whole tree (not just the same directory), keeping
    // the naming convention as the proxy for a DEDICATED gate rather than an incidental one. That correctly
    // moved SEVEN modules out (lib/derivedCache.js, render/depthProject.js, render/frameTrace.js,
    // tools/bench/meshPerf.mjs, tools/roundhouse/geminiRoleCaller.mjs, tools/roundhouse/modelCatalogue.mjs,
    // world/autoExtremity.js -- each has a real, working, dedicated tools/ship/<name>-selfcheck.mjs its old
    // same-directory guess could not see) and correctly LEFT these two build tools exactly where they were.
    // *** v3558: THIS LINE WENT RED AND ITS OWN ANTIDOTE NAMED THE FIX, SIXTH-PLUS COLLECTION OF v3196's IDIOM.
    // *** It asserted the two build tools sit in the `unclassified` BUCKET -- an ARRANGEMENT. v3558 gave both a
    // cliOnly classification (each carries a main block), so the bucket moved while the CLAIM did not: neither
    // has a gate BUILT FOR IT. Rewritten to the property, and it is now stronger than it was, because there are
    // TWO routes to a dedicated gate and it denies both. NOT WEAKENED, NOT DELETED.
    const noDedicated = (f) => !(r.evidence.get(f) || []).includes("hasOwnGate") &&
                               !(r.evidence.get(f) || []).includes("dedicatedGate");
    ok("!! the two build tools have NO DEDICATED GATE BY EITHER ROUTE -- name OR sole subject",
        noDedicated("tools/ship/buildKnowledgeIndex.mjs") && noDedicated("tools/ship/buildPageIndex.mjs"),
        "no file anywhere is named buildKnowledgeIndex-selfcheck.mjs or buildPageIndex-selfcheck.mjs, AND no " +
        "gate has either as its SOLE subject -- instruments-selfcheck.mjs and pageIndex-selfcheck.mjs each " +
        "test them among others. *** THE OLD FORM OF THIS LINE PINNED THE BUCKET THEY SAT IN AND WENT RED THE " +
        "MOMENT v3558 CLASSIFIED THEM cliOnly. Both are now in cliOnly (" +
        (r.split.cliOnly.includes("tools/ship/buildKnowledgeIndex.mjs") ? "yes" : "NO") + "), which is a WORK " +
        "LIST and not an exemption, and the claim about their gates is unchanged. ***");
    ok("...though the OLD CLAIM 'nothing in the tree invokes them' WAS SIMPLY WRONG, and that is worth keeping said",
        /await import\("\.\/buildKnowledgeIndex\.mjs"\)/.test(
            fs.readFileSync(path.join(ENG, "tools", "ship", "instruments-selfcheck.mjs"), "utf8")) &&
        /from "\.\/buildPageIndex\.mjs"/.test(
            fs.readFileSync(path.join(ENG, "tools", "ship", "pageIndex-selfcheck.mjs"), "utf8")),
        "instruments-selfcheck.mjs DOES call buildIndex() for real, and pageIndex-selfcheck.mjs DOES call " +
        "buildPageIndex() for real -- both compare the fresh result against the shipped artefact and fail on " +
        "staleness. THAT IS A REAL INVOCATION, just not by a gate BUILT FOR either module specifically -- " +
        "'nothing invokes them' overstated the finding. What survives, correctly narrowed: no launcher or npm " +
        "script REBUILDS the shipped artefact automatically; a person still runs these by hand each round, " +
        "and the ship ritual that says so lives in a person's notes rather than in the tree.");
    ok("no verdict is recorded for any of the unclassified", !("verdict" in MEASURED_V3548),
        "this round SORTS and does not DECIDE. Each of the " + r.split.unclassified.length + " is a judgement, " +
        "and inventing " + r.split.unclassified.length + " reasons would be FABRICATING PROVENANCE AT SCALE");
    ok("nothing here is ratcheted",
        !Object.keys(MEASURED_V3548).some((k) => /baseline|ratchet|threshold/i.test(k)),
        "the register carries measurements and two corrections; graveyard keeps the only ratchet on this " +
        "population, unchanged and still red at its baseline of 100");
}

// ---------------------------------------------------------------------------
console.log("\n6. *** SIGNAL A: A DEDICATED GATE NAMED FOR THE CONCEPT -- AND IT MUST NOT COLLAPSE THE PILE ***");
{
    // v3551 widened hasOwnGate to "any gate consumer" and unclassified went 32 -> 0, because actionable()
    // already REQUIRES consumers.every(isGate). A NEW CLASSIFIER IS GUILTY UNTIL IT IS SHOWN TO REFUSE
    // SOMETHING. Both halves are checked here rather than one.
    ok("!! it ADMITS members -- the class is not empty", r.split.dedicatedGate.length > 0,
        r.split.dedicatedGate.length + ": " + r.split.dedicatedGate.join(", "));
    ok("!! *** AND IT DOES NOT COLLAPSE THE PILE -- unclassified is still a real list ***",
        r.split.unclassified.length > 0 && r.split.unclassified.length < 25,
        r.split.unclassified.length + " remain of the 25 v3551 left. *** v3551's FIRST FIX TOOK 32 TO 0 AND " +
        "WAS CAUGHT ONLY BECAUSE THE COLLAPSE WAS IMPLAUSIBLE. A classifier that empties the list it sorts is " +
        "answering a question whose answer was guaranteed. ***");

    // THE NAMED NEGATIVE, WITH THE NUMBERS THAT REFUSE IT rather than an assertion that it is refused.
    const RD = "tools/roundhouse/run-device.mjs";
    const rdGates = [...r.subjects.entries()].filter(([, s]) => s.has(RD));
    report("gates importing run-device.mjs", rdGates.length + "; leanest subject count " +
        Math.min(...rdGates.map(([, s]) => s.size)));
    ok("!! *** THE NAMED REFUSAL: run-device.mjs is NOT credited with a dedicated gate ***",
        !r.split.dedicatedGate.includes("tools/roundhouse/run-device.mjs") &&
        (r.evidence.get("tools/roundhouse/run-device.mjs") || []).indexOf("dedicatedGate") === -1,
        "six gates import it and not one has it as its SOLE subject, so none was built FOR it -- the same " +
        "line v3551 drew refusing to credit buildKnowledgeIndex with instruments-selfcheck.mjs. A GATE THAT " +
        "TESTS THIS MODULE ALONGSIDE FIVE OTHERS IS NOT ITS GATE.");

    // NEITHER ROUTE SUBSUMES THE OTHER, which is what makes both worth having.
    const both = act.filter((f) => { const e = r.evidence.get(f) || []; return e.includes("hasOwnGate") && e.includes("dedicatedGate"); });
    const nameOnly = act.filter((f) => { const e = r.evidence.get(f) || []; return e.includes("hasOwnGate") && !e.includes("dedicatedGate"); });
    const subjOnly = act.filter((f) => { const e = r.evidence.get(f) || []; return !e.includes("hasOwnGate") && e.includes("dedicatedGate"); });
    report("agree (named AND sole-subject)", String(both.length));
    report("name convention only", String(nameOnly.length));
    report("sole subject only -- THE NEW ONES", String(subjOnly.length) + "   " + subjOnly.join(", "));
    ok("!! the two routes AGREE on a large set, so neither is a broken instrument", both.length > 10,
        both.length + " modules are reached by BOTH -- two independent routes to 'a gate was built for this " +
        "module' mostly landing together. If they agreed NOWHERE one of them would be wrong.");
    ok("!! ...and NEITHER SUBSUMES THE OTHER, so both are load-bearing",
        nameOnly.length > 0 && subjOnly.length > 0,
        nameOnly.length + " have a same-named gate that tests other modules too; " + subjOnly.length +
        " have a sole-subject gate under a DIFFERENT name. *** world/VoxelWorld.js IS THE PROOF CASE: v3550 " +
        "wrote that voxelExtremity-selfcheck.mjs 'is named for the concept rather than the class' IN PROSE, " +
        "one round ago, WHERE NOTHING RE-DERIVED IT. It is derived now. ***");
    ok("...and VoxelWorld is one of them", subjOnly.includes("world/VoxelWorld.js"),
        "the sentence v3550 left in prose is now a reading");
}

// ---------------------------------------------------------------------------
console.log("\n7. *** SIGNAL B: THE MAIN GUARD IS A PROPERTY, AND SO IS THE STRIPPER CHOICE ***");   // v3941 -- the heading said COSTS TWELVE; it cost twelve when written and costs three today, because the tree migrated the guard. The claim is about the stripper, not the count.
{
    const src = (rl) => { try { return fs.readFileSync(path.join(ENG, ...rl.split("/")), "utf8"); } catch { return ""; } };
    const SELF = /import\.meta\.url/, ENTRY = /process\.argv\[1\]|Deno\.mainModule/;
    const withStrip = (strip) => act.filter((f) => strip(src(f)).split("\n").some((l) => SELF.test(l) && ENTRY.test(l)));
    const raw = withStrip((s) => s), co = withStrip(codeOnly), nc = withStrip(noComments);
    report("raw text", String(raw.length));
    report("codeOnly (comments AND strings blanked)", String(co.length));
    report("noComments (comments only) -- SHIPPED", String(nc.length));

    // *** v3941 -- THIS PINNED THE SIZE OF THE GAP AT TEN, AND THE TREE CLOSED THE GAP. ***
    // The condition was `nc.length - co.length >= 10`: a MAGNITUDE standing in for a property, one assertion
    // above the line below that says "THE PROPERTY IS ASSERTED, NOT A SPELLING" and "A REGEX FOR ONE SPELLING
    // WOULD REPORT A STALE ANSWER ABOUT THE REST". The gap is 3 now, and the reason is the tree getting BETTER:
    // the template-literal guard is the Windows-broken form winPathGuard-selfcheck exists to ban and
    // runLive-selfcheck refuses by name, and it has been migrated out almost everywhere. So this line went red
    // because the defect it measures has been fixed -- while the CLAIM it makes, that codeOnly is the wrong
    // stripper for this idiom, is exactly as true as it ever was.
    //
    // THE CLAIM IS ABOUT THE STRIPPER, NOT ABOUT THE POPULATION, so it is demonstrated on two constructed guards
    // rather than counted over the tree. The template form is ASSEMBLED from pieces for the same reason
    // winPathGuard assembles its own pattern -- written whole it would be the banned idiom, sitting in the tree,
    // and that gate would rightly fire on it.
    const TEMPLATE_GUARD = "if (import.meta.url === " + "`file://${process.argv[1]}`" + ") { main(); }";
    const PORTABLE_GUARD = "if (import.meta.url === pathToFileURL(process.argv[1]).href) { main(); }";
    const seesGuard = (t) => t.split("\n").some((l) => SELF.test(l) && ENTRY.test(l));
    ok("!! *** codeOnly IS THE WRONG STRIPPER FOR A MAIN GUARD -- SHOWN ON THE IDIOM, NOT COUNTED OVER THE TREE ***",
        seesGuard(TEMPLATE_GUARD) && !seesGuard(codeOnly(TEMPLATE_GUARD)) && seesGuard(noComments(TEMPLATE_GUARD)) &&
        seesGuard(codeOnly(PORTABLE_GUARD)),
        "codeOnly blanks STRING LITERALS, and a template-literal guard is one -- it leaves " +
        JSON.stringify(codeOnly(TEMPLATE_GUARD)) + ", so THE ENTRY POINT VANISHES AND THE MODULE READS AS A " +
        "LIBRARY. The pathToFileURL spelling survives codeOnly because its operand is code. *** v3526's pair " +
        "from a new angle: codeOnly FOR AN IDIOM, noComments FOR TEXT THE CODE CONTAINS -- and a main guard is " +
        "AN IDIOM WHOSE OPERAND CAN LIVE IN A STRING. TRUE OF THE STRIPPER WHETHER OR NOT ANY MODULE TRIPS IT.");

    // The live gap is REPORTED, because it is a fact about today's tree and it is on its way to zero.
    const guardLine = (f) => noComments(src(f)).split("\n").find((x) => SELF.test(x) && ENTRY.test(x)) || "";
    const stillTemplate = nc.filter((f) => /`file:\/\//.test(guardLine(f)));
    const portable = nc.filter((f) => /pathToFileURL/.test(guardLine(f)));
    report("codeOnly misses, TODAY", (nc.length - co.length) + "   " +
        (nc.filter((f) => !co.includes(f)).slice(0, 4).join(", ") || "(none)") +
        " -- was 12 when this section was written. " + stillTemplate.length + " of " + nc.length +
        " actionable guards are still the template form and " + portable.length + " are pathToFileURL, which is " +
        "the migration winPathGuard asks for. THE NUMBER FALLS AS THE TREE IMPROVES, so nothing depends on it.");
    ok("...and codeOnly sees nothing noComments misses, so the choice is a strict improvement here",
        co.every((f) => nc.includes(f)), "no module is lost by keeping strings");

    // THE PROPERTY IS ASSERTED, NOT A SPELLING: six of them, and the count is DERIVED from the members.
    const spellings = new Set(nc.map((f) => {
        const l = noComments(src(f)).split("\n").find((x) => SELF.test(x) && ENTRY.test(x)) || "";
        if (/Deno\.mainModule/.test(l)) return "deno";
        if (/`file:\/\//.test(l)) return "template-literal";
        if (/await import\(/.test(l)) return "awaited-dynamic-import";
        if (/pathToFileURL/.test(l)) return "pathToFileURL";
        if (/path\.resolve/.test(l)) return "resolve-vs-fileURLToPath";
        return "fileURLToPath-vs-argv";
    }));
    report("distinct spellings of the guard, DERIVED", [...spellings].join(", "));
    ok("!! *** A REGEX FOR ONE SPELLING WOULD REPORT A STALE ANSWER ABOUT THE REST ***", spellings.size >= 5,
        spellings.size + " distinct spellings in the actionable pile alone, which is why what is asserted is " +
        "the PROPERTY -- one line names BOTH this module and the process entry point");
    ok("...and hasMainBlock() is the one declaration of it", act.every((f) => hasMainBlock(src(f)) === nc.includes(f)),
        "the shipped predicate and this section's derivation agree on all " + act.length +
        ", so there is no second copy to drift");

    // THE KNOWN LIMIT, NAMED RATHER THAN ROUTED AROUND.
    const lost = raw.filter((f) => !nc.includes(f));
    report("seen by raw text but NOT by noComments", lost.join(", ") || "(none)");
    ok("!! the stripper's own known limit is REPORTED WITH ITS NAME rather than worked around",
        lost.length <= 1,
        "*** NOT A PROSE RESCUE. *** " + (lost[0] || "-") + " has a REAL main block the lexer cannot see, " +
        "because it DESYNCS on a regex literal containing a quote -- which sourceScan's own header warns " +
        "about in its first paragraph, and this is the file most full of quote-bearing regexes. A KNOWN " +
        "LIMIT OF A SHARED PRIMITIVE. Adding a second stripper to dodge it would be the second declaration " +
        "this whole round is about.");

    // A CLI FRONT DOOR IS A WORK LIST, NOT AN EXEMPTION -- and the register says so.
    ok("!! cliOnly is recorded as a WORK LIST rather than an exemption",
        /WORK LIST, NOT AN EXEMPTION/.test(fs.readFileSync(path.join(ENG, "tools/ship/orphanTriage.mjs"), "utf8")),
        "this project's standing law is that a CLI-only deliverable is UNFINISHED. Landing here means 'give " +
        "it a page row or state why not' -- it does NOT retire the module from the pile.");
}

// ---------------------------------------------------------------------------
console.log("\n8. *** THE SORT IS A VIEW AND MUST NOT BE THE ONLY RECORD, AND THE HEADLINE IS DERIVED ***");
{
    ok("!! every actionable module carries its FULL evidence, not just the bucket that won the if-chain",
        act.every((f) => Array.isArray(r.evidence.get(f))), "evidence recorded for all " + act.length);
    ok("!! ...and modules DO carry more than one signal, so the exclusive sort was really discarding evidence",
        r.multi.length > 0,
        r.multi.length + " carry two or more. *** tools/emitStrictLibm.mjs carries BOTH NEW SIGNALS and the " +
        "if-chain shows only the first: it has a dedicated gate AND a CLI front door, and which one you see " +
        "depended on the order two lines were written in. ***");
    ok("...and the bucket a multi-signal module lands in is one of its own tags",
        r.multi.every((f) => {
            const b = Object.entries(r.split).find(([, v]) => v.includes(f));
            return b && (r.evidence.get(f) || []).includes(b[0]);
        }), "the sort narrows the evidence, it never contradicts it");

    // THE HEADLINE WAS A TYPED NUMBER, IN TWO PLACES.
    const rl = fs.readFileSync(path.join(ENG, "tools/ship/orphanTriage.mjs"), "utf8");
    const reg = fs.readFileSync(path.join(ENG, "tools/ship/reportingTools.mjs"), "utf8");
    ok("!! *** THE REPORT HEADLINE IS DERIVED, NOT TYPED ***",
        !/WHICH \d+ --/.test(codeOnly(rl)),
        "it printed the LITERAL 'WHICH 104' one line above the computed total while the tree read " + r.total +
        ". A HAND-TYPED COUNT INSIDE THE REPORT WHOSE SUBJECT IS DERIVED EVIDENCE.");
    const row = (reg.split("\n").find((l) => /orphanTriage\.mjs", label:/.test(l)) || "");
    ok("!! ...and the page row's label no longer carries a count either",
        row.length > 0 && !/\d/.test(row.replace(/orphanTriage\.mjs/, "")),
        "the SAME typed 104 sat in reportingTools' label, where a page cannot re-derive it at render time, " +
        "so the count was removed rather than raised: " + row.trim().slice(0, 90));

    ok("still no verdict on any survivor", !("verdict" in MEASURED_V3558),
        "13 remain and NOT ONE IS DECIDED HERE. The register splits them by KIND -- per-call primitives " +
        "correctly driven by their gate, against BUILT ENGINE FEATURES NOTHING WIRED (livePanel, " +
        "radarManager, lbmShader, svoGenerator, ddaFloat32), which is real debt of the ui/roundTrip.js sort " +
        "and is Keith's judgement, one at a time.");
    // *** v3673 -- REWRITTEN TO THE PROPERTY, AND IT WAS RED BEFORE THIS ROUND TOUCHED ANYTHING. *** It compared
    // a FROZEN v3558 reading (before.actionable = 105) against the LIVE classify total, so it went red the day
    // the real count moved to 104 and stayed red for the wrong reason -- A REMEMBERED RESULT STANDING IN FOR A
    // CURRENT MEASUREMENT, which is this tree's most-named shape, inside the file whose subject is derived
    // evidence. Proven pre-existing by running it against a pristine v3672 extract, not assumed.
    //
    // THE PROPERTY IT WAS REALLY PROTECTING is that this CLASSIFIER cannot move MEMBERSHIP: triage sorts the
    // actionable set into buckets and must never drop anyone out of it, because a re-categorisation that shrinks
    // the pile would read as progress. Both sides are LIVE now, so the check holds whatever the count becomes --
    // and it caught me this round: I put a door-aware `continue` into actionable() and this line went red, which
    // is exactly what it is for. The door rule moved to the ratchet that makes the claim instead.
    ok("!! the classifier sorts the actionable set and never shrinks it",
        r.total === actionable().length,
        "classify buckets " + r.total + " against actionable()'s " + actionable().length + ". CHANGING A " +
        "CLASSIFIER TO MAKE A COUNT FALL IS HOW A RATCHET STOPS MEANING ANYTHING (v3453) -- and the two are " +
        "re-derived side by side rather than one being remembered from the round that first measured it.");
}

console.log(fails ? `\norphanTriage-selfcheck: ${fails} FAILED` : "\norphanTriage-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
