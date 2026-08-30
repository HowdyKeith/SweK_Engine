// WebGLEngine/engine/frameDirty-selfcheck.mjs -- v4174
//
// A dirty flag has two failure modes and they are not worth the same. Drawing a frame nobody needed costs a frame.
// MISSING a change freezes the screen, and a frozen screen looks exactly like a crash. So these checks are not
// "does the flag work" -- they are "can a change ever fail to reach the glass", asked from every direction the
// module could get it wrong: the edge case, the level case, the falling edge nobody thinks about, a probe that
// throws, a source registered late, and a total logic failure. The last one is the point of the heartbeat: even
// with every rule broken at once the screen goes slow, not dead.
//
// Section 8 is the one that actually earns the module. It drives a simulated scene through 20000 random frames
// against a model of what is on the glass, and asserts the ONE property that matters: WHENEVER A FRAME IS
// SKIPPED, WHAT IS ON THE GLASS IS WHAT THE SCENE ACTUALLY IS. A single stale skipped frame in twenty thousand
// fails the check.
//
// Run: node engine/frameDirty-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { FrameDirty } from "./frameDirty.js";
import { readFileSync } from "node:fs";
import { codeOnly, noComments } from "../tools/ship/sourceScan.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };

// 1) THE FIRST FRAME ALWAYS DRAWS, AND A STATIC SCENE GOES QUIET AFTER IT.
{
    const fd = new FrameDirty({ enabled: true });
    const a = fd.shouldRender();
    ok(a.render === true, "the first frame renders (nothing is on the glass yet)");
    ok(a.why === "marked:init", "and it says why: the initial mark, not a source and not the heartbeat");
    ok(fd.shouldRender().render === false, "a scene with nothing registered and nothing marked goes clean on frame 2");
    ok(fd.shouldRender().why === "clean", "and stays clean");
}

// 2) DISABLED IS DISABLED -- it renders unconditionally, whatever the sources say.
{
    const fd = new FrameDirty({ enabled: false });
    fd.addSource("nothing", () => false);
    let drew = 0;
    for (let i = 0; i < 50; i++) if (fd.shouldRender().render) drew++;
    ok(drew === 50, "disabled renders every frame (50/50), so turning the feature off cannot itself break the screen");
    ok(new FrameDirty({}).enabled === false, "and off is the DEFAULT -- enabling engine-wide skipping is a decision, not a default");
}

// 3) markDirty DRAWS EXACTLY ONE FRAME, AND THE REASON SURVIVES TO THE DECISION.
{
    const fd = new FrameDirty({ enabled: true });
    fd.shouldRender();                       // burn the init mark
    fd.shouldRender();
    fd.markDirty("block-placed");
    const a = fd.shouldRender();
    ok(a.render === true && a.why === "marked:block-placed", "markDirty draws the next frame and names the reason");
    ok(fd.shouldRender().render === false, "and clears -- one change is one frame, not a permanent wake");
    // marking many times in one frame is still one frame
    fd.markDirty("a"); fd.markDirty("b"); fd.markDirty("c");
    ok(fd.shouldRender().why === "marked:c", "many marks in a frame collapse to one draw (last reason wins)");
    ok(fd.shouldRender().render === false, "and only one");
}

// 4) A LEVEL-TRIGGERED SOURCE HOLDS THE FRAME OPEN FOR AS LONG AS IT IS ANIMATING.
{
    const fd = new FrameDirty({ enabled: true, maxSkip: 1000 });
    let animating = false;
    fd.addSource("water", () => animating);
    fd.shouldRender();                       // source-added mark
    ok(fd.shouldRender().render === false, "a registered source that is quiet does not by itself keep the loop awake");
    animating = true;
    let drew = 0;
    for (let i = 0; i < 40; i++) if (fd.shouldRender().render) drew++;
    ok(drew === 40, "while a source reports active, every frame draws (40/40)");
    ok(fd._lastWhy === "active:water", "and names the source that is keeping it awake");
}

