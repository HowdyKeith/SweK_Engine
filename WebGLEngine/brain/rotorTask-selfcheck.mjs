// WebGLEngine/brain/rotorTask-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/rotorTask-selfcheck.mjs      (~40 s: it flies the eight sets, 360 flights)
//
// THE SIBLING GATE OF brain/rotorTask.mjs: the job every helicopter pilot -- the hand pilot, the fruit fly's network, the GPU network -- is given and graded on. A score is only worth training on if it means what it says, so each row is a thing the score is SUPPOSED
// to do, asked of it with a pilot whose answer is known (brain/flightTask-selfcheck.mjs is the aeroplane's, and the discipline is the same):
//
//   1  SCENARIOS   a kind and a seed always make the same one (bit for bit), different seeds and kinds make different ones, each of the four kinds stays inside the ranges the header promises over 60 seeds, an unknown kind is refused by name, the terrain's own spec is level where the
//                  machine starts, a scenario is frozen
//   2  THE WIND    a pure function of time, null for still air, within mean +- amp
//   3  THE SCORE   a pilot already on its targets scores 0; a flight that ends early is charged the worst tick (9) for every tick it did not fly, to the last digit; the three error terms are the three the header says, each capped at its own 3, the heading error wrapped; an `agl` target
//                  is measured over the GROUND THE MODEL IS STEPPED OVER; the engine flight's cost is the header's formula on every one of the training engine flights, and a flight that never touches down costs 7
//   4  THE TERRAIN IS THE MODEL'S AND THE PILOT'S  the same ground is handed to the pilot (its fourth argument) and to stepRotor: a flight over a plateau holds the plateau's height, and a pilot that does not look cannot hold it
//   5  THE SETS    disjoint (kind, seed) pairs across the eight sets (TRAIN, HELD_OUT, two AUDITs, the reserve, three SAFETY sets), the sizes and the per-kind sizes the header says, evaluate() is arithmetic over fly()
//   6  THE BASELINE, FROZEN   the hand pilot's score on each of the eight sets and each kind, the not-standing counts, the tails by name, and the fingerprint of a flight of each kind -- a change to the model, the pilot, the terrain or the task moves them, and this is where it is said
//   7  DETERMINISM a second evaluation is bit-identical; fly() does not mutate its scenario; versus() and describeEval() say what they say
//
// SABOTAGE LOG (each applied to the module in a scratch copy, the gate run, the copy discarded; the number is how many rows went red):
//   Each applied to brain/rotorTask.mjs in a scratch copy, the gate run on the copy, the copy discarded; the number is how many rows went red. 87 mutants (T01-T64 re-run against the second rule's module, T65-T87 written
//   for it), none left at 0. FIVE THINGS WERE FOUND ALONG THE WAY, THREE OF THEM BY THE GATE ITSELF: (1) THE FIRST DRAFT OF THE SETS OVERLAPPED -- the engine seeds of TRAIN (1-12) and HELD_OUT (11-22) shared two,
//   HELD_OUT and AUDIT (21-40) shared two -- and the disjointness row found it before any search had seen a seed; the ranges now run 1-12, 13-24, 25-44 and 45-64, and the mutants T48-T50 and T61-T64 put each kind of
//   overlap back. (2) T09 (the heading cap removed) went 0 red because a wrapped heading error reaches pi only at the far end: the row that holds the heading away by pi - 0.01 exists because of it. (3) T53 (versus()
//   swapping better and worse) went 0 red because the first row had one better and one worse, which a swap leaves unchanged: the row now has two better and one worse. T64's first draft named a pattern that was not in
//   the file and ran no mutant at all (PATTERN COUNT 0); it was corrected and run. (4) T82 (a spent set renamed in SPENT_V1_SETS) CRASHED the gate with an uncaught TypeError and the harness counted it 0 red: the row
//   that holds the five spent sets read `.length` of a set that was no longer there; it now reads the sizes through `x && x.length` and goes red by name (1 red). (5) The patterns of T19, T20, T48-T50 and T61-T64 were
//   rewritten for the second rule's text (the landing cost lives in landingCost(), the audits moved to new seeds) and every one was re-run and is red.
//   T01 tick step 1/30 15; T02 seconds 20 13; T03 scoring every second tick 9; T04 worst tick 6 3; T05 position divisor 60 10; T06 height divisor 60 10; T07 position cap 30 10; T08 height cap removed 1; T09 heading cap
//   removed 1; T10 heading not wrapped 1; T11 missing heading is an error 14; T12 agl ignores the skids' drop 9; T13 agl ignores the ground 9; T14 height error signed 11; T15 pilot blind in hover and recovery 12; T16
//   model flat in hover and recovery 1; T17 pilot blind in engine flights 1; T18 model flat in engine flights 1; T19 landing cost 0.5 11; T20 landing limit 5 10; T21 crash base 2 11; T22 crash slope 5 9; T23 crash sink
//   scale 25 9; T24 no touchdown costs 6 1; T25 settle 4 s 2; T26 ceiling 30 s 1; T27 a crash does not end an engine flight 14; T28 a crash does not end a hover 3; T29 unflown ticks charged one short 11; T30 unflown
//   ticks not charged 3; T31 no floor on the scored count 1; T32 fingerprint every 21 ticks 1; T33 engine fingerprint every 31 1; T34 wind mean ignored 11; T35 wind gust sign 9; T36 wind has no second sine 9; T37
//   recovery has a wind 10; T38 hover has no wind 2; T39 kind not mixed into the seed 12; T40 terrain has no clearing 10; T41 terrain seed not per scenario 10; T42 terrain start 20 m up 10; T43 terrain asks for 20 m 10;
//   T44 terrain relief 80 m 10; T45 scenario not frozen 2; T46 unknown kind accepted 1; T47 engine heading 12; T48 TRAIN and HELD_OUT engine overlap 4; T49 HELD_OUT and AUDIT engine overlap 3; T50 AUDIT2 hover runs into
//   AUDIT 3; T61 SAFETY_POOL engine one short 2; T62 SAFETY_AUDIT hover runs into the pool 2; T63 AUDIT2 engine is AUDIT's 3; T64 BASELINE terrain is TRAIN's 2; T51 evaluate crashed swapped 9; T52 evaluate score not a
//   mean 9; T53 versus swaps better and worse 1; T54 versus eps 0 1; T55 describeEval precision 1; T56 byKind wrong group 10; T57 hover pitch disturbance doubled 9; T58 recovery bank 100 degrees 10; T59 hover distance
//   200 10; T60 engine target is not its height 1; T65 ground-speed term dropped 12; T66 ground-speed scale 20 m/s 11; T67 ground-speed cap removed 2; T68 ground-speed cap 10 2; T69 ground-speed weight 0.8 13; T70
//   ground speed includes the vertical 10; T71 ground speed read as zero 11; T72 ground speed is the forward component only 10; T73 a crash is charged the ground speed too 9; T74 fly() charges sink only 11; T75 AUDIT
//   engine is the spent 25..44 3; T76 AUDIT2 engine is the spent 45..64 3; T77 BASELINE hover is the spent 501 2; T78 SAFETY_AUDIT engine is the spent 2001 3; T79 SAFETY_AUDIT2 terrain is the spent 3001 2; T80 spent
//   AUDIT one engine seed short 1; T81 spent AUDIT2 terrain one short 1; T82 spent SAFETY_AUDIT2 dropped 1; T83 ground-speed term is not monotone 13; T84 spent sets overlap a live set (SPENT BASELINE terrain is TRAIN's)
//   1; T85 TRAIN recovery seeds 61..66 run into AUDIT2's 51..58 2; T86 TRAIN recovery has only the first six 2; T87 TRAIN recovery extra seeds are HELD_OUT's 2.
"use strict";
import * as RT from "./rotorTask.mjs";
import * as AR from "./autopilotRotor.mjs";
import * as H from "../physics/mechanics/rotorcraftModel6dof.mjs";
import * as TR from "../physics/mechanics/terrain.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const f = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : String(v));
const attempt = (fn, fallback = null) => { try { return fn(); } catch (e) { return fallback; } };
const hand = (s, t, w, c) => AR.pilot(s, t, w, c);
const model = AR.defaultModel(), TRIM = AR.trimOf(model);
const hoverStart = (extra = {}) => ({ pos: [0, 0, 120], pitch: TRIM.pitchAttitude, bank: TRIM.bank, heading: 0, ...extra });
const custom = (o) => Object.freeze({ seed: 0, kind: "hover", wind: null, terrain: null, ...o });
const SCORING = Math.floor(Math.round(RT.SECONDS / RT.DT) / RT.TICKS_PER_SCORE);

