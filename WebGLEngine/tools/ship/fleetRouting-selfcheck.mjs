// tools/ship/fleetRouting-selfcheck.mjs -- v4584
//
// FLEET BRAIN ROUTING, NAMED. Task 72 asked what the gauges call a "fleet brain request" and for every one to say WHICH
// peer took it and WHAT it was, in the grid view and the gauge, with a gate that a routed request is attributed; then for
// the race's training and lockstep ticks to be routed over the same peers.
//
// WHAT A REQUEST WAS, FOUND FIRST: a brain's POST to ai-bridge/gpuBrainBridge.js (hello, flowfield, learn) landing in its
// fleet registry -- counted as `posts`, timed as `solveMsEwma`, never attributed. server.html's brains dial counted them
// (registeredBrains), brain-fleet.html's pool summed their training, report.html's grid showed each peer's version, and
// brain/agent/fleet.js's learned scheduler routed a SIMULATED task stream. No record said which peer took which request.
// brain/fleetRouting.mjs is the record: a request is { kind, scene, policy, ticks: [from, to) }; a routed row is that plus
// the peer, the estimate and the time; the bridge's POST /ai/brain/route routes over the LIVE registry and keeps a ledger
// that GET /ai/brain/routed and /ai/brain/health's `routed` publish, which the gauge card, the pool cards and the grid
// rows read. The trainer's episodes and the race's tick ranges are cut into requests and routed the same way, and RUN here
// by this box standing in for every named peer (every result says `ranOn`), because a peer that runs a box3d episode on
// request is the rig's to build.
//
// FOUND BY THE NUMBERS WHILE BUILDING IT, all three in the first draft: (1) fleet.js's telemetry model slows a brain at a
// kind it does not handle by a FACTOR (0.15), so a fast field-only brain still outran a slow eligible one and took a train
// request -- the router now masks ineligible peers out of the pick outright whenever any eligible peer exists; (2) the
// learned scheduler's prior is an optimistic constant (2.0 s for every brain and kind), so until it had observed a time it
// routed by load alone -- the router seeds the prior from the telemetry's own times; (3) the routed row dropped the
// request's payload (a candidate's weights, its seed), so the first routed episode ran with no policy at all -- the row
// carries the request through. No GPU is touched: this gate runs headless on box3d's wasm, on any box.
//
// SABOTAGES (each restored):
//   A  route() names no peer in the live branch     -> 13 red across A, B, C and D (attribution, the bridge's rows and
//                                                      health, every routed episode and range). THE FIRST DRAFT CRASHED
//                                                      INSTEAD: a null peer threw at A's fourth check and the gate died with
//                                                      2 red printed and three sections never run -- every peer read now
//                                                      goes through pid(), so a row that names no peer is REPORTED, not fatal
//   B  the bridge's health omits `routed`           -> 1 red, by name (B's health check)
//   C  runRoutedRace does not chain the folds       -> 1 red, by name (the last fold is not the fingerprint)
//   D  server.html loses the bgRouted card          -> 1 red, by name (E's gauge-card check)
//   E  the eligibility mask removed                 -> 3 red: the field-only peer takes a train request, an episode and a range
//
// Run: node tools/ship/fleetRouting-selfcheck.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as F from "../../brain/fleetRouting.mjs";
import * as D from "../../brain/drivePolicy.mjs";
import { initNode, mod } from "../../physics/box3d/box3dNode.mjs";
import { worldFromModule } from "../../render/slugTicker.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require_ = createRequire(import.meta.url);
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);
const read = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
// a row's peer id, or null: the gate must REPORT a row that names no peer, never die on it (sabotage A crashed the first draft at A's fourth check)
const pid = (row) => (row && row.peer && row.peer.id) || null;

const st = await initNode(); if (!st.ready) { ok("box3d's wasm", false, st.reason); console.log("\nFAIL -- 1 check(s)"); process.exit(1); }
const worldFrom = () => worldFromModule(mod(), [0, -9.81, 0]);
const BRAINS = [{ id: "fast", gpu: "RTX", solveMsEwma: 20 }, { id: "slow", gpu: "iGPU", solveMsEwma: 80 }, { id: "field-only", gpu: "x", kinds: ["field"], solveMsEwma: 10 }];
const hand = D.handWeights(), cands = [hand, D.perturb(hand, 0.05, D.mulberry(3))];
const SECONDS = 10, EVERY = 200;

