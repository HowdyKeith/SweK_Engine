// WebGLEngine/tools/ship/hellgateManager-selfcheck.mjs -- v4605
//
// Run: node tools/ship/hellgateManager-selfcheck.mjs
//
// GATES simulation/HellgateManager.js's migration onto ui/machine.mjs's defineMachine()/applyEvent() -- the
// FOURTH real migration from tools/ship/nextRounds.mjs's "npc-decision-framework" entry, after
// BossPhaseManager.js, CSBomb.js, and CSRoundManager.js. Behaviour-preservation gate, same convention as those
// three: every check asserts the SAME externally observable outcome the original if-chain-plus-guarded-methods
// produced, just reached through a declared, auditable transition table instead of an untracked one.
//
// *** THIS ONE COMES OUT FULLY CLEAN -- closer to BossPhaseManager's baseline than to CSBomb's harder case. ***
// Every one of GATE_MACHINE's four states (opening/active/closing/closed) is reachable and none is dead --
// Section 1 proves that directly, with a real sabotage, rather than assuming it because the header says so.
// damageGate() and closeAll() both fit as declared events (hpZero / forceClose) rather than administrative
// bypasses, because both are guarded by a specific, narrow source-state set -- unlike CSBomb's reset()/
// forceIdle(), which are valid from literally every state.
//
// *** THE ONE REAL WRINKLE, AND IT IS WORTH TESTING DIRECTLY, NOT JUST TRUSTING THE COMMENT: *** closeAll()
// resets g.age = 0 on EVERY non-closed gate it touches, INCLUDING a gate that is already "closing" -- calling
// closeAll() twice genuinely restarts an in-progress close. applyEvent() never re-fires onEnter on a same-state
// transition (by design -- see ui/machine.mjs's own header), so that reset stays a bare assignment alongside
// the applyEvent() call rather than a fake closing->closing self-edge. Section 5 pins this exactly.
//
// *** STRUCTURAL DIFFERENCE FROM ALL THREE PRIOR MIGRATIONS: *** HellgateManager tracks MANY concurrent gate
// instances in a Map, not one manager-wide instance. GATE_MACHINE is one shared graph; applyEvent() fires once
// per gate per relevant tick/call. Section 6 proves several gates progress through the SAME shared machine
// definition fully independently of one another.
"use strict";
import { HellgateManager, GATE_MACHINE } from "../../simulation/HellgateManager.js";
import { audit } from "../../ui/machine.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("hellgateManager-selfcheck -- a fourth real hand-rolled FSM migrated onto ui/machine.mjs, behaviour pinned\n");

// A mock `fx` matching main.js's real construction call shape exactly (groundY, spawnGate, spawnHellspawn,
// moveEntity, despawnEntity, gateOpenFx, gatePulseFx, gateCloseFx, deathFx, siegeFx, civMissile, emit).
function mkFx(log = []) {
    const fx = {
        log,
        groundY: () => 1.5,
        spawnGate: (id) => { log.push(`spawnGate:${id}`); return "ent_" + id; },
        spawnHellspawn: (id) => { log.push(`spawnHellspawn:${id}`); return "ent_" + id; },
        moveEntity: () => {},
        despawnEntity: (id) => { log.push(`despawn:${id}`); },
        gateOpenFx: () => { log.push("gateOpenFx"); },
        gatePulseFx: () => { log.push("gatePulseFx"); },
        gateCloseFx: (x, z) => { log.push(`gateCloseFx:${x},${z}`); },
        deathFx: () => {},
        siegeFx: () => {},
        civMissile: () => {},
        emit: (e) => { log.push("emit:" + e.type); },
    };
    return fx;
}

// tick() itself caps dt at 0.1s per call (`if (dt > 0.1) dt = 0.1;`) -- step in 0.1s increments (never over the
// cap) to reach a target elapsed time, the way a real ~10fps-or-faster caller naturally would.
function tickFor(hm, seconds, civs = []) {
    const steps = Math.round(seconds / 0.1);
    for (let i = 0; i < steps; i++) hm.tick(0.1, civs);
}

