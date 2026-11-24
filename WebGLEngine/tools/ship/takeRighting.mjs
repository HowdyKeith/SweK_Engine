// WebGLEngine/tools/ship/takeRighting.mjs -- UNNUMBERED (the library is brain/subRighting.mjs, the registration brain/FISH_RIGHTING_WIP.md with Amendments A, B and C, the gate tools/ship/takeRighting-selfcheck.mjs)
//   node tools/ship/takeRighting.mjs [--set dev|registered] [--seeds N] [--rebuild-check] [--write]
// Does the fish-wired pilot right a kick in pitch faster than the PD autopilot, and does a plain net? 26 pilots: the AUTOPILOT; FISH803 (brain/pilotSubWeightsFishWip.json); REAL, eight stateless vestibular circuits (P/B and P/whole qns:0 to 3, brain/rig-results/fishVestibularGen2.jsonl);
// PLAIN, sixteen weight-matched plain nets (P/B and P/whole mn:0 to 7, brain/rig-results/plainNetStudy.jsonl). Each flies every nominal dive of the set with and without a pitch-rate kick of 0.3 rad/s at 20 s, both signs; the reading is the registration's (FASTER / TIES / SLOWER at 2 se and 10
// percent of the autopilot's area over the first 5 s, REAL against PLAIN, five bottom lines). --set dev is nominal dives 1 to 4, is a sanity run and does not rebuild-check the pilots unless --rebuild-check is given (the registered set always does); --set registered is dives 190001 to 190048 and is flown ONCE; --write (registered only) writes every kick to brain/subRightingRegistered.jsonl.
// The first-order orientation step is flown (Amendment C): the pilots' records were measured under it.
"use strict";
import "../../physics/mechanics/rigidBody6dofEuler.mjs";   // Amendment C: the trained pilots' records were measured under the first-order orientation step (rebuilt under RK4 they differ by ~0.001, ten times the reproduction tolerance)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTask.mjs";
import * as AS from "../../brain/autopilotSub.mjs";
import * as PF from "../../brain/pilotSubFish.mjs";
import * as R from "../../brain/subRighting.mjs";
import * as TR from "./trainSubVestibular.mjs";
import * as PS from "./plainNetStudy.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const RIG_DIR = path.join(ENG, "brain", "rig-results"), FISH_FILE = path.join(ENG, "brain", "pilotSubWeightsFishWip.json"), OUT_FILE = "brain/subRightingRegistered.jsonl";
export const SETS = Object.freeze({ dev: Object.freeze({ first: 1, count: 4 }), registered: Object.freeze({ first: 190001, count: 48 }) });
export const SIGNS = Object.freeze([1, -1]);
export const REAL_SPECS = Object.freeze(["B", "whole"].flatMap((a) => [0, 1, 2, 3].map((i) => `P/${a}/qns:${i}`)));
export const PLAIN_SPECS = Object.freeze(["B", "whole"].flatMap((a) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `P/${a}/mn:${i}`)));
const readLines = (text) => text.trim().split("\n").map((l) => JSON.parse(l));

/**
 * The 26 arms: [{ id, family ("auto" | "fish" | "real" | "plain"), build() -> a FRESH pilot, rebuild: null | { policy, weights, set, recorded } }]. `readFile` and the directories can be given (a test); a missing record or file is an error naming it.
 */
export function loadArms({ readFile = (f) => fs.readFileSync(f, "utf8"), rigDir = RIG_DIR, fishFile = FISH_FILE } = {}) {
    const arms = [{ id: "autopilot", family: "auto", build: () => AS.pilot(), rebuild: null }];
    const fish = JSON.parse(readFile(fishFile));
    if (!fish || !Array.isArray(fish.weights) || fish.weights.length !== PF.FISH.WEIGHT_COUNT || !fish.weights.every(Number.isFinite)) throw new Error(`takeRighting.loadArms: ${fishFile} is not a fish champion of ${PF.FISH.WEIGHT_COUNT} finite weights`);
    const fw = Float32Array.from(fish.weights);
    arms.push({ id: "fish803", family: "fish", build: () => PF.FISH.pilotFor(fw), rebuild: null });
    const records = (file) => { const m = new Map(); for (const r of readLines(readFile(path.join(rigDir, file)))) if (r.spec && r.weights) m.set(r.spec, r); return m; };
    const gen2 = records("fishVestibularGen2.jsonl"), study = records("plainNetStudy.jsonl");
    const mk = (spec, family, source, polOf, setOf) => {
        const rec = source.get(spec); if (!rec) throw new Error(`takeRighting.loadArms: ${spec} is not in the records`);
        const policy = polOf({ task: rec.task, arm: rec.arm, family: rec.family, index: rec.index }, rec.scales), w = Float32Array.from(rec.weights);
        if (policy.WEIGHT_COUNT !== w.length) throw new Error(`takeRighting.loadArms: ${spec} has ${w.length} weights in its record and ${policy.WEIGHT_COUNT} in the rebuilt pilot`);
        return { id: spec, family, build: () => policy.pilotFor(w), rebuild: { policy, weights: w, set: () => setOf(rec).a1, recorded: rec.scores.champion.a1.score } };
    };
    for (const s of REAL_SPECS) arms.push(mk(s, "real", gen2, TR.policyOf, (rec) => TR.setsOf("P", { replicate: TR.replGenOf(rec.family) })));
    for (const s of PLAIN_SPECS) arms.push(mk(s, "plain", study, PS.policyOf, () => PS.setsFor("P")));
    return arms;
}

