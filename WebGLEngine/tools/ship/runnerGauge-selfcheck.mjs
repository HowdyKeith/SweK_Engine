// WebGLEngine/tools/ship/runnerGauge-selfcheck.mjs -- v4163
//
// Run: node tools/ship/runnerGauge-selfcheck.mjs   (instant -- pure arithmetic)
//
// GATES ui/runnerGauge.mjs and the panel built on it.
//
// RunCatNeo (Apache-2.0, Swift, macOS) runs a cat faster as CPU load rises. Its code cannot come here and its
// artwork is not even in its repository. What ports is the idea, and the idea acquires three problems the
// moment it stops being about CPU -- a number with no domain, a feed that can die, and two different clocks.
// EVERY CHECK BELOW IS ABOUT ONE OF THOSE THREE, because the arithmetic itself is four lines and the failure
// modes are all in what the four lines assume.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pickPath, rateFor, feedState, frameAt, observedRange, ASCII_RUNNER,
         MIN_FPS, MAX_FPS, STALE_AFTER_MS, DEAD_AFTER_MS } from "../../ui/runnerGauge.mjs";
import { codeOnly } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const read = (p) => { try { return fs.readFileSync(path.join(ENG, p), "utf8"); } catch { return ""; } };
console.log("runnerGauge-selfcheck -- a number, read as a running speed\n");

// ---- 1. finding the number ---------------------------------------------------------------------------------
console.log("1. reading the value out of somebody else's JSON");
{
    const j = { ok: true, state: { tick: 4210, entities: [{ hp: 7 }, { hp: 3 }] } };
    ok("!! dotted, bracketed and slashed paths all work",
        pickPath(j, "state.tick") === 4210 && pickPath(j, "state.entities[1].hp") === 3 && pickPath(j, "state/entities/0/hp") === 7,
        "half this tree's endpoints are documented one way and half the other, so accepting one spelling would " +
        "make the panel wrong for half of them");
    // *** A MISSING PATH RETURNS undefined AND DOES NOT THROW, WHICH IS THE WHOLE POINT. *** Endpoints change
    // shape; a readout that crashes the page when one does is worse than the readout being blank.
    ok("!! a missing path is undefined, never a throw",
        pickPath(j, "nope.deep.deeper") === undefined && pickPath(null, "a") === undefined && pickPath(j, "") === undefined);
    ok("...and walking INTO a non-object stops rather than reaching past it", pickPath(j, "state.tick.oops") === undefined);
}

// ---- 2. THE DOMAIN, WHICH CPU LOAD HAS AND AN ARBITRARY NUMBER DOES NOT --------------------------------------
console.log("2. a number needs a domain before 'fast' means anything");
{
    ok("!! the domain maps onto the fps range end to end",
        Math.abs(rateFor(0).fps - MIN_FPS) < 1e-9 && Math.abs(rateFor(100).fps - MAX_FPS) < 1e-9,
        MIN_FPS + ".." + MAX_FPS + " fps across 0..100");
    ok("!! out-of-domain values CLAMP rather than running off the end",
        rateFor(500).fps === MAX_FPS && rateFor(-500).fps === MIN_FPS,
        "a spike must not produce a 900fps animation, and a negative must not run it backwards");
    // *** AN EMPTY DOMAIN IS REFUSED, NOT DIVIDED BY. *** This is what auto-ranging produces on a metric that
    // has not moved yet -- min === max -- and it is the first thing an auto-ranging gauge would hit.
    const empty = rateFor(5, { min: 3, max: 3 });
    ok("!! *** an empty domain is refused with a reason, not divided by ***",
        empty.fps === 0 && /domain is empty/.test(empty.why), empty.why);
    ok("!! a non-numeric value is refused with a reason", rateFor("banana").fps === 0 && /not a finite number/.test(rateFor("banana").why));
    // *** THE ONE THIS FILE ACTUALLY CAUGHT. *** Number(null) === 0 and Number("") === 0, both finite, so the
    // first draft's Number()-then-isFinite guard let an ABSENT field through as a genuine reading of nought.
    // The runner would amble at minimum speed for a field that is not there -- section 3's failure mode
    // arriving through the value instead of the feed.
    ok("!! *** null and \"\" are NO VALUE, not zero -- they both coerce to a finite 0 ***",
        rateFor(null).fps === 0 && /not the same as zero/.test(rateFor(null).why) &&
        rateFor("").fps === 0 && rateFor(undefined).fps === 0 && /not the same as zero/.test(rateFor("").why),
        'an endpoint answering "depth": null is not reporting no queue, it is reporting no answer');
    ok("...while a REAL zero is a real reading and still runs at the floor",
        rateFor(0).fps === MIN_FPS && rateFor("0").fps === MIN_FPS && rateFor(0).why === null,
        "the refusal above must not swallow the value it looks most like");
    ok("...and a boolean is not a measurement", rateFor(true).fps === 0 && /boolean/.test(rateFor(true).why));
    ok("!! the log curve puts the detail at the bottom, where heavy-tailed metrics live",
        rateFor(10, { curve: "log" }).fps > rateFor(10).fps * 2 &&
        Math.abs(rateFor(0, { curve: "log" }).fps - MIN_FPS) < 1e-9 &&
        Math.abs(rateFor(100, { curve: "log" }).fps - MAX_FPS) < 1e-9,
        "log 10/100 -> " + rateFor(10, { curve: "log" }).fps.toFixed(1) + "fps against linear " +
        rateFor(10).fps.toFixed(1) + ", and BOTH ENDS still pin exactly -- a curve that moved the endpoints " +
        "would change what the gauge means, not just where its detail is");
}

