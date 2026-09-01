// fx/timeline.mjs -- v4215 -- a timeline: clips on layers, evaluated at a time, correct when you SCRUB.
//
// *** MEASURED: THIS TREE ANIMATES BUT CANNOT SEQUENCE. *** ui/domAnimation.mjs (v4191) holds WAAPI keyframes
// as data, ui/springMotion.js (v4114) integrates a spring, fx/stagger.mjs (v4198) offsets a group -- every one
// of them animates ONE thing from now. Nothing in the tree could say "at t=2.5 start the disintegrate, at t=4
// cross-fade, at t=6 the camera arrives". ui/clipEditorDialog.js has a scrub slider, but it drives a single
// skeletal clip through window.rigSystem; it is not a sequencer.
//
// Idea and data model from mrdoob/frame.js (MIT, read at v4215 from its own Frame.js -- an Animation there is
// { name, start, end, layer, effect } and an effect gets update(progress, delta) with progress NORMALISED to
// its own clip). Written fresh here rather than vendored, the way ui/springMotion.js took sileo's idea and
// ui/domAnimation.mjs took animatelo's. Two things from that model are worth keeping verbatim as ideas:
//
//   * AN EFFECT NEVER SEES ABSOLUTE TIME, only its own progress 0..1. So a clip can be moved, stretched or
//     reused without touching the effect, which is the whole reason a timeline is better than a pile of ifs.
//   * start() AND end() ARE EDGES, not levels -- they fire on the frame a clip becomes or stops being active,
//     the same distinction engine/xrInput.mjs makes about a trigger.
//
// *** AND HERE IS THE THING THE FRAME.JS UPDATE LOOP DOES NOT HANDLE, WHICH IS THE REASON THIS FILE IS NOT
// JUST A TABLE OF CLIPS: SEEKING IS NOT PLAYING. *** That loop walks animations in start order and breaks as
// soon as `animation.start > time`, which is correct while time creeps forward one frame at a time. The moment
// somebody drags a scrubber it is wrong in two different ways:
//
//   1. SCRUB BACKWARDS past a clip's start and the clip is still marked active from before, but a
//      forward-only walk may never visit it to call end(). It stays "running" with nothing driving it.
//   2. JUMP FORWARD OVER A SHORT CLIP ENTIRELY -- from t=1 to t=10 across a clip spanning 3..4 -- and the
//      clip never becomes active on any frame, so start() and end() never fire AT ALL. An effect that was
//      supposed to happen simply does not, and nothing reports that it was missed.
//
// Neither throws. Neither looks wrong until you scrub. So evaluate() below is written against ARBITRARY time
// jumps rather than against playback, and it reports `skipped` as a first-class outcome, because a timeline
// that silently drops a clip is worse than one that refuses to move.
//
// Pure: no DOM, no clock, no effects are run here. The caller owns those. That is what makes every rule above
// checkable in node.

/** A clip is inert data. `effect` is whatever the caller wants to key on -- a name, an id, a function. */
export function clip({ id, start, end, layer = 0, effect = null, name = "" }) {
    return Object.freeze({ id, start: Number(start), end: Number(end), layer: Number(layer) || 0, effect, name });
}

/**
 * Problems with a set of clips. Empty means usable.
 * Deliberately NOT thrown: a timeline being edited passes through invalid states constantly, and an editor
 * needs to show what is wrong rather than be unable to hold it.
 */
export function validateClips(clips) {
    const problems = [];
    if (!Array.isArray(clips)) return ["clips must be an array"];
    const seen = new Set();
    clips.forEach((c, i) => {
        if (!c || typeof c !== "object") { problems.push(`clip ${i} is not an object`); return; }
        if (c.id == null || c.id === "") problems.push(`clip ${i} has no id`);
        else if (seen.has(c.id)) problems.push(`duplicate clip id ${JSON.stringify(c.id)}`);
        else seen.add(c.id);
        if (!Number.isFinite(c.start)) problems.push(`clip ${JSON.stringify(c.id)} has a non-finite start`);
        if (!Number.isFinite(c.end)) problems.push(`clip ${JSON.stringify(c.id)} has a non-finite end`);
        // *** A ZERO-LENGTH CLIP IS NOT A HARMLESS EDGE CASE: progress is (t - start)/(end - start), so it is
        // a division by zero, and the NaN that comes out propagates into whatever the effect does with it. ***
        if (Number.isFinite(c.start) && Number.isFinite(c.end) && !(c.end > c.start)) {
            problems.push(`clip ${JSON.stringify(c.id)} has end <= start (${c.start} -> ${c.end}); progress would divide by zero`);
        }
    });
    return problems;
}

