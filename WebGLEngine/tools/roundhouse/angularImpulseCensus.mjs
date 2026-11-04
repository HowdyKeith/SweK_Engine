// WebGLEngine/tools/roundhouse/angularImpulseCensus.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHO SPINS A BODY PAST JOLT'S CAP ON box3d, as physics/mechanics/BOX3D_ANGULAR_IMPULSE_CAP_WIP.md registers the census. The library:
// the registration as data (the call sites, the pass-throughs, the pages and what is pressed on each), the corpus, the runs under the
// hook, the controls and the readings. The hook is angularImpulseHook.mjs (node) over angularImpulseWatch.mjs (shared with a page); the
// command is angularImpulseCensusRun.mjs and prints no reading; the gate is angularImpulseCensus-selfcheck.mjs.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as W from "./angularImpulseWatch.mjs";
import * as H from "./angularImpulseHook.mjs";
import { buildGraph } from "../ship/affected.mjs";
import { shutdownServer } from "../ship/serverShutdown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
const freeze = (o) => Object.freeze(o), J = JSON.stringify;
export const REGISTRATION = "physics/mechanics/BOX3D_ANGULAR_IMPULSE_CAP_WIP.md";
export const DEFAULT_RESULTS = path.join(ENG, "physics", "mechanics", "box3dAngularImpulseCapResults.json");
export const OWN_GATE = "tools/roundhouse/angularImpulseCensus-selfcheck.mjs";
export const { MAX_SPIN, SPIN_SLACK, PAST } = W;

// ---- the registration as data -------------------------------------------------------------------------------------------------
/** The fourteen call sites, as the note's table lists them at its commit (7d5cd4a5). */
export const SITES = freeze([
    "world/buildingTopple.mjs:305", "physics/raceCar.mjs:243", "physics/kaijuBox3d.js:84", "physics/esHullCombat.js:92", "physics/backendDivergence.mjs:24",
    "physics/fluidBox3d.js:62", "render/slugShatter.mjs:103", "physics/jolt/joltRagdoll.js:73", "physics/mechanics/rigidBody6dofBox3d.mjs:59", "fx/fracture/debrisPhysics.js:52",
    "ragdoll.html:283", "flesh.html:305", "box3d-replay.html:162", "box3d-vs-jolt.html:49",
].map((site) => freeze({ site, file: site.replace(/:\d+$/, ""), kind: /\.html:/.test(site) ? "page" : "module" })));
/** The debris' site, capped at the throw already: it decides nothing. */
export const DEBRIS_SITE = "fx/fracture/debrisPhysics.js:52";
export const MODULE_FILES = freeze([...new Set(SITES.filter((s) => s.kind === "module").map((s) => s.file))]);
export const PAGE_SITES = freeze(SITES.filter((s) => s.kind === "page").map((s) => s.site));
/** Three pages give angularImpulse() to a JavaScript stand-in of their own and never reach box3d. */
export const NOT_BOX3D = freeze(["box3d-demo.html:45", "es-hull-combat.html:44", "fluid-box3d.html:49"]);
/** The pass-throughs' own lines in a file that also holds a site: a grep finds them, and they are not sites. */
export const PASS_LINES = freeze(["physics/kaijuBox3d.js:76"]);
/**
 * The files whose every line a grep for angularImpulse( finds is not a call on box3d: two pass-throughs (the facade, the slug ticker's
 * raw world), Jolt's own loader, text that names the function (main.js's and freeRotation.mjs's comments, the backlog), and this
 * census's own files, whose probes are kept apart from its readings.
 */
export const NOT_CALLS = freeze(["physics/box3d/box3dLoader.js", "render/slugTicker.mjs", "physics/jolt/joltLoader.js", "main.js", "physics/mechanics/freeRotation.mjs", "tools/ship/nextRounds.mjs",
    "tools/roundhouse/angularImpulseCensus.mjs", "tools/roundhouse/angularImpulseHook.mjs", "tools/roundhouse/angularImpulseWatch.mjs", "tools/roundhouse/angularImpulseCensusRun.mjs"]);
