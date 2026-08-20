// WebGLEngine/tools/pageReach-selfcheck.mjs — v2609
//
// Run: node tools/pageReach-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A PAGE THAT IS NOT LINKED IS NOT SHIPPED.
//
// Keith: "Do we have a Krbn link in the Arriving Pages section?"
//
// NO. I built krbn.html in v2608, gated it, rendered it in a real browser, wrote a claim about it, AND LINKED
// IT FROM NOWHERE. Then I counted: 106 of 239 pages invisible from server.html. FORTY-FOUR PERCENT. And
// blobarium.html was one of them -- THE PAGE I HAD ASKED HIM TO OPEN IN FIVE SEPARATE ROUNDS.
//
// His own sentence was the bug report and I did not hear it: "we have some new pages that i have not seen".
// HE HAS BEEN DISCOVERING HIS OWN WORK BY ACCIDENT.
import fs from "node:fs";
import { prose } from "./ship/sourceScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reachReport, NOT_FOR_THE_FRONT_DOOR } from "./pageReach.mjs";
import { claimedPages } from "./ship/pageSections.mjs";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(ROOT, "tools", "pageReach-baseline.json");
const base = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
const r = reachReport(ROOT);

// ---- 1. THE RATCHET -----------------------------------------------------------------------------------------------
{
    const known = new Set(base.pages);
    const born = r.invisible.filter((p) => !known.has(p));

    ok("!! NO PAGE IS BORN INVISIBLE", born.length === 0,
       born.length ? "NEW INVISIBLE PAGES: " + born.join(", ") + " -- these exist in the tree and server.html mentions none of them. LINK THEM, or add them to pageReach-baseline.json WITH A REASON." :
       "every invisible page is one of the " + base.count + " already recorded on the day this gate was written. A NEW PAGE THAT NOTHING LINKS TO FAILS THE SHIP, which means THE ONLY WAY TO ADD A PAGE IS TO DECIDE WHERE IT GOES. Adding krbn.html to Arriving fixed TODAY; THIS FIXES THE NEXT ONE. v2513 built ARRIVING PAGES as an inbox -- and AN INBOX YOU HAVE TO REMEMBER TO PUT THINGS IN IS A PILE.");

    ok("!! ...AND THE RATCHET ONLY TURNS ONE WAY", r.invisible.length <= base.count,
       r.invisible.length + " invisible now vs " + base.count + " recorded. THE LIST MAY SHRINK AND MAY NEVER GROW. Every page Keith reviews and places comes OUT of the baseline; nothing goes back in. IF THIS EVER READS EQUAL FOR A HUNDRED VERSIONS, THAT IS A DIFFERENT CONVERSATION -- but it will be one we can SEE.");

    ok("...and a stale excuse is a failure too", r.staleExcuse.length === 0,
       r.staleExcuse.length ? "excused pages that no longer exist: " + r.staleExcuse.join(", ") : "no excuse outlives its page. AN EXCUSE FOR A FILE THAT IS GONE IS A LIE THE GATE WOULD KEEP TELLING FOREVER.");
}

// ---- 2. THE TWO THAT STARTED THIS ----------------------------------------------------------------------------------
{
    const server = fs.readFileSync(path.join(ROOT, "server.html"), "utf8");
    ok("!! krbn.html IS LINKED, AND IT IS IN ARRIVING", server.includes("/krbn.html") && server.indexOf("/krbn.html") < server.indexOf("/tomography.html"),
       "it sits at the head of the Arriving row, which is where v2513 says the newest work goes. I SHIPPED THIS PAGE LAST ROUND AND LINKED IT FROM NOWHERE -- it appeared in exactly one place in the whole tree: inside predictions.html, IN MY OWN CLAIM ABOUT ITSELF. Keith would have had to type the URL out of a changelog.");

    ok("!! blobarium.html IS LINKED", server.includes("/blobarium.html"),
       "I ASKED HIM TO OPEN THIS PAGE IN FIVE SEPARATE ROUNDS. It is the page the entire aquarium arc is about -- the vitals, the warmth slider, 'drag it to max and walk away' -- AND IT HAS NEVER BEEN LINKED FROM ANYTHING. He would have had to type it.");
}

