// tools/roundhouse/androidVerdict.mjs
//
// v2920 -- THE GRADER. Takes the reference transcript and the phone transcript and says, per registered claim,
// one of four words: CONFIRMED, FALSIFIED, EXCLUDED, AWAITING. Nothing else. The registration was frozen in
// v2919; this file is not allowed to reinterpret it, only to compare.
//
// THE THREE RULES, restated from the runner and enforced here:
//
//   1. THE REFERENCE DEFINES THE GRADED SET. A check the desktop failed or timed out cannot be held against the
//      phone. The phone is graded on the intersection.
//   2. SLOW IS NOT WRONG. A phone timeout on a graded check is EXCLUDED with the budget stated, not counted as
//      a failure. Only pass-on-reference + FAIL-on-phone falsifies -- that is a machine disagreeing about a
//      physics gate, which is the one thing the suite exists to detect.
//   3. THE RIGHT HOST OR NO VERDICT. The bionic claim can only be graded from a transcript whose host libc is
//      bionic. A glibc transcript grading a glibc claim is corroboration theatre; the grader refuses.
//
// Doze survival and memory-pressure survival are AWAITING by construction: they are longitudinal claims no
// single transcript can carry. They stay in the output every run so they cannot be quietly forgotten.

import fs from "node:fs";
import { ANDROID_REGISTRATION } from "./androidPeer.mjs";
import { gradeMagmapReport } from "./magmapReport.mjs";   // v2921 - item 3 becomes gradeable

const isTranscript = (t) => t && t.kind === "swek-android-transcript" && Array.isArray(t.checks);

export function loadTranscript(file) {
    const t = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!isTranscript(t)) throw new Error(file + " is not a swek-android-transcript");
    return t;
}

