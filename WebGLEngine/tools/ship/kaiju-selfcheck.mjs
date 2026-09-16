// WebGLEngine/tools/ship/kaiju-selfcheck.mjs -- v4605
//
// Run: node tools/ship/kaiju-selfcheck.mjs
//
// GATES simulation/Kaiju.js's migration onto ui/machine.mjs's defineMachine()/applyEvent() -- the FOURTH real
// migration from tools/ship/nextRounds.mjs's "npc-decision-framework" entry, after BossPhaseManager.js,
// CSBomb.js and CSRoundManager.js. Behaviour-preservation gate, same convention as those three: every check
// asserts the SAME externally observable outcome the original if-chain-plus-direct-assignment produced, now
// reached through a declared, audited event graph instead.
//
// *** THIS FILE HAS BOTH A CSBomb.js-STYLE ADMINISTRATIVE OVERRIDE AND A CSRoundManager.js-CLEAN AUDIT. ***
// _engageKaiju() sets `other.state = "dying"` directly on a DIFFERENT Kaiju instance -- an override kept
// outside the declared graph, exactly like CSBomb.js's reset()/forceIdle(). Unlike CSBomb.js, this does NOT
// leave any state unreachable: "dying" is already reachable from every other state via the unguarded "expire"
// edge, so audit(KAIJU_MACHINE) comes back fully clean (section 1). It also has a CSRoundManager.js-flavored
// same-tick priority interaction of its own: the age-expiry check runs before the retreat check and the
// switch, with no per-state guard, and the retreat check mutates state BEFORE the switch dispatches -- so a
// seeking/engaging -> retreating flip happens IN THE SAME TICK's dispatch, not deferred to the next one
// (sections 4 and 5).
"use strict";
import { Kaiju, KAIJU_STATE, KAIJU_MACHINE } from "../../simulation/Kaiju.js";
import { audit } from "../../ui/machine.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("kaiju-selfcheck -- a fourth real hand-rolled FSM migrated onto ui/machine.mjs, behaviour pinned\n");

// No civs/kaiju around by default -- most sections drive specific transitions directly rather than through
// real target-resolution, so an empty civManager/kaijuManager keeps _resolveTarget() a harmless no-op unless
// a section wires its own candidates.
const EMPTY = { getAll: () => [] };
function mkKaiju(id, kind, x, y, z, extra = {}) {
    return new Kaiju(id, { x, y, z, kind, ...extra });
}

console.log("1. THE DECLARED GRAPH -- clean like CSRoundManager.js, despite carrying an override like CSBomb.js");
{
    const a = audit(KAIJU_MACHINE);
    ok("all 5 states declared", a.states === 5);
    ok("!! every state is reachable -- \"dying\" needs no CSBomb.js-style unreachable carve-out, because the " +
        "unguarded \"expire\" edge (wrinkle 1) already reaches it from spawning/seeking/engaging/retreating",
        a.unreachable.length === 0, a.reachable.sort().join(","));
    ok("!! no reachable state is dead -- spawning/seeking/engaging/retreating each have a real way onward",
        a.dead.length === 0);
    ok("dying is correctly marked final", KAIJU_MACHINE.states.dying.final === true);

    // Sabotage A (incoming-edge removal, CSBomb.js-style): "engaging" has exactly ONE feed -- seeking's
    // engageRange. Remove it and engaging must drop out of the reachable set entirely.
    const brokenIncoming = { ...KAIJU_MACHINE, states: { ...KAIJU_MACHINE.states,
        seeking: { on: { lowEnergy: "retreating", expire: "dying" } } } };
    ok("!! SABOTAGE (incoming): removing seeking's only edge INTO engaging drops engaging from reachable",
        !audit(brokenIncoming).reachable.includes("engaging"),
        "the original if-chain had no equivalent check -- a kaiju that could never engage would have shipped silently");

    // Sabotage B (outgoing-edge removal, CSRoundManager.js-style): remove ALL of retreating's transitions.
    // It's still reachable (seeking/engaging's lowEnergy still points at it) but now has no way OUT.
    const brokenOutgoing = { ...KAIJU_MACHINE, states: { ...KAIJU_MACHINE.states, retreating: { on: {} } } };
    const auditB = audit(brokenOutgoing);
    ok("!! SABOTAGE (outgoing): removing ALL of retreating's edges makes it reachable-but-dead",
        auditB.reachable.includes("retreating") && auditB.dead.includes("retreating"));

    // Proving sabotage B wasn't too soft: removing only ONE of retreating's two edges (expire) leaves
    // "recovered" standing, so retreating is correctly NOT flagged dead -- confirming the full-removal
    // version above is the real test, not an artifact of a loose dead-check.
    const brokenOneEdge = { ...KAIJU_MACHINE, states: { ...KAIJU_MACHINE.states,
        retreating: { on: { recovered: "seeking" } } } };
    ok("!! ...and removing only ONE of its two edges is correctly NOT flagged -- proves sabotage B wasn't soft",
        !audit(brokenOneEdge).dead.includes("retreating"));
}

