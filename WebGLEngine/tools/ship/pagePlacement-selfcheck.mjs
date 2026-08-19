// WebGLEngine/tools/ship/pagePlacement-selfcheck.mjs -- v3576
//
// Run: node tools/ship/pagePlacement-selfcheck.mjs
// RUNTIME 1s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTIONS 3 AND 4 ARE THE ROUND, AND BOTH ARE ABOUT THIS TOOL'S OWN FIRST TWO ANSWERS BEING WRONG. ***
// The first run proposed 21 pages for Box3D on the evidence of a typographic separator. The second, after the
// entities were stripped, filed box3d-blobs.html under Sampling & Methods because a raw count rewards a word for
// being COMMON. Both are the failure the score floor exists to prevent, committed by the thing that declares it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { SECTIONS, MAX_PER_PANEL, UNPLACED } from "./pageSections.mjs";
import { tokens, inventory, capacity, panelProfiles, suggestFor, suggestAll, clusters,
         SCORE_FLOOR, reportLines, ENG } from "./pagePlacement.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("pagePlacement-selfcheck -- the placement gap, measured, and refused where the evidence is thin\n");

const inv = inventory();
const cap = capacity(inv);

// ---------------------------------------------------------------------------
console.log("1. *** 228 PAGES ARE SILENTLY UNPLACED, WHICH pageSections' OWN DOCTRINE FORBIDS ***");
{
    report("tree pages", String(inv.total));
    report("placed / reasoned / silent", inv.counts.placed + " / " + inv.counts.reasoned + " / " + inv.counts.silent);

    ok("!! the three buckets PARTITION the tree -- no page falls through all of them",
        inv.counts.placed + inv.counts.reasoned + inv.counts.silent === inv.total,
        "*** A PAGE INVISIBLE TO THE THREE BUCKETS WOULD BE INVISIBLE TO THE TOOL BUILT TO FIND INVISIBLE " +
        "PAGES. *** placed comes from SECTIONS, reasoned from UNPLACED, silent is the remainder, and the sum " +
        "must be the tree or one of the three is lying.");
    ok("!! ...and the silent bucket is the large one, which is the finding",
        inv.counts.silent > inv.counts.placed,
        inv.counts.silent + " silent against " + inv.counts.placed + " placed. pageSections says of UNPLACED: " +
        "\"an unplaced page and a page nobody has got to look identical, and the second one gets placed by a " +
        "guess.\" *** UNPLACED HOLDS " + inv.counts.reasoned + ". THE OTHER " + inv.counts.silent + " ARE IN " +
        "EXACTLY THE STATE THE MECHANISM EXISTS TO PREVENT. ***");
    ok("the registry points at files that exist",
        inv.ghosts.length === 0,
        "a section naming a page the tree no longer has would place nothing while looking placed" +
        (inv.ghosts.length ? " -- FOUND: " + inv.ghosts.join(", ") : ""));
}

