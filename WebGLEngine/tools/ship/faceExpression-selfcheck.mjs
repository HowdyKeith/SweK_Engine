// tools/ship/faceExpression-selfcheck.mjs
//
// Run: node tools/ship/faceExpression-selfcheck.mjs   (instant)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3114 -- THE BLENDSHAPES WERE ALREADY BEING COMPUTED AND NOTHING READ THEM.
//
// face/MediaPipeFaceTracker.js has always passed outputFaceBlendshapes and always exposed blendShapes on its
// snapshot. Nothing consumed them. That is v3104's shape -- the answer sitting in the variable while the next
// line reaches past it -- except here the cost was already being paid on every detect.
//
// ui/faceExpression.js is the ONE OWNER joining them to the robot, written as a module from the start because
// v3112 hand-rolled the same kind of guard twice and v3113 had to spend a round extracting it.
//
// THE CLAIM THIS FILE EXISTS TO DEFEND: A CALM FACE AND A LOST FACE MUST NOT LOOK THE SAME. When the tracker
// stops or the user leaves frame, every coefficient simply stops arriving -- which, mapped naively, is a closed
// mouth and no smile. Indistinguishable from sitting still. That is v3093's law in a new place, and the whole
// reason this wiring needed designing rather than just writing.
//
// AND FACE-UNKNOWN IS NOT BRAIN-UNKNOWN. The robot already had brainUnknown; reusing it would have been the
// two-things-one-label shape yet again. "The roundhouse is unreachable" and "the camera cannot see you" are
// separate facts with separate fixes -- one sends you to the server, the other to the lighting -- so they mark
// different parts of the drawing and can show at once.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { codeOnly } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const raw = fs.readFileSync(path.join(ENG, "ui", "faceExpression.js"), "utf8");
// v3114 -- FOURTEENTH PROSE-AS-CODE, AND THE GATE CAUGHT ME. Two checks below assert that the module does NOT
// mention the brain classes and does NOT cache -- and the module EXPLAINS at length that it deliberately does
// neither. Its own explanation tripped both regexes on the first run. codeOnly() blanks comments AND strings,
// which is what it has existed for since v3083; the raw text is kept only for questions about the CSS.
const src = codeOnly(raw);
const robotSrc = fs.readFileSync(path.join(ENG, "ui", "swekRobot.js"), "utf8");
const { attachFaceExpression, FACE_STATES } =
    await import(pathToFileURL(path.join(ENG, "ui", "faceExpression.js")).href);

// A DOM stand-in. The real surface cannot run here -- no browser, no camera -- so what is exercised is the
// STATE MACHINE, and that limit is stated rather than implied.
const mkEl = () => { const s = new Set(); return { dataset: {}, classList: { toggle: (c, on) => { on ? s.add(c) : s.delete(c); }, remove: (c) => s.delete(c), has: (c) => s.has(c) }, _set: s }; };
const drive = (snap) => {
    const el = mkEl(), played = [];
    const h = attachFaceExpression({ el, play: (n) => played.push(n) }, { snapshot: () => snap }, { hz: 1000 });
    return { el, played, h };
};
const cats = (o) => ({ categories: Object.entries(o).map(([categoryName, score]) => ({ categoryName, score })) });

// ---- 1. THE CLAIM -------------------------------------------------------------------------------------------------
{
    const calm = drive({ active: true, blendShapes: cats({ jawOpen: 0.02, mouthSmileLeft: 0.01, mouthSmileRight: 0.01 }) });
    const gone = drive({ active: true, blendShapes: null });
    const offr = drive({ active: false, blendShapes: null });

    ok("!! a CALM face and a LOST face are different states",
        calm.h.state() === "live" && gone.h.state() === "noface" && calm.el._set.has("faceUnknown") === false && gone.el._set.has("faceUnknown") === true,
        "calm reads '" + calm.h.state() + "', lost reads '" + gone.h.state() + "'. Every coefficient stopping " +
        "IS a closed mouth and no smile if you map it naively -- which is exactly someone sitting still");

    ok("!! and a stopped TRACKER is different again from an empty FRAME",
        offr.h.state() === "unavailable" && gone.h.state() === "noface",
        "'the camera is off' and 'nobody is in shot' are two facts with two fixes. Collapsing them would be " +
        "the same shape this whole arc keeps finding");

    ok("...and stopping does NOT tidy back to a calm face",
        (() => { const d = drive({ active: true, blendShapes: cats({ jawOpen: 0.9 }) }); d.h.stop(); return d.h.state() === "unavailable" && !d.el._set.has("mouthOpen"); })(),
        "teardown says unavailable. Leaving the robot mid-expression would claim a face nobody is reading");

    calm.h.stop(); gone.h.stop(); offr.h.stop();
}

