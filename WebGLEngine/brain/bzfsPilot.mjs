// WebGLEngine/brain/bzfsPilot.mjs — the GPU Brain, on somebody else's server.
//
//   node brain/bzfsPilot.mjs --host <server> --port 5154 --callsign brain --map bz/maps/arena.bzw
//   node brain/bzfsPilot.mjs --host <server> --observe          # watch, do not play
//
// `brain/bzPilot.mjs` drives a tank in OUR room, where we own the world and the physics. This drives a tank
// in somebody else's game, where we own neither. It is the same mind -- `bz/bzPilot.js`, unchanged -- with a
// different set of eyes and a different mouth.
//
// v2197 -- IT DRIVES ON THE SERVER'S OWN MAP NOW. `MsgGetWorld` arrives as BZFlag's binary world database;
// bz/net/bzWorldDb.js verifies its MD5 and inflates it, bz/net/bzWorldSections.js walks its ten sections, and
// bz/net/bzWorldAdapt.js turns the result into the same world object `bz/bzwWorld.js` builds from a `.bzw`.
// Every module downstream -- collision, geometry, the policy -- works unchanged.
//
// So `--map` is now an OVERRIDE, not a requirement. Give it one and it drives on that; give it nothing and it
// drives on whatever the server sent. If the database stops at a record BZFlag's source has not been
// transcribed for -- a group instance, today -- the walk says which, and this pilot falls back to observing
// rather than guessing at a world it cannot see.
//
// An OBSERVER watches, reports who is there and who killed whom, and never sends a position. That is a useful
// thing to be, and it is honest about being it.
//
// What the brain still owns: the policy (`bz/bzPilot.js`, and the learned weights from
// `/ai/brain/bz/tactics` if a bridge is given), the whiskers, the standoff, the aim tolerance. What the
// server owns: whether you are alive, whether your shot hit, and what the score is. We tell it where we are
// and what we fired; it tells us when we died.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { createClient, State } from "../bz/net/bzfsClient.mjs";
import { adaptWorld } from "../bz/net/bzWorldAdapt.js";
import { TeamColor, PlayerType } from "../bz/net/bzProtocol.js";
import { Status } from "../bz/net/bzPlayerState.js";
// v2201 -- the RULES of being alive on a bzfs live in one place now, and the browser obeys the same ones.
// This file keeps the mind; bzfsPlay keeps the body.
import { createPlaySession } from "../bz/net/bzfsPlay.js";

import { makeBZDB } from "../bz/bzdb.js";
import { parseBZW } from "../bz/bzwParse.js";
import { buildWorld } from "../bz/bzwWorld.js";
import { makeTank } from "../bz/bzTank.js";
import { decide, makePilotState, DEFAULT_W, sanitizeWeights, outcomeForDeath, outcomeForKill } from "../bz/bzPilot.js";


const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.dirname(HERE);
const log = (...a) => console.log("[bzfsPilot]", ...a);
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const flag = (n) => process.argv.includes("--" + n);

const TICK_MS = 50;                 // 20Hz, like brain/bzPilot.mjs. The server dead-reckons between them.
const RESPAWN_MS = 3000;
const DEG = 180 / Math.PI;

function makeRng(seed) { let x = seed >>> 0 || 1; return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); }


async function fetchWeights(bridge) {
    if (!bridge) return null;
    try {
        const r = await fetch(bridge + "/ai/brain/bz/tactics", { cache: "no-store" });
        if (!r.ok) return null;
        const j = await r.json();
        if (!j || !j.trained || !j.weights) return null;
        const w = sanitizeWeights(j.weights);
        return w ? { weights: w, samples: j.samples } : null;
    } catch (e) { return null; }
}
async function postOutcomes(bridge, samples) {
    if (!bridge || !samples.length) return null;
    try {
        const r = await fetch(bridge + "/ai/brain/bz/tactics", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ samples }),
        });
        return await r.json();
    } catch (e) { return null; }
}

