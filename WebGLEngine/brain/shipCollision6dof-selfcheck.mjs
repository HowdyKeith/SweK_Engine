// WebGLEngine/brain/shipCollision6dof-selfcheck.mjs -- v4848
//
// THE GATE FOR brain/shipCollision6dof.mjs AND FOR WHAT THE DUEL DOES WITH IT. Three claims, each held to something that is not the module:
//
//   1. THE MOVE CHANGED NOTHING. es-box3d-6dof.html resolved ship-ship collisions in a function of its own until v4848. That function is kept below, verbatim (comments dropped, code untouched), as the ORACLE, and the
//      module is held to it bit for bit: the state of every body and every hit-point total, on a forced head-on, a glancing hit, a capped one, a separated pair, a dead ship in the way, sixty random overlaps and a
//      six-ship pile-up stepped for ninety ticks. A restatement that "means the same" is not this; the same arithmetic on the same input is.
//   2. THE DUEL STILL IS WHAT IT WAS WITH COLLISIONS OFF. Every number a gate pinned before v4848 -- the shipped pilots' scores, their audits -- was measured on a duel that never resolved a contact. The fingerprints
//      below were taken from the committed v4846 pilot6dofPolicy.mjs on twenty games and are frozen here, so `collisions: false` (the default) is held to the old duel and not to itself.
//   3. COLLISIONS ON ARE ACCOUNTED FOR. The hit points a ship lost are its hits taken times the shot damage plus the rams, exactly; a ship is dead exactly when its hit points are gone (a ram can be what takes the last
//      ones); the ram penalty is a cost and nothing else (the same game, the score lower by hit points times the penalty); and the JOUST start is a start in which ships touch, where the STANDOFF start is not
//      (0 contacts in 400 audit games at v4848: the centres never came nearer than 55 m and a fight lasts 1.6-3.9 s -- which is why a pilot trained there has never learned anything about a ram).
//
// SABOTAGES, v4848 (each broken in place in a scratch checkout, the gate run, the file restored; reds are rows):
//   A  shipCollision6dof.mjs: restitution 0.35 -> 0.5                                    6 red (the head-on, 60 m/s, glancing, random-60, pile-up rows; the constants row)
//   B  shipCollision6dof.mjs: ram damage to `a` only                                       7 red (the same five, the both-ships-take-it row, and the pile-up)
//   C  shipCollision6dof.mjs: the 25-hit-point cap removed                                 2 red (the 60 m/s row; the cap row: took 102.16)
//   D  shipCollision6dof.mjs: the positional correction skipped                           5 red (head-on, 60 m/s, glancing, random-60, pile-up)
//   E  shipCollision6dof.mjs: a dead ship is no longer skipped                             2 red (the dead-ship rows)
//   F  shipCollision6dof.mjs: friction 0.5 -> 0                                           6 red (as A)
//   G  pilot6dofPolicy.mjs: collisions default ON                                         FIRST RUN: 1 red, the joust-off row only -- the `default` row compared two standoffs, which never touch, so the flipped default changed
//                                                                                          nothing it looked at. The row now compares the default with the explicit off and the explicit on IN A JOUST: 2 red (that row and the joust-off row)
//   H  pilot6dofPolicy.mjs: ramHp assigned, not accumulated                                1 red (the exact hit-point accounting, 64 of 72)
//   I  pilot6dofPolicy.mjs: scoreB ignores the ram penalty                                 1 red (the penalty row)
//   J  pilot6dofPolicy.mjs: the joust starts 140 m apart                                   6 red (joust-off, accounting, dead-iff-hp, impact, penalty, the joust-has-contacts row)
//   K  es-box3d-6dof.html: resolveCollisions does nothing                                  1 red (the page-uses-the-module row)
//   L  es-box3d-6dof.html: collisions resolved after the shots                             1 red (the order row: 309 < 413 < 379)
//   M  pilot6dofPolicy.mjs: a ram never marks a ship dead                                  1 red (dead-exactly-when-hp-is-gone: 70 of 72)
//   N  pilot6dofPolicy.mjs: every tick of a contact counts as an impact                    1 red (the impact row)
//   O  pilot6dofPolicy.mjs: minRange never shrinks (max for min)                            1 red (the joust-off row: closest Infinity)
//   P  es-box3d-6dof.html: the hull half-extent [1.6, 0.8, 0.7]                            1 red (the duel-flies-the-page's-ship row)
//   (section 5, added after two training runs died on a NaN ship: a pilot holding a torque for ~300-800 ticks drives its angular velocity to 1e304 and then NaN; obbContact reads NaN as a hit with no normal)
//   S1 pilot6dofPolicy.mjs: the non-finite check removed                                   3 red (no throw; the fingerprint row; the collisions-off row)
//   S2 shipCollision6dof.mjs: a hit with no normal not skipped                              1 red (the page's function throws and the module does not)
//   S3 pilot6dofPolicy.mjs: a lost ship not marked dead                                     2 red (the lost-and-dead row; the collisions-off row)
//   S4 pilot6dofPolicy.mjs: a lost ship's last finite body not restored                      FIRST RUN: 0 red -- the row read "the fingerprint is finite", which holds for a NaN body too (Math.round(NaN) & 0xffffffff
//                                                                                          is 0, deterministically). The spin-out game's fingerprint is now PINNED (a3e7e059): 1 red
//   S5 pilot6dofPolicy.mjs: aLost / bLost never reported                                    2 red (the lost-and-dead row; the collisions-off row)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as SC from "./shipCollision6dof.mjs";
import * as P6 from "./pilot6dofPolicy.mjs";
import * as RB from "../physics/mechanics/rigidBody6dof.mjs";
import * as RBC from "../physics/mechanics/rigidBody6dofCollision.mjs";
import * as OM from "../physics/obbManifold.js";
import * as TL from "../tools/ship/train6dofLeague.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const mkRng = (seed) => { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };

