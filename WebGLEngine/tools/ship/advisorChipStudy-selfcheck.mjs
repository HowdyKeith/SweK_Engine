// WebGLEngine/tools/ship/advisorChipStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/advisorChipStudy-selfcheck.mjs      (~13-27s: 13 on the Linux build box, 27 on the Windows rig)
//
// THE GATE OF tools/ship/advisorChipStudy.mjs (and its command): the advisor chip test registered in brain/NEEDS_AND_LIMITS.md "Round 4" and its Amendment 1. Nothing real is graded here; the arms run on a STUB EVALUATOR whose scores are a known table, and the verdicts run on hand-built
// records, so every branch of Section 6 has a worked answer. A few real dives close the loop (the untrained circuit advised by nobody IS GUARDED-OBS).
//   1  CONSTANTS   13 arms in order, the audits A B C, the references, the advisors, the margin.
//   2  STAGE A     the champions read from the records (null for a circuit with none), the hash that names them, and when stage A is complete.
//   3  THE ARMS    every arm on every audit exactly once, on the registered audit set, under the noisy gauge, with the champion's weights (or the start's); the stats summed.
//   4  THE CHECKS  stage A, identity, the advisor not trivial.
//   5  THE VERDICTS  the margin at its edge; HELPS / HURTS / NO EFFECT / MIXED; the wiring-chip verdict in every branch; brain adds to the rule; content; every line of the bottom line; the report.
//   6  THE COMMAND   arguments, the refusals (stage A incomplete, another stage A, a smoke file), the references first, resumable, workers, the report.
//   7  THE DIVES   real flights: the untrained circuit alone is GUARDED-OBS, the advised arms are the independently built pilots.
// NOT CHECKED, said plainly: that an advised pilot scores better (that is the experiment); the process spawning beyond its arguments.
//
// SABOTAGE LOG (48 mutants of tools/ship/advisorChipStudy.mjs, each run against a copy of this gate, 4 at a time; every one red BY NAME):
//   the arms and sets: ALONE inside the chip modes, the ALONE key keeping an advisor, smoke every 4th dive, the audits in another order, the gauge dropped from the arms or the references, every arm on audit A, the references on audit A only, champion weights ignored or always used, hand weights always.
//   stage A: a champion read from weights alone, a hash blind to the weights, completeness blind to smoke, to the condition, to the references record, to a missing circuit; a missing champion tolerated; a results file from another stage A or a smoke run mixed in.
//   the checks: identity as 'some', an empty identity list passing, the advisor's triviality read off GUARDED-OBS or off all kinds; the margin as the floor only; the sign of an effect reversed; the effect read against STALE; HELPS or HURTS needing only one audit.
//   the verdicts: the strongest family the weakest, PASS needing only one family, FAIL needing three lost audits, the rule comparison against one reference for both advisors, content against ALONE, the family spread dropped, the family mean dropped, one control enough, the bottom line's content clause removed, its HURTS clause and its PASS clause.
//   the command: no resume, references recomputed, the stage A check skipped or its smoke exemption removed, smoke records let into the report, workers 0, the primary advisor swapped, one identity row deleted.
//   Six went 0 red on the first pass and each led to a new row: a family that wins every audit beside one that does not (PASS 'some' of the families), a gain over the floor but under twice the spread (the spread dropped), a circuit outside stage A (a missing champion tolerated), the references record flown on the stub evaluator (audit A only, and no gauge: two mutants), and a record that says NO champion yet carries weights.
"use strict";
import fs from "node:fs";
import * as T from "../../brain/needsTask.mjs";
import * as A from "../../brain/advisorChip.mjs";
import * as TR from "./trainNeedsCircuit.mjs";
import * as S from "./advisorChipStudy.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol, J = JSON.stringify;
console.log("advisorChipStudy-selfcheck -- the advisor chip test\n");

// hand-built summaries: n runs of the given score (so the paired se of two such is 0 unless a jitter is asked for)
const summ = (score, n = 8, jitter = 0, crashed = 0) => ({ score, crashed, stranded: 0, byKind: {}, runs: Array.from({ length: n }, (_, i) => ({ kind: ["plain", "deep", "far", "both"][i % 4], score: score + (i % 2 ? jitter : -jitter), crushed: false })) });
const arms3 = (a, b, c, n, j) => ({ A: summ(a, n, j), B: summ(b, n, j), C: summ(c, n, j) });

