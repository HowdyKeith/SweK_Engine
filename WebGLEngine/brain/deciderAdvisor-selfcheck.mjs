// WebGLEngine/brain/deciderAdvisor-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/deciderAdvisor-selfcheck.mjs
//
// THE GATE OF brain/deciderAdvisor.mjs, the Decider chip registered in brain/NEEDS_AND_LIMITS.md "Round 14" (written first). Hand-worked fixtures for every field and branch of the thresholded mapping, the state the model sees, the
// record/replay transcript, and real dives for the identities the registration asks for.
//   1  CONSTANTS   the thresholds, the cap levels, the neutral cap above the brain's; the three sets DISJOINT from every set any other round reads.
//   2  DECIDE      each field at, below and above tau; the best option of a choice; "none"; the station resolved against the CURRENT observation; invalid answers neutral and counted; tau above 1 advises nothing; inputs not mutated.
//   3  THE STATE   the model sees the pilot's observation and nothing else: no seed, kind, `unreachable`, true charge or comparator name, in any of the four kinds; deterministic; the questions offer only unvisited stations.
//   4  TRANSCRIPT  record then replay gives the same decisions with NO model call; a miss refuses; tau is applied at replay (one recording, two thresholds); asked every 600 ticks and held; a forged key, a foreign header, the same key twice are refused.
//   5  THE DIVES   (real flights) a silent decider is ALONE bit for bit, tau above 1 is ALONE, and a decider that says "surface" changes the dive; GUARDED-FILTER advised by a decider that answers its decision is itself.
// NOT CHECKED, said plainly: that a Decider-advised pilot scores better (that is the experiment); any real model (none was run).
//
// SABOTAGE LOG (34 mutants of brain/deciderAdvisor.mjs, each run against a copy of this gate; every one red BY NAME):
//   the mapping: tau > instead of >=, a choice that ignores tau, the neutral cap 0.9 / 0.5, an invalid answer counted valid / not counted, a Noul with no `yes` key, probabilities not range-checked, any label allowed, "none" resolved to station 0, the station a copy, visited stations offered, the cap an argmin, surface read from the pump question, the answers mutated.
//   the seat: asking every tick, a replay that invents on a miss, tau folded into the transcript key, the held answers dropped between asks, the invalid count dropped.
//   the transcript: a forged key, the same key twice, a foreign header, another schema accepted; tau not validated; record without a model function.
//   the state: the kind, `unreachable`, the true energy leaked into the prompt, the gauge shown to three decimals.
//   the constants: the sets moved onto Round 5's reserved seeds and onto Round 13's, a threshold and the cap levels changed; Math.random in the module.
//   Five went 0 red on the first pass and each led to a change in the GATE: the three leaks and the gauge rounding were untestable because the test observations never carried the fields (now one observation carries them all), and the "held answers" mutant was placed where it could not run. One real defect in the MODULE was found by writing the gate: the invalid count was taken on `n % every === 1`, which is never true at every = 1.
"use strict";
import fs from "node:fs";
import * as T from "./needsTask.mjs";
import * as A from "./advisorChip.mjs";
import * as D from "./deciderAdvisor.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = JSON.stringify;
console.log("deciderAdvisor-selfcheck -- the Decider chip\n");

// a hand-built observation: three stations, station 1 visited
const st0 = T.fly ? null : null;
const sc0 = T.scenario(7, "both");
const mkObs = (over = {}) => ({ t: 100, stations: sc0.stations.map((q, i) => ({ x: q.x, y: q.y, depth: q.depth, visited: i === 1 })), r: { depth: 20, frac: 0.5, strain: 0.4, damage: 0.2, flood: 0, collapseDepth: 50, ...over } });
const stateAt = (S) => ({ pos: [0, 0, -20], q: [1, 0, 0, 0], ...S });
import * as S6 from "../physics/mechanics/subModel6dof.mjs";
const st = { ...S6.createState({ depth: 20, speed: 2, model: T.model() }), tank: S6.initialTank(T.model()) };
const obs = mkObs();
const yes = (p) => ({ probs: { yes: p, no: 1 - p } });
const answers = (o = {}) => ({ surface: yes(0.1), pump: yes(0.1), repair: yes(0.1), cap: { probs: { "0.5": 0.1, "0.6": 0.1, "0.7": 0.1, "0.8": 0.1, "0.9": 0.6 } }, station: { probs: { "0": 0.7, "2": 0.2, none: 0.1 } }, ...o });

