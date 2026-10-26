// WebGLEngine/render/subAquariumEvents-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subAquariumEvents-selfcheck.mjs      (~8 s)
//
// A SUB IN THE TANK CAN BE FLOODED OR TOLD TO SURFACE. render/subAquariumSim.mjs gained setEvent(id, "flood" | "sink" | "surface" | null) in v4901; this gate holds it:
//   1  OFF BY DEFAULT   a tank where setEvent was never called, and one where it was called and undone before the first tick, swim to the bit; no event means `event` and `tank` are null in the snapshot
//   2  THE CALL         it answers the event now running; an unknown name throws and changes nothing; an unknown id returns null; null, undefined and "" end an event; the names are pinned
//   3  FLOOD            a 6% leak from 40 s in: the boat blows, drops its weight, and HOLDS its depth for two minutes (never lost, within 8 m of where it was) -- in each of three tanks with different ids
//   4  SINK             the same leak with no rescue: the boat grounds, is counted lost, and comes back with the event cleared
//   5  SURFACE          from wherever it was, the boat comes up and rides: depth under 1 m, speed under 0.5 m/s, tank blown to the stop with air left, never lost
//   6  ENDING           ending a surface puts the boat back to wandering (it is below 5 m again within a minute) with no tank state; swapping flood -> surface keeps the dropped weight
//   8  THE HIGH RIDER  surfacing on the hull with a 25% ballast range floats at its own 0.3 m; a 6% flood on it is trimmed out by the tank with no weight dropped
//   7  THE REST         an event on one sub leaves the others in the tank bit-identical to a tank where nothing happened; setHull clears every event
//
// SABOTAGE LOG -- SEVENTEEN, each applied to render/subAquariumSim.mjs in place, the gate run, the file restored; every one red by name (rows red in brackets):
//   V1 an unknown event name not refused 1 | V2 ending an event leaves the tank 1 | V3 the leak 0 6 | V4 flood flown with no rescue 4 | V5 the rescue at the flood task's 5 m / 10 m (too late for a 40 m boat in a 50 m tank) 5 | V6 surface flown with the plain pilot 2
//   V7 the surface flag not in the target 2 | V8 the held depth not used 3 | V9 a loss leaves the event on 1 | V10 setHull leaves events 1 | V11 sink given the rescue 1 | V12 the tank model never used 5 | V13 the weight error not applied 5
//   V14 the snapshot's tank always false 6 | V15 an unknown id throws 1 | V16 a swap keeps the old clock 1 | V17 the tank starts at 0, not the commanded level 1
// First runs crashed with no FAIL line (V2, V4, V12, V15: a row read s.tank.air on a null tank; the snapshot read eventModel.spec on a cleared event) -- a crash is red but not red BY NAME, so the snapshot is now defensive and the rows say "no tank".
// V16 and V17 went 0 red the first time: no row looked at the clock or at the starting level; the two rows in section 6 now do.
"use strict";
import * as A from "./subAquariumSim.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const entry = (id, extra = {}) => ({ id, name: "Sub " + id, hue: 100, pilot: "autopilot", from: "x", local: true, weights: null, ...extra });
const run = (tank, seconds) => { for (let i = 0; i < Math.round(seconds * 30); i++) tank.step(1 / 30); };
const one = (id = "a", pre = 40) => { const t = A.createTank(); t.sync([entry(id)]); run(t, pre); return t; };
const snap = (t, i = 0) => t.snapshot()[i];
const bits = (t) => JSON.stringify(t.snapshot().map((s) => [s.x, s.y, s.depth, s.heading, s.pitch, s.speed, s.cmd.ballast]));

console.log("subAquariumEvents-selfcheck -- a flood, a sinking and a surfacing in the tank\n");