console.log("rotorTask-selfcheck -- the job every helicopter pilot is graded on\n");

console.log("1. SCENARIOS");
{
    const a = RT.scenario(7, "hover"), b = RT.scenario(7, "hover");
    ok("!! a kind and a seed always make the same scenario, bit for bit (start, target, wind and terrain), for every kind", RT.KINDS.every((k) => JSON.stringify(RT.scenario(7, k)) === JSON.stringify(RT.scenario(7, k))) && JSON.stringify(a) === JSON.stringify(b));
    ok("!! a different seed makes a different one, and so does a different kind at the same seed", RT.KINDS.every((k) => JSON.stringify(RT.scenario(8, k)) !== JSON.stringify(RT.scenario(7, k))) && new Set(RT.KINDS.map((k) => JSON.stringify(RT.scenario(7, k)))).size === RT.KINDS.length);
    ok("!! the kinds are hover, recovery, engine, terrain; the model steps at 1/60 s; a flight is 30 s of it, scored every third tick (20 Hz), and the worst tick is 3 + 3 + 3 = 9", JSON.stringify(RT.KINDS) === '["hover","recovery","engine","terrain"]' && RT.DT === H.DT && near(RT.DT, 1 / 60) && RT.SECONDS === 30 && RT.TICKS_PER_SCORE === 3 && RT.WORST_TICK === 9);
    const d0 = (kind, s) => { const c = RT.scenario(s, kind); return Math.hypot(c.target.pos[0], c.target.pos[1]); };
    ok("!! THE KINDS DRAW FROM THEIR OWN STREAMS (the kind is mixed into the seed): hover and recovery at the same seed ask for points at different distances (both draw their distance first), over 20 seeds never the same", Array.from({ length: 20 }, (_, i) => i + 1).every((s) => d0("hover", s) !== d0("recovery", s)));
    ok("a scenario is frozen (a pilot cannot edit the job it is given)", Object.isFrozen(a) && Object.isFrozen(a.start) && Object.isFrozen(a.target) && Object.isFrozen(a.wind) && Object.isFrozen(RT.scenario(7, "terrain").terrain));
    let threw = ""; try { RT.scenario(1, "stormy"); } catch (e) { threw = String(e.message); }
    ok("!! an unknown kind is refused BY NAME and says what the kinds are", /unknown kind "stormy"/.test(threw) && /hover, recovery, engine, terrain/.test(threw), threw);
    const seeds = Array.from({ length: 60 }, (_, i) => i + 1);
    const all = (kind, fn) => seeds.every((s) => fn(RT.scenario(s, kind)));
    const rangeOf = (kind, fn) => seeds.map((s) => fn(RT.scenario(s, kind)));
    const dist = (sc) => Math.hypot(sc.target.pos[0], sc.target.pos[1]);
    ok("!! HOVER stays inside its ranges over 60 seeds: 120 m up, a point 30..120 m away, a height 95..145, a heading within 1.5 rad, a wind of up to 8 m/s with gusts of 1..2.5 m/s horizontally, a start within 0.1 rad of the trim's and 2 m/s of rest", all("hover", (c) => c.start.pos[2] === 120 && dist(c) >= 30 - 1e-9 && dist(c) <= 120 + 1e-9 && c.target.altitude >= 95 && c.target.altitude <= 145 && Math.abs(c.target.heading) <= 1.5 && c.wind && c.wind.mean.slice(0, 2).every((v) => Math.abs(v) <= 8) && c.wind.amp.slice(0, 2).every((v) => v >= 1 && v <= 2.5) && Math.abs(c.start.bank - TRIM.bank) <= 0.1 + 1e-12 && Math.abs(c.start.velocity[0]) <= 2 && !c.terrain));
    ok("!! RECOVERY stays inside its ranges: 80 degrees of bank, 30 of pitch, 1 rad/s of spin, 12 m/s of fall or climb, a rotor at 26..33 rad/s, still air -- and over 60 seeds really reaches past 70 degrees of bank and past 9 m/s of fall", all("recovery", (c) => Math.abs(c.start.bank) <= 1.4 && Math.abs(c.start.pitch) <= 0.5 && c.start.w.every((v) => Math.abs(v) <= 1) && Math.abs(c.start.velocity[2]) <= 12 && c.start.omega >= 26 && c.start.omega <= 33 && c.wind === null && !c.terrain) && Math.max(...rangeOf("recovery", (c) => Math.abs(c.start.bank))) > 70 * Math.PI / 180 && Math.max(...rangeOf("recovery", (c) => Math.abs(c.start.velocity[2]))) > 9);
    ok("!! ENGINE starts with the engine OUT, from 45..160 m at 0..25 m/s forward, heading 0, in still air, with the height it starts at as its target -- and over 60 seeds reaches both ends of both ranges (under 60 m and over 145 m; under 3 and over 22 m/s)", all("engine", (c) => c.start.engine === "out" && c.start.pos[2] >= 45 && c.start.pos[2] <= 160 && c.start.velocity[0] >= 0 && c.start.velocity[0] <= 25 && c.target.altitude === c.start.pos[2] && c.wind === null && !c.terrain) && Math.min(...rangeOf("engine", (c) => c.start.pos[2])) < 60 && Math.max(...rangeOf("engine", (c) => c.start.pos[2])) > 145 && Math.min(...rangeOf("engine", (c) => c.start.velocity[0])) < 3 && Math.max(...rangeOf("engine", (c) => c.start.velocity[0])) > 22);
    ok("!! TERRAIN is a seeded noise ground of 25..60 m of relief over 250..450 m wavelengths (its own seed per scenario), the machine 36 m up near a hover, a point 250..450 m away and 30 m of height over the GROUND asked for -- and over 60 seeds the terrain seeds are all different", all("terrain", (c) => c.terrain.kind === "fbm" && c.terrain.amplitude >= 25 && c.terrain.amplitude <= 60 && c.terrain.wavelength >= 250 && c.terrain.wavelength <= 450 && c.start.pos[2] === 36 && dist(c) >= 250 - 1e-9 && dist(c) <= 450 + 1e-9 && c.target.agl === 30 && c.target.altitude === undefined && c.wind === null) && new Set(rangeOf("terrain", (c) => c.terrain.seed)).size === 60);
    ok("!! THE TERRAIN IS LEVEL WHERE THE MACHINE STARTS (a clearing: the ground under the start and within 100 m of it is 0 to 1e-9 for every seed -- the skids are not made to start in the dirt)", all("terrain", (c) => { const t = TR.createTerrain(c.terrain); return [[0, 0], [60, 0], [-60, 0], [0, 80], [0, -80], [70, 70]].every(([x, y]) => Math.abs(t.height(x, y)) < 1e-9); }));
    ok("!! and it is NOT level everywhere: the ground under the point is not flat over 60 seeds (the relief is real: some point is 10 m or more off the start's level, and the terrain is the same ground when built twice)", seeds.some((s) => { const c = RT.scenario(s, "terrain"), t = TR.createTerrain(c.terrain); return Math.abs(t.height(c.target.pos[0], c.target.pos[1])) > 10; }) && (() => { const c = RT.scenario(3, "terrain"), a2 = TR.createTerrain(c.terrain), b2 = TR.createTerrain(c.terrain); return a2.height(200, 150) === b2.height(200, 150); })());
}

