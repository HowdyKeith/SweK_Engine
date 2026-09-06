// FILE: ai-bridge/androidPeerBridge.js
//
// v2922 -- THE FRONT DOOR. Three routes, mounted by one delegation line in server.js (see
// installAndroidPeerBridge.mjs), all under /android/:
//
//   GET  /android/status    what artifacts exist right now: the reference transcript, a phone ballot in
//                           Downloads, a magmap GPU report, a previously graded verdict. The hub page polls this.
//   POST /android/verdict   grade NOW: load the reference + the newest phone transcript (+ magmap report if one
//                           is present), run androidVerdict.grade(), and RETURN THE RESULT TO THE POOL -- see below.
//   GET  /android/verdict   the last graded verdict, or 404 if no ballot has ever been graded.
//
// THE POOL, CONCRETELY. "Returned to the SweK peer info pool" means two existing roads, not a new one:
//   1. The verdict is written to tools/roundhouse/android-verdict.json, which the static handler serves -- any
//      peer that can reach this bridge can GET it, same as any engine page.
//   2. A copy lands in this box's Downloads as swek-android-verdict.json -- the directory peerFilesBridge (v1591)
//      already grabs from and sends to, and the same directory the auto-update claim certifies. The ballot came
//      in through Downloads; the verdict goes back out through Downloads. One road, both directions.
//
// CJS on purpose, like every bridge; androidVerdict.mjs is ESM and is loaded through dynamic import(), which CJS
// is allowed to do. The grading code is NOT duplicated here -- one grader, in one file, gated by two selfchecks.
//
// SEAMS FOR THE GATE. configure() lets the selfcheck point roundhouseDir and downloadsDirs at a sandbox, so the
// gate can grade synthetic ballots without touching the real tree. Production callers never call configure().
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const CFG = {
    roundhouseDir: path.resolve(__dirname, "..", "tools", "roundhouse"),   // data: reference + written verdict
    moduleDir:     path.resolve(__dirname, "..", "tools", "roundhouse"),   // code: where the grader is imported from
    downloadsDirs: null,                                                    // null -> ~/Downloads then ~/storage/downloads
    log: (...a) => console.log("[android]", ...a),
};
function configure(opts) { Object.assign(CFG, opts || {}); }

function downloadsDirs() {
    if (CFG.downloadsDirs) return CFG.downloadsDirs;
    const h = os.homedir();
    return [path.join(h, "Downloads"), path.join(h, "storage", "downloads")];
}
function firstExisting(dirs) { for (const d of dirs) { try { if (fs.existsSync(d)) return d; } catch {} } return null; }
function findFile(name) {
    // Downloads first (the ballot's road), then the roundhouse dir (where a desktop run leaves it)
    for (const d of [...downloadsDirs(), CFG.roundhouseDir]) {
        const p = path.join(d, name);
        try { if (fs.existsSync(p)) return p; } catch {}
    }
    return null;
}
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }

const VERDICT_FILE = () => path.join(CFG.roundhouseDir, "android-verdict.json");
const REFERENCE_FILE = () => path.join(CFG.roundhouseDir, "android-reference.json");

function status() {
    const ref = readJson(REFERENCE_FILE());
    const phonePath = findFile("android-phone.json");
    const phone = phonePath ? readJson(phonePath) : null;
    const magmapPath = findFile("magmap-report.json");
    const magmap = magmapPath ? readJson(magmapPath) : null;
    const verdict = readJson(VERDICT_FILE());
    return {
        ok: true,
        reference: ref ? { present: true, checks: ref.checks.length, counts: ref.counts, host: ref.host, at: ref.at } : { present: false },
        phone: phone ? { present: true, path: phonePath, at: phone.at, host: phone.host, counts: phone.counts, probes: phone.probes } : { present: false, lookedIn: [...downloadsDirs(), CFG.roundhouseDir] },
        magmap: magmap ? { present: true, path: magmapPath, at: magmap.at, adapter: magmap.adapter, proposedBy: magmap.proposedBy } : { present: false },
        lastVerdict: verdict ? { present: true, at: verdict.at } : { present: false },
    };
}

