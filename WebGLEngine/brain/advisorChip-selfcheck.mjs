// WebGLEngine/brain/advisorChip-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/advisorChip-selfcheck.mjs      (~5-16s: 5 on the Linux build box, 16 on the Windows rig)
//
// THE GATE OF brain/advisorChip.mjs, the advisor chip registered in brain/NEEDS_AND_LIMITS.md "Round 4" (written first). Hand-worked fixtures for every field and every branch of the combination, the seat that runs two seats on the SAME observation, the 30 s stale
// advisor, and a few real dives for the identities the registration asks for.
//   1  CONSTANTS   the modes, the stale delay (30 s = 900 ticks), the three audits (111-162, 48 dives each), the seeds reserved for the language-model chip, the two advisors; every set DISJOINT from every set any other round reads (train, held-out, pool, the three Round 3 audits, the baseline set).
//   2  COMBINE     VETO field by field (surface OR, pump OR, repair OR, cap min, the station replaced only when visited, infeasible or null); each one-field mode changes ONLY its field; ALONE and a silent advisor return the brain's decision; nothing is mutated; a bad mode throws.
//   3  FEASIBLE    the spelled-again feasibility test agrees with needsTask.nearestFeasible on stations straddling the limit.
//   4  THE SEAT    both seats are called every tick with the identical (st, obs) objects (in every mode, ALONE and the silent stretch of STALE included); STALE uses the advisor's decision of 30 s earlier and is silent before; the stats count how often each field was overridden.
//   5  THE DIVES   (real flights) the identities of the registration: an advisor that returns the brain's own decision, and no advisor, are bit-identical to ALONE; GUARDED advised by GUARDED is GUARDED, GUARDED-FILTER advised by itself is GUARDED-FILTER; ALONE over a brain is that brain; a weak advisor over a strong brain is NOT the brain.
//   6  THE SOURCE  the audit seeds appear in ONE place; the file reads none of Round 3's audit sets.
// NOT CHECKED, said plainly: that an advised pilot scores better (that is the experiment); any language-model advisor (none exists).
//
// SABOTAGE LOG (30 mutants of brain/advisorChip.mjs, each run against a copy of this gate, 4 at a time; every one red BY NAME):
//   the combination: surface AND, cap max, pump AND, repair from the brain only, the station always the advisor's, a usable test that ignores visited / ignores feasibility / moves the feasibility boundary by a metre, the station replaced when it is usable, V-SURFACE also touching the cap,
//   V-SAFETY without the repair, ALONE combining everything, the combined decision mutating the brain's, a null advisor not tolerated, the mode unchecked in advised(), FIELDS short one.
//   the seat: the advisor skipped in ALONE, handed a copy of the observation, called before the brain; STALE off by one, not silent, prompt, 20 s; the stats counting every tick, missing from the pilot.
//   the constants: audit A moved by a seed, the reserved seeds overlapping an audit, an audit that is a training set; GUARDED swapped for the OBS rule, GUARDED-FILTER with another alpha.
//   Two went 0 red on the first pass and each led to a change: (1) `mode === "ALONE" ||` in combine was dead (ALONE is no branch below it, so it falls through to the brain's decision anyway): DELETED, and the gate's ALONE rows now hold it. (2) A swapped GUARDED advisor: the identity rows
//   built their own seats from needsTask instead of reading A.ADVISORS, so the module's advisors were never flown: they read A.ADVISORS now.
"use strict";
import fs from "node:fs";
import * as T from "./needsTask.mjs";
import * as A from "./advisorChip.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = JSON.stringify;
console.log("advisorChip-selfcheck -- the advisor chip\n");

