// WebGLEngine/tools/ship/takeSpaceEvadeSeat-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeSpaceEvadeSeat-selfcheck.mjs      (seconds; nothing is flown)
//
// THE EVADE SEAT'S STUDY, HELD BEFORE ANY PAIR. tools/ship/takeSpaceEvadeSeat.mjs:
//
//   1  THE SEEDS      300 pairs a fight, 75 of each kind; the four ranges disjoint from each other and from EVERY other study's in tools/ship (read off their files) -- the
//                     draft's stage-2 seeds were not (tools/ship/takeFleetHandSizes.mjs had flown them), which this check exists to catch
//   2  THE SIDES      side X today's best ship (the shipped helm and the fly-wired gunner for the fight) with exactly the arm's reflex; `none` with none; side Y plain; the
//                     ships a side; stage 2 the stage-1 action with the arm's wiring; stage 3 on stage 2's seeds
//   3  THE RULES      stage 1: an action is chosen if it leads no reflex somewhere and trails it nowhere, the larger mean of several, TURN if none; stage 2: the same for the
//                     circuits, the dark-looming cells' best against the Giant Fiber inputs' best, told from the sine; stage 3: places and wiring credited the same way
//   4  THE ORDER      a stage read once; stage 2 refused before stage 1's reading and taking its action; stage 3 refused before stage 2's, flying nothing if nothing shipped
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "./takeSpaceEvadeSeat.mjs";
import { brainsOf } from "./takeLc11Gunner.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const HERE = path.dirname(fileURLToPath(import.meta.url));

console.log("takeSpaceEvadeSeat-selfcheck -- the evade seat's study, before any pair\n");

console.log("1. THE SEEDS");
section(() => {
    const sets = [S.SETS[1].one, S.SETS[1].fleet3, S.SETS[2].one, S.SETS[2].fleet3], firsts = sets.map((l) => l[0].seed);
    ok("300 pairs a fight, 75 of each of the four kinds", sets.every((l) => l.length === 300 && ["head-on", "broadside", "crossing", "chase"].every((k) => l.filter((p) => p.kind === k).length === 75)));
    const mine = new Set(sets.flatMap((l) => l.map((p) => p.seed)));
    ok("the four ranges are disjoint from each other", mine.size === 4 * 75);
    const others = []; for (const f of fs.readdirSync(HERE).filter((f) => f.endsWith(".mjs") && !f.startsWith("takeSpaceEvadeSeat") && f !== "takeEvadeSeat.mjs" && f !== "takeEvadeSeatCmd.mjs")) for (const m of fs.readFileSync(path.join(HERE, f), "utf8").matchAll(/pairs\((\d{6,})\s*,\s*(\d+)\)/g)) others.push([f, Number(m[1]), Number(m[2])]);
    const clash = others.filter(([, a, n]) => [...mine].some((s) => s >= a && s < a + n));
    ok("!! AND FROM EVERY OTHER STUDY'S SEEDS IN tools/ship (read off their pairs(first, n) -- the draft's stage-2 seeds were tools/ship/takeFleetHandSizes.mjs's, caught here)", others.length > 20 && clash.length === 0, clash.map(([f, a]) => `${f} ${a}`).join(", ") || `${others.length} other ranges; ours begin ${firsts.join(", ")}`);
});