console.log("\n2. THE WIND");
{
    const wd = RT.scenario(3, "hover").wind, w0 = RT.windAt(wd, 12.5);
    ok("!! the wind is a pure function of time (the same instant blows the same twice), changes with time, is never NaN, and stays within mean +- amp", JSON.stringify(w0) === JSON.stringify(RT.windAt(wd, 12.5)) && JSON.stringify(RT.windAt(wd, 13)) !== JSON.stringify(w0) && Array.from({ length: 200 }, (_, i) => RT.windAt(wd, i * 0.37)).every((w) => w.every((v, k) => Number.isFinite(v) && Math.abs(v - wd.mean[k]) <= wd.amp[k] + 1e-9)));
    ok("!! a null wind is still air, [0, 0, 0], at every time", JSON.stringify(RT.windAt(null, 5)) === "[0,0,0]" && JSON.stringify(RT.windAt(undefined, 0)) === "[0,0,0]");
    ok("!! the wind's mean is the mean: averaged over a long time it is within 0.15 m/s of `mean` on each axis (the gusts are zero-mean sums of sines, so a seed always blows the same day and no more than that)", (() => { let s = [0, 0, 0]; const n = 40000; for (let i = 0; i < n; i++) { const w = RT.windAt(wd, i * 0.05); s = s.map((v, k) => v + w[k]); } return s.every((v, k) => Math.abs(v / n - wd.mean[k]) < 0.15); })());
}

