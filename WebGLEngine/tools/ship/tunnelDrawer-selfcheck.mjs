// tools/ship/tunnelDrawer-selfcheck.mjs
//
// Run: node tools/ship/tunnelDrawer-selfcheck.mjs   (instant)
//
// v3162 -- KEITH'S LAYOUT LAW, and the trap in collapsing a live control.
//
// The rule was agreed rounds ago and never done: LEFT is hardware and always-available things, RIGHT is links
// and server processes that may not be running -- and TUNNEL ROTATION BEHIND A DRAWER BESIDE LOCK ASSETS, so
// the controls that are always there are not pushed down the page by a setting that is usually left alone.
//
// *** THE SUMMARY CARRIES THE STATE, AND THAT IS THE WHOLE DESIGN. *** v3040 fixed a bug in this very block --
// "THE CHECKBOX COULD LIE, AND THIS IS WHY IT LOOKED UNCHECKED WHILE ROTATION WAS RUNNING" -- and a drawer with
// a STATIC label hides an active rotation exactly as that checkbox did. The state would be INVISIBLE rather
// than WRONG, which is the same failure with better manners: you close the drawer, the box says "Tunnels", and
// the server rotates every four hours without a word.
//
// AND I INTRODUCED THAT BUG WHILE BUILDING THE GUARD AGAINST IT. paint() gained an `enabled` argument and TWO
// of its three call sites -- including THE RESTORE PATH, which is the one that runs on page load -- still
// passed only the interval. With `enabled` undefined the summary reads "Tunnels" while rotation runs. Caught by
// grepping the callers rather than by thinking about it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const page = fs.readFileSync(path.join(ENG, "server.html"), "utf8");

// ---- 1. THE DRAWER IS WHERE KEITH ASKED FOR IT ---------------------------------------------------------------
{
    const seg = page.slice(page.indexOf('id="serverControls"'), page.indexOf("SweK Engine Peers"));
    ok("!! the tunnel rotation is a DRAWER, beside Lock assets",
        /<details id="tunnelDrawer"/.test(seg) && /bAssetLock/.test(seg),
        "agreed rounds ago and never done. It was a full-height block pushing the always-there controls down " +
        "the page for a setting that is usually left alone");

    ok("...and the markup balances",
        (() => { const o = (seg.match(/<div\b/g) || []).length, c = (seg.match(/<\/div>/g) || []).length;
                 const dO = (seg.match(/<details\b/g) || []).length, dC = (seg.match(/<\/details>/g) || []).length;
                 return o === c && dO === dC && dO === 1; })(),
        "MY FIRST VERSION LEFT A STRAY </div> -- 2 opens against 3 closes. An unbalanced tag in a 5,291-line " +
        "page does not throw, it silently reparents everything after it, and no gate here renders HTML");

    ok("...and the whole file still balances too",
        (() => { const O = (page.match(/<div\b/g) || []).length, C = (page.match(/<\/div>/g) || []).length; return O === C; })(),
        "checked whole-file as well as in the segment, because a stray tag anywhere is the same failure and the " +
        "segment bound was chosen by me");
}

