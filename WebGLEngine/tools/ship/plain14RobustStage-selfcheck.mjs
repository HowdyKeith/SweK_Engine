// WebGLEngine/tools/ship/plain14RobustStage-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
// ---------------------------------------------------------------------------------------------------------------------------------
// GATES tools/ship/plain14RobustStage.mjs (round 7 stage 2 as one stage: twenty draws started from the stage-1 champions and trained for the
// five-vessel robust objective; the registration is brain/PLAIN14_ROBUST_STAGE_WIP.md, written before the tool) AND the one change it needs
// in tools/trainSubRobust.mjs (a --circuit flag whose default must change NOTHING: that tool made committed networks).
// Sections 1 to 6 train and fly nothing: every file, child process, audit flight and environment variable is a scripted fake handed to the tool's
// own seams, so each branch (a champion with no weights, a search that dies, a record that is not this tool's, a draw that did not start from its
// stage-1 champion, a bad argument) is held by a row that needs no rig. Section 7 is the exception: it runs the real trainer for one iteration (the
// default, --circuit fly, --circuit plain14, a usage error) and is skipped when SWEK_GATE_NOREAL=1; section 9 flies a few real dives on tiny sets.
//
// Run: node tools/ship/plain14RobustStage-selfcheck.mjs      (about 40 s on 4 cores: section 7 runs the real trainer four times; 157 rows, 150 with SWEK_GATE_NOREAL=1)
//
// SABOTAGE: see the LOG at the foot of this header, written when the sweeps finished.
// LOG (2026-11-08; sha256 of the swept files: tools/ship/plain14RobustStage.mjs d082e380..., tools/trainSubRobust.mjs 27234c79..., plain14RobustStageCmd.mjs 5be1e195...;
//   each mutant is one single-site change in a copy of the tree, the gate run against it, caught = RED, CRASH, THREW or TIMEOUT; a first pass of 326 and 88 mutants drove
//   the rows of sections 7 and 9 and the FORBID guard, this is the pass on the final files):
//   * LIBRARY tools/ship/plain14RobustStage.mjs, 328 mutants (SWEK_GATE_NOREAL=1): 298 RED by name, 23 CRASH, 7 survived. Two of the seven were REAL and are CLOSED by rows added
//     afterwards, each re-run and now RED by name: line 144 `d.arm === arm` -> `!==` in the per-arm champion count (row "with 8 plain14 draws that have a champion against
//     10 fly draws the counts are PER ARM") and line 165 `+` -> `-` in the early-end sum over the five vessels, which survived because no real dive had ended early (row
//     "a weight list that makes real dives end early (all 3.0)", audit 1, safety 0, reserve 1). FIVE are EQUIVALENT, argued: line 47 `b.seed < a.seed` -> `<=` (the tie-break
//     of the champion pick compares two different searches, whose seeds 52000 + 10 d + k are all different, so `<` and `<=` cannot differ); lines 53 and 54 (the `>` of an `->`
//     and the `true` of `{ skipped: true }` are inside a block comment); line 173 `windowsHide: true` -> `false` (a Windows-only flag that hides a console window; nothing
//     in a process on this box can observe it, and it is NOT checked on Windows).
//   * TRAINER tools/trainSubRobust.mjs, 88 mutants (the real trainer, run): 62 RED, 2 CRASH, 1 TIMEOUT, 23 survived, ALL IN LINES THE GATE CANNOT REACH IN A ONE-ITERATION RUN AND
//     SAID PLAINLY, none closed: lines 33 (the acceptance rule: a child that TIES the best by less than 1e-9 is kept; four mutants of the tolerance and of `>=`; a tie
//     needs a child whose 1 to 4 changed weights do not move the score, which the pinned runs do not produce), 34 (the progress line every 50th iteration: `i % 50`, the
//     text and its elapsed seconds; the loop starts at 1, so a one-iteration run never prints one) and 35 (the checkpoint every 100th iteration, including the `circuit` field
//     that THIS round added to it, which is the same expression as the one the pinned final file does carry, so what the gate holds of it is the final file's), and line 28
//     (the rng's divisor 4294967296 +- 1, a change of 2e-10 in each draw, which no pinned run is resolved enough to see). The rng and the acceptance rule are the fly
//     chain's own pre-existing lines (the gate pins that `--circuit fly` and the default write the same bytes as the committed trainer; this round touched only the
//     argument, the policy choice, the usage line and the `circuit` field). Nothing in the rig run depends on the checkpoint: the tool reads each search's FINAL file only.
//     Pinning them would take a 50 to 100 iteration trainer run (about 3 minutes) in a gate; not done.
//   * COMMAND tools/ship/plain14RobustStageCmd.mjs: held by the gate's section 6 (the environment variable is set before the import) and section 8's source guards; no
//     separate mutation pass (two statements).
//   * A FINDING OF THE SWEEP ITSELF: in the sweep's copy of the tree `brain/` is made of links into the real one, so a mutant that ignores `--out` wrote
//     `brain/rig-results/plain14-robust/start-*.json` into the REAL tree (twice). They were deleted; a stray record there would have made the rig skip a draw. The gate does not
//     write there (it was run and the folder checked after), and the tool's own refusal to run outside its folders is not a defence against a MUTANT of it.
// ---------------------------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as R from "./plain14RobustStage.mjs";
import * as D from "./plain14Distribution.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
const LIB = fs.readFileSync(path.join(HERE, "plain14RobustStage.mjs"), "utf8"), CMD = fs.readFileSync(path.join(HERE, "plain14RobustStageCmd.mjs"), "utf8"), TRAINER = fs.readFileSync(path.join(ENG, "tools", "trainSubRobust.mjs"), "utf8");
process.env.SWEK_P14RS_FORBID_REAL = "1";   // a mutant that leaks a real child process or a real audit must fail here, not run for an hour behind the gate
process.env.SWEK_6DOF_ORIENTATION = "euler";   // the few real flights of section 9 run under the first-order step, as the stage does
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const WATCHDOG = setTimeout(() => { console.log("  FAIL  the gate did not finish within 120 s (something waited for an event that never came)"); process.exit(1); }, 120000);
console.log("plain14RobustStage-selfcheck -- one stage of the chain, twenty draws\n");

// ---- the fakes ---------------------------------------------------------------------------------------------------------------------------------------------
const wts = (n, base = 0) => Array.from({ length: n }, (_, i) => base + i / 1000);
const hashRef = (w) => crypto.createHash("sha256").update(JSON.stringify(Array.from(Float32Array.from(w)))).digest("hex").slice(0, 16);
/** A stage-1 dump: runs of the arm's length, the champion's seed named, the autopilot recorded. */
const dumpOf = (arm, seed, o = {}) => ({ recipe: { circuit: arm, seed, runs: 4, iters: 400, sigma: 0.3, maxK: 4, slice: 1 }, auto: { audit: { score: -0.5 }, safetyAudit: { score: -0.55 }, reserve: { score: -0.51 } }, champion: o.champion === undefined ? seed + 1 : o.champion, runs: [0, 1, 2, 3].map((k) => ({ k, seed: seed + k, weights: wts(R.WEIGHTS[arm], seed + k) })) });
const sc = (a, s, r, ca = 0, cs = 0, cr = 0) => ({ audit: { score: a, crashed: ca }, safetyAudit: { score: s, crashed: cs }, reserve: { score: r, crashed: cr } });
/** One scripted world: files in a Map, a spawn that records its jobs and writes search outputs, audits that record their calls. */
function world(over = {}) {
    const files = new Map(), jobs = [], logs = [], audits = [], dirs = []; let started = 0, release; const allStarted = new Promise((r) => { release = r; });
    for (const arm of R.ARMS) for (const s of R.SEEDS) files.set(`brain/rig-results/plain14/${R.STAGE1_PREFIX[arm]}${s}.json`, JSON.stringify(dumpOf(arm, s)));
    const io = {
        readFile: (f) => { if (!files.has(f)) throw new Error("no such file " + f); return files.get(f); }, writeFile: (f, t) => { files.set(f, t); }, exists: (f) => files.has(f), mkdir: (d) => { dirs.push(d); }, log: (m) => logs.push(m), env: over.env || { PATH: "x" },
        spawn: async (job) => {
            jobs.push(job); if (++started === 4 && !over.sequential) release(); if (!over.sequential) await allStarted;
            const out = job.args[job.args.indexOf("--out") + 1], k = Number(job.args[job.args.indexOf("--seed") + 1]) % 10, arm = job.args[1];
            const spec = (over.search && over.search(k, arm)) || { code: 0, held: -0.5 - k / 100 };
            if (spec.code === 0 && !spec.noFile) files.set(out, spec.raw !== undefined ? spec.raw : JSON.stringify({ seed: Number(job.args[3]), iters: spec.iters === undefined ? 200 : spec.iters, from: "x", actuators: spec.actuators === undefined ? false : spec.actuators, ...(arm === "plain14" ? { circuit: "plain14" } : {}), trainScore: -0.4, heldScore: spec.held, improved: 1, weights: wts(R.WEIGHTS[arm], 100 + k) }));
            return spec.none ? undefined : { code: spec.code };
        },
        flyAudits: async (arm, w) => { audits.push([arm, w === null ? null : hashRef(w)]); return w === null ? over.auto || sc(-0.65, -0.66, -0.64) : over.fly ? over.fly(arm, w) : sc(-0.45, -0.46, -0.44); },
        outDir: "out", stage1Dir: "brain/rig-results/plain14",
    };
    return { files, jobs, logs, audits, dirs, io };
}