console.log("1. OFF BY DEFAULT");
{
    const a = A.createTank(), b = A.createTank(); a.sync([entry("a"), entry("b")]); b.sync([entry("a"), entry("b")]);
    b.setEvent("a", "flood"); b.setEvent("a", null);
    run(a, 120); run(b, 120);
    ok("!! a tank where an event was started and ended before the first tick swims to the bit like one where none was", bits(a) === bits(b));
    const s = snap(a);
    ok("no event: the snapshot says event null and tank null, and the pilot's command has exactly four keys", s.event === null && s.tank === null && Object.keys(s.cmd).sort().join() === "ballast,pitch,thrust,yaw");
}

console.log("\n2. THE CALL");
{
    const t = one();
    ok("the names are pinned: flood, sink, surface, dropout, navigator (the last two are held by render/compassView-selfcheck.mjs); the leak is 6%; the rescue blows at 2 m and drops the weight at 4 m", A.EVENTS.join() === "flood,sink,surface,dropout,navigator" && A.LEAK === 0.06 && A.RESCUE.blowDepth === 2 && A.RESCUE.releaseDepth === 4 && Object.isFrozen(A.EVENTS) && Object.isFrozen(A.RESCUE));
    ok("!! setEvent answers the event now running, and the snapshot carries it with a tank at level and air", t.setEvent("a", "flood") === "flood" && snap(t).event === "flood" && snap(t).tank && snap(t).tank.airMax === 1.5 && snap(t).tank.released === false);
    let threw = false; try { t.setEvent("a", "capsize"); } catch (e) { threw = /unknown event "capsize"/.test(e.message); }
    ok("!! an unknown event throws by name and changes nothing (the flood is still running)", threw && snap(t).event === "flood");
    ok("an unknown id answers null and starts nothing", (() => { try { return t.setEvent("nobody", "flood") === null && t.snapshot().length === 1; } catch { return false; } })());
    ok("!! null, undefined and \"\" each end the event: tank and event are null again", [null, undefined, ""].every((v) => { t.setEvent("a", "flood"); const r = t.setEvent("a", v); return r === null && snap(t).event === null && snap(t).tank === null; }));
}

console.log("\n3. FLOOD");
for (const id of ["a", "b", "c"]) {
    const t = one(id), d0 = snap(t).depth; t.setEvent(id, "flood");
    let worst = 0, lostBefore = snap(t).lost;
    for (let k = 0; k < 24; k++) { run(t, 5); worst = Math.max(worst, Math.abs(snap(t).depth - d0)); }
    const s = snap(t);
    ok(`!! tank ${id}: a 6% leak at ${d0.toFixed(1)} m, 120 s on -- never lost, the weight dropped, within 8 m of where it was at its worst`, s.lost === lostBefore && !!s.tank && s.tank.released && worst < 8 && s.event === "flood", `worst ${worst.toFixed(2)} m, lost ${s.lost}, tank ${s.tank ? "air " + s.tank.air.toFixed(2) : "none"}`);
}

console.log("\n4. SINK");
{
    const t = one("a"); t.setEvent("a", "sink");
    let lostAt = null; for (let k = 0; k < 24 && lostAt === null; k++) { run(t, 5); if (snap(t).lost > 0) lostAt = (k + 1) * 5; }
    const s = snap(t);
    ok("!! the same leak with no rescue grounds the boat within two minutes, counts it lost, and puts it back with the event cleared", lostAt !== null && s.lost === 1 && s.event === null && s.tank === null, `lost at ${lostAt} s`);
}

console.log("\n5. SURFACE");
{
    const t = one("a"); t.setEvent("a", "surface"); run(t, 200);
    const s = snap(t);
    ok("!! 200 s after being told to surface the boat rides: depth under 1 m, speed under 0.5 m/s, never lost", s.depth < 1 && s.speed < 0.5 && s.lost === 0, `depth ${s.depth.toFixed(3)} m, speed ${s.speed.toFixed(2)} m/s, status ${s.status}`);
    ok("!! its tank is blown to the stop (level under -0.99) with air left (over 0.3 of 1.5)", !!s.tank && s.tank.level < -0.99 && s.tank.air > 0.3, s.tank ? `level ${s.tank.level.toFixed(3)}, air ${s.tank.air.toFixed(2)}` : "no tank");
}

