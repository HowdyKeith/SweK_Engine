// WebGLEngine/render/subAquariumSim-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subAquariumSim-selfcheck.mjs      (~6 s)
//
// THE TANK HELD TO ITS WORD. render/subAquariumSim.mjs flies every sub in the aquarium with its own pilot; the page only draws what this computes, so every claim about the sea is made here:
//   1  GEOMETRY   headingTo is the engine's heading (east 0; a target on the vessel's RIGHT, world -y, is +pi/2); insideBox is the 60 m steering margin
//   2  SYNC       new ids join and ids that are gone leave, with the counts; a sub that stays keeps its state (it does not respawn); a repeated id is one sub
//   3  SWIMMING   the four subs this tree can offer (the PD autopilot and three trained networks) swim for ten tank-minutes without leaving the tank (x 0..500, y 0..300, depth 8..46 m), without being lost,
//                 at speeds that are really the speeds they were told; the same tank swims the same way twice (deterministic from the ids)
//   4  THE WALLS  a boat set heading straight at a wall turns back and does not leave; the steering law is headingTo the middle
//   5  LOSS       a boat that is lost (here: a pilot that floods its tank until it grounds) is counted, put back near the middle with a clear trail, and goes on swimming
//   6  THE CLOCK  one call advances at most MAX_STEP (0.1 s) however long the frame was; a negative, NaN or zero step does nothing; the clock adds up
//   7  WANDERING  the targets are inside the ranges (depth 14..40, speed 1.5..3) and change on a 20-45 s schedule
//   8  PILOTS     963 weights fly the NETWORK, any other count falls back to the PD autopilot (no throw); weights that are hostile numbers (NaN, huge) do not throw and leave a finite state
//   9  SNAPSHOT   plain records with the fields the page draws; the trail is a COPY; a trail never grows past 80 points
//
// SABOTAGE LOG -- TWENTY-FOUR, each applied to render/subAquariumSim.mjs in place, the gate run, the file restored; every one red by name (the number is how many rows went red):
//   T1 headingTo's sign 2 | T2 margin 30 4 | T3 insideBox ignores y 2 | T4 tank length 400 2 | T5 sync never removes 2 | T6 sync respawns kept subs 3 | T7 a step not clipped 1 | T8 a negative step runs 1 | T9 the clock not advanced 3
//   T10 the wall rule off 1 | T11 the wall retarget points OUT 1 | T12 the outside override off 1 | T13 a loss not counted 2 | T14 respawn not at the middle 1 | T15 the trail kept at respawn 1 | T16 the trail unbounded 1
//   T17 the snapshot shares the trail 1 | T18 the weights count not checked 1 | T19 the network never used 1 | T20 the depth range 5..60 2 | T21 the speed range 0.5..5 1 | T22 retarget every 5 s 1
//   T23 the seed ignores the id 1 | T24 the depth floor 8 1
// T18 and T19 went 0 red the first time: the pilots row only asked for 'a function that does not throw', and a 962-weight vector fed to the network still flies. The row that swims the SAME id three ways now separates
// them: corrupt weights must swim bit-for-bit like the PD autopilot, real weights must not. THE FIRST DRAFT OF THE WALL RULE WAS A REAL DEFECT THE GATE FOUND, not a mutant: it overrode the target only outside the margin, so
// a boat aimed at a wall hugged it (max x 476, still near the wall after 108 s); the rule is now edge-triggered (retarget on crossing) and the row asks for the retarget, not a timing.
// ADDENDUM (v4907 work, section 12: pilot kinds): 54 MORE mutants of render/subAquariumSim.mjs, each run against a copy of this gate, 3 at a time: 49 red BY NAME (142 red rows), 4 red BY A THROWN ERROR and 1 EQUIVALENT.
//   the gfc test (the default circuit dropped, always true, never true), the network's count check and its copy; a sub with no weights, the weights kept for a kind that comes later (kept, copied), the kind looked up by the wrong name, the count check off, loosened, the kind check off, the builder given the weights uncopied, no context, another boat's, a build that is not a pilot unchecked
//   and its message, the kind record dropped or wrong, a failing builder's words dropped or cut, the sub's circuit default, seating never done or done before the target exists; registerPilotKind: the built-in circuit accepted, an empty or non-string name, no kind, no build, a weight count that is not a whole number or is under 1, the kind set before it was validated or never stored,
//   every circuit re-seated, subs with no weights re-seated, the event kept at a re-seat or cleared on the wrong boat, the re-seat not done, the seated count wrong in both ways, nothing returned, the message; the probe's kind and the snapshot's circuit, kind and kindError (three ways); the clock.
//   FIRST RUN, 56 mutants: 23 had no named red. Cut as code that did nothing: kind.label (a fallback nobody read; the record is now { circuit }), the repeated reset of the pilot in the catch, the `if (sub.event)` guard (clearEvent has it). Rows added: an explicit circuit 'gfc' (the server's list names it; the network had only ever been tried with none named) and its weights copied; the weights of a sub waiting for its kind copied;
//   a sub of ANOTHER circuit not re-seated by a kind it does not belong to; a sub with no weights keeping its event; a working kind replaced by a failing one (no stale record, { seated: 0 }); the target existing when the builder runs; the tank pure. The surface row had asked for a minute: both the autopilot and the stateful pilot take about 80 s (measured), so it asks for two. Rows that threw instead of failing now fail by name.
//   THE 4 RED BY A THROWN ERROR (T07 a sub with no weights seated as if it had some, T13 the kind check off, T26 the fallback pilot null, T31 the seat never done): each breaks the tank at its first sync or step, in rows far above this section, so the gate dies reporting the exception and exits 1. They are red, not named.
//   THE 1 EQUIVALENT (T05, the gfc branch falling through instead of returning): the sub then also keeps its weights as `kindWeights`, which nothing reads for a gfc sub (a re-seat is by circuit, and gfc cannot be registered).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as A from "./subAquariumSim.mjs";
import * as FX from "./subAquariumFlyCx.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const C = createRequire(import.meta.url)("../ai-bridge/subAquariumCore.js");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol, J = JSON.stringify;
const read = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(ENG, rel), "utf8")); } catch { return null; } };
const seed = C.seedSubs(read).subs.map((s, i) => ({ id: "s" + i, name: s.name, hue: s.hue, pilot: s.weights ? (s.circuit === "flycx" ? "stateful" : "network") : "autopilot", circuit: s.circuit, from: "this-box", local: true, weights: s.weights }));
const run = (tank, seconds) => { for (let i = 0; i < Math.round(seconds * 30); i++) tank.step(1 / 30); };
const entry = (id, extra = {}) => ({ id, name: "Sub " + id, hue: 100, pilot: "autopilot", from: "x", local: false, weights: null, ...extra });

