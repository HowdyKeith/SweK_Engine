#!/usr/bin/env node
// WebGLEngine/tools/roundhouse/sensitivityOne.mjs -- v4488
//
// Run: node tools/roundhouse/sensitivityOne.mjs <device>
//
// ONE device's slice of libmSensitivitySweep, in its own process, printing its rows as JSON.
//
// *** THE COST THIS EXISTS FOR IS MEASURED, NOT ASSUMED. *** libmSensitivity-selfcheck's header states "~150s:
// three builds of the whole lab" and the gate did not return in FORTY MINUTES on an idle box. Running every
// device's slice separately at v4488: 128 devices, 484 modes, 1196.7 s in total with a 90 s cap, and EIGHT
// devices hit that cap -- em, optics, kh, kuramoto, hydrostatic, twof, stability, flip3d. Uncapped there is no
// finite runtime.
//
// AND A SKIP LIST ALONE DOES NOT FIX IT, WHICH WAS TESTED BEFORE THIS FILE WAS WRITTEN: with all eight declined
// in-process the sweep STILL exceeded 900 s. The same 120 devices that finish cost 476.7 s in separate processes
// and over 900 s in one -- roughly 1.9x, and the cause is in libmSensitivity's own note: instrumenting Math to
// count calls deoptimises those call sites FOR THE REST OF THE PROCESS, so every device pays for the ones
// before it. A fresh process per device is the only thing that returns that cost, and it is also the only
// budget that can kill a device which will not finish.
import { libmSensitivitySweep } from "./libmSensitivity.mjs";
import { deviceModeTable } from "./deviceModes.mjs";

const device = process.argv[2];
if (!device) { console.error("usage: sensitivityOne.mjs <device>"); process.exit(2); }

try {
    const table = await deviceModeTable();
    if (!table[device]) { process.stdout.write(JSON.stringify({ device, rows: [], error: "no modes" })); process.exit(0); }
    // `skip: []` on purpose: the parent decides what to run, and a child that silently declined its own
    // subject would report an absence as a clean result.
    const s = await libmSensitivitySweep({ modes: { [device]: table[device] }, skip: [] });
    process.stdout.write(JSON.stringify({ device, error: null, rows: s.rows, determinismFailures: s.determinismFailures }));
} catch (e) {
    process.stdout.write(JSON.stringify({ device, error: String(e && e.message || e), rows: [] }));
}
