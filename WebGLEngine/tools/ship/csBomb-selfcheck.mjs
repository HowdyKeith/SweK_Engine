// WebGLEngine/tools/ship/csBomb-selfcheck.mjs -- v4602
//
// Run: node tools/ship/csBomb-selfcheck.mjs
//
// GATES simulation/CSBomb.js's migration onto ui/machine.mjs's defineMachine()/applyEvent() -- the second real
// migration from tools/ship/nextRounds.mjs's "npc-decision-framework" entry, after
// simulation/BossPhaseManager.js. Behaviour-preservation gate, same convention as that one's: every check
// asserts the SAME externally observable outcome the original if-chain-plus-guarded-methods produced.
//
// *** THIS FILE IS A HARDER FIT THAN BossPhaseManager.js WAS, AND SAYS SO. *** BossPhaseManager's four phases
// were all reachable through normal ticking. CSBomb.js has two administrative overrides (reset(), forceIdle())
// that move `state` OUTSIDE the declared graph entirely -- CSRoundManager.js calls forceIdle() from whatever
// LIVE state a round happens to end in, not from one specific state a domain event would fire from. Section 1
// asserts BOMB_MACHINE's own audit() names "idle" unreachable, ON PURPOSE, rather than treating that as
// something to paper over with an invented event nothing in the real code actually fires.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CSBomb, BOMB_STATE, BOMB_MACHINE, PLANT_DURATION_S, DEFUSE_WITH_KIT_S, DEFUSE_NO_KIT_S, BOMB_TIMER_S } from "../../simulation/CSBomb.js";
import { audit } from "../../ui/machine.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("csBomb-selfcheck -- a second real hand-rolled FSM migrated onto ui/machine.mjs, behaviour pinned\n");

console.log("1. THE DECLARED GRAPH -- including the two wrinkles that make this a harder case than BossPhaseManager");
{
    const a = audit(BOMB_MACHINE);
    ok("all 7 states declared", a.states === 7);
    ok("!! *** IDLE is unreachable, EXACTLY, and that is correct -- not an oversight ***",
        a.unreachable.length === 1 && a.unreachable[0] === "idle",
        "reached only via forceIdle(), an administrative override outside the domain-event graph -- see BOMB_MACHINE's own header note");
    ok("!! ...and every OTHER state is reachable through the normal event graph", a.reachable.sort().join(",") ===
        ["defused", "defusing", "exploded", "held", "planted", "planting"].join(","));
    ok("!! no reachable state is dead -- planting/planted/defusing each have a real way onward",
        a.dead.length === 0);
    ok("exploded and defused are correctly marked final -- they have no outgoing transitions and are not dead because of it",
        BOMB_MACHINE.states.exploded.final === true && BOMB_MACHINE.states.defused.final === true);

    // Sabotage: if a future edit forgets fuseExpired everywhere, that's a live bomb that can never explode.
    // exploded has TWO feeds (planted->fuseExpired and defusing->fuseExpired), so removing only one still
    // leaves it reachable via the other -- the real, provable claim needs both removed at once.
    const brokenFully = { ...BOMB_MACHINE, states: { ...BOMB_MACHINE.states,
        planted: { on: { startDefuse: "defusing" } },
        defusing: { on: { cancelDefuse: "planted", completeDefuse: "defused" } } } };
    ok("!! SABOTAGE (complete): with fuseExpired removed from BOTH sites, exploded drops out of the reachable set",
        !audit(brokenFully).reachable.includes("exploded"),
        "the if-chain version had no equivalent check -- a bomb that could never explode would have shipped silently");
}

console.log("\n2. THE HAPPY PATH: plant -> defuse, every field and lastEvent line matching the original exactly");
{
    const b = new CSBomb();
    ok("starts HELD (round begins with T holding, per the constructor's own comment)", b.state === BOMB_STATE.HELD);

    ok("!! guard rejects startPlant from the wrong state -- can't plant an idle bomb",
        (b.forceIdle(), b.startPlant(0, 0, 0) === false && b.state === BOMB_STATE.IDLE));

    b.reset();
    ok("startPlant from held succeeds and carries position + lastEvent text", b.startPlant(5, 0, 7) === true &&
        b.state === BOMB_STATE.PLANTING && b.x === 5 && b.z === 7 && /startPlant at \(5,7\)/.test(b.lastEvent));
    ok("!! startPlant a second time (already planting) is refused, state unchanged", b.startPlant(9, 0, 9) === false && b.x === 5);

    ok("cancelPlant returns to held and resets progress", b.cancelPlant() === true && b.state === BOMB_STATE.HELD && b.plantProgress() === 0);
    ok("!! cancelPlant from held (nothing to cancel) is refused", b.cancelPlant() === false);

    b.startPlant(5, 0, 7);
    ok("mid-plant, under duration: tick returns null, stays planting",
        b.tick(PLANT_DURATION_S - 0.5) === null && b.state === BOMB_STATE.PLANTING);
    ok("!! AT exactly the plant duration: fires -- pins the >= boundary", b.tick(0.5) === "planted" && b.state === BOMB_STATE.PLANTED);
    ok("!! entering planted resets the fuse to the full timer and lastEvent reads PLANTED",
        b.timeRemaining() === BOMB_TIMER_S && b.lastEvent === "PLANTED");

    ok("startDefuse with a kit records it and moves to defusing", b.startDefuse(true) === true && b.state === BOMB_STATE.DEFUSING && b.defuseHasKit() === true);
    ok("!! startDefuse a second time is refused", b.startDefuse(false) === false && b.defuseHasKit() === true);

    ok("cancelDefuse returns to planted, defuse progress reset", b.cancelDefuse() === true && b.state === BOMB_STATE.PLANTED && b.defuseProgress() === 0);
    ok("!! cancelDefuse from planted (nothing to cancel) is refused", b.cancelDefuse() === false);

    b.startDefuse(true);   // 5s with kit
    ok("mid-defuse, under duration: tick returns null, stays defusing", b.tick(DEFUSE_WITH_KIT_S - 0.5) === null && b.state === BOMB_STATE.DEFUSING);
    ok("!! AT exactly the kit defuse duration: fires -- pins the >= boundary", b.tick(0.5) === "defused" && b.state === BOMB_STATE.DEFUSED && b.lastEvent === "DEFUSED");
    ok("!! defused is terminal: tick() on a dead bomb is a harmless no-op", b.tick(100) === null && b.state === BOMB_STATE.DEFUSED);
}

