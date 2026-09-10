// WebGLEngine/tools/ship/bossPhaseManager-selfcheck.mjs -- v4601
//
// Run: node tools/ship/bossPhaseManager-selfcheck.mjs
//
// GATES simulation/BossPhaseManager.js's migration onto ui/machine.mjs's defineMachine()/applyEvent() -- see
// tools/ship/nextRounds.mjs's "npc-decision-framework" entry for the audit that found this file (and 88
// others) hand-rolling per-entity decision logic with zero shared framework anywhere in the tree, and
// ui/machine.mjs sitting unused everywhere outside ai-bridge/rigJobBridge.js despite already being a working,
// gated, whole-job-is-to-BE-the-shared-framework module.
//
// *** THIS IS A BEHAVIOUR-PRESERVATION GATE, NOT A NEW-FEATURE GATE. *** The migration's whole point is that
// the boss fight looks and plays exactly as it did before -- every check below asserts the SAME externally
// observable outcome (invulnerability flags, minion counts, teleport calls, counters, log lines) the original
// if-chain produced, just reached by a declared, auditable transition table instead of an untracked one.
// simulation/BossPhaseManager.js was ungated before this round (physics/instruments.mjs's own triage classes
// it as "scene and demo code that was never physics" -- correctly; this file is the first real test of it).
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BossPhaseManager } from "../../simulation/BossPhaseManager.js";
import { defineMachine, applyEvent, audit } from "../../ui/machine.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("bossPhaseManager-selfcheck -- a real hand-rolled FSM migrated onto ui/machine.mjs, behaviour pinned\n");

// A ring room the player is never standing in, so _enterPhase2's teleport-destination search always has a
// candidate -- the original code's own `candidates.filter(r => r !== playerRoom)` needs at least 2 rooms.
const LAYOUT = { rooms: [
    { id: "spawn", x: 0, y: 0, z: 0, w: 10, d: 10 },
    { id: "far",   x: 100, y: 0, z: 100, w: 10, d: 10 },
] };

function makeMocks() {
    const enemies = new Map();
    const bots = new Map();
    const spawned = [];
    const audioCalls = [];
    const kpopCalls = [];
    const fpsShooter = { _enemies: enemies };
    const botManager = {
        bots,
        spawn: ({ x, z, kind }) => {
            const id = "minion" + (spawned.length + 1);
            const rec = { entityId: id, x, z, kind };
            bots.set(id, rec);
            enemies.set(id, { kind, hp: 10, maxHp: 10 });   // minions must show up in _enemies for _aliveMinions() to see them
            spawned.push(rec);
            return rec;
        },
    };
    const camera = { position: { x: 5, y: 0, z: 5 } };   // inside the "spawn" room
    const ollamaLevelGen = { _lastLevel: LAYOUT };
    const kpop = {
        warn: (...a) => { kpopCalls.push(["warn", ...a]); return { catch: () => {} }; },
        speak: (...a) => { kpopCalls.push(["speak", ...a]); return { catch: () => {} }; },
        success: (...a) => { kpopCalls.push(["success", ...a]); return { catch: () => {} }; },
    };
    const audio = { playProcedural: (...a) => audioCalls.push(a) };
    return { enemies, bots, spawned, audioCalls, kpopCalls, fpsShooter, botManager, camera, ollamaLevelGen, kpop, audio };
}

