// WebGLEngine/ui/pick.mjs -- v4824
//
// THE BEST CANDIDATE IN A LIST: WALK IT ONCE, SKIP WHAT DOES NOT QUALIFY, KEEP THE ONE WITH THE SMALLEST (OR
// LARGEST) KEY, AND LET THE FIRST ONE FOUND WIN A TIE.
//
// The third shape tools/ship/nextRounds.mjs's "npc-decision-framework" audit named, after ui/machine.mjs's
// guarded lifecycle and ui/guards.mjs's first-match chain: the TARGET-SCORING scan. Kaiju.js, KaijuManager.js,
// KaijuRivalry.js and OgreScenario.js each wrote it by hand, several times, as
//
//     let best = null, bestD2 = range2;
//     for (const t of list) { if (!qualifies(t)) continue; const d2 = ...; if (d2 < bestD2) { bestD2 = d2; best = t; } }
//
// and the copies differ only in the list, the filter, the key and the starting bound. Nothing persists between
// calls and there is no ordered rule list, so neither existing utility is this shape -- forcing it into either
// would be the CSBot.js mistake the audit warns about.
//
// *** THE THREE PROPERTIES EVERY HAND-WRITTEN COPY HAD, KEPT HERE EXACTLY, BECAUSE A MIGRATION THAT LOSES ONE IS
// A BEHAVIOUR CHANGE DRESSED AS A REFACTOR: ***
//   1. STRICT comparison against the running best, so on a tie the FIRST candidate in iteration order wins.
//   2. The BOUND is exclusive and is the starting best: a candidate at exactly range^2 is out of range, and with
//      no candidate under it the answer is "none" -- `{ found: false, key: bound }`, which is what a hand-written
//      loop left in its two variables.
//   3. keyOf runs ONCE per item, IN ORDER, even for items it rejects by returning null. Kaiju.js's flee pick draws
//      Math.random() inside its key, so the draw sequence is part of the behaviour.
// A NaN key never beats anything (NaN < x is false), as it never did in the loops this replaces.
"use strict";

/**
 * @template T
 * @param {Iterable<T>} items
 * @param {(item: T, index: number) => (number|null|undefined)} keyOf  null/undefined = does not qualify
 * @param {number} [bound=Infinity]  exclusive: only a key strictly below it can be picked
 * @returns {{found: boolean, item: (T|null), key: number, index: number}}
 */
export function pickMin(items, keyOf, bound = Infinity) {
    let found = false, item = null, key = bound, index = -1, i = 0;
    for (const it of items) {
        const k = keyOf(it, i);
        if (k != null && k < key) { found = true; item = it; key = k; index = i; }
        i++;
    }
    return { found, item, key, index };
}

/** The mirror image: the LARGEST key strictly above `bound` (default -Infinity), first one wins a tie. */
export function pickMax(items, keyOf, bound = -Infinity) {
    let found = false, item = null, key = bound, index = -1, i = 0;
    for (const it of items) {
        const k = keyOf(it, i);
        if (k != null && k > key) { found = true; item = it; key = k; index = i; }
        i++;
    }
    return { found, item, key, index };
}