/** Sorted by start, then layer -- a total order, so evaluate() is deterministic for equal starts. */
export function sortClips(clips) {
    return clips.slice().sort((a, b) => (a.start - b.start) || (a.layer - b.layer) || String(a.id).localeCompare(String(b.id)));
}

/** Where t sits inside this clip, 0..1. Callers get a clamped value; outside the clip is not this function's job. */
export function progressOf(c, t) {
    const span = c.end - c.start;
    if (!(span > 0)) return 0;                       // guarded, though validateClips refuses these
    return Math.min(1, Math.max(0, (t - c.start) / span));
}

/** Is t inside [start, end)? Half-open, so two clips that abut do not both claim the boundary instant. */
export function containsTime(c, t) { return t >= c.start && t < c.end; }

/** Everything active at t, in LAYER order -- which is draw order for the caller. */
export function activeAt(clips, t) {
    return clips.filter((c) => containsTime(c, t)).sort((a, b) => (a.layer - b.layer) || String(a.id).localeCompare(String(b.id)));
}

/** The end of the last clip. A timeline's length is a fact about its contents, not a separate field to drift. */
export function durationOf(clips) {
    let end = 0;
    for (const c of clips) if (Number.isFinite(c.end) && c.end > end) end = c.end;
    return end;
}

/**
 * A timeline. Holds clips and the set that was active last time it was evaluated.
 *
 * The active set is the ONLY state, and it exists precisely so that entered/exited can be computed as a set
 * difference rather than inferred from the direction time moved. That is what makes an arbitrary jump work:
 * *** A SET DIFFERENCE DOES NOT CARE WHICH WAY TIME WENT. *** Deriving edges from "did we pass start this
 * frame" is what ties a timeline to playback and breaks it under a scrubber.
 */
export class Timeline {
    constructor(clips = []) {
        this.clips = sortClips(clips);
        this._active = new Set();      // clip ids
        this.time = null;              // null until first evaluate -- "never evaluated" is not "at zero"
    }

    add(c) { this.clips = sortClips(this.clips.concat([c])); return this; }
    remove(id) { this.clips = this.clips.filter((c) => c.id !== id); this._active.delete(id); return this; }
    get duration() { return durationOf(this.clips); }
    activeIds() { return Array.from(this._active); }

    /**
     * Move to `t` and report what changed.
     *
     * @returns {
     *   time, dt,
     *   active:  [{ clip, progress }]   in layer order -- what to draw/update this frame
     *   entered: [clip]                 became active on this move (call the effect's start())
     *   exited:  [clip]                 stopped being active (call end())
     *   skipped: [clip]                 *** ENTIRELY STEPPED OVER by this move -- never active on any
     *                                   evaluated frame. NOT a subset of entered or exited. ***
     * }
     *
     * `skipped` is the outcome frame.js's loop has no name for. Jump from 1 to 10 across a clip at 3..4 and
     * that clip's start() and end() never fire, so a flash, a cut or a one-shot trigger silently does not
     * happen. Reporting it lets the caller CHOOSE -- fire both edges instantly, or genuinely skip it -- which
     * is a decision only the caller can make, and one it cannot make if it is never told.
     */
    evaluate(t) {
        const time = Number(t);
        const prev = this.time;
        const dt = prev == null ? 0 : time - prev;

        const nowActive = activeAt(this.clips, time);
        const nowIds = new Set(nowActive.map((c) => c.id));

        const entered = nowActive.filter((c) => !this._active.has(c.id));
        const exited = this.clips.filter((c) => this._active.has(c.id) && !nowIds.has(c.id));

        // A clip is SKIPPED when the interval we just traversed contains it whole and it is active at
        // neither end. Computed on the interval, not on the direction, so a backwards jump reports it too.
        let skipped = [];
        if (prev != null && dt !== 0) {
            const lo = Math.min(prev, time), hi = Math.max(prev, time);
            skipped = this.clips.filter((c) =>
                c.start >= lo && c.end <= hi &&              // wholly inside the jump
                !nowIds.has(c.id) && !this._active.has(c.id) // and active at neither end of it
            );
        }

        this._active = nowIds;
        this.time = time;
        return {
            time, dt,
            active: nowActive.map((c) => ({ clip: c, progress: progressOf(c, time) })),
            entered, exited, skipped,
        };
    }

    /**
     * Reset to "never evaluated".
     *
     * *** WITHOUT THIS, RE-RUNNING A TIMELINE FROM THE START LEAVES THE PREVIOUS RUN'S ACTIVE SET IN PLACE ***
     * and the first evaluate() reports exited-clips for effects the new run never started -- an end() without
     * a start(), which is exactly the shape of bug that leaves something switched on forever.
     */
    reset() { this._active = new Set(); this.time = null; return this; }
}

export default Timeline;