// ---- THE ORACLE: es-box3d-6dof.html's resolveCollisions as it stood at v4846, comments dropped, code verbatim --------------------------------------------------------------------------------------
const HALF = [1.6, 0.7, 0.7], RAM_DAMAGE_PER_IMPULSE = 0.3, RAM_DAMAGE_CAP = 25;
function resolveCollisions(all) {
  for (let i = 0; i < all.length; i++) {
    if (all[i].dead) continue;
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (b.dead) continue;
      const c = RBC.checkContact(a.body, HALF, b.body, HALF);
      if (!c.hit) continue;
      const obbA = RBC.bodyOBB(a.body, HALF), obbB = RBC.bodyOBB(b.body, HALF);
      const manifold = OM.obbManifold(obbA, obbB, c);
      const { totalImpulse: impulse, a: a2, b: b2 } = RBC.resolveManifold(a.body, b.body, manifold.points, { restitution: 0.35, friction: 0.5 });
      const deepest = manifold.points.reduce((best, p) => (p.depth > best.depth ? p : best));
      const { a: a3, b: b3 } = RBC.positionalCorrection(a2, b2, deepest);
      a.body = a3; b.body = b3;
      if (impulse > 0) {
        const dmg = Math.min(RAM_DAMAGE_CAP, impulse * RAM_DAMAGE_PER_IMPULSE);
        a.hp -= dmg; b.hp -= dmg;
      }
    }
  }
}

const I = RB.boxInertia({ m: 8, hx: 1.6, hy: 0.7, hz: 0.7 });
const yaw = (deg) => { const h = deg * Math.PI / 360; return [Math.cos(h), 0, Math.sin(h), 0]; };
const unitQ = (r) => { const v = [r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5], n = Math.hypot(...v) || 1; return v.map((c) => c / n); };
const ship = (pos, vel, q, extra = {}) => ({ hp: 100, dead: false, body: RB.createBody({ mass: 8, I, pos, q, vel, w: [0, 0, 0] }), ...extra });
const snap = (ships) => JSON.stringify(ships.map((s) => ({ hp: s.hp, dead: s.dead, pos: Array.from(s.body.pos), q: Array.from(s.body.q), vel: Array.from(s.body.vel), w: Array.from(s.body.w) })));
const clone = (ships) => ships.map((s) => ({ hp: s.hp, dead: s.dead, body: structuredClone(s.body) }));

