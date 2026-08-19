// WebGLEngine/tools/ship/pipboyRadar-selfcheck.mjs
//
// Run: node tools/ship/pipboyRadar-selfcheck.mjs   (~3s -- MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3237 -- THE PIP-BOY DREW FROM A RADAR IT HAD JUST SWITCHED OFF.
//
// installPeerRadar() is a SINGLETON -- `if (window.peerRadar && window.peerRadar._installed) return
// window.peerRadar;` -- so ui/pipboyWireframe.js took THE SHARED RADAR, the same one the main render window
// fills with planes and peers. It then called .hide() to keep the overlay out of its scene, and hide() does
// THREE things:
//
//     if (root) root.style.display = "none";
//     if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = 0; }
//     if (_raf) { cancelAnimationFrame(_raf); _raf = 0; }
//
// *** IT STOPS THE WORK. *** Blips stopped updating for everybody, while the Pip-Boy's canvas kept animating its
// own sweep and range rings over a field that could never change. AN EMPTY RADAR AND A STOPPED RADAR RENDER
// IDENTICALLY, which is why pipboyWireframe's header could promise "RADAR reuses the shared window.peerRadar
// (same blips/modes)... draws LIVE expanding ping rings" and be wrong for as long as it has existed.
//
// KEITH SPOTTED IT ON THE RIG. NOTHING IN THE CODE COULD HAVE -- every use sits behind a try{} and the failure
// mode is a convincing picture of nothing.
//
// "HIDDEN" AND "NOT NEEDED" ARE DIFFERENT CLAIMS AND hide() COLLAPSED THEM. Stopping when nobody is looking is
// correct; a consumer reading the DATA is looking, even with the overlay off. dockInto() had already solved the
// same problem for the STATUS panel with a _docked flag that makes hide() a no-op -- but it needs a DOM SLOT,
// and a consumer that wants no overlay anywhere has nothing to hand it. hideChrome() is that case.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noComments, codeOnly } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const radarRaw = fs.readFileSync(path.join(ROOT, "ui", "peerRadar.js"), "utf8");
const radar = codeOnly(radarRaw);
const pipRaw = fs.readFileSync(path.join(ROOT, "ui", "pipboyWireframe.js"), "utf8");
const pip = codeOnly(pipRaw);

// ---- 1. hide() STILL STOPS THE WORK, WHICH IS WHY THE OTHER DOOR HAD TO EXIST -----------------------------------------
{
    const hideBody = (radar.match(/function hide\(\)[\s\S]{0,400}?\n    \}/) || [""])[0];
    ok("!! *** hide() stops the poll timer and the rAF, not just the element ***",
        /clearInterval\(_pollTimer\)/.test(hideBody) && /cancelAnimationFrame\(_raf\)/.test(hideBody),
        "asserted because the WHOLE BUG rests on it: a caller reading hide() as 'hide the box' gets a stopped " +
        "data source. IF SOMEBODY MAKES hide() COSMETIC, this check goes red and hideChrome() becomes redundant " +
        "in the same edit -- which is the honest way for this to expire");

    ok("!! ...and hideChrome() hides WITHOUT stopping",
        /function hideChrome\(\)/.test(radar) &&
        !/clearInterval|cancelAnimationFrame/.test((radar.match(/function hideChrome\(\)[\s\S]{0,200}?\n    \}/) || [""])[0]),
        "the element goes, the work continues. 'HIDDEN' AND 'NOT NEEDED' ARE DIFFERENT CLAIMS and the old API " +
        "had only one word for both");

    ok("...and it is on the public object, not just defined",
        /_installed: true, show, hide, hideChrome/.test(radar),
        "a function nobody can reach is the shape this whole session keeps finding");
}

