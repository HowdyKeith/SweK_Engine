// WebGLEngine/render/subAquariumPlain14-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subAquariumPlain14-selfcheck.mjs      (about 4 s)
//
// THE GATE OF render/subAquariumPlain14.mjs: the plain 14-50-4 relu net with NO wiring (brain/pilotSubPlain.mjs, 954 weights) as a kind of sub the Sub Aquarium's tank can seat: the control of the head-to-head round H2 beside the 963-weight tank networks.
//   1 THE KIND      circuit plain14, 954 weights (14 x 50 + 50 + 0 + 50 x 4 + 4), no state, a label naming 50 units, no wiring and 954 weights, frozen.
//   2 THE PILOT     build refuses a wrong count (both sides), nothing, a non-finite weight; its commands equal brain/pilotSubPlain.mjs's pilot built the same way, command for command over 300 ticks of a kicked vessel, a FRESH target object every tick and every aux; the weights are held as 32-bit floats;
//                   no state; the weights are copied at build; the controls are four finite numbers inside [-1, 1]. A TRAINED CHAMPION DOES NOT EXIST YET (the training is a rig run: node tools/ship/trainPilotSub.mjs --circuit plain14 --workers 4 --write --out brain/pilotSubPlain14Wip.json), so the rows use a fixture: the hand weights with the readout set by hand.
//   3 THE START     the hand weights (the autopilot's laws written through the net) are the PD autopilot to 1e-6 over 300 ticks, 954 of them, with no recurrent weight at all.
//   4 THE FILE      checkFile takes a swek-brain-v1 file of policy pilotSubPlain14 with 954 weights and refuses what is not one (not an object, another format or policy, a wrong count, a short list, a non-finite weight); entryOfFile is { pilot: plain14, circuit: plain14, weights } with a fresh array each call; and the committed champion file brain/pilotSubPlain14Wip.json, when it exists, passes the check.
//   5 THE ARM       { id plain14-954, layer flying, controls [autopilot], note, entry, register } frozen; register(tank) calls tank.registerPilotKind once with (plain14, the kind); the caller's id and controls are kept; bad ones refused.
//   6 IN THE TANK   flown as the board flies the dropout task (a fresh one-sub tank per id, arm.register, sync, setEvent "dropout", 160 s): the sub is seated by the kind and never lost; the hand-weight plain net equals the autopilot's settled dark heading error; the fixture is live (differs from the autopilot by over 0.02 rad on an id).
//   7 THE SOURCE    pure; the one import.
// NOT CHECKED, said plainly: that a trained plain net flies WELL (no champion exists yet); that it is worse than a wired network (that is the head-to-head round's question); the page; the switchboard (not in this tree).
// SABOTAGE (2026-11-05, 56 mutants of render/subAquariumPlain14.mjs: 30 mechanical single-site and 26 by hand, each run alone in a scratch tree): 56 killed -- 35 red BY NAME, 21 the gate threw on (a guard refusing the changed input), 0 survivors. The first pass left 4: the numbers in the arm's note text (963, 50) -- closed by the row that holds the note word for word; all four red on the rerun. Two hand mutants were not applied (their text did not occur once in the file).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as AP from "../brain/autopilotSub.mjs";
import * as PP from "../brain/pilotSubPlain.mjs";
import * as A from "./subAquariumSim.mjs";
import * as K from "./subAquariumPlain14.mjs";

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
console.log("subAquariumPlain14-selfcheck -- the plain 14-50-4 net as a tank kind\n");

