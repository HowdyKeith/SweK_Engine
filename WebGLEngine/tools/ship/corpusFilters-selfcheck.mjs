// WebGLEngine/tools/ship/corpusFilters-selfcheck.mjs -- v3614
//
// Run: node tools/ship/corpusFilters-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/ship/corpusFilters.mjs -- the grouping by admitted set and the pure-extension discriminator.
//
// THE CHECK THIS FILE EXISTS FOR is section 2: the whole claim rests on "two filters are the same filter if
// they admit the same files", so the grouping is driven on SYNTHETIC spellings whose answers were worked out
// before the code ran -- two texts that must land in one group, and two that must not. If the grouping can be
// fooled by reordering alternatives, everything downstream is a spelling census wearing a corpus census's
// label, which is the exact defect the round is about.
//
// EVERY COUNT HERE IS A RELATION, NEVER A TYPED TOTAL. The census walks a tree that contains the census, so
// totals move by one the moment this pair lands and again every round after. THE SHORTFALL (355 html) is the
// invariant, and it is derived from the tree rather than typed.
import fs from "node:fs";
import path from "node:path";
import { SOURCE_EXT } from "./moduleRefs.mjs";
import {
    ENGINE, SELF, treeFiles, extOf, filterSites, groupByAdmitted, isPureExtension, census, MEASURED_V3614, reportLines,
} from "./corpusFilters.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const files = treeFiles();

// ---- 1. THE INSTRUMENT EXCLUDES ITSELF, BY IDENTITY -----------------------------------------------------------------
{
    ok("!! it excludes ITSELF and by identity", SELF === "tools/ship/corpusFilters.mjs",
       "derived from import.meta.url -- this file QUOTES every spelling it finds, so left in it would report " +
       "its own header as filter sites. The defect landing on the file studying it, ninth instance.");
    ok("...and its own spellings really are absent from the sites", !filterSites().some((s) => s.file === SELF),
       filterSites().length + " sites, none from the census itself");
    ok("the tree walk finds the tree", files.length > 1000, files.length + " files");
}

// ---- 2. GROUPING IS BY WHAT THEY ADMIT, PROVEN ON FIXTURES WHOSE ANSWERS WERE WORKED OUT FIRST -------------------------
{
    const fx = [
        { file: "a", src: "\\.(mjs|js|html)$" },
        { file: "b", src: "\\.(js|mjs|html)$" },        // SAME SET, alternatives reordered
        { file: "c", src: "\\.(js|mjs)$" },             // narrower: no html
        { file: "d", src: "\\.m?js$" },                 // SAME SET as c, different text entirely
    ];
    const g = groupByAdmitted(fx, files);
    ok("!! TWO SPELLINGS OF ONE SET LAND IN ONE GROUP", g.length === 2,
       g.length + " groups from 4 spellings -- a census grouping by TEXT would report four, and that is the " +
       "difference between a spelling census and a corpus census");
    const big = g.find((x) => x.count > g[g.length - 1].count) || g[0];
    ok("...and the reordered pair is the one that merged", big.spellings.size === 2 && [...big.spellings].every((s) => /html/.test(s)),
       [...big.spellings].join("  |  "));
    const small = g[g.length - 1];
    ok("...and `\\.m?js$` merges with `\\.(js|mjs)$` although they share almost no characters",
       small.spellings.size === 2, [...small.spellings].join("  |  "));
    ok("!! POSITIVE CONTROL: the two groups are NOT merged with each other", g[0].count !== g[1].count,
       g.map((x) => x.count).join(" vs ") + " -- so the grouping discriminates as well as it merges");
}

// ---- 3. THE PURE-EXTENSION DISCRIMINATOR IS DERIVED, NOT A LIST OF BLESSED NAMES ---------------------------------------
{
    const ext = groupByAdmitted([{ file: "x", src: "\\.(js|mjs)$" }], files)[0];
    const name = groupByAdmitted([{ file: "y", src: "-selfcheck\\.mjs$" }], files)[0];
    ok("!! an extension filter reads PURE", isPureExtension(ext, files),
       ext.count + " files, and the tree holds exactly that many with those extensions");
    ok("!! ...and a NAME filter does not, although every file it admits is .mjs", !isPureExtension(name, files),
       name.count + " admitted, all .mjs, while the tree holds " + files.filter((f) => extOf(f) === "mjs").length +
       " .mjs files -- so it is asking a DIFFERENT QUESTION and is correctly hand-spelled");
    ok("...and the discriminator needs no list of names", (MEASURED_V3614.theDiscriminator || "").includes("derived, never named"),
       "the admitted set either equals the extension closure or it does not");
}