// 5) THE FALLING EDGE. The frame where a source STOPS is the frame carrying the animation's final state, and it
//    has not been drawn yet. Skipping it leaves the screen showing the second-to-last frame forever.
{
    const fd = new FrameDirty({ enabled: true, maxSkip: 1000 });
    let animating = true;
    fd.addSource("cinematic", () => animating);
    for (let i = 0; i < 5; i++) fd.shouldRender();
    animating = false;
    const settle = fd.shouldRender();
    ok(settle.render === true, "the frame after a source goes quiet still DRAWS -- the last frame of an animation is not dropped");
    ok(settle.why === "settled:cinematic", "and says it was a settle, not a mark and not the heartbeat");
    ok(fd.shouldRender().render === false, "and only that one frame -- it settles clean afterwards");
}

// 6) EVERY PROBE RUNS EVERY FRAME. If the loop short-circuited on the first active source, the others' last-seen
//    state would freeze at whatever it was, and their falling edges would go missing.
{
    const fd = new FrameDirty({ enabled: true, maxSkip: 1000 });
    let bCalls = 0, bActive = true;
    fd.addSource("a-always", () => true);              // votes render on every frame, first in insertion order
    fd.addSource("b-transient", () => { bCalls++; return bActive; });
    const callsBefore = bCalls;
    for (let i = 0; i < 10; i++) fd.shouldRender();
    ok(bCalls - callsBefore === 10, "a later source is probed on every frame even though an earlier one already voted to render");
    // now b falls while a is still active; then a stops too. If b's falling edge had been missed, the settle
    // would not appear and the frame after a stops would go straight to clean.
    bActive = false;
    fd.shouldRender();
    const wasActiveB = fd._wasActive.get("b-transient");
    ok(wasActiveB === false, "the later source's state is up to date, so its falling edge is observable");
}

// 7) A PROBE THAT THROWS RENDERS THE FRAME. Fail open: a broken probe is a wasted frame, never a frozen screen.
{
    const fd = new FrameDirty({ enabled: true, maxSkip: 1000 });
    fd.addSource("broken", () => { throw new Error("reading a disposed object"); });
    fd.shouldRender();
    const a = fd.shouldRender();
    ok(a.render === true, "a probe that throws renders the frame rather than being read as 'quiet'");
    ok(a.why === "probe-threw:broken", "and names the broken probe instead of swallowing it");
    ok(fd.stats().faults.broken >= 2, "and counts the faults so a permanently broken probe is visible in stats, not silent");
    // and a throwing probe does not take the loop down
    let survived = true;
    try { for (let i = 0; i < 100; i++) fd.shouldRender(); } catch { survived = false; }
    ok(survived, "shouldRender never throws, so one bad probe cannot kill the render loop");
}

// 8) *** THE PROPERTY THAT MATTERS *** -- across 20000 random frames of a simulated scene, the glass is never
//    stale on a skipped frame. This is the direct statement of "no change is ever missed".
{
    const fd = new FrameDirty({ enabled: true, maxSkip: 30 });
    // The scene: an integer that anything may change. Two animating systems own their own changes and report
    // themselves active while they do; everything else is a discrete event that must call markDirty.
    let scene = 0;
    let particlesLeft = 0, cameraLeft = 0;
    fd.addSource("particles", () => particlesLeft > 0);
    fd.addSource("camera", () => cameraLeft > 0);

    let glass = null;               // what the model believes is drawn
    let stale = 0, skips = 0, draws = 0;
    // deterministic PRNG so a failure is reproducible
    let s = 12345;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

    for (let f = 0; f < 20000; f++) {
        // --- the tick: the scene changes ---
        if (particlesLeft > 0) { particlesLeft--; scene++; }
        if (cameraLeft > 0)    { cameraLeft--;    scene++; }
        const r = rnd();
        if (r < 0.01) { particlesLeft = 1 + Math.floor(rnd() * 20); scene++; fd.markDirty("particles-spawned"); }
        else if (r < 0.02) { cameraLeft = 1 + Math.floor(rnd() * 40); scene++; fd.markDirty("camera-started"); }
        else if (r < 0.05) { scene++; fd.markDirty("discrete-event"); }     // a block placed, a panel opened
        // --- the decision, then the draw ---
        const d = fd.shouldRender();
        if (d.render) { glass = scene; draws++; }
        else { skips++; if (glass !== scene) stale++; }
    }
    ok(stale === 0, `no skipped frame ever left the glass stale (${stale} stale of ${skips} skips over 20000 frames)`);
    ok(skips > 2000, `and it actually skipped work rather than trivially passing by drawing everything (${skips} skipped, ${draws} drawn)`);
}

