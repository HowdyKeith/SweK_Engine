// WebGLEngine/tools/ship/trainTurretSeatBig-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/trainTurretSeatBig-selfcheck.mjs      (about a minute: it flies some sixty real pairs, on worker threads)
//
// PAIRS ON EVERY CORE AND A SEARCH JUDGED BY A PAIRED TEST, HELD TO WHAT THEY SAY. tools/ship/pairPool.mjs flies brain/battleshipDuel.mjs pairs on worker threads; tools/ship/trainTurretSeatBig.mjs is the turret seat's search with every child judged against its parent on up to 300 pairs. Seven things hold them:
//
//   1  THE POOL IS THE SERIAL ANSWER   the same jobs flown here one by one and on one, two and three workers give the same leads to the bit, in the jobs' order; a side crosses as plain data and comes out the side it described; a policy the fight does not seat fails the job by name
//   2  THE SETS                        300 train, 300 held-out, 600 audit pairs, the four kinds in turn seed by seed (every stage of the test holds each kind equally), and no seed any earlier search, gate or audit flew
//   3  THE STAGED TEST                 on made-up leads: a child better by a steady amount is accepted at 300; one that is the same is dropped at 60; one a little better is dropped where its z falls short; the last stage needs z 2.5; only as many pairs are asked for as are read
//   4  THE SEARCH                      on a made-up fight that pays for weight on synapses: synapse children are accepted and nothing else; on one that pays for nothing, nothing is; the same seed is the same search; the pairs flown are counted
//   5  THE PRUNE                       a weight that does not pay for itself by the test is put back, one that does stays
//   6  THE CHOICE                      qualifies() needs BOTH a lead over the hand gunner AND a lead over the start; finish() takes the best held-out record and reads the champion, the start and the ablation on the same audit pairs
//   7  THE FRONT DOOR                  the file that would be written, the export lists@@SHIPPED_HEAD@@
//
// SABOTAGE LOG: (34 mutants, each applied to a COPY of the module with a copy of this gate importing it, the copies deleted by name; the number is how many rows went red.)
//   tools/ship/trainTurretSeatBig.mjs: B1 the last stage accepts at z 1.5 3 | B2 the first stage is 20 pairs 4 | B3 the train pairs are the first trainer's seeds 3 | B4 the kinds come in blocks 2 | B5 the test is not paired 8 | B6 an early stage keeps a z equal to its own 2 | B7 the last stage is never read 1
//     B8 every stage asks for all the pairs again 2 | B9 a dropped child replaces its parent 4 | B10 the parent's leads are not updated 1 | B11 improvements are counted under bias 1 | B12 the prune keeps every weight 1 | B13 the prune puts every weight back 4 | B14 the prune compares the wrong way 3
//     B15 the prune goes back to zero 1 | B16 the pairs flown are not counted 2 | B17 a lead over the start is not asked 2 | B18 a lead over the hand gunner is not asked 2 | B19 the champion is the first record 1 | B20 the training is read against the ablation 1 | B21 the ablation is the start 1
//     B22 the audit is the held-out pairs 2 | B23 the jobs are for the seat's own policy 1 | B24 the file's score is the held-out's 1
//   tools/ship/pairPool.mjs: Q1 the leads come back in arrival order 1 | Q2 a job's options do not reach the pair 1 | Q3 the pair is flown with the sides exchanged 1 | Q4 the cannon is always on 1 | Q5 the helm rule is not passed 1 | Q6 a policy of another role is taken 1 | Q7 the pool does not count 1
//     Q8 no workers is allowed 1 | Q9 the gunners are always regular 1 | Q10 onLead is never called 1
// FIVE WENT 0 RED THE FIRST TIME AND WERE GAPS IN THE GATE, closed and re-run (their counts are the re-run's): B7 -- no row had a z EQUAL to the last stage's; B15 -- every weight the made-up prune put back started at zero (a search whose tune child moved one of the car's own hand weights is now flown);
// B20 and B21 -- in the made-up fight the start and the ablation were the same network, so reading one for the other changed nothing (a fight that also pays for a bias makes them three); B24 -- the file's score was not looked at. NOT CHECKED: the command-line plumbing at the foot of the trainer, the pool on
// more workers than this box has cores, and that the real searches give their records again (hours of four cores each).
"use strict";
import fs from "node:fs";
import * as B from "./trainTurretSeatBig.mjs";
import * as P from "./pairPool.mjs";
import * as T from "./trainTurretSeat.mjs";
import * as TA from "./takeTurretAudit.mjs";
import * as TH from "./trainHelm.mjs";
import * as ST from "../../brain/seatTurretGunner.mjs";
import * as GP from "../../brain/gunnerPolicy.mjs";
import * as HP from "../../brain/helmPolicy.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const START = T.startWeights(), synSum = (w) => { let s = 0; for (let k = 0; k < 313; k++) s += Math.abs(w[ST.synapseAt(k)]); return s; };
const noise = (p) => Math.sin(p.seed * 12.9898 + p.kind.length * 78.233) * 0.8;   // a made-up pair-to-pair spread of the fight's own size
const paysSynapses = async (w, list) => list.map((p) => Math.min(1, synSum(w)) * 0.3 + noise(p)), paysNothing = async (w, list) => list.map(noise);