sec("1. THE CONSTANTS");
{
    ok("!! 13 arms in the registered order: ALONE, then for GUARDED and GUARDED-FILTER the modes VETO, V-SURFACE, V-CAP, V-SAFETY, V-STATION, STALE; keys 'ALONE' and 'ADVISOR:MODE'", S.ARMS.length === 13 && J(S.ARMS.map((a) => a.key)) === J(["ALONE", ...["GUARDED", "GUARDED-FILTER"].flatMap((d) => ["VETO", "V-SURFACE", "V-CAP", "V-SAFETY", "V-STATION", "STALE"].map((m) => d + ":" + m))]) && S.armKey("GUARDED", "VETO") === "GUARDED:VETO" && S.armKey("GUARDED", "ALONE") === "ALONE" && Object.isFrozen(S.ARMS));
    ok("!! the audits are A, B, C; the primary advisor is GUARDED and the secondary GUARDED-FILTER; the references are the five registered rules; the study is the 12 circuits of Round 3; the stage A file is the one Round 3 writes; the margin is max(0.02, 2 se)", J(S.AUDITS) === J(["A", "B", "C"]) && S.PRIMARY === "GUARDED" && S.SECONDARY === "GUARDED-FILTER" && J(S.REFERENCE_NAMES) === J(["GUARDED", "GUARDED_FILTER", "GUARDED_OBS", "GUARDED_1T", "SPIN"]) && S.STUDY === TR.STUDY && /brain[\\/]needsCircuitStageA\.jsonl$/.test(S.STAGE_A_FILE) && S.GAUGE === T.GAUGE && near(S.margin({ se: 0 }), 0.02, 1e-12) && near(S.margin({ se: 0.05 }), 0.1, 1e-12));
    const full = S.setsOf(), sm = S.setsOf({ smoke: true });
    ok("!! the audit sets are the registered ones themselves (the same objects) and the smoke shrink is every eighth dive (6 of each) and a subset", S.AUDITS.every((k) => full[k] === A.ADV_AUDITS[k] && sm[k].length === 6 && sm[k].every((x) => full[k].includes(x))));
}

sec("2. STAGE A: the champions, the hash, and when it is complete");
{
    const rec = (spec, family, index, w, extra = {}) => ({ spec, family, index, condition: "noisy", smoke: false, champion: w ? 61000 : null, asStart: !w, weights: w, ...extra });
    const specs = TR.parseSpecs(TR.STUDY), recs = [{ family: "refs", spec: "refs", condition: "noisy" }, ...specs.map((s, i) => rec(TR.specName(s), s.family, s.index, i === 1 ? null : [0.5 + i, -1, 2]))];
    const ch = S.championsOf(recs);
    ok("!! the champions: a circuit with weights gets them as a Float32Array and hadChampion, a circuit with none (nostate here) gets null and is the start; the references record is kept apart", ch.refs.family === "refs" && Object.keys(ch.circuits).length === 12 && ch.circuits.cx.weights instanceof Float32Array && ch.circuits.cx.weights[0] === 0.5 && ch.circuits.cx.hadChampion === true && ch.circuits.nostate.weights === null && ch.circuits.nostate.hadChampion === false);
    const odd = S.championsOf([{ spec: "cx", family: "cx", index: 0, condition: "noisy", champion: null, asStart: true, weights: [1, 2, 3] }]);
    ok("  a record that says NO champion is the start even if it carries weights (a champion is the search whose seed the record names)", odd.circuits.cx.weights === null && odd.circuits.cx.hadChampion === false);
    const recs2 = recs.map((r) => (r.spec === "cx" ? { ...r, weights: [0.5, -1, 2.0001] } : r)), recs3 = recs.map((r) => (r.spec === "er:0" ? { ...r, champion: null, weights: null } : r));
    ok("!! the hash names the weights that will be flown: stable for the same records, different when one weight moves by 1e-4, and different when a champion is lost", ch.hash === S.championsOf(recs).hash && /^[0-9a-f]{8}$/.test(ch.hash) && S.championsOf(recs2).hash !== ch.hash && S.championsOf(recs3).hash !== ch.hash);
    const sc = S.stageComplete(recs);
    ok("!! stage A is complete with the references record and the 12 registered circuits, noisy, none smoke", sc.ok === true && sc.missing.length === 0);
    const noRefs = S.stageComplete(recs.filter((r) => r.family !== "refs")), short = S.stageComplete(recs.filter((r) => r.spec !== "layer:2")), clean = S.stageComplete(recs.map((r) => (r.spec === "cx" ? { ...r, condition: "clean" } : r))), smoke = S.stageComplete(recs.map((r) => (r.spec === "cx" ? { ...r, smoke: true } : r)));
    ok("!! it is NOT complete without the references record, with a circuit missing (layer:2, named), with a clean-condition record, or with a smoke record", !noRefs.ok && /references/.test(noRefs.why) && !short.ok && short.missing.join() === "layer:2" && /layer:2/.test(short.why) && !clean.ok && /cx/.test(clean.why) && !smoke.ok && /cx/.test(smoke.why));
}

