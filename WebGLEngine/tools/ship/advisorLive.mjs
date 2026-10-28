// WebGLEngine/tools/ship/advisorLive.mjs -- UNNUMBERED (the version is chosen at ship time) (the library; the command is tools/ship/advisorLiveCmd.mjs; the gate is tools/ship/advisorLive-selfcheck.mjs)
//
// THE LIVE ADAPTER OF THE LANGUAGE-MODEL CHIP (Keith, 2026-10-28: "build it"). brain/advisorTranscript.mjs is the recorded-decision seat: it renders what the pilot sees as a prompt and asks `modelFn(prompt) -> reply` once per situation, then replays the transcript without a model. THIS FILE
// supplies a `modelFn` that reaches a real model, and a command that records a transcript with it on PRACTICE dives and replays it. Run it on YOUR machine, with YOUR model and key; nothing in the graded path ever calls a model, and nothing in this tree calls one by itself.
//   modelFn FROM A COMMAND   `--cmd "claude -p --model <id>"`: the command is run WITHOUT a shell (the words are split here, the prompt goes in on stdin, the reply is stdout), so a prompt cannot inject anything; non-zero exit, a timeout or a missing command THROW (a failed call is never an empty answer).
//   modelFn FROM THE API     `--api`: the Messages API of Anthropic, called from a child node process (the seat is synchronous, a fetch is not) with the key read from ANTHROPIC_API_KEY in the environment ONLY: never an argument, never written to a transcript, a log or an error message.
// THE GUARDS (each a gate row): the dives may not be a seed any registered audit uses or any seed reserved for the language-model audit (Round 3's, Round 4's, and 171-222); the expected number of calls is printed first and `--dry-run` stops there; `--max-calls` (default 200) is a hard ceiling checked BEFORE
// each call; every paid answer is appended to a calls log the moment it arrives, so a killed run is resumed from it and pays nothing twice.
// This file does not decide how good a model's advice is: it scores a practice run with the brain alone beside it and says so. The registered language-model audit is a later round and its seeds are not touched here.
"use strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import * as T from "../../brain/needsTask.mjs";
import * as A from "../../brain/advisorChip.mjs";
import * as X from "../../brain/advisorTranscript.mjs";

export const DEFAULT_MAX_CALLS = 200, DEFAULT_EVERY = 300, DEFAULT_TIMEOUT_MS = 120000, DEFAULT_MAX_TOKENS = 200;
export const API = Object.freeze({ base: "https://api.anthropic.com", path: "/v1/messages", version: "2023-06-01", keyEnv: "ANTHROPIC_API_KEY" });
export const DIVE_KINDS = T.KINDS;
export const PRACTICE_SEEDS = Object.freeze([501, 502, 503, 504, 505, 506, 507, 508]);

/** Every seed a registered audit uses or the language-model audit has reserved: a practice dive may not be one of them. */
export const FORBIDDEN_SEEDS = (() => {
    const s = new Set();
    for (const set of [T.AUDIT_SET, T.AUDIT2_SET, T.RESERVE_SET, ...Object.values(A.ADV_AUDITS)]) for (const sc of set) s.add(sc.seed);
    for (const [a, b] of A.RESERVED_LLM) for (let i = a; i <= b; i++) s.add(i);
    return Object.freeze(s);
})();

/** A command line split into words by the rules of a plain shell without the shell: spaces separate, single and double quotes group, a backslash escapes one character; no expansion, no pipe, no redirect, no variable. */
export function splitCommand(text) {
    const out = []; let cur = "", q = null, has = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) { if (c === q) q = null; else if (c === "\\" && q === '"' && i + 1 < text.length) cur += text[++i]; else cur += c; continue; }
        if (c === '"' || c === "'") { q = c; has = true; continue; }
        if (c === "\\" && i + 1 < text.length) { cur += text[++i]; has = true; continue; }
        if (/\s/.test(c)) { if (has || cur) { out.push(cur); cur = ""; has = false; } continue; }
        cur += c; has = true;
    }
    if (q) throw new Error("advisorLive.splitCommand: an unclosed quote");
    if (has || cur) out.push(cur);
    return out;
}
/** Remove any secret from a message before it is shown or kept: the value of the key variable (when set) and anything shaped like an API key. */
export function scrub(text, env = process.env) {
    let s = String(text); const k = env[API.keyEnv];
    if (k && k.length >= 8) s = s.split(k).join("[key]");
    return s.replace(/sk-[A-Za-z0-9_-]{8,}/g, "[key]");
}

