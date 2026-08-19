// WebGLEngine/brain/bzPilot.mjs — the GPU Brain, driving a tank.
//
//   node brain/bzPilot.mjs --dry-run
//   SWEK_BZ_URL=http://127.0.0.1:8788 SWEK_BZ_ROOM=arena node brain/bzPilot.mjs
//
// The answer to "when can the brain start driving" turned out to be: as soon as a shot could hit a tank.
// Everything else already existed, and this file is mostly a proof of that.
//
//   * bz/bzTank.js is pure and headless. It does not know what a canvas is.
//   * bz/bzPilot.js decides. It is the same shape as ev/esTactics.js: a weighted score over features, a
//     chosen target, and the runner-up it was chosen over.
//   * ev/presence.js carries the tank. A ship never needed a `z`; a tank jumps, so presence grew one, and
//     an Endless Sky packet is byte-identical to what it was.
//   * ev/esAuthority.js carries the damage. `damageEvent`, `validateDamage`, `noteAccepted`, `noteDead`,
//     `wingId` -- none of it ever knew it was about spaceships. A tank is an npc with a name.
//
// The rule those files encode, and the reason none of this needed rewriting: A PEER MAY SHOOT ANYTHING,
// AND MAY ONLY APPLY DAMAGE TO WHAT IT OWNS. This pilot owns exactly one tank. When its shot lands on
// somebody else's, it reports the hit, addressed to them, and lets them decide what it did.
//
// v2186 -- AND NOW IT LEARNS. `SWEK_BZ_BRIDGE` points at /ai/brain/bz/tactics: a policy of its own, with
// its own four features, its own file on disk, and an `isFeat` that rejects a spaceship's sample the way
// the ship policy rejects a tank's. Feeding a tank's `exposed` to a model trained on a ship's `weakness`
// would corrupt a working policy with a number that is not about anything, so the two never touch.
//
// The bridge never serves half-learned numbers. Below its minimum sample count it answers `source: "hand"`
// and hands back nothing, and this pilot keeps bz/bzPilot.js's own defaults. Anything it does serve is
// checked here as well -- finite, in the clamp band, all five weights present -- because a pilot that
// drives on numbers it cannot check is a pilot with no floor under it.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { PresenceManager, httpPresenceTransport, makeNet } from "../ev/presence.js";
import { wingId, damageEvent, validateDamage, noteAccepted } from "../ev/esAuthority.js";

import { makeBZDB } from "../bz/bzdb.js";
import { parseBZW } from "../bz/bzwParse.js";
import { buildWorld } from "../bz/bzwWorld.js";
import { makeTank, stepTank, stepShot, free } from "../bz/bzTank.js";
import { decide, makePilotState, outcomeForDeath, outcomeForKill, DEFAULT_W, sanitizeWeights } from "../bz/bzPilot.js";
import { shotHitsTank, killTank, findSpawn, respawn } from "../bz/bzCombat.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const env = (k, d) => (process.env[k] != null && process.env[k] !== "" ? process.env[k] : d);
const log = (...a) => console.log("[bzPilot]", ...a);

const SYSTEM = 0;             // a .bzw is one world. Presence scopes by `system`; a tank lives in system 0.
// v2192 -- a rendezvous server run with SWEK_TOKEN refuses anybody who does not send it. Presence has
// carried a token since it was written; the event ring needed one too, and neither had ever been given one
// by a BZFlag pilot. A room on the open internet without a token is a room anybody can drive into.
const tokenQs = (t) => (t ? "&token=" + encodeURIComponent(t) : "");
const TICK_MS = 50;           // 20Hz. The physics runs at the tick's dt, not at a fixed 60.
const DEG = 180 / Math.PI;

// A peer's presence packet, as a target the policy can score. `pos` is what bzPilot.featuresFor reads.
function peerAsTarget(p) {
    return { id: p.id, pos: [p.x, p.y, p.z != null ? p.z : 0], onGround: p.z == null || p.z <= 0.01, dead: p.hp === 0 };
}

async function post(url, room, events, token) {
    if (!url || !events.length) return;
    try {
        await fetch(url + "/event?room=" + encodeURIComponent(room) + tokenQs(token), {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events }),
        });
    } catch (e) { /* a dropped volley costs one salvo, never the loop */ }
}