console.log("2. THE SIDES");
section(() => {
    const b = brainsOf(), j1 = S.jobsOf(1, "one", "jink", b), j0 = S.jobsOf(1, "fleet3", "none", b), j2 = S.jobsOf(2, "fleet3", "lplc2:lateral", b, "burst"), j3 = S.jobsOf(3, "one", "lc6:flat", b, "turn");
    ok("!! STAGE 1: side X today's best ship -- the shipped helm, the fly-wired gunner for the fight (no hand window one ship a side), the cannon -- with exactly the arm's reflex (the jink, on the sine); side Y plain; one ship a side", j1.length === 300 && j1[0].x.helmNet === b.helm && j1[0].x.network.weights.join() === b.gunOne.weights.join() && j1[0].x.network.policy === b.gunOne.policy && j1[0].x.cannon && JSON.stringify(j1[0].x.evade) === '{"action":"jink","wiring":"sine"}' && j1[0].y.id === "plain" && !j1[0].y.evade && j1[0].opts.ships === 1 && j1[0].seed === 1681001);
    ok("!! `none` flies no reflex at all; fleets of three use the 45-degree gunner and three ships", !("evade" in j0[0].x) && j0[0].x.network.weights.join() === b.gun.weights.join() && j0[0].opts.ships === 3 && j0[0].seed === 1691001);
    ok("!! STAGE 2: the stage-1 action with the arm's wiring, on stage 2's seeds; STAGE 3 on stage 2's seeds too", JSON.stringify(j2[0].x.evade) === '{"action":"burst","wiring":"lplc2:lateral"}' && j2[0].seed === 1711001 && j3[0].seed === 1701001 && JSON.stringify(j3[0].x.evade) === '{"action":"turn","wiring":"lc6:flat"}');
    let threw = 0; for (const f of [() => S.evadeOf(1, "lc6:medial"), () => S.evadeOf(2, "lc6:medial", null), () => S.evadeOf(2, "lc9:medial", "turn")]) { try { f(); } catch { threw++; } }
    ok("a stage-1 arm must be an action, a stage-2 arm needs stage 1's action and a real wiring", threw === 3);
});

console.log("3. THE RULES");
section(() => {
    const st = (mean, z) => ({ mean, z, n: 300, se: z ? mean / z : 0 }), R = (o) => Object.fromEntries(Object.entries(o).map(([k, [m, z]]) => [`${k} less none`, st(m, z)]));
    const a1 = S.decideAction({ one: R({ turn: [0.1, 2.5], burst: [0.2, 3], climb: [0.05, 0.5], jink: [0.3, 2.2] }), fleet3: R({ turn: [0, 0.1], burst: [0, 0.4], climb: [0, 1], jink: [-0.2, -2.1] }) });
    ok("!! STAGE 1: an action LEADS somewhere and TRAILS nowhere (the jink trails in fleets: out); of the two left, the larger mean (burst)", a1.action === "burst" && a1.beats.join() === "turn,burst" && a1.chosen);
    const a2 = S.decideAction({ one: R({ turn: [0, 1], burst: [0, 1.9], climb: [0, -3], jink: [0, 0] }), fleet3: R({ turn: [0, 1], burst: [0, 1], climb: [0, 1], jink: [0, 1] }) });
    ok("!! ...and if no action beats no reflex, stage 2 flies TURN, and says so", a2.action === "turn" && !a2.chosen && /TURN, as registered/.test(a2.reasons[0]));
    const arms = (bias) => Object.fromEntries(S.STAGE2_ARMS.map((a, k) => [a, Array.from({ length: 300 }, (_, i) => Math.sin(i * 7 + k) * 0.3 + (bias[a] || 0))]));
    const mk = (biasOne, biasFleet) => { const out = {}; for (const [f, bias] of [["one", biasOne], ["fleet3", biasFleet]]) { const a = arms(bias); out[f] = { arms: a, reading: S.fightReadings(a) }; } return out; };
    const c1 = S.decideCircuits(mk({ "lc16:lateral": 0.2, "lc4:medial": 0.25, "lc6:medial": 0.1 }, { "lc4:medial": -0.3 }));
    ok("!! STAGE 2: a circuit that leads no reflex in one fight but TRAILS it in the other (LC4, the larger lead one ship a side) does not ship; LC16 lateral does; the dark cells' best is LC16, the Giant Fiber inputs' best by mean is not LC4 (it trails in fleets)", c1.ships && c1.winner === "lc16:lateral" && c1.dark === "lc16:lateral" && c1.giant !== "lc4:medial" && typeof c1.darkLessGiant.one.z === "number", JSON.stringify({ w: c1.winner, d: c1.dark, g: c1.giant }));
    const c2 = S.decideCircuits(mk({}, {}));
    ok("!! ...and with nothing leading, nothing ships and the best is judged against the sine", !c2.ships && c2.winner === null && S.CIRCUITS.includes(c2.judged) && /NOTHING SHIPS/.test(c2.reasons[0]));
    const ctl = (bias) => { const out = {}; for (const f of S.FIGHTS) { const a = { "lc16:lateral": Array.from({ length: 300 }, (_, i) => Math.sin(i * 3) * 0.3 + 0.2), "lc16:flat": Array.from({ length: 300 }, (_, i) => Math.sin(i * 3 + 1) * 0.3 + (bias.flat || 0)), "lc16:shuffled:4242": Array.from({ length: 300 }, (_, i) => Math.sin(i * 3 + 2) * 0.3 + (bias.shuf || 0)) }; out[f] = { arms: a }; } return out; };
    const k1 = S.decideControls(ctl({ flat: 0, shuf: 0.2 }), "lc16:lateral");
    ok("!! STAGE 3: places credited when the circuit leads its flat control and trails it nowhere; wiring not, when it cannot be told from the shuffle", k1.places && !k1.wiring && S.controlsOf("lc16:lateral").join() === "lc16:flat,lc16:shuffled:4242");
});

