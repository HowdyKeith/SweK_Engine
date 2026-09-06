// WebGLEngine/tools/roundhouse/sensitivitySweep.mjs -- v4488
//
// libmSensitivitySweep over the whole lab, ONE CHILD PROCESS PER DEVICE, under a hard cap.
//
// *** WHY NOT JUST RUN THE SWEEP. *** Because it does not return. libmSensitivity-selfcheck's header says
// "~150s: three builds of the whole lab"; measured at v4488 the sweep ran forty minutes on an idle box without
// finishing, and with the eight known non-finishers DECLINED IN-PROCESS it still exceeded 900 s.
//
// TWO SEPARATE COSTS, BOTH MEASURED:
//   1. EIGHT DEVICES DO NOT FINISH -- em, optics, kh, kuramoto, hydrostatic, twof, stability, flip3d. Only an
//      external kill bounds those, which is v4486's finding about optics.converge in a second place.
//   2. THE PROCESS GETS SLOWER AS IT GOES. The same 120 devices that do finish cost 476.7 s in separate
//      processes and OVER 900 s in one, about 1.9x. libmSensitivity says why in its own comment: counting
//      unspecified libm calls means instrumenting Math, and that "deoptimises those callsites for the rest of
//      the process", so every device pays for the ones before it. A skip list cannot return that cost; a fresh
//      process can.
//
// So the child process is not a convenience here -- it is the only arrangement in which this sweep terminates
// AND the only one in which its cost is roughly the sum of its parts.
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { DEVICE_NAMES } from "./devices.mjs";

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ONE = path.join(HERE, "sensitivityOne.mjs");

/** 90 s clears every device that finishes -- the slowest was pipe3d at 56.5 s -- with half again in hand. */
export const DEVICE_CAP_MS = 90000;

export async function sensitivitySweepBudgeted({ capMs = DEVICE_CAP_MS, onDevice = null, devices = null } = {}) {
    const list = devices || DEVICE_NAMES;
    const rows = [], cost = {}, overCap = [], errored = [];
    let determinismFailures = 0;
    for (const device of list) {
        const t0 = Date.now();
        try {
            const { stdout } = await run(process.execPath, [ONE, device],
                                         { timeout: capMs, maxBuffer: 64 * 1024 * 1024, killSignal: "SIGKILL" });
            const r = JSON.parse(stdout);
            if (r.error) errored.push(device);
            else { rows.push(...r.rows); determinismFailures += r.determinismFailures || 0; }
        } catch (e) {
            if (e.killed || e.signal === "SIGKILL") overCap.push(device);
            else errored.push(device);
        }
        cost[device] = Date.now() - t0;
        if (onDevice) onDevice(device, cost[device], overCap.includes(device));
    }
    const all = rows.flatMap((r) => r.fields.map((f) => ({ ...f, device: r.device, mode: r.mode })));
    return {
        rows, determinismFailures, cost,
        // NAMED, so a caller reports an absence instead of inferring the lab was covered.
        overCap, errored,
        summary: {
            devicesRun: list.length - overCap.length - errored.length,
            deviceModes: rows.length,
            observables: all.length,
            moved: all.filter((f) => f.moved).length,
            totalMs: Object.values(cost).reduce((a, b) => a + b, 0),
        },
    };
}

/**
 * MEASURED AT v4488 by running it. Reproduced twice within 0.4 s of each other (1196.7 s in the diagnostic
 * probe, 1196.3 s through this module), which is what makes the cost a figure rather than an impression.
 */
export const SWEEP_AT_V4488 = Object.freeze({
    at: "v4488",
    devicesRun: 120, deviceModes: 450, observables: 3305, moved: 650, wallMs: 1196325,
    overCap: Object.freeze(["em", "optics", "kh", "kuramoto", "hydrostatic", "twof", "stability", "flip3d"]),
    capMs: 90000,
    // The two numbers that decide the architecture. Same 120 devices, two arrangements.
    inSeparateProcessesMs: 476700,
    inOneProcessMs: 900000,            // a floor: `timeout 900` KILLED it, so the true figure is larger
    inOneProcessCompleted: false,
    statedInHeader: "~150s",
    // What the gate's own header claimed against what it costs. Not a drift -- it was never measured.
    understatedBy: 8,
});
