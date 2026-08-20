// tools/ship/unknownNotDefault-selfcheck.mjs
//
// Run: node tools/ship/unknownNotDefault-selfcheck.mjs   (instant)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3112 -- A CONTROL THAT COULD NOT READ ITS STATE MUST NOT SHOW A PLAUSIBLE ONE.
//
// v3093 settled this for the avatar: A LOST BRIDGE READS UNKNOWN, NOT IDLE, because an unreachable engine and an
// idle engine look identical unless something insists they are different. That law was written for one surface
// and never applied anywhere else. Two controls in main.js were doing exactly what it forbids.
//
// THE ONE THAT MATTERS IS THE PIN GATE. Its loader read /proc/gate inside `try { ... } catch {}` -- an EMPTY
// catch -- so an unreachable server left enChk at its unchecked browser default, which is INDISTINGUISHABLE
// from the server having said the gate is disabled. And the Save handler four lines below sends
// { enabled: enChk.checked }. A USER WHO COULD NOT REACH THE SERVER AND PRESSED SAVE WOULD HAVE TURNED THE PIN
// GATE OFF WITHOUT EVER CHOOSING TO. The failure was silent at every step: fetch resolved or threw into nothing,
// the checkbox looked normal, and Save looked like it worked.
//
// HOW IT WAS FOUND, WHICH IS NOT HOW IT LOOKED LIKE IT WOULD BE FOUND. boundaryLint's UNCHECKED_JSON_BODY
// counted 53 and stayed a REPORT because .json() throws loudly on an HTML error body, which is a legitimate
// design. Splitting those 53 by WHAT THE CATCH DOES gave: 14 returning an error field, 12 other, 1 returning
// null, and SIX EMPTY. Reading the six, four are honest best-effort side effects -- a forecast that simply does
// not happen, an optional state variable left at its previous value -- and TWO SET USER-FACING CONTROLS. The
// rule was never in the count. It was in what the count was hiding.
//
// SO THIS FILE DOES NOT ADD A LINT RULE. An empty catch is not a defect; an empty catch BEHIND A CONTROL is.
// That distinction is about what the surrounding code DOES with the failure, which no regex over a catch body
// can see, so the two sites are asserted by name and the reasoning is written down for the third.

import fs from "node:fs";
import { roundTripCensus } from "./roundTripCensus.mjs";   // v3138 -- derive the denominator
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const raw = fs.readFileSync(path.join(ENG, "main.js"), "utf8");

