// Self-check for brain/esPilot.mjs — the GPU Brain as a connecting client.
//
// The pure core is tested here; main() is a thin shell around it. Two of these tests exist because the
// first version of the pilot was wrong in ways nothing would have shouted about:
//
//   * shipFlightStats reads `maneuver`, not `turn`. Writing `turn: 100` gave every hostile
//     Math.max(1, (undefined||0)*3) = 1 deg/sec. They could not aim. The dry run fired zero shots.
//   * the engine's heading convention is {x: sin, y: -cos}. Using cos/sin sends every shot 90 degrees
//     off — it would have looked like the AI was missing on purpose.
//
// Both are now asserted, so they cannot come back quietly.
//
// v2171 adds the other half of the fight: the pilot TAKES damage, loses ships, and reports what the
// loss cost. Until then its policy only ever saw outcomes it liked.
//
//   node brain/tools/es-pilot-selfcheck.mjs

import { makeWorld, peerAsTarget, tickOwned, myShare,
    ingestDamage, respawn, outcomesForDeaths, outcomesForTargetDeath, deadTargets } from "../esPilot.mjs";
import { DEFAULT_W } from "../../ev/esTactics.js";
import { ownsNpc, damageEvent, wingId } from "../../ev/esAuthority.js";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));

// ---- the world every peer agrees on ---------------------------------------------------
{
    const a = makeWorld("room-x", 128, 8, "brain-1"), b = makeWorld("room-x", 128, 8, "brain-1");
    ok("same room+system -> identical hostiles",
        JSON.stringify(a.map((e) => [e.id, e.x.toFixed(3), e.heading.toFixed(3)]))
        === JSON.stringify(b.map((e) => [e.id, e.x.toFixed(3), e.heading.toFixed(3)])));
    ok("different system -> different hostiles",
        makeWorld("room-x", 129, 8, "brain-1")[0].x !== a[0].x);
    ok("different room -> different hostiles",
        makeWorld("room-y", 128, 8, "brain-1")[0].x !== a[0].x);
    ok("count is honoured", makeWorld("room-x", 128, 3, "brain-1").length === 3);
    // v2171 -- ids carry the spawner. A bare "npc0" was hashed across the whole peer ring and handed
    // to browsers that had never spawned it; see ev/tools/es-damage-selfcheck.mjs.
    ok("ids are stable, unique, and name their spawner",
        new Set(a.map((e) => e.id)).size === a.length && a[0].id === "brain-1:0");
    ok("a different pilot in the same room spawns a DIFFERENT wing, not a rival copy",
        makeWorld("room-x", 128, 8, "brain-2")[0].id === "brain-2:0");
    ok("...in the same place (geometry is still deterministic from room+system)",
        makeWorld("room-x", 128, 8, "brain-2")[0].x === a[0].x);
    ok("ships remember where they spawned (respawn needs it)", a.every((e) => e._home && Number.isFinite(e._home.x)));

    // THE REGRESSION GUARD. `turn: 100` in the class table silently became 1 deg/sec.
    ok("ships can actually turn (maneuver -> deg/sec, not 1)", a.every((e) => e.stats.turn > 10));
    ok("ships have thrust and a speed cap", a.every((e) => e.stats.accel > 0 && e.stats.speed > 0));
    ok("ships carry hull maxima (tactics scores on health)",
        a.every((e) => e.maxShield > 0 && e.maxArmor > 0 && e.shield === e.maxShield));
    ok("ships carry dps (tactics scores on threat)", a.every((e) => e.dps > 0));
}

// ---- presence peers become scoreable targets -------------------------------------------
{
    const full = peerAsTarget({ id: "p", x: 1, y: 2, hp: 100 });
    ok("a healthy pilot reads as pristine", full.shield === 100 && full.armor === 100);
    const hurt = peerAsTarget({ id: "p", x: 0, y: 0, hp: 10 });
    ok("a wounded pilot reads as wounded", hurt.shield === 10 && hurt.armor === 10);
    ok("hp is a percentage of a known maximum", hurt.maxShield === 100 && hurt.maxArmor === 100);
    ok("a pilot with no hp reported is assumed whole, not assumed dead",
        peerAsTarget({ id: "p", x: 0, y: 0 }).shield === 100);
    ok("out-of-range hp is clamped", peerAsTarget({ id: "p", x: 0, y: 0, hp: 900 }).shield === 100);
    ok("a real pilot is a player", peerAsTarget({ id: "p", x: 0, y: 0 }).isPlayer === true);
    ok("another bot is not a player", peerAsTarget({ id: "b", x: 0, y: 0, bot: true }).isPlayer === false);
}

