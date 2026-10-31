// WebGLEngine/render/subAquariumFlyCx-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subAquariumFlyCx-selfcheck.mjs      (about 1 s)
//
// THE GATE OF render/subAquariumFlyCx.mjs: the stateful fly pilot as a kind of sub the Sub Aquarium's tank can seat (brain/TANK_PILOTS_WIP.md, design point 3 and PASS/FAIL row 4). It is flown here the way the tank flies it -- the real weights of brain/pilotSubFlyCxWip.json on the real heading-loop circuit,
// through the vessel of physics/mechanics/subModel6dof.mjs -- and held to the one thing the wrapper is for: THE MEMORY MUST SURVIVE THE TANK'S HABIT OF HANDING A FRESH TARGET OBJECT EVERY TICK, AND RESTART EXACTLY WHEN THE SUB'S WANDERING TARGET CHANGES.
// WHAT IT HOLDS
//   1 THE KIND      its facts (circuit flycx, 1,729 weights, frozen, a label, stateful or NO STATE), a circuit the policy cannot be built on refused, the weight count refused by both numbers, the weights copied.
//   2 THE OBJECT    handed a fresh target object every tick, the wrapped pilot commands EXACTLY what the bare policy commands when handed one stable object (300 ticks, four controls); the bare policy handed fresh objects does not (the problem the wrapper solves, shown).
//   3 THE MEMORY    carried between ticks on one wandering target; RESTARTED when `sub.target` is replaced, even by an object with the very same numbers (identity, not value), to exactly what a pilot born at that moment commands; not restarted by the per-tick target objects of an event; a pilot given no sub restarts on the target it is handed.
//   4 THE COMPASS   `aux.compassValid` 0 changes the command, 1 and nothing at all and null do not; NO STATE differs from the stateful pilot and equals a freshly born one at every tick.
//   5 THE SEPARATION  two pilots built from the same weights do not share a memory (interleaved calls equal their solo runs); fields of the target the features do not read (surface) change nothing; a target with a non-finite number still gives four finite controls.
//   6 THE SOURCE    pure.
// NOT CHECKED, said plainly: that the pilot flies WELL in the tank (the tank's own gate flies it); that the memory does anything USEFUL (rung 4a found it does not integrate the heading: brain/SUBMARINE_WIP.md).
//
// SABOTAGED -- 38 mutants of render/subAquariumFlyCx.mjs, each run against a copy of this gate, 3 at a time: ALL 38 red BY NAME (98 red rows).
//   the circuit name, the label (in the constant and in the kind), the kind's circuit, weight count and persist claim, the freeze, the persist option ignored and its default; build's refusals (none accepted, the count check off, a loose comparison, both numbers in the message), the weights aliased instead of copied, the context default, the sub taken from the context;
//   THE MEMORY RULE: the wandering target ignored (the bare policy's behaviour, forgetting every tick), compared by value, always the same, never restarting, always restarting, restarting without its first-call guard, the dive not remembered, the target object kept across restarts; each of the three target fields copied wrong or not at all;
//   the 4th argument dropped, forced to valid, the current dropped, the raw target passed; one policy memory shared by every pilot built; the clock.
//   FIRST RUN: B07 (the `ctx = {}` default dropped) and B25 (the current dropped) went 0 red: every row passed a context, and the tank always passes still water, which is also the policy's default. Rows now build a pilot with no context at all and fly one in a current of [0.4, 0.2, 0] against the bare policy (and against still water). All 38 were run again: 38 of 38 red.
// NOT SABOTAGED: the wording of the label beyond its "148 cells".
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as H from "../physics/mechanics/subHulls.mjs";
import * as CS from "../brain/pilotSubCircuitState.mjs";
import * as K from "./subAquariumFlyCx.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = JSON.stringify, KEYS = ["pitch", "yaw", "thrust", "ballast"];
console.log("subAquariumFlyCx-selfcheck -- the stateful fly pilot as a tank kind\n");

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cj = JSON.parse(fs.readFileSync(path.join(ENG, "vendor/hemibrain/hemibrain-cx-heading-loop.json"), "utf8")), circuit = { neurons: cj.neurons, edges: cj.edges, io: cj.io };
const WF = JSON.parse(fs.readFileSync(path.join(ENG, "brain/pilotSubFlyCxWip.json"), "utf8")).weights;
const model = H.model("nominal"), kind = K.flyCxKind(circuit), policy = CS.createStatePolicy(circuit, "ref");
const start = () => S.createState({ depth: 20, speed: 2, pos: [250, 150, -20], heading: 0.3, model });
const T0 = { depth: 32, heading: 1.2, speed: 2.6 };
const cmpMax = (a, b) => Math.max(...KEYS.map((k) => Math.abs(a[k] - b[k])));
/** Fly `n` ticks from `s0` with `pilot`, the tank's way: the pilot is called with (state, target, [0,0,0], aux) and its command steps the vessel. `tOf(i)` the target handed at tick i, `auxOf(i)` the 4th argument. Returns the commands. */
function drive(pilot, n, tOf, auxOf = () => undefined, s0 = start()) {
    const cmds = []; let s = s0;
    for (let i = 0; i < n; i++) { const c = pilot(s, tOf(i), [0, 0, 0], auxOf(i)); cmds.push({ ...c }); s = S.stepSub(model, s, c, S.DT, [0, 0, 0], 0).state; }
    return { cmds, state: s };
}