console.log("\n3. THE SCORE");
{
    const onTarget = custom({ start: hoverStart(), target: { pos: [0, 0], altitude: 120, heading: 0 } });
    const r0 = RT.fly(hand, onTarget);
    ok("!! A PILOT ALREADY ON ITS TARGETS IN TRIM SCORES 0 (to 0.02) AND IS NOT CHARGED FOR TIME: the hand pilot started in the hover trim at the point, 120 m up, heading 0, flies all 1,800 ticks 'airborne' with every error under 0.02", Math.abs(r0.score) < 0.02 && r0.status === "airborne" && r0.ticks === 1800 && r0.ePos < 0.02 && r0.eAlt < 0.02 && r0.eHdg < 0.02, `score ${f(r0.score, 5)}, ePos ${f(r0.ePos, 5)} eAlt ${f(r0.eAlt, 5)} eHdg ${f(r0.eHdg, 5)}`);
    const ground = custom({ start: { pos: [0, 0, 1.45], pitch: TRIM.pitchAttitude, bank: TRIM.bank, heading: 0 }, target: { pos: [0, 0], altitude: 120, heading: 0 } });
    const rg = RT.fly(() => ({ collective: 0, pitch: 0, roll: 0, yaw: 0 }), ground);
    ok("!! A FLIGHT THAT ENDS ON ITS FIRST TICK IS CHARGED THE WORST TICK FOR EVERY ONE, EXACTLY: a machine at rest on its skids with the collective at zero (it 'landed') ends at once and scores -9 to the last digit, 'landed', 0 ticks flown -- landing is not a way to stop being graded", rg.score === -9 && rg.status !== "airborne" && rg.ticks === 0 && rg.ePos === 0 && rg.eAlt === 0 && rg.eHdg === 0, `score ${rg.score}, ${rg.status}, ${rg.ticks} ticks, means ${rg.ePos} ${rg.eAlt} ${rg.eHdg}`);
    const falling = custom({ start: hoverStart({ pos: [0, 0, 60], velocity: [0, 0, -25] }), target: { pos: [0, 0], altitude: 120, heading: 0 } });
    const rf = RT.fly(() => ({ collective: 0, pitch: 0, roll: 0, yaw: 0 }), falling), scored = Math.ceil(rf.ticks / RT.TICKS_PER_SCORE);
    ok("!! A FLIGHT THAT ENDS EARLY IS CHARGED 9 FOR EVERY SCORING TICK IT DID NOT FLY, AND THE ONES IT FLEW BY THEIR ERRORS: a fall from 60 m at 25 m/s with no collective crashes part-way; the score is minus (the mean error x the ticks scored + 9 x the rest) over all 600, recomputed here from the flight's own tick count", rf.status !== "airborne" && rf.ticks > 0 && rf.ticks < 1800 && near(rf.score, -((rf.ePos + rf.eAlt + rf.eHdg) * scored + 9 * (SCORING - scored)) / SCORING, 1e-12) && scored > 0 && scored < SCORING, `${rf.status} after ${rf.ticks} ticks, ${scored} of ${SCORING} scored, score ${f(rf.score, 4)}`);
    const watcher = (s, t, w, c) => AR.pilot(s, { altitude: 120, heading: 0 }, w, c);
    const far = custom({ start: hoverStart(), target: { pos: [1000, 0], altitude: 320, heading: 2.0 } });
    const rc = RT.fly(watcher, far);
    ok("!! THE THREE TERMS ARE POSITION OVER 30 m, HEIGHT OVER 30 m AND HEADING IN RADIANS, EACH CAPPED AT 3: a machine that holds its hover while the target is 1,000 m away, 200 m higher and 2 rad off scores ePos 3 and eAlt 3 exactly (the caps) and eHdg 2.0, and a score of -8.0", near(rc.ePos, 3, 1e-9) && near(rc.eAlt, 3, 1e-9) && near(rc.eHdg, 2.0, 0.01) && near(rc.score, -8, 0.01), `ePos ${f(rc.ePos, 6)} eAlt ${f(rc.eAlt, 6)} eHdg ${f(rc.eHdg, 4)} -> ${f(rc.score, 4)}`);
    const near1 = custom({ start: hoverStart(), target: { pos: [15, 0], altitude: 120, heading: 0 } }), rn = RT.fly(watcher, near1);
    ok("!! BELOW THE CAP THE POSITION TERM IS DISTANCE OVER 30 m: holding the hover with the point 15 m away (not reached) is 0.5 a tick", near(rn.ePos, 0.5, 0.01), `ePos ${f(rn.ePos, 5)}`);
    const alt1 = custom({ start: hoverStart(), target: { pos: [0, 0], altitude: 135, heading: 0 } }), ra = RT.fly(watcher, alt1);
    ok("!! AND THE HEIGHT TERM IS THE HEIGHT ERROR OVER 30 m: holding 120 m with 135 m asked is 0.5 a tick", near(ra.eAlt, 0.5, 0.01), `eAlt ${f(ra.eAlt, 5)}`);
    const wrap = custom({ start: hoverStart({ heading: -3.0 }), target: { pos: [0, 0], altitude: 120, heading: 3.0 } }), rw = RT.fly((s, t, w, c) => AR.pilot(s, { altitude: 120, heading: -3.0 }, w, c), wrap);
    ok("!! THE HEADING ERROR IS WRAPPED: holding -3.0 rad when 3.0 is asked is an error of 2 x pi - 6 = 0.283 rad, not 6.0 (and not capped at 3)", near(rw.eHdg, 2 * Math.PI - 6, 0.01), `eHdg ${f(rw.eHdg, 5)}`);
    const capH = custom({ start: hoverStart(), target: { pos: [0, 0], altitude: 120, heading: Math.PI - 0.01 } }), rcap = RT.fly(watcher, capH);
    ok("!! THE HEADING TERM IS CAPPED AT 3 TOO (a wrapped error can reach pi, and the cap binds between 3 and pi): holding heading 0 when pi - 0.01 is asked is a heading error of 3.0 a tick, not 3.13", near(rcap.eHdg, 3, 1e-6), `eHdg ${f(rcap.eHdg, 6)}`);
    const noHeading = custom({ start: hoverStart({ heading: 1.0 }), target: { pos: [0, 0], altitude: 120 } }), rnh = RT.fly((s, t, w, c) => AR.pilot(s, { altitude: 120, heading: 1.0 }, w, c), noHeading);
    ok("!! A TARGET WITHOUT A HEADING HAS NO HEADING TERM (the terrain job asks for none): the same hover held at heading 1.0 with no heading asked has eHdg exactly 0", rnh.eHdg === 0, `eHdg ${rnh.eHdg}`);

    // the engine flight's cost, on every training engine flight, from the flight's own fields
    const eng = RT.TRAIN_SET.filter((c) => c.kind === "engine").map((c) => RT.fly(hand, c));
    const cost = (r) => (r.touchdown === "landed" && r.settled ? -(0.4 * Math.min(1, r.sink / 4.5) + 0.4 * Math.min(5, r.gs / 10)) : r.touchdown ? -(3 + 4 * Math.min(1, Math.max(r.sink, 0) / 20)) : -7);
    ok("!! THE ENGINE FLIGHT'S COST IS THE HEADER'S FORMULA, ON ALL TWELVE TRAINING ENGINE FLIGHTS: a landing the machine walks away from costs 0.4 x min(1, sink / 4.5) + 0.4 x min(5, gs / 10), a crash costs 3 + 4 x min(1, sink / 20), recomputed here from each flight's own sink, ground speed and touchdown (and both kinds are among them)", eng.every((r) => near(r.score, cost(r), 1e-12)) && eng.some((r) => r.settled) && eng.some((r) => !r.settled), eng.map((r) => `${r.status[0]}${f(r.score, 2)}`).join(" "));
    ok("!! A WALKED-AWAY LANDING IS BETTER THAN ANY CRASH: the worst settled landing on the training flights costs less than 2.4 (the cost of the worst landing there can be) and the least bad crash costs 3 or more", Math.min(...eng.filter((r) => r.settled).map((r) => r.score)) >= -2.4 - 1e-12 && Math.max(...eng.filter((r) => !r.settled).map((r) => r.score)) <= -3 + 1e-12, `${f(Math.min(...eng.filter((r) => r.settled).map((r) => r.score)), 3)} / ${f(Math.max(...eng.filter((r) => !r.settled).map((r) => r.score)), 3)}`);
    ok("!! and a faster crash is worse than a slower one (a crash at 12 m/s of sink costs more than one at 6): every crash's score falls as its sink rises, over the training flights", (() => { const cr = eng.filter((r) => !r.settled).sort((a, b) => a.sink - b.sink); return cr.length > 1 && cr.every((r, i) => i === 0 || r.score <= cr[i - 1].score + 1e-12); })());
    // THE SECOND RULE: the ground speed at first contact
    const gsOf = (c) => { let st = H.createState(model, { ...c.start }); for (let i = 0; i < 2400; i++) { const o = H.stepRotor(model, st, hand(st, c.target, [0, 0, 0], { terrain: TR.FLAT }), RT.DT, [0, 0, 0], TR.FLAT); st = o.state; if (o.status !== "airborne") return Math.hypot(st.vel[0], st.vel[1]); } return NaN; };
    const trainEng = RT.TRAIN_SET.filter((c) => c.kind === "engine");
    ok("!! `gs` IS THE SPEED OVER THE GROUND AT FIRST CONTACT: each training engine flight is stepped here independently to its first contact and the horizontal speed there is the flight's `gs`, to the last digit (the hand pilot comes down at 10-20 m/s, never at 0)", eng.every((r, i) => r.gs === gsOf(trainEng[i])) && eng.every((r) => r.gs > 5 && r.gs < 25), eng.map((r) => f(r.gs, 1)).join(" "));
    const grid = [[0, 0], [4.5, 0], [0, 10], [2, 5], [4.5, 10], [9, 10], [0, 25], [3, 50], [4.5, 50], [4.5, 80], [100, 1000]];
    ok("!! THE LANDING COST IS ITS FORMULA, CORNERS INCLUDED (no flight reaches the cap, so it is asked directly): 0.4 x min(1, sink / 4.5) + 0.4 x min(5, gs / 10) at eleven (sink, gs) points -- free at rest, 0.4 at the sink limit, 0.4 more at 10 m/s over the ground, rising to 2.0 at 50 m/s and no further, so the worst landing costs 2.4", grid.every(([sk, g]) => near(RT.landingCost(sk, g), 0.4 * Math.min(1, sk / 4.5) + 0.4 * Math.min(5, g / 10), 1e-12)) && RT.landingCost(0, 0) === 0 && near(RT.landingCost(4.5, 0), 0.4, 1e-12) && near(RT.landingCost(0, 10), 0.4, 1e-12) && near(RT.landingCost(0, 50), 2.0, 1e-12) && near(RT.landingCost(0, 5000), 2.0, 1e-12) && near(RT.landingCost(100, 5000), 2.4, 1e-12) && RT.LANDING_GS === 10 && RT.LANDING_GS_CAP === 5);
    ok("!! COMING DOWN SLOWER IS ALWAYS BETTER, AND THE WORST LANDING STILL BEATS THE BEST CRASH: the landing cost never falls as the sink or the ground speed rises (a grid of 20 x 20), and its largest value, 2.4, is below the least a crash costs, 3", (() => { let ok1 = true; for (let a = 0; a <= 20; a++) for (let b = 0; b <= 20; b++) { const c = RT.landingCost(a * 0.5, b * 4); if (b > 0 && c < RT.landingCost(a * 0.5, (b - 1) * 4) - 1e-12) ok1 = false; if (a > 0 && c < RT.landingCost((a - 1) * 0.5, b * 4) - 1e-12) ok1 = false; } return ok1 && RT.landingCost(1e9, 1e9) < 3 - 0.5; })());
    const slow = eng.find((r) => r.settled);
    ok("!! TEN MORE METRES A SECOND OVER THE GROUND AT FIRST CONTACT COST 0.4 MORE (the sink unchanged): the first settled training landing's cost at gs + 10 less its cost at gs is 0.4, and the flight itself scored exactly its landing cost", near(RT.landingCost(slow.sink, slow.gs + 10) - RT.landingCost(slow.sink, slow.gs), 0.4, 1e-12) && near(slow.score, -RT.landingCost(slow.sink, slow.gs), 1e-12), `${f(slow.score, 4)} at ${f(slow.gs, 2)} m/s`);
    const never = custom({ kind: "engine", start: { pos: [0, 0, 5000], velocity: [0, 0, 0], pitch: TRIM.pitchAttitude, bank: TRIM.bank, engine: "out" }, target: { altitude: 5000 } });
    const rn2 = RT.fly(() => ({ collective: 0.3, pitch: 0, roll: 0, yaw: 0 }), never);
    ok("!! A FLIGHT THAT NEVER TOUCHES DOWN IN ITS 40 SECONDS COSTS 7 (it is not a landing and it is not free): the engine out at 5,000 m with the collective held scores -7, 'airborne', no touchdown", rn2.score === -7 && rn2.status === "airborne" && rn2.touchdown === null, `${rn2.score} ${rn2.status} ${rn2.touchdown}`);
    const e1 = RT.TRAIN_SET.find((c) => c.kind === "engine"), ee = RT.fly(hand, e1);
    const firstContact = (() => { let s = H.createState(model, { ...e1.start }); for (let i = 0; i < 2400; i++) { const o = H.stepRotor(model, s, hand(s, e1.target, [0, 0, 0], { terrain: TR.FLAT }), RT.DT, [0, 0, 0], TR.FLAT); s = o.state; if (o.status !== "airborne") return i; } return -1; })();
    ok("!! AN ENGINE FLIGHT STOPS EIGHT SECONDS (480 TICKS) AFTER ITS FIRST CONTACT: the first training engine flight is stepped here independently to its first contact (tick " + firstContact + ") and the task's flight ends exactly 480 + 1 ticks after it, a landing 'settled' -- and a flight that never touches down runs the 40 s ceiling, 2,400 ticks", ee.settled && ee.ticks === firstContact + 480 + 1 && rn2.ticks === 2400, `${ee.ticks} ticks (first contact at ${firstContact}); the 5,000 m flight ${rn2.ticks}`);
}

