// WebGLEngine/brain/evadeReflex-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/evadeReflex-selfcheck.mjs      (under a minute)
//
// THE EVADE SEAT'S REFLEX, HELD. brain/evadeReflex.mjs, before anything is flown with it (brain/EVADE_SEAT_REGISTRATION_DRAFT.md):
//
//   1  THE THREAT     the closing enemy ship with the shortest time to contact, under 4 s and within 1,500 m; not one opening, not one out of reach, not one too slow; its
//                     bearing positive to the hull's LEFT and its elevation positive above, in the hull's own frame however the hull is turned
//   2  THE ACTIONS    turn: away (a left threat, a right turn), tanh(2 S) of half the torque limit; burst: the thrust up to all the pods give; climb: nose down for a threat above,
//                     up for one level or below; jink: full swings, the first away, swapped every 0.5 s, started again by a new threat; with no threat, the helm's answer untouched
//   3  THE READ-OUTS  every circuit in every orientation swings the hull AWAY from a threat at a quarter turn (S > 0 on the left, odd in the bearing); E in 0..1; `flat` is a
//                     switch by eye (S 1, E 1); the senses and where each read-out peaks, pinned as measured BEFORE registering
//   4  THE DUEL       a side's `evade` is refused unless it names an action and a wiring; a reflex that never fires (tau0 0) flies EXACTLY as no reflex; one that fires changes
//                     the fight, and the same fight twice is the same fight
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import * as EV from "./evadeReflex.mjs";
import * as D from "./battleshipDuel.mjs";
import * as CS from "../physics/mechanics/capitalShip.mjs";
import { DT } from "./spaceArena.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const SHIP = CS.createCapitalShip(), Q0 = [1, 0, 0, 0], yawQ = (a) => [Math.cos(a / 2), 0, 0, Math.sin(a / 2)];
const body = (pos = [0, 0, 0], vel = [0, 0, 0], q = Q0) => ({ pos, vel, q, w: [0, 0, 0], I: SHIP.I });
const enemy = (id, pos, vel) => ({ id, body: body(pos, vel) });
const ctxOf = (enemies, b = body()) => ({ body: b, ship: SHIP, foe: null, thrustMax: 1500, enemies });
const RULE = () => ({ torque: [10, 20, 30], thrust: 450 });

console.log("evadeReflex-selfcheck -- the evade seat's reflex\n");

console.log("1. THE THREAT");
section(() => {
    const b = body(), es = [enemy(1, [1000, 0, 0], [-100, 0, 0]), enemy(2, [600, 300, 0], [-200, -100, 0]), enemy(3, [800, 0, 0], [50, 0, 0]), enemy(4, [1600, 0, 0], [-900, 0, 0]), enemy(5, [500, 0, 0], [-60, 0, 0])];
    const t = EV.threatOf(b, es), d2 = Math.hypot(600, 300), ttc2 = d2 / ((200 * 600 + 100 * 300) / d2);
    ok("!! THE SHORTEST TIME TO CONTACT AMONG THE CLOSING SHIPS, under 4 s and within 1,500 m: not the opening one (3), not the one past reach (4), not the slow one (1: 10 s; 5: 8.3 s)", t && t.id === 2 && Math.abs(t.ttc - ttc2) < 1e-9 && EV.threatOf(b, [es[0], es[2], es[3], es[4]]) === null, JSON.stringify(t));
    ok("!! with nothing closing in time there is no threat", EV.threatOf(b, []) === null && EV.threatOf(b, [enemy(1, [100, 0, 0], [0, 0, 0])]) === null);
    const left = EV.threatOf(b, [enemy(1, [0, 300, 0], [0, -200, 0])]), up = EV.threatOf(b, [enemy(1, [300, 0, 300], [-150, 0, -150])]);
    ok("!! the bearing is positive to the hull's LEFT (+y: 90 degrees) and the elevation positive above (45 degrees)", Math.abs(left.bearing - Math.PI / 2) < 1e-9 && Math.abs(up.elevation - Math.PI / 4) < 1e-9 && Math.abs(up.bearing) < 1e-9);
    const turned = EV.threatOf(body([0, 0, 0], [0, 0, 0], yawQ(Math.PI / 2)), [enemy(1, [300, 0, 0], [-200, 0, 0])]);
    ok("!! IN THE HULL'S OWN FRAME: a hull turned a quarter left sees a ship dead ahead in the world on its RIGHT (-90 degrees)", Math.abs(turned.bearing + Math.PI / 2) < 1e-9, `${(turned.bearing * 180 / Math.PI).toFixed(3)}`);
});

