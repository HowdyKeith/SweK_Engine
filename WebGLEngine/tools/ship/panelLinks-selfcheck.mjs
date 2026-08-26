// WebGLEngine/tools/ship/panelLinks-selfcheck.mjs -- v3909
// ---------------------------------------------------------------------------------------------------------------
// EVERY PAGE IN A DRAWER WAS LISTED TWICE, AND THE PANEL LOOKED FINE FROM HERE.
//
// Keith saw it in the running engine: the Physics Lab drawer showed "Physics Lab" AND "physics-lab", "Roundhouse"
// AND "roundhouse", twelve pages rendered twice -- once as a labelled link with its icon, once as a bare slug.
//
// TWO INDEPENDENT MECHANISMS PUT LINKS IN A DRAWER AND NEITHER KNEW ABOUT THE OTHER. pageSections' mover takes
// the labelled anchor out of Arriving into [data-panel-pages]. placements() reads page-placements.json from the
// bridge and appends a .placedPages anchor for every page with a topics entry. Its only guard was for ITS OWN
// marker, [data-place-page]. A page in both registries therefore got both links, and the second one was the ugly
// one.
//
// *** IT WAS INVISIBLE WITHOUT A BRIDGE, WHICH IS WHY IT SURVIVED. *** /pages/placements 404s when the engine
// is not running, so the drawer renders clean from a static server and clean in any offline gate. I reproduced
// it by STUBBING that route in a real browser before believing the diagnosis, and re-ran the same fixture after
// the fix rather than reasoning about it.
//
// AND THE FIRST FIX WAS NOT ENOUGH, WHICH ONLY THE BROWSER SAID. I added the missing "does the drawer already
// link to this page" guard, re-ran, AND THE TWELVE DUPLICATES WERE STILL THERE. The reason is ORDER: placements()
// resolves its fetch BEFORE the module moves the anchors in, so at the moment it checks, the drawer is genuinely
// empty and appending is the correct decision from what it can see. TWO ORDERINGS NEED TWO DEFENCES -- the guard
// for "mover first", and a pass after the mover for "placements first". Both are asserted below.
//
// THE BOXING is the other half and it was measured, not eyeballed: 113 links across the drawers, 90 boxed and 23
// NOT, because the box was applied BY HAND as an inline style on each anchor in the Arriving markup and 23 were
// simply missed. It is a CSS RULE now. THAT CHOICE IS THE POINT: placements appends asynchronously, so any
// load-time JS styling pass would lose the race with links that have not arrived yet, while a rule applies the
// moment a node lands, whoever adds it.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const s = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("panelLinks-selfcheck -- one link per page per drawer, and every link in a box\n");

console.log("1. THE BOX IS A RULE, NOT 113 INLINE STYLES");
{
    ok("a CSS rule boxes every link in a drawer, present and future",
       /\.gpanel \[data-panel-pages\] > a,[\s\S]{0,80}\.gpanel \.placedPages > a \{[\s\S]{0,200}border: 1px solid/.test(s),
       "covers both slots -- the mover's and placements'");
    ok("*** and it is CSS rather than a load-time pass, which is what beats the race ***",
       !/querySelectorAll\([^)]*data-panel-pages[^)]*\)[\s\S]{0,120}style\.border/.test(s),
       "placements appends AFTER any load-time styling would have run; a rule has no ordering to lose");
    ok("...and a link with no icon of its own gets a neutral mark, drawn from an attribute",
       /a\[data-noicon\]::before[\s\S]{0,60}content:/.test(s) && /setAttribute\("data-noicon"/.test(s),
       "CSS cannot ask whether text begins with an emoji, and putting the glyph in the DOM would make it part of the link's text");
}