console.log("\n3. THE NO-KIT DEFUSE DURATION IS DOUBLE THE KIT ONE, AND IT CARRIES THROUGH THE MIGRATION");
{
    const b = new CSBomb();
    b.startPlant(0, 0, 0); b.tick(PLANT_DURATION_S);
    b.startDefuse(false);   // no kit -- 10s
    ok("!! no-kit defuse does NOT complete at the kit duration", b.tick(DEFUSE_WITH_KIT_S) === null && b.state === BOMB_STATE.DEFUSING);
    ok("!! ...but does complete at its own, longer duration", b.tick(DEFUSE_NO_KIT_S - DEFUSE_WITH_KIT_S) === "defused");
}

console.log("\n4. EXPLOSION, WITH AND WITHOUT A DEFUSE IN PROGRESS -- the one place lastEvent text depends on the SOURCE state");
{
    const b = new CSBomb();
    b.startPlant(0, 0, 0); b.tick(PLANT_DURATION_S);
    ok("planted, fuse ticks down without exploding while time remains", b.tick(BOMB_TIMER_S - 1) === null && b.state === BOMB_STATE.PLANTED);
    ok("!! AT exactly zero fuse: explodes -- pins the <= 0 boundary, and lastEvent has no '(during defuse)' suffix",
        b.tick(1) === "exploded" && b.state === BOMB_STATE.EXPLODED && b.lastEvent === "EXPLODED");

    const b2 = new CSBomb();
    b2.startPlant(0, 0, 0); b2.tick(PLANT_DURATION_S);
    b2.startDefuse(true);
    ok("!! exploding WHILE defusing gets the distinct '(during defuse)' text -- this is the exact case that " +
       "cannot live in a target-keyed onEnter map, since 'exploded' is reached from two different source states",
        b2.tick(BOMB_TIMER_S) === "exploded" && b2.lastEvent === "EXPLODED (during defuse)");

    // The priority case: a single oversized tick crosses BOTH the fuse and the defuse-completion thresholds.
    // The original's two independent `if`s (first one returning) means fuse-expiry always wins.
    const b3 = new CSBomb();
    b3.startPlant(0, 0, 0); b3.tick(PLANT_DURATION_S);
    b3.startDefuse(true);   // needs 5s to complete
    ok("!! a tick that would BOTH finish the defuse AND blow the fuse resolves to EXPLODED, not DEFUSED -- fuse wins",
        b3.tick(BOMB_TIMER_S + 100) === "exploded" && b3.state === BOMB_STATE.EXPLODED,
        "matches the original's two separate `if` blocks (first one returns), not an if/else-if that could be reordered");
}

console.log("\n5. RESET AND forceIdle STAY ADMINISTRATIVE OVERRIDES -- valid from every state, not just one");
{
    for (const setup of [
        (b) => {},                                              // held
        (b) => b.startPlant(0, 0, 0),                          // planting
        (b) => { b.startPlant(0, 0, 0); b.tick(PLANT_DURATION_S); },   // planted
        (b) => { b.startPlant(0, 0, 0); b.tick(PLANT_DURATION_S); b.startDefuse(true); },   // defusing
    ]) {
        const b = new CSBomb();
        setup(b);
        const from = b.state;
        b.forceIdle();
        ok(`!! forceIdle from ${from} lands on idle`, b.state === BOMB_STATE.IDLE && b.holder === null);
    }
    const b = new CSBomb();
    b.forceIdle();
    ok("!! reset from idle (the state the graph itself cannot reach any other way) still returns cleanly to held",
        (b.reset("ct"), b.state === BOMB_STATE.HELD && b.holder === "ct"));
    ok("...and reset re-arms the full fuse timer, ready for a new round", b.timeRemaining() === BOMB_TIMER_S);
}

console.log("\n6. tick()'S RETURN-VALUE CONTRACT -- CSRoundManager.js pattern-matches these exact strings");
{
    const b = new CSBomb();
    ok("no-op ticks return null, not a falsy-but-different value", b.tick(0.001) === null);
    b.startPlant(0, 0, 0);
    ok("a non-transitioning tick while planting returns null", b.tick(0.1) === null);
    ok("!! the plant-complete tick returns the STRING 'planted', matching CSRoundManager's `transition === \"planted\"` check",
        b.tick(PLANT_DURATION_S) === "planted");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: CSRoundManager.js's own consumption of these return values end to end (its own gate, " +
    "if one exists, is the place for that); CSBot.js and CSBotManager.js, the other two files in this same " +
    "audited cluster -- tools/ship/nextRounds.mjs still names them as the next slice, not done by this round; " +
    "and the carrier axis (carrierId/dropped/pickup()/drop()) which this migration deliberately left untouched " +
    "as orthogonal bookkeeping, the same way BossPhaseManager.js's counters and minionIds were left alone.");
process.exit(fails ? 1 : 0);
