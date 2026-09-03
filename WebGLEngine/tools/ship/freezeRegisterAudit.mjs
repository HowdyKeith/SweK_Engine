// Re-freeze tools/ship/register-audit.mjs: what every gate in the red register ACTUALLY says today.
//
// The register records, for each standing red, the line the gate failed on. Nothing has ever checked that the line
// is still the line -- and twice in this session a register entry turned out to describe a red that no longer
// existed while the real one went unread (vendoredLicences at v4371, rigJobs at v4379). This runs them all and
// writes down what each one says now, so tools/ship/registerDrift-selfcheck.mjs can hold the register to it.
//
// Run it when the register changes or a red is repaired. Slow by nature -- it runs every red in the census.
"use strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RED_AT_V4279 } from "./redCensus.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CAP_MS = Number(process.env.SWEK_AUDIT_CAP_MS || 120000);

/** Run one gate and read its verdict. BOTH STREAMS: one gate of 29 prints its FAIL line to stderr (v4380). */
const run = (rel) => new Promise((res) => {
    const t0 = Date.now();
    execFile("node", [rel], { cwd: ENG, timeout: CAP_MS, maxBuffer: 64 * 1024 * 1024 }, (err, out, errOut) => {
        const both = String(out || "") + "\n" + String(errOut || "");
        const fails = both.split("\n").filter((l) => /^\s{0,4}FAIL\s/.test(l)).map((l) => l.replace(/^\s*FAIL\s+/, "").trim());
        const onStderr = String(errOut || "").split("\n").some((l) => /^\s{0,4}FAIL\s/.test(l));
        res({ rel, ms: Date.now() - t0, exit: err ? (err.code == null ? "timeout" : err.code) : 0, fails, onStderr });
    });
});

const rows = [];
for (const e of RED_AT_V4279) {
    const r = await run(e.gate);
    rows.push({ gate: e.gate, exit: r.exit, ms: r.ms, first: r.fails[0] || "", all: r.fails, count: r.fails.length, onStderr: r.onStderr });
    console.log(String(r.exit).padStart(8), String(r.ms).padStart(7) + "ms", String(r.fails.length).padStart(2) + " fail(s)", r.onStderr ? "[stderr]" : "        ", e.gate);
}
const body = `"use strict";
/**
 * WHAT EVERY GATE IN THE RED REGISTER ACTUALLY SAYS (v4380), frozen so a fast gate can hold the register to it.
 *
 * The register in redCensus.mjs records a failing LINE for each standing red. Nothing checked that the line was
 * still the line, and twice in one session an entry turned out to describe a red that no longer existed while the
 * real one went unread. This is the observed side: run at the version below, one row per register entry, carrying
 * the exit code, EVERY failing line (a gate with several is common, and asking only about the first reports drift
 * where there is none), and whether the gate printed them to STDERR -- which one of them does, invisibly to anything
 * reading stdout. Rewritten by tools/ship/freezeRegisterAudit.mjs.
 */
export const REGISTER_AUDIT = Object.freeze(${JSON.stringify({ at: "v4380", capMs: CAP_MS, rows }, null, 1)});
`;
fs.writeFileSync(path.join(ENG, "tools/ship/register-audit.mjs"), body);
console.log(`\nfrozen: ${rows.length} rows, ${rows.filter((r) => r.exit === 0).length} now green, ${rows.filter((r) => r.onStderr).length} printing FAIL to stderr`);