/** modelFn from a command: (prompt) -> the command's stdout. The prompt goes to stdin; no shell. Throws on a spawn error, a timeout, a non-zero exit or empty output (with scrubbed stderr). */
export function modelFnFromCommand({ command, timeoutMs = DEFAULT_TIMEOUT_MS, spawn = spawnSync, env = process.env }) {
    const words = splitCommand(command); if (!words.length) throw new Error("advisorLive.modelFnFromCommand: an empty command");
    return (prompt) => {
        const r = spawn(words[0], words.slice(1), { input: prompt, encoding: "utf8", timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, shell: false, env });
        if (r.error) throw new Error(`advisorLive: the model command failed to run (${scrub(r.error.code || r.error.message, env)})`);
        if (r.status !== 0) throw new Error(`advisorLive: the model command exited ${r.status}${r.signal ? " (signal " + r.signal + ")" : ""}: ${scrub(String(r.stderr || "").slice(0, 300), env)}`);
        const out = String(r.stdout || ""); if (!out.trim()) throw new Error("advisorLive: the model command answered nothing");
        return out;
    };
}

/** The Messages API request for one prompt (pure): { url, headers (without the key), body }. temperature 0, one user message. */
export function anthropicRequest({ model, prompt, maxTokens = DEFAULT_MAX_TOKENS, baseUrl = API.base, temperature = 0 }) {
    if (!model) throw new Error("advisorLive.anthropicRequest: a model id is required");
    return { url: baseUrl.replace(/\/+$/, "") + API.path, headers: { "content-type": "application/json", "anthropic-version": API.version }, body: { model, max_tokens: maxTokens, temperature, messages: [{ role: "user", content: prompt }] } };
}
/** The text of a Messages API response body (a json string or object): every text block joined; throws on an error body or no text. */
export function extractReplyText(body) {
    const j = typeof body === "string" ? JSON.parse(body) : body;
    if (j && j.type === "error") throw new Error(`advisorLive: the API answered an error (${j.error && j.error.type}: ${j.error && j.error.message})`);
    const t = (j && Array.isArray(j.content) ? j.content : []).filter((b) => b && b.type === "text").map((b) => b.text).join("");
    if (!t.trim()) throw new Error("advisorLive: the API answered no text");
    return t;
}
// the child process that does the (asynchronous) call for the synchronous seat: it reads { url, headers, body } from stdin, takes the key from ITS ENVIRONMENT, prints the response body, and exits non-zero on any http status but 200
const CHILD = 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",async()=>{try{const r=JSON.parse(s),k=process.env[r.keyEnv];if(!k){console.error("no key in "+r.keyEnv);process.exit(3)}const x=await fetch(r.url,{method:"POST",headers:{...r.headers,"x-api-key":k},body:JSON.stringify(r.body)});const t=await x.text();if(x.status!==200){console.error("http "+x.status+": "+t.slice(0,300));process.exit(4)}process.stdout.write(t)}catch(e){console.error(String(e&&e.message||e));process.exit(5)}});';
/** modelFn from the API: (prompt) -> the reply text, via a child node process. The key must be in the environment (checked before the first call). */
export function modelFnFromApi({ model, maxTokens = DEFAULT_MAX_TOKENS, baseUrl = API.base, temperature = 0, timeoutMs = DEFAULT_TIMEOUT_MS, spawn = spawnSync, env = process.env, node = process.execPath }) {
    if (!env[API.keyEnv]) throw new Error(`advisorLive.modelFnFromApi: ${API.keyEnv} is not set in the environment (the key is read from there only)`);
    return (prompt) => {
        const req = anthropicRequest({ model, prompt, maxTokens, baseUrl, temperature });
        const r = spawn(node, ["-e", CHILD], { input: JSON.stringify({ ...req, keyEnv: API.keyEnv }), encoding: "utf8", timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, shell: false, env });
        if (r.error) throw new Error(`advisorLive: the API call failed to run (${scrub(r.error.code || r.error.message, env)})`);
        if (r.status !== 0) throw new Error(`advisorLive: the API call exited ${r.status}: ${scrub(String(r.stderr || "").slice(0, 300), env)}`);
        return extractReplyText(String(r.stdout));
    };
}

