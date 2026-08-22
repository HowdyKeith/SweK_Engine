// WebGLEngine/tools/ship/authTrust-selfcheck.mjs
//
// Run: node tools/ship/authTrust-selfcheck.mjs   (~0.2s -- MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3246 -- THE SERVER ENFORCED ONE TRUST RULE AND REPORTED A NARROWER ONE.
//
// *** /auth/status ANSWERED `authed: reqAuthed(req)`. 182 ROUTES GATE ON `_isTrustedReq(req)`. ***
//
//     _isTrustedReq = _isLocalReq(req) || reqAuthed(req) || (authLanExempt() && _isLan(req))
//
// reqAuthed is the NARROW one -- session cookie or bearer or idle-unlock, and nothing about where you are. So
// server.html asked "am I trusted?" and got back "do you have a session?". ON THE HOST MACHINE THAT IS FALSE
// WHILE EVERY CONTROL ON THE PAGE WORKS, which is exactly what Keith saw: a lock icon on localhost over buttons
// that never refused anything.
//
// *** THE POLICY DID NOT NEED WIDENING. IT WAS ALREADY WHAT HE WANTED. *** _isTrustedReq has trusted the host,
// and the LAN when exempt, for as long as it has existed -- and server.html's own comment beside the button has
// said so all along: "host / LAN-exempt / logged in see everything already". THE SENTENCE WAS RIGHT AND THE
// WIRING WAS NOT. He authorised a change that turned out to be unnecessary; saying so is cheaper than making it.
//
// TWO FUNCTIONS, ONE ENFORCING AND ONE REPORTING, NEVER COMPARED -- which is this session's signature, and the
// ninth or tenth instance of it. `sessionAuthed` is now reported BESIDE `authed` because they are genuinely
// different facts: trusted decides what you can DO, session decides whether the unlock button has anything to
// unlock. Collapsing them is how this started.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const srvRaw = fs.readFileSync(path.join(ROOT, "ai-bridge", "server.js"), "utf8");
const srv = noComments(srvRaw);
const pageRaw = fs.readFileSync(path.join(ROOT, "server.html"), "utf8");
const page = noComments(pageRaw);

// ---- 1. THE REPORT MATCHES THE ENFORCEMENT ------------------------------------------------------------------------------
{
    const enforced = (srv.match(/_isTrustedReq\(req\)/g) || []).length;
    const narrow = (srv.match(/reqAuthed\(req\)/g) || []).length;

    ok("!! *** /auth/status reports the trust the server ENFORCES ***",
        /authed: _isTrustedReq\(req\)/.test(srv),
        enforced + " routes gate on _isTrustedReq; reqAuthed appears " + narrow + " times. THE PAGE ASKED 'am I " +
        "trusted?' AND GOT BACK 'do you have a session?' -- false on the host machine while every control worked, " +
        "which is a lock icon over buttons that never refuse");

    ok("...and the narrow fact is still reported, under its own name",
        /sessionAuthed: reqAuthed\(req\)/.test(srv),
        "TRUSTED decides what you can DO; SESSION decides whether the unlock button has anything to unlock. " +
        "They are different facts and collapsing them is how this started");

    ok("!! ...and enforcement still overwhelmingly uses the trusted form",
        enforced > 100 && enforced > narrow * 10,
        "if a future edit starts gating on reqAuthed, the host stops being trusted ROUTE BY ROUTE and the page " +
        "would keep saying it is -- the same disagreement, walking back in from the other side");
}

// ---- 2. THE POLICY ITSELF IS UNCHANGED ----------------------------------------------------------------------------------
{
    ok("!! *** the trust rule was NOT widened -- it already said what Keith wanted ***",
        /_isLocalReq\(req\) \|\| reqAuthed\(req\) \|\| \(authLanExempt\(\) && _isLan\(req\)\)/.test(srv),
        "host, or authed, or LAN-when-exempt. HE AUTHORISED A CHANGE THAT TURNED OUT TO BE UNNECESSARY, and " +
        "saying so is cheaper than making it. A round that quietly widened a security boundary because it had " +
        "permission to would be the worst possible reading of that permission");

    ok("...and the LAN half is still behind its own switch",
        /authLanExempt\(\) && _isLan\(req\)/.test(srv),
        "the wider LAN is trusted only when somebody TURNED THAT ON. Making it unconditional would have been a " +
        "real widening wearing a bug fix's clothes");
}

