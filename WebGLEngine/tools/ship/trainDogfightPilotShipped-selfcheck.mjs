// WebGLEngine/tools/ship/trainDogfightPilotShipped-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time) (beside tools/ship/trainDogfightPilot.mjs) (~2 min: it flies the shipped pilot's whole grading again, and the autopilot's)
//
// Run: node tools/ship/trainDogfightPilotShipped-selfcheck.mjs
//
// THE SHIPPED DOGFIGHT PILOTS ARE WHAT THEIR `by` SAYS. tools/ship/trainDogfightPilot-selfcheck.mjs holds the TOOL (the parser, the sets, the rules, the verdict, the command) on scripted numbers and on eight throwaway fights; this gate takes
// the files the tool WROTE -- brain/pilotDogfightWeightsDefault.json (the fruit fly) and, when its champion qualified, brain/pilotDogfightMlpWeightsDefault.json (the GPU Brain) -- and flies the whole grading again from their weights: finish() on the
// one search the file is, on the tool's own sets for that brain, and blobOf() on the result. Split from the tool's gate because it costs two minutes and the tool's sabotages (fifty-one of them) would each have paid it.
//
//   1  THE FILE      a swek-brain-v1 blob for pilotFlightPolicy (or pilotFlightMlp) with the right number of weights that the importer the page uses accepts; a `by`, a score and the citation; and it is NOT the autopilot (differs from the hand weights
//                    in more than 20 and fewer than 400 weights, 1,796 for the GPU Brain's fewer than 600)
//   2  THE GRADING   the weights are graded AGAIN by the tool's finish() -- the autopilot and the champion on the held-out fights, the pool, then the audit, the reserve and the safety audit -- and blobOf() of that result is the file BYTE FOR BYTE
//                    in `by`, `score`, `citation` and the weights (the audit numbers it quotes are the ones it earns now, the opponent's, the sets', the rules' and the task's included: a change to any of them makes the file stale and this red)
//   3  THE RULES     the champion is ELIGIBLE on the pool (it loses no fight to the ground or a collision that the autopilot does not, and its stalls are within the allowance) and QUALIFIES under qualifies() AS IT STANDS NOW; it beats the autopilot on
//                    the held-out fights and the audit by more than 0.05; and the autopilot's own numbers on those sets are pinned (the GPU Brain's are the same autopilot on another audit pair)
//
// A SPENT AUDIT, SAID PLAINLY: the audit and safety audit named in a shipped file's `by` were read ONCE, by the champion that was shipped. This gate reads them again to check the file, which selects nothing. A retrain draws a FRESH pair (the tool
// refuses nothing here: brain/dogfightTask.mjs names AUDIT5 as the next one to add, and the trainer gate's "spent audit" row is where it is declared spent).
//
// SABOTAGE LOG -- SIXTEEN, applied to the shipped files, the tool, or the task in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red); Z1-Z12 on the fruit fly's file and the tool and the task, Z13-Z16 on the GPU Brain's file:
//   Z1 one weight nudged (0.55 -> 0.56) 2 | Z2 `by` says 94 fights better, not 93 1 | Z3 the file's score edited 1 | Z4 the file names the other policy 1 | Z5 the citation no longer says dogfights 2
//   Z6 weightCount off by one 2 | Z7 the opponent sentence cut from `by` 1 | Z8 the z floor raised to 6 (the shipped pilot's 4.94 no longer qualifies) 1
//   Z9 the task changed under the file (BREAK_RANGE 140 -> 100: the champion is then ineligible on the pool, so the rows after it have nothing to read) 1 | Z10 the audit set swapped for another pair 2
//   Z11 the weights array one short 1 | Z12 the held-out set swapped for the training set (the champion is picked on the wrong fights) 2
//   Z13 the GPU file's `by` says 68 fights better 1 | Z14 the GPU file's weightCount off by one 2 | Z15 the GPU file's score edited 1 | Z16 the GPU file names the fruit fly's policy 1
// AN EQUIVALENT MUTANT, SAID PLAINLY: KEEP_OUT_RANGE 30 -> 31 and 30 -> 90 in brain/dogfightTask.mjs go 0 red. The keep-out rule is DORMANT in the fruit fly's shipped fights: the guidance asks for less airspeed than the opponent flies inside 220 m, so nothing closes inside 90 m. The rule exists for pilots that ignore the airspeed they are asked for
//   (the first training run's champion did, and collided), and brain/dogfightTask-selfcheck.mjs holds it on a pilot that does.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as TR from "./trainDogfightPilot.mjs";
import * as PF from "../../brain/pilotFlightPolicy.mjs";
import * as MF from "../../brain/pilotFlightMlp.mjs";
import * as PB from "../../brain/peerBrain.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

