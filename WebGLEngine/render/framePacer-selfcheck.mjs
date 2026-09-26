#!/usr/bin/env node
// WebGLEngine/render/framePacer-selfcheck.mjs -- v4743
//
// WHEN EACH FRAME IS SHOWN. render/framePacer.mjs's four policies -- no generation, as soon as possible, FSR3's midpoint pacing
// and TIMED generation -- driven over simulated render times on a 60 Hz display and graded by what the viewer sees: judder
// (the RMS distance of the shown scene times from a straight line against display time, in ms), how many NEW images a second
// reach the display, and latency. The render rates are the ones a frame generator is asked to lift: 30 frames a second (half
// the refresh, FSR3's design case), 40 and 45 (more than half), 24 and 20 (less), and 30 with each frame 5 ms either side.
"use strict";
import { makeFramePacer, scheduleCPU, pacingMetrics, PACE_POLICIES } from "./framePacer.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const R = 1000 / 60;

console.log("\n1. WHAT IT REFUSES");
{
    const refuse = (f) => { try { f(); return "no throw"; } catch (e) { return String(e.message); } };
    const got = [refuse(() => makeFramePacer({ refresh: 0 })), refuse(() => makeFramePacer({ refresh: R, policy: "vsync" })), refuse(() => makeFramePacer({ refresh: R, smoothing: 0 })),
                 refuse(() => makeFramePacer({ refresh: R, margin: -1 })), refuse(() => { const p = makeFramePacer({ refresh: R }); p.real(1, 0, 10); }),
                 refuse(() => { const p = makeFramePacer({ refresh: R }); p.real(0, 10, 5); }), refuse(() => scheduleCPU({ durations: [16], refresh: R })),
                 refuse(() => pacingMetrics({ shown: [], frames: [] }))];
    ok("a refresh that is not positive, a policy it does not have, smoothing outside (0, 1], a negative margin, frames out of order or ready before they start, one frame, and a window with nothing in it are all refused",
       got.every((m) => m !== "no throw"), got.map((m) => m.slice(0, 40)).join(" | "));
}

// the render-time cases
let sd = 5; const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const CASES = { "30": Array(60).fill(1000 / 30), "40": Array(80).fill(25), "45": Array(90).fill(1000 / 45), "24": Array(48).fill(1000 / 24),
                "20": Array(40).fill(50), "30+-5": Array.from({ length: 60 }, () => 1000 / 30 + (rnd() - 0.5) * 10) };
const M = {};
for (const [cn, d] of Object.entries(CASES)) {
    const total = d.reduce((a, b) => a + b, 0);
    M[cn] = {};
    for (const p of PACE_POLICIES) M[cn][p] = pacingMetrics(scheduleCPU({ durations: d, refresh: R, policy: p }), { from: 400, to: total - 100 });
}
console.log("\n2. THE DESIGN CASE: 30 REAL FRAMES A SECOND ON A 60 Hz DISPLAY");
for (const [cn, m] of Object.entries(M)) say(`${cn.padEnd(5)} fps  ` + PACE_POLICIES.map((p) => `${p} judder ${m[p].judder.toFixed(2)} ms, ${m[p].newPerSecond.toFixed(1)} new/s, latency ${m[p].meanLatency.toFixed(1)} (${m[p].maxLatency.toFixed(1)})`).join(" | "));
{
    const m = M["30"];
    ok(`*** without generation every image is shown twice -- ${m.none.newPerSecond.toFixed(1)} new a second and ${m.none.judder.toFixed(2)} ms of judder, a staircase; with it, ${m.midpoint.newPerSecond.toFixed(1)} and ${m.midpoint.judder.toFixed(2)} ***`,
       m.none.judder > 5 && m.midpoint.judder < 1e-6 && m.midpoint.newPerSecond > 1.9 * m.none.newPerSecond,
       "the half-way frame lands on the refresh between the two real frames it came from, so scene time advances by half a real interval every refresh");
    // the schedule itself: the half-way frame, then the real frame, one a refresh
    const s = scheduleCPU({ durations: CASES["30"].slice(0, 12), refresh: R, policy: "midpoint" }).shown.filter((x) => x.time >= 60 && x.time <= 300);
    const alternates = s.every((x, i) => x.kind === (i % 2 === 0 ? s[0].kind : s[0].kind === "gen" ? "real" : "gen")), halfway = s.filter((x) => x.kind === "gen").every((x) => x.t === 0.5);
    ok(`  ...and the schedule is the one FSR3 describes: ${s.map((x) => x.kind[0]).join("")} -- generated and real alternating, every generated frame at t = 0.5, the generated one ${m.midpoint.meanLatency.toFixed(1)} ms after the real frame it needed`,
       alternates && halfway && s.length >= 12, "a frame between k - 1 and k can be shown only once k is ready; the real k follows it one refresh later");
}

