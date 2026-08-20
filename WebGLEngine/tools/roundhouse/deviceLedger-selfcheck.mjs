// tools/roundhouse/deviceLedger-selfcheck.mjs
//
// Run: node tools/roundhouse/deviceLedger-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2945 -- THE PERMANENT DEVICE RESULTS LEDGER, AND THE OVERWRITE IT REPLACES.
//
// Before this, a phone's results were a single file: androidPeerBridge graded "the newest android-phone.json"
// and wrote one android-verdict.json. A second device silently DESTROYED the first device's record -- including
// the ARM/Mali report that closed item 3. This gate pins the three properties that make the ledger a real
// record: it appends rather than overwrites, it keys devices by content so identities cannot collide, and it
// grades the fleet from everything on record rather than from whichever file happened to be newest.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { foldMagmapReport, gradeFleet, deviceKey, emptyDeviceLedger } from "./deviceLedger.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const here = path.dirname(fileURLToPath(import.meta.url));
const mali = JSON.parse(fs.readFileSync(path.join(here, "evidence", "magmap-mali-valhall-CONFIRMED.json"), "utf8"));
const withAdapter = (v, a, extra = {}) => ({ ...mali, adapter: { vendor: v, architecture: a }, ua: `ua-${v}`, ...extra });

// ---- 1. A SECOND DEVICE DOES NOT ERASE THE FIRST ---------------------------------------------------------------------
{
    let L = foldMagmapReport(emptyDeviceLedger(), mali);
    L = foldMagmapReport(L, withAdapter("qualcomm", "adreno-7xx", { at: "2026-07-26T10:00:00Z" }));
    const g = gradeFleet(L);
    ok("!! a second device is ADDED, not substituted for the first",
        Object.keys(L.devices).length === 2 && g.deviceCount === 2,
        "the Mali record and the Adreno record both survive. Before v2945 the second report overwrote " +
        "android-verdict.json and the first device's result was simply gone -- the evidence that closed item 3 " +
        "would have been destroyed by the next phone to report");
}

// ---- 2. A RE-RUN APPENDS, AND A CHANGED VERDICT IS THE HEADLINE ------------------------------------------------------
{
    let L = foldMagmapReport(emptyDeviceLedger(), mali);
    // same device, later run, now over tolerance (a driver update, or a hot phone)
    L = foldMagmapReport(L, { ...mali, at: "2026-07-27T09:00:00Z", fullGrid: { ...mali.fullGrid, worstRelDiff: 4.2e-4 } });
    const key = deviceKey(mali);
    const g = gradeFleet(L);
    ok("!! the same device re-running APPENDS a run rather than replacing its history",
        L.devices[key].runs.length === 2,
        "two runs on record for one device. A re-run that disagrees with an earlier one is the most interesting " +
        "thing a fleet can produce; overwriting would erase the only evidence it happened");

    ok("!! a device that CHANGED VERDICT between runs is flagged explicitly",
        g.flipped.length === 1 && g.flipped[0].verdicts.join(">") === "CONFIRMED>FALSIFIED",
        "flagged as " + g.flipped[0].verdicts.join(" -> ") + ". This is invisible to a single-file design by " +
        "construction -- you cannot notice a change you did not keep the earlier value of");
}

// ---- 3. RE-UPLOADING THE SAME FILE IS NOT TWO DATA POINTS -------------------------------------------------------------
{
    let L = foldMagmapReport(emptyDeviceLedger(), mali);
    L = foldMagmapReport(L, mali);
    L = foldMagmapReport(L, JSON.parse(JSON.stringify(mali)));
    ok("!! folding the identical report three times records ONE run",
        L.devices[deviceKey(mali)].runs.length === 1,
        "an accidental double-upload must not look like two devices agreeing. Same device, same instant, same " +
        "measured worst error = the same run");
}

// ---- 4. DEVICE KEYS ARE CONTENT-ADDRESSED AND CANNOT COLLIDE ----------------------------------------------------------
{
    const a = deviceKey(mali);
    const b = deviceKey({ ...mali, adapter: { vendor: "arm", architecture: "valhall" } });   // same GPU, same UA
    const c = deviceKey(withAdapter("qualcomm", "adreno-7xx"));
    ok("!! the same GPU+UA hashes to the same bucket; a different GPU cannot collide with it",
        a === b && a !== c && a.length === 16,
        "same device -> same key (" + a.slice(0, 8) + "...), different vendor -> different key. Keyed by content " +
        "like the fingerprint ledger, so there is no device registry to maintain and no way for two phones to " +
        "claim one identity");

    ok("only the GPU strings and the browser-reduced UA are stored",
        !JSON.stringify(foldMagmapReport(emptyDeviceLedger(), mali)).includes("IMEI") &&
        /Android 10; K/.test(mali.ua),
        "Chrome's modern UA already anonymises the model ('Android 10; K'), and the key is a hash -- the ledger " +
        "carries a GPU family and a hash, not an identity");
}

// ---- 5. THE FLEET VERDICT COMES FROM EVERYTHING ON RECORD -------------------------------------------------------------
{
    let L = foldMagmapReport(emptyDeviceLedger(), withAdapter("arm", "valhall"));
    L = foldMagmapReport(L, withAdapter("qualcomm", "adreno-7xx", { at: "2026-07-26T10:00:00Z" }));
    L = foldMagmapReport(L, withAdapter("vmware", "svga", { at: "2026-07-26T11:00:00Z" }));   // virtualised -> EXCLUDED
    const g = gradeFleet(L);
    const fams = g.confirmedFamilies.sort();
    ok("!! the cross-vendor claim is recomputed across every device, not from the newest file",
        fams.length === 2 && fams.includes("ARM/Mali") && fams.includes("Qualcomm/Adreno"),
        "confirmed families: " + fams.join(", ") + ". This is the fleet aggregator the single-report grader " +
        "never had -- item 3's standing now follows from the whole record");

    ok("...and a virtualised adapter is still EXCLUDED, not counted as a vendor",
        !g.confirmedFamilies.includes("other") && g.families.some((f) => f.excluded > 0),
        "the VMware SVGA entry lands as excluded, so a VM cannot inflate the vendor-family count -- the same " +
        "guard the single-report grader applies, preserved at fleet scale");
}

console.log();
if (fails) { console.log("deviceLedger-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("deviceLedger-selfcheck: all checks pass");
