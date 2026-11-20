// WebGLEngine/brain/stationsTask-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). Run: node brain/stationsTask-selfcheck.mjs
//
// THE GATE OF brain/stationsTask.mjs AND OF brain/subStations.mjs's TRIAGE CAPTAIN (round 2 of the submarine stations, brain/SUB_STATIONS_WIP.md sections 7 and 8).
//   1  the scenario: seeded, inside the registered ranges, the sets as registered, the leak's build-up
//   2  the sign test and the verdict rule, on counts worked by hand
//   3  TRIAGE: with every knob off it IS the fixed captain (every command of whole dives); each knob does what it says and nothing when it is off; the frozen knobs are registration B's
//   4  the flight: the crews by name, the outcome record, a crushed dive stops and says when
// Reads NO HELD seed: every dive here is a DEV seed or a seed outside both sets.
// SABOTAGED -- 24 mutants, each alone in place and restored; 21 red by name and 3 EQUIVALENT (final pass): brain/subStations.mjs (the TRIAGE captain) R01 T1 with no floor | R02 T1 on every tick | R03 T2 at any charge | R05 T4 not latched |
//   R07 T4 always on | R08 T3 whatever the sink | R09 T3 to the mission depth | R10 T3 without a surface claim | R11 TRIAGE_OFF with T4 on | R12 no pilot refusal; brain/stationsTask.mjs K01 the frozen T2 off | K02 the frozen T4 off |
//   K03 the leak range 2-8 | K04 the leak not built up | K05 HELD from 161002 | K06 a two-sided sign test | K08 the verdict at p 0.1 | K09 the seeds not checked | K10 FIXED without damage control | K11 a crush not stopped | K12 the seed unhashed.
// SEVEN WENT 0 RED ON THE FIRST PASS. FOUR GOT ROWS: R05 (one calm tick after the breach was read before the latch could be undone; a second is asked now), R08 and R10 (every T3 tick in the gate was both sinking and claimed; a slow tick and
//   a charged one are asked now), K11 (a crushed record was checked for its status only; its final depth is checked to be the crush's). THREE ARE EQUIVALENT: R04 (T2 after the weight has gone: T2 runs only inside a damage override, and
//   damage control is silent once the weight is gone), R06 (T4 below damage's priority: when the breach and energy claims compete they claim the SAME target, surfaceTarget(mission, read())), K07 (the verdict without the survival count:
//   p <= 0.05 one-sided needs more TRIAGE-only than FIXED-only pairs, and that difference IS the survival difference).
// v4930 -- BLOW (round 9, section 6): 6 mutants of subStations.mjs and stationsTask.mjs; 5 red by name, 1 EQUIVALENT (final pass): K1 blowing unbreached | K2 blowing with the weight aboard | K4 blowing at any climb | K5 0.3 m/s |
//   K6 the BLOW crew as TRIAGE. K1 WENT 0 RED FIRST (every hand captain was breached on its first tick); a never-breached captain is asked now. K3 (blowing in the surface band) IS EQUIVALENT under this helm: above 3 m the
//   surfacing wrapper is in its 'afloat' stage and blows the tank itself (ballast -1), so the rule's `cmd.ballast > -1` is already false there.
// v4930 -- NEED (round 12, section 7): 8 mutants, every one red by name (final pass): N1 blowing whatever the need | N2 never blowing | N3 the window ignored | N4 the rate unsigned | N5 the arrival from the surface, a sinking boat
//   counted as arrived | N6 HARD_LEAK from 5 % | N7 the other draws moved | N8 the NEED crew as TRIAGE. FOUR WENT 0 RED FIRST AND GOT ROWS: N3 (every fixture filled the window), N4 (no fixture charged), N5 (no fixture sank),
//   N8 (the crew was checked by its label only; a DEV dive where the two differ is flown now). AND A ROW OF MINE argued with itself in its own text about a 2 m/s climber; it tests a 10 m/s one now.
"use strict";
import * as T from "./stationsTask.mjs";
import * as SS from "./subStations.mjs";
import * as A from "./autopilotSub.mjs";
import * as NT from "./needsTask.mjs";
import * as N from "../physics/mechanics/subNeeds.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";

let fails = 0, finished = false;
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const guarded = (name, f) => { try { f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.stack) || e).split("\n").slice(0, 2).join(" | ").slice(0, 300)); } };
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = JSON.stringify;
console.log("stationsTask-selfcheck -- round 2 of the submarine stations: the task and the TRIAGE captain\n");

