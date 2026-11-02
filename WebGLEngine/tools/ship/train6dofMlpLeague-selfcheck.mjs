// WebGLEngine/tools/ship/train6dofMlpLeague-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/train6dofMlpLeague-selfcheck.mjs      (~25 s)
//
// THE GATE OF tools/ship/train6dofMlpLeague.mjs (and its command, tools/ship/trainMlp6dofLeague.mjs): Round 2 of the GPU Brain's 6-DOF arc, as brain/SIXDOF_GPU_BRAIN_WIP.md registers it.
// *** NOTHING HERE FLIES A REGISTERED HELD-OUT, AUDIT OR CHECK SEED, AND NOTHING HERE STARTS THE COMMAND'S ROUND. *** The miniature is handed scratch seeds (99601 up), and the command's guards are held as the
// library functions they are plus the order the command calls them in; the only executions are --write-from on planted files, which cannot reach a round.
//
//   1  THE REGISTRATION, AS CODE: the recipe is the fruit fly's league recipe with only the search seeds changed; the train and held-out seeds ARE the fly league's; the audit (6301-6340) is fresh and clear of
//      every block a 6-DOF tool or gate had flown; the check seeds are the first round's audit; qualifies() and LEAD_FLOOR ARE train6dofLeague.mjs's; the league is the PD autopilot and the registered Default;
//      the start is the registered champion
//   2  THE RULE ON MADE-UP NUMBERS: qualifies() at each of its five edges as this round reads it (the Default the pilot to beat, the start the one not to regress from), and H2 at its edge
//   3  THE ROUND ON A MINIATURE (two searches of 40 iterations on 2 scratch train seeds, scratch held-out, audit and check seeds): C-files first, the searches and the determinism twin in one call, the champion
//      the best held-out (a planted pair whose orders disagree), pruned toward the START, the audit read, the verdict qualifies() of the champion, H2 from the same games, C-determinism able to fail
//   4  THE COMMAND: it never overwrites, refuses an option it does not know, prints no score, and writes the weight file only from a results file whose champion qualified
//   5  THE VERDICT, AS CODE, FROM THE COMMITTED FILE: the registered run, C-files and C-determinism, the champion the rule's pick, its tallies re-flown from its weights, H1 not met and H2 met by the rules,
//      the predictions as the file decides them, the note tied to the file, and nothing written (--write-from refuses the file). Section 5 flies the registered seeds again: they are spent.
//
// SABOTAGE LOG (2026-11-02) -- each applied with the byte-safe runner, this gate run, the file restored byte-identical (sha256); the number is the rows that went red, by name:
//   G1 the recipe at 600 iterations 1 | G2 the audit on a used block 1 | G3 the league without the Default 1 | G4 pruned toward the hand weights 2 | G5 the pick on train score 1
//   G6 the audit read against the autopilot 1 | G7 the twin of the second search 2 | G8 C-determinism always ok 1 | G9 C-files ignoring the start file given 1 (section 3 throwing: the round searched)
//   G10 the start's hash not checked 1 | G11 the command never refusing 1 | G12 parseArgs accepting anything 1 | G13 --write-from writing whatever the verdict 2 | G14 the command printing the result 1
//   G15 H2 strict at its edge 1
//   FOUND BEFORE THE SABOTAGES, each a row that could not have gone red: (1) the first miniature's searches (6 iterations) pruned back to the start, so "pruned toward the start" and the determinism twin
//   were 0 = 0 -- now 40 iterations, and a row that says a search kept weights; (2) the planted pick's two searches agreed in both orders (the first round's T3 again) -- now a pilot of zeros with the
//   higher train score against the start; (3) the audit could have been read against the wrong opponent unseen, since the verdict row recomputed from the same object -- now recomputed independently;
//   (4) the start's hash check was never exercised -- now a good file with other weights.
// SABOTAGE LOG, SECTION 5 (2026-11-02, after the verdict) -- the same runner, with the committed results file, the note or the command edited; every file restored byte-identical:
//   V1 the file not flagged as the registered seeds 1 | V2 the verdict ok 4 (H1, the predictions, the note, and --write-from then writing) | V3 search 7100's held-out score past the champion's 2
//   V4 H2's gain 36 1 | V5 the champion's audit at 10 wins 4 | V6 the twin's hash different 2 | V7 a champion weight changed 2 | V8 the note's audit numbers drifted 1 | V9 the note saying P3 wrong 1
//   V10 --write-from writing whatever the verdict 3
"use strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as L from "./train6dofMlpLeague.mjs";
import * as LG from "./train6dofLeague.mjs";
import * as T from "./train6dofMlp.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as M from "../../brain/pilot6dofMlp.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now(), J = JSON.stringify, range = (a, n) => Array.from({ length: n }, (_, i) => a + i);
const guard = (n, e) => ok(`section ${n} ran without throwing`, false, String(e && e.stack || e).split("\n").slice(0, 2).join(" ").slice(0, 240));