// ---- 2. THE PIP-BOY NO LONGER SILENCES ITS OWN SOURCE -------------------------------------------------------------------
{
    ok("!! *** the Pip-Boy calls hideChrome(), not hide() ***",
        /_radar\.hideChrome\(\)/.test(pip),
        "it installs the SHARED radar -- installPeerRadar returns the singleton -- so whichever consumer calls " +
        "hide() stops it FOR EVERYBODY. The Pip-Boy was doing that to itself and then drawing the result");

    ok("...and the fallback to hide() is kept deliberately",
        /else if \(_radar && _radar\.hide\) _radar\.hide\(\)/.test(pip),
        "an older peerRadar without hideChrome should still get its overlay hidden rather than throwing. THE " +
        "FALLBACK IS WORSE AND IT IS NAMED AS THE FALLBACK, which is different from being the behaviour");

    ok("!! the singleton claim this rests on is still true",
        /window\.peerRadar\.\_installed\) return window\.peerRadar/.test(radar.replace(/\\/g, "")) ||
        /_installed\) return window\.peerRadar/.test(radar),
        "if installPeerRadar ever returns a FRESH instance per call, the Pip-Boy gets a private radar with no " +
        "blips and this fix stops meaning anything -- so the property is asserted rather than assumed");
}

// ---- 3. THE ABSENCE IS DRAWN, NOT MIMED ---------------------------------------------------------------------------------
{
    ok("!! *** a stopped or missing radar is NAMED on the canvas ***",
        /NO RADAR SOURCE/.test(pipRaw) && /0 CONTACTS/.test(pipRaw),
        "the sweep and the range rings come from THIS canvas's own loop, so a switched-off radar looks exactly " +
        "like a quiet neighbourhood. A CONVINCING PICTURE OF NOTHING is the worst kind of empty state -- v3120's " +
        "rule in a different subsystem: unsupported is a capability, not a failure, and neither is silence");

    ok("...and it distinguishes NO SOURCE from ZERO CONTACTS",
        /if \(!_radar\)/.test(pip) && /st\.blips === 0/.test(pip),
        "two different facts that used to render as one blank screen -- the same 'two things wearing one label' " +
        "that has run through this entire session");
}

// ---- 4. SCREEN 2: A TALKING HEAD THAT DOES NOT PRETEND TO LIP-SYNC (v3238) ---------------------------------------------
{
    ok("!! *** the mouth is driven by speechSynthesis.speaking -- a real signal, not a timer ***",
        /speechSynthesis\.speaking/.test(pip) && /_mouth = speaking \?/.test(pip),
        "this screen repaints every 200ms -- FIVE FRAMES A SECOND -- and there is no viseme stream. A mouth " +
        "animated to look like phonemes would be an animation that merely CORRELATES with speech, which is " +
        "Keith's 'NOT THEATRE, BUT DEMONSTRATION' in a second subsystem. It reports the one fact it can know");

    ok("!! ...and the screen SAYS which fact it is reporting",
        /SPEAKING/.test(pipRaw) && /IDLE/.test(pipRaw),
        "a moving mouth with no label invites the reading that it is lip-syncing. THE LABEL IS THE DIFFERENCE " +
        "between a readout and a puppet");

    ok("...and the clock it replaced is still on the screen",
        /toLocaleTimeString/.test(pip),
        "it was the least important thing there, which is why it gave up the space -- but DELETING A WORKING " +
        "READOUT TO MAKE ROOM FOR A NEW ONE is not the same as replacing it, and this tree has spent a session " +
        "finding things that vanished without anybody deciding");

    ok("!! ...and setScreen2 still overrides it entirely",
        /_custom2 \? _custom2\(ctx2, cv2\) : draw2nd\(ctx2\)/.test(pip),
        "the head is the DEFAULT for screen 2, not a fixture. Anything richer -- a real rig, a tracker feed -- " +
        "arrives by passing a draw function, which is the API that was already there");
}