console.log("trainTurretSeatBig-selfcheck -- pairs on every core, and a search judged by a paired test\n");

console.log("1. THE POOL IS THE SERIAL ANSWER");
await section(async () => {
    const x = { id: "n", network: { policy: "gunnerPolicy", weights: Array.from(START) } }, y = { id: "h" }, helm = { id: "helm", helmRule: "broadside", cannon: false, gunners: "green", helmNet: { policy: "helmPolicy", weights: Array.from(HP.handWeights()) } };
    const jobs = [...D.KINDS.flatMap((kind) => [1, 2].map((seed) => ({ x, y, kind, seed }))), { x: helm, y, kind: "chase", seed: 3 }, { x, y, kind: "head-on", seed: 4, opts: { seconds: 20 } }], serial = jobs.map(P.leadOf);
    const got = []; for (const n of [1, 2, 3]) { const pool = P.createPool({ workers: n }), order = [], l = await pool.leads(jobs, (i) => order.push(i)); got.push({ l, flown: pool.flown, order }); await pool.close(); }
    ok("!! ten pairs flown one by one here and on one, two and three workers: the same leads to the bit, in the jobs' order whatever order they came back in; the pool counts what it flew", got.every((g) => g.l.join() === serial.join() && g.flown === 10 && g.order.length === 10) && serial.some((v) => v !== 0) && new Set(serial).size > 5, serial.slice(0, 4).map((v) => v.toFixed(3)).join(", "));
    ok("the pool's lead is battleshipDuel.pair's own for the sides described: the network's side against the hand gunner, and a job's options (a 20-second fight) reach the pair", serial[0] === D.pair(D.makeSide("n", { network: { module: ST, weights: START } }), D.makeSide("h"), 1, "head-on").lead && serial[9] === D.pair(D.makeSide("n", { network: { module: ST, weights: START } }), D.makeSide("h"), 4, "head-on", { seconds: 20 }).lead && serial[9] !== P.leadOf({ x, y, kind: "head-on", seed: 4 }));
    const s = P.sideOf(helm);
    ok("a side crosses as plain data and comes out the side it described: the helm rule, the cannon, the gunners, a helm network of the policy named (a Float32Array again); with nothing said it is the default side", s.helmRule === "broadside" && s.cannon === false && s.gunners === "green" && s.helmNet.module === HP && s.helmNet.weights instanceof Float32Array && s.network === null && P.sideOf({ id: "d" }).gunners === "regular" && P.sideOf({ id: "d" }).cannon === true && P.sideOf(x).network.module === ST);
    const pool = P.createPool({ workers: 1 }); let msg = ""; try { await pool.leads([{ x: { id: "b", network: { policy: "helmPolicy", weights: [] } }, y, kind: "chase", seed: 1 }]); } catch (e) { msg = e.message; } const after = await pool.leads([jobs[0]]); await pool.close();
    ok("a seat network named by a policy that is not a seat's fails ITS job by name, and the pool flies the next job", /"helmPolicy" is not a seat policy this fight seats/.test(msg) && after[0] === serial[0] && (() => { try { P.createPool({ workers: 0 }); return false; } catch (e) { return /workers is a whole number, 1 or more/.test(e.message); } })());
});

