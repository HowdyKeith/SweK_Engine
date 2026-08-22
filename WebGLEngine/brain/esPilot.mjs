// WebGLEngine/brain/esPilot.mjs — the GPU Brain as a connecting client.
//
// This is not a bot that flies its own ship (that is ev/evBot.mjs, which joins as a peer pilot and,
// by its own admission, "can menace and chase but can't yet damage a real player"). This joins the
// room and takes ownership of the SYSTEM'S HOSTILES. Rendezvous hashing hands it a share of the npcs
// the moment it arrives — no election, no coordinator, no server-side authority — and it flies them
// with the tactics policy it learned from real fights.
//
// It needs no canvas, no WebGL, no DOM. combat.js, esTactics.js, esAuthority.js and flightModel.js are
// pure logic; httpPresenceTransport uses only fetch. That was checked, not assumed.
//
// What it does each tick:
//   1. ask presence who is in the system            -> peerIds
//   2. ask esAuthority which npcs are MINE          -> ownsNpc (a fair share, automatically)
//   3. ask esTactics who each of them should shoot  -> weights served by /ai/brain/tactics
//   4. fly them with the engine's own flight model  -> stepFlight, the same integrator players use
//   5. broadcast the ones it owns                   -> every browser sees them as ghosts
//   6. broadcast their shots                        -> browsers ingest them via fv.ingestShot
//   7. drain the damage events addressed to it      -> validateDamage, apply, announce the dead
//   8. report what the tactics cost it              -> POST /ai/brain/tactics
//
// v2171 -- steps 7 and 8 close the loop. Before them the pilot could shoot and could not be shot: it
// took no inbound damage, so its ships never died, so the policy that chose their targets never saw a
// single negative outcome. It was learning from a fight it could not lose.
//
// Run:
//   node brain/esPilot.mjs
//     SWEK_PILOT_URL     rendezvous base URL (serves /presence and /event)      [required]
//     SWEK_PILOT_ROOM    presence room; MUST match the players' room            [default "default"]
//     SWEK_PILOT_SYSTEM  system id to haunt                                     [default 128]
//     SWEK_BRIDGE        SweK bridge base URL, for learned tactics weights      [optional]
//     SWEK_PILOT_ID      stable peer id                                         [default random]
//     SWEK_PILOT_NPCS    how many hostiles the pilot flies                        [default 8]
//     SWEK_PILOT_RESPAWN ms before a destroyed ship returns; 0 = never           [default 20000]
//   node brain/esPilot.mjs --dry-run    simulate locally, print a report, touch no network

import { PresenceManager, httpPresenceTransport, makeNet } from "../ev/presence.js";
import { spawnEnemies, stepAI } from "../ev/combat.js";
import { stepFlight, headingVector } from "../ev/flightModel.js";
import { DEFAULT_W, decide as tacticsDecide, applyBrainWeights } from "../ev/esTactics.js";
import { makeRng, spawnSeed, ownsNpc, packNpcs, wingId,
    validateDamage, noteAccepted, applyDamageEvent, makeDeadBoard, noteDead, deadPack } from "../ev/esAuthority.js";
import { makeCachedSolver } from "./flowfieldCache.mjs";

// The room's hostiles must be identical on every peer, so they come from (room, system) and nothing
// else. Ship classes are the pilot's own opening book: a browser that already has an ES universe will
// spawn richer ships, and its packets win for the npcs it owns. We only ever speak for ours.
// NOTE the field name: shipFlightStats reads `maneuver`, NOT `turn`, and scales it by TURN_SCALE=3 to
// get deg/sec. The first version of this file wrote `turn: 100`; every ship then got
// Math.max(1, (undefined||0)*3) = 1 deg/sec and could not aim at anything. The dry run fired zero
// shots, which is how it was caught. Values below are EV "Maneuver" units: 10 ~= 30 deg/sec.
const CLASSES = [
    { id: 1, name: "Raider", shield: 80, armor: 60, speed: 340, accel: 240, maneuver: 11, dps: 12 },
    { id: 2, name: "Marauder", shield: 120, armor: 90, speed: 300, accel: 200, maneuver: 8, dps: 18 },
    { id: 3, name: "Corsair", shield: 60, armor: 40, speed: 400, accel: 280, maneuver: 14, dps: 8 },
];

