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
export function ledgerState({ root = ROOT, eng = ENG, file = LEDGER } = {}) {
    const led = readLedger(file);
    const tree = engineVersion(eng), treeN = num(tree);
    const tags = (led && Array.isArray(led.releases) ? led.releases.map((r) => r.tag) : []);
    const relN = tags.map(num).filter(Boolean).sort((a, b) => b - a);
    const latest = relN.length ? relN[0] : 0;
    const shipped = shippedVersions(root);
    const floor = led && led.baseline && +led.baseline.throughVersion || 0;

    // Versions shipped AFTER the baseline, excluding the one being shipped right now, that have no release.
    const owed = shipped.filter((v) => v > floor && v < treeN && !relN.includes(v)).sort((a, b) => b - a);
    return {
        tree, treeN, latest, latestTag: latest ? "v" + latest : "",
        behind: treeN && latest ? treeN - latest : null,
        releaseCount: relN.length, shippedCount: shipped.length, floor, owed,
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