console.log("trainDogfightPilotShipped-selfcheck -- the shipped dogfight pilots are what their `by` says\n");

const BRAINS = [
    { id: "fly", file: "pilotDogfightWeightsDefault.json", policy: PF, name: "THE FRUIT FLY", required: true, count: 1099, citation: /Giant Fiber Circuit/, keptMax: 400,
        autopilot: { audit: "0.5150", safetyLost: 3, safetyDeep: 0, safetyBrush: 0, poolLost: 1 } },
    { id: "gpu", file: "pilotDogfightMlpWeightsDefault.json", policy: MF, name: "THE GPU BRAIN", required: false, count: 1796, citation: /GPU Brain/, keptMax: 600,
        autopilot: { audit: "0.4519", safetyLost: 0, safetyDeep: 0, safetyBrush: 0, poolLost: 1 } },
];

let n = 0;
for (const B of BRAINS) {
    n++;
    console.log(`${n}. ${B.name} (brain/${B.file})`);
    const file = path.join(ENG, "brain", B.file), exists = fs.existsSync(file);
    if (!exists && !B.required) { console.log(`  (no file shipped for the GPU Brain: either it has not been trained yet or its champion did not qualify under the rules and the tool wrote nothing; tools/ship/trainPilotDogfight.mjs --brain gpu --dump says which)\n`); continue; }
    ok("the shipped pilot exists (the page fetches it)", exists, file);
    if (!exists) { console.log(); continue; }
    const blob = JSON.parse(fs.readFileSync(file, "utf8")), POLICY = B.id === "fly" ? "pilotFlightPolicy" : "pilotFlightMlp", DESC = PB.describePolicy(POLICY, B.policy), imp = PB.importBrain(DESC, blob), by = blob.by || "";
    ok(`!! it is a swek-brain-v1 file for ${POLICY} with ${B.count.toLocaleString("en-US")} weights that the importer the page uses accepts, and it carries a \`by\`, a score and the citation`,
        imp.ok && blob.weightCount === B.count && blob.weights.length === B.count && by.length > 600 && typeof blob.score === "number" && B.citation.test(blob.citation || "") && /trained on dogfights/.test(blob.citation || ""), imp.ok ? "" : imp.reason);
    if (!imp.ok) { console.log(); continue; }
    const w = imp.weights, hw = B.policy.handWeights(), kept = Array.from(w).filter((v, i) => v !== hw[i]).length;
    ok(`it is a trained pilot and not the autopilot: it differs from the hand weights in more than 20 and fewer than ${B.keptMax} weights`, kept > 20 && kept < B.keptMax, `${kept} weights differ`);
    const opts = { brain: B.id, runs: TR.RECIPE.runs, iters: TR.RECIPE.iters, seed: B.id === "gpu" ? 9000 : TR.RECIPE.seed, sigma: TR.RECIPE.sigma, maxK: TR.RECIPE.maxK, smoke: false };
    const seedOfFile = Number((/seed (\d+) of \d+ runs/.exec(by) || [])[1]);
    const run = { k: seedOfFile - opts.seed, seed: seedOfFile, weights: Float32Array.from(w), trainScore: 0, improved: 0, neutral: 0, moved: kept, kept };
    const t0 = Date.now(), log = [], res = TR.finish(opts, [run], (m) => log.push(m), TR.setsOf(opts));
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    ok("!! the seed the file names is one of the recipe's runs (seed 8000..8003, 9000..9003)", Number.isInteger(run.k) && run.k >= 0 && run.k < opts.runs, `seed ${seedOfFile}`);
    const c = res.champion;
    ok("!! *** THE SHIPPED PILOT QUALIFIES UNDER THE RULES AS THEY STAND NOW ***: every clause of qualifies(), recomputed from its weights (the held-out fights, the audit with every kind, the reserve, the lost-fight and safety-audit tails)", !!c && res.verdict.ok, c ? res.verdict.reasons.join("; ") || `${secs} s` : res.verdict.reasons.join("; "));
    if (!c) { console.log(); continue; }
    ok("!! and it was ELIGIBLE: on the 400-fight pool it loses no fight to the ground or a collision that the autopilot does not, and its deep stalls and brushes are within the allowance", res.runs[0].eligible === true, res.runs[0].ineligible.join("; "));
    ok("it beats the autopilot, not just ties it: held-out and audit each better by more than 0.05, and more fights better than worse on the audit", c.heldOut.score > res.hand.heldOut.score + 0.05 && c.audit.score > res.hand.audit.score + 0.05 && c.vs.better > c.vs.worse,
        `held-out ${c.heldOut.score.toFixed(4)} vs ${res.hand.heldOut.score.toFixed(4)}; audit ${c.audit.score.toFixed(4)} vs ${res.hand.audit.score.toFixed(4)}; ${c.vs.better} better / ${c.vs.worse} worse`);
    const again = TR.blobOf(res, opts);
    ok("!! `by` IS TRUE OF THE WEIGHTS: blobOf() of the grading just flown has the file's `by` to the character -- the recipe, the count of weights that differ from the autopilot, the held-out and audit scores with every kind, the autopilot's beside them, better and worse, the paired gain, the reserve and the safety audit", again.by === by,
        again.by === by ? "" : "first difference at " + [...by].findIndex((ch, i) => ch !== again.by[i]) + ": file \"" + by.slice(Math.max(0, [...by].findIndex((ch, i) => ch !== again.by[i]) - 30), [...by].findIndex((ch, i) => ch !== again.by[i]) + 40) + "\" now \"" + again.by.slice(Math.max(0, [...by].findIndex((ch, i) => ch !== again.by[i]) - 30), [...by].findIndex((ch, i) => ch !== again.by[i]) + 40) + "\"");
    ok("...and so are the file's own `score` (the held-out score, 4 places), its citation and its weights, bit for bit", blob.score === again.score && blob.citation === again.citation && same(Float32Array.from(blob.weights), c.weights) && blob.policy === again.policy && blob.weightCount === again.weightCount,
        `${blob.score} vs ${again.score}`);
    if (B.autopilot) {
        const A = B.autopilot, h = res.hand;
        ok(`!! the autopilot's own numbers on these sets are pinned: audit ${A.audit}, the safety audit ${A.safetyLost} lost to the ground or a collision / ${A.safetyDeep} past the full-stall angle / ${A.safetyBrush} brushing the stall, the pool ${A.poolLost} lost`,
            h.audit.score.toFixed(4) === A.audit && h.safety.lost.length === A.safetyLost && h.safety.deep === A.safetyDeep && h.safety.brush === A.safetyBrush && h.pool.lost.length === A.poolLost, `${h.audit.score.toFixed(4)}, ${h.safety.lost.length}/${h.safety.deep}/${h.safety.brush}, pool ${h.pool.lost.length}`);
    }
    console.log();
}

console.log(fails ? `trainDogfightPilotShipped-selfcheck: ${fails} FAILED` : "trainDogfightPilotShipped-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