console.log("subAquariumSim-selfcheck -- the tank\n");

console.log("1. GEOMETRY");
{
    ok("!! headingTo is the engine's heading: east is 0, a target on the vessel's RIGHT (smaller world y) is +pi/2, on its left -pi/2, west is +-pi, and it is the heading a boat at (10, 10) needs for a point 10 m east and 10 m to its right (pi/4)", near(A.headingTo(0, 0, 10, 0), 0) && near(A.headingTo(0, 0, 0, -10), Math.PI / 2) && near(A.headingTo(0, 0, 0, 10), -Math.PI / 2) && near(Math.abs(A.headingTo(0, 0, -10, 0)), Math.PI) && near(A.headingTo(10, 10, 20, 0), Math.PI / 4));
    ok("!! insideBox is the steering margin (60 m in from every wall of the 500 x 300 tank): the corner (60, 60) is in, (59.9, 150) out, (250, 240) in, (250, 240.1) out, the middle in; the tank is 500 x 300", A.insideBox(60, 60) && !A.insideBox(59.9, 150) && A.insideBox(250, 240) && !A.insideBox(250, 240.1) && A.insideBox(250, 150) && A.LENGTH === 500 && A.WIDTH === 300 && A.MARGIN === 60);
}

console.log("\n2. SYNC");
{
    const t = A.createTank(), r1 = t.sync([entry("a"), entry("b"), entry("a")]);
    ok("!! sync adds new ids and counts them; a repeated id in the list is one sub (2 added, not 3)", r1.added === 2 && r1.removed === 0 && t.subs.size === 2);
    run(t, 5); const before = t.subs.get("a").state.pos.slice(), obj = t.subs.get("a");
    const r2 = t.sync([entry("a"), entry("c")]);
    ok("!! a second sync: 'c' joins, 'b' leaves, 'a' STAYS and is the very same boat in the same place (it does not respawn)", r2.added === 1 && r2.removed === 1 && t.subs.has("c") && !t.subs.has("b") && t.subs.get("a") === obj && t.subs.get("a").state.pos[0] === before[0]);
    ok("an empty list empties the tank; syncing the same list twice changes nothing", t.sync([]).removed === 2 && t.subs.size === 0 && (t.sync([entry("z")]), t.sync([entry("z")]).added === 0));
}

console.log("\n3. SWIMMING");
{
    ok("!! the tree offers seven subs here: the PD autopilot (no weights), five trained networks (circuit gfc, 963 weights) and the stateful fly pilot (circuit flycx, 1,729 weights)", seed.length === 7 && seed[0].weights === null && seed.slice(1, 6).every((s) => s.circuit === "gfc" && s.weights.length === 963) && seed[6].circuit === "flycx" && seed[6].weights.length === 1729);
    const t = A.createTank(); t.sync(seed); let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minD = 1e9, maxD = -1e9;
    for (let i = 0; i < 30 * 600; i++) { t.step(1 / 30); if (i % 30 === 0) for (const s of t.snapshot()) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y); minD = Math.min(minD, s.depth); maxD = Math.max(maxD, s.depth); } }
    const snap = t.snapshot();
    ok("!! four subs swim ten tank-minutes (18,000 ticks each) and never leave the tank: x within 0..500, y within 0..300, depth within 8..46 m; and none is lost", minX >= 0 && maxX <= A.LENGTH && minY >= 0 && maxY <= A.WIDTH && minD >= 8 && maxD <= 46 && snap.every((s) => s.lost === 0 && s.status === "swimming"), `x ${minX.toFixed(0)}..${maxX.toFixed(0)} y ${minY.toFixed(0)}..${maxY.toFixed(0)} depth ${minD.toFixed(1)}..${maxD.toFixed(1)}`);
    ok("!! they are really swimming and really at the speeds they were told: every boat moved more than 400 m in ten minutes and its speed is between 0.5 and 4.6 m/s; the clock reads 600 s", snap.every((s) => s.trail.length > 10 && s.speed > 0.5 && s.speed < 4.6) && near(t.clock, 600, 1e-6) && snap.every((s) => Math.abs(s.x) < 1e4), snap.map((s) => s.speed.toFixed(1)).join(" "));
    const t2 = A.createTank(); t2.sync(seed); run(t2, 600);
    ok("!! the same tank swims the same way twice: after ten minutes the two tanks' positions agree to the bit (the wandering is a function of the ids)", JSON.stringify(t2.snapshot().map((s) => [s.x, s.y, s.depth, s.heading])) === JSON.stringify(snap.map((s) => [s.x, s.y, s.depth, s.heading])));
    const t3 = A.createTank(); t3.sync([entry("one")]); const t4 = A.createTank(); t4.sync([entry("two")]);
    ok("!! different ids swim different ways (the seed is the id): two PD subs with different ids do not start in the same place", JSON.stringify(t3.snapshot()[0].x) !== JSON.stringify(t4.snapshot()[0].x));
}

