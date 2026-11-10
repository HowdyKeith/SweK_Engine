// WebGLEngine/tools/ship/takeRotorLeague.mjs -- UNNUMBERED (the library is brain/rotorLeague.mjs, the registration brain/ROTOR_LEAGUE_WIP.md, the page rotor-league.html, the gate brain/rotorLeague-selfcheck.mjs)
//   node tools/ship/takeRotorLeague.mjs [--task rotor|drone|both] [--set dev|held76] [--seeds N] [--margin x] [--write]
// Flies every pilot of the board (brain/rotorcraftBoard.mjs) on the same scenarios, ONCE each, and prints the league: the checks (a failure marks the readings NOT WEIGHED), then for ALL, STANDING and FAILURE the ratings, every pair's reading, the cycles and upsets, the stability and the sensitivity.
// --set dev is seeds 1 to 3 of each kind (a sanity run of the code, not a result); --set held76 is seeds 8301 to 8340 -- the registered read, flown ONCE; --write (held76 only, whole set, both tasks) writes every flight to brain/rotorLeagueHeld76.jsonl.
// --seeds N takes the first N seeds of each kind (with --write it is refused). --margin x moves the draw margin (default 0.01; with --write it is refused: the registered margin is the written one).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as RB from "../../brain/rotorcraftBoard.mjs";
import * as L from "../../brain/rotorLeague.mjs";
import { loadWeights } from "./takeRotorcraftBoard.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const OUT_FILE = "brain/rotorLeagueHeld76.jsonl";
const weightsOf = (which, load) => (which === "rotor" ? { fly: load("rotorFly") } : { fly: load("droneFly"), mlp: load("droneMlp"), mlpV2: load("droneMlpV2") });
const TITLE = Object.freeze({ rotor: "HELICOPTER (task rotor)", drone: "QUADROTOR (task drone)" });

export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync, load = io.load || ((k) => loadWeights(k)), sets = io.sets || L.LEAGUE_SETS;
    const o = { task: "both", set: "dev", seeds: null, margin: null, write: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--task") { o.task = argv[++i]; if (o.task !== "both" && !RB.TASKS[o.task]) { err(`takeRotorLeague: --task needs both or one of ${Object.keys(RB.TASKS).join(", ")}`); return 2; } }
        else if (a === "--set") { o.set = argv[++i]; if (!sets[o.set]) { err(`takeRotorLeague: --set needs one of ${Object.keys(sets).join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("takeRotorLeague: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else if (a === "--margin") { const v = Number(argv[++i]); if (!(v > 0) || !Number.isFinite(v)) { err("takeRotorLeague: --margin needs a positive number"); return 2; } o.margin = v; }
        else { err(`takeRotorLeague: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (o.write && o.set !== "held76") { err("takeRotorLeague: --write goes with --set held76 only"); return 2; }
    if (o.write && (o.seeds !== null || o.task !== "both" || o.margin !== null)) { err("takeRotorLeague: --write needs the whole set of both tasks at the registered margin (no --seeds, no --task, no --margin)"); return 2; }
    const whole = sets[o.set], count = o.seeds ? Math.min(whole.count, o.seeds) : whole.count, range = { from: whole.first, to: whole.first + count - 1 }, margin = o.margin === null ? L.DECISIVE : o.margin, which = o.task === "both" ? Object.keys(RB.TASKS) : [o.task], rows = [];
    for (const w of which) {
        const board = RB.rotorcraftBoard(w, weightsOf(w, load)), res = board.run(w, RB.ARM_IDS[w], range);
        out(`${TITLE[w]}: ${o.set.toUpperCase()} seeds ${range.from} to ${range.to} of each of ${RB.TASKS[w].T.KINDS.length} kinds, ${RB.ARM_IDS[w].length} pilots, margin ${margin} (${o.set === "dev" ? "a sanity run of the code, not a result" : "the registered read"})`);
        out(L.readLines(w, res.runs, margin).join("\n")); out("");
        for (const id of Object.keys(res.runs)) for (const r of res.runs[id]) rows.push({ set: o.set, task: w, arm: id, key: r.key, score: r.score, bad: r.bad });
    }
    if (o.write) { writeFile(path.join(ENG, OUT_FILE), rows.map((r) => JSON.stringify(r)).join("\n") + "\n"); out(`wrote ${rows.length} flights to ${OUT_FILE}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