sec("A. *** THE ROUTER: EVERY REQUEST NAMES THE PEER THAT TOOK IT AND WHAT IT WAS ***");
{
    const reqs = []; for (let i = 0; i < 12; i++) reqs.push({ kind: "train", scene: 1 + (i % 2), policy: "cand" + (i % 3), ticks: [0, 600] });
    const { rows, summary } = F.routeAll(BRAINS, reqs);
    ok("every routed row is attributed (peer, kind, scene, policy, ticks, time)", rows.every(F.isAttributed) && summary.unattributed === 0, summary.unattributed + " unattributed of " + rows.length);
    const count = (id) => (summary.peers.find((p) => p.id === id) || { count: 0 }).count;
    ok("!! the fast peer takes more than the slow one (20 ms vs 80 ms solves)", count("fast") > count("slow") && count("slow") >= 1, `fast ${count("fast")}, slow ${count("slow")}`);
    ok("!! *** a peer that handles only 'field' takes NO train request (masked, not merely slowed) ***", count("field-only") === 0, `field-only ${count("field-only")}`);
    const fr = F.routeAll(BRAINS, [{ kind: "field", scene: "world", policy: "solve", ticks: [0, 1] }]).rows[0];
    ok("a field request goes to an eligible peer", ["fast", "slow", "field-only"].includes(pid(fr)) && F.isAttributed(fr), fr.line || F.describeRow(fr));
    const line = F.describeRow(rows[0]);
    ok("the row's line names the kind, the scene, the policy, the tick range and the peer", /^train seed 1 \/ policy cand0 \/ ticks 0\.\.600 -> (fast|slow) \((RTX|iGPU)\) est [\d.]+ ms$/.test(line), line);
    const stripped = { ...rows[0], peer: null };
    ok("a row with its peer stripped is NOT attributed (the check can fail)", !F.isAttributed(stripped) && F.ledgerSummary([stripped, rows[1]]).unattributed === 1);
    const none = F.routeAll([], reqs.slice(0, 2));
    ok("with no live peer every request is routed to this host, said so, and still attributed", none.rows.every((r) => pid(r) === "this host" && /no live peer/.test(r.routedBy) && F.isAttributed(r)), none.rows[0].routedBy);
    const led = F.makeLedger(5); for (let i = 0; i < 9; i++) led.push(rows[i]);
    ok("the ledger keeps its cap, the newest rows", led.rows.length === 5 && led.rows[4].id === rows[8].id);
    report(rows.slice(0, 4).map(F.describeRow).join(" | "));
}

