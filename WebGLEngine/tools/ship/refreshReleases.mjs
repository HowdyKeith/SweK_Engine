// WebGLEngine/tools/ship/refreshReleases.mjs -- v4449
//
// Run: node tools/ship/refreshReleases.mjs [--write]
//
// Rewrites tools/ship/releases.json from the GitHub releases API. The GATE never touches the network; this
// does, and only when asked. Without --write it prints what would change and touches nothing.
//
// *** IT PRESERVES THE BASELINE RATHER THAN RE-DERIVING IT. *** The baseline is a decision somebody made
// about which debt is written off; a refresh is a fact about the releases page. A tool that recomputed the
// decision from the facts every run would quietly write off every version that happens to be unreleased
// today, which is the opposite of a ratchet.
//
// No token is needed for a public repo's release list. If one is present (GITHUB_TOKEN or GH_TOKEN) it is
// sent, because an unauthenticated read is rate-limited to 60/hour and a ship should not fail on that.
"use strict";
import fs from "node:fs";
import { LEDGER, readLedger } from "./releaseLedger.mjs";

/**
 * *** THE PARSE IS A PURE FUNCTION SO IT CAN BE GRADED WITHOUT THE NETWORK, AND THAT IS NOT TIDINESS. ***
 * The sandbox this was written in answers the releases API with HTTP 401 through its proxy, so the fetch half
 * could not be exercised here. Rather than ship "it works" untested, the half that decides WHAT GOES IN THE
 * LEDGER is separated from the half that merely gets bytes, and the gate drives it with a real API payload
 * captured from this repo. The fetch remains unverified in this environment and the gate says so out loud.
 *
 * Drafts are not published, and a draft is not something the fleet can download. Prereleases ARE downloadable
 * but releases/latest skips them, so they are recorded and MARKED rather than silently counted as current --
 * a prerelease at the top of this list would otherwise read as "the fleet is up to date" when the fleet
 * cannot see it.
 */
export function rowsFrom(apiJson) {
    return (Array.isArray(apiJson) ? apiJson : [])
        .filter((r) => r && !r.draft && /^v\d+$/.test(r.tag_name || ""))
        .map((r) => Object.assign({ tag: r.tag_name, publishedAt: r.published_at }, r.prerelease ? { prerelease: true } : {}))
        .sort((a, b) => (+b.tag.slice(1)) - (+a.tag.slice(1)));
}

const RUN = process.argv[1] && import.meta.url === "file://" + process.argv[1];
if (!RUN) { /* imported for rowsFrom() -- no network, no exit */ }

const REPO = process.env.SWEK_ENGINE_REPO || "HowdyKeith/SweK_Engine";
const write = process.argv.includes("--write");

const tok = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const headers = { "Accept": "application/vnd.github+json", "User-Agent": "swek-release-ledger" };
if (tok) headers.Authorization = "Bearer " + tok;

let all = [];
if (RUN) for (let page = 1; page <= 10; page++) {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`, { headers });
    if (!r.ok) { console.error("[refreshReleases] HTTP " + r.status + " from the releases API -- ledger NOT written"); process.exit(1); }
    const j = await r.json();
    if (!Array.isArray(j) || !j.length) break;
    all = all.concat(j);
    if (j.length < 100) break;
}

// *** v4450 -- WHAT A LEDGER UPDATE IS, DECLARED ONCE. *** This block used to live inside the `if (RUN)`
// tail, which made it reachable only from the command line. The GitHub panel's "Refresh the ledger" button
// (v4450) needs exactly the same operation from a server route that already holds a token, and the cheap way
// to give it one is to write the diff-and-merge a second time in githubBridge. TWO SPELLINGS OF "WHAT THE
// LEDGER RECORDS" IS THE DEFECT THIS TREE KEEPS FINDING -- it is how a count goes stale on one path and not
// the other. So the operation is a pure function over (rows, prev) that returns the new document and the
// diff, and BOTH callers use it. It does no IO: the caller decides whether to write, which is what makes the
// CLI's dry run and the route's write the same code with one branch outside it.
export function ledgerUpdate({ rows, prev, repo, now } = {}) {
    prev = prev || {};
    rows = Array.isArray(rows) ? rows : [];
    const before = new Set((prev.releases || []).map((r) => r.tag));
    const added = rows.filter((r) => !before.has(r.tag)).map((r) => r.tag);
    const gone = [...before].filter((t) => !rows.some((r) => r.tag === t));
    const out = Object.assign({}, prev, {
        refreshedAt: (now || new Date()).toISOString(),
        source: `GET /repos/${repo}/releases (per_page=100)`,
        releases: rows,
    });
    return { out, added, gone, count: rows.length };
}

if (RUN) {
const rows = rowsFrom(all);
const { out, added, gone, count } = ledgerUpdate({ rows, prev: readLedger() || {}, repo: REPO });

console.log("[refreshReleases] " + count + " published releases on " + REPO +
            (added.length ? "; NEW: " + added.join(", ") : "; nothing new") +
            (gone.length ? "; VANISHED (deleted upstream?): " + gone.join(", ") : ""));

if (!write) { console.log("[refreshReleases] dry run -- pass --write to update " + LEDGER); process.exit(0); }
fs.writeFileSync(LEDGER, JSON.stringify(out, null, 2) + "\n");
console.log("[refreshReleases] wrote " + LEDGER);
}
