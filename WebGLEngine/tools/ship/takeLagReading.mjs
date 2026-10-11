// WebGLEngine/tools/ship/takeLagReading.mjs -- v4833
//
// THE COMMAND for tools/ship/sysLagReading.mjs (the library the gate holds): wait for the engine and for its uptime, take the reading, save it whole, print the block to paste back.
//
//     node tools\ship\takeLagReading.mjs [port]                       default port 8787; waits for 300 s of engine uptime
//     node tools\ship\takeLagReading.mjs 8787 --min-uptime-s 600 --out C:\temp\lag.json
//
// *** NO EXPORTS ON PURPOSE, THE WAY tools/ship/lagBlameWatch.mjs HAS NONE: this is a command-line entry point and not a module. Everything with an export is in the library, which this imports -- so the library has a
// caller that is not a gate, and the orphan census (graveyard, referenceKind) counts neither file as debt. Its door is the DOS command, and it is declared owed: it needs the rig's engine up for minutes
// (tools/ship/doorKinds.mjs, genuinelyOwed). ***
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { takeReading, summaryLines, DEFAULT_PORT, DEFAULT_MIN_UPTIME_S } from "./sysLagReading.mjs";

const argv = process.argv.slice(2), opts = { port: DEFAULT_PORT, minUptimeS: DEFAULT_MIN_UPTIME_S, out: null };
try {
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (/^\d+$/.test(a)) opts.port = Number(a);
        else if (a === "--min-uptime-s" || a === "--out") { const v = argv[++i]; if (v == null) throw new Error(a + " needs a value"); if (a === "--out") opts.out = v; else { opts.minUptimeS = Number(v); if (!Number.isFinite(opts.minUptimeS) || opts.minUptimeS < 0) throw new Error("--min-uptime-s needs a number, got " + JSON.stringify(v)); } }
        else throw new Error(`unknown argument ${JSON.stringify(a)} (usage: takeLagReading.mjs [port] [--min-uptime-s N] [--out file])`);
    }
} catch (e) { console.error("takeLagReading: " + e.message); process.exit(2); }
const r = await takeReading({ port: opts.port, minUptimeS: opts.minUptimeS, log: (m) => console.log(m) });
if (r.error) { console.error("takeLagReading: " + r.error); process.exit(1); }
const file = opts.out || path.join(os.tmpdir(), `swek-lag-reading-${r.reading.at.replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(file, JSON.stringify(r.reading, null, 1));
console.log("");
for (const l of summaryLines(r.analysis, { port: opts.port })) console.log(l);
console.log(`\n  the whole reading is saved at ${file} -- paste the block above, or send that file.`);
