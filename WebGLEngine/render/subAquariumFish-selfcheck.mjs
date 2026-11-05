// WebGLEngine/render/subAquariumFish-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subAquariumFish-selfcheck.mjs      (about 4 s)
//
// THE GATE OF render/subAquariumFish.mjs: the zebrafish-wired pilot (brain/pilotSubFish.mjs, the Fish1 TEN-analysis core, 803 weights) as a kind of sub the Sub Aquarium's tank can seat (backlog `fish-pilot-tank-kind`), and the same pilot on a random circuit of its size as the control kind. The champion is the committed brain/pilotSubWeightsFishWip.json, read here from the file.
//   1 THE KIND      circuit fish, 803 weights (14 x 34 + 34 + 153 + 34 x 4 + 4), no state, a label naming 34 neurons, 153 edges and 803 weights, frozen; the control kind is circuit fish-control with the same count and its own label; the two are different pilots on the same weights.
//   2 THE PILOT     build refuses a wrong count (both sides), nothing, a non-finite weight; its commands equal brain/pilotSubFish.mjs's pilot built the same way, command for command over 300 ticks of a kicked vessel, a FRESH target object every tick and every aux the tank can pass; the control kind equals the control policy's; no state (the same inputs give the same
//                   commands whatever came before); the weights are copied at build.
//   3 THE START     the hand weights (the autopilot's laws written through the network, the recurrent core at zero) are the PD autopilot to 1e-6 on both circuits; the champion is not (the residual is live); 147 of its 803 weights differ from the hand weights (the file's own claim, recounted).
//   4 THE FILE      checkFile takes the committed file and returns its 803 weights and its score -0.3143; it refuses what is not one (not an object, another format or policy, a wrong count, a short list, a non-finite weight); entryOfFile is { pilot: fish, circuit: fish, weights } with a fresh array each call.
//   5 THE ARM       the object brain/switchboard.mjs (claude/wizardly-einstein-wr30pd, f4b55956) takes with addArm: keys, values, entry(), register(tank) seating the kind, every bad option refused.
//   6 IN THE TANK   flown as the board flies the dropout task (a fresh one-sub tank per id, arm.register, sync, setEvent "dropout", 160 s): the sub is seated by the kind and never lost; the hand-weight fish equals the autopilot's settled dark heading error on every id (1e-7); the champion's is not the autopilot's on at least one id (by over 0.05 rad).
//   7 THE SOURCE    pure; the one import.
// NOT CHECKED, said plainly: that the champion flies WELL (brain/SUBMARINE_WIP.md scored it on the 40-dive audits: -0.3236 against the autopilot's -0.4956); that the kind is better than a plain net of its size (it is not shown to be: render/subAquariumPlainNet.mjs is the control); the page; the switchboard (not in this tree); an escape response (it has none: brain/FISH_ESCAPE_PREREAD.md).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as AP from "../brain/autopilotSub.mjs";
import * as PF from "../brain/pilotSubFish.mjs";
import * as A from "./subAquariumSim.mjs";
import * as K from "./subAquariumFish.mjs";

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
console.log("subAquariumFish-selfcheck -- the zebrafish-wired pilot as a tank kind\n");

const FILE = JSON.parse(fs.readFileSync(path.join(ENG, "brain/pilotSubWeightsFishWip.json"), "utf8")), W = FILE.weights, model = S.createSubModel();
const kicked = () => S.createState({ depth: 25, speed: 2, pos: [250, 150, -25], heading: 0.3, pitch: 0.12, bank: 0.2, w: [0.08, 0.05, -0.03], model });
const tgtAt = (i) => ({ depth: 32 + 3 * Math.sin(i / 40), heading: 1.2 - i / 100, speed: 2.2 });
/** The state sequence of `n` ticks flown by `pilot` from a kicked start, a fresh target object each tick. */
function states(pilot, n) { const out = []; let s = kicked(); for (let i = 0; i < n; i++) { out.push(s); s = S.stepSub(model, s, pilot(s, tgtAt(i), [0, 0, 0]), S.DT, [0, 0, 0], 0).state; } return out; }

