// WebGLEngine/tools/ship/takeAfterAction-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeAfterAction-selfcheck.mjs      (about 10 s)
//
// THE GATE OF tools/ship/takeAfterAction.mjs: the three commands of the after-action analyzer (facts, ask, report), registered in brain/AFTER_ACTION_WIP.md before they were written. NO MODEL IS CALLED: the server is a SCRIPTED FAKE (a fetch that answers GET /v1/models and POST /v1/chat/completions with the narration a script gives for the prompt it was sent), so every branch of the commands is held by a test that needs no model and no phone.
//   1  THE ARGUMENTS  every refusal by its words (the first word, an unknown option, a missing value, a missing --set / --base / --model / --out / --in, an unknown set, an address that is not one, a file named twice); the key is optional; --in repeats.
//   2  ASK            the request the server sees (the one user message is the prompt, temperature 0, 600 tokens, streamed, the model asked for, the Bearer key only when one is given); the header (the model id AS THE SERVER REPORTS IT, the id asked for, the parameters, the set); one line a reply under the key of (model, parameters, prompt); RESUMABLE (a pair in the file is not asked again);
//                     NO RETRIES (a failed ask is asked once, the run stops); a reply that did not arrive whole (an HTTP error, an interrupted stream, empty text) is not recorded; another model, another set or a file that is not a transcript is refused; the key is never written to the file.
//   3  FACTS          the numbered facts of each pair and the hash of the prompt printed, the salient ones marked, a JSON line a pair with --out.
//   4  REPORT         five scripted models (faithful, miscopies every tick, drops the ids, says "because", narrates the wrong pair) read FAITHFUL AND COMPLETE, UNFAITHFUL, CANNOT FOLLOW THE FORMAT, UNFAITHFUL, UNFAITHFUL as they should, the checks FIRST: a template that fails, a shuffled control that does not separate, a transcript that is not whole (a reply missing, a pair twice, a key of another prompt, two files of one model, two sets) each turn the readings into THE CHECKER IS BROKEN.
//   5  REAL FIGHTS    the default flights on the four DEV pairs: facts, a full ask against the faithful fake, and the report of that transcript, end to end.
// NOT CHECKED, said plainly: any real model or phone (the sandbox reaches neither: the REGISTERED READ IS OWED on the owner's side); the real SSE framing of a real server beyond what ui/privateLmClient.mjs's own gate holds.
//
// SABOTAGE LOG (2026-11-07), tools/ship/takeAfterAction.mjs, two full passes -- each mechanical (every comparison, sign, arithmetic operator, constant +-1 and boolean of every code line, one at a time) plus hand mutants (the temperature or the token limit not sent, a failed ask skipped instead of stopping the run, an interrupted stream or an empty reply recorded, the resume ignoring the file, the transcript naming the model asked for
// instead of the one the server reports, the key written into the header, another model or another set not refused, the readings ignoring the checks flag, the shuffled ceiling, the template check, the transcript checks, the two-files-of-one-model check or the determinism check ignored, the DEV set not marked, sets mixed in one report, the entry of the wrong seed read, the user message not the prompt, the models request typed
// as JSON), each applied to an isolated tree and this gate run; the file restored (sha256 identical before and after).
//   FIRST PASS (200 mutants): 141 red, 46 threw, 13 went 0 red. Rows written because of them: the shapes of a server's model list ({data:[...]}, {models:[...]}, id or name, the first, nothing), the models request carrying only the Authorization (no Content-Type), a key given empty, `reportLines` called directly (its `failed` flag, the facts-determinism check failing by name when the facts are not what a fresh generation gives,
//   and the shuffled control at EXACTLY 0.500 -- two hand-made pairs, half the lines supported -- passing, one line more failing). A DEAD CLAUSE was found and removed from the module (an exception for an empty key that a value of "" never needed: `"".startsWith("--")` is false), which is why the pass was run again in full.
//   SECOND PASS (196 mutants, 176 mechanical and 20 by hand): 148 red, 45 threw, 3 went 0 red, no timeout. THE 3 ARE EQUIVALENT, each argued: `init &&` in the fetch wrapper (chatStream always hands it an object, so the guard is never false); the template check's `&&` against `||` (a template line that fails lowers SUPPORT and COVERAGE together, so they are never apart); and the default-fetch test (`typeof fetch === "function"`:
//   the only run that reaches it needs the real network, which this gate never touches, and with the global fetch taken away the two readings both end in "no fetch").
//   BY HAND, OUTSIDE THE GATE (not a sabotage; a measurement): the real command line against a stub OpenAI-compatible server on the loopback over real HTTP -- real streaming, a real Bearer check, a request the server refuses unless it carries temperature 0, 600 tokens and stream true -- gave a whole transcript and FAITHFUL AND COMPLETE on the four DEV pairs, and a wrong key stopped at the first pair with the phone-style message.
"use strict";
import * as A from "../../brain/afterAction.mjs";
import * as X from "./takeAfterAction.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
const msg = (f) => { try { f(); return null; } catch (e) { return e.message; } };
console.log("takeAfterAction-selfcheck -- the commands of the after-action analyzer\n");

