// WebGLEngine/tools/ship/releaseLedger.mjs -- v4449
//
// *** THE FLEET RUNS WHAT WAS PUBLISHED, AND WHAT WAS PUBLISHED IS ALMOST NEVER WHAT WAS BUILT. ***
//
// Keith: "we want you publish a release per shipped version, so the fleet runs what is actually built."
//
// MEASURED BEFORE ANYTHING WAS WRITTEN, from the GitHub releases API against docs/CHANGELOG.md:
//
//     tree ENGINE_VERSION       v4448
//     newest published release  v4438      the fleet is TEN VERSIONS BEHIND what is built
//     releases published         25        v3936 .. v4438
//     shipped in the changelog  261        v4159 .. v4448
//     shipped AND released        3 of 261 = 1.1%
//
// THREE OF TWO HUNDRED AND SIXTY-ONE. The download half of this has been finished and correct since v3907 --
// githubBridge.fetchEngineBuild pulls releases/latest, scanDownloads finds the asset, the installer applies
// it, and every one of those steps has a gate. What it pulls is v4438 because v4438 is the newest thing
// anyone published. THE CHAIN IS NOT BROKEN; IT IS FED BY HAND, AND HANDS SKIP.
//
// ---- WHY THIS IS A LEDGER AND NOT A CI JOB, WHICH IS A DECISION THE TREE ALREADY MADE AND MEASURED --------
//
// The obvious fix is "publish from CI on every push to main". .github/workflows/release.yml refuses to, and
// its v4068 note says why in numbers: the zip is NOT byte-reproducible across machines, because the packer
// walks a live tree. The same commit (dbc0855, v4067) produced 26,775,683 bytes on the CI runner, 27,424,068
// on the rig and 27,766,762 in a third checkout. A CI publisher would replace the artifact the rig built,
// verified and shipped with a different one assembled elsewhere -- silently, under a release somebody may
// already have downloaded. Ten CI runs died on that before the workflow stopped trying.
//
// So the rig stays the publisher, and what was missing was never the code: IT WAS THE ASKING. The ship ritual
// had eight steps and not one of them said "publish". A step nobody is asked for is a step that happens when
// somebody remembers, and 1.1% is what remembering looks like over 261 rounds.
//
// ---- WHAT THIS FILE IS ------------------------------------------------------------------------------------
//
// releases.json is the RECORD of what is published, refreshed from the API by a tool rather than believed.
// This module reads it and answers one question offline: IS THE LAST SHIPPED VERSION PUBLISHED? The gate
// beside it refuses the next ship when the answer is no.
//
// *** OFFLINE ON PURPOSE. *** engineUpdateSource-selfcheck's own rule: "a gate that needed GitHub to be
// reachable would be a gate that goes red when the wifi does, and this tree has enough real reds." The refresh
// touches the network; the gate never does.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ROOT = path.resolve(ENG, "..");
export const LEDGER = path.join(ENG, "tools", "ship", "releases.json");

/** The engine's own version marker -- the single spelling, matching githubBridge._parseEngineVersion. */
export function engineVersion(root = ENG) {
    try {
        const m = fs.readFileSync(path.join(root, "main.js"), "utf8").match(/ENGINE_VERSION\s*=\s*"(v\d+)"/);
        return m ? m[1] : "";
    } catch { return ""; }
}