// ---- 5. THE GPU BRAIN, LIVE, IN GREEN (v3241) --------------------------------------------------------------------------
{
    ok("!! *** BRAIN is a page in the cycle, drawn in the unit's OWN palette ***",
        // *** THIRD TIME THIS SESSION I PICKED THE WRONG ONE OF THE THREE INSTRUMENTS. *** `pip` is codeOnly(),
        // which strips STRINGS as well as comments -- so the page names and the endpoint URL, which are exactly
        // the text being asserted, came back blank. Page names and URLs are TEXT THE CODE CONTAINS, so
        // noComments() is the tool; codeOnly is for an IDIOM. The identifier half stays on codeOnly, because
        // that half genuinely is an idiom.
        /"STATS", "INV", "MAP", "DATA", "BRAIN"/.test(noComments(pipRaw)) && /BRAIN: pageBrain/.test(pip) &&
        /pageBrain[\s\S]{0,900}?SCREEN_BG/.test(pip) && /pageBrain[\s\S]{0,900}?INK/.test(pip),
        "GREEN IS NOT A THEME APPLIED HERE, IT IS THE PALETTE THIS UNIT ALREADY DRAWS IN -- the same INK and " +
        "SCREEN_BG every other page uses. A page reaching for its own colours would be a second copy of the " +
        "palette, which is this session's most repeated defect in a smaller costume");

    ok("!! ...and it reads the SAME endpoint server.html's GPU Brain panel reads",
        /\/ai\/brain\/health/.test(noComments(pipRaw)),
        "so the Pip-Boy and the panel CANNOT DISAGREE about what the brain is doing. Reading the mind page " +
        "instead would have been a second interpretation of the same facts");

    ok("!! *** a silent bridge is not an idle brain, and the screen says which ***",
        /NO BRIDGE/.test(pipRaw) && /_brain = null/.test(pip),
        "_brain stays null until an answer arrives. RENDERING A HOPEFUL 'IDLE' OVER A SERVER THAT NEVER REPLIED " +
        "is the empty-radar mistake this same unit already made once at v3237 -- and the fix there was the same " +
        "sentence: name the absence rather than draw a convincing nothing");

    ok("...and the failure REASON reaches the screen, not just the fact",
        /_brainErr/.test(pip),
        "'NO BRIDGE (HTTP 404)' and 'NO BRIDGE (Failed to fetch)' send somebody to different places");
}

// ---- 6. A LIVE BRAIN TAKES SCREEN 1 (v3242) ----------------------------------------------------------------------------
{
    ok("!! *** the brain takes screen 1 while SOLVING, and only while solving ***",
        /const brainLive = !!\(_brain && _brain\.solving\)/.test(pip) && /_page = PAGES\.indexOf\("BRAIN"\)/.test(noComments(pipRaw)),
        "ACTIVE IS NOT REACHABLE. `solving` is the health endpoint's own word for it rather than a guess " +
        "assembled from other fields -- and a brain that merely ANSWERS would pin BRAIN permanently on any box " +
        "running the bridge, which is the opposite of telling you something is happening");

    ok("!! ...and a mounted texture is PARKED, not dropped",
        /_texParked = _screen1Tex/.test(pip) && /setScreen1Texture\(t\)/.test(pip),
        "the head on screen 1 is a render target THE HOST OWNS and keeps rendering into. Forgetting it here " +
        "would mean the host had to notice and re-mount -- A SECOND PLACE THAT HAS TO KNOW ABOUT THE FIRST, " +
        "which is how the two halves drift. It comes back by itself");

    ok("...and the cycle resumes rather than staying stopped",
        /if \(now - _pageT > 7000\)/.test(pip) && /} else {/.test(pip),
        "a screen that stopped cycling because something happened once, and never started again, is a worse " +
        "readout than one that never reacted at all");
}

console.log();
console.log("  ----  WHAT THIS DOES NOT PROVE: that blips actually arrive. That needs peers on a LAN and a rig,");
console.log("  ----  and it is exactly the check nothing in this tree can make. What it does prove is that the");
console.log("  ----  Pip-Boy no longer switches off the source it reads, and that a dead radar now SAYS so");
console.log("  ----  instead of drawing a sweep over an empty field.");
if (fails) { console.log("pipboyRadar-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("pipboyRadar-selfcheck: all checks pass");
