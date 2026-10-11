// tools/rig/run-trader-github.mjs -- v4776: the trader graph's GitHub layer, as a runnable job.
//   node tools/rig/run-trader-github.mjs
//
// WHICH MACHINE: ONE THAT REACHES api.github.com. The sandbox rounds are built in cannot -- every GitHub API path
// is refused by the runner in front of it, which is why world/traderGraph.mjs builds the graph from git history
// and world/traderGraphGithub.mjs exists at all. On Keith's rig GitHub answers, and the record it writes
// (world/trader-graph-github.json) is what tools/ship/traderGraph-selfcheck.mjs grades from then on.
//
// WHY A JOB AND NOT A GATE: a gate must never need a network -- one that does silently passes on every box
// without it. doorKinds found this module with a CLI and no door at the v4776 merge; the command was only ever
// in prose (traderGraph-selfcheck's own FAIL line tells the reader to type it). A Run button is the door.
//
// IT DRIVES THE MODULE AND REIMPLEMENTS NOTHING: it spawns `world/traderGraphGithub.mjs --fetch --write` and
// passes its output through. Unauthenticated, GitHub allows 60 requests an hour and a full pass needs more; the
// module records what it reached and resumes, so a rate-limited run is progress, not a failure. GITHUB_TOKEN in
// the environment raises the limit to 5,000 and is used if set; it is never written anywhere.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

console.log("[trader-github-job] fetching the repository layer (fork parents, contributors by login) from api.github.com.");
console.log(`[trader-github-job] ${process.env.GITHUB_TOKEN ? "GITHUB_TOKEN is set: 5,000 requests an hour." : "no GITHUB_TOKEN: 60 requests an hour, so a full pass may take more than one run -- each run resumes."}`);
console.log("");

const child = spawn(process.execPath, ["world/traderGraphGithub.mjs", "--fetch", "--write"], { cwd: ENG, stdio: "inherit" });
child.on("exit", (code) => {
    console.log("");
    console.log("[trader-github-job] then run tools/ship/traderGraph-selfcheck.mjs, and commit world/trader-graph-github.json");
    console.log("[trader-github-job] if it changed -- the record is what the sandbox rounds grade against.");
    process.exit(code == null ? 1 : code);
});
