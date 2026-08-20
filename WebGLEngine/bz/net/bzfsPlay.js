// WebGLEngine/bz/net/bzfsPlay.js — what it takes to be alive on somebody else's server.
//
// `brain/bzfsPilot.mjs` learned these rules the hard way, against a real `bzfs`. The browser now needs the
// same ones, and a second copy of them would be a second set of bugs. So they live here, and the only
// difference between a GPU Brain playing and a person playing is where `input` comes from.
//
// THE RULE THAT ORGANISES EVERYTHING ELSE: `bzfs` DOES NO HIT DETECTION. BZFlag is client-authoritative for
// death. The server never decides you were shot; you decide, and you send `MsgKilled` naming your own killer,
// and the server takes your word for it because it has no way of forming its own opinion. A client that only
// fires is a client nobody can kill and who never dies -- which is exactly what three GPU Brains did on a
// real server for eighty rounds before anybody noticed.
//
// So every frame:
//
//   1. fly OTHER PLAYERS' shots locally, against our own hull. One lands -> tell the server we died.
//   2. if dead and the timer is up, find a spawn, send MsgAlive, and THROW AWAY THE INCOMING SHOTS --
//      a shot fired at where we used to be was not fired at us.
//   3. step our own tank with whatever input we were given, in the world the server gave us.
//   4. tell the server where we are, and what we fired. It decides nothing about either.
//
// The bookkeeping of a death happens when the server BROADCASTS it back, not when we report it, so a
// self-report and a `MsgKilled` about somebody else are counted the same way, exactly once.

"use strict";

import { stepTank, stepShot } from "../bzTank.js";
import { pointInTank, findSpawn } from "../bzCombat.js";
import { Status } from "./bzPlayerState.js";
import { FlagStatus, applyFlag, withinGrabRange, SHOT_FLAGS } from "./bzFlags.js";
import { applyShotFlag } from "../bzShotFlags.js";

const MAX_INCOMING = 128;        // a flood costs a frame, never the loop
const DEFAULT_RESPAWN_MS = 3000;

