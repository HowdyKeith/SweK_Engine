// WebGLEngine/render/subAquariumCircuit-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subAquariumCircuit-selfcheck.mjs      (about 10 s)
//
// THE GATE OF render/subAquariumCircuit.mjs and render/subAquariumCircuitWeights.mjs: the decision circuit as a survey profile of the Sub Aquarium (Keith, 2026-11-07). The wiring through the tank (setSurvey, the snapshot, the page) is held by render/subAquariumEvents-selfcheck.mjs.
//   1  THE WEIGHTS   the generated file holds the plain-net champion of the decision-circuit round NUMBER FOR NUMBER (brain/decisionCircuitTraining.jsonl, family plain, k 2, seed 96522), the digest c916e7f5 (the committed digest of the audits' `circuit-plain`), 2,443 weights = the net's weight count at 84 hidden units, and they are frozen.
//   2  THE PROFILES  the two names, in order, and the test of a name: the planner profiles of brain/surveySeat.mjs, a wrong case, an empty name and no name are not circuit profiles.
//   3  THE SEATS     `rule` decides exactly as the tuned rule at the survey seat's constants (brain/tunedRule.mjs) on a grid of 64 observations; `circuit` exactly as the plain net seated over the champion's weights, and differs from the rule on some of them (so it is the net and not the rule in disguise); an unknown name is refused by its words.
//   4  THE AUDIT'S SEAT   a real dive of the task flown by the circuit profile's seat IS the dive the audits flew for `circuit-plain` (the same score and fingerprint, three scenarios), and the rule profile's the dive of `rule-low06`.
//   5  BROWSER-LIGHT the module and its weights import nothing from node: and read no file.
// NOT CHECKED, said plainly: that the tank's dynamics make the net's decisions good (they are not the task's dynamics: the page says so); the looks of the page.
//
// SABOTAGE LOG (2026-11-07), render/subAquariumCircuit.mjs and render/subAquariumCircuitWeights.mjs -- 16 mutants: 4 mechanical and 8 by hand of the module (the rule profile returning the circuit's seat, the circuit profile the untrained net, `standard` counted as a circuit profile, the weight-count refusal removed, the names in another order, the rule seat on the default bounds, the policy rebuilt on every call, the unknown-profile message without the names) and 4 by hand of the weights (the digest, the hidden width, ONE weight's last digit, the champion's k),
// each applied to an isolated tree and this gate run; the files restored. FIRST PASS: 9 red, 4 threw, 3 went 0 red. THE THREE: the weight-count refusal could not be provoked (the weights are right) -- `circuitSeat` now takes the champion as a seam and the gate hands it 2 weights; the policy cache was untested -- identity row; the rule seat on the default bounds is EQUIVALENT for these constants (they lie inside both the default and the wide bounds, which a row now states: the normalised constants are equal).
// SECOND PASS (with the seam): the two fixed and a mutant of the seam itself (the generated champion always used): 3 red; 1 remains, the bounds one, argued above.
"use strict";
import fs from "node:fs";
import * as T from "../brain/needsTask.mjs";
import * as U from "../brain/tunedRule.mjs";
import * as SV from "../brain/surveySeat.mjs";
import * as CS from "../brain/circuitSeat.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as D from "../tools/ship/trainDecisionCircuit.mjs";
import { digestOf } from "../tools/ship/takeDecisionCircuit.mjs";
import * as C from "./subAquariumCircuit.mjs";
import * as W from "./subAquariumCircuitWeights.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, msg = (f) => { try { f(); return null; } catch (e) { return e.message; } };
console.log("subAquariumCircuit-selfcheck -- the decision circuit as a survey profile of the Sub Aquarium\n");

const M = T.model();
const stateAt = (x, y, depth) => { const s = S.createState({ depth, speed: 2, heading: 0, model: M }); s.pos[0] = x; s.pos[1] = y; return { ...s, tank: S.initialTank(M) }; };
const q = (x, y, depth, visited = false) => ({ x, y, depth, visited });
const obsOf = (o = {}) => ({ t: 0, stations: [q(50, 0, 20)], ...o, r: { frac: 0.8, depth: 20, flood: 0, damage: 0, collapseDepth: 60, ...(o.r || {}) } });
const ctxOf = () => ({ model: M, read: () => { throw new Error("the seat must not read the true state"); } });
const grid = [];
for (const depth of [1, 10, 25, 45]) for (const frac of [0.12, 0.3, 0.45, 0.8]) for (const flood of [0, 0.02]) for (const damage of [0, 0.3]) grid.push({ st: stateAt(0, 0, depth), obs: obsOf({ t: 100, r: { frac, depth, flood, damage }, stations: [q(50, 0, 20), q(100, 40, 25), q(150, -30, 15)] }) });
const same = (a, b) => a.surface === b.surface && a.cap === b.cap && a.pump === b.pump && a.repair === b.repair && a.station === b.station;
// a seat is built once per dive and called in order; the grid is walked in order for each seat, as a dive would