sec("1. THE CONSTANTS");
{
    const seedsOf = (set) => new Set(set.map((sc) => sc.seed));
    const others = { train: T.TRAIN_SET, trainSmall: T.TRAIN_SMALL_SET, heldOut: T.HELD_OUT_SET, pool: T.POOL_SET, audit: T.AUDIT_SET, audit2: T.AUDIT2_SET, reserve: T.RESERVE_SET, baseline: T.BASELINE_SET };
    const used = new Set(Object.values(others).flatMap((s) => [...seedsOf(s)]));
    const mine = A.ADV_AUDIT_NAMES.flatMap((k) => [...seedsOf(A.ADV_AUDITS[k])]);
    const llm = A.RESERVED_LLM.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i));
    ok("!! the modes are pinned (ALONE, VETO, the four one-field modes, STALE) and the one-field modes are the four that VETO is made of", J(A.MODES) === J(["ALONE", "VETO", "V-SURFACE", "V-CAP", "V-SAFETY", "V-STATION", "STALE"]) && J(A.FIELD_MODES) === J(["V-SURFACE", "V-CAP", "V-SAFETY", "V-STATION"]) && J(A.FIELDS) === J(["surface", "station", "cap", "pump", "repair"]) && Object.isFrozen(A.MODES));
    ok("!! the stale delay is 30 s, which is 900 ticks at the task's 1/30 s", A.STALE_SECONDS === 30 && A.STALE_TICKS === 900 && T.DT === 1 / 30);
    ok("!! the three audits are the registered seeds 111-122, 131-142 and 151-162, four kinds each (plain, deep, far, both), 48 dives each, in the registered kinds", J(A.ADV_SEEDS) === J([[111, 122], [131, 142], [151, 162]]) && A.ADV_AUDIT_NAMES.every((k) => A.ADV_AUDITS[k].length === 48 && J([...new Set(A.ADV_AUDITS[k].map((sc) => sc.kind))].sort()) === J(["both", "deep", "far", "plain"])) && J([...seedsOf(A.ADV_AUDITS.A)].sort((a, b) => a - b)) === J(Array.from({ length: 12 }, (_, i) => 111 + i)));
    ok("!! the audits share no seed with any set another round reads (train, train-small, held-out, pool, the three Round 3 audits, the baseline set) and none with each other; the language-model seeds (171-222) are reserved apart from all of them", mine.length === 36 && mine.every((s) => !used.has(s)) && new Set(mine).size === 36 && llm.length === 36 && llm.every((s) => !used.has(s) && !mine.includes(s)) && J(A.RESERVED_LLM) === J([[171, 182], [191, 202], [211, 222]]));
    ok("!! the advisors are the two registered seats (GUARDED, GUARDED-FILTER) and each has its own pilot for the reference", J(Object.keys(A.ADVISORS)) === J(["GUARDED", "GUARDED-FILTER"]) && J(Object.keys(A.ADVISOR_PILOTS)) === J(["GUARDED", "GUARDED-FILTER"]) && A.ADVISOR_PILOTS.GUARDED === T.GUARDED && A.ADVISOR_PILOTS["GUARDED-FILTER"] === T.GUARDED_FILTER);
}

sec("2. COMBINE (hand-worked)");
{
    const r = { collapseDepth: 60, frac: 0.5, depth: 10 };
    const S1 = Object.freeze({ x: 10, y: 0, depth: 20, visited: false }), S2 = Object.freeze({ x: 0, y: 30, depth: 30, visited: false });
    const obs = Object.freeze({ r, t: 0, stations: Object.freeze([S1, S2]) });
    const c0 = Object.freeze({ surface: false, station: S1, cap: 0.9, pump: false, repair: false });
    const a0 = Object.freeze({ surface: true, station: S2, cap: 0.8, pump: true, repair: true });
    const v = A.combine("VETO", c0, a0, obs);
    ok("!! VETO takes the advisor's surface, pump and repair and the smaller cap, and keeps the brain's usable station", v.surface === true && v.pump === true && v.repair === true && v.cap === 0.8 && v.station === S1);
    const quiet = Object.freeze({ surface: false, station: S2, cap: 0.95, pump: false, repair: false }), loud = Object.freeze({ surface: true, station: S1, cap: 0.7, pump: true, repair: true });
    const v2 = A.combine("VETO", loud, quiet, obs);
    ok("!! VETO never removes what the brain asked for: a brain that surfaces, pumps and repairs, with a cap of 0.7, keeps all of it against a quiet advisor with a looser cap", v2.surface === true && v2.pump === true && v2.repair === true && v2.cap === 0.7 && v2.station === S1);
    const visited = Object.freeze({ x: 5, y: 5, depth: 10, visited: true }), deep = Object.freeze({ x: 5, y: 5, depth: 58, visited: false }), edge = Object.freeze({ x: 5, y: 5, depth: 57.5, visited: false });
    const cv = (st) => ({ ...c0, station: st });
    ok("!! VETO replaces the brain's station with the advisor's only when it is visited, infeasible (58 m for a 60 m hull: the limit is 57.5 m) or missing; the limit itself is feasible", A.combine("VETO", cv(visited), a0, obs).station === S2 && A.combine("VETO", cv(deep), a0, obs).station === S2 && A.combine("VETO", cv(null), a0, obs).station === S2 && A.combine("VETO", cv(edge), a0, obs).station === edge && A.combine("VETO", cv(visited), { ...a0, station: null }, obs).station === null);
    const fields = ["surface", "cap", "pump", "repair", "station"];
    const only = (mode, ...changed) => { const d = A.combine(mode, cv(visited), a0, obs); return fields.every((f) => (changed.includes(f) ? d[f] !== cv(visited)[f] : d[f] === cv(visited)[f])); };
    ok("!! each one-field mode changes ONLY its field: V-SURFACE the surface, V-CAP the cap, V-SAFETY the pump and the repair, V-STATION the station (a visited brain station is replaced)", only("V-SURFACE", "surface") && only("V-CAP", "cap") && only("V-SAFETY", "pump", "repair") && only("V-STATION", "station"));
    const al = A.combine("ALONE", c0, a0, obs), sl = A.combine("VETO", c0, null, obs), st = A.combine("STALE", c0, a0, obs);
    ok("!! ALONE and a silent advisor (null) return the brain's decision (a copy: not the same object); STALE combines exactly as VETO does", J(al) === J(c0) && al !== c0 && J(sl) === J(c0) && sl !== c0 && J(st) === J(v));
    ok("!! nothing is mutated (frozen inputs would throw in strict mode) and a bad mode throws, naming the modes", /ALONE, VETO/.test(throws(() => A.combine("LOUD", c0, a0, obs)) || "") && /ALONE, VETO/.test(throws(() => A.advised(() => () => c0, null, "LOUD")) || ""));
}

