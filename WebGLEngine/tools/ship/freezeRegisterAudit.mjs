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
import { RED_AT_V4279, RED_AT_V4408_GATES, RED_AT_V4424_GATES, RED_AT_V4476_GATES } from "./redCensus.mjs";

// *** v4400 -- THE VERSION WAS A STRING LITERAL AND THE AUDIT LIED ABOUT ITS OWN AGE FOR TWENTY ROUNDS. ***
// This tool wrote `at: "v4380"` as text, so every re-freeze since has produced a file claiming to have been
// taken at v4380 -- including one taken at v4399 while measuring exactly this species of defect. THE CANONICAL
// SOURCE THE REGISTER SHOULD RENDER FROM COULD NOT SAY WHEN IT WAS TAKEN, because the round that wrote the
// freezer typed the number instead of reading it. It is read from main.js now, which is where the tree keeps it.
function ENGINE_VERSION() {
    const src = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
    const m = src.match(/const ENGINE_VERSION = "(v\d+)"/);
    if (!m) throw new Error("freezeRegisterAudit: main.js has no ENGINE_VERSION to read");
    return m[1];
}

import { derivedCap } from "./auditCap.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// v4490 -- *** THE DEFAULT IS DERIVED FROM WHAT THE GATES TAKE, NOT TYPED. *** It read 120000 from v4471,
// when this file's own comment below recorded runtimes of "75 s to 151 s" -- so the default was already
// BELOW the population it caps on the day the override was added, and it stayed there for nineteen rounds
// while the tail grew to 441 s. Two of the thirty rows were being recorded as bounds rather than verdicts,
// and registerRender then showed the register "past the capture cap" where the gate's own sentence belongs.
// See tools/ship/auditCap.mjs: twice the slowest measured runtime, rounded up to the next minute.
const CAP_MS = Number(process.env.SWEK_AUDIT_CAP_MS || derivedCap());

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
// v4430 -- BOTH registers, because both derive their line from this audit now. RED_AT_V4408 held the last
// typed `fails:` literal in the file and there was no run behind it; a second list with the same defect is the
// second-copy shape, and the fix is one audit rather than one exemption.
// v4471 -- THREE registers, and the third is why this line is worth a comment rather than a merge. v4424
// filed three more reds out of UNCONFIRMED_SLOW and the audit was not taught about them, so registerDrift's
// "the admitted set may only SHRINK" went red: their lines had to be ADMITTED as unverified because nothing
// ran them. THE FIX IS TO RUN THEM, not to admit them -- and their runtimes (75 s to 151 s) are why
// SWEK_AUDIT_CAP_MS exists. A register that derives its readings needs every list it derives from in here.
for (const e of [...RED_AT_V4279, ...RED_AT_V4408_GATES.map((gate) => ({ gate })),
                 ...RED_AT_V4424_GATES.map((gate) => ({ gate })),
                 ...RED_AT_V4476_GATES.map((gate) => ({ gate }))]) {
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
export const REGISTER_AUDIT = Object.freeze(${JSON.stringify({ at: ENGINE_VERSION(), capMs: CAP_MS, rows }, null, 1)});
`;
fs.writeFileSync(path.join(ENG, "tools/ship/register-audit.mjs"), body);
console.log(`\nfrozen: ${rows.length} rows, ${rows.filter((r) => r.exit === 0).length} now green, ${rows.filter((r) => r.onStderr).length} printing FAIL to stderr`);