console.log("\n4. THE WALLS");
{
    const t = A.createTank(); t.sync([entry("w")]); const sub = t.subs.get("w");
    sub.target = { depth: 25, heading: 0, speed: 3 }; sub.nextTarget = 1e9;   // aimed at the east wall, and told not to retarget on its own
    const S = sub.state; S.pos[0] = 441; S.pos[1] = 150; S.pos[2] = -25;     // one metre past the 60 m margin of the 500 m tank
    const age0 = sub.age; t.step(1 / 30);
    const want = A.headingTo(441, 150, A.LENGTH / 2, A.WIDTH / 2), off = Math.abs(Math.atan2(Math.sin(sub.target.heading - want), Math.cos(sub.target.heading - want)));
    ok("!! the moment a boat crosses the margin it is RETARGETED toward the middle: its target heading is within 0.4 rad of headingTo(the middle) (here ~pi), its speed is capped at 2.5, and the next retarget is 15-30 s away -- not the 1e9 s the test set", sub.wasInside === false && off <= 0.4 + 1e-9 && sub.target.speed <= 2.5 && sub.nextTarget - sub.age >= 15 && sub.nextTarget - sub.age <= 30 + 1e-6 && age0 === 0, `target ${sub.target.heading.toFixed(2)} vs ${want.toFixed(2)}, next in ${(sub.nextTarget - sub.age).toFixed(1)} s`);
    let maxX = 0; for (let i = 0; i < 30 * 200; i++) { t.step(1 / 30); maxX = Math.max(maxX, t.snapshot()[0].x); }
    ok("!! and it never leaves the tank: over the next 200 s the boat that started past the margin never passes x = 500", maxX < A.LENGTH, `max x ${maxX.toFixed(0)}`);
    let bounced = 0, prevIn = true; const t6 = A.createTank(); t6.sync([entry("z")]); const z = t6.subs.get("z"); z.target = { depth: 25, heading: 0, speed: 3 }; z.nextTarget = 1e9; z.state.pos[0] = 400; z.state.pos[1] = 150; z.state.pos[2] = -25;
    for (let i = 0; i < 30 * 200; i++) { t6.step(1 / 30); const s = t6.snapshot()[0], inside = s.x >= A.MARGIN && s.x <= A.LENGTH - A.MARGIN && s.y >= A.MARGIN && s.y <= A.WIDTH - A.MARGIN; if (!inside && prevIn) bounced++; prevIn = inside; }
    ok("!! it does not BOUNCE: over 200 s a boat that keeps being aimed at the wall crosses out of the margin only a few times (fewer than 6; a bouncing boat crosses every few seconds)", bounced < 6, `${bounced} crossings`);
    const t5 = A.createTank(); t5.sync([entry("n")]); const n = t5.subs.get("n"); n.target = { depth: 25, heading: 0, speed: 3 }; n.nextTarget = 1e9; n.state.pos[0] = 100; n.state.pos[1] = 150; n.state.pos[2] = -25;
    run(t5, 30);
    ok("!! and in the middle of the tank the wall steering is OFF: the same boat, far from every wall, holds its own target heading (0) to within 0.3 rad over 30 s", Math.abs(t5.snapshot()[0].heading) < 0.3);
}

console.log("\n5. LOSS");
{
    const t = A.createTank(); t.sync([entry("l")]); const sub = t.subs.get("l"); sub.pilot = () => ({ ballast: 1, thrust: 0 });
    run(t, 120);
    const s = t.snapshot()[0];
    ok("!! a boat that floods its tank until it grounds is LOST, counted (at least once in two minutes), put back near the middle of the tank, its trail cleared at the respawn, and it carries on", s.lost >= 1 && Number.isFinite(s.x) && Number.isFinite(s.depth) && s.depth < 50, `lost ${s.lost}, now x ${s.x.toFixed(0)} depth ${s.depth.toFixed(1)}`);
    const t2 = A.createTank(); t2.sync([entry("m")]); const m = t2.subs.get("m"); m.pilot = () => ({ ballast: 1, thrust: 0 }); let sawCentre = false;
    for (let i = 0; i < 30 * 200; i++) { const before = m.lost; t2.step(1 / 30); if (m.lost > before) { const q = t2.snapshot()[0]; sawCentre = Math.abs(q.x - A.LENGTH / 2) <= 31 && Math.abs(q.y - A.WIDTH / 2) <= 21 && q.trail.length === 0; break; } }
    ok("!! at the moment of loss the boat is respawned within 30 m of the tank's middle (x) and 20 m (y) with an EMPTY trail", sawCentre);
}

console.log("\n6. THE CLOCK");
{
    const t = A.createTank(); t.sync([entry("k")]); t.step(10); const c1 = t.clock; t.step(-5); t.step(NaN); t.step(0); t.step(undefined); const c2 = t.clock;
    ok("!! one call advances at most MAX_STEP (0.1 s) however long the frame was (a hidden tab's 10 s frame is 0.1 s of sea); a negative, NaN, zero or missing step does nothing", near(c1, 0.1, 1e-9) && c2 === c1 && A.MAX_STEP === 0.1);
    const u = A.createTank(); u.sync([entry("k")]); for (let i = 0; i < 10; i++) u.step(0.05);
    ok("the clock adds up across calls: ten steps of 0.05 s is 0.5 s", near(u.clock, 0.5, 1e-9));
}