console.log("2. THE SETS");
await section(async () => {
    const seeds = (l) => [...new Set(l.map((p) => p.seed))], used = [T.TRAIN_PAIRS, T.HELD_OUT_PAIRS, T.AUDIT_PAIRS, TH.TRAIN_PAIRS, TH.HELD_OUT_PAIRS, TH.AUDIT_PAIRS, TA.PAIRS, TA.REPLICATION_PAIRS].flatMap(seeds), all = [B.TRAIN_PAIRS, B.HELD_OUT_PAIRS, B.AUDIT_PAIRS];
    ok("300 train (seeds 3001-3075), 300 held-out (4001-4075) and 600 audit pairs (5001-5150); no seed is in two sets, and none was flown by the first trainer, the helm's, the larger audit or its replication", all.map((l) => l.length).join() === "300,300,600" && seeds(B.TRAIN_PAIRS)[0] === 3001 && seeds(B.TRAIN_PAIRS)[74] === 3075 && seeds(B.HELD_OUT_PAIRS)[0] === 4001 && seeds(B.AUDIT_PAIRS)[149] === 5150 && new Set(all.flatMap(seeds)).size === 300 && all.flatMap(seeds).every((s) => !used.includes(s)));
    ok("!! the four kinds come in turn, seed by seed, so every stage of the test (60, 120, 200, 300 pairs) holds each kind equally", B.TRAIN_PAIRS.slice(0, 4).map((p) => p.kind).join() === D.KINDS.join() && B.STAGES.every((s) => D.KINDS.every((k) => B.TRAIN_PAIRS.slice(0, s.n).filter((p) => p.kind === k).length === s.n / 4)) && B.STAGES.map((s) => `${s.n}:${s.z}`).join() === "60:0,120:0.75,200:1.5,300:2.5" && B.Z_ACCEPT === 2.5);
    const j = B.jobsOf(START, B.TRAIN_PAIRS.slice(0, 2));
    ok("a job is the network (the car's policy id) in every seat against the default side, the hand gunner", j.length === 2 && j[0].x.network.policy === "gunnerPolicy" && j[0].x.network.weights === START && j[0].y.id === "hand" && !j[0].y.network && j[1].kind === "broadside" && j[1].seed === 3001);
});

console.log("3. THE STAGED TEST (made-up leads)");
await section(async () => {
    const base = B.TRAIN_PAIRS.map(noise), jitter = (i) => Math.sin(i * 7.77) * 0.4, asked = [], run = (f) => { asked.length = 0; return B.stagedTest(async (from, to) => { asked.push([from, to]); return Array.from({ length: to - from }, (_, k) => f(from + k)); }, base); };
    const better = await run((i) => base[i] + 0.2 + jitter(i)), askedBetter = asked.map((a) => a.join("-")).join();
    ok("!! a child better than its parent by 0.2 a pair (with a spread of its own) is ACCEPTED at 300 pairs, and was asked for them stage by stage: 0-60, 60-120, 120-200, 200-300", better.accepted && better.stage === 300 && better.z > 2.5 && Math.abs(better.mean - 0.2) < 0.05 && better.leads.length === 300 && askedBetter === "0-60,60-120,120-200,200-300", `z ${better.z.toFixed(2)}`);
    const same = await run((i) => base[i]), sameAsked = asked.length, worse = await run((i) => base[i] - 0.1 + jitter(i));
    ok("!! a child the fights cannot tell from its parent (every difference 0) is dropped at 60 pairs and no more are flown; so is one that is worse", !same.accepted && same.stage === 60 && same.z === 0 && sameAsked === 1 && !worse.accepted && worse.stage === 60 && worse.z < 0);
    const slight = await run((i) => base[i] + 0.035 + jitter(i));
    ok("a child a little better (0.035 a pair) passes the first stage and is dropped at a later one where its z falls short -- it costs more than 60 pairs and is never accepted", !slight.accepted && slight.stage > 60 && slight.z < 2.5, `dropped at ${slight.stage} with z ${slight.z.toFixed(2)}`);
    const edge = (z) => B.stagedTest(async (from, to) => Array.from({ length: to - from }, (_, k) => ((from + k) % 2 ? 1 + z : -1 + z)), new Array(4).fill(0), [{ n: 2, z: 0 }, { n: 4, z: 2.5 }]);   // differences +-1 about z: mean z, se 1/sqrt(3)... over 4
    const hi = await edge(2), lo = await edge(1);
    const z0 = (await edge(2)).z, exact = await B.stagedTest(async (from, to) => Array.from({ length: to - from }, (_, k) => ((from + k) % 2 ? 3 : 1)), new Array(4).fill(0), [{ n: 2, z: 0 }, { n: 4, z: z0 }]);
    ok("a z EQUAL to the last stage's own is in (at an earlier stage it would be out: those need more than theirs)", exact.accepted && exact.z === z0);
    ok("the last stage needs z of at least its own 2.5: a mean of 2 with a standard error of 0.577 (z 3.46) is in, a mean of 1 (z 1.73) is out", hi.accepted && Math.abs(hi.z - 2 / Math.sqrt(1 / 3)) < 1e-9 && !lo.accepted && lo.stage === 4);
});