sec("1. the scenario");
guarded("section 1", () => {
    const all = Array.from({ length: 400 }, (_, i) => T.scenario(900000 + i)), inR = (v, [lo, hi]) => v >= lo && v <= hi;
    ok("every scenario is inside the registered ranges: depth 15-40 m, charge 0.15-0.45, leak 3-8 percent, leak start 5-60 s, heading 0-2 pi", all.every((s) => inR(s.depth, [15, 40]) && inR(s.frac, [0.15, 0.45]) && inR(s.leak, [0.03, 0.08]) && inR(s.leakAt, [5, 60]) && inR(s.heading, [0, 2 * Math.PI])) &&
        J(T.RANGES) === J({ depth: [15, 40], frac: [0.15, 0.45], leak: [0.03, 0.08], leakAt: [5, 60] }));
    const span = (k) => [Math.min(...all.map((s) => s[k])), Math.max(...all.map((s) => s[k]))];
    ok("...and they fill the ranges (400 draws reach within 5 percent of each end)", [["depth", 15, 40], ["frac", 0.15, 0.45], ["leak", 0.03, 0.08], ["leakAt", 5, 60]].every(([k, lo, hi]) => { const [a, b] = span(k); return a < lo + 0.05 * (hi - lo) && b > hi - 0.05 * (hi - lo); }), J(["depth", "frac", "leak", "leakAt"].map(span)));
    ok("a scenario is the same every time for its seed, and differs between seeds", J(T.scenario(160001)) === J(T.scenario(160001)) && J(T.scenario(160001)) !== J(T.scenario(160002)) && Object.isFrozen(T.scenario(5)));
    ok("the sets as registered: DEV 160001-160048 (48), HELD 161001-161096 (96), disjoint", T.DEV_SET.length === 48 && T.DEV_SET[0] === 160001 && T.DEV_SET[47] === 160048 && T.HELD_SET.length === 96 && T.HELD_SET[0] === 161001 && T.HELD_SET[95] === 161096 && !T.DEV_SET.some((s) => T.HELD_SET.includes(s)));
    const sc = { leak: 0.06, leakAt: 10 };
    ok("the leak is 0 before its start, builds linearly over 5 s, and holds after", T.leakAt(sc, 9.9) === 0 && T.leakAt(sc, 10) === 0 && Math.abs(T.leakAt(sc, 12.5) - 0.03) < 1e-12 && T.leakAt(sc, 15) === 0.06 && T.leakAt(sc, 500) === 0.06);
    ok("a seed that is not a whole number of 0 or more is refused, by name", /^stationsTask\.scenario: a seed is a whole number/.test(throws(() => T.scenario(1.5)) || "") && /whole number/.test(throws(() => T.scenario(-1)) || ""));
});

sec("2. the sign test and the verdict");
guarded("section 2", () => {
    ok("the exact one-sided sign test: P(X >= 5 | n 5) = 1/32, P(X >= 8 | n 10) = 56/1024, P(X >= 0 | n 3) = 1, no pairs = 1", Math.abs(T.signTest(5, 0) - 1 / 32) < 1e-15 && Math.abs(T.signTest(8, 2) - 56 / 1024) < 1e-15 && T.signTest(0, 3) === 1 && T.signTest(0, 0) === 1);
    const mk = (seed, survived) => ({ seed, survived });
    const tri = (pattern) => pattern.map((x, i) => mk(i, x[0] === "1")), fix = (pattern) => pattern.map((x, i) => mk(i, x[1] === "1"));
    const six = ["10", "10", "10", "10", "10", "11", "00"], v6 = T.verdict(tri(six), fix(six));
    ok("five discordant pairs all TRIAGE's: p 1/32, TRIAGE BEATS FIXED, with the counts", v6.verdict === "TRIAGE BEATS FIXED" && v6.triage === 6 && v6.fixed === 1 && v6.triageOnly === 5 && v6.fixedOnly === 0 && Math.abs(v6.pTriage - 1 / 32) < 1e-15, J(v6));
    const four = ["10", "10", "10", "10", "11"], v4 = T.verdict(tri(four), fix(four));
    ok("four of four (p 1/16, above 0.05) is NO DIFFERENCE SHOWN even though TRIAGE survives more", v4.verdict === "NO DIFFERENCE SHOWN" && v4.triage > v4.fixed, J(v4));
    const back = ["01", "01", "01", "01", "01", "01"], vb = T.verdict(tri(back), fix(back));
    ok("the other way round is FIXED BEATS TRIAGE", vb.verdict === "FIXED BEATS TRIAGE" && Math.abs(vb.pFixed - 1 / 64) < 1e-15, J(vb));
    const tie = ["10", "10", "10", "10", "10", "01", "01", "01", "01", "01"], vt = T.verdict(tri(tie), fix(tie));
    ok("equal survival is NO DIFFERENCE SHOWN", vt.verdict === "NO DIFFERENCE SHOWN" && vt.triage === vt.fixed);
    ok("crews flown on different seeds are refused, by name", /not flown on the same seeds/.test(throws(() => T.verdict([mk(1, true)], [mk(2, true)])) || "") && /not flown on the same seeds/.test(throws(() => T.verdict([mk(1, true)], [])) || ""));
});

