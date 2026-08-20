// WebGLEngine/ai-bridge/catalogSnapshot.mjs — v3285
// ---------------------------------------------------------------------------------------------------------------
// THE FIRST REAL PRODUCER AND READER FOR THE BOOT SIDECAR CONTRACT — because a contract with no producer and no
// consumer is a claim, not a capability, and this session has now caught that shape three times.
//
// WHAT IT OFFLOADS: install_catalog.json is 102 entries and ~80KB, and server.js names it first in its own list
// of boot-time synchronous work ("install_catalog reading 100 entries, mdns browsing 8 service types, go2rtc
// spawning, the SQLite store opening, the credential vault read"). Digesting it into a snapshot means boot reads
// one small file instead of parsing and walking the catalog.
//
// *** AND THEN THE MEASUREMENT CONTRADICTED THE PREMISE, WHICH IS RECORDED HERE RATHER THAN QUIETLY DROPPED. ***
// Snapshotting makes the read 12.9x faster -- 0.65ms -> 0.05ms, 81750 bytes -> 13469. THE SAVING IS SIX TENTHS
// OF A MILLISECOND. install_catalog appears in server.js's list of boot-time synchronous work, and on this box
// it is not a boot cost at all; the JSON parse of 102 entries is simply cheap. So this producer does NOT justify
// itself on the target it was built for, and shipping it as a boot fix would have been a "fix" that improves a
// number nobody was waiting on while retiring the investigation into what actually blocks.
//
// IT IS KEPT, DELIBERATELY, AS THE CONTRACT'S WORKING REFERENCE IMPLEMENTATION: a producer and a reader that a
// PowerShell or shell version can be checked against, end to end, with a real file. The targets that plausibly
// DO cost real time -- mdns browsing 8 service types, go2rtc spawning, the SQLite open, the credential vault
// read -- all touch the network or spawn processes and cannot be measured in this sandbox at all. They are the
// next producers, and each needs its saving measured on the rig BEFORE it is called a fix.
//
// *** SCOPE, AND IT IS NARROWER STILL. *** The v3278 diagnosis of Keith's rig -- blocks that GROW every
// cycle, 487 seconds blocked out of 500 of uptime -- is NOT a slow boot task. Growth is the tell: a slow boot
// task is slow ONCE. That stall is synchronous work over a collection that keeps growing, and no snapshot fixes
// it. This addresses the one-time boot cost only, and saying so is the point: a fix aimed at the wrong diagnosis
// that happens to make a number look better is worse than no fix, because it retires the investigation.
//
// THE PRODUCER IS PORTABLE ON PURPOSE. This one is Node, but it emits nothing Node-specific -- a PowerShell or
// shell producer writing the same JSON is interchangeable with it, which is why the Windows-only version can
// come later without the Mac half of the fleet going unmeasured in the meantime.
//
// AND IT MEASURES WITHOUT GRADING. The snapshot says what is in the catalog; it never says the catalog is fine.
// makeReport refuses verdict-shaped keys, so this cannot start deciding even by accident.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeReport, readReport, reportLine, STATE_FRESH, STATE_STALE } from "./bootSidecar.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CATALOG_PATH = path.join(HERE, "install_catalog.json");
export const SNAPSHOT_PATH = path.join(HERE, "catalog-snapshot.json");

export const KIND = "swek-catalog-snapshot";

/**
 * Read the catalog and digest it into OBSERVATIONS. Deliberately shallow: one row per entry with the few fields
 * boot actually needs. A snapshot that carried everything would be the catalog again with extra steps.
 */
export function produce({ catalogPath = CATALOG_PATH, producedBy = "node/catalogSnapshot.mjs" } = {}) {
    const raw = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    const entries = Array.isArray(raw) ? raw : Object.entries(raw).filter(([, v]) => v && typeof v === "object").map(([k, v]) => ({ id: k, ...v }));
    const observations = entries.map((e, i) => ({
        id: String(e.id != null ? e.id : (e.name != null ? e.name : i)),
        name: e.name != null ? String(e.name) : null,
        kind: e.kind != null ? String(e.kind) : (e.type != null ? String(e.type) : null),
        // COUNTS, NOT JUDGEMENTS: "has an install command" is an observation; "installable" would be a verdict.
        hasInstall: !!(e.install || e.cmd || e.command),
        hasUrl: !!(e.url || e.repo || e.href),
    }));
    return makeReport({ kind: KIND, producedBy, inputs: { catalog: catalogPath }, observations });
}

/** Write it where boot will look. Atomic-ish: write beside, then rename, so boot never reads half a file. */
export function write({ catalogPath = CATALOG_PATH, snapshotPath = SNAPSHOT_PATH, producedBy } = {}) {
    const rep = produce({ catalogPath, producedBy });
    const tmp = snapshotPath + ".part";
    fs.writeFileSync(tmp, JSON.stringify(rep, null, 2) + "\n");
    fs.renameSync(tmp, snapshotPath);
    return { ok: true, path: snapshotPath, observations: rep.observations.length };
}

/**
 * THE READER BOOT USES. Returns the three states honestly and NEVER blocks on a rebuild: a stale snapshot is
 * used as-is and the caller refreshes AFTER the page is up, which is the v3272 lesson. `refresh` is returned as
 * a function rather than called, so the decision to spend time belongs to the caller and not to this file.
 */
export function readForBoot({ snapshotPath = SNAPSHOT_PATH, catalogPath = CATALOG_PATH, maxAgeMs = null } = {}) {
    const r = readReport(snapshotPath, { inputs: { catalog: catalogPath }, maxAgeMs });
    const usable = r.state === STATE_FRESH || r.state === STATE_STALE;
    return {
        state: r.state,
        // USABLE IS NOT THE SAME AS FRESH, and the caller is handed both rather than a single boolean that would
        // quietly merge them.
        usable, fresh: r.state === STATE_FRESH,
        entries: usable ? r.report.observations : null,
        line: reportLine(r),
        // NOT CALLED HERE. Deciding to spend boot time is the caller's business; a reader that rebuilt on a miss
        // would reintroduce exactly the synchronous boot work it exists to remove.
        refresh: () => write({ catalogPath, snapshotPath }),
    };
}

// ---- CLI: a producer a scheduled task or a shell can invoke -----------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
    const r = write({ producedBy: "cli/catalogSnapshot" });
    console.log("[catalogSnapshot] wrote " + r.observations + " observations to " + r.path);
    const back = readForBoot({});
    console.log("[catalogSnapshot] boot would read: " + back.line);
}
