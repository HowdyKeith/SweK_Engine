// WebGLEngine/render/subAquariumPlainNet-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subAquariumPlainNet-selfcheck.mjs      (about 6 s)
//
// THE GATE OF render/subAquariumPlainNet.mjs: the rung 4b plain-net control as a kind of sub the Sub Aquarium's tank can seat (backlog `plain-net-tank-kind`). The champions it seats are the committed ones of brain/rig-results/plainNetStudy.jsonl (48 nets: 8 weight-matched MN and 4 MG in each of the
// cells P/B, P/whole, E/E, E/whole), read here from that file; the gate fails by name if it is missing or changed in shape.
//   1 THE KIND      the widths give the weight count (9H + 4: [65] 589, [72] 652, [9] 85; [32, 32] 1,348), no state, frozen, a label; bad widths, scales and circuit names refused by name; the scales copied.
//   2 THE PILOT     build refuses a wrong count (both sides), nothing, a non-finite weight; its commands equal brain/pilotSubPlainNet.mjs's pilot built the same way, command for command over 300 ticks of a vessel kicked off level (so the tilt signals are live), with a FRESH target object every tick and
//                   every aux the tank can pass (none, compass dark, compass valid with a dt); two pilots from the same weights share nothing; the weights are copied at build; the scales are part of the pilot.
//   3 THE START     the untrained net (hidden layer drawn, output layer zero) is the PD autopilot to 1e-12; a trained champion is not (the residual is live).
//   4 THE RECORD    checkRecord takes every one of the 48 champion records and refuses what is not one (a reference record, a comparator, no spec, bad widths or scales, a wrong weight count, a non-finite weight); kindOfRecord and entryOfRecord name the circuit plainnet:<spec>.
//   5 THE ARM       the object brain/switchboard.mjs (claude/wizardly-einstein-wr30pd, f4b55956) takes with addArm: keys, values, entry(), register(tank) seating the kind, every bad option refused.
//   6 IN THE TANK   flown as the board flies the dropout task (a fresh one-sub tank per id, arm.register, sync, setEvent "dropout", 160 s): the sub is seated by the kind and never lost; the untrained net's settled dark heading error equals the autopilot's on every id (1e-9); the champion's is not the
//                   autopilot's (the residual is live in the tank) and, over twelve ids, lower by at least 0.03 rad (measured 0.064 for P/B/mn:3: 0.638 against 0.702; NOT a paired test, NOT a finding: the notes' "generic gain" of every residual pilot over the autopilot, in the tank).
//   7 THE SOURCE    pure; the one import.
// NOT CHECKED, said plainly: that the champions fly WELL (the study scored them on the 4b disturbances; brain/PLAIN_NET_CONTROL_WIP.md); that the study's scores reproduce through this kind (the study's own gate holds the rebuild of a champion from its record to 1e-4); the page; the switchboard (not in this tree);
// any tilt, gust or hazard in the tank (it has none).
//
// SABOTAGED -- 108 mutants of render/subAquariumPlainNet.mjs, each run alone in a scratch tree against this gate (the runner builds `render/` as a directory of links so that the mutated file replaces a link and never the real file; the real file's hash was checked after the run), four at a time:
// 78 red BY NAME, 29 more THREW (the gate died on an exception before its end: a detection, counted apart from the named rows), 1 EQUIVALENT and said so. 42 mechanical (every comparison, boolean, arithmetic operator and number +-1 on the code lines) and 66 written by hand: the prefix, the signal names (dropped, reordered), the families (a comparator
// allowed, mg refused); checkScales (zero or non-finite allowed, no check, not copied); the kind (the default name, a given name ignored, gfc, a non-string or empty name allowed, the scales not handed to the policy, persist, the count off by one, the label without the count or the widths, not frozen, widths and scales not frozen or copied); build (no weights, too many,
// too few, finiteness unchecked or on the first weight only, the weights not copied or copied as doubles); checkRecord (the type, the family, the spec, an empty spec, the count, the weight list, its length, finiteness, the widths and the scales returned); kindOfRecord (the circuit without the spec, the scales dropped); entryOfRecord (the label, the weights shared,
// the circuit); the arm (the default id, a given id ignored or unchecked, controls unchecked, members unchecked, the default control, the layer, controls not copied, not frozen, the note without the count, the widths or the tank clause, the entry weights shared or on the wrong circuit, register returning nothing, registering another circuit, with the scales dropped or other widths, the record unchecked).
// FIRST RUN, 9 ZERO-RED OF 108: a scale between 0 and 1 was never offered (P0006: `> 0` to `> 1` refused them); the REASONS of the refusals were not read, so the checks that only change a message or turn a clean refusal into a TypeError went unseen (H35 and P0028 the record type, H09 no scales check, H25 no weights, H37 the weight list type, P0007 the number in the scale message): the rows now read the
// message; the scales a record check returns were the record's own object (H41): a row asks for a checked copy; and H16 is EQUIVALENT: the checked copy `sc` and the caller's `scales` hold the same four numbers and the policy copies them again. One dead test was CUT before the run: `typeof s !== "object"` in checkScales (a non-object has no scale at any key, so the per-key test refuses it anyway). After the rows, 78 red, 29 threw, 1 equivalent.
// NOT SABOTAGED: the wording of the label and the note beyond what the rows read, and the messages beyond the field and the reason they name.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as AP from "../brain/autopilotSub.mjs";
import * as PN from "../brain/pilotSubPlainNet.mjs";
import * as A from "./subAquariumSim.mjs";
import * as K from "./subAquariumPlainNet.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = JSON.stringify, KEYS = ["pitch", "yaw", "thrust", "ballast"], near = (a, b, tol) => Math.abs(a - b) <= tol;
const cmpMax = (a, b) => Math.max(...KEYS.map((k) => Math.abs(a[k] - b[k])));
const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..");
console.log("subAquariumPlainNet-selfcheck -- the plain-net control as a tank kind\n");