sec("3. THE ARMS (stub evaluator, stub policy)");
{
    const calls = [], seen = { weights: [], hand: 0 };
    const ev = (factory, set, opts, meta) => { calls.push({ meta, set, gauge: opts.gauge }); return { score: 0.5, crashed: 0, stranded: 0, byKind: {}, runs: [{ kind: "far", score: 0.5, crushed: false }] }; };
    const Pol = { seatFor: (w) => { seen.weights.push(w); return () => () => ({}); }, handWeights: () => { seen.hand++; return Float32Array.from([9, 9, 9]); } };
    const champ = { spec: "cx", weights: Float32Array.from([1, 2, 3]), hadChampion: true };
    const sets = S.setsOf({ smoke: true });
    const rec = S.runCircuit({ family: "cx", index: 0 }, {}, champ, { sets, evaluate: ev, policyOf: () => Pol, stageAHash: "abcd1234" });
    ok("!! every arm is flown on every audit exactly once: 13 x 3 evaluations, each (arm, audit) pair once, on the registered set of that audit, under the noisy gauge", calls.length === 39 && new Set(calls.map((c) => c.meta.arm + "/" + c.meta.audit)).size === 39 && calls.every((c) => c.gauge === T.GAUGE && c.set === sets[c.meta.audit]) && J(Object.keys(rec.arms)) === J(S.ARMS.map((a) => a.key)) && S.ARMS.every((a) => S.AUDITS.every((k) => rec.arms[a.key][k].score === 0.5)));
    ok("!! the record names the circuit, its stage A hash, whether it had a champion, and is not smoke; the champion's weights reach the policy (one seat built, with exactly them)", rec.spec === "cx" && rec.family === "cx" && rec.stageAHash === "abcd1234" && rec.hadChampion === true && rec.smoke === false && seen.weights.length === 1 && J(Array.from(seen.weights[0])) === J([1, 2, 3]) && seen.hand === 0);
    seen.weights.length = 0;
    const rec0 = S.runCircuit({ family: "nostate", index: 0 }, {}, { spec: "nostate", weights: null, hadChampion: false }, { sets, evaluate: ev, policyOf: () => Pol });
    ok("!! a circuit with NO champion is flown as its start: the policy's own hand weights reach the seat, and the record says hadChampion false", rec0.hadChampion === false && J(Array.from(seen.weights[0])) === J([9, 9, 9]) && seen.hand === 1);
    const mk = (n) => { let k = 0; return (ctx) => ({ ctx, get stats() { return { ticks: 10, surface: ++k }; } }); };
    const f = S.flyArm(mk(), sets.A, T.GAUGE, (factory, set) => { factory({}); factory({}); factory({}); return { score: 0.4, crashed: 0, stranded: 0, byKind: {}, runs: [{ kind: "far", score: 0.4, crushed: false }] }; });
    ok("!! the stats of the pilots a run made are summed: three pilots with 10 ticks each and surface counts 1, 2, 3 read ticks 30, surface 6", f.stats.ticks === 30 && f.stats.surface === 6 && f.summary.score === 0.4);
}

sec("4. THE CHECKS");
{
    const refs = (over = {}) => ({ family: "refs", identity: [{ name: "a", same: true }, { name: "b", same: true }], references: Object.fromEntries(S.REFERENCE_NAMES.map((n) => [n, arms3(n === "GUARDED_FILTER" ? 0.8 : n === "SPIN" ? 0.5 : 0.3, n === "GUARDED_FILTER" ? 0.8 : n === "SPIN" ? 0.5 : 0.3, n === "GUARDED_FILTER" ? 0.8 : n === "SPIN" ? 0.5 : 0.3)])), ...over });
    const good = S.checksOf(refs(), { ok: true });
    ok("!! with a complete stage A, identities all the same and GUARDED-FILTER well above SPIN, the three checks pass", good.ok && good.rows.map((r) => r.name).join() === "STAGE A COMPLETE,IDENTITY,THE ADVISOR IS NOT TRIVIAL");
    const bad1 = S.checksOf(refs(), { ok: false, why: "missing er:1" }), bad2 = S.checksOf(refs({ identity: [{ name: "a", same: true }, { name: "b", same: false }] }), { ok: true }), bad3 = S.checksOf(refs({ identity: [] }), { ok: true });
    const triv = refs(); triv.references.GUARDED_FILTER = arms3(0.51, 0.51, 0.51);
    ok("!! each check fails alone: an incomplete stage A (named), one identity DIFFERENT (named in the text), no identity rows at all, and an advisor that does not beat SPIN by the margin", !bad1.ok && bad1.rows[0].text === "missing er:1" && !bad2.ok && /DIFFERENT: b/.test(bad2.rows[1].text) && !bad3.ok && !S.checksOf(triv, { ok: true }).ok && S.checksOf(triv, { ok: true }).rows[2].ok === false);
}