sec("B. *** THE BRIDGE: POST /ai/brain/route OVER THE LIVE REGISTRY, THE LEDGER ON /ai/brain/routed AND /ai/brain/health ***");
{
    const B = require_(path.join(ENG, "ai-bridge", "gpuBrainBridge.js"));
    const call = (method, url, body) => new Promise((resolve) => {
        const ctx = { sendJson: (o, c) => resolve({ o, c: c || 200 }), SYS_LOG: [], sysLogPush() {}, _ollamaBase: "", _ollamaModelName: "" };
        const req = { method, url, headers: {}, on: (ev, cb) => { if (ev === "data" && body != null) cb(JSON.stringify(body)); if (ev === "end") cb(); } };
        B.handle(req, { writeHead() {}, end() {}, setHeader() {} }, ctx);
    });
    const KINDS = ["train", "race", "field", "policy"];
    await call("POST", "/ai/brain/hello", { brainId: "gate-fast", brainGpu: "RTX-gate", brainRole: "all" });
    await call("POST", "/ai/brain/hello", { brainId: "gate-slow", brainGpu: "iGPU-gate", brainRole: "all" });
    await call("POST", "/ai/brain/flowfield", { brainId: "gate-fast", brainGpu: "RTX-gate", solveMs: 20, brainKinds: KINDS, ts: Date.now() });
    await call("POST", "/ai/brain/flowfield", { brainId: "gate-slow", brainGpu: "iGPU-gate", solveMs: 80, brainKinds: KINDS, ts: Date.now() });
    const fleet = await call("GET", "/ai/brain/fleet");
    ok("two brains are live in the registry after hello + a solve each", fleet.o.ok && fleet.o.brains.filter((b) => /^gate-/.test(b.id)).length === 2, fleet.o.brains.map((b) => b.id + " " + b.solveMsEwma).join(", "));
    const reqs = []; for (let i = 0; i < 6; i++) reqs.push({ kind: "train", scene: 1 + (i % 2), policy: "cand" + i, ticks: [0, 600] });
    const r = await call("POST", "/ai/brain/route", { requests: reqs });
    ok("!! the route POST answers 200 with one row per request, every one attributed to a REGISTERED peer",
        r.c === 200 && r.o.ok && r.o.rows.length === 6 && r.o.rows.every((x) => x.attributed && /^gate-(fast|slow)$/.test(pid(x))) && r.o.summary.unattributed === 0,
        r.c + " " + (r.o.rows || []).map((x) => x.line).join(" | "));
    const took = (id) => ((r.o.summary.peers || []).find((p) => p.id === id) || { count: 0 }).count;
    ok("!! ...and the registry's own solve times decide: the 20 ms brain takes more than the 80 ms one", took("gate-fast") > took("gate-slow") && took("gate-slow") >= 1, `gate-fast ${took("gate-fast")}, gate-slow ${took("gate-slow")}`);
    const g = await call("GET", "/ai/brain/routed?last=3");
    ok("GET /ai/brain/routed reads the ledger: the count, the per-peer summary, the last rows", g.c === 200 && g.o.count === 6 && g.o.rows.length === 3 && g.o.summary.peers.length === 2 && g.o.summary.unattributed === 0 && !("weights" in g.o.rows[0]), JSON.stringify(g.o.summary.peers.map((p) => [p.id, p.count, p.kinds])));
    const h = await call("GET", "/ai/brain/health");
    const rt = h.o.routed;
    ok("!! *** /ai/brain/health carries `routed`: the count, zero unattributed, and the LAST request's peer and line ***",
        h.c === 200 && rt && rt.count === 6 && rt.unattributed === 0 && rt.last && /^gate-(fast|slow)$/.test(pid(rt.last)) && rt.last.what === "train seed 2 / policy cand5 / ticks 0..600" && String(rt.last.line).includes("-> " + pid(rt.last)),
        JSON.stringify(rt));
    const bad = await call("POST", "/ai/brain/route", { nope: 1 });
    ok("a malformed route POST is refused with 400 and the expected shape", bad.c === 400 && bad.o.error === "schema" && /requests/.test(bad.o.detail), JSON.stringify(bad.o));
    const many = []; for (let i = 0; i < 250; i++) many.push({ kind: "race", scene: 1, policy: "log", ticks: [i * 10, i * 10 + 10] });
    const m = await call("POST", "/ai/brain/route", { requests: many });
    ok("a 250-request POST is clamped to 256 and the ledger to its cap (the newest kept)", m.o.rows.length === 250 && B.routedLedger.rows.length === B.routedLedger.cap && B.routedLedger.rows[B.routedLedger.cap - 1].ticks[0] === 2490, B.routedLedger.rows.length + " of " + B.routedLedger.cap);
    report("last on the ledger: " + B.routedLedger.rows[B.routedLedger.rows.length - 1].line);
}

sec("C. *** THE TRAINER'S EPISODES ROUTED AND RUN: EACH SCORE IS drivePolicy.episode's, EACH ROW NAMES ITS PEER ***");
{
    const reqs = F.trainRequests(cands, [1, 2], { seconds: SECONDS, hashOf: D.weightsHash });
    ok("one request per candidate per seed, the policy its weights hash, the ticks the episode's", reqs.length === 4 && reqs.every((q) => q.kind === "train" && q.ticks[1] === SECONDS * 60 && /^[0-9a-f]{8}$/.test(q.policy)), reqs.map(F.describeRequest).join(" | "));
    const { rows, summary } = F.routeAll(BRAINS, reqs);
    ok("every episode is attributed and none to the field-only peer", summary.unattributed === 0 && rows.every((r) => pid(r) !== "field-only"), summary.peers.map((p) => p.id + " " + p.count).join(", "));
    const t0 = Date.now(), ran = F.runRoutedTrain(worldFrom, D, rows, { seconds: SECONDS }); const ms = Date.now() - t0;
    const same = ran.map((r) => { const e = D.episode(worldFrom, r.weights, D.surfaceFor(r.seed), { seconds: SECONDS, seed: r.seed }); return r.score === e.score && r.fingerprint === e.fingerprint; });
    ok("!! *** every routed episode's score AND fingerprint equal a direct drivePolicy.episode of the same candidate and seed ***", same.every(Boolean), ran.map((r, i) => `${pid(r)}: ${r.score.toFixed(2)} ${same[i] ? "=" : "!="}`).join(", "));
    ok("every result says where it ran and keeps its attribution", ran.every((r) => r.ranOn === "this box" && F.isAttributed(r) && r.ms >= 0), `${ran.length} episodes in ${ms} ms`);
    ok("the two candidates score differently (the routed policy reached the car)", new Set(ran.map((r) => r.score.toFixed(3))).size >= 2);
}

