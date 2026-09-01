#!/usr/bin/env node
// tools/ship/timeline-selfcheck.mjs -- v4215
//
// Run: node tools/ship/timeline-selfcheck.mjs      (pure, no browser)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES fx/timeline.mjs.
//
// *** MEASURED: THE TREE ANIMATES BUT CANNOT SEQUENCE. *** domAnimation.mjs, springMotion.js and stagger.mjs
// each animate ONE thing from now; nothing could say "at t=2.5 start this, at t=4 cross-fade".
//
// The data model is mrdoob/frame.js's (MIT), read from its own Frame.js. *** THE THING ITS UPDATE LOOP DOES
// NOT HANDLE IS THE THING THIS FILE IS MOSTLY ABOUT: SEEKING IS NOT PLAYING. *** That loop walks clips in
// start order and breaks at `start > time`, which is right while time creeps forward and wrong the instant
// somebody drags a scrubber:
//   - scrub BACKWARDS past a clip's start and it is still marked active with nothing driving it;
//   - jump FORWARD OVER a short clip and start() and end() never fire at all, so a one-shot silently does
//     not happen and nothing says so.
// Neither throws. Neither looks wrong until you scrub. So most of what follows drives NON-MONOTONIC time.
import {
    clip, validateClips, sortClips, progressOf, containsTime, activeAt, durationOf, Timeline,
} from "../../fx/timeline.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const ids = (list) => list.map((c) => c.id).sort().join(",");
console.log("timeline-selfcheck -- clips on layers, and the scrub that breaks a playback-only loop\n");

// A fixture with a deliberate SHORT clip in a gap -- the one a jump can step over.
const CLIPS = [
    clip({ id: "bg",    start: 0,  end: 10, layer: 0, name: "backdrop" }),
    clip({ id: "flash", start: 3,  end: 4,  layer: 2, name: "one-shot flash" }),
    clip({ id: "fade",  start: 6,  end: 8,  layer: 1, name: "cross-fade" }),
];

// ---- 1. THE BASICS THAT EVERYTHING ELSE RESTS ON -----------------------------------------------------------
console.log("1. the arithmetic, before anything interesting");
{
    ok("duration is the last end, derived rather than stored", durationOf(CLIPS) === 10);
    ok("progress runs 0 to 1 across a clip",
        progressOf(CLIPS[1], 3) === 0 && progressOf(CLIPS[1], 3.5) === 0.5 && progressOf(CLIPS[1], 4) === 1);
    ok("!! progress is CLAMPED, so an effect never receives a value outside 0..1 however it is called",
        progressOf(CLIPS[1], -99) === 0 && progressOf(CLIPS[1], 99) === 1);
    ok("!! *** containment is HALF-OPEN, so two abutting clips do not both claim the boundary instant ***",
        containsTime(clip({ id: "a", start: 0, end: 5 }), 5) === false
        && containsTime(clip({ id: "b", start: 5, end: 9 }), 5) === true);
    ok("activeAt returns LAYER order, which is draw order", ids(activeAt(CLIPS, 3.5)) === "bg,flash"
        && activeAt(CLIPS, 3.5)[0].id === "bg");
    ok("sorting is a total order, so equal starts do not shuffle between runs",
        JSON.stringify(sortClips(CLIPS).map((c) => c.id)) === JSON.stringify(sortClips(CLIPS.slice().reverse()).map((c) => c.id)));
}

// ---- 2. THE ZERO-LENGTH CLIP, WHICH IS A DIVISION BY ZERO --------------------------------------------------
console.log("\n2. validation refuses the shapes that would produce NaN rather than an error");
{
    ok("a good set validates clean", validateClips(CLIPS).length === 0);
    ok("!! *** a zero-length clip is refused BY NAME -- progress is (t-start)/(end-start), so it is a division "
       + "by zero whose NaN propagates into whatever the effect does with it ***",
        validateClips([clip({ id: "z", start: 2, end: 2 })]).some((p) => /divide by zero/.test(p)));
    ok("a reversed clip is refused too", validateClips([clip({ id: "r", start: 5, end: 2 })]).length > 0);
    ok("duplicate ids are refused -- the active set is keyed on id, so two clips sharing one would alias",
        validateClips([clip({ id: "x", start: 0, end: 1 }), clip({ id: "x", start: 2, end: 3 })])
            .some((p) => /duplicate/.test(p)));
    ok("a missing id is refused", validateClips([clip({ start: 0, end: 1 })]).some((p) => /no id/.test(p)));
    ok("a non-finite bound is refused", validateClips([clip({ id: "n", start: 0, end: Infinity })]).length > 0);
    ok("!! and even a guarded zero-length clip returns 0 rather than NaN, if one reaches progressOf anyway",
        progressOf(clip({ id: "z", start: 2, end: 2 }), 2) === 0);
    ok("validateClips does not throw on junk", validateClips(null).length > 0 && validateClips([null]).length > 0);
}