console.log("\n2. THE HAPPY PATH: spawning -> seeking -> engaging -> (civ killed) -> seeking -> retreating -> seeking -> dying");
{
    const k = mkKaiju(1, "sky", 0, 100, 0);   // sky: spawnFallSpeed +18 (descending), spawnLandY 20
    ok("starts spawning, exactly as the constructor's direct assignment always did", k.state === KAIJU_STATE.SPAWNING);

    let guard = 0;
    while (k.state === KAIJU_STATE.SPAWNING && guard++ < 50) k.tick(1.0, EMPTY, null);
    ok("!! falls and lands -> seeking, y clamped to spawnLandY", k.state === KAIJU_STATE.SEEKING && k.position.y === 20);

    const civ = { center: { x: 0, y: 0, z: 3 }, energy: 1.0 };
    const civManager = { getAll: () => [civ], getById: () => null };
    guard = 0;
    while (k.state === KAIJU_STATE.SEEKING && guard++ < 5000) k.tick(0.1, civManager, null);
    ok("!! walks into range -> engaging", k.state === KAIJU_STATE.ENGAGING);

    guard = 0;
    while (k.state === KAIJU_STATE.ENGAGING && guard++ < 200) k.tick(1.0, civManager, null);
    ok("!! civ dies in combat -> seeking, target cleared, kill-regen applied",
        k.state === KAIJU_STATE.SEEKING && k.target === null && k.energy > 0.9);

    k.energy = 0.1;
    k._lastDamageTime = k.age;
    k.tick(0.01, EMPTY, null);
    ok("!! low energy + damaged recently -> retreating", k.state === KAIJU_STATE.RETREATING);

    k.energy = 1.0;   // force immediate recovery
    guard = 0;
    while (k.state === KAIJU_STATE.RETREATING && guard++ < 10) k.tick(0.01, EMPTY, null);
    ok("!! recovered -> seeking", k.state === KAIJU_STATE.SEEKING);

    k.becameQueen = true; k.becameKing = true;   // latch ascension off -- isolates the expiry check itself
    k.age = k.config.maxLifetime + 1;
    k.tick(0.01, EMPTY, null);
    ok("!! age exceeds maxLifetime -> dying", k.state === KAIJU_STATE.DYING);
    ok("dying is terminal: another tick is a harmless no-op", (k.tick(1.0, EMPTY, null), k.state === KAIJU_STATE.DYING));
}

