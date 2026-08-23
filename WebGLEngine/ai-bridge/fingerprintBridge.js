// WebGLEngine/ai-bridge/fingerprintBridge.js — v2655
//
// Remote cross-architecture fingerprint over the peer fleet. Instead of hand-running the fingerprint on Galaxina and
// the arm64 Mac and eyeballing two hashes, the dashboard asks every peer for its fingerprint and shows who agrees
// and who diverges -- and crucially, WHICH science diverged on WHICH peer, because the per-subsystem hashes are
// compared, not just the master.
//
//   GET  /fingerprint            -> this box's fingerprint { host, arch, platform, node, master, subsystems }
//   POST /fingerprint/collect    -> body { urls:[...] }: fetch each peer's /fingerprint, compare, return the verdict
//
// The comparison (compareFingerprints) is a pure function and is what the gate verifies; the HTTP fetch across real
// peers is rig-only. Selected peers = whatever urls the dashboard sends (all, or a chosen subset).

const http = require("http");
const https = require("https");
const os = require("os");
// v3952 -- *** THIS FILE USED fs AND path IN FORTY-FOUR PLACES AND REQUIRED NEITHER. ***
//
// Keith's render-qa run showed it as `500 /instruments/list`, which is the one route where the failure is LOUD:
// its body reads a file, so `path` being undefined throws a ReferenceError straight into the catch that turns
// anything into a 500. THE OTHER FORTY-ODD USES ARE THE WORRYING ONES -- most sit inside `try { ... } catch {}`
// blocks that swallow the ReferenceError and hand back a default, so the roundhouse roster, the device ledger,
// the tunnel candidates and the perf ledger have all been reading as EMPTY rather than as broken. A route that
// returns {} because a require is missing is indistinguishable from a route that returns {} because there is
// nothing there, which is why only the one loud route ever got reported.
const fs = require("fs");
const path = require("path");

// v3484 -- one measurement per process, shared by everyone who asks while it is running.
let _obsCache = null, _obsInFlight = null, _obsAt = 0, _obsOffThread = null;
async function _cachedObservables(base) {
    if (_obsCache) return _obsCache;
    if (_obsInFlight) return _obsInFlight;            // ten peers arriving together share ONE measurement
    _obsInFlight = (async () => {
        // v3485 -- *** AND THE FIRST MEASUREMENT RUNS ON A WORKER, WHICH IS THE LAST PIECE. *** v3484's cache
        // killed the ACCUMULATION -- Keith's blocks went from 15s -> 25s -> 48s -> 74s and climbing, to ONE 14s
        // block and then nothing over 3s for the next four hundred seconds -- but the FIRST, uncached
        // measurement still ran here and that single block is what remained. 8606ms inline against 5ms on a
        // worker, same observables.
        //
        // The fallback is deliberate and is NOT a silent one: a box where worker_threads is unavailable still
        // gets its fingerprint, just slowly, and says which path it took. A DIAGNOSTIC THAT REFUSES TO RUN IS
        // WORSE THAN ONE THAT RUNS THE OLD WAY AND ADMITS IT.
        const args = [{ version: base.node, arch: base.arch, host: base.host }];
        let rep;
        try {
            const { callInWorker } = await import("./deviceWorker.mjs");
            rep = await callInWorker("tools/fingerprint/peerReport.mjs", "peerReport", args);
            _obsOffThread = true;
        } catch (e) {
            const { peerReport } = await import("../tools/fingerprint/peerReport.mjs");
            rep = await peerReport(args[0]);
            _obsOffThread = false;
            console.log("[fingerprint] worker unavailable (" + String((e && e.message) || e).slice(0, 60) + ") -- measured inline instead");
        }
        _obsCache = rep.observables; _obsAt = Date.now();
        return _obsCache;
    })().finally(() => { _obsInFlight = null; });
    return _obsInFlight;
}
/** Exposed so a gate can prove the second call does no work rather than merely being fast. */
function _observablesCacheState() { return { cached: !!_obsCache, at: _obsAt, inFlight: !!_obsInFlight, offThread: _obsOffThread }; }

async function localFingerprint() {
    const { computeFingerprint } = await import("../tools/fingerprint/fingerprint.mjs");
    const fp = computeFingerprint();
    // v3018 -- WHAT THIS BOX IS DOING, not only what it is. Every other field here is a property of the machine
    // and none of them changes while a roundhouse run is in flight, so a fleet of eight looks identical whether
    // they are all idle or all mid-experiment.
    //
    // THIS FIELD IS HAND-COPIED INTO TWO PLACES -- here and the peer row in collect() -- exactly like observables
    // at v2927, whose note records that adding it to one and not the other left the physics table permanently
    // dark on a fleet that plainly had the data. Both copies are updated together and a gate asserts it.
    let roundhouse = null;
    try {
        const { activityOf } = await import("../tools/roundhouse/activity.mjs");
        roundhouse = activityOf(globalThis.__swekActiveRun || null);
    } catch { roundhouse = null; }
    const base = { host: os.hostname(), arch: process.arch, platform: process.platform, node: process.version, master: fp.master, subsystems: fp.subsystems, roundhouse };
    // v2927 -- ITEM 4. Attach the physics observables so the fleet can compare MEASURED physics, not just the 50
    // subsystem hashes. peerReport re-measures each baselined quantity with the libm tripwire armed, which is the
    // slow part, so a failure here must not blank the whole fingerprint -- a peer that can hash but not measure is
    // still a useful hash peer. Degrade to no observables rather than to no fingerprint.
    // v3484 -- *** CACHED FOR THE LIFE OF THE PROCESS, AND THIS IS THE STALL KEITH HAS BEEN CHASING FOR A
    // DOZEN VERSIONS. *** v3483's call chain finally named it:
    //
    //     airy-rayleigh-factor  physicsBaseline.mjs:163 -> buildOptics -> circularNumeric -> diffraction.js:53
    //
    // peerReport RE-MEASURES ALL TWELVE BASELINED QUANTITIES ON EVERY FINGERPRINT REQUEST -- 2464ms of physics
    // measured here, several times that on the rig -- AND THE FLEET ASKS CONSTANTLY (fleet-announce, updPeers,
    // vpPeers, and every autoPull peer connection). The comment two lines above already called it "the slow
    // part". IT WAS SLOW **AND** ON A REQUEST PATH **AND** REPEATED, and only the third of those made it grow.
    //
    // *** CACHING IS NOT A COMPROMISE HERE, IT IS THE CORRECT ANSWER: A FINGERPRINT IS A PROPERTY OF THIS BUILD
    // ON THIS BOX. Two requests one second apart MUST get the same numbers -- that is the entire premise of
    // comparing them across a fleet -- so re-measuring per request was never buying freshness, only cost. ***
    //
    // The in-flight promise is shared rather than the work repeated: without that, ten peers arriving together
    // start ten measurements, which is exactly how a 2.5s cost became a 74s stall.
    try {
        base.observables = await _cachedObservables(base);
    } catch (e) {
        base.observableError = String((e && e.message) || e);
    }
    return base;
}