sec("D. *** THE RACE'S LOCKSTEP TICKS ROUTED AND RUN: THE RANGES CHAIN TO THE RECORD'S FINGERPRINT ***");
{
    const rec = D.race(worldFrom, cands, { seed: 1, seconds: SECONDS });
    const reqs = F.raceRequests(rec, EVERY);
    ok("the race's ticks cut into ranges of " + EVERY + ", the last ending at the record's tick count", reqs.length === Math.ceil(rec.ticks / EVERY) && reqs[reqs.length - 1].ticks[1] === rec.ticks && reqs.every((q) => q.kind === "race" && q.scene === rec.seed), reqs.map(F.describeRequest).join(" | "));
    const { rows, summary } = F.routeAll(BRAINS, reqs);
    ok("every range is attributed over the same peers, none to the field-only one", summary.unattributed === 0 && rows.every((r) => pid(r) !== "field-only") && summary.peers.length >= 1, summary.peers.map((p) => p.id + " " + p.count).join(", "));
    const t0 = Date.now(), out = F.runRoutedRace(worldFrom, D, rec, rows); const ms = Date.now() - t0;
    ok("!! *** the last range's chained fold IS the race's fingerprint ***", out.matches && out.fingerprint === rec.fingerprint, `${out.fingerprint} vs ${rec.fingerprint} in ${ms} ms`);
    ok("the folds chain: every range's fold differs from the previous one's, and only the last is the fingerprint", out.rows.every((r, i) => i === 0 || r.fold !== out.rows[i - 1].fold) && out.rows.slice(0, -1).every((r) => r.fold !== rec.fingerprint), out.rows.map((r) => r.fold).join(" -> "));
    ok("every range says where it ran and keeps its attribution", out.rows.every((r) => r.ranOn === "this box" && F.isAttributed(r)));
    const tampered = { ...rec, log: rec.log.map((tick, t) => t === 100 ? tick.map((u) => ({ ...u, steer: -u.steer })) : tick) };
    const bad = F.runRoutedRace(worldFrom, D, tampered, rows);
    ok("a record with one input flipped at tick 100 does NOT reach the fingerprint (the check can fail)", !bad.matches && bad.rows[0].fold !== out.rows[0].fold, bad.fingerprint);
}

sec("E. *** THE SURFACES READ THE LEDGER: THE GAUGE CARD, THE GRID ROWS, THE POOL CARDS; AND THE INSTRUMENT NAMES THIS GATE ***");
{
    const server = read("server.html"), rep = read("report.html"), pool = read("brain-fleet.html"), inst = read("physics/instruments.mjs"), bridge = read("ai-bridge/gpuBrainBridge.js");
    ok("server.html's gauge row has the routed card and fills it from health's `routed` (peer as the value, the request as the note)",
        /id="bgRouted"/.test(server) && /id="bgRoutedNote"/.test(server) && /h\.routed/.test(server) && /rt\.last\.peer\.id/.test(server) && /rt\.last\.what/.test(server));
    ok("report.html's fleet grid fetches /ai/brain/routed and writes 'took N, last <what>' on a peer's row and a line per peer",
        /fetch\("\/ai\/brain\/routed"/.test(rep) && /took ' \+ p\.count/.test(rep) && /id="fleetRouted"/.test(rep) && /UNATTRIBUTED/.test(rep));
    ok("brain-fleet.html's pool cards fetch /ai/brain/routed and say what each brain took",
        /fetch\("\/ai\/brain\/routed"/.test(pool) && /tookOf\(r\.id\)/.test(pool) && /no requests routed/.test(pool));
    ok("the bridge registers both routes through the registry (declared checks, a schema, a body bound) and exports the ledger",
        /registry\.post\("\/ai\/brain\/route"/.test(bridge) && /registry\.get\("\/ai\/brain\/routed"/.test(bridge) && /routedLedger/.test(bridge.split("module.exports")[1] || ""));
    ok("physics/instruments.mjs names this gate under fleet-routing", /id: "fleet-routing"/.test(inst) && /tools\/ship\/fleetRouting-selfcheck\.mjs/.test(inst));
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
for (const l of F.reportLines()) console.log("  " + l);
process.exit(fails ? 1 : 0);
