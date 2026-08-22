// WebGLEngine/tools/ship/raymarchOptions-selfcheck.mjs -- v3351
// *** THE CONTRACT IS THE THING BEING GATED: every option declares SEEABLE or MEASURED, and one that declares
// neither cannot ship. A page of sliders whose effects nobody can judge is decoration with a control panel. ***
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OPTIONS, REFUSED, PINS, bucketsOf, admissible, pinnedOk, channelsOf, SEEABLE, MEASURED } from "../../render/raymarchOptions.mjs";
import { noComments } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

say(OPTIONS.length + " options, " + REFUSED.length + " refused. buckets: " +
    OPTIONS.map((o) => o.id + "[" + bucketsOf(o).join("+") + "]").join(" "));

ok("!! *** every shipped option declares SEEABLE or MEASURED ***", OPTIONS.every(admissible),
    "the whole contract. A control that changes neither the picture nor a number is decoration, and Keith's " +
    "requirement was that every option be one or the other");

ok("...and every one says what to EXPECT, so a run is a test and not a slideshow",
    OPTIONS.every((o) => typeof o.expect === "string" && o.expect.length > 30),
    "a demo that shows a difference without a pre-registered expectation cannot be wrong, which means it " +
    "cannot be right either");

// *** THE BRICK SKIP IS THE TYPE CASE AND ITS TWO HALVES PULL OPPOSITE WAYS. ***
const brick = OPTIONS.find((o) => o.id === "brickSkip");
ok("!! *** the brick skip must change the NUMBER and must NOT change the PICTURE ***",
    /^nothing\b/.test(brick.sees) && /IDENTICAL/.test(brick.sees) && /quer/i.test(brick.measures) &&
    bucketsOf(brick).includes(SEEABLE) && bucketsOf(brick).includes(MEASURED),
    "checking only the query count would miss the failure that matters: a brick wrongly EMPTY passes a ray " +
    "through a wall SILENTLY. Sameness is a visual claim and it is the load-bearing half here");

ok("...and it does not present the CPU figure as a GPU one",
    /CPU measured/.test(brick.expect) && /NEVER\s+BEEN TAKEN/.test(brick.expect),
    "94.0% is a CPU measurement over 5000 rays. A demo quoting it beside a GPU toggle would be attributing a " +
    "number to hardware that never produced it");

// *** THE REFUSALS ARE THE PART THAT MAKES THE PAGE HONEST. ***
ok("!! *** the refused options are KEPT WITH REASONS, not deleted ***",
    REFUSED.length >= 3 && REFUSED.every((r) => typeof r.why === "string" && r.why.length > 60),
    "a page showing only what it built looks complete, and a reader cannot tell a control that was REJECTED " +
    "from one nobody thought of. Same discipline the D=8 point and the install catalog's read-but-unconstrained " +
    "rows already carry");

const jump = REFUSED.find((r) => r.id === "brickJumpToExit");
ok("...and the one that is measurable is refused for the RIGHT reason",
    /CANDIDATE and not a/.test(jump.why) && /equivalence gate/.test(jump.why),
    "v3042 measured it changing ZERO first hits over 4000 rays. That makes it a candidate awaiting its own " +
    "gate -- putting it on a demo would present an unproven equivalence as a user choice");

// The page must actually render the contract, or the module is a contract nobody sees.
const page = fs.readFileSync(path.join(ENG, "raymarch-options.html"), "utf8");
ok("!! the page renders the bucket for every option and the reason for every refusal",
    /bucketsOf/.test(noComments(page)) && /REFUSED/.test(noComments(page)) && /raymarchOptions\.mjs/.test(noComments(page)),
    "a contract declared in a module and not shown on the page is a contract the operator never reads");

// *** v3356 -- THIS CHECK PINNED A SENTENCE THAT HAS CORRECTLY STOPPED BEING TRUE. *** v3351 required the page
// to say "it does not yet drive a live context", which was right THEN and is false now that it does. A check
// written to a sentence goes red when the sentence is correctly replaced -- the exact defect v3353 found on
// multigrid.html, and the third time this session. REPLACED WITH THE PROPERTY THAT SURVIVES: whatever the page
// currently does, it must state what is NOT verified, because wiring and working are different claims.
ok("!! *** the page distinguishes WIRED from VERIFIED ***",
    /not the same as being verified/i.test(page) && /no GPU/i.test(page) && /has not/i.test(page),
    "it drives a context now and NOTHING HERE HAS BEEN SEEN TO DRAW -- the sandbox has no GPU. A page that let " +
    "those two read the same would be the failure a demo is most prone to, which is what the v3351 wording was " +
    "guarding against before the page outgrew it");