sec("1. THE KIND");
{
    const k = K.fishKind(), c = K.fishKind({ control: true });
    ok("!! the facts: circuit fish, 803 weights, no state, a label naming 34 neurons, 153 edges and 803 weights, frozen; CIRCUIT and FORMAT and POLICY as named", K.CIRCUIT === "fish" && K.CONTROL_CIRCUIT === "fish-control" && K.FORMAT === "swek-brain-v1" && K.POLICY === "pilotSubFish" && k.circuit === "fish" && k.weightCount === 803 && k.persist === false && /34 neurons/.test(k.label) && /153 edges/.test(k.label) && /803 weights/.test(k.label) && /zebrafish/.test(k.label) && Object.isFrozen(k) && typeof k.build === "function");
    ok("!! the control kind: circuit fish-control, the same 803 weights, no state, a label that says it is a random circuit, frozen; the weight count is the policy's (14 x 34 + 34 + 153 + 136 + 4)", c.circuit === "fish-control" && c.weightCount === 803 && c.persist === false && /random circuit/.test(c.label) && /803 weights/.test(c.label) && Object.isFrozen(c) && 14 * 34 + 34 + 153 + 136 + 4 === 803 && PF.FISH.WEIGHT_COUNT === 803 && PF.CONTROL.WEIGHT_COUNT === 803);
    const seq = states(PF.FISH.pilotFor(Float32Array.from(W)), 60), a = k.build(W), b = c.build(W);
    ok("!! the two circuits are different pilots on the same weights (a champion's weights give different commands on the fish and on the random circuit)", seq.some((s, i) => cmpMax(a(s, tgtAt(i), [0, 0, 0]), b(s, tgtAt(i), [0, 0, 0])) > 1e-3));
}