// ---- ownership -------------------------------------------------------------------------
{
    const world = makeWorld("r", 128, 12, "brain-1");
    const ids = ["brain-1", "p1"].sort();
    const mine = myShare(world, "brain-1", ids), theirs = myShare(world, "p1", ids);
    // v2171 -- the pilot's wing is its own. It spawned those ships from a class table no browser has;
    // handing a browser a share of them (which v2170's ring did, 5 of 8) gave it ids with no entity,
    // no stats, and nothing to draw. The browser replicates them as ghosts instead.
    ok("the pilot owns every ship it spawned", mine.length === world.length);
    ok("a browser owns none of them", theirs.length === 0);
    ok("no npc owned twice", mine.every((m) => !theirs.some((t) => t.id === m.id)));
    ok("no peers -> own nothing (never claim what you cannot own)", myShare(world, "brain-1", []).length === 0);
    ok("solo -> own everything", myShare(world, "brain-1", ["brain-1"]).length === world.length);
    ok("a crowded room changes nothing: a wing does not go on the ring",
        myShare(world, "brain-1", ["brain-1", "p1", "p2", "p3", "brain-2"]).length === world.length);
    ok("dead ships are never simulated",
        myShare(world.map((e) => ({ ...e, dead: true })), "brain-1", ids).length === 0);
    ok("myShare agrees with esAuthority", mine.every((e) => ownsNpc("brain-1", e.id, ids)));
}

// ---- the tick: engage, close, shoot ----------------------------------------------------
{
    const world = makeWorld("r", 128, 6, "brain-1");
    const owned = myShare(world, "brain-1", ["brain-1"]);          // solo: own all six
    const player = peerAsTarget({ id: "p1", x: 600, y: 0, hp: 40 });

    const start = owned.map((e) => Math.hypot(e.x - 600, e.y));
    let shots = [];
    for (let i = 0; i < 300; i++) shots = shots.concat(tickOwned(owned, [player], DEFAULT_W, 1 / 30, 1000 + i * 33));
    const closed = owned.filter((e, i) => Math.hypot(e.x - 600, e.y) < start[i]).length;

    ok("every ship closes on the player", closed === owned.length);
    ok("they open fire", shots.length > 0);
    ok("each ship picked a target", owned.every((e) => e._tgtId === "p1"));

    // With ONE target there is no runner-up, so no counterfactual, so esTactics records no features.
    // That is not a gap — it is the learner refusing to invent a gradient it cannot justify. The pilot
    // therefore generates training samples only when there is a real choice to have made.
    ok("one target -> no features recorded (no counterfactual, no gradient)",
        owned.every((e) => e._tacFeat === undefined));

    const two = myShare(makeWorld("r2", 128, 4, "brain-1"), "brain-1", ["brain-1"]);
    const p1 = peerAsTarget({ id: "a", x: 400, y: 0, hp: 90 });
    const p2 = peerAsTarget({ id: "b", x: 500, y: 100, hp: 20 });
    tickOwned(two, [p1, p2], DEFAULT_W, 1 / 30, 1000);
    ok("two targets -> features AND the counterfactual are recorded",
        two.every((e) => e._tacFeat && e._tacAlt));

    // shot shape: the browser's fv.ingestShot reads exactly these fields
    const s = shots[0];
    ok("shots are typed for the event bus", s.type === "shot" && s.team === "enemy");
    ok("shots carry integer position + velocity", [s.x, s.y, s.vx, s.vy].every(Number.isInteger));
    ok("shots carry damage and a lifetime", s.dmgShield > 0 && s.dmgArmor > 0 && s.life > 0);

    // THE DIRECTION GUARD. cos/sin instead of the engine's {sin, -cos} fires 90 degrees off. A "does
    // some shot point roughly at the player" test is too weak — ships circle, so it passes anyway.
    // Pin the convention exactly: a ship at heading 0 must fire straight up the -y axis.
    {
        const [g] = makeWorld("dir", 128, 1, "brain-1");
        g.x = 0; g.y = 0; g.vx = 0; g.vy = 0; g.heading = 0; g._cool = 0;
        const straightUp = { id: "up", x: 0, y: -300, team: "player", isPlayer: true,
            shield: 50, armor: 50, maxShield: 100, maxArmor: 100, dps: 10 };
        const fired = tickOwned([g], [straightUp], DEFAULT_W, 1 / 60, 9000);
        ok("a ship already aimed at its target fires immediately", fired.length === 1);
        const sh = fired[0];
        ok("heading 0 fires along -y (engine convention {sin, -cos}), not +x (cos/sin)",
            Math.abs(sh.vx) < 5 && sh.vy < -800);
    }

    // rate limiting: a ship must not empty the event bus every frame
    const perShip = shots.length / owned.length;
    ok("fire rate is bounded by the cooldown (not one shot per frame)", perShip < 300 / 10);
}

