// tools/ship/changelogSource.mjs -- WHERE THE CHANGELOG ACTUALLY IS, DECLARED ONCE.
//
// v4002 -- *** THE RECORD MOVED AND FOUR TOOLS WERE STILL READING THE OLD ADDRESS. ***
//
// Keith's rig reported corpusText-selfcheck red with `missing: changelog, todo`, and a file search settled it:
// BACKLOG.md and TODO.md are NOT on the rig, are tracked in NO commit of this repository, and the reasoning
// they held now lives in docs/CHANGELOG.md -- 699,535 bytes, TRACKED, split out of README.md at v3941 because
// it was 99.1% of the front page. It travels with every clone. THE TEXT WAS NEVER LOST; ITS ADDRESS CHANGED.
//
// *** AND THE GATE BUILT TO CATCH EXACTLY THIS HAD SWITCHED ITSELF OFF. *** changelogCurrency-selfcheck exists
// because v3041..v3080 -- forty rounds of shipped work -- landed with BACKLOG.md unchanged. On a clone it
// SKIPS, saying in as many words: "The records exist on the rig and are checked there." That is an ASSUMPTION,
// and corpusText's live read on the rig disproves it. The file is absent on both machines, so the skip fires
// everywhere and the guard has been running nowhere. A GATE THAT SKIPS ON EVERY MACHINE IS SWITCHED OFF, and
// this one was switched off by the .gitignore rule it cites as its reason for skipping.
//
// The consequence is measurable: docs/CHANGELOG.md's newest entry is `## Since v3970`, and the tree is well
// past that. The forty-round failure recurred, under the gate written to prevent it recurring.
//
// ONE DECLARATION, because "two declarations about one thing that nobody ever compared" is this tree's most
// repeated defect and four separate spellings of BACKLOG.md is what produced this one.
"use strict";
import fs from "node:fs";
import path from "node:path";

/** Project-root-relative. history goes in docs/, which is Keith's rule and why CHANGELOG-*.md moved there. */
export const CHANGELOG_REL = "docs/CHANGELOG.md";

/** The retired addresses, kept NAMED so a reader meeting one in an old tool knows what they are looking at. */
export const RETIRED_SOURCES = ["BACKLOG.md", "TODO.md"];

export function changelogPath(projectRoot) { return path.join(projectRoot, CHANGELOG_REL); }

/** The text, or null. NULL AND EMPTY ARE DIFFERENT: absent is a finding, empty is a different finding. */
export function readChangelog(projectRoot) {
    try { return fs.readFileSync(changelogPath(projectRoot), "utf8"); } catch { return null; }
}

// Entries are `## Since vNNNN — ...`. The older per-version files beside it use `## vNNNN -- ...`, and the
// retired TODO.md used `- vNNNN: ...`. ALL THREE ARE ACCEPTED, anchored to line start, because the point is
// to read the record that exists rather than to insist on the spelling one tool preferred.
const HEAD = /^## (?:Since )?v\d+/m;

/** Split into entries, newest first. */
export function entries(text) {
    if (!text) return [];
    const src = String(text);
    const out = [];
    const re = /^## (?:Since )?v\d+.*$/gm;
    const starts = [...src.matchAll(re)].map((m) => m.index);
    for (let i = 0; i < starts.length; i++) out.push(src.slice(starts[i], starts[i + 1] ?? src.length).trim());
    return out;
}

/** The newest N entries as one string, or null when there is no record at all. */
export function head(projectRoot, n = 1) {
    const text = readChangelog(projectRoot);
    if (text === null) return null;
    const e = entries(text);
    return e.length ? e.slice(0, n).join("\n\n") : null;
}

/**
 * Does the record NAME this version at a line start?
 *
 * ANCHORED, AND \b IS LOAD-BEARING. A passing mention mid-prose must not satisfy it -- that is how a frozen
 * file satisfies a currency check forever -- and v3081 must not be satisfied by v30811.
 */
export function namesVersion(text, v) {
    return new RegExp("^(## (?:Since )?|- )" + v + "\\b", "m").test(String(text || ""));
}

/** The newest version the record names, or null. For reporting HOW STALE rather than merely THAT it is. */
export function newestVersion(text) {
    const m = /^## (?:Since )?v(\d+)/m.exec(String(text || ""));
    return m ? Number(m[1]) : null;
}
export { HEAD as ENTRY_HEAD };
