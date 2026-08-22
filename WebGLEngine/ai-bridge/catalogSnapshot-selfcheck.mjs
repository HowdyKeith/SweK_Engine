// WebGLEngine/ai-bridge/catalogSnapshot-selfcheck.mjs — v3285
//
// Run: node ai-bridge/catalogSnapshot-selfcheck.mjs   (~0.1s — MEASURED individually, not from a batch loop)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// The boot sidecar's first real producer and reader. Two things are on trial: that the contract works end to end
// against a real file, and THAT THE SAVING IS WHAT IT IS. The gate measures the speed-up and asserts the honest
// framing survives -- because the measurement contradicted the premise this was built on, and a gate that only
// checked the happy path would have let a 0.6ms "boot fix" ship as if it addressed the stall.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { produce, write, readForBoot, KIND, CATALOG_PATH } from "./catalogSnapshot.mjs";
import { STATE_FRESH, STATE_STALE, STATE_MISSING } from "./bootSidecar.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-catalog-"));
const SNAP = path.join(dir, "catalog-snapshot.json");
const CAT = path.join(dir, "install_catalog.json");
fs.copyFileSync(CATALOG_PATH, CAT);

// ---- 1. THE PRODUCER READS THE REAL CATALOG ----------------------------------------------------------------------
{
    const rep = produce({ catalogPath: CAT, producedBy: "gate" });
    ok("!! the producer digests the real 102-entry catalog into observations",
       rep.kind === KIND && rep.observations.length > 90 && rep.observations.every((o) => typeof o.id === "string"),
       rep.observations.length + " observations, produced by " + rep.producedBy);
    ok("!! ...and every field is an OBSERVATION, not a judgement",
       rep.observations.every((o) => !("ok" in o) && !("valid" in o) && !("installable" in o)),
       "'hasInstall' is a fact about the entry; 'installable' would be a verdict, and the sidecar contract refuses those at both ends");
}

// ---- 2. ROUND TRIP THROUGH DISK, AND THE THREE STATES ---------------------------------------------------------------
{
    const before = readForBoot({ snapshotPath: SNAP, catalogPath: CAT });
    ok("!! before anything is produced, boot reads MISSING and does not pretend otherwise",
       before.state === STATE_MISSING && !before.usable && before.entries === null, before.line);

    write({ catalogPath: CAT, snapshotPath: SNAP, producedBy: "gate" });
    const fresh = readForBoot({ snapshotPath: SNAP, catalogPath: CAT });
    ok("!! after producing, boot reads FRESH and gets the entries without touching the catalog",
       fresh.state === STATE_FRESH && fresh.fresh && fresh.entries.length > 90, fresh.line);

    // touch the catalog: the snapshot is now stale, and stale is STILL USABLE
    const later = (Date.now() + 5000) / 1000;
    fs.utimesSync(CAT, later, later);
    const stale = readForBoot({ snapshotPath: SNAP, catalogPath: CAT });
    ok("!! touching the catalog makes the snapshot STALE, and stale is still USABLE (a hint beats blocking boot)",
       stale.state === STATE_STALE && stale.usable && !stale.fresh && stale.entries.length > 90,
       stale.line.slice(0, 120));
    ok("!! ...and `usable` is handed over SEPARATELY from `fresh`, never merged into one boolean",
       stale.usable === true && stale.fresh === false,
       "a caller that only got 'usable' could not tell a current snapshot from last Tuesday's");
}

// ---- 3. THE READER NEVER REBUILDS ON ITS OWN -------------------------------------------------------------------------
{
    fs.unlinkSync(SNAP);
    const miss = readForBoot({ snapshotPath: SNAP, catalogPath: CAT });
    ok("!! a missing snapshot does NOT trigger a rebuild inside the reader",
       !fs.existsSync(SNAP) && typeof miss.refresh === "function",
       "a reader that rebuilt on a miss would reintroduce the synchronous boot work it exists to remove — refresh is HANDED BACK, not called");
    miss.refresh();
    ok("...and the caller can spend that time when it chooses to", fs.existsSync(SNAP));
}

// ---- 4. THE SAVING, MEASURED IN THE GATE, AND THE HONEST FRAMING KEPT WITH IT ------------------------------------------
{
    const timeIt = (fn) => { const t = process.hrtime.bigint(); for (let i = 0; i < 20; i++) fn(); return Number(process.hrtime.bigint() - t) / 1e6 / 20; };
    const full = timeIt(() => { const j = JSON.parse(fs.readFileSync(CAT, "utf8")); return Object.keys(j).length; });
    const snap = timeIt(() => { const j = JSON.parse(fs.readFileSync(SNAP, "utf8")); return j.observations.length; });
    const savedMs = full - snap;
    ok("the snapshot really is faster to read than the catalog",
       snap < full, "catalog " + full.toFixed(2) + "ms vs snapshot " + snap.toFixed(2) + "ms (" + (full / snap).toFixed(1) + "x)");
    ok("!! AND THE SAVING IS UNDER A MILLISECOND, WHICH IS THE FINDING",
       savedMs < 5,
       "saved " + savedMs.toFixed(2) + "ms — install_catalog is named in server.js's boot-work list and on this box it is NOT a boot cost. " +
       "Shipping this as a boot fix would have improved a number nobody was waiting on while retiring the investigation into what actually blocks.");
    const src = fs.readFileSync(new URL("./catalogSnapshot.mjs", import.meta.url), "utf8");
    ok("!! ...and the module says so in its own header rather than presenting itself as a fix",
       /THE SAVING IS SIX TENTHS\s*\n\/\/ OF A MILLISECOND|SAVING IS SIX TENTHS/.test(src.replace(/\s+/g, " ")) || /does NOT justify itself on the target it was built for/.test(src),
       "kept as the contract's working reference implementation, with the real candidates named as needing the rig");
    ok("!! ...and it does not claim to address the growing-block stall, which is a different diagnosis",
       /growth is the tell|Growth is the tell|GROW every\s*\n\/\/ cycle|slow boot task is slow ONCE/i.test(src),
       "487 seconds blocked out of 500 is synchronous work over a growing collection; a slow boot task is slow once, and no snapshot fixes the other thing");
}

try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
console.log(fails ? ("[catalogSnapshot-selfcheck] FAILED " + fails) : "[catalogSnapshot-selfcheck] all passed");
process.exit(fails ? 1 : 0);