sec("1. THE CONSTANTS");
{
    ok("the registered thresholds are 0.50 and 0.80", D.TAUS.T50 === 0.5 && D.TAUS.T80 === 0.8);
    ok("the cap levels are 0.5..0.9 and the neutral cap is ABOVE the brain's HULL_DEPTH (min(brain, advisor) is then the brain's)", J(D.CAP_LEVELS) === "[0.5,0.6,0.7,0.8,0.9]" && D.NEUTRAL_CAP > T.HULL_DEPTH);
    const seeds = (set) => new Set(set.map((sc) => sc.seed)), mine = new Set(D.DECIDER_AUDITS.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i)));
    const others = { train: T.TRAIN_SET, trainSmall: T.TRAIN_SMALL_SET, heldOut: T.HELD_OUT_SET, pool: T.POOL_SET, audit: T.AUDIT_SET, audit2: T.AUDIT2_SET, reserve: T.RESERVE_SET, baseline: T.BASELINE_SET };
    for (const [n, a] of Object.entries(A.ADV_AUDITS)) others["adv" + n] = a;
    const clash = [];
    for (const [n, set] of Object.entries(others)) for (const sd of seeds(set)) if (mine.has(sd)) clash.push(n + ":" + sd);
    for (const [a, b] of [...A.ADV_SEEDS, ...A.RESERVED_LLM]) for (let k = a; k <= b; k++) if (mine.has(k)) clash.push("range:" + k);
    ok("!! the three sets (1301-1312, 1321-1332, 1341-1352; 36 seeds) overlap no set any other round reads", mine.size === 36 && clash.length === 0, clash.slice(0, 4).join(" ") || "disjoint");
    ok("...and Round 13's V1/V2 (1101-1208) are not among them", ![...mine].some((k) => k >= 1101 && k <= 1208));
}

