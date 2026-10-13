// WebGLEngine/tools/ship/ramBaseline6dof.mjs -- v4848
//
// HOW OFTEN DO THE SPACE-BATTLE PILOTS RAM EACH OTHER, AND DOES IT WIN OR LOSE THEM THE FIGHT? One table, reproducible: every pilot we ship, against the PD autopilot, against the shipped pilot and against a copy
// of itself, in each of the two starts (standoff: 84 m apart at rest; joust: 14-40 m apart and closing), from BOTH sides, on the 40 baseline seeds (501..540: read by nothing that trains), with ship-ship
// collisions ON -- the page's own, ram damage to both ships. A "ram game" is a game with at least one impact; "hp" is the hit points EACH ship lost to rams, summed over the games.
//
//     node tools/ship/ramBaseline6dof.mjs                  # the table
//     node tools/ship/ramBaseline6dof.mjs --seeds 20       # fewer seeds
//
// *** NO EXPORTS ON PURPOSE: a command-line entry point, as tools/ship/trainLeague6dof.mjs is. ***
// WHAT IT FOUND (v4848, the table above on 40 seeds x 2 sides = 80 games a row): in the STANDOFF start there is not one contact in any row -- the centres never come nearer than 55 m and a fight lasts
// 1.6-3.9 s -- so switching collisions on changes nothing for a pilot trained there. In the JOUST start the shipped pilot rams in 28-30 of 80 games and the PD autopilot in 20; and the league pilot of v4846,
// which beats the shipped pilot 42-3 in the standoff, loses all 80 jousts to the PD autopilot without landing a hit.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as P from "../../brain/pilot6dofPolicy.mjs";
import { previousWeights } from "./train6dofLeague.mjs";

const BRAIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "brain");
const argv = process.argv.slice(2), nSeeds = argv[0] === "--seeds" ? Number(argv[1]) : 40;
if (!(nSeeds >= 1 && nSeeds <= P.BASELINE_SEEDS.length)) { console.error(`ramBaseline6dof: --seeds must be 1..${P.BASELINE_SEEDS.length}`); process.exit(2); }
const seeds = P.BASELINE_SEEDS.slice(0, nSeeds);

const pilots = { autopilot: "autopilot", shipped: previousWeights() };
for (const [name, file] of [["league", "pilot6dofWeightsLeague.json"], ["close", "pilot6dofWeightsClose.json"], ["careful", "pilot6dofWeightsCareful.json"]]) {
    const f = path.join(BRAIN, file); if (fs.existsSync(f)) pilots[name] = previousWeights(f);
}

console.log(`ramBaseline6dof: ${seeds.length} seeds x 2 sides = ${seeds.length * 2} games a row, collisions ON, seeds ${seeds[0]}..${seeds[seeds.length - 1]}`);
console.log("pilot      vs          start     games  ram games  impacts   hp lost  pilot W/L");
for (const [name, w] of Object.entries(pilots)) {
    for (const [oname, opp] of [["autopilot", "autopilot"], ["shipped", pilots.shipped], ["itself", w]]) {
        if ((name === "autopilot" && oname === "autopilot") || (name === "shipped" && oname === "itself")) continue;   // the first is not a pilot against the PD autopilot, the second is the row above it
        for (const scenario of ["standoff", "joust"]) {
            const res = P.evaluate(w, seeds, { opponent: [opp], collisions: true, scenarios: [scenario] });
            console.log(`${name.padEnd(10)} ${oname.padEnd(11)} ${scenario.padEnd(8)} ${String(res.runs.length).padStart(6)}  ${String(res.runs.filter((r) => r.rams > 0).length).padStart(9)}  ${String(res.rams).padStart(7)}  ${res.ramHp.toFixed(0).padStart(8)}  ${res.wins}/${res.losses}`);
        }
    }
}
