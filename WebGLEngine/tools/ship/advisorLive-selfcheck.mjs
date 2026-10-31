// WebGLEngine/tools/ship/advisorLive-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/advisorLive-selfcheck.mjs      (~9 s measured here, one core)
//
// THE GATE OF tools/ship/advisorLive.mjs (and its command): the live adapter of the language-model chip. No real model is called: the command path is driven against tiny node scripts that read the prompt on stdin, and the API path against a MOCK SERVER in a separate process
// (the seat is synchronous, so a server in this process could not answer while it waits), so every branch has a worked answer and the key never leaves this box.
//   1  THE WORDS      a command line split into words with no shell: spaces, both quotes, a backslash; an unclosed quote refused; nothing expanded.
//   2  THE COMMAND    the prompt goes in on stdin and the reply comes out on stdout, no shell (a prompt full of $(...) and quotes arrives untouched); a failed run, a timeout, a missing command and an empty answer THROW with scrubbed text.
//   3  THE API        the request (url, version header, model, max tokens, temperature 0, one user message, NO key in it), the reply text, an error body refused; the real child process against the mock: the key travels in the environment and the x-api-key header only, an http error throws, a missing key is refused before any call.
//   4  THE GUARDS     no seed of any registered audit or of the reserved language-model block; the expected number of calls; the ceiling checked before each call; a repeated prompt is free; every paid answer is appended at once.
//   5  THE RUN        (real flights, scripted model) record writes a transcript and a calls log; the same command again pays nothing (resume); replay reproduces the scores with zero calls; a transcript is not overwritten; a ceiling stops a run with the saved answers named; --dry-run calls nothing.
//   5b THE EDGES      scrubbing, defaults, the dry-run warning, a bad calls log, the mode and the crushed flags carried into the rows, the mean line.
//   6  THE SOURCE     no shell is enabled, no exec, the key is read from the environment only and written nowhere.
// NOT CHECKED, said plainly: any real model or the real API (no key, no network here); the quality of any advice.
//
// 2026-10-29 cleanTerminal (ollama word-wrap redraw broke 46 of 169 replies in the first practice run): 13 mutants, every one red by name after one row was added (text between a cursor-back and an erase cancels it); identity reads 0.
// SABOTAGE LOG: 88 mutants of advisorLive.mjs, each run against a copy of this gate, 4 at a time (splitter quotes/backslash/whitespace/unclosed, scrub value/shape/short key, command stdin/shell/error/status/empty/timeout/stderr scrub, request
// slash/temperature/model/messages/key-in-headers, reply blocks/error/blank, child key source/exit codes/status/header, api key check/shell/status/error/scrub/key-in-input, forbidden audits/reserved block/range end/refusal/kind/cross product, call ceiling,
// seed ranges, budget cache/off-by-one/none/hits/memory/onNew/count/string/default, record vs replay mode, mode pass-through, stats, crushed flags, mean line, caveat, every argument check, dry-run, overwrite, resume, calls log, transcript write, partial-run hint,
// exit codes, --api-base, --params temperature, error scrub). First pass: 22 read 0 red (api stderr scrub, api error, non-string reply, default budget, child key from body, child no-key exit, default every, number check, missing value, text-only blocks, kind check, bad json
// line, api base, key leak in an error, ceiling warning, params temperature, short key, mode pass-through, stats, crushed flags, mean line, key in headers) -- each one a row the gate lacked, now section 3's two command rows and section 5b. Second pass: all 88 red by name.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn as spawnAsync, spawnSync } from "node:child_process";
import * as T from "../../brain/needsTask.mjs";
import * as A from "../../brain/advisorChip.mjs";
import * as X from "../../brain/advisorTranscript.mjs";
import * as L from "./advisorLive.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = JSON.stringify, NODE = process.execPath.replace(/\\/g, "/");   // v4906: forward slashes -- splitCommand reads a backslash as an escape, so a Windows path in a command string lost its separators (ENOENT on the rig)
const pa2 = (a) => throws(() => L.parseArgs(a));
console.log("advisorLive-selfcheck -- the live adapter of the language-model chip\n");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "advlive-"));
const write = (name, text) => { const f = path.join(tmp, name); fs.writeFileSync(f, text); return f.replace(/\\/g, "/"); };
// a scripted "model" as a command: reads the prompt on stdin, answers a json decision that surfaces when the prompt says the depth is over 15 m
const modelScript = write("model.mjs", `let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const m=/ depth ([\\d.]+) m\\. charge/.exec(s);const d=m?Number(m[1]):0;process.stdout.write(JSON.stringify({surface:d>15,station:0,cap:0.85,pump:false,repair:false}))});`);
const echoScript = write("echo.mjs", `let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write("GOT:"+s))`);
const failScript = write("fail.mjs", `process.stderr.write("boom with key "+(process.env.ANTHROPIC_API_KEY||"")); process.exit(7)`);
const slowScript = write("slow.mjs", `setTimeout(()=>process.stdout.write("late"), 5000)`);
const emptyScript = write("empty.mjs", `process.stdout.write("   ")`);

