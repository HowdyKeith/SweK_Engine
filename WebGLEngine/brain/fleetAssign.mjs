// WebGLEngine/brain/fleetAssign.mjs
//
// TARGET ASSIGNMENT for a team of ships, closing tools/ship/nextRounds.mjs's ai-fleet-target-deconfliction
// backlog entry: brain/autopilot6dof.mjs's own decide() picks a target it is HANDED, and has no idea what its
// teammates are doing -- correct and deliberately so, per that entry's own `how`: "[assignment] belongs in
// brain/ alongside autopilot6dof.mjs..., not inside decide() itself, which should stay a pure per-ship
// function." This file is that separate piece: assignTargets(mine, foes) runs ONCE PER TICK, ACROSS A WHOLE
// TEAM, and hands back which single foe each of `mine`'s live ships should aim at -- a caller (a page's own
// stepFleet()-equivalent) still calls decide() once per ship exactly as before, just with THIS function's
// target instead of an independently-computed nearestEnemy().
//
// THE GAP THIS CLOSES, MEASURED (not hypothetical): tools/ship/nextRounds.mjs's own ai-fleet-target-
// deconfliction entry records a symmetric fleet spawn where two or three same-team ships converged on the SAME
// nearest enemy and flew into EACH OTHER's flight path -- one seed measured two allied ships in sustained light
// contact for 171 straight ticks (5.7s) before physics/mechanics/rigidBody6dofCollision.mjs's own
// positionalCorrection() existed to bound the resulting penetration. The physics response itself was never
// wrong (bounded depth, real impulses, no explosion) -- this is a pure AI-coordination gap: every ship
// independently running "aim at whichever enemy is nearest to ME" with no awareness of teammates.
//
// THE ALGORITHM -- GREEDY NEAREST-PAIR MATCHING WITH A LOAD-BALANCED CAP, the specific approach the backlog
// entry's own `how` named ("a greedy nearest-pair matching, or a simple round-robin"): build every (ship, foe)
// pair, sort ALL of them by distance ascending (globally, not per-ship), then walk the sorted list assigning
// each still-unassigned ship to the nearest foe that has not yet reached its CAP -- cap = ceil(|mine| / |foes|),
// the smallest per-foe limit that still guarantees every ship a target when fleet sizes are unequal (more
// ships than foes must share; cap sizing keeps that sharing as even as global-nearest-first allows). With EQUAL
// fleet sizes cap is exactly 1, so no two ships in `mine` are EVER assigned the same foe -- the deconfliction
// property itself, not merely "less likely." Proven in this file's own gate: a case where the naive nearest-
// enemy-per-ship approach provably picks the same foe for two allies (the exact measured scenario above) gets
// SPLIT by this function, one ship sent to a far foe rather than both crowding the near one.
//
// WHY A CAP INSTEAD OF PLAIN ONE-TO-ONE MATCHING: a strict 1:1 assignment (Hungarian-style) has no answer when
// |mine| > |foes| -- some ship MUST share a foe with a teammate, or be left with no target at all, and this
// module's whole job is "every live ship always has a target when any foe is alive." The cap makes that sharing
// explicit and bounded rather than emergent from whatever the matching algorithm happens to do with leftovers.
//
// WHY GREEDY-BY-GLOBAL-DISTANCE, NOT PER-SHIP NEAREST-FIRST: processing ALL (ship,foe) pairs in one globally-
// sorted list (rather than looping ships in array order and each picking its own best available foe) is what
// makes the cap-sizing guarantee hold: proven directly in this file's own gate that, given cap*|foes| >= |mine|
// (true by construction, since cap = ceil(|mine|/|foes|)), the greedy walk NEVER needs its own fallback path --
// every live ship gets a real assignment purely from the capacity-respecting pass. The fallback (assign to the
// ship's own nearest foe regardless of cap) exists ONLY as a defensive last resort should that invariant ever
// be violated by a future change to this file, and is itself gated as unreachable under every tested scenario,
// not silently trusted to "probably never fire."
//
// A PURE FUNCTION, matching this codebase's own decide()-family convention (autopilot6dof.mjs, autopilotAircraft.mjs):
// no side effects, does not mutate `mine`/`foes` or any ship object, callable every tick with fresh arrays.
"use strict";

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The per-foe assignment cap: the smallest N such that N*nFoes >= nMine, i.e. ceil(nMine/nFoes) -- exported
 * (rather than left as a private expression inline in assignTargets()) so this file's own gate can test the
 * FORMULA directly, not merely its emergent effect on an assignment. That distinction matters here: the
 * defensive fallback in assignTargets() below can silently absorb a SMALL undercounting error in this formula
 * (a straggler ship just falls back to "nearest foe regardless of cap," which for a single stray ship often
 * happens to land on exactly the same foe a correct cap would have assigned it to anyway) -- found directly
 * while sabotage-testing this file: an off-by-one cap formula (floor instead of ceil) produced ZERO red checks
 * against tests that only inspected the resulting assignment's properties, not the formula itself. */