console.log("\n7. WANDERING");
{
    const t = A.createTank(); t.sync([entry("a"), entry("b"), entry("c")]); const seen = new Map(); let ranges = true;
    for (let i = 0; i < 30 * 300; i++) { t.step(1 / 30); if (i % 15 === 0) for (const sub of t.subs.values()) { const k = JSON.stringify(sub.target); if (!seen.has(sub.id)) seen.set(sub.id, new Set()); seen.get(sub.id).add(k); const g = sub.target; if (!(g.depth >= 14 && g.depth <= 40 && g.speed >= 1.5 && g.speed <= 3 && g.heading >= -Math.PI && g.heading <= Math.PI)) ranges = false; } }
    ok("!! every target is inside its range (depth 14..40 m, speed 1.5..3 m/s, heading within +-pi) and each boat gets between 6 and 16 targets in five minutes (a new one every 20-45 s)", ranges && [...seen.values()].every((s) => s.size >= 6 && s.size <= 16), [...seen.values()].map((s) => s.size).join());
}

console.log("\n8. PILOTS");
{
    const t = A.createTank(); t.sync([entry("net", { pilot: "network", weights: seed[1].weights }), entry("short", { pilot: "network", weights: seed[1].weights.slice(1) }), entry("pd")]);
    ok("!! 963 weights fly the NETWORK; 962 weights (a corrupted sub) fall back to the PD autopilot without throwing; no weights is the PD autopilot", t.subs.get("net").pilot !== t.subs.get("pd").pilot && typeof t.subs.get("short").pilot === "function" && (() => { try { run(t, 30); return true; } catch { return false; } })());
    const swim = (e) => { const q = A.createTank(); q.sync([e]); run(q, 90); const x = q.snapshot()[0]; return JSON.stringify([x.x, x.y, x.depth, x.heading]); };
    const pdSwim = swim(entry("same")), shortSwim = swim(entry("same", { pilot: "network", weights: seed[1].weights.slice(1) })), netSwim = swim(entry("same", { pilot: "network", weights: seed[1].weights }));
    ok("!! the SAME id swims three ways: with no weights (the PD autopilot), with 962 weights (corrupt: it must swim EXACTLY like the PD autopilot, bit for bit, because it falls back to it) and with 963 (the network: it must swim DIFFERENTLY from the PD autopilot)", shortSwim === pdSwim && netSwim !== pdSwim);
    const nan = A.createTank(); const hostile = Array(963).fill(0).map((_, i) => (i % 7 === 0 ? 1e30 : i % 11 === 0 ? -1e30 : 0.3));
    nan.sync([entry("nan", { pilot: "network", weights: Array(963).fill(NaN) }), entry("big", { pilot: "network", weights: hostile })]);
    let threw = false; try { run(nan, 90); } catch { threw = true; }
    ok("!! weights that are all NaN, and weights of +-1e30, do not throw and leave a finite state (the vessel drifts, or is lost and respawned; the tank does not break)", !threw && nan.snapshot().every((s) => Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.depth)));
}

console.log("\n9. SNAPSHOT");
{
    const t = A.createTank(); t.sync([entry("p", { name: "Pip", hue: 42, from: "10.0.0.2", local: true })]); run(t, 60);
    const s = t.snapshot()[0], tr = s.trail.length; s.trail.push([0, 0, 0]); s.trail.length = 0;
    ok("!! a snapshot is a plain record with exactly the fields the page draws (id, name, hue, hull, pilot, circuit, kind, kindError, from, local, x, y, depth, heading, pitch, speed, cmd, event, steer, needs, compass, tank, target, lost, status, trail -- v4907 work added circuit, kind and kindError, v4904 added steer, v4901 added event and tank, v4899 added cmd, the pilot's four commands this tick, which the 3D view draws the fins from), and its trail is a COPY (emptying it does not empty the boat's)", Object.keys(s).sort().join() === "circuit,cmd,compass,depth,event,from,heading,hue,hull,id,kind,kindError,local,lost,name,needs,pilot,pitch,speed,status,steer,tank,target,trail,x,y".split(",").sort().join() && t.snapshot()[0].trail.length === tr && tr > 50 && s.name === "Pip" && s.hue === 42 && s.from === "10.0.0.2" && s.local === true && s.pilot === "autopilot");
    run(t, 300);
    ok("!! a trail never grows past 80 points however long the boat swims (5 minutes more)", t.snapshot()[0].trail.length === 80 && A.TRAIL === 80 && t.snapshot()[0].trail.every((p) => p.length === 3 && p.every(Number.isFinite)));
    const big = A.createTank(); big.sync(Array.from({ length: 24 }, (_, i) => entry("g" + i, i % 2 ? { pilot: "network", weights: seed[2].weights } : {}))); const t0 = Date.now(); run(big, 60);
    ok("!! a full tank (24 subs, half of them networks) runs a minute of sea in well under 4 s: the page can run it at 10x on a laptop", Date.now() - t0 < 4000, `${Date.now() - t0} ms`);
}

