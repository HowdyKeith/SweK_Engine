// WebGLEngine/tools/ship/modelBench-selfcheck.mjs -- v2827
//
// Run: node tools/ship/modelBench-selfcheck.mjs   (~4s, runs real device loops)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/roundhouse/modelBench.mjs + /device/bench/*.
//
// THE THING WORTH GATING IS THE TAXONOMY. A report that folded MALFORMED into REFUSED would say "this model is
// bad at physics" when the truth might be "this model cannot emit JSON" -- and those have opposite fixes. So the
// four-way classification is pinned against the ACTUAL verdict shapes numericVerdict emits, and the collation is
// pinned to exclude sim and transport failures from the rates rather than charging them to the model.
//
// AND THE SCHEDULING CLAIM IS CHECKED, not asserted: peers must run in PARALLEL (a serial implementation would
// take the sum of the peers' times, not the max), and one peer failing must not take the matrix with it.

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyVerdict, classifyRun, runOne, runPeer, runMatrix, collate, collateByDevice, benchReport, OUTCOMES } from "../roundhouse/modelBench.mjs";
import { getDevice } from "../roundhouse/devices.mjs";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// 1. THE FOUR-WAY CLASSIFICATION, against the shapes numericVerdict really emits
{
    ok("done:true is crystallised", classifyVerdict({ done: true, measured: 5 }) === "crystallised");
    ok("a WELL-FORMED claim the physics rejected is REFUSED (the model was wrong)",
        classifyVerdict({ done: false, measured: 0.9, max: 0.5 }) === "refused");
    for (const r of ["observable-missing: captured", "observable-not-numeric: x", "no-measurable-claim", "no-comparator-in-claim"]) {
        ok(`"${r.slice(0, 24)}" is MALFORMED (the model could not state a claim)`, classifyVerdict({ done: false, reason: r }) === "malformed");
    }
    ok("a simulation failure is simError, NOT the model's fault",
        classifyVerdict({ done: false, reason: "simulation-diverged (raise tau)" }) === "simError");
    ok("no verdict at all is callerError", classifyVerdict(null) === "callerError");
    ok("REFUSED and MALFORMED are genuinely distinct outcomes",
        classifyVerdict({ done: false, measured: 1 }) !== classifyVerdict({ done: false, reason: "no-measurable-claim" }));
}

// 2. classifyRun reads the LAST round, so a model that converges is not punished for its earlier attempts
{
    const r = classifyRun({ crystallized: true, rounds: 3, history: [{ verdict: { done: false, measured: 1 } }, { verdict: { done: true } }] });
    ok("a crystallised run reports crystallised with its round count", r.outcome === "crystallised" && r.rounds === 3);
    const f = classifyRun({ crystallized: false, history: [{ verdict: { done: false, measured: 9, max: 1 } }] });
    ok("a failed run is classified by its FINAL verdict", f.outcome === "refused");
    ok("a thrown run is callerError", classifyRun({ error: "HTTP 500" }).outcome === "callerError");
}

// 3. COLLATION excludes what is not the model's fault
{
    const runs = [
        { model: "m", peer: "p", device: "d", outcome: "crystallised", rounds: 1, msPerRound: 100 },
        { model: "m", peer: "p", device: "d", outcome: "refused", rounds: 2, msPerRound: 100 },
        { model: "m", peer: "p", device: "d", outcome: "malformed", rounds: 1, msPerRound: 100 },
        { model: "m", peer: "p", device: "d", outcome: "simError", rounds: 0, msPerRound: 100 },
        { model: "m", peer: "p", device: "d", outcome: "callerError", rounds: 0, msPerRound: 100 },
    ];
    const [row] = collate(runs);
    ok("rates are over USABLE runs only (sim + transport failures excluded)", row.usableRuns === 3, String(row.usableRuns));
    ok("cheap-win rate is 1 of 3, not 1 of 5", Math.abs(row.cheapWinRate - 1 / 3) < 1e-9, row.cheapWinRate.toFixed(4));
    ok("the excluded failures are still REPORTED, not hidden", row.simErrors === 1 && row.callerErrors === 1);
    ok("the three rates sum to 1 over usable runs", Math.abs(row.cheapWinRate + row.refusedRate + row.malformedRate - 1) < 1e-9);
    ok("mean rounds counts only crystallised runs", row.meanRoundsToCrystallise === 1);
}