export const LIMIT_MS = 1800e3, PARALLEL = 2;
/** The four pages and what is pressed on each, as a person would. */
export const PAGES = freeze([
    freeze({ page: "ragdoll.html", site: "ragdoll.html:283", steps: freeze([["click", "#go"], ["wait", 2000], ["click", "#shove"], ["wait", 5000]]) }),
    freeze({ page: "flesh.html", site: "flesh.html:305", steps: freeze([["click", "#go"], ["wait", 2000], ["click", "#shove"], ["wait", 5000]]) }),
    freeze({ page: "box3d-replay.html", site: "box3d-replay.html:162", steps: freeze([["click", "#rec"], ["waitFor", "#recState .ok", 60000]]) }),
    freeze({ page: "box3d-vs-jolt.html", site: "box3d-vs-jolt.html:49", steps: freeze([["wait", 5000]]) }),
]);

// ---- the table is the tree's ----------------------------------------------------------------------------------------------------
/** Every line of the tree a grep for `angularImpulse(` finds, gates, vendored code and notes left out: [file, line, text]. */
export function grepCalls(root = ENG) {
    let out = "";
    try { out = execFileSync("git", ["grep", "-n", "-E", "angularImpulse\\s*\\(", "--", ".", ":!*selfcheck*", ":!vendor/**", ":!node_modules/**", ":!**/*.md"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 }); }
    catch (e) { if (e.status !== 1) throw e; }
    return out.split("\n").filter(Boolean).map((l) => { const m = /^([^:]+):(\d+):(.*)$/.exec(l); return [m[1], +m[2], m[3]]; });
}
/** The calls per file: the census's table, or the tree's (`calls`, from grepCalls), as { file: count }. */
export const tableCounts = () => [...SITES.map((s) => s.site), ...NOT_BOX3D, ...PASS_LINES].map((s) => s.replace(/:\d+$/, "")).reduce((o, f) => (o[f] = (o[f] || 0) + 1, o), {});
export const treeCounts = (calls) => calls.filter(([f]) => !NOT_CALLS.includes(f)).reduce((o, [f]) => (o[f] = (o[f] || 0) + 1, o), {});

// ---- the corpus ---------------------------------------------------------------------------------------------------------------
/** N: every gate that reaches the file of a module site through the import graph, this round's own gate left out. */
export function corpusN(graph = buildGraph(), files = MODULE_FILES) {
    const out = [];
    for (const [gate, deps] of graph.deps) if (gate !== OWN_GATE && files.some((f) => deps.has(f))) out.push(gate);
    return out.sort();
}

/**
 * Run `script` (a path from the tree's root, with `args`) under the hook: its tallies go to a fresh directory, its child processes are
 * hooked through NODE_OPTIONS, and it is stopped -- its whole process group -- at `limitMs`. Resolves to how it ended and what it saw.
 */
export function runHooked(script, { args = [], run = script, limitMs = LIMIT_MS, root = ENG, env = {}, dir = null } = {}) {
    const out = dir || fs.mkdtempSync(path.join(os.tmpdir(), "angcensus-"));
    const t0 = Date.now();
    return new Promise((resolve) => {
        const opts = [process.env.NODE_OPTIONS || "", `--import ${H.HOOK_PATH}`].filter(Boolean).join(" ");
        const child = spawn(process.execPath, [script, ...args], { cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, ...env, NODE_OPTIONS: opts, [H.ENV_DIR]: out, [H.ENV_RUN]: run } });
        let tail = "", timedOut = false;
        const keep = (b) => { tail = (tail + b.toString()).slice(-4000); };
        child.stdout.on("data", keep); child.stderr.on("data", keep);
        const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, "SIGKILL"); } catch { /* gone */ } }, limitMs);
        let code = null, signal = null;
        // the gate itself has ended: whatever it left running in its group (a server, a browser) is stopped, so its pipes close
        child.on("exit", (c, s) => { code = c; signal = s; try { process.kill(-child.pid, "SIGKILL"); } catch { /* the group is gone */ } });
        child.on("close", () => {
            clearTimeout(timer);
            const tallies = H.readTallies(out);
            resolve({ run, code, signal, timedOut, ms: Date.now() - t0, processes: tallies.length, tally: W.mergeTallies(tallies), broken: tallies.filter((t) => t.broken).length, tail: tail.slice(-600) });
        });
    });
}