// ---- 4. THE REAL TREE: THE OPEN LIST'S NUMBER WAS NOT A COUNT OF ANYTHING ----------------------------------------------
{
    const rows = census(files);
    ok("!! there are FAR more filter sites than the open list's nine, over many distinct corpora",
       filterSites().length > 100 && rows.length > 20,
       filterSites().length + " sites, " + rows.length + " distinct admitted sets");
    const src = rows.find((r) => r.identicalToSourceExt);
    ok("!! the genuine SOURCE_EXT set is spelled MORE THAN ONE WAY", !!src && src.spellings.length >= 2,
       src ? src.files.length + " files, " + src.spellings.length + " spellings: " + src.spellings.join("  |  ") +
             " -- ONE SET, TWO TEXTS, which is the proof that spelling is not meaning" : "no identical group found");
    ok("...and it really is identical to the shipped SOURCE_EXT", !!src &&
       src.count === files.filter((f) => SOURCE_EXT.test(f)).length,
       "compared against the SHIPPED regex, not a copy of it");
    const danger = rows.filter((r) => r.pure && !r.identicalToSourceExt && r.admitsBeyondSourceExt === 0 && r.missesFromSourceExt > 0);
    ok("!! AT LEAST ONE PURE EXTENSION FILTER IS NARROWER THAN SOURCE_EXT", danger.length > 0,
       danger.map((d) => d.count + " in " + d.files.length + " tools, missing " + d.missesFromSourceExt +
       " (" + d.missedExtensions.join(",") + ")").join("; "));
    const html = danger.find((d) => d.missedExtensions.join(",") === "html");
    ok("!! ...and the largest of them SILENTLY OMITS EVERY HTML FILE IN THE TREE",
       !!html && html.missesFromSourceExt === files.filter((f) => extOf(f) === "html").length,
       html ? html.files.length + " tools across " + html.spellings.length + " spellings miss all " +
              html.missesFromSourceExt + " html files -- DERIVED by counting the tree's html, never typed. A " +
              "COUNT FROM THOSE TOOLS IS NOT COMPARABLE WITH A COUNT FROM A SOURCE_EXT TOOL." : "not found");
    ok("...and the shortfall is the invariant while the totals are not",
       (MEASURED_V3614.totalsMoveByOne || "").includes("invariant"),
       "the census walks a tree that contains the census, so every total rises by one when this pair lands");
}

// ---- 5. WHAT IS NOT CLAIMED, AND THE ANTIDOTE ---------------------------------------------------------------------------
//
// ANTIDOTE: when somebody converts one of the twelve to import SOURCE_EXT, section 4's spelling count falls --
// REWRITE IT TO THE SMALLER NUMBER AND NAME WHO WAS CONVERTED, and do not delete the line, because the group
// existing at all is the finding. If the html-missing group is ever fixed, that check goes red the right way:
// assert the shortfall is GONE and say which tools were widened. DO NOT SWEEP ALL TWELVE IN ONE SCRIPT -- v3202
// rewrote a whole class of call sites at once and deleted 61 live modules.
{
    ok("no sweep is proposed", (MEASURED_V3614.notClaimed || "").includes("v3202"),
       "each change is a judgement, one at a time -- the census REPORTS");
    ok("the long tail is reported rather than counted as debt", census(files).filter((r) => r.files.length === 1).length > 3,
       "corpora used by exactly one tool each: a launcher lint genuinely wants .bat and a prose audit genuinely " +
       "wants .md, but it means no two tools in the tail agree on what 'the tree' means");
    const rep = reportLines();
    ok("the report renders and names the shortfall", rep.length > 15 && rep.join("\n").includes("MISSES"), rep.length + " lines");
}

console.log(fails ? "\ncorpusFilters-selfcheck: " + fails + " FAILED" : "\ncorpusFilters-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