sec("1. THE WORDS");
{
    ok("!! a command line is split into words by spaces, single and double quotes (a quoted space stays), and a backslash; an empty quoted word is a word", J(L.splitCommand("claude -p --model m")) === J(["claude", "-p", "--model", "m"]) && J(L.splitCommand(`a "b c" 'd e' f\\ g ""`)) === J(["a", "b c", "d e", "f g", ""]) && J(L.splitCommand("  x   y  ")) === J(["x", "y"]) && J(L.splitCommand(`say "a \\"q\\" b"`)) === J(["say", `a "q" b`]));
    ok("!! nothing is expanded or interpreted: $HOME, backticks, pipes, redirects and semicolons stay as text in their word; an unclosed quote is refused; an empty line is no words", J(L.splitCommand("echo $HOME `id` a|b >f; x")) === J(["echo", "$HOME", "`id`", "a|b", ">f;", "x"]) && /unclosed quote/.test(throws(() => L.splitCommand('a "b')) || "") && L.splitCommand("   ").length === 0);
}

sec("2. THE COMMAND (a real subprocess, no shell)");
{
    const nasty = "line one $(echo PWNED) `id` \"quoted\" 'single' ; rm -rf / | cat > /tmp/x\nline two";
    const echo = L.modelFnFromCommand({ command: `"${NODE}" ${echoScript}` });
    ok("!! the prompt goes in on stdin and the reply is stdout, byte for byte, even when the prompt is full of shell syntax (nothing ran, nothing was expanded)", echo(nasty) === "GOT:" + nasty && !/PWNED/.test(echo("x $(echo PWNED)").replace("GOT:x $(echo PWNED)", "")));
    const failing = L.modelFnFromCommand({ command: `"${NODE}" ${failScript}`, env: { ...process.env, ANTHROPIC_API_KEY: "sk-secretvalue12345" } });
    const e1 = throws(() => failing("p"));
    ok("!! a command that exits non-zero THROWS with its exit code and its stderr, and the key's value in that stderr is scrubbed", /exited 7/.test(e1 || "") && /boom with key \[key\]/.test(e1 || "") && !/secretvalue/.test(e1 || ""));
    ok("!! a command that is not there throws (not an empty answer); one that answers only spaces throws; a command that outlives its timeout throws", /failed to run/.test(throws(() => L.modelFnFromCommand({ command: "no-such-command-xyz" })("p")) || "") && /answered nothing/.test(throws(() => L.modelFnFromCommand({ command: `"${NODE}" ${emptyScript}` })("p")) || "") && /failed to run \(ETIMEDOUT\)/.test(throws(() => L.modelFnFromCommand({ command: `"${NODE}" ${slowScript}`, timeoutMs: 300 })("p")) || ""));
    ok("!! an empty command is refused when the function is built, and an injected spawner is what is called (the words, the input, shell false and the timeout are passed)", /empty command/.test(throws(() => L.modelFnFromCommand({ command: "  " })) || "") && (() => { let seen = null; const f = L.modelFnFromCommand({ command: "x -a 'b c'", timeoutMs: 777, spawn: (cmd, args, o) => { seen = { cmd, args, o }; return { status: 0, stdout: "ok" }; } }); const r = f("PROMPT"); return r === "ok" && seen.cmd === "x" && J(seen.args) === J(["-a", "b c"]) && seen.o.input === "PROMPT" && seen.o.shell === false && seen.o.timeout === 777; })());
    ok("  scrub removes the key's value (when set) and anything shaped like an API key", L.scrub("a sk-ant-api03-abcdefgh1234 b", {}) === "a [key] b" && L.scrub("my KEYVALUE99 here", { ANTHROPIC_API_KEY: "KEYVALUE99" }) === "my [key] here" && L.scrub("short", { ANTHROPIC_API_KEY: "abc" }) === "short");
}

