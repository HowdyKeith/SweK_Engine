// WebGLEngine/tools/ship/pageSections-selfcheck.mjs
//
// Run: node tools/ship/pageSections-selfcheck.mjs   (~0.3s -- MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3227 -- ARRIVING PAGES HELD 96 OF 315. NOW IT HOLDS EIGHT, AND THE OTHER 88 ARE IN DRAWERS.
//
// The section's own comment called it "a curated front for recent work, not a second directory" and said "when a
// page stops being recent it drops off here". NOTHING EVER HAD. A flat row of 96 is the pile v2513 built the
// section to prevent, arriving from the other side: not an inbox nobody fills, an inbox nobody empties.
//
// *** THE MECHANISM WAS ALREADY GENERIC AND NOBODY HAD USED IT FOR THIS. *** server.html pairs any
// `<button class="gtab" data-tab="X">` with `<div class="gpanel" data-panel="X">` and toggles them. Nine new
// chips needed no JavaScript at all -- only markup and a registry.
//
// *** AND THE RENDERER MOVES THE EXISTING ANCHOR RATHER THAN BUILDING A NEW ONE. *** Every page already had an
// <a> carrying a hand-written title somebody thought about; recreating those from the registry would put the
// text in two places and guarantee they drift. appendChild MOVES a node that already has a parent, so A PAGE IS
// IN EXACTLY ONE PLACE BECAUSE IT IS ASSIGNED -- not because anybody remembered a second edit. That is the whole
// design, and it is why brain-bench.html (which was in BOTH the brain panel and Arriving) can only be in one now.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SECTIONS, MAX_PER_PANEL, UNPLACED, claimedPages, PROFILES, sectionsFor, CHIP_GROUPS } from "./pageSections.mjs";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const ui = fs.readFileSync(path.join(ROOT, "server.html"), "utf8");

// ---- 1. EVERY SECTION NAMES A CHIP AND A SLOT THAT EXIST -----------------------------------------------------------
{
    // v3329 -- A SECTION WITH A PARENT OWNS NO CHIP AND NO PANEL, AND THAT IS THE POINT OF HAVING A PARENT.
    // "Sampling & Methods" renders as a GROUP INSIDE the physics lab panel: Keith asked for links within the
    // lab rather than a thirteenth button beside it. So chip and panel are required of TOP-LEVEL sections only.
    // *** THE SLOT IS STILL REQUIRED OF EVERY SECTION, INCLUDING CHILDREN *** -- that is the element the mover
    // actually fills, and a child without one would claim ten pages and render nothing, which is exactly the
    // failure this check caught when the section was first declared.
    const topLevel = SECTIONS.filter((s) => s.tab);
    const noChip = topLevel.filter((s) => !new RegExp('data-tab="' + s.tab + '"').test(ui));
    const noPanel = topLevel.filter((s) => !new RegExp('data-panel="' + s.tab + '"').test(ui));
    const noSlot = SECTIONS.filter((s) => !new RegExp('data-panel-pages="' + (s.tab || s.id) + '"').test(ui));

    ok("!! *** every section names a chip, a panel AND a slot that exist ***",
        noChip.length === 0 && noPanel.length === 0 && noSlot.length === 0,
        SECTIONS.length + " sections. A SECTION NAMING A CHIP THAT DOES NOT EXIST WOULD RENDER INTO NOTHING AND " +
        "LOOK EXACTLY LIKE A PAGE THAT VANISHED -- which is the failure this whole arc has been about" +
        (noChip.length ? " NO CHIP: " + noChip.map((s) => s.id).join(", ") : "") +
        (noPanel.length ? " NO PANEL: " + noPanel.map((s) => s.id).join(", ") : "") +
        (noSlot.length ? " NO SLOT: " + noSlot.map((s) => s.id).join(", ") : ""));

    // v3257 -- *** EXISTING ON DISK IS NOT THE SAME AS HAVING AN ANCHOR TO MOVE, AND THE GAP COST THREE PAGES
    // TWENTY-SEVEN ROUNDS. *** pageSections MOVES an <a> out of Arriving into a drawer; it does not build one.
    // The petfbi section, its chip, its panel and its slot all shipped at v3230 and THE THREE ANCHORS DID NOT,
    // so the drawer rendered EMPTY from the day it was added. The page said so on every single load -- "moved 83
    // page links into 17 panels, 3 unmatched: petfbi.html, petfbi-board.html, petfbi-setup.html" -- and NOTHING
    // IN THE SUITE WAS READING ITS OWN CONSOLE. Keith pasted it from the rig.
    //
    // THE CHECK IS THE SAME QUESTION THE RENDERER ASKS, ASKED EARLIER: is there an <a href="/page"> anywhere in
    // server.html for every page a section claims?
    // v3259 -- THE ANCHOR MUST BE IN THE ARRIVING ROW, NOT MERELY SOMEWHERE IN THE PAGE. The mover moves a link
    // OUT OF ARRIVING; an anchor anywhere else is not one it may take. This check said "somewhere in server.html"
    // and page-index.html satisfied it via the TOOLBAR BUTTON while its Arriving link sat unclaimed -- so the
    // gate was green while the drawer was eating a control.
    // *** MY FIRST VERSION CAPPED THIS AT 20000 CHARACTERS AND REPORTED 47 FALSE MISSES. *** The Arriving row is
    // longer than that, so the window itself was the finding -- a guessed bound, exactly the mistake this file
    // spends its checks preventing. AND NO END BOUND IS NEEDED: the property is "the anchor is NOT one the
    // toolbar owns", and the toolbar is entirely ABOVE the Arriving header. Everything from the header onward is
    // fair game for the mover.
    const arrivingSlice = (() => {
        const i = ui.indexOf("Arriving Pages");
        return i < 0 ? ui : ui.slice(i);
    })();
    const noAnchor = [...claimedPages()].filter((p) => !new RegExp('href="/' + p.replace(/\./g, "\\.") + '"').test(arrivingSlice));
    ok("!! *** every claimed page has an ANCHOR for the drawer to move ***",
        noAnchor.length === 0,
        claimedPages().size + " claimed. A SECTION ENTRY IS NOT A LINK: the renderer moves an existing <a> and " +
        "cannot invent one, so a page filed into a drawer with no anchor gives an EMPTY DRAWER THAT LOOKS " +
        "DELIBERATE" + (noAnchor.length ? ". NO ANCHOR: " + noAnchor.join(", ") : ""));

    const gone = [...claimedPages()].filter((p) => !fs.existsSync(path.join(ROOT, p)));
    ok("...and every assigned page is a file that exists",
        gone.length === 0,
        claimedPages().size + " pages assigned across " + SECTIONS.length + " drawers" +
        (gone.length ? ". MISSING ON DISK: " + gone.join(", ") : ""));
}

