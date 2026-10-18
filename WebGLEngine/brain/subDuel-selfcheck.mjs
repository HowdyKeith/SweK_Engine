// WebGLEngine/brain/subDuel-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subDuel-selfcheck.mjs      (~20 s)
//
// THE ARENA HELD TO ITS RULES. brain/subDuel.mjs fights two boats with sonar and torpedoes; this gate holds the ARENA, not the tactician: spy tacticians record exactly what a boat is told, scripted ones do exactly what the
// row needs, and every number is recomputed here.
//   1  SCENARIOS   deterministic and frozen; the drone 250..450 m away within 60 degrees of the nose; depths in range; the quiet drone at 0.5 m/s; a bad kind refused
//   2  THE LOOKS   a boat decides every 15th tick, A at 7 + 15k and B at 14 + 15k (the stagger), so 120 looks a minute; the clock in the observation is the tick
//   3  THE OBSERVATION  contacts carry kind, bearing, elevation, snr and NO RANGE; echoes carry a range; pings heard carry a bearing and nothing else; the gauges are the boat's own
//   4  PINGS       an echo is computed when the ping is sent and arrives at the pinger's NEXT look, with a range within 20 m of the truth; the other boat hears the ping at ITS next look; both are counted
//   5  FIRING      four torpedoes, a 10-second reload, along the nose; the ammo and the tube are visible to the tactician; a fire order with no torpedo or no ready tube does nothing
//   6  DAMAGE      a torpedo that hits takes hit points off; at zero the boat is sunk AT ONCE and the duel ends that tick; the score is (dealt - taken)/100 + 0.5 for the kill + 0.5 x the fraction of the four minutes left
//                  (recomputed here to 1e-12); a boat that is hit loses (-1.5 when it dies having dealt nothing); the owner's own torpedoes never touch it
//   7  LOSSES      a boat that drives into the floor is lost (-0.5), and the duel ends; nobody firing for four minutes is a draw of score 0
//   8  THE OPTIONS actuators: INSTANT rates are bit-for-bit none, the real rates change the duel; an `opponent` replaces the drone; a duel is deterministic
//   9  THE SETS    disjoint, 24 / 24 / 24 / 32, frozen; the hand tactician's score is PINNED on TRAIN, HELD_OUT and BASELINE
//
// SABOTAGE LOG -- (filled in below once the sabotage runs are done).
"use strict";
import * as D from "./subDuel.mjs";
import * as TA from "./subTactics.mjs";
import * as AS from "./autopilotSub.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as K from "../physics/mechanics/subSonar.mjs";
import { ACTUATORS, INSTANT } from "../physics/mechanics/subActuators.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const total = (secs) => Math.round(secs / D.DT);
// a hand-made scenario: A at the origin heading 0 at depth 26; B at (x, y) with the given depth, heading and speed
const sc = (b = {}, o = {}) => Object.freeze({ seed: o.seed ?? 3, kind: o.kind ?? "quiet", a: Object.freeze({ depth: 26, heading: 0, speed: 2, ...(o.a || {}) }), b: Object.freeze({ pos: b.pos ?? [300, 0], depth: b.depth ?? 26, heading: b.heading ?? Math.PI / 2, speed: b.speed ?? 0.5 }), drift: 0 });
const hold = (extra = {}) => (obs) => ({ depth: obs.self.depth, heading: obs.self.heading, speed: 2, fire: false, ping: false, ...extra });
const spy = (decide) => { const log = []; const f = (obs) => { log.push(obs); return decide(obs, log.length - 1); }; f.log = log; return f; };
const side = (tactics, pilot = AS.pilot()) => ({ tactics, pilot });

console.log("subDuel-selfcheck -- the submarine duel\n");

console.log("1. SCENARIOS");
{
    const a = D.scenario(7, "evader"), b = D.scenario(7, "evader"), c = D.scenario(8, "evader");
    ok("!! a kind and a seed make the same scenario; another seed makes another; frozen all the way down", JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c) && Object.isFrozen(a) && Object.isFrozen(a.a) && Object.isFrozen(a.b) && Object.isFrozen(a.b.pos));
    let lo = Infinity, hi = 0, worst = 0, dOk = true, qOk = true;
    for (let s = 1; s <= 200; s++) for (const k of D.KINDS) { const x = D.scenario(s, k), r = Math.hypot(x.b.pos[0], x.b.pos[1]), br = Math.atan2(-x.b.pos[1], x.b.pos[0]); lo = Math.min(lo, r); hi = Math.max(hi, r); worst = Math.max(worst, Math.abs(br)); if (x.a.depth < 20 || x.a.depth > 32 || x.b.depth < 15 || x.b.depth > 40) dOk = false; if ((k === "quiet") !== (x.b.speed === 0.5)) qOk = false; }
    ok("!! over 800 scenarios the drone starts 250..450 m away within 1.05 rad (60 degrees) of A's nose, A at 20..32 m and B at 15..40 m, and only the quiet drone is at 0.5 m/s", lo >= 250 && hi <= 450 && worst <= 1.05 + 1e-9 && dOk && qOk, `${lo.toFixed(0)}..${hi.toFixed(0)} m, ${worst.toFixed(3)} rad`);
    let msg = null; try { D.scenario(1, "kraken"); } catch (e) { msg = e.message; }
    ok("a kind that is not patrol / quiet / evader / hunter is refused, by name", msg && /kraken/.test(msg) && /hunter/.test(msg), msg);
}