/** The rebuild check of one arm: the rebuilt pilot flies its record's own first audit to the recorded score (tolerance PS.REPRO_TOL). Returns { id, ok, diff } or null for an arm with nothing to rebuild. */
export function rebuildCheck(arm, tol = PS.REPRO_TOL) {
    if (!arm.rebuild) return null;
    const { policy, weights, set, recorded } = arm.rebuild, now = policy.evaluate(weights, set()).score, diff = Math.abs(now - recorded);
    return { id: arm.id, ok: diff <= tol, diff };
}

/** Fly every kick: rows [{ arm, family, seed, sign, area, peak, tail, settle, lost }] in the order dive (ascending), sign (+1, -1), for every arm in turn. A fresh pilot flies each flight. */
export function runArms(arms, scenarios, { signs = SIGNS } = {}) {
    const rows = [];
    for (const arm of arms) for (const sc of scenarios) {
        const base = R.fly(arm.build(), sc);
        for (const sign of signs) { const m = R.measure(R.fly(arm.build(), sc, { kick: sign }), base); rows.push({ arm: arm.id, family: arm.family, seed: sc.seed, sign, area: m.area, peak: m.peak, tail: m.tail, settle: m.settle, lost: m.lost }); }
    }
    return rows;
}

/** The readings of a set of rows: { auto, fish, real, plain, versus, lost, bottom }, from subRighting's rules. */
export function readingsOf(rows) {
    const by = new Map(); for (const r of rows) { if (!by.has(r.arm)) by.set(r.arm, { family: r.family, rows: [] }); by.get(r.arm).rows.push(r); }
    const pilots = (family) => [...by.entries()].filter(([, v]) => v.family === family).map(([id, v]) => ({ id, areas: v.rows.map((x) => x.area), rows: v.rows }));
    const auto = pilots("auto")[0], fish = pilots("fish")[0], real = pilots("real"), plain = pilots("plain");
    const reference = R.mean(auto.areas), rd = {
        auto, fish, real, plain, reference, lost: rows.filter((r) => r.lost).length,
        fishReading: R.familyReading(auto.areas, [fish.areas]), realReading: R.familyReading(auto.areas, real.map((p) => p.areas)), plainReading: R.familyReading(auto.areas, plain.map((p) => p.areas)),
        versus: R.pairReading(real.map((p) => R.mean(p.areas)), plain.map((p) => R.mean(p.areas)), reference),
    };
    rd.bottom = R.bottomLine({ lost: rd.lost, real: rd.realReading, plain: rd.plainReading, versus: rd.versus });
    return rd;
}
const f4 = (x) => (Number.isFinite(x) ? x.toFixed(4) : String(x)), f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : String(x));
const famLine = (label, ps) => { const all = ps.flatMap((p) => p.rows), m = (k) => R.mean(all.map((r) => r[k])); return `  ${label.padEnd(10)} area ${f4(m("area"))} rad s, peak ${f3(m("peak"))} rad, tail ${f3(m("tail"))} rad s, settle ${m("settle").toFixed(1)} s, lost ${all.filter((r) => r.lost).length} of ${all.length} (${ps.length} pilot${ps.length === 1 ? "" : "s"}; pilot means ${f4(Math.min(...ps.map((p) => R.mean(p.areas))))} to ${f4(Math.max(...ps.map((p) => R.mean(p.areas))))})`; };
const readLine = (label, fr, ref) => `  ${label}: ${fr.reading} (gain ${fr.gain >= 0 ? "+" : ""}${f4(fr.gain)} rad s = ${(100 * fr.gain / ref).toFixed(1)} percent of the autopilot's ${f4(ref)}, se ${f4(fr.se)}, n ${fr.n})`;
export function reportLines(rd) {
    return [famLine("autopilot", [rd.auto]), famLine("fish803", [rd.fish]), famLine("REAL", rd.real), famLine("PLAIN", rd.plain),
        readLine("FISH803 against the autopilot", rd.fishReading, rd.reference), readLine("REAL against the autopilot", rd.realReading, rd.reference), readLine("PLAIN against the autopilot", rd.plainReading, rd.reference),
        `  REAL against PLAIN: ${rd.versus.reading} (PLAIN minus REAL ${rd.versus.diff >= 0 ? "+" : ""}${f4(rd.versus.diff)} rad s, se ${f4(rd.versus.se)})`, `BOTTOM LINE: ${rd.bottom}`];
}