// ---- 3. A DEAD FEED MUST NOT LOOK LIKE AN IDLE ONE -----------------------------------------------------------
console.log("3. the difference between quiet and gone");
{
    const now = 1_000_000;
    ok("!! a fresh answer is live and moving", feedState(now - 1000, now).state === "live" && feedState(now - 1000, now).moving === true);
    ok("!! *** stale and dead STOP the figure -- they do not slow it ***",
        feedState(now - (STALE_AFTER_MS + 1), now).moving === false && feedState(now - (DEAD_AFTER_MS + 1), now).moving === false,
        "slowing would render 'the endpoint is gone' and 'nothing is happening' identically, and the " +
        "reassuring one of those two is the wrong answer");
    ok("!! stale and dead are DIFFERENT, because late and gone are different things to do about",
        feedState(now - (STALE_AFTER_MS + 1), now).state === "stale" && feedState(now - (DEAD_AFTER_MS + 1), now).state === "dead");
    // *** NEVER IS NOT DEAD (v3103's shape). *** A panel that just opened has no information, and reporting no
    // information as a failure is the most flattering possible reading of it -- in the wrong direction.
    ok("!! *** a panel that has never had an answer says 'never', not 'dead' ***",
        feedState(null, now).state === "never" && feedState(0, now).state === "never",
        "no information is not bad news; reporting it as bad news is how a readout cries wolf on startup");
    ok("...every state carries a human reason except the healthy one",
        feedState(now - 20000, now).why && feedState(null, now).why && feedState(now - 100, now).why === null);
    ok("...and the thresholds are a sane multiple of a poll interval", STALE_AFTER_MS >= 5000 && DEAD_AFTER_MS > STALE_AFTER_MS * 2);
}

// ---- 4. TWO CLOCKS -------------------------------------------------------------------------------------------
console.log("4. poll rate is not frame rate");
{
    ok("!! frames advance with time at the given rate",
        frameAt(0, 10) === 0 && frameAt(100, 10) === 1 && frameAt(800, 10) === 0,
        "10fps over 8 frames wraps at 800ms");
    // *** fps 0 PINS FRAME 0 rather than freezing mid-stride. *** A figure stopped at frame 5 reads as a
    // rendering bug; one standing at frame 0 reads as stopped.
    ok("!! *** a stopped runner stands at frame 0, not wherever it happened to be ***",
        frameAt(12345, 0) === 0 && frameAt(999999, 0) === 0);
    ok("...and a zero-frame runner cannot divide by anything", frameAt(500, 10, 0) === 0);
    ok("...the built-in runner needs no asset and no licence", ASCII_RUNNER.length >= 4 && ASCII_RUNNER.every((f) => typeof f === "string" && f.length));
}

// ---- 5. THE NOTEBOOK THAT IS NOT A CONTROLLER ----------------------------------------------------------------
console.log("5. observing the range without steering by it");
{
    const r = observedRange();
    ok("...no samples yields no suggestion", r.get().suggestion === null && r.get().n === 0);
    [5, 9, 2, 40].forEach((v) => r.see(v));
    ok("!! it reports what the metric actually did", r.get().min === 2 && r.get().max === 40 && r.get().n === 4);
    const flat = observedRange(); [7, 7, 7].forEach((v) => flat.see(v));
    ok("!! a metric that never moved suggests NOTHING, rather than an empty domain",
        flat.get().suggestion === null && flat.get().min === 7,
        "min === max is exactly the divide-by-zero section 2 refuses, so the notebook must not hand it over");
    const junk = observedRange(); [NaN, "x", undefined, 3].forEach((v) => junk.see(v));
    ok("...non-numbers are not samples", junk.get().n === 1 && junk.get().min === 3);
    // *** ASSERTED IN THE CODE, NOT ONLY IN THE COMMENT: the range never reaches rateFor. ***
    const gaugeCode = codeOnly(read("ui/runnerGauge.mjs"));
    ok("!! *** the observed range is never fed back into the rate ***",
        !/rateFor\([^)]*observed/.test(gaugeCode) && !/autoRange|adaptRange/.test(gaugeCode),
        "an auto-ranging gauge rescales itself the moment anything unusual happens -- which is exactly when " +
        "somebody is looking at it and needs it to mean what it meant an hour ago");
}

// ---- 6. THE PANEL BORROWS RATHER THAN REBUILDS ----------------------------------------------------------------
console.log("6. what the panel is not allowed to contain");
{
    const panel = read("ui/runnerPanel.js"), code = codeOnly(panel);
    ok("!! it polls through ui/poller.js and does not grow a second loop",
        /import \{ pollOnce \} from "\.\/poller\.js"/.test(panel) && !/\bfetch\s*\(/.test(code),
        "poller.js already owns backoff on a failing endpoint, a concurrency cap and a pause when the tab is " +
        "hidden -- a second polling loop here is the defect this tree names most");
    ok("!! every judgement lives in the gated module, not in the DOM file",
        /from "\.\/runnerGauge\.mjs"/.test(panel) &&
        !/Math\.log1p|Math\.max\(0, Math\.min\(1/.test(code),
        "the arithmetic is four lines and all of it is checked above; this file is the clock and the element");
    ok("!! the panel stops the figure on a stopped feed",
        /feed\.moving \? r\.fps : 0/.test(code), "the one line that keeps 'gone' from looking like 'idle'");
    ok("...and it says when the gauge is clipping rather than clipping silently",
        /OUTSIDE the set domain/.test(panel), "a clipped reading looks exactly like a saturated one");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
            "\nunchecked here: how it looks. Nothing on this box renders a DOM, so the frames, the opacity and " +
            "the border colour are asserted as CODE and seen by a person or not at all.");
process.exit(fails ? 1 : 0);
