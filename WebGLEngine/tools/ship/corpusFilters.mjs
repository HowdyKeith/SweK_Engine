// WebGLEngine/tools/ship/corpusFilters.mjs -- v3614
// ---------------------------------------------------------------------------------------------------------------
// TWO FILTERS ARE THE SAME FILTER IF THEY ADMIT THE SAME FILES, WHATEVER THEY LOOK LIKE -- AND NOBODY HAD EVER
// GROUPED THEM THAT WAY.
//
// The open list has carried this for many rounds: "NINE callers still spell the corpus filter by hand instead
// of importing moduleRefs' SOURCE_EXT. COUNTED WITH AN ANTIDOTE: the number may only FALL." The antidote was
// right and THE NUMBER WAS THE PROBLEM. Derived by extracting every extension-shaped regex literal from
// tools/**.mjs and RUNNING each over the tree:
//
//     155 FILTER SITES, 33 DISTINCT ADMITTED SETS.
//
// So "nine" was never a count of anything you could act on. What it hid is three different situations that a
// single number cannot tell apart, and the grouping separates them without any naming heuristic -- purely by
// which files each regex lets through.
//
// ================================================================================================================
// FINDING 1: THE REAL SOURCE_EXT DEBT IS SPELLED TWO WAYS, WHICH IS THE PROOF THAT SPELLING IS NOT MEANING
// ================================================================================================================
//
//     3181 files   2 spellings across 12 files    \.(mjs|js|html)$    and    \.(js|mjs|html)$
//
// One set, two texts, differing only in the order of the alternatives. A census that grouped by SPELLING would
// call these two different filters; a census that groups by ADMITTED SET calls them one, which is what they
// are. THESE ARE THE GENUINE IMPORT-SOURCE_EXT CANDIDATES, and there are twelve files rather than nine.
//
// ================================================================================================================
// FINDING 2, THE DANGEROUS ONE: TWENTY FILES SCAN A CORPUS THAT SILENTLY OMITS EVERY HTML FILE
// ================================================================================================================
//
//     2826 files   4 spellings across 20 files    \.(js|mjs)$  |  \.mjs$|\.js$  |  \.m?js$  |  \.(mjs|js)$
//
// SOURCE_EXT admits 3181. This group admits 2826 -- IT MISSES ALL 355 HTML FILES IN THE TREE. *** THE TOTALS
// MOVE BY ONE WHEN THIS FILE LANDS, BECAUSE THE CENSUS IS ITSELF A FILE IN THE TREE IT WALKS -- correct, and
// stated so nobody wonders. THE SHORTFALL IS THE INVARIANT: 355 html, whatever the totals do. *** It is a PURE
// EXTENSION FILTER, so it is asking the same KIND of question as SOURCE_EXT and answering it over a corpus
// 11% smaller. *** ANY COUNT PRODUCED BY THOSE TWENTY TOOLS IS NOT COMPARABLE WITH A COUNT FROM A SOURCE_EXT
// TOOL, AND NOTHING IN THE TREE SAYS SO. *** That is the two-declarations defect this lab keeps finding, in
// the denominator rather than in the numerator -- and FOUR SPELLINGS of it, so the drift happened four times
// independently.
//
// ================================================================================================================
// FINDING 3: A LONG TAIL OF CORPORA EACH USED BY EXACTLY ONE FILE
// ================================================================================================================
//
//     4104   \.[^.]*$                                                     (anything with an extension)
//     3885   \.(mjs|js|jsx|ts|py|sh|bat|json|md|html|css|glsl|vert|frag)$
//     3594   \.(js|mjs|html|md)$
//     3348   \.(js|mjs|html|json|sh|bat|command)$
//     1736   \.(html|js)$
//
// EACH OF THESE IS ONE SPELLING IN ONE FILE. They are not wrong -- a launcher lint genuinely wants .bat, a
// prose audit genuinely wants .md -- but it means NO TWO TOOLS IN THE TAIL AGREE ON WHAT "THE TREE" MEANS, so
// a number from one is a number about a different population than a number from the next.
//
// ================================================================================================================
// THE DISCRIMINATOR IS DERIVED, NOT NAMED
// ================================================================================================================
//
// "Is this asking the same kind of question as SOURCE_EXT?" is answered without any list of blessed names: a
// filter is a PURE EXTENSION FILTER when the set it admits is EXACTLY the set of all files in the tree whose
// extension appears among the admitted ones. `-selfcheck\.mjs$` admits 938 files that are all .mjs, but the
// tree has 1445 .mjs files, so it is NOT pure -- it is a NAME filter asking a different question, and it is
// correctly hand-spelled. `\.(js|mjs)$` IS pure, so it is a corpus filter, and its 355-file shortfall matters.
//
// A KNOWN LIMIT, REPORTED BY NAME. The extractor is a HEURISTIC -- "a regex literal containing an escaped dot
// and anchored at the end" is how this tree spells a file filter, but it also catches fragments that are not
// filters at all, and one group admits ZERO files from twenty sites. That group is a reading about THE
// EXTRACTOR, not about the tree, and it is left visible rather than filtered away: a census that silently
// dropped its own misses would be claiming a precision it does not have.
//
// WHAT IS NOT CLAIMED: that the twelve should be swept. v3202 is why -- one script that rewrote a whole class
// of call sites deleted 61 live modules. The census REPORTS; each change is a judgement, one at a time, and
// the antidote below says which direction the numbers may move.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { SOURCE_EXT } from "./moduleRefs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENGINE = path.join(HERE, "..", "..");
export const SELF = path.relative(ENGINE, fileURLToPath(import.meta.url)).split(path.sep).join("/");
export const noComments = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const walk = (dir, keep) => {
    const out = [];
    (function rec(d) {
        let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { if (!/node_modules|\.git/.test(e.name)) rec(p); continue; }
            const rel = path.relative(ENGINE, p).split(path.sep).join("/");
            if (!keep || keep(e.name)) out.push(rel);
        }
    })(dir);
    return out;
};