const N = PP.PLAIN14.WEIGHT_COUNT, HAND = PP.PLAIN14.handWeights(), model = S.createSubModel();
// the fixture: the hand weights with the readout (the last 4 x (50 + 1) weights) moved by hand by 0.1 sin(1.7 i) (the hand readout is 1 and -1 on the first eight units of each row, 0 elsewhere), deterministic, not a trained champion
const FIX = Array.from(HAND); for (let i = N - 204; i < N; i++) FIX[i] = Math.round((HAND[i] + 0.1 * Math.sin(i * 1.7)) * 1e6) / 1e6;
const FILE = { format: "swek-brain-v1", policy: "pilotSubPlain14", weightCount: N, score: -0.5, weights: FIX }, W = FIX;
const kicked = () => S.createState({ depth: 25, speed: 2, pos: [250, 150, -25], heading: 0.3, pitch: 0.12, bank: 0.2, w: [0.08, 0.05, -0.03], model });
const tgtAt = (i) => ({ depth: 32 + 3 * Math.sin(i / 40), heading: 1.2 - i / 100, speed: 2.2 });
/** The state sequence of `n` ticks flown by `pilot` from a kicked start, a fresh target object each tick. */
function states(pilot, n) { const out = []; let s = kicked(); for (let i = 0; i < n; i++) { out.push(s); s = S.stepSub(model, s, pilot(s, tgtAt(i), [0, 0, 0]), S.DT, [0, 0, 0], 0).state; } return out; }

sec("1. THE KIND");
{
    const k = K.plain14Kind();
    ok("!! the facts: circuit plain14, 954 weights (14 x 50 + 50 + 0 + 200 + 4), no state, a label naming 50 units, no wiring and 954 weights, frozen; CIRCUIT and FORMAT and POLICY as named", N === 954 && 14 * 50 + 50 + 0 + 50 * 4 + 4 === 954 && K.CIRCUIT === "plain14" && K.FORMAT === "swek-brain-v1" && K.POLICY === "pilotSubPlain14" && k.circuit === "plain14" && k.weightCount === 954 && k.persist === false && /50 units/.test(k.label) && /no wiring/.test(k.label) && /954 weights/.test(k.label) && Object.isFrozen(k) && typeof k.build === "function");
    ok("!! a fresh kind each call (the registry may mutate what it is given)", K.plain14Kind() !== K.plain14Kind());
}