// ---- 2. KEITH'S LIMIT, AND WHY IT IS A LIMIT ------------------------------------------------------------------------
{
    const over = SECTIONS.filter((s) => s.pages.length > MAX_PER_PANEL);
    ok("!! no drawer holds more than " + MAX_PER_PANEL + " pages",
        over.length === 0,
        "biggest: " + Math.max(...SECTIONS.map((s) => s.pages.length)) + ". A DRAWER OF 25 IS THE FLAT ROW AGAIN " +
        "WITH A LID ON IT -- which is why the 25 instruments were split three ways rather than filed under one " +
        "Physics Lab chip" + (over.length ? ". OVER: " + over.map((s) => s.id + "=" + s.pages.length).join(", ") : ""));

    const seen = new Map();
    const dupes = [];
    for (const s of SECTIONS) for (const p of s.pages) {
        if (seen.has(p)) dupes.push(p + " (" + seen.get(p) + " and " + s.id + ")");
        seen.set(p, s.id);
    }
    ok("!! *** no page is claimed by two drawers ***",
        dupes.length === 0,
        "88 assignments, " + seen.size + " distinct pages" + (dupes.length ? ". IN TWO: " + dupes.join(", ") : "") +
        ". brain-bench.html USED TO BE IN BOTH the GPU Brain panel and Arriving, kept in step by nobody -- the " +
        "renderer MOVES a node rather than copying it, so that state is now unreachable rather than merely fixed");
}

// ---- 3. THE PAGES LEFT BEHIND ARE A DECISION, NOT A REMAINDER --------------------------------------------------------
{
    ok("!! every page left in Arriving carries the REASON it was left",
        UNPLACED.size > 0 && [...UNPLACED.values()].every((v) => typeof v === "string" && v.length > 30),
        UNPLACED.size + " unplaced, each with a sentence. AN UNPLACED PAGE AND A PAGE NOBODY GOT TO LOOK " +
        "IDENTICAL, and the second one gets placed by a guess. Keith said of predict/predictions: 'if we are not " +
        "sure they can stay in Arriving Pages and I will move those later' -- so they stayed, and the note says why");

    ok("...and none of them is also claimed by a drawer",
        ![...UNPLACED.keys()].some((p) => claimedPages().has(p)),
        "a page cannot be both deliberately unplaced and assigned -- that would be two answers to one question");

    ok("!! ...and celltrack holds ONLY celltrack, on purpose",
        (SECTIONS.find((s) => s.id === "celltrack") || {}).pages.length === 1,
        "Keith: 'celltrack is a big button item, it is it's own very large science project.' paramecium, flesh " +
        "and mc-flesh were pulled OUT of it -- grouping them there was BY SUBJECT (biological) rather than by " +
        "machinery, which is the keyword probe that has misled this project three times");
}

