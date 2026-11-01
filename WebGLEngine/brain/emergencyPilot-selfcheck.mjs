// WebGLEngine/brain/emergencyPilot-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/emergencyPilot-selfcheck.mjs      (~4 s)
//
// THE FLOOD AND THE PILOT THAT GETS OUT OF IT. brain/floodTask.mjs is a breach the ballast tank cannot trim out (4%..8% of the weight taken on, against a tank of 3%); brain/emergencyPilot.mjs wraps any pilot with the emergency
// blow and the one-way drop weight (physics/mechanics/subModel6dof.mjs, v4901). This gate holds the task, the wrapper's stages, and what the wrapper does to a flood and to a boat that is not flooding:
//
//   1  THE TASK     scenarios are frozen and a seed makes the same one, inside the ranges the header gives; the leak is nothing until 5 s, half at 7.5 s, whole from 10 s; the vessel is the EXPLORER and its tank, no other number changed
//   2  THE STAGES   ok / blow / release / gone on hand-made states, at the boundaries (5 m, 10 m, -0.05 m/s); a released weight is silent whatever the depth; the stage reads only the state, so the wrapper is stateless
//   3  THE FLOOD    the autopilot ALONE holds none of the 24 floods and ends nearly all of them on the seabed (it blows the tank to the stop and still sinks); WRAPPED it holds all 24 and ends none; the weight goes for the big leaks and
//                   is kept for some small ones (a rescue that always dumps is a rescue that never learned the stage); the biggest leak is always released
//   4  THE CONTROLS blow alone holds fewer than the wrapper (the tank at 3% cannot cover a 6% leak); release alone holds all 24 -- and is no better than the wrapper on the deepest the boat goes (the blow buys depth, not survival: said plainly)
//   5  NO FLOOD     the wrapped pilot on a boat with no leak sends EXACTLY what the pilot alone sends, tick for tick, for 60 s, and the weight never goes: a healthy dive is the wrapped pilot's dive
//   6  THE FRONT DOOR  the export lists are pinned
//
// SABOTAGE LOG -- SEVENTEEN, each applied in place, the gate run, the file restored; every one red by name (rows red in brackets):
//   brain/emergencyPilot.mjs: E1 blowDepth 8 m 3 | E2 blowDepth 2 m 3 | E3 sinking not required 4 | E4 releaseDepth 15 m 9 | E5 a dropped weight not "gone" 1 | E6 the blow without thrust and nose-up 2 | E7 release sent with every blow 4
//   E8 no release stage 8 | E9 the wrapper never stands down ("ok" still sends) 7 | E10 sink line -0.5 m/s 4
//   brain/floodTask.mjs: F1 the leak starts at 25 s 1 | F2 the leak is not a ramp 1 | F3 the leak range narrowed to 4..6% 0 THE FIRST TIME (the range row held containment only; the SPANS row now holds it: 1) | F4 the seed ignored 2
//   F5 drop weight 2% 4 | F6 held within 100 m 2 | F7 an air bottle of 5 1
"use strict";
import * as F from "./floodTask.mjs";
import * as E from "./emergencyPilot.mjs";
import * as A from "./autopilotSub.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const model = F.floodModel(), base = A.pilot({ model });
const st = (depth, climb, released = false) => { const x = S.createState({ depth, speed: 2, model }); return { ...x, vel: [x.vel[0], x.vel[1], climb], tank: { level: 0, air: 1, released } }; };
const tgt = { depth: 30, heading: 0, speed: 2 };

console.log("emergencyPilot-selfcheck -- a flood, and the pilot that gets out of it\n");