// the committed champions
const recs = new Map();
{
    const file = path.join(ENG, "brain/rig-results/plainNetStudy.jsonl");
    ok("!! brain/rig-results/plainNetStudy.jsonl is in the tree", fs.existsSync(file));
    for (const l of fs.readFileSync(file, "utf8").split("\n").filter(Boolean)) { const r = JSON.parse(l); if (r.weights && (r.family === "mn" || r.family === "mg")) recs.set(r.spec, r); }
    const count = (f) => [...recs.values()].filter(f).length;
    ok("!! it holds 48 champion records: 8 MN in each of the four cells (P/B 589 weights, P/whole 652, E/E 85, E/whole 652) and 4 MG (1,348) in each", recs.size === 48 && ["P/B", "P/whole", "E/E", "E/whole"].every((c) => count((r) => r.spec.startsWith(c + "/mn:")) === 8 && count((r) => r.spec.startsWith(c + "/mg:")) === 4) && recs.get("P/B/mn:3").weightCount === 589 && recs.get("P/whole/mn:0").weightCount === 652 && recs.get("E/E/mn:0").weightCount === 85 && recs.get("E/whole/mn:1").weightCount === 652 && recs.get("P/B/mg:0").weightCount === 1348);
}
const REC = recs.get("P/B/mn:3"), SC = REC.scales, model = S.createSubModel();
const kicked = () => S.createState({ depth: 25, speed: 2, pos: [250, 150, -25], heading: 0.3, pitch: 0.12, bank: 0.2, w: [0.08, 0.05, -0.03], model });
/** The state sequence of `n` ticks flown by `pilot` from a kicked start, a fresh target object each tick: [state...]. */
function states(pilot, n) {
    const out = []; let s = kicked();
    for (let i = 0; i < n; i++) { out.push(s); s = S.stepSub(model, s, pilot(s, { depth: 32 + 3 * Math.sin(i / 40), heading: 1.2 - i / 100, speed: 2.2 }, [0, 0, 0]), S.DT, [0, 0, 0], 0).state; }
    return out;
}
const tgtAt = (i) => ({ depth: 32 + 3 * Math.sin(i / 40), heading: 1.2 - i / 100, speed: 2.2 });