// ---- 3. THE UPDATE PATH TIMES ITSELF ------------------------------------------------------------------------------------
{
    ok("!! *** the update button reports elapsed seconds instead of a spinner ***",
        /_stopTimer/.test(page) && /updating\\u2026 " \+ _el \+ "s"/.test(page),
        "Keith: Update Now 'might still take longer than an extract and re-run'. THAT IS AN IMPRESSION UNTIL " +
        "SOMETHING TIMES IT -- and it was a feeling on both sides. One number, on the control you already " +
        "pressed, beats a stopwatch and a guess");

    ok("!! ...and it STOPS at the handover rather than claiming to time the restart",
        /accepted, restarting/.test(pageRaw) && /the RESTART is not included/.test(pageRaw),
        "the restart happens in a process this page is about to lose contact with, so the last measurable moment " +
        "from here is 'request accepted'. CLAIMING TO HAVE TIMED THE RESTART WOULD BE TIMING A RELOAD -- a " +
        "different number, and the one people would then quote");
}

// ---- 4. INSTALL AND RUN HISTORY (v3247) --------------------------------------------------------------------------------
{
    const hist = fs.readFileSync(path.join(ROOT, "ai-bridge", "installHistory.js"), "utf8");
    const h = noComments(hist);

    ok("!! *** the SERVER measures install-to-ready, because the browser cannot ***",
        /bootAt - buildWrittenAt/.test(h) && /\/install\/history/.test(srv),
        "v3246 timed the update BUTTON and said plainly it loses the process at the restart. A MANUAL extract is " +
        "invisible to a browser entirely -- NOBODY HAS THE PAGE OPEN WHILE THEY UNZIP. The server is the thing " +
        "that comes back, so it measures from the far side and the two paths finally share one scale");

    ok("!! ...and a missing measurement is NULL, not zero",
        /buildWrittenAt != null \? Math\.max\(0, bootAt - buildWrittenAt\) : null/.test(h),
        "A MISSING MEASUREMENT AND AN INSTANT INSTALL ARE OPPOSITE CLAIMS, and zero reads as the second -- " +
        "which is the empty-radar mistake this tree has now made twice and refused twice");

    ok("!! ...and new-build and restart averages are KEPT APART",
        /avgNewBuildMs/.test(h) && /avgRestartMs/.test(h) && /newBuild: !prev \|\| prev\.version !==/.test(h),
        "installing a new build and restarting the same one are different operations with very different " +
        "numbers. ONE AVERAGE OVER BOTH WOULD DESCRIBE NEITHER");

    // ASSERTED AGAINST THE WRONG FILE FIRST: ENGINE_VERSION_FOR_HISTORY lives in server.js, which is where the
    // engine root is known -- installHistory.js takes the version as an ARGUMENT precisely so it does not have
    // to go looking. I checked the module I was thinking about rather than the file the code is in.
    ok("...and the version is READ from main.js rather than typed a second time",
        /ENGINE_VERSION_FOR_HISTORY/.test(srv) && /ENGINE_VERSION = /.test(srv),
        "a version constant in two files is the defect this project has found nine times over, and the ship " +
        "ritual already bumps that one");

    ok("!! ...and the history is BOUNDED",
        /KEEP = 20/.test(h) && /while \(h\.runs\.length > KEEP\) h\.runs\.shift\(\)/.test(h),
        "an unbounded log of every boot is a file nobody reads that grows until somebody notices -- and this " +
        "session has spent its length on things nobody noticed");

    ok("...and a history that will not write must not stop a boot",
        /catch \{ \/\* a history that cannot be written/.test(hist),
        "a measurement is worth less than the thing it measures, and a server that refused to start because it " +
        "could not record how fast it started would be the joke version of this round");
}

// ---- 5. TWO THINGS THE RIG'S CONSOLE SAID, ONE OF WHICH WAS MY FIX NOT WORKING (v3258) -----------------------------------
{
    const gauges = fs.readFileSync(path.join(ROOT, "ui", "svgGaugeSet.js"), "utf8");

    ok("!! *** the gauges can say WHY they are empty ***",
        // SCOPED TO THE STATS POLL. My first version tested for a bare catch{} anywhere AFTER the first mention
        // of system/stats -- and this file has EIGHT of them for unrelated pollers (peer list, cloud status,
        // fps). A GLOBAL ASSERTION FOR A LOCAL PROPERTY, third time this session, and it failed on correct code.
        /_statsWhy/.test(gauges) &&
        /\/system\/stats[\s\S]{0,1400}?catch \(e\) \{[\s\S]{0,200}?_statsWhy/.test(gauges),
        "Keith, from a clean boot: 'still no gauges working' -- and a bare catch{} meant nothing in the console, " +
        "nothing on the page, and NO WAY FROM EITHER END to tell which of five things failed: the fetch, the " +
        "JSON, a 404, a payload in a different shape, or every provider genuinely reading zero. THE EMPTY-RADAR " +
        "MISTAKE FOR THE THIRD TIME IN THIS TREE");

    ok("!! ...and it distinguishes a dead route from an empty payload",
        /HTTP " \+ r\.status/.test(gauges) && /carried no usable cpu\/mem\/gpu fields/.test(gauges),
        "a 200 carrying the WRONG SHAPE is exactly the failure a bare catch cannot separate from a quiet " +
        "machine -- and the server's cpu field starts life null BY DESIGN, so one absent sample is normal and a " +
        "persistent absence is not");

    ok("...and it says so once, not on every tick",
        /_statsMissCount === 3/.test(gauges),
        "a poller that logs every failure buries the page it is describing. THREE CONSECUTIVE MISSES IS A " +
        "PATTERN; one is a hiccup");

    // *** v3257 SHIPPED A FIX THAT DID NOT WORK, AND THE RIG SAID SO IN THE SAME BREATH AS THE ONE THAT DID. ***
    // The PetFBI line went from "3 unmatched" to clean; the password warning came back FIVE TIMES, unchanged.
    // Chrome's message is literally "Password field is not contained in a form" -- I answered it with
    // autocomplete, which addresses a DIFFERENT warning about missing autocomplete hints. THE FIX HAD TO BE THE
    // THING THE MESSAGE ASKED FOR.
    //
    // v3809 -- AND PUTTING THEM IN FORMS SUMMONED THE NEXT MESSAGE, WHICH IS THE SAME LESSON ARRIVING ONCE MORE.
    // With every password field now in a form, Chrome moved on to "Password forms should have (optionally
    // hidden) username fields for accessibility" -- five of them again, one per form, in the same paste. The fix
    // is once more THE THING THE MESSAGE LITERALLY ASKS FOR: a username field, hidden (display:none, aria-hidden,
    // tabindex=-1) so it changes nothing a person sees or tabs to. This gate now pins BOTH halves so neither
    // warning can walk back in: every password field is still inside a form, AND every such form carries a
    // hidden username companion right before the password input.
    const pwTotal = (pageRaw.match(/<input[^>]*type="password"[^>]*>/g) || []).length;
    const pwInFormWithUser =
        (pageRaw.match(/<form[^>]*>\s*<input[^>]*autocomplete="username"[^>]*>\s*<input[^>]*type="password"[^>]*>\s*<\/form>/g) || []).length;
    ok("!! *** every password field is in a form AND that form has a (hidden) username field ***",
        pwInFormWithUser === pwTotal && pwTotal > 0,
        pwInFormWithUser + " of " + pwTotal + " password fields sit in a form that ALSO carries a username " +
        "field. v3257 added autocomplete and the FORM warning returned five times; v3258 answered the message it " +
        "actually sent by wrapping each in a form; that raised the USERNAME-field accessibility warning, and " +
        "v3809 answers THAT one the only way that has ever worked here -- with the exact thing it asks for");
}

// ---- 6. THE HEADER WRAPS WHERE IT MEANS SOMETHING (v3260) ----------------------------------------------------------------
{
    const hdr = pageRaw.slice(pageRaw.indexOf("<header"), pageRaw.indexOf("</header>") + 9);

    ok("!! *** the view controls wrap as ONE group, not five loose items ***",
        /id="hdrViewCtls"[^>]*flex-wrap:nowrap/.test(hdr) &&
        /hdrViewCtls[\s\S]*?fsScaleCtl[\s\S]*?fsBtn[\s\S]*?unlockBtn/.test(hdr),
        "Keith, on the MacBook Pro: Full Screen 'is dropping to the next line'. The header is flex-wrap:wrap and " +
        "A- / 90% / A+ / Full Screen / Unlock were FIVE SEPARATE FLEX ITEMS, so a narrow window broke the group " +
        "at whatever boundary fell first. THE FIX DOES NOT FORCE THE HEADER TO FIT -- it stops the header " +
        "SPLITTING A CONTROL AWAY FROM THE LABEL THAT EXPLAINS IT");

    const so = (hdr.match(/<span\b/g) || []).length, sc = (hdr.match(/<\/span>/g) || []).length;
    const bo = (hdr.match(/<button\b/g) || []).length, bc = (hdr.match(/<\/button>/g) || []).length;
    ok("!! ...and the header's tags still balance after the insertion",
        so === sc && bo === bc,
        so + " spans / " + sc + " closes, " + bo + " buttons / " + bc + " closes. WRAPPING EXISTING MARKUP IN A " +
        "NEW ELEMENT IS EXACTLY THE EDIT THAT SILENTLY EATS A CLOSING TAG, and a browser will paper over it " +
        "while the layout quietly stops meaning what it says");

    ok("...and the header still wraps at all",
        /header \{[^}]*flex-wrap:wrap/.test(pageRaw),
        "nowrap on the GROUP, wrap on the ROW. Making the whole header nowrap would trade a dropped button for a " +
        "horizontal scrollbar on every narrow screen -- a worse answer to the same question");
}

// ---- 7. A STATE IS A SETTING, NOT A COMMAND (v3261) -----------------------------------------------------------------------
{
    ok("!! *** keep-awake is a checkbox, and the handler reads the box rather than a cached flag ***",
        /<input type="checkbox" id="bKeepAwake"/.test(pageRaw) &&
        /bKeepAwake"\)\.onchange/.test(pageRaw) && !/bKeepAwake"\)\.onclick/.test(pageRaw) &&
        /turnOn = document\.getElementById\("bKeepAwake"\)\.checked/.test(pageRaw),
        "Keith: 'keep it as just a setting'. A BUTTON READS AS \"do this now\" AND THIS IS A STATE that persists " +
        "for as long as the server runs -- a checkbox IS the state instead of having to describe it. And a " +
        "checkbox already holds the REQUESTED value when onchange fires, so inverting a cached flag would " +
        "disagree with the box the moment the two ever drifted");

    ok("...and the endpoint, the poll and the disable-on-non-Windows branch are untouched",
        /\/sys\/keepawake\/status/.test(pageRaw) && /j\.win === false/.test(pageRaw) &&
        /b\.disabled = true/.test(pageRaw),
        "ONLY THE AFFORDANCE CHANGED, so nothing about what it DOES needs re-proving -- and `disabled` and " +
        "`title` mean the same thing on a checkbox as on a button, which is why that branch did not have to move");

    ok("!! the front-door label says where you are, not what it contains",
        /<option value="">Front: You Are Here<\/option>/.test(pageRaw),
        "'Front door: everything' described the OPTION; this describes the READER'S POSITION, which is what a " +
        "default selection in a filter is actually telling somebody");
}

console.log();
console.log("  ----  WHAT THE NUMBER WILL NOT SETTLE: whether Update Now beats unzipping by hand. It measures");
console.log("  ----  FETCH PLUS UNPACK, and a manual extract skips the fetch and pays the same restart. Two");
console.log("  ----  halves of the comparison, and this instruments the half a browser can see -- which is");
console.log("  ----  better than the nothing that was there, and is not the whole answer.");
if (fails) { console.log("authTrust-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("authTrust-selfcheck: all checks pass");