console.log("4. THE SEARCH (made-up fights)");
await section(async () => {
    const lines = [], r = await B.search({ seed: 1, iters: 60 }, (m) => lines.push(m), { fly: paysSynapses }), again = await B.search({ seed: 1, iters: 60 }, () => {}, { fly: paysSynapses }), other = await B.search({ seed: 2, iters: 60 }, () => {}, { fly: paysSynapses });
    ok("!! on a fight that pays for weight on synapses and for nothing else, the children accepted are SYNAPSE children only, each by a paired z of 2.5 or more, and the train score rises from the start's", r.improved >= 2 && r.by.synapse === r.improved && r.by.path + r.by.tune + r.by.bias === 0 && r.accepted.every((a) => a.kind === "synapse" && a.z >= 2.5 && a.mean > 0) && r.train > r.startTrain + 0.1 && r.synapses >= 1 && Object.values(r.tried).reduce((a, b) => a + b, 0) === 60, `${r.improved} accepted, train ${r.startTrain.toFixed(3)} -> ${r.train.toFixed(3)}, ${r.synapses} synapses`);
    ok("the record is plain data whose train score is the mean of its 300 train leads, and those are the fight's own for its weights; the children dropped at each stage and the accepted add up to the iterations; the pairs flown are counted (the start's 300, each child's stages, the prune's 300 a weight)", JSON.stringify(JSON.parse(JSON.stringify(r))) === JSON.stringify(r) && r.trainLeads.length === 300 && Math.abs(r.train - r.trainLeads.reduce((a, b) => a + b, 0) / 300) < 1e-12 && r.trainLeads.join() === (await paysSynapses(Float32Array.from(r.weights), B.TRAIN_PAIRS)).join()
        && Object.values(r.stages).reduce((a, b) => a + b, 0) + r.improved === 60 && r.pairsFlown === 300 + Object.entries(r.stages).reduce((a, [n, v]) => a + Number(n) * v, 0) + 300 * r.improved + 300 * r.moved);
    ok("the same seed is the same search to the bit and another seed another", JSON.stringify(again) === JSON.stringify(r) && other.weights.join() !== r.weights.join());
    const flat = await B.search({ seed: 3, iters: 40 }, () => {}, { fly: paysNothing });
    ok("!! on a fight that pays for nothing, NOTHING is accepted: forty children, every one dropped at 60 pairs, the weights the start's", flat.improved === 0 && flat.stages[60] === 40 && T.differs(flat.weights, START).length === 0 && flat.kept === 0 && flat.pairsFlown === 300 + 40 * 60);
    const tiny = async (w, list) => list.map((p) => Math.min(1, synSum(w)) * 0.02 + noise(p) + Math.sin(p.seed * 3.3 + synSum(w) * 50) * 0.5), weak = await B.search({ seed: 1, iters: 60 }, () => {}, { fly: tiny });
    ok("... and on one where a synapse is worth 0.02 a pair under a spread of 0.5 that changes with the weights, fewer are accepted than where it is worth 0.3: an effect the pairs cannot see is not climbed", weak.improved < r.improved, `${weak.improved} against ${r.improved}`);
});