sec("1. THE WEIGHTS");
{
    const recs = fs.readFileSync(new URL("../brain/decisionCircuitTraining.jsonl", import.meta.url), "utf8").trim().split("\n").map((l) => JSON.parse(l)), file = D.championOf(recs, "plain").record, w = W.PLAIN_CHAMPION;
    ok("!! the generated weights are the committed plain champion NUMBER FOR NUMBER (family plain, k 2, seed 96522; 2,443 of them), their digest is c916e7f5 (the audits' circuit-plain) and the file's champion is that search", file.index === 2 && file.seed === 96522 && w.family === "plain" && w.k === 2 && w.seed === 96522 && w.digest === "c916e7f5" && w.weights.length === 2443 && file.weights.length === 2443 && w.weights.every((v, i) => v === file.weights[i]) && digestOf(w.weights) === "c916e7f5");
    ok("!! the net they go into takes exactly that many weights (84 hidden units: 21 x 84 + 84 + 7 x 84 + 7 = 2,443), and the weights and the record are frozen", w.hidden === 84 && C.plainPolicy().WEIGHT_COUNT === 2443 && C.plainPolicy().hidden === 84 && Object.isFrozen(w) && Object.isFrozen(w.weights) && C.PLAIN_CHAMPION === w);
    ok("!! the champion is not the untrained net: some readout weight is not zero (the readout started at zero)", Array.from(w.weights).slice(C.plainPolicy().offsets.W2).some((v) => v !== 0));
}

sec("2. THE PROFILES");
{
    ok("!! the two names in order: rule, circuit; both are circuit profiles, the planner profiles (standard, events, wide, ensemble) are not, nor is a wrong case, an empty name, nothing", J(C.CIRCUIT_PROFILE_NAMES) === J(["rule", "circuit"]) && Object.isFrozen(C.CIRCUIT_PROFILE_NAMES) && C.isCircuitProfile("rule") && C.isCircuitProfile("circuit") && ["standard", "events", "wide", "ensemble", "Rule", "CIRCUIT", "", undefined, null, "circuit "].every((p) => !C.isCircuitProfile(p)) && SV.PROFILE_NAMES.every((p) => !C.isCircuitProfile(p)));
}

