// WebGLEngine/brain/subStationsNavSonar-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). Run: node brain/subStationsNavSonar-selfcheck.mjs
//
// THE GATE OF NAVIGATION AND SONAR AS STATIONS (brain/subStations.mjs navigationStation, sonarStation, duelSide; brain/SUB_STATIONS_WIP.md section 11).
//   1  the parts refuse what they cannot use, by name; the sonar priority sits between navigation and energy
//   2  NAVIGATION ALONE IS THE TANK'S COURIER, BIT FOR BIT: brain/subTankNav.mjs's navigator flown by the bare pilot and the same navigator as the only station, every command of 240 s compared, and the counters the same
//   3  the navigator is STEPPED every tick whoever has the con: under an energy claim its goal and travel still move with the boat
//   4  SONAR ALONE IS THE DUEL'S SIDE, BIT FOR BIT: brain/subDuel.mjs's duel with the plain side and with duelSide, whole results compared (the fingerprint, every event)
//   5  THE FIRST SONAR CONFLICT (pinned, not a rate): on a 12 % battery, the fixed ranking's energy claim outranks sonar and breaks off the fight -- fewer duels won and a lower score than sonar alone, though no more lost
// Uses the duel's TRAIN_SET only (its AUDIT_SET is marked unread).
// SABOTAGED -- 14 mutants of brain/subStations.mjs, each alone in place and restored, EVERY ONE RED BY NAME (final pass): N01 no navigator refusal | N02 no clock refusal | N03 the clock frozen at 0 | N04 the avoid flag never passed |
//   N05 navigation at the mission's priority | N06 the navigator not asked once outranked (the captain's every-station contract) | S01 sonar claiming before its first look | S02 sonar handing out its own target | S03 sonar above energy |
//   S04 the duel's target not held | S05 the duel side dropping its extra stations | S06 no duel-side refusal | S07 the duel side's log lost | S08 the tactician's fire suppressed.
// THREE WENT 0 RED ON THE FIRST PASS AND GOT ONE ROW: N04, N05 and N06 (every row used the default fleet, put the navigator alone or FIRST in the list): a spy navigator listed after a higher station and beside a lower one, with a
//   fleet and a flag of its own. N04 stayed green once more because the spy's flag was false, the value the mutant hard-codes; it is a distinctive value now.
// AND THE GATE FOUND A BUG IN THE CODE BEFORE ANY MUTANT RAN: the sonar station handed out the target it holds, not a copy, so a station downstream editing the claim would have changed the sonar's own target. Fixed ({ ...held }); S02 is its mutant.
// AND A ROW OF MINE CLAIMED TOO MUCH: section 5 first said the charge the energy station went up for "was not needed". Measured: alone, 11 of the 24 boats run their battery flat at 12 %. What is true is that running flat cost them
//   nothing the duel's score counts (15 / 2 / 7 either way), while going up cost 8 wins; the row says that now.
"use strict";
import * as SS from "./subStations.mjs";
import * as TN from "./subTankNav.mjs";
import * as AS from "./autopilotSub.mjs";
import * as D from "./subDuel.mjs";
import * as TA from "./subTactics.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as N from "../physics/mechanics/subNeeds.mjs";

let fails = 0, finished = false;
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const guarded = (name, f) => { try { f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.stack) || e).split("\n").slice(0, 2).join(" | ").slice(0, 300)); } };
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = JSON.stringify;
console.log("subStationsNavSonar-selfcheck -- navigation and sonar as stations\n");
const model = S.createSubModel(S.EXPLORER), DT = S.DT, scene = TN.tankScene(7);

sec("1. the parts");
guarded("section 1", () => {
    const nav = TN.createNavigator(scene, { seed: 1 });
    const bad = [["a navigation station with no navigator", () => SS.navigationStation(null, { clock: () => 0, dt: DT }), /navigationStation: a navigator \(with step\) is needed/],
        ["a navigation station with no clock", () => SS.navigationStation(nav, { dt: DT }), /a clock\(\) and a tick length dt are needed/], ["a navigation station with no dt", () => SS.navigationStation(nav, { clock: () => 0 }), /a clock\(\) and a tick length dt are needed/],
        ["a duel side with no tactician", () => SS.duelSide({ helm: AS.pilot() }), /duelSide: a tactician and a helm are needed/], ["a duel side with no helm", () => SS.duelSide({ tactics: () => ({}) }), /duelSide: a tactician and a helm are needed/]];
    for (const [what, f, re] of bad) { const e = throws(f); ok(`refuses ${what}, by name`, e !== null && re.test(e), e || "did not throw"); }
    ok("the sonar priority sits above navigation and below energy and damage control", SS.PRIORITY.navigation < SS.PRIORITY.sonar && SS.PRIORITY.sonar < SS.PRIORITY.energy && SS.PRIORITY.energy < SS.PRIORITY.damage, J(SS.PRIORITY));
    const so = SS.sonarStation(), st = S.createState({ depth: 20, speed: 2, model });
    const p0 = so.propose({ state: st }); so.hold({ depth: 30, heading: 1, speed: 3 }); const p1 = so.propose({ state: st }); const held = p1.claim; held.depth = 99; const p2 = so.propose({ state: st }); so.hold(null);
    ok("the sonar station claims nothing before its first look, then the target it holds (a copy: changing a claim changes nothing), at the sonar priority, and nothing again once cleared", p0.claim === null && p1.reason === "sonar: the tactician's target" && p2.claim.depth === 30 && so.propose({ state: st }).claim === null && so.priority === SS.PRIORITY.sonar && so.kind === "target" && so.name === "sonar");
});