sec("1. THE MODULE IS THE PAGE'S v4846 FUNCTION, MOVED: the same bodies and hit points, bit for bit");
{
    const identical = (name, ships) => { const a = clone(ships), b = clone(ships), ev = SC.resolveShipCollisions(a, HALF); resolveCollisions(b); const same = snap(a) === snap(b); ok(name, same, `${ev.length} contact${ev.length === 1 ? "" : "s"}${same ? "" : "; the two disagree"}`); return { ev, a }; };
    const head = identical("a forced head-on at 12 m/s closing: the same bodies and hit points as the page's function", [ship([-1.4, 0, 0], [6, 0, 0], [1, 0, 0, 0]), ship([1.4, 0, 0], [-6, 0, 0], [0, 0, 1, 0])]);
    ok("...and it is a real hit: an impulse, damage to BOTH ships and the SAME damage to each, under the cap", head.ev.length === 1 && head.ev[0].impulse > 0 && head.ev[0].dmg > 0 && head.ev[0].dmg < RAM_DAMAGE_CAP && head.a[0].hp === head.a[1].hp && Math.abs(100 - head.a[0].hp - head.ev[0].dmg) < 1e-9,
       `impulse ${head.ev[0] && head.ev[0].impulse.toFixed(1)}, ${head.ev[0] && head.ev[0].dmg.toFixed(2)} hp each, ${head.a[0].hp.toFixed(2)} and ${head.a[1].hp.toFixed(2)} left`);
    ok("...and it is reported with the ship objects it was handed, so a caller can tell who rammed whom", head.ev[0].a === head.a[0] && head.ev[0].b === head.a[1]);
    const fast = identical("a head-on at 60 m/s closing: the same", [ship([-1.4, 0, 0], [30, 0, 0], [1, 0, 0, 0]), ship([1.4, 0, 0], [-30, 0, 0], [0, 0, 1, 0])]);
    ok("...and its damage is CAPPED at 25 hit points each, however hard the hit (the impulse alone would have cost more)", fast.ev[0].dmg === RAM_DAMAGE_CAP && fast.ev[0].impulse * RAM_DAMAGE_PER_IMPULSE > RAM_DAMAGE_CAP && fast.a[0].hp === 75, `impulse ${fast.ev[0].impulse.toFixed(0)} would be ${(fast.ev[0].impulse * RAM_DAMAGE_PER_IMPULSE).toFixed(0)} hp; took ${fast.ev[0].dmg}`);
    identical("a glancing hit (one hull offset a metre, the other yawed 40 degrees, closing at 10 m/s): the same", [ship([-1.5, 0, 0], [5, 0, 0], [1, 0, 0, 0]), ship([1.5, 1, 0], [-5, 0, 0], yaw(40))]);
    const apart = identical("a pair 20 m apart: nothing touches, nothing is reported, nothing moves", [ship([-10, 0, 0], [5, 0, 0], [1, 0, 0, 0]), ship([10, 0, 0], [-5, 0, 0], [0, 0, 1, 0])]);
    ok("...", apart.ev.length === 0 && apart.a[0].hp === 100 && apart.a[1].hp === 100);
    const dead = identical("a pair in contact with one of them already dead: skipped, as the page skipped it", [ship([-1.4, 0, 0], [6, 0, 0], [1, 0, 0, 0]), ship([1.4, 0, 0], [-6, 0, 0], [0, 0, 1, 0], { dead: true })]);
    ok("...nothing reported, nothing damaged", dead.ev.length === 0 && dead.a[0].hp === 100);
    const r = mkRng(4848); let mismatches = 0, touching = 0;
    for (let k = 0; k < 60; k++) {
        const pair = [ship([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1], [(r() - 0.5) * 20, (r() - 0.5) * 20, (r() - 0.5) * 20], unitQ(r)), ship([r() * 2 - 1 + 1.5, r() * 2 - 1, r() * 2 - 1], [(r() - 0.5) * 20, (r() - 0.5) * 20, (r() - 0.5) * 20], unitQ(r))];
        const a = clone(pair), b = clone(pair), ev = SC.resolveShipCollisions(a, HALF); resolveCollisions(b); if (ev.length) touching++; if (snap(a) !== snap(b)) mismatches++;
    }
    ok("sixty random overlapping pairs (any orientation, any velocity): the same bodies and hit points as the page's function on every one", mismatches === 0 && touching >= 40, `${60 - mismatches} of 60 identical; ${touching} of them actually touched, so this is the manifold and the solver and not 60 misses`);
    const rp = mkRng(77), pile = [0, 1, 2, 3, 4, 5].map((i) => ship([(i % 3) * 1.8 - 1.8 + (rp() - 0.5), Math.floor(i / 3) * 1.4 - 0.7, (rp() - 0.5) * 1.2], [(rp() - 0.5) * 10, (rp() - 0.5) * 10, (rp() - 0.5) * 10], unitQ(rp)));
    const A = clone(pile), B = clone(pile); let firstDiff = -1, contacts = 0; const dt = 1 / 30, step = (ships) => { for (const s of ships) s.body = RB.step(s.body, RB.createAccumulator(), dt); };
    for (let t = 0; t < 90; t++) { contacts += SC.resolveShipCollisions(A, HALF).length; resolveCollisions(B); step(A); step(B); if (firstDiff < 0 && snap(A) !== snap(B)) firstDiff = t; }
    ok("a six-ship pile-up stepped for 90 ticks (the page's 'instant six-way joust'): the same bodies and hit points as the page's function on every tick", firstDiff < 0 && contacts > 10, firstDiff < 0 ? `identical throughout; ${contacts} contacts` : `first differs at tick ${firstDiff}`);
    ok("the module's constants are the page's v4846 ones (0.3 per unit impulse, 25 cap, restitution 0.35, friction 0.5)", SC.RAM_DAMAGE_PER_IMPULSE === 0.3 && SC.RAM_DAMAGE_CAP === 25 && SC.RESTITUTION === 0.35 && SC.FRICTION === 0.5);
}

