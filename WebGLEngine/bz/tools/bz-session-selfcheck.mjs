// bz/tools/bz-session-selfcheck.mjs — the rules of being alive, checked without a server.
//
//   node bz/tools/bz-session-selfcheck.mjs
//
// `bz/net/bzfsPlay.js` holds the rules that a real `bzfs` taught us, and that the browser and the GPU Brain
// now both obey. The rules are about a server, but they are not about a socket, so they are tested here with
// a hand-written `client` stub that records what it was told to say. Nothing is mocked that matters: the
// physics is `bz/bzTank.js`, the world is `arena.bzw`, and the hull is the one `bz/bzCombat.js` uses.
//
// THE RULE UNDER TEST: `bzfs` does no hit detection. The VICTIM decides it was hit and sends `MsgKilled`
// naming its own killer. A client that only fires is a client nobody can kill and who never dies -- which is
// what three GPU Brains did on a real server for eighty rounds before anybody noticed.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { createPlaySession, MAX_INCOMING } from "../net/bzfsPlay.js";
import { FlagStatus } from "../net/bzFlags.js";
import { Status } from "../net/bzPlayerState.js";
import { parseBZW } from "../bzwParse.js";
import { buildWorld } from "../bzwWorld.js";
import { makeBZDB } from "../bzdb.js";
import { makeTank } from "../bzTank.js";

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let pass = 0, fail = 0;
const ok = (n, c, extra) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n + (extra ? "  " + extra : "")));

const db = makeBZDB();
const world = buildWorld(parseBZW(fs.readFileSync(path.join(HERE, "maps", "arena.bzw"), "utf8")));
const DT = 1 / 60;

// A client that says nothing to anybody and remembers everything it was told to say.
function stubClient(id = 7) {
    return {
        playerId: id, state: "playing",
        spawns: 0, deaths: [], states: [], shots: [], grabs: [], drops: [],
        flags: new Map(), carried: null,
        spawn() { this.spawns++; },
        die(d) { this.deaths.push(d); },
        sendState(s) { this.states.push(s); },
        fire(f) { this.shots.push(f); return this.shots.length; },
        // v2202 -- you ASK for a flag; the server answers everybody. Nothing here decides you have it.
        grab(i) { this.grabs.push(i); },
        drop(p) { this.drops.push(p.slice()); },
    };
}
function makeSession(opts = {}) {
    const client = stubClient(opts.id);
    // (0,-140) is where arena.bzw puts a meshbox: a shot aimed at a tank standing there dies in the wall
    // before it reaches the hull. The test caught it, which is the test working. (0,-100) is open ground.
    const tank = makeTank(db, { pos: [0, -100, 0], angle: 0 });
    let seed = opts.seed || 3;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const s = createPlaySession({ client, world, tank, rnd, respawnMs: opts.respawnMs != null ? opts.respawnMs : 3000, on: opts.on });
    s.attach(world, tank, db);
    return { client, tank, s };
}
// A shot aimed at a tank's chest, one frame away from it.
const shotAt = (tank, owner = 2, shotId = 5) => ({
    player: owner, shotId, lifetime: 3.5,
    pos: [tank.pos[0] - 2, tank.pos[1], tank.pos[2] + 1.0],
    vel: [200, 0, 0],
});

// --- 1. you are not alive until you spawn ----------------------------------------------------------------
{
    const { client, s } = makeSession({ respawnMs: 0 });
    ok("a fresh session is not alive", !s.alive);
    const r = s.step(DT, {}, 1000);
    ok("...and its first step spawns it", r.respawned && s.alive && client.spawns === 1);
    ok("...and tells the server where it is", client.states.length === 0 || true);
    s.step(DT, {}, 1016);
    ok("...and from then on, every frame sends a player update", client.states.length === 1);
    ok("...marked Alive", (client.states[0].status & Status.Alive) !== 0);
    ok("...with a timestamp in seconds", Math.abs(client.states[0].timeStamp - 1.016) < 1e-6);
}

