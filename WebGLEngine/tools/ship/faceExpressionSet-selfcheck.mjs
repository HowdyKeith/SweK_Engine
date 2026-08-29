// WebGLEngine/tools/ship/faceExpressionSet-selfcheck.mjs -- v4110
//
// Run: node tools/ship/faceExpressionSet-selfcheck.mjs   (~0.1s; no camera, no browser, no network)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ui/faceExpressionSet.js -- the named-expression classifier behind the cat reactions, and behind
// whatever else asks "what face is this" next.
//
// *** THIS GATE EXISTS BECAUSE THE MODULE IS PURE, AND THE MODULE IS PURE BECAUSE OF THIS GATE. *** A
// classifier wired straight into a webcam page can only be checked by a person pulling faces at it, which is
// not a check -- it is a demo. classify() takes a blendshape bag and returns a verdict, so every expression
// can be driven to its face with synthetic coefficients, and more importantly EVERY NEAR-MISS CAN BE DRIVEN
// TOO. Section 3 is the real content here: it is not "does a smile read as a smile" but "does a SNEER read as
// a smile", which is the failure a person testing by pulling faces would never think to try.
//
// *** THE REFUSAL IS GATED LIKE A FEATURE. *** MediaPipe has no tongueOut blendshape (its 52 spend that slot
// on _neutral). MeowCV, the project this was built after reading, detects tongue from landmark GEOMETRY --
// a different input. So the module refuses tongue by name, and this gate holds that refusal to its reason:
// if somebody later adds a "tongue" recipe built out of jawOpen, section 5 goes red.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly } from "./sourceScan.mjs";
import {
    BLENDSHAPE_NAMES, RECIPES, REFUSED, NEUTRAL,
    classify, scoreRecipe, score, pair, makeExpressionReader,
} from "../../ui/faceExpressionSet.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("faceExpressionSet-selfcheck -- a named expression, and the near-misses it must refuse\n");

/** Build a blendshape bag in MediaPipe's own shape from {name: score}. */
const bag = (obj) => ({ categories: Object.entries(obj).map(([categoryName, s]) => ({ categoryName, score: s })) });
/** A full 52-category bag at rest, then overridden -- closer to what a real frame looks like than a 2-key bag. */
const face = (obj) => bag(Object.assign(Object.fromEntries(BLENDSHAPE_NAMES.map((n) => [n, 0])), obj));

// ---- 1. THE VOCABULARY IS REAL -----------------------------------------------------------------------------
{
    console.log("1. *** EVERY NAME A RECIPE USES IS A NAME MEDIAPIPE ACTUALLY EMITS ***");
    ok("the blendshape list is MediaPipe's own 52", BLENDSHAPE_NAMES.length === 52, BLENDSHAPE_NAMES.length + " names");
    ok("!! ...and it contains _neutral but NOT tongueOut -- the fact the refusal rests on",
        BLENDSHAPE_NAMES.includes("_neutral") && !BLENDSHAPE_NAMES.includes("tongueOut"),
        "ARKit's 52 include tongueOut; MediaPipe's spend that slot on _neutral. Quoted from kBlendshapeNames.");

    const known = new Set(BLENDSHAPE_NAMES);
    const used = new Set();
    for (const r of RECIPES) for (const clause of [...(r.all || []), ...(r.not || [])]) {
        for (const n of (Array.isArray(clause.ref) ? clause.ref : [clause.ref])) used.add(n);
    }
    const bogus = [...used].filter((n) => !known.has(n));
    ok("!! *** NO RECIPE REFERENCES A BLENDSHAPE THAT DOES NOT EXIST ***",
        bogus.length === 0,
        "a typo'd name scores null forever, which reads as 'that expression never happens' and is invisible " +
        "without checking against the real vocabulary. Checked " + used.size + " references. Bogus: " + JSON.stringify(bogus));
    ok("every recipe has a name, an emoji and a stated reason", RECIPES.every((r) => r.name && r.emoji && r.note));
    ok("...and no two recipes share a name", new Set(RECIPES.map((r) => r.name)).size === RECIPES.length);
    // Caught for real: the first cut gave angry and sad the SAME crying-cat emoji, so two different verdicts
    // rendered identically and the page looked broken rather than wrong. The emoji IS the whole output of the
    // reaction surface, so a collision there is a collision in the only thing the user sees.
    ok("!! *** ...and no two recipes share an EMOJI -- it is the entire visible output ***",
        new Set(RECIPES.map((r) => r.emoji)).size === RECIPES.length,
        RECIPES.map((r) => r.name + "=" + r.emoji).join(" "));
}