const SHOT = { speed: 900, life: 1.2, dmgShield: 6, dmgArmor: 4, cooldownMs: 700 };

// System entry: prefetch the flow-fields this system's pilots will want, so the first request is instant instead of
// stalling the frame on a Dijkstra solve. Pass the solver (CPU/auto, interface `async solve(heights,goals,opts)`),
// the map heights, and the goal-sets to warm; get back a CACHED solver to use for every later solve, plus how many
// were warmed. No solver/heights -> null and the caller simply stays on live compute (fully non-breaking).
export async function prepareSystemFields({ solver, heights, goalsList, systemId } = {}) {
    if (!solver || !heights) return null;
    const cached = makeCachedSolver(solver, { mapId: "sys" + (systemId != null ? systemId : "?") });
    const warmed = await cached.prefetch(heights, goalsList || []);
    return { solver: cached, warmed };
}

// --- pure core (tested; main() below is a thin shell around it) ---------------------------

// The pilot's wing. Geometry is deterministic from (room, system) so a restart puts the ships back
// where they were, but the IDS CARRY THE PILOT'S NAME: "brain-x7q:3". Nobody else spawned these ships,
// nobody else has their stats, and so nobody else may be handed them.
//
// v2170 hashed bare ids across the whole peer ring, which meant a browser was told it owned 5 of the
// pilot's 8 ships (it had no entity for any of them) while the pilot was told it owned 2 of the
// browser's (which then froze in place, simulated by no one). esAuthority.spawnerOf reads the prefix
// and hands each wing straight back to whoever made it.
export function makeWorld(room, systemId, count = 8, me = "brain") {
    const rnd = makeRng(spawnSeed(room, systemId));
    return spawnEnemies(CLASSES, {}, { x: 0, y: 0 }, { count, speedScale: 1, minR: 1100, spread: 900, rnd })
        .map((e, i) => ({
            ...e, id: wingId(me, i), team: "enemy",
            dps: e.cls.dps ?? 10,
            maxShield: e.shield, maxArmor: e.armor,
            _cool: 0, _home: { x: e.x, y: e.y, heading: e.heading },
        }));
}

// Presence gives us peers as {id, x, y, hp, bot}. Tactics scores on health and threat, so a peer with
// no hp reads as pristine AND harmless — the exact bug found in flightView at v2166. Presence sends hp
// as a 0..100 percentage, so reconstitute plausible absolutes rather than pretending to know more.
export function peerAsTarget(pr) {
    const pct = (pr.hp == null ? 100 : Math.max(0, Math.min(100, +pr.hp))) / 100;
    return {
        id: pr.id, x: pr.x, y: pr.y, team: pr.bot ? "enemy" : "player", isPlayer: !pr.bot,
        shield: 100 * pct, armor: 100 * pct, maxShield: 100, maxArmor: 100, dps: 10,
    };
}

// One simulation step for the npcs we own. Pure: no clock, no network, no globals. Returns the shots
// that were fired so the caller can broadcast them.
export function tickOwned(owned, targets, weights, dt, nowMs) {
    const shots = [];
    for (const e of owned) {
        if (e.dead) continue;
        const d = tacticsDecide(e, targets, weights, { lastTargetId: e._tgtId, wasFleeing: e._fleeing, range: 1400 });
        e._fleeing = d.fleeing;
        e._tgtId = (d.target && !d.target._flee) ? d.target.id : null;
        if (d.feat && d.altFeat) { e._tacFeat = d.feat; e._tacAlt = d.altFeat; }
        if (!d.target) continue;

        const ai = stepAI(e, d.target, { range: 1400, standoff: d.fleeing ? 0 : 160 });
        e._intent = { tu: ai.turn, tt: ai.thrust };   // v2252 -- the maneuver we're applying; rides along in packNpc so receivers curve-extrapolate
        const ns = stepFlight(e, { turn: ai.turn, thrust: ai.thrust }, e.stats, dt);
        e.x = ns.x; e.y = ns.y; e.vx = ns.vx; e.vy = ns.vy; e.heading = ns.heading;

        // Only an ENGAGING ship shoots. A fleeing ship that keeps firing is a ship that never escapes,
        // and it would teach the policy that fleeing works when it did not.
        if (ai.firing && d.engaging && nowMs >= (e._cool || 0)) {
            e._cool = nowMs + SHOT.cooldownMs;
            // The engine's heading convention is {x: sin, y: -cos} (see flightModel.headingVector).
            // Using cos/sin sends every shot 90 degrees off, so use the engine's own function.
            const dir = headingVector(e.heading);
            shots.push({
                type: "shot", team: "enemy", t: nowMs, life: SHOT.life,
                x: Math.round(e.x), y: Math.round(e.y),
                vx: Math.round(dir.x * SHOT.speed), vy: Math.round(dir.y * SHOT.speed),
                dmgShield: SHOT.dmgShield, dmgArmor: SHOT.dmgArmor,
            });
        }
    }
    return shots;
}