sec("2. THE PAGE USES THE MODULE, AND NOTHING ELSE RESOLVES A CONTACT");
{
    const html = fs.readFileSync(path.join(ENG, "es-box3d-6dof.html"), "utf8"), code = html.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("the page imports brain/shipCollision6dof.mjs", /import \* as SC from "\/brain\/shipCollision6dof\.mjs"/.test(html));
    ok("...and resolveCollisions is the module's function on the page's hull, not a second copy (no contact test, manifold or impulse solver left in the page's own code)", /const resolveCollisions = \(all\) => SC\.resolveShipCollisions\(all, HALF\);/.test(code) && !/RBC\.|OM\.|resolveManifold|positionalCorrection|checkContact/.test(code));
    const fr = code.slice(code.indexOf("function simStep()"));   // v4895: the simulation step is simStep() (frame() draws around it, and the headless balance run calls it alone)
    const iFleet = fr.indexOf("stepFleet(B, A"), iCol = fr.indexOf("resolveCollisions(A.concat(B))"), iShots = fr.indexOf("stepWeapons(A.concat(B), dt)");
    ok("the page's order is kept: both fleets move, THEN contact is resolved, THEN shots (the duel does the same)", iFleet > 0 && iCol > iFleet && iShots > iCol, `at ${iFleet} < ${iCol} < ${iShots}`);
    const num = (re) => { const m = code.match(re); return m ? JSON.parse(m[1]) : null; };
    const pageHalf = num(/const HALF = (\[[^\]]+\])/), pageMount = num(/const ENGINE_MOUNT = (\[[^\]]+\])/), pageMass = num(/const SHIP_MASS = (\d+)/), pageHp = num(/const HP_MAX = (\d+)/), pageDmg = num(/SHOT_DAMAGE = (\d+)/);
    ok("the duel flies the page's ship: the same hull, engine mount, mass, hit points and shot damage", JSON.stringify(pageHalf) === JSON.stringify(P6.HALF) && JSON.stringify(pageHalf) === JSON.stringify(HALF) && JSON.stringify(pageMount) === JSON.stringify(P6.ENGINE_MOUNT) && pageMass === P6.SHIP_MASS && pageHp === P6.HP_MAX && pageDmg === P6.SHOT_DAMAGE,
       `hull ${JSON.stringify(pageHalf)}, mount ${JSON.stringify(pageMount)}, mass ${pageMass}, hp ${pageHp}, shot ${pageDmg}`);
}