console.log("\n4. THE TERRAIN IS THE MODEL'S AND THE PILOT'S");
{
    const lifted = custom({ kind: "engine", terrain: { kind: "flat", level: 4990 }, start: { pos: [0, 0, 5000], velocity: [0, 0, 0], pitch: TRIM.pitchAttitude, bank: TRIM.bank, engine: "out" }, target: { altitude: 5000 } });
    let seenE = null; const re = RT.fly((s, t, w, c) => { if (!seenE) seenE = c; return { collective: 0.3, pitch: 0, roll: 0, yaw: 0 }; }, lifted);
    ok("!! AN ENGINE FLIGHT IS STEPPED OVER ITS SCENARIO'S TERRAIN AND ITS PILOT IS HANDED IT: the engine out at 5,000 m over a plateau at 4,990 m touches down (a flight over flat ground at 0 would not in 40 s), and the pilot's fourth argument is that plateau", re.touchdown !== null && re.ticks < 2400 && seenE && seenE.terrain.height(10, 10) === 4990, `${re.touchdown} after ${re.ticks} ticks`);
    const plateau = { kind: "flat", level: 50 }, tAgl = custom({ kind: "terrain", terrain: plateau, start: { pos: [0, 0, 50 + TRIM.skidDrop + 30], pitch: TRIM.pitchAttitude, bank: TRIM.bank, heading: 0 }, target: { pos: [0, 0], agl: 30 } });
    const seeing = RT.fly(hand, tAgl);
    ok("!! AN `agl` TARGET IS THE SKIDS' HEIGHT OVER THE GROUND THE MODEL IS STEPPED OVER: a hand pilot started at a plateau's 50 m + 1.5 m + 30 m, asked for 30 m of skids' height over the ground, holds it for 30 s with eAlt under 0.02 -- the plateau is in the model and the pilot reads the same one", seeing.status === "airborne" && seeing.eAlt < 0.02 && seeing.ePos < 0.02, `eAlt ${f(seeing.eAlt, 5)} ePos ${f(seeing.ePos, 5)} ${seeing.status}`);
    const blind = RT.fly((s, t, w) => AR.pilot(s, t, w), custom({ kind: "terrain", terrain: plateau, start: { pos: [0, 0, 55], pitch: TRIM.pitchAttitude, bank: TRIM.bank, heading: 0 }, target: { pos: [0, 0], agl: 30 } }));
    ok("!! A PILOT THAT IS NOT HANDED THE GROUND (it ignores the fourth argument) DOES NOT HOLD IT: the same job from 5 m above the plateau, flown blind, reads the floor as z = 0 and cannot be asked for 30 m over a plateau at 50 -- eAlt over 0.5 (it is graded on the real ground, and it never saw it)", blind.eAlt > 0.5, `eAlt ${f(blind.eAlt, 3)} (sees: ${f(seeing.eAlt, 4)})`);
    let seen = null; RT.fly((s, t, w, c) => { if (!seen) seen = c; return AR.pilot(s, t, w, c); }, RT.scenario(2, "terrain"));
    ok("!! THE PILOT IS HANDED A TERRAIN AS ITS FOURTH ARGUMENT -- the model's own ground (physics/mechanics/terrain.mjs: height(x, y) of the scenario's spec) -- and, for a kind with no terrain, the flat ground", seen && typeof seen.terrain.height === "function" && near(seen.terrain.height(200, 100), TR.createTerrain(RT.scenario(2, "terrain").terrain).height(200, 100), 1e-12) && attempt(() => { let z = null; RT.fly((s, t, w, c) => { if (!z) z = c; return AR.pilot(s, t, w, c); }, RT.scenario(2, "hover")); return z.terrain.height(500, 500) === 0; }, false));
    // a wall across the way: the model collides with it, so a pilot that flies into it crashes and is charged for it
    const wall = custom({ kind: "terrain", terrain: { kind: "wall", x0: 60, height: 150 }, start: { pos: [0, 0, 30], pitch: TRIM.pitchAttitude, bank: TRIM.bank, heading: 0 }, target: { pos: [300, 0], agl: 30 } });
    const straight = RT.fly((s, t, w) => AR.pilot(s, { velocity: [25, 0], altitude: 30 }, w), wall);   // the pilot that is not handed the ground (it ignores the fourth argument)
    const careful = RT.fly((s, t, w, c) => AR.pilot(s, { velocity: [25, 0], altitude: 30 }, w, c), custom({ kind: "terrain", terrain: { kind: "wall", x0: 200, height: 150 }, start: wall.start, target: wall.target }));
    ok("!! THE MODEL COLLIDES WITH THE TERRAIN THE TASK GIVES IT, AND A CRASH IS CHARGED: a pilot that is not handed the ground and flies straight at a 150 m wall 60 m off (30 m up, 25 m/s ahead) hits it, the flight ends 'crashed' part-way and is charged the worst tick for the rest (a score far worse than a hover's) -- and the same pilot that IS handed the ground, with the wall 200 m off, stops and climbs and is still airborne when the 30 s are up", straight.status !== "airborne" && straight.ticks < 1800 && straight.score < -4 && careful.status === "airborne" && careful.ticks === 1800, `blind: ${straight.status} after ${straight.ticks} ticks, ${f(straight.score, 3)}; sees: ${careful.status}`);
}