/** Run every gate of `gates` under the hook, `parallel` at a time; `onDone` hears of each as it ends. */
export async function runCorpusN(gates, { parallel = PARALLEL, limitMs = LIMIT_MS, root = ENG, onDone = null } = {}) {
    const runs = new Array(gates.length);
    let next = 0;
    const worker = async () => { for (let i; (i = next++) < gates.length;) { runs[i] = await runHooked(gates[i], { run: gates[i], limitMs, root }); if (onDone) onDone(runs[i], i, gates.length); } };
    await Promise.all(Array.from({ length: Math.min(parallel, gates.length) }, worker));
    return runs;
}

// ---- the pages ----------------------------------------------------------------------------------------------------------------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css", ".wasm": "application/wasm",
    ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".bin": "application/octet-stream", ".txt": "text/plain" };
/** The tree's routes, as a request handler: /vendor/box3d/box3d.js is the hook's stand-in, ?census-real the real file, `extra` adds paths. */
export function treeHandler(root = ENG, extra = {}) {
    return (q, s) => {
        const u = new URL(q.url, "http://x"), p = decodeURIComponent(u.pathname);
        if (extra[p] != null) { s.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html" : "text/javascript" }); s.end(extra[p]); return; }
        if (p === "/vendor/box3d/box3d.js" && !u.searchParams.has("census-real")) { s.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" }); s.end(H.pageStandIn()); return; }
        const f = path.join(root, p);
        if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; }
        s.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" }); s.end(fs.readFileSync(f));
    };
}
/** Serve the tree from `root` on the loopback address, through treeHandler. */
export function serveTree(root = ENG, extra = {}) {
    const srv = http.createServer(treeHandler(root, extra));
    return new Promise((res) => srv.listen(0, "127.0.0.1", () => res({ srv, origin: `http://127.0.0.1:${srv.address().port}` })));
}
export async function launchBrowser() {
    const { resolvePlaywright, HEADLESS_SHELL, webglLaunchArgs } = await import("../ship/playwrightResolve.mjs");
    const pw = resolvePlaywright(createRequire(import.meta.url));
    return pw.chromium.launch({ ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}), args: [...webglLaunchArgs().args] });
}
/** Open one page, wait for box3d (10 s at most: a page that never starts it is still run), press its steps, read what the hook saw. */
export async function runPage(browser, origin, { page, steps }, { readyMs = 10000 } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } }), p = await ctx.newPage(), errors = [];
    p.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
    const t0 = Date.now(), done = [];
    let error = null, box3dStarted = false;
    try {
        await p.goto(`${origin}/${page}`, { waitUntil: "load", timeout: 60000 });
        try { await p.waitForFunction(() => globalThis.__swkAngCensus && globalThis.__swkAngCensus.instances > 0, null, { timeout: readyMs }); box3dStarted = true; await p.waitForTimeout(1000); } catch { /* said below */ }
        for (const [what, a, b] of steps) {
            if (what === "click") await p.click(a, { timeout: 15000 });
            else if (what === "wait") await p.waitForTimeout(a);
            else if (what === "waitFor") await p.waitForSelector(a, { timeout: b || 30000 });
            done.push(what + (typeof a === "string" ? " " + a : " " + a + " ms"));
        }
    } catch (e) { error = String(e.message).split("\n")[0].slice(0, 300); }
    const tally = await p.evaluate(() => globalThis.__swkAngCensus || null).catch(() => null);
    await ctx.close();
    return { run: page, page, box3dStarted, steps: done, completed: !error && done.length === steps.length, error, pageErrors: errors.slice(0, 5), ms: Date.now() - t0, tally: W.mergeTallies([tally && { ...tally, run: page }]) };
}
export async function runCorpusP(pages = PAGES, { root = ENG, extra = {} } = {}) {
    const { srv, origin } = await serveTree(root, extra), browser = await launchBrowser(), out = [];
    try { for (const pg of pages) out.push(await runPage(browser, origin, pg)); }
    finally { await browser.close(); await shutdownServer(srv); }
    return out;
}