// ---- synthetic pairs: a different small pair for every seed, so that each prompt is its own
const res = (outcome, score, lost, ogreFired, events) => ({ outcome, score, lost, ogreFired, events });
const synth = (seed) => ({ seed, base: res("defended", 1 + (seed % 7) / 10, seed % 3, 2 + (seed % 2), [{ tick: 10, type: "ping", boat: 1 }, { tick: 200 + seed, type: "hit", boat: 0, target: 1 }]), kit: res("defended", 2 + (seed % 5) / 10, (seed * 2) % 3, 2, [{ tick: 10, type: "ping", boat: 1 }, { tick: 100 + seed, type: "decoy", boat: 2, id: 2000 }, { tick: 200 + seed, type: "decoyed", boat: 0, decoy: 2000 }]) });   // every salient line of a pair differs from the next pair's
const sets = (set) => X.pairsOf(set, synth);
const DEV = sets("dev"), REG = sets("registered"), PROMPTS = new Map([...DEV, ...REG].map((p) => [p.prompt, p]));

// ---- a fake server: scripted replies; it remembers every request it was sent
function server({ model = "fake-model-1", script = (p) => A.templateNarration(p.facts), models = true, failAt = null, interrupt = null, empty = null, httpError = null } = {}) {
    const log = { requests: [], gets: [] };
    const f = async (url, init = {}) => {
        if (init.method === "GET" || !init.method) { log.gets.push({ url, headers: init.headers }); if (!/\/v1\/models$/.test(url) || !models) return { ok: false, status: 404, json: async () => ({}), text: async () => "" }; return { ok: true, status: 200, json: async () => ({ data: [{ id: model }] }), text: async () => "" }; }
        const body = JSON.parse(init.body); log.requests.push({ url, headers: init.headers, body });
        const n = log.requests.length, prompt = body.messages[0].content, p = PROMPTS.get(prompt);
        if (httpError === n) return { ok: false, status: 500, json: async () => ({ error: { message: "boom" } }), text: async () => "" };
        if (failAt === n) throw new Error("socket hang up");
        if (interrupt === n) return { ok: true, status: 200, text: async () => `data: ${J({ choices: [{ delta: { content: "[F1] part" } }] })}\n\ndata: ${J({ error: { type: "interrupted", message: "stopped" } })}\n\n` };
        const text = empty === n ? "" : script(p, body);
        return { ok: true, status: 200, text: async () => `data: ${J({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n` };
    };
    return { f, log };
}
const mem = (files = {}) => { const fsx = { ...files }, o = { out: [], err: [], files: fsx }; return Object.assign(o, { io: { out: (m) => o.out.push(m), err: (m) => o.err.push(m), readFile: (f) => { if (!(f in fsx)) throw new Error("ENOENT " + f); return fsx[f]; }, appendFile: (f, t) => { fsx[f] = (fsx[f] || "") + t; }, writeFile: (f, t) => { fsx[f] = t; }, exists: (f) => f in fsx, fly: synth } }); };
const ask = async (m, srv, extra = []) => X.command(["ask", "--base", "10.0.0.5:8080", "--key", "sekret", "--model", "asked-model", "--set", "dev", "--out", "t.jsonl", ...extra], { ...m.io, fetch: srv.f });

sec("1. THE ARGUMENTS");
{
    const pa = (a) => msg(() => X.parseArgs(a));
    ok("!! the first word is facts, ask or report; unknown options, stray words and missing values are refused by their words", pa([]) === 'the first word must be facts, ask or report, got undefined' && pa(["run"]) === 'the first word must be facts, ask or report, got "run"' && pa(["facts", "--nope", "x"]) === 'unknown option "--nope" (known for facts: --set, --out)' && pa(["ask", "--nope", "x"]) === 'unknown option "--nope" (known for ask: --base, --key, --model, --set, --out)' && pa(["report", "--nope", "x"]) === 'unknown option "--nope" (known for report: --in)' && pa(["facts", "x"]) === 'unexpected argument "x"' && pa(["facts", "--set"]) === "--set needs a value" && pa(["facts", "--set", "--out"]) === "--set needs a value");
    ok("!! facts needs --set, and a known one; ask needs --set, --base, --model and --out (each named); report needs --in; the same file twice is refused", pa(["facts"]) === "facts needs --set dev|registered" && pa(["facts", "--set", "held"]) === 'unknown set "held" (dev, registered)' && pa(["ask", "--base", "a:1"]) === "ask needs --set dev|registered" && pa(["ask", "--set", "dev"]) === "ask needs --base <host:port>" && pa(["ask", "--set", "dev", "--base", "10.0.0.5:8080"]) === "ask needs --model <model id>" && pa(["ask", "--set", "dev", "--base", "10.0.0.5:8080", "--model", "m"]) === "ask needs --out <transcript file>" && pa(["report"]) === "report needs --in <transcript file> (once per model)" && pa(["report", "--in", "a", "--in", "a"]) === "a transcript file is named twice");
    ok("!! an address that is not one is refused ('--base \"ftp://x\" is not an address'); an address without a scheme is accepted; the key is optional", pa(["ask", "--set", "dev", "--base", "ftp://x", "--model", "m", "--out", "o"]) === '--base "ftp://x" is not an address (host:port or http://host:port)' && X.parseArgs(["ask", "--set", "dev", "--base", "10.0.0.5:8080", "--model", "m", "--out", "o"]).key === "");
    const a = X.parseArgs(["ask", "--set", "registered", "--base", "http://10.0.0.5:8080", "--key", "k", "--model", "m", "--out", "o.jsonl"]), r = X.parseArgs(["report", "--in", "a", "--in", "b"]), fa = X.parseArgs(["facts", "--set", "dev", "--out", "f.jsonl"]);
    ok("!! every option is read: ask (set, base, key, model, out), facts (set, out), report (several --in in order)", a.set === "registered" && a.base === "http://10.0.0.5:8080" && a.key === "k" && a.model === "m" && a.out === "o.jsonl" && fa.set === "dev" && fa.out === "f.jsonl" && J(r.ins) === J(["a", "b"]) && X.parseArgs(["facts", "--set", "dev"]).out === null);
    ok("!! a bad argument is exit 2 on the error stream with the name of the tool", await (async () => { const m = mem(); const c = await X.command(["go"], m.io); return c === 2 && m.err.length === 1 && m.err[0] === 'takeAfterAction: the first word must be facts, ask or report, got "go"'; })());
}