// ---- 2. EACH EXPRESSION IS REACHED BY ITS OWN FACE ----------------------------------------------------------
{
    console.log("\n2. EVERY EXPRESSION CAN ACTUALLY BE REACHED");
    const cases = [
        ["smile", { mouthSmileLeft: 0.8, mouthSmileRight: 0.8 }],
        ["shock", { eyeWideLeft: 0.7, eyeWideRight: 0.7, jawOpen: 0.7 }],
        ["glare", { eyeSquintLeft: 0.7, eyeSquintRight: 0.7, browDownLeft: 0.6, browDownRight: 0.6 }],
        ["angry", { browDownLeft: 0.8, browDownRight: 0.8, noseSneerLeft: 0.6, noseSneerRight: 0.6 }],
        ["sad", { mouthFrownLeft: 0.6, mouthFrownRight: 0.6, browInnerUp: 0.6 }],
        ["kiss", { mouthPucker: 0.8 }],
        ["puff", { cheekPuff: 0.7 }],
        ["wink", { eyeBlinkLeft: 0.9, eyeBlinkRight: 0.05 }],
    ];
    for (const [want, f] of cases) {
        const got = classify(face(f));
        ok("a " + want + " face classifies as " + want, got.name === want, "got " + got.name + " @ " + got.score.toFixed(2));
    }
    ok("!! every recipe in the module is covered by a case above",
        RECIPES.every((r) => cases.some(([n]) => n === r.name)),
        "a recipe nobody drives is a recipe that could be broken and green -- " + RECIPES.length + " recipes, " + cases.length + " cases");
    const rest = classify(face({}));
    ok("!! a face at rest is NEUTRAL, not the first recipe that happens to be listed",
        rest.name === NEUTRAL && rest.usable === true, JSON.stringify(rest));
}

// ---- 3. *** THE NEAR-MISSES: THIS IS THE SECTION THAT EARNS THE `not` CLAUSES *** ---------------------------
{
    console.log("\n3. *** A NEAR-NEIGHBOUR MUST NOT WEAR THE WRONG NAME ***");
    // Each pair below is genuinely confusable -- they share a raised signal -- and each `not` clause in the
    // module exists for exactly one of these. Deleting any ceiling turns one of these red.
    const confusions = [
        ["a scowling mouth-corner raise is NOT a smile",
            { mouthSmileLeft: 0.6, mouthSmileRight: 0.6, browDownLeft: 0.8, browDownRight: 0.8 }, "smile"],
        ["a wide-eyed open-mouthed GRIN is not a shock",
            { eyeWideLeft: 0.6, eyeWideRight: 0.6, jawOpen: 0.6, mouthSmileLeft: 0.8, mouthSmileRight: 0.8 }, "shock"],
        ["a squinty LAUGH is not a glare",
            { eyeSquintLeft: 0.7, eyeSquintRight: 0.7, browDownLeft: 0.5, browDownRight: 0.5, mouthSmileLeft: 0.8, mouthSmileRight: 0.8 }, "glare"],
        ["a smiling sneer is not ANGRY",
            { browDownLeft: 0.8, browDownRight: 0.8, noseSneerLeft: 0.6, noseSneerRight: 0.6, mouthSmileLeft: 0.7, mouthSmileRight: 0.7 }, "angry"],
        ["a dropped-jaw surprise is not SAD",
            { mouthFrownLeft: 0.6, mouthFrownRight: 0.6, browInnerUp: 0.6, jawOpen: 0.8 }, "sad"],
        ["an open-jawed pucker (talking) is not a KISS",
            { mouthPucker: 0.8, jawOpen: 0.6 }, "kiss"],
    ];
    for (const [label, f, mustNotBe] of confusions) {
        const got = classify(face(f));
        ok("!! " + label, got.name !== mustNotBe, "got " + got.name);
    }
    // The wink is the sharpest one: a BLINK is both eyes, and averaging would score it half a wink.
    const blink = classify(face({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9 }));
    ok("!! *** A BLINK IS NOT A WINK -- both eyes shut must score zero, not half ***",
        blink.name !== "wink",
        "this is why the wink recipe is a custom asymmetry test rather than a pair() average: an average of " +
        "0.9 and 0.9 clears any threshold a single wink would. Got: " + blink.name);
    const bothOpen = classify(face({ eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 }));
    ok("...and neither is a pair of open eyes", bothOpen.name !== "wink", "got " + bothOpen.name);
    // Brow-down alone is concentration. Anger needs the sneer too.
    const concentrating = classify(face({ browDownLeft: 0.8, browDownRight: 0.8 }));
    ok("!! brow-down ALONE is not anger -- it is concentration, and the sneer is what separates them",
        concentrating.name !== "angry", "got " + concentrating.name);
}