// 4. LATENCY IS PER (MODEL, PEER) AND NEVER AVERAGED ACROSS PEERS
{
    const runs = [
        { model: "m", peer: "fastGPU", device: "d", outcome: "crystallised", rounds: 1, msPerRound: 200 },
        { model: "m", peer: "slowCPU", device: "d", outcome: "crystallised", rounds: 1, msPerRound: 20000 },
    ];
    const [row] = collate(runs);
    ok("latency is reported per peer", Object.keys(row.msPerRoundByPeer).length === 2);
    ok("...and the two peers keep their own numbers", row.msPerRoundByPeer.fastGPU === 200 && row.msPerRoundByPeer.slowCPU === 20000);
    ok("there is NO single cross-peer latency field to mislead with", !("msPerRound" in row) && !("meanMs" in row));
    ok("the report says latency is not comparable across peers", /NOT comparable across peers/.test(benchReport(runs)));
}

// 5. THE MATRIX RUNS PEERS IN PARALLEL, and survives one of them dying
{
    const devices = [{ name: "geometry", device: await getDevice("geometry") }];
    const good = { mode: "sphere", claim: { observable: "watertight", equals: true } };
    const slow = (ms) => async () => { await new Promise((r) => setTimeout(r, ms)); return good; };
    // Measure against a SERIAL baseline rather than an absolute threshold. The first version of this check used
    // a magic number and failed -- not because the code was serial, but because the geometry device itself costs
    // ~500ms per run, which the threshold did not account for. A comparison cannot be wrong about that.
    const mk = async () => { const f = slow(300); return async (role) => (role === "proposer" ? f() : { note: "ok" }); };
    const three = [{ peer: "a", url: "u", model: "A" }, { peer: "b", url: "u", model: "B" }, { peer: "c", url: "u", model: "C" }];

    const tSerial = Date.now();
    for (const a of three) await runMatrix({ assignments: [a], devices, runsPer: 1, maxRounds: 1, makeCaller: mk });
    const serialMs = Date.now() - tSerial;

    const t0 = Date.now();
    const m = await runMatrix({ assignments: three, devices, runsPer: 1, maxRounds: 1, makeCaller: mk });
    const elapsed = Date.now() - t0;
    ok("all peers produced runs", m.runs.length === 3, String(m.runs.length));
    ok("peers ran in PARALLEL (measurably faster than the same work done serially)", elapsed < serialMs * 0.7,
        `parallel ${elapsed}ms vs serial ${serialMs}ms`);

    const m2 = await runMatrix({
        assignments: [{ peer: "ok", url: "u", model: "OK" }, { peer: "dead", url: "u", model: "DEAD" }],
        devices, runsPer: 1, maxRounds: 1,
        makeCaller: async ({ model }) => { if (model === "DEAD") throw new Error("peer unreachable"); return async (role) => (role === "proposer" ? good : { note: "ok" }); },
    });
    ok("a peer that dies does NOT take the matrix with it", m2.runs.length === 1 && m2.peers.some((p) => p.failed), JSON.stringify(m2.peers.map((p) => p.peer + (p.failed ? ":failed" : ":ok"))));
    ok("...and the dead peer records a reason", m2.peers.find((p) => p.failed).reason.includes("unreachable"));
    const skipped = await runMatrix({ assignments: [{ peer: "x", url: "u", model: null, reason: "nothing fits" }], devices, runsPer: 1, makeCaller: async () => async () => ({}) });
    ok("a peer with no assignable model is skipped WITH its reason", skipped.peers[0].skipped === true && !!skipped.peers[0].reason);
}