sec("2. DECIDE: the thresholded mapping");
{
    const at = (tau, a) => D.decide(a, obs, tau);
    const base = at(0.5, answers());
    ok("a Noul below tau is NOT advised, a cap/station at its best option over tau IS", base.decision.surface === false && base.decision.pump === false && base.decision.cap === 0.9 && base.decision.station === obs.stations[0], J({ cap: base.decision.cap }));
    ok("!! a Noul AT tau is advised (>=), just under is not", at(0.5, answers({ surface: yes(0.5) })).decision.surface === true && at(0.5, answers({ surface: yes(0.4999) })).decision.surface === false);
    ok("surface, pump and repair are advised independently", J(["surface", "pump", "repair"].map((f) => at(0.5, answers({ [f]: yes(0.9) })).decision).map((d) => [d.surface, d.pump, d.repair])) === J([[true, false, false], [false, true, false], [false, false, true]]));
    ok("!! a choice below tau is NEUTRAL (cap 0.95, station null), not the best guess", (() => { const d = at(0.8, answers()).decision; return d.cap === D.NEUTRAL_CAP && d.station === null; })());
    ok("the cap is the best option's level; ties take the first", at(0.3, answers({ cap: { probs: { "0.5": 0.4, "0.6": 0.4 } } })).decision.cap === 0.5 && at(0.3, answers({ cap: { probs: { "0.7": 0.9 } } })).decision.cap === 0.7);
    ok("the station 'none' is null, and an index is the CURRENT observation's object (not a copy)", at(0.5, answers({ station: { probs: { none: 0.9 } } })).decision.station === null && at(0.5, answers({ station: { probs: { "2": 0.9 } } })).decision.station === obs.stations[2]);
    const bad = [undefined, null, {}, { probs: null }, { probs: {} }, { probs: { yes: 1.5 } }, { probs: { maybe: 0.9 } }, { probs: { no: 0.9 } }, { probs: { yes: "0.9" } }];
    ok("!! a missing or malformed Noul answer is neutral AND counted, in every malformed shape", bad.every((b) => { const r = at(0.5, answers({ surface: b })); return r.decision.surface === false && r.invalid === 1; }), bad.length + " shapes");
    ok("...a choice naming an option that was never offered (station 1 is visited; cap 0.95) is invalid, not guessed at", at(0.5, answers({ station: { probs: { "1": 0.9 } } })).invalid === 1 && at(0.5, answers({ cap: { probs: { "0.95": 0.9 } } })).invalid === 1);
    const all = D.decide(answers({ surface: yes(0.99), pump: yes(0.99), repair: yes(0.99) }), obs, 1.5);
    ok("!! tau above 1 advises nothing at all: the neutral decision", J({ ...all.decision, station: null }) === J({ surface: false, station: null, cap: D.NEUTRAL_CAP, pump: false, repair: false }) && all.decision.station === null);
    const a0 = answers(), c = J(a0), o0 = J(obs); D.decide(a0, obs, 0.5);
    ok("the answers and the observation are not mutated", J(a0) === c && J(obs) === o0);
    ok("a null answer set is all neutral, five questions invalid", D.decide(null, obs, 0.5).invalid === 5);
    ok("!! invalidQuestions counts exactly the questions with no valid answer, on the questions as a prompt carries them", D.invalidQuestions(answers(), D.questionsOf(obs)) === 0 && D.invalidQuestions(answers({ surface: null, cap: {} }), D.questionsOf(obs)) === 2 && D.invalidQuestions(null, D.questionsOf(obs)) === 5);
}

sec("3. THE STATE: what the model sees");
{
    const leak = /seed|kind|unreachable|GUARDED|RULE|ALONE|energy|capacityJ|reachable|scenario/i;
    let leaks = [];
    for (const kind of T.KINDS) {
        const sc = T.scenario(1301, kind), f = (ctx) => { const p = (s, o) => { if (o.t === 0) leaks.push(D.promptOf(s, o)); return {}; }; return p; };
        T.fly(f, sc, { seconds: 1, gauge: T.GAUGE });
    }
    ok("!! no prompt, in any of the four kinds, carries a seed, kind, `unreachable`, the true charge or a comparator's name", leaks.length === 4 && leaks.every((p) => !leak.test(p)) && leaks.every((p) => !/1301/.test(p)), leaks.length + " prompts scanned");
    ok("the prompt is deterministic and made of the observation: the same (st, obs) is the same text; another gauge reading is another text", D.promptOf(st, obs) === D.promptOf(st, mkObs()) && D.promptOf(st, obs) !== D.promptOf(st, mkObs({ frac: 0.51 })));
    const q = D.questionsOf(obs), station = q.find((x) => x.id === "station");
    ok("!! the station question offers the UNVISITED stations by index, and 'none' (station 1 is visited here)", J(station.options) === '["0","2","none"]');
    ok("the five questions, in order, with the registered types", J(q.map((x) => [x.id, x.type])) === J([["surface", "noul"], ["pump", "noul"], ["repair", "noul"], ["cap", "choice"], ["station", "choice"]]) && J(q.find((x) => x.id === "cap").options) === '["0.5","0.6","0.7","0.8","0.9"]');
    const loaded = { ...mkObs(), kind: "both", seed: 1301, stations: mkObs().stations.map((q) => ({ ...q, unreachable: true })), r: { ...mkObs().r, energy: 987654, energyJ: 987654, frac: 0.3749 } };
    ok("!! an observation that CARRIES scenario fields (kind, seed, `unreachable`, the energy in joules) still does not show them: the state is built from named fields, not spread from the observation", !/both|1301|unreachable|987654|kind|seed|energy/.test(D.promptOf(st, loaded)));
    ok("the gauge is shown to two decimals (0.3749 reads 0.37), as a person reads a dial", D.promptOf(st, loaded).includes('"charge_gauge":0.37,'));
    ok("the gauge reading is shown, not the true charge: the prompt carries the observation's frac", D.promptOf(st, mkObs({ frac: 0.37 })).includes('"charge_gauge":0.37'));
}

