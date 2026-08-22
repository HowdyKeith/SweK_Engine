// tools/ship/faceRig-selfcheck.mjs
//
// Run: node tools/ship/faceRig-selfcheck.mjs   (instant)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3117 -- THE RIGGED HEAD, DRIVEN BY THE WHOLE FACE.
//
// v3114 wired blendshapes to the SVG robot: two channels, because two is all the robot has. thead.html is a
// different proposition -- hinged jaw, tilting brows, scaling eyes, curving mouth, all continuous -- and until
// now THE ONLY WAY IN WAS FIVE NAMED MOODS. A face has no moods; it has coefficients.
//
// *** AND THE FAILURE IS WORSE HERE THAN ANYWHERE IT HAS BEEN. *** The first check below is the whole reason
// this round needed designing: an ABSENT FACE MAPS TO EXACTLY THE NEUTRAL MOOD. Not approximately -- the same
// four numbers. The robot's version of that bug looked like a calm robot; the HEAD's version looks like a
// person choosing to be still, which is more convincing and therefore a worse lie. So losing the signal changes
// the WIRE COLOUR, which no pose can imitate: a face can be calm, but no face is amber.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { codeOnly, noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const { mapBlendShapes, mapHeadPose, attachFaceRig } = await import(pathToFileURL(path.join(ENG, "ui", "faceRig.js")).href);
const rigRaw = fs.readFileSync(path.join(ENG, "ui", "faceRig.js"), "utf8");
const rig = codeOnly(rigRaw);
const headRaw = fs.readFileSync(path.join(ENG, "thead.html"), "utf8");
const cats = (o) => ({ categories: Object.entries(o).map(([categoryName, score]) => ({ categoryName, score })) });

// ---- 1. THE REASON THIS ROUND EXISTS -------------------------------------------------------------------------------
{
    const gone = mapBlendShapes(cats({}));
    // The literal neutral entry from thead.html's MOODS table, read from the page rather than retyped.
    const neutralLine = /neutral:\s*\{([^}]*)\}/.exec(headRaw);
    const neutral = neutralLine ? neutralLine[1] : "";
    ok("!! an ABSENT face maps to EXACTLY the neutral mood",
        gone.brow === 0 && gone.mouthCurve === 0 && gone.eye === 1 && gone.o === false && gone.jaw === 0 &&
        /brow:\s*0\.0/.test(neutral) && /mouthCurve:\s*0\.0/.test(neutral) && /eye:\s*1\.0/.test(neutral),
        "mapped " + JSON.stringify(gone) + " against the page's own neutral entry {" + neutral.trim() + "}. NOT " +
        "approximately -- the same four numbers. THE POSE CANNOT CARRY THIS SIGNAL, which is the entire design " +
        "constraint of the round");

    ok("!! so losing the face changes the WIRE COLOUR, not the pose",
        /signalLost\(on\)\s*\{/.test(headRaw) && /m\.color\.setHex\(c\)/.test(headRaw) && /0xffcc66/.test(headRaw),
        "a face can be calm, but no face is amber. A colour is categorically not an expression, which is the " +
        "only property that makes it usable here");

    ok("...and the rig CLEARS the channels when the signal goes",
        /if \(state\.signalLost\) \{ state\.channels = null; state\.faceJaw = null; \}/.test(headRaw) &&
        /head\.channels\(null\)/.test(noComments(rigRaw)),
        "leaving the last live pose up would be a stale expression shown as current -- the same lie v3113 " +
        "refused to cache for control state and v3116 refused to cache for tracker state");
}