console.log("\n2. THE LOOKS");
{
    const A = spy(hold()), B = spy(hold()); D.duel(side(A), sc(), { seconds: 60, opponent: side(B) });
    const ta = A.log.map((o) => Math.round(o.t / D.DT)), tb = B.log.map((o) => Math.round(o.t / D.DT));
    ok("!! A decides at ticks 8, 23, 38, ... (tick + 7 divisible by 15) and B at 1, 16, 31, ... (tick + 14): 120 looks a minute each, every 0.5 s, and obs.t is the tick x dt", ta[0] === 8 && tb[0] === 1 && ta.every((t, i) => t === 8 + 15 * i) && tb.every((t, i) => t === 1 + 15 * i) && ta.length === 120 && tb.length === 120 && near(A.log[0].t, 8 * D.DT), `${ta.slice(0, 3)} / ${tb.slice(0, 3)} / ${ta.length}`);
}

console.log("\n3. THE OBSERVATION");
{
    const A = spy(hold()); D.duel(side(A), sc({ pos: [150, 0], speed: 2, heading: Math.PI }), { seconds: 30 });
    const o = A.log[0], withContact = A.log.find((x) => x.contacts.length);
    ok("!! the gauges are the boat's own: depth 26, heading 0, speed ~2, position (0, 0) at the start, 100 hp, 4 torpedoes, the tube ready; and an observation has exactly the fields t, self, contacts, echoes, pings", Object.keys(o).sort().join() === "contacts,echoes,pings,self,t" && near(o.self.depth, 26, 0.1) && Math.abs(o.self.heading) < 0.05 && Math.abs(o.self.speed - 2) < 0.2 && Math.abs(o.self.x) < 1 && o.self.hp === 100 && o.self.ammo === 4 && o.self.ready === true, JSON.stringify(o.self));
    ok("!! a passive contact has exactly kind, bearing, elevation, snr and NO RANGE; the boat 150 m ahead is a 'boat' within 0.3 rad of the nose", withContact && Object.keys(withContact.contacts[0]).sort().join() === "bearing,elevation,kind,snr" && withContact.contacts[0].kind === "boat" && Math.abs(withContact.contacts[0].bearing) < 0.3, JSON.stringify(withContact && withContact.contacts[0]));
}

console.log("\n4. PINGS");
{
    const A = spy((obs, i) => ({ depth: obs.self.depth, heading: obs.self.heading, speed: 2, fire: false, ping: i === 0 })), B = spy(hold());
    const r = D.duel(side(A), sc({ pos: [200, 0] }), { seconds: 12, opponent: side(B) });
    const e = A.log[1].echoes, heard = B.log.filter((x) => x.pings.length);
    ok("!! an echo is computed at the ping and ARRIVES AT THE PINGER'S NEXT LOOK (A's look 1, 15 ticks on), with exactly bearing, elevation and range, the range within 20 m of the 200 m truth; the look after has none (it is drained)", A.log[0].echoes.length === 0 && e.length === 1 && Object.keys(e[0]).sort().join() === "bearing,elevation,range" && Math.abs(e[0].range - 200) < 20 && A.log[2].echoes.length === 0, JSON.stringify(e));
    ok("!! the OTHER boat hears the ping at ITS next look (tick 16): one ping with a bearing and nothing else, in [-pi, pi]; it is not told again; and the pinger's count is 1, the listener's 0", heard.length === 1 && Math.round(heard[0].t / D.DT) === 16 && Object.keys(heard[0].pings[0]).join() === "bearing" && r.pings[0] === 1 && r.pings[1] === 0 && r.events.filter((x) => x.type === "ping").length === 1, JSON.stringify(heard.map((x) => x.pings)));
    const none = spy((obs, i) => ({ depth: obs.self.depth, heading: obs.self.heading, speed: 2, ping: i === 0 })), far = D.duel(side(none), sc({ pos: [800, 0] }), { seconds: 12 });
    ok("a ping into an empty sea (the drone 800 m off, beyond the echo's 392 m) comes back with NO echo, though the ping is counted", none.log[1].echoes.length === 0 && far.pings[0] === 1);
}