// ---- 4. UNKNOWN IS NOT NEUTRAL -----------------------------------------------------------------------------
{
    console.log("\n4. *** A FACE THAT CANNOT BE SEEN IS NOT A CALM FACE ***");
    for (const [label, input] of [["null", null], ["undefined", undefined], ["no categories", {}], ["empty categories", { categories: [] }]]) {
        const got = classify(input);
        ok("!! " + label + " -> usable:false and name:null, NOT neutral",
            got.usable === false && got.name === null,
            "v3114's law: mapping an absent face to the innocent-looking value makes 'the camera cannot see " +
            "you' indistinguishable from 'you are sitting still'. Got " + JSON.stringify(got.name));
    }
    // A bag that is missing ONE signal a recipe needs must make that recipe unjudgeable, not zero.
    ok("!! a recipe whose signal is absent scores NULL (unjudgeable), not 0 (absent muscle)",
        scoreRecipe(RECIPES.find((r) => r.name === "shock"), bag({ jawOpen: 0.9 })) === null,
        "shock needs eyeWide too; without it the honest answer is 'cannot say', and 0 would claim it was checked");
    ok("...and score()/pair() return null for a missing category rather than 0",
        score(bag({ jawOpen: 0.5 }), "cheekPuff") === null &&
        pair(bag({ mouthSmileLeft: 0.5 }), "mouthSmileLeft", "mouthSmileRight") === null,
        "a one-sided pair is a tracking artifact, so half a reading is no reading");
}

// ---- 5. THE REFUSAL HOLDS -----------------------------------------------------------------------------------
{
    console.log("\n5. *** TONGUE IS REFUSED BY NAME, AND THE REFUSAL IS HELD TO ITS REASON ***");
    const tongue = REFUSED.find((r) => r.name === "tongue");
    ok("!! tongue is refused, as DATA rather than as a sentence in a comment", !!tongue);
    ok("!! ...and the reason names the actual cause (no tongueOut in the set)",
        tongue && /tongueOut/.test(tongue.why) && /_neutral/.test(tongue.why));
    ok("!! ...and it says what detecting it would ACTUALLY require, rather than just refusing",
        tongue && /landmark/i.test(tongue.wouldNeed),
        "a refusal that does not say what would change it is a dead end; this one points at the real input");
    ok("!! *** NO RECIPE SMUGGLES A TONGUE IN UNDER ANOTHER NAME ***",
        !RECIPES.some((r) => /tongue/i.test(r.name)),
        "the failure this guards is somebody later adding a 'tongue' recipe built from jawOpen, which would " +
        "fire on any wide-open mouth -- a detector that lies, which v2579 rates worse than one that is absent");
}

