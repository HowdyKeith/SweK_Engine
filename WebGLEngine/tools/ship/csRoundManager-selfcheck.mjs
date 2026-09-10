// WebGLEngine/tools/ship/csRoundManager-selfcheck.mjs -- v4604
//
// Run: node tools/ship/csRoundManager-selfcheck.mjs
//
// GATES simulation/CSRoundManager.js's migration onto ui/machine.mjs's defineMachine()/applyEvent() -- the
// THIRD real migration from tools/ship/nextRounds.mjs's "npc-decision-framework" entry, after
// simulation/BossPhaseManager.js and simulation/CSBomb.js. Behaviour-preservation gate, same convention as
// those two: every check asserts the SAME externally observable outcome the original `_transition(next)` --
// which took a target STATE and did no validation at all -- produced, now reached through a declared,
// audited event graph instead.
//
// *** THIS FILE WAS THE CLEANEST OF THE THREE, AND THE GATE REFLECTS THAT. *** Unlike CSBomb.js, there is no
// administrative-override wrinkle: every one of ROUND_MACHINE's five states is reachable through the normal
// event graph (see section 1's audit), because `idle` IS the machine's own `initial` value and every other
// state loops back to `waiting` via the same `roundStart` event that the real `startMatch()` fires with NO
// guard on the current state -- that no-guard behaviour is itself pinned in section 3, not assumed.
"use strict";
import { CSRoundManager, ROUND_STATE, ROUND_MACHINE, WINNER, TIMINGS } from "../../simulation/CSRoundManager.js";
import { BOMB_STATE, PLANT_DURATION_S, BOMB_TIMER_S, DEFUSE_WITH_KIT_S } from "../../simulation/CSBomb.js";
import { audit } from "../../ui/machine.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("csRoundManager-selfcheck -- a third real hand-rolled FSM migrated onto ui/machine.mjs, behaviour pinned\n");

// A plant zone the player mock always stands inside, so the plant/defuse paths below can drive the bomb
// without needing the carrier-model callbacks (main.js wires those; CSRoundManager's own "backward compat for
// tests without carrier" fallback -- see _handleInteract's own comment -- is exercised deliberately here).
function makeManager(extra = {}) {
    return new CSRoundManager({
        getPlayerPos: () => ({ x: 0, y: 0, z: 0 }),
        playerSide: "t",
        plantZones: { a: { x0: -5, x1: 5, z0: -5, z1: 5 }, b: null },
        ...extra,
    });
}

console.log("1. THE DECLARED GRAPH -- and why, unlike CSBomb.js, nothing here needs an unreachable-state carve-out");
{
    const a = audit(ROUND_MACHINE);
    ok("all 5 states declared", a.states === 5);
    ok("!! every state is reachable -- idle IS the machine's own initial value, not a state some event targets",
        a.unreachable.length === 0, a.reachable.sort().join(","));
    ok("!! no reachable state is dead -- waiting/live/bomb_planted/round_over each have a real way onward",
        a.dead.length === 0);

    // Sabotage: if a future edit forgets `concluded` from bomb_planted, an exploded/defused bomb could never
    // end its round -- bomb_planted becomes a dead end (it still has roundStart, so remove that too, matching
    // CSBomb.js's convention of sabotaging ALL of a state's outgoing edges, not just one).
    const broken = { ...ROUND_MACHINE, states: { ...ROUND_MACHINE.states, bomb_planted: { on: {} } } };
    ok("!! SABOTAGE: with bomb_planted's transitions all removed, it drops into the dead set",
        audit(broken).dead.includes("bomb_planted"),
        "the old _transition(next) had no equivalent check -- a round that could never conclude from bomb_planted would have shipped silently");
}

console.log("\n2. THE HAPPY PATH: idle -> waiting -> live, with the dt-fallthrough the original carried across states");
{
    const m = makeManager();
    ok("starts idle, exactly as the constructor's direct assignment always did", m.state === ROUND_STATE.IDLE);

    m.startMatch();
    ok("!! startMatch -> _beginRound fires roundStart, lands on waiting, round 1", m.state === ROUND_STATE.WAITING && m.roundNumber === 1);

    ok("mid-grace: tick under WAITING_S stays waiting", (m.tick(TIMINGS.WAITING_S - 0.5), m.state === ROUND_STATE.WAITING));
    ok("!! AT exactly WAITING_S: falls through to live in the SAME tick -- pins the dt-fallthrough exactly",
        (m.tick(0.5), m.state === ROUND_STATE.LIVE));
    ok("...and the overshoot dt was applied to live's own timer (roundTime ticked down by 0, since overshoot was 0 here)",
        Math.abs(m._roundTime - TIMINGS.LIVE_S) < 1e-9);

    // Overshoot case: a single oversized tick crosses the WAITING boundary WITH leftover dt.
    const m2 = makeManager();
    m2.startMatch();
    m2.tick(TIMINGS.WAITING_S + 2);
    ok("!! an oversized tick that overshoots WAITING_S lands in live with the overshoot already applied to roundTime",
        m2.state === ROUND_STATE.LIVE && Math.abs(m2._roundTime - (TIMINGS.LIVE_S - 2)) < 1e-9,
        "roundTime=" + m2._roundTime.toFixed(3));
}

