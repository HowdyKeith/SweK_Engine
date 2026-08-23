// WebGLEngine/tools/ship/benchBridge-selfcheck.mjs -- v2805
//
// Run: node tools/ship/benchBridge-selfcheck.mjs   (~8.4s — MEASURED v3941, was ~20s; it runs a real mesh benchmark through the bridge)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/benchBridge.js + benchmarks.html -- the front door for the two measurement tools that were
// console-only. The property worth gating is HONESTY ABOUT WHAT IS RUNNABLE: parity needs a built wasm crate, and
// when that is missing the bridge must SAY SO with the build command rather than returning an empty result the
// page would render as a benchmark. A measurement UI that quietly shows nothing is worse than one that refuses.

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const bridge = require(path.join(ENG, "ai-bridge", "benchBridge.js"));

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

async function call(url) {
    let body = null, code = 200;
    await bridge.handle({ url, method: "GET" }, {}, { sendJson: (o, c = 200) => { body = o; code = c; } });
    return { body, code };
}

// 1. routing
{
    ok("owns: /bench and subpaths", bridge.owns("/bench") && bridge.owns("/bench/mesh") && bridge.owns("/bench/parity?worley=1"));
    ok("owns: NOT lookalikes", !bridge.owns("/benchmarks") && !bridge.owns("/roundhouse") && !bridge.owns("/"));
    ok("owns: tolerates non-string", !bridge.owns(undefined));
}

// 2. status is honest about what can actually run
{
    const s = await call("/bench/status");
    ok("/status: mesh benchmark is always available", s.body.ok && s.body.mesh.available === true);
    const built = bridge.parityAvailable();
    if (built) {
        ok("/status: parity reported available (crate is built here)", s.body.parity.available === true);
    } else {
        ok("/status: parity reported UNAVAILABLE when the crate is unbuilt", s.body.parity.available === false);
        ok("/status: gives the build command instead of a dead button", /build_wasm/.test(s.body.parity.build || ""));
    }
}

// 3. the mesh benchmark really runs through the bridge and returns adjudicated rows
{
    const r = await call("/bench/mesh?iters=4");
    ok("/mesh: returns rows", r.body.ok === true && Array.isArray(r.body.rows) && r.body.rows.length === 4);
    const row = r.body.rows[0];
    ok("/mesh: each row carries all three paths (greedy, RLE, optimised RLE)",
        typeof row.greedyMs === "number" && typeof row.rleMs === "number" && typeof row.rleOptMs === "number" &&
        typeof row.greedyTris === "number" && typeof row.rleTris === "number" && typeof row.rleOptTris === "number");
    ok("/mesh: every row states whether RLE matched the independent reference", r.body.rows.every((x) => typeof x.rleMatchesRef === "boolean"));
    ok("/mesh: RLE matched the reference on every fixture", r.body.rows.every((x) => x.rleMatchesRef === true));
    ok("/mesh: the optimised path cuts triangles vs plain RLE on the flat fixture",
        (r.body.rows.find((x) => x.fixture === "flat") || {}).rleOptTris < (r.body.rows.find((x) => x.fixture === "flat") || {}).rleTris);
    ok("/mesh: states the timings exclude GPU cost", /GPU/.test(r.body.note || ""));
    ok("/mesh: clamps a silly iteration count instead of hanging", (await call("/bench/mesh?iters=99999")).body.iters <= 60);
}

// 4. parity refuses clearly when the crate is unbuilt (the case every fresh machine is in)
{
    const r = await call("/bench/parity");
    if (!bridge.parityAvailable()) {
        ok("/parity: refuses with 409 when the crate is unbuilt", r.code === 409 && r.body.ok === false && r.body.error === "not-built");
        ok("/parity: the refusal carries the build command", /build_wasm/.test(r.body.build || ""));
        ok("/parity: does NOT return a fake empty result", !("rows" in (r.body || {})) && !("speedup" in (r.body || {})));
    } else {
        ok("/parity: ran the harness and reported an exit code", typeof r.body.exitCode === "number" && typeof r.body.output === "string");
    }
}

// 5. unknown subroute -> 404
{
    const r = await call("/bench/nope");
    ok("unknown subroute -> 404", r.code === 404 && r.body.ok === false);
}

// 6. the page exists, drives the real endpoints, and does not invent numbers
{
    const p = path.join(ENG, "benchmarks.html");
    ok("page: benchmarks.html exists", fs.existsSync(p));
    const html = fs.readFileSync(p, "utf8");
    for (const ep of ["/bench/status", "/bench/mesh", "/bench/parity"]) ok(`page: calls ${ep}`, html.includes(ep));
    ok("page: disables the parity button when it is not runnable", /bParity"\)\.disabled\s*=\s*true/.test(html));
    ok("page: surfaces the build command rather than a dead button", /parity\.build|j\.build/.test(html));
    ok("page: renders the RLE-vs-reference verdict per fixture", /rleMatchesRef/.test(html));
    ok("page: shows all three meshing paths", /rleOptMs/.test(html) && /rleOptTris/.test(html));
}

// 7. registered in the server dispatch
{
    const srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    ok("server.js: requires benchBridge", /require\("\.\/benchBridge\.js"\)/.test(srv));
    ok("server.js: dispatches benchBridge.owns(req.url)", /benchBridge\.owns\(req\.url\)/.test(srv));
}

console.log("benchBridge-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
