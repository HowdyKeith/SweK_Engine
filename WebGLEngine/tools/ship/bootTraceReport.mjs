// tools/ship/bootTraceReport.mjs
//
// v3528 -- THE FRONT DOOR FOR v3522's BOOT TRACE, BECAUSE KEITH SHOULD NOT HAVE TO READ A CONSOLE.
//
// v3522 built the trace to answer one question: when an auto-update spawns a successor and the old server is
// still alive an hour later, DID THE SUCCESSOR EVER RUN? Three states, and they want opposite repairs --
// NO-TRACE means the LAUNCHER never reached node, BOOTED means it ran and lost the PORT FIGHT, BOUND means the
// handoff worked. The successor writes them to <tmp>/swek_boot_trace.jsonl and sysadminBridge reads the verdict
// back 30 seconds after launching.
//
// *** BUT THAT VERDICT GOES TO THE OLD SERVER'S LOG, AND THE WHOLE REASON THE TRACE EXISTS IS THAT THE
// EVIDENCE WAS GOING SOMEWHERE NOBODY READS. *** installHandoff's port-fight lines went to a window the silent
// update opens MINIMISED; putting the answer in a different console would be the same mistake one step along.
// Keith asked for it on a page and he is right: A MODULE WITH NO CALLER IS UNFINISHED, and so is a diagnosis
// with no reader.
//
// REGISTERED IN reportingTools SO tools.html RUNS IT. It PRINTS AND EXITS ZERO -- a reporting tool must, and
// the gate beside it is what exits nonzero (v3327). It asserts nothing and decides nothing: it reads what the
// successors wrote and says which of the three states each launch reached.
//
// NO CLOCK JUDGEMENT HERE. classify() takes `since` so a launch can be scoped, and this report shows the whole
// file with ages, because %TEMP% SURVIVES REBOOTS and a report that silently dropped old rows would hide
// exactly the thing that makes a stale record dangerous. THE AGE IS SHOWN AND THE READER DECIDES.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BT = createRequire(import.meta.url)(path.join(HERE, "..", "..", "ai-bridge", "bootTrace.js"));

const ago = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 90) return s + "s ago";
    if (s < 5400) return Math.round(s / 60) + "m ago";
    return Math.round(s / 3600) + "h ago";
};

export function reportLines() {
    const rows = BT.readAll();
    const L = [];
    L.push("[bootTraceReport] what happened to each build an auto-update launched");
    L.push("  trace file: " + BT.tracePath());
    if (!rows.length) {
        L.push("  NO ROWS. Either no auto-update has run since this file was last cleared, or NOTHING THIS TREE");
        L.push("  SPAWNED EVER REACHED node -- and those are different facts. The first successor to boot writes");
        L.push("  a `boot` row before anything else can throw, so an empty file after an update IS the finding.");
        return L;
    }
    const now = Date.now();
    // Group by the FOLDER, because that is the identity a handoff is about -- two builds can carry the same
    // version marker (v3505 proved that the hard way) and the folder is what the launcher was pointed at.
    const byRoot = new Map();
    for (const r of rows) {
        const k = r.root || "(no root)";
        if (!byRoot.has(k)) byRoot.set(k, []);
        byRoot.get(k).push(r);
    }
    L.push("  " + rows.length + " rows across " + byRoot.size + " build folders");
    for (const [root, rs] of byRoot) {
        const first = rs[0], last = rs[rs.length - 1];
        const v = BT.classify(root, first.at);
        const events = [...new Set(rs.map((r) => r.event))].join(", ");
        L.push("");
        L.push("  " + root);
        L.push("    STATE: " + v.state + " -- " + v.detail);
        L.push("    first " + ago(now - first.at) + ", last " + ago(now - last.at) + "; events: " + events);
        if (v.state === "NO-TRACE") L.push("    -> the LAUNCHER is the thing to look at, not the port.");
        if (v.state === "BOOTED")   L.push("    -> node ran and never bound: the PORT FIGHT or a different PORT, not the launcher.");
        if (v.state === "BOUND")    L.push("    -> the handoff worked; this build owns :" + (v.port ?? "?") + ".");
    }
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
