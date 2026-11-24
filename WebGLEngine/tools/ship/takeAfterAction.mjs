// WebGLEngine/tools/ship/takeAfterAction.mjs -- UNNUMBERED (the version is chosen at ship time) (the command line is tools/ship/takeAfterActionCmd.mjs; the material and the checker are brain/afterAction.mjs; the registration is brain/AFTER_ACTION_WIP.md; the gate is tools/ship/takeAfterAction-selfcheck.mjs)
//
// THE COMMANDS OF THE AFTER-ACTION ANALYZER (registered before any of this was written and before any model was asked anything):
//   facts   --set dev|registered [--out file]      flies the pairs of the set (the Sea OGRE, three defenders, without and with the three countermeasures) and prints their numbered facts and the hash of each prompt; with --out writes them as JSON lines.
//   ask     --base <host:port> --key <key> --model <id> --set dev|registered --out <file>
//                                                  asks the model ONCE per pair (temperature 0, 600 tokens, no retries) through ui/privateLmClient.mjs `chatStream` (the cross-platform LLM client, PrivateLM, or any OpenAI-compatible server: the same command runs against a phone and against a model on the rig), and records the transcript: a header (the model id AS THE SERVER REPORTS IT by GET /v1/models, the id asked for, the parameters, the set) and one line a reply under the key
//                                                  of (model, parameters, prompt). RESUMABLE: a pair already in the file is not asked again; a reply that did not arrive whole (a transport error, an interrupted stream, an empty text) is NOT recorded and stops the run (re-run the same command to go on).
//   report  --in <file> [--in <file> ...]          OFFLINE (never asks a model, never invents an answer): the checks first (the facts are deterministic, the TEMPLATE narrator reads SUPPORT 1.000 and COVERAGE 1.000, the SHUFFLED control reads at most 0.50 for every model, every transcript is whole), then per model FORMAT, SUPPORT, COVERAGE, the narrations under 0.75, the mean words against the template's, the lines per narration, which kinds of line failed, and the
//                                                  bottom line (the first that applies of the five registered readings).
// The key goes into a request header and nowhere else (never into the transcript or a message). The server address is whatever the owner gives; this file reaches no host by itself. A library: the network, the files and the flights are seams `io` gives.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "../../brain/afterAction.mjs";
import { chatStream, normalizeBase, headersFor } from "../../ui/privateLmClient.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const SET_NAMES = Object.freeze(Object.keys(A.SETS));

/** The pairs of a set with their facts and prompts: [{ seed, pair, facts, prompt }]. `fly` is the seam (default: the real fights). */
export function pairsOf(set, fly = A.flyPair) {
    return A.seedsOf(set).map((seed) => { const pair = fly(seed), facts = A.factsOf(pair); return { seed, pair, facts, prompt: A.promptOf(facts) }; });
}
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : String(x));

// ---- the model -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The model id the server reports (GET /v1/models, the first model's id), or null when it cannot say. */
export async function reportedModel(base, key, f) {
    const b = normalizeBase(base); if (!b) return null;
    try { const r = await f(b + "/v1/models", { method: "GET", headers: headersFor(key, false) }); if (!r.ok) return null; const j = await r.json(); const m = j && (Array.isArray(j.data) ? j.data[0] : Array.isArray(j.models) ? j.models[0] : null); return m && (m.id || m.name) ? String(m.id || m.name) : null; } catch (e) { return null; }
}
/** One ask: the prompt as the only user message, temperature 0 (put into the request by wrapping the fetch: chatStream does not send one), 600 tokens. Returns { ok, text, error }. */
export async function askOnce(base, key, prompt, f, { model = "" } = {}) {
    const fT = (url, init) => f(url, init && typeof init.body === "string" ? { ...init, body: JSON.stringify({ ...JSON.parse(init.body), temperature: A.MODEL_PARAMS.temperature }) } : init);
    const r = await chatStream(base, key, [{ role: "user", content: prompt }], fT, { model, maxTokens: A.MODEL_PARAMS.max_tokens });
    if (!r.ok) return { ok: false, text: "", error: r.interrupted ? "the generation was interrupted (a partial answer is not recorded): " + r.error : r.error };
    if (!r.text.trim()) return { ok: false, text: "", error: "the model returned no text" };
    return { ok: true, text: r.text, error: "" };
}