// ---- 4. THE FULL LIST IS STILL ONE CLICK FROM THE FRONT DOOR ---------------------------------------------------------
{
    ok("!! *** the complete page list is reachable from server.html, so a drawer is a FILTER and not a WALL ***",
        /href="\/page-index\.html"/.test(ui) && /serverControls/.test(ui),
        "page-index.html sits left of Lock assets. The chip row is the right shape for finding something you CAN " +
        "NAME and the wrong shape for the moment you cannot -- so hiding pages behind drawers is only safe while " +
        "the complete list stays one click away. IT WAS REACHABLE ONLY FROM THE ARRIVING ROW IT NOW REPLACES");

    ok("...and the renderer MOVES nodes rather than rebuilding them",
        /appendChild\(a\)/.test(ui) && /pageSections\.mjs/.test(ui),
        "the titles on those anchors were written by hand, one page at a time. A renderer that rebuilt them from " +
        "the registry would be a second copy of every one of them");
}

// ---- 5. THE TAILORED FRONT DOOR ------------------------------------------------------------------------------------
{
    const bad = [];
    for (const [id, p] of PROFILES) for (const secId of p.sections)
        if (!SECTIONS.some((s) => s.id === secId)) bad.push(id + " -> " + secId);
    ok("!! every profile names sections that exist",
        bad.length === 0,
        PROFILES.size + " profiles. A PROFILE NAMES SECTIONS AND CARRIES NO PAGES OF ITS OWN -- a profile with " +
        "its own page list would be a THIRD declaration of which page lives where, after the drawers and the " +
        "index, and this session has watched that go wrong in nine files, three, four, and 59 of 82" +
        (bad.length ? ". UNKNOWN: " + bad.join(", ") : ""));

    ok("!! *** an absent or unknown profile shows EVERYTHING ***",
        sectionsFor("").length === SECTIONS.length && sectionsFor("no-such-profile").length === SECTIONS.length,
        "a typo in a shipped config must not silently hide two thirds of the front door. THE FAILURE MODE OF A " +
        "FILTER IS TO HIDE TOO MUCH, and the default is the one case nobody tests");

    const page = fs.readFileSync(path.join(ROOT, "server.html"), "utf8");
    ok("!! *** the page says on screen that a profile is a FILTER, not a permission ***",
        // gateQuality caught this on its first run, FOURTH TIME THIS SESSION: long prose regexes against raw
        // source are the wrapping debt ratcheted since v3071. The banner text lives in a JS string literal, so
        // noComments() is the right instrument and the phrases are cut to their load-bearing words. THE
        // BASELINE WAS NOT RAISED TO MEET ME.
        /FILTER, not a permission/i.test(noComments(page)) && /still ships/i.test(noComments(page)),
        "hiding a chip does not remove the page, unlink the route, or stop anybody typing the URL. IF THIS IS " +
        "EVER MISTAKEN FOR A PERMISSION IT BECOMES DANGEROUS -- so the banner says it where a person will read " +
        "it, not in a comment where only I would");

    ok("...and a tailored door offers the way back to the whole engine",
        /show everything/i.test(noComments(page)),
        "a front door somebody cannot get out of is a trap, and the profile is a VIEW rather than an install");
}

