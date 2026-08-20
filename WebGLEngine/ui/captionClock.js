// WebGLEngine/ui/captionClock.js -- v3127
//
// THE TWO CLOCKS.
//
// v3124 schedules caption expression on WALL-CLOCK setTimeout with durations ESTIMATED at ~0.28s per word.
// thead.html drives the jaw from REAL RMS amplitude whenever a WAV is playing. Those are two clocks, and v3125
// settled WHO OWNS WHAT without touching WHEN. If the audio runs longer than the estimate the expression
// finishes mid-sentence and the face goes blank while the voice continues; if shorter, it keeps emoting after
// the speech has stopped. Nothing crashes. It just drifts, and drift looks like bad acting rather than a bug.
//
// THE FIX IS THE AUDIO-VISUAL DECOUPLING Keith's EmotiveTalk reference describes: THE ANALYSER OWNS THE JAW,
// THE CAPTION OWNS BROW, MOOD AND GESTURE, AND BOTH ARE ANCHORED TO THE SAME PROGRESS. So the timeline is built
// in FRACTIONS OF THE WHOLE rather than seconds -- a fraction can be driven by an audio clock or by a stopwatch
// without the segments themselves knowing which.
//
// *** AND A GUESSED CLOCK MUST NOT LOOK LIKE A MEASURED ONE. *** When a clip is playing, progress is
// currentTime/duration and is a FACT. With no audio it is elapsed/estimate and is a GUESS, and the estimate is
// 0.28s per word, which is a number somebody made up. Both drive the same face. If a page cannot tell them
// apart, then "the expression timing is off" and "we never knew the timing" are one complaint -- and this
// project has spent twenty rounds establishing that those must never share a channel.
//
// WHAT IT DOES NOT DO: it does not resample or stretch. A segment boundary lands where the fraction says and
// nowhere else. Smoothing across a boundary would hide exactly the drift this exists to expose.

export const SECONDS_PER_WORD = 0.28;      // the made-up number, named so it can be argued with
// v3128 -- FOUR TIERS NOW. "aligned" is a word boundary reported by the speech engine as it speaks: not a
// fraction of anything, an actual position in the actual utterance. Best available, and free -- the browser
// has been firing these events all along and nothing listened.
export const CLOCKS = ["aligned", "measured", "estimated", "unknown"];

/** Weight a segment by its word count, with a floor so a bare [gasps] still occupies time. */
function weightOf(seg) {
    const words = seg && seg.text ? seg.text.trim().split(/\s+/).filter(Boolean).length : 0;
    // A TRAILING ELLIPSIS LENGTHENS THE SEGMENT rather than adding a gap: the pause belongs to the line that
    // trails off, and a gap between segments would be time nothing owns.
    return Math.max(1, words) * (seg && seg.trailing ? 1.4 : 1);
}

/**
 * *** THE STRING THE ENGINE SPEAKS IS NOT THE STRING THE USER TYPED. ***
 *
 * SpeechSynthesis reports a charIndex, and it indexes THE TEXT IT WAS GIVEN -- which is the caption with every
 * [tag] stripped out. "[joyful] We DID it! [sighs] I suppose so" is 40 characters of markup and 23 of speech.
 * MEASURED: charIndex 3 is "DID" in what is spoken and "yful" in what was typed, and the drift is the length of
 * every tag consumed so far -- 17 characters on that one line, growing with each tag.
 *
 * So this is the ONLY string a charIndex may be resolved against, and the timeline carries offsets into it.
 * Building the utterance from the markup and the offsets from the segments would look right on a tagless line
 * and slide further wrong with every tag added, which is the worst possible failure curve: correct in the
 * simplest test and increasingly wrong in real use.
 */
export function spokenTextOf(segments) {
    return (Array.isArray(segments) ? segments : []).map((s) => (s && s.text) || "").filter(Boolean).join(" ");
}

/**
 * Build a timeline of FRACTIONS. No seconds anywhere -- that is the point.
 * @returns { bounds, weights, estimatedSeconds } where bounds[i] is the START fraction of segment i
 */