export const treeFiles = () => walk(ENGINE, null);
export const extOf = (f) => { const i = f.lastIndexOf("."); return i < 0 ? "" : f.slice(i + 1); };

/**
 * EXTENSION-SHAPED REGEX LITERALS, EXTRACTED FROM SOURCE. A literal that contains an escaped dot and is
 * anchored at the end is how this tree spells "which files count". Comments are stripped first -- v3609's
 * lesson, where a sentence DESCRIBING a detector registered as an instance of it.
 */
export function filterSites(dir = path.join(ENGINE, "tools")) {
    const out = [];
    for (const rel of walk(dir, (n) => /\.mjs$/.test(n))) {
        if (rel === SELF) continue;                     // BY IDENTITY: this file quotes every spelling it finds
        const src = noComments(fs.readFileSync(path.join(ENGINE, rel), "utf8"));
        for (const m of src.matchAll(/\/((?:[^/\\\n]|\\.)*\\\.(?:[^/\\\n]|\\.)*\$)\/[gimsuy]*/g)) out.push({ file: rel, src: m[1] });
    }
    return out;
}

/** Group by WHAT THEY ADMIT. The hash of the sorted admitted list is the identity of a filter. */
export function groupByAdmitted(sites = filterSites(), files = treeFiles()) {
    const groups = new Map();
    for (const s of sites) {
        let re; try { re = new RegExp(s.src); } catch { continue; }
        const admitted = files.filter((f) => re.test(f));
        const key = crypto.createHash("sha256").update(admitted.join("\n")).digest("hex").slice(0, 12);
        if (!groups.has(key)) groups.set(key, { key, count: admitted.length, admitted, spellings: new Set(), files: new Set() });
        const g = groups.get(key);
        g.spellings.add(s.src); g.files.add(s.file);
    }
    return [...groups.values()].sort((a, b) => b.count - a.count);
}

/**
 * PURE EXTENSION FILTER, DERIVED: the admitted set is exactly every file in the tree carrying one of the
 * extensions the set contains. No list of blessed names anywhere -- a NAME filter fails this because the tree
 * holds files of the same extension it does not admit.
 */
export function isPureExtension(group, files = treeFiles()) {
    const exts = new Set(group.admitted.map(extOf));
    const closure = files.filter((f) => exts.has(extOf(f)));
    return closure.length === group.count;
}

export function census(files = treeFiles()) {
    const groups = groupByAdmitted(filterSites(), files);
    const source = new Set(files.filter((f) => SOURCE_EXT.test(f)));
    return groups.map((g) => {
        const set = new Set(g.admitted);
        const misses = [...source].filter((f) => !set.has(f));
        const extra = g.admitted.filter((f) => !source.has(f));
        return {
            count: g.count, spellings: [...g.spellings], files: [...g.files],
            pure: isPureExtension(g, files),
            identicalToSourceExt: misses.length === 0 && extra.length === 0,
            missesFromSourceExt: misses.length, admitsBeyondSourceExt: extra.length,
            missedExtensions: [...new Set(misses.map(extOf))].sort(),
        };
    });
}