sec("2. THE PILOT");
{
    const k = K.fishKind(), c = K.fishKind({ control: true });
    const bad = [undefined, null, [], W.slice(0, 802), [...W, 0], W.map((v, i) => (i === 100 ? NaN : v)), W.map((v, i) => (i === 0 ? Infinity : v))];
    ok("!! build refuses nothing, null, an empty list, 802 weights, 804, a NaN and an Infinity (on both kinds), saying how many weights and which weight", bad.every((x) => throws(() => k.build(x)) !== null && throws(() => c.build(x)) !== null) && /fish circuit takes exactly 803 weights, got 802/.test(throws(() => k.build(W.slice(0, 802))) || "") && /control circuit takes exactly 803 weights, got none/.test(throws(() => c.build(undefined)) || "") && /weight 100 is not a finite number/.test(throws(() => k.build(bad[5])) || ""));
    ok("!! build takes a list and a typed array", typeof k.build(W) === "function" && typeof k.build(Float32Array.from(W)) === "function");
    const ref = PF.FISH.pilotFor(Float32Array.from(W)), refC = PF.CONTROL.pilotFor(Float32Array.from(W)), seq = states(ref, 300), pilot = k.build(W), pilotC = c.build(W);
    const auxOf = (i) => [undefined, { compassValid: 0, dt: 1 / 30 }, { compassValid: 1, dt: 1 / 60 }][i % 3];
    let worst = 0, worstC = 0, live = 0; for (let i = 0; i < seq.length; i++) { worst = Math.max(worst, cmpMax(pilot(seq[i], tgtAt(i), [0, 0, 0], auxOf(i)), ref(seq[i], tgtAt(i), [0, 0, 0]))); worstC = Math.max(worstC, cmpMax(pilotC(seq[i], tgtAt(i), [0, 0, 0], auxOf(i)), refC(seq[i], tgtAt(i), [0, 0, 0]))); live = Math.max(live, cmpMax(pilot(seq[i], tgtAt(i), [0, 0, 0]), AP.pilot()(seq[i], tgtAt(i), [0, 0, 0]))); }
    ok("!! over 300 ticks of a kicked vessel, a fresh target object each tick and every aux, the kind's pilot equals the library fish pilot, command for command; the control kind equals the control policy's", worst === 0 && worstC === 0, `max diff ${worst} and ${worstC}`);
    ok("!! and the champion is live on the kicked vessel: its commands differ from the autopilot's by more than 0.01 somewhere (so the equality above is not two autopilots)", live > 0.01, "largest difference from the autopilot " + live.toFixed(4));
    const twice = seq.slice(0, 50).map((s, i) => cmpMax(pilot(s, tgtAt(i), [0, 0, 0]), pilot(s, tgtAt(i), [0, 0, 0])));
    const a = k.build(W), b = k.build(W), solo = k.build(W); const ca = [], cs = []; for (let i = 0; i < 100; i++) { ca.push(a(seq[i], tgtAt(i), [0, 0, 0])); b(seq[299 - i], tgtAt(i), [0, 0, 0]); cs.push(solo(seq[i], tgtAt(i), [0, 0, 0])); }
    ok("!! no state: the same inputs give the same commands twice in a row, and a pilot interleaved with another on other states gives its solo commands", twice.every((d) => d === 0) && ca.every((x, i) => cmpMax(x, cs[i]) === 0));
    const ws = Array.from(W), p1 = k.build(ws); ws.fill(0); const c1 = p1(seq[10], tgtAt(10), [0, 0, 0]), c2 = k.build(W)(seq[10], tgtAt(10), [0, 0, 0]);
    ok("!! the weights are copied at build: zeroing the list afterwards changes nothing", cmpMax(c1, c2) === 0);
    ok("!! four finite controls inside [-1, 1] on every tick, and a target field the features do not read changes nothing", seq.every((s, i) => { const x = pilot(s, { ...tgtAt(i), surface: true, extra: 9 }, [0, 0, 0]); return KEYS.every((q) => Number.isFinite(x[q]) && Math.abs(x[q]) <= 1) && cmpMax(x, pilot(s, tgtAt(i), [0, 0, 0])) === 0; }));
}

sec("3. THE START IS THE AUTOPILOT");
{
    const hand = PF.FISH.handWeights(), handC = PF.CONTROL.handWeights(), seq = states(AP.pilot(), 300), ap = AP.pilot();
    const dev = (kind, w) => { const p = kind.build(w); let d = 0; for (let i = 0; i < seq.length; i++) d = Math.max(d, cmpMax(p(seq[i], tgtAt(i), [0, 0, 0]), ap(seq[i], tgtAt(i), [0, 0, 0]))); return d; };
    const dF = dev(K.fishKind(), hand), dC = dev(K.fishKind({ control: true }), handC);
    ok("!! the hand weights (the autopilot's laws written through the network) are the PD autopilot to 1e-6 over 300 ticks (the weights are float32: measured 5.4e-8), on the fish circuit and on the random circuit", dF < 1e-6 && dC < 1e-6 && hand.length === 803 && handC.length === 803, `max diff ${dF.toExponential(2)} and ${dC.toExponential(2)}`);
    const moved = W.filter((v, i) => Math.abs(v - hand[i]) > 1e-6).length;
    ok("!! the champion's 803 weights differ from the hand weights in exactly 147 places (the file's own count), and the recurrent core, zero in the hand weights, is not zero in the champion", moved === 147 && W.slice(14 * 34 + 34, 14 * 34 + 34 + 153).some((v) => v !== 0) && hand.slice(14 * 34 + 34, 14 * 34 + 34 + 153).every((v) => v === 0), String(moved));
}

