// WebGLEngine/ui/rigMix.js -- v3125
//
// WHO OWNS EACH CHANNEL, AND WHOSE OPINION IS ALLOWED TO SCALE IT.
//
// The head grew three drivers in eight rounds and nobody wrote down the precedence. v3117 gave it continuous
// channels; v3121 let a tracked face own the jaw; v3124 let caption markup set a mood, a burst and a VOLUME
// SCALE. Each was reasonable alone. Together they collide on one line:
//
//     jawOpen = (faceJaw != null ? faceJaw : talkEnergy) * 0.5 * exprGain
//
// *** exprGain MULTIPLIES BOTH BRANCHES, AND A CAPTION SETS IT. *** So a shouted line -- expression(1.8) --
// scales THE USER'S REAL TRACKED JAW by 1.8 while the camera is on. And the same gain reaches brow and
// mouthCurve, which since v3117 can also be face-driven. A CAPTION'S OPINION ABOUT LOUDNESS WOULD EDITORIALISE
// A LIVE FACE, and the symptom is a head that over-acts exactly when a caption happens to be playing -- which
// reads as the rig being expressive rather than as a bug.
//
// THE RULE: A REAL FACE IS GROUND TRUTH AND IS NEVER SCALED. Gain is an authoring control. It belongs to
// authored sources -- the named moods and the caption -- and stops at the boundary of anything measured.
//
// AND PRECEDENCE IS STATED RATHER THAN EMERGENT. face > caption > mood, with audio amplitude owning the jaw
// whenever speech is actually playing and no face is present. Written here as data so it can be read in one
// place, instead of being spelled out by the order of three ternaries in a render loop.

export const SOURCES = ["face", "caption", "mood"];

/**
 * @param s {
 *   faceChannels   from ui/faceRig.js, or null when no face is being read
 *   captionChannels from ui/captionExpression.js, or null when the line said nothing about the face
 *   moodChannels   the named-mood entry, always present as the floor
 *   faceJaw        0..1 from a tracked face, or null
 *   audioAmp       0..1 real RMS while a WAV plays, or null
 *   talkEnergy     0..1 synthetic syllable envelope
 *   gain           exprGain -- an AUTHORING control (see above)
 * }
 * @returns { jaw, brow, mouthCurve, eye, o, source, jawSource, gainApplied }
 */
export function mixRig(s = {}) {
    const gain = Number.isFinite(s.gain) ? s.gain : 1;

    // ---- channels -------------------------------------------------------------------------------------------
    const face = s.faceChannels || null;
    const caption = s.captionChannels || null;
    const mood = s.moodChannels || { brow: 0, mouthCurve: 0, eye: 1, o: false };
    const src = face ? "face" : caption ? "caption" : "mood";
    const ch = face || caption || mood;

    // *** THE GAIN STOPS AT MEASURED DATA. *** Authored sources may be dialled up; a face may not.
    const g = src === "face" ? 1 : gain;
    const gainApplied = g !== 1;

    // ---- jaw ------------------------------------------------------------------------------------------------
    // A tracked face wins outright. Otherwise REAL amplitude beats the synthetic envelope, because a syllable
    // generator running under actual speech is a mouth ignoring the words it is supposed to be saying.
    let jaw, jawSource;
    if (Number.isFinite(s.faceJaw) && s.faceJaw !== null) { jaw = s.faceJaw; jawSource = "face"; }
    else if (Number.isFinite(s.audioAmp) && s.audioAmp !== null) { jaw = s.audioAmp; jawSource = "audio"; }
    else { jaw = Number.isFinite(s.talkEnergy) ? s.talkEnergy : 0; jawSource = "synthetic"; }

    // The caption's own jaw is a FLOOR under an authored line, never a ceiling on a measured one: a burst like
    // [gasps] should open the mouth even in silence, and must not clamp a real one shut.
    if (jawSource !== "face" && caption && Number.isFinite(caption.jaw)) jaw = Math.max(jaw, caption.jaw);

    return {
        jaw: jaw * (jawSource === "face" ? 1 : gain),
        brow: (ch.brow || 0) * g,
        mouthCurve: (ch.mouthCurve || 0) * g,
        // EYE IS A SCALE AROUND 1, NOT AN OFFSET, so gain has to act on the DEVIATION. Multiplying the value
        // itself would make gain 1.8 open a neutral eye to 1.8 -- a stare nobody asked for, from a line of
        // dialogue merely being loud.
        eye: 1 + ((ch.eye == null ? 1 : ch.eye) - 1) * g,
        o: !!ch.o,
        source: src, jawSource, gainApplied,
    };
}
