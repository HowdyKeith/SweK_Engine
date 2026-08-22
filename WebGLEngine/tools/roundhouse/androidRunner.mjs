// tools/roundhouse/androidRunner.mjs
//
// v2920 -- THE BALLOT. A phone cannot falsify a registration by being talked about; it needs something to run
// that produces an artifact a grader can score. This is that artifact's producer.
//
// WHAT IT DOES. Discovers every *-selfcheck.mjs in tools/roundhouse, runs each as a child `node <file>` from the
// engine root under a per-check time budget, and writes ONE JSON transcript: host fingerprint (platform, arch,
// node, and which libc -- the whole question), then per check {status, ms, tail}. The same runner produces the
// desktop REFERENCE transcript and the phone transcript, with the same budget, so the diff between them is a
// diff of machines and not of harnesses.
//
// THE GRADED SET IS DEFINED BY THE REFERENCE, NOT BY HOPE. A check that fails or times out on the desktop is
// EXCLUDED from what the phone is graded on -- the phone cannot falsify a claim the reference machine never
// established. And a phone TIMEOUT on a graded check is SLOW, NOT WRONG: a phone is allowed to be slower than a
// desktop without that counting as a physics disagreement. Only a check that PASSES on the reference and FAILS
// on the phone falsifies roundhouseSelfchecksPassOnBionic. androidVerdict.mjs enforces exactly this.
//
// LIBC DETECTION, THE HONEST WAY. Node's own process.report carries glibcVersionRuntime when the binary runs on
// glibc. Termux's Node is built against bionic and sets TERMUX_VERSION / a com.termux PREFIX. Anything else is
// reported as what it is: unidentified. The verdict refuses to grade the bionic claim from a transcript whose
// host is not bionic -- a second glibc run confirming glibc would be the echo chamber this lab exists to avoid.
//
// PROBES. On a Termux host the runner also records the two cheap facts the registration cares about:
//   downloadsPresent / downloadsIsSymlink   -- grades the one-symlink auto-update claim's prerequisite
//   npmInstallOk (from SWEK_NPM_INSTALL_OK) -- termux_peer.sh sets it from the actual `npm install` exit code
// Doze and memory-pressure survival are LONGITUDINAL -- no single run can measure them -- and stay manual.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENGINE_ROOT = path.resolve(HERE, "..", "..");
// *** v3919 -- THIS IS THE FOURTH GATE RUNNER AND THE SECOND FLAT 180000, AND THE NAME COLLIDES. ***
//
// tools/ship/gateBudget.mjs ALSO exports DEFAULT_BUDGET_MS, and it is 139917, derived as 3x the slowest general
// gate. Two constants with one name and different values is this tree's most repeated defect wearing its most
// convincing disguise: whichever one you are reading looks authoritative.
//
// THIS ONE IS DELIBERATELY NOT THE TABLE, and that is a claim about hardware rather than about gates. The host
// table's numbers are MEASURED ON THIS MACHINE -- census 717s, levelClaim 1058s -- and an Android device is a
// different machine class, so importing them would apply a limit to a thing it was never measured against,
// which is the drift gateBudget itself was written about at v3212. What is wrong is not the number, it is that
// nothing said the number was a separate decision. It says so now, and budgetIsOwn declares it so the runner
// census can tell a REASONED exception from a runner nobody wired up.
export const budgetIsOwn =
    "an Android device is a different machine class from the host the MEASURED table was timed on, so this " +
    "runner sets one flat per-device budget rather than importing host timings; the number is a hardware claim " +
    "and is overridable from argv[3]. THIS IS THE DECISION rigRunner FAILED TO MAKE -- it carried the same flat " +
    "180000 with no reason attached, and twenty gates could never pass on rig.html because of it.";
export const DEFAULT_BUDGET_MS = 180000;   // one budget, both machines; defaultPlacementSweep (~4 min) excludes itself on both

export function detectLibc() {
    try {
        const glibc = process.report && process.report.getReport().header.glibcVersionRuntime;
        if (glibc) return "glibc " + glibc;
    } catch {}
    if (process.env.TERMUX_VERSION || /com\.termux/.test(process.env.PREFIX || "")) return "bionic (termux)";
    return "unidentified";
}

export function hostFingerprint() {
    return {
        platform: process.platform, arch: process.arch, node: process.version,
        osRelease: os.release(), cpus: os.cpus().length, totalMemMB: Math.round(os.totalmem() / 1048576),
        libc: detectLibc(),
    };
}

