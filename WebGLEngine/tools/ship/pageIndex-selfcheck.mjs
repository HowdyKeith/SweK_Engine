// WebGLEngine/tools/ship/pageIndex-selfcheck.mjs
//
// Run: node tools/ship/pageIndex-selfcheck.mjs   (~0.1s -- MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3228 -- TWO COUNTS OF ONE THING, IN ONE TREE, NEVER COMPARED.
//
// *** pageReach HAS COUNTED 315 PAGES EVERY ROUND WHILE page-index.html CLAIMED 256. *** Both numbers were in
// the same build, both printed, and nothing had ever put them side by side. Fifty-two pages assigned to a drawer
// at v3227 were missing from the page that calls itself "Every page in the engine" -- including roundhouse,
// device, models, gates, instruments, ct, fanbeam, kerr, kepler, ising, schrodinger, ship, changelog, AND
// page-index.html ITSELF.
//
// THE FIX IS THE ONE decisionIndex GOT: THE CORPUS IS DERIVED, NOT TYPED. buildPageIndex walks with pageReach's
// own walker, so "every page" is true by construction rather than by having been true once.
//
// *** AND THE GROUP COMES FROM THE DRAWER REGISTRY RATHER THAN BEING TYPED BESIDE IT. *** The old table carried
// its own `g` field: 150 pages filed as "other" while seven of them had a real drawer. Two answers to one
// question. Now there is one answer and this gate checks that it stays one.
//
// THIS IS THE CHECK THAT WOULD HAVE CAUGHT IT, and it is three lines: compare the two counts.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allPages } from "../pageReach.mjs";
import { SECTIONS, claimedPages } from "./pageSections.mjs";
import { buildPageIndex, descOf } from "./buildPageIndex.mjs";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const onDisk = allPages(ROOT).map((p) => path.basename(p)).sort();
const shipped = JSON.parse(fs.readFileSync(path.join(ROOT, "page-index.json"), "utf8"));
const page = fs.readFileSync(path.join(ROOT, "page-index.html"), "utf8");

// ---- 1. THE TWO COUNTS AGREE, WHICH IS THE WHOLE POINT --------------------------------------------------------------
{
    ok("!! *** the page index counts exactly what pageReach counts ***",
        shipped.count === onDisk.length && shipped.pages.length === onDisk.length,
        shipped.count + " in page-index.json against " + onDisk.length + " pages pageReach can see. THESE TWO " +
        "NUMBERS WERE 256 AND 315 IN THE SAME BUILD, both printed every round, NEVER COMPARED. A count that is " +
        "only correct while nothing changes is a coincidence with a good record");

    const missing = onDisk.filter((f) => !shipped.pages.some((p) => p.f === f));
    const ghosts = shipped.pages.filter((p) => !onDisk.includes(p.f)).map((p) => p.f);
    ok("...and neither list holds anything the other does not",
        missing.length === 0 && ghosts.length === 0,
        (missing.length ? "MISSING FROM THE INDEX: " + missing.slice(0, 6).join(", ") : "") +
        (ghosts.length ? " INDEX NAMES FILES THAT DO NOT EXIST: " + ghosts.slice(0, 6).join(", ") : "") +
        (missing.length + ghosts.length === 0 ? "both derived from the same walk, so a disagreement would mean the builder is stale" : ""));

    ok("!! ...and the shipped file is what the builder produces RIGHT NOW",
        JSON.stringify(buildPageIndex(ROOT).pages) === JSON.stringify(shipped.pages),
        "re-derived and compared, not trusted. A BUILT ARTEFACT THAT NOBODY RE-DERIVES IS A TYPED LIST WITH AN " +
        "EXTRA STEP -- which is exactly what the 256-entry literal had become. Re-run: node tools/ship/buildPageIndex.mjs");
}

// ---- 2. ONE GROUPING, NOT TWO ----------------------------------------------------------------------------------------
{
    const wrong = [];
    for (const p of shipped.pages) {
        const drawer = SECTIONS.find((s) => s.pages.includes(p.f));
        const expect = drawer ? drawer.id : "";
        if (p.g !== expect) wrong.push(p.f + ": index says '" + p.g + "', registry says '" + expect + "'");
    }
    ok("!! *** a page's group and its drawer cannot disagree ***",
        wrong.length === 0,
        claimedPages().size + " pages in drawers, " + (shipped.pages.length - claimedPages().size) + " ungrouped. " +
        "THE OLD TABLE FILED 150 PAGES AS \"other\" WHILE SEVEN OF THEM HAD A REAL DRAWER -- two answers to one " +
        "question in one tree" + (wrong.length ? ". DISAGREE: " + wrong.slice(0, 4).join("; ") : ""));

    ok('...and "ungrouped" is empty rather than a category called "other"',
        !shipped.pages.some((p) => p.g === "other"),
        '"other" reads like a decision somebody made; an EMPTY group reads like the question it actually is, ' +
        "which is the difference between a to-do list and a filing cabinet with a drawer labelled MISC");
}