// ---- the controls ---------------------------------------------------------------------------------------------------------------
/** A script for node's `-e`: the facade adopted in node, then `body`. Every probe's output is one JSON line. */
const PROBE_HEAD = `import { adoptBox3dInNode } from ${J(path.join(ENG, "physics", "backendNode.mjs"))};\nimport { box3d } from ${J(path.join(ENG, "physics", "box3d", "box3dLoader.js"))};\nawait adoptBox3dInNode();\n`;
function probe(body, { hooked = true, root = ENG } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "angprobe-"));
    const env = { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS || "", hooked ? `--import ${H.HOOK_PATH}` : ""].filter(Boolean).join(" "), [H.ENV_DIR]: hooked ? dir : "", [H.ENV_RUN]: "probe" };
    if (!hooked) delete env[H.ENV_DIR];
    const text = execFileSync(process.execPath, ["--input-type=module", "-e", PROBE_HEAD + body], { cwd: root, env, encoding: "utf8", maxBuffer: 1 << 26 });
    const line = text.split("\n").filter((l) => l.startsWith("{")).pop();
    return { out: JSON.parse(line), tally: W.mergeTallies(H.readTallies(dir)) };
}
/** C-transparent: backendDivergence's scene, 14 boxes for 120 steps, gives the same state hash at every step hooked and unhooked. */
export function cTransparent() {
    const body = `import { buildScene, harnessHash } from ${J(path.join(ENG, "physics", "backendDivergence.mjs"))};\n` +
        `const w = box3d.createWorld({ gravity: [0, -9.8, 0] }), idx = buildScene(w), h = [];\nfor (let t = 0; t < 120; t++) { w.step(1 / 60, 2); h.push([w.stateHash(), harnessHash(w, idx)]); }\nconsole.log(JSON.stringify({ h }));`;
    const a = probe(body, { hooked: true }), b = probe(body, { hooked: false });
    const steps = a.out.h.length, same = J(a.out.h) === J(b.out.h);
    return { ok: same && steps === 120 && a.tally.calls === 14, steps, same, callsSeen: a.tally.calls, last: a.out.h[steps - 1] };
}
/** C-reads: a lone light box given a known impulse reads |I^-1 J| from the inertia box3d reports, to float32; the debris with its cap off reads past the cap. */
export const LONE = freeze({ half: freeze([0.03, 0.09, 0.06]), density: 1, impulse: freeze([1.3e-4, -2.1e-4, 0.7e-4]) });
export function cReads() {
    const lone = probe(`const w = box3d.createWorld({ gravity: [0, 0, 0] }), b = w.addBox({ type: "dynamic", pos: [0, 0, 0], half: ${J(LONE.half)}, density: ${LONE.density} });\n` +
        `const I = w.inertia(b); w.angularImpulse(b, ${J(LONE.impulse)});\nconst A = w.readAngularVelocities();\nconsole.log(JSON.stringify({ I, read: Math.hypot(A[b * 3], A[b * 3 + 1], A[b * 3 + 2]) }));`);
    const I = lone.out.I.diag, j = LONE.impulse, expect = Math.hypot(j[0] / I[0], j[1] / I[1], j[2] / I[2]);
    const sites = Object.entries(lone.tally.sites), seen = sites.length === 1 ? sites[0][1].max : null;
    const loneOk = seen != null && Math.abs(seen - expect) <= 1e-6 * expect && seen === lone.out.read && lone.out.I.off.every((v) => v === 0);
    const debris = probe(`import * as D from ${J(path.join(ENG, "fx", "fracture", "debrisPhysics.js"))};\nimport * as L from ${J(path.join(ENG, "tools", "roundhouse", "joltScenes.mjs"))};\n` +
        `const sc = L.DEBRIS[0], w = box3d.createWorld({ gravity: [0, -9.8, 0] }); D.addGround(w, { ...sc.ground });\n` +
        `const bodies = D.makePhysicsDebris(w, L.fragmentsOf(sc, 1), [...sc.impact], { force: sc.force, rng: L.rng(201), maxSpin: Infinity });\n` +
        `const A = w.readAngularVelocities(); console.log(JSON.stringify({ n: bodies.length, top: Math.max(...bodies.map((b) => Math.hypot(A[b.idx * 3], A[b.idx * 3 + 1], A[b.idx * 3 + 2]))) }));`);
    const d = debris.tally.sites[DEBRIS_SITE] || null;
    const debrisOk = !!d && d.calls === debris.out.n && d.max > PAST && d.max === debris.out.top;
    return { ok: loneOk && debrisOk, lone: { expect, seen, read: lone.out.read, inertia: lone.out.I, ok: loneOk }, debris: { fragments: debris.out.n, seen: d && d.max, top: debris.out.top, past: d && d.past, ok: debrisOk } };
}
/** C-jolt: the same lone box on Jolt reads 15 pi right after the same impulse (the claim the census rests on). */
export async function cJolt() {
    const { createJoltBackend } = await import("../../physics/jolt/joltLoader.js");
    const be = await createJoltBackend(), w = be.createWorld({ gravity: [0, 0, 0] });
    const b = w.addBox({ type: "dynamic", pos: [0, 0, 0], half: [...LONE.half], density: LONE.density });
    w.angularImpulse(b, [...LONE.impulse]);
    const A = w.readAngularVelocities(), read = Math.hypot(A[b * 3], A[b * 3 + 1], A[b * 3 + 2]);
    if (w.destroy) w.destroy();
    return { ok: Math.abs(read - MAX_SPIN) <= 1e-5 * MAX_SPIN, read, cap: MAX_SPIN };
}
/** C-site: calls made from known lines are put to them -- through the facade, through the slug ticker's raw world, and through the kaiju's angularImpulse(rec, v). */
export function cSite() {
    const body = `import { worldFromModule } from ${J(path.join(ENG, "render", "slugTicker.mjs"))};\nimport { createKaijuBox3D } from ${J(path.join(ENG, "physics", "kaijuBox3d.js"))};\n` +
        `const w = box3d.createWorld({ gravity: [0, 0, 0] }), b = w.addBox({ type: "dynamic", pos: [0, 0, 0], half: [0.5, 0.5, 0.5] });\n` +
        `w.angularImpulse(b, [0, 0, 0.01]);\n` +                                                   // line 7 of the probe: the facade
        `const k = createKaijuBox3D(w), rec = k.addDynamic({ pos: [3, 0, 0] }); k.angularImpulse(rec, [0, 0, 0.01]);\n` +   // line 8: the kaiju's pass-through
        `w.destroy(); const raw = worldFromModule(box3d._mod, [0, 0, 0]), c = raw.addBox({ type: "dynamic" }); raw.angularImpulse(c, [0, 0, 0.01]);\n` +   // line 9: the ticker's raw world
        `console.log(JSON.stringify({ ok: true }));`;
    const r = probe(body), sites = r.tally.sites, keys = Object.keys(sites);
    const file = (s) => s.replace(/:\d+$/, ""), viaOf = (line) => { const k = keys.find((s) => s.endsWith(`:${line}`)); return k ? sites[k].maxAt.via : null; };
    const ok = keys.length === 3 && new Set(keys.map(file)).size === 1 && keys.every((s) => !W.PASS_THROUGHS.some((p) => file(s) === p.file)) &&
        J(viaOf(7)) === J(["physics/box3d/box3dLoader.js:51"]) && J(viaOf(8)) === J(["physics/box3d/box3dLoader.js:51", "physics/kaijuBox3d.js:76"]) && J(viaOf(9)) === J(["render/slugTicker.mjs:101"]);
    return { ok, sites: Object.fromEntries(keys.map((s) => [s, sites[s].maxAt.via])) };
}

