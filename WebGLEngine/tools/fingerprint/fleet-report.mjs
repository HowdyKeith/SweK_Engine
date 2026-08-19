// tools/fingerprint/fleet-report.mjs
//
// v2892 -- the cross-machine claim as ONE COMMAND instead of eyeballing two markdown tables.
//
//   node tools/fingerprint/fleet-report.mjs --emit galaxina.json
//       Compute this machine's full peer report (subsystem hashes + measured physics + corroborations) and write
//       it out. Run this on each machine; move the files however you like (the LAN, a share, a paste).
//
//   node tools/fingerprint/fleet-report.mjs --compare galaxina.json atlas.json mseries.json
//       N-way comparison. Exits 0 iff the fleet agrees: same bits where bits were promised (portable
//       observables, subsystem hashes) and same physics within tolerance where they were not.
//
//   node tools/fingerprint/fleet-report.mjs --compare *.json --record
//       ...and fold every peer's results into tools/ledger/LEDGER.json with provenance, so the fleet's memory
//       grows on each join rather than living in whoever ran the comparison.
//
// THE POINT OF --record: the ledger already knew how to hold subsystem hashes from many machines and classify
// MATCH / REGRESSION / NEW. What it never held was the PHYSICS. After this, a peer joining contributes its
// measured observables too, and a later machine that disagrees about a portable quantity shows up as a second
// result hash under one key -- which mergeLedgers already reports as a divergence, with the machines named.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { peerReport, compareReports, reportLines, ledgerEntriesFrom } from "./peerReport.mjs";
import { loadLedger, saveLedger, record } from "../ledger/ledger.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

function engineVersion() {
    try { return (fs.readFileSync(path.join(ROOT, "main.js"), "utf8").match(/ENGINE_VERSION = "(v\d+)"/) || [])[1] || "unknown"; }
    catch { return "unknown"; }
}

export async function emit(outPath) {
    const rep = await peerReport({ version: engineVersion(), arch: process.arch, host: os.hostname() });
    const json = JSON.stringify(rep, null, 2) + "\n";
    if (outPath) fs.writeFileSync(outPath, json);
    return { rep, json };
}

export function compareFiles(paths, { recordToLedger = false, log = console.log } = {}) {
    const reports = paths.map((p) => JSON.parse(fs.readFileSync(p, "utf8")));
    for (const r of reports) {
        if (r.kind !== "peer-report") throw new Error("not a peer report: " + r.host + " (regenerate with --emit)");
    }
    const cmp = compareReports(reports);
    reportLines(cmp).forEach((line) => log(line));   // NOT forEach(log): console.log would also print the index and the whole array

    if (recordToLedger) {
        const ledger = loadLedger();
        let n = 0;
        for (const rep of reports) for (const e of ledgerEntriesFrom(rep)) { record(ledger, e); n++; }
        saveLedger(ledger);
        log(`  recorded ${n} observations from ${reports.length} peers into the ledger (provenance kept per machine).`);
    }
    return cmp;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
    const argv = process.argv.slice(2);
    const emitIdx = argv.indexOf("--emit");
    const cmpIdx = argv.indexOf("--compare");
    if (emitIdx >= 0) {
        const out = argv[emitIdx + 1] || null;
        const { rep, json } = await emit(out);
        if (out) console.log(`peer report written to ${out} (${rep.attestation.count} subsystems, ${rep.observables.length} observables, master ${rep.attestation.master.slice(0, 16)})`);
        else process.stdout.write(json);
        process.exit(0);
    } else if (cmpIdx >= 0) {
        const files = argv.slice(cmpIdx + 1).filter((a) => !a.startsWith("--"));
        if (files.length < 2) { console.error("--compare needs at least two peer report files"); process.exit(2); }
        const cmp = compareFiles(files, { recordToLedger: argv.includes("--record") });
        process.exit(cmp.summary.fleetAgrees ? 0 : 1);
    } else {
        console.log("usage:");
        console.log("  node tools/fingerprint/fleet-report.mjs --emit <out.json>");
        console.log("  node tools/fingerprint/fleet-report.mjs --compare <a.json> <b.json> [more...] [--record]");
        process.exit(2);
    }
}