// ---- 1. v3113: ONE OWNER, AND THE PAGES DEFER TO IT --------------------------------------------------------------
// FIFTEENTH MECHANISM-PIN, AND MINE AGAIN. v3112's checks asserted the hand-rolled guard TEXT inside main.js --
// `let gateKnown = false`, the literal disable lines, the exact message string. v3113 extracted all of it to
// ui/knownState.js, which is strictly better and is what v3097 established for the launchers, and every one of
// those assertions would have gone red for the improvement. Rewritten to the property: the page DEFERS, the
// owner is single, and what the guard DOES is tested against the owner.
{
    const own = fs.readFileSync(path.join(ENG, "ui", "knownState.js"), "utf8");

    ok("the shared owner exists and exports both halves",
        /export async function loadKnownState/.test(own) && /export function saveAllowed/.test(own),
        "ui/knownState.js. The loader marks controls UNKNOWN; saveAllowed refuses the write. They are separate " +
        "because a disabled button is an affordance anything can re-enable -- the refusal has to exist at the " +
        "moment of writing too");

    ok("!! the PIN gate defers to it instead of carrying its own guard",
        /loadKnownState\("\/proc\/gate"/.test(raw) && /saveAllowed\(gateKnown, msg/.test(raw),
        "v3112 wrote this guard out by hand here AND again for the OpenRGB mirror, making two copies of one " +
        "judgement before the ink was dry. WHERE the guard lives is not this page's business");

    ok("...and so does the OpenRGB mirror",
        /loadKnownState\("\/rgb\/status"/.test(raw),
        "the second copy, retired into the same owner");

    // ONE OWNER IS A CLAIM ABOUT ABSENCE -- the v3093 lesson, applied to the thing v3093's law produced.
    const handRolled = /gateKnown = true;\s*enChk\.disabled = false/.test(raw) ||
                       /rgbChk\.disabled = true;\s*rgbChk\.title/.test(raw);
    ok("!! and no hand-rolled copy survives beside the call",
        !handRolled,
        "asserting the call is PRESENT says nothing about a second guard sitting next to it, and one-owner is " +
        "a claim about ABSENCE");
}

// ---- 2. WHAT THE OWNER ACTUALLY DOES -------------------------------------------------------------------------------
{
    const own = fs.readFileSync(path.join(ENG, "ui", "knownState.js"), "utf8");
    ok("!! it consults .ok before parsing",
        /if \(!r\.ok\) throw new Error\("HTTP " \+ r\.status\);/.test(own),
        "an HTML error body is a complete, well-formed response -- boundaryLint's UNCHECKED_ERROR_BODY, a hard " +
        "failure since v3103");
    ok("!! it disables the SAVE path, not just the control",
        /const all = save \? controls\.concat\(\[save\]\) : controls;/.test(own),
        "a save is what turns a wrong-looking control into wrong STORED state. That is the whole reason the PIN " +
        "gate mattered and a display-only control would not have");
    ok("!! the message carries the REASON",
        /UNKNOWN \(" \+ why \+ "\)/.test(own),
        "'UNKNOWN (HTTP 503)' sends somebody to the server; a blank control sends them nowhere");
    ok("!! and it does NOT show a cached last-good value",
        !/lastGood|cache\s*=|previous/i.test(own) && /does not retry, and it does not cache/.test(own),
        "a stale value shown as current is the same lie with a longer fuse. The surface has to say it does not " +
        "know, which is the entire point of v3093's law");
}

// ---- 2b. v3113: THE RATCHET ON THE OTHER FORTY-THREE ---------------------------------------------------------------
// A round-trip control is one LOADED from the server and READ BACK into a request body. If the load fails and
// the control keeps a browser default, THE NEXT SAVE WRITES THAT DEFAULT AS THOUGH THE USER CHOSE IT -- which is
// exactly how a failed fetch silently disabled a PIN gate. 206 controls are populated from a fetched value; 45
// round-trip; two are guarded, and they are the two above.
//
// THE REST ARE NOT FIXED AND ARE NOT PRETENDED TO BE. A ratchet rather than a wall, because hand-patching 43
// sites would be 43 chances to write the guard slightly differently -- which is what the owner exists to stop,
// and what the count is here to make visible rather than comfortable.
{
    // v3138 -- DERIVED, NOT REMEMBERED. This block held `const ROUND_TRIP_UNGUARDED = 43;` with the comment
    // "MEASURED at v3113, not chosen". It WAS measured -- once -- and then frozen: adopt ten and it still said
    // 43, add ten and it still said 43. A REMEMBERED RESULT PRESENTED AS A CURRENT MEASUREMENT, which is the
    // failure coverage.mjs was written at v3084 to prevent, in a gate that did not use it.
    //
    // *** AND THE SCOPE WAS TYPED TOO -- four files. Deriving across the whole shipped tree finds round-trip
    // controls in THIRTY-FOUR files, and only ONE of the original four appears at all. The number was not
    // merely stale; it was pointed at the wrong part of the tree. ***
    const census = roundTripCensus(ENG);
    const BASELINE = 114;      // the DERIVED count at v3138, recorded so the ratchet has a direction

    ok("!! the round-trip census is DERIVED on every run, not carried from v3113",
        census.total > 0 && census.scanned > 500,
        census.total + " round-trip controls across " + census.files + " files, from " + census.scanned +
        " scanned. The old constant said 43 across a typed list of four, and only server.html was even in it");

    ok("!! and the count may SHRINK, never grow",
        census.total <= BASELINE,
        census.total + " vs a baseline of " + BASELINE + ". A ratchet whose denominator is frozen cannot " +
        "ratchet -- it reports the same number whichever way the work goes");

    ok("...and adoption of the owner does not go backwards",
        census.guarded >= 2,
        census.guarded + " loadKnownState call sites, counted across the WHOLE tree rather than four files");

    console.log("  ----  ROUND-TRIP CONTROLS STILL UNGUARDED: " + census.total + " across " + census.files +
                " files. Worst: " + census.perFile.slice(0, 5).map((r) => r.file + " (" + r.count + ")").join(", "));
    console.log("  ----  Each still needs a HUMAN to decide what its unknown state should look like -- a slider,");
    console.log("        a select and a password field do not fail alike -- which is why this is a ratchet and");
    console.log("        not a rule. What changed at v3138 is that the number is now TRUE.");
}

// ---- 3. WHAT THIS DELIBERATELY DOES NOT DO -------------------------------------------------------------------------
{
    // A CLAIM ABOUT ABSENCE MUST BE SHOWN FAILING -- but the claim here is about MEANING, not shape, so the
    // honest control is a counter-example rather than a synthetic violation.
    const stillEmpty = (raw.match(/\)\)\.json\(\);\s*\}\s*catch\s*\{\s*\}/g) || []).length;
    ok("empty catches on .json() still exist, and that is CORRECT",
        stillEmpty > 0,
        stillEmpty + " remain. Four of the original six are honest best-effort work -- a forecast that simply " +
        "does not happen, an optional variable left at its previous value. AN EMPTY CATCH IS NOT A DEFECT; AN " +
        "EMPTY CATCH BEHIND A CONTROL IS. Promoting the shape to a rule would fail four correct sites and get " +
        "the rule switched off");
    console.log("  NOTE   the distinction is about what the surrounding code DOES with the failure, which no regex");
    console.log("         over a catch body can see. That is why these two are asserted by name rather than by");
    console.log("         pattern, and why the reasoning above is written out for whoever finds the third.");
}

console.log();
if (fails) { console.log("unknownNotDefault-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("unknownNotDefault-selfcheck: all checks pass");