// ---- 2. THE MAPPING'S EASY INVERSIONS ------------------------------------------------------------------------------
{
    const blink = mapBlendShapes(cats({ eyeBlinkLeft: 1, eyeBlinkRight: 1 }));
    const wide = mapBlendShapes(cats({ eyeWideLeft: 1, eyeWideRight: 1 }));
    ok("!! a BLINK closes the eye and eyeWide opens it",
        blink.eye < 1 && wide.eye > 1,
        "blink " + blink.eye.toFixed(2) + ", wide " + wide.eye.toFixed(2) + ". The coefficient RISES as the eye " +
        "SHUTS, so reading it as 'eye activity' and opening on it would invert the channel -- and the head " +
        "would stare hardest exactly when the eyes were closed");

    const smile = mapBlendShapes(cats({ mouthSmileLeft: .9, mouthSmileRight: .9 }));
    const frown = mapBlendShapes(cats({ mouthFrownLeft: .8, mouthFrownRight: .8 }));
    const both = mapBlendShapes(cats({ mouthSmileLeft: .6, mouthSmileRight: .6, mouthFrownLeft: .6, mouthFrownRight: .6 }));
    ok("!! mouthCurve is the DIFFERENCE of the opposing groups, not the larger of them",
        smile.mouthCurve > 0 && frown.mouthCurve < 0 && Math.abs(both.mouthCurve) < 0.05,
        "smile " + smile.mouthCurve.toFixed(2) + ", frown " + frown.mouthCurve.toFixed(2) + ", both-at-once " +
        both.mouthCurve.toFixed(2) + ". A face caught mid-change has both high; taking the max would flicker " +
        "between two poses on every frame where they cross");

    ok("...and a ONE-SIDED signal is ignored",
        mapBlendShapes(cats({ mouthSmileLeft: .9 })).mouthCurve === 0,
        "one side alone is a tracking artifact. Same rule as v3114 -- grinning at noise is worse than not " +
        "grinning at all");

    ok("!! coefficients are read BY NAME, never by index",
        /c\.categoryName === name/.test(rig) && !/categories\[\s*\d+\s*\]/.test(rig),
        "category ORDER is a property of the model file. A model update that reordered them would silently " +
        "remap every channel and nothing would look broken");
}

// ---- 3. THE HEAD POSE NOBODY HAS EVER READ ---------------------------------------------------------------------------
{
    const ident = { data: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] };
    ok("head pose comes from the transform the tracker already computes",
        mapHeadPose(ident) !== null && mapHeadPose(null) === null && mapHeadPose({ data: [1,2,3] }) === null,
        "facialTransformationMatrixes has been produced on every detect since the tracker was written and " +
        "nothing consumed it -- free yaw and pitch on work already being paid for");

    ok("...and ROLL is deliberately left on the floor",
        /Roll is available and is NOT used/.test(rigRaw) && !/roll:/.test(rig),
        "the rig has no roll. Inventing a channel the head cannot show would be a number with nowhere to go");
}

// ---- 4. ONE OWNER, AND A FRONT DOOR ----------------------------------------------------------------------------------
{
    ok("!! the head's live channels have the SAME SHAPE as a mood entry",
        /const mood = state\.channels \|\| MOODS\[state\.mood\];/.test(headRaw),
        "one line still resolves what the rig reads, and it takes either without knowing which. A second " +
        "vocabulary would drift from the first the moment anyone added a channel to one of them");

    ok("!! the module has a caller",
        /import\("\/ui\/faceRig\.js"\)/.test(headRaw) && /attachFaceRig\(api, tracker/.test(headRaw),
        "v3115 spent a round establishing that a module with no page is unfinished work wearing a finished " +
        "shape. thead.html loads MediaPipe LAZILY -- the bundle is ~12 MB and the page is useful without it");

    ok("...and the page names WHICH unknown",
        /NOT DETECTED \(camera on, nobody in frame\)/.test(headRaw) && /UNAVAILABLE \(camera not running\)/.test(headRaw),
        "the lighting versus the button. One word for both would undo the colour's whole purpose");

    const stopped = attachFaceRig({ channels() {}, signalLost() {}, look() {}, autoLook() {} }, { snapshot: () => ({ active: true, blendShapes: cats({ jawOpen: .9 }) }) }, { hz: 1000 });
    const before = stopped.state(); stopped.stop();
    ok("!! teardown says UNAVAILABLE rather than tidying to neutral",
        before === "live" && stopped.state() === "unavailable",
        "stopping is not seeing. A head left composed would be claiming a face nobody is reading");
}

console.log();
if (fails) { console.log("faceRig-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("faceRig-selfcheck: all checks pass");
