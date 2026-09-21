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
//
// *** v4641 -- --from: THE LEDGER WENT ELEVEN DAYS AND THREE RELEASES STALE BECAUSE THIS PROCESS CANNOT
// REACH THE API, AND NOTHING SAID SO. *** The 401 below is not a bug in this file; it is a property of the
// sandbox, recorded in rowsFrom's own comment since v4449. What was missing is what happens NEXT. A refresh
// that cannot run leaves releases.json frozen at whatever it last saw -- v4485, read 2026-09-06 -- while
// v4486, v4487 and v4622 were published. And releaseLedger.mjs computes `supersededBy = max(floor, latest)`,
// so a stale `latest` does not merely under-report: it INFLATES THE OWED LIST, because every version above
// the stale latest is counted as debt. The owed list read 9 of 3 allowed and the true answer was ZERO. A
// ratchet built to force a publish was refusing the ship because it could not see the publish that happened.
//
//   node tools/ship/refreshReleases.mjs --from <file> --via "<how these bytes were obtained>" [--write]
//
// --from takes the releases API's own JSON, fetched by a route this process does not have, and runs it
// through the SAME rowsFrom() and ledgerUpdate() the fetch path uses -- which is exactly why those two were
// made pure at v4449. It is NOT a way to hand-write a ledger: --via is REQUIRED and is recorded verbatim in
// `source`, so the document says how its bytes were obtained rather than claiming a GET this process did not
// perform. A reader who distrusts the route can re-run the real fetch anywhere the API is reachable and
// diff. The refusal to write without --via is driven by the gate, not merely stated here.
"use strict";
import fs from "node:fs";
import { LEDGER, readLedger } from "./releaseLedger.mjs";
import { pathToFileURL } from "node:url";

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

const RUN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1] || "").href;
if (!RUN) { /* imported for rowsFrom() -- no network, no exit */ }

const REPO = process.env.SWEK_ENGINE_REPO || "HowdyKeith/SweK_Engine";
const write = process.argv.includes("--write");
const flag = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const fromFile = flag("--from");
const via = flag("--via");

const tok = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const headers = { "Accept": "application/vnd.github+json", "User-Agent": "swek-release-ledger" };
if (tok) headers.Authorization = "Bearer " + tok;