sec("3. TRIAGE");
guarded("section 3", () => {
    // knobs OFF: the TRIAGE captain is the FIXED captain, every command of whole DEV dives
    const model = NT.model(), cmdsOf = (seed, name, knobs) => {
        const sc = T.scenario(seed); let s = S.createState({ depth: sc.depth, speed: 2, model }), needs = N.initialNeeds("battery", { crushDepth: 60 }); needs.energy = N.CLASSES.battery.capacityJ * sc.frac;
        const read = () => N.readings(model, needs, s), cap = T.crew(name, { read, model }, knobs), tg = { depth: sc.depth, heading: sc.heading, speed: 2 }, out = [];
        for (let i = 0; i < Math.round(300 / S.DT); i++) { const c = cap(s, tg, [0, 0, 0]); out.push(J(c)); const r = N.stepNeeds(model, s, needs, c, S.DT, [0, 0, 0], T.leakAt(sc, i * S.DT), cap.aux); s = r.state; needs = r.needs; if (r.status !== "submerged") break; }
        return { out, cap };
    };
    const diff = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return i; return -1; };
    const seeds = [160001, 160004, 160017], same = seeds.map((sd) => diff(cmdsOf(sd, "TRIAGE", SS.TRIAGE_OFF).out, cmdsOf(sd, "FIXED").out));
    ok("WITH EVERY KNOB OFF, TRIAGE IS THE FIXED CAPTAIN: every command of 300 s identical on three DEV dives FIXED loses", same.every((x) => x === -1), J(same));
    const fr = cmdsOf(160001, "TRIAGE", T.FROZEN_TRIAGE), fx = cmdsOf(160001, "FIXED");
    ok("the frozen TRIAGE does differ from FIXED on such a dive (it acts)", diff(fr.out, fx.out) >= 0 && fr.cap.triage.T2 > 0 && fr.cap.triage.T4 > 0, J(fr.cap.triage));
    ok("THE FROZEN KNOBS ARE REGISTRATION B's: drop the weight at once in trouble (at any charge) and go up once breached; no thrust cap; no lifted rationing", T.FROZEN_TRIAGE.thrustFull === null && T.FROZEN_TRIAGE.earlyDropBelow === Infinity && T.FROZEN_TRIAGE.unrationSink === null && T.FROZEN_TRIAGE.surfaceOnBreach === true && Object.isFrozen(T.FROZEN_TRIAGE));
    // each knob on a hand-made tick: a boat 10 m below its target and sinking (so damage control acts)
    const st = S.createState({ depth: 30, speed: 2, model }); st.vel[2] = -0.5;
    const mission = { depth: 20, heading: 0, speed: 2 }, reading = (frac) => () => ({ cls: "battery", frac, depth: 30, flood: 0, damage: 0, refills: true, refillDepth: 0.7 }), pilot = A.pilot();
    const tc = (knobs, frac = 0.4) => SS.triageCaptain({ pilot, model, read: reading(frac), knobs });
    const off = tc(SS.TRIAGE_OFF)(st, mission), t1 = tc({ thrustFull: 0.8, thrustFloor: 0.1 }), c1 = t1(st, mission);
    ok("T1 caps the rescue thrust at frac / thrustFull (0.4 / 0.8 = 0.5) where FIXED gives 1; it counts the tick", off.thrust === 1 && c1.thrust === 0.5 && t1.triage.T1 === 1, J([off.thrust, c1.thrust, t1.triage]));
    const t1lo = tc({ thrustFull: 0.8, thrustFloor: 0.3 }, 0.05)(st, mission);
    ok("...and never below its floor (0.05 / 0.8 would be 0.06; the floor is 0.3)", t1lo.thrust === 0.3, String(t1lo.thrust));
    const t2 = tc({ earlyDropBelow: 0.5 }), c2 = t2(st, mission), c2hi = tc({ earlyDropBelow: 0.3 })(st, mission);
    ok("T2 drops the weight at the BLOW stage when the charge is under its line (0.4 < 0.5), and not when it is over (0.4 > 0.3)", off.blow === 1 && off.release === 0 && c2.release === 1 && t2.triage.T2 === 1 && c2hi.release === 0, J([off.release, c2.release, c2hi.release]));
    const gone = S.createState({ depth: 30, speed: 2, model }); gone.vel[2] = -0.5; gone.tank = { ...(gone.tank || {}), released: true };
    ok("T2 does nothing once the weight has gone", tc({ earlyDropBelow: 0.5 })(gone, mission).release === undefined || tc({ earlyDropBelow: 0.5 })(gone, mission).release === 0);
    const t4 = tc({ surfaceOnBreach: true }, 0.9); t4(st, mission); const calm = S.createState({ depth: 20, speed: 2, model }); t4(calm, mission);
    ok("T4: once damage control has acted the boat is BREACHED for good: on a later calm tick, with a full charge, the captain still claims the surface", t4.log.con === "breach" && t4.log.flown.surface === true && t4.triage.T4 >= 1, J([t4.log.con, t4.log.flown]));
    t4(calm, mission);
    ok("...and it STAYS breached: a second calm tick still claims the surface (a breach does not mend)", t4.log.con === "breach" && t4.log.flown.surface === true, t4.log.con);
    const t4off = tc(SS.TRIAGE_OFF, 0.9); t4off(st, mission); t4off(calm, mission);
    ok("...and with T4 off the same calm tick flies the mission", t4off.log.con === "mission" && t4off.log.flown.depth === 20);
    const seen = []; const spy = (s, t) => { seen.push(t); return pilot(s, t); };
    const t3 = SS.triageCaptain({ pilot: spy, model, read: reading(0.1), knobs: { unrationSink: 0.2 } }); t3(st, mission);
    ok("T3: sinking faster than its line with the energy station claiming the surface, the BARE pilot is asked for the float depth (no surfacing wrapper)", seen.length === 1 && seen[0].depth < 1 && seen[0].surface === true && t3.triage.T3 === 1 && t3.log.con === "energy", J([seen, t3.triage, t3.log.con]));
    const seen2 = []; const spy2 = (s, t) => { seen2.push(t); return pilot(s, t); };
    const level = S.createState({ depth: 30, speed: 2, model }); level.vel[2] = -0.05;
    const t3a = SS.triageCaptain({ pilot: spy2, model, read: reading(0.1), knobs: { unrationSink: 0.2 } }); t3a(level, mission);
    const t3b = SS.triageCaptain({ pilot: spy2, model, read: reading(0.9), knobs: { unrationSink: 0.2 } }); t3b(st, mission);
    ok("T3 is NOT used on a boat sinking slower than its line (0.05 < 0.2 m/s), nor on a sinking boat whose charge makes no surface claim (90%): the surfacing wrapper flies, and nothing is counted", t3a.triage.T3 === 0 && t3b.triage.T3 === 0, J([t3a.triage, t3b.triage]));
    ok("a TRIAGE captain with no pilot or no read() is refused, by name", /triageCaptain: a pilot and a read\(\) function are needed/.test(throws(() => SS.triageCaptain({ read: reading(0.5) })) || ""));
});