console.log("\n3. startMatch() HAS NO GUARD ON CURRENT STATE -- roundStart is legal from every state, pinned from each one");
{
    for (const setup of [
        (m) => {},                                                                          // idle
        (m) => { m.startMatch(); },                                                          // waiting
        (m) => { m.startMatch(); m.tick(TIMINGS.WAITING_S + 0.01); },                        // live
        (m) => { m.startMatch(); m.tick(TIMINGS.WAITING_S + 0.01);
                 m.setInteractHeld(true); m.tick(0.01);
                 m.tick(PLANT_DURATION_S + 0.01); },                                         // bomb_planted
        (m) => { m.startMatch(); m.endRound(WINNER.CT, "test"); },                           // round_over
    ]) {
        const m = makeManager();
        setup(m);
        const from = m.state;
        m.startMatch();
        ok(`!! startMatch from ${from} resets straight to waiting, no guard`, m.state === ROUND_STATE.WAITING, "was " + from);
    }
}

console.log("\n4. LIVE -> BOMB_PLANTED on plant completion, driven through the real CSBomb -- not simulated");
{
    const m = makeManager();
    m.startMatch();
    m.tick(TIMINGS.WAITING_S + 0.01);
    ok("live", m.state === ROUND_STATE.LIVE);

    m.setInteractHeld(true);
    m.tick(0.01);   // justPressed edge -> bomb.startPlant
    ok("bomb entered planting via the player's held E key in the zone", m.bomb.state === BOMB_STATE.PLANTING);

    ok("mid-plant: round stays live", (m.tick(PLANT_DURATION_S - 0.5), m.state === ROUND_STATE.LIVE));
    ok("!! AT exactly the plant duration: round crosses to bomb_planted in the same tick the bomb reports 'planted'",
        (m.tick(0.5), m.state === ROUND_STATE.BOMB_PLANTED));
    ok("...action owner cleared, ready for a defuse", m._actionOwner === null);
}

console.log("\n5. BOMB_PLANTED -> ROUND_OVER, both ways, with the winner/reason contract CSGameHUD.js reads");
{
    // explode
    const m = makeManager();
    m.startMatch(); m.tick(TIMINGS.WAITING_S + 0.01);
    m.setInteractHeld(true); m.tick(0.01); m.tick(PLANT_DURATION_S + 0.01);
    m.setInteractHeld(false);
    ok("planted", m.state === ROUND_STATE.BOMB_PLANTED);
    m.tick(BOMB_TIMER_S + 1);
    ok("!! fuse expiry concludes the round, T wins, exact reason text", m.state === ROUND_STATE.ROUND_OVER &&
        m.lastResult.winner === WINNER.T && m.lastResult.reason === "bomb exploded");
    ok("scores.t incremented", m.scores.t === 1);

    // defuse (speedrun: T defusing their own plant, per the file's own "single-player" doc comment)
    const m2 = makeManager({ getPlayerHasKit: () => true });
    m2.startMatch(); m2.tick(TIMINGS.WAITING_S + 0.01);
    m2.setInteractHeld(true); m2.tick(0.01); m2.tick(PLANT_DURATION_S + 0.01);
    m2.setInteractHeld(false); m2.tick(0.01);
    m2.setInteractHeld(true); m2.tick(0.01);   // justPressed -> startDefuse
    ok("defusing", m2.bomb.state === BOMB_STATE.DEFUSING);
    m2.tick(DEFUSE_WITH_KIT_S + 0.01);
    ok("!! kit defuse concludes the round, CT wins, exact reason text", m2.state === ROUND_STATE.ROUND_OVER &&
        m2.lastResult.winner === WINNER.CT && m2.lastResult.reason === "bomb defused");
    ok("scores.ct incremented", m2.scores.ct === 1);
}

