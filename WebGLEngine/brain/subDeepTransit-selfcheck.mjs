// WebGLEngine/brain/subDeepTransit-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subDeepTransit-selfcheck.mjs      (about 10 s: two flights for the copy, a few smoke flights)
//
// THE GATE OF brain/subDeepTransit.mjs AND tools/ship/subDeepTransitStudy.mjs (FOLLOW-UP 9 of brain/SUB_FIELD_NAV_WIP.md, registered before either):
//   1 THE CONSTANTS  ASCEND_M 140 m, HELD82 7881-7940 (no seed spent before), the two arms, the reference and the designated arm.
//   2 THE TRANSIT    transitDepth is the deepest PASSABLE keel + VMARGIN + DIVE_PAD (a keel too deep is left out; none passable: null); deepTarget sets ONLY the depth, ONLY deeper,
//                    ONLY beyond ASCEND_M of the goal on the plane (exactly 140 m: the goal's depth).
//   3 THE FLIGHT     the reference is FOLLOW-UP 8's sweep+dive exactly (record for record); +deep holds the transit depth on a flight and reaches; an unknown arm throws.
//   4 THE VERDICT    FOLLOW-UP 8's rule: SUPPORTED, PARTLY (exactly one bar, no exit), NOT; an exit is NOT SUPPORTED.
//   5 THE CHECKS     each fails on its own break; NOT WEIGHED on a failure; check 1 flown against FOLLOW-UP 8's stored flights, one off by a tick caught.
//   6 THE COMMAND    --write only with held82; held82 writes every flight.
//   7 THE SOURCE     no clock, no Math.random.
// SABOTAGE LOG (2026-11-17; 14 mutants of the module and the study, each alone, restored byte-identical; every one red on its first run): P1 a keel at exactly DIVE_MAX left out (1),
//   P2 the shallowest keel (1), P3 bergs counted as ships (1), P4 the transit allowed shallower (1), P5 exactly 140 m kept deep (1), P6 no climb back (2), P7 the speed changed too (2),
//   P8 the reference given a transit (1), P9 the dive and sweep bypassed (3), P10 the dive off (2), P11 the ship bar "no more" (2), P12 the copy against every arm (1),
//   P13 --write allowed on DEV (1), P14 NO CRUSH always true (1).
// FOLLOW-UP 10 SABOTAGE LOG (each broken in brain/subDeepTransit.mjs or brain/subTrafficDive.mjs, run, restored; red = FAIL rows of a gate that loaded):
//   F1 UNDER_MAX 65 1 | F2 +under ignored (the limit stays 60) 1 | F3 +beneath hides ships at keel <= depth, not keel + VMARGIN 1 | F4 the dive left at 60 under +under 1 | F5 +beneath ignored 1
//   F6 the measurement always on (FOLLOW-UP 9's record changed) 2 | F7 diveDepth ignores its limit option 2
"use strict";
import fs from "node:fs";
import * as P from "./subDeepTransit.mjs";
import * as D from "./subTrafficDive.mjs";
import * as H from "./subHardNav.mjs";
import * as NP from "./subNavPlus.mjs";
import * as SN from "./subSensedNav.mjs";
import * as G from "./subGiveWay.mjs";
import * as W from "./subTurnSweep.mjs";
import * as T from "../tools/ship/subDeepTransitStudy.mjs";
import * as NS from "../tools/ship/navEnergyStudy.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
console.log("subDeepTransit-selfcheck -- a deep transit beneath the traffic\n");

sec("1. THE CONSTANTS");
{
    const spent = new Set([...Object.values(H.HARD_SETS).flat(), ...H.HELD5, ...Object.values(SN.SENSE_SETS).flat(), ...Object.values(NP.PLUS_SETS).flat(), ...G.HELD78, ...W.HELD79, ...NS.SETS.held80, ...D.HELD81]);
    for (let s = 9001; s <= 9040; s++) spent.add(s);
    ok("!! ASCEND_M 140 m; HELD82 is 7881-7940 and no seed of it was spent before (through HELD81); the arms sweep+dive (reference) and sweep+dive+deep (designated)",
        P.ASCEND_M === 140 && P.HELD82.length === 60 && P.HELD82[0] === 7881 && P.HELD82[59] === 7940 && P.HELD82.every((s) => !spent.has(s)) && P.REFERENCE === "sweep+dive" && P.DESIGNATED === "sweep+dive+deep" && J(P.ARMS) === J({ "sweep+dive": { deep: false }, "sweep+dive+deep": { deep: true } }));
}

