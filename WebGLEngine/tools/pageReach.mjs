// WebGLEngine/tools/pageReach.mjs — v2609
//
// A PAGE THAT IS NOT LINKED IS NOT SHIPPED.
//
// ---- WHERE THIS CAME FROM ----------------------------------------------------------------------------------------
//
// Keith: "Do we have a Krbn link in the Arriving Pages section?"
//
// NO. I built krbn.html in v2608, gated it, rendered it in a real browser, wrote a claim about it -- AND LINKED
// IT FROM NOWHERE. It appears in exactly one place in the tree: inside predictions.html, in my own claim about
// itself. HE WOULD HAVE HAD TO TYPE THE URL FROM A CHANGELOG.
//
// So I counted, and it is not one page:
//
//     .html in the tree root:  239
//     linked from server.html: 133
//     INVISIBLE:               106        <- FORTY-FOUR PERCENT
//
// AND blobarium.html IS ONE OF THEM. I have told Keith to open /blobarium.html in FIVE SEPARATE ROUNDS -- it is
// the page the whole aquarium arc is about, the one with the vitals, the one I asked him to drag the warmth
// slider on and walk away from -- AND IT HAS NEVER BEEN LINKED FROM ANYTHING. He would have had to type it.
//
// That explains his own sentence, which I should have heard as a bug report the first time:
// "inside 'SweK Engine Pages (Chrome-friendliest)' we have some new pages that i have not seen".
// HE HAS BEEN DISCOVERING HIS OWN WORK BY ACCIDENT.
//
// ---- WHY THE GATE IS THE POINT AND THE LINK IS NOT ----------------------------------------------------------------
//
// Adding krbn.html to the Arriving list fixes today. IT DOES NOT FIX THE NEXT ONE. v2513 built ARRIVING PAGES
// as an inbox -- new work lands there, Keith reviews it, it moves to a panel -- and THE INBOX ONLY WORKS IF
// ARRIVING IS AUTOMATIC. An inbox you have to remember to put things in is a pile.
//
// So: every .html in the tree is either LINKED from server.html, or listed in NOT_FOR_THE_FRONT_DOOR with a
// REASON. Not a blanket ignore -- A LINE PER PAGE, EACH ONE A DECISION SOMEBODY MADE ON PURPOSE. The gate makes
// a new unlisted page fail the ship, which means the only way to add a page is to decide where it goes.
//
// A CHECK NOT IN THE GATE IS NOT BEING RUN, and until today there was no check at all: A PAGE COULD BE BORN
// INVISIBLE AND NOTHING ANYWHERE WOULD NOTICE.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Pages that legitimately have no front-door link, each with the reason it does not.
 *
 * THIS LIST IS DELIBERATELY NOT A WILDCARD. Every entry is a decision. If it were `*-test.html` then a page
 * called `blobarium-test.html` would vanish silently, WHICH IS THE EXACT BUG THIS FILE EXISTS FOR.
 */
export const NOT_FOR_THE_FRONT_DOOR = {
    "server.html": "IS the front door",
    "index.html": "the engine entry point, not a page in the list",
};

/** Every .html sitting in the tree root. */
export function allPages(root) {
    return fs.readdirSync(root).filter((f) => f.endsWith(".html")).sort();
}

/** Which of them does server.html actually mention? */
export function linkedPages(root) {
    const src = fs.readFileSync(path.join(root, "server.html"), "utf8");
    return new Set(allPages(root).filter((p) => src.includes(p)));
}

/**
 * The report. `invisible` is the list that should be empty at ship time.
 *
 * NOTE WHAT THIS DOES *NOT* CHECK: that the link is in the RIGHT section, or that it is not commented out, or
 * that the href resolves. It checks that server.html MENTIONS THE FILENAME. That is a weak check and I am
 * saying so rather than letting it look stronger than it is -- BUT IT IS THE CHECK THAT WOULD HAVE CAUGHT
 * krbn.html AND blobarium.html, WHICH IS THE BUG I ACTUALLY HAVE.
 */
export function reachReport(root) {
    const all = allPages(root);
    const linked = linkedPages(root);
    const excused = Object.keys(NOT_FOR_THE_FRONT_DOOR);
    const invisible = all.filter((p) => !linked.has(p) && !excused.includes(p));
    const staleExcuse = excused.filter((p) => !all.includes(p));   // an excuse for a page that no longer exists
    return { total: all.length, linked: linked.size, excused: excused.length, invisible, staleExcuse };
}

if (typeof process !== "undefined" && import.meta.url === "file://" + process.argv[1]) {
    const r = reachReport(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
    console.log("pages: " + r.total + "  linked: " + r.linked + "  excused: " + r.excused + "  INVISIBLE: " + r.invisible.length);
    for (const p of r.invisible) console.log("  " + p);
}