// ---- the transcript file ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** A transcript file read: { header, entries }. A line that is not JSON is refused with its number; the first line is the header. */
export function readTranscript(text) {
    const lines = String(text).split("\n").filter((l) => l.trim()), recs = lines.map((l, i) => { try { return JSON.parse(l); } catch (e) { throw new Error(`transcript line ${i + 1} is not JSON`); } });
    return { header: recs[0] || null, entries: recs.slice(1) };
}

// ---- the report ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The report lines for transcripts of ONE set: `tfs` = [{ name, header, entries }], `pairs` = pairsOf(set). Returns { lines, failed }. */
export function reportLines(tfs, pairs, set) {
    const L = [], bad = [], entriesOf = (tf) => pairs.map((p) => { const e = tf.entries.find((x) => x.seed === p.seed); return { facts: p.facts, reply: e ? e.reply : "", have: !!e }; });
    const expected = pairs.map((p) => ({ seed: p.seed, prompt: p.prompt }));
    // (1) the facts are deterministic
    const again = pairs.map((p) => A.factsOf(p.pair)), same = pairs.every((p, i) => JSON.stringify(p.facts) === JSON.stringify(again[i]));
    if (!same) bad.push("FACTS: two generations of a pair are not identical");
    // (2) the template narrator
    const tpl = A.measuresOf(pairs.map((p) => ({ facts: p.facts, reply: A.templateNarration(p.facts) })));
    if (!(tpl.support === 1 && tpl.coverage === 1)) bad.push(`TEMPLATE: SUPPORT ${f3(tpl.support)} and COVERAGE ${f3(tpl.coverage)} (both must read 1.000)`);
    // (3) the shuffled control, (4) the transcripts
    const per = tfs.map((tf) => {
        const ents = entriesOf(tf), sh = A.shuffledSupport(ents), tc = A.transcriptChecks(tf.header, tf.entries, expected);
        if (sh > A.SHUFFLED_CEILING) bad.push(`SHUFFLED (${tf.name}): SUPPORT ${f3(sh)} against another pair's facts (must be at most ${A.SHUFFLED_CEILING.toFixed(2)})`);
        for (const x of tc) bad.push(`TRANSCRIPT (${tf.name}): ${x}`);
        return { tf, ents, sh, tc, m: A.measuresOf(ents.filter((e) => e.have)) };
    });
    const models = tfs.map((t) => t.header && t.header.model);
    if (new Set(models).size !== models.length) bad.push("TRANSCRIPT: two files are of the same model id (one transcript per model)");
    if (bad.length) { for (const b of bad) L.push("CHECK FAILED -- " + b); L.push("THE CHECKER IS BROKEN: THE READINGS ARE NOT WEIGHED"); }
    L.push(`THE AFTER-ACTION ANALYZER: ${pairs.length} pairs of the Sea OGRE (${set === "registered" ? "scenarios " + A.SETS.registered.first + " to " + (A.SETS.registered.first + A.SETS.registered.count - 1) : "DEV scenarios " + A.SETS.dev.first + " to " + (A.SETS.dev.first + A.SETS.dev.count - 1) + " -- prompt development, NOT the registered read"}), ${tfs.length} model(s)`);
    L.push(`  checks: FACTS deterministic ${same ? "ok" : "FAILED"}; TEMPLATE SUPPORT ${f3(tpl.support)} COVERAGE ${f3(tpl.coverage)}; SHUFFLED ${per.map((p) => `${p.tf.name} ${f3(p.sh)}`).join(", ") || "(no model)"}; TRANSCRIPTS ${per.every((p) => p.tc.length === 0) ? "whole" : "NOT WHOLE"}`);
    L.push(`  TEMPLATE (the control): ${tpl.words.toFixed(1)} words and ${tpl.linesPer.toFixed(1)} lines a narration`);
    for (const p of per) {
        const m = p.m, reading = A.readingOf(m, bad.length === 0), k = m.kinds, name = p.tf.header ? p.tf.header.model : p.tf.name;
        L.push(`  ${name}: FORMAT ${f3(m.format)}  SUPPORT ${f3(m.support)}  COVERAGE ${f3(m.coverage)}  narrations under 0.75: ${m.under} of ${m.narrations}  words ${m.words.toFixed(1)} (template ${tpl.words.toFixed(1)})  lines ${m.linesPer.toFixed(1)}`);
        L.push(`    lines that failed, by kind: no ids ${k.noids}, an id that does not exist ${k.id}, a number not in the facts ${k.number}, a causal word ${k.causal}, a run mismatch ${k.run} (a line can fail in several ways)`);
        L.push(`BOTTOM LINE (${name}): ${reading}`);
    }
    L.push("Limits of the checker, said plainly: number WORDS (\"two\") are not checked, and polarity beyond the run label is not checked; whether the prose is better than the template's is a human judgment this report prints the means to make (words, lines) and does not decide.");
    return { lines: L, failed: bad.length > 0 };
}

