// WebGLEngine/brain/subFleetNav-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subFleetNav-selfcheck.mjs      (about 30 s)
//
// A FLEET OF COURIERS (brain/subFleetNav.mjs), held to its word before HELD12 is flown ("FOLLOW-UP 12" in brain/SUB_FIELD_NAV_WIP.md):
//   1  THE CONSTANTS   arms, sizes, the registered numbers, the sets
//   2  THE OBSTACLE    a sub as a moving full-depth disc, its centre at a time, the sea's obstacles unchanged
//   3  THE STARTS      N starts in the box, clear of the sea, apart, deterministic
//   4  THE NAVIGATOR   with no other sub it IS the tank navigator (target for target over 600 ticks); with one it plans round it; the plans are counted
//   5  THE FLEET       sub contacts at known distances and depths, a new contact only after 1 s clear, errors, determinism, the record, a golden
//
// SABOTAGE LOG (serial mutation pass of brain/subFleetNav.mjs, one mutant per code line and operator, at most four of each operator on a line, two worktrees): 178 mutants; 126 red on the first pass and 52 survivors read one by one. The contact book was factored into `contactStep` and rows were added (the navigator's own hit counting with its 1 s clock, the gap-0 line, the way-back target on all four sides and ON the wall,
//   the contact book by hand, a sub lost above the water); the whole pass was run again on the new file: 181 mutants, 151 red, 30 survivors, all EQUIVALENT or NOT REACHED: seabed 1000 -> 1001 (the floor never touches a flight at depth); the default seed of a navigator (`seed = 1` -> 2; every caller passes one); the contact clock's initial value (a navigator not in contact never reads it);
//   the goal-draw check in routeFrom (a state index or an `<` against the unreachable sentinel BIG: the first candidate goal is routable on every sea of the gate, so the break fires at once either way) and the fallback goal after 200 failed draws (NOT REACHED: no sea of the gate exhausts them); `<` -> `<=` and the tries' bounds in goal and start draws on float ties and a tries count nothing reaches; the sub-group numbers (3000 + k: planShapes does not read a group);
//   `j <= k`, `a <= k`, `b <= k` over the live subs (the extra index reads an undefined `alive` and is skipped); the contact test's `<` -> `<=` on a float tie; the pair key (unique for fewer than 1000 subs either way); and `&&` for `||` on a pair with one lost sub (NOT REACHED: a lost sub's frozen position is never met by a live one in any gate run).
//   NOT CHECKED, said plainly: the generator takes at most four mutants of an operator on a line; the golden freezes what the two arms do on three seas at N = 4 for 60 s today and does not say it is right.
"use strict";
import * as F from "./subFleetNav.mjs";
import * as TN from "./subTankNav.mjs";
import * as H from "./subHardNav.mjs";
import * as N from "./subFieldNav.mjs";
import * as AP from "./autopilotSub.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pilot = (s, t, c) => AP.decide(s, t, c);
console.log("subFleetNav-selfcheck -- a fleet of couriers\n");

