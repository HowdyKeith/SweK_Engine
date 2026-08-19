// WebGLEngine/tools/ship/deviceKind-selfcheck.mjs -- v3704
//
// Run: node tools/ship/deviceKind-selfcheck.mjs   (<1s)
//
// *** THE USER AGENTS BELOW ARE REAL STRINGS, NOT SKETCHES. *** A detector graded against user agents somebody
// invented is a detector graded against its own author's idea of what phones say -- and the single case that
// matters most, an iPad since iPadOS 13, is the one nobody would invent because it does not mention iPads.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify, peerPageFor, detect, KINDS } from "../../ui/deviceKind.mjs";
import { codeOnly } from "./sourceScan.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (l) => console.log("  ----  " + l);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");

const UA = {
    pixel:   "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
    tablet:  "Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    iphone:  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    ipad12:  "Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1",
    ipad13:  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    mac:     "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    win:     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    linux:   "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    weird:   "SomeEmbeddedThing/2.1",
};

console.log("deviceKind-selfcheck -- and unknown is not desktop\n");

// ---- 1. THE ORDINARY CASES -------------------------------------------------------------------------------------
{
    const cases = [
        ["a phone", UA.pixel, {}, "android"],
        ["an Android tablet (no Mobile token)", UA.tablet, {}, "android"],
        ["an iPhone", UA.iphone, {}, "ios"],
        ["an older iPad that names itself", UA.ipad12, {}, "ios"],
        ["a real Mac", UA.mac, { maxTouchPoints: 0 }, "desktop"],
        ["Windows", UA.win, {}, "desktop"],
        ["Linux", UA.linux, {}, "desktop"],
    ];
    for (const [name, ua, nav, want] of cases) {
        const r = classify(ua, nav);
        ok("!! " + name + " -> " + want, r.kind === want, r.kind + " (" + r.why.slice(0, 62) + ")");
    }
    // ANDROID IS TESTED BEFORE LINUX ON PURPOSE: an Android user agent CONTAINS "Linux", so a Linux test placed
    // first would swallow every phone in the fleet and call it a workstation.
    ok("!! *** an Android user agent contains 'Linux' and is still Android ***",
        /Linux/.test(UA.pixel) && classify(UA.pixel, {}).kind === "android",
        "the order of the tests IS the logic here -- a Linux check placed first would swallow every phone");
}

// ---- 2. *** THE iPadOS 13 TRAP, WHICH IS THE WHOLE REASON maxTouchPoints IS AN ARGUMENT *** --------------------
{
    ok("!! *** an iPad since iPadOS 13 says 'Macintosh' and mentions no iPad anywhere ***",
        !/iPad/i.test(UA.ipad13) && /Macintosh/.test(UA.ipad13),
        "this is the case nobody would invent, and a string test alone calls THE MOST COMMON TABLET IN THE WORLD " +
        "a desktop");

    const blind = classify(UA.ipad13, {});
    ok("!! ...so with no touch count it is a NAMED AMBIGUITY, not a guess",
        blind.kind === "mac-or-ipad" && blind.confident === false,
        blind.kind + " -- and 'mac-or-ipad' exists precisely so the absence of a signal WIDENS the answer " +
        "instead of narrowing it to whichever branch happens to be written first");

    const seeing = classify(UA.ipad13, { maxTouchPoints: 5 });
    const realMac = classify(UA.mac, { maxTouchPoints: 0 });
    ok("!! ...and the touch count separates them, both ways",
        seeing.kind === "ios" && seeing.confident && realMac.kind === "desktop" && realMac.confident,
        "iPad reports 5, a Mac reports 0 -- ONE CHECK IS NOT ENOUGH: an iPad resolving correctly while a Mac " +
        "also resolved to ios would look identical on the case people test");

    ok("!! *** an uncertain kind is offered NO PAGE AT ALL ***",
        peerPageFor("mac-or-ipad") === null && peerPageFor("unknown") === null && peerPageFor("desktop") === null,
        "offering the iOS peer page to something that is probably a Mac is worse than offering nothing: the link " +
        "is wrong exactly when the person is least able to tell, and a desktop user who follows it lands on a " +
        "page built for a phone");
    say("kinds: " + KINDS.join(", "));
}