async function gradeNow() {
    const refPath = REFERENCE_FILE();
    if (!fs.existsSync(refPath)) return { ok: false, code: 404, error: "no android-reference.json in " + CFG.roundhouseDir + " -- the desktop half of the round is not installed" };
    const phonePath = findFile("android-phone.json");
    if (!phonePath) return { ok: false, code: 404, error: "no android-phone.json in Downloads or " + CFG.roundhouseDir + " -- run tools/roundhouse/termux_peer.sh on the phone first; its last step drops the ballot into shared Downloads" };

    const V = await import(pathToFileURL(path.join(CFG.moduleDir, "androidVerdict.mjs")).href);
    const reference = V.loadTranscript(refPath);
    const phone = V.loadTranscript(phonePath);
    const magmapPath = findFile("magmap-report.json");
    const extras = magmapPath ? { magmapReport: readJson(magmapPath) } : {};

    const graded = V.grade(reference, phone, extras);
    const out = {
        kind: "swek-android-verdict", version: 2922, at: new Date().toISOString(),
        sources: { reference: refPath, phone: phonePath, magmap: magmapPath || null },
        ...graded,
        lines: V.verdictLines(graded),
    };

    // return to the pool: the served copy, then the Downloads copy (best-effort -- an unwritable Downloads is
    // reported, not fatal; the verdict itself already exists at the served path)
    fs.writeFileSync(VERDICT_FILE(), JSON.stringify(out, null, 2));
    const wrote = [VERDICT_FILE()];
    const dl = firstExisting(downloadsDirs());
    if (dl) {
        try { fs.writeFileSync(path.join(dl, "swek-android-verdict.json"), JSON.stringify(out, null, 2)); wrote.push(path.join(dl, "swek-android-verdict.json")); }
        catch (e) { CFG.log("Downloads copy failed:", e.message); }
    }
    CFG.log("graded", path.basename(phonePath), magmapPath ? "+ magmap report" : "(no magmap report)", "->", wrote.length, "copies");
    return { ok: true, code: 200, verdict: out, wrote };
}

function sendJson(res, obj, code = 200) {
    try { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); } catch {}
}

/** True if this bridge owned the request. One delegation line in server.js calls this. */
let inviteBridge = null;   // v2923 - lazy require so a tree without the invite bridge still runs
try { inviteBridge = require("./androidInviteBridge.js"); } catch {}

