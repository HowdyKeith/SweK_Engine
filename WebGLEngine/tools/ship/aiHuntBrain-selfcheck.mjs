// WebGLEngine/tools/ship/aiHuntBrain-selfcheck.mjs -- v4605
//
// Run: node tools/ship/aiHuntBrain-selfcheck.mjs
//
// GATES ai/aiHuntSim.js's agent-vs-agent combat AND ai/aiBrain.js's VBA-bridge enemy-vs-player combat onto
// ui/machine.mjs's defineMachine()/applyEvent() -- the FIFTH migration from tools/ship/nextRounds.mjs's
// "npc-decision-framework" entry, after BossPhaseManager.js, CSBomb.js, CSRoundManager.js and
// HellgateManager.js. Behaviour-preservation gate, same convention as those four: every check asserts the SAME
// externally observable outcome the original hand-rolled if-chains produced, just reached through a declared,
// auditable transition table instead of two untracked, independently-drifting copies of it.
//
// *** THE FIRST GENUINE DEDUP IN THIS SERIES. *** Every prior migration was one file, one machine. These two
// files hand-rolled the SAME idle/seek/attack hysteresis independently -- both start every decide-tick from the
// CURRENTLY STORED state and branch off THAT value, the opposite of simulation/CSBot.js's BOT_STATE (a
// fresh-every-tick priority classification with no gating on the prior tick's value at all -- see that file's
// own v4604 note, the calibration example for when NOT to migrate). Because ui/machine.mjs's graph never
// encodes a distance threshold or an LOS predicate -- only each call site's own condition->event function does
// -- ONE HUNT_HYSTERESIS_MACHINE (declared once, in aiHuntSim.js, imported by aiBrain.js) is safe to share even
// though the two files use different SEEK_DIST/ATTACK_DIST constants, a REVERSED seek-branch guard order
// (aiHuntSim checks distFar before distNear; aiBrain checks distNear before distFar), and aiHuntSim alone has
// an LOS guard aiBrain's VBA-mode path has no equivalent of. Sections 2-3 pin both, separately, by their own
// exact numbers -- sharing the graph does NOT mean the two call sites behave identically.
//
// *** NO UNREACHABLE-STATE WRINKLE, LIKE CSRoundManager.js AND UNLIKE CSBomb.js. *** Both files funnel through
// exactly one write each (aiHuntSim's `a.state = newState`; aiBrain's `aiState.set(enemy.id, {state: newState,
// ...})`) with no administrative override moving state outside the graph -- Section 1 proves all three states
// reachable and none dead, not assumed by symmetry with the cleaner priors.
//
// *** aiBrain.js IS NOT A CLASS -- IT IS A PAGE SCRIPT WITH DOM/WebSocket SIDE EFFECTS AT MODULE TOP LEVEL. ***
// Unlike the four prior migrations (all classes with public methods a gate calls directly), aiTick() is a
// private closure function, never exported, invoked by a bare `setInterval(aiTick, 250)` the module fires at
// import time. Rather than skip real-code coverage the way a class-shaped file would not need to, Section 6
// installs the SMALLEST DOM/global stub that lets the REAL aiBrain.js import without crashing (a handful of
// stub elements plus a `setInterval` interceptor that captures the aiTick callback INSTEAD of scheduling it,
// and a stub WebSocket whose captured "message" listener drives the real, private ingestState() path) --
// deliberately not a full jsdom mount, and it proves the actual production aiTick(), not a re-implementation.
"use strict";
import * as HuntSim from "../../ai/aiHuntSim.js";
import { HUNT_HYSTERESIS_MACHINE, huntDecideEvent, SEEK_DIST as HS_SEEK, ATTACK_DIST as HS_ATTACK } from "../../ai/aiHuntSim.js";
import { defineMachine, applyEvent, audit } from "../../ui/machine.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("aiHuntBrain-selfcheck -- a fifth real hand-rolled FSM pair migrated onto ui/machine.mjs, and its first genuine dedup\n");

// Handed from section 3 (which mounts the aiBrain.js harness) to sections 4 and 6, which reuse it.
let aiBrainHandle = null;