console.log("2. THE ACTIONS (the sine read-out)");
section(() => {
    const lim = SHIP.maxAlpha, I = SHIP.I, L = [enemy(1, [300, 300, 0], [-150, -150, 0])], Rt = [enemy(1, [300, -300, 0], [-150, 150, 0])];
    const turn = EV.createReflex({ action: "turn" }), a = turn(RULE(), ctxOf(L)), b = turn(RULE(), ctxOf(Rt)), want = -EV.FRACTION * lim * I[2] * Math.tanh(2 * Math.sin(Math.PI / 4));
    ok("!! TURN: a threat 45 degrees LEFT turns the hull RIGHT by tanh(2 sin 45) of half the torque limit about z (the helm's own torque kept and added to), a threat on the right the other way", Math.abs(a.torque[2] - (30 + want)) < 1e-9 && Math.abs(b.torque[2] - (30 - want)) < 1e-9 && a.torque[0] === 10 && a.torque[1] === 20 && a.thrust === 450);
    const burst = EV.createReflex({ action: "burst" })(RULE(), ctxOf(L));
    ok("!! BURST: the thrust up to everything the pods give (1,500), the torques untouched", burst.thrust === 1500 && burst.torque.join() === "10,20,30");
    const climb = EV.createReflex({ action: "climb" }), above = climb(RULE(), ctxOf([enemy(1, [300, 0, 200], [-150, 0, -100])])), level = climb(RULE(), ctxOf(L)), half = EV.FRACTION * lim * I[1];
    ok("!! CLIMB: NOSE DOWN (+ about y) for a threat above the hull's plane, UP (-) for one level or below, half the torque limit", Math.abs(above.torque[1] - (20 + half)) < 1e-9 && Math.abs(level.torque[1] - (20 - half)) < 1e-9);
    const jink = EV.createReflex({ action: "jink" }), swings = []; for (let k = 0; k < 40; k++) swings.push(Math.sign(jink(RULE(), ctxOf(L)).torque[2] - 30));
    const swapAt = swings.findIndex((s2) => s2 !== swings[0]), again = EV.createReflex({ action: "jink" }); again(RULE(), ctxOf(L)); again(RULE(), ctxOf(L)); const fresh = Math.sign(again(RULE(), ctxOf([enemy(7, [300, 300, 0], [-150, -150, 0])])).torque[2] - 30);
    ok("!! JINK: full swings, the FIRST AWAY (a left threat: right), swapped every 0.5 s (15 ticks), and a NEW threat starts it again away", swings[0] === -1 && swapAt === Math.round(0.5 / DT) && swings[swapAt * 2] === -1 && fresh === -1, `swap after ${swapAt} ticks`);
    const out = RULE(), none = EV.createReflex({ action: "turn" });
    ok("!! WITH NO THREAT THE HELM'S ANSWER IS RETURNED UNTOUCHED (the very same object)", none(out, ctxOf([])) === out && none.last === null);
});