sec("1. THE KIND");
{
    const k65 = K.plainNetKind({ widths: [65], scales: SC });
    ok("!! the facts: widths [65] give 589 weights (9 x 65 + 4), circuit plainnet:65, no state, a label naming the shape and the count, frozen", K.PREFIX === "plainnet" && k65.weightCount === 589 && k65.circuit === "plainnet:65" && k65.persist === false && /65/.test(k65.label) && /589/.test(k65.label) && Object.isFrozen(k65) && Object.isFrozen(k65.widths) && Object.isFrozen(k65.scales) && typeof k65.build === "function");
    ok("!! the other shapes: [72] 652, [9] 85, [32, 32] 1,348 (4 x 32 + 32 + 32 x 32 + 32 + 32 x 4 + 4), circuit named by the widths joined by x", K.plainNetKind({ widths: [72], scales: SC }).weightCount === 652 && K.plainNetKind({ widths: [9], scales: SC }).weightCount === 85 && K.plainNetKind({ widths: [32, 32], scales: SC }).weightCount === 1348 && K.plainNetKind({ widths: [32, 32], scales: SC }).circuit === "plainnet:32x32");
    ok("!! the weight count is the library's layout count for the same widths", [[65], [72], [9], [32, 32], [3, 4, 5]].every((w) => K.plainNetKind({ widths: w, scales: SC }).weightCount === PN.layoutOf(w).count));
    ok("!! a circuit name of the caller's is kept; \"gfc\", an empty string and a number are refused", K.plainNetKind({ widths: [9], scales: SC, circuit: "mine" }).circuit === "mine" && ["gfc", "", 5, null].every((c) => throws(() => K.plainNetKind({ widths: [9], scales: SC, circuit: c })) !== null));
    ok("!! bad widths are refused (none, an empty list, a zero, a fraction, a string, a list with a bad member)", [undefined, [], [0], [1.5], "65", [9, 0], [9, -1]].every((w) => throws(() => K.plainNetKind({ widths: w, scales: SC })) !== null));
    ok("!! bad scales are refused by the key: none, null, a missing key (each of the four), 0, negative, NaN, Infinity, a string", throws(() => K.plainNetKind({ widths: [9] })) !== null && throws(() => K.plainNetKind({ widths: [9], scales: null })) !== null && K.SIGNAL_NAMES.every((k) => { const bad = { ...SC }; delete bad[k]; return new RegExp(k).test(throws(() => K.plainNetKind({ widths: [9], scales: bad })) || ""); }) && [0, -1, NaN, Infinity, "2"].every((v) => /pPhasic/.test(throws(() => K.plainNetKind({ widths: [9], scales: { ...SC, pPhasic: v } })) || "")));
    ok("!! a scale between 0 and 1 is a scale (0.5, 1, 1e-9 accepted); a bad one is refused with the reason (\"above 0\"), and no scales at all with what the scales are", [0.5, 1, 1e-9].every((v) => throws(() => K.plainNetKind({ widths: [9], scales: { ...SC, rTonic: v } })) === null) && /rTonic.*above 0/.test(throws(() => K.plainNetKind({ widths: [9], scales: { ...SC, rTonic: 0 } })) || "") && /the scales are \{ pTonic, rTonic, pPhasic, rPhasic \}/.test(throws(() => K.plainNetKind({ widths: [9] })) || "") && /the scales are/.test(throws(() => K.plainNetKind({ widths: [9], scales: null })) || ""));
    ok("!! the scales are copied: changing the object handed in afterwards changes nothing in the kind", (() => { const sc = { ...SC }, k = K.plainNetKind({ widths: [9], scales: sc }); sc.pTonic = 99; return k.scales.pTonic === SC.pTonic; })() && J(K.SIGNAL_NAMES) === '["pTonic","rTonic","pPhasic","rPhasic"]' && J(K.FAMILIES) === '["mn","mg"]');
}

