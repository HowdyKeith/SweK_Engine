// WebGLEngine/brain/peerFleet-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/peerFleet-selfcheck.mjs      (about fifteen seconds: some forty fights)
//
// THE PEERS' BRAINS, TAKEN IN AND SET TO A FLEET ACTION, HELD TO WHAT IT SAYS. brain/peerFleet.mjs takes brain files as they arrived, says file by file what was seated and what was refused and why, makes a fleet of what was accepted and flies two fleets against each other. Five things hold it:
//
//   1  THE INTAKE NEVER THROWS ON A FILE  each kind of thing a peer might send that is not a brain this fight seats is refused with its own reason, in the order given, and seats nothing: no text, text that is not JSON, JSON that is not an object, another format, another game's policy, a name from
//                                          Object's own prototype, a wrong weight count, a weight that overflows a float32, and a DUPLICATE (the same weights for the same policy, named after the first); the same weights for ANOTHER policy are not a duplicate
//   2  WHAT IS ACCEPTED IS DESCRIBED       the name, the policy, the role, who made it, its score, its weight count and the hash of its weights
//   3  A FLEET IS ITS FILES                the brains work what the report says they work (the modules in the seats, at the helm and in the escorts are the files'); a second helm is refused and named; `base` passes; a folder of nothing seated is the hand rules' side and says so
//   4  THE ACTION                          each pair is battleshipDuel.pair of the two sides; the mean, its standard error, z, the word at z 2, the pairs won, lost and drawn, the networks seated and the peak; a fleet against itself leads by nothing; bad kinds and no seeds are refused
//   5  THE REPORT AND THE FRONT DOOR       every seated and refused file has its line; a tie says how little the pairs flown can see; the export list
//
// SABOTAGE LOG: (20 mutants, each applied to a COPY of brain/peerFleet.mjs with a copy of this gate importing it, the copies deleted by name; the number is how many rows went red):
//   P1 a duplicate is seated 2 | P2 the same weights for another policy are a duplicate 1 | P3 text that is not JSON throws 4 | P4 a policy from Object's prototype is taken 2 | P5 the format is not asked 1 | P6 importBrain's refusal is ignored 1 | P7 a refused entry loses its place 7
//   P8 the second helm's refusal is not reported 1 | P9 a seated row is named by its place among all files 1 | P10 base is dropped 1 | P11 the pair is flown with the sides exchanged 1 | P12 ships and escorts do not reach the fights 1 | P13 the standard error is the standard deviation 1
//   P14 a draw is a win 2 | P15 the word is LEADS at z 1 1 | P16 the peak is the first fight's 1 | P17 a refused file has no line 1 | P18 a tie does not say what the pairs can see 1 | P19 an empty fleet does not say so 1 | P20 the hash is of the file's text 3
// TWO WENT 0 RED THE FIRST TIME AND WERE GAPS IN THE GATE, closed and re-run: P12 -- the networks SEATED were counted from the options and not from the fights, so fights flown one ship a side still said 28 (a made-up `fly` now records what each pair was flown with); P15 -- no result had a z between 1 and 2.
// NOT CHECKED: the command (tools/ship/takePeerFleet.mjs: folders, arguments; run by hand on two made-up folders), and A FILE A PEER REALLY SENT -- every file here is the tree's own or made from one.
"use strict";
import fs from "node:fs";
import * as PF from "./peerFleet.mjs";
import * as D from "./battleshipDuel.mjs";
import * as PB from "./peerBrain.mjs";
import * as SM from "./seatGunnerMlp.mjs";
import * as SF from "./seatGunnerFish.mjs";
import * as ST from "./seatTurretGunner.mjs";
import * as HP from "./helmPolicy.mjs";
import * as P6 from "./pilot6dofPolicy.mjs";
import { weightsHash } from "./drivePolicy.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const text = (f) => fs.readFileSync(new URL("./" + f, import.meta.url), "utf8"), J = (f) => JSON.parse(text(f));
const GPU = text("seatGunnerMlpWeightsDefault.json"), FISH = text("seatGunnerFishWeightsDefault.json"), CAR = text("seatTurretGunnerWeightsDefault.json"), HELM = text("helmWeightsDefault.json"), PILOT = text("pilot6dofWeightsDefault-d18.json");
const helm2 = JSON.stringify({ ...J("helmWeightsDefault.json"), weights: J("helmWeightsDefault.json").weights.map((v, i) => (i === 5 ? 0.5 : v)), by: "another peer's helm" });