sec("2. ASK (a scripted fake server)");
{
    const m1 = mem(), s1 = server(), c1 = await ask(m1, s1);
    const lines = m1.files["t.jsonl"].trim().split("\n").map(JSON.parse), header = lines[0], ents = lines.slice(1);
    ok("!! a whole run asks each of the four DEV pairs once, in order, and records them: exit 0, a header and four reply lines; the model id is the one the SERVER reports ('fake-model-1'), the id asked for is kept beside it, the set and the parameters are in the header", c1 === 0 && s1.log.requests.length === 4 && lines.length === 5 && header.kind === "afterAction-transcript" && header.schema === 1 && header.model === "fake-model-1" && header.requested === "asked-model" && header.set === "dev" && header.params.temperature === 0 && header.params.max_tokens === 600 && J(ents.map((e) => e.seed)) === J([1, 2, 3, 4]));
    const rq = s1.log.requests[0];
    ok("!! the request: POST to /v1/chat/completions of the address typed, ONE user message that is the prompt word for word, temperature 0, 600 tokens, streamed, the model asked for, and the Bearer key in the header", /^http:\/\/10\.0\.0\.5:8080\/v1\/chat\/completions$/.test(rq.url) && rq.body.messages.length === 1 && rq.body.messages[0].role === "user" && rq.body.messages[0].content === DEV[0].prompt && rq.body.temperature === 0 && rq.body.max_tokens === 600 && rq.body.stream === true && rq.body.model === "asked-model" && rq.headers.Authorization === "Bearer sekret" && s1.log.requests.every((r, i) => r.body.messages[0].content === DEV[i].prompt));
    ok("!! each reply is stored under the key of (model, parameters, prompt), with its pair's seed, the hash of the prompt and the text; the transcript passes the transcript checks", ents.every((e, i) => e.key === A.transcriptKey("fake-model-1", header.params, DEV[i].prompt) && e.promptHash === A.hashOf(DEV[i].prompt) && e.reply === A.templateNarration(DEV[i].facts)) && A.transcriptChecks(header, ents, DEV.map((p) => ({ seed: p.seed, prompt: p.prompt }))).length === 0);
    ok("!! the KEY never reaches the transcript file or a message ('sekret' appears nowhere in the file, the output or the errors)", !m1.files["t.jsonl"].includes("sekret") && !m1.out.join("\n").includes("sekret") && !m1.err.join("\n").includes("sekret"));
    ok("!! the models request carries the key too, and asks the right path (GET /v1/models once)", s1.log.gets.length === 1 && /\/v1\/models$/.test(s1.log.gets[0].url) && s1.log.gets[0].headers.Authorization === "Bearer sekret");
    ok("!! the progress lines: the plan (model, pairs, how many already in, how many to ask, the decoding), each pair answered with its word count, and the instruction to read the transcript", m1.out[0] === "[takeAfterAction] model fake-model-1 (asked for \"asked-model\"); 4 pairs of the dev set, 0 already in t.jsonl, 4 to ask; temperature 0, 600 tokens, one ask a pair, no retries" && /^\[takeAfterAction\] pair 1 answered \(\d+ words\)$/.test(m1.out[1]) && m1.out[m1.out.length - 1] === "[takeAfterAction] the transcript is whole in t.jsonl; read it with: report --in t.jsonl");
    // no key: no Authorization header
    const m0 = mem(), s0 = server(); await X.command(["ask", "--base", "10.0.0.5:8080", "--model", "m", "--set", "dev", "--out", "t.jsonl"], { ...m0.io, fetch: s0.f });
    ok("!! with no key there is no Authorization header at all", s0.log.requests.length === 4 && s0.log.requests.every((r) => !("Authorization" in r.headers)) && !("Authorization" in s0.log.gets[0].headers));
    // resume
    const m2 = mem({ "t.jsonl": m1.files["t.jsonl"].split("\n").slice(0, 3).join("\n") + "\n" }), s2 = server(), c2 = await ask(m2, s2);
    ok("!! RESUMABLE: with the header and two replies in the file only the other two pairs are asked (pairs 3 and 4), the file ends whole and byte for byte what a whole run wrote", c2 === 0 && s2.log.requests.length === 2 && s2.log.requests[0].body.messages[0].content === DEV[2].prompt && m2.files["t.jsonl"] === m1.files["t.jsonl"] && /2 already in t.jsonl, 2 to ask/.test(m2.out[0]));
    const s2b = server(), c2b = await ask(m2, s2b);
    ok("!! a whole transcript asks NOTHING (zero requests, exit 0)", c2b === 0 && s2b.log.requests.length === 0 && /4 already in t.jsonl, 0 to ask/.test(m2.out[m2.out.length - 2]));
    // no retries, nothing recorded for a reply that did not arrive
    const cases = [["a transport error", { failAt: 3 }, /socket hang up/], ["an HTTP error", { httpError: 3 }, /\(boom\)/], ["an interrupted stream", { interrupt: 3 }, /interrupted/], ["an empty reply", { empty: 3 }, /no text/]];
    for (const [name, opt, re] of cases) {
        const m = mem(), s = server(opt), c = await ask(m, s), n = m.files["t.jsonl"].trim().split("\n").length;
        ok(`!! ${name} at the third pair: ONE request for it (no retry), nothing recorded for it (header and two replies only), exit 1, the error names the pair and says to run the same command again`, c === 1 && s.log.requests.length === 3 && n === 3 && m.err.length === 1 && /^takeAfterAction: pair 3: /.test(m.err[0]) && re.test(m.err[0]) && /run the same command again to go on/.test(m.err[0]));
    }
    // the model the server reports
    const m3 = mem({ "t.jsonl": m1.files["t.jsonl"] }), s3 = server({ model: "other-model" }), c3 = await ask(m3, s3);
    ok("!! a transcript of one model is not continued with another: the server now reports 'other-model' and the file is of 'fake-model-1' -> exit 1, nothing asked", c3 === 1 && s3.log.requests.length === 0 && /one transcript is one model/.test(m3.err[0]));
    const m4 = mem(), s4 = server({ models: false }), c4 = await ask(m4, s4), h4 = JSON.parse(m4.files["t.jsonl"].split("\n")[0]);
    ok("!! a server that does not report its model: the id asked for is the model of the transcript", c4 === 0 && h4.model === "asked-model" && h4.requested === "asked-model");
    const m5 = mem({ "t.jsonl": m1.files["t.jsonl"] }), s5 = server(), c5 = await X.command(["ask", "--base", "10.0.0.5:8080", "--model", "m", "--set", "registered", "--out", "t.jsonl"], { ...m5.io, fetch: s5.f });
    ok("!! a transcript of the dev set is not continued with the registered one: refused, nothing asked, 'use another --out'", c5 === 1 && s5.log.requests.length === 0 && /transcript of the dev set and this run is of the registered set.*use another --out/.test(m5.err[0]));
    const m6 = mem({ "t.jsonl": J({ kind: "something else" }) + "\n" }), s6 = server(), c6 = await ask(m6, s6), m7 = mem({ "t.jsonl": "{nope}\n" }), c7 = await ask(m7, server());
    ok("!! a file that is not a transcript is refused, and so is one that is not JSON (with its line number); nothing is asked", c6 === 1 && s6.log.requests.length === 0 && /is not an after-action transcript/.test(m6.err[0]) && c7 === 1 && m7.err[0] === "takeAfterAction: transcript line 1 is not JSON");
    const m8 = mem(), saved = globalThis.fetch; let c8; globalThis.fetch = undefined;   // the runtime's own fetch is taken away for this one call, so that the gate can never reach a network
    try { c8 = await X.command(["ask", "--base", "10.0.0.5:8080", "--model", "m", "--set", "dev", "--out", "t.jsonl"], { ...m8.io, fetch: null }); } finally { globalThis.fetch = saved; }
    ok("!! with no fetch in the runtime (and none handed in) the command says so, asks nothing and writes nothing", c8 === 1 && m8.err.length === 1 && m8.err[0] === "takeAfterAction: no fetch in this runtime" && Object.keys(m8.files).length === 0);
    const reg = mem(), sreg = server(), creg = await X.command(["ask", "--base", "10.0.0.5:8080", "--model", "m", "--set", "registered", "--out", "r.jsonl"], { ...reg.io, fetch: sreg.f });
    ok("!! the REGISTERED set is twelve pairs (scenarios 101 to 112), asked once each", creg === 0 && sreg.log.requests.length === 12 && JSON.parse(reg.files["r.jsonl"].split("\n")[0]).set === "registered" && reg.files["r.jsonl"].trim().split("\n").slice(1).map((l) => JSON.parse(l).seed).join() === "101,102,103,104,105,106,107,108,109,110,111,112");
}