function fetchJson(url, timeoutMs = 8000) {
    return new Promise((resolve) => {
        const lib = url.startsWith("https") ? https : http;
        let done = false;
        const finish = (v) => { if (!done) { done = true; resolve(v); } };
        const req = lib.get(url, (res) => {
            let b = ""; res.on("data", (d) => { b += d; if (b.length > 262144) req.destroy(); });
            res.on("end", () => { try { finish({ ok: true, data: JSON.parse(b) }); } catch { finish({ ok: false, error: "bad json" }); } });
        });
        req.on("error", (e) => finish({ ok: false, error: String((e && e.message) || e) }));
        req.setTimeout(timeoutMs, () => { req.destroy(); finish({ ok: false, error: "timeout" }); });
    });
}

// PURE, TESTABLE. results: [{ url, ok, arch?, master?, subsystems?:[{name,hash}], error? }]
// Returns whether the fleet agrees, and for each subsystem which peers diverge from the majority.
function compareFingerprints(results) {
    const reachable = results.filter((r) => r.ok && r.master);
    const masters = new Map();
    for (const r of reachable) { if (!masters.has(r.master)) masters.set(r.master, []); masters.get(r.master).push(r.url); }
    const masterAgree = masters.size <= 1;

    const subNames = reachable.length ? reachable[0].subsystems.map((s) => s.name) : [];
    const perSubsystem = {};
    for (const name of subNames) {
        const byHash = new Map();
        for (const r of reachable) {
            const s = (r.subsystems || []).find((x) => x.name === name);
            const h = s ? s.hash : "MISSING";
            if (!byHash.has(h)) byHash.set(h, []);
            byHash.get(h).push(r.url);
        }
        let majHash = null, majCount = -1;
        for (const [h, urls] of byHash) if (urls.length > majCount) { majCount = urls.length; majHash = h; }
        const divergent = [];
        for (const [h, urls] of byHash) if (h !== majHash) for (const u of urls) divergent.push({ url: u, hash: h });
        perSubsystem[name] = { agree: byHash.size <= 1, majorityHash: majHash, divergent };
    }

    // v2927 -- ITEM 4. The peer report has carried physics observables (each with its cross-machine portability
    // prediction) since the v2916 baseline merge, but this comparison only ever looked at the 50 subsystem
    // HASHES. So the fleet could agree bit-for-bit on the hashes and nobody would see whether it agreed on the
    // measured physics -- which is the more interesting question, because a portable observable is a PREDICTION
    // that the fleet reproduces it and an unportable one predicts it may not. Fold in the observable verdict when
    // peers actually carry observables; older peers that don't are simply absent from this block.
    let observables = [];
    const withObs = reachable.filter((r) => Array.isArray(r.observables) && r.observables.length);
    if (withObs.length >= 2) {
        const ids = new Set();
        for (const r of withObs) for (const o of r.observables) ids.add(o.id);
        for (const id of ids) {
            const entries = withObs.map((r) => {
                const o = r.observables.find((x) => x.id === id);
                return o ? { url: r.url, bits: o.bits, value: o.value, portable: o.portable, kind: o.kind } : null;
            }).filter(Boolean);
            if (entries.length < 2) { observables.push({ id, verdict: "insufficient-peers", entries: entries.length }); continue; }
            const bitSet = new Set(entries.map((e) => e.bits));
            const anyPredictedPortable = entries.some((e) => e.portable);
            // the rule is the portability PREDICTION: a portable observable that diverges is a broken promise;
            // an unportable one that diverges was predicted to, and only agreement is the surprise.
            const agree = bitSet.size === 1;
            observables.push({
                id, kind: entries[0].kind,
                agree, predictedPortable: anyPredictedPortable,
                verdict: agree ? (anyPredictedPortable ? "agree-as-predicted" : "agree-unexpectedly")
                    : (anyPredictedPortable ? "DIVERGED-BROKEN-PREDICTION" : "diverged-as-predicted"),
                entries,
            });
        }
    }

    return {
        peerCount: results.length,
        reachableCount: reachable.length,
        masterAgree,
        masterGroups: [...masters.entries()].map(([master, peers]) => ({ master, peers })),
        perSubsystem,
        observables,
        // a broken prediction is the headline: an observable the fleet was told is portable, that diverged
        observableBreaks: observables.filter((o) => o.verdict === "DIVERGED-BROKEN-PREDICTION"),
        // the headline: the exact set of (peer, subsystem) pairs that diverged -- names the science AND the machine
        divergences: Object.entries(perSubsystem).flatMap(([name, v]) => v.divergent.map((d) => ({ subsystem: name, url: d.url, hash: d.hash }))),
        unreachable: results.filter((r) => !r.ok).map((r) => ({ url: r.url, error: r.error })),
    };
}

async function collect(urls, includeSelf = true) {
    const results = [];
    // v2927 -- ITEM 4. Both the self entry and each remote peer must carry `observables` through, or the physics
    // comparison in compareFingerprints stays permanently dark. This is a hand-copied field list -- the same
    // shape that caused the duplicated-table bugs (v2910/v2915) -- so observables is added to BOTH copies, and a
    // regression here would show up as an empty physics table on a fleet that plainly has the data.
    if (includeSelf) { try { const me = await localFingerprint(); results.push({ url: "(this box: " + me.host + ")", ok: true, arch: me.arch, master: me.master, subsystems: me.subsystems, observables: me.observables, observableError: me.observableError }); } catch (e) { results.push({ url: "(this box)", ok: false, error: String((e && e.message) || e) }); } }
    const peer = await Promise.all((urls || []).map(async (url) => {
        const base = String(url).replace(/\/+$/, "");
        const r = await fetchJson(base + "/fingerprint");
        return r.ok ? { url, ok: true, arch: r.data.arch, master: r.data.master, subsystems: r.data.subsystems, observables: r.data.observables, roundhouse: r.data.roundhouse } : { url, ok: false, error: r.error };   // v3018 -- roundhouse: the SECOND of the two hand-copied rows
    }));
    results.push(...peer);
    return { results, comparison: compareFingerprints(results) };
}