sec("2. THE PILOT");
{
    const k = K.plainNetKind({ widths: [65], scales: SC }), w = REC.weights, ref = PN.createPlainNetPolicy([65], "ref", { scales: SC }).pilotFor(Float32Array.from(w));
    const bad = [undefined, null, [], w.slice(0, 588), [...w, 0], new Array(589).fill(0).map((_, i) => (i === 100 ? NaN : 0)), new Array(589).fill(0).map((_, i) => (i === 0 ? Infinity : 0))];
    ok("!! build refuses nothing, null, an empty list, 588 weights, 590, a NaN and an Infinity", bad.every((b) => throws(() => k.build(b)) !== null) && /589/.test(throws(() => k.build(w.slice(0, 588))) || "") && /not a finite/.test(throws(() => k.build(bad[5])) || "") && /takes exactly 589 weights, got none/.test(throws(() => k.build(undefined)) || "") && /got 588/.test(throws(() => k.build(w.slice(0, 588))) || ""));
    ok("!! build takes a list and a typed array", typeof k.build(w) === "function" && typeof k.build(Float32Array.from(w)) === "function");
    const seq = states(ref, 300), pilot = k.build(w), refB = PN.createPlainNetPolicy([65], "ref", { scales: SC }).pilotFor(Float32Array.from(w));
    const auxOf = (i) => [undefined, { compassValid: 0, dt: 1 / 30 }, { compassValid: 1, dt: 1 / 60 }][i % 3];
    let worst = 0, live = 0; for (let i = 0; i < seq.length; i++) { const a = pilot(seq[i], tgtAt(i), [0, 0, 0], auxOf(i)), b = refB(seq[i], tgtAt(i), [0, 0, 0]); worst = Math.max(worst, cmpMax(a, b)); live = Math.max(live, cmpMax(a, AP.pilot()(seq[i], tgtAt(i), [0, 0, 0]))); }
    ok("!! over 300 ticks of a kicked vessel, a fresh target object each tick and every aux, the kind's pilot equals the library pilot built the same way, command for command", worst === 0, "max diff " + worst);
    ok("!! and the kicked vessel is live: the residual moves a command by more than 0.01 somewhere (so the equality above is not two zeros)", live > 0.01, "largest difference from the autopilot " + live.toFixed(4));
    const a = k.build(w), b = k.build(w), ca = [], cb = [], solo = k.build(w), cs = [];
    for (let i = 0; i < 100; i++) { ca.push(a(seq[i], tgtAt(i), [0, 0, 0])); cb.push(b(seq[299 - i], tgtAt(i), [0, 0, 0])); cs.push(solo(seq[i], tgtAt(i), [0, 0, 0])); }
    ok("!! two pilots from the same weights share nothing: interleaved with another pilot on other states, the first gives its solo commands", ca.every((c, i) => cmpMax(c, cs[i]) === 0));
    const ws = Array.from(w), p1 = k.build(ws); ws.fill(0); const c1 = p1(seq[10], tgtAt(10), [0, 0, 0]), c2 = k.build(w)(seq[10], tgtAt(10), [0, 0, 0]);
    ok("!! the weights are copied at build: zeroing the list afterwards changes nothing", cmpMax(c1, c2) === 0);
    const kOther = K.plainNetKind({ widths: [65], scales: { ...SC, rPhasic: SC.rPhasic * 3 } }).build(w);
    ok("!! the scales are part of the pilot: a different roll-rate scale gives different commands on the same weights and states", seq.slice(0, 100).some((s, i) => cmpMax(kOther(s, tgtAt(i), [0, 0, 0]), pilot(s, tgtAt(i), [0, 0, 0])) > 1e-6));
    ok("!! the pilot returns four finite controls inside [-1, 1] on every tick, and ignores a target field the features do not read", seq.every((s, i) => { const c = pilot(s, { ...tgtAt(i), surface: true, extra: 9 }, [0, 0, 0]); return KEYS.every((q) => Number.isFinite(c[q]) && Math.abs(c[q]) <= 1) && cmpMax(c, pilot(s, tgtAt(i), [0, 0, 0])) === 0; }));
}