sec("3. THE DUEL WITH COLLISIONS OFF IS THE v4846 DUEL, TO THE BIT");
const ship46 = TL.previousWeights(), league46 = TL.previousWeights(path.join(ENG, "brain", "pilot6dofWeightsLeague.json"));
{
    // taken from the committed v4846 brain/pilot6dofPolicy.mjs (git show HEAD:...), fingerprint:ticks:hits:hitsTaken, twenty games
    const FROZEN = {"autopilot|autopilot|3":"1a1cead3:101:5:6","autopilot|autopilot|7":"83ceac99:114:6:6","autopilot|autopilot|11":"a24f04e9:66:6:6","autopilot|autopilot|501":"6e68448c:84:6:6","autopilot|autopilot|777":"244af22a:107:6:6","shipped|autopilot|3":"f4cca44b:69:6:2","shipped|autopilot|7":"17c88c32:72:6:2","shipped|autopilot|11":"36519a33:57:6:5","shipped|autopilot|501":"590cc527:66:6:4","shipped|autopilot|777":"36854e13:69:6:2","league|shipped|3":"7e74c00a:69:6:5","league|shipped|7":"5c387edc:69:6:5","league|shipped|11":"e80cdeb5:57:6:5","league|shipped|501":"15180bd7:66:6:5","league|shipped|777":"b43ad4e7:69:6:6","hand|zero|3":"2f869607:102:6:0","hand|zero|7":"4ae5b84b:105:6:0","hand|zero|11":"0d484586:66:6:0","hand|zero|501":"6d4f4bb0:84:6:0","hand|zero|777":"ae592428:99:6:0"};
    const pilots = { autopilot: "autopilot", shipped: ship46, league: league46, hand: "hand", zero: "zero" };
    let bad = [];
    for (const [key, want] of Object.entries(FROZEN)) { const [a, b, s] = key.split("|"), r = P6.duel(pilots[a], pilots[b], { seed: Number(s) }); const got = `${r.fingerprint}:${r.ticks}:${r.hits}:${r.hitsTaken}`; if (got !== want) bad.push(`${key} ${got} != ${want}`); }
    ok("twenty games (four pairings x five seeds, the shipped pilot and the league pilot among them): fingerprint, length and hit counts equal the v4846 duel's", bad.length === 0, bad.length ? bad.slice(0, 3).join("; ") : "20 of 20 identical");
    // in a JOUST, where ships touch: a standoff has no contact, so a default flipped to "on" would change nothing there and this row would not see it
    const x = P6.duel("autopilot", "autopilot", { seed: 5, scenario: "joust", collisions: false }), y = P6.duel("autopilot", "autopilot", { seed: 5, scenario: "joust" }), z = P6.duel("autopilot", "autopilot", { seed: 5, scenario: "joust", collisions: true });
    ok("`collisions: false` is the default (in a joust, where it matters: the default is the explicit-off fight and not the collisions-on one), and a duel with them off reports no rams", x.fingerprint === y.fingerprint && z.fingerprint !== y.fingerprint && y.rams === 0 && y.ramTicks === 0 && y.ramHp === 0 && z.ramHp > 0, `joust seed 5: off ${y.fingerprint}, on ${z.fingerprint} (${z.ramHp.toFixed(1)} hp)`);
    const joustOff = P6.duel("autopilot", "autopilot", { seed: 5, scenario: "joust" });
    ok("collisions off in a JOUST: the ships fly through each other (they came within a hull length) and nothing is resolved or charged", joustOff.minRange < 3.2 && joustOff.rams === 0 && joustOff.ramHp === 0, `closest ${joustOff.minRange.toFixed(2)} m`);
}