// ---- 3. PLAYBACK: the easy case, which any loop gets right --------------------------------------------------
console.log("\n3. playing forward -- edges fire once, on the frame they happen");
{
    const tl = new Timeline(CLIPS);
    let r = tl.evaluate(0);
    ok("at t=0 the backdrop enters", ids(r.entered) === "bg" && r.exited.length === 0);
    ok("!! a first evaluate reports dt 0 rather than treating 'never evaluated' as 'was at zero'", r.dt === 0);

    // creep forward: entered must fire ONCE, not on every frame the clip is active
    let bgEnters = 0;
    for (let t = 0.1; t < 3; t += 0.1) { const e = tl.evaluate(t); if (e.entered.some((c) => c.id === "bg")) bgEnters++; }
    ok("!! *** a clip that stays active reports entered EXACTLY ONCE across 29 frames -- an edge, not a level ***",
        bgEnters === 0, bgEnters + " spurious re-entries");

    r = tl.evaluate(3.5);
    ok("the flash enters when time reaches it", ids(r.entered) === "flash");
    ok("...and both clips are active, in layer order", r.active.map((a) => a.clip.id).join(",") === "bg,flash");
    ok("...with the flash halfway through ITS OWN clip, not through the timeline",
        r.active.find((a) => a.clip.id === "flash").progress === 0.5);

    r = tl.evaluate(4.5);
    ok("!! the flash exits when time leaves it", ids(r.exited) === "flash" && r.entered.length === 0);
    ok("nothing is reported skipped during ordinary playback", r.skipped.length === 0);
}

// ---- 4. *** THE SCRUB: WHERE A PLAYBACK-ONLY LOOP IS WRONG *** ---------------------------------------------
console.log("\n4. *** SEEKING IS NOT PLAYING -- non-monotonic time, which is where frame.js's loop breaks ***");
{
    // 4a. BACKWARDS past a clip's start. The clip must EXIT.
    const tl = new Timeline(CLIPS);
    tl.evaluate(3.5);                                   // flash is active
    ok("precondition: the flash is active at 3.5", tl.activeIds().includes("flash"));
    const back = tl.evaluate(1);                        // scrub BACKWARDS, before it started
    ok("!! *** SCRUBBING BACKWARDS PAST A CLIP'S START EXITS IT -- a forward-only walk breaks at "
       + "`start > time` and may never visit it, leaving it 'running' with nothing driving it ***",
        ids(back.exited) === "flash", "exited: " + ids(back.exited));
    ok("...and dt is negative, so a caller integrating anything knows which way it went", back.dt === -2.5);
    ok("the backdrop, still active at 1, is NOT reported as re-entering", back.entered.length === 0);

    // 4b. FORWARD OVER a clip entirely. It must be reported SKIPPED.
    const tl2 = new Timeline(CLIPS);
    tl2.evaluate(1);
    const jump = tl2.evaluate(9);                       // 1 -> 9 steps clean over flash (3..4) AND fade (6..8)
    ok("!! *** JUMPING FORWARD OVER A CLIP REPORTS IT SKIPPED -- start() and end() would otherwise never "
       + "fire at all, and a one-shot flash silently does not happen ***",
        ids(jump.skipped) === "fade,flash", "skipped: " + ids(jump.skipped));
    ok("...and skipped is NOT smuggled into entered or exited, which would run the effect at the wrong time",
        !jump.entered.some((c) => c.id === "flash") && !jump.exited.some((c) => c.id === "flash"));
    ok("the backdrop, active at both ends of the jump, is neither entered nor exited nor skipped",
        !jump.entered.some((c) => c.id === "bg") && !jump.exited.some((c) => c.id === "bg")
        && !jump.skipped.some((c) => c.id === "bg"));

    // 4c. BACKWARDS over a clip entirely -- the same report, because it is computed on the interval.
    const tl3 = new Timeline(CLIPS);
    tl3.evaluate(9);
    const backJump = tl3.evaluate(1);
    ok("!! *** a BACKWARDS jump over a clip reports it skipped too -- the interval is what matters, not the "
       + "direction, which is the whole reason this is a set difference and not a direction test ***",
        ids(backJump.skipped) === "fade,flash", "skipped: " + ids(backJump.skipped));

    // 4d. A jump that lands INSIDE a clip enters it, and does not also call it skipped.
    const tl4 = new Timeline(CLIPS);
    tl4.evaluate(1);
    const into = tl4.evaluate(7);
    ok("a jump landing inside a clip ENTERS it", ids(into.entered) === "fade");
    ok("!! ...and that clip is not ALSO reported skipped -- entered and skipped are exclusive",
        !into.skipped.some((c) => c.id === "fade"));
    ok("...while the flash, stepped clean over on the way, still is", ids(into.skipped) === "flash");

    // 4e. A jump from BEFORE the timeline to AFTER it skips everything that was never active.
    const tl5 = new Timeline(CLIPS);
    tl5.evaluate(-1);
    const over = tl5.evaluate(99);
    ok("!! jumping the whole timeline reports every clip skipped, so nothing is silently lost",
        ids(over.skipped) === "bg,fade,flash", ids(over.skipped));
}

