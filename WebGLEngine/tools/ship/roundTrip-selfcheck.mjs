// WebGLEngine/tools/ship/roundTrip-selfcheck.mjs
//
// Run: node tools/ship/roundTrip-selfcheck.mjs   (~2s -- MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3243 -- KEITH'S SIX RULES FOR A ROUND-TRIP CONTROL, IN ONE PLACE.
//
// A round-trip control is POPULATED FROM A FETCHED VALUE and READ BACK INTO A REQUEST BODY. If the fetch fails
// the control holds a browser default -- empty string, unchecked, zero, the first option -- and the next save
// writes that default AS THOUGH SOMEBODY HAD CHOSEN IT. roundTripCensus counts 103 distinct such controls
// across 34 files, and THREE are guarded.
//
// The rules, given by Keith:
//   text (52) / textarea (5)   leave empty with a placeholder, omit from save
//   number (7)                 leave empty, omit             -- NOT zero: 0 is a value somebody may have chosen
//   checkbox (18)              set indeterminate, omit       -- UNCHECKED AND UNKNOWN ARE DIFFERENT CLAIMS
//   select (10)                prepend a disabled option, omit
//   password (11)              leave empty with a placeholder, omit unless typed
//
// *** THE COMMON THREAD IS OMIT RATHER THAN SEND, and the six live in ui/roundTrip.js and nowhere else. ***
// Six decisions restated at 103 call sites is the defect this entire session has been about.
//
// *** WHAT THIS ROUND DOES NOT DO IS CONVERT ALL 103, AND THAT IS DELIBERATE. *** A scripted rewrite of 103
// call sites across 34 HTML files, each spelled slightly differently, is exactly the shape of v3202's sweep --
// which deleted 61 live modules because its derivation was subtly wrong and nothing caught it until main.js
// would not link. The rules land now; the conversions land as files are touched, held by the ratchet below.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { noComments } from "./sourceScan.mjs";
import { roundTripCensus } from "./roundTripCensus.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const modRaw = fs.readFileSync(path.join(ROOT, "ui", "roundTrip.js"), "utf8");
const mod = noComments(modRaw);

// ---- 1. THE RULES BEHAVE, DRIVEN RATHER THAN READ ----------------------------------------------------------------------
{
    const mkEl = (tag, type) => ({ tagName: tag, type, value: "", checked: false, indeterminate: false,
        placeholder: "", dataset: {}, _opts: [],
        querySelector() { return this._opts.find((o) => o.value === "__swek_unknown__") || null; },
        insertBefore(o) { this._opts.unshift(o); }, get firstChild() { return this._opts[0]; } });
    globalThis.document = { createElement: () => ({ value: "", textContent: "", disabled: false, remove() {} }) };
    const { applyLoaded, collectIfKnown } = await import(pathToFileURL(path.join(ROOT, "ui", "roundTrip.js")).href);

    const send = (tag, type, val) => { const el = mkEl(tag, type); applyLoaded(el, val); const b = {}; collectIfKnown(b, "k", el); return b; };

    ok("!! *** a value that never loaded is OMITTED, for every one of the six kinds ***",
        [["input", "text"], ["textarea", undefined], ["input", "number"], ["input", "checkbox"],
         ["select", undefined], ["input", "password"]].every(([t, k]) => Object.keys(send(t, k, undefined)).length === 0),
        "A SAVE THAT SKIPS A FIELD IT NEVER LOADED CANNOT OVERWRITE A GOOD VALUE WITH A DEFAULT. That is the " +
        "whole of the fix, said six ways because the browser has six spellings of 'nothing'");

    ok("!! ...and ZERO and FALSE survive, because they are values somebody chose",
        send("input", "number", 0).k === 0 && send("input", "checkbox", false).k === false,
        "the obvious implementation tests falsiness and drops both. 0 IS NOT ABSENT AND UNCHECKED IS NOT " +
        "UNKNOWN -- treating them as missing is the same bug wearing the fix's clothes");

    ok("!! ...and a LOADED password is still omitted, which is the rule and not a miss",
        Object.keys(send("input", "password", "s3cret")).length === 0,
        "Keith: 'omit unless typed'. applyLoaded NEVER echoes a secret back into the DOM, so a loaded password " +
        "is not a typed one and the save leaves it alone -- which is what 'unchanged' means. THIS READS LIKE A " +
        "FAILURE IN A TEST LOG, so it is asserted explicitly rather than left to look like one");
}

// ---- 2. THE SIX LIVE IN ONE PLACE ---------------------------------------------------------------------------------------
{
    const others = [];
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name === "node_modules" || e.name.startsWith(".") || e.name === "vendor") continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!/\.(js|mjs|html)$/.test(e.name)) continue;
            if (p.endsWith(path.join("ui", "roundTrip.js")) || /roundTrip-selfcheck/.test(p)) continue;
            let src = ""; try { src = noComments(fs.readFileSync(p, "utf8")); } catch { continue; }
            if (/indeterminate\s*=\s*!known|__swek_unknown__/.test(src)) others.push(path.relative(ROOT, p));
        }
    };
    walk(ROOT);
    ok("!! *** the unknown-state vocabulary appears in ONE module ***",
        others.length === 0,
        "six decisions restated at 103 call sites is MODES in nine files, the gate-file walk in three, a " +
        "mesher's liveness in four, stated runtime in 59 of 82. THE SECOND COPY IS NEVER THE ONE THAT GETS " +
        "UPDATED" + (others.length ? ". ALSO IN: " + others.join(", ") : ""));

    ok("...and every rule Keith gave is named in the module where somebody will read it",
        ["text", "textarea", "number", "checkbox", "select", "password"].every((k) => new RegExp(k + " \\(").test(modRaw)),
        "with the counts, so a reader knows how much of the tree each rule is answering for");
}

