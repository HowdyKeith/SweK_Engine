// WebGLEngine/tools/ship/takeStationRun.mjs -- v4929 (export-free on purpose: the command; the libraries are brain/duelStationsTask.mjs and brain/courierTask.mjs, held by their gates)
//   node tools/ship/takeStationRun.mjs --duel <seed> --kind <patrol|quiet|evader|hunter> --crew <SONAR|FIXED|RISK|BLIND>
//   node tools/ship/takeStationRun.mjs --courier <seed> --crew <NAV|FIXED|LEGS|ROUTE>
// REPLAY ONE RUN of the submarine stations' rounds 3 to 6 (brain/SUB_STATIONS_WIP.md sections 12-19) and print its record: one duel on a low battery, or one courier run with a battery. Writes nothing; flies one seed, so it
// reads nothing that a registered set has not already had read (a HELD seed replays what the committed results file already holds).
"use strict";
import { parseOrExit } from "./cliArgs.mjs";
import * as DS from "../../brain/duelStationsTask.mjs";
import * as CT from "../../brain/courierTask.mjs";

const SPEC = { values: { "--duel": "number", "--courier": "number", "--kind": "string", "--crew": "string" } };
const cli = parseOrExit("takeStationRun", SPEC), v = cli.values;
const refuse = (m) => { console.error(`[takeStationRun] ${m}`); process.exit(2); };
if (("--duel" in v) === ("--courier" in v)) refuse("give exactly one of --duel <seed> or --courier <seed>");
if (!v["--crew"]) refuse("--crew is needed");
if ("--duel" in v) {
    if (!DS.CREWS.includes(v["--crew"])) refuse(`a duel crew is one of ${DS.CREWS.join(", ")}, got ${v["--crew"]}`);
    const kind = v["--kind"] || "patrol";
    const r = DS.fight({ seed: v["--duel"], kind }, v["--crew"]);
    console.log(`[takeStationRun] duel ${r.seed} ${r.kind}, ${r.crew}, battery ${(r.c0 * 100).toFixed(1)}%: score ${r.score.toFixed(3)}, winner ${r.winner}, ${r.flat ? "ran flat" : `${(r.chargeEnd * 100).toFixed(1)}% of the start left`}, energy had the con ${r.energyCon} ticks${r.blocked ? `, ${r.blocked} claims held back` : ""}`);
} else {
    if (v["--kind"]) refuse("--kind is for a duel");
    if (!CT.CREWS.includes(v["--crew"])) refuse(`a courier crew is one of ${CT.CREWS.join(", ")}, got ${v["--crew"]}`);
    const r = CT.run(v["--courier"], v["--crew"]);
    console.log(`[takeStationRun] courier ${r.seed}, ${r.crew}, battery ${(r.c0 * 100).toFixed(1)}%: ${r.goals} goals in ${CT.SECONDS} s, ${r.status}, ${r.emptyS.toFixed(0)} s empty, ${r.chargingS.toFixed(0)} s charging, ${r.hits} hits`);
}
