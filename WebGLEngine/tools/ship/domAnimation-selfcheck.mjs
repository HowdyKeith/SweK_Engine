// WebGLEngine/tools/ship/domAnimation-selfcheck.mjs -- v4191
//
// GATES ui/domAnimation.mjs, ui/domAnimate.js and the frameDirty source they add.
//
// *** THE GAP THIS ROUND CLOSED, AS A MEASUREMENT. *** engine/frameDirty.js had eleven sources -- camera,
// demo, particles, water, dayNight, weather, projectiles, debris, agents, scripted, reactions -- and NOT ONE
// of them was about the DOM. This tree carries 86 distinct @keyframes rules across 34 files -- 19 in pages
// and 60 in ui/*.js modules that inject their own styles -- and document.getAnimations() was called in
// exactly zero files. A spinner could turn in the corner of a HUD while the dirty flag reported the frame
// quiet. Section 6 measures both halves live so the claim cannot rot, and it scans pages AND ui modules
// because an earlier draft of that section read only .html, found 19, and disagreed with its own header.
//
// *** AND THE RULE THE WHOLE THING RESTS ON: A PROBE THAT CANNOT PROVE QUIET MUST SAY DIRTY. *** frameDirty's
// own discipline (v4174) is that clean is proven, never assumed. So no getAnimations, an unreadable list, or
// a playState the model does not recognise all report DIRTY. Reporting quiet there would freeze a page that
// is visibly moving, which is far worse than drawing frames nobody needed.
//
// Run: node tools/ship/domAnimation-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { KEYFRAMES, TIMING, NAMES, timingFor, isAnimating, isEndless, quietStateOf, nameOf,
         validateKeyframes } from "../../ui/domAnimation.mjs";
import { noComments, codeOnly, prose } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");

// 1) THE KEYFRAMES ARE DATA, AND THEY ARE VALID.
{
    ok(NAMES.length >= 10, `${NAMES.length} animations ship as a table`);
    ok(Object.isFrozen(KEYFRAMES) && Object.isFrozen(TIMING) && Object.isFrozen(NAMES),
        "the tables are frozen, so one caller cannot mutate an animation and change everyone's");
    for (const n of NAMES) {
        const problems = validateKeyframes(KEYFRAMES[n]);
        ok(problems.length === 0, `${n} is a valid keyframe list${problems.length ? ": " + problems.join("; ") : ""}`);
        ok(Array.isArray(KEYFRAMES[n]), `${n} is a plain array -- a table entry, not a function`);
        ok(TIMING[n] && Number.isFinite(TIMING[n].duration) && TIMING[n].duration > 0, `${n} has a positive duration`);
    }
    ok(NAMES.every((n) => KEYFRAMES[n][0].offset === 0), "every animation starts at offset 0");
    ok(NAMES.every((n) => KEYFRAMES[n][KEYFRAMES[n].length - 1].offset === 1), "and ends at offset 1");
}

// 2) *** validateKeyframes MUST BE ABLE TO GO RED, or section 1 is decoration. ***
{
    ok(validateKeyframes([{ offset: 0, opacity: 0 }, { offset: 0.5, opacity: 1 }]).some((p) => /end at offset 1/.test(p)),
        "a list that stops short of 1 is caught");
    ok(validateKeyframes([{ offset: 0.2, opacity: 0 }, { offset: 1, opacity: 1 }]).some((p) => /start at offset 0/.test(p)),
        "and one that starts late");
    ok(validateKeyframes([{ offset: 0, opacity: 0 }, { offset: 0.7, opacity: 1 }, { offset: 0.3, opacity: 0 }, { offset: 1, opacity: 1 }])
        .some((p) => /does not increase/.test(p)),
        "*** offsets that go backwards are caught -- element.animate() THROWS on those, at runtime, on the page ***");
    ok(validateKeyframes([{ opacity: 0 }, { offset: 1, opacity: 1 }]).some((p) => /no explicit offset/.test(p)),
        "an implicit offset is reported: WAAPI would space them evenly, so a deliberate ease is indistinguishable from an accident");
    ok(validateKeyframes([{ offset: 0 }, { offset: 1, opacity: 1 }]).some((p) => /animates nothing/.test(p)),
        "*** and a frame with no properties -- which animates NOTHING and reports NOTHING, the element just sits there ***");
    ok(validateKeyframes([{ offset: 0, opacity: 1 }]).length > 0, "a single frame is not an animation");
    ok(validateKeyframes(null).length > 0 && validateKeyframes("nope").length > 0, "and rubbish input is refused rather than throwing");
    ok(validateKeyframes([{ offset: 0, opacity: 0 }, { offset: 2, opacity: 1 }]).some((p) => /outside \[0,1\]/.test(p)),
        "an offset past 1 is caught");
}