// 6. A REAL MIXED MATRIX -- three synthetic models with three DIFFERENT failure modes
{
    const devices = [];
    for (const n of ["geometry", "chaos"]) devices.push({ name: n, device: await getDevice(n) });
    const behaviours = {
        GOOD: { mode: "sphere", claim: { observable: "watertight", equals: true } },
        WRONG: { mode: "sphere", claim: { observable: "volumeErrFrac", max: -1 } },
        GARBLED: { mode: "sphere", claim: { observable: "notAnObservable", max: 1 } },
    };
    const m = await runMatrix({
        assignments: Object.keys(behaviours).map((k, i) => ({ peer: "p" + i, url: "u", model: k })),
        devices, runsPer: 1, maxRounds: 1,
        makeCaller: async ({ model }) => async (role) => (role === "proposer" ? behaviours[model] : { note: "ok" }),
    });
    const rows = collate(m.runs);
    const g = rows.find((r) => r.model === "GARBLED"), w = rows.find((r) => r.model === "WRONG");
    ok("a model that names a nonexistent observable scores MALFORMED, not refused", g.malformedRate === 1 && g.refusedRate === 0);
    ok("a model that is merely WRONG scores refused on the device where its claim is valid", w.refusedRate > 0 && w.malformedRate < 1,
        `refused ${w.refusedRate.toFixed(2)} malformed ${w.malformedRate.toFixed(2)}`);
    ok("the two failure modes are told apart in the report", /MALFORMED means it could not state a claim/.test(benchReport(m.runs)));
    const devRows = collateByDevice(m.runs);
    ok("a per-device view exists (a hard device is a property of the DEVICE)", devRows.length === 2 && devRows.every((d) => "winRate" in d));
}

// 7. THE BRIDGE end to end, including the naming trap that bit here
{
    const bridge = require(path.join(ENG, "ai-bridge", "deviceBridge.js"));
    const call = (url, method = "GET", body = null) => new Promise(async (r) => {
        const req = { url, method, on(ev, cb) { if (ev === "data" && body) cb(JSON.stringify(body)); if (ev === "end") cb(); return req; } };
        await bridge.handle(req, {}, { sendJson: (o, c = 200) => r({ body: o, code: c }) });
    });
    const noPeers = await call("/device/bench/start", "POST", { peers: [] });
    ok("a matrix with no peers is refused", noPeers.code === 400 && noPeers.body.error === "no-peers");
    const badDev = await call("/device/bench/start", "POST", { peers: [{ name: "p", url: "u", kind: "gpu", memoryGB: 8 }], devices: ["nope"] });
    ok("an unknown device is refused", badDev.code === 400 && badDev.body.error === "unknown-device");

    const s = await call("/device/bench/start", "POST", {
        caller: "mock", runsPer: 1, maxRounds: 2, devices: ["geometry", "chaos"],
        peers: [{ name: "rig", url: "u", kind: "gpu", memoryGB: 8 }, { name: "cpu", url: "u", kind: "cpu", memoryGB: 16 }],
    });
    ok("a matrix starts and assigns one model per peer", s.body.ok && s.body.assignments.length === 2 && s.body.assignments.every((a) => a.model));
    ok("...distinct models, so two peers do not measure the same thing", new Set(s.body.assignments.map((a) => a.model)).size === 2);
    let p;
    for (let i = 0; i < 300; i++) { await new Promise((r) => setTimeout(r, 120)); p = await call("/device/progress?id=" + s.body.runId); if (p.body.done) break; }
    ok("the matrix completes", p.body.done === true && !p.body.error, p.body.error || "");
    ok("...and every planned run landed", p.body.rounds.length === s.body.total, `${p.body.rounds.length}/${s.body.total}`);
    // THE NAMING TRAP: DEMO_HYPS is keyed by REGISTRY name, the payload carries the DESCRIPTIVE one. The first
    // version looked up a key that does not exist and every run came back malformed -- a 0% win rate that read
    // as a model result. If that regresses, the mock path scores zero, so this check is the tripwire.
    const rows = p.body.result.models;
    ok("MOCK PATH SCORES ~100% -- the demo claims are true, so anything less means the lookup broke again",
        rows.every((r) => r.cheapWinRate > 0.9), rows.map((r) => r.model + " " + (r.cheapWinRate * 100).toFixed(0) + "%").join(", "));
    ok("the report is rendered", typeof p.body.result.report === "string" && p.body.result.report.includes("cheap-win"));
}