let all = [];
if (RUN && fromFile) {
    // *** --via IS NOT OPTIONAL, AND THE REFUSAL IS THE POINT. *** The ledger's `source` field is the only
    // thing a later reader has to judge the document by. Writing one from a payload this process did not
    // fetch, while `source` still reads like a GET this process performed, would make the provenance a lie --
    // and a ledger nobody can date or attribute is the exact failure this whole file exists to prevent
    // (v4400: "the audit lied about its own age for twenty rounds" is the same shape one directory over).
    if (!via) {
        console.error("[refreshReleases] --from requires --via \"<how these bytes were obtained>\": it is recorded " +
                      "verbatim in the ledger's `source`, because a document that cannot say where it came from " +
                      "is not evidence. Nothing written.");
        process.exit(2);
    }
    let raw;
    try { raw = JSON.parse(fs.readFileSync(fromFile, "utf8")); }
    catch (e) { console.error("[refreshReleases] --from " + fromFile + ": " + String(e.message).slice(0, 160)); process.exit(2); }
    if (!Array.isArray(raw)) {
        console.error("[refreshReleases] --from expects the releases API's own JSON ARRAY, got " +
                      (raw && typeof raw === "object" ? "an object with keys " + Object.keys(raw).slice(0, 6).join(",") : typeof raw) +
                      ". Nothing written.");
        process.exit(2);
    }
    all = raw;
    console.log("[refreshReleases] --from " + fromFile + ": " + all.length + " row(s), no fetch attempted; via " + via);
} else if (RUN) for (let page = 1; page <= 10; page++) {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`, { headers });
    if (!r.ok) {
        console.error("[refreshReleases] HTTP " + r.status + " from the releases API -- ledger NOT written." +
                      (r.status === 401 || r.status === 403 || r.status === 407
                        ? " This sandbox's proxy answers api.github.com that way; the ledger then goes stale" +
                          " SILENTLY, and a stale `latest` INFLATES the owed list because releaseLedger.mjs" +
                          " reads supersededBy = max(floor, latest). Fetch the list by a route that works and" +
                          " feed it back: --from <file> --via \"<route>\"."
                        : ""));
        process.exit(1);
    }
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
export function ledgerUpdate({ rows, prev, repo, now, via = null } = {}) {
    prev = prev || {};
    rows = Array.isArray(rows) ? rows : [];
    const before = new Set((prev.releases || []).map((r) => r.tag));
    const added = rows.filter((r) => !before.has(r.tag)).map((r) => r.tag);
    const gone = [...before].filter((t) => !rows.some((r) => r.tag === t));
    // *** v4641 -- AND IT RAISES THE RATCHET, WHICH releases.json HAS CLAIMED IT DID SINCE v4461 AND IT DID
    // NOT. *** That record's own note reads: "These two numbers may only RISE, and refreshReleases raises
    // them when it writes." This function assigned `releases` and left `ratchet` untouched from `prev`, so a
    // refresh that added three releases left the floor three behind -- a guard against "a release the fleet
    // was already running must not vanish" that had gone slack by exactly the amount the ledger had grown.
    // A claim in a record about what a tool does, which the tool does not do, is this tree's most-repeated
    // defect; here it was in the record that polices shipping. MONOTONIC BY CONSTRUCTION: Math.max against
    // what is already there, so a refresh can only tighten it, and a ledger that somehow came back short
    // still fails the gate's floor rather than quietly lowering it.
    const latestN = rows.reduce((m, r) => Math.max(m, +String(r.tag).slice(1) || 0), 0);
    const prevRat = prev.ratchet || {};
    const ratchet = Object.assign({}, prevRat, {
        minReleases: Math.max(prevRat.minReleases || 0, rows.length),
        minLatest: Math.max(prevRat.minLatest || 0, latestN),
    });
    const out = Object.assign({}, prev, {
        generatedFrom: "tools/ship/refreshReleases.mjs",
        refreshedAt: (now || new Date()).toISOString(),
        source: `GET /repos/${repo}/releases (per_page=100)` + (via ? `, ingested via ${via}` : ""),
        releases: rows,
        ratchet,
    });
    return { out, added, gone, count: rows.length,
             raised: { minReleases: (ratchet.minReleases !== (prevRat.minReleases || 0)),
                       minLatest: (ratchet.minLatest !== (prevRat.minLatest || 0)) } };
}

if (RUN) {
const rows = rowsFrom(all);
const prevLed = readLedger() || {};
const { out, added, gone, count, raised } = ledgerUpdate({ rows, prev: prevLed, repo: REPO, via });

console.log("[refreshReleases] " + count + " published releases on " + REPO +
            (added.length ? "; NEW: " + added.join(", ") : "; nothing new") +
            (gone.length ? "; VANISHED (deleted upstream?): " + gone.join(", ") : ""));
if (raised.minReleases || raised.minLatest)
    console.log("[refreshReleases] ratchet RAISED: minReleases " + ((prevLed.ratchet || {}).minReleases || 0) +
                " -> " + out.ratchet.minReleases + ", minLatest " + ((prevLed.ratchet || {}).minLatest || 0) +
                " -> " + out.ratchet.minLatest + " (monotonic: a refresh can only tighten it)");

// *** FOUND ON THE RIG JUST AFTER v4648 -- NO process.exit(0) HERE, IT ABORTS ON WINDOWS. ***
// (Unstamped on purpose: this is not yet in a shipped version, and a stamp naming one that does not
// exist is the same claim-about-a-moment this tree keeps having to unpick.)
// The dry run used to exit(0) on this line. fetch()'s sockets are still open at that point, and tearing
// the libuv async handle down mid-close trips
//
//     Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 94
//
// on Keith's rig -- AFTER the output, so the work was done and the process aborted anyway. The --write
// path below never called exit() and exited cleanly, which is the asymmetry that named the cause.
//
// *** IT IS A v4648 BUG ONLY IN THE SENSE THAT v4648 MADE IT REACHABLE. *** This whole CLI was dead on
// Windows until the main-module comparison was repaired, so the first Windows run of the dry path is also
// the first sighting. A fix that opens a door finds what was behind it.
//
// Nothing needs an explicit exit: the branch just does not write, and Node drains and leaves 0.
if (write) {
    fs.writeFileSync(LEDGER, JSON.stringify(out, null, 2) + "\n");
    console.log("[refreshReleases] wrote " + LEDGER);
} else {
    console.log("[refreshReleases] dry run -- pass --write to update " + LEDGER);
}
}