sec("5. THE VERDICTS (hand-built records)");
{
    // a circuit record: ALONE and, for each advisor, VETO and STALE (the other arms are not read by the verdicts)
    const rec = (spec, family, index, alone, veto, stale = null, adv = "GUARDED", jit = 0) => {
        const a3 = (v) => arms3(v[0], v[1], v[2], 8, jit), r = { spec, family, index, hadChampion: true, arms: { ALONE: a3(alone) }, stats: {} };
        for (const d of S.ADVISOR_NAMES) { const x = d === adv ? veto : veto.map((v, i) => alone[i] + (v - alone[i]) * 0), st = d === adv && stale ? stale : veto; r.arms[S.armKey(d, "VETO")] = a3(x); r.arms[S.armKey(d, "STALE")] = a3(st); for (const m of ["V-SURFACE", "V-CAP", "V-SAFETY", "V-STATION"]) r.arms[S.armKey(d, m)] = a3(x); }
        return r;
    };
    const eff = (cxGain, ctlGains, adv = "GUARDED", cxStale = null, jit = 0) => {
        const recs = [rec("cx", "cx", 0, [0.5, 0.5, 0.5], cxGain.map((g) => 0.5 + g), cxStale, adv, jit)];
        recs.push(rec("nostate", "nostate", 0, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5], null, adv), rec("withheld", "withheld", 0, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5], null, adv));
        for (const fam of S.VERDICT_FAMILIES) ctlGains[fam].forEach((g, k) => recs.push(rec(`${fam}:${k}`, fam, k, [0.5, 0.5, 0.5], [0.5 + g[0], 0.5 + g[1], 0.5 + g[2]], null, adv)));
        return recs;
    };
    const flat = (g) => [g, g, g], same3 = (g) => ({ er: [flat(g), flat(g), flat(g)], layer: [flat(g), flat(g), flat(g)], degree: [flat(g), flat(g), flat(g)] });
    const refs = { family: "refs", identity: [{ name: "x", same: true }], references: Object.fromEntries(S.REFERENCE_NAMES.map((n) => [n, arms3(0.4, 0.4, 0.4)])) };
    // the edge of the margin
    const edge = eff([0.0199, 0.0201, 0.0201], same3(0)), ve = S.verdictFor(edge, refs, "GUARDED");
    ok("!! the effect margin at its edge: a gain of 0.0199 is not a win and 0.0201 is (the floor max(0.02, 2 se = 0)); the verdict of that circuit is MIXED", ve.cx.eff.A.sign === 0 && ve.cx.eff.B.sign === 1 && ve.cx.eff.C.sign === 1 && ve.cx.verdict === "MIXED");
    const cv = (g) => S.chipVerdict(S.verdictFor(eff(g, same3(0)), refs, "GUARDED").cx.eff);
    ok("!! HELPS needs all three audits above the margin, HURTS all three below minus the margin, NO EFFECT none either way, and anything else is MIXED", cv([0.1, 0.1, 0.1]) === "HELPS" && cv([-0.1, -0.1, -0.1]) === "HURTS" && cv([0.005, -0.005, 0]) === "NO EFFECT" && cv([0.1, 0.1, 0.01]) === "MIXED" && cv([0.1, -0.1, 0.1]) === "MIXED");
    const wj = eff([0.1, 0.1, 0.1], { er: [flat(0.1), flat(0.1), flat(0.1)], layer: [flat(0.1), flat(0.1), flat(0.1)], degree: [flat(0.1), flat(0.1), flat(0.1)] }), vj = S.verdictFor(wj, refs, "GUARDED");
    ok("!! WIRING-CHIP FAIL: cx gains 0.1 and every control gains 0.1 too (a rule helps any brain equally): cx gains more than no family on any audit, so FAIL, while cx's own verdict is HELPS", vj.wiring.verdict === "FAIL" && vj.cx.verdict === "HELPS" && S.VERDICT_FAMILIES.every((f) => S.AUDITS.every((a) => vj.families[f].audits[a].wins === false)));
    const wp = eff([0.3, 0.3, 0.3], same3(0.05)), vp = S.verdictFor(wp, refs, "GUARDED");
    ok("!! WIRING-CHIP PASS: cx gains 0.3 against controls that gain 0.05 (spread 0, floor 0.02) on every audit and every family", vp.wiring.verdict === "PASS" && S.VERDICT_FAMILIES.every((f) => S.AUDITS.every((a) => vp.families[f].audits[a].wins && near(vp.families[f].audits[a].gain, 0.25, 1e-9))));
    const wb = eff([0.3, 0.3, 0.05], same3(0.05)), vb = S.verdictFor(wb, refs, "GUARDED");
    ok("!! IN BETWEEN: cx gains more than the strongest family on two audits and not on the third; FAIL when it does so on one or none", vb.wiring.verdict === "IN BETWEEN" && S.verdictFor(eff([0.3, 0.05, 0.05], same3(0.05)), refs, "GUARDED").wiring.verdict === "FAIL");
    const sp = eff([0.3, 0.3, 0.3], { er: [flat(0.1), flat(0.3), flat(0.5)], layer: [flat(0.05), flat(0.05), flat(0.05)], degree: [flat(0.05), flat(0.05), flat(0.05)] }), vs = S.verdictFor(sp, refs, "GUARDED");
    ok("!! the margin uses the family's spread of EFFECTS: ER gaining 0.1, 0.3 and 0.5 has mean 0.3 and sd 0.2, so cx at 0.3 does not gain more (needs 0.4), and ER is the strongest family on every audit", vs.families.er.audits.A.wins === false && near(vs.families.er.audits.A.needs, 0.4, 1e-9) && vs.wiring.strongest.A === "er");
    const wide = eff([0.5, 0.5, 0.5], { er: [flat(0.1), flat(0.3), flat(0.5)], layer: same3(0.05).layer, degree: same3(0.05).degree }), vw = S.verdictFor(wide, refs, "GUARDED");
    ok("!! a gain over the floor but under twice the spread is not a win: cx at 0.5 against ER at 0.1, 0.3, 0.5 gains 0.2 and needs 0.4", near(vw.families.er.audits.A.gain, 0.2, 1e-9) && vw.families.er.audits.A.wins === false && vw.families.layer.audits.A.wins === true);
    const one = eff([0.3, 0.3, 0.3], { er: same3(0.05).er, layer: same3(0.05).layer, degree: [flat(0.05), flat(0.05), [0.05, 0.05, 0.3]] }), v1 = S.verdictFor(one, refs, "GUARDED");
    ok("!! PASS needs EVERY family on EVERY audit: ER and TYPE-BLOCK beaten everywhere, DEGREE beaten on A and B but not on C (where it is the strongest family) is IN BETWEEN, not PASS", v1.wiring.verdict === "IN BETWEEN" && v1.wiring.strongest.C === "degree" && v1.families.er.audits.C.wins === true && v1.families.degree.audits.C.wins === false);
    const na = S.verdictFor(eff([0.3, 0.3, 0.3], { er: [flat(0.05), flat(0.05)], layer: same3(0.05).layer, degree: same3(0.05).degree }), refs, "GUARDED");
    ok("!! NOT ASSESSED below three finished controls of a family (ER has two), and with no cx record", na.wiring.verdict === "NOT ASSESSED" && /er need at least 3/.test(na.wiring.why) && S.verdictFor(eff([0.3, 0.3, 0.3], same3(0.05)).filter((r) => r.family !== "cx"), refs, "GUARDED").wiring.verdict === "NOT ASSESSED");
    const rl = { family: "refs", identity: [{ name: "x", same: true }], references: { ...refs.references, GUARDED: arms3(0.7, 0.7, 0.7), GUARDED_FILTER: arms3(0.9, 0.9, 0.9) } };
    const vr = S.verdictFor(eff([0.3, 0.3, 0.3], same3(0.05)), rl, "GUARDED"), vr2 = S.verdictFor(eff([0.3, 0.3, 0.3], same3(0.05), "GUARDED-FILTER"), rl, "GUARDED-FILTER");
    ok("!! BRAIN ADDS TO THE RULE compares VETO(cx) with the ADVISOR'S OWN pilot: 0.8 against GUARDED alone at 0.7 wins on every audit, but 0.8 against GUARDED-FILTER alone at 0.9 does not (each advisor is read against itself)", vr.addsToRule.every((x) => x.wins) && vr2.addsToRule.every((x) => !x.wins && x.diff < 0));
    const vc = S.verdictFor(eff([0.3, 0.3, 0.3], same3(0.05), "GUARDED", [0.3, 0.3, 0.3].map((g) => 0.5 + g - 0.1)), refs, "GUARDED"), vc0 = S.verdictFor(eff([0.3, 0.3, 0.3], same3(0.05), "GUARDED", [0.8, 0.8, 0.8]), refs, "GUARDED");
    ok("!! CONTENT compares VETO with STALE: a delayed advisor 0.1 worse loses on every audit; a delayed advisor as good does not", vc.content.every((x) => x.wins) && vc0.content.every((x) => !x.wins && near(x.diff, 0, 1e-12)));
    const bl = (recs) => S.bottomLine(S.verdictFor(recs, refs, "GUARDED"));
    ok("!! the bottom line: HELPS with PASS and CONTENT = 'better use of the chip than its controls'; HELPS with a wiring FAIL = 'a rule helps any brain about equally'; HELPS without CONTENT = 'any conservative nudge helps'; HURTS = 'worse than the brain's at what it vetoes'; MIXED = 'neither helps nor hurts consistently'; no cx = NOT YET",
       /better use of the chip than its controls did, and the benefit is the advisor's reading/.test(bl(eff([0.3, 0.3, 0.3], same3(0.05), "GUARDED", flat(0.2)))) && /a rule helps any brain about equally/.test(bl(eff([0.1, 0.1, 0.1], same3(0.1), "GUARDED", flat(0.3)))) && /any conservative nudge helps/.test(bl(eff([0.3, 0.3, 0.3], same3(0.05), "GUARDED", flat(0.8)))) && /worse than the brain's at what it vetoes/.test(bl(eff([-0.2, -0.2, -0.2], same3(0)))) && /neither helps nor hurts cx consistently \(MIXED\)/.test(bl(edge)) && /NOT YET/.test(bl(eff([0.3, 0.3, 0.3], same3(0.05)).filter((r) => r.family !== "cx"))));
    const recsR = eff([0.3, 0.3, 0.3], same3(0.05), "GUARDED", flat(0.2)), lines = S.reportLines([refs, ...recsR], { ok: true }).join("\n");
    ok("!! the report prints the checks first, the references, then for each advisor its circuits, the one-field effects, the brain-adds and content lines, the families, the correlation, the wiring verdict and the bottom line (in that order), GUARDED before GUARDED-FILTER", /ADVISOR CHIP, noisy gauge[\s\S]*STAGE A COMPLETE[\s\S]*IDENTITY[\s\S]*NOT TRIVIAL[\s\S]*references[\s\S]*--- advisor GUARDED\n[\s\S]*one-field effects for cx[\s\S]*BRAIN ADDS TO THE RULE[\s\S]*ER x3[\s\S]*r = [\s\S]*WIRING-CHIP VERDICT \(GUARDED\): PASS[\s\S]*BOTTOM LINE \(GUARDED\)[\s\S]*--- advisor GUARDED-FILTER[\s\S]*BOTTOM LINE \(GUARDED-FILTER\)/.test(lines) && S.reportLines([{ family: "x", spec: "cx" }]).length === 1);
    const refsOk = { ...refs, references: { ...refs.references, GUARDED_FILTER: arms3(0.8, 0.8, 0.8) } }, failed = S.reportLines([refsOk, ...recsR], { ok: false, why: "missing er:1" }).join("\n");
    ok("!! a failed check are the first lines after the title, the failure named before anything else, says the verdicts are not weighed, and turns every bottom line into NOT READ naming the check", /^ADVISOR CHIP, noisy gauge[^\n]*\n  \[FAILED\]\s+STAGE A COMPLETE: missing er:1\n  \[ok\]\s+IDENTITY[^\n]*\n  \[ok\]\s+THE ADVISOR IS NOT TRIVIAL[^\n]*\n  A CHECK FAILED: the verdicts below are printed and NOT weighed\n/.test(failed) && (failed.match(/NOT READ -- a check failed \(STAGE A COMPLETE\)/g) || []).length === 2);
}