// ---- 2. THE SUMMARY CARRIES THE STATE, WHICH IS THE POINT --------------------------------------------------------
{
    // *** v3941 -- BOTH OF THESE ASSERTED THE EXACT IMPLEMENTATION v3741 REMOVED FOR CAUSE, so the gate was
    // RED FOR THE FIX. *** They demanded `summary.innerHTML = enabled ? ...`, and that line did two kinds of
    // damage the comment beside it now records: it RENAMED THE DRAWER (the markup says "Tunnels, Clouds, &
    // Hosting", this rewrote it to "Tunnels" on load -- two declarations about one label, last writer wins),
    // and it DESTROYED A SIBLING (#tchCounts lives inside that summary and is filled by the partial-transfer
    // poll, so the rewrite deleted a node another writer had just populated -- a race nobody would attribute
    // to a label). THE ONLY WAY TO SATISFY THE OLD REGEX WAS TO PUT BOTH BUGS BACK.
    //
    // The DESIGN never changed and is what is checked now: the summary carries the rotation state, and one
    // function paints it together with the value. The rotation went into its own span so the name is markup,
    // the counts are the poll's, and the rotation is paint()'s -- three writers that cannot overwrite each
    // other. THE SECOND CHECK ALSO HAD A CAP THAT HAD SIMPLY BEEN OUTGROWN: [\s\S]{0,400} against a body that
    // is 1163 characters, so it would have gone red on comment growth alone. A bound chosen to fit today's
    // file is a slow-acting false alarm, and this one went off.
    const paintBody = (() => {
        const m = page.match(/function paint\(h, enabled\)\{[\s\S]*?\n    \}/);
        return m ? noComments(m[0]) : "";
    })();
    const codePage = noComments(page);

    ok("!! the summary is UPDATED from the state, not a static label",
        /id="tunnelRot"/.test(page) && /rot\.innerHTML = enabled \?/.test(paintBody),
        "a closed drawer reading 'Tunnels' while rotation runs is v3040's lying checkbox with better manners -- " +
        "INVISIBLE instead of WRONG, and you act on it the same way");

    ok("!! ...and the state slot lives INSIDE the summary, or the drawer can be shut over it",
        (() => { const sm = page.match(/<summary id="tunnelSummary"[\s\S]*?<\/summary>/);
                 return !!sm && /id="tunnelRot"/.test(sm[0]) && /id="tchCounts"/.test(sm[0]); })(),
        "a rotation indicator painted below the fold is exactly the invisible state this drawer was built to " +
        "prevent -- and #tchCounts is checked beside it because it is the sibling the old rewrite deleted");

    ok("!! ONE function paints the label and the value together",
        !!paintBody && /val\.textContent/.test(paintBody) && /tunnelRot/.test(paintBody) &&
        (page.match(/function paint\(h, enabled\)/g) || []).length === 1,
        "updating the summary somewhere else would be TWO DECLARATIONS ABOUT ONE THING -- the shape this " +
        "session has found five times -- and the failure mode is precisely a closed drawer disagreeing with the " +
        "controls inside it");

    ok("!! ...and NOTHING ELSE IN THE PAGE WRITES THAT SLOT -- one declaration, shown rather than assumed",
        (codePage.match(/getElementById\("tunnelRot"\)/g) || []).length === 1 &&
        (page.match(/id="tunnelRot"/g) || []).length === 1,
        "*** THIS IS THE CHECK THE OLD ONE WAS REACHING FOR AND COULD NOT MAKE: 'paint writes the summary' " +
        "says nothing about whether somebody ELSE also does. *** A second writer is how the drawer label and " +
        "the controls inside it start disagreeing, and it is the failure this whole gate exists for.");

    ok("!! ...and paint() does NOT rewrite the whole summary, which is the v3741 regression by name",
        !/summary\.innerHTML/.test(paintBody) && !/tunnelSummary/.test(paintBody),
        "*** A REWRITE OF THE SUMMARY RENAMES THE DRAWER AND DELETES THE POLL'S COUNTS NODE. *** Both were " +
        "real, both were shipped, and the gate that was supposed to catch them was ASKING FOR THEM. This line " +
        "is what stops the old shape coming back the next time somebody reads the summary check literally.");

    ok("!! EVERY caller passes the enabled state, including the RESTORE path",
        (() => { const a = page.indexOf("function push(){"), b = page.indexOf("  })();", a);
                 const blk = page.slice(a, b);
                 return /paint\(ev\.value, on\.checked\)/.test(blk) && !/paint\(ev\.value\)\s*;/.test(blk); })(),
        "TWO OF THREE CALL SITES STILL PASSED ONLY THE INTERVAL after I added the argument, including the one " +
        "that runs on PAGE LOAD. `enabled` undefined is falsy, so the drawer would have opened every session " +
        "reading 'Tunnels' with rotation active -- the exact bug the drawer was designed to avoid");
}

console.log();
if (fails) { console.log("tunnelDrawer-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("tunnelDrawer-selfcheck: all checks pass");