/** True iff two flights agree in score, fingerprint and status (the runner without a kick against subTask.fly). */
export const sameFlight = (a, b) => a.score === b.score && a.fingerprint === b.fingerprint && a.status === b.status;
/** Check (1) of the registration: for the first CHECK_DIVES dives the runner without a kick IS subTask.fly. `fa` and `fb` fly a pilot on a dive (a test hands in others). Returns the failures. */
export const CHECK_DIVES = 4;
export function runnerFailures(scenarios, fa = (p, sc) => R.fly(p, sc, { seconds: T.SECONDS }), fb = (p, sc) => T.fly(p, sc)) {
    const failures = [];
    for (const sc of scenarios.slice(0, CHECK_DIVES)) if (!sameFlight(fa(AS.pilot(), sc), fb(AS.pilot(), sc))) failures.push(`the runner without a kick is not subTask.fly on dive ${sc.seed}`);
    return failures;
}

export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync, sets = io.sets || SETS;
    const o = { set: "dev", seeds: null, write: false, rebuild: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--rebuild-check") o.rebuild = true;
        else if (a === "--set") { o.set = argv[++i]; if (!sets[o.set]) { err(`takeRighting: --set needs one of ${Object.keys(sets).join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("takeRighting: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else { err(`takeRighting: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (o.write && o.set !== "registered") { err("takeRighting: --write goes with --set registered only"); return 2; }
    if (o.write && o.seeds !== null) { err("takeRighting: --write needs the whole set (no --seeds)"); return 2; }
    if (o.rebuild && o.set !== "dev") { err("takeRighting: --rebuild-check goes with --set dev only (the registered set always checks)"); return 2; }
    const set = sets[o.set], n = o.seeds ? Math.min(set.count, o.seeds) : set.count, scenarios = Array.from({ length: n }, (_, i) => T.scenario(set.first + i, "nominal"));
    const arms = io.arms || loadArms(), tag = o.set === "registered" ? "the registered read" : "a sanity run of the code, not a result";
    out(`[takeRighting] ${arms.length} pilots, ${scenarios.length} nominal dives (${scenarios[0].seed} to ${scenarios[scenarios.length - 1].seed}), a kick of ${R.RIGHT.kickRate} rad/s at ${R.RIGHT.kickAt} s, both signs, ${scenarios.length * SIGNS.length} kicks a pilot (${tag}); first-order orientation step`);
    const failures = [];
    failures.push(...runnerFailures(scenarios));
    if (o.rebuild || o.set === "registered") for (const arm of arms) { const c = rebuildCheck(arm); if (c && !c.ok) failures.push(`${c.id} rebuilt from its record misses the recorded score by ${c.diff.toExponential(2)}`); }
    const rows = runArms(arms, scenarios), rd = readingsOf(rows);
    if (rows.length !== arms.length * scenarios.length * SIGNS.length) failures.push("the number of kicks flown is not arms x dives x signs");
    if (failures.length) for (const f of failures) out(`CHECK FAILED -- the readings below are NOT WEIGHED: ${f}`); else out(!(o.rebuild || o.set === "registered") ? "checks: the runner without a kick is subTask.fly (the rebuild check is not run in DEV)" : "checks: the runner without a kick is subTask.fly, every pilot rebuilt from its record reproduces the recorded score, every pilot flew the same kicks");
    for (const l of reportLines(rd)) out(l);
    if (o.write) { writeFile(path.join(ENG, OUT_FILE), rows.map((r) => JSON.stringify({ set: o.set, ...r })).join("\n") + "\n"); out(`wrote ${rows.length} kicks to ${OUT_FILE}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
