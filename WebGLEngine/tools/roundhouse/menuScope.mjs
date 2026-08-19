// WebGLEngine/tools/roundhouse/menuScope.mjs -- v3394
//
// *** DeepVerify ASSERTS THAT GIVING AN AGENT MORE TOOLS MAKES IT WORSE. THIS MEASURES IT ON OUR OWN CORPUS,
// AND THE ASSERTION SPLITS IN TWO. ***
//
// xiongsiheng/DeepVerify's README says: "evidence suggests that giving an agent more tools does not make it
// better... you should WHITELIST TOOL NAMES rather than using everything available on the MCP server", and it
// names its own redundant pair (read_url vs read_pdf). That is somebody else's evidence about somebody else's
// corpus, and adopting it would be taking a rule on trust -- which is the thing this tree refuses everywhere
// else. SweK HAS THE INSTRUMENT TO ASK THE QUESTION ITSELF.
//
// WHERE SweK ACTUALLY HAS A TOOL MENU: deviceCritic's critiqueClaim hands the proposer the FULL observable list
// of a device on every rejection ("Valid: ..."), and nearest() suggests the closest name to what was asked for.
// THAT IS THE MENU, AND ITS SIZE IS A CHOICE NOBODY HAS MEASURED.
//
// THE EXPERIMENT IS A PLANT. Take a real observable, delete one character -- the corrupted token is the input
// and THE OBSERVABLE WE CORRUPTED IS THE ANSWER KEY. Ask nearest() to recover it, under two conditions:
//
//   WHITELISTED  the menu is the one device's own observables, which is what the critic does today
//   POOLED       the menu is every observable of all 63 devices, which is what "all tools" would mean
//
// Three outcomes, and the middle one is the one that matters: CORRECT (the answer key came back), WRONG (a
// confident suggestion of the wrong name), NONE (the guard refused to guess). A WRONG SUGGESTION IS WORSE THAN
// NO SUGGESTION -- nearest()'s own comment says so -- because it sends the proposer somewhere specific.
//
// *** WHAT IT FOUND, AND IT IS SHARPER THAN THE CLAIM IT TESTS: "MORE OPTIONS" IS NOT ONE THING.
//
//   growing ONE DEVICE'S menu from 4 to 68 does NOT degrade the critic -- no trend at all
//        k=2-9   0.35% wrong        k=16-25  0.67% wrong
//        k=10-15 1.19% wrong        k=26+    0.55% wrong        NON-MONOTONE
//
//   POOLING menus across devices DOES -- 0.78% wrong becomes 2.24%, a 2.87x rise
//
//   and 79.4% OF THE POOLED DAMAGE IS A NAME FROM ANOTHER DEVICE'S NAMESPACE (50 cross-device to 13 same)
//
// THE NUMBERS ABOVE ARE THE ONES THIS FILE PRODUCES. My first probe read 1.14% / 3.16% / 83.5% because it
// counted a corruption position twice on short names; the deduped positions in typoPositions() are the honest
// set, and the CONCLUSION did not move -- 2.77x became 2.87x. A first measurement needing an audit, again.
//
// SO THE COST IS NOT SIZE, IT IS MIXING NAMESPACES. *** That matters because the two suggest opposite fixes: a
// SIZE story says cap the menu, which would cripple lens (68 observables) for nothing; a NAMESPACE story says
// scope the menu to the device, which is free and is what the critic already does. THE RIGHT RULE WAS ALREADY
// IN THE CODE AND NOBODY KNEW WHY.
"use strict";
import { nearest } from "./deviceCritic.mjs";

/** Delete one character. A single-character typo is the cheapest realistic corruption and the key is exact. */
export const typoAt = (word, i) => word.slice(0, i) + word.slice(i + 1);

/** The corruption positions, fixed so the measurement is deterministic and re-runnable. */
export const typoPositions = (word) => [1, Math.floor(word.length / 2), word.length - 2]
    .filter((i, k, a) => i >= 1 && i < word.length && a.indexOf(i) === k);

/**
 * Recovery under one menu. `truthOf` maps a corrupted token back to the observable it came from -- the ANSWER
 * KEY -- so nothing here decides correctness by looking at the suggestion.
 */
export function recoveryTrial(sources, menu) {
    let total = 0, correct = 0, wrong = 0, none = 0;
    const misses = [];
    for (const truth of sources) {
        for (const i of typoPositions(truth)) {
            const bad = typoAt(truth, i);
            if (menu.includes(bad)) continue;          // the corruption landed on another real name; not a typo case
            total++;
            const guess = nearest(bad, menu);
            if (guess === null) none++;
            else if (guess === truth) correct++;
            else { wrong++; misses.push({ truth, bad, guess }); }
        }
    }
    return { total, correct, wrong, none, misses };
}

/** Every device's observable list, plus the pooled union -- derived from the registry, never typed. */
export async function collectMenus({ DEVICE_NAMES, getDevice }) {
    const menus = [], pooled = new Set(), owners = {};
    for (const name of DEVICE_NAMES) {
        let d;
        try { d = await getDevice(name); } catch { continue; }
        const obs = (d && d.observables) || [];
        if (obs.length < 2) continue;
        menus.push({ name, obs });
        for (const o of obs) { pooled.add(o); (owners[o] = owners[o] || new Set()).add(name); }
    }
    return { menus, pooled: [...pooled], owners };
}

/** The whole measurement: whitelisted against pooled, plus where the pooled damage comes from. */
export async function menuScope(registry) {
    const { menus, pooled, owners } = await collectMenus(registry);
    const white = { total: 0, correct: 0, wrong: 0, none: 0 };
    const bands = {};
    for (const m of menus) {
        const r = recoveryTrial(m.obs, m.obs);
        white.total += r.total; white.correct += r.correct; white.wrong += r.wrong; white.none += r.none;
        const b = m.obs.length < 10 ? "2-9" : m.obs.length < 16 ? "10-15" : m.obs.length < 26 ? "16-25" : "26+";
        const t = bands[b] = bands[b] || { devices: 0, total: 0, correct: 0, wrong: 0 };
        t.devices++; t.total += r.total; t.correct += r.correct; t.wrong += r.wrong;
    }
    const pool = recoveryTrial(menus.flatMap((m) => m.obs), pooled);
    // WHERE the pooled damage comes from: a suggestion belonging to a device that did not own the true name.
    let cross = 0, sameDevice = 0;
    for (const m of menus) {
        const r = recoveryTrial(m.obs, pooled);
        for (const miss of r.misses) ((owners[miss.guess] || new Set()).has(m.name) ? sameDevice++ : cross++);
    }
    return {
        deviceCount: menus.length,
        menuSizes: menus.map((m) => m.obs.length).sort((a, b) => a - b),
        pooledSize: pooled.length,
        whitelisted: white, pooled: pool, bands,
        crossNamespace: cross, sameNamespace: sameDevice,
    };
}

export const wrongRate = (r) => (r.total > 0 ? r.wrong / r.total : 0);