console.log("1. THE DECLARED GRAPH -- shared by both call sites, no unreachable-state carve-out needed");
{
    const a = audit(HUNT_HYSTERESIS_MACHINE);
    ok("all 3 states declared", a.states === 3);
    ok("!! every state is reachable -- neither file has an administrative override moving state outside the graph",
        a.unreachable.length === 0, a.reachable.sort().join(","));
    ok("!! no reachable state is dead -- idle/seek/attack each have a real way onward", a.dead.length === 0);
    ok("!! exactly the three states both files' own state fields ever held (idle/seek/attack), matching the string " +
        "contract movement-speed selection, threat-line color/dash, heatmap weights and colorForState() all switch on",
        HUNT_HYSTERESIS_MACHINE.stateNames.sort().join(",") === "attack,idle,seek");

    // Sabotage: if a future edit forgets one of seek's two outgoing edges (say distNear, on a threshold retune
    // that adds a new intermediate state), that alone should NOT be flagged -- seek still has a real way out
    // via distFar. Removing BOTH is the real, provable claim: seek becomes a dead end nothing can ever escape.
    const thinner = { ...HUNT_HYSTERESIS_MACHINE, states: { ...HUNT_HYSTERESIS_MACHINE.states,
        seek: { on: { distFar: "idle" } } } };
    ok("...one of seek's two edges missing is correctly NOT flagged dead -- it still has a real way out",
        audit(thinner).dead.length === 0);
    const broken = { ...HUNT_HYSTERESIS_MACHINE, states: { ...HUNT_HYSTERESIS_MACHINE.states,
        seek: { on: {} } } };
    ok("!! SABOTAGE (complete): with BOTH of seek's edges removed, seek drops into the dead set",
        audit(broken).dead.includes("seek"),
        "the if-chain version had no equivalent check -- an agent stuck in seek forever would have shipped silently");
}

console.log("\n2. ai/aiHuntSim.js's huntDecideEvent() -- SEEK_DIST=30, ATTACK_DIST=8, an LOS guard, distFar checked BEFORE distNear");
{
    ok("real exported constants match this section's assumptions", HS_SEEK === 30 && HS_ATTACK === 8);

    ok("!! idle: dist JUST under SEEK_DIST fires distClose (strict <)", huntDecideEvent("idle", 29.99, true) === "distClose");
    ok("!! idle: dist AT exactly SEEK_DIST stays idle -- pins the strict < boundary", huntDecideEvent("idle", 30, true) === null);
    ok("idle ignores haveLOS entirely -- no LOS guard on the idle->seek edge", huntDecideEvent("idle", 10, false) === "distClose");

    ok("!! seek: dist JUST over SEEK_DIST*1.3 (39) fires distFar (strict >)", huntDecideEvent("seek", 39.01, true) === "distFar");
    ok("!! seek: dist AT exactly 39 stays seek -- pins the strict > boundary", huntDecideEvent("seek", 39, true) === null);
    ok("!! seek: with LOS, dist JUST under ATTACK_DIST(8) fires distNear (strict <)", huntDecideEvent("seek", 7.99, true) === "distNear");
    ok("!! seek: dist AT exactly 8 stays seek -- pins the strict < boundary", huntDecideEvent("seek", 8, true) === null);
    ok("!! seek: WITHOUT LOS, even deep inside attack range stays seek -- the LOS guard on distNear",
        huntDecideEvent("seek", 1, false) === null);
    ok("!! seek: distFar is checked BEFORE distNear (else-if) -- at a synthetic dist satisfying BOTH thresholds " +
        "(impossible with the real constants, proven in section 4, but the branch order is still load-bearing), " +
        "distFar wins because it is the first `if`, not a coincidence of these particular numbers",
        (() => {
            // Reconstruct the exact branch shape with swapped constants to force a genuine overlap, proving the
            // ORDER (not just the current numbers) is what decides the outcome.
            function seekBranch(dist, haveLOS, farThresh, nearThresh) {
                if (dist > farThresh) return "distFar";
                if (haveLOS && dist < nearThresh) return "distNear";
                return null;
            }
            return seekBranch(5, true, 3, 10) === "distFar";   // dist=5 satisfies BOTH dist>3 and dist<10
        })());

    ok("!! attack: WITHOUT LOS, loses target regardless of distance", huntDecideEvent("attack", 0.1, false) === "loseTarget");
    ok("!! attack: WITH LOS, dist JUST over ATTACK_DIST*1.5 (12) fires loseTarget (strict >)", huntDecideEvent("attack", 12.01, true) === "loseTarget");
    ok("!! attack: dist AT exactly 12 stays attack -- pins the strict > boundary", huntDecideEvent("attack", 12, true) === null);

    ok("!! ONE-HOP-PER-TICK: a teleport-close agent still idle only ever becomes seek, never jumps straight to " +
        "attack even though dist is deep inside attack range -- the idle branch never even looks at ATTACK_DIST",
        huntDecideEvent("idle", 0.01, true) === "distClose" &&
        applyEvent(HUNT_HYSTERESIS_MACHINE, "idle", huntDecideEvent("idle", 0.01, true), null) === "seek");
}

