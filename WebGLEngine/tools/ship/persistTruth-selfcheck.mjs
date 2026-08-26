// tools/ship/persistTruth-selfcheck.mjs
//
// Run: node tools/ship/persistTruth-selfcheck.mjs
// RUNTIME 85ms MEASURED (median of 3 -- 71/101/85 ms, date(1) around the run). It imports the probe module
// and reads two files; it drives no browser. The BROWSER measurements this gate's claims rest on were made
// separately with Playwright and are recorded in ui/localModelProbe.js, not re-run here -- a gate that
// launched Chromium on every ship would cost seconds to re-learn a fact that is already written down.
//
// v4029 -- THE BUTTON PROMISED A DIALOG THAT CHROMIUM NEVER DRAWS.
//
// The label read "Request more storage (shows a real browser dialog)". MEASURED on real Chromium 141, headed
// under Xvfb, from a genuine trusted click: persist() returned FALSE IN 1 ms having drawn nothing at all. The
// page then said "denied or dismissed" -- naming a user action that could not have happened, and offering
// nothing to do about it.
//
// That claim did not come from nowhere. v4008 observed permissions.query({name:"persistent-storage"}) === 
// "prompt" and concluded "a genuine dialog is what shows". THE OBSERVATION WAS TRUE AND THE CONCLUSION WAS
// NOT. "prompt" is that permission's default state, not a promise of pixels. AN INFERENCE FROM A PROXY GOT
// WRITTEN DOWN AS A CONFIRMED FACT AND THEN GOT READ BY A BUTTON -- the same species as this tree's
// maxBufferSize-is-not-VRAM rule, except that one stayed labelled as a proxy and this one did not.
//
// THE LOAD-BEARING PROPERTY IS NOT "the strings changed". It is:
//
//     NO USER-FACING TEXT MAY PROMISE UI ON AN ENGINE THE TABLE SAYS DRAWS NONE, AND NO DENIAL MAY END
//     WITHOUT SOMETHING THE USER CAN ACTUALLY DO.
//
// *** codeOnly() vs noComments(), WHICH HAS BITTEN FIVE TIMES IN THIS TREE IN TWO DAYS: codeOnly() BLANKS
// STRING CONTENTS as well as comments. Checking for a STRING LITERAL wants noComments(). Checking for a CODE
// SHAPE wants codeOnly(). Every string check below is deliberately on `text`. ***
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly, noComments } from "./sourceScan.mjs";
import { engineHint, persistExplain, PERSIST_BEHAVIOUR } from "../../ui/localModelProbe.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };

const PAGE = fs.readFileSync(path.join(ENG, "webgpu-llm.html"), "utf8");
const PROBE = fs.readFileSync(path.join(ENG, "ui", "localModelProbe.js"), "utf8");

console.log("persistTruth-selfcheck -- does the page promise UI the browser actually draws?\n");

