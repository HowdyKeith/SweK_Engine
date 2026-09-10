// WebGLEngine/tools/ship/spaceSuit-selfcheck.mjs -- v4608
//
// Run: node tools/ship/spaceSuit-selfcheck.mjs
//
// GATES simulation/SpaceSuit.js's migration of _currentAtmosphere() onto ui/guards.mjs's evaluateGuards() --
// the FIRST real migration from tools/ship/nextRounds.mjs's "npc-decision-framework" PRIORITY-IF-ELSE cluster,
// after ui/guards.mjs itself (ui/guards-selfcheck.mjs) proved the evaluator in isolation. Behaviour-preservation
// gate, same convention as the earlier ui/machine.mjs migrations: every check asserts the SAME externally
// observable outcome the original if/else-if chain produced.
//
// *** WHY THIS FILE, FIRST. *** The npc-decision-framework audit named four PRIORITY-IF-ELSE candidates
// (arenaBot.js, DungeonAI.js, CivilizationEntity.js, SpaceSuit.js). Reading all four found the cluster was not
// one shape: arenaBot.js is a trivial 2-way branch, too small to be worth a shared utility (the same "too
// trivial alone" verdict CSBot.js's DEAD transition got in the FSM series); CivilizationEntity.js's build and
// decay checks are NOT exclusive -- both can fire the same tick, so there is no "first match wins" priority to
// preserve at all, and it was declined for that reason (see its own inline note). SpaceSuit.js's
// _currentAtmosphere() and DungeonAI.js's flee/melee/ranged/chase chain both ARE the real shape -- ordered,
// first-match-wins, remade fresh every call -- but SpaceSuit.js is the pure one: a classifier with no side
// effects, no entity mutation, no damage or projectile calls, comparable to BossPhaseManager.js being picked
// first in the FSM series for being the "clearest textbook" case. DungeonAI.js is confirmed a good fit and
// deliberately deferred to its own round, the same way CSBomb.js followed BossPhaseManager.js rather than being
// folded into the same migration.
"use strict";
import { SpaceSuit, ATMOSPHERE_GUARDS } from "../../simulation/SpaceSuit.js";
import { evaluateGuards } from "../../ui/guards.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("spaceSuit-selfcheck -- the first real migration onto ui/guards.mjs, behaviour pinned\n");

// A room the fixtures place the camera inside, unless a test explicitly moves the camera elsewhere.
const ROOM = (extra) => ({ x: 0, z: 0, w: 10, d: 10, ...extra });
function makeSuit({ camera, layout, swimMode } = {}) {
    return new SpaceSuit({
        camera: camera !== undefined ? camera : { position: { x: 5, y: 0, z: 5 } },
        ollamaLevelGen: layout !== undefined ? { _lastLevel: layout } : { _lastLevel: null },
        swimMode,
    });
}

console.log("1. THE DECLARED RULE LIST -- exhaustive by construction (a catch-all last guard), no reachability audit possible");
{
    ok("six guards, in the exact order the original if-chain checked them", ATMOSPHERE_GUARDS.length === 6 &&
        ATMOSPHERE_GUARDS.map((g) => g.name).join(",") ===
        "submerged,no-room,explicit-field,vacuum-gravity,thin-gravity,normal-gravity");
    ok("!! the LAST guard is an unconditional catch-all -- evaluateGuards can never return matched:null for this list",
        ATMOSPHERE_GUARDS[5].when() === true,
        "unlike ui/machine.mjs's declared graph, there is no audit() for this shape (see guards.mjs's own header) -- " +
        "exhaustiveness here is asserted directly against the guard list instead");
}

console.log("\n2. NO CAMERA, NO LAYOUT, OUTSIDE ANY ROOM -- all collapse to 'normal', same as the original's two separate code paths");
{
    ok("no layout at all", makeSuit({ layout: null })._currentAtmosphere() === "normal");
    ok("layout with zero rooms", makeSuit({ layout: { rooms: [] } })._currentAtmosphere() === "normal");
    ok("no camera", makeSuit({ camera: null, layout: { rooms: [ROOM()] } })._currentAtmosphere() === "normal");
    ok("camera present but standing outside every room's bounds",
        makeSuit({ camera: { position: { x: 999, y: 0, z: 999 } }, layout: { rooms: [ROOM()] } })._currentAtmosphere() === "normal");
}