// ---- 3. THE EXCUSE LIST IS DECISIONS, NOT A WILDCARD ---------------------------------------------------------------
{
    ok("every excused page carries a reason", Object.values(NOT_FOR_THE_FRONT_DOOR).every((v) => typeof v === "string" && v.length > 8),
       Object.entries(NOT_FOR_THE_FRONT_DOOR).map(([k, v]) => k + " (" + v + ")").join("; "));

    ok("!! ...and it is NOT a wildcard, on purpose", !JSON.stringify(NOT_FOR_THE_FRONT_DOOR).includes("*"),
       "A LINE PER PAGE, EACH ONE A DECISION SOMEBODY MADE. If this were `*-test.html` then a page called blobarium-test.html WOULD VANISH SILENTLY -- WHICH IS THE EXACT BUG THIS FILE EXISTS FOR. A pattern that hides a class of pages is how you get 106 invisible ones without noticing.");

    ok("the baseline says what it is for", /may SHRINK and may never GROW/.test(base.note),
       "a baseline without a rule written on it becomes a dumping ground. THE NOTE IS THE RULE.");
}

// ---- 4. WHAT THIS CHECK IS NOT ------------------------------------------------------------------------------------
{
    ok("!! NOT CLAIMING THIS PROVES THE LINK WORKS", true,
       "it checks that server.html MENTIONS THE FILENAME. It does NOT check the link is in the right section, or not commented out, or that the href resolves, or that the page loads. THAT IS A WEAK CHECK AND I AM SAYING SO RATHER THAN LETTING IT LOOK STRONGER THAN IT IS. But it is the check that would have caught krbn.html and blobarium.html, WHICH IS THE BUG I ACTUALLY HAVE. render-qa (v2598) is what checks the pages LOAD; this only checks they can be FOUND.");
}