console.log("\n3. BOUNDARY CONDITIONS, pinned AT the exact operator -- strict vs non-strict, per KAIJU_MACHINE's header");
{
    // 3-spawn. Landed check is direction-aware and MIXED: `fall>0 ? y<=land : y>=land`. delta=0 so no
    // movement occurs between setup and the check -- position.y is exactly what we set it to.
    const kSkyLand = mkKaiju(100, "sky", 0, 20.0001, 0);   // sky: spawnFallSpeed +18 (descending) -> uses `<=`
    kSkyLand.tick(0, EMPTY, null);
    ok("descending, y just ABOVE land: not landed yet", kSkyLand.state === KAIJU_STATE.SPAWNING);
    kSkyLand.position.y = 20;   // spawnLandY for sky, exact
    kSkyLand.tick(0, EMPTY, null);
    ok("!! descending, y AT exactly spawnLandY: lands -- pins non-strict `<=`", kSkyLand.state === KAIJU_STATE.SEEKING);

    const kCaveLand = mkKaiju(101, "cave", 0, 21.9999, 0);   // cave: spawnFallSpeed -10 (rising) -> uses `>=`
    kCaveLand.tick(0, EMPTY, null);
    ok("rising, y just BELOW land: not landed yet", kCaveLand.state === KAIJU_STATE.SPAWNING);
    kCaveLand.position.y = 22;   // spawnLandY for cave, exact
    kCaveLand.tick(0, EMPTY, null);
    ok("!! rising, y AT exactly spawnLandY: lands -- pins non-strict `>=`, the OTHER direction's operator",
        kCaveLand.state === KAIJU_STATE.SEEKING);

    // 3a. engageRange: strict `<`. dist computed via exact hypot(6,0)===6 / hypot(5.9999,0), no float noise.
    const kA = mkKaiju(2, "sky", 0, 20, 0);
    kA.state = KAIJU_STATE.SEEKING;
    const civAt = (d) => ({ getAll: () => [{ center: { x: d, y: 0, z: 0 }, energy: 1.0 }], getById: () => null });
    kA.tick(0.001, civAt(6), null);
    ok("!! AT exactly ENGAGE_RANGE (dist===6): does NOT engage -- pins strict `<`", kA.state === KAIJU_STATE.SEEKING);
    kA.tick(0.001, civAt(5.9999), null);
    ok("!! just under ENGAGE_RANGE: engages", kA.state === KAIJU_STATE.ENGAGING);

    // 3b. disengageRange: strict `>`. ENGAGE_RANGE*1.5 === 9 exactly (hypot(9,0)===9).
    const kB = mkKaiju(3, "sky", 0, 20, 0);
    kB.state = KAIJU_STATE.ENGAGING;
    const civB = { center: { x: 9, y: 0, z: 0 }, energy: 1.0 };
    kB.target = { type: "civ", ref: civB };
    const civEnergyBefore = civB.energy;
    kB.tick(0.001, EMPTY, null);
    ok("!! AT exactly ENGAGE_RANGE*1.5 (dist===9): does NOT disengage -- pins strict `>`, and combat still runs this tick",
        kB.state === KAIJU_STATE.ENGAGING && civB.energy < civEnergyBefore);
    civB.center.x = 9.0001;
    kB.target = { type: "civ", ref: civB };
    kB.tick(0.001, EMPTY, null);
    ok("!! just OVER ENGAGE_RANGE*1.5: disengages to seeking, target cleared", kB.state === KAIJU_STATE.SEEKING && kB.target === null);

    // 3c. civKilled: strict `<0.05`. NOTE: _isTargetValid()'s OWN gate on a civ target is ALSO `energy>0.05`,
    // checked BEFORE _engageCiv ever runs -- so the pre-hit energy must stay above THAT threshold too, or the
    // tick re-resolves the target ("targetLost") before the kill-check is ever reached, testing the wrong
    // branch entirely. These two pre-hit values (0.05+CIV_HIT_BASE and the bare literal 0.15) are ADJACENT
    // representable doubles whose post-hit results straddle the true 0.05 exactly 1 ULP on either side -- as
    // tight a pin as IEEE-754 allows, using CIV_HIT_BASE's real value rather than an artificially zeroed one.
    const kC = mkKaiju(4, "sky", 0, 20, 0);
    kC.state = KAIJU_STATE.ENGAGING;
    const civC = { center: { x: 2, y: 0, z: 0 }, energy: 0.05 + 0.10 };   // 0.15000000000000002 -> post 0.05000000000000002
    kC.target = { type: "civ", ref: civC };
    kC.tick(0.001, EMPTY, null);
    ok("!! civ post-hit lands 1 ULP ABOVE the true 0.05: NOT killed -- pins strict `<`, not `<=`",
        kC.state === KAIJU_STATE.ENGAGING && civC.energy > 0.05, "civ.energy=" + civC.energy);

    civC.energy = 0.15;   // bare literal -> post 0.04999999999999999, 1 ULP BELOW the true 0.05
    kC.target = { type: "civ", ref: civC };
    kC.tick(0.001, EMPTY, null);
    ok("!! ...and 1 ULP BELOW the true 0.05: killed -> seeking", kC.state === KAIJU_STATE.SEEKING);

    // 3d. kaijuKilled: `other.energy<0.05 && this.energy>0.05`, BOTH strict. Same _isTargetValid caveat as 3c
    // applies to the victim's PRE-hit energy. KAIJU_HIT_BASE===KAIJU_COUNTER_HIT===0.06 (sky/sky, damageMul
    // 1.0 both sides), and 0.11-0.06 lands BIT-EXACT on the true double 0.05 -- no ULP-adjacent approximation
    // needed here, unlike the civ case.
    const kD = mkKaiju(5, "sky", 0, 20, 0);
    const otherD = mkKaiju(6, "sky", 2, 20, 0);
    otherD.state = KAIJU_STATE.SEEKING;
    kD.state = KAIJU_STATE.ENGAGING;
    kD.energy = 1.0;          // attacker comfortably survives -- isolates the VICTIM's own operator
    otherD.energy = 0.11;     // -0.06 -> exactly 0.05 (bit-exact), and 0.11 > 0.05 satisfies _isTargetValid pre-hit
    kD.target = { type: "kaiju", ref: otherD };
    kD.tick(0.001, EMPTY, null);
    ok("!! victim's post-hit energy lands bit-exact on 0.05: NOT killed -- pins strict `<` on the victim side",
        kD.state === KAIJU_STATE.ENGAGING && otherD.state === KAIJU_STATE.SEEKING && otherD.energy === 0.05);

    otherD.energy = 0.06;     // comfortably dies (-0.06 -> 0), still passes _isTargetValid pre-hit
    kD.energy = 0.11;         // -0.06 -> exactly 0.05, isolates the ATTACKER's own operator this time
    kD.target = { type: "kaiju", ref: otherD };
    kD.tick(0.001, EMPTY, null);
    ok("!! attacker's OWN post-hit energy lands bit-exact on 0.05: also NOT killed -- pins strict `>` on the " +
        "attacker side, even though the victim is dying-eligible this same hit",
        kD.state === KAIJU_STATE.ENGAGING && otherD.state === KAIJU_STATE.SEEKING && kD.energy === 0.05);

    otherD.energy = 0.06;
    kD.energy = 1.0;
    kD.target = { type: "kaiju", ref: otherD };
    kD.tick(0.001, EMPTY, null);
    ok("!! both strict conditions satisfied: victory fires, victim marked dying via the cross-instance override",
        kD.state === KAIJU_STATE.SEEKING && otherD.state === KAIJU_STATE.DYING && kD._lastVictim === otherD);

    // 3d-mutual: a simultaneous mutual-KO (both at/under 0.05 post-hit) registers NO victory for either side --
    // the attacker's own `this.energy>0.05` clause fails, so the WHOLE if-block (including other.state=dying)
    // is skipped, not just the regen/seeking part of it.
    const kE = mkKaiju(7, "sky", 0, 20, 0);
    const otherE = mkKaiju(8, "sky", 2, 20, 0);
    otherE.state = KAIJU_STATE.ENGAGING;   // pick a distinctive pre-state to prove it's untouched
    kE.state = KAIJU_STATE.ENGAGING;
    kE.energy = 0.10; otherE.energy = 0.10;   // KAIJU_HIT_BASE=KAIJU_COUNTER_HIT=0.06 (sky, damageMul 1.0) ->
    kE.target = { type: "kaiju", ref: otherE };   // both land at 0.04 post-hit, neither strictly above 0.05
    kE.tick(0.001, EMPTY, null);
    ok("!! mutual KO: neither side registers a kill -- attacker stays engaging, victim's state is UNTOUCHED",
        kE.state === KAIJU_STATE.ENGAGING && otherE.state === KAIJU_STATE.ENGAGING && kE._lastVictim === null,
        "kE.energy=" + kE.energy.toFixed(3) + " otherE.energy=" + otherE.energy.toFixed(3));

    // 3e. retreat trigger: `energy<retreatAt` AND `(age-lastDamageTime)<4.0`, BOTH strict. retreatAt is the
    // literal 0.3 (no window.getBrainAggro in this environment), so a direct field assignment of 0.3 compares
    // bit-for-bit with no arithmetic in between.
    const kF = mkKaiju(9, "sky", 0, 20, 0);
    kF.state = KAIJU_STATE.SEEKING;
    kF.energy = 0.3; kF.age = 10.0; kF._lastDamageTime = 6.0;   // diff===4.0 exactly, energy===retreatAt exactly
    kF.tick(0, EMPTY, null);
    ok("!! energy AT exactly retreatAt (0.3) AND recency AT exactly 4.0: neither strict condition holds -- no retreat",
        kF.state === KAIJU_STATE.SEEKING);

    kF.energy = 0.2999; kF.age = 10.0; kF._lastDamageTime = 6.0;   // recency still exactly 4.0 (not <4.0)
    kF.tick(0, EMPTY, null);
    ok("!! energy now under threshold but recency still AT exactly 4.0 (not <4.0): still no retreat -- pins the AND",
        kF.state === KAIJU_STATE.SEEKING);

    kF.energy = 0.2999; kF.age = 10.0; kF._lastDamageTime = 6.000001;   // diff now 3.999999 < 4.0
    kF.tick(0, EMPTY, null);
    ok("!! both strict conditions now satisfied: retreats", kF.state === KAIJU_STATE.RETREATING);

    // 3f. retreat exit: `energy>=0.7` (non-strict) OR `elapsed>18` (strict). delta=0 so _tickRetreating's own
    // regen (+0.05*delta) can't perturb the energy value between setup and the check.
    const kG = mkKaiju(10, "sky", 0, 20, 0);
    kG.state = KAIJU_STATE.RETREATING;
    kG._retreatStart = 0; kG.age = 5; kG.energy = 0.7;   // elapsed=5 (<18), energy AT exactly 0.7
    kG.tick(0, EMPTY, null);
    ok("!! energy AT exactly 0.7 (elapsed well under 18): exits -- pins non-strict `>=`", kG.state === KAIJU_STATE.SEEKING);

    const kH = mkKaiju(11, "sky", 0, 20, 0);
    kH.state = KAIJU_STATE.RETREATING;
    kH._retreatStart = 0; kH.age = 18; kH.energy = 0.6999;   // elapsed AT exactly 18, energy under 0.7
    kH.tick(0, EMPTY, null);
    ok("!! elapsed AT exactly 18, energy under 0.7: neither condition holds -- pins strict `>`, not `>=`",
        kH.state === KAIJU_STATE.RETREATING);
    kH.age = 18.0001;
    kH.tick(0, EMPTY, null);
    ok("!! elapsed just OVER 18: exits via timeout", kH.state === KAIJU_STATE.SEEKING);

    // 3g. isAlive()'s compound condition is asymmetric with the kill checks: kills use `energy<0.05`, isAlive()
    // uses `energy>0.05` -- at exactly 0.05 neither fires, so a kaiju can be "not alive" by isAlive() while its
    // own state never transitions to dying.
    const kI = mkKaiju(12, "sky", 0, 20, 0);
    kI.state = KAIJU_STATE.SEEKING;
    kI.energy = 0.05;
    ok("!! energy AT exactly 0.05, state not dying: isAlive() is false (0.05 is not >0.05)", kI.isAlive() === false);
    kI.tick(0.001, EMPTY, null);
    ok("!! ...yet that same tick fires NO transition to dying -- state is still seeking", kI.state === KAIJU_STATE.SEEKING);
}