console.log("\n3. AN EXPLICIT room.atmosphere FIELD WINS over the gravity heuristic, for all three valid values");
{
    for (const v of ["vacuum", "thin", "normal"]) {
        const s = makeSuit({ layout: { rooms: [ROOM({ atmosphere: v, gravity: 0.1 })] } });   // gravity says vacuum too, but the field should win either way here
        ok(`!! explicit atmosphere='${v}' is returned verbatim`, s._currentAtmosphere() === v);
    }
    // An explicit field that disagrees with what gravity alone would say still wins -- proves it's checked FIRST.
    const s = makeSuit({ layout: { rooms: [ROOM({ atmosphere: "normal", gravity: 0.1 })] } });
    ok("!! explicit 'normal' wins even though gravity=0.1 alone would say vacuum -- the field is checked before gravity",
        s._currentAtmosphere() === "normal");
}

console.log("\n4. THE GRAVITY HEURISTIC, BOTH BOUNDARIES PINNED AT THE EXACT NON-STRICT <= OPERATOR");
{
    const at = (g) => makeSuit({ layout: { rooms: [ROOM({ gravity: g })] } })._currentAtmosphere();
    ok("gravity=1.0 (no room.gravity override, matches the default) -> normal", at(1.0) === "normal");
    ok("gravity=0.86, just above the thin boundary -> normal", at(0.86) === "normal");
    ok("!! gravity=0.85, AT the thin boundary -> thin (pins the <= operator, not <)", at(0.85) === "thin");
    ok("gravity=0.51, just above the vacuum boundary -> thin", at(0.51) === "thin");
    ok("!! gravity=0.5, AT the vacuum boundary -> vacuum (pins the <= operator, not <)", at(0.5) === "vacuum");
    ok("gravity=0, deep vacuum -> vacuum", at(0) === "vacuum");
    ok("no room.gravity field at all defaults to 1.0 (normal), matching the original's `typeof ... === 'number' ? g : 1.0`",
        makeSuit({ layout: { rooms: [ROOM()] } })._currentAtmosphere() === "normal");
}

console.log("\n5. SUBMERGED OVERRIDES EVERYTHING -- checked before the room is even looked at");
{
    ok("!! submerged in a room with an explicit atmosphere='normal' field still reads vacuum",
        makeSuit({ layout: { rooms: [ROOM({ atmosphere: "normal" })] }, swimMode: { isSubmerged: () => true } })._currentAtmosphere() === "vacuum");
    ok("!! submerged with NO room at all (outside any layout) still reads vacuum, not normal",
        makeSuit({ layout: null, swimMode: { isSubmerged: () => true } })._currentAtmosphere() === "vacuum");
    ok("swimMode present but not submerged falls through to the room's own answer",
        makeSuit({ layout: { rooms: [ROOM({ atmosphere: "thin" })] }, swimMode: { isSubmerged: () => false } })._currentAtmosphere() === "thin");
    ok("no swimMode at all is treated the same as not-submerged (optional chaining, no throw)",
        makeSuit({ layout: { rooms: [ROOM({ atmosphere: "thin" })] }, swimMode: undefined })._currentAtmosphere() === "thin");
}

console.log("\n6. SABOTAGE -- reordering ATMOSPHERE_GUARDS must actually change behaviour, proving order is load-bearing here too");
{
    const reordered = [ATMOSPHERE_GUARDS[3], ...ATMOSPHERE_GUARDS.filter((_, i) => i !== 3)];   // vacuum-gravity moved to the front
    const ctx = { submerged: false, room: ROOM({ atmosphere: "normal", gravity: 0.1 }) };
    const original = evaluateGuards(ATMOSPHERE_GUARDS, ctx).result;
    const sabotaged = evaluateGuards(reordered, ctx).result;
    ok("!! with vacuum-gravity moved ahead of explicit-field, the SAME room now answers differently",
        original === "normal" && sabotaged === "vacuum",
        "original=" + original + " sabotaged=" + sabotaged + " -- if these matched, the gate would be proving nothing about order");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: DungeonAI.js's flee/melee/ranged-shoot/ranged-hold/chase guard chain -- confirmed a real fit " +
    "for ui/guards.mjs during this round's audit, deliberately deferred to its own round given the real combat " +
    "side effects (damage, projectiles, entity movement) and brain-hook patches stacked into it; and the rest of " +
    "SpaceSuit.js's own tick() (oxygen integration, jetpack fuel, HUD render), which this migration left untouched " +
    "as orthogonal to the classifier it replaced, the same way BossPhaseManager.js's counters were left alone.");
process.exit(fails ? 1 : 0);