// ---- 1. constants ------------------------------------------------------------------------------------------------------------------------------------------
console.log("1. THE CONSTANTS");
{
    ok("the arms and the ten seeds are stage 1's, and the stage-1 dump prefixes are fly and plain", eq(R.ARMS, ["fly", "plain14"]) && eq(R.SEEDS, D.SEEDS) && R.SEEDS[0] === 6310 && R.SEEDS[9] === 6400 && eq(R.STAGE1_PREFIX, { fly: "fly", plain14: "plain" }) && eq(R.WEIGHTS, { fly: 963, plain14: 954 }));
    ok("!! THE RECIPE IS THE REGISTERED ONE: 4 searches x 200 iterations, sigma 0.3, maxK 4, five vessels, no actuator limits, the first-order step", eq(R.RECIPE, { searches: 4, iters: 200, sigma: 0.3, maxK: 4, vessels: 5, actuators: false, orientation: "euler" }) && Object.isFrozen(R.RECIPE));
    ok("the audit base and the search seeds are the registered ones (95000; 52000 + 10 d + k)", R.AUDIT_BASE === 95000 && R.SEARCH_SEED_BASE === 52000 && R.searchSeed(0, 0) === 52000 && R.searchSeed(0, 3) === 52003 && R.searchSeed(1, 0) === 52010 && R.searchSeed(9, 3) === 52093);
    const all = R.SEEDS.flatMap((_, d) => [0, 1, 2, 3].map((k) => R.searchSeed(d, k)));
    ok("the forty search seeds are all different", new Set(all).size === 40);
    ok("the record file is robust-<fly|plain>-<seed>.json (plain14 is 'plain', as in stage 1's dumps)", R.recordName("fly", 6310) === "robust-fly-6310.json" && R.recordName("plain14", 6400) === "robust-plain-6400.json");
    ok("the defaults: the records go to brain/rig-results/plain14-robust and the stage-1 dumps are read from brain/rig-results/plain14", R.DEFAULT_OUT === "brain/rig-results/plain14-robust" && R.DEFAULT_STAGE1 === "brain/rig-results/plain14");
    ok("the exact test is stage 1's: alpha 0.05, 8 draws at least, a tolerance of 1e-9, read on the safety audit", R.ALPHA === 0.05 && R.MIN_DRAWS === 8 && R.TOL === 1e-9 && R.READ_ON === "safetyAudit" && eq(R.AUDITS, ["audit", "safetyAudit", "reserve"]));
    ok("!! THE FIVE VESSELS the tool flies are the five the trainer trains on (the two literals are the same text)", TRAINER.includes(R.VARIANTS_SOURCE) && LIB.includes("VARIANTS = [{}, { munk: 3000 }, { munk: 0 }, { finArea: E.finArea * 0.6 }, { bg: E.bg * 2.5 }]"));
    ok("the audit sets the tool flies are auditSets(95000) and BASELINE_SET, and the sets are NOT any the chain or stage 1 used", /auditSets\(AUDIT_BASE\)/.test(LIB) && /reserve: T\.BASELINE_SET/.test(LIB) && R.AUDIT_BASE !== 7000 && R.AUDIT_BASE !== 3000 && R.AUDIT_BASE !== 30000 && R.AUDIT_BASE !== 20000);
}

// ---- 2. weights --------------------------------------------------------------------------------------------------------------------------------------------
console.log("\n2. hashOf, championWeights, pickChampion");
{
    ok("hashOf: pinned (sha256 of the float32 list as JSON, 16 hex digits)", R.hashOf([1.5]) === "f631f85ac97c9aa0" && R.hashOf([1, 2, 3]) === "a615eeaee21de517");
    ok("!! hashOf reads the weights as float32: 0.1 and its float32 value hash alike, a Float32Array and a list hash alike, and one weight changed changes it", R.hashOf([0.1]) === R.hashOf([0.10000000149011612]) && R.hashOf(Float32Array.from([1, 2, 3])) === R.hashOf([1, 2, 3]) && R.hashOf([1, 2, 3]) !== R.hashOf([1, 2, 3.0001]) && R.hashOf([1, 2]) !== R.hashOf([2, 1]) && /^[0-9a-f]{16}$/.test(R.hashOf([])));
    const d = dumpOf("fly", 6310, { champion: 6312 });
    const c = R.championWeights(d, "fly", "x.json");
    ok("championWeights: the run whose SEED is the champion's (6312 is the third run, index 2), with its weights", c.seed === 6312 && eq(c.weights, d.runs[2].weights) && c.weights.length === 963);
    ok("championWeights: a plain14 dump has 954", R.championWeights(dumpOf("plain14", 6310), "plain14").weights.length === 954);
    const bad = (dump, arm = "fly") => { try { R.championWeights(dump, arm, "x.json"); return null; } catch (e) { return e.message; } };
    ok("!! a dump with NO champion (null, undefined, not a whole number) is refused with its name", /x\.json has no champion/.test(bad(dumpOf("fly", 6310, { champion: null }))) && /has no champion/.test(bad({ runs: [] })) && /has no champion/.test(bad(dumpOf("fly", 6310, { champion: 6311.5 }))) && /has no champion/.test(bad(null)) && /has no champion/.test(bad({ champion: 6311 })));
    ok("a champion naming no run, a run with no weights list, the wrong number of weights and a weight that is not a number are each refused", /holds no such run with weights/.test(bad(dumpOf("fly", 6310, { champion: 9999 }))) && /holds no such run with weights/.test(bad({ champion: 1, runs: [{ seed: 1 }] })) && /has 954 weights, a fly net has 963/.test(bad(dumpOf("plain14", 6310), "fly")) && /has 963 weights, a plain14 net has 954/.test(bad(dumpOf("fly", 6310), "plain14")) && /weight that is not a number/.test(bad({ champion: 1, runs: [{ seed: 1, weights: [...wts(962), "x"] }] })) && /weight that is not a number/.test(bad({ champion: 1, runs: [{ seed: 1, weights: [...wts(962), NaN] }] })));
    ok("a null run among the runs does not stop the search for the champion", R.championWeights({ champion: 6311, runs: [null, { seed: 6311, weights: wts(963) }] }, "fly").seed === 6311);
    const S = (seed, held, w = [1]) => ({ seed, heldScore: held, weights: w });
    ok("pickChampion: the best held-out score", R.pickChampion([S(1, -0.5), S(2, -0.4), S(3, -0.6)]).seed === 2);
    ok("!! pickChampion: a tie goes to the LOWER seed, whichever comes first", R.pickChampion([S(5, -0.4), S(3, -0.4), S(4, -0.4)]).seed === 3 && R.pickChampion([S(3, -0.4), S(5, -0.4)]).seed === 3);
    ok("pickChampion: a search with no held-out score (null, NaN) or no weights is passed over; none usable is null; an empty list is null", R.pickChampion([S(1, null), S(2, -0.9), S(3, NaN)]).seed === 2 && R.pickChampion([S(1, -0.1, null), S(2, -0.9)]).seed === 2 && R.pickChampion([S(1, null)]) === null && R.pickChampion([]) === null && R.pickChampion([null, undefined]) === null);
    ok("pickChampion: a held-out score of exactly 0 is a score (it is above a negative one)", R.pickChampion([S(1, -0.2), S(2, 0)]).seed === 2);
}