async function main() {
    const host = arg("host", "127.0.0.1");
    const port = parseInt(arg("port", "5154"), 10);
    const callsign = arg("callsign", "brain").slice(0, 31);
    // v2206 -- a password on `argv` is visible to every process on the box via `ps`. The engine's test page
    // passes it by ENVIRONMENT instead, and `--password` stays for a human at a terminal who has decided
    // that is fine.
    const password = arg("password", "") || process.env.BZFS_PASSWORD || "";
    const bridge = (arg("bridge", "") || "").replace(/\/+$/, "");
    const mapPath = arg("map", "");
    let observe = flag("observe");
    const seconds = parseInt(arg("seconds", "0"), 10) || 0;

    // A real bzfs answers `MsgReject 6: Callsigns must be at least 2 characters.` It is cheaper to be told
    // here than to be told over a socket after a handshake.
    if (callsign.length < 2) { console.error("[bzfsPilot] a callsign must be at least 2 characters; a real bzfs will refuse a shorter one"); process.exit(1); }

    let world = null, tank = null, state = null, db = null;
    const useWorld = (w, from) => {
        db = db || makeBZDB();
        world = w;
        tank = makeTank(db, { pos: [0, 0, 0], angle: 0 });
        state = makePilotState();
        log(`collision from ${from}: ${world.obstacles.length} obstacles, ${world.world.size} units across`);
    };

    if (mapPath) {
        const abs = path.isAbsolute(mapPath) ? mapPath : path.join(ENGINE, mapPath);
        if (!fs.existsSync(abs)) { console.error("[bzfsPilot] no such map: " + abs); process.exit(1); }
        db = makeBZDB();
        useWorld(buildWorld(parseBZW(fs.readFileSync(abs, "utf8"))), path.basename(abs) + " (--map overrides the server's own)");
        log("  IF THIS IS NOT THE SERVER'S MAP, THE TANK WILL DRIVE INTO WALLS THAT ARE NOT THERE.");
    } else if (!observe) {
        log("no --map: the world will come from the server. Waiting for MsgGetWorld.");
    }

    let weights = DEFAULT_W, source = "hand", trainedOn = 0;
    const w0 = await fetchWeights(bridge);
    if (w0) { weights = w0.weights; source = "learned"; trainedOn = w0.samples; }
    // Say how many decisions taught it. A pilot that reports "learned" and nothing else leaves an operator
    // unable to tell a policy shaped by eight fights from one shaped by eight hundred.
    log(`policy: ${source}`
        + (source === "learned" ? ` from ${trainedOn} decisions` : (bridge ? " (the bridge has not learned enough yet)" : " (no bridge)")));

    const rnd = makeRng(callsign.split("").reduce((a, c) => a + c.charCodeAt(0), 11));
    const peers = new Map();          // id -> { id, callsign, pos, alive }
    let reported = 0;
    let lastFeat = null, lastAlt = null;
    let session = null;

    const client = createClient({
        host, port, callsign, password,
        team: observe ? TeamColor.ObserverTeam : TeamColor.AutomaticTeam,
        // v2195 -- an observer is a TANK PLAYER on the observer team. `JAFOPlayer` is bzadmin's type and a
        // real bzfs rejects it with "This game is full", whatever the slot counts say.
        type: PlayerType.TankPlayer,
        udp: !observe,                 // an observer sends nothing, and needs no fast lane
        wantWorld: true,
        log: (...a) => log(...a),
        on: {
            // v2201 -- spawning is the session's business, and the session's first `step()` does it: it finds
            // a spawn (in this team's zone, if the server named one), sends MsgAlive, and starts driving.
            // Nothing here has to remember whether we are alive.
            accepted: () => {
                if (observe) { log("in, as an observer."); return; }
                log(world ? "in. spawning." : "in. waiting for the server's world before spawning.");
            },
            world: (bytes, info) => {
                if (world) { log(`the server's world is ${bytes.length} bytes; --map overrides it`); return; }
                if (!info || !info.ok || !info.usable) {
                    observe = true;
                    log(`cannot use the server's world: ${info ? info.note : "it did not open"}`);
                    log("  observing instead. Hand it the server's .bzw with --map to play.");
                    return;
                }
                const a = adaptWorld(info.world);
                if (!a.ok) { observe = true; log("cannot use the server's world: " + a.reason); return; }
                useWorld(a, "the server's own world database");
                session.attach(world, tank, db);
            },
            addPlayer: (p) => {
                if (session) session.handlers.addPlayer(p);
                if (p.id === client.playerId) log(`we are on team ${p.team}`);
                log(`+ ${p.id} "${p.callsign}"`);
            },
            removePlayer: (p) => { if (session) session.handlers.removePlayer(p); },
            playerUpdate: (u) => { if (session) session.handlers.playerUpdate(u); },
            shotBegin: (sh) => { if (session && !observe) session.handlers.shotBegin(sh); },
            killed: (k) => { if (session) session.handlers.killed(k); },
            // v2202 -- flags. The pilot drives over one and asks; the server decides. Eight of the forty-six
            // change the tank it drives, and thirty-eight are named and do nothing here.
            grabFlag: (g) => { if (session) session.handlers.grabFlag(g); },
            dropFlag: (d) => { if (session) session.handlers.dropFlag(d); },
            captureFlag: (c) => { if (session) session.handlers.captureFlag(c); },
            rejected: (r) => { log("rejected: " + r); process.exitCode = 1; },
        },
    });

    // The session exists from the first byte: MsgAddPlayer arrives before the world does, and a session
    // built only once the world lands never learns who is in the game.
    session = createPlaySession({
        client, world: null, tank: null, rnd, respawnMs: RESPAWN_MS,
        on: {
            death: () => { log("killed"); const o = outcomeForDeath(lastFeat, lastAlt); if (o) postOutcomes(bridge, [o]).then((r) => { if (r && r.taken) reported += r.taken; }); },
            kill: (k) => { log(`killed ${k.victim}`); const o = outcomeForKill(lastFeat, lastAlt); if (o) postOutcomes(bridge, [o]).then((r) => { if (r && r.taken) reported += r.taken; }); },
            flag: (f) => log(f ? `picked up ${f}` : "dropped the flag"),
            shielded: () => log("a shield ate that one"),
        },
    });
    if (world && tank) session.attach(world, tank, db);

    if (password) await client.authenticate();
    await client.connect();

    let lastT = Date.now();
    const timer = setInterval(() => {
        if (client.state !== State.Playing || observe || !world) return;
        if (!session.ready) return;
        const now = Date.now();
        const dt = Math.min(0.25, (now - lastT) / 1000); lastT = now;

        // The mind: bz/bzPilot.js scores the targets the session is tracking and hands back an input. The
        // body -- the incoming shots, our own death, the respawn, the update, the shot -- is the session's.
        const inp = session.alive ? decide(tank, world, session.targets(), state, weights, { dt }) : {};
        if (inp.feat) { lastFeat = inp.feat; lastAlt = inp.alt; }
        session.step(dt, inp, now);
    }, TICK_MS);

    // Two pilots in a game both post outcomes; either may be the one that tips the bridge over its minimum,
    // and neither should have to be restarted to find out.
    const policyTimer = setInterval(async () => {
        const w = await fetchWeights(bridge);
        if (!w || JSON.stringify(w.weights) === JSON.stringify(weights)) return;
        weights = w.weights; source = "learned"; trainedOn = w.samples;
        log(`policy updated from ${trainedOn} decisions: ${JSON.stringify(weights)}`);
    }, 20000);

    const status = setInterval(() => {
        const u = client.udp;
        const k = session ? session.kills : 0, l = session ? session.losses : 0, sh = session ? session.shots : 0;
        const np = session ? session.peers().size : 0;
        log(`peers=${np} kills=${k} losses=${l} shots=${sh} policy=${source}` + (session && session.flag ? ` flag=${session.flag}` : "")
            + ` udp=${u ? (u.up ? "up" : "down") : "off"}${u && u.stats.tooBig ? ` oversize=${u.stats.tooBig}` : ""}`
            + (bridge ? ` outcomes=${reported}` : "") + (session && session.alive ? "" : " [dead]"));
    }, 10000);

    const bye = () => { clearInterval(timer); clearInterval(status); clearInterval(policyTimer); try { client.close(); } catch (e) {} log("left."); process.exit(0); };
    process.on("SIGINT", bye);
    process.on("SIGTERM", bye);
    if (seconds) setTimeout(bye, seconds * 1000);
}

main().catch((e) => { console.error("[bzfsPilot]", e); process.exit(1); });