function handle(req, res) {
    const url = req.url.split("?")[0];
    const sendJson = (o, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.method === "GET" && url === "/fingerprint") {
        localFingerprint().then((fp) => sendJson(fp)).catch((e) => sendJson({ error: String((e && e.message) || e) }, 500));
        return true;
    }
    if (req.method === "POST" && url === "/fingerprint/collect") {
        let body = ""; req.on("data", (d) => { body += d; if (body.length > 65536) req.destroy(); });
        req.on("end", () => { let urls = []; try { urls = JSON.parse(body || "{}").urls || []; } catch { } collect(urls).then((r) => sendJson(r)).catch((e) => sendJson({ error: String((e && e.message) || e) }, 500)); });
        return true;
    }
    // v2658 -- the result ledger, shared across the fleet.
    if (req.method === "GET" && url === "/ledger") {
        import("../tools/ledger/ledger.mjs").then((m) => sendJson(m.loadLedger())).catch((e) => sendJson({ error: String((e && e.message) || e) }, 500));
        return true;
    }
    // v2941: serve the performance ledger and its graded verdict for the human-eyes report page. Read-only,
    // downstream of everything -- this endpoint adjudicates nothing, it just hands over the ledger and the
    // regression grade so a browser can render them for a person. If the ledger file does not exist yet (no runs
    // folded), return an empty ledger rather than an error, so the report shows "no data yet" cleanly.
    // v2946: serve the permanent device results ledger + fleet grade, so the device list can be VIEWED (and
    // sent on) rather than only living in a file on the hub. Read-only: it renders what was already graded.
    // v2951: fleet gauges, assembled from the ledgers that already exist. Read-only and derived -- it adjudicates
    // nothing and stores nothing; every number carries the file it came from and the age of the newest datum.
    // v2953 -- THE LIGHTHOUSE. Two endpoints, and the direction of the arrow is the whole point.
    //
    // POST /lighthouse/checkin  a peer the hub CANNOT reach (behind NAT, on a cousin's home network) pushes its
    //                           own fingerprint here. This is the only way such a peer can ever join the fleet:
    //                           /fingerprint/collect requires the hub to dial OUT, which NAT forbids.
    // GET  /lighthouse          the roster: who has checked in, how long ago, pushed or pulled, and whether the
    //                           fleet agrees on a master hash.
    //
    // The peer sends its fingerprint. It does NOT send a verdict, and the roster records origin:"push" set by
    // THIS side -- a peer cannot claim to have been pulled, because being pulled means the hub verified the
    // address and a peer asserting that about itself would be asserting something only we can know.
    // v2956 -- TUNNEL CANDIDATES. Serves the ordered list of addresses a remote peer should try, and accepts a
    // report of which one worked. Cloudflare quick tunnels recover unpredictably, so nothing here is ever pruned
    // on failure -- a URL is only removed by an explicit operator retire, because a failed probe is evidence
    // about a moment and these come back, sometimes all at once.
    // v2959: the signed release manifest a verified-tier peer checks before anything is applicable. Public data
    // -- version, checksum, size, signature. The PRIVATE key never appears here or anywhere in the tree.
    // v2962 -- THE JOB HTTP SURFACE. Four routes, and the peer-facing two are deliberately thin: a peer asks for
    // work and reports what it measured. The queue's rules (catalog-bound specs, leases, holder-only completion)
    // live in jobQueue.mjs and are enforced there, so these handlers cannot accidentally relax them.
    if (req.method === "GET" && url === "/jobs") {
        (async () => {
            try {
                const { readQ, J } = await jobsIO();
                const q = readQ();
                sendJson({ summary: J.queueSummary(q), jobs: Object.values(q.jobs || {}) });
            } catch (e) { sendJson({ error: String((e && e.message) || e) }, 500); }
        })();
        return true;
    }
    if (req.method === "POST" && (url === "/jobs/add" || url === "/jobs/claim" || url === "/jobs/complete")) {
        let body = "";
        req.on("data", (d) => { body += d; if (body.length > 2 * 1024 * 1024) req.destroy(); });
        req.on("end", async () => {
            try {
                const j = JSON.parse(body || "{}");
                const { readQ, writeQ, J, MODES } = await jobsIO();
                let q = readQ();
                if (url === "/jobs/add") {
                    // the spec is validated against the hub's OWN registry before it is ever offered to a peer
                    const specs = [].concat(j.job || j.jobs || []);
                    const made = [];
                    for (const sp of specs) { const r = J.enqueue(q, sp, MODES); q = r.queue; made.push(r.job.id); }
                    writeQ(q);
                    return sendJson({ ok: true, added: made, summary: J.queueSummary(q) });
                }
                if (url === "/jobs/claim") {
                    if (!j.peerKey) return sendJson({ ok: false, error: "claim needs a peerKey" }, 400);
                    const r = J.claim(q, String(j.peerKey), { max: Math.min(4, Math.max(1, j.max || 1)) });
                    writeQ(r.queue);
                    return sendJson({ ok: true, jobs: r.jobs });
                }
                // complete
                if (!j.peerKey || !j.id) return sendJson({ ok: false, error: "complete needs peerKey and id" }, 400);
                const r = J.complete(q, String(j.id), String(j.peerKey), j.result);
                if (!r.ok) return sendJson({ ok: false, error: r.why }, 409);
                writeQ(r.queue);
                return sendJson({ ok: true, summary: J.queueSummary(r.queue) });
            } catch (e) { sendJson({ ok: false, error: String((e && e.message) || e) }, 400); }
        });
        return true;
    }
    // v3849 -- THE LAB'S COVERAGE IN ONE READ. Four censuses each answered their own question correctly and each
    // printed its own prose, so saying "here is the lab's coverage" took four runs and a head for numbers --
    // which is why the numbers in the notes went stale. tools/ship/labCensus.mjs aggregates them WITHOUT
    // re-deriving any, and this serves it. GET, because it computes nothing and writes nothing.
    if (req.method === "GET" && url === "/lab/census") {
        (async () => {
            try {
                const { labCensus, censusLines } = await import("../tools/ship/labCensus.mjs");
                const c = labCensus();
                sendJson({ ok: true, ...c, lines: censusLines(c) });
            } catch (e) { sendJson({ ok: false, error: String((e && e.message) || e) }, 500); }
        })();
        return true;
    }
    // v3848 -- THE DISPATCH ROUTE, WHICH IS THE HALF officeManager HAS BEEN MISSING SINCE v3824.
    //
    // *** IT DECIDED, AND NOTHING LISTENED. *** officeManager answers "what runs next, on whom, and when is a
    // human woken" and its only consumer was office-floor.html -- a page that DRAWS the answer. curriculum has
    // /curriculum/run; the manager had no route at all, so on a live fleet it arbitrated nothing. This is the
    // loop's tick: read the registers, ask the manager, post the result to the queue peers actually claim from.
    //
    // THE DECISION IS NOT MADE HERE. Everything between the read and the write lives in
    // tools/roundhouse/officeDispatch.mjs so it can be graded headless; this handler is plumbing and is allowed
    // to be dull. What it adds is the two things a route must do and a pure module cannot: say WHERE each
    // register came from, and refuse to write when asked not to.
    //
    // POST because it MUTATES THE QUEUE. `{ dryRun: true }` plans and returns without writing, which is how an
    // operator sees what a tick would do before letting a loop do it on a timer.
    if (req.method === "POST" && url === "/office/dispatch") {
        let body = "";
        req.on("data", (d) => { body += d; if (body.length > 2 * 1024 * 1024) req.destroy(); });
        req.on("end", async () => {
            try {
                const j = JSON.parse(body || "{}");
                const fs = await import("node:fs"); const path = await import("node:path");
                const { readQ, writeQ, MODES } = await jobsIO();
                const D = await import("../tools/roundhouse/officeDispatch.mjs");
                const sources = {};
                const queue = readQ(); sources.queue = "tools/roundhouse/" + JOB_QUEUE_FILE;

                // FLEET: the lighthouse roster, whose rows carry the activity each peer reported. A peer that
                // reported nothing lands in officeManager's UNKNOWN bucket, never IDLE -- silence is not consent.
                let fleet = j.fleet;
                if (Array.isArray(fleet)) sources.fleet = "request body";
                else {
                    let roster = { peers: {} };
                    try { roster = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tools", "roundhouse", "lighthouse-roster.json"), "utf8")); } catch {}
                    fleet = D.fleetFromRoster(roster); sources.fleet = "tools/roundhouse/lighthouse-roster.json";
                }

                // FRONTIER: curriculum's proposals. Calling propose() is the slow part of a tick, so a caller may
                // supply one it already has -- a loop that just ran /curriculum/run should not pay for it twice.
                let frontier = j.frontier;
                if (frontier) sources.frontier = "request body";
                else {
                    const c = await import("../tools/roundhouse/curriculum.mjs");
                    frontier = await c.propose({ perKind: Math.min(5, Math.max(1, j.perKind || 1)) });
                    sources.frontier = "curriculum.propose()";
                }

                // LEDGER: existence-only, subject -> record. *** THERE IS NO FILE FOR THIS AND ONE IS NOT INVENTED
                // HERE. *** officeManager's own header warns against a seventh register nobody asked for, and a
                // settled-subject ledger is properly the curriculum's to own. Absent one, the manager sees an
                // EMPTY ledger and treats every proposal as open -- which is safe, because the idempotence guard
                // in officeDispatch stops the same subject being queued twice regardless. Reported, not hidden.
                const ledger = (j.ledger && typeof j.ledger === "object") ? j.ledger : {};
                sources.ledger = j.ledger ? "request body" : "EMPTY -- no settled-subject register exists yet";

                const plan = D.planDispatch({ frontier, queue, fleet, ledger, budget: j.budget || null,
                                              maxAssignments: Number.isFinite(j.max) ? j.max : Infinity }, { modes: MODES });
                let added = [];
                if (j.dryRun) { sources.write = "SKIPPED -- dryRun"; }
                else { const ap = D.applyDispatch(queue, plan.specs, { modes: MODES }); writeQ(ap.queue); added = ap.added; sources.write = sources.queue; }

                sendJson({ ok: true, sources, added,
                           assignments: plan.result.assignments.map((a) => ({ peer: a.peer, subject: a.proposal.subject, kind: a.proposal.kind })),
                           held: plan.held, invalid: plan.invalid,
                           // THE ESCALATIONS COME BACK AS DATA AND THIS ROUTE DOES NOT DELIVER THEM. The sink is
                           // injected by design (officeManager's header); wiring it to the outbox is a decision
                           // with a network in it and is Keith's, not a side effect of adding a dispatcher.
                           escalations: plan.result.escalations,
                           lines: D.dispatchLines(plan, added) });
            } catch (e) { sendJson({ ok: false, error: String((e && e.message) || e) }, 500); }
        });
        return true;
    }
    // v2968 -- MESH EXCHANGE. The merge module has existed since v2965 with nothing able to reach it; this is the
    // route that makes two hubs actually gossip. It is SYMMETRIC: the caller sends its ledgers, we merge them
    // into ours, and we return ours so the caller can do the same. One round trip, both sides converge.
    //
    // What we do NOT do is adopt their verdicts. A merged device run is RE-GRADED here from the raw numbers it
    // carries, and any disagreement with their verdict is reported -- two hubs reading identical measurements and
    // reaching different conclusions means their graders differ, which is worth knowing rather than resolving by
    // whoever spoke last.
    if (req.method === "POST" && url === "/mesh/exchange") {
        let body = "";
        req.on("data", (d) => { body += d; if (body.length > 16 * 1024 * 1024) req.destroy(); });
        req.on("end", async () => {
            try {
                const theirs = JSON.parse(body || "{}");
                const fs = await import("node:fs"); const path = await import("node:path");
                const rh = path.join(process.cwd(), "tools", "roundhouse");
                const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(rh, f), "utf8")); } catch { return d; } };
                const M = await import("../tools/roundhouse/meshMerge.mjs");
                const { gradeMagmapReport } = await import("../tools/roundhouse/magmapReport.mjs");

                const mine = {
                    roster: rd("lighthouse-roster.json", { peers: {} }),
                    devices: rd("device-ledger.json", { devices: {} }),
                    candidates: rd("tunnel-candidates.json", { urls: {} }),
                    perf: rd("perf-ledger.json", { checks: {} }),   // v2973: timings sync too
                };
                const merged = M.mergeAll(mine, {
                    roster: theirs.roster || { peers: {} },
                    devices: theirs.devices || { devices: {} },
                    candidates: theirs.candidates || { urls: {} },
                    perf: theirs.perf || { checks: {} },
                });
                // re-grade rather than inherit -- see the note above
                const re = M.regradeMerged(merged.devices, gradeMagmapReport);
                fs.writeFileSync(path.join(rh, "lighthouse-roster.json"), JSON.stringify(merged.roster, null, 2) + "\n");
                fs.writeFileSync(path.join(rh, "device-ledger.json"), JSON.stringify(re.ledger, null, 2) + "\n");
                fs.writeFileSync(path.join(rh, "tunnel-candidates.json"), JSON.stringify(merged.candidates, null, 2) + "\n");
                fs.writeFileSync(path.join(rh, "perf-ledger.json"), JSON.stringify(merged.perf, null, 2) + "\n");

                sendJson({
                    ok: true,
                    gained: merged.gained,
                    refused: merged.refused,
                    regraded: { disagreements: re.disagreements.length, detail: re.disagreements.slice(0, 20) },
                    // symmetric: here is our state, merge it your side
                    roster: merged.roster, devices: re.ledger, candidates: merged.candidates, perf: merged.perf,
                });
            } catch (e) { sendJson({ ok: false, error: String((e && e.message) || e) }, 400); }
        });
        return true;
    }
    if (req.method === "GET" && url === "/release") {
        (async () => {
            try {
                const fs = await import("node:fs"); const path = await import("node:path");
                const f = path.join(process.cwd(), "tools", "roundhouse", "release-manifest.json");
                if (!fs.existsSync(f)) return sendJson({ error: "no release has been signed yet. THIS IS A TERMINAL-ONLY OPERATION ON PURPOSE: signing needs the private key, which never leaves the machine (~/.swek/release-private.pem, and buildKeyLeak-selfcheck fails the build if one is found under the tree). A route that signed would put that key behind an HTTP surface, and a leaked signing key makes every pinned public key in the fleet worthless at once. Run: node tools/roundhouse/signRelease.mjs sign <zip>" }, 404);
                sendJson(JSON.parse(fs.readFileSync(f, "utf8")));
            } catch (e) { sendJson({ error: String((e && e.message) || e) }, 500); }
        })();
        return true;
    }
    // v2966 -- THE ROTATION SCHEDULE. hostingBridge already rotates REACTIVELY (ensureLiveTunnel makes a new
    // tunnel when none are live). What was missing is a TIMED rotation the operator controls, so a fresh address
    // exists before the current one dies rather than after. Additive per v2957: starting a new tunnel adds a
    // candidate and retires nothing, so the old URL keeps serving peers that already hold it.
    // v3577 -- PAGE PLACEMENTS. The page index writes here; server.html and the render page read it.
    //
    // *** IT WRITES page-placements.json AND NEVER pageSections.mjs, WHICH IS THE POINT. *** SECTIONS carries
    // reasoning no UI can hold -- roundhouse sits with the physics lab because it DRIVES it, sampling has no chip
    // because a thirteenth button was the thing to avoid. A browser writing that file would flatten every one of
    // those comments into a JSON array. This is an OVERRIDE LAYER: delete the file and the tree returns to
    // exactly its current behaviour, which is the property that makes the editor safe to ship.
    // v3581 -- INSTRUMENT REPORTS. A FRONT DOOR FOR THE GATES THAT ONLY EVER HAD A TERMINAL.
    //
    // *** 34 OF 104 INSTRUMENTS CARRY page: null *** -- reachable only by running a selfcheck by hand, which is
    // the debt policyMass sat in until v3030. The six added this session are all in it, and so is an entire new
    // AREA (control, crystal) with no visual surface at all.
    //
    // THE GATES CANNOT MOVE TO THE BROWSER -- they import box3d through node and read files off disk. But v3327
    // split every one of them into a REPORTING TOOL that prints and a GATE that exits nonzero, and the reporting
    // half is exactly what a page wants. So the door is generic: this runs reportLines() in node and hands back
    // the lines. EIGHT INSTRUMENTS GAIN A PAGE WITHOUT ONE BEING WRITTEN FOR THEM, and any future module that
    // follows the split gets one for free rather than needing an .html of its own.
    // v3587 -- the lab-scene triage joined against the LIVE proposer registry, so the page never reports a
    // registration that is not there. The triage is a judgement; the registration is a fact; the join keeps
    // them apart.
    if (req.method === "GET" && url.startsWith("/roundhouse/lab-scenes")) {
        (async () => {
            try {
                const L = await import("../physics/labScenes.mjs");
                let listed = [];
                try {
                    const P = await import("../physics/proposers.mjs");
                    const K = await import("../physics/knobRegistry.mjs");
                    P.resetRegistry(); K.registerAll();
                    listed = P.listProposers();
                } catch { /* no registry is not an error: every row simply reports registered:false */ }
                sendJson({ ok: true, scenes: L.joinRegistered(listed),
                           proposers: listed.map((p) => ({ id: p.id, instrument: p.instrument, tier: p.tier })),
                           note: "eligible is ASSESSED, not measured; registered is read from the live registry" });
            } catch (e) { sendJson({ ok: false, error: String((e && e.message) || e) }, 500); }
        })();
        return true;
    }
    // v3595 -- *** THE BUTTON'S ROUTE. physics-lab.html has had an "Initiate AI workers" button since v3587
    // with NO CLICK HANDLER ANYWHERE IN THE FILE -- and v3594's registry growth made paintRoundhouse start
    // ENABLING it, so it looked live and did nothing. A disabled control that names what is missing is honest;
    // an enabled one that swallows a press is not. ***
    //
    // IT RUNS THE PROPOSER AND IT NEVER APPLIES ANYTHING. runProposer reports; applyKnobs is the ONLY path
    // that can set a value and it is not imported here, so no HTTP request can reach it whatever it says.
    // Every proposer's default tier is "propose" -- a human or a gate applies the value -- and the button's
    // own tooltip says so. Auto-applying from a page would make the licence tier decorative, which is the
    // structure proposers.mjs exists to defend.
    //
    // THE SCENE -> PROPOSER RESOLUTION IS labScenes.joinRegistered's AND NOT A SECOND COPY HERE: the page
    // paints from the same join, so a scene the page calls registered is exactly the one this will run.
    if (req.method === "GET" && url.startsWith("/roundhouse/lab-scene-run")) {
        (async () => {
            try {
                // *** THE QUERY STRING IS GONE BY THE TIME ROUTES SEE `url`. *** handle() opens with
                // req.url.split("?")[0] so every route below it dispatches on the path alone -- which is right
                // for dispatch and silently wrong for a parameter. My first version read `scene` off `url` and
                // got the empty string on every request, which returns "unknown-scene" for a scene that exists:
                // a plausible refusal for a question nobody asked. Read it from req.url, which still has it.
                const scene = new URL(req.url, "http://x").searchParams.get("scene") || "";
                const L = await import("../physics/labScenes.mjs");
                const P = await import("../physics/proposers.mjs");
                const K = await import("../physics/knobRegistry.mjs");
                P.resetRegistry(); K.registerAll();
                const row = L.joinRegistered(P.listProposers()).find((r) => r.scene === scene);
                // Each refusal names itself. "unknown scene" and "no proposer" want opposite responses from
                // whoever reads them, and one shared 400 would make them look like the same problem.
                if (!row) return sendJson({ ok: false, error: "unknown-scene", scene }, 400);
                if (!row.proposerIds.length)
                    return sendJson({ ok: false, error: "no-proposer", scene, knob: row.knob,
                                      eligible: row.eligible,
                                      message: row.eligible === "candidate"
                                          ? "an independent key exists for this scene but no adjudicator has been written"
                                          : "this scene has no independent measurable a knob search could be right or wrong about" }, 400);
                const runs = [];
                for (const id of row.proposerIds) {
                    const t0 = Date.now();
                    const r = P.runProposer(id);
                    const p = P.getProposer(id);
                    runs.push({
                        id, tier: r.tier, knobs: p.knobs, notes: p.notes, ms: Date.now() - t0,
                        tried: r.tried, adjudicated: r.adjudicated,
                        greedy: r.best, greedyScore: r.bestScore, greedyVerdict: r.verdict,
                        accepted: r.accepted, acceptedScore: r.acceptedScore, acceptedRank: r.acceptedRank,
                        acceptedVerdict: r.acceptedVerdict,
                        scored: r.scored.map((s) => ({ candidate: s.candidate, score: s.score,
                                                       pass: s.verdict ? s.verdict.pass : null })),
                    });
                }
                sendJson({ ok: true, scene, knob: row.knob, runs, applied: false,
                           note: "PROPOSED, NOT APPLIED. tier 'propose' means a human or a gate sets the value; " +
                                 "this route cannot apply one. `scored[].pass` is null for candidates the loop " +
                                 "never needed to adjudicate, which is not the same as a refusal." });
            } catch (e) { sendJson({ ok: false, error: String((e && e.message) || e) }, 500); }
        })();
        return true;
    }
    if (req.method === "GET" && url.startsWith("/instruments/list")) {
        (async () => {
            try {
                const I = await import("../physics/instruments.mjs");
                const out = [];
                for (const i of I.INSTRUMENTS) {
                    if (!i.gate) continue;
                    const mod = i.gate.replace(/-selfcheck\.mjs$/, ".mjs");
                    const abs = path.join(__dirname, "..", mod);
                    if (!fs.existsSync(abs)) continue;
                    if (!/export\s+(async\s+)?function\s+reportLines/.test(fs.readFileSync(abs, "utf8"))) continue;
                    out.push({ id: i.id, name: i.name, area: i.area, module: mod, gate: i.gate, hasPage: !!i.page });
                }
                sendJson({ ok: true, instruments: out });
            } catch (e) { sendJson({ ok: false, error: String((e && e.message) || e) }, 500); }
        })();
        return true;
    }
    if (req.method === "GET" && url.startsWith("/instruments/report")) {
        (async () => {
            try {
                const id = new URL(url, "http://x").searchParams.get("id");
                const I = await import("../physics/instruments.mjs");
                const inst = I.INSTRUMENTS.find((x) => x.id === id);
                if (!inst || !inst.gate) return sendJson({ ok: false, error: "no such instrument: " + id }, 404);
                const mod = inst.gate.replace(/-selfcheck\.mjs$/, ".mjs");
                const abs = path.join(__dirname, "..", mod);
                if (!fs.existsSync(abs)) return sendJson({ ok: false, error: "module missing: " + mod }, 404);
                const M = await import(pathToFileURL(abs).href);
                if (typeof M.reportLines !== "function")
                    // NAMED, NOT BLANK: a module without the split is a different situation from one that ran
                    // and printed nothing, and a page showing an empty box cannot tell you which.
                    return sendJson({ ok: false, error: mod + " has no reportLines(); it predates the v3327 split" }, 409);
                const t0 = Date.now();
                const lines = await M.reportLines();
                sendJson({ ok: true, id, name: inst.name, area: inst.area, module: mod, gate: inst.gate,
                           ms: Date.now() - t0, lines });
            } catch (e) { sendJson({ ok: false, error: String((e && e.message) || e) }, 500); }
        })();
        return true;
    }
    if (req.method === "GET" && url === "/pages/placements") {
        (async () => {
            try {
                const M = await import("../tools/ship/pagePlacements.mjs");
                let suggest = null;
                try {
                    const P = await import("../tools/ship/pagePlacement.mjs");
                    const inv = P.inventory(), prof = P.panelProfiles(inv);
                    suggest = (f) => P.suggestFor(f, inv, prof);
                } catch { /* the suggester is optional: without it, `auto` resolves to auto-unreached */ }
                const res = M.resolve(undefined, { suggest });
                // *** THE ALPHABETICAL HOLDING BUCKETS ARE COMPUTED HERE, NOT IN THE BROWSER. *** The packing
                // rule -- letters greedy to the cap, deepening the prefix ONLY where one letter alone overflows
                // -- is one decision, and a second copy in page JavaScript would drift from this one the first
                // time either changed. The page renders what it is handed.
                let buckets = [], titles = {};
                try {
                    const P2 = await import("../tools/ship/pagePlacement.mjs");
                    const inv = P2.inventory();
                    titles = Object.fromEntries([...inv.pages.entries()]);
                    buckets = M.alphaBuckets(M.unclaimed(res, inv.pages.keys()));
                } catch { /* without the walker there is nothing to bucket; the drawer renders empty and says so */ }
                sendJson({
                    ok: true, topics: M.allTopics(), overCap: M.overCap(res),
                    // v3689 -- the Mac VIEW's membership, served from the ONE place it is declared
                    // (pagePlacements.macPages). A copy of this list in server.html would drift the first time
                    // a page was added, and the list exists precisely so a reader can disagree with one entry.
                    macPages: (typeof M.macPages === "function") ? M.macPages() : [],
                    pages: Object.fromEntries([...res.entries()].map(([f, r]) => [f, r])),
                    buckets, titles,
                    // the raw override layer too, so the editor can show what is a DECISION and what is inherited
                    overrides: M.read().pages,
                });
            } catch (e) { sendJson({ ok: false, error: String((e && e.message) || e) }, 500); }
        })();
        return true;
    }
    if (req.method === "POST" && url === "/pages/placements") {
        let body = "";
        req.on("data", (d) => { body += d; if (body.length > 512000) req.destroy(); });
        req.on("end", async () => {
            try {
                const j = JSON.parse(body || "{}");
                const M = await import("../tools/ship/pagePlacements.mjs");
                const cur = M.read();
                // ONE PAGE AT A TIME when `file` is given, whole state when `pages` is. A checkbox that had to
                // send the entire table on every click would lose a concurrent edit from another tab.
                const next = { ...cur, pages: { ...cur.pages } };
                if (j.file) next.pages[j.file] = j.entry || {};
                else if (j.pages) next.pages = j.pages;
                const w = M.write(next);
                // ECHO THE RESOLVED TRUTH, not the request: v3575's tunnel checkbox painted from its own click
                // and reported a write it had never confirmed.
                const res = M.resolve();
                sendJson({ ok: true, written: w.written, dropped: w.dropped,
                           entry: j.file ? (res.get(j.file) || null) : null,
                           overCap: M.overCap(res) });
            } catch (e) { sendJson({ ok: false, error: String((e && e.message) || e) }, 400); }
        });
        return true;
    }
    if (req.method === "GET" && url === "/tunnels/schedule") {
        (async () => {
            try {
                const { readSched } = await schedIO();
                sendJson(readSched());
            } catch (e) { sendJson({ error: String((e && e.message) || e) }, 500); }
        })();
        return true;
    }
    if (req.method === "POST" && url === "/tunnels/schedule") {
        let body = "";
        req.on("data", (d) => { body += d; if (body.length > 8192) req.destroy(); });
        req.on("end", async () => {
            try {
                const j = JSON.parse(body || "{}");
                const { readSched, writeSched } = await schedIO();
                const cur = readSched();
                const next = {
                    ...cur,
                    // clamped: under an hour thrashes cloudflare and burns URLs faster than they verify;
                    // over a day is indistinguishable from off, and "off" should be said with the switch.
                    everyHours: Math.min(24, Math.max(1, Number(j.everyHours) || cur.everyHours)),
                    enabled: j.enabled === undefined ? cur.enabled : !!j.enabled,
                };
                writeSched(next);
                sendJson({ ok: true, ...next });
            } catch (e) { sendJson({ ok: false, error: String((e && e.message) || e) }, 400); }
        });
        return true;
    }
    if (req.method === "GET" && url === "/tunnels") {
        (async () => {
            try {
                const fs = await import("node:fs"); const path = await import("node:path");
                const f = path.join(process.cwd(), "tools", "roundhouse", "tunnel-candidates.json");
                const T = await import("../tools/roundhouse/tunnelCandidates.mjs");
                let reg; try { reg = JSON.parse(fs.readFileSync(f, "utf8")); } catch { reg = T.emptyCandidates(); }
                sendJson({ ordered: T.orderedCandidates(reg), registry: reg, lines: T.candidateLines(reg) });
            } catch (e) { sendJson({ error: String((e && e.message) || e) }, 500); }
        })();
        return true;
    }
    if (req.method === "POST" && (url === "/tunnels/add" || url === "/tunnels/attempt" || url === "/tunnels/retire")) {
        let body = "";
        req.on("data", (d) => { body += d; if (body.length > 256 * 1024) req.destroy(); });
        req.on("end", async () => {
            try {
                const j = JSON.parse(body || "{}");
                const fs = await import("node:fs"); const path = await import("node:path");
                const f = path.join(process.cwd(), "tools", "roundhouse", "tunnel-candidates.json");
                const T = await import("../tools/roundhouse/tunnelCandidates.mjs");
                let reg; try { reg = JSON.parse(fs.readFileSync(f, "utf8")); } catch { reg = T.emptyCandidates(); }
                if (url === "/tunnels/add") for (const u of [].concat(j.url || j.urls || [])) reg = T.addCandidate(reg, u, { label: j.label || null });
                else if (url === "/tunnels/attempt") reg = T.recordAttempt(reg, j.url, !!j.ok);
                else reg = T.retire(reg, j.url, j.retired !== false);
                fs.writeFileSync(f, JSON.stringify(reg, null, 2) + "\n");
                sendJson({ ok: true, ordered: T.orderedCandidates(reg), count: Object.keys(reg.urls).length });
            } catch (e) { sendJson({ ok: false, error: String((e && e.message) || e) }, 400); }
        });
        return true;
    }
    if (req.method === "POST" && url === "/lighthouse/checkin") {
        let body = "";
        req.on("data", (d) => { body += d; if (body.length > 4 * 1024 * 1024) req.destroy(); });
        req.on("end", async () => {
            try {
                const rep = JSON.parse(body || "{}");
                if (!rep || typeof rep !== "object" || !rep.master) return sendJson({ ok: false, error: "check-in needs a fingerprint with a master hash" }, 400);
                const fs = await import("node:fs"); const path = await import("node:path");
                const f = path.join(process.cwd(), "tools", "roundhouse", "lighthouse-roster.json");
                const lh = await import("../tools/roundhouse/lighthouse.mjs");
                let roster; try { roster = JSON.parse(fs.readFileSync(f, "utf8")); } catch { roster = lh.emptyRoster(); }
                const hint = (req.headers["cf-connecting-ip"] ? "via-tunnel" : (req.socket && req.socket.remoteAddress) || null);
                const updated = lh.checkIn(roster, rep, { origin: "push", remoteHint: hint });
                fs.writeFileSync(f, JSON.stringify(updated, null, 2) + "\n");
                const sum = lh.rosterSummary(updated);
                // v2957: tell the peer whether a newer build exists. TELL, not push -- see the note in
                // lighthouse_checkin.mjs. The engine's own updateManifest already refuses to auto-apply anything
                // but vendored npm packages ("external install -- use the link"); shipping engine code to a
                // remote machine unasked would be a far bigger step than that precedent allows.
                let update = null;
                try {
                    const mainJs = fs.readFileSync(path.join(process.cwd(), "main.js"), "utf8");
                    const m = mainJs.match(/ENGINE_VERSION\s*=\s*"(v\d+)"/);
                    const hubV = m ? m[1] : null;
                    const yours = rep.engineVersion || null;
                    const n = (v) => (v ? parseInt(String(v).replace(/^v/, ""), 10) : NaN);
                    update = { hub: hubV, yours, newer: Number.isFinite(n(hubV)) && Number.isFinite(n(yours)) ? n(hubV) > n(yours) : null };
                } catch {}
                sendJson({ ok: true, key: lh.peerKey(rep), peerCount: sum.peerCount, fleetAgrees: sum.masters.length <= 1, masters: sum.masters.length, update });
            } catch (e) { sendJson({ ok: false, error: String((e && e.message) || e) }, 400); }
        });
        return true;
    }
    if (req.method === "GET" && url === "/lighthouse") {
        (async () => {
            try {
                const fs = await import("node:fs"); const path = await import("node:path");
                const f = path.join(process.cwd(), "tools", "roundhouse", "lighthouse-roster.json");
                const lh = await import("../tools/roundhouse/lighthouse.mjs");
                let roster; try { roster = JSON.parse(fs.readFileSync(f, "utf8")); } catch { roster = lh.emptyRoster(); }
                const sum = lh.rosterSummary(roster);
                sendJson({ roster, summary: sum, lines: lh.rosterLines(sum) });
            } catch (e) { sendJson({ error: String((e && e.message) || e) }, 500); }
        })();
        return true;
    }
    if (req.method === "GET" && url === "/metrics") {
        (async () => {
            try {
                const fs = await import("node:fs"); const path = await import("node:path");
                const rh = path.join(process.cwd(), "tools", "roundhouse");
                const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(rh, f), "utf8")); } catch { return null; } };
                const subDir = path.join(rh, "submissions");
                let submissions = [];
                try { submissions = fs.readdirSync(subDir).filter((f) => f.endsWith(".json")).map((f) => ({ file: f, at: f.slice(0, 24).replace(/-/g, (c, i) => (i === 13 || i === 16 ? ":" : c)) })); } catch {}
                const transcripts = [read("android-phone.json"), read("android-reference.json")].filter(Boolean);
                const { peerMetrics, metricLines } = await import("../tools/roundhouse/peerMetrics.mjs");
                const m = peerMetrics({ deviceLedger: read("device-ledger.json"), transcripts, submissions, perfLedger: read("perf-ledger.json"), jobQueue: read(JOB_QUEUE_FILE), roster: read("lighthouse-roster.json") });
                sendJson({ ...m, lines: metricLines(m) });
            } catch (e) { sendJson({ error: String((e && e.message) || e) }, 500); }
        })();
        return true;
    }
    if (req.method === "GET" && url === "/devices") {
        (async () => {
            try {
                const fs = await import("node:fs");
                const path = await import("node:path");
                const f = path.join(process.cwd(), "tools", "roundhouse", "device-ledger.json");
                const { gradeFleet, emptyDeviceLedger, fleetLines } = await import("../tools/roundhouse/deviceLedger.mjs");
                const ledger = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : emptyDeviceLedger();
                const grade = gradeFleet(ledger);
                sendJson({ ledger, grade, lines: fleetLines(grade) });
            } catch (e) { sendJson({ error: String((e && e.message) || e) }, 500); }
        })();
        return true;
    }
    if (req.method === "GET" && url === "/perf") {
        (async () => {
            try {
                const fs = await import("node:fs");
                const path = await import("node:path");
                const ledgerPath = path.join(process.cwd(), "tools", "roundhouse", "perf-ledger.json");
                const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, "utf8")) : { kind: "swek-perf-ledger", checks: {} };
                const { gradePerf } = await import("../tools/roundhouse/perfLedger.mjs");
                sendJson({ ledger, grade: gradePerf(ledger) });
            } catch (e) { sendJson({ error: String((e && e.message) || e) }, 500); }
        })();
        return true;
    }
    if (req.method === "POST" && url === "/ledger/merge") {
        let body = ""; req.on("data", (d) => { body += d; if (body.length > 4194304) req.destroy(); });
        req.on("end", () => {
            let incoming = { version: 1, entries: {} };
            try { incoming = JSON.parse(body || "{}").ledger || incoming; } catch { }
            import("../tools/ledger/ledger.mjs").then((m) => {
                const { merged, divergences } = m.mergeLedgers(m.loadLedger(), incoming);
                m.saveLedger(merged);
                sendJson({ ok: true, entryCount: Object.keys(merged.entries).length, divergences });
            }).catch((e) => sendJson({ error: String((e && e.message) || e) }, 500));
        });
        return true;
    }
    return false;
}