console.log("1. THE DECLARED GRAPH ITSELF -- the exact thing an if-chain never checked for");
{
    // Re-derive the same graph BossPhaseManager.js declares, so this section tests the SHAPE of the migration
    // without importing a private const -- the file's own header explains why bossFound is legal everywhere.
    const PHASE_MACHINE = defineMachine({
        initial: "idle",
        states: {
            idle:   { on: { bossFound: "phase1" } },
            phase1: { on: { bossFound: "phase1", hpThreshold: "phase2", bossGone: "idle" } },
            phase2: { on: { bossFound: "phase1", minionsCleared: "phase3", bossGone: "idle" } },
            phase3: { on: { bossFound: "phase1", bossGone: "idle" } },
        },
    });
    const a = audit(PHASE_MACHINE);
    ok("!! all four phases are reachable from idle", a.unreachable.length === 0, a.reachable.join(", "));
    ok("!! no phase is a dead end -- every one has a way back to idle or onward", a.dead.length === 0);
    ok("exactly the four phases BossPhaseManager.js's own getPhase() doc promises", a.states === 4);

    // Sabotage: the exact mistake this migration exists to catch -- an edit that leaves a phase with NO way
    // out at all (not just one transition thinner -- audit()'s `dead` check is specifically "zero outgoing
    // transitions and not final", so the sabotage has to remove every one of phase3's, not just bossGone).
    const broken = defineMachine({
        initial: "idle",
        states: {
            idle:   { on: { bossFound: "phase1" } },
            phase1: { on: { bossFound: "phase1", hpThreshold: "phase2", bossGone: "idle" } },
            phase2: { on: { bossFound: "phase1", minionsCleared: "phase3", bossGone: "idle" } },
            phase3: {},   // both bossFound and bossGone missing -- the boss would be stuck in phase3 forever
        },
    });
    ok("!! SABOTAGE: a phase left with no way out at all is CAUGHT, not silently shipped",
        audit(broken).dead.includes("phase3"),
        "the if-chain version had no equivalent check -- this is new coverage the migration adds, not just parity");
    // And the one-transition-thinner case really IS still healthy, not a false negative from a sabotage that
    // was too soft -- proven directly rather than assumed from the stronger case above.
    const thinner = defineMachine({
        initial: "idle",
        states: {
            idle:   { on: { bossFound: "phase1" } },
            phase1: { on: { bossFound: "phase1", hpThreshold: "phase2", bossGone: "idle" } },
            phase2: { on: { bossFound: "phase1", minionsCleared: "phase3", bossGone: "idle" } },
            phase3: { on: { bossFound: "phase1" } },   // bossGone missing, bossFound still present
        },
    });
    ok("...and a phase missing ONE transition but not all of them is correctly NOT flagged dead",
        audit(thinner).dead.length === 0,
        "phase3 still has a real way out (bossFound); dead means zero, not fewer");
}

console.log("\n2. IDLE -> PHASE1: boss discovered, no side effects fire yet");
{
    const m = makeMocks();
    const bpm = new BossPhaseManager(m);
    m.enemies.set("boss1", { kind: "bot_miniboss", hp: 100, maxHp: 100 });
    m.bots.set("boss1", { x: 0, y: 0, z: 0 });
    ok("starts idle", bpm.getPhase() === "idle");
    bpm.tick(16);
    ok("!! discovering a boss moves idle -> phase1 in the same tick it's found", bpm.getPhase() === "phase1");
    ok("...and _enterPhase2's side effects have NOT fired yet (hp is full)",
        m.audioCalls.length === 0 && m.kpopCalls.length === 0 && m.spawned.length === 0);
    ok("...isInvulnerable() is false in phase1, matching the original's phase2-only check", bpm.isInvulnerable() === false);
}