sec("2. THE PILOT");
{
    const k = K.plain14Kind();
    const bad = [undefined, null, [], W.slice(0, 953), [...W, 0], W.map((v, i) => (i === 100 ? NaN : v)), W.map((v, i) => (i === 0 ? Infinity : v))];
    ok("!! build refuses nothing, null, an empty list, 953 weights, 955, a NaN and an Infinity, saying how many weights and which weight", bad.every((x) => throws(() => k.build(x)) !== null) && /plain net takes exactly 954 weights, got 953/.test(throws(() => k.build(W.slice(0, 953))) || "") && /got none/.test(throws(() => k.build(undefined)) || "") && /weight 100 is not a finite number/.test(throws(() => k.build(bad[5])) || ""));
    ok("!! build takes a list and a typed array", typeof k.build(W) === "function" && typeof k.build(Float32Array.from(W)) === "function");
    const ref = PP.PLAIN14.pilotFor(Float32Array.from(W)), seq = states(ref, 300), pilot = k.build(W);
    const auxOf = (i) => [undefined, { compassValid: 0, dt: 1 / 30 }, { compassValid: 1, dt: 1 / 60 }][i % 3];
    let worst = 0, live = 0; for (let i = 0; i < seq.length; i++) { worst = Math.max(worst, cmpMax(pilot(seq[i], tgtAt(i), [0, 0, 0], auxOf(i)), ref(seq[i], tgtAt(i), [0, 0, 0]))); live = Math.max(live, cmpMax(pilot(seq[i], tgtAt(i), [0, 0, 0]), AP.pilot()(seq[i], tgtAt(i), [0, 0, 0]))); }
    ok("!! over 300 ticks of a kicked vessel, a fresh target object each tick and every aux, the kind's pilot equals the library pilot, command for command", worst === 0, `max diff ${worst}`);
    const seqA = states(AP.pilot(), 100), W2 = Array.from(HAND); for (let i = N - 204; i < N - 144; i++) W2[i] = 0.123456789 + i * 1e-7;
    const p32 = PP.PLAIN14.pilotFor(Float32Array.from(W2)), p64 = PP.PLAIN14.pilotFor(Float64Array.from(W2)), pk = k.build(W2); let d32 = 0, d64 = 0; for (let i = 0; i < 100; i++) { d32 = Math.max(d32, cmpMax(pk(seqA[i], tgtAt(i), [0, 0, 0]), p32(seqA[i], tgtAt(i), [0, 0, 0]))); d64 = Math.max(d64, cmpMax(pk(seqA[i], tgtAt(i), [0, 0, 0]), p64(seqA[i], tgtAt(i), [0, 0, 0]))); }
    ok("!! the weights are held as 32-bit floats, as the trainer holds them: with sixty readout weights that are NOT exact in 32 bits the kind's commands equal the library pilot built from a Float32Array to the last bit, and differ from one built from doubles (so the row can tell)", d32 === 0 && d64 > 0, `${d32} ${d64}`);
    ok("!! and the fixture is live on the kicked vessel: its commands differ from the autopilot's by more than 0.01 somewhere (so the equality above is not two autopilots)", live > 0.01, "largest difference from the autopilot " + live.toFixed(4));
    const twice = seq.slice(0, 50).map((s, i) => cmpMax(pilot(s, tgtAt(i), [0, 0, 0]), pilot(s, tgtAt(i), [0, 0, 0])));
    const a = k.build(W), b = k.build(W), solo = k.build(W); const ca = [], cs = []; for (let i = 0; i < 100; i++) { ca.push(a(seq[i], tgtAt(i), [0, 0, 0])); b(seq[299 - i], tgtAt(i), [0, 0, 0]); cs.push(solo(seq[i], tgtAt(i), [0, 0, 0])); }
    ok("!! no state: the same inputs give the same commands twice in a row, and a pilot interleaved with another on other states gives its solo commands", twice.every((d) => d === 0) && ca.every((x, i) => cmpMax(x, cs[i]) === 0));
    const ws = Array.from(W), p1 = k.build(ws); ws.fill(0); const c1 = p1(seq[10], tgtAt(10), [0, 0, 0]), c2 = k.build(W)(seq[10], tgtAt(10), [0, 0, 0]);
    ok("!! the weights are copied at build: zeroing the list afterwards changes nothing", cmpMax(c1, c2) === 0);
    ok("!! four finite controls inside [-1, 1] on every tick, and a target field the features do not read changes nothing", seq.every((s, i) => { const x = pilot(s, { ...tgtAt(i), surface: true, extra: 9 }, [0, 0, 0]); return KEYS.every((q) => Number.isFinite(x[q]) && Math.abs(x[q]) <= 1) && cmpMax(x, pilot(s, tgtAt(i), [0, 0, 0])) === 0; }));
}

sec("3. THE START IS THE AUTOPILOT");
{
    const seq = states(AP.pilot(), 300), ap = AP.pilot(), p = K.plain14Kind().build(HAND);
    let d = 0; for (let i = 0; i < seq.length; i++) d = Math.max(d, cmpMax(p(seq[i], tgtAt(i), [0, 0, 0]), ap(seq[i], tgtAt(i), [0, 0, 0])));
    ok("!! the hand weights (the autopilot's laws written through the net) are the PD autopilot to 1e-6 over 300 ticks (the weights are float32), 954 of them", d < 1e-6 && HAND.length === 954, `max diff ${d.toExponential(2)}`);
    ok("!! the net has no wiring: no edge, 50 hidden units, and no weight between the layers beyond the two dense ones (14 x 50 + 50 + 200 + 4 = 954)", PP.plainTopology().EDGES.length === 0 && PP.PLAIN14.HIDDEN === 50 && PP.PLAIN14.REC_EDGES === 0);
}