// ---- 2. IT NEVER TOUCHES THE BRAIN --------------------------------------------------------------------------------
{
    const d = drive({ active: false, blendShapes: null });
    const brainish = ["brainIdle", "brainRunning", "brainWorse", "brainStuck", "brainUnknown"].filter((c) => d.el._set.has(c));
    ok("!! the face wiring sets no brain class, even when it knows nothing",
        brainish.length === 0 && !/brainUnknown|brainIdle|brainStuck/.test(src),
        "those belong to brainWiring and mean something else. ONE OWNER IS A CLAIM ABOUT ABSENCE -- asserting " +
        "this module sets faceUnknown says nothing about whether it also reaches for the brain's classes");
    d.h.stop();

    ok("!! and the drawing can actually SHOW face-unknown, on a different part",
        /\.swekRobot\.faceUnknown \.botEyes\{/.test(robotSrc) && /\.swekRobot\.brainUnknown \.botDomeLight\{/.test(robotSrc),
        "faceUnknown dims the EYES, brainUnknown kills the DOME LIGHT, so both can show at once. A wiring that " +
        "resolved to a state the drawing cannot render would be correct and invisible -- v3093's other half");
}

// ---- 3. THE MAPPING'S OWN FRAGILITIES ------------------------------------------------------------------------------
{
    ok("!! blendshapes are looked up BY NAME, never by index",
        /c\.categoryName === name/.test(src) && !/categories\[\s*\d+\s*\]/.test(src),
        "the category ORDER is a property of the model file. A model update that reordered them would silently " +
        "remap every expression, and nothing would look broken");

    ok("!! the smile trigger has hysteresis",
        /SMILE_OFF = SMILE_ON - /.test(src),
        "one threshold on a noisy continuous signal flickers on every frame that lands near it -- the smile " +
        "would strobe. Rise high, fall low");

    ok("...and it is EDGE-triggered, because play() is a one-shot",
        /if \(!smiling && sm >= SMILE_ON\)/.test(src),
        "re-firing an animation every tick restarts it forever, which reads as a frozen expression rather than " +
        "a repeated one");

    ok("!! and no last-known expression is held while the face is gone",
        !/lastGood|lastExpression|cache/i.test(src),
        "a stale expression shown as current is the same lie v3113 refused to cache for control state");

    const one = drive({ active: true, blendShapes: cats({ mouthSmileLeft: 0.9 }) });
    ok("a one-sided smile is not a smile",
        one.played.length === 0,
        "pair() returns null unless BOTH sides are present -- one side alone is a tracking artifact, and " +
        "treating it as an expression would make the robot grin at noise");
    one.h.stop();
}

// ---- 3b. v3115: THE FRONT DOOR ----------------------------------------------------------------------------------
// v3114 SHIPPED THIS MODULE AND NOTHING CALLED IT. By this project's own rule that makes it unfinished -- a
// module with no page is a tool nobody can reach, and it is also the only way to answer the two questions v3114
// left open, because both need a real face in front of a real camera.
{
    const page = fs.readFileSync(path.join(ENG, "face-mirror.html"), "utf8");

    ok("!! the module has a caller",
        /import\("\.\/ui\/faceExpression\.js"\)/.test(page) && /attachFaceExpression\(/.test(page),
        "face-mirror.html is the page that already owns the tracker, so it is where the robot belongs. A " +
        "module with no front door is unfinished work wearing a finished shape");

    ok("...and a robot to drive",
        /createSwekRobot\(\)/.test(page) && /robot-host/.test(page),
        "the page had the tracker and no robot; the wiring needs both ends to exist");

    ok("!! the page NAMES which unknown it is showing",
        /NOT DETECTED/.test(page) && /UNAVAILABLE/.test(page),
        "'nobody in frame' and 'tracker not running' are different facts with different fixes -- one is the " +
        "lighting, the other is the button. Showing one word for both would undo the entire point of v3114");

    ok("!! the wiring is torn down BEFORE the tracker",
        /faceFx\.stop\(\);[\s\S]{0,200}?tracker\.stop\(\)/.test(page),
        "the other order leaves one tick polling a tracker mid-teardown. faceExpression reports 'unavailable' " +
        "on stop, so the robot says so rather than freezing on whatever expression it was wearing");

    ok("...and it polls snapshot() rather than riding onUpdate",
        !/onUpdate\([^)]*attachFaceExpression/.test(page),
        "a slow robot must never be able to add work to the detect path -- which matters more than usual here, " +
        "because detectForVideo is STILL synchronous on this thread and v3110's finding is unfixed");
}

// ---- 4. WHAT THIS CANNOT CHECK -------------------------------------------------------------------------------------
{
    ok("the state vocabulary is declared, so a fourth state cannot appear silently",
        Array.isArray(FACE_STATES) && FACE_STATES.length === 3,
        FACE_STATES.join(", "));
    console.log("  NOTE   there is no browser and no camera here, so what runs above is the STATE MACHINE against a");
    console.log("         DOM stand-in. Whether jawOpen 0.35 is the right threshold for a real face, and whether the");
    console.log("         dimmed eyes read as 'cannot see you' rather than 'sleepy', are questions for the rig.");
    console.log("         v3110's responsiveness probes are the tool for the first; Keith's eyes for the second.");
}

console.log();
if (fails) { console.log("faceExpression-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("faceExpression-selfcheck: all checks pass");
