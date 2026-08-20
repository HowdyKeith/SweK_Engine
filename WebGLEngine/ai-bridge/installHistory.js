// FILE: ai-bridge/installHistory.js
// VERSION: v1 -- v3247
//
// HOW LONG DID THAT TAKE, MEASURED FROM THE SIDE THAT CAN SEE IT.
//
// v3246 timed the update button and said plainly what it could NOT see: the restart happens in a process the
// page is about to lose contact with, so the browser's last measurable moment is "request accepted". And a
// MANUAL extract-and-rerun is invisible to a browser entirely -- nobody has the page open while they unzip.
//
// *** THE SERVER CAN SEE BOTH, BECAUSE IT IS THE THING THAT COMES BACK. *** On boot it knows:
//
//   - WHEN THIS PROCESS STARTED           (now, at require time)
//   - WHEN THIS BUILD WAS WRITTEN         (mtime of main.js -- when the extract or the updater finished)
//   - WHEN THE PREVIOUS PROCESS WAS LAST  (the last record's own boot, plus its last heartbeat)
//
// From those: INSTALL-TO-READY = boot - buildWritten. That is the number Keith asked for, and it is the same
// number whether a human unzipped the folder or the updater did it -- WHICH IS EXACTLY WHY IT IS WORTH HAVING.
// The two paths finally get compared on one scale.
//
// *** WHAT IT IS NOT: A STOPWATCH ON THE UNZIP ITSELF. *** mtime says when the file was WRITTEN, not when the
// operation began, so a slow extract that finished quickly and a fast extract that started late are the same
// reading. INSTALL-TO-READY IS AN HONEST NAME FOR IT and "install took" would not be.
//
// AND THE HISTORY IS BOUNDED. Twenty records, oldest dropped. An unbounded log of every boot is a file nobody
// reads that grows until somebody notices -- and this session has spent its length on things nobody noticed.
"use strict";
const fs = require("fs");
const path = require("path");

const KEEP = 20;

function historyPath(engineRoot) {
    // v3809 -- *** ENGINE_ROOT IS ALREADY THE WebGLEngine FOLDER, SO JOINING "WebGLEngine" AGAIN NAMED A
    // DIRECTORY THAT DOES NOT EXIST. *** server.js sets ENGINE_ROOT = resolve(__dirname, "..") from
    // ai-bridge/, i.e. the WebGLEngine dir itself (its own comment: "the folder containing index.html,
    // main.js, GPU_Assets/"). The extra segment pointed every read AND write at
    // WebGLEngine/WebGLEngine/tools/ship/, a phantom sibling that save() dutifully mkdir'd -- so the
    // history was internally consistent (writes and reads matched) while living in the wrong tree and,
    // worse, statSync(main.js) below threw on the same doubled path and left installToReadyMs null on
    // EVERY run. THAT is the "start-to-ready NOT RECORDED" the header kept announcing: not a run started a
    // way that cannot be timed, but a path that could never find the file it measures against.
    return path.join(engineRoot, "tools", "ship", "install-history.json");
}

function load(engineRoot) {
    try {
        const j = JSON.parse(fs.readFileSync(historyPath(engineRoot), "utf8"));
        return Array.isArray(j && j.runs) ? j : { version: 1, runs: [] };
    } catch { return { version: 1, runs: [] }; }
}

/**
 * Record this boot, and return the record.
 *
 * `buildWrittenAt` comes from main.js's mtime because THAT IS THE FILE EVERY PATH TOUCHES: the updater writes
 * it, an unzip writes it, and a hand-edit writes it. Using the zip's mtime instead would miss a manual extract
 * entirely, which is the case this exists to measure.
 */
function recordBoot(engineRoot, engineVersion) {
    const h = load(engineRoot);
    const bootAt = Date.now();
    let buildWrittenAt = null;
    // v3809 -- see historyPath: engineRoot IS the WebGLEngine dir, so main.js is engineRoot/main.js. The old
    // engineRoot/WebGLEngine/main.js never existed, statSync threw, buildWrittenAt stayed null, and the headline
    // number was null-by-construction on every boot. This is the single line that was reporting NOT RECORDED.
    try { buildWrittenAt = Math.round(fs.statSync(path.join(engineRoot, "main.js")).mtimeMs); } catch {}

    const prev = h.runs.length ? h.runs[h.runs.length - 1] : null;
    const rec = {
        version: String(engineVersion || "?"),
        bootAt,
        buildWrittenAt,
        // *** THE HEADLINE NUMBER. *** Null rather than zero when the mtime is unreadable: a missing measurement
        // and an instant install are opposite claims, and zero would read as the second.
        installToReadyMs: buildWrittenAt != null ? Math.max(0, bootAt - buildWrittenAt) : null,
        // A NEW BUILD OR A RESTART OF THE SAME ONE -- the two have very different install-to-ready numbers and
        // averaging them together would describe neither.
        newBuild: !prev || prev.version !== String(engineVersion || "?"),
        // Down time is only meaningful if the previous process wrote a heartbeat before it went.
        downMs: prev && prev.lastSeenAt ? Math.max(0, bootAt - prev.lastSeenAt) : null,
        lastSeenAt: bootAt,
    };
    h.runs.push(rec);
    while (h.runs.length > KEEP) h.runs.shift();
    save(engineRoot, h);
    return rec;
}

/** Slide the current run's last-seen forward, so the NEXT boot can say how long the gap was. */
function touch(engineRoot) {
    const h = load(engineRoot);
    if (!h.runs.length) return null;
    h.runs[h.runs.length - 1].lastSeenAt = Date.now();
    save(engineRoot, h);
    return h.runs[h.runs.length - 1];
}

function save(engineRoot, h) {
    try {
        const p = historyPath(engineRoot);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, JSON.stringify(h, null, 1) + "\n");
    } catch { /* a history that cannot be written must not stop a server from booting */ }
}

/** The report a page can render: newest first, with the two averages kept apart. */
function report(engineRoot) {
    const runs = load(engineRoot).runs.slice().reverse();
    const ready = (f) => runs.filter(f).map((r) => r.installToReadyMs).filter((n) => n != null);
    const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
    return {
        ok: true, runs,
        // KEPT APART ON PURPOSE: installing a new build and restarting the same one are different operations,
        // and one average over both would be a number that describes neither.
        avgNewBuildMs: avg(ready((r) => r.newBuild)),
        avgRestartMs: avg(ready((r) => !r.newBuild)),
        note: "install-to-ready = process boot minus main.js mtime. It spans the WHOLE install however it " +
              "happened -- updater or hand-unzipped -- which is what makes the two comparable. It is NOT a " +
              "stopwatch on the unzip: mtime says when the file was written, not when the work began.",
    };
}

module.exports = { recordBoot, touch, report, historyPath };