console.log("5. THE PRUNE");
await section(async () => {
    // the search's own prune, reached through a search of no iterations from made-up start leads is not possible (it starts from the car's weights); so: a fight where ONE synapse pays and the read-out that came with it does not
    const r = await B.search({ seed: 1, iters: 60 }, () => {}, { fly: paysSynapses }), kept = r.pruned.filter((p) => p.kept), gone = r.pruned.filter((p) => !p.kept), isSyn = (i) => i >= ST.synapseAt(0) && i < ST.synapseAt(313);
    const pays3 = async (w, list) => list.map((q) => Math.min(3, synSum(w)) * 0.3 + noise(q)), t = await B.search({ seed: 5, iters: 150 }, () => {}, { fly: pays3 }), back = t.pruned.filter((q) => !q.kept && START[q.index] !== 0);
    ok("!! a weight that is put back goes back to the START's value, not to zero: a search whose tune child moved one of the car's own hand weights along with a synapse has that hand weight back at the car's value", back.length >= 1 && back.every((q) => t.weights[q.index] === START[q.index] && START[q.index] !== 0) && t.by.tune >= 1, `weight ${back[0] && back[0].index} back to ${back[0] && START[back[0].index]}`);
    ok("!! every weight the prune kept beat the network without it by z 2.5 or more and every one it put back did not; the read-outs that came with the synapses (they pay nothing) are put back, and what is left differs from the start only in what was kept", r.pruned.length === r.moved && kept.every((p) => p.z >= 2.5) && gone.every((p) => !(p.z >= 2.5)) && gone.length >= 1 && gone.some((p) => !isSyn(p.index)) && T.differs(r.weights, START).join() === kept.map((p) => p.index).join() && r.kept === kept.length && r.synapsesBefore >= r.synapses);
});