// ---- the guards and the plan -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
export class CallBudgetExceeded extends Error { constructor(max) { super(`advisorLive: the call budget of ${max} is spent (--max-calls); nothing was called beyond it`); this.max = max; } }
/** The dives of a practice run: kinds x seeds, refusing any forbidden seed. */
export function divesOf(kinds, seeds) {
    const bad = seeds.filter((s) => FORBIDDEN_SEEDS.has(s)); if (bad.length) throw new Error(`advisorLive: seed ${bad.join(", ")} belongs to a registered audit or is reserved for the language-model audit; a practice dive may not use it`);
    for (const k of kinds) if (!DIVE_KINDS.includes(k)) throw new Error(`advisorLive: kind ${JSON.stringify(k)} (${DIVE_KINDS.join(", ")})`);
    return kinds.flatMap((k) => seeds.map((s) => T.scenario(s, k)));
}
/** The most model calls a run can make: one per `every` ticks of every dive (a dive is T.SECONDS / T.DT ticks), before any repeated situation is spared. */
export const maxCalls = (dives, every) => dives * Math.ceil(T.SECONDS / T.DT / every);
/** `a-b` and `a,b,c` seed lists; a bad one throws. */
export function parseSeeds(text) {
    const out = [];
    for (const part of String(text).split(",")) {
        const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim()); if (!m) throw new Error(`advisorLive.parseSeeds: cannot read ${JSON.stringify(part)}`);
        const lo = Number(m[1]), hi = m[2] === undefined ? lo : Number(m[2]); if (hi < lo) throw new Error(`advisorLive.parseSeeds: ${JSON.stringify(part)} runs backwards`);
        for (let i = lo; i <= hi; i++) out.push(i);
    }
    return out;
}

// ---- recording and replaying ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** A model function that spends a budget, remembers every answer by prompt (so a repeated prompt is free and a resumed run pays nothing twice) and tells `onNew(prompt, reply)` about each new one at once. */
export function budgeted(modelFn, { maxCalls: max = DEFAULT_MAX_CALLS, cache = new Map(), onNew = () => {} } = {}) {
    const state = { calls: 0, hits: 0 };
    const fn = (prompt) => {
        if (cache.has(prompt)) { state.hits++; return cache.get(prompt); }
        if (state.calls >= max) throw new CallBudgetExceeded(max);
        const reply = String(modelFn(prompt)); state.calls++; cache.set(prompt, reply); onNew(prompt, reply); return reply;
    };
    Object.defineProperty(fn, "state", { get: () => state });
    return fn;
}
const brainSeat = T.ruleSeat("obs");   // the untrained circuit IS this rule (Round 3's start identity): no stage A is needed to try a model
/** Fly each dive with the brain alone and with the brain advised by the model's seat in record mode. Returns { rows: [{ kind, seed, alone, advised, stats }], transcript }. */
export function recordRun({ dives, modelFn, model, every, mode = "VETO", gauge = T.GAUGE, transcript = null }) {
    const tr = transcript || X.createTranscript({ model, every }), rows = [];
    for (const sc of dives) {
        const alone = T.fly(T.GUARDED_OBS, sc, { gauge });
        let pilot = null; const adv = T.fly((ctx) => (pilot = A.advisedPilot(brainSeat, X.llmSeat({ transcript: tr, mode: "record", modelFn }), mode)(ctx)), sc, { gauge });
        rows.push({ kind: sc.kind, seed: sc.seed, alone: alone.score, advised: adv.score, aloneCrushed: !!alone.crushed, advisedCrushed: !!adv.crushed, stats: pilot.stats });
    }
    return { rows, transcript: tr };
}
/** The same dives replayed from a transcript: no model is called (a missing situation throws TranscriptMiss). */
export function replayRun({ dives, transcript, mode = "VETO", gauge = T.GAUGE }) {
    const rows = [];
    for (const sc of dives) {
        const alone = T.fly(T.GUARDED_OBS, sc, { gauge });
        const adv = T.fly(A.advisedPilot(brainSeat, X.llmSeat({ transcript, mode: "replay" }), mode), sc, { gauge });
        rows.push({ kind: sc.kind, seed: sc.seed, alone: alone.score, advised: adv.score, aloneCrushed: !!alone.crushed, advisedCrushed: !!adv.crushed });
    }
    return { rows };
}
const f3 = (v) => v.toFixed(3);
export function runLines(rows, { calls = null } = {}) {
    const L = rows.map((r) => `  ${r.kind.padEnd(5)} ${r.seed}  brain alone ${f3(r.alone)}${r.aloneCrushed ? " (crushed)" : ""}  advised ${f3(r.advised)}${r.advisedCrushed ? " (crushed)" : ""}${r.stats && r.stats.surface ? `  (the advice overrode the surface decision on ${r.stats.surface} of ${r.stats.ticks} ticks)` : ""}`);
    const m = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
    L.push(`  mean over ${rows.length} practice dives: brain alone ${f3(m("alone"))}, advised ${f3(m("advised"))}${calls !== null ? `; model calls ${calls.calls}, repeated or resumed situations ${calls.hits}` : ""}`);
    L.push("  A PRACTICE RUN: a handful of dives off every registered audit. It says whether the loop works and what a model does on these dives; it is not the language-model audit (a later round, with its own registration and the reserved seeds).");
    return L;
}