sec("4. THE FILE");
{
    const c = K.checkFile(FILE), bad = (m) => throws(() => K.checkFile({ ...FILE, ...m })), re = (rx, s) => rx.test(s || "");
    ok("!! checkFile takes the file and returns its 954 weights (the same list) and its score", c.weights.length === 954 && c.weights === FILE.weights && c.score === -0.5);
    ok("!! it refuses, naming the fault: nothing and a string (a weights file is an object), another format, another policy, a wrong weightCount, a short list, a list that is not a list, a NaN weight", [undefined, null, "x"].every((f) => re(/a weights file is an object/, throws(() => K.checkFile(f)))) && re(/format must be swek-brain-v1/, bad({ format: "v2" })) && re(/policy must be pilotSubPlain14/, bad({ policy: "pilotSubFish" })) && re(/should have 954 weights/, bad({ weightCount: 953 })) && re(/should have 954 weights/, bad({ weights: W.slice(1) })) && re(/should have 954 weights/, bad({ weights: "x".repeat(954) })) && re(/not a finite number/, bad({ weights: W.map((v, i) => (i === 7 ? NaN : v)) })));
    const e1 = K.entryOfFile(FILE), e2 = K.entryOfFile(FILE);
    ok("!! entryOfFile checks the file as checkFile does: a wrong policy, a short list, a non-object are refused with the check's own message", /policy must be pilotSubPlain14/.test(throws(() => K.entryOfFile({ ...FILE, policy: "x" })) || "") && /954 weights/.test(throws(() => K.entryOfFile({ ...FILE, weights: W.slice(1) })) || "") && /weights file is an object/.test(throws(() => K.entryOfFile(null)) || ""));
    ok("!! entryOfFile is { pilot: plain14, circuit: plain14, weights } with the file's 954 weights, a fresh array each call, and no other key", J(Object.keys(e1).sort()) === '["circuit","pilot","weights"]' && e1.pilot === "plain14" && e1.circuit === "plain14" && e1.weights.length === 954 && e1.weights !== e2.weights && e1.weights[7] === W[7] && throws(() => K.entryOfFile({})) !== null);
    const champ = path.join(ENG, "brain/pilotSubPlain14Wip.json");
    if (fs.existsSync(champ)) { const f = JSON.parse(fs.readFileSync(champ, "utf8")); ok("!! the committed champion brain/pilotSubPlain14Wip.json passes the check (954 weights, policy pilotSubPlain14)", throws(() => K.checkFile(f)) === null && f.weights.length === 954); }
    else console.log("  (no champion file yet: brain/pilotSubPlain14Wip.json is written by the training run; the file row is skipped)");
}

sec("5. THE ARM");
{
    const arm = K.plain14Arm({ file: FILE }), keys = Object.keys(arm).sort();
    ok("!! the arm is { id, layer, controls, note, entry, register } and frozen: id plain14-954, layer flying, controls [autopilot] (frozen), a note naming the 954 weights, no wiring and no state", J(keys) === J(["controls", "entry", "id", "layer", "note", "register"]) && Object.isFrozen(arm) && arm.id === "plain14-954" && arm.layer === "flying" && J(arm.controls) === '["autopilot"]' && Object.isFrozen(arm.controls) && /954 weights/.test(arm.note) && /no wiring, no state/.test(arm.note) && /no connectome/.test(arm.note) && arm.note === "the plain control of the 963-weight networks (954 weights, 50 relu units, no wiring, no state): the PD autopilot's laws plus a learned residual through a net with no connectome in it");
    const e1 = arm.entry("sb-1"), e2 = arm.entry();
    ok("!! entry() is the tank entry { pilot: plain14, circuit: plain14, weights: the 954 }, a fresh array each call, no key that would override the board's own fields (id, name, hue, from, local, theta)", J(Object.keys(e1).sort()) === '["circuit","pilot","weights"]' && e1.circuit === "plain14" && e1.weights.length === 954 && e1.weights !== e2.weights && (e1.weights[0] = 99, arm.entry().weights[0] === W[0]));
    const calls = [], fake = { registerPilotKind: (c, kk) => { calls.push([c, kk]); return { seated: 2 }; } }, ret = arm.register(fake);
    ok("!! register(tank) calls tank.registerPilotKind once with (plain14, the kind: 954 weights) and passes its answer on", calls.length === 1 && calls[0][0] === "plain14" && calls[0][1].circuit === "plain14" && calls[0][1].weightCount === 954 && J(ret) === J({ seated: 2 }));
    const custom = K.plain14Arm({ file: FILE, id: "mine", controls: [] });
    ok("!! a caller's id and controls are kept; the file is required and checked; an empty id and bad controls are refused", custom.id === "mine" && J(custom.controls) === "[]" && [{}, { file: null }, { file: { ...FILE, weightCount: 1 } }, { file: FILE, id: "" }, { file: FILE, id: 5 }, { file: FILE, controls: "autopilot" }, { file: FILE, controls: [5] }, { file: FILE, controls: [""] }].every((o) => throws(() => K.plain14Arm(o)) !== null));
    const LAYERS = ["decision", "flying"], boardAccepts = (a) => (!a || typeof a.id !== "string" || !a.id ? "id" : !LAYERS.includes(a.layer) ? "layer" : typeof a.entry !== "function" ? "entry" : null);
    ok("!! a copy of the board's acceptance (an id, a layer of decision or flying, entry() for the dropout task) takes the arm", boardAccepts(arm) === null && boardAccepts({ ...arm, layer: "pilot" }) === "layer");
}