// Which of the world's npcs are mine this tick. Peers come and go; ownership follows, and under
// rendezvous hashing only the departed peer's ships change hands.
export function myShare(world, me, peerIds) {
    if (!peerIds || !peerIds.length) return [];
    return world.filter((e) => !e.dead && ownsNpc(me, e.id, peerIds));
}

// --- taking damage ------------------------------------------------------------------------
// Browsers report their hits; we are the only client allowed to decrement these hulls. validateDamage
// does the suspecting (is it mine, is the damage finite, under the cap, not a replay, not self-
// reported). Everything it rejects is dropped in silence: a co-op peer with a bug should cost us
// nothing, and a co-op peer with malice should cost us nothing either.
export function ingestDamage(world, events, me, peerIds, seen, opts = {}) {
    const killed = [];
    let taken = 0, dropped = 0;
    for (const ev of events || []) {
        const v = validateDamage(ev, me, peerIds, { seen, maxDamage: opts.maxDamage ?? 2000 });
        if (!v.ok) { dropped++; continue; }
        noteAccepted(seen, ev);
        const e = world.find((n) => n.id === ev.npcId && !n.dead);
        if (!e) { dropped++; continue; }                       // already destroyed, or never existed
        taken++;
        if (applyDamageEvent(e, ev)) {
            e.dead = true; e._diedAt = opts.now ?? Date.now();
            e._killedBy = ev.from;                              // v2172 -- the shooter earned it; say so
            killed.push(e);
        }
    }
    return { killed, taken, dropped };
}

// A destroyed ship returns to the point it spawned from, whole. Without this the wing is a one-shot:
// eight ships, eight deaths, then a process that haunts an empty system forever.
export function respawn(world, nowMs, afterMs) {
    if (!afterMs) return [];
    const back = [];
    for (const e of world) {
        if (!e.dead || e._diedAt == null || nowMs - e._diedAt < afterMs) continue;
        e.dead = false; e._diedAt = null;
        e.x = e._home.x; e.y = e._home.y; e.heading = e._home.heading; e.vx = 0; e.vy = 0;
        e.shield = e.maxShield; e.armor = e.maxArmor;
        e._tgtId = null; e._fleeing = false; e._tacFeat = null; e._tacAlt = null; e._cool = 0; e._killedBy = null;
        back.push(e);
    }
    return back;
}

// --- reporting what the tactics cost -------------------------------------------------------
// The engine's rule, unchanged (flightView, v2167): a decision earns a sample only when we can tie it
// to an outcome AND we kept its counterfactual. A choice with no runner-up carries no gradient, and
// tacticsBridge rejects it anyway.
//
//   our ship died          -> the target IT chose was the wrong one   (-1)
//   its target died        -> the target it chose was the right one   (+1)
export function outcomesForDeaths(killed) {
    return (killed || [])
        .filter((e) => e._tacFeat && e._tacAlt)
        .map((e) => ({ chosen: e._tacFeat, alt: e._tacAlt, reward: -1 }));
}

export function outcomesForTargetDeath(targetId, world) {
    return (world || [])
        .filter((e) => !e.dead && e._tgtId === targetId && e._tacFeat && e._tacAlt)
        .map((e) => ({ chosen: e._tacFeat, alt: e._tacAlt, reward: +1 }));
}

