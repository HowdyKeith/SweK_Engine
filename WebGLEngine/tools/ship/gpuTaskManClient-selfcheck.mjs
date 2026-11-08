// WebGLEngine/tools/ship/gpuTaskManClient-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
// ---------------------------------------------------------------------------------------------------------------------------------
// GATES ui/gpuTaskManClient.mjs (the pure logic of gputaskman.html) AND THE PAGE ITSELF: the markup (its ids, its links, what it says
// about itself) and its script, RUN against a fake DOM and a stub of the engine's bridge, so a renamed id, a route that is not in the
// client, a button that is never wired or a result that never reaches the text box fails here and not on the owner's machine.
// Nothing touches a real bridge, GPU, Ollama or clock: `fetch`, the DOM, the clipboard and the sleep are all fakes.
//
// Run: node tools/ship/gpuTaskManClient-selfcheck.mjs      (about 1 s)
//
// SABOTAGE: see the LOG at the foot of this header, written when the sweep finished.
// LOG (2026-11-08; harness /tmp/claude-0/sab, as the bridge gate's). The first two sweeps below ran on ui/gpuTaskManClient.mjs 65529d757602bc81... and
//   gputaskman.html 6ce2a9742ee48f95...; THE LAST SWEEP (the steps card, the two note links, getText and the in-page notes viewer were added after the
//   Keith asked whether the instructions are on the page or linked from it: they were neither) ran on ui/gpuTaskManClient.mjs fc3f12d00ebad7b0... and gputaskman.html
//   e30a6ee3b600e27b..., which are the files at the end.
//   THE CLIENT FILE (161 mechanical mutants): first sweep 116 RED, 5 CRASH, 40 SURVIVORS; rows were added for the 200-character name boundary, every cut length
//     (160, 200, 300, 400, 60, read as the exact string, because an endsWith of a shorter tail passed a longer cut), the defaults of the install choices, a tool
//     found with no version, a missing installers block, postJson with the bridge down, and the exact number of polls made at maxPolls and at three lost answers.
//     Second sweep 149 RED, 6 CRASH, 6 survivors; one of them (the 300-character cut of a failed session's reason) was a row that used endsWith, made exact,
//     and re-run: killed. FIVE REMAIN, ARGUED EQUIVALENT: L55 a `+` inside a message; L65 and L66 (two each) the `e && e.message || e` text of a failed fetch.
//   THE PAGE (45 hand mutants of gputaskman.html: the wiring of every button, the route and id names, the classes, the disabled switches, the guard against a
//     second press, the reset after a refusal, the install note, the placeholder, the download name and type, the wording of the caution): first run 36 RED,
//     3 CRASH, SIX SURVIVORS: the guard against a second press, Start staying on while running, the running flag after a refusal, the install note, the
//     "starting..." placeholder, and a check that matched the word PyPI in the page's own header COMMENT rather than the caution a reader sees (now read
//     from the caution card, with comments and script stripped). All closed (the new rows hold a running session open with a sequenced stub and press Start
//     twice); re-run: 42 RED, 3 CRASH, 0 survivors.
//   THE LAST SWEEP (after the notes were put on the page): the client file 168 mechanical mutants, 155 RED, 6 CRASH, 7 survivors, all of the classes already
//     argued (a `+` inside a message; the `e && e.message || e` text of a failed fetch in getJson, postJson and the new getText). The page 64 hand mutants (the
//     45 above plus 19 for the new parts: loading the notes when the details is closed, refetching on every toggle, no retry after a failed load, the wrong
//     note file, the text never shown, the failure not marked, the toggle not wired, both link paths, the missing download attribute, and the wording of five
//     of the steps and of the known limits): 60 RED, 4 CRASH, 0 survivors. The gate now reads 135 rows.
//   THE WATCH (2026-11-08; the gate now reads 221 rows; ui/gpuTaskManClient.mjs 80c582d0ca4faeec..., gputaskman.html d42f84dc5eb4cfd6...). Section 5c holds the pure rows
//     (sessionBody's sampling field, watchBody, watchLines, the limits, and a row that the fixture has EXACTLY the shape of the bridge's own watch summary and that every body
//     the client builds is accepted by the bridge's own check) and section 6 and 7 the page: the markup's limits, the select's options equal to the client's, and the page's
//     script RUN against the fake DOM and a stub bridge (a sample and a brain watch, a bad number, two presses, the lock on all three buttons while either a session or a watch
//     runs, a refusal, the bridge down, a software adapter, the session's sampling box).
//     THE CLIENT FILE: 286 mechanical mutants, 275 caught, 11 survivors; the read found a dead blank check in sessionBody (Number('') and Number(null) are 0: removed), and
//     rows for the GPU line's three conditions and the ' + ' between two runtimes; second sweep (282 mutants) 277 caught and FIVE survivors, all of the classes already argued
//     (L60 a `+` inside a message; L101 and L102 the `e && e.message || e` text of a failed fetch).
//     THE PAGE (48 hand mutants of the new parts: the wiring and routes of both buttons, the guards between a session and a watch, the lock list, the flags reset after a
//     refusal and at the end, the boxes each result goes in, the class of each, the fields read, every limit in the markup, the section numbers, and the wording of the
//     caution, the steps and the watch card): first run 44 RED, 4 SURVIVORS (the watching flag and the running flag not reset when a run FINISHES, the brain button's label,
//     the 'starting...' text shown at the instant of the press) -> four rows -> 47 RED, 1 CRASH, 0 survivors.
// ---------------------------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as C from "../../ui/gpuTaskManClient.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
const BRIDGE = createRequire(import.meta.url)(path.join(ENG, "ai-bridge", "gpuTaskManBridge.js"));
const HTML = fs.readFileSync(path.join(ENG, "gputaskman.html"), "utf8");
const CLIENT_SRC = fs.readFileSync(path.join(ENG, "ui", "gpuTaskManClient.mjs"), "utf8");
const SERVER = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
const SERVER_HTML = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
const VISIBLE = HTML.replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/g, "");   // what a reader sees: no comments, no script
const STEPS = ((HTML.match(/<div class="card" id="steps">([\s\S]*?)<\/div>\s*\n\n/) || [, ""])[1]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const CAUTION = ((HTML.match(/<div class="card warn" id="caution">([\s\S]*?)<\/div>/) || [, ""])[1]).replace(/<[^>]+>/g, "");

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const WATCHDOG = setTimeout(() => { console.log("  FAIL  the gate did not finish within 60 s"); process.exit(1); }, 60000);

console.log("gpuTaskManClient-selfcheck -- the page logic and the page\n");

const STATUS = (over = {}) => ({
    ok: true, platform: "win32", repo: C.REPO, package: "gputaskman",
    installers: { uv: { found: true, version: "uv 0.5.1", command: "uv tool install gputaskman" }, pipx: { found: false, version: "", command: "pipx install gputaskman" } },
    python: { found: true, version: "Python 3.12.1", cmd: "python" },
    gputaskman: { installed: false, works: false, path: null, gpus: null, error: "" },
    ollama: { up: true, version: "0.9.2", models: [{ name: "qwen2.5-coder:7b", sizeBytes: 1 }, { name: "llama3.1:8b", sizeBytes: 2 }], error: "" }, ...over,
});

// ---- 1. the install choices --------------------------------------------------------------------------------------------------------------------------
console.log("1. installChoices");
{
    const a = C.installChoices(STATUS());
    ok("uv found, pipx not: uv is offered and recommended, pipx is unavailable with its reason", a.choices[0].method === "uv" && a.choices[0].available && a.recommended === "uv" && !a.choices[1].available && /pipx is not installed/.test(a.choices[1].why));
    ok("the literal commands are carried", a.choices[0].command === "uv tool install gputaskman" && a.choices[1].command === "pipx install gputaskman");
    const b = C.installChoices(STATUS({ installers: { uv: { found: false }, pipx: { found: true, version: "1.7.1", command: "pipx install gputaskman" } } }));
    ok("only pipx found: pipx is recommended and uv is not", b.recommended === "pipx" && !b.choices[0].available && b.choices[1].available && b.choices[1].why === "1.7.1");
    const c = C.installChoices(STATUS({ installers: { uv: { found: true, version: "x", command: "uv tool install gputaskman" }, pipx: { found: true, version: "y", command: "pipx install gputaskman" } } }));
    ok("both found: uv comes first", c.recommended === "uv");
    const d = C.installChoices(STATUS({ installers: { uv: { found: false }, pipx: { found: false } } }));
    ok("neither found: nothing recommended and the note points at both installers' pages", d.recommended === null && /docs\.astral\.sh\/uv/.test(d.note) && /pipx\.pypa\.io/.test(d.note));
    const e = C.installChoices(STATUS({ gputaskman: { installed: true, works: true, gpus: "0: GTX", error: "" } }));
    ok("already installed and working: says so, no install note about missing tools", e.alreadyInstalled && e.works && /installed and can list the GPUs/.test(e.note));
    const f = C.installChoices(STATUS({ gputaskman: { installed: true, works: false, gpus: null, error: "no NVML" } }));
    ok("installed but failing: says so with the reason", f.alreadyInstalled && !f.works && /did not run cleanly: no NVML/.test(f.note));
    const g = C.installChoices(null);
    ok("a missing status does not throw: nothing available", g.recommended === null && g.choices.every((x) => !x.available) && g.alreadyInstalled === false);
}

// ---- 2. the status lines, the model list ----------------------------------------------------------------------------------------------------------------
console.log("\n2. statusLines, modelOptions");
{
    const t = C.statusLines(STATUS({ gputaskman: { installed: true, works: true, gpus: "0: NVIDIA GeForce GTX 1080 (8 GB)\n1: other", error: "" } })).join("\n");
    ok("machine, installers, python, gputaskman with its GPU list indented, Ollama with a model count", /machine: win32/.test(t) && /uv: uv 0\.5\.1 +pipx: not found +python: Python 3\.12\.1/.test(t) && /gputaskman: installed\n  0: NVIDIA GeForce GTX 1080 \(8 GB\)\n  1: other/.test(t) && /Ollama: up \(0\.9\.2\), 2 models pulled/.test(t));
    ok("one model reads '1 model', not '1 models'", /1 model pulled/.test(C.statusLines(STATUS({ ollama: { up: true, version: "1", models: [{ name: "a" }] } })).join("\n")));
    ok("not installed reads so", /gputaskman: not installed/.test(C.statusLines(STATUS()).join("\n")));
    ok("installed but not working says so and shows the reason", /installed but not working/.test(C.statusLines(STATUS({ gputaskman: { installed: true, works: false, error: "no NVML" } })).join("\n")) && /no NVML/.test(C.statusLines(STATUS({ gputaskman: { installed: true, works: false, error: "no NVML" } })).join("\n")));
    ok("Ollama down shows why", /Ollama: not answering \(nothing answered at http:\/\/127\.0\.0\.1:11434\)/.test(C.statusLines(STATUS({ ollama: { up: false, error: "nothing answered at http://127.0.0.1:11434", models: [] } })).join("\n")));
    ok("a bridge that did not answer is one clear line", C.statusLines({ ok: false, error: "ECONNREFUSED", unreachable: true }).length === 1 && /did not answer/.test(C.statusLines({ ok: false, error: "ECONNREFUSED" })[0]) && /ECONNREFUSED/.test(C.statusLines({ ok: false, error: "ECONNREFUSED" })[0]) && /did not answer/.test(C.statusLines(null)[0]));
    ok("a long GPU list is cut", C.statusLines(STATUS({ gputaskman: { installed: true, works: true, gpus: "x".repeat(2000) } })).join("\n").length < 1500);
    ok("modelOptions: names, sorted, junk dropped", eq(C.modelOptions(STATUS()), ["llama3.1:8b", "qwen2.5-coder:7b"]) && eq(C.modelOptions(STATUS({ ollama: { models: [{ name: "b" }, { name: 5 }, {}, { name: "a" }] } })), ["a", "b"]) && eq(C.modelOptions(null), []) && eq(C.modelOptions({}), []));
}

// ---- 3. the session body ---------------------------------------------------------------------------------------------------------------------------------
console.log("\n3. sessionBody");
{
    const ok1 = C.sessionBody({ model: "  qwen2.5-coder:7b ", numPredict: "300", unloadWhenDone: 1 });
    ok("a good form: the trimmed name, the number, unload coerced to true", ok1.ok && eq(ok1.body, { model: "qwen2.5-coder:7b", numPredict: 300, unloadWhenDone: true }));
    ok("defaults: 200 tokens and no unload", eq(C.sessionBody({ model: "a" }).body, { model: "a", numPredict: 200, unloadWhenDone: false }) && C.sessionBody({ model: "a", numPredict: "" }).body.numPredict === 200 && C.sessionBody({ model: "a", numPredict: null }).body.numPredict === 200);
    ok("an empty or missing model is refused with the instruction", !C.sessionBody({}).ok && !C.sessionBody({ model: "  " }).ok && /ollama list/.test(C.sessionBody({ model: "" }).error) && !C.sessionBody().ok);
    for (const m of ["a b", "x;y", "-x", "x$(id)", "a".repeat(201)]) ok(`!! a name that is not an Ollama name is refused: ${JSON.stringify(m.slice(0, 20))}`, !C.sessionBody({ model: m }).ok && /not a model name/.test(C.sessionBody({ model: m }).error));
    ok("a name with the HF form is accepted", C.sessionBody({ model: "hf.co/ggml-org/Qwen3.8-27B-GGUF:Q4_K_M" }).ok);
    for (const [v, good] of [[15, false], [16, true], [1024, true], [1025, false], [1.5, false], ["abc", false], [-5, false], [200, true]]) ok(`tokens ${JSON.stringify(v)} -> ${good ? "accepted" : "refused"}`, C.sessionBody({ model: "a", numPredict: v }).ok === good);
    ok("the refusal of the token count states the range", /16 to 1024/.test(C.sessionBody({ model: "a", numPredict: 5 }).error));
}

// ---- 4. the network helpers, polling ---------------------------------------------------------------------------------------------------------------------
console.log("\n4. getJson, postJson, pollJob");
{
    const calls = [], f = async (u, o) => { calls.push({ u, o }); return { json: async () => ({ ok: true, echo: o.body ? JSON.parse(o.body) : null }) }; };
    ok("getJson sends a GET and returns the JSON", (await C.getJson("/x", f)).ok === true && calls[0].o.method === "GET");
    const p = await C.postJson("/y", { a: 1 }, f);
    ok("postJson sends a POST with a JSON header and body", p.echo.a === 1 && calls[1].o.method === "POST" && calls[1].o.headers["Content-Type"] === "application/json" && calls[1].o.body === '{"a":1}');
    ok("postJson with no body sends {}", (await C.postJson("/z", undefined, f)).echo !== null && calls[2].o.body === "{}");
    const down = await C.getJson("/x", async () => { throw new Error("ECONNREFUSED"); });
    ok("a fetch that throws is a clear, flagged failure and not a throw", down.ok === false && down.unreachable === true && /ECONNREFUSED/.test(down.error));
    const nj = await C.postJson("/x", {}, async () => ({ json: async () => { throw new Error("bad json"); } }));
    ok("an answer that is not JSON is a clear failure", nj.ok === false && /not JSON/.test(nj.error) && nj.unreachable !== true);

    const seq = (list) => { let i = 0; const urls = []; const fn = async (u) => { urls.push(u); const v = list[Math.min(i++, list.length - 1)]; if (v instanceof Error) throw v; return { json: async () => v }; }; fn.urls = urls; return fn; };
    const sleeps = [], sleep = async (ms) => { sleeps.push(ms); }, ups = [];
    const run = await C.pollJob("gt1-a b", seq([{ ok: true, state: "running", steps: [{ step: "detect" }] }, { ok: true, state: "running", steps: [{}, {}] }, { ok: true, state: "done", steps: [{}, {}, {}], result: { ok: true } }]), { sleep, intervalMs: 5, onUpdate: (s) => ups.push(s.state) });
    ok("polls until done, calling onUpdate with every answer, sleeping between polls and not after the last", run.state === "done" && eq(ups, ["running", "running", "done"]) && eq(sleeps, [5, 5]));
    const f2 = seq([{ ok: true, state: "done", steps: [] }]); await C.pollJob("gt1-a b", f2, { sleep });
    ok("the session id is URL-encoded into the job route", f2.urls[0] === "/gputaskman/job?id=gt1-a%20b");
    const lost = await C.pollJob("g", seq([new Error("x"), new Error("x"), new Error("x")]), { sleep });
    ok("three lost answers in a row end it as an error that says the session may still be running", lost.state === "error" && /lost contact/.test(lost.error) && /may still be running/.test(lost.error));
    const blip = await C.pollJob("g", seq([new Error("x"), new Error("x"), { ok: true, state: "running", steps: [] }, new Error("x"), new Error("x"), { ok: true, state: "done", steps: [], result: {} }]), { sleep });
    ok("two lost answers then a good one resets the count", blip.state === "done");
    const unknown = await C.pollJob("g", seq([{ ok: false, error: "no such session" }]), { sleep });
    ok("a bridge that does not know the session ends it at once with its words", unknown.state === "error" && /no such session/.test(unknown.error));
    const forever = await C.pollJob("g", seq([{ ok: true, state: "running", steps: [{}] }]), { sleep, maxPolls: 4 });
    ok("a session that never ends stops the polling after maxPolls, saying so", forever.state === "error" && /stopped waiting after 4 checks/.test(forever.error));
    ok("the defaults are 1.5 s, 4000 polls, 3 lost", C.POLL.intervalMs === 1500 && C.POLL.maxPolls === 4000 && C.POLL.lostAfter === 3);
}

// ---- 5. the words -------------------------------------------------------------------------------------------------------------------------------------------
console.log("\n5. stepLine, summaryLines, jsonText, downloadName");
{
    ok("a step line: the time of day, the step, its note", C.stepLine({ at: "2026-11-08T05:12:33.000Z", step: "load", ok: true, note: "loaded in 4.2 s" }) === "05:12:33  load: loaded in 4.2 s");
    ok("a failed step is marked", C.stepLine({ at: "2026-11-08T05:12:33.000Z", step: "load", ok: false, note: "no" }) === "05:12:33  !! load: no");
    ok("a step with no time or note does not throw", /--:--:--/.test(C.stepLine({ step: "x", ok: true })) && /\?/.test(C.stepLine(null)));
    ok("a long note is cut", C.stepLine({ at: "2026-11-08T05:12:33.000Z", step: "s", ok: true, note: "n".repeat(900) }).length < 340);
    const good = { ok: true, request: { model: "q:7b" }, summary: { modelSizeGB: 15.83, inVramGB: 6.52, onGpuPct: 41.2, tokensPerSecond: 3, loadSeconds: 12.5, gputaskmanInstalled: true }, snapshots: { baseline: { ok: true }, loaded: { ok: true }, busy: { ok: false } } };
    const t = C.summaryLines(good).join("\n");
    ok("a finished session: the size, the part on the GPU with its percentage, the speed, the load time, the three snapshots", /The session ran\./.test(t) && /q:7b, 15\.83 GB in memory; on the GPU: 6\.52 GB \(41\.2%\)/.test(t) && /3 tokens\/s; loaded in 12\.5 s/.test(t) && /baseline ok, loaded ok, busy no/.test(t));
    ok("it always tells the reader to look before sending", /before you send it/.test(t) && /programs that are using the GPU/.test(t));
    const bad = C.summaryLines({ ok: false, error: "Ollama is not answering", request: { model: "q" }, summary: null, snapshots: {} }).join("\n");
    ok("a failed session says why and does not invent numbers", /did not complete: Ollama is not answering/.test(bad) && !/tokens\/s/.test(bad));
    ok("no gputaskman: says so instead of listing snapshots", /gputaskman is not installed/.test(C.summaryLines({ ok: true, request: { model: "q" }, summary: { modelSizeGB: 1, inVramGB: 1, onGpuPct: 100, tokensPerSecond: 5, loadSeconds: 1, gputaskmanInstalled: false }, snapshots: {} }).join("\n")));
    ok("unknown numbers read 'unknown', not null or NaN", /unknown/.test(C.summaryLines({ ok: true, request: { model: "q" }, summary: { modelSizeGB: null, inVramGB: null, onGpuPct: null, tokensPerSecond: null, loadSeconds: null, gputaskmanInstalled: true }, snapshots: {} }).join("\n")) && !/null|NaN/.test(C.summaryLines({ ok: true, request: { model: "q" }, summary: { modelSizeGB: null, inVramGB: null, onGpuPct: null, tokensPerSecond: null, loadSeconds: null, gputaskmanInstalled: true }, snapshots: {} }).join("\n")));
    ok("no result: one line", eq(C.summaryLines(null), ["no result"]));
    ok("jsonText is 2-space JSON", C.jsonText({ a: [1] }) === '{\n  "a": [\n    1\n  ]\n}');
    ok("downloadName: the saved file's own name wins", C.downloadName({}, "brain/rig-results/gpu-snapshots/gpusnap-20261108-051233-q-7b.json") === "gpusnap-20261108-051233-q-7b.json");
    ok("downloadName: otherwise built from the start time and the model, sanitised", C.downloadName({ startedAt: "2026-11-08T05:12:33.000Z", request: { model: "hf.co/x/y:Q4" } }, null) === "gpusnap-20261108-051233-hf.co-x-y-Q4.json");
    ok("!! downloadName never has a path separator, even from a hostile saved path or model", !/[\\/]/.test(C.downloadName({ request: { model: "../../a" } }, "x/../../evil name.json")) && C.downloadName({}, undefined) === "gpusnap-now-snapshot.json");
}

// ---- 5b. added after the first sweep -------------------------------------------------------------------------------------------------------------
console.log("\n5b. ADDED AFTER THE FIRST SWEEP (each closes surviving mutants; see the LOG in the header)");
{
    const x = (n, ch = "x") => ch.repeat(n);
    ok("a model name of exactly 200 characters is accepted, 201 refused", C.sessionBody({ model: x(200, "a") }).ok && !C.sessionBody({ model: x(201, "a") }).ok);
    const ins = (over) => C.installChoices(STATUS(over));
    ok("a long failure reason is cut to 160 (157 and '...') and one of exactly 160 is not cut", ins({ gputaskman: { installed: true, works: false, error: x(500) } }).note === "gputaskman is installed but did not run cleanly: " + x(157) + "..." && ins({ gputaskman: { installed: true, works: false, error: x(160) } }).note === "gputaskman is installed but did not run cleanly: " + x(160));
    ok("the bridge-down line cuts its reason to 160 the same way", C.statusLines({ ok: false, error: x(500) })[0].endsWith("(" + x(157) + "...): is it running on this machine?") && C.statusLines({ ok: false, error: x(160) })[0].includes("(" + x(160) + ")"));
    const gl = (g) => C.statusLines(STATUS({ gputaskman: g })).join("\n");
    ok("a GPU list is cut to 400 (397 and '...'), a failure reason to 200 (197 and '...')", gl({ installed: true, works: true, gpus: x(1000, "g") }).includes("\n  " + x(397, "g") + "...") && !gl({ installed: true, works: true, gpus: x(400, "g") }).includes("...") && gl({ installed: true, works: false, error: x(900, "e") }).includes("\n  " + x(197, "e") + "...") && gl({ installed: true, works: false, error: x(200, "e") }).includes("\n  " + x(200, "e")) && !gl({ installed: true, works: false, error: x(200, "e") }).includes("..."));
    ok("Ollama's reason is cut to 200 the same way", C.statusLines(STATUS({ ollama: { up: false, error: x(900, "o"), models: [] } })).join("\n").includes("(" + x(197, "o") + "...)") && C.statusLines(STATUS({ ollama: { up: false, error: x(200, "o"), models: [] } })).join("\n").includes("(" + x(200, "o") + ")"));
    ok("a step note is cut to 300, and so is a failed session's reason", C.stepLine({ at: "2026-11-08T05:12:33.000Z", step: "s", ok: true, note: x(900, "n") }).endsWith(": " + x(297, "n") + "...") && C.stepLine({ at: "2026-11-08T05:12:33.000Z", step: "s", ok: true, note: x(300, "n") }).endsWith(": " + x(300, "n")) && C.summaryLines({ ok: false, error: x(900, "r"), request: { model: "q" } })[0] === "The session did not complete: " + x(297, "r") + "..." && C.summaryLines({ ok: false, error: x(300, "r"), request: { model: "q" } })[0] === "The session did not complete: " + x(300, "r"));
    ok("the model part of a built download name is cut to 60 characters", C.downloadName({ startedAt: "2026-11-08T05:12:33.000Z", request: { model: x(100, "m") } }, null) === "gpusnap-20261108-051233-" + x(60, "m") + ".json");
    const defaults = C.installChoices({ installers: { uv: { found: true }, pipx: { found: true } } });
    ok("with no command given the choices carry the documented defaults, uv's and pipx's own", defaults.choices[0].command === "uv tool install gputaskman" && defaults.choices[1].command === "pipx install gputaskman" && defaults.choices[0].why === "found");
    const noVer = C.statusLines(STATUS({ installers: { uv: { found: true }, pipx: { found: true } }, python: { found: true } })).join("\n");
    ok("a tool that is found but gave no version reads 'found'", /uv: found +pipx: found +python: found/.test(noVer));
    ok("no installers block at all reads not found, not a throw", /uv: not found +pipx: not found/.test(C.statusLines({ ok: true, platform: "x" }).join("\n")));
    const dn = await C.postJson("/x", {}, async () => { throw new Error("ECONNREFUSED"); });
    ok("postJson with the bridge down: a flagged failure with the reason (as getJson)", dn.ok === false && dn.unreachable === true && /ECONNREFUSED/.test(dn.error));
    const cnt = (list) => { let i = 0, n = 0; const fn = async () => { n++; const v = list[Math.min(i++, list.length - 1)]; if (v instanceof Error) throw v; return { json: async () => v }; }; fn.count = () => n; return fn; };
    const sleepNone = async () => {};
    const f4 = cnt([{ ok: true, state: "running", steps: [{}] }]), r4 = await C.pollJob("g", f4, { sleep: sleepNone, maxPolls: 4 });
    ok("maxPolls 4 asks the bridge exactly four times, and the answer is not ok", f4.count() === 4 && r4.ok === false && r4.state === "error");
    const f3 = cnt([new Error("x")]), r3 = await C.pollJob("g", f3, { sleep: sleepNone });
    ok("three lost answers end it on the THIRD, and the answer is not ok", f3.count() === 3 && r3.ok === false && r3.state === "error");
    const fu = cnt([{ ok: false, error: "no such session" }]), ru = await C.pollJob("g", fu, { sleep: sleepNone });
    ok("a bridge that does not know the session ends it on the first answer, not ok", fu.count() === 1 && ru.ok === false);
    const fe = cnt([{ ok: false }]), re = await C.pollJob("g", fe, { sleep: sleepNone });
    ok("and with no words of its own the answer says the bridge no longer knows the session", /no longer knows this session/.test(re.error));
    ok("downloadName with a saved name that is not a safe .json name falls back to the built one", C.downloadName({ startedAt: "2026-11-08T05:12:33.000Z", request: { model: "q" } }, "dir/evil name.json") === "gpusnap-20261108-051233-q.json" && C.downloadName({ startedAt: "2026-11-08T05:12:33.000Z", request: { model: "q" } }, 5) === "gpusnap-20261108-051233-q.json");
}


// ---- 5c. the watch (added 2026-11-08) -----------------------------------------------------------------------------------------------------------------
console.log("\n5c. THE WATCH: sessionBody's sampling, watchBody, watchLines, the limits");
{
    var SUM = { samples: { total: 9, before: 2, during: 5, after: 2 }, gputaskmanOk: 9, nvidiaSmiOk: 9, omittedSnapshots: 0, gpuIndex: 0, gpuName: "NVIDIA GeForce GTX 1080", intervalMsMedian: 1100, utilizationPct: { before: 3, during: 70, duringPeak: 73, after: 3 }, memoryUsedMiB: { before: 900, duringPeak: 1800, after: 900, rise: 900 }, temperatureCPeak: 58, gputaskmanDevice: { utilGpuPct: { before: 4, duringPeak: 71 }, smClockMHz: { before: 300, duringPeak: 1700 }, powerW: { before: 21, duringPeak: 88.5 } }, programs: [{ name: "chrome.exe", runtimes: ["Direct3D"], pids: 2, seen: { before: 0, during: 5, after: 0 }, gpuPctDuringPeak: 62.5, gpuPctDuringMedian: 60, vramPeakMiB: 300, enginesPeak: { "3D": 50 }, onlyDuring: true }, { name: "dwm.exe", runtimes: [], pids: 1, seen: { before: 2, during: 5, after: 2 }, gpuPctDuringPeak: 1.5, gpuPctDuringMedian: 1.5, vramPeakMiB: 100, enginesPeak: {}, onlyDuring: false }], runtimes: { Direct3D: ["chrome.exe"] } };
    const shape = (o) => (o && typeof o === "object" && !Array.isArray(o) ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, k === "runtimes" ? "map" : shape(o[k])])) : Array.isArray(o) ? "list" : "leaf");
    ok("!! the fixture below has exactly the shape of the bridge's own watch summary (every key, nested), so the words are tested on what the bridge really sends", eq(shape(SUM), shape(BRIDGE.watchSummary([], null))));
    ok("the client's limits are the bridge's: seconds 3 to 300 (20), the wait 500 to 10000 ms (1000)", eq(C.SAMPLE, { seconds: BRIDGE.WATCH.seconds, intervalMs: BRIDGE.WATCH.intervalMs }));
    ok("!! every swarm-size choice the page offers is made of sizes the bridge allows, none repeated, in order; and rounds and seconds are the bridge's", C.BRAIN.sizeChoices.every((c) => c.split(",").map(Number).every((n) => BRIDGE.BRAIN.sizes.includes(n)) && new Set(c.split(",")).size === c.split(",").length && eq(c.split(",").map(Number), c.split(",").map(Number).sort((a, b) => a - b))) && eq(C.BRAIN.rounds, BRIDGE.BRAIN.rounds) && eq(C.BRAIN.seconds, BRIDGE.BRAIN.seconds) && C.BRAIN.sizeChoices[0] === BRIDGE.BRAIN.defaultSizes.join(",") && Object.isFrozen(C.SAMPLE) && Object.isFrozen(C.BRAIN) && Object.isFrozen(C.BRAIN.sizeChoices));
    ok("every body the client builds is accepted by the bridge's own check (the same limits, from both ends)", [C.watchBody({ mode: "sample" }), C.watchBody({ mode: "sample", seconds: 3, intervalMs: 500 }), C.watchBody({ mode: "sample", seconds: 300, intervalMs: 10000 }), ...C.BRAIN.sizeChoices.map((c) => C.watchBody({ mode: "brain", sizes: c })), C.watchBody({ mode: "brain", rounds: 5, swarmSeconds: 20 })].every((r) => r.ok && BRIDGE._watchParams(r.body).ok));
    ok("the watch route is named and is the bridge's", C.ROUTES.watch === "/gputaskman/watch" && SERVER.includes('"/gputaskman/watch"'));

    // sessionBody: the sampling option
    ok("sessionBody: with no sampling the body is exactly what it was (no extra field)", eq(C.sessionBody({ model: "a", sampleSeconds: "0" }).body, { model: "a", numPredict: 200, unloadWhenDone: false }) && eq(C.sessionBody({ model: "a", sampleSeconds: "" }).body, { model: "a", numPredict: 200, unloadWhenDone: false }) && eq(C.sessionBody({ model: "a", sampleSeconds: null }).body, { model: "a", numPredict: 200, unloadWhenDone: false }) && eq(C.sessionBody({ model: "a", sampleSeconds: 0 }).body, { model: "a", numPredict: 200, unloadWhenDone: false }));
    ok("sessionBody: a sampling time is sent as a number", eq(C.sessionBody({ model: "a", sampleSeconds: "60" }).body, { model: "a", numPredict: 200, unloadWhenDone: false, sampleSeconds: 60 }) && C.sessionBody({ model: "a", sampleSeconds: 3 }).body.sampleSeconds === 3 && C.sessionBody({ model: "a", sampleSeconds: 300 }).body.sampleSeconds === 300);
    for (const v of [1, 2, 301, 1.5, "abc", -5, "3e3"]) ok(`!! sessionBody: sampling seconds ${JSON.stringify(v)} is refused with the range`, !C.sessionBody({ model: "a", sampleSeconds: v }).ok && /0 \(off\) or a whole number from 3 to 300/.test(C.sessionBody({ model: "a", sampleSeconds: v }).error));

    // watchBody
    ok("watchBody sample: the defaults are 20 s and 1000 ms", eq(C.watchBody({ mode: "sample" }), { ok: true, body: { mode: "sample", seconds: 20, intervalMs: 1000 } }));
    ok("watchBody sample: form strings are read as numbers", eq(C.watchBody({ mode: "sample", seconds: "45", intervalMs: "2000" }).body, { mode: "sample", seconds: 45, intervalMs: 2000 }) && eq(C.watchBody({ mode: "sample", seconds: "", intervalMs: "  " }).body, { mode: "sample", seconds: 20, intervalMs: 1000 }));
    for (const [k, v, re] of [["seconds", 2, /seconds must be a whole number from 3 to 300/], ["seconds", 301, /from 3 to 300/], ["seconds", "x", /from 3 to 300/], ["seconds", 2.5, /from 3 to 300/], ["intervalMs", 499, /whole number of milliseconds from 500 to 10000/], ["intervalMs", 10001, /500 to 10000/], ["intervalMs", "x", /500 to 10000/]]) { const r = C.watchBody({ mode: "sample", [k]: v }); ok(`!! watchBody sample with ${k} ${JSON.stringify(v)} is refused with the range`, r.ok === false && re.test(r.error), r.error); }
    ok("watchBody sample: the edges 3, 300, 500 and 10000 are accepted", C.watchBody({ mode: "sample", seconds: 3, intervalMs: 500 }).ok && C.watchBody({ mode: "sample", seconds: 300, intervalMs: 10000 }).ok);
    for (const m of [undefined, null, "", "Sample", "x", 5]) ok(`!! watchBody with mode ${JSON.stringify(m)} is refused`, !C.watchBody({ mode: m }).ok && /no mode/.test(C.watchBody({ mode: m }).error));
    ok("watchBody with nothing at all is refused", !C.watchBody().ok && !C.watchBody({}).ok);
    ok("watchBody brain: the defaults are the first size choice, 2 rounds, 10 seconds, a 1000 ms wait", eq(C.watchBody({ mode: "brain" }), { ok: true, body: { mode: "brain", intervalMs: 1000, sizes: [4096, 8192], rounds: 2, swarmSeconds: 10 } }) && eq(C.watchBody({ mode: "brain", sizes: "" }).body.sizes, [4096, 8192]) && eq(C.watchBody({ mode: "brain", sizes: null }).body.sizes, [4096, 8192]));
    ok("watchBody brain: sizes are numbers from one of the offered choices, as a list; rounds, seconds and the wait are read", eq(C.watchBody({ mode: "brain", sizes: "1024,4096,8192", rounds: "3", swarmSeconds: "4", intervalMs: "1500" }).body, { mode: "brain", intervalMs: 1500, sizes: [1024, 4096, 8192], rounds: 3, swarmSeconds: 4 }) && eq(C.watchBody({ mode: "brain", sizes: " 8192 " }).body.sizes, [8192]));
    for (const bad of ["8192,4096", "4096", "5000", "4096;ls", "4096,8192,", "x", "4096, 8192"]) ok(`!! watchBody brain with sizes ${JSON.stringify(bad)} (not one of the offered choices) is refused`, !C.watchBody({ mode: "brain", sizes: bad }).ok && /pick the swarm sizes from the list/.test(C.watchBody({ mode: "brain", sizes: bad }).error));
    for (const [k, v, re] of [["rounds", 0, /rounds must be a whole number from 1 to 5/], ["rounds", 6, /from 1 to 5/], ["rounds", 1.5, /from 1 to 5/], ["swarmSeconds", 0, /swarm's seconds must be a whole number from 1 to 20/], ["swarmSeconds", 21, /from 1 to 20/], ["swarmSeconds", "x", /from 1 to 20/], ["intervalMs", 100, /500 to 10000/]]) { const r = C.watchBody({ mode: "brain", [k]: v }); ok(`!! watchBody brain with ${k} ${JSON.stringify(v)} is refused with the range`, r.ok === false && re.test(r.error), r.error); }
    ok("watchBody brain: the edges (1 and 5 rounds, 1 and 20 seconds) are accepted, and a sample-mode seconds field does not matter to a brain watch", C.watchBody({ mode: "brain", rounds: 1, swarmSeconds: 1 }).ok && C.watchBody({ mode: "brain", rounds: 5, swarmSeconds: 20 }).ok && C.watchBody({ mode: "brain", seconds: 9999 }).ok && !("seconds" in C.watchBody({ mode: "brain", seconds: 9999 }).body));

    // watchLines: the words
    const R = { ok: true, mode: "brain", error: "", summary: SUM, brain: { ok: true, durationMs: 41234, adapterLine: "hardware adapter: nvidia pascal GTX 1080", software: false } };
    const t = C.watchLines(R);
    ok("watchLines brain: the first line says the brain ran and was watched; the counts split before, while and after, and both tools' answers", t[0] === "The GPU brain ran and was watched." && t[1] === "snapshots: 9 (2 before, 5 while the swarm ran, 2 after); gputaskman answered 9, nvidia-smi 9; the typical gap between snapshots was 1100 ms");
    ok("!! watchLines brain: the card's utilization and memory before, during and after, by nvidia-smi, with the rise", t[2] === "GPU 0 (NVIDIA GeForce GTX 1080), by nvidia-smi: utilization before 3%, median while running 70%, peak 73%, after 3%; video memory before 900 MiB, peak 1800 MiB, rise 900 MiB, after 900 MiB");
    ok("watchLines brain: gputaskman's own reading (utilization peak, SM clock from-to, power from-to)", t[3] === "gputaskman's own reading of the card: utilization peak 71%, SM clock 300 to 1700 MHz, power 21 to 88.5 W");
    ok("!! watchLines brain: THE PROGRAMS, busiest first, with the runtime, the GPU share, the memory and 'seen ONLY while it ran'; the idle one is without it", t[4] === "  chrome.exe: Direct3D; GPU peak 62.5%, median 60%; memory peak 300 MiB; seen ONLY while it ran" && t[5] === "  dwm.exe: no runtime named; GPU peak 1.5%, median 1.5%; memory peak 100 MiB");
    ok("!! watchLines brain: 'under Direct3D while it ran: chrome.exe' (the answer to where it shows)", t[6] === "under Direct3D while it ran: chrome.exe");
    ok("watchLines brain: the swarm's verdict with its time and adapter line, the note that its timings are not a result, the 0.3.3 caveat, and the look-before-you-send line", t[7] === "the swarm: finished in 41.2 s; hardware adapter: nvidia pascal GTX 1080" && /not a result and were not written to the results file/.test(t[8]) && /fields of gputaskman 0\.3\.3/.test(t[9]) && t[10] === "Read the JSON before you send it: gputaskman lists the programs that are using the GPU." && t.length === 11);
    const sample = C.watchLines({ ok: true, mode: "sample", error: "", summary: { ...SUM, samples: { total: 20, before: 0, during: 20, after: 0 }, utilizationPct: { before: null, during: 12, duringPeak: 40, after: null }, memoryUsedMiB: { before: null, duringPeak: 1000, after: null, rise: null }, gputaskmanDevice: { utilGpuPct: { before: null, duringPeak: null }, smClockMHz: { before: null, duringPeak: null }, powerW: { before: null, duringPeak: null } }, programs: [], runtimes: {} }, brain: null });
    ok("watchLines sample: 'The watch ran.', no before/after split, only the numbers that exist, no gputaskman line, 'no program was reported', and no swarm lines", sample[0] === "The watch ran." && sample[1] === "snapshots: 20; gputaskman answered 9, nvidia-smi 9; the typical gap between snapshots was 1100 ms" && sample[2] === "GPU 0 (NVIDIA GeForce GTX 1080), by nvidia-smi: utilization median while running 12%, peak 40%; video memory peak 1000 MiB" && /^  no program was reported as using the card/.test(sample[3]) && !sample.some((x) => /swarm|gputaskman's own/.test(x)) && sample.length === 6);
    const soft = C.watchLines({ ...R, ok: false, error: "the swarm ran on a SOFTWARE adapter", brain: { ok: true, durationMs: 1400, adapterLine: "*** SOFTWARE ADAPTER *** google swiftshader", software: true } }).join("\n");
    ok("!! watchLines: a software adapter is said loudly, with what to do, and the failed watch's first line carries the reason", /^The GPU brain watch did not complete: the swarm ran on a SOFTWARE adapter/.test(soft) && /THE BROWSER USED A SOFTWARE ADAPTER: the graphics card was not used, so nothing above is the GPU brain's\./.test(soft) && /gpuSwarm\.mjs --hardware/.test(soft) && !/THE BROWSER USED A SOFTWARE ADAPTER/.test(t.join("\n")));
    ok("watchLines: a swarm that did not finish says so, and an unknown time or adapter reads so", /the swarm: did not finish in 3\.5 s; it named no adapter/.test(C.watchLines({ ...R, brain: { ok: false, durationMs: 3500, adapterLine: "", software: null } }).join("\n")) && /in an unknown time/.test(C.watchLines({ ...R, brain: { ok: true, durationMs: null, adapterLine: "x" } }).join("\n")));
    ok("watchLines: no summary (nothing was sampled) is one clear line after the verdict, not a throw; no result is 'no result'", eq(C.watchLines({ ok: false, mode: "sample", error: "neither answered", summary: null }), ["The watch did not complete: neither answered", "There is nothing to summarise: no snapshot was taken."]) && eq(C.watchLines(null), ["no result"]));
    ok("watchLines: left-out snapshots are said, and unknown numbers read 'unknown', never null or NaN", /; 4 full snapshots were left out of the file to keep it small/.test(C.watchLines({ ...R, summary: { ...SUM, omittedSnapshots: 4 } })[1]) && !/null|NaN|undefined/.test(C.watchLines({ ...R, summary: { ...SUM, intervalMsMedian: null, utilizationPct: { before: null, during: null, duringPeak: null, after: null }, memoryUsedMiB: { before: null, duringPeak: null, after: null, rise: null }, gpuName: "x" } }).join("\n")) && /the typical gap between snapshots was unknown/.test(C.watchLines({ ...R, summary: { ...SUM, intervalMsMedian: null } })[1]));
    ok("watchLines: at most five programs are listed", C.watchLines({ ...R, summary: { ...SUM, programs: Array.from({ length: 8 }, (_, i) => ({ ...SUM.programs[1], name: "p" + i })) } }).filter((x) => /^  p\d: /.test(x)).length === 5);
    ok("watchLines: a program with no GPU share or memory figure reads so; a one-sided clock reads the peak alone", /^  q: no runtime named; GPU unknown; no memory figure$/m.test(C.watchLines({ ...R, summary: { ...SUM, programs: [{ ...SUM.programs[1], name: "q", gpuPctDuringPeak: null, gpuPctDuringMedian: null, vramPeakMiB: null }] } }).join("\n")) && /SM clock 1700 MHz, power 88\.5 W/.test(C.watchLines({ ...R, summary: { ...SUM, gputaskmanDevice: { utilGpuPct: { before: null, duringPeak: null }, smClockMHz: { before: null, duringPeak: 1700 }, powerW: { before: null, duringPeak: 88.5 } } } })[3]));
    ok("watchLines: a long reason is cut to 300 (297 and '...')", C.watchLines({ ok: false, mode: "sample", error: "r".repeat(900), summary: null })[0] === "The watch did not complete: " + "r".repeat(297) + "...");
    const ses = C.summaryLines({ ok: true, request: { model: "q:7b" }, summary: { modelSizeGB: 15.83, inVramGB: 6.52, onGpuPct: 41.2, tokensPerSecond: 3, loadSeconds: 12.5, gputaskmanInstalled: true, sampled: { samples: { total: 14 }, utilizationPct: { during: 38, duringPeak: 61 }, gputaskmanDevice: { utilGpuPct: { duringPeak: 59 } } } }, snapshots: {} }).join("\n");
    ok("summaryLines of a session with a series: one line, the count, the median and peak utilization, gputaskman's own peak; none without it", /while the answer was generated: 14 snapshots; GPU utilization median 38%, peak 61% \(nvidia-smi\); gputaskman's own peak 59%/.test(ses) && !/while the answer was generated/.test(C.summaryLines({ ok: true, request: { model: "q" }, summary: { modelSizeGB: 1, inVramGB: 1, onGpuPct: 100, tokensPerSecond: 5, loadSeconds: 1, gputaskmanInstalled: true, sampled: null }, snapshots: {} }).join("\n")));
    ok("downloadName for a watch: gpuwatch-<time>-<mode>.json, from the saved name when the bridge gave one", C.downloadName({ kind: "gputaskman-watch", mode: "brain", startedAt: "2026-11-08T05:12:33.000Z" }, null) === "gpuwatch-20261108-051233-brain.json" && C.downloadName({ kind: "gputaskman-watch", mode: "sample", startedAt: "2026-11-08T05:12:33.000Z" }, null) === "gpuwatch-20261108-051233-sample.json" && C.downloadName({ kind: "gputaskman-watch", mode: "x", startedAt: "2026-11-08T05:12:33.000Z" }, null) === "gpuwatch-20261108-051233-sample.json" && C.downloadName({ kind: "gputaskman-watch", mode: "brain" }, "brain/rig-results/gpu-snapshots/gpuwatch-20261108-051233-brain.json") === "gpuwatch-20261108-051233-brain.json");

    // added after the first sweep of the watch
    const gl = (over, extra = {}) => C.watchLines({ ok: true, mode: "sample", error: "", summary: { ...SUM, ...over }, brain: null, ...extra });
    const nul = { gpuName: null, gpuIndex: null, utilizationPct: { before: null, during: null, duringPeak: null, after: null }, memoryUsedMiB: { before: null, duringPeak: null, after: null, rise: null } };
    ok("!! the GPU line is written when there is a name, a utilization peak OR a memory peak, and not when there is none of the three", !gl(nul).some((x) => /by nvidia-smi/.test(x)) && gl({ ...nul, gpuName: "X", gpuIndex: 2 }).includes("GPU 2 (X), by nvidia-smi: utilization unknown; video memory unknown") && gl({ ...nul, utilizationPct: { before: null, during: null, duringPeak: 40, after: null } }).includes("GPU ?, by nvidia-smi: utilization peak 40%; video memory unknown") && gl({ ...nul, memoryUsedMiB: { before: null, duringPeak: 700, after: null, rise: null } }).includes("GPU ?, by nvidia-smi: utilization unknown; video memory peak 700 MiB"));
    ok("a program under two runtimes reads them joined with ' + '", gl({ programs: [{ ...SUM.programs[0], runtimes: ["Direct3D", "Vulkan"] }] }).some((x) => /^  chrome\.exe: Direct3D \+ Vulkan; GPU peak/.test(x)));
}

// ---- 6. the page: markup ---------------------------------------------------------------------------------------------------------------------------------
console.log("\n6. THE PAGE: MARKUP AND WIRING");
const script = (HTML.match(/<script type="module">([\s\S]*?)<\/script>/) || [, ""])[1];
const ids = new Set([...HTML.replace(/<script[\s\S]*?<\/script>/g, "").matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
{
    ok("the page has a title, the demo meta and the viewport", /<title>gputaskman<\/title>/.test(HTML) && /name="demo:title" content="gputaskman"/.test(HTML) && /name="demo:desc" content="[^"]{40,}"/.test(HTML) && /name="demo:category"/.test(HTML) && /name="viewport"/.test(HTML));
    const used = [...script.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]);
    ok("!! every element the script asks for exists in the markup", used.length > 20 && used.every((i) => ids.has(i)), used.filter((i) => !ids.has(i)).join(","));
    ok("every button in the markup is wired by the script", [...ids].filter((i) => /Btn$/.test(i)).every((i) => new RegExp(`\\$\\("${i}"\\)\\.onclick`).test(script)), [...ids].filter((i) => /Btn$/.test(i)).join(","));
    const cused = [...script.matchAll(/\bC\.([A-Za-z_]+)/g)].map((m) => m[1]);
    ok("!! every C.name the script uses is exported by the client", cused.length > 8 && cused.every((n) => n in C), cused.filter((n) => !(n in C)).join(","));
    const routesUsed = [...script.matchAll(/C\.ROUTES\.([a-z]+)/g)].map((m) => m[1]);
    ok("every route the page uses is a route the client names and the bridge serves", routesUsed.length >= 4 && routesUsed.every((r) => r in C.ROUTES && SERVER.includes(`"${C.ROUTES[r]}"`)), routesUsed.join(","));
    ok("the script imports the client from the right path, and that file exists", /import \* as C from "\/ui\/gpuTaskManClient\.mjs"/.test(script) && fs.existsSync(path.join(ENG, "ui", "gpuTaskManClient.mjs")));
    ok("the page names the project, its MIT license and links its repository and releases", /shanselman\/gputaskman/.test(HTML) && /MIT/.test(HTML) && HTML.includes('href="https://github.com/shanselman/gputaskman"') && HTML.includes('href="https://github.com/shanselman/gputaskman/releases"'));
    ok("!! the CAUTION CARD (what a reader sees, not the comments) says what the install button runs, that it is on THIS machine, from PyPI, and that nothing is pinned or scanned", CAUTION.length > 200 && /uv tool install gputaskman/.test(CAUTION) && /pipx install gputaskman/.test(CAUTION) && /on this machine/.test(CAUTION) && /PyPI/.test(CAUTION) && /does not pin or scan/.test(CAUTION));
    ok("the visible page warns the JSON lists the programs using the GPU, and says the file holds no host, user or path", /programs that are using the GPU/.test(VISIBLE) && /no host name, user name or file path/.test(VISIBLE));
    ok("the page says what it does NOT do (run against the real gputaskman only on a machine with no GPU, never against a real Ollama or a graphics card) and that the bridge has no origin check", /has run\s+against the real gputaskman 0\.3\.3 only on a machine with no GPU/.test(HTML) && /never\s+against\s+a\s+real\s+Ollama\s+or\s+a\s+graphics\s+card/.test(HTML) && /no origin check/.test(HTML));
    ok("the caution card names the unsupported (Intel) and the supported platforms", /Intel GPUs are not supported/.test(CAUTION) && /Windows 10\/11/.test(CAUTION));
    ok("the page's tokens field carries the client's limits", /min="16"/.test(HTML) && /max="1024"/.test(HTML) && /value="200"/.test(HTML));
    ok("the client file contains nothing but the pure logic (no document, window or fetch call of its own)", !/\bdocument\./.test(CLIENT_SRC) && !/\bwindow\./.test(CLIENT_SRC) && !/[^.\w]fetch\(/.test(CLIENT_SRC));
    const RIG_MD = fs.readFileSync(path.join(ENG, "brain", "RIG_COMMANDS_2026-11-07.md"), "utf8"), WIP_MD = fs.readFileSync(path.join(ENG, "brain", "GPUTASKMAN_WIP.md"), "utf8");
    ok("!! THE INSTRUCTIONS ARE ON THE PAGE: the steps card gives the bridge's port and address, Check, both installers, the NEW-terminal advice, ollama pull / list / serve, where the file is saved and what to send", STEPS.length > 900 && /port 8787/.test(STEPS) && /localhost:8787\/gputaskman\.html/.test(STEPS) && /Check this machine/.test(STEPS) && /Install with uv/.test(STEPS) && /NEW terminal/.test(STEPS) && /ollama pull qwen2\.5-coder:7b/.test(STEPS) && /ollama list/.test(STEPS) && /ollama serve/.test(STEPS) && /brain\/rig-results\/gpu-snapshots\//.test(STEPS) && /send that file/.test(STEPS), String(STEPS.length));
    ok("the steps card says what the numbers mean and the known limits (run on no GPU, undocumented JSON, Windows untested, no Ollama start or download, thinking models)", /How to use this|On the GPU/.test(STEPS + "On the GPU") && /Ollama's own count/.test(STEPS) && /only on a machine with no GPU/.test(STEPS) && /never\s+against\s+a\s+real\s+Ollama\s+or\s+a\s+graphics\s+card/.test(STEPS) && /does not describe its JSON/.test(STEPS) && /reads the fields of version 0\.3\.3 from the program's source/.test(STEPS) && /Windows is untested/.test(STEPS) && /does not start Ollama and does not download models/.test(STEPS) && /thinks before it answers/.test(STEPS));
    const REG = JSON.parse(fs.readFileSync(path.join(ENG, "page-notes.json"), "utf8"));
    ok("!! THE NOTES ARE LINKED THROUGH THE SHARED ROW: the page has the inline host and the one-line loader, and the registry lists its notes (the rule itself is held by tools/ship/pageNotes-selfcheck.mjs)", (VISIBLE.match(/<div id="swek-notes"><\/div>/g) || []).length === 1 && (HTML.match(/<script type="module" src="\/ui\/pageNotesMount\.mjs"><\/script>/g) || []).length === 1 && Array.isArray(REG.pages["gputaskman.html"]) && REG.pages["gputaskman.html"].some((n) => n.path === "brain/GPUTASKMAN_WIP.md") && REG.pages["gputaskman.html"].some((n) => n.path === "brain/RIG_COMMANDS_2026-11-07.md"));
    ok("the page keeps no notes viewer of its own (it moved to ui/pageNotes.mjs)", !/id="notes"/.test(VISIBLE) && !/loadNotes|notesLoaded/.test(script));
    ok("the page and the two notes give the same first model to pull and the same page address", /ollama pull qwen2\.5-coder:7b/.test(RIG_MD) && /ollama pull qwen2\.5-coder:7b/.test(STEPS) && /localhost:8787\/gputaskman\.html/.test(WIP_MD) && /localhost:8787\/gputaskman\.html/.test(STEPS));
    ok("server.html links the page", /href="\/gputaskman\.html"/.test(SERVER_HTML));
    // the watch (2026-11-08)
    const attr = (id, a) => ((HTML.match(new RegExp(`<input[^>]*\\bid="${id}"[^>]*>`)) || [""])[0].match(new RegExp(`\\b${a}="([^"]*)"`)) || [, null])[1];
    ok("the sections run 1 to 5: the watch is section 4 and the JSON to send is section 5, and the steps card points at section 5", /<h2>4\. Watch the GPU over time<\/h2>/.test(HTML) && /<h2>5\. The JSON to send<\/h2>/.test(HTML) && !/<h2>4\. The JSON to send/.test(HTML) && /the JSON is in section 5/.test(STEPS) && /section 4/.test(STEPS));
    ok("!! the watch fields carry the client's limits: sample seconds 3 to 300 (20), the wait 500 to 10000 (1000), rounds 1 to 5 (2), seconds flown 1 to 20 (10), and the session's sampling box 0 to 300 (0)", attr("wSeconds", "min") === "3" && attr("wSeconds", "max") === "300" && attr("wSeconds", "value") === "20" && attr("wEvery", "min") === "500" && attr("wEvery", "max") === "10000" && attr("wEvery", "value") === "1000" && attr("bRounds", "min") === "1" && attr("bRounds", "max") === "5" && attr("bRounds", "value") === "2" && attr("bSeconds", "min") === "1" && attr("bSeconds", "max") === "20" && attr("bSeconds", "value") === "10" && attr("sampleSecs", "min") === "0" && attr("sampleSecs", "max") === "300" && attr("sampleSecs", "value") === "0");
    const opts = [...((HTML.match(/<select id="bSizes">([\s\S]*?)<\/select>/) || [, ""])[1]).matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
    ok("!! the swarm sizes on offer are exactly the client's choices, in order, and the first (the default) is the bridge's default", eq(opts, [...C.BRAIN.sizeChoices]) && opts[0] === "4096,8192");
    ok("the caution card says the GPU-brain button starts the engine's swarm tool with --hardware and keeps the card busy", /Run the GPU brain and watch it/.test(CAUTION) && /node tools\/ship\/gpuSwarm\.mjs --hardware/.test(CAUTION) && /launches a browser/.test(CAUTION));
    ok("the steps card tells the reader about Sample now, the GPU-brain button, the snapshot time and the session's sampling box", /Sample now/.test(STEPS) && /Run the GPU brain and watch it/.test(STEPS) && /a second or more/.test(STEPS) && /also sample while it answers/.test(STEPS));
    const WATCH_CARD = ((HTML.match(/<div class="card" id="watchCard">([\s\S]*?)<\/div>\s*\n\n/) || [, ""])[1]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    ok("!! the watch card says what is read (programs under which runtime, utilization, memory), the cap of 120 snapshots, that B writes NO results file of the swarm's own, and what a software adapter means", WATCH_CARD.length > 700 && /which programs used the card, under which runtime \(Direct3D, Vulkan, CUDA\)/.test(WATCH_CARD) && /At most 120 snapshots/.test(WATCH_CARD) && /does NOT write the swarm's results file/.test(WATCH_CARD) && /software adapter/.test(WATCH_CARD) && /node tools\/ship\/gpuSwarm\.mjs --hardware/.test(WATCH_CARD), String(WATCH_CARD.length));
    ok("the session's sampling box is labelled with the words the steps card uses for it, and the label points at the box", /<label class="note" for="sampleSecs">also sample while it answers, for \(seconds, 0 = just the one snapshot\)<\/label>/.test(HTML));
    ok("the watch has its own progress and summary boxes, and the two watch buttons exist and are on", ["wProgress", "wSummary", "wSampleBtn", "wBrainBtn"].every((i) => ids.has(i)) && !/<button[^>]*id="wSampleBtn"[^>]*disabled/.test(HTML) && !/<button[^>]*id="wBrainBtn"[^>]*disabled/.test(HTML));
}

// ---- 7. the page: its script, run -------------------------------------------------------------------------------------------------------------------
console.log("\n7. THE PAGE SCRIPT, RUN AGAINST A FAKE DOM AND A STUB BRIDGE");
{
    const body = script.replace(/import \* as C from "[^"]+";/, "");
    const stub = (id) => Object.defineProperty({ id, className: "", value: "", disabled: new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*\\bdisabled\\b`).test(HTML), checked: false, onclick: null, href: "", download: "", children: [], append(...c) { this.children.push(...c); }, select() { this.selected = true; }, click() { this.clicked = true; }, remove() { this.removed = true; } }, "textContent", { get() { return this._t === undefined ? "" : this._t; }, set(v) { this._t = v; if (v === "") this.children = []; }, enumerable: true });
    const world = (over = {}) => {
        const els = {}; for (const i of ids) els[i] = stub(i);
        const nets = [], appended = [], clip = [];
        const doc = { getElementById: (i) => els[i] || null, createElement: (t) => { const e = stub(t); e.tag = t; return e; }, body: { append: (x) => appended.push(x) }, execCommand: () => { if (over.noExec) throw new Error("no"); return true; } };
        let jobCalls = 0;
        const job = over.jobSeq ? (u) => over.jobSeq(++jobCalls) : over.job || (() => ({ ok: true, id: "gt1", state: "done", startedAt: "x", steps: [{ at: "2026-11-08T05:12:30.000Z", step: "detect", ok: true, note: "gputaskman found" }, { at: "2026-11-08T05:12:40.000Z", step: "generate", ok: true, note: "60 tokens at 3 tokens/s" }], error: "", savedAs: "brain/rig-results/gpu-snapshots/gpusnap-20261108-051233-q-7b.json", result: { schema: 1, kind: "gputaskman-session", ok: true, error: "", request: { model: "q:7b" }, summary: { modelSizeGB: 15.83, inVramGB: 6.52, onGpuPct: 41.2, tokensPerSecond: 3, loadSeconds: 12.5, gputaskmanInstalled: true }, snapshots: { baseline: { ok: true }, loaded: { ok: true }, busy: { ok: true } } } }));
        const fetchF = async (u, o = {}) => {
            const url = String(u), b = o.body ? JSON.parse(o.body) : null; nets.push({ url, method: o.method, body: b });
            let j;
            if (over.down) throw new Error("ECONNREFUSED");
            if (url === "/gputaskman/status") j = over.status || STATUS();
            else if (url === "/gputaskman/install") j = { ok: true, method: b.method, command: b.method + " tool install gputaskman", stdout: "installed", stderr: "", installed: true, hint: "" };
            else if (url === "/gputaskman/session") j = over.sessionRefused ? { ok: false, error: "a session is already running" } : { ok: true, id: "gt1" };
            else if (url === "/gputaskman/watch") j = over.watchRefused ? { ok: false, error: "a session is already running" } : { ok: true, id: "gw1" };
            else if (url.startsWith("/gputaskman/job")) j = job(url);
            else if (url === "/gputaskman/snapshot") j = over.snapFails ? { ok: false, error: "gputaskman is not installed" } : { ok: true, at: "2026-11-08T05:00:00.000Z", command: "gputaskman --once --json", json: { gpus: [{ name: "GTX 1080" }] }, error: "" };
            else j = { ok: false, error: "404" };
            return { ok: true, status: 200, json: async () => j, text: async () => "" };
        };
        const nav = { clipboard: { writeText: async (t) => { if (over.clipFails) throw new Error("denied"); clip.push(t); } } };
        const URLx = { createObjectURL: (b) => "blob:fake" };
        const blobs = [], BlobX = class { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; blobs.push(this); } };
        return { els, nets, appended, clip, blobs, run: () => new Function("C", "document", "fetch", "navigator", "URL", "Blob", body)(C, doc, fetchF, nav, URLx, BlobX) };
    };
    const settle = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

    const w = world(); w.run(); await settle();
    ok("on load it asks the bridge for the status and prints it", w.nets[0].url === "/gputaskman/status" && w.nets[0].method === "GET" && /machine: win32/.test(w.els.status.textContent) && /Ollama: up/.test(w.els.status.textContent));
    ok("the uv button turns on (uv was found) and the pipx button stays off", w.els.uvBtn.disabled === false && w.els.pipxBtn.disabled === true);
    ok("the model list is filled from the pulled models", w.els.models.children.length === 2 && w.els.models.children[0].value === "llama3.1:8b" && w.els.models.children[1].value === "qwen2.5-coder:7b");
    ok("the install note tells the reader what to press", /Install with uv/.test(w.els.installNote.textContent));
    ok("before anything runs the copy and download buttons are off (from the markup)", w.els.copyBtn.disabled === true && w.els.saveBtn.disabled === true);

    await w.els.uvBtn.onclick(); await settle();
    const inst = w.nets.find((n) => n.url === "/gputaskman/install");
    ok("pressing Install with uv POSTs the method uv, and only that", inst && inst.method === "POST" && eq(inst.body, { method: "uv" }));
    ok("the status was asked for again, and the model list was CLEARED before refilling (still two options, not four)", w.els.models.children.length === 2);
    ok("the result is shown with the command, 'finished' and 'the engine can find gputaskman now', then the status is asked for again", /\$ uv tool install gputaskman/.test(w.els.installOut.textContent) && /finished/.test(w.els.installOut.textContent) && /can find gputaskman now/.test(w.els.installOut.textContent) && w.nets.filter((n) => n.url === "/gputaskman/status").length === 2 && w.els.installOut.className === "ok");

    w.els.model.value = ""; await w.els.runBtn.onclick();
    ok("!! Start with no model: a message, and NO session is requested", /ollama list/.test(w.els.progress.textContent) && w.els.progress.className === "bad" && !w.nets.some((n) => n.url === "/gputaskman/session"));
    w.els.model.value = "q:7b"; w.els.numPredict.value = "128"; w.els.unload.checked = true; await w.els.runBtn.onclick(); await settle();
    const ses = w.nets.find((n) => n.url === "/gputaskman/session");
    ok("Start POSTs the model, the token count and the unload choice, nothing else", ses && ses.method === "POST" && eq(ses.body, { model: "q:7b", numPredict: 128, unloadWhenDone: true }));
    ok("it polls the job route with the id the bridge gave", w.nets.some((n) => n.url === "/gputaskman/job?id=gt1"));
    ok("the progress box shows the steps with times", /05:12:30  detect: gputaskman found/.test(w.els.progress.textContent) && /05:12:40  generate: 60 tokens at 3 tokens\/s/.test(w.els.progress.textContent) && w.els.progress.className === "ok");
    const shown = (() => { try { return JSON.parse(w.els.json.value); } catch (e) { return null; } })();
    ok("the JSON box holds the session's result, pretty-printed", shown && shown.kind === "gputaskman-session" && shown.request.model === "q:7b" && /^\{\n  "schema": 1/.test(w.els.json.value));
    ok("the summary box says the size, the part on the GPU, the speed", /15\.83 GB in memory; on the GPU: 6\.52 GB \(41\.2%\)/.test(w.els.summary.textContent) && /3 tokens\/s/.test(w.els.summary.textContent) && w.els.summary.className === "ok");
    ok("it says where the file was saved, and the copy and download buttons turn on, and Start is back on", /saved in the engine folder as brain\/rig-results\/gpu-snapshots\/gpusnap-20261108-051233-q-7b\.json/.test(w.els.savedAs.textContent) && w.els.copyBtn.disabled === false && w.els.saveBtn.disabled === false && w.els.runBtn.disabled === false);

    await w.els.copyBtn.onclick();
    ok("Copy puts exactly the JSON box's text on the clipboard and says how many characters", w.clip.length === 1 && w.clip[0] === w.els.json.value && new RegExp(`copied ${w.els.json.value.length} characters`).test(w.els.savedAs.textContent));
    w.els.saveBtn.onclick();
    const a = w.appended[0];
    ok("the downloaded blob is the JSON box's text, typed application/json", w.blobs.length === 1 && w.blobs[0].parts[0] === w.els.json.value && w.blobs[0].type === "application/json");
    ok("Download makes a link to a blob named like the saved file, clicks it and removes it", a && a.download === "gpusnap-20261108-051233-q-7b.json" && a.href === "blob:fake" && a.clicked === true && a.removed === true);

    const wn = world({ status: STATUS({ installers: { uv: { found: false }, pipx: { found: false } } }) }); wn.run(); await settle();
    ok("with neither installer found the install note says where to get one, and both install buttons stay off", /docs\.astral\.sh\/uv/.test(wn.els.installNote.textContent) && wn.els.uvBtn.disabled === true && wn.els.pipxBtn.disabled === true);

    const doneJob = () => ({ ok: true, id: "gt1", state: "done", steps: [{ at: "2026-11-08T05:12:30.000Z", step: "detect", ok: true, note: "x" }], error: "", savedAs: "brain/rig-results/gpu-snapshots/gpusnap-a.json", result: { ok: true, error: "", request: { model: "q:7b" }, summary: null, snapshots: {} } });
    const wh = world({ jobSeq: (n) => (n === 1 ? { ok: true, id: "gt1", state: "running", steps: [] } : doneJob()) }); wh.run(); await settle();
    wh.els.model.value = "q:7b"; const p1 = wh.els.runBtn.onclick(); await settle();
    ok("while a session runs: Start is off and the progress box says 'starting...' until the first step arrives", wh.els.runBtn.disabled === true && wh.els.progress.textContent === "starting...");
    await wh.els.runBtn.onclick();
    ok("!! a second press while a session runs starts nothing", wh.nets.filter((n) => n.url === "/gputaskman/session").length === 1);
    await p1;
    ok("when the session ends Start is on again and the JSON is shown", wh.els.runBtn.disabled === false && JSON.parse(wh.els.json.value).ok === true);
    const wr = world({ sessionRefused: true }); wr.run(); await settle(); wr.els.model.value = "q:7b";
    await wr.els.runBtn.onclick(); await wr.els.runBtn.onclick();
    ok("!! after the bridge REFUSES a session a second press tries again (the running flag was reset)", wr.nets.filter((n) => n.url === "/gputaskman/session").length === 2);

    const w2 = world({ clipFails: true }); w2.run(); await settle(); w2.els.json.value = "{}"; await w2.els.copyBtn.onclick();
    ok("a clipboard that refuses falls back to selecting the text and the old copy command", w2.els.json.selected === true && /copied 2 characters/.test(w2.els.savedAs.textContent));
    const w2b = world({ clipFails: true, noExec: true }); w2b.run(); await settle(); w2b.els.json.value = "{}"; await w2b.els.copyBtn.onclick();
    ok("and if that fails too it tells the reader to copy by hand", /copy it by hand/.test(w2b.els.savedAs.textContent));

    const w3 = world(); w3.run(); await settle(); await w3.els.snapBtn.onclick(); await settle();
    const sn = w3.nets.find((n) => n.url === "/gputaskman/snapshot"), j3 = JSON.parse(w3.els.json.value);
    ok("Snapshot only POSTs to the snapshot route and shows it as a gputaskman-snapshot with its own JSON, not saved on the machine", sn && sn.method === "POST" && j3.kind === "gputaskman-snapshot" && j3.json.gpus[0].name === "GTX 1080" && /not saved on the machine/.test(w3.els.savedAs.textContent) && w3.els.snapBtn.disabled === false);
    const w4 = world({ snapFails: true }); w4.run(); await settle(); await w4.els.snapBtn.onclick(); await settle();
    ok("a snapshot that fails shows why", /did not give a snapshot: gputaskman is not installed/.test(w4.els.savedAs.textContent));

    const w5 = world({ down: true }); w5.run(); await settle();
    ok("with the bridge down the status box says so and the install buttons stay off", /did not answer/.test(w5.els.status.textContent) && w5.els.status.className === "bad" && w5.els.uvBtn.disabled === true);
    const w6 = world({ sessionRefused: true }); w6.run(); await settle(); w6.els.model.value = "q:7b"; await w6.els.runBtn.onclick(); await settle();
    ok("a session the bridge refuses shows its reason and turns Start back on", /already running/.test(w6.els.progress.textContent) && w6.els.runBtn.disabled === false);
    const w7 = world({ job: () => ({ ok: true, id: "gt1", state: "error", steps: [{ at: "2026-11-08T05:12:30.000Z", step: "load", ok: false, note: "not found" }], error: "Ollama could not load q:7b: not found (Ollama does not have that model: pull it first with  ollama pull q:7b)", savedAs: "brain/rig-results/gpu-snapshots/gpusnap-x.json", result: { ok: false, error: "Ollama could not load q:7b", request: { model: "q:7b" }, summary: null, snapshots: { baseline: { ok: true } } } }) });
    w7.run(); await settle(); w7.els.model.value = "q:7b"; await w7.els.runBtn.onclick(); await settle();
    ok("a session that ends in error shows the failed step, the reason, and STILL fills the JSON box (the baseline is worth sending)", /!! load: not found/.test(w7.els.progress.textContent) && /ollama pull q:7b/.test(w7.els.progress.textContent) && w7.els.progress.className === "bad" && JSON.parse(w7.els.json.value).ok === false && w7.els.summary.className === "warn");

    // ---- the watch, run (2026-11-08) ----
    const watchJob = (mode, okk = true, state = "done") => ({ ok: true, id: "gw1", kind: "watch", state, startedAt: "x", steps: [{ at: "2026-11-08T05:12:30.000Z", step: "detect", ok: true, note: "gputaskman found" }, { at: "2026-11-08T05:13:10.000Z", step: "swarm", ok: okk, note: "finished in 41.2 s; hardware adapter: nvidia pascal" }], error: okk ? "" : "the swarm ran on a SOFTWARE adapter", savedAs: `brain/rig-results/gpu-snapshots/gpuwatch-20261108-051233-${mode}.json`, result: { schema: 1, kind: "gputaskman-watch", mode, startedAt: "2026-11-08T05:12:33.000Z", ok: okk, error: okk ? "" : "the swarm ran on a SOFTWARE adapter", summary: SUM, brain: mode === "brain" ? { ok: true, durationMs: 41234, adapterLine: "hardware adapter: nvidia pascal GTX 1080", software: !okk } : null } });
    const watchWorld = (over = {}) => { const ww = world({ ...over, job: over.job || (() => watchJob(over.mode || "sample", over.okk !== false, over.state || "done")) }); return ww; };
    const setW = (ww, v = {}) => { ww.els.wSeconds.value = v.seconds === undefined ? "30" : v.seconds; ww.els.wEvery.value = v.every === undefined ? "1500" : v.every; ww.els.bSizes.value = v.sizes === undefined ? "8192" : v.sizes; ww.els.bRounds.value = v.rounds === undefined ? "1" : v.rounds; ww.els.bSeconds.value = v.bs === undefined ? "3" : v.bs; };
    const ws = watchWorld(); ws.run(); await settle(); setW(ws); await ws.els.wSampleBtn.onclick(); await settle();
    const wpost = ws.nets.find((n) => n.url === "/gputaskman/watch");
    ok("!! Sample now POSTs to the watch route the mode sample, the seconds and the wait as numbers, and nothing else", wpost && wpost.method === "POST" && eq(wpost.body, { mode: "sample", seconds: 30, intervalMs: 1500 }));
    ok("it polls the job route with the id the bridge gave, and shows the steps in the watch's progress box (not the session's)", ws.nets.some((n) => n.url === "/gputaskman/job?id=gw1") && /05:12:30  detect: gputaskman found/.test(ws.els.wProgress.textContent) && /05:13:10  swarm: finished in 41\.2 s/.test(ws.els.wProgress.textContent) && ws.els.wProgress.className === "ok" && ws.els.progress.textContent === "");
    ok("the watch's words go in its summary box (ok class), and the JSON box holds the watch result with kind gputaskman-watch", /^The watch ran\./.test(ws.els.wSummary.textContent) && /chrome\.exe: Direct3D/.test(ws.els.wSummary.textContent) && ws.els.wSummary.className === "ok" && JSON.parse(ws.els.json.value).kind === "gputaskman-watch");
    ok("it says where the file was saved, the copy and download buttons are on, and ALL THREE run buttons are back on", /saved in the engine folder as brain\/rig-results\/gpu-snapshots\/gpuwatch-20261108-051233-sample\.json/.test(ws.els.savedAs.textContent) && ws.els.copyBtn.disabled === false && ws.els.saveBtn.disabled === false && ws.els.runBtn.disabled === false && ws.els.wSampleBtn.disabled === false && ws.els.wBrainBtn.disabled === false);
    ws.els.saveBtn.onclick();
    ok("Download names the file like the saved watch file", ws.appended[0].download === "gpuwatch-20261108-051233-sample.json");
    const wb2 = watchWorld({ mode: "brain" }); wb2.run(); await settle(); setW(wb2, { every: "1000" }); await wb2.els.wBrainBtn.onclick(); await settle();
    ok("!! Run the GPU brain and watch it POSTs the mode brain, the wait, the sizes as a list, the rounds and the seconds, and not the sample seconds", eq(wb2.nets.find((n) => n.url === "/gputaskman/watch").body, { mode: "brain", intervalMs: 1000, sizes: [8192], rounds: 1, swarmSeconds: 3 }) && /The GPU brain ran and was watched\./.test(wb2.els.wSummary.textContent) && /under Direct3D while it ran: chrome\.exe/.test(wb2.els.wSummary.textContent));
    const wi = watchWorld(); wi.run(); await settle(); setW(wi, { seconds: "2" }); await wi.els.wSampleBtn.onclick();
    ok("!! a bad number: a message with the range in the watch's progress box, class bad, and NO watch is requested; the buttons stay on", /seconds must be a whole number from 3 to 300/.test(wi.els.wProgress.textContent) && wi.els.wProgress.className === "bad" && !wi.nets.some((n) => n.url === "/gputaskman/watch") && wi.els.wSampleBtn.disabled === false && wi.els.runBtn.disabled === false);
    const wh2 = watchWorld({ jobSeq: (n) => (n === 1 ? { ok: true, id: "gw1", state: "running", steps: [] } : watchJob("sample")) }); wh2.run(); await settle(); setW(wh2);
    const pw = wh2.els.wSampleBtn.onclick(); await settle();
    ok("while a watch runs: ALL THREE run buttons are off and the progress box says 'starting...' until the first step arrives", wh2.els.runBtn.disabled === true && wh2.els.wSampleBtn.disabled === true && wh2.els.wBrainBtn.disabled === true && wh2.els.wProgress.textContent === "starting...");
    wh2.els.model.value = "q:7b"; await wh2.els.wSampleBtn.onclick(); await wh2.els.wBrainBtn.onclick(); await wh2.els.runBtn.onclick();
    ok("!! a second press of either watch button, or of Start, while a watch runs starts nothing", wh2.nets.filter((n) => n.url === "/gputaskman/watch").length === 1 && !wh2.nets.some((n) => n.url === "/gputaskman/session"));
    await pw;
    ok("when the watch ends all three buttons are on again and the watch's JSON is shown", wh2.els.runBtn.disabled === false && wh2.els.wSampleBtn.disabled === false && wh2.els.wBrainBtn.disabled === false && JSON.parse(wh2.els.json.value).kind === "gputaskman-watch");
    const wh3 = world({ jobSeq: (n) => (n === 1 ? { ok: true, id: "gt1", state: "running", steps: [] } : doneJob()) }); wh3.run(); await settle(); wh3.els.model.value = "q:7b"; setW(wh3);
    const ps2 = wh3.els.runBtn.onclick(); await settle();
    ok("while a SESSION runs the watch buttons are off too, and pressing them starts nothing", wh3.els.wSampleBtn.disabled === true && wh3.els.wBrainBtn.disabled === true && (await wh3.els.wSampleBtn.onclick(), await wh3.els.wBrainBtn.onclick(), !wh3.nets.some((n) => n.url === "/gputaskman/watch")));
    await ps2;
    ok("when the session ends the watch buttons are on again", wh3.els.wSampleBtn.disabled === false && wh3.els.wBrainBtn.disabled === false);
    const wr2 = watchWorld({ watchRefused: true }); wr2.run(); await settle(); setW(wr2); await wr2.els.wSampleBtn.onclick(); await wr2.els.wSampleBtn.onclick();
    ok("!! a watch the bridge REFUSES shows its reason, turns every button back on, and a second press tries again (the flag was reset)", /already running/.test(wr2.els.wProgress.textContent) && wr2.els.wProgress.className === "bad" && wr2.els.runBtn.disabled === false && wr2.els.wSampleBtn.disabled === false && wr2.nets.filter((n) => n.url === "/gputaskman/watch").length === 2);
    const wd2 = watchWorld({ down: true }); wd2.run(); await settle(); setW(wd2); await wd2.els.wBrainBtn.onclick();
    ok("with the bridge down a watch says so and unlocks", /did not answer|ECONNREFUSED/.test(wd2.els.wProgress.textContent) && wd2.els.wBrainBtn.disabled === false);
    const wf2 = watchWorld({ mode: "brain", okk: false, state: "error" }); wf2.run(); await settle(); setW(wf2); await wf2.els.wBrainBtn.onclick(); await settle();
    ok("!! a watch that ended in error (a software adapter): the failed step and the reason, class bad, the summary says THE BROWSER USED A SOFTWARE ADAPTER (class warn), and the JSON is STILL filled", /!! swarm: finished/.test(wf2.els.wProgress.textContent) && /SOFTWARE adapter/.test(wf2.els.wProgress.textContent) && wf2.els.wProgress.className === "bad" && /THE BROWSER USED A SOFTWARE ADAPTER/.test(wf2.els.wSummary.textContent) && wf2.els.wSummary.className === "warn" && JSON.parse(wf2.els.json.value).ok === false);
    const sq = world(); sq.run(); await settle(); sq.els.model.value = "q:7b"; sq.els.sampleSecs.value = "45"; await sq.els.runBtn.onclick(); await settle();
    ok("!! the session's sampling box: 45 seconds is sent as sampleSeconds beside the usual fields", eq(sq.nets.find((n) => n.url === "/gputaskman/session").body, { model: "q:7b", numPredict: 200, unloadWhenDone: false, sampleSeconds: 45 }));
    const sz = world(); sz.run(); await settle(); sz.els.model.value = "q:7b"; sz.els.sampleSecs.value = "2"; await sz.els.runBtn.onclick();
    ok("!! a sampling time that is out of range: a message, class bad, NO session requested, Start still on", /0 \(off\) or a whole number from 3 to 300/.test(sz.els.progress.textContent) && sz.els.progress.className === "bad" && !sz.nets.some((n) => n.url === "/gputaskman/session") && sz.els.runBtn.disabled === false);
    const wnb = watchWorld(); wnb.run(); await settle(); setW(wnb); wnb.els.wSampleBtn.onclick(); await settle();
    const wrep = watchWorld(); wrep.run(); await settle(); setW(wrep); await wrep.els.wSampleBtn.onclick(); await settle(); await wrep.els.wBrainBtn.onclick(); await settle();
    ok("!! after a watch FINISHES the flag is reset: a second press (the other button) starts another watch, and the buttons are on", wrep.nets.filter((n) => n.url === "/gputaskman/watch").length === 2 && wrep.els.wSampleBtn.disabled === false);
    const srep = world(); srep.run(); await settle(); srep.els.model.value = "q:7b"; await srep.els.runBtn.onclick(); await settle(); await srep.els.runBtn.onclick(); await settle();
    ok("!! after a session FINISHES the flag is reset: a second press starts another session", srep.nets.filter((n) => n.url === "/gputaskman/session").length === 2);
    const wnow = watchWorld(); wnow.run(); await settle(); setW(wnow); const pnow = wnow.els.wSampleBtn.onclick(); const immediate = wnow.els.wProgress.textContent; await pnow;
    ok("!! the instant a watch is pressed its progress box says 'starting...' (before the bridge has answered)", immediate === "starting...");
    ok("the brain button reads 'Run the GPU brain and watch it' and the sample button 'Sample now'", /<button id="wBrainBtn" class="go">Run the GPU brain and watch it<\/button>/.test(HTML) && /<button id="wSampleBtn" class="go">Sample now<\/button>/.test(HTML));
    ok("a watch does not touch the session's boxes (they stay as they were)", wnb.els.progress.textContent === "" && wnb.els.summary.textContent === "");
}

clearTimeout(WATCHDOG);
console.log(fails ? `\ngpuTaskManClient-selfcheck: ${fails} FAILED` : "\ngpuTaskManClient-selfcheck: all checks pass");
if (fails) process.exit(1);