console.log("1. THE TASK");
{
    const a = F.scenario(7), b = F.scenario(7), c = F.scenario(8);
    ok("a seed always makes the same scenario, a different seed a different one, and it is frozen", JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c) && Object.isFrozen(a));
    ok("every scenario of the set is inside the ranges (depth 25..35 m, speed 1.5..2.5 m/s, leak 4%..8%)", F.FLOOD_SET.length === 24 && F.FLOOD_SET.every((s) => s.depth >= 25 && s.depth <= 35 && s.speed >= 1.5 && s.speed <= 2.5 && s.leak >= 0.04 && s.leak <= 0.08));
    const leaks = F.FLOOD_SET.map((x) => x.leak);
    ok("!! and the set SPANS them: a leak under 5% and one over 7% are both in it (a range cannot be narrowed unseen)", Math.min(...leaks) < 0.05 && Math.max(...leaks) > 0.07, `${Math.min(...leaks).toFixed(4)}..${Math.max(...leaks).toFixed(4)}`);
    const sc = { leak: 0.06 };
    ok("the leak is nothing until 5 s, half of it at 7.5 s, all of it from 10 s", F.leakAt(sc, 0) === 0 && F.leakAt(sc, 5) === 0 && Math.abs(F.leakAt(sc, 7.5) - 0.03) < 1e-12 && F.leakAt(sc, 10) === 0.06 && F.leakAt(sc, 100) === 0.06);
    const keys = Object.keys(F.FLOOD_SPEC).filter((k) => JSON.stringify(F.FLOOD_SPEC[k]) !== JSON.stringify(S.EXPLORER[k])).sort().join(",");
    ok("the flood vessel is the EXPLORER and its tank: only name, tankRate, airMax, emergencyRate, emergencyAirCost and dropMass differ", keys === "airMax,dropMass,emergencyAirCost,emergencyRate,name,tankRate", keys);
    ok("it has a tank with dynamics and a drop weight larger than the biggest leak less the tank's range", S.hasTank(model) && S.dynamicTank(model) && model.spec.dropMass > 0.08 - model.spec.ballastRange);
}

console.log("\n2. THE STAGES");
{
    ok("on target, and sinking: ok", E.stage(st(30, -1), tgt) === "ok");
    ok("!! 5 m deeper is not yet trouble; 5.1 m deeper and sinking is the blow", E.stage(st(35, -1), tgt) === "ok" && E.stage(st(35.1, -1), tgt) === "blow");
    ok("!! deep but RISING (an overshoot coming back) is not trouble: climb -0.05 is the line", E.stage(st(40, 0.5), tgt) === "ok" && E.stage(st(40, -0.05), tgt) === "ok" && E.stage(st(40, -0.06), tgt) === "blow");
    ok("!! 10 m deeper and sinking: the release; 9.9 m is still the blow", E.stage(st(39.9, -1), tgt) === "blow" && E.stage(st(40.1, -1), tgt) === "release");
    ok("!! a released weight is silent at any depth", E.stage(st(45, -2, true), tgt) === "gone" && E.stage(st(30, 0, true), tgt) === "gone");
    ok("a vessel with no tank state reads like one with an unreleased tank (the stage reads the state, nothing else)", E.stage({ ...st(41, -1), tank: undefined }, tgt) === "release");
    const w = E.wrap(base);
    const blow = w(st(36, -1), tgt), rel = w(st(41, -1), tgt), calm = w(st(30, 0), tgt);
    ok("!! the blow sends blow, full thrust and full nose-up and NO release; the release sends all four", blow.blow === 1 && blow.thrust === 1 && blow.pitch === 1 && !blow.release && rel.blow === 1 && rel.release === 1 && rel.thrust === 1);
    ok("in calm water the wrapper sends the pilot's four numbers and nothing else", JSON.stringify(calm) === JSON.stringify(base(st(30, 0), tgt, [0, 0, 0])) && Object.keys(calm).length === 4);
}