sec("1. THE KIND");
{
    ok("!! the facts: circuit flycx, 1,729 weights (15 x 88 + 148 + 1 + 4 x 64 + 4), a label, stateful, frozen", K.CIRCUIT === "flycx" && kind.circuit === "flycx" && kind.weightCount === 1729 && kind.weightCount === policy.WEIGHT_COUNT && kind.persist === true && kind.label === K.LABEL && /148 cells/.test(kind.label) && Object.isFrozen(kind) && typeof kind.build === "function");
    ok("!! NO STATE is a kind of its own with the same weight count, stateful false", K.flyCxKind(circuit, { persist: false }).persist === false && K.flyCxKind(circuit, { persist: false }).weightCount === 1729);
    ok("!! a circuit the policy cannot be built on throws (an empty object, nothing, a circuit with no io)", [{}, null, { neurons: cj.neurons, edges: cj.edges }].every((c) => throws(() => K.flyCxKind(c)) !== null));
    const bad = [null, undefined, [], new Array(1728).fill(0), new Array(1730).fill(0), new Array(963).fill(0)].map((w) => throws(() => kind.build(w, {})));
    ok("!! build refuses anything but exactly 1,729 weights (none, 0, 1,728, 1,730 and 963), naming the module and both counts", bad.every((m) => m && /subAquariumFlyCx\.build: the heading loop takes exactly 1729 weights/.test(m)) && /got 1728/.test(bad[3]) && /got 1730/.test(bad[4]) && /got none/.test(bad[0]));
    const w = WF.slice(), sub = { target: T0 }, p = kind.build(w, { sub }), ref = drive(kind.build(WF, { sub: { target: T0 } }), 40, () => T0).cmds;
    for (let i = 0; i < w.length; i++) w[i] = 0;
    ok("!! the weights are COPIED: zeroing the array it was built from afterwards changes nothing", J(drive(p, 40, () => T0).cmds) === J(ref));
    ok("!! the weight array may be a plain array or a Float32Array (the tank passes a Float32Array it made)", J(drive(kind.build(Float32Array.from(WF), { sub: { target: T0 } }), 40, () => T0).cmds) === J(ref));
}

sec("2. THE TARGET OBJECT (the tank's habit)");
{
    const n = 300, sub = { target: T0 }, wrapped = drive(kind.build(WF, { sub }), n, () => ({ ...T0 })).cmds;
    const bare = drive(policy.pilotFor(Float32Array.from(WF)), n, () => T0).cmds, freshBare = drive(policy.pilotFor(Float32Array.from(WF)), n, () => ({ ...T0 })).cmds;
    const worst = Math.max(...wrapped.map((c, i) => cmpMax(c, bare[i]))), worstFresh = Math.max(...freshBare.map((c, i) => cmpMax(c, bare[i])));
    ok("!! HANDED A FRESH TARGET OBJECT EVERY TICK, the wrapped pilot commands EXACTLY what the bare policy commands when handed one stable object: 300 ticks, all four controls, the largest difference 0", worst === 0 && wrapped.length === 300, `largest difference ${worst}`);
    ok("!! and the bare policy handed a fresh object every tick does NOT (it forgets every tick): the largest difference from the stable run is above 1e-4, so the wrapper is doing something", worstFresh > 1e-4, `bare with fresh objects: ${worstFresh.toExponential(2)}`);
    const surf = drive(kind.build(WF, { sub: { target: T0 } }), n, () => ({ ...T0, surface: true, extra: 7 })).cmds;
    ok("!! fields of the target that the features do not read (an event's `surface`, anything else) change nothing: the same 300 commands", surf.every((c, i) => cmpMax(c, bare[i]) === 0));
    ok("!! the commands are real numbers within [-1, 1] on all four controls", wrapped.every((c) => KEYS.every((k) => Number.isFinite(c[k]) && Math.abs(c[k]) <= 1)));
}

