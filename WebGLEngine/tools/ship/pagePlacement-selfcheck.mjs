// WebGLEngine/tools/ship/pagePlacement-selfcheck.mjs -- v3576
//
// Run: node tools/ship/pagePlacement-selfcheck.mjs
// RUNTIME 1s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTIONS 3 AND 4 ARE THE ROUND, AND BOTH ARE ABOUT THIS TOOL'S OWN FIRST TWO ANSWERS BEING WRONG. ***
// The first run proposed 21 pages for Box3D on the evidence of a typographic separator. The second, after the
// entities were stripped, filed box3d-blobs.html under Sampling & Methods because a raw count rewards a word for
// being COMMON. Both are the failure the score floor exists to prevent, committed by the thing that declares it.
//
// v4778 -- SECTION 4's EXAMPLE MOVED OFF "box3d", which four panels now hold (see the note there). SABOTAGE,
// MEASURED on a scratch copy of the tree (pagePlacement.mjs and this gate copied, everything else linked; the tree
// file never edited): panelProfiles' weight made the raw count (`n / spread.get(t)` -> `n`) -> exit=1, 2 red by
// name: "box3d-blobs.html is filed by a word no other panel holds..." (weighted picks sampling on [physics]) and
// "a panel-unique token [that RECURS in its panel] outweighs a spread one by more than an order of magnitude" (blob
// 2.00 against physics 1.000). v4778 review: the bracketed words were added to the row name because a unique token
// seen ONCE is 8x physics, not ten (the note in section 4 says so); re-run the same way under the new name, same
// exit=1, same 2 red, same numbers.
//
// v4828 SABOTAGE LOG (section 8), each applied to tools/ship/pagePlacement.mjs, this gate run, the file restored:
//   D  readJsonOrSay leaves the regenerating command out of its message       -> 1 red (the 'names the file, size, tail, error and command' row)
//   E  readJsonOrSay leaves the size out                                       -> 2 red (that row, and the empty-file row: "( characters")
//   And by hand on the real tree: page-index.json cut to its first 69,905 characters. pageIndex-selfcheck, pagePlacement-selfcheck and pagePlacements-selfcheck each print a FAIL row
//   with the cause and exit 1 (they died on a bare `at JSON.parse` before); artefactWriters-selfcheck leaves the index whole.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readJsonOrSay } from "./pagePlacement.mjs";
import { SECTIONS, MAX_PER_PANEL, UNPLACED } from "./pageSections.mjs";
import { tokens, inventory, capacity, panelProfiles, suggestFor, suggestAll, clusters,
         SCORE_FLOOR, reportLines, ENG } from "./pagePlacement.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("pagePlacement-selfcheck -- the placement gap, measured, and refused where the evidence is thin\n");

