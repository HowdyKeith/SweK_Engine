// WebGLEngine/tools/ship/lagBlameWatch.mjs -- v3477
//
// Called by "Root Utils/LAG BLAME next boot.bat". Waits for the engine to come up, waits for the first stall
// over five seconds, and prints THE FRAMES THAT HELD THE LOOP -- worst SELF time first.
//
// *** NO EXPORTS ON PURPOSE. This is a command-line entry point and not a module: giving it exports would put
// it in the orphan census as a library nothing imports, which it is not. ***
//
// It exists because the `[lag]` line reports a DURATION AND NOT A FUNCTION, and v3411 recorded what that costs:
// three wrong causes proposed in a row before anybody built the instrument. v3476 made it four -- nvidia-smi
// was a real blocker, measurably (static serves went from 105,950ms to 659ms and boot halved), AND NOT THE
// BLOCKER, since the growing stall is unchanged at 125s. THE FIFTH GUESS IS NOT THE ANSWER; THE PROFILER IS.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = process.argv[2] || "8787";
const BASE = "http://127.0.0.1:" + PORT;
const DEADLINE_MS = 8 * 60 * 1000;
const started = Date.now();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (url) => {
    try { const r = await fetch(url, { cache: "no-store" }); return await r.json(); }
    catch { return null; }
};

console.log("");
console.log("  Waiting for the engine on " + BASE + " ...");
console.log("  (the profiler is already armed -- this just watches for the first stall over 5 seconds)");
console.log("");

let up = false, lastNote = "";
while (Date.now() - started < DEADLINE_MS) {
    const j = await get(BASE + "/sys/lagblame");
    if (j && j.ok) {
        if (!up) { up = true; console.log("  Engine is up. Watching..."); }
        if (j.report && j.report.frames && j.report.frames.length) {
            const secs = Math.round((Date.now() - started) / 1000);
            console.log("");
            console.log("  =========================================================================");
            console.log("   THE LOOP WAS BLOCKED FOR " + Math.round(j.report.lagMs) + " ms");
            console.log("   Frames that held it, WORST SELF TIME FIRST:");
            console.log("  =========================================================================");
            for (const f of j.report.frames) {
                const name = f.functionName || f.name || "(anonymous)";
                const where = f.url || f.file || "";
                const self = f.selfMs != null ? Math.round(f.selfMs) + "ms" : (f.self != null ? Math.round(f.self) + "ms" : "?");
                console.log("   " + String(self).padStart(9) + "  " + name + (where ? "   " + where : ""));
            }
            console.log("  =========================================================================");
            // *** SELF TIME, NOT TOTAL: total time blames whatever CALLED the blocker, which is usually a
            // bootstrap function that is merely the ancestor of everything. The frame that was ON THE CPU is
            // the one that held the loop. ***
            const out = path.join(os.tmpdir(), "swek_lagblame_report.json");
            try { fs.writeFileSync(out, JSON.stringify(j, null, 2)); console.log("   Full report saved to: " + out); } catch {}
            console.log("   Captured after " + secs + "s. Send the block above to Claude.");
            console.log("");
            process.exit(0);
        }
        if (j.note && j.note !== lastNote) { lastNote = j.note; console.log("  ... " + j.note); }
    } else if (!up) {
        process.stdout.write(".");
    }
    await sleep(5000);
}

console.log("");
console.log("  No stall over 5 seconds was captured in 8 minutes.");
console.log("  That is ITSELF A RESULT and worth reporting: either the box behaved this boot,");
console.log("  or the profiler did not arm. Check the engine console for a line saying");
console.log("  '[lagBlame] armed' near the top -- if it is missing, the flag was not read.");
console.log("");
process.exit(1);