sec("4. COLLISIONS ON: ACCOUNTED FOR EXACTLY");
{
    const seeds = Array.from({ length: 24 }, (_, i) => 900 + i), games = [];
    for (const seed of seeds) for (const [a, b] of [["autopilot", "autopilot"], [ship46, "autopilot"], [ship46, ship46]]) games.push(P6.duel(a, b, { seed, scenario: "joust", collisions: true }));
    const bad = games.filter((r) => Math.abs((100 - r.aHp) - (r.hitsTaken * P6.SHOT_DAMAGE + r.ramHp)) > 1e-9 || Math.abs((100 - r.bHp) - (r.hits * P6.SHOT_DAMAGE + r.ramHp)) > 1e-9);
    ok("72 joust games: each ship's lost hit points are exactly its hits taken times the shot damage PLUS the ram damage, and both ships took the same ram damage", bad.length === 0 && games.some((r) => r.ramHp > 0), `${games.length - bad.length} of ${games.length} close to 1e-9; ${games.filter((r) => r.ramHp > 0).length} had a ram`);
    const deadBad = games.filter((r) => r.aDead !== (r.aHp <= 0 || r.aLost) || r.bDead !== (r.bHp <= 0 || r.bLost));
    const ramKilled = games.filter((r) => (r.aHp <= 0 && 100 - r.aHp - r.ramHp < P6.SHOT_DAMAGE * 6) || (r.bHp <= 0 && 100 - r.bHp - r.ramHp < P6.SHOT_DAMAGE * 6));
    ok("a ship is dead exactly when its hit points are gone -- and in some of these a RAM took the last of them (fewer than six hits, still dead)", deadBad.length === 0 && ramKilled.length > 0, `${games.length - deadBad.length} of ${games.length}; ${ramKilled.length} games where the rams were what killed`);
    // the first seed on which the shipped pilot rams ITS OWN COPY: a penalty row on a game with no ram would compare two equal scores and prove nothing
    const rseed = seeds.find((sd) => P6.duel(ship46, ship46, { seed: sd, scenario: "joust", collisions: true }).ramHp > 0);
    const withRam = games.filter((r) => r.rams > 0);
    ok("an IMPACT is the tick a contact begins, not every tick it lasts: rams never exceed contact ticks, and some games are pressed together for several ticks and count once", withRam.length > 0 && games.every((r) => r.rams <= r.ramTicks && (r.ramTicks === 0) === (r.rams === 0)) && withRam.some((r) => r.ramTicks > r.rams), `${withRam.length} games with a ram; ${withRam.filter((r) => r.ramTicks > r.rams).length} of them with a sustained contact`);
    const g = P6.duel(ship46, ship46, { seed: rseed, scenario: "joust", collisions: true }), pen = P6.duel(ship46, ship46, { seed: rseed, scenario: "joust", collisions: true, ramPenalty: 0.05 });
    ok("the ram penalty is a cost and only a cost: the same game (same fingerprint), the score lower by hit points times the penalty, from either side", g.ramHp > 0 && pen.fingerprint === g.fingerprint && Math.abs((g.score - pen.score) - g.ramHp * 0.05) < 1e-9 && Math.abs((g.scoreB - pen.scoreB) - g.ramHp * 0.05) < 1e-9, `seed ${rseed}: ram damage ${g.ramHp.toFixed(1)} hp, score ${g.score.toFixed(3)} -> ${pen.score.toFixed(3)}`);
    const sd = Array.from({ length: 40 }, (_, i) => 1000 + i), st = sd.map((s) => P6.duel("autopilot", "autopilot", { seed: s, collisions: true })), jo = sd.map((s) => P6.duel("autopilot", "autopilot", { seed: s, collisions: true, scenario: "joust" }));
    const stRams = st.filter((r) => r.rams > 0).length, joRams = jo.filter((r) => r.rams > 0).length;
    ok("the STANDOFF start never brings two ships together (no contact in 40 games, the closest well over 40 m) and the JOUST start does (a contact in at least a fifth of 40)", stRams === 0 && Math.min(...st.map((r) => r.minRange)) > 40 && joRams >= 8, `standoff: ${stRams} with a ram, closest ${Math.min(...st.map((r) => r.minRange)).toFixed(1)} m; joust: ${joRams} with a ram`);
    const again = P6.duel(ship46, "autopilot", { seed: 904, scenario: "joust", collisions: true }), once = P6.duel(ship46, "autopilot", { seed: 904, scenario: "joust", collisions: true });
    ok("a joust is deterministic for its seed, and is another fight than the standoff on that seed", again.fingerprint === once.fingerprint && again.fingerprint !== P6.duel(ship46, "autopilot", { seed: 904, collisions: true }).fingerprint);
}