console.log("1. THE DECLARED GRAPH ITSELF -- fully clean (all reachable, none dead), plus real sabotages");
{
    const a = audit(GATE_MACHINE);
    ok("exactly the 4 states the header names (opening/active/closing/closed)", a.states === 4);
    ok("!! all four states are reachable from the initial 'opening' state", a.unreachable.length === 0,
        a.reachable.join(", "));
    ok("!! no reachable state is dead -- opening/active/closing each have a real way onward", a.dead.length === 0);
    ok("closed is correctly marked final -- has no outgoing transitions and is not dead because of it",
        GATE_MACHINE.states.closed.final === true);

    // Sabotage A: remove BOTH of "active"'s outgoing edges (hpZero, forceClose). A gate that reaches active can
    // no longer be damaged shut OR force-closed -- stuck open forever even though the rest of the graph (the
    // opening->closing paths) is untouched. This is the exact mistake this migration exists to catch.
    const activeStuck = { ...GATE_MACHINE, states: { ...GATE_MACHINE.states, active: { on: {} } } };
    const auditStuck = audit(activeStuck);
    ok("!! SABOTAGE (complete): removing ALL of active's outgoing edges leaves 'active' dead",
        auditStuck.dead.includes("active"),
        "the if-chain version had no equivalent check -- a gate stuck active-forever would have shipped silently");
    ok("...and closing/closed remain reachable (opening's own hpZero/forceClose edges are untouched)",
        !auditStuck.unreachable.includes("closing") && !auditStuck.unreachable.includes("closed"));

    // And the one-edge-removed-but-not-all case really IS still healthy -- proven directly, not assumed by
    // symmetry with the complete-removal case above (the sabotage wasn't too soft).
    const activeThinner = { ...GATE_MACHINE, states: { ...GATE_MACHINE.states, active: { on: { forceClose: "closing" } } } };
    ok("...a state missing ONE transition but not all of them is correctly NOT flagged dead",
        audit(activeThinner).dead.length === 0,
        "active still has a real way out (forceClose); dead means zero, not fewer");

    // Sabotage B: forget openTimeout on "opening" -- the ONLY edge into "active" in this graph (unlike CSBomb's
    // exploded, which has two feeds). A gate could open and then never actually finish opening.
    const noOpenTimeout = { ...GATE_MACHINE, states: { ...GATE_MACHINE.states, opening: { on: { hpZero: "closing", forceClose: "closing" } } } };
    ok("!! SABOTAGE: forgetting openTimeout makes 'active' entirely unreachable",
        audit(noOpenTimeout).unreachable.includes("active"));

    // Sabotage C: forget closeTimeout on "closing" -- its only edge. Hits BOTH failure modes at once: closing
    // itself becomes dead (a gate that starts closing can never finish), and closed becomes unreachable (no
    // gate could ever actually despawn -- a real entity/memory leak, not just a display bug).
    const noCloseTimeout = { ...GATE_MACHINE, states: { ...GATE_MACHINE.states, closing: { on: {} } } };
    const auditNoClose = audit(noCloseTimeout);
    ok("!! SABOTAGE: forgetting closeTimeout leaves BOTH 'closing' dead AND 'closed' unreachable",
        auditNoClose.dead.includes("closing") && auditNoClose.unreachable.includes("closed"));
}

console.log("\n2. THE HAPPY PATH: open -> opening -> active -> (damage) -> closing -> closed -> reaped, via tick() alone where possible");
{
    const log = [];
    const hm = new HellgateManager(mkFx(log));
    const id = hm.open(5, 5);
    const g = hm.gates.get(id);

    ok("open() sets state=opening and hp=maxHp=GATE_MAX_HP immediately, no fx needed to observe it",
        g.state === "opening" && g.hp === 100 && g.maxHp === 100);
    ok("!! construction-time side effects (spawnGate/gateOpenFx/emit expand/stats.opened++) fire at open(), " +
        "NOT via onEnter -- there is no prior 'from' state to transition out of, matching BossPhaseManager's " +
        "idle and CSBomb's constructor-set HELD",
        log.includes(`spawnGate:${id}`) && log.includes("gateOpenFx") && log.includes("emit:expand") && hm.stats.opened === 1);

    tickFor(hm, 2.0);   // OPEN_TIME
    ok("opening -> active via tick alone", g.state === "active" && g.age === 0);

    ok("!! entering active fires NO fx/stat side effect of its own -- only the bare age reset",
        log.filter((l) => l === "gateOpenFx").length === 1);   // still just the one from open(), nothing added

    ok("!! damageGate() forces active -> closing on a lethal hit, age reset, no fx of its own either",
        hm.damageGate(id, 1e9) === true && g.state === "closing" && g.hp === 0 && g.age === 0);

    tickFor(hm, 1.5);   // CLOSE_TIME
    ok("!! entering closed fires gateCloseFx + despawnEntity + stats.closed++ exactly once, from this one call site",
        log.filter((l) => l === `gateCloseFx:5,5`).length === 1 &&
        log.filter((l) => l === `despawn:ent_${id}`).length === 1 &&
        hm.stats.closed === 1);
    ok("!! the closed gate is reaped from the Map in the SAME tick() call that closed it, not deferred",
        !hm.gates.has(id));
}

