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
// ---------------------------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "../../ui/gpuTaskManClient.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
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
    ok("the page says what it does NOT do (not run against a real gputaskman, Ollama or GPU) and that the bridge has no origin check", /has not run\s+against a real gputaskman/.test(HTML) && /no origin check/.test(HTML));
    ok("the caution card names the unsupported (Intel) and the supported platforms", /Intel GPUs are not supported/.test(CAUTION) && /Windows 10\/11/.test(CAUTION));
    ok("the page's tokens field carries the client's limits", /min="16"/.test(HTML) && /max="1024"/.test(HTML) && /value="200"/.test(HTML));
    ok("the client file contains nothing but the pure logic (no document, window or fetch call of its own)", !/\bdocument\./.test(CLIENT_SRC) && !/\bwindow\./.test(CLIENT_SRC) && !/[^.\w]fetch\(/.test(CLIENT_SRC));
    const RIG_MD = fs.readFileSync(path.join(ENG, "brain", "RIG_COMMANDS_2026-11-07.md"), "utf8"), WIP_MD = fs.readFileSync(path.join(ENG, "brain", "GPUTASKMAN_WIP.md"), "utf8");
    ok("!! THE INSTRUCTIONS ARE ON THE PAGE: the steps card gives the bridge's port and address, Check, both installers, the NEW-terminal advice, ollama pull / list / serve, where the file is saved and what to send", STEPS.length > 900 && /port 8787/.test(STEPS) && /localhost:8787\/gputaskman\.html/.test(STEPS) && /Check this machine/.test(STEPS) && /Install with uv/.test(STEPS) && /NEW terminal/.test(STEPS) && /ollama pull qwen2\.5-coder:7b/.test(STEPS) && /ollama list/.test(STEPS) && /ollama serve/.test(STEPS) && /brain\/rig-results\/gpu-snapshots\//.test(STEPS) && /send that file/.test(STEPS), String(STEPS.length));
    ok("the steps card says what the numbers mean and the known limits (not run on real hardware, undocumented JSON, Windows untested, no Ollama start or download, thinking models)", /How to use this|On the GPU/.test(STEPS + "On the GPU") && /Ollama's own count/.test(STEPS) && /has not been run against a real gputaskman, Ollama or GPU/.test(STEPS) && /does not describe its JSON/.test(STEPS) && /Windows is untested/.test(STEPS) && /does not start Ollama and does not download models/.test(STEPS) && /thinks before it answers/.test(STEPS));
    const REG = JSON.parse(fs.readFileSync(path.join(ENG, "page-notes.json"), "utf8"));
    ok("!! THE NOTES ARE LINKED THROUGH THE SHARED ROW: the page has the inline host and the one-line loader, and the registry lists its notes (the rule itself is held by tools/ship/pageNotes-selfcheck.mjs)", (VISIBLE.match(/<div id="swek-notes"><\/div>/g) || []).length === 1 && (HTML.match(/<script type="module" src="\/ui\/pageNotesMount\.mjs"><\/script>/g) || []).length === 1 && Array.isArray(REG.pages["gputaskman.html"]) && REG.pages["gputaskman.html"].some((n) => n.path === "brain/GPUTASKMAN_WIP.md") && REG.pages["gputaskman.html"].some((n) => n.path === "brain/RIG_COMMANDS_2026-11-07.md"));
    ok("the page keeps no notes viewer of its own (it moved to ui/pageNotes.mjs)", !/id="notes"/.test(VISIBLE) && !/loadNotes|notesLoaded/.test(script));
    ok("the page and the two notes give the same first model to pull and the same page address", /ollama pull qwen2\.5-coder:7b/.test(RIG_MD) && /ollama pull qwen2\.5-coder:7b/.test(STEPS) && /localhost:8787\/gputaskman\.html/.test(WIP_MD) && /localhost:8787\/gputaskman\.html/.test(STEPS));
    ok("server.html links the page", /href="\/gputaskman\.html"/.test(SERVER_HTML));
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
}

clearTimeout(WATCHDOG);
console.log(fails ? `\ngpuTaskManClient-selfcheck: ${fails} FAILED` : "\ngpuTaskManClient-selfcheck: all checks pass");
if (fails) process.exit(1);