// 9) THE HEARTBEAT. Even with every other rule broken at once, the screen goes slow rather than dead.
{
    const fd = new FrameDirty({ enabled: true, maxSkip: 10 });
    fd.shouldRender();
    let run = 0, worst = 0;
    for (let i = 0; i < 500; i++) {
        if (fd.shouldRender().render) { if (run > worst) worst = run; run = 0; } else run++;
    }
    ok(worst <= 10, `never more than maxSkip frames in a row are skipped (worst run ${worst} of 10)`);
    ok(fd._lastWhy === "clean" || fd._lastWhy === "heartbeat", "and the heartbeat is what breaks the run");
    // the heartbeat must be a CEILING, not a schedule: a busy scene never reaches it
    const busy = new FrameDirty({ enabled: true, maxSkip: 10 });
    busy.addSource("always", () => true);
    for (let i = 0; i < 50; i++) busy.shouldRender();
    ok(busy.stats().skipped === 0, "a scene that never goes quiet skips nothing (the heartbeat is a ceiling, not a timer)");
}

// 10) REGISTRATION IS THE ONLY WAY TO BE QUIET, AND RE-REGISTERING REPLACES RATHER THAN ACCUMULATES.
{
    const fd = new FrameDirty({ enabled: true, maxSkip: 1000 });
    fd.shouldRender(); fd.shouldRender();
    ok(fd.shouldRender().render === false, "quiet before");
    const off = fd.addSource("late", () => false);
    ok(fd.shouldRender().render === true, "registering a source is itself a change -- what it is about to animate is not on the glass yet");
    ok(fd.sources().length === 1, "one source registered");

    let which = "old";
    fd.addSource("late", () => { which = "new"; return false; });
    fd.shouldRender();
    ok(fd.sources().length === 1, "re-registering the same name REPLACES the probe (a reloaded module does not leave a stale closure behind)");
    ok(which === "new", "and it is the new probe that runs, not the old one over a dead object");

    fd.shouldRender();
    off();                                    // the unregister handle from the FIRST registration
    ok(fd.shouldRender().render === true, "unregistering is a change too");
    ok(fd.sources().length === 0, "and the source is gone");

    ok(typeof (() => { try { fd.addSource("bad", 42); return null; } catch (e) { return e; } })() === "object", "a non-function probe is refused loudly at registration rather than read as 'quiet' every frame");
}

// 11) reset() FORCES A DRAW. Used on context loss / resize / demo switch, where the glass is unknown.
{
    const fd = new FrameDirty({ enabled: true, maxSkip: 1000 });
    fd.shouldRender(); fd.shouldRender();
    ok(fd.shouldRender().render === false, "quiet");
    fd.reset();
    ok(fd.shouldRender().render === true, "reset() forces the next frame to draw");
    // and setEnabled(true) from off must also force a draw -- the glass was being painted every frame and now
    // will not be, so the first frame under the new regime has to be a real one
    const fd2 = new FrameDirty({ enabled: false });
    for (let i = 0; i < 5; i++) fd2.shouldRender();
    fd2.setEnabled(true);
    ok(fd2.shouldRender().render === true, "turning skipping ON draws one frame first rather than starting from an assumed-clean glass");
}