console.log("\n4. PRIORITY RACE: the retreat-trigger mutates state BEFORE the switch, so a flip THIS tick dispatches to " +
    "_tickRetreating THIS SAME tick, not next tick");
{
    const k = mkKaiju(20, "sky", 0, 20, 0);
    k.state = KAIJU_STATE.SEEKING;
    k.energy = 0.1; k._lastDamageTime = k.age;   // retreat conditions satisfied
    k._pickRetreatTarget = () => ({ x: 1000, z: 0 });   // deterministic, so movement is unambiguous
    const x0 = k.position.x;
    k.tick(1.0, EMPTY, null);
    ok("!! state flips to retreating this tick", k.state === KAIJU_STATE.RETREATING);
    ok("!! ...AND the switch dispatched to _tickRetreating THIS SAME call: position moved toward the retreat " +
        "target (1000,0), which only _tickRetreating's movement code does",
        k.position.x > x0, "position.x=" + k.position.x.toFixed(3));
    ok("!! ...AND energy went UP via _tickRetreating's regen (+0.05*dt), not down via seeking's PASSIVE_DECAY -- " +
        "a second, independent same-tick confirmation", k.energy > 0.1);
}

console.log("\n5. AGE-EXPIRY PREEMPTS the retreat trigger AND the switch entirely, even when retreat conditions are " +
    "ALSO true the same tick -- fuse-expiry-style priority, matching CSBomb.js's same-tick race");
{
    const k = mkKaiju(21, "sky", 0, 20, 0);
    k.becameQueen = true; k.becameKing = true;   // latch ascension off (see section 2's own note)
    k.state = KAIJU_STATE.SEEKING;
    k.age = k.config.maxLifetime + 1;             // expire condition true
    k.energy = 0.1; k._lastDamageTime = k.age;    // retreat condition ALSO true
    const x0 = k.position.x;
    k.tick(1.0, EMPTY, null);
    ok("!! age-expiry wins: dying, not retreating", k.state === KAIJU_STATE.DYING);
    ok("!! ...and the retreat block never ran at all -- _retreatStart was never set", k._retreatStart === undefined);
    ok("!! ...and the switch never ran either -- no per-state handler moved the kaiju this tick", k.position.x === x0);
}