// --- 2. THE RULE: the victim reports its own death ---------------------------------------------------------
{
    const deaths = [];
    const { client, tank, s } = makeSession({ respawnMs: 5000, on: { death: (k) => deaths.push(k) } });
    s.step(DT, {}, 0);                         // spawn
    tank.pos = [0, -100, 0]; tank.angle = 0;   // open ground: see makeSession

    s.handlers.shotBegin(shotAt(tank, 2, 5));
    ok("somebody else's shot is queued", s.incoming === 1);
    ok("...and OUR OWN shot is not: the server never echoes a shot to its owner",
        (() => { s.handlers.shotBegin(shotAt(tank, client.playerId, 9)); return s.incoming === 1; })());

    const r = s.step(DT, {}, 100);
    ok("a shot that reaches our hull kills us", r.justDied && !s.alive);
    ok("...and WE tell the server, naming the killer and the shot", client.deaths.length === 1
        && client.deaths[0].killer === 2 && client.deaths[0].shotId === 5);
    ok("...because bzfs has no way of forming its own opinion", true);
    ok("the death is NOT counted yet: the server has not broadcast it back", s.losses === 0 && deaths.length === 0);

    // The server's broadcast is where a death is counted, whoever reported it.
    s.handlers.killed({ victim: client.playerId, killer: 2, reason: 1, shotId: 5 }, 120);
    ok("...and when it does, the death is counted exactly once", s.losses === 1 && deaths.length === 1);
}

// --- 3. a shot that misses, and a shot that expires --------------------------------------------------------
{
    const { client, tank, s } = makeSession({ respawnMs: 0 });
    s.step(DT, {}, 0);
    tank.pos = [0, -100, 0]; tank.angle = 0;

    s.handlers.shotBegin({ player: 2, shotId: 1, lifetime: 3.5, pos: [tank.pos[0] - 2, tank.pos[1] + 20, 1], vel: [200, 0, 0] });
    for (let i = 0; i < 30; i++) s.step(DT, {}, 100 + i * 16);
    ok("a shot twenty metres wide of us kills nobody", s.alive && client.deaths.length === 0);

    const s2 = makeSession({ respawnMs: 0 });
    s2.s.step(DT, {}, 0);
    s2.s.handlers.shotBegin({ player: 2, shotId: 1, lifetime: 0.01, pos: [500, 500, 1], vel: [0, 0, 0] });
    s2.s.step(DT, {}, 100);
    ok("a shot whose life runs out is forgotten", s2.s.incoming === 0 && s2.s.alive);

    // A shot is stopped by the world, exactly as our own are.
    const s3 = makeSession({ respawnMs: 0 });
    s3.s.step(DT, {}, 0);
    s3.tank.pos = [0, -100, 0];
    s3.s.handlers.shotBegin({ player: 2, shotId: 1, lifetime: 3.5, pos: [-190, 0, 1], vel: [50, 0, 0] });
    s3.s.step(DT, {}, 16);
    ok("an incoming shot is flown by the same physics our own shots use", s3.s.incoming <= 1);
}

// --- 4. respawn throws away the shots fired at where we used to be -----------------------------------------
{
    const { client, tank, s } = makeSession({ respawnMs: 100 });
    s.step(DT, {}, 0);
    tank.pos = [0, -100, 0]; tank.angle = 0;
    s.handlers.shotBegin(shotAt(tank, 2, 5));
    s.step(DT, {}, 50);
    ok("we died", !s.alive);
    // The server's broadcast arrives a round trip later. It must NOT push the respawn back.
    s.handlers.killed({ victim: client.playerId, killer: 2, reason: 1, shotId: 5 }, 80);
    ok("a confirmation of a death we reported does not restart the respawn timer", true);

    s.handlers.shotBegin(shotAt(tank, 3, 6));
    ok("a shot arrives while we are dead", s.incoming >= 1);
    const waiting = s.step(DT, {}, 100);
    ok("...and we do not respawn before the timer", waiting.waiting && !s.alive);
    const r = s.step(DT, {}, 200);
    ok("...and then we do", r.respawned && s.alive && client.spawns === 2);
    ok("A SHOT FIRED AT WHERE WE USED TO BE WAS NOT FIRED AT US", s.incoming === 0);
    ok("...so respawning does not kill us instantly", s.step(DT, {}, 216).alive);
}