// The room's event ring is a broadcast bus, not a mailbox: everyone's hits arrive and ownership decides
// whose they are. Exactly as in brain/esPilot.mjs, because it is exactly the same ring.
async function pollEvents(url, room, since, token) {
    if (!url) return { events: [], seq: since };
    try {
        const r = await fetch(url + "/event?room=" + encodeURIComponent(room) + "&since=" + since + tokenQs(token), { cache: "no-store" });
        if (!r.ok) return { events: [], seq: since };
        const j = await r.json();
        return { events: (j.events || []).filter((e) => e && e.type === "npcHit"), seq: j.seq || since };
    } catch (e) { return { events: [], seq: since }; }
}

const POLICY_ROUTE = "/ai/brain/bz/tactics";

async function postOutcomes(bridge, samples) {
    if (!bridge || !samples.length) return null;
    try {
        const r = await fetch(bridge + POLICY_ROUTE, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ samples }),
        });
        return await r.json();
    } catch (e) { return null; }
}

// The learned weights, or nothing. `sanitizeWeights` is the floor: a missing key, a NaN, or a number
// outside the policy's own clamp band and we keep the hand policy and say so.
async function fetchWeights(bridge) {
    if (!bridge) return null;
    try {
        const r = await fetch(bridge + POLICY_ROUTE, { cache: "no-store" });
        if (!r.ok) return null;
        const j = await r.json();
        if (!j || !j.trained || !j.weights) return null;
        const w = sanitizeWeights(j.weights);
        return w ? { weights: w, samples: j.samples } : null;
    } catch (e) { return null; }
}

function loadWorld(mapPath) {
    const src = fs.readFileSync(mapPath, "utf8");
    const parsed = parseBZW(src);
    const w = buildWorld(parsed);
    if (parsed.errors.length) log(`${parsed.errors.length} parse warnings in ${path.basename(mapPath)}`);
    return w;
}