const ship = (keel) => ({ type: "ship", x: 0, y: 0, r: 10, keel, vx: 0, vy: 0 });
sec("2. THE TRANSIT");
{
    ok("!! the transit depth is the deepest PASSABLE keel + 5 + 2: keels 20 and 40 -> 47; a 54 m keel (61 > 60) is left out -> 47; 53 m is passable (60) -> 60; none passable -> null; bergs do not count",
        P.transitDepth({ obstacles: [ship(20), ship(40)] }) === 47 && P.transitDepth({ obstacles: [ship(20), ship(40), ship(54)] }) === 47 && P.transitDepth({ obstacles: [ship(53)] }) === 60 && P.transitDepth({ obstacles: [ship(70)] }) === null && P.transitDepth({ obstacles: [{ ...ship(30), type: "berg" }] }) === null);
    const st = (x, y) => ({ pos: [x, y, -20] }), goal = { x: 300, y: 0, depth: 25 }, tgt = { heading: 1, depth: 25, speed: 3 };
    ok("!! deepTarget sets ONLY the depth to the transit beyond 140 m of the goal on the plane (depth ignored), and nothing else", J(P.deepTarget(st(0, 0), tgt, goal, 47)) === J({ ...tgt, depth: 47 }));
    ok("!! within ASCEND_M (exactly 140 m, and 100 m) the target is the goal's: the climb back", P.deepTarget(st(160, 0), tgt, goal, 47) === tgt && P.deepTarget(st(200, 0), tgt, goal, 47) === tgt && P.deepTarget(st(159, 0), tgt, goal, 47).depth === 47);
    ok("!! only deeper: a transit not deeper than the target, or none, changes nothing", P.deepTarget(st(0, 0), tgt, goal, 25) === tgt && P.deepTarget(st(0, 0), tgt, goal, 20) === tgt && P.deepTarget(st(0, 0), tgt, goal, null) === tgt);
}

sec("3. THE FLIGHT");
{
    const sc = P.scenarioOf(2), a = P.flyDeep(sc, "sweep+dive"), b = D.flyTraffic(sc, "sweep+dive"), strip = (r) => J({ ...r, arm: undefined, deepTicks: undefined, transit: undefined, leastbadTicks: undefined });
    ok("!! the reference IS FOLLOW-UP 8's sweep+dive, record for record (DEV seed 2), with no transit", strip(a) === strip(b) && a.deepTicks === 0 && a.transit === null);
    const d = P.flyDeep(sc, "sweep+dive+deep");
    ok("!! +deep on DEV seed 2: the transit is the scenario's, it acts, the vessel goes to within 3 m of it, and it still arrives (climbing back)", d.transit === P.transitDepth(sc) && d.deepTicks > 0 && d.deepest >= d.transit - 3 && d.status === "reached", `transit ${d.transit.toFixed(1)}, deepest ${d.deepest.toFixed(1)}, ${d.status}`);
    let thrown = ""; try { P.flyDeep(sc, "sweep+nope"); } catch (e) { thrown = e.message; }
    ok("!! an unknown arm throws by name", /unknown arm "sweep\+nope"/.test(thrown), thrown);
}

const rec = (arm, seed, status) => ({ arm, seed, kind: P.KIND, status, reached: status === "reached", hit: status === "collided" ? "ship" : null, ticks: 100, path: 1, deepTicks: 0, diveTicks: 0, deepest: 20, transit: null });
const ref = (s) => (s <= 10 ? "reached" : s <= 14 ? "collided" : "timeout");
const resOf = (fn, n = 20) => Object.fromEntries(P.ARM_NAMES.map((a) => [a, Array.from({ length: n }, (_, i) => rec(a, i + 1, a === P.DESIGNATED ? fn(i + 1) : ref(i + 1)))]));
sec("4. THE VERDICT");
{
    const v = (fn) => T.verdictOf(resOf(fn));
    ok("!! SUPPORTED: net 6 (p 0.0312), ship collisions 2 against 4, no exit", v((s) => (s <= 16 ? "reached" : s <= 18 ? "collided" : "timeout")).verdict === "SUPPORTED");
    ok("!! PARTLY: the gain without halving (4 against 4), or halving without the gain", v((s) => (s <= 16 ? "reached" : "collided")).verdict === "PARTLY SUPPORTED" && v((s) => (s <= 12 ? "reached" : s <= 14 ? "collided" : "timeout")).verdict === "PARTLY SUPPORTED");
    ok("!! one exit: NOT SUPPORTED; neither bar: NOT SUPPORTED", v((s) => (s <= 16 ? "reached" : s === 17 ? "left" : "timeout")).verdict === "NOT SUPPORTED" && v(ref).verdict === "NOT SUPPORTED");
}