sec("3. THE START IS THE AUTOPILOT");
{
    const pol = PN.createPlainNetPolicy([65], "x", { scales: SC }), w0 = pol.handWeights(), k = K.plainNetKind({ widths: [65], scales: SC }), p0 = k.build(w0), ap = AP.pilot();
    const seq = states(p0, 300); let d = 0; for (let i = 0; i < seq.length; i++) d = Math.max(d, cmpMax(p0(seq[i], tgtAt(i), [0, 0, 0]), ap(seq[i], tgtAt(i), [0, 0, 0])));
    ok("!! the untrained net (hidden layer drawn, output layer zero) is the PD autopilot to 1e-12 over 300 ticks of a kicked vessel", d < 1e-12 && w0.length === 589 && w0.slice(65 * 4 + 65).some((v) => v !== 0) === false, "max diff " + d.toExponential(2));
    ok("!! the hidden layer is drawn (not all zero), so the zero output layer is what makes it the autopilot", w0.slice(0, 260).some((v) => Math.abs(v) > 0.1));
}

sec("4. THE RECORD");
{
    const all = [...recs.values()], failures = all.filter((r) => throws(() => K.checkRecord(r)) !== null).map((r) => r.spec);
    ok("!! checkRecord takes all 48 champion records of the study", failures.length === 0 && all.length === 48, J(failures));
    const c = K.checkRecord(REC);
    ok("!! it returns the spec, the widths [65], the scales and the weights (589, as recorded)", c.spec === "P/B/mn:3" && J(c.widths) === "[65]" && J(c.scales) === J(SC) && c.weights.length === 589 && c.weights === REC.weights);
    const bad = (m) => throws(() => K.checkRecord({ ...REC, ...m })), re = (rx, s) => rx.test(s || "");
    ok("!! it refuses a reference record and a comparator (family refs, cmp), a missing family or spec, bad widths, a wrong weightCount, a short weight list, a NaN weight, bad scales", re(/family/, bad({ family: "refs" })) && re(/family/, bad({ family: "cmp" })) && re(/family/, bad({ family: undefined })) && re(/spec/, bad({ spec: "" })) && bad({ widths: [0] }) !== null && bad({ widths: [70] }) !== null && re(/589/, bad({ weightCount: 588 })) && re(/589/, bad({ weights: REC.weights.slice(1) })) && re(/not a finite/, bad({ weights: REC.weights.map((v, i) => (i === 5 ? NaN : v)) })) && bad({ scales: { ...SC, pTonic: 0 } }) !== null && bad({ scales: undefined }) !== null);
    ok("!! it refuses nothing at all, null and a string, saying a record is an object of the study's file; a record with no weight list or a string for one, saying how many weights it should have", [undefined, null, "P/B/mn:3"].every((r) => /a record is an object/.test(throws(() => K.checkRecord(r)) || "")) && re(/should have 589 weights/, bad({ weights: undefined })) && re(/should have 589 weights/, bad({ weights: "x".repeat(589) })));
    ok("!! the scales it returns are a checked copy, equal in value to the record's and not the record's own object", c.scales !== REC.scales && J(c.scales) === J(REC.scales));
    const kr = K.kindOfRecord(REC), er = K.entryOfRecord(REC), er2 = K.entryOfRecord(REC);
    ok("!! kindOfRecord is the kind of the record's widths and scales under circuit plainnet:P/B/mn:3 (589 weights); entryOfRecord is { pilot: plainnet, circuit, weights } with a fresh array each call and no other key", kr.circuit === "plainnet:P/B/mn:3" && kr.weightCount === 589 && J(kr.scales) === J(SC) && J(Object.keys(er).sort()) === '["circuit","pilot","weights"]' && er.pilot === "plainnet" && er.circuit === kr.circuit && er.weights.length === 589 && er.weights !== er2.weights && er.weights[7] === REC.weights[7]);
    ok("!! P/whole/mn:0 and E/whole/mn:1 are both 72 hidden units and different circuits (the spec is in the name) with their own scales", (() => { const a = K.kindOfRecord(recs.get("P/whole/mn:0")), b = K.kindOfRecord(recs.get("E/whole/mn:1")); return a.weightCount === 652 && b.weightCount === 652 && a.circuit !== b.circuit && J(a.scales) !== J(b.scales); })());
}