sec("4. THE TRANSCRIPT");
{
    const model = { id: "stub-decider", params: { n: 1 } };
    let called = 0; const stub = () => { called++; return answers({ surface: yes(0.9) }); };
    const tr = D.createTranscript({ model, every: 3 });
    const rec = D.deciderSeat({ transcript: tr, mode: "record", tau: 0.5, deciderFn: stub })();
    const ds = []; for (let i = 0; i < 7; i++) ds.push(rec(st, { ...obs, t: 100 + i }));
    ok("!! it asks once per `every` ticks (7 ticks at every 3 = 3 asks) and holds the answers between", rec.stats.asks === 3 && rec.stats.ticks === 7 && called === 3, J(rec.stats));
    ok("...the stats count what was advised: surface on all 7 ticks, the station on all 7", rec.stats.advised.surface === 7 && rec.stats.advised.station === 7 && rec.stats.advised.pump === 0);
    called = 0;
    const rep = D.deciderSeat({ transcript: tr, mode: "replay", tau: 0.5 })(), ds2 = []; for (let i = 0; i < 7; i++) ds2.push(rep(st, { ...obs, t: 100 + i }));
    ok("!! a REPLAY gives the same decisions and makes NO model call (it has none to call)", J(ds2.map((d) => d.surface)) === J(ds.map((d) => d.surface)) && ds2.every((d, i) => d.cap === ds[i].cap) && called === 0 && rep.stats.hits === 3 && rep.stats.calls === 0);
    const hi = D.deciderSeat({ transcript: tr, mode: "replay", tau: 0.95 })()(st, { ...obs, t: 100 });
    ok("!! tau is applied at REPLAY: the one recording read at 0.95 advises nothing that it advised at 0.5", ds[0].surface === true && hi.surface === false && hi.cap === D.NEUTRAL_CAP);
    const miss = throws(() => D.deciderSeat({ transcript: tr, mode: "replay", tau: 0.5 })()(st, mkObs({ frac: 0.123 })));
    ok("a situation the transcript does not hold is a REFUSAL, not an invented answer", /no recorded answer/.test(miss || ""), miss);
    ok("record needs a model function, a mode must be one of two, tau must be positive", /deciderFn/.test(throws(() => D.deciderSeat({ transcript: tr, mode: "record", tau: 0.5 })) || "") && /mode/.test(throws(() => D.deciderSeat({ transcript: tr, mode: "x", tau: 0.5 })) || "") && /tau/.test(throws(() => D.deciderSeat({ transcript: tr, mode: "replay", tau: 0 })) || ""));
    const text = D.serialize(tr), back = D.parseTranscript(text);
    ok("serialize then parse round-trips the header and every entry", back.entries.size === tr.entries.size && J(back.header) === J(tr.header) && D.serialize(back) === text);
    const lines = text.split("\n").filter(Boolean), forged = JSON.parse(lines[1]); forged.prompt += " ";
    ok("!! a forged entry (the prompt edited, the key kept) is refused", /does not match its prompt/.test(throws(() => D.parseTranscript([lines[0], J(forged)].join("\n"))) || ""));
    ok("a foreign header and another schema are refused", /not a decider-transcript/.test(throws(() => D.parseTranscript(J({ kind: "advisor-transcript" }))) || "") && /schema/.test(throws(() => D.parseTranscript(J({ kind: "decider-transcript", schema: 9, model: model, every: 3 }))) || ""));
    const dup = JSON.parse(lines[1]); dup.reply = "{}";
    ok("the same key twice with different replies is refused", /twice with different replies/.test(throws(() => D.parseTranscript([lines[0], lines[1], J(dup)].join("\n"))) || ""));
    const junk = D.createTranscript({ model, every: 1 }), js = D.deciderSeat({ transcript: junk, mode: "record", tau: 0.5, deciderFn: () => "not a distribution" })();
    const d = js(st, obs);
    ok("!! a model that returns garbage makes every field neutral and is counted (5 invalid), never a crash", d.surface === false && d.cap === D.NEUTRAL_CAP && d.station === null && js.stats.invalid === 5, J(js.stats.invalid));
}