// ---- 6. CHIP GROUPS AND THE FRONT-DOOR MENU --------------------------------------------------------------------------
{
    const page = fs.readFileSync(path.join(ROOT, "server.html"), "utf8");
    const code = noComments(page);

    const badChip = [];
    for (const g of CHIP_GROUPS) {
        if (!new RegExp('data-group-chips="' + g.id + '"').test(code)) badChip.push(g.id + " (no slot)");
        for (const t of g.chips) if (!new RegExp('data-tab="' + t + '"').test(code)) badChip.push(g.id + " -> " + t);
    }
    ok("!! every chip group names chips and a slot that exist",
        badChip.length === 0,
        CHIP_GROUPS.length + " groups covering " + CHIP_GROUPS.reduce((a, g) => a + g.chips.length, 0) + " chips. " +
        "THE CHIP ROW HAD 32 BUTTONS, which is the row-of-96 problem wearing the mechanism that solved it" +
        (badChip.length ? ". BROKEN: " + badChip.join(", ") : ""));

    // SCOPED TO THE LOOP, NOT THE PAGE. My first version forbade createElement("button") ANYWHERE in
    // server.html and went red on five pre-existing, entirely legitimate button constructions elsewhere. The
    // property is about how THE CHIP-GROUP CODE behaves, and asserting it globally asserted something I did not
    // mean and could not have wanted -- the same shape as the "<= 4 occurrences" count two rounds ago.
    const groupLoop = (code.match(/for \(const g of CHIP_GROUPS\)[\s\S]{0,600}/) || [""])[0];
    ok("!! *** a grouped chip is MOVED, not rebuilt ***",
        /appendChild\(chip\)/.test(groupLoop) && !/createElement/.test(groupLoop),
        "each chip carries a click listener wired at load, a live status span the bridges write into, and a " +
        "data-tab pairing it with its own panel. REBUILDING ONE WOULD SILENTLY DROP ALL THREE and the status " +
        "span would go quiet in a way nobody notices until they want it");

    ok("!! the front-door menu is BUILT FROM the profile registry",
        /id="frontDoor"/.test(code) && /of PROFILES\)/.test(code),
        "v3230 made a tailored door reachable by typing ?profile=NAME, which is a feature only somebody who read " +
        "the changelog could use. A HAND-WRITTEN OPTION PER PROFILE would be the second copy this whole arc has " +
        "been about -- and the one that still offers a profile after somebody deletes it");

    ok("...and it preselects the profile you are already on",
        /doorSel\.value = PROFILES\.has\(wantProfile\)/.test(code),
        "a control that always reads 'everything' while showing a filtered door is a flag that lies about which " +
        "state you are in -- v2866's finding, in a dropdown");
}

