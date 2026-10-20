// WebGLEngine/tools/roundhouse/wideSweep.mjs -- v4486
//
// The corroboration battery over every eligible device/mode, ONE CHILD PROCESS PER MODE, under a hard cap.
//
// *** THE POINT IS THE BUDGET, AND v4485 PAID TO LEARN WHY. *** That round ran the battery in one process with
// a Promise.race cap of 120 s; optics.converge ran 12m38s of solid CPU through it, because a setTimeout cannot
// interrupt synchronous work on the same thread. corroborationCensus records the same limit beside its own
// budget and answers it by declining to START the next unit -- which bounds the run and leaves the offending
// unit unmeasured, so the sweep still cannot finish.
//
// A child process is the budget that bites: execFile's timeout SIGKILLs whatever the child is doing. A mode
// that cannot finish costs its cap and the sweep CONTINUES PAST IT, which is the difference between a wide
// number that exists and one that is owed for five rounds.
//
// WHAT IT DOES NOT DO: make optics.converge fast, or decide that its cap is generous enough. A mode killed at
// the cap is reported as OVER CAP -- an absent reading, not a zero -- for the same reason redCensus separates
// an admitted line from a stale one.
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { eligibleDevices } from "./deviceReport.mjs";
import { deviceModeTable } from "./deviceModes.mjs";

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ONE = path.join(HERE, "deviceReportOne.mjs");

/** Default cap per mode. 60 s clears every mode v4485 completed by a factor of two; the slowest was 32.9 s. */
export const MODE_CAP_MS = 60000;

export async function sweepMode(device, mode, capMs = MODE_CAP_MS) {
    const t0 = Date.now();
    try {
        const { stdout } = await run(process.execPath, [ONE, device, mode],
                                     { timeout: capMs, maxBuffer: 32 * 1024 * 1024, killSignal: "SIGKILL" });
        const r = JSON.parse(stdout);
        return { ...r, ms: Date.now() - t0, overCap: false };
    } catch (e) {
        // execFile sets killed on a timeout kill. Anything else is a real failure and is reported as one.
        const overCap = !!e.killed || e.signal === "SIGKILL";
        return { device, mode, error: overCap ? null : String(e.message || e).slice(0, 200),
                 rows: [], ms: Date.now() - t0, overCap };
    }
}

/**
 * Sweep every eligible device/mode. `onMode` is called as each lands, so a long run is legible while it runs --
 * v4036's other lesson, and the one that made v4485's first harness lose four minutes of completed work.
 */
export async function wideSweep({ capMs = MODE_CAP_MS, onMode = null, devices = null } = {}) {
    const table = await deviceModeTable();
    const list = devices || eligibleDevices();
    const observables = {}, cost = {}, overCap = [], errored = [];
    for (const device of list) {
        for (const mode of (table[device] || [])) {
            const r = await sweepMode(device, mode, capMs);
            cost[`${device}.${mode}`] = r.ms;
            if (r.overCap) overCap.push(`${device}.${mode}`);
            else if (r.error) errored.push(`${device}.${mode}`);
            else for (const row of r.rows) observables[`${device}.${mode}.${row.field}`] =
                { moved: row.moved, relMove: row.relMove, amplification: row.amplification };
            if (onMode) onMode(r);
        }
    }
    const keys = Object.keys(observables);
    const movers = keys.filter((k) => observables[k].moved);
    const ranked = movers.slice().sort((a, b) => observables[b].amplification - observables[a].amplification);
    return {
        observables, cost, overCap, errored,
        devicesSwept: list.length,
        modesSwept: Object.keys(cost).length - overCap.length - errored.length,
        modesOverCap: overCap.length,
        count: keys.length, movers: movers.length,
        maxAt: ranked[0] || null,
        maxAmplification: ranked[0] ? observables[ranked[0]].amplification : null,
        ranked: ranked.slice(0, 10),
        totalMs: Object.values(cost).reduce((a, b) => a + b, 0),
    };
}