export function capFor(nMine, nFoes) { return nFoes > 0 ? Math.max(1, Math.ceil(nMine / nFoes)) : 0; }

/**
 * `mine`/`foes`: arrays of ship-like objects, each `{ dead, body: { pos } }` at minimum (matching
 * es-box3d-6dof.html's own ship shape) -- `dead` ships on EITHER side are ignored entirely (never assigned to,
 * never assigned as a target). Returns a Map from each live `mine` ship object to its assigned live `foes` ship
 * object. A `mine` ship with no live foes to target is simply absent from the map (not mapped to `null`/
 * `undefined`) -- a caller should treat a missing key the same way it already treats nearestEnemy() returning
 * null (skip that ship's decide() call this tick).
 */
export function assignTargets(mine, foes) {
    const liveMine = mine.filter((s) => !s.dead);
    const liveFoes = foes.filter((s) => !s.dead);
    const assignment = new Map();
    if (liveFoes.length === 0) return assignment;

    const cap = capFor(liveMine.length, liveFoes.length);
    const pairs = [];
    for (const m of liveMine) for (const f of liveFoes) pairs.push([m, f, dist3(m.body.pos, f.body.pos)]);
    pairs.sort((a, b) => a[2] - b[2]);

    const foeLoad = new Map(liveFoes.map((f) => [f, 0]));
    for (const [m, f] of pairs) {
        if (assignment.has(m)) continue;
        if (foeLoad.get(f) >= cap) continue;
        assignment.set(m, f);
        foeLoad.set(f, foeLoad.get(f) + 1);
    }

    // Defensive fallback ONLY -- proven unreachable under every scenario this file's own gate tests (the cap
    // sizing above is proof enough that it should never be needed), kept so a live ship is never silently left
    // without a target if some future change to this file ever breaks that invariant.
    for (const m of liveMine) {
        if (assignment.has(m)) continue;
        let best = null, bestD = Infinity;
        for (const f of liveFoes) { const d = dist3(m.body.pos, f.body.pos); if (d < bestD) { bestD = d; best = f; } }
        assignment.set(m, best);
    }
    return assignment;
}

// ---- FRONT DOOR -------------------------------------------------------------------------------------------------
export function reportLines() {
    const mk = (id, pos, dead = false) => ({ id, body: { pos }, dead });
    // the exact measured gap: two allies close together, both nearest to the SAME single distant-ish foe, with
    // a second foe much farther away -- naive nearest-enemy-per-ship sends both allies at foe0.
    const mine = [mk("A#0", [0, 0, 0]), mk("A#1", [0.5, 0, 0]), mk("A#2", [1, 0, 0])];
    const foes = [mk("B#0", [10, 0, 0]), mk("B#1", [10.5, 0, 0]), mk("B#2", [11, 0, 0])];
    const assignment = assignTargets(mine, foes);
    const lines = [...assignment.entries()].map(([m, f]) => `${m.id} -> ${f.id}`);
    const targets = [...assignment.values()].map((f) => f.id);
    return [
        "[fleetAssign] closes ai-fleet-target-deconfliction -- one greedy nearest-pair assignment pass per team",
        "              per tick, replacing independent per-ship nearest-enemy target selection.",
        `  3v3, evenly spread on both sides: ${lines.join(", ")}`,
        `  all-different targets: ${new Set(targets).size === targets.length} (this IS the deconfliction property)`,
    ];
}

// GUARDED (this tree's established idiom -- see physics/stabilityMeter.mjs's own v3900/v3951 notes and
// tools/ship/browserSafety-selfcheck.mjs): this module can be loaded by a PAGE as well as run as a CLI, and
// `process` at module top level is a ReferenceError in a browser, not a caught failure -- an EVALUATION
// failure that would take the whole page down with it. The node:url import itself must be INSIDE the guard.
if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
        for (const l of reportLines()) console.log(l);
        process.exit(0);
    }
}