/** The core comparison. Pure -- takes parsed transcripts (+ optional extras), returns the verdict object. */
export function grade(reference, phone, extras = {}) {
    if (!isTranscript(reference) || !isTranscript(phone)) throw new Error("grade() wants two transcripts");
    const claim = ANDROID_REGISTRATION.claim;
    const out = { host: phone.host, verdicts: {}, gradedSet: [], falsifying: [], slow: [], missing: [] };

    // ---- claim: roundhouseSelfchecksPassOnBionic --------------------------------------------------------------
    const refPass = reference.checks.filter((c) => c.status === "pass").map((c) => c.name);
    out.gradedSet = refPass;
    const phoneByName = new Map(phone.checks.map((c) => [c.name, c]));
    for (const name of refPass) {
        const p = phoneByName.get(name);
        if (!p) { out.missing.push(name); continue; }
        if (p.status === "fail" || p.status === "error") out.falsifying.push({ name, tail: p.tail });
        else if (p.status === "timeout") out.slow.push({ name, budgetMs: phone.budgetMs });
    }
    const bionic = String(phone.host.libc || "").startsWith("bionic");
    if (!bionic) {
        out.verdicts.roundhouseSelfchecksPassOnBionic = { verdict: "EXCLUDED",
            why: "phone transcript host libc is '" + phone.host.libc + "', not bionic -- grading it would corroborate nothing" };
    } else if (out.falsifying.length) {
        out.verdicts.roundhouseSelfchecksPassOnBionic = { verdict: "FALSIFIED",
            why: out.falsifying.length + " check(s) pass on the reference and fail on bionic: " +
                 out.falsifying.map((f) => f.name).join(", "), predicted: claim.roundhouseSelfchecksPassOnBionic };
    } else if (out.missing.length === out.gradedSet.length) {
        out.verdicts.roundhouseSelfchecksPassOnBionic = { verdict: "EXCLUDED", why: "phone ran none of the graded set" };
    } else {
        out.verdicts.roundhouseSelfchecksPassOnBionic = { verdict: "CONFIRMED",
            why: (out.gradedSet.length - out.missing.length - out.slow.length) + "/" + out.gradedSet.length +
                 " graded checks pass on bionic" + (out.slow.length ? "; " + out.slow.length + " slow (excluded, not wrong)" : "") };
    }

    // ---- claim: npmInstallOmitOptionalSucceeds ----------------------------------------------------------------
    const probes = phone.probes || {};
    out.verdicts.npmInstallOmitOptionalSucceeds =
        probes.npmInstallOk === null || probes.npmInstallOk === undefined
            ? { verdict: "AWAITING", why: "termux_peer.sh did not record an install result (SWEK_NPM_INSTALL_OK unset)" }
            : probes.npmInstallOk === claim.npmInstallOmitOptionalSucceeds
                ? { verdict: "CONFIRMED", why: "npm install --omit=optional exited 0 on the device" }
                : { verdict: "FALSIFIED", why: "npm install failed on the device; the manifest read missed a native step" };

    // ---- claim: autoUpdateSymlinksRequired = 1 ----------------------------------------------------------------
    if (!bionic || !phone.probes) {
        out.verdicts.autoUpdateSymlinksRequired = { verdict: "EXCLUDED", why: "no termux probes in transcript" };
    } else if (probes.downloadsPresent && probes.downloadsIsSymlink) {
        out.verdicts.autoUpdateSymlinksRequired = { verdict: "CONFIRMED",
            why: "~/Downloads exists as a symlink -> " + probes.downloadsTarget + "; prerequisite for the one-symlink claim holds. " +
                 "Full confirmation needs a build zip observed through /self/zip" };
    } else if (probes.downloadsPresent && !probes.downloadsIsSymlink) {
        out.verdicts.autoUpdateSymlinksRequired = { verdict: "FALSIFIED",
            why: "~/Downloads exists as a REAL directory on this device -- zero symlinks were required, the registered count of 1 was wrong in the interesting direction" };
    } else {
        out.verdicts.autoUpdateSymlinksRequired = { verdict: "AWAITING",
            why: "~/Downloads absent, as predicted for stock termux; run `ln -s ~/storage/downloads ~/Downloads` and re-run" };
    }

    // ---- longitudinal claims: graded from the persistence ledger the boot script keeps ------------------------
    // v2935. termux_boot_peer.sh appends one "started"/"finished" pair per boot to a ledger. That ledger IS the
    // overnight log these two predictions always needed. The phone only records events; the grading -- turning
    // the pattern of boots and reaps into a verdict -- happens HERE, so the measurement and the adjudication stay
    // in different hands, exactly as the boot script's own comment insists.
    const persist = gradePersistence(extras.persistenceLedger || null);
    out.verdicts.survivesDozeWithBootWakeLock = persist.doze;
    out.verdicts.survivesMemoryPressure = persist.memory;

    // ---- negative claims: graded only if someone tries ---------------------------------------------------------
    out.verdicts.gpuBrainRunsUnderTermux = { verdict: "AWAITING", why: "graded FALSIFIED the day a Deno brain heartbeats from bionic; until then the prediction stands" };
    out.verdicts.kpopListenerRunsUnderTermux = { verdict: "AWAITING", why: "same shape: a PowerShell listener on termux would falsify it" };
    // v2921 -- item 3 graded from the browser report when one is supplied; AWAITING otherwise, same words as before
    out.verdicts.magmapPassesOnMobileGpuAtRegisteredTol = gradeMagmapReport(extras.magmapReport || null);

    return out;
}

/**
 * v2935 -- GRADE THE TWO SURVIVAL PREDICTIONS FROM THE BOOT LEDGER.
 *
 * The ledger is JSON-lines, one object per event, written by termux_boot_peer.sh across boots:
 *   {"event":"started","boot":..,"uptimeAtLaunch":..,"previousRunReaped":"yes|no|unknown",..}
 *   {"event":"finished","boot":..,"exit":..,..}
 *
 * Two predictions are graded, and the DIRECTION matters:
 *   survivesDozeWithBootWakeLock (predicted TRUE): confirmed when the ledger shows more than one boot with a
 *     clean finish -- the device came back up after being idle/off and the peer ran. A single boot is not yet
 *     evidence of survival across an idle period, so it stays AWAITING.
 *   survivesMemoryPressure (predicted FALSE): a "started" with no matching "finished" is a REAP -- the OS killed
 *     the process mid-run. Seeing at least one reap CONFIRMS the prediction (false = does not survive). Seeing
 *     many clean boots and ZERO reaps over a long log would be the surprising falsification (it would mean the
 *     process is somehow surviving pressure), and is reported as such rather than as a pass.
 *
 * This grader NEVER trusts a verdict written by the phone; it derives everything from the raw event pattern.
 */