console.log("1. THE REGISTRATION, AS CODE");
try {
    const same = ["runs", "iters", "sigma", "maxK", "train"].every((k) => L.RECIPE[k] === LG.RECIPE[k]);
    ok("!! the recipe is the fruit fly's league recipe (4 searches x 800 iterations, sigma 0.3, 1-4 weights a child, 48 train seeds) with ONLY the search seeds changed (7100 against 4000), frozen",
        same && L.RECIPE.seed === 7100 && LG.RECIPE.seed === 4000 && L.RECIPE.runs === 4 && L.RECIPE.iters === 800 && L.RECIPE.train === 48 && Object.isFrozen(L.RECIPE));
    ok("!! the train and held-out seeds ARE the fly league's own (48: 201-248; 24: 301-324), and the check against the PD autopilot is the first round's audit (6101-6120)",
        L.TRAIN_SEEDS === P6.LEAGUE_TRAIN_SEEDS && L.HELD_SEEDS === P6.LEAGUE_HELD_OUT_SEEDS && L.TRAIN_SEEDS.length === 48 && L.TRAIN_SEEDS[0] === 201 && L.HELD_SEEDS.length === 24 && L.HELD_SEEDS[0] === 301 && L.AUTO_SEEDS === T.AUDIT_SEEDS);
    const used = new Set(L.USED_DUEL_SEEDS);
    ok("!! the audit is 40 fresh seeds (6301-6340), clear of every block a 6-DOF tool or gate had flown (the first round's list, its audit 6101-6120 and H2 6201-6240, and this chat's scratch seeds 99001-99702)",
        L.AUDIT_SEEDS.length === 40 && L.AUDIT_SEEDS[0] === 6301 && L.AUDIT_SEEDS[39] === 6340 && Object.isFrozen(L.AUDIT_SEEDS) && L.AUDIT_SEEDS.every((s) => !used.has(s)) && used.has(6101) && used.has(6240) && used.has(201) && used.has(99702));
    ok("!! qualifies() IS train6dofLeague.mjs's, and LEAD_FLOOR (8) and REGRESSION_SLACK (0.5) are its own", L.qualifies === LG.qualifies && L.LEAD_FLOOR === LG.LEAD_FLOOR && L.LEAD_FLOOR === 8 && L.REGRESSION_SLACK === LG.REGRESSION_SLACK && L.REGRESSION_SLACK === 0.5);
    const start = L.startWeights(), fly = T.flyDefault(), lg = L.leagueOf(fly);
    ok("!! C-files: the start is the registered champion (0ffd8554, 1,637 weights) and the league is the PD autopilot and the registered Default (215e26d9), each through the page's importers",
        weightsHash(start) === "0ffd8554" && L.START_HASH === "0ffd8554" && start.length === M.WEIGHT_COUNT && lg.length === 2 && lg[0] === "autopilot" && lg[1] === fly && weightsHash(fly) === "215e26d9");
    let wrong = null; try { L.startWeights(path.join(HERE, "..", "..", "brain", "pilot6dofWeightsDefault.json")); } catch (e) { wrong = e.message; }
    ok("  ...and another file is REFUSED as the start (the fruit fly's Default is another network)", /does not import/.test(wrong || ""), wrong);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mlpstart-")), other = path.join(tmp, "hand.json"); fs.writeFileSync(other, J(PB.exportBrain(PB.describePolicy(L.POLICY_ID, M), M.handWeights())));
    let byHash = null; try { L.startWeights(other); } catch (e) { byHash = e.message; } fs.rmSync(tmp, { recursive: true, force: true });
    ok("!! ...and so is the RIGHT network with other weights: the MLP's hand weights in a good file are refused by their hash", /not the registered 0ffd8554/.test(byHash || ""), byHash);
} catch (e) { guard(1, e); }