// ---- 5. THE FIRST EVALUATE, AND RE-RUNNING ----------------------------------------------------------------
console.log("\n5. 'never evaluated' is not 'was at zero'");
{
    const tl = new Timeline(CLIPS);
    ok("time starts null rather than 0", tl.time === null);
    const first = tl.evaluate(5);
    ok("!! a first evaluate at t=5 reports NOTHING skipped -- there was no interval to step over, and "
       + "treating the start as 0 would have falsely reported the flash missed",
        first.skipped.length === 0, ids(first.skipped));
    ok("...and enters what is actually active there", ids(first.entered) === "bg");

    // Re-run from the top WITHOUT reset: the stale active set produces an end() with no start().
    const tl2 = new Timeline(CLIPS);
    tl2.evaluate(3.5);
    tl2.reset();
    ok("reset clears both the clock and the active set", tl2.time === null && tl2.activeIds().length === 0);
    const after = tl2.evaluate(3.5);
    ok("!! *** after reset the same time ENTERS the clips again rather than reporting them already active -- "
       + "without it a re-run emits end() for effects the new run never started, which is the shape of bug "
       + "that leaves something switched on forever ***",
        ids(after.entered) === "bg,flash" && after.exited.length === 0);
}

// ---- 6. EDITING WHILE IT HOLDS STATE ------------------------------------------------------------------------
console.log("\n6. an editor changes the clips under a running timeline");
{
    const tl = new Timeline(CLIPS);
    tl.evaluate(3.5);
    ok("precondition: flash active", tl.activeIds().includes("flash"));
    tl.remove("flash");
    ok("!! removing an active clip drops it from the active set immediately -- otherwise the next evaluate "
       + "reports an exit for a clip that no longer exists", !tl.activeIds().includes("flash"));
    const r = tl.evaluate(3.6);
    ok("...and no phantom exit is emitted for it", !r.exited.some((c) => c.id === "flash"));

    tl.add(clip({ id: "late", start: 3.5, end: 5, layer: 3 }));
    const r2 = tl.evaluate(3.7);
    ok("a clip added over the current time enters on the next evaluate", ids(r2.entered) === "late");
    ok("the clip list stays sorted after an add",
        JSON.stringify(tl.clips.map((c) => c.start)) === JSON.stringify(tl.clips.map((c) => c.start).slice().sort((a, b) => a - b)));
}

// ---- 7. LAYER ORDER IS THE CALLER'S DRAW ORDER --------------------------------------------------------------
console.log("\n7. layers, because the caller draws in the order it is handed");
{
    const stack = [
        clip({ id: "top", start: 0, end: 5, layer: 9 }),
        clip({ id: "mid", start: 0, end: 5, layer: 5 }),
        clip({ id: "bot", start: 0, end: 5, layer: 1 }),
    ];
    const tl = new Timeline(stack);
    const r = tl.evaluate(1);
    ok("!! active comes back in ascending layer order regardless of insertion order",
        r.active.map((a) => a.clip.id).join(",") === "bot,mid,top");
    const shuffled = new Timeline([stack[1], stack[2], stack[0]]);
    ok("...and the same order for a different insertion order -- deterministic, not incidental",
        shuffled.evaluate(1).active.map((a) => a.clip.id).join(",") === "bot,mid,top");
}

console.log("\ntimeline-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