console.log("\n5. FIRING");
{
    const A = spy(hold({ fire: true })), r = D.duel(side(A), sc({ pos: [-400, 0] }), { seconds: 240 }), fires = r.events.filter((x) => x.type === "fire" && x.boat === 1).map((x) => x.tick);
    ok("!! a boat that orders fire at every look launches exactly FOUR torpedoes in 240 s (the magazine), the first at its first look (tick 8) and every later one at least 300 ticks (10 s) after the one before", r.fired[0] === 4 && fires.length === 4 && fires[0] === 8 && fires.every((t, i) => i === 0 || t - fires[i - 1] >= 300) && fires[1] - fires[0] < 330, `${fires}`);
    const ammo = A.log.map((o) => [o.self.ammo, o.self.ready]);
    ok("!! the tactician SEES the magazine and the tube: ammo 4 and ready at the first look, ammo 3 and NOT ready at the next, ready again 10 s later with 3 left", ammo[0][0] === 4 && ammo[0][1] && ammo[1][0] === 3 && !ammo[1][1] && ammo.find((x) => x[0] === 3 && x[1]) !== undefined);
    const short = D.duel(side(hold({ fire: true })), sc({ pos: [-400, 0] }), { seconds: 20 });
    ok("a 20-second duel with fire ordered at every look fires TWICE (tick 8 and the reload at 308): the reload is real", short.fired[0] === 2);
    const none = D.duel(side(hold({ fire: false })), sc(), { seconds: 30 });
    ok("a boat that never orders fire fires nothing", none.fired[0] === 0 && none.events.filter((x) => x.type === "fire").length === 0);
}

console.log("\n6. DAMAGE");
{
    const kill = D.duel(side(hold({ fire: true })), sc({ pos: [120, 0], speed: 0.5 }), { seconds: 240 }), n = total(240);
    const hit = kill.events.find((x) => x.type === "hit"), sunk = kill.events.find((x) => x.type === "loss" && x.boat === 2);
    ok("!! a torpedo fired along the nose at a drone 120 m dead ahead HITS, takes its hit points off, SINKS it the tick the hit points reach zero, and the duel ENDS that tick (fewer ticks than the four minutes)", hit && hit.boat === 1 && hit.target === 2 && sunk && sunk.why === "sunk" && sunk.tick === hit.tick && kill.winner === "A" && kill.fates[1] === "sunk" && kill.hp[1] === 0 && kill.ticks < n && kill.ticks === hit.tick + 1, `${JSON.stringify(hit)} ticks ${kill.ticks}`);
    const bonus = 0.5 * (1 - kill.ticks / n), expect = kill.damage[0] / 100 + 0.5 + bonus;
    ok("!! the score is EXACTLY (dealt - taken)/100 + 0.5 for the kill + 0.5 x (1 - ticks/total) for the speed: recomputed here to 1e-12 (dealt capped at the hit points that were left)", near(kill.score, expect, 1e-12) && kill.damage[0] <= 100 && kill.damage[0] > 0 && kill.damage[1] === 0, `${kill.score.toFixed(6)} vs ${expect.toFixed(6)}; dealt ${kill.damage[0].toFixed(1)}`);
    const early = D.duel(side(hold({ fire: true })), sc({ pos: [120, 0], speed: 0.5 }), { seconds: 240 }), late = D.duel(side(hold({ fire: true })), sc({ pos: [300, 0], speed: 0.5 }), { seconds: 240 });
    ok("!! a FASTER kill scores more: the same drone at 120 m sinks sooner than at 300 m and scores higher (the speed bonus), both won", early.winner === "A" && late.winner === "A" && early.ticks < late.ticks && early.score > late.score, `${early.ticks} ticks ${early.score.toFixed(3)} vs ${late.ticks} ticks ${late.score.toFixed(3)}`);
    // the drone shoots back: B fires along its nose at A 100 m away and facing it
    const dead = D.duel(side(hold()), sc({ pos: [100, 0], heading: Math.PI, speed: 2 }), { seconds: 240, opponent: side(hold({ fire: true })) });
    ok("!! a boat that is shot is the loser: A sits still, B fires along its nose from 100 m: A is SUNK, B wins, nobody else's torpedo was needed; A dealt nothing so the score is -(damage taken)/100 - 0.5 exactly (-1.5 for a clean kill)", dead.winner === "B" && dead.fates[0] === "sunk" && dead.hp[0] === 0 && dead.damage[0] === 0 && near(dead.score, -dead.damage[1] / 100 - 0.5, 1e-12) && dead.damage[1] <= 100 && dead.damage[1] > 0, `${dead.score.toFixed(4)} damage ${dead.damage[1].toFixed(1)}`);
    const own = D.duel(side(hold({ fire: true })), sc({ pos: [450, 0], heading: 0 }), { seconds: 240 });
    ok("!! the OWNER's torpedoes never touch the owner: A fires all four (the drone far off) and finishes with 100 hit points and afloat", own.fired[0] === 4 && own.hp[0] === 100 && own.fates[0] === "afloat" && own.damage[1] === 0);
}

