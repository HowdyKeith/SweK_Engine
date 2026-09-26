#!/usr/bin/env node
// WebGLEngine/render/framePacer-selfcheck.mjs -- v4743
//
// WHEN EACH FRAME IS SHOWN. render/framePacer.mjs's four policies -- no generation, as soon as possible, FSR3's midpoint pacing
// and TIMED generation -- driven over simulated render times on a 60 Hz display and graded by what the viewer sees: judder
// (the RMS distance of the shown scene times from a straight line against display time, in ms), how many NEW images a second
// reach the display, and latency. The render rates are the ones a frame generator is asked to lift: 30 frames a second (half
// the refresh, FSR3's design case), 40 and 45 (more than half), 24 and 20 (less), and 30 with each frame 5 ms either side.
"use strict";
import { makeFramePacer, scheduleCPU, scheduleVrrCPU, pacingMetrics, PACE_POLICIES } from "./framePacer.mjs";

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
    got.push(refuse(() => makeFramePacer({ refresh: R, genCost: -1 })), refuse(() => scheduleVrrCPU({ durations: [16, 16], min: 10, max: 5 })),
             refuse(() => scheduleVrrCPU({ durations: [16, 16], min: 5, max: 10, genCost: -1 })), refuse(() => pacingMetrics({ shown: [], frames: [] }, { images: "fresh" })));
    ok("a refresh that is not positive, a policy it does not have, smoothing outside (0, 1], a negative margin, frames out of order or ready before they start, one frame, and a window with nothing in it are all refused -- and (v4747) a negative generation cost, a variable refresh whose floor is above its ceiling, and a measure of images it does not have",
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

console.log("\n6. v4747 -- WHAT GENERATING COSTS, ON A FIXED REFRESH");
{
    // the generation's own time: a half-way frame available genCost ms after its pair's newer frame
    const run = (cn, p, g) => { const d = CASES[cn], total = d.reduce((a, b) => a + b, 0); return pacingMetrics(scheduleCPU({ durations: d, refresh: R, policy: p, genCost: g }), { from: 400, to: total - 100 }); };
    const m0 = run("30", "midpoint", 0), m2 = run("30", "midpoint", 2), m12 = run("30", "midpoint", 12), m20 = run("30", "midpoint", 20);
    ok(`*** at the design case a generation that takes ANY time still shows every frame: ${m2.newPerSecond.toFixed(1)} new images a second at 2 ms and ${m12.newPerSecond.toFixed(1)} at 12, judder ${m2.judder.toFixed(2)} -- v4743's pacer showed ${"30.3"} and 8.33 ms at 2 ms, every real frame dropped ***`,
       m2.newPerSecond > 59 && m12.newPerSecond > 59 && m2.judder < 1e-6 && m12.judder < 1e-6,
       "the half-way frame missed the refresh its real frame was ready on, and the next pair cleared the queue before the held real frame went up. The queue now shows the newest image that may go up and drops only what is older, a pair's real frame after its own half-way frame");
    ok(`  ...and what it costs is a whole refresh of latency for any time at all -- ${m0.meanLatency.toFixed(1)} ms at none, ${m2.meanLatency.toFixed(1)} at 2 ms, ${m12.meanLatency.toFixed(1)} at 12 -- because the real frames are ready ON a refresh`,
       m2.meanLatency - m0.meanLatency > R - 0.5 && Math.abs(m12.meanLatency - m2.meanLatency) < 0.5, "a frame ready a hair after a refresh waits for the next one, and a real renderer's frames land anywhere");
    ok(`  ...and a generation SLOWER than the time it has falls back to the real frames, not to a frozen screen: at 20 ms, ${m20.newPerSecond.toFixed(1)} new images a second, judder ${m20.judder.toFixed(2)}`,
       m20.newPerSecond > 29 && m20.newPerSecond < 32, "the generator holds the newest pair only (fx/fsr/fsr3Tsl.mjs), so a half-way frame not up before the next real frame never will be; its real frame then goes up alone. Without that the pacer showed nothing new at all");
    const t0 = run("30+-5", "timed", 0), t4 = run("30+-5", "timed", 4), h4 = run("30+-5", "midpoint", 4);
    ok(`  ...and timed generation takes the cost into its lag, and the cost shows: judder ${t0.judder.toFixed(2)} -> ${t4.judder.toFixed(2)} ms at 4 ms, with each frame 5 ms either side of 33 -- still under the half-way frame's ${h4.judder.toFixed(2)}`,
       t4.judder > t0.judder && t4.judder < h4.judder && t4.meanLatency > t0.meanLatency,
       `latency ${t0.meanLatency.toFixed(1)} -> ${t4.meanLatency.toFixed(1)} ms. Between a real frame arriving and its pair's frame being made, the generator holds no pair it can use (section 8), and only a real frame can go up`);
}

console.log("\n7. v4747 -- A DISPLAY THAT REFRESHES WHEN IT IS TOLD TO (48 TO 144 Hz)");
const VMIN = 1000 / 144, VMAX = 1000 / 48;
const V = {};
for (const cn of ["24", "30", "40", "45", "30+-5"]) {
    const d = CASES[cn], total = d.reduce((a, b) => a + b, 0); V[cn] = {};
    for (const [key, p, mg] of [["none", "none", 0], ["asap", "asap", 0], ["midpoint", "midpoint", 0], ["timed", "timed", 0], ["timed5", "timed", 5]])
        V[cn][key] = pacingMetrics(scheduleVrrCPU({ durations: d, min: VMIN, max: VMAX, policy: p, margin: mg }), { from: 400, to: total - 100, images: "new" });
    say(`${cn.padEnd(5)} fps  ` + Object.entries(V[cn]).map(([k, m]) => `${k} judder ${m.judder.toFixed(2)}, ${m.newPerSecond.toFixed(1)} new/s, latency ${m.meanLatency.toFixed(1)}`).join(" | "));
}
{
    const steady = ["24", "30", "40", "45"];
    ok(`*** on a variable refresh FSR3's HOLD is what spaces the frames: the half-way frame and the real one held half an interval after it, judder ${steady.map((c) => V[c].midpoint.judder.toFixed(2)).join(", ")} ms at 24, 30, 40 and 45 frames a second -- shown as soon as they are made, ${steady.map((c) => V[c].asap.judder.toFixed(2)).join(", ")} ***`,
       steady.every((c) => V[c].midpoint.judder < 1e-6 && V[c].asap.judder > 1.5 && V[c].midpoint.newPerSecond > 1.9 * V[c].none.newPerSecond),
       "section 4 found the hold buys nothing on a fixed refresh, where the refresh spaces the frames; here nothing else does, and the two images go up as close together as the display allows");
    const j = V["30+-5"];
    ok(`  ...and with each frame 5 ms either side of 33, frames placed on the line with 5 ms in hand judder least: ${j.timed5.judder.toFixed(2)} ms, against ${j.midpoint.judder.toFixed(2)} for the hold and ${j.none.judder.toFixed(2)} with no generation -- for ${(j.timed5.meanLatency - j.midpoint.meanLatency).toFixed(1)} ms more latency`,
       j.timed5.judder < j.midpoint.judder && j.timed5.judder < j.none.judder && j.midpoint.judder > j.none.judder && j.timed5.judder < j.timed.judder,
       `the hold is timed from when the half-way frame went up, so a late frame moves both images; the line is the scene time plus one latency, and a frame is late for it only by more than the margin. With no margin it is ${j.timed.judder.toFixed(2)}`);
    // above half the display's ceiling: 90 frames a second doubled is 180, and the display takes 144
    const d90 = Array(180).fill(1000 / 90), t90 = d90.reduce((q, v) => q + v, 0), s90 = scheduleVrrCPU({ durations: d90, min: VMIN, max: VMAX, policy: "midpoint" });
    const m90 = pacingMetrics(s90, { from: 400, to: t90 - 100, images: "new" }), late90 = pacingMetrics(s90, { from: t90 - 600, to: t90 - 100, images: "new" });
    ok(`  ...and above half the display's ceiling what cannot go up is DROPPED, not queued: 90 frames a second doubled is 180 and the display takes 144 -- ${m90.newPerSecond.toFixed(1)} new images a second, and the latency at the end of two seconds ${late90.maxLatency.toFixed(1)} ms, as at the start (${m90.maxLatency.toFixed(1)})`,
       m90.newPerSecond <= 145 && m90.newPerSecond > 100 && late90.maxLatency < 3 * 1000 / 90,
       "an image not up before the next pair's half-way frame could be never will be; kept, every present would wait on the one before it and the latency would grow without end");
    ok(`  ...and below the display's floor it repeats the image itself: with no generation at 24 and 30 frames a second, ${V["24"].none.repeats} and ${V["30"].none.repeats} repeats in the window, and none with generation at 30 (${V["30"].midpoint.repeats}), which puts 60 images a second inside 48 to 144`,
       V["24"].none.repeats > 20 && V["30"].none.repeats > 20 && V["30"].midpoint.repeats === 0, "the naive low-frame-rate compensation: the last image again `max` after it -- which is why these are graded on new images");
    ok(`  ...and without generation a variable refresh has no judder to remove at an even rate (${steady.map((c) => V[c].none.judder.toFixed(2)).join(", ")}): it shows each frame when it is ready, at that frame's rate`,
       steady.every((c) => V[c].none.judder < 1e-6), "what generation buys here is the rate, as section 2's is");
}

console.log("\n8. v4747 -- ONLY THE PAIR THE GENERATOR HOLDS");
{
    // how often a schedule asks for an image a lazy generator holding the newest pair cannot make: a frame between an older
    // pair, or a real frame older than the newest two
    const older = (sch) => { let n = 0, j = -1; for (const x of sch.shown) { while (j + 1 < sch.frames.length && sch.frames[j + 1].ready <= x.time + 1e-6) j++;
        if ((x.kind === "gen" && x.k < j) || (x.kind === "real" && x.k < j - 1)) n++; } return n; };
    const cs = ["24", "30", "40", "45", "30+-5"], run = (cn, o) => { const d = CASES[cn], total = d.reduce((a, b) => a + b, 0), sch = scheduleCPU({ durations: d, refresh: R, policy: "timed", ...o });
        return { ...pacingMetrics(sch, { from: 400, to: total - 100 }), older: older(sch) }; };
    const any = cs.map((c) => run(c, { pairs: "any" })), nw = cs.map((c) => run(c, {})), nwm = cs.map((c) => run(c, { margin: R / 4 }));
    say(`timed, frames rendered back to back: ${cs.map((c, i) => `${c}: any ${any[i].older} older, judder ${any[i].judder.toFixed(2)}; newest ${nw[i].older}, ${nw[i].judder.toFixed(2)}; newest with a quarter refresh of margin ${nwm[i].judder.toFixed(2)}`).join(" | ")}`);
    ok(`*** v4743's timed generation asked for frames the generator no longer holds -- ${any.map((m) => m.older).join(", ")} times at 24, 30, 40, 45 and 30 +-5 frames a second -- and now asks for none, at the same judder at an even rate (${nw.slice(0, 4).map((m) => m.judder.toFixed(2)).join(", ")}) ***`,
       any.every((m) => m.older > 0) && nw.every((m) => m.older === 0) && nw.slice(0, 4).every((m) => m.judder < 1e-6) && nw[4].judder < 3,
       "with frames rendered back to back the line is an interval, a render and a margin behind, and a quarter refresh of margin put the refresh after each new frame in the pair before it. fx/fsr/fsr3Pacing-selfcheck.mjs had every frame ready the moment it started, where that cannot happen; fx/fsr/fsr3Late-selfcheck.mjs refused 12 requests on the device");
    ok(`  ...and that is why "newest" has no margin: with a quarter refresh the line judders ${nwm.slice(0, 4).map((m) => m.judder.toFixed(2)).join(", ")} ms at an even rate, every refresh after a new frame held on the older one`,
       nwm.slice(0, 4).every((m) => m.judder > 1), "a margin can only put the line where no pair is held");
    const refuseP = (() => { try { makeFramePacer({ refresh: R, pairs: "all" }); return "no throw"; } catch (e) { return e.message; } })();
    ok("  ...and a pairs it does not have is refused", /pairs must be "newest" or "any"/.test(refuseP), refuseP);
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
// ---- v4747 SABOTAGE LOG ----------------------------------------------------------------------------------------
//   P11 the newest-pair clamp removed                        -> 2, and 1 in fx/fsr/fsr3Late-selfcheck.mjs (the refusals)
//   P12 the quarter-refresh margin kept with the newest pair  -> 2    P17 the timed lag without the generation's cost -> 1
//   P13 an older pair's frame kept when a newer pair arrives  -> 1    P18 VRR: the real frame held a whole interval    -> 1
//   P14 a real frame alone when its half-way frame dropped    -> 1    P19 VRR: nothing dropped when behind             -> 1
//   P15 a real frame eligible before its half-way frame       -> 5    P20 VRR: the display never repeats an image      -> 1
//   P16 the half-way frame due without the generation's cost  -> 2    P21 pacingMetrics grading the repeats too        -> 2
//                                                                     P22 VRR: the timed margin ignored                -> 1
// *** P19, P20 AND P22 SCORED 0 FIRST. *** No case rendered faster than the display takes, no row read the display's own
// repeats, and the margin row passed with no margin at all (2.01 is also under the hold's 3.07); each has a row now. P13 is
// this gate's alone: the device gates generate at no cost, where an older pair's frame is never still waiting.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a real browser's frame timing, which fsr-three.html's paced view runs under and nothing here measures; a " +
    "driver's low-frame-rate compensation, which predicts the next frame where this model repeats at the ceiling; and a variable " +
    "refresh on the device, which a browser does not expose (v4747 models it on the CPU).");
process.exitCode = fails ? 1 : 0;