// ---- the readings ---------------------------------------------------------------------------------------------------------------
const isGate = (file) => /-selfcheck\.mjs$/.test(file);
/** Each site's calls, largest spin, calls past the cap and where the largest was seen, over every run; then the sites the table does not name. */
export function readingsOf(runs) {
    const all = W.mergeTallies(runs.map((r) => r.tally && { ...r.tally, run: r.run }));
    const row = (site) => { const e = all.sites[site]; return { site, calls: e ? e.calls : 0, max: e ? e.max : null, past: e ? e.past : 0, nan: e ? e.nan : 0, where: e && e.maxAt ? e.maxAt.run : null, maxAt: e ? e.maxAt : null }; };
    const named = SITES.map((s) => ({ ...row(s.site), kind: s.kind }));
    const others = Object.keys(all.sites).filter((s) => !SITES.some((t) => t.site === s)).sort().map((s) => ({ ...row(s), kind: isGate(s.replace(/:\d+$/, "")) ? "gate" : "found" }));
    return { sites: named, others, calls: all.calls, unread: all.unread };
}
/** The decision rule: the cap goes in if any site but the debris' -- the table's, or one found outside it in a file that is not a gate -- has a call past the cap. */
export function decide(readings) {
    const past = [...readings.sites, ...readings.others.filter((o) => o.kind === "found")].filter((s) => s.site !== DEBRIS_SITE && s.past > 0).map((s) => s.site);
    return { capGoesIn: past.length > 0, past };
}
/** C-reach: every module site reached by N and every page site by P; the sites not reached, named. */
export function cReach(readingsN, readingsP) {
    const missN = SITES.filter((s) => s.kind === "module" && !(readingsN.sites.find((r) => r.site === s.site) || {}).calls).map((s) => s.site);
    const missP = PAGE_SITES.filter((s) => !(readingsP.sites.find((r) => r.site === s) || {}).calls);
    return { ok: missN.length === 0 && missP.length === 0, notReached: [...missN, ...missP] };
}
/** C-complete: every run listed with how it ended; the ones that timed out, crashed or were stopped, named. */
export function cComplete(runsN, runsP) {
    const ended = (r) => (r.timedOut ? "timed out" : r.signal ? `signal ${r.signal}` : r.code === 0 ? "exit 0" : `exit ${r.code}`);
    const n = runsN.map((r) => ({ run: r.run, ended: ended(r), ms: r.ms, processes: r.processes, calls: r.tally.calls })), p = runsP.map((r) => ({ run: r.run, completed: r.completed, error: r.error, box3dStarted: r.box3dStarted, calls: r.tally.calls }));
    return { ok: runsN.every((r) => !r.timedOut && !r.signal) && runsP.every((r) => r.completed), timedOut: n.filter((r) => r.ended === "timed out").map((r) => r.run), crashed: n.filter((r) => /signal/.test(r.ended)).map((r) => r.run), n, p };
}