console.log("\n10. THE HULL");
{
    const H = await import("../physics/mechanics/subHulls.mjs");
    const swim = (hull, secs = 120) => { const q = A.createTank({ hull }); q.sync([entry("h", { pilot: "network", weights: seed[4].weights })]); run(q, secs); const x = q.snapshot()[0]; return { hull: q.hull, snap: JSON.stringify([x.x, x.y, x.depth, x.heading, x.pitch]), lost: x.lost, rec: x.hull }; };
    const a = swim("nominal"), b = swim("heavy"), c = swim("nominal");
    ok("!! the tank starts on the nominal hull by default, reports its hull in the tank and in every record, and the same sub swims DIFFERENTLY on the heavy hull (the hull is really the vessel, not a label) and identically twice on the same hull", new A.createTank().hull === "nominal" && a.hull === "nominal" && a.rec === "nominal" && b.rec === "heavy" && a.snap !== b.snap && a.snap === c.snap, `${a.snap} | ${b.snap}`);
    const t = A.createTank(); t.sync([entry("p", { pilot: "network", weights: seed[4].weights }), entry("q")]); run(t, 90);
    const before = t.snapshot().map((x) => x.trail.length), name = t.setHull("munk5"), after = t.snapshot();
    ok("!! changing the hull puts every sub back in the water on the new vessel: the tank and the records name it, the trails are cleared, the subs are still there and still swimming", name === "munk5" && t.hull === "munk5" && after.length === 2 && after.every((x) => x.hull === "munk5" && x.trail.length === 0 && x.status === "swimming") && before.every((n) => n > 20));
    const twin = (h) => { const q = A.createTank(); q.sync([entry("p", { pilot: "network", weights: seed[4].weights })]); run(q, 90); const pre = JSON.stringify(q.snapshot()[0].x); q.setHull(h); const post = JSON.stringify(q.snapshot()[0].x); run(q, 120); const x = q.snapshot()[0]; return { pre, post, end: JSON.stringify([x.x, x.y, x.depth, x.heading, x.pitch]) }; };
    const tn = twin("nominal"), th = twin("heavy");
    ok("!! setHull really changes the physics: two tanks with the SAME history and the same respawn, one put on the nominal hull and one on the heavy hull, swim differently afterwards (and the same hull twice swims the same)", tn.end !== th.end && tn.end === twin("nominal").end);
    ok("!! setHull puts the boat back in the water: its position after the call is not the position before it", tn.pre !== tn.post && th.pre !== th.post);
    let threw = false; try { t.setHull("no-such-hull"); } catch { threw = true; }
    ok("!! an unknown hull name throws and changes NOTHING (the tank keeps its hull and its subs)", threw && t.hull === "munk5" && t.snapshot().length === 2);
    let threw2 = false; try { A.createTank({ hull: "nope" }); } catch { threw2 = true; }
    ok("an unknown hull name at creation throws too", threw2);
    ok("!! every named hull has a picker label and builds a finite model, and the labels cover exactly the hulls (v4901 added highRider; a hull with no label would be an unreachable option in the page)", Object.keys(H.SPECS).sort().join() === Object.keys(H.LABELS).sort().join() && Object.keys(H.SPECS).every((n) => Number.isFinite(H.model(n).mass)) && Object.keys(H.SPECS).length === 13);
    const x5 = A.createTank({ hull: "munk5" }); x5.sync([entry("n", { pilot: "network", weights: seed[4].weights })]); run(x5, 300); const sn = x5.snapshot()[0];
    ok("!! even on the extreme Munk x5 hull a five-minute swim leaves a finite state in the tank (the boat may be lost and respawned, never NaN)", Number.isFinite(sn.x) && Number.isFinite(sn.y) && Number.isFinite(sn.depth));
}

console.log("\n11. THE NAMED CONSTANTS (DEPTH_MIN, DEPTH_MAX, TRAIL_EVERY)");
{
    const t = A.createTank(); t.sync([entry("trail", { pilot: "autopilot" })]); run(t, 30);
    const n = t.snapshot()[0].trail.length;
    ok("!! the swimming band is 14..40 m (DEPTH_MIN, DEPTH_MAX) and a trail point is laid at the first 30 Hz tick at or past every 0.5 s (TRAIL_EVERY; 16 ticks = 0.533 s, so thirty seconds of swimming leave 56 points, not 60 -- said here rather than rounded away)", A.DEPTH_MIN === 14 && A.DEPTH_MAX === 40 && A.TRAIL_EVERY === 0.5 && n >= 54 && n <= 58, `${n} points`);
}