sec("4. the flight");
guarded("section 4", () => {
    const r = T.fly(T.scenario(160004), "FIXED"), r2 = T.fly(T.scenario(160004), "FIXED");
    ok("a flight is the same every time", J(r) === J(r2));
    ok("the outcome record has the registered fields", J(Object.keys(r)) === '["seed","crew","survived","status","crushedAt","reachedSurface","finalDepth","finalFrac","released","triage"]');
    ok("a crushed dive stops, is not survived, and says when (DEV 160004 under FIXED: crushed before 600 s)", r.status === "crushed" && r.survived === false && r.crushedAt > 0 && r.crushedAt < 600, J(r));
    ok("the record of a crushed dive is the boat AT the crush: its final depth is past the 60 m hull (not wherever a sim run on would have taken it)", r.finalDepth > 58 && r.finalDepth < 62, r.finalDepth.toFixed(2));
    const n = T.fly(T.scenario(160004), "NONE");
    ok("NONE is crushed sooner than FIXED on it", n.status === "crushed" && n.crushedAt < r.crushedAt, `${n.crushedAt} against ${r.crushedAt}`);
    ok("an unknown crew is refused, by name", /no crew named "CAPTAIN"/.test(throws(() => T.fly(T.scenario(1), "CAPTAIN")) || ""));
    ok("the five crews in the registered order", J(T.CREWS) === '["NONE","ENERGY","DAMAGE","FIXED","TRIAGE"]');
});