sec("3. THE SEATS");
{
    const walk = (seat) => grid.map(({ st, obs }) => seat(st, obs)), ruleRef = walk(U.tunedSeat(SV.SURVEY_CONSTANTS, U.WIDE_BOUNDS)(ctxOf()));
    const rule = walk(C.circuitSeat("rule")(ctxOf())), circuit = walk(C.circuitSeat("circuit")(ctxOf()));
    const Pol = CS.createPlainPolicy(84, "plain"), netRef = walk(Pol.seatFor(Float32Array.from(W.PLAIN_CHAMPION.weights))(ctxOf())), untrained = walk(Pol.seatFor(Pol.handWeights())(ctxOf()));
    ok(`!! the rule profile decides exactly as the tuned rule at the survey seat's constants on all ${grid.length} observations of a grid walked in order (surfacing, cap, pump, repair and the station)`, grid.length === 64 && rule.every((d, i) => same(d, ruleRef[i])));
    ok("!! the circuit profile decides exactly as the plain net over the champion's weights on the same grid, and the UNTRAINED net would decide as the rule on all of them (so the grid sees the net)", circuit.every((d, i) => same(d, netRef[i])) && untrained.every((d, i) => same(d, ruleRef[i])));
    const differ = circuit.filter((d, i) => !same(d, ruleRef[i])).length;
    ok("!! the circuit is the net and not the rule in disguise: it differs from the rule on some of the 64 observations (the cap residual moves the cap on every one of them: it is the rule plus what the training moved)", differ >= 1, "differs on " + differ);
    ok("!! every call of circuitSeat makes a seat of its own (two dives do not share a seat factory)", C.circuitSeat("circuit") !== C.circuitSeat("circuit") && C.circuitSeat("rule") !== C.circuitSeat("rule"));
    ok("!! an unknown profile is refused by its words naming the circuit profiles (a planner profile, a wrong case and nothing included)", msg(() => C.circuitSeat("standard")) === 'subAquariumCircuit.circuitSeat: unknown circuit profile "standard" (rule, circuit)' && msg(() => C.circuitSeat("Circuit")) === 'subAquariumCircuit.circuitSeat: unknown circuit profile "Circuit" (rule, circuit)' && msg(() => C.circuitSeat()) === "subAquariumCircuit.circuitSeat: unknown circuit profile undefined (rule, circuit)");
    ok("!! the policy is built once and shared (it is a pure function of its width), and a champion whose weights do not fit the net is refused by its words (2 weights against 2,443); the weights given are the ones used (the untrained net's weights seat the rule's decisions)", C.plainPolicy() === C.plainPolicy() && msg(() => C.circuitSeat("circuit", { ...W.PLAIN_CHAMPION, weights: [0.1, 0.2] })) === "subAquariumCircuit.circuitSeat: the champion has 2 weights and its net takes 2443" && (() => { const seat = C.circuitSeat("circuit", { ...W.PLAIN_CHAMPION, weights: Array.from(C.plainPolicy().handWeights()) })(ctxOf()); return grid.every(({ st, obs }, i) => same(seat(st, obs), ruleRef[i])); })());
    ok("!! the rule profile does not depend on which bounds the rule is normalised against, for the survey constants (they lie inside both the default and the wide bounds), so `U.WIDE_BOUNDS` is the task's choice and not a hidden one", J(U.normalise(SV.SURVEY_CONSTANTS, U.BOUNDS)) === J(U.normalise(SV.SURVEY_CONSTANTS, U.WIDE_BOUNDS)));
    const a = C.circuitSeat("circuit")(ctxOf()), b = C.circuitSeat("circuit")(ctxOf());
    const wa = grid.map(({ st, obs }) => a(st, obs)), wb = grid.map(({ st, obs }, i) => (i === 0 ? b(st, { ...obs, r: { ...obs.r, frac: 0.1 } }) : b(st, obs)));
    ok("!! two seats of one profile are independent dives: feeding one a different first reading (a low charge) leaves the other's decisions as they were (the rule's filter of the gauge is per seat)", wa.every((d, i) => same(d, netRef[i])) && wb.some((d, i) => !same(d, netRef[i])));
}

sec("4. THE SEAT THE AUDITS FLEW");
{
    const w = Float32Array.from(W.PLAIN_CHAMPION.weights), planned = D.familyPolicy("plain"), gauge = T.GAUGE, scenarios = [T.scenario(18001, "far"), T.scenario(18002, "both"), T.scenario(7, "plain")].map((s) => s);
    const flown = (seatOf, sc) => { const r = T.fly(T.flyDecision(seatOf), sc, { gauge, seconds: 200 }); return [r.score, r.fingerprint]; };
    const rows = scenarios.map((sc) => ({ c: flown(C.circuitSeat("circuit"), sc), a: (() => { const r = T.fly(planned.pilotFor(w), sc, { gauge, seconds: 200 }); return [r.score, r.fingerprint]; })(), r: flown(C.circuitSeat("rule"), sc), l: flown(U.tunedSeat(SV.SURVEY_CONSTANTS, U.WIDE_BOUNDS), sc) }));
    ok("!! three real dives of the task (seeds of the DEV and spare ranges, 200 s): the circuit profile's seat gives the dive of the audited circuit-plain pilot (the same score and fingerprint), and the rule profile's the dive of the tuned rule's seat", rows.every((x) => J(x.c) === J(x.a) && J(x.r) === J(x.l)));
    ok("!! and the trained net is a different pilot from the rule on at least one of the three dives (the net acts)", rows.some((x) => J(x.c) !== J(x.r)));
}

sec("5. BROWSER-LIGHT");
{
    const read = (u) => fs.readFileSync(new URL(u, import.meta.url), "utf8"), code = (s) => s.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! neither file imports from node: or reads a file, a clock or Math.random; the module imports only the brain modules and the weights", [read("./subAquariumCircuit.mjs"), read("./subAquariumCircuitWeights.mjs")].every((s) => !/node:|require\(|fs\.|process\.|Date\.now|Math\.random/.test(code(s))) && (code(read("./subAquariumCircuit.mjs")).match(/^import .* from "[^"]+";/gm) || []).every((l) => /from "(\.\.\/brain\/|\.\/subAquariumCircuitWeights)/.test(l)));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exit(fails ? 1 : 0);