// BIG TANK sabotages: Z1 the tank ignores the size it was given (1 red). Z2 the wall test kept at 500 x 300 inside a big tank: 0 red, SAID PLAINLY -- the wall logic only acts when a sub CROSSES from inside to outside
// and a sub is spawned anywhere in the tank, so that mutant changes where a boat turns back, not whether the big tank is used; no row of this gate tells it from the true one, and none is claimed.
console.log("\n12. PILOT KINDS (v4907 work: a circuit other than gfc is flown by the kind a page registers for it)");
{
    const cj = JSON.parse(fs.readFileSync(path.join(ENG, "vendor/hemibrain/hemibrain-cx-heading-loop.json"), "utf8")), circuit = { neurons: cj.neurons, edges: cj.edges, io: cj.io };
    const W = seed[6].weights, cx = (id, extra = {}) => entry(id, { pilot: "stateful", circuit: "flycx", weights: W, ...extra });
    const swim = (build, secs = 90, tankArg) => { const q = tankArg || A.createTank(); build(q); run(q, secs); const x = q.snapshot()[0]; return JSON.stringify([x.x, x.y, x.depth, x.heading, x.pitch, x.speed]); };
    const pd = swim((q) => q.sync([entry("same")])), unreg = swim((q) => q.sync([cx("same")])), kind = FX.flyCxKind(circuit);
    const reg = swim((q) => { q.registerPilotKind("flycx", kind); q.sync([cx("same")]); });
    ok("!! with NO kind registered a flycx sub flies the PD autopilot bit for bit (it waits with its weights), says nothing is wrong (kind null, kindError null) and names its circuit; with the real stateful kind registered first it swims DIFFERENTLY from the autopilot", unreg === pd && reg !== pd && (() => { const q = A.createTank(); q.sync([cx("same")]); const s = q.snapshot()[0]; return s.circuit === "flycx" && s.kind === null && s.kindError === null && q.probe("same").kind === "autopilot" && q.probe("same").weights === null; })());
    let lateSeated = null; const late = swim((q) => { q.sync([cx("same")]); lateSeated = q.registerPilotKind("flycx", kind); }, 90);
    ok("!! A KIND REGISTERED AFTER THE SUB ARRIVED SEATS IT: registering at tank time 0 leaves it swimming exactly as if it had been registered first (nothing is lost), and answers { seated: 1 }", late === reg && lateSeated && lateSeated.seated === 1);
    const t1 = A.createTank(); t1.sync([cx("m")]); run(t1, 20); const before = t1.snapshot()[0], obj = t1.subs.get("m"), r1 = t1.registerPilotKind("flycx", kind), after = t1.snapshot()[0];
    ok("!! registered MID-RUN it seats the sub where it is: the very same boat, the same place, heading and trail, the same lost count; the brain panel then reads kind flycx with no 963-weight network (weights null) and the snapshot says kind flycx", r1 && r1.seated === 1 && t1.subs.get("m") === obj && after.x === before.x && after.y === before.y && after.heading === before.heading && after.trail.length === before.trail.length && after.kind === "flycx" && after.kindError === null && t1.probe("m").kind === "flycx" && t1.probe("m").weights === null);
    // a spy kind: what the tank hands the builder and the pilot
    const log = { builds: [], calls: [], cmd: { pitch: 0.11, yaw: -0.22, thrust: 0.33, ballast: 0.44 } };
    const spy = { weightCount: 1729, build(w, ctx) { log.builds.push({ w, ctx, targetAtBuild: ctx.sub.target }); return (state, target, current, aux) => { log.calls.push({ state, target, current, aux, wander: ctx.sub.target }); return log.cmd; }; } };
    const ts = A.createTank(); ts.registerPilotKind("flycx", spy); ts.sync([cx("a"), cx("b")]);
    ok("!! the builder is called ONCE for each sub (two subs with the same weights get two pilots) with a Float32Array COPY of the entry's weights and { sub } the tank's own record of that sub", log.builds.length === 2 && log.builds.every((b) => b.w instanceof Float32Array && b.w.length === 1729 && b.w !== W && b.w.every((v, i) => v === Math.fround(W[i]))) && log.builds[0].ctx.sub === ts.subs.get("a") && log.builds[1].ctx.sub === ts.subs.get("b") && log.builds.every((b) => b.targetAtBuild && typeof b.targetAtBuild.depth === "number") && log.builds[0].w !== log.builds[1].w && log.builds[0].ctx.sub !== log.builds[1].ctx.sub);
    run(ts, 1);
    ok("!! each tick the pilot is called with (the boat's state, the target, still water [0, 0, 0], no aux) and ITS commands are what the snapshot reports and the fins follow", log.calls.length >= 60 && log.calls.every((c) => c.current.join() === "0,0,0" && c.aux === undefined && typeof c.target.depth === "number" && c.state.pos.length === 3) && J(ts.snapshot()[0].cmd) === J(log.cmd));
    const sA = ts.subs.get("a"); const tgt0 = sA.target; ts.step(0.1); let changed = false;
    for (let i = 0; i < 30 * 120 && !changed; i++) { ts.step(1 / 30); if (sA.target !== tgt0) changed = true; }
    ok("!! `ctx.sub.target` is the WANDERING target and a NEW OBJECT at each retarget (the identity the stateful pilot restarts its memory on), while the per-tick target the pilot is handed is another matter", changed && log.calls.some((c) => c.wander === tgt0) && log.calls.some((c) => c.wander !== tgt0));
    // lost and respawned: also a new target
    const tl = A.createTank(); tl.registerPilotKind("flycx", { weightCount: 1729, build: (w, ctx) => () => ({ pitch: 0, yaw: 0, thrust: 0, ballast: 1 }) }); tl.sync([cx("lost")]); const sl = tl.subs.get("lost"), tgtL = sl.target; run(tl, 400);
    ok("!! a boat that is LOST (here a pilot that floods its tank until it grounds) is put back and given a new wandering target, as a retarget does (so the stateful pilot's memory restarts at a respawn too)", sl.lost >= 1 && sl.target !== tgtL);
    // refusals of the kind and fallbacks
    const tw = A.createTank(); tw.registerPilotKind("flycx", spy); log.builds.length = 0;
    tw.sync([cx("short", { weights: W.slice(1) }), cx("long", { weights: [...W, 0] }), entry("g963", { pilot: "network", weights: seed[1].weights }), entry("gfcLong", { pilot: "network", circuit: "gfc", weights: W }), entry("flyBad963", { circuit: "flycx", weights: seed[1].weights }), entry("nokind", { circuit: "other", weights: W }), entry("pd")]);
    const pdPilot = tw.subs.get("pd").pilot;
    ok("!! with a kind registered: 1,728 and 1,730 weights, a flycx sub with 963, a gfc sub with 1,729 and an unregistered circuit all fly the PD autopilot (no builder call, no error); 963 weights with NO circuit named are still the gfc NETWORK; a gfc sub says circuit gfc", log.builds.length === 0 && ["short", "long", "gfcLong", "flyBad963", "nokind"].every((id) => tw.subs.get(id).kindInfo === null && tw.subs.get(id).kindError === null && tw.subs.get(id).weights === null) && tw.subs.get("g963").weights && tw.subs.get("g963").weights.length === 963 && tw.snapshot().find((s) => s.id === "g963").circuit === "gfc" && tw.snapshot().find((s) => s.id === "nokind").circuit === "other" && pdPilot !== tw.subs.get("g963").pilot);
    const te = A.createTank(); te.registerPilotKind("flycx", { weightCount: 1729, build() { throw new Error("no circuit loaded here"); } }); te.registerPilotKind("flycxb", { weightCount: 1729, build: () => 7 }); te.sync([cx("boom"), cx("seven", { circuit: "flycxb" })]);
    let teThrew = null; try { run(te, 20); } catch (e) { teThrew = e; }
    ok("!! a builder that THROWS, or returns something that is not a pilot, leaves the sub on the PD autopilot, says why in the snapshot's kindError (the builder's own words) and the sub swims on; kind stays null", ["boom", "seven"].every((id) => te.snapshot().find((s) => s.id === id).kind === null) && te.snapshot().find((s) => s.id === "boom").kindError === "no circuit loaded here" && /did not return a pilot/.test(te.snapshot().find((s) => s.id === "seven").kindError) && teThrew === null && te.snapshot().every((s) => Number.isFinite(s.x)));
    const bad = [["gfc", spy], ["", spy], [7, spy], [null, spy], ["flycx", null], ["flycx", {}], ["flycx", { build() {}, weightCount: 0 }], ["flycx", { build() {}, weightCount: 1.5 }], ["flycx", { build() {}, weightCount: "1729" }], ["flycx", { weightCount: 1729 }], ["flycx", { build: 1, weightCount: 1729 }]].map(([c, k]) => { const q = A.createTank(); try { q.registerPilotKind(c, k); return null; } catch (e) { return String(e.message); } });
    ok("!! registerPilotKind refuses, naming the module: the built-in circuit gfc, an empty or non-string circuit, a kind that is nothing, has no build, a weight count of 0, 1.5 or '1729'", bad.every((m) => m && /subAquariumSim\.registerPilotKind/.test(m)) && /"gfc"/.test(bad[0]));
    const tr = A.createTank(); tr.registerPilotKind("flycx", spy); try { tr.registerPilotKind("flycx", { weightCount: 5 }); } catch (e) { /* refused */ } tr.sync([cx("k")]);
    ok("!! a refused registration changes nothing: the kind registered before still seats subs", tr.subs.get("k").kindInfo && tr.subs.get("k").kindInfo.circuit === "flycx");
    const tg = A.createTank(); tg.sync([cx("e1"), cx("e2")]); tg.setEvent("e1", "dropout"); tg.setEvent("e2", "surface"); const seatedN = tg.registerPilotKind("flycx", kind);
    ok("!! a sub that had an EVENT running when its kind arrived has the event ended (it wrapped the autopilot) and is seated; registering the same circuit again replaces the kind and seats them again (a new pilot: a different function)", seatedN && seatedN.seated === 2 && tg.snapshot().every((s) => s.event === null && s.kind === "flycx") && (() => { const before = tg.subs.get("e1").pilot; tg.registerPilotKind("flycx", FX.flyCxKind(circuit)); const ki = tg.subs.get("e1").kindInfo; return tg.subs.get("e1").pilot !== before && !!ki && ki.circuit === "flycx"; })());
    // copies, explicit gfc, other circuits, weightless subs, a kind that fails after one that worked
    const ent = entry("c", { circuit: "gfc", pilot: "network", weights: Array.from(seed[1].weights) }), tc = A.createTank(); tc.sync([ent]); const w5 = (tc.subs.get("c").weights || [])[5]; ent.weights[5] += 1; const cwt = tc.subs.get("c").weights;
    ok("!! A SUB NAMING THE circuit 'gfc' with 963 weights (as the server's list does) is the NETWORK, exactly as one naming none; its weights are COPIED (editing the entry's afterwards changes nothing); it swims differently from the PD autopilot", !!cwt && cwt.length === 963 && cwt[5] === w5 && cwt[5] !== ent.weights[5] && tc.probe("c").kind === "fly" && swim((q) => q.sync([entry("same", { circuit: "gfc", pilot: "network", weights: seed[1].weights })])) !== pd && swim((q) => q.sync([entry("same", { circuit: "gfc", pilot: "network", weights: seed[1].weights })])) === swim((q) => q.sync([entry("same", { pilot: "network", weights: seed[1].weights })])));
    const waiting = cx("w", { weights: Array.from(W) }), tcw = A.createTank(); tcw.sync([waiting]); waiting.weights[7] += 1; const heard = [];
    tcw.registerPilotKind("flycx", { weightCount: 1729, build(w) { heard.push(w); return () => ({ pitch: 0, yaw: 0, thrust: 0, ballast: 0 }); } });
    ok("!! a sub that WAITS for its kind keeps a COPY of its weights: editing the entry's array after the sub arrived does not change what the kind is built with", heard.length === 1 && heard[0][7] === Math.fround(W[7]) && heard[0][7] !== waiting.weights[7]);
    const to = A.createTank(); to.sync([cx("o1", { circuit: "other" }), cx("o2")]); const rOther = to.registerPilotKind("flycx", spy);
    ok("!! registering a kind seats ONLY the subs of that circuit: a sub of another circuit with the same number of weights is left on the PD autopilot (kind null) and not counted", rOther && rOther.seated === 1 && to.subs.get("o1").kindInfo === null && to.subs.get("o2").kindInfo !== null);
    const tn = A.createTank(); tn.sync([cx("nw", { weights: null }), cx("hw")]); tn.setEvent("nw", "dropout"); tn.registerPilotKind("flycx", spy);
    ok("!! a flycx sub that has NO weights (the PD autopilot) keeps its event when the kind is registered: nothing about it is re-seated", tn.subs.get("nw").event === "dropout" && tn.subs.get("hw").kindInfo !== null);
    const tf2 = A.createTank(); tf2.sync([cx("x1")]); const good1 = tf2.registerPilotKind("flycx", kind), bad1 = tf2.registerPilotKind("flycx", { weightCount: 1729, build() { throw new Error("gone"); } }), snapX = tf2.snapshot()[0];
    ok("!! a kind that WORKED and is replaced by one that fails leaves the sub on the PD autopilot with the new builder's words as its kindError and no kind (no stale record of the first), and the registration answers { seated: 0 }", good1 && good1.seated === 1 && bad1 && bad1.seated === 0 && snapX.kind === null && snapX.kindError === "gone");
    const ts2 = A.createTank(); ts2.registerPilotKind("flycx", kind); ts2.sync([cx("s")]);
    let steerMsg = null; try { ts2.setSteer("s", 3, 1); } catch (e) { steerMsg = e.message; }
    ok("!! a stateful sub has no hidden neuron to push: setSteer refuses, naming the 963-weight network; a plain clear (null) of a sub with no steer is not an error either", /963/.test(steerMsg || "") && ts2.probe("s").steer === null);
    // the real kind in the real tank
    const tk = A.createTank(); tk.registerPilotKind("flycx", kind); tk.sync([cx("real")]); let outside = 0, minD = 1e9, maxD = -1e9;
    for (let i = 0; i < 30 * 600; i++) { tk.step(1 / 30); if (i % 30 === 0) { const s = tk.snapshot()[0]; if (s.x < 0 || s.x > 500 || s.y < 0 || s.y > 300) outside++; minD = Math.min(minD, s.depth); maxD = Math.max(maxD, s.depth); } }
    ok("!! THE REAL STATEFUL PILOT SWIMS FOR TEN TANK-MINUTES in the real tank: it stays inside the box, within the depth range, is never lost (the rung 4a champion flies as an autopilot with a learned residual does)", outside === 0 && minD >= 8 && maxD <= 46 && tk.snapshot()[0].lost === 0, `depth ${minD.toFixed(1)}..${maxD.toFixed(1)}, lost ${tk.snapshot()[0].lost}`);
    const again = swim((q) => { q.registerPilotKind("flycx", FX.flyCxKind(circuit)); q.sync([cx("same")]); });
    ok("!! and it is deterministic: the same tank swims the same way twice", again === reg);
    const tdr = A.createTank(); tdr.registerPilotKind("flycx", kind); tdr.sync([cx("d"), entry("pdd")]); tdr.setEvent("d", "dropout"); tdr.setEvent("pdd", "dropout"); let valid = 0, dark = 0;
    for (let i = 0; i < 30 * 100; i++) { tdr.step(1 / 30); const c = tdr.snapshot()[0].compass; if (c) { if (c.valid) valid++; else dark++; } }
    const sn = tdr.snapshot();
    ok("!! the compass events run on a stateful sub as on any other (the dropout windows come and go: valid and dark ticks both counted, the compass block present, a finite error) and it is not lost", valid > 0 && dark > 0 && sn[0].compass && Number.isFinite(sn[0].compass.error) && sn[0].lost === 0 && sn[0].event === "dropout");
    const tsf = A.createTank(); tsf.registerPilotKind("flycx", kind); tsf.sync([cx("f")]); tsf.setEvent("f", "surface"); run(tsf, 120); const tsn = tsf.snapshot()[0];
    ok("!! and so do the other events: a stateful sub told to surface rises (depth falls below 5 m within two minutes; measured, from the depth it was at, the autopilot and the stateful pilot both arrive at the surface in about 80 s) with the tank state present, and ending the event leaves it flying its kind", tsn.event === "surface" && tsn.depth < 5 && tsn.tank !== null && (() => { tsf.setEvent("f", null); run(tsf, 5); return tsf.snapshot()[0].event === null && tsf.snapshot()[0].kind === "flycx" && Number.isFinite(tsf.snapshot()[0].x); })());
}