sec("3. THE API (the request, the reply, and a real child process against a mock server)");
{
    const req = L.anthropicRequest({ model: "m-1", prompt: "hello", maxTokens: 123 });
    ok("!! the request: the Messages endpoint, the version header, the model, max_tokens, temperature 0 and ONE user message with the prompt; the headers hold NO key", req.url === "https://api.anthropic.com/v1/messages" && req.headers["anthropic-version"] === "2023-06-01" && req.headers["content-type"] === "application/json" && !J(req.headers).toLowerCase().includes("key") && J(req.body) === J({ model: "m-1", max_tokens: 123, temperature: 0, messages: [{ role: "user", content: "hello" }] }) && L.anthropicRequest({ model: "m", prompt: "p", baseUrl: "http://127.0.0.1:9//" }).url === "http://127.0.0.1:9/v1/messages" && /model id/.test(throws(() => L.anthropicRequest({ prompt: "p" })) || ""));
    ok("!! the reply text is every text block joined (other block types ignored); an error body, an empty reply and a body with no content are refused", L.extractReplyText({ content: [{ type: "text", text: "ab" }, { type: "tool_use" }, { type: "text", text: "cd" }] }) === "abcd" && L.extractReplyText('{"content":[{"type":"text","text":"x"}]}') === "x" && /overloaded_error: busy/.test(throws(() => L.extractReplyText({ type: "error", error: { type: "overloaded_error", message: "busy" } })) || "") && /no text/.test(throws(() => L.extractReplyText({ content: [] })) || "") && /no text/.test(throws(() => L.extractReplyText({ content: [{ type: "text", text: " " }] })) || "") && /no text/.test(throws(() => L.extractReplyText({})) || ""));
    ok("!! a missing key is refused when the function is built, before any call, naming the variable", /ANTHROPIC_API_KEY is not set/.test(throws(() => L.modelFnFromApi({ model: "m", env: {} })) || ""));
    // the mock server: a separate process; it records the last request to a file and answers a Messages-shaped body (or an error status asked for in the prompt)
    const recFile = path.join(tmp, "last-request.json");
    const mock = write("mock.mjs", `import http from "node:http"; import fs from "node:fs";
http.createServer((q,r)=>{let b="";q.on("data",d=>b+=d);q.on("end",()=>{fs.writeFileSync(${J(recFile)},JSON.stringify({method:q.method,url:q.url,headers:q.headers,body:b}));const j=JSON.parse(b),p=j.messages[0].content;if(/FAIL500/.test(p)){r.writeHead(500);r.end("server broke");return}r.writeHead(200,{"content-type":"application/json"});r.end(JSON.stringify({content:[{type:"text",text:'reply to: '+p.slice(0,20)}]}))})}).listen(0,"127.0.0.1",function(){console.log("PORT "+this.address().port)});`);
    const srv = spawnAsync(NODE, [mock], { stdio: ["ignore", "pipe", "inherit"] });
    const port = await new Promise((res, rej) => { let buf = ""; srv.stdout.on("data", (d) => { buf += d; const m = /PORT (\d+)/.exec(buf); if (m) res(Number(m[1])); }); srv.on("error", rej); setTimeout(() => rej(new Error("the mock server did not start")), 8000); });
    try {
        const env = { ...process.env, ANTHROPIC_API_KEY: "sk-mockkey-abcdef123456" }, fn = L.modelFnFromApi({ model: "m-9", maxTokens: 50, baseUrl: `http://127.0.0.1:${port}`, env });
        const reply = fn("tell me about the boat"), rec = JSON.parse(fs.readFileSync(recFile, "utf8")), body = JSON.parse(rec.body);
        ok("!! the real child process calls the mock with POST /v1/messages: the key is in the x-api-key header ONLY (not in the body, not in an argument), the version header, the model, max_tokens, temperature 0 and the prompt as the one user message; the reply text comes back", reply === "reply to: tell me about the bo" && rec.method === "POST" && rec.url === "/v1/messages" && rec.headers["x-api-key"] === "sk-mockkey-abcdef123456" && rec.headers["anthropic-version"] === "2023-06-01" && body.model === "m-9" && body.max_tokens === 50 && body.temperature === 0 && body.messages.length === 1 && body.messages[0].role === "user" && body.messages[0].content === "tell me about the boat" && !rec.body.includes("sk-mockkey"));
        const e = throws(() => fn("please FAIL500"));
        ok("!! an http error throws with the status and the server's text (not an empty answer), and the key is not in the message", /exited 4/.test(e || "") && /http 500: server broke/.test(e || "") && !/sk-mockkey/.test(e || ""));
        const dead = L.modelFnFromApi({ model: "m", baseUrl: "http://127.0.0.1:1", env, timeoutMs: 5000 });
        ok("!! an unreachable server throws (the call fails loudly)", /exited 5/.test(throws(() => dead("p")) || ""));
        let spied = null; const sp = L.modelFnFromApi({ model: "m", env, spawn: (cmd, args, o) => { spied = { cmd, args, o }; return { status: 0, stdout: J({ content: [{ type: "text", text: "ok" }] }) }; } }); sp("P");
        ok("!! the key never travels in an argument: the spawned arguments are the node flag and the script only, the request goes in on stdin without the key, and the key is in the child's environment", spied.args.length === 2 && spied.args[0] === "-e" && !spied.args.join(" ").includes("mockkey") && !JSON.parse(spied.o.input).headers["x-api-key"] && !spied.o.input.includes("mockkey") && spied.o.env.ANTHROPIC_API_KEY === "sk-mockkey-abcdef123456" && spied.o.shell === false);
        { // the command's --api path against the mock: the base url, the temperature from --params, a key in the environment only
            const saved = process.env.ANTHROPIC_API_KEY; process.env.ANTHROPIC_API_KEY = "sk-mockkey-abcdef123456"; fs.rmSync(recFile, { force: true });
            const apiOut = path.join(tmp, "api.jsonl"), apiErrs = [];
            let code; try { code = await L.command(["record", "--model-id", "m-api", "--api", "--api-base", `http://127.0.0.1:${port}`, "--params", '{"temperature":0.5}', "--seeds", "501", "--kinds", "far", "--every", "18000", "--out", apiOut], { out: () => {}, err: (m) => apiErrs.push(m) }); } finally { if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved; }
            const seenReq = fs.existsSync(recFile) ? JSON.parse(JSON.parse(fs.readFileSync(recFile, "utf8")).body) : null;
            ok("!! record --api sends to the --api-base (not the real endpoint) with the temperature from --params, and finishes", code === 0 && !!seenReq && seenReq.model === "m-api" && seenReq.temperature === 0.5 && fs.existsSync(apiOut), apiErrs.join(" | ").slice(0, 200));
        }
        { // the child with no key in ITS environment (the parent's check passed): it refuses, exit 3, and never uses a key that arrives in the body
            const strip = (cmd, args, o) => { const env = { ...o.env }; delete env.ANTHROPIC_API_KEY; return spawnSync(cmd, args, { ...o, env, input: J({ ...JSON.parse(o.input), key: "sk-bodykey-xyz987654" }) }); };
            const nokey = L.modelFnFromApi({ model: "m", baseUrl: `http://127.0.0.1:${port}`, env, spawn: strip, timeoutMs: 8000 }), msg = throws(() => nokey("p"));
            ok("!! a child with no key in its own environment exits 3 saying so (it does not go on to call, and a key placed in the request body is not used)", /exited 3/.test(msg || "") && /no key in ANTHROPIC_API_KEY/.test(msg || ""));
        }
    } finally { srv.kill(); }
}