console.log("\n3. BOUNDARY CONDITIONS, PINNED EXACTLY ON THE LINE -- >= for the age timeouts, <= 0 for hp");
{
    // opening -> active at exactly OPEN_TIME (2.0s), not a tick before, not a tick after needed.
    {
        const hm = new HellgateManager(mkFx());
        const id = hm.open(0, 0);
        const g = hm.gates.get(id);
        tickFor(hm, 1.9);
        ok("!! just under OPEN_TIME (1.9 of 2.0s): still opening", g.state === "opening");
        tickFor(hm, 0.1);
        ok("!! AT exactly OPEN_TIME: opening->active fires this tick -- pins the >= boundary, not a > one",
            g.state === "active");
    }
    // closing -> closed at exactly CLOSE_TIME (1.5s).
    {
        const hm = new HellgateManager(mkFx());
        const id = hm.open(0, 0);
        hm.damageGate(id, 1e9);
        const g = hm.gates.get(id);
        tickFor(hm, 1.4);
        ok("!! just under CLOSE_TIME (1.4 of 1.5s): still closing, not reaped", hm.gates.has(id) && g.state === "closing");
        tickFor(hm, 0.1);
        ok("!! AT exactly CLOSE_TIME: closing->closed fires this tick, reaped this same tick -- pins the >= boundary",
            !hm.gates.has(id));
    }
    // hp<=0 (inclusive), not hp<0. Gate opens at hp = GATE_MAX_HP (100, read straight off the fresh gate
    // rather than hard-coded, so this stays correct if the constant ever changes).
    {
        const hm = new HellgateManager(mkFx());
        const id = hm.open(0, 0);
        const g = hm.gates.get(id);
        const maxHp = g.hp;
        ok("hp exactly 1 above zero after a hit that lands ONE short of lethal: no transition",
            (hm.damageGate(id, maxHp - 1), g.hp === 1 && g.state === "opening"));
        ok("!! the hit that brings hp to EXACTLY 0 transitions this same call -- pins the <= 0 boundary, not < 0",
            hm.damageGate(id, 1) === true && g.hp === 0 && g.state === "closing");
    }
}

console.log("\n4. damageGate()'S GUARD AND RETURN-VALUE CONTRACT -- \"legal hit\" is a different question from \"transitioned\"");
{
    const hm = new HellgateManager(mkFx());

    ok("damageGate() on an unknown gate id returns false", hm.damageGate("no-such-gate", 10) === false);

    const idActive = hm.open(0, 0);
    tickFor(hm, 2.0);   // -> active
    const gActive = hm.gates.get(idActive);
    ok("!! a non-lethal hit on an active gate returns true (legal hit) even though hp stays above 0 (no transition)",
        hm.damageGate(idActive, 10) === true && gActive.hp === 90 && gActive.state === "active");

    const idOpening = hm.open(10, 10);
    const gOpening = hm.gates.get(idOpening);
    ok("!! hpZero is legal from 'opening' too -- a gate can be forced closed while still opening",
        hm.damageGate(idOpening, 1e9) === true && gOpening.state === "closing");

    ok("!! once closing, the guard blocks the WHOLE method body -- hp is NOT touched, not even by an amount that wouldn't matter",
        (hm.damageGate(idOpening, 5) === false) && gOpening.hp === 0);

    tickFor(hm, 1.5);   // idOpening -> closed -> reaped
    ok("!! damageGate() on a gate that has since closed-and-been-reaped returns false (id no longer present)",
        hm.damageGate(idOpening, 10) === false);
}

console.log("\n5. closeAll() -- bulk force-close, no-op on closed, and THE WRINKLE: age resets even on an already-closing gate");
{
    const log = [];
    const hm = new HellgateManager(mkFx(log));
    const idActive = hm.open(0, 0);
    tickFor(hm, 2.0);   // -> active
    const idOpening = hm.open(10, 10);   // fresh, still opening
    const gActive = hm.gates.get(idActive);
    const gOpening = hm.gates.get(idOpening);

    hm.closeAll();
    ok("!! closeAll() force-closes an opening gate", gOpening.state === "closing" && gOpening.age === 0);
    ok("!! closeAll() force-closes an active gate in the same bulk sweep", gActive.state === "closing" && gActive.age === 0);

    tickFor(hm, 0.6);   // both gates now 0.6s into their close timer (CLOSE_TIME is 1.5s -- nowhere near closed)
    ok("age has advanced since the force-close", gActive.age > 0.5 && gActive.age < 0.7);

    log.length = 0;
    hm.closeAll();
    ok("!! calling closeAll() AGAIN on an already-closing gate RESETS its age back to 0 -- extending how long it " +
        "takes to actually close. This is the one wrinkle applyEvent()'s same-state guard cannot express via " +
        "onEnter (no re-fire on a same-state transition), so it is a bare `g.age = 0` outside applyEvent(), and " +
        "still fires every time closeAll() touches an already-closing gate",
        gActive.age === 0 && gOpening.age === 0);
    ok("...and it did NOT re-fire any onEnter side effect (no gateCloseFx, no new despawn) -- the gate is still closing, not closed",
        !log.some((l) => l.startsWith("gateCloseFx")) && !log.some((l) => l.startsWith("despawn")));

    const hm2 = new HellgateManager(mkFx());
    ok("closeAll() on an empty manager is a harmless no-op", (hm2.closeAll(), hm2.gates.size === 0));
}

