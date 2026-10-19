// WebGLEngine/ai-bridge/subAquariumCore-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node ai-bridge/subAquariumCore-selfcheck.mjs      (~0.2 s)
//
// THE SUB AQUARIUM'S RULES HELD TO THEIR WORD. ai-bridge/subAquariumCore.js decides what a peer may send us, where it is kept and what two status chips say; it is pure, so every decision is tested directly:
//   1  THE NAME       a name is a label, not markup: only letters, digits, space and . _ - ( ) survive, runs of space collapse, 40 characters at most, nothing left means refused
//   2  THE SUB        validateSub keeps ONLY the known fields (a body that claims local: true, a from, or a __proto__ gets none of them), defaults the circuit to gfc, takes weights as null or EXACTLY 963 finite numbers
//                     of magnitude <= 1000, theta as null or all twelve names finite <= 10000, derives a hue from the name, and refuses everything else BY NAME OF THE FIELD (and the index of the first bad weight)
//   3  THE DRIFT GUARD  THETA_NAMES is brain/subTactics.mjs's list, in order, and WEIGHTS.gfc is brain/pilotSubPolicy.mjs's WEIGHT_COUNT: if either moves, this gate goes red instead of the aquarium refusing every sub
//   4  THE TANK       the id is a function of the content (the same sub twice is ONE sub); a registry of 24 evicts the oldest REMOTE sub first and its own subs last; `from` and `local` come from the caller; newest first
//   5  THE SEED       the six subs this box can offer are built from the files the work left (all six here, 963 weights each); a missing or invalid file is skipped BY NAME with the reason
//   6  THE CHIPS      flyBrainHealth: live / stale / offline; fishBrainHealth: live needs a FISH circuit (there is none), standin is the honest ceiling, offline is no weights; the detail says STAND-IN and counts subs
//
// SABOTAGE LOG -- THIRTY-TWO, each applied to ai-bridge/subAquariumCore.js in place, the gate run, the file restored; every one red by name EXCEPT ONE EQUIVALENT MUTANT (the number is how many rows went red):
//   A1 the name allows < > 3 | A2 the name 80 characters 1 | A3 spaces not collapsed 1 | A4 weights count 962 3 | A5 weight magnitude 1e6 1 | A6 NaN weights allowed 1 | A7 string weights allowed 1 | A8 the weights not copied 1
//   A9 the theta key list shortened 3 | A10 theta magnitude 1e9 1 | A11 the body's local flag honoured 2 | A12 an unknown circuit allowed 1 | A14 hue not wrapped 1 | A15 the id ignores the weights 1 | A16 the id ignores the name 5
//   A17 the id ignores the theta 1 | A18 from not sanitised 1 | A19 evicts a LOCAL sub first 1 | A20 evicts the NEWEST when all are local 1 | A21 cap 100 1 | A22 list oldest first 1 | A23 counts wrong 1 | A24 pilot kind wrong 1
//   A25 the legacy theta not filled 2 | A26 the legacy default fills OVER the file 1 | A27 fish 'live' without a fish circuit 2 | A28 fly 'live' without weights 1 | A29 fly 'live' without a circuit 1 | A30 grammar always plural 1
//   A31 the stand-in hides the truth 1 | A32 a skipped file not named 1
//   A13 (an ARRAY body allowed) is an EQUIVALENT MUTANT, left standing and said: an array has no `name`, so it is refused one line later anyway; the explicit check is belt-and-braces.
// A8, A23, A24 and A26 went 0 red the first time: the 'copied' row never edited the body afterwards; the counts row had one local and one remote (so remote = local and remote = total - local agree); the pilot-kind row
// only ever stored a network sub; and the legacy-fill row used a file with no searchPing (so the order of the merge did not matter) -- each row now has the case that separates the mutant. Several first patterns carried
// stray backslashes from the shell and the editor said PATTERN MISSING out loud; they were re-run with the real text.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as TA from "../brain/subTactics.mjs";
import * as PS from "../brain/pilotSubPolicy.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const C = createRequire(import.meta.url)("./subAquariumCore.js");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const W = () => Array.from({ length: 963 }, (_, i) => Math.sin(i) * 0.5), TH = () => Object.fromEntries(C.THETA_NAMES.map((k, i) => [k, i + 1]));
const good = (o = {}) => ({ name: "Test Sub", ...o });