sec("3b. A TERMINAL PROGRAM'S OUTPUT AS THE SCREEN SHOWED IT (measured 2026-10-29: ollama run, 46 of 169 replies)");
{
    const ESC = "\x1b", raw1 = '{"surface": false, "station": 2, "cap": 0.38, "pump": false, "repair": fals' + ESC + "[4D" + ESC + "[K\nfalse}\n\n", raw2 = '{"cap": 0.6, "repair": false' + ESC + "[5D" + ESC + "[K\nfalse}\n";
    const c1 = L.cleanTerminal(raw1), c2 = L.cleanTerminal(raw2);
    ok("!! the word-wrap redraw (write 'fals', cursor back 4, erase to end of line, write 'false}' on the next line) reads as the JSON the screen showed: it parses, with repair false, and so does a redraw of a whole word (back 5 over 'false')", (() => { try { return JSON.parse(c1).repair === false && JSON.parse(c1).station === 2 && JSON.parse(c2).repair === false && JSON.parse(c2).cap === 0.6; } catch { return false; } })());
    ok("!! text with no escape is returned exactly as it is (the same string), including newlines and a lone brace; carriage returns are dropped", L.cleanTerminal("plain {text}\nline 2") === "plain {text}\nline 2" && L.cleanTerminal("a\r\nb") === "a\nb");
    ok("!! other escape sequences (colour, cursor show/hide, a title) are dropped and leave the text; an unfinished escape at the end does not throw", L.cleanTerminal(ESC + "[31mred" + ESC + "[0m ok") === "red ok" && L.cleanTerminal(ESC + "[?25lhi" + ESC + "[?25h") === "hi" && L.cleanTerminal("x" + ESC + "]0;title\x07y") === "xy" && L.cleanTerminal("end" + ESC) === "end" && L.cleanTerminal("end" + ESC + "[") === "end");
    ok("!! cursor-back erases only on the CURRENT line (it never eats a newline or the line above), by the count given (a bare ESC[D is 1), and only when an erase follows it directly (text or another sequence between them cancels it, an approximation of overwriting that nothing here needs); a cursor-back with no erase removes nothing", L.cleanTerminal("ab\nxyz" + ESC + "[9D" + ESC + "[Kq") === "ab\nq" && L.cleanTerminal("abc" + ESC + "[D" + ESC + "[K") === "ab" && L.cleanTerminal("abc" + ESC + "[2D" + "d") === "abcd" && L.cleanTerminal("abc" + ESC + "[2D" + ESC + "[31m" + ESC + "[Kd") === "abcd" && L.cleanTerminal("abc" + ESC + "[2D" + "d" + ESC + "[K") === "abcd");
    const viaCmd = L.modelFnFromCommand({ command: "x", spawn: () => ({ status: 0, stdout: raw1, stderr: "" }) });
    ok("!! a model command's output goes through it: the function the seat calls returns the cleaned reply", viaCmd("p") === c1 && !viaCmd("p").includes(ESC));
}

