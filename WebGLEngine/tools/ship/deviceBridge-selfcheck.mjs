// WebGLEngine/tools/ship/deviceBridge-selfcheck.mjs -- v2813
//
// Run: node tools/ship/deviceBridge-selfcheck.mjs   (~3s -- it runs real device loops)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/deviceBridge.js + device.html -- the front door for the roundhouse device registry.
//
// THE CLAIM THE PAGE MAKES IS THAT THE PHYSICS DECIDES, so that is what this gate holds it to: a run must
// crystallise only when the MEASURED observable satisfies the claim, and a claim the simulation refuses must come
// back as an honest "did not crystallise" rather than an error or a quiet pass. The mock caller exists so this is
// checkable with no model and no key -- but the SIMULATION IT DRIVES IS REAL, which is the difference between
// this and a UI demo.

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const bridge = require(path.join(ENG, "ai-bridge", "deviceBridge.js"));

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

function call(url, method = "GET", body = null) {
    return new Promise(async (resolve) => {
        const req = { url, method, on(ev, cb) { if (ev === "data" && body) cb(JSON.stringify(body)); if (ev === "end") cb(); return req; } };
        await bridge.handle(req, {}, { sendJson: (o, c = 200) => resolve({ body: o, code: c }) });
    });
}
async function runToEnd(body, maxMs = 30000) {
    const s = await call("/device/start", "POST", body);
    if (!s.body.ok) return { start: s.body, code: s.code };
    const t0 = Date.now();
    let p;
    while (Date.now() - t0 < maxMs) {
        await new Promise((r) => setTimeout(r, 120));
        p = await call("/device/progress?id=" + s.body.runId);
        if (p.body.done) break;
    }
    return { start: s.body, progress: p && p.body };
}

// 1. routing
{
    ok("owns: /device and subpaths", bridge.owns("/device") && bridge.owns("/device/list") && bridge.owns("/device/start"));
    ok("owns: NOT lookalikes", !bridge.owns("/devices") && !bridge.owns("/roundhouse") && !bridge.owns("/"));
}

// 2. /list surfaces every registered device WITH what it can measure
{
    const l = await call("/device/list");
    // Assert the SET, not a count. A bare number fires on any change and tells you nothing about which;
    // naming the expected devices makes an accidental loss and a deliberate addition look different.
    //
    // v3036 -- and the length equality below was quietly undoing exactly that. The comment above got the
    // instrument right and then `got.length === EXPECTED.length` made every addition read as a break anyway.
    // Five devices arrived (twobody, inspiral, eccentric, lens, tidal), nothing was lost, and the gate went red.
    // The subset half was always the real check; the equality was the bug.
    const EXPECTED = ["blackhole", "optics", "kerr", "ct", "interferometer", "windtunnel", "thermal", "pipe3d", "geometry", "kh", "born", "ising", "kepler", "twobody", "inspiral", "eccentric", "quantum", "chaos", "splat", "discovery", "probe", "lens", "tidal", "box3d", "blobthermal", "blobkelvin", "lbm"];
    const got = l.body.devices.map((d) => d.name);
    const gone = EXPECTED.filter((n) => !got.includes(n));
    ok("/list: has not lost a registered device", l.body.ok && gone.length === 0,
       gone.length ? "MISSING: " + gone.join(",") : got.length + " devices, all " + EXPECTED.length + " expected present" +
       (got.length > EXPECTED.length ? " (+" + (got.length - EXPECTED.length) + " added: " + got.filter((n) => !EXPECTED.includes(n)).join(",") + ")" : ""));
    ok("/list: every device declares observables", l.body.devices.every((d) => Array.isArray(d.observables) && d.observables.length > 0));
    ok("/list: reports installed local models (empty is fine)", Array.isArray(l.body.localModels));
}

// 3. THE PHYSICS DECIDES -- a true demo claim crystallises against a REAL simulation
{
    const r = await runToEnd({ device: "box3d", caller: "mock", rounds: 3 });
    ok("box3d: a run starts and completes", !!r.progress && r.progress.done === true);
    ok("box3d: crystallised on the measured observable", r.progress.result && r.progress.result.crystallized === true);
    const first = r.progress.rounds[0];
    ok("box3d: the round carries claim, measured value and verdict", !!first.claim && first.measured !== undefined && !!first.verdict);
    ok("box3d: the verdict compares MEASURED against the claim, not model opinion",
        first.verdict.done === true && ("max" in first.verdict || "target" in first.verdict || "claimed" in first.verdict),
        JSON.stringify(first.verdict));
}