console.log("peerFleet-selfcheck -- the peers' brains, taken in and set to a fleet action\n");

console.log("1. THE INTAKE NEVER THROWS ON A FILE");
section(() => {
    const g = J("seatGunnerMlpWeightsDefault.json"), entries = [
        { name: "good.json", text: GPU }, { name: "none.json", text: null }, { name: "broken.json", text: "{not json" }, { name: "three.json", text: "3" }, { name: "null.json", text: "null" }, { name: "list.json", text: "[1,2]" },
        { name: "old.json", text: JSON.stringify({ ...g, format: "swek-brain-v0" }) }, { name: "driver.json", text: JSON.stringify({ ...g, policy: "drivePolicy" }) }, { name: "proto.json", text: JSON.stringify({ ...g, policy: "constructor" }) }, { name: "nopolicy.json", text: JSON.stringify({ ...g, policy: 7 }) },
        { name: "short.json", text: JSON.stringify({ ...g, weights: g.weights.slice(1) }) }, { name: "huge.json", text: JSON.stringify({ ...g, weights: g.weights.map((v, i) => (i === 3 ? 1e40 : v)) }) }, { name: "copy.json", text: GPU }, { text: "{" }, null,
    ];
    let t = null, threw = ""; try { t = PF.intake(entries); } catch (e) { threw = e.message; }
    const why = (n) => (t.refused.find((r) => r.name === n) || {}).reason || "";
    ok("!! fifteen entries, one of them a brain: nothing is thrown, the one is accepted and the fourteen refused in the order they came", threw === "" && t.accepted.map((a) => a.name).join() === "good.json" && t.refused.map((r) => r.name).join() === "none.json,broken.json,three.json,null.json,list.json,old.json,driver.json,proto.json,nopolicy.json,short.json,huge.json,copy.json,entry 14,entry 15", threw);
    ok("!! each refusal says its own reason: no text; not JSON; JSON that is a number, null, an array; another format; a driver's brain (and what a fleet does seat); `constructor`; a policy that is a number; a weight short; a weight that overflows a float32", /no text to read/.test(why("none.json")) && /^not JSON \(/.test(why("broken.json")) && /not a brain export \(number\)/.test(why("three.json")) && /not a brain export \(null\)/.test(why("null.json")) && /not a brain export \(an array\)/.test(why("list.json")) && /not a swek-brain-v1 file \(format swek-brain-v0\)/.test(why("old.json"))
        && /a brain for drivePolicy, which a fleet action does not seat \(it seats seatGunnerPolicy, seatGunnerMlp, seatGunnerFish, gunnerPolicy, helmPolicy, pilot6dofPolicy, pilot6dofMlp\)/.test(why("driver.json")) && /a brain for constructor, which a fleet action does not seat/.test(why("proto.json")) && /a brain for 7,/.test(why("nopolicy.json")) && /weight count 1570 does not match seatGunnerMlp's current 1571/.test(why("short.json")) && /overflows/.test(why("huge.json")) && /no text to read/.test(why("entry 15")) && /^not JSON/.test(why("entry 14")));
    ok("!! THE SAME WEIGHTS TWICE ARE ONE BRAIN: the copy is refused as a duplicate and names the file it copies and the hash", new RegExp(`the same weights as good\\.json \\(hash ${weightsHash(Float32Array.from(g.weights))}\\): a duplicate`).test(why("copy.json")));
    const fly = J("seatGunnerWeightsDefault.json"), asHelm = JSON.stringify({ ...J("pilot6dofWeightsDefault-d18.json"), policy: "helmPolicy" }), two = PF.intake([{ name: "pilot.json", text: PILOT }, { name: "helm-of-the-same-weights.json", text: asHelm }, { name: "one-weight-off.json", text: JSON.stringify({ ...fly, weights: fly.weights.map((v, i) => (i === 9 ? v + 0.25 : v)) }) }, { name: "fly.json", text: JSON.stringify(fly) }]);
    ok("the same weights for ANOTHER policy are not a duplicate (a pilot's 930 weights sent as a helm's are a helm), and a brain one weight off another is its own brain", two.accepted.length === 4 && two.refused.length === 0 && two.accepted[1].role === "helm" && two.accepted[0].hash === two.accepted[1].hash && two.accepted[2].hash !== two.accepted[3].hash);
    ok("what is not an array of entries is refused by name", throwsWith(() => PF.intake("folder"), /the entries are an array of \{ name, text \}/));
});

console.log("2. WHAT IS ACCEPTED IS DESCRIBED");
section(() => {
    const t = PF.intake([{ name: "a.json", text: FISH }, { name: "b.json", text: HELM }, { name: "c.json", text: PILOT }, { name: "d.json", text: CAR }]), f = J("seatGunnerFishWeightsDefault.json");
    ok("the name, the policy, the role (seat, helm, pilot; the CAR'S policy is a seat's), who made it, its score, its weight count and the hash of its weights; the brain itself rides along", t.accepted.map((a) => `${a.name}:${a.policy}:${a.role}:${a.weightCount}`).join() === "a.json:seatGunnerFish:seat:700,b.json:helmPolicy:helm:930,c.json:pilot6dofPolicy:pilot:930,d.json:gunnerPolicy:seat:896" && t.accepted[0].by === f.by && t.accepted[0].score === f.score && t.accepted[0].hash === weightsHash(Float32Array.from(f.weights)) && t.accepted[0].blob.weights.length === 700);
});

console.log("3. A FLEET IS ITS FILES");
section(() => {
    const F = PF.fleet("north", [{ name: "gpu.json", text: GPU }, { name: "junk.json", text: "{" }, { name: "fish.json", text: FISH }, { name: "helm.json", text: HELM }, { name: "helm-b.json", text: helm2 }, { name: "pilot.json", text: PILOT }], { helmRule: "broadside", gunners: "green", cannon: false }), ids = D.makeSide("x") && ["main-a", "main-b", "main-c", "pd-p1", "pd-p2", "pd-p3", "pd-s1", "pd-s2", "pd-s3", "pd-v1", "pd-v2", "pd-d1", "pd-d2"];
    const row = (n) => F.seated.find((s) => s.name === n);
    ok("!! six files: two gunners share the thirteen seats in turn, the first helm takes the helm, the pilot the escorts; the junk and the SECOND HELM are refused, each named with its reason; the counts by role are 2, 1, 1", F.seated.map((s) => s.name).join() === "gpu.json,fish.json,helm.json,pilot.json" && F.refused.map((r) => r.name).join() === "junk.json,helm-b.json" && /a side has one helm and an earlier brain took it/.test(F.refused[1].reason) && JSON.stringify(F.roles) === '{"seat":2,"helm":1,"pilot":1}' && row("gpu.json").where.join() === ids.filter((_, k) => k % 2 === 0).join() && row("fish.json").where.join() === ids.filter((_, k) => k % 2 === 1).join() && row("helm.json").where.join() === "helm" && /escort 1 of every 1/.test(row("pilot.json").where[0]) && F.accepted.map((a) => a.name).join() === "gpu.json,fish.json,helm.json,pilot.json");
    ok("!! THE SIDE IS WHAT THE REPORT SAYS: the module in main-a is the GPU Brain's and in main-b the fish's, with those files' weights; the helm network is the first helm's (not the second's); the escorts' pilot is the file's; and `base` passes (the broadside rule, green sights, no cannon)", D.seatNetOf(F.side, "main-a").module === SM && D.seatNetOf(F.side, "main-b").module === SF && D.seatNetOf(F.side, "main-b").weights.join() === Float32Array.from(J("seatGunnerFishWeightsDefault.json").weights).join() && F.side.helmNet.module === HP && F.side.helmNet.weights[5] === Float32Array.from(J("helmWeightsDefault.json").weights)[5] && F.side.helmNet.weights[5] !== 0.5 && F.side.pilots[0].module === P6 && F.side.helmRule === "broadside" && F.side.gunners === "green" && F.side.cannon === false && D.seatedBrains(F.side, { escorts: 3 }).total === 17);
    const car = PF.fleet("c", [{ name: "car.json", text: CAR }]), none = PF.fleet("empty", [{ name: "junk.json", text: "{" }]), rule = PF.fleet("rule", []);
    ok("the car's turret gunner is seated through brain/seatTurretGunner.mjs; a folder of nothing seated, and no folder at all, are the hand rules' side: no network anywhere, the roles all 0", D.seatNetOf(car.side, "pd-d2").module === ST && car.roles.seat === 1 && none.seated.length === 0 && none.refused.length === 1 && none.side.seatNetworks === null && none.side.helmNet === null && JSON.stringify(none.roles) === '{"seat":0,"helm":0,"pilot":0}' && rule.seated.length === 0 && rule.refused.length === 0 && D.seatedBrains(rule.side).total === 0);
});

console.log("4. THE ACTION");
section(() => {
    const A = PF.fleet("north", [{ name: "gpu.json", text: GPU }, { name: "helm.json", text: HELM }]), B = PF.fleet("rule", []), R = PF.action(A, B, { seeds: [1, 2] });
    const leads = D.KINDS.flatMap((kind) => [1, 2].map((seed) => D.pair(A.side, B.side, seed, kind).lead)), mean = leads.reduce((a, b) => a + b, 0) / 8, se = Math.sqrt(leads.reduce((a, b) => a + (b - mean) ** 2, 0) / 7 / 8);
    ok("!! eight pairs (four kinds, seeds 1-2): each is battleshipDuel.pair of the two sides, kind by kind and seed by seed; the mean, its standard error and z are theirs; won, lost and drawn count leads beyond 0.05 and add up; sixteen fights", R.pairs.length === 8 && R.pairs.every((p, i) => p.lead === leads[i] && p.kind === D.KINDS[Math.floor(i / 2)] && p.seed === 1 + (i % 2) && p.winner === (p.lead > 0.05 ? "A" : p.lead < -0.05 ? "B" : "draw")) && Math.abs(R.lead.mean - mean) < 1e-12 && Math.abs(R.lead.se - se) < 1e-12 && Math.abs(R.lead.z - mean / se) < 1e-9 && R.won + R.lost + R.drawn === 8 && R.won === leads.filter((l) => l > 0.05).length && R.fights === 16, `mean ${R.lead.mean.toFixed(3)}, z ${R.lead.z.toFixed(2)}, ${R.word}`);
    ok("the word is A's at z 2 (LEADS at 2 or more, TRAILS at -2 or less, CANNOT BE TOLD between); the networks seated are each side's (14 and 0) and the peak is the most asked in one tick of any fight", R.word === (R.lead.z >= 2 ? "LEADS" : R.lead.z <= -2 ? "TRAILS" : "CANNOT BE TOLD") && R.brains.seated.join() === "14,0" && R.brains.peak >= 2 && R.brains.peak <= 14 && PF.action(B, A, { seeds: [1, 2] }).word === (R.word === "LEADS" ? "TRAILS" : R.word === "TRAILS" ? "LEADS" : "CANNOT BE TOLD") && PF.action(B, A, { seeds: [1, 2] }).lead.mean === -R.lead.mean);
    const self = PF.action(A, A, { seeds: [3], kinds: ["chase"] }), fleet2 = PF.action(A, B, { seeds: [1], kinds: ["broadside"], ships: 2, escorts: 2 });
    ok("a fleet against itself leads by exactly nothing, drawn, with a z of 0 (one pair has no standard error); ships and escorts reach the fights (two ships a side seat 28 networks); the default is seeds 1-5 of the four kinds", self.lead.mean === 0 && self.drawn === 1 && self.lead.z === 0 && self.word === "CANNOT BE TOLD" && fleet2.brains.seated.join() === "28,0" && fleet2.ships === 2 && fleet2.escorts === 2 && PF.DEFAULT_SEEDS.join() === "1,2,3,4,5");
    let calls = 0; const stub = PF.action(A, B, { seeds: [1, 2, 3], kinds: ["chase"], fly: (a, b, seed, kind, o) => { calls++; return { lead: seed === 2 ? -1 : 1, first: { brains: { peak: seed } }, second: { brains: { peak: 0 } } }; } });
    ok("the pairs can be flown elsewhere (`fly`): three made-up leads of 1, -1, 1 are a mean of 1/3, two won and one lost, and the peak is the largest any fight says", calls === 3 && Math.abs(stub.lead.mean - 1 / 3) < 1e-12 && stub.won === 2 && stub.lost === 1 && stub.brains.peak === 3);
    const seq = [1, 1, 1, -1, 1, 1, -1, 1], seenOpts = []; let n = 0; const mid = PF.action(A, B, { seeds: [1, 2, 3, 4, 5, 6, 7, 8], kinds: ["chase"], ships: 3, escorts: 5, seconds: 99, fly: (a, b, seed, kind, o) => { seenOpts.push(o); return { lead: seq[n++], first: { brains: { peak: 1 } }, second: { brains: { peak: 1 } } }; } });
    ok("!! a z between 1 and 2 CANNOT BE TOLD (eight leads of +-1 with a mean of 0.5: z 1.53), and the ships, the escorts and the seconds asked for are what each pair is flown with", mid.lead.z > 1.4 && mid.lead.z < 1.7 && mid.word === "CANNOT BE TOLD" && seenOpts.length === 8 && seenOpts.every((o) => o.ships === 3 && o.escorts === 5 && o.seconds === 99), `z ${mid.lead.z.toFixed(2)}`);
    ok("a kind that is not one, and no seeds, are refused by name", throwsWith(() => PF.action(A, B, { kinds: ["ramming"] }), /no kind "ramming"/) && throwsWith(() => PF.action(A, B, { seeds: [] }), /at least one kind and one seed/));
});

console.log("5. THE REPORT AND THE FRONT DOOR");
section(() => {
    const A = PF.fleet("north", [{ name: "gpu.json", text: GPU }, { name: "junk.json", text: "{" }, { name: "helm.json", text: HELM }]), B = PF.fleet("rule", []), tie = { pairs: new Array(20).fill({}), lead: { mean: 0.1, se: 0.2, z: 0.5 }, won: 9, lost: 8, drawn: 3, word: "CANNOT BE TOLD", brains: { seated: [14, 0], peak: 9 }, fights: 40, ships: 1, escorts: 0 }, L = PF.reportLines(A, B, tie);
    ok("!! every seated file has a SEATED line saying what it works and every refused file a REFUSED line with its reason; a fleet with nothing of a peer's says it is the hand rules' side", L.some((l) => /^ {2}SEATED {3}gpu\.json: seatGunnerMlp, seat -- 13 seats \(main-a, main-b, main-c, \.\.\.\) -- by: /.test(l)) && L.some((l) => /^ {2}SEATED {3}helm\.json: helmPolicy, helm -- helm/.test(l)) && L.some((l) => /^ {2}REFUSED {2}junk\.json: not JSON/.test(l)) && L.some((l) => /^fleet north: 2 brains seated \(1 in the gun seats, 1 at the helm, 0 flying escorts\), 1 files refused$/.test(l)) && L.some((l) => /^fleet rule: 0 brains seated .* NOTHING OF A PEER'S IS IN THIS FLEET: it is the hand rules' side/.test(l)));
    ok("!! a result that cannot be told says how little the pairs flown can see (20 pairs: a lead of 0.36 or more), with the mean, its standard error, z and the pairs; a result that leads does not carry that caveat", L.some((l) => l.includes("north against rule: mean lead +0.100 (se 0.200, z 0.50); pairs won 9, lost 8, drawn 3: north CANNOT BE TOLD on 20 pairs (a pair's lead varies by about 0.8: 20 pairs see a lead of 0.36 or more)")) && L.some((l) => l.includes("live brains: 14 seated in north, 0 in rule; the most asked in one tick 9")) && !PF.reportLines(A, B, { ...tie, word: "LEADS" }).some((l) => /varies by about/.test(l)));
    ok("the export list", Object.keys(PF).sort().join() === "DEFAULT_SEEDS,action,fleet,fleetLines,intake,reportLines");
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