sec("2b. ASK: what the server says about its model, and the key as an empty value");
{
    const modelOf = async (body, okFlag = true, throws = false) => { const f = async () => { if (throws) throw new Error("down"); return { ok: okFlag, status: okFlag ? 200 : 500, json: async () => body }; }; return X.reportedModel("10.0.0.5:8080", "", f); };
    ok("!! the model the server reports is read from the shapes a server may use: {data:[{id}]}, {models:[{id}]}, {models:[{name}]}, {data:[{name}]}; the FIRST model; an id wins over a name", await modelOf({ data: [{ id: "a" }, { id: "b" }] }) === "a" && await modelOf({ models: [{ id: "m-id" }] }) === "m-id" && await modelOf({ models: [{ name: "m-name" }] }) === "m-name" && await modelOf({ data: [{ name: "d-name" }] }) === "d-name" && await modelOf({ data: [{ id: "i", name: "n" }] }) === "i");
    ok("!! a server that cannot say gives null: an empty list, an entry with no id or name, no list at all, an HTTP error, a thrown error, an address that is not one", await modelOf({ data: [] }) === null && await modelOf({ data: [{}] }) === null && await modelOf({}) === null && await modelOf({ data: [{ id: "a" }] }, false) === null && await modelOf(null) === null && await modelOf({ data: [{ id: "a" }] }, true, true) === null && await X.reportedModel("ftp://x", "", async () => ({ ok: true, json: async () => ({ data: [{ id: "a" }] }) })) === null);
    const s = server(), m = mem(); await ask(m, s);
    ok("!! the models request is a GET with the key and NO body type (no Content-Type: it is not JSON in): the GET headers carry the Authorization and nothing else", J(Object.keys(s.log.gets[0].headers)) === J(["Authorization"]));
    const sr = X.parseArgs(["ask", "--set", "dev", "--base", "a:1", "--key", "", "--model", "m", "--out", "o"]);
    ok("!! an explicitly EMPTY key (--key \"\") is the same as none; a value that looks like an option is refused as a value (--key --model)", sr.key === "" && msg(() => X.parseArgs(["ask", "--set", "dev", "--base", "a:1", "--key", "--model", "m", "--out", "o"])) === "--key needs a value");
}