// ---- the run ------------------------------------------------------------------------------------------------------------------
/** Everything the registration names, in its order. The options let a gate fly a miniature (its own scripts, a page of its own served as `extra`) -- never the registered corpus. */
export async function run({ gates = null, pages = PAGES, root = ENG, onDone = null, extra = {} } = {}) {
    const corpus = gates || corpusN();
    const controls = { transparent: cTransparent(), reads: cReads(), jolt: await cJolt(), site: cSite() };
    const runsN = await runCorpusN(corpus, { root, onDone }), runsP = await runCorpusP(pages, { root, extra });
    const readingsN = readingsOf(runsN), readingsP = readingsOf(runsP), readings = readingsOf([...runsN, ...runsP]);
    controls.reach = cReach(readingsN, readingsP);
    controls.complete = cComplete(runsN, runsP);
    let commit = null; try { commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch { /* not a checkout */ }
    return {
        registration: REGISTRATION, commit, cap: { maxSpin: MAX_SPIN, slack: SPIN_SLACK, past: PAST }, corpus: { n: corpus, p: pages.map((p) => p.page) }, controls,
        runs: { n: runsN.map(({ tally, ...r }) => ({ ...r, calls: tally.calls, instances: tally.instances, sites: tally.sites })), p: runsP.map(({ tally, ...r }) => ({ ...r, calls: tally.calls, instances: tally.instances, sites: tally.sites })) },
        readings, decision: decide(readings),
    };
}
export const serialize = (results) => JSON.stringify(results, null, 1) + "\n";
export function refuseExisting(file) { if (fs.existsSync(file)) throw new Error(`angularImpulseCensus: ${path.relative(ENG, file)} exists -- a registered run is written once`); }