console.log("subAquariumCore-selfcheck -- the sub aquarium's rules\n");

console.log("1. THE NAME");
{
    ok("!! a name keeps letters, digits, space and . _ - ( ) and drops the rest: '<b>Hi</b> (v2.1)_x-y' -> 'bHib (v2.1)_x-y'; tags, quotes, slashes, control characters and unicode go", C.cleanName("<b>Hi</b> (v2.1)_x-y") === "bHib (v2.1)_x-y" && C.cleanName("a\u0000b‮c\"'`\\/;&d") === "abcd" && C.cleanName("café \u{1F41F}") === "caf");
    ok("!! runs of space collapse and the ends are trimmed; 40 characters at most; a non-string is read as text; nothing left is the empty string", C.cleanName("  a    b \t\n c  ") === "a b c" && C.cleanName("x".repeat(80)).length === 40 && C.cleanName(12345) === "12345" && C.cleanName(null) === "" && C.cleanName("<>/") === "");
}

console.log("\n2. THE SUB");
{
    const r = C.validateSub(good());
    ok("!! the smallest sub is { name }: circuit defaults to 'gfc', weights and theta null (the PD autopilot), a hue 0..359 derived from the name, and EXACTLY the fields name, circuit, weights, theta, hue", r.ok && Object.keys(r.sub).sort().join() === "circuit,hue,name,theta,weights" && r.sub.circuit === "gfc" && r.sub.weights === null && r.sub.theta === null && r.sub.hue >= 0 && r.sub.hue < 360 && C.validateSub(good()).sub.hue === r.sub.hue && C.validateSub(good({ name: "Other" })).sub.hue !== r.sub.hue);
    const evil = JSON.parse('{"name":"x","local":true,"from":"10.0.0.9","__proto__":{"polluted":1},"constructor":{"a":1},"arrivedAt":0,"id":"abc"}'), e = C.validateSub(evil);
    ok("!! a body that claims local: true, a from, an id, an arrivedAt, a __proto__ or a constructor gets NONE of them: the result has only the five known fields and Object.prototype is untouched", e.ok && Object.keys(e.sub).sort().join() === "circuit,hue,name,theta,weights" && ({}).polluted === undefined && !("local" in e.sub) && !("from" in e.sub));
    const body = good({ weights: W() }), w = C.validateSub(body); body.weights[0] = 999; body.weights.length = 5;
    ok("!! 963 finite weights pass (and are copied: editing the body afterwards does not change the sub); 962 or 964 are refused by field and count", w.ok && w.sub.weights.length === 963 && C.validateSub(good({ weights: W().slice(1) })).error.includes("weights: exactly 963") && C.validateSub(good({ weights: [...W(), 1] })).error.includes("weights: exactly 963"));
    const bad = (v) => { const a = W(); a[17] = v; return C.validateSub(good({ weights: a })); };
    ok("!! a bad weight is refused with its INDEX: NaN, Infinity, a string, null, an object and 1000.0001 at index 17 all say 'weights[17]'; exactly 1000 and -1000 pass", [NaN, Infinity, -Infinity, "0.5", null, {}, 1000.0001, -1001].every((v) => /weights\[17\]/.test(bad(v).error || "")) && bad(1000).ok && bad(-1000).ok);
    ok("!! weights that are not an array (an object, a string, a number) are refused; weights: null and weights omitted are both the PD autopilot", !C.validateSub(good({ weights: { length: 963 } })).ok && !C.validateSub(good({ weights: "x".repeat(963) })).ok && !C.validateSub(good({ weights: 963 })).ok && C.validateSub(good({ weights: null })).sub.weights === null);
    const t = C.validateSub(good({ theta: TH() })), miss = TH(); delete miss.searchPing;
    ok("!! a theta needs all twelve names finite: the full set passes; one missing is refused BY NAME ('theta.searchPing'); NaN, a string and 10001 are refused by name; an array is refused", t.ok && JSON.stringify(t.sub.theta) === JSON.stringify(TH()) && /theta\.searchPing/.test(C.validateSub(good({ theta: miss })).error) && /theta\.fireRange/.test(C.validateSub(good({ theta: { ...TH(), fireRange: NaN } })).error) && /theta\.aimTol/.test(C.validateSub(good({ theta: { ...TH(), aimTol: "0.2" } })).error) && /theta\.evadeTime/.test(C.validateSub(good({ theta: { ...TH(), evadeTime: 10001 } })).error) && !C.validateSub(good({ theta: [1, 2, 3] })).ok);
    ok("!! an unknown circuit is refused by name ('fish'), a body that is not an object (null, an array, a string, a number) is refused, and an empty name is refused", /fish/.test(C.validateSub(good({ circuit: "fish" })).error) && [null, [], "sub", 7, undefined].every((b) => !C.validateSub(b).ok) && /name/.test(C.validateSub({ name: "<>" }).error) && /name/.test(C.validateSub({}).error));
    ok("a hue given is taken, rounded and wrapped into 0..359 (-30 -> 330, 725 -> 5, 12.6 -> 13); a hue that is not a number is derived", C.validateSub(good({ hue: -30 })).sub.hue === 330 && C.validateSub(good({ hue: 725 })).sub.hue === 5 && C.validateSub(good({ hue: 12.6 })).sub.hue === 13 && C.validateSub(good({ hue: "red" })).sub.hue === C.validateSub(good()).sub.hue);
}

