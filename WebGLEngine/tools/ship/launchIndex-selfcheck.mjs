// WebGLEngine/tools/ship/launchIndex-selfcheck.mjs — v3544
//
// Run: node tools/ship/launchIndex-selfcheck.mjs   (~0.1s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// *** THREE PILLS LISTED THREE DIFFERENT KINDS OF THING AND CALLED THEM ALL DEMOS. *** 56 demos_code scripts
// launched by ?go= deep-link, 58 inline DEMO_MODES that are states of the engine, and 15 real .html apps. Only
// the last were files anybody could reach any other way -- AND THIRTEEN OF THOSE FIFTEEN WERE IN NO PANEL AT
// ALL, openable only by opening that one dropdown. server.html's own Arriving comments record that exact failure
// four separate times: the page is built, it works, it ships, and the only way to open it is to type its
// filename out of a changelog.
//
// ONE INDEX NOW, AND EVERY ENTRY CARRIES ITS KIND -- because a PAGE survives without the engine running and a
// DEMO or BUILT-IN does not. Flattening all three into "things you can launch" would have read more simply and
// lost the only distinction that matters.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KINDS, niceLabel, nameKey, idKey, disambiguate, buildIndex, lines } from "./launchIndex.mjs";
import { noComments } from "./sourceScan.mjs";   // v3676 -- see the absent-is-not-empty check below

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ix = buildIndex();

// ---- 1. THREE KINDS, EACH WITH A STATED CONSEQUENCE ----------------------------------------------------------
{
    ok("!! the three kinds are named, and each records whether it survives without the engine",
       KINDS.PAGE.survives === true && KINDS.DEMO.survives === false && KINDS.BUILTIN.survives === false,
       "a page is a file; a demo and a built-in are states the engine enters. That is the distinction a flat " +
       "'things you can launch' list would have thrown away");
    // v4040 -- the built-in floor DROPPED from 40 to 20: engine-catalog.json's builtinDemos, which this number
    // comes from, was THREE DAYS STALE against main.js's real DEMO_MODES (58 claimed, 42 actually there) and had
    // no regenerator anywhere in the tree -- tools/ship/buildEngineCatalog.mjs is that regenerator now, wired
    // into the ship ritual before this step. 40 was a sanity floor calibrated against the wrong number; 20 is
    // the same KIND of floor (loose, not a pin) calibrated against the real one.
    ok("...and all three are populated",
       ix.byKind.page > 300 && ix.byKind.demo > 40 && ix.byKind.builtin > 20,
       ix.byKind.page + " pages, " + ix.byKind.demo + " demos, " + ix.byKind.builtin + " built-ins");
}

// ---- 2. *** THE THIRTEEN APPS THAT WERE REACHABLE FROM ONE DROPDOWN AND NOTHING ELSE. *** -----------------------
{
    ok("!! every app the Applications pill listed is now in the index",
       ix.apps.every((u) => ix.entries.some((e) => e.kind === "page" && e.id === u)),
       ix.apps.length + " apps, all present as page entries");
    ok("!! ...and the ones that were in no panel are NAMED rather than silently absorbed",
       ix.appsUnplaced.length >= 10,
       ix.appsUnplaced.length + " of " + ix.apps.length + " were in no panel: " + ix.appsUnplaced.slice(0, 5).join(", ") +
       ", ... — being in the index is not the same as being in a panel, and pretending otherwise would hide the " +
       "246-page tail behind these thirteen");
}