// 4. a second device, so this is the registry working rather than one lucky binding
{
    const r = await runToEnd({ device: "blackhole", caller: "mock", rounds: 3 });
    ok("blackhole: crystallised too", r.progress && r.progress.result && r.progress.result.crystallized === true);
    const v = r.progress.rounds[0].verdict;
    ok("blackhole: measured an actual physical quantity", typeof v.measured === "number" && isFinite(v.measured), "measured=" + v.measured);
}

// 5. A CLAIM THE SIMULATION REFUSES must fail honestly, not error and not quietly pass
{
    const r = await runToEnd({ device: "box3d", caller: "mock", rounds: 2, hyp: { mode: "hash", claim: { observable: "momentumErrFrac", max: -1 } } });
    const done = r.progress && r.progress.done;
    const res = r.progress && r.progress.result;
    ok("an impossible claim does NOT crystallise", done && res && res.crystallized === false, JSON.stringify(res && res.reason));
    ok("...and it is reported as a real outcome, not a crash", !r.progress.error);
    ok("...with the refusing verdict recorded per round", r.progress.rounds.length > 0 && r.progress.rounds.every((x) => x.verdict && x.verdict.done === false));
}

// 6. input handling
{
    const bad = await call("/device/start", "POST", { device: "no-such-lab", caller: "mock" });
    ok("unknown device is refused with the valid list", bad.code === 400 && bad.body.error === "unknown-device" && /blackhole/.test(bad.body.message));
    const badCaller = await call("/device/start", "POST", { device: "box3d", caller: "telepathy" });
    ok("unknown caller is refused", badCaller.code === 400 && badCaller.body.error === "setup");
    const noRun = await call("/device/progress?id=nope");
    ok("unknown run id is a 404, not an empty transcript", noRun.code === 404 && noRun.body.error === "unknown-run");
    ok("unknown subroute -> 404", (await call("/device/nope")).code === 404);
}

// 7. the run store stays bounded (a long session must not accumulate transcripts forever)
{
    const before = bridge._runs.size;
    for (let i = 0; i < 25; i++) await call("/device/start", "POST", { device: "box3d", caller: "mock", rounds: 1 });
    ok("run store is capped rather than growing without limit", bridge._runs.size <= 20, `${before} -> ${bridge._runs.size}`);
}

// 8. the onRound seam this page depends on is real and non-fatal
{
    const src = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "deviceBind.mjs"), "utf8");
    ok("deviceBind exposes an onRound seam", /onRound\s*=\s*null/.test(src) && /await onRound\(/.test(src));
    ok("a throwing observer cannot kill the experiment", /catch\s*\{\s*\/\* an observer must never break the experiment \*\/\s*\}/.test(src));
    const { roundhouseDevice } = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "deviceBind.mjs")).href);
    const { getDevice } = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "devices.mjs")).href);
    const dev = await getDevice("box3d");
    const claim = { observable: "deterministic", equals: true };
    const res = await roundhouseDevice({
        callModel: async (role) => (role === "proposer" ? { mode: "hash", claim } : { note: "x" }),
        device: dev, question: "q", maxRounds: 2, onRound: () => { throw new Error("observer blew up"); },
    });
    ok("...proved: the loop still crystallises when onRound throws", res.crystallized === true);
}

// 9. the page drives the real endpoints and states who decides
{
    const p = path.join(ENG, "device.html");
    ok("page: device.html exists", fs.existsSync(p));
    const html = fs.readFileSync(p, "utf8");
    for (const ep of ["/device/list", "/device/start", "/device/progress"]) ok(`page: calls ${ep}`, html.includes(ep));
    ok("page: POLLS for rounds rather than waiting for one blocking answer", /\/device\/progress\?id=/.test(html) && /setTimeout/.test(html));
    ok("page: renders claim, measured and verdict per round", /claimText/.test(html) && /r\.measured/.test(html) && /r\.verdict/.test(html));
    ok("page: offers the no-model mock caller first", /mock \(no model, no key/.test(html));
    ok("page: says the measurement decides, not the model", /never gets a vote|simulation decided this|measured observable/i.test(html));
    ok("page: treats not-crystallising as a real outcome, not an error", /did not crystallise/.test(html) && /not an error/.test(html));
}

// 10. registered in the server dispatch
{
    const srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    ok("server.js: requires deviceBridge", /require\("\.\/deviceBridge\.js"\)/.test(srv));
    ok("server.js: dispatches deviceBridge.owns(req.url)", /deviceBridge\.owns\(req\.url\)/.test(srv));
}

console.log("deviceBridge-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