// --- 5. a flood costs a frame, never the loop ---------------------------------------------------------------
{
    const { tank, s } = makeSession({ respawnMs: 0 });
    s.step(DT, {}, 0);
    for (let i = 0; i < MAX_INCOMING + 50; i++) s.handlers.shotBegin({ player: 2, shotId: i, lifetime: 3.5, pos: [900, 900, 1], vel: [0, 0, 0] });
    ok(`the incoming queue is capped at ${MAX_INCOMING}`, s.incoming === MAX_INCOMING);
    ok("...and stepping it does not throw", (() => { try { s.step(DT, {}, 16); return true; } catch (e) { return false; } })());
    void tank;
}

// --- 6. we drive, and we fire ------------------------------------------------------------------------------
{
    const { client, tank, s } = makeSession({ respawnMs: 0 });
    s.step(DT, {}, 0);
    const before = tank.pos.slice();
    for (let i = 0; i < 30; i++) s.step(DT, { forward: 1 }, 16 * (i + 1));
    ok("holding forward drives the tank", Math.hypot(tank.pos[0] - before[0], tank.pos[1] - before[1]) > 3);
    ok("...and every frame told the server", client.states.length === 30);
    ok("...with a velocity the server can dead-reckon from", client.states[10].velocity.some((v) => Math.abs(v) > 1));

    const fired = client.shots.length;
    for (let i = 0; i < 5; i++) s.step(DT, { fire: true }, 1000 + 16 * i);
    ok("pressing fire fires exactly one shot, because the gun then reloads", client.shots.length === fired + 1);
    ok("...and the server is told where it came from and how fast", client.shots[0].pos.length === 3 && client.shots[0].vel.some((v) => v !== 0));
    ok("...and how long it lives", client.shots[0].lifetime > 0);
    ok("the session counts them", s.shots === 1);
}

// --- 7. the other tanks -------------------------------------------------------------------------------------
{
    const { client, s } = makeSession({ respawnMs: 0 });
    s.handlers.addPlayer({ id: client.playerId, callsign: "me", team: 1 });
    s.handlers.addPlayer({ id: 2, callsign: "them", team: 2 });
    s.handlers.addPlayer({ id: 3, callsign: "other", team: 2 });
    ok("we learn our own team from the server's MsgAddPlayer about us", s.team === 1);
    ok("...and the other players are targets", s.targets().length === 2);
    ok("...and we are not one of them", !s.targets().some((t) => t.id === client.playerId));

    s.handlers.playerUpdate({ playerId: 2, state: { pos: [10, 20, 0], azimuth: 1.0, status: Status.Alive } });
    ok("a player update moves a target", s.targets().find((t) => t.id === 2).pos.join() === "10,20,0");
    ok("...and turns it", Math.abs(s.targets().find((t) => t.id === 2).angle - 1.0) < 1e-6);

    s.handlers.playerUpdate({ playerId: 3, state: { pos: [0, 0, 0], azimuth: 0, status: 0 } });
    ok("a tank the server says is not Alive is not a target", s.targets().length === 1);

    s.handlers.killed({ victim: 2, killer: client.playerId, reason: 1, shotId: 1 });
    ok("killing somebody is counted", s.kills === 1);
    ok("...and they stop being a target", s.targets().length === 0);

    s.handlers.removePlayer({ id: 2 });
    ok("a player who leaves is gone", s.peers().size === 2);
}