// ---- a fleeing ship does not shoot -------------------------------------------------------
{
    const [e] = makeWorld("r", 128, 1, "brain-1");
    e.shield = 1; e.armor = 1;                                   // nearly dead
    const boss = { id: "big", x: e.x + 100, y: e.y, team: "player", isPlayer: true,
        shield: 900, armor: 900, maxShield: 900, maxArmor: 900, dps: 90 };
    const shots = tickOwned([e], [boss], DEFAULT_W, 1 / 30, 5000);
    ok("an outmatched ship breaks off", e._fleeing === true);
    ok("...and does not keep firing while it runs (that would teach the policy a lie)", shots.length === 0);
}

// ---- degenerate inputs -------------------------------------------------------------------
{
    const world = makeWorld("r", 128, 4, "brain-1");
    ok("no targets -> no shots, no crash", tickOwned(world, [], DEFAULT_W, 1 / 30, 1).length === 0);
    ok("no owned ships -> no shots", tickOwned([], [peerAsTarget({ id: "p", x: 0, y: 0 })], DEFAULT_W, 1 / 30, 1).length === 0);
    const dead = world.map((e) => ({ ...e, dead: true }));
    ok("dead ships neither move nor shoot",
        tickOwned(dead, [peerAsTarget({ id: "p", x: 0, y: 0 })], DEFAULT_W, 1 / 30, 1).length === 0);

    const target = peerAsTarget({ id: "p", x: 500, y: 0, hp: 50 });
    const snapshot = JSON.stringify(target);
    tickOwned(world, [target], DEFAULT_W, 1 / 30, 1);
    ok("the tick never mutates the target it was handed", JSON.stringify(target) === snapshot);
}

// ---- v2171: the pilot takes damage --------------------------------------------------------
{
    const ME = "brain-1", ids = [ME, "p1"].sort();
    const world = makeWorld("dmg", 128, 3, ME);
    const seen = new Map();
    const shield0 = world[0].shield;

    // a glancing hit: applied, not fatal
    const graze = damageEvent(world[0].id, "p1", 1, 5, 0, 128, 1000);
    let r = ingestDamage(world, [graze], ME, ids, seen, { now: 1000 });
    ok("a hit on our ship is applied", r.taken === 1 && r.killed.length === 0 && world[0].shield === shield0 - 5);
    ok("...and the ship is still flying", world[0].dead !== true);

    // the same event again: the ring redelivers, we do not take it twice
    const before = world[0].shield;
    r = ingestDamage(world, [graze], ME, ids, seen, { now: 1001 });
    ok("a redelivered hit is dropped, not applied twice", r.taken === 0 && r.dropped === 1 && world[0].shield === before);

    // somebody else's ship, and a forged hit on our own
    r = ingestDamage(world, [damageEvent(wingId("brain-2", 0), "p1", 9, 5, 5, 128, 1002)], ME, ids, seen, { now: 1002 });
    ok("a hit on another pilot's wing is not ours to apply", r.taken === 0 && r.dropped === 1);
    r = ingestDamage(world, [damageEvent(world[1].id, ME, 99, 500, 500, 128, 1003)], ME, ids, seen, { now: 1003 });
    ok("we cannot report a hit on our own ship", r.taken === 0 && world[1].dead !== true);

    // and the kill
    r = ingestDamage(world, [damageEvent(world[0].id, "p1", 2, 9999, 0, 128, 1100)], ME, ids, seen, { now: 1100 });
    ok("damage above the cap never lands", r.taken === 0 && world[0].dead !== true);
    r = ingestDamage(world, [damageEvent(world[0].id, "p1", 3, before + world[0].armor, 0, 128, 1200)], ME, ids, seen, { now: 1200 });
    ok("enough damage destroys it", r.killed.length === 1 && world[0].dead === true);
    ok("...and the time of death is recorded (respawn needs it)", world[0]._diedAt === 1200);
    ok("a destroyed ship stops being simulated", myShare(world, ME, ids).length === 2);
    r = ingestDamage(world, [damageEvent(world[0].id, "p1", 4, 50, 50, 128, 1300)], ME, ids, seen, { now: 1300 });
    ok("you cannot kill it twice", r.taken === 0 && r.dropped === 1);
}