sec("2. navigation alone is the tank's courier, bit for bit");
const navFly = (useStation, more = null, seconds = 240) => {
    const nav = TN.createNavigator(scene, { arm: "any+predict", seed: 11 }), pilot = AS.pilot(); let s = S.createState({ depth: 20, speed: 2, model, pos: [60, 60, -20] }), t = 0; const out = [];
    const cap = SS.captain({ helm: pilot, stations: [SS.navigationStation(nav, { clock: () => t, dt: DT }), ...(more ? [more] : [])] });
    for (let i = 0; i < Math.round(seconds / DT); i++) { const c = useStation ? cap(s, { depth: 20, heading: 0, speed: 2 }, [0, 0, 0]) : pilot(s, nav.step(s, t, DT, null, true), [0, 0, 0]); out.push(J(c)); s = S.stepSub(model, s, c, DT).state; t += DT; }
    return { out, snap: nav.snapshot(), cap, s };
};
guarded("section 2", () => {
    const a = navFly(false), b = navFly(true); let d = -1; for (let i = 0; i < Math.max(a.out.length, b.out.length); i++) if (a.out[i] !== b.out[i]) { d = i; break; }
    ok("every command of 240 s identical: the navigator as the only station IS the courier", d === -1 && a.out.length === 7200, d === -1 ? "" : `first difference at tick ${d}`);
    ok("...on a run where the navigator works: it arrives (3 goals) and its counters are the same both ways", a.snap.arrivals >= 2 && J(a.snap) === J(b.snap), `arrivals ${a.snap.arrivals}, hits ${a.snap.hits}`);
    ok("the navigation station had the con every tick, with its reason", b.cap.watch.con.navigation === 7200 && b.cap.log.con === "navigation" && b.cap.log.reason === "navigation: to the goal");
});

sec("3. the navigator is stepped whoever has the con");
guarded("section 3", () => {
    const always = SS.targetStation("energy", (s, t) => ({ ...t, depth: 5 }), { priority: SS.PRIORITY.energy });
    const r = navFly(true, always, 60);
    ok("under a higher claim for the whole run, the navigator is still stepped every tick (its clock reached the last tick, and it counted the boat's travel)", r.cap.watch.con.energy === 1800 && r.cap.watch.con.navigation === 0 && Math.abs(r.snap.t - (1799 * DT)) < 1e-9 && r.snap.travel > 20, J({ t: r.snap.t, travel: r.snap.travel }));
    ok("...and the boat flew the higher claim (it rose toward 5 m)", -r.s.pos[2] < 12, (-r.s.pos[2]).toFixed(2));
    // a SPY navigator, listed AFTER a higher station, and beside a lower one: what it is handed, and who wins
    const calls = []; const spyNav = { step: (...args) => { calls.push(args); return { depth: 18, heading: 0.5, speed: 2 }; } }, fleet = [{ id: "x" }];
    const high = SS.targetStation("high", (st, t) => ({ ...t, depth: 3 }), { priority: SS.PRIORITY.energy }), low = SS.targetStation("low", (st, t) => ({ ...t, depth: 40 }), { priority: 5 });
    const nav = SS.navigationStation(spyNav, { clock: () => 12.5, dt: DT, fleet: () => fleet, avoidFleet: () => "as-given" }), st0 = S.createState({ depth: 20, speed: 2, model });
    const capHigh = SS.captain({ helm: AS.pilot(), stations: [high, nav] }); capHigh(st0, { depth: 20, heading: 0, speed: 2 });
    ok("listed AFTER a higher claim, the navigator is still asked, with the boat's state, the clock, the tick, the fleet and the avoid flag it was given", calls.length === 1 && calls[0][0] === st0 && calls[0][1] === 12.5 && calls[0][2] === DT && calls[0][3] === fleet && calls[0][4] === "as-given" && capHigh.log.con === "high", J(calls.map((c) => c.slice(1))));
    const capLow = SS.captain({ helm: AS.pilot(), stations: [low, nav] }); capLow(st0, { depth: 20, heading: 0, speed: 2 });
    ok("navigation OUTRANKS a station below its priority (5): it has the con, at PRIORITY.navigation", capLow.log.con === "navigation" && capLow.log.flown.depth === 18 && nav.priority === SS.PRIORITY.navigation, capLow.log.con);
});