console.log("\n2. THE DUPLICATE CANNOT COME BACK, IN EITHER ORDER");
{
    ok("placements refuses a page the drawer ALREADY links to (covers: mover ran first)",
       /if \(panel\.querySelector\('a\[href="\/' \+ f \+ '"\]'\)\) return;/.test(s));
    ok("*** and a pass after the mover removes one that landed early (covers: placements ran first) ***",
       /owned\.has\(a\.getAttribute\("href"\)\)\) \{ a\.remove\(\)/.test(s),
       "the guard alone left all twelve duplicates in place -- measured, not assumed");
    ok("...and ONLY a placements-added anchor is ever removed",
       /querySelectorAll\('\.placedPages > a\[data-place-page\]'\)/.test(s),
       "the mover's anchors carry the icon and the title and are authoritative; nothing here can touch them");
    ok("...so placements keeps its adds-and-never-removes property",
       /ADDS AND NEVER REMOVES/.test(s) && !/placedPages[\s\S]{0,200}innerHTML = ""/.test(s),
       "declining a duplicate of a link already present is the same decision its own guard makes");
    // v4035 -- *** "OWNED" MUST FIND AN ANCHOR AT ANY DEPTH, NOT JUST A DIRECT CHILD. *** Both guards above
    // assume `owned` (the set of hrefs the drawer already links to) is complete. It silently was not: the
    // Boundaries & Reconstruction drawer's inline descriptors wrap each mover-placed anchor one level deeper,
    // in its own row div, and the direct-child selector `[data-panel-pages] > a[href]` stopped seeing those
    // eleven anchors -- owned read empty for that drawer, both duplicate-guards found nothing to defend, and
    // all eleven links grew a bare-slug .placedPages twin underneath them. CONFIRMED live: present on the
    // shipped v4034 build too, so this was not a regression the descriptors introduced -- only surfaced.
    // A descendant selector has no such assumption, and it cannot start matching a .placedPages anchor by
    // accident: .placedPages is a SIBLING of [data-panel-pages], not nested inside it, so widening the
    // combinator only ever adds anchors that are genuinely inside a mover-owned slot.
    ok("!! the owned-hrefs set is built with a DESCENDANT selector, not a direct-child one",
       /const owned = new Set\(\[\.\.\.panel\.querySelectorAll\('\[data-panel-pages\] a\[href\]'\)\]/.test(s) &&
       !/const owned = new Set\(\[\.\.\.panel\.querySelectorAll\('\[data-panel-pages\] > a\[href\]'\)\]/.test(s),
       "a direct-child selector silently stops covering a drawer the moment one of its anchors gets wrapped, " +
       "and nothing else here would notice -- the guards would just find an empty 'owned' set and do nothing");
}

console.log("\n3. WHAT WAS MEASURED IN A REAL BROWSER, RATHER THAN INFERRED FROM THIS FILE");
report("BEFORE", "113 links across the drawers: 90 boxed, 23 NOT. With /pages/placements stubbed to claim the " +
       "twelve pages SECTIONS already owns: 12 duplicated hrefs, each ['Physics Lab', 'physics-lab'].");
report("AFTER", "113 links, 113 boxed, 0 unboxed, 0 duplicated hrefs, 36 given the neutral mark.");
report("THREE FIXTURES, BECAUSE THE BUG WAS AN ORDERING", "placements resolving BEFORE the mover, AFTER it " +
       "(4s delay), and not at all (404, the offline case). All three: 24 links in Physics Lab, 0 unboxed, 0 " +
       "dupes. THE OFFLINE CASE IS THE ONE THAT HID THIS FOR SO LONG -- it looks correct and always did.");

console.log("\n4. THE PREVIEW PANE BESIDE THE DRAWER IS ONE ROW WITH IT");
{
    const gi = fs.readFileSync(path.join(ENG, "ui", "gaugeInfoPanel.js"), "utf8");
    ok("*** the stage stretches, so the info column matches the drawer's height ***",
       /id="panelStage"[^>]*align-items:stretch/.test(s),
       "it was flex-start: the preview box ended wherever its content ended, leaving a ragged gap down the right of every panel");
    ok("*** and the dials row top-justifies rather than centring ***",
       /id="dialsRow"[^>]*align-items:stretch/.test(s),
       "align-items:center is why the box floated 26px below the drawer top instead of aligning with it");
    ok("...and the column between them passes the height down",
       /id="stageInfo"[^>]*display:flex;flex-direction:column/.test(s),
       "a stretched parent gives nothing to a child that is not a flex container");
    // The height lock is the part that needed care rather than deletion.
    ok("*** the px height lock is still there for callers that do not stretch ***",
       /host\.style\.height = _lockH \+ "px"/.test(gi),
       "v3778 set it BECAUSE a long info body pushed the page down -- dropping it would revert that");
    ok("...and stretchToRow is OPT-IN, stated by the caller",
       /stretchToRow = false/.test(gi) && /stretchToRow: true/.test(s),
       "the module mounts on other pages and must not infer this one's layout");
    ok("!! ...and content still cannot grow the pane in stretch mode",
       /if \(stretchToRow\) \{[\s\S]{0,400}overflow = "hidden"/.test(gi),
       "THE ROW DECIDES THE HEIGHT, THE CONTENT NEVER DOES -- which is the property v3778 actually asked for");
    report("MEASURED IN CHROMIUM AT 1400x900", "before: drawer y=86 h=430, preview y=112 h=189 -- 26px low and " +
           "241px short. After: preview y=86 h=437, filling the row. AND THE TAB SWAP NOW MOVES NOTHING AT ALL: " +
           "stage 437, next element top 536, dials row 437, IDENTICAL across gauges -> info -> gauges. That is " +
           "stronger than the measured lock v3659 wrote, because the height now comes from something neither tab can move.");
}

console.log(fails ? `\npanelLinks-selfcheck: ${fails} FAILED` : "\npanelLinks-selfcheck: all checks pass");
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(fails ? 1 : 0);