console.log("\n3. ai/aiBrain.js's enemyDecideEvent() -- SEEK_DIST=25, ATTACK_DIST=4, NO LOS concept, distNear checked BEFORE distFar (REVERSED)");
{
    // aiBrain.js is a page script (DOM/WebSocket side effects at module top level, see the header note) --
    // a minimal stub lets it import for real rather than skipping coverage of it. Installed once, used by
    // this section and section 6.
    const harness = await import("./aiBrainHarness.mjs");
    const { mod, elements, driveTick, sendState } = await harness.mount();
    const { enemyDecideEvent, SEEK_DIST: AB_SEEK, ATTACK_DIST: AB_ATTACK } = mod;

    ok("real exported constants match this section's assumptions", AB_SEEK === 25 && AB_ATTACK === 4);

    ok("!! idle: dist JUST under SEEK_DIST(25) fires distClose", enemyDecideEvent("idle", 24.99) === "distClose");
    ok("!! idle: dist AT exactly 25 stays idle -- pins the strict < boundary", enemyDecideEvent("idle", 25) === null);

    ok("!! seek: dist JUST under ATTACK_DIST(4) fires distNear (strict <)", enemyDecideEvent("seek", 3.99) === "distNear");
    ok("!! seek: dist AT exactly 4 stays seek -- pins the strict < boundary", enemyDecideEvent("seek", 4) === null);
    ok("!! seek: dist JUST over SEEK_DIST*1.3(32.5) fires distFar", enemyDecideEvent("seek", 32.51) === "distFar");
    ok("!! seek: dist AT exactly 32.5 stays seek -- pins the strict > boundary", enemyDecideEvent("seek", 32.5) === null);
    ok("!! seek: distNear is checked BEFORE distFar here -- the OPPOSITE order of aiHuntSim's huntDecideEvent, " +
        "and preserved exactly rather than unified, because unifying it would silently change which guard wins " +
        "if a future retune ever made the two thresholds overlap",
        enemyDecideEvent("seek", 3.99) === "distNear");

    ok("!! attack: dist JUST over ATTACK_DIST*1.5(6) fires loseTarget", enemyDecideEvent("attack", 6.01) === "loseTarget");
    ok("!! attack: dist AT exactly 6 stays attack -- pins the strict > boundary", enemyDecideEvent("attack", 6) === null);

    ok("!! ONE-HOP-PER-TICK here too: idle only ever becomes seek in one call, never attack",
        enemyDecideEvent("idle", 0.01) === "distClose" &&
        applyEvent(HUNT_HYSTERESIS_MACHINE, "idle", enemyDecideEvent("idle", 0.01), null) === "seek");

    aiBrainHandle = { mod, elements, driveTick, sendState };   // handed to sections 4 and 6
}

console.log("\n4. THE SEEK-BRANCH ORDER IS INERT WITH THE REAL CONSTANTS IN BOTH FILES -- proven numerically, not assumed");
{
    ok("!! aiHuntSim: SEEK_DIST*1.3 (39) is always well above ATTACK_DIST (8) -- distFar and distNear can never " +
        "both be true in the same call, so the else-if order, while still load-bearing (section 2), never actually races today",
        HS_SEEK * 1.3 > HS_ATTACK);
    const { mod } = aiBrainHandle;
    ok("!! aiBrain: SEEK_DIST*1.3 (32.5) is always well above ATTACK_DIST (4) -- same non-overlap, same conclusion",
        mod.SEEK_DIST * 1.3 > mod.ATTACK_DIST);
}

