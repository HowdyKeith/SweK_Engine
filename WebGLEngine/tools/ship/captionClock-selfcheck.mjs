// tools/ship/captionClock-selfcheck.mjs
//
// Run: node tools/ship/captionClock-selfcheck.mjs   (instant)
// v3127 -- THE TWO CLOCKS.
//
// v3124 schedules caption expression on WALL-CLOCK timers with durations ESTIMATED at ~0.28s/word. thead.html
// drives the jaw from REAL RMS amplitude whenever a WAV plays. v3125 settled WHO OWNS WHAT and never touched
// WHEN. Audio longer than the estimate leaves the face blank while the voice continues; shorter, and it emotes
// after the speech stops. NOTHING CRASHES -- IT DRIFTS, AND DRIFT LOOKS LIKE BAD ACTING RATHER THAN A BUG.
//
// The timeline is therefore built in FRACTIONS OF THE WHOLE rather than seconds, so the same segments can be
// driven by an audio clock or by a stopwatch without knowing which.
//
// *** AND A GUESSED CLOCK MUST NOT LOOK LIKE A MEASURED ONE. *** currentTime/duration is a FACT.
// elapsed/estimate is a GUESS built on a number somebody made up. Both drive the same face, and if a page
// cannot tell them apart then "the timing is off" and "we never knew the timing" become one complaint.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const C = await import(pathToFileURL(path.join(ENG, "ui", "captionClock.js")).href);
const page = fs.readFileSync(path.join(ENG, "thead.html"), "utf8");

// ---- 1. FRACTIONS, NOT SECONDS ----------------------------------------------------------------------------------
{
    const tl = C.planTimeline([{ text: "Hello there" }, { text: "I am not sure", trailing: true }, { text: "" }]);
    ok("!! the timeline is built in FRACTIONS of the whole",
        tl.bounds[0] === 0 && tl.bounds.every((b) => b >= 0 && b <= 1) && tl.bounds[2] > tl.bounds[1],
        tl.bounds.map((b) => b.toFixed(3)).join(", ") + ". Seconds would bind the schedule to one clock; a " +
        "fraction can be driven by audio OR by a stopwatch without the segments knowing which");

    ok("...and a trailing ellipsis LENGTHENS its segment rather than adding a gap",
        C.planTimeline([{ text: "a b c", trailing: true }]).weights[0] >
        C.planTimeline([{ text: "a b c" }]).weights[0],
        "the pause belongs to the line that trails off. A gap between segments would be time nothing owns");

    ok("...and a wordless burst still occupies time",
        C.planTimeline([{ text: "" }]).weights[0] >= 1,
        "a bare [gasps] has no words and still has to last long enough to be seen");
}

// ---- 2. THE EDGES THAT COLLAPSE A TIMELINE -------------------------------------------------------------------------
{
    ok("!! progress past the end HOLDS the last segment, it does not wrap",
        C.sampleAt(C.planTimeline([{ text: "a" }, { text: "b" }, { text: "c" }]), 2.0) === 2,
        "audio that runs long should leave the face on the final expression. Wrapping would read as the " +
        "character starting the sentence again");

    const tl = C.planTimeline([{ text: "a" }, { text: "b" }]);
    ok("...and NaN progress does not throw or select nonsense",
        C.sampleAt(tl, NaN) === 0 && C.sampleAt(tl, -5) === 0,
        "clamped to the start rather than propagating into an index");

    ok("...an empty timeline reports -1 rather than segment 0",
        C.sampleAt(C.planTimeline([]), 0.5) === -1,
        "there is no segment zero to be on, and returning 0 would drive the face from a line that does not exist");
}

// ---- 3. THE DISTINCTION THIS FILE EXISTS FOR -----------------------------------------------------------------------
{
    const measured = C.readClock({ currentTime: 3, duration: 10 }, 0, null);
    const noMeta = C.readClock({ currentTime: 0, duration: NaN }, 0, null);
    const zeroDur = C.readClock({ currentTime: 0, duration: 0 }, 0, null);
    const guessed = C.readClock(null, 2, 5);
    const nothing = C.readClock(null, 2, 0);

    ok("!! a playing clip gives a MEASURED clock",
        measured.clock === "measured" && Math.abs(measured.progress - 0.3) < 1e-9);

    ok("!! and no audio gives an ESTIMATED one, SAID OUT LOUD",
        guessed.clock === "estimated" && /guessed at/.test(guessed.why) && /0\.28/.test(C.clockLine(guessed)),
        "\"" + C.clockLine(guessed) + "\". The estimate is a number somebody made up, and the line says so");

    ok("!! an unloaded duration is UNKNOWN, not zero",
        noMeta.clock === "unknown" && zeroDur.clock === "unknown" && noMeta.progress === 0,
        "duration is 0 or NaN before metadata loads. Dividing by it gives NaN or Infinity and the timeline " +
        "collapses onto segment 0 or the last one -- EITHER OF WHICH LOOKS LIKE A DELIBERATE EXPRESSION");

    ok("...and no audio with no estimate is UNKNOWN too",
        nothing.clock === "unknown");

    // v3128 -- THIS PINNED CLOCKS.length === 3 AND CORRECTLY WENT RED when the "aligned" tier was added. A
    // gate breaking on a deliberate vocabulary change is the gate working; pinning the COUNT rather than the
    // DISTINCTION was the mistake. The property is that no two clocks say the same thing.
    ok("!! every clock produces a DIFFERENT sentence",
        new Set(C.CLOCKS.map((c) => C.clockLine({ clock: c, progress: 0.5, charIndex: 3, why: "x" }))).size === C.CLOCKS.length,
        C.CLOCKS.join(" > ") + ". 'the timing is off' and 'we never knew the timing' are different complaints " +
        "with different fixes, and that stays true however many tiers there are");
}