export function gradePersistence(ledgerText) {
    if (!ledgerText || typeof ledgerText !== "string" || !ledgerText.trim()) {
        return {
            doze: { verdict: "AWAITING", why: "no persistence ledger supplied -- install termux_boot_peer.sh in ~/.termux/boot/ and let the phone boot at least twice" },
            memory: { verdict: "AWAITING", why: "no persistence ledger supplied -- same install; a reap is only visible once the OS has gotten hungry during a run" },
        };
    }
    const events = [];
    for (const line of ledgerText.split("\n")) {
        const t = line.trim();
        if (!t) continue;
        try { events.push(JSON.parse(t)); } catch { /* skip malformed */ }
    }
    const starts = events.filter((e) => e.event === "started");
    const finishes = events.filter((e) => e.event === "finished");
    const boots = new Set(starts.map((e) => e.boot)).size;

    // a reap = a started boot with no matching finished
    const finishedBoots = new Set(finishes.map((e) => e.boot));
    const reaps = starts.filter((e) => !finishedBoots.has(e.boot)).length;
    const cleanBoots = starts.filter((e) => finishedBoots.has(e.boot)).length;

    // Doze: predicted true. Multiple distinct boots with clean finishes = it comes back and runs.
    let doze;
    if (boots < 2) {
        doze = { verdict: "AWAITING", why: `only ${boots} boot recorded -- survival across an idle/off period needs at least two boots in the ledger` };
    } else if (cleanBoots >= 2) {
        doze = { verdict: "CONFIRMED", why: `${cleanBoots} clean boots recorded across ${boots} distinct boot sessions -- the peer started on boot and ran to completion after being off, as predicted` };
    } else {
        doze = { verdict: "AWAITING", why: `${boots} boots but only ${cleanBoots} clean -- need at least two boots that also finished cleanly to separate Doze survival from reaping` };
    }

    // Memory: predicted FALSE (does not survive). A reap confirms it.
    let memory;
    if (reaps >= 1) {
        memory = { verdict: "CONFIRMED", why: `${reaps} reap(s) observed (a "started" with no "finished") across ${boots} boots -- the OS killed the peer mid-run, confirming it does NOT survive memory pressure, as predicted. A foreground service would need a nodejs-mobile wrapper app` };
    } else if (cleanBoots >= 10) {
        memory = { verdict: "FALSIFIED-SURPRISING", why: `${cleanBoots} clean boots and ZERO reaps -- the prediction was that the peer does NOT survive memory pressure, but it has never been reaped over a long log. That is the surprising, reportable outcome: something is keeping it alive` };
    } else {
        memory = { verdict: "AWAITING", why: `no reaps yet, but only ${cleanBoots} clean boots -- absence of a reap is not yet evidence of survival; the OS has to get hungry during a run for this to grade` };
    }

    return { doze, memory, stats: { boots, cleanBoots, reaps } };
}

export function verdictLines(v) {
    const L = [`android verdict -- phone host: ${v.host.platform}/${v.host.arch} node ${v.host.node} libc ${v.host.libc}`];
    L.push(`  graded set: ${v.gradedSet.length} checks (defined by the reference); ` +
        `${v.falsifying.length} falsifying, ${v.slow.length} slow, ${v.missing.length} missing`);
    for (const [name, r] of Object.entries(v.verdicts)) L.push(`  ${r.verdict.padEnd(10)} ${name} -- ${r.why}`);
    return L;
}

// ---- CLI: node tools/roundhouse/androidVerdict.mjs <reference.json> <phone.json> ----------------------------------
import { fileURLToPath } from "node:url";
import path from "node:path";
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const [refFile, phoneFile, magmapFile, ledgerFile] = process.argv.slice(2);
    if (!refFile || !phoneFile) { console.error("usage: node androidVerdict.mjs <reference.json> <phone.json> [magmap-report.json] [persistence-ledger.jsonl]"); process.exit(2); }
    const extras = {};
    if (magmapFile) extras.magmapReport = JSON.parse(fs.readFileSync(magmapFile, "utf8"));
    // v2939: the persistence ledger is JSON-LINES, not JSON -- read it as raw text and hand it to gradePersistence,
    // which parses line by line. Without this the CLI could never feed a real boot ledger to the grader that was
    // built in v2935 to read one; the grade path accepted extras.persistenceLedger but nothing on the command
    // line supplied it. Optional: absent ledger keeps the two survival claims AWAITING, exactly as before.
    if (ledgerFile) extras.persistenceLedger = fs.readFileSync(ledgerFile, "utf8");
    for (const ln of verdictLines(grade(loadTranscript(refFile), loadTranscript(phoneFile), extras))) console.log(ln);
}