export const MEASURED_V3614 = {
    sites: 155, distinctSets: 33,
    sourceExtGroup: { files: 12, spellings: 2 },
    theDangerousGroup: { files: 20, spellings: 4, missesHtml: 355 },
    totalsMoveByOne: "the census walks a tree that CONTAINS the census, so every total rises by one when this " +
        "file lands. The SHORTFALL (355 html) is the invariant and is what the gate asserts.",
    verdict: "155 FILTER SITES, 33 DISTINCT ADMITTED SETS -- so the open list's 'nine callers' was never a " +
        "count anybody could act on. Grouped by WHAT THEY ADMIT rather than how they are spelled: the genuine " +
        "SOURCE_EXT set is spelled TWO ways across TWELVE files, and a second group of TWENTY files with FOUR " +
        "spellings scans a corpus that SILENTLY OMITS EVERY HTML FILE -- 2826 against 3181, 11% smaller. ANY " +
        "COUNT FROM THOSE TWENTY IS NOT COMPARABLE WITH A COUNT FROM A SOURCE_EXT TOOL, and nothing said so.",
    theDiscriminator: "PURE EXTENSION FILTER is derived, never named: the admitted set equals every file in " +
        "the tree carrying one of the extensions it admits. `-selfcheck\\.mjs$` admits 938 files all of which " +
        "are .mjs while the tree holds 1445, so it is a NAME filter asking a different question and is " +
        "correctly hand-spelled. `\\.(js|mjs)$` is pure, so its shortfall is a corpus difference and matters.",
    knownLimit: "the extractor is a HEURISTIC and catches fragments that are not filters -- one group admits " +
        "ZERO files from twenty sites, which is a reading about the EXTRACTOR and is left visible rather than " +
        "filtered away.",
    notClaimed: "that the twelve should be SWEPT. v3202 is why -- one script rewriting a whole class of call " +
        "sites deleted 61 live modules. This REPORTS; each change is a judgement, one at a time.",
};

export function reportLines() {
    const L = [], say = (s) => L.push(s);
    const files = treeFiles(), rows = census(files);
    say("[corpusFilters] two filters are the same filter if they admit the same files");
    say("");
    say("  " + filterSites().length + " filter sites in tools/, " + rows.length + " DISTINCT ADMITTED SETS over " +
        files.length + " files walked");
    say("");
    say("  admits   sites  spellings  kind              vs SOURCE_EXT");
    for (const r of rows.slice(0, 12)) {
        const kind = r.identicalToSourceExt ? "SOURCE_EXT" : r.pure ? "pure extension" : "name filter";
        // *** v4461 -- A ROW CAN DO BOTH, AND THE else-if REPORTED ONLY THE FIRST HALF. *** Over-admitting and
        // under-admitting are independent facts about a filter, and this chain treated them as alternatives:
        // any row with admitsBeyondSourceExt > 0 printed that and NEVER reached the MISSES branch. MEASURED:
        // 37 of 46 rows miss something, and rows 9, 10 and 11 -- inside the twelve this report prints -- miss
        // ALL 456 HTML FILES while also admitting a few extras, so they showed as "admits N it does not" and
        // the html shortfall vanished from the output. THAT SHORTFALL IS THIS FILE'S WHOLE SUBJECT: its header
        // opens "IT MISSES ALL 355 HTML FILES IN THE TREE" (355 then, 456 now). A gate asserting the report
        // names it had been red, correctly, and the report was the thing that was wrong.
        const parts = [];
        if (r.admitsBeyondSourceExt > 0) parts.push("admits " + r.admitsBeyondSourceExt + " it does not");
        if (r.missesFromSourceExt > 0) parts.push("MISSES " + r.missesFromSourceExt + " (" + r.missedExtensions.join(",") + ")");
        const rel = r.identicalToSourceExt ? "identical" : parts.join(", ");
        say("  " + String(r.count).padStart(6) + String(r.files.length).padStart(7) + String(r.spellings.length).padStart(10) +
            "  " + kind.padEnd(16) + "  " + rel);
    }
    say("");
    const src = rows.find((r) => r.identicalToSourceExt);
    if (src) say("  THE GENUINE SOURCE_EXT DEBT: " + src.files.length + " files, " + src.spellings.length +
        " spellings -- " + src.spellings.join("  |  ") + "   ONE SET, TWO TEXTS.");
    const danger = rows.filter((r) => r.pure && !r.identicalToSourceExt && r.admitsBeyondSourceExt === 0 && r.missesFromSourceExt > 0);
    say("  PURE EXTENSION FILTERS NARROWER THAN SOURCE_EXT (a count from these is not comparable):");
    for (const d of danger.slice(0, 4))
        say("    " + String(d.count).padStart(6) + " files in " + String(d.files.length).padStart(2) + " tools, missing " +
            d.missesFromSourceExt + " (" + d.missedExtensions.join(",") + ")   " + d.spellings.slice(0, 4).join(" | "));
    say("");
    const empty = rows.filter((r) => r.count === 0);
    if (empty.length) say("  KNOWN LIMIT: " + empty.reduce((a, r) => a + r.files.length, 0) +
        " extracted literals admit NOTHING -- fragments the heuristic caught, reported rather than filtered away.");
    say("");
    say("  " + MEASURED_V3614.verdict);
    say("  THE DISCRIMINATOR: " + MEASURED_V3614.theDiscriminator);
    say("  NOT CLAIMED: " + MEASURED_V3614.notClaimed);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