console.log("\n6. ENDING");
{
    const t = one("a"); t.setEvent("a", "surface"); run(t, 200); t.setEvent("a", null); run(t, 60);
    const s = snap(t);
    ok("!! ending a surface puts the boat back to wandering: below 5 m within a minute, no tank state, no event", s.depth > 5 && s.tank === null && s.event === null, `${s.depth.toFixed(1)} m`);
    const u = one("a"); u.setEvent("a", "flood"); run(u, 60); const rel = !!snap(u).tank && snap(u).tank.released; u.setEvent("a", "surface");
    ok("!! swapping flood for surface keeps the tank: a dropped weight stays dropped", rel && !!snap(u).tank && snap(u).tank.released && snap(u).event === "surface");
    ok("!! and the swap restarts the event's clock (the leak ramp begins again)", u.subs.get("a").eventT === 0 && (run(u, 1), u.subs.get("a").eventT > 0.9 && u.subs.get("a").eventT < 1.1));
    const w = one("a"), c = Math.max(-1, Math.min(1, w.subs.get("a").cmd.ballast)); w.setEvent("a", "flood");
    ok("!! starting an event hands the tank the level the pilot had commanded (no jump in the boat's weight)", snap(w).tank.level === c && c !== 0, `commanded ${c.toFixed(4)}, tank ${snap(w).tank.level.toFixed(4)}`);
}

console.log("\n7. THE REST");
{
    const a = A.createTank(), b = A.createTank(); a.sync([entry("a"), entry("b")]); b.sync([entry("a"), entry("b")]);
    run(a, 30); run(b, 30); b.setEvent("a", "flood"); run(a, 90); run(b, 90);
    const ra = a.snapshot().find((s) => s.id === "b"), rb = b.snapshot().find((s) => s.id === "b");
    ok("!! a flood on sub a leaves sub b swimming to the bit like the tank where nothing happened", JSON.stringify([ra.x, ra.y, ra.depth, ra.heading]) === JSON.stringify([rb.x, rb.y, rb.depth, rb.heading]));
    b.setEvent("a", "surface"); b.setHull("munk3");
    ok("!! setHull clears every event and every tank", b.snapshot().every((s) => s.event === null && s.tank === null));
}

console.log("\n8. THE HIGH RIDER (a hull with a 25% main ballast, picked from the hull list)");
{
    const t = A.createTank({ hull: "highRider" }); t.sync([entry("a")]); run(t, 40); t.setEvent("a", "surface"); run(t, 260);
    const s = snap(t);
    ok("!! told to surface on the high rider, the boat rides with its centre 0.3 m down (0.2..0.4 m), not the EXPLORER's 0.564, nearly stopped, never lost", s.depth > 0.2 && s.depth < 0.4 && s.speed < 0.6 && s.lost === 0, `${s.depth.toFixed(3)} m, ${s.speed.toFixed(2)} m/s, lost ${s.lost}`);
    const u = A.createTank({ hull: "highRider" }); u.sync([entry("a")]); run(u, 40); const d0 = snap(u).depth; u.setEvent("a", "flood"); let worst = 0; for (let k = 0; k < 24; k++) { run(u, 5); worst = Math.max(worst, Math.abs(snap(u).depth - d0)); }
    ok("!! a 6% flood on the high rider is within what its tank trims out: it holds its depth to 8 m, is never lost and does NOT drop its weight (the EXPLORER's tank cannot do that)", worst < 8 && snap(u).lost === 0 && snap(u).tank && snap(u).tank.released === false, `worst ${worst.toFixed(2)} m, released ${snap(u).tank && snap(u).tank.released}`);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
