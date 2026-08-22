// WebGLEngine/tools/ship/pagePlacements-selfcheck.mjs -- v3577
//
// Run: node tools/ship/pagePlacements-selfcheck.mjs
// RUNTIME 1s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTION 1 IS THE SAFETY PROPERTY THE WHOLE DESIGN RESTS ON: DELETE page-placements.json AND THE TREE
// BEHAVES EXACTLY AS IT DOES TODAY. *** Everything else is only shippable because that holds.
"use strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SECTIONS, MAX_PER_PANEL } from "./pageSections.mjs";
import { allTopics, baseTopics, read, write, resolve, sanitise, bigButtons, appsList,
         pagesInTopic, overCap, alphaBuckets, unclaimed, reportLines, ENG, FILE } from "./pagePlacements.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "swek-place-")), "page-placements.json");

console.log("pagePlacements-selfcheck -- four facts per page, layered over SECTIONS, written from the index\n");

// ---------------------------------------------------------------------------
console.log("1. *** WITH NO FILE, THE ANSWER IS EXACTLY WHAT pageSections ALREADY SAID ***");
{
    const none = path.join(os.tmpdir(), "swek-does-not-exist-" + Date.now() + ".json");
    const res = resolve(none);
    const base = baseTopics();
    let same = res.size === base.size;
    for (const [f, tt] of base) {
        const r = res.get(f);
        if (!r || r.topics.join(",") !== tt.join(",") || r.from !== "sections") { same = false; break; }
    }
    ok("!! *** DELETING page-placements.json RETURNS THE TREE TO ITS CURRENT BEHAVIOUR ***", same,
        "every one of the " + base.size + " pages SECTIONS places resolves to the same topics, marked `from: " +
        "sections`. *** THIS IS THE PROPERTY THAT MAKES A BROWSER-EDITABLE PLACEMENT LAYER SAFE TO SHIP: the " +
        "worst case is not a corrupted registry, it is a file somebody can delete. ***");
    ok("...and a missing file is not an error, it is the empty override",
        read(none).pages && Object.keys(read(none).pages).length === 0,
        "absent and empty mean the same thing HERE on purpose, which is the opposite of the launch-index rule -- " +
        "there, absent meant a build step had not run and had to be said out loud; here it means nobody has " +
        "overridden anything yet, which is the normal state");
    ok("!! the override file is NOT pageSections.mjs, and that is the design",
        !fs.readFileSync(path.join(ENG, "tools", "ship", "pagePlacements.mjs"), "utf8").includes("pageSections.mjs\", \"w"),
        "*** SECTIONS CARRIES REASONING NO UI CAN HOLD *** -- roundhouse sits with the physics lab because it " +
        "DRIVES it, sampling has no chip because a thirteenth button was the thing to avoid, celltrack holds " +
        "one page ON PURPOSE. A browser writing that file would flatten every comment into a JSON array.");
}