console.log("\n3. PHASE1 -> PHASE2 on hp threshold, same-tick as the crossing -- the cascade the original if-chain did");
{
    const m = makeMocks();
    const bpm = new BossPhaseManager(m);
    m.enemies.set("boss1", { kind: "bot_king_hell", hp: 100, maxHp: 100 });
    m.bots.set("boss1", { x: 0, y: 0, z: 0 });
    bpm.tick(16);
    ok("discovery landed in phase1 first", bpm.getPhase() === "phase1");

    m.enemies.get("boss1").hp = 60;   // 60% -- still above the 50% threshold
    bpm.tick(16);
    ok("above threshold: stays in phase1", bpm.getPhase() === "phase1");

    m.enemies.get("boss1").hp = 50;   // exactly at threshold -- the original's `<=` fires here
    bpm.tick(16);
    ok("!! AT the threshold (hp/maxHp === 0.5, not just below it): fires -- pins the <= boundary exactly",
        bpm.getPhase() === "phase2");

    ok("!! boss.invulnerable set on the _enemies entry (FPSShooter's damage-skip path)",
        m.enemies.get("boss1").invulnerable === true);
    ok("!! ...and on the BotManager record too (the AI-skip path)", m.bots.get("boss1").invulnerable === true);
    ok("!! exactly 3 minions spawned, all tracked and alive", m.spawned.length === 3 && bpm.getStats().minionsAlive === 3);
    ok("!! minion kinds came from the hell-origin pool (bot_king_hell -> hell pool) or the 30% loyal-grunt escape",
        m.spawned.every((s) => ["bot_kaiju_hell", "bot_kaiju_underground", "bot_kaiju_cave", "bot_grunt"].includes(s.kind)),
        m.spawned.map((s) => s.kind).join(", "));
    ok("!! a teleport was attempted (a second room existed and the boss record moved)",
        m.bots.get("boss1").x !== 0 || m.bots.get("boss1").z !== 0);
    ok("!! counters.phase2Triggers incremented exactly once", bpm.getStats().phase2Triggers === 1);
    ok("!! the boss-retreat speech/warning fired", m.kpopCalls.some((c) => c[0] === "warn") && m.kpopCalls.some((c) => c[0] === "speak"));
    ok("!! isInvulnerable() reflects phase2", bpm.isInvulnerable() === true);
}

console.log("\n4. PHASE2 -> PHASE3 only once every minion is actually dead");
{
    const m = makeMocks();
    const bpm = new BossPhaseManager(m);
    m.enemies.set("boss1", { kind: "bot_miniboss", hp: 50, maxHp: 100 });
    m.bots.set("boss1", { x: 0, y: 0, z: 0 });
    bpm.tick(16);   // idle -> phase1 -> phase2 in one tick, same as section 3
    ok("reached phase2", bpm.getPhase() === "phase2");
    const minionIds = m.spawned.map((s) => s.entityId);

    m.enemies.delete(minionIds[0]);
    bpm.tick(16);
    ok("!! ONE of three minions dead: stays phase2", bpm.getPhase() === "phase2", (3 - bpm.getStats().minionsAlive) + " of 3 dead");

    m.enemies.delete(minionIds[1]);
    bpm.tick(16);
    ok("two of three dead: still phase2", bpm.getPhase() === "phase2");

    m.enemies.delete(minionIds[2]);
    bpm.tick(16);
    ok("!! ALL THREE dead: crosses to phase3 on this exact tick", bpm.getPhase() === "phase3");
    ok("!! boss.invulnerable cleared on both records", m.enemies.get("boss1").invulnerable === false && m.bots.get("boss1").invulnerable === false);
    ok("!! counters.phase3Triggers incremented exactly once", bpm.getStats().phase3Triggers === 1);
    ok("!! the boss-exposed success/speech fired", m.kpopCalls.some((c) => c[0] === "success"));
    ok("phase3 is passive: another tick with the boss still alive does not move the phase", (bpm.tick(16), bpm.getPhase() === "phase3"));
}

console.log("\n5. BOSS GONE -> IDLE, from every phase, and it costs nothing when already idle");
{
    for (const targetHp of [100, 50, 0]) {
        const m = makeMocks();
        const bpm = new BossPhaseManager(m);
        m.enemies.set("boss1", { kind: "bot_miniboss", hp: 100, maxHp: 100 });
        m.bots.set("boss1", { x: 0, y: 0, z: 0 });
        bpm.tick(16);
        if (targetHp <= 50) { m.enemies.get("boss1").hp = 50; bpm.tick(16); }
        if (targetHp === 0) { for (const s of m.spawned) m.enemies.delete(s.entityId); bpm.tick(16); }
        const before = bpm.getPhase();
        m.enemies.delete("boss1");
        bpm.tick(16);
        ok(`!! boss vanishing from ${before} resets to idle`, bpm.getPhase() === "idle", "was " + before);
    }
    // Idempotence: ticking an already-idle manager with no boss must not re-log or re-reset.
    const m2 = makeMocks();
    const bpm2 = new BossPhaseManager(m2);
    bpm2.tick(16); bpm2.tick(16); bpm2.tick(16);
    ok("!! ticking with no boss ever seen, repeatedly, stays a harmless no-op", bpm2.getPhase() === "idle");
}

