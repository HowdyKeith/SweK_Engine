// tools/ledger/ledger.mjs
//
// THE FINGERPRINT GROWS A MEMORY.
//
// The fingerprint (tools/fingerprint) computes a hash per subsystem, compared live. This ledger PERSISTS those
// results, keyed by CONTENT, so a new version or another machine can be compared against everything recorded before
// -- across versions and across the fleet -- and so a fresh install starts already knowing the fleet's baseline.
//
// The design turns on two rules:
//
//  1. CONTENT-ADDRESSED KEYS. A result is keyed by a hash of (subsystem name + its SOURCE + the input scenario's
//     source), NOT by name alone. So if the code is unchanged, the key is unchanged and the result MUST still match
//     (a regression check); if the code changed, the key changes and it is simply a NEW entry -- nothing stale can
//     ever collide. This is what lets the ledger tell an INTENDED change (new key) from a REGRESSION (same key, new
//     result). Cache-invalidation for free.
//
//  2. COMPARE, NEVER SKIP. A CHECK NOT IN THE GATE IS NOT BEING RUN. The ledger is an oracle you consult AFTER
//     running locally -- it classifies your fresh results as MATCH / REGRESSION / NEW against the fleet's memory. It
//     never produces a result you did not compute, and it never lets a green come from "someone else ran it."
//
// Provenance (machine, arch, version) is recorded per result, so the ledger shows AGREEMENT across the fleet, not a
// single trusted number.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import os from "node:os";
import { computeFingerprint } from "../fingerprint/fingerprint.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");                 // WebGLEngine root
const LEDGER_PATH = path.join(HERE, "LEDGER.json");

// The source files that DEFINE each subsystem's result. A change to any of these SHOULD change the key.
import { SUBSYSTEM_SOURCES } from "./subsystemSources.mjs";
export { SUBSYSTEM_SOURCES };
const SCENARIO_SOURCE = "tools/fingerprint/fingerprint.mjs";   // defines the inputs; changing it re-keys every subsystem

const sha = (s) => createHash("sha256").update(s).digest("hex");
const fileHash = (rel) => { try { return sha(fs.readFileSync(path.join(ROOT, rel))); } catch { return "MISSING:" + rel; } };

// PURE key function -- the gate drives this directly with injected content.
export function keyFromContent(name, srcContent, scenarioContent) {
    return sha(name + "|" + sha(srcContent) + "|" + sha(scenarioContent)).slice(0, 32);
}
export function keyFor(name) {
    const srcContent = (SUBSYSTEM_SOURCES[name] || []).map(fileHash).join(",");
    return keyFromContent(name, srcContent, fileHash(SCENARIO_SOURCE));
}

export function emptyLedger() { return { version: 1, entries: {} }; }

// Merge one observation into a ledger. entry: { key, name, resultHash, machine, arch, version }
export function record(ledger, entry) {
    const e = ledger.entries[entry.key] || (ledger.entries[entry.key] = { name: entry.name, results: {} });
    const prov = e.results[entry.resultHash] || (e.results[entry.resultHash] = []);
    if (!prov.some((p) => p.machine === entry.machine && p.arch === entry.arch && p.version === entry.version)) {
        prov.push({ machine: entry.machine, arch: entry.arch, version: entry.version });
    }
    return ledger;
}

// COMPARE, NEVER SKIP. fresh: [{ key, name, resultHash }] -- results the caller COMPUTED locally, not fabricated.
// Returns a verdict for every fresh result: MATCH (key known, this hash recorded), REGRESSION (key known, DIFFERENT
// hash -- same source, different result), or NEW (key unknown -- source changed, or first ever seen).
export function compareToLedger(ledger, fresh) {
    const verdicts = fresh.map((f) => {
        const e = ledger.entries[f.key];
        if (!e) return { name: f.name, key: f.key, status: "NEW" };
        if (e.results[f.resultHash]) return { name: f.name, key: f.key, status: "MATCH" };
        return { name: f.name, key: f.key, status: "REGRESSION", knownResults: Object.keys(e.results) };
    });
    return {
        verdicts,
        match: verdicts.filter((v) => v.status === "MATCH").length,
        regression: verdicts.filter((v) => v.status === "REGRESSION").length,
        neu: verdicts.filter((v) => v.status === "NEW").length,
    };
}

// Merge two ledgers (fleet sync). Returns { merged, divergences } where a divergence is a key that, after merge,
// carries more than one result hash -- machines that disagree on the same source.
export function mergeLedgers(a, b) {
    const merged = emptyLedger();
    for (const src of [a, b]) for (const [key, e] of Object.entries(src.entries || {})) {
        for (const [rh, provs] of Object.entries(e.results)) for (const p of provs) {
            record(merged, { key, name: e.name, resultHash: rh, machine: p.machine, arch: p.arch, version: p.version });
        }
    }
    const divergences = Object.entries(merged.entries)
        .filter(([, e]) => Object.keys(e.results).length > 1)
        .map(([key, e]) => ({ key, name: e.name, results: Object.fromEntries(Object.entries(e.results).map(([rh, ps]) => [rh, ps])) }));
    return { merged, divergences };
}

// This machine's fresh results: run the fingerprint NOW, key each subsystem by content. (Computes -- never cached.)
export function currentResults() {
    return computeFingerprint().subsystems.map((s) => ({ key: keyFor(s.name), name: s.name, resultHash: s.hash }));
}

function thisMachine() {
    let version = "unknown";
    try { version = (fs.readFileSync(path.join(ROOT, "main.js"), "utf8").match(/ENGINE_VERSION = "(v\d+)"/) || [])[1] || "unknown"; } catch { }
    return { machine: os.hostname(), arch: process.arch, version };
}
export function loadLedger() { try { return JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8")); } catch { return emptyLedger(); } }
export function saveLedger(ledger) { fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + "\n"); }

// CLI
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const cmd = process.argv[2] || "check";
    const me = thisMachine();
    const fresh = currentResults();
    if (cmd === "record") {
        const ledger = loadLedger();
        for (const f of fresh) record(ledger, { ...f, ...me });
        saveLedger(ledger);
        console.log("recorded " + fresh.length + " subsystem results for " + me.machine + " (" + me.arch + ", " + me.version + ")");
    } else {
        const r = compareToLedger(loadLedger(), fresh);
        for (const v of r.verdicts) console.log("  " + v.status.padEnd(11) + v.name);
        console.log("\n  " + r.match + " match, " + r.regression + " REGRESSION, " + r.neu + " new  (" + me.arch + ", " + me.version + ")");
        if (r.regression) console.log("  REGRESSION = same source, different result: a bug or a cross-arch divergence. Investigate before shipping.");
        process.exit(r.regression ? 1 : 0);
    }
}