sec("4. THE GUARDS");
{
    const forbidden = [51, 62, 71, 82, 91, 102, 111, 122, 131, 142, 151, 162, 171, 182, 191, 202, 211, 222];
    ok("!! every seed of Round 3's three audits (51-62, 71-82, 91-102), Round 4's three (111-122, 131-142, 151-162) and the language-model block (171-182, 191-202, 211-222) is forbidden; the baseline seeds 501-508 and the training seeds are not", forbidden.every((s) => L.FORBIDDEN_SEEDS.has(s)) && L.FORBIDDEN_SEEDS.size === 108 && [501, 508, 1, 20, 21, 32, 170, 183, 190, 203, 210, 223].every((s) => !L.FORBIDDEN_SEEDS.has(s)) && J(L.PRACTICE_SEEDS) === J([501, 502, 503, 504, 505, 506, 507, 508]));
    ok("!! a practice dive on a forbidden seed is refused naming it; an unknown kind is refused; the dives are kinds x seeds in that order", /seed 111 belongs to a registered audit/.test(throws(() => L.divesOf(["far"], [501, 111])) || "") && /seed 175/.test(throws(() => L.divesOf(["far"], [175])) || "") && /kind "slow"/.test(throws(() => L.divesOf(["slow"], [501])) || "") && J(L.divesOf(["far", "both"], [501, 502]).map((d) => [d.kind, d.seed])) === J([["far", 501], ["far", 502], ["both", 501], ["both", 502]]));
    ok("!! the most calls a run can make: one per 'every' ticks of a 600 s dive (18,000 ticks): 60 at 300, 600 at 30, 18,000 at 1; times the dives", L.maxCalls(1, 300) === 60 && L.maxCalls(1, 30) === 600 && L.maxCalls(2, 1) === 36000 && L.maxCalls(3, 7000) === 9);
    ok("!! seeds parse as lists and ranges (501-503, 7,9) and refuse garbage and a backwards range", J(L.parseSeeds("501-503")) === J([501, 502, 503]) && J(L.parseSeeds("7, 9,11-12")) === J([7, 9, 11, 12]) && /cannot read/.test(throws(() => L.parseSeeds("a")) || "") && /backwards/.test(throws(() => L.parseSeeds("5-3")) || ""));
    const seen = []; let n = 0, cacheMap = new Map(); const fn = L.budgeted((p) => "r" + n++, { maxCalls: 2, cache: cacheMap, onNew: (p, r) => seen.push([p, r]) });
    const a = fn("p1"), b = fn("p2"), again = fn("p1"); let over = null; try { fn("p3"); } catch (e) { over = e; }
    ok("!! the budget: the third DISTINCT prompt is refused with CallBudgetExceeded BEFORE the model is touched (2 calls, no 3rd), a repeated prompt is free (a hit, not a call), and every new answer is reported at once", a === "r0" && b === "r1" && again === "r0" && over instanceof L.CallBudgetExceeded && over.max === 2 && n === 2 && fn.state.calls === 2 && fn.state.hits === 1 && J(seen) === J([["p1", "r0"], ["p2", "r1"]]));
    const pre = new Map([["old", "paid"]]), f2 = L.budgeted(() => { throw new Error("must not be called"); }, { maxCalls: 1, cache: pre });
    ok("!! a resumed run is served from the cache: a prompt already paid for costs nothing and does not touch the model", f2("old") === "paid" && f2.state.calls === 0 && f2.state.hits === 1);
}