console.log("\n7. LOSSES");
{
    const sink = D.duel(side(hold(), (st, tg, cv) => ({ ballast: 1, thrust: 0 })), sc({ pos: [-400, 0], heading: 0 }), { seconds: 240 }), n = total(240);
    ok("!! a boat that floods its tank and drives into the FLOOR is lost ('grounded'): the duel ends that tick, B (untouched) wins, and the score is exactly -0.5 (a loss, no torpedo involved)", sink.fates[0] === "grounded" && sink.winner === "B" && sink.ticks < n && sink.damage[0] === 0 && sink.damage[1] === 0 && near(sink.score, -0.5, 1e-12) && sink.events.some((x) => x.type === "loss" && x.boat === 1 && x.why === "grounded"), `${sink.fates} ${sink.score}`);
    const draw = D.duel(side(hold()), sc({ pos: [-440, 0], heading: 0 }), { seconds: 120 });
    ok("!! nobody fires: the duel runs the whole time and is a DRAW of score exactly 0 (both afloat, no events but none)", draw.winner === "draw" && draw.ticks === total(120) && draw.score === 0 && draw.fates.join() === "afloat,afloat" && draw.fired.join() === "0,0");
}

console.log("\n8. THE OPTIONS");
{
    const a = D.duel(D.sideHand()(), D.scenario(4, "patrol")), b = D.duel(D.sideHand()(), D.scenario(4, "patrol"));
    ok("!! a duel is deterministic: the same side and scenario give the same score, fingerprint and events", a.score === b.score && a.fingerprint === b.fingerprint && JSON.stringify(a.events) === JSON.stringify(b.events) && /^[0-9a-f]+$/.test(a.fingerprint), a.fingerprint);
    const i = D.duel(D.sideHand()(), D.scenario(4, "patrol"), { actuators: INSTANT }), r = D.duel(D.sideHand()(), D.scenario(4, "patrol"), { actuators: ACTUATORS });
    ok("!! with INSTANT rates a duel is bit-for-bit the duel with no actuators; with the real rates it is a different duel", i.fingerprint === a.fingerprint && i.score === a.score && r.fingerprint !== a.fingerprint);
    const O = spy(hold()); D.duel(side(hold()), D.scenario(4, "patrol"), { seconds: 10, opponent: side(O) });
    ok("an `opponent` REPLACES the drone: its tactician gets the looks (here 20 in 10 s) instead of the patrol script", O.log.length === 20 && O.log[0].self.ammo === 4);
}

console.log("\n9. THE SETS");
{
    const keys = (x) => x.map((s) => `${s.kind}:${s.seed}`), sets = { TRAIN_SET: D.TRAIN_SET, HELD_OUT_SET: D.HELD_OUT_SET, BASELINE_SET: D.BASELINE_SET, AUDIT_SET: D.AUDIT_SET }, names = Object.keys(sets);
    let overlap = 0; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { const b = new Set(keys(sets[names[j]])); overlap += keys(sets[names[i]]).filter((k) => b.has(k)).length; }
    ok("!! the four sets are disjoint by kind and seed, 24 / 24 / 24 / 32, frozen", overlap === 0 && D.TRAIN_SET.length === 24 && D.HELD_OUT_SET.length === 24 && D.BASELINE_SET.length === 24 && D.AUDIT_SET.length === 32 && names.every((n) => Object.isFrozen(sets[n])));
    const ev = (set) => D.evaluate(D.sideHand(), set), tr = ev(D.TRAIN_SET), ho = ev(D.HELD_OUT_SET), bl = ev(D.BASELINE_SET), pin = (r, v) => Math.abs(r.score - v) <= 5e-4;
    ok("!! the HAND TACTICIAN's score is PINNED on TRAIN, HELD_OUT and BASELINE (it moves when the arena, the sonar, the torpedo or the tactician moves -- that is the point of pinning it)", pin(tr, 0.9977) && pin(ho, 1.3072) && pin(bl, 0.8150), `${tr.score.toFixed(4)} ${ho.score.toFixed(4)} ${bl.score.toFixed(4)}`);
    ok("evaluate() counts wins, losses and draws (they sum to the set), and describeEval quotes the four kinds and the W/L/D", tr.wins + tr.losses + tr.draws === 24 && /hunter/.test(D.describeEval(tr)) && /W .* L .* D/.test(D.describeEval(tr)));
    // AUDIT_SET is deliberately NOT evaluated here: it is for a champion, once.
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
