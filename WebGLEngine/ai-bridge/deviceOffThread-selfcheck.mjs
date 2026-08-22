// WebGLEngine/ai-bridge/deviceOffThread-selfcheck.mjs -- v3482
//
// Run: node ai-bridge/deviceOffThread-selfcheck.mjs
//
// *** v3481 BUILT THE WORKER AND PROVED IT. NOTHING CALLED IT. THIS GATE IS ABOUT THE ONE LINE THAT DOES. ***
//
// A fix nobody uses is not a fix -- graveyard would have filed deviceWorker.mjs as an orphaned utility within a
// round, and it would have been right. So this checks the WIRING and not the worker: that deviceBridge really
// reaches for it, that the proxy carries everything deviceBind reads, and that a WHOLE ROUNDHOUSE RUN -- loop,
// model calls, round streaming and all -- stops blocking the loop.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDevice } from "../tools/roundhouse/devices.mjs";
import { offThreadDevice, measureMainThreadStall } from "./deviceWorker.mjs";
import { roundhouseDevice } from "../tools/roundhouse/deviceBind.mjs";
import { noComments } from "../tools/ship/sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE BRIDGE ACTUALLY REACHES FOR IT
 * --------------------------------------------------------------------------------------------------------- */
{
    // noComments, because v3476 wasted a run matching its own explanatory prose -- third time this session.
    const src = noComments(fs.readFileSync(path.join(HERE, "deviceBridge.js"), "utf8"));
    ok("!! *** deviceBridge WRAPS THE DEVICE BEFORE RUNNING IT ***",
       /offThreadDevice\(device,\s*deviceName\)/.test(src) && /deviceWorker\.mjs/.test(src),
       "*** THE WORKER EXISTED FOR A WHOLE VERSION WITH NOTHING CALLING IT. This assertion is on the CALL SITE rather than on the worker, because a worker that works and is not used is indistinguishable from no worker at all -- and it is exactly what the orphan census would have caught a round later, by which time the box would still have been stalling. ***");

    const i = src.indexOf("offThreadDevice(device, deviceName)");
    const j = src.indexOf("roundhouseDevice({");
    ok("...and it wraps BEFORE the run rather than after it", i > 0 && j > i,
       "ordering matters and is not decorative: wrapping after the driver already holds the raw device would leave the physics exactly where it was, while the source still LOOKED wired.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE PROXY CARRIES EVERYTHING THE DRIVER READS
 * --------------------------------------------------------------------------------------------------------- */
{
    const raw = await getDevice("optics");
    const prox = offThreadDevice(raw, "optics");
    // deviceBind reads exactly these; a proxy that dropped one would fail far from here with a message about
    // none of this.
    const NEEDED = ["name", "observables", "defaults", "registryName"];
    const missing = NEEDED.filter((k) => raw[k] !== undefined && prox[k] === undefined);
    ok("!! the proxy forwards every field deviceBind reads", missing.length === 0,
       missing.length ? "DROPPED: " + missing.join(", ")
                      : NEEDED.filter((k) => raw[k] !== undefined).join(", ") + " all present, and only `build` differs. THE LIST IS TAKEN FROM deviceBind's OWN USAGE rather than from the shape of the object, so a field the driver starts reading later is a gap this names rather than hides.");

    ok("!! *** AND IT FORWARDS THE **SECOND** ARGUMENT, WHICH IS THE ONE EASY TO LOSE ***",
       await (async () => {
           // buildOptics(hyp, base) merges base into config. If the proxy dropped `base`, the override would
           // silently do nothing and the run would return the DEFAULT answer -- a plausible number, quietly wrong.
           const a = await prox.build({ mode: "airy" }, { nSamples: 201 });
           const b = await raw.build({ mode: "airy" }, { nSamples: 201 });
           return JSON.stringify(a) === JSON.stringify(b);
       })(),
       "device.build takes (hyp, base) and tryReplay calls it with ONE argument while the round loop calls it with TWO. *** A PROXY THAT FORGOT `base` WOULD RETURN THE DEFAULT ANSWER RATHER THAN AN ERROR -- a plausible number for a question nobody asked, which is the failure this tree rates worst. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. A WHOLE RUN, BOTH WAYS
 * --------------------------------------------------------------------------------------------------------- */
{
    const raw = await getDevice("optics");
    const prox = offThreadDevice(raw, "optics");
    // A deterministic caller: no network, same proposal every round, so the ONLY difference between the two
    // runs is where the physics executed.
    const caller = async () => ({ mode: "airy", claim: "the first dark ring sits at the Rayleigh limit", config: {} });
    const runOne = (dev) => measureMainThreadStall(() =>
        roundhouseDevice({ callModel: caller, device: dev, question: "q", maxRounds: 2, onRound: () => {} }));

    const inline = await runOne(raw);
    const worker = await runOne(prox);
    say(`inline: ${inline.worstStallMs}ms stall, ${inline.value.rounds} rounds, crystallized=${inline.value.crystallized}`);
    say(`worker: ${worker.worstStallMs}ms stall, ${worker.value.rounds} rounds, crystallized=${worker.value.crystallized}`);

    ok("!! *** THE RUN REACHES THE SAME OUTCOME THROUGH THE PROXY ***",
       inline.value.rounds === worker.value.rounds && inline.value.crystallized === worker.value.crystallized,
       "same round count, same verdict. THE LOOP, THE MODEL CALLS AND THE ROUND STREAMING ARE UNCHANGED -- only where the arithmetic happened moved, and if that had altered the verdict the change would be a different device wearing the same name.");

    ok("!! *** AND THE WHOLE RUN STOPS BLOCKING THE EVENT LOOP ***",
       inline.worstStallMs > 200 && worker.worstStallMs < 100,
       `${inline.worstStallMs}ms -> ${worker.worstStallMs}ms across a FULL roundhouse run rather than a single build. *** THAT IS THE NUMBER KEITH'S BOX CARES ABOUT: while the old path ran, every static file, every peer request and every gauge poll on that machine waited. The inline case is asserted to actually block, because on a fast enough box this fix would certify itself against a stall that never happened. ***`);
}

console.log(fails ? "\ndeviceOffThread-selfcheck: " + fails + " FAILED" : "\ndeviceOffThread-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