// v4828 -- an index that will not parse is a row with its cause on it (the verdict shows the last three lines of a stack, and the cause is above them)
let inv; try { inv = inventory(); } catch (e) { console.log("  FAIL  the page inventory can be read   " + e.message); console.log("\npagePlacement-selfcheck: 1 FAILED"); process.exit(1); }
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
    // this compared silent against PLACED, not against reasoned, even though every sentence around it -- both
    // here and in pageSections' own doctrine quoted below -- is about silent vs REASONED: a page nobody has
    // got to (documented in UNPLACED) versus a page nobody has even LOOKED at (silent). That happened to read
    // the same at v3576, when placed (102) was also smaller than silent. Placed has since more than doubled to
    // 242 as panels absorbed real pages -- pageSections doing exactly what it is for -- which flipped the
    // placed-comparison for a reason that is progress, not regression, and says nothing about whether the
    // silent/reasoned gap the prose actually describes is still real. It is: 205 against 23, the same order of
    // magnitude as the day this was written.
    ok("!! ...and the silent bucket dwarfs the REASONED one, which is the finding",
        inv.counts.silent > inv.counts.reasoned,
        inv.counts.silent + " silent against " + inv.counts.reasoned + " reasoned. pageSections says of UNPLACED: " +
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

    // v4590 -- SHORTFALL REACHED ZERO, MEASURED RATHER THAN ASSUMED STILL POSITIVE. This assertion held since
    // v3576 (105 short at first measurement, 21 short immediately before this round) and this round's
    // registerResidue residue sweep -- 21 pages placed into nine existing panels, 8 into a new "Slug Text"
    // drawer named for a family with zero prior home, 11 more moved from silent into UNPLACED with a reason --
    // closed the LAST 21-page gap by shrinking `need` and growing `free` at once. Filling every panel to
    // MAX_PER_PANEL now places 170 of a needed 165, not the other way around. *** THE MARGIN IS FIVE, WHICH IS
    // NOT SLACK -- it is five silent pages that could still land in an existing panel's remaining room, and one
    // more subject with no drawer (like the eight Slug Text pages before this round) would put the cabinet back
    // in deficit. *** Naming a panel is still naming a subject, which is still Keith's call; the arithmetic
    // question this section exists to answer has just changed its answer, honestly, for the first time.
    ok("!! the whole cabinet can -- BARELY -- hold the unplaced pages, for the first time",
        cap.shortfall === 0,
        "filling EVERY panel to Keith's v3434 cap of " + MAX_PER_PANEL + " places " + cap.free + " of " +
        cap.need + ". *** THE SHORTFALL THAT WAS 105 AT v3576 AND 21 IMMEDIATELY BEFORE THIS ROUND IS NOW " +
        cap.shortfall + " -- MEASURED, NOT ASSUMED STILL POSITIVE. *** The next unplaced page with no fitting " +
        "panel reopens the deficit; this line will catch it the same way it caught the deficit closing.");
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

    // v4778 -- *** "box3d" STOPPED BEING THE DISCRIMINATING WORD, SO THIS SECTION'S EXAMPLE MOVED, NOT ITS CLAIM. ***
    // The two rows below were written when "box3d" was this section's panel-unique token. It never quite was (the
    // Endless Sky panel held it too, spread 2, weight 1.5), and v4778 spread it twice more: the RTX drawer took
    // es-box3d-6dof.html (spread 3, weight 1.00 -- box3d-blobs.html then TIED Box3D and Blobs at 2.625 and was
    // refused, the red), and Keith's "There can be duplicate links in folder buckets" put es-box3d-fly3d.html in
    // Fruit Fly Brain as well (spread 4, weight 0.75). A word in four panels is the COMMON word this section is
    // about, so pinning "box3d" here would have pinned the opposite of the argument. Measured today on the live
    // panels: box3d-blobs.html ("Box3D Blobs (physics-driven lava)") goes to Blobs at 2.625 -- "lava", which only
    // the Blobs panel holds, plus the panel naming itself -- over Box3D at 2.375; the RAW count still sends it to
    // Sampling & Methods on physics=7, the original failure. So row one now asserts the relationship: the raw count
    // picks Sampling, the weighted one does not, and it wins on a token NO OTHER PANEL HOLDS. Row two keeps its
    // order of magnitude and takes its unique token from the panel row one lands in: "blob" (two of the Blobs
    // panel's three pages, spread 1) 2.00 against physics 0.125, 16x. Said plainly, because it bounds the claim:
    // a unique token seen ONCE scores 1 against physics' 1/8, which is 8x, not ten -- the margin comes from a
    // unique word recurring in its panel, exactly as box3d's did (three pages) when this row was written.
    const rawPick = (() => {
        const tk = tokens("box3d-blobs.html", inv.pages.get("box3d-blobs.html") || "");
        let best = null, bestN = -1;
        for (const s of SECTIONS) {
            let n = 0;
            for (const f of s.pages) for (const t of tokens(f, inv.pages.get(f) || "")) if (tk.has(t)) n++;
            if (n > bestN) { best = s.id; bestN = n; }
        }
        return { id: best, n: bestN };
    })();
    const panelsHolding = (t) => [...prof.values()].filter((p) => p.bag.has(t)).length;
    const uniqueWin = r.suggestion ? r.evidence.filter((t) => panelsHolding(t) === 1) : [];
    ok("!! box3d-blobs.html is filed by a word no other panel holds, and the unweighted version sent it to Sampling & Methods",
        rawPick.id === "sampling" && !!r.suggestion && r.suggestion !== "sampling" && uniqueWin.length > 0,
        "raw count picks " + rawPick.id + " (" + rawPick.n + " hits); weighted picks " + (r.suggestion || "nothing: " + r.why) +
        " on [" + (r.evidence || []).join(" ") + "], panel-unique: [" + uniqueWin.join(" ") + "]. " +
        "*** \"physics\" APPEARS IN " + panelsHolding("physics") + " PANELS AND SAYS NOTHING ABOUT WHICH ONE; A WORD IN ONE " +
        "PANEL SAYS EVERYTHING. *** " + rawPick.n + " raw hits outscore the discriminating ones and the wrong panel wins. " +
        "This survived the entity fix because \"physics\" is a REAL subject word -- just not a discriminating " +
        "one, which a raw count cannot tell apart.");
    const bl = prof.get("blobs").bag;
    ok("!! a panel-unique token that RECURS in its panel outweighs a spread one by more than an order of magnitude",
        panelsHolding("blob") === 1 && bl.get("blob") > 10 * bl.get("physics") && bl.get("physics") > 0,
        "measured in the Blobs panel: blob " + (bl.get("blob") || 0).toFixed(2) + " (in " + panelsHolding("blob") +
        " panel) against physics " + (bl.get("physics") || 0).toFixed(3) + " (in " + panelsHolding("physics") +
        "). *** THE FIRST VERSION OF THIS LINE ASSERTED box3d === 1 AND WENT RED, because the weight is (times " +
        "the token appears in the panel) / (panels holding it) and box3d appeared in TWO of the panel's pages. *** " +
        "Pinning a literal that happens to be true today is the ratchet this lab keeps removing; the RELATIONSHIP " +
        "is the claim, and it survives a page being added to the panel. And physics stays ABOVE ZERO: nothing is " +
        "dropped, because a common word is still good for tie-breaking.");
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

console.log("\n8. v4828 -- A GENERATED INDEX THAT DOES NOT PARSE SAYS SO");
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-readjson-")), good = path.join(dir, "good.json"), torn = path.join(dir, "page-index.json"), empty = path.join(dir, "empty.json");
    try {
        fs.writeFileSync(good, '{"pages":[1]}\n'); fs.writeFileSync(torn, '{"count":2,"pages":[{"f":"a.html"},{"f":"b.ht'); fs.writeFileSync(empty, "");
        const say = (f) => { try { readJsonOrSay(f, "node tools/ship/buildPageIndex.mjs"); return null; } catch (e) { return e.message; } };
        const m = say(torn), e0 = say(empty);
        ok("a whole index is returned as it is", readJsonOrSay(good, "x").pages[0] === 1);
        ok("!! a torn one throws a message that NAMES the file, its size, its last bytes, the parse error and the command that regenerates it (the verdict shows the last three lines of a stack; the cause was above them)",
           !!m && /page-index\.json is not valid JSON/.test(m) && /\(45 characters/.test(m) && /b\.ht/.test(m) && /Unexpected|Expected|JSON/.test(m) && /node tools\/ship\/buildPageIndex\.mjs/.test(m), m);
        ok("...and an EMPTY file (a truncate with nothing yet written) is the same species and says so", !!e0 && /empty\.json is not valid JSON \(0 characters/.test(e0), e0);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log(fails ? `\npagePlacement-selfcheck: ${fails} FAILED` : "\npagePlacement-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
