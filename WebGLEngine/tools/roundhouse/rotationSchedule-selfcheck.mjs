// tools/roundhouse/rotationSchedule-selfcheck.mjs
//
// v2966 -- TIMED ROTATION, AND A DUPLICATE THIS ROUND FOUND IN ITS OWN PREVIOUS WORK.
//
// THE DUPLICATE. ai-bridge/tunnelRegistry.js already existed and already answered "which tunnel URLs can we
// reach" -- its aliveUrls() is commented "tunnel URLs usable as PEER targets" and feeds the peer list in
// server.js. v2956 built tools/roundhouse/tunnelCandidates.mjs without checking, so the tree carried two stores
// for one question with OPPOSITE policies: the registry DELETES a learned URL after three strikes; the candidate
// list never deletes anything.
//
// It would have been comfortable to declare they serve different purposes. The comment and the consumer both say
// otherwise. The resolution follows the field evidence -- quick tunnels recover, so deleting destroys
// information while demoting costs one timeout -- so the registry keeps its job unchanged and the candidate list
// INGESTS from it, becoming a durable superset that survives the registry's pruning.

import { emptyCandidates, addCandidate, recordAttempt, orderedCandidates, ingestRegistry, survivingPruned } from "./tunnelCandidates.mjs";
import { prose } from "../ship/sourceScan.mjs";
import { rotationDue, onTunnelStarted } from "./tunnelRotator.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const bridge = fs.readFileSync(path.join(root, "ai-bridge", "fingerprintBridge.js"), "utf8");
const page = fs.readFileSync(path.join(root, "server.html"), "utf8");
const U = (n) => `https://${n}.trycloudflare.com`;

// ---- 1. THE TWO STORES ARE ONE FLOW NOW -----------------------------------------------------------------------------
{
    let reg = ingestRegistry(emptyCandidates(), [U("one"), U("two")]);
    ok("!! every URL the hub's registry knows becomes a durable candidate",
        orderedCandidates(reg).length === 2,
        "ingestRegistry folds tunnelRegistry.aliveUrls() in, so the peer-facing list is a superset of the hub's " +
        "live list rather than a competing second opinion");

    // the hub's 3-strike pruner later deletes 'two'
    const stillLive = [U("one")];
    ok("!! a URL the registry PRUNED survives here, and is still offered to peers",
        survivingPruned(reg, stillLive).includes(U("two")) && orderedCandidates(reg).includes(U("two")),
        "the registry deletes after three strikes; this list demotes instead. Under the observed behaviour -- " +
        "quick tunnels recover, sometimes in batches -- deleting destroys the candidate that is about to work, " +
        "and demoting costs one timeout. The divergence is surfaced by survivingPruned rather than hidden");

    ok("...and ingesting the same registry twice changes nothing",
        JSON.stringify(ingestRegistry(reg, stillLive)) === JSON.stringify(ingestRegistry(ingestRegistry(reg, stillLive), stillLive)),
        "idempotent, so the ingest can run on every poll without accumulating duplicates");
}

// ---- 2. ROTATION IS STILL ADDITIVE -------------------------------------------------------------------------------------
{
    let reg = onTunnelStarted(emptyCandidates(), U("old"), { at: "2026-07-25T00:00:00Z" }).registry;
    reg = recordAttempt(reg, U("old"), true, { at: "2026-07-25T00:01:00Z" });
    const after = onTunnelStarted(reg, U("new"), { at: "2026-07-25T04:00:00Z" });
    ok("!! a scheduled rotation ADDS the new URL and does not retire the old one",
        after.ordered.length === 2 && after.ordered[0] === U("old"),
        "the proven old URL stays, and stays FIRST. A peer already holding it is never cut off by a rotation, " +
        "and a brand-new tunnel that has not verified yet does not displace a working one");
}

// ---- 3. THE INTERVAL IS CLAMPED AT BOTH ENDS ----------------------------------------------------------------------------
{
    ok("!! the schedule clamps to 1-24 hours",
        /Math\.min\(24, Math\.max\(1, Number\(j\.everyHours\)/.test(bridge),
        "under an hour thrashes cloudflare and burns URLs faster than they can verify -- hostingBridge already " +
        "spends up to 18s verifying each one. Over a day is indistinguishable from off, and off should be said " +
        "with the switch, not by dragging a slider to its end");

    ok("enabled is a separate switch from the interval",
        /enabled: j\.enabled === undefined \? cur\.enabled : !!j\.enabled/.test(bridge),
        "so turning rotation off does not lose the operator's chosen interval");

    ok("the schedule file is read and written through one accessor",
        (bridge.match(/tunnel-schedule\.json/g) || []).length === 1 && /async function schedIO/.test(bridge),
        "two routes, one path string -- the same duplicated-path bug this round found in the registries, avoided " +
        "here by construction");
}

// ---- 4. THE SLIDER SAYS WHAT ROTATION DOES ------------------------------------------------------------------------------
{
    ok("!! the panel states that rotation is additive",
        /keeps serving peers that already hold it/.test(prose(page)),
        "an operator dragging a rotation slider will reasonably assume the old URL is being replaced. It is not, " +
        "and the panel says so -- otherwise someone would eventually 'tidy up' the old tunnel and cut off every " +
        "peer holding it");

    ok("the slider is bounded in the UI as well as the API",
        /id="rotEvery"[^>]*min="1"[^>]*max="24"/.test(page),
        "the clamp is enforced server-side regardless, but a slider that let you pick a value the server would " +
        "silently change is a control that lies about what it did");
}

console.log();
if (fails) { console.log("rotationSchedule-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("rotationSchedule-selfcheck: all checks pass");