// ---- 3. *** UNKNOWN IS NOT DESKTOP. *** ------------------------------------------------------------------------
{
    ok("!! an unrecognised user agent is UNKNOWN", classify(UA.weird, {}).kind === "unknown");
    ok("!! an empty user agent is UNKNOWN, not a desktop",
        classify("", {}).kind === "unknown" && classify(null, {}).kind === "unknown",
        "a headless or locked-down client reports nothing, and calling that a workstation is a confident claim " +
        "built out of a missing string");
    ok("!! no navigator is UNKNOWN", detect(null).kind === "unknown" && detect({}).kind === "unknown",
        "the tempting shape is `isPhone ? phone : desktop`, which turns EVERY FAILURE OF THE TEST into a " +
        "confident claim about a workstation -- the same collapse plantedCoverage refuses between an undeclared " +
        "plant and a dead one");

    const src = codeOnly(fs.readFileSync(path.join(ENG, "ui", "deviceKind.mjs"), "utf8"));
    ok("!! *** the detector NEVER NAVIGATES ***",
        !/location\s*\.\s*(href|replace|assign)|window\s*\.\s*open/.test(src),
        "checked through codeOnly so the header promising it cannot satisfy the check. USER-AGENT SNIFFING IS " +
        "WRONG REGULARLY -- it is a string the browser volunteers, and desktop-mode toggles exist precisely so a " +
        "phone can claim not to be one. The shipped cost of a wrong answer must be A LINK NOBODY CLICKS, never " +
        "a page nobody asked for.");
}

// ---- 4. THE PAGES IT POINTS AT HAVE TO EXIST -------------------------------------------------------------------
{
    for (const kind of ["android", "ios"]) {
        const rel = peerPageFor(kind);
        ok("!! " + kind + " points at a page that is really there: " + rel,
            !!rel && fs.existsSync(path.join(ENG, rel.replace(/^\//, ""))),
            "a detector offering a 404 is worse than one offering nothing, and both peer pages predate this file");
    }
}

// ---- 5. THE PAGE OFFERS AND DOES NOT REDIRECT ------------------------------------------------------------------
{
    // Checked in server.html's SOURCE rather than a DOM, because the claim is about what the page WILL NOT do
    // and jsdom cannot prove an absence by not doing it. The raw source is searched for the block's own marker
    // (a string literal, which codeOnly would blank -- v3703 cost me a red check by forgetting that), and the
    // window is stripped before the idiom test so the prose explaining "does not redirect" cannot satisfy it.
    const raw = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    const i = raw.indexOf("/ui/deviceKind.mjs");
    ok("!! server.html actually consults the detector", i > 0,
        "a module nothing imports is a module that does nothing, whatever its gate says");
    // *** THE WINDOW STARTS AT THE <script> TAG, NOT AT THE IMPORT PATH, AND THAT IS NOT A DETAIL. *** My first
    // version sliced from the path -- WHICH SITS INSIDE A STRING LITERAL -- so codeOnly's lexer began
    // out of phase and inverted: it kept the strings and threw away the code, 972 characters down to 198. The
    // redirect check then passed BY LOOKING AT TEXT THAT NO LONGER CONTAINED ANY CODE, and a planted
    // location.href did not fire it. A CHECK THAT PASSES BY EXAMINING THE WRONG TEXT LOOKS EXACTLY LIKE A CHECK
    // THAT PASSED. Starting at the tag gives the lexer a clean state; sourceScan's own header warns that it
    // desyncs, and this is what that costs.
    const tag = raw.lastIndexOf("<script", i);
    const win = codeOnly(raw.slice(tag, i + 1800));
    ok("!! *** and the page OFFERS rather than navigating ***",
        !/location\s*\.\s*(href|replace|assign)/.test(win) && !/window\s*\.\s*open/.test(win),
        "it only highlights a link THAT WAS ALREADY THERE -- both peer pages have been linked from the top of " +
        "server.html all along. The cost of a wrong guess is A HIGHLIGHT NOBODY WANTED, never a page nobody " +
        "asked for.");
    ok("...and an uncertain kind changes nothing", /d\.confident/.test(win),
        "mac-or-ipad and unknown reach no branch at all, which is why peerPageFor returns null for both rather " +
        "than picking the likelier one");
}

if (fails) { console.log("\ndeviceKind-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("\ndeviceKind-selfcheck: all checks pass");