console.log("6. THE CHOICE");
await section(async () => {
    const q = (lz, tz) => B.qualifies({ lead: { z: lz }, training: { z: tz } });
    ok("!! qualifies needs BOTH: a lead over the hand gunner of z 2 AND a lead over the START of z 2. A gunner that leads the hand gunner and is no better than the car's untrained weights -- the first trainer's champion -- is OUT, with that reason", q(3, 2).ok && !q(3, 1.9).ok && /against the start it reads CANNOT BE TOLD \(z 1\.90\): no better than the car's untrained hand weights/.test(q(3, 1.9).reasons.join()) && !q(1.5, 3).ok && /against the hand gunner it reads CANNOT BE TOLD/.test(q(1.5, 3).reasons.join()) && q(-3, -3).reasons.length === 2 && /TRAILS/.test(q(-3, -3).reasons[0]));
    const good = await B.search({ seed: 1, iters: 60 }, () => {}, { fly: paysSynapses }), flat = await B.search({ seed: 3, iters: 20 }, () => {}, { fly: paysNothing }), lines = [];
    const f = await B.finish([flat, good], (m) => lines.push(m), { fly: paysSynapses });
    ok("finish reads every record on the held-out pairs and takes the best (the search that climbed, not the one listed first); the audit is the champion, the start and the ablation on the same 600 pairs, and the readings are paired", f.champion.seed === 1 && f.runs.map((r) => r.seed).join() === "1,3" && f.runs[1].unchanged === true && f.reading.lead.n === 600 && f.reading.start.n === 600 && Math.abs(f.reading.training.mean - (f.reading.lead.mean - f.reading.start.mean)) < 1e-9 && Math.abs(f.reading.synapses.mean - (f.reading.lead.mean - f.reading.ablation.mean)) < 1e-9 && f.reading.synapses.mean > 0.1 && f.verdict.ok && lines.some((l) => /^QUALIFIES/.test(l)));
    const paysBoth = async (w, list) => list.map((q) => Math.min(1, synSum(w)) * 0.3 + (w[ST.biasAt(0)] !== 0 ? 0.2 : 0) + noise(q)), both = await B.search({ seed: 1, iters: 80 }, () => {}, { fly: paysBoth }), fb = await B.finish([both], () => {}, { fly: paysBoth });
    const mean = (xs) => xs.reduce((a, b2) => a + b2, 0) / xs.length, wB = Float32Array.from(both.weights), mC = mean(await paysBoth(wB, B.AUDIT_PAIRS)), mS = mean(await paysBoth(START, B.AUDIT_PAIRS)), mA = mean(await paysBoth(T.ablate(wB), B.AUDIT_PAIRS));
    ok("!! on a fight that pays for synapses AND for a bias, the start, the ablation and the champion are three different networks, and each reading is the right difference, flown here again: the training is the champion less the START, the synapses the champion less ITS OWN ABLATION (the bias stays in it)", both.by.bias >= 1 && both.synapses >= 1 && mS < mA - 0.1 && mA < mC - 0.1 && Math.abs(fb.reading.training.mean - (mC - mS)) < 1e-9 && Math.abs(fb.reading.synapses.mean - (mC - mA)) < 1e-9 && Math.abs(fb.reading.ablation.mean - mA) < 1e-9 && Math.abs(fb.reading.start.mean - mS) < 1e-9, `start ${mS.toFixed(3)}, ablation ${mA.toFixed(3)}, champion ${mC.toFixed(3)}`);
    const g = await B.finish([flat], () => {}, { fly: paysNothing });
    ok("!! a search that changed nothing is its own start and its own ablation: the training and the synapses are worth exactly 0 and it does NOT qualify", g.reading.training.mean === 0 && g.reading.training.z === 0 && g.reading.synapses.mean === 0 && !g.verdict.ok && g.verdict.reasons.length === 2);
    let msg = ""; try { await B.finish([], () => {}, { fly: paysNothing }); } catch (e) { msg = e.message; }
    ok("no records are refused by name", /no search records to choose from/.test(msg));
});

console.log("7. THE FRONT DOOR");
await section(async () => {
    const good = await B.search({ seed: 1, iters: 60 }, () => {}, { fly: paysSynapses }), f = await B.finish([good], () => {}, { fly: paysSynapses }), blob = B.blobOf(f), back = PB.importBrain(PB.describePolicy("gunnerPolicy", GP), blob);
    ok("the file that would be written is a brain for the car's policy that peerBrain takes back, scored by its AUDIT lead (not the held-out's), and its `by` says where it was trained, the test, the sets, the weights and synapses it kept and the four audit readings with their words", back.ok && back.weights.join() === f.champion.weights.join() && blob.score === Number(f.reading.lead.mean.toFixed(3)) && blob.score !== Number(f.champion.heldOut.mean.toFixed(3)) && blob.by.startsWith("TRAINED IN A CAPITAL SHIP'S GUN SEAT, NOT ON THE RACE (tools/ship/trainTurretSeatBig.mjs)") && blob.by.includes("a paired test of z >= 2.5 over 300 train pairs (seeds 3001-3075 of each kind") && blob.by.includes(`${good.synapses} of the circuit's 313 synapses carry a weight`) && blob.by.includes(`against the hand gunner ${TA.line(f.reading.lead)}`) && blob.by.includes(`what the training bought (this less the start) ${TA.line(f.reading.training)}`) && blob.by.includes(`its synapses (this less its ablation) ${TA.line(f.reading.synapses)}`) && /seatTurretGunnerWeightsBig\.json$/.test(B.DEFAULT_OUT));
    ok("the export lists", Object.keys(B).sort().join() === "AUDIT_PAIRS,DEFAULT_OUT,HELD_OUT_PAIRS,RECIPE,STAGES,TRAIN_PAIRS,Z_ACCEPT,blobOf,finish,jobsOf,qualifies,search,stagedTest" && Object.keys(P).sort().join() === "createPool,leadOf,sideOf");
});
//@@SHIPPED_SECTION@@

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