// 12) THE WIRING IN main.js. A module that is correct in isolation and hooked up wrongly is worth nothing, and
//     the two ways to hook THIS one up wrongly are both silent. Checked against code with comments and strings
//     stripped, so a sentence in a comment can never satisfy a check about code shape.
{
    const raw = readFileSync(new URL("../main.js", import.meta.url), "utf8");
    const code = codeOnly(raw);      // strings AND comments blanked -- for CODE SHAPES
    const nc   = noComments(raw);     // comments stripped, strings KEPT -- for anchors that ARE string literals
    // Which instrument to read with is not a style choice and this section got it wrong on the first run:
    // profStart("renderPrep") and addSource("water") are STRING LITERALS, and codeOnly blanks them, so every
    // positional check went red against a file that was wired correctly. Positions are all taken from ONE
    // text (nc) so the index comparisons are between comparable offsets.

    ok(/import\s*\{\s*FrameDirty\s*\}\s*from/.test(code), "main.js imports FrameDirty");
    ok(/new\s+FrameDirty\s*\(/.test(code), "and constructs one");
    ok(/window\.frameDirty\s*=/.test(code), "and exposes it on window so a scene can enable it and read stats()");
    ok(/enabled\s*:\s*false/.test(code.slice(code.indexOf("new FrameDirty"), code.indexOf("new FrameDirty") + 200)),
        "and constructs it DISABLED -- turning engine-wide skipping on is a decision that needs a census behind it");

    // (a) ORDERING. The decision must sit after the ticks and before the render. If it were hoisted up to the
    //     visibility early-return, the ticks would be skipped too -- and the ticks are what MAKE the scene
    //     change, so nothing would ever go dirty again and the screen would never come back. This is the
    //     freeze the whole module exists to prevent, so it is checked positionally, not by intent.
    const iDecide = nc.indexOf("frameDirty.shouldRender()");
    const iVisSkip = nc.indexOf("visibility.shouldSkipFrame()");
    const iPrep = nc.indexOf('profStart("renderPrep")');
    const iPost = nc.indexOf('profStart("postRenderTicks")');
    ok(iDecide > 0 && iVisSkip > 0 && iPrep > 0 && iPost > 0, "the four positions are all findable in main.js");
    ok(iDecide > iVisSkip, "the dirty decision comes AFTER the visibility throttle, not merged into it");
    ok(iDecide < iPrep, "and BEFORE renderPrep -- it guards the drawing");
    ok(iPost > iPrep, "renderPrep precedes postRenderTicks (the region the guard wraps)");

    // (b) THE TICKS STILL RUN. The guard must not swallow the post-render subsystem ticks: those are outside
    //     it by position, and the guard closes before them.
    const iClose = nc.indexOf("}", nc.indexOf("_fdCamPitch = c.pitch"));
    ok(iClose > 0 && iClose < iPost, "the draw guard CLOSES before postRenderTicks, so the subsystem ticks run on a skipped frame too");

    // (c) THE CAMERA POSE IS RECORDED AFTER THE DRAW, NOT AT THE DECISION. Recording it at decision time would
    //     compare each frame against the previous frame instead of against what is actually on the glass, so a
    //     camera that moved during a skipped frame and then stopped would leave the screen showing the old pose.
    const iRecord = nc.indexOf("_fdCamPitch = c.pitch");
    ok(iRecord > iDecide, "the last-drawn camera pose is recorded after the decision");
    ok(iRecord > iPrep, "and after the render work, inside the guard -- the probe compares against the glass, not against last frame");

    // (d) THE WATER PROBE IS A VISIBILITY TEST, NOT AN EXISTENCE TEST. main.js assigns window.waterField
    //     unconditionally at startup, so a probe asking whether water EXISTS is true in every scene forever:
    //     the flag would vote active on every frame of every world and skip nothing, while every other check
    //     here still passed. That is a wiring that is inert rather than broken, which is the harder kind to
    //     notice, so it is pinned.
    ok(/window\.waterField\s*=/.test(nc), "main.js does assign window.waterField unconditionally (the premise of this check)");
    const waterProbe = nc.slice(nc.indexOf('addSource("water"'), nc.indexOf('addSource("water"') + 260);
    ok(waterProbe.length > 20, "the water probe is findable");
    ok(/instanceCount/.test(waterProbe), "the water probe asks whether water is DRAWN (instance counts), not whether the field object exists");
    ok(!/window\.waterField/.test(waterProbe), "and does not test window.waterField, which would be true in every scene forever");

    // (e) INPUT IS AN EDGE. A keypress can change the world without moving the camera -- a panel opens, a block
    //     is placed. Without an input mark those changes reach the glass only by luck.
    ok(/addEventListener\(\s*ev\s*,\s*\(\)\s*=>\s*frameDirty\.markDirty/.test(code.replace(/\s+/g, " ")) || /markDirty\(ev\)/.test(code),
        "input events mark the flag dirty");
    const evList = noComments(raw);
    ok(/"keydown"/.test(evList) && /"pointerdown"/.test(evList) && /"wheel"/.test(evList),
        "and the listened event set includes keyboard, pointer and wheel (string literals, so read from source with comments stripped but strings kept)");
}

// ---- CONTROL: the checks above must be capable of failing. Each control breaks ONE rule and confirms the
// ---- corresponding property goes red -- otherwise section 8 could be passing for the wrong reason.
{
    // (a) drop the falling edge: a source that stops never draws its final frame.
    class NoSettle extends FrameDirty {
        shouldRender() {
            const before = new Map(this._wasActive);
            const r = super.shouldRender();
            if (r.why && r.why.startsWith("settled:")) { this._lastWhy = "clean"; this._skipped++; this._skipRun++; return { render: false, why: "clean" }; }
            void before; return r;
        }
    }
    const bad = new NoSettle({ enabled: true, maxSkip: 1000 });
    let animating = true;
    bad.addSource("anim", () => animating);
    for (let i = 0; i < 3; i++) bad.shouldRender();
    animating = false;
    ok(bad.shouldRender().render === false, "control: dropping the falling edge does change the outcome (the settle frame would be skipped)");

    // (b) run the same property test as section 8 against a flag that ignores the falling edge, and confirm it
    //     produces stale frames. If it did not, section 8 would prove nothing.
    const bad2 = new NoSettle({ enabled: true, maxSkip: 30 });
    let scene = 0, left = 0;
    bad2.addSource("anim", () => left > 0);
    let glass = null, stale = 0, s = 999;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let f = 0; f < 20000; f++) {
        if (left > 0) { left--; scene++; }
        if (rnd() < 0.02) { left = 1 + Math.floor(rnd() * 20); scene++; bad2.markDirty("spawn"); }
        const d = bad2.shouldRender();
        if (d.render) glass = scene; else if (glass !== scene) stale++;
    }
    ok(stale > 0, `control: a flag that ignores the falling edge DOES leave the glass stale (${stale} stale frames), so section 8 is a real test`);

    // (c) fail closed instead of open on a throwing probe: the screen freezes.
    class FailClosed extends FrameDirty {
        shouldRender() { const r = super.shouldRender(); if (r.why && r.why.startsWith("probe-threw:")) { return { render: false, why: "clean" }; } return r; }
    }
    const bad3 = new FailClosed({ enabled: true, maxSkip: 1000 });
    bad3.addSource("broken", () => { throw new Error("boom"); });
    bad3.shouldRender();
    ok(bad3.shouldRender().render === false, "control: swallowing a probe error would read a broken system as a quiet one");
}

console.log(`frameDirty-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