// 8. THE EVENT LOOP IS RELEASED BETWEEN RUNS -- without this, progress and stop are both lies
{
    const fs2 = await import("node:fs");
    const src = fs2.readFileSync(path.join(ENG, "tools", "roundhouse", "modelBench.mjs"), "utf8");
    ok("runPeer yields to the event loop between runs", /yieldToLoop\(\)/.test(src) && /await yieldToLoop\(\);/.test(src));
    ok("...and the reason is recorded where the next person will read it", /blocks?|block/i.test(src) && /47\.8 seconds|event loop/i.test(src));

    // A device build is synchronous CPU work, so an observer that never gets scheduled sees nothing until the
    // end. Prove the observer is called DURING the matrix rather than after it, and that shouldStop is honoured.
    const devices = [{ name: "geometry", device: await getDevice("geometry") }];
    const good = { mode: "sphere", claim: { observable: "watertight", equals: true } };
    let seen = 0, stopAfter = 3;
    const m = await runMatrix({
        assignments: [{ peer: "p", url: "u", model: "M" }],
        devices, runsPer: 20, maxRounds: 1,
        makeCaller: async () => async (role) => (role === "proposer" ? good : { note: "ok" }),
        onProgress: () => { seen++; },
        shouldStop: () => seen >= stopAfter,
    });
    ok("shouldStop HALTS the matrix rather than being ignored", m.runs.length < 20 && m.runs.length >= stopAfter,
        `${m.runs.length} of 20 (stop armed after ${stopAfter})`);
    ok("...within one run of the request", m.runs.length <= stopAfter + 1, String(m.runs.length));
    ok("the peer records that it stopped rather than finishing", m.peers[0].stopped === true);
    ok("partial data survives a stop (a stopped run is still a measurement)", collate(m.runs).length === 1 && collate(m.runs)[0].total === m.runs.length);
}


// 9. A MIXED MATRIX: local and remote peers together, each routed to its own provider
{
    const devices = [{ name: "geometry", device: await getDevice("geometry") }];
    const good = { mode: "sphere", claim: { observable: "watertight", equals: true } };
    const seenKinds = [];
    const m = await runMatrix({
        assignments: [
            { peer: "local", url: "http://localhost:11434", model: "llama3.1:8b", kind: "gpu", provider: null, minIntervalMs: 0 },
            { peer: "remote", url: "remote", model: "gemini-2.5-flash", kind: "remote", provider: "gemini", minIntervalMs: 40 },
        ],
        devices, runsPer: 2, maxRounds: 1,
        makeCaller: async ({ peer }) => { seenKinds.push(peer.kind); return async (role) => (role === "proposer" ? good : { note: "ok" }); },
    });
    ok("both a local and a remote peer produce runs", m.runs.length === 4, String(m.runs.length));
    ok("the caller factory SEES each peer's kind, so it can route by provider", seenKinds.includes("gpu") && seenKinds.includes("remote"), seenKinds.join(","));
    const rows = collate(m.runs);
    ok("the report holds both models side by side", rows.length === 2 && rows.some((r) => r.model.startsWith("gemini")));
    ok("...and each keeps its own peer", rows.every((r) => r.peers.length === 1));

    // pacing must actually delay, or a free tier will be hit with a wall of 429s
    const t0 = Date.now();
    await runMatrix({
        assignments: [{ peer: "r", url: "u", model: "m", kind: "remote", provider: "gemini", minIntervalMs: 250 }],
        devices, runsPer: 3, maxRounds: 1,
        makeCaller: async () => async (role) => (role === "proposer" ? good : { note: "ok" }),
    });
    ok("a PACED peer takes at least its interval per run", Date.now() - t0 >= 500, (Date.now() - t0) + "ms for 3 runs at 250ms pacing");
}

console.log("modelBench-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