sec("5. the registered constants");
guarded("section 5", () => {
    ok("SECONDS 600, CRUSH 60 m, SURFACE_BAND 3 m, SPEED 2 m/s, LEAK_BUILD 5 s, as registration A of round 2 has them", T.SECONDS === 600 && T.CRUSH === 60 && T.SURFACE_BAND === 3 && T.SPEED === 2 && T.LEAK_BUILD === 5);
});

sec("6. BLOW (round 9, stopped at DEV): the knob and the crew");
guarded("section 6", () => {
    const model = NT.model(), pilot = A.pilot(), reading = () => ({ cls: "battery", frac: 0.4, depth: 30, flood: 0, damage: 0, refills: true, refillDepth: 0.7 }), mission = { depth: 20, heading: 0, speed: 2 };
    const sink = S.createState({ depth: 30, speed: 2, model }); sink.vel[2] = -0.5;
    const slow = (depth, vz, released = true) => { const st = S.createState({ depth, speed: 2, model }); st.vel[2] = vz; st.tank = { ...(st.tank || {}), released }; return st; };
    const cap = () => { const c = SS.triageCaptain({ pilot, model, read: reading, knobs: T.BLOW_KNOBS }); c(sink, mission); return c; };   // breached by the first tick
    const a = cap(), ca = a(slow(30, 0.05), mission);
    ok("BREACHED, the weight gone, deeper than 3 m and climbing at 0.05 m/s: the commands carry ballast -1 (the tank blown with stored air) and T5 counts it", ca.ballast === -1 && a.triage.T5 >= 1, J([ca.ballast, a.triage]));
    const b = cap(), cb = b(slow(30, 0.3), mission), c = cap(), cc = c(slow(2, 0.05), mission), d = cap(), cd = d(slow(30, 0.05, false), mission);
    ok("...and not when it climbs at 0.3 m/s, nor at 2 m (the surface band), nor with the weight still aboard", b.triage.T5 === 0 && c.triage.T5 === 0 && d.triage.T5 === 0, J([b.triage.T5, c.triage.T5, d.triage.T5]));
    const nb = SS.triageCaptain({ pilot, model, read: reading, knobs: T.BLOW_KNOBS }); nb(slow(30, 0.05), mission);
    ok("...nor on a boat that was never breached (damage control has not acted), however slowly it climbs", nb.triage.T5 === 0, J(nb.triage));
    const e = SS.triageCaptain({ pilot, model, read: reading, knobs: T.FROZEN_TRIAGE }); e(sink, mission); e(slow(30, 0.05), mission);
    ok("FROZEN_TRIAGE never blows (blowClimb is null in it); BLOW_KNOBS is FROZEN_TRIAGE with 0.2 m/s and 3 m, frozen", e.triage.T5 === 0 && T.BLOW_KNOBS.blowClimb === 0.2 && T.BLOW_KNOBS.blowAbove === 3 && T.BLOW_KNOBS.earlyDropBelow === Infinity && T.BLOW_KNOBS.surfaceOnBreach === true && Object.isFrozen(T.BLOW_KNOBS));
    ok("the BLOW crew flies the knobs (a DEV dive of round 9 differs from TRIAGE's on 196001) and round 9's sets are 196001-196024 and 197001-197096", T.fly(T.scenario(196001), "BLOW").survived !== T.fly(T.scenario(196001), "TRIAGE").survived && T.R9_DEV_SET[0] === 196001 && T.R9_HELD_SET.length === 96 && T.R9_HELD_SET[0] === 197001);
});

