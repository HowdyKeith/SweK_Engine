// WebGLEngine/ui/captionExpression.js -- v3124
//
// EXPRESSIVE CAPTION MARKUP AS A DRIVER FOR THE RIGGED HEAD.
//
// Keith's idea, and the pieces were already on both sides. Expressive captioning has a real, roughly settled
// vocabulary -- ALL-CAPS for volume, [bracketed] paralinguistic tags, italics for whispered or off-screen
// voices, ellipses for a trailing pause -- and since v3117 thead.html has continuous channels plus talk(),
// mood() and gesture(). WHAT WAS MISSING WAS THE PARSER BETWEEN THEM.
//
// THE PARSER IS PURE, WHICH IS THE ONLY REASON THIS ROUND IS VERIFIABLE. Text in, a timeline out. No browser,
// no audio, no rig. Everything that decides anything is checked headlessly; the head is a consumer.
//
// *** TWO TRAPS, AND BOTH ARE REAL CAPTIONING PROBLEMS RATHER THAN THINGS I INVENTED. ***
//
// (1) ALL-CAPS IS NOT ALWAYS SHOUTING. "NASA confirmed the launch" and "STOP THE CAR" are both capitalised and
//     only one is loud. Treating every capitalised token as volume makes the head YELL EVERY ACRONYM -- and it
//     would look deliberate, because a head shouting "NASA" is a head doing something. SHOUTING IS A PROPERTY
//     OF A SPAN, NOT A TOKEN: a run of two or more capitalised words, or one with a bang after it.
//
// (2) BRACKETS ARE NOT ALL EMOTIONS. "[sighs]" is the speaker's face; "[MUSIC PLAYING]" is the room; "[JOHN]"
//     is a name label. Driving the face from all three would make the head emote the word "john" and pull an
//     expression at a door creak. So the vocabulary is CLOSED and anything outside it is reported as UNKNOWN
//     rather than guessed -- because a guess here is indistinguishable from a working feature.
//
// AND AN UNKNOWN TAG IS NAMED, NOT SWALLOWED. If a caption says [bewildered] and nothing happens, the viewer
// cannot tell whether the tag is unsupported or the face is broken. Same law as every unknown in this project.

/** Vocal bursts -- things the SPEAKER'S FACE does. These drive the rig. */
export const PARALINGUISTIC = {
    sigh: { gesture: null, mouthCurve: -0.3, brow: -0.1, jaw: 0.25 },
    sighs: { gesture: null, mouthCurve: -0.3, brow: -0.1, jaw: 0.25 },
    gasp: { gesture: null, mouthCurve: 0, brow: 0.35, eye: 1.3, jaw: 0.7, o: true },
    gasps: { gesture: null, mouthCurve: 0, brow: 0.35, eye: 1.3, jaw: 0.7, o: true },
    laughs: { gesture: "dance", mouthCurve: 1, brow: 0.15, jaw: 0.6 },
    chuckles: { gesture: null, mouthCurve: 0.7, brow: 0.1, jaw: 0.3 },
    grunt: { gesture: null, mouthCurve: -0.5, brow: -0.3, jaw: 0.35 },
    sobs: { gesture: null, mouthCurve: -0.9, brow: -0.25, eye: 0.8, jaw: 0.3 },
    coughs: { gesture: null, mouthCurve: -0.2, brow: -0.15, jaw: 0.55 },
    whispers: { gesture: null, mouthCurve: 0, brow: 0.05, jaw: 0.12 },
};

/** Mood words that map onto the head's own five. Kept SMALL on purpose -- see the closed-vocabulary note. */
export const EMOTION = {
    joy: "happy", joyful: "happy", happy: "happy", cheerful: "happy",
    sad: "sad", sadness: "sad", sorrowful: "sad",
    angry: "angry", anger: "angry", furious: "angry",
    surprised: "surprised", surprise: "surprised", shocked: "surprised",
    neutral: "neutral", calm: "neutral",
};

/** Bracketed things that are about the ROOM or the SPEAKER LIST, never the face. Recognised so they can be IGNORED. */
export const NON_FACIAL = /^(music|musique|applause|laughter|silence|static|footsteps|door|phone|engine|wind|rain|thunder|beep|alarm|crowd|traffic)\b/i;