sec("5. THE ARM");
{
    const arm = K.plainNetArm({ record: REC }), keys = Object.keys(arm).sort();
    ok("!! the arm is { id, layer, controls, note, entry, register } and frozen: id plainnet-P/B/mn:3, layer flying, controls [autopilot] (frozen), a note naming the net and the 589 weights and that it was trained on rung 4b, not on the tank", J(keys) === J(["controls", "entry", "id", "layer", "note", "register"]) && Object.isFrozen(arm) && arm.id === "plainnet-P/B/mn:3" && arm.layer === "flying" && J(arm.controls) === '["autopilot"]' && Object.isFrozen(arm.controls) && /65/.test(arm.note) && /589 weights/.test(arm.note) && /not on anything in the tank/.test(arm.note));
    const e1 = arm.entry("sb-1"), e2 = arm.entry();
    ok("!! entry() is the tank entry { pilot: plainnet, circuit: plainnet:P/B/mn:3, weights: the 589 }, a fresh array each call, no key that would override the board's own fields (id, name, hue, from, local, theta)", J(Object.keys(e1).sort()) === '["circuit","pilot","weights"]' && e1.circuit === "plainnet:P/B/mn:3" && e1.weights.length === 589 && e1.weights !== e2.weights && (e1.weights[0] = 99, arm.entry().weights[0] === REC.weights[0]));
    const calls = [], fake = { registerPilotKind: (c, kk) => { calls.push([c, kk]); return { seated: 2 }; } }, ret = arm.register(fake);
    ok("!! register(tank) calls tank.registerPilotKind once with (plainnet:P/B/mn:3, the kind: 589 weights, the record's scales) and passes its answer on", calls.length === 1 && calls[0][0] === "plainnet:P/B/mn:3" && calls[0][1].circuit === "plainnet:P/B/mn:3" && calls[0][1].weightCount === 589 && J(calls[0][1].scales) === J(SC) && J(ret) === J({ seated: 2 }));
    const custom = K.plainNetArm({ record: REC, id: "mine", controls: [] });
    ok("!! a caller's id and controls are kept; the record is required and checked; an empty id and bad controls are refused", custom.id === "mine" && J(custom.controls) === "[]" && [{}, { record: null }, { record: { ...REC, weightCount: 1 } }, { record: REC, id: "" }, { record: REC, id: 5 }, { record: REC, controls: "autopilot" }, { record: REC, controls: [5] }, { record: REC, controls: [""] }].every((o) => throws(() => K.plainNetArm(o)) !== null));
    const LAYERS = ["decision", "flying"], boardAccepts = (a) => (!a || typeof a.id !== "string" || !a.id ? "id" : !LAYERS.includes(a.layer) ? "layer" : typeof a.entry !== "function" ? "entry" : null);
    ok("!! a copy of the board's acceptance (an id, a layer of decision or flying, entry() for the dropout task) takes the arm", boardAccepts(arm) === null && boardAccepts({ ...arm, layer: "pilot" }) === "layer");
}