sec("3. FACTS");
{
    const m = mem(), c = await X.command(["facts", "--set", "dev", "--out", "f.jsonl"], m.io), fl = m.files["f.jsonl"].trim().split("\n").map(JSON.parse);
    ok("!! `facts` prints, for each pair, a header line (seed, fact count, salient count, the hash of the prompt) and each fact on its own line, the salient ones marked", c === 0 && m.out.filter((l) => /^PAIR \d+:/.test(l)).length === 4 && m.out[0] === `PAIR 1: ${DEV[0].facts.length} facts, ${A.salientOf(DEV[0].facts).length} salient, prompt ${A.hashOf(DEV[0].prompt)}` && m.out[1] === "  " + A.lineOf(DEV[0].facts[0]) + "   [salient]" && m.out.some((l) => l.endsWith(" [salient]")) && m.out.some((l) => /^  F\d+ \[K\]/.test(l) && !l.endsWith("[salient]")));
    ok("!! with --out each pair is a JSON line with its seed, facts, prompt and the hash of the prompt", fl.length === 4 && fl.every((r, i) => r.seed === i + 1 && J(r.facts) === J(DEV[i].facts) && r.prompt === DEV[i].prompt && r.promptHash === A.hashOf(DEV[i].prompt)));
    const m2 = mem(); await X.command(["facts", "--set", "registered"], m2.io);
    ok("!! without --out no file is written; the registered set prints twelve pairs", Object.keys(m2.files).length === 0 && m2.out.filter((l) => /^PAIR \d+:/.test(l)).length === 12 && /^PAIR 101:/.test(m2.out[0]));
}