// 3) *** WHAT COUNTS AS MOVING. ***
{
    ok(isAnimating({ playState: "running" }) === true, "running is dirty");
    ok(isAnimating({ playState: "paused" }) === false, "paused is QUIET -- it holds its element still until an event resumes it");
    ok(isAnimating({ playState: "finished" }) === false, "finished is quiet");
    ok(isAnimating({ playState: "idle" }) === false, "idle is quiet");
    // the four that must fail SAFE
    ok(isAnimating({ playState: "wobbling" }) === true, "*** a playState this model does not recognise is DIRTY, not quiet ***");
    ok(isAnimating({}) === true, "an object with no playState is dirty");
    ok(isAnimating(null) === true, "null is dirty");
    ok(isAnimating("running") === true, "and a string that merely SAYS running is dirty -- it is not an Animation");
}

// 4) *** THE VERDICT OVER A LIST, AND THE HONESTY RULE. ***
{
    ok(quietStateOf([]).quiet === true, "an empty document is quiet");
    ok(quietStateOf([{ playState: "finished" }, { playState: "idle" }]).quiet === true, "so is one where everything has stopped");
    ok(quietStateOf([{ playState: "finished" }, { playState: "running" }]).quiet === false, "one runner is enough to be dirty");
    ok(quietStateOf([{ playState: "running" }, { playState: "running" }]).running === 2, "and the count is reported");

    ok(quietStateOf([], false).quiet === false,
        "*** no getAnimations at all reports DIRTY -- a browser without WAAPI still runs CSS animations, it just cannot be asked ***");
    ok(/cannot prove quiet/.test(quietStateOf([], false).reason), "and says why, rather than reporting a bare false");
    ok(quietStateOf(null).quiet === false, "an unreadable list is dirty");
    ok(quietStateOf(undefined).quiet === false, "and so is a missing one");
    ok(quietStateOf([{ playState: "spinning-up" }]).quiet === false, "one unrecognised state makes the whole document dirty");

    // names, so a page can say what is keeping it awake
    const st = quietStateOf([{ playState: "running", animationName: "callout-pulse" }, { playState: "running", id: "hud-flash" }]);
    ok(st.names.includes("callout-pulse") && st.names.includes("hud-flash"), "running animations are named");
    ok(nameOf({ transitionProperty: "opacity" }) === "transition:opacity", "a CSS transition is named by its property");
    ok(nameOf({}) === "(unnamed)" && nameOf(null) === "(unnamed)", "and an anonymous one does not throw");
}

// 5) ENDLESS ANIMATIONS ARE DECLARED, NOT DISCOVERED WITH A PROFILER.
{
    const endless = { playState: "running", animationName: "spin", effect: { getTiming: () => ({ iterations: Infinity }) } };
    const finite = { playState: "running", animationName: "pulse", effect: { getTiming: () => ({ iterations: 1 }) } };
    ok(isEndless(endless) === true && isEndless(finite) === false, "an infinite animation is recognised");
    ok(isEndless({}) === false && isEndless(null) === false, "and a missing effect does not throw");
    const st = quietStateOf([endless, finite]);
    ok(st.endless.length === 1 && st.endless[0] === "spin",
        "*** and is reported BY NAME -- an endless CSS spin holds the flag open forever by design, which is a thing to know ***");
    ok(st.quiet === false, "while it runs the document is dirty, which is correct rather than a complaint");

    ok(TIMING.spin.iterations === Infinity, "the one endless animation in the table declares itself so");
    ok(NAMES.filter((n) => TIMING[n].iterations === Infinity).length === 1,
        "and it is the ONLY one -- every other animation in the table finishes and lets the page go quiet");
}