console.log("3. THE READ-OUTS (pinned before registering)");
section(() => {
    const deg = (a) => (a * Math.PI) / 180, names = ["lc6", "lc16", "lc4", "lplc2"].flatMap((t) => ["medial", "lateral", "flat", "shuffled:4242"].map((o) => `${t}:${o}`));
    let away = true, oddOK = true, eOK = true;
    for (const n of names) { const R = EV.readoutOf(n); for (let a = 16; a <= 180; a += 4) { if (!(R.S(deg(a)) > 0)) away = false; if (Math.abs(R.S(deg(-a)) + R.S(deg(a))) > 1e-12) oddOK = false; const e = R.E(deg(a)); if (!(e >= 0 && e <= 1)) eOK = false; } }
    ok("!! EVERY CIRCUIT IN EVERY ORIENTATION SWINGS THE HULL AWAY: S > 0 for a threat on the left at every bearing past the eyes' overlap, odd in the bearing; E in 0..1 (16 wirings)", away && oddOK && eOK);
    const flat = names.filter((n) => n.endsWith(":flat")).every((n) => { const R = EV.readoutOf(n); return [20, 60, 120, 170].every((a) => Math.abs(R.S(deg(a)) - 1) < 1e-12 && Math.abs(R.E(deg(a)) - 1) < 1e-12); });
    ok("!! `flat` IS A SWITCH BY EYE: S 1 and E 1 at every bearing past the overlap -- with no places the circuit can only tell left from right", flat);
    const senses = names.map((n) => EV.readoutOf(n).sense).join(), peakOf = (n) => { const R = EV.readoutOf(n); let b = 0, v = -1; for (let k = 0; k <= 180; k++) { const s2 = Math.abs(R.S(deg(k))); if (s2 > v) { v = s2; b = k; } } return b; };
    const peaks = ["lc6:medial", "lc6:lateral", "lc16:medial", "lc16:lateral", "lc4:medial", "lc4:lateral", "lplc2:medial", "lplc2:lateral"].map(peakOf).join();
    ok("!! THE SENSES, as measured: every original circuit reads its own side (-1, as the loom bench found for LC6 and LC16), the LC6 and LPLC2 shuffles the other (+1)", senses === "-1,-1,-1,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1", senses);
    ok("!! WHERE EACH READ-OUT PEAKS, as measured (degrees off the nose; medial and lateral mirror each other): LC6 46/134, LC16 135/45, LC4 59/121, LPLC2 124/56", peaks === "46,134,135,45,59,121,124,56", peaks);
    let threw = 0; for (const bad of ["lc5:medial", "lc6:front", "lc6:shuffled:x", "", "sine2"]) { try { EV.readoutOf(bad); } catch { threw++; } }
    ok("a wiring is refused unless it is sine or <lc6|lc16|lc4|lplc2>:<medial|lateral|flat|shuffled:<seed>>", threw === 5 && EV.checkWiring("lplc2:shuffled:7") === null);
});

console.log("4. THE DUEL (brain/battleshipDuel.mjs)");
section(() => {
    let refused = 0; for (const e of [{ action: "dodge" }, { action: "turn", wiring: "lc9:medial" }, {}]) { try { D.makeSide("x", { evade: e }); } catch { refused++; } }
    ok("!! a side's evade is refused unless it names an action and a wiring (a missing wiring is the sine)", refused === 3 && D.makeSide("x", { evade: { action: "burst" } }).evade.wiring === "sine");
    const plain = D.makeSide("plain"), never = D.makeSide("x", { evade: { action: "turn", tau0: 0 } }), turn = D.makeSide("x", { evade: { action: "turn", tau0: 1e6 } }), fp = (a, b) => D.duel(a, plain, 4242, "head-on", { ships: 1 }).fingerprint;
    const base = fp(D.makeSide("x")), off = fp(never), on1 = fp(turn), on2 = fp(turn);
    ok("!! A REFLEX THAT NEVER FIRES (tau0 0) FLIES EXACTLY AS NO REFLEX; one that fires (tau0 1e6: any ship closing within reach) changes the fight; the same fight twice is the same fight -- the plumbing, whatever tau0 is registered", off === base && on1 !== base && on1 === on2, `${base} / ${off} / ${on1}`);
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: (filled in below)
