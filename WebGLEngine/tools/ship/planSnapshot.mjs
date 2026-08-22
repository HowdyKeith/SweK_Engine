// WebGLEngine/tools/ship/planSnapshot.mjs — v3286
// ---------------------------------------------------------------------------------------------------------------
// A PLAN SNAPSHOT, WRITTEN THROUGH THE BOOT SIDECAR CONTRACT — and the two rounds fitting together is not a
// coincidence, it is the point of having a contract at all.
//
// gateSelection needs the import graph and the timings file, both of which live on disk and neither of which a
// browser can build. So the front door does not compute a plan: it READS ONE, with the same three states the
// sidecar defines (no snapshot / stale / fresh) and the same rule that an input newer than the report makes it
// stale. A page that silently showed last week's plan for today's tree would be the empty-radar failure wearing
// a schedule, which this round has already caught once.
//
// AND THE SNAPSHOT CARRIES MEASUREMENTS, NOT VERDICTS: which gates a budget selects and what they cost. Whether
// that plan is ADEQUATE is adjudicateSelection's business, on a machine that can seed a break and look for the
// gate that catches it. The producer cannot grade itself, which makeReport enforces by refusing verdict keys.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { selectGates } from "./gateSelection.mjs";
import { makeReport } from "../../ai-bridge/bootSidecar.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SNAPSHOT_PATH = path.join(HERE, "gate-plan-snapshot.json");
export const KIND = "swek-gate-plan";

/** Budgets a reader is likely to want. Small enough to be honest, spread enough to show the shape. */
export const BUDGETS_S = [20, 60, 180, 600];

export function produce({ changed = [], budgets = BUDGETS_S, producedBy = "node/planSnapshot.mjs" } = {}) {
    const timings = path.join(HERE, "gate-timings.json");
    let ledger = null;
    try { ledger = JSON.parse(fs.readFileSync(path.join(HERE, "..", "roundhouse", "perf-ledger.json"), "utf8")); } catch {}
    const observations = budgets.map((secs) => {
        const p = selectGates({ changed, budgetMs: secs * 1000, ledger });
        return {
            budgetSeconds: secs,
            selected: p.selected.length,
            total: p.total,
            spentMs: Math.round(p.spentMs),
            reachable: p.reachable.length,
            directlyTests: (p.directlyTests || []).length,
            // NAMED, because it is the only omission that can hide a break the change caused
            missedReachable: p.missedReachable.length,
            guessedCost: p.guessedCost.length,
            firstTen: p.selected.slice(0, 10),
            missedReachableNames: p.missedReachable.slice(0, 8),
        };
    });
    return makeReport({ kind: KIND, producedBy, inputs: { timings }, observations });
}

export function write({ changed = [], snapshotPath = SNAPSHOT_PATH, producedBy } = {}) {
    const rep = produce({ changed, producedBy });
    rep.changed = changed;                      // what the plan was FOR; a plan without its question is unreadable
    const tmp = snapshotPath + ".part";
    fs.writeFileSync(tmp, JSON.stringify(rep, null, 2) + "\n");
    fs.renameSync(tmp, snapshotPath);
    return { ok: true, path: snapshotPath, budgets: rep.observations.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const changed = process.argv.slice(2).filter((a) => !a.startsWith("--"));
    const r = write({ changed, producedBy: "cli/planSnapshot" });
    console.log("[planSnapshot] wrote " + r.budgets + " budgets to " + r.path +
                (changed.length ? " for " + changed.join(", ") : " (no change set: cheapest-first over the whole suite)"));
}