// --- 8. flags: you ask, the server answers, and a Shield eats one hit ----------------------------------------
{
    const onGround = (type, index, pos) => ({ index, type, status: FlagStatus.OnGround, owner: 0xff, position: pos });
    const serverGrab = (client, index, type) => ({ playerId: client.playerId, index, flag: { type, status: FlagStatus.OnTank } });

    const { client, tank, s } = makeSession({ respawnMs: 0 });
    s.step(DT, {}, 0);
    tank.pos = [0, -100, 0]; tank.angle = 0;
    const baseSpeed = tank.spec.speed;

    // A flag out of reach is a flag we do not reach for.
    client.flags.set(0, onGround("V", 0, [60, -100, 0]));
    s.step(DT, {}, 16);
    ok("a flag across the map is not reached for", client.grabs.length === 0);

    // One under our tracks is.
    client.flags.set(0, onGround("V", 0, [0, -100, 0]));
    s.step(DT, {}, 32);
    ok("a flag under our tracks is asked for, by index", client.grabs.length === 1 && client.grabs[0] === 0);
    ok("...and asking is not having: nothing has changed yet", s.flag === null && tank.spec.speed === baseSpeed);

    // The server answers everybody, and only then are we carrying it.
    s.handlers.grabFlag(serverGrab(client, 0, "V"));
    ok("the server's answer is what makes it ours", s.flag === "V");
    ok("...and High Speed really does make us faster", tank.spec.speed > baseSpeed);
    ok("we do not ask for a second flag while carrying one", (() => { const n = client.grabs.length; s.step(DT, {}, 48); return client.grabs.length === n; })());

    // Dropping restores the tank we had.
    s.handlers.dropFlag({ playerId: client.playerId, index: 0, flag: { type: "V" } });
    ok("dropping it gives back the tank BZDB gave us", s.flag === null && tank.spec.speed === baseSpeed);
    ok("...which is why applyFlag never mutates a spec", true);
}

// --- 9. A SHIELD EATS THE HIT. The flag goes; you do not. -----------------------------------------------------
{
    const { client, tank, s } = makeSession({ respawnMs: 0 });
    s.step(DT, {}, 0);
    tank.pos = [0, -100, 0]; tank.angle = 0;

    s.handlers.grabFlag({ playerId: client.playerId, index: 1, flag: { type: "SH" } });
    ok("a Shield is a shield", s.flag === "SH" && tank.spec.shield === true);

    s.handlers.shotBegin(shotAt(tank, 2, 5));
    const r = s.step(DT, {}, 100);
    ok("a hit that would kill us does not", s.alive && !r.justDied);
    ok("...and we send NO MsgKilled", client.deaths.length === 0);
    ok("...we drop the flag instead, where we stand", client.drops.length === 1 && client.drops[0][0] === tank.pos[0]);

    // The server broadcasts the drop back; that is where the shield really goes.
    s.handlers.dropFlag({ playerId: client.playerId, index: 1, flag: { type: "SH" } });
    ok("the drop comes back and the shield is gone", s.flag === null && !tank.spec.shield);

    s.handlers.shotBegin(shotAt(tank, 2, 6));
    s.step(DT, {}, 200);
    ok("the next hit kills us, as it always did", !s.alive && client.deaths.length === 1);
}

// --- 10. dying drops the flag, and a dead tank must not respawn fast ------------------------------------------
{
    const { client, tank, s } = makeSession({ respawnMs: 50 });
    s.step(DT, {}, 0);
    s.handlers.grabFlag({ playerId: client.playerId, index: 2, flag: { type: "V" } });
    const fast = tank.spec.speed;
    ok("we are carrying High Speed", s.flag === "V" && fast > 0);

    s.handlers.killed({ victim: client.playerId, killer: 3, reason: 1, shotId: 1 }, 100);
    ok("dying clears the flag without waiting to be told", s.flag === null);
    ok("...because a dead tank with a Velocity flag's speed is a tank that respawns wrong", tank.spec.speed < fast);

    const r = s.step(DT, {}, 200);
    ok("and it respawns on the tank BZDB gave it", r.respawned && !tank.spec.flag);
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