{
    const cur = [0.4, 0.2, 0], s0 = start(), withCur = kind.build(WF, { sub: { target: T0 } })(s0, { ...T0 }, cur, undefined), bareCur = policy.pilotFor(Float32Array.from(WF))(s0, T0, cur), noCur = kind.build(WF, { sub: { target: T0 } })(s0, { ...T0 }, [0, 0, 0], undefined);
    ok("!! the water's current reaches the policy: the wrapped pilot given a current commands exactly what the bare policy commands given it, and that differs from the same state in still water", cmpMax(withCur, bareCur) === 0 && cmpMax(withCur, noCur) > 1e-4);
    const noCtx = drive(kind.build(WF), 40, () => T0).cmds, bare40 = drive(policy.pilotFor(Float32Array.from(WF)), 40, () => T0).cmds;
    ok("!! `build(weights)` with no context at all works and flies as the bare policy does on a stable target (the context is optional)", J(noCtx) === J(bare40));
}

sec("3. THE MEMORY (carried, and restarted exactly on a new wandering target)");
{
    const n = 200, sub = { target: T0 }, p = kind.build(WF, { sub }), long = drive(p, n, () => ({ ...T0 })), probeState = long.state;
    const continued = p(probeState, { ...T0 }, [0, 0, 0], undefined);
    const born = kind.build(WF, { sub: { target: T0 } })(probeState, { ...T0 }, [0, 0, 0], undefined);
    ok("!! THE MEMORY IS CARRIED: after 200 ticks on one wandering target the command differs from what a pilot born at that very state commands (the largest of the four controls differs by more than 1e-6)", cmpMax(continued, born) > 1e-6, `${cmpMax(continued, born).toExponential(2)}`);
    const sub3 = { target: T0 }, r = kind.build(WF, { sub: sub3 }), run3 = drive(r, n, () => ({ ...T0 }));
    sub3.target = { ...T0 };
    const restarted = r(run3.state, { ...T0 }, [0, 0, 0], undefined);
    ok("!! REPLACING `sub.target` RESTARTS THE MEMORY, even with an object that has the very same numbers (it is the identity that counts): the command is exactly that of a pilot born at that moment", cmpMax(restarted, born) === 0 && cmpMax(restarted, continued) > 1e-6);
    const sub4 = { target: { ...T0 } }, s4 = kind.build(WF, { sub: sub4 }), run4 = drive(s4, n, () => ({ ...T0 }));
    sub4.target.depth = 5;   // the SAME object edited in place (the tank never does this): not a new dive
    const edited = s4(run4.state, { ...T0 }, [0, 0, 0], undefined);
    ok("!! the SAME wandering-target object edited in place is NOT a new dive: the memory carries (the identity is what the tank changes at a retarget, a wall turn and a respawn)", cmpMax(edited, continued) === 0);
    // many retargets: each restarts, in between it carries
    const sub5 = { target: { ...T0 } }, p5 = kind.build(WF, { sub: sub5 }); let s = start(), diffs = [];
    for (let i = 0; i < 90; i++) { if (i % 30 === 0) sub5.target = { ...T0 }; const c = p5(s, { ...T0 }, [0, 0, 0], undefined); if (i % 30 === 0) diffs.push(cmpMax(c, kind.build(WF, { sub: { target: T0 } })(s, { ...T0 }, [0, 0, 0], undefined))); s = S.stepSub(model, s, c, S.DT, [0, 0, 0], 0).state; }
    ok("!! at each of three retargets (ticks 0, 30, 60) the first command is exactly a newborn pilot's, and in between the memory carries", diffs.length === 3 && diffs.every((d) => d === 0));
    const nullT = kind.build(WF, { sub: { target: null } }), nt = drive(nullT, 30, () => T0).cmds;
    ok("!! a sub that has no wandering target yet (`target: null`) is flown without trouble: the policy gets its own target object from the first tick and four finite controls come out", nt.length === 30 && nt.every((c) => KEYS.every((k) => Number.isFinite(c[k]))) && J(nt) === J(drive(kind.build(WF, { sub: { target: T0 } }), 30, () => T0).cmds));
    const loose = kind.build(WF, {}), a = drive(loose, 100, () => T0), b = loose(a.state, T0, [0, 0, 0], undefined), c = loose(a.state, { ...T0 }, [0, 0, 0], undefined), fresh = kind.build(WF, {})(a.state, T0, [0, 0, 0], undefined);
    ok("!! a pilot built with NO sub follows the policy's own rule: it keeps its memory while it is handed the same target object and restarts on another", cmpMax(b, fresh) > 1e-6 && cmpMax(c, fresh) === 0);
}