console.log("\n3. THE DRIFT GUARD");
{
    ok("!! THETA_NAMES is brain/subTactics.mjs's THETA_NAMES, in order (twelve), and WEIGHTS.gfc is brain/pilotSubPolicy.mjs's WEIGHT_COUNT (963): if the tactician or the network changes shape this goes red, not the aquarium", C.THETA_NAMES.join() === TA.THETA_NAMES.join() && C.THETA_NAMES.length === 12 && C.WEIGHTS.gfc === PS.WEIGHT_COUNT && PS.WEIGHT_COUNT === 963, `${C.THETA_NAMES.length} / ${PS.WEIGHT_COUNT}`);
}

console.log("\n4. THE TANK");
{
    const a = C.validateSub(good({ weights: W(), theta: TH() })).sub, b = C.validateSub(good({ weights: W(), theta: TH() })).sub;
    ok("!! the id is a function of the CONTENT: the same sub twice has one id; a different name, a different weight (1e-5 apart) or a different theta number is a different id", C.subId(a) === C.subId(b) && C.subId(a) !== C.subId({ ...a, name: "Other" }) && C.subId(a) !== C.subId({ ...a, weights: a.weights.map((v, i) => (i === 5 ? v + 1e-5 : v)) }) && C.subId(a) !== C.subId({ ...a, theta: { ...a.theta, fireRange: 99 } }) && /^[0-9a-f]{8}$/.test(C.subId(a)));
    let t = 1000; const reg = C.createRegistry({ now: () => t++ });
    const r1 = reg.add(a, { from: "192.168.1.5" }), r2 = reg.add(b, { from: "192.168.1.5" });
    ok("!! sending the same sub again REPLACES it (replaced: true, still one sub), and `from` and `local` are what the CALLER says: the stored sub is remote with the connection's from, whatever the body claimed", !r1.replaced && r2.replaced && r1.id === r2.id && reg.counts().total === 1 && reg.get(r1.id).local === false && reg.get(r1.id).from === "192.168.1.5" && reg.get(r1.id).pilot === "network" && reg.get(reg.add(C.validateSub(good({ name: "PD" })).sub).id).pilot === "autopilot");
    ok("!! `from` is sanitised to address characters (letters, digits, . : - [ ]) and 60 characters: '<script>192.168.1.9' -> 'script192.168.1.9'", C.createRegistry().add(a, { from: "<script>192.168.1.9" }).id && (() => { const g = C.createRegistry(), r = g.add(a, { from: "<script>192.168.1.9\u0000" }); return g.get(r.id).from === "script192.168.1.9"; })());
    const small = C.createRegistry({ cap: 4, now: () => t++ }), mk = (n) => C.validateSub({ name: "S" + n }).sub;
    const loc = small.add(mk(0), { local: true }).id; for (let i = 1; i <= 6; i++) small.add(mk(i), { from: "10.0.0." + i });
    ok("!! over its cap the registry evicts the oldest REMOTE sub first: with a cap of 4, one local sub (the oldest) and six remote arrivals, the local sub is STILL THERE and the three newest remote subs are the others", small.counts().total === 4 && small.get(loc) !== null && small.list().filter((e) => !e.local).map((e) => e.name).sort().join() === "S4,S5,S6", small.list().map((e) => e.name).join());
    const all = C.createRegistry({ cap: 2, now: () => t++ }), l1 = all.add(mk(1), { local: true }).id; all.add(mk(2), { local: true }); all.add(mk(3), { local: true });
    ok("!! when everything is local the OLDEST local sub goes: cap 2, three local subs -> the first is gone", all.counts().total === 2 && all.get(l1) === null);
    const ord = C.createRegistry({ now: (() => { let k = 0; return () => k++; })() }); ord.add(mk(1)); ord.add(mk(2)); ord.add(mk(3));
    ok("list() is newest first; counts() splits local from remote; remove() and clear() work and say whether anything was removed", ord.list().map((e) => e.name).join() === "S3,S2,S1" && (() => { const q = C.createRegistry(); q.add(mk(1), { local: true }); q.add(mk(2)); q.add(mk(3)); const c = q.counts(); return c.total === 3 && c.local === 1 && c.remote === 2 && q.remove(q.list()[0].id) === true && q.remove("nope") === false && (q.clear(), q.counts().total === 0); })());
    ok("the default cap is 24 and a registry really holds 24: 30 distinct subs in, 24 out", C.CAP === 24 && (() => { const q = C.createRegistry({ now: (() => { let k = 0; return () => k++; })() }); for (let i = 0; i < 30; i++) q.add(mk(i)); return q.counts().total === 24; })());
}