sec("6. IN THE TANK, FLOWN AS THE BOARD FLIES THE DROPOUT TASK");
{
    const TICK = 1 / 30, TWO_PI = 2 * Math.PI, SETTLE = 12, SECONDS = 160;
    const wrap = (a) => { let x = a % TWO_PI; if (x > Math.PI) x -= TWO_PI; if (x <= -Math.PI) x += TWO_PI; return x; };
    const AUTO = { id: "autopilot", layer: "flying", controls: [], entry: () => ({ pilot: "autopilot", circuit: "gfc", weights: null }) };
    const arm = K.plainNetArm({ record: REC });
    const k0 = K.plainNetKind({ widths: [65], scales: SC, circuit: "plainnet:untrained" }), w0 = PN.createPlainNetPolicy([65], "x", { scales: SC }).handWeights();
    const arm0 = { id: "plain-untrained", layer: "flying", controls: [], entry: () => ({ pilot: "plainnet", circuit: "plainnet:untrained", weights: Array.from(w0) }), register: (q) => q.registerPilotKind("plainnet:untrained", k0) };
    function flight(a, n) {
        const id = "sb-" + n, q = A.createTank(); if (a.register) a.register(q);
        q.sync([{ id, name: "Board " + a.id, hue: 100, from: "board", local: true, theta: null, ...a.entry(id) }]); q.setEvent(id, "dropout");
        let target = null, age = 0, sum = 0, cnt = 0, all = 0, cntAll = 0, snap = null;
        for (let i = 0, m = Math.round(SECONDS / TICK); i < m; i++) {
            q.step(TICK); const s = snap = q.snapshot()[0];
            if (s.target !== target) { target = s.target; age = 0; } else age += TICK;
            const dark = !!(s.compass && s.compass.valid === false), e = Math.abs(wrap(s.target.heading - s.heading));
            if (dark) { all += e; cntAll++; if (age >= SETTLE) { sum += e; cnt++; } }
        }
        return { err: cnt ? sum / cnt : all / cntAll, snap, dark: cntAll };
    }
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    {
        const q = A.createTank(), r0 = arm.register(q); q.sync([{ id: "x", name: "x", hue: 1, from: "board", local: true, theta: null, ...arm.entry("x") }]);
        const w = q.snapshot()[0], q2 = A.createTank(); q2.sync([{ id: "y", name: "y", hue: 1, from: "board", local: true, theta: null, ...arm.entry("y") }]); const waiting = q2.snapshot()[0], r1 = arm.register(q2), seated = q2.snapshot()[0];
        ok("!! registered before sync, the sub is flown by the kind (circuit plainnet:P/B/mn:3, no kindError); registered after, the sub that was waiting on the autopilot is re-seated (seated 1)", r0.seated === 0 && w.circuit === "plainnet:P/B/mn:3" && w.kindError === null && w.kind !== null && waiting.kind === null && r1.seated === 1 && seated.kind !== null && seated.kindError === null);
    }
    const ids4 = [1, 2, 3, 4], f0 = ids4.map((n) => flight(arm0, n)), fA = ids4.map((n) => flight(AUTO, n));
    ok("!! the untrained net's settled dark heading error equals the autopilot's on every one of four ids (1e-9): seated, flying, and the autopilot", f0.every((f, i) => f.snap.kind !== null && near(f.err, fA[i].err, 1e-9) && f.dark === 1919), J(f0.map((f) => +f.err.toFixed(4))));
    const ids12 = Array.from({ length: 12 }, (_, i) => i + 1), fC = ids12.map((n) => flight(arm, n)), fB = ids12.map((n) => flight(AUTO, n)), d = fC.map((f, i) => f.err - fB[i].err);
    ok("!! the champion is seated, never lost, finite, with the dropout's 1919 dark ticks on all twelve ids", fC.every((f) => f.snap.kind !== null && f.snap.kindError === null && !f.snap.lost && Number.isFinite(f.err) && f.dark === 1919));
    ok("!! the champion is not the autopilot in the tank (the residual is live): the settled dark heading error differs by over 0.05 rad on at least one id", Math.max(...d.map(Math.abs)) > 0.05, "largest " + Math.max(...d.map(Math.abs)).toFixed(4));
    ok("!! over twelve ids it is at least 0.03 rad below the autopilot's (measured 0.638 against 0.702); NOT a paired test and not a finding -- the notes' generic gain of a residual pilot, seen in the tank", mean(fB.map((f) => f.err)) - mean(fC.map((f) => f.err)) >= 0.03, `${mean(fC.map((f) => f.err)).toFixed(4)} against ${mean(fB.map((f) => f.err)).toFixed(4)}`);
}

sec("7. THE SOURCE");
{
    const raw = fs.readFileSync(path.join(HERE, "subAquariumPlainNet.mjs"), "utf8"), code = raw.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/**")).join("\n");
    ok("!! pure: no Math.random, no clock, no DOM, no file, no network, no process", !/Math\.random|Date\.now|new Date|performance\.now|document\.|window\.|\bfs\b|node:fs|fetch\(|process\./.test(code));
    ok("!! the one import is the plain-net pilot", J([...code.matchAll(/^import .* from "(.*)";$/gm)].map((m) => m[1])) === J(["../brain/pilotSubPlainNet.mjs"]));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exitCode = fails ? 1 : 0;