console.log("\n5. THE SETS");
{
    const key = (c) => c.kind + ":" + c.seed, S = { TRAIN: RT.TRAIN_SET, HELD_OUT: RT.HELD_OUT_SET, AUDIT: RT.AUDIT_SET, AUDIT2: RT.AUDIT2_SET, BASELINE: RT.BASELINE_SET, SAFETY_POOL: RT.SAFETY_POOL_SET, SAFETY_AUDIT: RT.SAFETY_AUDIT_SET, SAFETY_AUDIT2: RT.SAFETY_AUDIT2_SET };
    const names = Object.keys(S), sizes = { TRAIN: [6, 12, 12, 4], HELD_OUT: [6, 6, 12, 4], AUDIT: [8, 8, 20, 6], AUDIT2: [8, 8, 20, 6], BASELINE: [4, 4, 8, 4], SAFETY_POOL: [10, 10, 30, 10], SAFETY_AUDIT: [10, 10, 30, 10], SAFETY_AUDIT2: [10, 10, 30, 10] };
    ok("!! THE SETS HOLD THE SIZES THE HEADER SAYS, PER KIND (hover, recovery, engine, terrain): TRAIN 6/12/12/4 and HELD_OUT 6/6/12/4, the two AUDITs 8/8/20/6, BASELINE 4/4/8/4, the three SAFETY sets 10/10/30/10", names.every((n) => RT.KINDS.every((k, i) => S[n].filter((c) => c.kind === k).length === sizes[n][i])), names.map((n) => `${n} ${S[n].length}`).join(", "));
    ok("!! NO (kind, seed) PAIR IS IN TWO SETS, AND NONE IS REPEATED WITHIN ONE (a pilot trained on TRAIN is chosen on HELD_OUT and graded once on an AUDIT: a pair in two of them is a pilot graded on what it was taught -- and the first draft of this file had the engine ranges of TRAIN and HELD_OUT, and of HELD_OUT and AUDIT, overlapping by two seeds each)", (() => { const seen = new Map(); for (const n of names) for (const c of S[n]) { const k = key(c); if (seen.has(k)) return false; seen.set(k, n); } return true; })());
    const SP = RT.SPENT_V1_SETS, spentNames = Object.keys(SP), spentKeys = new Set(spentNames.flatMap((n) => SP[n].map(key)));
    ok("!! THE SECOND RULE'S AUDITS ARE NEW SEEDS: no (kind, seed) pair of AUDIT, AUDIT2, BASELINE, SAFETY_AUDIT or SAFETY_AUDIT2 is one the first rule's champions read (the five spent sets, kept in the module for this row), and nothing a search trains or selects on (TRAIN, HELD_OUT, SAFETY_POOL) is either", ["AUDIT", "AUDIT2", "BASELINE", "SAFETY_AUDIT", "SAFETY_AUDIT2", "TRAIN", "HELD_OUT", "SAFETY_POOL"].every((n) => S[n].every((c) => !spentKeys.has(key(c)))), `${spentKeys.size} spent pairs`);
    ok("!! ...and the spent sets are what they were: five frozen sets with the sizes of the audits they were (42, 42, 20, 60, 60), disjoint from each other, with the first rule's engine seeds 25..44 and 45..64 among them", spentNames.length === 5 && spentNames.every((n) => Object.isFrozen(SP[n])) && [SP.AUDIT, SP.AUDIT2, SP.BASELINE, SP.SAFETY_AUDIT, SP.SAFETY_AUDIT2].map((x) => x && x.length).join() === "42,42,20,60,60" && spentKeys.size === 224 && spentKeys.has("engine:25") && spentKeys.has("engine:44") && spentKeys.has("engine:45") && spentKeys.has("engine:64") && !spentKeys.has("engine:65"));
    ok("!! every scenario in a set is the scenario its (kind, seed) makes", names.every((n) => S[n].every((c) => JSON.stringify(c) === JSON.stringify(RT.scenario(c.seed, c.kind)))));
    ok("!! the sets are frozen", names.every((n) => Object.isFrozen(S[n])));
    const small = RT.TRAIN_SET.filter((c, i) => i % 5 === 0), ev = RT.evaluate(hand, small), runs = small.map((c) => RT.fly(hand, c));
    ok("!! evaluate() IS ARITHMETIC OVER fly(): the score is the plain mean of the runs' scores, byKind the mean within each kind, `crashed` the engine flights that did not end standing plus the other flights that did not stay airborne", near(ev.score, runs.reduce((a, r) => a + r.score, 0) / runs.length, 1e-12) && RT.KINDS.every((k) => { const rs = runs.filter((r) => r.kind === k); return rs.length === 0 ? !(k in ev.byKind) : near(ev.byKind[k], rs.reduce((a, r) => a + r.score, 0) / rs.length, 1e-12); }) && ev.crashed === runs.filter((r) => (r.kind === "engine" ? !r.settled : r.status !== "airborne")).length && ev.runs.length === small.length, `${f(ev.score, 4)}, ${ev.crashed} not standing of ${small.length}`);
}

