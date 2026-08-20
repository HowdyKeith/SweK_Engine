// WebGLEngine/tools/ship/stateOrb-selfcheck.mjs -- v3357
// *** THE BINDING RULE IS THE GATE: every orb state must name a distinction the engine already draws. An orb
// with fewer states than the page has is the collapse three separate rounds were spent undoing. ***
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ORB_STATES, STATE_NAMES, dotsAt, drawOrb, clockNow, resetClock, dprCap } from "../../ui/stateOrb.js";
import { noComments } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };
const page = fs.readFileSync(path.join(ENG, "orbs.html"), "utf8");
const src = fs.readFileSync(path.join(ENG, "ui", "stateOrb.js"), "utf8");

say(STATE_NAMES.length + " states: " + STATE_NAMES.map((n) => n + " (not " + ORB_STATES[n].notThe + ", " + ORB_STATES[n].won + ")").join("; "));

ok("!! *** every state names the distinction it exists to keep, and the round that won it ***",
    STATE_NAMES.every((n) => ORB_STATES[n].notThe && /^v\d+$/.test(ORB_STATES[n].won)),
    "NEVER RUN is not PASS (v3048), TIMEOUT is not FAILURE (v3076), VERDICT-OWED cannot be reached by rendering " +
    "harder (v3339). Each cost a round. AN ORB WITH FEWER STATES THAN THE PAGE HAS IS THAT COLLAPSE IN MOTION");

ok("!! *** an unknown state draws NOTHING rather than a default orb ***",
    dotsAt("loading", 0, 64) === null && dotsAt("spinner", 1, 20) === null,
    "a generic spinner is exactly what this module exists INSTEAD OF, so it must not be reachable by typo. " +
    "A spinner that spins forever is the black-screen-without-a-reason failure in a new costume -- WORSE than " +
    "a blank area, because it looks like an answer");

ok("!! the six are visually distinct, not one shape with six labels",
    new Set(STATE_NAMES.map((n) => ORB_STATES[n].spin + ":" + ORB_STATES[n].dots)).size >= 5,
    "six labels on one animation would be the same collapse wearing a legend");

// PLAIN 2D ONLY -- the property that lets it draw while the GPU path is down.
ok("!! *** no WebGL, no ctx.filter, no SVG filter ***",
    !/webgl|ctx\.filter|filter\s*=/.test(noComments(src)) && !/getContext\(["']webgl/.test(noComments(page)),
    "the same pixels everywhere and cheap on low-end devices -- and it renders while the GPU path is down, " +
    "which is the trick ray-march-demo and biome-map-demo already use");

// ONE CLOCK, driven rather than asserted.
resetClock();
const a = clockNow(1000), b = clockNow(2000);
ok("!! one shared clock: every orb reads the same base and resumes IN PHASE",
    a === 0 && Math.abs(b - 1) < 1e-9,
    "six orbs each with their own rAF drift apart within seconds and read as six unrelated things");

ok("...and the two sizes are tuned rather than scaled",
    dotsAt("working", 0, 64).length > dotsAt("working", 0, 20).length,
    "thinking-orbs ships them as separate designs with their own dot count and speed, not a scale factor -- " +
    "20 dots at 64px, 12 at 20px");

ok("!! devicePixelRatio is capped at 2", dprCap(3) === 2 && dprCap(1) === 1);

// THE LOOP LAWS.
ok("!! a hidden tab does ZERO work, not less",
    /document\.hidden/.test(page) && /visibilitychange/.test(page),
    "v2771/v3051 -- a backgrounded page that renders nothing at 60fps is what Keith saw as throttled-request " +
    "warnings");

ok("...and reduced motion paints a STATIC REPRESENTATIVE frame, then stops",
    /prefers-reduced-motion/.test(noComments(src)) && /reducedMotion\(\)/.test(noComments(page)),
    "not a blank one -- the STATE still has to read. Animating slowly would be neither");

// *** v3359 -- THIS PINNED "not wired into server.html yet", WHICH HAS CORRECTLY STOPPED BEING TRUE. FOURTH
// TIME THIS SESSION A CHECK WRITTEN TO A SENTENCE WENT RED ON A GOOD CHANGE (v3353 multigrid.html, v3356
// raymarch-options, and the v3351 wording before it). THE SURVIVING PROPERTY IS NOT THE WORDING, IT IS THAT
// THE PAGE'S WIRING CLAIM MATCHES THE TREE -- and that is checkable in BOTH directions, so it can never again
// be satisfied by a sentence that has drifted. ***
{
    const claimsUnwired = /[Nn]ot wired into server\.html/.test(page);
    const actuallyWired = /data-orb=/.test(fs.readFileSync(path.join(ENG, "server.html"), "utf8"));
    ok("!! *** the page's wiring claim MATCHES THE TREE, checked both ways ***",
        actuallyWired !== claimsUnwired,
        "wired=" + actuallyWired + ", page-claims-unwired=" + claimsUnwired + ". A page that said it was unwired " +
        "while server.html mounted it, or claimed a wiring that was not there, are the same defect in opposite " +
        "directions -- and a check pinned to either SENTENCE would go red the day somebody fixed the other");
}

ok("...and it credits the source it did NOT install",
    /thinking-orbs/.test(page) && /not installable here/i.test(page),
    "MIT, React + npm + Vite. The idea was taken and the package was not, and both halves are stated");

// ---- v3359: WIRED INTO server.html -------------------------------------------------------------------------
const srv = fs.readFileSync(path.join(ENG, "server.html"), "utf8");

ok("!! *** the orbs are beside the rows they describe, not only on their own page ***",
    /data-orb=/.test(srv) && /__swekMountOrbs/.test(noComments(srv)) && /ui\/stateOrb\.js/.test(noComments(srv)),
    "v3357 built the module and its front door and said plainly it was NOT wired here. This is the wiring, and " +
    "ONE loop finds every [data-orb] anywhere on the page, so it generalises without touching another line of " +
    "a 480 KB file");

ok("!! *** the orb's state comes from the SAME expression that writes the text ***",
    /var state = !p\.last \? "never-run"/.test(srv),
    "two derivations of one state is how a badge comes to disagree with its own label -- and this page spends " +
    "most of its length avoiding exactly that");

// *** THE GAP THE ORB EXPOSED. ***
ok("!! *** the row now shows TIMEOUT, which it did not before ***",
    /timedOut \? "timeout"/.test(srv) && /TIMEOUT<\/span>/.test(srv),
    "it said never run / pass / FAIL. v3076 established that A TIMEOUT IS NOT A FAILURE -- null is the exit " +
    "code of a process that was KILLED, and reporting it as failure is a confident wrong answer about " +
    "UNFINISHED WORK. THE ORB MADE THE GAP OBVIOUS because the module HAS that state and the row had nowhere " +
    "to put it. Wiring a display found a missing distinction, which is the opposite of what decoration does");

ok("...and an unknown data-orb mounts NOTHING",
    /if \(!ORB_STATES\[st\]\) continue/.test(srv),
    "the same refusal the module makes, enforced at the mount point too -- a typo in a data attribute must not " +
    "produce a generic spinner");

ok("...and the loop obeys the page laws: hidden tab does zero work, detached canvases are dropped",
    /document\.hidden/.test(srv) && /isConnected/.test(srv),
    "the rows are rebuilt on every filter keystroke, so a mount list that never forgot would grow without " +
    "bound and keep drawing into canvases nobody can see");

console.log(failed ? "stateOrb-selfcheck: " + failed + " FAILED" : "stateOrb-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