sec("7. NEED (round 12, stopped at DEV): the hard-case scenario and the need-gated blow");
guarded("section 7", () => {
    const sc = T.scenario(204001), hard = T.scenario(204001, T.HARD_LEAK);
    ok("the hard-case scenario draws the leak from 6-8 % and moves nothing else of the seed (the draws are in the same order)", hard.leak >= 0.06 && hard.leak <= 0.08 && hard.depth === sc.depth && hard.frac === sc.frac && hard.leakAt === sc.leakAt && hard.heading === sc.heading && J(T.HARD_LEAK.leak) === "[0.06,0.08]");
    ok("400 hard-case draws all lie in 6-8 %", Array.from({ length: 400 }, (_, i) => T.scenario(830000 + i, T.HARD_LEAK).leak).every((l) => l >= 0.06 && l <= 0.08));
    const model = NT.model(), pilot = A.pilot(), mission = { depth: 20, heading: 0, speed: 2 }, sink = S.createState({ depth: 30, speed: 2, model }); sink.vel[2] = -0.5;
    // a breached boat, weight gone, at 30 m: the charge falls 0.10 over the 10 s window (0.01/s); with 0.05 left it is empty in 5 s
    const drive = (vz, fracs) => { let i = 0; const read = () => ({ cls: "battery", frac: fracs[Math.min(i, fracs.length - 1)], depth: 30, flood: 0, damage: 0, refills: true, refillDepth: 0.7 });
        const c = SS.triageCaptain({ pilot, model, read, knobs: T.NEED_KNOBS }); c(sink, mission); const st = S.createState({ depth: 30, speed: 2, model }); st.vel[2] = vz; st.tank = { ...(st.tank || {}), released: true };
        let last = null; for (i = 1; i < fracs.length; i++) last = c(st, mission); return { c, last }; };
    const falling = Array.from({ length: 302 }, (_, i) => 0.15 - (0.10 * i) / 300), steady = Array.from({ length: 302 }, () => 0.5);
    const a = drive(0.05, falling), b = drive(0.05, steady), d = drive(10, falling);
    ok("A BOAT THAT WOULD RUN OUT ON THE WAY UP BLOWS: at 0.05 m/s from 30 m (540 s to 3 m) with the battery empty in about 5 s, ballast -1 and T5 counts it", a.last.ballast === -1 && a.c.triage.T5 > 0, J([a.last.ballast, a.c.triage]));
    ok("...a boat whose charge holds does NOT (no spend: never empty), and nor does one climbing fast enough to arrive first (10 m/s: 2.7 s to 3 m, before the 5 s of charge runs out)", b.c.triage.T5 === 0 && d.c.triage.T5 === 0, J([b.c.triage.T5, d.c.triage.T5]));
    const early = drive(0.05, falling.slice(0, 50)), rising = drive(0.05, Array.from({ length: 302 }, (_, i) => 0.05 + (0.10 * i) / 300)), sinkingStill = drive(-0.1, Array.from({ length: 302 }, (_, i) => 0.5 - 1e-6 * i));
    ok("...nor before its 10 s window is full (50 ticks), nor while the battery CHARGES (a rising reading is never running out)", early.c.triage.T5 === 0 && rising.c.triage.T5 === 0, J([early.c.triage.T5, rising.c.triage.T5]));
    ok("...and a boat still SINKING never arrives: with any spend at all (here a millionth over the window) it blows", sinkingStill.c.triage.T5 > 0, J(sinkingStill.c.triage));
    ok("THE NEED CREW FLIES THE RULE: on DEV 203010 (a hard-case leak) NEED keeps the boat TRIAGE loses", T.fly(T.scenario(203010, T.HARD_LEAK), "NEED").survived === true && T.fly(T.scenario(203010, T.HARD_LEAK), "TRIAGE").survived === false);
    ok("FROZEN_TRIAGE never blows by need; NEED_KNOBS is FROZEN_TRIAGE with blowNeed, 3 m and a 10 s window; the NEED crew flies them; round 12's sets are 203001-203024 and 204001-204096",
        T.NEED_KNOBS.blowNeed === true && T.NEED_KNOBS.blowAbove === 3 && T.NEED_KNOBS.needWindowS === 10 && T.NEED_KNOBS.earlyDropBelow === Infinity && Object.isFrozen(T.NEED_KNOBS) && T.R12_DEV_SET[0] === 203001 && T.R12_HELD_SET.length === 96 && T.R12_HELD_SET[0] === 204001 &&
        T.fly(T.scenario(203001, T.HARD_LEAK), "NEED", { seconds: 120 }).crew === "NEED");
});

finished = true;
console.log(fails ? `\nstationsTask-selfcheck: ${fails} FAILED` : "\nstationsTask-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