// Which pilots died since the last look. hp arrives as a 0..100 percentage on every presence packet,
// so a pilot who dies in front of us sends one last packet at zero. A pilot who merely LEAVES sends
// nothing at all -- and we claim nothing, because a jump out is not a kill. Mutates `prevHp`.
export function deadTargets(prevHp, peers) {
    const out = [], live = new Set();
    for (const p of peers || []) {
        if (p == null || p.id == null || p.hp == null) continue;
        live.add(p.id);
        const was = prevHp.get(p.id);
        if (was != null && was > 0 && p.hp <= 0) out.push(p.id);
        prevHp.set(p.id, p.hp);
    }
    for (const id of [...prevHp.keys()]) if (!live.has(id)) prevHp.delete(id);
    return out;
}

// --- the shell ----------------------------------------------------------------------------

const env = (k, d) => (process.env[k] != null && process.env[k] !== "" ? process.env[k] : d);
const log = (...a) => console.log("[esPilot]", ...a);

// Learned weights, or an honest fallback. The bridge serves nothing until the policy has seen enough
// real outcomes, and we say which one we are flying.
async function fetchWeights(bridge) {
    if (!bridge) return { w: DEFAULT_W, source: "hand (no bridge configured)" };
    try {
        const r = await fetch(bridge + "/ai/brain/tactics", { cache: "no-store" });
        const j = await r.json();
        if (j && j.ok && j.weights) return { w: applyBrainWeights(j.weights), source: `GPU Brain (${j.samples} outcomes)` };
        if (j && j.ok) return { w: DEFAULT_W, source: `hand (${j.samples}/${j.minSamples} outcomes recorded)` };
    } catch (e) { /* fall through */ }
    return { w: DEFAULT_W, source: "hand (bridge unreachable)" };
}

async function postShots(url, room, shots, systemId) {
    if (!url || !shots.length) return;
    const events = shots.map((s) => ({ ...s, system: systemId }));
    try {
        await fetch(url + "/event?room=" + encodeURIComponent(room), {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events }),
        });
    } catch (e) { /* a dropped volley costs one salvo, never the loop */ }
}

// The room's event ring is a broadcast bus, not a mailbox: everyone's hits arrive here and ownership
// decides whose they are. We ask for everything since our last sequence and let validateDamage sort it.
async function pollEvents(url, room, since, systemId) {
    if (!url) return { events: [], seq: since };
    try {
        const r = await fetch(url + "/event?room=" + encodeURIComponent(room) + "&since=" + since, { cache: "no-store" });
        if (!r.ok) return { events: [], seq: since };
        const j = await r.json();
        const events = (j.events || []).filter((e) => e && e.type === "npcHit" && (e.system == null || e.system === systemId));
        return { events, seq: j.seq || since };
    } catch (e) { return { events: [], seq: since }; }
}

// Hand the outcomes back to the policy that produced them. Fire-and-forget: a dropped POST costs one
// lesson, never a tick. The bridge is the judge of what counts -- it rejects a sample with no
// counterfactual rather than absorbing it.
async function postOutcomes(bridge, samples) {
    if (!bridge || !samples.length) return null;
    try {
        const r = await fetch(bridge + "/ai/brain/tactics", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ samples }),
        });
        return await r.json();
    } catch (e) { return null; }
}