function makeRng(seed) {
    let x = seed >>> 0 || 1;
    return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

async function main() {
    const dry = process.argv.includes("--dry-run");
    const URLBASE = (env("SWEK_BZ_URL", "") || "").replace(/\/+$/, "");
    const ROOM = env("SWEK_BZ_ROOM", "arena");
    const BRIDGE = (env("SWEK_BZ_BRIDGE", "") || "").replace(/\/+$/, "");
    const MAP = env("SWEK_BZ_MAP", path.join(HERE, "..", "bz", "maps", "arena.bzw"));
    const RESPAWN = Math.max(0, parseInt(env("SWEK_BZ_RESPAWN", "5000"), 10) || 0);
    const TOKEN = env("SWEK_BZ_TOKEN", "") || env("SWEK_TOKEN", "");
    const ID = String(env("SWEK_BZ_ID", "brain-" + Math.random().toString(36).slice(2, 8)));
    if (ID.includes(":")) { console.error("[bzPilot] SWEK_BZ_ID must not contain ':'"); process.exit(1); }

    const db = makeBZDB();
    const world = loadWorld(MAP);
    const rnd = makeRng(ID.split("").reduce((a, c) => a + c.charCodeAt(0), 7));

    // One tank, owned by us. The id carries our name, so esAuthority.ownerOf hands it straight back
    // without a hash: a private wing of one.
    const tank = makeTank(db, { pos: [0, 0, 0], angle: 0 });
    tank.id = wingId(ID, 0);
    const spot = findSpawn(world, tank, [], rnd);
    if (spot) { tank.pos = spot.pos.slice(); tank.angle = spot.angle; }
    const state = makePilotState();
    let shots = [];
    let dmgSeq = 0;
    const seen = new Map();     // last accepted sequence, per shooter
    let lastFeat = null, lastAlt = null;
    let kills = 0, losses = 0, fired = 0, reported = 0;
    let weights = DEFAULT_W, source = "hand", trainedOn = 0;

    // The policy comes first, dry run or not. `--dry-run` touches no ROOM; if a bridge is configured it may
    // still ask what it has learned, and it should -- that is the one command anyone runs to find out.
    {
        const w = await fetchWeights(BRIDGE);
        if (w) { weights = w.weights; source = "learned"; trainedOn = w.samples; }
    }

    if (dry) {
        // Everything but the network: drive a lap against a stationary dummy, and show the whole loop.
        const dummy = { id: "dummy", pos: [tank.pos[0] + 90, tank.pos[1], 0], onGround: true, dead: false };
        const dummy2 = { id: "dummy2", pos: [tank.pos[0] - 60, tank.pos[1] + 40, 0], onGround: true, dead: false };
        const DT = 1 / 60;
        let insideFrames = 0, hits = 0, decisions = 0, withAlt = 0;
        for (let i = 0; i < 60 * 20; i++) {
            const inp = decide(tank, world, [dummy, dummy2], state, weights, { dt: DT });
            decisions++;
            if (inp.alt) withAlt++;
            if (inp.feat) { lastFeat = inp.feat; lastAlt = inp.alt; }
            const r = stepTank(tank, inp, world, DT);
            if (r.fired) { r.fired.owner = tank.id; shots.push(r.fired); fired++; }
            if (!free(world, tank, tank.pos[0], tank.pos[1], tank.pos[2], tank.angle)) insideFrames++;
            for (const s of shots) {
                if (s.dead) continue;
                stepShot(s, world, DT);
                for (const d of [dummy, dummy2]) {
                    if (!s.dead && Math.hypot(s.pos[0] - d.pos[0], s.pos[1] - d.pos[1]) < 3 && Math.abs(s.pos[2] - 1) < 2) { hits++; s.dead = true; }
                }
            }
            shots = shots.filter((s) => !s.dead);
        }
        log(`dry run: map "${path.basename(MAP)}", world ${world.world.size} units, ${world.obstacles.length} obstacles`);
        log(`tank id "${tank.id}" -- a private wing of one; esAuthority.ownerOf hands it straight back`);
        log(`20s against two stationary dummies: ${fired} shots fired, ${hits} hits`);
        log(`decisions ${decisions}, of which ${withAlt} kept a counterfactual (two targets -> a runner-up)`);
        log(`frames inside an obstacle: ${insideFrames} (of ${60 * 20})`);
        const death = outcomeForDeath(lastFeat, lastAlt), kill = outcomeForKill(lastFeat, lastAlt);
        log(`outcomes it would report: ${death ? "1 loss (-1)" : "no loss (no counterfactual)"}, ${kill ? "1 kill (+1)" : "no kill"}`);
        if (death) log(`  sample: ${JSON.stringify(death)}`);
        log(`policy: ${source}` + (source === "learned" ? ` from ${trainedOn} decisions` : "") + ` -- ${JSON.stringify(weights)}`);
        log(BRIDGE ? "(a bridge is configured; nothing was posted, because a dry run has no outcomes worth teaching.)"
                   : "no SWEK_BZ_BRIDGE: nothing posted, nothing fetched. The hand policy drives.");
        log("no network touched.");
        return;
    }

    if (!URLBASE) { console.error("[bzPilot] set SWEK_BZ_URL to a rendezvous server, or pass --dry-run"); process.exit(1); }

    log(`policy: ${source}` + (source === "learned" ? ` from ${trainedOn} decisions` : (BRIDGE ? " (the bridge has not learned enough yet)" : " (no bridge)")));

    const mgr = new PresenceManager(ID);
    const net = makeNet(mgr, httpPresenceTransport(URLBASE, ROOM, ID, { token: TOKEN }));
    log(`joining "${ROOM}" at ${URLBASE} as ${ID}; map ${path.basename(MAP)}`
        + (TOKEN ? "; with a token" : "; NO TOKEN -- fine on a LAN, wide open on the internet"));

    // Re-read it now and then. Two pilots in a room both post outcomes; either may be the one that tips
    // the bridge over its minimum, and neither should have to be restarted to find out.
    const policyTimer = setInterval(async () => {
        const w = await fetchWeights(BRIDGE);
        if (!w) return;
        if (JSON.stringify(w.weights) === JSON.stringify(weights)) return;
        weights = w.weights; source = "learned"; trainedOn = w.samples;
        log(`policy updated from ${trainedOn} decisions: ${JSON.stringify(weights)}`);
    }, 30000);

    let evSeq = 0, inbox = [];
    const evTimer = setInterval(async () => {
        const r = await pollEvents(URLBASE, ROOM, evSeq, TOKEN);
        evSeq = r.seq;
        for (const ev of r.events) if (inbox.length < 256) inbox.push(ev);
    }, 200);

    const prevHp = new Map();
    let lastT = Date.now();
    const timer = setInterval(async () => {
        const now = Date.now();
        const dt = Math.min(0.25, (now - lastT) / 1000); lastT = now;
        const peerIds = net.peerIds(SYSTEM);
        const samples = [];

        // 1. Take our hits. Our tank is ours alone to kill. Everything validateDamage rejects is dropped in
        //    silence: a peer with a bug should cost us nothing, and a peer with malice should cost us
        //    nothing either.
        if (inbox.length) {
            const q = inbox; inbox = [];
            for (const ev of q) {
                const v = validateDamage(ev, ID, peerIds, { seen, maxDamage: 2000 });
                if (!v.ok) continue;
                noteAccepted(seen, ev);
                if (ev.npcId !== tank.id || tank.dead) continue;
                killTank(tank, ev.from, now);           // one shot kills, as it does in BZFlag
                losses++;
                log(`killed by ${ev.from}`);
                const s = outcomeForDeath(lastFeat, lastAlt);
                if (s) samples.push(s);
            }
        }

        // 2. Did anything we were shooting at die? A peer's hp reaching zero in front of us is a kill; a
        //    peer who merely LEAVES is not, and scores nothing. The same rule as brain/esPilot.mjs.
        const peers = net.peers(SYSTEM).filter((p) => p.id !== ID);
        for (const p of peers) {
            if (p.hp == null) continue;
            const was = prevHp.get(p.id);
            if (was != null && was > 0 && p.hp <= 0) {
                kills++;
                log(`killed ${p.id}`);
                const s = outcomeForKill(lastFeat, lastAlt);
                if (s) samples.push(s);
            }
            prevHp.set(p.id, p.hp);
        }
        for (const id of [...prevHp.keys()]) if (!peers.some((p) => p.id === id)) prevHp.delete(id);

        // 3. Come back, if it is time.
        if (tank.dead) respawn(tank, world, [], rnd, now, RESPAWN);

        // 4. Drive, and shoot.
        const targets = peers.map(peerAsTarget).filter((t) => !t.dead);
        const outbound = [];
        if (!tank.dead) {
            const inp = decide(tank, world, targets, state, weights, { dt });
            if (inp.feat) { lastFeat = inp.feat; lastAlt = inp.alt; }
            const r = stepTank(tank, inp, world, dt);
            if (r.fired) { r.fired.owner = tank.id; shots.push(r.fired); fired++; }
        }

        // 5. Fly our shots, and report any that land on a peer. WE NEVER KILL THEIR TANK. We tell them.
        for (const s of shots) {
            if (s.dead) continue;
            stepShot(s, world, dt);
            for (const t of targets) {
                if (s.dead) continue;
                const box = { pos: t.pos, angle: 0, spec: tank.spec, dead: false, id: t.id };
                if (shotHitsTank(s, [box])) {
                    // The AMOUNT is meaningless -- one shot kills -- so it is 1, not 9999. esAuthority's
                    // validateDamage caps damage at 2000, and a number chosen to mean "definitely fatal"
                    // trips that rail and the hit is dropped in silence. The first draft sent 9999: sixteen
                    // damage events on the ring and nobody ever died. The rail was right.
                    outbound.push(damageEvent(wingId(t.id, 0), ID, ++dmgSeq, 1, 0, SYSTEM, now));
                    s.dead = true;
                }
            }
        }
        shots = shots.filter((s) => !s.dead);
        await post(URLBASE, ROOM, outbound, TOKEN);

        net.send({
            name: "GPU Brain", system: SYSTEM,
            x: tank.pos[0], y: tank.pos[1], z: tank.pos[2],
            vx: 0, vy: 0, heading: Math.round(tank.angle * DEG),
            bot: true, hp: tank.dead ? 0 : 100,
        });

        if (samples.length) { const r = await postOutcomes(BRIDGE, samples); if (r && r.taken) reported += r.taken; }
    }, TICK_MS);

    const status = setInterval(() => {
        log(`peers=${net.peerIds(SYSTEM).length - 1} kills=${kills} losses=${losses} shots=${fired} policy=${source}`
            + (tank.dead ? " [dead]" : "") + (BRIDGE ? ` outcomes=${reported}` : " (no bridge: outcomes not reported)"));
    }, 10000);

    const bye = () => { clearInterval(timer); clearInterval(status); clearInterval(evTimer); clearInterval(policyTimer); try { net.close(); } catch (e) {} log("left the room."); process.exit(0); };
    process.on("SIGINT", bye);
    process.on("SIGTERM", bye);
}

main().catch((e) => { console.error("[bzPilot]", e); process.exit(1); });
