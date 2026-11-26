// WebGLEngine/tools/ship/takeLplc2Subunits.mjs -- UNNUMBERED (the version is chosen at ship time). Run: node tools/ship/takeLplc2Subunits.mjs [--round 5|7] [--write]
//
// THE LPLC2 SUBUNIT ROUND, RUN ONCE (brain/FLY_RETINOTOPY_RF_WIP.md Part 5, registered before brain/lplc2Subunits.mjs): the eleven stimuli through the subunit cell, and the same frames through
// brain/flyEmdLplc2Gf.mjs's multiplicative cross unit (reported only). With --write the responses go to brain/lplc2SubunitsRun.json, which is committed unread and then read once with the registered
// predictions (lplc2Subunits.predictions). Without --write it prints nothing of the result, only what it would write where. Export-free on purpose: the library is brain/lplc2Subunits.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseOrExit } from "./cliArgs.mjs";
import * as L from "../../brain/lplc2Subunits.mjs";

// 2026-11-26 -- --round 7: Part 7's oriented-arms round (the cos2 tuning on Part 5's stimuli and S11) to brain/lplc2OrientedRun.json, with Part 5's model and Zhao's unit on S11 reported beside it. --round 5 (the default) is Part 5's, unchanged.
const cli = parseOrExit("takeLplc2Subunits", { values: { "--round": "string" }, flags: ["--write"] });
const round = cli.values["--round"] || "5";
if (round !== "5" && round !== "7") { console.error(`[takeLplc2Subunits] --round is 5 or 7, got ${JSON.stringify(round)}`); process.exit(2); }
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."), out = path.join(ENG, "brain", round === "7" ? "lplc2OrientedRun.json" : "lplc2SubunitsRun.json");
if (!cli.flags.has("--write")) { console.log(`[takeLplc2Subunits] round ${round}: would run ${(round === "7" ? L.STIMULI7 : L.STIMULI).length} stimuli and write ${path.relative(ENG, out)}; pass --write to run (once: the round is registered)`); process.exit(0); }
if (round === "7") {
    const M = L.masks(), responses = {}, part5 = {}, zhao = {};
    for (const name of L.STIMULI7) { const s = L.stimulus(name); responses[name] = L.respond(s.frames, M, { tuning: "cos2" }).peak; console.log(`[takeLplc2Subunits] ${name} done`);
        if (name === "S11") { part5.S11 = L.respond(s.frames, M).peak; zhao.S11 = L.respondZhao(s.frames).activeFrames; } }
    fs.writeFileSync(out, JSON.stringify({ schema: 1, registered: "brain/FLY_RETINOTOPY_RF_WIP.md Part 7", tuning: "cos2", frame: L.FRAME, subunits: L.SUBUNITS, stim: L.STIM, peakWindowS: L.PEAK_WINDOW_S, responses, part5ModelOnS11: part5, zhaoActiveFramesOnS11: zhao }, null, 1) + "\n");
    console.log(`[takeLplc2Subunits] wrote ${path.relative(ENG, out)} -- commit it before reading it`); process.exit(0);
}
const M = L.masks(), responses = {}, zhao = {};
for (const name of L.STIMULI) {
    const s = L.stimulus(name);
    responses[name] = L.respond(s.frames, M).peak;
    zhao[name] = L.respondZhao(s.frames).activeFrames;
    console.log(`[takeLplc2Subunits] ${name} done`);
}
fs.writeFileSync(out, JSON.stringify({ schema: 1, registered: "brain/FLY_RETINOTOPY_RF_WIP.md Part 5", frame: L.FRAME, subunits: L.SUBUNITS, stim: L.STIM, peakWindowS: L.PEAK_WINDOW_S, responses, zhaoActiveFrames: zhao }, null, 1) + "\n");
console.log(`[takeLplc2Subunits] wrote ${path.relative(ENG, out)} -- commit it before reading it`);