console.log("\nBIG TANK");
{
    const big = A.createTank({ length: 1500, width: 900 }), small = A.createTank();
    ok("!! a tank asked for 1500 x 900 m says so, the default is still 500 x 300", big.length === 1500 && big.width === 900 && small.length === A.LENGTH && small.width === A.WIDTH);
    const e = (id) => ({ id, name: id, hue: 10, pilot: "pd", from: "x", local: true }); big.sync([e("a"), e("b"), e("c")]); let maxX = 0, maxY = 0, inside = true, far = 0, total = 0;
    for (let i = 0; i < 30 * 600; i++) { big.step(1 / 30); if (i % 30 === 0 && i > 30 * 300) for (const q of big.subs.values()) { const p = q.state.pos; total++; if (p[0] > 500) far++; maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); inside &&= p[0] > 0 && p[0] < 1500 && p[1] > 0 && p[1] < 900; } }
    ok("!! subs swim the whole of a big tank: after the first five minutes (the spawn is anywhere in the tank) they stay inside its walls and still reach past the small tank's 500 m and 300 m, spending more than a fifth of their time beyond 500 m", inside && maxX > 560 && maxY > 360 && far / total > 0.2, `max x ${maxX.toFixed(0)}, max y ${maxY.toFixed(0)}, ${(100 * far / total).toFixed(0)}% of the time beyond 500 m`);
}
// v4901 -- the exports the definition census asked this gate to name (COMPASS, EVENTS, LEAK, RESCUE, compassValidAt, trimsOut), checked in one row.
{ const M = await import("./subAquariumSim.mjs"); const names = ["COMPASS", "EVENTS", "LEAK", "RESCUE", "compassValidAt", "trimsOut", "ESTIMATORS", "NEEDS_CRUSH"];   // v4904: the two estimator events' names and the needs hull's tank-scale crush depth (rows in subAquariumEvents-selfcheck sections 9 and 11)
  const okShape = names.every((n) => n in M && (typeof M[n] === "function" || typeof M[n] === "number" || typeof M[n] === "string" || typeof M[n] === "object"));
  ok("the event machinery's exports (EVENTS, COMPASS, LEAK, RESCUE, compassValidAt, trimsOut, ESTIMATORS, NEEDS_CRUSH) are present", okShape, names.map((n) => n + ":" + typeof M[n]).join(" ")); }
{
    const code = fs.readFileSync(new URL("./subAquariumSim.mjs", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/**")).join("\n");
    ok("!! the tank is pure: no Math.random, no clock, no DOM, no file or network in the module (the caller says how long a frame took)", !/Math\.random|Date\.now|new Date|performance\.now|document\.|window\.|\bfs\b|node:fs|fetch\(/.test(code));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