console.log("1. THE CONSTANTS");
{
    ok("!! the two arms (the tank's `any+predict` the reference, `fleet` designated) and the sizes 4 and 8", same(F.FLEET_ARMS, ["any+predict", "fleet"]) && F.REFERENCE === "any+predict" && F.DESIGNATED === "fleet" && same(F.SIZES, [4, 8]));
    ok("!! the registered numbers: 240 s, the sub 4 m radius (the half-hull), a contact under 8 m in plan and 5 m in depth", F.SECONDS_FLEET === 240 && F.SUB_RADIUS === 4 && F.SUB_RADIUS === N.HULL_HALF && F.CONTACT_XY === 8 && F.CONTACT_Z === 5);
    ok("!! the start box: x 60..440, y 60..240, 20 m clear of the sea, 50 m apart, 2.5 m/s", same(F.START, { xLo: 60, xHi: 440, yLo: 60, yHi: 240, clear: 20, apart: 50, speed: 2.5 }));
    ok("!! DEV is seeds 1 to 10; HELD12 is 1201 to 1230 (30 seas)", same(F.SETS.dev, N.range(1, 10)) && F.HELD12.length === 30 && F.HELD12[0] === 1201 && F.HELD12[29] === 1230 && F.SETS.held12 === F.HELD12);
}
console.log("\n2. THE OBSTACLE");
{
    const o = F.subObstacle({ x: 100, y: 50, vx: 2, vy: -1 }, 30, 3001);
    ok("!! a sub obstacle is a ship-typed full-depth disc of radius 4 with the observed state, the time seen and the group", o.type === "ship" && o.sub === true && o.x === 100 && o.y === 50 && o.vx === 2 && o.vy === -1 && o.t0 === 30 && o.r === 4 && o.keel === Infinity && o.group === 3001);
    ok("!! a sub is where it was seen plus its velocity times the time since: at t = 35 (5 s after t0 30) it is at (110, 45); at t = 30 where it was seen; before t0 it is back along its track", same(F.atFor(o, 35), [110, 45]) && same(F.atFor(o, 30), [100, 50]) && same(F.atFor(o, 25), [90, 55]));
    const sc = TN.tankScene(3), ship = sc.obstacles.find((x) => x.type === "ship"), isl = sc.obstacles.find((x) => x.type === "island");
    ok("!! the sea's obstacles are subTankNav.sceneAt's: a ship on its lane at t = 40, an island where it is", same(F.atFor(ship, 40), TN.sceneAt(ship, 40)) && same(F.atFor(isl, 40), [isl.x, isl.y]));
}
console.log("\n3. THE STARTS");
{
    const bad = [];
    for (let sd = 1; sd <= 10; sd++) for (const n of F.SIZES) {
        const sc = TN.tankScene(sd), st = F.fleetStarts(sc, n);
        const inBox = st.every((p) => p.x >= 60 && p.x <= 440 && p.y >= 60 && p.y <= 240 && p.depth >= 14 && p.depth <= 40 && p.heading >= -Math.PI && p.heading <= Math.PI);
        const clr = st.every((p) => sc.obstacles.every((o) => (o.lane ? N.segmentDistance(p.x, p.y, ...TN.laneSegment(o)) : Math.hypot(p.x - o.x, p.y - o.y)) >= o.r + 20));
        const apart = st.every((p, i) => st.every((q, j) => i === j || Math.hypot(p.x - q.x, p.y - q.y) >= 50));
        if (!(st.length === n && inBox && clr && apart)) bad.push(`${sd}/${n}`);
    }
    ok("!! on ten seas at N = 4 and 8 the starts number N, are in the box and the depth range, 20 m + r from every static disc and every lane, and 50 m apart", bad.length === 0, bad.join());
    const sc = TN.tankScene(4);
    ok("!! the starts are deterministic and differ by size and by sea", same(F.fleetStarts(sc, 4), F.fleetStarts(sc, 4)) && !same(F.fleetStarts(sc, 4)[0], F.fleetStarts(sc, 8)[0]) && !same(F.fleetStarts(sc, 4)[0], F.fleetStarts(TN.tankScene(5), 4)[0]));
}
console.log("\n4. THE NAVIGATOR");
{
    const sc = TN.tankScene(2), model = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })), st0 = F.fleetStarts(sc, 1)[0];
    let s = S.createState({ pos: [st0.x, st0.y, -st0.depth], speed: 2.5, heading: st0.heading, pitch: 0, bank: 0, gamma: 0, w: [0, 0, 0], model });
    const ref = TN.createNavigator(sc, { arm: "any+predict", seed: 77 }), fl = F.createFleetNavigator(sc, { seed: 77 });
    let identical = true, firstDiff = -1;
    for (let i = 0; i < 600; i++) {
        const t = i * S.DT, a = ref.step(s, t, S.DT), b = fl.step(s, t, S.DT);
        if (a.depth !== b.depth || a.heading !== b.heading || a.speed !== b.speed) { identical = false; firstDiff = i; break; }
        s = S.stepSub(model, s, pilot(s, a, [0, 0, 0]), S.DT, [0, 0, 0], 0).state;
    }
    ok("!! with no other sub the fleet navigator's target is the tank navigator's, tick for tick, over 600 ticks (20 s, several replans): depth, heading and speed all equal", identical, `first difference ${firstDiff}`);
    const rs = ref.snapshot(), fs = fl.snapshot();
    ok("!! and their goals, plan counts and travel agree (goal, replans, travel); the fleet navigator counts no no-route plans", same(rs.goal, fs.goal) && rs.replans === fs.replans && near(rs.travel, fs.travel, 1e-9) && fs.noRoutePlans === 0 && rs.arrivals === fs.arrivals && rs.hits === fs.hits, `${rs.replans} ${fs.replans}`);
    let calls = 0;
    const s2 = S.createState({ pos: [st0.x, st0.y, -st0.depth], speed: 2.5, heading: st0.heading, pitch: 0, bank: 0, gamma: 0, w: [0, 0, 0], model }), n2 = F.createFleetNavigator(sc, { seed: 77, others: () => { calls++; return []; } });
    n2.step(s2, 0, S.DT); n2.step(s2, S.DT, S.DT);
    ok("!! `others()` is read at a REPLAN only (the first step plans: one call; the next step, 1/30 s later, does not)", calls === 1);
    // a sub parked on the courier's line: the plan must go round it
    const goalOf = n2.snapshot().goal, dx = goalOf.x - st0.x, dy = goalOf.y - st0.y, L = Math.hypot(dx, dy), blocker = { x: st0.x + dx / L * 60, y: st0.y + dy / L * 60, vx: 0, vy: 0 };
    const a1 = F.createFleetNavigator(sc, { seed: 77 }), a2 = F.createFleetNavigator(sc, { seed: 77, others: () => [blocker] });
    const t1 = a1.step(s2, 0, S.DT), t2 = a2.step(s2, 0, S.DT);
    ok("!! a sub parked 60 m ahead on the courier's line changes the plan: the target heading differs from the one without it, and the plan counts one replan", Math.abs(t1.heading - t2.heading) > 1e-6 && a2.snapshot().replans === 1, `${t1.heading} ${t2.heading}`);
    const wall = []; for (let k = 0; k < 60; k++) wall.push({ x: st0.x + 40 * Math.cos(k * Math.PI / 30), y: st0.y + 40 * Math.sin(k * Math.PI / 30), vx: 0, vy: 0 });
    const a3 = F.createFleetNavigator(sc, { seed: 77, others: () => wall }), a4 = F.createFleetNavigator(sc, { seed: 77 }); a3.step(s2, 0, S.DT); a4.step(s2, 0, S.DT);
    ok("!! a ring of 60 subs 40 m round the courier closes every route: that plan is counted no-route (1) and the same plan with no ring is not (0)", a3.snapshot().noRoutePlans === 1 && a4.snapshot().noRoutePlans === 0, `${a3.snapshot().noRoutePlans} ${a4.snapshot().noRoutePlans}`);
}
{
    const sc = TN.tankScene(2), model = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })), isl = sc.obstacles.find((o) => o.type === "island" && o.keel === Infinity);
    const at = (x, y, d = 25) => S.createState({ pos: [x, y, -d], speed: 2.5, heading: 0, pitch: 0, bank: 0, gamma: 0, w: [0, 0, 0], model }), nav = F.createFleetNavigator(sc, { seed: 5 });
    const free = { x: 250, y: 150 };
    let free2 = null; for (let x = 60; x < 440 && !free2; x += 10) for (let y = 60; y < 240 && !free2; y += 10) if (sc.obstacles.every((o) => (o.lane ? N.segmentDistance(x, y, ...TN.laneSegment(o)) : Math.hypot(x - o.x, y - o.y)) > o.r + 60)) free2 = { x, y };
    let t = 0; const stepAt = (p, dt = 0.1) => { nav.step(at(p.x, p.y), t, dt); t += dt; return nav.snapshot().hits; };
    const h1 = stepAt({ x: isl.x, y: isl.y }), h2 = stepAt({ x: isl.x, y: isl.y });
    ok("!! the navigator counts a contact with the sea once (a sub on an island's centre: 1 hit, and the same position next tick is still 1)", h1 === 1 && h2 === 1, `${h1} ${h2}`);
    let h3 = h2; for (let i = 0; i < 5; i++) h3 = stepAt(free2);
    const h4 = stepAt({ x: isl.x, y: isl.y });
    ok("!! clear for only 0.5 s (five ticks of 0.1 s) it is still the same contact: back on the island is NOT a new hit (1)", h3 === 1 && h4 === 1, `${h3} ${h4}`);
    for (let i = 0; i < 12; i++) stepAt(free2);
    const h5 = stepAt({ x: isl.x, y: isl.y });
    ok("!! clear for 1.2 s it is over: back on the island is a NEW hit (2)", h5 === 2, `${h5}`);
    const navG = F.createFleetNavigator(sc, { seed: 5 }), gapOutside = isl.r + N.HULL_HALF + 0.5;
    navG.step(at(isl.x + gapOutside, isl.y), 0, 0.1);
    ok("!! a gap of 0.5 m outside an island is NOT a contact (gap under 0 only)", navG.snapshot().hits === 0);
    const out = (x, y) => F.createFleetNavigator(sc, { seed: 5 }).step(at(x, y), 0, 0.1);
    const o1 = out(-10, 150), o2 = out(510, 150), o3 = out(250, -10), o4 = out(250, 310), io = out(0, 150), io2 = out(500, 150), io3 = out(250, 0), io4 = out(250, 300);
    ok("!! outside the tank on any side the target is `back to the middle` at 2 m/s: heading atan2(-(150 - y), 250 - x) (the plan's convention), the goal's depth", [[o1, -10, 150], [o2, 510, 150], [o3, 250, -10], [o4, 250, 310]].every(([o, x, y]) => o.speed === 2 && near(o.heading, Math.atan2(-(150 - y), 250 - x), 1e-12)), JSON.stringify([o1, o2, o3, o4].map((o) => +o.heading.toFixed(3))));
    ok("!! ON the tank's wall (x = 0, x = 500, y = 0, y = 300) the sub is still inside: the plan's target, not the 2 m/s way back", [io, io2, io3, io4].every((o) => o.speed !== 2));
    ok("!! the way-back target carries the goal's own depth (within the tank's 14 to 40 m wander range)", o1.depth >= 14 && o1.depth <= 40 && o1.depth === o2.depth);
}
console.log("\n5. THE FLEET");
{
    const fly = (starts, seconds, arm = "any+predict") => safe(() => F.flyFleet(pilot, 1, starts.length, arm, { seconds, starts })) || { subContacts: -1 };
    ok("!! two subs 5 m apart at the same depth are in contact once (a new contact only after 1 s clear: ten seconds together still count one); 10 m apart: none", fly([{ x: 200, y: 150, depth: 25, heading: 0 }, { x: 205, y: 150, depth: 25, heading: 0 }], 10).subContacts === 1 && fly([{ x: 200, y: 150, depth: 25, heading: 0 }, { x: 210, y: 150, depth: 25, heading: 0 }], 1).subContacts === 0);
    ok("!! the depth criterion: 2 m apart in plan but 16 m apart in depth is NO contact; 5 m apart in plan and 3 m in depth IS one", fly([{ x: 200, y: 150, depth: 14, heading: 0 }, { x: 202, y: 150, depth: 30, heading: 0 }], 1).subContacts === 0 && fly([{ x: 200, y: 150, depth: 25, heading: 0 }, { x: 205, y: 150, depth: 28, heading: 0 }], 1).subContacts === 1);
    ok("!! the plan-view threshold is 8 m: 7 m apart (same depth) is a contact, 9 m is not", fly([{ x: 200, y: 150, depth: 25, heading: 0 }, { x: 207, y: 150, depth: 25, heading: 0 }], 1).subContacts === 1 && fly([{ x: 200, y: 150, depth: 25, heading: 0 }, { x: 209, y: 150, depth: 25, heading: 0 }], 1).subContacts === 0);
    ok("!! the depth threshold is 5 m: 4 m apart in depth (5 m in plan) is a contact, 6 m is not", fly([{ x: 200, y: 150, depth: 25, heading: 0 }, { x: 205, y: 150, depth: 29, heading: 0 }], 1).subContacts === 1 && fly([{ x: 200, y: 150, depth: 25, heading: 0 }, { x: 205, y: 150, depth: 31, heading: 0 }], 1).subContacts === 0);
    const cs = F.contactStep, ns = (st, near, dt) => safe(() => cs(st, near, dt));
    const a1 = ns({ active: false, clearFor: 0 }, true, 0.1), a2 = ns(a1.state, true, 0.1), a3 = ns(a2.state, false, 0.9), a4 = ns(a3.state, true, 0.1), a5 = ns(a4.state, false, 0.5), a6 = ns(a5.state, false, 0.5), a7 = ns(a6.state, true, 0.1);
    ok("!! the contact book: near starts one (a1), staying near does not (a2), 0.9 s apart is still the same contact and coming near again starts none (a3, a4), 0.5 + 0.5 s apart ends it (a6 inactive) and the next near starts a new one (a7); a pair that was never near starts nothing", !!a1 && a1.started === true && a2.started === false && a3.started === false && a3.state.active === true && near(a3.state.clearFor, 0.9) && a4.started === false && a4.state.clearFor === 0 && a5.state.active === true && a6.state.active === false && a7.started === true && ns({ active: false, clearFor: 0 }, false, 0.1).started === false);
    ok("!! the clock is exact: 0.99 s apart is still active, 1.0 s ends it (HIT_CLEAR_S = 1)", ns({ active: true, clearFor: 0 }, false, 0.99).state.active === true && ns({ active: true, clearFor: 0 }, false, 1.0).state.active === false);
    const lo = safe(() => F.flyFleet(pilot, 1, 2, "any+predict", { seconds: 3, starts: [{ x: 200, y: 150, depth: -10, heading: 0 }, { x: 300, y: 150, depth: 25, heading: 0 }] }));
    ok("!! a sub that broaches is LOST (a sub started 10 m above the water: lost 1) and the other keeps flying (travel > 0)", !!lo && lo.lost === 1 && lo.travel > 1, JSON.stringify(lo && [lo.lost, lo.travel]));
    const r = safe(() => F.flyFleet(pilot, 2, 4, "fleet", { seconds: 20 }));
    ok("!! the record: arm, seed, n 4, subs 4, plans at least 4 (each sub plans at once), arrivals and sea hits counts, travel positive, lost 0, noRoutePlans a count", !!r && r.arm === "fleet" && r.seed === 2 && r.n === 4 && r.subs === 4 && r.plans >= 4 && r.travel > 100 && r.lost === 0 && Number.isInteger(r.noRoutePlans) && Number.isInteger(r.seaHits) && Number.isInteger(r.arrivals) && Number.isInteger(r.subContacts));
    ok("!! a fleet run is deterministic; an unknown arm throws, naming the arms", same(safe(() => F.flyFleet(pilot, 2, 4, "fleet", { seconds: 20 })), r) && (() => { try { F.flyFleet(pilot, 2, 4, "any+nothing", { seconds: 1 }); return false; } catch (e) { return /any\+predict, fleet/.test(e.message); } })());
    const rr = safe(() => F.flyFleet(pilot, 2, 4, "any+predict", { seconds: 20 }));
    ok("!! the reference arm counts no no-route plans (it has none to count) and its plans are the tank navigator's", !!rr && rr.noRoutePlans === 0 && rr.plans >= 4);
    const gold = F.FLEET_ARMS.map((arm) => { const rs = [1, 2, 3].map((sd) => F.flyFleet(pilot, sd, 4, arm, { seconds: 60 })); return ["subContacts", "seaHits", "arrivals", "plans", "noRoutePlans", "lost"].map((k) => rs.reduce((a, x) => a + x[k], 0)).concat([Math.round(rs.reduce((a, x) => a + x.travel, 0))]); });
    ok("!! GOLDEN (a regression snapshot of this module's own runs on three seas at N = 4 for 60 s, not a hand derivation; a change detector): per arm the summed sub contacts, sea hits, arrivals, plans, no-route plans, lost and travel (m)", same(gold, [[0, 2, 1, 241, 0, 0, 2049], [0, 2, 0, 240, 31, 0, 2034]]), JSON.stringify(gold));
}
console.log(fails === 0 ? "\nall checks pass" : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