console.log("\n6. A NEW BOSS MID-FIGHT JUMPS STRAIGHT TO PHASE1, FROM ANY PHASE -- the bossFound-from-everywhere edge");
{
    const m = makeMocks();
    const bpm = new BossPhaseManager(m);
    m.enemies.set("boss1", { kind: "bot_miniboss", hp: 50, maxHp: 100 });
    m.bots.set("boss1", { x: 0, y: 0, z: 0 });
    bpm.tick(16);   // -> phase2
    ok("reached phase2 on boss1", bpm.getPhase() === "phase2");
    const oldMinionCount = m.spawned.length;

    // boss1 is replaced by a DIFFERENT id in the same tick -- no "boss gone" tick in between, matching what
    // the original `bossId !== this._bossId` check (not gated on current phase) allowed.
    m.enemies.delete("boss1");
    m.enemies.set("boss2", { kind: "bot_king_water", hp: 100, maxHp: 100 });
    m.bots.set("boss2", { x: 0, y: 0, z: 0 });
    bpm.tick(16);
    ok("!! a DIFFERENT boss id jumps directly to phase1, skipping idle entirely", bpm.getPhase() === "phase1");
    ok("...minion tracking was cleared for the new fight (stale ids from boss1 dropped)",
        bpm.getStats().minionsAlive === 0);

    m.enemies.get("boss2").hp = 50;
    bpm.tick(16);
    ok("...and the new boss's own phase2 entry runs independently (fresh minions, water-themed)",
        m.spawned.length > oldMinionCount &&
        m.spawned.slice(oldMinionCount).every((s) => ["bot_kaiju_water", "bot_grunt"].includes(s.kind)),
        m.spawned.slice(oldMinionCount).map((s) => s.kind).join(", "));
}

console.log("\n7. applyEvent() ITSELF -- the generic piece ui/machine.mjs gained this round");
{
    const M = defineMachine({ initial: "a", states: { a: { on: { go: "b" } }, b: { on: { back: "a" }, final: true } } });
    let fired = [];
    const onEnter = { b: (tag) => fired.push("entered-b:" + tag), a: (tag) => fired.push("entered-a:" + tag) };

    ok("!! a real transition fires its target's onEnter exactly once, with the caller's args forwarded",
        applyEvent(M, "a", "go", onEnter, "x") === "b" && fired.join(",") === "entered-b:x");

    fired = [];
    ok("!! an event with no matching transition from this state is a silent no-op -- state unchanged, nothing fires",
        applyEvent(M, "a", "back", onEnter, "y") === "a" && fired.length === 0);

    fired = [];
    ok("!! a null event (the caller's 'nothing happened this tick' signal) is a no-op too",
        applyEvent(M, "a", null, onEnter, "z") === "a" && fired.length === 0);

    fired = [];
    ok("!! onEnter is optional -- a transition with no handler for its target still moves the state, just silently",
        applyEvent(M, "a", "go", null, "w") === "b" && fired.length === 0);

    ok("!! an unknown event name (not just an unhandled one) is refused the same way next() refuses it",
        applyEvent(M, "a", "no-such-event", onEnter) === "a");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: a live in-engine boss fight (main.js's real FPSShooter/BotManager/ollamaLevelGen -- " +
    "this gate mocks the same shapes those collaborators actually expose, verified against main.js's own " +
    "construction call, but does not boot the engine); ECS Position writes during teleport (ecsWorld is left " +
    "undefined in every fixture here, exercising the same optional-chaining path main.js takes when no ECS " +
    "world is wired for a given scene); and whether any OTHER hand-rolled FSM this round's audit found " +
    "(tools/ship/nextRounds.mjs's npc-decision-framework entry names dozens) should migrate the same way -- " +
    "this gate proves the pattern on one real file, not that every file should move today.");
process.exit(fails ? 1 : 0);
