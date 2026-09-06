#!/usr/bin/env node
// WebGLEngine/tools/roundhouse/deviceReportOne.mjs -- v4486
//
// Run: node tools/roundhouse/deviceReportOne.mjs <device> <mode>
//
// ONE device/mode of the corroboration battery, in its own process, printing JSON on stdout.
//
// *** THIS EXISTS BECAUSE A BUDGET INSIDE THE PROCESS CANNOT WORK, WHICH v4485 MEASURED. *** That round capped
// each mode at 120 s with a Promise.race against a setTimeout and optics.converge ran 12 minutes 38 seconds of
// solid CPU straight through it: a timer cannot interrupt synchronous work on the same thread. corroborationCensus
// records the same thing beside its own budget -- "a build already running cannot be interrupted, so one long
// build overruns any budget" -- and its answer is to decline to START the next unit, which bounds the run but
// leaves the offending unit unmeasured and the sweep incomplete.
//
// A CHILD PROCESS IS THE ONE BUDGET THAT ACTUALLY BITES: the parent holds a real timeout and SIGKILLs a child
// that overruns, whatever it is doing. So a mode that cannot finish costs its cap and nothing more, and the
// sweep continues past it instead of ending there.
import { reportDeviceMode } from "./deviceReport.mjs";

const [device, mode] = process.argv.slice(2);
if (!device || !mode) { console.error("usage: deviceReportOne.mjs <device> <mode>"); process.exit(2); }

try {
    const r = await reportDeviceMode(device, mode);
    // Only what a sweep needs. The full row carries criteria objects that are large and that no caller reads.
    process.stdout.write(JSON.stringify({
        device, mode, error: r.error || null,
        rows: (r.rows || []).map((x) => ({ field: x.field, moved: !!x.moved, relMove: x.relMove ?? null,
                                           amplification: x.amplification ?? null })),
    }));
} catch (e) {
    process.stdout.write(JSON.stringify({ device, mode, error: String(e && e.message || e), rows: [] }));
}