sec("4. sonar alone is the duel's side, bit for bit");
guarded("section 4", () => {
    const res = D.TRAIN_SET.slice(0, 3).map((sc) => [D.duel(D.sideHand()(), sc), D.duel(SS.duelSide({ tactics: TA.makeTactician(TA.THETA_DEFAULT), helm: AS.pilot() }), sc)]);
    ok("three whole duels identical, result for result (the fingerprint, the events, the score)", res.every(([a, b]) => J(a) === J(b)), res.map(([a, b]) => (J(a) === J(b) ? "same" : `${a.fingerprint} / ${b.fingerprint}`)).join(" "));
    ok("...duels in which the side fights: it fires and hits", res.every(([a]) => a.fired[0] > 0) && res.some(([a]) => a.hits[0] > 0), J(res.map(([a]) => [a.fired[0], a.hits[0]])));
    const side = SS.duelSide({ tactics: TA.makeTactician(TA.THETA_DEFAULT), helm: AS.pilot() }); D.duel(side, D.TRAIN_SET[0]);
    ok("the duel side's captain logged the sonar station with the con", side.pilot.log.con === "sonar" && side.pilot.watch.con.sonar > 1000 && side.pilot.watch.con.mission === 0, J(side.pilot.watch));
});

sec("5. the first sonar conflict (pinned, not a rate)");
guarded("section 5", () => {
    // the 24 TRAINING duels at 12 % of the battery: the energy station reads the charge the duel hands the tactician at each look (obs.self.charge, a fraction of the start)
    const frac = 0.12;
    const run = (withEnergy) => D.TRAIN_SET.map((sc) => {
        let last = null; const base = TA.makeTactician(TA.THETA_DEFAULT), tactics = (obs) => { last = obs.self; return base(obs); };
        const read = () => ({ frac: last && Number.isFinite(last.charge) ? last.charge * frac : frac, depth: last ? last.depth : 20, refills: true, refillDepth: 0.7, flood: 0, damage: 0 });
        const side = SS.duelSide({ tactics, helm: SS.helmOf(AS.pilot()), more: () => (withEnergy ? [SS.energyStation({ read })] : []) });
        return { r: D.duel(side, sc, { needs: { cls: "battery", energyJ: N.CLASSES.battery.capacityJ * frac } }), watch: side.pilot.watch };
    });
    const alone = run(false), both = run(true), count = (xs, w) => xs.filter((x) => x.r.winner === w).length, mean = (xs) => xs.reduce((a, x) => a + x.r.score, 0) / xs.length, flat = (xs) => xs.filter((x) => x.r.charge[0] <= 0).length;
    console.log(`    24 training duels at 12 % charge: sonar alone W/L/D ${count(alone, "A")}/${count(alone, "B")}/${count(alone, "draw")}, mean ${mean(alone).toFixed(3)}, ${flat(alone)} ran flat; sonar + energy W/L/D ${count(both, "A")}/${count(both, "B")}/${count(both, "draw")}, mean ${mean(both).toFixed(3)}, ${flat(both)} ran flat`);
    ok("THE ENERGY CLAIM OUTRANKS SONAR AND BREAKS OFF THE FIGHT: with the energy station aboard the side wins fewer duels and scores less, and in every duel energy held the con for a while", count(both, "A") < count(alone, "A") && mean(both) < mean(alone) - 0.2 && both.every((x) => x.watch.con.energy > 0), `${count(both, "A")} against ${count(alone, "A")} won`);
    ok("THE TRADE, BOTH WAYS: alone, boats DO run flat (the charge was spent fighting), and the energy crew loses no MORE duels than alone -- it trades wins for draws, which the duel's score counts against it", flat(alone) >= 5 && count(both, "B") <= count(alone, "B"), `alone ${flat(alone)} flat and ${count(alone, "B")} lost; with energy ${count(both, "B")} lost`);
});

finished = true;
console.log(fails ? `\nsubStationsNavSonar-selfcheck: ${fails} FAILED` : "\nsubStationsNavSonar-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