sec("5. A SHIP THAT SPINS ITSELF OUT IS LOST, NOT SIMULATED ON (found by two training runs that died on it)");
{
    // a body whose state is NaN: obbContact reads it as a hit with no normal (every axis comparison against NaN is false)
    const nanShip = ship([1000, 0, 0], [0, 0, 0], [1, 0, 0, 0]); nanShip.body = { ...nanShip.body, q: [NaN, NaN, NaN, NaN], w: [NaN, NaN, NaN] };
    const pair = () => [ship([0, 0, 0], [0, 0, 0], [1, 0, 0, 0]), { ...nanShip, body: { ...nanShip.body } }];
    let oracleThrows = false; try { resolveCollisions(pair()); } catch { oracleThrows = true; }
    let moduleThrows = false, ev = null; const mine = pair(); try { ev = SC.resolveShipCollisions(mine, HALF); } catch { moduleThrows = true; }
    ok("the page's v4846 function THROWS on a NaN ship (so the fixture reaches the case), and the module does not: nothing is reported, nothing damaged, the other ship untouched", oracleThrows && !moduleThrows && ev.length === 0 && mine[0].hp === 100 && mine[1].hp === 100 && snap([mine[0]]) === snap([pair()[0]]));
    // the fixture: all-zero weights but the last five (the output biases): torque X saturated, a little torque Y and Z, no thrust, no fire. Held for ~300 ticks it drives the angular velocity to NaN.
    const spin = new Float32Array(P6.WEIGHT_COUNT); [5, 0.2, 0.2, 0, 0].forEach((v, i) => { spin[P6.WEIGHT_COUNT - 5 + i] = v; });
    let threw = null, r = null; try { r = P6.duel("zero", spin, { seed: 604, collisions: true, seconds: 40 }); } catch (e) { threw = e.message; }
    ok("!! a pilot that spins itself to non-finite state against a passive opponent: the duel does not throw (it did, at iteration 376 of the first close-quarters search); the ship is LOST and dead on the spot and the passive pilot wins", threw === null && r.bLost === true && r.bDead === true && r.aDead === false && r.win === true && r.ticks < 1200, threw || `lost at tick ${r.ticks} of 1200`);
    // the fingerprint of this game is PINNED, because it is the only place the restored state shows: a NaN body folds into the hash as 0 (Math.round(NaN) & 0xffffffff), deterministically, so "the fingerprint is finite"
    // passes whether or not the ship was put back (sabotage S4 found that); the real positions and orientations it was put back to give a hash that is not the NaN one
    ok("...the ship is put back where it last was, so nothing downstream reads NaN (finite closest approach and hit points, and the game's fingerprint is the one taken with the restored state)", Number.isFinite(r.minRange) && Number.isFinite(r.aHp) && Number.isFinite(r.bHp) && r.fingerprint === "a3e7e059", r.fingerprint);
    const off = P6.duel("zero", spin, { seed: 604, collisions: false, seconds: 40 });
    ok("...and it is the rule with collisions OFF too (before v4848 a NaN ship was an immortal ghost that only the time limit ended): the same loss at the same tick", off.bLost === true && off.bDead === true && off.ticks === r.ticks, `tick ${off.ticks}`);
    const flat = Array.from({ length: 12 }, (_, i) => P6.duel(ship46, "autopilot", { seed: 1100 + i, scenario: i % 2 ? "joust" : "standoff", collisions: true }));
    ok("a pilot that does NOT spin out is never lost: 12 games of the shipped pilot, aLost and bLost false in all", flat.every((g) => g.aLost === false && g.bLost === false));
}

console.log(fails ? `\nshipCollision6dof-selfcheck: ${fails} FAILED` : "\nshipCollision6dof-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