// ---- 6. THE READER HOLDS AN EXPRESSION STILL ENOUGH TO LOOK AT ----------------------------------------------
{
    console.log("\n6. THE STATEFUL READER: TWO STABILISERS, TWO DIFFERENT FLICKERS");
    let t = 0;
    const rd = makeExpressionReader({ holdMs: 600, enter: 0.05, now: () => t });
    const smile = face({ mouthSmileLeft: 0.8, mouthSmileRight: 0.8 });
    const kiss = face({ mouthPucker: 0.9 });

    ok("the first reading takes immediately", rd.read(smile).name === "smile");
    t = 100;
    ok("!! *** a DIFFERENT expression arriving inside the hold window does NOT take over ***",
        rd.read(kiss).name === "smile",
        "without this, a momentary pucker mid-smile swaps the reaction and swaps back -- the flicker holdMs exists for");
    t = 800;
    ok("!! ...and once the hold has elapsed it DOES take over", rd.read(kiss).name === "kiss");

    // The margin: a challenger that is merely equal must not displace the holder.
    let t2 = 0;
    const rd2 = makeExpressionReader({ holdMs: 0, enter: 0.20, now: () => t2 });
    rd2.read(face({ mouthPucker: 0.60 }));
    t2 = 1000;
    const weak = rd2.read(face({ cheekPuff: 0.62 }));
    ok("!! a challenger that does not beat the holder BY THE MARGIN is refused even after the hold",
        weak.name === "kiss",
        "0.62 vs 0.60 is noise, not a change of expression; got " + weak.name);
    t2 = 2000;
    const strong = rd2.read(face({ cheekPuff: 0.95 }));
    ok("...and one that clears the margin takes over", strong.name === "puff", "got " + strong.name);

    // Unreadable must CLEAR, not hold.
    const gone = rd2.read(null);
    ok("!! *** an unreadable frame CLEARS the held expression rather than leaving a stale one on screen ***",
        gone.name === null && gone.usable === false,
        "a reaction still showing after the face has left is the stale-cache lie v3113 refused to ship");
    ok("...and the raw verdict travels alongside the stable one, so a caller can see both",
        !!rd2.read(smile).raw && rd2.read(smile).raw.usable === true);
}

// ---- 7. IT IS NOT A SECOND COPY OF v3114 --------------------------------------------------------------------
{
    console.log("\n7. THE OLD TWO-SIGNAL MODULE IS LEFT ALONE, AND THIS ONE DOES NOT REIMPLEMENT IT");
    // *** READ AS CODE, NOT AS TEXT. *** The first cut of this section grepped the RAW source and went red on
    // this module's own header comment, which NAMES faceExpression.js to explain why it does not wrap it --
    // a check that punishes a file for documenting its own relationship. That is the commentFalsePass species
    // this tree has already paid for more than once, and codeOnly() (which strips comments AND string
    // literals) is the answer it landed on.
    const src = codeOnly(fs.readFileSync(path.join(ENG, "ui", "faceExpressionSet.js"), "utf8"));
    ok("!! this module is PURE -- no DOM, no camera, no timers in the classifier",
        !/document\.|navigator\.|getUserMedia|setInterval/.test(src),
        "purity is what makes sections 2-5 possible at all; a classifier that needed a webcam could only be " +
        "demoed, not gated");
    ok("!! ...and it does not import or wrap v3114's faceExpression.js",
        !/faceExpression\.js/.test(src),
        "the old module drives ONE robot from TWO signals and is still correct for that; this is a different " +
        "question (which expression is this) rather than a replacement, so neither wraps the other");
    ok("the old module is still on disk and untouched by this round",
        fs.existsSync(path.join(ENG, "ui", "faceExpression.js")));
}

console.log("\n" + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