sec("4. THE FILE");
{
    const c = K.checkFile(FILE), bad = (m) => throws(() => K.checkFile({ ...FILE, ...m })), re = (rx, s) => rx.test(s || "");
    ok("!! checkFile takes the committed file and returns its 803 weights (the same list) and its score -0.3143", c.weights.length === 803 && c.weights === FILE.weights && c.score === -0.3143 && FILE.format === "swek-brain-v1" && FILE.policy === "pilotSubFish");
    ok("!! it refuses, naming the fault: nothing and a string (a weights file is an object), another format, another policy, a wrong weightCount, a short list, a list that is not a list, a NaN weight", [undefined, null, "x"].every((f) => re(/a weights file is an object/, throws(() => K.checkFile(f)))) && re(/format must be swek-brain-v1/, bad({ format: "v2" })) && re(/policy must be pilotSubFish/, bad({ policy: "pilotSubPolicy" })) && re(/should have 803 weights/, bad({ weightCount: 802 })) && re(/should have 803 weights/, bad({ weights: W.slice(1) })) && re(/should have 803 weights/, bad({ weights: "x".repeat(803) })) && re(/not a finite number/, bad({ weights: W.map((v, i) => (i === 7 ? NaN : v)) })));
    const e1 = K.entryOfFile(FILE), e2 = K.entryOfFile(FILE);
    ok("!! entryOfFile is { pilot: fish, circuit: fish, weights } with the file's 803 weights, a fresh array each call, and no other key", J(Object.keys(e1).sort()) === '["circuit","pilot","weights"]' && e1.pilot === "fish" && e1.circuit === "fish" && e1.weights.length === 803 && e1.weights !== e2.weights && e1.weights[7] === W[7] && throws(() => K.entryOfFile({})) !== null);
}

sec("5. THE ARM");
{
    const arm = K.fishArm({ file: FILE }), keys = Object.keys(arm).sort();
    ok("!! the arm is { id, layer, controls, note, entry, register } and frozen: id fish-803, layer flying, controls [autopilot] (frozen), a note naming the 803 weights, no state and that a plain net of its size keeps its gain", J(keys) === J(["controls", "entry", "id", "layer", "note", "register"]) && Object.isFrozen(arm) && arm.id === "fish-803" && arm.layer === "flying" && J(arm.controls) === '["autopilot"]' && Object.isFrozen(arm.controls) && /803 weights, no state/.test(arm.note) && /plain net of the same size keeps its gain/.test(arm.note) && /not an escape circuit/.test(arm.note));
    const e1 = arm.entry("sb-1"), e2 = arm.entry();
    ok("!! entry() is the tank entry { pilot: fish, circuit: fish, weights: the 803 }, a fresh array each call, no key that would override the board's own fields (id, name, hue, from, local, theta)", J(Object.keys(e1).sort()) === '["circuit","pilot","weights"]' && e1.circuit === "fish" && e1.weights.length === 803 && e1.weights !== e2.weights && (e1.weights[0] = 99, arm.entry().weights[0] === W[0]));
    const calls = [], fake = { registerPilotKind: (c, kk) => { calls.push([c, kk]); return { seated: 2 }; } }, ret = arm.register(fake);
    ok("!! register(tank) calls tank.registerPilotKind once with (fish, the kind: 803 weights) and passes its answer on", calls.length === 1 && calls[0][0] === "fish" && calls[0][1].circuit === "fish" && calls[0][1].weightCount === 803 && J(ret) === J({ seated: 2 }));
    const custom = K.fishArm({ file: FILE, id: "mine", controls: [] });
    ok("!! a caller's id and controls are kept; the file is required and checked; an empty id and bad controls are refused", custom.id === "mine" && J(custom.controls) === "[]" && [{}, { file: null }, { file: { ...FILE, weightCount: 1 } }, { file: FILE, id: "" }, { file: FILE, id: 5 }, { file: FILE, controls: "autopilot" }, { file: FILE, controls: [5] }, { file: FILE, controls: [""] }].every((o) => throws(() => K.fishArm(o)) !== null));
    const LAYERS = ["decision", "flying"], boardAccepts = (a) => (!a || typeof a.id !== "string" || !a.id ? "id" : !LAYERS.includes(a.layer) ? "layer" : typeof a.entry !== "function" ? "entry" : null);
    ok("!! a copy of the board's acceptance (an id, a layer of decision or flying, entry() for the dropout task) takes the arm", boardAccepts(arm) === null && boardAccepts({ ...arm, layer: "pilot" }) === "layer");
}