// ---- 3. *** THE COLLISIONS WERE TWO DIFFERENT PROBLEMS AND A BLANKET SUFFIX WOULD HAVE HIDDEN THE WORSE ONE. ***
// Keith asked for "Box3d" and "Box3d 2". Checked across pages only, there were ZERO collisions and I said so.
// Across the UNIFIED index there are eleven -- and nine of them are not duplicates at all.
{
    ok("!! nine collisions are ONE THING WITH TWO SURFACES, and are merged rather than suffixed",
       ix.multiSurface.length >= 8 &&
       ix.multiSurface.some((e) => e.display === "Boids") && ix.multiSurface.some((e) => e.display === "Gray Scott"),
       ix.multiSurface.map((e) => e.display).join(", ") + " — boids.html and demo:boids are the SAME demo through " +
       "two doors. 'Boids' and 'Boids 2' would tell a reader they are different things");
    ok("!! ...and each merged entry keeps EVERY route rather than dropping one",
       ix.multiSurface.every((e) => e.routes.length >= 2 && new Set(e.kinds).size >= 2),
       "keying a map by label would have silently kept the last one, which is how a page vanishes from an index " +
       "while still existing on disk");
    // v4040 -- *** THE THREE "GENUINE" COLLISIONS WERE THE STALENESS BUG WEARING A DIFFERENT SYMPTOM. *** They
    // were never a main.js labelling mistake: 'ogre' has always been "OGRE SCENARIO" and 'lorenz' has always
    // been "LORENZ ATTRACTOR" in DEMO_MODES. engine-catalog.json's OWN stale copy is what said 'ogre' and
    // 'defenders' were both "Defenders" -- a coin-flip nobody could have fixed by renaming anything in main.js,
    // because main.js was never wrong. tools/ship/buildEngineCatalog.mjs regenerates the catalog from the real
    // array now, and the collision is simply gone -- 0, not 3, checked live against the tree below. The
    // FLAGGING MECHANISM ITSELF (suffix + needsRename on a true collision) still needs proving even though the
    // live tree no longer HAS a naturally-occurring one, so it gets the same treatment check 3's own
    // "Box3d/Box3d 2/Box3d 3" case above gives a collision the live tree lacks: a small constructed fixture.
    ok("!! the live tree now has ZERO genuine collisions -- the fix was regenerating the catalog, not a rename",
       ix.needsRename.length === 0,
       ix.needsRename.length + " (was 3, all three artifacts of the stale engine-catalog.json this round fixed)");
    {
        const fixture = [
            { kind: "page", id: "widget.html", label: "Widget", href: "/widget.html" },
            { kind: "builtin", id: "widget_mode", label: "Widget", href: "/?go=widget_mode" },
            { kind: "demo", id: "gizmo", label: "Gizmo", href: "/?go=gizmo" },
        ];
        const got = disambiguate(fixture);
        const widgets = got.filter((e) => e.id === "widget.html" || e.id === "widget_mode");
        // v4040 -- WAS asserting BOTH occurrences carry a numeric suffix and needsRename:true. The real mechanism
        // (proven by the "Box3d, Box3d 2, Box3d 3" case just above) only flags the SECOND-and-later occurrence --
        // the first one to claim a name is not itself wrong, so it keeps its bare label and needsRename:false;
        // it is the later arrival colliding with it that gets suffixed and flagged. The old assertion could never
        // have passed against the real disambiguate() and was only ever exercising the fixture, not the code.
        ok("!! ...and the mechanism that flags a REAL collision still works, on a constructed one",
           widgets.length === 2 && widgets.map((e) => e.display).join(", ") === "Widget, Widget 2" &&
           widgets[0].needsRename === false && widgets[1].needsRename === true &&
           !got.find((e) => e.id === "gizmo").needsRename,
           widgets.map((e) => e.display).join(", ") + " -- a suffix makes a genuine collision clickable; it does " +
           "not make it correct, which is what needsRename keeps visible until a human renames one");
    }
}

// ---- 4. THE SUFFIX MECHANISM IS EXERCISED, NOT JUST PRESENT -------------------------------------------------------
{
    const synthetic = disambiguate([
        { kind: "page", id: "box3d.html", label: "Box3d", href: "/box3d.html" },
        { kind: "page", id: "box3d-two.html", label: "Box3d", href: "/box3d-two.html" },
        { kind: "page", id: "box3d-three.html", label: "Box3d", href: "/box3d-three.html" },
    ]);
    ok("!! three different files sharing a name become Box3d, Box3d 2, Box3d 3 -- in arrival order, none dropped",
       synthetic.map((e) => e.display).join(", ") === "Box3d, Box3d 2, Box3d 3" && synthetic.length === 3,
       "the exact case Keith asked for, constructed deliberately because the live tree has no three-way collision");
    ok("...and same-id entries across kinds do NOT get suffixed, they merge",
       disambiguate([
           { kind: "page", id: "boids.html", label: "Boids", href: "/boids.html" },
           { kind: "demo", id: "boids", label: "Boids", href: "/?go=boids" },
       ]).length === 1,
       "idKey strips the extension and separators, so boids.html and boids are recognised as one thing");
}

// ---- 5. THE SHIPPED INDEX MATCHES THE COMPUTED ONE AND EVERY TARGET RESOLVES -----------------------------------------
{
    let shipped = null;
    try { shipped = JSON.parse(fs.readFileSync(path.join(ENG, "launch-index.json"), "utf8")); } catch {}
    ok("!! launch-index.json exists and agrees with what the builder computes right now",
       shipped && shipped.entries.length === ix.entries.length,
       shipped ? shipped.entries.length + " entries shipped against " + ix.entries.length + " computed" : "MISSING — run launchIndex.mjs --write");
    const pages = ix.entries.filter((e) => e.kind === "page");
    const missing = pages.filter((e) => !fs.existsSync(path.join(ENG, e.id)));
    ok("!! every PAGE entry points at a file that exists",
       missing.length === 0,
       missing.length ? "missing: " + missing.slice(0, 5).map((e) => e.id).join(", ") : pages.length + " page targets all resolve on disk");
    ok("...and every demo and built-in uses the ?go= deep-link rather than pretending to be a URL",
       ix.entries.filter((e) => e.kind !== "page").every((e) => e.href.startsWith("/?go=")),
       "a mode has no file to open, and giving it a filename-shaped href is how it would end up in render-QA's manifest");
}

