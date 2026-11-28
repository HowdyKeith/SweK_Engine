// WebGLEngine/brain/subShipDuel-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subShipDuel-selfcheck.mjs      (about a minute; pure)
//
// SUB AGAINST SHIP, HELD (brain/subShipDuel.mjs; Keith, 2026-11-28: "then sub vs ship"). The arena, not a study: nothing here is a registered result.
//   1  THE SCENARIO   a ship starts 500 to 900 m back along a lane that passes 100 to 300 m from the sub, its speed the helm's cruise; the same seed, the same scenario
//   2  THE DUEL       deterministic; the hand tactician of brain/subTactics.mjs, unchanged, hunts a ship as it hunts a boat -- it sinks a steady freighter on most seeds;
//                     NO TORPEDO IS EVER LOST AT ITS CEILING against any class (the surface rule)
//   3  THE HELM MATTERS  on the same seeds the evading destroyer (it turns on hearing a torpedo) is sunk less often than the zigzagging one, at most 2 of 8; the score is the duel formula (damage / hp, +0.5 for a kill)
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import * as D from "./subShipDuel.mjs";
import * as SH from "../physics/mechanics/surfaceShip.mjs";
import * as TA from "./subTactics.mjs";
import * as AS from "./autopilotSub.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("subShipDuel-selfcheck -- a sub against a surface ship\n");
const side = () => ({ tactics: TA.makeTactician(), pilot: AS.pilot() }), SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

console.log("1. THE SCENARIO");
{
    const geo = SEEDS.map((s) => { const sc = D.scenario(s, { cls: "destroyer", helm: "steady" }), f = SH.forwardOf(sc.ship.heading), p = sc.ship.pos, along = -(p[0] * f[0] + p[1] * f[1]), cpa = Math.abs(p[0] * -f[1] + p[1] * f[0]); return { along, cpa, sc }; });
    ok("!! THE SHIP STARTS 500 TO 900 m BACK ALONG A LANE THAT PASSES 100 TO 300 m FROM THE SUB, at the helm's cruise", geo.every((g) => g.along >= 500 && g.along <= 900 && Math.abs(g.cpa - g.sc.cpa) < 1e-6 && g.cpa >= 100 && g.cpa <= 300 && Math.abs(g.sc.ship.speed - 3.6) < 1e-9), geo.map((g) => `${g.along.toFixed(0)}/${g.cpa.toFixed(0)}`).join(" "));
    ok("!! the same seed, the same scenario; unknown classes and helms refused", JSON.stringify(D.scenario(3)) === JSON.stringify(D.scenario(3)) && (() => { try { D.scenario(1, { cls: "x" }); return false; } catch { return true; } })() && (() => { try { D.scenario(1, { helm: "x" }); return false; } catch { return true; } })());
}

console.log("2. THE DUEL, 3. THE HELM MATTERS");
{
    const a = D.duel(side(), D.scenario(4, { cls: "corvette", helm: "zigzag" })), b = D.duel(side(), D.scenario(4, { cls: "corvette", helm: "zigzag" }));
    ok("!! DETERMINISTIC: the same seed, the same duel, event for event", JSON.stringify(a.events) === JSON.stringify(b.events) && a.score === b.score);
    const res = {}; let ceiling = 0, torps = 0;
    for (const cls of Object.keys(SH.SHIP_CLASSES)) for (const helm of ["steady", "zigzag", "evade"]) {
        res[`${cls}.${helm}`] = SEEDS.map((s) => { const r = D.duel(side(), D.scenario(s, { cls, helm })); for (const t of r.torpedoes) { torps++; if (t.status === "lost" && t.depth < 3.2) ceiling++; } return r; });
    }
    const sunk = (k) => res[k].filter((r) => r.winner === "sub").length;
    ok("!! THE HAND TACTICIAN, UNCHANGED, HUNTS A SHIP: it sinks a steady freighter on most seeds (6 of 8 or more)", sunk("freighter.steady") >= 6, `${sunk("freighter.steady")} of 8`);
    ok("!! NO TORPEDO IS EVER LOST AT ITS CEILING, against any class or helm (the surface rule: the ship offered below 3.5 m)", ceiling === 0 && torps > 50, `${ceiling} of ${torps} torpedoes lost at the ceiling`);
    ok("!! THE HELM MATTERS, AND SO DOES HEARING: on the same seeds the evading destroyer -- which turns when its sonar hears a torpedo -- is sunk less often than the zigzagging one (the same legs, deaf to torpedoes) and on at most 2 of 8", sunk("destroyer.evade") < sunk("destroyer.zigzag") && sunk("destroyer.evade") <= 2 && sunk("destroyer.zigzag") <= sunk("destroyer.steady"), `evade ${sunk("destroyer.evade")}, zigzag ${sunk("destroyer.zigzag")}, steady ${sunk("destroyer.steady")} of 8`);
    const r = res["freighter.steady"][0], C = SH.SHIP_CLASSES.freighter;
    ok("!! THE SCORE IS THE DUEL'S FORMULA: damage over the ship's hit points, +0.5 for a kill, + up to 0.5 for an early one", Math.abs(r.score - ((C.hp - r.shipHp) / C.hp + (r.winner === "sub" ? 0.5 + 0.5 * (1 - r.ticks / Math.round(D.SECONDS / D.DT)) : 0))) < 1e-9, r.score.toFixed(4));
    console.log("  ....  sunk of 8: " + Object.keys(res).map((k) => `${k} ${sunk(k)}`).join(", "));
}
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG (2026-11-28): 4 mutants. ALL 4 RED -- torpedoes aimed at the ship's position on the surface (they broach: the ceiling row), the helm never consulted, the lane's
// CPA not applied; and the ship deaf to torpedoes, GREEN at first (a deaf evade is a zigzag, and zigzag alone saved one destroyer of eight, so "fewer than steady" held) -- now red
// by the row that the evading destroyer must beat the zigzagging one.