// v2985 -- fetchJson is EXPORTED so the benchmark collector can reuse it rather than writing a second peer
// HTTP client. This tree has paid for duplicate implementations of one job repeatedly (five spatial structures
// that never met, a second claims parser that disagreed with the first on its first run), and a second fetcher
// with its own timeout semantics would be the same mistake in the transport layer.
module.exports = { _observablesCacheState, handle, compareFingerprints, localFingerprint, collect, fetchJson };

// v2962: one place that knows where the queue lives, so the four job routes cannot disagree about it.
// v3000 -- ONE OWNER FOR THE QUEUE FILENAME. It was written out twice: here, and again inside the /metrics
// route, which read it through a different helper with its own base directory. Both happened to resolve to the
// same file, which is what made it invisible -- the duplicate is only dangerous the day one of them moves, and
// then the metrics route reports an EMPTY QUEUE rather than an error. A gauge that reads zero jobs because it
// looked in the wrong place is worse than one that fails, because a quiet fleet looks exactly like that.
//
// This is the same duplicated-table class this lab keeps finding: five spatial structures that never met, a
// second claims parser that disagreed with the first on its first run, two implementations of "this box's
// score" one round apart. The fix is always the same shape -- name the thing once.
const JOB_QUEUE_FILE = "job-queue.json";