sec("4. REPORT (five scripted models)");
{
    const wrongPair = (p) => A.templateNarration(DEV[(DEV.indexOf(p) + 2) % DEV.length].facts), nextPair = (p) => A.templateNarration(DEV[(DEV.indexOf(p) + 1) % DEV.length].facts);   // the wrong pair is TWO ahead: the shuffled control grades against the pair one ahead
    const models = { faithful: (p) => A.templateNarration(p.facts), miscopy: (p) => A.templateNarration(p.facts).replace(/tick (\d+)/g, (a, t) => `tick ${Number(t) + 1}`), drops: (p) => A.templateNarration(p.facts).split("\n").map((l) => l.replace(/^\[[^\]]*\]\s*/, "")).join("\n"), because: (p) => A.templateNarration(p.facts).split("\n").map((l) => l.replace(/\.$/, " because of it.")).join("\n"), wrong: wrongPair };
    const files = {};
    for (const [name, script] of Object.entries(models)) { const m = mem(), s = server({ model: "model-" + name, script }); await ask(m, s); files[name] = m.files["t.jsonl"]; }
    const run = async (inputs, extra = {}) => { const m = mem(inputs); const c = await X.command(["report", ...Object.keys(inputs).flatMap((k) => ["--in", k])], { ...m.io, ...extra }); return { c, out: m.out, err: m.err }; };
    const all = await run(Object.fromEntries(Object.entries(files).map(([k, v]) => ["t-" + k + ".jsonl", v])));
    const bl = (o, name) => (o.out.find((l) => l.startsWith(`BOTTOM LINE (${name}):`)) || "").replace(`BOTTOM LINE (${name}): `, "");
    ok("!! the five readings: the faithful model is FAITHFUL AND COMPLETE; the model that miscopies ticks and the one that says 'because' are UNFAITHFUL; the one that drops the ids CANNOT FOLLOW THE FORMAT; the one that narrates the wrong pair is UNFAITHFUL; exit 0 and no check failed", all.c === 0 && bl(all, "model-faithful") === "FAITHFUL AND COMPLETE" && bl(all, "model-miscopy") === "UNFAITHFUL: THE NARRATION CANNOT BE TRUSTED LINE BY LINE" && bl(all, "model-because") === "UNFAITHFUL: THE NARRATION CANNOT BE TRUSTED LINE BY LINE" && bl(all, "model-drops") === "THE MODEL CANNOT FOLLOW THE FORMAT" && bl(all, "model-wrong") === "UNFAITHFUL: THE NARRATION CANNOT BE TRUSTED LINE BY LINE" && !all.out.some((l) => /^CHECK FAILED/.test(l)));
    const one = await run({ "t-faithful.jsonl": files.faithful }), b0 = one.out;
    ok("!! the report of one model, word for word where it carries the registered numbers: the header (4 DEV pairs, marked as prompt development), the checks line, the template's words and lines, the model line with FORMAT, SUPPORT, COVERAGE to three decimals, the narrations under 0.75, the words against the template's and the lines, the failed kinds, the bottom line, the limits", /^THE AFTER-ACTION ANALYZER: 4 pairs of the Sea OGRE \(DEV scenarios 1 to 4 -- prompt development, NOT the registered read\), 1 model\(s\)$/.test(b0[0]) && /^  checks: FACTS deterministic ok; TEMPLATE SUPPORT 1\.000 COVERAGE 1\.000; SHUFFLED t-faithful\.jsonl 0\.\d{3}; TRANSCRIPTS whole$/.test(b0[1]) && /^  TEMPLATE \(the control\): \d+\.\d words and \d\.\d lines a narration$/.test(b0[2]) && /^  model-faithful: FORMAT 1\.000  SUPPORT 1\.000  COVERAGE 1\.000  narrations under 0\.75: 0 of 4  words \d+\.\d \(template \d+\.\d\)  lines \d\.\d$/.test(b0[3]) && b0[4] === "    lines that failed, by kind: no ids 0, an id that does not exist 0, a number not in the facts 0, a causal word 0, a run mismatch 0 (a line can fail in several ways)" && b0[5] === "BOTTOM LINE (model-faithful): FAITHFUL AND COMPLETE" && /^Limits of the checker, said plainly: number WORDS/.test(b0[6]) && b0.length === 7, b0[3]);
    const w = (await run({ "t-because.jsonl": files.because })).out;
    const nSal = DEV.reduce((n, p) => n + A.salientOf(p.facts).length, 0);
    ok(`!! the kinds of failure are counted in the report (every line of the 'because' model has a causal word: 'a causal word ${nSal}', 'no ids 0')`, w[4].includes(`a causal word ${nSal},`) && /no ids 0,/.test(w[4]) && /SUPPORT 0\.000/.test(w[3]) && /FORMAT 1\.000/.test(w[3]));
    // the registered header
    const regTf = mem(); const sreg = server({ model: "m-reg" }); await X.command(["ask", "--base", "a:1", "--model", "m", "--set", "registered", "--out", "r.jsonl"], { ...regTf.io, fetch: sreg.f });
    const rr = await run({ "r.jsonl": regTf.files["r.jsonl"] }, { fly: synth });
    ok("!! a report of the registered set says 'scenarios 101 to 112' and does not call itself a DEV read", /^THE AFTER-ACTION ANALYZER: 12 pairs of the Sea OGRE \(scenarios 101 to 112\), 1 model\(s\)$/.test(rr.out[0]) && !rr.out[0].includes("DEV"));
    // the checks
    const tamper = (f) => { const ls = files.faithful.trim().split("\n"), r = f(ls.map(JSON.parse)); return r.map((x) => J(x)).join("\n") + "\n"; };
    const firstLine = async (inputs, extra) => { const r = await run(inputs, extra); return { first: r.out[0], bl: r.out.filter((l) => l.startsWith("BOTTOM LINE")), all: r.out }; };
    const missing = await firstLine({ "t.jsonl": tamper((r) => r.filter((x) => x.seed !== 3)) });
    ok("!! a transcript with a reply missing: CHECK FAILED first (the pair named), and every model's reading is THE CHECKER IS BROKEN", /^CHECK FAILED -- TRANSCRIPT \(t\.jsonl\): the transcript holds 3 replies and the set has 4 pairs$/.test(missing.first) && missing.all.some((l) => /the pair 3 has no reply/.test(l)) && missing.bl.every((l) => /THE CHECKER IS BROKEN: THE READINGS ARE NOT WEIGHED$/.test(l)) && missing.all.some((l) => l === "THE CHECKER IS BROKEN: THE READINGS ARE NOT WEIGHED"));
    const twice = await firstLine({ "t.jsonl": tamper((r) => [...r, r[1]]) }), wrongKey = await firstLine({ "t.jsonl": tamper((r) => r.map((x, i) => (i === 2 ? { ...x, key: "00000000" } : x))) });
    ok("!! a pair in the transcript twice, and a reply stored under the key of another prompt, each fail the transcript check by name", twice.all.some((l) => /a pair is in the transcript twice/.test(l)) && /^CHECK FAILED/.test(twice.first) && wrongKey.all.some((l) => /the reply of pair 2 is not stored under the key of this model/.test(l)) && /^CHECK FAILED/.test(wrongKey.first));
    const same = await firstLine({ "a.jsonl": files.faithful, "b.jsonl": files.faithful });
    ok("!! two files of the same model id fail the check (one transcript per model); two different models are two readings", same.all.some((l) => /two files are of the same model id/.test(l)) && all.out.filter((l) => l.startsWith("BOTTOM LINE (")).length === 5);
    const badTpl = await firstLine({ "t.jsonl": files.faithful }, { fly: (seed) => (seed === 2 ? { ...synth(seed), base: { ...synth(seed).base, events: [{ tick: 5, type: "loss", boat: 1, why: "sunk because of it" }] } } : synth(seed)) });
    ok("!! a TEMPLATE that does not read 1.000 (a loss whose cause word contains 'because') fails its check: the positive control is broken, the readings are not weighed", badTpl.all.some((l) => /^CHECK FAILED -- TEMPLATE: SUPPORT 0\.\d{3} and COVERAGE \d\.\d{3} \(both must read 1\.000\)$/.test(l)) && badTpl.bl.every((l) => /NOT WEIGHED$/.test(l)));
    const flat = await firstLine({ "t.jsonl": files.faithful }, { fly: () => synth(1) });
    ok("!! a SHUFFLED control that does not separate (every pair the same, so a narration of one fits the next) fails its check: 'SHUFFLED (t.jsonl): SUPPORT 1.000 against another pair's facts (must be at most 0.50)'", flat.all.some((l) => l === "CHECK FAILED -- SHUFFLED (t.jsonl): SUPPORT 1.000 against another pair's facts (must be at most 0.50)") || flat.all.some((l) => /^CHECK FAILED -- (SHUFFLED|TRANSCRIPT)/.test(l)));
    const mNext = mem(), sNext = server({ model: "model-next", script: nextPair }); await ask(mNext, sNext);
    const nextRep = await run({ "t.jsonl": mNext.files["t.jsonl"] });
    ok("!! a model that narrates the pair ONE AHEAD of each (so that the shuffled control, which grades each narration against the next pair, finds it perfectly supported) trips the SHUFFLED check by name -- 'SHUFFLED (t.jsonl): SUPPORT 1.000 ...' -- and its reading is THE CHECKER IS BROKEN: the control cannot tell this narration from the right one", nextRep.out.some((l) => l === "CHECK FAILED -- SHUFFLED (t.jsonl): SUPPORT 1.000 against another pair's facts (must be at most 0.50)") && nextRep.out.some((l) => /^BOTTOM LINE \(model-next\): THE CHECKER IS BROKEN/.test(l)));
    const mixed = mem({ "a.jsonl": files.faithful, "b.jsonl": regTf.files["r.jsonl"] }), cm = await X.command(["report", "--in", "a.jsonl", "--in", "b.jsonl"], mixed.io);
    ok("!! transcripts of two different sets are not read together: exit 1, 'one report reads one set'", cm === 1 && /one report reads one set/.test(mixed.err[0]));
    const bad1 = mem({ "a.jsonl": "{nope}\n" }), c1 = await X.command(["report", "--in", "a.jsonl"], bad1.io), bad2 = mem({ "a.jsonl": "" }), c2 = await X.command(["report", "--in", "a.jsonl"], bad2.io), bad3 = mem({ "a.jsonl": J({ kind: "afterAction-transcript", schema: 1, model: "m", params: {}, set: "held" }) + "\n" }), c3 = await X.command(["report", "--in", "a.jsonl"], bad3.io), bad4 = mem(), c4 = await X.command(["report", "--in", "missing.jsonl"], bad4.io);
    ok("!! a transcript that is not JSON (with its line), empty, of an unknown set, or missing is refused with exit 1 and its own words", c1 === 1 && bad1.err[0] === "takeAfterAction: transcript line 1 is not JSON" && c2 === 1 && bad2.err[0] === "takeAfterAction: a.jsonl is empty" && c3 === 1 && /names no known set \(dev, registered\)/.test(bad3.err[0]) && c4 === 1 && /ENOENT/.test(bad4.err[0]));
    const half = tamper((r) => r.filter((x) => x.seed !== 4)), halfOut = await run({ "t.jsonl": half });
    ok("!! the report never asks a model and never invents a reply: a pair with no reply is a failed check, not an empty narration scored as one", halfOut.out.some((l) => /the pair 4 has no reply/.test(l)) && halfOut.out[0].startsWith("CHECK FAILED"));
}