// ---- THE MOVER MAY ONLY TAKE FROM ARRIVING (v3259) ----------------------------------------------------------------------
{
    // v3959 -- *** THIS BANNED A STRING, AND THE STRING CAME BACK FOR A HONEST REASON. ***
    // The ban was `!/document.querySelector('a[href="/' + page/` -- and it went red on a document-wide lookup
    // that MOVES NOTHING. v3959 needed to know whether an unmoved page is linked somewhere else before calling
    // it missing, because server.html had been accusing eleven pages that were sitting in the drawers all along.
    // That lookup only ever READS.
    //
    // SO THE PROPERTY IS ASSERTED INSTEAD OF THE SPELLING, which is this check's own lesson turned on itself: a
    // rule wider than its purpose fails something eventually. What v3259 actually bought is that THE NODE THAT
    // GETS MOVED COMES FROM ARRIVING -- not that the word `document` never appears near an href. So: the Arriving
    // lookup must exist, the node appended into a slot must be the one it returned, and the document-wide
    // result must never be appended anywhere. A future edit that wires the wide lookup back into the move trips
    // the third clause; a future edit that merely reads the page does not.
    // Bounded by a REAL MARKER rather than a character count. The first cut of this used {0,3000} and the
    // window stopped 29 characters short of `slot.appendChild(a)` -- so the check reported that the mover no
    // longer moves anything, which was a fact about my regex.
    const moverStart = ui.indexOf("for (const page of sec.pages)");
    const moverEnd = ui.indexOf('console.log("[pageSections] moved', moverStart);
    const mover = moverStart >= 0 && moverEnd > moverStart ? ui.slice(moverStart, moverEnd) : "";
    ok("the mover loop can be found at all (every check below reads from it)", mover.length > 0);
    const wide = (mover.match(/(?:const|let)\s+(\w+)\s*=\s*document\.querySelector\('a\[href="\/' \+ page/) || [])[1];
    ok("!! *** the move lookup is SCOPED to the Arriving row ***",
        /arrivingRow\.querySelector\('a\[href=/.test(mover) &&
        /appendChild\(a\)/.test(mover) &&
        !(wide && new RegExp("appendChild\\(\\s*" + wide + "\\s*\\)").test(mover)),
        "it searched the WHOLE DOCUMENT and took the first match. page-index.html is claimed by System Tools and " +
        "has TWO anchors -- the toolbar button added at v3227 and the Arriving link -- so querySelector returned " +
        "THE BUTTON and the drawer moved a control out of the toolbar. A LOOKUP WIDER THAN ITS PURPOSE FINDS " +
        "SOMETHING EVENTUALLY, and any page with both a shortcut and an Arriving entry would have gone the same way");

    const toolbarPages = [...(ui.slice(0, ui.indexOf("Arriving Pages") >>> 0 || 20000)
        .matchAll(/href="\/([a-z0-9-]+\.html)"/g))].map((m) => m[1]);
    const alsoClaimed = toolbarPages.filter((p) => claimedPages().has(p));
    ok("...and the pages that have BOTH a toolbar anchor and a drawer claim are named",
        true,
        alsoClaimed.length ? alsoClaimed.join(", ") + " -- each has a shortcut ABOVE Arriving and is also claimed " +
            "by a drawer. That is legitimate now that the lookup is scoped, and it is exactly the set that was " +
            "broken before, so it is printed rather than merely tolerated"
            : "none currently -- but the scoping is what keeps that from mattering");
}

// ---- THE CHIP MOVER REPORTS, LIKE THE PAGE MOVER (v3269) ------------------------------------------------------------------
{
    ok("!! *** the chip grouping says what it moved and what it could not find ***",
        /\[chipGroups\] moved/.test(ui) && /NO SLOT/.test(ui) && /CHIP NOT FOUND/.test(ui),
        "it skipped silently in TWO places -- a missing slot and a missing chip -- and Keith is looking at four " +
        "chips that are declared in CHIP_GROUPS, exist with the right data-tab and class, have a slot in the " +
        "static markup, AND ARE STILL IN THE TOP ROW. Statically everything checks out, so the answer is at " +
        "runtime and NOTHING WAS REPORTING IT: the same blindness that hid the empty PetFBI drawer for 27 rounds");

    ok("...and the two faults are counted APART",
        /noSlot = \[\], noChip = \[\]/.test(ui),
        "A MISSING SLOT MEANS THE PANEL MARKUP IS ABSENT OR RENAMED; a missing chip means the chip is not where " +
        "the selector looks. One number for both would send somebody to the wrong file");

    // The static half IS checkable here, and it passes -- which is why the round is reporting rather than fixing.
    const groups = [...ui.matchAll(/data-group-chips="([^"]+)"/g)].map((m) => m[1]);
    const chipTabs = [...ui.matchAll(/class="gtab"[^>]*data-tab="([^"]+)"|data-tab="([^"]+)"[^>]*class="gtab"/g)]
        .map((m) => m[1] || m[2]);
    ok("!! ...and every declared group has a slot AND every declared chip exists",
        CHIP_GROUPS.every((g) => groups.includes(g.id)) &&
        CHIP_GROUPS.every((g) => g.chips.every((t) => chipTabs.includes(t))),
        CHIP_GROUPS.length + " groups, " + chipTabs.length + " chips in markup. THIS PASSING IS THE FINDING: the " +
        "declaration and the markup agree, so whatever is wrong happens WHILE THE PAGE RUNS -- and until v3269 " +
        "there was no way to see it from either end");
}

// ---- A CHILD SECTION RENDERS INSIDE ITS PARENT (v3329) ------------------------------------------------------------------
{
    ok("!! *** the mover finds a child section's slot, which has no tab to key on ***",
        /data-panel-pages="' \+ \(sec\.tab \|\| sec\.id\)/.test(ui),
        "a child section declares tab:null BY DESIGN -- it owns no chip. The mover keyed the slot on sec.tab, so " +
        "the lookup would have found NOTHING and the group rendered EMPTY: ten pages claimed, none shown, and " +
        "the section gate green the whole time. THE SAME SHAPE AS THE PetFBI DRAWER, caught before shipping " +
        "rather than twenty-seven rounds later");

    const child = SECTIONS.find((s) => s.parentTab);
    ok("!! ...and its slot sits INSIDE the parent's panel, not beside it",
        !!child && ui.indexOf('data-panel-pages="' + child.id + '"') > ui.indexOf('data-panel="' + child.parentTab + '"'),
        "Keith: links WITHIN the physics panel, 'not a button link stand alone'. v3328 gave it a top-level chip " +
        "and panel -- A THIRTEENTH BUTTON on a row already carrying twelve, to hold pages that belong to the " +
        "lab. THE PAGES STAY PAGES; ONLY THE DOOR MOVED INSIDE");
}

console.log();
console.log("  ----  ARRIVING GOES FROM 96 LINKS TO EIGHT, AND THE EIGHT ARE NAMED WITH REASONS. What this does");
console.log("  ----  NOT do is decide whether the groupings are right: they are a keyword-and-judgement first");
console.log("  ----  pass that Keith asked for so he could move a few OUT rather than drag a lot IN, and the");
console.log("  ----  keyword probe has misled this project three times. The registry is one file and one edit.");
if (fails) { console.log("pageSections-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("pageSections-selfcheck: all checks pass");