sec("3. FEASIBLE agrees with the task's own test");
{
    const stationsAt = (ds) => ds.map((d, i) => ({ x: 10 * (i + 1), y: 0, depth: d, visited: false }));
    const st = { pos: [0, 0, -10] };
    const agree = [40, 56, 57.4, 57.5, 57.6, 58, 59].every((d) => { for (const col of [60, 45, 30]) { const r = { collapseDepth: col }, q = stationsAt([d])[0], got = T.nearestFeasible(st, { r, stations: [q] }); if ((got !== null) !== A.feasible(q, r)) return false; } return true; });
    ok("!! the spelled-again feasibility test agrees with needsTask.nearestFeasible for stations from 40 to 59 m on hulls with collapse depths of 60, 45 and 30 m (the boundary 0.9 x collapse + 3.5 m included)", agree);
}

sec("4. THE SEAT (spies)");
{
    const r = { collapseDepth: 60, frac: 0.5, depth: 10 }, S1 = { x: 1, y: 1, depth: 20, visited: false };
    const dec = (surface, cap = 0.9) => ({ surface, station: S1, cap, pump: false, repair: false });
    const mkObs = (i) => ({ r, t: i / 30, stations: [S1], i });
    for (const mode of A.MODES) {
        const calls = [];
        const brain = () => (st, obs) => { calls.push(["b", st, obs]); return dec(false); }, adv = () => (st, obs) => { calls.push(["a", st, obs]); return dec(true, 0.5); };
        const seat = A.advised(brain, adv, mode, { staleSeconds: 0.1 })({}); const sts = [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]; const os = sts.map((_, i) => mkObs(i));
        sts.forEach((s, i) => seat(s, os[i]));
        const pairs = calls.reduce((m, c, i) => { if (i % 2 === 0) m.push([c, calls[i + 1]]); return m; }, []);
        ok(`  ${mode}: both seats are called every tick (6 of each), brain first, with the IDENTICAL state and observation objects the caller passed`, calls.length === 12 && pairs.every(([b, a], i) => b[0] === "b" && a[0] === "a" && b[1] === sts[i] && a[1] === sts[i] && b[2] === os[i] && a[2] === os[i]));
    }
    // STALE: the advisor says surface only on its tick 0, the delay is 3 ticks (0.1 s at 1/30): the decision of tick 0 is used on tick 3 and the silence covers ticks 0-2
    let k = 0; const brain = () => () => dec(false), adv = () => () => dec(k++ === 0, 0.5);
    const seat = A.advised(brain, adv, "STALE", { staleSeconds: 0.1 })({}), out = Array.from({ length: 7 }, (_, i) => seat({}, mkObs(i)));
    ok("!! STALE is silent for the delay and then repeats the advisor's decision from 3 ticks (0.1 s) earlier: the advisor's one 'surface' at tick 0 shows at tick 3 only, and its cap of 0.5 is used from tick 3 on", J(out.map((d) => d.surface)) === J([false, false, false, true, false, false, false]) && J(out.map((d) => d.cap)) === J([0.9, 0.9, 0.9, 0.5, 0.5, 0.5, 0.5]));
    let k2 = 0; const adv2 = () => () => dec(k2++ === 0, 0.5);
    const seat2 = A.advised(brain, adv2, "VETO")({}), o2 = Array.from({ length: 3 }, (_, i) => seat2({}, mkObs(i)));
    ok("!! VETO is prompt (the surface of tick 0 shows at tick 0) and the default delay of STALE is the registered 30 s", o2[0].surface === true && o2[1].surface === false && A.STALE_TICKS === 900);
    // the stats
    const brain3 = () => () => dec(false), adv3 = () => (st, obs) => ({ surface: obs.i % 2 === 0, station: S1, cap: obs.i < 2 ? 0.5 : 0.95, pump: obs.i === 0, repair: false });
    const s3 = A.advised(brain3, adv3, "VETO")({}); for (let i = 0; i < 4; i++) s3({}, mkObs(i)); const sx = s3.stats;
    ok("!! the stats count the ticks and, per field, the ticks on which the combined decision differed from the brain's: surface 2 of 4, cap 2, pump 1, repair 0, station 0", sx.ticks === 4 && sx.surface === 2 && sx.cap === 2 && sx.pump === 1 && sx.repair === 0 && sx.station === 0, J(sx));
}