sec("5. THE CHECKS");
{
    const res = resOf((s) => (s === 3 ? "collided" : ref(s))), bad = (o, r = res) => T.checksOf(r, { copy: true, n: 20, ...o }).filter((c) => !c.ok).map((c) => c.name);
    const shifted = { ...res, [P.DESIGNATED]: res[P.DESIGNATED].map((r) => ({ ...r, seed: r.seed + 1 })) }, idle = { ...res, [P.DESIGNATED]: res[P.REFERENCE].map((r) => ({ ...r, arm: P.DESIGNATED })) }, crushed = { ...res, [P.DESIGNATED]: res[P.DESIGNATED].map((r, i) => (i === 5 ? { ...r, status: "crushed" } : r)) };
    ok("!! each check fails on its own break: THE COPY, SAME SCENARIOS, DEEP BITES, NO CRUSH; all pass otherwise; a failure prints NOT WEIGHED",
        bad({}).length === 0 && J(bad({ copy: false })) === J(["THE COPY"]) && J(bad({}, shifted)) === J(["SAME SCENARIOS"]) && J(bad({}, idle)) === J(["DEEP BITES"]) && J(bad({}, crushed)) === J(["NO CRUSH"]) && /VERDICT: NOT WEIGHED/.test(T.report(res, { copy: false, n: 20, set: "held82" }).join("\n")));
    const stored = fs.readFileSync(new URL("./subTrafficDiveHeld81.jsonl", import.meta.url), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const real = T.copySame(stored), off = T.copySame(stored.map((r) => (r.arm === "sweep+dive" && r.seed === 7822 ? { ...r, ticks: r.ticks + 1 } : r))), other = T.copySame(stored.filter((r) => r.arm !== "sweep+dive"));
    ok("!! FLOWN: the reference reproduces FOLLOW-UP 8's stored sweep+dive flights on HELD81's first 5 seeds; one off by a tick, or none of that arm, fail it", real === true && off === false && other === false, J([real, off, other]));
}

sec("6. THE COMMAND");
{
    const run = (argv) => { const out = [], errs = [], files = [], sets = []; const code = T.command(argv, { out: (m) => out.push(m), err: (m) => errs.push(m), writeFile: (f, t) => files.push([f, t]), flySet: (seeds) => { sets.push(seeds.length + ":" + seeds[0]); return resOf((s) => (s === 3 ? "collided" : ref(s)), seeds.length); }, copySame: () => true }); return { code, out: out.join("\n"), errs, files, sets }; };
    const d = run(["--set", "dev", "--write"]), h = run(["--set", "held82", "--write"]), dv = run(["--set", "dev"]);
    ok("!! --write with DEV is refused (exit 2, nothing flown); DEV flies 1-30 and says it is not a result", d.code === 2 && d.sets.length === 0 && dv.code === 0 && dv.sets[0] === "30:1" && /not a result/.test(dv.out) && dv.files.length === 0);
    ok("!! held82 flies 7881-7940 once and writes brain/subDeepTransitHeld82.jsonl with all 120 flights, each carrying set held82", h.code === 0 && J(h.sets) === J(["60:7881"]) && h.files[0][0].endsWith("brain/subDeepTransitHeld82.jsonl") && h.files[0][1].trim().split("\n").length === 120 && JSON.parse(h.files[0][1].split("\n")[0]).set === "held82");
}

sec("7. THE SOURCE");
{
    const code = [new URL("./subDeepTransit.mjs", import.meta.url), new URL("../tools/ship/subDeepTransitStudy.mjs", import.meta.url)].map((u) => fs.readFileSync(u, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")).join("\n");
    ok("!! no clock and no Math.random in either file; the study's registered numbers", !/Math\.random|Date\.now|new Date|performance\.now/.test(code) && T.GAIN === 5 && T.P_LEVEL === 0.10 && T.COPY_SEEDS === 5 && T.OUT_FILE === "brain/subDeepTransitHeld82.jsonl" && S.EXPLORER.crushDepth === 100);
}

sec("FOLLOW-UP 10: UNDER EVERY KEEL");
{
    const P10 = await import("./subDeepTransit.mjs"), D10 = await import("./subTrafficDive.mjs"), H10 = await import("./subHardNav.mjs");
    const sc = P10.scenarioOf(7883), keels = sc.obstacles.filter((o) => o.type === "ship").map((o) => o.keel);
    ok("!! +under: the limit is 70; the transit at 70 is the deepest keel of ALL the ships + VMARGIN + DIVE_PAD (here " + (Math.max(...keels) + 7).toFixed(2) + " m), where at 60 it leaves out keels over 53 m", P10.UNDER_MAX === 70 && Math.abs(P10.transitDepth(sc, 70) - (Math.max(...keels) + 7)) < 1e-12 && P10.transitDepth(sc) < P10.transitDepth(sc, 70) && P10.transitDepth(sc) === P10.transitDepth(sc, 60));
    ok("!! the dive's limit is an option: a keel of 60 dives to 67 at 70 and is refused at the registered 60 (the default)", D10.diveDepth([{ keel: 60 }], 70) === 67 && D10.diveDepth([{ keel: 60 }]) === null && D10.diveDepth([{ keel: 53 }]) === 60);
    ok("!! a ship +beneath leaves out cannot be hit: at a depth of keel + VMARGIN or more, gapTo is Infinity whatever the horizontal gap", [20, 37.5, 55].every((k) => H10.gapTo({ keel: k, x: 0, y: 0, vx: 0, vy: 0, r: 20 }, 0, 0, k + H10.VMARGIN, 0) === Infinity));
    ok("!! the three arms are the prototype's (pinned on spent HELD82 seeds; all 270 HELD82 and DEV flights matched the prototype when built): 7883 R collided at 2722 ticks, U and L reach (5058, 7513); 7920 R leaves (3461), U reaches (4184), L leaves (3467)", (() => { const f = (s, a) => { const r = P10.flyDeep(P10.scenarioOf(s), a); return `${r.status}:${r.ticks}`; }; return f(7883, P10.REFERENCE10) === "collided:2722" && f(7883, P10.DESIGNATED10) === "reached:5058" && f(7883, P10.ATTRIBUTION10) === "reached:7513" && f(7920, P10.REFERENCE10) === "left:3461" && f(7920, P10.DESIGNATED10) === "reached:4184" && f(7920, P10.ATTRIBUTION10) === "left:3467"; })());
    const plain = P10.flyDeep(P10.scenarioOf(2), "sweep+dive+deep"), meas = P10.flyDeep(P10.scenarioOf(2), "sweep+dive+deep", { measure: true });
    ok("!! measure off is FOLLOW-UP 9's record field for field; measure on only adds minShipClear and hiddenShipTicks (the flight unchanged)", !("minShipClear" in plain) && J(Object.keys(meas).filter((k) => !(k in plain))) === J(["minShipClear", "hiddenShipTicks"]) && meas.ticks === plain.ticks && meas.path === plain.path);
    const hit = P10.flyDeep(P10.scenarioOf(7883), P10.REFERENCE10, { measure: true }), u = P10.flyDeep(P10.scenarioOf(7883), P10.DESIGNATED10, { measure: true });
    ok("  the clearance is near 0 on a ship collision; +beneath counts the ticks it hid a ship; the reference hides none", hit.status === "collided" && hit.minShipClear < 0.5 && u.hiddenShipTicks > 0 && hit.hiddenShipTicks === 0, `${hit.minShipClear.toFixed(3)}, ${u.hiddenShipTicks}`);
    ok("  an unknown arm is still refused by name; HELD88 is 10201 to 10400", /unknown arm "deep70"/.test((() => { try { P10.flyDeep(sc, "deep70"); return ""; } catch (e) { return e.message; } })()) && P10.HELD88[0] === 10201 && P10.HELD88.length === 200);
}

sec("8. THE NAMED CONSTANTS");
{
    ok("  ARMS10 is FOLLOW-UP 10's three arms: deep (the reference), deep+under+beneath (designated), deep+under (attribution); frozen", J(P.ARMS10) === J({ "sweep+dive+deep": { deep: true }, "sweep+dive+deep+under+beneath": { deep: true, under: true, beneath: true }, "sweep+dive+deep+under": { deep: true, under: true } }) && Object.isFrozen(P.ARMS10) && Object.isFrozen(P.ARMS10["sweep+dive+deep+under"]));
    ok("  ARM10_NAMES is ARMS10's keys in order, frozen, and is exactly REFERENCE10, DESIGNATED10, ATTRIBUTION10", J(P.ARM10_NAMES) === J(Object.keys(P.ARMS10)) && J(P.ARM10_NAMES) === J([P.REFERENCE10, P.DESIGNATED10, P.ATTRIBUTION10]) && Object.isFrozen(P.ARM10_NAMES));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exitCode = fails ? 1 : 0;