// ---- v2171: a destroyed ship comes back ---------------------------------------------------
{
    const ME = "brain-1";
    const world = makeWorld("rsp", 128, 2, ME);
    const e = world[0];
    const home = { ...e._home };
    e.dead = true; e._diedAt = 1000; e.shield = 0; e.armor = -3; e.x = 9999; e._tgtId = "p1"; e._tacFeat = { a: 1 };

    ok("nothing comes back before its time", respawn(world, 1000 + 19999, 20000).length === 0);
    ok("respawn can be switched off entirely", respawn(world, 1e9, 0).length === 0 && world[0].dead === true);

    const back = respawn(world, 1000 + 20001, 20000);
    ok("a ship returns when the timer says so", back.length === 1 && e.dead === false);
    ok("...to where it spawned", e.x === home.x && e.y === home.y);
    ok("...whole", e.shield === e.maxShield && e.armor === e.maxArmor);
    ok("...with no memory of the fight that killed it (a stale decision teaches nothing)",
        e._tgtId === null && e._tacFeat === null && e._fleeing === false);
    ok("...and flies again", myShare(world, ME, [ME]).length === 2);
}

// ---- v2171: what the pilot tells the policy ------------------------------------------------
{
    // OUR SHIP DIED -> the target it chose over the runner-up was the wrong one.
    const withFeat = { _tacFeat: { reach: 1 }, _tacAlt: { reach: 0 } };
    const bare = {};                                     // decided nothing, or had no counterfactual
    const out = outcomesForDeaths([{ ...withFeat }, bare]);
    ok("a dead ship's last decision is reported as a loss", out.length === 1 && out[0].reward === -1);
    ok("...with its counterfactual attached", out[0].chosen && out[0].alt);
    ok("a decision with no counterfactual carries no gradient and is not invented",
        outcomesForDeaths([bare]).length === 0);
    ok("no deaths -> nothing to say", outcomesForDeaths([]).length === 0 && outcomesForDeaths(null).length === 0);

    // OUR TARGET DIED -> the ships that chose it were right.
    const world = [
        { id: "a", _tgtId: "p1", ...withFeat },
        { id: "b", _tgtId: "p2", ...withFeat },          // shooting somebody else
        { id: "c", _tgtId: "p1", dead: true, ...withFeat },   // dead ships take no credit
        { id: "d", _tgtId: "p1" },                        // no counterfactual
    ];
    const won = outcomesForTargetDeath("p1", world);
    ok("only the ships that chose the dead target are credited", won.length === 1 && won[0].reward === +1);
    ok("an unknown target credits nobody", outcomesForTargetDeath("p9", world).length === 0);
}

// ---- v2171: which pilots actually died ------------------------------------------------------
{
    const prev = new Map();
    ok("the first sighting of a pilot is not a death", deadTargets(prev, [{ id: "p1", hp: 100 }]).length === 0);
    ok("a wound is not a death", deadTargets(prev, [{ id: "p1", hp: 30 }]).length === 0);
    const d = deadTargets(prev, [{ id: "p1", hp: 0 }]);
    ok("hp reaching zero, seen with our own eyes, is a death", d.length === 1 && d[0] === "p1");
    ok("...counted once", deadTargets(prev, [{ id: "p1", hp: 0 }]).length === 0);

    // A pilot who JUMPS OUT looks exactly like a pilot who died, if you only watch the peer list.
    // We claim nothing we did not see: the departure clears the record instead of scoring it.
    const prev2 = new Map();
    deadTargets(prev2, [{ id: "p2", hp: 80 }]);
    ok("a pilot who leaves is not a kill", deadTargets(prev2, []).length === 0 && prev2.size === 0);
    ok("...and if they come back, their old hp is not held against them",
        deadTargets(prev2, [{ id: "p2", hp: 100 }]).length === 0);
    ok("a pilot reporting no hp at all is ignored, not assumed dead",
        deadTargets(new Map(), [{ id: "p3" }]).length === 0);
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