console.log("\n5. THE SEED");
{
    const read = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(ENG, rel), "utf8")); } catch { return null; } };
    const s = C.seedSubs(read);
    ok("!! from the files this tree has, all six subs are built and valid: the PD autopilot (weights null) and five trained pilots with 963 weights, each with a tactician theta except the PD one", s.subs.length === 6 && s.skipped.length === 0 && s.subs[0].weights === null && s.subs[0].theta === null && s.subs.slice(1).every((x) => x.weights.length === 963 && x.theta && C.THETA_NAMES.every((k) => Number.isFinite(x.theta[k]))), s.subs.map((x) => x.name).join(" | "));
    const old = JSON.parse(fs.readFileSync(path.join(ENG, "brain/subTacticsThetaWip.json"), "utf8")).theta, dh = s.subs.find((x) => x.name === "Explorer depth-hold champion");
    ok("!! a theta file written BEFORE the twelfth number (subTacticsThetaWip.json has eleven) is read with searchPing at its default 0 and every other number as the file has it; the wire format stays strict (a peer sending eleven is refused by name)", dh && dh.theta.searchPing === 0 && C.THETA_NAMES.filter((k) => k !== "searchPing").every((k) => dh.theta[k] === old[k]) && old.searchPing === undefined && /theta\.searchPing/.test(C.validateSub({ name: "x", theta: old }).error) && C.THETA_LEGACY.searchPing === 0 && Object.keys(C.THETA_LEGACY).length === 1);
    const sp = JSON.parse(fs.readFileSync(path.join(ENG, "brain/subTacticsThetaSearchPingWip.json"), "utf8")).theta, act = s.subs.find((x) => x.name === "Explorer actuator champion");
    ok("!! a theta file that HAS all twelve numbers keeps its own searchPing (the legacy default fills only what is missing, never over what is there): the actuator champion's is the file's 7.69, not 0", act && act.theta.searchPing === sp.searchPing && sp.searchPing > 1);
    const tp = s.subs.find((x) => x.name === "Explorer tail pilot"), tf = read("brain/pilotSubWeightsRobustTail2Wip.json"), rf = read("brain/pilotSubWeightsRobustLongWip.json");
    ok("!! the tail pilot (seed 9400, the one audited on BOTH hulls) is offered, built from brain/pilotSubWeightsRobustTail2Wip.json bit for bit -- not from the long or the first tail file", tp && tf && rf && tp.weights.length === 963 && tp.weights.every((v, i) => v === tf.weights[i]) && tp.weights.some((v, i) => v !== rf.weights[i]) && tp.theta && tp.theta.searchPing > 1);
    const np = s.subs.find((x) => x.name === "Explorer noisy-senses pilot"), nf = read("brain/pilotSubWeightsRobustNoisyWip.json"), tf2 = read("brain/pilotSubWeightsRobustTail2Wip.json");
    ok("!! the noisy-senses pilot (seed 9602, audited at four disturbance levels on five hulls) is offered, built from brain/pilotSubWeightsRobustNoisyWip.json bit for bit -- not from the tail pilot's file it was trained from", np && nf && tf2 && np.weights.length === 963 && np.weights.every((v, i) => v === nf.weights[i]) && np.weights.some((v, i) => v !== tf2.weights[i]) && np.theta && np.theta.searchPing > 1);
    const none = C.seedSubs(() => null), partial = C.seedSubs((rel) => (/Actuators/.test(rel) ? read(rel) : /Theta/.test(rel) ? read(rel) : null));
    ok("!! a file that is missing is SKIPPED BY NAME with the file in the reason (all trained pilots missing: only the PD autopilot is offered, five are skipped); an invalid weight file is skipped with the validator's own reason", none.subs.length === 1 && none.skipped.length === 5 && none.skipped.every((x) => /\.json missing/.test(x.why)) && partial.subs.length === 2 && partial.skipped.length === 4);
    const corrupt = C.seedSubs((rel) => (/pilotSubWeightsWip/.test(rel) ? { weights: [1, 2, 3] } : read(rel)));
    ok("a weight file with the wrong number of weights is skipped with 'weights: exactly 963' as the reason, and the other subs are unaffected", corrupt.skipped.length === 1 && /exactly 963/.test(corrupt.skipped[0].why) && corrupt.subs.length === 5);
}