// PUNCTUATION IS STRIPPED FIRST. The first draft tested the raw token, so "OUT!" was not a capitalised word --
// which defeated the bang rule ENTIRELY, since a shouted word almost always carries the bang that marks it.
// "Look OUT!" came back as ordinary speech, and the acronym rule looked like it was working.
const isCapsWord = (w) => {
    const bare = String(w).replace(/^[^A-Za-z]+|[^A-Za-z'’-]+$/g, "");
    return /^[A-Z][A-Z'’-]*$/.test(bare) && /[A-Z]{2,}/.test(bare);
};

/**
 * Parse one caption line into segments the rig can act on.
 *
 * @returns { segments, unknownTags } -- segments carry { text, shout, whisper, trailing, tags, mood, burst }
 */
export function parseExpressiveCaption(line) {
    const unknownTags = [];
    const segments = [];
    const src = String(line == null ? "" : line);

    // Split on bracketed groups, keeping them. A tag applies to the segment it PRECEDES, which is how caption
    // conventions read: [sighs] I suppose so.
    const parts = src.split(/(\[[^\]]*\])/g).filter((p) => p !== "");
    let pendingMood = null, pendingBurst = null;

    for (const part of parts) {
        const m = /^\[([^\]]*)\]$/.exec(part);
        if (m) {
            const raw = m[1].trim();
            const key = raw.toLowerCase();
            if (PARALINGUISTIC[key]) { pendingBurst = key; continue; }
            if (EMOTION[key]) { pendingMood = EMOTION[key]; continue; }
            // A NAME LABEL or a ROOM SOUND. Recognised precisely so it does NOT reach the face -- and NOT
            // reported as unknown, because "[MUSIC PLAYING]" is perfectly well understood; it simply is not
            // an instruction to the speaker's expression.
            if (NON_FACIAL.test(raw) || /^[A-Z][A-Za-z'’ .-]*:?$/.test(raw)) continue;
            unknownTags.push(raw);                 // NAMED, never swallowed
            continue;
        }

        const text = part;
        if (!text.trim()) continue;
        const words = text.trim().split(/\s+/);
        const capsWords = words.filter(isCapsWord);
        // SHOUTING IS A PROPERTY OF A SPAN. Two or more capitalised words in a row, or one with a bang.
        let runs = 0, best = 0;
        for (const w of words) { if (isCapsWord(w)) { runs++; best = Math.max(best, runs); } else runs = 0; }
        const shout = best >= 2 || (capsWords.length > 0 && /[A-Z]{2,}[^a-z]*!/.test(text));

        segments.push({
            text: text.trim(),
            shout,
            // Italics markers survive plain text as asterisks or underscores in most caption pipelines.
            whisper: /^[*_].*[*_]$/.test(text.trim()) || pendingBurst === "whispers",
            trailing: /(\u2026|\.\.\.)\s*$/.test(text.trim()),
            mood: pendingMood,
            burst: pendingBurst,
            capsWords,
        });
        pendingMood = null; pendingBurst = null;
    }

    // A line that is ONLY tags still has to produce something, or a caption of "[gasps]" would drive nothing.
    if (segments.length === 0 && (pendingBurst || pendingMood)) {
        segments.push({ text: "", shout: false, whisper: false, trailing: false, mood: pendingMood, burst: pendingBurst, capsWords: [] });
    }
    return { segments, unknownTags };
}

/**
 * Turn one segment into the head's channel shape (v3117's vocabulary) plus optional mood and gesture.
 * Returns null channels when the segment says nothing about the face -- NOT a neutral pose, which would be
 * an instruction the caption never gave.
 */
export function segmentToRig(seg) {
    const burst = seg.burst ? PARALINGUISTIC[seg.burst] : null;
    if (!burst && !seg.shout && !seg.whisper && !seg.mood) {
        return { channels: null, mood: null, gesture: null, jawScale: 1 };
    }
    const ch = {
        brow: burst ? (burst.brow || 0) : (seg.shout ? 0.2 : seg.whisper ? 0.05 : 0),
        mouthCurve: burst ? (burst.mouthCurve || 0) : 0,
        eye: burst && burst.eye != null ? burst.eye : (seg.shout ? 1.15 : seg.whisper ? 0.9 : 1),
        o: burst ? !!burst.o : false,
        jaw: burst && burst.jaw != null ? burst.jaw : (seg.shout ? 0.75 : seg.whisper ? 0.12 : 0.35),
    };
    return {
        channels: ch,
        mood: seg.mood,
        gesture: burst && burst.gesture ? burst.gesture : null,
        // VOLUME SCALES THE LIP FLAP, it does not replace it -- a shout is a bigger mouth on the same speech,
        // and swapping the jaw for a constant would make a shouted line stop moving with the words.
        jawScale: seg.shout ? 1.8 : seg.whisper ? 0.35 : 1,
    };
}
