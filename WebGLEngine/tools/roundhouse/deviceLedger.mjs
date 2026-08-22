// tools/roundhouse/deviceLedger.mjs
//
// v2945 -- THE PERMANENT DEVICE RESULTS LEDGER. Until now a phone's results were a SINGLE FILE that the next
// phone overwrote: androidPeerBridge grades "the newest android-phone.json" and writes one android-verdict.json.
// So a second device silently destroyed the first device's record -- including the ARM/Mali report that closed
// item 3. This ledger keeps every device's every run, permanently, and grades the FLEET across all of them.
//
// THE DESIGN FOLLOWS THE FINGERPRINT LEDGER'S TWO RULES (tools/ledger/ledger.mjs), for the same reasons:
//
//   1. CONTENT-ADDRESSED DEVICE KEYS. A device is keyed by a hash of (vendor | architecture | UA), not by a name
//      someone types. The same phone re-running lands in the same bucket and appends a run; a different GPU is a
//      different key and can never collide with it. No device registry to maintain, no duplicate identities.
//
//   2. APPEND, NEVER OVERWRITE. A re-run is a NEW RUN under the same device, not a replacement. That matters
//      because a device changing its answer is exactly the interesting event -- a driver update that moves the
//      worst error, a phone that passed cold and fails hot. Overwriting would erase the only evidence of it.
//
// AND ONE RULE OF ITS OWN:
//
//   3. THE LEDGER STORES WHAT WAS REPORTED **AND** WHAT THE DESKTOP GRADED, SEPARATELY. The device's raw numbers
//      go in as reported; the verdict is computed HERE by gradeMagmapReport and stored beside them. A device can
//      never write its own verdict into the fleet record -- the same phone-measures / desktop-adjudicates split
//      the persistence ledger and the ballot both keep.
//
// Privacy: the key is a HASH, and only the GPU vendor/architecture and Chrome's already-reduced UA are stored.
// Chrome's modern UA reports "Android 10; K" -- the model is anonymised by the browser before we ever see it.

import crypto from "node:crypto";
import { gradeMagmapReport, gpuFamily, isMobileAdapter } from "./magmapReport.mjs";

export const DEVICE_LEDGER_KIND = "swek-device-results-ledger";

/** Stable, content-addressed device key. Same GPU + same UA = same device bucket, across runs and versions. */
export function deviceKey({ adapter = {}, ua = "" } = {}) {
    const basis = [adapter.vendor || "?", adapter.architecture || "?", ua || "?"].join("|");
    return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 16);
}

export function emptyDeviceLedger() { return { kind: DEVICE_LEDGER_KIND, version: 1, devices: {} }; }

/**
 * Fold one magmap GPU report into the ledger. Returns the updated ledger (pure; caller persists).
 *
 * The report's own numbers are stored as REPORTED; the verdict is computed here and stored as GRADED. If the
 * exact same run (same device, same timestamp, same worst error) is folded twice -- re-uploading the same file --
 * it is recognised and not duplicated, because an accidental double-upload should not look like two devices
 * agreeing.
 */
export function foldMagmapReport(ledger, report, { engineVersion = null } = {}) {
    const out = ledger && ledger.devices ? { ...ledger, devices: { ...ledger.devices } } : emptyDeviceLedger();
    const key = deviceKey(report);
    const fam = gpuFamily(report.adapter || {});
    const graded = gradeMagmapReport(report);
    const at = report.at || new Date().toISOString();
    const fullWorst = report.fullGrid && Number.isFinite(report.fullGrid.worstRelDiff) ? report.fullGrid.worstRelDiff : null;

    const dev = out.devices[key] ? { ...out.devices[key], runs: [...out.devices[key].runs] } : {
        key,
        family: fam.family, mobile: isMobileAdapter(report.adapter || {}),
        adapter: { vendor: (report.adapter || {}).vendor || null, architecture: (report.adapter || {}).architecture || null },
        ua: report.ua || null,
        firstSeen: at,
        runs: [],
    };

    // idempotent re-upload: same instant + same measured worst is the same run, not a second data point
    const dup = dev.runs.some((r) => r.at === at && r.reported.fullGridWorst === fullWorst && r.kind === "magmap");
    if (!dup) {
        dev.runs.push({
            kind: "magmap", at, engineVersion,
            reported: {
                fullGridWorst: fullWorst,
                fullGridCells: report.fullGrid ? report.fullGrid.cells : null,
                sampledWorst: report.adjudication ? report.adjudication.worstRelDiff : null,
                tol: report.tol ?? null, floor: report.floor ?? null,
                fellBack: report.fellBack ?? null,
                cfgN: report.cfg ? report.cfg.n : null,
            },
            graded: { verdict: graded.verdict, why: graded.why },
        });
    }
    dev.lastSeen = at > (dev.lastSeen || "") ? at : dev.lastSeen;
    out.devices[key] = dev;
    return out;
}