// `client` is anything with `.playerId`, `.state`, `.spawn()`, `.die()`, `.fire()`, `.sendState()`. That is
// bz/net/bzfsClient.mjs, and it is also a hand-written stub in bz/tools/bz-session-selfcheck.mjs, which is
// how these rules are checked without a server.
// `world` and `tank` may be null at first. With no `--map` the world arrives over the wire, and MsgAddPlayer
// arrives BEFORE it -- so a session created only once the world lands never learns who is in the game, and a
// pilot with no targets never fires. Build the session at once and `attach()` the world when it comes.
function createPlaySession({ client, world = null, tank = null, rnd = Math.random, respawnMs = DEFAULT_RESPAWN_MS, team = null, on = {} }) {
    let alive = false;
    // v2202 -- the flag we are carrying, and the spec it gives us. `baseSpec` is BZDB's, and a flag
    // multiplies it; dropping restores it, which is why the flag never mutates the tank's own numbers.
    let flagAbbrev = null;
    let db = null;
    // Captured at `attach()`, not at construction: with no `--map` the tank does not exist yet.
    let baseSpec = tank ? tank.spec : null;
    // v2201 -- `-Infinity`, not 0. A fresh session has never died, so it must not wait out a respawn timer
    // it never earned. In brain/bzfsPilot.mjs this was hidden by `Date.now()` being a large number and
    // `diedAt` being zero; a session handed a clock that starts at zero would have sat there forever.
    let diedAt = -Infinity;
    let incoming = [];
    let kills = 0, losses = 0, shots = 0;
    const peers = new Map();

    // --- what the server tells us ---------------------------------------------------------------------
    function addPlayer(p) {
        peers.set(p.id, { id: p.id, callsign: p.callsign, team: p.team, pos: [0, 0, 0], angle: 0, alive: true });
        if (p.id === client.playerId) team = p.team;
    }
    function removePlayer(p) { peers.delete(p.id); }
    function playerUpdate(u) {
        const p = peers.get(u.playerId);
        if (!p) return;
        p.pos = u.state.pos;
        p.angle = u.state.azimuth;
        p.alive = (u.state.status & Status.Alive) !== 0;
    }
    // Somebody else's shot. Ours never comes back to us: the server does not echo a shot to its owner.
    function shotBegin(sh) {
        if (sh.player === client.playerId) return;
        incoming.push({ pos: sh.pos.slice(), vel: sh.vel.slice(), life: sh.lifetime, owner: sh.player, shotId: sh.shotId, dead: false });
        if (incoming.length > MAX_INCOMING) incoming.shift();
    }
    // The server's broadcast. It carries the victim, which the message WE send does not -- the server knows
    // who sent it and prepends it. This is where a death is counted, whoever reported it.
    // v2201 -- `now` is passed, not read. `step()` is handed a clock and `killed()` must use the same one, or
    // a session driven by an injected clock stamps its death in another era and never respawns. And the
    // timer only restarts on the TRANSITION: when we reported our own death a moment ago, the server's
    // broadcast confirming it must not push the respawn back by a round trip.
    function killed(k, now = Date.now()) {
        if (k.victim === client.playerId) {
            if (alive) diedAt = now;
            alive = false;
            losses++;
            // The server drops a dead tank's flag and tells everybody. We do not wait to be told about our
            // own spec: a dead tank with a Velocity flag's speed is a tank that respawns wrong.
            setFlag(null);
            if (on.death) on.death(k);
        } else if (k.killer === client.playerId) {
            kills++;
            if (on.kill) on.kill(k);
        }
        const p = peers.get(k.victim);
        if (p) p.alive = false;
    }

    // --- flags ------------------------------------------------------------------------------------------
    //
    // A SHIELD ABSORBS ONE HIT AND THE FLAG GOES, NOT YOU. Every other implemented flag is a multiplier on a
    // number bz/bzTank.js already uses, so carrying one is a new `spec` and dropping one is the old spec back.
    function setFlag(abbrev) {
        flagAbbrev = abbrev || null;
        if (!tank || !baseSpec) return;
        tank.spec = flagAbbrev ? applyFlag(baseSpec, flagAbbrev, db) : baseSpec;
    }
    function grabbed(g) {
        if (g.playerId !== client.playerId) return;
        setFlag(g.flag.type);
        if (on.flag) on.flag(flagAbbrev);
    }
    function dropped(d) {
        if (d.playerId !== client.playerId) return;
        setFlag(null);
        if (on.flag) on.flag(null);
    }
    function captured(c) {
        if (c.playerId !== client.playerId) return;
        setFlag(null);
        if (on.flag) on.flag(null);
    }
    // Every flag lying on the ground, from the client. We only reach for one we can reach.
    function reachable(flags) {
        if (!tank) return null;
        for (const f of flags.values()) {
            if (f.status !== FlagStatus.OnGround) continue;
            if (withinGrabRange(f.position, tank.pos, Math.max(tank.spec.dx, tank.spec.dy))) return f;
        }
        return null;
    }

    // --- and one frame of being alive ------------------------------------------------------------------
    // `input` is `{ forward, turn, jump, fire }` -- a hand on a keyboard, or bz/bzPilot.js's `decide()`.
    function step(dt, input, now = Date.now()) {
        if (!world || !tank) return { alive };

        if (!alive) {
            if (now - diedAt < respawnMs) return { alive: false, waiting: true };
            const spot = findSpawn(world, tank, [], rnd, { team });
            if (spot) { tank.pos = spot.pos.slice(); tank.angle = spot.angle; }
            tank.dead = false; tank.vz = 0; tank.onGround = true; tank.reload = 0;
            // A shot fired at where we used to be was not fired at us.
            incoming = [];
            client.spawn();
            alive = true;
            return { alive: true, respawned: true };
        }

        // 1. Their shots, against our hull. The server has no opinion about this and never will.
        for (const s of incoming) {
            if (s.dead) continue;
            stepShot(s, world, dt);
            s.life -= dt;
            if (s.life <= 0) { s.dead = true; continue; }
            if (!pointInTank(s.pos, tank)) continue;
            s.dead = true;
            // A SHIELD EATS THE HIT. The flag goes; you do not. We drop it where we stand, and the server
            // broadcasts the drop back to everybody -- including to us, which is where `flagAbbrev` clears.
            if (flagAbbrev === "SH") { client.drop(tank.pos.slice()); if (on.shielded) on.shielded(s); continue; }
            client.die({ killer: s.owner, shotId: s.shotId });
            alive = false;
            diedAt = now;
            break;
        }
        incoming = incoming.filter((s) => !s.dead);
        if (!alive) return { alive: false, justDied: true };

        // 2. If we are standing on a flag and carrying none, ask for it. The server decides.
        if (!flagAbbrev && client.flags) {
            const f = reachable(client.flags);
            if (f) client.grab(f.index);
        }

        // 3. Our own tank, in the server's world, by our own physics -- with whatever the flag did to it.
        const r = stepTank(tank, input || {}, world, dt);

        // 4. Where we are. `velocity` is what the server dead-reckons between our updates.
        const speed = tank.spec.speed * (input && input.forward ? input.forward : 0);
        client.sendState({
            status: Status.Alive | (tank.onGround ? 0 : Status.Falling),
            pos: tank.pos,
            velocity: [Math.cos(tank.angle) * speed, Math.sin(tank.angle) * speed, tank.vz],
            azimuth: tank.angle,
            angVel: (input && input.turn ? input.turn : 0) * tank.spec.angVel,
            timeStamp: now / 1000,
        });

        // 5. And what we fired. Whether it hits is somebody else's decision, made on their machine.
        if (r.fired) {
            // v2211 -- if we are carrying a shot flag, the bullet we fire IS a flagged bullet: a laser is a
            // thousand times faster, a machine gun's shot lives a tenth as long. applyShotFlag reads BZDB, so
            // a server that -set the multipliers is obeyed.
            let fired = r.fired;
            if (flagAbbrev && SHOT_FLAGS.has(flagAbbrev) && db) {
                fired = applyShotFlag({ pos: r.fired.pos, vel: r.fired.vel, life: r.fired.life }, flagAbbrev, db);
            }
            client.fire({ pos: fired.pos, vel: fired.vel, timeSent: now / 1000, lifetime: fired.life });
            shots++;
        }
        return { alive: true, fired: !!r.fired, blocked: r.blocked || null };
    }

    // Hand these straight to `createClient`'s `on` object, or call them from your own.
    const handlers = { addPlayer, removePlayer, playerUpdate, shotBegin, killed, grabFlag: grabbed, dropFlag: dropped, captureFlag: captured };

    return {
        step, handlers,
        // The other tanks, in the shape bz/bzPilot.js scores and bzflag.html draws.
        targets: () => [...peers.values()]
            .filter((p) => p.id !== client.playerId && p.alive)
            .map((p) => ({ id: p.id, pos: p.pos, angle: p.angle, onGround: p.pos[2] <= 0.01, dead: false, callsign: p.callsign })),
        peers: () => new Map(peers),
        get alive() { return alive; },
        get kills() { return kills; },
        get losses() { return losses; },
        get shots() { return shots; },
        get incoming() { return incoming.length; },
        get team() { return team; },
        // The world and the tank, once they exist. Everything before this point is bookkeeping, and
        // bookkeeping is exactly what must not be missed: MsgAddPlayer arrives before MsgGetWorld.
        attach: (w, t, bzdb = null) => { world = w; tank = t; db = bzdb || (w && w.bzdb) || null; baseSpec = t ? t.spec : null; },
        get flag() { return flagAbbrev; },
        get ready() { return !!(world && tank); },
        // Only for a caller that already knows it died some other way (a physics driver, water, an exit).
        markDead: (nowMs = Date.now()) => { alive = false; diedAt = nowMs; },
    };
}

export { createPlaySession, MAX_INCOMING, DEFAULT_RESPAWN_MS };