/** Every version the changelog says was shipped, newest first. Absent changelog is a legal state (see below). */
export function shippedVersions(root = ROOT) {
    try {
        const src = fs.readFileSync(path.join(root, "docs", "CHANGELOG.md"), "utf8");
        return [...src.matchAll(/^## v(\d+)/gm)].map((m) => +m[1]).sort((a, b) => b - a);
    } catch { return []; }
}

/**
 * *** v4453 -- THE VERSIONS THAT REACHED MAIN, WHICH IS WHAT THE RULE WAS ALWAYS ABOUT. ***
 *
 * The rule's own words, written at v4449: "a version that reaches MAIN and never reaches the releases page is
 * a version nobody outside this repo will ever run." It was then checked against the WORKING TREE's changelog
 * -- which gains a round's entry in the same commit as the version bump, long before anything merges. So a
 * round sitting on an unmerged branch counted as debt the fleet was owed, when nobody could download it and
 * nobody was missing anything.
 *
 * THE FALLBACK IS STRICTER, NEVER LOOSER, AND THAT IS THE WHOLE OF WHY IT IS SAFE. If origin/main cannot be
 * read -- no git, no remote ref, a fresh checkout -- this returns the working tree's list, which is a SUPERSET
 * (it holds main's rounds plus any unmerged ones). A gate that cannot see main therefore over-reports debt and
 * says which it did; the failure mode of a missing tool is a stricter check, not a quieter one.
 */
// *** THE READER IS INJECTABLE, AND TWO SABOTAGES ARE WHY. *** Swapping this function's answer for the
// working tree's went ZERO RED twice, because at the moment it was tested the branch and main were IDENTICAL
// -- no count could tell them apart, so a check comparing counts was unfalsifiable on the very state it ran
// in. That is v4435's family: a check that cannot fail on the thing it is about. With `read` injected, a gate
// can hand in a main that DIFFERS from the tree and see which one the arithmetic used.
export function mainVersions(root = ROOT, { read } = {}) {
    try {
        const out = read ? read() : execFileSync("git", ["show", "origin/main:docs/CHANGELOG.md"],
            { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
        const v = [...out.matchAll(/^## v(\d+)/gm)].map((m) => +m[1]).sort((a, b) => b - a);
        if (v.length) return { versions: v, source: "origin/main", degraded: false, why: "" };
        return { versions: shippedVersions(root), source: "working tree", degraded: true,
                 why: "origin/main's changelog parsed to zero versions" };
    } catch (e) {
        return { versions: shippedVersions(root), source: "working tree", degraded: true,
                 why: "origin/main unreadable (" + String((e && e.message) || e).split("\n")[0].slice(0, 90) + ")" };
    }
}

export function readLedger(file = LEDGER) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

export const num = (tag) => +String(tag || "").replace(/^v/, "") || 0;

/**
 * *** THE ONE QUESTION, AND THE REASON IT IS ASKED ABOUT THE PREVIOUS VERSION RATHER THAN THIS ONE. ***
 *
 * The rule Keith asked for is "a release per shipped version". Checked naively -- "ENGINE_VERSION must have a
 * release" -- it is RED DURING EVERY SHIP BY CONSTRUCTION: verify runs before the commit, and the release is
 * published after the tag is pushed, so the version being shipped cannot possibly have one yet. A gate that
 * is red for the whole of every correct ship teaches people to ignore it, which is how this tree got a red
 * register nobody read for thirty-nine rounds.
 *
 * So the enforceable form is the RATCHET: *** YOU MAY NOT SHIP A NEW VERSION WHILE THE LAST ONE IS
 * UNRELEASED. *** It is false only when somebody actually skipped a release, it is true during a correct
 * ship, and it makes the gap unable to grow past one.
 */
export function ledgerState({ root = ROOT, eng = ENG, file = LEDGER, readMain = null } = {}) {
    const led = readLedger(file);
    const tree = engineVersion(eng), treeN = num(tree);
    const tags = (led && Array.isArray(led.releases) ? led.releases.map((r) => r.tag) : []);
    const relN = tags.map(num).filter(Boolean).sort((a, b) => b - a);
    const latest = relN.length ? relN[0] : 0;
    const shipped = shippedVersions(root);
    const onMain = mainVersions(root, readMain ? { read: readMain } : {});
    const floor = led && led.baseline && +led.baseline.throughVersion || 0;

    // Versions that reached MAIN after the baseline, excluding the one being shipped right now, with no release.
    //
    // *** v4461 -- A VERSION BELOW THE NEWEST PUBLISHED RELEASE IS SUPERSEDED, NOT OWED, AND COUNTING IT WAS
    // THE THING THAT KEPT DEMANDING A BASELINE RAISE. *** `latest` was computed six lines up and never
    // consulted here, so publishing v4460 -- which contains every line of v4452 through v4459 -- cleared
    // exactly one name off the list and left seven, against a budget of three. The only reachable answer was
    // the escape hatch, for the FOURTH round running, and the ritual's own text says what to do instead:
    // "the next round that reaches for this line should fix the structure instead".
    //
    // The debt this file exists to measure is what the fleet CANNOT GET. A box that downloads releases/latest
    // at v4460 is running v4459's code, and v4458's, and v4452's; no separate build for any of them will ever
    // exist (the zip is not byte-reproducible, so one made today would carry bytes that version never had) and
    // nobody would download one if it did. Counting them was counting version NUMBERS where the rule is about
    // CODE IN SOMEBODY'S HANDS -- a proxy standing in for the fact, which is the defect this whole round is
    // about, sitting in the gate that polices the round.
    //
    // *** AND IT IS STRICTLY TIGHTER WHERE IT MATTERS, WHICH IS WHY IT IS NOT AN ESCAPE HATCH. *** It forgives
    // ONLY versions provably beneath a real, published, downloadable release. Publish nothing and `latest`
    // stops moving while main does not, so the list grows without bound and the gate goes red exactly as
    // before -- the do-nothing path is not made easier by one version. Unlike the baseline, which is a number
    // a person types, this floor can only be raised BY PUBLISHING SOMETHING.
    const supersededBy = Math.max(floor, latest);
    const owed = onMain.versions.filter((v) => v > supersededBy && v < treeN && !relN.includes(v)).sort((a, b) => b - a);

    // *** v4453 -- A LAG BUDGET, BECAUSE THE HARD ZERO MADE A WRITE-OFF THE ONLY ANSWER. ***
    //
    // v4449's ratchet said the previous version must be released, full stop. That is the right rule when the
    // ship and the publish happen on ONE machine. They do not: rounds are built where there are no
    // credentials to publish and the rig publishes later, by hand -- so the previous version is unreleased AT
    // EVERY SHIP, BY CONSTRUCTION, and the gate went red three rounds running. Each time the answer was to
    // raise the baseline, which is the sanctioned escape hatch, and THREE RAISES IN THREE ROUNDS IS A RULE
    // THAT HAS BEEN SWITCHED OFF POLITELY. A gate whose only reachable state is "write off the debt" is not
    // enforcing anything; it is collecting signatures.
    //
    // The budget is what the rule was actually protecting: not "zero lag" but "the fleet does not fall
    // behind". 1.1% over 261 rounds is the failure; two or three rounds between publishes is a workflow.
    // *** IT IS NOT PART OF baseline AND A WRITE-OFF CANNOT MOVE IT. *** The baseline forgives versions that
    // already went by; this bounds how far the NEXT ones may drift, and if the same edit could do both then
    // the escape hatch would have swallowed the rule again one level up.
    const budget = led && led.lagBudget && +led.lagBudget.maxVersionsBehind;
    const budgetStated = Number.isFinite(budget) && budget >= 0;

    // *** THE BUDGET BINDS ON ADDING TO MAIN, NOT ON PUBLISHING WHAT IS ALREADY THERE -- AND WITHOUT THIS IT
    // WAS A DEADLOCK. *** v4453 put the budget in a gate that verify runs, and the publish route runs verify:
    // `Clone -> verify` clones main and grades THAT tree, and `Publish the verified clone` refuses unless the
    // verdict was green. So once the lag exceeded the budget, THE GATE THAT EXISTS TO FORCE A PUBLISH BLOCKED
    // THE PUBLISH THAT WOULD CLEAR IT. Found at 7-of-3 with the fleet fourteen versions back and the one
    // action that fixes it locked behind the complaint about it. That is the original hard ratchet's shape
    // one level along, and it is worse: the ratchet could be answered by a write-off, this could be answered
    // by nothing at all.
    //
    // The discriminator is derived, not a flag: IS THIS TREE'S VERSION ALREADY ON MAIN? A clone of main
    // republishing v4460 adds nothing -- it is the catch-up the budget wants. A working tree bumped to v4461
    // is about to push main one further, which is exactly what the budget bounds. Same number, same list,
    // asked only of the party that can make the gap worse.
    const addsToMain = !!(treeN && !onMain.versions.includes(treeN));
    return {
        tree, treeN, latest, latestTag: latest ? "v" + latest : "",
        behind: treeN && latest ? treeN - latest : null,
        releaseCount: relN.length, shippedCount: shipped.length, floor, owed, supersededBy,
        // Named separately from `floor` so the two cannot be confused in a report: `floor` is a declared
        // write-off and `latest` is an observed publish. Only one of them can be raised by typing.
        supersededByPublish: latest > floor ? latest : 0,
        mainCount: onMain.versions.length, owedSource: onMain.source, owedDegraded: onMain.degraded,
        owedDegradedWhy: onMain.why,
        budget: budgetStated ? budget : null, budgetStated,
        // An UNSTATED budget is not an infinite one. A ledger with no lagBudget fails the gate rather than
        // passing it -- the v4413 defect (a floor and no ceiling) wearing this file's clothes.
        addsToMain,
        // NOT ASSERTED when this tree adds nothing to main -- and `budgetBinds` says so out loud, so the gate
        // can print WHY it is not complaining rather than printing nothing. A check that quietly stops
        // checking is the thing this file has caught three times.
        budgetBinds: addsToMain,
        withinBudget: !budgetStated ? false : (!addsToMain || owed.length <= budget),
        refreshedAt: led && led.refreshedAt || "",
        // The headline Keith's sentence is about: does releases/latest equal what the tree builds?
        fleetRunsWhatIsBuilt: !!(latest && treeN && latest === treeN),
    };
}

if (process.argv[1] && import.meta.url === "file://" + process.argv[1]) {
    const s = ledgerState();
    console.log("[releaseLedger] tree " + s.tree + "  latest release " + (s.latestTag || "(none)") +
                "  behind " + (s.behind === null ? "?" : s.behind));
    console.log("[releaseLedger] ledger holds " + s.releaseCount + " releases, refreshed " +
                (s.refreshedAt || "never") + "; baseline through v" + s.floor);
    console.log("[releaseLedger] owed (shipped after the baseline, before the current version, unreleased): " +
                (s.owed.length ? s.owed.map((v) => "v" + v).join(", ") : "none"));
    console.log("[releaseLedger] fleet runs what is built: " + (s.fleetRunsWhatIsBuilt ? "YES" : "NO"));
}