sec("6. IN THE TANK, FLOWN AS THE BOARD FLIES THE DROPOUT TASK");
{
    const TICK = 1 / 30, TWO_PI = 2 * Math.PI, SETTLE = 12, SECONDS = 160;
    const wrap = (a) => { let x = a % TWO_PI; if (x > Math.PI) x -= TWO_PI; if (x <= -Math.PI) x += TWO_PI; return x; };
    const AUTO = { id: "autopilot", layer: "flying", controls: [], entry: () => ({ pilot: "autopilot", circuit: "gfc", weights: null }) };
    const arm = K.plain14Arm({ file: FILE });
    const hand = { id: "plain14-hand", layer: "flying", controls: [], entry: () => ({ pilot: "plain14", circuit: "plain14", weights: Array.from(HAND) }), register: arm.register };
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
        ok("!! registered before sync, the sub is flown by the kind (circuit plain14, no kindError); registered after, the sub that was waiting on the autopilot is re-seated (seated 1)", r0.seated === 0 && w.circuit === "plain14" && w.kindError === null && w.kind !== null && waiting.kind === null && r1.seated === 1 && seated.kind !== null && seated.kindError === null);
    }
    const ids4 = [1, 2, 3, 4], fH = ids4.map((n) => flight(hand, n)), fA = ids4.map((n) => flight(AUTO, n));
    ok("!! the hand-weight plain net's settled dark heading error equals the autopilot's on every one of four ids (1e-7): seated, flying, and the autopilot", fH.every((f, i) => f.snap.kind !== null && near(f.err, fA[i].err, 1e-7) && f.dark === 1919), J(fH.map((f, i) => f.err - fA[i].err)));
    const ids6 = [1, 2, 3, 4, 5, 6], fC = ids6.map((n) => flight(arm, n)), fB = ids6.map((n) => flight(AUTO, n)), d = fC.map((f, i) => f.err - fB[i].err);
    ok("!! the fixture is seated, never lost, finite, with the dropout's 1919 dark ticks on all six ids", fC.every((f) => f.snap.kind !== null && f.snap.kindError === null && !f.snap.lost && Number.isFinite(f.err) && f.dark === 1919));
    ok("!! the fixture is not the autopilot in the tank (the residual is live): the settled dark heading error differs by over 0.02 rad on at least one id", Math.max(...d.map(Math.abs)) > 0.02, "largest " + Math.max(...d.map(Math.abs)).toFixed(4));
}

sec("7. THE SOURCE");
{
    const raw = fs.readFileSync(path.join(HERE, "subAquariumPlain14.mjs"), "utf8"), code = raw.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/**")).join("\n");
    ok("!! pure: no Math.random, no clock, no DOM, no file, no network, no process", !/Math\.random|Date\.now|new Date|performance\.now|document\.|window\.|\bfs\b|node:fs|fetch\(|process\./.test(code));
    ok("!! the one import is the plain pilot", J([...code.matchAll(/^import .* from "(.*)";$/gm)].map((m) => m[1])) === J(["../brain/pilotSubPlain.mjs"]));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exitCode = fails ? 1 : 0;