// ---- 4. WIRED, AND WHAT IS NOT CLAIMED -------------------------------------------------------------------------------
{
    ok("!! thead.html drives the caption schedule from the clock",
        /captionClock\.js/.test(page) && /planTimeline\(/.test(page) && /readClock\(/.test(page),
        "v3124's setTimeout chain ran on wall-clock estimates with no knowledge of whether audio was playing");

    ok("!! and the page SHOWS which clock is driving",
        /clockLine\(/.test(page),
        "a measured clock and a guessed one drive the same face; only the page can tell a person which it was");
    console.log("  NOTE   NOT CLAIMED: word-level sync. This anchors SEGMENT boundaries to audio progress, which");
    console.log("         fixes drift across a line. Real per-word timing needs forced alignment -- WhisperX gives");
    console.log("         word-level timestamps and is what VideoLingo uses for exactly this. That is a bigger");
    console.log("         piece and it would REPLACE planTimeline's weights, not sit on top of them.");
}

// ---- 5. v3128: WORD BOUNDARIES, AND THE STRING THEY INDEX ---------------------------------------------------------
// SpeechSynthesis fires onboundary as it speaks, reporting the character it has reached. That is not a clock at
// all -- it is the engine saying which word it is on -- and the browser has been firing them all along with
// nothing listening. No pre-render, no compositing, no alignment pass: those belong to tools whose OUTPUT IS A
// VIDEO FILE. This head is a live scene, so only the timing data was ever needed.
{
    const E = await import(pathToFileURL(path.join(ENG, "ui", "captionExpression.js")).href);
    const line = "[joyful] We DID it! [sighs] I suppose so";
    const { segments } = E.parseExpressiveCaption(line);
    const tl = C.planTimeline(segments);
    const spoken = C.spokenTextOf(segments);

    // *** THE TRAP. ***
    ok("!! charIndex indexes the SPOKEN string, which is not the typed one",
        spoken.length === tl.spokenLength && spoken.length < line.length && line.length - spoken.length === 17,
        "markup " + line.length + " chars, speech " + spoken.length + ". charIndex 3 is " +
        JSON.stringify(spoken.slice(3, 7)) + " in what is spoken and " + JSON.stringify(line.slice(3, 7)) +
        " in what was typed. THE DRIFT IS THE LENGTH OF EVERY TAG CONSUMED SO FAR and it would look PERFECT on " +
        "a tagless line -- correct in the simplest test and increasingly wrong in real use");

    ok("!! segment offsets land exactly on segment starts",
        tl.charStart[0] === 0 && spoken.slice(tl.charStart[1]).startsWith(segments[1].text),
        "charStart " + tl.charStart.join(", ") + " -- and the +1 join space matches spokenTextOf exactly, or " +
        "every segment after the first would be off by one per preceding segment");

    ok("...and a character resolves to the segment holding it",
        C.sampleAtChar(tl, 0) === 0 && C.sampleAtChar(tl, 10) === 0 && C.sampleAtChar(tl, 11) === 1,
        "char 10 is still the first segment, char 11 is the second");

    ok("!! an ALIGNED clock outranks every other",
        C.readClock({ currentTime: 1, duration: 10 }, 99, 99, { charIndex: 11, spokenLength: tl.spokenLength }).clock === "aligned",
        "a word boundary beats a measured clock because NOTHING IS DIVIDED -- it is a position, not a ratio, so " +
        "it cannot be divided by an unloaded duration");

    ok("...and a voice that never fires one falls through cleanly",
        C.readClock(null, 2, 5, null).clock === "estimated" &&
        C.readClock(null, 2, 5, { charIndex: 3, spokenLength: 0 }).clock === "estimated",
        "onboundary support is UNEVEN ACROSS VOICES, which is the whole reason the tiers exist. A zero " +
        "spokenLength is refused rather than divided by");

    ok("!! and the four tiers give four different sentences",
        new Set(["aligned", "measured", "estimated", "unknown"].map((c) =>
            C.clockLine({ clock: c, progress: 0.5, charIndex: 3, why: "x" }))).size === 4 && C.CLOCKS.length === 4,
        C.CLOCKS.join(" > ") + ". Each is a different answer to 'how do you know when to change expression'");

    const page2 = fs.readFileSync(path.join(ENG, "thead.html"), "utf8");
    ok("!! the page speaks spokenTextOf(segments), NOT the raw caption",
        /new SpeechSynthesisUtterance\(spoken\)/.test(page2) && /const spoken = spokenTextOf\(segments\)/.test(page2),
        "handing the engine the markup would have it PRONOUNCE the tags and return indexes into a string the " +
        "timeline knows nothing about -- two bugs from one line");

    ok("...and resolves an aligned clock BY CHARACTER, not by fraction",
        /c\.clock === "aligned" \? sampleAtChar\(timeline, c\.charIndex\)/.test(page2),
        "converting a character to a fraction and back would round, and a long word could round into the " +
        "wrong segment -- throwing away the precision that made the boundary worth having");
}

console.log();
if (fails) { console.log("captionClock-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("captionClock-selfcheck: all checks pass");
