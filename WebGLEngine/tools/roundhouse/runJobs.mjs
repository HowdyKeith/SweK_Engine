// tools/roundhouse/runJobs.mjs
//
// v2962 -- THE PEER SIDE OF THE QUEUE. Claim work, run it, report what was measured.
//
//   node tools/roundhouse/runJobs.mjs [hub-url] [--max=2]
//
// HOW A JOB IS EXECUTED, and why this is not a code channel. The job supplies a device NAME, a mode NAME and a
// flat config of primitives. This runner:
//
//   1. re-validates the spec against THIS machine's own MODES registry -- the hub's opinion is not trusted, and
//      a job naming a device this build does not have is refused here as well as there;
//   2. resolves the device through getDevice(), the same registry every gate and census uses;
//   3. calls build({ mode, config }).
//
// At no point is anything from the job interpreted as code. There is no eval, no import of a hub-supplied path,
// no shelling out. The worst a malicious hub can do is ask this machine to run one of its own devices with
// silly numbers -- which is a wasted minute, not a compromise.
//
// It reports the RESULT it measured. It does not grade: the hub adjudicates with the same graders everything
// else goes through.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const MEMO = path.join(here, ".swek-lighthouse");

const readMemo = () => { try { return fs.readFileSync(MEMO, "utf8").split("\n").map((s) => s.trim()).filter(Boolean); } catch { return []; } };

async function main() {
    const args = process.argv.slice(2);
    const max = Math.min(4, Math.max(1, Number((args.find((a) => a.startsWith("--max=")) || "").split("=")[1]) || 1));
    const given = args.filter((a) => !a.startsWith("--")).map((u) => u.replace(/\/+$/, ""));
    const candidates = [...new Set([...given, ...readMemo()])];
    if (!candidates.length) { console.error("no hub URL known -- run lighthouse_checkin.mjs once, or pass one here"); process.exit(2); }

    const { peerKey } = await import("./lighthouse.mjs");
    const me = peerKey({ host: os.hostname(), arch: process.arch, platform: process.platform });

    // find a hub that answers, walking the candidate list exactly as the check-in does
    let hub = null;
    for (const c of candidates) {
        const r = await fetch(c + "/jobs", { signal: AbortSignal.timeout(12000) }).catch(() => null);
        if (r && r.ok) { hub = c; break; }
    }
    if (!hub) { console.error(`no hub reachable among ${candidates.length} candidate(s) -- nothing claimed, nothing lost`); process.exit(1); }

    const claimed = await fetch(hub + "/jobs/claim", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerKey: me, max }), signal: AbortSignal.timeout(20000),
    }).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e.message || e) }));

    if (!claimed.ok) { console.error("claim failed: " + claimed.error); process.exit(1); }
    if (!claimed.jobs.length) { console.log(`no work available at ${hub}`); return; }

    const { getDevice } = await import("./devices.mjs");
    const { deviceModeTable } = await import("./deviceModes.mjs");
    const { validateSpec } = await import("./jobQueue.mjs");
    // v3211 -- THIS MACHINE'S OWN TABLE, BUILT HERE. The line above used to destructure a MODES that
    // deviceModes.mjs has never exported, so `MODES` was undefined and the local re-validation -- the entire
    // point of this file, per its own header line 10 -- refused every job with `unknown device`. THE PEER'S
    // REFUSAL TO TRUST THE HUB WAS REAL; what it was comparing against was not.
    const MODES = await deviceModeTable();

    for (const job of claimed.jobs) {
        console.log(`${job.id}: ${job.device}/${job.mode} ${JSON.stringify(job.config)}`);
        let result = null, error = null;
        // re-validate LOCALLY: the hub said this is runnable, this machine decides whether it agrees
        const v = validateSpec({ kind: job.kind, device: job.device, mode: job.mode, config: job.config }, MODES);
        if (!v.ok) {
            error = "refused locally: " + v.problems.join("; ");
            console.log("  " + error);
        } else {
            const t0 = Date.now();
            try {
                const dev = await getDevice(job.device);
                result = await dev.build({ mode: job.mode, config: job.config });
                console.log(`  ok in ${Date.now() - t0}ms`);
            } catch (e) { error = String((e && e.message) || e); console.log("  error: " + error.slice(0, 80)); }
        }
        const done = await fetch(hub + "/jobs/complete", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ peerKey: me, id: job.id, result: error ? { error } : result }),
            signal: AbortSignal.timeout(20000),
        }).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e.message || e) }));
        console.log(done.ok ? "  reported" : "  could not report: " + done.error + " (the lease will expire and the job returns to the pool)");
    }
}

main().catch((e) => { console.error(String((e && e.message) || e)); process.exit(1); });