{
    const seen = []; const sets = S.setsOf({ smoke: true });
    const ev = (factory, set, opts, meta) => { seen.push({ meta, set, gauge: opts.gauge }); return { score: 0.5, crashed: 0, stranded: 0, byKind: {}, runs: [{ kind: "far", score: 0.5, crushed: false }] }; };
    const rr = S.refsRecord({ sets, evaluate: ev, identity: () => [{ name: "x", same: true }], stageAHash: "abcd1234", smoke: true });
    ok("!! the references are the five registered rules, each flown once on each audit's own set under the noisy gauge; the record carries the identity rows, the stage A hash and the smoke flag", seen.length === 15 && new Set(seen.map((c) => c.meta.ref + "/" + c.meta.audit)).size === 15 && seen.every((c) => c.set === sets[c.meta.audit] && c.gauge === T.GAUGE) && J(Object.keys(rr.references)) === J(S.REFERENCE_NAMES) && rr.family === "refs" && rr.stageAHash === "abcd1234" && rr.smoke === true && rr.identity.length === 1 && S.AUDITS.every((a) => rr.references.SPIN[a].score === 0.5));
}

sec("6. THE COMMAND");
{
    const pa = (a) => S.parseArgs(a);
    ok("!! run needs --out (or --one); --workers is a whole number of 1 or more; --specs defaults to the registered study and must parse; report needs --in; a bad first word, an unknown option and a stray word are refused", /out/.test(throws(() => pa(["run"])) || "") && /workers/.test(throws(() => pa(["run", "--out", "x", "--workers", "0"])) || "") && pa(["run", "--out", "x"]).specs === TR.STUDY && /cannot read/.test(throws(() => pa(["run", "--out", "x", "--specs", "sign:0"])) || "") === false && /unknown family/.test(throws(() => pa(["run", "--out", "x", "--specs", "sign:0"])) || "") && /--in/.test(throws(() => pa(["report"])) || "") && /first word/.test(throws(() => pa(["go"])) || "") && /unknown option/.test(throws(() => pa(["run", "--out", "x", "--bogus"])) || "") && /unexpected/.test(throws(() => pa(["run", "stray"])) || ""));
    const specs = TR.parseSpecs(TR.STUDY), stageRecs = [{ family: "refs", spec: "refs", condition: "noisy" }, ...specs.map((s, i) => ({ spec: TR.specName(s), family: s.family, index: s.index, condition: "noisy", smoke: false, champion: i === 1 ? null : 61000 + i, weights: i === 1 ? null : [i, 1, 2] }))];
    const files = new Map(), logs = [], errs = [], calls = { runs: [], refs: 0, spawn: [], champs: {} };
    files.set("stageA.jsonl", stageRecs.map(J).join("\n") + "\n"); files.set("stageA-short.jsonl", stageRecs.slice(0, 5).map(J).join("\n") + "\n");
    const fakeRec = (s, c, o) => ({ spec: TR.specName(s), family: s.family, index: s.index, smoke: !!o.smoke, stageAHash: o.stageAHash, hadChampion: !!(c && c.weights), arms: Object.fromEntries(S.ARMS.map((a) => [a.key, arms3(0.5, 0.5, 0.5)])), stats: {} });
    const io = { out: (m) => logs.push(m), err: (m) => errs.push(m), readFile: (f) => files.get(f), appendFile: (f, t) => files.set(f, (files.get(f) || "") + t), exists: (f) => files.has(f),
        runner: (s, c, ch, o) => { calls.runs.push(TR.specName(s)); calls.champs[TR.specName(s)] = ch; return fakeRec(s, ch, o); },
        refsRunner: (o) => { calls.refs++; return { family: "refs", spec: "refs", smoke: !!o.smoke, stageAHash: o.stageAHash, identity: [{ name: "x", same: true }], references: Object.fromEntries(S.REFERENCE_NAMES.map((n) => [n, arms3(n === "SPIN" ? 0.4 : 0.8, 0.8, 0.8)])) }; },
        spawner: async (s) => { calls.spawn.push(TR.specName(s)); return fakeRec(s, null, { stageAHash: "x" }); } };
    const run = (args) => S.command(args, io);
    const c1 = await run(["run", "--stage-a", "stageA.jsonl", "--specs", "cx,nostate", "--out", "R.jsonl", "--quiet"]);
    const l1 = String(files.get("R.jsonl")).trim().split("\n").map((l) => JSON.parse(l));
    ok("!! a run writes the references record FIRST and then one line per circuit (1 + 2), exit 0; the champion's record reaches the runner (cx the weights, nostate none); every line carries the stage A hash", c1 === 0 && l1.length === 3 && l1[0].family === "refs" && calls.refs === 1 && J(calls.runs) === J(["cx", "nostate"]) && calls.champs.cx.hadChampion === true && calls.champs.nostate.hadChampion === false && l1.every((r) => /^[0-9a-f]{8}$/.test(r.stageAHash)) && new Set(l1.map((r) => r.stageAHash)).size === 1);
    const c2 = await run(["run", "--stage-a", "stageA.jsonl", "--specs", "cx,nostate,withheld", "--out", "R.jsonl", "--quiet"]);
    ok("!! it is resumable: a second run with one more circuit flies only that one and does not compute the references again", c2 === 0 && J(calls.runs) === J(["cx", "nostate", "withheld"]) && calls.refs === 1);
    const eShort = errs.length, c3 = await run(["run", "--stage-a", "stageA-short.jsonl", "--specs", "cx", "--out", "S.jsonl", "--quiet"]);
    ok("!! an INCOMPLETE stage A is refused (exit 1, named) before anything is flown, because the audits are fresh; --smoke is exempt so the machinery can be tried", c3 === 1 && errs.length === eShort + 1 && /not complete/.test(errs[eShort]) && !files.has("S.jsonl") && (await run(["run", "--stage-a", "stageA-short.jsonl", "--specs", "cx", "--out", "S2.jsonl", "--smoke", "--quiet"])) === 0);
    files.set("O.jsonl", J({ ...l1[1], stageAHash: "deadbeef" }) + "\n"); files.set("P.jsonl", J({ ...l1[1], smoke: true }) + "\n");
    const c4 = await run(["run", "--stage-a", "stageA.jsonl", "--specs", "cx", "--out", "O.jsonl"]), c5 = await run(["run", "--stage-a", "stageA.jsonl", "--specs", "cx", "--out", "P.jsonl"]);
    ok("!! a results file from another stage A, or from a smoke run, is refused (exit 1) and not mixed", c4 === 1 && c5 === 1 && errs.filter((m) => /another stage A or a smoke run/.test(m)).length === 2);
    const eMiss = errs.length, c5b = await run(["run", "--stage-a", "stageA.jsonl", "--specs", "er:5", "--out", "M.jsonl", "--quiet"]);
    ok("!! a circuit outside stage A's records (er:5) is refused when stage A is complete, named, and nothing is flown", c5b === 1 && /stage A has no record for er:5/.test(errs[eMiss] || "") && !files.has("M.jsonl"));
    const before = calls.runs.length, c6 = await run(["run", "--stage-a", "stageA.jsonl", "--specs", "cx,nostate", "--workers", "2", "--out", "W.jsonl", "--quiet"]);
    ok("!! with --workers above 1 each circuit goes to a child process (the spawner) and the parent keeps the records; nothing is flown in the parent", c6 === 0 && J(calls.spawn.slice().sort()) === J(["cx", "nostate"]) && calls.runs.length === before && String(files.get("W.jsonl")).trim().split("\n").length === 3);
    const c7 = await run(["run", "--one", "er:1", "--stage-a", "stageA.jsonl", "--quiet"]);
    ok("!! --one flies a single circuit and prints one RESULT line for a parent to read", c7 === 0 && logs.some((m) => /^RESULT \{/.test(m)) && calls.runs.at(-1) === "er:1");
    const rs = await run(["report", "--in", "P.jsonl"]), rr = await run(["report", "--in", "R.jsonl"]);
    ok("!! report prints for a results file (with the stage A check when --stage-a is given), smoke records are refused without --allow-smoke (exit 1), a missing file is exit 1", rr === 0 && logs.some((m) => /ADVISOR CHIP, noisy gauge/.test(m)) && rs === 1 && (await run(["report", "--in", "nothing.jsonl"])) === 1 && (await run(["report", "--in", "P.jsonl", "--allow-smoke"])) === 0);
    const cmdSrc = fs.readFileSync(new URL("./advisorChipStudyCmd.mjs", import.meta.url), "utf8");
    ok("!! the command file is three lines that import command from the library and set the exit code", /import \{ command \} from "\.\/advisorChipStudy\.mjs"/.test(cmdSrc) && /process\.exitCode = await command\(process\.argv\.slice\(2\)\)/.test(cmdSrc));
}

sec("7. THE DIVES (real flights, one BASELINE dive for each audit slot: the fresh audit seeds are not flown here)");
{
    const sets = Object.fromEntries(S.AUDITS.map((k, i) => [k, T.setOf(["far"], 501 + i, 501 + i)]));   // BASELINE seeds: the fresh audit seeds are not flown by this gate (see Round 4 Amendment 1 item 5)
    const cx = TR.loadCircuit(), rec = S.runCircuit({ family: "cx", index: 0 }, cx, { weights: null, hadChampion: false }, { sets });
    const flown = (f, k) => T.evaluate(f, sets[k], { gauge: T.GAUGE });
    ok("!! the untrained circuit ALONE is GUARDED-OBS exactly (the Round 3 start identity, here through the study's own arms) on three baseline dives", S.AUDITS.every((k) => rec.arms.ALONE[k].score === flown(T.GUARDED_OBS, k).score));
    const vetoed = A.advisedPilot(T.ruleSeat("obs"), A.ADVISORS.GUARDED, "VETO"), staled = A.advisedPilot(T.ruleSeat("obs"), A.ADVISORS.GUARDED, "STALE");
    ok("!! the advised arms are the independently built pilots: GUARDED:VETO and GUARDED:STALE of the start equal GUARDED-OBS vetoed and staled by GUARDED built here, and the stats of the arm are recorded (at most 18,000 ticks a dive: a crushed boat ends its run early)", S.AUDITS.every((k) => rec.arms["GUARDED:VETO"][k].score === flown(vetoed, k).score && rec.arms["GUARDED:STALE"][k].score === flown(staled, k).score) && S.AUDITS.every((k) => rec.stats["GUARDED:VETO"][k].ticks > 0 && rec.stats["GUARDED:VETO"][k].ticks <= 18000 && (rec.stats.ALONE[k].surface || 0) === 0));
    const idn = S.identityChecks();
    ok("!! the four identity checks run and are all the same (null advisor, a copy of the brain, GUARDED by GUARDED, GUARDED-FILTER by itself)", idn.length === 4 && idn.every((x) => x.same === true));
}

sec("8. THE EXPORTS THE OTHER SECTIONS REACH ONLY THROUGH THE COMMAND (named here so the definition ratchet can see them)");
{
    const rec = { arms: { ALONE: {}, "GUARDED:VETO": {} } };
    for (const a of A.ADV_AUDIT_NAMES) { rec.arms.ALONE[a] = { runs: [{ score: 0.2 }, { score: 0.4 }, { score: 0.6 }] }; rec.arms["GUARDED:VETO"][a] = { runs: [{ score: 0.5 }, { score: 0.7 }, { score: 0.9 }] }; }
    const e = S.effectOf(rec, "GUARDED");
    ok("!! effectOf: the chip effect of a circuit is the paired VETO minus ALONE per audit: +0.3 on each of the three audits, sign +1 (a win by the margin rule)", A.ADV_AUDIT_NAMES.every((a) => Math.abs(e[a].diff - 0.3) < 1e-9 && e[a].sign === 1));
    const stub = () => ({ seatFor: (w) => ({ w }), handWeights: () => "HAND" });
    ok("!! brainSeatOf: the champion's weights are the brain; with no champion the brain is the untrained start (the hand weights, GUARDED-OBS exactly)", S.brainSeatOf({}, {}, null, stub).w === "HAND" && S.brainSeatOf({}, {}, { weights: [1] }, stub).w[0] === 1);
    ok("!! armFactory builds a pilot factory from a brain seat and an arm (ALONE with no advisor, VETO with GUARDED), and CHIP_MODES are the Round 4 modes without ALONE", typeof S.armFactory(() => () => ({}), { adv: null, mode: "ALONE" }) === "function" && typeof S.armFactory(() => () => ({}), { adv: "GUARDED", mode: "VETO" }) === "function" && JSON.stringify(S.CHIP_MODES) === JSON.stringify(A.MODES.filter((m) => m !== "ALONE")));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
