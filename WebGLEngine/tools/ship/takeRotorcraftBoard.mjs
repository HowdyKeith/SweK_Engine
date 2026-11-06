// WebGLEngine/tools/ship/takeRotorcraftBoard.mjs -- UNNUMBERED (the library is brain/rotorcraftBoard.mjs, the registration brain/ROTORCRAFT_BOARD_WIP.md, the gate brain/rotorcraftBoard-selfcheck.mjs)
//   node tools/ship/takeRotorcraftBoard.mjs [--task rotor|drone|both] [--set dev|held73] [--seeds N] [--write]
// Flies the helicopter's and the quadrotor's arms (the hand autopilot, the hand pilot written as the fruit-fly network, the trained networks, the zero-weight floor) on the same scenarios of each of the four kinds, prints the checks, the board's lines, the per-kind lines and the
// trained brains against each other. --set dev is seeds 1 to 3 (a sanity run of the code, not a result); --set held73 is seeds 8001 to 8012 -- the registered read, flown ONCE; --write (held73 only) writes every flight to brain/rotorcraftBoardHeld73.jsonl.
// --seeds N takes the first N seeds of the set (a shorter run for the gate; with --write it is refused, so a written file is always the whole set).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "../../brain/rotorcraftBoard.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const OUT_FILE = "brain/rotorcraftBoardHeld73.jsonl";
export const WEIGHT_COUNT = Object.freeze({ rotorFly: 1167, droneFly: 1167, droneMlp: 1860, droneMlpV2: 1860 });

/** The weights of one file (its .weights array); a file with the wrong number of weights is refused by name. */
export function loadWeights(key, readText = (f) => fs.readFileSync(path.join(ENG, f), "utf8")) {
    const file = R.WEIGHT_FILES[key]; if (!file) throw new Error(`takeRotorcraftBoard: no weight file named ${JSON.stringify(key)}`);
    const w = JSON.parse(readText(file)).weights;
    if (!Array.isArray(w) || w.length !== WEIGHT_COUNT[key]) throw new Error(`takeRotorcraftBoard: ${file} has ${Array.isArray(w) ? w.length : "no"} weights, ${WEIGHT_COUNT[key]} are required`);
    return w;
}
const weightsOf = (which, load) => (which === "rotor" ? { fly: load("rotorFly") } : { fly: load("droneFly"), mlp: load("droneMlp"), mlpV2: load("droneMlpV2") });
const TITLE = Object.freeze({ rotor: "HELICOPTER (task rotor)", drone: "QUADROTOR (task drone)" });

export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync, load = io.load || ((k) => loadWeights(k));
    const o = { task: "both", set: "dev", seeds: null, write: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--task") { o.task = argv[++i]; if (o.task !== "both" && !R.TASKS[o.task]) { err(`takeRotorcraftBoard: --task needs both or one of ${Object.keys(R.TASKS).join(", ")}`); return 2; } }
        else if (a === "--set") { o.set = argv[++i]; if (!(io.sets || R.RC_SETS)[o.set]) { err(`takeRotorcraftBoard: --set needs one of ${Object.keys(R.RC_SETS).join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("takeRotorcraftBoard: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else { err(`takeRotorcraftBoard: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (o.write && o.set !== "held73") { err("takeRotorcraftBoard: --write goes with --set held73 only"); return 2; }
    if (o.write && (o.seeds !== null || o.task !== "both")) { err("takeRotorcraftBoard: --write needs the whole set of both tasks (no --seeds, no --task)"); return 2; }
    const sets = io.sets || R.RC_SETS, whole = sets[o.set], range = o.seeds ? { from: whole.from, to: Math.min(whole.to, whole.from + o.seeds - 1) } : whole, which = o.task === "both" ? Object.keys(R.TASKS) : [o.task], rows = [];
    for (const w of which) {
        const board = R.rotorcraftBoard(w, weightsOf(w, load)), res = board.run(w, R.ARM_IDS[w], range);
        out(`${TITLE[w]}: ${o.set.toUpperCase()} seeds ${range.from} to ${range.to} of each of ${R.TASKS[w].T.KINDS.length} kinds (${o.set === "dev" ? "a sanity run of the code, not a result" : "the registered read"})`);
        out(R.readLines(board, res).join("\n")); out("");
        for (const id of Object.keys(res.runs)) for (const r of res.runs[id]) rows.push({ set: o.set, task: w, arm: id, key: r.key, score: r.score, bad: r.bad });
    }
    if (o.write) { writeFile(path.join(ENG, OUT_FILE), rows.map((r) => JSON.stringify(r)).join("\n") + "\n"); out(`wrote ${rows.length} flights to ${OUT_FILE}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