export function termuxProbes() {
    const home = os.homedir();
    const dl = path.join(home, "Downloads");
    let present = false, isSymlink = false, target = null;
    try { present = fs.existsSync(dl); isSymlink = fs.lstatSync(dl).isSymbolicLink(); if (isSymlink) target = fs.readlinkSync(dl); } catch {}
    const npmEnv = process.env.SWEK_NPM_INSTALL_OK;
    return {
        downloadsPresent: present, downloadsIsSymlink: isSymlink, downloadsTarget: target,
        npmInstallOk: npmEnv === undefined ? null : npmEnv === "1",
    };
}

export function discoverChecks(dir = HERE) {
    return fs.readdirSync(dir).filter((f) => f.endsWith("-selfcheck.mjs")).sort()
        .map((f) => ({ name: f.replace("-selfcheck.mjs", ""), file: path.join("tools", "roundhouse", f) }));
}

function runOne(check, budgetMs) {
    return new Promise((resolve) => {
        const t0 = Date.now();
        const child = spawn(process.execPath, [check.file], { cwd: ENGINE_ROOT, stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        const cap = (d) => { out += d; if (out.length > 20000) out = out.slice(-20000); };
        child.stdout.on("data", cap); child.stderr.on("data", cap);
        const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, budgetMs);
        child.on("close", (code, signal) => {
            clearTimeout(timer);
            const ms = Date.now() - t0;
            const lines = out.trim().split("\n");
            const status = signal === "SIGKILL" ? "timeout" : code === 0 ? "pass" : "fail";
            resolve({ name: check.name, status, ms, exitCode: code, tail: lines[lines.length - 1] || "" });
        });
        child.on("error", () => { clearTimeout(timer); resolve({ name: check.name, status: "error", ms: Date.now() - t0, exitCode: null, tail: "spawn failed" }); });
    });
}

export async function runSuite({ budgetMs = DEFAULT_BUDGET_MS, concurrency = 4, only = null, log = null } = {}) {
    let checks = discoverChecks();
    if (only) checks = checks.filter((c) => only.includes(c.name));
    const results = [];
    let i = 0;
    async function worker() {
        while (i < checks.length) {
            const c = checks[i++];
            const r = await runOne(c, budgetMs);
            results.push(r);
            if (log) log(`  ${r.status.toUpperCase().padEnd(7)} ${r.name}  ${(r.ms / 1000).toFixed(1)}s`);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, checks.length) }, worker));
    results.sort((a, b) => a.name.localeCompare(b.name));
    const host = hostFingerprint();
    return {
        kind: "swek-android-transcript", version: 2920, at: new Date().toISOString(),
            // v3028 -- WAS A SERVER RUNNING ON THIS PHONE WHILE THIS RAN? A timing taken alongside an HTTP
            // server is NOT comparable to one taken without: the suite is 15-25 minutes of lattice work, and a
            // polling browser or a peer probe landing in the middle changes the number. This tree already refuses
            // to compare across engine versions (v2984) and across architectures whose environments do not match
            // (v2998); a co-running server is the same class of confound. So it is STAMPED rather than assumed
            // absent. SERVING IS ALLOWED. SERVING INVISIBLY IS NOT.
            servedWhileRunning: servedMarker(),
            // v3029 -- KEITH'S POLICY, MADE MECHANICAL. A run taken while this phone was serving is DIAGNOSTIC:
            // useful for watching, useless for comparing. Rather than leaving that as a convention somebody
            // remembers, the transcript CLASSIFIES ITSELF and anything that compares runs reads the class.
            //
            // A convention is a rule that holds until the day someone is in a hurry. This is the same move the
            // fleet benchmark makes when it returns INCOMPARABLE across engine versions: the refusal lives in
            // the data, not in the discipline of whoever is reading it.
            runClass: servedMarker() === true ? "diagnostic" : servedMarker() === null ? "unclassified" : "comparable",
        budgetMs, host,
        probes: host.libc.startsWith("bionic") ? termuxProbes() : null,
        checks: results,
        counts: {
            pass: results.filter((r) => r.status === "pass").length,
            fail: results.filter((r) => r.status === "fail").length,
            timeout: results.filter((r) => r.status === "timeout").length,
            error: results.filter((r) => r.status === "error").length,
        },
    };
}