// ---- 3. running one draw -----------------------------------------------------------------------------------------------------------------------------------
console.log("\n3. runDraw: four searches, the champion, the audits, the record");
{
    const w = world(), res = await R.runDraw("fly", 6310, w.io), rec = res.record;
    ok("the four searches are started together (all four spawned before any is waited for: a sequential run would never finish this gate), each `--circuit fly --seed <52000..52003> --iters 200 --from <start file> --out <search file>`", w.jobs.length === 4 && w.jobs.every((j, k) => eq(j.args, ["--circuit", "fly", "--seed", String(52000 + k), "--iters", "200", "--from", "out/start-fly-6310.json", "--out", `out/search-fly-6310-${k}.json`])));
    ok("the draw's index sets the seeds: draw 6400 is index 9, seeds 52090 to 52093; plain14 draws pass --circuit plain14", (await (async () => { const w2 = world(); await R.runDraw("plain14", 6400, w2.io); return w2.jobs.every((j, k) => j.args[1] === "plain14" && j.args[3] === String(52090 + k) && j.args[9] === `out/search-plain-6400-${k}.json` && j.args[7] === "out/start-plain-6400.json"); })()));
    ok("!! every search runs under the FIRST-ORDER step: the environment is the caller's plus SWEK_6DOF_ORIENTATION=euler (set over a caller's other value), and the caller's other variables are kept", w.jobs.every((j) => j.env.SWEK_6DOF_ORIENTATION === "euler" && j.env.PATH === "x") && (await (async () => { const w2 = world({ env: { SWEK_6DOF_ORIENTATION: "rk4", Z: "1" } }); await R.runDraw("fly", 6310, w2.io); return w2.jobs.every((j) => j.env.SWEK_6DOF_ORIENTATION === "euler" && j.env.Z === "1"); })()));
    const startFile = JSON.parse(w.files.get("out/start-fly-6310.json")), dump = dumpOf("fly", 6310);
    ok("!! the start file holds the stage-1 champion's weights (champion 6311, the second run), its hash and where it came from", startFile.fromSeed === 6311 && eq(startFile.weights, dump.runs[1].weights) && startFile.hash === hashRef(dump.runs[1].weights) && startFile.arm === "fly" && startFile.seed === 6310);
    const w2s = world(); w2s.io.stage1Dir = "elsewhere"; const e2 = await R.runDraw("plain14", 6310, w2s.io).then(() => "no error", (e) => e.message);
    ok("the output folder is made, and the stage-1 dump is read from the stage-1 folder, by the arm's prefix (plain6310.json for plain14)", eq(w.dirs, ["out"]) && /no such file elsewhere\/plain6310\.json/.test(e2));
    ok("the record: schema, kind, arm, seed, index, the recipe with the orientation from the environment, the start's source seed and hash", rec.schema === 1 && rec.kind === "plain14-robust-stage" && rec.arm === "fly" && rec.seed === 6310 && rec.index === 0 && eq(rec.recipe, R.RECIPE) && rec.startFrom === 6311 && rec.startHash === hashRef(dump.runs[1].weights));
    ok("the four searches are recorded with their seeds, exit code, iterations, limits, scores and a hash of their weights (and no weights)", rec.searches.length === 4 && rec.searches.every((s, k) => s.k === k && s.seed === 52000 + k && s.code === 0 && s.iters === 200 && s.actuators === false && s.heldScore === -0.5 - k / 100 && s.trainScore === -0.4 && /^[0-9a-f]{16}$/.test(s.weightsHash) && !("weights" in s)) && rec.searches[0].circuit === "fly");
    ok("!! the champion is the search with the best held-out score (search 0, -0.50), its hash and weights are kept, and the audits were flown for ITS weights", rec.champion === 52000 && rec.championHash === rec.searches[0].weightsHash && eq(rec.championWeights, wts(963, 100)) && w.audits.some((a) => a[0] === "fly" && a[1] === rec.championHash));
    ok("the audits are flown three times: the start's weights, the autopilot (null), and the champion's; and the record holds each", w.audits.length === 3 && w.audits.filter((a) => a[1] === null).length === 1 && w.audits.some((a) => a[1] === rec.startHash) && eq(rec.scores, sc(-0.45, -0.46, -0.44)) && eq(rec.start, sc(-0.45, -0.46, -0.44)) && eq(rec.auto, sc(-0.65, -0.66, -0.64)));
    ok("the record is written as JSON at out/robust-fly-6310.json, and is what runDraw returns with its file", w.files.has("out/robust-fly-6310.json") && eq(JSON.parse(w.files.get("out/robust-fly-6310.json")), rec) && res.file === "out/robust-fly-6310.json");
    ok("the log says what is run and what came out (the champion's safety audit, the start's and the autopilot's)", w.logs.length === 2 && /^fly 6310: 4 searches of 200 iterations from the stage-1 champion \(seed 6311\), five vessels$/.test(w.logs[0]) && /^fly 6310: champion search 52000, safety audit -0\.4600 \(start -0\.4600, autopilot -0\.6600\)$/.test(w.logs[1]));
    const again = await R.runDraw("fly", 6310, w.io);
    ok("!! a draw whose record exists is SKIPPED: nothing spawned, nothing flown, nothing written, and it says so", again.skipped === true && w.jobs.length === 4 && w.audits.length === 3 && /out\/robust-fly-6310\.json exists, skipped/.test(w.logs[2]));
    for (const [a, s] of [["fly", 6311], ["fly", 1], ["x", 6310], [undefined, 6310], ["fly", "6310"], ["plain", 6310]]) { const w2 = world(); const m = await R.runDraw(a, s, w2.io).then(() => null, (e) => e.message); ok(`!! ${JSON.stringify(a)} ${JSON.stringify(s)} is refused and nothing is started`, /is not an arm and one of the ten seeds/.test(m) && w2.jobs.length === 0 && w2.audits.length === 0); }
    // a search that dies, a missing output, garbage
    const dead = world({ search: (k) => (k === 0 ? { code: 1 } : { code: 0, held: -0.5 - k / 100 }) }), rd = (await R.runDraw("fly", 6310, dead.io)).record;
    ok("!! a search that exits non-zero is recorded with no scores and is passed over: the champion is the best of the OTHERS (search 1)", rd.searches[0].code === 1 && rd.searches[0].heldScore === null && rd.searches[0].weightsHash === null && rd.searches[0].iters === null && rd.champion === 52001);
    const nofile = world({ search: (k) => (k === 0 ? { code: 0, noFile: true } : { code: 0, held: -0.6 }) }), rn = (await R.runDraw("fly", 6310, nofile.io)).record;
    ok("a search that exits 0 but wrote no file, and one whose file is not JSON, are both passed over", rn.searches[0].heldScore === null && rn.searches[0].code === 0 && rn.champion === 52001 && (await (async () => { const w2 = world({ search: (k) => (k === 0 ? { code: 0, raw: "{{{ not json" } : { code: 0, held: -0.6 }) }); return (await R.runDraw("fly", 6310, w2.io)).record.searches[0].heldScore === null; })()));
    const none = world({ search: () => ({ code: 2 }) }), rz = (await R.runDraw("fly", 6310, none.io)).record;
    ok("!! with NO search producing a score the draw has no champion: champion, hash, weights and scores are null, the start and the autopilot are still flown (2 audits, not 3), and the record is written", rz.champion === null && rz.championHash === null && rz.championWeights === null && rz.scores === null && none.audits.length === 2 && none.audits.every((a) => a[1] !== rz.startHash || true) && eq(rz.start, sc(-0.45, -0.46, -0.44)) && none.files.has("out/robust-fly-6310.json") && /NO search produced a held-out score/.test(none.logs[1]));
    const tie = world({ search: () => ({ code: 0, held: -0.4 }) }), rt = (await R.runDraw("fly", 6310, tie.io)).record;
    ok("equal held-out scores: the lowest search seed is the champion", rt.champion === 52000);
    const w5 = world({ fly: (arm, wt) => (hashRef(wt) === hashRef(dumpOf(arm, 6310).runs[1].weights) ? sc(-0.7, -0.71, -0.69) : sc(-0.45, -0.46, -0.44)) }), r5 = (await R.runDraw("fly", 6310, w5.io)).record;
    ok("the START's scores and the CHAMPION's are kept apart in the record (start -0.71, champion -0.46 on the safety audit)", r5.start.safetyAudit.score === -0.71 && r5.scores.safetyAudit.score === -0.46);
    const w6 = world({ search: (k) => ({ code: 0, held: k === 2 ? -0.1 : -0.9 }) }), r6 = (await R.runDraw("fly", 6310, w6.io)).record;
    ok("!! the weights flown and kept for the champion are the winning search's own (search 2, weights 102.000...), not another search's", r6.champion === 52002 && eq(r6.championWeights, wts(963, 102)) && w6.audits.some((a) => a[1] === hashRef(wts(963, 102))) && !w6.audits.some((a) => a[1] === hashRef(wts(963, 100))));
    const wst = world({ search: (k) => (k === 0 ? { code: 1 } : { code: 0, held: -0.6 }) }); wst.files.set("out/search-fly-6310-0.json", JSON.stringify({ seed: 52000, iters: 200, actuators: false, trainScore: 0, heldScore: 99, weights: wts(963, 7) }));
    const rst = (await R.runDraw("fly", 6310, wst.io)).record;
    ok("!! a search that FAILED is passed over even when an OLDER run left a good-looking output file behind (heldScore 99 would win): the stale file is not read", rst.searches[0].heldScore === null && rst.champion !== 52000);
    const wun = world({ search: (k) => (k === 1 ? { none: true } : { code: 0, held: -0.5 - k / 100 }) }), run0 = (await R.runDraw("fly", 6310, wun.io)).record;
    ok("a spawn that resolves to nothing at all (no exit code) is a failed search, not a throw", run0.searches[1].code === undefined && run0.searches[1].heldScore === null && run0.champion !== 52001 && run0.champion !== null);
    const wi = world({ search: () => ({ code: 0, held: -0.5, iters: 199 }) }), ri = (await R.runDraw("fly", 6310, wi.io)).record;
    ok("what a search reports about itself (its own iteration count) is recorded as it is, for the report to check", ri.searches.every((s) => s.iters === 199));
}