console.log("\n2. THE RULE ON MADE-UP NUMBERS");
try {
    const r = (score, wins, losses, draws = 0) => ({ score, wins, losses, draws, hits: 0, hitsTaken: 0 });
    const base = () => ({ audit: { vsPrev: r(19, 30, 22, 28), mirror: r(18.4, 20, 20, 40), start: r(14, 0, 70, 10) }, heldOut: { vsPrev: r(19, 12, 11, 25) }, auto: { champ: r(19.9, 20, 0, 20), prev: r(19.9, 20, 0, 20) } });
    const q = (fn) => { const c = base(); fn(c); return L.qualifies(c, LG.PROFILES.league); };
    ok("!! a champion at every edge QUALIFIES: a lead of exactly 8 over the Default, a score above the Default's mirror, a held-out lead of 1, no more losses to the autopilot, a score 0.5 below the start's", q((c) => { c.auto.champ.score = 19.4; }).ok);
    ok("!! ...and each edge, crossed, does not: a lead of 7; a score equal to the mirror's; a held-out lead of 0; one more loss to the autopilot than the start; a score more than 0.5 below the start's",
        !q((c) => { c.audit.vsPrev.losses = 23; }).ok && !q((c) => { c.audit.vsPrev.score = 18.4; }).ok && !q((c) => { c.heldOut.vsPrev.losses = 12; }).ok && !q((c) => { c.auto.champ.losses = 1; }).ok && !q((c) => { c.auto.champ.score = 19.39; }).ok,
        q((c) => { c.audit.vsPrev.losses = 23; }).reasons[0]);
    ok("!! H2 at its edge: a gain of exactly 8 over the start's lead is met, 7 is not", L.h2Of(-62, -70).met && L.h2Of(-62, -70).gain === 8 && !L.h2Of(-63, -70).met);
} catch (e) { guard(2, e); }