sec("5. THE DIVES (real flights, 150 s, noisy gauge)");
{
    const sets = T.KINDS.map((k) => T.scenario(1301, k)), opts = { seconds: 150, gauge: T.GAUGE };
    const brain = T.ruleSeat("obs");
    const same = (a, b) => a.score === b.score && a.fingerprint === b.fingerprint && a.status === b.status;
    const silentSeat = (tau) => (ctx) => { const tr = D.createTranscript({ model: { id: "silent" }, every: 600 }); return D.deciderSeat({ transcript: tr, mode: "record", tau, deciderFn: () => answers({ surface: yes(0.99) }) })(ctx); };
    const alone = sets.map((sc) => T.fly(A.advisedPilot(brain, null, "ALONE"), sc, opts));
    const tooHigh = sets.map((sc) => T.fly(A.advisedPilot(brain, silentSeat(1.5), "VETO"), sc, opts));
    ok("!! a decider whose every answer is below tau (tau 1.5) is ALONE bit for bit, on all four kinds", tooHigh.every((r, i) => same(r, alone[i])), alone.map((r) => r.score.toFixed(3)).join(" "));
    const surfacer = (ctx) => { const tr = D.createTranscript({ model: { id: "surf" }, every: 600 }); return D.deciderSeat({ transcript: tr, mode: "record", tau: 0.5, deciderFn: () => ({ ...answers(), surface: yes(0.99), station: { probs: { none: 1 } } }) })(ctx); };
    const up = sets.map((sc) => T.fly(A.advisedPilot(brain, surfacer, "VETO"), sc, opts));
    ok("!! a decider that says 'surface' with confidence CHANGES the dive (the seat has an effect, so the identity above is not vacuous)", up.some((r, i) => !same(r, alone[i])));
    const ruleDecider = (ctx) => { const inner = T.ruleSeat("obs", { alpha: T.FILTER_ALPHA })(ctx); return inner; };
    const gf = sets.map((sc) => T.fly(T.GUARDED_FILTER, sc, opts)), viaChip = sets.map((sc) => T.fly(A.advisedPilot(T.ruleSeat("obs", { alpha: T.FILTER_ALPHA }), ruleDecider, "VETO"), sc, opts));
    ok("(control) GUARDED-FILTER advised by itself is itself, flown through the same chip (the socket this seat plugs into is sound)", viaChip.every((r, i) => same(r, gf[i])));
}

sec("6. THE SOURCE");
{
    const src = fs.readFileSync(new URL("./deciderAdvisor.mjs", import.meta.url), "utf8");
    const sets = src.match(/\b13[0-9]{2}\b/g) || [];
    ok("the sets' seeds are written in ONE place (DECIDER_AUDITS) and nowhere else in the module", J([...new Set(sets)].sort()) === J(["1301", "1312", "1321", "1332", "1341", "1352"]) && sets.length === 6);
    ok("the module has no network, process, file, clock or Math.random (pure)", !/\b(fetch|require|child_process|readFileSync|writeFileSync|Date\.now|Math\.random|performance\.now)\b/.test(src.replace(/\/\/.*$/gm, "")));
}

finished = true;
console.log("\ndeciderAdvisor-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