async function jobsIO() {
    const fs = await import("node:fs"); const path = await import("node:path");
    const J = await import("../tools/roundhouse/jobQueue.mjs");
    // v3211 -- WAS `const { MODES } = ...` AND deviceModes HAS NEVER EXPORTED MODES. A destructured dynamic
    // import does not crash: it bound undefined, and validateSpec's `!modes` branch then refused EVERY
    // device-mode job with `unknown device "lens"` -- the server blaming the caller for its own broken import.
    // POST /jobs/add has been dead for as long as that line has existed, and it read like operator error.
    const { deviceModeTable } = await import("../tools/roundhouse/deviceModes.mjs");
    const MODES = await deviceModeTable();
    const f = path.join(process.cwd(), "tools", "roundhouse", JOB_QUEUE_FILE);
    return {
        J, MODES,
        readQ: () => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return J.emptyQueue(); } },
        writeQ: (q) => fs.writeFileSync(f, JSON.stringify(q, null, 2) + "\n"),
    };
}

// v2966: the rotation schedule lives in one file, read and written through one accessor.
async function schedIO() {
    const fs = await import("node:fs"); const path = await import("node:path");
    const f = path.join(process.cwd(), "tools", "roundhouse", "tunnel-schedule.json");
    const DEF = { enabled: false, everyHours: 4, lastRotatedAt: null };
    return {
        readSched: () => { try { return { ...DEF, ...JSON.parse(fs.readFileSync(f, "utf8")) }; } catch { return { ...DEF }; } },
        // v3575 -- *** THE PARENT DIRECTORY IS CREATED, AND NOT DOING SO IS WHY THE CHECKBOX WOULD NOT STAY
        // CHECKED. *** The path is resolved against process.cwd(), so on any launch whose working directory is
        // not WebGLEngine, tools/roundhouse does not exist and writeFileSync throws ENOENT. The POST handler
        // answered 400, THE BROWSER'S push() SWALLOWED IT with an empty .catch, and the next GET fell into
        // readSched's silent catch and returned the DEFAULT -- enabled:false. Tick the box, reload, unticked,
        // with nothing anywhere saying the write had failed. Three separate silences in a row, each of them
        // individually defensible.
        writeSched: (v) => {
            fs.mkdirSync(path.dirname(f), { recursive: true });
            fs.writeFileSync(f, JSON.stringify(v, null, 2) + "\n");
        },
    };
}