// ---- CLI: node tools/roundhouse/androidRunner.mjs [outFile] [budgetSeconds] ---------------------------------------
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const outFile = process.argv[2] || path.join(ENGINE_ROOT, "tools", "roundhouse",
        `android-${detectLibc().startsWith("bionic") ? "phone" : "reference"}.json`);
    const budgetMs = process.argv[3] ? Number(process.argv[3]) * 1000 : DEFAULT_BUDGET_MS;
    console.log(`androidRunner -- host: ${JSON.stringify(hostFingerprint())}`);
    const t = await runSuite({ budgetMs, log: console.log });
    fs.writeFileSync(outFile, JSON.stringify(t, null, 2));

    // v3027 -- A LOCAL VIEW THE PHONE CAN ACTUALLY OPEN.
    //
    // Keith asked whether an Android peer, while doing GPU brain work, can go to the brain view and see its OWN
    // data. IT COULD NOT. termux_peer.sh runs THIS RUNNER, never server.js -- the phone has Node but NO HTTP
    // SERVER, so every /ai/brain/* view belongs to the hub and shows the HUB's brain. The phone produced a JSON
    // file it had no way to look at, on a device where reading raw JSON means installing a text editor.
    //
    // SELF-CONTAINED ON PURPOSE: the data is embedded, there is no fetch, no CDN and no server to reach. A view
    // that tried to load anything would fail on the one device it was written for.
    //
    // AND IT REPORTS MEASUREMENTS, NOT A VERDICT. The phone MEASURES; the desktop GRADES -- that separation is
    // why the device ledger is trustworthy at all (v2942, v2945). A local page showing "PASS" as a judgement
    // would let a device write its own grade, so the counts are labelled as what this run OBSERVED and the page
    // says plainly where the adjudication happens.
    try { fs.writeFileSync(outFile.replace(/\.json$/i, "") + ".html", transcriptHtml(t)); } catch {}
    console.log(`\n  ${t.counts.pass} pass, ${t.counts.fail} fail, ${t.counts.timeout} timeout, ${t.counts.error} error`);
    console.log(`  transcript -> ${outFile}`);
}

/** A standalone page: no fetch, no server, no dependencies. Opened straight off the filesystem. */
function transcriptHtml(t) {
    const esc = (x) => String(x == null ? "" : x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const c = t.counts || {};
    const rows = (t.checks || []).map((r) => {
        const col = r.status === "pass" ? "#7fe0a4" : r.status === "fail" ? "#f28b8b"
                  : r.status === "timeout" ? "#e6c877" : "#9fb8ab";
        return '<tr><td style="color:' + col + ';padding:2px 8px 2px 0">' + esc(r.status) + "</td><td>" + esc(r.name) +
               '</td><td style="color:#6f8a7c;text-align:right">' + esc(r.ms == null ? "" : r.ms + "ms") + "</td></tr>";
    }).join("");
    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1"><title>SweK peer run</title>' +
        "<style>body{margin:0;background:#0b110e;color:#cfe9d8;font:13px/1.6 ui-monospace,Menlo,Consolas,monospace}" +
        "header{padding:12px 14px;border-bottom:1px solid #24382e}h1{font-size:15px;margin:0 0 4px;color:#9fe8c0}" +
        "main{padding:12px 14px}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #16211b;vertical-align:top}" +
        ".n{color:#6f8a7c;font-size:11px}</style></head><body>" +
        "<header><h1>SweK peer run &mdash; this device</h1>" +
        '<div class="n">' + esc(t.host && t.host.model || "android") + " &middot; " + esc(t.host && t.host.arch || "?") +
        " &middot; " + esc(t.at) + "</div>" +
        // The separation of powers, said on the page rather than assumed.
        // v3028 -- if a server was up during the run, SAY SO HERE FIRST. The person reading this page is the
        // one most likely to compare it against a run taken without one.
        (t.servedWhileRunning === true
            ? '<div class="n" style="margin-top:6px;color:#e6c877">SERVED WHILE RUNNING &mdash; this phone was ' +
              "hosting the engine during the suite. The timings are real but NOT comparable to a run taken with " +
              "nothing else on the device.</div>"
            : t.servedWhileRunning === null
                ? '<div class="n" style="margin-top:6px;color:#7c93b8">could not determine whether a server was running</div>'
                : "") +
        '<div class="n" style="margin-top:6px;color:#e6c877">These are MEASUREMENTS taken on this device. ' +
        "The verdict is not decided here &mdash; the hub grades this transcript against the reference, which is why " +
        "a device cannot write its own result.</div></header><main>" +
        "<div>" + (c.pass || 0) + " passed &middot; " + (c.fail || 0) + " failed &middot; " +
        (c.timeout || 0) + " timed out &middot; " + (c.error || 0) + " errored</div>" +
        '<div class="n">a TIMEOUT is not a failure: it is a check that did not finish inside the budget, and on a ' +
        "phone that is usually the phone, not the physics.</div>" +
        "<table>" + rows + "</table></main></body></html>";
}

/** Did termux_serve.sh have this phone serving while the suite ran? null when it cannot be determined. */
function servedMarker() {
    try { return fs.existsSync(path.join(process.cwd(), "tools", "roundhouse", ".serving-on-phone")); }
    catch { return null; }   // unknown is not false -- a stamp that guessed would be worse than none
}