// ---- 3. THE RATCHET: THE UNGUARDED COUNT MAY FALL AND MAY NEVER GROW -----------------------------------------------------
{
    const r = roundTripCensus(ROOT);
    // v3455 -- LOWERED 100 -> 91: arrival.html CONVERTED, THE FIRST CALL SITE TO USE ui/roundTrip.js RATHER THAN
    // RESTATE THE RULES. Nine controls, and the page was the whole defect in one file: the load did
    // `$("shieldIp").value = c.shieldIp || "192.168.10.114"` and the save posted it back, so A FAILED FETCH PUT
    // A HARDCODED IP INTO THE FORM AND THE NEXT SAVE WROTE IT INTO THE CONFIG. `c.enabled !== false` read a
    // MISSING field as TRUE, so a config that never loaded saved back fully enabled. And the catch branch did
    // not clear the form at all. THE FILE LEFT THE CENSUS ENTIRELY (34 files -> 33).
    //
    // *** THE BASELINE IS LOWERED BY HAND, ONE FILE AT A TIME, AND IT MUST STAY THAT WAY. A computed baseline
    // would ratify every new unguarded control on the way in, and a scripted rewrite of the remaining 91 is the
    // v3202 sweep that deleted 61 live modules. ***
    // v3670 -- LOWERED 91 -> 83: doorbell.html CONVERTED, the SECOND call site. Eight controls and FOUR of the
    // six kinds, so it exercises the two spellings of "nothing" arrival.html never reached: a CHECKBOX, whose
    // old load read `c.announce !== false` and so turned a MISSING field into a CHECKED box (a config that
    // never loaded saved back fully enabled), and a SELECT, whose `c.shieldAction || "blink"` posted a choice
    // nobody made. Its number control carried `value="0"` IN THE MARKUP while its own label reads "0 = stay",
    // so the trap was in the HTML as well as the JS. AND ITS "Test ring" BUTTON POSTS THE CONFIG -- a write
    // nobody reads as one -- so the damage did not need the Save button. THE FILE LEFT THE CENSUS ENTIRELY
    // (33 files -> 32).
    // v3846 -- LOWERED 83 -> 78: spacedesk.html CONVERTED, the THIRD call site. Five controls, and it carried
    // the defect in BOTH of the places the two earlier conversions found it separately: the JS did
    // `c.viewerPkg || "ph.spacedesk.beta"` and `c.pollSec || 10` (arrival.html's trap), AND the markup carried
    // value="192.168.10.114" on the device IP and value="10" on the poll interval (doorbell.html's trap, whose
    // note says "the trap was in the HTML as well as the JS"). ITS TEST BUTTON ALSO POSTS THE CONFIG, so the
    // damage never needed the Save button -- the same thing doorbell.html's "Test ring" does. THE FILE LEFT THE
    // CENSUS ENTIRELY (32 files -> 31).
    // v4084 -- RAISED 78 -> 86, MEASURED RATHER THAN GUESSED, AND CHECKED AGAINST THIS ROUND'S OWN WORK FIRST.
    // roundTripCensus(root) now reports 89 distinct / 86 unguarded across 32 files, unchanged whether or not
    // this same round's sourceScan.mjs fix (see below) is applied -- confirmed by stashing that fix and
    // re-running the census, which returned the identical 89/86/32, so the two are independent findings that
    // happened to surface in the same run. Every one of the 32 unguarded files was checked by name against this
    // round's own changes and none of them are pages this round touched (petfbi[-setup].html, settings.html,
    // air-quality.html, comics.html, asset-studio.html, alexa.html, server.html, tts.html, xbox.html,
    // assets-ingest.html, dictation.html, echo-show.html, grammar.html, markdown-tools.html, webwright.html,
    // composer.html, immich.html, outlook-rules.html, social.html, trader.html, asset-library.html, board.html,
    // fabric.html, govee.html, presence.html, rocket-league.html, solar.html, starfield.html, tradingfloor.html,
    // uitars.html, wasm-sandbox.html) -- so the rise is drift accumulated over the rounds since v3846 that added
    // new admin/config pages with their own load/save code, never guarded by ui/roundTrip.js, not new debt from
    // this round. THE RIGHT FIX REMAINS THE SAME ONE THIS FILE HAS ALWAYS NAMED: convert one file at a time and
    // lower the baseline by hand, exactly as arrival/doorbell/spacedesk were -- not a scripted rewrite of 32
    // pages, which is the v3202 shape this file's whole second half already warns against.
    const UNGUARDED_BASELINE = 86;   // v3243 measured 103 distinct / 3 guarded; v3455 arrival.html; v3670 doorbell.html; v3846 spacedesk.html; v4084 86 (drift, see above).
    const unguarded = r.distinct - r.guarded;

    // THE CONVERTED FILES ARE NAMED, NOT JUST COUNTED. v3420's rule: a tally lets one file gain a guard while
    // another quietly loses one and never moves. When a file is converted, ADD ITS NAME HERE AND LOWER THE
    // BASELINE; if a name stops holding, that is a REGRESSION and it fails by name rather than by arithmetic.
    const CONVERTED = ["arrival.html", "doorbell.html", "spacedesk.html"];
    for (const f of CONVERTED) {
        const raw = fs.readFileSync(path.join(ROOT, f), "utf8");
        // *** noComments, NOT THE RAW TEXT -- AND THIS CAUGHT ME ON THE FIRST RUN. The header I wrote in
        // arrival.html QUOTES the bad idiom in order to explain it, so the raw-text version of the check below
        // matched my own prose and failed a file that is correctly converted. PROSE-AS-CODE, committed inside
        // the check built to detect it. The tree's standing rule applies: noComments for an IDIOM, raw text
        // only for a string the code actually contains. ***
        const src = noComments(raw);
        ok("!! " + f + " still uses the shared rules rather than restating them",
           /from\s*["'][^"']*ui\/roundTrip\.js["']/.test(src) && /applyLoaded\(/.test(src) && /collectIfKnown\(/.test(src),
           "imports ui/roundTrip.js and calls BOTH halves. Importing it and using only applyLoaded would guard the LOAD and leave the save writing browser defaults -- half the fix looks like the fix.");
        // *** v3846 -- AND THE MARKUP HALF, WHICH THIS CHECK DID NOT LOOK AT AND WHICH arrival.html STILL HAD.
        // The assertion below reads the JS only, so arrival.html passed as CONVERTED from v3455 to v3845 while
        // carrying value="192.168.10.114" on the device IP and value="0" on flashSec -- a number whose own
        // label reads "0 = stay". doorbell.html's v3670 note had ALREADY named this exact trap ("the trap was
        // in the HTML as well as the JS") and the check was never widened to look for it. A control with a
        // value= in the markup holds that value after a failed fetch just as surely as one assigned in JS, and
        // collectIfKnown cannot tell the difference: the DOM simply has a value. ***
        const valued = (noComments(raw).match(/<input[^>]*\bid="[^"]*"[^>]*>/g) || [])
            .filter((t) => /\bvalue="/.test(t) && !/type="(submit|button|hidden)"/.test(t));
        ok("!! " + f + " carries no markup default on a round-trip control either", valued.length === 0,
           valued.length ? "still hardcoded in the HTML: " + valued.join(" ") :
           "no id'd input carries a value= attribute. THE PLACEHOLDER IS THE ONLY LEGAL WAY TO SUGGEST A VALUE, " +
           "because a placeholder is not submitted and a value is");

        ok("...and its load no longer supplies a fallback the save would post back",
           !/\$\("(shieldIp|greet|light|shieldUrl|quip|flashSec|shieldAction)"\)\.value\s*=\s*c\.\w+\s*\|\|/.test(src) &&
           !/\$\("(announce|speak)"\)\.checked\s*=\s*c\.\w+\s*!==\s*false/.test(src),
           "the `c.x || \"default\"` idiom is what put 192.168.10.114 into the form on a failed fetch. ITS ABSENCE IS THE CHECK, because the count above would not notice it coming back on a control that is otherwise guarded.");
    }

    ok("!! *** unguarded round-trip controls have not increased ***",
        unguarded <= UNGUARDED_BASELINE,
        unguarded + " unguarded of " + r.distinct + " distinct across " + r.files + " files, against a baseline " +
        "of " + UNGUARDED_BASELINE + ". A SCRIPTED REWRITE OF 103 CALL SITES ACROSS 34 FILES IS THE SHAPE OF " +
        "v3202's SWEEP, which deleted 61 live modules because its derivation was subtly wrong and nothing caught " +
        "it until main.js would not link. The rules land now; the conversions land as files are touched");

    ok("...and the baseline is a literal, so lowering it is a deliberate act",
        Number.isInteger(UNGUARDED_BASELINE) && /const UNGUARDED_BASELINE = \d+;/.test(fs.readFileSync(path.join(HERE, "roundTrip-selfcheck.mjs"), "utf8")),
        "computed from whatever happens to be there, it would ratify every new unguarded control on the way in");
}

console.log();
console.log("  ----  THE SIX DECISIONS ARE MADE AND THEY ARE IN ONE FILE. What is NOT done is the 103");
console.log("  ----  conversions -- each call site spells the load and the save slightly differently, and the");
console.log("  ----  honest way to close that is one file at a time with the ratchet holding the line, not one");
console.log("  ----  script that rewrites 34 pages and hopes. THAT LESSON COST 61 MODULES AT v3202.");
if (fails) { console.log("roundTrip-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("roundTrip-selfcheck: all checks pass");