// v2967 -- THE ROTATION TIMER. Polls once a minute, asks tunnelRotator.tick() what to do, and performs only what
// it is told. The decision is pure and lives in the rotator; this function is the effect and nothing else, which
// is why the backoff, the due-check and the failure accounting can all be tested without a cloudflared binary.
//
// It is deliberately conservative about what counts as success: the tunnel URL must actually APPEAR. cloudflared
// spawning without error is not a tunnel -- hostingBridge already knows a quick tunnel comes up bad-gateway
// about a third of the time -- so a spawn that yields no URL within the grace window is recorded as a FAILURE
// and backs off, rather than resetting the clock on a tunnel that never existed.
let _rotTimer = null;
function startRotationTimer() {
    if (_rotTimer) return;
    _rotTimer = setInterval(async () => {
        try {
            const { readSched, writeSched } = await schedIO();
            const R = await import("../tools/roundhouse/tunnelRotator.mjs");
            const sched = readSched();
            // v3575 -- tell the rotator whether anything is actually serving, so the switch means "keep a
            // tunnel up". null when hostingBridge cannot be asked, which the rotator treats as UNKNOWN rather
            // than as absent -- guessing "no tunnel" would spawn a duplicate every minute.
            let host = null; try { host = require("./hostingBridge.js"); } catch {}
            let live = null;
            try { const st = host && host.tunnelStatus && host.tunnelStatus(); if (st) live = !!st.url; } catch {}
            const d = R.tick(sched, { tunnelLive: live });
            if (d.act !== "rotate") return;

            if (!host || typeof host.tunnelStart !== "function") {
                return writeSched(R.recordAttemptResult(sched, false, { error: "hostingBridge.tunnelStart unavailable" }));
            }
            const started = host.tunnelStart();
            // give the URL a moment to appear in the process log before judging the attempt
            await new Promise((r) => setTimeout(r, 20000));
            let url = null;
            try { const st = host.tunnelStatus && host.tunnelStatus(); url = (st && st.url) || (started && started.url) || null; } catch {}

            if (url) {
                // ADDITIVE (v2957): register the new address as a candidate; nothing is retired.
                const fs = await import("node:fs"); const path = await import("node:path");
                const f = path.join(process.cwd(), "tools", "roundhouse", "tunnel-candidates.json");
                const T = await import("../tools/roundhouse/tunnelCandidates.mjs");
                let reg; try { reg = JSON.parse(fs.readFileSync(f, "utf8")); } catch { reg = T.emptyCandidates(); }
                reg = R.onTunnelStarted(reg, url, { label: "scheduled rotation" }).registry;
                try { reg = T.ingestRegistry(reg, require("./tunnelRegistry.js").aliveUrls() || []); } catch {}
                fs.writeFileSync(f, JSON.stringify(reg, null, 2) + "\n");
                writeSched(R.recordAttemptResult(sched, true, { url }));
            } else {
                writeSched(R.recordAttemptResult(sched, false, { error: (started && started.error) || "no URL appeared within the grace window" }));
            }
        } catch (e) { /* a timer must never throw into the event loop */ }
    }, 60000);
    if (_rotTimer.unref) _rotTimer.unref();   // never hold the process open just to rotate
}
try { startRotationTimer(); } catch {}