// ---- v3352: THE TWO TAKEN FROM ENGINE SIM ------------------------------------------------------------------
ok("!! *** every SEEABLE option names what is PINNED while it is judged ***",
    OPTIONS.every(pinnedOk),
    "an engine dyno's RPM hold, pointed at a renderer. A toggle compared across two camera positions is TWO " +
    "PICTURES, not an A/B, and the difference a person reports is then partly the move. v3351 shipped six " +
    "options with nothing holding the camera still and I did not notice until Engine Sim's keybind list " +
    "named the idea");

ok("...and every pin is one the module DECLARES, not free text",
    OPTIONS.every((o) => !o.pin || o.pin.every((k) => k in PINS)),
    "a pin nobody can enforce is a note. " + Object.keys(PINS).join(", "));

ok("!! *** both channels are shown AT ONCE, because the disagreement between them is the value ***",
    OPTIONS.every((o) => channelsOf(o).bothAtOnce),
    "Engine Sim puts the oscilloscope beside the dyno rather than making you choose. The brick skip is right " +
    "only when the NUMBER MOVES and the PICTURE DOES NOT -- a page showing them in turn would let exactly that " +
    "disagreement pass unnoticed");

ok("...and the page renders the held-variable column and says why",
    /held while judging/i.test(page) && /two pictures, not an A\/B/i.test(page) && /RPM hold/i.test(page),
    "the reason has to travel with the column or the next person drops it as clutter");

// ---- v3356: THE LIVE HALF -----------------------------------------------------------------------------------
// v3351 shipped the contract and drove nothing, AND SAID SO -- and the gate asserted it said so. That sentence
// is now false, so the check that pinned it has to change with the page or it becomes the stale-sentence defect
// v3353 just fixed on multigrid.html.
ok("!! *** the page now DRIVES a context, through acquireGL rather than canvas.getContext ***",
    /acquireGL/.test(noComments(page)) && !/canvas\.getContext/.test(noComments(page)),
    "v3050: two pages took raw contexts and never released them, so they were part of the exhaustion they then " +
    "reported. And v3053: the failure reason goes to an OVERLAY DIV -- painting it with a 2D context would " +
    "permanently forfeit webgl2 on that canvas and make the failure IRREVERSIBLE");

ok("...and a broken chain NAMES which link, rather than leaving a black canvas",
    /no webgl2 context/.test(page) && /failed to link/.test(page) && /no region uploaded/.test(page) &&
    /no texture bound/.test(page),
    "five causes with five different fixes -- the v3047 lesson, where a blank canvas that names none of them " +
    "is not a bug report");

ok("...and it obeys the loop laws: hidden page does ZERO work, broken chain backs off",
    /document\.hidden/.test(page) && /schedule\(1000\)/.test(page) && /visibilitychange/.test(page),
    "v3051: with no context the first version of raymarch-live rebuilt a signature and rewrote innerHTML SIXTY " +
    "TIMES A SECOND to display the same sentence");

ok("...and pagehide is guarded on persisted, so bfcache does not dispose a live context",
    /pagehide/.test(page) && /e\.persisted/.test(page),
    "v3052: I shipped that bug once already -- entering the back-forward cache released the context AND removed " +
    "the listener, leaving a restored page with neither");

// *** THE PIN IS ENFORCED, NOT DECORATED. ***
ok("!! *** the A/B REFUSES while the camera is free ***",
    /A\/B REFUSED/.test(page) && /two pictures/i.test(page),
    "the held-variable column is worth nothing if the button ignores it. Engine Sim's RPM hold pins the speed " +
    "so the other readings mean something; an A/B taken across a camera move reports partly the move");

ok("!! the page no longer claims it drives nothing",
    !/does not yet drive a live context/i.test(page),
    "v3351 gated that sentence BECAUSE it was true. It is false now, and a check pinning a sentence that has " +
    "stopped being true is exactly the defect v3353 found on multigrid.html -- so it changes WITH the page");

ok("...and it still states what is UNVERIFIED, which is now a different claim",
    /[Rr]ig-unverified/.test(page) && /no GPU/i.test(page),
    "the sandbox has no GPU, so nothing here has been SEEN to draw. Wiring it does not make it verified, and " +
    "the page must not let those two read the same");

console.log(failed ? "raymarchOptions-selfcheck: " + failed + " FAILED" : "raymarchOptions-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
