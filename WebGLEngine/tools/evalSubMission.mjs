// WebGLEngine/tools/evalSubMission.mjs -- UNNUMBERED -> v4875 (the version is chosen at ship time)
//
// Run: node tools/evalSubMission.mjs [weights.json ...] [--set train|held|baseline] [--actuators]
//
// Flies the submarine MISSIONS of brain/missionTask.mjs (terrain following from a noisy altimeter and a forward sounder, and three-waypoint missions, each with and without a current) with the PD autopilot and with any
// connectome-wired pilot weights named on the command line, and prints each one's score by mission kind. This is the round-3 comparison of the submarine work as a command (missionTask.mjs was only ever reached by its
// own gate and by hand-run scripts before this): the pilots were trained on DEPTH HOLD, so the terrain-following score is the transfer, not the training.
"use strict";
import fs from "node:fs";
import * as M from "../brain/missionTask.mjs";
import * as P from "../brain/pilotSubPolicy.mjs";
import * as AS from "../brain/autopilotSub.mjs";
import { ACTUATORS } from "../physics/mechanics/subActuators.mjs";

const args = process.argv.slice(2), flag = (f) => args.indexOf(f), val = (f, d) => (flag(f) === -1 ? d : args[flag(f) + 1]);
const setName = val("--set", "held"), sets = { train: M.TRAIN_SET, held: M.HELD_OUT_SET, baseline: M.BASELINE_SET };
if (!sets[setName]) { console.error("usage: node tools/evalSubMission.mjs [weights.json ...] [--set train|held|baseline] [--actuators]"); process.exit(2); }
const files = args.filter((a, i) => a.endsWith(".json") && args[i - 1] !== "--set");
const opts = args.includes("--actuators") ? { actuators: ACTUATORS } : {};
const pilots = [["PD autopilot", AS.pilot()], ...files.map((f) => [f.split("/").pop(), P.pilotFor(Float32Array.from(JSON.parse(fs.readFileSync(f, "utf8")).weights))])];
console.log(`missions: ${setName} set (${sets[setName].length} dives)${opts.actuators ? ", actuator limits on" : ""}; ${M.KINDS.length} kinds: ${M.KINDS.join(", ")}`);
for (const [name, pilot] of pilots) console.log(`  ${name.padEnd(36)} ${M.describeEval(M.evaluate(pilot, sets[setName], opts))}`);
