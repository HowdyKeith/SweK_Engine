// tools/roundhouse/meshExchange.mjs
//
// v2968 -- REACH OUT TO ANOTHER HUB.  node tools/roundhouse/meshExchange.mjs https://other-hub-url
//
// Sends this hub's mergeable ledgers, receives theirs, merges the reply locally. One round trip and both hubs
// hold the union. Jobs are excluded by construction -- mergeAll refuses them (leases are exclusive state).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(here, f), "utf8")); } catch { return d; } };
const wr = (f, v) => fs.writeFileSync(path.join(here, f), JSON.stringify(v, null, 2) + "\n");

const target = (process.argv[2] || "").replace(/\/+$/, "");
if (!target) { console.error("usage: meshExchange.mjs https://other-hub"); process.exit(2); }

const mine = {
    roster: rd("lighthouse-roster.json", { peers: {} }),
    devices: rd("device-ledger.json", { devices: {} }),
    candidates: rd("tunnel-candidates.json", { urls: {} }),
};

const res = await fetch(target + "/mesh/exchange", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mine), signal: AbortSignal.timeout(60000),
}).catch((e) => ({ ok: false, _err: String(e.message || e) }));

if (!res || !res.ok) { console.error("exchange failed: " + (res && res._err ? res._err : "HTTP " + (res && res.status))); process.exit(1); }
const j = await res.json();
if (!j.ok) { console.error("remote refused: " + j.error); process.exit(1); }

// merge THEIR reply into ours, re-grading their device verdicts here too
const M = await import("./meshMerge.mjs");
const { gradeMagmapReport } = await import("./magmapReport.mjs");
const merged = M.mergeAll(mine, { roster: j.roster, devices: j.devices, candidates: j.candidates });
const re = M.regradeMerged(merged.devices, gradeMagmapReport);
wr("lighthouse-roster.json", merged.roster);
wr("device-ledger.json", re.ledger);
wr("tunnel-candidates.json", merged.candidates);

console.log(`exchanged with ${target}`);
console.log(`  they gained  ${JSON.stringify(j.gained)}`);
console.log(`  we gained    ${JSON.stringify(merged.gained)}`);
console.log(`  refused      ${j.refused.join("; ")}`);
if (re.disagreements.length) {
    console.log(`  !! ${re.disagreements.length} verdict disagreement(s) -- same numbers, different conclusions:`);
    for (const d of re.disagreements.slice(0, 5)) console.log(`     ${d.family} ${d.device.slice(0, 8)} they=${d.theirs} we=${d.mine}`);
    console.log("     (usually means one hub is running an older grader)");
} else { console.log("  verdicts agree on every shared device"); }