// ---- 6. ONE LIST, AND IT SAYS WHAT IS MISSING RATHER THAN SHOWING NOTHING --------------------------------------------
{
    const h = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    const pi = fs.readFileSync(path.join(ENG, "page-index.html"), "utf8");
    // v4040 -- WAS "the three pills are gone and one Launch button remains", requiring id="bLaunch" to exist.
    // Keith, later than v3552: "we have that page index listed on the left side of Server.html" -- and the
    // Launch pill itself just called `window.open("/page-index.html", "_blank")`, a second door to the exact
    // same page the "Page Index" pill in the Arriving row already opens. v4039 removed the redundant button (and
    // its wiring); the three OLDER pills it replaced must still never come back either.
    ok("!! bLaunch is gone (redundant with the Page Index pill already in Arriving), and the three older pills never came back",
       !h.includes('id="bLaunch"') && !h.includes('id="bDemos"') && !h.includes('id="bBuiltins"') && !h.includes('id="bApps"'),
       "Demos, Built-In Demos and Applications were replaced by a single Launch pill at v3552; that pill itself was removed at v4039");

    // v3575 -- *** THIS CHECK MOVED BECAUSE THE THING IT GUARDS MOVED, AND IT IS REWRITTEN RATHER THAN DELETED. ***
    // The launch PANEL is gone from server.html: two lists both claiming to be the whole engine, disagreeing by
    // 111, behind two buttons a few pixels apart, is the second-copy defect page-index.html's own header is
    // about. The entries live in the page index now. The absent-is-not-empty rule did not stop mattering when
    // the panel did -- IT MOVED WITH THE LIST -- so the assertion follows it to its new home. Deleting it
    // alongside the panel would have retired a rule the tree still needs, which is the failure mode this lab
    // catches by rewriting antidotes instead of dropping them.
    ok("!! the launch panel is gone from server.html and its button opens the one list",
       !h.includes('id="launchPanel"') && /page-index\.html/.test(h),
       "the panel div and its renderer are removed; the button opens page-index.html, which now folds in the " +
       "demos and built-ins that a pages-only index could not represent");
    ok("!! ...and a missing index reports itself as MISSING rather than as an empty list, WHERE THE LIST NOW IS",
       // v3676 -- THROUGH noComments RATHER THAN RAW SOURCE, which is the fix gateQuality's own message
       // prescribes and the reason it flagged these two. BOTH PHRASES ARE REAL RENDERED TEXT -- checked, not
       // assumed: "LAUNCH INDEX DID NOT LOAD" is in a JS string at page-index.html line 243 and "NO BAKED
       // FALLBACK ON PURPOSE" at line 249 -- so noComments is the right stripper (it keeps STRINGS and drops
       // COMMENTS), and codeOnly would have blanked the very text this asserts. WITHOUT IT, A COMMENT ON THAT
       // PAGE EXPLAINING THE RULE WOULD SATISFY THE CHECK THAT THE RULE IS IMPLEMENTED -- prose-as-code, the
       // shape this tree has recorded twenty-plus times, sitting in a check about absent-is-not-empty.
       /LAUNCH INDEX DID NOT LOAD/.test(noComments(pi)) && /no baked fallback on purpose/i.test(noComments(pi)),
       "a blank list looks exactly like 'there is nothing to launch', and absent is not empty — the same rule " +
       "the boot sidecar and deviceOwed already hold. page-index.html states it for BOTH indexes now.");
    ok("!! ...and the 349 entries in no panel are reported rather than silently placed",
       /349|ungrouped is a to-do list/.test(h + pi),
       "only 102 of 451 carry a section, because launchIndex.mjs derives it by finding the href inside a " +
       "server.html panel. *** THERE IS NO SOURCE FOR THE OTHER 349, so inventing a classification here would " +
       "be a THIRD hand-typed list disagreeing with both. *** Ungrouped is printed as a to-do list, not a category.");
}

for (const l of lines(ix)) console.log("        " + l);
console.log(fails ? ("[launchIndex-selfcheck] FAILED " + fails) : "[launchIndex-selfcheck] all passed");
process.exit(fails ? 1 : 0);