console.log("\n3. THE FLOOD");
const alone = F.evaluate(base), wrapped = F.evaluate(E.wrap(base));
{
    ok("!! the autopilot ALONE holds none of the 24 floods and ends at least 20 of them", alone.held === 0 && alone.ended >= 20, `held ${alone.held}, ended ${alone.ended}; the first: ${alone.runs[0].status} at ${alone.runs[0].maxDepth.toFixed(1)} m`);
    ok("!! WRAPPED it holds all 24 and ends none", wrapped.held === 24 && wrapped.ended === 0, `held ${wrapped.held}, ended ${wrapped.ended}, deepest ${Math.max(...wrapped.runs.map((r) => r.maxDepth)).toFixed(1)} m of a 50 m seabed`);
    const rel = wrapped.runs.filter((r) => r.released).length, big = F.FLOOD_SET.reduce((m, s, i) => (s.leak > F.FLOOD_SET[m].leak ? i : m), 0);
    ok("!! the weight is dropped in most floods and kept in some (neither none nor all), and the biggest leak always drops it", rel > 0 && rel < 24 && wrapped.runs[big].released, `released in ${rel} of 24; biggest leak ${(F.FLOOD_SET[big].leak * 100).toFixed(2)}%`);
    ok("the air is spent where the blow was used (every wrapped dive that blew has none left of the 1.5)", wrapped.runs.every((r) => r.air < 1.5));
}

console.log("\n4. THE CONTROLS");
{
    const blowOnly = F.evaluate(E.wrap(base, { releaseDepth: 1e9 }));
    const relOnly = F.evaluate((s, t, c) => { const x = base(s, t, c); return E.stage(s, t) === "release" ? S.sanitize({ ...x, release: 1 }) : x; });
    const deep = (r) => r.runs.reduce((a, x) => a + x.maxDepth, 0) / r.n;
    ok("!! blow alone holds fewer than the wrapper (the tank's 3% does not cover a 6% leak) and never drops the weight", blowOnly.held < wrapped.held && blowOnly.runs.every((r) => !r.released), `blow alone held ${blowOnly.held} of 24`);
    ok("!! release alone holds all 24 -- the drop weight is what saves the boat", relOnly.held === 24 && relOnly.ended === 0);
    ok("...and the blow buys depth, not survival: the wrapper's mean deepest point is within 2 m of release alone", Math.abs(deep(wrapped) - deep(relOnly)) < 2, `${deep(wrapped).toFixed(1)} m wrapped, ${deep(relOnly).toFixed(1)} m release alone, ${deep(blowOnly).toFixed(1)} m blow alone`);
}

console.log("\n5. NO FLOOD");
{
    const sc = { ...F.scenario(3), leak: 0 }, w = E.wrap(base), target = { depth: sc.depth, heading: 0, speed: sc.speed };
    let a = S.createState({ depth: sc.depth, speed: sc.speed, model }), b = a, same = true, sent = 0;
    for (let i = 0; i < 1800; i++) {
        const c1 = base(a, target, [0, 0, 0]), c2 = w(b, target, [0, 0, 0]);
        if (JSON.stringify(c1) !== JSON.stringify(c2)) same = false;
        if (c2.blow || c2.release) sent++;
        a = S.stepSub(model, a, c1).state; b = S.stepSub(model, b, c2).state;
    }
    ok("!! 60 s with no leak: the wrapper sends exactly what the pilot sends, tick for tick, and never blows or releases; the weight is still on", same && sent === 0 && !b.tank.released && b.tank.air === 1.5, `blow/release sent ${sent} times; air ${b.tank.air}`);
    const r = F.fly(w, { ...sc, leak: 0 });
    ok("and flown as a whole dive it holds", r.held && !r.released, `final ${r.finalDepth.toFixed(1)} m against ${sc.depth.toFixed(1)} m`);
}

console.log("\n6. THE FRONT DOOR");
{
    ok("floodTask's exports are pinned", Object.keys(F).sort().join(",") === "FLOOD_SET,FLOOD_SPEC,LEAK_AT,LEAK_BUILD,SECONDS,evaluate,floodModel,fly,leakAt,scenario", Object.keys(F).sort().join(","));
    ok("emergencyPilot's exports are pinned", Object.keys(E).sort().join(",") === "EMERGENCY,stage,wrap", Object.keys(E).sort().join(","));
    ok("EMERGENCY is frozen and says 5 m, 10 m, -0.05 m/s", Object.isFrozen(E.EMERGENCY) && E.EMERGENCY.blowDepth === 5 && E.EMERGENCY.releaseDepth === 10 && E.EMERGENCY.sinkRate === -0.05);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