console.log("\n3. THE ROUND ON A MINIATURE (scratch seeds only)");
try {
    const opts = { runs: 2, iters: 40, seed: 99600, sigma: 0.3, maxK: 4, train: 2, trainSeeds: range(99601, 2), heldSeeds: range(99611, 2), auditSeeds: range(99621, 3), autoSeeds: range(99631, 2) };
    const calls = [], raw = [];
    const seq = async (seeds) => { calls.push([...seeds]); const out = seeds.map((seed) => L.searchOne({ seed, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK, trainSeeds: opts.trainSeeds })); raw.push(...out); return out; };
    const r = await L.run(opts, seq), start = L.startWeights();
    ok("!! C-files first, then ONE call with the searches AND the determinism twin of the first (99600, 99601, then 99600 again); the result says it did not use the registered seeds",
        r.cFiles && r.cFiles.ok && calls.length === 1 && J(calls[0]) === J([99600, 99601, 99600]) && r.registeredSeeds === false && !r.stopped, J(calls));
    const best = [...r.searches].sort((a, b) => b.held.score - a.held.score || a.seed - b.seed)[0];
    const fromStart = (w) => w.filter((v, i) => Math.abs(v - start[i]) > 1e-6).length;
    ok("!! every search is pruned toward the START: in each, the weights that differ from the start are exactly the ones it kept, and the miniature is not empty (at least one search kept weights, so this is not 0 = 0)",
        raw.length === 3 && raw.every((s) => fromStart(s.weights) === s.kept) && raw.some((s) => s.kept > 0), raw.map((s) => `${s.seed}: ${s.kept} kept`).join(", "));
    ok("!! the champion is the best HELD-OUT league search, and its weights are that search's", r.champion.seed === best.seed && r.champion.differsFromStart === r.champion.kept && r.champion.weights.length === M.WEIGHT_COUNT, `champion ${r.champion.seed}, ${r.champion.kept} kept`);
    ok("!! the verdict is qualifies() of the champion with the Default as the pilot to beat and the start as the autopilot baseline, and H2 is read from the same audit games",
        J(r.verdict) === J(L.qualifies(r.champion, LG.PROFILES.league)) && r.h2.champLead === r.champion.audit.vsPrev.wins - r.champion.audit.vsPrev.losses && r.h2.startLead === r.champion.audit.start.wins - r.champion.audit.start.losses &&
        r.champion.audit.vsPrev.wins + r.champion.audit.vsPrev.losses + r.champion.audit.vsPrev.draws === 6, J(r.h2));
    const fly = T.flyDefault(), cw = Float32Array.from(r.champion.weights), cp = (x) => ({ score: x.score, wins: x.wins, losses: x.losses, draws: x.draws, hits: x.hits, hitsTaken: x.hitsTaken });
    const indep = { vsPrev: cp(M.evaluate(cw, opts.auditSeeds, { opponent: [fly] })), mirror: cp(P6.evaluate(fly, opts.auditSeeds, { opponent: [fly] })), start: cp(M.evaluate(start, opts.auditSeeds, { opponent: [fly] })),
                    held: cp(M.evaluate(cw, opts.heldSeeds, { opponent: [fly] })), autoC: cp(M.evaluate(cw, opts.autoSeeds, { opponent: ["autopilot"] })), autoS: cp(M.evaluate(start, opts.autoSeeds, { opponent: ["autopilot"] })) };
    ok("!! the audit is read against the RIGHT opponents, recomputed here independently: the champion against the Default, the Default against itself, the start against the Default, the held-out record against the Default, and both against the PD autopilot on the check seeds",
        J(r.champion.audit.vsPrev) === J(indep.vsPrev) && J(r.champion.audit.mirror) === J(indep.mirror) && J(r.champion.audit.start) === J(indep.start) && J(r.champion.heldOut.vsPrev) === J(indep.held) && J(r.champion.auto.champ) === J(indep.autoC) && J(r.champion.auto.prev) === J(indep.autoS));
    ok("!! C-determinism: the twin of the first search gave the same weights to the bit, and that search moved weights (so the twin is a real repeat, not two copies of the start)",
        r.cDeterminism && r.cDeterminism.ok && r.cDeterminism.seed === 99600 && r.cDeterminism.first === r.cDeterminism.again && raw[0].kept > 0 && raw[2].hash === raw[0].hash, `${raw[0].kept} kept`);
    const w = Array.from(start), hh = weightsHash(start);
    // the pick where train and held-out DISAGREE: seed 1 is a pilot of zeros (it never fires) with the higher train score, seed 2 the start with the lower one -- a first draft planted two near-copies of the
    // start, both orders picked the same search, and the row could not have caught a pick made on train
    const planted = [{ seed: 1, weights: new Array(M.WEIGHT_COUNT).fill(0), hash: "zeros", trainScore: 30, kept: 0, moved: 0 }, { seed: 2, weights: w, hash: hh, trainScore: 10, kept: 0, moved: 0 }];
    const fin = L.finish(planted, null, { start, heldSeeds: range(99641, 2), auditSeeds: range(99651, 1), autoSeeds: range(99661, 1) });
    const heldBest = [...fin.searches].sort((a, b) => b.held.score - a.held.score || a.seed - b.seed)[0].seed, trainBest = [...fin.searches].sort((a, b) => b.trainScore - a.trainScore)[0].seed;
    ok("!! the pick is on held-out alone: of two planted searches whose orders DISAGREE, the champion is the held-out one (seed 2), not the train one (seed 1)", fin.champion.seed === 2 && heldBest === 2 && trainBest === 1, `held-out picks ${heldBest}, train would pick ${trainBest}`);
    const bad = L.finish(planted, { seed: 1, hash: "deadbeef" }, { start, heldSeeds: range(99641, 2), auditSeeds: range(99651, 1), autoSeeds: range(99661, 1) });
    ok("!! C-determinism can fail: a twin with other weights is not ok", bad.cDeterminism && bad.cDeterminism.ok === false && bad.cDeterminism.again === "deadbeef");
    const stopped = await L.run({ ...opts, startFile: path.join(HERE, "..", "..", "brain", "pilot6dofWeightsDefault.json") }, async () => { throw new Error("searched"); });
    ok("!! C-files can fail, and then nothing is searched: a wrong start file stops the round before the first search", /C-files failed, so nothing was searched/.test(stopped.stopped || "") && !stopped.champion, stopped.stopped);
    const blob = L.blobOf({ ...r, recipe: { runs: 4, iters: 800, seed: 7100, sigma: 0.3, maxK: 4, train: 48 } }), back = PB.importBrain(PB.describePolicy(L.POLICY_ID, M), blob), other = PB.importBrain(PB.describePolicy("pilot6dofPolicy", P6), blob);
    ok("  the weight file round-trips as the GPU Brain's pilot with the league recipe in `by`, and the fruit fly's importer refuses it",
        back.ok && weightsHash(back.weights) === r.champion.hash && !other.ok && /LEAGUE recipe on the GPU Brain's MLP, from its champion 0ffd8554/.test(blob.by) && /\(7100\.\.7103\)/.test(blob.by));
} catch (e) { guard(3, e); }

console.log("\n4. THE COMMAND (its round is never started)");
try {
    const cmd = path.join(HERE, "trainMlp6dofLeague.mjs"), src = fs.readFileSync(cmd, "utf8"), code = src.replace(/\/\/.*$/gm, "");
    let typo = null; try { L.parseArgs(["--iter", "3"]); } catch (e) { typo = e.message; }
    const atParse = code.indexOf("parseArgs(argv)"), atRefuse = code.indexOf("refuseExisting(opts.results)"), atRun = code.indexOf("await run(opts");
    ok("!! the command never overwrites a results file and refuses an option it does not know: refuseExisting() and parseArgs() as the library has them, called in that order before run(), exiting 2 on either",
        /never overwritten/.test(L.refuseExisting("/any/r.json", () => true) || "") && L.refuseExisting("/any/r.json", () => false) === null && /unknown option "--iter"/.test(typo || "") &&
        atParse > 0 && atRefuse > atParse && atRun > atRefuse && /process\.exit\(2\)/.test(code.slice(atRefuse, atRefuse + 120)) && /process\.exit\(2\)/.test(code.slice(atParse, atParse + 140)), typo);
    ok("  ...and it prints no score: the results go to the file, and the console says only where",
        !/describeEval|\.score|heldOut\.|audit\.|h2\./.test(code.replace(/result\.verdict && result\.verdict\.reasons|!result\.verdict \|\| !result\.verdict\.ok/g, "")) && /commit it before reading it/.test(code) &&
        (code.match(/console\.log\(/g) || []).length === 3, `${(code.match(/console\.log\(/g) || []).length} console.log calls (the two of --write-from, and where the results went)`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mlpleague-")), notOk = path.join(tmp, "n.json"); fs.writeFileSync(notOk, J({ verdict: { ok: false, reasons: ["planted"] } }));
    let wrote = ""; try { execFileSync(process.execPath, [cmd, "--write-from", notOk, "--out", path.join(tmp, "w.json")], { encoding: "utf8", stdio: "pipe" }); } catch (e) { wrote = String(e.stdout); }
    ok("!! --write-from writes no weight file from a results file whose champion did not qualify, and says why", /not written: the champion did not qualify -- planted/.test(wrote) && !fs.existsSync(path.join(tmp, "w.json")), wrote.trim());
    fs.rmSync(tmp, { recursive: true, force: true });
} catch (e) { guard(4, e); }

console.log("\n5. THE VERDICT, AS CODE, FROM THE COMMITTED FILE (brain/sixdofGpuLeagueResults.json, committed unread at 7425ba66)");
try {
    // Written AFTER the file was read. Every number the note's Round 2 verdict states is re-derived here from the file, and the champion's tallies are re-flown from its weights at this head. The registered
    // held-out, audit and check seeds were read once, by the registered run, and are spent: flying them again chooses nothing.
    const R = JSON.parse(fs.readFileSync(L.DEFAULT_RESULTS, "utf8")), c = R.champion, cw = Float32Array.from(c.weights), start = L.startWeights(), fly = T.flyDefault(), lg = L.leagueOf(fly);
    const cp = (x) => ({ score: x.score, wins: x.wins, losses: x.losses, draws: x.draws, hits: x.hits, hitsTaken: x.hitsTaken }), lead = (x) => x.wins - x.losses, d = P6.describeEval;
    ok("!! the file is the registered run: the recipe, the held-out (301, 24), audit (6301, 40) and check (6101, 20) seeds and flagged so, four searches on 7100-7103, not stopped",
        R.registration === L.REGISTRATION && ["runs", "iters", "seed", "sigma", "maxK", "train"].every((k) => R.recipe[k] === L.RECIPE[k]) && J(R.seeds) === J({ held: [301, 24], audit: [6301, 40], auto: [6101, 20] }) &&
        R.registeredSeeds === true && !R.stopped && J(R.searches.map((x) => x.seed)) === J([7100, 7101, 7102, 7103]), J(R.recipe));
    const twin = R.searches.find((x) => x.seed === 7100);
    ok("!! C-files held (the start 0ffd8554, the Default 215e26d9), and C-determinism held: search 7100 run twice gave the same weights (95b8cbc2 both times)",
        J(R.cFiles) === J({ ok: true, start: "0ffd8554", fly: "215e26d9" }) && R.cDeterminism.ok === true && R.cDeterminism.seed === 7100 && R.cDeterminism.first === twin.hash && R.cDeterminism.again === twin.hash && twin.hash === "95b8cbc2");
    const pick = [...R.searches].sort((a, b) => b.held.score - a.held.score || a.seed - b.seed)[0], differ = c.weights.filter((v, i) => Math.abs(v - start[i]) > 1e-6).length;
    ok("!! the champion is the rule's pick from the file's four (best held-out league score): 7102, its hash 6934d951 is the weights', and they differ from the start at exactly the 97 kept",
        c.seed === pick.seed && c.seed === 7102 && c.hash === pick.hash && weightsHash(cw) === c.hash && c.hash === "6934d951" && differ === c.kept && c.kept === 97 && c.differsFromStart === 97, `${differ} differ`);
    const re = { held: cp(M.evaluate(cw, L.HELD_SEEDS, { opponent: lg })), vsPrev: cp(M.evaluate(cw, L.AUDIT_SEEDS, { opponent: [fly] })), mirror: cp(P6.evaluate(fly, L.AUDIT_SEEDS, { opponent: [fly] })),
                 start: cp(M.evaluate(start, L.AUDIT_SEEDS, { opponent: [fly] })), heldVs: cp(M.evaluate(cw, L.HELD_SEEDS, { opponent: [fly] })), autoC: cp(M.evaluate(cw, L.AUTO_SEEDS, { opponent: ["autopilot"] })), autoS: cp(M.evaluate(start, L.AUTO_SEEDS, { opponent: ["autopilot"] })) };
    ok("!! the code at this head flies the file's numbers: the champion's held-out league score, its audit against the Default, the Default's mirror, the start against the Default, the held-out record and both checks against the PD autopilot, re-flown, equal the file's to the last digit",
        J(re.held) === J(c.held) && J(re.vsPrev) === J(c.audit.vsPrev) && J(re.mirror) === J(c.audit.mirror) && J(re.start) === J(c.audit.start) && J(re.heldVs) === J(c.heldOut.vsPrev) && J(re.autoC) === J(c.auto.champ) && J(re.autoS) === J(c.auto.prev),
        `audit ${d(re.vsPrev)}`);
    const v = L.qualifies(c, LG.PROFILES.league);
    ok("!! H1 IS NOT MET, by train6dofLeague.qualifies() applied to the file with the Default as the pilot to beat: it fails the audit lead (-37 against 8), the score against the mirror, and the held-out lead -- and passes both autopilot checks -- as the file's verdict says",
        v.ok === false && J(v) === J(R.verdict) && v.reasons.length === 3 && /leads the shipped pilot by -37 games/.test(v.reasons[0]) && /does not beat the shipped pilot's own 18\.35/.test(v.reasons[1]) && /held-out: 5 won and 24 lost/.test(v.reasons[2]), v.reasons.join(" | ").slice(0, 200));
    const h2 = L.h2Of(lead(c.audit.vsPrev), lead(c.audit.start));
    ok("!! H2 IS MET: on the same 80 audit games the start's lead over the Default is -74 and the champion's -37, a gain of 37 against the floor of 8, as the file's h2 says", J(h2) === J(R.h2) && h2.met && h2.gain === 37 && h2.startLead === -74, J(h2));
    const pred = { P1: R.verdict.ok === false, P2: R.h2.met === true, P3: R.h2.startLead <= -50, P4: c.kept >= 10 && c.kept <= 150 };
    ok("!! the four predictions, read off the file: all four right (H1 not met, H2 met, the start at -74, 97 weights kept)", Object.values(pred).every(Boolean), J(pred));
    const note = fs.readFileSync(path.join(HERE, "..", "..", "brain", "SIXDOF_GPU_BRAIN_WIP.md"), "utf8"), at = note.indexOf("\n### Round 2: the verdict"), vt = at >= 0 ? note.slice(at) : "";
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), stands = (x) => new RegExp("(?<![0-9])" + esc(x) + "(?![0-9])").test(vt), wl = (x) => `W${x.wins}/L${x.losses}/D${x.draws}`;
    const rowOf = (x) => { const b = x.seed === c.seed ? "**" : ""; return `| ${b}${x.seed}${b} | ${x.trainScore.toFixed(2)} | ${b}${d(x.held)}${b} | ${x.improved} | ${x.neutral} | ${x.moved} | ${x.kept} |`; };
    const mins = R.searches.map((x) => Math.round(x.ms / 60000));
    const frags = [...R.searches.map(rowOf), `hash ${c.hash}, ${c.kept} weights`, `${wl(c.audit.vsPrev)} against the Default`, `a lead of ${lead(c.audit.vsPrev)}`, `${c.audit.vsPrev.score.toFixed(2)} against the Default`,
                   `own ${c.audit.mirror.score.toFixed(2)} against itself (${wl(c.audit.mirror)})`, `${wl(c.heldOut.vsPrev)} against the Default`, `${wl(c.auto.champ)} against the start's`, wl(c.auto.prev),
                   `start went ${wl(c.audit.start)}`, `a gain of ${h2.gain}`, R.cDeterminism.again, `${Math.min(...mins)} to ${Math.max(...mins)} minutes`, "H1 is not met", "H2 is met", ...Object.keys(pred).map((k) => `**${k}: ${pred[k] ? "right" : "wrong"}.**`)];
    const missing = frags.filter((x) => !stands(x));
    ok("!! the note's Round 2 verdict carries the file's numbers and each prediction's outcome as the file decides it (no digit may touch a fragment's ends)", at > 0 && missing.length === 0, missing.length ? "missing: " + missing.join(" || ").slice(0, 300) : `${frags.length} fragments`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mlpleague-v-")), outF = path.join(tmp, "w.json");
    let said = ""; try { execFileSync(process.execPath, [path.join(HERE, "trainMlp6dofLeague.mjs"), "--write-from", L.DEFAULT_RESULTS, "--out", outF], { encoding: "utf8", stdio: "pipe" }); } catch (e) { said = String(e.stdout); }
    ok("!! H1 was not met, so NOTHING IS WRITTEN: brain/pilot6dofMlpWeightsLeague.json does not exist, and --write-from refuses the committed file with its verdict's first reason",
        !fs.existsSync(L.DEFAULT_OUT) && !fs.existsSync(outF) && /not written: the champion did not qualify -- audit: leads the shipped pilot by -37 games/.test(said), said.trim().slice(0, 160));
    fs.rmSync(tmp, { recursive: true, force: true });
} catch (e) { guard(5, e); }

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: whether more iterations, more searches or another network would close the rest of the gap, and how this champion does on the page -- none of it registered.");
process.exit(fails ? 1 : 0);