console.log("\n6. THE BASELINE, FROZEN");
{
    const FROZEN = {
        TRAIN: { score: -1.683189, crashed: 8, byKind: { hover: -0.61534, recovery: -0.818050, engine: -2.961653, terrain: -2.044985 } },
        HELD_OUT: { score: -1.728423, crashed: 6, byKind: { hover: -0.731519, recovery: -0.873886, engine: -2.576035, terrain: -1.962752 } },
        AUDIT: { score: -2.077044, crashed: 15, byKind: { hover: -0.727381, recovery: -0.71591, engine: -3.222879, terrain: -1.871988 } },
        AUDIT2: { score: -1.499111, crashed: 5, byKind: { hover: -0.634573, recovery: -0.949338, engine: -1.884644, terrain: -2.099748 } },
        BASELINE: { score: -1.604224, crashed: 3, byKind: { hover: -0.846618, recovery: -0.7853, engine: -2.222773, terrain: -1.943658 } },
        SAFETY_POOL: { score: -1.831373, crashed: 16, byKind: { hover: -0.659115, recovery: -0.589958, engine: -2.604303, terrain: -1.926256 } },
        SAFETY_AUDIT: { score: -1.814217, crashed: 15, byKind: { hover: -0.700789, recovery: -0.673392, engine: -2.557762, terrain: -1.837836 } },
        SAFETY_AUDIT2: { score: -1.927423, crashed: 16, byKind: { hover: -0.695744, recovery: -0.740778, engine: -2.705111, terrain: -2.012684 } },
    };
    const S = { TRAIN: RT.TRAIN_SET, HELD_OUT: RT.HELD_OUT_SET, AUDIT: RT.AUDIT_SET, AUDIT2: RT.AUDIT2_SET, BASELINE: RT.BASELINE_SET, SAFETY_POOL: RT.SAFETY_POOL_SET, SAFETY_AUDIT: RT.SAFETY_AUDIT_SET, SAFETY_AUDIT2: RT.SAFETY_AUDIT2_SET }, got = {};
    for (const n of Object.keys(S)) {
        const r = RT.evaluate(hand, S[n]); got[n] = r;
        const fz = FROZEN[n];
        ok(`!! THE HAND PILOT ON ${n} IS PINNED: ${f(fz.score, 6)} (${RT.KINDS.map((k) => `${k} ${f(fz.byKind[k], 6)}`).join(", ")}; ${fz.crashed} not standing of ${S[n].length}) -- a change to the model, the pilot, the terrain or the task moves it, and this row is where that is said`, near(r.score, fz.score, 5e-6) && RT.KINDS.every((k) => near(r.byKind[k], fz.byKind[k], 5e-6)) && r.crashed === fz.crashed, RT.describeEval(r));
    }
    const ended = (n) => got[n].runs.filter((x) => (x.kind === "engine" ? !x.settled : x.status !== "airborne")).map((x) => x.kind[0] + x.seed).join(",");
    ok("!! THE HAND PILOT'S TAILS ARE PINNED BY NAME: every flight it ends early on the three safety sets is an ENGINE flight (sixteen, fifteen and sixteen of the thirty on each; the hover, recovery and terrain starts, 30 of each kind over the three sets, are all flown to the end) -- the dead man's curve, and the only place a learned pilot can be worse or better",
        ended("SAFETY_POOL") === "e1001,e1003,e1005,e1006,e1007,e1010,e1011,e1015,e1016,e1018,e1021,e1022,e1023,e1024,e1026,e1027" && ended("SAFETY_AUDIT") === "e4003,e4004,e4005,e4007,e4009,e4010,e4011,e4013,e4014,e4018,e4019,e4020,e4024,e4026,e4028" && ended("SAFETY_AUDIT2") === "e5001,e5002,e5003,e5005,e5007,e5011,e5013,e5015,e5016,e5018,e5020,e5023,e5024,e5026,e5028,e5029",
        `${got.SAFETY_POOL.crashed} / ${got.SAFETY_AUDIT.crashed} / ${got.SAFETY_AUDIT2.crashed}`);
    ok("!! THE HAND PILOT COMES DOWN AT ONE GROUND SPEED, 14.6-14.7 m/s AT FIRST CONTACT ON EVERY SET (its autorotation glide speed: the flare does not take it off), so 0.58-0.59 of each landing it makes is the second rule's term -- the number a learned pilot is to beat", Object.values(got).every((r) => { const l = r.runs.filter((x) => x.kind === "engine" && x.settled); const m = l.reduce((a, x) => a + x.gs, 0) / l.length; return m > 14.5 && m < 14.75; }), Object.entries(got).map(([n, r]) => { const l = r.runs.filter((x) => x.kind === "engine" && x.settled); return `${n} ${f(l.reduce((a, x) => a + x.gs, 0) / l.length, 2)}`; }).join(", "));
    const fp = [["hover", 1, "9a50c870", 1800], ["recovery", 1, "5223295f", 1800], ["engine", 1, "c54fb824", 1231], ["terrain", 1, "0006cb38", 1800]];
    ok("!! A FLIGHT OF EACH KIND HAS ITS FINGERPRINT PINNED (the sampled states folded to millimetres) and its tick count: hover 9a50c870, recovery 5223295f, engine c54fb824 (1,231 ticks to the end of its eight settled seconds), terrain 0006cb38", fp.every(([k, s, h, n]) => { const r = RT.fly(hand, RT.scenario(s, k)); return r.fingerprint === h && r.ticks === n; }), fp.map(([k, s]) => RT.fly(hand, RT.scenario(s, k)).fingerprint).join(" "));
    ok("!! THE ENGINE FLIGHTS ARE WHERE THE HAND PILOT LOSES (the dead man's curve, said in the task's own numbers): on seven of the eight sets the engine kind is the worst kind of the four (the eighth, AUDIT2, is the set where the hand pilot lands fifteen of its twenty engine flights and terrain is the worst), and eight of the twelve training engine flights end crashed", Object.entries(got).every(([n, r]) => (r.byKind.engine === Math.min(...RT.KINDS.map((k) => r.byKind[k]))) === (n !== "AUDIT2")) && got.AUDIT2.runs.filter((x) => x.kind === "engine" && x.settled).length === 15 && got.TRAIN.runs.filter((x) => x.kind === "engine" && !x.settled).length === 8, `engine ${Object.values(got).map((r) => f(r.byKind.engine, 2)).join(" / ")}`);
}