// ---- the command -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    if (cmd !== "facts" && cmd !== "ask" && cmd !== "report") throw new Error(`the first word must be facts, ask or report, got ${JSON.stringify(cmd)}`);
    const known = cmd === "facts" ? { set: String, out: String } : cmd === "ask" ? { base: String, key: String, model: String, set: String, out: String } : { in: String }, given = {}, ins = [];
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known for ${cmd}: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        const v = rest[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`);
        if (k === "in") ins.push(v); else given[k] = v;
    }
    if (cmd === "report") { if (!ins.length) throw new Error("report needs --in <transcript file> (once per model)"); if (new Set(ins).size !== ins.length) throw new Error("a transcript file is named twice"); return { cmd, ins }; }
    if (!given.set) throw new Error(`${cmd} needs --set ${SET_NAMES.join("|")}`);
    if (!SET_NAMES.includes(given.set)) throw new Error(`unknown set ${JSON.stringify(given.set)} (${SET_NAMES.join(", ")})`);
    if (cmd === "facts") return { cmd, set: given.set, out: given.out || null };
    for (const need of ["base", "model", "out"]) if (!given[need]) throw new Error(`ask needs --${need}${need === "base" ? " <host:port>" : need === "model" ? " <model id>" : " <transcript file>"}`);
    if (!normalizeBase(given.base)) throw new Error(`--base ${JSON.stringify(given.base)} is not an address (host:port or http://host:port)`);
    return { cmd, set: given.set, base: given.base, key: given.key || "", model: given.model, out: given.out };
}
/** THE COMMAND as a function. Returns 0, 1 (a refusal, or a reply that did not arrive) or 2 (a bad argument). `io`: { out, err, readFile, appendFile, writeFile, exists, fetch, fly }. */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(path.resolve(ENG, f), "utf8")), appendFile = io.appendFile || ((f, t) => fs.appendFileSync(path.resolve(ENG, f), t)), writeFile = io.writeFile || ((f, t) => fs.writeFileSync(path.resolve(ENG, f), t)), exists = io.exists || ((f) => fs.existsSync(path.resolve(ENG, f)));
    let o; try { o = parseArgs(argv); } catch (e) { err("takeAfterAction: " + e.message); return 2; }
    if (o.cmd === "facts") {
        const ps = pairsOf(o.set, io.fly || A.flyPair);
        for (const p of ps) { out(`PAIR ${p.seed}: ${p.facts.length} facts, ${A.salientOf(p.facts).length} salient, prompt ${A.hashOf(p.prompt)}`); for (const f of p.facts) out("  " + A.lineOf(f) + (f.salient ? "   [salient]" : "")); }
        if (o.out) writeFile(o.out, ps.map((p) => JSON.stringify({ seed: p.seed, facts: p.facts, prompt: p.prompt, promptHash: A.hashOf(p.prompt) })).join("\n") + "\n");
        return 0;
    }
    if (o.cmd === "report") {
        const tfs = []; let set = null, pairs = null;
        for (const f of o.ins) {
            let tf; try { tf = { name: f, ...readTranscript(readFile(f)) }; } catch (e) { err("takeAfterAction: " + e.message); return 1; }
            if (!tf.header) { err(`takeAfterAction: ${f} is empty`); return 1; }
            if (!A.SETS[tf.header.set]) { err(`takeAfterAction: ${f} names no known set (${SET_NAMES.join(", ")})`); return 1; }
            if (set && tf.header.set !== set) { err("takeAfterAction: the transcripts are of different sets: one report reads one set"); return 1; }
            set = tf.header.set; tfs.push(tf);
        }
        pairs = pairsOf(set, io.fly || A.flyPair);
        const r = reportLines(tfs, pairs, set); for (const l of r.lines) out(l);
        return 0;
    }
    // ask
    const f = io.fetch || (typeof fetch === "function" ? fetch : null); if (!f) { err("takeAfterAction: no fetch in this runtime"); return 1; }
    let header = null, entries = [];
    if (exists(o.out)) {
        try { const tf = readTranscript(readFile(o.out)); header = tf.header; entries = tf.entries; } catch (e) { err("takeAfterAction: " + e.message); return 1; }
        if (!header || header.kind !== "afterAction-transcript") { err(`takeAfterAction: ${o.out} is not an after-action transcript`); return 1; }
        if (header.set !== o.set) { err(`takeAfterAction: ${o.out} is a transcript of the ${header.set} set and this run is of the ${o.set} set: it is not mixed -- use another --out`); return 1; }
    }
    const reported = await reportedModel(o.base, o.key, f);
    if (header && reported && reported !== header.model) { err(`takeAfterAction: the server reports the model ${JSON.stringify(reported)} and ${o.out} is a transcript of ${JSON.stringify(header.model)}: one transcript is one model`); return 1; }
    if (!header) { header = { ...A.headerOf(reported || o.model), set: o.set, requested: o.model }; writeFile(o.out, JSON.stringify(header) + "\n"); }
    const ps = pairsOf(o.set, io.fly || A.flyPair), have = new Set(entries.map((e) => e.seed)), todo = ps.filter((p) => !have.has(p.seed));
    out(`[takeAfterAction] model ${header.model} (asked for ${JSON.stringify(o.model)}); ${ps.length} pairs of the ${o.set} set, ${ps.length - todo.length} already in ${o.out}, ${todo.length} to ask; temperature ${A.MODEL_PARAMS.temperature}, ${A.MODEL_PARAMS.max_tokens} tokens, one ask a pair, no retries`);
    for (const p of todo) {
        const r = await askOnce(o.base, o.key, p.prompt, f, { model: o.model });
        if (!r.ok) { err(`takeAfterAction: pair ${p.seed}: ${r.error} (the replies so far are in ${o.out}; run the same command again to go on)`); return 1; }
        appendFile(o.out, JSON.stringify(A.entryOf(header.model, header.params, p.seed, p.prompt, r.text)) + "\n");
        out(`[takeAfterAction] pair ${p.seed} answered (${r.text.split(/\s+/).filter(Boolean).length} words)`);
    }
    out(`[takeAfterAction] the transcript is whole in ${o.out}; read it with: report --in ${o.out}`);
    return 0;
}