sec("4. THE COMPASS FLAG AND NO STATE");
{
    const n = 120, sub = { target: T0 }, run = (auxAt) => { const p = kind.build(WF, { sub: { target: T0 } }), pre = drive(p, n, () => T0); return { pre, last: p(pre.state, T0, [0, 0, 0], auxAt) }; };
    const valid = run({ compassValid: 1 }).last, dark = run({ compassValid: 0 }).last, none = run(undefined).last, nul = run(null).last, noFlag = run({ dt: 0.1 }).last;
    ok("!! `aux.compassValid` 0 changes the command (the policy reads it as its 15th feature, and was trained with it); 1, nothing, null and an aux with no flag are all the same command", cmpMax(dark, valid) > 1e-6 && cmpMax(none, valid) === 0 && cmpMax(nul, valid) === 0 && cmpMax(noFlag, valid) === 0, `${cmpMax(dark, valid).toExponential(2)}`);
    const ns = K.flyCxKind(circuit, { persist: false }), a = drive(kind.build(WF, { sub }), 150, () => T0).cmds, b = drive(ns.build(WF, { sub: { target: T0 } }), 150, () => T0).cmds;
    ok("!! NO STATE (the memory wiped every tick) flies a different line from the stateful pilot: over 150 ticks the commands differ by more than 1e-3 somewhere", Math.max(...a.map((c, i) => cmpMax(c, b[i]))) > 1e-3);
    let s = start(), allSame = true; const nsp = ns.build(WF, { sub: { target: T0 } });
    for (let i = 0; i < 25; i++) { const c = nsp(s, T0, [0, 0, 0], undefined), newborn = kind.build(WF, { sub: { target: T0 } })(s, T0, [0, 0, 0], undefined); if (cmpMax(c, newborn) !== 0) allSame = false; s = S.stepSub(model, s, c, S.DT, [0, 0, 0], 0).state; }
    ok("!! and a NO STATE pilot's command at every tick equals a freshly born stateful pilot's command at that state (it is the stateful pilot with nothing to remember)", allSame);
}

sec("5. THE SEPARATION");
{
    const n = 80, subA = { target: T0 }, subB = { target: { depth: 15, heading: -2, speed: 1.6 } };
    const solo = (sub, t) => drive(kind.build(WF, { sub }), n, () => t).cmds, soloA = solo(subA, T0), soloB = solo(subB, subB.target);
    const pa = kind.build(WF, { sub: subA }), pb = kind.build(WF, { sub: subB }); let sa = start(), sb = S.createState({ depth: 25, speed: 1.5, pos: [100, 100, -25], heading: -1, model }), same = true, soloBState = S.createState({ depth: 25, speed: 1.5, pos: [100, 100, -25], heading: -1, model });
    const soloB2 = drive(kind.build(WF, { sub: { target: subB.target } }), n, () => subB.target, () => undefined, soloBState).cmds;
    for (let i = 0; i < n; i++) { const ca = pa(sa, T0, [0, 0, 0], undefined), cb = pb(sb, subB.target, [0, 0, 0], undefined); if (cmpMax(ca, soloA[i]) !== 0 || cmpMax(cb, soloB2[i]) !== 0) same = false; sa = S.stepSub(model, sa, ca, S.DT, [0, 0, 0], 0).state; sb = S.stepSub(model, sb, cb, S.DT, [0, 0, 0], 0).state; }
    ok("!! TWO PILOTS BUILT FROM THE SAME WEIGHTS DO NOT SHARE A MEMORY: called alternately on different boats and targets for 80 ticks, each commands exactly what it commands flown alone", same && J(soloA) !== J(soloB));
    const nan = kind.build(WF, { sub: { target: T0 } })(start(), { depth: NaN, heading: Infinity, speed: undefined }, [0, 0, 0], undefined);
    ok("!! a target with numbers that are not numbers (NaN, Infinity, missing) still gives four finite controls within [-1, 1] (the features read them as 0)", KEYS.every((k) => Number.isFinite(nan[k]) && Math.abs(nan[k]) <= 1));
}

sec("6. THE SOURCE");
{
    const code = fs.readFileSync(new URL("./subAquariumFlyCx.mjs", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/**")).join("\n");
    ok("!! pure: no Math.random, no clock, no DOM, no file or network", !/Math\.random|Date\.now|new Date|performance\.now|document\.|window\.|\bfs\b|node:fs|fetch\(/.test(code));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exitCode = fails ? 1 : 0;