sec("4b. REPORTLINES, called directly (the flag, the determinism check, the edge of the shuffled control)");
{
    const set = "dev", pairs = X.pairsOf(set, synth), hdr = { ...A.headerOf("m-direct"), set }, ents = (replies) => pairs.map((p, i) => A.entryOf("m-direct", hdr.params, p.seed, p.prompt, replies[i]));
    const good = X.reportLines([{ name: "t", header: hdr, entries: ents(pairs.map((p) => A.templateNarration(p.facts))) }], pairs, set);
    ok("!! `failed` is false when every check holds and true when one fails (the command prints the lines and reads this flag nowhere else: it is the report's own account)", good.failed === false && good.lines.some((l) => /FAITHFUL AND COMPLETE/.test(l)) && X.reportLines([{ name: "t", header: hdr, entries: ents(pairs.map((p) => A.templateNarration(p.facts))).slice(1) }], pairs, set).failed === true);
    const drift = pairs.map((p, i) => (i === 1 ? { ...p, facts: p.facts.map((f, j) => (j === 0 ? { ...f, text: f.text + " " } : f)) } : p)), dr = X.reportLines([{ name: "t", header: hdr, entries: ents(pairs.map((p) => A.templateNarration(p.facts))) }], drift, set);
    ok("!! the facts check: facts that are not what a fresh generation gives (here one fact of one pair altered) fail it by name, 'FACTS: two generations of a pair are not identical', and the checks line says FAILED", dr.failed === true && dr.lines.some((l) => l === "CHECK FAILED -- FACTS: two generations of a pair are not identical") && dr.lines.some((l) => /FACTS deterministic FAILED/.test(l)));
    // the shuffled control exactly at its ceiling: two pairs, each reply = the OTHER pair's template with half its lines spoiled (a number changed), so that against the other pair half the lines are supported
    const spoil = (text, keep) => text.split("\n").map((l, i) => (i < keep ? l : l.replace(/\d+(\.\d+)?/, (x) => String(Number(x) + 7)))).join("\n");
    const two = pairs.slice(0, 2), nS = (i) => A.salientOf(two[i].facts).length, half = (i) => Math.floor(nS(i) / 2);
    const at = (kept) => X.reportLines([{ name: "t", header: hdr, entries: [A.entryOf("m-direct", hdr.params, two[0].seed, two[0].prompt, spoil(A.templateNarration(two[1].facts), kept[0])), A.entryOf("m-direct", hdr.params, two[1].seed, two[1].prompt, spoil(A.templateNarration(two[0].facts), kept[1]))] }], two, set);
    const exact = at([half(1), half(0)]), shf = (r) => r.lines.find((l) => /^  checks:/.test(l));
    ok("!! the shuffled ceiling is 'at most 0.50': a shuffle that reads EXACTLY 0.500 passes the check (the line says SHUFFLED t 0.500), one hair above (one more supported line) fails it by name", /SHUFFLED t 0\.500/.test(shf(exact)) && !exact.lines.some((l) => /^CHECK FAILED -- SHUFFLED/.test(l)) && nS(0) % 2 === 0 && nS(1) % 2 === 0 && at([half(1) + 1, half(0)]).lines.some((l) => /^CHECK FAILED -- SHUFFLED \(t\): SUPPORT 0\.5\d\d against another pair's facts \(must be at most 0\.50\)$/.test(l)));
}

sec("5. REAL FIGHTS (the default flights, four DEV pairs)");
{
    const m = mem(); delete m.io.fly;
    const c = await X.command(["facts", "--set", "dev"], m.io), ps = A.seedsOf("dev").map((s) => A.factsOf(A.flyPair(s)));
    ok("!! `facts` on the real DEV pairs prints the facts of the real fights (the same as factsOf of a flown pair), 4 pairs", c === 0 && m.out.filter((l) => /^PAIR \d+:/.test(l)).length === 4 && ps.every((f, i) => f.every((x) => m.out.includes("  " + A.lineOf(x) + (x.salient ? "   [salient]" : "")))));
    const mA = mem(); delete mA.io.fly;
    const realPairs = X.pairsOf("dev"), byPrompt = new Map(realPairs.map((p) => [p.prompt, p]));
    const f = async (url, init = {}) => { if (init.method === "GET") return { ok: true, status: 200, json: async () => ({ data: [{ id: "real-faithful" }] }) }; const prompt = JSON.parse(init.body).messages[0].content, p = byPrompt.get(prompt); return { ok: true, status: 200, text: async () => `data: ${J({ choices: [{ delta: { content: A.templateNarration(p.facts) } }] })}\n\ndata: [DONE]\n\n` }; };
    const cA = await X.command(["ask", "--base", "a:1", "--model", "m", "--set", "dev", "--out", "t.jsonl"], { ...mA.io, fetch: f });
    const cR = await X.command(["report", "--in", "t.jsonl"], mA.io);
    ok("!! end to end on the REAL fights with a faithful scripted model: ask writes a whole transcript (the prompts of the real pairs), the report finds the checks hold and reads FAITHFUL AND COMPLETE with FORMAT, SUPPORT and COVERAGE 1.000", cA === 0 && cR === 0 && mA.out.some((l) => l === "BOTTOM LINE (real-faithful): FAITHFUL AND COMPLETE") && mA.out.some((l) => /FORMAT 1\.000  SUPPORT 1\.000  COVERAGE 1\.000/.test(l)) && !mA.out.some((l) => /^CHECK FAILED/.test(l)));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exit(fails ? 1 : 0);