console.log("\n6. THE CROSS-INSTANCE ADMINISTRATIVE OVERRIDE -- kept outside the graph, exactly like CSBomb.js's overrides");
{
    const attacker = mkKaiju(30, "hell", 0, 20, 0);
    const victim   = mkKaiju(31, "sky", 3, 20, 0);
    attacker.state = KAIJU_STATE.ENGAGING;
    victim.state = KAIJU_STATE.SEEKING;   // deliberately NOT engaging -- proves the kill bypasses victim's OWN tick
    // Must clear _isTargetValid's OWN >0.05 gate pre-hit (0.1), or the tick re-resolves the target instead of
    // ever reaching _engageKaiju. hell's damageMul (1.6) brings it comfortably under 0.05 in one hit regardless.
    victim.energy = 0.1;
    attacker.target = { type: "kaiju", ref: victim };
    attacker.tick(0.001, EMPTY, null);
    ok("!! victim's OWN state field is set to dying directly, without victim.tick() ever running",
        victim.state === KAIJU_STATE.DYING);
    ok("!! ...and audit(KAIJU_MACHINE) is unaffected by this override -- dying was already reachable via " +
        "\"expire\" regardless (section 1), unlike CSBomb.js's forceIdle() which left \"idle\" unreachable",
        audit(KAIJU_MACHINE).unreachable.length === 0);
}