// ---------------------------------------------------------------------------
console.log("1. *** NO TEXT PROMISES A DIALOG ON AN ENGINE THAT DRAWS NONE ***");
{
    const text = noComments(PAGE);   // STRING contents, so noComments -- see the header
    // The exact retired claim. It is asserted by its own words because that is what a user read.
    ok("!! *** the retired label 'shows a real browser dialog' is GONE ***",
        !/shows a real browser dialog/i.test(text),
        /shows a real browser dialog/i.test(text)
            ? "*** still promising a dialog Chromium returns from in 1 ms without drawing ***"
            : "no unconditional dialog promise remains");
    ok("!! ...and the 'denied or dismissed' wording is gone with it",
        !/denied or dismissed/i.test(text),
        "nothing was dismissed on an engine that showed nothing -- the word invented a user action");
    // The real property: whatever the label says, it is CHOSEN BY the table, not hardcoded.
    const code = codeOnly(PAGE);     // a SHAPE, so codeOnly
    ok("!! *** the label is chosen from PERSIST_BEHAVIOUR, not written in flat ***",
        /PERSIST_BEHAVIOUR\[/.test(code) && /\.prompts\s*\?/.test(code),
        "a label that branches on the engine cannot promise the wrong engine's behaviour");
    ok("!! ...and the page's denial wording comes from persistExplain, one place",
        /persistExplain\(/.test(code),
        "wording in the page is wording no gate can drive without a browser");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** EVERY BRANCH OF THE EXPLANATION, DRIVEN ***");
{
    const denied = { available: true, granted: false, quotaBeforeBytes: 10.74e9, quotaAfterBytes: 10.74e9 };
    const cr = persistExplain(denied, "chromium");
    // KEITH'S EXACT CASE.
    ok("!! *** chromium denial SAYS NO DIALOG WAS SHOWN ***", /no dialog was ever shown/i.test(cr), cr.slice(0, 72) + "...");
    ok("!! ...and does NOT say dismissed", !/dismiss/i.test(cr));
    ok("!! *** ...and tells the user the click DID register ***", /did register/i.test(cr),
        "the whole failure mode was a user concluding the button was broken and clicking again");
    // LENGTH FIRST, ON PURPOSE. `[].every(...)` is TRUE, so the every() alone passes vacuously against an
    // empty remedy list -- caught by sabotage B, which emptied chromium's remedies and left this check green
    // (section 4's length assertion is what bit). A check that cannot fail on the emptiest possible input is
    // not a check.
    ok("!! *** ...and ends with something the user can DO ***",
        PERSIST_BEHAVIOUR.chromium.remedy.length > 0 && PERSIST_BEHAVIOUR.chromium.remedy.every((r) => cr.includes(r)),
        "a denial with no remedy is a dead end, which is what the old message was");

    const fr = persistExplain(denied, "firefox");
    ok("!! a prompting engine is described as prompting", /answered no|prompt/i.test(fr));
    ok("!! ...and does NOT claim no dialog was shown", !/no dialog was ever shown/i.test(fr),
        "the fix must not overcorrect into lying the other way on Firefox");

    const ur = persistExplain(denied, null);
    ok("!! *** an unknown engine NAMES THE ABSENCE rather than guessing ***",
        /could not be identified/i.test(ur) && !/no dialog was ever shown/i.test(ur),
        "v3103 -- unknown is not yes, and here unknown is not 'probably Chrome'");

    const g = persistExplain({ available: true, granted: true, quotaBeforeBytes: 10.74e9, quotaAfterBytes: 10.74e9 }, "chromium");
    ok("!! a grant that did NOT raise the quota says so plainly", /UNCHANGED/.test(g) && /granted/.test(g),
        "persistence and quota size are separate asks and only one was made");
    const g2 = persistExplain({ available: true, granted: true, quotaBeforeBytes: 1e9, quotaAfterBytes: 2e9 }, "chromium");
    ok("!! ...and a grant that DID raise it says that instead", /raised it/.test(g2));
    ok("!! an unavailable API is still its own answer",
        /not available/i.test(persistExplain({ available: false }, "chromium")));
}

// ---------------------------------------------------------------------------
console.log("\n3. *** ENGINE DETECTION, INCLUDING THE ORIGIN KEITH ACTUALLY OPENS ***");
{
    // MEASURED v4029: one Chromium, two origins -- userAgentData PRESENT on http://localhost, ABSENT on
    // http://192.0.2.2 (it is secure-context only). The LAN IP is the DEFAULT way server.html gets opened
    // here, so the UA fallback is the load-bearing path, not a leftover.
    const CHROME_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36";
    ok("!! structured brands are preferred when present",
        engineHint({ userAgentData: { brands: [{ brand: "Chromium" }, { brand: "Not?A_Brand" }] }, userAgent: "" }) === "chromium");
    ok("!! *** ...and the SAME BROWSER is still identified with userAgentData ABSENT (the LAN-IP case) ***",
        engineHint({ userAgent: CHROME_UA }) === "chromium",
        "insecure origin strips userAgentData; the UA string is all that is left");
    // *** THE ORDERING TRAP: Chromium's real UA contains BOTH "Safari" AND "AppleWebKit". ***
    ok("!! *** ...and is NOT mistaken for Safari, whose names its own UA contains ***",
        engineHint({ userAgent: CHROME_UA }) !== "webkit",
        "testing Safari first would hand back the wrong persist() story with total confidence");
    ok("!! a real Safari UA is still webkit",
        engineHint({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15" }) === "webkit");
    ok("!! firefox is firefox", engineHint({ userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0" }) === "firefox");
    ok("!! *** an unrecognised UA returns null, NOT a guess ***",
        engineHint({ userAgent: "SomeNewBrowser/1.0" }) === null && engineHint(null) === null,
        "a wrong engine name produces confident wrong advice, which is worse than none");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE TABLE SEPARATES WHAT WAS DRIVEN FROM WHAT IS REPEATED ***");
{
    const keys = Object.keys(PERSIST_BEHAVIOUR);
    ok("!! every engine engineHint can return has a row",
        ["chromium", "firefox", "webkit"].every((k) => keys.includes(k)),
        "a branch with no row would fall through to the unknown wording on a KNOWN engine");
    ok("!! every row carries a remedy the user can act on",
        keys.every((k) => Array.isArray(PERSIST_BEHAVIOUR[k].remedy) && PERSIST_BEHAVIOUR[k].remedy.length > 0));
    ok("!! *** every row declares whether it was MEASURED HERE or only documented ***",
        keys.every((k) => typeof PERSIST_BEHAVIOUR[k].measured === "boolean"),
        "this table decides what a user is promised; unmarked hearsay in it is how v4008 happened");
    ok("!! *** chromium's row is the one that was actually driven ***",
        PERSIST_BEHAVIOUR.chromium.measured === true && PERSIST_BEHAVIOUR.chromium.prompts === false,
        "measured v4029: false in 1 ms, headed, trusted click, no UI");
    ok("!! ...and the rows that were NOT driven are marked so rather than implied",
        PERSIST_BEHAVIOUR.firefox.measured === false && PERSIST_BEHAVIOUR.webkit.measured === false,
        "no Firefox or Safari in this container -- said plainly");
    // The retired inference must not survive in the source as a live claim.
    const ptext = noComments(PROBE), pcode = codeOnly(PROBE);
    ok("!! *** the retired 'a genuine dialog is what shows' claim is gone from the probe ***",
        !/a genuine dialog is what\s+shows/i.test(PROBE.replace(/\s+/g, " ")),
        "the comment that caused this shipped as a confirmed fact");
    ok("!! ...and the measurement that replaced it is recorded with its conditions",
        /MEASURED v4029/.test(PROBE) && /headed/i.test(PROBE) && /1 ms/.test(PROBE),
        "a measurement with no conditions is not checkable by the next reader");
    ok("!! the probe still exports the engine as a fact on the probe result",
        /out\.engine = engineHint\(nav\)/.test(pcode) && /persistPromptExpected/.test(ptext));
}

console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
process.exit(fails ? 1 : 0);