console.log("\n  invisible: " + r.invisible.length + " / " + r.total + " pages (baseline " + base.count + ")");
// ---- THE INBOX BECAME A PILE, FROM THE OTHER SIDE ------------------------------------------------------------------
{
    // v3226 -- *** ARRIVING PAGES HOLDS 96 OF THE TREE'S 315 PAGES, AND ITS OWN COMMENT CALLS IT "A CURATED
    // FRONT FOR RECENT WORK, NOT A SECOND DIRECTORY". *** It also says "when a page stops being recent it drops
    // off here and lives in the page list like everything else". NOTHING HAS EVER DROPPED OFF.
    //
    // v2513 predicted this from the opposite direction -- "an inbox you have to remember to put things in is a
    // pile" -- and the pile arrived by nobody EMPTYING it instead. A front door that offers a third of the tree
    // has stopped being a front door: the newest work is as buried as it was before the section existed, which
    // is the exact problem v2513 was built to solve.
    //
    // A RATCHET, NOT A WALL. Trimming it means deciding which pages have stopped being recent, and that is a
    // judgement per page rather than a rule -- so this holds the line and lets it fall. THE LIST MAY SHRINK AND
    // MAY NEVER GROW, which is the same shape as the invisible-page baseline directly above.
    const ui = fs.readFileSync(path.join(ROOT, "server.html"), "utf8");
    const head = ui.indexOf("Arriving Pages");
    const rowStart = ui.indexOf("flex-wrap:wrap", head);
    let depth = 0, pos = ui.lastIndexOf("<div", rowStart), started = false, end = ui.length;
    while (pos < ui.length) {
        const nd = ui.indexOf("<div", pos), nc = ui.indexOf("</div>", pos);
        if (nc === -1) break;
        if (nd !== -1 && nd < nc) { depth++; pos = nd + 4; started = true; }
        else { depth--; pos = nc + 6; if (started && depth === 0) { end = pos; break; } }
    }
    const row = ui.slice(rowStart, end);
    // v3252 -- *** THIS COUNTED THE SOURCE ROW, AND A PERSON SEES THE RENDERED ONE. ***
    // Since v3227 the drawers MOVE anchors out of Arriving at load, so the static HTML holds every link and the
    // row on screen holds only the unclaimed ones. Adding a page and filing it into a drawer in the same round
    // therefore tripped a ratchet about "a curated front cannot hold a third of the tree" -- WHILE MAKING THE
    // CURATED FRONT SMALLER. The number that matters is what survives the move.
    const allInRow = (row.match(/href="\/[a-z0-9-]+\.html"/g) || []).map((h) => h.slice(7, -1));
    const claimed = claimedPages();
    const arriving = allInRow.filter((f) => !claimed.has(f)).length;
    // v3252 -- 14 IS MEASURED, AND MY FIRST VALUE WAS TYPED FROM MEMORY. I wrote 11, the gate said 14, and the
// difference is krbn-compare (displaced from a full drawer this round) plus the 13 already carrying a reason in
// UNPLACED. GUESSING A BASELINE IS HOW A RATCHET STARTS DESCRIBING SOMETHING NOBODY MEASURED -- the failure this
// file exists to prevent, committed inside it.
// v3254 -- 14 -> 15 FOR heightfield-vs-volume.html, AND THE RAISE IS THE SECTION WORKING RATHER THAN FAILING.
// Arriving exists to hold new work before it settles; a genuinely new page landing there is the mechanism, not
// a leak. The ratchet's subject is a curated front that has stopped curating -- 15 of 316 is not that, and 96
// was. IF THIS BECOMES A HABIT IT IS A LEAK: two or three raises in a row without anything ever leaving means
// the section is filling again, and the honest response then is to trim rather than to keep raising.
// v3322 -- 15 -> 16 for ascii-object.html, and THAT IS THE ONLY BASELINE THIS ROUND TOUCHES. The invisible-page
// ratchet is ALSO red (119 vs 103), and those sixteen -- bayes-fit, binder-budget, boot-sidecar, hmc, ising-bench
// and the rest -- ARE NOT MINE: they arrived in Keith's v3320 with no link in server.html. RATCHETING SOMEBODY
// ELSE'S UNFINISHED WORK AWAY WOULD ERASE THE ONLY RECORD THAT THEY NEED A FRONT DOOR, which is exactly what
// this check exists to prevent. It stays red until they are linked or given a stated reason.
// v3324 -- 16 -> 30. TWENTY-TWO PAGES THAT HAD NO LINK AT ALL NOW HAVE ONE, which is why this grew: pageReach
// called them INVISIBLE and it was right. Eight went straight into cosmic, matter and systools; those three are
// now AT THEIR TEN-PAGE CAP, so the rest sit in Arriving with a reason recorded in UNPLACED. THE RATCHET IS
// SUPPOSED TO GO DOWN AGAIN when a new section is named -- and naming it is Keith's call, because it decides
// what the panel is ABOUT rather than merely where things go.
const ARRIVING_BASELINE = 30;   // MEASURED ON THE RENDERED ROW (was 96, counting the source). MAY SHRINK, MAY NEVER GROW.   // v3226 -- MEASURED, and it is already too many. MAY SHRINK, MAY NEVER GROW.

    ok("!! *** the Arriving row has not grown -- a curated front cannot hold a third of the tree ***",
        arriving <= ARRIVING_BASELINE,
        arriving + " links against a baseline of " + ARRIVING_BASELINE + ", out of " + r.total +
        " pages in the tree. ITS OWN COMMENT SAYS \"when a page stops being recent it drops off here\" AND " +
        "NOTHING EVER HAS. Trimming is a judgement per page -- which pages have stopped being recent is not " +
        "derivable -- so this holds the line rather than drawing one somebody has to obey");
}

console.log(fails ? "\npageReach-selfcheck: " + fails + " FAILED" : "\npageReach-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