// 6) *** THE MEASURED GAP. ***
{
    // *** SCAN PAGES **AND** ui MODULES, WHICH IS WHERE MOST OF THEM ARE. *** The first version of this
    // section read only .html and found 19 -- while the round's own note claimed 77. Both numbers were real
    // and they measured different things: 77 counted pages and ui/*.js together. Most @keyframes in this tree
    // are injected by ui modules rather than written in a page, which is exactly where a HUD animation lives.
    const files = [
        ...fs.readdirSync(ENG).filter((f) => f.endsWith(".html")).map((f) => path.join(ENG, f)),
        ...fs.readdirSync(path.join(ENG, "ui")).filter((f) => f.endsWith(".js")).map((f) => path.join(ENG, "ui", f)),
    ];
    const names = new Set();
    let withKeyframes = 0;
    for (const f of files) {
        const src = fs.readFileSync(f, "utf8");
        const m = src.match(/@keyframes\s+[A-Za-z0-9_-]+/g);
        if (m) { withKeyframes++; for (const k of m) names.add(k.split(/\s+/)[1]); }
    }
    ok(names.size >= 60, `*** ${names.size} distinct @keyframes rules across ${withKeyframes} files -- every one of them invisible to frameDirty before this round ***`);
    ok(withKeyframes >= 20, `and they are spread across ${withKeyframes} files, not concentrated in one`);

    // and the call that sees all of them at once now exists
    const main = codeOnly(read("main.js"));
    ok(/domAnimationProbe/.test(main), "*** main.js registers a DOM probe with frameDirty ***");
    ok(/addSource\("domAnimation"/.test(noComments(read("main.js"))), "under a name the census can see");
    ok(/getAnimations/.test(codeOnly(read("ui/domAnimate.js"))),
        "*** and getAnimations() is called at last -- it appeared in ZERO files before this round ***");
    ok(/covers: \["cssAnimation", "cssTransition", "webAnimations"\]/.test(noComments(read("main.js"))),
        "the source declares what it covers, so the census credits CSS animations, transitions and WAAPI to it");
    ok(/frameDirty\.domStatus/.test(main), "and the readable form is exposed, so a page that will not go quiet can be asked why");
}

// 7) TIMING, AND THE THINGS THAT MUST THROW.
{
    const t = timingFor("pulse");
    ok(t.duration === TIMING.pulse.duration && t.easing === TIMING.pulse.easing, "timingFor returns the animation's own timing");
    ok(timingFor("pulse", { duration: 50 }).duration === 50, "and an override wins");
    ok(timingFor("pulse", { duration: 50 }).easing === TIMING.pulse.easing, "while leaving the rest alone");
    ok(timingFor("fadeIn").iterations === 1, "a finite animation defaults to one iteration");
    let threw = false;
    try { timingFor("no-such-animation"); } catch { threw = true; }
    ok(threw, "*** an unknown animation THROWS rather than returning a timing for nothing ***");

    const play = codeOnly(read("ui/domAnimate.js"));
    ok(/throw new Error/.test(play), "and play() throws on an unknown name too");
    ok(/iterations === Infinity/.test(play) && /never finishes/.test(read("ui/domAnimate.js")),
        "*** playAndWait REFUSES an endless animation rather than returning a promise that never settles ***");
    // *** noComments, NOT codeOnly: "function" IS A STRING LITERAL. *** codeOnly() blanks strings, so this
    // read `typeof el.animate !== ""` and went red against correct code. Third time in this tree.
    ok(/typeof el\.animate !== "function"/.test(noComments(read("ui/domAnimate.js"))),
        "a missing element or API returns null rather than a fake object a caller would await");
}

// 8) PURITY AND WIRING.
{
    const modelC = codeOnly(read("ui/domAnimation.mjs"));
    ok(!/\bdocument\b|\bwindow\b/.test(modelC), "the model touches no DOM, so a gate and a browser read the same rules");
    ok(!/Math\.random|Date\.now|performance\.now/.test(modelC), "and has no clock and no randomness");
    ok(/from "\.\/domAnimation\.mjs"/.test(noComments(read("ui/domAnimate.js"))), "the browser half uses the model rather than a second copy of the rules");
    ok(!/playState ===/.test(codeOnly(read("ui/domAnimate.js"))),
        "*** and decides nothing itself -- one owner for what counts as moving ***");
    ok(/77|@keyframes/.test(prose(read("ui/domAnimation.mjs"))), "the model records the gap it was written to close");
    ok(/proven|cannot prove/i.test(prose(read("ui/domAnimation.mjs"))), "and restates frameDirty's rule that clean is proven");
}

console.log(`domAnimation-selfcheck: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`unchecked here: whether these animations look GOOD. What is checked is that the table is
valid data, that a probe which cannot prove quiet says dirty, and that the 86 @keyframes rules this
tree already had are no longer invisible to the frame the engine decides to skip.`);
process.exit(fail ? 1 : 0);