console.log("\n6. MANY CONCURRENT GATES SHARE ONE GRAPH DEFINITION BUT PROGRESS FULLY INDEPENDENTLY -- the structural wrinkle vs. the other 3 migrations");
{
    const hm = new HellgateManager(mkFx());
    const a = hm.open(0, 0);
    tickFor(hm, 2.0);   // a -> active
    const b = hm.open(10, 10);   // b freshly opening
    hm.damageGate(b, 1e9);       // b -> closing (still 'opening' age irrelevant, forced)
    const c = hm.open(20, 20);   // c freshly opening, untouched

    const ga = hm.gates.get(a), gb = hm.gates.get(b), gc = hm.gates.get(c);
    ok("!! three gates, three independent states, off the SAME GATE_MACHINE definition",
        ga.state === "active" && gb.state === "closing" && gc.state === "opening");

    tickFor(hm, 2.0);   // b finishes closing+reaps (needed only 1.5s); a keeps ticking active; c needed 2.0s
    ok("!! gate b closed and was reaped independently of a and c", !hm.gates.has(b));
    ok("!! gate a is unaffected by b's transitions -- still active, never touched by b's applyEvent() calls",
        hm.gates.get(a).state === "active");
    ok("!! gate c, on its own clock, has now crossed OPEN_TIME (2.0s elapsed since IT opened, independent of a/b) and is active too",
        hm.gates.get(c).state === "active");
}

console.log("\n7. NO SAME-TICK FALLTHROUGH: an opening->active crossing does not also run active's own tick logic that same call");
{
    const log = [];
    const hm = new HellgateManager(mkFx(log));
    const id = hm.open(0, 0);
    tickFor(hm, 1.9);
    log.length = 0;
    hm.tick(0.1, []);   // the exact tick that crosses opening->active (2.0s total)
    ok("!! opening->active fired this tick", hm.gates.get(id).state === "active");
    ok("!! ...but active's own spawnHellspawn cadence did NOT fire on this same tick -- the if/else-if chain " +
        "dispatches on g.state as of the START of this gate's iteration, evaluated once per gate per tick(), " +
        "exactly matching the original's else-if chain (no fallthrough the way CSRoundManager's WAITING->LIVE has)",
        !log.some((l) => l.startsWith("spawnHellspawn")));
}

console.log("\n8. activeGateCount COUNTS opening+active ONLY, matching the getter's own original condition");
{
    const hm = new HellgateManager(mkFx());
    const a = hm.open(0, 0);
    const b = hm.open(10, 10);
    tickFor(hm, 2.0);   // both -> active
    ok("two active gates counted", hm.activeGateCount === 2);
    hm.damageGate(a, 1e9);   // -> closing
    ok("!! a closing gate is excluded from activeGateCount", hm.activeGateCount === 1);
    tickFor(hm, 1.5);   // a closes + reaps
    const c = hm.open(20, 20);   // fresh, opening
    ok("!! an opening gate IS counted (opening + active, not active alone)", hm.activeGateCount === 2);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: the hellspawn march/besiege split (d > HS_CONTACT) and the civ war AI panic/siege/cooldown " +
    "arithmetic -- both examined and correctly left out of scope, the exact CSBot shape (continuous values " +
    "recomputed fresh every tick from current distance/thresholds, no persisted named-state classification at " +
    "all); a live in-engine run through main.js's real router/GPUParticles/civEvents wiring (this gate mocks the " +
    "same fx shape main.js's own construction call actually passes, verified against that call directly, but " +
    "does not boot the engine); and whether Kaiju.js/SatelliteFleet.js/WeatherSystem.js/aiHuntSim.js+aiBrain.js " +
    "-- the rest of tools/ship/nextRounds.mjs's EXPLICIT-STATE cluster -- fit the same way; each is its own " +
    "future migration with its own priority-classifier-vs-lifecycle read, not assumed by this one.");
process.exit(fails ? 1 : 0);