sec("5. THE RUN (real flights; a scripted model as the command)");
{
    const base = ["record", "--model-id", "scripted-1", "--cmd", `"${NODE}" ${modelScript}`, "--seeds", "501", "--kinds", "far", "--every", "600"];
    const out = path.join(tmp, "t.jsonl"), logs = [], errs = [], io = { out: (m) => logs.push(m), err: (m) => errs.push(m) };
    const dry = await L.command([...base, "--out", out, "--dry-run"], io);
    ok("!! --dry-run prints the dive count and the most calls it could make (30 at every 600 ticks) and the ceiling, calls nothing and writes nothing", dry === 0 && logs.some((m) => /1 practice dives[^\n]*at most 30 calls[^\n]*ceiling is 200/.test(m)) && logs.some((m) => /--dry-run: nothing was called/.test(m)) && !fs.existsSync(out) && !fs.existsSync(out + ".calls.jsonl"));
    logs.length = 0;
    const c1 = await L.command([...base, "--out", out], io), tr = X.parseTranscript(fs.readFileSync(out, "utf8")), log1 = fs.readFileSync(out + ".calls.jsonl", "utf8").split("\n").filter(Boolean);
    ok("!! record flies the dive twice (brain alone, brain advised), writes the transcript (header: the model id and the delay of 600 ticks) and the calls log (one line per answer), and prints the rows with the practice-run caveat", c1 === 0 && tr.header.model.id === "scripted-1" && tr.header.every === 600 && tr.entries.size > 0 && tr.entries.size <= 30 && log1.length === tr.entries.size && logs.some((m) => /far\s+501\s+brain alone [\d.]+\s+advised [\d.]+/.test(m)) && logs.some((m) => /A PRACTICE RUN/.test(m)) && logs.some((m) => new RegExp(`model calls ${tr.entries.size}`).test(m)));
    const e0 = errs.length, c2 = await L.command([...base, "--out", out], io);
    ok("!! a transcript is not overwritten: the same --out again is refused (exit 1) and says so", c2 === 1 && errs.length === e0 + 1 && /already exists/.test(errs[e0]));
    const out2 = path.join(tmp, "t2.jsonl"); fs.copyFileSync(out + ".calls.jsonl", out2 + ".calls.jsonl"); logs.length = 0;
    const c3 = await L.command([...base, "--out", out2, "--max-calls", "1"], io);
    ok("!! a RESUMED run (the calls log of a killed run beside a new --out) pays nothing twice: it says how many answers it resumed, makes 0 calls even with a ceiling of 1 and writes the same transcript", c3 === 0 && logs.some((m) => new RegExp(`resuming: ${log1.length} answers`).test(m)) && logs.some((m) => /model calls 0/.test(m)) && fs.readFileSync(out2, "utf8") === fs.readFileSync(out, "utf8"));
    logs.length = 0; const c4 = await L.command(["replay", "--in", out, "--seeds", "501", "--kinds", "far"], io), row = (m) => /far\s+501\s+brain alone ([\d.]+)\s+advised ([\d.]+)/.exec(m);
    const recRow = logs.length ? null : null;
    ok("!! replay reproduces the recorded run's scores with NO model (it is given none and could not call one), printing 'model calls 0'", c4 === 0 && logs.some((m) => /model calls 0/.test(m)) && (() => { const r = logs.map(row).find(Boolean); const first = fs.readFileSync(out, "utf8"); return !!r && first.length > 0; })());
    const outA = path.join(tmp, "ta.jsonl"); logs.length = 0; await L.command([...base.slice(0, 7), "--seeds", "501", "--kinds", "far", "--every", "600", "--out", outA], io);
    const recorded = logs.map((m) => /far\s+501\s+brain alone ([\d.]+)\s+advised ([\d.]+)/.exec(m)).find(Boolean); logs.length = 0; await L.command(["replay", "--in", outA, "--seeds", "501", "--kinds", "far"], io); const replayed = logs.map((m) => /far\s+501\s+brain alone ([\d.]+)\s+advised ([\d.]+)/.exec(m)).find(Boolean);
    ok("!! the replayed rows are the recorded rows to three decimals (brain alone and advised)", !!recorded && !!replayed && recorded[1] === replayed[1] && recorded[2] === replayed[2]);
    const e1 = errs.length, c5 = await L.command(["replay", "--in", out, "--seeds", "502", "--kinds", "deep"], io);
    ok("!! replaying that transcript on another dive is refused (a missing situation), exit 1, not answered", c5 === 1 && errs.length === e1 + 1 && /no recorded answer/.test(errs[e1]));
    const out3 = path.join(tmp, "t3.jsonl"); let count = 0, errs3 = [];
    const c6 = await L.command(["record", "--model-id", "m", "--cmd", "x", "--seeds", "501", "--kinds", "far", "--every", "30", "--max-calls", "3", "--out", out3], { out: () => {}, err: (m) => errs3.push(m), makeModelFn: () => (p) => { count++; return J({ surface: false, station: 0, cap: 0.9, pump: false, repair: false }); } });
    ok("!! a ceiling stops a run: with --max-calls 3 the model is called exactly 3 times, the run exits 1 naming the 3 saved answers and how to resume, no transcript is written and the calls log keeps the 3 answers", c6 === 1 && count === 3 && errs3.some((m) => /call budget of 3 is spent/.test(m) && /3 answers are saved/.test(m)) && !fs.existsSync(out3) && fs.readFileSync(out3 + ".calls.jsonl", "utf8").split("\n").filter(Boolean).length === 3);
    const e2 = errs.length;
    const c7 = await L.command([...base.slice(0, 7), "--seeds", "151", "--kinds", "far", "--out", path.join(tmp, "t4.jsonl")], io);
    ok("!! a forbidden seed is refused by the command (exit 1) before anything is flown or called", c7 === 1 && /belongs to a registered audit/.test(errs[e2] || "") && !fs.existsSync(path.join(tmp, "t4.jsonl")));
    const pa = (a) => throws(() => L.parseArgs(a));
    ok("!! arguments: the first word must be record or replay; record needs --out (not with --dry-run), --model-id and exactly one of --cmd or --api; --every and --max-calls whole numbers; --params a json object; --mode a chip mode but not ALONE; an unknown option and a stray word are refused", /first word/.test(pa(["go"]) || "") && /--out/.test(pa(["record", "--model-id", "m", "--cmd", "x"]) || "") && L.parseArgs(["record", "--model-id", "m", "--cmd", "x", "--dry-run"]).out === null && /--model-id/.test(pa(["record", "--out", "o", "--cmd", "x"]) || "") && /exactly one/.test(pa(["record", "--out", "o", "--model-id", "m"]) || "") && /exactly one/.test(pa(["record", "--out", "o", "--model-id", "m", "--cmd", "x", "--api"]) || "") && /--every/.test(pa(["record", "--out", "o", "--model-id", "m", "--cmd", "x", "--every", "0"]) || "") && /--max-calls/.test(pa(["record", "--out", "o", "--model-id", "m", "--cmd", "x", "--max-calls", "1.5"]) || "") && /json object/.test(pa(["record", "--out", "o", "--model-id", "m", "--cmd", "x", "--params", "[1]"]) || "") && /--mode/.test(pa(["record", "--out", "o", "--model-id", "m", "--cmd", "x", "--mode", "ALONE"]) || "") && /unknown option/.test(pa(["replay", "--in", "t", "--bogus"]) || "") && /unexpected/.test(pa(["replay", "stray"]) || "") && /--in/.test(pa(["replay"]) || "") && L.parseArgs(["record", "--out", "o", "--model-id", "m", "--api", "--params", '{"temperature":0.5}']).params.temperature === 0.5);
    const cmdSrc = fs.readFileSync(new URL("./advisorLiveCmd.mjs", import.meta.url), "utf8");
    ok("!! the command file is three lines that import command from the library and set the exit code", /import \{ command \} from "\.\/advisorLive\.mjs"/.test(cmdSrc) && /process\.exitCode = await command\(process\.argv\.slice\(2\)\)/.test(cmdSrc));
}

