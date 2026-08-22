// tools/ship/rigMix-selfcheck.mjs
//
// Run: node tools/ship/rigMix-selfcheck.mjs   (instant)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3125 -- WHO OWNS EACH CHANNEL, AND WHOSE OPINION IS ALLOWED TO SCALE IT.
//
// The head grew three drivers in eight rounds and nobody wrote the precedence down. v3117 gave it continuous
// channels; v3121 let a tracked face own the jaw; v3124 let caption markup set a VOLUME SCALE. Each was
// reasonable alone. Together they collided on one line of the render loop:
//
//     jawOpen = (faceJaw != null ? faceJaw : talkEnergy) * 0.5 * exprGain
//
// *** exprGain MULTIPLIES BOTH BRANCHES, AND A CAPTION SETS IT. *** A shouted line calls expression(1.8), so
// with the camera on it scaled THE USER'S REAL TRACKED JAW by 1.8 -- and the same gain reached brow and
// mouthCurve, which since v3117 can also be face-driven. A CAPTION'S OPINION ABOUT LOUDNESS WAS EDITORIALISING
// A LIVE FACE. The symptom is a head that over-acts exactly while a caption plays, WHICH READS AS THE RIG BEING
// EXPRESSIVE RATHER THAN AS A BUG -- and that is the whole reason it survived a round.
//
// THE RULE: A REAL FACE IS GROUND TRUTH AND IS NEVER SCALED. Gain is an AUTHORING control; it belongs to the
// named moods and to captions, and it stops at the boundary of anything measured.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const { mixRig, SOURCES } = await import(pathToFileURL(path.join(ENG, "ui", "rigMix.js")).href);
const page = fs.readFileSync(path.join(ENG, "thead.html"), "utf8");
const rigSrc = fs.readFileSync(path.join(ENG, "ui", "faceRig.js"), "utf8");
const mood = { brow: 0, mouthCurve: 0, eye: 1, o: false };

// ---- 1. THE BUG ------------------------------------------------------------------------------------------------
{
    const face = { brow: 0.2, mouthCurve: 0.5, eye: 1.1, o: false };
    const shoutingAtALiveFace = mixRig({ faceChannels: face, moodChannels: mood, faceJaw: 0.4, gain: 1.8 });

    ok("!! a shouted caption does NOT scale a live tracked face",
        shoutingAtALiveFace.brow === 0.2 && shoutingAtALiveFace.mouthCurve === 0.5 &&
        shoutingAtALiveFace.jaw === 0.4 && shoutingAtALiveFace.gainApplied === false,
        "gain 1.8 with a face present leaves every channel exactly as measured. Before this, expression(1.8) " +
        "from a caption multiplied the user's real jaw, brow and mouth -- and a head that over-acts while a " +
        "caption plays looks EXPRESSIVE, not broken, which is how it survived a round");

    const authored = mixRig({ captionChannels: { brow: 0.2, mouthCurve: 0, eye: 1.15, o: false, jaw: 0.75 }, moodChannels: mood, talkEnergy: 0.3, gain: 1.8 });
    ok("...while an AUTHORED channel is scaled, because that is what gain is for",
        authored.brow > 0.2 && authored.gainApplied === true,
        "brow " + authored.brow.toFixed(3) + ". The control is not removed, it is SCOPED -- authored sources " +
        "may be dialled up; measured ones may not");
}

// ---- 2. EYE IS A SCALE AROUND ONE, NOT AN OFFSET -------------------------------------------------------------------
{
    const loudNeutral = mixRig({ moodChannels: mood, gain: 1.8 });
    ok("!! gain 1.8 on a NEUTRAL eye leaves it at 1.0",
        Math.abs(loudNeutral.eye - 1) < 1e-9,
        "eye is a scale about 1, so gain has to act on the DEVIATION. Multiplying the value would open a " +
        "neutral eye to 1.8 -- a stare nobody asked for, produced by a line of dialogue merely being loud");

    const wide = mixRig({ captionChannels: { brow: 0, mouthCurve: 0, eye: 1.2, o: false }, moodChannels: mood, gain: 2 });
    ok("...and a genuinely wide eye still widens",
        wide.eye > 1.2,
        "1 + (1.2 - 1) * 2 = " + wide.eye.toFixed(2) + ". Scoping the gain must not disable it");
}

// ---- 3. PRECEDENCE IS STATED, NOT EMERGENT ---------------------------------------------------------------------------
{
    const jawSrc = (s) => mixRig({ moodChannels: mood, ...s }).jawSource;
    ok("!! jaw precedence is face > audio > synthetic",
        jawSrc({ faceJaw: 0.4, audioAmp: 0.9, talkEnergy: 0.2 }) === "face" &&
        jawSrc({ audioAmp: 0.9, talkEnergy: 0.2 }) === "audio" &&
        jawSrc({ talkEnergy: 0.2 }) === "synthetic",
        "REAL amplitude beats the synthetic envelope, because a syllable generator running under actual speech " +
        "is a mouth ignoring the words it is supposed to be saying. Three ternaries in a render loop said this " +
        "before, and only by accident of their order");

    ok("!! a caption jaw is a FLOOR under an authored line, never a ceiling on a measured one",
        mixRig({ captionChannels: { jaw: 0.7, brow: 0, mouthCurve: 0, eye: 1 }, moodChannels: mood, talkEnergy: 0 }).jaw === 0.7 &&
        mixRig({ captionChannels: { jaw: 0.1, brow: 0, mouthCurve: 0, eye: 1 }, moodChannels: mood, faceJaw: 0.6 }).jaw === 0.6,
        "[gasps] must open the mouth in silence AND must not clamp a real one shut");

    ok("...and the source is reported, so a page can say which driver won",
        mixRig({ faceChannels: { brow: 0, mouthCurve: 0, eye: 1 }, moodChannels: mood }).source === "face" &&
        SOURCES.length === 3,
        SOURCES.join(" > ") + ". A precedence nobody can read is a precedence nobody can debug");
}

// ---- 4. IT IS ACTUALLY WIRED -----------------------------------------------------------------------------------------
{
    ok("!! the render loop uses the resolver",
        /_rigMix\.mixRig\(\{/.test(page) && /channelSource === "face" \? state\.channels : null/.test(page),
        "a resolver nothing calls would leave the bug in place and the reasoning in a file");

    ok("!! and faceRig TAGS its channels as measured",
        /head\.channels\(mapBlendShapes\(snap\.blendShapes\), "face"\)/.test(rigSrc),
        "the tag is what the scoping rests on. Untagged, a tracked face is indistinguishable from an authored " +
        "one and the gain reaches it again");

    ok("...and a failed import falls back rather than freezing the head",
        /rigMix unavailable, using legacy gain/.test(page) && /_mix \?/.test(page),
        "a rig that stops moving because a MIXER did not load is a worse failure than a rig whose gain is " +
        "applied too broadly -- the fallback is the old arithmetic, and it says so in the console");
}

console.log();
if (fails) { console.log("rigMix-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("rigMix-selfcheck: all checks pass");