console.log("4. THE ORDER");
section(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evadeseat-")), refuse = (st) => { try { S.planOf(st, dir); return null; } catch (e) { return e.message; } };
    const r2 = refuse(2), r3 = refuse(3), p1 = S.planOf(1, dir);
    fs.writeFileSync(S.readingFile(1, dir), JSON.stringify({ verdict: { action: "climb" } }));
    const again1 = refuse(1), p2 = S.planOf(2, dir);
    fs.writeFileSync(S.readingFile(2, dir), JSON.stringify({ verdict: { ships: false, winner: null } })); const p3none = S.planOf(3, dir);
    fs.writeFileSync(S.readingFile(2, dir), JSON.stringify({ verdict: { ships: true, winner: "lplc2:medial" } })); const p3 = S.planOf(3, dir);
    fs.rmSync(dir, { recursive: true, force: true });
    ok("!! stage 2 and stage 3 are refused before the stage they wait for; stage 1 flies the five arms", /waits for stage 1/.test(r2 || "") && /waits for stage 2/.test(r3 || "") && p1.arms.join() === "none,turn,burst,climb,jink");
    ok("!! A STAGE IS READ ONCE (stage 1 refused once its reading exists); stage 2 takes stage 1's action and flies the ten arms", /HAS BEEN READ ONCE/.test(again1 || "") && p2.action === "climb" && p2.arms.length === 10 && p2.arms.slice(0, 2).join() === "none,sine");
    ok("!! stage 3 flies nothing if nothing shipped; otherwise the shipped circuit and its two controls", p3none.arms.length === 0 && p3.arms.join() === "lplc2:medial,lplc2:flat,lplc2:shuffled:4242" && p3.circuit === "lplc2:medial");
});

// v4933 -- THE EXPORT LIST, named here so tools/ship/definitionGates-selfcheck.mjs sees each export of takeSpaceEvadeSeat.mjs held by its gate (it found these 6 unnamed at the ship):
{
    const EXPORTS = await import("./takeSpaceEvadeSeat.mjs");
    const NAMED = ["DARK", "GIANT", "GUN_OF", "KEPT_DIR", "READING_DIR", "STAGE1_ARMS"];
    ok(`the export list: ${NAMED.join(", ")} -- each exported and defined`, NAMED.every((n) => n in EXPORTS && EXPORTS[n] !== undefined), NAMED.filter((n) => !(n in EXPORTS) || EXPORTS[n] === undefined).join(", ") || "");
}
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 9 mutants of tools/ship/takeSpaceEvadeSeat.mjs, each in a hard-linked copy of the tree: ALL 9 RED -- stage 1's rule ignoring a trailing fight, no default action,
// the first of several actions instead of the larger mean, a second read allowed, stage 2 not waiting for stage 1, the reflex given to the plain side too, stage 2 on stage 1's
// seeds, the draft's flown stage-2 seeds back, the gunner from the wrong fight.