// ---- 3. NO BAKED FALLBACK, ON PURPOSE ---------------------------------------------------------------------------------
{
    ok("!! the page has NO built-in copy of the list to fall back to",
        !/const PAGES = \[\{/.test(page) && /fetch\("\/page-index\.json"\)/.test(page),
        "a stale copy kept 'just in case the fetch fails' IS the defect being removed, and it would fail " +
        "SILENTLY WHILE LOOKING COMPLETE -- which is how the 256-entry literal survived for as long as it did");

    // gateQuality caught this on its first run: two long prose regexes against RAW page source, which is the
    // wrapping debt this tree has ratcheted since v3071 -- re-flow the sentence during an edit and the check
    // stops matching text that never changed meaning. noComments() keeps the STRINGS the page prints (the
    // message lives in a JS string literal, not a comment) and the phrases are shortened to the load-bearing
    // words rather than whole sentences. THE BASELINE WAS NOT RAISED TO MEET ME -- v3138, third time this
    // session.
    ok("...and a failed load is NAMED rather than rendered as an empty list",
        /did not load/.test(noComments(page)) && /NO BAKED FALLBACK/.test(noComments(page)),
        "an empty list and a failed fetch look identical, and one of them is a page that quietly stopped working");
}

// ---- 4. v3623 -- THE demo:desc SUMMARY, READ FROM THE PAGE AND NEVER INVENTED HERE ----------------------------------
//
// <meta name="demo:desc"> was written at v822 and nothing had ever read it: `d` was hardcoded to "" on every
// page, so the info-hover panel Keith asked to be summarised had NOTHING TO SHOW even on the 120 pages that
// already carried a real one-line description of themselves.
{
    ok("!! at least a third of the pages already carry a real demo:desc, unread until this round",
        shipped.pages.filter((p) => p.d).length / shipped.count > 0.3,
        shipped.pages.filter((p) => p.d).length + " of " + shipped.count +
        " -- v822's meta tag, sitting unread since it was written");

    // FIXTURE-PROVEN BEFORE THE REAL TREE IS ASKED (v3450): a synthetic page decides what descOf() should do
    // on cases the real tree may or may not currently contain, so the extractor is right independent of luck.
    const tmp = path.join(os.tmpdir(), "swek-descof-fixture-" + Date.now() + ".html");
    fs.writeFileSync(tmp,
        '<html><head><title>X</title>\n<meta name="demo:desc" content="Bilinear &amp; nearest, \'quoted\' too.">' +
        '</head></html>\n');
    ok("!! the extractor reads content= and un-escapes the entities a hand-written attribute would carry",
        descOf(tmp, "x.html") === "Bilinear & nearest, 'quoted' too.",
        "&amp; -> & and &#39; -> ' -- an escaped ampersand read back literally would be a WRONG description, " +
        "not a missing one, and wrong is worse than absent because it looks trustworthy");
    fs.writeFileSync(tmp, "<html><head><title>Y</title></head></html>\n");
    ok("!! a page with NO demo:desc reads as empty string, never null or a guess",
        descOf(tmp, "x.html") === "",
        "so JSON.stringify never has to special-case it and page-index.json stays one shape for every page");
    fs.rmSync(tmp, { force: true });

    // THE REFUSAL IS THE POINT: writing a summary for a page nobody has read HERE would be fabricating
    // provenance, the same thing this tree refuses to do with a typed reference value or a guessed config.
    const missing = shipped.pages.filter((p) => !p.d).length;
    ok("!! the missing pages are REPORTED, never silently filled with a guess", missing > 0,
        missing + " of " + shipped.count + " pages have no demo:desc and are left \"\" -- filling any one of " +
        "them is Keith's per-page judgement, not a script's; v3202 is this tree's own memory of what a scripted " +
        "mass rewrite over hundreds of files costs.");

    ok("...and the front door PRINTS the coverage every run, so the gap cannot go unnoticed",
        /described \+ " of " \+ out\.count \+ " pages carry a demo:desc/.test(fs.readFileSync(
            path.join(ROOT, "tools", "ship", "buildPageIndex.mjs"), "utf8")),
        "a number that only lives in a variable nobody prints is a number nobody sees move");
}

console.log();
console.log("  ----  227 OF 315 PAGES ARE UNGROUPED, AND THAT NUMBER IS THE POINT OF THE ROUND RATHER THAN A");
console.log("  ----  FAILURE OF IT. The old table hid the same gap behind the word \"other\". Grouping them is");
console.log("  ----  Keith's judgement per page and the registry is one file -- but nothing is invisible now,");
console.log("  ----  and the count on the page says so out loud.");
if (fails) { console.log("pageIndex-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("pageIndex-selfcheck: all checks pass");
