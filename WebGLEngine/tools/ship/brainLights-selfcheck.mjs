// WebGLEngine/tools/ship/brainLights-selfcheck.mjs -- v3024
//
// Run: node tools/ship/brainLights-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the avatar's brain lights being driven by the roundhouse.
//
// THE LIGHTS UNDER THE GLASS DOME HAVE FLASHED ON A TIMER SINCE THEY WERE DRAWN. Pretty, and carrying exactly
// zero information -- the avatar looked equally busy whether the engine was mid-experiment or doing nothing at
// all. Meanwhile the peer has published a real activity block since v3018 (idle / running / unattended /
// unknown, plus v3007's step trajectory) and NOTHING WAS READING IT.
//
// THE MAPPING IS DELIBERATELY NOT "MORE LIGHTS = BETTER". Each rule matches a distinction the activity block
// already makes, and flattening any one of them would let the avatar say something the fleet view does not:
//
//   RUNNING advances with round N of M, so the avatar shows PROGRESS rather than mere activity.
//   WORSENED shifts warm. This is the one worth seeing across a room, and the whole reason to drive lights
//   instead of printing text -- v3007 measured runs that ended worse than they started, which a verdict hides.
//   UNATTENDED FREEZES rather than going dark. A frozen pattern reads as STUCK; dark reads as FINISHED, and a
//   box that died mid-run says "running" forever.
//   UNKNOWN is dim, not off. A peer on a build too old to report is not an idle box.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const bot = fs.readFileSync(path.join(ENG, "ui", "swekRobot.js"), "utf8");
const ui = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE ROBOT ACCEPTS AN ACTIVITY BLOCK ----------------------------------------------------------------
{
    ok("!! setBrain exists and is exported", /function setBrain\(act\)/.test(bot) && /setState, setBrain,/.test(bot));
    ok("...and it takes the block THE PEER PUBLISHES", /act && act\.state/.test(bot),
       "not a bespoke shape -- the avatar reads the same field the fleet view and the minipanel read");
    ok("the current state is readable back", /get brain\(\)/.test(bot),
       "a light you cannot query is a light you cannot test");
    ok("!! it targets the REAL light cores", /\.botDomeLight\{/.test(bot),
       "my first draft invented a .brainCore class that appears nowhere in the drawing -- the rules would have applied to nothing and the gate would have passed on the CSS existing");
}

// ---- 2. RUNNING SHOWS PROGRESS, NOT JUST ACTIVITY ---------------------------------------------------------------
{
    ok("!! lit count is driven by round N of M", /Math\.ceil\(\(act\.round \/ act\.maxRounds\) \* 4\)/.test(bot),
       "an avatar that is merely 'on' during a six-round run tells you nothing you did not know when you started it");
    ok("!! ...and never falls to zero while running", /Math\.max\(1,/.test(bot),
       "a running box with no round reported yet is still running, and a dark brain would say otherwise");
    ok("...and is clamped to the four cores", /Math\.min\(4,/.test(bot));
}

// ---- 3. THE THREE DISTINCTIONS THAT MUST NOT BE FLATTENED -------------------------------------------------------------
{
    ok("!! a WORSENING trajectory shifts the colour warm", /brainWorse/.test(bot) && /#ffb46a/.test(bot),
       "v3007 measured runs that ended worse than they started; a verdict alone hides that and so would a single 'busy' colour");
    ok("!! UNATTENDED does NOT animate", /brainStuck \.botDomeLight\{animation:none/.test(bot),
       "a frozen pattern reads as stuck; dark reads as finished, and a box that died mid-run says running forever");
    ok("...and is not simply dark", /brainStuck \.botDomeLight\{animation:none!important;opacity:\.5/.test(bot),
       "half-lit and still is a different statement from off");
    ok("!! UNKNOWN is DIM, not off", /brainUnknown \.botDomeLight\{animation:none!important;opacity:\.18/.test(bot),
       "a peer on a build too old to report is not an idle box, and the avatar must not claim it is");
    ok("idle is a slow ambient, distinct from all of them", /brainIdle/.test(bot) && /swekBrainAmbient/.test(bot));
    ok("the five states are mutually exclusive", /for \(const c of \["brainIdle", "brainRunning", "brainWorse", "brainStuck", "brainUnknown"\]\) wrap\.classList\.remove\(c\)/.test(bot),
       "every class is cleared before one is set, so two states can never be lit at once");
}

// ---- 4. ONE OWNER FOR WHAT A STATE MEANS ---------------------------------------------------------------------------------
{
    // v3093 -- THIRTEENTH MECHANISM-PIN, AND THE GATE WENT RED FOR THE EXTRACTION ITS OWN HEADING DEMANDS.
    // These two checks greped server.html for the literal calls `setBrain(A.readActivity` and
    // `bot.setBrain({ state: "unknown" })` -- pinned to a file AND to exact syntax, down to the spaces inside
    // the braces. Both behaviours still exist and are correct; they MOVED, into ui/brainWiring.js, which is
    // precisely what "ONE OWNER FOR WHAT A STATE MEANS" asks for. A check that says the right code must be in
    // THIS file cannot survive the code being given a better home.
    //
    // WORSE THAN PINNED: DUPLICATED. brainWiring-selfcheck already proves the unknown rule BEHAVIOURALLY -- it
    // runs attachBrain against a failing fetch and asserts the state that comes back. Re-greping for the same
    // rule here was a second, weaker copy of an assertion that had a correct home, and the weak copy is the one
    // that failed. Two definitions of one claim, which is the shape this tree has met more than any other.
    //
    // SO THIS FILE NOW ASSERTS ONLY WHAT IT OWNS: that server.html DEFERS. The behaviour belongs to the module's
    // own gate and is not restated here.
    ok("!! server.html defers to the shared wiring instead of interpreting state itself",
        /attachBrain\s*\(/.test(ui) && /brainWiring\.js/.test(ui),
        "it imports ui/brainWiring.js and hands it the robot handle. WHERE the wiring lives is not this gate's " +
        "business; that it is not re-implemented in the page is");

    // THE PROPERTY THE OLD CHECK NEVER TESTED. Asserting that one correct line is PRESENT says nothing about
    // whether a second interpretation sits beside it -- and "one owner" is a claim about ABSENCE. Every
    // .setBrain call in the shipping tree must live in the single wiring module; a page that sets the light
    // itself would drift from the fleet view within one round of edits, silently, because both would look right.
    {
        const owners = [];
        for (const f of ["server.html", "ui/brainWiring.js", "ui/swekRobot.js"]) {
            let t = ""; try { t = fs.readFileSync(path.join(ENG, f), "utf8"); } catch { continue; }
            if (/\.setBrain\s*\(/.test(noComments(t))) owners.push(f);
        }
        ok("!! ...and there is exactly ONE owner of what a state means",
            owners.length === 1 && owners[0] === "ui/brainWiring.js",
            "callers of .setBrain: " + (owners.join(", ") || "none") + ". The old check asserted that one " +
            "correct line was PRESENT, which is silent about a second one sitting next to it -- and one-owner " +
            "is a claim about ABSENCE");

        // A CLAIM ABOUT ABSENCE MUST BE SHOWN FAILING, or it passes forever on a tree where the thing it
        // forbids was never possible. Synthetic, because planting a real second owner would mean editing a
        // shipping file to prove a gate works -- and the noComments() pass is load-bearing: this very file
        // discusses .setBrain in prose, and matching raw text would count the explanation as an owner.
        const detect = (t) => /\.setBrain\s*\(/.test(noComments(t));
        ok("SABOTAGE: a second setBrain caller IS detected",
            detect('function paint(b){ b.setBrain({ state: "idle" }); }'),
            "a page deciding the light for itself would drift from the fleet view within one round of edits, " +
            "silently, because both readings would look right");
        ok("...and a COMMENT about setBrain is not mistaken for one",
            !detect('// the wiring calls bot.setBrain(act) once per tick\nconst x = 1;'),
            "twelfth prose-as-code trap avoided rather than committed -- the sentence above this check is " +
            "exactly the text that would have matched");
    }
    ok("...through the handle the creation script already exports", /window\._swekRobot/.test(ui),
       "a second global for the same robot would be the same mistake one layer down");
    // v3093 -- the unknown rule is PROVEN BY RUNNING IT in brainWiring-selfcheck ("a failed fetch sets UNKNOWN,
    // not idle" -- attachBrain driven against a failing fetch, verdict read back). Greping for the source line
    // here was a weaker second copy, and it is the copy that broke when the line moved. What this file can still
    // usefully own is that the AVATAR HAS SOMEWHERE TO PUT the answer: a wiring that resolves unknown into a
    // state the drawing does not render would be correct and invisible.
    ok("!! the avatar can actually display an unreachable bridge",
        /brainUnknown/.test(bot) && /unknown/.test(fs.readFileSync(path.join(ENG, "ui", "brainWiring.js"), "utf8")),
        "the wiring produces 'unknown' and the drawing has a brainUnknown state to receive it. An unreachable " +
        "engine and an idle engine look identical unless something insists they are different -- and insisting " +
        "in the wiring is worth nothing if the light has no way to show it");
    ok("it polls rather than sampling once", /setInterval\(tick/.test(ui),
       "a light set once at page load is a screenshot, not a gauge");
}

console.log(fails ? "\nbrainLights-selfcheck: " + fails + " FAILED" : "\nbrainLights-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