sec("5b. THE EDGES (what a first run on another box would hit)");
{
    const apiKey = "sk-ant-api03-abcdefgh1234", fakeOk = (stdout) => () => ({ status: 0, stdout });
    const withKey = (v, f) => { const s = process.env.ANTHROPIC_API_KEY; process.env.ANTHROPIC_API_KEY = v; try { return f(); } finally { if (s === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = s; } };
    ok("!! the request's headers never hold the key, even with the key set in the environment", withKey("sk-live-0123456789abcdef", () => !J(L.anthropicRequest({ model: "m", prompt: "p" }).headers).includes("0123456789abcdef")));
    ok("!! text blocks are joined and a block of another type is ignored even when it carries a text field", L.extractReplyText({ content: [{ type: "text", text: "a" }, { type: "tool_use", text: "NOT" }, { type: "text", text: "b" }] }) === "ab");
    const e4 = throws(() => L.modelFnFromApi({ model: "m", env: { ANTHROPIC_API_KEY: "k12345678" }, spawn: () => ({ status: 4, stderr: `http 401: bad ${apiKey} and k12345678` }) })("p"));
    ok("!! an API child's stderr is scrubbed (a key-shaped string and the key's value) before it is thrown", /exited 4/.test(e4 || "") && !/abcdefgh1234/.test(e4 || "") && !/k12345678/.test(e4 || "") && /\[key\]/.test(e4 || ""));
    ok("!! a child that could not be started throws naming the code", /failed to run \(ENOENT\)/.test(throws(() => L.modelFnFromApi({ model: "m", env: { ANTHROPIC_API_KEY: "k12345678" }, spawn: () => ({ error: { code: "ENOENT" } }) })("p")) || ""));
    ok("!! a short key (under 8 characters) is not scrubbed as a value, so ordinary words are not mangled", L.scrub("xabcx", { ANTHROPIC_API_KEY: "abc" }) === "xabcx");
    ok("!! a model function that returns a non-string is turned into a string (the seat only ever sees text)", L.budgeted(() => 5)("p") === "5");
    ok("!! the defaults: 200 calls, a decision every 300 ticks, and an options pair with no values asked for gets exactly those", L.DEFAULT_MAX_CALLS === 200 && L.DEFAULT_EVERY === 300 && (() => { const o = L.parseArgs(["record", "--model-id", "m", "--cmd", "x", "--out", "o"]); return o.maxCalls === 200 && o.every === 300 && o.maxTokens === L.DEFAULT_MAX_TOKENS; })());
    ok("!! a non-number for a number option and an option with no value are refused", /needs a number/.test(pa2(["record", "--every", "abc"]) || "") && /--model-id needs a value/.test(pa2(["record", "--model-id"]) || "") && /--model-id needs a value/.test(pa2(["record", "--model-id", "--cmd", "x"]) || ""));
    ok("!! an unknown kind is refused by the library itself (not left to the scenario builder)", /^advisorLive: kind "slow"/.test(throws(() => L.divesOf(["slow"], [501])) || ""));
    // the dry run warns when the ceiling is below the most the run could make, and says nothing when it is not
    const dl = [], dry = (extra) => L.command(["record", "--model-id", "m", "--cmd", "x", "--seeds", "501", "--kinds", "far", "--every", "600", "--dry-run", ...extra], { out: (m) => dl.push(m), err: () => {} });
    await dry(["--max-calls", "5"]); const warned = dl.some((m) => /LOWER than the most it could make/.test(m)); dl.length = 0; await dry(["--max-calls", "30"]);
    ok("!! --dry-run says the ceiling is LOWER than the most a run could make when it is (5 < 30) and says nothing when it is not (30)", warned && !dl.some((m) => /LOWER/.test(m)));
    // a bad line in the calls log stops a resume; an error from the model is scrubbed before it is shown
    const badOut = path.join(tmp, "bad.jsonl"), badErrs = []; fs.writeFileSync(badOut + ".calls.jsonl", "this is not json\n");
    const cb = await L.command(["record", "--model-id", "m", "--cmd", "x", "--seeds", "501", "--kinds", "far", "--every", "600", "--out", badOut], { out: () => {}, err: (m) => badErrs.push(m), makeModelFn: () => () => "{}" });
    ok("!! a calls log with a line that is not json stops the run (exit 1, naming the file) and writes no transcript", cb === 1 && badErrs.some((m) => /not json/.test(m)) && !fs.existsSync(badOut));
    const leakErrs = [], cl = await L.command(["record", "--model-id", "m", "--cmd", "x", "--seeds", "501", "--kinds", "far", "--every", "600", "--out", path.join(tmp, "leak.jsonl")], { out: () => {}, err: (m) => leakErrs.push(m), makeModelFn: () => () => { throw new Error(`upstream said ${apiKey} is bad`); } });
    ok("!! an error from the model is scrubbed before the command shows it (a key-shaped string becomes [key])", cl === 1 && leakErrs.length === 1 && /\[key\]/.test(leakErrs[0]) && !/abcdefgh1234/.test(leakErrs[0]));
    // the flights: the mode is passed through, a crush is carried into the rows, the stats are kept, the mean line is the mean
    const dv = (k, s) => L.divesOf([k], [s]), mf = () => J({ surface: false, station: 0, cap: 0.2, pump: false, repair: false });
    const veto = L.recordRun({ dives: dv("far", 501), modelFn: mf, model: { id: "m", params: {} }, every: 600, mode: "VETO" }), vs = L.recordRun({ dives: dv("far", 501), modelFn: mf, model: { id: "m", params: {} }, every: 600, mode: "V-SURFACE" });
    ok("!! recordRun passes the mode on (VETO lowers the cap on every tick, V-SURFACE on none) and keeps the chip's stats in the row", veto.rows[0].stats.ticks === 18000 && veto.rows[0].stats.cap === 18000 && vs.rows[0].stats.cap === 0);
    const cr = L.recordRun({ dives: dv("both", 501), modelFn: () => "nope", model: { id: "m", params: {} }, every: 600 }), rp = L.replayRun({ dives: dv("both", 501), transcript: cr.transcript });
    ok("!! a crushed boat is carried into the rows of both runs (both 501 crushes alone and advised), live and replayed", cr.rows[0].aloneCrushed === true && cr.rows[0].advisedCrushed === true && rp.rows[0].aloneCrushed === true && rp.rows[0].advisedCrushed === true && veto.rows[0].aloneCrushed === false);
    const rl = L.runLines([{ kind: "far", seed: 1, alone: 1, advised: 3, aloneCrushed: false, advisedCrushed: false }, { kind: "far", seed: 2, alone: 2, advised: 4, aloneCrushed: false, advisedCrushed: false }]);
    ok("!! the mean line averages each column on its own (alone 1.500, advised 3.500) and the practice-run caveat is printed", rl.some((l) => /brain alone 1\.500, advised 3\.500/.test(l)) && rl.some((l) => /A PRACTICE RUN/.test(l)));
}

sec("6. THE SOURCE");
{
    const code = fs.readFileSync(new URL("./advisorLive.mjs", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! no shell is ever enabled (every spawn says shell: false), nothing calls exec, execSync or a shell string, and the only child process API is spawnSync", (code.match(/shell: false/g) || []).length === 2 && !/shell:\s*true|execSync|(?<![.\w])exec\(|execFile|child_process"[^;]*\bexec\b/.test(code) && /import \{ spawnSync \} from "node:child_process"/.test(code));
    ok("!! the key is read from the environment by name and written nowhere: the variable's name appears as a constant, the child takes it from ITS environment, no file is written with it, and a messages is scrubbed before it is shown", /keyEnv: "ANTHROPIC_API_KEY"/.test(code) && /process\.env\[r\.keyEnv\]/.test(code) && !/writeFile\([^)]*(key|KEY)/.test(code) && /scrub\(/.test(code) && !/headers\["x-api-key"\]\s*=|"x-api-key":\s*[a-z]*[Kk]ey\b[^}]*body/.test(code));
}

fs.rmSync(tmp, { recursive: true, force: true });
sec("7. TWO CONSTANTS THE COMMAND READS (named here so the definition ratchet can see them)");
ok("!! DEFAULT_TIMEOUT_MS is two minutes a call, and DIVE_KINDS are the survey run's four kinds (plain, deep, far, both)", L.DEFAULT_TIMEOUT_MS === 120000 && J(L.DIVE_KINDS) === J(T.KINDS) && J(L.DIVE_KINDS) === J(["plain", "deep", "far", "both"]));

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
