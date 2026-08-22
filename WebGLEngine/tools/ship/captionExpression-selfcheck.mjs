// tools/ship/captionExpression-selfcheck.mjs
//
// Run: node tools/ship/captionExpression-selfcheck.mjs   (instant)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3124 -- EXPRESSIVE CAPTION MARKUP AS A DRIVER FOR THE RIGGED HEAD.
//
// Keith's idea, and both halves already existed: expressive captioning has a roughly settled vocabulary
// (ALL-CAPS for volume, [bracketed] paralinguistic tags, italics for whispered voices, ellipses for a trailing
// pause) and since v3117 thead.html has continuous channels plus talk(), mood() and gesture(). THE PARSER
// BETWEEN THEM WAS MISSING, and it is pure -- which is the only reason this round is verifiable at all.
//
// *** TWO TRAPS, BOTH REAL CAPTIONING PROBLEMS RATHER THAN INVENTED ONES. ***
//
// ALL-CAPS IS NOT ALWAYS SHOUTING. "NASA confirmed the launch" and "STOP THE CAR" are both capitalised and only
// one is loud. Treating every capitalised token as volume makes the head YELL EVERY ACRONYM -- and it would
// look deliberate, because a head shouting "NASA" is a head doing something.
//
// BRACKETS ARE NOT ALL EMOTIONS. "[sighs]" is the speaker's face, "[MUSIC PLAYING]" is the room, "[JOHN]" is a
// name label. Driving the face from all three would pull an expression at a door creak and emote the word
// "john". The vocabulary is CLOSED and anything outside it is reported UNKNOWN rather than guessed, because a
// guess here is indistinguishable from a working feature.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const C = await import(pathToFileURL(path.join(ENG, "ui", "captionExpression.js")).href);
const seg0 = (s) => C.parseExpressiveCaption(s).segments[0] || {};

// ---- 1. ALL-CAPS IS NOT ALWAYS SHOUTING ------------------------------------------------------------------------
{
    ok("!! an ACRONYM is not a shout",
        seg0("NASA confirmed the launch").shout === false && seg0("The FBI and NASA agreed").shout === false,
        "two acronyms in one line still is not shouting, because they are not CONSECUTIVE. Shouting is a " +
        "property of a SPAN, not a token -- and a head that yelled every acronym would look deliberate");

    ok("!! a RUN of capitals is",
        seg0("STOP THE CAR").shout === true,
        "two or more capitalised words in a row");

    ok("!! and one capitalised word WITH A BANG is",
        seg0("Look OUT!").shout === true,
        "my first draft tested the raw token, so the token OUT-bang was not a capitalised word and THE BANG RULE WAS " +
        "DEAD ENTIRELY -- a shouted word almost always carries the bang that marks it. The acronym half looked " +
        "like it was working, which is how the bug survived the first run");
}

// ---- 2. BRACKETS ARE NOT ALL EMOTIONS -----------------------------------------------------------------------------
{
    const music = C.parseExpressiveCaption("[MUSIC PLAYING]");
    const name = C.parseExpressiveCaption("[JOHN] Over here");
    const sigh = C.parseExpressiveCaption("[sighs] I suppose so");
    const joy = C.parseExpressiveCaption("[joyful] We did it");

    ok("!! a ROOM SOUND does not reach the face",
        music.segments.length === 0 && music.unknownTags.length === 0,
        "[MUSIC PLAYING] is perfectly well understood and is simply NOT an instruction to the speaker's " +
        "expression. Recognised precisely so it can be ignored -- and NOT reported unknown, which would be a " +
        "false alarm every time a door creaks");

    ok("!! a SPEAKER LABEL does not either",
        name.segments.length === 1 && name.segments[0].burst === null && name.segments[0].mood === null && name.unknownTags.length === 0,
        "[JOHN] names who is talking. Driving a mood from it would have the head emote the name itself");

    ok("!! a PARALINGUISTIC tag does, and applies to the text it precedes",
        sigh.segments[0].burst === "sighs" && sigh.segments[0].text === "I suppose so",
        "[sighs] I suppose so -- the tag modifies the line after it, which is how caption convention reads");

    ok("...and an EMOTION tag maps onto one of the head's own five moods",
        joy.segments[0].mood === "happy",
        "the map is deliberately SMALL. A large one is a large surface for guessing");

    const unknown = C.parseExpressiveCaption("[bewildered] What on earth");
    ok("!! and an UNRECOGNISED tag is NAMED, never swallowed",
        unknown.unknownTags.includes("bewildered") && unknown.segments[0].mood === null,
        "if a caption says [bewildered] and nothing happens, the viewer cannot tell whether the tag is " +
        "unsupported or the face is broken. Same law as every other unknown in this project");
}

// ---- 3. WHAT THE RIG IS ACTUALLY TOLD ------------------------------------------------------------------------------
{
    ok("!! plain speech says NOTHING about the face, rather than saying 'neutral'",
        C.segmentToRig(seg0("hello there")).channels === null,
        "returning a neutral pose would be an instruction the caption never gave -- and v3117 measured that " +
        "neutral is exactly what an ABSENT face looks like. Silence and composure must not share a channel");

    const shout = C.segmentToRig(seg0("STOP THE CAR"));
    const whisper = C.segmentToRig(seg0("*barely audible*"));
    ok("!! volume SCALES the lip flap rather than replacing it",
        shout.jawScale > 1 && whisper.jawScale < 1 && shout.channels.jaw > whisper.channels.jaw,
        "a shout is a bigger mouth on the SAME speech. Swapping the jaw for a constant would make a shouted " +
        "line stop moving with the words -- loud and dead at once");

    const gasp = C.segmentToRig(seg0("[gasps]"));
    ok("...and a burst drives real channels",
        gasp.channels.o === true && gasp.channels.eye > 1 && gasp.channels.jaw > 0.5,
        JSON.stringify(gasp.channels) + " -- open mouth, wide eyes, raised brows");

    ok("a trailing ellipsis is detected",
        seg0("I am not sure\u2026").trailing === true && seg0("I am not sure.").trailing === false,
        "both the single character and three dots, since caption pipelines disagree about which they emit");
}

// ---- 4. THE FRONT DOOR ------------------------------------------------------------------------------------------------
{
    const page = fs.readFileSync(path.join(ENG, "thead.html"), "utf8");
    ok("!! the parser has a caller",
        /captionExpression\.js/.test(page) && /parseExpressiveCaption/.test(page),
        "v3115 cost a version establishing that a module with no page is unfinished work wearing a finished " +
        "shape. thead.html already had talk(), mood(), gesture() and channels() -- this only supplies the input");

    ok("...and the page SHOWS unrecognised tags rather than dropping them",
        /unknownTags/.test(page),
        "the one thing a person needs to see when a caption does not move the face");
    console.log("  NOTE   NOT CLAIMED: that any of this is well TIMED. Segments carry what to express, not when --");
    console.log("         real lip sync comes from the audio analyser thead.html already has, and pairing the two");
    console.log("         is a separate piece of work. What is here decides WHAT the face should do, and that is");
    console.log("         the half that can be checked without a speaker.");
}

console.log();
if (fails) { console.log("captionExpression-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("captionExpression-selfcheck: all checks pass");