console.log("\n7. noRetreat -- a per-instance opt-out that suppresses the EVENT at the call site, not a graph-level case");
{
    const twin = (id) => {
        const k = mkKaiju(id, "sky", 0, 20, 0);
        k.state = KAIJU_STATE.SEEKING;
        k.energy = 0.1; k._lastDamageTime = k.age;
        return k;
    };
    const normal = twin(40);
    const ogre = twin(41);
    ogre.noRetreat = true;
    normal.tick(0.01, EMPTY, null);
    ogre.tick(0.01, EMPTY, null);
    ok("control: an identical kaiju WITHOUT noRetreat does retreat under these conditions", normal.state === KAIJU_STATE.RETREATING);
    ok("!! ...but noRetreat=true suppresses the \"lowEnergy\" event entirely -- state stays seeking", ogre.state === KAIJU_STATE.SEEKING);
}

console.log("\n8. EXTERNAL CONTRACT: tick()'s return shape and the _lastVictim/kaiju_victory hookup KaijuManager.js reads");
{
    const k = mkKaiju(50, "sky", 0, 100, 0);
    const result = k.tick(0.01, EMPTY, null);
    ok("tick() still returns an actions array (unchanged by this migration)", Array.isArray(result));

    const attacker = mkKaiju(51, "hell", 0, 20, 0);
    const victim   = mkKaiju(52, "sky", 2, 20, 0);
    attacker.state = KAIJU_STATE.ENGAGING;
    victim.energy = 0.1;   // same _isTargetValid caveat as section 6
    attacker.target = { type: "kaiju", ref: victim };
    ok("_lastVictim starts null", attacker._lastVictim === null);
    attacker.tick(0.001, EMPTY, null);
    ok("!! _lastVictim is set to the victim reference on a kaiju kill -- KaijuManager.js reads this exact " +
        "field to emit \"kaiju_victory\"; this migration does not touch it", attacker._lastVictim === victim);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: the queen/king ascension, minion-spawn, throw-cooldown, roar, and footstep-audio side " +
    "systems that live alongside the state machine in tick() -- none of them are part of the migrated FSM and " +
    "none of their own thresholds changed; KaijuManager.js's own consumption of tick()'s actions array end to " +
    "end (its own gate, if one exists, is the place for that); and the brain-policy hooks (getBrainAggro / " +
    "sampleBrainThreat / sampleBrainFlow) that only ever run when `window` exists, so this Node-side gate " +
    "always exercises their stock, no-brain fallback values -- exactly the values this migration's boundary " +
    "pins in section 3 depend on.");
process.exit(fails ? 1 : 0);