// ---------------------------------------------------------------------------
console.log("\n2. THE FOUR FACTS ARE INDEPENDENT, AND A PAGE CAN BE IN SEVERAL TOPICS");
{
    const f = tmp();
    write({ pages: { "cosmic-map.html": { topics: ["cosmic", "voxelrender"], bigButton: true, apps: false } } }, f);
    const res = resolve(f);
    const r = res.get("cosmic-map.html");
    report("cosmic-map.html", JSON.stringify({ topics: r.topics, big: r.bigButton, apps: r.apps, from: r.from }));

    ok("!! a page can be listed in TWO topics at once",
        r.topics.length === 2 && r.topics.includes("cosmic") && r.topics.includes("voxelrender"),
        "*** SECTIONS.pages IS A PARTITION AND COULD NOT SAY THIS. *** Keith: \"a page such as Cosmic Map could " +
        "show some or all or none of the sections\" -- so topics is a SET, and the base registry's one-panel-" +
        "per-page shape was a limit of the storage rather than a fact about pages.");
    ok("!! bigButton and apps are independent of topics and of each other",
        r.bigButton === true && r.apps === false,
        "a page can be a big button without being in any drawer, and a topic page is usually not an " +
        "application. Collapsing them into one 'where does this go' field would force a false choice.");
    ok("the override replaces the base rather than merging with it",
        r.from === "override",
        "cosmic-map.html is in SECTIONS' cosmic panel already; the override REPLACES that list. A merge would " +
        "make unticking a topic impossible -- the box would come back checked from the base layer.");
    fs.rmSync(path.dirname(f), { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
console.log("\n3. *** `auto` STORES A DECISION TO FOLLOW THE SUGGESTER, NOT THE SUGGESTION ***");
{
    // *** v3927 -- THE FIXTURE USED A REAL PAGE THAT WAS NOT IN ANY SECTION, AND THEN ONE WAS. ***
    // This section needs a page the base register does NOT place, so that `auto` with a refusing suggester lands
    // on auto-unreached instead of inheriting a section list. It named brain-3d.html -- a real page that
    // happened to be unplaced -- and v3927 gave it a home in the GPU Brain panel, which turned this red. THE
    // TEST WAS COUPLED TO THE REGISTER'S CONTENTS, so closing registerResidue's debt broke it, and progress
    // breaking a test is the ratchet shape this tree keeps removing.
    //
    // A SYNTHETIC NAME CANNOT BE PLACED BY ANYBODY. physicsReach learned the same lesson from the other side
    // this same round: officeDispatch's invented physics/alpha.mjs was reported as a missing module because a
    // scanner could not tell a fixture from a door. A fixture should be UNMISTAKABLE as one.
    const UNPLACEABLE = "__fixture-never-in-a-section.html";
    const f = tmp();
    write({ pages: { [UNPLACEABLE]: { auto: true } } }, f);
    const withS = resolve(f, { suggest: (file) => (file === UNPLACEABLE ? { suggestion: "brain" } : null) });
    const withoutS = resolve(f, { suggest: (file) => ({ suggestion: null }) });

    ok("!! ticking auto resolves through the suggester at READ time",
        withS.get(UNPLACEABLE).topics.join() === "brain" && withS.get(UNPLACEABLE).from === "auto",
        "*** THE ANSWER TRACKS THE SUGGESTER AS THE TREE CHANGES INSTEAD OF FREEZING WHATEVER IT SAID THE DAY " +
        "THE BOX WAS TICKED. *** Storing the suggested topic would have been simpler and would have been the " +
        "ratchet this lab keeps removing, in a new place.");
    ok("!! ...and auto with no suggestion says auto-unreached rather than falling back to a guess",
        withoutS.get(UNPLACEABLE).from === "auto-unreached" && withoutS.get(UNPLACEABLE).topics.length === 0,
        "the suggester refuses 160 of 228 pages ON PURPOSE. *** IF `auto` QUIETLY PICKED THE NEAREST PANEL WHEN " +
        "THE SUGGESTER DECLINED, IT WOULD REINTRODUCE NEAREST-ANYTHING THROUGH THE BACK DOOR *** -- the exact " +
        "thing v3576 built the score floor to prevent.");
    ok("...and 'nobody decided' is a different state from 'decided to let the tool decide'",
        !resolve(f).get("physics-lab.html").auto && resolve(f).get(UNPLACEABLE).auto,
        "pageSections' UNPLACED doctrine: an unplaced page and a page nobody has got to must not look identical");
    fs.rmSync(path.dirname(f), { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
console.log("\n4. WHAT IT REFUSES TO STORE");
{
    const ids = new Set(allTopics().map((t) => t.id));
    const s = sanitise({ topics: ["cosmic", "no-such-panel", "cosmic"], bigButton: 1, apps: "yes" }, ids);
    report("sanitised", JSON.stringify(s.entry) + "   dropped " + JSON.stringify(s.dropped));

    ok("!! a topic id that no panel has is DROPPED and REPORTED, not stored",
        s.entry.topics.join() === "cosmic" && s.dropped.join() === "no-such-panel",
        "*** A PLACEMENT POINTING AT A DELETED PANEL READS AS 'PLACED' EVERYWHERE THAT COUNTS PLACEMENTS AND " +
        "SHOWS UP NOWHERE. *** That is the ghost case pagePlacement's inventory checks in the other direction.");
    ok("...duplicates collapse and the flags are coerced to real booleans",
        s.entry.topics.length === 1 && s.entry.bigButton === true && s.entry.apps === true,
        "a JSON body from a browser is not a trusted shape");

    const f = tmp();
    write({ pages: { "a.html": { topics: [], bigButton: false, apps: false, auto: false }, "b.html": { apps: true } } }, f);
    const kept = Object.keys(read(f).pages);
    ok("!! an entry that says nothing is not stored at all",
        kept.length === 1 && kept[0] === "b.html",
        "an empty override is indistinguishable from NO override, and keeping it would grow a file of noise " +
        "that looks like a list of decisions somebody made");
    fs.rmSync(path.dirname(f), { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
console.log("\n5. THE CAP IS REPORTED WHERE IT IS EXCEEDED, AND NOT ENFORCED");
{
    const f = tmp();
    const pages = {};
    for (let i = 0; i < MAX_PER_PANEL + 4; i++) pages["stuffed-" + i + ".html"] = { topics: ["blobs"] };
    write({ pages }, f);
    const res = resolve(f);
    const over = overCap(res);
    report("blobs after stuffing", String(pagesInTopic(res, "blobs").length) + " against a cap of " + MAX_PER_PANEL);

    ok("!! going over Keith's cap is DETECTED",
        over.length === 1 && over[0].id === "blobs" && over[0].count > MAX_PER_PANEL,
        "a drawer of 25 is the flat row with a lid on it (v2513), and *** A CHECKBOX IS A MUCH FASTER WAY TO " +
        "MAKE ONE THAN EDITING A REGISTRY *** -- so the surface that made it easy owes the check.");
    ok("!! ...and NOT refused, because refusing the tick would lose the decision",
        pagesInTopic(res, "blobs").length > MAX_PER_PANEL,
        "Keith's fifteen is a REVIEW TRIGGER, not a hard stop: v3434 says \"when it reaches the 15th item, that " +
        "is when we need to consider a new panel\". A control that silently declined would leave the user " +
        "clicking a box that does nothing.");
    ok("the cap is measured against the RESOLVED result, not against SECTIONS",
        overCap(resolve(path.join(os.tmpdir(), "nope-" + Date.now() + ".json"))).length === 0,
        "with no overrides nothing is over, because SECTIONS is already within the rule -- so a non-empty " +
        "report is always about a decision made HERE");
    fs.rmSync(path.dirname(f), { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
console.log("\n6. THE FOUR SURFACES READ THIS AND NOT EACH OTHER");
{
    const srv = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    const idx = fs.readFileSync(path.join(ENG, "page-index.html"), "utf8");
    const mn = fs.readFileSync(path.join(ENG, "main.js"), "utf8");

    ok("!! server.html renamed the drawer to SweK Engine Topics and it TOGGLES the section",
        srv.includes("SweK Engine Topics") && srv.includes('id="topicsToggle"') && srv.includes('aria-controls="gaugeSections"'),
        "the page list moved to the index, so the drawer had nothing left to be except a duplicate. What the " +
        "space is worth instead is a show/hide for a chip column that runs off the screen.");
    ok("!! ...and #ipadGrid stays in the DOM, hidden, rather than being deleted",
        srv.includes('id="ipadGrid"'),
        "*** ITS BUILDER STILL RUNS AND STILL REGISTERS WHAT IT REGISTERS. *** Deleting the node would leave " +
        "that code writing into nothing -- the shape v3538 called out when it hid the physicslab tab instead of " +
        "removing it.");
    ok("!! server.html and main.js both consume /pages/placements",
        srv.includes("/pages/placements") && mn.includes("/pages/placements"),
        "one source, three readers (index writes, server and render read). A second copy of the mapping in " +
        "either page is the defect this whole session keeps finding.");
    ok("!! the page index offers a checkbox per topic, plus auto, big and apps",
        idx.includes("data-place='topic'") && idx.includes('flag("auto"') &&
        idx.includes('flag("bigButton"') && idx.includes('flag("apps"'),
        "Keith's design: the list, and on the right of each page name a checkbox for every place it could " +
        "appear. *** THE FIRST VERSION OF THIS CHECK GREPPED FOR data-place=\"auto\" AND WENT RED, because the " +
        "three flags are emitted through ONE helper and the literal only exists at its CALL SITES. *** " +
        "Asserting on generated markup instead of on the source that generates it is a check that measures the " +
        "wrong artefact -- and it would have passed the day somebody hand-wrote four near-identical blocks, " +
        "which is the thing the helper exists to prevent.");
    ok("!! the editor repaints from the SERVER'S echo rather than from the click",
        /j\.entry\)\s*PLACE\[file\] = j\.entry/.test(idx.replace(/\s+/g, " ")) || idx.includes("PLACE[file] = j.entry"),
        "*** v3575 FOUND THIS EXACT DEFECT IN THE TUNNEL CHECKBOX: a control reporting a write it had never " +
        "confirmed. *** Same session, same shape, so the new control was built the other way round from the start.");
    ok("...and the consumers ADD rather than replace",
        /ADDS AND NEVER REMOVES/.test(srv) && /ADDS AND NEVER REMOVES/.test(mn),
        "a consumer that also deleted would make the absent file and the empty file behave differently, and " +
        "the safety property in section 1 would stop holding");
}

// ---------------------------------------------------------------------------
console.log("\n7. *** NOTHING IS UNREACHABLE: THE REMAINDER GETS ALPHABETICAL HOLDING PANELS ***");
{
    const P = await import("./pagePlacement.mjs");
    const inv = P.inventory();
    const rem = unclaimed(resolve(), inv.pages.keys());
    const b = alphaBuckets(rem);
    report("unclaimed pages / buckets", rem.length + " / " + b.length);
    report("labels", b.map((x) => x.label + "(" + x.count + ")").join(" "));

    ok("!! every unclaimed page lands in exactly one bucket",
        b.reduce((a, x) => a + x.count, 0) === rem.length &&
        new Set(b.flatMap((x) => x.files)).size === rem.length,
        "*** v3576 MEASURED 246 PAGES IN NO PANEL AND CORRECTLY REFUSED TO GUESS WHERE THEY BELONG -- AND FOR A " +
        "ROUND THAT LEFT THEM WITH NO WAY IN AT ALL. REFUSING TO GUESS IS NOT THE SAME AS LEAVING THEM " +
        "UNREACHABLE. *** Keith: \"worst case look through the remainder a through z and find it.\"");
    ok("!! no bucket exceeds the cap, INCLUDING the letters that overflow on their own",
        b.every((x) => x.count <= MAX_PER_PANEL),
        "B holds 32 pages and cannot be one drawer, so it deepens to BA-BL and BO-BR. *** DEEPENING EVERYWHERE " +
        "WOULD GIVE 'AA-AD' RANGES NOBODY CAN NAVIGATE; DEEPENING NOWHERE GIVES A DRAWER OF 32, which is the " +
        "flat row with a lid on it. *** The prefix lengthens only where a single letter overflows.");
    ok("!! the boundaries are DERIVED from the distribution, not typed",
        !fs.readFileSync(path.join(ENG, "tools", "ship", "pagePlacements.mjs"), "utf8").includes('"A-G"'),
        "\"A-G, H-Y, Z\" is a guess about a distribution. The real one is a20 b32 c25 d9 e13 f15 g9 h10 i5 j2 " +
        "k2 l7 m7 n5 o3 p12 r9 s23 t12 u3 v5 w15 x2 y1, and the divisions come out of THAT.");
    ok("!! a page LEAVES its bucket the moment it is placed",
        (() => {
            const f = tmp();
            const victim = rem[0];
            write({ pages: { [victim]: { topics: ["blobs"] } } }, f);
            const after = unclaimed(resolve(f), inv.pages.keys());
            fs.rmSync(path.dirname(f), { recursive: true, force: true });
            return !after.includes(victim) && after.length === rem.length - 1;
        })(),
        "the buckets are computed from what NOTHING CLAIMS, so they shrink and re-divide as Keith works " +
        "through them, and when the list empties the drawer disappears on its own. A static list would need " +
        "pruning by hand and would rot the first time somebody forgot.");
    ok("!! it is presented as a to-do list rather than as twenty-one more subjects",
        (() => { const srv = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
                 return srv.includes("SweK Engine Unsorted:") && srv.includes('id="unsortedWrap"') &&
                        /MINIMISED ON START/.test(srv) && srv.includes('aria-expanded="false"'); })(),
        "*** MINIMISED ON START, ON PURPOSE. *** v3576's own report line says ungrouped is a to-do list, not a " +
        "category, and a holding area that opened by default would read as twenty-one more subjects and BURY " +
        "THE THIRTEEN REAL ONES ABOVE IT.");
    ok("...and the packing rule has ONE implementation, on the server side",
        (() => { const srv = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
                 // a CALL, not the word: the comment naming the owner is exactly what should be there
                 return !/alphaBuckets\s*\(/.test(srv) && srv.includes("j.buckets"); })(),
        "the browser renders what it is handed. A second copy of the packing in page JavaScript would drift " +
        "from this one the first time either changed -- the defect this session keeps finding. *** THE FIRST " +
        "VERSION OF THIS CHECK GREPPED FOR THE WORD AND WENT RED ON THE COMMENT THAT NAMES THE OWNER *** -- a " +
        "check that punishes a file for SAYING where its logic lives is one that teaches people to stop saying.");
}

// ---------------------------------------------------------------------------
console.log("\n8. THE REPORT PRINTS AND THE SPLIT HOLDS");
ok("the reporting tool produces a report", reportLines().length > 5,
    "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");
ok("the shipped tree has no override file yet, so nothing here has changed behaviour",
    !fs.existsSync(FILE),
    "the editor exists and the file does not: every placement in the tree is still SECTIONS' own");

console.log(fails ? `\npagePlacements-selfcheck: ${fails} FAILED` : "\npagePlacements-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