// ---- the command ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    if (cmd !== "record" && cmd !== "replay") throw new Error(`the first word must be record or replay, got ${JSON.stringify(cmd)}`);
    const known = { record: { "model-id": String, params: String, cmd: String, api: Boolean, "api-base": String, "max-tokens": Number, seeds: String, kinds: String, every: Number, "max-calls": Number, out: String, mode: String, timeout: Number, "dry-run": Boolean }, replay: { in: String, seeds: String, kinds: String, mode: String } }[cmd], given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known for ${cmd}: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = rest[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    const seeds = parseSeeds(given.seeds || "501-503"), kinds = (given.kinds || "far,both").split(",").map((s) => s.trim()), mode = given.mode || "VETO";
    if (!A.MODES.includes(mode) || mode === "ALONE") throw new Error(`--mode must be one of ${A.MODES.filter((m) => m !== "ALONE").join(", ")}`);
    if (cmd === "replay") { if (!given.in) throw new Error("replay needs --in <transcript>"); return { cmd, in: given.in, seeds, kinds, mode }; }
    if (!given.out && !given["dry-run"]) throw new Error("record needs --out <transcript file> (a --dry-run does not)");
    if (!given["model-id"]) throw new Error("record needs --model-id (it is written into the transcript and is part of every key)");
    if (!!given.cmd === !!given.api) throw new Error("record needs exactly one of --cmd \"<command>\" or --api");
    let params = {}; if (given.params) { try { params = JSON.parse(given.params); } catch { throw new Error("--params must be a json object"); } if (!params || typeof params !== "object" || Array.isArray(params)) throw new Error("--params must be a json object"); }
    const every = given.every ?? DEFAULT_EVERY, max = given["max-calls"] ?? DEFAULT_MAX_CALLS;
    if (!(Number.isInteger(every) && every >= 1)) throw new Error("--every must be a whole number of ticks of 1 or more");
    if (!(Number.isInteger(max) && max >= 1)) throw new Error("--max-calls must be a whole number of 1 or more");
    return { cmd, out: given.out || null, modelId: given["model-id"], params, command: given.cmd || null, api: !!given.api, apiBase: given["api-base"] || API.base, maxTokens: given["max-tokens"] ?? DEFAULT_MAX_TOKENS, seeds, kinds, every, maxCalls: max, mode, timeoutMs: given.timeout ?? DEFAULT_TIMEOUT_MS, dryRun: !!given["dry-run"] };
}
/**
 * THE COMMAND, as a function. record: refuses a forbidden seed, prints the expected number of calls and the ceiling (and stops there with --dry-run), builds the model function (from --cmd or --api), resumes from `<out>.calls.jsonl`, appends every new answer to it at once, flies the dives
 * (the brain alone and the brain advised), writes the transcript to --out and prints the rows. replay: flies the same dives from a transcript with no model. `io`: { out, err, readFile, writeFile, appendFile, exists, makeModelFn (for the gate) }.
 */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(f, "utf8")), writeFile = io.writeFile || fs.writeFileSync, appendFile = io.appendFile || fs.appendFileSync, exists = io.exists || fs.existsSync;
    let o; try { o = parseArgs(argv); } catch (e) { err("advisorLive: " + e.message); return 2; }
    let dives; try { dives = divesOf(o.kinds, o.seeds); } catch (e) { err(e.message); return 1; }
    if (o.cmd === "replay") {
        let tr; try { tr = X.parseTranscript(readFile(o.in)); } catch (e) { err("advisorLive: " + e.message); return 1; }
        let run; try { run = replayRun({ dives, transcript: tr, mode: o.mode }); } catch (e) { err("advisorLive: " + e.message); return 1; }
        for (const l of runLines(run.rows, { calls: { calls: 0, hits: 0 } })) out(l);
        return 0;
    }
    const expected = maxCalls(dives.length, o.every);
    out(`[advisorLive] ${dives.length} practice dives (${o.kinds.join(", ")} x seeds ${o.seeds.join(", ")}); the model is asked every ${o.every} ticks: at most ${expected} calls (repeated situations are spared); the ceiling is ${o.maxCalls}${expected > o.maxCalls ? " -- LOWER than the most it could make: the run will stop with a partial calls log if it reaches it" : ""}`);
    if (o.dryRun) { out("[advisorLive] --dry-run: nothing was called"); return 0; }
    if (exists(o.out)) { err(`advisorLive: ${o.out} already exists; a transcript is not overwritten (move it or choose another --out)`); return 1; }
    const callsFile = o.out + ".calls.jsonl", cache = new Map();
    if (exists(callsFile)) { for (const l of String(readFile(callsFile)).split("\n").filter(Boolean)) { try { const e = JSON.parse(l); cache.set(e.prompt, e.reply); } catch { err(`advisorLive: ${callsFile} has a line that is not json`); return 1; } } out(`[advisorLive] resuming: ${cache.size} answers already paid for in ${callsFile}`); }
    let raw; try { raw = (io.makeModelFn || ((a) => (a.api ? modelFnFromApi({ model: a.modelId, maxTokens: a.maxTokens, baseUrl: a.apiBase, timeoutMs: a.timeoutMs, temperature: a.params.temperature ?? 0 }) : modelFnFromCommand({ command: a.command, timeoutMs: a.timeoutMs }))))(o); } catch (e) { err("advisorLive: " + scrub(e.message)); return 1; }
    const fn = budgeted(raw, { maxCalls: o.maxCalls, cache, onNew: (prompt, reply) => appendFile(callsFile, JSON.stringify({ prompt, reply }) + "\n") });
    let res; try { res = recordRun({ dives, modelFn: fn, model: { id: o.modelId, params: o.params }, every: o.every, mode: o.mode }); } catch (e) { err("advisorLive: " + scrub(e.message) + (fn.state.calls ? ` (${fn.state.calls} answers are saved in ${callsFile}; run the same command again to resume)` : "")); return 1; }
    writeFile(o.out, X.serialize(res.transcript));
    for (const l of runLines(res.rows, { calls: fn.state })) out(l);
    out(`[advisorLive] transcript written to ${o.out} (${res.transcript.entries.size} situations); replay it with: advisorLiveCmd.mjs replay --in ${o.out} --seeds ${o.seeds.join(",")} --kinds ${o.kinds.join(",")}`);
    return 0;
}