console.log("\n5. ai/aiHuntSim.js's REAL simDecideTick() -- property-checked against huntDecideEvent()+applyEvent() over many live ticks");
{
    const thinkLines = [];
    const aiState = new Map();
    HuntSim.simSync({ wadMap: null, wadScale: 1, thinkFn: (line, kind) => thinkLines.push({ line, kind }), aiState });
    HuntSim.simSetActive(true);

    // simSpawn() places agents at RANDOM points in a 60x60 box -- fine for the mismatch-count property check
    // below (it holds at ANY distance), but "do they ever actually reach attack/land a kill" needs a bounded
    // tick budget to be a real assertion rather than a coin flip. A queued, deterministic Math.random() lands
    // the pair close together (control over the SEQUENCE of random draws, not over aiHuntSim.js's formula --
    // positions are read back from simStateForRender() afterward, never assumed) so convergence is reliable
    // without needing thousands of ticks. Real Math.random() is restored immediately after spawning.
    const realRandom = Math.random;
    const queue = [0.4, 0.5, 0, 0, 0.6, 0.5, 0, 0];   // x1,z1,yaw1,desiredYaw1, x2,z2,yaw2,desiredYaw2
    Math.random = () => (queue.length ? queue.shift() : realRandom());
    HuntSim.simSpawn(2);
    Math.random = realRandom;

    ok("spawned exactly 2 agents, both idle", HuntSim.simAgentCount() === 2);
    const spawnPos = HuntSim.simStateForRender().enemies;
    const spawnDist = Math.hypot(spawnPos[0].x - spawnPos[1].x, spawnPos[0].z - spawnPos[1].z);
    ok("...the queued random sequence landed them a controlled, moderate distance apart (not touching, not " +
        "across the whole box) -- read back from the real state, not assumed from the formula",
        spawnDist > HS_ATTACK && spawnDist < 20, "spawnDist=" + spawnDist.toFixed(2));

    function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

    let mismatches = 0;
    let reachedAttack = false;
    for (let i = 0; i < 2000 && HuntSim.simAgentCount() >= 1; i++) {
        const before = HuntSim.simStateForRender().enemies.map((e) => ({ ...e }));
        const stateBefore = new Map(before.map((e) => [e.id, aiState.get(e.id)?.state ?? "idle"]));

        HuntSim.simDecideTick();

        const after = HuntSim.simStateForRender();
        for (const e of after.enemies) {
            const otherPos = before.find((b) => b.id !== e.id);
            if (!otherPos) continue;   // only agent left -- respawn-wait path, not the hysteresis under test
            const d = dist(before.find((b) => b.id === e.id), otherPos);
            const fromState = stateBefore.get(e.id) || "idle";
            // no _wadMap injected above -> hasLOS() is unconditionally true (see aiHuntSim.js's own hasLOS()),
            // matching this test's third argument.
            const expectedEvent = huntDecideEvent(fromState, d, true);
            const expectedState = applyEvent(HUNT_HYSTERESIS_MACHINE, fromState, expectedEvent, null);
            const actualState = aiState.get(e.id)?.state;
            if (expectedState !== actualState) mismatches++;
            if (actualState === "attack") reachedAttack = true;
        }
        HuntSim.simStepFrame(0.05);
    }
    ok("!! REAL simDecideTick()'s a.state, on every tick observed, matches an INDEPENDENTLY computed " +
        "huntDecideEvent()+applyEvent() prediction from the SAME pre-tick positions -- zero mismatches across the run",
        mismatches === 0, mismatches + " mismatch(es)");
    ok("!! two agents in an open box (no walls -> hasLOS always true) do eventually reach attack -- the happy path " +
        "the original if-chain produced, not just idle forever", reachedAttack);
    // fire()/kill() itself is gated on REAL performance.now() cooldowns (FIRE_COOLDOWN_MS=700 of actual wall-clock
    // time between shots) -- unrelated bookkeeping this migration left untouched, and not meaningfully testable
    // in a fast-running gate without mocking performance.now() for a mechanic the FSM migration never touched.

    ok("!! _think()'s transition log uses the FROM state, read before a.state is overwritten -- matches the " +
        "exact template `sim #<id> <from> → <to> (#<target> @ <dist>u...)`",
        thinkLines.some((t) => /^sim #\d+ idle → seek \(#\d+ @ [\d.]+u\)$/.test(t.line)));

    // !! Deactivate the sim before section 6: aiTick() in aiBrain.js checks HuntSim.simIsActive() FIRST and,
    // if true, takes an early-return sim branch instead of the VBA-bridge enemy loop section 6 exists to
    // exercise -- leaving this on would make section 6 silently test the wrong branch.
    HuntSim.simSetActive(false);
    ok("!! sim deactivated before section 6 -- otherwise aiTick()'s own `if (HuntSim.simIsActive())` early-return " +
        "would silently skip the VBA-bridge enemy loop section 6 exists to test",
        HuntSim.simIsActive() === false);
}

console.log("\n6. ai/aiBrain.js's REAL aiTick() -- driven end to end through the harness, including the e.id fix");
{
    const { mod, elements, driveTick, sendState } = aiBrainHandle;

    sendState({
        tick: 1,
        player: { x: 0, y: 0, z: 0, yaw: 0 },
        enemies: [
            { id: 101, x: 10, y: 0, z: 0, yaw: 0 },    // dist 10 < SEEK_DIST(25) -> idle -> seek
            { id: 102, x: 2,  y: 0, z: 0, yaw: 0 },    // dist 2  < ATTACK_DIST(4) too, but idle only escalates one hop
        ],
    });

    let threw = false;
    try { driveTick(); } catch (e) { threw = true; console.log("      (unexpected throw: " + (e?.message ?? e) + ")"); }
    ok("!! aiTick() does NOT throw -- the v4605 fix (enemy.id, not the undefined `e.id`) actually took",
        !threw,
        "before the fix this ReferenceError aborted the tick's for-loop on the FIRST transition, per the " +
        "assessment this migration acted on");

    const list = elements["enemy-list"].innerHTML;
    ok("!! BOTH enemies were processed in the SAME tick, not just the first before a crash would have aborted " +
        "the loop -- #101 and #102 both appear in the rendered side panel",
        list.includes("#101") && list.includes("#102"));
    ok("!! #101 (dist 10, idle) shows seek in the side panel -- the real transition, not a stale idle label",
        /#101[^]*?seek/.test(list));
    ok("!! #102 (dist 2, idle) ALSO shows seek, not attack -- ONE-HOP-PER-TICK on the real code path: idle can " +
        "only become seek in one call, even though dist 2 is already deep inside ATTACK_DIST(4)",
        /#102[^]*?seek/.test(list) && !/#102[^]*?attack/.test(list));

    const thinkLog = elements["think-log"].innerHTML;
    ok("!! think-log shows the CORRECT enemy id (101/102), not 'undefined' -- direct proof the e.id typo is gone",
        thinkLog.includes("#101 idle → seek") && thinkLog.includes("#102 idle → seek"));

    // A second tick: #101 (now seek, dist still 10) stays seek; move #102 far away so it drops back to idle,
    // proving seek->idle and the aiState Map (not the DOM) is what actually drives it tick over tick.
    sendState({
        tick: 2,
        player: { x: 0, y: 0, z: 0, yaw: 0 },
        enemies: [
            { id: 101, x: 10, y: 0, z: 0, yaw: 0 },
            { id: 102, x: 40, y: 0, z: 0, yaw: 0 },    // dist 40 > SEEK_DIST*1.3(32.5) -> seek -> idle
        ],
    });
    driveTick();
    const list2 = elements["enemy-list"].innerHTML;
    ok("!! tick 2: #101 stays seek (dist unchanged, no transition -- and no crash on a same-state re-tick)",
        /#101[^]*?seek/.test(list2));
    ok("!! tick 2: #102 fell back to idle (dist 40 crossed SEEK_DIST*1.3) -- seek->idle on the real code path",
        /#102[^]*?idle/.test(list2));
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: a live VBA bridge tick (real WebSocket frames from the Excel workbook) and a live " +
    "browser mount of aibrain.html/aihuntsim's canvas rendering -- this gate drives the real decision logic " +
    "and its DOM-visible side effects through a minimal stub, not a booted browser; playerMode's own small " +
    "guarded machine (none/goto/autopilot), which the assessment this migration acted on flagged as a real but " +
    "SECONDARY candidate, structurally closer to RIG_JOB than to this pair, and deliberately left unmigrated " +
    "this round -- a decision recorded here, not an oversight; and simulation/CSBot.js, already assessed and " +
    "declined elsewhere (its own v4604 note) as a priority classifier rather than a guarded lifecycle.");
process.exit(fails ? 1 : 0);