/**
 * Grade the FLEET. This is the aggregator the single-report grader never had: across every device in the
 * ledger, which vendor families have CONFIRMED, and does the kernel's cross-vendor claim hold?
 *
 * The claim item 3 registered needs ONE mobile GPU from a second vendor family under tolerance. With a ledger
 * we can say much more: how many families, which disagreed, and whether any device changed its mind between
 * runs -- the last being the most interesting signal a fleet can produce, and one a single overwritten file
 * could never show.
 */
export function gradeFleet(ledger) {
    const devices = Object.values((ledger && ledger.devices) || {});
    const families = {};
    const flipped = [];
    for (const d of devices) {
        const magmaps = d.runs.filter((r) => r.kind === "magmap");
        if (!magmaps.length) continue;
        const verdicts = magmaps.map((r) => r.graded.verdict);
        const latest = verdicts[verdicts.length - 1];
        // a device whose verdict CHANGED across runs is the headline event -- driver update, thermal, anything
        if (new Set(verdicts).size > 1) flipped.push({ key: d.key, family: d.family, verdicts });
        const f = (families[d.family] ||= { family: d.family, confirmed: 0, falsified: 0, excluded: 0, devices: 0 });
        f.devices++;
        if (latest === "CONFIRMED") f.confirmed++;
        else if (latest === "FALSIFIED") f.falsified++;
        else f.excluded++;
    }
    const confirmedFamilies = Object.values(families).filter((f) => f.confirmed > 0).map((f) => f.family);
    return {
        deviceCount: devices.length,
        families: Object.values(families),
        confirmedFamilies,
        // item 3's standing, recomputed from the whole fleet rather than from whichever file was newest
        crossVendor: confirmedFamilies.length >= 1
            ? { verdict: "CONFIRMED", why: `${confirmedFamilies.length} vendor famil${confirmedFamilies.length > 1 ? "ies" : "y"} passed full-grid under tolerance: ${confirmedFamilies.join(", ")}` }
            : { verdict: "AWAITING", why: "no mobile GPU vendor family has passed full-grid under tolerance yet" },
        flipped,
    };
}

export function fleetLines(g) {
    const lines = [`  fleet: ${g.deviceCount} device(s), ${g.confirmedFamilies.length} vendor famil(y/ies) confirmed`];
    for (const f of g.families) lines.push(`    ${f.family.padEnd(18)} devices ${f.devices}  confirmed ${f.confirmed}  falsified ${f.falsified}  excluded ${f.excluded}`);
    for (const fl of g.flipped) lines.push(`    !! ${fl.family} device ${fl.key} CHANGED VERDICT across runs: ${fl.verdicts.join(" -> ")}`);
    lines.push(`  cross-vendor claim: ${g.crossVendor.verdict} -- ${g.crossVendor.why}`);
    return lines;
}

// ---- CLI: upload a device's report into the permanent ledger, then grade the fleet --------------------------------
// Usage:
//   node tools/roundhouse/deviceLedger.mjs add <magmap-report.json> [ledger.json]   -- append one device's run
//   node tools/roundhouse/deviceLedger.mjs fleet [ledger.json]                      -- grade the whole fleet
// Default ledger path: tools/roundhouse/device-ledger.json. `add` is APPEND-ONLY -- it never overwrites another
// device's record, and re-adding the identical file is recognised rather than counted twice.
import { fileURLToPath as _fu2 } from "node:url";
import _p2 from "node:path";
import _fs2 from "node:fs";
if (process.argv[1] && _fu2(import.meta.url) === _p2.resolve(process.argv[1])) {
    const [cmd, a, b] = process.argv.slice(2);
    const LEDGER = (x) => x || _p2.join(_p2.dirname(_fu2(import.meta.url)), "device-ledger.json");
    const load = (f) => { try { return JSON.parse(_fs2.readFileSync(f, "utf8")); } catch { return emptyDeviceLedger(); } };
    if (cmd === "add") {
        if (!a) { console.error("usage: deviceLedger.mjs add <magmap-report.json> [ledger.json]"); process.exit(2); }
        const f = LEDGER(b);
        const before = load(f);
        const report = JSON.parse(_fs2.readFileSync(a, "utf8"));
        const after = foldMagmapReport(before, report);
        _fs2.writeFileSync(f, JSON.stringify(after, null, 2) + "\n");
        const k = deviceKey(report);
        console.log(`device ${k} (${after.devices[k].family}) -- ${after.devices[k].runs.length} run(s) on record`);
        console.log(`ledger -> ${f}`);
        for (const ln of fleetLines(gradeFleet(after))) console.log(ln);
    } else if (cmd === "fleet") {
        for (const ln of fleetLines(gradeFleet(load(LEDGER(a))))) console.log(ln);
    } else { console.error("usage: deviceLedger.mjs <add|fleet> ..."); process.exit(2); }
}