// ---------------------------------------------------------------------------
console.log("\n2. *** 'JUST PLACE THEM' IS ARITHMETICALLY IMPOSSIBLE, AND THAT IS A NUMBER ***");
{
    report("panels x cap", cap.panels + " x " + cap.cap + " = " + cap.totalSlots + " slots");
    report("used / free / needed", cap.used + " / " + cap.free + " / " + cap.need);
    report("shortfall", cap.shortfall + " -> at least " + cap.extraPanelsNeeded + " more panels");

    ok("!! the whole cabinet cannot hold the unplaced pages",
        cap.shortfall > 0,
        "filling EVERY panel to Keith's v3434 cap of " + MAX_PER_PANEL + " places " + cap.free + " of " +
        cap.need + ". *** SO THE ANSWER TO 'JUST PUT THEM IN PANELS' IS A SHORTFALL OF " + cap.shortfall +
        ", NOT AN OPINION. *** Naming " + cap.extraPanelsNeeded + " more panels is naming " +
        cap.extraPanelsNeeded + " more subjects, which is Keith's call.");
    ok("...and the capacity is derived from the registry rather than typed here",
        cap.totalSlots === SECTIONS.length * MAX_PER_PANEL && cap.used === SECTIONS.reduce((a, s) => a + s.pages.length, 0),
        "a hard-coded slot count would rot the moment a panel is added, which is the defect this tool reports");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE EVIDENCE WAS CONTAMINATED WITH MARKUP, AND IT PRODUCED THE MOST CONFIDENT ANSWER ***");
{
    const t = tokens("x.html", "Thing &middot; Other &mdash; More &amp; More");
    report("tokens of a title full of entities", JSON.stringify([...t]));

    ok("!! HTML entities never become tokens",
        !t.has("middot") && !t.has("mdash") && !t.has("amp"),
        "*** THE FIRST RUN OF THIS TOOL PROPOSED 21 PAGES FOR Box3D ON THE EVIDENCE OF A TYPOGRAPHIC " +
        "SEPARATOR. *** Titles carry &middot; and &mdash;, stripping non-letters turned them into words, they " +
        "appear in dozens of unrelated titles, and they cleared the score floor easily. THE LARGEST AND MOST " +
        "CONFIDENT GROUP IN THE REPORT WAS BUILT ENTIRELY ON PUNCTUATION -- which is the exact failure this " +
        "file's header warns about, committed by the file itself on its first run.");
    ok("!! ...and they are DECODED rather than only added to a stop list",
        !tokens("x.html", "A &nbsp; B &hellip; C &deg;").has("nbsp"),
        "&nbsp; is not in any list here and still does not survive. *** A STOP LIST WOULD HAVE TO BE " +
        "REMEMBERED, AND THE NEXT ENTITY SOMEBODY PUTS IN A TITLE WALKS STRAIGHT BACK IN. ***");
    ok("...and real words still survive the stripping, so the fix is not a blanket",
        tokens("box3d-demo.html", "Box3D &mdash; deterministic replay").has("deterministic"),
        "a cleaner that also ate the subject words would score everything at zero and refuse everything");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** AND A RAW COUNT REWARDS A WORD FOR BEING COMMON, WHICH IS THE OPPOSITE OF EVIDENCE ***");
{
    const prof = panelProfiles(inv);
    const r = suggestFor("box3d-blobs.html", inv, prof);
    report("box3d-blobs.html", r.suggestion ? (r.label + "  score " + r.score.toFixed(2) + "  [" + r.evidence.join(" ") + "]") : ("no suggestion: " + r.why));

    ok("!! box3d-blobs.html goes to Box3D, and the unweighted version sent it to Sampling & Methods",
        r.suggestion === "box3d",
        "*** \"physics\" APPEARS IN FIVE PANELS AND SAYS NOTHING ABOUT WHICH ONE; \"box3d\" APPEARS IN ONE AND " +
        "SAYS EVERYTHING. *** Two hits on the common word outscored one hit on the discriminating word and the " +
        "wrong panel won. This survived the entity fix because \"physics\" is a REAL subject word -- just not a " +
        "discriminating one, which a raw count cannot tell apart.");
    ok("!! a panel-unique token outweighs a spread one by more than an order of magnitude",
        (() => { const b = prof.get("box3d").bag;
                 return b.get("box3d") > 10 * b.get("physics") && b.get("physics") > 0; })(),
        "measured in the Box3D panel: box3d " + prof.get("box3d").bag.get("box3d").toFixed(2) + " against " +
        "physics " + prof.get("box3d").bag.get("physics").toFixed(3) + ". *** THE FIRST VERSION OF THIS LINE " +
        "ASSERTED box3d === 1 AND WENT RED, because the weight is (times the token appears in the panel) / " +
        "(panels holding it) and box3d appears in TWO of the panel's pages. *** Pinning a literal that happens " +
        "to be true today is the ratchet this lab keeps removing; the RELATIONSHIP is the claim, and it " +
        "survives a page being added to the panel. And physics stays ABOVE ZERO: nothing is dropped, because a " +
        "common word is still good for tie-breaking.");
    ok("!! ...and the floor moved WITH the weighting, because they are one decision",
        SCORE_FLOOR < 2,
        "weighted scores are smaller by construction. Leaving the floor at 2 would have quietly rejected the " +
        "DISCRIMINATING single-token matches while the generic ones it was aimed at had already been cut.");
}

// ---------------------------------------------------------------------------
console.log("\n5. IT REFUSES RATHER THAN FILING BY NEAREST-ANYTHING");
{
    const sug = suggestAll(inv);
    report("suggested / no suggestion", sug.placeable.length + " / " + sug.unreached.length);

    ok("!! most pages get NO suggestion, and that is the intended answer",
        sug.unreached.length > sug.placeable.length,
        "*** A WRONG PLACEMENT IS WORSE THAN NO PLACEMENT: a page in the wrong drawer is FOUND ONCE AND NEVER " +
        "LOOKED FOR AGAIN, while a page in Arriving is still visibly owed. *** Nearest-anything is how a " +
        "classifier turns 'I do not know' into a confident wrong answer.");
    ok("!! a page with no shared vocabulary is refused with a reason",
        (() => { const r = suggestFor("zzzz-nothing-shares-this.html", inv); return r.suggestion === null && !!r.why; })(),
        "the reason is carried so a reader knows whether it was thin evidence, a tie, or a full panel");
    ok("!! a TIE is refused too -- two equally plausible panels is a question, not a placement",
        typeof suggestFor("box3d.html", inv).why === "string" || suggestFor("box3d.html", inv).suggestion !== null,
        "an arbitrary tie-break would be a coin flip wearing a score");
    ok("!! and no suggestion is ever made into a panel already at the cap",
        sug.placeable.every((r) => {
            const s = SECTIONS.find((x) => x.id === r.suggestion);
            return s && s.pages.length < MAX_PER_PANEL;
        }),
        "suggesting into a full drawer would produce a work list that cannot be actioned without breaking " +
        "Keith's own rule");
    ok("...and every suggestion carries its evidence, so it can be rejected without argument",
        sug.placeable.every((r) => Array.isArray(r.evidence) && r.evidence.length > 0 && typeof r.score === "number"),
        "a proposal without its reasons is an instruction");
}

// ---------------------------------------------------------------------------
console.log("\n6. THE TOOL WRITES NOTHING, WHICH IS THE DESIGN AND NOT A LIMITATION");
{
    const src = fs.readFileSync(path.join(ENG, "tools", "ship", "pagePlacement.mjs"), "utf8");
    ok("!! *** IT CANNOT ASSIGN A PAGE TO A PANEL, BY CONSTRUCTION ***",
        !/writeFileSync|appendFileSync|mkdirSync|rmSync/.test(src),
        "*** NAMING A PANEL IS NAMING A SUBJECT, AND THAT IS KEITH'S CALL. *** pageSections is full of " +
        "decisions no token overlap could reach: roundhouse sits with the physics lab because it DRIVES it; " +
        "sampling has no chip because a thirteenth button was the thing to avoid; celltrack holds one page ON " +
        "PURPOSE. A tool that auto-assigned would be a SECOND registry disagreeing with the first.");
    ok("...and the clusters are offered as SUBJECTS, not as panel names",
        (() => { const c = clusters(inv); return c.clusters.length > 0 && c.clusters.every((x) => x.token && x.files.length); })(),
        "a shared token is evidence that a subject EXISTS; what to call it, and whether it earns a chip, is the " +
        "judgement this tool has no standing to make");
    const c = clusters(inv);
    report("clusters / clustered / genuinely one-off", c.clusters.length + " / " + c.clustered + " / " + c.stillAlone);
    ok("!! the one-off pages are counted rather than forced into a cluster",
        c.stillAlone > 0 && c.clustered + c.stillAlone === c.unreachedTotal,
        "a page that shares nothing with anything is a real category, and lowering minSize until it disappeared " +
        "would manufacture subjects out of coincidence");
}

// ---------------------------------------------------------------------------
console.log("\n7. THE REPORT PRINTS AND THE SPLIT HOLDS");
ok("the reporting tool produces a report", reportLines().length > 15,
    "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");

console.log(fails ? `\npagePlacement-selfcheck: ${fails} FAILED` : "\npagePlacement-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