export function planTimeline(segments) {
    const segs = Array.isArray(segments) ? segments : [];
    const weights = segs.map(weightOf);
    const total = weights.reduce((a, b) => a + b, 0);
    const bounds = [];
    let acc = 0;
    for (const w of weights) { bounds.push(total > 0 ? acc / total : 0); acc += w; }
    // v3128 -- CHARACTER offsets into the SPOKEN string, alongside the fractions. Same segments, two indexes,
    // because a word boundary arrives as a character position and a stopwatch arrives as a fraction.
    const charStart = [];
    let ch = 0;
    for (const seg of segs) {
        charStart.push(ch);
        const t = (seg && seg.text) || "";
        ch += t.length + (t ? 1 : 0);            // +1 for the join space, matching spokenTextOf exactly
    }
    return { bounds, weights, charStart, spokenLength: Math.max(0, ch - 1), estimatedSeconds: total * SECONDS_PER_WORD, count: segs.length };
}

/**
 * Which segment is live at this progress?
 * @returns index, or -1 for an empty timeline
 */
export function sampleAt(timeline, progress) {
    if (!timeline || !timeline.bounds.length) return -1;
    // PROGRESS PAST THE END HOLDS THE LAST SEGMENT, it does not wrap. Audio that runs long, or a fence that
    // overshoots, should leave the face on the final expression rather than snapping back to the first --
    // which would read as the character starting the sentence again.
    const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    let i = 0;
    for (let k = 0; k < timeline.bounds.length; k++) if (p >= timeline.bounds[k]) i = k;
    return i;
}

/**
 * Which segment holds this character of the SPOKEN string?
 * @returns index, or -1 for an empty timeline
 */
export function sampleAtChar(timeline, charIndex) {
    if (!timeline || !timeline.charStart || !timeline.charStart.length) return -1;
    const c = Number.isFinite(charIndex) ? Math.max(0, charIndex) : 0;
    let i = 0;
    for (let k = 0; k < timeline.charStart.length; k++) if (c >= timeline.charStart[k]) i = k;
    return i;
}

/**
 * *** WHICH CLOCK IS DRIVING, AND IS IT A FACT OR A GUESS? ***
 *
 * @param audio    { currentTime, duration } from a playing clip, or null
 * @param elapsed  seconds since the line started, for the fallback
 * @param estimate seconds the timeline THINKS it needs
 */
export function readClock(audio, elapsed, estimate, boundary) {
    // v3128 -- AN ACTUAL WORD BOUNDARY BEATS EVERY OTHER CLOCK, because it is not a clock at all: it is the
    // engine saying which word it is on. Nothing is divided, so nothing can be divided by zero.
    if (boundary && Number.isFinite(boundary.charIndex) && Number.isFinite(boundary.spokenLength) && boundary.spokenLength > 0) {
        return {
            clock: "aligned", charIndex: boundary.charIndex,
            progress: Math.max(0, Math.min(1, boundary.charIndex / boundary.spokenLength)),
            why: null,
        };
    }
    const dur = audio ? Number(audio.duration) : NaN;
    // A duration of 0, NaN or Infinity is what a clip reports BEFORE ITS METADATA LOADS. Dividing by it gives
    // NaN or Infinity and the timeline collapses to segment 0 or the last one -- either of which looks like a
    // deliberate expression. So an unusable duration is UNKNOWN, not zero.
    if (audio && Number.isFinite(dur) && dur > 0) {
        return { clock: "measured", progress: Math.max(0, Math.min(1, Number(audio.currentTime) / dur)), why: null };
    }
    if (audio) {
        return { clock: "unknown", progress: 0, why: "clip is playing but its duration is not known yet" };
    }
    const est = Number(estimate);
    if (!Number.isFinite(est) || est <= 0) {
        return { clock: "unknown", progress: 0, why: "no audio and no usable estimate" };
    }
    return {
        clock: "estimated",
        progress: Math.max(0, Math.min(1, Number(elapsed) / est)),
        why: "no audio -- timing guessed at " + SECONDS_PER_WORD + "s/word",
    };
}

/** One line a person reads. NAMES the clock, because "off" and "never known" are different complaints. */
export function clockLine(r) {
    if (r.clock === "aligned") return "timing: ALIGNED to spoken word boundaries (char " + r.charIndex + ")";
    if (r.clock === "measured") return "timing: measured from audio (" + Math.round(r.progress * 100) + "%)";
    if (r.clock === "estimated") return "timing: ESTIMATED, not measured -- " + r.why;
    return "timing: UNKNOWN -- " + r.why;
}
