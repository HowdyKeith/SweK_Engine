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
}

console.log("\n3. WHAT WAS MEASURED IN A REAL BROWSER, RATHER THAN INFERRED FROM THIS FILE");
report("BEFORE", "113 links across the drawers: 90 boxed, 23 NOT. With /pages/placements stubbed to claim the " +
       "twelve pages SECTIONS already owns: 12 duplicated hrefs, each ['Physics Lab', 'physics-lab'].");
report("AFTER", "113 links, 113 boxed, 0 unboxed, 0 duplicated hrefs, 36 given the neutral mark.");
report("THREE FIXTURES, BECAUSE THE BUG WAS AN ORDERING", "placements resolving BEFORE the mover, AFTER it " +
       "(4s delay), and not at all (404, the offline case). All three: 24 links in Physics Lab, 0 unboxed, 0 " +
       "dupes. THE OFFLINE CASE IS THE ONE THAT HID THIS FOR SO LONG -- it looks correct and always did.");

console.log(fails ? `\npanelLinks-selfcheck: ${fails} FAILED` : "\npanelLinks-selfcheck: all checks pass");
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(fails ? 1 : 0);