function handle(req, res) {
    const u = (req.url || "").split("?")[0];
    // v2923 - invite bridge first: it records a passive sighting for EVERY request (so a phone loading any page
    // becomes a candidate), then owns the invite/candidate/push routes and returns false for everything else --
    // including the status/verdict routes below and all non-/android/ paths.
    if (inviteBridge && inviteBridge.handle(req, res)) return true;
    if (!u.startsWith("/android/")) return false;
    if (req.method === "GET" && u === "/android/status") { sendJson(res, status()); return true; }

    // v3008 -- THE TASKER CHAIN. Termux:Tasker executes a script inside Termux, which is the designed seam for
    // driving this phone from the Android TV Device. Each stage carries the command AND the artefact that proves it
    // happened, because a task that FIRED is not a task that WORKED -- Tasker reports success for a script that
    // ran, found nothing and exited 0, on a device nobody is sitting at.
    // v3034 -- HOW THIS TRANSCRIPT MAY BE USED. runClass.mjs was written at v3029 to make Keith's policy
    // mechanical -- a run taken while the phone was serving is DIAGNOSTIC, excluded from comparison -- and was
    // then never called. Reported beside the artefacts so the exclusion is visible where the data is, rather
    // than being a convention someone remembers.
    if (req.method === "GET" && u === "/android/runclass") {
        Promise.all([
            import("../tools/roundhouse/runClass.mjs"),
            // Read the ballot through status()'s OWN path, not a second constant. My first draft used a PHONE
            // identifier that does not exist -- the exact bug the unbound-builtin detector was written for, made
            // twice in one round. status() already owns where the ballot lives.
            Promise.resolve().then(() => {
                try {
                    const p = (status().sources || {}).phone;
                    return p ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
                } catch { return null; }
            }),
        ]).then(([m, t]) => sendJson(res, {
            ok: true, present: !!t,
            verdict: t ? m.classOf(t) : null,
            why: t ? null : "no phone ballot on disk -- nothing to classify, which is not the same as a comparable run",
        })).catch((e) => sendJson(res, { ok: false, error: String((e && e.message) || e) }, 500));
        return true;
    }

    if (req.method === "GET" && u === "/android/tasker") {
        import("../tools/roundhouse/taskerStages.mjs")
            .then((m) => sendJson(res, { ok: true, ...m.chain(status()), freshMs: m.FRESH_MS }))
            .catch((e) => sendJson(res, { ok: false, error: String((e && e.message) || e) }, 500));
        return true;
    }

    // v2993 -- THE UPDATE POLICY GETS A FRONT DOOR. tools/roundhouse/androidUpdate.mjs was written at v2969 and
    // was reachable ONLY as `node tools/roundhouse/androidUpdate.mjs [hub-url]`. Under this project's own
    // standing law -- EVERY TOOL NEEDS A FRONT DOOR, a CLI-only deliverable is unfinished -- that made it the
    // last of the orphaned utilities the graveyard census named, and the only one whose fix was a route rather
    // than a use.
    //
    // It is the PHONE's policy, so it reports what the phone would be told, not what this desktop decides.
    if (req.method === "GET" && u === "/android/update") {
        import("../tools/roundhouse/androidUpdate.mjs")
            .then((m) => sendJson(res, {
                ok: true,
                policy: m.readAndroidPolicy(),
                defaultPolicy: m.ANDROID_DEFAULT_POLICY,
                localVersion: m.localVersion(),
                note: "The policy engine is imported from updatePolicy.mjs, not reimplemented -- two policy engines with drifting defaults is the duplicate this project found in its own tunnel registries, and once was enough.",
            }))
            .catch((e) => sendJson(res, { ok: false, error: String((e && e.message) || e) }, 500));
        return true;
    }
    if (req.method === "GET" && u === "/android/verdict") {
        const v = readJson(VERDICT_FILE());
        if (v) sendJson(res, v); else sendJson(res, { ok: false, error: "no ballot has been graded yet -- POST /android/verdict once android-phone.json is in Downloads" }, 404);
        return true;
    }

    // v2949 -- SUBMIT: the phone sends its own results to the hub over the connection it ALREADY has.
    //
    // Until now the phone produced android-phone.json / magmap-report.json into its own Downloads and getting
    // them to the hub was manual. The phone loads these pages FROM the hub, so an HTTP POST closes the loop with
    // no new transport, no pairing, no dependency -- and it works through the Cloudflare tunnel for remote
    // volunteers exactly as it does on the LAN, which a proximity protocol could not.
    //
    // SAFETY: this is the one endpoint that WRITES what a device sends, so it is deliberately narrow.
    //   - the filename is NEVER taken from the request; it is derived from the recognised kind
    //   - unrecognised kinds are refused rather than stored
    //   - a size cap destroys the connection rather than buffering
    //   - the body must parse as JSON and carry the kind it claims
    // A device can deposit a report; it cannot choose a path, overwrite an arbitrary file, or write a verdict.
    if (req.method === "POST" && u === "/android/submit") {
        let body = "";
        req.on("data", (d) => { body += d; if (body.length > 8 * 1024 * 1024) req.destroy(); });
        req.on("end", async () => {
            try {
                const j = JSON.parse(body || "{}");
                const KINDS = {
                    "swek-magmap-gpu-report": "magmap-report.json",
                    "swek-magmap-bench": "magmap-bench.json",
                    "swek-hmc-bench": "hmc-bench.json",   // v3282 -- second kernel; hub re-grades via tools/roundhouse/hmcGpu.mjs adjudicateDeviceRun
                    "swek-ising-bench": "ising-bench.json",   // v3283 -- third kernel, ZERO tolerance; hub re-grades via tools/roundhouse/isingGpu.mjs mirror
                    "swek-android-transcript": "android-phone.json",
                    "swek-consistency-route": "consistency-route.json",   // v3285 -- ONE SIDE of a board pair; hub assembles and RE-GRADES via physics/consistencyFleet.mjs
                    // v4481 -- THE SEVENTH KIND, AND THE FIRST THAT CARRIES A MEASUREMENT RATHER THAN A BENCH.
                    // Corroboration's fourth criterion asks whether another architecture gets the SAME BITS.
                    // Twenty of the lab's twenty-seven keyless observables touch libm and cannot be settled on
                    // one machine; the other six kinds are all GPU benches and transcripts, so until now the
                    // fleet had no way to answer. The hub re-grades via tools/roundhouse/corroborationSubmit.mjs
                    // -- the device sends values and never a verdict.
                    "swek-corroboration-observables": "corroboration-observables.json",
                };
                const name = KINDS[j && j.kind];
                if (!name) return sendJson(res, { ok: false, error: "unrecognised kind: " + String(j && j.kind).slice(0, 60) + " -- accepted: " + Object.keys(KINDS).join(", ") }, 400);
                const dir = CFG.roundhouseDir;
                const stamp = new Date().toISOString().replace(/[:.]/g, "-");
                // keep the canonical name (what the graders look for) AND an immutable timestamped copy, so a
                // second device can never erase the first -- the same lesson the device ledger encodes.
                fs.writeFileSync(path.join(dir, name), JSON.stringify(j, null, 2));
                const archDir = path.join(dir, "submissions");
                try { fs.mkdirSync(archDir, { recursive: true }); } catch {}
                fs.writeFileSync(path.join(archDir, stamp + "-" + name), JSON.stringify(j, null, 2));
                // v2973 -- AUTO-FOLD TIMINGS. The perf ledger existed since v2940 but nothing fed it: a human had
                // to run `perfLedger.mjs fold` by hand, so in practice it stayed empty and every timing gauge read
                // a dash. A transcript already carries per-check ms; folding it here means performance data
                // accumulates as a side effect of peers reporting, which is the only way it ever will.
                // v4481 -- AUTO-FOLD CORROBORATION SUBMISSIONS, for the reason v2973 gave about timings: a
                // ledger nobody folds by hand stays empty, so the fold happens as a side effect of a peer
                // reporting. The ledger APPENDS -- a second device can never erase the first.
                if (j.kind === "swek-corroboration-observables") {
                    try {
                        const cs = await import("../tools/roundhouse/corroborationSubmit.mjs");
                        const lf = path.join(dir, "corroboration-ledger.json");
                        let led; try { led = JSON.parse(fs.readFileSync(lf, "utf8")); } catch { led = cs.emptyLedger(); }
                        fs.writeFileSync(lf, JSON.stringify(cs.foldSubmission(led, j), null, 2) + "\n");
                    } catch {}
                }
                if (j.kind === "swek-android-transcript") {
                    try {
                        const pl = await import("../tools/roundhouse/perfLedger.mjs");
                        const pf = path.join(dir, "perf-ledger.json");
                        let led; try { led = JSON.parse(fs.readFileSync(pf, "utf8")); } catch { led = {}; }
                        fs.writeFileSync(pf, JSON.stringify(pl.foldRun(led, j), null, 2) + "\n");
                    } catch {}
                }
                // v3285 -- AUTO-FOLD FLOOR MEASUREMENTS, and this is the SAME DEFECT AS v2973 COMMITTED AGAIN.
                // The floor atlas landed in v3284 with a gate, a page and no feeder: foldReport was called only
                // by floor-atlas.html, so the numbers a device actually measured would have sat in submission
                // files while the atlas stayed empty -- exactly what the perf ledger did for 33 versions, in a
                // round whose own changelog criticised decorative modules. A module with no caller is a claim,
                // not a capability.
                //
                // Folded here, beside the timings, for the same reason: floor data accumulates as a SIDE EFFECT
                // of devices reporting, which is the only way it ever accumulates at all. Unknown kinds are
                // recorded in the atlas's own `skipped` list rather than dropped, so a future kernel that starts
                // submitting is visible immediately instead of silently uncounted.
                let atlasNote = null;
                try {
                    const fa = await import("../tools/roundhouse/floorAtlas.mjs");
                    if (fa.KERNEL_SPECS[j.kind]) {
                        const af = path.join(dir, "floor-atlas.json");
                        let atlas; try { atlas = JSON.parse(fs.readFileSync(af, "utf8")); } catch { atlas = null; }
                        const next = fa.foldReport(atlas, j);
                        fs.writeFileSync(af, JSON.stringify(next, null, 2) + "\n");
                        const g = fa.gradeAtlas(next);
                        // REPORTED BACK TO THE DEVICE, because a submission that silently changes a fleet-wide
                        // grading is the kind of thing you want to find out about now rather than next month.
                        atlasNote = { rows: g.rows, adapters: g.adapters, failures: g.failures.length, tight: g.tight.length };
                    }
                } catch (e) { atlasNote = { error: String((e && e.message) || e).slice(0, 80) }; }
                // v3285 -- FOLD A CONSISTENCY ROUTE. A peer runs ONE side of a board pair and submits the number;
                // the hub assembles pairs from whatever has arrived and RECOMPUTES the agreement itself. Nothing
                // submitted is taken as a verdict -- foldRoute rejects a report that carries one, and the
                // mechanism is looked up locally from the routeId so a peer cannot relabel itself into a pair.
                let boardNote = null;
                if (j.kind === "swek-consistency-route") {
                    try {
                        const cf = await import("../physics/consistencyFleet.mjs");
                        const bf = path.join(dir, "consistency-fleet.json");
                        let st; try { st = JSON.parse(fs.readFileSync(bf, "utf8")); } catch { st = null; }
                        const next = cf.foldRoute(st, j);
                        fs.writeFileSync(bf, JSON.stringify(next, null, 2) + "\n");
                        const asm = cf.assemble(next);
                        boardNote = { routesHeld: asm.routesHeld, hosts: asm.hosts.length, pairs: asm.pairs.length,
                                      disagree: asm.pairs.filter((p) => !p.agree).length,
                                      incomplete: asm.incomplete.length, reproducibility: asm.reproducibility.length,
                                      rejected: (next.rejected || []).length };
                    } catch (e) { boardNote = { error: String((e && e.message) || e).slice(0, 80) }; }
                }
                // a magmap report also folds straight into the permanent device ledger
                let fleet = null;
                if (j.kind === "swek-magmap-gpu-report") {
                    const dl = await import("../tools/roundhouse/deviceLedger.mjs");
                    const lf = path.join(dir, "device-ledger.json");
                    let led; try { led = JSON.parse(fs.readFileSync(lf, "utf8")); } catch { led = dl.emptyDeviceLedger(); }
                    const updated = dl.foldMagmapReport(led, j);
                    fs.writeFileSync(lf, JSON.stringify(updated, null, 2) + "\n");
                    fleet = dl.gradeFleet(updated);
                }
                sendJson(res, { ok: true, stored: name, archived: stamp + "-" + name, fleet, atlas: atlasNote, board: boardNote });
            } catch (e) { sendJson(res, { ok: false, error: String((e && e.message) || e) }, 400); }
        });
        return true;
    }
    if (req.method === "POST" && u === "/android/verdict") {
        gradeNow().then((r) => sendJson(res, r, r.code || 200))
                  .catch((e) => sendJson(res, { ok: false, error: String((e && e.message) || e) }, 500));
        return true;
    }
    sendJson(res, { ok: false, error: "unknown /android/ route", routes: ["GET /android/status", "GET /android/verdict", "POST /android/verdict"] }, 404);
    return true;
}

module.exports = { handle, status, gradeNow, configure };