// ---- 4. the records and the checks -------------------------------------------------------------------------------------------------------------------------
console.log("\n4. parseRecord, drawOf, the checks");
/** A good set of twenty records, as the report reads them. */
function goodRecords(over = {}) {
    const rs = [];
    for (const arm of R.ARMS) R.SEEDS.forEach((seed, d) => {
        const dump = dumpOf(arm, seed), start = dump.runs[1].weights;
        const r = { schema: 1, kind: "plain14-robust-stage", arm, seed, index: d, recipe: { ...R.RECIPE }, startFrom: seed + 1, startHash: hashRef(start), searches: [0, 1, 2, 3].map((k) => ({ k, seed: R.searchSeed(d, k), code: 0, iters: 200, actuators: false, trainScore: -0.4, heldScore: -0.5, weightsHash: "abc" })), champion: R.searchSeed(d, 0), championHash: "abc", championWeights: [1],
            scores: sc(arm === "fly" ? -0.30 - d / 1000 : -0.31 - d / 1000, arm === "fly" ? -0.33 - d / 1000 : -0.34 - d / 1000, -0.32), start: sc(-0.5, -0.5, -0.5), auto: sc(-0.65, -0.66, -0.64) };
        rs.push(over.edit ? over.edit(r, arm, seed) || r : r);
    });
    return rs;
}
const draws = (rs) => rs.map((r) => R.drawOf(r, `robust-${R.STAGE1_PREFIX[r.arm]}-${r.seed}.json`));
const stage1Of = (rs) => Object.fromEntries(rs.map((r) => [`${r.arm}:${r.seed}`, r.startHash]));
{
    const rs = goodRecords(), ds = draws(rs);
    ok("parseRecord: a good record parses; text that is not JSON, a dump of the other tool, an object with no autopilot, one with no start, one with no searches, and null are refused with the name", R.parseRecord(JSON.stringify(rs[0]), "a.json").arm === "fly" && [["{{", /a\.json is not JSON/], [JSON.stringify(dumpOf("fly", 6310)), /not a record of this tool/], [JSON.stringify({ ...rs[0], auto: undefined }), /not a record/], [JSON.stringify({ ...rs[0], start: undefined }), /not a record/], [JSON.stringify({ ...rs[0], searches: "x" }), /not a record/], ["null", /not a record/], [JSON.stringify({ ...rs[0], recipe: undefined }), /not a record/], [JSON.stringify({ ...rs[0], kind: "x" }), /not a record/]].every(([t, re]) => { try { R.parseRecord(t, "a.json"); return false; } catch (e) { return re.test(e.message); } }));
    const d0 = ds[0];
    ok("drawOf: the arm, the seed, the recipe, the start hash and the searches, and the champion's three scores, the start's and the autopilot's as plain numbers, and the champion's early ends per audit", d0.arm === "fly" && d0.seed === 6310 && d0.champion === true && eq(d0.scores, { audit: -0.30, safetyAudit: -0.33, reserve: -0.32 }) && eq(d0.start, { audit: -0.5, safetyAudit: -0.5, reserve: -0.5 }) && eq(d0.auto, { audit: -0.65, safetyAudit: -0.66, reserve: -0.64 }) && eq(d0.crashed, { audit: 0, safetyAudit: 0, reserve: 0 }) && d0.startHash === rs[0].startHash && d0.searches.length === 4);
    ok("!! drawOf: a record with champion null, or with a champion whose scores are missing or not numbers, is NOT a draw with a champion", draws([{ ...rs[0], champion: null, scores: null }])[0].champion === false && draws([{ ...rs[0], scores: null }])[0].champion === false && draws([{ ...rs[0], scores: { ...rs[0].scores, safetyAudit: { score: NaN, crashed: 0 } } }])[0].champion === false && draws([{ ...rs[0], scores: { audit: {}, safetyAudit: {}, reserve: {} } }])[0].champion === false && draws([{ ...rs[0], champion: undefined }])[0].champion === false && draws([{ ...rs[0], champion: null, scores: null }])[0].scores === null && draws([{ ...rs[0], champion: null, scores: null }])[0].crashed === null);
    ok("drawOf: a start or an autopilot that is incomplete reads null", draws([{ ...rs[0], start: { audit: { score: 1 } } }])[0].start === null && draws([{ ...rs[0], auto: {} }])[0].auto === null);
    ok("drawOf: early ends are the champion's `crashed` counts, a missing count reads null", draws([{ ...rs[0], scores: sc(-0.3, -0.3, -0.3, 1, 2, 3) }])[0].crashed.safetyAudit === 2 && draws([{ ...rs[0], scores: { audit: { score: -0.3 }, safetyAudit: { score: -0.3 }, reserve: { score: -0.3 } } }])[0].crashed.safetyAudit === null);

    const C = (ds2, st = stage1Of(rs)) => R.checksOf(ds2, st), row = (cs, n) => cs.find((x) => x.name === n);
    ok("all five checks pass on a good set of twenty, in the order SEEDS, RECIPE, ONE ENVIRONMENT, START, CHAMPIONS", eq(C(ds).map((x) => x.name), ["SEEDS", "RECIPE", "ONE ENVIRONMENT", "START", "CHAMPIONS"]) && C(ds).every((x) => x.ok));
    ok("the passing texts say what held (seeds 6310 to 6400, the recipe, the autopilot's numbers, the hashes, the counts of champions)", row(C(ds), "SEEDS").text === "ten fly draws and ten plain14 draws, seeds 6310 to 6400 once each" && /^every draw ran the recipe \(4 searches, 200 iterations, sigma 0.3, maxK 4, five vessels, no limits, first-order step\)$/.test(row(C(ds), "RECIPE").text) && /^all 20 records carry the same autopilot numbers \(audit -0\.6500, safety -0\.6600, reserve -0\.6400, five vessels\)$/.test(row(C(ds), "ONE ENVIRONMENT").text) && /^every draw started from the champion of its own stage-1 dump/.test(row(C(ds), "START").text) && /\(fly 10, plain14 10\)$/.test(row(C(ds), "CHAMPIONS").text));
    const seedBad = (f) => row(C(draws(f(rs))), "SEEDS");
    ok("!! SEEDS: a seed twice, a seed missing, a seed that is not one of the ten, and a record of another arm are each named", /fly has seed 6310 twice/.test(seedBad((r) => [...r, r[0]]).text) && /plain14 is missing seed 6400/.test(seedBad((r) => r.filter((x) => !(x.arm === "plain14" && x.seed === 6400))).text) && /fly has seed 7777, which is not one of the ten/.test(seedBad((r) => r.map((x) => (x.arm === "fly" && x.seed === 6310 ? { ...x, seed: 7777 } : x))).text) && /is of circuit "control", not fly or plain14/.test(seedBad((r) => r.map((x, i) => (i === 0 ? { ...x, arm: "control" } : x))).text) && !seedBad((r) => [...r, r[0]]).ok && /fly has seed 5555, 7777, which is not one of the ten/.test(seedBad((r) => [...r, { ...r[0], seed: 7777 }, { ...r[0], seed: 5555 }]).text) && /fly has seed 6310, 6320 twice/.test(seedBad((r) => [...r, r[0], r[1], r[1], r[0]]).text));
    for (const [label, mut] of [["searches", (r) => ({ ...r, recipe: { ...r.recipe, searches: 3 } })], ["iters", (r) => ({ ...r, recipe: { ...r.recipe, iters: 400 } })], ["sigma", (r) => ({ ...r, recipe: { ...r.recipe, sigma: 0.5 } })], ["maxK", (r) => ({ ...r, recipe: { ...r.recipe, maxK: 3 } })], ["vessels", (r) => ({ ...r, recipe: { ...r.recipe, vessels: 1 } })], ["actuators", (r) => ({ ...r, recipe: { ...r.recipe, actuators: true } })], ["orientation", (r) => ({ ...r, recipe: { ...r.recipe, orientation: "rk4" } })], ["the number of searches recorded", (r) => ({ ...r, searches: r.searches.slice(0, 3) })], ["a search that ran 199 iterations", (r) => ({ ...r, searches: r.searches.map((s, k) => (k === 1 ? { ...s, iters: 199 } : s)) })], ["a search with limits on", (r) => ({ ...r, searches: r.searches.map((s, k) => (k === 2 ? { ...s, actuators: true } : s)) })], ["a search that ran another seed", (r) => ({ ...r, searches: r.searches.map((s, k) => (k === 3 ? { ...s, seed: 1 } : s)) })]]) {
        const rr = row(C(draws(rs.map((r, i) => (i === 5 ? mut(r) : r)))), "RECIPE"); ok(`!! RECIPE: ${label} off the recipe fails it, naming the draw, in exactly the words`, !rr.ok && rr.text === "robust-fly-6360.json did not run the recipe (4 searches, 200 iterations, sigma 0.3, maxK 4, five vessels, no limits, first-order step, seeds 52000 + 10 d + k)");
    }
    ok("RECIPE: a search that DIED (iters null) is not a recipe failure; a record with no recipe field in a changed key is", row(C(draws(rs.map((r, i) => (i === 0 ? { ...r, searches: r.searches.map((s, k) => (k === 0 ? { ...s, iters: null, actuators: null, heldScore: null, code: 1 } : s)) } : r)))), "RECIPE").ok);
    const envBad = (f) => row(C(draws(rs.map((r, i) => (i === 4 ? f(r) : r)))), "ONE ENVIRONMENT");
    ok("!! ONE ENVIRONMENT: an autopilot number that differs by more than 1e-9 on any audit fails it, naming the draw; one that differs by less passes", !envBad((r) => ({ ...r, auto: sc(-0.65, -0.66 - 1e-8, -0.64) })).ok && envBad((r) => ({ ...r, auto: sc(-0.65 + 1e-6, -0.66, -0.64) })).text === "robust-fly-6350.json carry other autopilot numbers than robust-fly-6310.json (safety audit -0.6600)" && envBad((r) => ({ ...r, auto: sc(-0.65 + 1e-11, -0.66, -0.64 - 1e-11) })).ok && !envBad((r) => ({ ...r, auto: sc(-0.65, -0.66, -0.64 + 1e-8) })).ok && !envBad((r) => ({ ...r, auto: sc(-0.65 + 1e-8, -0.66, -0.64) })).ok);
    ok("!! ONE ENVIRONMENT, the boundary read directly: reference 0, other 1e-9 passes on every audit; 2e-9 fails on every audit", [sc(1e-9, 0, 0), sc(0, 1e-9, 0), sc(0, 0, 1e-9)].every((a2) => R.checksOf([{ name: "a", arm: "fly", seed: 6310, recipe: R.RECIPE, searches: [], startHash: "h", auto: { audit: 0, safetyAudit: 0, reserve: 0 }, champion: true }, { name: "b", arm: "fly", seed: 6320, recipe: R.RECIPE, searches: [], startHash: "h", auto: a2.audit ? { audit: a2.audit.score, safetyAudit: a2.safetyAudit.score, reserve: a2.reserve.score } : { audit: 0, safetyAudit: 0, reserve: 0 }, champion: true }], {}).find((x) => x.name === "ONE ENVIRONMENT").ok === true) && [[2e-9, 0, 0], [0, 2e-9, 0], [0, 0, 2e-9]].every((v) => R.checksOf([{ name: "a", arm: "fly", seed: 6310, recipe: R.RECIPE, searches: [], startHash: "h", auto: { audit: 0, safetyAudit: 0, reserve: 0 }, champion: true }, { name: "b", arm: "fly", seed: 6320, recipe: R.RECIPE, searches: [], startHash: "h", auto: { audit: v[0], safetyAudit: v[1], reserve: v[2] }, champion: true }], {}).find((x) => x.name === "ONE ENVIRONMENT").ok === false));
    ok("ONE ENVIRONMENT: a record with no autopilot numbers fails it, and so does a set with none at all", /robust-fly-6350\.json carry no autopilot numbers/.test(envBad((r) => ({ ...r, auto: {} })).text) && !envBad((r) => ({ ...r, auto: {} })).ok && /no record carries the autopilot's numbers/.test(row(C(draws(rs.map((r) => ({ ...r, auto: {} })))), "ONE ENVIRONMENT").text));
    const startBad = (f, st) => row(C(draws(rs.map(f)), st), "START");
    ok("!! START: a draw whose start hash is not its stage-1 champion's fails it, naming it; so does a draw with no stage-1 dump at all, and a missing map", !startBad((r) => (r.seed === 6330 && r.arm === "plain14" ? { ...r, startHash: "0000" } : r)).ok && /robust-plain-6330\.json did not start from the champion of the stage-1 dump/.test(startBad((r) => (r.seed === 6330 && r.arm === "plain14" ? { ...r, startHash: "0000" } : r)).text) && !startBad((r) => r, Object.fromEntries(Object.entries(stage1Of(rs)).filter(([k]) => k !== "fly:6320"))).ok && !startBad((r) => r, null).ok && !startBad((r) => r, {}).ok);
    ok("START: a hash of the other ARM's dump of the same seed is not the hash (the key is arm:seed)", !startBad((r) => (r.arm === "fly" && r.seed === 6310 ? { ...r, startHash: stage1Of(rs)["plain14:6310"] } : r)).ok);
    const few = (n) => row(C(draws(rs.map((r) => (r.arm === "plain14" && R.SEEDS.indexOf(r.seed) < n ? { ...r, champion: null, scores: null } : r)))), "CHAMPIONS");
    ok("!! CHAMPIONS: 8 draws with a champion is enough, 7 is not (it names the arm and the count)", few(2).ok && !few(3).ok && /plain14 has 7 draws with a champion \(need 8\)/.test(few(3).text) && /fly has 7 draws with a champion/.test(row(C(draws(rs.map((r) => (r.arm === "fly" && R.SEEDS.indexOf(r.seed) < 3 ? { ...r, champion: null, scores: null } : r)))), "CHAMPIONS").text));
}

// ---- 5. the report -----------------------------------------------------------------------------------------------------------------------------------------
console.log("\n5. report: the checks first, then the reading");
{
    const flyUp = goodRecords({ edit: (r, arm, seed) => ({ ...r, scores: sc(-0.3, arm === "fly" ? -0.30 - R.SEEDS.indexOf(seed) / 1000 : -0.40 - R.SEEDS.indexOf(seed) / 1000, -0.32) }) });
    const rep = (rs, st) => R.report(draws(rs), st === undefined ? stage1Of(rs) : st);
    const L = rep(flyUp);
    ok("a good set: the header, the five PASS lines, the autopilot, both arms' draws, the three readings, the counts and the bottom line", L.length === 1 + 5 + 1 + 22 + 3 + 1 + 1 && /^ROUND 7 STAGE 2 AS ONE STAGE: 10 fly draws against 10 plain 14-50-4 draws/.test(L[0]) && L.slice(1, 6).every((l) => /^  PASS /.test(l)) && /^the PD autopilot on the same audits and vessels: audit -0\.6500 \| safetyAudit -0\.6600 \| reserve -0\.6400$/.test(L[6]));
    ok("each draw's line: the seed, the champion's three scores, then its own start's, and the safety-audit dives that ended early", L.includes("  seed 6310: -0.3000  -0.3000  -0.3200   start -0.5000  -0.5000  -0.5000   ended early 0") && L.includes("  seed 6400: -0.3000  -0.4090  -0.3200   start -0.5000  -0.5000  -0.5000   ended early 0"));
    ok("!! ALL TEN FLY DRAWS ABOVE ALL TEN PLAIN DRAWS reads BEATS, under the ROBUST objective, with the exact p (1 in 184756 = 5.4e-6) and the safety audit marked READ ON", /UNDER THE ROBUST OBJECTIVE/.test(L[L.length - 1]) && /^BOTTOM LINE: THE FLY'S WIRING BEATS ITS PLAIN CONTROLS UNDER THE ROBUST OBJECTIVE \(five-vessel safety audit: fly mean -0\.3045 of 10, plain14 mean -0\.4045 of 10, difference \+0\.1000; exact one-sided p that the fly is higher 5\.4e-6, lower 1\.0000\)$/.test(L[L.length - 1]) && L.some((l) => /^READ ON safetyAudit: /.test(l)) && !L.some((l) => /^READ ON (audit|reserve)/.test(l)));
    const plainUp = rep(goodRecords({ edit: (r, arm, seed) => ({ ...r, scores: sc(-0.3, arm === "plain14" ? -0.30 - R.SEEDS.indexOf(seed) / 1000 : -0.40 - R.SEEDS.indexOf(seed) / 1000, -0.32) }) }));
    ok("all ten plain draws above all ten fly draws reads IS BELOW", /^BOTTOM LINE: THE FLY'S WIRING IS BELOW ITS PLAIN CONTROLS UNDER THE ROBUST OBJECTIVE/.test(plainUp[plainUp.length - 1]));
    const mixed = rep(goodRecords({ edit: (r, arm, seed) => ({ ...r, scores: sc(-0.3, -0.30 - (R.SEEDS.indexOf(seed) * 2 + (arm === "fly" ? 0 : 1)) / 1000, -0.32) }) }));
    ok("!! interleaved draws read CANNOT BE TOLD APART (the fly leads by a thousandth on average, which is no reading), and each audit is read, with its mean, range, difference and the two p-values", /^BOTTOM LINE: THE FLY CANNOT BE TOLD APART FROM ITS PLAIN CONTROLS UNDER THE ROBUST OBJECTIVE/.test(mixed[mixed.length - 1]) && mixed.filter((l) => /^(READ ON )?(audit|safetyAudit|reserve): fly mean/.test(l)).length === 3 && mixed.some((l) => /^READ ON safetyAudit: fly mean -0\.3090 \(range -0\.3180 to -0\.3000\), plain14 mean -0\.3100 \(range -0\.3190 to -0\.3010\), difference \+0\.0010; exact one-sided p fly higher 0\.3697, fly lower 0\.6579: TIES$/.test(l)));
    ok("the improvement and early-end counts: 10 of 10 improved on their own start (champions -0.3x, starts -0.5), none ended a dive early", L.includes("draws that IMPROVED on their own start on the safety audit: fly 10 of 10, plain14 10 of 10; draws with a dive that ended early on it: fly 0, plain14 0"));
    const uneven = rep(goodRecords({ edit: (r, arm, seed) => (arm === "plain14" && R.SEEDS.indexOf(seed) < 2 ? { ...r, champion: null, scores: null } : r) }));
    ok("!! with 8 plain14 draws that have a champion against 10 fly draws the counts are PER ARM ('plain14 8 of 8', 'fly 10 of 10'), not the other arm's count", uneven.some((l) => /^draws that IMPROVED on their own start on the safety audit: fly 10 of 10, plain14 8 of 8; draws with a dive that ended early on it: fly 0, plain14 0$/.test(l)));
    const worse = rep(goodRecords({ edit: (r, arm, seed) => ({ ...r, scores: sc(-0.3, -0.7, -0.3, 0, arm === "plain14" && R.SEEDS.indexOf(seed) < 4 ? 2 : 0, 0), start: sc(-0.5, arm === "fly" && R.SEEDS.indexOf(seed) < 3 ? -0.9 : -0.5, -0.5) }) }));
    ok("!! a champion BELOW its own start does not count as improved (fly: 3 of the starts are -0.9, the other 7 are -0.5 and the champions -0.7); draws with early ends are counted per arm", worse.includes("draws that IMPROVED on their own start on the safety audit: fly 3 of 10, plain14 0 of 10; draws with a dive that ended early on it: fly 0, plain14 4"));
    const bad = rep(goodRecords(), { "fly:6310": "x" });
    ok("!! A FAILED CHECK is the FIRST line, the reading is NOT WEIGHED, no reading and no bottom line is printed, and the draws are still listed", /^CHECK FAILED -- START: THE CHECKS FAILED, THE READING IS NOT WEIGHED$/.test(bad[0]) && bad[bad.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && !bad.some((l) => /^READ ON|BEATS|exact one-sided/.test(l)) && bad.filter((l) => /^  seed /.test(l)).length === 20 && bad.filter((l) => /^  FAIL /.test(l)).length === 1);
    const two = R.report(draws(goodRecords().map((r) => ({ ...r, auto: r.seed === 6310 && r.arm === "fly" ? sc(-0.1, -0.1, -0.1) : r.auto }))), stage1Of(goodRecords()));
    ok("two failed checks are both named in the first line", (() => { const x = R.report(draws(goodRecords().map((r, i) => ({ ...r, startHash: i === 0 ? "z" : r.startHash, auto: i === 1 ? sc(0, 0, 0) : r.auto }))), stage1Of(goodRecords())); return /^CHECK FAILED -- ONE ENVIRONMENT, START: /.test(x[0]); })() && /^CHECK FAILED -- ONE ENVIRONMENT:/.test(two[0]));
    const gone = rep(goodRecords({ edit: (r, arm, seed) => (arm === "fly" && seed === 6310 ? { ...r, champion: null, scores: null } : r) }));
    ok("a draw with no champion is listed as left out (not as a score), and the reading is made on the other nine", gone.includes("  seed 6310: no champion (no search produced a held-out score): left out") && /fly mean .* of 9, plain14 mean .* of 10/.test(gone[gone.length - 1]));
    ok("an unknown start (a draw with no start scores) prints 'unknown' for it and does not throw", (() => { const x = rep(goodRecords({ edit: (r, arm, seed) => (arm === "plain14" && seed === 6320 ? { ...r, start: {} } : r) })); return x.includes("  seed 6320: -0.3100  -0.3410  -0.3200   start unknown   ended early 0") || x.some((l) => /^  seed 6320: .*start unknown/.test(l)); })());
    ok("the header names the arms' sizes (963 and 954 weights) and what is listed (the champion's scores, then the start's, and the early ends)", L.some((l) => /^fly \(Giant Fiber Circuit, 963 weights\): audit \/ safety audit \/ reserve of each draw's champion, then of its own start/.test(l)) && L.some((l) => /^plain14 \(14-50-4, 954 weights\):/.test(l)));
}

{
    // added after the first sweep: the exact words of the report, the order of the listing, the counts
    const mkR = (edit) => goodRecords({ edit });
    const rep2 = (rs, st) => R.report(draws(rs), st === undefined ? stage1Of(rs) : st);
    const L = rep2(mkR((r, arm, seed) => ({ ...r, scores: sc(-0.3, arm === "fly" ? -0.30 - R.SEEDS.indexOf(seed) / 1000 : -0.40 - R.SEEDS.indexOf(seed) / 1000, -0.32) })));
    ok("!! the header line, word for word (the sets: the audit of 36 dives, the safety audit of 500 and the reserve of 18)", L[0] === "ROUND 7 STAGE 2 AS ONE STAGE: 10 fly draws against 10 plain 14-50-4 draws, each started from its own stage-1 champion and trained for the five-vessel robust objective (brain/PLAIN14_ROBUST_STAGE_WIP.md); the champion read once on fresh audits flown on all five vessels: the audit (36 dives), the safety audit (500) and the reserve (18)");
    ok("the first line is the header when no check failed (no CHECK FAILED line before it)", L[0].startsWith("ROUND 7 STAGE 2 AS ONE STAGE: 10 fly draws against 10 plain 14-50-4 draws"));
    const iFly = L.findIndex((l) => /^fly \(Giant Fiber Circuit, 963 weights\)/.test(l)), iPlain = L.findIndex((l) => /^plain14 \(14-50-4, 954 weights\)/.test(l));
    ok("!! each arm's header is followed by THAT arm's draws (the fly's first line has the fly's -0.3000, the plain's first line the plain's -0.4000), the fly first", iFly > 0 && iPlain > iFly && L[iFly + 1] === "  seed 6310: -0.3000  -0.3000  -0.3200   start -0.5000  -0.5000  -0.5000   ended early 0" && L[iPlain + 1] === "  seed 6310: -0.3000  -0.4000  -0.3200   start -0.5000  -0.5000  -0.5000   ended early 0" && L[iPlain - 1] === "  seed 6400: -0.3000  -0.3090  -0.3200   start -0.5000  -0.5000  -0.5000   ended early 0");
    const rev = R.report(draws(goodRecords()).reverse(), stage1Of(goodRecords()));
    ok("!! the draws are listed in seed order whatever order the records came in (the records are handed over reversed)", rev.filter((l) => /^  seed /.test(l)).slice(0, 10).map((l) => l.slice(0, 12)).join() === "  seed 6310:,  seed 6320:,  seed 6330:,  seed 6340:,  seed 6350:,  seed 6360:,  seed 6370:,  seed 6380:,  seed 6390:,  seed 6400:");
    const nine = R.report(draws(goodRecords().filter((r) => !(r.arm === "fly" && r.seed === 6310))), stage1Of(goodRecords()));
    ok("!! the header counts each arm by ITS OWN draws (9 fly, 10 plain), not by the other arm's", /^ROUND 7 STAGE 2 AS ONE STAGE: 9 fly draws against 10 plain 14-50-4 draws/.test(nine[1]) && /^CHECK FAILED -- SEEDS/.test(nine[0]));
    const same = rep2(mkR((r) => ({ ...r, scores: sc(-0.3, -0.35, -0.32), start: sc(-0.5, -0.35, -0.5) })));
    ok("!! a champion EQUAL to its own start on the safety audit is not an improvement (0 of 10), and a difference of exactly nothing prints a plus sign ('+0.0000') in the reading and the bottom line", same.includes("draws that IMPROVED on their own start on the safety audit: fly 0 of 10, plain14 0 of 10; draws with a dive that ended early on it: fly 0, plain14 0") && same.some((l) => /^READ ON safetyAudit: .*, difference \+0\.0000; exact one-sided p fly higher/.test(l)) && /difference \+0\.0000; exact/.test(same[same.length - 1]) && /^BOTTOM LINE: THE FLY CANNOT BE TOLD APART/.test(same[same.length - 1]));
    const one = rep2(mkR((r, arm, seed) => ({ ...r, scores: sc(-0.3, -0.35, -0.32, 0, arm === "fly" && seed === 6310 ? 1 : arm === "plain14" && seed < 6330 ? 2 : 0, 0) })));
    ok("!! a draw with exactly ONE dive ended early counts (fly 1; plain14 2), a draw with none does not", one.includes("draws that IMPROVED on their own start on the safety audit: fly 10 of 10, plain14 10 of 10; draws with a dive that ended early on it: fly 1, plain14 2") && one.includes("  seed 6310: -0.3000  -0.3500  -0.3200   start -0.5000  -0.5000  -0.5000   ended early 1"));
    const neg = rep2(mkR((r, arm, seed) => ({ ...r, scores: sc(-0.3, arm === "fly" ? -0.40 - R.SEEDS.indexOf(seed) / 1000 : -0.30 - R.SEEDS.indexOf(seed) / 1000, -0.32) })));
    ok("a negative difference prints its own minus sign (fly below plain: -0.1000)", /difference -0\.1000; exact one-sided p that the fly is higher 1\.0000, lower 5\.4e-6\)$/.test(neg[neg.length - 1]));
    const cut = R.bottomLine({ reading: "TIES", meanFly: -0.3, nFly: 10, meanPlain: -0.3, nPlain: 10, diff: 0, pHigher: 0.001, pLower: 0.0009999 });
    ok("p-values are written in plain decimals from 0.001 up and in scientific form below it (0.001 reads 0.0010, 0.0009999 reads 1.0e-3)", /higher 0\.0010, lower 1\.0e-3\)$/.test(cut));
}

// ---- 6. the command ----------------------------------------------------------------------------------------------------------------------------------------
console.log("\n6. command: arguments, run --all, report");
{
    const quiet = (extra = {}) => { const o = { errs: [], outs: [] }; o.io = { err: (m) => o.errs.push(m), out: (m) => o.outs.push(m), ...extra }; return o; };
    for (const argv of [[], ["train"], ["run"], ["run", "--arm", "fly"], ["run", "--seed", "6310"], ["run", "--arm", "fly", "--seed"], ["run", "--arm", "fly", "--seed", "6310", "--bogus", "x"], ["run", "--arm", "fly", "--arm", "plain14", "--seed", "6310"], ["run", "--all", "--seed", "6310"], ["run", "--all", "extra"], ["run", "--arm", "--seed", "6310"], ["report", "--bogus", "x"], ["report", "--dir"], ["report", "--dir", "--stage1", "x"], ["report", "x"], ["run", "--all", "--out"]]) { const q = quiet(); const rc = await R.command(argv, q.io); ok(`!! the arguments ${JSON.stringify(argv.join(" "))} are a usage error (2) with the usage line and nothing run`, rc === 2 && q.errs.length === 1 && /^plain14RobustStage: run --all \| run --arm/.test(q.errs[0]) && q.outs.length === 0); }
    for (const argv of [["run", "--arm", "control", "--seed", "6310"], ["run", "--arm", "fly", "--seed", "6311"], ["run", "--arm", "fly", "--seed", "abc"]]) { const q = quiet(); ok(`the arm or seed in ${JSON.stringify(argv.slice(1).join(" "))} is refused (2) before anything runs`, (await R.command(argv, q.io)) === 2 && /--arm must be fly or plain14 and --seed one of 6310, 6320/.test(q.errs[0])); }
    const w = world(), q = quiet(w.io), rc = await R.command(["run", "--arm", "plain14", "--seed", "6330"], q.io);
    ok("!! run --arm plain14 --seed 6330 trains that one draw (4 spawns, seeds 52020 to 52023) into the DEFAULT folder and returns 0", rc === 0 && w.jobs.length === 4 && w.jobs.every((j, k) => j.args[1] === "plain14" && j.args[3] === String(52020 + k)) && w.files.has("brain/rig-results/plain14-robust/robust-plain-6330.json") && !w.files.has("out/robust-plain-6330.json"));
    const w2 = world(), q2 = quiet({ ...w2.io, outDir: undefined, stage1Dir: undefined }), order = [];
    w2.io.spawn = (job) => { order.push(job.args[1] + ":" + job.args[3]); return Promise.resolve({ code: 1 }); };
    const rc2 = await R.command(["run", "--all"], { ...q2.io, spawn: w2.io.spawn });
    ok("!! run --all goes through the twenty draws with the arms ALTERNATING by seed (fly 6310, plain14 6310, fly 6320, ...), four searches each, so a partial run is balanced", rc2 === 0 && order.length === 80 && eq(order.filter((_, i) => i % 4 === 0).slice(0, 4), ["fly:52000", "plain14:52000", "fly:52010", "plain14:52010"]) && eq(order.filter((_, i) => i % 4 === 0).slice(-2), ["fly:52090", "plain14:52090"]));
    const w3 = world(), q3 = quiet(w3.io); await R.command(["run", "--all", "--out", "elsewhere"], q3.io);
    const before3 = w3.jobs.length, rc3b = await R.command(["run", "--all", "--out", "elsewhere"], q3.io);
    ok("!! --out puts the records elsewhere (all twenty, nothing in the default folder), and a second run --all skips every draw whose record exists: no new spawn, return 0", w3.files.has("elsewhere/robust-fly-6310.json") && w3.files.has("elsewhere/robust-plain-6400.json") && [...w3.files.keys()].filter((k) => /^elsewhere\/robust-/.test(k)).length === 20 && ![...w3.files.keys()].some((k) => /^brain\/rig-results\/plain14-robust\//.test(k)) && before3 === 80 && rc3b === 0 && w3.jobs.length === before3);
    const w3b = world(); for (const [k, t] of [...w3b.files]) if (k.startsWith("brain/rig-results/plain14/")) { w3b.files.set(k.replace("brain/rig-results/plain14/", "alt/"), t); w3b.files.delete(k); }
    const q3b = quiet(w3b.io), rc3c = await R.command(["run", "--arm", "fly", "--seed", "6310", "--stage1", "alt"], q3b.io);
    ok("!! --stage1 reads the dumps from where it is told (here only alt/ holds them) and the run succeeds", rc3c === 0 && w3b.jobs.length === 4 && q3b.errs.length === 0 && w3b.files.has("brain/rig-results/plain14-robust/robust-fly-6310.json"));
    const w4 = world(), q4 = quiet(w4.io); w4.files.delete("brain/rig-results/plain14/fly6320.json");
    const rc4 = await R.command(["run", "--all"], q4.io);
    ok("!! a draw that fails (here fly 6320's stage-1 dump is missing) STOPS the run with the reason and returns 1, AFTER the draws before it (fly 6310 and plain14 6310 are written) and before the ones after (nothing for plain14 6320)", rc4 === 1 && q4.errs.length === 1 && /^plain14RobustStage: fly 6320: no such file brain\/rig-results\/plain14\/fly6320\.json$/.test(q4.errs[0]) && w4.files.has("brain/rig-results/plain14-robust/robust-fly-6310.json") && w4.files.has("brain/rig-results/plain14-robust/robust-plain-6310.json") && !w4.files.has("brain/rig-results/plain14-robust/robust-plain-6320.json"));
    // report
    const rs = goodRecords(), files = new Map(), dumps = new Map();
    for (const r of rs) { files.set(`dir/robust-${R.STAGE1_PREFIX[r.arm]}-${r.seed}.json`, JSON.stringify(r)); dumps.set(`s1/${R.STAGE1_PREFIX[r.arm]}${r.seed}.json`, JSON.stringify(dumpOf(r.arm, r.seed))); }
    const repIo = (over = {}) => { const o = quiet(); o.io = { ...o.io, listDir: (d) => (d === "dir" ? [...files.keys()].map((k) => k.slice(4)).concat(["notes.txt", "start-fly-6310.json", "search-fly-6310-0.json"]) : (() => { throw new Error("ENOENT " + d); })()), readFile: (f) => { const t = files.get(f) ?? dumps.get(f); if (t === undefined) throw new Error("no such file " + f); return t; }, ...over }; return o; };
    const r1 = repIo(), rcr = await R.command(["report", "--dir", "dir", "--stage1", "s1"], r1.io);
    ok("report reads robust-*.json only (the start and search files and other files in the folder are left alone), and prints the report with all five checks passing", rcr === 0 && r1.outs.length > 30 && r1.outs.filter((l) => /^  PASS /.test(l)).length === 5 && /^BOTTOM LINE: /.test(r1.outs[r1.outs.length - 1]) && r1.errs.length === 0);
    ok("!! report recomputes the stage-1 champion's hash from the dump itself: the START check passes because the records' hashes are the dumps' champions' hashes", r1.outs.some((l) => /PASS START: every draw started from the champion of its own stage-1 dump/.test(l)));
    const r2 = repIo({ readFile: (f) => { const t = files.get(f) ?? dumps.get(f); if (t === undefined) throw new Error("no such file " + f); return f === "s1/fly6320.json" ? JSON.stringify(dumpOf("fly", 6320, { champion: 6322 })) : t; } }); await R.command(["report", "--dir", "dir", "--stage1", "s1"], r2.io);
    ok("a stage-1 dump whose champion is another run than the record started from fails START, naming the draw, and the first line says so", /^CHECK FAILED -- START/.test(r2.outs[0]) && r2.outs.some((l) => /robust-fly-6320\.json did not start from/.test(l)));
    const r3 = repIo({ readFile: (f) => { if (f.startsWith("s1/")) throw new Error("gone"); return files.get(f); } }); await R.command(["report", "--dir", "dir", "--stage1", "s1"], r3.io);
    ok("with the stage-1 dumps unreadable the report still runs, and START fails for every draw (no champion to compare with) instead of the tool stopping", /^CHECK FAILED -- START/.test(r3.outs[0]) && r3.outs.some((l) => /^  FAIL START: robust-fly-6310\.json,/.test(l)));
    const r4 = repIo(), rc5 = await R.command(["report", "--dir", "nowhere"], r4.io);
    ok("a directory that cannot be read is a refusal (1) with the reason; one with no records is a refusal (1) that names the files it wants", rc5 === 1 && /cannot read the directory nowhere: ENOENT nowhere/.test(r4.errs[0]) && (await (async () => { const q5 = repIo({ listDir: () => ["a.txt"] }); return (await R.command(["report", "--dir", "d"], q5.io)) === 1 && /d holds no robust-fly-<S>\.json or robust-plain-<S>\.json record/.test(q5.errs[0]); })()));
    const r6 = repIo({ readFile: (f) => (f === "dir/robust-fly-6310.json" ? "{{" : files.get(f) ?? dumps.get(f)) }), rc6 = await R.command(["report", "--dir", "dir", "--stage1", "s1"], r6.io);
    ok("a record that is not JSON is a refusal (1) naming it; one whose name does not say its arm and seed is a refusal (1)", rc6 === 1 && /robust-fly-6310\.json is not JSON/.test(r6.errs[0]) && (await (async () => { const f2 = new Map(files); f2.set("dir/robust-fly-6310.json", JSON.stringify({ ...rs[0], seed: 6320 })); const q7 = repIo({ readFile: (f) => f2.get(f) ?? dumps.get(f), listDir: () => [...f2.keys()].map((k) => k.slice(4)) }); return (await R.command(["report", "--dir", "dir", "--stage1", "s1"], q7.io)) === 1 && /robust-fly-6310\.json records arm "fly" and seed 6320, which its name does not say/.test(q7.errs[0]); })()));
    const rSlash = repIo({ listDir: (d) => (d === "dir" ? [...files.keys()].map((k) => k.slice(4)) : (() => { throw new Error("not trimmed: " + d); })()), readFile: (f) => files.get(f) ?? dumps.get(f) });
    ok("!! a trailing slash or backslash on --dir and --stage1 is trimmed (the fake only knows 'dir' and 's1/...'), and every check passes", (await R.command(["report", "--dir", "dir/", "--stage1", "s1\\"], rSlash.io)) === 0 && rSlash.errs.length === 0 && rSlash.outs.filter((l) => /^  PASS /.test(l)).length === 5);
    const rSlash2 = repIo({ listDir: (d) => (d === "dir" ? [...files.keys()].map((k) => k.slice(4)) : (() => { throw new Error("not trimmed: " + d); })()), readFile: (f) => files.get(f) ?? dumps.get(f) });
    ok("two or more trailing slashes are all trimmed", (await R.command(["report", "--dir", "dir//", "--stage1", "s1///"], rSlash2.io)) === 0 && rSlash2.errs.length === 0);
    const q8 = repIo({ readFile: (f) => files.get(f) ?? dumps.get(f) }); await R.command(["report", "--dir", "dir"], q8.io);
    ok("with no --stage1 the dumps are read from the default stage-1 folder (brain/rig-results/plain14), which does not exist in the fake, so START fails rather than the tool", /^CHECK FAILED -- START/.test(q8.outs[0]));
}

{
    // added after the first sweep: the argument parser's second pair, an unsorted folder
    const quiet2 = () => { const o = { errs: [], outs: [] }; o.io = { err: (m) => o.errs.push(m), out: (m) => o.outs.push(m), listDir: () => [], readFile: () => "" }; return o; };
    const q = quiet2();
    ok("!! a SECOND pair whose value starts with -- is refused like the first (report --dir d --stage1 --x): a usage error, nothing read", (await R.command(["report", "--dir", "d", "--stage1", "--x"], q.io)) === 2 && /^plain14RobustStage: run --all/.test(q.errs[0]));
    const q2 = quiet2(); ok("a flag that comes twice is refused even when the values differ, a flag with no value at the end is refused, and a value that is another flag name is refused", (await R.command(["report", "--dir", "a", "--dir", "b"], q2.io)) === 2 && (await R.command(["report", "--dir", "a", "--stage1"], q2.io)) === 2 && (await R.command(["report", "--dir", "--stage1", "x"], q2.io)) === 2);
    const files2 = new Map([["d/robust-fly-6310.json", "{{"], ["d/robust-fly-6320.json", "{{{"]]), reads = [];
    const q3 = quiet2(); q3.io.listDir = () => ["robust-fly-6320.json", "robust-fly-6310.json"]; q3.io.readFile = (f) => { reads.push(f); return files2.get(f); };
    const rc = await R.command(["report", "--dir", "d", "--stage1", "s"], q3.io);
    ok("!! the records are read in NAME order whatever order the folder lists them (6310 is read, and named, first, and the run stops there)", rc === 1 && reads.length === 1 && reads[0] === "d/robust-fly-6310.json" && /robust-fly-6310\.json is not JSON/.test(q3.errs[0]));
}

// ---- 7. the trainer's --circuit flag, run for real ---------------------------------------------------------------------------------------------------------
console.log("\n7. tools/trainSubRobust.mjs: --circuit, and the default changes NOTHING (the real trainer, 1 iteration, the first-order step)");
if (process.env.SWEK_GATE_NOREAL === "1") console.log("  (SKIPPED: SWEK_GATE_NOREAL=1, set by the mutation harness for mutants of the library, which cannot change the trainer; every other run reads this section)"); else {
    const tmp = fs.mkdtempSync(path.join(fs.mkdtempSync ? process.env.TMPDIR || "/tmp" : "/tmp", "p14rs-")), run = (name, extra) => { const out = path.join(tmp, name + ".json"), r = spawnSync(process.execPath, [path.join(ENG, "tools", "trainSubRobust.mjs"), "--seed", "1", "--iters", "1", "--out", out, ...extra], { env: { ...process.env, SWEK_6DOF_ORIENTATION: "euler" }, encoding: "utf8", cwd: ENG }); return { r, out, text: fs.existsSync(out) ? fs.readFileSync(out, "utf8") : null }; };
    const runNoSeed = (name, extra) => { const out = path.join(tmp, name + ".json"), r = spawnSync(process.execPath, [path.join(ENG, "tools", "trainSubRobust.mjs"), "--iters", "1", "--out", out, ...extra], { env: { ...process.env, SWEK_6DOF_ORIENTATION: "euler" }, encoding: "utf8", cwd: ENG }); return { r, text: fs.existsSync(out) ? fs.readFileSync(out, "utf8") : null }; };
    const a = run("default", []), b = run("fly", ["--circuit", "fly"]), p = run("plain", ["--circuit", "plain14"]), x = run("bad", ["--circuit", "mlp"]), d8 = runNoSeed("d8000", []), s8 = runNoSeed("s8000", ["--seed", "8000"]);
    const sha = (t) => crypto.createHash("sha256").update(t).digest("hex").slice(0, 32);
    ok("!! THE DEFAULT IS UNCHANGED: seed 1, 1 iteration under the first-order step writes the very file the trainer wrote before the flag existed (sha256 pinned from the version before)", a.r.status === 0 && sha(a.text) === "ce3762fb25c5444190a394bea26e12c0", a.text ? sha(a.text) : String(a.r.stderr).slice(0, 200));
    ok("!! --circuit fly is the default, byte for byte (and writes no `circuit` field)", b.r.status === 0 && b.text === a.text && !/"circuit"/.test(a.text));
    const pj = p.text ? JSON.parse(p.text) : {};
    ok("--circuit plain14 searches the 14-50-4 net: 954 weights, `circuit: plain14` in its output, other numbers than the fly's", p.r.status === 0 && pj.circuit === "plain14" && pj.weights.length === 954 && pj.heldScore !== JSON.parse(a.text).heldScore && /robust-held -0\.5531/.test(p.r.stdout));
    ok("!! the DEFAULT SEED is 8000 (a run with no --seed writes the very file a run with --seed 8000 writes, and not the file of seed 1), and the stdout is word for word the old one", d8.r.status === 0 && d8.text === s8.text && d8.text !== a.text && JSON.parse(d8.text).seed === 8000 && a.r.stdout.trim() === "seed 1 done: robust-train -0.5828 robust-held -0.5463 (1 improved)");
    ok("the defaults are written in the trainer's own text: seed 8000 and 200 iterations", /arg\("--seed", 8000\)/.test(TRAINER) && /arg\("--iters", 200\)/.test(TRAINER));
    ok("any other circuit is a usage error (2), says so, and writes no file", x.r.status === 2 && /\[--circuit fly\|plain14\]/.test(x.r.stderr) && x.text === null);
    ok("the trainer's own text: the circuit flag is read, the fly module is the default policy, plain14 comes from brain/pilotSubPlain.mjs's PLAIN14, and the checkpoint carries `circuit` only off the default", /arg\("--circuit", "fly"\)/.test(TRAINER) && /\? \(await import\("\.\.\/brain\/pilotSubPlain\.mjs"\)\)\.PLAIN14 : FLY/.test(TRAINER) && (TRAINER.match(/\.\.\.\(circuit === "fly" \? \{\} : \{ circuit \}\)/g) || []).length === 2);
    fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- 9. the real seams: files, a child process, the flying of the audits ----------------------------------------------------------------------------------------
console.log("\n9. THE REAL SEAMS (a temporary folder, the real trainer for one iteration, two dives flown)");
{
    const FORBID = process.env.SWEK_P14RS_FORBID_REAL;
    const rej = async (f) => f().then(() => "ran", (e) => e.message);
    ok("!! with SWEK_P14RS_FORBID_REAL=1 (which this gate sets) a real child process and a real audit are REFUSED unless allowReal is passed", FORBID === "1" && /real child process is forbidden/.test(await rej(() => R.realSpawn({ args: ["--seed", "1"], env: process.env }))) && /real flying is forbidden/.test(await rej(() => R.realFlyAudits("fly", null))));
    const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "p14rs9-")), io = R.realIo();
    ok("realIo's defaults are the real seams: the environment, real spawn, real flying", io.env === process.env && io.spawn === R.realSpawn && io.flyAudits === R.realFlyAudits);
    io.mkdir(path.join(tmp, "a", "b")); io.mkdir(path.join(tmp, "a", "b")); io.writeFile(path.join(tmp, "a", "b", "x.json"), "{\"k\":1}");
    ok("!! the real files: mkdir makes a nested folder (and again, harmlessly), writeFile and readFile round-trip, exists says yes and no, listDir lists it", io.readFile(path.join(tmp, "a", "b", "x.json")) === "{\"k\":1}" && io.exists(path.join(tmp, "a", "b", "x.json")) === true && io.exists(path.join(tmp, "a", "b", "nope.json")) === false && eq(io.listDir(path.join(tmp, "a", "b")), ["x.json"]));
    ok("a relative path is read from the engine's folder, not the working directory", io.exists("tools/ship/plain14RobustStage.mjs") === true && io.readFile("tools/ship/plain14RobustStageCmd.mjs").includes("SWEK_6DOF_ORIENTATION"));
    // the real trainer, through realSpawn
    const lines = [], keep = console.error; console.error = (m) => { lines.push(String(m)); };
    let bad, good;
    try {
        bad = await R.realSpawn({ args: ["--circuit", "mlp", "--seed", "7", "--out", path.join(tmp, "x.json")], env: { ...process.env, SWEK_6DOF_ORIENTATION: "euler" }, allowReal: true });
        good = await R.realSpawn({ args: ["--circuit", "plain14", "--seed", "1", "--iters", "1", "--out", path.join(tmp, "o.json")], env: { ...process.env, SWEK_6DOF_ORIENTATION: "euler" }, allowReal: true });
    } finally { console.error = keep; }
    ok("!! realSpawn runs the real trainer: a usage error comes back as its exit code 2, a good run as 0 with its file written, and the child's stderr is passed on behind [search <seed>]", bad.code === 2 && good.code === 0 && fs.existsSync(path.join(tmp, "o.json")) && lines.some((l) => /^\[search 7\] usage: node tools\/trainSubRobust\.mjs/.test(l)) && JSON.parse(fs.readFileSync(path.join(tmp, "o.json"), "utf8")).circuit === "plain14");
    // the real flying, on two dives (a pin, labelled as one: these are the numbers of the code as it stands, on a tiny set, not an independent truth)
    const T = await import("../../brain/subTask.mjs"), D2 = D;
    const sets = { audit: [T.scenario(95001, "nominal"), T.scenario(95001, "recovery")], safetyAudit: [T.scenario(95002, "current")], reserve: [T.scenario(95003, "nominal")] };
    const champ = (arm, f) => R.championWeights(D2.parseDump(fs.readFileSync(path.join(ENG, "brain", "rig-results", "plain14", f), "utf8"), f), arm, f).weights;
    const fly = await R.realFlyAudits("fly", champ("fly", "fly6310.json"), { sets, allowReal: true }), plain = await R.realFlyAudits("plain14", champ("plain14", "plain6310.json"), { sets, allowReal: true }), auto = await R.realFlyAudits("fly", null, { sets, allowReal: true }), auto2 = await R.realFlyAudits("plain14", null, { sets, allowReal: true });
    const near = (x, y) => Math.abs(x - y) < 5e-8, three = (r) => AUDITS.map((a) => r[a].score);
    const AUDITS = R.AUDITS;
    ok("!! the five-vessel audit of the stage-1 champion of draw 6310, FLY, on two tiny sets: audit -0.851277981, safety -0.339344476, reserve -0.349342947 (a regression pin), five vessels, no dive ended", near(fly.audit.score, -0.851277981) && near(fly.safetyAudit.score, -0.339344476) && near(fly.reserve.score, -0.349342947) && AUDITS.every((a) => fly[a].vessels === 5 && fly[a].crashed === 0));
    ok("!! the same for PLAIN14 (the other policy, a 954-weight net): audit -0.717514454, safety -0.360564472, reserve -0.355385228 (so the arm picks the policy)", near(plain.audit.score, -0.717514454) && near(plain.safetyAudit.score, -0.360564472) && near(plain.reserve.score, -0.355385228) && AUDITS.every((a) => plain[a].vessels === 5 && plain[a].crashed === 0));
    ok("!! the PD autopilot (weights null) on the same sets: audit -0.9491668257, safety -0.5344491073, reserve -0.5854266526, whichever arm asks, and it is not the champion's score", near(auto.audit.score, -0.9491668257) && near(auto.safetyAudit.score, -0.5344491073) && near(auto.reserve.score, -0.5854266526) && eq(three(auto), three(auto2)) && three(auto).every((x, i) => x !== three(fly)[i]));
    ok("each audit is the MEAN over five vessels of the score and the SUM over them of the early ends (not a single vessel's, and not a total)", (() => { const t = Object.fromEntries(Object.keys(sets).map((k) => [k, sets[k]])); return AUDITS.every((a) => fly[a].score > -2 && fly[a].score < 0); })());
    const crashy = await R.realFlyAudits("fly", new Array(963).fill(3), { sets, allowReal: true });
    ok("!! a weight list that makes real dives end early (all 3.0): the early ends are SUMMED over the five vessels and are not negative (audit 1, safety 0, reserve 1), the scores are the five-vessel means (-4.805981676, -4.378254438, -5.016615168)", crashy.audit.crashed === 1 && crashy.safetyAudit.crashed === 0 && crashy.reserve.crashed === 1 && near(crashy.audit.score, -4.805981676) && near(crashy.safetyAudit.score, -4.378254438) && near(crashy.reserve.score, -5.016615168));
    const w0 = Float32Array.from(champ("fly", "fly6310.json"));
    const again = await R.realFlyAudits("fly", Array.from(w0), { sets, allowReal: true });
    ok("a weight list given as an ordinary array or from a Float32Array flies the same (the tool converts), and it is deterministic", eq(three(again), three(fly)));
    const FIVE = await (async () => { const S = await import("../../physics/mechanics/subModel6dof.mjs"), P = await import("../../brain/pilotSubPolicy.mjs"), E = S.EXPLORER, VS = [{}, { munk: 3000 }, { munk: 0 }, { finArea: E.finArea * 0.6 }, { bg: E.bg * 2.5 }]; const per = VS.map((v) => P.evaluate(w0, sets.audit, { model: S.createSubModel(Object.freeze({ ...E, ...v })) }).score); return per.reduce((x, y) => x + y, 0) / 5; })();
    ok("!! an independent flight of the same champion on the same two dives, vessel by vessel, with the five vessels written out in this gate, averages to the tool's audit score", near(FIVE, fly.audit.score));
    fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- 8. the source -----------------------------------------------------------------------------------------------------------------------------------------
console.log("\n8. THE SOURCE");
{
    ok("!! THE FIRST-ORDER STEP IS SET BEFORE ANYTHING IMPORTS THE PHYSICS: the command file assigns SWEK_6DOF_ORIENTATION = \"euler\" first and imports the library afterwards, dynamically", CMD.indexOf('process.env.SWEK_6DOF_ORIENTATION = "euler"') > -1 && CMD.indexOf('process.env.SWEK_6DOF_ORIENTATION = "euler"') < CMD.indexOf('await import("./plain14RobustStage.mjs")') && !/^import /m.test(CMD.replace(/\/\/.*$/gm, "")));
    ok("the library reuses stage 1's exact test and its dump reader rather than copying them", /import \* as D from "\.\/plain14Distribution\.mjs"/.test(LIB) && /D\.readAudit\(/.test(LIB) && /D\.parseDump\(/.test(LIB) && !/function uCounts|function pAtLeast/.test(LIB));
    ok("no clock and no Math.random in the library (a draw's numbers come from the trainer's seeded generator and the fixed audits)", !/Math\.random|Date\.now|new Date/.test(LIB.replace(/\/\/.*$/gm, "")));
    ok("the physics, the policies and the audit sets are imported lazily (a report loads none of them)", !/^import .*(subTask|subModel6dof|pilotSub|autopilotSub|auditSubChampion)/m.test(LIB) && /await import\("\.\.\/\.\.\/brain\/subTask\.mjs"\)/.test(LIB));
    ok("the children are run by the real trainer with no shell: process.execPath, the trainer's absolute path, the engine as the working directory, stderr piped to the progress lines", /nodeSpawn\(process\.execPath, \[path\.join\(ENG, "tools", "trainSubRobust\.mjs"\), \.\.\.args\]/.test(LIB) && !/shell:\s*true/.test(LIB) && /cwd: ENG/.test(LIB) && /\[search \$\{tag\}\]/.test(LIB));
    ok("the champion is picked by the HELD-OUT score, never by an audit (no audit number appears in pickChampion)", /heldScore/.test(LIB.slice(LIB.indexOf("export function pickChampion"), LIB.indexOf("// ---- running one draw"))) && !/audit|Audit/.test(LIB.slice(LIB.indexOf("export function pickChampion"), LIB.indexOf("// ---- running one draw"))));
    ok("the registration exists, and says the one thing a reader must not miss: this is one stage, not the chain", fs.existsSync(path.join(ENG, "brain", "PLAIN14_ROBUST_STAGE_WIP.md")) && /one-stage control, not the chain/.test(fs.readFileSync(path.join(ENG, "brain", "PLAIN14_ROBUST_STAGE_WIP.md"), "utf8")));
}

clearTimeout(WATCHDOG);
console.log(fails ? `\nplain14RobustStage-selfcheck: ${fails} FAILED` : "\nplain14RobustStage-selfcheck: all checks pass");
if (fails) process.exit(1);