console.log("\n6. TIME EXPIRES WITH NO PLANT -> CT wins; TEAM WIPE -> concludes with exact reason text");
{
    const m = makeManager();
    m.startMatch(); m.tick(TIMINGS.WAITING_S + 0.01);
    m.tick(TIMINGS.LIVE_S + 1);   // never plants
    ok("!! time expiring with no plant concludes live -> round_over, CT wins", m.state === ROUND_STATE.ROUND_OVER &&
        m.lastResult.winner === WINNER.CT && m.lastResult.reason === "time expired, no plant");

    let tAlive = 1, ctAlive = 1;
    const m2 = makeManager({ getTAlive: () => tAlive, getCTAlive: () => ctAlive });
    m2.startMatch(); m2.tick(TIMINGS.WAITING_S + 0.01);
    tAlive = 0;
    m2.tick(0.01);
    ok("!! all-T-wiped in live concludes the round, CT wins", m2.state === ROUND_STATE.ROUND_OVER &&
        m2.lastResult.winner === WINNER.CT && m2.lastResult.reason === "all Ts eliminated");

    let ctAlive2 = 1;
    const m3 = makeManager({ getTAlive: () => 1, getCTAlive: () => ctAlive2 });
    m3.startMatch(); m3.tick(TIMINGS.WAITING_S + 0.01);
    m3.setInteractHeld(true); m3.tick(0.01); m3.tick(PLANT_DURATION_S + 0.01);
    m3.setInteractHeld(false);
    ok("planted", m3.state === ROUND_STATE.BOMB_PLANTED);
    ctAlive2 = 0;
    m3.tick(0.01);
    ok("!! all-CT-wiped AFTER plant still concludes (no defuser left), T wins -- NOT a T-wipe check post-plant",
        m3.state === ROUND_STATE.ROUND_OVER && m3.lastResult.winner === WINNER.T &&
        m3.lastResult.reason === "all CTs eliminated, no defuser left");
}

console.log("\n7. endRound() -- public force-conclude, guarded from round_over/idle, valid from every other state");
{
    const idleM = makeManager();
    const before = idleM.state;
    idleM.endRound(WINNER.T, "should be a no-op");
    ok("!! endRound from idle is a no-op -- matches the method's own explicit guard", idleM.state === before && idleM.lastResult === null);

    for (const setup of [
        (m) => { m.startMatch(); },                                                          // waiting
        (m) => { m.startMatch(); m.tick(TIMINGS.WAITING_S + 0.01); },                        // live
        (m) => { m.startMatch(); m.tick(TIMINGS.WAITING_S + 0.01);
                 m.setInteractHeld(true); m.tick(0.01); m.tick(PLANT_DURATION_S + 0.01); },  // bomb_planted
    ]) {
        const m = makeManager();
        setup(m);
        const from = m.state;
        m.endRound(WINNER.CT, "manual-from-" + from);
        ok(`!! endRound from ${from} force-concludes to round_over`, m.state === ROUND_STATE.ROUND_OVER &&
            m.lastResult.reason === "manual-from-" + from);
        if (from === ROUND_STATE.BOMB_PLANTED) {
            ok("!! ...and a still-live bomb is forced idle so it can't keep ticking into the next round", m.bomb.state === BOMB_STATE.IDLE);
        }
    }

    const overM = makeManager();
    overM.startMatch(); overM.endRound(WINNER.T, "first");
    const scoreBefore = overM.scores.t;
    overM.endRound(WINNER.CT, "second, should be refused");
    ok("!! endRound from round_over (already concluded) is a no-op -- can't double-score a round", overM.scores.t === scoreBefore &&
        overM.lastResult.reason === "first");
}

console.log("\n8. ROUND_OVER AUTO-RESTARTS TO WAITING AFTER ROUND_OVER_S -- the same event, fired from a timer instead of a key");
{
    const m = makeManager();
    m.startMatch();
    m.endRound(WINNER.T, "force");
    ok("round_over", m.state === ROUND_STATE.ROUND_OVER);
    ok("under ROUND_OVER_S: stays round_over", (m.tick(TIMINGS.ROUND_OVER_S - 0.5), m.state === ROUND_STATE.ROUND_OVER));
    ok("!! AT exactly ROUND_OVER_S: auto-restarts to waiting, round number advances", (m.tick(0.5),
        m.state === ROUND_STATE.WAITING && m.roundNumber === 2));
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: CSBot.js and CSBotManager.js's own bot-driven plant/defuse callback paths (getBotPlanter/" +
    "getBotDefuser) -- this gate exercises only the player-driven and programmatic (getTAlive/getCTAlive/endRound) " +
    "paths, matching csBomb-selfcheck.mjs's own scope note that the carrier axis and bot integration are gated, " +
    "if at all, elsewhere; a live in-engine round (main.js's real camera/csBotManager/fpsShooter wiring) is not " +
    "booted here; and CSBot.js itself, which tools/ship/nextRounds.mjs now documents as DELIBERATELY NOT migrated " +
    "-- its BOT_STATE is a freshly-recomputed-every-tick priority classification, not a guarded lifecycle, making " +
    "ui/machine.mjs's validation model a poor fit rather than a gap left undone.");
process.exit(fails ? 1 : 0);