console.log("\n7. DETERMINISM, AND THE REPORTING");
{
    const set = RT.TRAIN_SET.filter((c, i) => i % 4 === 1), a = RT.evaluate(hand, set), b = RT.evaluate(hand, set);
    ok("!! a second evaluation is bit-identical: every flight's score, fingerprint and tick count", a.runs.every((r, i) => r.score === b.runs[i].score && r.fingerprint === b.runs[i].fingerprint && r.ticks === b.runs[i].ticks) && a.score === b.score);
    const sc = RT.scenario(5, "terrain"), before = JSON.stringify(sc); RT.fly(hand, sc);
    ok("!! fly() does not mutate its scenario (the start, the target, the terrain spec)", JSON.stringify(sc) === before && Object.isFrozen(sc));
    const ref = RT.evaluate(hand, set), worse = { runs: ref.runs.map((r, i) => ({ ...r, score: r.score - (i === 0 ? 0.5 : i === 1 ? 0.005 : i === 2 || i === 3 ? -0.5 : 0) })) };
    const v = RT.versus(worse, ref);
    ok("!! versus() counts the scenarios one pilot flew better and worse than the other by more than eps (0.01): one worse by 0.5, TWO better by 0.5 (the counts differ, so a swap of the two is seen), one within eps, the rest the same", v.better === 2 && v.worse === 1 && v.same === set.length - 3, JSON.stringify(v));
    const line = RT.describeEval(ref);
    ok("!! describeEval() is one line: the mean to four places, each kind's mean to three, and the count not standing", /^-?\d+\.\d{4} \(hover -?\d+\.\d{3}, recovery -?\d+\.\d{3}, engine -?\d+\.\d{3}, terrain -?\d+\.\d{3}; \d+ not standing\)$/.test(line), line);
    ok("!! a pilot that throws or returns NaN controls does not crash the task: the model reads a bad control as neutral and the flight ends or is scored, and fly() returns a finite score", (() => { const r = RT.fly(() => ({ collective: NaN, pitch: NaN, roll: NaN, yaw: NaN }), RT.scenario(1, "hover")); return Number.isFinite(r.score) && r.score >= -9 - 1e-9 && r.score <= 0; })());
}

console.log(fails ? `\nrotorTask-selfcheck: ${fails} FAILED` : "\nrotorTask-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