async function main() {
    const dry = process.argv.includes("--dry-run");
    const URLBASE = (env("SWEK_PILOT_URL", "") || "").replace(/\/+$/, "");
    const ROOM = env("SWEK_PILOT_ROOM", "default");
    const SYSTEM = parseInt(env("SWEK_PILOT_SYSTEM", "128"), 10);
    const BRIDGE = (env("SWEK_BRIDGE", "") || "").replace(/\/+$/, "");
    const COUNT = Math.max(1, Math.min(64, parseInt(env("SWEK_PILOT_NPCS", "8"), 10)));
    const RESPAWN = Math.max(0, parseInt(env("SWEK_PILOT_RESPAWN", "20000"), 10) || 0);
    // The id becomes the prefix of every ship id we spawn, so a colon in it would break the wing
    // namespace. Reject it here rather than shipping ships nobody can address.
    const ID = String(env("SWEK_PILOT_ID", "brain-" + Math.random().toString(36).slice(2, 8)));
    if (ID.includes(":")) { console.error("[esPilot] SWEK_PILOT_ID must not contain ':'"); process.exit(1); }

    const world = makeWorld(ROOM, SYSTEM, COUNT, ID);
    let { w, source } = await fetchWeights(BRIDGE);

    if (dry) {
        // Prove the loop without touching a network: pretend one player is in-system, run a second of
        // simulation, and report. This is what the selfcheck asserts on.
        const peerIds = [ID, "player1", "player2"].sort();
        // TWO pilots, not one. With a single target there is no runner-up, so esTactics records no
        // counterfactual, so a death produces no training sample -- and the dry run would report zero
        // outcomes and look broken while being exactly right. A real choice is what makes a gradient.
        const targets = [peerAsTarget({ id: "player1", x: 600, y: 0, hp: 40 }),
                         peerAsTarget({ id: "player2", x: 950, y: 350, hp: 95 })];
        const owned = myShare(world, ID, peerIds);
        let shots = 0;
        const before = owned.map((e) => ({ x: e.x, y: e.y }));
        const SECS = 10;   // hostiles spawn 1200-1800 units out; a single second is not enough to close
        for (let i = 0; i < SECS * 30; i++) shots += tickOwned(owned, targets, w, 1 / 30, 1000 + i * 33).length;
        const closed = owned.filter((e, i) => Math.hypot(e.x - 600, e.y) < Math.hypot(before[i].x - 600, before[i].y)).length;
        log(`dry run: room="${ROOM}" system=${SYSTEM} npcs=${world.length}`);
        log(`weights: ${source}`);
        log(`owned ${owned.length}/${world.length} npcs (private wing, ids prefixed "${ID}:")`);
        log(`closed on the player: ${closed}/${owned.length} ships`);
        log(`fired ${shots} shots in ${SECS}s; broadcast payload = ${JSON.stringify(packNpcs(owned, ID, peerIds)).length} bytes`);

        // v2171 -- now take a hit back, the same way a browser sends one, and prove the pilot dies,
        // announces it, and has something to say to the policy about why.
        const victim = owned[0];
        const seen = new Map();
        const kill = { type: "npcHit", npcId: victim.id, from: "player1", seq: 1, system: SYSTEM,
            dmgShield: victim.shield + victim.armor, dmgArmor: 0, t: Date.now() };
        const spoof = { ...kill, npcId: victim.id, from: "player1", seq: 1 };   // the same hit, redelivered
        const inb = ingestDamage(world, [kill, spoof], ID, peerIds, seen);
        const lost = outcomesForDeaths(inb.killed);
        const board = makeDeadBoard();
        for (const k of inb.killed) noteDead(board, k, Date.now(), k._killedBy);

        // ...and the other direction, through the same code the live loop runs: watch a pilot's hp
        // reach zero. Nothing here is assumed -- a pilot who merely left would score nothing.
        const prevHp = new Map();
        deadTargets(prevHp, [{ id: "player1", hp: 40 }]);
        const won = deadTargets(prevHp, [{ id: "player1", hp: 0 }]).flatMap((id) => outcomesForTargetDeath(id, world));
        const samples = lost.concat(won);

        log(`inbound: ${inb.taken} hit accepted, ${inb.dropped} dropped (the replay), ${inb.killed.length} destroyed`);
        log(`announcing the dead: ${JSON.stringify(deadPack(board, Date.now()))}`);
        log(`outcomes: ${lost.length} loss (-1) + ${won.length} kill (+1) = ${samples.length} to report`
            + (BRIDGE ? "" : "  [no SWEK_BRIDGE: nothing posted]"));
        log("no network touched.");
        return;
    }

    if (!URLBASE) {
        console.error("[esPilot] SWEK_PILOT_URL is required (the rendezvous base URL that serves /presence and /event).");
        console.error("[esPilot] try: node brain/esPilot.mjs --dry-run");
        process.exit(1);
    }

    const mgr = new PresenceManager(ID);
    const tr = httpPresenceTransport(URLBASE, ROOM, ID);
    const net = makeNet(mgr, tr);

    log(`joining "${ROOM}" as ${ID}, haunting system ${SYSTEM} with ${world.length} hostiles`);
    log(`tactics: ${source}`);

    let lastW = Date.now(), lastT = Date.now(), owned = [];
    let evSeq = 0, kills = 0, losses = 0, reported = 0;
    const seen = new Map();            // last accepted sequence, per shooter
    const dead = makeDeadBoard();      // kills we are still announcing
    const prevHp = new Map();          // last hp we saw from each pilot

    // The event ring is polled on its own cadence: a slow rendezvous must delay our hits, not our
    // frames. Damage lands in `inbox` and the tick drains it, because the tick owns the peer set.
    let inbox = [];
    const evTimer = setInterval(async () => {
        const r = await pollEvents(URLBASE, ROOM, evSeq, SYSTEM);
        evSeq = r.seq;
        for (const ev of r.events) if (inbox.length < 256) inbox.push(ev);
    }, 200);

    const timer = setInterval(async () => {
        const now = Date.now();
        const dt = Math.min(0.25, (now - lastT) / 1000); lastT = now;

        const peerIds = net.peerIds(SYSTEM);
        const samples = [];

        // 1. take our hits. Our ships are ours alone to kill, and the policy hears about every loss.
        if (inbox.length) {
            const q = inbox; inbox = [];
            const inb = ingestDamage(world, q, ID, peerIds, seen, { now });
            for (const k of inb.killed) { noteDead(dead, k, now, k._killedBy); losses++; log(`lost ${k.id} (${k.name}) to ${k._killedBy}`); }
            samples.push(...outcomesForDeaths(inb.killed));
        }

        // 2. did anything we were shooting at die? Credit the decision that pointed us at it.
        const inSystem = net.peers(SYSTEM);
        for (const gone of deadTargets(prevHp, inSystem)) {
            const s2 = outcomesForTargetDeath(gone, world);
            if (s2.length) { kills++; log(`killed ${gone}`); samples.push(...s2); }
        }

        // 3. bring back what the respawn timer says is due.
        for (const e of respawn(world, now, RESPAWN)) log(`${e.id} back on station`);

        owned = myShare(world, ID, peerIds);

        // Real pilots and evBot's pirates. Another esPilot is a peer, not a target: hostiles shooting
        // hostiles is a desync waiting to happen, and neither of us owns the other's ships.
        const targets = inSystem.filter((p) => p.id !== ID && !String(p.id).startsWith("brain-")).map(peerAsTarget);

        const shots = targets.length ? tickOwned(owned, targets, w, dt, now) : [];
        await postShots(URLBASE, ROOM, shots, SYSTEM);

        // Corpses first: news of a kill matters more than one more position update, and the packet is
        // capped. Without this every browser dead-reckons a ship we destroyed, forever.
        const corpses = deadPack(dead, now);
        const alive = packNpcs(owned, ID, peerIds);
        net.send({
            name: "GPU Brain", system: SYSTEM, x: 0, y: 0, vx: 0, vy: 0, heading: 0,
            bot: true, hp: 100, npcs: corpses.concat(alive).slice(0, 64),
        });

        if (samples.length) { const r = await postOutcomes(BRIDGE, samples); if (r && r.taken) reported += r.taken; }
        if (now - lastW > 30000) { lastW = now; const nw = await fetchWeights(BRIDGE); if (nw.source !== source) { log("tactics:", nw.source); } w = nw.w; source = nw.source; }
    }, 100);

    const status = setInterval(() => {
        const peerIds = net.peerIds(SYSTEM);
        log(`peers=${peerIds.length} owned=${owned.length}/${world.length} kills=${kills} losses=${losses} `
            + `outcomes=${reported}${BRIDGE ? "" : " (no bridge: not reported)"} tactics=${source}`);
    }, 10000);

    const bye = () => { clearInterval(timer); clearInterval(status); clearInterval(evTimer); try { net.close(); } catch (e) {} log("left the room."); process.exit(0); };
    process.on("SIGINT", bye);
    process.on("SIGTERM", bye);
}

// Only run when invoked directly, so the selfcheck can import the pure core.
if (process.argv[1] && /esPilot\.mjs$/.test(process.argv[1])) main();