sec("6. IN THE TANK, FLOWN AS THE BOARD FLIES THE DROPOUT TASK");
{
    const TICK = 1 / 30, TWO_PI = 2 * Math.PI, SETTLE = 12, SECONDS = 160;
    const wrap = (a) => { let x = a % TWO_PI; if (x > Math.PI) x -= TWO_PI; if (x <= -Math.PI) x += TWO_PI; return x; };
    const AUTO = { id: "autopilot", layer: "flying", controls: [], entry: () => ({ pilot: "autopilot", circuit: "gfc", weights: null }) };
    const arm = K.fishArm({ file: FILE });
    const hand = { id: "fish-hand", layer: "flying", controls: [], entry: () => ({ pilot: "fish", circuit: "fish", weights: Array.from(PF.FISH.handWeights()) }), register: arm.register };
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
    {
        const q = A.createTank(), r0 = arm.register(q); q.sync([{ id: "x", name: "x", hue: 1, from: "board", local: true, theta: null, ...arm.entry("x") }]);
        const w = q.snapshot()[0], q2 = A.createTank(); q2.sync([{ id: "y", name: "y", hue: 1, from: "board", local: true, theta: null, ...arm.entry("y") }]); const waiting = q2.snapshot()[0], r1 = arm.register(q2), seated = q2.snapshot()[0];
        ok("!! registered before sync, the sub is flown by the kind (circuit fish, no kindError); registered after, the sub that was waiting on the autopilot is re-seated (seated 1)", r0.seated === 0 && w.circuit === "fish" && w.kindError === null && w.kind !== null && waiting.kind === null && r1.seated === 1 && seated.kind !== null && seated.kindError === null);
    }
    const ids4 = [1, 2, 3, 4], fH = ids4.map((n) => flight(hand, n)), fA = ids4.map((n) => flight(AUTO, n));
    ok("!! the hand-weight fish's settled dark heading error equals the autopilot's on every one of four ids (1e-7; measured 1.3e-9 at most): seated, flying, and the autopilot", fH.every((f, i) => f.snap.kind !== null && near(f.err, fA[i].err, 1e-7) && f.dark === 1919), J(fH.map((f, i) => f.err - fA[i].err)));
    const ids12 = Array.from({ length: 12 }, (_, i) => i + 1), fC = ids12.map((n) => flight(arm, n)), fB = ids12.map((n) => flight(AUTO, n)), d = fC.map((f, i) => f.err - fB[i].err);
    ok("!! the champion is seated, never lost, finite, with the dropout's 1919 dark ticks on all twelve ids", fC.every((f) => f.snap.kind !== null && f.snap.kindError === null && !f.snap.lost && Number.isFinite(f.err) && f.dark === 1919));
    ok("!! the champion is not the autopilot in the tank (the residual is live): the settled dark heading error differs by over 0.05 rad on at least one id", Math.max(...d.map(Math.abs)) > 0.05, "largest " + Math.max(...d.map(Math.abs)).toFixed(4));
}

sec("7. THE SOURCE");
{
    const raw = fs.readFileSync(path.join(HERE, "subAquariumFish.mjs"), "utf8"), code = raw.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/**")).join("\n");
    ok("!! pure: no Math.random, no clock, no DOM, no file, no network, no process", !/Math\.random|Date\.now|new Date|performance\.now|document\.|window\.|\bfs\b|node:fs|fetch\(|process\./.test(code));
    ok("!! the one import is the fish pilot", J([...code.matchAll(/^import .* from "(.*)";$/gm)].map((m) => m[1])) === J(["../brain/pilotSubFish.mjs"]));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exitCode = fails ? 1 : 0;