console.log("\n6. THE CHIPS");
{
    const F = C.flyBrainHealth, B = C.fishBrainHealth;
    ok("!! flyBrainHealth: the circuit AND trained weights -> live; the circuit alone -> stale (hand weights only); no circuit -> offline (whatever the weights); nothing known -> offline", F({ circuit: true, weights: true }).state === "live" && F({ circuit: true, weights: false }).state === "stale" && F({ circuit: false, weights: true }).state === "offline" && F(null).state === "offline" && /hand weights/.test(F({ circuit: true, weights: false }).detail));
    ok("!! fishBrainHealth: 'live' needs a FISH circuit AND a pilot; with pilots but no fish circuit it is 'standin' and says STAND-IN and that ZAPBench is activity, not wiring; with no pilots it is 'offline' -- even if a fish circuit exists", B({ fishCircuit: true, pilots: ["a"], fishPilots: ["a"] }).state === "live" && B({ fishCircuit: true, pilots: ["a", "b"] }).state === "standin" && /no pilot is wired to it/.test(B({ fishCircuit: true, pilots: ["a"] }).detail) && B({ fishCircuit: true, pilots: ["a"], fishPilots: [] }).state === "standin" && B({ fishCircuit: false, flyCircuit: true, pilots: ["a", "b"] }).state === "standin" && /STAND-IN/.test(B({ fishCircuit: false, pilots: ["a"] }).detail) && /activity, not wiring/.test(B({ fishCircuit: false, pilots: ["a"] }).detail) && B({ fishCircuit: true, pilots: [] }).state === "offline" && B(null).state === "offline");
    ok("!! the fish detail counts the tank with correct grammar: '1 sub (1 here, 0 from peers)' and '3 subs (1 here, 2 from peers)'; and '1 sub pilot is' / '2 sub pilots are'", /Aquarium: 1 sub \(1 here, 0 from peers\)/.test(B({ pilots: ["a"] }, { total: 1, local: 1, remote: 0 }).detail) && /Aquarium: 3 subs \(1 here, 2 from peers\)/.test(B({ pilots: ["a"] }, { total: 3, local: 1, remote: 2 }).detail) && /1 sub pilot is/.test(B({ pilots: ["a"] }).detail) && /2 sub pilots are/.test(B({ pilots: ["a", "b"] }).detail));
}

console.log("\n7. THE FRONT DOOR");
{
    ok("!! the export list is pinned", Object.keys(C).sort().join() === "CAP,MAX_BODY,SEED_RECIPES,THETA_LEGACY,THETA_NAMES,WEIGHTS,cleanName,createRegistry,flyBrainHealth,fishBrainHealth,hueOf,seedSubs,subId,validateSub".split(",").sort().join(), Object.keys(C).sort().join());
    ok("MAX_BODY is 64 KB and a full sub (963 weights + a theta) fits inside it with room to spare", C.MAX_BODY === 65536 && JSON.stringify({ name: "x", circuit: "gfc", weights: W(), theta: TH(), hue: 1 }).length < C.MAX_BODY / 2, `${JSON.stringify({ name: "x", weights: W(), theta: TH() }).length} bytes`);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
