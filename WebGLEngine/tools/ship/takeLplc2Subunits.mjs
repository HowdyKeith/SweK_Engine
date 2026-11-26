// WebGLEngine/tools/ship/takeLplc2Subunits.mjs -- UNNUMBERED (the version is chosen at ship time). Run: node tools/ship/takeLplc2Subunits.mjs [--write]
//
// THE LPLC2 SUBUNIT ROUND, RUN ONCE (brain/FLY_RETINOTOPY_RF_WIP.md Part 5, registered before brain/lplc2Subunits.mjs): the eleven stimuli through the subunit cell, and the same frames through
// brain/flyEmdLplc2Gf.mjs's multiplicative cross unit (reported only). With --write the responses go to brain/lplc2SubunitsRun.json, which is committed unread and then read once with the registered
// predictions (lplc2Subunits.predictions). Without --write it prints nothing of the result, only what it would write where. Export-free on purpose: the library is brain/lplc2Subunits.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseOrExit } from "./cliArgs.mjs";
import * as L from "../../brain/lplc2Subunits.mjs";

const cli = parseOrExit("takeLplc2Subunits", { flags: ["--write"] });
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."), out = path.join(ENG, "brain", "lplc2SubunitsRun.json");
if (!cli.flags.has("--write")) { console.log(`[takeLplc2Subunits] would run ${L.STIMULI.length} stimuli and write ${path.relative(ENG, out)}; pass --write to run (once: the round is registered)`); process.exit(0); }
const M = L.masks(), responses = {}, zhao = {};
for (const name of L.STIMULI) {
    const s = L.stimulus(name);
    responses[name] = L.respond(s.frames, M).peak;
    zhao[name] = L.respondZhao(s.frames).activeFrames;
    console.log(`[takeLplc2Subunits] ${name} done`);
}
fs.writeFileSync(out, JSON.stringify({ schema: 1, registered: "brain/FLY_RETINOTOPY_RF_WIP.md Part 5", frame: L.FRAME, subunits: L.SUBUNITS, stim: L.STIM, peakWindowS: L.PEAK_WINDOW_S, responses, zhaoActiveFrames: zhao }, null, 1) + "\n");
console.log(`[takeLplc2Subunits] wrote ${path.relative(ENG, out)} -- commit it before reading it`);