console.log("\n3. WHERE THE DISPLAY IS NOT TWICE THE REAL FRAMES, AND WHAT TIMED GENERATION BUYS");
{
    const off = ["40", "45", "24"];
    ok(`*** at 40, 45 and 24 frames a second the half-way frame JUDDERS (${off.map((c) => M[c].midpoint.judder.toFixed(2)).join(", ")} ms) and a frame generated at the time its refresh shows does not (${off.map((c) => M[c].timed.judder.toFixed(2)).join(", ")}) ***`,
       off.every((c) => M[c].midpoint.judder > 2 && M[c].timed.judder < 0.01),
       "scene time can only move in half real intervals with t = 0.5, and a refresh wants 40 / 60 of one at 40 frames a second; timed generation picks t so every refresh sits on the line");
    ok(`  ...and below half the refresh the half-way frame cannot fill it: ${M["24"].midpoint.newPerSecond.toFixed(1)} new images a second at 24, against ${M["24"].timed.newPerSecond.toFixed(1)} timed`,
       M["24"].midpoint.newPerSecond < 50 && M["24"].timed.newPerSecond > 59, "two images per real frame is 48 a second; a display at 60 repeats the rest");
    const extra = off.concat(["30"]).map((c) => M[c].timed.meanLatency - M[c].midpoint.meanLatency);
    ok(`  ...and what it costs is LATENCY, stated rather than hidden: ${extra.map((v) => "+" + v.toFixed(1)).join(", ")} ms over the half-way frame's at 40, 45, 24 and 30 frames a second`,
       extra.every((v) => v > 0) && off.concat(["30"]).every((c) => M[c].timed.maxLatency <= 2 * Math.max(...CASES[c]) + R / 4 + 1e-6),
       "a frame at any t between k - 1 and k needs k, so the display lags the scene by an interval and a render -- the half-way frame's is half an interval less. Never more than two renders and the margin");
    const j = M["30+-5"];
    ok(`  ...and with each frame 5 ms either side of 33, timed generation holds the line better: ${j.timed.judder.toFixed(2)} ms against ${j.midpoint.judder.toFixed(2)}`,
       j.timed.judder < j.midpoint.judder / 2, "the half-way frame goes up whenever its real frame is ready, and a late frame moves it by a refresh");
}

console.log("\n4. FSR3'S HOLD, ON A DISPLAY THAT REFRESHES AT A FIXED RATE");
{
    const same = Object.keys(M).every((c) => Math.abs(M[c].asap.judder - M[c].midpoint.judder) < 1e-9);
    ok(`*** holding the real frame to half the real interval buys NOTHING a fixed refresh does not already give: judder identical to showing both as soon as possible in all ${Object.keys(M).length} cases ***`,
       same && M["20"].midpoint.meanLatency > M["20"].asap.meanLatency,
       `and at 20 frames a second the hold adds ${(M["20"].midpoint.meanLatency - M["20"].asap.meanLatency).toFixed(1)} ms of latency for it. A real frame is held to the NEAREST refresh to half an interval on, which on a fixed refresh is the next one whenever the interval is under three refreshes -- the hold is for a display that can refresh when it is told to, and this model is not one`);
}

console.log("\n5. THE PACER, ONE REFRESH AT A TIME");
{
    // a late frame: frame 6 takes three times as long. Time never runs backwards on screen, whatever the policy
    // and a render rate that halves at once, 50 frames a second to 17, which grows the timed lag faster than display time
    // advances -- the case where the line itself would step back
    const d = Array(20).fill(1000 / 30); d[6] = 100;
    const slow = Array(20).fill(20).concat(Array(20).fill(60));
    const mono = {};
    for (const p of PACE_POLICIES) { mono[p] = [d, slow].every((dd) => { const s = scheduleCPU({ durations: dd, refresh: R, policy: p }).shown.filter((x) => x.scene != null);
        return s.every((x, i) => i === 0 || x.scene >= s[i - 1].scene); }); }
    ok(`a frame three times late, and a render rate that falls from 50 to 17 a second at once, never send the shown scene BACK in time, under any policy (${Object.entries(mono).map(([p, v]) => `${p} ${v}`).join(", ")})`,
       Object.values(mono).every(Boolean), "a pacer that re-shows an older image after a newer one is a judder no metric above would weigh fairly");
    const s = scheduleCPU({ durations: CASES["40"].slice(0, 30), refresh: R, policy: "timed" }).shown.filter((x) => x.kind === "gen");
    const ts = new Set(s.map((x) => x.t.toFixed(3)));
    ok(`  ...and timed generation really does ask for frames at other times than the half-way one: at 40 frames a second it asks for t in {${[...ts].sort().join(", ")}}`,
       ts.size >= 2 && [...ts].some((v) => v !== "0.500"), "fx/fsr/fsr3Tsl.mjs's generate takes the t, and fx/fsr/fsrFrameGenTsl.mjs a second frame between the same pair");
    const p = makeFramePacer({ refresh: R, policy: "midpoint" });
    ok("  ...and before any real frame every refresh is a hold with nothing to show", p.at(0).kind === "hold" && p.at(0).scene === null);
}

// ---- v4743 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/framePacer.mjs:
//   P1  the half-way frame made at 0.25                   -> 2    P6  the midpoint hold floored, not rounded     -> 1
//   P2  the timed lag without the render time             -> 5    P7  timed allowed to step back in time         -> 0
//   P3  no float tolerance at a refresh                   -> 2    P8  judder about the mean, not the line        -> 3
//   P4  an older pair not superseded by a newer one       -> 2    P9  t within 1e-6 of a real frame not snapped  -> 0 here,
//   P5  "none" shows the OLDEST ready frame               -> 1        3 in fx/fsr/fsr3Pacing-selfcheck.mjs
//                                                                 P10 the midpoint never holds                   -> 1
// *** P7 IS 0, AND NOT FOR WANT OF FIXTURES. *** Two were built to make the line step back -- a frame three times late, and a
// render rate falling from 50 to 17 a second at once -- and neither can: the lag is an interval and a render, both estimates
// that move only when a frame arrives, and by less than the display waited for that frame. The clamp is the pacer's promise
// and is kept. P9 is a float: the lag lands a hair past a real frame's start and the first draft generated the real frame
// again at t = 1e-16; only the device gate, which counts the t it was asked for, can see it.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a display that refreshes when it is told to (variable refresh), where FSR3's hold is what spaces the frames " +
    "and this model has nothing to say; the generation's own cost, taken as free; and a real browser's frame timing, which " +
    "fsr-three.html's paced view runs under and nothing here measures.");
process.exitCode = fails ? 1 : 0;