sec("5. THE DIVES (real flights, 4 baseline dives)");
{
    const dives = [["far", 503, T.GAUGE], ["both", 501, T.GAUGE], ["deep", 502, null], ["plain", 501, T.GAUGE]].map(([kind, seed, gauge]) => ({ sc: T.scenario(seed, kind), gauge }));
    const flyAll = (factory) => dives.map(({ sc, gauge }) => T.fly(factory, sc, { gauge }));
    const same = (A1, B1) => A1.every((x, i) => x.fingerprint === B1[i].fingerprint && x.score === B1[i].score);
    const guardedSeat = A.ADVISORS.GUARDED, obsSeat = T.ruleSeat("obs"), filterSeat = A.ADVISORS["GUARDED-FILTER"];   // the advisors are read from the module under test, so a swapped rule there is a different pilot here
    const base = flyAll(T.GUARDED_OBS);
    // an advisor that is the brain itself: a second copy of the same seat, stepped on the same observations, returns the same decision
    ok("!! ALONE over GUARDED-OBS is GUARDED-OBS (fingerprints and scores, 4 dives); a null advisor in VETO is too; an advisor that is a second copy of the brain changes nothing", same(flyAll(A.advisedPilot(obsSeat, guardedSeat, "ALONE")), base) && same(flyAll(A.advisedPilot(obsSeat, null, "VETO")), base) && same(flyAll(A.advisedPilot(obsSeat, obsSeat, "VETO")), base));
    ok("!! GUARDED advised by GUARDED is GUARDED, and GUARDED-FILTER advised by itself is GUARDED-FILTER (the registered identity)", same(flyAll(A.advisedPilot(guardedSeat, guardedSeat, "VETO")), flyAll(T.GUARDED)) && same(flyAll(A.advisedPilot(filterSeat, filterSeat, "VETO")), flyAll(T.GUARDED_FILTER)));
    const vetoed = flyAll(A.advisedPilot(obsSeat, guardedSeat, "VETO"));
    ok("!! a different advisor is not the identity: GUARDED-OBS vetoed by GUARDED (on the noisy gauge, where GUARDED chatters) is NOT GUARDED-OBS on the 4 dives, and its stats show GUARDED overriding the surface decision at least once", !same(vetoed, base) && (() => { let p = null; T.fly((ctx) => (p = A.advisedPilot(obsSeat, guardedSeat, "VETO")(ctx)), dives[1].sc, { gauge: T.GAUGE }); return p.stats.ticks > 1000 && p.stats.surface > 0; })());
    ok("  the one-field modes and STALE run end to end on a dive and return a score in [0, 1]", ["V-SURFACE", "V-CAP", "V-SAFETY", "V-STATION", "STALE"].every((m) => { const x = T.fly(A.advisedPilot(obsSeat, guardedSeat, m), dives[0].sc, { gauge: T.GAUGE }); return x.score >= 0 && x.score <= 1; }));
}

sec("6. THE SOURCE");
{
    const src = fs.readFileSync(new URL("./advisorChip.mjs", import.meta.url), "utf8"), code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! the audit seeds are written in ONE place (ADV_AUDITS and ADV_SEEDS) and the file reads none of Round 3's audit sets or the training sets", (code.match(/T\.setOf\(/g) || []).length === 3 && !/AUDIT_SET|AUDIT2_SET|RESERVE_SET|POOL_SET|HELD_OUT_SET|TRAIN_SET|TRAIN_SMALL_SET|BASELINE_SET/.test(code));
    ok("!! the file reads no clock and no random number, and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
